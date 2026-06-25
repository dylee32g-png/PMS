import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
    Upload, Download, Trash2, X, Shuffle,
    AlertTriangle, ListChecks, Search,
    FileSpreadsheet, TerminalSquare, Eye,
    Edit2, Save, ChevronUp, ChevronDown, Check,
    Database, HardDrive, CloudUpload, Clock, Plus, Settings, AlignJustify, Calendar,
    FileText, LayoutList, Link2, BarChart3, TrendingUp,
    PanelRight, Link, Link2Off
} from 'lucide-react';
import { collection, doc, setDoc, deleteDoc, getDoc, getDocs, onSnapshot, writeBatch } from 'firebase/firestore';
import ProgressModal from './ProgressModal';
import DetailModal from './DetailModal';
import { db, appId } from '../firebase';
import { loadXLSX, loadExcelJS, loadFileSaver, generatePid, mapLegacyStatus } from '../utils';
import { isFilterable, isDateCol, isDropdownCol, isStatusCol, isAssigneeCol, isClientCol, isVendorAssCol, toDateInputVal, MAIN_COL_KEYWORDS, STATUS_CHIP_COLORS, DEFAULT_STATUS_OPTIONS, ASSIGNEE_LIST, normalizeAssignee, extractName } from './projectColumns';
import { extractYear, metaDocRef, rowsColRef, rowDocRef, idbSave, idbLoad, idbDelete, computeMergePreview, parseExcelHeaders } from './projectListData';

const VERSION = 'v6.8.7';

// 데이터 도구 함수(Firebase경로·IDB·엑셀파싱·병합)는 ./projectListData.js 로 분리 (2026-06-25 코드분리 2조각)

