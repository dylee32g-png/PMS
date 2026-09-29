/* 기본 화면 검사 (2026-09-29) — 기술2·3팀 프로젝트 List
 *   팀장님 요청 3가지를 원문 코드 그대로 실행해 확인한다.
 *     ① 지금 화면(1920 모니터)이 모니터 크기와 상관없이 기본 화면 → 카드 기본맞춤.고정폭·기준폭 + computeDefaultFit
 *     ② 공사 진행 머리글(포인트·PLC·ETOS·HMI·진행율 %·Point)이 기본 상태에서 안 잘림 → 실제 크롬에서 글자 폭 실측
 *     ③ 담당자 → 관리자 순서 → 카드 열순서 + applyColOrder (표·칩 줄)
 *   표 머리글(colgroup·thead)·필터 머리글(ComboFilter)·기본 폭(getW)은 원문 JSX를 그대로 렌더한다.
 *   본문 칸(td)만 원문의 폭 관련 핵심(col-clip·--cw·width/min/max)을 복제해 긴 글이 열을 넓히지 않는지 본다.
 *
 *   LAYOUT_PROBE=1 이면 열마다 '머리글 글자에 필요한 폭'을 표로 출력한다(폭 값을 고칠 때 참고).
 */
process.env.BABEL_ENV = process.env.BABEL_ENV || 'test';   // babel-preset-react-app은 환경값이 없으면 멈춤 — README대로 'node 파일'만 쳐도 돌게 (2026-09-29)
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const babel = require('@babel/core');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = process.env.LAYOUT_SRC || path.join(ROOT, 'src/components/ProjectListScreen.jsx');
const src = fs.readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PROBE = !!process.env.LAYOUT_PROBE;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  OK   ' + m); } else { fail++; console.log('  NG   ' + m + (x !== undefined ? '  → ' + (typeof x === 'string' ? x : JSON.stringify(x)) : '')); } };
const grab = (a0, endStr) => { const a = src.indexOf(a0); if (a < 0) return null; const b = src.indexOf(endStr, a + a0.length); return b < 0 ? null : src.slice(a, b + endStr.length); };
const grabTo = (a0, endStr) => { const a = src.indexOf(a0); if (a < 0) return null; const b = src.indexOf(endStr, a + a0.length); return b < 0 ? null : src.slice(a, b); };

// ── ES 모듈 로더 (팀 카드·projectColumns — import/export 그대로) ──────────────
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

// ── 실제 헤더 구성 (2026-09-29 06:00 자동 백업 meta.byYear['2026'] — 기술2·3팀 동일, 30열 3층) ──
const H26 = ['번호', '수행번호', '공장', '공사분류', '진행 현황', 'Project', '포인트', 'PLC', 'ETOS', 'HMI', '진행율 %', 'Point', '날짜', '내용', '관리자', '담당자',
    '공사 계약', '공사 완료', '자재 입고', '견적 제출', '공사 기안 제출', '안전 기안 제출', '작업 계획서 제출', '작업 일보 제출', '완료 서류 제출 Biz 포함',
    '안전 관리비 금액', '안전 관리비 제출', '발주처', '공사업체', '업체담당자'];
const G26 = [...H26.slice(0, 7).map(c => ({ label: '', cols: [c] })),
    { label: '공사 진행', cols: ['PLC', 'ETOS', 'HMI', '진행율 %', 'Point', '날짜', '내용'] },
    ...H26.slice(14).map(c => ({ label: '', cols: [c] }))];
const MIDS = { '포인트': 'Total', 'PLC': '진행현황', 'ETOS': '진행현황', 'HMI': '진행현황', '진행율 %': '시운전', 'Point': '시운전' };
// 기술2팀 옛 양식 예 (2021 시트 앞 18열 — 관리자 열 없음)
const H21 = ['번호', '발주처', 'Project', '진행 현황', '담당자', '날짜', '내용', '참 조', 'LGD 발주', '공사업체', '업체담당자', '물량', '견적코드', '기안', '자재', '안전 관리비', '서브원 교육일지 제출', '서브원 작업일보 제출'];
const flat = (gs) => gs.reduce((a, g) => a.concat(g.cols), []);
const nk = (h) => String(h ?? '').replace(/\s+/g, '');

