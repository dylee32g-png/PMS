/* 기술1팀 진행 수치 '누계' 검사 (2026-09-29) — 팀장님 "바꾸기" + "토글 꺼져 있으면 진행실적 팝업에도 없어져야" + "종료 주 + 기존 4건 이동"
 *   + "자체 시운전은 무조건 프로젝트에 기본 활성화" + "메인표는 × 인데 팝업엔 PLC·ETOS가 나온다(010 취소) — 전수 조사해서 꼼꼼히"
 *   적용 규칙(하나): PLC·ETOS·HMI = 메인표에 값이 있어야 적용(완료·취소·진행 중 모두) · 자체 시운전 = 항상 적용 · 끈 항목(_naItems)·통합(2026 기본 off) = 빠짐
 *   ① tech1Progress.js 순수 함수(날짜·주차·누계 계산·종료 주 이동)
 *   ② ProjectListScreen 원문 조각(t1EmptyOffOf·fmDeriveCum·naToProgressItems)을 실제 장부 숫자(9/29 06:00 백업 — 숫자만)에 돌려 메인표 자동 칸 확인
 *   ③ App.js 원문 getRecordMonthlyProgress(실적 그래프 공정률) — 끝난 달 · 소수 1자리
 *   ④ 연결 확인(원문 문자열) — 팝업 sumAsPct 끔·[적용하기] 장부 전달·바뀐 칸만 저장·종료 주 기록·월간 마감 칸 비움 없음·모바일 카드대로
 *   ⑤ 상세 보기(DetailModal 원문) 렌더 — 값 있음·켜 둔 항목 = '적용' / 빈 PLC·ETOS·HMI = '빈칸' / 자체 시운전 = 항상 '적용' / 끈 항목 = '미적용'
 *   ⑥ 전수 대조 — 2026 17건 + 경우별 5건: 메인표 값 칸 = 진행실적 팝업 줄 = 상세 보기 '적용', 메인표 공정률 = 팝업 진척률(ProgressModal 원문) = 그래프(App 원문)
 *      + 팝업 계산 범위 ±6개월 시한폭탄(3월 완료 → 10월부터 팝업 50%) 재현·수리 확인
 *   ⑦~⑫ 자동 칸 전수 점검(2026-09-29 오후) — 달 바뀜 새 달 맞춤·상세 보기 잠금·행 복사·엑셀 반영 보호·저장 경로 장부 기록·초기화·마감 연도·안내문
 *   ⑬ 팀장님 답 — 완료 프로젝트 = 종료 주로 자동 이동([적용하기]·완료로 바꿀 때) · 통합 시운전 = 자체 시운전과 같게(자동 칸·스위치)
 *   ⑭ 팀장님 답 — 진행실적 팝업 다음 달 이후 주 칸 잠금 (팝업 = 메인표 '오늘 달까지') · 이미 있던 미래 값은 지우기만
 *   실행: node tests/list/tech1_progress_test.js   (크롬 없음 · 몇 초)
 */
process.env.BABEL_ENV = process.env.BABEL_ENV || 'test';
const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const ROOT = path.resolve(__dirname, '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'src/components/ProjectListScreen.jsx'), 'utf8').replace(/\r\n/g, '\n');
const appSrc = fs.readFileSync(path.join(ROOT, 'src/App.js'), 'utf8').replace(/\r\n/g, '\n');
const pmSrc = fs.readFileSync(path.join(ROOT, 'src/components/ProgressModal.jsx'), 'utf8').replace(/\r\n/g, '\n');
const mobSrc = fs.readFileSync(path.join(ROOT, 'src/components/MobileInputScreen.jsx'), 'utf8').replace(/\r\n/g, '\n');
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  OK   ' + m); } else { fail++; console.log('  NG   ' + m + (x !== undefined ? '  → ' + (typeof x === 'string' ? x : JSON.stringify(x)) : '')); } };
const J = (x) => JSON.stringify(x);
const grabTo = (s, a0, endStr) => { const a = s.indexOf(a0); if (a < 0) return null; const b = s.indexOf(endStr, a + a0.length); return b < 0 ? null : s.slice(a, b + endStr.length); };

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
        else if (!fs.existsSync(f)) { f = fs.existsSync(f + '.js') ? f + '.js' : f + '.jsx'; }
        return loadModule(f);
    };
    new Function('module', 'exports', 'require', code)(m, m.exports, req);
    return m.exports;
}
const T = loadModule(path.join(ROOT, 'src/components/tech1Progress.js'));
const { getTeamProfile } = loadModule(path.join(ROOT, 'src/teamProfiles/index.js'));
const t1 = getTeamProfile('기술1팀');

// ═══ 1. 순수 함수 ═══════════════════════════════════════════════════════════
console.log('■ 1. tech1Progress.js — 날짜·주차·누계·종료 주 이동');
ok(t1.수식 && t1.수식.방식 === '누계', "팀 카드 기술1팀 수식.방식 = '누계' (2026-09-29 전환)");
ok(!getTeamProfile('기술2팀').수식 && !getTeamProfile('기술3팀').수식, '기술2·3팀은 수식 없음 = 이번 변경과 무관');
[["26'03/20", '2026-03-20'], ['26’04/30', '2026-04-30'], ['2026-05-21', '2026-05-21'], ['26.07.16', '2026-07-16'], ['2026/3/2', '2026-03-02'], ['?', ''], ['', ''], ["26'13/01", '']]
    .forEach(([v, w]) => ok(T.t1DateToYmd(v) === w, `날짜 읽기 ${J(v)} → ${J(w)}`, T.t1DateToYmd(v)));
[['2026-03-20', '2026-3-3'], ['2026-04-30', '2026-4-5'], ['2026-05-21', '2026-5-3'], ['2026-07-16', '2026-7-3'], ['2026-03-01', '2026-3-1'], ['2026-03-07', '2026-3-1'], ['2026-03-08', '2026-3-2'], ['2026-03-29', '2026-3-5'], ['2026-03-31', '2026-3-5'], ['', '']]
    .forEach(([v, w]) => ok(T.t1WeekKeyOfYmd(v) === w, `주차 ${v || '(빈칸)'} → ${w || '(빈칸)'} (1~7일 1주 … 29일~ 5주, 팝업 규칙과 같음)`, T.t1WeekKeyOfYmd(v)));
const D = (o) => T.t1CumDerive(Object.assign({ weekly: {}, cur: {}, curFrom: '2026-09', totalPt: 0, apply: {}, refYm: '2026-09' }, o));
let d = D({ weekly: { hmi: { '2026-3-5': 100 }, commissioning: { '2026-3-5': 3210 } }, cur: { hmi: 100 }, curFrom: '2026-03', totalPt: 3210, apply: { hmi: true, self: true } });
ok(d.acc === 3210 && d.selfPct === 100 && d.all === 100 && d.cur2 === 0 && d.prev2 === 0 && d.curPts === 0,
   '001형(3월 완료·9월에 소급): 누적 3,210 · 자체 100% · 공정률 100% · 이번/지난달 늘어난 만큼 0', d);
d = D({ weekly: { plc: { '2026-8-3': 50 }, commissioning: { '2026-8-2': 12, '2026-9-1': 8 } }, cur: { plc: 70 }, totalPt: 40, apply: { plc: true, self: true } });
ok(d.acc === 20 && d.curPts === 8 && d.prevPts === 12 && d.selfPct === 50 && d.all === 60 && d.cur2 === 20 && d.prev2 === 40,
   '진행 중 예: 8월 PLC 50·12점 → 9월 PLC 70·8점 (총물량 40) = 누적 20 · 금월 8 · 전월 12 · 전체 60 · 금월 +20 · 전월 +40', d);
ok(D({ weekly: { plc: { '2026-9-1': 70 } }, cur: { plc: 70 }, apply: { plc: true } }).cur2 === 70, '  └ 방금 친 값(메인표)이 이번 달 값 — 장부에 아직 없어도 반영');
d = D({ weekly: { hmi: { '2026-8-2': 80 } }, cur: { hmi: 60 }, apply: { hmi: true } });
ok(d.all === 60 && d.cur2 === -20, '값을 낮추면 금월(늘어난 만큼)이 마이너스 — 고친 기록이 보임(숨기지 않음)', d);
ok(D({ weekly: { commissioning: { '2026-9-1': 999 } }, totalPt: 100, apply: { self: true } }).selfPct === 100, '총점 넘는 포인트 = 100%로 자름');
ok(D({ weekly: { commissioning: { '2026-9-1': 30 } }, totalPt: 0, apply: { self: true } }).selfPct === null, '총물량 없음 = 자체 % 없음(빈칸)');
d = D({ weekly: { intCommissioning: { '2026-8-2': 3, '2026-9-1': 2 }, commissioning: { '2026-9-1': 4 } }, totalPt: 10, apply: { self: true, int: true } });
ok(d.intPct === 50 && d.selfPct === 40 && d.all === 45, '통합 시운전 % = 자체와 같은 식 (통합 5점 ÷ 총물량 10 = 50%) · 켠 행은 공정률 평균에 (자체 40 + 통합 50) ÷ 2 = 45', d);
ok(D({ weekly: {}, totalPt: 10, apply: { self: true } }).intPct === null, '  └ 통합 포인트 없음 = 빈칸');
ok(D({ apply: {} }).all === null, '적용 항목이 하나도 없으면 공정률 = 빈칸');
d = D({ weekly: { plc: { '2025-12-4': 40 }, commissioning: { '2025-12-1': 5, '2026-1-2': 5 } }, cur: { plc: 55 }, curFrom: '2026-01', totalPt: 20, apply: { plc: true, self: true }, refYm: '2026-01' });
ok(d.prevPts === 5 && d.curPts === 5 && d.acc === 10 && d.cur2 === r1(((55 + 50) / 2) - ((40 + 25) / 2)), '해 넘김: 1월의 전월 = 작년 12월', d);
function r1(n) { return Math.round(n * 10) / 10; }
d = D({ weekly: { commissioning: { '2026-9-1': 999 }, sub_0_commissioning: { '2026-9-1': 10 }, sub_1_commissioning: { '2026-9-2': 5 } }, totalPt: 30, apply: { self: true } });
ok(d.acc === 15, '하위(sub_i) 장부면 메인 직접 키 무시 — 그래프·팝업과 같은 규칙', d);
// 종료 주 이동
let mv = T.t1PlanDoneMove({ hmi: { '2026-9-4': 100 } }, '2026-4-5');
ok(mv && J(mv.weekly) === J({ hmi: { '2026-4-5': 100 } }) && mv.moved.length === 1, '003형: 9월 4주 HMI 100 → 4월 5주 (종료 4/30)', mv);
mv = T.t1PlanDoneMove({ hmi: { '2026-9-4': 100 }, plc: { '2026-9-4': 100 } }, '2026-3-3');
ok(mv && mv.weekly.hmi['2026-3-3'] === 100 && mv.weekly.plc['2026-3-3'] === 100 && !mv.weekly.hmi['2026-9-4'], '006형: PLC·HMI 둘 다 → 3월 3주 (종료 3/18)');
ok(T.t1PlanDoneMove({ hmi: { '2026-3-5': 100 }, commissioning: { '2026-3-5': 3210 } }, '2026-3-3') === null, '001형: 종료와 같은 달(3월 5주)은 그대로 — 월별 계산에 차이 없음');
mv = T.t1PlanDoneMove({ hmi: { '2026-4-1': 60, '2026-6-2': 90, '2026-9-4': 100 }, commissioning: { '2026-4-2': 10, '2026-8-1': 4, '2026-9-3': 6 } }, '2026-4-5');
ok(mv && J(mv.weekly.hmi) === J({ '2026-4-1': 60, '2026-4-5': 100 }) && mv.weekly.commissioning['2026-4-5'] === 10 && mv.weekly.commissioning['2026-4-2'] === 10,
   '% 항목 = 뒤 달의 마지막 값 · 포인트 = 뒤 달 포인트를 종료 주에 더함 · 종료 전 기록은 그대로', mv && mv.weekly);
