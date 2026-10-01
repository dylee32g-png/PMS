// ─────────────────────────────────────────────────────────────────────────
// 프로젝트 List — 데이터 도구 함수 모음 (윗층: 화면과 안 얽힌 순수 함수)
// ProjectListScreen.jsx에서 분리 (2026-06-25, 코드 분리 2조각 = 데이터 도구)
// Firebase 경로 · 로컬(IndexedDB) 저장 · 엑셀 헤더 파싱 · 보존 병합 계산
// ─────────────────────────────────────────────────────────────────────────
import { collection, doc } from 'firebase/firestore';
import { db, appId } from '../firebase';

// 시트명에서 연도 추출 ("2026년도 파주..." → "2026", "2025" → "2025")
export function extractYear(sheetName) {
    const m = String(sheetName).match(/\d{4}/);
    return m ? m[0] : sheetName;
}

// ─── Firebase 경로 ──────────────────────────────────────────────────────────
export const metaDocRef = (t) => doc(db, 'artifacts', appId, 'public', 'data', 'projectListMeta', t);
export const rowsColRef = (t) => collection(db, 'artifacts', appId, 'public', 'data', 'projectListRows_' + t);
export const rowDocRef  = (t, id) => doc(db, 'artifacts', appId, 'public', 'data', 'projectListRows_' + t, id);
// 월간 마감 스냅샷 (2026-08-13): 달마다 문서 1개 — 월간보고(웹) 전월/금월/증감의 근거 장부
export const snapshotDocRef = (t, ym) => doc(db, 'artifacts', appId, 'public', 'data', 'projectListSnapshots_' + t, ym);
// 월간보고 엑셀 원본 (2026-08-13): 연도당 문서 1개 — 업로드한 월간보고 엑셀(금월 시트) 전체를 웹 원본으로 보관
export const monthlyReportDocRef = (t, year) => doc(db, 'artifacts', appId, 'public', 'data', 'monthlyReport_' + t, String(year));
// 자동 반영기(NAS Docker 프로그램 pms-reader) 상태 문서 (2026-07-31)
//   프로그램이 매 회차 끝에 한 건 써 넣는다 → 화면은 '마지막 확인 시각'만 읽어 보여준다. 웹에서 쓰지 않음(읽기 전용).
export const readerStatusRef = (t) => doc(db, 'artifacts', appId, 'public', 'data', 'pmsReaderStatus', t);
// [지금 확인] 요청 문서 (2026-07-31) — PMS가 쓰고 자동 반영기가 20초마다 읽는다.
//   여기에 { at, by } 한 줄만 쓰면 리더가 15분을 기다리지 않고 즉시 한 바퀴 돈다.
export const readerRequestRef = (t) => doc(db, 'artifacts', appId, 'public', 'data', 'pmsReaderRequest', t);
// 메인 PC 자동 전체 백업 상태 문서 (2026-09-09) — 자동 백업이 매 회차 끝에 팀별로 한 건 써 넣는다 → 어느 PC에서든 '마지막 백업 언제·정상인지' 확인.
export const backupStatusRef = (t) => doc(db, 'artifacts', appId, 'public', 'data', 'pmsBackupStatus', t);

// ─── IndexedDB (로컬 임시 저장소) ───────────────────────────────────────────
const IDB_NAME    = 'ProjectListLocalDB';
const IDB_VERSION = 1;
const IDB_STORE   = 'localData';

function openIDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(IDB_NAME, IDB_VERSION);
        req.onupgradeneeded = e => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(IDB_STORE)) {
                db.createObjectStore(IDB_STORE, { keyPath: 'teamId' });
            }
        };
        req.onsuccess = e => resolve(e.target.result);
        req.onerror   = e => reject(e.target.error);
    });
}

export async function idbSave(teamId, headers, colGroups, rows) {
    const db = await openIDB();
    return new Promise((resolve, reject) => {
        const tx  = db.transaction(IDB_STORE, 'readwrite');
        const req = tx.objectStore(IDB_STORE).put({
            teamId, headers, colGroups, rows,
            savedAt: new Date().toISOString()
        });
        req.onsuccess = resolve;
        req.onerror   = e => reject(e.target.error);
    });
}

export async function idbLoad(teamId) {
    const db = await openIDB();
    return new Promise((resolve, reject) => {
        const tx  = db.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).get(teamId);
        req.onsuccess = e => resolve(e.target.result || null);
        req.onerror   = e => reject(e.target.error);
    });
}

export async function idbDelete(teamId) {
    const db = await openIDB();
    return new Promise((resolve, reject) => {
        const tx  = db.transaction(IDB_STORE, 'readwrite');
        const req = tx.objectStore(IDB_STORE).delete(teamId);
        req.onsuccess = resolve;
        req.onerror   = e => reject(e.target.error);
    });
}

// ─── A-4c: 보존 병합 '미리보기(드라이런)' — Firebase 쓰기 없음, 매칭 결과만 계산 ───
// 매칭 1순위 (연도+번호) → 2순위 (연도+Project명 정규화). 목적 = 기존 _pid·실행번호·이력 보존.
// 번호 3자리 패딩 (2026-07-20 팀장님): '1'→'001', '26'→'026' — 문자열 정렬에서도 1,2,…,10,…,100 순서 보장.
//   숫자 1~3자리만 변환, 그 외(빈칸·문자·4자리 이상)는 그대로. 업로드·병합 매칭·웹 편집이 같은 규칙을 쓴다.
export const padProjectNo = (v) => { const s = String(v ?? '').trim(); return /^\d{1,3}$/.test(s) ? s.padStart(3, '0') : s; };

// ── ★ 빈칸 = 이 프로젝트엔 없는 항목 (2026-09-30 팀장님: "메인표는 PLC·ETOS ×인데 진행실적 팝업엔 살아 있다" — 기술2·3팀) ──
//   9/29 기술1팀 규칙(ProjectListScreen t1EmptyOffOf)과 같은 원칙을 모든 팀에:
//   메인표가 빈칸을 ×로 그리는 열(팀 카드 빈칸회색 — opt.gray)에서
//     · PLC·ETOS·HMI = 값이 있어야 적용 (0도 값)
//     · 통합시운전 = opt.intCols(기술2·3팀 '진행율 %'·'Point') 중 하나라도 값이 있어야 적용
//   빈칸 = × = 진행실적 팝업·진척률·실적 그래프·모바일에서 빠짐. 상세 보기에서 켠 항목(_naOn)은 빈칸이어도 적용(팝업에 줄).
//   끈 항목(_naItems)·기본 미적용은 호출하는 쪽(naItems)이 따로 뺀다. 반환 = { plc:false, … } (빠지는 항목만)
//   쓰는 곳: ProjectListScreen naToProgressItems(PC 팝업·그래프) · 아래 naProgressItemsOf(모바일)
export function emptyProgOffOf(row, headers, opt = {}) {
    if (!row) return {};
    const norm = (v) => String(v ?? '').replace(/\s+/g, '').toUpperCase();
    const hs = (headers && headers.length ? headers : Object.keys(row)).filter(h => !String(h).startsWith('_'));
    const gray = typeof opt.gray === 'function' ? opt.gray : () => false;   // 기본 = 규칙 없음 (빈칸도 × 아닌 팀)
    const empty = (h) => String(row[h] ?? '').trim() === '';
    const onL = (Array.isArray(row._naOn) ? row._naOn : []).map(norm);
    const colOf = (names) => hs.find(h => names.some(n => norm(h) === norm(n)));
    const off = {};
    [['plc', ['PLC']], ['etos', ['ETOS', 'ETOS T/S']], ['hmi', ['HMI']]].forEach(([k, names]) => {
        const c = colOf(names);
        if (c && gray(c) && empty(c) && !onL.includes(norm(c)) && !names.some(n => onL.includes(norm(n)))) off[k] = false;
    });
    const ic = (opt.intCols || []).map(n => colOf([n])).filter(Boolean);
    if (ic.length && ic.every(c => gray(c) && empty(c)) && !onL.includes(norm('통합시운전')) && !ic.some(c => onL.includes(norm(c)))) off.integratedTest = false;
    return off;
}
// 메인표가 빈칸을 짙은 회색 ×로 그리는 열인지 (팀 카드 빈칸회색·빈칸회색열) — ProjectListScreen isGrayEmptyCol과 같은 규칙 (모바일용, 2026-09-30)
export const grayEmptyTestOf = (profile) => {
    const kws = (profile?.빈칸회색열 || []).map(k => String(k).replace(/\s+/g, '').toLowerCase());
    return (h) => profile?.빈칸회색 === true || (kws.length > 0 && kws.some(k => String(h).replace(/\s+/g, '').toLowerCase().includes(k)));
};

