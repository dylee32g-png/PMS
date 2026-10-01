/* 기술2·3팀 '메인표 × = 진행실적 팝업에 없음' 검사 (2026-09-30)
 *   팀장님: "메인표에서 PLC·ETOS ×인데 왜 진행실적 팝업창에는 PLC·ETOS 항목이 살아 있지? 동기화 되게" + "전체 기간이 3월부터 — 1월부터"
 *   원인: 9/29 '빈칸 = 없음' 규칙(t1EmptyOffOf)이 기술1팀에만 걸려 있었음 → 기술2·3팀은 빈 PLC·ETOS도 팝업에 줄·진척률 0%로 들어감
 *   ① 공용 규칙(projectListData 원문 emptyProgOffOf·naProgressItemsOf·grayEmptyTestOf·extLockedColsMainOf)
 *   ② List 원문(naToProgressItems·isNaItemCell·isExOnProgCell·progSwitchOf·blankProgressCopyOf·autoLockedColsOf + 메인표 칸 × 판정 원문)
 *      → 경우별 행마다 네 화면 대조: 메인표 × ⇔ 진행실적 팝업 줄 없음 ⇔ 상세 보기 스위치 꺼짐 ⇔ 모바일 팝업 줄 없음
 *   ③ 진행실적 팝업(ProgressModal 원문): '전체 기간 보기' = 올해 1월부터 · 연도 머리칸 · 항목 없음 안내 · [적용하기] 포인트 기록 없으면 Point 안 건드림
 *   ④ 모바일 [적용하기](MobileInputScreen 원문 applyToMain)를 가짜 서버에: 바뀐 칸만 merge · NAS 칸 제외 · Point·진행율 % = PC와 같음
 *   ⑤ 연결 확인(원문 문자열)
 *   ⑥ (선택) 실제 백업으로 전수 대조: PROG_SYNC_DATA=백업JSON경로[;경로2] — 2026 메인 행 전부 네 화면 대조 (저장소엔 데이터 없음)
 *   ⑦ (2026-09-30 오후) 팀장님: "완료 프로젝트에 3월에 ETOS 100% 넣으면 그게 합계로 나와야 하는데, 현재 당일 또 100% 넣어버리고 있잖아"
 *      원인: 메인표·상세/수정·새 행에서 친 진행 값을 무조건 장부 '이번 주' 칸에 적던 역방향 동기화(7/10) — 3월 기록보다 뒤라 합계를 가림
 *      → 사람이 친 값: 같은 값·0 = 안 씀 · 끝난 프로젝트(완료·취소·삭제) = 새 날짜 안 만듦 · 기록 없는 항목 = 메인표 값이 합계(팝업·그래프)
 *      원문 실행: projectListData(handPctTarget·handPointTarget·mainBaseOf) · List(syncProgressCellToLedger·syncAccPointToLedger — 가짜 서버)
 *      · ProgressModal(합계·진척률·[적용하기]) · App.js 그래프(getRecordMonthlyProgress) · 캡쳐 순서 그대로 재현
 *   실행: node tests/list/prog_item_sync_test.js   (크롬 없음 · 몇 초)
 */
