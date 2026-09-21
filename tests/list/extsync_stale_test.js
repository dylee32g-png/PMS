/* 2026-09-21 NAS _extSync 되돌아감 사고 — 재현 + 수리 검증
 *   ① 옛 코드(백업)의 저장식을 그대로 꺼내 파이어스토어 merge 규칙으로 돌려 사고를 재현한다
 *      (규칙 옛것으로 원복 · 파일 목록 2→1 · 마지막 반영 기록의 PLC 는 남음 = 9/21 화면과 동일)
 *   ② 고친 코드의 저장식으로 같은 상황을 돌리면 규칙이 살아남는지
 *   ③ 최신 사본 도우미(extFreshRow) 원문 실행
 *   ④ 실제 베트남 파일로 옛 규칙/새 규칙 판정 (규칙이 바뀌었다가 되돌아갔다는 증거)
 */
const fs = require('fs');
const path = require('path');
const SRC = path.resolve(__dirname, '..', '..', 'src', 'components', 'ProjectListScreen.jsx');
const BAK = SRC + '.bak-2026-09-21-extsync';
const src = fs.readFileSync(SRC, 'utf8');
// 옛 코드(2026-09-21 수리 전)의 저장식 4줄 — 백업 파일이 없는 PC·세션에서도 사고를 재현할 수 있게 원문 그대로 박아 둠
const OLD_LINES = [
    "await setDoc(rowDocRef(currentTeam, row._id), { _extSync: { ...(row._extSync || {}), lastFiles: lf } }, { merge: true });",
    "_extSync: { ...(row._extSync || {}), lastApplied: { ...((row._extSync || {}).lastApplied || {}), [p.target]: { value: p.to, fileName: p.fileName, rel: p.fileRel || '', shared: !!p.shared, at: new Date().toISOString() } } },",
    "await setDoc(rowDocRef(currentTeam, row._id), stampSave({ _extSync: { ...(row._extSync || {}), ...next } }), { merge: true });",
    "stampSave({ _extSync: { ...(exRow._extSync || {}), uncPath: deleteField(), lastApplied: deleteField() } })",
].join('\n');
const bak = fs.existsSync(BAK) ? fs.readFileSync(BAK, 'utf8') : OLD_LINES;
console.log('  (옛 코드 출처: ' + (fs.existsSync(BAK) ? '백업 파일 ' + path.basename(BAK) : '검사 안에 박아 둔 원문 4줄') + ')');
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  OK   ' + m); } else { fail++; console.log('  NG   ' + m + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); } };

// ── 파이어스토어 setDoc(merge:true) 흉내: 맵은 재귀 합침 · 배열은 통째 교체 · DELETE 는 칸 삭제 ──
const DELETE = { __del: true };
const deleteField = () => DELETE;
const isMap = (v) => v && typeof v === 'object' && !Array.isArray(v) && v !== DELETE;
const mergeSet = (docData, patch) => {
    const out = { ...(docData || {}) };
    for (const [k, v] of Object.entries(patch || {})) {
        if (v === DELETE) { delete out[k]; continue; }
        if (isMap(v) && isMap(out[k])) out[k] = mergeSet(out[k], v);
        else out[k] = isMap(v) ? mergeSet({}, v) : v;
    }
    return out;
};
const stampSave = (d) => ({ ...d, _updatedAt: 'T', _updatedBy: 'me' });

