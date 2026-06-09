// =========================================================================
// WeeklyReportScreen - v6.9.0
// v6.8.4: FortuneSheet Immer freeze 오류 수정 (deepClone)
// v6.8.5: 툴바 줌 버튼 동작 수정
// v6.8.6: freeze pane rowlen 클린업으로 스크롤 업 버그 수정
// v6.8.7: DOM 탭 클릭 감지 + 스크롤 강제 리셋 / rowlen 필터 기준 >= 19px
// v6.8.8: FortuneSheet handleGlobalWheel 우회 → document capture 직접 스크롤 제어
// v6.8.9: Ctrl+휠 줌 수정 — FS 내부 zoom 버튼 클릭 방식으로 교체 (setSheets 제거)
// v6.9.0: 저장/취소 기능 + 저장 목록에서 선택 → 바로 열기 (IndexedDB)
// v6.9.1: IDB 저장·로드 시 deepClone으로 sparse array 정규화 → 재로드 크래시 수정
// v6.9.2: cleanSheetsForStore spread 방식으로 데이터 손실 수정 + 진척 탭 기본 활성화
// v6.9.3: 저장 시 data→celldata 변환 + data:[] → 재로드 시 initSheetData 강제 실행으로 크래시 수정
// v6.9.4: Excel 날짜 시리얼 변환 수정 (ct.fa='m/d' + v가 문자열 "46117"인 경우 처리)
// v6.9.5: 원본 Excel 파일 IDB 저장 + 다운로드 시 원본 제공 (수식/날짜 완벽 보존)
// v6.9.6: Excel 구조 분석 모드 추가 (수식·컬럼·진척률 계산 구조 자동 파악)
// =========================================================================
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Workbook } from '@fortune-sheet/react';
import '@fortune-sheet/react/dist/index.css';
import { Upload, LogOut, FileSpreadsheet, Download, ZoomIn, ZoomOut, Save, Trash2, ChevronRight, ArrowLeft, FilePen, CheckCircle, FlaskConical } from 'lucide-react';
import { loadExcelJS, loadFileSaver, loadXLSX, wrIdbAdd, wrIdbPut, wrIdbGet, wrIdbLoadAll, wrIdbDelete } from '../utils';

// ─── LuckyExcel CDN ───────────────────────────────────────────────────────────
const LUCKY_EXCEL_CDN = 'https://cdn.jsdelivr.net/npm/luckyexcel@1.0.1/dist/luckyexcel.umd.js';

async function loadLuckyExcel() {
    if (window.LuckyExcel) return;
    await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = LUCKY_EXCEL_CDN;
        s.crossOrigin = 'anonymous';
        s.onload = res;
        s.onerror = () => rej(new Error('LuckyExcel 로드 실패'));
        document.body.appendChild(s);
    });
}

function deepClone(obj) {
    try { return JSON.parse(JSON.stringify(obj)); } catch (_) { return obj; }
}

const DEFAULT_ROW_HEIGHT = 19;
// 기본으로 활성화할 시트 이름 키워드
const DEFAULT_SHEET_KEYWORD = '진척';

// FortuneSheet onChange의 data 2D 배열 → celldata sparse 포맷으로 변환
// FortuneSheet는 data가 비어있을 때만 initSheetData(celldata → data)를 실행함.
// 저장 시 data를 celldata로 변환하고 data:[] 세팅 → 재로드 시 항상 완전한 초기화 경로 사용.
function dataToCelldata(data) {
    if (!Array.isArray(data)) return [];
    const celldata = [];
    data.forEach((row, r) => {
        if (!Array.isArray(row)) return;
        row.forEach((cell, c) => {
            if (cell != null) celldata.push({ r, c, v: cell });
        });
    });
    return celldata;
}

// Excel 날짜 시리얼 → "M/D" 문자열 변환
// Excel은 날짜를 1900-01-01 기준 정수로 저장 (25569 = 1970-01-01 오프셋)
function excelSerialToDateStr(serial) {
    try {
        const d = new Date((serial - 25569) * 86400 * 1000);
        return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
    } catch (_) { return String(serial); }
}

