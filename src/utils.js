// ─── 주간보고 IndexedDB ───────────────────────────────────────────────────────
const WR_IDB_NAME  = 'WeeklyReportDB';
const WR_IDB_VER   = 1;
const WR_IDB_STORE = 'reports';

function openWrIDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(WR_IDB_NAME, WR_IDB_VER);
        req.onupgradeneeded = e => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(WR_IDB_STORE)) {
                db.createObjectStore(WR_IDB_STORE, { keyPath: 'id', autoIncrement: true });
            }
        };
        req.onsuccess = e => resolve(e.target.result);
        req.onerror   = e => reject(e.target.error);
    });
}

/** 신규 저장 → 부여된 id 반환 (fileBlob: 원본 Excel ArrayBuffer, 선택) */
export async function wrIdbAdd(fileName, sheets, fileBlob = null) {
    const db = await openWrIDB();
    return new Promise((resolve, reject) => {
        const tx  = db.transaction(WR_IDB_STORE, 'readwrite');
        const req = tx.objectStore(WR_IDB_STORE).add({
            fileName, sheets, fileBlob,
            savedAt: new Date().toISOString()
        });
        req.onsuccess = e => resolve(e.target.result);
        req.onerror   = e => reject(e.target.error);
    });
}

/** 기존 레코드 덮어쓰기 (id 필수, fileBlob: 원본 Excel ArrayBuffer, 선택) */
export async function wrIdbPut(id, fileName, sheets, fileBlob = null) {
    const db = await openWrIDB();
    return new Promise((resolve, reject) => {
        const tx  = db.transaction(WR_IDB_STORE, 'readwrite');
        const req = tx.objectStore(WR_IDB_STORE).put({
            id, fileName, sheets, fileBlob,
            savedAt: new Date().toISOString()
        });
        req.onsuccess = resolve;
        req.onerror   = e => reject(e.target.error);
    });
}

/** 전체 목록 로드 — sheets·fileBlob 제외 (메모리 절약, 목록 표시용) */
export async function wrIdbLoadAll() {
    const db = await openWrIDB();
    return new Promise((resolve, reject) => {
        const tx  = db.transaction(WR_IDB_STORE, 'readonly');
        const req = tx.objectStore(WR_IDB_STORE).getAll();
        req.onsuccess = e => {
            const list = (e.target.result || []).map(({ sheets, fileBlob, ...meta }) => meta);
            resolve(list);
        };
        req.onerror = e => reject(e.target.error);
    });
}

/** 단건 전체 로드 (sheets + fileBlob 포함) */
export async function wrIdbGet(id) {
    const db = await openWrIDB();
    return new Promise((resolve, reject) => {
        const tx  = db.transaction(WR_IDB_STORE, 'readonly');
        const req = tx.objectStore(WR_IDB_STORE).get(id);
        req.onsuccess = e => resolve(e.target.result || null);
        req.onerror   = e => reject(e.target.error);
    });
}

/** 단건 삭제 */
export async function wrIdbDelete(id) {
    const db = await openWrIDB();
    return new Promise((resolve, reject) => {
        const tx  = db.transaction(WR_IDB_STORE, 'readwrite');
        const req = tx.objectStore(WR_IDB_STORE).delete(id);
        req.onsuccess = resolve;
        req.onerror   = e => reject(e.target.error);
    });
}

// ─── PMS 월간보고 로컬 IndexedDB ────────────────────────────────────────────
const PMS_IDB_NAME  = 'PmsMonthlyLocalDB';
const PMS_IDB_VER   = 1;
const PMS_IDB_STORE = 'monthlyData';

function openPmsIDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(PMS_IDB_NAME, PMS_IDB_VER);
        req.onupgradeneeded = e => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(PMS_IDB_STORE)) {
                db.createObjectStore(PMS_IDB_STORE, { keyPath: 'teamId' });
            }
        };
        req.onsuccess = e => resolve(e.target.result);
        req.onerror   = e => reject(e.target.error);
    });
}

export async function pmsIdbSave(teamId, projects, baseDate) {
    const db = await openPmsIDB();
    return new Promise((resolve, reject) => {
        const tx  = db.transaction(PMS_IDB_STORE, 'readwrite');
        const req = tx.objectStore(PMS_IDB_STORE).put({
            teamId, projects, baseDate,
            savedAt: new Date().toISOString()
        });
        req.onsuccess = resolve;
        req.onerror   = e => reject(e.target.error);
    });
}

export async function pmsIdbLoad(teamId) {
    const db = await openPmsIDB();
    return new Promise((resolve, reject) => {
        const tx  = db.transaction(PMS_IDB_STORE, 'readonly');
        const req = tx.objectStore(PMS_IDB_STORE).get(teamId);
        req.onsuccess = e => resolve(e.target.result || null);
        req.onerror   = e => reject(e.target.error);
    });
}

export async function pmsIdbDelete(teamId) {
    const db = await openPmsIDB();
    return new Promise((resolve, reject) => {
        const tx  = db.transaction(PMS_IDB_STORE, 'readwrite');
        const req = tx.objectStore(PMS_IDB_STORE).delete(teamId);
        req.onsuccess = resolve;
        req.onerror   = e => reject(e.target.error);
    });
}

export const safeRender = (val) => {
    if (val === null || val === undefined) return '-';
    if (typeof val === 'object') {
        return val.name || val.label || val.title || JSON.stringify(val);
    }
    return String(val);
};

export const safeNumber = (val) => {
    if (val === null || val === undefined || val === '-' || val === '') return 0;
    const cleaned = String(val).replace(/[^0-9.-]/g, '');
    const num = Number(cleaned);
    return isNaN(num) ? 0 : num;
};

// --- 라이브러리 동적 로더 ---
export const loadXLSX = async () => {
    if (window.XLSX) return window.XLSX;
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
        script.onload = () => resolve(window.XLSX);
        script.onerror = () => reject(new Error("XLSX 라이브러리 로드 실패"));
        document.body.appendChild(script);
    });
};

export const loadExcelJS = async () => {
    if (window.ExcelJS) return window.ExcelJS;
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.3.0/exceljs.min.js";
        script.onload = () => resolve(window.ExcelJS);
        script.onerror = () => reject(new Error("ExcelJS 라이브러리 로드 실패"));
        document.body.appendChild(script);
    });
};

export const loadFileSaver = async () => {
    if (window.saveAs) return window.saveAs;
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js";
        script.onload = () => resolve(window.saveAs);
        script.onerror = () => reject(new Error("FileSaver 로드 실패"));
        document.body.appendChild(script);
    });
};