// ═══ 1. 팀 카드 규칙 ═════════════════════════════════════════════════════
console.log('■ 1. 팀 카드 — 기술2팀(기준)·기술3팀(상속)');
const t2 = getTeamProfile('기술2팀'), t3 = getTeamProfile('기술3팀');
const FIT = t2.기본맞춤 || {};
const FX = FIT.고정폭 || {};
ok(JSON.stringify(t2.열순서) === JSON.stringify([{ 열: '담당자', 앞: '관리자' }]), "기술2팀 열순서 = 담당자를 관리자 바로 앞에", t2.열순서);
ok(JSON.stringify(t3.열순서) === JSON.stringify(t2.열순서) && JSON.stringify(t3.기본맞춤) === JSON.stringify(t2.기본맞춤), '기술3팀 = 기술2팀 상속 (열순서·기본맞춤 동일)');
const fxSum = Object.values(FX).reduce((a, b) => a + Number(b), 0);
ok(Number(FIT.기준폭) > 0 && fxSum === Number(FIT.기준폭), `기준폭 = 고정폭 합계 (${FIT.기준폭} = ${fxSum})`);
ok(Array.isArray(FIT.까지열) && FIT.까지열.includes('관리자') && FIT.까지열.includes('담당자'), "까지열 = ['관리자','담당자'] (더 오른쪽 열까지)", FIT.까지열);
['Software팀', 'Software팀 유지보수'].forEach(t => {
    const p = getTeamProfile(t);
    ok(!p.열순서 && !(p.기본맞춤 && (p.기본맞춤.고정폭 || p.기본맞춤.기준폭)), `${t}는 영향 없음 (열순서·고정폭·기준폭 없음 — 종전 창 폭 맞춤 그대로)`);
});
// 기술1팀은 2026-09-29 오후 자기 카드(열순서·고정폭 1719) — tests/list/tech1_col_order_test.js에서 검사
ok(getTeamProfile('기술1팀').기본맞춤.고정폭 !== FX && getTeamProfile('기술1팀').기본맞춤.기준폭 !== FIT.기준폭, '기술1팀 고정폭·기준폭은 기술2팀과 별개 (서로 안 섞임)');

// ═══ 2. 열 순서 (applyColOrder 원문) ══════════════════════════════════════
console.log('\n■ 2. 표시 열 순서 — applyColOrder 원문');
const acoSrc = grab('const applyColOrder = ', '\n};');
ok(!!acoSrc, 'applyColOrder 원문 찾음');
const applyColOrder = new Function(acoSrc + '\nreturn applyColOrder;')();
const R = applyColOrder(H26, G26, t2.열순서);
ok(R.headers.indexOf('담당자') === 14 && R.headers.indexOf('관리자') === 15, '2026: 담당자 15번째 → 관리자 16번째', [R.headers.indexOf('담당자'), R.headers.indexOf('관리자')]);
ok(JSON.stringify(R.headers.filter(h => h !== '담당자' && h !== '관리자')) === JSON.stringify(H26.filter(h => h !== '담당자' && h !== '관리자')), '나머지 28열 순서 그대로');
ok(JSON.stringify(flat(R.groups)) === JSON.stringify(R.headers), '묶음(colGroups)도 같은 순서 — 머리글 어긋남 없음');
ok(R.groups.length === G26.length && R.groups.find(g => g.label === '공사 진행').cols.join('|') === 'PLC|ETOS|HMI|진행율 %|Point|날짜|내용', "'공사 진행' 묶음 7열 그대로");
const R2 = applyColOrder(R.headers, R.groups, t2.열순서);
ok(R2.headers === R.headers && R2.groups === R.groups, '두 번 적용해도 같음 (이미 그 자리면 같은 배열 그대로 → 화면 재계산 없음)');
ok(JSON.stringify(H26) === JSON.stringify([...H26].sort(() => 0)) && H26.indexOf('관리자') === 14, '원본(저장 헤더) 배열은 바뀌지 않음');
const R0 = applyColOrder(H26, G26, undefined);
ok(R0.headers === H26 && R0.groups === G26, '규칙 없음(Software팀) = 원본 그대로');
const Rold = applyColOrder(H21, H21.map(c => ({ label: '', cols: [c] })), t2.열순서);
ok(Rold.headers.join('|') === H21.join('|'), '관리자 열 없는 옛 연도 = 그대로 (담당자 위치 불변)');
const Rin = applyColOrder(['A', 'B', 'C', 'D'], [{ label: '', cols: ['A'] }, { label: 'G', cols: ['B', 'C', 'D'] }], [{ 열: 'D', 앞: 'B' }]);
ok(Rin.headers.join('') === 'ADBC' && Rin.groups[1].cols.join('') === 'DBC', '같은 이름 묶음 안에서는 그 안에서만 이동');
const Rx = applyColOrder(['A', 'B', 'C', 'D'], [{ label: 'G1', cols: ['A', 'B'] }, { label: 'G2', cols: ['C', 'D'] }], [{ 열: 'D', 앞: 'A' }]);
ok(Rx.headers.join('') === 'ABCD', '서로 다른 이름 묶음 사이는 안 옮김 (머리글 깨짐 방지)');
const Rsp = applyColOrder(['관리 자', '담 당자'], [{ label: '', cols: ['관리 자'] }, { label: '', cols: ['담 당자'] }], [{ 열: '담당자', 앞: '관리자' }]);
ok(Rsp.headers.join('|') === '담 당자|관리 자', '열 이름 공백 차이 무시');

