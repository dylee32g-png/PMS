/* 중간 삽입(행 순서) 검사 (2026-10-01 팀장님: 복사한 행을 맨 끝이 아니라 원하는 프로젝트 위/아래에)
 *   projectListData.js의 orderListRows·placeDraftRows·planReanchorOnDelete 원문을 그대로 꺼내 실행하고,
 *   '엑셀에서 행을 넣고 빼듯 움직이는 모형'과 무작위 화면 조작 수천 번을 대조한다.
 *   + List·휴대폰·기술1팀 월간보고가 같은 순서 함수를 쓰는지, 우클릭 메뉴·저장·삭제 연결을 원문으로 확인.
 *   (크롬 없음, 몇 초)
 */
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..', '..');
const rd = (f) => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n');
const dataSrc = rd('src/components/projectListData.js');
const plsSrc = rd('src/components/ProjectListScreen.jsx');
const mobSrc = rd('src/components/MobileInputScreen.jsx');
const t1mSrc = rd('src/components/Tech1MonthlyScreen.jsx');
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  OK   ' + m); } else { fail++; console.log('  NG   ' + m + (x !== undefined ? '  → ' + x : '')); } };

// ── 원문 떼어 실행 ─────────────────────────────────────────────────────
const A0 = dataSrc.indexOf('// ── 행 순서 · 중간 삽입 (2026-10-01');
const B0 = dataSrc.indexOf('// ── 행 순서 · 중간 삽입 끝 ──');
ok(A0 > 0 && B0 > A0, '순서 함수 구역을 projectListData.js에서 찾음');
const { isSubRowByExec, orderListRows, placeDraftRows, planReanchorOnDelete, planMoveRows } =
    new Function(dataSrc.slice(A0, B0).replace(/^export /gm, '') + '\n return { isSubRowByExec, orderListRows, placeDraftRows, planReanchorOnDelete, planMoveRows };')();
const isSub = isSubRowByExec;