// Excel 날짜 포맷 코드인지 판별 (LuckyExcel이 ct.fa에 Excel 포맷 코드를 그대로 보존함)
const DATE_FA_RE = /[ymd]/i;   // y/m/d 문자가 포함된 포맷 코드
function isDateFormatCode(fa) {
    if (!fa) return false;
    // 순수 숫자/화폐 포맷 제외 (예: "0.00", "#,##0")
    if (/^[#0,.%$€£¥]+$/.test(fa)) return false;
    return DATE_FA_RE.test(fa);
}

// 셀 오브젝트 하나를 날짜 변환 (celldata / data 공용)
// LuckyExcel은 날짜 값을 숫자(46117) 또는 문자열("46117")로 저장하므로 양쪽 처리
// v는 숫자 유지 (수식 참조/계산 호환), m만 "4/5" 형식으로 변경 (표시용)
function convertCellDate(cell) {
    if (!cell) return cell;
    const numVal = Number(cell.v);
    if (isNaN(numVal) || !Number.isInteger(numVal) || numVal < 1) return cell;
    const isDate = (cell.ct && cell.ct.t === 'd') ||
                   (cell.ct && isDateFormatCode(cell.ct.fa));
    if (!isDate) return cell;
    const dateStr = excelSerialToDateStr(numVal);
    // v: 숫자 시리얼 유지 → 수식에서 날짜 계산 가능
    // m: 표시값만 "4/5" 로 변경
    // ct.fa: 'General' → FortuneSheet가 v로 재포맷하지 않도록
    return { ...cell, v: numVal, m: dateStr, t: 'n', ct: { fa: 'General', t: 'n' } };
}

// LuckyExcel이 변환한 시트에서 날짜 시리얼 셀을 문자열로 변환
// celldata(sparse) 와 data(2D array) 두 형식 모두 처리
function convertExcelDateCells(sheets) {
    if (!Array.isArray(sheets)) return sheets;
    return sheets.map(s => {
        if (!s) return s;

        const celldata = Array.isArray(s.celldata)
            ? s.celldata.map(cd => {
                if (!cd) return cd;
                const converted = convertCellDate(cd.v);
                return converted === cd.v ? cd : { ...cd, v: converted };
            })
            : s.celldata;

        const data = Array.isArray(s.data)
            ? s.data.map(row =>
                Array.isArray(row)
                    ? row.map(cell => convertCellDate(cell))
                    : row
            )
            : s.data;

        return { ...s, celldata, data };
    });
}

// IDB 저장용 정규화
// - JSON 직렬화로 Immer proxy / sparse array 제거
// - data 2D → celldata 변환 + data:[] → 재로드 시 FortuneSheet initSheetData 보장
// - freeze/rowhidden 제거 (스크롤 버그 방지)
function cleanSheetsForStore(rawSheets) {
    let sheets;
    try { sheets = JSON.parse(JSON.stringify(rawSheets)); }
    catch (_) { return []; }
    if (!Array.isArray(sheets)) return [];

    return sheets.map(s => {
        if (!s) return null;

        const cfg = s.config ? { ...s.config } : {};
        delete cfg.frozen;
        delete cfg.freezen;
        delete cfg.rowhidden;
        if (cfg.rowlen) {
            const cleaned = {};
            Object.entries(cfg.rowlen).forEach(([k, v]) => {
                if (Number(v) >= DEFAULT_ROW_HEIGHT) cleaned[k] = v;
            });
            cfg.rowlen = Object.keys(cleaned).length > 0 ? cleaned : undefined;
        }

        // celldata 우선: 이미 있으면 유지, 없으면 data 2D에서 변환
        const celldata = (Array.isArray(s.celldata) && s.celldata.length > 0)
            ? s.celldata
            : dataToCelldata(s.data);

        return {
            ...s,
            celldata,
            data:       [],   // 비워야 FortuneSheet가 initSheetData 실행
            config:     cfg,
            frozen:     undefined,
            scrollTop:  0,
            scrollLeft: 0,
            luckysheet_select_save: undefined,
            filter:     undefined,
            filter_select: undefined,
        };
    });
}

// DEFAULT_SHEET_KEYWORD를 포함하는 시트를 status:1(active)로 설정
function activateDefaultSheet(sheets) {
    if (!Array.isArray(sheets) || sheets.length === 0) return sheets;
    const idx = sheets.findIndex(s => s?.name?.includes(DEFAULT_SHEET_KEYWORD));
    if (idx < 0) return sheets;
    return sheets.map((s, i) => s ? { ...s, status: i === idx ? 1 : 0 } : s);
}

// ─── Excel 구조 분석 ──────────────────────────────────────────────────────────
// XLSX.js로 수식·컬럼 구조·진척률 계산 방식을 자동으로 파악
async function analyzeExcelStructure(arrayBuffer, fileName) {
    const XLSX = await loadXLSX();
    const wb = XLSX.read(arrayBuffer, { type: 'array', cellFormula: true, cellNF: true });
    const sheetNames = wb.SheetNames;

    // 진척률요약 시트 탐색
    const summaryName = sheetNames.find(n => n.includes('진척') || n.toLowerCase().includes('summary'));

    // 진척률요약에서 COUNT/SUM 계열 수식 추출 (진척률 계산 셀 탐색)
    const progressFormulas = [];
    if (summaryName) {
        const ss = wb.Sheets[summaryName];
        const ref = ss['!ref'];
        if (ref) {
            const range = XLSX.utils.decode_range(ref);
            const maxRow = Math.min(range.e.r, 80); // 상위 80행만
            for (let r = range.s.r; r <= maxRow; r++) {
                for (let c = range.s.c; c <= range.e.c; c++) {
                    const addr = XLSX.utils.encode_cell({ r, c });
                    const cell = ss[addr];
                    if (cell?.f && /COUNT|SUM|COUNTA/i.test(cell.f)) {
                        progressFormulas.push({
                            addr,
                            formula: cell.f,
                            display: cell.w ?? (cell.v != null ? String(cell.v) : ''),
                        });
                    }
                }
            }
        }
    }

    // 카테고리 시트 구조 파악
    const categoryNames = sheetNames.filter(n =>
        n !== summaryName &&
        (/^\d+\./.test(n) || ['공조','대기','CDA','SCADA','FFU','만전','화면'].some(k => n.includes(k)))
    );

    const categories = categoryNames.map(name => {
        const sheet = wb.Sheets[name];
        if (!sheet || !sheet['!ref']) return { name, itemCount: 0, headers: [], samples: [] };
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: false });
        const headers = (rows[0] || []).map(h => h != null ? String(h) : '');
        const dataRows = rows.slice(1).filter(r => r?.[4]); // E열(NAME) 존재하는 행
        return {
            name,
            itemCount: dataRows.length,
            headers,
            samples: dataRows.slice(0, 3).map(r => String(r[4] ?? '')),
        };
    });

    return { fileName, sheetNames, summaryName, progressFormulas, categories };
}

