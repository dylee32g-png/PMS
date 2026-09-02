// ─────────────────────────────────────────────────────────────────────────
// 프로젝트 List — 컬럼(표의 세로줄) 판별·표시 규칙 모음
// ProjectListScreen.jsx에서 분리 (2026-06-25, 코드 분리 1조각 = 컬럼 정의)
// 전부 순수 상수·함수라 화면 동작에는 영향 없음. 컬럼 규칙을 한곳에서 관리.
// ─────────────────────────────────────────────────────────────────────────

import { getTeamProfile } from '../teamProfiles';   // 팀 프로파일 카드 (2026-08-11 2단계)

// ─── 필터/날짜 열 판별 ────────────────────────────────────────────────────
export const FILTERABLE   = ['진행', '현황', '공사업체', '업체담당자', '담당자', '발주처'];
export const DROPDOWN_KW  = ['진행', '현황', '담당자', '공사업체', '업체담당자', '발주처'];
export const isFilterable  = (h) => FILTERABLE.some(k => h.includes(k));
export const isDateCol     = (h) => { const s = String(h).replace(/\s/g, ''); return ['날짜', '일자', 'Date', '일시', '공사계약', '공사완료'].some(k => s.includes(k)); };
export const isDropdownCol = (h) => DROPDOWN_KW.some(k => h.includes(k));
export const isStatusCol   = (h) => ['진행현황', '현황', '진행'].some(k => h.includes(k)) && !isDateCol(h)
    && !String(h).replace(/\s/g, '').includes('진행율')    // '진행율 %'(기술2팀 260822 수치 칸)가 '진행' 키워드에 걸려 상태 칩으로 그려지던 문제 (2026-08-24)
    && !String(h).replace(/\s/g, '').includes('내용');     // '진행 내용'(기술2팀 2013·2014 = 프로젝트명 칸)도 동일 오인 (2026-08-24)
export const isAssigneeCol  = (h) => h.includes('담당자') && !h.includes('업체') && !h.includes('발주처'); // ③ '발주처 담당자'는 내부 작업자 아님 → 담당자 드롭다운 제외
export const isManagerCol   = (h) => String(h ?? '').replace(/\s+/g, '') === '관리자'; // 관리자 열 — 담당자와 같은 드롭다운 형식 (2026-07-22 팀장님)
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