// ═══ 3. 기본 폭 계산 (computeDefaultFit 원문) ════════════════════════════
console.log('\n■ 3. 기본 폭 — computeDefaultFit 원문 (모니터 폭·데이터와 무관한가)');
const cdfSrc = grab('const computeDefaultFit = ', '\n};');
ok(!!cdfSrc, 'computeDefaultFit 원문 찾음');
const computeDefaultFit = new Function(cdfSrc + '\nreturn computeDefaultFit;')();
const heads26 = R.headers;                                   // 표에 보이는 열 = 화면 순서
const alias = (n) => heads26.find(h => nk(h) === nk(n)) || null;
const baseW = () => 60;
const fitArgs = (o) => Object.assign({ cfg: FIT, heads: heads26, allHeads: heads26, colWidths: {}, nat: null, W: FIT.기준폭, compact: 1, baseW, pctMin: [], alias }, o);
const r1 = computeDefaultFit(fitArgs({}));
const wantFx = {}; Object.entries(FX).forEach(([k, v]) => { wantFx[heads26.find(h => nk(h) === nk(k))] = v; });
ok(!r1.needNat && JSON.stringify(r1.widths) === JSON.stringify(Object.fromEntries(heads26.filter(h => wantFx[h]).map(h => [h, wantFx[h]]))),
   '2026·컴팩트 = 카드 고정폭 그대로 16열 (자연 폭 측정 불필요 → 깜빡임 없음)');