process.env.BABEL_ENV = process.env.BABEL_ENV || 'test';
const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const ROOT = path.resolve(__dirname, '..', '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const src = rd('src/components/ProjectListScreen.jsx');
const pldSrc = rd('src/components/projectListData.js');
const pmSrc = rd('src/components/ProgressModal.jsx');
const mobSrc = rd('src/components/MobileInputScreen.jsx');
const dmSrc = rd('src/components/DetailModal.jsx');
const appSrc = rd('src/App.js');
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  OK   ' + m); } else { fail++; console.log('  NG   ' + m + (x !== undefined ? '  → ' + (typeof x === 'string' ? x : JSON.stringify(x)) : '')); } };
const J = (x) => JSON.stringify(x);
const grabTo = (s, a0, endStr) => { const a = s.indexOf(a0); if (a < 0) return null; const b = s.indexOf(endStr, a + a0.length); return b < 0 ? null : s.slice(a, b + endStr.length); };
const between = (s, a0, b0) => { const a = s.indexOf(a0); if (a < 0) return null; const b = s.indexOf(b0, a); return b < 0 ? null : s.slice(a, b); };
const line = (s, re) => (s.match(re) || [])[0] || null;

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
const { getTeamProfile } = loadModule(path.join(ROOT, 'src/teamProfiles/index.js'));
const t2 = getTeamProfile('기술2팀'), t3 = getTeamProfile('기술3팀');

// ═══ 1. 공용 규칙 (projectListData 원문) ═══════════════════════════════════════════
console.log('■ 1. 공용 규칙 — projectListData 원문 (List·모바일이 같은 함수)');
const P = {
    empty: grabTo(pldSrc, 'export function emptyProgOffOf(', '\n}\n'),
    gray: grabTo(pldSrc, 'export const grayEmptyTestOf = (profile) => {', '\n};'),
    naOf: grabTo(pldSrc, 'export function naProgressItemsOf(', '\n}\n'),
    lock: grabTo(pldSrc, 'export const extLockedColsMainOf = (row, profile) => {', '\n};'),
};
Object.entries(P).forEach(([k, v]) => ok(!!v, '원문 조각 찾음: ' + k));
const extRulesOf = (r) => (r && r._extSync && Array.isArray(r._extSync.rules)) ? r._extSync.rules : [];   // NAS_SYNC_ENABLED = true (2026-08-05~)
const extLockedColsOf = (r) => extRulesOf(r).map(x => x.target);
const U = new Function('extRulesOf', 'extLockedColsOf', Object.values(P).map(v => String(v).replace(/^export /, '')).join('\n') + '\nreturn { emptyProgOffOf, grayEmptyTestOf, naProgressItemsOf, extLockedColsMainOf };')(extRulesOf, extLockedColsOf);

// 기술2팀 2026 양식(260822) 열 — 공사 진행 = 포인트(Total) · PLC · ETOS · HMI · 진행율 %(통합) · Point(누적)
const H2 = ['번호', '수행번호', '공장', '공사분류', '진행 현황', 'Project', '포인트', 'PLC', 'ETOS', 'HMI', '진행율 %', 'Point', '날짜', '내용', '담당자', '관리자', '공사 계약', '공사 완료', '발주처'];
const G2 = [{ label: '', cols: ['번호', '수행번호', '공장', '공사분류', '진행 현황', 'Project'] }, { label: '공사 진행', cols: ['포인트', 'PLC', 'ETOS', 'HMI', '진행율 %', 'Point'] },
    { label: '진행 내용', cols: ['날짜', '내용'] }, { label: '관리', cols: ['담당자', '관리자', '공사 계약', '공사 완료', '발주처'] }];
const INT = [t2.시운전.통합열, t2.시운전.누적열];
ok(J(INT) === J(['진행율 %', 'Point']) && t2.빈칸회색 === true && t3.시운전.통합열 === '진행율 %' && t3.빈칸회색 === true, "팀 카드: 기술2·3팀 통합시운전 칸 = '진행율 %'·'Point' · 빈칸 = 짙은 회색 × (기술3팀 상속)", INT);
const gray2 = U.grayEmptyTestOf(t2);
ok(gray2('PLC') && gray2('아무 열') && !U.grayEmptyTestOf({ 빈칸회색열: ['PLC'] })('HMI') && U.grayEmptyTestOf({ 빈칸회색열: ['PLC'] })('PLC') && !U.grayEmptyTestOf(null)('PLC'),
   'grayEmptyTestOf = List isGrayEmptyCol과 같은 규칙 (빈칸회색: true = 모든 열 · 빈칸회색열 = 그 열만 · 카드 없음 = 없음)');
const E = (row, opt) => U.emptyProgOffOf(row, H2, Object.assign({ gray: gray2, intCols: INT }, opt || {}));
const base = Object.fromEntries(H2.map(h => [h, '']));
const R = (o) => ({ _id: 'x', _year: '2026', ...base, 번호: '001', 'Project': 'P', ...o });
ok(J(E(R({ '진행 현황': '완료', HMI: '100', 포인트: '4', '진행율 %': '100', Point: '4' }))) === J({ plc: false, etos: false }),
   '001형(기술3팀 캡쳐: 완료 · PLC·ETOS × · HMI 100 · 진행율 100 · Point 4) → 빠지는 것 = PLC·ETOS만 (HMI·통합시운전은 팝업에)');
ok(J(E(R({ '진행 현황': '완료' }))) === J({ plc: false, etos: false, hmi: false, integratedTest: false }), '전부 빈칸(002~013형 완료) → PLC·ETOS·HMI·통합시운전 전부 빠짐');
ok(E(R({ 포인트: '209' })).integratedTest === false, '총점(포인트)만 있고 진행율 %·Point 빈칸(108형) → 통합시운전 빠짐 (메인표 시운전 두 칸이 ×)');
ok(E(R({ Point: '0', PLC: '0' })).integratedTest === undefined && E(R({ Point: '0', PLC: '0' })).plc === undefined, "Point '0'·PLC '0'(143형) → 0도 값 = 적용");
ok(E(R({ '진행율 %': '45.8' })).integratedTest === undefined && E(R({ Point: '5' })).integratedTest === undefined, '진행율 %·Point 둘 중 하나만 있어도 통합시운전 적용');
ok(E(R({ _naOn: ['PLC'] })).plc === undefined && E(R({ _naOn: ['통합시운전'] })).integratedTest === undefined && E(R({ _naOn: ['Point'] })).integratedTest === undefined,
   '상세 보기에서 켠 항목(_naOn: PLC / 통합시운전 / Point) = 빈칸이어도 적용 (기술3팀 001의 9/29 모양 = 통합시운전 켬)');
ok(J(E(R({}), { gray: () => false })) === '{}', '빈칸을 ×로 안 그리는 팀(카드 빈칸회색 없음) = 규칙 없음 (종전 그대로)');
ok(U.emptyProgOffOf({ _id: 'y', PLC: '', HMI: '1' }, ['PLC', 'HMI'], { gray: () => true }).etos === undefined
   && U.emptyProgOffOf({ _id: 'y', PLC: '', 'ETOS T/S': '', HMI: '1' }, ['PLC', 'ETOS T/S', 'HMI'], { gray: () => true }).etos === false, "기술1팀 열 이름 'ETOS T/S'도 같은 규칙 · 표에 없는 열은 여기서 안 정함(기본 미적용 쪽)");
const naM = (row) => U.naProgressItemsOf(row, null, INT[0], { gray: gray2, intCols: INT }) || {};
ok(naM(R({ _naItems: ['Point'], '진행율 %': '100', Point: '4', HMI: '10' })).integratedTest === false && naM(R({ _naItems: ['진행율 %'], Point: '4' })).integratedTest === false,
   '모바일 naProgressItemsOf: 진행율 %·Point 중 하나를 끄면(_naItems) 통합시운전 끔 (묶음)');
ok(naM(R({ _naItems: ['PLC'], PLC: '40' })).plc === false && naM(R({ PLC: '40', HMI: '1', Point: '1' })).plc === undefined, '  └ 끈 PLC(값 보관) = 빠짐 · 값 있는 PLC = 적용');
ok(naM(R({ HMI: '1', Point: '1' })).drawing === false && naM(R({ HMI: '1', Point: '1' })).internalTest === false, '  └ 표에 열 없는 항목(도면입수·자체시운전 등) = 종전처럼 기본 미적용');
const nas010 = R({ '진행 현황': '진행중', PLC: '98.6', ETOS: '', HMI: '57.9', '진행율 %': '45.8', Point: '563',
    _extSync: { rules: [{ target: 'PLC' }, { target: '하위 공종표', type: 'subTable', parentCols: { HMI: 'x' } }] } });
ok(J(E(nas010)) === J({ etos: false }), '010형(NAS·ETOS가 NAS 진척자료에 없음 = 메인표 ×) → ETOS만 빠짐');
const lk = U.extLockedColsMainOf(nas010, t2);
ok(['PLC', 'HMI', 'Point', '진행율 %'].every(c => lk.includes(c)) && !lk.includes('하위 공종표') && !lk.includes('ETOS'), 'extLockedColsMainOf(010형) = PLC·HMI(공종표 부모)·Point·진행율 % — PC extLockedColsRow 메인 행과 같음', lk);
ok(J(U.extLockedColsMainOf(R({}), t2)) === '[]', '  └ NAS 규칙 없는 행 = 잠금 없음');

// ═══ 2. List 원문 — 네 화면 대조 ══════════════════════════════════════════════════
console.log('\n■ 2. List 원문 조각 — 메인표 × = 진행실적 팝업 줄 없음 = 상세 보기 스위치 꺼짐 = 모바일 (기술2·3팀)');
const L0 = {
    naBlock: between(src, '    const PROG_NA_ALL = ', '    // 포인트 칸 — 메인표에서'),
    gray: line(src, /    const _grayKws = [^\n]+/) + '\n' + line(src, /    const isGrayEmptyCol = [^\n]+/),
    progKey: line(src, /    const PROG_COL_TO_KEY = [^\n]+/) + '\n' + line(src, /    const progItemKeyOf = [^\n]+/),
    sub: line(src, /    const isSubListRow = [^\n]+/),
    pa: [/    const paCfg = [^\n]+/, /    const paActive = [^\n]+/, /    const paCol = [^\n]+/].map(re => line(src, re)).join('\n'),
    cell: (() => { const a = src.indexOf("const nasX = ['PLC', 'ETOS', 'HMI']"); const e0 = ": '빈칸 (값 없음)';"; const b = src.indexOf(e0, a); return a >= 0 && b > a ? src.slice(a, b + e0.length) : null; })(),
    act: grabTo(src, '        // 통합시운전 묶음 (2026-09-30): 진행율 %·Point 중 한 칸에', '\n        }\n'),
};
Object.entries(L0).forEach(([k, v]) => ok(!!v && !/^null$/m.test(String(v)), '원문 조각 찾음: ' + k));   // 한 줄 조각이 없으면 'null' 줄
const fmNorm = (v) => String(v ?? '').replace(/\s+/g, '');
const mkList = (profile, headers) => new Function('teamProfile', 'activeHeaders', 'fmNorm', 'fmCum', 'fmActive', 'fmCfg', 'fmCol', 't1EmptyOffOf', 'fmAutoColsOf', 'emptyProgOffOf',
    `${L0.sub}\n${L0.gray}\n${L0.progKey}\n${L0.pa}\n${L0.naBlock}\nreturn { naToProgressItems, naItemsOf, isNaItemCell, isExOnProgCell, progSwitchOf, blankProgressCopyOf, autoLockedColsOf, autoLockTipOf, intGroupCols, isIntGroupCol, intGroupOffOf, _isIntGroupName, progItemKeyOf, isGrayEmptyCol, isSubListRow };`)(
    profile, headers, fmNorm, false, () => false, null, (nm) => headers.find(h => fmNorm(h) === fmNorm(nm)) || nm, () => ({}), () => [], U.emptyProgOffOf);
const L2 = mkList(t2, H2), L3 = mkList(t3, H2);
ok(J(L2.intGroupCols) === J(['진행율 %', 'Point']) && J(L3.intGroupCols) === J(['진행율 %', 'Point']), 'List 통합시운전 묶음 칸 = 진행율 %·Point (기술2·3팀)');
const cellOf = (L, row, h) => new Function('row', 'h', 'val', 'extRulesOf', 'isExtLockedCell', 'isPointCol', 'getSubPt', 'projectNameCol', 'isSubListRow', 'isExecNoCol', 'isNaItemCell', 'isGrayEmptyCol', 'isExOnProgCell', 'progItemKeyOf', 'isIntGroupCol', 'isProgNumCol',
    `${L0.cell}\nreturn { cellOff, offTip, exOnEmpty };`)(row, h, row[h], extRulesOf, (r, hh) => U.extLockedColsMainOf(r, t2).some(t => fmNorm(t) === fmNorm(hh)),
    (hh) => hh === '포인트', () => null, 'Project', L.isSubListRow, (hh) => hh === '수행번호', L.isNaItemCell, L.isGrayEmptyCol, L.isExOnProgCell, L.progItemKeyOf, L.isIntGroupCol, (hh) => !!L.progItemKeyOf(hh) || L.isIntGroupCol(hh) || hh === '포인트');   // 진행 숫자 칸 (2026-10-01)
const DM = loadModule(path.join(ROOT, 'src/components/DetailModal.jsx')).default;
const dmHtml = (L, row, prof) => renderToStaticMarkup(React.createElement(DM, { detailRow: row, setDetailRow: () => {}, onSave: () => {}, activeHeaders: H2, activeColGroups: G2, mainVisibleHeaders: H2,
    cardDefaultOff: [], currentTeam: prof === t3 ? '기술3팀' : '기술2팀', progSwitch: L.progSwitchOf(row), intColAlias: prof.시운전.통합열,
    autoLockedCols: L.autoLockedColsOf(row), autoLockTip: L.autoLockTipOf(row), extLockedCols: U.extLockedColsMainOf(row, prof) }));
const segOf = (html, h) => { const a = html.indexOf(`data-dm-field="${h}"`); if (a < 0) return ''; const b = html.indexOf('data-dm-field="', a + 10); return html.slice(a, b < 0 ? undefined : b); };
const swOnOf = (html, h) => { const g = segOf(html, h); const m = g.match(/<button[^>]*title="([^"]*)"[^>]*style="[^"]*background-color:(#[0-9a-f]+)/); return m ? { on: m[2] === '#1e7ac8', tip: m[1] } : null; };
const ITEM_COLS = { plc: ['PLC'], etos: ['ETOS'], hmi: ['HMI'], integratedTest: ['진행율 %', 'Point'] };
const sweep = (label, row, L, prof) => {
    const pi = L.naToProgressItems(row) || {};
    const piM = U.naProgressItemsOf(row, null, prof.시운전.통합열, { gray: U.grayEmptyTestOf(prof), intCols: [prof.시운전.통합열, prof.시운전.누적열] }) || {};
    const html = dmHtml(L, row, prof);
    const bad = [];
    Object.entries(ITEM_COLS).forEach(([k, cols]) => {
        const pop = pi[k] !== false, mob = piM[k] !== false;
        const cellsOn = cols.map(c => !cellOf(L, row, c).cellOff);   // 메인표 × 아님
        const mainOn = cellsOn.some(Boolean);
        const sw = cols.map(c => swOnOf(html, c));
        const dmOn = sw.some(x => x && x.on);
        if (pop !== mainOn) bad.push(`${k}: 팝업 ${pop ? '줄 있음' : '없음'} ↔ 메인표 ${mainOn ? '값' : '×'}`);
        if (pop !== mob) bad.push(`${k}: 모바일 ${mob ? '있음' : '없음'}`);
        if (pop !== dmOn) bad.push(`${k}: 상세 보기 스위치 ${dmOn ? '켜짐' : '꺼짐'}`);
        if (sw.some(x => !x)) bad.push(`${k}: 상세 보기 스위치를 못 찾음`);
    });
    ok(!bad.length, label, bad);
    return pi;
};
const CASES = [
    ['001형 완료 — PLC·ETOS × · HMI 100 · 진행율 100 · Point 4 (팀장님 캡쳐)', { '진행 현황': '완료', HMI: '100', 포인트: '4', '진행율 %': '100', Point: '4' }, ['hmi', 'integratedTest']],
    ['002형 완료 — 전부 빈칸', { '진행 현황': '완료' }, []],
    ['010형 Hold — HMI 3%만', { '진행 현황': 'Hold', HMI: '3' }, ['hmi']],
    ['014형 진행중 — HMI 75%만', { '진행 현황': '진행중', HMI: '75' }, ['hmi']],
    ['018형 취소 — 전부 빈칸', { '진행 현황': '취소' }, []],
    ['015형 추진중 — 총점만(포인트 17305)', { '진행 현황': '추진중', 포인트: '17305' }, []],
    ['098형 진행중 — PLC 끔(_naItems) · ETOS·HMI 25 · 진행율 0 · Point 0', { '진행 현황': '진행중', ETOS: '25', HMI: '25', '진행율 %': '0', Point: '0', _naItems: ['PLC'] }, ['etos', 'hmi', 'integratedTest']],
    ['143형 진행중 — PLC 0 · Point 0 (0도 값)', { '진행 현황': '진행중', PLC: '0', Point: '0' }, ['plc', 'integratedTest']],
    ['상세 보기에서 빈 PLC를 켬(_naOn)', { '진행 현황': '진행중', HMI: '10', _naOn: ['PLC'] }, ['plc', 'hmi']],
    ['기술3팀 001의 9/29 모양 — 통합시운전 켬(_naOn) · 값 없음', { '진행 현황': '완료', _naOn: ['통합시운전'] }, ['integratedTest']],
    ['Point 스위치를 끔(_naItems) — 값 보관', { '진행 현황': '완료', HMI: '100', '진행율 %': '100', Point: '4', _naItems: ['Point'] }, ['hmi']],
    ['010형 NAS — ETOS가 NAS 진척자료에 없음', { '진행 현황': '진행중', PLC: '98.6', HMI: '57.9', '진행율 %': '45.8', Point: '563', _extSync: nas010._extSync }, ['plc', 'hmi', 'integratedTest']],
];
[[L2, t2, '기술2팀'], [L3, t3, '기술3팀']].forEach(([L, prof, tn]) => {
    CASES.forEach(([nm, o, want]) => {
        const pi = sweep(`${tn} ${nm}: 메인표 × ⇔ 팝업·모바일에 없음 ⇔ 상세 보기 꺼짐`, R(o), L, prof);
        const shown = Object.keys(ITEM_COLS).filter(k => pi[k] !== false);
        if (tn === '기술2팀') ok(J(shown) === J(want), `  └ 진행실적 팝업 줄 = ${want.length ? want.join('·') : '(없음)'}`, shown);
    });
});
// 켠 빈 항목 = 메인표 흰 빈칸(× 아님) · 묶음 끔 = 두 칸 모두 ×
const rOnPlc = R({ HMI: '10', _naOn: ['PLC'] });
const cPlc = cellOf(L2, rOnPlc, 'PLC');
ok(!cPlc.cellOff && cPlc.exOnEmpty, '상세 보기에서 켠 빈 PLC = 메인표 흰 빈칸 (× 아님 — 팝업에 줄이 있으니)', cPlc);
ok(cellOf(L2, R({ HMI: '10' }), 'PLC').cellOff && /진행실적 팝업·진척률·그래프에서도 빠짐/.test(cellOf(L2, R({ HMI: '10' }), 'PLC').offTip), '안 켠 빈 PLC = × + 안내 "진행실적 팝업·진척률·그래프에서도 빠짐"');
ok(cellOf(L2, R({}), '내용').cellOff && cellOf(L2, R({}), '내용').offTip === '빈칸 (값 없음)', '  └ 진행 항목이 아닌 빈칸(내용 등) = 안내 "빈칸 (값 없음)" — x는 X 값으로 들어가는 칸 (2026-10-01)');
const rOffPt = R({ '진행율 %': '100', Point: '4', _naItems: ['Point'] });
ok(cellOf(L2, rOffPt, '진행율 %').cellOff && cellOf(L2, rOffPt, 'Point').cellOff, 'Point 스위치 끔 → 진행율 %·Point 둘 다 × (값 보관) = 팝업 통합시운전 없음');
ok(!cellOf(L2, R({ _naOn: ['통합시운전'] }), '진행율 %').cellOff && !cellOf(L2, R({ _naOn: ['통합시운전'] }), 'Point').cellOff, '통합시운전 켬(값 없음) → 진행율 %·Point 흰 빈칸 (팝업에 줄)');
// 상세 보기: 통합시운전 '열 없음' 줄이 따로 안 뜸 · 진행율 % 잠금 · 묶음 스위치 문구
const h001 = dmHtml(L2, R({ '진행 현황': '완료', HMI: '100', 포인트: '4', '진행율 %': '100', Point: '4' }), t2);
ok(!h001.includes('data-dm-field="통합시운전"') && !/통합시운전[\s\S]{0,400}주간 키인 전용/.test(h001), "상세 보기: '통합시운전 · 메인표 열 없음 · 미적용' 줄 없음 (통합열 별칭 — 종전엔 따로 떠서 메인표·팝업과 반대로 보였음)");
ok(segOf(h001, '진행율 %').includes('🔒 잠금') && segOf(h001, '진행율 %').includes('자동 계산') && !/<input|<textarea/.test(segOf(h001, '진행율 %')) && segOf(h001, '진행율 %').includes('진행율 % = Point ÷ 포인트'),
   '상세 보기: 진행율 % = 🔒 자동 계산 (Point ÷ 포인트) — 쳐도 저장 때 다시 계산돼 사라지던 칸 (기술1팀 9/29 수리와 같은 문제)');
ok(/<input|<textarea/.test(segOf(h001, 'Point')) && /<input|<textarea/.test(segOf(h001, 'PLC')), '  └ Point·PLC·ETOS·HMI는 그대로 입력 가능');
const hOffEt = dmHtml(L2, R({ HMI: '10' }), t2);
ok(/빈칸 — 이 프로젝트엔 없는 항목/.test(swOnOf(hOffEt, 'ETOS').tip) && /빈칸 — 이 프로젝트엔 통합시운전 없음/.test(swOnOf(hOffEt, 'Point').tip), '상세 보기 빈 항목 스위치 = "이 프로젝트엔 없는 항목 · 누르면 켬(팝업에 줄)"', [swOnOf(hOffEt, 'ETOS'), swOnOf(hOffEt, 'Point')]);
ok(/둘 다/.test(swOnOf(h001, 'Point').tip) && swOnOf(h001, 'Point').on && swOnOf(h001, '진행율 %').on, '  └ 통합시운전 묶음 스위치 = 진행율 %·Point 같이 (문구 "둘 다")');
// 묶음 스위치 누르기 — 가짜 브라우저(jsdom)에 실제로 그려 스위치를 클릭 (상세 보기 원문 그대로 · setDetailRow = React 상태)
const { JSDOM } = require('jsdom');
const jd = new JSDOM('<!doctype html><html><body></body></html>');
Object.assign(global, { window: jd.window, document: jd.window.document, HTMLElement: jd.window.HTMLElement, Node: jd.window.Node });
if (!global.navigator) global.navigator = jd.window.navigator;
global.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = require('react-dom/client');
const clickSw = (L, row, h) => {
    const box = { row };
    function Harness() {
        const [r, setR] = React.useState(row);
        box.row = r;
        return React.createElement(DM, { detailRow: r, setDetailRow: setR, onSave: () => {}, activeHeaders: H2, activeColGroups: G2, mainVisibleHeaders: H2,
            cardDefaultOff: [], currentTeam: '기술2팀', progSwitch: L.progSwitchOf(r), intColAlias: '진행율 %', autoLockedCols: L.autoLockedColsOf(r) });
    }
    const host = document.createElement('div'); document.body.appendChild(host);
    const root = createRoot(host);
    React.act(() => { root.render(React.createElement(Harness)); });
    const field = host.querySelector(`[data-dm-field="${h}"]`);
    const btn = field ? [...field.querySelectorAll('button')].find(b => b.style.width === '22px') : null;
    if (!btn) { React.act(() => root.unmount()); return null; }
    React.act(() => { btn.dispatchEvent(new jd.window.MouseEvent('click', { bubbles: true })); });
    const out = box.row;
    React.act(() => root.unmount()); host.remove();
    return out;
};
let c1 = clickSw(L2, R({ HMI: '100', '진행율 %': '100', Point: '4' }), 'Point');
ok(c1 && J(c1._naItems) === J(['Point']) && L2.naToProgressItems(c1).integratedTest === false && L2.isNaItemCell(c1, '진행율 %'), '상세 보기 Point 스위치 끔 → _naItems [Point] → 팝업 통합시운전 없음 · 메인표 진행율 %도 ×', c1 && c1._naItems);
let c2 = c1 && clickSw(L2, c1, '진행율 %');
ok(!!c2 && J(c2._naItems) === '[]' && (L2.naToProgressItems(c2) || {}).integratedTest !== false && !L2.isNaItemCell(c2, 'Point'), '  └ 진행율 % 스위치로 다시 켬 → 묶음 전체 켜짐 (끈 칸이 Point여도)', c2 && c2._naItems);
let c3 = clickSw(L2, R({ HMI: '10' }), 'Point');
ok(c3 && J(c3._naOn) === J(['통합시운전']) && (L2.naToProgressItems(c3) || {}).integratedTest !== false && !cellOf(L2, c3, 'Point').cellOff, '값 없는 행에서 Point 스위치 켬 → _naOn [통합시운전] → 팝업에 통합시운전 줄 · 메인표 흰 빈칸', c3 && c3._naOn);
let c4 = clickSw(L2, R({ HMI: '10' }), 'PLC');
ok(c4 && J(c4._naOn) === J(['PLC']) && (L2.naToProgressItems(c4) || {}).plc !== false, '값 없는 PLC 스위치 켬 → _naOn [PLC] → 팝업에 PLC 줄 (기술1팀과 같은 규칙)', c4 && c4._naOn);
// 셀 키인: 묶음 칸에 값을 넣으면 묶음 다시 켬
const actRun = (srcRow, key, val, patch0) => { const patch = Object.assign({ [key]: val }, patch0 || {}); new Function('srcRow', 'isXOff', 'isIntGroupCol', 'editingCell', 'patch', 'intGroupOffOf', '_isIntGroupName', L0.act)(srcRow, false, L2.isIntGroupCol, { key, value: val }, patch, L2.intGroupOffOf, L2._isIntGroupName); return patch; };
ok(J(actRun(R({ _naItems: ['Point', '포인트'] }), '진행율 %', '50')._naItems) === J(['포인트']) && J(actRun(R({ _naItems: ['통합시운전'] }), 'Point', '3')._naItems) === '[]' && actRun(R({}), 'Point', '3')._naItems === undefined,
   '메인표 키인: × 된 진행율 %·Point에 값 → 묶음 끈 표시(Point·통합시운전)만 지움 · 다른 칸(포인트) 끈 표시는 그대로 · 원래 켜져 있으면 손 안 댐');
// 복사·자동 칸·하위 행
const cp = L2.blankProgressCopyOf(R({ PLC: '30', ETOS: '20', HMI: '100', '진행율 %': '50', Point: '100', 포인트: '200', 공장: '파주', 'Project': 'X' }));
ok(['PLC', 'ETOS', 'HMI', '진행율 %', 'Point'].every(c => cp[c] === '') && cp.포인트 === '200' && cp.공장 === '파주' && cp.Project === 'X', '행 복사 = PLC·ETOS·HMI·진행율 %·Point 비움 · 포인트(총점)·공장·Project 그대로 (새 장부 0 ↔ 메인표 값 어긋남 방지)', cp);
ok(L2.blankProgressCopyOf(R({ 실행번호: 's', HMI: '5' })).HMI === '5', '  └ 하위 행은 그대로 (부모 팝업 사용)');
ok(J(L2.autoLockedColsOf(R({}))) === J(['진행율 %']) && J(L2.autoLockedColsOf({ ...R({}), _year: '2025' })) === '[]' && J(L2.autoLockedColsOf(R({ 실행번호: 's' }))) === '[]', '상세·추가 팝업 잠금 = 2026 행의 진행율 %만 (카드 진행율자동 연도 · 하위 행 제외)');
ok(L2.progSwitchOf(R({ 실행번호: 's' })) === null && J(L2.progSwitchOf(R({})).cols) === J(['PLC', 'ETOS', 'HMI']) && J(L2.progSwitchOf(R({})).group) === J({ name: '통합시운전', cols: ['진행율 %', 'Point'] }), '상세 보기 스위치 규칙 = PLC·ETOS·HMI 값 규칙 + 통합시운전 묶음 · 하위 행 없음');
const Lsw = mkList(getTeamProfile('Software팀'), ['번호', '진행 현황', '개발 분류', '공정률']);
ok(Lsw.progSwitchOf({ _id: 'q', _year: '2026' }) === null && J(Lsw.naToProgressItems({ _id: 'q', _year: '2026', 공정률: '' }) || {}) === J(Lsw.naToProgressItems({ _id: 'q', _year: '2026', 공정률: '5' }) || {}), 'Software팀(진행실적 팝업 없음) = 영향 없음');

// ═══ 3. 진행실적 팝업 (ProgressModal 원문) ═════════════════════════════════════════
console.log("\n■ 3. 진행실적 팝업 — '전체 기간 보기' 1월부터 · 연도 머리칸 · 항목 없음 안내 · [적용하기] Point");
const PM = {
    head: (() => { const a = pmSrc.indexOf('const SIMPLE_ITEMS = ['), b = pmSrc.indexOf('\nconst LABEL_COL_W'); return a >= 0 && b > a ? pmSrc.slice(a, b) : null; })(),
    consts: [/^const LABEL_COL_W = [^\n]+/m, /^const TYPE_COL_W\s+= [^\n]+/m, /^const TOTAL_COL_W = [^\n]+/m].map(re => line(pmSrc, re)).join('\n'),
    items: grabTo(pmSrc, '    const isItemOn = ', "    const noItemsOn = SIMPLE_ON.length + SECONDARY_ON.length === 0 && !selfOn && !intOn;"),
    now: grabTo(pmSrc, '    const now0 = new Date();', '    const cy0 = now0.getFullYear(), cm0 = now0.getMonth() + 1;'),
    range: grabTo(pmSrc, '    const { y: allPy, m: allPm } = addMonths(cy0, cm0, -6);', '    const progressPanelW = panelWOf(DISP_WEEKS.length);'),
    years: grabTo(pmSrc, '    const yearGroups = useMemo(() => {', '// eslint-disable-line'),
};
Object.entries(PM).forEach(([k, v]) => ok(!!v && !/^null$/m.test(String(v)), '팝업 원문 조각 찾음: ' + k));
const fixedDate = (iso) => { const t0 = new Date(iso).getTime(); return class extends Date { constructor(...a) { if (a.length) super(...a); else super(t0); } static now() { return t0; } }; };
const popup = ({ today = '2026-09-30T10:00:00+09:00', showAll = true, weekly = {}, progressItems = {}, baseDate = '2026-09' } = {}) => {
    const body = `${PM.head}\n${PM.consts}\nreturn (progressItems, WEEKLY, showAllMonths, baseDate) => {\nconst useState = (v) => [(v && typeof v === 'object' && !('x' in v) && !Object.keys(v).length) ? WEEKLY : v, () => {}];\n${PM.items}\n${PM.now}\n${PM.range}\n${PM.years}\nreturn { DISP_MONTHS, DISP_WEEKS, ALL_WEEKS, yearGroups, noItemsOn, SECONDARY_ON, intOn, selfOn, tableW, progressPanelW };\n};`;
    return new Function('useMemo', 'Date', 'window', body)((fn) => fn(), fixedDate(today), { innerWidth: 1920 })(progressItems, weekly, showAll, baseDate);
};
const ym = (m) => `${m.year}-${String(m.month).padStart(2, '0')}`;
let pp = popup({});
ok(ym(pp.DISP_MONTHS[0]) === '2026-01' && ym(pp.DISP_MONTHS[pp.DISP_MONTHS.length - 1]) === '2027-03', "9/30에 '전체 기간 보기' = 2026년 1월 ~ 2027년 3월 (종전 3월부터 — 팀장님 요청)", [ym(pp.DISP_MONTHS[0]), ym(pp.DISP_MONTHS[pp.DISP_MONTHS.length - 1])]);
ok(pp.DISP_WEEKS.length === pp.ALL_WEEKS.length && pp.DISP_WEEKS[0].key === pp.ALL_WEEKS[0].key, '  └ 보이는 주 = 합계·진척률 계산에 드는 주 전부 (계산 범위와 같음)');
const spanSum = pp.yearGroups.reduce((sm, [y, ms]) => sm + ms.reduce((a, m) => a + (new Date(Number(y), m, 0).getDate() >= 29 ? 5 : 4), 0), 0);
ok(spanSum === pp.DISP_WEEKS.length && J(pp.yearGroups.map(([y]) => y)) === J(['2026', '2027']), `연도 머리칸 = 보이는 주 전부 덮음 (${spanSum}/${pp.DISP_WEEKS.length}칸 · 2026·2027) — 종전: 첫 화면 2개월만 덮어 '합계' 칸이 4월 뒤에 끼고 5월부터 한 칸씩 밀렸음`, pp.yearGroups);
pp = popup({ showAll: false });
ok(J(pp.DISP_MONTHS.map(ym)) === J(['2026-08', '2026-09']) && pp.yearGroups.length === 1, '기본 보기 = 지난달 + 이번 달 그대로 (8·9월)', pp.DISP_MONTHS.map(ym));
pp = popup({ weekly: { plc: { '2025-11-3': 40 } } });
ok(ym(pp.DISP_MONTHS[0]) === '2025-11', '장부에 작년 11월 기록 → 전체 기간 보기가 작년 11월부터 (합계에 드는 칸은 다 보임)', ym(pp.DISP_MONTHS[0]));
pp = popup({ today: '2027-02-10T10:00:00+09:00', baseDate: '2027-02' });
ok(ym(pp.DISP_MONTHS[0]) === '2026-08', '내년 2월에 열면 = 6개월 전(2026-08)부터 — 올해 1월보다 이른 쪽 (종전보다 줄지 않음)', ym(pp.DISP_MONTHS[0]));
ok(popup({ progressItems: { plc: false, etos: false, hmi: false, integratedTest: false, drawing: false, iomap: false, screen: false, baseinfo: false, internalTest: false } }).noItemsOn === true
   && popup({ progressItems: { plc: false } }).noItemsOn === false, "적용 항목이 하나도 없으면 표 위에 '줄이 없는 이유' 안내 (noItemsOn)");
const piAll = L2.naToProgressItems(R({ '진행 현황': '완료' }));
const pk = popup({ progressItems: L2.naToProgressItems(R({ '진행 현황': '완료', HMI: '100', '진행율 %': '100', Point: '4' })) });
ok(J(pk.SECONDARY_ON.map(x => x.key)) === J(['hmi']) && pk.intOn === true && pk.selfOn === false, '001형을 팝업에 넘기면 공정 줄 = HMI만 · 통합시운전 줄 있음 · 자체시운전 없음', pk.SECONDARY_ON.map(x => x.key));
ok(popup({ progressItems: piAll }).noItemsOn === true, '  └ 002형(전부 빈칸) → 줄 없음 + 안내');
const pfm = new Function(grabTo(pmSrc, 'function pointsForMain(', '\n}\n') + '\nreturn pointsForMain;')();
ok(pfm(12, {}, {}, 'intCommissioning') === 12 && pfm(0, { intCommissioning: { '2026-9-1': '5' } }, {}, 'intCommissioning') === ''
   && pfm(0, {}, { intCommissioning: { '2026-9-5': '0' } }, 'intCommissioning') === 0 && pfm(0, {}, {}, 'intCommissioning') === undefined
   && pfm(0, {}, { sub_2_intCommissioning: { '2026-9-5': 0 } }, 'intCommissioning') === 0,
   "[적용하기] 포인트 → 메인표 Point: 값 = 그대로 · 이번에 지워 0 = 빈칸 · 0을 넣음 = 0 · 기록이 한 번도 없음 = 안 건드림 (종전 '0'을 써서 통합시운전이 저절로 켜졌음)");
ok(pmSrc.includes("[...SIMPLE_ITEMS, ...SECONDARY_ITEMS].filter(({ key }) => isItemOn(key)).forEach(({ key }) => {") && pmSrc.includes("'포인트실적': _pts, ...(_pts === undefined ? {} : { '포인트소스': pointSource })"),
   '[적용하기]: 꺼진(메인표 ×) 항목은 메인표에 안 씀 · 포인트 기록 없으면 포인트실적·소스도 안 씀');

// ═══ 4. 모바일 [적용하기] (MobileInputScreen 원문) — 가짜 서버 ══════════════════════
console.log('\n■ 4. 모바일 [적용하기] — PC와 같은 저장 (바뀐 칸만 · NAS 칸 제외 · Point·진행율 %)');
const apSrc = grabTo(mobSrc, '    const applyToMain = async (team, rowId, mainTable, subs) => {', '\n    };');
ok(!!apSrc, '원문 조각 찾음: applyToMain');
const normM = new Function(line(mobSrc, /^const norm = [^\n]+/m) + '\nreturn norm;')();
const runMob = async ({ loaded, server, mainTable, subs }) => {
    const calls = [];
    const fn = new Function('teamData', 'getDoc', 'rowDocRef', 'getTeamProfile', 'norm', 'extLockedColsMainOf', 'setDoc', 'user', 'logAudit', 'AUDIT_ACTIONS', 'pickProjectName', 'setToast', 'loadTeam', 'setTimeout',
        apSrc + '\nreturn applyToMain;')(
        { 기술2팀: { headers: H2, rows: [loaded] } },
        async () => ({ exists: () => !!server, data: () => server }), (t, id) => ({ t, id }), getTeamProfile, normM, U.extLockedColsMainOf,
        async (ref, data, opt) => { calls.push({ ref, data, opt }); }, { email: 'test@x' }, () => {}, { EDIT: 'edit' }, () => '', () => {}, () => {}, () => {});
    await fn('기술2팀', loaded._id, mainTable, subs);
    return calls;
};
(async () => {
    const loaded = R({ _id: 'M1', HMI: '50', 포인트: '200', 내용: '옛 내용', _changeHistory: [] });
    let calls = await runMob({ loaded, server: { ...loaded, 내용: '다른 사람이 방금 고침' }, mainTable: { HMI: '80', '포인트실적': '10', '포인트소스': 'int', 통합시운전: 5 } });
    const d0 = calls[0] && calls[0].data;
    ok(calls.length === 1 && calls[0].opt && calls[0].opt.merge === true && d0.HMI === '80' && d0.Point === '10' && d0['진행율 %'] === '5' && !('내용' in d0) && !('Project' in d0),
       '바뀐 칸만 merge: HMI 80 · Point 10 · 진행율 % = 10 ÷ 200 = 5 · 다른 사람이 고친 내용은 안 덮음 (종전: 불러온 사본 통째 저장)', d0);
    ok(Array.isArray(d0 && d0._changeHistory) && d0._changeHistory.length === 1 && d0._updatedBy === 'test@x', '  └ 변경 이력 1건 + 수정 도장');
    const nasRow = R({ _id: 'M2', PLC: '98.6', HMI: '57.9', '진행율 %': '45.8', Point: '563', _extSync: nas010._extSync });
    calls = await runMob({ loaded: nasRow, server: nasRow, mainTable: { PLC: '50', HMI: '10', '포인트실적': '999', '포인트소스': 'int' } });
    const d1 = calls[0] && calls[0].data;
    ok(calls.length === 1 && !('PLC' in d1) && !('HMI' in d1) && !('Point' in d1) && !('진행율 %' in d1) && d1['포인트실적'] === '999', 'NAS 행(010형): PLC·HMI·Point·진행율 % = NAS 칸이라 안 씀 (PC와 같음)', d1);
    calls = await runMob({ loaded, server: loaded, mainTable: { HMI: '50', '포인트실적': undefined } });
    ok(calls.length === 0, '바뀐 값 없음 → 저장 안 함 · 포인트실적 undefined(기록 없음) → Point 안 건드림');
    const par = R({ _id: 'M3', 포인트: '', Point: '', HMI: '1' });
    calls = await runMob({ loaded: par, server: par, mainTable: { '포인트실적': '30' }, subs: [{ pt: 100 }, { pt: 50 }] });
    ok(calls.length === 1 && calls[0].data.Point === '30' && calls[0].data['진행율 %'] === '20', '총점 빈칸 부모 행 = 하위 합(150)으로 진행율 % (30 ÷ 150 = 20 — PC effTotalPt와 같음)', calls[0] && calls[0].data);
    const old25 = { _id: 'M4', _year: '2025', 번호: '1', 누적: '', 진행현황: '진행' };
    calls = await runMob({ loaded: old25, server: old25, mainTable: { '포인트실적': '7' } });
    ok(calls.length === 1 && !('Point' in calls[0].data) && !('진행율 %' in calls[0].data), '옛 양식 지난 연도 행(Point 칸 없음) = Point·진행율 %를 새로 만들지 않음', calls[0] && calls[0].data);

    // ═══ 5. 연결 확인 ═══════════════════════════════════════════════════════════
    console.log('\n■ 5. 연결 확인 (원문 문자열)');
    ok(src.includes("backupStatusRef, emptyProgOffOf, mainBaseOf, handPctTarget, handPointTarget, isClosedStatusVal } from './projectListData';") &&src.includes("const emptyOff = (fmCum && fmActive(row) && !isSubListRow(row)) ? t1EmptyOffOf(row) : genericEmptyOffOf(row);"),
       'List naToProgressItems = 기술1팀 누계는 t1EmptyOffOf(9/29 그대로) · 그 밖 팀 = 공용 emptyProgOffOf');
    ok(src.includes('progSwitch={progSwitchOf(detailRow)}') && src.includes('progSwitch={progSwitchOf(addingRow)}') && src.split("intColAlias={teamProfile?.시운전?.통합열 || null}").length - 1 === 2
       && src.includes('autoLockTip={autoLockTipOf(detailRow)}') && src.includes('autoLockTip={autoLockTipOf(addingRow)}'), '상세 보기·추가 팝업: 스위치 규칙·통합열 별칭·자동 칸 안내 전달');
    ok(src.includes('if (baseRow) blankProgressCopyOf(newRow);') && src.includes('                blankProgressCopyOf(newRow); // 기술2·3팀 등'), '행 복사 두 경로(우클릭 복사·Ctrl+V) 다 진행 값 비움');
    const saSrc = grabTo(src, '    const saveAddingRow = async () => {', '\n    };'), sdSrc = grabTo(src, '    const saveDraft = async (force = false) => {', '\n    };');
    ok(!!saSrc && saSrc.includes('paRecalc(rowToAdd)') && saSrc.includes('await queueLedger(() => syncAccPointToLedger({ _id, ...data }, h, v));') && saSrc.includes('if (!t1Add && !isSubListRow(rowToAdd)) for (const h of (activeHeaders || [])) {'),
       '[추가] 저장(기술2·3팀): 진행율 % 계산 + 친 PLC·ETOS·HMI·Point = 진행실적 장부에도');
    ok(!!sdSrc && sdSrc.includes('paRecalc(fin0)') && sdSrc.includes('if (!t1New && !isSubListRow(fin0)) for (const k of Object.keys(edited)) {') && sdSrc.includes('await queueLedger(() => syncAccPointToLedger({ _id: id, ...patchN }, k, edited[k]));'),
       '노란 새 행 [저장](기술2·3팀): 진행율 % + 친 진행 값 = 장부에도 (기존 행 [저장]과 같은 함수)');
    ok(src.includes('const vals = useCols.filter(c => !isNaItemCell(r, c)).map('), '상단 요약 평균 공정률: 스위치로 끈 칸(값 보관)은 평균에서 뺌');
    ok(mobSrc.includes('naProgressItemsOf(progress.row, null, sv.통합열, { gray: grayEmptyTestOf(pf), intCols: sv.통합열 ? [sv.통합열, sv.누적열].filter(Boolean) : [] })') && mobSrc.includes('applyToMain(progress.team, rowId, data?.mainTable, progress.subs)'),
       '모바일: 팝업 항목 = PC와 같은 함수 · [적용하기]에 하위 행(총점 합) 전달');
    ok(!mobSrc.includes('...rest, ...patch') && mobSrc.includes('}, { merge: true });'), '모바일 저장 = merge (행 사본 통째 쓰기 폐지)');
    ok(dmSrc.includes("title={autoLockTip || '자동 계산 칸 — PLC·ETOS·HMI·총물량은 직접 입력, 시운전 포인트는 진행실적 팝업에서 넣으면 따라 바뀝니다'}"), '상세 보기 자동 칸 안내 = 팀별 문구 (없으면 기술1팀 문구 그대로)');

    // ═══ 7. 사람이 친 진행 값 → 장부 날짜 (2026-09-30 오후) ═════════════════════════
    console.log('\n■ 7. 사람이 친 진행 값 — 끝난 프로젝트는 새 날짜 안 만듦 · 같은 값·0은 안 씀 · 기록 없는 항목 = 메인표 값이 합계 (기술2·3팀)');
    const HP = {
        rule: between(pldSrc, 'export const CLOSED_STATUSES = ', '// 장부에 주차 기록이 없는 항목의'),
        base: grabTo(pldSrc, 'export function mainBaseOf(', '\n}\n'),
    };
    Object.entries(HP).forEach(([k, v]) => ok(!!v, '원문 조각 찾음: ' + k));
    const H7 = new Function(Object.values(HP).map(v => String(v).replace(/^export /gm, '')).join('\n') + '\nreturn { isClosedStatusVal, handPctTarget, handPointTarget, mainBaseOf };')();
    // 7-1 규칙 함수
    const T7 = (w, n, c) => J(H7.handPctTarget(w, n, c, 2026, 9));
    ok(T7({}, 100, true) === '{"skip":true}', '완료 + ETOS 기록 없음 + 메인표 100 → 장부에 안 씀 (메인표 값이 합계 — 종전: 이번 주 9월 5주에 100 = 캡쳐의 굵은 100)');
    ok(T7({ '2026-3-5': 100 }, 100, true) === '{"skip":true}' && T7({ '2026-3-5': 100 }, 100, false) === '{"skip":true}', '장부 합계(3월 100)와 같은 값 → 안 씀 (완료·진행 중 모두 — 종전: 오늘 날짜로 또 100)');
    ok(T7({ '2026-3-5': 90 }, 100, true) === '{"wk":"2026-3-5"}', '완료 + 3월 90 → 메인표 100: 3월 5주 칸 값만 고침 (새 날짜 없음)');
    ok(T7({ '2026-3-5': 90, '2026-6-2': 95 }, 80, true) === '{"wk":"2026-6-2"}', '  └ 기록이 여럿이면 마지막 기록 칸 (합계를 만드는 칸)');
    ok(T7({}, 0, false) === '{"skip":true}' && T7({}, 0, true) === '{"skip":true}', '기록 없는 항목에 0 (항목만 켜려고 친 0) → 안 씀 — 나중 팝업 입력을 가리지 않게');
    ok(T7({}, 30, false) === '{}' && T7({ '2026-8-4': 60 }, 70, false) === '{}', '진행 중 + 새 값 → 종전대로 이번 주 칸 (오늘 진행한 것)');
    ok(T7({ '2026-11-1': 50 }, 50, true) === '{"skip":true}' && T7({ '2026-11-1': 50 }, 40, true) === '{"wk":"2026-11-1"}', '완료 + 다음 달 뒤 기록만 있음: 같은 값 = 안 씀 · 다르면 그 칸');
    const PT7 = (w, n, c) => J(H7.handPointTarget(w, n, c));
    ok(PT7({}, 4, true) === '{"skip":true}' && PT7({ '2026-3-5': 4 }, 4, true) === '{"skip":true}' && PT7({ '2026-3-5': 4 }, 4, false) === '{"skip":true}',
       'Point: 완료 + 기록 없음 = 안 씀 · 장부 합과 같은 값 = 안 씀 (종전: 이번 주 칸에 0점을 새로 적음)');
    ok(PT7({ '2026-3-5': 4 }, 6, true) === '{"wk":"2026-3-5","val":6}' && PT7({ '2026-2-1': 3, '2026-3-5': 4 }, 5, true) === '{"wk":"2026-3-5","val":2}', 'Point 완료: 마지막 기록 칸에서 늘리거나 줄임 (4→6 · 3+4→5 = 3월 5주가 2)');
    ok(PT7({ '2026-2-1': 3, '2026-3-5': 4 }, 2, true) === '{"block":true,"sum":3,"cur":4,"wk":"2026-3-5"}', '  └ 그 전 주차 합(3)보다 작게(2) = 막음 (주간 기록 어긋남)');
    ok(PT7({}, 0, false) === '{"skip":true}' && PT7({}, 10, false) === '{}' && PT7({ '2026-8-4': 5 }, 9, false) === '{}', 'Point 진행 중: 0 = 안 씀 · 새 값 = 종전대로 이번 주 증분');
    ok(['완료', ' 완 료 ', '취소', '삭제'].every(H7.isClosedStatusVal) && !['진행중', '추진중', 'Hold', 'HOLD', '', 'sub'].some(H7.isClosedStatusVal), '끝난 프로젝트 = 진행 현황 완료·취소·삭제 (진행중·추진중·Hold·하위는 아님)');
    const mb001 = H7.mainBaseOf(R({ '진행 현황': '완료', ETOS: '100', HMI: '100', 포인트: '4', '진행율 %': '100', Point: '4' }), H2, t3);
    ok(J(mb001) === J({ etos: 100, hmi: 100, intCommissioning: 4 }) && J(H7.mainBaseOf(R({ HMI: '84%' }), H2, t2)) === J({ hmi: 84 }),
       "기준값(mainBaseOf) = 메인표 값: ETOS·HMI % · Point → 통합시운전 · '84%' → 84 · 빈칸(PLC)은 없음 — 기술2·3팀 같은 함수", mb001);
    ok(!!getTeamProfile('기술1팀').수식 && J(H7.mainBaseOf(R({ ETOS: '100' }), H2, getTeamProfile('기술1팀'))) === '{}' && J(H7.mainBaseOf(null, H2, t2)) === '{}', '  └ 기술1팀(누계 수식 팀) = 기준값 안 씀 — 1팀 규칙 그대로');

    // 7-2 List 원문 장부 쓰기 (가짜 서버, 오늘 = 2026-09-30 = 9월 5주)
    const LG = {
        key: line(src, /    const PROG_COL_TO_KEY = [^\n]+/) + '\n' + line(src, /    const progItemKeyOf = [^\n]+/),
        closed: line(src, /    const isRowClosed = [^\n]+/),
        pct: grabTo(src, '    const syncProgressCellToLedger = async (', "console.warn('[reverseSync] progressRecords 반영 실패:', e); }\n    };"),
        acc: grabTo(src, '    const isAccPointCol = (h) =>', "console.warn('[accSync] Point→장부 반영 실패:', e); }\n        return { ok: true };\n    };"),
        msg: line(src, /    const accSyncBlockMsg = [^\n]+/),
    };
    Object.entries(LG).forEach(([k, v]) => ok(!!v && !/^null$/m.test(String(v)), 'List 원문 조각 찾음: ' + k));
    const mkLedger = (team, prof, fmCfg = null) => {
        const server = {}, writes = [];
        const env = {
            db: {}, appId: 'app', currentTeam: team, teamProfile: prof, fmCfg, fmCum: false,
            fmActive: () => false, t1IsDone: () => false, t1EndYmd: () => '', t1WeekKeyOfYmd: () => null, t1RefYm: () => '2026-09',
            isSubListRow: L2.isSubListRow, aliasCol: (nm) => H2.find(h => fmNorm(h) === fmNorm(nm)) || null,
            isClosedStatusVal: H7.isClosedStatusVal, handPctTarget: H7.handPctTarget, handPointTarget: H7.handPointTarget,
            doc: (_db, ...p) => ({ id: p[p.length - 1] }),
            getDoc: async (ref) => ({ exists: () => !!server[ref.id], data: () => JSON.parse(JSON.stringify(server[ref.id])) }),
            setDoc: async (ref, data) => { server[ref.id] = JSON.parse(JSON.stringify(data)); writes.push({ id: ref.id, weekly: JSON.parse(JSON.stringify(data.weekly || {})) }); },
            ledgerFreshRef: { current: {} }, progressRecordsMap: null, onProgressSaved: () => {}, Date: fixedDate('2026-09-30T10:00:00+09:00'),
        };
        const names = Object.keys(env);
        const fns = new Function(...names, `${LG.key}\n${LG.closed}\n${LG.pct}\n${LG.acc}\n${LG.msg}\nreturn { syncProgressCellToLedger, syncAccPointToLedger, accSyncBlockMsg };`)(...names.map(k => env[k]));
        return Object.assign(fns, { server, writes, clearFresh: () => { env.ledgerFreshRef.current = {}; } });
    };
    const row001 = (o) => R({ _id: 'r001', _pid: 'P001', '진행 현황': '완료', ...o });
    const r014 = (o) => R({ _id: 'r014', _pid: 'P014', '진행 현황': '진행중', ...o });
    let lg = mkLedger('기술3팀', t3);
    await lg.syncProgressCellToLedger(row001({ ETOS: '100' }), 'ETOS', '100');
    ok(lg.writes.length === 0, '① 완료 001 — 메인표 ETOS × 칸에 100 키인 [저장] → 장부에 안 씀 (종전: 9월 5주에 100)', lg.writes);
    lg.server.P001 = { weekly: { etos: { '2026-3-5': 100 }, hmi: { '2026-3-5': 100 } } }; lg.clearFresh();
    await lg.syncProgressCellToLedger(row001({ ETOS: '100' }), 'ETOS', '100');
    ok(lg.writes.length === 0, '② 팝업 3월 5주 100 [적용하기] 뒤 같은 값 [저장] → 안 씀 (종전: 오늘 날짜로 또 100 — "현재 당일 또 넣어버리고")');
    await lg.syncProgressCellToLedger(row001({ ETOS: '90' }), 'ETOS', '90');
    ok(lg.writes.length === 1 && J(lg.server.P001.weekly.etos) === J({ '2026-3-5': 90 }) && J(lg.server.P001.weekly.hmi) === J({ '2026-3-5': 100 }), '③ 완료에서 메인표 값을 고침(100→90) → 3월 5주 칸만 90 · 다른 항목 그대로 (새 날짜 없음)', lg.server.P001.weekly);
    await lg.syncProgressCellToLedger(row001({ ETOS: '' }), 'ETOS', '');
    ok(!('etos' in lg.server.P001.weekly) && J(lg.server.P001.weekly.hmi) === J({ '2026-3-5': 100 }), '④ Del(지우기) = 그 항목 기록 전부 지움 — 종전(9/1 "메인표에서 지우면 팝업도 빈칸") 그대로');
    lg = mkLedger('기술3팀', t3);
    await lg.syncProgressCellToLedger(row001({ '진행 현황': '취소', PLC: '30' }), 'PLC', '30');
    ok(lg.writes.length === 0, '⑤ 취소 프로젝트도 끝난 프로젝트 — 기록 없이 PLC 30 → 장부에 안 씀');
    await lg.syncProgressCellToLedger(r014({ HMI: '0' }), 'HMI', '0');
    ok(lg.writes.length === 0, '⑥ 진행 중 — 기록 없는 HMI에 0 (항목만 켬) → 안 씀');
    await lg.syncProgressCellToLedger(r014({ HMI: '75' }), 'HMI', '75');
    ok(lg.writes.length === 1 && J(lg.server.P014.weekly.hmi) === J({ '2026-9-5': 75 }), '⑦ 진행 중 — HMI 75 키인 → 이번 주(9월 5주) 칸 (종전 규칙 그대로 = 오늘 진행한 것)', lg.server.P014 && lg.server.P014.weekly);
    await lg.syncProgressCellToLedger(r014({ HMI: '75' }), 'HMI', '75');
    ok(lg.writes.length === 1, '  └ 같은 값 다시 [저장] → 안 씀');
    await lg.syncProgressCellToLedger(r014({ '진행 현황': 'Hold', HMI: '80' }), 'HMI', '80');
    ok(lg.writes.length === 2 && J(lg.server.P014.weekly.hmi) === J({ '2026-9-5': 80 }), '  └ Hold = 진행 중과 같음 (이번 주 칸)', lg.server.P014.weekly.hmi);
    lg = mkLedger('기술2팀', t2);
    await lg.syncProgressCellToLedger(row001({ _pid: 'P011', PLC: '98.6' }), 'PLC', '98.6', undefined, { atNow: true });
    ok(lg.writes.length === 1 && J(lg.server.P011.weekly.plc) === J({ '2026-9-5': 98.6 }), '⑧ NAS 자동 반영·[진행실적 심기](atNow) = 완료여도 종전대로 이번 주 (파일·확인창의 지금 값)', lg.server.P011 && lg.server.P011.weekly);
    lg = mkLedger('기술1팀', getTeamProfile('기술1팀'), { 방식: '누계' });
    await lg.syncProgressCellToLedger(row001({}), 'PLC', '50');
    ok(lg.writes.length === 1 && J(lg.server.P001.weekly.plc) === J({ '2026-9-5': 50 }), '⑨ 기술1팀(수식 팀) = 이 규칙 안 탐 — 1팀은 누계·종료 주 규칙이 따로 (9/29 그대로)');
    // Point
    lg = mkLedger('기술3팀', t3);
    let a7 = await lg.syncAccPointToLedger(row001({ Point: '4' }), 'Point', '4');
    ok(a7.ok && lg.writes.length === 0, 'Point 완료 001 — 기록 없이 Point 4 → 장부에 안 씀 (메인표 Point가 합계)');
    lg.server.P001 = { weekly: { intCommissioning: { '2026-3-5': 4 } } }; lg.clearFresh();
    a7 = await lg.syncAccPointToLedger(row001({ Point: '4' }), 'Point', '4');
    ok(a7.ok && lg.writes.length === 0, '  └ 팝업 3월 4점 뒤 같은 Point 4 [저장] → 안 씀 (종전: 9월 5주에 0점을 새로 적음)');
    a7 = await lg.syncAccPointToLedger(row001({ Point: '6' }), 'Point', '6');
    ok(a7.ok && J(lg.server.P001.weekly.intCommissioning) === J({ '2026-3-5': 6 }), '  └ Point 6으로 고침 → 3월 5주 칸이 6 (새 날짜 없음)', lg.server.P001.weekly.intCommissioning);
    lg.server.P001 = { weekly: { intCommissioning: { '2026-2-1': 3, '2026-3-5': 4 } } }; lg.clearFresh();
    const w7 = lg.writes.length;
    a7 = await lg.syncAccPointToLedger(row001({ Point: '2' }), 'Point', '2');
    ok(!a7.ok && a7.wk === '2026-3-5' && lg.writes.length === w7 && lg.accSyncBlockMsg(2, a7.sum, a7.cur, a7.wk).includes('(마지막 기록 주(3월 5주) 4점 포함 총 7점)'),
       '  └ 그 전 주차 합(3)보다 작게(2) → 저장 막음 + 안내 "마지막 기록 주(3월 5주) 4점 포함 총 7점"', a7);
    a7 = await lg.syncAccPointToLedger(row001({ Point: '9' }), 'Point', '9', { checkOnly: true });
    ok(a7.ok && lg.writes.length === w7, '  └ 노란 칸 단계(checkOnly) = 검사만 · 쓰기 없음');
    lg = mkLedger('기술3팀', t3);
    lg.server.P014 = { weekly: { intCommissioning: { '2026-8-4': 5 } } };
    a7 = await lg.syncAccPointToLedger(r014({ Point: '5' }), 'Point', '5');
    ok(a7.ok && lg.writes.length === 0, 'Point 진행 중 — 장부 합(5)과 같은 값 → 안 씀 (종전: 이번 주에 0점)');
    a7 = await lg.syncAccPointToLedger(r014({ Point: '9' }), 'Point', '9');
    ok(a7.ok && J(lg.server.P014.weekly.intCommissioning) === J({ '2026-8-4': 5, '2026-9-5': 4 }), 'Point 진행 중 — 9 → 이번 주 증분 4 (종전 규칙 그대로)', lg.server.P014.weekly.intCommissioning);
    ok(lg.accSyncBlockMsg(3, 5, 1).includes('(이번 주 1점 포함 총 6점)') && lg.accSyncBlockMsg(3, 5, 1).includes('지난 주차까지 5점'), '  └ 진행 중 막음 안내 = 종전 문구 그대로 ("이번 주")');

    // 7-3 진행실적 팝업 원문 (합계·진척률·[적용하기]) — 기준값
    const PM7 = {
        base: grabTo(pmSrc, '    const { y: allPy, m: allPm } = addMonths(cy0, cm0, -6);', '    const { y: allNy, m: allNm } = addMonths(cy0, cm0, 6);'),
        range: grabTo(pmSrc, '    const ALL_WEEKS = (() => {', '\n    })();'),
        helpers: grabTo(pmSrc, '    const hasRecIn = (w, key) =>', "    const BASE_TIP = '"),
        apply: grabTo(pmSrc, '    const computeApplyData = () => {', '\n    };\n'),
        calc: grabTo(pmSrc, '    const [refY, refM] = ', '    }, [weeklyData, totalPt, subRows, refWKey, progressItems, sumAsPct, mainBase, savedWeekly]); // eslint-disable-line'),
    };
    Object.entries(PM7).forEach(([k, v]) => ok(!!v, '팝업 원문 조각 찾음: ' + k));
    const popCalc = ({ progressItems = {}, weekly = {}, saved, mainBase = null, totalPt = 0, subRows = [], baseDate = '2026-09' }) => {
        const helpers = PM7.helpers.replace(/    const BASE_TIP = '$/, '');
        const body = `${PM.head}\nreturn (progressItems, weeklyData, savedWeekly, mainBase, totalPt, subRows, baseDate, sumAsPct) => {\n${PM.items}\n${PM.now}\n${PM7.base}\n${PM7.range}\n${helpers}\n${PM7.apply}\n${PM7.calc}\nreturn { itemFinalPct, overallPct, pctByWeek, baseOf, computeApplyData, refWKey };\n};`;
        return new Function('useMemo', 'Date', body)((fn) => fn(), fixedDate('2026-09-30T10:00:00+09:00'))(progressItems, weekly, saved === undefined ? weekly : saved, mainBase, totalPt, subRows, baseDate, false);
    };
    const pi001 = L3.naToProgressItems(R({ '진행 현황': '완료', ETOS: '100', HMI: '100', 포인트: '4', '진행율 %': '100', Point: '4' })) || {};
    const led001 = { hmi: { '2026-3-5': 100 }, intCommissioning: { '2026-3-5': 4 } };
    let pc = popCalc({ progressItems: pi001, weekly: led001, mainBase: mb001, totalPt: 4 });
    ok(pc.itemFinalPct('etos') === 100 && pc.overallPct === 100 && pc.pctByWeek['2026-3-5'] === 100, '팝업: ETOS 기록 없음 → 합계 = 메인표 100 (회색 기울임) · 진척률 100 · 3월 5주 진척률 100 (종전: ETOS 0 → 66.7)', [pc.itemFinalPct('etos'), pc.overallPct, pc.pctByWeek['2026-3-5']]);
    let ad7 = pc.computeApplyData();
    ok(ad7 && ad7.mainTable.ETOS === undefined && ad7.mainTable.HMI === 100, '  └ [적용하기]: 기록 없는 ETOS는 메인표에 안 씀 (메인표 100 그대로) · HMI = 기록 100', ad7 && ad7.mainTable);
    pc = popCalc({ progressItems: pi001, weekly: { ...led001, etos: { '2026-3-5': 100 } }, saved: led001, mainBase: mb001, totalPt: 4 });
    ad7 = pc.computeApplyData();
    ok(pc.itemFinalPct('etos') === 100 && ad7.mainTable.ETOS === 100 && pc.overallPct === 100, '팝업 3월 5주 ETOS 100 → 합계 100 · [적용하기] 메인표 ETOS = 100 (3월 기록이 합계)', ad7.mainTable);
    pc = popCalc({ progressItems: pi001, weekly: { ...led001, etos: { '2026-3-5': 80 } }, saved: led001, mainBase: mb001, totalPt: 4 });
    ok(pc.itemFinalPct('etos') === 80 && pc.computeApplyData().mainTable.ETOS === 80, '  └ 3월에 80을 넣으면 합계·메인표 = 80 (기록이 생기면 메인표 기준값은 안 씀)', pc.itemFinalPct('etos'));
    pc = popCalc({ progressItems: pi001, weekly: led001, saved: { ...led001, etos: { '2026-3-5': 100 } }, mainBase: mb001, totalPt: 4 });
    ok(pc.itemFinalPct('etos') === 0 && pc.computeApplyData().mainTable.ETOS === '', '  └ 열 때 있던 ETOS 기록을 다 지움 → 기준값이 되살아나지 않음 · [적용하기] = 메인표 빈칸 (지우기 동기화 9/1 그대로)', [pc.itemFinalPct('etos'), pc.computeApplyData().mainTable.ETOS]);
    pc = popCalc({ progressItems: pi001, weekly: { hmi: { '2026-3-5': 100 } }, mainBase: mb001, totalPt: 4 });
    ad7 = pc.computeApplyData();
    ok(pc.itemFinalPct('intCommissioning') === 100 && ad7.mainTable['통합시운전'] === undefined && pfm(ad7.accIntPts || 0, { hmi: { '2026-3-5': 100 } }, { hmi: { '2026-3-5': 100 } }, 'intCommissioning') === undefined,
       '통합시운전 기록 없음 → 합계 = 메인표 Point 4 (4÷4 = 100%) · [적용하기]는 진행율 %·Point를 안 건드림', [pc.itemFinalPct('intCommissioning'), ad7.mainTable]);
    ok(popCalc({ progressItems: pi001, weekly: led001, totalPt: 4 }).itemFinalPct('etos') === 0, 'mainBase를 안 주는 곳(월간보고 화면 등) = 종전 그대로 (기록 없음 = 0)');
    pc = popCalc({ progressItems: pi001, weekly: {}, mainBase: mb001, totalPt: 4, subRows: [{ pt: 4 }] });
    ok(pc.baseOf('intCommissioning') === 0 && pc.baseOf('etos') === 100, '하위(공종) 있는 부모 = 시운전 기준값 안 씀 (하위별 장부가 원장) · 공정 % 기준값은 씀');

    // 7-4 캡쳐 순서 그대로 (기술3팀 001 완료): 메인표 ETOS 100 키인 [저장] → 팝업 3월 5주 100 [적용하기] → 노란 칸 [저장] 한 번 더
    lg = mkLedger('기술3팀', t3);
    lg.server.P001 = { weekly: JSON.parse(J(led001)) };
    await lg.syncProgressCellToLedger(row001({ ETOS: '100', HMI: '100', 포인트: '4', Point: '4' }), 'ETOS', '100');       // 메인표 키인 [저장]
    const onOpen = JSON.parse(J(lg.server.P001.weekly));
    const pcOpen = popCalc({ progressItems: pi001, weekly: onOpen, mainBase: mb001, totalPt: 4 });
    const weeklyAfter = { ...onOpen, etos: { '2026-3-5': 100 } };                                                        // 팝업 3월 5주에 100
    const pcAp = popCalc({ progressItems: pi001, weekly: weeklyAfter, saved: onOpen, mainBase: mb001, totalPt: 4 });
    lg.server.P001 = { weekly: weeklyAfter }; lg.clearFresh();                                                            // [적용하기] = 장부 저장
    await lg.syncProgressCellToLedger(row001({ ETOS: '100' }), 'ETOS', '100');                                           // 노란 칸 [저장] (같은 값)
    ok(!('etos' in onOpen) && pcOpen.itemFinalPct('etos') === 100 && pcAp.computeApplyData().mainTable.ETOS === 100 && J(lg.server.P001.weekly.etos) === J({ '2026-3-5': 100 }),
       '캡쳐 순서 재현 → 장부 ETOS = 3월 5주 100 하나뿐 (9월 5주 없음) · 팝업 열자마자 합계 100 · [적용하기] 메인표 100', lg.server.P001.weekly);

    // 7-5 실적 그래프 (App.js 원문 getRecordMonthlyProgress) — 기록 없는 항목 = 메인표 값
    const GR = {
        keys: line(appSrc, /^  const PROGRESS_KEYS = [^\n]+/m),
        applied: grabTo(appSrc, '  const getAppliedKeys = (p) => {', '\n  };'),
        prog: grabTo(appSrc, '  const getRecordMonthlyProgress = (p, totalPt) => {', '\n      return result;\n  };'),
    };
    Object.entries(GR).forEach(([k, v]) => ok(!!v && !/^null$/m.test(String(v)), '그래프 원문 조각 찾음: ' + k));
    const graphOf = (rec, p, totalPt) => new Function('progressRecordsMap', 'DEFAULT_PROGRESS_ITEMS', 'getTeamProfile', 'currentTeam',
        `${GR.keys}\n${GR.applied}\n${GR.prog}\nreturn getRecordMonthlyProgress;`)({ P001: rec }, { plc: true, etos: true, hmi: true, internalTest: true, integratedTest: true }, getTeamProfile, '기술3팀')(p, totalPt);
    const gp = { pid: 'P001', _year: '2026', progressItems: pi001, mainBase: mb001 };
    ok(J(graphOf({ weekly: led001 }, gp, 4)) === J({ '2026-03': 100 }), '그래프 3월 공정률 = 100 (ETOS 기록 없음 → 메인표 100 · HMI 100 · 통합 4÷4) — 팝업 진척률과 같음', graphOf({ weekly: led001 }, gp, 4));
    ok(J(graphOf({ weekly: led001 }, { ...gp, mainBase: undefined }, 4)) === J({ '2026-03': 67 }), '  └ 기준값을 안 주면(종전) ETOS 0 → 67 — 이번에 고친 어긋남');
    ok(J(graphOf({ weekly: { ...led001, etos: { '2026-3-5': 50 } } }, gp, 4)) === J({ '2026-03': 83 }), '  └ ETOS 기록이 있으면 기록(50)이 우선 → (50+100+100)÷3 = 83');

    // 7-6 연결 확인
    ok(src.includes('if (!fmCfg && !forceItemKey && !opts.atNow && !isClear) {') && src.includes('const hp = handPointTarget(iw, num, isRowClosed(row));'), 'List 장부 쓰기 두 함수 = 사람 입력 규칙 (수식 팀·NAS 제외)');
    ok(src.split('undefined, { atNow: true })').length - 1 === 4, 'NAS 자동 반영 3곳 + [진행실적 심기] 1곳 = atNow (종전대로 이번 주)');
    ok(src.split('accSyncBlockMsg(').length - 1 === 3 && src.split(', accR.wk)').length - 1 === 3, 'Point 막음 안내 3곳 = 마지막 기록 주 전달');
    ok(src.includes('mainBase={mainBaseOf(progressRow, activeHeaders, teamProfile)}') && src.includes('mainBase: mainBaseOf(row, activeHeaders, teamProfile),'), 'List → 진행실적 팝업·실적 그래프에 기준값 전달');
    ok(mobSrc.includes('mainBase={mainBaseOf(progress.row, teamData[progress.team]?.headers, getTeamProfile(progress.team))}'), '모바일 진행실적 팝업에도 기준값 (PC와 같은 함수)');
    ok(pmSrc.split('const showPrev = useMax && !hasVal && prevVal > 0 && !baseOf(itemKey);').length - 1 === 2 && pmSrc.includes('title={baseOnly ? BASE_TIP : undefined}'), '팝업: 기준값은 회색 힌트로 안 그림(표·모바일) · 합계 칸 회색 기울임 + 안내');

    // ═══ 6. (선택) 실제 백업으로 전수 대조 ═══════════════════════════════════════
    const DATA = (process.env.PROG_SYNC_DATA || '').split(';').map(x => x.trim()).filter(Boolean);
    if (DATA.length) {
        console.log('\n■ 6. 실제 백업 전수 대조 — 2026 메인 행 전부: 메인표 × = 팝업 줄 없음 = 상세 보기 꺼짐 = 모바일');
        for (const f of DATA) {
            const j = JSON.parse(fs.readFileSync(f, 'utf8'));
            const prof = getTeamProfile(j.team);
            const hdr = (j.meta && j.meta.byYear && j.meta.byYear['2026'] && j.meta.byYear['2026'].headers) || (j.meta && j.meta.headers) || H2;
            const L = mkList(prof, hdr);
            const grp = (j.meta && j.meta.byYear && j.meta.byYear['2026'] && j.meta.byYear['2026'].colGroups) || (j.meta && j.meta.colGroups) || G2;
            const rows = (j.rows || []).filter(r => String(r._year) === '2026' && !L.isSubListRow(r));
            let n = 0, badRows = [], changed = 0;
            rows.forEach(r => {
                const pi = L.naToProgressItems(r) || {};
                const piM = U.naProgressItemsOf(r, null, prof.시운전.통합열, { gray: U.grayEmptyTestOf(prof), intCols: [prof.시운전.통합열, prof.시운전.누적열] }) || {};
                const html = renderToStaticMarkup(React.createElement(DM, { detailRow: r, setDetailRow: () => {}, onSave: () => {}, activeHeaders: hdr, activeColGroups: grp, mainVisibleHeaders: hdr,
                    cardDefaultOff: [], currentTeam: j.team, progSwitch: L.progSwitchOf(r), intColAlias: prof.시운전.통합열, autoLockedCols: L.autoLockedColsOf(r), extLockedCols: U.extLockedColsMainOf(r, prof) }));
                const bad = [];
                Object.entries(ITEM_COLS).forEach(([k, cols]) => {
                    const cs = cols.filter(c => hdr.includes(c)); if (!cs.length) return;
                    const mainOn = cs.some(c => !cellOf(L, r, c).cellOff);
                    const dmOn = cs.some(c => { const x = swOnOf(html, c); return x && x.on; });
                    if ((pi[k] !== false) !== mainOn) bad.push(k + ' 팝업≠메인표');
                    if ((pi[k] !== false) !== (piM[k] !== false)) bad.push(k + ' 모바일≠PC');
                    if ((pi[k] !== false) !== dmOn) bad.push(k + ' 상세 보기≠팝업');
                });
                if (Object.keys(pi).some(k => ['plc', 'etos', 'hmi', 'integratedTest'].includes(k) && pi[k] === false)) changed++;
                n++; if (bad.length) badRows.push(`${r['번호']}: ${bad.join(', ')}`);
            });
            ok(!badRows.length, `${j.team} ${path.basename(f)} — 2026 메인 ${n}건 전부 네 화면 일치 (빈 항목이 팝업에서 빠지는 행 ${changed}건)`, badRows.slice(0, 8));
        }
    } else console.log('\n(6. 실제 백업 전수 대조는 PROG_SYNC_DATA=백업JSON경로 를 주면 실행)');

    console.log(`\n결과: ${pass}/${pass + fail} 통과${fail ? '  ★ 실패 ' + fail + '건' : ' ✓'}`);
    process.exit(fail ? 1 : 0);
})();
