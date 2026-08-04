import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
    Upload, Download, Trash2, X, LogOut,
    AlertTriangle, Search, FileSpreadsheet,
    Edit2, Save, ChevronUp, ChevronDown, Plus, Target, Camera, ArrowDownAZ, Settings
} from 'lucide-react';
import { loadXLSX, loadExcelJS, loadFileSaver, loadTesseract } from '../utils';
import { db, appId } from '../firebase';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';

const EST_STORE_KEY = 'pms_estimate_data_v1';
const REPORT_STORE_KEY = 'pms_estimate_reports_v1'; // 월별 보고서 저장 { 'YYYY-MM': {headers, rows} }
// ── 공유(Firebase) 저장 경로 — 기존 프로젝트 데이터와 같은 위치라 인증·보안규칙 동일 적용 ──
const estListDoc    = () => doc(db, 'artifacts', appId, 'public', 'data', 'estimate', 'list');    // 통합 견적목록
const estReportsDoc = () => doc(db, 'artifacts', appId, 'public', 'data', 'estimate', 'reports');  // 월별 보고서 전체
const UP_YEARS = ['2025', '2026', '2027'];
const UP_MONTHS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];

const DROPDOWN_KW = ['진행', '현황', '담당자', '공사업체', '업체담당자'];
const isDateCol     = (h) => ['날짜', '일자', 'Date', '일시', '발행일'].some(k => h.includes(k));
const isDropdownCol = (h) => DROPDOWN_KW.some(k => h.includes(k));

// 견적서 사진 OCR용 고정 컬럼
const EST_COLUMNS = ['발행일', '견적번호', '고객명', '담당자/tel', 'End User', '내용', '견적가', '수주가', '특기사항', '진행'];

// 각 컬럼을 찾기 위한 라벨(견적서에 흔한 표기)
const EST_FIELDS = [
    { key: '발행일',     labels: ['발행일', '발행 일', '견적일', '작성일', '일자', 'date'] },
    { key: '견적번호',   labels: ['견적번호', '견적 번호', '견적no', '문서번호', 'quotation', 'quote'] },
    { key: '고객명',     labels: ['고객명', '고객', '수신', '업체명', '회사명', '거래처', '상호'] },
    { key: '담당자/tel', labels: ['담당자', '담당', '연락처', '전화', 'tel', '휴대폰', '핸드폰', 'h.p', 'hp'] },
    { key: 'End User',   labels: ['end user', 'enduser', '엔드유저', '실사용', '수요처', '납품처', '현장'] },
    { key: '내용',       labels: ['내용', '품명', '품 명', '규격', '품목', '제품', '사양', 'item'] },
    { key: '견적가',     labels: ['견적가', '견적금액', '견적 금액', '공급가', '합계', '총액', '금액', 'total'] },
    { key: '수주가',     labels: ['수주가', '수주금액', '수주 금액', '계약가', '낙찰가', '수주'] },
    { key: '특기사항',   labels: ['특기사항', '특기', '비고', '참고', 'remark', 'note', '기타'] },
];

// OCR 텍스트 → 한 행(견적) 파싱
const parseEstimateText = (text) => {
    const row = {};
    EST_COLUMNS.forEach(c => { row[c] = ''; });
    const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
        const low = line.toLowerCase();
        for (const f of EST_FIELDS) {
            if (row[f.key]) continue;
            for (const lab of f.labels) {
                const idx = low.indexOf(lab.toLowerCase());
                if (idx >= 0) {
                    const val = line.slice(idx + lab.length).replace(/^[\s:：·\-=]+/, '').trim();
                    if (val) row[f.key] = val;
                    break;
                }
            }
        }
    }
    // 발행일 정규화 (2026.7.1 / 2026년 7월 1일 → 2026-07-01)
    if (row['발행일']) {
        const d = row['발행일'].match(/(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/);
        if (d) row['발행일'] = `${d[1]}-${String(d[2]).padStart(2, '0')}-${String(d[3]).padStart(2, '0')}`;
    }
    // 금액은 숫자(콤마 포함)만
    ['견적가', '수주가'].forEach(k => {
        if (row[k]) { const m = row[k].match(/[\d][\d,]{2,}/); if (m) row[k] = m[0]; }
    });
    return row;
};

// 진행 상태(칩) 항목 + 색상
const EST_STATUSES = ['진행중', '집행', '완료', '검토중', 'invoice'];
const STATUS_CHIP_COLOR = {
    '진행중':  { bg: 'rgba(59,130,246,0.18)',  text: '#60a5fa', border: '#3b82f6' },
    '집행':    { bg: 'rgba(168,85,247,0.18)',  text: '#c084fc', border: '#a855f7' },
    '완료':    { bg: 'rgba(16,185,129,0.18)',  text: '#34d399', border: '#10b981' },
    '검토중':  { bg: 'rgba(245,158,11,0.18)',  text: '#fbbf24', border: '#f59e0b' },
    'invoice': { bg: 'rgba(236,72,153,0.18)',  text: '#f472b6', border: '#ec4899' },
};
// 변화 현황 칩 스타일 — 완료는 강한 빨강으로 진하게 하이라이트
const historyChipStyle = (st, changed) => {
    if (st === '완료') {
        return { background: '#dc2626', color: '#fff', borderColor: '#f87171', fontWeight: 800, boxShadow: changed ? '0 0 0 2px #fbbf24' : '0 0 0 1px #ef4444' };
    }
    const c = STATUS_CHIP_COLOR[st];
    return { background: c.bg, color: c.text, borderColor: changed ? '#fbbf24' : c.border, boxShadow: changed ? '0 0 0 1px #fbbf24' : 'none' };
};
// 연·월 인식 (2026-01, 2026.1, 2026년 1월 등)
const YM_RE = /(20\d{2})\s*[.\-/년]\s*(\d{1,2})/;
// 한 행에서 월(YYYY-MM) 추출: 날짜열 우선 → 아무 셀 날짜패턴 → 시트이름
const deriveMonth = (row, headers, sheetName) => {
    for (const h of headers) {
        if (isDateCol(h) && row[h]) { const m = String(row[h]).match(YM_RE); if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}`; }
    }
    for (const h of headers) {
        const m = String(row[h] || '').match(YM_RE); if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}`;
    }
    const full = String(sheetName || '').match(YM_RE);
    if (full) return `${full[1]}-${String(full[2]).padStart(2, '0')}`;
    const only = String(sheetName || '').match(/(\d{1,2})\s*월/); // "1월" → 2026년 가정
    if (only) return `2026-${String(only[1]).padStart(2, '0')}`;
    return '';
};

// 발주일 열 판별
const isOrderDateCol = (h) => { const t = String(h || '').replace(/\s+/g, ''); return t.includes('발주일') || (t.includes('발주') && t.includes('일')); };
// 연도 없는 날짜에 연도 채우기 (예: "1.15" → "2026.1.15", "1월 15일" → "2026년 1월 15일")
const addYearToDate = (val, year) => {
    const s = String(val || '').trim();
    if (!s || /(19|20)\d{2}/.test(s)) return s;         // 비었거나 이미 연도 있으면 그대로
    if (/월/.test(s)) return `${year}년 ${s}`;           // "1월 15일" 형태
    return s.replace(/^(\d{1,2})\s*([.\-/])\s*(\d{1,2})/, `${year}$2$1$2$3`); // "1.15"/"1/15"/"1-15"
};

// 연도를 넣을 날짜열(발행일·발주일) 판별
const isYearDateCol = (h) => {
    const t = String(h || '').replace(/\s+/g, '');
    return t.includes('발행일') || t.includes('발주일') || ((t.includes('발행') || t.includes('발주')) && t.includes('일'));
};
// 견적번호 열 찾기
const estNoOf = (headers) => (headers || []).find(h => String(h || '').replace(/\s+/g, '').includes('견적번호')) || '';

// "Nego/비고" 합쳐진 열 찾기 (분리 후엔 '비고'가 없어 다시 안 잡힘 = 반복 안전)
const findNegoCol = (headers) => (headers || []).find(h => String(h || '').replace(/\s+/g, '').includes('비고')) || '';
// 상태(특이사항/특기사항) 열을 이름 무관하게 찾기
const specColOf = (headers) => (headers || []).find(h => {
    const t = String(h || '').replace(/\s+/g, '');
    return t.includes('특이사항') || t.includes('특기사항');
}) || '';
// 값에서 앞쪽 퍼센트를 떼어냄: "5% 진행중" → { nego:'5%', spec:'진행중' }
const splitNego = (val) => {
    const s = String(val || '').trim();
    const m = s.match(/^([+\-△▲]?\s*\d+(?:\.\d+)?\s*%)\s*(.*)$/);
    return m ? { nego: m[1].replace(/\s+/g, ''), spec: m[2].trim() } : { nego: '', spec: s };
};
// 헤더/행에서 Nego/비고 열을 Nego + 특기사항 두 열로 분리
const splitNegoData = (headers, rows) => {
    const negoCol = findNegoCol(headers);
    if (!negoCol) return { headers, rows };
    const newHeaders = [];
    headers.forEach(h => {
        if (h === negoCol) { newHeaders.push('Nego'); newHeaders.push('특이사항'); }
        else if (h !== 'Nego' && h !== '특이사항') newHeaders.push(h);
    });
    if (!newHeaders.includes('Nego')) newHeaders.push('Nego');
    if (!newHeaders.includes('특이사항')) newHeaders.push('특이사항');
    const newRows = rows.map(r => {
        const { nego, spec } = splitNego(r[negoCol]);
        const nr = { ...r };
        delete nr[negoCol];
        nr['Nego'] = nego;
        nr['특이사항'] = spec;
        return nr;
    });
    return { headers: newHeaders, rows: newRows };
};
// 날짜에 연도 지정 (있으면 교체, 없으면 채움). 예: "7.15"→"2025.7.15", "2024-07-15"→"2025-07-15"
const setDateYear = (val, year) => {
    const s = String(val || '').trim();
    if (!s) return s;
    if (/(19|20)\d{2}/.test(s)) return s.replace(/(19|20)\d{2}/, year); // 연도 교체
    if (/월/.test(s)) return `${year}년 ${s}`;                          // "7월 15일"
    return s.replace(/^(\d{1,2})\s*([.\-/])\s*(\d{1,2})/, `${year}$2$1$2$3`); // "7.15"/"7/15"/"7-15"
};

// 헤더 비교용 정규화 (공백 제거 + 특기사항=특이사항, 발주일=발행일 취급)
const canonHead = (h) => String(h || '').replace(/\s+/g, '').replace(/특기사항/g, '특이사항').replace(/발주일/g, '발행일');
// 모든 달의 헤더를 하나로 통일 (1월=가장 이른 달 순서 우선 + 나머지 달의 추가 열, 값은 정규화 이름으로 매칭)
const unifyReportsData = (repsObj) => {
    const months = Object.keys(repsObj).sort();
    if (!months.length) return repsObj;
    const ref = [];
    const refCanon = new Set();
    const pushHead = (h) => {
        const t = String(h || '').replace(/\s+/g, '');
        let disp = h;
        if (t === '특기사항') disp = '특이사항';      // 이름 통일
        else if (t === '발주일') disp = '발행일';      // 발주일 → 발행일
        const c = canonHead(disp);
        if (!refCanon.has(c)) { ref.push(disp); refCanon.add(c); }
    };
    months.forEach(mk => (repsObj[mk].headers || []).forEach(pushHead)); // 1월부터 순서대로
    // 특이사항까지만 남기고 그 뒤 열은 모두 제거
    const specIdx = ref.findIndex(h => canonHead(h) === '특이사항');
    const finalRef = specIdx >= 0 ? ref.slice(0, specIdx + 1) : ref;
    const out = {};
    months.forEach(mk => {
        const mh = repsObj[mk].headers || [];
        const rows = (repsObj[mk].rows || []).map(r => {
            const cm = {};
            mh.forEach(h => { cm[canonHead(h)] = r[h]; });
            const nr = { _id: r._id, _month: r._month, _sheet: r._sheet };
            finalRef.forEach(h => { const v = cm[canonHead(h)]; nr[h] = (v != null ? v : ''); });
            return nr;
        });
        out[mk] = { headers: [...finalRef], rows };
    });
    return out;
};