ok(T.t1PlanDoneMove({ sub_0_commissioning: { '2026-9-1': 5 } }, '2026-4-5') === null, '하위(sub_i) 기록은 안 옮김');
ok(T.t1PlanDoneMove({}, '2026-4-5') === null && T.t1PlanDoneMove({ hmi: { '2026-9-4': 1 } }, '') === null, '옮길 것 없음·종료 주 모름 = null');

// ═══ 2. ProjectListScreen 원문 — 실제 장부 숫자로 메인표 자동 칸 ═══════════════════════
console.log('\n■ 2. List 원문 조각(t1EmptyOffOf·fmDeriveCum·naToProgressItems) — 9/29 06:00 백업 숫자로');
const pieces = {
    emptyOff: grabTo(src, '    const t1EmptyOffOf = (row) => {', '\n    };'),
    derive: grabTo(src, '    const fmDeriveCum = (row, weeklyArg, refYmArg, opts = {}) => {', '\n    };'),
    naItemsOf: grabTo(src, '    const naItemsOf = (row) => {', '\n    };'),
    naTo: grabTo(src, '    const naToProgressItems = (row) => {', '\n    };'),
    cardOff: grabTo(src, '    const cardDefaultOffOf = (row) => {', '\n    };'),
    isDone: (src.match(/    const t1IsDone = [^\n]+/) || [])[0],
    endYmd: (src.match(/    const t1EndYmd = [^\n]+/) || [])[0],
    fmNum: (src.match(/    const fmNum = [^\n]+/) || [])[0],
    progKey: (src.match(/    const PROG_COL_TO_KEY = [^\n]+/) || [])[0] + '\n' + (src.match(/    const progItemKeyOf = [^\n]+/) || [])[0],
};
Object.entries(pieces).forEach(([k, v]) => ok(!!v && !String(v).startsWith('undefined'), '원문 조각 찾음: ' + k));
const H26 = ['순번', '수행번호', '지역명', '공장명', '공사명', '작업', 'PLC', 'ETOS T/S', 'HMI', '자체 시운전', '통합 시운전', '총물량', '누적', '전월', '금월', '전체', '전월 (2)', '금월 (2)', '시작', '종료', '완료 처리'];
// 9/29 06:00 자동 백업 — 2026 완료·취소 행의 숫자만 (이름·거래처 없음)
const FIX = {
    '001': { row: { 작업: '완료', HMI: '100', 총물량: '3210', 시작: "26'03/03", 종료: "26'03/20", 전체: '25', '금월 (2)': '25' }, weekly: { hmi: { '2026-3-5': 100 }, plc: {}, commissioning: { '2026-3-5': 3210 } } },
    '003': { row: { 작업: '완료', HMI: '100', 총물량: '44', 시작: "26'04/23", 종료: "26'04/30", 전체: '25', '금월 (2)': '25' }, weekly: { hmi: { '2026-9-4': 100 } } },
    '004': { row: { 작업: '완료', HMI: '100', 총물량: '844', 시작: "26'04/29", 종료: "26'05/21", 전체: '25', '금월 (2)': '25' }, weekly: { hmi: { '2026-9-4': 100 } } },
    '006': { row: { 작업: '완료', PLC: '100', HMI: '100', 총물량: '16', 시작: "26'03/03", 종료: "26'03/18", 전체: '50', '금월 (2)': '50' }, weekly: { hmi: { '2026-9-4': 100 }, plc: { '2026-9-4': 100 } } },
    '011': { row: { 작업: '완료', HMI: '100', 총물량: '6', 시작: "26'06/22", 종료: "26'07/16", 전체: '25', '금월 (2)': '25' }, weekly: { hmi: { '2026-9-4': 100 } } },
    '008': { row: { 작업: '취소', HMI: '30', 총물량: '2882', 시작: "26'05/12", 전체: '7.5', '금월 (2)': '7.5' }, weekly: { hmi: { '2026-9-4': 30 } } },
    '010': { row: { 작업: '취소', HMI: '10', 총물량: '769', 시작: "26'06/15", 전체: '2.5', '금월 (2)': '2.5' }, weekly: { hmi: { '2026-9-4': 10 } } },
    '013': { row: { 작업: '추진중' }, weekly: {} },
};
const fmNorm = (v) => String(v ?? '').replace(/\s+/g, '');
let LEDGER = {};
const env = {
    fmCum: true, fmActive: () => true, isSubListRow: () => false, fmNorm, fmCol: (nm) => H26.find(h => fmNorm(h) === fmNorm(nm)) || nm,
    t1WeeklyOf: (row) => LEDGER[row._id] || {}, t1RefYm: () => '2026-09', t1CumDerive: T.t1CumDerive, t1DateToYmd: T.t1DateToYmd,
    aliasCol: (nm) => H26.find(h => fmNorm(h) === fmNorm(nm)) || null, datePairCols: ['시작', '종료'], teamProfile: t1,
    defaultNaItems: ['도면입수', 'I/O Map', '화면작성', '기준정보'],
};
const code = `${pieces.fmNum}\n${pieces.isDone}\n${pieces.endYmd}\n${pieces.progKey}\n${pieces.cardOff}\n${pieces.naItemsOf}\n${pieces.emptyOff}\n${pieces.naTo}\n${pieces.derive}\nreturn { fmDeriveCum, naToProgressItems, t1EmptyOffOf };`;
const L = new Function(...Object.keys(env), code)(...Object.values(env));
const rowOf = (no) => ({ _id: no, _year: '2026', ...FIX[no].row });
const run = (ledger) => { LEDGER = ledger; return Object.fromEntries(Object.keys(FIX).map(no => [no, L.fmDeriveCum(rowOf(no))])); };
const before = run(Object.fromEntries(Object.keys(FIX).map(no => [no, FIX[no].weekly])));
const want = {
    '001': { 누적: '3210', '자체 시운전': '100', 전체: '100', '금월 (2)': '', '전월 (2)': '', 금월: '', 전월: '' },
    // 자체 시운전 = 항상 적용 (팀장님 "무조건 기본 활성화") → 포인트를 안 넣은 프로젝트는 자체 0%가 평균에 들어감
    '003': { 누적: '', '자체 시운전': '', 전체: '50', '금월 (2)': '', '전월 (2)': '' },   // (HMI 100 + 자체 0) ÷ 2
    '004': { 전체: '50', '금월 (2)': '' }, '011': { 전체: '50', '금월 (2)': '', '전월 (2)': '' },
    '006': { 전체: '66.7', '금월 (2)': '' },   // (PLC 100 + HMI 100 + 자체 0) ÷ 3
    // 취소도 같은 규칙 — 빈 PLC·ETOS(메인표 ×)는 빠짐 (팀장님 010 지적): 종전 (0+0+HMI+0)÷4 → (HMI + 자체 0)÷2
    '008': { 전체: '15', '금월 (2)': '15' }, '010': { 전체: '5', '금월 (2)': '5' },
    '013': { 전체: '', 누적: '', '자체 시운전': '' },
};
Object.entries(want).forEach(([no, w]) => { const got = before[no]; const bad = Object.keys(w).filter(k => got[k] !== w[k]);
    ok(!bad.length, `${no} (${FIX[no].row.작업}) 메인표 자동 칸: ${Object.entries(w).map(([k, v]) => `${k} ${v || '빈칸'}`).join(' · ')}`, bad.map(k => `${k}=${J(got[k])}`)); });
ok(before['001']['전체'] === '100' && FIX['001'].row['전체'] === '25', '  └ 001: 지금 25% → 100% (팀장님 미리보기와 같음)');
// 적용 = 메인표에 값이 있는 PLC·ETOS·HMI + 자체 시운전(항상) — 완료·취소·진행 중 모두 같음
LEDGER = Object.fromEntries(Object.keys(FIX).map(no => [no, FIX[no].weekly]));
const pi = (no) => L.naToProgressItems(rowOf(no)) || {};
ok(pi('001').plc === false && pi('001').etos === false && pi('001').hmi !== false && pi('001').internalTest !== false, '진행실적 팝업 001: PLC·ETOS 빠짐 / HMI·자체시운전 남음 (자체 = 3월 3,210점)', pi('001'));
ok(pi('003').plc === false && pi('003').etos === false && pi('003').internalTest !== false && pi('003').hmi !== false, '003: HMI·자체시운전 (빈 PLC·ETOS만 빠짐 · 자체시운전 = 포인트 없어도 팝업에 줄)', pi('003'));
ok(pi('006').plc !== false && pi('006').etos === false && pi('006').hmi !== false && pi('006').internalTest !== false, '006: PLC·HMI·자체시운전 (빈 ETOS만 빠짐)', pi('006'));
ok(['001', '003', '004', '006', '011'].every(no => pi(no).internalTest !== false), '완료 5건 전부 자체시운전 적용 — 팀장님 "나머지 완료건 포함 · 무조건 기본 활성화"');
ok(['008', '010'].every(no => pi(no).plc === false && pi(no).etos === false && pi(no).hmi !== false && pi(no).internalTest !== false),
   '취소 008·010: 빈 PLC·ETOS 빠짐 = 메인표 ×와 같음 (팀장님 010 지적) · HMI·자체시운전만', [pi('008'), pi('010')]);
