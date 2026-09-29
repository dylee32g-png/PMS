/* 기술1팀 칸 위치 검사 (2026-09-29) — 프로젝트 List 2026 화면
 *   팀장님 요청 3가지 (모두 '비고 [ISSUE]' 바로 앞으로, 적힌 순서대로):
 *     ① 의뢰 묶음 통째로(일자·요청자·접수자)  ② 견적코드·고객사  ③ 단계구분·부문·계약
 *   + 함께 고친 것: 2021년 머리글·본문 한 칸 어긋남(alignColsToGroups) · 옛 배치에서 고른 틀고정 기억 보호
 *   원문 코드(applyColOrder·alignColsToGroups·틀고정 보호 줄·상세 팝업 섹션 빌드)를 그대로 실행하고,
 *   원문 표 머리글(colgroup·thead)을 앱 CSS·글꼴로 크롬에 그려 '머리글 칸 = 본문 칸' 위치를 잰다.
 *   실행: node tests/list/tech1_col_order_test.js  (크롬 헤드리스 ~20초 · build/static/css 필요)
 */
process.env.BABEL_ENV = process.env.BABEL_ENV || 'test';   // babel-preset-react-app은 환경값이 없으면 멈춤
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const babel = require('@babel/core');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const ROOT = path.resolve(__dirname, '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'src/components/ProjectListScreen.jsx'), 'utf8').replace(/\r\n/g, '\n');
const dmSrc = fs.readFileSync(path.join(ROOT, 'src/components/DetailModal.jsx'), 'utf8').replace(/\r\n/g, '\n');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  OK   ' + m); } else { fail++; console.log('  NG   ' + m + (x !== undefined ? '  → ' + (typeof x === 'string' ? x : JSON.stringify(x)) : '')); } };
const grab = (s, a0, endStr) => { const a = s.indexOf(a0); if (a < 0) return null; const b = s.indexOf(endStr, a + a0.length); return b < 0 ? null : s.slice(a, b + endStr.length); };
const grabTo = (s, a0, endStr) => { const a = s.indexOf(a0); if (a < 0) return null; const b = s.indexOf(endStr, a + a0.length); return b < 0 ? null : s.slice(a, b); };
const J = (x) => JSON.stringify(x);
const flat = (gs) => gs.reduce((a, g) => a.concat(g.cols), []);

// ── ES 모듈 로더 (팀 카드·projectColumns) ──
const modCache = {};
function loadModule(file) {
    file = path.resolve(file);
    if (modCache[file]) return modCache[file].exports;
    const code = babel.transformFileSync(file, { babelrc: false, configFile: false, presets: ['@babel/preset-react'], plugins: ['@babel/plugin-transform-modules-commonjs'] }).code;
    const m = { exports: {} }; modCache[file] = m;
    const req = (p) => {
        if (!p.startsWith('.')) return require(p);
        let f = path.resolve(path.dirname(file), p);
        if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.js');
        else if (!fs.existsSync(f)) f += '.js';
        return loadModule(f);
    };
    new Function('module', 'exports', 'require', code)(m, m.exports, req);
    return m.exports;
}
const { getTeamProfile } = loadModule(path.join(ROOT, 'src/teamProfiles/index.js'));
const COLS = loadModule(path.join(ROOT, 'src/components/projectColumns.js'));

// ── 실제 헤더 구성 (2026-09-28 21:00 자동 백업 meta.byYear — 열 이름만, 행 값 없음) ──
const G = (arr) => arr.map(x => (Array.isArray(x) ? { label: x[0], cols: x[1] } : { label: '', cols: [x] }));
const H26 = ['순번', '일자', '요청자', '접수자', '수행번호', '견적코드', '고객사', '지역명', '공장명', '단계구분', '부문', '공사명', '계약', '작업', 'PLC', 'ETOS T/S', 'HMI', '자체 시운전', '통합 시운전', '총물량', '누적', '전월', '금월', '전체', '전월 (2)', '금월 (2)', '시작', '종료', '완료 처리', '유/무', '납품', '업체명', '담당자', '담당', '일자 (2)', '관리', '수행', '비고 [ISSUE]', '업체명 (2)', '당당자', 'TEL.', '폴더링크'];
const G26 = G(['순번', ['의뢰', ['일자', '요청자', '접수자']], ['프로젝트 정보', ['수행번호', '견적코드', '고객사', '지역명', '공장명', '단계구분', '부문', '공사명']], ['진행 현황', ['계약', '작업']], ['진행[%]', ['PLC', 'ETOS T/S', 'HMI', '자체 시운전', '통합 시운전']], ["시운전 수량[Q'ty]", ['총물량', '누적', '전월', '금월']], ['공정률[%]', ['전체', '전월 (2)', '금월 (2)']], ['날짜 정보', ['시작', '종료', '완료 처리']], ['자재', ['유/무', '납품']], ['발주처', ['업체명', '담당자']], ['물량산출', ['담당', '일자 (2)']], ['진행', ['관리', '수행']], '비고 [ISSUE]', ['관련공사', ['업체명 (2)', '당당자', 'TEL.']], '폴더링크']);
const H25 = ['순번', '일자', '요청자', '접수자', '프로젝트 코드', '견적코드', '고객사', '지역명', '공장명', '단계구분', '부문', '프로젝트명', '계약 현황', '작업 현황', '시작', '종료', '완료처리', '발주처', '발주처 담당자', '담당', '일자 (2)', '수행 담당', '비고', '업체명', '당당자', 'TEL.', '폴더링크'];
const G25 = G(['순번', ['의뢰', ['일자', '요청자', '접수자']], '프로젝트 코드', '견적코드', '고객사', '지역명', '공장명', '단계구분', '부문', '프로젝트명', '계약 현황', '작업 현황', ['날짜', ['시작', '종료', '완료처리']], '발주처', '발주처 담당자', ['물량산출', ['담당', '일자 (2)']], '수행 담당', '비고', ['관련공사', ['업체명', '당당자', 'TEL.']], '폴더링크']);
const H21 = ['순번', '일자', '요청자', '접수자', '프로젝트 코드', '견적코드', '고객사', '공장명', '구분', '부문', '프로젝트명', '견적', '작업 현황', '시작', '종료', '완료처리', '발주처', '발주처 담당자', '담당', '일자 (2)', '수행 담당', '비고', '업체명', '당당자', 'TEL.', '폴더링크', '왼료처리'];
const G21 = G(['순번', ['의뢰', ['일자', '요청자', '접수자']], '프로젝트 코드', '견적코드', '고객사', '공장명', '구분', '부문', '프로젝트명', '견적', '작업 현황', ['날짜', ['시작', '종료', '완료처리', '왼료처리']], '발주처', '발주처 담당자', ['물량산출', ['담당', '일자 (2)']], '수행 담당', '비고', ['관련공사', ['업체명', '당당자', 'TEL.']], '폴더링크']);
const H17 = ['순번', '일자', '요청자', '접수자', '프로젝트 코드', '견적코드', '고객사', '공장명', '구분', '부문', '프로젝트명', '견적', '작업 현황', '시작', '종료', '발주처', '발주처 담당자', '담당', '일자 (2)', '수행 담당', '비고', '업체명', '당당자', 'TEL.', '폴더링크'];
const G17 = G(['순번', ['의뢰', ['일자', '요청자', '접수자']], '프로젝트 코드', '견적코드', '고객사', '공장명', '구분', '부문', '프로젝트명', '견적', '작업 현황', ['날짜', ['시작', '종료']], '발주처', '발주처 담당자', ['물량산출', ['담당', '일자 (2)']], '수행 담당', '비고', ['관련공사', ['업체명', '당당자', 'TEL.']], '폴더링크']);
const H14 = ['순번', '접수일', 'NO.', '견적코드', '고객사', '공장명', '구분', '프로젝트명', '견적', '진행', '계약', '종료일', '발주처', '업체 담당자', '산출 담당자', '산출 완료일', '비고'];
const G14 = G(['순번', '접수일', ['프로젝트\r\nNO.', ['NO.']], '견적코드', '고객사', '공장명', '구분', '프로젝트명', '견적', '진행', '계약', '종료일', '발주처', '업체 담당자', '산출 담당자', '산출 완료일', '비고']);
const PAST = { 2025: [H25, G25], 2021: [H21, G21], 2017: [H17, G17], 2014: [H14, G14] };
// 팀장님이 말씀하신 결과 (… 진행(관리·수행) → 의뢰 → 견적코드 → 고객사 → 단계구분 → 부문 → 계약 → 비고 [ISSUE] …)
const WANT26 = ['순번', '수행번호', '지역명', '공장명', '공사명', '작업', 'PLC', 'ETOS T/S', 'HMI', '자체 시운전', '통합 시운전', '총물량', '누적', '전월', '금월', '전체', '전월 (2)', '금월 (2)', '시작', '종료', '완료 처리', '유/무', '납품', '업체명', '담당자', '담당', '일자 (2)', '관리', '수행',
    '일자', '요청자', '접수자', '견적코드', '고객사', '단계구분', '부문', '계약', '비고 [ISSUE]', '업체명 (2)', '당당자', 'TEL.', '폴더링크'];
const WANT_LABELS = ['', '프로젝트 정보', '진행 현황', '진행[%]', "시운전 수량[Q'ty]", '공정률[%]', '날짜 정보', '자재', '발주처', '물량산출', '진행', '의뢰', '', '', '', '', '', '', '관련공사', ''];

// ═══ 1. 팀 카드 ═══════════════════════════════════════════════════════════
console.log('■ 1. 팀 카드 — 기술1팀 열순서');
const t1 = getTeamProfile('기술1팀');
ok(J(t1.열순서) === J([{ 묶음: '의뢰', 앞: '비고 [ISSUE]' }, { 열: ['견적코드', '고객사'], 앞: '비고 [ISSUE]' }, { 열: ['단계구분', '부문', '계약'], 앞: '비고 [ISSUE]' }]),
   '열순서 = ① 의뢰 묶음 → ② 견적코드·고객사 → ③ 단계구분·부문·계약 (모두 비고 [ISSUE] 앞)', t1.열순서);
ok(J(getTeamProfile('기술2팀').열순서) === J([{ 열: '담당자', 앞: '관리자' }]) && J(getTeamProfile('기술3팀').열순서) === J([{ 열: '담당자', 앞: '관리자' }]), '기술2·3팀 열순서 그대로 (담당자 → 관리자)');
ok(!getTeamProfile('Software팀').열순서 && !getTeamProfile('Software팀 유지보수').열순서, 'Software팀·유지보수 = 열순서 없음');
ok(t1.열.고정기본열 === null, '기술1팀 틀고정 기본 = 없음 그대로 (팀장님 캡쳐에도 고정 없음)');
// 기본 화면 고정 폭 (2026-09-29 팀장님 "캡쳐 사진대로 PC 어디에서도 디폴트로 고정") — 캡쳐(1920·배율 100%·컴팩트) 격자선 실측값
const CAP = { '순번': 53, '수행번호': 68, '지역명': 67, '공장명': 56, '공사명': 170, '작업': 64, 'PLC': 57, 'ETOS T/S': 79, 'HMI': 51, '자체 시운전': 87, '통합 시운전': 74,
    '총물량': 64, '누적': 58, '전월': 58, '금월': 58, '전체': 58, '전월 (2)': 66, '금월 (2)': 63, '시작': 65, '종료': 66, '완료 처리': 71, '유/무': 54, '납품': 52, '업체명': 90, '담당자': 70 };
// 캡쳐는 정수 픽셀 — 소수 폭이 잘려 값 칸이 말줄임되던 6칸만 +1~2px (시작 65.55·업체명 90.42 등 실데이터 자연 폭 +1px 여유, 2026-09-29)
const BUMP = { '지역명': 68, '작업': 65, '시작': 67, '종료': 67, '업체명': 92, '담당자': 71 };
const SHOT = { ...CAP, ...BUMP };
const FIT1 = t1.기본맞춤 || {};
ok(FIT1.까지열 === '담당자' && J(FIT1.연도) === J(['2026']), "기본맞춤 = 발주처 담당자까지 · 2026만 (8/21 범위 그대로)");
ok(J(FIT1.고정폭) === J(SHOT), '고정폭 25칸 = 팀장님 캡쳐 폭 (순번 53 … 공사명 170 …) · 값 칸 6개만 +1~2px', FIT1.고정폭);
ok(Object.keys(SHOT).every(h => SHOT[h] - CAP[h] >= 0 && SHOT[h] - CAP[h] <= 2) && Object.keys(SHOT).filter(h => SHOT[h] !== CAP[h]).length === 6, '  └ 캡쳐와 다른 칸 = 6개뿐, 차이 1~2px (눈으로는 같음)');
const fx1Sum = Object.values(FIT1.고정폭 || {}).reduce((a, b) => a + Number(b), 0);
ok(Number(FIT1.기준폭) === 1727 && fx1Sum === 1727, `기준폭 = 고정폭 합계 = 1727 (1920에서 '관리' 칸 1792 앞)`, [FIT1.기준폭, fx1Sum]);

// ═══ 2. applyColOrder 원문 ═══════════════════════════════════════════════════
console.log('\n■ 2. 칸 순서 — applyColOrder 원문');
const aco = grab(src, 'const applyColOrder = ', '\n};');
ok(!!aco, 'applyColOrder 원문 찾음');
const applyColOrder = new Function(aco + '\nreturn applyColOrder;')();
const h26Copy = J(H26), g26Copy = J(G26);
const R = applyColOrder(H26, G26, t1.열순서);
ok(J(R.headers) === J(WANT26), '2026 칸 순서 = 말씀하신 그대로 (42칸)', R.headers);
ok(J(R.groups.map(g => g.label)) === J(WANT_LABELS), '윗줄 묶음 순서: … 진행 → 의뢰 → (제목 없는 6칸) → 관련공사 → 폴더링크', R.groups.map(g => g.label));
ok(J(flat(R.groups)) === J(R.headers), '묶음 안 칸 순서 = 칸 순서 (머리글 윗줄·아랫줄·본문 어긋남 없음)');
const gl = (lb) => (R.groups.find(g => g.label === lb) || {}).cols;
ok(J(gl('의뢰')) === J(['일자', '요청자', '접수자']), "① '의뢰' 묶음은 제목·3칸 그대로 통째 이동");
ok(J(gl('프로젝트 정보')) === J(['수행번호', '지역명', '공장명', '공사명']), "② '프로젝트 정보'엔 수행번호·지역명·공장명·공사명만 남음");
ok(J(gl('진행 현황')) === J(['작업']), "③ '진행 현황'엔 작업만 남음");
const solo = ['견적코드', '고객사', '단계구분', '부문', '계약'];
ok(solo.every(c => R.groups.some(g => !g.label && J(g.cols) === J([c]))), '뺀 5칸 = 각각 제목 없는 1칸 묶음 (순번·비고처럼 2줄 높이 머리글)');
ok(R.groups.every(g => g.label || g.cols.length === 1), '제목 없는 여러 칸 묶음 없음 (머리글 그리는 코드는 제목 없는 묶음을 1칸으로만 그림)');
const labs = R.groups.filter(g => g.label).map(g => g.label);
ok(new Set(labs).size === labs.length, '같은 묶음 제목이 두 번 나오지 않음');
ok(R.headers.indexOf('비고 [ISSUE]') === R.headers.indexOf('계약') + 1 && R.headers.indexOf('일자') === R.headers.indexOf('수행') + 1, '비고 [ISSUE] 바로 앞 = 계약 · 의뢰(일자) 바로 앞 = 진행>수행');
ok(J(R.moved) === J(['일자', '요청자', '접수자', '견적코드', '고객사', '단계구분', '부문', '계약']), '옮긴 칸 목록(moved) = 8칸 (틀고정 기억 보호용)', R.moved);
ok(J(H26) === h26Copy && J(G26) === g26Copy, '저장 헤더(원본 배열)는 바뀌지 않음 — 화면에 보일 때만 옮김');
const R2 = applyColOrder(R.headers, R.groups, t1.열순서);
ok(J(R2.headers) === J(R.headers) && J(R2.groups) === J(R.groups), '이미 새 순서로 저장된 헤더에 다시 적용해도 같은 결과 (엑셀 생성 → 재업로드해도 안전)');
Object.entries(PAST).forEach(([y, [h, g]]) => {
    const r = applyColOrder(h, g, t1.열순서);
    ok(r.headers === h && r.groups === g && r.moved.length === 0, `${y}년 = 그대로 (비고 열 이름이 '비고' → 규칙 건너뜀 · 연도별 1:1 유지)`);
});
// 종전(9/29 오전) 형식 규칙은 한 글자도 안 바뀌었나 — 오전판 원문과 무작위 비교
const applyColOrderAM = (headers, groups, rules) => {   // 2026-09-29 오전판 원문 (기술2·3팀 담당자 → 관리자)
    let hs = Array.isArray(headers) ? headers : [];
    let gs = Array.isArray(groups) ? groups : [];
    if (!Array.isArray(rules) || !rules.length || !hs.length) return { headers: hs, groups: gs };
    const nk = (h) => String(h ?? '').replace(/\s+/g, '');
    rules.forEach(r => {
        if (!r || !r.열 || !r.앞) return;
        const a = hs.find(h => nk(h) === nk(r.열)), b = hs.find(h => nk(h) === nk(r.앞));
        if (!a || !b || a === b || hs.indexOf(a) === hs.indexOf(b) - 1) return;
        const ga = gs.findIndex(g => (g.cols || []).includes(a)), gb = gs.findIndex(g => (g.cols || []).includes(b));
        let ngs = gs;
        if (ga >= 0 && gb >= 0) {
            if (ga === gb) { const cols = gs[ga].cols.filter(c => c !== a); cols.splice(cols.indexOf(b), 0, a); ngs = gs.map((g, i) => (i === ga ? { ...g, cols } : g)); }
            else if (!gs[ga].label && gs[ga].cols.length === 1 && !gs[gb].label && gs[gb].cols[0] === b) { const arr = gs.filter((_, i) => i !== ga); arr.splice(arr.indexOf(gs[gb]), 0, gs[ga]); ngs = arr; }
            else return;
        } else if (ga >= 0 || gb >= 0) return;
        const nh = hs.filter(h => h !== a); nh.splice(nh.indexOf(b), 0, a);
        hs = nh; gs = ngs;
    });
    return { headers: hs, groups: gs };
};
let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
let same = 0, runs = 0;
for (let i = 0; i < 2000; i++) {
    const n = 3 + Math.floor(rnd() * 10); const hs = Array.from({ length: n }, (_, k) => 'C' + k);
    const gs = []; let k = 0;
    while (k < n) { const len = rnd() < 0.5 ? 1 : 1 + Math.floor(rnd() * 3); gs.push({ label: (len > 1 || rnd() < 0.3) ? 'G' + k : '', cols: hs.slice(k, k + len) }); k += len; }
    const rules = Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => ({ 열: hs[Math.floor(rnd() * n)], 앞: hs[Math.floor(rnd() * n)] }));
    const a = applyColOrder(hs, gs, rules), b = applyColOrderAM(hs, gs, rules);
    runs++; if (J([a.headers, a.groups]) === J([b.headers, b.groups]) && a.moved.length === 0) same++;
}
ok(same === runs, `종전 형식(열 1칸) 규칙 = 오전판과 결과 동일 — 무작위 ${runs}가지 전부 (기술2·3팀 무변화)`, `${same}/${runs}`);
// 경계 경우
const E = { h: ['A', 'B', 'C', 'D', 'E'], g: [{ label: '', cols: ['A'] }, { label: 'X', cols: ['B', 'C'] }, { label: 'Y', cols: ['D', 'E'] }] };
const e1 = applyColOrder(E.h, E.g, [{ 묶음: 'X', 앞: 'E' }]);
ok(e1.headers === E.h, "'앞' 칸이 다른 묶음 한가운데(E = Y의 둘째 칸)면 안 옮김 — 머리글 깨짐 방지");
const e2 = applyColOrder(E.h, E.g, [{ 묶음: '없는묶음', 앞: 'D' }, { 열: ['Q'], 앞: 'D' }, { 열: ['C'], 앞: '없는칸' }]);
ok(e2.headers === E.h && e2.groups === E.g, '묶음·칸·앞 이름이 없으면 그 규칙만 건너뜀 (원본 그대로)');
const e3 = applyColOrder(E.h, E.g, [{ 열: ['Q', 'C'], 앞: 'D' }]);
ok(J(e3.headers) === J(['A', 'B', 'C', 'D', 'E']) && J(e3.groups.map(g => [g.label, g.cols])) === J([['', ['A']], ['X', ['B']], ['', ['C']], ['Y', ['D', 'E']]]), '적은 칸 중 있는 것만 옮김 (Q 없음 → C만 빼서 D 앞, 제목 없는 1칸)');
const e4 = applyColOrder(['가', '단계 구분', '다'], G(['가', ['묶', ['단계 구분', '다']]]), [{ 열: ['단계구분'], 앞: '가' }]);
ok(J(e4.headers) === J(['단계 구분', '가', '다']), '칸 이름 공백 차이 무시 (단계구분 = 단계 구분)');
const e5 = applyColOrder(['A', 'B', 'C'], [], [{ 열: ['C'], 앞: 'A' }]);
ok(J(e5.headers) === J(['C', 'A', 'B']) && J(e5.groups) === '[]', '묶음 정보 없는 표(한 줄 머리글)도 칸 순서만 옮김');

