/* 정렬 기억 검사 (2026-09-18)
 *   ProjectListScreen.jsx의 도우미 3개(sortCfgKey·loadSortCfg·saveSortCfg) 원문을 그대로 실행하고,
 *   정렬을 바꾸는 경로가 전부 applySort를 지나는지 소스로 확인한다.
 */
const fs = require('fs');
const src = fs.readFileSync(require('path').resolve(__dirname, '..', '..', 'src', 'components', 'ProjectListScreen.jsx'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  OK   ' + m); } else { fail++; console.log('  NG   ' + m + (x !== undefined ? '  → ' + x : '')); } };

// ── 가짜 localStorage (브라우저 대신) ─────────────────────────────────
const store = {};
global.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
};

// ── 도우미 원문 떼어 실행 ─────────────────────────────────────────────
const a = src.indexOf('const sortCfgKey');
const b = src.indexOf('const colWidthsKey');
ok(a > 0 && b > a, '정렬 기억 도우미 3개를 소스에서 찾음');
const helpers = src.slice(a, b);
const { sortCfgKey, loadSortCfg, saveSortCfg } =
    new Function(helpers + '\n return { sortCfgKey, loadSortCfg, saveSortCfg };')();

console.log('■ 1. 저장 열쇠는 팀마다 다른가');
ok(sortCfgKey('기술2팀') !== sortCfgKey('Software팀'), '팀마다 다른 열쇠', sortCfgKey('기술2팀'));
ok(sortCfgKey('기술2팀').includes('기술2팀'), '열쇠에 팀 이름이 들어감', sortCfgKey('기술2팀'));

console.log('\n■ 2. 저장했다가 다시 읽으면 그대로인가');
saveSortCfg('Software팀 유지보수', { key: '번호', dir: 'asc' });
const back = loadSortCfg('Software팀 유지보수');
ok(back.key === '번호' && back.dir === 'asc', '번호 오름차순이 그대로 돌아옴', JSON.stringify(back));
saveSortCfg('Software팀 유지보수', { key: '접수일', dir: 'desc' });
ok(JSON.stringify(loadSortCfg('Software팀 유지보수')) === '{"key":"접수일","dir":"desc"}', '덮어쓰면 새 값', JSON.stringify(loadSortCfg('Software팀 유지보수')));

console.log('\n■ 3. 팀이 섞이지 않는가');
saveSortCfg('기술2팀', { key: '번호', dir: 'desc' });
ok(loadSortCfg('Software팀 유지보수').key === '접수일', '다른 팀 저장이 이 팀을 안 건드림');
ok(loadSortCfg('기술2팀').dir === 'desc', '기술2팀은 기술2팀 값');
ok(loadSortCfg('기술3팀').key === null, '저장한 적 없는 팀 = 정렬 없음', JSON.stringify(loadSortCfg('기술3팀')));

console.log('\n■ 4. 이상한 값이 들어와도 안전한가');
store[sortCfgKey('깨진팀')] = '{이건 JSON이 아님';
ok(loadSortCfg('깨진팀').key === null, '깨진 값 → 정렬 없음(오류 안 남)');
saveSortCfg('이상팀', { key: 123, dir: 'sideways' });
ok(loadSortCfg('이상팀').key === null, '엉뚱한 값 → 정렬 없음', JSON.stringify(loadSortCfg('이상팀')));
saveSortCfg('해제팀', { key: null, dir: 'asc' });
ok(loadSortCfg('해제팀').key === null, '정렬 해제도 그대로 기억(다음에 안 켜짐)');

console.log('\n■ 5. 정렬을 바꾸는 길이 전부 applySort를 지나는가');
const body = src.slice(src.indexOf('const [sortConfig'));
const direct = [...body.matchAll(/setSortConfig\(/g)].length;
ok(direct === 2, 'setSortConfig 직접 호출 = 2곳뿐(팀 전환 · applySort 내부)', direct);
ok(/const applySort = \(cfg\) => \{ setSortConfig\(cfg\); saveSortCfg\(currentTeam, cfg\); \};/.test(src),
   'applySort = 상태 바꾸고 바로 저장');
const paths = [
    ['헤더 클릭 3단계', /applySort\(sortConfig\.key !== key/],
    ['헤더 ▼ 정렬', /applySort\(\{ key: h, dir: d \}\)/],
    ['헤더 ▼ 정렬 해제', /applySort\(\{ key: null, dir: 'asc' \}\); setOpenFilter/],
    ['기준연도 변경', /setColumnFilters\(\{\}\); applySort\(\{key:null,dir:'asc'\}\)/],
    ['하단 [해제] 버튼', /onClick=\{\(\) => applySort\(\{ key: null, dir: 'asc' \}\)\}/],
];
paths.forEach(([n, re]) => ok(re.test(src), '경로: ' + n));

console.log('\n■ 6. 화면에 들어올 때 기억한 값으로 시작하는가');
ok(/useState\(\(\) => loadSortCfg\(currentTeam\)\)/.test(src), '처음 열 때 = 기억된 정렬');
ok(/useEffect\(\(\) => \{ setSortConfig\(loadSortCfg\(currentTeam\)\); \}, \[currentTeam\]\);/.test(src),
   '팀을 바꾸면 그 팀 정렬로');

console.log('\n' + '='.repeat(58));
console.log(`결과: ${pass}/${pass + fail} 통과` + (fail ? `  ★ 실패 ${fail}건` : '  ✓'));
process.exit(fail ? 1 : 0);