const cover = heads26.slice(0, heads26.indexOf('관리자') + 1);
ok(cover.length === 16 && cover.every(h => r1.widths[h] > 0), '번호 ~ 관리자 16열 전부 고정폭', cover.filter(h => !r1.widths[h]));
const monitors = [1100, 1366, 1778, 1920, 2560, 3840].map(W => JSON.stringify(computeDefaultFit(fitArgs({ W })).widths));
ok(monitors.every(x => x === monitors[0]), '모니터 폭 6종(1100~3840)에 넣어도 결과 동일 = 모니터 크기와 무관');
const natBig = Object.fromEntries(heads26.map(h => [h, h === 'Project' ? 900 : h === '내용' ? 1400 : 90]));
ok(JSON.stringify(computeDefaultFit(fitArgs({ nat: natBig })).widths) === JSON.stringify(r1.widths), '긴 글(프로젝트명 900px·내용 1400px)이 들어와도 결과 동일 = 데이터 길이와 무관');
const rMan = computeDefaultFit(fitArgs({ colWidths: { 'Project': 500 } }));
ok(!rMan.widths.Project && rMan.widths['내용'] === wantFx['내용'], '손잡이로 바꾼 열(이 PC)은 계산에서 빠지고 그 폭 우선 — 나머지는 고정폭 그대로');
const hidden = heads26.filter(h => h !== '공사분류');
const rHid = computeDefaultFit(fitArgs({ heads: hidden }));
ok(!rHid.needNat && !rHid.widths['공사분류'] && rHid.widths['Project'] === wantFx['Project'], '열 하나 숨겨도(공사분류) 나머지 고정폭 유지');
const r0 = computeDefaultFit(fitArgs({ compact: 0 }));
ok(r0.needNat && Object.keys(r0.widths).length === 0, '컴팩트가 아닌 모드(기본) = 고정폭 대신 종전 맞춤(자연 폭 측정 필요)');
const r0n = computeDefaultFit(fitArgs({ compact: 0, nat: natBig }));
const sum0 = cover.reduce((a, h) => a + (r0n.widths[h] || 0), 0);
ok(!r0n.needNat && sum0 <= FIT.기준폭 && sum0 > FIT.기준폭 - 40, `  └ 그때도 맞춤 폭 = 기준폭(${FIT.기준폭}) — 창 폭 아님`, sum0);
// 옛 양식 연도(기술2팀 2021): 고정폭 적용 안 함 → 종전 맞춤을 기준폭에
const a21 = (n) => H21.find(h => nk(h) === nk(n)) || null;
const rOld = computeDefaultFit(fitArgs({ heads: H21, allHeads: H21, alias: a21 }));
ok(rOld.needNat && Object.keys(rOld.widths).length === 0, '옛 양식 연도(관리자 열 없음) = 고정폭 대신 종전 맞춤, 까지열 = 담당자');
const natOldSmall = Object.fromEntries(H21.map(h => [h, h === 'Project' ? 520 : 110]));
ok(JSON.stringify(computeDefaultFit(fitArgs({ heads: H21, allHeads: H21, alias: a21, nat: natOldSmall })).widths) === '{}', '  └ 담당자까지 자연 폭이 기준폭 안 = 줄이지 않음(한 줄 펼침 그대로)');
const natOldBig = Object.fromEntries(H21.map(h => [h, h === 'Project' ? 1500 : 200]));
const rOB = computeDefaultFit(fitArgs({ heads: H21, allHeads: H21, alias: a21, nat: natOldBig }));
const sumOB = H21.slice(0, 5).reduce((a, h) => a + (rOB.widths[h] || 0), 0);
ok(sumOB <= FIT.기준폭 && sumOB > FIT.기준폭 - 20 && !rOB.widths['날짜'], '  └ 넘치면 담당자까지만 기준폭에 맞춰 비례 축소', sumOB);
// 카드에 고정폭·기준폭이 없는 팀(기술1팀·Software팀) = 종전 계산식과 똑같은가 (옛 원문 계산 그대로 비교)
const oldFit = (cfgTarget, heads, colWidths, nat, W, getW, pctMin) => {   // 2026-09-28까지의 원문 계산 (효과 안에 있던 식)
    const idx = heads.indexOf(cfgTarget); if (idx < 0) return {};
    const cols = heads.slice(0, idx + 1); let fixed = 0, flex = 0;
    cols.forEach(h => { const w = nat[h] || getW(h) || 40; if (colWidths[h]) fixed += w; else flex += w; });
    if (fixed + flex <= W || flex <= 0) return {};
    const scale = Math.max(0, W - fixed) / flex; const next = {};
    cols.forEach(h => { if (colWidths[h]) return; const w = nat[h] || getW(h) || 40; const mn = pctMin.includes(String(h).replace(/\s+/g, '')) ? 44 : 28; next[h] = Math.max(mn, Math.floor(w * scale)); });
    return next;
};
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
let same = 0, runs = 0;
for (let i = 0; i < 300; i++) {
    const heads = H26.slice(0, 5 + Math.floor(rnd() * 25));
    const tgt = heads[Math.floor(rnd() * heads.length)];
    const nat = Object.fromEntries(heads.map(h => [h, 20 + Math.floor(rnd() * 400)]));
    const cw = {}; heads.forEach(h => { if (rnd() < 0.15) cw[h] = nat[h]; });   // 옛 식은 수동 열에 nat(=그려진 폭)을 쓰므로 같은 값으로
    const W = 600 + Math.floor(rnd() * 2400);
    const pm = rnd() < 0.5 ? ['PLC', 'ETOS'] : [];
    const cfg = { 까지열: tgt };
    const nw = computeDefaultFit({ cfg, heads, allHeads: heads, colWidths: cw, nat, W, compact: [0, 1, 2][i % 3], baseW: () => 50, pctMin: pm, alias: (n) => n });
    runs++; if (JSON.stringify(nw.widths) === JSON.stringify(oldFit(tgt, heads, cw, nat, W, () => 50, pm))) same++;
}
ok(same === runs, `고정폭 없는 팀은 종전 계산과 동일 — 무작위 ${runs}가지 전부 일치`, `${same}/${runs}`);

// ═══ 4. 칩 줄 순서 (관리자·담당자) ════════════════════════════════════════
console.log('\n■ 4. 칩 줄 — 관리자·담당자 앞뒤 = 표 열 순서');
const mfLine = (src.match(/const mgrChipsFirst = ([^\n;]+);/) || [])[1];
ok(!!mfLine, 'mgrChipsFirst 원문 찾음');
const mgrFirst = (headers) => new Function('managerFilterCol', 'assigneeFilterCol', 'activeHeaders', 'return ' + mfLine + ';')(
    headers.find(h => COLS.isManagerCol(h)), headers.find(h => nk(h) === '담당자'), headers);
ok(mgrFirst(R.headers) === false, '기술2·3팀(담당자 → 관리자) = 담당자 칩 줄이 먼저');
ok(mgrFirst(H26) === true, '규칙 없는 순서(관리자 → 담당자)면 관리자 칩 먼저 — 종전과 동일');
ok(mgrFirst(H21) === false, '관리자 열 없는 연도 = 관리자 칩 줄 없음(담당자만)');
const bar = grabTo('{/* 관리자 (2026-07-22 팀장님', '                        </div>\n                    )}');
ok(!!bar && bar.indexOf('{mgrChipsFirst && renderMgrChips()}') >= 0 && bar.indexOf('{mgrChipsFirst && renderMgrChips()}') < bar.indexOf('{/* 담당자 */}')
   && bar.indexOf('{!mgrChipsFirst && renderMgrChips()}') > bar.indexOf('setActiveAssignees'), '칩 줄 JSX: 관리자 묶음이 담당자 앞/뒤 두 자리 중 한 곳에만 그려짐');