// ── 9/21 상황 데이터 ──
const SUB = { type: 'subTable', target: '하위 공종표', filePattern: '진척자료', sheet: '진척률요약(Main)' };
const PLC_OLD = { target: 'PLC', filePattern: '01 진행현황', sheet: '#1 L1 진행현황', cells: ['O11'], op: 'sum' };
const PLC_NEW = { target: 'PLC', filePattern: '진행현황', sheet: 'L1 진행현황', cells: ['O11'], op: 'sum' };
const F1 = { name: '베트남 H3 5F Auto DT 투자 자동제어 공사 진척자료_260921.xlsx', rel: '05\\01\\02\\진척자료.xlsx', shared: false };
const F2 = { name: '진행현황_베트남 H3 5F Auto DT 투자 자동제어 공사 Project_260921.xlsx', rel: '05\\01\\01\\진행현황.xlsx', shared: false };
const UNC = '\\\\neconsys_pj\\001 Project\\...\\147 베트남';
// 클라우드 최신(반영 직후 12:41:26): 새 규칙 · 파일 2개 · PLC 반영 기록
const cloudAfterApply = { _extSync: { uncPath: UNC, rules: [SUB, PLC_NEW], lastFiles: [F1, F2],
    lastApplied: { '진행율 %': { value: 0, fileName: F1.name, rel: F1.rel, at: '11:08' }, PLC: { value: 66.7, fileName: F2.name, rel: F2.rel, at: '12:41:26' } } } };
// 어딘가(다른 창·다른 PC·검사 대기 중)에 남아 있던 낡은 사본: 규칙 고치기 전 상태
const staleRow = { _id: '147', _extSync: { uncPath: UNC, rules: [SUB, PLC_OLD], lastApplied: { '진행율 %': { value: 0, fileName: F1.name, rel: F1.rel, at: '11:08' } } } };
const lfStale = [F1];   // 낡은 규칙(01 진행현황)으로 검사하면 진척자료 1개만 찾는다

const pick = (text, re, label) => { const m = text.match(re); ok(!!m, '원문에서 저장식 찾음: ' + label); return m ? m[1] : null; };

console.log('■ 1. 사고 재현 — 옛 코드(백업)의 lastFiles 저장식을 낡은 사본으로 실행');
const oldLfExpr = pick(bak, /await setDoc\(rowDocRef\(currentTeam, row\._id\), (\{ _extSync: \{ \.\.\.\(row\._extSync \|\| \{\}\), lastFiles: lf \} \}), \{ merge: true \}\)/, '옛 lastFiles');
const oldLfPatch = new Function('row', 'lf', 'return ' + oldLfExpr)(staleRow, lfStale);
const afterOld = mergeSet(cloudAfterApply, oldLfPatch);
ok(JSON.stringify(afterOld._extSync.rules) === JSON.stringify([SUB, PLC_OLD]), '★재현: 규칙이 옛것(01 진행현황 · #1 L1)으로 되돌아감', afterOld._extSync.rules.map(r => r.filePattern));
ok(afterOld._extSync.lastFiles.length === 1, '★재현: 관리 칸 파일 칩 2 → 1', afterOld._extSync.lastFiles.map(f => f.name.slice(0, 4)));
ok(!!afterOld._extSync.lastApplied.PLC, '★재현: 마지막 반영 기록의 PLC(66.7·진행현황 파일)는 남음 → 모달 파일 목록엔 2개가 그대로 보임(화면과 일치)');

console.log('\n■ 2. 고친 코드 — 같은 낡은 사본이 같은 순간에 저장돼도');
const newLfExpr = pick(src, /await setDoc\(rowDocRef\(currentTeam, row\._id\), (\{ _extSync: \{ lastFiles: lf \} \}), \{ merge: true \}\)/, '새 lastFiles');
const afterNew = mergeSet(cloudAfterApply, new Function('row', 'lf', 'return ' + newLfExpr)(staleRow, lfStale));
ok(JSON.stringify(afterNew._extSync.rules) === JSON.stringify([SUB, PLC_NEW]), '규칙은 새것 그대로 (되돌아가지 않음)');
ok(afterNew._extSync.uncPath === UNC && !!afterNew._extSync.lastApplied.PLC, '주소·반영 기록도 그대로');