ok(pi('013').plc === false && pi('013').etos === false && pi('013').hmi === false && pi('013').internalTest !== false, '추진중 013(전부 빈칸): 팝업엔 자체시운전만 — PLC·ETOS·HMI는 메인표에 값을 넣거나 상세 보기에서 켜면 줄이 생김', pi('013'));
ok(pi('001').integratedTest === false && pi('001').drawing === false, '통합 시운전(2026 기본 미적용)·엑셀에 없는 4항목은 종전대로 빠짐');
const on003 = L.naToProgressItems({ ...rowOf('003'), _naOn: ['자체 시운전'] }) || {};
ok(on003.internalTest !== false, '003: 전에 켜 둔 표시(_naOn)가 남아 있어도 같음 — 적용', on003);
const off003 = L.naToProgressItems({ ...rowOf('003'), _naItems: ['자체 시운전'] }) || {};
ok(off003.internalTest === false, '003: 상세 보기에서 자체 시운전 스위치를 끄면(_naItems) 그때만 빠짐', off003);
ok(L.naToProgressItems({ ...rowOf('013'), _naOn: ['PLC'] }).plc !== false && L.naToProgressItems({ ...rowOf('013'), PLC: '0' }).plc !== false, '빈 PLC라도 상세 보기에서 켜면(_naOn)·메인표에 0을 넣으면(0도 값) 적용');
LEDGER['003'] = FIX['003'].weekly;
ok(L.fmDeriveCum({ ...rowOf('003'), _naItems: ['자체 시운전'] })['전체'] === '100', '  └ 끈 채면 공정률 100% (HMI만)');
const d003on = L.fmDeriveCum({ ...rowOf('003'), _naOn: ['자체 시운전'] });
ok(d003on['전체'] === '50' && L.fmDeriveCum(rowOf('003'))['전체'] === '50', '  └ 포인트가 0이면 공정률 50% (HMI 100 + 자체 0) — 스위치를 따로 안 켜도 같음', d003on);
LEDGER['003'] = { hmi: { '2026-4-5': 100 }, commissioning: { '2026-4-5': 44 } };
const d003pt = L.fmDeriveCum(rowOf('003'));
ok(d003pt['전체'] === '100' && d003pt['자체 시운전'] === '100' && d003pt['누적'] === '44' && d003pt['금월 (2)'] === '', '  └ 4월 5주에 44점 입력 → 누적 44 · 자체 100% · 공정률 100% · 금월 빈칸', d003pt);
// 종료 주 이동 후에도 같은 값 (메인표는 이동 전부터 이미 맞음 — 이동은 그래프·팝업 위치용)
const afterLedger = Object.fromEntries(Object.keys(FIX).map(no => {
    const e = T.t1DateToYmd(FIX[no].row.종료); const wk = T.t1WeekKeyOfYmd(e);
    const p = FIX[no].row.작업 === '완료' && wk ? T.t1PlanDoneMove(FIX[no].weekly, wk) : null;
    return [no, p ? p.weekly : FIX[no].weekly];
}));
const after = run(afterLedger);
ok(Object.keys(FIX).every(no => J(after[no]) === J(before[no])), '종료 주로 옮긴 뒤에도 메인표 자동 칸 값 동일 (옮기기 = 그래프·팝업 위치만)');
ok(J(Object.keys(afterLedger).filter(no => J(afterLedger[no]) !== J(FIX[no].weekly))) === J(['003', '004', '006', '011']), "'기존 4건' = 003·004·006·011만 옮겨짐 (001은 같은 3월이라 그대로)");

// ═══ 3. App.js 원문 — 실적 그래프 공정률 ═══════════════════════════════════════
console.log('\n■ 3. 실적 그래프 — App.js getRecordMonthlyProgress 원문');
const grp = grabTo(appSrc, '  const getRecordMonthlyProgress = (p, totalPt) => {', '\n  };');
ok(!!grp && grp.includes("_fmCfgA.방식 !== '누계'") && grp.includes("_fmCfgA.방식 === '누계'"), "원문 찾음 + 누계 방식이면 자체 성분 = 지금까지 누적 · 공정률 소수 1자리(메인표·팝업과 같은 자릿수)");
const gAKeys = ['plc', 'etos', 'hmi', 'internalTest', 'integratedTest'];
const graph = (weekly, progressItems, total) => new Function('progressRecordsMap', 'getAppliedKeys', 'getTeamProfile', 'currentTeam', grp + '\nreturn getRecordMonthlyProgress;')(
    { P: { weekly } }, (p) => gAKeys.filter(k => (p.progressItems || {})[k] !== false), getTeamProfile, '기술1팀')({ pid: 'P', _year: '2026', progressItems }, total);
LEDGER = afterLedger;
let g = graph(afterLedger['001'], pi('001'), 3210);
ok(g['2026-03'] === 100, '001 그래프: 3월 공정률 100% (종전 50%)', g);
g = graph(afterLedger['003'], pi('003'), 44);
ok(g['2026-04'] === 50 && !g['2026-09'], '003 그래프: 4월에 50% (HMI 100 + 자체 0 · 9월에 오르던 것 → 끝난 달로)', g);
g = graph({ hmi: { '2026-4-5': 100 }, commissioning: { '2026-4-5': 44 } }, pi('003'), 44);
ok(g['2026-04'] === 100, '  └ 4월 5주에 44점 넣으면 4월 100%', g);
g = graph(afterLedger['006'], pi('006'), 16);
ok(g['2026-03'] === 66.7, '006 그래프: 3월 66.7% (PLC 100 + HMI 100 + 자체 0) — 메인표와 같은 소수 1자리 (종전 67로 반올림)', g);
g = graph(afterLedger['008'], pi('008'), 2882);
ok(g['2026-09'] === 15, '008(취소) 그래프: 9월 15% (HMI 30 + 자체 0) — 메인표·팝업과 같음', g);

// ═══ 4. 연결 확인 (원문) ═══════════════════════════════════════════════════════
console.log('\n■ 4. 연결 — 원문 문자열');
ok(src.includes('sumAsPct={fmActive(progressRow) && !fmCum}'), '진행실적 팝업: 누계면 월합(sumAsPct) 끔 → 합계 = 지금까지 합(001 자체시운전 0 → 3,210) · 진척률 = 지금까지');
ok(src.includes('applyProgressToMainRow(rowId, data?.mainTable, data?.weekly)') && pmSrc.includes('weekly: wd };'), '[적용하기]: 팝업이 방금 저장한 장부(완료면 종료 주 이동 뒤)를 메인표 계산에 넘김 (구독본 한 박자 늦음 대비)');
ok(pmSrc.includes('mainTable[HEADER_MAP[key]] = itemFinalPct(key);') && !pmSrc.includes('Math.round(itemFinalPct(key))'), '[적용하기]: 메인표 PLC·ETOS·HMI = 팝업 값 그대로 (반올림 없음 — 66.7 → 67 어긋남 방지)');
const apSrc = grabTo(src, '    const applyProgressToMainRow = async', '\n    };');
ok(!!apSrc && apSrc.includes('stampSave({ ...patch, _changeHistory: pushChangeHist(srcRow, entry) }), { merge: true })') && !apSrc.includes('...rest, ...patch'), '[적용하기] 저장 = 바뀐 칸만 merge (행 사본 통째 쓰기 폐지 — 9/21 교훈)');
ok(src.includes('baseDate={progressRow && fmCum && fmActive(progressRow) ? t1RefYm() : baseDate}'), '진행실적 팝업 기준월 = 오늘 달 (메인표 자동 칸과 같은 달 — 창을 연 채 달이 바뀌어도)');
const syn = grabTo(src, '    const syncProgressCellToLedger = async', '\n    };');
ok(!!syn && syn.includes('t1IsDone(row)') && syn.includes('t1WeekKeyOfYmd(eY)') && syn.includes('doneTo &&'), '메인표 → 장부: 완료 프로젝트는 종료 주에 기록 + 종료 달 뒤 그 항목 기록 정리');
const fr = grabTo(src, '    const fmRecalc = (row, baseRow, weeklyArg) => {', '\n    };');
ok(!!fr && fr.includes('if (fmCum) return fmDeriveCum(row, weeklyArg);') && fr.includes("const cAcc = fmCol('누적')"), 'fmRecalc: 누계면 새 계산 · 8/19 식은 그대로 보존(카드 방식 줄 지우면 복귀)');
const mc = grabTo(src, '    const handleMonthlyClose = async () => {', '\n    };');
const bms = grabTo(src, '    const buildMonthSnapshot = async (team, ym) => {', '\n    };');   // 2026-09-29: 수동·자동 월간 마감 공용 함수로 옮김
ok(!!mc && mc.includes('if (fmCfg && fmCum) {') && mc.includes('await buildMonthSnapshot(currentTeam, ym)') && !!bms && bms.includes("fmDeriveCum(r, (L && L.weekly) || {}, ym, { withItems: true, noCur: ym !== t1RefYm() })"),
   '[월간 마감]: 누계면 칸 비움 없이 다시 계산 · 스냅샷 = 마감 달 기준 장부 값 (수동·자동 공용 buildMonthSnapshot — 서버 최신 장부)');
ok(src.includes("|| (fmCum && ('_naItems' in patch || '_naOn' in patch))") && src.includes('fmCumTrig(editingCell.key)'), '셀 키인: 작업·종료·x(사용 안 함)도 자동 칸 다시 계산');
ok(src.includes('handleT1Recalc()') && src.includes('진행 수치 다시 계산') && src.includes('진행실적 장부엔 값이 있는데 메인표 칸이 빈칸'), "설정 '정리 도구' [진행 수치 다시 계산] (관리자) — 기존 4건 이동 + 자동 칸 + '장부엔 값·메인표 빈칸' 알림");
ok(src.includes("progSwitch={detailRow && fmCum") && src.includes("progSwitch={addingRow && fmCum"), '상세 보기·추가 팝업에 진행 항목 스위치 규칙 전달');
ok(src.split("alwaysCols: [fmCol('자체 시운전'), fmCol('통합 시운전')] } : null}").length - 1 === 2 && !src.includes("mode: t1IsDone("), '  └ 둘 다 같은 규칙: 자체·통합 시운전 = 스위치로 켜고 끔(alwaysCols) · 완료/진행 중 구분 없음');
const eo = grabTo(src, '    const t1EmptyOffOf = (row) => {', '\n    };');
ok(!!eo && !/off\.internalTest = false/.test(eo) && !eo.includes('t1IsDone') && !src.includes('t1DoneOffOf'), 't1EmptyOffOf: 완료 여부와 무관(전 프로젝트 같은 규칙) · 자체 시운전은 빼지 않음 · 옛 규칙(완료만) 없음');
const mobTeams = new Function('getTeamProfile', (mobSrc.match(/^const ALL_TEAMS = [^\n]+/m) || [''])[0] + '\n' + (mobSrc.match(/^const TEAMS = [^\n]+/m) || [''])[0] + '\nreturn TEAMS;')(getTeamProfile);
ok(J(mobTeams) === J(['기술2팀', '기술3팀']), "모바일 입력 = 팀 카드 '모바일입력' 켠 팀만 (기술2·3팀) — 기술1팀·Software팀(카드 false) 제외 · 기술1팀 누계 규칙 없는 화면이라", mobTeams);