ok((src.match(/renderMgrChips\(\)/g) || []).length === 2 && (src.match(/managerChips\.map\(/g) || []).length === 1, '관리자 칩 그리는 코드는 한 벌(renderMgrChips) — 중복 없음');

// ═══ 5. 실제 크롬 — 원문 머리글 렌더 · 글자 잘림 · 열 폭 · 모니터 3종 ═══════════
console.log('\n■ 5. 실제 크롬 — 원문 표 머리글을 앱과 같은 CSS·글꼴로 그려 잰다');
const pieces = {
    getW: grabTo('    const getW = h => {', '\n    // ── 리사이즈'),
    dispHeader: (src.match(/    const dispHeader = [^\n]+/) || [])[0],
    Combo: grabTo('    const ComboFilter = ({ h, small = false }) => {', '    // 헤더 표시 이름'),
    Sort: grabTo('    const SortHeader = ({ h, small = false, forceColor }) => {', '\n    // ─── 데이터 소스 배지'),
    grp: grabTo('    const grpEndCols = useMemo(() => {', '\n    // \'공사 진행\' 묶음 범위'),
    prog: grabTo("    const _progGrp  = ", '\n\n    // 상세 화면에 표시할 비-메인 열'),
    iife: grabTo('                                // 헤드 높이 약 20% 축소', '                                return (<>'),
    colgroup: grab('<colgroup>', '</colgroup>'),
    thead: grab('<thead className="sticky top-0 z-30"', '</thead>'),
    isMain: (src.match(/    const isMainTableCol = [^\n]+/) || [])[0],
};
Object.entries(pieces).forEach(([k, v]) => ok(!!v, '원문 조각 찾음: ' + k));
const TBODY = `<tbody>{ROWS.map((r, ri) => (<tr key={ri}>{mainVisibleHeaders.map(h => (
    <td key={h} className={\`\${tdPx} align-middle border-r border-slate-400 \${cellSz} \${(colWidths[h]||fitWidths[h])?'col-clip':''}\`}
        style={{width: getW(h)||40, minWidth: getW(h)||40, maxWidth: getW(h)||40, '--cw': \`\${getW(h)||40}px\`, ...(centerCol(h)?{textAlign:'center'}:{})}}>{r[h] ?? ''}</td>))}
    <td style={{ width: MGR_COL_W, minWidth: MGR_COL_W, maxWidth: MGR_COL_W }}/></tr>))}</tbody>`;
const jsx = `module.exports = function (ctx) { with (ctx) {
${pieces.isMain}
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
const ROW_LONG = { '번호': '010', '수행번호': '26-006', '공장': '파주', '공사분류': '기타공사', '진행 현황': '진행중',
    'Project': '파주 외곽 Scrubber FanPump 추가(제어_P9)-기타(친기) - (GasChemical 공급 설비 확장 포함 긴 이름 시험)', '포인트': 'Σ 17230',
    'PLC': '98.6%', 'ETOS': '75%', 'HMI': '97.2%', '진행율 %': '27.6%', 'Point': '4748', '날짜': '26/09/17',
    '내용': '장비용 12월 예정, 브릿지 9월중순, 수가습 5개소, D/C 풍도 3개소 통합시운전 대기 — 긴 글 시험 긴 글 시험 긴 글 시험',
    '담당자': '김윤재 책임 김종석 책임', '관리자': '김준혁 팀장', '공사 계약': '26/01/05', '공사 완료': '26/12/31', '자재 입고': 'O', '견적 제출': 'O',
    '공사 기안 제출': 'O', '안전 기안 제출': 'O', '작업 계획서 제출': 'O', '작업 일보 제출': 'O', '완료 서류 제출 Biz 포함': 'O',
    '안전 관리비 금액': '1,200,000', '안전 관리비 제출': 'O', '발주처': 'LGD 파주', '공사업체': '네콘시스', '업체담당자': '홍길동 과장' };
function tableCtx(team, compact) {
    const p = getTeamProfile(team);
    const { headers, groups } = applyColOrder(H26, G26, p.열순서);
    const isMainTableCol = (h) => h !== '실행번호' && !String(h).startsWith('_');
    const mvh = headers.filter(h => isMainTableCol(h) && h !== '실행번호');
    const mvg = groups.map(g => ({ ...g, cols: g.cols.filter(c => mvh.includes(c)) })).filter(g => g.cols.length);
    const al = (n) => headers.find(h => nk(h) === nk(n)) || null;
    const fit = computeDefaultFit({ cfg: p.기본맞춤, heads: mvh, allHeads: headers, colWidths: {}, nat: null, W: p.기본맞춤.기준폭, compact, baseW: () => 60, pctMin: [], alias: al });
    const base = {
        React, compactMode: compact, frozenUpTo: 'Project', mainVisibleHeaders: mvh, mainVisibleGroups: mvg, activeColGroups: groups,
        hasMainGroups: true, hasMainMids: true, headRows: 3, activeColMids: MIDS, colWidths: {}, fitWidths: fit.widths, winPinW: {},
        MGR_COL_W: 78, EXEC_NO_COL: '실행번호', isStatusCol: COLS.isStatusCol, isDateCol: COLS.isDateCol, isFilterable: COLS.isFilterable,
        isMultiLineCol: () => false, useMemo: (fn) => fn(), statusFilterCol: '진행 현황', assigneeFilterCol: '담당자',
        activeStatusChips: new Set(), activeAssignees: new Set(), columnFilters: {}, openFilter: null, sortConfig: { key: null, dir: 'asc' },
        ASSIGNEES: p.담당자목록 || [], assigneeCountMap: {}, extractName: (s) => s, normalizeAssignee: (s) => s, uniqueVals: {},
        STATUS_OPTIONS: (p.상태 && p.상태.기본목록) || [], filterSearch: '', filterRefs: { current: {} },
        fmHdrAuto: () => false, paHdrAuto: (h) => nk(h) === nk((p.진행율자동 || {}).결과열), createPortal: () => null,
        ROWS: [ROW_LONG, ROW_LONG], fitNeedNat: fit.needNat,
    };
    return new Proxy(base, {
        has: () => true,
        get(t, k) {
            if (k in t) return t[k];
            if (typeof k !== 'string') return undefined;
            if (GLOBALS.has(k)) return globalThis[k];
            if (/^[A-Z]/.test(k)) return Icon;
            return () => undefined;   // 그리는 도중 부르는 set*/토글 함수 = 빈 함수
        },
    });
}
const ctx2 = tableCtx('기술2팀', 1);
ok(!ctx2.fitNeedNat, '크롬 그림용 폭 = 카드 고정폭 (측정 없이 바로)');
const tableHtml = renderToStaticMarkup(renderTable(ctx2));
ok(tableHtml.startsWith('<table') && tableHtml.includes('data-col="진행율 %"') && tableHtml.includes('공사 진행'), '원문 머리글이 실제로 그려짐 (3층·공사 진행 묶음)');
const tableHtml3 = renderToStaticMarkup(renderTable(tableCtx('기술3팀', 1)));
ok(tableHtml3 === tableHtml, '기술3팀 표 머리글 = 기술2팀과 한 글자도 다르지 않음');

// ── (조사 모드 선택) 실제 백업 JSON의 2026 메인 행 값으로 본문 글자 폭 분포 — LAYOUT_DATA=경로[;경로2]
let DATA = null;
if (PROBE && process.env.LAYOUT_DATA) {
    DATA = {};
    process.env.LAYOUT_DATA.split(';').filter(Boolean).forEach(fp => {
        const bk = JSON.parse(fs.readFileSync(fp, 'utf8'));
        (bk.rows || []).filter(r => String(r._year) === '2026' && !r._subParent && !['s', '-'].includes(String(r['실행번호'] || '').trim().toLowerCase()))
            .forEach(r => cover.forEach(h => { const v = String(r[h] ?? '').trim(); if (v) (DATA[h] = DATA[h] || []).push(v); }));
    });
}
const cssFile = fs.readdirSync(path.join(ROOT, 'build/static/css')).find(f => f.endsWith('.css'));
const css = fs.readFileSync(path.join(ROOT, 'build/static/css', cssFile), 'utf8');
const twjs = fs.readFileSync(path.join(__dirname, 'tailwind.cdn.js'), 'utf8');
const _idx = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
const _a = _idx.indexOf('tailwind.config =');
const twcfg = _idx.slice(_a, _idx.indexOf('</' + 'script>', _a));
// 1920 모니터(배율 100%)의 표 상자 = 좌우 여백 24px·테두리 1px → 1870px(세로 스크롤바 포함) · 작은/큰 모니터도 같이
const WRAPS = [{ nm: '1920', w: 1870 }, { nm: '1366', w: 1316 }, { nm: '2560', w: 2510 }];
const boxes = WRAPS.map(b => `<div class="case" data-m="${b.nm}" style="width:${b.w}px"><div class="overflow-auto custom-scrollbar" style="zoom:1">${tableHtml}</div></div>`).join('\n');
const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<script>${twjs}<\/script>
<script>${twcfg}<\/script>
<style>${css}</style>
<style>body{margin:0}.case{overflow:hidden;margin-bottom:8px}</style>
</head><body>
${boxes}
<div id="probe" style="position:absolute;left:0;top:0;visibility:hidden"></div>
<pre id="out"></pre>
<script>
const DATA = ${JSON.stringify(DATA)};
const measure = () => {
  const res = {};
  if (DATA) {   /* 값마다 실제 본문 칸(td: px-2 py-1 text-[11.5px], 폭 제한 없음)에 넣어 잰다 */
    const pr = document.getElementById('probe'); const dw = {};
    Object.entries(DATA).forEach(([h, vals]) => { dw[h] = vals.map(v => { pr.innerHTML = '<table class="text-left list-oneline"><tbody><tr><td class="px-2 py-1 align-middle border-r border-slate-400 text-[11.5px]"></td></tr></tbody></table>'; const td = pr.querySelector('td'); td.textContent = v; return Math.ceil(td.getBoundingClientRect().width); }); });
    res.dataW = dw; pr.innerHTML = '';
  }
  document.querySelectorAll('.case').forEach(box => {
    const ths = [...box.querySelectorAll('thead th[data-col]')];
    const x0 = box.querySelector('table').getBoundingClientRect().left;
    res[box.dataset.m] = ths.map(th => { const r = th.getBoundingClientRect(); const b = th.querySelector('button');
      let tw = 0; if (b) { const rg = document.createRange(); rg.selectNodeContents(b); tw = Math.round(rg.getBoundingClientRect().width * 10) / 10; }
      return { h: th.dataset.col, x: Math.round((r.left - x0) * 10) / 10, w: Math.round(r.width * 10) / 10, sw: b ? b.scrollWidth : 0, cw: b ? b.clientWidth : 0, tw }; });
    const tds = [...box.querySelectorAll('tbody tr:first-child td')];
    res[box.dataset.m + '_td'] = tds.map(td => Math.round(td.getBoundingClientRect().width * 10) / 10);
  });
  const lbl = document.querySelector('thead th[data-col] button');
  res.font = { family: lbl ? getComputedStyle(lbl).fontFamily : '', loaded: [...document.fonts].filter(f => /Pretendard/i.test(f.family) && f.status === 'loaded').length,
               tw: getComputedStyle(document.querySelector('table')).borderCollapse };
  document.getElementById('out').textContent = 'RESULT' + JSON.stringify(res);
};
document.fonts.ready.then(() => setTimeout(measure, 300));
<\/script></body></html>`;
const page = path.join(os.tmpdir(), 'pms_layout_measure.html');
fs.writeFileSync(page, html, 'utf8');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'layoutchrome-'));
const dump = execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=15000', '--window-size=2600,1400',
    '--user-data-dir=' + profile, '--dump-dom', 'file:///' + page.replace(/\\/g, '/')], { encoding: 'utf8', maxBuffer: 1 << 28 });
