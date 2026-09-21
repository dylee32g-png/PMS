/* 2026-09-21 칩 숫자 연동 검사 — ProjectListScreen.jsx 원문(판정식·4개 계산 블록·표 필터 블록)을 꺼내 가짜 데이터로 실행
 *   화면 시나리오(9/21 스크린샷): 2026년 208건 = 진행중 29 · 추진중 47 · 완료 71 · 삭제 58 · Hold 3, 김종석 책임 31건(그중 진행중 10)
 */
const fs = require('fs');
const src = fs.readFileSync(require('path').resolve(__dirname, '..', '..', 'src', 'components', 'ProjectListScreen.jsx'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  OK   ' + m); } else { fail++; console.log('  NG   ' + m + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); } };

// ── 원문 조각 추출 ─────────────────────────────────────────────────────────
const between = (startRe, endStr) => { const m = src.match(startRe); if (!m) return null; const a = m.index + m[0].length; const b = src.indexOf(endStr, a); return b < 0 ? null : src.slice(a, b); };
const memoBody = (name) => between(new RegExp('const ' + name + ' = useMemo\\(\\(\\) => \\{'), '\n    }, [');
const sliceFrom = (startStr, endStr) => { const a = src.indexOf(startStr); if (a < 0) return null; const b = src.indexOf(endStr, a); return b < 0 ? null : src.slice(a, b); };
const predSrc = sliceFrom('    const chipSelAssignees = useMemo', '\n    // 드롭다운에 보여줄 월별 건수');
ok(!!predSrc, '연동 판정식 3개 원문 찾음');
const bodies = { monthCountMap: memoBody('monthCountMap'), statusChipData: memoBody('statusChipData'), assigneeChipCountMap: memoBody('assigneeChipCountMap'), managerChips: memoBody('managerChips') };
Object.entries(bodies).forEach(([k, v]) => ok(!!v, '계산 블록 원문 찾음: ' + k));
const totalExpr = (src.match(/const statusChipTotal = useMemo\(\(\) => ([^\n]*)\.length,/) || [])[1];
ok(!!totalExpr, "'전체' 칩 숫자 식 찾음");
const tableFilter = sliceFrom('        if (activeStatusChips.size > 0 && statusFilterCol) {', '        if (searchTerm) {');
ok(!!tableFilter, '표(sortedRowsBase) 칩 필터 3단 원문 찾음');
const keysSrc = between(/    const assigneeKeys = /, '\n    };');
ok(!!keysSrc, 'assigneeKeys 원문 찾음');

// ── 가짜 환경 ───────────────────────────────────────────────────────────────
const extractName = (v) => String(v || '').trim().split(/\s+/)[0] || '';
const normalizeAssignee = (v) => String(v || '').trim();
const splitAssignees = (v) => String(v || '').split(/[,·]/).map(x => x.trim()).filter(Boolean);
const isSubListRow = (r) => !!r._sub;
const contractMonthOf = (r) => r.mm || null;
const STATUS_OPTIONS = ['추진중', '진행중', '완료', '삭제', 'Hold'];
const ASSIGNEES = ['최영환 담당', '김준혁 팀장', '조장현 팀장', '신정환 책임', '김종석 책임', '장명휘 책임', '김윤재 책임', '김수민 책임'];
const teamProfile = { 상태: {} };
const selectedYear = '2026';
const useMemo = (fn) => fn();   // 훅 흉내 — 즉시 계산

// 데이터: 208 메인 + 하위 2 + 담당자 다중 1
const rows = [];
const mk = (st, asg, mgr, mm) => rows.push({ '진행 현황': st, '담당자': asg, '관리자': mgr, mm });
const spread = (n, st, asgList, mgr) => { for (let i = 0; i < n; i++) mk(st, asgList[i % asgList.length], mgr, ['05', '06', null][i % 3]); };
// 김종석 31건: 진행중 10 · 추진중 8 · 완료 9 · 삭제 4 (관리자 김준혁)
spread(10, '진행중', ['김종석 책임'], '김준혁 팀장'); spread(8, '추진중', ['김종석 책임'], '김준혁 팀장'); spread(9, '완료', ['김종석 책임'], '김준혁 팀장'); spread(4, '삭제', ['김종석 책임'], '김준혁 팀장');
// 나머지 177건: 진행중 19 · 추진중 39 · 완료 62 · 삭제 54 · Hold 3 (관리자 조장현/최영환 섞음)
spread(19, '진행중', ['장명휘 책임', '김윤재 책임'], '조장현 팀장'); spread(39, '추진중', ['장명휘 책임', '김수민 책임'], '조장현 팀장'); spread(62, '완료', ['김윤재 책임', '신정환 책임'], '최영환 담당'); spread(54, '삭제', ['장명휘 책임'], '조장현 팀장'); spread(2, 'HOLD', ['김수민 책임'], '조장현 팀장'); spread(1, 'Hold', ['김수민 책임'], '조장현 팀장');
rows.push({ '진행 현황': 'sub', '담당자': '김종석 책임', '관리자': '김준혁 팀장', _sub: true }, { '진행 현황': 'sub', '담당자': '장명휘 책임', '관리자': '조장현 팀장', _sub: true });
const mains = rows.filter(r => !r._sub);
ok(mains.length === 208 && mains.filter(r => r['진행 현황'] === '진행중').length === 29 && mains.filter(r => r['담당자'] === '김종석 책임').length === 31, '가짜 데이터 = 화면 숫자(208·진행중 29·김종석 31)');

const run = (sel) => {
    const ctx = {
        activeStatusChips: new Set(sel.status || []), activeAssignees: new Set(sel.asg || []), activeManagers: new Set(sel.mgr || []),
        statusFilterCol: '진행 현황', assigneeFilterCol: '담당자', managerFilterCol: '관리자', contractDateCol: '공사 계약',
        yearFilteredRows: rows, monthFilteredRows: rows,
        extractName, normalizeAssignee, splitAssignees, isSubListRow, contractMonthOf, STATUS_OPTIONS, ASSIGNEES, teamProfile, selectedYear, useMemo,
    };
    const code = keysSrc.replace(/^/, 'const assigneeKeys = ') + '\n    };\n' + predSrc +
        '\n const monthCountMap = (() => {' + bodies.monthCountMap + '\n })();' +
        '\n const statusChipData = (() => {' + bodies.statusChipData + '\n })();' +
        '\n const statusChipTotal = ' + totalExpr + '.length;' +
        '\n const assigneeChipCountMap = (() => {' + bodies.assigneeChipCountMap + '\n })();' +
        '\n const managerChips = (() => {' + bodies.managerChips + '\n })();' +
        '\n const bottom = (() => { let out = monthFilteredRows.filter(r => !isSubListRow(r));\n' + tableFilter + '\n return out.length; })();' +
        '\n return { monthCountMap, statusChipData: Object.fromEntries(statusChipData), statusChipTotal, assigneeChipCountMap, managerChips: Object.fromEntries(managerChips.map(m => [m.key, m.count])), bottom };';
    return new Function('ctx', 'with (ctx) {' + code + '}')(ctx);
};

console.log('\n■ 1. 스크린샷 1 — 전체 + 관리자 전체 + 담당자 김종석');
let r = run({ asg: ['김종석 책임'] });
ok(r.statusChipTotal === 31 && r.bottom === 31, "진행현황 '전체' (31) = 하단 31건", [r.statusChipTotal, r.bottom]);
ok(r.statusChipData['진행중'] === 10 && r.statusChipData['추진중'] === 8 && r.statusChipData['완료'] === 9, '진행중 (10) 추진중 (8) 완료 (9) — 김종석 안에서', r.statusChipData);
ok(r.assigneeChipCountMap['김종석'] === 31 && r.assigneeChipCountMap['장명휘'] === 84, '담당자 줄은 자기 줄 선택 제외 → 김종석 (31) · 장명휘 (84 = 진행중 10+추진중 20+삭제 54) 그대로', r.assigneeChipCountMap);
ok(r.monthCountMap.all === 31 && (r.monthCountMap['05'] || 0) + (r.monthCountMap['06'] || 0) + r.monthCountMap.etc === 31, '기준월: 전체 (31) = 5월+6월+기타', r.monthCountMap);

console.log('\n■ 2. 스크린샷 2 — 진행중 + 관리자 전체 + 담당자 김종석 (질문의 상황)');
r = run({ status: ['진행중'], asg: ['김종석 책임'] });
ok(r.bottom === 10, '하단 10건', r.bottom);
ok(r.statusChipData['진행중'] === 10, '진행중 (10) ← 종전 (29)', r.statusChipData['진행중']);
ok(r.statusChipTotal === 31 && r.statusChipData['완료'] === 9, "진행현황 '전체' (31)·완료 (9) — 자기 줄(상태) 선택은 빼고 세므로 다른 상태 칩도 살아 있음", [r.statusChipTotal, r.statusChipData['완료']]);
ok(r.assigneeChipCountMap['김종석'] === 10, '김종석 책임 (10) ← 종전 (31)', r.assigneeChipCountMap['김종석']);
ok(r.assigneeChipCountMap['장명휘'] === 10 && (r.assigneeChipCountMap['신정환'] || 0) === 0, '다른 담당자도 진행중 안에서: 장명휘 (10) · 신정환 (0)', r.assigneeChipCountMap);
ok(r.monthCountMap.all === 10, '기준월 전체 (10) = 하단', r.monthCountMap.all);
ok(r.managerChips['김준혁'] === 10 && r.managerChips['조장현'] === 0 && r.managerChips['최영환'] === 0, '관리자 줄: 김준혁 (10) · 조장현 (0) · 최영환 (0) — 0건이어도 칩은 남음', r.managerChips);

console.log('\n■ 3. 관리자까지 고른 경우 — 진행중 + 관리자 조장현 + 담당자 없음');
r = run({ status: ['진행중'], mgr: ['조장현 팀장'] });
ok(r.bottom === 19 && r.monthCountMap.all === 19, '하단 19 = 기준월 전체 19', [r.bottom, r.monthCountMap.all]);
ok(r.statusChipData['진행중'] === 19 && r.statusChipData['완료'] === 0 && r.statusChipTotal === 115, '진행현황 줄은 조장현 안에서: 진행중 (19) 완료 (0) 전체 (115 = 19+39+54+3)', [r.statusChipData['진행중'], r.statusChipData['완료'], r.statusChipTotal]);
ok(r.assigneeChipCountMap['장명휘'] === 10 && r.assigneeChipCountMap['김윤재'] === 9 && (r.assigneeChipCountMap['김종석'] || 0) === 0, '담당자 줄은 진행중∧조장현 안에서: 장명휘 (10) 김윤재 (9) 김종석 (0)', r.assigneeChipCountMap);
ok(r.managerChips['조장현'] === 19 && r.managerChips['김준혁'] === 10, '관리자 줄은 자기 줄 제외 → 조장현 (19) 김준혁 (10)', r.managerChips);

console.log('\n■ 4. 성질 검사 — "고른 칩의 숫자 = 하단 건수" (각 줄 1개씩 고른 모든 조합)');
let combos = 0, bad = [];
for (const st of ['진행중', '추진중', '완료', '삭제', 'Hold']) for (const asg of ASSIGNEES) for (const mgr of ['김준혁 팀장', '조장현 팀장', '최영환 담당']) {
    const x = run({ status: [st], asg: [asg], mgr: [mgr] });
    combos++;
    const a = x.statusChipData[st], b = x.assigneeChipCountMap[extractName(asg)] || 0, c = x.managerChips[extractName(mgr)] || 0;
    if (!(a === x.bottom && b === x.bottom && c === x.bottom && x.monthCountMap.all === x.bottom)) bad.push({ st, asg, mgr, a, b, c, bottom: x.bottom });
}
ok(bad.length === 0, `${combos}가지 조합 전부 세 줄 숫자 = 기준월 전체 = 하단`, bad.slice(0, 3));

console.log('\n■ 5. 선택 없음 = 종전과 동일한 총량');
r = run({});
ok(r.statusChipTotal === 208 && r.statusChipData['진행중'] === 29 && r.assigneeChipCountMap['김종석'] === 31 && r.monthCountMap.all === 208 && r.bottom === 208, '전체 (208) 진행중 (29) 김종석 (31) 기준월 전체 (208) 하단 208', [r.statusChipTotal, r.statusChipData['진행중'], r.assigneeChipCountMap['김종석'], r.monthCountMap.all, r.bottom]);
ok(r.statusChipData['Hold'] === 3 && !('HOLD' in r.statusChipData), 'HOLD 표기는 Hold 로 합쳐짐(종전 규칙 유지)', r.statusChipData);

console.log('\n■ 6. 원문 구조');
ok(src.indexOf('const assigneeKeys = ') < src.indexOf('const chipPassAssignee'), 'assigneeKeys 선언이 판정식보다 앞 (TDZ 안전)');
ok(src.indexOf('const managerFilterCol = useMemo') < src.indexOf('const chipPassManager') && src.indexOf('const chipPassManager') < src.indexOf('const managerChips = useMemo'), '판정식이 관리자 열 뒤·관리자 칩 앞');
ok(/\(\{statusChipTotal\}\)<\/span>/.test(src), "'전체' 칩이 연동 숫자를 씀");
ok(/\(\{assigneeChipCountMap\[extractName\(name\)\] \|\| 0\}\)<\/span>/.test(src), '담당자 칩이 연동 숫자를 씀');
ok(/\.map\(name => \[name, assigneeCountMap\[extractName\(name\)\] \|\| 0\]\)/.test(src) && /return key \? \(assigneeCountMap\[key\] \|\| 0\) : 0;/.test(src), '열 ▼ 메뉴·담당자 관리 삭제 잠금은 연도 전체 기준(assigneeCountMap) 유지');
ok((src.match(/const chipPass = \(r\) =>/g) || []).length === 0, '옛 기준월 전용 판정(chipPass) 제거');

console.log('\n' + '='.repeat(60));
console.log(`결과: ${pass}/${pass + fail} 통과` + (fail ? `  ★ 실패 ${fail}건` : '  ✓'));
process.exit(fail ? 1 : 0);
