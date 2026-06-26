// ─────────────────────────────────────────────────────────────────────────
// 프로젝트 List — 컬럼(표의 세로줄) 판별·표시 규칙 모음
// ProjectListScreen.jsx에서 분리 (2026-06-25, 코드 분리 1조각 = 컬럼 정의)
// 전부 순수 상수·함수라 화면 동작에는 영향 없음. 컬럼 규칙을 한곳에서 관리.
// ─────────────────────────────────────────────────────────────────────────

// ─── 필터/날짜 열 판별 ────────────────────────────────────────────────────
export const FILTERABLE   = ['진행', '현황', '공사업체', '업체담당자', '담당자', '발주처'];
export const DROPDOWN_KW  = ['진행', '현황', '담당자', '공사업체', '업체담당자', '발주처'];
export const isFilterable  = (h) => FILTERABLE.some(k => h.includes(k));
export const isDateCol     = (h) => { const s = String(h).replace(/\s/g, ''); return ['날짜', '일자', 'Date', '일시', '공사계약', '공사완료'].some(k => s.includes(k)); };
export const isDropdownCol = (h) => DROPDOWN_KW.some(k => h.includes(k));
export const isStatusCol   = (h) => ['진행현황', '현황', '진행'].some(k => h.includes(k)) && !isDateCol(h);
export const isAssigneeCol  = (h) => h.includes('담당자') && !h.includes('업체') && !h.includes('발주처'); // ③ '발주처 담당자'는 내부 작업자 아님 → 담당자 드롭다운 제외
export const isClientCol    = (h) => h.includes('발주처') && !h.includes('담당'); // ③ 회사 '발주처'만 드롭다운; '발주처 담당자' 제외
export const isVendorAssCol = (h) => h.includes('업체') && h.includes('담당자');
export const toDateInputVal = v => {
    const s = String(v||'').trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);
    const m = s.match(/^(\d{4})[.\/ ](\d{1,2})[.\/ ](\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
    // 6자리 YYMMDD (예: 251125 → 2025-11-25). 앞 2자리=연도(70 미만은 20xx), 월·일 유효성 통과 시만 인정.
    // 날짜가 아닌 값(예: "2022년")은 그대로 ''(빈값)을 돌려 표시쪽에서 원본을 살린다. (2026-06-26 ①)
    const d6 = s.match(/^(\d{2})(\d{2})(\d{2})$/);
    if (d6) {
        const yy = +d6[1], mm = +d6[2], dd = +d6[3];
        if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
            const yyyy = yy < 70 ? 2000 + yy : 1900 + yy;
            return `${yyyy}-${d6[2]}-${d6[3]}`;
        }
    }
    return '';
};

// ─── 메인 테이블 표시 열 키워드 ──────────────────────────────────────────
// (이 키워드를 포함하는 열만 메인 테이블에 표시; 나머지는 우클릭 → 상세 화면)
export const MAIN_COL_KEYWORDS = ['번호', '발주처', 'Project', '프로젝트', '공사계약', '공사완료', '공사 계약', '공사 완료', '진행현황', '담당자', '참조', '관리자'];

// ─── 진행현황 상태 색상 ──────────────────────────────────────────────────
export const STATUS_CHIP_COLORS = {
    '진행중':  { bg:'rgba(30,122,200,0.12)',   text:'#1358a0', border:'rgba(30,122,200,0.45)',  activeBg:'#1e7ac8', activeText:'#fff' },
    '진행':    { bg:'rgba(30,122,200,0.12)',   text:'#1358a0', border:'rgba(30,122,200,0.45)',  activeBg:'#1e7ac8', activeText:'#fff' },
    '추진중':  { bg:'rgba(217,119,6,0.12)',    text:'#92400e', border:'rgba(217,119,6,0.45)',   activeBg:'#d97706', activeText:'#fff' },
    '완료':    { bg:'rgba(5,150,105,0.18)',    text:'#047857', border:'rgba(5,150,105,0.55)',   activeBg:'#047857', activeText:'#fff' },
    '취소':    { bg:'rgba(220,38,38,0.12)',    text:'#991b1b', border:'rgba(220,38,38,0.45)',   activeBg:'#dc2626', activeText:'#fff' },
    '삭제':    { bg:'rgba(127,29,29,0.12)',    text:'#7f1d1d', border:'rgba(127,29,29,0.45)',   activeBg:'#7f1d1d', activeText:'#fff' },
    'Hold':    { bg:'rgba(245,158,11,0.12)',   text:'#92400e', border:'rgba(245,158,11,0.5)',   activeBg:'#f59e0b', activeText:'#fff' },
    '이전':    { bg:'rgba(107,114,128,0.12)', text:'#374151', border:'rgba(107,114,128,0.4)',  activeBg:'#6b7280', activeText:'#fff' },
    '금월완료': { bg:'rgba(5,150,105,0.12)',   text:'#065f46', border:'rgba(5,150,105,0.45)',   activeBg:'#059669', activeText:'#fff' },
    '보고완료': { bg:'rgba(79,70,229,0.12)',   text:'#3730a3', border:'rgba(79,70,229,0.45)',   activeBg:'#4f46e5', activeText:'#fff' },
    '미작업':  { bg:'rgba(107,114,128,0.12)', text:'#374151', border:'rgba(107,114,128,0.4)',  activeBg:'#6b7280', activeText:'#fff' },
    '예상':    { bg:'rgba(217,119,6,0.12)',    text:'#92400e', border:'rgba(217,119,6,0.45)',   activeBg:'#d97706', activeText:'#fff' },
    '신규':    { bg:'rgba(37,99,235,0.12)',    text:'#1e40af', border:'rgba(37,99,235,0.45)',   activeBg:'#2563eb', activeText:'#fff' },
    'sub':     { bg:'rgba(139,92,246,0.12)',   text:'#5b21b6', border:'rgba(139,92,246,0.45)', activeBg:'#7c3aed', activeText:'#fff' },
    '검토중':  { bg:'rgba(124,58,237,0.12)',   text:'#5b21b6', border:'rgba(124,58,237,0.45)', activeBg:'#7c3aed', activeText:'#fff' },
};
export const DEFAULT_STATUS_OPTIONS = ['진행중','추진중','완료','취소','삭제','Hold','이전'];