function formatSavedAt(iso) {
    try {
        const d = new Date(iso);
        const pad = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch (_) { return iso; }
}

// ─── FortuneSheet → ExcelJS XLSX ─────────────────────────────────────────────
async function exportToXlsx(sheets, fileName) {
    const ExcelJS = await loadExcelJS();
    await loadFileSaver();
    const wb = new ExcelJS.Workbook();
    for (const sheet of (sheets || [])) {
        const ws      = wb.addWorksheet(sheet.name || 'Sheet');
        const data    = sheet.data    || [];
        const config  = sheet.config  || {};
        const merges  = config.merge  || {};
        const colLens = config.columnlen || {};
        const rowLens = config.rowlen    || {};
        Object.entries(colLens).forEach(([ci, w]) => {
            ws.getColumn(Number(ci) + 1).width = Math.max(6, Math.round(w / 7.5));
        });
        data.forEach((row, ri) => {
            if (!row) return;
            if (rowLens[ri]) ws.getRow(ri + 1).height = Math.round(rowLens[ri] * 0.75);
            row.forEach((cell, ci) => {
                if (!cell) return;
                if (cell.mc && (cell.mc.r !== ri || cell.mc.c !== ci)) return;
                const exCell = ws.getCell(ri + 1, ci + 1);
                if (cell.f) {
                    exCell.value = { formula: String(cell.f).replace(/^=/, ''), result: cell.v };
                } else if (cell.v !== undefined && cell.v !== null) {
                    exCell.value = cell.v;
                }
                if (cell.bg) {
                    const hex = String(cell.bg).replace('#', '').toUpperCase();
                    if (hex.length === 6) exCell.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FF'+hex } };
                }
                const fo = {};
                if (cell.bl) fo.bold      = true;
                if (cell.it) fo.italic    = true;
                if (cell.un) fo.underline = true;
                if (cell.fs) fo.size      = Number(cell.fs);
                if (cell.ff) fo.name      = cell.ff;
                if (cell.fc) {
                    const fh = String(cell.fc).replace('#','').toUpperCase();
                    if (fh.length === 6) fo.color = { argb:'FF'+fh };
                }
                if (Object.keys(fo).length) exCell.font = fo;
                const htMap = {0:undefined,1:'left',2:'center',3:'right'};
                const vtMap = {0:undefined,1:'top',2:'middle',3:'bottom'};
                const hA = htMap[cell.ht], vA = vtMap[cell.vt];
                if (hA || vA || cell.tb===2) exCell.alignment = { horizontal:hA, vertical:vA, wrapText:cell.tb===2 };
            });
        });
        Object.values(merges).forEach(m => {
            try { if (m.rs>1||m.cs>1) ws.mergeCells(m.r+1,m.c+1,m.r+m.rs,m.c+m.cs); } catch(_){}
        });
    }
    const buf  = await wb.xlsx.writeBuffer();
    const base = String(fileName).replace(/\.(xlsx?|xls|csv)$/i,'') || 'report';
    window.saveAs(new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),`${base}_편집.xlsx`);
}

// ─── Excel 파일 → FortuneSheet 시트 배열 변환 (공통) ─────────────────────────
// handleFileUpload / handleReloadEdited 양쪽에서 사용
async function excelFileToSheets(file) {
    await loadLuckyExcel();
    const result = await new Promise((resolve, reject) => {
        window.LuckyExcel.transformExcelToLucky(
            file,
            (json) => resolve(json),
            (err)  => reject(new Error(String(err)))
        );
    });
    if (!result?.sheets?.length) throw new Error('시트 데이터가 없습니다.');
    const sheetsWithDates = convertExcelDateCells(result.sheets);
    const clean = deepClone(sheetsWithDates).map(s => {
        const cfg = s.config ? { ...s.config } : {};
        delete cfg.frozen; delete cfg.freezen; delete cfg.rowhidden;
        if (cfg.rowlen) {
            const cl = {};
            Object.entries(cfg.rowlen).forEach(([k, v]) => {
                if (Number(v) >= DEFAULT_ROW_HEIGHT) cl[k] = v;
            });
            cfg.rowlen = Object.keys(cl).length > 0 ? cl : undefined;
        }
        return { ...s, config: cfg, frozen: undefined, scrollTop: 0, scrollLeft: 0,
            luckysheet_select_save: undefined, filter: undefined, filter_select: undefined };
    });
    return activateDefaultSheet(clean);
}

if (!document.getElementById('_wrs_spin')) {
    const st = document.createElement('style');
    st.id = '_wrs_spin';
    st.textContent = '@keyframes _wrsSpin{to{transform:rotate(360deg);}}';
    document.head.appendChild(st);
}

const ZOOM_MIN  = 0.5;
const ZOOM_MAX  = 3.0;
const ZOOM_STEP = 0.1;