const mm = dump.match(/RESULT(\{.*\})<\/pre>/s);
ok(!!mm, '크롬 측정 결과를 받음');
const M = JSON.parse(mm[1]);
ok(M.font.loaded > 0 && /Pretendard/.test(M.font.family), `앱 글꼴(Pretendard)로 그려짐 — 글자 폭 측정 유효 (로드 ${M.font.loaded}개)`, M.font);
ok(M.font.tw === 'separate', "앱 CSS 적용됨 (index.css가 모든 표를 border-collapse: separate !important로 강제 — 실제 화면과 같은 조건)", M.font.tw);
const m19 = M['1920'];
const byH = Object.fromEntries(m19.map(c => [c.h, c]));
const cardW = (h) => wantFx[h];
if (PROBE) {
    console.log('\n     [폭 조사] 열 · 지금 폭 · 머리글 글자 폭 / 들어갈 자리 · 머리글에 필요한 폭');
    [...m19].sort((a, b) => a.x - b.x).forEach(c => { const need = Math.ceil(c.w - c.cw + c.tw); console.log(`       ${c.h.padEnd(12)} 폭 ${String(c.w).padStart(6)}  글자 ${String(c.tw).padStart(5)} / 자리 ${String(c.cw).padStart(4)}  → 머리글에 필요한 폭 ${String(need).padStart(4)}px  ${need > c.w ? '★ ' + (need - c.w) + 'px 부족' : '여유 ' + Math.floor(c.w - need) + 'px'}`); });
}
if (PROBE && process.env.LAYOUT_DUMP) fs.writeFileSync(process.env.LAYOUT_DUMP, JSON.stringify(M), 'utf8');   // 조사 결과 원본(폭 조정 계산용)
if (PROBE && M.dataW) {
    console.log('\n     [본문 조사] 열 · 값 수 · 가장 긴 값 폭 · 90% 값 폭 · 지금 폭에서 말줄임 되는 값 수');
    cover.forEach(h => { const a = (M.dataW[h] || []).slice().sort((x, y) => x - y); if (!a.length) return; const p90 = a[Math.floor(a.length * 0.9)]; const over = a.filter(x => x > wantFx[h]).length;
        console.log(`       ${h.padEnd(12)} ${String(a.length).padStart(4)}건  최장 ${String(a[a.length - 1]).padStart(4)}px  90% ${String(p90).padStart(4)}px  폭 ${String(wantFx[h]).padStart(4)} → 말줄임 ${over}건`); });
}
const sorted = [...m19].sort((a, b) => a.x - b.x).map(c => c.h);
ok(sorted.indexOf('담당자') >= 0 && sorted.indexOf('담당자') < sorted.indexOf('관리자') && sorted.indexOf('관리자') === sorted.indexOf('담당자') + 1,
   '화면 순서: … 내용 → 담당자 → 관리자 → 공사 계약 …', sorted.slice(12, 18));