// ─── 담당자 목록 & 이름 정규화 ───────────────────────────────────────────
export const ASSIGNEE_LIST = ['최영환DD','김준혁TL','조장현TL','신정환C','김종석C','장명휘C','김윤재C','김수민C'];
export const ASSIGNEE_NORMALIZE = {
    '신장환CK':'신정환C','신정환CK':'신정환C',
    '김종석K':'김종석C','장명휘D':'장명휘C',
    '김수민K':'김수민C','김윤재CJ':'김윤재C',
};
export const normalizeAssignee = v => ASSIGNEE_NORMALIZE[String(v||'').trim()] || String(v||'');
export const extractName = v => String(v||'').replace(/[A-Za-z0-9]+$/, '').trim();

// 진행현황 표기 통일 (HOLD → Hold). 표시·필터에서 대소문자 통일용 (데이터는 안 바꿈)
export const normalizeStatus = v => String(v ?? '').toUpperCase() === 'HOLD' ? 'Hold' : String(v ?? '');

// O 체크 칸 판별 (영업견적·공사계획서·리포트·완료처리) — 클릭 토글 대상. ④안전 쪽 '제출'은 제외
export const isCheckCol = (h) => { const s = String(h).replace(/\s/g, ''); return ['영업견적', '공사계획서', '리포트', '완료처리'].some(k => s.includes(k)); };

// ② 공사진행 '내용' ↔ '날짜' 자동 연동 (기준문서 ②)
// 내용 칸 = 진행 상황 설명. 이 칸을 '실제로' 바꾸면 같은 줄 '날짜'를 오늘로 자동 갱신하는 트리거.
export const isProgressContentCol = (h) => String(h ?? '').replace(/\s/g, '').includes('내용');
// 공사진행 '날짜' 칸 = '날짜' 글자 포함. '공사계약'·'공사완료'에는 '날짜' 글자가 없어 자동 제외(그 둘은 안 건드림).
export const isProgressDateCol = (h) => String(h ?? '').replace(/\s/g, '').includes('날짜');

// ⑦ 표 기본 숨김 대상 (2026-06-26 팀장님 지정) — 표엔 안 보이되 상세 팝업·설정 '열 표시/숨기기'엔 보임.
//   보임 유지: 번호·발주처·Project·진행현황·담당자 + 날짜·내용·PLC·ETOS·HMI·자체시운전·통합시운전·포인트
//   (공백 제거 후 정확히 일치하는 이름만 숨김 — 오인식 방지)
export const DEFAULT_HIDDEN_COLS = ['공사계약','공사완료','도면입수','I/OMap','화면작성','기준정보','참조','업체담당자','안전관리비금액','안전관리비제출','견적코드','자재','기안','안전관리비기안','서브원교육일지제출','서브원작업일보제출'];
export const isDefaultHiddenCol = (h) => DEFAULT_HIDDEN_COLS.includes(String(h ?? '').replace(/\s/g, ''));

// ③ 공사진행 중 메인표에서 숨길 칸 (2026-06-27 팀장님 지정: 날짜·내용·포인트는 표에서 빼고 상세팝업에서만 보기)
//   공백 제거 후 부분일치 — '포인트'는 한글/영문(POINT) 모두 대응. 상세팝업·설정 '열 표시/숨기기'엔 그대로 노출.
export const isProgHiddenCol = (h) => { const s = String(h ?? '').replace(/\s/g, ''); return s.includes('날짜') || s.includes('내용') || s.includes('포인트') || /point/i.test(s); };