// ─── 컴포넌트 ────────────────────────────────────────────────────────────────
const WeeklyReportScreen = ({ onBack }) => {
    // ── 뷰 모드: 'list' = 저장 목록, 'viewer' = FortuneSheet 뷰어 ────────────
    const [mode,         setMode]         = useState('list');
    const [savedReports, setSavedReports] = useState([]);   // IDB에서 로드한 목록
    const [currentId,    setCurrentId]    = useState(null); // 현재 보는 레코드 id (null=미저장)
    const [isUnsaved,    setIsUnsaved]    = useState(false);// 저장 안 된 새 파일 여부
    const [saveSuccess,  setSaveSuccess]  = useState(false);// 저장 완료 토스트

    const [isLoading, setIsLoading] = useState(false);
    const [alertMsg,  setAlertMsg]  = useState('');
    const [fileName,  setFileName]  = useState('');
    const [sheets,    setSheets]    = useState(null);
    const [zoomRatio, setZoomRatio] = useState(1.0);

    const fileInputRef     = useRef(null);
    const sheetsRef        = useRef(null);
    const zoomRef          = useRef(1.0);
    const rootRef          = useRef(null);
    const workbookRef      = useRef(null);
    const originalFileRef  = useRef(null); // 원본 Excel ArrayBuffer (다운로드용)
    const fileHandleRef    = useRef(null); // File System Access API 핸들
    const analyzeInputRef  = useRef(null); // 분석 전용 파일 input

    const [editPending,   setEditPending]   = useState(false); // 엑셀 수정 대기 중
    const [analysisData,  setAnalysisData]  = useState(null);  // 분석 결과

    // ── 마운트 시 저장 목록 로드 ──────────────────────────────────────────────
    const refreshList = useCallback(() => {
        wrIdbLoadAll()
            .then(all => setSavedReports(all.sort((a, b) => b.savedAt.localeCompare(a.savedAt))))
            .catch(err => console.error('[WeeklyReport] IDB load error', err));
    }, []);

    useEffect(() => { refreshList(); }, [refreshList]);

    // ── 툴바 줌 버튼용 ────────────────────────────────────────────────────────
    const applyZoom = useCallback((newZoom) => {
        newZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(newZoom * 10) / 10));
        zoomRef.current = newZoom;
        setZoomRatio(newZoom);
        const src = sheetsRef.current;
        if (!src) return;
        setSheets(deepClone(src).map(s => ({ ...s, zoomRatio: newZoom })));
    }, []);

    // ── 탭 클릭 → 스크롤 강제 리셋 ───────────────────────────────────────────
    useEffect(() => {
        if (mode !== 'viewer' || !sheets) return;
        const handleTabClick = (e) => {
            const tab = e.target.closest('.luckysheet-sheets-item');
            if (!tab) return;
            if (tab.classList.contains('luckysheet-sheets-item-active')) return;
            const doReset = () => {
                const scrollbarY = document.querySelector('.luckysheet-scrollbar-y');
                if (scrollbarY) scrollbarY.scrollTop = 0;
                try { workbookRef.current?.scroll({ scrollTop: 0, scrollLeft: 0 }); } catch (_) {}
            };
            setTimeout(doReset, 50);
            setTimeout(doReset, 300);
        };
        document.addEventListener('click', handleTabClick, true);
        return () => document.removeEventListener('click', handleTabClick, true);
    }, [mode, sheets]);

    // ── 휠 통합 핸들러 (document capture) ────────────────────────────────────
    useEffect(() => {
        if (mode !== 'viewer' || !sheets) return;
        const onWheel = (e) => {
            if (e.ctrlKey) {
                e.preventDefault();
                e.stopImmediatePropagation();
                const btns = document.querySelectorAll('.fortune-zoom-container > .fortune-zoom-button');
                if (e.deltaY < 0) {
                    const newZoom = Math.min(ZOOM_MAX, Math.round((zoomRef.current + ZOOM_STEP) * 10) / 10);
                    if (newZoom !== zoomRef.current) { btns[1]?.click(); zoomRef.current = newZoom; setZoomRatio(newZoom); }
                } else if (e.deltaY > 0) {
                    const newZoom = Math.max(ZOOM_MIN, Math.round((zoomRef.current - ZOOM_STEP) * 10) / 10);
                    if (newZoom !== zoomRef.current) { btns[0]?.click(); zoomRef.current = newZoom; setZoomRatio(newZoom); }
                }
                return;
            }
            const container = document.querySelector('.fortune-sheet-container');
            if (!container || !container.contains(e.target)) return;
            e.stopImmediatePropagation();
            e.preventDefault();
            if (e.deltaY !== 0) {
                const sbY = document.querySelector('.luckysheet-scrollbar-y');
                if (sbY) sbY.scrollTop += e.deltaY;
            }
            if (e.deltaX !== 0) {
                const sbX = document.querySelector('.luckysheet-scrollbar-x');
                if (sbX) sbX.scrollLeft += e.deltaX;
            }
        };
        document.addEventListener('wheel', onWheel, { passive: false, capture: true });
        return () => document.removeEventListener('wheel', onWheel, { capture: true });
    }, [mode, sheets]);

    // ── FortuneSheet onChange ─────────────────────────────────────────────────
    const handleChange = useCallback((data) => { sheetsRef.current = data; }, []);

    // ── 파일 업로드 → 뷰어 전환 ──────────────────────────────────────────────
    const handleFileUpload = useCallback(async (e) => {
        const file = e.target?.files?.[0];
        if (!file) return;
        setIsLoading(true);
        try {
            originalFileRef.current = await file.arrayBuffer();
            const withDefault = await excelFileToSheets(file);
            sheetsRef.current = withDefault;
            setSheets(withDefault);
            setFileName(file.name);
            zoomRef.current = 1.0;
            setZoomRatio(1.0);
            setCurrentId(null);
            setIsUnsaved(true);
            setEditPending(false);
            fileHandleRef.current = null;
            setMode('viewer');
        } catch (err) {
            setAlertMsg(`파일 오류:\n${err.message}`);
        } finally {
            setIsLoading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    }, []);

    // ── 엑셀 수정 버튼 ────────────────────────────────────────────────────────
    const handleOpenInExcel = useCallback(async () => {
        if (!originalFileRef.current) {
            setAlertMsg('원본 파일이 없습니다.\n먼저 [저장] 버튼으로 저장해 주세요.');
            return;
        }
        // 케이스 A: showOpenFilePicker로 업로드 → 원본 위치 이미 앎 → 바로 대기 모드
        if (fileHandleRef.current) {
            setEditPending(true);
            return;
        }
        // 케이스 B: input/DnD 업로드 → 원본 위치 모름 → showSaveFilePicker로 저장 위치 지정
        if (!window.showSaveFilePicker) {
            handleDownload();
            setAlertMsg('이 브라우저는 자동 반영 기능을 지원하지 않습니다.\n수정 후 [수정본 업로드] 버튼을 사용해 주세요.');
            return;
        }
        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: fileName,
                types: [{ description: 'Excel 파일',
                    accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }],
            });
            const writable = await handle.createWritable();
            await writable.write(new Blob([originalFileRef.current]));
            await writable.close();
            fileHandleRef.current = handle;
            setEditPending(true);
        } catch (err) {
            if (err.name !== 'AbortError') setAlertMsg(`저장 오류:\n${err.message}`);
        }
    }, [fileName]);

    // ── 수정 완료: 저장된 위치에서 파일 다시 읽기 ───────────────────────────
    const handleReloadEdited = useCallback(async () => {
        const handle = fileHandleRef.current;
        if (!handle) return;
        setIsLoading(true);
        try {
            const perm = await handle.queryPermission({ mode: 'read' });
            if (perm !== 'granted') await handle.requestPermission({ mode: 'read' });
            const file = await handle.getFile();
            originalFileRef.current = await file.arrayBuffer();
            const withDefault = await excelFileToSheets(file);
            sheetsRef.current = withDefault;
            setSheets(withDefault);
            setFileName(file.name);
            zoomRef.current = 1.0;
            setZoomRatio(1.0);
            setIsUnsaved(true);
            setEditPending(false);
            fileHandleRef.current = null;
        } catch (err) {
            setAlertMsg(`수정본 반영 오류:\n${err.message}`);
        } finally {
            setIsLoading(false);
        }
    }, []);

    // ── 저장된 보고서 열기 (sheets + fileBlob은 wrIdbGet으로 로드) ────────────
    const handleOpenSaved = useCallback(async (reportMeta) => {
        setIsLoading(true);
        try {
            const report = await wrIdbGet(reportMeta.id);
            if (!report) throw new Error('보고서를 찾을 수 없습니다.');
            const sheets = activateDefaultSheet(cleanSheetsForStore(report.sheets));
            originalFileRef.current = report.fileBlob || null;
            sheetsRef.current = sheets;
            setSheets(sheets);
            setFileName(report.fileName);
            zoomRef.current = 1.0;
            setZoomRatio(1.0);
            setCurrentId(report.id);
            setIsUnsaved(false);
            setMode('viewer');
        } catch (err) {
            setAlertMsg(`열기 오류:\n${err.message}`);
        } finally {
            setIsLoading(false);
        }
    }, []);

    // ── IDB 저장 (신규 또는 덮어쓰기) ────────────────────────────────────────
    const handleSave = useCallback(async () => {
        const data = sheetsRef.current;
        if (!data) return;
        setIsLoading(true);
        try {
            const cleanData = cleanSheetsForStore(data);
            const blob = originalFileRef.current || null;
            if (currentId == null) {
                const newId = await wrIdbAdd(fileName, cleanData, blob);
                setCurrentId(newId);
                setIsUnsaved(false);
            } else {
                await wrIdbPut(currentId, fileName, cleanData, blob);
            }
            refreshList();
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 2000);
        } catch (err) {
            setAlertMsg(`저장 오류:\n${err.message}`);
        } finally {
            setIsLoading(false);
        }
    }, [currentId, fileName, refreshList]);

    // ── 취소: 목록으로 (미저장 파일 폐기) ────────────────────────────────────
    const handleCancel = useCallback(() => {
        setSheets(null);
        setFileName('');
        sheetsRef.current       = null;
        originalFileRef.current = null;
        fileHandleRef.current   = null;
        setCurrentId(null);
        setIsUnsaved(false);
        setEditPending(false);
        setMode('list');
    }, []);

    // ── Excel 구조 분석 ───────────────────────────────────────────────────────
    const handleAnalyzeFile = useCallback(async (e) => {
        const file = e.target?.files?.[0];
        if (!file) return;
        setIsLoading(true);
        try {
            const ab = await file.arrayBuffer();
            const result = await analyzeExcelStructure(ab, file.name);
            setAnalysisData(result);
            setMode('analyze');
        } catch (err) {
            setAlertMsg(`분석 오류:\n${err.message}`);
        } finally {
            setIsLoading(false);
            if (analyzeInputRef.current) analyzeInputRef.current.value = '';
        }
    }, []);

    // ── 목록에서 삭제 ─────────────────────────────────────────────────────────
    const handleDeleteSaved = useCallback(async (id, e) => {
        e.stopPropagation();
        try {
            await wrIdbDelete(id);
            setSavedReports(prev => prev.filter(r => r.id !== id));
        } catch (err) {
            setAlertMsg(`삭제 오류:\n${err.message}`);
        }
    }, []);

    // ── 목록에서 바로 다운로드 ───────────────────────────────────────────────
    const handleDownloadFromList = useCallback(async (reportMeta, e) => {
        e.stopPropagation();
        setIsLoading(true);
        try {
            const report = await wrIdbGet(reportMeta.id);
            if (!report?.fileBlob) throw new Error('원본 파일이 없습니다.\n뷰어에서 열어 다시 저장해 주세요.');
            const blob = new Blob([report.fileBlob], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            });
            const url = URL.createObjectURL(blob);
            const a   = document.createElement('a');
            a.href     = url;
            a.download = report.fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            setAlertMsg(err.message);
        } finally {
            setIsLoading(false);
        }
    }, []);

    const handleDownload = useCallback(async () => {
        // 원본 파일이 있으면 그대로 다운로드 (수식·날짜 완벽 보존)
        if (originalFileRef.current) {
            const blob = new Blob([originalFileRef.current], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            });
            const url = URL.createObjectURL(blob);
            const a   = document.createElement('a');
            a.href     = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            return;
        }
        // 원본 없으면 현재 FortuneSheet 데이터로 재구성
        const data = sheetsRef.current;
        if (!data) return;
        setIsLoading(true);
        try {
            await exportToXlsx(data, fileName);
        } catch (err) {
            setAlertMsg(`다운로드 오류:\n${err.message}`);
        } finally {
            setIsLoading(false);
        }
    }, [fileName]);

    const handleDrop = useCallback((e) => {
        e.preventDefault();
        const file = e.dataTransfer?.files?.[0];
        if (file) handleFileUpload({ target:{ files:[file] } });
    }, [handleFileUpload]);

    // ── 파일 선택 (showOpenFilePicker 우선, 미지원 시 input 폴백) ───────────
    const openPicker = useCallback(async () => {
        if (window.showOpenFilePicker) {
            try {
                const [handle] = await window.showOpenFilePicker({
                    types: [{ description: 'Excel 파일',
                        accept: {
                            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
                            'application/vnd.ms-excel': ['.xls'],
                        }
                    }],
                    multiple: false,
                });
                setIsLoading(true);
                try {
                    const file = await handle.getFile();
                    originalFileRef.current = await file.arrayBuffer();
                    const withDefault = await excelFileToSheets(file);
                    fileHandleRef.current = handle; // 원본 위치 기억
                    sheetsRef.current = withDefault;
                    setSheets(withDefault);
                    setFileName(file.name);
                    zoomRef.current = 1.0;
                    setZoomRatio(1.0);
                    setCurrentId(null);
                    setIsUnsaved(true);
                    setEditPending(false);
                    setMode('viewer');
                } catch (err) {
                    setAlertMsg(`파일 오류:\n${err.message}`);
                } finally {
                    setIsLoading(false);
                }
            } catch (err) {
                if (err.name !== 'AbortError') setAlertMsg(`오류:\n${err.message}`);
            }
        } else {
            if (fileInputRef.current) { fileInputRef.current.value = ''; fileInputRef.current.click(); }
        }
    }, []);

    // =========================================================================
    // 공통 오버레이 (로딩 / 알림)
    // =========================================================================
    const Overlays = (
        <>
            {isLoading && (
                <div style={{position:'fixed',inset:0,zIndex:999,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:'rgba(2,6,23,0.88)',backdropFilter:'blur(4px)'}}>
                    <div style={{width:52,height:52,border:'4px solid #6366f1',borderTopColor:'transparent',borderRadius:'50%',animation:'_wrsSpin 0.8s linear infinite',marginBottom:14}}/>
                    <p style={{color:'white',fontWeight:'bold',fontSize:16}}>처리 중...</p>
                </div>
            )}
            {alertMsg && (
                <div style={{position:'fixed',inset:0,zIndex:400,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(2,6,23,0.8)'}}>
                    <div style={{background:'#0f172a',border:'1px solid #334155',padding:28,borderRadius:20,maxWidth:380,width:'90%',textAlign:'center'}}>
                        <p style={{color:'white',fontWeight:'bold',marginBottom:20,lineHeight:1.6,whiteSpace:'pre-line'}}>{alertMsg}</p>
                        <button onClick={()=>setAlertMsg('')} style={{padding:'10px 24px',background:'#4f46e5',color:'white',border:'none',borderRadius:10,fontWeight:'bold',width:'100%',cursor:'pointer'}}>확인</button>
                    </div>
                </div>
            )}
            {saveSuccess && (
                <div style={{position:'fixed',bottom:28,left:'50%',transform:'translateX(-50%)',zIndex:500,
                    background:'#064e3b',border:'1px solid #10b981',color:'#6ee7b7',
                    padding:'10px 24px',borderRadius:12,fontWeight:'bold',fontSize:13,pointerEvents:'none'}}>
                    저장 완료
                </div>
            )}
        </>
    );

    // =========================================================================
    // 분석 화면
    // =========================================================================
    if (mode === 'analyze' && analysisData) {
        const { fileName: aFile, sheetNames, summaryName, progressFormulas, categories } = analysisData;
        return (
            <div ref={rootRef} className="h-screen flex flex-col bg-slate-950 text-white overflow-hidden">
                {Overlays}
                <header className="flex items-center justify-between gap-2 px-4 py-2.5 bg-slate-900/95 border-b border-slate-800 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-emerald-500/20 rounded-xl border border-emerald-500/30 text-emerald-400 flex"><FlaskConical size={18}/></div>
                        <div>
                            <div className="font-bold text-sm">구조 분석</div>
                            <div className="text-[11px] text-slate-500 truncate max-w-xs">{aFile}</div>
                        </div>
                    </div>
                    <Btn color="#64748b" onClick={() => setMode('list')}><ArrowLeft size={13}/> 목록으로</Btn>
                </header>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    <div className="max-w-4xl mx-auto space-y-6">

                        {/* 시트 구성 */}
                        <Section title="시트 구성">
                            <div className="flex flex-wrap gap-2">
                                {sheetNames.map(n => (
                                    <span key={n} style={{
                                        padding:'3px 10px', borderRadius:8, fontSize:12, fontWeight:'bold',
                                        background: n === summaryName ? '#065f46' : '#1e293b',
                                        border: `1px solid ${n === summaryName ? '#10b981' : '#334155'}`,
                                        color: n === summaryName ? '#6ee7b7' : '#94a3b8',
                                    }}>{n}{n === summaryName ? ' ★' : ''}</span>
                                ))}
                            </div>
                        </Section>

                        {/* 진척률요약 수식 */}
                        <Section title={`진척률 계산 수식 (${summaryName ?? '미감지'})`}>
                            {progressFormulas.length === 0
                                ? <p className="text-slate-500 text-sm">COUNT/SUM 계열 수식을 찾지 못했습니다.</p>
                                : (
                                    <div className="overflow-x-auto">
                                        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                                            <thead>
                                                <tr style={{borderBottom:'1px solid #334155',color:'#64748b'}}>
                                                    <th style={{padding:'6px 10px',textAlign:'left',width:60}}>셀</th>
                                                    <th style={{padding:'6px 10px',textAlign:'left'}}>수식</th>
                                                    <th style={{padding:'6px 10px',textAlign:'right',width:80}}>현재값</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {progressFormulas.map((f, i) => (
                                                    <tr key={i} style={{borderBottom:'1px solid #1e293b'}}>
                                                        <td style={{padding:'5px 10px',color:'#f59e0b',fontWeight:'bold'}}>{f.addr}</td>
                                                        <td style={{padding:'5px 10px',color:'#7dd3fc',fontFamily:'monospace',wordBreak:'break-all'}}>{f.formula}</td>
                                                        <td style={{padding:'5px 10px',color:'#86efac',textAlign:'right'}}>{f.display}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )
                            }
                        </Section>

                        {/* 카테고리 시트 구조 */}
                        <Section title="카테고리 시트 구조">
                            {categories.length === 0
                                ? <p className="text-slate-500 text-sm">카테고리 시트를 감지하지 못했습니다.</p>
                                : (
                                    <div className="space-y-3">
                                        {categories.map(cat => (
                                            <div key={cat.name} style={{background:'#0f172a',border:'1px solid #1e293b',borderRadius:12,padding:'12px 16px'}}>
                                                <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:8}}>
                                                    <span style={{fontWeight:'bold',fontSize:13,color:'#e2e8f0'}}>{cat.name}</span>
                                                    <span style={{fontSize:11,padding:'2px 8px',background:'#1e3a5f',border:'1px solid #3b82f6',borderRadius:6,color:'#93c5fd'}}>
                                                        {cat.itemCount}개 항목
                                                    </span>
                                                </div>
                                                <div style={{fontSize:11,color:'#475569',marginBottom:4}}>
                                                    헤더: {cat.headers.filter(Boolean).slice(0,12).join(' | ')}
                                                </div>
                                                <div style={{fontSize:11,color:'#64748b'}}>
                                                    샘플: {cat.samples.join(', ')}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )
                            }
                        </Section>

                    </div>
                </div>
            </div>
        );
    }

    // =========================================================================
    // 목록 화면
    // =========================================================================
    if (mode === 'list') {
        return (
            <div ref={rootRef} className="h-screen flex flex-col bg-slate-950 text-white overflow-hidden">
                {Overlays}
                <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".xlsx,.xls" className="hidden"/>
                <input type="file" ref={analyzeInputRef} onChange={handleAnalyzeFile} accept=".xlsx,.xls" className="hidden"/>

                {/* 헤더 */}
                <header className="flex items-center justify-between gap-2 px-4 py-2.5 bg-slate-900/95 border-b border-slate-800 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-500/20 rounded-xl border border-indigo-500/30 text-indigo-400 flex">
                            <FileSpreadsheet size={18}/>
                        </div>
                        <div>
                            <div className="font-bold text-sm">주간 보고</div>
                            <div className="text-[11px] text-slate-500">저장된 보고서 {savedReports.length}건</div>
                        </div>
                    </div>
                    <Btn color="#64748b" onClick={onBack}><LogOut size={13}/> 나가기</Btn>
                </header>

                {/* 목록 콘텐츠 */}
                <div className="flex-1 overflow-y-auto p-6">
                    <div className="max-w-2xl mx-auto">

                        {/* 구조 분석 카드 */}
                        <div onClick={() => { analyzeInputRef.current.value=''; analyzeInputRef.current.click(); }}
                            className="w-full flex items-center gap-4 p-5 mb-3 bg-slate-900/50 border-2 border-dashed border-slate-700 hover:border-emerald-500/60 hover:bg-emerald-950/20 rounded-2xl cursor-pointer transition-all group">
                            <div className="p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20 group-hover:bg-emerald-500/20 transition-colors shrink-0">
                                <FlaskConical size={20} className="text-emerald-400"/>
                            </div>
                            <div>
                                <div className="text-white font-bold text-sm group-hover:text-emerald-300 transition-colors">구조 분석</div>
                                <div className="text-slate-500 text-xs mt-0.5">Excel 수식·컬럼 구조를 자동으로 분석합니다</div>
                            </div>
                            <ChevronRight size={16} className="text-slate-600 group-hover:text-emerald-400 ml-auto transition-colors"/>
                        </div>

                        {/* 새 파일 업로드 카드 */}
                        <div onClick={openPicker} onDragOver={e=>e.preventDefault()} onDrop={handleDrop}
                            className="w-full flex items-center gap-4 p-5 mb-6 bg-slate-900/50 border-2 border-dashed border-slate-700 hover:border-indigo-500/60 hover:bg-indigo-950/20 rounded-2xl cursor-pointer transition-all group">
                            <div className="p-3 bg-indigo-500/10 rounded-xl border border-indigo-500/20 group-hover:bg-indigo-500/20 transition-colors shrink-0">
                                <Upload size={20} className="text-indigo-400"/>
                            </div>
                            <div>
                                <div className="text-white font-bold text-sm group-hover:text-indigo-300 transition-colors">새 파일 업로드</div>
                                <div className="text-slate-500 text-xs mt-0.5">클릭하거나 파일을 끌어다 놓으세요 · .xlsx · .xls</div>
                            </div>
                            <ChevronRight size={16} className="text-slate-600 group-hover:text-indigo-400 ml-auto transition-colors"/>
                        </div>

                        {/* 저장된 보고서 목록 */}
                        {savedReports.length === 0 ? (
                            <div className="text-center text-slate-600 text-sm py-12">
                                저장된 보고서가 없습니다.<br/>파일을 업로드하고 저장해 보세요.
                            </div>
                        ) : (
                            <div className="flex flex-col gap-2">
                                <div className="text-xs text-slate-500 font-bold mb-1 px-1">저장된 보고서</div>
                                {savedReports.map(r => (
                                    <div key={r.id} onClick={() => handleOpenSaved(r)}
                                        className="flex items-center gap-4 p-4 bg-slate-900/50 border border-slate-800 hover:border-indigo-500/50 hover:bg-indigo-950/20 rounded-xl cursor-pointer transition-all group">
                                        <div className="p-2 bg-slate-800 rounded-lg group-hover:bg-indigo-500/20 transition-colors shrink-0">
                                            <FileSpreadsheet size={16} className="text-indigo-400"/>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-white text-sm font-bold truncate group-hover:text-indigo-300 transition-colors">
                                                {r.fileName}
                                            </div>
                                            <div className="text-slate-500 text-xs mt-0.5">저장: {formatSavedAt(r.savedAt)}</div>
                                        </div>
                                        <ChevronRight size={14} className="text-slate-600 group-hover:text-indigo-400 transition-colors shrink-0"/>
                                        <button
                                            onClick={(e) => handleDownloadFromList(r, e)}
                                            title="엑셀 다운로드"
                                            style={{background:'none',border:'none',cursor:'pointer',color:'#475569',padding:6,display:'flex',borderRadius:6,flexShrink:0}}
                                            onMouseEnter={e=>e.currentTarget.style.color='#10b981'}
                                            onMouseLeave={e=>e.currentTarget.style.color='#475569'}
                                        >
                                            <Download size={14}/>
                                        </button>
                                        <button
                                            onClick={(e) => handleDeleteSaved(r.id, e)}
                                            title="삭제"
                                            style={{background:'none',border:'none',cursor:'pointer',color:'#475569',padding:6,display:'flex',borderRadius:6,flexShrink:0}}
                                            onMouseEnter={e=>e.currentTarget.style.color='#ef4444'}
                                            onMouseLeave={e=>e.currentTarget.style.color='#475569'}
                                        >
                                            <Trash2 size={14}/>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // =========================================================================
    // 뷰어 화면
    // =========================================================================
    return (
        <div ref={rootRef} className="h-screen flex flex-col bg-slate-950 text-white overflow-hidden">
            {Overlays}
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".xlsx,.xls" className="hidden"/>

            {/* 툴바 */}
            <header className="flex items-center justify-between gap-2 px-4 py-2.5 bg-slate-900/95 border-b border-slate-800 shrink-0 flex-wrap">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-500/20 rounded-xl border border-indigo-500/30 text-indigo-400 flex">
                        <FileSpreadsheet size={18}/>
                    </div>
                    <div>
                        <div className="font-bold text-sm flex items-center gap-2">
                            주간 보고
                            {isUnsaved && (
                                <span style={{fontSize:10,padding:'1px 7px',background:'#78350f',border:'1px solid #d97706',color:'#fcd34d',borderRadius:6,fontWeight:'bold'}}>
                                    미저장
                                </span>
                            )}
                        </div>
                        <div className="text-[11px] text-slate-500">
                            <span className="text-indigo-400">{fileName}</span>
                        </div>
                    </div>
                </div>
                <div className="flex gap-2 items-center flex-wrap">
                    {/* 줌 컨트롤 */}
                    <div className="flex items-center gap-1 px-2 py-1 bg-slate-800/60 border border-slate-700 rounded-lg">
                        <button onClick={()=>applyZoom(zoomRef.current - ZOOM_STEP)} disabled={zoomRatio<=ZOOM_MIN}
                            style={{background:'none',border:'none',cursor:zoomRatio<=ZOOM_MIN?'not-allowed':'pointer',color:zoomRatio<=ZOOM_MIN?'#475569':'#94a3b8',padding:'2px',display:'flex'}}>
                            <ZoomOut size={14}/>
                        </button>
                        <span style={{fontSize:11,fontWeight:'bold',color:'#94a3b8',minWidth:36,textAlign:'center'}}>
                            {Math.round(zoomRatio * 100)}%
                        </span>
                        <button onClick={()=>applyZoom(zoomRef.current + ZOOM_STEP)} disabled={zoomRatio>=ZOOM_MAX}
                            style={{background:'none',border:'none',cursor:zoomRatio>=ZOOM_MAX?'not-allowed':'pointer',color:zoomRatio>=ZOOM_MAX?'#475569':'#94a3b8',padding:'2px',display:'flex'}}>
                            <ZoomIn size={14}/>
                        </button>
                    </div>

                    {editPending ? (
                        <Btn color="#10b981" onClick={handleReloadEdited}>
                            <CheckCircle size={13}/> 수정 완료 - 반영
                        </Btn>
                    ) : (
                        <Btn color="#0ea5e9" onClick={handleOpenInExcel}>
                            <FilePen size={13}/> 엑셀 수정
                        </Btn>
                    )}
                    <Btn color="#10b981" onClick={handleDownload}><Download size={13}/> 다운로드</Btn>
                    <Btn color="#6366f1" onClick={openPicker}><Upload size={13}/> 수정본 업로드</Btn>

                    {/* 저장 버튼 */}
                    <Btn color="#f59e0b" onClick={handleSave}>
                        <Save size={13}/> {isUnsaved ? '저장' : '다시 저장'}
                    </Btn>

                    {/* 목록으로 / 취소 */}
                    {isUnsaved ? (
                        <Btn color="#ef4444" onClick={handleCancel}><ArrowLeft size={13}/> 취소</Btn>
                    ) : (
                        <Btn color="#64748b" onClick={handleCancel}><ArrowLeft size={13}/> 목록으로</Btn>
                    )}
                </div>
            </header>

            {/* 엑셀 수정 대기 배너 */}
            {editPending && (
                <div style={{background:'#0c4a6e',borderBottom:'1px solid #0ea5e9',padding:'8px 20px',
                    display:'flex',alignItems:'center',gap:10,fontSize:12,color:'#bae6fd',flexShrink:0}}>
                    <CheckCircle size={14} style={{color:'#38bdf8',flexShrink:0}}/>
                    <span>
                        {fileHandleRef.current
                            ? <><b style={{color:'#fff'}}>{fileName}</b> — 파일 탐색기에서 Excel로 열어 수정·저장 후 <b style={{color:'#38bdf8'}}>[수정 완료 - 반영]</b> 버튼을 클릭하세요.</>
                            : <><b style={{color:'#fff'}}>{fileName}</b> 이(가) 저장되었습니다. Excel에서 열어 수정·저장 후 <b style={{color:'#38bdf8'}}>[수정 완료 - 반영]</b> 버튼을 클릭하세요.</>
                        }
                    </span>
                    <button onClick={() => { setEditPending(false); fileHandleRef.current = null; }}
                        style={{marginLeft:'auto',background:'none',border:'none',color:'#7dd3fc',
                        cursor:'pointer',fontSize:11,padding:'2px 8px',borderRadius:4}}>
                        취소
                    </button>
                </div>
            )}

            {/* 뷰어 콘텐츠 */}
            <div className="flex-1 relative overflow-hidden">
                <div style={{position:'absolute',top:0,left:0,right:0,bottom:0}}>
                    <Workbook
                        ref={workbookRef}
                        data={sheets}
                        onChange={handleChange}
                        style={{width:'100%',height:'100%'}}
                        showToolbar={true}
                        showFormulaBar={true}
                        showSheetTabs={true}
                        allowEdit={true}
                        lang="en"
                    />
                </div>
            </div>
        </div>
    );
};

const Section = ({ title, children }) => (
    <div>
        <div style={{fontSize:11,fontWeight:'bold',color:'#64748b',letterSpacing:'0.08em',
            textTransform:'uppercase',marginBottom:10,paddingBottom:6,
            borderBottom:'1px solid #1e293b'}}>
            {title}
        </div>
        {children}
    </div>
);

const Btn = ({ color, onClick, disabled, children }) => {
    const [hover, setHover] = useState(false);
    return (
        <button onClick={onClick} disabled={disabled}
            onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)}
            style={{
                display:'flex',alignItems:'center',gap:6,padding:'6px 14px',borderRadius:10,
                border:`1px solid ${color}66`,background:hover&&!disabled?color:`${color}22`,
                color:hover&&!disabled?'white':disabled?'#475569':color,
                fontSize:12,fontWeight:'bold',cursor:disabled?'not-allowed':'pointer',
                transition:'all 0.15s',whiteSpace:'nowrap',
            }}>{children}</button>
    );
};

export default WeeklyReportScreen;