// ═══ 3. alignColsToGroups 원문 (2021 어긋남) ═══════════════════════════════════
console.log('\n■ 3. 칸 순서 = 머리글 묶음 순서 — alignColsToGroups 원문 (함께 고친 2021년 어긋남)');
const acg = grab(src, 'const alignColsToGroups = ', '\n};');
ok(!!acg, 'alignColsToGroups 원문 찾음');
const alignColsToGroups = new Function(acg + '\nreturn alignColsToGroups;')();
ok(J(flat(G21)) !== J(H21), "(원래 데이터) 2021: 칸 목록 끝 '왼료처리' ≠ 묶음 '날짜' 안 — 발주처부터 한 칸 어긋나던 원인");
const A21 = alignColsToGroups(H21, G21);
ok(J(A21) === J(flat(G21)) && A21.indexOf('왼료처리') === A21.indexOf('완료처리') + 1 && A21.length === H21.length, "2021 → 묶음 순서로 (왼료처리 = 완료처리 바로 뒤 · 27칸 그대로)");
ok(J(H21.slice().sort()) === J(A21.slice().sort()), '  └ 칸 빠짐·추가 없음 (순서만)');
[[H26, G26, '2026'], [H25, G25, '2025'], [H17, G17, '2017'], [H14, G14, '2014']].forEach(([h, g, y]) => ok(alignColsToGroups(h, g) === h, `${y} = 이미 맞음 → 받은 배열 그대로`));
ok(alignColsToGroups(['A', 'B'], []) !== null && J(alignColsToGroups(['A', 'B'], [])) === J(['A', 'B']), '묶음 없는 표 = 그대로');
ok(J(alignColsToGroups(['A', 'B', 'C'], G([['X', ['B', 'A']]]))) === J(['A', 'B', 'C']), '묶음에 칸이 빠져 있으면(C) = 손대지 않음');
ok(J(alignColsToGroups(['A', 'B'], G([['X', ['B', 'B']]]))) === J(['A', 'B']), '묶음에 같은 칸이 두 번이면 = 손대지 않음');
const hv = grabTo(src, '    const _hdrView        = useMemo(() => {', '    }, [_rawHeaders, _rawColGroups, _mgrOff, _colOrder]);');
ok(!!hv && hv.indexOf('alignColsToGroups(hs0, gs)') > 0 && hv.indexOf('alignColsToGroups') < hv.indexOf('applyColOrder('), '화면 헤더 = 묶음 순서 맞춤 → 그다음 칸 순서 규칙 (순서대로 연결됨)');