// ═══ 5. 상세 보기 원문 렌더 — 스위치 라벨 ═══════════════════════════════════════
console.log('\n■ 5. 상세 보기(DetailModal 원문) — 스위치 = 진행실적 팝업에 보이는지');
const DM = loadModule(path.join(ROOT, 'src/components/DetailModal.jsx')).default;
const HDM = ['순번', '작업', 'PLC', 'ETOS T/S', 'HMI', '자체 시운전', '통합 시운전', '총물량', '누적', '전체', '시작', '종료'];
const GDM = [{ label: '', cols: ['순번'] }, { label: '진행 현황', cols: ['작업'] }, { label: '진행[%]', cols: ['PLC', 'ETOS T/S', 'HMI', '자체 시운전', '통합 시운전'] }, { label: "시운전 수량[Q'ty]", cols: ['총물량', '누적'] }, { label: '공정률[%]', cols: ['전체'] }, { label: '날짜 정보', cols: ['시작', '종료'] }];
const labelsOf = (row, rule) => {
    const html = renderToStaticMarkup(React.createElement(DM, { detailRow: row, setDetailRow: () => {}, onSave: () => {}, activeHeaders: HDM, activeColGroups: GDM, mainVisibleHeaders: HDM,
        cardDefaultOff: ['통합 시운전'], currentTeam: '기술1팀', progSwitch: rule ? { cols: ['PLC', 'ETOS T/S', 'HMI', '자체 시운전', '통합 시운전'], alwaysCols: ['자체 시운전', '통합 시운전'] } : null }));   // List가 넘기는 모양 그대로 (통합 추가 2026-09-29)
    const out = {};
    ['PLC', 'ETOS T/S', 'HMI', '자체 시운전', '통합 시운전'].forEach(h => {
        const a = html.indexOf(`data-dm-field="${h}"`); if (a < 0) return;
        const b = html.indexOf('data-dm-field="', a + 10);
        const seg = html.slice(a, b < 0 ? undefined : b);
        const m = seg.match(/>(적용|빈칸|미적용)<\/span>/); out[h] = m ? m[1] : '?';
    });
    return out;
};
const done001 = labelsOf({ _id: '001', 작업: '완료', HMI: '100', '자체 시운전': '100', 총물량: '3210', 누적: '3210', 전체: '100' }, true);
ok(J(done001) === J({ PLC: '빈칸', 'ETOS T/S': '빈칸', HMI: '적용', '자체 시운전': '적용', '통합 시운전': '미적용' }), '001(완료): PLC·ETOS = 빈칸(팝업에서 빠짐) · HMI·자체 = 적용 · 통합 = 미적용', done001);
const done003 = labelsOf({ _id: '003', 작업: '완료', HMI: '100', 총물량: '44', 전체: '50' }, true);
ok(done003['자체 시운전'] === '적용' && done003.HMI === '적용' && done003.PLC === '빈칸' && done003['ETOS T/S'] === '빈칸', '003(완료): 자체 시운전 = 포인트 없어도 적용 (팀장님 "무조건 기본 활성화") · 빈 PLC·ETOS = 빈칸', done003);
ok(labelsOf({ _id: '003', 작업: '완료', HMI: '100', 총물량: '44', _naOn: ['자체 시운전'] }, true)['자체 시운전'] === '적용', '  └ 전에 켜 둔 표시(_naOn)가 있어도 적용 (그대로)');
ok(labelsOf({ _id: '003', 작업: '완료', HMI: '100', 총물량: '44', _naItems: ['자체 시운전'] }, true)['자체 시운전'] === '미적용', '  └ 끄면(_naItems) 미적용 → 팝업·공정률에서 빠짐');
const can010 = labelsOf({ _id: '010', 작업: '취소', HMI: '10', 총물량: '769' }, true);
ok(J(can010) === J({ PLC: '빈칸', 'ETOS T/S': '빈칸', HMI: '적용', '자체 시운전': '적용', '통합 시운전': '미적용' }), '010(취소): PLC·ETOS = 빈칸 — 메인표 ×·팝업에 없음과 같음 (팀장님 지적 건)', can010);
const act = labelsOf({ _id: '013', 작업: '추진중' }, true);
ok(act.PLC === '빈칸' && act['ETOS T/S'] === '빈칸' && act.HMI === '빈칸' && act['자체 시운전'] === '적용' && act['통합 시운전'] === '미적용', '진행 중(013, 전부 빈칸): PLC·ETOS·HMI = 빈칸 · 자체 시운전 = 적용 — 오전 규칙(진행 중은 빈칸도 적용) 폐지', act);
ok(labelsOf({ _id: '013', 작업: '추진중', _naOn: ['PLC'] }, true).PLC === '적용' && labelsOf({ _id: '013', 작업: '추진중', PLC: '0' }, true).PLC === '적용', '  └ 빈 PLC도 켜 두면(_naOn)·0을 넣으면 적용 → 팝업에 줄');
ok(labelsOf({ _id: '013', 작업: '추진중', PLC: '40', _naItems: ['PLC'] }, true).PLC === '미적용', '  └ 값이 있어도 끄면(_naItems) 미적용 (메인표 ×, 값은 보관)');
ok(labelsOf({ _id: '013', 작업: '추진중', _naOn: ['통합 시운전'] }, true)['통합 시운전'] === '적용' && labelsOf({ _id: '013', 작업: '추진중' }, true)['통합 시운전'] === '미적용',
   '통합 시운전: 기본 미적용 · 스위치로 켜면(_naOn) 포인트가 아직 없어도 적용 — 자체 시운전과 같은 스위치 (종전: 켜도 빈칸이면 꺼진 것처럼 보이고 다시 못 끔)');
const t2 = labelsOf({ _id: 'x', 작업: '완료', HMI: '100' }, false);
ok(t2.PLC === '빈칸' && t2.HMI === '적용', '규칙 없는 팀(기술2·3팀 등) = 종전 표시 그대로 (빈칸 = 빈칸)', t2);