console.log('\n■ 3. 반영(lastApplied) 저장식 — 옛/새');
const oldApExpr = pick(bak, /(_extSync: \{ \.\.\.\(row\._extSync \|\| \{\}\), lastApplied: \{ \.\.\.\(\(row\._extSync \|\| \{\}\)\.lastApplied \|\| \{\}\), \[p\.target\]: \{ value: p\.to, fileName: p\.fileName, rel: p\.fileRel \|\| '', shared: !!p\.shared, at: new Date\(\)\.toISOString\(\) \} \} \}),/, '옛 lastApplied');
const p = { target: 'PLC', to: 66.7, fileName: F2.name, fileRel: F2.rel, shared: false };
const oldAp = new Function('row', 'p', 'return { ' + oldApExpr + ' }')(staleRow, p);
const afterOldAp = mergeSet({ _extSync: { uncPath: UNC, rules: [SUB, PLC_NEW], lastFiles: [F1, F2] } }, oldAp);
ok(afterOldAp._extSync.rules[1].filePattern === '01 진행현황', '옛 반영식도 낡은 사본이면 규칙을 되돌림 (같은 병)');
const newApExpr = pick(src, /(_extSync: \{ lastApplied: \{ \[p\.target\]: \{ value: p\.to, fileName: p\.fileName, rel: p\.fileRel \|\| '', shared: !!p\.shared, at: new Date\(\)\.toISOString\(\) \} \} \}),/, '새 lastApplied');
const afterNewAp = mergeSet({ _extSync: { uncPath: UNC, rules: [SUB, PLC_NEW], lastFiles: [F1, F2], lastApplied: { '진행율 %': { value: 0 } } } }, new Function('row', 'p', 'return { ' + newApExpr + ' }')(staleRow, p));
ok(afterNewAp._extSync.rules[1].filePattern === '진행현황' && afterNewAp._extSync.lastFiles.length === 2, '새 반영식: 규칙·파일 목록 그대로');
ok(afterNewAp._extSync.lastApplied.PLC.value === 66.7 && afterNewAp._extSync.lastApplied['진행율 %'].value === 0, '새 반영식: PLC 기록 추가, 기존 기록(진행율 %) 유지');

console.log('\n■ 4. 규칙·경로 저장(extSaveSync) — 새 규칙 저장이 다른 칸을 안 건드리는가');
const newSvExpr = pick(src, /stampSave\((\{ _extSync: \{ \.\.\.next \} \})\), \{ merge: true \}\);   \/\/ ★ 바뀐 칸만/, '새 extSaveSync');
const afterSv = mergeSet(cloudAfterApply, stampSave(new Function('row', 'next', 'return ' + newSvExpr)(staleRow, { rules: [SUB] })));
ok(afterSv._extSync.rules.length === 1 && afterSv._extSync.lastFiles.length === 2 && afterSv._extSync.uncPath === UNC, '규칙 삭제 저장: rules 만 바뀜, lastFiles·주소 유지');
const afterSv2 = mergeSet(afterSv, stampSave(new Function('row', 'next', 'return ' + newSvExpr)(staleRow, { rules: [SUB, PLC_NEW] })));
ok(afterSv2._extSync.rules.length === 2 && afterSv2._extSync.rules[1].sheet === 'L1 진행현황', '규칙 추가 저장: rules 교체(배열 통째) — 의도대로');
const oldSvExpr = pick(bak, /stampSave\((\{ _extSync: \{ \.\.\.\(row\._extSync \|\| \{\}\), \.\.\.next \} \})\), \{ merge: true \}\);/, '옛 extSaveSync');
const afterOldSv = mergeSet(cloudAfterApply, stampSave(new Function('row', 'next', 'return ' + oldSvExpr)({ _extSync: { uncPath: UNC, rules: [SUB, PLC_NEW], lastFiles: [F1] } }, { folder: '' })));
ok(afterOldSv._extSync.lastFiles.length === 1, '(참고) 옛 저장식은 폴더 한 칸 저장에도 사본의 lastFiles 를 같이 덮어씀 = 파일 칩이 사라지는 또 다른 길');