// ═══ 4. 틀고정 기억 보호 (원문 한 줄) ═══════════════════════════════════════════
console.log('\n■ 4. 틀고정 기억 — 옛 배치에서 고른 고정이 표 대부분을 묶지 않게');
const mvLine = (src.match(/const _mvR = ([^\n;]+);/) || [])[1];
ok(!!mvLine, '원문 판정 줄 찾음');
const mvR = (v, hdrView) => new Function('v', '_hdrView', 'return ' + mvLine + ';')(v, hdrView);
ok(mvR('견적코드', R) === true, "기억된 고정 '견적코드'(옛 6번째 → 새 33번째) = 무시하고 기본(기술1팀 = 고정 없음)");
ok(mvR('접수자', R) === true && mvR('계약', R) === true, "  └ '접수자'·'계약'도 같음");
ok(mvR('공사명', R) === false && mvR('수행번호', R) === false, "'공사명'·'수행번호'까지 고정 = 그대로 (오히려 고정 칸이 줄어듦 — 12칸 → 5칸)");
ok(mvR(null, R) === false, '기억 없음 = 판정 안 함');
const t2R = applyColOrder(['번호', 'Project', '관리자', '담당자'], G(['번호', 'Project', '관리자', '담당자']), [{ 열: '담당자', 앞: '관리자' }]);
ok(mvR('관리자', t2R) === false && mvR('담당자', t2R) === false, "기술2·3팀(담당자 ↔ 관리자) = 어느 칸 고정이든 그대로 (보호 대상 아님)");
const fe = grabTo(src, '        if (v === \'NONE\')', '        setFrozenUpTo(projectNameCol || null);');
ok(!!fe && fe.indexOf('!_mvR') > 0 && fe.indexOf('const _mvR') < fe.indexOf('activeHeaders.includes(v) && !_mvR'), '원문: 기억된 열 복원 조건에 보호 판정이 걸림');