// 오늘 날짜 (로컬 기준 YYYY-MM-DD)
const localTodayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// 발행일 정규화 → YYYY-MM-DD (연도 먼저 / "7/3/26"=월·일·연2자리 / 연도만)
const pad2 = (n) => String(n).padStart(2, '0');
const normDateKey = (v) => {
    const s = String(v || '').trim();
    // 연도 먼저: 2026-07-03, 2026.7.3
    let m = s.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
    if (m) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;
    // 월 먼저: 7/3/26, 7/3/2026, 7-3-26
    m = s.match(/^(\d{1,2})\D+(\d{1,2})\D+(\d{2,4})$/);
    if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${pad2(m[1])}-${pad2(m[2])}`; }
    const y = s.match(/(19|20)\d{2}/);
    return y ? y[0] : s;
};

// 여러 형태의 날짜 → date 입력용 YYYY-MM-DD (예: "2025.7.15"·"7/15/25" 등)
const toDateInput = (v) => {
    const r = normDateKey(v);
    return /^\d{4}-\d{2}-\d{2}$/.test(r) ? r : '';
};
// 표시용: 완전한 날짜면 YYYY-MM-DD로 통일해서 보여줌, 아니면 원본 그대로
const fmtYmd = (v) => {
    const r = normDateKey(v);
    return /^\d{4}-\d{2}-\d{2}$/.test(r) ? r : String(v ?? '');
};

// 수주가가 CNY(위안)로 적혀 있으면 견적가로 대치해 표시
// 수주가가 외화(CNY·VND·USD 등)면 견적가(이미 원화 환산액)로 대치해 합산·표시
const isForeignValue = (v) => /cny|vnd|usd|jpy|eur|위안|元|₫|¥|€|\$/i.test(String(v || ''));
const effectiveOrderPrice = (r) => (isForeignValue(r && r['수주가']) ? (r['견적가'] || '') : (r ? r['수주가'] : ''));
// 일부 행은 화폐단위(CNY/VND 등)가 '견적가'에 잘못 붙어있음(예: 견적가 "39,773,319 CNY", 수주가 "203,120.63").
// → 단위를 수주가 앞으로 옮기고 견적가는 순수 원화로 교정 → 다른 행과 같은 형식이 되어 계산이 자동으로 맞음
const CURRENCY_UNIT_RE = /(cny|vnd|usd|jpy|eur|위안|元|₫|¥|€|\$)/i;
const fixRow = (r) => {
    const est = String(r?.['견적가'] ?? '');
    const m = est.match(CURRENCY_UNIT_RE);
    if (!m) return r; // 견적가에 화폐단위 없으면 그대로
    const unit = m[1].toUpperCase();
    const estNum = est.replace(/[^0-9.-]/g, '');        // 견적가 = 순수 숫자(원화)
    const ord = String(r['수주가'] ?? '').trim();
    const newOrd = CURRENCY_UNIT_RE.test(ord) ? ord : (ord ? `${unit} ${ord}` : ord); // 수주가 앞에 단위
    return { ...r, '견적가': estNum, '수주가': newOrd };
};

// 특기사항 상태 메뉴 순서 (뒤에 붙은 금액 등은 무시하고 '종류'만 봄)
const SPEC_STATUS_ORDER = ['진행중', '집행', '완료', 'invoice', '검토중'];
// 특이사항 콤보박스 고정 항목 (표시용)
const SPEC_MENU = ['진행중', '집행', '완료', 'Invoice', '검토중'];
// 특기사항 '맨 앞'이 상태 항목과 맞으면 그 상태로 (뒤에 다른 글자 있어도 OK)
// 예: "완료 5,000,000" → "완료", "진행중 협의" → "진행중"
const extractSpecStatus = (text) => {
    const s = String(text || '').trim().toLowerCase();
    // '완료'가 들어있으면 완료 우선 (예: "Invoice(11월) 완료" → 완료). 단 '미완료'는 제외
    if (s.includes('완료') && !s.includes('미완료')) return '완료';
    for (const st of SPEC_STATUS_ORDER) {
        if (s.startsWith(st.toLowerCase())) return st;
    }
    return '';
};
// 집행 특기사항에서 집행월 추출: "(4월)"·"(10월)"·잘린 "(4" → 월 숫자 ("(2동)" 같은 건 제외)
const parseExecMonth = (text) => {
    const m = String(text || '').match(/\((\d{1,2})(?:월|\)|$)/);
    return m ? Number(m[1]) : null;
};
// 집행 금액 합산: 괄호(월) 앞 금액들을 +로 나눠 더함. 항목에 K가 있으면 전체를 천단위(×1000)로
const parseExecAmount = (text) => {
    let s = String(text || '');
    const pi = s.indexOf('(');
    if (pi >= 0) s = s.slice(0, pi);        // 괄호(월) 앞까지
    s = s.replace(/집행|[:：]/g, '');         // '집행'·콜론 제거
    const isK = /k/i.test(s);               // K가 하나라도 있으면 이 항목 전체를 천단위로
    let sum = 0;
    s.split('+').forEach(p => {
        const n = Number(p.replace(/[^0-9.]/g, '')) || 0;
        sum += isK ? n * 1000 : n;
    });
    return sum;
};
// 집행월 정렬 기준: 이번 달보다 뒤 달(예 10·11·12월)은 지난해로 보고 앞으로 (10·11·12 → 1월 앞)
const execMonthOrder = (m) => {
    if (m == null) return 99;                    // 월 없음 → 맨 뒤
    const cur = new Date().getMonth() + 1;       // 이번 달
    return m > cur ? m - 12 : m;                 // 이번 달보다 크면 지난해 취급(음수)
};

// 주요열 (표시=주요 모드일 때 보이는 열)
const EST_MAIN_COLS = ['발행일', '견적번호', '고객명', '견적가', '수주가', '특이사항', '특기사항', '진행'];
const REPORT_MONTH_COL = '보고월'; // 특이사항 옆 가상 열 — 그 특이사항이 어느 달 보고에서 온 건지 표시
// 고객명 정규화 — 공백·(주)·㈜·주식회사 제거 후 소문자. 같은 견적번호가 다른 고객에 재사용될 때 구분용
const normCust = (v) => String(v ?? '').replace(/\s+/g, '').replace(/㈜|\(주\)|\(有\)|주식회사/g, '').toLowerCase();

// 내용(프로젝트명)으로 현장 분류 — 해외·기타 우선 판정 → 구미 → 나머지는 파주
const SITE_COL = '사업장';
const SITE_ORDER = ['구미', '파주', '해외·기타'];
const OVERSEAS_KW = /광저우|csot|베트남|하이퐁|vh법인|남경|남잠|오창|안산|중국/i;
const GUMI_KW = /구미|E5|AP3|P4\d/i;
const siteOf = (content) => {
    const s = String(content || '');
    if (OVERSEAS_KW.test(s)) return '해외·기타';
    if (GUMI_KW.test(s)) return '구미';
    return '파주';
};
const SITE_CHIP_COLOR = {
    '구미': { bg: 'rgba(16,185,129,0.18)', text: '#34d399', border: '#10b981' },
    '파주': { bg: 'rgba(59,130,246,0.18)', text: '#60a5fa', border: '#3b82f6' },
    '해외·기타': { bg: 'rgba(168,85,247,0.18)', text: '#c084fc', border: '#a855f7' },
};

const EstimateScreen = ({ onBack }) => {
    const [headers, setHeaders]               = useState([]);
    const [rows, setRows]                     = useState([]);
    const [searchTerm, setSearchTerm]         = useState('');
    const [sortConfig, setSortConfig]         = useState({ key: null, dir: 'asc' });
    const [editingRow, setEditingRow]         = useState(null);
    const [addingRow, setAddingRow]           = useState(null);
    const [isLoading, setIsLoading]           = useState(false);
    const [ocrProgress, setOcrProgress]       = useState('');
    const [alertMsg, setAlertMsg]             = useState('');
    const [confirmClearOpen, setConfirmClearOpen] = useState(false);
    const [colWidths, setColWidths]           = useState({});
    const [resizingCol, setResizingCol]       = useState(null);
    const [startX, setStartX]                 = useState(0);
    const [startWidth, setStartWidth]         = useState(0);
    const [settingsOpen, setSettingsOpen]     = useState(false);
    const [savedFlash, setSavedFlash]         = useState(false);
    const [reportSavedFlash, setReportSavedFlash] = useState(false);
    const [selRows, setSelRows]               = useState(new Set()); // 발행일 연도 적용용 선택 행
    const [applyYear, setApplyYear]           = useState('2025');    // 발행일에 넣을 연도 (기본 25년)
    const [crossMonthYear, setCrossMonthYear] = useState(true);      // 같은 견적번호는 다른 달도 함께 적용
    const [editCell, setEditCell]             = useState(null);      // 클릭 편집 중인 셀 { id, col }
    const [dateFrom, setDateFrom]             = useState('');                 // 발행일 범위 시작 (비면 필터 꺼짐)
    const [dateTo, setDateTo]                 = useState(() => localTodayISO()); // 발행일 범위 종료 (기본 오늘)
    const [pickYear, setPickYear]             = useState(() => String(new Date().getFullYear())); // 월별 보기 연도
    const [pickMonth, setPickMonth]           = useState('');                 // 월별 보기 달 ('' = 미선택)
    const [viewMonth, setViewMonth]           = useState('');                 // 보고서 월 필터 (YYYY-MM, 그 달 보고서에 있던 프로젝트)
    const [historyChangedOnly, setHistoryChangedOnly] = useState(false);      // 변화 현황: 변화 있는 것만
    const [historyProject, setHistoryProject] = useState(null);              // 단일 프로젝트 변화 현황 팝업 (견적번호)
    const [execMonth, setExecMonth] = useState(null);                        // 집행: 월별 필터 (null=전체)
    const [execHistProject, setExecHistProject] = useState(null);            // 집행금액 변화 팝업 (견적번호)
    const [activeStatus, setActiveStatus]     = useState(new Set()); // 진행 상태 칩 필터
    const [colMode, setColMode]               = useState('all');     // 'all' | 'main' (전체 열 / 주요열)
    const [specFilter, setSpecFilter]         = useState(new Set()); // 특기사항 상태 메뉴 (다중 선택, 비어있으면 전체)
    const [siteFilter, setSiteFilter]         = useState(new Set()); // 현장(구미/파주/해외·기타) 필터
    // ── 상단 탭 (견적 목록 / 월별 보고서) ──
    const [tab, setTab]                       = useState('list');    // 'list' | 'report'
    const [reports, setReports]               = useState({});        // { 'YYYY-MM': {headers, rows} }
    const [reportMonth, setReportMonth]       = useState('');        // 보고서 탭에서 보고있는 월
    const now = new Date();
    const [upYear, setUpYear]                 = useState(String(now.getFullYear()));
    const [upMonth, setUpMonth]               = useState(String(now.getMonth() + 1).padStart(2, '0'));

    const fileInputRef = useRef(null);
    const photoInputRef = useRef(null);
    const reportInputRef = useRef(null);

    const getW = h => colWidths[h] || Math.max(100, h.length * 14 + 40);

    // 저장된 견적 + 월별 보고서 자동 불러오기
    useEffect(() => {
        try {
            const raw = localStorage.getItem(EST_STORE_KEY);
            if (raw) {
                const d = JSON.parse(raw);
                if (Array.isArray(d.headers) && Array.isArray(d.rows)) { setHeaders(d.headers); setRows(d.rows); }
            }
        } catch (_) { /* 무시 */ }
        try {
            const rep = localStorage.getItem(REPORT_STORE_KEY);
            if (rep) {
                const d = JSON.parse(rep);
                if (d && typeof d === 'object') {
                    // 불러올 때: Nego/비고 분리 → 모든 달 헤더 통일(특기사항→특이사항)
                    const fixed = {};
                    Object.keys(d).forEach(mk => { fixed[mk] = splitNegoData(d[mk]?.headers || [], d[mk]?.rows || []); });
                    const unified = unifyReportsData(fixed);
                    setReports(unified);
                    try { localStorage.setItem(REPORT_STORE_KEY, JSON.stringify(unified)); } catch (_) { /* 무시 */ }
                    const months = Object.keys(unified).sort();
                    if (months.length) setReportMonth(months[months.length - 1]); // 최신 월 기본 선택
                }
            }
        } catch (_) { /* 무시 */ }
    }, []);

    // ── 공유(Firebase) 실시간 구독 + 최초 마이그레이션 ──
    // Firebase에 데이터가 있으면 그걸로 표시(팀 공유). 비어있고 이 브라우저(localStorage)에만 있으면 최초 1회 올림.
    useEffect(() => {
        if (!db) return;
        const unsubList = onSnapshot(estListDoc(), (snap) => {
            if (snap.exists() && snap.data()?.json) {
                try { const o = JSON.parse(snap.data().json); setHeaders(o.headers || []); setRows(o.rows || []); } catch (_) { /* 무시 */ }
            }
        }, () => { /* 권한/네트워크 오류는 무시 (localStorage로 동작) */ });
        const unsubReports = onSnapshot(estReportsDoc(), (snap) => {
            if (snap.exists() && snap.data()?.json) {
                try {
                    const d = JSON.parse(snap.data().json);
                    setReports(d);
                    const months = Object.keys(d).sort();
                    if (months.length) setReportMonth(prev => prev || months[months.length - 1]);
                } catch (_) { /* 무시 */ }
            }
        }, () => {});
        // 최초 마이그레이션: Firebase 비었고 localStorage에 있으면 올림
        (async () => {
            try {
                const [ls, rs] = await Promise.all([getDoc(estListDoc()), getDoc(estReportsDoc())]);
                const lsList = localStorage.getItem(EST_STORE_KEY);
                const lsRep = localStorage.getItem(REPORT_STORE_KEY);
                if (!ls.exists() && lsList) {
                    const o = JSON.parse(lsList);
                    await setDoc(estListDoc(), { json: JSON.stringify({ headers: o.headers || [], rows: o.rows || [] }), savedAt: Date.now(), by: 'migrate' });
                }
                if (!rs.exists() && lsRep) {
                    await setDoc(estReportsDoc(), { json: lsRep, savedAt: Date.now(), by: 'migrate' });
                }
            } catch (_) { /* 무시 */ }
        })();
        return () => { unsubList(); unsubReports(); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // 공유(Firebase) 저장 — 실패해도 localStorage엔 저장되므로 안내만
    const fireSaveList = (hdrs, rws) => {
        if (!db) return;
        const payload = JSON.stringify({ headers: hdrs, rows: rws.map(({ _ocr, ...r }) => r) });
        setDoc(estListDoc(), { json: payload, savedAt: Date.now() })
            .catch(e => setAlertMsg('클라우드 저장 실패(견적목록): ' + (e?.message || e) + '\n(이 브라우저엔 저장됨)'));
    };
    const fireSaveReports = (obj) => {
        if (!db) return;
        setDoc(estReportsDoc(), { json: JSON.stringify(obj), savedAt: Date.now() })
            .catch(e => setAlertMsg('클라우드 저장 실패(보고서): ' + (e?.message || e) + '\n(이 브라우저엔 저장됨)'));
    };
    // 견적목록을 이 브라우저 + 공유 클라우드에 바로 저장 (업로드 즉시 저장용)
    const persistList = (hdrs, rws) => {
        try { localStorage.setItem(EST_STORE_KEY, JSON.stringify({ headers: hdrs, rows: rws.map(({ _ocr, ...r }) => r), savedAt: Date.now() })); } catch (_) { /* 무시 */ }
        fireSaveList(hdrs, rws);
        setSavedFlash(true); setTimeout(() => setSavedFlash(false), 1800);
    };

    // 저장 (이 브라우저 + 공유 클라우드)
    const handleSave = () => {
        try {
            const rowsToSave = rows.map(({ _ocr, ...r }) => r); // OCR 원문은 제외해 용량 절약
            localStorage.setItem(EST_STORE_KEY, JSON.stringify({ headers, rows: rowsToSave, savedAt: Date.now() }));
            fireSaveList(headers, rows); // 공유 클라우드에도 저장
            setSavedFlash(true);
            setTimeout(() => setSavedFlash(false), 1800);
        } catch (e) { setAlertMsg('저장 실패: ' + e.message); }
    };

    // 월별 보고서 전체를 견적 목록으로 통합 (기존 목록 삭제 → 견적번호+연도 기준 합침)
    const integrateReports = () => {
        if (!reportMonths.length) { setAlertMsg('통합할 월별 보고서가 없습니다.'); return; }
        if (rows.length && !window.confirm('현재 견적 목록을 모두 지우고,\n월별 보고서 전체를 통합할까요?')) return;
        const c = consolidated; // 견적번호+연도로 중복 제거 (연도 다르면 다른 프로젝트)
        setHeaders(c.headers);
        setRows(c.rows);
        try { localStorage.setItem(EST_STORE_KEY, JSON.stringify({ headers: c.headers, rows: c.rows.map(({ _ocr, ...r }) => r), savedAt: Date.now() })); } catch (_) { /* 무시 */ }
        fireSaveList(c.headers, c.rows); // 공유 클라우드에도 저장
        setSelRows(new Set()); setSpecFilter(new Set()); setSiteFilter(new Set()); setViewMonth(''); setDateFrom(''); setSearchTerm('');
        setTab('list'); // 견적 목록에서 결과 보기
        setSavedFlash(true); setTimeout(() => setSavedFlash(false), 1800);
    };

    // 월별 보기: 고른 연·월을 '보고서 월' 필터로 설정 (그 달 보고서에 있던 프로젝트)
    const applyMonthRange = (y, m) => {
        if (!m) { setViewMonth(''); return; } // 달 미선택 → 월 필터 해제
        setViewMonth(`${y}-${String(m).padStart(2, '0')}`);
        setDateFrom(''); // 발행일 기간은 초기화(보고서 월 기준으로 봄)
    };
    // 이전/다음 달로 이동 (월 미선택이면 이번 달 기준)
    const shiftMonth = (delta) => {
        let y = Number(pickYear) || new Date().getFullYear();
        let m = (pickMonth ? Number(pickMonth) : new Date().getMonth() + 1) + delta;
        if (m < 1) { m = 12; y -= 1; } else if (m > 12) { m = 1; y += 1; }
        const ys = String(y), ms = String(m).padStart(2, '0');
        setPickYear(ys); setPickMonth(ms); applyMonthRange(ys, ms);
    };
    const thisMonth = () => {
        const d = new Date();
        const ys = String(d.getFullYear()), ms = String(d.getMonth() + 1).padStart(2, '0');
        setPickYear(ys); setPickMonth(ms); applyMonthRange(ys, ms);
    };

    // 견적 목록 전체 지우기 (월별 보고서는 그대로 유지)
    const clearEstimateList = () => {
        if ((rows.length || headers.length) && !window.confirm('견적 목록 전체를 지울까요?\n(월별 보고서는 그대로 남아요)')) return;
        setRows([]); setHeaders([]);
        try { localStorage.removeItem(EST_STORE_KEY); } catch (_) { /* 무시 */ }
        if (db) setDoc(estListDoc(), { json: JSON.stringify({ headers: [], rows: [] }), savedAt: Date.now() }).catch(() => {}); // 공유도 비움
        setSelRows(new Set()); setSpecFilter(new Set()); setSiteFilter(new Set()); setViewMonth(''); setDateFrom(''); setSearchTerm('');
        setTab('list');
    };

    // 컬럼 리사이즈
    useEffect(() => {
        const onMove = e => {
            if (!resizingCol) return;
            setColWidths(p => ({ ...p, [resizingCol]: Math.max(60, startWidth + e.clientX - startX) }));
        };
        const onUp = () => setResizingCol(null);
        if (resizingCol) { document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp); }
        return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    }, [resizingCol, startX, startWidth]);

    const handleFileUpload = async (e) => {
        const file = e.target?.files?.[0];
        if (!file) return;
        setIsLoading(true);
        try {
            const XLSX = await loadXLSX();
            const wb   = XLSX.read(await file.arrayBuffer(), { cellDates: true });
            const ts   = Date.now();

            const allHeaders = [];
            const allRows = [];
            // 모든 시트(월별 페이지 포함)를 전부 읽어 합치고, 각 행에 월(_month) 표시
            wb.SheetNames.forEach((sheetName, sIdx) => {
                const ws  = wb.Sheets[sheetName];
                const raw = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, dateNF: 'yyyy-mm-dd', defval: '' });
                if (raw.length < 2) return;
                const hdrs = (raw[0] || []).map((h, i) => h ? String(h).trim() : `열${i + 1}`).filter(Boolean);
                hdrs.forEach(h => { if (!allHeaders.includes(h)) allHeaders.push(h); });
                raw.slice(1).forEach((row, idx) => {
                    const obj = { _id: `est_${ts}_${sIdx}_${idx}`, _sheet: sheetName };
                    hdrs.forEach((h, i) => { obj[h] = String(row[i] ?? '').trim(); });
                    if (hdrs.every(h => !obj[h])) return;
                    obj._month = deriveMonth(obj, hdrs, sheetName);
                    allRows.push(obj);
                });
            });

            if (!allRows.length) {
                setAlertMsg('데이터가 없거나 형식이 올바르지 않습니다.\n각 시트의 첫 번째 행을 제목(헤더)으로, 그 아래를 데이터로 인식합니다.');
                setIsLoading(false); return;
            }

            // 기존 데이터에 이어붙여 월이 쌓이도록 (여러 달 파일을 나눠 올릴 수 있음)
            const newHeaders = [...headers]; allHeaders.forEach(h => { if (!newHeaders.includes(h)) newHeaders.push(h); });
            const newRows = [...rows, ...allRows];
            setHeaders(newHeaders);
            setRows(newRows);
            persistList(newHeaders, newRows); // 올리자마자 바로 저장(클라우드 포함)
        } catch (err) {
            setAlertMsg(`파싱 오류: ${err.message}`);
        } finally {
            setIsLoading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    // 월별 보고서를 이 브라우저에 저장 (성공 여부 반환, 실패 시 안내)
    const persistReports = (obj) => {
        try {
            localStorage.setItem(REPORT_STORE_KEY, JSON.stringify(obj));
            fireSaveReports(obj); // 공유 클라우드에도 저장
            return true;
        } catch (e) {
            setAlertMsg('저장 공간이 부족해 보고서를 저장하지 못했습니다.\n오래된 월을 삭제하거나, 공용(클라우드) 저장이 필요하면 말씀해 주세요.\n(' + (e?.message || e) + ')');
            return false;
        }
    };

    // 월별 보고서 업로드 — 여러 페이지(파일·시트)를 한 번에 골라 고른 달로 합쳐 저장 (그 달 교체)
    const handleReportUpload = async (e) => {
        const files = Array.from(e.target?.files || []).slice(0, 10); // 여러 페이지 동시 선택
        if (!files.length) return;
        const mk = `${upYear}-${upMonth}`;
        setIsLoading(true);
        try {
            const XLSX = await loadXLSX();
            const ts   = Date.now();
            const hdrs = [];
            const rws  = [];
            for (let fi = 0; fi < files.length; fi++) {
                const wb = XLSX.read(await files[fi].arrayBuffer(), { cellDates: true });
                wb.SheetNames.forEach((sheetName, sIdx) => {
                    const ws  = wb.Sheets[sheetName];
                    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, dateNF: 'yyyy-mm-dd', defval: '' });
                    if (raw.length < 2) return;
                    const sh = (raw[0] || []).map((h, i) => h ? String(h).trim() : `열${i + 1}`).filter(Boolean);
                    sh.forEach(h => { if (!hdrs.includes(h)) hdrs.push(h); });
                    raw.slice(1).forEach((row, idx) => {
                        const obj = { _id: `rep_${mk}_${ts}_${fi}_${sIdx}_${idx}`, _sheet: `${files[fi].name}#${sheetName}`, _month: mk };
                        sh.forEach((h, i) => { obj[h] = String(row[i] ?? '').trim(); });
                        if (sh.every(h => !obj[h])) return;
                        // 발주일에 연도가 없으면 선택한 연도(upYear)로 채움
                        sh.forEach(h => { if (isOrderDateCol(h)) obj[h] = addYearToDate(obj[h], upYear); });
                        rws.push(obj);
                    });
                });
            }
            if (!rws.length) { setAlertMsg('데이터가 없거나 형식이 올바르지 않습니다.\n각 시트 첫 줄을 제목(헤더)으로 인식합니다.'); setIsLoading(false); return; }
            const split = splitNegoData(hdrs, rws); // Nego/비고 → Nego + 특이사항 자동 분리
            setReports(prev => {
                const merged = { ...prev, [mk]: { headers: split.headers, rows: split.rows } };
                const unified = unifyReportsData(merged); // 모든 달 헤더 통일
                if (persistReports(unified)) { setReportSavedFlash(true); setTimeout(() => setReportSavedFlash(false), 1800); }
                return unified;
            });
            setReportMonth(mk);
            setTab('report');
        } catch (err) {
            setAlertMsg(`파싱 오류: ${err.message}`);
        } finally {
            setIsLoading(false);
            if (reportInputRef.current) reportInputRef.current.value = '';
        }
    };

    // 보고서 월 삭제
    const deleteReportMonth = (mk) => {
        setReports(prev => {
            const next = { ...prev }; delete next[mk];
            persistReports(next);
            const left = Object.keys(next).sort();
            setReportMonth(left.length ? left[left.length - 1] : '');
            return next;
        });
    };

    // 견적서 사진(최대 5장) OCR → 표에 자동 정리
    const handlePhotoUpload = async (e) => {
        const files = Array.from(e.target?.files || []).slice(0, 5);
        if (!files.length) return;
        setIsLoading(true);
        setOcrProgress('OCR 엔진 준비 중...');
        try {
            const Tesseract = await loadTesseract();
            const ts = Date.now();
            const newRows = [];
            for (let i = 0; i < files.length; i++) {
                setOcrProgress(`사진 ${i + 1}/${files.length} 읽는 중... (처음엔 한글 데이터를 받느라 느릴 수 있어요)`);
                const { data } = await Tesseract.recognize(files[i], 'kor+eng');
                const row = parseEstimateText(data.text);
                row._id = `est_ocr_${ts}_${i}`;
                row._ocr = data.text; // 원본 인식 텍스트 보관
                newRows.push(row);
            }
            // 고정 컬럼을 헤더에 병합(기존 컬럼 유지)
            const mergedHeaders = [...headers];
            EST_COLUMNS.forEach(c => { if (!mergedHeaders.includes(c)) mergedHeaders.push(c); });
            const mergedRows = [...rows, ...newRows];
            setHeaders(mergedHeaders);
            setRows(mergedRows);
            persistList(mergedHeaders, mergedRows); // 읽자마자 바로 저장(클라우드 포함)
        } catch (err) {
            setAlertMsg(`사진 읽기 오류: ${err.message}`);
        } finally {
            setIsLoading(false);
            setOcrProgress('');
            if (photoInputRef.current) photoInputRef.current.value = '';
        }
    };

    const handleDownload = async () => {
        if (!activeHeaders.length) { setAlertMsg('다운로드할 데이터가 없습니다.'); return; }
        setIsLoading(true);
        try {
            const ExcelJS = await loadExcelJS(); await loadFileSaver();
            const wb = new ExcelJS.Workbook();
            const ws = wb.addWorksheet('견적');
            ws.columns = activeHeaders.map(h => ({ header: h, key: h, width: Math.max(12, getW(h) / 7.5) }));
            ws.getRow(1).eachCell(cell => {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
                cell.font = { color: { argb: 'FFFFFFFF' }, bold: true, name: '맑은 고딕' };
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FF334155' } },
                    bottom: { style: 'thin', color: { argb: 'FF334155' } },
                    left: { style: 'thin', color: { argb: 'FF334155' } },
                    right: { style: 'thin', color: { argb: 'FF334155' } }
                };
            });
            sortedRows.forEach(row => {
                const exRow = ws.addRow(Object.fromEntries(activeHeaders.map(h => [h, row[h] || ''])));
                exRow.eachCell(cell => {
                    cell.font = { name: '맑은 고딕' };
                    cell.alignment = { vertical: 'middle' };
                    cell.border = {
                        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                        right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
                    };
                });
            });
            const buf = await wb.xlsx.writeBuffer();
            window.saveAs(
                new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
                `견적_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.xlsx`
            );
        } catch (err) { setAlertMsg(`다운로드 오류: ${err.message}`); }
        finally { setIsLoading(false); }
    };

    const saveEditingRow = () => {
        if (!editingRow) return;
        setRows(prev => prev.map(r => r._id === editingRow._id ? { ...editingRow } : r));
        setEditingRow(null);
    };

    const saveAddingRow = () => {
        if (!addingRow) return;
        setRows(prev => [...prev, addingRow]);
        setAddingRow(null);
    };

    const deleteRow = id => setRows(prev => prev.filter(r => r._id !== id));

    const requestSort = key =>
        setSortConfig(p => ({ key, dir: p.key === key && p.dir === 'asc' ? 'desc' : 'asc' }));

    const getUniqueVals = (header) => {
        const base = [...new Set(rows.map(r => String(r[header]||'').trim()).filter(Boolean))];
        if (header === '진행') return [...new Set([...EST_STATUSES, ...base])];
        return base.sort();
    };

    const FieldInput = ({ header, value, onChange }) => {
        const cls = 'bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 transition-all w-full';
        if (isDateCol(header)) {
            return <input type="date" value={value || ''} onChange={e => onChange(e.target.value)} className={cls + ' color-scheme-dark'}/>;
        }
        if (isDropdownCol(header)) {
            const listId = `est-dl-${header.replace(/\s+/g, '-')}`;
            return (
                <>
                    <input type="text" list={listId} value={value || ''} onChange={e => onChange(e.target.value)} placeholder="선택하거나 직접 입력..." className={cls}/>
                    <datalist id={listId}>{getUniqueVals(header).map(v => <option key={v} value={v}/>)}</datalist>
                </>
            );
        }
        return <input type="text" value={value || ''} onChange={e => onChange(e.target.value)} className={cls}/>;
    };

    // ── 현재 탭에 따른 활성 데이터 (견적 목록 vs 선택한 보고서 월) ──
    const isReport = tab === 'report';
    const reportMonths = useMemo(() => Object.keys(reports).sort(), [reports]);
    const hasReports = reportMonths.length > 0;

    // 월별 보고서를 하나로 합침 — 견적번호+연도 기준 중복 제거 (연도 다르면 다른 프로젝트), 나중 달 값 우선
    const consolidated = useMemo(() => {
        const heads = [];
        reportMonths.forEach(mk => (reports[mk].headers || []).forEach(h => { if (!heads.includes(h)) heads.push(h); }));
        const estCol = estNoOf(heads);
        const dateCol = heads.find(h => String(h || '').replace(/\s+/g, '').includes('발행일')) || heads.find(isYearDateCol);
        const sCol = specColOf(heads); // 특이사항 열
        const custCol = heads.find(h => String(h || '').replace(/\s+/g, '').includes('고객')); // 고객명 열
        const map = new Map();
        const firstStMonth = new Map(); // key -> { 상태: 그 상태가 처음 나온 달 } — '완료된 첫 달' 계산용
        let uniq = 0;
        reportMonths.forEach(mk => {
            (reports[mk].rows || []).forEach(r => {
                const estNo = estCol ? String(r[estCol] || '').trim() : '';
                const dkey = dateCol ? normDateKey(r[dateCol]) : '';
                const custKey = custCol ? normCust(r[custCol]) : ''; // 같은 견적번호가 다른 고객에 재사용될 때 구분
                // 견적번호+발행일+고객명 기준: 셋 다 같아야 한 프로젝트 (번호 재사용 대응)
                const key = estNo ? `${estNo}|${dkey}|${custKey}` : (dkey ? `d|${dkey}|${custKey}|u${uniq++}` : `u${uniq++}`);
                // 상태(특이사항)가 처음 나온 달 기록 — 예: 1월에 '완료'면 이후 달에도 완료여도 1월로
                if (sCol) {
                    const st = extractSpecStatus(r[sCol]);
                    if (st) { let fm = firstStMonth.get(key); if (!fm) { fm = {}; firstStMonth.set(key, fm); } if (!fm[st]) fm[st] = mk; }
                }
                const prev = map.get(key);
                if (!prev) {
                    map.set(key, { ...r, _id: `merged_${key}`, _month: mk, _months: [mk] });
                } else {
                    const merged = { ...prev };
                    heads.forEach(h => { const v = String(r[h] ?? '').trim(); if (v) merged[h] = r[h]; }); // 나중 달 값 우선(비면 유지)
                    merged._month = mk;
                    merged._months = [...(prev._months || []), mk];
                    map.set(key, merged);
                }
            });
        });
        // 보고월 = 그 행의 현재(최종) 상태가 '처음' 나타난 달 (완료된 달). 상태 없으면 마지막 등장 달
        const rowsOut = Array.from(map.entries()).map(([key, row]) => {
            const finalSt = sCol ? extractSpecStatus(row[sCol]) : '';
            const fm = firstStMonth.get(key) || {};
            return { ...row, _specMonth: (finalSt && fm[finalSt]) || row._month || '' };
        });
        return { headers: heads, rows: rowsOut };
    }, [reports, reportMonths]);

    const listEditable = !isReport; // 견적 목록은 항상 편집 가능 (통합 결과를 저장해 사용)
    const activeHeaders = isReport ? (reports[reportMonth]?.headers || []) : headers;
    const activeRows    = useMemo(() => (isReport ? (reports[reportMonth]?.rows || []) : rows).map(fixRow), [isReport, reports, reportMonth, rows]); // 화폐단위 교정 적용
    const specCol = useMemo(() => specColOf(activeHeaders), [activeHeaders]); // 상태(특이사항) 열 자동 인식
    const contentCol = useMemo(() => activeHeaders.find(h => String(h || '').replace(/\s+/g, '').includes('내용')) || '', [activeHeaders]); // 내용 열 (현장 분류용)
    const dateSortCol = useMemo(() => activeHeaders.find(h => String(h || '').replace(/\s+/g, '').includes('발행일')) || activeHeaders.find(isYearDateCol) || '', [activeHeaders]); // 날짜순 정렬 대상 열
    const estColActive = useMemo(() => estNoOf(activeHeaders), [activeHeaders]); // 현재 표의 견적번호 열
    const isHistory = tab === 'history';
    const isExec = tab === 'exec';

    // 집행 목록: 견적목록(rows)에서 특기사항 상태가 '집행'인 것만 → 집행월·금액 뽑기
    const execRows = useMemo(() => {
        const specC = specColOf(headers);
        if (!specC) return [];
        const estC = estNoOf(headers);
        const custC = headers.find(h => String(h || '').replace(/\s+/g, '').includes('고객'));
        const contC = headers.find(h => String(h || '').replace(/\s+/g, '').includes('내용'));
        const out = rows
            .filter(r => extractSpecStatus(r[specC]) === '집행')
            .map(r => ({
                id: r._id,
                month: parseExecMonth(r[specC]),
                amount: parseExecAmount(r[specC]),
                estNo: estC ? String(r[estC] || '') : '',
                cust: custC ? String(r[custC] || '') : '',
                content: contC ? String(r[contC] || '') : '',
                raw: String(r[specC] || ''),
            }));
        out.sort((a, b) => execMonthOrder(a.month) - execMonthOrder(b.month) || b.amount - a.amount); // 집행월 순(지난해 달 먼저)
        return out;
    }, [rows, headers]);
    const execMonthsList = useMemo(() => [...new Set(execRows.map(r => r.month).filter(Boolean))].sort((a, b) => execMonthOrder(a) - execMonthOrder(b)), [execRows]); // 집행이 있는 월들(지난해 달 먼저)
    const execShown = useMemo(() => (execMonth == null ? execRows : execRows.filter(r => r.month === execMonth)), [execRows, execMonth]); // 월 필터 적용
    const execTotal = useMemo(() => execShown.reduce((s, r) => s + r.amount, 0), [execShown]);

    // 변화 현황: 프로젝트(견적번호)별 · 월별 특이사항 상태
    const statusHistory = useMemo(() => {
        const months = reportMonths;
        const allHeads = [];
        months.forEach(mk => (reports[mk].headers || []).forEach(h => { if (!allHeads.includes(h)) allHeads.push(h); }));
        const custCol = allHeads.find(h => String(h).replace(/\s+/g, '').includes('고객')) || '';
        const nameCol = allHeads.find(h => { const t = String(h).replace(/\s+/g, ''); return t.includes('내용') || t.includes('품명') || t.includes('프로젝트') || t.includes('현장'); }) || '';
        const map = new Map();
        months.forEach(mk => {
            const ec = estNoOf(reports[mk].headers || []);
            const sc = specColOf(reports[mk].headers || []);
            (reports[mk].rows || []).forEach(r => {
                const estNo = ec ? String(r[ec] || '').trim() : '';
                if (!estNo) return;
                let e = map.get(estNo);
                if (!e) { e = { estNo, cust: '', name: '', byMonth: {} }; map.set(estNo, e); }
                if (custCol && String(r[custCol] || '').trim()) e.cust = String(r[custCol]).trim();
                if (nameCol && String(r[nameCol] || '').trim()) e.name = String(r[nameCol]).trim();
                e.byMonth[mk] = sc ? String(r[sc] || '').trim() : '';
            });
        });
        // 각 프로젝트의 서로 다른 상태 개수
        const rows = [...map.values()].map(e => {
            const set = new Set();
            months.forEach(mk => { const st = extractSpecStatus(e.byMonth[mk]); if (st) set.add(st); });
            return { ...e, distinct: set.size };
        });
        return { months, rows };
    }, [reports, reportMonths]);

    // 집행금액 변화: 선택한 프로젝트(견적번호)의 월별 집행금액 (월별 보고서 기준)
    const execHistory = useMemo(() => {
        if (!execHistProject) return null;
        const p = statusHistory.rows.find(r => r.estNo === execHistProject);
        if (!p) return { estNo: execHistProject, cust: '', name: '', points: [] };
        const points = statusHistory.months.map(mk => {
            const raw = p.byMonth[mk] || '';
            const st = extractSpecStatus(raw);
            return { month: mk, raw, status: st, amount: st === '집행' ? parseExecAmount(raw) : null };
        });
        return { estNo: p.estNo, cust: p.cust, name: p.name, points };
    }, [execHistProject, statusHistory]);

    // 보고서 셀 인라인 수정 (발주일·특이사항). save=true면 즉시 저장
    const updateReportCell = (rowId, col, value, save) => {
        if (!isReport || !reportMonth) return;
        setReports(prev => {
            const cur = prev[reportMonth];
            if (!cur) return prev;
            const next = { ...prev, [reportMonth]: { ...cur, rows: cur.rows.map(r => r._id === rowId ? { ...r, [col]: value } : r) } };
            if (save) persistReports(next);
            return next;
        });
    };

    // 검색만 적용된 행 (상태 칩 개수 계산용)
    const searchedRows = useMemo(() => {
        if (!searchTerm) return activeRows;
        const t = searchTerm.toLowerCase();
        return activeRows.filter(r => activeHeaders.some(h => String(r[h] || '').toLowerCase().includes(t)));
    }, [activeRows, activeHeaders, searchTerm]);

    // 진행 상태별 개수
    const statusCounts = useMemo(() => {
        const c = {}; EST_STATUSES.forEach(s => { c[s] = 0; });
        searchedRows.forEach(r => { const v = String(r['진행'] || '').trim(); if (v in c) c[v]++; });
        return c;
    }, [searchedRows]);

    // 상태 필터 '이전' 범위 = 검색 + 진행칩 + 보고서 월 + 발행일 기간 (상태는 이 안에서 고름)
    const scopedRows = useMemo(() => {
        let out = searchedRows;
        if (activeStatus.size > 0) out = out.filter(r => activeStatus.has(String(r['진행'] || '').trim()));
        if (!isReport && viewMonth) out = out.filter(r => (r._specMonth || r._month || '') === viewMonth); // 보고월(특이사항이 나온 달)이 선택한 달과 같은 행만
        if (!isReport && dateSortCol && dateFrom) {
            out = out.filter(r => {
                const d = normDateKey(r[dateSortCol]);
                if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
                if (d < dateFrom) return false;
                if (dateTo && d > dateTo) return false;
                return true;
            });
        }
        return out;
    }, [searchedRows, activeStatus, isReport, viewMonth, dateSortCol, dateFrom, dateTo]);

    // 특이사항 상태별 개수 — 현재 범위(기간·월) 안에서 셈
    const specCounts = useMemo(() => {
        const c = {}; SPEC_STATUS_ORDER.forEach(s => { c[s] = 0; });
        scopedRows.forEach(r => { const st = extractSpecStatus(r[specCol]); if (st) c[st]++; });
        return c;
    }, [scopedRows, specCol]);

    // 현장(사업장)별 개수 — 현재 범위 안에서
    const siteCounts = useMemo(() => {
        const c = {}; SITE_ORDER.forEach(s => { c[s] = 0; });
        scopedRows.forEach(r => { c[siteOf(r[contentCol])]++; });
        return c;
    }, [scopedRows, contentCol]);


    const sortedRows = useMemo(() => {
        // 범위(scopedRows) 안에서 상태·현장 필터 적용
        let out = scopedRows;
        if (specFilter.size > 0) out = out.filter(r => specFilter.has(extractSpecStatus(r[specCol])));
        if (!isReport && siteFilter.size > 0) out = out.filter(r => siteFilter.has(siteOf(r[contentCol])));
        const key = sortConfig.key || dateSortCol; // 정렬 안 골랐으면 기본 = 발행일 날짜순
        if (!key) return out;
        const dir = sortConfig.key ? sortConfig.dir : 'asc'; // 기본은 오름차순(오래된→최근)
        const byMonth = key === REPORT_MONTH_COL; // 보고월은 월 순서로
        const bySite = key === SITE_COL;           // 사업장은 현장 이름으로
        const byDate = !byMonth && !bySite && (key === dateSortCol || isYearDateCol(key)); // 날짜 열은 날짜 순서로
        const gm = r => r._specMonth || r._month || '';
        return [...out].sort((a, b) => {
            const av = byMonth ? gm(a) : bySite ? siteOf(a[contentCol]) : byDate ? normDateKey(a[key]) : String(a[key] || '').toLowerCase();
            const bv = byMonth ? gm(b) : bySite ? siteOf(b[contentCol]) : byDate ? normDateKey(b[key]) : String(b[key] || '').toLowerCase();
            return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
        });
    }, [scopedRows, sortConfig, specFilter, siteFilter, specCol, contentCol, dateSortCol, isReport]);

    // 표에 보여줄 열 (주요열/전체)
    const displayHeaders = useMemo(() => {
        let cols = colMode === 'main' ? activeHeaders.filter(h => EST_MAIN_COLS.includes(h)) : activeHeaders.slice();
        // 특이사항 옆에 '보고월' 가상 열 삽입 (통합 목록에서 어느 달 보고인지 표시)
        if (specCol && cols.includes(specCol) && !cols.includes(REPORT_MONTH_COL)) {
            const i = cols.indexOf(specCol);
            cols = [...cols.slice(0, i + 1), REPORT_MONTH_COL, ...cols.slice(i + 1)];
        }
        // 고객명 옆에 '사업장'(구미/파주/해외·기타) 가상 열 삽입
        if (contentCol && !cols.includes(SITE_COL)) {
            const ci = cols.findIndex(h => String(h || '').replace(/\s+/g, '').includes('고객'));
            const at = ci >= 0 ? ci + 1 : cols.length;
            cols = [...cols.slice(0, at), SITE_COL, ...cols.slice(at)];
        }
        return cols;
    }, [activeHeaders, colMode, specCol, contentCol]);
    const toggleStatus = (s) =>
        setActiveStatus(prev => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n; });
    const toggleSpec = (s) =>
        setSpecFilter(prev => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n; });
    const toggleSite = (s) =>
        setSiteFilter(prev => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n; });

    // ── 발행일(·발주일) 연도 넣기 — 월별 보고서 탭에서 ──
    const yearTargetCols = useMemo(() => activeHeaders.filter(isYearDateCol), [activeHeaders]);
    const showSel = isReport && yearTargetCols.length > 0;   // 보고서 탭에서만 체크·연도 도구
    const toggleRowSel = (id) =>
        setSelRows(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

    // 선택 행에 연도 적용. crossMonthYear면 같은 견적번호를 가진 다른 달 행에도 함께 적용.
    const applyYearTo = (ids) => {
        if (!isReport || !reportMonth) return;
        const set = ids instanceof Set ? ids : new Set(ids);
        if (!set.size) return;
        const cur = reports[reportMonth];
        if (!cur) return;
        // 선택된 행들의 견적번호 모으기 (다른 달 전파용)
        const curEst = estNoOf(cur.headers);
        const targetNos = new Set();
        if (crossMonthYear && curEst) {
            cur.rows.forEach(r => { if (set.has(r._id)) { const v = String(r[curEst] || '').trim(); if (v) targetNos.add(v); } });
        }
        setReports(prev => {
            const next = { ...prev };
            let changed = false;
            Object.keys(prev).forEach(mk => {
                const rep = prev[mk];
                const dcols = (rep.headers || []).filter(isYearDateCol);
                if (!dcols.length) return;
                const estCol = estNoOf(rep.headers);
                const isCur = mk === reportMonth;
                const crossActive = crossMonthYear && !!estCol && targetNos.size > 0;
                if (!isCur && !crossActive) return;
                next[mk] = {
                    ...rep,
                    rows: rep.rows.map(r => {
                        // 현재 달: 선택한 행만 / 다른 달: 같은 견적번호 행 (현재 달의 다른 행은 안 건드림)
                        const direct = isCur && set.has(r._id);
                        const cross  = !isCur && crossActive && targetNos.has(String(r[estCol] || '').trim());
                        if (!direct && !cross) return r;
                        const nr = { ...r };
                        dcols.forEach(c => { nr[c] = setDateYear(r[c], applyYear); });
                        return nr;
                    }),
                };
                changed = true;
            });
            if (changed && persistReports(next)) { setReportSavedFlash(true); setTimeout(() => setReportSavedFlash(false), 1800); }
            return next;
        });
        setSelRows(new Set());
    };

    // 견적가·수주가 합계 (현재 표시 행 기준)
    const totals = useMemo(() => {
        const num = v => Number(String(v ?? '').replace(/[^0-9.-]/g, '')) || 0;
        return {
            est:   sortedRows.reduce((s, r) => s + num(r['견적가']), 0),
            order: sortedRows.reduce((s, r) => s + num(effectiveOrderPrice(r)), 0),
        };
    }, [sortedRows]);

    return (
        <div className="h-screen bg-slate-950 text-slate-100 font-sans p-4 md:p-6 flex flex-col overflow-hidden relative">

            {/* 로딩 */}
            {isLoading && (
                <div className="fixed inset-0 z-[999] flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-sm">
                    <div className="w-14 h-14 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mb-4 shadow-[0_0_20px_rgba(245,158,11,0.4)]"/>
                    <p className="text-lg font-bold text-white">처리 중...</p>
                    {ocrProgress && <p className="text-sm text-amber-300 mt-2 max-w-xs text-center whitespace-pre-line">{ocrProgress}</p>}
                </div>
            )}

            {/* 알림 */}
            {alertMsg && (
                <div className="fixed inset-0 z-[400] flex items-center justify-center bg-slate-950/80 p-4">
                    <div className="bg-slate-900 border border-slate-700 p-8 rounded-3xl max-w-sm w-full text-center shadow-2xl">
                        <p className="text-white font-bold mb-6 whitespace-pre-line">{alertMsg}</p>
                        <button onClick={() => setAlertMsg('')} className="px-6 py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold w-full">확인</button>
                    </div>
                </div>
            )}

            {/* 전체 삭제 확인 */}
            {confirmClearOpen && (
                <div className="fixed inset-0 z-[400] flex items-center justify-center bg-slate-950/80 p-4">
                    <div className="bg-slate-900 border border-rose-500/30 p-8 rounded-3xl max-w-sm w-full text-center shadow-2xl">
                        <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto mb-4"/>
                        <p className="text-white font-bold mb-2">전체 데이터 삭제</p>
                        <p className="text-rose-400 text-sm mb-6">현재 화면의 모든 견적 데이터가 삭제됩니다.</p>
                        <div className="flex gap-3">
                            <button onClick={() => setConfirmClearOpen(false)} className="flex-1 py-3 bg-slate-800 rounded-xl font-bold text-slate-300">취소</button>
                            <button onClick={() => { setRows([]); setHeaders([]); setConfirmClearOpen(false); }}
                                className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 rounded-xl font-bold text-white">삭제</button>
                        </div>
                    </div>
                </div>
            )}

            {/* 수정 팝업 */}
            {editingRow && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-950/90 p-4">
                    <div className="bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 shrink-0">
                            <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                <Edit2 size={18} className="text-amber-400"/> 견적 수정
                            </h2>
                            <button onClick={() => setEditingRow(null)} className="text-slate-500 hover:text-white bg-slate-800 p-1.5 rounded-xl"><X size={18}/></button>
                        </div>
                        <div className="overflow-y-auto flex-1 p-6 custom-scrollbar">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {headers.map(h => (
                                    <div key={h} className="flex flex-col gap-1.5">
                                        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider truncate flex items-center gap-1" title={h}>
                                            {h}
                                            {isDateCol(h) && <span className="text-cyan-600 text-[9px] font-bold normal-case">날짜</span>}
                                            {isDropdownCol(h) && <span className="text-amber-600 text-[9px] font-bold normal-case">선택</span>}
                                        </label>
                                        <FieldInput header={h} value={editingRow[h]} onChange={v => setEditingRow(p => ({ ...p, [h]: v }))}/>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="flex gap-3 px-6 py-4 border-t border-slate-800 shrink-0">
                            <button onClick={() => setEditingRow(null)} className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 rounded-xl font-bold text-slate-300">취소</button>
                            <button onClick={saveEditingRow} className="flex-1 py-3 bg-amber-600 hover:bg-amber-500 rounded-xl font-bold text-white flex items-center justify-center gap-2">
                                <Save size={16}/> 저장
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 추가 팝업 */}
            {addingRow && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-950/90 p-4">
                    <div className="bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 shrink-0">
                            <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                <Plus size={18} className="text-amber-400"/> 견적 추가
                            </h2>
                            <button onClick={() => setAddingRow(null)} className="text-slate-500 hover:text-white bg-slate-800 p-1.5 rounded-xl"><X size={18}/></button>
                        </div>
                        <div className="overflow-y-auto flex-1 p-6 custom-scrollbar">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {headers.map(h => (
                                    <div key={h} className="flex flex-col gap-1.5">
                                        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider truncate flex items-center gap-1" title={h}>
                                            {h}
                                            {isDateCol(h) && <span className="text-cyan-600 text-[9px] font-bold normal-case">날짜</span>}
                                            {isDropdownCol(h) && <span className="text-amber-600 text-[9px] font-bold normal-case">선택</span>}
                                        </label>
                                        <FieldInput header={h} value={addingRow[h]} onChange={v => setAddingRow(p => ({ ...p, [h]: v }))}/>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="flex gap-3 px-6 py-4 border-t border-slate-800 shrink-0">
                            <button onClick={() => setAddingRow(null)} className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 rounded-xl font-bold text-slate-300">취소</button>
                            <button onClick={saveAddingRow} className="flex-1 py-3 bg-amber-600 hover:bg-amber-500 rounded-xl font-bold text-white flex items-center justify-center gap-2">
                                <Save size={16}/> 추가 저장
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 단일 프로젝트 변화 현황 팝업 */}
            {historyProject && (() => {
                const p = statusHistory.rows.find(r => r.estNo === historyProject);
                const months = statusHistory.months;
                return (
                    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-950/90 p-4" onClick={() => setHistoryProject(null)}>
                        <div className="bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 shrink-0">
                                <h2 className="text-lg font-bold text-white flex items-center gap-2">📊 변화 현황</h2>
                                <button onClick={() => setHistoryProject(null)} className="text-slate-500 hover:text-white bg-slate-800 p-1.5 rounded-xl"><X size={18}/></button>
                            </div>
                            <div className="px-6 py-3 border-b border-slate-800 shrink-0">
                                <div className="text-sm font-bold text-amber-400">{historyProject}</div>
                                {p?.cust && <div className="text-xs text-slate-400 mt-0.5">{p.cust}{p.name ? ` · ${p.name}` : ''}</div>}
                            </div>
                            <div className="overflow-y-auto flex-1 p-5 custom-scrollbar">
                                {!p ? (
                                    <div className="text-center text-slate-500 py-8">데이터가 없습니다.</div>
                                ) : (
                                    <div className="flex flex-col gap-0">
                                        {months.map((mk, mi) => {
                                            const raw = p.byMonth[mk] || '';
                                            const st = extractSpecStatus(raw);
                                            const prevSt = mi > 0 ? extractSpecStatus(p.byMonth[months[mi - 1]] || '') : '';
                                            const changed = !!st && st !== prevSt && (prevSt || mi > 0);
                                            const [y, mm] = mk.split('-');
                                            return (
                                                <div key={mk} className="flex items-center gap-3 py-2.5 border-b border-slate-800/50">
                                                    <span className="text-sm font-bold text-slate-300 w-20 shrink-0">{y}.{mm}</span>
                                                    {st ? (
                                                        <span className="inline-block text-sm font-bold px-3.5 py-1.5 rounded-lg border"
                                                            style={historyChipStyle(st, changed)}>
                                                            {st === 'invoice' ? 'Invoice' : st}{changed && ' ⬅ 변경'}
                                                        </span>
                                                    ) : raw ? <span className="text-sm text-slate-400">{raw}</span> : <span className="text-slate-600 text-sm">—</span>}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* 집행금액 변화 팝업 */}
            {execHistProject && execHistory && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-950/90 p-4" onClick={() => setExecHistProject(null)}>
                    <div className="bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 shrink-0">
                            <h2 className="text-lg font-bold text-white flex items-center gap-2">💰 집행금액 변화</h2>
                            <button onClick={() => setExecHistProject(null)} className="text-slate-500 hover:text-white bg-slate-800 p-1.5 rounded-xl"><X size={18}/></button>
                        </div>
                        <div className="px-6 py-3 border-b border-slate-800 shrink-0">
                            <div className="text-sm font-bold text-amber-400">{execHistory.estNo}</div>
                            {execHistory.cust && <div className="text-xs text-slate-400 mt-0.5">{execHistory.cust}{execHistory.name ? ` · ${execHistory.name}` : ''}</div>}
                        </div>
                        <div className="overflow-y-auto flex-1 p-5 custom-scrollbar">
                            {(!execHistory.points || execHistory.points.length === 0) ? (
                                <div className="text-center text-slate-500 py-8">월별 보고서가 있어야 변화를 볼 수 있습니다.</div>
                            ) : (
                                <div className="flex flex-col gap-0">
                                    {(() => { let prev = null; return execHistory.points.map(pt => {
                                        const [y, mm] = pt.month.split('-');
                                        const has = pt.amount != null;
                                        const changed = has && prev != null && pt.amount !== prev;
                                        const up = changed && pt.amount > prev;
                                        if (has) prev = pt.amount;
                                        return (
                                            <div key={pt.month} className="flex items-center gap-3 py-2.5 border-b border-slate-800/50">
                                                <span className="text-sm font-bold text-slate-300 w-16 shrink-0">{y.slice(2)}.{mm}</span>
                                                {has ? (
                                                    <span className="text-sm font-bold text-amber-300" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                                        {pt.amount.toLocaleString()}원
                                                        {changed && <span className={`ml-2 text-xs ${up ? 'text-rose-400' : 'text-emerald-400'}`}>{up ? '▲' : '▼'} 변경</span>}
                                                    </span>
                                                ) : pt.status ? (
                                                    <span className="text-xs text-slate-500">{pt.status === 'invoice' ? 'Invoice' : pt.status}</span>
                                                ) : <span className="text-slate-600 text-sm">—</span>}
                                            </div>
                                        );
                                    }); })()}
                                </div>
                            )}
                            <div className="mt-3 text-[11px] text-slate-500">집행인 달만 금액 표시 · <span className="text-rose-400">▲</span>증가 <span className="text-emerald-400">▼</span>감소</div>
                        </div>
                    </div>
                </div>
            )}

            <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".xlsx,.xls" className="hidden"/>
            <input type="file" ref={photoInputRef} onChange={handlePhotoUpload} accept="image/*" multiple className="hidden"/>
            <input type="file" ref={reportInputRef} onChange={handleReportUpload} accept=".xlsx,.xls" multiple className="hidden"/>

            {/* 헤더 */}
            <header className="flex flex-wrap justify-between items-center gap-3 mb-3 shrink-0">
                <div className="flex items-center gap-3 flex-wrap">
                    <div className="p-3 bg-amber-500/20 rounded-2xl border border-amber-500/30 text-amber-400">
                        <Target size={22}/>
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-white flex items-center gap-2">
                            견적 관리
                            <span className="text-xs px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded-lg border border-amber-500/30 font-mono font-bold tracking-widest">견적</span>
                        </h1>
                        <p className="text-slate-500 text-xs mt-0.5">
                            {isReport && <span className="text-cyan-400 font-bold">{reportMonth ? `${reportMonth.split('-')[0]}년 ${Number(reportMonth.split('-')[1])}월 · ` : ''}</span>}
                            <span className="text-amber-400 font-bold">{sortedRows.length}</span>행 표시 / 전체{' '}
                            <span className="text-slate-400 font-bold">{activeRows.length}</span>행 ·
                            열 <span className="text-cyan-400 font-bold">{activeHeaders.length}</span>개
                        </p>
                    </div>

                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {activeHeaders.length > 0 && (
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={15}/>
                            <input type="text" placeholder="전체 검색..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                                className="bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-sm text-white outline-none focus:border-amber-500 w-40 focus:w-56 transition-all"/>
                        </div>
                    )}
                    {listEditable && headers.length > 0 && (
                        <button onClick={() => {
                            const newRow = { _id: `est_manual_${Date.now()}` };
                            headers.forEach(h => { newRow[h] = ''; });
                            setAddingRow(newRow);
                        }} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-amber-500/50 bg-amber-600/20 hover:bg-amber-600 text-amber-400 hover:text-white text-sm font-bold transition-all">
                            <Plus size={15}/> 견적 추가
                        </button>
                    )}
                    {activeHeaders.length > 0 && (
                        <button onClick={() => requestSort('고객명')}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 text-sm font-bold transition-all">
                            <ArrowDownAZ size={15}/> 고객명순
                        </button>
                    )}
                    {listEditable && headers.length > 0 && (
                        <button onClick={handleSave}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-bold transition-all ${savedFlash ? 'border-emerald-400 bg-emerald-600 text-white' : 'border-emerald-500/50 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-400 hover:text-white'}`}>
                            <Save size={15}/> {savedFlash ? '저장됨!' : '저장'}
                        </button>
                    )}

                    {/* 설정 (사진 읽기 · 엑셀 · 다운로드 · 전체삭제) */}
                    <div className="relative">
                        <button onClick={() => setSettingsOpen(o => !o)}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 text-sm font-bold transition-all">
                            <Settings size={15}/> 설정
                        </button>
                        {settingsOpen && (
                            <>
                                <div className="fixed inset-0 z-[190]" onClick={() => setSettingsOpen(false)}/>
                                <div className="absolute right-0 top-full mt-2 z-[200] w-52 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-2 flex flex-col gap-1">
                                    <button onClick={() => { setSettingsOpen(false); if (photoInputRef.current) { photoInputRef.current.value = ''; photoInputRef.current.click(); } }}
                                        className="flex items-center gap-2 px-3 py-2.5 rounded-xl hover:bg-violet-600/20 text-violet-300 text-sm font-bold text-left transition-all">
                                        <Camera size={16}/> 견적서 사진 읽기 (5장)
                                    </button>
                                    <button onClick={() => { setSettingsOpen(false); if (fileInputRef.current) { fileInputRef.current.value = ''; fileInputRef.current.click(); } }}
                                        className="flex items-center gap-2 px-3 py-2.5 rounded-xl hover:bg-cyan-600/20 text-cyan-300 text-sm font-bold text-left transition-all">
                                        <Upload size={16}/> 엑셀 업로드
                                    </button>
                                    <button onClick={() => { setSettingsOpen(false); handleDownload(); }} disabled={!activeHeaders.length}
                                        className="flex items-center gap-2 px-3 py-2.5 rounded-xl hover:bg-emerald-600/20 text-emerald-300 text-sm font-bold text-left transition-all disabled:opacity-30 disabled:cursor-not-allowed">
                                        <Download size={16}/> 엑셀 다운로드
                                    </button>
                                    <div className="h-px bg-slate-800 my-1"/>
                                    <button onClick={() => { setSettingsOpen(false); setConfirmClearOpen(true); }} disabled={!rows.length}
                                        className="flex items-center gap-2 px-3 py-2.5 rounded-xl hover:bg-rose-600/20 text-rose-400 text-sm font-bold text-left transition-all disabled:opacity-30 disabled:cursor-not-allowed">
                                        <Trash2 size={16}/> 전체 삭제
                                    </button>
                                </div>
                            </>
                        )}
                    </div>

                    <button onClick={onBack}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 text-sm font-bold transition-all">
                        <LogOut size={15}/> 나가기
                    </button>
                </div>
            </header>

            {/* ── 상단 탭: 견적 목록 / 월별 보고서 ── */}
            <div className="flex items-center gap-2 mb-3 shrink-0">
                <button onClick={() => setTab('list')}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold border transition-all ${!isReport ? 'bg-amber-600 text-white border-amber-500' : 'bg-slate-900 text-slate-400 border-slate-700 hover:bg-slate-800'}`}>
                    <FileSpreadsheet size={15}/> 견적 목록
                </button>
                {/* 날짜순·보고월순 정렬은 표의 열 제목을 클릭해서 사용 (상단 버튼은 정리) */}
                <button onClick={() => setTab('report')}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold border transition-all ${isReport ? 'bg-cyan-600 text-white border-cyan-500' : 'bg-slate-900 text-slate-400 border-slate-700 hover:bg-slate-800'}`}>
                    <Upload size={15}/> 월별 보고서
                </button>
                {hasReports && (
                    <button onClick={() => setTab('history')}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold border transition-all ${isHistory ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-slate-900 text-slate-400 border-slate-700 hover:bg-slate-800'}`}>
                        📊 변화 현황
                    </button>
                )}
                {hasReports && (
                    <button onClick={integrateReports}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold border border-violet-500/50 bg-violet-600/20 hover:bg-violet-600 text-violet-300 hover:text-white transition-all"
                        title="월별 보고서 전체를 견적 목록으로 통합 (견적번호+발행일 기준)">
                        🧩 통합
                    </button>
                )}
                {(rows.length > 0 || headers.length > 0) && (
                    <button onClick={clearEstimateList}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold border border-rose-500/50 bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white transition-all"
                        title="견적 목록 전체 삭제 (월별 보고서는 유지)">
                        <Trash2 size={15}/> 목록 지우기
                    </button>
                )}
                {rows.length > 0 && (
                    <button onClick={() => setTab(isExec ? 'list' : 'exec')}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold border transition-all ${isExec ? 'bg-amber-500 text-white border-amber-400' : 'bg-slate-900 text-slate-400 border-slate-700 hover:bg-slate-800'}`}
                        title="집행 항목만 모아 보기 (집행월·금액)">
                        💰 집행
                    </button>
                )}
            </div>

            {/* ── 보고서 탭: 월 선택 업로드 + 월 메뉴 ── */}
            {isReport && (
                <div className="flex items-center gap-2 flex-wrap px-3 py-2 mb-2 bg-slate-900/60 border border-slate-800 rounded-xl shrink-0">
                    <span className="text-[11px] font-bold text-cyan-400">보고서 올릴 월</span>
                    <select value={upYear} onChange={e => setUpYear(e.target.value)}
                        className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white outline-none">
                        {UP_YEARS.map(y => <option key={y} value={y}>{y}년</option>)}
                    </select>
                    <select value={upMonth} onChange={e => setUpMonth(e.target.value)}
                        className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white outline-none">
                        {UP_MONTHS.map(m => <option key={m} value={m}>{Number(m)}월</option>)}
                    </select>
                    <button onClick={() => { if (reportInputRef.current) { reportInputRef.current.value = ''; reportInputRef.current.click(); } }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-cyan-500/50 bg-cyan-600/20 hover:bg-cyan-600 text-cyan-300 hover:text-white text-xs font-bold transition-all">
                        <Upload size={14}/> 이 달 보고서 올리기 (여러 장 가능)
                    </button>
                    <button onClick={() => { if (persistReports(reports)) { setReportSavedFlash(true); setTimeout(() => setReportSavedFlash(false), 1800); } }}
                        disabled={!reportMonths.length}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed ${reportSavedFlash ? 'border-emerald-400 bg-emerald-600 text-white' : 'border-emerald-500/50 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white'}`}>
                        <Save size={14}/> {reportSavedFlash ? '저장됨!' : '저장'}
                    </button>
                    {reportMonths.length > 0 && <span className="w-px h-5 bg-slate-700 mx-1"/>}
                    {reportMonths.map(m => {
                        const [y, mm] = m.split('-');
                        const active = reportMonth === m;
                        return (
                            <span key={m} onClick={() => setReportMonth(m)} title={`${y}년 ${Number(mm)}월`}
                                className="cursor-pointer text-[11px] font-bold px-2.5 py-1 rounded-lg border transition-all inline-flex items-center gap-1"
                                style={active
                                    ? { background: 'rgba(6,182,212,0.18)', color: '#22d3ee', borderColor: '#06b6d4' }
                                    : { background: '#0f172a', color: '#94a3b8', borderColor: '#334155' }}>
                                {y.slice(2)}.{mm} <span className="opacity-70">({reports[m]?.rows?.length || 0})</span>
                                {active && <X size={11} className="hover:text-rose-400"
                                    onClick={(ev) => { ev.stopPropagation(); if (window.confirm(`${y}년 ${Number(mm)}월 보고서를 삭제할까요?`)) deleteReportMonth(m); }}/>}
                            </span>
                        );
                    })}

                    {/* 진행 상태 필터 (진행중·집행·완료·Invoice·검토중) */}
                    {activeHeaders.length > 0 && (
                        <>
                            <span className="w-px h-5 bg-slate-700 mx-1"/>
                            <span className="text-[11px] font-bold text-amber-400">상태</span>
                            {['', ...SPEC_STATUS_ORDER].map(s => {
                                const label = s === '' ? '전체' : (s === 'invoice' ? 'Invoice' : s);
                                const active = s === '' ? specFilter.size === 0 : specFilter.has(s);
                                const c = s ? STATUS_CHIP_COLOR[s] : null;
                                const count = s === '' ? scopedRows.length : (specCounts[s] || 0);
                                return (
                                    <button key={s || 'all'}
                                        onClick={() => (s === '' ? setSpecFilter(new Set()) : toggleSpec(s))}
                                        className="text-[11px] font-bold px-2.5 py-1 rounded-lg border transition-all"
                                        style={active
                                            ? (c ? { background: c.bg, color: c.text, borderColor: c.border }
                                                 : { background: 'rgba(59,130,246,0.18)', color: '#60a5fa', borderColor: '#3b82f6' })
                                            : { background: '#0f172a', color: '#94a3b8', borderColor: '#334155' }}>
                                        {label} <span className="opacity-60">({count})</span>
                                    </button>
                                );
                            })}
                        </>
                    )}
                </div>
            )}

            {/* 변화 현황 (프로젝트별 · 월별 특이사항) */}
            {isHistory ? (
              (() => {
                const rows = statusHistory.rows.filter(r => !historyChangedOnly || r.distinct >= 2);
                const months = statusHistory.months;
                return (
                  <>
                    <div className="flex items-center gap-2 flex-wrap px-3 py-2 mb-2 bg-slate-900/60 border border-slate-800 rounded-xl shrink-0 text-xs text-slate-400">
                      <span className="font-bold text-emerald-400">📊 프로젝트별 특이사항 변화</span>
                      <span>· 프로젝트 {rows.length}개 · 월 {months.length}개</span>
                      <label className="flex items-center gap-1.5 ml-2 cursor-pointer font-bold text-amber-300">
                        <input type="checkbox" checked={historyChangedOnly} onChange={e => setHistoryChangedOnly(e.target.checked)} className="accent-amber-500"/>
                        변화 있는 것만
                      </label>
                    </div>
                    <div className="flex-1 overflow-auto custom-scrollbar rounded-2xl border border-slate-800 shadow-xl">
                      <table className="w-full text-sm border-collapse min-w-max">
                        <thead className="sticky top-0 z-10">
                          <tr className="bg-slate-900 border-b border-slate-800">
                            <th className="px-3 py-2.5 text-[11px] font-bold text-slate-400 text-left border-r border-slate-800 sticky left-0 bg-slate-900">견적번호</th>
                            <th className="px-3 py-2.5 text-[11px] font-bold text-slate-400 text-left border-r border-slate-800">고객명</th>
                            {months.map(mk => {
                              const [y, mm] = mk.split('-');
                              return <th key={mk} className="px-3 py-2.5 text-[11px] font-bold text-slate-400 text-center border-r border-slate-800/60 whitespace-nowrap">{y.slice(2)}.{mm}</th>;
                            })}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.length === 0 ? (
                            <tr><td colSpan={months.length + 2} className="py-16 text-center text-slate-600 font-bold">표시할 프로젝트가 없습니다.</td></tr>
                          ) : rows.map((r, idx) => (
                            <tr key={r.estNo} className={`border-b border-slate-800/60 ${idx % 2 !== 0 ? 'bg-slate-900/20' : ''}`}>
                              <td className="px-3 py-2 text-xs font-bold text-slate-200 border-r border-slate-800/40 sticky left-0 bg-slate-950 whitespace-nowrap">{r.estNo}</td>
                              <td className="px-3 py-2 text-xs text-slate-300 border-r border-slate-800/40 truncate max-w-[160px]" title={r.name || r.cust}>{r.cust || <span className="text-slate-700">-</span>}</td>
                              {months.map((mk, mi) => {
                                const raw = r.byMonth[mk] || '';
                                const st = extractSpecStatus(raw);
                                const prevMk = mi > 0 ? months[mi - 1] : null;
                                const prevSt = prevMk ? extractSpecStatus(r.byMonth[prevMk] || '') : '';
                                const changed = !!st && st !== prevSt && (prevSt || mi > 0);
                                return (
                                  <td key={mk} className="px-2 py-2.5 text-center border-r border-slate-800/40" title={raw}>
                                    {st ? (
                                      <span className="inline-block text-[13px] font-bold px-3 py-1 rounded-lg border"
                                        style={historyChipStyle(st, changed)}>
                                        {st === 'invoice' ? 'Invoice' : st}
                                      </span>
                                    ) : raw ? <span className="text-[12px] text-slate-400">{raw}</span> : <span className="text-slate-700">·</span>}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="px-4 py-2 mt-2 border border-slate-800 bg-slate-900/60 rounded-xl text-[11px] text-slate-500 shrink-0">
                      노랑 테두리 = <b className="text-amber-300">그 달에 상태가 바뀐 것</b> · 칸을 마우스로 올리면 원래 특이사항 전체가 보여요
                    </div>
                  </>
                );
              })()
            ) : isExec ? (
              /* 집행 목록 (집행월 · 금액) */
              <>
                <div className="flex items-center gap-2 flex-wrap px-3 py-2 mb-2 bg-slate-900/60 border border-slate-800 rounded-xl shrink-0 text-xs text-slate-400">
                  <span className="font-bold text-amber-400">💰 집행 목록</span>
                  <span>· {execShown.length}건 · 합계 <b className="text-amber-300">{execTotal.toLocaleString()}</b>원</span>
                  {execMonthsList.length > 0 && <span className="w-px h-4 bg-slate-700 mx-1"/>}
                  {execMonthsList.length > 0 && <span className="font-bold text-cyan-400">월</span>}
                  {execMonthsList.length > 0 && [null, ...execMonthsList].map(m => (
                    <button key={m == null ? 'all' : m} onClick={() => setExecMonth(m)}
                      className="text-[11px] font-bold px-2.5 py-1 rounded-lg border transition-all"
                      style={execMonth === m
                        ? { background: 'rgba(6,182,212,0.18)', color: '#22d3ee', borderColor: '#06b6d4' }
                        : { background: '#0f172a', color: '#94a3b8', borderColor: '#334155' }}>
                      {m == null ? '전체' : `${m}월`}
                    </button>
                  ))}
                </div>
                <div className="flex-1 overflow-auto custom-scrollbar rounded-2xl border border-slate-800 shadow-xl">
                  <table className="w-full text-sm border-collapse min-w-max">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-slate-900 border-b border-slate-800">
                        <th className="px-3 py-2.5 text-[11px] font-bold text-slate-400 text-center border-r border-slate-800 w-20">집행월</th>
                        <th className="px-3 py-2.5 text-[11px] font-bold text-slate-400 text-right border-r border-slate-800">금액(원)</th>
                        <th className="px-3 py-2.5 text-[11px] font-bold text-slate-400 text-left border-r border-slate-800">견적번호</th>
                        <th className="px-3 py-2.5 text-[11px] font-bold text-slate-400 text-left border-r border-slate-800">고객명</th>
                        <th className="px-3 py-2.5 text-[11px] font-bold text-slate-400 text-left">내용</th>
                      </tr>
                    </thead>
                    <tbody>
                      {execShown.length === 0 ? (
                        <tr><td colSpan={5} className="py-16 text-center text-slate-600 font-bold">집행 항목이 없습니다.</td></tr>
                      ) : execShown.map((r, idx) => (
                        <tr key={r.id} onClick={() => r.estNo && setExecHistProject(r.estNo)}
                          className={`border-b border-slate-800/60 hover:bg-amber-500/10 ${r.estNo ? 'cursor-pointer' : ''} ${idx % 2 !== 0 ? 'bg-slate-900/20' : ''}`}
                          title={r.estNo ? '클릭 → 집행금액 변화 보기' : ''}>
                          <td className="px-3 py-2 text-center text-sm font-bold text-cyan-300 border-r border-slate-800/40 whitespace-nowrap">{r.month ? `${r.month}월` : '-'}</td>
                          <td className="px-3 py-2 text-right text-sm font-bold text-amber-300 border-r border-slate-800/40 whitespace-nowrap" title={r.raw}>{r.amount.toLocaleString()}</td>
                          <td className="px-3 py-2 text-xs text-slate-300 border-r border-slate-800/40 whitespace-nowrap">{r.estNo ? <span className="underline decoration-dotted decoration-slate-600">{r.estNo}</span> : '-'}</td>
                          <td className="px-3 py-2 text-xs text-slate-300 border-r border-slate-800/40 truncate max-w-[160px]" title={r.cust}>{r.cust || '-'}</td>
                          <td className="px-3 py-2 text-xs text-slate-400 truncate max-w-[280px]" title={r.content}>{r.content || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="sticky bottom-0 z-10">
                      <tr style={{ fontFamily: "'맑은 고딕','Malgun Gothic',sans-serif" }}>
                        <td style={{ backgroundColor: '#e0f2fe', color: '#111827', fontWeight: 900, fontSize: '14px', textAlign: 'center', borderTop: '3px solid #38bdf8', padding: '10px' }}>합계</td>
                        <td style={{ backgroundColor: '#e0f2fe', color: '#111827', fontWeight: 900, fontSize: '17px', textAlign: 'right', borderTop: '3px solid #38bdf8', padding: '10px 12px', whiteSpace: 'nowrap' }}>{execTotal.toLocaleString()}</td>
                        <td colSpan={3} style={{ backgroundColor: '#e0f2fe', borderTop: '3px solid #38bdf8' }}/>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <div className="px-4 py-2 mt-2 border border-slate-800 bg-slate-900/60 rounded-xl text-[11px] text-slate-500 shrink-0">
                  집행월 = 특기사항 괄호 안의 월 · 금액 = 집행 금액 합(＋는 더함, K는 천단위) · 금액에 마우스 올리면 원본 표기가 보여요
                </div>
              </>
            ) : activeHeaders.length === 0 ? (
              isReport ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
                    <Upload size={44} className="text-cyan-500/60"/>
                    <p className="text-slate-300 font-bold">{reportMonths.length ? '위에서 볼 월을 선택하세요.' : '월별 견적 보고서를 올려보세요.'}</p>
                    <p className="text-slate-500 text-sm">위에서 <b className="text-cyan-400">올릴 월</b>을 고르고 <b className="text-cyan-400">이 달 보고서 올리기</b>를 누르면<br/>그 달로 저장되고, 월 메뉴에서 언제든 다시 볼 수 있어요.</p>
                </div>
              ) : hasReports ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
                    <span className="text-5xl">🧩</span>
                    <p className="text-slate-300 font-bold">월별 보고서를 견적 목록으로 통합하세요</p>
                    <p className="text-slate-500 text-sm">
                        <b className="text-violet-300">🧩 통합</b> 을 누르면 모든 달 데이터를 <b className="text-cyan-300">견적번호+연도</b> 기준으로<br/>
                        하나로 정리합니다. (같은 번호·같은 연도 = 한 줄 / 연도 다르면 별개)
                    </p>
                    <button onClick={integrateReports}
                        className="mt-2 flex items-center gap-2 px-6 py-3 rounded-xl border border-violet-500/50 bg-violet-600/20 hover:bg-violet-600 text-violet-300 hover:text-white font-bold transition-all text-sm">
                        🧩 지금 통합하기
                    </button>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center gap-6">
                    <div className="p-8 bg-slate-900/50 rounded-3xl border border-slate-800 text-center max-w-md">
                        <Camera size={48} className="text-violet-500/70 mx-auto mb-4"/>
                        <p className="text-slate-300 font-bold mb-2">견적서 사진을 읽어 자동 정리</p>
                        <p className="text-slate-500 text-sm mb-4">발행일·견적번호·고객명·견적가 등을 항목별로 뽑아 표로 만듭니다. (한 번에 5장까지)</p>
                        <p className="text-slate-600 text-xs">※ 자동 인식이 완벽하진 않아요. 표에서 바로 수정할 수 있습니다.</p>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-3">
                        <button onClick={() => { if (photoInputRef.current) { photoInputRef.current.value = ''; photoInputRef.current.click(); } }}
                            className="flex items-center gap-2 px-6 py-3 rounded-xl border border-violet-500/50 bg-violet-600/20 hover:bg-violet-600 text-violet-300 hover:text-white font-bold transition-all text-sm">
                            <Camera size={18}/> 견적서 사진 읽기
                        </button>
                        <button onClick={() => { if (fileInputRef.current) { fileInputRef.current.value = ''; fileInputRef.current.click(); } }}
                            className="flex items-center gap-2 px-6 py-3 rounded-xl border border-cyan-500/50 bg-cyan-600/20 hover:bg-cyan-600 text-cyan-400 hover:text-white font-bold transition-all text-sm">
                            <Upload size={18}/> 엑셀 파일 업로드
                        </button>
                    </div>
                </div>
              )
            ) : (
                <>
                    {/* 발행일 연도 넣기 (월별 보고서 탭 · 발행일/발주일 열이 있을 때) */}
                    {showSel && (
                        <div className="flex items-center gap-2 flex-wrap px-3 py-2 mb-2 bg-slate-900/60 border border-slate-800 rounded-xl shrink-0">
                            <span className="text-[11px] font-bold text-amber-400">발행일 연도</span>
                            <select value={applyYear} onChange={e => setApplyYear(e.target.value)}
                                className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white outline-none">
                                {['2023', '2024', '2025', '2026', '2027'].map(y => <option key={y} value={y}>{y}년</option>)}
                            </select>
                            <button onClick={() => applyYearTo(selRows)} disabled={!selRows.size}
                                className="px-3 py-1.5 rounded-lg border border-amber-500/50 bg-amber-600/20 hover:bg-amber-600 text-amber-300 hover:text-white text-xs font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed">
                                선택 {selRows.size}개에 적용
                            </button>
                            <button onClick={() => applyYearTo(new Set(sortedRows.map(r => r._id)))}
                                className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-bold transition-all">
                                전체 적용
                            </button>
                            {selRows.size > 0 && (
                                <button onClick={() => setSelRows(new Set())} className="text-[10px] font-bold text-rose-400 px-1">선택 해제</button>
                            )}
                            <label className="flex items-center gap-1.5 text-[11px] font-bold text-cyan-300 cursor-pointer select-none ml-1">
                                <input type="checkbox" checked={crossMonthYear} onChange={e => setCrossMonthYear(e.target.checked)} className="accent-cyan-500 cursor-pointer"/>
                                같은 견적번호는 다른 달도 함께
                            </label>
                            <span className="text-[10px] text-slate-500 w-full">※ 체크한 행 + <b className="text-cyan-300">다른 달의 같은 견적번호</b>에 연도 적용 (현재 달의 다른 행은 안 건드림 · <b className="text-emerald-400">자동 저장</b>)</span>
                        </div>
                    )}

                    {/* 발행일 날짜 범위 선택 (견적 목록) */}
                    {!isReport && dateSortCol && (
                        <div className="flex items-center gap-2 flex-wrap px-3 py-2 mb-2 bg-slate-900/60 border border-slate-800 rounded-xl shrink-0">
                            {/* ① 상태 필터 (전체는 전체 표시, 여러 개 겹쳐 선택 가능) */}
                            <span className="text-[11px] font-bold text-amber-400">상태</span>
                            {['', ...SPEC_STATUS_ORDER].map(s => {
                                const label = s === '' ? '전체' : (s === 'invoice' ? 'Invoice' : s);
                                const active = s === '' ? specFilter.size === 0 : specFilter.has(s);
                                const c = s ? STATUS_CHIP_COLOR[s] : null;
                                const count = s === '' ? scopedRows.length : (specCounts[s] || 0);
                                return (
                                    <button key={s || 'all'}
                                        onClick={() => (s === '' ? setSpecFilter(new Set()) : toggleSpec(s))}
                                        className="text-[11px] font-bold px-2.5 py-1 rounded-lg border transition-all"
                                        style={active
                                            ? (c ? { background: c.bg, color: c.text, borderColor: c.border }
                                                 : { background: 'rgba(59,130,246,0.18)', color: '#60a5fa', borderColor: '#3b82f6' })
                                            : { background: '#0f172a', color: '#94a3b8', borderColor: '#334155' }}>
                                        {label} <span className="opacity-60">({count})</span>
                                    </button>
                                );
                            })}
                            <span className="w-px h-5 bg-slate-700 mx-1"/>
                            {/* ② 보고월 선택 — 고른 달만 보기 */}
                            <span className="text-[11px] font-bold text-cyan-400">📆 보고월</span>
                            <button onClick={() => shiftMonth(-1)} title="이전 달"
                                className="px-2 py-1 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-bold">◀</button>
                            <select value={pickYear} onChange={e => { setPickYear(e.target.value); if (pickMonth) applyMonthRange(e.target.value, pickMonth); }}
                                className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white outline-none">
                                {['2023', '2024', '2025', '2026', '2027'].map(y => <option key={y} value={y}>{y}년</option>)}
                            </select>
                            <select value={pickMonth} onChange={e => { setPickMonth(e.target.value); applyMonthRange(pickYear, e.target.value); }}
                                className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white outline-none">
                                <option value="">월</option>
                                {['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'].map(m => <option key={m} value={m}>{Number(m)}월</option>)}
                            </select>
                            <button onClick={() => shiftMonth(1)} title="다음 달"
                                className="px-2 py-1 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-bold">▶</button>
                            <button onClick={thisMonth}
                                className="px-2.5 py-1 rounded-lg border border-cyan-500/50 bg-cyan-600/20 hover:bg-cyan-600 text-cyan-300 hover:text-white text-xs font-bold">이번 달</button>
                            {viewMonth && (
                                <button onClick={() => { setViewMonth(''); setPickMonth(''); }}
                                    className="px-2.5 py-1 rounded-lg border border-slate-600 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold">전체 월</button>
                            )}
                            {contentCol && (
                                <>
                                    <span className="w-px h-5 bg-slate-700 mx-1"/>
                                    {/* ③ 현장 필터 (구미/파주/해외·기타) */}
                                    <span className="text-[11px] font-bold text-emerald-400">🏭 현장</span>
                                    {['', ...SITE_ORDER].map(s => {
                                        const active = s === '' ? siteFilter.size === 0 : siteFilter.has(s);
                                        const c = s ? SITE_CHIP_COLOR[s] : null;
                                        const count = s === '' ? scopedRows.length : (siteCounts[s] || 0);
                                        return (
                                            <button key={s || 'allsite'}
                                                onClick={() => (s === '' ? setSiteFilter(new Set()) : toggleSite(s))}
                                                className="text-[11px] font-bold px-2.5 py-1 rounded-lg border transition-all"
                                                style={active
                                                    ? (c ? { background: c.bg, color: c.text, borderColor: c.border }
                                                         : { background: 'rgba(16,185,129,0.18)', color: '#34d399', borderColor: '#10b981' })
                                                    : { background: '#0f172a', color: '#94a3b8', borderColor: '#334155' }}>
                                                {s === '' ? '전체' : s} <span className="opacity-60">({count})</span>
                                            </button>
                                        );
                                    })}
                                </>
                            )}
                        </div>
                    )}

                    {/* 진행 상태 칩 필터 (테이블 위) */}
                    {activeHeaders.includes('진행') && (
                        <div className="flex items-center gap-2 flex-wrap px-3 py-2 mb-2 bg-slate-900/60 border border-slate-800 rounded-xl shrink-0">
                            <span className="text-[11px] font-bold text-slate-400">진행</span>
                            <button onClick={() => setActiveStatus(new Set())}
                                className="text-[11px] font-bold px-2.5 py-1 rounded-lg border transition-all"
                                style={activeStatus.size === 0
                                    ? { background: 'rgba(59,130,246,0.18)', color: '#60a5fa', borderColor: '#3b82f6' }
                                    : { background: '#0f172a', color: '#94a3b8', borderColor: '#334155' }}>
                                전체 <span className="opacity-70">({searchedRows.length})</span>
                            </button>
                            {EST_STATUSES.map(s => {
                                const active = activeStatus.has(s);
                                const c = STATUS_CHIP_COLOR[s];
                                return (
                                    <button key={s} onClick={() => toggleStatus(s)}
                                        className="text-[11px] font-bold px-2.5 py-1 rounded-lg border transition-all"
                                        style={active
                                            ? { background: c.bg, color: c.text, borderColor: c.border }
                                            : { background: '#0f172a', color: '#94a3b8', borderColor: '#334155' }}>
                                        {s} <span className="opacity-70">({statusCounts[s]})</span>
                                    </button>
                                );
                            })}
                            {activeStatus.size > 0 && (
                                <button onClick={() => setActiveStatus(new Set())}
                                    className="text-[10px] font-bold text-rose-400 flex items-center gap-0.5 px-1">
                                    <X size={10}/> 초기화
                                </button>
                            )}
                        </div>
                    )}

                    {/* 테이블 */}
                    <div className="flex-1 overflow-auto custom-scrollbar rounded-2xl border border-slate-800 shadow-xl">
                        <table className="w-full text-sm border-collapse min-w-max">
                            <thead className="sticky top-0 z-10">
                                <tr className="bg-slate-900 border-b border-slate-800">
                                    {showSel && (
                                        <th className="px-2 py-2.5 w-8 text-center border-r border-slate-800 bg-slate-900">
                                            <input type="checkbox"
                                                checked={sortedRows.length > 0 && sortedRows.every(r => selRows.has(r._id))}
                                                onChange={e => setSelRows(e.target.checked ? new Set(sortedRows.map(r => r._id)) : new Set())}
                                                className="accent-amber-500 cursor-pointer" title="전체 선택"/>
                                        </th>
                                    )}
                                    <th className="px-3 py-2.5 text-[11px] font-bold text-slate-500 text-center w-10 border-r border-slate-800 shrink-0">No</th>
                                    {displayHeaders.map(h => (
                                        <th key={h}
                                            className="px-3 py-2.5 text-[11px] font-bold text-slate-400 text-left cursor-pointer hover:bg-slate-800 hover:text-amber-400 transition-colors border-r border-slate-800/60 select-none relative group"
                                            style={{ width: getW(h), minWidth: getW(h) }}
                                            onClick={() => requestSort(h)}>
                                            <span className="flex items-center gap-1">
                                                {h}
                                                {sortConfig.key === h
                                                    ? (sortConfig.dir === 'asc' ? <ChevronUp size={10}/> : <ChevronDown size={10}/>)
                                                    : null}
                                            </span>
                                            <div
                                                className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize opacity-0 group-hover:opacity-100 hover:bg-amber-500/40 transition-opacity"
                                                onMouseDown={e => { e.stopPropagation(); setResizingCol(h); setStartX(e.clientX); setStartWidth(getW(h)); }}
                                            />
                                        </th>
                                    ))}
                                    {listEditable && <th className="px-3 py-2.5 text-[11px] font-bold text-slate-500 text-center w-20 sticky right-0 bg-slate-900 border-l border-slate-800">작업</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {sortedRows.length === 0 ? (
                                    <tr>
                                        <td colSpan={displayHeaders.length + 1 + (showSel ? 1 : 0) + (listEditable ? 1 : 0)} className="py-16 text-center text-slate-600 font-bold">
                                            조건에 맞는 견적이 없습니다.
                                        </td>
                                    </tr>
                                ) : sortedRows.map((row, idx) => (
                                    <tr key={row._id} className={`border-b border-slate-800/60 hover:bg-slate-800/40 transition-colors ${selRows.has(row._id) ? 'bg-amber-500/10' : idx % 2 !== 0 ? 'bg-slate-900/20' : ''}`}>
                                        {showSel && (
                                            <td className="px-2 py-2 text-center border-r border-slate-800/40">
                                                <input type="checkbox" checked={selRows.has(row._id)} onChange={() => toggleRowSel(row._id)} className="accent-amber-500 cursor-pointer"/>
                                            </td>
                                        )}
                                        <td className="px-3 py-2 text-center text-slate-500 text-xs border-r border-slate-800/40 shrink-0">{idx + 1}</td>
                                        {displayHeaders.map(h => {
                                            // 보고월 가상 열: 그 특이사항이 어느 달 보고에서 온 건지 (예: 26.05)
                                            if (h === REPORT_MONTH_COL) {
                                                const m = row._specMonth || row._month || '';
                                                const disp = /^\d{4}-\d{2}/.test(m) ? `${m.slice(2, 4)}.${m.slice(5, 7)}` : '';
                                                return (
                                                    <td key={h} className="px-3 py-2 text-center text-xs border-r border-slate-800/40 whitespace-nowrap text-cyan-300 font-semibold">
                                                        {disp || <span className="text-slate-700">-</span>}
                                                    </td>
                                                );
                                            }
                                            // 사업장 가상 열: 내용으로 분류한 현장(구미/파주/해외·기타)
                                            if (h === SITE_COL) {
                                                const site = siteOf(row[contentCol]);
                                                const cc = SITE_CHIP_COLOR[site] || {};
                                                return (
                                                    <td key={h} className="px-3 py-2 text-center border-r border-slate-800/40 whitespace-nowrap">
                                                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-md border"
                                                            style={{ background: cc.bg, color: cc.text, borderColor: cc.border }}>{site}</span>
                                                    </td>
                                                );
                                            }
                                            // 보고서 탭: 발주일=클릭 시 달력, 특이사항=클릭 시 드롭다운 (평소엔 텍스트)
                                            const editingCell = editCell && editCell.id === row._id && editCell.col === h;
                                            if (isReport && isYearDateCol(h)) {
                                                return (
                                                    <td key={h} className="px-2 py-1 border-r border-slate-800/40 text-xs text-slate-300 cursor-pointer hover:bg-slate-800/40"
                                                        onClick={() => { if (!editingCell) setEditCell({ id: row._id, col: h }); }}>
                                                        {editingCell ? (
                                                            <input type="date" autoFocus value={toDateInput(row[h])}
                                                                onFocus={e => { try { e.target.showPicker && e.target.showPicker(); } catch (_) {} }}
                                                                onChange={e => updateReportCell(row._id, h, e.target.value, true)}
                                                                onBlur={() => setEditCell(null)}
                                                                className="bg-slate-800 border border-amber-500 rounded px-1.5 py-1 text-xs text-white outline-none"/>
                                                        ) : (fmtYmd(row[h]) || <span className="text-slate-700">-</span>)}
                                                    </td>
                                                );
                                            }
                                            if (isReport && specCol && h === specCol) {
                                                return (
                                                    <td key={h} className="px-2 py-1 border-r border-slate-800/40 text-xs text-slate-300 cursor-pointer hover:bg-slate-800/40 min-w-[110px]"
                                                        onClick={() => { if (!editingCell) setEditCell({ id: row._id, col: h }); }}>
                                                        {editingCell ? (
                                                            <select autoFocus value={SPEC_MENU.includes(row[h]) ? row[h] : ''}
                                                                onChange={e => { updateReportCell(row._id, h, e.target.value, true); setEditCell(null); }}
                                                                onBlur={() => setEditCell(null)}
                                                                className="bg-slate-800 border border-amber-500 rounded px-1.5 py-1 text-xs text-white outline-none w-full">
                                                                <option value="">(선택)</option>
                                                                {SPEC_MENU.map(o => <option key={o} value={o}>{o}</option>)}
                                                            </select>
                                                        ) : (row[h] || <span className="text-slate-700">-</span>)}
                                                    </td>
                                                );
                                            }
                                            if (isYearDateCol(h)) { // 견적목록 탭: 발행일 등 날짜 열은 YYYY-MM-DD로 통일 표시
                                                return (
                                                    <td key={h} className="px-3 py-2 text-slate-300 text-xs border-r border-slate-800/40 whitespace-nowrap">
                                                        {fmtYmd(row[h]) || <span className="text-slate-700">-</span>}
                                                    </td>
                                                );
                                            }
                                            const fxSwap = h === '수주가' && isForeignValue(row['수주가']);
                                            const cellVal = fxSwap ? (row['견적가'] || '') : row[h];
                                            return (
                                                <td key={h}
                                                    className="px-3 py-2 text-slate-300 text-xs border-r border-slate-800/40 truncate max-w-[200px]"
                                                    title={fxSwap ? `원래 수주가: ${row['수주가']} → 견적가(원화)로 대치` : cellVal}>
                                                    {cellVal || <span className="text-slate-700">-</span>}
                                                    {fxSwap && <span className="ml-1 text-[9px] font-bold text-amber-500/80">(견적가)</span>}
                                                </td>
                                            );
                                        })}
                                        {listEditable && (
                                            <td className="px-2 py-2 sticky right-0 bg-slate-950 border-l border-slate-800/40">
                                                <div className="flex items-center justify-center gap-1">
                                                    {hasReports && estColActive && String(row[estColActive] || '').trim() && (
                                                        <button onClick={() => setHistoryProject(String(row[estColActive]).trim())}
                                                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-emerald-500/20 text-slate-400 hover:text-emerald-400 transition-colors"
                                                            title="변화 현황">📊</button>
                                                    )}
                                                    <button onClick={() => setEditingRow({ ...row })}
                                                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-amber-500/20 text-slate-400 hover:text-amber-400 transition-colors"
                                                        title="수정">
                                                        <Edit2 size={12}/>
                                                    </button>
                                                    <button onClick={() => deleteRow(row._id)}
                                                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
                                                        title="삭제">
                                                        <Trash2 size={12}/>
                                                    </button>
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                            {/* 합계 행 — 견적가·수주가 컬럼 아래 (인라인 스타일로 강제: 밝은 배경 + 검정 굵은 큰 고딕) */}
                            <tfoot className="sticky bottom-0 z-10">
                                <tr style={{ fontFamily: "'맑은 고딕','Malgun Gothic',sans-serif" }}>
                                    {showSel && <td style={{ backgroundColor: '#e0f2fe', borderTop: '3px solid #38bdf8' }}/>}
                                    <td style={{ backgroundColor: '#e0f2fe', color: '#111827', fontWeight: 900, fontSize: '15px', textAlign: 'center', borderTop: '3px solid #38bdf8', padding: '12px' }}>합계</td>
                                    {displayHeaders.map(h => (
                                        <td key={h} style={{ backgroundColor: '#e0f2fe', color: '#111827', fontWeight: 900, fontSize: '18px', borderTop: '3px solid #38bdf8', padding: '10px 12px', whiteSpace: 'nowrap' }}>
                                            {h === '견적가'
                                                ? totals.est.toLocaleString()
                                                : h === '수주가'
                                                    ? totals.order.toLocaleString()
                                                    : ''}
                                        </td>
                                    ))}
                                    {listEditable && <td style={{ position: 'sticky', right: 0, backgroundColor: '#e0f2fe', color: '#374151', fontWeight: 700, fontSize: '11px', textAlign: 'center', borderTop: '3px solid #38bdf8', padding: '10px' }}>{sortedRows.length}건</td>}
                                </tr>
                            </tfoot>
                        </table>
                    </div>

                    {/* 푸터 — 표시/전체 · 주요열/전체 + 열 표시 토글 */}
                    <div className="px-4 py-2 mt-2 border border-slate-800 bg-slate-900/60 rounded-xl flex items-center justify-between text-xs shrink-0 gap-3 flex-wrap">
                        <span className="text-slate-500">
                            표시 <b className="text-slate-300">{sortedRows.length}</b> / 전체 <b className="text-slate-300">{activeRows.length}</b>행 ·
                            주요열 <b className="text-slate-300">{EST_MAIN_COLS.filter(c => activeHeaders.includes(c)).length}</b> / 전체 {activeHeaders.length}개
                        </span>
                        <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-0.5">
                            <button onClick={() => setColMode('all')}
                                className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${colMode === 'all' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'}`}>전체 열</button>
                            <button onClick={() => setColMode('main')}
                                className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${colMode === 'main' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'}`}>주요열</button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default EstimateScreen;