// ─── 컴포넌트 ──────────────────────────────────────────────────────────────
const ProjectListScreen = ({ currentTeam, user, onBack, onGoToPms, highlightExecNo, allProjects, onShowGraph,
    weeklyLinks, weeklyPanel, setWeeklyPanel, onOpenWeeklyPanel, onWeeklyUnlink, onWeeklyDownload, onOpenWeeklyLinkModal,
    baseDate = '', onApplyProgressByPid, onProgressSaved }) => {
    // ── Firebase 데이터 ──
    const [fbHeaders,   setFbHeaders]   = useState([]);
    const [fbColGroups, setFbColGroups] = useState([]);
    const [fbRows,      setFbRows]      = useState([]);

    // ── 로컬(IndexedDB) 임시 데이터 ──
    const [localData, setLocalData]     = useState(null); // { headers, colGroups, rows, savedAt } | null

    // ── 엑셀 업로드 후 미저장 미리보기 데이터 ──
    const [pendingData, setPendingData] = useState(null); // { headers, colGroups, rows, fileName } | null

    // ── UI 상태 ──
    const [isLoading, setIsLoading]         = useState(true);
    const [alertMsg, setAlertMsg]           = useState('');
    const [searchTerm, setSearchTerm]       = useState('');
    const [sortConfig, setSortConfig]       = useState({ key: null, dir: 'asc' });
    const [columnFilters, setColumnFilters] = useState({});
    const [openFilter, setOpenFilter]       = useState(null);
    const [hiddenCols, setHiddenCols]         = useState(new Set());
    const [colDropOpen, setColDropOpen]       = useState(false);
    const [activeStatusChips, setActiveStatusChips] = useState(new Set(['진행중', '추진중']));
    const [activeAssignees, setActiveAssignees]     = useState(new Set());
    const [settingsOpen, setSettingsOpen]           = useState(false);
    const [compactMode, setCompactMode]             = useState(1); // 0=기본(월간보고 동일) 1=컴팩트 2=초소형
    const [confirmClearOpen, setConfirmClearOpen]   = useState(false);
    const [confirmDialog, setConfirmDialog]         = useState(null); // { message, onConfirm }
    const [execNoModal, setExecNoModal]             = useState(null); // { row, candidates, selected, loading }
    const [progressRow, setProgressRow]             = useState(null); // 진행실적 등록 대상 row
    const [statusDropdown, setStatusDropdown]       = useState(null); // { rowId, col, top, left, width }
    const [assigneeDropdown, setAssigneeDropdown]   = useState(null); // { rowId, col, top, left, width }
    const [clientDropdown, setClientDropdown]       = useState(null); // { rowId, col, top, left, width }
    const [vendorDropdown, setVendorDropdown]       = useState(null); // { rowId, col, top, left, width }
    const [contextMenu, setContextMenu]             = useState(null); // { x, y, row }
    const [highlightedRowId, setHighlightedRowId]   = useState(null); // 외부에서 이동 시 하이라이트
    const appliedHighlightRef = useRef(null); // 중복 하이라이트 방지
    const [detailRow, setDetailRow]                 = useState(null); // 상세 화면용 row 사본
    const [detailRowOriginal, setDetailRowOriginal] = useState(null); // 변경 감지용 원본
    const [editingRow, setEditingRow]       = useState(null);
    const [addingRow, setAddingRow]         = useState(null);
    const [selectedRowId, setSelectedRowId] = useState(null);
    const [editingCell, setEditingCell]     = useState({ id: null, key: null, value: '' });
    const [colWidths, setColWidths]         = useState({});
    const resizeRef                          = useRef({ col: null, startX: 0, startWidth: 0 });
    const [logs, setLogs]                   = useState([]);
    const [showDebug, setShowDebug]         = useState(false);
    const [selectedYear, setSelectedYear]   = useState(String(new Date().getFullYear()));
    // ── 월별 보기 (월간보고식 월 선택기 + 그달만/이전전체 토글) — 1단계: UI 뼈대 ──
    const [viewMonth, setViewMonth] = useState(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });
    const [monthMode, setMonthMode] = useState('single'); // 'single'=그 달만 | 'cumul'=이전 전체

    // 연도 자동전환(엑셀 업로드 등)으로 selectedYear가 바뀌면 월 선택기 연도도 맞춘다
    useEffect(() => {
        setViewMonth(vm => { const y = vm.slice(0, 4); return (selectedYear && y !== selectedYear) ? selectedYear + '-' + vm.slice(5) : vm; });
    }, [selectedYear]);
    const [frozenUpTo, setFrozenUpTo]       = useState(null); // 고정 열 — 이 열까지 sticky

    const fileInputRef = useRef(null);
    const logEndRef    = useRef(null);
    const filterRefs   = useRef({});

    const addLog = (msg) => {
        console.log('[PL]', msg);
        setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
    };

    useEffect(() => {
        if (showDebug && logEndRef.current) logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }, [logs, showDebug]);

    // ── IndexedDB 로드 (마운트 시) ───────────────────────────────────────
    useEffect(() => {
        idbLoad(currentTeam).then(data => {
            if (data) {
                setLocalData(data);
                addLog(`[로컬DB] ${data.rows.length}행 로드 (저장: ${new Date(data.savedAt).toLocaleString()})`);
            }
        }).catch(err => addLog(`[로컬DB 오류] ${err.message}`));
    }, [currentTeam]);

    // ── Firebase 구독 ────────────────────────────────────────────────────
    useEffect(() => {
        if (!user || !db) return;
        setIsLoading(true);
        addLog(`[Firebase] ${currentTeam} 구독 시작`);

        const unsubMeta = onSnapshot(metaDocRef(currentTeam), snap => {
            const d = snap.exists() ? snap.data() : {};
            setFbHeaders(d.headers || []);
            setFbColGroups(d.colGroups || []);
            addLog(`[Firebase] 헤더 ${(d.headers||[]).length}개`);
        }, err => { addLog(`[Firebase 오류] ${err.message}`); setIsLoading(false); });

        const unsubRows = onSnapshot(rowsColRef(currentTeam), snap => {
            const r = snap.docs
                .map(d => ({ _id: d.id, ...d.data() }))
                .sort((a, b) => String(a._id).localeCompare(String(b._id)));
            setFbRows(r);
            setIsLoading(false);
            addLog(`[Firebase] 행 ${r.length}개`);
        }, err => { addLog(`[Firebase 오류] ${err.message}`); setIsLoading(false); });

        return () => { unsubMeta(); unsubRows(); };
    }, [user, currentTeam]);

    // ── 표시 데이터 결정 (pending > local > firebase) ────────────────────
    // pending: 방금 업로드, 아직 저장 안 함
    // local  : IndexedDB에 임시 저장된 것
    // firebase: 확정 저장된 것
    const activeHeaders   = pendingData?.headers   || localData?.headers   || fbHeaders;
    const activeColGroups = pendingData?.colGroups  || localData?.colGroups  || fbColGroups;
    const activeRows      = pendingData?.rows       || localData?.rows       || fbRows;
    const dataSource      = pendingData ? 'pending' : localData ? 'local' : 'firebase';


    // ── 외부(업무현황)에서 이동 시 실행번호 행 하이라이트 ────────────────
    useEffect(() => {
        if (!highlightExecNo || !activeRows.length) return;
        if (appliedHighlightRef.current === highlightExecNo) return; // 이미 적용됨
        const target = activeRows.find(r => String(r['실행번호'] || '') === String(highlightExecNo));
        if (!target) return;
        appliedHighlightRef.current = highlightExecNo;
        setSelectedRowId(target._id);
        setHighlightedRowId(target._id);
        const t1 = setTimeout(() => {
            const el = document.querySelector(`[data-row-id="${target._id}"]`);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
        const t2 = setTimeout(() => setHighlightedRowId(null), 4000);
        return () => { clearTimeout(t1); clearTimeout(t2); };
    }, [highlightExecNo, activeRows]); // eslint-disable-line

    // ── 콤보박스 외부 클릭 닫기 ──────────────────────────────────────────
    useEffect(() => {
        const handler = e => {
            if (openFilter && filterRefs.current[openFilter] && !filterRefs.current[openFilter].contains(e.target)) {
                setOpenFilter(null);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [openFilter]);

    const getW = h => {
        if (colWidths[h]) return colWidths[h];
        // '공사진행' 그룹 내 날짜 열 → 작게, 내용 열 → 크게
        const inProgressGrp = activeColGroups.some(g =>
            (g.label?.includes('공사진행') || g.label?.includes('공사 진행')) && g.cols.includes(h)
        );
        if (inProgressGrp) {
            if (isDateCol(h) || h.includes('날짜') || h.includes('일자')) return 38;
            return 210;
        }
        // 날짜 열
        if (isDateCol(h)) return 38;
        // 열별 고정 너비
        if (isStatusCol(h)) return 54;
        if (h === '번호' || (h.includes('번호') && !h.includes('전화') && !h.includes('사업'))) return 22;
        if (h.includes('업체') && h.includes('담당자')) return 42;
        if (h.includes('발주처')) return 48;
        if (h.includes('담당자') && !h.includes('업체')) return 48;
        if ((h.includes('Project') || h.includes('프로젝트')) && !isDateCol(h)) return 225;
        // 헤더 텍스트 기반 최소 폭 (한글 13px, 영문·숫자 8px + 여백 20px)
        const korCnt = (h.match(/[가-힣]/g) || []).length;
        const etcCnt = h.replace(/[가-힣]/g, '').length;
        return Math.max(44, korCnt * 13 + etcCnt * 8 + 20);
    };

    // ── 리사이즈 ──────────────────────────────────────────────────────────
    const startResize = (h, e) => {
        e.preventDefault();
        e.stopPropagation();
        // 실제 렌더링된 너비를 DOM에서 직접 읽음 (getW와 불일치 방지)
        const th = e.currentTarget.closest('th');
        const startWidth = th ? Math.round(th.getBoundingClientRect().width) : getW(h);
        resizeRef.current = { col: h, startX: e.clientX, startWidth };
        const onMove = ev => {
            if (!ev.buttons) { onUp(); return; }
            const { col, startX, startWidth } = resizeRef.current;
            if (!col) return;
            setColWidths(p => ({ ...p, [col]: Math.max(40, startWidth + ev.clientX - startX) }));
        };
        const onUp = () => {
            resizeRef.current = { col: null, startX: 0, startWidth: 0 };
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    };

    // ── 더블클릭 자동 너비 맞춤 ──────────────────────────────────────────
    const autoFitCol = (h) => {
        const pad = compactMode === 0 ? 24 : 16;
        const kw  = compactMode === 0 ? 13 : 11; // 한글 자 너비
        const ew  = compactMode === 0 ? 8  : 7;  // 영문/숫자 자 너비
        const measure = str => {
            const s = String(str ?? '');
            const k = (s.match(/[가-힣]/g) || []).length;
            return k * kw + (s.length - k) * ew + pad;
        };
        const headerW = measure(h) + 20; // 정렬 아이콘 여유
        const dataW   = activeRows.reduce((mx, row) => Math.max(mx, measure(row[h] ?? '')), 0);
        setColWidths(p => ({ ...p, [h]: Math.min(500, Math.max(40, Math.max(headerW, dataW))) }));
    };

    // ── 엑셀 업로드 → 전체 시트 파싱 → pendingData (미저장 미리보기) ────
    const handleFileUpload = async (e) => {
        const file = e.target?.files?.[0];
        if (!file) return;
        setIsLoading(true); setLogs([]);
        addLog(`파일: ${file.name} (${(file.size/1024).toFixed(1)} KB)`);
        try {
            const XLSX = await loadXLSX();
            const wb   = XLSX.read(await file.arrayBuffer(), { cellDates: true });
            addLog(`시트 ${wb.SheetNames.length}개: ${wb.SheetNames.join(', ')}`);

            let allRows       = [];
            let canonHeaders  = null;
            let canonColGroups = null;

            for (const sheetName of wb.SheetNames) {
                const year = extractYear(sheetName);
                const ws   = wb.Sheets[sheetName];
                const raw  = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, dateNF: 'yyyy-mm-dd', defval: '' });
                addLog(`── 시트 "${sheetName}" (연도: ${year}): ${raw.length}행`);
                if (raw.length < 2) { addLog(`  ↳ 스킵 (행 부족)`); continue; }

                const { colDefs, colGroups: cg, dataStart } = parseExcelHeaders(raw, addLog);
                if (colDefs.length === 0) { addLog(`  ↳ 스킵 (헤더 없음)`); continue; }

                // 첫 번째 유효 시트의 헤더를 기준으로 사용
                if (!canonHeaders) { canonHeaders = colDefs.map(c => c.name); canonColGroups = cg; }

                const ts = Date.now();
                const sheetRows = raw.slice(dataStart).map((row, idx) => {
                    const obj = {
                        _id:   `row_${year}_${ts}_${String(idx).padStart(5,'0')}`,
                        _pid:  generatePid(), // A-4a: 고유 ID (보존 병합 전까지는 재업로드 시 새로 발급됨 — A-4c에서 보존)
                        _year: year
                    };
                    colDefs.forEach(({ idx: ci, name }) => { obj[name] = String(row[ci] ?? '').trim(); });
                    return colDefs.every(({ name }) => !obj[name]) ? null : obj;
                }).filter(Boolean);

                addLog(`  ↳ ${sheetRows.length}건`);
                allRows = allRows.concat(sheetRows);
            }

            if (!canonHeaders || allRows.length === 0) {
                setAlertMsg('데이터를 찾지 못했습니다.\n디버그 패널을 확인해주세요.');
                setIsLoading(false); return;
            }

            addLog(`전체 유효 행: ${allRows.length}건 (${[...new Set(allRows.map(r=>r._year))].join(', ')})`);
            setPendingData({ headers: canonHeaders, colGroups: canonColGroups, rows: allRows, fileName: file.name });

            // 현재 연도가 없으면 가장 최근 연도로 선택 (내림차순 → 첫번째가 최신)
            const years = [...new Set(allRows.map(r => r._year))].sort((a, b) => b.localeCompare(a));
            const curY  = String(new Date().getFullYear());
            if (years.includes(curY))       setSelectedYear(curY);
            else if (!years.includes(selectedYear)) setSelectedYear(years[0]);

            addLog(`미리보기 준비 완료 — 아직 저장 안 됨`);
        } catch (err) {
            addLog(`[오류] ${err.message}`);
            setAlertMsg(`파싱 오류: ${err.message}`);
        } finally {
            setIsLoading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    // ── 로컬(IndexedDB)에 임시 저장 ──────────────────────────────────────
    const handleSaveToLocal = async () => {
        const src = pendingData || { headers: activeHeaders, colGroups: activeColGroups, rows: activeRows };
        if (!src.rows?.length) return;
        setIsLoading(true);
        try {
            await idbSave(currentTeam, src.headers, src.colGroups, src.rows);
            const saved = { headers: src.headers, colGroups: src.colGroups, rows: src.rows, savedAt: new Date().toISOString() };
            setLocalData(saved);
            setPendingData(null);
            addLog(`[로컬DB] 임시 저장 완료 (${src.rows.length}건)`);
            setAlertMsg(`로컬 임시 저장 완료!\n${src.rows.length}건이 이 기기에 저장되었습니다.\n앱을 재시작해도 유지됩니다.`);
        } catch (err) {
            setAlertMsg(`로컬 저장 오류: ${err.message}`);
        } finally { setIsLoading(false); }
    };

    // ── Firebase에 확정 저장 ─────────────────────────────────────────────
    const handleSaveToFirebase = async () => {
        const src = pendingData || localData;
        if (!src?.rows?.length) return;
        setIsLoading(true);
        try {
            // 기존 행 삭제
            const oldSnap = await getDocs(rowsColRef(currentTeam));
            if (!oldSnap.empty) {
                let delBatch = writeBatch(db), delCnt = 0;
                for (const d of oldSnap.docs) {
                    delBatch.delete(d.ref);
                    if (++delCnt >= 400) { await delBatch.commit(); delBatch = writeBatch(db); delCnt = 0; }
                }
                if (delCnt > 0) await delBatch.commit();
                addLog(`기존 행 ${oldSnap.size}개 삭제`);
            }
            // 메타 저장
            await setDoc(metaDocRef(currentTeam), {
                headers: src.headers, colGroups: src.colGroups,
                updatedAt: new Date().toISOString()
            });
            // 행 저장
            let batch = writeBatch(db), cnt = 0;
            for (const row of src.rows) {
                const { _id, ...d } = row;
                batch.set(rowDocRef(currentTeam, _id), d);
                if (++cnt >= 400) { await batch.commit(); batch = writeBatch(db); cnt = 0; }
            }
            if (cnt > 0) await batch.commit();

            // 성공 후 로컬/pending 초기화
            setPendingData(null);
            setLocalData(null);
            await idbDelete(currentTeam);
            addLog(`[Firebase] 확정 저장 완료 (${src.rows.length}건)`);
            setAlertMsg(`Firebase 확정 저장 완료!\n${src.rows.length}건이 클라우드에 저장되었습니다.`);
        } catch (err) {
            addLog(`[Firebase 오류] ${err.message}`);
            setAlertMsg(`Firebase 저장 오류: ${err.message}`);
        } finally { setIsLoading(false); }
    };

    // ── A-4c 병합 미리보기(드라이런) — Firebase 저장 없이 매칭 결과만 보여줌 ──
    const handleMergePreview = () => {
        if (!pendingData?.rows?.length) { setAlertMsg('먼저 엑셀을 업로드하세요 (미리보기 상태에서 실행).'); return; }
        const pv = computeMergePreview(fbRows, pendingData.rows, pendingData.headers || activeHeaders);
        const sample = (arr) => arr.slice(0, 5).map(x => x.name || x.num || '?').join(', ') + (arr.length > 5 ? ` 외 ${arr.length - 5}건` : '');
        addLog(`[드라이런] 갱신 ${pv.counts.updates}(값변경 ${pv.counts.changed}) · 신규 ${pv.counts.news} · 엑셀에없음 ${pv.counts.missing} | 매칭열 번호=${pv.numCol||'없음'}, 이름=${pv.nameCol||'없음'}`);
        setAlertMsg(
`[병합 미리보기 · 드라이런]  — 저장 안 됨, 데이터 안 바뀜

매칭 기준: 연도+번호(${pv.numCol || '없음'}) → 연도+이름(${pv.nameCol || '없음'})

✓ 갱신 ${pv.counts.updates}건  (그중 값이 바뀌는 행 ${pv.counts.changed}건)
＋ 신규 ${pv.counts.news}건
⚠ 엑셀에 없음 ${pv.counts.missing}건  (삭제하지 않음)

· 신규 예: ${pv.news.length ? sample(pv.news) : '-'}
· 엑셀에 없음 예: ${pv.missing.length ? sample(pv.missing) : '-'}

※ 현재 클라우드 ${fbRows.length}건 / 업로드 ${pendingData.rows.length}건 기준.
신규가 비정상적으로 많으면 매칭 키(번호)가 안 맞는 것 — 알려주세요.`
        );
    };

    // ── 로컬 데이터 삭제 ─────────────────────────────────────────────────
    const handleDeleteLocal = async () => {
        try { await idbDelete(currentTeam); setLocalData(null); addLog(`[로컬DB] 삭제 완료`); }
        catch (err) { setAlertMsg(`로컬 삭제 오류: ${err.message}`); }
    };

    // ── 단일 필드 변경 이력 엔트리 생성 ──────────────────────────────────
    const makeChangeEntry = (row, key, newValue) => {
        const from = String(row?.[key] ?? '');
        const to   = String(newValue ?? '');
        if (from === to) return null;
        return { datetime: new Date().toISOString(), changes: [{ field: key, from, to }] };
    };
    const pushChangeHist = (row, entry) =>
        entry ? [...(Array.isArray(row._changeHistory) ? row._changeHistory : []), entry] : (row._changeHistory || []);

    // ── 인라인 셀 편집 ────────────────────────────────────────────────────
    const commitCellEdit = async () => {
        if (!editingCell.id || !editingCell.key) return;
        const srcRow = activeRows.find(r => r._id === editingCell.id);
        const entry  = makeChangeEntry(srcRow, editingCell.key, editingCell.value);
        if (dataSource !== 'firebase') {
            const updater = rows => rows.map(r => {
                if (r._id !== editingCell.id) return r;
                return { ...r, [editingCell.key]: editingCell.value, _changeHistory: pushChangeHist(r, entry) };
            });
            if (dataSource === 'pending') setPendingData(p => ({ ...p, rows: updater(p.rows) }));
            if (dataSource === 'local')   setLocalData(p => ({ ...p, rows: updater(p.rows) }));
            setEditingCell({ id: null, key: null, value: '' });
            return;
        }
        const row = fbRows.find(r => r._id === editingCell.id);
        if (!row) { setEditingCell({ id: null, key: null, value: '' }); return; }
        const { _id, ...rest } = row;
        try {
            await setDoc(rowDocRef(currentTeam, _id), {
                ...rest,
                [editingCell.key]: editingCell.value,
                _changeHistory: pushChangeHist(row, entry)
            });
        }
        catch (err) { setAlertMsg(`저장 오류: ${err.message}`); }
        setEditingCell({ id: null, key: null, value: '' });
    };

    // ── 직접 셀 값 저장 (상태·담당자 드롭다운용) ─────────────────────────
    const appendStatusHistory = (row, key, value) => {
        if (!isStatusCol(key)) return row._statusHistory || [];
        const today = new Date().toISOString().slice(0, 10);
        const prev  = row._statusHistory || [];
        const last  = prev[prev.length - 1];
        if (last && last.status === value && last.date === today) return prev;
        return [...prev, { date: today, status: value }];
    };

    const commitCellWith = async (id, key, value) => {
        if (!id || !key) return;
        const srcRow = activeRows.find(r => r._id === id);
        const entry  = makeChangeEntry(srcRow, key, value);
        if (dataSource !== 'firebase') {
            const updater = rows => rows.map(r => {
                if (r._id !== id) return r;
                return {
                    ...r, [key]: value,
                    _statusHistory: appendStatusHistory(r, key, value),
                    _changeHistory: pushChangeHist(r, entry)
                };
            });
            if (dataSource === 'pending') setPendingData(p => ({ ...p, rows: updater(p.rows) }));
            if (dataSource === 'local')   setLocalData(p =>   ({ ...p, rows: updater(p.rows) }));
            return;
        }
        const row = [...fbRows, ...(localData?.rows || [])].find(r => r._id === id);
        if (!row) return;
        const { _id, ...rest } = row;
        try {
            await setDoc(rowDocRef(currentTeam, _id), {
                ...rest, [key]: value,
                _statusHistory: appendStatusHistory(row, key, value),
                _changeHistory: pushChangeHist(row, entry)
            });
        }
        catch (err) { setAlertMsg(`저장 오류: ${err.message}`); }
    };

    // ── 팝업 편집 저장 ────────────────────────────────────────────────────
    const saveEditingRow = async () => {
        if (!editingRow) return;
        if (dataSource !== 'firebase') {
            const updater = rows => rows.map(r => r._id === editingRow._id ? { ...editingRow } : r);
            if (dataSource === 'pending') setPendingData(p => ({ ...p, rows: updater(p.rows) }));
            if (dataSource === 'local')   setLocalData(p => ({ ...p, rows: updater(p.rows) }));
            setEditingRow(null); return;
        }
        const { _id, ...data } = editingRow;
        try { await setDoc(rowDocRef(currentTeam, _id), data); setEditingRow(null); }
        catch (err) { setAlertMsg(`저장 오류: ${err.message}`); }
    };

    // ── 변경 이력 계산 ─────────────────────────────────────────────────────
    const buildChangeEntry = (original, current) => {
        const changes = activeHeaders
            .filter(h => !h.startsWith('_'))
            .map(h => ({ field: h, from: String(original?.[h] ?? ''), to: String(current?.[h] ?? '') }))
            .filter(c => c.from !== c.to);
        if (!changes.length) return null;
        return { datetime: new Date().toISOString(), changes };
    };

    // ── 상세 화면 저장 ─────────────────────────────────────────────────────
    const saveDetailRow = async () => {
        if (!detailRow) return;
        const entry = buildChangeEntry(detailRowOriginal, detailRow);
        const prevHist = Array.isArray(detailRow._changeHistory) ? detailRow._changeHistory : [];
        const updatedRow = entry ? { ...detailRow, _changeHistory: [...prevHist, entry] } : detailRow;
        if (dataSource !== 'firebase') {
            const updater = rows => rows.map(r => r._id === updatedRow._id ? { ...updatedRow } : r);
            if (dataSource === 'pending') setPendingData(p => ({ ...p, rows: updater(p.rows) }));
            if (dataSource === 'local')   setLocalData(p => ({ ...p, rows: updater(p.rows) }));
            setDetailRow(null); setDetailRowOriginal(null); return;
        }
        const { _id, ...data } = updatedRow;
        try {
            await setDoc(rowDocRef(currentTeam, _id), data);
            setDetailRow(null); setDetailRowOriginal(null);
        }
        catch (err) { setAlertMsg(`저장 오류: ${err.message}`); }
    };

    // ── 실행번호 등록 ─────────────────────────────────────────────────────
    const calcSimilarity = (a, b) => {
        if (!a || !b) return 0;
        const norm = s => s.toLowerCase().replace(/[\s\-_\(\)\.\/]/g, '');
        const na = norm(a), nb = norm(b);
        if (na === nb) return 1;
        if (na.includes(nb) || nb.includes(na)) return 0.75;
        const wa = a.split(/[\s\-_\/]+/).filter(w => w.length > 1).map(w => w.toLowerCase());
        const wb = b.split(/[\s\-_\/]+/).filter(w => w.length > 1).map(w => w.toLowerCase());
        const sa = new Set(wa), sb = new Set(wb);
        let overlap = 0;
        sa.forEach(w => { if (sb.has(w)) overlap++; });
        return overlap / Math.max(sa.size, sb.size, 1);
    };

    const openExecNoModal = async (row) => {
        setExecNoModal({ row, candidates: [], selected: null, loading: true });
        // 프로젝트명 컬럼 추정
        const nameKeys = ['프로젝트명', '프로젝트', 'Project', '공사명', '건명', '명칭', '공사'];
        const activeH = activeHeaders;
        const nameKey = nameKeys.find(k => activeH.includes(k)) || activeH.find(h => /프로젝트|공사|건명/.test(h)) || '';
        const rowName = nameKey ? (row[nameKey] || '') : '';
        try {
            const snap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'projects'));
            // A-4a: 다른 List 행과 이미 연결된 pid 집합 (연결 상태 표시용)
            const linkedPidSet = new Set(activeRows.filter(r => r._id !== row._id).map(r => r._pid).filter(Boolean));
            const candidates = [];
            snap.forEach(d => {
                const p = d.data();
                if (p.team && p.team !== currentTeam) return;
                if (!p.execNo) return;
                const score = calcSimilarity(rowName, p.project || '');
                candidates.push({
                    execNo: p.execNo, project: p.project || '', score,
                    docId: d.id, pid: p.pid || '',
                    linkedToThis: !!p.pid && p.pid === (row._pid || ''),
                    linkedToOther: !!p.pid && p.pid !== (row._pid || '') && linkedPidSet.has(p.pid),
                });
            });
            candidates.sort((a, b) => b.score - a.score);
            setExecNoModal(prev => ({ ...prev, candidates, loading: false }));
        } catch (e) {
            setAlertMsg('월간보고 데이터 로드 실패: ' + e.message);
            setExecNoModal(null);
        }
    };

    const saveExecNo = async () => {
        if (!execNoModal?.selected || !execNoModal?.row) return;
        const { row, selected } = execNoModal;
        const { _id, ...rest } = row;
        try {
            // A-4a: 프로젝트 연결 — 실행번호 기록 + 고유 ID 통일 (List 행의 _pid가 정(正), List = 어미)
            const rowPid = rest._pid || generatePid();
            await setDoc(rowDocRef(currentTeam, _id), { ...rest, _pid: rowPid, '실행번호': selected.execNo });
            if (selected.docId) {
                await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'projects', selected.docId), { pid: rowPid }, { merge: true });
            }
            // A-4b 보완(2026-06-12): 연결로 pid가 바뀌면 기존 진행실적(progressRecords)을 옛 pid→새 pid로 이전
            // (옛 열쇠 사물함에 남아 고아가 되는 것 방지. ProgressModal의 _migratedTo 폴백 규칙과 동일)
            const oldPid = selected.pid;
            if (oldPid && oldPid !== rowPid) {
                const prCol = `progressRecords_${currentTeam}`;
                const oldRef = doc(db, 'artifacts', appId, 'public', 'data', prCol, oldPid);
                const newRef = doc(db, 'artifacts', appId, 'public', 'data', prCol, rowPid);
                const [oldSnap, newSnap] = await Promise.all([getDoc(oldRef), getDoc(newRef)]);
                const oldWeekly = oldSnap.exists() ? (oldSnap.data().weekly || {}) : {};
                const oldHasData = Object.keys(oldWeekly).length > 0;
                const newHasData = newSnap.exists() && Object.keys(newSnap.data().weekly || {}).length > 0;
                if (oldHasData && !oldSnap.data()._migratedTo && !newHasData) {
                    // 새 사물함이 비어있을 때만 자동 이전 (안전)
                    await setDoc(newRef, { weekly: oldWeekly, execNo: selected.execNo, updatedAt: new Date().toISOString(), _mergedFrom: oldPid }, { merge: true });
                    await setDoc(oldRef, { _migratedTo: rowPid }, { merge: true });
                } else if (oldHasData && newHasData) {
                    // 양쪽 다 진행실적 존재 → 자동 병합 보류 (수동 도구로 확인)
                    setAlertMsg('연결됨. 단, 양쪽 모두 진행실적이 있어 자동 이전은 보류했습니다. [설정 > 주간장부 통일 병합]에서 확인하세요.');
                }
            }
            // 로컬 상태 업데이트
            if (dataSource !== 'firebase') {
                const updater = rows => rows.map(r => r._id === _id ? { ...r, _pid: rowPid, '실행번호': selected.execNo } : r);
                if (dataSource === 'pending') setPendingData(p => ({ ...p, rows: updater(p.rows) }));
                if (dataSource === 'local')   setLocalData(p => ({ ...p, rows: updater(p.rows) }));
            }
            setExecNoModal(null);
        } catch (e) {
            setAlertMsg('연결 저장 오류: ' + e.message);
        }
    };

    // ── 행 저장 (관리 열 저장 버튼) ──────────────────────────────────────
    const saveRow = async (row) => {
        if (!row) return;
        const { _id, ...data } = row;
        if (dataSource !== 'firebase') {
            const updater = rows => rows.map(r => r._id === _id ? { ...row } : r);
            if (dataSource === 'pending') setPendingData(p => ({ ...p, rows: updater(p.rows) }));
            if (dataSource === 'local')   setLocalData(p =>   ({ ...p, rows: updater(p.rows) }));
            return;
        }
        try { await setDoc(rowDocRef(currentTeam, _id), data); }
        catch (err) { setAlertMsg(`저장 오류: ${err.message}`); }
    };

    // ── 전체 행 저장 (메타 포함) ──────────────────────────────────────────
    const saveAllRows = async () => {
        if (!activeRows.length) return;
        setIsLoading(true);
        try {
            if (dataSource !== 'firebase') {
                // 로컬/pending: IndexedDB에 저장
                await idbSave(currentTeam, activeHeaders, activeColGroups, activeRows);
                if (dataSource === 'pending') setPendingData(p => ({ ...p }));
                setAlertMsg(`${activeRows.length}행 로컬 저장 완료`);
            } else {
                // Firebase: 메타 + 행 데이터 배치 저장
                await setDoc(metaDocRef(currentTeam), {
                    headers: activeHeaders, colGroups: activeColGroups,
                    updatedAt: new Date().toISOString()
                });
                let batch = writeBatch(db), cnt = 0;
                for (const row of activeRows) {
                    const { _id, ...data } = row;
                    batch.set(rowDocRef(currentTeam, _id), data);
                    if (++cnt >= 400) { await batch.commit(); batch = writeBatch(db); cnt = 0; }
                }
                if (cnt > 0) await batch.commit();
                setAlertMsg(`전체 ${activeRows.length}행 저장 완료`);
            }
        } catch (err) { setAlertMsg(`저장 오류: ${err.message}`); }
        setIsLoading(false);
    };

    // ── 저장 전 confirm 다이얼로그 표시 ──────────────────────────────────
    const confirmSaveAll = () => {
        const target = dataSource === 'firebase' ? 'Firebase' : dataSource === 'local' ? '로컬' : '임시';
        setConfirmDialog({
            message: `전체 ${activeRows.length}행을 ${target}에 저장하시겠습니까?`,
            onConfirm: saveAllRows
        });
    };

    const confirmSaveRow = (row) => {
        setConfirmDialog({
            message: `이 행을 저장하시겠습니까?\n${row['번호'] ? '번호: ' + row['번호'] : ''} ${row['Project'] || row['프로젝트'] || ''}`.trim(),
            onConfirm: () => saveRow(row)
        });
    };

    // ── 새 행 추가 ────────────────────────────────────────────────────────
    const handleOpenAddRow = () => {
        if (!activeHeaders.length) {
            setAlertMsg('먼저 엑셀 파일을 업로드하거나 데이터를 불러오세요.');
            return;
        }
        const newId = `row_manual_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
        const newPid = generatePid(); // A-4a: 고유 ID 자동 발급
        const newYear = selectedYear || String(new Date().getFullYear());
        // 선택된 행이 있으면 해당 데이터를 초기값으로 복사
        const baseRow = selectedRowId
            ? activeRows.find(r => r._id === selectedRowId)
            : null;
        const newRow = { _id: newId, _pid: newPid, _year: newYear };
        activeHeaders.forEach(h => { newRow[h] = baseRow ? (baseRow[h] || '') : ''; });
        setAddingRow(newRow);
    };

    const saveAddingRow = async () => {
        if (!addingRow) return;
        if (dataSource !== 'firebase') {
            if (dataSource === 'pending') setPendingData(p => ({ ...p, rows: [...p.rows, addingRow] }));
            else if (dataSource === 'local') setLocalData(p => ({ ...p, rows: [...p.rows, addingRow] }));
            else { setLocalData({ headers: activeHeaders, colGroups: activeColGroups, rows: [addingRow], savedAt: new Date().toISOString() }); }
            setAddingRow(null); return;
        }
        const { _id, ...data } = addingRow;
        try { await setDoc(rowDocRef(currentTeam, _id), data); setAddingRow(null); }
        catch (err) { setAlertMsg(`저장 오류: ${err.message}`); }
    };

    const deleteRow = async id => {
        if (dataSource !== 'firebase') {
            const updater = rows => rows.filter(r => r._id !== id);
            if (dataSource === 'pending') setPendingData(p => ({ ...p, rows: updater(p.rows) }));
            if (dataSource === 'local')   setLocalData(p => ({ ...p, rows: updater(p.rows) }));
            return;
        }
        try { await deleteDoc(rowDocRef(currentTeam, id)); }
        catch (err) { setAlertMsg(`삭제 오류: ${err.message}`); }
    };

    const clearAll = async () => {
        setIsLoading(true); setConfirmClearOpen(false);
        try {
            let batch = writeBatch(db), cnt = 0;
            for (const r of fbRows) {
                batch.delete(rowDocRef(currentTeam, r._id));
                if (++cnt >= 400) { await batch.commit(); batch = writeBatch(db); cnt = 0; }
            }
            if (cnt > 0) await batch.commit();
            await setDoc(metaDocRef(currentTeam), { headers: [], colGroups: [], updatedAt: new Date().toISOString() });
            setPendingData(null);
            setLocalData(null);
            await idbDelete(currentTeam);
        } catch (err) { setAlertMsg(`초기화 오류: ${err.message}`); }
        finally { setIsLoading(false); }
    };

    // ── 엑셀 다운로드 ────────────────────────────────────────────────────
    const handleDownload = async () => {
        if (!activeHeaders.length) { setAlertMsg('다운로드할 데이터가 없습니다.'); return; }
        setIsLoading(true);
        try {
            const ExcelJS = await loadExcelJS(); await loadFileSaver();
            const wb = new ExcelJS.Workbook();
            const ws = wb.addWorksheet(`${currentTeam} 프로젝트List`);
            const visH = activeHeaders.filter(h => !hiddenCols.has(h));
            ws.columns = visH.map(h => ({ header: h, key: h, width: Math.max(12, getW(h)/7.5) }));
            ws.getRow(1).eachCell(cell => {
                cell.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FF0F172A'} };
                cell.font = { color:{argb:'FFFFFFFF'}, bold:true, name:'맑은 고딕' };
                cell.alignment = { vertical:'middle', horizontal:'center' };
                cell.border = { top:{style:'thin',color:{argb:'FF334155'}}, bottom:{style:'thin',color:{argb:'FF334155'}}, left:{style:'thin',color:{argb:'FF334155'}}, right:{style:'thin',color:{argb:'FF334155'}} };
            });
            sortedRows.forEach(row => {
                const exRow = ws.addRow(Object.fromEntries(visH.map(h => [h, row[h]||''])));
                exRow.eachCell(cell => {
                    cell.border = { top:{style:'thin',color:{argb:'FFCBD5E1'}}, bottom:{style:'thin',color:{argb:'FFCBD5E1'}}, left:{style:'thin',color:{argb:'FFCBD5E1'}}, right:{style:'thin',color:{argb:'FFCBD5E1'}} };
                    cell.font = { name:'맑은 고딕' }; cell.alignment = { vertical:'middle' };
                });
            });
            const buf = await wb.xlsx.writeBuffer();
            window.saveAs(new Blob([buf], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
                `ProjectList_${currentTeam}_${new Date().toISOString().slice(0,10).replace(/-/g,'')}.xlsx`);
        } catch (err) { setAlertMsg(`다운로드 오류: ${err.message}`); }
        finally { setIsLoading(false); }
    };

    // ── 연도 목록 (행의 _year 필드 기준) ────────────────────────────────
    const availableYears = useMemo(() => {
        const ys = [...new Set(activeRows.map(r => r._year).filter(Boolean))].sort((a, b) => b.localeCompare(a));
        // _year 없으면 연도 구분 없이 단일 "전체"로 처리
        return ys;
    }, [activeRows]);

    // 선택 연도의 행만
    const yearFilteredRows = useMemo(() => {
        if (!availableYears.length) return activeRows; // 연도 정보 없음 → 전체
        return activeRows.filter(r => !r._year || r._year === selectedYear);
    }, [activeRows, availableYears, selectedYear]);

    // ── 진행현황 칩 필터 ─────────────────────────────────────────────────
    const statusFilterCol = useMemo(() =>
        activeHeaders.find(h => ['진행현황', '현황', '진행'].some(k => h.includes(k))),
    [activeHeaders]);

    const statusChipData = useMemo(() => {
        if (!statusFilterCol) return [];
        const countMap = {};
        yearFilteredRows.forEach(r => {
            let v = String(r[statusFilterCol] || '').trim();
            if (v.toUpperCase() === 'HOLD') v = 'Hold';
            if (v) countMap[v] = (countMap[v] || 0) + 1;
        });
        return Object.entries(countMap).sort((a, b) => {
            const ai = DEFAULT_STATUS_OPTIONS.indexOf(a[0]);
            const bi = DEFAULT_STATUS_OPTIONS.indexOf(b[0]);
            if (ai === -1 && bi === -1) return b[1] - a[1];
            if (ai === -1) return 1;
            if (bi === -1) return -1;
            return ai - bi;
        });
    }, [yearFilteredRows, statusFilterCol]);

    const assigneeFilterCol = useMemo(() =>
        activeHeaders.find(h => h.includes('담당자') && !h.includes('업체')),
    [activeHeaders]);

    const assigneeCountMap = useMemo(() => {
        if (!assigneeFilterCol) return {};
        const map = {};
        yearFilteredRows.forEach(r => {
            const name = extractName(normalizeAssignee(r[assigneeFilterCol] || ''));
            if (name) map[name] = (map[name] || 0) + 1;
        });
        return map;
    }, [yearFilteredRows, assigneeFilterCol]);

    // ── 필터 고유값 + 카운트 맵 (연도 필터 적용 후 기준) ─────────────────
    const uniqueVals = useMemo(() => {
        const res = {};
        activeHeaders.forEach(h => {
            if (!isFilterable(h)) return;
            const cm = {};
            yearFilteredRows.forEach(r => {
                let v = String(r[h]||'').trim();
                if (isStatusCol(h) && v.toUpperCase() === 'HOLD') v = 'Hold';
                if (v) cm[v] = (cm[v] || 0) + 1;
            });
            res[h] = cm; // { val: count }
        });
        return res;
    }, [yearFilteredRows, activeHeaders]);

    // ── 검색·컬럼필터·정렬 (연도 필터 이후 적용) ─────────────────────────
    const sortedRows = useMemo(() => {
        let out = yearFilteredRows;
        if (activeStatusChips.size > 0 && statusFilterCol) {
            out = out.filter(r => {
                let v = String(r[statusFilterCol] || '').trim();
                if (v.toUpperCase() === 'HOLD') v = 'Hold';
                return activeStatusChips.has(v);
            });
        }
        if (activeAssignees.size > 0 && assigneeFilterCol) {
            const selectedNames = new Set([...activeAssignees].map(extractName));
            out = out.filter(r => selectedNames.has(extractName(normalizeAssignee(r[assigneeFilterCol]))));
        }
        if (searchTerm) {
            const t = searchTerm.toLowerCase();
            out = out.filter(r => activeHeaders.some(h => String(r[h]||'').toLowerCase().includes(t)));
        }
        Object.entries(columnFilters).forEach(([col, vals]) => {
            if (!(vals instanceof Set) || vals.size === 0) return;
            if (isAssigneeCol(col)) {
                const names = new Set([...vals].map(v => extractName(normalizeAssignee(v))));
                out = out.filter(r => names.has(extractName(normalizeAssignee(r[col]||''))));
            } else {
                out = out.filter(r => {
                    let v = String(r[col]||'').trim();
                    if (isStatusCol(col) && v.toUpperCase() === 'HOLD') v = 'Hold';
                    return vals.has(v);
                });
            }
        });
        if (!sortConfig.key) return out;
        return [...out].sort((a, b) => {
            const av = String(a[sortConfig.key]||'').toLowerCase();
            const bv = String(b[sortConfig.key]||'').toLowerCase();
            return sortConfig.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
        });
    }, [yearFilteredRows, activeHeaders, searchTerm, sortConfig, columnFilters, activeStatusChips, statusFilterCol, activeAssignees, assigneeFilterCol]);

    const requestSort = key =>
        setSortConfig(p => ({ key, dir: p.key === key && p.dir === 'asc' ? 'desc' : 'asc' }));

    const visibleHeaders    = activeHeaders.filter(h => !hiddenCols.has(h));
    const activeFilterCount = Object.values(columnFilters).reduce((acc, v) => acc + (v instanceof Set ? v.size : (v ? 1 : 0)), 0)
                           + activeStatusChips.size
                           + activeAssignees.size;

    const visibleGroups = useMemo(() =>
        activeColGroups.map(g => ({ ...g, cols: g.cols.filter(c => !hiddenCols.has(c)) })).filter(g => g.cols.length > 0),
    [activeColGroups, hiddenCols]);

    // ── 메인 테이블 열 (키워드 매칭 + 공사진행 그룹) ─────────────────────
    const isMainTableCol = (h) =>
        MAIN_COL_KEYWORDS.some(k => h.includes(k)) ||
        isStatusCol(h) ||
        isAssigneeCol(h) ||
        activeColGroups.some(g =>
            (g.label?.includes('공사진행') || g.label?.includes('공사 진행')) && g.cols.includes(h)
        );

    const allMainCols = useMemo(() =>
        activeHeaders.filter(h => isMainTableCol(h)),
    [activeHeaders, activeColGroups]); // eslint-disable-line

    const EXEC_NO_COL = '실행번호';
    const mainVisibleHeaders = useMemo(() => {
        const base = allMainCols.filter(h => !hiddenCols.has(h) && h !== EXEC_NO_COL);
        const projectIdx = base.findIndex(h => /project|프로젝트명|공사명|건명/i.test(h));
        if (projectIdx >= 0) {
            const result = [...base];
            result.splice(projectIdx + 1, 0, EXEC_NO_COL);
            return result;
        }
        return [...base, EXEC_NO_COL];
    }, [allMainCols, hiddenCols]);

    const mainVisibleGroups = useMemo(() => {
        const base = activeColGroups
            .map(g => ({ ...g, cols: g.cols.filter(c => mainVisibleHeaders.includes(c) && c !== EXEC_NO_COL) }))
            .filter(g => g.cols.length > 0);
        // EXEC_NO_COL을 mainVisibleGroups에도 Project 그룹 바로 뒤에 삽입
        const projectGrpIdx = base.findIndex(g => g.cols.some(c => /project|프로젝트명|공사명|건명/i.test(c)));
        const execGrp = { label: '', cols: [EXEC_NO_COL] };
        if (projectGrpIdx >= 0) {
            const result = [...base];
            result.splice(projectGrpIdx + 1, 0, execGrp);
            return result;
        }
        return [...base, execGrp];
    }, [activeColGroups, mainVisibleHeaders]);

    const hasMainGroups = mainVisibleGroups.some(g => g.label);

    // 상세 화면에 표시할 비-메인 열
    const detailOnlyHeaders = useMemo(() =>
        activeHeaders.filter(h => !isMainTableCol(h)),
    [activeHeaders, activeColGroups]); // eslint-disable-line

    // ── 헤더 드롭다운 멀티필터 (월간보고 스타일) ─────────────────────────
    // 진행현황→activeStatusChips, 담당자→activeAssignees, 나머지→columnFilters 로 통합
    const ComboFilter = ({ h, small = false }) => {
        const isStatusH   = !!statusFilterCol   && h === statusFilterCol;
        const isAssigneeH = !!assigneeFilterCol && h === assigneeFilterCol;

        // 어느 상태를 쓸지 결정
        const selSet = isStatusH   ? activeStatusChips
                     : isAssigneeH ? activeAssignees
                     : (columnFilters[h] instanceof Set ? columnFilters[h] : new Set());

        const isActive  = selSet.size > 0;
        const isOpen    = openFilter === h;
        const isSortKey = sortConfig.key === h;

        // 표시할 [val, count] 목록
        let entries;
        if (isAssigneeH) {
            // 담당자: ASSIGNEE_LIST 순서로, 이름 기준 카운트
            entries = ASSIGNEE_LIST
                .map(name => [name, assigneeCountMap[extractName(name)] || 0])
                .filter(([, cnt]) => cnt > 0);
        } else {
            const countMap = uniqueVals[h] || {};
            entries = Object.entries(countMap).sort((a, b) => {
                if (isStatusH) {
                    const ai = DEFAULT_STATUS_OPTIONS.indexOf(a[0]);
                    const bi = DEFAULT_STATUS_OPTIONS.indexOf(b[0]);
                    if (ai !== -1 || bi !== -1) {
                        if (ai === -1) return 1;
                        if (bi === -1) return -1;
                        return ai - bi;
                    }
                }
                return b[1] - a[1];
            });
        }

        const szCls  = compactMode === 0 ? (small ? 'text-[11px]' : 'text-[11px]')
                     : compactMode === 1 ? (small ? 'text-[9px]'  : 'text-[10px]')
                     :                     'text-[9px]';
        const iconSz = compactMode === 0 ? (small ? 8 : 10) : 8;

        const toggle = (val) => {
            if (isStatusH) {
                setActiveStatusChips(prev => {
                    const next = new Set(prev);
                    next.has(val) ? next.delete(val) : next.add(val);
                    return next;
                });
            } else if (isAssigneeH) {
                setActiveAssignees(prev => {
                    const next = new Set(prev);
                    next.has(val) ? next.delete(val) : next.add(val);
                    return next;
                });
            } else {
                setColumnFilters(p => {
                    const prev = p[h] instanceof Set ? p[h] : new Set();
                    const next = new Set(prev);
                    next.has(val) ? next.delete(val) : next.add(val);
                    if (next.size === 0) { const n = {...p}; delete n[h]; return n; }
                    return {...p, [h]: next};
                });
            }
        };

        const clear = () => {
            if (isStatusH)        setActiveStatusChips(new Set());
            else if (isAssigneeH) setActiveAssignees(new Set());
            else setColumnFilters(p => { const n = {...p}; delete n[h]; return n; });
        };

        // 선택 여부 (담당자는 이름 정규화 비교)
        const isSelected = (val) => {
            if (isAssigneeH) {
                const selectedNames = new Set([...selSet].map(v => extractName(normalizeAssignee(v))));
                return selectedNames.has(extractName(normalizeAssignee(val)));
            }
            return selSet.has(val);
        };

        return (
            <div ref={el => { filterRefs.current[h] = el; }} className="relative w-full flex items-center justify-center gap-0.5">
                <button
                    onClick={e => { e.stopPropagation(); requestSort(h); }}
                    className={`flex-1 truncate text-left font-bold transition-colors leading-none py-0 ${szCls}
                        ${isActive ? 'text-[#1e7ac8]' : isSortKey ? 'text-[#1e7ac8]' : 'text-slate-400 hover:text-[#1e7ac8]'}`}
                >
                    {isActive ? `${h}(${selSet.size})` : h}
                    {isSortKey && !isActive && (sortConfig.dir === 'asc'
                        ? <ChevronUp size={iconSz} className="inline ml-0.5"/>
                        : <ChevronDown size={iconSz} className="inline ml-0.5"/>)}
                </button>
                <button
                    onClick={e => { e.stopPropagation(); setOpenFilter(isOpen ? null : h); }}
                    className={`shrink-0 flex items-center justify-center rounded px-0.5 py-0 transition-colors
                        ${isActive ? 'text-amber-400 bg-amber-950/50' : isOpen ? 'text-white bg-slate-600' : 'text-slate-500 hover:text-amber-400 hover:bg-slate-700/60'}`}
                >
                    <ChevronDown size={iconSz} className={`transition-transform duration-150 ${isOpen?'rotate-180':''}`}/>
                </button>
                {isActive && (
                    <button onClick={e => { e.stopPropagation(); clear(); }}
                        className="shrink-0 text-amber-500 hover:text-rose-400 transition-colors" title="필터 해제">
                        <X size={small?9:11}/>
                    </button>
                )}
                {isOpen && (
                    <div className="absolute top-full left-0 mt-1 z-[9999] shadow-2xl overflow-hidden"
                        style={{ backgroundColor:'#fff', border:'1.5px solid #9aa8b8', minWidth:180, maxWidth:260 }}
                        onClick={e => e.stopPropagation()}>
                        {/* 타이틀 바 */}
                        <div style={{ backgroundColor:'#dce3ec', borderBottom:'1px solid #c4ccd8',
                                      padding:'5px 10px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                            <span style={{ fontSize:11, fontWeight:800, color:'#1a1a1a' }}>{h} 필터</span>
                            <button onClick={clear}
                                style={{ fontSize:11, fontWeight:700, color:'#059669', background:'none', border:'none', cursor:'pointer' }}>
                                전체
                            </button>
                        </div>
                        {/* 목록 */}
                        <div style={{ maxHeight:200, overflowY:'auto' }} className="custom-scrollbar">
                            {entries.length === 0
                                ? <div style={{ padding:'12px', fontSize:11, color:'#888', textAlign:'center' }}>데이터 없음</div>
                                : entries.map(([val, cnt]) => {
                                    const isSel = isSelected(val);
                                    return (
                                        <label key={val}
                                            style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 10px',
                                                     cursor:'pointer', borderBottom:'1px solid #f0f4f8',
                                                     backgroundColor: isSel ? '#e8f0fe' : 'transparent' }}>
                                            <input type="checkbox" checked={isSel} onChange={() => toggle(val)}
                                                style={{ accentColor:'#1e7ac8', cursor:'pointer', flexShrink:0 }}/>
                                            <span style={{ flex:1, fontSize:12, fontWeight: isSel ? 700 : 400,
                                                           color: isSel ? '#1e7ac8' : '#1e293b', overflow:'hidden',
                                                           textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{val}</span>
                                            <span style={{ fontSize:10, color:'#888', fontWeight:600, flexShrink:0 }}>{cnt}</span>
                                        </label>
                                    );
                                })
                            }
                        </div>
                        {/* 닫기 */}
                        <div style={{ borderTop:'1px solid #c4ccd8', padding:'6px 10px', display:'flex', justifyContent:'flex-end', backgroundColor:'#f8fafc' }}>
                            <button onClick={() => setOpenFilter(null)}
                                style={{ padding:'3px 14px', backgroundColor:'#1e7ac8', color:'#fff',
                                         fontSize:11, fontWeight:700, border:'none', cursor:'pointer' }}>
                                닫기
                            </button>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    // ── 스마트 필드 입력 (드롭다운/날짜/텍스트 자동 판별) ────────────────
    const getUniqueVals = (header) =>
        [...new Set(activeRows.map(r => String(r[header]||'').trim()).filter(Boolean))].sort();

    const FieldInput = ({ header, value, onChange, focusColor = 'emerald' }) => {
        const inputCls = `bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-${focusColor}-500 focus:ring-1 focus:ring-${focusColor}-500/30 transition-all w-full`;
        if (isDateCol(header)) {
            // 날짜 필드: date picker
            return (
                <input
                    type="date"
                    value={value || ''}
                    onChange={e => onChange(e.target.value)}
                    className={inputCls + ' color-scheme-dark'}
                />
            );
        }
        if (isDropdownCol(header)) {
            // 드롭다운 필드: datalist(기존값 선택) + 직접 입력 가능
            const listId = `dl-${header.replace(/\s+/g, '-')}`;
            return (
                <>
                    <input
                        type="text"
                        list={listId}
                        value={value || ''}
                        onChange={e => onChange(e.target.value)}
                        placeholder="선택하거나 직접 입력..."
                        className={inputCls}
                    />
                    <datalist id={listId}>
                        {getUniqueVals(header).map(v => <option key={v} value={v}/>)}
                    </datalist>
                </>
            );
        }
        return (
            <input
                type="text"
                value={value || ''}
                onChange={e => onChange(e.target.value)}
                className={inputCls}
            />
        );
    };

    const SortHeader = ({ h, small = false, forceColor }) => {
        const isSortKey = sortConfig.key === h;
        const szCls = compactMode === 0 ? (small ? 'text-[11px]' : 'text-[11px]')
                    : compactMode === 1 ? (small ? 'text-[9px]'  : 'text-[10px]')
                    :                     'text-[9px]';
        const iconSz = compactMode === 0 ? (small ? 8 : 10) : 8;
        const colorCls = forceColor ? '' : (isSortKey ? 'text-[#1e7ac8]' : 'text-slate-400');
        return (
            <button onClick={() => requestSort(h)}
                style={forceColor ? { color: isSortKey ? '#1e7ac8' : forceColor } : undefined}
                className={`w-full truncate text-left font-bold hover:text-cyan-400 transition-colors leading-none py-0
                    ${szCls} ${colorCls}`}>
                {h}
                {isSortKey && (sortConfig.dir==='asc'
                    ? <ChevronUp size={iconSz} className="inline ml-0.5"/>
                    : <ChevronDown size={iconSz} className="inline ml-0.5"/>)}
            </button>
        );
    };

    // ─── 데이터 소스 배지 색상 ──────────────────────────────────────────
    const srcBadge = {
        pending:  { bg: 'bg-amber-500/15 border-amber-500/50',  text: 'text-amber-300',  icon: <Clock size={14}/>,       label: '미저장 미리보기' },
        local:    { bg: 'bg-violet-500/15 border-violet-500/50', text: 'text-violet-300', icon: <HardDrive size={14}/>,   label: '로컬 임시 저장' },
        firebase: { bg: 'bg-cyan-500/10 border-cyan-500/30',    text: 'text-cyan-400',   icon: <Database size={14}/>,    label: 'Firebase 클라우드' },
    }[dataSource];

    // ─── 렌더 ──────────────────────────────────────────────────────────────
    return (
        <div className="h-screen bg-slate-950 text-slate-100 font-sans p-4 md:p-6 flex flex-col overflow-hidden relative" onContextMenu={e => e.preventDefault()}>

            {/* 로딩 */}
            {isLoading && (
                <div className="fixed inset-0 z-[999] flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-sm">
                    <div className="w-14 h-14 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4 shadow-[0_0_20px_rgba(16,185,129,0.4)]"/>
                    <p className="text-lg font-bold text-white">처리 중...</p>
                </div>
            )}

            {/* 알림 (모달리스) */}
            {alertMsg && (
                <div className="fixed z-[400] flex items-end justify-center pointer-events-none" style={{ inset:0, paddingBottom:'56px' }}>
                    <div className="pointer-events-auto shadow-2xl" style={{ backgroundColor:'#fff', border:'1.5px solid #c4ccd8', minWidth:'280px', maxWidth:'400px', overflow:'hidden' }}>
                        <div style={{ backgroundColor:'#1e7ac8', padding:'8px 16px', color:'#fff', fontSize:'12px', fontWeight:700 }}>알림</div>
                        <div style={{ padding:'16px 20px' }}>
                            <p style={{ fontSize:'13px', color:'#1e293b', marginBottom:'14px', whiteSpace:'pre-line' }}>{alertMsg}</p>
                            <div style={{ display:'flex', justifyContent:'flex-end' }}>
                                <button onClick={() => setAlertMsg('')}
                                    style={{ padding:'5px 18px', backgroundColor:'#1e7ac8', color:'#fff', border:'none', fontSize:'12px', fontWeight:700, cursor:'pointer' }}>
                                    확인
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* 모달리스 저장 확인 다이얼로그 */}
            {confirmDialog && (
                <div className="fixed z-[500] flex items-end justify-center pointer-events-none" style={{ inset:0, paddingBottom:'48px' }}>
                    <div className="pointer-events-auto shadow-2xl"
                        style={{ backgroundColor:'#fff', border:'1.5px solid #c4ccd8', minWidth:'320px', maxWidth:'420px', width:'100%' }}>
                        <div style={{ backgroundColor:'#1e7ac8', padding:'10px 16px', display:'flex', alignItems:'center', gap:8 }}>
                            <Save size={14} style={{ color:'#fff' }}/>
                            <span style={{ color:'#fff', fontWeight:800, fontSize:'13px' }}>저장 확인</span>
                        </div>
                        <div style={{ padding:'18px 20px' }}>
                            <p style={{ fontSize:'13px', color:'#222', fontWeight:600, whiteSpace:'pre-line', lineHeight:1.7, marginBottom:20 }}>
                                {confirmDialog.message}
                            </p>
                            <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
                                <button onClick={() => setConfirmDialog(null)}
                                    style={{ padding:'7px 22px', backgroundColor:'#f1f5f9', border:'1px solid #c4ccd8', fontSize:'13px', fontWeight:700, color:'#555', cursor:'pointer' }}>
                                    취소
                                </button>
                                <button onClick={() => { confirmDialog.onConfirm(); setConfirmDialog(null); }}
                                    style={{ padding:'7px 22px', backgroundColor:'#16a34a', border:'none', fontSize:'13px', fontWeight:700, color:'#fff', cursor:'pointer' }}>
                                    저장
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* 진행현황 인라인 드롭다운 */}
            {statusDropdown && (
                <>
                    <div className="fixed inset-0 z-[350]" onClick={() => setStatusDropdown(null)}/>
                    <div className="fixed z-[351] shadow-2xl overflow-hidden"
                        style={{ top: statusDropdown.top + 2, left: statusDropdown.left, minWidth: Math.max(statusDropdown.width, 120),
                                 backgroundColor:'#fff', border:'1.5px solid #c4ccd8' }}>
                        {(() => {
                            const colVals = [...new Set(activeRows.map(r => String(r[statusDropdown.col]||'').trim()).filter(Boolean))];
                            const merged  = [...new Set([...DEFAULT_STATUS_OPTIONS, ...colVals])];
                            return merged.map(s => {
                                const c = STATUS_CHIP_COLORS[s] || { bg:'rgba(100,116,139,0.08)', text:'#475569', border:'rgba(100,116,139,0.3)', activeBg:'#475569' };
                                const isCur = String(activeRows.find(r=>r._id===statusDropdown.rowId)?.[statusDropdown.col]||'') === s;
                                return (
                                    <button key={s}
                                        onClick={() => { commitCellWith(statusDropdown.rowId, statusDropdown.col, s); setStatusDropdown(null); }}
                                        style={{ display:'flex', alignItems:'center', gap:'8px', width:'100%', padding:'6px 12px',
                                                 backgroundColor: isCur ? c.activeBg : 'transparent',
                                                 border:'none', cursor:'pointer', textAlign:'left' }}
                                        onMouseEnter={e => { if (!isCur) e.currentTarget.style.backgroundColor = c.bg; }}
                                        onMouseLeave={e => { if (!isCur) e.currentTarget.style.backgroundColor = 'transparent'; }}>
                                        <span style={{ display:'inline-block', width:'8px', height:'8px', borderRadius:'50%', backgroundColor: c.activeBg, flexShrink:0 }}/>
                                        <span style={{ fontSize:'12px', fontWeight: isCur ? 800 : 600, color: isCur ? '#fff' : c.text }}>{s}</span>
                                        {isCur && <Check size={11} style={{ marginLeft:'auto', color:'#fff' }}/>}
                                    </button>
                                );
                            });
                        })()}
                    </div>
                </>
            )}

            {/* 담당자 인라인 드롭다운 */}
            {assigneeDropdown && (
                <>
                    <div className="fixed inset-0 z-[350]" onClick={() => setAssigneeDropdown(null)}/>
                    <div className="fixed z-[351] shadow-2xl overflow-hidden"
                        style={{ top: assigneeDropdown.top + 2, left: assigneeDropdown.left, minWidth: Math.max(assigneeDropdown.width, 160),
                                 backgroundColor:'#fff', border:'1.5px solid #c4ccd8', maxHeight:'260px', overflowY:'auto' }}>
                        {ASSIGNEE_LIST.map(name => {
                            const curRaw = activeRows.find(r=>r._id===assigneeDropdown.rowId)?.[assigneeDropdown.col]||'';
                            const isCur = extractName(normalizeAssignee(curRaw)) === extractName(name);
                            return (
                                <button key={name}
                                    onClick={() => { commitCellWith(assigneeDropdown.rowId, assigneeDropdown.col, name); setAssigneeDropdown(null); }}
                                    style={{ display:'flex', alignItems:'center', gap:'8px', width:'100%', padding:'6px 12px',
                                             backgroundColor: isCur ? '#374151' : 'transparent', border:'none', cursor:'pointer' }}
                                    onMouseEnter={e=>{ if(!isCur) e.currentTarget.style.backgroundColor='rgba(107,114,128,0.1)'; }}
                                    onMouseLeave={e=>{ if(!isCur) e.currentTarget.style.backgroundColor='transparent'; }}>
                                    <span style={{ fontSize:'12px', fontWeight: isCur ? 800 : 500, color: isCur ? '#fff' : '#374151' }}>{name}</span>
                                    {isCur && <Check size={11} style={{ marginLeft:'auto', color:'#fff' }}/>}
                                </button>
                            );
                        })}
                    </div>
                </>
            )}

            {/* 발주처 인라인 드롭다운 */}
            {clientDropdown && (
                <>
                    <div className="fixed inset-0 z-[350]" onClick={() => setClientDropdown(null)}/>
                    <div className="fixed z-[351] shadow-2xl overflow-hidden"
                        style={{ top: clientDropdown.top + 2, left: clientDropdown.left, minWidth: Math.max(clientDropdown.width, 140),
                                 backgroundColor:'#fff', border:'1.5px solid #c4ccd8', maxHeight:'260px', overflowY:'auto' }}>
                        {[...new Set(activeRows.map(r => String(r[clientDropdown.col]||'').trim()).filter(Boolean))].sort().map(name => {
                            const curRaw = String(activeRows.find(r=>r._id===clientDropdown.rowId)?.[clientDropdown.col]||'').trim();
                            const isCur = curRaw === name;
                            return (
                                <button key={name}
                                    onClick={() => { commitCellWith(clientDropdown.rowId, clientDropdown.col, name); setClientDropdown(null); }}
                                    style={{ display:'flex', alignItems:'center', gap:'8px', width:'100%', padding:'6px 12px',
                                             backgroundColor: isCur ? '#1e7ac8' : 'transparent', border:'none', cursor:'pointer' }}
                                    onMouseEnter={e=>{ if(!isCur) e.currentTarget.style.backgroundColor='rgba(30,122,200,0.08)'; }}
                                    onMouseLeave={e=>{ if(!isCur) e.currentTarget.style.backgroundColor='transparent'; }}>
                                    <span style={{ fontSize:'12px', fontWeight: isCur ? 700 : 400, color: isCur ? '#fff' : '#1e293b' }}>{name}</span>
                                    {isCur && <Check size={11} style={{ marginLeft:'auto', color:'#fff' }}/>}
                                </button>
                            );
                        })}
                    </div>
                </>
            )}

            {/* 업체담당자 인라인 드롭다운 */}
            {vendorDropdown && (
                <>
                    <div className="fixed inset-0 z-[350]" onClick={() => setVendorDropdown(null)}/>
                    <div className="fixed z-[351] shadow-2xl overflow-hidden"
                        style={{ top: vendorDropdown.top + 2, left: vendorDropdown.left, minWidth: Math.max(vendorDropdown.width, 140),
                                 backgroundColor:'#fff', border:'1.5px solid #c4ccd8', maxHeight:'260px', overflowY:'auto' }}>
                        {[...new Set(activeRows.map(r => String(r[vendorDropdown.col]||'').trim()).filter(Boolean))].sort().map(name => {
                            const curRaw = String(activeRows.find(r=>r._id===vendorDropdown.rowId)?.[vendorDropdown.col]||'').trim();
                            const isCur = curRaw === name;
                            return (
                                <button key={name}
                                    onClick={() => { commitCellWith(vendorDropdown.rowId, vendorDropdown.col, name); setVendorDropdown(null); }}
                                    style={{ display:'flex', alignItems:'center', gap:'8px', width:'100%', padding:'6px 12px',
                                             backgroundColor: isCur ? '#374151' : 'transparent', border:'none', cursor:'pointer' }}
                                    onMouseEnter={e=>{ if(!isCur) e.currentTarget.style.backgroundColor='rgba(107,114,128,0.1)'; }}
                                    onMouseLeave={e=>{ if(!isCur) e.currentTarget.style.backgroundColor='transparent'; }}>
                                    <span style={{ fontSize:'12px', fontWeight: isCur ? 700 : 400, color: isCur ? '#fff' : '#374151' }}>{name}</span>
                                    {isCur && <Check size={11} style={{ marginLeft:'auto', color:'#fff' }}/>}
                                </button>
                            );
                        })}
                    </div>
                </>
            )}

            {/* ── 우클릭 컨텍스트 메뉴 ── */}
            {contextMenu && (
                <>
                    <div className="fixed inset-0 z-[8000]" onClick={() => setContextMenu(null)}/>
                    <div className="fixed z-[8001] bg-white border border-[#c4ccd8] shadow-2xl rounded-lg py-1.5 w-48 animate-in fade-in zoom-in duration-100 overflow-hidden"
                        style={{ top: Math.min(contextMenu.y, window.innerHeight-290), left: Math.min(contextMenu.x, window.innerWidth-200) }}
                        onClick={e => e.stopPropagation()}>
                        <div className="px-3 py-1.5 border-b border-[#e5eaf3] mb-1">
                            <p className="text-[10px] font-black text-[#888] uppercase tracking-wider truncate">
                                {contextMenu.row['실행번호'] || contextMenu.row['번호'] || contextMenu.row['Project'] || contextMenu.row['프로젝트'] || 'Project'}
                            </p>
                        </div>
                        <button onClick={() => { setDetailRow({...contextMenu.row}); setDetailRowOriginal({...contextMenu.row}); setContextMenu(null); }}
                            className="w-full text-left px-4 py-2 hover:bg-blue-50 flex items-center gap-3 text-sm font-bold text-[#222] transition-colors">
                            <Edit2 size={16} className="text-[#1e7ac8]"/> 상세/수정
                        </button>
                        <button onClick={() => { openExecNoModal(contextMenu.row); setContextMenu(null); }}
                            className="w-full text-left px-4 py-2 hover:bg-blue-50 flex items-center gap-3 text-sm font-bold text-[#222] transition-colors">
                            <FileText size={16} className="text-[#1e7ac8]"/> 프로젝트 연결 (실행번호+ID)
                        </button>
                        <button onClick={() => { setProgressRow(contextMenu.row); setContextMenu(null); }}
                            className="w-full text-left px-4 py-2 hover:bg-blue-50 flex items-center gap-3 text-sm font-bold text-[#222] transition-colors">
                            <TrendingUp size={16} className="text-[#1e7ac8]"/> 진행실적 등록
                        </button>
                        <button onClick={() => {
                            const execNo = contextMenu.row[EXEC_NO_COL];
                            const match = execNo && allProjects ? allProjects.find(p => String(p.execNo) === String(execNo)) : null;
                            if (match && onShowGraph) { onShowGraph(match); setContextMenu(null); }
                            else { setAlertMsg(execNo ? '해당 실행번호의 월간보고 데이터를 찾을 수 없습니다.' : '먼저 실행번호를 등록해주세요.'); setContextMenu(null); }
                        }} className="w-full text-left px-4 py-2 hover:bg-blue-50 flex items-center gap-3 text-sm font-bold text-[#222] transition-colors">
                            <BarChart3 size={16} className="text-[#1e7ac8]"/> 실적 그래프 보기
                        </button>
                        {contextMenu.row[EXEC_NO_COL] && onGoToPms && (
                            <>
                                <div className="border-t border-[#e5eaf3] my-1"/>
                                <button onClick={() => {
                                    onGoToPms(contextMenu.row[EXEC_NO_COL]);
                                    setContextMenu(null);
                                }} className="w-full text-left px-4 py-2 hover:bg-blue-50 flex items-center gap-3 text-sm font-bold text-[#d97706] transition-colors">
                                    <AlignJustify size={16}/> 업무현황 이동
                                </button>
                            </>
                        )}
                    </div>
                </>
            )}

            {/* ── 실행번호 등록 모달 ── */}
            {execNoModal && (
                <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div style={{background:'#ffffff', border:'1px solid var(--line)', borderRadius:12, width:560, maxWidth:'95vw', maxHeight:'80vh', display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:'0 8px 40px rgba(0,0,0,0.18)'}}>
                        {/* 헤더 */}
                        <div style={{padding:'14px 20px', borderBottom:'1px solid var(--line)', display:'flex', alignItems:'center', justifyContent:'space-between', background:'var(--brand)'}}>
                            <div>
                                <div style={{color:'#ffffff', fontWeight:800, fontSize:14}}>프로젝트 연결 (월간보고와 잇기)</div>
                                <div style={{color:'rgba(255,255,255,0.85)', fontSize:11, marginTop:2}}>선택하면 실행번호가 기록되고 양쪽의 고유 ID가 하나로 통일됩니다</div>
                            </div>
                            <button onClick={() => setExecNoModal(null)} style={{background:'none', border:'none', color:'#ffffff', cursor:'pointer', padding:4}}>
                                <X size={16}/>
                            </button>
                        </div>

                        {/* 현재 행 프로젝트명 */}
                        <div style={{padding:'10px 20px', background:'#f3f6fa', borderBottom:'1px solid var(--line)', fontSize:12, color:'var(--txt-mid)'}}>
                            현재 행: {(() => {
                                const nameKeys = ['프로젝트명','프로젝트','Project','공사명','건명','명칭'];
                                const k = nameKeys.find(k => activeHeaders.includes(k)) || activeHeaders.find(h => /프로젝트|공사|건명/.test(h)) || '';
                                return k ? (execNoModal.row[k] || '(이름 없음)') : '(이름 없음)';
                            })()}
                        </div>

                        {/* 후보 목록 */}
                        <div style={{flex:1, overflowY:'auto', padding:'8px 0'}}>
                            {execNoModal.loading ? (
                                <div style={{textAlign:'center', padding:'40px 0', color:'var(--txt-mid)', fontSize:13}}>
                                    월간보고 데이터 불러오는 중...
                                </div>
                            ) : execNoModal.candidates.length === 0 ? (
                                <div style={{textAlign:'center', padding:'40px 0', color:'var(--txt-mid)', fontSize:13}}>
                                    등록된 월간보고 프로젝트가 없습니다
                                </div>
                            ) : (
                                execNoModal.candidates.map((c, i) => {
                                    const isSelected = execNoModal.selected?.execNo === c.execNo;
                                    return (
                                        <div key={i} onClick={() => setExecNoModal(p => ({...p, selected: c}))}
                                            style={{
                                                display:'flex', alignItems:'center', gap:12, padding:'10px 20px',
                                                cursor:'pointer', borderBottom:'1px solid var(--line)',
                                                background: isSelected ? 'rgba(30,122,200,0.10)' : 'transparent',
                                                borderLeft: isSelected ? '3px solid var(--brand)' : '3px solid transparent'
                                            }}>
                                            <div style={{minWidth:90, fontFamily:'monospace', fontSize:12, fontWeight:700, color: c.score > 0.3 ? 'var(--brand)' : 'var(--txt-soft)'}}>
                                                {c.execNo}
                                            </div>
                                            <div style={{flex:1, fontSize:12, color: isSelected ? 'var(--txt-strong)' : 'var(--txt-mid)'}}>
                                                {c.project}
                                            </div>
                                            {c.linkedToThis && (
                                                <span style={{fontSize:9, fontWeight:800, color:'#059669', border:'1px solid rgba(5,150,105,0.4)', borderRadius:4, padding:'1px 5px', flexShrink:0}}>현재 연결</span>
                                            )}
                                            {c.linkedToOther && (
                                                <span style={{fontSize:9, fontWeight:800, color:'#d97706', border:'1px solid rgba(217,119,6,0.4)', borderRadius:4, padding:'1px 5px', flexShrink:0}} title="다른 List 행과 이미 연결됨 — 선택 시 이 행으로 다시 연결됩니다">타 행 연결됨</span>
                                            )}
                                            {c.score > 0 && (
                                                <div style={{fontSize:10, color: c.score > 0.5 ? '#059669' : c.score > 0.2 ? '#d97706' : '#94a3b8', fontWeight:700, minWidth:36, textAlign:'right'}}>
                                                    {Math.round(c.score * 100)}%
                                                </div>
                                            )}
                                            {isSelected && <Check size={14} style={{color:'var(--brand)', flexShrink:0}}/>}
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        {/* 선택된 항목 표시 */}
                        {execNoModal.selected && (
                            <div style={{padding:'10px 20px', background:'rgba(30,122,200,0.06)', borderTop:'1px solid var(--line)', fontSize:12, color:'var(--brand)'}}>
                                선택: <strong>{execNoModal.selected.execNo}</strong> — {execNoModal.selected.project}
                            </div>
                        )}

                        {/* 버튼 */}
                        <div style={{padding:'12px 20px', borderTop:'1px solid var(--line)', display:'flex', justifyContent:'flex-end', gap:8, background:'#f3f6fa'}}>
                            <button onClick={() => setExecNoModal(null)}
                                style={{padding:'7px 20px', background:'#e5e7eb', border:'none', color:'var(--txt-mid)', fontSize:12, fontWeight:700, borderRadius:6, cursor:'pointer'}}>
                                취소
                            </button>
                            <button onClick={saveExecNo} disabled={!execNoModal.selected}
                                style={{padding:'7px 20px', background: execNoModal.selected ? 'var(--brand)' : '#e5e7eb', border:'none', color: execNoModal.selected ? '#fff' : 'var(--txt-soft)', fontSize:12, fontWeight:700, borderRadius:6, cursor: execNoModal.selected ? 'pointer' : 'not-allowed'}}>
                                확인
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── 진행실적 등록 모달리스 ── */}
            {progressRow && (() => {
                const idx = activeRows.findIndex(r => r._id === progressRow._id);
                const subs = [];
                if (idx >= 0) {
                    for (let i = idx + 1; i < activeRows.length; i++) {
                        const eNo = String(activeRows[i]['실행번호'] || '').trim().toLowerCase();
                        if (eNo === 's' || eNo.startsWith('-')) {
                            subs.push({
                                name: activeRows[i]['공사명'] || activeRows[i]['프로젝트명'] || activeRows[i]['Project'] || activeRows[i]['사업명'] || `서브${subs.length + 1}`,
                                key: activeRows[i]._id,
                            });
                        } else break;
                    }
                }
                return (
                    <ProgressModal
                        row={progressRow}
                        team={currentTeam}
                        subRows={subs}
                        baseDate={baseDate}
                        onApplyToMonthly={(_, data) => onApplyProgressByPid?.(progressRow._pid, data)}
                        onProgressSaved={onProgressSaved}
                        onClose={() => setProgressRow(null)}
                    />
                );
            })()}

            {/* ── 상세 화면 (월간보고 동일 포맷) ── */}
            {detailRow && (
                <DetailModal
                    detailRow={detailRow}
                    setDetailRow={setDetailRow}
                    onSave={saveDetailRow}
                    mainVisibleHeaders={mainVisibleHeaders}
                    activeHeaders={activeHeaders}
                    activeColGroups={activeColGroups}
                />
            )}

            {/* 삭제 확인 */}
            {confirmClearOpen && (
                <div className="fixed inset-0 z-[400] flex items-center justify-center bg-slate-950/80 p-4">
                    <div className="bg-white border border-[#c4ccd8] p-8 rounded-lg max-w-sm w-full text-center shadow-2xl">
                        <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto mb-4"/>
                        <p className="text-[#222] font-bold mb-2">전체 데이터 삭제</p>
                        <p className="text-rose-600 text-sm mb-6">로컬·Firebase 모든 데이터가 삭제됩니다.</p>
                        <div className="flex gap-3">
                            <button onClick={() => setConfirmClearOpen(false)} className="flex-1 py-3 bg-[#f1f5f9] border border-[#c4ccd8] rounded-lg font-bold text-[#555]">취소</button>
                            <button onClick={clearAll} className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 rounded-lg font-bold text-white">삭제</button>
                        </div>
                    </div>
                </div>
            )}


            {/* 행 추가 팝업 — 월간보고 Excel 라이트 테마 */}
            {addingRow && (() => {
                const rowSt = { display:'flex', borderBottom:'1px solid #c4ccd8' };
                const lbSt  = { backgroundColor:'#dce3ec', color:'#1a1a1a', fontWeight:700, fontSize:12,
                                 padding:'6px 10px', borderRight:'2px solid #9aa8b8',
                                 minWidth:110, flexShrink:0, display:'flex', alignItems:'center' };
                const valSt = { flex:1, backgroundColor:'#ffffff', padding:0 };
                const inSt  = { width:'100%', border:'none', backgroundColor:'transparent', fontSize:12,
                                 padding:'6px 8px', outline:'none', color:'#000', boxSizing:'border-box' };
                return (
                <div className="fixed inset-0 z-[300] flex items-center justify-center" style={{ backgroundColor:'rgba(2,6,23,0.75)' }}>
                    <div style={{ backgroundColor:'#fff', border:'1.5px solid #9aa8b8', width:640, maxWidth:'95vw',
                                  maxHeight:'88vh', display:'flex', flexDirection:'column',
                                  boxShadow:'0 8px 40px rgba(0,0,0,0.45)' }}>

                        {/* 타이틀 바 */}
                        <div style={{ backgroundColor:'#1e7ac8', borderBottom:'2px solid #1565a0',
                                      padding:'8px 14px', display:'flex', justifyContent:'space-between',
                                      alignItems:'center', flexShrink:0 }}>
                            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                                <Plus size={14} style={{ color:'#ffffff' }}/>
                                <span style={{ fontSize:13, fontWeight:800, color:'#ffffff' }}>프로젝트 추가</span>
                            </div>
                            <button onClick={() => setAddingRow(null)}
                                style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.85)',
                                         display:'flex', alignItems:'center', padding:2 }}>
                                <X size={16}/>
                            </button>
                        </div>

                        {/* 선택 행 복사 안내 */}
                        {selectedRowId && (
                            <div style={{ backgroundColor:'#e8f0fe', borderBottom:'1px solid #b8cfe8',
                                          padding:'5px 14px', fontSize:11, color:'#1e7ac8', fontWeight:700 }}>
                                선택한 행의 데이터를 초기값으로 복사했습니다. 수정 후 저장하세요.
                            </div>
                        )}

                        {/* 필드 폼 — Excel 라벨|값 행 구조 */}
                        <div style={{ flex:1, overflowY:'auto' }} className="custom-scrollbar">
                            {activeHeaders.filter(h => !h.startsWith('_')).map(h => {
                                const val = addingRow[h] ?? '';
                                let input;
                                if (isStatusCol(h)) {
                                    input = (
                                        <select value={val} onChange={e => setAddingRow(p => ({...p, [h]: e.target.value}))} style={inSt}>
                                            <option value="">-- 선택 --</option>
                                            {DEFAULT_STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                                        </select>
                                    );
                                } else if (isAssigneeCol(h)) {
                                    input = (
                                        <select value={val} onChange={e => setAddingRow(p => ({...p, [h]: e.target.value}))} style={inSt}>
                                            <option value="">-- 선택 --</option>
                                            {ASSIGNEE_LIST.map(a => <option key={a} value={a}>{a}</option>)}
                                        </select>
                                    );
                                } else if (isDateCol(h)) {
                                    input = (
                                        <input type="date" value={toDateInputVal(val)}
                                            onChange={e => setAddingRow(p => ({...p, [h]: e.target.value}))}
                                            style={inSt}/>
                                    );
                                } else if (isClientCol(h) || isVendorAssCol(h)) {
                                    const listId = `addrow-dl-${h}`;
                                    const opts = [...new Set(activeRows.map(r => String(r[h]||'').trim()).filter(Boolean))].sort();
                                    input = (
                                        <>
                                            <input list={listId} value={val}
                                                onChange={e => setAddingRow(p => ({...p, [h]: e.target.value}))}
                                                style={inSt} placeholder={h}/>
                                            <datalist id={listId}>{opts.map(o => <option key={o} value={o}/>)}</datalist>
                                        </>
                                    );
                                } else if (h.includes('내용') || h.includes('비고') || h.includes('참조') || h.toLowerCase().includes('spec')) {
                                    input = (
                                        <textarea value={val}
                                            onChange={e => setAddingRow(p => ({...p, [h]: e.target.value}))}
                                            style={{...inSt, resize:'vertical', minHeight:56}}/>
                                    );
                                } else {
                                    input = (
                                        <input value={val}
                                            onChange={e => setAddingRow(p => ({...p, [h]: e.target.value}))}
                                            style={inSt} placeholder={h}/>
                                    );
                                }
                                return (
                                    <div key={h} style={rowSt}>
                                        <div style={lbSt}>{h}</div>
                                        <div style={valSt}>{input}</div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* 하단 버튼 바 */}
                        <div style={{ padding:'10px 14px', borderTop:'2px solid #9aa8b8',
                                      backgroundColor:'#dce3ec', display:'flex', gap:8, flexShrink:0 }}>
                            <button onClick={() => setAddingRow(null)}
                                style={{ flex:1, padding:'8px', backgroundColor:'#ebebeb',
                                         border:'1px solid #c0c0c0', fontWeight:700, fontSize:13,
                                         cursor:'pointer', color:'#333' }}>
                                취소
                            </button>
                            <button onClick={saveAddingRow}
                                style={{ flex:2, padding:'8px', backgroundColor:'#059669', color:'#fff',
                                         fontWeight:700, fontSize:13, cursor:'pointer', border:'none',
                                         display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                                <Save size={14}/> 저장
                            </button>
                        </div>
                    </div>
                </div>
                );
            })()}

            {/* 디버그 */}
            {showDebug && (
                <div className="absolute bottom-4 right-4 w-[460px] max-h-[340px] bg-slate-950/95 border border-slate-700 rounded-2xl shadow-2xl z-[99999] flex flex-col overflow-hidden backdrop-blur-md">
                    <div className="flex justify-between items-center p-3 bg-slate-900 border-b border-slate-800">
                        <span className="text-emerald-400 font-mono text-[11px] font-black flex items-center gap-2"><TerminalSquare size={13}/> DEBUG</span>
                        <div className="flex gap-3">
                            <button onClick={() => setLogs([])} className="text-slate-500 hover:text-white text-[10px] font-bold uppercase">Clear</button>
                            <button onClick={() => setShowDebug(false)} className="text-slate-500 hover:text-white bg-slate-800 p-1 rounded"><X size={13}/></button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3 font-mono text-[11px] text-slate-300 space-y-1 custom-scrollbar">
                        {logs.length === 0
                            ? <span className="text-slate-600 italic">로그 대기 중...</span>
                            : logs.map((l,i) => (
                                <div key={i} className={l.includes('오류')||l.includes('ERROR')?'text-rose-400 font-bold':l.includes('완료')||l.includes('저장')?'text-emerald-400':l.includes('건너뜀')?'text-amber-400':''}>
                                    {l}
                                </div>
                            ))
                        }
                        <div ref={logEndRef}/>
                    </div>
                </div>
            )}

            <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".xlsx,.xls" className="hidden"/>

            {/* ── 헤더 (월간업무보고 동일 스타일) ── */}
            <header className="flex flex-row justify-between items-center gap-2 mb-2 shrink-0 relative z-50">
                {/* 왼쪽: 타이틀 + 연도 + 카운트 */}
                <div className="flex items-center gap-2 min-w-0 shrink-0">
                    <div className="p-2 bg-[#1e7ac8] rounded-xl shadow-sm text-white shrink-0">
                        <ListChecks size={20}/>
                    </div>
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                        <h1 className="text-base font-bold text-gray-800 tracking-tight flex items-center gap-1.5 whitespace-nowrap">
                            {currentTeam} 프로젝트 List
                        </h1>
                        {/* 월별 보기 — 월간보고 기준월과 동일 형식 (연도 드롭다운 대체) */}
                        <div className="flex items-center px-2 py-1 rounded bg-gray-50 hover:bg-gray-100 transition-all cursor-pointer shrink-0">
                            <Calendar size={11} className="text-[#1e7ac8] mr-1" />
                            <span className="text-[11px] font-bold text-gray-500 mr-1">기준월:</span>
                            <input
                                type="month"
                                value={viewMonth}
                                onChange={e => { const v = e.target.value; setViewMonth(v); const y = v.slice(0, 4); if (y && y !== selectedYear) { setSelectedYear(y); setColumnFilters({}); setSortConfig({key:null,dir:'asc'}); setActiveStatusChips(new Set()); setActiveAssignees(new Set()); } }}
                                className="bg-transparent border-none text-gray-700 text-[11px] font-bold outline-none color-scheme-light cursor-pointer"
                            />
                        </div>
                        <div className="flex items-center rounded-md overflow-hidden border border-[#1e7ac8]/40 text-[11px] font-bold shrink-0">
                            <button onClick={() => setMonthMode('single')}
                                className={`px-2 py-1 transition-all ${monthMode === 'single' ? 'bg-[#1e7ac8] text-white' : 'text-[#1e7ac8] hover:bg-[#1e7ac8]/10'}`}>
                                그 달만
                            </button>
                            <button onClick={() => setMonthMode('cumul')}
                                className={`px-2 py-1 transition-all border-l border-[#1e7ac8]/40 ${monthMode === 'cumul' ? 'bg-[#1e7ac8] text-white' : 'text-[#1e7ac8] hover:bg-[#1e7ac8]/10'}`}>
                                이전 전체
                            </button>
                        </div>
                        <span className="text-[11px] text-slate-500 whitespace-nowrap">
                            <span className="text-emerald-400 font-bold">{sortedRows.length}</span>
                            <span className="text-slate-600">/{yearFilteredRows.length}행</span>
                            {activeFilterCount > 0 && <span className="text-amber-400 font-bold"> · 필터 {activeFilterCount}</span>}
                        </span>
                        {/* 데이터 소스 인디케이터 */}
                        {dataSource !== 'firebase' && (
                            <span className={`text-[10px] font-bold px-2 py-0.5 border ${srcBadge.bg} ${srcBadge.text} whitespace-nowrap flex items-center gap-1`}>
                                {srcBadge.icon} {srcBadge.label}
                                {dataSource === 'pending' && pendingData?.fileName && <span className="opacity-60 ml-1 truncate max-w-[120px]">— {pendingData.fileName}</span>}
                                {dataSource === 'local' && localData?.savedAt && <span className="opacity-60 ml-1">{new Date(localData.savedAt).toLocaleDateString()}</span>}
                            </span>
                        )}
                    </div>
                </div>

                {/* 오른쪽: 버튼 (월간업무보고 동일 스타일) */}
                <div className="flex items-center justify-end gap-1 shrink-0">
                    {/* 이전화면 (팀 변경) */}
                    <button onClick={onBack} title="팀 변경"
                        className="flex items-center justify-center px-2.5 py-1.5 rounded border border-slate-600 bg-slate-800 hover:bg-slate-700 text-[#111827] hover:text-white transition-all shrink-0 text-xs font-bold">
                        이전화면
                    </button>

                    {/* 표시 모드 — 컴팩트 */}
                    <button
                        onClick={() => setCompactMode(v => (v + 1) % 3)}
                        title={['기본 보기 → 컴팩트', '컴팩트 → 초소형', '초소형 → 기본'][compactMode]}
                        className={`flex items-center justify-center gap-1 px-2.5 py-1.5 rounded border transition-all text-xs font-bold shrink-0 ${
                            compactMode === 0 ? 'bg-slate-100 border-slate-300'
                          : compactMode === 1 ? 'bg-blue-100 border-blue-400'
                          : 'bg-blue-200 border-blue-500'
                        }`}
                    >
                        <AlignJustify size={14} style={{ color: '#111827' }} />
                        <span style={{ color: '#111827' }}>컴팩트</span>
                    </button>

                    {/* 프로젝트 추가 */}
                    <button onClick={handleOpenAddRow}
                        className="flex items-center justify-center gap-1 px-2.5 py-1.5 rounded border border-blue-500/60 bg-blue-500/15 hover:bg-blue-500 text-[#111827] hover:text-white transition-all text-xs font-bold shrink-0">
                        <Plus size={14}/> 프로젝트 추가
                    </button>

                    {/* 검색 */}
                    <div className="flex items-center shrink-0">
                        <div className="relative">
                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none z-10 transition-colors" size={13}
                                style={{ color: searchTerm ? '#f59e0b' : '#111827' }}/>
                            <input type="text" placeholder="전체 검색..." value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                style={{ borderRadius: 0 }}
                                className="bg-slate-900 border border-slate-700 hover:border-slate-600 py-1.5 pl-7 pr-2 text-xs text-white outline-none w-32 focus:w-48 transition-all placeholder-slate-500"/>
                        </div>
                    </div>


                    {/* 전체 저장 */}
                    <button onClick={confirmSaveAll} title="전체 행 저장"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs font-bold transition-all shrink-0"
                        style={{ backgroundColor:'#16a34a', borderColor:'#15803d', color:'#fff', boxShadow:'0 1px 4px rgba(22,163,74,0.4)' }}
                        onMouseEnter={e=>e.currentTarget.style.backgroundColor='#15803d'}
                        onMouseLeave={e=>e.currentTarget.style.backgroundColor='#16a34a'}>
                        <Save size={13}/> 전체 저장
                    </button>




                    {/* 월간 업무 보고 이동 버튼 */}
                    {onGoToPms && (
                        <button onClick={() => onGoToPms()} title="월간 업무 보고"
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded border border-blue-700 bg-blue-100 hover:bg-blue-600 text-[#111827] hover:text-white transition-all shrink-0 text-xs font-bold">
                            <FileText size={13}/> 월간보고
                        </button>
                    )}


                    {/* 설정 드롭다운 */}
                    <div className="relative shrink-0">
                        <button onClick={() => setSettingsOpen(v=>!v)}
                            className="flex items-center justify-center gap-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 px-2 py-1.5 rounded transition-all text-xs font-bold text-slate-300 hover:text-white">
                            <Settings size={13}/> 설정 <ChevronDown size={11}/>
                        </button>
                        {settingsOpen && (
                            <>
                                <div className="fixed inset-0 z-[55]" onClick={() => setSettingsOpen(false)}/>
                                <div className="absolute right-0 mt-2 w-56 bg-white border border-[#c4ccd8] rounded-lg shadow-2xl overflow-hidden z-[60] py-2">
                                    {/* 데이터 소스 표시 */}
                                    <div className={`px-4 py-2 border-b border-[#e5eaf3] mb-1 flex items-center gap-2 ${srcBadge.text}`}>
                                        {srcBadge.icon}
                                        <span className="text-[11px] font-bold">{srcBadge.label}</span>
                                        {dataSource !== 'firebase' && <span className="text-[#aaa] text-[10px] ml-auto">{activeRows.length}행</span>}
                                    </div>
                                    {/* 로컬 임시 저장 (pending) */}
                                    {dataSource === 'pending' && (
                                        <button onClick={() => { setSettingsOpen(false); handleSaveToLocal(); }}
                                            className="w-full text-left px-4 py-2.5 hover:bg-blue-50 text-xs font-bold text-violet-600 flex items-center gap-2 transition-colors">
                                            <HardDrive size={14}/> 로컬 임시 저장
                                        </button>
                                    )}
                                    {/* A-4c 병합 미리보기 (드라이런 · 저장 없음 · 데이터 안 바뀜) */}
                                    {dataSource === 'pending' && (
                                        <button onClick={() => { setSettingsOpen(false); handleMergePreview(); }}
                                            className="w-full text-left px-4 py-2.5 hover:bg-blue-50 text-xs font-bold text-sky-600 flex items-center gap-2 transition-colors">
                                            <Eye size={14}/> 병합 미리보기 (드라이런)
                                        </button>
                                    )}
                                    {/* Firebase 확정 저장 (pending/local) */}
                                    {(dataSource === 'pending' || dataSource === 'local') && (
                                        <button onClick={() => { setSettingsOpen(false); handleSaveToFirebase(); }}
                                            className="w-full text-left px-4 py-2.5 hover:bg-blue-50 text-xs font-bold text-emerald-600 flex items-center gap-2 transition-colors">
                                            <CloudUpload size={14}/> Firebase 확정 저장
                                        </button>
                                    )}
                                    {/* 로컬 삭제 (local) */}
                                    {dataSource === 'local' && (
                                        <button onClick={() => { setSettingsOpen(false); handleDeleteLocal(); }}
                                            className="w-full text-left px-4 py-2.5 hover:bg-blue-50 text-xs font-bold text-amber-600 flex items-center gap-2 transition-colors">
                                            <Trash2 size={14}/> 로컬 데이터 삭제
                                        </button>
                                    )}
                                    {/* 업로드 취소 (pending) */}
                                    {dataSource === 'pending' && (
                                        <button onClick={() => { setSettingsOpen(false); setPendingData(null); }}
                                            className="w-full text-left px-4 py-2.5 hover:bg-blue-50 text-xs font-bold text-[#888] flex items-center gap-2 transition-colors">
                                            <X size={14}/> 업로드 취소
                                        </button>
                                    )}
                                    {/* 엑셀 업로드 */}
                                    <button onClick={() => { setSettingsOpen(false); if(fileInputRef.current){fileInputRef.current.value='';fileInputRef.current.click();} }}
                                        className="w-full text-left px-4 py-2.5 hover:bg-blue-50 text-xs font-bold text-[#222] flex items-center gap-2 transition-colors">
                                        <Upload size={14} className="text-cyan-600"/> 엑셀 업로드
                                    </button>
                                    {/* 엑셀 생성 */}
                                    <button onClick={() => { setSettingsOpen(false); handleDownload(); }} disabled={!activeHeaders.length}
                                        className="w-full text-left px-4 py-2.5 hover:bg-blue-50 text-xs font-bold text-[#222] flex items-center gap-2 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                                        <FileSpreadsheet size={14} className="text-indigo-600"/> 엑셀 생성
                                    </button>
                                    <div className="border-t border-[#e5eaf3] my-1"/>
                                    {/* 열 표시/숨기기 */}
                                    <button onClick={() => setColDropOpen(v=>!v)}
                                        className={`w-full text-left px-4 py-2.5 hover:bg-blue-50 text-xs font-bold flex items-center gap-2 transition-colors ${hiddenCols.size>0?'text-rose-600':'text-[#333]'}`}>
                                        <Eye size={14} className={hiddenCols.size>0?'text-rose-600':'text-[#999]'}/>
                                        열 표시/숨기기
                                        {hiddenCols.size>0 && <span className="ml-auto text-[10px] bg-rose-500 text-[#222] px-1.5 py-0.5 font-mono">{hiddenCols.size}개 숨김</span>}
                                    </button>
                                    {colDropOpen && (
                                        <div className="px-3 pb-2">
                                            <div className="flex justify-end mb-1.5">
                                                <button onClick={() => setHiddenCols(new Set())} className="text-[11px] text-emerald-600 hover:text-emerald-600 font-bold px-2 py-0.5 bg-emerald-50">모두 표시</button>
                                            </div>
                                            {detailOnlyHeaders.length > 0 && (
                                                <p className="text-[10px] text-[#aaa] mb-1 px-1">※ 나머지 {detailOnlyHeaders.length}개 열은 우클릭 → 상세 화면에서 확인</p>
                                            )}
                                            <div className="space-y-0.5 max-h-48 overflow-y-auto custom-scrollbar">
                                                {allMainCols.map(h => (
                                                    <label key={h} className="flex items-center gap-2 cursor-pointer group py-1 px-2 hover:bg-blue-50 transition-colors">
                                                        <input type="checkbox" checked={!hiddenCols.has(h)}
                                                            onChange={() => setHiddenCols(p => { const n=new Set(p); n.has(h)?n.delete(h):n.add(h); return n; })}
                                                            className="w-3 h-3 accent-emerald-500 cursor-pointer"/>
                                                        <span className={`text-[12px] font-medium ${hiddenCols.has(h)?'text-[#999]':'text-[#222] group-hover:text-[#1e7ac8]'}`}>{h}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    <div className="border-t border-[#e5eaf3] my-1"/>
                                    {/* 디버그 */}
                                    <button onClick={() => { setSettingsOpen(false); setShowDebug(v=>!v); }}
                                        className={`w-full text-left px-4 py-2.5 hover:bg-blue-50 text-xs font-bold flex items-center gap-2 transition-colors border-b border-[#e5eaf3] ${showDebug?'text-emerald-600':'text-[#333]'}`}>
                                        <TerminalSquare size={14}/> 디버그 모드
                                        <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded border font-mono ${showDebug?'border-emerald-600 text-emerald-600':'border-[#c4ccd8] text-[#999]'}`}>{showDebug?'ON':'OFF'}</span>
                                    </button>
                                    <div className="border-t border-[#e5eaf3] my-1"/>
                                    {/* 전체 삭제 */}
                                    <button onClick={() => { setSettingsOpen(false); setConfirmClearOpen(true); }} disabled={!activeRows.length}
                                        className="w-full text-left px-4 py-2.5 hover:bg-rose-50 text-xs font-bold text-rose-600 flex items-center gap-2 transition-colors disabled:opacity-40">
                                        <Trash2 size={14}/> 전체 데이터 삭제
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </header>


            {/* ── 빈 상태 / 테이블 ── */}
            {activeHeaders.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center animate-in">
                    <div className="max-w-lg w-full text-center">
                        <div className="inline-flex items-center justify-center p-5 bg-slate-900 rounded-3xl shadow-[0_0_40px_rgba(16,185,129,0.12)] border border-slate-800 mb-8">
                            <FileSpreadsheet size={52} className="text-emerald-500/60"/>
                        </div>
                        <h2 className="text-3xl font-extrabold text-slate-200 mb-3 tracking-tight">등록된 프로젝트 List가 없습니다</h2>
                        <p className="text-slate-500 text-base mb-2">엑셀 파일을 업로드하면 헤더를 자동으로 인식하여<br/>테이블 형태로 표시됩니다.</p>
                        <p className="text-slate-600 text-sm mb-10">업로드 후 검토 → 로컬 임시 저장 → Firebase 확정 저장 순으로 진행하세요.</p>
                        <button onClick={() => { if(fileInputRef.current){fileInputRef.current.value='';fileInputRef.current.click();} }}
                            className="inline-flex items-center gap-3 px-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-bold text-base shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all">
                            <Upload size={20}/> 엑셀 파일 업로드
                        </button>
                        <p className="text-slate-700 text-xs mt-5">지원 형식: .xlsx · .xls</p>
                    </div>
                </div>
            ) : (
                <div className="flex-1 bg-slate-900/40 border border-slate-800 rounded-2xl overflow-hidden flex flex-col min-h-0">
                    {/* ── 진행현황 + 담당자 칩 필터 바 (한 행) ── */}
                    {statusFilterCol && statusChipData.length > 0 && (
                        <div style={{ padding: '6px 14px', borderBottom: '1px solid #c4ccd8', backgroundColor: '#edf1f7', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', flexShrink: 0 }}>
                            {/* 진행현황 */}
                            <span style={{ fontSize: '11px', fontWeight: 700, color: '#666' }}>{statusFilterCol}</span>
                            <button onClick={() => setActiveStatusChips(new Set())}
                                style={{ padding: '3px 10px', fontSize: '11px', fontWeight: activeStatusChips.size === 0 ? 800 : 600, backgroundColor: activeStatusChips.size === 0 ? 'rgba(30,122,200,0.12)' : '#fff', color: activeStatusChips.size === 0 ? '#1358a0' : '#888', border: activeStatusChips.size === 0 ? '1.5px solid #1e7ac8' : '1.5px solid #e5e7eb', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                전체 <span style={{ fontSize: '10px', opacity: 0.85 }}>({yearFilteredRows.length})</span>
                            </button>
                            {statusChipData.map(([status, count]) => {
                                const isActive = activeStatusChips.has(status);
                                const c = STATUS_CHIP_COLORS[status] || { bg: 'rgba(100,116,139,0.12)', text: '#475569', border: 'rgba(100,116,139,0.4)', activeBg: '#475569', activeText: '#fff' };
                                return (
                                    <button key={status}
                                        onClick={() => setActiveStatusChips(prev => { const next = new Set(prev); if (next.has(status)) next.delete(status); else next.add(status); return next; })}
                                        style={{ padding: '3px 10px', fontSize: '11px', fontWeight: isActive ? 800 : 600, backgroundColor: isActive ? c.bg : '#fff', color: isActive ? c.text : '#888', border: `1.5px solid ${isActive ? c.border : '#e5e7eb'}`, borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        {status} <span style={{ fontSize: '10px', opacity: isActive ? 0.9 : 0.75 }}>({count})</span>
                                    </button>
                                );
                            })}
                            {activeStatusChips.size > 0 && (
                                <button onClick={() => setActiveStatusChips(new Set())}
                                    style={{ fontSize: '10px', fontWeight: 700, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', display: 'flex', alignItems: 'center', gap: '2px' }}>
                                    <X size={10}/> 초기화
                                </button>
                            )}
                            {/* 구분선 */}
                            {assigneeFilterCol && <div style={{ width: '1px', height: '18px', backgroundColor: '#c4ccd8', margin: '0 4px', flexShrink: 0 }}/>}
                            {/* 담당자 */}
                            {assigneeFilterCol && (<>
                                <span style={{ fontSize: '11px', fontWeight: 700, color: '#666' }}>담당자</span>
                                <button onClick={() => setActiveAssignees(new Set())}
                                    style={{ padding: '3px 8px', fontSize: '11px', fontWeight: activeAssignees.size === 0 ? 800 : 600, backgroundColor: activeAssignees.size === 0 ? 'rgba(30,122,200,0.12)' : '#fff', color: activeAssignees.size === 0 ? '#1358a0' : '#888', border: activeAssignees.size === 0 ? '1.5px solid #1e7ac8' : '1.5px solid #e5e7eb', borderRadius: '6px', cursor: 'pointer' }}>
                                    전체
                                </button>
                                {ASSIGNEE_LIST.map(name => {
                                    const isActive = activeAssignees.has(name);
                                    return (
                                        <button key={name}
                                            onClick={() => setActiveAssignees(prev => { const n = new Set(prev); if (n.has(name)) n.delete(name); else n.add(name); return n; })}
                                            style={{ padding: '3px 8px', fontSize: '11px', fontWeight: isActive ? 800 : 600, backgroundColor: isActive ? 'rgba(30,122,200,0.12)' : '#fff', color: isActive ? '#1358a0' : '#888', border: isActive ? '1.5px solid #1e7ac8' : '1.5px solid #e5e7eb', borderRadius: '6px', cursor: 'pointer', display:'flex', alignItems:'center', gap:'4px' }}>
                                            {name}
                                            <span style={{ fontSize:'10px', opacity:0.8 }}>({assigneeCountMap[extractName(name)] || 0})</span>
                                        </button>
                                    );
                                })}
                                {activeAssignees.size > 0 && (
                                    <button onClick={() => setActiveAssignees(new Set())}
                                        style={{ fontSize: '10px', fontWeight: 700, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', display: 'flex', alignItems: 'center', gap: '2px' }}>
                                        <X size={10}/> 초기화
                                    </button>
                                )}
                            </>)}
                        </div>
                    )}
                    <div className="overflow-auto flex-1 custom-scrollbar">
                        <table className="w-full text-left border-collapse table-fixed"
                            style={{ minWidth: mainVisibleHeaders.reduce((s,h)=>s+getW(h),0)+22+120 }}>
                            <colgroup>
                                <col style={{width:22}}/>
                                {mainVisibleHeaders.map(h => <col key={h} style={{width:getW(h)}}/>)}
                                <col style={{width:120}}/>
                            </colgroup>
                            {(() => {
                                // 헤드 높이 약 20% 축소
                                const thPx    = compactMode===0 ? 'px-3 py-1'   : compactMode===1 ? 'px-2 py-px'  : 'px-1.5 py-0';
                                const thSub   = compactMode===0 ? 'px-2 py-0.5' : compactMode===1 ? 'px-2 py-px'  : 'px-1.5 py-0';
                                const tdPx    = compactMode===0 ? 'px-3 py-2'   : compactMode===1 ? 'px-2 py-1'   : 'px-1.5 py-0.5';
                                const noTdPx  = compactMode===0 ? 'px-2 py-2'   : compactMode===1 ? 'px-2 py-1'   : 'px-1 py-0.5';
                                const actTdPx = compactMode===0 ? 'px-1 py-1'   : compactMode===1 ? 'px-1 py-0.5'   : 'px-0.5 py-0';
                                const noSz    = compactMode===0 ? 'text-[11px]' : compactMode===1 ? 'text-[11px]' : 'text-[9px]';
                                const mgrSz   = compactMode===0 ? 'text-[11px]' : compactMode===1 ? 'text-[10px]' : 'text-[9px]';
                                const iconSz  = compactMode===2 ? 12 : 14;

                                // ── 고정 열 오프셋 계산 (No.=52px 이후 누적) ──
                                const frozenOffsets = {};
                                if (frozenUpTo && mainVisibleHeaders.includes(frozenUpTo)) {
                                    let left = 22;
                                    for (const h of mainVisibleHeaders) {
                                        frozenOffsets[h] = left;
                                        left += getW(h);
                                        if (h === frozenUpTo) break;
                                    }
                                }
                                const isFrz  = h => frozenOffsets[h] !== undefined;
                                const isPinH = h => h === frozenUpTo;

                                return (<>
                            <thead className="sticky top-0 z-30" style={{background:'var(--head-bg)'}}>
                                <tr className="border-b border-slate-800">
                                    <th rowSpan={hasMainGroups?2:1} className={`${noTdPx} text-center text-slate-400 ${noSz} font-bold border-r border-slate-800/60 sticky left-0 z-40`} style={{background:'var(--head-bg)'}}>No.</th>
                                    {hasMainGroups ? mainVisibleGroups.map((g,gi) => {
                                        if (!g.label) {
                                            const h = g.cols[0];
                                            if (h === EXEC_NO_COL) return (
                                                <th key={`sg-${gi}`} rowSpan={2}
                                                    className={`${thPx} text-center text-slate-400 text-[11px] border-r border-slate-800/40`}
                                                    style={{background:'var(--head-bg)', width: getW(h)||90, minWidth: getW(h)||90, whiteSpace:'nowrap'}}>
                                                    실행번호
                                                </th>
                                            );
                                            return (
                                                <th key={`sg-${gi}`} rowSpan={2}
                                                    className={`${thPx} relative align-middle ${isPinH(h)?'border-r-2 border-blue-400':'border-r border-slate-800/40'} ${isFrz(h)?'z-40':''}`}
                                                    style={isFrz(h)?{position:'sticky',left:frozenOffsets[h],background:'var(--head-bg)'}:{}}
                                                    onDoubleClick={()=>setFrozenUpTo(p=>p===h?null:h)}>
                                                    {isFilterable(h) ? <ComboFilter h={h}/> : <SortHeader h={h}/>}
                                                    <div className="absolute -right-[4px] top-0 bottom-0 w-[8px] cursor-col-resize hover:bg-emerald-500/40 z-10"
                                                        onMouseDown={e => startResize(h, e)} onDoubleClick={e => { e.stopPropagation(); autoFitCol(h); }}/>
                                                </th>
                                            );
                                        }
                                        {
                                            const isProgress = g.label?.includes('공사진행') || g.label?.includes('공사 진행');
                                            return (
                                            <th key={`g-${gi}`} colSpan={g.cols.length}
                                                className={`${thPx} text-center border-b-2 border-r border-slate-800/40`}
                                                style={isProgress
                                                    ? { background:'#daeaf8', borderBottomColor:'#3b82f6' }
                                                    : { background:'var(--head-bg)', borderBottomColor:'var(--brand)' }}>
                                                <span style={{ fontWeight:700, fontSize:11, letterSpacing:'0.05em',
                                                    color: '#94a3b8' }}>{g.label}</span>
                                            </th>
                                            );
                                        }
                                    }) : mainVisibleHeaders.map(h => {
                                        if (h === EXEC_NO_COL) return (
                                            <th key={h} className={`${thPx} text-center text-slate-400 text-[11px] border-r border-slate-800/40`}
                                                style={{background:'var(--head-bg)', width: getW(h)||90, minWidth: getW(h)||90, whiteSpace:'nowrap'}}>
                                                실행번호
                                            </th>
                                        );
                                        return (
                                        <th key={h}
                                            className={`${thPx} relative ${isPinH(h)?'border-r-2 border-blue-400':'border-r border-slate-800/40'} ${isFrz(h)?'z-40':''}`}
                                            style={isFrz(h)?{position:'sticky',left:frozenOffsets[h],background:'var(--head-bg)'}:{}}
                                            onDoubleClick={()=>setFrozenUpTo(p=>p===h?null:h)}>
                                            {isFilterable(h) ? <ComboFilter h={h}/> : <SortHeader h={h}/>}
                                            <div className="absolute -right-[4px] top-0 bottom-0 w-[8px] cursor-col-resize hover:bg-emerald-500/40 z-10"
                                                onMouseDown={e => startResize(h, e)} onDoubleClick={e => { e.stopPropagation(); autoFitCol(h); }}/>
                                        </th>
                                        );
                                    })}
                                    <th rowSpan={hasMainGroups?2:1} className={`${actTdPx} text-center text-slate-400 ${mgrSz} font-bold sticky right-0 z-40`} style={{background:'var(--head-bg)'}}>관리</th>
                                </tr>
                                {hasMainGroups && (
                                    <tr className="border-b border-slate-800">
                                        {mainVisibleGroups.map((g,gi) => {
                                            if (!g.label) return null;
                                            const isProgress = g.label?.includes('공사진행') || g.label?.includes('공사 진행');
                                            const subBg = isProgress ? '#eef6fd' : 'var(--head-bg)';
                                            return g.cols.map((h,ci) => (
                                                <th key={`sub-${gi}-${ci}`}
                                                    className={`${thSub} relative ${isPinH(h)?'border-r-2 border-blue-400':'border-r border-slate-800/40'} ${isFrz(h)?'z-40':''}`}
                                                    style={isFrz(h)?{position:'sticky',left:frozenOffsets[h],background:subBg}:{background:subBg}}
                                                    onDoubleClick={()=>setFrozenUpTo(p=>p===h?null:h)}>
                                                    {isFilterable(h)
                                                        ? <ComboFilter h={h} small/>
                                                        : <SortHeader h={h} small forceColor={isProgress ? '#1a1a1a' : undefined}/>}
                                                    <div className="absolute -right-[4px] top-0 bottom-0 w-[8px] cursor-col-resize hover:bg-emerald-500/40 z-10"
                                                        onMouseDown={e => startResize(h, e)} onDoubleClick={e => { e.stopPropagation(); autoFitCol(h); }}/>
                                                </th>
                                            ));
                                        })}
                                    </tr>
                                )}
                            </thead>
                            <tbody className="divide-y divide-slate-800/50">
                                {sortedRows.length === 0 ? (
                                    <tr>
                                        <td colSpan={mainVisibleHeaders.length+2} className="py-20 text-center">
                                            <p className="text-slate-400 font-bold text-base mb-1">조건에 맞는 데이터가 없습니다.</p>
                                            <p className="text-slate-600 text-sm">필터/검색 조건을 변경해보세요.</p>
                                        </td>
                                    </tr>
                                ) : sortedRows.map((row,ri) => {
                                    const isSelected    = selectedRowId    === row._id;
                                    const isHlRow       = highlightedRowId === row._id;
                                    const rowBg = isHlRow ? 'rgba(251,191,36,0.18)' : isSelected ? '#dbeafe' : '#ffffff';
                                    return (
                                    <tr key={row._id}
                                        data-row-id={row._id}
                                        className={`group transition-colors cursor-pointer
                                            ${isHlRow
                                                ? 'tr-highlighted border-l-[3px] border-l-amber-400'
                                                : isSelected ? 'bg-blue-50 ring-1 ring-inset ring-blue-300' : 'hover:bg-white/5'}`}
                                        style={isHlRow ? { backgroundColor: 'rgba(251,191,36,0.18)' } : {}}
                                        onClick={() => setSelectedRowId(prev => prev === row._id ? null : row._id)}
                                        onDoubleClick={() => { setDetailRow({...row}); setDetailRowOriginal({...row}); }}
                                        onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, row }); }}>
                                        <td className={`${noTdPx} text-center ${noSz} border-r border-slate-800/30 sticky left-0 z-10 ${isSelected ? 'text-blue-700 font-bold' : isHlRow ? 'text-amber-600 font-bold' : 'text-slate-600'}`}
                                            style={{background: rowBg}}>{ri+1}</td>
                                        {mainVisibleHeaders.map(h => {
                                            // 실행번호 — 전용 셀
                                            if (h === EXEC_NO_COL) return (
                                                <td key={h} className={`${tdPx} text-center text-[11px] border-r border-cyan-800/30`}
                                                    style={{background: isHlRow ? 'rgba(251,191,36,0.28)' : row[EXEC_NO_COL] ? '#f0f9ff' : rowBg, color: isHlRow ? '#92400e' : row[EXEC_NO_COL] ? '#1a1a1a' : '#64748b', width: getW(h)||90, minWidth: getW(h)||90}}>
                                                    {row[EXEC_NO_COL] || '—'}
                                                </td>
                                            );
                                            const isEd = editingCell.id===row._id && editingCell.key===h;
                                            if (isEd) return (
                                                <td key={h} className={`px-2 py-1 border ${isDateCol(h)?'bg-white border-blue-400':'bg-emerald-950/40 border-emerald-500/40'} ${isFrz(h)?'z-10':''}`}
                                                    style={isFrz(h)?{position:'sticky',left:frozenOffsets[h],background:isDateCol(h)?'#fff':'#0a2010'}:{}}>
                                                    {isDateCol(h) ? (
                                                        <input autoFocus type="date" value={editingCell.value}
                                                            onChange={e=>setEditingCell(p=>({...p,value:e.target.value}))}
                                                            onBlur={commitCellEdit}
                                                            onKeyDown={e=>{if(e.key==='Enter')commitCellEdit();if(e.key==='Escape')setEditingCell({id:null,key:null,value:''}); }}
                                                            className="w-full border-none outline-none text-xs text-slate-800 bg-transparent"/>
                                                    ) : (
                                                        <input autoFocus type="text" value={editingCell.value}
                                                            onChange={e=>setEditingCell(p=>({...p,value:e.target.value}))}
                                                            onFocus={e=>e.target.select()} onBlur={commitCellEdit}
                                                            onKeyDown={e=>{if(e.key==='Enter')commitCellEdit();if(e.key==='Escape')setEditingCell({id:null,key:null,value:''}); }}
                                                            className="w-full bg-slate-950 border border-emerald-500 rounded-md px-2 py-0.5 text-xs text-white outline-none ring-1 ring-emerald-500/40"/>
                                                    )}
                                                </td>
                                            );
                                            const val = row[h];
                                            const isHl = columnFilters[h] && String(val||'')===columnFilters[h];
                                            return (
                                                <td key={h}
                                                    className={`${tdPx} truncate align-middle cursor-text hover:bg-emerald-950/20 transition-colors
                                                        ${isPinH(h)?'border-r-2 border-blue-400/50':'border-r border-slate-800/20'}
                                                        ${isStatusCol(h)?'cursor-pointer':''}
                                                        ${isDateCol(h)?'text-slate-400 text-[11px]':'text-slate-300 text-[11px]'}
                                                        ${isHl?'bg-amber-950/20 text-amber-200':''}
                                                        ${isFrz(h)?'z-10':''}`}
                                                    style={isFrz(h)?{position:'sticky',left:frozenOffsets[h],background: isHl?'':rowBg}:{}}
                                                    title={val||''}
                                                    onClick={e=>{
                                                        e.stopPropagation();
                                                        const closeAll = () => { setStatusDropdown(null); setAssigneeDropdown(null); setClientDropdown(null); setVendorDropdown(null); };
                                                        if (isStatusCol(h)) {
                                                            closeAll();
                                                            const rect = e.currentTarget.getBoundingClientRect();
                                                            setStatusDropdown({ rowId: row._id, col: h, top: rect.bottom, left: rect.left, width: Math.max(rect.width, 120) });
                                                        } else if (isAssigneeCol(h)) {
                                                            closeAll();
                                                            const rect = e.currentTarget.getBoundingClientRect();
                                                            setAssigneeDropdown({ rowId: row._id, col: h, top: rect.bottom, left: rect.left, width: Math.max(rect.width, 160) });
                                                        } else if (isClientCol(h)) {
                                                            closeAll();
                                                            const rect = e.currentTarget.getBoundingClientRect();
                                                            setClientDropdown({ rowId: row._id, col: h, top: rect.bottom, left: rect.left, width: Math.max(rect.width, 140) });
                                                        } else if (isVendorAssCol(h)) {
                                                            closeAll();
                                                            const rect = e.currentTarget.getBoundingClientRect();
                                                            setVendorDropdown({ rowId: row._id, col: h, top: rect.bottom, left: rect.left, width: Math.max(rect.width, 140) });
                                                        } else if (isDateCol(h)) {
                                                            setEditingCell({id:row._id,key:h,value:toDateInputVal(val)});
                                                        } else {
                                                            setEditingCell({id:row._id,key:h,value:val||''});
                                                        }
                                                    }}>
                                                    {isStatusCol(h) && val ? (() => {
                                                        const nv = String(val).toUpperCase() === 'HOLD' ? 'Hold' : val;
                                                        const disp = String(val).toLowerCase() === 'sub' ? '하위' : nv;
                                                        const c = STATUS_CHIP_COLORS[nv] || { bg:'rgba(100,116,139,0.08)', text:'#475569', border:'rgba(100,116,139,0.3)' };
                                                        const _m = mapLegacyStatus(nv);
                                                        return (
                                                            <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-start', gap:2 }}>
                                                                <span style={{ display:'inline-flex', padding:'1px 8px', fontSize:'11px', fontWeight:700, backgroundColor:c.bg, color:c.text, border:`1px solid ${c.border}`, borderRadius:'5px', whiteSpace:'nowrap' }}>{disp}</span>
                                                                {(_m.contractStatus || _m.workStatus) ? (
                                                                    <span style={{ fontSize:11, whiteSpace:'nowrap', lineHeight:1.2 }} title="자동 2단계 — 계약현황 · 작업현황"><span style={{ color:'#fbbf24' }}>{_m.contractStatus || '–'}</span><span style={{ color:'#64748b' }}> · </span><span style={{ color:'#60a5fa' }}>{_m.workStatus || '–'}</span></span>
                                                                ) : null}
                                                            </div>
                                                        );
                                                    })() : h === assigneeFilterCol ? (normalizeAssignee(val) || <span className="text-slate-700">—</span>) : (val || <span className="text-slate-700">—</span>)}
                                                </td>
                                            );
                                        })}
                                        <td className="px-0.5 py-0 text-left sticky right-0 bg-white group-hover:bg-blue-50 transition-colors shadow-[-2px_0_4px_rgba(0,0,0,0.05)]">
                                            {(() => {
                                                const wKey = row['실행번호'] || row.execNo || '';
                                                const hasLink = wKey && weeklyLinks?.[wKey];
                                                const isActivePanelRow = weeklyPanel?.projectId === wKey;
                                                const projName = row['공사명'] || row['프로젝트명'] || row['Project'] || '';
                                                return (
                                                    <div className="flex items-center justify-center gap-0.5 opacity-40 group-hover:opacity-100">
                                                        {hasLink ? (
                                                            <>
                                                                <button
                                                                    onClick={e => { e.stopPropagation(); isActivePanelRow ? setWeeklyPanel?.(null) : onOpenWeeklyPanel?.(wKey); }}
                                                                    className={`p-1.5 rounded transition-colors ${isActivePanelRow ? 'bg-indigo-500/30 text-indigo-300 ring-1 ring-indigo-400/60' : 'hover:bg-indigo-500/20 text-indigo-400 hover:text-indigo-300'}`}
                                                                    title={isActivePanelRow ? '주간보고 닫기' : `주간보고 열기: ${weeklyLinks[wKey].fileName}`}>
                                                                    <PanelRight size={14}/>
                                                                </button>
                                                                <button
                                                                    onClick={e => { e.stopPropagation(); onWeeklyDownload?.(wKey); }}
                                                                    className="p-1.5 hover:bg-emerald-500/20 rounded text-slate-500 hover:text-emerald-400 transition-colors"
                                                                    title={`주간보고 다운로드: ${weeklyLinks[wKey].fileName}`}>
                                                                    <Download size={13}/>
                                                                </button>
                                                                <button
                                                                    onClick={e => { e.stopPropagation(); onWeeklyUnlink?.(wKey); }}
                                                                    className="p-1.5 hover:bg-rose-500/10 rounded text-slate-500 hover:text-rose-400 transition-colors"
                                                                    title="주간보고 연결 해제">
                                                                    <Link2Off size={13}/>
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <button
                                                                onClick={e => {
                                                                    e.stopPropagation();
                                                                    if (wKey) {
                                                                        // 다른 클라이언트에서도 버튼이 표시되도록 실행번호를 Firebase에 저장
                                                                        if (dataSource !== 'firebase') {
                                                                            const { _id, ...rest } = row;
                                                                            setDoc(rowDocRef(currentTeam, _id), { ...rest, '실행번호': wKey }).catch(() => {});
                                                                        }
                                                                        onOpenWeeklyLinkModal?.(wKey, projName);
                                                                    } else {
                                                                        setAlertMsg('먼저 실행번호를 등록해주세요.');
                                                                    }
                                                                }}
                                                                className="p-1.5 hover:bg-indigo-500/20 rounded text-slate-500 hover:text-indigo-400 transition-colors"
                                                                title={wKey ? '주간보고 연결' : '실행번호 미등록'}>
                                                                <Link size={13}/>
                                                            </button>
                                                        )}
                                                        <button onClick={e => { e.stopPropagation(); confirmSaveRow(row); }}
                                                            className="p-1.5 hover:bg-emerald-500/20 rounded text-slate-500 hover:text-emerald-400 transition-colors"
                                                            title="저장">
                                                            <Save size={13}/>
                                                        </button>
                                                    </div>
                                                );
                                            })()}
                                        </td>
                                    </tr>
                                    );
                                })}
                            </tbody>
                                </>);
                            })()}
                        </table>
                    </div>
                    <div className="px-5 py-2.5 border-t border-slate-800 bg-slate-900/60 flex items-center justify-between text-xs shrink-0">
                        <span className="text-slate-600">
                            표시 <span className="text-slate-300 font-bold">{sortedRows.length}</span> /
                            전체 <span className="text-slate-300 font-bold">{yearFilteredRows.length}</span>행{availableYears.length > 0 ? <span className="text-slate-600"> ({selectedYear}년)</span> : ''} ·
                            주요열 <span className="text-slate-300 font-bold">{mainVisibleHeaders.length}</span> / 전체 {activeHeaders.length}개
                            {selectedRowId && <span className="ml-3 text-violet-400 font-bold">· 행 선택됨 — 프로젝트 추가 시 초기값으로 복사</span>}
                        </span>
                        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-bold ${srcBadge.bg} ${srcBadge.text}`}>
                            {srcBadge.icon}
                            <span>{srcBadge.label}</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProjectListScreen;