// ═══ 5. 상세 팝업 — 섹션 순서도 표와 같게 (DetailModal 원문) ═══════════════════════════
console.log('\n■ 5. 상세 팝업 — 섹션 순서 (DetailModal 원문 섹션 빌드)');
const secSrc = grabTo(dmSrc, '    // ── 묶음 섹션 빌드', '\n\n    // ── 공통 스타일');
ok(!!secSrc, 'DetailModal 섹션 빌드 원문 찾음');
const buildSections = new Function('activeColGroups', 'activeHeaders', 'isInternal', secSrc + '\nreturn sections;');
const secs = buildSections(R.groups, R.headers, (h) => String(h).startsWith('_'));
ok(J(secs.map(s => s.label)) === J([null, '프로젝트 정보', '진행 현황', '진행[%]', "시운전 수량[Q'ty]", '공정률[%]', '날짜 정보', '자재', '발주처', '물량산출', '진행', '의뢰', null, '관련공사', null]),
   '섹션 순서 = 표 순서 (… 진행 → 의뢰 → [견적코드~비고] → 관련공사 → 폴더링크)', secs.map(s => s.label));
ok(J(secs[12].cols) === J(['견적코드', '고객사', '단계구분', '부문', '계약', '비고 [ISSUE]']), '제목 없는 섹션 한 곳에 견적코드·고객사·단계구분·부문·계약·비고 [ISSUE]');
ok(J(flat(secs)) === J(R.headers), '팝업 칸 42개 전부 한 번씩 (빠짐·중복 없음)');
ok(J(buildSections(G26, H26, () => false).map(s => s.label)) === J([null, '의뢰', '프로젝트 정보', '진행 현황', '진행[%]', "시운전 수량[Q'ty]", '공정률[%]', '날짜 정보', '자재', '발주처', '물량산출', '진행', null, '관련공사', null]), '(대조) 규칙 없으면 엑셀 순서 그대로');