// ── 프로젝트별 진행항목 적용/미적용 → ProgressModal progressItems 변환 (2026-07-21 팀장님) ──
//   기본 미적용: 헤더(없으면 행의 키)에 열이 없는 항목은 기본 off — _naOn(켬 예외)·_naItems(끔 목록) 반영.
//   ProjectListScreen과 동일 규칙. 모바일(MobileInputScreen)에서 재사용.
//   opt = { gray, intCols } (2026-09-30): 빈칸 = 없음 규칙(emptyProgOffOf) + 통합시운전 묶음 칸(진행율 %·Point)을 끄면 통합시운전 끔
export function naProgressItemsOf(row, headers, intColName, opt = {}) {
    const ALL = ['도면입수', 'I/O Map', '화면작성', '기준정보', 'PLC', 'ETOS', 'HMI', '자체시운전', '통합시운전'];
    const norm = (v) => String(v ?? '').replace(/\s+/g, '').toUpperCase();
    const hs = (headers && headers.length ? headers : Object.keys(row || {})).filter(h => !String(h).startsWith('_'));
    let defs = ALL.filter(name => !hs.some(h => norm(h).includes(norm(name))));
    // 팀 통합열 별칭 (2026-08-25 팀장님: 기술2·3팀 통합시운전 기본 ON) — 통합열('진행율 %')이 표에 있으면 통합시운전은 '열 있음' 취급
    if (intColName && hs.some(h => norm(h) === norm(intColName))) defs = defs.filter(n => n !== '통합시운전');
    const ex = Array.isArray(row && row._naItems) ? row._naItems : [];
    const on = Array.isArray(row && row._naOn) ? row._naOn : [];
    const na = [...new Set([...ex, ...defs.filter(n => !on.includes(n))])];
    const emptyOff = emptyProgOffOf(row, hs, opt);   // ★ 빈칸 = 없음 (2026-09-30) — PC List와 같은 함수
    if (!na.length && !Object.keys(emptyOff).length) return undefined;
    const KEY = { '도면입수': 'drawing', 'I/OMAP': 'iomap', '화면작성': 'screen', '기준정보': 'baseinfo', 'PLC': 'plc', 'ETOS': 'etos', 'ETOST/S': 'etos', 'HMI': 'hmi' };
    const intCols = (opt.intCols || []).map(norm);
    const pi = { ...emptyOff };
    na.forEach(h => {
        const k = KEY[norm(h)];
        const c = String(h).replace(/\s/g, '');
        if (k) pi[k] = false;
        else if (c.includes('자체시운전')) pi.internalTest = false;
        else if (c.includes('통합시운전') || intCols.includes(norm(h))) pi.integratedTest = false;   // 진행율 %·Point를 끔 = 통합시운전 끔 (2026-09-30)
    });
    return Object.keys(pi).length ? pi : undefined;
}