// ═══ 6. 전수 대조 — 네 화면이 같은 규칙인지 ═══════════════════════════════════════
console.log('\n■ 6. 전수 대조 — 2026 17건 + 경우별 5건: 메인표 값 칸 = 팝업 줄 = 상세 보기 적용 · 메인표 공정률 = 팝업 진척률 = 그래프');
// 진행실적 팝업 진척률 = ProgressModal 원문(overallPct)을 떼어 그대로 실행 (화면 없이 계산만 · useMemo = 바로 계산 · 날짜 고정)
const pmParts = {
    head: (() => { const a = pmSrc.indexOf('const SIMPLE_ITEMS = ['), b = pmSrc.indexOf('\nconst LABEL_COL_W'); return a >= 0 && b > a ? pmSrc.slice(a, b) : null; })(),
    items: grabTo(pmSrc, '    const isItemOn = ', "    const intOn  = isItemOn('intCommissioning');"),
    now: grabTo(pmSrc, '    const now0 = new Date();', '    const cy0 = now0.getFullYear(), cm0 = now0.getMonth() + 1;'),
    base: grabTo(pmSrc, '    const { y: allPy, m: allPm } = addMonths(cy0, cm0, -6);', '    const { y: allNy, m: allNm } = addMonths(cy0, cm0, 6);'),
    range: grabTo(pmSrc, '    const ALL_WEEKS = (() => {', '\n    })();'),
    calc: grabTo(pmSrc, '    const [refY, refM] = ', '    }, [weeklyData, totalPt, subRows, refWKey, progressItems, sumAsPct]); // eslint-disable-line'),
};
Object.entries(pmParts).forEach(([k, v]) => ok(!!v, '팝업 원문 조각 찾음: ' + k));
// 수리 전 계산 범위(오늘 ±6개월 고정) — 같은 원문에서 범위만 옛것으로 바꿔 시한폭탄 재현
const RANGE_OLD = '    const ALL_MONTHS = genMonths(allPy, allPm, allNy, allNm);\n    const ALL_WEEKS  = ALL_MONTHS.flatMap(({ year, month }) =>\n        weeksInMonth(year, month).map(w => ({ year, month, week: w, key: `${year}-${month}-${w}` }))\n    );';
const fixedDate = (iso) => { const t0 = new Date(iso).getTime(); return class extends Date { constructor(...a) { if (a.length) super(...a); else super(t0); } static now() { return t0; } }; };
const popupPct = ({ weekly, progressItems, totalPt, baseDate = '2026-09', today = '2026-09-29T12:00:00+09:00', oldRange = false }) => {
    const body = `${pmParts.head}\nreturn (progressItems, weeklyData, baseDate, totalPt, subRows, sumAsPct) => {\n${pmParts.items}\n${pmParts.now}\n${pmParts.base}\n${oldRange ? RANGE_OLD : pmParts.range}\n${pmParts.calc}\nreturn overallPct;\n};`;
    return new Function('useMemo', 'Date', body)((fn) => fn(), fixedDate(today))(progressItems || {}, weekly || {}, baseDate, Number(totalPt) || 0, [], false);
};
// 지금 상태 = 9/29 06:00 백업 숫자 + 오늘 한 일([진행 수치 다시 계산] 종료 주 이동 · 003 자체 켬 · 003·004·006·011 종료 주 포인트 — 화면 23 누적 44·844·16·6)
const NOW17 = {
    '001': [{ 작업: '완료', HMI: '100', 총물량: '3210', 시작: "26'03/03", 종료: "26'03/20" }, { hmi: { '2026-3-5': 100 }, commissioning: { '2026-3-5': 3210 } }],
    '002': [{ 작업: '취소' }, {}],
    '003': [{ 작업: '완료', HMI: '100', 총물량: '44', 시작: "26'04/23", 종료: "26'04/30", _naOn: ['자체 시운전'] }, { hmi: { '2026-4-5': 100 }, commissioning: { '2026-4-5': 44 } }],
    '004': [{ 작업: '완료', HMI: '100', 총물량: '844', 시작: "26'04/29", 종료: "26'05/21" }, { hmi: { '2026-5-3': 100 }, commissioning: { '2026-5-3': 844 } }],
    '005': [{ 작업: '취소' }, {}],
    '006': [{ 작업: '완료', PLC: '100', HMI: '100', 총물량: '16', 시작: "26'03/03", 종료: "26'03/18" }, { plc: { '2026-3-3': 100 }, hmi: { '2026-3-3': 100 }, commissioning: { '2026-3-3': 16 } }],
    '007': [{ 작업: '취소' }, {}],
    '008': [{ 작업: '취소', HMI: '30', 총물량: '2882', 시작: "26'05/12" }, { hmi: { '2026-9-4': 30 } }],
    '009': [{ 작업: '취소' }, {}],
    '010': [{ 작업: '취소', HMI: '10', 총물량: '769', 시작: "26'06/15" }, { hmi: { '2026-9-4': 10 } }],
    '011': [{ 작업: '완료', HMI: '100', 총물량: '6', 시작: "26'06/22", 종료: "26'07/16" }, { hmi: { '2026-7-3': 100 }, commissioning: { '2026-7-3': 6 } }],
    '012': [{ 작업: '취소' }, {}],
    '013': [{ 작업: '추진중' }, {}],
    '014': [{ 작업: '대기' }, {}], '015': [{ 작업: '대기' }, {}], '016': [{ 작업: '대기' }, {}], '017': [{ 작업: '대기' }, {}],
};
const CASES = {   // 경우별 (가상 숫자) — 앞으로 생길 모양
    'A 진행·PLC만': [{ 작업: '진행', PLC: '50', 총물량: '40' }, { plc: { '2026-8-2': 30, '2026-9-4': 50 }, commissioning: { '2026-8-2': 4, '2026-9-4': 6 } }],
    'B 진행·빈 ETOS 켬': [{ 작업: '진행', PLC: '60', _naOn: ['ETOS T/S'] }, { plc: { '2026-9-4': 60 } }],
    'C 자체 끔': [{ 작업: '진행', HMI: '80', 총물량: '10', _naItems: ['자체 시운전'] }, { hmi: { '2026-9-2': 80 } }],
    'D 소수 66.7': [{ 작업: '완료', HMI: '66.7', 총물량: '12', 시작: "26'06/01", 종료: "26'06/30" }, { hmi: { '2026-6-5': 66.7 } }],
    'E 2월 완료': [{ 작업: '완료', HMI: '100', 총물량: '5', 시작: "26'02/02", 종료: "26'02/20" }, { hmi: { '2026-2-3': 100 }, commissioning: { '2026-2-3': 5 } }],
    'F 통합 켬': [{ 작업: '진행', HMI: '50', 총물량: '10', _naOn: ['통합 시운전'] }, { hmi: { '2026-9-2': 50 }, intCommissioning: { '2026-8-2': 2, '2026-9-2': 3 }, commissioning: { '2026-9-2': 1 } }],
};
const POP_KEYS = [['plc', 'PLC'], ['etos', 'ETOS T/S'], ['hmi', 'HMI'], ['internalTest', '자체 시운전'], ['integratedTest', '통합 시운전']];
const numOf = (v) => (v === '' || v === null || v === undefined) ? 0 : Number(v);
const lastOf = (gm) => { const ks = Object.keys(gm || {}).sort(); return ks.length ? gm[ks[ks.length - 1]] : 0; };
const sortJ = (a) => J([...a].sort());
let swept = 0;
Object.entries({ ...NOW17, ...CASES }).forEach(([name, [spec, weekly]]) => {
    const row = { _id: name, _year: '2026', ...spec };
    LEDGER = { [name]: weekly };
    const piR = L.naToProgressItems(row) || {};
    const shown = POP_KEYS.filter(([k]) => piR[k] !== false).map(([, c]) => c);                                         // 진행실적 팝업에 나오는 줄
    const want2 = ['PLC', 'ETOS T/S', 'HMI'].filter(c => String(row[c] ?? '').trim() !== '' || (row._naOn || []).includes(c))
        .concat(['자체 시운전']).concat((row._naOn || []).includes('통합 시운전') ? ['통합 시운전'] : []).filter(c => !(row._naItems || []).includes(c));   // 규칙: 메인표 값 칸(+켠 항목) + 자체 시운전 (+켠 통합)
    const lab = labelsOf(row, true);
    const labOn = Object.keys(lab).filter(c => lab[c] === '적용');                                                     // 상세 보기 '적용'
    const main = numOf(L.fmDeriveCum(row)['전체']);                                                                   // 메인표 공정률 전체
    const pop = popupPct({ weekly, progressItems: piR, totalPt: row['총물량'] });                                      // 팝업 진척률
    const gr = lastOf(graph(weekly, piR, Number(row['총물량']) || 0));                                                 // 그래프 마지막 달
    const bad = [];
    if (sortJ(shown) !== sortJ(want2)) bad.push(`팝업 줄 ${J(shown)} ≠ 규칙 ${J(want2)}`);
    if (sortJ(labOn) !== sortJ(shown)) bad.push(`상세 보기 적용 ${J(labOn)} ≠ 팝업 줄`);
    if (!(main === pop && pop === gr)) bad.push(`공정률 메인표 ${main} · 팝업 ${pop} · 그래프 ${gr}`);
    swept++;
    ok(!bad.length, `${name.padEnd(9)} ${String(spec.작업 || '').padEnd(3)} 팝업 줄 [${shown.join('·')}] = 상세 보기 적용 · 공정률 ${main}% = 팝업 ${pop}% = 그래프 ${gr}%`, bad.join(' / '));
});
ok(swept === 23, `전수 대조 ${swept}건 (2026 17건 + 경우 6건)`);
LEDGER = { 'F 통합 켬': CASES['F 통합 켬'][1] };
const dF = L.fmDeriveCum({ _id: 'F 통합 켬', _year: '2026', ...CASES['F 통합 켬'][0] });
ok(dF['통합 시운전'] === '50' && dF['자체 시운전'] === '10' && dF['전체'] === '36.7', "  └ F(통합 켬): 메인표 통합 시운전 칸 = 50% 자동 (5점 ÷ 10) · 공정률 = (HMI 50 + 자체 10 + 통합 50) ÷ 3 = 36.7 — 팝업·그래프와 같음", dF);
// 팝업 계산 범위 ±6개월 시한폭탄 — 수리 전 범위로 재현 → 수리 후 확인
const eSpec = CASES['E 2월 완료'], w001 = NOW17['001'][1];
LEDGER = { E: eSpec[1], '001': w001 };
const piE = L.naToProgressItems({ _id: 'E', _year: '2026', ...eSpec[0] }) || {};
const pi001 = L.naToProgressItems({ _id: '001', _year: '2026', ...NOW17['001'][0] }) || {};
ok(popupPct({ weekly: eSpec[1], progressItems: piE, totalPt: 5, oldRange: true }) === 50, '  수리 전 재현: 2월에 끝난 프로젝트 → 9월 팝업 진척률 50% (HMI 100이 계산 범위 밖 → 0) · 메인표는 100%');
ok(popupPct({ weekly: w001, progressItems: pi001, totalPt: 3210, baseDate: '2026-10', today: '2026-10-05T09:00:00+09:00', oldRange: true }) === 50, '  수리 전 재현: 001(3월 완료)은 10월부터 팝업 50%로 떨어질 뻔 (메인표·그래프 100%)');
ok(popupPct({ weekly: eSpec[1], progressItems: piE, totalPt: 5 }) === 100
    && popupPct({ weekly: w001, progressItems: pi001, totalPt: 3210, baseDate: '2026-10', today: '2026-10-05T09:00:00+09:00' }) === 100
    && popupPct({ weekly: w001, progressItems: pi001, totalPt: 3210, baseDate: '2027-09', today: '2027-09-05T09:00:00+09:00' }) === 100,
   '  수리 후: 2월 완료 = 100% · 001 = 10월에도·1년 뒤에도 100% (계산 범위 = 장부 기간 전체)');

// ═══ 7. 달이 바뀔 때 — 저장된 자동 칸 새 달 맞춤 (2026-09-29 전수 점검 ①) ═══════════════════
console.log('\n■ 7. 달이 바뀔 때 — 저장된 금월·전월이 지난달 기준으로 남던 시한폭탄 (List 원문 t1ReconcileFixes)');
const recSrc = grabTo(src, '    const t1ReconcileFixes = (rowsSrv, ledMap, ym) => {', '\n    };');
ok(!!recSrc, '원문 조각 찾음: t1ReconcileFixes');
let DRAFT = {};
const REC = new Function('fmActive', 'isSubListRow', 'draftRef', 't1LedgerKeyOf', 'fmDeriveCum', recSrc + '\nreturn t1ReconcileFixes;')(
    (r) => String(r?._year || '') === '2026', (r) => String(r['실행번호'] || '').trim().toLowerCase() === 's', { get current() { return DRAFT; } },
    (r) => r._pid || r._id, L.fmDeriveCum);
// 화면 26(오늘 오후) 그대로 — 008·010에 9월 포인트, 001은 3월 완료
const S26 = {
    '008': { row: { _pid: 'P8', 작업: '취소', HMI: '30', 총물량: '2882', '자체 시운전': '41.6', 누적: '1200', 전월: '', 금월: '1200', 전체: '35.8', '전월 (2)': '', '금월 (2)': '35.8' }, weekly: { hmi: { '2026-9-4': 30 }, commissioning: { '2026-9-5': 1200 } } },
    '010': { row: { _pid: 'P10', 작업: '취소', HMI: '10', 총물량: '769', '자체 시운전': '0.7', 누적: '5', 전월: '', 금월: '5', 전체: '5.3', '전월 (2)': '', '금월 (2)': '5.3' }, weekly: { hmi: { '2026-9-4': 10 }, commissioning: { '2026-9-5': 5 } } },
    '001': { row: { _pid: 'P1', 작업: '완료', HMI: '100', 총물량: '3210', 시작: "26'03/03", 종료: "26'03/20", '자체 시운전': '100', 누적: '3210', 전월: '', 금월: '', 전체: '100', '전월 (2)': '', '금월 (2)': '' }, weekly: { hmi: { '2026-3-5': 100 }, commissioning: { '2026-3-5': 3210 } } },
};
const recRows = Object.entries(S26).map(([no, x]) => ({ _id: no, _year: '2026', ...x.row }));
const recLed = Object.fromEntries(Object.values(S26).map(x => [x.row._pid, { weekly: x.weekly }]));
let fx = REC(recRows, recLed, '2026-09');
ok(fx.length === 0, '9월(오늘): 화면 26 값 = 계산 값 — 고칠 것 없음 (008 금월 1,200·공정률 35.8% / 010 금월 5·5.3%)', fx.map(f => [f.r._id, f.diff]));
fx = REC(recRows, recLed, '2026-10');
const fx8 = (fx.find(f => f.r._id === '008') || {}).diff || {}, fx10 = (fx.find(f => f.r._id === '010') || {}).diff || {};
ok(J(fx8) === J({ 금월: '', 전월: '1200', '전월 (2)': '35.8', '금월 (2)': '' }) || (fx8.금월 === '' && fx8.전월 === '1200' && fx8['금월 (2)'] === '' && fx8['전월 (2)'] === '35.8' && Object.keys(fx8).length === 4),
   '10월이 되면 008: 금월 1,200 → 빈칸 · 전월 빈칸 → 1,200 · 공정률 금월 35.8 → 빈칸 · 전월 → 35.8 (누적·자체·전체는 그대로)', fx8);
