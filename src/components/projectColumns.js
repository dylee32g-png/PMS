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
// 진행현황 색 프리셋 — 진행현황 관리 모달에서 상태별 색을 고르는 팔레트 (2026-07-08 색선택)
//   각 항목은 칩/필터/드롭다운이 그대로 쓰는 {bg,text,border,activeBg,activeText} 세트.
//   label=고를 때 표시용. 저장은 teamSettings[팀].listStatusColors[상태명]=이 세트로.
export const STATUS_COLOR_PRESETS = [
    { label:'파랑', bg:'rgba(30,122,200,0.12)',  text:'#1358a0', border:'rgba(30,122,200,0.45)', activeBg:'#1e7ac8', activeText:'#fff' },
    { label:'청록', bg:'rgba(13,148,136,0.12)',  text:'#0f766e', border:'rgba(13,148,136,0.45)', activeBg:'#0d9488', activeText:'#fff' },
    { label:'초록', bg:'rgba(5,150,105,0.16)',   text:'#047857', border:'rgba(5,150,105,0.5)',  activeBg:'#047857', activeText:'#fff' },
    { label:'앰버', bg:'rgba(245,158,11,0.16)',  text:'#92400e', border:'rgba(245,158,11,0.5)', activeBg:'#f59e0b', activeText:'#fff' },
    { label:'주황', bg:'rgba(217,119,6,0.12)',   text:'#92400e', border:'rgba(217,119,6,0.45)', activeBg:'#d97706', activeText:'#fff' },
    { label:'빨강', bg:'rgba(220,38,38,0.12)',   text:'#991b1b', border:'rgba(220,38,38,0.45)', activeBg:'#dc2626', activeText:'#fff' },
    { label:'보라', bg:'rgba(124,58,237,0.12)',  text:'#5b21b6', border:'rgba(124,58,237,0.45)', activeBg:'#7c3aed', activeText:'#fff' },
    { label:'분홍', bg:'rgba(219,39,119,0.12)',  text:'#9d174d', border:'rgba(219,39,119,0.45)', activeBg:'#db2777', activeText:'#fff' },
    { label:'회색', bg:'rgba(107,114,128,0.12)', text:'#374151', border:'rgba(107,114,128,0.4)', activeBg:'#6b7280', activeText:'#fff' },
];
export const DEFAULT_STATUS_OPTIONS = ['진행중','추진중','완료','취소','삭제','Hold','이전'];

// ─── 담당자 목록 & 이름 정규화 ───────────────────────────────────────────
export const ASSIGNEE_LIST = ['최영환DD','김준혁TL','조장현TL','신정환C','김종석C','장명휘C','김윤재C','김수민C'];
export const ASSIGNEE_NORMALIZE = {
    '신장환CK':'신정환C','신정환CK':'신정환C',
    '김종석K':'김종석C','장명휘D':'장명휘C',
    '김수민K':'김수민C','김윤재CJ':'김윤재C',
};
export const normalizeAssignee = v => ASSIGNEE_NORMALIZE[String(v||'').trim()] || String(v||'');
// 순수 한글 이름만 추출 — 목록↔데이터 꼬리표 통일용 (2026-07-07).
//   뒤 영문코드 떼기(김준혁TL→김준혁) + 띄어쓰기 앞부분만(김준혁 팀장→김준혁, 최영환 담당→최영환).
//   목록 '김준혁TL'과 데이터 '김준혁 팀장'을 같은 '김준혁'으로 맞춰 필터·카운트·잠금이 동작하게 함.
export const extractName = v => String(v||'').replace(/[A-Za-z0-9]+$/, '').trim().split(/\s+/)[0] || '';

// 진행현황 표기 통일 (HOLD → Hold). 표시·필터에서 대소문자 통일용 (데이터는 안 바꿈)
export const normalizeStatus = v => String(v ?? '').toUpperCase() === 'HOLD' ? 'Hold' : String(v ?? '');

// O 체크 칸 판별 (영업견적·공사계획서·리포트·완료처리) — 클릭 토글 대상. ④안전 쪽 '제출'은 제외
export const isCheckCol = (h) => { const s = String(h).replace(/\s/g, ''); return ['영업견적', '공사계획서', '리포트', '완료처리'].some(k => s.includes(k)); };

// ② 공사진행 '내용' ↔ '날짜' 자동 연동 (기준문서 ②)
// 내용 칸 = 진행 상황 설명. 이 칸을 '실제로' 바꾸면 같은 줄 '날짜'를 오늘로 자동 갱신하는 트리거.
export const isProgressContentCol = (h) => String(h ?? '').replace(/\s/g, '').includes('내용');
// 공사진행 '날짜' 칸 = '날짜' 글자 포함. '공사계약'·'공사완료'에는 '날짜' 글자가 없어 자동 제외(그 둘은 안 건드림).
export const isProgressDateCol = (h) => String(h ?? '').replace(/\s/g, '').includes('날짜');

// ⑥ 참조 UNC 경로 — 참조 폴더명 앞에 붙는 팀별 공용서버 주소 (2026-07-08).
//   기술2팀만 확정(원본 샘플 기준). 해외·구미팀은 지역이 달라 경로 확보 후 한 줄씩 추가.
//   경로 끝 역슬래시 필수(폴더명이 바로 이어붙음). JS 문자열이라 역슬래시는 \\ 로 씀.
export const UNC_PREFIX_BY_TEAM = {
    '기술2팀': '\\\\neconsys_pj\\001 Project\\001 파주\\107 기술3팀 2026년 Project\\',
};
// 팀 + 폴더명 → UNC 전체경로. 미등록 팀이거나 폴더명 없으면 '' (버튼 비활성 판단용).
export const buildUncPath = (team, folderName) => {
    const prefix = UNC_PREFIX_BY_TEAM[team];
    const name = String(folderName ?? '').trim();
    return (prefix && name) ? prefix + name : '';
};
// 참조 칸 판별 — 헤더에 '참조' 포함
export const isRefCol = (h) => String(h ?? '').replace(/\s/g, '').includes('참조');