const badW = cover.filter(h => !byH[h] || Math.abs(byH[h].w - cardW(h)) > 1);
ok(badW.length === 0, '번호 ~ 관리자 16열 폭 = 카드 고정폭 (±1px)', badW.map(h => `${h} ${byH[h] && byH[h].w}≠${cardW(h)}`));
const PROG6 = ['포인트', 'PLC', 'ETOS', 'HMI', '진행율 %', 'Point'];
const cut6 = PROG6.filter(h => byH[h] && byH[h].sw > byH[h].cw);
ok(cut6.length === 0, '★공사 진행 머리글 6개(포인트·PLC·ETOS·HMI·진행율 %·Point) 글자 안 잘림', cut6.map(h => `${h} ${byH[h].sw - byH[h].cw}px 부족`));
// 여유 = 들어갈 자리 − 실제 글자 폭(Range). 글꼴 렌더링(배율·힌팅) 차이로 1~2px 오가도 안 잘리게 공사 진행 6개는 4px 이상
PROG6.forEach(h => { const c = byH[h]; const slack = c ? Math.floor(c.cw - c.tw) : -1;
    ok(c && slack >= 4, `   ${h} — 폭 ${c && c.w}px · 글자 ${c && c.tw}px / 자리 ${c && c.cw}px (여유 ${slack}px)`); });