ok(fx10.금월 === '' && fx10.전월 === '5' && fx10['금월 (2)'] === '' && fx10['전월 (2)'] === '5.3' && Object.keys(fx10).length === 4, '10월 010: 금월 5 → 빈칸 · 전월 → 5 · 공정률 금월 → 빈칸 · 전월 → 5.3', fx10);
ok(!fx.some(f => f.r._id === '001'), '10월 001(3월 완료): 바뀔 것 없음 (끝난 프로젝트 = 금월·전월 계속 빈칸)');
ok(S26['008'].row.금월 === '1200', '  └ 수리 전 = 이 계산을 아무도 안 해서 10월 내내 금월 1,200·전월 빈칸 그대로 (팝업·그래프는 10월 기준) — 셀을 고치거나 [월간 마감]을 눌러야만 바뀌었음');
DRAFT = { '008': { patch: { HMI: '40' } } };
ok(!REC(recRows, recLed, '2026-10').some(f => f.r._id === '008'), '노란 칸(초안) 있는 행은 건너뜀 — [저장] 때 다시 계산');
DRAFT = {};
ok(REC([{ ...recRows[0], _year: '2025' }, { ...recRows[1], 실행번호: 's' }], recLed, '2026-10').length === 0, '지난 연도 행·하위 행은 대상 아님');
const y27 = REC([{ _id: 'Y', _year: '2026', _pid: 'PY', 작업: '진행', PLC: '60', 총물량: '10', 누적: '4', 금월: '4', 전월: '', 전체: '50', '금월 (2)': '50', '전월 (2)': '', '자체 시운전': '40' }], { PY: { weekly: { plc: { '2026-12-2': 60 }, commissioning: { '2026-12-2': 4 } } } }, '2027-01');
ok(y27.length === 1 && y27[0].diff.금월 === '' && y27[0].diff.전월 === '4' && y27[0].diff['전월 (2)'] === '50', '해 넘김: 2027년 1월 = 작년 12월 값이 전월로', y27[0] && y27[0].diff);
const rcFn = grabTo(src, '    const runT1Reconcile = async () => {', '\n    };');
ok(!!rcFn && rcFn.includes('getDocsFromServer(query(rowsColRef(team)') && rcFn.includes('getDocsFromServer(collection(db') && rcFn.includes('getDocFromServer(rowDocRef(team, f.r._id))'),
   '서버 최신 값만 사용 (캐시 금지) + 쓰기 직전 그 행 다시 읽기 (9/21 교훈)');
ok(!!rcFn && rcFn.includes('setDoc(rowDocRef(team, f.r._id), f.diff, { merge: true })') && rcFn.includes('t1TrigKeys().some(') && rcFn.includes("fmCfg.연도.map(String).includes(String(selectedYear || ''))"),
   '바뀐 칸만 merge · 그새 입력 칸이 바뀐 행은 건너뜀 · 수식 연도 화면에서만');
ok(src.includes('setTimeout(() => runT1ReconcileRef.current(), 1500)') && src.includes('setInterval(() => runT1ReconcileRef.current(), 5 * 60 * 1000)'), 'List 열 때 1번 + 5분마다 달 확인 (켜 둔 공용 PC도 달이 바뀌면 맞춤)');

// ═══ 8. 상세 보기·추가 팝업 — 자동 칸 잠금 (②) ═══════════════════════════════════════
console.log('\n■ 8. 상세 보기·추가 팝업 — 자동 칸 7개 = 보기 전용 (종전: 쳐도 저장 때 다시 계산돼 조용히 사라짐)');
const AUTO7 = t1.수식.자동.slice();   // 카드 목록 그대로 — 자체·통합 시운전·누적·전월·금월·전체·전월(2)·금월(2) (2026-09-29 통합 추가 → 8칸)
ok(AUTO7.length === 8 && AUTO7.includes('통합 시운전'), "팀 카드 자동 칸 8개 (통합 시운전 = 자체와 같게 추가)", AUTO7);
const HDM2 = [...HDM.filter(h => !['누적', '전체'].includes(h)), '누적', '전월', '금월', '전체', '전월 (2)', '금월 (2)'];
const GDM2 = [{ label: '', cols: ['순번'] }, { label: '진행[%]', cols: ['PLC', 'ETOS T/S', 'HMI', '자체 시운전', '통합 시운전'] }, { label: "시운전 수량[Q'ty]", cols: ['총물량', '누적', '전월', '금월'] }, { label: '공정률[%]', cols: ['전체', '전월 (2)', '금월 (2)'] }, { label: '기타', cols: ['작업', '시작', '종료'] }];
const segOf = (html, h) => { const a = html.indexOf(`data-dm-field="${h}"`); if (a < 0) return ''; const b = html.indexOf('data-dm-field="', a + 10); return html.slice(a, b < 0 ? undefined : b); };
const dmHtml = (row, mode) => renderToStaticMarkup(React.createElement(DM, { detailRow: row, setDetailRow: () => {}, onSave: () => {}, activeHeaders: HDM2, activeColGroups: GDM2, mainVisibleHeaders: HDM2,
    cardDefaultOff: ['통합 시운전'], currentTeam: '기술1팀', mode, progSwitch: { cols: ['PLC', 'ETOS T/S', 'HMI', '자체 시운전', '통합 시운전'], alwaysCols: ['자체 시운전', '통합 시운전'] },   // List가 넘기는 모양 그대로
    autoLockedCols: AUTO7, autoPctCols: ['전체', '전월 (2)', '금월 (2)'] }));
const h008 = dmHtml({ _id: '008', 작업: '취소', HMI: '30', 총물량: '2882', ...S26['008'].row }, 'edit');
ok(AUTO7.every(h => { const g = segOf(h008, h); return g.includes('🔒 잠금') && g.includes('자동 계산') && !/<input|<textarea/.test(g); }), '상세 보기: 자동 칸 전부 🔒 자동 계산 (입력칸 없음)', AUTO7.filter(h => { const g = segOf(h008, h); return !(g.includes('🔒') && !/<input|<textarea/.test(g)); }));
ok(segOf(h008, '전체').includes('35.8%') && segOf(h008, '누적').includes('1200') && segOf(h008, '자체 시운전').includes('41.6%'), '  └ 값은 그대로 보임: 전체 35.8% · 누적 1200 · 자체 41.6%');
ok(/<input|<textarea/.test(segOf(h008, 'HMI')) && /<input|<textarea/.test(segOf(h008, '총물량')), '  └ PLC·ETOS·HMI·총물량은 그대로 입력 가능');
ok(segOf(h008, '자체 시운전').includes('title="켜짐 — 누르면 끔') && />적용<\/span>/.test(segOf(h008, '자체 시운전')), '  └ 자체 시운전 스위치(켜기·끄기)는 그대로 — 잠금은 값 입력만', segOf(h008, '자체 시운전').slice(-400));
const hAdd = dmHtml({ _id: 'N', 작업: '' }, 'add');
ok(AUTO7.every(h => segOf(hAdd, h).includes('추가하면 자동 계산')), '추가 팝업: 자동 칸 = "추가하면 자동 계산"');
ok(segOf(h008, '통합 시운전').includes('🔒 잠금') && segOf(h008, '통합 시운전').includes('title="스위치 off') && dmHtml({ ...S26['008'].row, _id: '008', _naOn: ['통합 시운전'] }, 'edit').includes('title="적용 — 아직 빈칸'),
   '  └ 통합 시운전: 값은 잠금 · 스위치로 켜고 끔 (꺼짐 = "스위치 off" / 켜면 "적용 — 아직 빈칸(0%)")');
ok(src.split('autoLockedCols={').length - 1 === 2 && src.includes("autoLockedCols={detailRow && fmActive(detailRow) && !isSubListRow(detailRow) ? fmAutoColsOf() : []}"), 'List가 상세 보기·추가 팝업 둘 다에 잠글 칸 전달 (수식 연도 행만)');

// ═══ 9. 행 복사·새 행 — 진행 값 비움 + 새 장부 (③) ══════════════════════════════════════
console.log('\n■ 9. 행 복사(우클릭 [이 행 복사해서 추가]·Ctrl+V)·새 행 — 진행 값·자동 칸을 베끼지 않음');
const blankSrc = [(src.match(/    const fmAutoColsOf = [^\n]+/) || [])[0], (src.match(/    const T1_PROG_VAL_COLS = [^\n]+/) || [])[0], grabTo(src, '    const t1BlankProgress = (row) => {', '\n    };')];
ok(blankSrc.every(Boolean), '원문 조각 찾음: fmAutoColsOf·T1_PROG_VAL_COLS·t1BlankProgress');
const BL = new Function('fmCum', 'fmActive', 'isSubListRow', 'fmCol', 'fmCfg', blankSrc.join('\n') + '\nreturn t1BlankProgress;')(true, (r) => String(r?._year || '') === '2026', (r) => String(r['실행번호'] || '').trim().toLowerCase() === 's', env.fmCol, t1.수식);
const cp = BL({ _id: 'N', _year: '2026', 공사명: 'X', 지역명: '파주', 작업: '완료', PLC: '', 'ETOS T/S': '', HMI: '100', '통합 시운전': '', 총물량: '3210', ...Object.fromEntries(AUTO7.map(c => [c, '9'])) });
ok(['PLC', 'ETOS T/S', 'HMI', '통합 시운전', ...AUTO7].every(c => cp[c] === '') && cp.총물량 === '3210' && cp.공사명 === 'X' && cp.지역명 === '파주',
   '001 복사 → HMI·자동 칸 7개 비움 · 총물량·공사명·지역명 등은 그대로 (종전: 메인표 100%·3,210인데 새 장부는 비어 팝업·그래프 0)', cp);
ok(BL({ _year: '2025', HMI: '100', 누적: '5' }).HMI === '100' && BL({ _year: '2026', 실행번호: 's', HMI: '100' }).HMI === '100', '지난 연도·하위 행은 그대로 복사 (규칙 없는 행)');
ok(src.includes('if (baseRow) t1BlankProgress(newRow);') && src.includes('                t1BlankProgress(newRow);     // 기술1팀 누계'), '  └ 우클릭 복사·Ctrl+V 두 경로 다 적용');
const saSrc = grabTo(src, '    const saveAddingRow = async () => {', '\n    };');
ok(!!saSrc && saSrc.includes('fmDeriveCum(rowToAdd, {})') && saSrc.includes("for (const nm of ['PLC', 'ETOS T/S', 'HMI'])") && saSrc.includes('syncProgressCellToLedger({ _id, ...data }, c, v)'),
   '[추가] 저장: 자동 칸 = 새 행 기준 계산 · 추가 팝업에 친 PLC·ETOS·HMI = 장부에도 (팝업·그래프 = 메인표)');
const sdSrc = grabTo(src, '    const saveDraft = async (force = false) => {', '\n    };');
ok(!!sdSrc && sdSrc.includes('fmDeriveCum(fin0, {})') && sdSrc.includes('if (t1New) for (const k of Object.keys(edited)) await queueLedger(() => syncProgressCellToLedger({ _id: id, ...patchN }, k, edited[k]));'),
   '붙여넣은 노란 새 행 [저장]: 자동 칸 계산 + 친 PLC·ETOS·HMI를 장부에 (종전: 새 행만 장부 기록이 빠졌음)');