// ═══ 6. 기본 폭 — computeDefaultFit 원문 (카드 고정폭 = 캡쳐 폭) ═══════════════════════
console.log('\n■ 6. 기본 폭 — computeDefaultFit 원문 (모니터 폭·데이터와 무관한가)');
const cdf = grab(src, 'const computeDefaultFit = ', '\n};');
ok(!!cdf, 'computeDefaultFit 원문 찾음');
const computeDefaultFit = new Function(cdf + '\nreturn computeDefaultFit;')();
const nk = (h) => String(h ?? '').replace(/\s+/g, '');
const mvh26 = R.headers.filter(h => h !== '실행번호' && !String(h).startsWith('_'));
const alias26 = (n) => mvh26.find(h => nk(h) === nk(n)) || null;
const pctMin1 = [...(t1.표시?.퍼센트표기열 || []), ...(t1.표시?.막대제거 || [])].map(nk);
const fitOf = (o) => computeDefaultFit(Object.assign({ cfg: FIT1, heads: mvh26, allHeads: R.headers, colWidths: {}, nat: null, W: FIT1.기준폭, compact: 1, baseW: () => 60, pctMin: pctMin1, alias: alias26 }, o));
const fit26 = fitOf({});
ok(!fit26.needNat && J(fit26.widths) === J(Object.fromEntries(mvh26.slice(0, 25).map(h => [h, SHOT[h]]))), '2026·컴팩트 = 캡쳐 폭 25칸 그대로 (자연 폭 측정 불필요 → 깜빡임 없음)', fit26.widths);
ok(mvh26[24] === '담당자' && Object.keys(fit26.widths).length === 25, '  └ 범위 = 새 순서의 순번 ~ 발주처 담당자 25칸 (의뢰·견적코드 등은 그 뒤라 제외)');
const mons = [1100, 1366, 1920, 2560, 3840].map(W => J(fitOf({ W }).widths));
ok(mons.every(x => x === mons[0]), '모니터 폭 5종(1100~3840)에 넣어도 결과 동일 = 모니터 크기와 무관');
ok(J(fitOf({ nat: Object.fromEntries(mvh26.map(h => [h, h === '공사명' ? 900 : 200])) }).widths) === J(fit26.widths), '긴 공사명(900px)·긴 값이 들어와도 결과 동일 = 데이터 길이와 무관');
const fitMan = fitOf({ colWidths: { '공사명': 300 } });
ok(!fitMan.widths['공사명'] && fitMan.widths['작업'] === SHOT['작업'], '손잡이로 바꾼 칸(그 PC)은 계산에서 빠지고 그 폭 우선 — 나머지는 카드 폭 그대로');
const fitHid = fitOf({ heads: mvh26.filter(h => h !== '지역명') });
ok(!fitHid.needNat && !fitHid.widths['지역명'] && fitHid.widths['공사명'] === 170, '칸 하나 숨겨도(지역명) 나머지 캡쳐 폭 유지');
ok(fitOf({ compact: 0 }).needNat === true, '컴팩트가 아닌 모드(기본·초소형) = 고정폭 대신 종전 맞춤 (맞춤 폭 = 기준폭 1727, 창 폭 아님)');
const fitOld = computeDefaultFit({ cfg: FIT1, heads: H25, allHeads: H25, colWidths: {}, nat: null, W: FIT1.기준폭, compact: 1, baseW: () => 60, pctMin: pctMin1, alias: (n) => H25.find(h => nk(h) === nk(n)) || null });
ok(Object.keys(fitOld.widths).length === 0, '(참고) 옛 양식(2025 열 이름)엔 고정폭 안 씀 — 게다가 카드 연도 = 2026만이라 옛 연도는 맞춤 자체가 꺼짐');