// ── 도우미 ────────────────────────────────────────────────────────────
const ids = (arr) => arr.map(r => r._id);
const eq = (x, y) => JSON.stringify(x) === JSON.stringify(y);
const up = (y, i, ex) => ({ _id: `row_${y}_1720000000000_${String(i).padStart(5, '0')}`, _year: String(y), 실행번호: '', ...ex });   // 엑셀로 올린 행
const sb = (pid, n, y) => ({ _id: `${pid}_sub${String(n).padStart(2, '0')}`, _year: String(y), 실행번호: 's' });                     // 웹 하위(공종) 행
const mn = (ts, i, y, ex) => ({ _id: `row_manual_${ts}_${String(i).padStart(3, '0')}abcde`, _year: String(y), 실행번호: '', ...ex });   // 웹에서 만든 행
const nm = (rows) => rows.map(r => r.nm || r._id.slice(-5)).join(' ');
function rng(seed) { let t = seed >>> 0; return () => { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }

console.log('■ 1. 쪽지가 하나도 없으면 종전(_id 글자순)과 똑같은가');
{
    const p1 = up(2026, 1);
    const rows = [up(2026, 3), p1, mn(1730000000000, 0, 2026), up(2025, 2), sb(p1._id, 1, 2026), up(2026, 2), { _id: 'row_2026_x', _year: '2026', 실행번호: '-1' }];
    const old = [...rows].sort((p, q) => String(p._id).localeCompare(String(q._id)));
    const got = orderListRows(rows);
    ok(eq(ids(got), ids(old)), '순서 = 종전 정렬', ids(got).join(' '));
    ok(got.every((r, i) => r === old[i]), '행 객체를 복사하지 않음 (화면 재사용 유지)');
    ok(got[got.length - 1]._id.startsWith('row_manual_'), '웹에서 만든 행은 맨 뒤 — 오늘 요청의 출발점 재현');
    ok(isSub({ 실행번호: 's' }) && isSub({ 실행번호: ' S ' }) && isSub({ 실행번호: '-2' }) && !isSub({ 실행번호: '26-001' }) && !isSub({}), '하위 판별 = List isSubListRow와 같은 규칙(s · -로 시작)');
    const lsr = plsSrc.match(/const isSubListRow = \(r\) => \{ (.*?) \};/);
    ok(lsr && dataSrc.includes(lsr[1]), 'isSubRowByExec 본문이 List isSubListRow 원문과 글자까지 같음');
}

console.log('\n■ 2. 위에/아래에 삽입 — 하위(공종) 묶음은 쪼개지지 않는가');
{
    const A = up(2026, 1, { nm: 'A' }), B = up(2026, 2, { nm: 'B' }), b1 = { ...sb(B._id, 1, 2026), nm: 'b1' }, b2 = { ...sb(B._id, 2, 2026), nm: 'b2' }, C = up(2026, 3, { nm: 'C' });
    const N = mn(1730000000000, 0, 2026, { nm: 'N', _place: { id: B._id, side: 'after', at: 10 } });
    ok(nm(orderListRows([C, N, b2, A, b1, B])) === 'A B b1 b2 N C', 'B 아래 삽입 = B의 하위 뒤 · C 앞', nm(orderListRows([C, N, b2, A, b1, B])));
    const M = mn(1730000000001, 0, 2026, { nm: 'M', _place: { id: B._id, side: 'before', at: 11 } });
    ok(nm(orderListRows([C, N, b2, A, b1, B, M])) === 'A M B b1 b2 N C', 'B 위 삽입 = A와 B 사이', nm(orderListRows([C, N, b2, A, b1, B, M])));
    const T = mn(1730000000002, 0, 2026, { nm: 'T', _place: { id: A._id, side: 'before', at: 12 } });
    const E = mn(1730000000003, 0, 2026, { nm: 'E', _place: { id: C._id, side: 'after', at: 13 } });
    ok(nm(orderListRows([E, C, N, b2, A, b1, B, M, T])) === 'T A M B b1 b2 N C E', '맨 위 행의 위 · 맨 아래 행의 아래도 됨', nm(orderListRows([E, C, N, b2, A, b1, B, M, T])));
    const n1 = sb(N._id, 1, 2026); n1.nm = 'n1';
    ok(nm(orderListRows([E, C, N, b2, A, b1, B, M, T, n1])) === 'T A M B b1 b2 N n1 C E', '넣은 행에 하위를 추가해도 그 행을 따라감', nm(orderListRows([E, C, N, b2, A, b1, B, M, T, n1])));
    // 엑셀 업로드 하위(실행번호 s 줄, _id가 부모와 무관 — 위치로 부모 결정)도 묶음째
    const P = up(2026, 4, { nm: 'P' }), ps = { ...up(2026, 5), 실행번호: 's', nm: 'ps' }, Q = up(2026, 6, { nm: 'Q' });
    const K = mn(1730000000004, 0, 2026, { nm: 'K', _place: { id: P._id, side: 'after', at: 14 } });
    ok(nm(orderListRows([Q, K, ps, P])) === 'P ps K Q', '엑셀 위치형 하위도 쪼개지지 않음', nm(orderListRows([Q, K, ps, P])));
}

console.log('\n■ 3. 여러 행을 한꺼번에 — 복사한 순서 그대로인가');
{
    const A = up(2026, 1, { nm: 'A' }), B = up(2026, 2, { nm: 'B' });
    const x = mn(1730000000000, 0, 2026, { nm: 'x', _place: { id: A._id, side: 'after', at: 5 } });
    const y = mn(1730000000000, 1, 2026, { nm: 'y', _place: { id: x._id, side: 'after', at: 5 } });
    const z = mn(1730000000000, 2, 2026, { nm: 'z', _place: { id: y._id, side: 'after', at: 5 } });
    ok(nm(orderListRows([z, B, y, A, x])) === 'A x y z B', '아래 삽입 3행 = x y z 순서', nm(orderListRows([z, B, y, A, x])));
    const u = mn(1730000000001, 0, 2026, { nm: 'u', _place: { id: B._id, side: 'before', at: 6 } });
    const v = mn(1730000000001, 1, 2026, { nm: 'v', _place: { id: u._id, side: 'after', at: 6 } });
    ok(nm(orderListRows([v, u, B, A])) === 'A u v B', '위 삽입 2행 = u v 순서 그대로 B 위', nm(orderListRows([v, u, B, A])));
    // Ctrl+V(맨 아래) 여러 행: 새 ID가 시각 1번 + 3자리 순번 → 같은 1/1000초여도 복사 순서
    const r0 = { _id: 'row_manual_1730000000000_000zzzzz', _year: '2026', nm: 'r0' }, r1 = { _id: 'row_manual_1730000000000_001aaaaa', _year: '2026', nm: 'r1' }, r2 = { _id: 'row_manual_1730000000000_002mmmmm', _year: '2026', nm: 'r2' };
    ok(nm(orderListRows([r2, r0, r1])) === 'r0 r1 r2', 'Ctrl+V 여러 행 = 저장 뒤에도 복사 순서 (뒤 무작위 글자와 무관)', nm(orderListRows([r2, r0, r1])));
}

console.log('\n■ 4. 같은 자리에 여러 번 — 엑셀처럼 나중 것이 기준 행 쪽인가');
{
    const A = up(2026, 1, { nm: 'A' }), B = up(2026, 2, { nm: 'B' }), C = up(2026, 3, { nm: 'C' });
    const p = mn(1730000000000, 0, 2026, { nm: 'p', _place: { id: B._id, side: 'after', at: 100 } });
    const q = mn(1730000000001, 0, 2026, { nm: 'q', _place: { id: B._id, side: 'after', at: 200 } });
    ok(nm(orderListRows([A, B, C, p, q])) === 'A B q p C', '아래 삽입 두 번 = 나중 것(q)이 B 바로 아래', nm(orderListRows([A, B, C, p, q])));
    const s = mn(1730000000002, 0, 2026, { nm: 's', _place: { id: B._id, side: 'before', at: 300 } });
    const t = mn(1730000000003, 0, 2026, { nm: 't', _place: { id: B._id, side: 'before', at: 400 } });
    ok(nm(orderListRows([A, B, C, p, q, s, t])) === 'A s t B q p C', '위 삽입 두 번 = 나중 것(t)이 B 바로 위', nm(orderListRows([A, B, C, p, q, s, t])));
}

console.log('\n■ 5. 쪽지가 잘못돼도 행이 사라지지 않는가 (원래 자리로)');
{
    const A = up(2026, 1, { nm: 'A' }), B = up(2026, 2, { nm: 'B' }), b1 = { ...sb(B._id, 1, 2026), nm: 'b1' }, Z = up(2025, 9, { nm: 'Z' });
    const lost = mn(1730000000000, 0, 2026, { nm: 'lost', _place: { id: 'row_없는_행', side: 'after', at: 1 } });
    const yr = mn(1730000000001, 0, 2026, { nm: 'yr', _place: { id: Z._id, side: 'after', at: 2 } });
    const toSub = mn(1730000000002, 0, 2026, { nm: 'toSub', _place: { id: b1._id, side: 'after', at: 3 } });
    const self = mn(1730000000003, 0, 2026, { nm: 'self', _place: { id: 'row_manual_1730000000003_000abcde', side: 'after', at: 4 } });
    const bad = mn(1730000000004, 0, 2026, { nm: 'bad', _place: { id: A._id, side: 'left', at: 5 } });
    const got = orderListRows([bad, self, toSub, yr, lost, b1, B, A, Z]);
    ok(nm(got) === 'Z A B b1 lost yr toSub self bad', '없는 행·다른 연도·하위 행·자기 자신·이상한 방향 = 원래 자리(_id 순)', nm(got));
    const c1 = mn(1730000000005, 0, 2026, { nm: 'c1' }), c2 = mn(1730000000006, 0, 2026, { nm: 'c2' });
    c1._place = { id: c2._id, side: 'after', at: 1 }; c2._place = { id: c1._id, side: 'after', at: 1 };
    const cyc = orderListRows([A, B, c1, c2]);
    ok(cyc.length === 4 && ['c1', 'c2'].every(k => cyc.some(r => r.nm === k)), '꼬리 물기(c1↔c2) → 둘 다 남음 (사라지지 않음)', nm(cyc));
    ok(eq(ids(orderListRows([c2, B, c1, A])), ids(cyc)), '꼬리 물기여도 입력 순서와 무관하게 같은 결과');
}

// ── 무작위 화면 조작 모형 ────────────────────────────────────────────
//   model[연도] = 엑셀처럼 손으로 넣고 뺀 '정답 순서'. 앱 동작:
//   위/아래 삽입(1~3행, 둘째부터 꼬리 물기) · Ctrl+V(맨 아래) · 하위 추가(부모 하위 맨 뒤) · 메인 완전 삭제(하위 동반 + 쪽지 옮겨 달기) · 하위 삭제
function makeSim(seed) {
    const R = rng(seed), ri = (n) => Math.floor(R() * n);
    const rs = () => Array.from({ length: 5 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[ri(36)]).join('');
    const S = { clock: 1730000000000, store: new Map(), model: { '2025': [], '2026': [] }, par: new Map(), posPar: new Set(), R, ri, rs, log: [] };
    for (const y of ['2025', '2026']) {
        const n = 5 + ri(10); let last = null;
        for (let i = 1; i <= n; i++) {
            const r = up(y, i);
            if (last && R() < 0.15) { r.실행번호 = 's'; S.par.set(r._id, last); S.posPar.add(last); }   // 엑셀 위치형 하위
            else last = r._id;
            S.store.set(r._id, r); S.model[y].push(r._id);
        }
    }
    return S;
}
const blockEnd = (S, arr, i) => { let j = i + 1; while (j < arr.length && isSub(S.store.get(arr[j]))) j++; return j; };
const mainsOf = (S, y) => S.model[y].filter(id => !isSub(S.store.get(id)));
function simOp(S) {
    const { R, ri, rs } = S;
    const y = R() < 0.7 ? '2026' : '2025';
    const arr = S.model[y];
    const k = R();
    S.clock += 2 + ri(500);             // 옮기기는 now+1을 쓰므로 조작 간격 ≥ 2 (실제 화면 조작은 수 초 간격)
    if (k >= 0.38 && k < 0.52) {        // 잘라내기(Ctrl+X) → 옮기기 (2026-10-01): 메인 1~3행(떨어져 있어도 됨)을 다른 메인 행 위/아래로
        const ms = mainsOf(S, y); if (ms.length < 3) return;
        const cnt = 1 + ri(Math.min(3, ms.length - 1));
        const pick = new Set(); while (pick.size < cnt) pick.add(ms[ri(ms.length)]);
        const cutIds = ms.filter(id => pick.has(id));   // 화면 순서
        const others = ms.filter(id => !pick.has(id));
        const X = others[ri(others.length)], side = R() < 0.5 ? 'after' : 'before';
        const plan = planMoveRows([...S.store.values()], cutIds, X, side, isSub, S.clock);
        if (!plan) { S.bad = `옮기기 계산 실패(null) ${cutIds.length}행 → ${X}`; return; }
        plan.forEach(m => { const r = S.store.get(m.id); if (m.place) r._place = m.place; else delete r._place; });
        // 모형: 잘라낸 묶음(메인+하위)을 빼고, 기준 행 위(바로 위) / 아래(기준 행 하위 묶음 바로 뒤)에 순서대로 넣기 = 엑셀 '잘라낸 셀 삽입'
        const blocks = []; cutIds.forEach(id => { const i = arr.indexOf(id); blocks.push(...arr.slice(i, blockEnd(S, arr, i))); });
        const rest = arr.filter(id => !blocks.includes(id));
        const xi = rest.indexOf(X);
        rest.splice(side === 'after' ? blockEnd(S, rest, xi) : xi, 0, ...blocks);
        S.model[y] = rest;
        S.log.push(`옮기기 ${side} ×${cnt}`);
        return;
    }
    if (k < 0.38) {                     // 위/아래 삽입
        const ms = mainsOf(S, y); if (!ms.length) return;
        const X = ms[ri(ms.length)], side = R() < 0.5 ? 'after' : 'before', cnt = 1 + ri(3), at = S.clock;
        const nid = []; let prev = null;
        for (let i = 0; i < cnt; i++) {
            const r = { _id: `row_manual_${S.clock}_${String(i).padStart(3, '0')}${rs()}`, _year: y, 실행번호: '' };
            r._place = prev ? { id: prev, side: 'after', at } : { id: X, side, at };
            S.store.set(r._id, r); nid.push(r._id); prev = r._id;
        }
        const xi = arr.indexOf(X);
        arr.splice(side === 'after' ? blockEnd(S, arr, xi) : xi, 0, ...nid);
        S.log.push(`삽입 ${side} ×${cnt}`);
    } else if (k < 0.6) {               // Ctrl+V = 맨 아래
        const cnt = 1 + ri(3);
        for (let i = 0; i < cnt; i++) { const r = { _id: `row_manual_${S.clock}_${String(i).padStart(3, '0')}${rs()}`, _year: y, 실행번호: '' }; S.store.set(r._id, r); arr.push(r._id); }
        S.log.push(`맨아래 ×${cnt}`);
    } else if (k < 0.72) {              // 하위(공종) 추가
        const ms = mainsOf(S, y).filter(id => !S.posPar.has(id)); if (!ms.length) return;
        const P = ms[ri(ms.length)];
        let mx = 0; S.store.forEach((r, id) => { const m = id.startsWith(P + '_sub') && id.slice(P.length).match(/^_sub(\d+)$/); if (m) mx = Math.max(mx, +m[1]); });
        if (mx >= 98) return;
        const s = sb(P, mx + 1, y); S.store.set(s._id, s); S.par.set(s._id, P);
        arr.splice(blockEnd(S, arr, arr.indexOf(P)), 0, s._id);
        S.log.push('하위추가');
    } else if (k < 0.92) {              // 메인 완전 삭제 (하위 동반 + 쪽지 옮겨 달기)
        const ms = mainsOf(S, y); if (ms.length < 3) return;
        const X = ms[ri(ms.length)];
        const moves = planReanchorOnDelete([...S.store.values()], X, isSub, S.clock);
        moves.forEach(m => { const r = S.store.get(m.id); if (m.place) r._place = m.place; else delete r._place; });
        const xi = arr.indexOf(X), e = blockEnd(S, arr, xi);
        arr.slice(xi, e).forEach(id => { S.store.delete(id); S.par.delete(id); });
        arr.splice(xi, e - xi); S.posPar.delete(X);
        S.log.push(`삭제(옮김 ${moves.length})`);
    } else {                            // 하위 하나만 삭제
        const subs = arr.filter(id => isSub(S.store.get(id))); if (!subs.length) return;
        const s = subs[ri(subs.length)]; S.store.delete(s); S.par.delete(s); arr.splice(arr.indexOf(s), 1);
        S.log.push('하위삭제');
    }
}
function simCheck(S) {
    if (S.bad) return S.bad;
    const got = orderListRows([...S.store.values()]);
    if (got.length !== S.store.size) return '행 개수 다름';
    for (const y of ['2025', '2026']) if (!eq(got.filter(r => r._year === y).map(r => r._id), S.model[y])) return `${y} 순서가 모형과 다름`;
    let last = null;   // 하위 → 바로 위 메인 = 진짜 부모 (Σ포인트·삭제 동반·표시가 기대는 규칙)
    for (const r of got) { if (!isSub(r)) { last = r._id; continue; } if (S.par.get(r._id) !== last) return `하위 ${r._id} 부모 어긋남`; }
    return null;
}

console.log('\n■ 6. 무작위 화면 조작 400가지 × 40번 — 엑셀식 정답 순서와 같은가 (삭제 때 쪽지 옮겨 달기 · 잘라내기 옮기기 포함)');
{
    let bad = null, ops = 0, moved = 0, inserted = 0, cutMoves = 0;
    for (let seed = 1; seed <= 400 && !bad; seed++) {
        const S = makeSim(seed);
        for (let i = 0; i < 40 && !bad; i++) {
            simOp(S); ops++;
            const er = simCheck(S); if (er) bad = `seed ${seed} 조작 ${i + 1}(${S.log[S.log.length - 1]}): ${er} · 이력 ${S.log.slice(-6).join(' → ')}`;
        }
        S.log.forEach(l => { const m = l.match(/옮김 (\d+)/); if (m) moved += +m[1]; if (l.startsWith('삽입')) inserted++; if (l.startsWith('옮기기')) cutMoves++; });
    }
    ok(!bad, `모형과 전부 일치 (조작 ${ops}번 · 삽입 ${inserted}번 · 잘라내기 옮기기 ${cutMoves}번 · 삭제 때 옮겨 단 쪽지 ${moved}개)`, bad);
    ok(cutMoves > 500, '잘라내기 옮기기가 실제로 많이 일어남(검사가 헛돌지 않음)', cutMoves);
    ok(moved > 50, '삭제 때 쪽지 옮겨 달기가 실제로 많이 일어남(검사가 헛돌지 않음)', moved);
}

console.log('\n■ 7. 저장 전 노란 행 자리 = 저장 뒤 자리인가 ([저장] 때 쪽지 시각을 다시 찍는 규칙)');
{
    let bad = null, cases = 0, placed = 0, delD = 0, delS = 0;
    for (let seed = 1001; seed <= 2000 && !bad; seed++) {
        const S = makeSim(seed);
        for (let i = 0; i < 25; i++) simOp(S);
        if (simCheck(S)) { bad = `seed ${seed} 저장본 준비 실패`; break; }
        const { R, ri, rs } = S, y = '2026';
        const shown = orderListRows([...S.store.values()]).filter(r => r._year === y);
        const savedMains = shown.filter(r => !isSub(r));
        const drafts = [];
        const nOps = 1 + ri(4);
        for (let o = 0; o < nOps; o++) {
            S.clock += 2 + ri(300);
            const cnt = 1 + ri(3);
            if (R() < 0.25 || !savedMains.length) {   // Ctrl+V
                for (let i = 0; i < cnt; i++) drafts.push({ _id: `row_manual_${S.clock}_${String(i).padStart(3, '0')}${rs()}`, _year: y, 실행번호: '' });
            } else {                                  // 우클릭 삽입 (기준 = 저장된 메인 행 — 노란 행·하위에서는 메뉴 숨김)
                const X = savedMains[ri(savedMains.length)]._id, side = R() < 0.5 ? 'after' : 'before';
                let prev = null;
                for (let i = 0; i < cnt; i++) {
                    const id = `row_manual_${S.clock}_${String(i).padStart(3, '0')}${rs()}`;
                    drafts.push({ _id: id, _year: y, 실행번호: '', _place: prev ? { id: prev, side: 'after', at: S.clock } : { id: X, side, at: S.clock } });
                    prev = id; placed++;
                }
            }
        }
        const disp = placeDraftRows(shown, drafts, isSub);
        const placeAt = S.clock + 100000;   // [저장] 순간 = 붙여넣기보다 나중
        const saved = drafts.map((d, k) => d._place ? { ...d, _place: { ...d._place, at: placeAt + k } } : d);
        const fin = orderListRows([...S.store.values(), ...saved]).filter(r => r._year === y);
        cases++;
        if (!eq(ids(disp), ids(fin))) bad = `seed ${seed}: 노란 행 표시 ≠ 저장 뒤 순서`;
        // 지우기(노란 행 · 저장된 메인 — 같은 상태에서 둘 다) 뒤에도 나머지가 제자리인가 — 앱 deleteRow와 같은 계산
        for (const pickDraft of [true, false]) {
            if (bad) break;
            const allNow = [...S.store.values(), ...drafts];
            const target = pickDraft ? (drafts.length ? drafts[ri(drafts.length)] : null) : (savedMains.length > 2 ? savedMains[ri(savedMains.length)] : null);
            if (target) {
                if (pickDraft) delD++; else delS++;
                // 앱 deleteRow와 같은 두 계산: 저장된 행 = 저장된 행끼리만 / 노란 행 = 노란 행 포함 화면 순서
                const isDr = (id) => drafts.some(d => d._id === id);
                const movesS = planReanchorOnDelete([...S.store.values()], target._id, isSub, placeAt - 1);
                const movesD = planReanchorOnDelete(allNow, target._id, isSub, placeAt - 1, { view: disp, only: r => isDr(r._id) });
                const st2 = new Map([...S.store].map(([k2, v]) => [k2, { ...v }]));
                const dr2 = drafts.map(d => ({ ...d }));
                movesS.forEach(m => { const r = st2.get(m.id); if (m.place) r._place = m.place; else delete r._place; });
                movesD.forEach(m => { const r = dr2.find(d => d._id === m.id); if (m.place) r._place = m.place; else delete r._place; });
                if (movesS.some(m => m.place && isDr(m.place.id))) bad = `seed ${seed}: 저장된 행의 새 기준이 노란 행`;
                const ti = disp.findIndex(r => r._id === target._id); let te = ti + 1; while (te < disp.length && isSub(disp[te])) te++;
                const gone = new Set(disp.slice(ti, te).map(r => r._id));
                gone.forEach(g => st2.delete(g));
                const dr3 = dr2.filter(d => !gone.has(d._id));
                const disp2 = placeDraftRows(orderListRows([...st2.values()]).filter(r => r._year === y), dr3, isSub);
                if (!eq(ids(disp2), ids(disp).filter(i2 => !gone.has(i2)))) bad = `seed ${seed}: ${pickDraft ? '노란 행' : '저장 행'} 지운 뒤 나머지 순서가 바뀜`;
                // 지운 뒤 노란 행을 [저장]해도 그 자리 그대로인가 (옮겨 단 쪽지도 저장 순간 시각으로 다시 찍힘)
                const placeAt2 = placeAt + 100000;
                const saved2 = dr3.map((d, k2) => d._place ? { ...d, _place: { ...d._place, at: placeAt2 + k2 } } : d);
                const fin2 = orderListRows([...st2.values(), ...saved2]).filter(r => r._year === y);
                if (!bad && !eq(ids(fin2), ids(disp2))) bad = `seed ${seed}: ${pickDraft ? '노란 행' : '저장 행'} 지운 뒤 [저장]하면 순서가 바뀜`;
            }
        }
    }
    ok(!bad, `노란 행 자리 = 저장 뒤 자리 (경우 ${cases}가지 · 삽입 행 ${placed}개) + 지운 뒤 나머지 제자리·지운 뒤 저장해도 제자리 (노란 행 ${delD}번 · 저장 행 ${delS}번 지움)`, bad);
    // 기준 행이 화면에 없으면(칩·검색에 걸림) 맨 아래 — 종전 규칙
    const A = up(2026, 1, { nm: 'A' }), B = up(2026, 2, { nm: 'B' });
    const d1 = mn(1730000000000, 0, 2026, { nm: 'd1', _place: { id: 'row_화면에_없음', side: 'after', at: 1 } });
    const d2 = mn(1730000000001, 0, 2026, { nm: 'd2', _place: { id: d1._id, side: 'after', at: 1 } });
    const d3 = mn(1730000000002, 0, 2026, { nm: 'd3' });
    ok(nm(placeDraftRows([A, B], [d1, d2, d3], isSub)) === 'A B d1 d2 d3', '기준 행이 안 보이면 맨 아래 (꼬리 물기 순서 유지)', nm(placeDraftRows([A, B], [d1, d2, d3], isSub)));
    ok(placeDraftRows([A, B], [], isSub).length === 2, '노란 새 행이 없으면 그대로');
}

console.log('\n■ 8. [완전 삭제] 쪽지 옮겨 달기 — 대표 경우');
{
    const A = up(2026, 1, { nm: 'A' }), X = up(2026, 2, { nm: 'X' }), x1 = { ...sb(X._id, 1, 2026), nm: 'x1' }, C = up(2026, 3, { nm: 'C' });
    const b1 = mn(1730000000000, 0, 2026, { nm: 'b1', _place: { id: X._id, side: 'before', at: 1 } });
    const b2 = mn(1730000000000, 1, 2026, { nm: 'b2', _place: { id: b1._id, side: 'after', at: 1 } });
    const a1 = mn(1730000000001, 0, 2026, { nm: 'a1', _place: { id: X._id, side: 'after', at: 2 } });
    const a2 = mn(1730000000002, 0, 2026, { nm: 'a2', _place: { id: X._id, side: 'after', at: 1 } });
    const rows = [A, X, x1, C, b1, b2, a1, a2];
    ok(nm(orderListRows(rows)) === 'A b1 b2 X x1 a1 a2 C', '지우기 전', nm(orderListRows(rows)));
    const mv = planReanchorOnDelete(rows, X._id, isSub, 99);
    ok(mv.length === 3 && mv.every(m => m.place && m.place.side), `직접 자식 3개(b1·a1·a2)만 옮김 · b2(b1의 자식)는 그대로`, JSON.stringify(mv.map(m => [m.id.slice(-8), m.place && m.place.id.slice(-5), m.place && m.place.side])));
    const after = rows.filter(r => r !== X && r !== x1).map(r => ({ ...r }));
    mv.forEach(m => { const r = after.find(q => q._id === m.id); if (m.place) r._place = m.place; else delete r._place; });
    ok(nm(orderListRows(after)) === 'A b1 b2 a1 a2 C', 'X(+하위) 지운 뒤 = 나머지 제자리', nm(orderListRows(after)));
    // 맨 위 행을 지울 때 = 'X 묶음 바로 뒤 행'의 위로
    const T = up(2026, 1, { nm: 'T' }), U = up(2026, 2, { nm: 'U' });
    const k1 = mn(1730000000003, 0, 2026, { nm: 'k1', _place: { id: T._id, side: 'after', at: 1 } });
    const mv2 = planReanchorOnDelete([T, U, k1], T._id, isSub, 99);
    ok(mv2.length === 1 && mv2[0].place.id === U._id && mv2[0].place.side === 'before', '맨 위 행 삭제 → 자식은 다음 행(U)의 위로', JSON.stringify(mv2));
    // 그 해에 X와 자식만 있으면 = 쪽지 지움(원래 자리)
    const W = up(2026, 1, { nm: 'W' }), w1 = mn(1730000000004, 0, 2026, { nm: 'w1', _place: { id: W._id, side: 'after', at: 1 } });
    const mv3 = planReanchorOnDelete([W, w1, up(2025, 5)], W._id, isSub, 99);
    ok(mv3.length === 1 && mv3[0].place === null, '그 해에 다른 행이 없으면 쪽지 지움 (다른 연도 행은 기준 안 됨)', JSON.stringify(mv3));
    ok(planReanchorOnDelete(rows, x1._id, isSub, 99).length === 0, '하위 행을 지울 때는 옮길 것 없음');
    ok(planReanchorOnDelete(rows, C._id, isSub, 99).length === 0, '자식 없는 행을 지울 때는 옮길 것 없음 (쓰기 0)');
}

console.log('\n■ 9. 앱 원문 연결 — List·휴대폰·기술1팀 월간보고 / 우클릭 메뉴 / 저장 / 삭제');
{
    ok(/const r = orderListRows\(snap\.docs\s*\n\s*\.map\(d => \{ const pv = _prevMap\.get\(d\.id\);/.test(plsSrc), 'List 구독 = orderListRows (행 객체 재사용 그대로)');
    ok(/const webRows = orderListRows\(fbRows\.filter\(/.test(plsSrc), '연도별 1:1 검증도 화면과 같은 순서');
    ok(/const rows = orderListRows\(rowsSnap\.docs/.test(mobSrc) && /orderListRows \} from '\.\/projectListData'/.test(mobSrc), '휴대폰 카드 = 같은 순서');
    ok(/const r = orderListRows\(snap\.docs\.map\(/.test(t1mSrc) && /orderListRows \} from '\.\/projectListData'/.test(t1mSrc), '기술1팀 월간보고 = 같은 순서');
    const left = [plsSrc, mobSrc, t1mSrc].map(s => (s.match(/String\(a\._id\)\.localeCompare\(String\(b\._id\)\)/g) || []).length);
    ok(left.every(n => n === 0), '세 화면에 옛 _id 정렬이 남아 있지 않음', left.join(','));
    // 우클릭 메뉴
    const menu = plsSrc.slice(plsSrc.indexOf('{/* ★ 복사한 행을 이 행 위/아래에 삽입'), plsSrc.indexOf('{/* ★ 이 행 복사해서 추가'));
    ok(menu.length > 200, '우클릭 메뉴에 삽입 구역이 [서식] 아래·[이 행 복사해서 추가] 위에 있음');
    ok(/if \(!clip \|\| !clip\.rows\.length \|\| clip\.team !== currentTeam \|\| dataSource !== 'firebase'\s*\n\s*\|\| isSubListRow\(contextMenu\.row\) \|\| isDraftNew\(contextMenu\.row\._id\)\) return null;/.test(menu),
        '복사한 행(같은 팀)이 있을 때만 · 하위 행·노란 새 행에서는 숨김');
    ok(/const off = !!sortConfig\.key;/.test(menu) && /disabled=\{off\} onClick=\{\(\) => go\('before'\)\}/.test(menu) && /disabled=\{off\} onClick=\{\(\) => go\('after'\)\}/.test(menu), '정렬 중엔 두 줄 모두 흐리게(누를 수 없음)');
    ok(/pasteCopiedRows\(\{ row: r, side \}\)/.test(menu) && /이 행 위에 삽입/.test(menu) && /이 행 아래에 삽입/.test(menu), '[이 행 위에 삽입]·[이 행 아래에 삽입] → 붙여넣기(기준 행·방향)');
    ok(/el\.offsetHeight/.test(plsSrc) && /maxHeight: window\.innerHeight - 16, overflowY: 'auto'/.test(plsSrc), '메뉴가 길어져도 화면 안에 들어오게(실제 높이로 위치)');
    // 붙여넣기
    ok(/pasteRowsRef\.current\(\);/.test(plsSrc), 'Ctrl+V = 기준 행 없이 호출 → 종전대로 맨 아래');
    ok(/const pasteCopiedRows = async \(target\) => \{/.test(plsSrc), '붙여넣기 함수가 기준 행(target)을 받음');
    ok(/if \(anchor\) newRow\._place = prevId \? \{ id: prevId, side: 'after', at: pasteTs \} : \{ id: anchor\._id, side: target\.side === 'before' \? 'before' : 'after', at: pasteTs \};/.test(plsSrc),
        '첫 행 = 기준 행 위/아래 · 둘째 행부터 = 앞 새 행 바로 아래');
    ok(/const yr = String\(\(anchor && anchor\._year\) \|\| selectedYear/.test(plsSrc), '넣는 행의 연도 = 기준 행의 연도');
    ok(/row_manual_\$\{pasteTs\}_\$\{String\(i\)\.padStart\(3, '0'\)\}/.test(plsSrc), '새 ID = 시각 1번 + 3자리 순번 (Ctrl+V 여러 행도 복사 순서)');
    const addRow = plsSrc.slice(plsSrc.indexOf('const handleOpenAddRow'), plsSrc.indexOf('const handleAddSubRow'));
    ok(addRow.length > 100 && !/_place/.test(addRow), '[이 행 복사해서 추가]·[+ 추가] = 쪽지 없음 → 종전대로 맨 아래');
    ok(/newRow\[h\] = src\[h\] \|\| ''; \}\);\s+\/\/ 엑셀 항목만 복사\(_ 내부필드 제외/.test(plsSrc), '복사한 행의 쪽지(_place)는 따라오지 않음 (엑셀 항목만 복사)');
    // 표시·저장·삭제
    ok(/return sortConfig\.key \? \[\.\.\.shown, \.\.\.draftNewRows\] : placeDraftRows\(shown, draftNewRows, isSubListRow\);/.test(plsSrc), '노란 새 행 = 기준 행 위/아래 (정렬 중엔 맨 아래)');
    ok(/const patchP = patch\._place \? \{ \.\.\.patch, _place: \{ \.\.\.patch\._place, at: placeAt \+ okNew \} \} : patch;/.test(plsSrc) && /const fin0 = \{ _id: id, \.\.\.patchP \};/.test(plsSrc), '[저장] 때 쪽지 시각 = 저장 순간 (+순번)');
    ok(/const movesSaved = planReanchorOnDelete\(fbRows, id, isSubListRow\);/.test(plsSrc), '[완전 삭제] 저장된 행 = 저장된 행끼리만 기준 (노란 행에 안 기댐)');
    ok(/const movesDraft = _dYrDrafts\.length \? planReanchorOnDelete\(\[\.\.\.fbRows, \.\.\.draftNewRows\], id, isSubListRow, Date\.now\(\),\s*\n\s*\{ view: placeDraftRows\(orderListRows\(fbRows\.filter\(r => String\(r\._year \|\| ''\) === _dYr\)\), _dYrDrafts, isSubListRow\), only: r => isDraftNew\(r\._id\) \}\) : \[\];/.test(plsSrc),
        '[완전 삭제] 노란 새 행 = 지우기 전 화면(노란 행 포함, 그 해 전체)에서 옮겨 달기');
    ok(/for \(const m of movesSaved\) await setDoc\(rowDocRef\(currentTeam, m\.id\), stampSave\(\{ _place: m\.place \|\| deleteField\(\) \}\), \{ merge: true \}\)/.test(plsSrc), '옮겨 달기 = _place 한 칸만 merge (행 사본 통째 쓰기 아님 — 9/21 원칙)');
    // 보존: 엑셀 반영·확정 저장(보존 병합)·백업 복원
    const merge = dataSrc.slice(dataSrc.indexOf('export function computeMergePlan'), dataSrc.indexOf('// ─── 엑셀 헤더 파싱'));
    ok(/const \{ _id, \.\.\.base \} = m;/.test(merge) && /const data = \{ \.\.\.base \};/.test(merge), '엑셀 반영·확정 저장 = 기존 행 전체(쪽지 포함)에 엑셀 칸만 덮음 → 자리 유지');
    ok(/for \(const r of bkRows\) \{ const \{ _id, \.\.\.rest \} = r; batch\.set\(rowDocRef\(currentTeam, _id\), rest\);/.test(plsSrc), '백업 복원 = 행 전체(쪽지 포함) 그대로');
}

console.log('\n■ 10. 속도 — 2,600행(기술2팀 전 연도 규모) + 삽입 400개');
{
    const R = rng(77), rows = [];
    for (let i = 1; i <= 2600; i++) { const r = up(2013 + (i % 14), i); if (i % 9 === 0) r.실행번호 = 's'; rows.push(r); }
    const mains = rows.filter(r => !isSub(r));
    for (let k = 0; k < 400; k++) {
        const X = R() < 0.3 && k > 0 ? rows[rows.length - 1] : mains[Math.floor(R() * mains.length)];
        rows.push({ _id: `row_manual_${1730000000000 + k}_000abcde`, _year: X._year, 실행번호: '', _place: { id: X._id, side: R() < 0.5 ? 'after' : 'before', at: k } });
    }
    const noPlace = rows.filter(r => !r._place);
    const time = (fn) => { fn(); const t0 = process.hrtime.bigint(); for (let i = 0; i < 20; i++) fn(); return Number(process.hrtime.bigint() - t0) / 20 / 1e6; };
    const msOld = time(() => [...noPlace].sort((p, q) => String(p._id).localeCompare(String(q._id))));   // 종전 코드(구독마다 1번)
    const msNo = time(() => orderListRows(noPlace));
    const msIns = time(() => orderListRows(rows));
    ok(msNo <= msOld * 1.5 + 3, `쪽지 없을 때(지금 데이터) ${msNo.toFixed(1)}ms ≈ 종전 정렬 ${msOld.toFixed(1)}ms`);
    ok(msIns <= msOld * 2 + 15, `삽입 400개 있어도 ${msIns.toFixed(1)}ms (종전 정렬 ${msOld.toFixed(1)}ms 대비)`);
}

console.log('\n■ 11. 오후 추가 (2026-10-01) — 빈칸 회색·X 키인 / 수행번호 직접 입력 / 잘라내기·옮기기 / 되돌리기');
const pend = [];
{
    const cutBlk = (s, a, b) => { const i = s.indexOf(a); const j = i >= 0 ? s.indexOf(b, i) : -1; return i >= 0 && j > i ? s.slice(i, j) : null; };
    // ① x 키인 = 진행 숫자 칸만 '사용 안 함', 그 밖의 칸은 X 값 (원문 실행)
    const xBlk = cutBlk(plsSrc, "        const _xIn = String(editingCell.value ?? '').trim().toLowerCase();", '        // ★ 직원 이름 칸 직책 자동');
    ok(!!xBlk, 'x 키인 규칙 원문 찾음');
    const PROG = ['PLC', 'ETOS', 'HMI', 'Point', '진행율 %', '포인트', '자체 시운전', '총물량'];
    const runX = (key, value) => new Function('editingCell', 'srcRow', 'isProjNoCol', 'isExecAssignRowCol', 'isProgNumCol', 'isDateCol',
        xBlk + '\nreturn { v: editingCell.value, off: isXOff };')({ key, value }, { _id: 'r1', _year: '2026' },
        (k) => k === '번호' || k === '순번', (r, k) => k === '수행번호', (k) => PROG.includes(k), (k) => k === '공사 계약' || k === '공사 완료');
    [['PLC', 'x', '', true], ['진행율 %', 'X', '', true], ['Point', 'ㅌ', '', true], ['총물량', '×', '', true],
     ['견적 제출', 'x', 'X', false], ['공사기안', 'ㅌ', 'X', false], ['착', '×', 'X', false], ['안전관리비 제출', 'X', 'X', false],
     ['공사 계약', 'x', 'x', false], ['번호', 'x', 'x', false], ['수행번호', 'x', 'x', false], ['비고', 'xx', 'xx', false], ['견적 제출', 'O', 'O', false]]
        .forEach(([k, v, wantV, wantOff]) => { const r = runX(k, v); ok(r.v === wantV && r.off === wantOff, `x 키인: '${k}' 칸에 '${v}' → ${wantOff ? '사용 안 함(값 비움)' : `값 '${wantV}'${k === '공사 계약' ? ' (날짜 칸 = 날짜 검사로)' : ''}`}`, JSON.stringify(r)); });
    ok(/const canOffCell = \(row, h\) => isProgNumCol\(h\) && /.test(plsSrc), '범위 x(사용 안 함) = 진행 숫자 칸만 (O/X 칸은 건너뜀)');
    const pn = cutBlk(plsSrc, '    const isProgNumCol = (h) =>', '    // 번호 칸 판별');
    ok(!!pn && ['progItemKeyOf(h)', 'isPctCol(h)', 'isIntGroupCol(h)', 'isPointCol(h)', 'isAccPointCol(h)', '총점열'].every(t => pn.includes(t)), '진행 숫자 칸 = 공정 항목·% 칸·통합시운전 묶음·포인트·누적열·총점열(기술1팀 총물량)');
    // ② 빈칸·사용 안 함 = 회색만 (× 글자 없음)
    ok(/\) : cellOff \? null   \/\* 빈칸·사용 안 함 = 회색만/.test(plsSrc) && !/cellOff \? \(<span title=\{offTip\}[^\n]*>×<\/span>\)/.test(plsSrc), '메인표 빈칸·사용 안 함 칸 = × 글자 없이 회색만');
    ok(/\$\{\(!isHl && cellOff\) \? 'cell-na' : ''\}/.test(plsSrc) && /title=\{cellOff \? offTip/.test(plsSrc), '  └ 회색 칠(cell-na)·안내(title)는 그대로 → 상세 보기 스위치 연동 불변');
    // ③ 수행번호 직접 입력
    const en = (plsSrc.match(/    const execNoNorm = [^\n]+/) || [''])[0], ed = (plsSrc.match(/    const execDigitsToNo = [^\n]+/) || [''])[0];
    ok(!!en && !!ed, '수행번호 맞춤 원문 찾음');
    const { execNoNorm, execDigitsToNo } = new Function(en + '\n' + ed + '\nreturn { execNoNorm, execDigitsToNo };')();
    const FMT = /^\d{2}-\d{3}[A-Za-z가-힣]*$/;
    const norm = (yr, v) => execNoNorm(execDigitsToNo({ _year: yr }, v));
    [['2', '26-002'], ['002', '26-002'], ['26-2', '26-002'], ['26-002', '26-002'], ['26 - 15', '26-015'], ['26-002A', '26-002A'], ['15', '26-015']]
        .forEach(([inp, want]) => ok(norm('2026', inp) === want && FMT.test(want), `직접 입력 '${inp}' → ${want}`, norm('2026', inp)));
    ok(norm('2025', '7') === '25-007', '행 연도가 2025면 숫자만 = 25-007', norm('2025', '7'));
    ok(!FMT.test(norm('2026', 'abc')) && plsSrc.includes("if (_ev && !/^\\d{2}-\\d{3}[A-Za-z가-힣]*$/.test(_ev))"), "형식이 아니면('abc') 저장 거부");
    ok(/const dup = execDupOf\(srcRow\._id, srcRow\._year, editingCell\.key, patch\[editingCell\.key\]\);\s*\n\s*if \(dup\) \{ setAlertMsg\(execDupMsg/.test(plsSrc), '이미 있는 번호 = 키인 단계에서 거부 (종전 중복 검사 그대로)');
    ok(/Number\(_em\[2\]\) > _emax\s*\n\s*&& !window\.confirm\(/.test(plsSrc), '지금 마지막 번호보다 크면 확인창 (다음 [+]가 그 뒤부터)');
    ok(/if \(!execManualRef\.current\) \{ showExtToast\('수행번호는 손으로 키인할 수 없습니다/.test(plsSrc) && /\{ showExtToast\('수행번호는 손으로 키인할 수 없습니다[^\n]*return; \}\s*\n\s*setExecManualMode\(false\);/.test(plsSrc),
        '평소 = 손 키인 막힘(8/28 그대로) · 직접 입력 모드면 첫 클릭 1번만 열리고 그 순간 꺼짐');
    ok(/const assignExecNo = \(row, h\) => \{ const \{ yy, max \} = execMaxOf\(row\._year, h\); let n = max \+ 1/.test(plsSrc), '[+] = 마지막 번호 + 1 그대로');
    const menuAll = cutBlk(plsSrc, '{/* ── 입력 도구 ── 모두', '{/* ── ⑤ 내 화면 (이 PC) ── 모두 */}');
    ok(!!menuAll && menuAll.includes('<MenuSec t="입력 도구"/>') && menuAll.includes('setExecManualMode(true)') && !menuAll.includes('isAdmin'), '설정 ⚙ [수행번호 직접 입력] = 전 사용자');
    const admIdx = plsSrc.indexOf('{/* ── ③ 팀 설정 ── ★관리자 전용'), inIdx = plsSrc.indexOf('{/* ── 입력 도구 ── 모두'), myIdx = plsSrc.indexOf('{/* ── ⑤ 내 화면 (이 PC) ── 모두 */}');
    const admClose = plsSrc.lastIndexOf('</>)}', inIdx);
    ok(admIdx > 0 && admClose > admIdx && inIdx > admClose && inIdx < myIdx, '  └ 위치 = 관리자 전용 묶음이 닫힌 뒤 · [내 화면] 바로 위');
    ok(/if \(!inEdit && execManualRef\.current\) \{ setExecManualMode\(false\);/.test(plsSrc) && /useEffect\(\(\) => \{ execManualRef\.current = false; setExecManual\(false\); \}, \[currentTeam\]\);/.test(plsSrc), '  └ Esc·팀 이동 = 직접 입력 취소');
    // ④ 되돌리기 기록 — 같은 순간 여러 번 바꿔도 1단계 · 100단계까지 (원문 실행)
    const pu = cutBlk(plsSrc, '    const pushUndoOnce = () => {', '    const addDraftRow = (row) => {');
    ok(!!pu, '되돌리기 기록 원문 찾음');
    const env = { undoRef: { current: [] }, undoTickRef: { current: false }, draftRef: { current: { s: 1 } } };
    const pushUndoOnce = new Function('undoRef', 'undoTickRef', 'draftRef', pu + '\nreturn pushUndoOnce;')(env.undoRef, env.undoTickRef, env.draftRef);
    pushUndoOnce(); env.draftRef.current = { s: 2 }; pushUndoOnce(); pushUndoOnce();
    ok(env.undoRef.current.length === 1 && env.undoRef.current[0].s === 1, '한 동작 안에서 초안을 여러 번 바꿔도 1단계 (바꾸기 직전 상태)', env.undoRef.current.length);
    pend.push(Promise.resolve().then(() => Promise.resolve()).then(() => {
        pushUndoOnce();
        ok(env.undoRef.current.length === 2 && env.undoRef.current[1].s === 2, '다음 동작 = 다음 단계 (잠깐 뒤 다시 쌓임)', env.undoRef.current.length);
        for (let i = 0; i < 150; i++) { env.undoTickRef.current = false; pushUndoOnce(); }
        ok(env.undoRef.current.length === 100, '되돌리기 기록은 100단계까지 (오래된 것부터 버림)', env.undoRef.current.length);
    }));
    const pushSites = [
        ['새 행(붙여넣기)', /const addDraftRow = \(row\) => \{\s*\n\s*const \{ _id, \.\.\.rest \} = row;\s*\n\s*pushUndoOnce\(\);/],
        ['칸 키인·드롭다운·[+]/✕(addDraft)', /const addDraft = \(rowId, patch, orig, edited, entry\) => \{\s*\n\s*pushUndoOnce\(\);/],
        ['Del/x 범위', /pushUndoOnce\(\);   \/\/ 되돌리기 1단계 \(2026-10-01\)\s*\n\s*setDraft\(prev => \{\s*\n\s*const n = \{ \.\.\.prev \};\s*\n\s*Object\.keys\(adds\)/],
        ['잘라내기 옮기기', /const where = [^\n]+\n\s*pushUndoOnce\(\);\s*\n\s*setDraft\(prev => \{/],
        ['노란 새 행 완전 삭제', /if \(isDraftNew\(id\)\) \{ pushUndoOnce\(\); setDraft/],
    ];
    pushSites.forEach(([nm2, re]) => ok(re.test(plsSrc), '되돌리기 1단계 쌓는 곳: ' + nm2));
    const clears = (plsSrc.match(/undoRef\.current = \[\];/g) || []).length;
    ok(clears >= 5, `되돌리기 기록 비우는 곳 ${clears}곳 = 팀 이동·[저장]·[취소]·상세 보기 저장·완전 삭제 (저장된 것은 안 되돌림)`, clears);
    ok(/!e\.shiftKey && \(k === 'z' \|\| e\.code === 'KeyZ'\)\) \{[^\n]*\n\s*if \(inEdit\) return;   \/\/ 편집창 안 = 글자 되돌리기/.test(plsSrc) && /undoDraftRef\.current\(\);/.test(plsSrc), 'Ctrl+Z = 저장 전 되돌리기 (편집창 안에서는 글자 되돌리기 그대로)');
    ok(/if \(!undoRef\.current\.length\) \{ showExtToast\('되돌릴 작업이 없습니다 — \[저장\]한 작업은 되돌릴 수 없습니다'\);/.test(plsSrc), '  └ 되돌릴 게 없으면 안내 ([저장]한 작업은 대상 아님)');
    // ⑤ 잘라내기·옮기기
    ok(/\(e\.ctrlKey \|\| e\.metaKey\) && \(k === 'x' \|\| e\.code === 'KeyX'\)/.test(plsSrc) && /if \(isFullRowSelRef\.current\(\)\) cutRowsRef\.current\(\);/.test(plsSrc), 'Ctrl+X = 번호 칸으로 행을 고른 경우만 잘라내기');
    ok(/if \(rowClipRef\.current\.cut\) moveCutToSelRef\.current\(\); else pasteRowsRef\.current\(\);/.test(plsSrc), 'Ctrl+V = 잘라낸 행이면 옮기기 · 복사한 행이면 종전대로 맨 아래');
    ok(/moveCutRows\(sortedRowsRef\.current\[sel\.r1\], 'before'\)/.test(plsSrc), '  └ Ctrl+V 옮기는 자리 = 선택한 행 위 (엑셀 잘라낸 셀 삽입 · 덮어쓰기 아님)');
    ok(/if \(!inEdit && cancelCutRef\.current\(\)\) showExtToast\('잘라내기를 취소했습니다'\);/.test(plsSrc) && /rowClipRef\.current = \{ team: currentTeam, rows \}; setCutIds\(\[\]\);/.test(plsSrc), 'Esc·복사(Ctrl+C) = 잘라내기 취소');
    const mv = cutBlk(plsSrc, '    const moveCutRows = (targetRow, side) => {', '    const moveCutToSel = () => {');
    ok(!!mv && mv.includes('const plan = planMoveRows(ov, ids, targetRow._id, side, isSubListRow, Date.now());') && mv.includes("patch: { ...d0.patch, _place: m.place }") && mv.includes('__moved: true') && mv.includes("field: '자리'"),
        '옮기기 = planMoveRows 계획을 초안에 (_place만 · 옮긴 행 = __moved·이력/백로그 \'자리\')');
    ok(!!mv && ['sortConfig.key', 'draftNewRows.length', "isSubListRow(targetRow)", 'ids.includes(targetRow._id)', "String(r._year || '') !== String(targetRow._year || '')"].every(t => mv.includes(t)),
        '  └ 막는 경우: 정렬 중 · 저장 전 새 행 있음 · 하위 행/자기 자신 · 다른 연도');
    ok(['saveDetailRow', 'deleteRow'].every(fn => { const b = cutBlk(plsSrc, `    const ${fn} = async`, '\n    };\n'); return !!b && b.includes('if (hasPendingMove())'); }) && /if \(hasPendingMove\(\)\) \{ setAlertMsg\('옮긴 행\(자리 이동\)이 아직 저장 전입니다.\\n먼저 헤더의 \[저장\] 또는 \[취소\]를 누른 뒤 붙여넣어 주세요/.test(plsSrc),
        '옮기기 저장 전엔 붙여넣기·완전 삭제·상세 보기 저장을 막음 (자리 계산이 엇갈리지 않게)');
    ok(/const patchW = Object\.prototype\.hasOwnProperty\.call\(patchS, '_place'\)\s*\n\s*\? \{ \.\.\.patchS, _place: patchS\._place \? \{ \.\.\.patchS\._place, at: placeAt \+ Math\.max\(0, \(Number\(patchS\._place\.at\) \|\| 0\) - movMin\) \} : deleteField\(\) \} : patchS;/.test(plsSrc),
        '[저장] 때 옮기기 쪽지 시각 = 저장 순간 + 옮긴 순서 간격 · 빈 쪽지 = 지움(deleteField)');
    ok(/const isCut = !!clip\.cut;/.test(plsSrc) && /if \(isCut\) moveCutRows\(r, side\); else pasteCopiedRows\(\{ row: r, side \}\);/.test(plsSrc) && /isCut \? `잘라낸 \$\{clip\.rows\.length\}행 옮기기`/.test(plsSrc), '우클릭 [이 행 위에/아래에 삽입] = 잘라낸 행이면 옮기기');
    ok(/const draftLabel = \(\) => \[draftCellCount \? `\$\{draftCellCount\}칸` : '', draftNewCount \? `새 행 \$\{draftNewCount\}건` : '', draftMoveCount \? `옮김 \$\{draftMoveCount\}건` : ''\]\.filter\(Boolean\)\.join\('\+'\);/.test(plsSrc) && /const draftTotal = draftCellCount \+ draftNewCount \+ draftMoveCount;/.test(plsSrc),
        '[저장] 버튼 = "옮김 N건"도 셈 (옮기기만 있어도 [저장]/[취소]·이동 가드)');
    ok(/border-top:2px dashed #059669 !important/.test(plsSrc) && /\{rowMarkCss && <style>\{rowMarkCss\}<\/style>\}/.test(plsSrc), '잘라낸 행 = 초록 점선 · 옮긴 행 = 번호 칸 노란 표시 (<style> 한 장 — 행 다시 그리기 없음)');
    // ⑥ 옮기기 초안의 보이는 순서 (원문 실행) — 저장 전에도 옮긴 자리로 보이고, 칩 필터·정렬은 그대로
    const rb = cutBlk(plsSrc, '        let shown = sortedRowsBase.map(', '        if (!draftNewRows.length) return shown;');
    ok(!!rb, '옮기기 표시 순서 원문 찾음');
    const A = up(2026, 1, { nm: 'A' }), B = up(2026, 2, { nm: 'B' }), Cc = up(2026, 3, { nm: 'C' }), c1 = { ...sb(Cc._id, 1, 2026), nm: 'c1' }, D = up(2026, 4, { nm: 'D' });
    const N = mn(1730000000000, 0, 2026, { nm: 'N', _place: { id: Cc._id, side: 'after', at: 5 } });
    const base = [A, B, Cc, c1, D, N];
    const plan = planMoveRows(base, [Cc._id], A._id, 'before', isSub, 1000);
    const draftObj = {}; plan.forEach(m => { draftObj[m.id] = { patch: { _place: m.place }, orig: {}, edited: {}, entries: [], ...(m.id === Cc._id ? { __moved: true } : {}) }; });
    const runShow = (shownBase, sortKey) => new Function('sortedRowsBase', 'draft', 'sortConfig', 'activeRowsBase', 'orderListRows', rb + '\nreturn shown;')(shownBase, draftObj, { key: sortKey }, base, orderListRows);
    ok(nm(orderListRows(base)) === 'A B C c1 N D', '옮기기 전: A B C(+하위 c1) N(C 아래 넣은 행) D', nm(orderListRows(base)));
    ok(nm(runShow(orderListRows(base), null)) === 'C c1 A B N D', 'C를 A 위로 옮기면(저장 전) C+하위가 맨 위 · C 아래 넣었던 N은 제자리', nm(runShow(orderListRows(base), null)));
    ok(nm(runShow(orderListRows(base).filter(r => r !== B), null)) === 'C c1 A N D', '  └ 칩으로 B가 숨겨져 있어도 같은 순서 (판정은 저장값 그대로)', nm(runShow(orderListRows(base).filter(r => r !== B), null)));
    ok(nm(runShow([D, B, A, Cc, c1, N], '번호')) === 'D B A C c1 N', '  └ 열 정렬(▲▼) 중이면 정렬 순서 그대로', nm(runShow([D, B, A, Cc, c1, N], '번호')));
    const saved = base.map(r => draftObj[r._id] ? { ...r, ...draftObj[r._id].patch } : r);
    ok(nm(orderListRows(saved)) === 'C c1 A B N D', '[저장] 뒤(같은 쪽지) = 저장 전에 보이던 순서 그대로', nm(orderListRows(saved)));
}

Promise.all(pend).then(() => {
    console.log('\n' + '='.repeat(58));
    console.log(`결과: ${pass}/${pass + fail} 통과 ${fail ? '✗' : '✓'}`);
    process.exitCode = fail ? 1 : 0;
});