// ── ★ 사람이 친 진행 값 → 진행실적 장부 어디에? (2026-09-30 팀장님: "3월에 넣은 값이 합계로 나와야 하는데 오늘 날짜로 또 적어" — 기술2·3팀) ──
//   메인표·상세/수정·새 행에서 PLC·ETOS·HMI(%) 또는 Point(포인트)를 쳤을 때 (수식 팀 = 기술1팀 누계는 따로 — 종료 주 규칙).
//   종전(7/10) = 무조건 '이번 주' 칸 → 완료 프로젝트에도 오늘 날짜 기록이 생기고, 그 뒤 팝업 3월 칸에 넣어도 합계 = 더 뒤인 이번 주 값.
//   ① 장부 합계와 같은 값 = 안 씀 (팝업 [적용하기] 뒤 노란 칸 [저장] 등 — 같은 값을 오늘 날짜로 또 적던 것)
//   ② 기록 없는 항목에 0 = 안 씀 (기록 없음 = 0 — 항목만 켜려고 친 0이 이번 주 칸에 남아 나중 입력을 가리던 것)
//   ③ 끝난 프로젝트(완료·취소·삭제) = 새 날짜를 만들지 않음 — 기록이 있으면 마지막 기록 칸의 값만 바꿈, 없으면 장부에 안 씀
//      (그때 팝업 합계·진척률·그래프는 메인표 값을 씀 — 아래 mainBaseOf)
//   진행 중 프로젝트 = 종전대로 이번 주 칸 (오늘 진행한 것) · NAS 자동 반영·[진행실적 심기]는 호출 쪽에서 이번 주 고정(opts.atNow)
//   검사: tests/list/prog_item_sync_test.js 7장
export const CLOSED_STATUSES = ['완료', '취소', '삭제'];
export const isClosedStatusVal = (v) => CLOSED_STATUSES.includes(String(v ?? '').replace(/\s+/g, ''));
const _hasLv = (v) => v !== '' && v !== null && v !== undefined;
const _wkOrd = (wk) => { const p = String(wk).split('-').map(Number); return (p[0] || 0) * 10000 + (p[1] || 0) * 100 + (p[2] || 0); };
const _latestWk = (ents) => ents.length ? ents.reduce((a, b) => (_wkOrd(b[0]) > _wkOrd(a[0]) ? b : a)) : null;
// % 항목(누적 % — 마지막 기록이 합계). weeks = 장부 그 항목 { 'YYYY-M-W': 값 } · cy·cm = 오늘 연·월
//   반환 { skip: true } = 안 씀 · { wk } = 그 주 칸 값만 고침 · {} = 이번 주 (종전)
export function handPctTarget(weeks, num, closed, cy, cm) {
    const ents = Object.entries(weeks || {}).filter(([, v]) => _hasLv(v));
    const cur = _latestWk(ents.filter(([wk]) => _wkOrd(wk) <= cy * 10000 + cm * 100 + 99));   // 팝업 합계 = 이번 달까지의 마지막 기록
    if (cur && Number(cur[1]) === num) return { skip: true };                                    // ①
    if (!ents.length && num === 0) return { skip: true };                                        // ②
    if (closed) {                                                                                // ③
        const tgt = cur || _latestWk(ents);
        return (!tgt || Number(tgt[1]) === num) ? { skip: true } : { wk: tgt[0] };
    }
    return {};
}
// Point(주마다 딴 포인트 — 합이 누적). 반환 { skip } · { wk, val } = 그 주 칸을 val로 · { block, sum, cur, wk } = 줄이기 차단 · {} = 이번 주 증분 (종전)
export function handPointTarget(weeks, num, closed) {
    const ents = Object.entries(weeks || {}).filter(([, v]) => _hasLv(v) && Number.isFinite(Number(v)));
    const r3 = (x) => Math.round(x * 1000) / 1000;
    const total = r3(ents.reduce((sm, [, v]) => sm + Number(v), 0));
    if (total === r3(num)) return { skip: true };                                                // ①
    if (!ents.length && num === 0) return { skip: true };                                        // ②
    if (!closed) return {};
    if (!ents.length) return { skip: true };                                                     // ③ 기록 없음 → 메인표 Point가 합계
    const last = _latestWk(ents), others = r3(total - Number(last[1]));
    if (num < others) return { block: true, sum: others, cur: Number(last[1]), wk: last[0] };    // 그 전 주차 합보다 작게 = 기록 어긋남
    return { wk: last[0], val: r3(num - others) };
}
// 장부에 주차 기록이 없는 항목의 '메인표 값' — 진행실적 팝업 합계·진척률과 실적 그래프가 0 대신 이 값을 씀 (날짜 없는 기준값)
//   { plc, etos, hmi, drawing, iomap, screen, baseinfo, intCommissioning(= 팀 누적열 'Point') } · 수식 팀(기술1팀 누계)은 제외 → {}
//   쓰는 곳: ProjectListScreen(팝업 mainBase·그래프 graphObj.mainBase) · MobileInputScreen(팝업)
export function mainBaseOf(row, headers, profile) {
    if (!row || profile?.수식) return {};
    const norm = (v) => String(v ?? '').replace(/\s+/g, '').toUpperCase();
    const hs = (headers && headers.length ? headers : Object.keys(row)).filter(h => !String(h).startsWith('_'));
    const KEY = { '도면입수': 'drawing', 'I/OMAP': 'iomap', '화면작성': 'screen', '기준정보': 'baseinfo', 'PLC': 'plc', 'ETOS': 'etos', 'ETOST/S': 'etos', 'HMI': 'hmi' };
    const num = (v) => { const t = String(v ?? '').replace(/[,%]/g, '').trim(); if (t === '') return null; const n = Number(t); return Number.isFinite(n) ? Math.max(0, n) : null; };
    const out = {};
    hs.forEach(h => { const k = KEY[norm(h)]; if (!k || k in out) return; const n = num(row[h]); if (n !== null) out[k] = n; });
    const acc = profile?.시운전?.누적열 ? hs.find(h => norm(h) === norm(profile.시운전.누적열)) : null;
    if (acc) { const n = num(row[acc]); if (n !== null) out.intCommissioning = n; }
    return out;
}
const a4cNormName = (v) => String(v ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
const a4cNumCol  = (headers) => (headers||[]).find(h => h === '번호') || (headers||[]).find(h => h.includes('번호') && !h.includes('전화') && !h.includes('사업')) || null;
const a4cNameCol = (headers) => {
    for (const k of ['프로젝트명', '프로젝트', 'Project', '공사명', '건명', '명칭']) {
        const h = (headers||[]).find(x => x.includes(k));
        if (h) return h;
    }
    return null;
};
export function computeMergePreview(existingRows, pendingRows, headers) {
    const numCol  = a4cNumCol(headers);
    const nameCol = a4cNameCol(headers);
    const cols    = (headers || []).filter(Boolean); // 비교 대상 = 엑셀 헤더만 (_필드·실행번호 등 보존값은 비교·변경 안 함)
    const byNum = new Map(), byName = new Map();
    (existingRows || []).forEach(r => {
        const y = r._year || '';
        if (numCol)  { const v = padProjectNo(r[numCol]); if (v) byNum.set(`${y}||${v}`, r); }   // 번호 패딩 정규화 (2026-07-20)
        if (nameCol) { const v = a4cNormName(r[nameCol]);        if (v) byName.set(`${y}||${v}`, r); }
    });
    const matched = new Set();
    const updates = [], news = [];
    (pendingRows || []).forEach(p => {
        const y = p._year || '';
        let m = null, via = '';
        if (numCol)        { const v = padProjectNo(p[numCol]); if (v) { m = byNum.get(`${y}||${v}`) || null; if (m) via = '번호'; } }
        if (!m && nameCol) { const v = a4cNormName(p[nameCol]);        if (v) { m = byName.get(`${y}||${v}`) || null; if (m) via = 'Project명'; } }
        if (m) {
            matched.add(m._id);
            const diffs = cols.filter(c => String(m[c] ?? '') !== String(p[c] ?? ''))
                              .map(c => ({ field: c, from: String(m[c] ?? ''), to: String(p[c] ?? '') }));
            updates.push({ _id: m._id, _pid: m._pid, year: y, num: numCol ? String(p[numCol] ?? '') : '', name: nameCol ? String(p[nameCol] ?? '') : '', via, diffs });
        } else {
            news.push({ year: y, num: numCol ? String(p[numCol] ?? '') : '', name: nameCol ? String(p[nameCol] ?? '') : '' });
        }
    });
    const upYears = new Set((pendingRows || []).map(p => p._year || ''));
    const missing = (existingRows || [])
        .filter(r => upYears.has(r._year || '') && !matched.has(r._id))
        .map(r => ({ _id: r._id, _pid: r._pid, year: r._year || '', num: numCol ? String(r[numCol] ?? '') : '', name: nameCol ? String(r[nameCol] ?? '') : '' }));
    return { numCol, nameCol, updates, news, missing,
        counts: { updates: updates.length, news: news.length, missing: missing.length, changed: updates.filter(u => u.diffs.length > 0).length } };
}

// ─── 3단계: 보존 병합 '실행 계획' (2026-07-20 팀장님 확정) ────────────────────────────
//   확정저장이 실제로 쓸 문서 목록을 계산하는 순수 함수 (Firebase 없음 → 시뮬 테스트 가능).
//   · updates = 매칭된 기존 행: 기존 _id 유지 + 엑셀 컬럼만 엑셀 값으로(엑셀 절대우선),
//               웹 전용 값(_pid·실행번호·_regDate·_changeHistory·포인트실적 등)은 그대로 보존.
//               changed=false(값 전부 동일)면 쓰기 생략 대상.
//   · creates = 신규 행 (업로드 때 발급된 _id·_pid 그대로 사용).
//   · missing = 같은 연도인데 엑셀에 없는 기존 행 → 그대로 유지 (지우지도 쓰지도 않음).
//   · 하위(실행번호 s/-) 행은 호출 쪽에서 existingRows에서 빼고 전달 → 완전 불변
//     (부모 _id가 안 바뀌므로 자리·실적 장부·Σ합계 전부 그대로).
export function computeMergePlan(existingRows, pendingRows, headers) {
    const numCol  = a4cNumCol(headers);
    const nameCol = a4cNameCol(headers);
    const cols    = (headers || []).filter(Boolean);
    const byNum = new Map(), byName = new Map();
    (existingRows || []).forEach(r => {
        const y = r._year || '';
        if (numCol)  { const v = padProjectNo(r[numCol]); if (v) byNum.set(`${y}||${v}`, r); }   // 번호 패딩 정규화 (2026-07-20)
        if (nameCol) { const v = a4cNormName(r[nameCol]);        if (v) byName.set(`${y}||${v}`, r); }
    });
    const matchedIds = new Set();
    const updates = [], creates = [];
    (pendingRows || []).forEach(p => {
        const y = p._year || '';
        let m = null;
        if (numCol)        { const v = padProjectNo(p[numCol]); if (v) m = byNum.get(`${y}||${v}`) || null; }
        if (!m && nameCol) { const v = a4cNormName(p[nameCol]);        if (v) m = byName.get(`${y}||${v}`) || null; }
        if (m && !matchedIds.has(m._id)) {
            matchedIds.add(m._id);
            const { _id, ...base } = m;                     // 기존 행 전부 (웹 전용 값 포함)
            const data = { ...base };
            let changed = false;
            cols.forEach(c => {
                const nv = String(p[c] ?? '').trim();
                if (String(m[c] ?? '') !== nv) changed = true;
                data[c] = nv;                               // 엑셀 컬럼 = 엑셀 값 (절대우선)
            });
            if ((p._year || '') && data._year !== p._year) { data._year = p._year; changed = true; }
            updates.push({ _id: m._id, data, changed });
        } else {
            // 미매칭, 또는 이미 다른 엑셀 행이 그 기존 행과 매칭됨(중복 번호) → 신규 추가 (덮어쓰기 사고 방지)
            const { _id, ...rest } = p;
            creates.push({ _id, data: rest });
        }
    });
    const upYears = new Set((pendingRows || []).map(p => p._year || ''));
    const missing = (existingRows || []).filter(r => upYears.has(r._year || '') && !matchedIds.has(r._id));
    return { numCol, nameCol, updates, creates, missing,
        counts: { updates: updates.length, changed: updates.filter(u => u.changed).length,
                  news: creates.length, missing: missing.length } };
}

// ─── 엑셀 헤더 파싱 ────────────────────────────────────────────────────────
// opts(선택, 팀 카드 '파서옵션' — 2026-08-11): { startRow: 헤더 시작행(0부터), layers: 2 = 그룹+세부 고정 }
//   opts 미지정 = 지금까지의 자동 감지 그대로 (기술2팀 등 기존 팀 동작 불변).
export function parseExcelHeaders(raw, addLog, opts) {
    let startRow = 0;
    if (opts && Number.isInteger(opts.startRow)) {
        startRow = opts.startRow;
        addLog(`헤더 시작행 지정: 행 ${startRow} (팀 카드 파서옵션)`);
    } else {
    while (startRow < Math.min(raw.length - 1, 5)) {
        const ne = (raw[startRow] || []).filter(v => String(v).trim() !== '').length;
        if (ne <= 2) { addLog(`행 ${startRow} 건너뜀 (비빈칸 ${ne}개)`); startRow++; }
        else break;
    }
    }
    const rowA = raw[startRow]     || [];
    const rowB = raw[startRow + 1] || [];
    const neA  = rowA.filter(v => String(v).trim() !== '').length;
    const neB  = rowB.filter(v => String(v).trim() !== '').length;
    addLog(`행${startRow}: ${neA}개 | 행${startRow+1}: ${neB}개`);

    // 3층 헤더(공사진행 > 진행현황/Point > PLC·ETOS·HMI / 총·누적) 지원 — 2026-06-27
    const rowC = raw[startRow + 2] || [];
    const neC  = rowC.filter(v => String(v).trim() !== '').length;
    // 세부행(rowC)에 값이 있고, 그 자리의 중간행(rowB)이 비어 있으면(병합 하위) = 3층 헤더
    const threeLayer = neA > 0 && neB > 0 && neC > 0 &&
        rowC.some((v, i) => String(v).trim() !== '' && String(rowB[i] || '').trim() === '');

    let groupArr, colArr, dataStart;
    if (opts && opts.layers === 2) {
        // 팀 카드 지정: 그룹행+세부행 2층 고정 (기술1팀 — 그룹행이 세부행보다 칸수가 적어 자동감지 조건(neA>neB)에 안 걸림)
        groupArr = rowA; colArr = rowB; dataStart = startRow + 2;
        addLog(`2행 헤더(카드 지정): 그룹[${startRow}], 컬럼[${startRow + 1}], 데이터=[${startRow + 2}~]`);
    } else if (opts && opts.layers === 1) {
        // 팀 카드 지정: 1층 고정 (기술2팀 2013·2014 — 첫 데이터 행이 헤더보다 칸이 많아 자동감지가 오인)
        groupArr = []; colArr = rowA; dataStart = startRow + 1;
        addLog(`1행 헤더(카드 지정): 컬럼[${startRow}], 데이터=[${startRow + 1}~]`);
    } else if (threeLayer) {
        // 그룹=rowA(맨 위), 컬럼명=세부(rowC) 우선·없으면 중간(rowB)
        groupArr = rowA;
        colArr   = rowA.map((_, i) => String(rowC[i] || '').trim() || String(rowB[i] || '').trim());
        dataStart = startRow + 3;
        addLog(`3행 헤더(3층): 그룹[${startRow}], 중간[${startRow+1}], 세부[${startRow+2}], 데이터=[${startRow+3}~]`);
    } else if (neA > 0 && neB > 0 && neA > neB) {
        groupArr = rowA; colArr = rowB; dataStart = startRow + 2;
        addLog(`2행 헤더: 그룹[${startRow}]=${neA}, 컬럼[${startRow+1}]=${neB}, 데이터=[${startRow+2}~]`);
    } else {
        groupArr = []; colArr = rowA; dataStart = startRow + 1;
        addLog(`1행 헤더: 컬럼[${startRow}]=${neA}, 데이터=[${startRow+1}~]`);
    }

    const maxLen = Math.max(groupArr.length, colArr.length);
    // 3층 중간행 라벨 (2026-08-24, 기술2팀 260822 — Total·진행현황·시운전): 세부행(rowC)에서 이름을 얻은 열만
    //   중간행(rowB) 라벨을 기억해 둠 → 표 헤더가 엑셀과 같은 3층으로 그려짐. 2층·1층 시트는 빈값(동작 불변).
    const midArr = [];
    if (threeLayer && !(opts && (opts.layers === 1 || opts.layers === 2))) {   // ★카드가 1·2층 고정한 시트는 제외 (2013·2014 — 데이터 행을 라벨로 오인 방지)
        let curMid = '';
        for (let i = 0; i < maxLen; i++) {
            if (String(rowB[i] || '').trim()) curMid = String(rowB[i] || '').trim().replace(/\s+/g, ' ');
            midArr[i] = String(rowC[i] || '').trim() ? curMid : '';
        }
    }
    const colDefs = [];
    let curGroup = null;
    for (let i = 0; i < maxLen; i++) {
        const gv = String(groupArr[i] || '').trim();
        const cv = String(colArr[i]   || '').trim();
        if (!gv && !cv) continue;
        if      (gv && !cv) { curGroup = null; colDefs.push({ idx: i, name: gv, groupLabel: null, mid: null }); }
        else if (gv &&  cv) { curGroup = gv;   colDefs.push({ idx: i, name: cv, groupLabel: gv, mid: midArr[i] || null });   }
        else if (!gv && cv) {                  colDefs.push({ idx: i, name: cv, groupLabel: curGroup, mid: midArr[i] || null }); }
    }

    // 헤더 이름 정규화 — 엑셀 셀의 줄바꿈·중복 공백을 단일 공백으로 (예: "공사[줄바꿈]계약" → "공사 계약")
    colDefs.forEach(cd => { cd.name = String(cd.name).replace(/\s+/g, ' ').trim(); });

    // ③ 중복 헤더 자동 구분 — 엑셀에 '발주처'가 2개라, 그대로 두면 데이터를 obj[name]으로 담을 때 한쪽이 덮어써짐.
    //    두 번째 등장부터 이름 분리: 발주처 → '발주처 담당자', 그 외 중복은 '이름 (2)' 식.
    const _seenName = {};
    for (const cd of colDefs) {
        const base = cd.name;
        if (_seenName[base]) {
            cd.name = base === '발주처' ? '발주처 담당자' : `${base} (${_seenName[base] + 1})`;
            _seenName[base] += 1;
            addLog(`중복 헤더 '${base}' → '${cd.name}'로 구분`);
        } else {
            _seenName[base] = 1;
        }
    }

    // '관리자' 열 자동 보장 (2026-07-22 팀장님): 엑셀에 없으면 담당자 앞에 웹 전용 열로 삽입 (idx -1 = 값은 빈칸 시작)
    //   ★기술2·3팀 전용 — 팀 카드 파서옵션.관리자열=false면 삽입 안 함 (2026-08-21: 기술1팀 원본에 없는 열이 발주처 그룹에 생기던 문제)
    if ((!opts || opts.관리자열 !== false) && !colDefs.some(cd => String(cd.name).replace(/\s+/g, '') === '관리자')) {
        const ai = colDefs.findIndex(cd => { const n = String(cd.name).replace(/\s+/g, ''); return n.includes('담당자') && !n.includes('업체') && !n.includes('발주처'); });
        if (ai >= 0) {
            colDefs.splice(ai, 0, { idx: -1, name: '관리자', groupLabel: colDefs[ai].groupLabel });
            addLog(`'관리자' 열 자동 추가 (담당자 앞)`);
        }
    }

    const colGroups = [];
    for (const cd of colDefs) {
        if (!cd.groupLabel) {
            colGroups.push({ label: '', cols: [cd.name] });
        } else {
            const last = colGroups[colGroups.length - 1];
            if (last && last.label === cd.groupLabel) last.cols.push(cd.name);
            else colGroups.push({ label: cd.groupLabel, cols: [cd.name] });
        }
    }
    addLog(`열 ${colDefs.length}개, 그룹 ${colGroups.filter(g=>g.label).length}개`);
    return { colDefs, colGroups, dataStart };
}

// ─── NAS 진척자료 자동 반영 (2026-07-22) ─────────────────────────────────────
//   프로젝트 행 _extSync = { uncPath, rules: [ { target, filePattern, sheet, cells, op, decimals } ] }
//   · target      : 값이 들어갈 메인표 헤더 (예: 'PLC')
//   · filePattern : 폴더에서 찾을 파일 이름 조각 (예: '01 진행현황' — 공백·대소문자 무시 포함검색)
//   · sheet       : 읽을 시트 이름 (예: '#1 L1 진행현황')
//   · cells       : 읽을 셀 주소 배열 (예: ['L5','M5','L14','M14'])
//   · op          : 'avg'(평균) | 'sum'(합계)
//   · decimals    : 반올림 소수 자리 (기본 1)
//   폴더 핸들(파일 접근 허가증)은 PC별 IndexedDB에만 저장 — 규칙·경로(_extSync)만 클라우드 공유.
const extNorm = (v) => String(v ?? '').replace(/\s+/g, '').toUpperCase();

// ══════════════════════════════════════════════════════════════════════════════
//  ★ NAS 진척자료 동기화 — 전면 비활성화 (2026-07-30 팀장님 지시)
// ══════════════════════════════════════════════════════════════════════════════
//  왜 끄는가:
//    오피스365 클라우드 방식(Graph API 직접 읽기)과 비교 평가하려면, NAS 경유
//    자동 반영이 살아 있으면 안 된다. 둘이 같은 칸(PLC·ETOS·하위 공종표)에 값을
//    쓰기 때문에, 화면에 보이는 숫자가 어느 쪽에서 왔는지 구분할 수 없다.
//    (2026-07-30 실측: NAS 30분 자동 반영과 OneDrive 동기화 지연이 겹쳐 이틀간 원인 규명 불가)
//
//  이 스위치 하나로 꺼지는 것:
//    · 자동 반영 규칙 전체 (extRulesOf가 빈 배열을 반환 → 아래 함수 전부 무력화)
//    · 잠금 열 / 진행실적 팝업·모바일 항목 잠금 (규칙이 없으니 잠글 대상도 없음)
//    · 메인 PC 30분 주기 자동 반영, 화면 진입 1회 자동 확인
//    · NAS 칩 버튼 · NAS 연결 모달 · 메인 PC 메뉴 · 메인 PC 배지 (ProjectListScreen에서 별도 가드)
//
//  ★ 되살리는 방법: 아래 값을 true 로만 바꾸면 원래 기능이 그대로 복구된다.
//    규칙·경로 데이터(행의 _extSync)는 지우지 않고 클라우드에 그대로 보존해 두었다.
//    폴더 허가증(PC별 IndexedDB)만 PC에서 다시 지정하면 된다.
export const NAS_SYNC_ENABLED = true;

// ═══════════════════════════════════════════════════════════════════════════
//  ★ 규칙 등록 화면 스위치 (2026-07-31) — 오피스365 방식용
// ═══════════════════════════════════════════════════════════════════════════
//  왜 스위치를 따로 두는가:
//    NAS_SYNC_ENABLED 는 '브라우저가 파일을 직접 읽어 자동 반영하는 기능'의 스위치다.
//    오피스365 방식에서는 그 읽기를 NAS Docker 프로그램(pms-reader)이 대신 하므로
//    브라우저 읽기는 계속 꺼두어야 한다. 그런데 '규칙(_extSync.rules)'은
//    두 방식이 똑같은 것을 쓰기 때문에, 규칙을 등록·수정하는 화면만 따로 켜야 한다.
//
//  이 스위치가 켜는 것 (화면만):
//    · 행의 규칙 칩 버튼 · 규칙 등록 모달 (규칙 추가/삭제/저장 · 하위 공종표 프리셋)
//  이 스위치가 켜지 '않는' 것:
//    · 브라우저의 파일 읽기·자동 반영·칸 잠금 (그건 NAS_SYNC_ENABLED 담당 — 계속 false)
export const RULE_UI_ENABLED = true;

// 규칙 '원본' 읽기 — NAS_SYNC_ENABLED 와 무관하게 행에 저장된 규칙을 그대로 돌려준다.
//   ★ 규칙 등록 화면은 반드시 이 함수를 써야 한다.
//     extRulesOf 는 NAS_SYNC_ENABLED=false 일 때 빈 배열을 주므로, 그걸로 목록을 그리면
//     기존 규칙이 있어도 '등록된 규칙 없음'으로 보이고,
//     거기에 규칙을 하나 추가·저장하면 기존 규칙이 통째로 지워진다. (2026-07-31)
export const extRulesRawOf = (row) => (row && row._extSync && Array.isArray(row._extSync.rules)) ? row._extSync.rules : [];

export const extRulesOf = (row) => (NAS_SYNC_ENABLED && row && row._extSync && Array.isArray(row._extSync.rules)) ? row._extSync.rules : [];
export const extLockedColsOf = (row) => extRulesOf(row).map(r => r.target);
export const isExtLockedCol = (row, header) => extLockedColsOf(row).some(t => extNorm(t) === extNorm(header));
// 대상 헤더명 → 진행실적 팝업 항목 키 (팝업·모바일 키인 잠금 전달용)
const EXT_KEY_MAP = { '도면입수': 'drawing', 'I/OMAP': 'iomap', '화면작성': 'screen', '기준정보': 'baseinfo', 'PLC': 'plc', 'ETOS': 'etos', 'HMI': 'hmi', '자체시운전': 'commissioning', '통합시운전': 'intCommissioning' };
export const extLockedItemKeysOf = (row) => extLockedColsOf(row).map(t => EXT_KEY_MAP[extNorm(t)]).filter(Boolean);

// 파일명에서 마지막 6자리 날짜(YYMMDD) 추출 — 없으면 0
export const extNameDate = (name) => {
    const m = String(name || '').match(/\d{6}/g);
    return m && m.length ? Number(m[m.length - 1]) : 0;
};

// 폴더의 파일 목록에서 규칙에 맞는 '최신' 파일 고르기. files = [{ name, lastModified }]
//   ① 이름이 filePattern 포함(공백·대소문자 무시) + 엑셀 확장자 + 임시(~$) 제외
//   ② 파일명 마지막 6자리 날짜(YYMMDD) 큰 것 → ③ 없거나 같으면 수정시각(lastModified) 큰 것
export const pickLatestExtFile = (files, filePattern) => {
    const pat = extNorm(filePattern);
    const list = (files || []).filter(f => {
        const n = String(f.name || '');
        if (n.startsWith('~$')) return false;
        if (!/\.(xlsx|xlsm|xls)$/i.test(n)) return false;
        return pat ? extNorm(n).includes(pat) : true;
    });
    if (!list.length) return null;
    return list.reduce((best, f) => {
        if (!best) return f;
        const da = extNameDate(f.name), db = extNameDate(best.name);
        if (da !== db) return da > db ? f : best;
        return (f.lastModified || 0) > (best.lastModified || 0) ? f : best;
    }, null);
};

// 'F24:M25' 같은 범위를 셀 목록으로 펼침 — 단일 셀은 그대로 (2026-07-22, 파일2 ETOS 16칸을 범위 하나로)
export const expandExtCells = (cells) => {
    const colNum = (s) => s.split('').reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0);
    const colStr = (n) => { let s = ''; while (n > 0) { s = String.fromCharCode(65 + ((n - 1) % 26)) + s; n = Math.floor((n - 1) / 26); } return s; };
    const out = [];
    for (const raw of (cells || [])) {
        const t = String(raw).trim().toUpperCase();
        const m = t.match(/^([A-Z]{1,3})(\d{1,5}):([A-Z]{1,3})(\d{1,5})$/);
        if (m) {
            const c1 = colNum(m[1]), c2 = colNum(m[3]), r1 = Number(m[2]), r2 = Number(m[4]);
            for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++)
                for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) out.push(colStr(c) + r);
        } else out.push(t);
    }
    return out;
};

