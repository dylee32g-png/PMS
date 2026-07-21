import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { X, Minus, BarChart2, BarChart3, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { doc, getDoc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db, appId } from '../firebase';

const SIMPLE_ITEMS = [
    { key: 'drawing',  label: '도면입수',     color: '#3b82f6' },
    { key: 'iomap',    label: 'I/O Map 입수', color: '#8b5cf6' },
    { key: 'screen',   label: '화면작성',     color: '#06b6d4' },
    { key: 'baseinfo', label: '기준정보생성', color: '#f59e0b' },
];
const SECONDARY_ITEMS = [
    { key: 'plc',  label: 'PLC',  color: 'var(--brand)' },
    { key: 'etos', label: 'ETOS', color: '#0891b2' },
    { key: 'hmi',  label: 'HMI',  color: '#7c3aed' },
];
const WEEKLY_ITEMS = [
    { key: 'commissioning',    label: '자체시운전', color: '#10b981' },
    { key: 'intCommissioning', label: '통합시운전', color: '#f43f5e' },
];
// #7 항목 on/off: 진행실적 팝업 항목 키 → 팀 설정(progressItems) 키 매핑.
// 매핑에 없는 키(도면입수 등 SIMPLE_ITEMS)는 설정 대상이 아니므로 항상 표시.
const ITEM_SETTING_KEY = { drawing: 'drawing', iomap: 'iomap', screen: 'screen', baseinfo: 'baseinfo', plc: 'plc', etos: 'etos', hmi: 'hmi', commissioning: 'internalTest', intCommissioning: 'integratedTest' };

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

const ProgressModal = ({ row, team, onClose, subRows = [], weeklyLinks, getWeeklyReport, parseWeekly, baseDate = '', onApplyToMonthly, onProgressSaved, progressItems = {}, onShowGraph, mobileMode = false, mobileNav = null }) => {
    // #7 항목 on/off: 팀 설정에서 꺼진 항목은 팝업에서 숨김 + 진척률 계산에서 제외
    const isItemOn = (k) => { const sk = ITEM_SETTING_KEY[k]; return sk ? (progressItems[sk] !== false) : true; };
    const SIMPLE_ON    = SIMPLE_ITEMS.filter(it => isItemOn(it.key));
    const SECONDARY_ON = SECONDARY_ITEMS.filter(it => isItemOn(it.key));
    const WEEKLY_ON    = WEEKLY_ITEMS.filter(it => isItemOn(it.key));
    const selfOn = isItemOn('commissioning');
    const intOn  = isItemOn('intCommissioning');
    const now0 = new Date();
    const cy0 = now0.getFullYear(), cm0 = now0.getMonth() + 1;

    // 표시 범위: 기본=이번 달+지난달(2개월), '전체 기간 보기'=±6개월. 데이터·합계는 그대로, 보이는 칸만 바뀜
    const [showAllMonths, setShowAllMonths] = useState(false);
    // ── 모바일 간편 입력 주 선택 (2026-07-20 팀장님): 기본 = 오늘이 속한 주. PC(mobileMode=false)에선 사용 안 함 ──
    const [mobileWeek, setMobileWeek] = useState({ year: cy0, month: cm0, week: Math.min(5, Math.ceil(now0.getDate() / 7)) });

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
    // 좁은 화면(모바일) 대응 (2026-07-15): 팝업 폭을 화면 폭에 맞춰 줄임 — 주차 영역은 원래 있던 가로 스크롤 사용. PC(넓은 화면)는 기존과 동일.
    const progressPanelW = Math.min(visW + 48, Math.max(320, window.innerWidth - 8));
    const wSummaryPanelW = 520;

    const [pos,        setPos]        = useState({ x: Math.max(4, (window.innerWidth - progressPanelW) / 2), y: 50 });
    const [minimized,  setMinimized]  = useState(false);
    const [weeklyData, setWeeklyData] = useState({});
    const [savedWeekly,setSavedWeekly]= useState({});
    const [saving,     setSaving]     = useState(false);
    const [dirty,      setDirty]      = useState(false);
    const [confirmClose, setConfirmClose] = useState(false);   // ★ 저장 안 하고 닫으려 할 때 경고 (2026-07-14)
    const [pmsData,    setPmsData]    = useState(null);
    const [reloading,  setReloading]  = useState(false);
    const [wSummary,   setWSummary]   = useState(null);
    const [pointSource, setPointSource] = useState((row && row['포인트소스'] === 'int') ? 'int' : 'self'); // ③ 메인표 포인트 실적 출처: self(자체) 또는 int(통합) — 합 없음, 둘 중 택1 (2026-06-29)

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

    // 현재(오늘이 속한) 주차 컬럼이 화면 가운데 오도록 가로 스크롤 — 초기 표시·보기 전환에서 공통 사용
    const scrollToCurrentWeek = () => {
        if (!scrollRef.current) return;
        const idx = DISP_WEEKS.findIndex(c => c.year === cy0 && c.month === cm0 && c.week === Math.ceil(now0.getDate()/7));
        if (idx < 0) return;
        const containerW = scrollRef.current.clientWidth;
        scrollRef.current.scrollLeft = Math.max(0, totalLabelW + idx * weekColW - (containerW - totalLabelW - TOTAL_COL_W) / 2);
    };

    useEffect(() => {
        if (didScrollRef.current || !scrollRef.current) return;
        didScrollRef.current = true;
        scrollToCurrentWeek();
    }, []); // eslint-disable-line

    // ★ '전체 기간 보기' 전환 시 현재 월로 (2026-07-14)
    //   전체보기는 ±6개월이라 표가 작년/1월부터 그려진다. 그대로 두면 화면 왼쪽 끝 = 1월이 보여
    //   정작 이번 달 칸을 보려면 매번 오른쪽으로 스크롤해야 했다 → 전환 직후 현재 주차로 이동시킨다.
    //   (표시 범위·데이터·합계는 그대로. 보이는 위치만 이동)
    useEffect(() => {
        const t = setTimeout(() => scrollToCurrentWeek(), 0);   // 새 열 폭이 DOM에 반영된 뒤 실행
        return () => clearTimeout(t);
    }, [showAllMonths]); // eslint-disable-line

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
        // 0 입력 = 빈칸으로 처리 (2026-07-10 팀장님 결정): 공정률은 빈칸=직전값 이월(회색 힌트) 유지, 시운전은 0=빈칸 동일이라 무해.
        const n = Number(val);
        const parsed = (val === '' || n === 0) ? undefined : Math.max(0, n);
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
    // B-3: 만점은 totalCommissioningPoints 우선(수정 팝업은 tCP만 갱신 → point는 옛 값일 수 있음), 없으면 point,
    //   그래도 없으면 메인표 '포인트'(상세팝업서 입력한 만점) 폴백 — 진행실적이 만점 못 읽어 시운전%가 0이던 문제 해결 (2026-06-29)
    // 2단계(2026-07-20): 하위(공종)가 있으면 총점 = 하위 '포인트' 합 자동 (List 메인표·그래프와 동일 규칙). 합 0이면 기존 폴백 유지.
    const subPtSum = subRows.reduce((s, r) => s + (Number(r?.pt) || 0), 0);
    const totalPt = subPtSum > 0 ? subPtSum : (Number(pmsData?.totalCommissioningPoints || pmsData?.point || row?.['포인트'] || row?.['총']) || 0);   // '총' 폴백 (2026-07-21)

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
        const accIntPts   = Object.values(monthlyIntCommSums).reduce((s, v) => s + v, 0);
        // 시운전 메인표 %·포인트 = '합계(누적)' 기준 — 주차별 키인은 유지, 표엔 전체 누적합으로 뿌림 (팀장님 2026-06-29: 월1회 보고)
        const selfPctCum = totalPt > 0 ? Math.min(100, Math.round(accSelfPts / totalPt * 100)) : null;
        const intPctCum  = totalPt > 0 ? Math.min(100, Math.round(accIntPts  / totalPt * 100)) : null;

        // ── 메인표(List rows) 반영용 mainTable. ★진행실적에 '입력이 있는' 항목만 반영(입력 없는 칸을 0으로 덮어쓰지 않음). ──
        //   공정·제어 7개 = 누적 최신값(itemFinalPct %) / 시운전 2개 = selfPct·intPct(subRows 하위행 합산까지) / 포인트 = 자체 누적합 (자체/통합/합 선택은 task 17)
        const HEADER_MAP = { drawing:'도면입수', iomap:'I/O Map', screen:'화면작성', baseinfo:'기준정보', plc:'PLC', etos:'ETOS', hmi:'HMI' };
        const mainTable = {};
        [...SIMPLE_ITEMS, ...SECONDARY_ITEMS].forEach(({ key }) => {
            const wd = weeklyData[key] || {};
            if (!Object.values(wd).some(v => v !== '' && v !== null && v !== undefined)) return; // 입력 없으면 메인표 안 건드림
            mainTable[HEADER_MAP[key]] = Math.round(itemFinalPct(key));
        });
        if (selfPctCum !== null && accSelfPts > 0) mainTable['자체시운전'] = selfPctCum;
        if (intPctCum  !== null && accIntPts  > 0) mainTable['통합시운전'] = intPctCum;
        // 포인트 칸 = '만점'(상세팝업 입력, 고정)이라 진행실적이 덮지 않음. 실적(포인트실적)은 task ③(자체/통합/합 선택)에서 별도 처리.

        return {
            mainTable,
            plc:  getCurrentWeekVal('plc'),
            etos: getCurrentWeekVal('etos'),
            hmi:  getCurrentWeekVal('hmi'),
            internalTest:   selfPct,
            integratedTest: intPct,
            currPoints: selfPts     > 0 ? selfPts     : null,
            prevPoints: prevSelfPts > 0 ? prevSelfPts : null,
            accPoints:  accSelfPts  > 0 ? accSelfPts  : null,
            monthlyCommSums, monthlyIntCommSums,
            selfPts, intPts, prevSelfPts, accSelfPts, accIntPts, curWeek: nowW,
            monthStr: baseDate, month: m, prevMonthStr,
        };
    };

    // ★ 닫기 요청 (2026-07-14): 입력만 하고 [적용하기]를 안 누른 채 닫으면 값이 사라지므로 먼저 확인.
    const requestClose = () => {
        if (dirty) { setConfirmClose(true); return; }
        onClose?.();
    };

    // ── 모바일: 이전/다음 프로젝트 이동 (2026-07-20 팀장님) — 저장 안 한 변경이 있으면 먼저 확인 ──
    const requestNav = (delta) => {
        if (!mobileNav || !mobileNav.onGo) return;
        if (dirty && !window.confirm('저장하지 않은 변경사항이 있습니다.\n저장하지 않고 다른 프로젝트로 이동할까요?\n(입력한 값은 사라집니다)')) return;
        mobileNav.onGo(delta);
    };

    // ★ 원클릭 적용 (2026-07-20 팀장님): [적용하기] 한 번 = 주차 장부 저장 + 메인표·월간보고 반영까지 전부.
    //   (옛 흐름: 적용하기 → 확인 패널 → [저장] 2단계 → 단계 축소. 확인 패널이 보여주던 수치는 완료 메시지로 대체)
    const handleApplyConfirm = async (dataArg) => {
        const data = dataArg || applyConfirm;
        if (!onApplyToMonthly || !data) return;
        const projectId = row._id || row.id;
        setApplying(true);
        try {
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', `progressRecords_${team}`, docKey), {
                weekly: weeklyData,
                updatedAt: new Date().toISOString(),
            });
            setSavedWeekly(weeklyData); setDirty(false);
            onProgressSaved?.({ docKey, weeklyData });
            // ③ 포인트 실적 = 선택(자체 또는 통합, 합 없음) → 메인표 포인트실적/포인트소스 (2026-06-29)
            const _pts = pointSource === 'int' ? (data.accIntPts || 0) : (data.accSelfPts || 0);
            const _confirm = { ...data, mainTable: { ...data.mainTable, '포인트실적': _pts, '포인트소스': pointSource } };
            await onApplyToMonthly(projectId, _confirm);
            const _bits = [];
            if (data.plc  != null) _bits.push(`PLC ${data.plc}%`);
            if (data.etos != null) _bits.push(`ETOS ${data.etos}%`);
            if (data.hmi  != null) _bits.push(`HMI ${data.hmi}%`);
            _bits.push(`포인트 ${_pts}pt(${pointSource === 'int' ? '통합' : '자체'})`);
            setApplyMsg(`✓ ${data.month}월 저장·적용 완료 — ${_bits.join(' · ')}`);
            setApplyConfirm(null);
            setTimeout(() => setApplyMsg(''), 6000);
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
        const cntCommish = (selfOn ? 1 : 0) + (intOn ? 1 : 0);
        // 진척률 = SIMPLE(4: 도면입수·I/O Map·화면작성·기준정보) + SECONDARY(3: PLC·ETOS·HMI) + 시운전(2) = 9개 평균 (팀장님 확정 2026-06-29, 기준문서)
        const totalItemCnt = SIMPLE_ON.length + SECONDARY_ON.length + cntCommish;
        ALL_WEEKS.forEach(({ key: wKey }) => {
            const sim = [...SIMPLE_ON, ...SECONDARY_ON].reduce((s, { key }) => s + Math.min(100, cumByKey[key]?.[wKey] || 0), 0);
            let wk = 0;
            if (subCumByWeek) {
                const { self = 0, int = 0 } = subCumByWeek[wKey] || {};
                if (selfOn) wk += (totalPt > 0 ? Math.min(100, (self / totalPt) * 100) : 0);
                if (intOn)  wk += (totalPt > 0 ? Math.min(100, (int  / totalPt) * 100) : 0);
            } else {
                wk = WEEKLY_ON.reduce((s, { key }) =>
                    s + (totalPt > 0 ? Math.min(100, ((cumByKey[key]?.[wKey] || 0) / totalPt) * 100) : 0), 0);
            }
            r[wKey] = totalItemCnt > 0 ? Math.round((sim + wk) / totalItemCnt * 10) / 10 : 0;
        });
        return r;
    }, [cumByKey, totalPt, subCumByWeek, progressItems]); // eslint-disable-line

    const overallPct = useMemo(() => {
        const simPct = [...SIMPLE_ON, ...SECONDARY_ON].reduce((s, { key }) => s + itemFinalPct(key), 0);
        let wkPct = 0;
        if (subRows.length > 0) {
            const selfT = subRows.reduce((s, _, i) =>
                s + Object.values(weeklyData[`sub_${i}_commissioning`]    || {}).reduce((a,v) => a+(Number(v)||0), 0), 0);
            const intT  = subRows.reduce((s, _, i) =>
                s + Object.values(weeklyData[`sub_${i}_intCommissioning`] || {}).reduce((a,v) => a+(Number(v)||0), 0), 0);
            if (selfOn) wkPct += (totalPt > 0 ? Math.min(100, (selfT / totalPt) * 100) : 0);
            if (intOn)  wkPct += (totalPt > 0 ? Math.min(100, (intT  / totalPt) * 100) : 0);
        } else {
            wkPct = WEEKLY_ON.reduce((s, { key }) => s + itemFinalPct(key), 0);
        }
        const cntCommish = (selfOn ? 1 : 0) + (intOn ? 1 : 0);
        const totalItemCnt = SIMPLE_ON.length + SECONDARY_ON.length + cntCommish;
        return totalItemCnt > 0 ? Math.round((simPct + wkPct) / totalItemCnt * 10) / 10 : 0;
    }, [weeklyData, totalPt, subRows, refWKey, progressItems]); // eslint-disable-line

    // ── 모바일 간편 입력 패널 (2026-07-20 팀장님 확정) ────────────────────────────────
    //   기본 = 한 주만 크게(오늘이 속한 주). [이전 주]/[다음 주]로 이동, 금주 아니면 [오늘로] 복귀 버튼.
    //   공정률 7개 = 누적 %(빈칸이면 직전값 회색 힌트 — 표와 동일 규칙), 시운전 = 이 주에 딴 포인트(하위 있으면 하위별).
    //   입력은 표와 완전히 같은 장부(updateWeekly)를 씀 — 화면만 다르고 저장·계산은 100% 동일.
    //   '전체 기간 보기' 버튼을 누르면 기존 표로 전환(좌우 스크롤 + 이전/금주/다음 그대로).
    const renderMobileWeekPanel = () => {
        const { year: my, month: mm, week: mw } = mobileWeek;
        const wKey = `${my}-${mm}-${mw}`;
        const isCur = isCurrentWeek(my, mm, mw);
        const wCnt = weeksInMonth(my, mm).length;
        const goPrev = () => { if (mw <= 1) { const p = addMonths(my, mm, -1); setMobileWeek({ year: p.y, month: p.m, week: weeksInMonth(p.y, p.m).length }); } else setMobileWeek({ year: my, month: mm, week: mw - 1 }); };
        const goNext = () => { if (mw >= wCnt) { const n = addMonths(my, mm, 1); setMobileWeek({ year: n.y, month: n.m, week: 1 }); } else setMobileWeek({ year: my, month: mm, week: mw + 1 }); };
        const goToday = () => setMobileWeek({ year: cy0, month: cm0, week: Math.min(5, Math.ceil(now0.getDate() / 7)) });
        const dayRange = ['1~7일', '8~14일', '15~21일', '22~28일', '29일~'][mw - 1] || '';
        const navBtn = { flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 2, background: '#f1f5f9', border: BORDER, borderRadius: 10, color: '#334155', fontSize: 13.5, fontWeight: 800, padding: '10px 12px', cursor: 'pointer' };
        const bigRow = (itemKey, label, color, useMax, unit) => {
            const val = weeklyData[itemKey]?.[wKey];
            const hasVal = val !== undefined && val !== '';
            const prevVal = useMax ? (cumByKey[itemKey]?.[wKey] || 0) : 0;
            const showPrev = useMax && !hasVal && prevVal > 0;
            return (
                <div key={itemKey} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 2px', borderBottom: BORDER_D }}>
                    <div style={{ width: 4, height: 22, background: color, borderRadius: 2, flexShrink: 0 }}/>
                    <div style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 700, color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
                    <input type="number" min="0" inputMode="numeric" value={val ?? ''} placeholder={showPrev ? String(prevVal) : ''}
                        onChange={e => updateWeekly(itemKey, wKey, e.target.value)} onWheel={e => e.target.blur()}
                        onFocus={e => { if (e.target.select) e.target.select(); }}
                        style={{ width: 108, height: 48, fontSize: 21, fontWeight: 800, textAlign: 'center', borderRadius: 10,
                            border: hasVal ? '2px solid var(--brand)' : '1.5px solid #cbd5e1',
                            background: hasVal ? 'rgba(37,99,235,0.06)' : '#fff', color: hasVal ? 'var(--brand)' : '#64748b', outline: 'none', boxSizing: 'border-box' }}/>
                    <span style={{ width: 20, fontSize: 12, fontWeight: 700, color: '#94a3b8', flexShrink: 0 }}>{unit}</span>
                </div>
            );
        };
        return (
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 14px 10px' }}>
                {/* 주 선택 — 큰 버튼. 스크롤해도 상단 고정(sticky) — 지금 몇 주에 입력 중인지 항상 보이게 (2026-07-20) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', position: 'sticky', top: 0, zIndex: 2, background: '#fff', borderBottom: '1px solid #f1f5f9' }}>
                    <button onClick={goPrev} style={navBtn}><ChevronLeft size={16}/> 이전 주</button>
                    <div style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
                        <div style={{ fontSize: 16.5, fontWeight: 800, color: isCur ? '#b45309' : '#0f172a', whiteSpace: 'nowrap' }}>
                            {my !== cy0 ? `${my}년 ` : ''}{mm}월 {mw}주{isCur ? ' (금주)' : ''}
                        </div>
                        <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>{dayRange}</div>
                    </div>
                    <button onClick={goNext} style={navBtn}>다음 주 <ChevronRight size={16}/></button>
                </div>
                {!isCur && (
                    <button onClick={goToday} style={{ width: '100%', marginBottom: 8, background: '#fef9c3', border: '1px solid #fbbf24', borderRadius: 10, color: '#92400e', fontSize: 13, fontWeight: 800, padding: '9px 0', cursor: 'pointer' }}>
                        오늘(금주)로 돌아가기
                    </button>
                )}
                {(SIMPLE_ON.length > 0 || SECONDARY_ON.length > 0) && (
                    <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', letterSpacing: '0.06em', padding: '4px 2px 2px' }}>공정률 (누적 %)</div>
                )}
                {SIMPLE_ON.map(({ key, label, color }) => bigRow(key, label, color, true, '%'))}
                {SECONDARY_ON.map(({ key, label, color }) => bigRow(key, label, color, true, '%'))}
                {(subRows.length > 0 ? (selfOn || intOn) : WEEKLY_ON.length > 0) && (
                    <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', letterSpacing: '0.06em', padding: '10px 2px 2px' }}>시운전 (이 주에 딴 포인트)</div>
                )}
                {subRows.length > 0 ? (
                    subRows.map((sub, i) => (
                        <React.Fragment key={i}>
                            {selfOn && bigRow(`sub_${i}_commissioning`, `${sub.name} · 자체`, '#10b981', false, 'pt')}
                            {intOn && bigRow(`sub_${i}_intCommissioning`, `${sub.name} · 통합`, '#f43f5e', false, 'pt')}
                        </React.Fragment>
                    ))
                ) : (
                    WEEKLY_ON.map(({ key, label, color }) => bigRow(key, label, color, false, 'pt'))
                )}
                <div style={{ marginTop: 10, padding: '10px 12px', background: '#eaf3f9', border: '1.5px solid #a9cde3', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: '#075985' }}>진척률</span>
                    <span style={{ fontSize: 19, fontWeight: 800, color: '#0b5578' }}>{overallPct > 0 ? `${overallPct}%` : '—'}</span>
                </div>
                {/* 이전/다음 프로젝트 이동 (2026-07-20 팀장님): 키인 끝 → 목록 안 거치고 바로 다음 카드로.
                    순서 = 카드 목록(상태 칩 필터 반영 — 진행중 필터면 진행중끼리)와 동일 */}
                {mobileNav && mobileNav.total > 0 && (() => {
                    const hasPrev = mobileNav.idx > 0;
                    const hasNext = mobileNav.idx >= 0 && mobileNav.idx < mobileNav.total - 1;
                    const nb = (on) => ({ flex: 1, height: 46, borderRadius: 10, fontSize: 14, fontWeight: 800, cursor: on ? 'pointer' : 'default',
                        background: on ? '#f1f5f9' : '#f8fafc', border: on ? BORDER : '1px solid #eef1f6', color: on ? '#334155' : '#cbd5e1',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 });
                    return (
                        <div style={{ marginTop: 10 }}>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button disabled={!hasPrev} onClick={() => requestNav(-1)} style={nb(hasPrev)}><ChevronLeft size={16}/> 이전</button>
                                <button onClick={requestClose} style={{ flex: '0 0 auto', height: 46, padding: '0 16px', borderRadius: 10, fontSize: 13.5, fontWeight: 800, cursor: 'pointer', background: '#fff', border: BORDER, color: '#64748b' }}>목록</button>
                                <button disabled={!hasNext} onClick={() => requestNav(1)}
                                    style={{ ...nb(hasNext), background: hasNext ? 'var(--brand)' : '#f8fafc', color: hasNext ? '#fff' : '#cbd5e1', border: hasNext ? '1px solid var(--brand)' : '1px solid #eef1f6' }}>
                                    다음 <ChevronRight size={16}/></button>
                            </div>
                            <div style={{ marginTop: 5, textAlign: 'center', fontSize: 11, color: '#94a3b8', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {mobileNav.idx + 1} / {mobileNav.total}{hasNext ? ` · 다음: ${mobileNav.nextName || ''}` : ' · 마지막 프로젝트'}
                            </div>
                        </div>
                    );
                })()}
                <div style={{ marginTop: 6, fontSize: 10.5, color: '#94a3b8', lineHeight: 1.5 }}>
                    * 공정률 = 누적 % (빈칸이면 회색 직전값 그대로 유지) · 시운전 = 이 주에 새로 딴 포인트만<br/>
                    * 입력 후 [적용하기] 한 번이면 저장 + 메인표·월간보고 반영까지 끝납니다
                </div>
            </div>
        );
    };

    // ★ 4자리 잘림 수정 (2026-07-20 실측): 44px 주차 칸 + 14px 글씨는 3자리까지만 들어감 →
    //   '1000'이 '100'처럼 보여 값이 바뀐 걸로 오해(데이터는 정상, 합계가 그 증거).
    //   글자 수에 맞춰 글씨를 자동 축소해 끝자리까지 항상 보이게 한다 (값·회색 힌트 공통).
    const cellFontFit = (txt) => { const n = String(txt ?? '').length; return n >= 5 ? 9.5 : n === 4 ? 10.5 : 14; };

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
                    // #8 이전값: 공정 항목(useMax=누적%)의 빈 칸에 직전 값(이월)을 흐린 힌트로 표시 (참고용·저장 안 됨)
                    const prevVal  = useMax ? (cumByKey[itemKey]?.[wKey] || 0) : 0;
                    const showPrev = useMax && !hasVal && prevVal > 0;
                    const extraCls = wKey === startWKey ? 'pw-start' : wKey === endWKey ? 'pw-end' : '';
                    return (
                        <td key={wKey} className={extraCls} style={{ ...TD, background: isCur?'#fef9e7':'#f8fafc' }}>
                            <input type="number" min="0" inputMode="numeric" value={val??''} placeholder={showPrev ? String(prevVal) : ''} data-w={wKey} onChange={e => updateWeekly(itemKey, wKey, e.target.value)} onKeyDown={e => cellKeyNav(e, wKey)} onWheel={e => e.target.blur()}
                                style={{ display:'block', width:'100%', height:38, background: hasVal?'rgba(37,99,235,0.07)':'transparent',
                                    border:'none', outline:'none', color: hasVal?'var(--brand)':'#94a3b8',
                                    fontSize: cellFontFit(hasVal ? val : (showPrev ? prevVal : '')), fontWeight: hasVal?700:400,
                                    textAlign:'center', boxSizing:'border-box', padding:'0 2px', cursor:'text' }}
                                onFocus={e => { if (e.target.select) e.target.select(); e.target.style.background='rgba(30,122,200,0.08)'; e.target.style.boxShadow='inset 0 0 0 2px var(--brand)'; e.target.style.color='#1e293b'; }}
                                onBlur={e => {
                                    const v = weeklyData[itemKey]?.[wKey];
                                    const hv = v !== undefined && v !== '';
                                    e.target.style.background = hv?'rgba(37,99,235,0.07)':'transparent';
                                    e.target.style.boxShadow = 'none';
                                    e.target.style.color = hv?'var(--brand)':'#94a3b8';
                                }}/>
                        </td>
                    );
                })}
                <td style={{ ...TD, padding:'0 10px', fontWeight:800, fontSize:14, color: total>0?color:'var(--line)', background:bgLabel, textAlign:'right', position:'sticky', right:0, zIndex:1 }}>
                    {total > 0 ? ((!useMax && totalPt > 0 && total > totalPt)
                        ? <span title={`총점 ${totalPt} 초과 — 주차값 또는 총점 설정을 확인하세요`} style={{ color:'#dc2626', background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:4, padding:'0 5px', fontWeight:800, whiteSpace:'nowrap' }}>⚠ {total}</span>
                        : (useMax ? `${total}%` : total)) : (useMax ? '' : 0)}
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
                            fontSize: cellFontFit(hasVal ? val : ''), fontWeight: hasVal?700:400,
                            textAlign:'center', boxSizing:'border-box', padding:'0 2px', cursor:'text' }}
                        onFocus={e => { if (e.target.select) e.target.select(); e.target.style.background='rgba(30,122,200,0.08)'; e.target.style.boxShadow='inset 0 0 0 2px var(--brand)'; e.target.style.color='#1e293b'; }}
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

        // #7 항목 on/off: 자체/통합 시운전이 꺼지면 해당 줄 숨김. 이름 칸(rowSpan)은 보이는 줄 수에 맞춤.
        const visibleCount = (selfOn ? 1 : 0) + (intOn ? 1 : 0);
        if (visibleCount === 0) return null;
        const nameCell = (
            <td rowSpan={visibleCount} style={{ ...TD, padding:'0 6px', fontWeight:700, color:'#374151',
                background:'#fffbeb', position:'sticky', left:0, zIndex:1,
                textAlign:'center', verticalAlign:'middle', borderRight: BORDER_D }}>
                <div style={{ fontSize:12, lineHeight:1.3 }}>{subName}</div>
            </td>
        );
        return (
            <React.Fragment key={`sub-${subIdx}`}>
                {selfOn && (
                <tr>
                    {nameCell}
                    <td style={{ ...TD, padding:'0 4px', fontWeight:800, color:'var(--st-done)',
                        background:'#ecfdf5', position:'sticky', left:LABEL_COL_W, zIndex:1,
                        fontSize:11, height:34, borderRight: BORDER, textAlign:'center' }}>자체</td>
                    {makeInput(selfD, selfKey, 'var(--st-done)', '#f0fdf4')}
                    <td style={{ ...TD, padding:'0 8px', fontWeight:800, fontSize:13,
                        color: selfTotal>0?'var(--st-done)':'var(--line)', background:'#ecfdf5',
                        textAlign:'right', position:'sticky', right:0, zIndex:1 }}>
                        {selfTotal > 0 ? selfTotal : ''}
                    </td>
                </tr>
                )}
                {intOn && (
                <tr>
                    {!selfOn && nameCell}
                    <td style={{ ...TD, padding:'0 4px', fontWeight:800, color:'#be123c',
                        background:'#fff1f2', position:'sticky', left:LABEL_COL_W, zIndex:1,
                        fontSize:11, height:34, borderRight: BORDER, textAlign:'center' }}>통합</td>
                    {makeInput(intD, intKey, '#be123c', '#fff1f2')}
                    <td style={{ ...TD, padding:'0 8px', fontWeight:800, fontSize:13,
                        color: intTotal>0?'#be123c':'var(--line)', background:'#fff1f2',
                        textAlign:'right', position:'sticky', right:0, zIndex:1 }}>
                        {intTotal > 0 ? intTotal : ''}
                    </td>
                </tr>
                )}
            </React.Fragment>
        );
    };

    const renderCommTotal = (type) => {
        const isSelf  = type === 'self';
        const color   = isSelf ? 'var(--st-done)' : '#be123c';
        const bgHead  = isSelf ? '#d1fae5' : '#ffe4e6';
        const bgCell  = isSelf ? '#ecfdf5' : '#fff1f2';
        const label   = isSelf ? '자체시운전' : '통합시운전';
        const subKey  = isSelf ? 'commissioning' : 'intCommissioning';
        const grandTotal = subRows.reduce((s, _, i) =>
            s + Object.values(weeklyData[`sub_${i}_${subKey}`] || {}).reduce((a,v) => a+(Number(v)||0), 0), 0);

        return (
            <tr key={`total-${type}`}>
                <td colSpan={2} style={{ ...TD, padding:'0 10px', fontWeight:800, fontSize:13, color,
                    background: bgHead, position:'sticky', left:0, zIndex:1, height:38, verticalAlign:'middle' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                        <div style={{ width:4, height:16, background:color, borderRadius:2, flexShrink:0 }}/>
                        {label}
                    </div>
                </td>
                {DISP_WEEKS.map(({ key: wKey, year, month, week }) => {
                    const weekSum = subRows.reduce((s, _, i) =>
                        s + (Number((weeklyData[`sub_${i}_${subKey}`]||{})[wKey]) || 0), 0);
                    const isCur = isCurrentWeek(year, month, week);
                    const extraCls = wKey === startWKey ? 'pw-start' : wKey === endWKey ? 'pw-end' : '';
                    return <td key={wKey} className={extraCls} style={{ ...TD, fontWeight:800, fontSize: cellFontFit(weekSum > 0 ? weekSum : ''),
                        color: weekSum>0?color:'var(--line)', background: isCur?'#fef9e7':bgCell,
                        height:38, verticalAlign:'middle' }}>
                        {weekSum > 0 ? weekSum : ''}
                    </td>;
                })}
                <td style={{ ...TD, padding:'0 8px', fontWeight:800, fontSize:14, color: grandTotal>0?color:'var(--line)',
                    background: bgHead, textAlign:'right', position:'sticky', right:0, zIndex:1 }}>
                    {grandTotal > 0 ? ((totalPt > 0 && grandTotal > totalPt)
                        ? <span title={`총점 ${totalPt} 초과 — 주차값 또는 총점 설정을 확인하세요`} style={{ color:'#dc2626', background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:4, padding:'0 5px', fontWeight:800, whiteSpace:'nowrap' }}>⚠ {grandTotal}</span>
                        : grandTotal) : ''}
                </td>
            </tr>
        );
    };

    const progressColor = (pct) => {
        if (pct === null || pct === undefined) return '#666666';
        if (pct >= 90) return 'var(--st-done)';
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
                                style={{ background:'#f1f5f9', border:'1px solid var(--line)', color:'#444',
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
                                style={{ background:'#edf1f7', border:'1px solid var(--line)', borderRadius:4,
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
                        border:'1px solid var(--line)' }}>
                        <colgroup>
                            <col style={{ width: HDR_W }}/>
                            {normalRows.map((_, i) => <col key={i} style={{ width: COL_W }}/>)}
                            {totalRows.map((_, i) => <col key={'t'+i} style={{ width: TOTAL_COL_W }}/>)}
                        </colgroup>
                        <thead>
                            <tr>
                                <th style={{ ...thSt, textAlign:'left', position:'sticky', left:0, zIndex:2, padding:'4px 6px' }}>구분</th>
                                {normalRows.map((row, ri) => (
                                    <th key={ri} style={{ ...thSt, textAlign:'center', color:'#1e4f8c', fontSize:10,
                                        borderLeft:'1px solid var(--line)', padding:'4px 3px',
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
                                                    borderTop:'1px solid var(--line)',
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
                                                            borderLeft:'1px solid var(--line)',
                                                            borderTop:'1px solid var(--line)',
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
                                                            borderTop:'1px solid var(--line)',
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
        <div style={{ position:'fixed', left: mobileMode ? Math.max(3, (window.innerWidth - modalW) / 2) : pos.x, top: mobileMode ? 6 : pos.y, width:modalW, zIndex:9500,
            background:'#ffffff', border:'1px solid var(--line)', borderRadius:14,
            boxShadow:'0 20px 60px rgba(0,0,0,0.1)',
            display:'flex', flexDirection:'column',
            /* 모바일(2026-07-20): vh는 폰 하단 툴바 뒤까지 포함해 푸터(적용하기)가 화면 밖으로 밀림 → 실제 보이는 높이(innerHeight)로 고정 */
            maxHeight: mobileMode ? (window.innerHeight - 12) + 'px' : '88vh' }}>
            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.progress-modal-table td:last-child { box-shadow: -6px 0 8px -7px rgba(15,23,42,0.18); }
.progress-modal-table input::placeholder { color:#b4bcca; font-style:italic; font-weight:400; opacity:1; }`}</style>

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
                    {/* 주간보고 적용 — 주간보고 라인 사용 미정(보류)이라 숨김. 기능(handleWeeklyLinked/handleWeeklyFile 등)은 보관.
                        주간보고 사용 확정 시 아래 false를 조건으로 교체 (2026-07-06) */}
                    {false && (
                    <button
                        onClick={() => setShowWPanel(p => !p)}
                        style={{ background: showWPanel ? '#dbeafe' : '#f1f5f9', border:'1px solid #c7d2fe',
                            color: showWPanel ? 'var(--brand)' : '#475569', fontSize:11, fontWeight:700,
                            padding:'3px 10px', cursor:'pointer', display:'flex', alignItems:'center', gap:4, borderRadius:4 }}
                        title="주간보고 Excel에서 실적 가져오기">
                        주간보고 적용
                    </button>
                    )}
                    <button onClick={() => setMinimized(p => !p)} style={{ background:'none', border:'none', color:'#94a3b8', cursor:'pointer', padding:2, display:'flex' }}><Minus size={13}/></button>
                    <button onClick={requestClose}                style={{ background:'none', border:'none', color:'#94a3b8', cursor:'pointer', padding:2, display:'flex' }}><X size={13}/></button>
                </div>
            </div>

            {/* 주간보고 적용 컨트롤 패널(기간·파일선택) — 버튼과 함께 숨김 (2026-07-06, 주간보고 보류) */}
            {false && showWPanel && (
                <div style={{ flexShrink:0, background:'#eff6ff', borderBottom:'2px solid #bfdbfe',
                    padding:'8px 18px', display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
                    <span style={{ fontSize:11, fontWeight:800, color:'var(--brand)' }}>기간</span>
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
                                style={{ background: wApplying ? '#93c5fd' : 'var(--brand)', border:'none', color:'#fff',
                                    fontSize:11, fontWeight:800, padding:'4px 14px',
                                    cursor: wApplying ? 'default' : 'pointer', borderRadius:4 }}>
                                {wApplying ? '분석 중...' : '연결파일 불러오기'}
                            </button>
                        )}
                        <button onClick={() => weeklyFileRef.current?.click()} disabled={wApplying}
                            style={{ background:'#ffffff', border:'1px solid #93c5fd', color:'var(--brand)',
                                fontSize:11, fontWeight:700, padding:'4px 12px', cursor:'pointer', borderRadius:4 }}>
                            {wApplying ? '분석 중...' : '파일 선택'}
                        </button>
                    </div>
                    {wApplyMsg && (
                        <span style={{ width:'100%', fontSize:11, fontWeight:700,
                            color: wApplyMsg.startsWith('✓') ? 'var(--st-done)' : wApplyMsg.startsWith('분석') ? 'var(--brand)' : '#dc2626' }}>
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
                                <span style={{ fontSize:10, fontWeight:800, color:'var(--st-done)', letterSpacing:'0.08em' }}>POINT</span>
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
                                            <span style={{ fontSize:13, fontWeight:800, color:'var(--brand)', fontFamily:'monospace' }}>{execNoVal}</span>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        {/* 네비게이션 버튼 — flex 고정 영역 */}
                        <div style={{ flexShrink:0, padding:'8px 18px 4px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                            <div style={{ fontSize:10, fontWeight:800, color:'#94a3b8', letterSpacing:'0.1em', textTransform:'uppercase' }}>
                                진행실적 <span style={{ fontWeight:400, color:'var(--line)' }}>· 셀 클릭으로 직접 입력</span>
                            </div>
                            <div style={{ display:'flex', gap:6 }}>
                                {/* 이전·금주·다음 = 표를 좌우로 스크롤하는 버튼. 기본 2개월 보기에선 표가 다 보여 스크롤이 없어 무의미 → '전체 기간 보기'일 때만 노출 (2026-07-10) */}
                                {showAllMonths && (<>
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
                                </>)}
                                <button onClick={() => setShowAllMonths(v => !v)}
                                    style={{ background: showAllMonths ? '#dbeafe' : '#f1f5f9', border: showAllMonths ? '1px solid #93c5fd' : BORDER, borderRadius:6, color: showAllMonths ? 'var(--brand)' : '#64748b', cursor:'pointer', padding:'4px 10px', fontSize:12, fontWeight:700 }}>
                                    {showAllMonths ? '이번 기간만' : '전체 기간 보기'}
                                </button>
                            </div>
                        </div>

                        {/* 모바일 간편 입력 (2026-07-20): mobileMode + 기본 보기 = 한 주 패널 / '전체 기간 보기' = 기존 표 */}
                        {(mobileMode && !showAllMonths) ? renderMobileWeekPanel() : (<>
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
                                            return <th key={year} colSpan={span} style={{ ...TH, color:'var(--brand)' }}>{year}년</th>;
                                        })}
                                        <th style={{ ...TH, color:'var(--st-done)', position:'sticky', right:0, zIndex:3 }} rowSpan={3}>합계</th>
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
                                    {SIMPLE_ON.map(({ key, label, color }) => renderRow(key, label, color, '#fafafa', true))}
                                    <tr>
                                        <td colSpan={DISP_WEEKS.length + 3} style={{ padding:0, background:'#c4b5fd', height:1, border:'none' }}/>
                                    </tr>
                                    {SECONDARY_ON.map(({ key, label, color }) => renderRow(key, label, color, '#f5f3ff', true))}

                                    <tr>
                                        <td colSpan={DISP_WEEKS.length + 3} style={{ padding:0, background:'#e2e8f0', height:1, border:'none' }}/>
                                    </tr>

                                    {subRows.length > 0 ? (<>
                                        <tr>
                                            <td colSpan={DISP_WEEKS.length + 3} style={{ padding:'1px 12px', background:'#f1f5f9',
                                                height:10, borderBottom:'1px solid var(--line)', borderTop:'none' }}>
                                                <span style={{ fontSize:10, fontWeight:800, color:'#334155', letterSpacing:'0.05em' }}>시운전</span>
                                            </td>
                                        </tr>
                                        {subRows.map((sub, i) => renderSubRow(i, sub.name))}
                                        <tr>
                                            <td colSpan={DISP_WEEKS.length + 3} style={{ padding:0, background:'var(--line)', height:2, border:'none' }}/>
                                        </tr>
                                        {selfOn && renderCommTotal('self')}
                                        {intOn  && renderCommTotal('int')}
                                    </>) : (<>
                                        {WEEKLY_ON.map(({ key, label, color }) => renderRow(key, label, color, '#f8fafc'))}
                                    </>)}

                                    <tr>
                                        <td colSpan={DISP_WEEKS.length + 3} style={{ padding:0, background:'#e2e8f0', height:2, border:'none' }}/>
                                    </tr>

                                    {/* ★ 진척률 행 — 가장 중요한 수치인데 글자가 제일 작았음(11px) → 강조 (2026-07-14)
                                        · 주차 셀 11 → 14px, 합계 14 → 18px, 굵기 800, 진한 파랑
                                        · 행 높이 34 → 42px, 세로 가운데 정렬(다른 행 38px 입력칸과 시각적으로 맞춤)
                                        · 위쪽 굵은 구분선 + 진한 배경으로 '결론 줄'임을 명확히 */}
                                    <tr style={{ height:42 }}>
                                        <td colSpan={2} style={{ ...TD, padding:'0 10px', fontWeight:800, fontSize:14.5, color:'#075985',
                                            background:'#eaf3f9', height:42, verticalAlign:'middle', borderTop:'1.5px solid #a9cde3',
                                            position:'sticky', left:0, zIndex:1 }}>
                                            <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                                                <div style={{ width:4, height:18, background:'#7fb3d3', borderRadius:2, flexShrink:0 }}/>
                                                <span>진척률<span style={{ fontSize:11, fontWeight:700, color:'#3d7fa5', marginLeft:2 }}>(%)</span></span>
                                            </div>
                                        </td>
                                        {DISP_WEEKS.map(({ key: wKey, year, month, week }) => {
                                            const pct = pctByWeek[wKey] || 0;
                                            const hasData = subRows.length > 0
                                                ? [...SECONDARY_ON].some(({ key }) => (Number((weeklyData[key]||{})[wKey])||0) > 0)
                                                  || subRows.some((_, i) =>
                                                      (selfOn && (Number((weeklyData[`sub_${i}_commissioning`]   ||{})[wKey])||0) > 0) ||
                                                      (intOn  && (Number((weeklyData[`sub_${i}_intCommissioning`]||{})[wKey])||0) > 0))
                                                : [...SECONDARY_ON, ...WEEKLY_ON].some(({ key }) => (Number((weeklyData[key]||{})[wKey])||0) > 0);
                                            const isCur = isCurrentWeek(year, month, week);
                                            const extraCls = wKey === startWKey ? 'pw-start' : wKey === endWKey ? 'pw-end' : '';
                                            const show = hasData && pct > 0;
                                            // ★ '%' 기호 제거 (2026-07-14): 셀 폭 44px에 '68.9%'(5글자)는 안 들어가 옆 칸과 붙었음.
                                            //    헤더가 이미 '진척률(%)'이라 단위는 명확 → 숫자만. 소수부는 작게 써서 정수부가 먼저 읽히게.
                                            const _s = show ? String(pct).split('.') : null;
                                            return <td key={wKey} className={extraCls} style={{ ...TD, fontWeight:800,
                                                color: show ? '#0f5f8a' : '#bcd3e1', background: isCur?'#fdf3d8':'#eaf3f9',
                                                height:42, verticalAlign:'middle', borderTop:'1.5px solid #a9cde3', whiteSpace:'nowrap',
                                                padding:'0 2px', letterSpacing:'-0.02em' }}>
                                                {show ? (
                                                    <span style={{ display:'inline-flex', alignItems:'baseline', justifyContent:'center' }}>
                                                        <span style={{ fontSize:15 }}>{_s[0]}</span>
                                                        {_s[1] !== undefined && <span style={{ fontSize:10.5, opacity:0.7 }}>.{_s[1]}</span>}
                                                    </span>
                                                ) : <span style={{ fontSize:12 }}>—</span>}
                                            </td>;
                                        })}
                                        <td style={{ ...TD, padding:'0 8px', background:'#d9e9f4', textAlign:'right',
                                            height:42, verticalAlign:'middle', borderTop:'1.5px solid #a9cde3',
                                            position:'sticky', right:0, zIndex:1 }}>
                                            {overallPct > 0 ? (
                                                <span style={{ display:'inline-flex', alignItems:'baseline', justifyContent:'flex-end', color:'#0b5578', letterSpacing:'-0.02em', whiteSpace:'nowrap' }}>
                                                    <span style={{ fontSize:19, fontWeight:800 }}>{String(overallPct).split('.')[0]}</span>
                                                    {String(overallPct).split('.')[1] !== undefined &&
                                                        <span style={{ fontSize:12, fontWeight:800, opacity:0.75 }}>.{String(overallPct).split('.')[1]}</span>}
                                                    <span style={{ fontSize:11, fontWeight:700, opacity:0.7, marginLeft:1 }}>%</span>
                                                </span>
                                            ) : <span style={{ fontSize:13, color:'#9ab5c7' }}>—</span>}
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        </>)}

                        {/* 주석 — flex 고정 영역 */}
                        <div style={{ flexShrink:0, padding:'3px 18px 6px', fontSize:10, color:'var(--line)' }}>
                            * 1주: 1~7일, 2주: 8~14일, 3주: 15~21일, 4주: 22~28일, 5주: 29일~) · 배경= 현재주 · 주황= 시작주 · 녹색테두리= 완료주
                        </div>
                    </div>

                    {/* 오른쪽: 주간보고 분석 결과 패널 */}
                    {renderWSummaryPanel()}
                </div>
            )}

            {/* (2026-07-20) 적용 확인 패널 제거 — [적용하기] 원클릭으로 즉시 저장+적용, 결과는 푸터 완료 메시지로 표시 */}

            {onApplyToMonthly && (() => {
                const _sum = (base) => subRows.length > 0
                    ? subRows.reduce((s,_,i)=>s+Object.values(weeklyData[`sub_${i}_${base}`]||{}).reduce((a,v)=>a+(Number(v)||0),0),0)
                    : Object.values(weeklyData[base]||{}).reduce((a,v)=>a+(Number(v)||0),0);
                const _self = _sum('commissioning'), _int = _sum('intCommissioning');
                const _so = totalPt>0 && _self>totalPt, _io = totalPt>0 && _int>totalPt;
                if (!_so && !_io) return null;
                const _p = [];
                if (_so) _p.push(`자체시운전 ${_self}`);
                if (_io) _p.push(`통합시운전 ${_int}`);
                return (
                    <div style={{ flexShrink:0, padding:'8px 18px', background:'#fef2f2', borderTop:'2px solid #dc2626', display:'flex', alignItems:'center', gap:6 }}>
                        <span style={{ fontSize:12, fontWeight:800, color:'#b91c1c', lineHeight:1.4 }}>⚠ {_p.join(' · ')} 포인트가 총점 {totalPt}을(를) 초과했습니다 — 주차값 또는 총점 설정을 확인하세요.</span>
                    </div>
                );
            })()}

            {/* 푸터 */}
            <div style={{ flexShrink:0, padding:'10px 18px', borderTop:BORDER, background:'#f8fafc', borderRadius:'0 0 14px 14px', display:'flex', alignItems:'center', gap:8 }}>
                {applyMsg
                    ? <span style={{ fontSize:11, fontWeight:700, color: applyMsg.startsWith('✓') ? 'var(--st-done)' : '#dc2626', marginRight:'auto' }}>{applyMsg}</span>
                    : dirty
                        ? <span style={{ fontSize:11, color:'#f59e0b', marginRight:'auto', fontWeight:700 }}>저장하지 않은 변경사항</span>
                        : <span style={{ fontSize:11, color:'var(--line)', marginRight:'auto' }}>변경사항 없음</span>
                }
                {/* 새로고침 숨김 (2026-07-10): 팝업은 열 때마다 자동으로 최신 로드 → 중복. 게다가 저장 안 한 입력을 경고 없이 되돌려 위험. 되살리려면 false→true. */}
                {false && (
                <button onClick={handleReload} disabled={saving || reloading}
                    style={{ background:'#f1f5f9', border:BORDER, borderRadius:7, color:'#374151', fontSize:12, fontWeight:700, padding:'6px 10px', cursor: reloading ? 'default' : 'pointer', display:'flex', alignItems:'center', gap:4 }}
                    title="Firestore에서 최신 데이터를 다시 불러오기">
                    <RefreshCw size={13} style={{ animation: reloading ? 'spin 0.8s linear infinite' : 'none' }}/>
                    {reloading ? '로딩...' : '새로고침'}
                </button>
                )}
                {onApplyToMonthly && (
                    <span style={{ display:'flex', alignItems:'center', gap:4, fontSize:11, fontWeight:700 }}>
                        <span style={{ color:'#64748b' }}>메인표 시운전:</span>
                        <button onClick={() => setPointSource('self')} title="자체시운전 포인트를 메인표에 반영"
                            style={{ background: pointSource==='self'?'#16a34a':'#fff', color: pointSource==='self'?'#fff':'#15803d', border:'1px solid #86efac', borderRadius:5, fontSize:11, fontWeight:700, padding:'5px 11px', cursor:'pointer' }}>자체</button>
                        <button onClick={() => setPointSource('int')} title="통합시운전 포인트를 메인표에 반영"
                            style={{ background: pointSource==='int'?'#16a34a':'#fff', color: pointSource==='int'?'#fff':'#15803d', border:'1px solid #86efac', borderRadius:5, fontSize:11, fontWeight:700, padding:'5px 11px', cursor:'pointer' }}>통합</button>
                    </span>
                )}
                {onApplyToMonthly && (
                    <button onClick={() => { const d = computeApplyData(); if (!d) { setApplyMsg('기준월 정보가 없어 적용할 수 없습니다'); setTimeout(() => setApplyMsg(''), 3000); return; } handleApplyConfirm(d); }} disabled={saving || applying}
                        style={{ background:'#f0fdf4', border:'1px solid #86efac', borderRadius:7, color:'#15803d', fontSize:12, fontWeight:800, padding:'6px 16px', cursor:'pointer' }}>
                        적용하기
                    </button>
                )}
                {/* ★ 실적 그래프로 바로 이동 (2026-07-14) — 그래프는 '저장된 값'으로 그려지므로 미저장 상태면 먼저 안내 */}
                {onShowGraph && (
                    <button onClick={() => {
                        if (dirty) { setApplyMsg('저장하지 않은 값이 있습니다 — [적용하기]로 저장한 뒤 그래프를 확인하세요'); setTimeout(() => setApplyMsg(''), 5000); return; }
                        onShowGraph();
                    }} disabled={saving || applying}
                        style={{ background:'#eff6ff', border:'1px solid #93c5fd', borderRadius:7, color:'#1e40af', fontSize:12, fontWeight:800, padding:'6px 14px', cursor:'pointer', display:'flex', alignItems:'center', gap:5 }}>
                        <BarChart3 size={13}/> 실적 그래프
                    </button>
                )}
                <button onClick={requestClose} disabled={saving || applying}
                    style={{ background:'#f1f5f9', border:BORDER, borderRadius:7, color:'#374151', fontSize:12, fontWeight:700, padding:'6px 18px', cursor:'pointer' }}>
                    닫기
                </button>
            </div>

            {/* ★ 저장 안 하고 닫기 경고 (2026-07-14) — 입력만 하고 [적용하기]를 안 누르면 값이 사라짐 */}
            {confirmClose && (
                <div style={{ position:'fixed', inset:0, zIndex:9600, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.45)' }}>
                    <div style={{ background:'#fff', border:'1.5px solid #f59e0b', width:420, maxWidth:'92vw', overflow:'hidden', boxShadow:'0 8px 40px rgba(0,0,0,0.25)' }}>
                        <div style={{ background:'#f59e0b', padding:'9px 16px', color:'#fff', fontSize:12, fontWeight:800 }}>
                            ⚠ 저장하지 않은 변경사항이 있습니다
                        </div>
                        <div style={{ padding:'16px', fontSize:12.5, color:'#222', lineHeight:1.75 }}>
                            입력하신 실적은 아직 저장되지 않았습니다.<br/>
                            아래 <b style={{ color:'#15803d' }}>[적용하기]</b> 를 눌러야 메인표와 클라우드에 저장됩니다.<br/><br/>
                            <span style={{ color:'#b45309', fontWeight:700 }}>지금 그냥 닫으면 방금 입력한 값이 모두 사라집니다.</span>
                        </div>
                        <div style={{ display:'flex', gap:8, justifyContent:'flex-end', padding:'10px 16px', borderTop:'1px solid #e5eaf3', background:'#f8fafc' }}>
                            <button onClick={() => { setConfirmClose(false); onClose?.(); }}
                                style={{ padding:'6px 14px', fontSize:12, fontWeight:700, color:'#b91c1c', background:'#fff', border:'1px solid #fecaca', cursor:'pointer' }}>
                                저장 안 하고 닫기
                            </button>
                            <button onClick={() => setConfirmClose(false)}
                                style={{ padding:'6px 14px', fontSize:12, fontWeight:800, color:'#fff', background:'#15803d', border:'1px solid #15803d', cursor:'pointer' }}>
                                돌아가서 저장하기
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProgressModal;