// ═══ 10. 엑셀 반영·확정 저장 — 누계 보호 (④) ══════════════════════════════════════════
console.log('\n■ 10. [엑셀 반영]·[엑셀 확정 저장] — 자동 칸 = 엑셀 값 대신 계산 · 진행 % 빈칸 = 웹 값 유지 · 바뀐 % = 장부에도');
const mfSrc = [(src.match(/    const T1_KEEP_COLS = [^\n]+/) || [])[0], grabTo(src, '    const fmMergeFix = (webRow, data, onKeep) => {', '\n    };')];
ok(mfSrc.every(Boolean), '원문 조각 찾음: T1_KEEP_COLS·fmMergeFix');
const pkEnv = new Function(pieces.progKey + '\nreturn progItemKeyOf;')();
const MF = new Function('fmCum', 'fmActive', 'isSubListRow', 'fmCol', 'progItemKeyOf', 'fmDeriveCum', mfSrc.join('\n') + '\nreturn fmMergeFix;')(true, (r) => String(r?._year || '') === '2026', () => false, env.fmCol, pkEnv, L.fmDeriveCum);
const web001 = { _id: '001', _year: '2026', ...S26['001'].row };
LEDGER = { '001': S26['001'].weekly };
let dat = { ...web001, HMI: '', 누적: '', 전체: '25', '금월 (2)': '25', '자체 시운전': '', 총물량: '' };   // 엑셀: 진행 % 빈칸 · 자동 칸은 옛 값
const kept = []; let sy = MF(web001, dat, (c) => kept.push(c));
ok(dat.HMI === '100' && dat.총물량 === '3210' && dat.누적 === '3210' && dat.전체 === '100' && dat['금월 (2)'] === '' && dat['자체 시운전'] === '100' && !sy.length && J(kept.sort()) === J(['HMI', '총물량']),
   '엑셀이 빈칸(HMI·총물량)·옛 자동 값(전체 25) → HMI 100·총물량 3,210 유지 · 누적 3,210·전체 100 다시 계산 · 장부 기록 없음 (종전: HMI 지워지고 전체 25로 덮임)', { dat, sy, kept });
dat = { ...web001, HMI: '80' };
sy = MF(web001, dat);
ok(dat.HMI === '80' && dat.전체 === '90' && J(sy) === J([{ col: 'HMI', value: '80' }]), '엑셀 HMI 80 (웹 100) → 엑셀 값 · 전체 = (80 + 자체 100) ÷ 2 = 90 · 장부에도 HMI 80 기록 대상', { 전체: dat.전체, sy });
dat = { _id: 'NEW', _year: '2026', 작업: '진행', PLC: '50', 누적: '999', 전체: '77', '자체 시운전': '12' };
sy = MF(null, dat);
ok(dat.누적 === '' && dat['자체 시운전'] === '' && dat.전체 === '25' && J(sy) === J([{ col: 'PLC', value: '50' }]), '엑셀에만 있는 새 행: 누적 999·전체 77(엑셀) 버림 → 누적 빈칸 · 전체 = (PLC 50 + 자체 0) ÷ 2 = 25 · PLC 50 = 새 장부에', { dat, sy });
const d25 = { _id: 'O', _year: '2025', HMI: '', 누적: '7' };
ok(J(MF({ _id: 'O', _year: '2025', HMI: '100' }, d25)) === '[]' && d25.HMI === '' && d25.누적 === '7', '지난 연도 행 = 종전 그대로 (엑셀 값 우선)');
const upSrc = grabTo(src, '    const handleUserExcelPick = async (e) => {', '\n    };'), amSrc = grabTo(src, '    const applyUserMerge = async () => {', '\n    };'), fbSave = grabTo(src, '    const handleSaveToFirebase = async () => {', '\n    };');
ok(!!upSrc && upSrc.includes('u.t1Syncs = fmMergeFix(m, u.data,') && upSrc.includes('plan.creates.forEach(c => { c.t1Syncs = fmMergeFix(null, c.data); });') && upSrc.includes('[...new Set([...interCols, ...autoCols0])]'),
   '[엑셀 반영]: 보호 적용 + 미리보기에 자동 칸 변화도 표시');
ok(!!amSrc && amSrc.includes('syncProgressCellToLedger({ _id: u._id, ...u.data }, sy.col, sy.value)') && !!fbSave && fbSave.includes('u.t1Syncs = fmMergeFix(m, u.data);') && fbSave.includes('syncProgressCellToLedger({ _id: u._id, ...u.data }, sy.col, sy.value)'),
   '[엑셀 반영]·관리자 [엑셀 확정 저장] 둘 다: 반영 뒤 바뀐 PLC·ETOS·HMI를 장부에 기록');
ok(src.includes('엑셀이 빈칸인 진행 값 <b>{um.t1Keeps.length}칸</b>'), '미리보기 창에 "빈칸이라 웹 값 유지 N칸" 안내');

// ═══ 11. 저장 경로·초기화·마감·안내 (⑤~⑨) ═════════════════════════════════════════════
console.log('\n■ 11. 초안 [저장]·상세 보기 [저장]·진행실적 초기화·월간 마감·Point 동기화·클릭 안내');
ok(!!sdSrc && sdSrc.includes('const patchS = (fmCum && fmActive({ ...sv, ...patch }) && !isSubListRow(sv)) ? { ...patch, ...fmDeriveCum({ ...sv, ...patch }) } : patch;') && sdSrc.includes('stampSave({ ...patchS, ...devExtra, _changeHistory: hist })'),
   '초안 [저장]: 자동 칸 = 저장 순간 다시 계산 (편집 뒤 다른 사람이 팝업 [적용하기]로 바꾼 최신 값을 옛 값으로 되돌리지 않게)');
const sdrSrc = grabTo(src, '    const saveDetailRow = async (force) => {', '\n    };');
ok(!!sdrSrc && sdrSrc.includes('.filter(h => progItemKeyOf(h) && !isExtLockedCell(working, h))') && sdrSrc.includes('await queueLedger(() => syncProgressCellToLedger(working, h, working[h]))') && sdrSrc.includes('Object.keys(draftEdited)'),
   '상세 보기 [저장]: 고친 PLC·ETOS·HMI(+그 행 노란 칸)를 장부에도 — 종전엔 메인표만 바뀌어 팝업·그래프와 어긋나고 다음 [적용하기] 때 옛 값으로 되돌아감 (전 팀)');
const rsSrc = grabTo(src, '    const handleResetProgress = async (row) => {', '\n    };');
const rcols = new Function('fmActive', 'fmCol', 'fmAutoColsOf', 'row', (src.match(/    const PROGRESS_RESET_FIELDS = [^\n]+/) || [''])[0] + '\n' + ((rsSrc || '').match(/        const resetCols = [^\n]+/) || [''])[0] + '\nreturn resetCols;')(() => true, env.fmCol, () => AUTO7, {});
ok(['PLC', 'ETOS T/S', 'HMI', '자체 시운전', '통합 시운전', ...AUTO7].every(c => rcols.includes(c)), '진행실적 초기화: 기술1팀 열 이름(ETOS T/S·자체 시운전·통합 시운전) + 자동 칸 7개까지 지움 (종전: ETOS·누적·공정률이 남음)', rcols);
ok(!!rsSrc && rsSrc.includes('resetCols.forEach(f => { del[f] = deleteField(); })') && rsSrc.includes('stampSave(del), { merge: true }') && !rsSrc.includes('await setDoc(rowDocRef(currentTeam, _id), rest);'), '  └ 지울 칸만 deleteField (행 사본 통째 쓰기 폐지 — 9/21 교훈)');
const mc2 = grabTo(src, '    const handleMonthlyClose = async () => {', '\n    };');
ok(!!mc2 && mc2.includes('const _cyMc = ym.slice(0, 4);'), '[월간 마감] 대상 = 마감하는 달의 연도 행 — 1월에 작년 12월을 마감해도 작년 행이 빠지지 않음 (3팀 공통)');
ok((grabTo(src, '    const syncAccPointToLedger = async', '\n    };') || '').includes('if (fmCfg) return { ok: true };'), "기술1팀 '누적' 키인(지난 연도 행) = 통합시운전 장부로 안 보냄 · '감소 차단'도 안 걸림");
const tipSrc = grabTo(src, '    const fmAutoTip = (h) => (fmCum', '`;');
const tipOf = (cum) => new Function('fmCum', 'dispHeader', 'fmNorm', (tipSrc || 'const fmAutoTip = () => "";') + '\nreturn fmAutoTip;')(cum, (h) => String(h).replace(/\s*\(\d+\)\s*$/, ''), fmNorm)('금월 (2)');
ok(!!tipSrc && tipOf(true).includes('자체 시운전 = 누적 ÷ 총물량 %') && tipOf(true).includes('이번 달 / 지난달에 늘어난 만큼') && !tipOf(true).includes('금월 ÷ 총물량') && !tipOf(true).includes('[월간 마감] 때'),
   '자동 칸 클릭 안내 = 누계 규칙 (종전: 옛 8/19 식 "자체 = 금월÷총물량·전월은 [월간 마감] 때" 안내)');
ok(tipOf(false).includes('금월 ÷ 총물량') && src.includes('if (isFmAutoCell(row, h)) { setAlertMsg(fmAutoTip(h)); return; }'), '  └ 방식 줄을 지우면(8/19 식 복귀) 옛 안내 그대로');

// ═══ 12. [진행 수치 다시 계산] ③ 장부 값으로 빈칸 채우기 (⑩ 배포 전 옛 [월간 마감] 대비) ══════════════
console.log('\n■ 12. [진행 수치 다시 계산] ③ — 장부엔 값·메인표 빈칸일 때 장부 값으로 채우기 (선택)');
ok(T.t1LatestPct({ hmi: { '2026-3-5': 100, '2026-9-4': 80 } }, 'hmi', '2026-09') === 80 && T.t1LatestPct({ hmi: { '2026-3-5': 100, '2026-9-4': 80 } }, 'hmi', '2026-08') === 100,
   't1LatestPct: 기준월까지 마지막 값 (9월 → 80 · 8월 → 100)');
ok(T.t1LatestPct({ hmi: { '2026-10-1': 50 } }, 'hmi', '2026-09') === null && T.t1LatestPct({}, 'plc', '2026-09') === null && T.t1LatestPct({ plc: { '2026-9-1': 0 } }, 'plc', '2026-09') === 0,
   '  └ 기준월 뒤 값은 안 봄 · 없으면 null · 0도 값');
const rcSrc2 = grabTo(src, '    const handleT1Recalc = async () => {', '\n    };');
ok(!!rcSrc2 && rcSrc2.includes('t1LatestPct(wk, k, t1RefYm())') && rcSrc2.includes('if (fillN) useFill = window.confirm(') && rcSrc2.includes('if (!moves.length && !fixes0.length && !fillN)'),
   '확인창 ③: 채울지 따로 묻고([취소] = 빈칸 그대로) · 채울 것만 있어도 실행 가능');