const cut16 = cover.filter(h => { const c = byH[h]; return !c || c.sw > c.cw || c.cw - c.tw < 1; });
ok(cut16.length === 0, '번호 ~ 관리자 16열 머리글 전부 안 잘림 (여유 1px 이상 — 공장 "공.." 포함 해소)', cut16.map(h => `${h} 여유 ${byH[h] && Math.floor(byH[h].cw - byH[h].tw)}`));
['담당자', '관리자'].forEach(h => ok(byH[h] && byH[h].sw <= byH[h].cw, `${h} 머리글 안 잘림`));
const endX = byH['관리자'].x + byH['관리자'].w;
ok(Math.abs(endX - FIT.기준폭) <= 2, `관리자 오른쪽 끝 = ${Math.round(endX)}px = 기준폭(${FIT.기준폭}) — 1920 화면에서 '관리' 칸 바로 앞`, endX);
// 모니터 3종 — 16열 폭이 전부 같은가
const sameAll = ['1366', '2560'].every(nm => cover.every(h => { const a = M[nm].find(c => c.h === h); return a && Math.abs(a.w - byH[h].w) <= 0.5; }));
ok(sameAll, '1366·1920·2560 모니터에서 16열 폭 전부 동일 (모니터 크기와 무관)');
// 본문 칸 — 긴 글이 열을 넓히지 않음 (col-clip)
const tdW = M['1920_td'];
const heads19 = ctx2.mainVisibleHeaders;
const badTd = cover.filter(h => Math.abs(tdW[heads19.indexOf(h)] - cardW(h)) > 1);
ok(badTd.length === 0, '본문 칸도 같은 폭 — 긴 프로젝트명·내용·담당자 2명이 열을 넓히지 않음(말줄임)', badTd.map(h => `${h} ${tdW[heads19.indexOf(h)]}`));

console.log('\n' + '='.repeat(62));
console.log(`결과: ${pass}/${pass + fail} 통과` + (fail ? `  ★ 실패 ${fail}건` : '  ✓'));
process.exit(fail ? 1 : 0);