console.log('\n■ 5. NAS 잔재 정리 — 지우는 칸만');
const clExpr = pick(src, /stampSave\((\{ _extSync: \{ uncPath: deleteField\(\), lastApplied: deleteField\(\) \} \})\), \{ merge: true \}\)/, '새 잔재 정리');
const afterCl = mergeSet(cloudAfterApply, stampSave(new Function('deleteField', 'return ' + clExpr)(deleteField)));
ok(!('uncPath' in afterCl._extSync) && !('lastApplied' in afterCl._extSync) && afterCl._extSync.rules.length === 2, '주소·반영 기록만 지우고 규칙은 유지');

console.log('\n■ 6. 최신 사본 도우미 원문 실행');
const a = src.indexOf('    const extFreshRows = ');
const b = src.indexOf('    const extCheckRow = async (rowIn');
ok(a > 0 && b > a, '도우미 2개 소스에서 찾음');
const helpers = src.slice(a, b);
const mk = (cache, team, fb) => new Function('_memRowsCache', 'currentTeam', 'fbRows', helpers + '\n return { extFreshRows, extFreshRow };')(cache, team, fb);
const fresh147 = { _id: '147', _extSync: { rules: [SUB, PLC_NEW] } };
const h = mk({ '기술2팀': [{ _id: '010' }, fresh147] }, '기술2팀', [staleRow]);
ok(h.extFreshRow(staleRow) === fresh147, '낡은 사본을 주면 캐시의 최신 사본을 돌려줌');
ok(h.extFreshRow('147') === fresh147, 'id 로도 찾음');
ok(h.extFreshRow({ _id: '999', x: 1 }).x === 1, '캐시에 없는 행은 준 사본 그대로(안전)');
ok(h.extFreshRow('999') === null, '없는 id 는 null');
const h2 = mk({}, '기술2팀', [staleRow]);
ok(h2.extFreshRows() === h2.extFreshRows() && h2.extFreshRow('147') === staleRow, '캐시가 비면 fbRows 로 대체');