// 워크북(SheetJS)에서 규칙값 계산 → { value } 또는 { error }
//   셀값 0~1.5 = 비율로 보고 ×100 (0.9714 → 97.14%), 그보다 크면 이미 % 숫자. 문자 '97%'도 인식.
//   (엑셀 수식 칸은 '마지막 저장 시점의 계산값'을 읽는다)
export const computeExtRuleValue = (wb, rule) => {
    const names = Object.keys((wb && wb.Sheets) || {});
    const sheetName = names.find(n => extNorm(n) === extNorm(rule.sheet));
    if (!sheetName) return { error: `시트 '${rule.sheet}' 없음` };
    const ws = wb.Sheets[sheetName];
    const nums = [];
    const addrs = expandExtCells(rule.cells);
    if (addrs.length > 200) return { error: `셀이 ${addrs.length}개 — 범위를 확인하세요(200개 초과)` };
    for (const addr of addrs) {
        const c = ws[String(addr).trim().toUpperCase()];
        let v = c ? c.v : undefined;
        if (typeof v === 'string') v = Number(v.replace(/[%\s,]/g, ''));
        if (typeof v !== 'number' || !Number.isFinite(v)) return { error: `셀 ${addr} 값이 숫자가 아님(빈칸?)` };
        nums.push(v >= 0 && v <= 1.5 ? v * 100 : v);
    }
    if (!nums.length) return { error: '읽을 셀이 없음' };
    const total = nums.reduce((s, v) => s + v, 0);
    const raw = rule.op === 'sum' ? total : total / nums.length;
    const d = Number.isFinite(rule.decimals) ? rule.decimals : 1;
    const p = Math.pow(10, d);
    return { value: Math.round(raw * p) / p, cellsRead: nums.length };
};

