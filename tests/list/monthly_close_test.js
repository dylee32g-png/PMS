/* 자동 월간 마감 검사 (2026-09-29) — 팀장님 "월간 마감을 매월 초 자동으로 — 10월 1일이 되면 9월 마감 · 전팀"
 *   List 원문(ProjectListScreen.jsx)의 mcPrevYm·mcTeamsToCheck·buildMonthSnapshot·writeMonthSnapshot·runAutoMonthlyClose를 꺼내
 *   가짜 서버(메모리)에 돌린다 — 날짜 고정(10/1 00:01 등) · 서버 트랜잭션은 한 줄로 세워(Firestore처럼) 동시 실행 재현.
 *   기술1팀(누계) 값은 진짜 fmDeriveCum(원문)으로 — 9/29 오후 화면 26 숫자(008 금월 1,200 등, 숫자만).
 *   실행: node tests/list/monthly_close_test.js   (크롬 없음 · 몇 초)
 */
process.env.BABEL_ENV = process.env.BABEL_ENV || 'test';
const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');

const ROOT = path.resolve(__dirname, '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'src/components/ProjectListScreen.jsx'), 'utf8').replace(/\r\n/g, '\n');
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  OK   ' + m); } else { fail++; console.log('  NG   ' + m + (x !== undefined ? '  → ' + (typeof x === 'string' ? x : JSON.stringify(x)) : '')); } };
const J = (x) => JSON.stringify(x);
const grabTo = (s, a0, endStr) => { const a = s.indexOf(a0); if (a < 0) return null; const b = s.indexOf(endStr, a + a0.length); return b < 0 ? null : s.slice(a, b + endStr.length); };
const line = (re) => (src.match(re) || [])[0];

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
const { getTeamProfile, LIST_TEAMS } = loadModule(path.join(ROOT, 'src/teamProfiles/index.js'));

// ── 원문 조각 ─────────────────────────────────────────────────────────────
const P = {
    from: line(/    const MC_AUTO_FROM = [^\n]+/),
    prevYm: line(/    const mcPrevYm = [^\n]+/),
    toCheck: grabTo(src, '    const mcTeamsToCheck = (R, ym, curTeam, nowMs) => LIST_TEAMS.filter(t => {', '\n    });'),
    build: grabTo(src, '    const buildMonthSnapshot = async (team, ym) => {', '\n    };'),
    write: grabTo(src, '    const writeMonthSnapshot = async (team, ym, snap, auto) => {', '\n    };'),
    run: grabTo(src, '    const runAutoMonthlyClose = async () => {', '\n    };'),
    // 기술1팀 누계 계산 (tech1_progress_test.js와 같은 조각)
    emptyOff: grabTo(src, '    const t1EmptyOffOf = (row) => {', '\n    };'),
    derive: grabTo(src, '    const fmDeriveCum = (row, weeklyArg, refYmArg, opts = {}) => {', '\n    };'),
    naItemsOf: grabTo(src, '    const naItemsOf = (row) => {', '\n    };'),
    naTo: grabTo(src, '    const naToProgressItems = (row) => {', '\n    };'),
    cardOff: grabTo(src, '    const cardDefaultOffOf = (row) => {', '\n    };'),
    isDone: line(/    const t1IsDone = [^\n]+/), endYmd: line(/    const t1EndYmd = [^\n]+/), fmNum: line(/    const fmNum = [^\n]+/),
    progKey: line(/    const PROG_COL_TO_KEY = [^\n]+/) + '\n' + line(/    const progItemKeyOf = [^\n]+/),
};
console.log('■ 0. 원문 조각');
Object.entries(P).forEach(([k, v]) => ok(!!v && !String(v).startsWith('undefined'), '찾음: ' + k));

const H26 = ['순번', '수행번호', '지역명', '공장명', '공사명', '작업', 'PLC', 'ETOS T/S', 'HMI', '자체 시운전', '통합 시운전', '총물량', '누적', '전월', '금월', '전체', '전월 (2)', '금월 (2)', '시작', '종료', '완료 처리'];
const fmNorm = (v) => String(v ?? '').replace(/\s+/g, '');
const t1 = getTeamProfile('기술1팀');
const L = new Function('fmCum', 'fmActive', 'isSubListRow', 'fmNorm', 'fmCol', 't1WeeklyOf', 't1RefYm', 't1CumDerive', 't1DateToYmd', 'aliasCol', 'datePairCols', 'teamProfile', 'defaultNaItems',
    `${P.fmNum}\n${P.isDone}\n${P.endYmd}\n${P.progKey}\n${P.cardOff}\n${P.naItemsOf}\n${P.emptyOff}\n${P.naTo}\n${P.derive}\nreturn { fmDeriveCum };`)(
    true, (r) => String(r?._year || '') === '2026', () => false, fmNorm, (nm) => H26.find(h => fmNorm(h) === fmNorm(nm)) || nm,
    () => ({}), () => '2026-10', T.t1CumDerive, T.t1DateToYmd, (nm) => H26.find(h => fmNorm(h) === fmNorm(nm)) || null, ['시작', '종료'], t1, ['도면입수', 'I/O Map', '화면작성', '기준정보']);

// ── 가짜 서버 ────────────────────────────────────────────────────────────
function makeServer() {
    const S = { meta: {}, rows: {}, ledgers: {}, snaps: {}, writes: [], reads: 0, failRows: {} };
    const api = {
        db: { fake: true }, appId: 'A',
        metaDocRef: (t) => ({ k: 'meta', t }), rowsColRef: (t) => ({ k: 'rows', t }), snapshotDocRef: (t, ym) => ({ k: 'snap', t, ym }),
        collection: (_db, ...segs) => ({ k: 'col', name: segs[segs.length - 1] }),
        where: (f, op, v) => ({ f, op, v }), query: (c, w) => ({ ...c, w }),
        getDocFromServer: async (ref) => {
            S.reads++;
            if (ref.k === 'meta') { const m = S.meta[ref.t]; return { exists: () => !!m, data: () => m }; }
            if (ref.k === 'snap') { const d = S.snaps[ref.t + '|' + ref.ym]; return { exists: () => !!d, data: () => d }; }
            throw new Error('bad ref');
        },
        getDocsFromServer: async (q) => {
            S.reads++;
            if (q.k === 'rows') {
                if (S.failRows[q.t]) throw new Error('네트워크 오류(가짜)');
                const vals = (q.w && q.w.v) || [];
                return { docs: (S.rows[q.t] || []).filter(r => vals.includes(r._year)).map(r => ({ id: r._id, data: () => { const { _id, ...rest } = r; return rest; } })) };
            }
            if (q.k === 'col') { const team = q.name.replace(/^progressRecords_/, ''); return { docs: Object.entries(S.ledgers[team] || {}).map(([id, v]) => ({ id, data: () => v })) }; }
            throw new Error('bad query');
        },
        setDoc: async (ref, data) => { S.writes.push({ ref, data }); if (ref.k === 'snap') S.snaps[ref.t + '|' + ref.ym] = data; },
    };
    let lock = Promise.resolve();   // Firestore 트랜잭션 = 충돌 시 한쪽이 다시 읽음 → 한 줄로 세운 것과 같은 결과
    api.runTransaction = (_db, fn) => {
        const p = lock.then(async () => {
            let pend = null;
            const tx = { get: async (ref) => api.getDocFromServer(ref), set: (ref, data) => { pend = { ref, data }; } };
            const r = await fn(tx);
            if (pend) { S.writes.push(pend); S.snaps[pend.ref.t + '|' + pend.ref.ym] = pend.data; }
            return r;
        });
        lock = p.catch(() => {});
        return p;
    };
    return { S, api };
}
const fixedDate = (iso) => { const t0 = new Date(iso).getTime(); return class extends Date { constructor(...a) { if (a.length) super(...a); else super(t0); } static now() { return t0; } }; };

// 자동 마감 러너 하나 = PC 하나 (R·화면 팀·로그인 사용자)
function makePC(server, { team = '기술2팀', now = '2026-10-01T00:01:00+09:00', email = 'common@neconsys.co.kr', metaLoaded = true, ds = 'firebase' } = {}) {
    const log = { audit: [], toast: [], add: [] };
    const D = fixedDate(now);
    const env = {
        ...server.api, Date: D, user: { email }, currentTeam: team, dataSource: ds, fbMetaLoaded: metaLoaded, activeHeaders: team === '기술1팀' ? H26 : ['번호', 'Project'],
        LIST_TEAMS, getTeamProfile, isSubListRow: (r) => { const e = String(r['실행번호'] || '').trim().toLowerCase(); return e === 's' || e.startsWith('-'); },
        fmActive: (r) => String(r?._year || '') === '2026', fmCol: (nm) => H26.find(h => fmNorm(h) === fmNorm(nm)) || nm, fmDeriveCum: L.fmDeriveCum,
        t1LedgerKeyOf: (r) => r._pid || r._id, t1RefYm: () => { const d = new D(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; },
        logAudit: (t, o) => log.audit.push({ t, ...o }), AUDIT_ACTIONS: { EDIT: 'edit' }, addLog: (m) => log.add.push(m), showExtToast: (m) => log.toast.push(m),
        setMcTick: () => {}, mcAutoRef: { current: { busy: false, done: {}, tried: {}, info: {} } }, EXT_TICK_MS: 60000,
    };
    const names = Object.keys(env);
    const body = `${P.from}\n${P.prevYm}\n${P.toCheck}\n${P.build}\n${P.write}\n${P.run}\nreturn { runAutoMonthlyClose, mcPrevYm, mcTeamsToCheck, buildMonthSnapshot, MC_AUTO_FROM };`;
    const fns = new Function(...names, body)(...names.map(k => env[k]));
    return { ...fns, env, log, R: env.mcAutoRef.current };
}

// ── 데이터 (숫자·구조만) ───────────────────────────────────────────────────
function seed(server) {
    const { S } = server;
    const H2 = ['번호', '공장', 'Project', '진행현황', '담당자', 'PLC', 'ETOS', 'HMI', '포인트', 'Point'];
    S.meta['기술1팀'] = { headers: H26, byYear: { '2026': { headers: H26 } } };
    S.meta['기술2팀'] = { headers: H2 }; S.meta['기술3팀'] = { headers: H2 };
    S.meta['Software팀'] = { headers: ['번호', '프로그램명', '진행 현황', '공정률(%)'] };
    S.meta['Software팀 유지보수'] = { headers: ['번호', '요청 내용', '처리 상태'] };
    S.rows['기술1팀'] = [
        { _id: '008', _pid: 'P8', _year: '2026', 순번: '008', 작업: '취소', HMI: '30', 총물량: '2882', '자체 시운전': '41.6', 누적: '1200', 전월: '', 금월: '1200', 전체: '35.8', '전월 (2)': '', '금월 (2)': '35.8' },
        { _id: '010', _pid: 'P10', _year: '2026', 순번: '010', 작업: '취소', HMI: '10', 총물량: '769', '자체 시운전': '0.7', 누적: '5', 전월: '', 금월: '5', 전체: '5.3', '전월 (2)': '', '금월 (2)': '5.3' },
        { _id: '001', _pid: 'P1', _year: '2026', 순번: '001', 작업: '완료', HMI: '100', 총물량: '3210', 시작: "26'03/03", 종료: "26'03/20", '자체 시운전': '100', 누적: '3210', 전월: '', 금월: '', 전체: '100', '전월 (2)': '', '금월 (2)': '' },
        { _id: 'old', _pid: 'PO', _year: '2025', 순번: '001', 작업: '완료' },
    ];
    S.ledgers['기술1팀'] = { P8: { weekly: { hmi: { '2026-9-4': 30 }, commissioning: { '2026-9-5': 1200 } } }, P10: { weekly: { hmi: { '2026-9-4': 10 }, commissioning: { '2026-9-5': 5 } } }, P1: { weekly: { hmi: { '2026-3-5': 100 }, commissioning: { '2026-3-5': 3210 } } } };
    S.rows['기술2팀'] = [
        { _id: 'a', _pid: 'PA', _year: '2026', 번호: '001', Project: 'A', 진행현황: '진행중', PLC: '50', Point: '100', 포인트: '200' },
        { _id: 'a_sub01', _pid: 'PAS', _year: '2026', 실행번호: 's', Project: '- A공조' },
        { _id: 'b', _pid: 'PB', _year: '2026', 번호: '002', Project: 'B', 진행현황: '완료' },
        { _id: 'c', _pid: 'PC', _year: '2025', 번호: '001', Project: 'C' },
    ];
    S.rows['기술3팀'] = [{ _id: 'g', _pid: 'PG', _year: '2026', 번호: '001', Project: 'G', 진행현황: '진행중' }];
    S.rows['Software팀'] = [{ _id: 's1', _pid: 'PS1', _year: '2026', 번호: '001', 프로그램명: 'X', '진행 현황': '개발중', '공정률(%)': '40' }];
    S.rows['Software팀 유지보수'] = [];   // 올해 행 없음
}

(async () => {
    // ═══ 1. 날짜 — 언제 무엇을 마감하나 ═══
    console.log('\n■ 1. 언제 무엇을 — 오늘 달의 "지난달" · 2026-09분부터');
    const sv0 = makeServer(); seed(sv0);
    const pcOct = makePC(sv0), pcSep = makePC(sv0, { now: '2026-09-29T15:00:00+09:00' }), pcJan = makePC(sv0, { now: '2027-01-02T08:00:00+09:00' });
    ok(pcOct.mcPrevYm() === '2026-09' && pcSep.mcPrevYm() === '2026-08' && pcJan.mcPrevYm() === '2026-12', '10/1 → 9월 · 9/29 → 8월 · 2027/1/2 → 2026년 12월');
    ok(pcOct.MC_AUTO_FROM === '2026-09', '시작 = 2026-09분 (그 전 달은 수동 마감본 그대로 — 지금 값으로 소급해 찍지 않음)');
    await pcSep.runAutoMonthlyClose();
    ok(sv0.S.writes.length === 0 && sv0.S.reads === 0, '오늘(9/29) = 지난달 8월 < 2026-09 → 아무것도 안 함 (서버 읽기 0)');
    ok(LIST_TEAMS.filter(t => getTeamProfile(t).월간마감).length === LIST_TEAMS.length && LIST_TEAMS.length === 5, `대상 = 카드 월간마감 켠 팀 전부 ${LIST_TEAMS.length}개 (${LIST_TEAMS.join(' · ')})`);
    ok(J(pcOct.mcTeamsToCheck({ done: {}, tried: {} }, '2026-09', '기술2팀', 0)) === J(['기술2팀', '기술3팀', 'Software팀', 'Software팀 유지보수']),
       '기술2팀 화면에서 확인할 팀 = 기술1팀 뺀 4팀 (누계 팀은 그 팀 화면에서만)');
    ok(pcOct.mcTeamsToCheck({ done: {}, tried: {} }, '2026-09', '기술1팀', 0).length === 5, '기술1팀 화면 = 5팀 전부');
    ok(pcOct.mcTeamsToCheck({ done: { 기술2팀: '2026-09' }, tried: { 기술3팀: 1000 } }, '2026-09', '기술2팀', 1000 + 5 * 60000).join() === 'Software팀,Software팀 유지보수'
       && pcOct.mcTeamsToCheck({ done: {}, tried: { 기술3팀: 1000 } }, '2026-09', '기술2팀', 1000 + 11 * 60000).includes('기술3팀'),
       '이미 확인한 팀 = 그 달엔 다시 안 봄 · 실패한 팀 = 10분 뒤 다시');

    // ═══ 2. 10월 1일 00:01 — 공용 PC(기술2팀 화면) ═══
    console.log('\n■ 2. 10월 1일 00:01 — 공용 PC가 기술2팀 화면일 때');
    const sv = makeServer(); seed(sv);
    const pc = makePC(sv, { team: '기술2팀' });
    await pc.runAutoMonthlyClose();
    const s2 = sv.S.snaps['기술2팀|2026-09'], s3 = sv.S.snaps['기술3팀|2026-09'], sS = sv.S.snaps['Software팀|2026-09'];
    ok(!!s2 && !!s3 && !!sS, '9월 마감본 자동 생성: 기술2팀·기술3팀·Software팀');
    ok(!sv.S.snaps['Software팀 유지보수|2026-09'] && pc.R.done['Software팀 유지보수'] === '2026-09', '유지보수 = 올해 행 없음 → 만들지 않고 확인 끝');
    ok(!sv.S.snaps['기술1팀|2026-09'] && !pc.R.done['기술1팀'], '기술1팀(누계) = 이 화면에선 안 만듦 — 기술1팀 List가 열릴 때');
    ok(s2.ym === '2026-09' && s2.auto === true && s2.count === 2 && s2.savedBy === 'common@neconsys.co.kr' && Object.keys(s2.rows).sort().join() === 'PA,PB',
       '기술2팀 마감본: 2026년 메인 행 2건(하위 행·2025 행 제외) · 자동 표시 · 저장한 계정', { count: s2.count, keys: Object.keys(s2.rows) });
    ok(s2.rows.PA.PLC === '50' && s2.rows.PA.Point === '100' && s2.rows.PA.진행현황 === '진행중' && s2.rows.PA.Project === 'A' && s2.rows.PA.공사명 === '',
       '  └ 전 열 그대로 + 월간보고 호환 키 (수동 마감과 같은 모양)', s2.rows.PA);
    ok(pc.log.audit.length === 3 && pc.log.audit.every(a => a.note.includes('월간 마감 자동 저장: 2026-09')), '백로그 = 팀마다 1건 "월간 마감 자동 저장: 2026-09 · N건"');
    ok(pc.log.toast.length === 1 && pc.log.toast[0].includes('9월 월간 마감 자동 저장'), '  └ 화면 팀(기술2팀)만 알림 한 번');
    const nw = sv.S.writes.length, nr = sv.S.reads;
    await pc.runAutoMonthlyClose(); await pc.runAutoMonthlyClose();
    ok(sv.S.writes.length === nw && sv.S.reads === nr, '1분 뒤·2분 뒤 확인 = 쓰기·읽기 0 (그 달 확인 끝난 팀은 다시 안 봄)');

    // ═══ 3. 기술1팀 화면이 열리면 — 9월 기준 장부 계산값 ═══
    console.log('\n■ 3. 기술1팀 List가 열릴 때 — 9월 기준 장부 계산값 (늦게 찍어도 9월 값)');
    const pc1 = makePC(sv, { team: '기술1팀', now: '2026-10-01T09:30:00+09:00', email: 'kim@neconsys.co.kr' });
    await pc1.runAutoMonthlyClose();
    const s1 = sv.S.snaps['기술1팀|2026-09'];
    ok(!!s1 && s1.count === 3 && !s1.rows.PO, '기술1팀 9월 마감본 생성 — 2026 행 3건 (2025 행 제외)');
    const r8 = s1.rows.P8, r10 = s1.rows.P10, r1 = s1.rows.P1;
    ok(r8.금월 === '1200' && r8.전월 === '' && r8.누적 === '1200' && r8['자체 시운전'] === '41.6' && r8.전체 === '35.8' && r8['금월 (2)'] === '35.8' && r8.공정률전체 === '35.8' && r8.HMI === '30',
       '008: 9월 금월 1,200 · 누적 1,200 · 자체 41.6% · 공정률 35.8% (금월 +35.8) — 화면 26과 같음', r8);
    ok(r10.금월 === '5' && r10.전체 === '5.3' && r10['자체 시운전'] === '0.7', '010: 9월 금월 5 · 자체 0.7% · 공정률 5.3%', r10);
    ok(r1.누적 === '3210' && r1.전체 === '100' && r1.금월 === '' && r1['금월 (2)'] === '', '001(3월 완료): 누적 3,210 · 100% · 금월 빈칸');
    // 10월에 008에 포인트를 더 넣은 뒤 찍어도 9월 마감본은 9월 값
    sv.S.ledgers['기술1팀'].P8.weekly.commissioning['2026-10-1'] = 300;
    delete sv.S.snaps['기술1팀|2026-09'];
    const pc1b = makePC(sv, { team: '기술1팀', now: '2026-10-03T10:00:00+09:00' });
    await pc1b.runAutoMonthlyClose();
    const r8b = sv.S.snaps['기술1팀|2026-09'].rows.P8;
    ok(r8b.금월 === '1200' && r8b.누적 === '1200' && r8b.전체 === '35.8', '  └ 10/3에 찍혀도(그새 10월 1주 300점 입력) 9월 마감본 = 9월 값 그대로 (장부 기준)', r8b);

    // ═══ 4. 덮어쓰지 않음 · 두 PC 동시 ═══
    console.log('\n■ 4. 덮어쓰지 않음 — 수동 마감본·다른 PC가 먼저 찍은 것');
    const sv4 = makeServer(); seed(sv4);
    sv4.S.snaps['기술3팀|2026-09'] = { ym: '2026-09', savedAt: '2026-09-30T17:50:00Z', savedBy: 'boss@x', count: 1, rows: { PG: { Project: '수동' } } };
    const pA = makePC(sv4, { team: '기술2팀', email: 'pcA@x' }), pB = makePC(sv4, { team: '기술3팀', email: 'pcB@x' });
    await Promise.all([pA.runAutoMonthlyClose(), pB.runAutoMonthlyClose()]);
    const snapWrites = sv4.S.writes.filter(w => w.ref.k === 'snap');
    ok(sv4.S.snaps['기술3팀|2026-09'].savedBy === 'boss@x' && sv4.S.snaps['기술3팀|2026-09'].rows.PG.Project === '수동', '9/30에 수동으로 찍은 기술3팀 9월 마감본 = 그대로 (자동이 안 덮음)');
    ok(snapWrites.filter(w => w.ref.t === '기술2팀').length === 1 && snapWrites.filter(w => w.ref.t === 'Software팀').length === 1,
       '두 PC가 00:01에 동시에 확인해도 팀당 1번만 저장 (서버 트랜잭션)', snapWrites.map(w => w.ref.t + '←' + w.data.savedBy));
    ok(pA.log.audit.length + pB.log.audit.length === 2, '  └ 백로그도 팀당 1건 (실제로 만든 PC만)');

    // ═══ 5. 1월 — 작년 12월 마감 ═══
    console.log('\n■ 5. 1월 2일 — 작년 12월 마감 (작년 행)');
    const sv5 = makeServer(); seed(sv5);
    sv5.S.rows['기술2팀'].push({ _id: 'n27', _pid: 'PN', _year: '2027', 번호: '001', Project: '새해' });
    const p5 = makePC(sv5, { team: '기술2팀', now: '2027-01-02T08:00:00+09:00' });
    await p5.runAutoMonthlyClose();
    const s5 = sv5.S.snaps['기술2팀|2026-12'];
    ok(!!s5 && Object.keys(s5.rows).sort().join() === 'PA,PB', '2026-12 마감본 = 2026년 행 (2027 새 행은 안 들어감)', s5 && Object.keys(s5.rows));

    // ═══ 6. 실패 · 준비 전 ═══
    console.log('\n■ 6. 실패하면 10분 뒤 다시 · 기술1팀 화면 준비 전');
    const sv6 = makeServer(); seed(sv6); sv6.S.failRows['기술3팀'] = true;
    const p6 = makePC(sv6, { team: '기술2팀' });
    await p6.runAutoMonthlyClose();
    ok(!sv6.S.snaps['기술3팀|2026-09'] && !!sv6.S.snaps['기술2팀|2026-09'] && p6.R.tried['기술3팀'] > 0 && p6.log.add.some(m => m.includes('기술3팀 건너뜀')), '기술3팀 읽기 실패 → 그 팀만 건너뜀(다른 팀은 저장) · 기록 남김');
    sv6.S.failRows['기술3팀'] = false;
    await p6.runAutoMonthlyClose();
    ok(!sv6.S.snaps['기술3팀|2026-09'], '  └ 1분 뒤엔 아직 안 함 (10분 대기)');
    p6.R.tried['기술3팀'] -= 11 * 60000;
    await p6.runAutoMonthlyClose();
    ok(!!sv6.S.snaps['기술3팀|2026-09'], '  └ 10분 지나면 다시 → 저장');
    const p7 = makePC(sv6, { team: '기술1팀', metaLoaded: false });
    await p7.runAutoMonthlyClose();
    ok(!sv6.S.snaps['기술1팀|2026-09'] && p7.R.done['기술1팀'] !== '2026-09' && !(p7.R.tried['기술1팀'] > 0), '기술1팀 화면인데 표 구조를 아직 못 받음 → 다음 확인(1분 뒤) 때 (실패 아님)');

    // ═══ 7. 연결 (원문) ═══
    console.log('\n■ 7. 연결 — 원문');
    const mc = grabTo(src, '    const handleMonthlyClose = async () => {', '\n    };');
    ok(!!mc && mc.includes('const snap = await buildMonthSnapshot(currentTeam, ym);') && mc.includes('await writeMonthSnapshot(currentTeam, ym, snap, false);') && !mc.includes('(activeHeaders || []).forEach(h => { snap1[h]'),
       '수동 [월간 마감] = 자동과 같은 함수로 찍음 (서버 저장값 · 노란 칸 제외) — 다시 찍기(덮어쓰기)는 확인창 뒤');
    ok(!!mc && mc.includes('저장 안 한 노란 칸이 있는 행') && mc.includes("pv.auto ? '자동' : '수동'"), '  └ 확인창: 노란 칸 안내 · 기존 마감본이 자동/수동인지 표시');
    ok(src.includes('setInterval(() => runAutoMcRef.current(), EXT_TICK_MS)') && src.includes('setTimeout(() => runAutoMcRef.current(), 4000)'), 'List 화면이 켜져 있으면 1분마다 확인 (열고 4초 뒤 첫 확인)');
    const wr = P.write || '';
    ok(wr.includes('runTransaction(db, async (tx) =>') && wr.includes('if (s0.exists()) return false;'), '자동 저장 = 트랜잭션 "없을 때만 만들기"');
    ok(src.includes('매월 1일 자동 · 여기선 다시 찍기') && src.includes('월 마감 ✓'), '설정 메뉴 안내 + 아래 상태줄 "● 9월 마감 ✓"');
    ok(!/isAdmin/.test(P.run || ''), '자동 마감 실행엔 관리자 조건 없음 (공용 PC 일반 계정도 — 자동 백업과 같은 원칙)');

    console.log('\n' + '='.repeat(62));
    console.log(`결과: ${pass}/${pass + fail} 통과` + (fail ? `  ★ 실패 ${fail}건` : '  ✓'));
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  NG   검사 중 오류: ' + (e && e.stack || e)); process.exit(1); });
