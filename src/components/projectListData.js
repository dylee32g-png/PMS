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

// ── 프로젝트별 진행항목 적용/미적용 → ProgressModal progressItems 변환 (2026-07-21 팀장님) ──
//   기본 미적용: 헤더(없으면 행의 키)에 열이 없는 항목은 기본 off — _naOn(켬 예외)·_naItems(끔 목록) 반영.
//   ProjectListScreen과 동일 규칙. 모바일(MobileInputScreen)에서 재사용.
export function naProgressItemsOf(row, headers) {
    const ALL = ['도면입수', 'I/O Map', '화면작성', '기준정보', 'PLC', 'ETOS', 'HMI', '자체시운전', '통합시운전'];
    const norm = (v) => String(v ?? '').replace(/\s+/g, '').toUpperCase();
    const hs = (headers && headers.length ? headers : Object.keys(row || {})).filter(h => !String(h).startsWith('_'));
    const defs = ALL.filter(name => !hs.some(h => norm(h).includes(norm(name))));
    const ex = Array.isArray(row && row._naItems) ? row._naItems : [];
    const on = Array.isArray(row && row._naOn) ? row._naOn : [];
    const na = [...new Set([...ex, ...defs.filter(n => !on.includes(n))])];
    if (!na.length) return undefined;
    const KEY = { '도면입수': 'drawing', 'I/OMAP': 'iomap', '화면작성': 'screen', '기준정보': 'baseinfo', 'PLC': 'plc', 'ETOS': 'etos', 'HMI': 'hmi' };
    const pi = {};
    na.forEach(h => {
        const k = KEY[norm(h)];
        const c = String(h).replace(/\s/g, '');
        if (k) pi[k] = false;
        else if (c.includes('자체시운전')) pi.internalTest = false;
        else if (c.includes('통합시운전')) pi.integratedTest = false;
    });
    return Object.keys(pi).length ? pi : undefined;
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
export function parseExcelHeaders(raw, addLog) {
    let startRow = 0;
    while (startRow < Math.min(raw.length - 1, 5)) {
        const ne = (raw[startRow] || []).filter(v => String(v).trim() !== '').length;
        if (ne <= 2) { addLog(`행 ${startRow} 건너뜀 (비빈칸 ${ne}개)`); startRow++; }
        else break;
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
    if (threeLayer) {
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
    const colDefs = [];
    let curGroup = null;
    for (let i = 0; i < maxLen; i++) {
        const gv = String(groupArr[i] || '').trim();
        const cv = String(colArr[i]   || '').trim();
        if (!gv && !cv) continue;
        if      (gv && !cv) { curGroup = null; colDefs.push({ idx: i, name: gv, groupLabel: null }); }
        else if (gv &&  cv) { curGroup = gv;   colDefs.push({ idx: i, name: cv, groupLabel: gv });   }
        else if (!gv && cv) {                  colDefs.push({ idx: i, name: cv, groupLabel: curGroup }); }
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
    if (!colDefs.some(cd => String(cd.name).replace(/\s+/g, '') === '관리자')) {
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
export const NAS_SYNC_ENABLED = false;

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

// 행의 잠금 항목 키 전체 (자기 규칙 + 하위공종표의 부모 항목 + 통합시운전) — 진행실적 팝업·모바일용
export const extLockedItemKeysAllOf = (row) => {
    const cols = extLockedColsOf(row).filter(t => t !== '하위 공종표');
    const st = extRulesOf(row).find(r => r.type === 'subTable');
    if (st) cols.push(...Object.keys(st.parentCols || {}), '통합시운전');
    return [...new Set(cols.map(t => EXT_KEY_MAP[extNorm(t)]).filter(Boolean))];
};