console.log('\n■ 7. 검사 도중 규칙 변경 감시 — 판정식');
const guard = src.match(/const rowNow = extFreshRow\(row\) \|\| row;\r?\n\s*if \(JSON\.stringify\(extRulesOf\(rowNow\)\) !== JSON\.stringify\(rules\)\) \{\r?\n\s*if \(!_retry\) return extCheckRow\(rowNow, \{ silent, _retry: true \}\);/);
ok(!!guard, '감시 코드 존재: 규칙이 바뀌었으면 최신 사본으로 1회 재검사');
ok(/extSetStatus\(row\._id, \{ state: 'error', msg: '검사 중 규칙이 바뀜/.test(src), '재검사 뒤에도 바뀌면 사람에게 안내');
ok(/const row = extFreshRow\(rowIn\) \|\| rowIn;/.test(src), '검사 시작 시 최신 사본으로 교체');
const cmp = (rowNow, rules) => JSON.stringify((rowNow._extSync || {}).rules || []) !== JSON.stringify(rules);
ok(cmp(fresh147, [SUB, PLC_OLD]) === true, '판정: 옛 규칙으로 시작한 검사 vs 지금 새 규칙 → 바뀜(폐기)');
ok(cmp(fresh147, [SUB, PLC_NEW]) === false, '판정: 같은 규칙 → 통과');

console.log('\n■ 8. 원문 전수 — 행 사본 전체 덮어쓰기 남은 곳 없는가');
ok(!/setDoc\([^\n]*\.\.\.\((row|exRow)\._extSync \|\| \{\}\)/.test(src), 'setDoc 줄에 ...(row._extSync) 스프레드 0곳');
ok((src.match(/\.\.\.\((row|exRow)\._extSync/g) || []).length === 0, '_extSync 스프레드 자체 0곳', (src.match(/\.\.\.\((row|exRow)\._extSync/g) || []).length);
ok((src.match(/fbRows\.find\(r => r\._id === p\.rowId\)/g) || []).length === 0 && (src.match(/extFreshRow\(p\.rowId\)/g) || []).length === 4, '반영 함수 행 찾기 4곳 = 최신 사본');
ok(/const subs2 = extFreshRows\(\)\.filter/.test(src) && /extFreshRows\(\)\.forEach\(r => \{ if \(String\(r\._id\)\.startsWith\(`\$\{parentRow\._id\}_sub`\)\)/.test(src), '하위 행 탐색 2곳 = 최신 사본');
ok((bak.match(/\.\.\.\((row|exRow)\._extSync/g) || []).length === 4, '(대조) 백업본엔 스프레드 4곳 있었음 (lastFiles·lastApplied·규칙저장·잔재정리)', (bak.match(/\.\.\.\((row|exRow)\._extSync/g) || []).length);

console.log('\n■ 9. 실제 베트남 파일로 옛 규칙/새 규칙 판정 (규칙이 바뀌었다가 되돌아갔다는 근거)');
try {
    let XLSX = null; try { XLSX = require('xlsx'); } catch (e0) {}
    const pld = fs.readFileSync(path.resolve(__dirname, '..', '..', 'src', 'components', 'projectListData.js'), 'utf8');
    const grab = (name) => { const m = pld.match(new RegExp('export const ' + name + ' = ([\\s\\S]*?)\\n\\};?\\n')); return m ? m[1] : null; };
    const extNormSrc = pld.match(/const extNorm = \(v\) => [^\n]*/)[0];
    const fnSrc = extNormSrc + '\nconst extNameDate = ' + grab('extNameDate') + '\n};\nconst pickLatestExtFile = ' + grab('pickLatestExtFile') + '\n};\nconst expandExtCells = ' + grab('expandExtCells') + '\n};\nconst computeExtRuleValue = ' + grab('computeExtRuleValue') + '\n};\nreturn { pickLatestExtFile, computeExtRuleValue };';
    const { pickLatestExtFile, computeExtRuleValue } = new Function(fnSrc)();
    const files = [F1, F2].map(f => ({ ...f, lastModified: 1 }));
    ok(pickLatestExtFile(files, PLC_OLD.filePattern) === null, "옛 규칙 '01 진행현황' → 파일 못 찾음 (폴더 이름의 01 은 안 봄)");
    ok(pickLatestExtFile(files, PLC_NEW.filePattern) && pickLatestExtFile(files, PLC_NEW.filePattern).name === F2.name, "새 규칙 '진행현황' → 진행현황 파일 1개만 걸림");
    // 워크북: xlsx 모듈이 있으면 실제 파일, 없으면 inspect_vn_xlsx.py(openpyxl)로 읽어 둔 실측값(시트 'L1 진행현황' 1장 · O11=0.6666)으로 같은 모양을 만든다
    const wb = XLSX ? XLSX.read(fs.readFileSync(path.join(__dirname, 'vn_progress.xlsx')), { type: 'buffer' })
                    : { Sheets: { 'L1 진행현황': { O11: { v: 0.6666 } } } };
    console.log('  (워크북 출처: ' + (XLSX ? '실제 파일 vn_progress.xlsx' : 'openpyxl 실측값 재구성') + ')');
    const rOld = computeExtRuleValue(wb, PLC_OLD), rNew = computeExtRuleValue(wb, PLC_NEW);
    ok(!!rOld.error, "옛 규칙 시트 '#1 L1 진행현황' → 오류(시트 없음)", rOld.error);
    ok(rNew.value === 66.7, "새 규칙 시트 'L1 진행현황' O11 → 66.7 = 화면의 '반영됨 PLC=66.7'", rNew);
} catch (e) { console.log('  (건너뜀) xlsx 모듈/파일 없음: ' + e.message); }

console.log('\n' + '='.repeat(60));
console.log(`결과: ${pass}/${pass + fail} 통과` + (fail ? `  ★ 실패 ${fail}건` : '  ✓'));
process.exit(fail ? 1 : 0);