// ─── 하위 공종표 규칙 (2026-07-22 — 파일2 '진척률요약(Main)') ─────────────────
//   rule = { type:'subTable', filePattern, sheet, nameCol, subCols:{표항목:엑셀열}, subPtCol,
//            parentCols:{표항목:엑셀열}, parentAccCol, decimals }
//   · 공종 데이터 행 = 이름열에 글자 + 총점열·첫 %열이 숫자인 행 (위쪽 설정표는 자동 제외)
//   · 'B/이름열=총계' 행을 만나면 부모용 총계로 쓰고 중단 → 행이 위아래로 밀려도 이름 기준이라 안전
export const computeExtSubTable = (wb, rule) => {
    const names = Object.keys((wb && wb.Sheets) || {});
    const sheetName = names.find(n => extNorm(n) === extNorm(rule.sheet));
    if (!sheetName) return { error: `시트 '${rule.sheet}' 없음` };
    const ws = wb.Sheets[sheetName];
    const val = (col, r) => { const c = ws[String(col).toUpperCase() + r]; return c ? c.v : undefined; };
    const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
    const d = Number.isFinite(rule.decimals) ? rule.decimals : 1;
    const P = Math.pow(10, d);
    const pct = (v) => Math.round((v >= 0 && v <= 1.5 ? v * 100 : v) * P) / P;
    const subCols = rule.subCols || {};
    const firstCol = Object.values(subCols)[0];
    const rows = [];
    let total = null;
    for (let r = 1; r <= 400; r++) {
        const rawName = val(rule.nameCol || 'C', r);
        const isTotal = extNorm(val('B', r)) === '총계' || extNorm(rawName) === '총계';
        if (isTotal) {
            const values = {};
            for (const [target, col] of Object.entries(rule.parentCols || {})) {
                const v = val(col, r);
                if (!isNum(v)) return { error: `총계행 ${col}${r} 값이 숫자가 아님` };
                values[target] = pct(v);
            }
            let acc;
            if (rule.parentAccCol) {
                const v = val(rule.parentAccCol, r);
                if (!isNum(v)) return { error: `총계행 ${rule.parentAccCol}${r}(누적) 값이 숫자가 아님` };
                acc = v;
            }
            total = { values, acc };
            break;
        }
        if (rawName === undefined || String(rawName).trim() === '') continue;
        if (!isNum(val(rule.subPtCol, r)) || !isNum(val(firstCol, r))) continue;
        const values = {};
        let bad = '';
        for (const [target, col] of Object.entries(subCols)) {
            const v = val(col, r);
            if (!isNum(v)) { bad = col + r; break; }
            values[target] = pct(v);
        }
        if (bad) return { error: `공종 '${String(rawName).trim()}' ${bad} 값이 숫자가 아님` };
        rows.push({ name: String(rawName).trim(), row: r, values, pt: val(rule.subPtCol, r), acc: (rule.parentAccCol && isNum(val(rule.parentAccCol, r))) ? val(rule.parentAccCol, r) : undefined });   // 누적 = 같은 열의 공종 행 값 (2026-07-22)
    }
    if (!rows.length) return { error: '공종 행을 못 찾음 (이름열·시트 확인)' };
    if (!total) return { error: "'총계' 행을 못 찾음" };
    return { rows, total };
};

