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
        if (numCol)  { const v = String(r[numCol] ?? '').trim(); if (v) byNum.set(`${y}||${v}`, r); }
        if (nameCol) { const v = a4cNormName(r[nameCol]);        if (v) byName.set(`${y}||${v}`, r); }
    });
    const matched = new Set();
    const updates = [], news = [];
    (pendingRows || []).forEach(p => {
        const y = p._year || '';
        let m = null, via = '';
        if (numCol)        { const v = String(p[numCol] ?? '').trim(); if (v) { m = byNum.get(`${y}||${v}`) || null; if (m) via = '번호'; } }
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

    let groupArr, colArr, dataStart;
    if (neA > 0 && neB > 0 && neA > neB) {
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