// ═══ 7. 실제 크롬 — 원문 머리글을 그려 '머리글 칸 = 본문 칸' + 캡쳐 폭 ═══════════════════════
console.log('\n■ 7. 실제 크롬 — 원문 표 머리글을 앱 CSS·글꼴로 그려 잰다');
const pieces = {
    getW: grabTo(src, '    const getW = h => {', '\n    // ── 리사이즈'),
    dispHeader: (src.match(/    const dispHeader = [^\n]+/) || [])[0],
    Combo: grabTo(src, '    const ComboFilter = ({ h, small = false }) => {', '    // 헤더 표시 이름'),
    Sort: grabTo(src, '    const SortHeader = ({ h, small = false, forceColor }) => {', '\n    // ─── 데이터 소스 배지'),
    grp: grabTo(src, '    const grpEndCols = useMemo(() => {', '\n    // \'공사 진행\' 묶음 범위'),
    prog: grabTo(src, "    const _progGrp  = ", '\n\n    // 상세 화면에 표시할 비-메인 열'),
    iife: grabTo(src, '                                // 헤드 높이 약 20% 축소', '                                return (<>'),
    colgroup: grab(src, '<colgroup>', '</colgroup>'),
    thead: grab(src, '<thead className="sticky top-0 z-30"', '</thead>'),
};
Object.entries(pieces).forEach(([k, v]) => ok(!!v, '원문 조각 찾음: ' + k));
const TBODY = `<tbody>{ROWS.map((r, ri) => (<tr key={ri}>{mainVisibleHeaders.map(h => (
    <td key={h} data-td={h} className={\`\${tdPx} align-middle border-r border-slate-400 \${cellSz} \${(colWidths[h]||fitWidths[h])?'col-clip':''}\`}
        style={{width: getW(h)||40, minWidth: getW(h)||40, maxWidth: getW(h)||40, '--cw': \`\${getW(h)||40}px\`}}>{r[h] ?? ''}</td>))}
    <td style={{ width: MGR_COL_W, minWidth: MGR_COL_W, maxWidth: MGR_COL_W }}/></tr>))}</tbody>`;