// 메인 행의 NAS 자동 칸(헤더 이름) — ProjectListScreen extLockedColsRow의 메인 행 규칙과 같음 (모바일 [적용하기]가 NAS 칸을 덮지 않게, 2026-09-30)
//   자기 규칙 대상 + 하위 공종표가 채우는 부모 칸 + 누적열(Point)·통합열(진행율 %) — 팀 카드 시운전 별칭
export const extLockedColsMainOf = (row, profile) => {
    const own = extLockedColsOf(row).filter(t => t !== '하위 공종표');
    const st = extRulesOf(row).find(r => r.type === 'subTable');
    const web = (nm) => nm === '누적' ? (profile?.시운전?.누적열 || nm) : nm === '통합시운전' ? (profile?.시운전?.통합열 || nm) : nm;
    return st ? [...own, ...Object.keys(st.parentCols || {}), web('누적'), web('통합시운전')] : own;
};

// 행의 잠금 항목 키 전체 (자기 규칙 + 하위공종표의 부모 항목 + 통합시운전) — 진행실적 팝업·모바일용
export const extLockedItemKeysAllOf = (row) => {
    const cols = extLockedColsOf(row).filter(t => t !== '하위 공종표');
    const st = extRulesOf(row).find(r => r.type === 'subTable');
    if (st) cols.push(...Object.keys(st.parentCols || {}), '통합시운전');
    return [...new Set(cols.map(t => EXT_KEY_MAP[extNorm(t)]).filter(Boolean))];
};