// 엑셀처럼 자유 타이핑 날짜 해석 (2026-09-02 팀장님: 날짜 칸 키보드 입력) — 인식 못 하면 null
//   toDateInputVal(YYYY-MM-DD·YYYY.M.D·YYMMDD) + 추가: 2026-1-5 · 26/01/26 · 26-1-5 · 26.1.5 · 20260126(8자리). 빈값은 ''(지우기).
export const parseDateFlex = v => {
    const s = String(v ?? '').trim();
    if (!s) return '';
    const t = toDateInputVal(s);
    if (t) return t;
    const okMD = (mm, dd) => mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31;
    let m = s.match(/^(\d{4})[-./ ](\d{1,2})[-./ ](\d{1,2})$/);
    if (m && okMD(+m[2], +m[3])) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
    m = s.match(/^(\d{2})[-./ ](\d{1,2})[-./ ](\d{1,2})$/);
    if (m && okMD(+m[2], +m[3])) return `${+m[1] < 70 ? 2000 + +m[1] : 1900 + +m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
    m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (m && okMD(+m[2], +m[3])) return `${m[1]}-${m[2]}-${m[3]}`;
    return null;
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
export const ASSIGNEE_LIST = ['최영환 담당','김준혁 팀장','조장현 팀장','신정환 책임','김종석 책임','장명휘 책임','김윤재 책임','김수민 책임'];   // 직책 한글 통일 (2026-08-27) — 코드 표기(DD·TL·C)는 toExcelAssignee가 계속 변환
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

// 담당자 저장 표기 통일 (2026-07-28 팀장님) — 목록 코드(C·TL·DD)를 엑셀 원본 직책 표기로.
//   '김윤재C'→'김윤재 책임', '김준혁TL'→'김준혁 팀장', '최영환DD'→'최영환 담당'. 코드 없으면 그대로.
export const ASSIGNEE_TITLE_MAP = { C: '책임', TL: '팀장', DD: '담당' };
export const toExcelAssignee = (v) => {
    const s = String(v || '').trim();
    const m = s.match(/^(.+?)([A-Za-z]+)$/);
    if (!m) return s;
    const t = ASSIGNEE_TITLE_MAP[m[2].toUpperCase()];
    return t ? (m[1].trim() + ' ' + t) : s;
};
// 담당자 칸 사람별 분리 (2026-07-28) — 쉼표 형식 + 옛 형식('김윤재 책임 김종석 책임') 모두 지원.
//   직책 단어는 앞 이름에 붙이고, 새 이름이 나오면 새 사람으로 나눈다. (단독 테스트 10/10 통과)
export const ASSIGNEE_TITLES = ['책임', '팀장', '담당', '사원', '대리', '과장', '차장', '부장', '이사', '수석', '선임', '프로'];
export const splitAssigneeCell = (v) => {
    const people = [];
    String(v || '').split(/[,/·]/).forEach(part => {   // 쉼표 + '/'·'·' 전부 사람 구분 (2026-08-21 기술1팀 '염경록/심광호' 표기)
        const local = [];
        part.trim().split(/\s+/).filter(Boolean).forEach(t => {
            if (local.length && ASSIGNEE_TITLES.includes(t)) local[local.length - 1] += ' ' + t;
            else local.push(t);
        });
        people.push(...local);
    });
    return people;
};

// 진행현황 표기 통일 (HOLD → Hold). 표시·필터에서 대소문자 통일용 (데이터는 안 바꿈)
export const normalizeStatus = v => String(v ?? '').toUpperCase() === 'HOLD' ? 'Hold' : String(v ?? '');

// O 체크 칸 판별 (영업견적·공사계획서·리포트·완료처리) — 클릭 토글 대상. ④안전 쪽 '제출'은 제외
export const isCheckCol = (h) => { const s = String(h).replace(/\s/g, ''); return ['영업견적', '공사계획서', '리포트', '완료처리'].some(k => s.includes(k)); };

// ② 공사진행 '내용' ↔ '날짜' 자동 연동 (기준문서 ②)
// 내용 칸 = 진행 상황 설명. 이 칸을 '실제로' 바꾸면 같은 줄 '날짜'를 오늘로 자동 갱신하는 트리거.
export const isProgressContentCol = (h) => String(h ?? '').replace(/\s/g, '').includes('내용');
// 공사진행 '날짜' 칸 = '날짜' 글자 포함. '공사계약'·'공사완료'에는 '날짜' 글자가 없어 자동 제외(그 둘은 안 건드림).
export const isProgressDateCol = (h) => String(h ?? '').replace(/\s/g, '').includes('날짜');

// ⑥ 참조 UNC 경로 (2026-07-08 · 2026-08-11 팀 카드로 이동) — 주소는 팀 카드 '참조UNC'에만 있다.
//   경로 끝 역슬래시 필수(폴더명이 바로 이어붙음). 새 팀 경로 확정 = 그 팀 카드 한 줄 수정.
// 팀 + 폴더명 → UNC 전체경로. 카드에 경로 없으면(미확정 팀) '' (버튼 비활성 판단용).
export const buildUncPath = (team, folderName) => {
    const prefix = getTeamProfile(team)?.참조UNC;
    const name = String(folderName ?? '').trim();
    return (prefix && name) ? prefix + name : '';
};
// 참조 칸 판별 — 헤더에 '참조' 포함
export const isRefCol = (h) => String(h ?? '').replace(/\s/g, '').includes('참조');