// ═══ 13. 팀장님 답 ① — 완료 프로젝트 = 종료 주로 자동 이동 ═════════════════════════════════
console.log('\n■ 13. 완료 프로젝트 — 팝업 [적용하기]·작업을 완료로 바꿀 때 종료 달 뒤 기록 = 종료 주 (팀장님 "종료 주로 자동 이동")');
const dwSrc = grabTo(src, '    const t1DoneWeekOf = (row) => {', '\n    };'), asSrc = grabTo(src, '    const t1AfterSave = async (rowFinal, changedKeys) => {', '\n    };');
ok(!!dwSrc && !!asSrc, '원문 조각 찾음: t1DoneWeekOf·t1AfterSave');
const calls = [];
const mkAfter = (weeklyOnServer) => new Function('fmCum', 'fmActive', 'isSubListRow', 'fmCol', 'fmNorm', 'aliasCol', 'teamProfile', 'datePairCols', 't1RefYm', 't1WeekKeyOfYmd', 't1DateToYmd',
    't1LedgerKeyOf', 'queueLedger', 'doc', 'db', 'appId', 'currentTeam', 'getDoc', 'setDoc', 't1PlanDoneMove', 'ledgerFreshRef', 'onProgressSaved', 'fmDeriveCum', 'rowDocRef', 'showExtToast',
    `${pieces.isDone}\n${pieces.endYmd}\n${dwSrc}\n${asSrc}\nreturn { t1DoneWeekOf, t1AfterSave };`)(
    true, (r) => String(r?._year || '') === '2026', () => false, env.fmCol, fmNorm, env.aliasCol, t1, ['시작', '종료'], () => '2026-09', T.t1WeekKeyOfYmd, T.t1DateToYmd,
    (r) => r._pid || r._id, (fn) => fn(), (...a) => a.slice(-1)[0], {}, 'A', '기술1팀',
    async () => ({ exists: () => !!weeklyOnServer, data: () => ({ docKey: 'P3', weekly: weeklyOnServer }) }),
    async (ref, data, opt) => { calls.push({ ref, data, opt }); }, T.t1PlanDoneMove, { current: {} }, () => {}, L.fmDeriveCum, (t, id) => 'ROW:' + id, (m) => calls.push({ toast: m }));
const A1 = mkAfter({ hmi: { '2026-4-5': 100 }, commissioning: { '2026-9-5': 44 } });   // 003에 44점을 '이번 주(9월 5주)'에 넣고 완료로 바꾼 경우
ok(A1.t1DoneWeekOf({ _year: '2026', 작업: '완료', 종료: "26'04/30" }) === '2026-4-5' && A1.t1DoneWeekOf({ _year: '2026', 작업: '취소', 종료: "26'04/30" }) === null
   && A1.t1DoneWeekOf({ _year: '2026', 작업: '완료', 종료: "26'10/15" }) === null && A1.t1DoneWeekOf({ _year: '2026', 작업: '완료', 종료: '' }) === null,
   '종료 주 = 완료 + 종료 날짜가 오늘 달 이하일 때만 (003 → 4월 5주 · 취소·종료 10월·날짜 없음 = 없음)');
const r003 = { _id: '003', _pid: 'P3', _year: '2026', 작업: '완료', HMI: '100', 총물량: '44', 종료: "26'04/30", 누적: '44', 금월: '44', 전월: '', '자체 시운전': '100', 전체: '100', '금월 (2)': '50', '전월 (2)': '' };
(async () => {
    calls.length = 0;
    LEDGER = { '003': { hmi: { '2026-4-5': 100 }, commissioning: { '2026-9-5': 44 } } };
    await A1.t1AfterSave(r003, ['작업']);
    const led = calls.find(c => c.ref === 'P3'), row = calls.find(c => c.ref === 'ROW:003');
    ok(!!led && J(led.data.weekly.commissioning) === J({ '2026-4-5': 44 }) && led.data.weekly.hmi['2026-4-5'] === 100, "작업을 '완료'로 저장 → 9월 5주 44점이 종료 주(4월 5주)로 옮겨짐 (서버 장부 위에서)", led && led.data.weekly);
    ok(!!row && row.data.금월 === '' && row.data['금월 (2)'] === '' && row.opt && row.opt.merge === true && !('누적' in row.data), '  └ 메인표: 금월 44 → 빈칸 · 공정률 금월 50 → 빈칸 (누적 44·자체 100%·전체 100%는 그대로) · 바뀐 칸만 merge', row && row.data);
    ok(calls.some(c => c.toast && c.toast.includes('4월 5주')), '  └ 알림: "종료 주(4월 5주)로 옮겼습니다"');
    calls.length = 0;
    await A1.t1AfterSave(r003, ['HMI']);
    ok(calls.length === 0, '작업·종료를 안 바꾼 저장은 아무것도 안 함 (HMI만 고침 → 기존 syncProgressCellToLedger가 종료 주에 기록)');
    await A1.t1AfterSave({ ...r003, 작업: '진행' }, ['작업']);
    ok(calls.length === 0, "'진행'으로 바꾸면 안 옮김 (완료일 때만)");
    const A0 = mkAfter({ hmi: { '2026-4-5': 100 }, commissioning: { '2026-4-5': 44 } });
    calls.length = 0; await A0.t1AfterSave(r003, ['종료']);
    ok(calls.length === 0, '이미 종료 주에 있으면 쓰기 없음');
    const pm = pmSrc;
    ok(/doneWeekKey = null[,} ]/.test(pm) &&pm.includes('const mv = t1PlanDoneMove(weeklyData, doneWeekKey);') && pm.includes('weekly: wd,') && pm.includes("onProgressSaved?.({ docKey, weeklyData: wd });") && pm.includes('weekly: wd };'),
       '팝업 [적용하기]: 완료 프로젝트면 종료 달 뒤 입력을 종료 주로 옮겨 저장 · 메인표 계산에도 옮긴 장부 전달');
    ok(src.includes('doneWeekKey={t1DoneWeekOf(progressRow)}'), '  └ List가 팝업에 종료 주 전달');
    ok(sdSrc && src.includes('await t1AfterSave(finalRow, Object.keys(edited));') && src.includes('await t1AfterSave(working, [...Object.keys(popupChanges), ...Object.keys(draftEdited)]);')
       && src.includes("await t1AfterSave({ _id: u._id, ...u.data }, (u.diffs || []).map(d => d.col));") && src.includes('await t1AfterSave({ _id: u._id, ...u.data }, u.t1Chg);'),
       '작업을 완료로 바꾸는 모든 길: 노란 칸 [저장] · 상세 보기 [저장] · [엑셀 반영] · [엑셀 확정 저장]');
    // ② 통합 시운전 — 연결
    ok(src.includes("[fmCol('통합 시운전')]: d.intPct === null ? '' : z(d.intPct)") && src.includes("const T1_KEEP_COLS = ['PLC', 'ETOS T/S', 'HMI', '총물량'];"), "② 통합 시운전: 메인표 자동 칸으로 계산 · 엑셀 병합 '빈칸 유지' 목록에선 빠짐(다시 계산 대상)");
    const tipI = new Function('fmCum', 'dispHeader', 'fmNorm', (tipSrc || '') + '\nreturn fmAutoTip;')(true, (h) => h, fmNorm)('통합 시운전');
    ok(tipI.includes("통합시운전' 줄 포인트 합 ÷ 총물량") && tipI.includes("상세 보기에서 '통합 시운전' 스위치를 켜세요"), '  └ 통합 칸 클릭 안내 = "켜려면 상세 보기 스위치 · 포인트는 팝업 통합시운전 줄"');

    // ═══ 14. 팀장님 답 ③ — 진행실적 팝업 다음 달 이후 칸 잠금 ═══
    console.log('\n■ 14. 진행실적 팝업 — 다음 달 이후 주 칸 잠금 (팀장님 "다음 달 이후 칸 잠금") — ProgressModal 원문');
    const fwSrc = grabTo(pmSrc, '    const isFutureWk = (wKey) => {', '\n    };'), uwSrc = grabTo(pmSrc, '    const updateWeekly = (itemKey, wKey, val) => {', '\n    };');
    ok(!!fwSrc && !!uwSrc, '원문 조각 찾음: isFutureWk·updateWeekly');
    const mkUW = (lockYm, init) => {
        const box = { state: init, dirty: false };
        const f = new Function('lockAfterYm', 'lockedItems', 'setWeeklyData', 'setDirty', `${fwSrc}\n${uwSrc}\nreturn { isFutureWk, updateWeekly };`)(lockYm, [], (fn) => { box.state = fn(box.state); }, (v) => { box.dirty = v; });
        return Object.assign(box, f);
    };
    const U = mkUW('2026-09', { hmi: { '2026-10-1': 5 } });
    ok(U.isFutureWk('2026-10-1') && U.isFutureWk('2027-1-1') && !U.isFutureWk('2026-9-5') && !U.isFutureWk('2026-8-2'), '오늘 9월 기준: 10월·내년 = 잠금 · 9월(이번 달 5주 포함)·지난달 = 입력 가능');
    U.updateWeekly('commissioning', '2026-10-2', '300');
    ok(!U.state.commissioning && !U.dirty, '10월 2주에 300 입력 → 무시 (팝업 41% ↔ 메인표 35.8% 어긋남 방지)', U.state);
    U.updateWeekly('commissioning', '2026-9-5', '300');
    ok(U.state.commissioning && U.state.commissioning['2026-9-5'] === 300, '9월 5주(이번 달) = 입력됨');
    U.updateWeekly('hmi', '2026-10-1', '');
    ok(!('2026-10-1' in (U.state.hmi || {})), '이미 들어 있던 10월 값은 지우기만 가능 (실수 정리용)', U.state.hmi);
    const U0 = mkUW(null, {}); U0.updateWeekly('hmi', '2026-10-1', '50');
    ok(U0.state.hmi && U0.state.hmi['2026-10-1'] === 50, '잠금 없는 팀(기술2·3팀 등 — lockAfterYm 없음) = 종전대로 미래 칸 입력 가능');
    ok(pmSrc.split('isFutureWk(wKey) && !hasVal').length - 1 === 3 && pmSrc.split("isFutureWk(wKey) ? '#e9edf2'").length - 1 === 2, '  └ 칸 3종(PC 항목 줄·하위 줄·모바일 한 주) 전부 잠금 표시 — 회색 · 값이 있으면 지우기만');
    ok(src.includes('lockAfterYm={progressRow && fmCum && fmActive(progressRow) && !isSubListRow(progressRow) ? t1RefYm() : null}'), '  └ List: 기술1팀 올해 행만 오늘 달 기준으로 잠금 전달');

    console.log('\n' + '='.repeat(62));
    console.log(`결과: ${pass}/${pass + fail} 통과` + (fail ? `  ★ 실패 ${fail}건` : '  ✓'));
    process.exit(fail ? 1 : 0);
})();