// ── 행 순서 · 중간 삽입 (2026-10-01 팀장님: 복사한 행을 맨 끝이 아니라 원하는 프로젝트 위/아래에) ──────────
//   기본 순서 = 내부 ID(_id) 글자순 — 엑셀로 올린 행 = 엑셀 순서 · 웹에서 만든 행(row_manual_…) = 맨 뒤 (종전 그대로).
//   중간에 넣은 행에만 '자리 쪽지' _place = { id: 기준 행 _id, side: 'after'|'before', at: 시각(ms) } 를 붙여
//   그 행 바로 아래/위에 보이게 한다 → 기존 행은 하나도 안 바뀜(쓰기 = 새 행 1건). 번호(순번)는 손대지 않음(A안 —
//   엑셀 반영·확정 저장이 '연도+번호'로 짝을 찾으므로 번호를 밀면 옛 엑셀이 엉뚱한 프로젝트를 덮어씀).
//   · 묶음 = 메인 행 + 바로 뒤 하위(공종) 행들. 하위는 '바로 위 메인 행'을 부모로 보므로(Σ포인트·삭제 동반·표시)
//     묶음째로만 옮긴다 — 쪼개면 하위가 엉뚱한 프로젝트에 붙는다.
//   · 같은 기준 행에 여러 번 넣으면 엑셀처럼 나중 것이 기준 행 쪽 (아래 삽입 = 바로 아래 · 위 삽입 = 바로 위).
//   · 쪽지가 가리키는 행이 없음(완전 삭제)·다른 연도·하위 행·자기 자신·꼬리 물기(순환)면 쪽지 무시 = 원래 자리.
//   · 쪽지가 하나도 없으면 _id 정렬 그대로 (종전과 100% 동일). 행 객체는 복사하지 않고 순서만 바꾼다(화면 재사용 유지).
//   쓰는 곳: List 표(구독)·연도별 1:1 검증·휴대폰 카드·기술1팀 월간보고 / 검사: tests/list/row_insert_test.js
export const isSubRowByExec = (r) => { const e = String(r?.['실행번호'] || '').trim().toLowerCase(); return e === 's' || e.startsWith('-'); };   // List isSubListRow와 같은 규칙
const placeOk = (p) => !!(p && p.id && (p.side === 'after' || p.side === 'before'));
export function orderListRows(rows, isSub = isSubRowByExec) {
    const base = [...(rows || [])].sort((a, b) => String(a._id).localeCompare(String(b._id)));
    if (!base.some(r => r && placeOk(r._place))) return base;
    const blocks = []; let cur = null;
    base.forEach((r, i) => {
        if (!isSub(r)) { cur = { head: r, items: [r], idx: i }; blocks.push(cur); }
        else if (cur) cur.items.push(r);
        else blocks.push({ head: null, items: [r], idx: i });   // 맨 앞 부모 없는 하위(비정상 데이터) = 제자리
    });
    const byId = new Map(); blocks.forEach(b => { if (b.head) byId.set(String(b.head._id), b); });
    const anc = new Map();   // 묶음 → { b: 기준 묶음, side, at }
    blocks.forEach(b => {
        const p = b.head && b.head._place;
        if (!placeOk(p)) return;
        const t = byId.get(String(p.id));
        if (!t || t === b || String(t.head._year || '') !== String(b.head._year || '')) return;
        anc.set(b, { b: t, side: p.side, at: Number(p.at) || 0 });
    });
    // 꼬리 물기(순환) 끊기 — 화면 조작으로는 안 생기지만 데이터가 꼬여도 행이 사라지지 않게 (한 번 확인한 길은 다시 안 걷기)
    const okB = new Set();
    blocks.forEach(b => {
        const path = [], seen = new Set(); let c = b;
        while (c && anc.has(c) && !okB.has(c)) {
            if (seen.has(c)) { anc.delete(c); break; }
            seen.add(c); path.push(c); c = anc.get(c).b;
        }
        path.forEach(x => okB.add(x));
    });
    const kids = new Map();   // 기준 묶음 → { before:[], after:[] }
    anc.forEach((a, b) => { if (!kids.has(a.b)) kids.set(a.b, { before: [], after: [] }); kids.get(a.b)[a.side].push(b); });
    kids.forEach(k => {
        k.after.sort((x, y) => (anc.get(y).at - anc.get(x).at) || (x.idx - y.idx));    // 아래 삽입: 최신 = 바로 아래
        k.before.sort((x, y) => (anc.get(x).at - anc.get(y).at) || (x.idx - y.idx));   // 위 삽입: 최신 = 바로 위
    });
    const out = [];
    const emit = (b) => { const k = kids.get(b); if (k) k.before.forEach(emit); out.push(...b.items); if (k) k.after.forEach(emit); };
    blocks.forEach(b => { if (!anc.has(b)) emit(b); });
    return out;
}
// 저장 전 새 행(노란 행)의 표시 자리 (2026-10-01): 기준 행이 화면에 있으면 바로 위/아래, 없으면 맨 아래(종전).
//   오래된 쪽지부터 넣어 최신이 기준 행 쪽 = 저장 뒤 순서(orderListRows)와 같은 규칙 ([저장] 때 at = 저장 순간으로 다시 찍음).
//   여러 행을 한꺼번에 넣으면 둘째 행부터 '앞 새 행 바로 아래' 쪽지 — 앞 행이 자리를 잡은 뒤 들어간다.
export function placeDraftRows(list, drafts, isSub = isSubRowByExec) {
    if (!drafts || !drafts.length) return list;
    const out = [...list];
    let todo = drafts.filter(d => placeOk(d._place)).sort((a, b) => (Number(a._place.at) || 0) - (Number(b._place.at) || 0));
    const rest = drafts.filter(d => !placeOk(d._place));
    for (let moved = true; todo.length && moved;) {
        moved = false;
        const next = [];
        todo.forEach(d => {
            const i = out.findIndex(r => r._id === d._place.id);
            if (i < 0) { next.push(d); return; }
            let j = i;
            if (d._place.side === 'after') { j = i + 1; while (j < out.length && isSub(out[j])) j++; }   // 기준 행의 하위 묶음 뒤
            out.splice(j, 0, d); moved = true;
        });
        todo = next;
    }
    return [...out, ...todo, ...rest];
}
// [완전 삭제] 때 쪽지 옮겨 달기 (2026-10-01): 지우는 행(X)을 기준으로 넣은 행들이 맨 뒤로 튀지 않고 제자리에 남게.
//   목표 순서 = 지우기 전 화면에서 X(+하위)만 뺀 것 → 그 목표에서 X의 직접 자식마다 기준을 '바로 앞 메인 행'으로
//   (맨 앞이면 '바로 뒤 메인 행'의 위 — 같이 옮겨 다는 형제 묶음은 건너뜀: 서로 기대면 꼬리 물기).
//   opt.view = 지우기 전 화면 순서(그 해 전체 · 노란 행 포함 — 없으면 rows로 계산) / opt.only = 옮겨 달 대상만(예: 노란 행).
//   저장된 행은 저장된 행끼리, 노란 행은 노란 행 포함 화면으로 따로 계산해도 같은 목표를 보므로 어긋나지 않는다.
//   반환 = [{ id, place }] (place = null → 쪽지 지움 = 원래 자리). 쓰는 쪽은 _place 한 칸만 merge로 저장.
export function planReanchorOnDelete(rows, delId, isSub = isSubRowByExec, now = Date.now(), opt = {}) {
    const del = String(delId);
    const x = (rows || []).find(r => String(r._id) === del);
    if (!x || isSub(x)) return [];
    const yr = String(x._year || '');
    const same = (rows || []).filter(r => String(r._year || '') === yr);
    const old = opt.view || orderListRows(same, isSub);
    const xi = old.findIndex(r => String(r._id) === del);
    if (xi < 0) return [];
    let xe = xi + 1; while (xe < old.length && isSub(old[xe])) xe++;
    const mains = [...old.slice(0, xi), ...old.slice(xe)].filter(r => !isSub(r));   // 목표 순서의 메인 행들
    const kids = mains.filter(r => placeOk(r._place) && String(r._place.id) === del && (!opt.only || opt.only(r)));
    if (!kids.length) return [];
    return reanchorInView(mains, kids, now);
}
// (공용) 목표 순서(mains = 메인 행만)에서 kids 각각의 새 쪽지 — 바로 앞 메인 행 '아래',
//   맨 앞이면 '바로 뒤 메인 행'의 위 (같이 옮겨 다는 형제 묶음은 건너뜀: 서로 기대면 꼬리 물기). 완전 삭제·잘라내기 옮기기가 같이 씀.
function reanchorInView(mains, kids, now) {
    const pos = new Map(mains.map((r, i) => [String(r._id), i]));
    const kidsOf = new Map();
    mains.forEach(r => { if (placeOk(r._place)) { const k = String(r._place.id); if (!kidsOf.has(k)) kidsOf.set(k, []); kidsOf.get(k).push(r); } });
    const span = (r) => {   // 그 행 + 쪽지로 이어진 후손이 차지한 목표 구간 [처음, 끝]
        let lo = Infinity, hi = -Infinity; const seen = new Set(), st = [r];
        while (st.length) {
            const c = st.pop(), id = String(c._id);
            if (seen.has(id)) continue; seen.add(id);
            const p = pos.get(id); if (p !== undefined) { if (p < lo) lo = p; if (p > hi) hi = p; }
            (kidsOf.get(id) || []).forEach(k => st.push(k));
        }
        return [lo, hi];
    };
    const spans = kids.map(d => ({ d, s: span(d) })).sort((p, q) => p.s[0] - q.s[0]);
    return spans.map(({ d, s }) => {
        if (s[0] > 0) return { id: d._id, place: { id: mains[s[0] - 1]._id, side: 'after', at: now } };
        let j = s[1] + 1;
        for (let k = 0; k < spans.length; k++) { const o = spans[k].s; if (j >= o[0] && j <= o[1]) { j = o[1] + 1; k = -1; } }   // 형제 묶음이면 그 끝 다음으로 (처음부터 다시 확인)
        if (j < mains.length) return { id: d._id, place: { id: mains[j]._id, side: 'before', at: now } };
        return { id: d._id, place: null };
    });
}
// [잘라내기 → 옮기기] (2026-10-01 팀장님: 엑셀처럼 Ctrl+X) — 잘라낸 행들(하위 묶음째)을 기준 행 위/아래로 '자리만' 옮긴다.
//   복사·삭제가 아니라 그 행에 쪽지만 바꿔 다는 것 → 수행번호·진행실적·이력·내부 ID 전부 그대로.
//   · 잘라낸 행 = 화면 순서대로 첫 행이 기준 행 위/아래, 나머지는 앞 행 바로 아래 (순서 유지)
//   · 잘라낸 행에 기대어 있던 다른 행(그 아래 넣었던 행 등)은 제자리에 남김 = 완전 삭제 때와 같은 계산
//   · 시각: 남는 행 = now, 옮기는 행 = now+1 → 같은 기준 행에 서로 붙어도 옮긴 행이 기준 행 쪽 (엑셀 '잘라낸 셀 삽입'과 같은 자리)
//   rows = 지금 화면 기준 행들(저장값 + 저장 전 옮기기 초안) · 같은 연도 메인 행만 · 실패(기준이 잘라낸 행/하위/다른 연도 등) = null
export function planMoveRows(rows, cutIds, targetId, side, isSub = isSubRowByExec, now = Date.now()) {
    const cut = new Set((cutIds || []).map(String));
    const tgt = (rows || []).find(r => String(r._id) === String(targetId));
    if (!tgt || isSub(tgt) || cut.has(String(tgt._id)) || (side !== 'before' && side !== 'after') || !cut.size) return null;
    const yr = String(tgt._year || '');
    const old = orderListRows((rows || []).filter(r => String(r._year || '') === yr), isSub);
    const cutRows = old.filter(r => !isSub(r) && cut.has(String(r._id)));
    if (cutRows.length !== cut.size) return null;   // 다른 연도·하위·없는 행이 섞임
    let inCut = false;
    const mains = [];
    old.forEach(r => { if (!isSub(r)) { inCut = cut.has(String(r._id)); if (!inCut) mains.push(r); } });   // 잘라낸 묶음을 뺀 순서 = 남는 행들의 목표
    const kids = mains.filter(r => placeOk(r._place) && cut.has(String(r._place.id)));
    const plan = kids.length ? reanchorInView(mains, kids, now) : [];
    cutRows.forEach((r, i) => plan.push({ id: r._id, place: i === 0 ? { id: tgt._id, side, at: now + 1 } : { id: cutRows[i - 1]._id, side: 'after', at: now + 1 } }));
    return plan;
}
// ── 행 순서 · 중간 삽입 끝 ──