const jsx = `module.exports = function (ctx) { with (ctx) {
${pieces.getW}
${pieces.dispHeader}
${pieces.Combo}
${pieces.Sort}
${pieces.grp}
${pieces.prog}
${pieces.iife}
return (<table className="text-left border-collapse list-oneline" style={{ minWidth:'100%' }}>${pieces.colgroup}${pieces.thead}${TBODY}</table>);
} };`;
const compiled = babel.transformSync(jsx, { presets: [['babel-preset-react-app', { runtime: 'classic' }]], filename: 'tbl.js', babelrc: false, configFile: false, sourceType: 'script' }).code.replace(/^["']use strict["'];?/, '');
const renderTable = (() => { const m = { exports: {} }; new Function('module', 'require', compiled)(m, require); return m.exports; })();
const GLOBALS = new Set(['Math', 'Number', 'String', 'Object', 'Array', 'JSON', 'Date', 'Boolean', 'Set', 'Map', 'RegExp', 'parseInt', 'parseFloat', 'isNaN', 'console', 'Error', 'Symbol', 'Infinity', 'NaN', 'undefined']);
const Icon = (p) => React.createElement('i', { style: { display: 'inline-block', width: (p.size || 16) + 'px', height: (p.size || 16) + 'px', flex: 'none' } });
// 본문 1줄 — 가짜 값(칸마다 길이만 그럴듯하게). 실제 고객 데이터 안 씀
// 폭 검사용 가짜 값 — 2026 실제 가장 긴 값과 글자 수·종류가 같게(한글 글자 폭 균일): 업체명 '한글4/한글3'·담당자 '한글3,한글2'·지역명 한글5·날짜 26'06/15
const WIDE = { '지역명': '가나다라마', '시작': "26'06/15", '종료': "26'03/18", '업체명': '가나다라/마바사', '담당자': '가나다,라마' };
const fakeRow = (heads) => Object.fromEntries(heads.map((h, i) => [h, WIDE[h] || (h.includes('공사명') || h.includes('프로젝트명') ? '예시 공사명 — 폭 확인용 가짜 값 ' + i : (h.includes('담당') || h.includes('접수') || h.includes('요청') || h === '수행' || h === '관리') ? '홍길동' : 'v' + i)]));
function tableOf(headers, groups, extra) {
    const mvh = headers.filter(h => h !== '실행번호' && !String(h).startsWith('_'));
    const mvg = groups.map(g => ({ ...g, cols: g.cols.filter(c => mvh.includes(c)) })).filter(g => g.cols.length);
    const base = Object.assign({
        React, compactMode: 1, frozenUpTo: null, mainVisibleHeaders: mvh, mainVisibleGroups: mvg, activeColGroups: groups,
        hasMainGroups: mvg.some(g => g.label), hasMainMids: false, headRows: 2, activeColMids: {}, colWidths: {}, fitWidths: {}, winPinW: {},
        MGR_COL_W: 78, EXEC_NO_COL: '실행번호', isStatusCol: COLS.isStatusCol, isDateCol: COLS.isDateCol, isFilterable: COLS.isFilterable,
        isMultiLineCol: () => false, useMemo: (fn) => fn(), statusFilterCol: '작업', assigneeFilterCol: '수행',
        activeStatusChips: new Set(), activeAssignees: new Set(), columnFilters: {}, openFilter: null, sortConfig: { key: null, dir: 'asc' },
        ASSIGNEES: t1.담당자목록 || [], assigneeCountMap: {}, extractName: (s) => s, normalizeAssignee: (s) => s, uniqueVals: {},
        STATUS_OPTIONS: t1.상태.기본목록 || [], filterSearch: '', filterRefs: { current: {} },
        fmHdrAuto: () => false, paHdrAuto: () => false, createPortal: () => null, ROWS: [fakeRow(mvh)],
    }, extra || {});
    const ctx = new Proxy(base, { has: () => true, get(t, k) { if (k in t) return t[k]; if (typeof k !== 'string') return undefined; if (GLOBALS.has(k)) return globalThis[k]; if (/^[A-Z]/.test(k)) return Icon; return () => undefined; } });
    return { html: renderToStaticMarkup(renderTable(ctx)), mvh };
}
const T26 = tableOf(R.headers, R.groups);
const T21new = tableOf(alignColsToGroups(H21, G21), G21);
const T21old = tableOf(H21, G21);   // (대조) 고치기 전 — 칸 목록 순서 그대로
const T26old = tableOf(H26, G26);   // (대조) 규칙 없는 2026
// 캡쳐 폭(카드 고정폭) — 실제 머리글처럼 자동 계산 칸(누적·전월 등)에 파란 테두리 표시 포함
// 머리글 파란 테두리 = 자동 칸 − 카드 '기본미적용'(통합 시운전 2026) — List fmHdrAuto와 같은 규칙 (2026-09-29: 통합 시운전이 자동 칸이 됨)
const fmAuto1 = (h) => (t1.수식?.자동 || []).map(nk).includes(nk(h)) && !((t1.기본미적용?.연도 || ['2026']).includes('2026') && (t1.기본미적용?.항목 || []).map(nk).includes(nk(h)));
ok(/const fmHdrAuto = \(h\) => [^\n]*&& !fmHdrDefOff\(h\);/.test(fs.readFileSync(path.join(ROOT, 'src/components/ProjectListScreen.jsx'), 'utf8')), "List 머리글 테두리 규칙 = 자동 칸 − 기본 꺼짐 칸 (이 검사와 같은 규칙)");
const TFIX = tableOf(R.headers, R.groups, { fitWidths: fit26.widths, fmHdrAuto: fmAuto1 });
const cases = { t26: T26, t21new: T21new, t21old: T21old, t26old: T26old };
const FIXBOX = [{ k: 'fix1366', w: 1316, z: 1 }, { k: 'fix1920', w: 1870, z: 1 }, { k: 'fix2560', w: 2510, z: 1 }, { k: 'fixz80', w: 1870, z: 0.8 }, { k: 'fixz90', w: 1870, z: 0.9 }, { k: 'fixz125', w: 1870, z: 1.25 }];
FIXBOX.forEach(b => { cases[b.k] = TFIX; });
ok(Object.values(cases).every(c => c.html.startsWith('<table')), '원문 머리글이 실제로 그려짐 (10가지)');
const cssFile = fs.readdirSync(path.join(ROOT, 'build/static/css')).find(f => f.endsWith('.css'));
const css = fs.readFileSync(path.join(ROOT, 'build/static/css', cssFile), 'utf8');
const twjs = fs.readFileSync(path.join(__dirname, 'tailwind.cdn.js'), 'utf8');
const _idx = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
const _a = _idx.indexOf('tailwind.config =');
const twcfg = _idx.slice(_a, _idx.indexOf('</' + 'script>', _a));
const boxOf = (k) => FIXBOX.find(b => b.k === k) || { w: 4000, z: 1 };   // 1920 모니터 표 상자 = 1870px(좌우 여백 24·테두리 1) · 1366 = 1316 · 2560 = 2510
const boxes = Object.entries(cases).map(([k, c]) => `<div class="case" data-k="${k}" style="width:${boxOf(k).w}px"><div class="overflow-auto custom-scrollbar wrapx" style="zoom:${boxOf(k).z}">${c.html}</div></div>`).join('\n');
const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<script>${twjs}<\/script>
<script>${twcfg}<\/script>
<style>${css}</style>
<style>body{margin:0}.case{overflow:hidden;margin-bottom:8px}</style>
</head><body>
${boxes}
<pre id="out"></pre>
<script>
const measure = () => {
  const res = {};
  document.querySelectorAll('.case').forEach(box => {
    const x0 = box.querySelector('table').getBoundingClientRect().left;
    const px = (el) => Math.round((el.getBoundingClientRect().left - x0) * 10) / 10;
    res[box.dataset.k] = {
      clientW: box.querySelector('.wrapx').clientWidth,
      th: [...box.querySelectorAll('thead th[data-col]')].map(th => { const b = th.querySelector('button'); let tw = 0; if (b) { const rg = document.createRange(); rg.selectNodeContents(b); tw = Math.round(rg.getBoundingClientRect().width * 10) / 10; }
        return { h: th.dataset.col, x: px(th), rs: th.rowSpan, w: Math.round(th.getBoundingClientRect().width * 10) / 10, sw: b ? b.scrollWidth : 0, cw: b ? b.clientWidth : 0, tw }; }),
      td: [...box.querySelectorAll('tbody tr:first-child td[data-td]')].map(td => { const rg = document.createRange(); rg.selectNodeContents(td); const cs = getComputedStyle(td);
        return { h: td.dataset.td, x: px(td), w: Math.round(td.getBoundingClientRect().width * 10) / 10, need: Math.round((rg.getBoundingClientRect().width + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + parseFloat(cs.borderRightWidth)) * 100) / 100 }; }),
      top: [...box.querySelectorAll('thead tr:first-child th')].map(th => ({ t: th.textContent.trim(), cs: th.colSpan, rs: th.rowSpan, x: px(th), w: Math.round(th.getBoundingClientRect().width * 10) / 10 })),
    };
  });
  res.font = { loaded: [...document.fonts].filter(f => /Pretendard/i.test(f.family) && f.status === 'loaded').length };
  document.getElementById('out').textContent = 'RESULT' + JSON.stringify(res);
};
document.fonts.ready.then(() => setTimeout(measure, 300));
<\/script></body></html>`;
const page = path.join(os.tmpdir(), 'pms_t1order_measure.html');
fs.writeFileSync(page, html, 'utf8');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 't1orderchrome-'));
const dump = execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=15000', '--window-size=4100,1400',
    '--user-data-dir=' + profile, '--dump-dom', 'file:///' + page.replace(/\\/g, '/')], { encoding: 'utf8', maxBuffer: 1 << 28 });
const mm = dump.match(/RESULT(\{.*\})<\/pre>/s);
ok(!!mm, '크롬 측정 결과를 받음');
const M = JSON.parse(mm[1]);
ok(M.font.loaded > 0, `앱 글꼴(Pretendard)로 그려짐 (로드 ${M.font.loaded}개)`);
// 머리글 칸(아랫줄 + 2줄짜리) 왼쪽 끝 = 같은 이름 본문 칸 왼쪽 끝
const aligned = (m) => { const tdx = Object.fromEntries(m.td.map(t => [t.h, t.x])); const bad = m.th.filter(t => Math.abs(t.x - tdx[t.h]) > 1); return { bad, n: m.th.length }; };
const a26 = aligned(M.t26);
ok(a26.n === 42 && a26.bad.length === 0, '2026 새 순서: 머리글 42칸이 전부 자기 본문 칸 바로 위 (±1px)', a26.bad.slice(0, 5));
const thOrder = [...M.t26.th].sort((p, q) => p.x - q.x).map(t => t.h);
ok(J(thOrder) === J(WANT26), '  └ 화면(크롬) 왼쪽→오른쪽 머리글 순서 = 말씀하신 순서');
const topSeq = M.t26.top.map(t => (t.cs > 1 ? `${t.t}×${t.cs}` : t.t));
ok(J(topSeq.slice(0, 3)) === J(['순번', '프로젝트 정보×4', '진행 현황']), "  └ 윗줄 시작: 순번 | 프로젝트 정보(4칸) | 진행 현황(1칸)", topSeq.slice(0, 3));
const iIdx = topSeq.indexOf('의뢰×3');
ok(iIdx > 0 && J(topSeq.slice(iIdx - 1, iIdx + 8)) === J(['진행×2', '의뢰×3', '견적코드', '고객사', '단계구분', '부문', '계약', '비고 [ISSUE]', '관련공사×3']),
   '  └ 윗줄 뒤쪽: 진행 | 의뢰(3칸) | 견적코드 | 고객사 | 단계구분 | 부문 | 계약 | 비고 [ISSUE] | 관련공사', topSeq.slice(iIdx - 1, iIdx + 8));
const soloTh = M.t26.th.filter(t => solo.includes(t.h));
ok(soloTh.length === 5 && soloTh.every(t => t.rs === 2), '  └ 뺀 5칸 머리글 = 2줄 높이 한 칸 (순번·비고와 같은 모양)');
const a21n = aligned(M.t21new), a21o = aligned(M.t21old);
ok(a21o.bad.length > 0, `(대조) 2021 고치기 전 = 머리글 ${a21o.bad.length}칸이 본문과 어긋남 (발주처부터 한 칸씩) — 검사가 실제로 잡음`, a21o.bad.map(b => b.h).slice(0, 3));
ok(a21n.n === 27 && a21n.bad.length === 0, '2021 고친 뒤 = 머리글 27칸 전부 자기 본문 칸 위 (발주처 제목 아래 = 발주처 값)', a21n.bad.slice(0, 5));
ok(aligned(M.t26old).bad.length === 0, '(대조) 규칙 없는 2026도 원래 맞음 — 새 규칙이 어긋남을 만들지 않음');
// ── 캡쳐 폭(고정폭) — 1920 모니터 기준 ──
const F19 = M.fix1920, byF = Object.fromEntries(F19.th.map(c => [c.h, c]));
const cols25 = Object.keys(SHOT);
const badFW = cols25.filter(h => !byF[h] || Math.abs(byF[h].w - SHOT[h]) > 1);
ok(badFW.length === 0, '카드 폭 25칸 = 화면 폭 (±1px) — 순번 53 · 공사명 170 · 발주처 담당자 71 …', badFW.map(h => `${h} ${byF[h] && byF[h].w}≠${SHOT[h]}`));
const cut25 = cols25.filter(h => { const c = byF[h]; return !c || c.sw > c.cw || c.cw - c.tw < 1; });
ok(cut25.length === 0, '머리글 25칸 전부 안 잘림 (여유 1px 이상 · 자동 계산 칸 파란 테두리 포함)', cut25.map(h => `${h} 여유 ${byF[h] && Math.floor((byF[h].cw - byF[h].tw) * 10) / 10}`));
const tight = cols25.map(h => ({ h, s: Math.floor((byF[h].cw - byF[h].tw) * 10) / 10 })).sort((a, b) => a.s - b.s).slice(0, 4);
console.log('     (가장 빠듯한 칸: ' + tight.map(t => `${t.h} ${t.s}px`).join(' · ') + ')');
const endF = byF['담당자'].x + byF['담당자'].w;
ok(Math.abs(endF - 1727) <= 2 && endF <= F19.clientW - 78, `발주처 담당자 오른쪽 끝 = ${Math.round(endF)}px — 1920에서 '관리' 칸(${F19.clientW - 78}px~) 앞 = 가리지 않음`, endF);
const tdF = Object.fromEntries(F19.td.map(t => [t.h, t.w]));
ok(cols25.every(h => Math.abs(tdF[h] - SHOT[h]) <= 1), '본문 칸도 같은 폭 — 긴 공사명이 칸을 넓히지 않음(말줄임)', cols25.filter(h => Math.abs(tdF[h] - SHOT[h]) > 1));
const tdNeed = Object.fromEntries(F19.td.map(t => [t.h, t.need]));
Object.keys(WIDE).forEach(h => ok(tdNeed[h] + 1 <= SHOT[h], `   ${h} 가장 긴 값(같은 글자 수) 다 보임 — 필요 ${tdNeed[h]}px / 칸 ${SHOT[h]}px (여유 1px 이상)`));
ok(['시작', '업체명'].every(h => tdNeed[h] > CAP[h]), '  └ (대조) 시작·업체명은 캡쳐 정수 폭이면 1px 못 미쳐 말줄임(팀장님 사진의 26\'03/… 재현) — 그래서 올림', Object.fromEntries(['시작', '업체명'].map(h => [h, [tdNeed[h], CAP[h]]])));
ok(['fix1366', 'fix2560'].every(k => cols25.every(h => { const a = M[k].th.find(c => c.h === h); return a && Math.abs(a.w - byF[h].w) <= 0.5; })), '1366·1920·2560 모니터에서 25칸 폭 전부 동일 (모니터 크기와 무관)');
['fixz80', 'fixz90', 'fixz125'].forEach(k => { const cut = cols25.filter(h => { const c = M[k].th.find(x => x.h === h); return !c || c.sw > c.cw; });
    ok(cut.length === 0, `표 배율 ${k.slice(4)}%에서도 머리글 25칸 안 잘림`, cut); });

console.log('\n' + '='.repeat(62));
console.log(`결과: ${pass}/${pass + fail} 통과` + (fail ? `  ★ 실패 ${fail}건` : '  ✓'));
process.exit(fail ? 1 : 0);
