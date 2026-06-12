import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { X, Minus, BarChart2, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { doc, getDoc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db, appId } from '../firebase';

const SIMPLE_ITEMS = [
    { key: 'drawing',  label: '도면입수',     color: '#3b82f6' },
    { key: 'iomap',    label: 'I/O Map 입수', color: '#8b5cf6' },
    { key: 'screen',   label: '화면작성',     color: '#06b6d4' },
    { key: 'baseinfo', label: '기준정보생성', color: '#f59e0b' },
];
const SECONDARY_ITEMS = [
    { key: 'plc',  label: 'PLC',  color: '#6366f1' },
    { key: 'etos', label: 'ETOS', color: '#0891b2' },
    { key: 'hmi',  label: 'HMI',  color: '#7c3aed' },
];
const WEEKLY_ITEMS = [
    { key: 'commissioning',    label: '자체시운전', color: '#10b981' },
    { key: 'intCommissioning', label: '통합시운전', color: '#f43f5e' },
];

function weeksInMonth(year, month) {
    return new Date(year, month, 0).getDate() >= 29 ? [1,2,3,4,5] : [1,2,3,4];
}
function genMonths(sy, sm, ey, em) {
    const r = []; let y = sy, m = sm;
    while (y < ey || (y === ey && m <= em)) {
        r.push({ year: y, month: m });
        if (++m > 12) { m = 1; y++; }
    }
    return r;
}
function isCurrentWeek(year, month, week) {
    const now = new Date();
    return now.getFullYear() === year && (now.getMonth()+1) === month && Math.ceil(now.getDate()/7) === week;
}
function addMonths(y, m, n) {
    let rm = m + n, ry = y;
    while (rm > 12) { rm -= 12; ry++; }
    while (rm < 1)  { rm += 12; ry--; }
    return { y: ry, m: rm };
}

const LABEL_COL_W = 110;
const TYPE_COL_W  = 44;
const TOTAL_COL_W = 70;
const BORDER   = '1px solid #dde3ea';
const BORDER_D = '1px solid #eaecef';

const TH = { padding: '5px 4px', borderRight: BORDER, borderBottom: BORDER, borderTop: 'none', borderLeft: 'none', textAlign: 'center', fontWeight: 700, color: '#64748b', whiteSpace: 'nowrap', background: '#f8fafc', fontSize: 11 };
const TD = { padding: 0, borderRight: BORDER_D, borderBottom: BORDER_D, borderTop: 'none', borderLeft: 'none', textAlign: 'center', background: '#f8fafc' };

const ProgressModal = ({ row, team, onClose, subRows = [], weeklyLinks, getWeeklyReport, parseWeekly, baseDate = '', onApplyToMonthly, onProgressSaved }) => {
    const now0 = new Date();
    const cy0 = now0.getFullYear(), cm0 = now0.getMonth() + 1;

    // 표시 범위: 기본=이번 달+지난달(2개월), '전체 기간 보기'=±6개월. 데이터·합계는 그대로, 보이는 칸만 바뀜
    const [showAllMonths, setShowAllMonths] = useState(false);

    // 계산(누적·진척률)용 전체 범위 ±6개월 — 보기 범위와 무관하게 항상 고정 (합계·누적이 정확하도록)
    const { y: allPy, m: allPm } = addMonths(cy0, cm0, -6);
    const { y: allNy, m: allNm } = addMonths(cy0, cm0, 6);
    const ALL_MONTHS = genMonths(allPy, allPm, allNy, allNm);
    const ALL_WEEKS  = ALL_MONTHS.flatMap(({ year, month }) =>
        weeksInMonth(year, month).map(w => ({ year, month, week: w, key: `${year}-${month}-${w}` }))
    );

    // 화면 표시용 범위 (기본 2개월 / 전체보기 ±6개월) — 렌더링에만 사용
    const { y: pm6y, m: pm6m } = addMonths(cy0, cm0, showAllMonths ? -6 : -1);
    const { y: nm6y, m: nm6m } = addMonths(cy0, cm0, showAllMonths ?  6 :  0);
    const DISP_MONTHS = genMonths(pm6y, pm6m, nm6y, nm6m);
    const DISP_WEEKS  = DISP_MONTHS.flatMap(({ year, month }) =>
        weeksInMonth(year, month).map(w => ({ year, month, week: w, key: `${year}-${month}-${w}` }))
    );

    const totalLabelW = LABEL_COL_W + TYPE_COL_W;
    const weekColW    = 44;
    // 표시 테이블 너비
    const tableW      = DISP_WEEKS.length * weekColW + totalLabelW + TOTAL_COL_W;
    // 모달 뷰포트: 보이는 주차에 맞추되 최대 ≈13주(전체보기 시 가로 스크롤)
    const visWeekCnt  = Math.min(DISP_WEEKS.length, Math.round(3 * 4.4));
    const visW        = visWeekCnt * weekColW + totalLabelW + TOTAL_COL_W;
    const progressPanelW = visW + 48;
    const wSummaryPanelW = 520;

    const [pos,        setPos]        = useState({ x: Math.max(20, (window.innerWidth - progressPanelW) / 2), y: 50 });
    const [minimized,  setMinimized]  = useState(false);
    const [weeklyData, setWeeklyData] = useState({});
    const [savedWeekly,setSavedWeekly]= useState({});
    const [saving,     setSaving]     = useState(false);
    const [dirty,      setDirty]      = useState(false);
    const [pmsData,    setPmsData]    = useState(null);
    const [reloading,  setReloading]  = useState(false);
    const [wSummary,   setWSummary]   = useState(null);

    const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate()-n); return d.toISOString().split('T')[0]; };
    const [wDates,    setWDates]    = useState({ d1: daysAgo(14), d2: daysAgo(7), d3: new Date().toISOString().split('T')[0] });
    const [wApplying, setWApplying] = useState(false);
    const [wApplyMsg, setWApplyMsg] = useState('');
    const [showWPanel,setShowWPanel]= useState(false);
    const [applyConfirm, setApplyConfirm] = useState(null); // null or computed data object
    const [applying,    setApplying]    = useState(false);
    const [applyMsg,    setApplyMsg]    = useState('');
    const [collapsedCats, setCollapsedCats] = useState(new Set());
    const weeklyFileRef = useRef(null);
    const scrollRef     = useRef(null);
    const didScrollRef  = useRef(false);

    const yearGroups = useMemo(() => {
        const g = {};
        DISP_MONTHS.forEach(({ year, month }) => { if (!g[year]) g[year] = []; g[year].push(month); });
        return Object.entries(g);
    }, []); // eslint-disable-line

    const execNoVal = row['실행번호'] || row.execNo || '';
    // A-4b: docKey = 고유 ID(pid) 우선 — 저장은 항상 pid 장부로, 읽기는 옛 장부(실행번호→행ID) 폴백
    const pidVal    = row.pid || row._pid || '';
    const docKey    = pidVal || execNoVal || String(row._id || row.id || 'unknown');

    const loadData = useCallback(async () => {
        console.log('[ProgressModal] loadData docKey=', docKey, 'team=', team);
        try {
            let snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', `progressRecords_${team}`, docKey));
            // A-4b 전환기 폴백: pid 장부가 아직 없으면 옛 키(실행번호 → 행ID)에서 읽기 (저장 시 pid 장부로 옮겨감)
            if (!snap.exists() && pidVal) {
                const oldKeys = [execNoVal, String(row._id || row.id || '')].filter(k => k && k !== docKey);
                for (const k of oldKeys) {
                    const oldSnap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', `progressRecords_${team}`, k));
                    if (oldSnap.exists() && !oldSnap.data()._migratedTo) { snap = oldSnap; console.log('[ProgressModal] 옛 장부 폴백:', k); break; }
                }
            }
            console.log('[ProgressModal] snap exists=', snap.exists(), 'weekly keys=', snap.exists() ? Object.keys(snap.data().weekly || {}) : []);
            if (snap.exists()) {
                const d = snap.data();
                setWeeklyData(d.weekly || {}); setSavedWeekly(d.weekly || {}); setDirty(false);
            }
            if (execNoVal) {
                const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'projects'), where('execNo', '==', execNoVal));
                const qs = await getDocs(q);
                if (!qs.empty) setPmsData(qs.docs[0].data());
            }
        } catch (e) { console.error('[Progress] 로드 오류', e); }
    }, [docKey, team, execNoVal]); // eslint-disable-line

    useEffect(() => { loadData(); }, [docKey, team]); // eslint-disable-line

    const handleReload = async () => {
        setReloading(true);
        await loadData();
        setReloading(false);
    };

    const wKeyOf = (isoDate) => {
        const d = new Date(isoDate);
        return `${d.getFullYear()}-${d.getMonth()+1}-${Math.ceil(d.getDate()/7)}`;
    };

    // App.js의 normalizeSystemName / extractSystemKeyword 와 동일하게 맞춤
    const normalizeSystem = (n) => {
        const s = String(n || '').trim();
        if (/FFU|BFU/i.test(s)) return 'FFU';
        if (/^SCADA$/i.test(s)) return '전력';
        return s;
    };
    const extractKeyword = (name) => {
        const n = String(name || '').trim();
        if (/FFU|BFU/i.test(n)) return 'FFU';
        if (/SCADA/i.test(n)) return '전력';
        const KEYWORDS = ['공조', '대기', 'CDA', '전력', 'FFU', '안전', '화면', 'SCADA'];
        for (const kw of KEYWORDS) { if (n.includes(kw)) return kw; }
        return n;
    };

    // 파싱 결과 sub 키: date-mode = '지난주'/'금주'/'누적', fallback = RENAME_SUB 결과 ('지난주'/'금주'...)
    const SIMPLE_CAT_MAP = {
        '도면입수': 'drawing',
        'I/O Map 입수': 'iomap', 'I/O Map입수': 'iomap',
        '화면개발': 'screen', '화면작성': 'screen',
        '기준정보생성': 'baseinfo',
    };

    const parseWeeklyBlob = async (fileBlob) => {
        if (!parseWeekly) {
            console.error('[WeeklyApply] parseWeekly prop이 없습니다');
            setWApplyMsg('오류: 파서가 없습니다');
            return;
        }
        setWApplying(true);
        setWApplyMsg('분석 중...');
        setWSummary(null);
        setCollapsedCats(new Set());
        try {
            console.log('[WeeklyApply] 파싱 시작, dates=', wDates);
            const summary = await parseWeekly(fileBlob, wDates.d1, wDates.d2, wDates.d3);
            console.log('[WeeklyApply] 파싱 결과:', summary);
            if (!summary || summary._error) {
                setWApplyMsg('파싱 실패: ' + (summary?._error || '알 수 없는 오류'));
                return;
            }
            setWSummary(summary);
            setWApplyMsg('');
        } catch (e) {
            console.error('[WeeklyApply]', e);
            setWApplyMsg('오류: ' + e.message);
        } finally {
            setWApplying(false);
        }
    };

    const handleWConfirm = () => {
        if (!wSummary) return;
        const wKey = wKeyOf(wDates.d3);
        const normalRows = (wSummary.dataRows || []).filter(r => !r.isTotal);
        const totalRow   = (wSummary.dataRows || []).find(r => r.isTotal);
        const srcRow     = totalRow || normalRows[normalRows.length - 1];

        // App.js handlePanelApply 와 동일한 파싱 로직
        const parsePct = (v) => {
            if (!v || v.display === '-' || v.display === '') return undefined;
            if (v.pct !== null && v.pct !== undefined) return v.pct;
            const n = parseFloat(String(v.display).replace(/[%,]/g, ''));
            return isNaN(n) ? undefined : n;
        };
        const parseNum = (v) => {
            if (!v || v.display === '-' || v.display === '') return undefined;
            const n = parseFloat(String(v.display).replace(/[%,]/g, ''));
            return isNaN(n) ? undefined : n;
        };
        // 금주 수량: '금주' 직접 → 없으면 (누적/Total) - 지난주 계산
        const getWeeklyCount = (rowData, catName) => {
            const direct = parseNum(rowData[catName]?.['금주']);
            if (direct !== undefined && direct > 0) return direct;
            const total = parseNum(rowData[catName]?.['누적']) ?? parseNum(rowData[catName]?.['Total']);
            const prev  = parseNum(rowData[catName]?.['지난주']);
            if (total !== undefined && prev !== undefined) {
                const diff = Math.round(total - prev);
                return diff > 0 ? diff : undefined;
            }
            return undefined;
        };

        const updates = {};

        // ── SIMPLE_ITEMS: 누적률/금주률 ──────────────────────────────────────
        if (srcRow) {
            (wSummary.catList || []).forEach(cat => {
                const catKey = cat.name.trim().replace(/\s+/g, ' ');
                const key = SIMPLE_CAT_MAP[catKey] || SIMPLE_CAT_MAP[cat.name];
                if (!key) return;
                // 진척률/진척율(두 표기) → 누적 → 금주 순서로 폴백
                const catData = srcRow.data[cat.name] || {};
                const pct = parsePct(catData['진척률'])
                         ?? parsePct(catData['진척율'])
                         ?? parsePct(catData['누적'])
                         ?? parsePct(catData['금주']);
                console.log('[WeeklyApply] cat=', cat.name, 'key=', key, 'pct=', pct, 'catData keys=', Object.keys(catData));
                if (pct !== undefined) {
                    if (!updates[key]) updates[key] = {};
                    updates[key][wKey] = pct;
                }
            });
        }

        // ── 시운전: 각 시스템 컬럼별 금주 수량 ────────────────────────────────
        const selfCat = (wSummary.catList || []).find(c => /자체시운전|^시운전$/.test(c.name));
        const intCat  = (wSummary.catList || []).find(c => /통합시운전/.test(c.name));

        if (subRows.length > 0 && (selfCat || intCat)) {
            const colMap = {};
            normalRows.forEach(colRow => {
                const norm = normalizeSystem(colRow.name);
                if (!colMap[norm]) colMap[norm] = { self: undefined, int: undefined };
                if (selfCat) {
                    const v = getWeeklyCount(colRow.data, selfCat.name);
                    if (v !== undefined) colMap[norm].self = (colMap[norm].self || 0) + v;
                }
                if (intCat) {
                    const v = getWeeklyCount(colRow.data, intCat.name);
                    if (v !== undefined) colMap[norm].int = (colMap[norm].int || 0) + v;
                }
            });
            subRows.forEach((sub, i) => {
                const subKw = extractKeyword(sub.name);
                const data = colMap[subKw];
                console.log('[WeeklyApply] sub=', sub.name, 'subKw=', subKw, 'data=', data);
                if (!data) return;
                if (data.self !== undefined) {
                    const k = `sub_${i}_commissioning`;
                    if (!updates[k]) updates[k] = {};
                    updates[k][wKey] = data.self;
                }
                if (data.int !== undefined) {
                    const k = `sub_${i}_intCommissioning`;
                    if (!updates[k]) updates[k] = {};
                    updates[k][wKey] = data.int;
                }
            });
        } else if (srcRow && (selfCat || intCat)) {
            // 서브항목 없음: 총계로 단순 저장
            if (selfCat) {
                const v = getWeeklyCount(srcRow.data, selfCat.name);
                if (v !== undefined) { if (!updates.commissioning) updates.commissioning = {}; updates.commissioning[wKey] = v; }
            }
            if (intCat) {
                const v = getWeeklyCount(srcRow.data, intCat.name);
                if (v !== undefined) { if (!updates.intCommissioning) updates.intCommissioning = {}; updates.intCommissioning[wKey] = v; }
            }
        }

        console.log('[WeeklyApply] 적용 updates=', updates, 'wKey=', wKey);
        console.log('[WeeklyApply] catList names=', (wSummary.catList||[]).map(c=>c.name));
        console.log('[WeeklyApply] srcRow name=', srcRow?.name, 'data keys=', srcRow ? Object.keys(srcRow.data) : []);
        if (Object.keys(updates).length === 0) {
            const catNames = (wSummary.catList||[]).map(c=>c.name).join(', ');
            setWApplyMsg(`적용할 데이터가 없습니다 — 파싱된 항목: [${catNames}]`);
            return;
        }
        setWeeklyData(prev => {
            const next = { ...prev };
            Object.entries(updates).forEach(([k, v]) => { next[k] = { ...(next[k] || {}), ...v }; });
            return next;
        });
        setDirty(true);
        // 패널 유지 — setWSummary(null) 호출하지 않음
        const cnt = Object.keys(updates).length;
        const keyNames = Object.keys(updates).join(', ');
        setWApplyMsg(`✓ ${cnt}개 항목 적용됨 [${keyNames}] → W${wKey.split('-')[2]} (${wKey.split('-')[1]}월)`);
        setTimeout(() => setWApplyMsg(''), 12000);
        // 적용된 주(wKey) 컬럼으로 스크롤 — clientWidth 기준으로 중앙 정렬
        if (scrollRef.current) {
            const idx = DISP_WEEKS.findIndex(w => w.key === wKey);
            if (idx >= 0) {
                const containerW = scrollRef.current.clientWidth;
                scrollRef.current.scrollLeft = totalLabelW + idx * weekColW - (containerW - totalLabelW - TOTAL_COL_W) / 2;
            }
        }
    };

    const handleWeeklyLinked = async () => {
        const projectKey = execNoVal || docKey;
        const link = weeklyLinks?.[projectKey];
        console.log('[WeeklyApply] 연결파일 조회 projectKey=', projectKey, 'link=', link);
        if (!link) { setWApplyMsg('연결된 주간보고 파일이 없습니다'); setTimeout(() => setWApplyMsg(''), 4000); return; }
        if (!getWeeklyReport) { setWApplyMsg('오류: getWeeklyReport prop 없음'); return; }
        const report = await getWeeklyReport(link.reportId);
        console.log('[WeeklyApply] report=', report ? Object.keys(report) : null);
        if (!report?.fileBlob) { setWApplyMsg('파일을 찾을 수 없습니다. 다시 연결해주세요'); setTimeout(() => setWApplyMsg(''), 4000); return; }
        await parseWeeklyBlob(report.fileBlob);
    };

    const handleWeeklyFile = async (e) => {
        const file = e.target.files?.[0];
        console.log('[WeeklyApply] 파일 선택:', file?.name);
        if (!file) return;
        e.target.value = '';
        const ab = await file.arrayBuffer();
        await parseWeeklyBlob(ab);
    };

    useEffect(() => {
        if (didScrollRef.current || !scrollRef.current) return;
        didScrollRef.current = true;
        const idx = DISP_WEEKS.findIndex(c => c.year === cy0 && c.month === cm0 && c.week === Math.ceil(now0.getDate()/7));
        if (idx < 0) return;
        const containerW = scrollRef.current.clientWidth;
        scrollRef.current.scrollLeft = totalLabelW + idx * weekColW - (containerW - totalLabelW - TOTAL_COL_W) / 2;
    }, []); // eslint-disable-line

    const onDragStart = (e) => {
        if (e.target.closest('input,button,select')) return;
        e.preventDefault();
        const ox = e.clientX - pos.x, oy = e.clientY - pos.y;
        const mv = ev => setPos({ x: ev.clientX - ox, y: Math.max(0, ev.clientY - oy) });
        const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); };
        document.addEventListener('mousemove', mv);
        document.addEventListener('mouseup', up);
    };

    const scrollMonths = (dir) => {
        if (!scrollRef.current) return;
        scrollRef.current.scrollBy({ left: dir * weekColW * 4.4, behavior: 'smooth' });
    };

    // 키인 효율: Enter/↓=아래 칸, ↑=위 칸 (행 종류가 달라도 같은 주차 열로 이동). 마우스 안 떼고 입력.
    const cellKeyNav = (e, wKey) => {
        const k = e.key;
        if (k !== 'Enter' && k !== 'ArrowDown' && k !== 'ArrowUp') return;
        const tr = e.target.closest('tr');
        if (!tr) return;
        const focusSameCol = (targetTr) => {
            const t = targetTr && targetTr.querySelector(`input[data-w="${wKey}"]`);
            if (t) { e.preventDefault(); t.focus(); if (t.select) t.select(); return true; }
            return false;
        };
        if (k === 'Enter' || k === 'ArrowDown') {
            let r = tr.nextElementSibling;
            while (r) { if (focusSameCol(r)) return; r = r.nextElementSibling; }
        } else {
            let r = tr.previousElementSibling;
            while (r) { if (focusSameCol(r)) return; r = r.previousElementSibling; }
        }
    };

    const updateWeekly = (itemKey, wKey, val) => {
        const parsed = val === '' ? undefined : Math.max(0, Number(val));
        setWeeklyData(prev => {
            const next = { ...(prev[itemKey]||{}), [wKey]: parsed };
            if (parsed === undefined) delete next[wKey];
            return { ...prev, [itemKey]: next };
        });
        setDirty(true);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', `progressRecords_${team}`, docKey), {
                docKey, execNo: execNoVal,
                project: row['Project'] || row['프로젝트명'] || row['공사명'] || row.project || '',
                weekly: weeklyData,
                updatedAt: new Date().toISOString(),
            });
            setSavedWeekly(weeklyData); setDirty(false);
        } catch (e) { console.error('[Progress] 저장 오류', e); }
        finally { setSaving(false); }
    };

    const projectName = row['Project'] || row['프로젝트명'] || row['공사명'] || row.project || '프로젝트';
    const totalPt = Number(pmsData?.point) || 0;

    const computeApplyData = () => {
        if (!baseDate) return null;
        const [y, m] = baseDate.split('-').map(Number);

        const now = new Date();
        const nowW = Math.ceil(now.getDate() / 7);
        const curWKey = `${y}-${m}-${nowW}`;

        // PLC/ETOS/HMI: 금주 값 우선, 없으면 해당 월 가장 최근 주차 폴백
        const getCurrentWeekVal = (key) => {
            const d = weeklyData[key] || {};
            if (d[curWKey] !== undefined && d[curWKey] !== null) return Number(d[curWKey]);
            let latestW = -1, latestVal = null;
            Object.entries(d).forEach(([wKey, val]) => {
                const [wy, wm, ww] = wKey.split('-').map(Number);
                if (wy === y && wm === m && ww > latestW && val !== undefined && val !== null) {
                    latestW = ww; latestVal = Number(val);
                }
            });
            return latestVal;
        };

        // 특정 월 합산
        const getMonthSum = (key) => {
            const d = weeklyData[key] || {};
            let s = 0;
            Object.entries(d).forEach(([wKey, val]) => {
                const [wy, wm] = wKey.split('-').map(Number);
                if (wy === y && wm === m) s += Number(val) || 0;
            });
            return s;
        };

        // 시작부터 현재 월까지 월별 시운전 합산 맵 { 'YYYY-MM': pts }
        // keyBase: 'commissioning'(자체) | 'intCommissioning'(통합) — 하위 행이 있으면 sub_i_* 키 합산
        const buildMonthlySums = (keyBase) => {
            const combined = {};
            const addKey = (key) => {
                const d = weeklyData[key] || {};
                Object.entries(d).forEach(([wKey, val]) => {
                    const parts = wKey.split('-');
                    const wy = Number(parts[0]), wm = Number(parts[1]);
                    if (wy < y || (wy === y && wm <= m)) {
                        const dateStr = `${wy}-${String(wm).padStart(2, '0')}`;
                        combined[dateStr] = (combined[dateStr] || 0) + (Number(val) || 0);
                    }
                });
            };
            if (subRows.length > 0) {
                subRows.forEach((_, i) => addKey(`sub_${i}_${keyBase}`));
            } else {
                addKey(keyBase);
            }
            return combined;
        };

        const selfPts = subRows.length > 0
            ? subRows.reduce((s, _, i) => s + getMonthSum(`sub_${i}_commissioning`), 0)
            : getMonthSum('commissioning');
        const intPts = subRows.length > 0
            ? subRows.reduce((s, _, i) => s + getMonthSum(`sub_${i}_intCommissioning`), 0)
            : getMonthSum('intCommissioning');

        const selfPct = totalPt > 0 ? Math.min(100, Math.round(selfPts / totalPt * 100)) : null;
        const intPct  = totalPt > 0 ? Math.min(100, Math.round(intPts  / totalPt * 100)) : null;

        const monthlyCommSums = buildMonthlySums('commissioning');
        const monthlyIntCommSums = buildMonthlySums('intCommissioning');
        let pm = m - 1, py = y;
        if (pm < 1) { pm = 12; py--; }
        const prevMonthStr = `${py}-${String(pm).padStart(2, '0')}`;

        const prevSelfPts = monthlyCommSums[prevMonthStr] || 0;
        const accSelfPts  = Object.values(monthlyCommSums).reduce((s, v) => s + v, 0);

        return {
            plc:  getCurrentWeekVal('plc'),
            etos: getCurrentWeekVal('etos'),
            hmi:  getCurrentWeekVal('hmi'),
            internalTest:   selfPct,
            integratedTest: intPct,
            currPoints: selfPts     > 0 ? selfPts     : null,
            prevPoints: prevSelfPts > 0 ? prevSelfPts : null,
            accPoints:  accSelfPts  > 0 ? accSelfPts  : null,
            monthlyCommSums, monthlyIntCommSums,
            selfPts, intPts, prevSelfPts, accSelfPts, curWeek: nowW,
            monthStr: baseDate, month: m, prevMonthStr,
        };
    };

    const handleApplyConfirm = async () => {
        if (!onApplyToMonthly || !applyConfirm) return;
        const projectId = row._id || row.id;
        setApplying(true);
        try {
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', `progressRecords_${team}`, docKey), {
                weekly: weeklyData,
                updatedAt: new Date().toISOString(),
            });
            setSavedWeekly(weeklyData); setDirty(false);
            onProgressSaved?.({ docKey, weeklyData });
            await onApplyToMonthly(projectId, applyConfirm);
            setApplyMsg('✓ 진행실적 저장 및 업무현황 반영 완료');
            setApplyConfirm(null);
            setTimeout(() => setApplyMsg(''), 4000);
        } catch (e) {
            setApplyMsg('저장 오류: ' + e.message);
        } finally {
            setApplying(false);
        }
    };

    const dateToWKey = (dateStr) => {
        if (!dateStr) return null;
        const d = new Date(String(dateStr).replace(/\./g, '-').replace(/\//g, '-'));
        if (isNaN(d.getTime())) return null;
        const y = d.getFullYear(), m = d.getMonth() + 1, w = Math.ceil(d.getDate() / 7);
        return `${y}-${m}-${w}`;
    };
    const startWKey = dateToWKey(pmsData?.startDate);
    const endWKey   = dateToWKey(pmsData?.endDate);

    // (가) 합계 기준점: 기준월의 마지막 주 — 누적 % '최신값'을 읽는 기준 (그 달 입력 없으면 직전 값 이월)
    const [refY, refM] = (baseDate && baseDate.includes('-')) ? baseDate.split('-').map(Number) : [cy0, cm0];
    const refWeeks = weeksInMonth(refY, refM);
    const refWKey  = `${refY}-${refM}-${refWeeks[refWeeks.length - 1]}`;

    const cumByKey = useMemo(() => {
        const r = {};
        // (가) 공정 항목 = 누적 %: 각 주차 값 = 그때까지의 '최신 입력값'(빈 주는 직전 값 이어받기 = 이월)
        [...SIMPLE_ITEMS, ...SECONDARY_ITEMS].forEach(({ key }) => {
            let last = 0; r[key] = {};
            ALL_WEEKS.forEach(({ key: wKey }) => {
                const v = (weeklyData[key] || {})[wKey];
                if (v !== undefined && v !== null && v !== '') last = Number(v) || 0;
                r[key][wKey] = last;
            });
        });
        // 시운전 = 포인트: 그때까지의 '누적 합'
        WEEKLY_ITEMS.forEach(({ key }) => {
            let s = 0; r[key] = {};
            ALL_WEEKS.forEach(({ key: wKey }) => {
                s += Number((weeklyData[key] || {})[wKey]) || 0;
                r[key][wKey] = s;
            });
        });
        return r;
    }, [weeklyData]); // eslint-disable-line

    const subCumByWeek = useMemo(() => {
        if (subRows.length === 0) return null;
        let cumSelf = 0, cumInt = 0;
        const r = {};
        ALL_WEEKS.forEach(({ key: wKey }) => {
            subRows.forEach((_, i) => {
                cumSelf += Number((weeklyData[`sub_${i}_commissioning`]    || {})[wKey]) || 0;
                cumInt  += Number((weeklyData[`sub_${i}_intCommissioning`] || {})[wKey]) || 0;
            });
            r[wKey] = { self: cumSelf, int: cumInt };
        });
        return r;
    }, [weeklyData, subRows]); // eslint-disable-line

    const itemFinalPct = (key) => {
        // (가) 공정 항목: 기준월 최신값(누적 %) — 합계 칸과 동일 기준
        if ([...SIMPLE_ITEMS, ...SECONDARY_ITEMS].find(i => i.key === key)) {
            return Math.min(100, cumByKey[key]?.[refWKey] || 0);
        }
        // 시운전: 누적 포인트 / 총포인트
        const total = Object.values(weeklyData[key] || {}).reduce((s, v) => s + (Number(v) || 0), 0);
        return totalPt > 0 ? Math.min(100, (total / totalPt) * 100) : 0;
    };

    const pctByWeek = useMemo(() => {
        const r = {};
        const totalItemCnt = SIMPLE_ITEMS.length + SECONDARY_ITEMS.length + 2;
        ALL_WEEKS.forEach(({ key: wKey }) => {
            const sim = [...SIMPLE_ITEMS, ...SECONDARY_ITEMS].reduce((s, { key }) => s + Math.min(100, cumByKey[key]?.[wKey] || 0), 0);
            let wk;
            if (subCumByWeek) {
                const { self = 0, int = 0 } = subCumByWeek[wKey] || {};
                wk = (totalPt > 0 ? Math.min(100, (self / totalPt) * 100) : 0)
                   + (totalPt > 0 ? Math.min(100, (int  / totalPt) * 100) : 0);
            } else {
                wk = WEEKLY_ITEMS.reduce((s, { key }) =>
                    s + (totalPt > 0 ? Math.min(100, ((cumByKey[key]?.[wKey] || 0) / totalPt) * 100) : 0), 0);
            }
            r[wKey] = Math.round((sim + wk) / totalItemCnt * 10) / 10;
        });
        return r;
    }, [cumByKey, totalPt, subCumByWeek]); // eslint-disable-line

    const overallPct = useMemo(() => {
        const simPct = [...SIMPLE_ITEMS, ...SECONDARY_ITEMS].reduce((s, { key }) => s + itemFinalPct(key), 0);
        let wkPct;
        if (subRows.length > 0) {
            const selfT = subRows.reduce((s, _, i) =>
                s + Object.values(weeklyData[`sub_${i}_commissioning`]    || {}).reduce((a,v) => a+(Number(v)||0), 0), 0);
            const intT  = subRows.reduce((s, _, i) =>
                s + Object.values(weeklyData[`sub_${i}_intCommissioning`] || {}).reduce((a,v) => a+(Number(v)||0), 0), 0);
            wkPct = (totalPt > 0 ? Math.min(100, (selfT / totalPt) * 100) : 0)
                  + (totalPt > 0 ? Math.min(100, (intT  / totalPt) * 100) : 0);
        } else {
            wkPct = WEEKLY_ITEMS.reduce((s, { key }) => s + itemFinalPct(key), 0);
        }
        const totalItemCnt = SIMPLE_ITEMS.length + SECONDARY_ITEMS.length + 2;
        return Math.round((simPct + wkPct) / totalItemCnt * 10) / 10;
    }, [weeklyData, totalPt, subRows, refWKey]); // eslint-disable-line

    const renderRow = (itemKey, label, color, bgLabel = '#f8fafc', useMax = false) => {
        const d = weeklyData[itemKey] || {};
        const vals = Object.values(d).map(v => Number(v)||0).filter(v => v > 0);
        const total = useMax
            ? Math.min(100, cumByKey[itemKey]?.[refWKey] || 0)
            : vals.reduce((s,v) => s+v, 0);
        return (
            <tr key={itemKey}>
                <td colSpan={2} style={{ ...TD, padding:'0 10px', fontWeight:700, color:'#374151', background:bgLabel, position:'sticky', left:0, zIndex:1, height:38 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                        <div style={{ width:4, height:16, background:color, borderRadius:2, flexShrink:0 }}/>
                        <span style={{ fontSize:12 }}>{label}</span>
                    </div>
                </td>
                {DISP_WEEKS.map(({ key: wKey, year, month, week }) => {
                    const val    = d[wKey];
                    const isCur  = isCurrentWeek(year, month, week);
                    const hasVal = val !== undefined && val !== '';
                    const extraCls = wKey === startWKey ? 'pw-start' : wKey === endWKey ? 'pw-end' : '';
                    return (
                        <td key={wKey} className={extraCls} style={{ ...TD, background: isCur?'#fef9e7':'#f8fafc' }}>
                            <input type="number" min="0" inputMode="numeric" value={val??''} data-w={wKey} onChange={e => updateWeekly(itemKey, wKey, e.target.value)} onKeyDown={e => cellKeyNav(e, wKey)} onWheel={e => e.target.blur()}
                                style={{ display:'block', width:'100%', height:38, background: hasVal?'rgba(37,99,235,0.07)':'transparent',
                                    border:'none', outline:'none', color: hasVal?'#1d4ed8':'#94a3b8',
                                    fontSize:15, fontWeight: hasVal?700:400,
                                    textAlign:'center', boxSizing:'border-box', padding:'0 2px', cursor:'text' }}
                                onFocus={e => { if (e.target.select) e.target.select(); e.target.style.background='rgba(99,102,241,0.1)'; e.target.style.boxShadow='inset 0 0 0 2px #6366f1'; e.target.style.color='#1e293b'; }}
                                onBlur={e => {
                                    const v = weeklyData[itemKey]?.[wKey];
                                    const hv = v !== undefined && v !== '';
                                    e.target.style.background = hv?'rgba(37,99,235,0.07)':'transparent';
                                    e.target.style.boxShadow = 'none';
                                    e.target.style.color = hv?'#1d4ed8':'#94a3b8';
                                }}/>
                        </td>
                    );
                })}
                <td style={{ ...TD, padding:'0 10px', fontWeight:800, fontSize:15, color: total>0?color:'#cbd5e1', background:bgLabel, textAlign:'right', position:'sticky', right:0, zIndex:1 }}>
                    {total > 0 ? (useMax ? `${total}%` : total) : (useMax ? '' : 0)}
                </td>
            </tr>
        );
    };

    const renderSubRow = (subIdx, subName) => {
        const selfKey = `sub_${subIdx}_commissioning`;
        const intKey  = `sub_${subIdx}_intCommissioning`;
        const selfD   = weeklyData[selfKey] || {};
        const intD    = weeklyData[intKey]  || {};
        const selfTotal = Object.values(selfD).reduce((s,v) => s+(Number(v)||0), 0);
        const intTotal  = Object.values(intD).reduce((s,v)  => s+(Number(v)||0), 0);

        const makeInput = (dataObj, itemKey, valColor, bgColor) => DISP_WEEKS.map(({ key: wKey, year, month, week }) => {
            const val    = dataObj[wKey];
            const isCur  = isCurrentWeek(year, month, week);
            const hasVal = val !== undefined && val !== '';
            const extraCls = wKey === startWKey ? 'pw-start' : wKey === endWKey ? 'pw-end' : '';
            return (
                <td key={wKey} className={extraCls} style={{ ...TD, background: isCur ? '#fef9e7' : bgColor }}>
                    <input type="number" min="0" inputMode="numeric" value={val??''} data-w={wKey} onChange={e => updateWeekly(itemKey, wKey, e.target.value)} onKeyDown={e => cellKeyNav(e, wKey)} onWheel={e => e.target.blur()}
                        style={{ display:'block', width:'100%', height:34, background: hasVal?`${valColor}15`:'transparent',
                            border:'none', outline:'none', color: hasVal?valColor:'#94a3b8',
                            fontSize:14, fontWeight: hasVal?700:400,
                            textAlign:'center', boxSizing:'border-box', padding:'0 2px', cursor:'text' }}
                        onFocus={e => { if (e.target.select) e.target.select(); e.target.style.background='rgba(99,102,241,0.1)'; e.target.style.boxShadow='inset 0 0 0 2px #6366f1'; e.target.style.color='#1e293b'; }}
                        onBlur={e => {
                            const v = (weeklyData[itemKey]||{})[wKey];
                            const hv = v !== undefined && v !== '';
                            e.target.style.background = hv ? `${valColor}15` : 'transparent';
                            e.target.style.boxShadow  = 'none';
                            e.target.style.color      = hv ? valColor : '#94a3b8';
                        }}/>
                </td>
            );
        });

        return (
            <React.Fragment key={`sub-${subIdx}`}>
                <tr>
                    <td rowSpan={2} style={{ ...TD, padding:'0 6px', fontWeight:700, color:'#374151',
                        background:'#fffbeb', position:'sticky', left:0, zIndex:1,
                        textAlign:'center', verticalAlign:'middle', borderRight: BORDER_D }}>
                        <div style={{ fontSize:12, lineHeight:1.3 }}>{subName}</div>
                    </td>
                    <td style={{ ...TD, padding:'0 4px', fontWeight:800, color:'#059669',
                        background:'#ecfdf5', position:'sticky', left:LABEL_COL_W, zIndex:1,
                        fontSize:11, height:34, borderRight: BORDER, textAlign:'center' }}>자체</td>
                    {makeInput(selfD, selfKey, '#059669', '#f0fdf4')}
                    <td style={{ ...TD, padding:'0 8px', fontWeight:800, fontSize:13,
                        color: selfTotal>0?'#059669':'#cbd5e1', background:'#ecfdf5',
                        textAlign:'right', position:'sticky', right:0, zIndex:1 }}>
                        {selfTotal > 0 ? selfTotal : ''}
                    </td>
                </tr>
                <tr>
                    <td style={{ ...TD, padding:'0 4px', fontWeight:800, color:'#be123c',
                        background:'#fff1f2', position:'sticky', left:LABEL_COL_W, zIndex:1,
                        fontSize:11, height:34, borderRight: BORDER, textAlign:'center' }}>통합</td>
                    {makeInput(intD, intKey, '#be123c', '#fff1f2')}
                    <td style={{ ...TD, padding:'0 8px', fontWeight:800, fontSize:13,
                        color: intTotal>0?'#be123c':'#cbd5e1', background:'#fff1f2',
                        textAlign:'right', position:'sticky', right:0, zIndex:1 }}>
                        {intTotal > 0 ? intTotal : ''}
                    </td>
                </tr>
            </React.Fragment>
        );
    };

    const renderCommTotal = (type) => {
        const isSelf  = type === 'self';
        const color   = isSelf ? '#059669' : '#be123c';
        const bgHead  = isSelf ? '#d1fae5' : '#ffe4e6';
        const bgCell  = isSelf ? '#ecfdf5' : '#fff1f2';
        const label   = isSelf ? '자체시운전' : '통합시운전';
        const subKey  = isSelf ? 'commissioning' : 'intCommissioning';
        const grandTotal = subRows.reduce((s, _, i) =>
            s + Object.values(weeklyData[`sub_${i}_${subKey}`] || {}).reduce((a,v) => a+(Number(v)||0), 0), 0);

        return (
            <tr key={`total-${type}`}>
                <td colSpan={2} style={{ ...TD, padding:'0 10px', fontWeight:800, fontSize:12, color,
                    background: bgHead, position:'sticky', left:0, zIndex:1, height:34 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <div style={{ width:3, height:14, background:color, borderRadius:1, flexShrink:0 }}/>
                        {label}
                    </div>
                </td>
                {DISP_WEEKS.map(({ key: wKey, year, month, week }) => {
                    const weekSum = subRows.reduce((s, _, i) =>
                        s + (Number((weeklyData[`sub_${i}_${subKey}`]||{})[wKey]) || 0), 0);
                    const isCur = isCurrentWeek(year, month, week);
                    const extraCls = wKey === startWKey ? 'pw-start' : wKey === endWKey ? 'pw-end' : '';
                    return <td key={wKey} className={extraCls} style={{ ...TD, fontWeight:700, fontSize:12,
                        color: weekSum>0?color:'#cbd5e1', background: isCur?'#fef9e7':bgCell }}>
                        {weekSum > 0 ? weekSum : ''}
                    </td>;
                })}
                <td style={{ ...TD, padding:'0 8px', fontWeight:800, fontSize:14, color: grandTotal>0?color:'#cbd5e1',
                    background: bgHead, textAlign:'right', position:'sticky', right:0, zIndex:1 }}>
                    {grandTotal > 0 ? grandTotal : ''}
                </td>
            </tr>
        );
    };

    const progressColor = (pct) => {
        if (pct === null || pct === undefined) return '#666666';
        if (pct >= 90) return '#059669';
        if (pct >= 70) return '#1d6ea0';
        if (pct >= 40) return '#b45309';
        return '#dc2626';
    };

    const renderWSummaryPanel = () => {
        if (!wSummary) return null;
        const s = wSummary;

        const SKIP_ROW = /직접입력|자동수식|자동계산|#REF/;
        const SKIP_COL = /^(공종|SCR)$/i;
        const seenNames = new Set();
        const dataRows = (s.dataRows || []).filter(r => {
            if (SKIP_ROW.test(r.name)) return false;
            if (SKIP_COL.test(r.name.trim())) return false;
            if (seenNames.has(r.name)) return false;
            seenNames.add(r.name);
            return true;
        });
        const normalRows = dataRows.filter(r => !r.isTotal);
        const totalRows  = dataRows.filter(r => r.isTotal);

        const COL_W = 52;
        const HDR_W = 90;
        const CAT_COLORS = ['#dce8f5','#e8f5e8','#fff3cd','#fde8e8','#f0e8f8'];

        const thSt = { padding:'4px 6px', color:'#1a1a1a', fontWeight:'bold', whiteSpace:'nowrap', fontSize:11, border:'none', borderBottom:'1px solid #c0c0c0', backgroundColor:'#e2e8f0' };
        const tdSt = { padding:'4px 6px', whiteSpace:'nowrap', fontSize:11, color:'#000000' };

        const allCollapsed = (s.catList || []).every(c => collapsedCats.has(c.name));
        const toggleCat = (name) => setCollapsedCats(prev => {
            const next = new Set(prev);
            next.has(name) ? next.delete(name) : next.add(name);
            return next;
        });
        const toggleAll = () => {
            if (allCollapsed) setCollapsedCats(new Set());
            else setCollapsedCats(new Set((s.catList || []).map(c => c.name)));
        };

        return (
            <div style={{ width: wSummaryPanelW, flexShrink:0, borderLeft:'2px solid #c8d4e0',
                background:'#ffffff', display:'flex', flexDirection:'column', overflow:'hidden' }}>
                {/* 패널 헤더 */}
                <div style={{ padding:'8px 12px', background:'#f0f4f8', borderBottom:'1px solid #d0d8e4', flexShrink:0 }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                        <span style={{ fontSize:12, fontWeight:800, color:'#1a1a1a' }}>주간 진척율 요약</span>
                        <div style={{ display:'flex', gap:6 }}>
                            <button onClick={handleWConfirm}
                                style={{ background:'#16a34a', border:'none', color:'#fff',
                                    fontSize:11, fontWeight:800, padding:'4px 14px', cursor:'pointer', borderRadius:4 }}>
                                실적에 적용
                            </button>
                            <button onClick={() => setWSummary(null)}
                                style={{ background:'#f1f5f9', border:'1px solid #c0c8d4', color:'#444',
                                    fontSize:11, fontWeight:700, padding:'4px 10px', cursor:'pointer', borderRadius:4 }}>
                                닫기
                            </button>
                        </div>
                    </div>
                    <div style={{ fontSize:10, color:'#666', marginBottom:4 }}>
                        {s.sheetName && <span style={{ fontWeight:700, color:'#1e4f8c', marginRight:8 }}>{s.sheetName}</span>}
                        {s.date1 && s.date3
                            ? `지난주: ${s.date1}~${s.date2}  금주: ${s.date2}~${s.date3}`
                            : `${wDates.d2} ~ ${wDates.d3}`}
                    </div>
                </div>

                {/* 결과 테이블 */}
                <div style={{ flex:1, overflowY:'auto', overflowX:'auto', padding:'8px 10px' }}>
                    {/* 시트명 + 전체접기/펴기 */}
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
                        marginBottom:6, paddingBottom:4, borderBottom:'1px solid #c8d4e0' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                            <span style={{ color:'#1e4f8c', fontSize:11, fontWeight:'bold' }}>{s.sheetName}</span>
                            <button onClick={toggleAll}
                                style={{ background:'#edf1f7', border:'1px solid #c0c8d4', borderRadius:4,
                                    color:'#444', fontSize:9, padding:'2px 7px', cursor:'pointer',
                                    display:'flex', alignItems:'center', gap:3 }}>
                                {allCollapsed ? '▶ 전체 펴기' : '▼ 전체 접기'}
                            </button>
                        </div>
                        <span style={{ color:'#888', fontSize:9 }}>
                            {normalRows.length}개 공종
                        </span>
                    </div>

                    <table style={{ borderCollapse:'collapse', fontSize:10, tableLayout:'fixed',
                        width: HDR_W + (normalRows.length + totalRows.length) * COL_W,
                        border:'1px solid #c8d0dc' }}>
                        <colgroup>
                            <col style={{ width: HDR_W }}/>
                            {normalRows.map((_, i) => <col key={i} style={{ width: COL_W }}/>)}
                            {totalRows.map((_, i) => <col key={'t'+i} style={{ width: COL_W }}/>)}
                        </colgroup>
                        <thead>
                            <tr>
                                <th style={{ ...thSt, textAlign:'left', position:'sticky', left:0, zIndex:2, padding:'4px 6px' }}>구분</th>
                                {normalRows.map((row, ri) => (
                                    <th key={ri} style={{ ...thSt, textAlign:'center', color:'#1e4f8c', fontSize:10,
                                        borderLeft:'1px solid #c8d0dc', padding:'4px 3px',
                                        overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}
                                        title={row.name}>
                                        {row.name}
                                    </th>
                                ))}
                                {totalRows.map((row, ri) => (
                                    <th key={'t'+ri} style={{ ...thSt, textAlign:'center', color:'#7c5500', fontSize:10,
                                        borderLeft:'2px solid #b8b0a0', background:'#fff3e0', padding:'4px 3px',
                                        overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}
                                        title={row.name}>
                                        {row.name}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {(s.catList || []).map((cat, ci) => {
                                const catBg = CAT_COLORS[ci % CAT_COLORS.length];
                                const isCollapsed = collapsedCats.has(cat.name);
                                const allCols = [...normalRows, ...totalRows];
                                const catAllDash = allCols.length > 0 && (cat.subs || []).every(sub =>
                                    allCols.every(row => {
                                        const v = row.data[cat.name]?.[sub.sub];
                                        return !v || v.display === '-' || v.display === '';
                                    })
                                );
                                if (catAllDash) return null;
                                return [
                                    <tr key={`cat-${ci}`} onClick={() => toggleCat(cat.name)} style={{ cursor:'pointer' }}>
                                        <td colSpan={normalRows.length + totalRows.length + 1}
                                            style={{ ...tdSt, background: catBg, color:'#1a2a4a',
                                                fontWeight:'bold', fontSize:11, padding:'5px 8px',
                                                borderTop:'2px solid #b8c0cc', position:'sticky', left:0,
                                                userSelect:'none', borderLeft:'3px solid #1e7ac8' }}>
                                            <span style={{ marginRight:5, fontSize:9, opacity:0.6 }}>
                                                {isCollapsed ? '▶' : '▼'}
                                            </span>
                                            {cat.name}
                                            {isCollapsed && (
                                                <span style={{ fontSize:9, color:'#888', marginLeft:8, fontWeight:'normal' }}>
                                                    ({(cat.subs || []).length}개 항목 숨김)
                                                </span>
                                            )}
                                        </td>
                                    </tr>,
                                    ...(!isCollapsed ? (cat.subs || []).map((sub, si) => {
                                        const allDash = sub.sub !== '금주' && allCols.length > 0 && allCols.every(row => {
                                            const v = row.data[cat.name]?.[sub.sub];
                                            return !v || v.display === '-' || v.display === '';
                                        });
                                        if (allDash) return null;
                                        const isKey = /최종|total|누적/i.test(sub.sub);
                                        return (
                                            <tr key={`cat-${ci}-sub-${si}`}>
                                                <td style={{ ...tdSt, background: catBg,
                                                    color: isKey ? '#1a1a1a' : '#444',
                                                    fontWeight: isKey ? 'bold' : 'normal',
                                                    fontSize:10, paddingLeft:10, position:'sticky', left:0,
                                                    borderTop:'1px solid #d4dce8',
                                                    overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                                    └ {sub.sub}
                                                </td>
                                                {normalRows.map((row, ri) => {
                                                    const v = row.data[cat.name]?.[sub.sub] || { display: '-', pct: null };
                                                    return (
                                                        <td key={ri} style={{ ...tdSt,
                                                            background:'#ffffff', textAlign:'right',
                                                            fontWeight: isKey ? 'bold' : 'normal',
                                                            color: progressColor(v.pct),
                                                            borderLeft:'1px solid #d4dce8',
                                                            borderTop:'1px solid #d4dce8',
                                                            fontSize: isKey ? 12 : 10 }}>
                                                            {v.display}
                                                        </td>
                                                    );
                                                })}
                                                {totalRows.map((row, ri) => {
                                                    const v = row.data[cat.name]?.[sub.sub] || { display: '-', pct: null };
                                                    return (
                                                        <td key={'t'+ri} style={{ ...tdSt,
                                                            background:'#fff8ee', textAlign:'right',
                                                            fontWeight:'bold',
                                                            color: progressColor(v.pct),
                                                            borderLeft:'2px solid #e8d8b0',
                                                            borderTop:'1px solid #d4dce8',
                                                            fontSize:12 }}>
                                                            {v.display}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        );
                                    }) : [])
                                ];
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    const modalW = progressPanelW + (wSummary ? wSummaryPanelW : 0);

    return (
        <div style={{ position:'fixed', left:pos.x, top:pos.y, width:modalW, zIndex:9500,
            background:'#ffffff', border:'1px solid #cbd5e1', borderRadius:14,
            boxShadow:'0 20px 60px rgba(0,0,0,0.18)',
            display:'flex', flexDirection:'column', maxHeight:'88vh' }}>
            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.progress-modal-table td:last-child { box-shadow: -6px 0 8px -7px rgba(15,23,42,0.18); }`}</style>

            {/* 헤더 */}
            <div onMouseDown={onDragStart} style={{ cursor:'move', background:'#f8fafc', borderRadius:'14px 14px 0 0',
                padding:'9px 14px', display:'flex', alignItems:'center',
                justifyContent:'space-between', borderBottom:BORDER, flexShrink:0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:0 }}>
                    <BarChart2 size={15} color="#10b981" />
                    <span style={{ fontWeight:800, fontSize:13, color:'#1e293b', flexShrink:0 }}>진행실적 등록</span>
                    <span style={{ fontSize:11, color:'#94a3b8', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {execNoVal ? `[${execNoVal}] ` : ''}{projectName}
                    </span>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
                    <input type="file" accept=".xlsx,.xls" ref={weeklyFileRef} style={{ display:'none' }} onChange={handleWeeklyFile}/>
                    <button
                        onClick={() => setShowWPanel(p => !p)}
                        style={{ background: showWPanel ? '#dbeafe' : '#f1f5f9', border:'1px solid #c7d2fe',
                            color: showWPanel ? '#1d4ed8' : '#475569', fontSize:11, fontWeight:700,
                            padding:'3px 10px', cursor:'pointer', display:'flex', alignItems:'center', gap:4, borderRadius:4 }}
                        title="주간보고 Excel에서 실적 가져오기">
                        주간보고 적용
                    </button>
                    <button onClick={() => setMinimized(p => !p)} style={{ background:'none', border:'none', color:'#94a3b8', cursor:'pointer', padding:2, display:'flex' }}><Minus size={13}/></button>
                    <button onClick={onClose}                     style={{ background:'none', border:'none', color:'#94a3b8', cursor:'pointer', padding:2, display:'flex' }}><X size={13}/></button>
                </div>
            </div>

            {/* 주간보고 적용 컨트롤 패널 */}
            {showWPanel && (
                <div style={{ flexShrink:0, background:'#eff6ff', borderBottom:'2px solid #bfdbfe',
                    padding:'8px 18px', display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
                    <span style={{ fontSize:11, fontWeight:800, color:'#1d4ed8' }}>기간</span>
                    {[['이전주', 'd1'], ['전주', 'd2'], ['금주', 'd3']].map(([label, key]) => (
                        <div key={key} style={{ display:'flex', alignItems:'center', gap:3 }}>
                            <span style={{ fontSize:10, color:'#64748b' }}>{label}</span>
                            <input type="date" value={wDates[key]}
                                onChange={e => { setWDates(p => ({ ...p, [key]: e.target.value })); setWSummary(null); }}
                                style={{ fontSize:10, padding:'2px 4px', border:'1px solid #93c5fd', background:'#ffffff', color:'#1e293b', colorScheme:'light' }}/>
                        </div>
                    ))}
                    <div style={{ display:'flex', gap:6, alignItems:'center', marginLeft:'auto' }}>
                        {weeklyLinks?.[execNoVal || docKey] && (
                            <button onClick={handleWeeklyLinked} disabled={wApplying}
                                style={{ background: wApplying ? '#93c5fd' : '#1d4ed8', border:'none', color:'#fff',
                                    fontSize:11, fontWeight:800, padding:'4px 14px',
                                    cursor: wApplying ? 'default' : 'pointer', borderRadius:4 }}>
                                {wApplying ? '분석 중...' : '연결파일 불러오기'}
                            </button>
                        )}
                        <button onClick={() => weeklyFileRef.current?.click()} disabled={wApplying}
                            style={{ background:'#ffffff', border:'1px solid #93c5fd', color:'#1d4ed8',
                                fontSize:11, fontWeight:700, padding:'4px 12px', cursor:'pointer', borderRadius:4 }}>
                            {wApplying ? '분석 중...' : '파일 선택'}
                        </button>
                    </div>
                    {wApplyMsg && (
                        <span style={{ width:'100%', fontSize:11, fontWeight:700,
                            color: wApplyMsg.startsWith('✓') ? '#059669' : wApplyMsg.startsWith('분석') ? '#1d4ed8' : '#dc2626' }}>
                            {wApplyMsg}
                        </span>
                    )}
                </div>
            )}

            {!minimized && (
                <div style={{ display:'flex', flex:1, overflow:'hidden' }}>
                    {/* 왼쪽: 진행실적 입력 테이블 */}
                    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0 }}>
                        {/* POINT 정보 */}
                        {pmsData && (
                            <div style={{ flexShrink:0, padding:'7px 18px', background:'#f0fdf4', borderBottom:BORDER, display:'flex', alignItems:'center', gap:20, flexWrap:'wrap' }}>
                                <span style={{ fontSize:10, fontWeight:800, color:'#059669', letterSpacing:'0.08em' }}>POINT</span>
                                {[
                                    { label:'합',   value: pmsData.point,      color:'#374151' },
                                    { label:'실적', value: pmsData.accPoints,  color:'#3b82f6' },
                                    { label:'전주', value: pmsData.prevPoints, color:'#94a3b8' },
                                    { label:'금주', value: pmsData.currPoints, color:'#10b981' },
                                ].map(({ label, value, color }) => value != null && (
                                    <div key={label} style={{ display:'flex', alignItems:'baseline', gap:4 }}>
                                        <span style={{ fontSize:10, color:'#94a3b8' }}>{label}</span>
                                        <span style={{ fontSize:14, fontWeight:800, color }}>{Number(value).toLocaleString()}</span>
                                    </div>
                                ))}
                                {(pmsData.startDate || pmsData.endDate) && (
                                    <>
                                        <div style={{ width:1, height:16, background:'#bbf7d0', flexShrink:0 }}/>
                                        {pmsData.startDate && <div style={{ display:'flex', alignItems:'baseline', gap:4 }}>
                                            <span style={{ fontSize:10, color:'#94a3b8' }}>시작</span>
                                            <span style={{ fontSize:13, fontWeight:700, color:'#374151' }}>{pmsData.startDate}</span>
                                        </div>}
                                        {pmsData.endDate && <div style={{ display:'flex', alignItems:'baseline', gap:4 }}>
                                            <span style={{ fontSize:10, color:'#94a3b8' }}>완료</span>
                                            <span style={{ fontSize:13, fontWeight:700, color:'#374151' }}>{pmsData.endDate}</span>
                                        </div>}
                                    </>
                                )}
                                {execNoVal && (
                                    <>
                                        <div style={{ width:1, height:16, background:'#bbf7d0', flexShrink:0 }}/>
                                        <div style={{ display:'flex', alignItems:'baseline', gap:4 }}>
                                            <span style={{ fontSize:10, color:'#94a3b8' }}>실행번호</span>
                                            <span style={{ fontSize:13, fontWeight:800, color:'#1d4ed8', fontFamily:'monospace' }}>{execNoVal}</span>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        {/* 네비게이션 버튼 — flex 고정 영역 */}
                        <div style={{ flexShrink:0, padding:'8px 18px 4px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                            <div style={{ fontSize:10, fontWeight:800, color:'#94a3b8', letterSpacing:'0.1em', textTransform:'uppercase' }}>
                                진행실적 <span style={{ fontWeight:400, color:'#cbd5e1' }}>· 셀 클릭으로 직접 입력</span>
                            </div>
                            <div style={{ display:'flex', gap:6 }}>
                                <button onClick={() => scrollMonths(-1)}
                                    style={{ background:'#f1f5f9', border:BORDER, borderRadius:6, color:'#64748b', cursor:'pointer', padding:'4px 10px', display:'flex', alignItems:'center', gap:3, fontSize:12, fontWeight:700 }}>
                                    <ChevronLeft size={13}/> 이전
                                </button>
                                <button onClick={() => {
                                    if (!scrollRef.current) return;
                                    const idx = DISP_WEEKS.findIndex(c => c.year === cy0 && c.month === cm0 && c.week === Math.ceil(now0.getDate()/7));
                                    if (idx < 0) return;
                                    const containerW = scrollRef.current.clientWidth;
                                    scrollRef.current.scrollLeft = totalLabelW + idx * weekColW - (containerW - totalLabelW - TOTAL_COL_W) / 2;
                                }} style={{ background:'#fef9c3', border:'1px solid #fbbf24', borderRadius:6, color:'#92400e', cursor:'pointer', padding:'4px 12px', fontSize:12, fontWeight:800 }}>
                                    금주
                                </button>
                                <button onClick={() => scrollMonths(1)}
                                    style={{ background:'#f1f5f9', border:BORDER, borderRadius:6, color:'#64748b', cursor:'pointer', padding:'4px 10px', display:'flex', alignItems:'center', gap:3, fontSize:12, fontWeight:700 }}>
                                    다음 <ChevronRight size={13}/>
                                </button>
                                <button onClick={() => setShowAllMonths(v => !v)}
                                    style={{ background: showAllMonths ? '#dbeafe' : '#f1f5f9', border: showAllMonths ? '1px solid #93c5fd' : BORDER, borderRadius:6, color: showAllMonths ? '#1d4ed8' : '#64748b', cursor:'pointer', padding:'4px 10px', fontSize:12, fontWeight:700 }}>
                                    {showAllMonths ? '이번 기간만' : '전체 기간 보기'}
                                </button>
                            </div>
                        </div>

                        {/* 수평 스크롤 테이블 — flex:1로 남은 높이 채움 → 스크롤바 항상 보임 */}
                        <div ref={scrollRef} style={{ flex:1, minHeight:0, overflowX:'scroll', overflowY:'auto', paddingLeft:18, paddingRight:18 }}>
                            <table className="progress-modal-table" style={{ borderCollapse:'separate', borderSpacing:0,
                                borderTop:BORDER, borderLeft:BORDER,
                                tableLayout:'fixed', width: tableW }}>
                                <colgroup>
                                    <col style={{ width: LABEL_COL_W }}/>
                                    <col style={{ width: TYPE_COL_W }}/>
                                    {DISP_WEEKS.map(({ key }) => <col key={key} style={{ width: weekColW }}/>)}
                                    <col style={{ width: TOTAL_COL_W }}/>
                                </colgroup>
                                <thead>
                                    <tr>
                                        <th colSpan={2} style={{ ...TH, position:'sticky', left:0, zIndex:3 }} rowSpan={3}>항목</th>
                                        {yearGroups.map(([year, mArr]) => {
                                            const span = mArr.reduce((s,m) => s + weeksInMonth(Number(year),m).length, 0);
                                            return <th key={year} colSpan={span} style={{ ...TH, color:'#1d4ed8' }}>{year}년</th>;
                                        })}
                                        <th style={{ ...TH, color:'#059669', position:'sticky', right:0, zIndex:3 }} rowSpan={3}>합계</th>
                                    </tr>
                                    <tr>
                                        {DISP_MONTHS.map(({ year, month }) => (
                                            <th key={`${year}-${month}`} colSpan={weeksInMonth(year,month).length}
                                                style={{ ...TH, color:'#374151' }}>{month}월</th>
                                        ))}
                                    </tr>
                                    <tr>
                                        {DISP_WEEKS.map(({ key, year, month, week }) => {
                                            const isCur = isCurrentWeek(year, month, week);
                                            const extraCls = key === startWKey ? 'pw-start' : key === endWKey ? 'pw-end' : '';
                                            return <th key={key} className={extraCls} style={{ ...TH, fontSize:10, padding:'3px 0',
                                                color: isCur?'#d97706':'#9ca3af', background: isCur?'#fef3c7':'#f8fafc', fontWeight: isCur?800:600 }}>W{week}</th>;
                                        })}
                                    </tr>
                                </thead>
                                <tbody>
                                    {SIMPLE_ITEMS.map(({ key, label, color }) => renderRow(key, label, color, '#fafafa', true))}
                                    <tr>
                                        <td colSpan={DISP_WEEKS.length + 3} style={{ padding:0, background:'#c4b5fd', height:1, border:'none' }}/>
                                    </tr>
                                    {SECONDARY_ITEMS.map(({ key, label, color }) => renderRow(key, label, color, '#f5f3ff', true))}

                                    <tr>
                                        <td colSpan={DISP_WEEKS.length + 3} style={{ padding:0, background:'#e2e8f0', height:1, border:'none' }}/>
                                    </tr>

                                    {subRows.length > 0 ? (<>
                                        <tr>
                                            <td colSpan={DISP_WEEKS.length + 3} style={{ padding:'1px 12px', background:'#f1f5f9',
                                                height:10, borderBottom:'1px solid #cbd5e1', borderTop:'none' }}>
                                                <span style={{ fontSize:10, fontWeight:800, color:'#334155', letterSpacing:'0.05em' }}>시운전</span>
                                            </td>
                                        </tr>
                                        {subRows.map((sub, i) => renderSubRow(i, sub.name))}
                                        <tr>
                                            <td colSpan={DISP_WEEKS.length + 3} style={{ padding:0, background:'#cbd5e1', height:2, border:'none' }}/>
                                        </tr>
                                        {renderCommTotal('self')}
                                        {renderCommTotal('int')}
                                    </>) : (<>
                                        {WEEKLY_ITEMS.map(({ key, label, color }) => renderRow(key, label, color, '#f8fafc'))}
                                    </>)}

                                    <tr>
                                        <td colSpan={DISP_WEEKS.length + 3} style={{ padding:0, background:'#e2e8f0', height:2, border:'none' }}/>
                                    </tr>

                                    <tr>
                                        <td colSpan={2} style={{ ...TD, padding:'0 10px', fontWeight:800, fontSize:13, color:'#0ea5e9', background:'#f0f9ff', height:34, position:'sticky', left:0, zIndex:1 }}>진척률(%)</td>
                                        {DISP_WEEKS.map(({ key: wKey, year, month, week }) => {
                                            const pct = pctByWeek[wKey] || 0;
                                            const hasData = subRows.length > 0
                                                ? [...SIMPLE_ITEMS, ...SECONDARY_ITEMS].some(({ key }) => (Number((weeklyData[key]||{})[wKey])||0) > 0)
                                                  || subRows.some((_, i) =>
                                                      (Number((weeklyData[`sub_${i}_commissioning`]   ||{})[wKey])||0) > 0 ||
                                                      (Number((weeklyData[`sub_${i}_intCommissioning`]||{})[wKey])||0) > 0)
                                                : [...SIMPLE_ITEMS, ...SECONDARY_ITEMS, ...WEEKLY_ITEMS].some(({ key }) => (Number((weeklyData[key]||{})[wKey])||0) > 0);
                                            const isCur = isCurrentWeek(year, month, week);
                                            const extraCls = wKey === startWKey ? 'pw-start' : wKey === endWKey ? 'pw-end' : '';
                                            return <td key={wKey} className={extraCls} style={{ ...TD, fontWeight:700, fontSize:11, color:'#0ea5e9', background: isCur?'#fef9e7':'#f0f9ff' }}>
                                                {hasData && pct > 0 ? `${pct}%` : ''}
                                            </td>;
                                        })}
                                        <td style={{ ...TD, padding:'0 10px', fontWeight:800, fontSize:15, color:'#0ea5e9', background:'#e0f2fe', textAlign:'right', position:'sticky', right:0, zIndex:1 }}>
                                            {overallPct > 0 ? `${overallPct}%` : ''}
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        {/* 주석 — flex 고정 영역 */}
                        <div style={{ flexShrink:0, padding:'3px 18px 6px', fontSize:10, color:'#cbd5e1' }}>
                            * 1주: 1~7일, 2주: 8~14일, 3주: 15~21일, 4주: 22~28일, 5주: 29일~) · 배경= 현재주 · 주황= 시작주 · 녹색테두리= 완료주
                        </div>
                    </div>

                    {/* 오른쪽: 주간보고 분석 결과 패널 */}
                    {renderWSummaryPanel()}
                </div>
            )}

            {/* 적용 확인 패널 */}
            {applyConfirm && (
                <div style={{ flexShrink:0, padding:'12px 18px', background:'#fffbeb', borderTop:'2px solid #f59e0b' }}>
                    <div style={{ fontSize:12, fontWeight:800, color:'#92400e', marginBottom:6 }}>
                        {applyConfirm.month}월 W{applyConfirm.curWeek} 데이터를 기준일 {applyConfirm.month}월 업무현황에 저장하겠습니다
                    </div>
                    <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:10 }}>
                        {applyConfirm.plc  != null && <span style={{ background:'#e0e7ff', color:'#3730a3', fontSize:11, fontWeight:700, padding:'2px 10px', borderRadius:4 }}>PLC: {applyConfirm.plc}% (W{applyConfirm.curWeek})</span>}
                        {applyConfirm.etos != null && <span style={{ background:'#cffafe', color:'#0e7490', fontSize:11, fontWeight:700, padding:'2px 10px', borderRadius:4 }}>ETOS: {applyConfirm.etos}% (W{applyConfirm.curWeek})</span>}
                        {applyConfirm.hmi  != null && <span style={{ background:'#ede9fe', color:'#5b21b6', fontSize:11, fontWeight:700, padding:'2px 10px', borderRadius:4 }}>HMI: {applyConfirm.hmi}% (W{applyConfirm.curWeek})</span>}
                        {applyConfirm.currPoints != null && <span style={{ background:'#d1fae5', color:'#065f46', fontSize:11, fontWeight:700, padding:'2px 10px', borderRadius:4 }}>시운전 금월: {applyConfirm.currPoints}pt</span>}
                        {applyConfirm.prevPoints != null && <span style={{ background:'#dbeafe', color:'#1e40af', fontSize:11, fontWeight:700, padding:'2px 10px', borderRadius:4 }}>시운전 전월: {applyConfirm.prevPoints}pt</span>}
                        {applyConfirm.accPoints  != null && <span style={{ background:'#fef3c7', color:'#92400e', fontSize:11, fontWeight:700, padding:'2px 10px', borderRadius:4 }}>시운전 누적: {applyConfirm.accPoints}pt</span>}
                        {[applyConfirm.plc, applyConfirm.etos, applyConfirm.hmi, applyConfirm.currPoints, applyConfirm.prevPoints, applyConfirm.accPoints].every(v => v == null) && (
                            <span style={{ color:'#b45309', fontSize:11 }}>적용할 데이터가 없습니다 ({applyConfirm.month}월 입력값 확인)</span>
                        )}
                    </div>
                    <div style={{ display:'flex', gap:8 }}>
                        <button onClick={handleApplyConfirm} disabled={applying}
                            style={{ background: applying?'#16a34a99':'#16a34a', border:'none', borderRadius:6, color:'#fff', fontSize:12, fontWeight:800, padding:'5px 20px', cursor: applying?'default':'pointer' }}>
                            {applying ? '저장 중...' : '저장'}
                        </button>
                        <button onClick={() => setApplyConfirm(null)} disabled={applying}
                            style={{ background:'#f1f5f9', border:BORDER, borderRadius:6, color:'#374151', fontSize:12, fontWeight:700, padding:'5px 16px', cursor:'pointer' }}>
                            취소
                        </button>
                    </div>
                </div>
            )}

            {/* 푸터 */}
            <div style={{ flexShrink:0, padding:'10px 18px', borderTop:BORDER, background:'#f8fafc', borderRadius:'0 0 14px 14px', display:'flex', alignItems:'center', gap:8 }}>
                {applyMsg
                    ? <span style={{ fontSize:11, fontWeight:700, color: applyMsg.startsWith('✓') ? '#059669' : '#dc2626', marginRight:'auto' }}>{applyMsg}</span>
                    : dirty
                        ? <span style={{ fontSize:11, color:'#f59e0b', marginRight:'auto', fontWeight:700 }}>저장하지 않은 변경사항</span>
                        : <span style={{ fontSize:11, color:'#cbd5e1', marginRight:'auto' }}>변경사항 없음</span>
                }
                <button onClick={handleReload} disabled={saving || reloading}
                    style={{ background:'#f1f5f9', border:BORDER, borderRadius:7, color:'#374151', fontSize:12, fontWeight:700, padding:'6px 10px', cursor: reloading ? 'default' : 'pointer', display:'flex', alignItems:'center', gap:4 }}
                    title="Firestore에서 최신 데이터를 다시 불러오기">
                    <RefreshCw size={13} style={{ animation: reloading ? 'spin 0.8s linear infinite' : 'none' }}/>
                    {reloading ? '로딩...' : '새로고침'}
                </button>
                {onApplyToMonthly && (
                    <button onClick={() => { const d = computeApplyData(); if (d) setApplyConfirm(d); }} disabled={saving || applying}
                        style={{ background:'#f0fdf4', border:'1px solid #86efac', borderRadius:7, color:'#15803d', fontSize:12, fontWeight:800, padding:'6px 16px', cursor:'pointer' }}>
                        적용하기
                    </button>
                )}
                <button onClick={onClose} disabled={saving || applying}
                    style={{ background:'#f1f5f9', border:BORDER, borderRadius:7, color:'#374151', fontSize:12, fontWeight:700, padding:'6px 18px', cursor:'pointer' }}>
                    닫기
                </button>
            </div>
        </div>
    );
};

export default ProgressModal;
