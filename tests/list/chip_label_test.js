/* 2026-09-21 관리 칸 파일 칩 이름 AX/L1 통일 + Back_up 제외 — 원문 실행 검사 */
const fs = require('fs');
const src = fs.readFileSync(require('path').resolve(__dirname, '..', '..', 'src', 'components', 'ProjectListScreen.jsx'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  OK   ' + m); } else { fail++; console.log('  NG   ' + m + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); } };

console.log('■ 1. 상수·역할 판정 원문 실행');
const grabLine = (re) => { const m = src.match(re); ok(!!m, '원문에서 찾음: ' + re.source.slice(0, 40)); return m ? m[0] : ''; };
const decl = [grabLine(/const EXT_CHIP_LABEL = [^\n]*/), grabLine(/const EXT_CHIP_ROLE_KO = [^\n]*/), grabLine(/const extFileRole = [^\n]*/)].join('\n');
const { EXT_CHIP_LABEL, EXT_CHIP_ROLE_KO, extFileRole } = new Function(decl + '\n return { EXT_CHIP_LABEL, EXT_CHIP_ROLE_KO, extFileRole };')();
ok(EXT_CHIP_LABEL.sub === 'AX' && EXT_CHIP_LABEL.cell === 'L1', '이름표 = AX / L1', EXT_CHIP_LABEL);
const VN_AX = { name: '베트남 H3 5F Auto DT 투자 자동제어 공사 진척자료_260921.xlsx', rel: 'a', shared: false };
const VN_L1 = { name: '진행현황_베트남 H3 5F Auto DT 투자 자동제어 공사 Project_260921.xlsx', rel: 'b', shared: false };
const PJ_AX = { name: 'P10 AP4 Infra 보완투자 대응 자동제어 공사 진척자료_260917.xlsx', rel: 'c', shared: false };
const PJ_L1 = { name: '01 진행현황_P9_10 AP4 Infra 보완 투자 대응 자동제어 공사_CNS_260420.xlsx', rel: 'd', shared: true };
const lb = (f) => EXT_CHIP_LABEL[extFileRole(f)] || 'XL';
ok(lb(VN_AX) === 'AX', "베트남 진척자료 → AX (옛 목록, role 없음 → 이름으로 추정)", lb(VN_AX));
ok(lb(VN_L1) === 'L1', '베트남 진행현황 → L1', lb(VN_L1));
ok(lb(PJ_AX) === 'AX' && lb(PJ_L1) === 'L1', '파주 P10 진척자료 → AX · 공용 진행현황 → L1');
ok(lb({ name: '아무이름.xlsx', role: 'sub' }) === 'AX' && lb({ name: '진척자료.xlsx', role: 'cell' }) === 'L1', '검사가 기록한 role 이 이름보다 우선');
ok(EXT_CHIP_ROLE_KO.sub.includes('하위 공종표') && EXT_CHIP_ROLE_KO.cell.includes('PLC'), '툴팁 뜻풀이 존재');

console.log('\n■ 2. 칩 순서 — 무조건 왼쪽부터 L1 → AX (2026-09-21 팀장님 확정)');
const keyLine = grabLine(/const extFileOrder = \(f\) => [^\n]*/);
const extFileOrder = new Function('extFileRole', keyLine + '\n return extFileOrder;')(extFileRole);
const sorted = [VN_AX, PJ_L1, VN_L1].sort((a, b) => extFileOrder(a) - extFileOrder(b)).map(f => lb(f) + (f.shared ? '(공용)' : ''));
ok(JSON.stringify(sorted) === JSON.stringify(['L1', 'L1(공용)', 'AX']), '순서: L1 → L1(공용) → AX', sorted);
ok(extFileOrder({ role: 'cell', shared: true }) < extFileOrder({ role: 'sub', shared: false }), '공용 L1 이라도 AX 보다 앞 (무조건 L1 먼저)');
ok(/const nasFiles = \[\.\.\._nfRaw\]\.sort\(\(a, b\) => extFileOrder\(a\) - extFileOrder\(b\)\);/.test(src), '관리 칸 칩이 이 순서를 씀');
ok(/const shown = files\.filter\(f => fam\[famKey\(f\)\] === f\)\.sort\(\(a, b\) => extFileOrder\(a\) - extFileOrder\(b\)\);/.test(src), "모달 '찾은 원본 파일' 목록도 같은 순서");
ok(!/_nfKey/.test(src), '옛 순서 코드(_nfKey) 제거');

console.log('\n■ 3. 검사가 역할을 기록하는가 (원문)');
ok(/usedFiles\.push\(\{ name: picked2\.name, rel: picked2\.rel, shared: !!picked2\._shared, role: 'sub' \}\)/.test(src), '하위 공종표 규칙이 쓴 파일 → role sub');
ok(/usedFiles\.push\(\{ name: picked\.name, rel: picked\.rel, shared: !!picked\._shared, role: 'cell' \}\)/.test(src), '셀 규칙(PLC·ETOS)이 쓴 파일 → role cell');
ok(/const lf = usedFiles\.map\(f => \(\{ name: f\.name, rel: f\.rel, shared: !!f\.shared, role: f\.role \|\| extFileRole\(f\) \}\)\);/.test(src), '클라우드 lastFiles 에도 role 보존');

console.log('\n■ 4. 칩·모달 그리기 원문');
ok(/const _role = extFileRole\(f\);\r?\n\s*const _lb = EXT_CHIP_LABEL\[_role\] \|\| 'XL';/.test(src), '관리 칸 칩 라벨 = 이름표 상수');
ok(!/const _bn = String\(f\.name/.test(src) && !/const _tk = _bn\.match/.test(src), '파일 이름 머리글 자르기 코드 제거');
ok(/title=\{`엑셀로 열기 — \$\{_lb\} = \$\{EXT_CHIP_ROLE_KO\[_role\] \|\| ''\}\\n\$\{f\.name\}/.test(src), '툴팁: AX = 진척자료 … + 파일 전체 이름');
ok(/\{EXT_CHIP_LABEL\[extFileRole\(f\)\] \|\| 'XL'\}<\/span>   \{\/\* 관리 칸 칩과 같은 이름표/.test(src), "모달 '찾은 원본 파일' 목록에도 같은 이름표");

console.log('\n■ 5. 칩 너비 — 관리 칸 78px 안에 드는가 (9.5px 굵게: 영문 약 6px · 한글 약 9.5px, 칩 안쪽 여백 6 + 테두리 2)');
const w = (t) => [...t].reduce((a, ch) => a + (/[가-힣]/.test(ch) ? 9.5 : 6), 0) + 8;
const total = (labels) => labels.reduce((a, t) => a + w(t), 0) + 19 + 2 * labels.length;   // + 단추 19 + 간격
const before = total(['베트남', '진행']), after = total(['AX', 'L1']), prev = total(['P10', '진행']);
console.log(`     베트남·진행 ≈ ${before}px (넘침) · P10·진행 ≈ ${prev}px · AX·L1 ≈ ${after}px`);
ok(after < 78 - 8 && after < prev, 'AX·L1 이 종전 P10·진행보다 좁고 칸 안에 넉넉히 듦', { before, prev, after });

console.log('\n■ 6. Back_up 폴더 제외 정규식 원문 실행');
const reLine = grabLine(/if \(\/back\[\\s_-\]\*up\|백업\/i\.test\(String\(entry\.name \|\| ''\)\)\) continue;/);
const reSrc = reLine.match(/\/(back[^/]*)\/i/);
const re = new RegExp(reSrc[1], 'i');
['Backup', 'backup', 'Back_up', 'Back-up', 'Back up', '백업', '백업본', 'BACKUP_old'].forEach(n => ok(re.test(n), '제외: ' + n));
['02 진척자료(AX)', '01 진행현황_L1L2', '05 수행_작업 지도서', 'AX 공사'].forEach(n => ok(!re.test(n), '유지: ' + n));

console.log('\n' + '='.repeat(60));
console.log(`결과: ${pass}/${pass + fail} 통과` + (fail ? `  ★ 실패 ${fail}건` : '  ✓'));
process.exit(fail ? 1 : 0);
