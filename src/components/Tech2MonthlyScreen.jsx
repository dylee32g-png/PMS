import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, Download, Eye, EyeOff, FileText, Home, NotebookPen, Save, Search, X } from 'lucide-react';
import { collection, deleteDoc, doc, onSnapshot, setDoc, writeBatch } from 'firebase/firestore';
import { orderListRows, rowDocRef, rowsColRef, snapshotDocRef } from './projectListData';
import { subscribeAuditLog } from '../auditLog';
import { loadXLSX } from '../utils';
import { displayTeamName } from '../teamNames';
import { appId, db } from '../firebase';

const norm = (value) => String(value ?? '').replace(/\s/g, '').toLowerCase();
// S/W 월간보고 진행내용만 List의 항목별 줄바꿈 규칙으로 표시한다. 원본·엑셀 값은 유지.
const softwareContentLines = (value) => {
    const text = String(value ?? '').replace(/\r\n?/g, '\n').trim();
    if (!text) return [];
    let lines = text.split('\n');
    if (lines.length === 1 && /^[-·•]/.test(text)) lines = text.split(/\s+(?=[-·•]\s)/);
    return lines.map(line => line.trim()).filter(Boolean);
};
const numberOf = (value) => {
    const text = String(value ?? '').replace(/[Σ∑,%\s]/g, '');
    if (!text) return null;
    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : null;
};
const withoutSigma = (value) => typeof value === 'string' ? value.replace(/^\s*[Σ∑]\s*/, '') : value;
const reportInteger = (value) => {
    const numeric = numberOf(value);
    return numeric === null ? value : Math.round(numeric);
};
const reportOneDecimal = (value) => {
    const numeric = numberOf(value);
    return numeric === null ? value : numeric.toFixed(1);
};
const parseReportDate = (value, fallbackYear = new Date().getFullYear()) => {
    if (value && typeof value.toDate === 'function') value = value.toDate();
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    }
    if (typeof value === 'number' && Number.isFinite(value) && value > 20000) {
        const utc = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000);
        return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
    }
    const text = String(value ?? '').trim();
    if (!text) return null;
    let match = text.match(/^(\d{2})\s*['’`]\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})/);
    if (match) return new Date(2000 + Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    match = text.match(/^(\d{4})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})/);
    if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    match = text.match(/^(\d{2})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})/);
    if (match) return new Date(2000 + Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    match = text.match(/^(\d{1,2})\s*[-/.]\s*(\d{1,2})$/);
    if (match) return new Date(Number(fallbackYear), Number(match[1]) - 1, Number(match[2]));
    return null;
};
const formatReportDate = (value, fallbackYear) => {
    const date = parseReportDate(value, fallbackYear);
    return date ? `${date.getMonth() + 1}/${date.getDate()}` : value;
};
const isSubRow = (row) => {
    const exec = String(row?.['실행번호'] || '').trim().toLowerCase();
    return exec === 's' || exec.startsWith('-');
};
const reportStatus = (value) => {
    const status = String(value || '').trim();
    if (status === '진행') return '진행중';
    if (status === '미진행') return '미작업';
    return status;
};
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const localDateKey = (value) => {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const moveDate = (dateKey, days = 0, months = 0) => {
    if (!DATE_KEY_PATTERN.test(String(dateKey || ''))) return '';
    const [year, month, day] = dateKey.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    if (months) {
        const target = new Date(year, month - 1 + months, 1);
        const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
        target.setDate(Math.min(day, lastDay));
        date.setTime(target.getTime());
    }
    if (days) date.setDate(date.getDate() + days);
    return localDateKey(date);
};
const displayDateKey = (dateKey) => {
    if (!DATE_KEY_PATTERN.test(String(dateKey || ''))) return '';
    const [year, month, day] = dateKey.split('-').map(Number);
    return `${year}/${month}/${day}`;
};

const STATUS_STYLE = {
    '수정중': { color: '#1358a0', background: '#eff6ff', borderColor: '#bfdbfe' },
    '개발중': { color: '#047857', background: '#ecfdf5', borderColor: '#a7f3d0' },
    '진행중': { color: '#047857', background: '#ecfdf5', borderColor: '#a7f3d0' },
    '미작업': { color: '#64748b', background: '#f8fafc', borderColor: '#cbd5e1' },
    '신규': { color: '#1d4ed8', background: '#eff6ff', borderColor: '#bfdbfe' },
    '예상': { color: '#92400e', background: '#fffbeb', borderColor: '#fde68a' },
    '추진중': { color: '#92400e', background: '#fffbeb', borderColor: '#fde68a' },
    '완료': { color: '#b91c1c', background: '#fff1f2', borderColor: '#fecdd3' },
    '취소': { color: '#64748b', background: '#f8fafc', borderColor: '#cbd5e1' },
    '삭제': { color: '#64748b', background: '#f8fafc', borderColor: '#cbd5e1' },
    'Hold': { color: '#64748b', background: '#f8fafc', borderColor: '#cbd5e1' },
};
const MONTHLY_STATUS_EDIT_OPTIONS = ['진행중', '미작업', '신규'];
const MONTHLY_STATUS_SORT_ORDER = ['완료', '진행중', '신규', '미작업', '예정', '예상', '추진중', 'Hold', '취소', '삭제'];
const TECHNICAL_MONTHLY_STATUS_OPTIONS = ['금월완료', '진행중', '신규', '미작업', '예상'];
const MONTHLY_STATUS_LABEL = { '진행중': '진행', '미작업': '미진행' };

const COLUMNS = [
    { key: 'no', label: '번호', width: 58, align: 'center', names: ['번호', '순번'] },
    { key: 'exec', label: '수행번호', width: 78, align: 'center', names: ['수행번호'] },
    { key: 'estimate', label: '견적번호', width: 142, align: 'center', names: ['견적번호'] },
    { key: 'factory', label: '공장', width: 70, align: 'center', names: ['공장', '공장명', '지역명'] },
    { key: 'status', label: '진행현황', width: 88, align: 'center', names: ['진행 현황', '진행현황', '작업'] },
    { key: 'project', label: 'Project', width: 400, names: ['Project', '프로젝트', '프로젝트명', '공사명'] },
    { key: 'totalPoint', label: '전체포인트', width: 82, align: 'right', names: ['포인트', '총물량'] },
    { key: 'pointPrev', label: '전월', group: '시운전', period: 'month-prev', width: 82, align: 'right', names: ['Point'] },
    { key: 'pointCurr', label: '금월', group: '시운전', period: 'month-curr', width: 82, align: 'right', names: ['Point'] },
    { key: 'pointAcc', label: '누적', group: '시운전', period: 'curr', width: 82, align: 'right', names: ['Point', '누적'] },
    { key: 'ratePrev', label: '전월', group: '진행율(%)', period: 'prev', width: 92, align: 'right', names: ['진행율 %', '진행율(%)', '진행률 %', '진행률(%)', '전체'] },
    { key: 'rateCurr', label: '금월', group: '진행율(%)', period: 'curr', width: 92, align: 'right', names: ['진행율 %', '진행율(%)', '진행률 %', '진행률(%)', '전체'] },
    { key: 'date', label: '날짜', group: '시운전 현황', width: 104, align: 'center', names: ['날짜', '완료 처리', '일자'] },
    { key: 'content', label: '내용', group: '시운전 현황', width: 354, names: ['내용', '비고 [ISSUE]', '비고'] },
];
const SOFTWARE_COLUMNS = [
    { key: 'no', label: '번호', width: 64, align: 'center', names: ['번호'] },
    { key: 'exec', label: '수행번호', width: 88, align: 'center', names: ['수행번호'] },
    { key: 'factory', label: '공장구분', width: 92, align: 'center', names: ['공장 구분', '공장구분'] },
    { key: 'status', label: '진행현황', width: 92, align: 'center', names: ['진행 현황', '진행현황', '작업'] },
    { key: 'project', label: '프로젝트명', width: 430, names: ['프로젝트명'] },
    { key: 'rate', label: '공정율(%)', width: 100, align: 'right', names: ['공정율(%)', '공정률(%)', '공정율', '공정률'] },
    { key: 'start', label: '시작일', width: 116, align: 'center', names: ['시작일'] },
    { key: 'end', label: '완료일', width: 136, align: 'center', names: ['완료예정·종료일', '완료예정/종료일', '완료일'] },
    { key: 'content', label: '진행내용', width: 520, names: ['진행 내용', '진행내용'] },
];
const COLUMN_WIDTHS_KEY = 'pms_tech2_monthly_column_widths';
const FONT_SIZE_KEY = 'pms_tech2_monthly_font_size';
const HIDDEN_PROJECTS_KEY = 'pms_monthly_hidden_projects_v1';
const FONT_SIZE_OPTIONS = [10, 11, 12, 13, 14, 16, 18, 20, 22, 24];
const MEMO_FONT_SIZE_OPTIONS = [12, 14, 16, 18, 20, 22, 24, 28];
const MEMO_COLOR_OPTIONS = ['#37352f', '#0f5a99', '#047857', '#b45309', '#dc2626', '#7c3aed'];
const projectRowKey = (row) => String(row?._pid || row?.pid || row?._id || row?.id || row?.['수행번호'] || row?.['실행번호'] || row?.['Project'] || row?.['프로젝트명'] || row?.['공사명'] || '');
const hiddenProjectDocId = (projectKey) => {
    const raw = String(projectKey || '');
    let hash = 2166136261;
    for (let index = 0; index < raw.length; index += 1) {
        hash ^= raw.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return `hidden_${(hash >>> 0).toString(36)}`;
};
const monthlyEstimateDocId = (row) => {
    const direct = String(row?._id || row?.id || '').trim();
    if (direct && !direct.includes('/') && direct.length <= 500) return direct;
    const raw = projectRowKey(row) || JSON.stringify(row || {});
    let hash = 2166136261;
    for (let index = 0; index < raw.length; index += 1) {
        hash ^= raw.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return `project_${(hash >>> 0).toString(36)}`;
};
const monthlyStatusDocId = (row, periodKey) => {
    const raw = `${periodKey}|${projectRowKey(row)}`;
    let hash = 2166136261;
    for (let index = 0; index < raw.length; index += 1) {
        hash ^= raw.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return `status_${(hash >>> 0).toString(36)}`;
};
const loadColumnWidths = () => {
    try {
        const saved = JSON.parse(localStorage.getItem(COLUMN_WIDTHS_KEY) || '{}');
        return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
    } catch (e) { return {}; }
};
const loadFontSize = () => {
    try {
        const value = Number(localStorage.getItem(FONT_SIZE_KEY));
        return FONT_SIZE_OPTIONS.includes(value) ? value : 12;
    } catch (e) { return 12; }
};

export default function Tech2MonthlyScreen({ currentTeam, progressRecordsMap = {}, monthlyReportDates = {}, onBack, onGoToList }) {
    const isSoftware = currentTeam === 'Software팀';
    const activeColumns = isSoftware ? SOFTWARE_COLUMNS : COLUMNS;
    const [selectedReportDate, setSelectedReportDate] = useState('');
    const now = new Date();
    const currentYear = String(now.getFullYear());
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const previousMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const previousMonthKey = `${previousMonthDate.getFullYear()}-${String(previousMonthDate.getMonth() + 1).padStart(2, '0')}`;
    const savedReportDates = useMemo(() => (
        Object.values(monthlyReportDates).filter(value => DATE_KEY_PATTERN.test(String(value))).sort()
    ), [monthlyReportDates]);
    const selectedReportIndex = savedReportDates.indexOf(selectedReportDate);
    const currentReportIndex = selectedReportIndex >= 1 ? selectedReportIndex : savedReportDates.length - 1;
    const currentReportDate = currentReportIndex >= 1 ? savedReportDates[currentReportIndex] : '';
    const previousReportDate = currentReportIndex >= 1 ? savedReportDates[currentReportIndex - 1] : '';
    const priorReportDate = currentReportIndex >= 2 ? savedReportDates[currentReportIndex - 2] : '';
    const hasReportPeriod = Boolean(currentReportDate && previousReportDate);
    const reportPeriodOptions = useMemo(() => savedReportDates.slice(1).map((endDate, index) => ({
        endDate,
        reportDate: endDate,
        startDate: savedReportDates[index],
        periodEndDate: moveDate(endDate, -1),
    })).reverse(), [savedReportDates]);
    const reportYear = currentReportDate ? currentReportDate.slice(0, 4) : currentYear;
    const currentReportPeriod = useMemo(() => hasReportPeriod ? ({ start: previousReportDate, endExclusive: currentReportDate }) : null, [currentReportDate, hasReportPeriod, previousReportDate]);
    const previousReportPeriod = useMemo(() => hasReportPeriod ? ({ start: priorReportDate || moveDate(previousReportDate, 0, -1), endExclusive: previousReportDate }) : null, [hasReportPeriod, previousReportDate, priorReportDate]);
    const previousSnapshotKey = hasReportPeriod ? previousReportDate.slice(0, 7) : previousMonthKey;
    const [rows, setRows] = useState([]);
    const [loaded, setLoaded] = useState(false);
    const [auditEntries, setAuditEntries] = useState([]);
    const [auditLoaded, setAuditLoaded] = useState(false);
    const [previousMonthSnapshot, setPreviousMonthSnapshot] = useState(null);
    const [query, setQuery] = useState('');
    const [statusSortMode, setStatusSortMode] = useState('number');
    const [execSortDirection, setExecSortDirection] = useState(null);
    const [selectedStatuses, setSelectedStatuses] = useState(isSoftware ? ['수정중'] : ['진행중']);
    const [selectedProjectId, setSelectedProjectId] = useState(null);
    const [columnWidths, setColumnWidths] = useState(loadColumnWidths);
    const [tableFontSize, setTableFontSize] = useState(loadFontSize);
    const [hiddenProjectKeys, setHiddenProjectKeys] = useState(() => {
        try {
            const saved = JSON.parse(localStorage.getItem(`${HIDDEN_PROJECTS_KEY}_${currentTeam}`) || '[]');
            return Array.isArray(saved) ? saved : [];
        } catch (e) { return []; }
    });
    const [hiddenMenuOpen, setHiddenMenuOpen] = useState(false);
    const [rowContextMenu, setRowContextMenu] = useState(null);
    const [statusContextMenu, setStatusContextMenu] = useState(null);
    const [monthlyEstimates, setMonthlyEstimates] = useState({});
    const [monthlyStatuses, setMonthlyStatuses] = useState({});
    const [estimateDrafts, setEstimateDrafts] = useState({});
    const [statusDrafts, setStatusDrafts] = useState({});
    const [estimateBatchSaving, setEstimateBatchSaving] = useState(false);
    const [estimateMessage, setEstimateMessage] = useState('');
    const [memoOpen, setMemoOpen] = useState(false);
    const [memoNotes, setMemoNotes] = useState({});
    const [memoPeriodDate, setMemoPeriodDate] = useState('');
    const [memoText, setMemoText] = useState('');
    const [memoFontSize, setMemoFontSize] = useState(14);
    const [memoColor, setMemoColor] = useState('#37352f');
    const [memoBaseColor, setMemoBaseColor] = useState('#37352f');
    const [memoDirty, setMemoDirty] = useState(false);
    const [memoSaving, setMemoSaving] = useState(false);
    const [memoMessage, setMemoMessage] = useState('');
    const [memoPosition, setMemoPosition] = useState({ x: null, y: 70 });
    const resizeCleanupRef = useRef(() => {});
    const legacyStatusRestoreRef = useRef(new Set());
    const hiddenMigrationRef = useRef(new Set());
    const memoEditorRef = useRef(null);
    const memoSelectionRef = useRef(null);

    useEffect(() => () => resizeCleanupRef.current(), []);
    useEffect(() => {
        try {
            const saved = JSON.parse(localStorage.getItem(`${HIDDEN_PROJECTS_KEY}_${currentTeam}`) || '[]');
            setHiddenProjectKeys(Array.isArray(saved) ? saved : []);
        } catch (e) { setHiddenProjectKeys([]); }
        setHiddenMenuOpen(false);
        setRowContextMenu(null);
        setStatusContextMenu(null);
        setStatusSortMode('number');
        setExecSortDirection(null);
    }, [currentTeam]);
    useEffect(() => {
        const closeMenus = () => { setHiddenMenuOpen(false); setRowContextMenu(null); setStatusContextMenu(null); };
        document.addEventListener('click', closeMenus);
        window.addEventListener('blur', closeMenus);
        return () => {
            document.removeEventListener('click', closeMenus);
            window.removeEventListener('blur', closeMenus);
        };
    }, []);

    const hideProject = useCallback(async (row) => {
        const key = projectRowKey(row);
        if (!key) return;
        setHiddenProjectKeys(previous => [...new Set([...previous, key])]);
        setSelectedProjectId(previous => previous === (row._id || '') ? null : previous);
        setRowContextMenu(null);
        try {
            const savedAt = new Date().toISOString();
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', `monthlyReportHiddenProjects_${currentTeam}`, hiddenProjectDocId(key)), {
                team: currentTeam,
                projectKey: key,
                projectName: String(row['Project'] || row['프로젝트명'] || row['공사명'] || '').trim(),
                createdAt: savedAt,
                updatedAt: savedAt,
            }, { merge: true });
        } catch (error) {
            setHiddenProjectKeys(previous => previous.filter(item => item !== key));
            window.alert('프로젝트 비활성 저장에 실패했습니다.');
        }
    }, [currentTeam]);
    const restoreProject = useCallback(async (key) => {
        setHiddenProjectKeys(previous => previous.filter(item => item !== key));
        try {
            await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', `monthlyReportHiddenProjects_${currentTeam}`, hiddenProjectDocId(key)));
        } catch (error) {
            setHiddenProjectKeys(previous => [...new Set([...previous, key])]);
            window.alert('프로젝트 활성화 저장에 실패했습니다.');
        }
    }, [currentTeam]);
    const restoreAllProjects = useCallback(async () => {
        const keys = [...hiddenProjectKeys];
        setHiddenProjectKeys([]);
        try {
            for (let offset = 0; offset < keys.length; offset += 400) {
                const batch = writeBatch(db);
                keys.slice(offset, offset + 400).forEach(key => {
                    batch.delete(doc(db, 'artifacts', appId, 'public', 'data', `monthlyReportHiddenProjects_${currentTeam}`, hiddenProjectDocId(key)));
                });
                await batch.commit();
            }
        } catch (error) {
            setHiddenProjectKeys(keys);
            window.alert('프로젝트 전체 활성화 저장에 실패했습니다.');
        }
    }, [currentTeam, hiddenProjectKeys]);

    const widthOf = (column) => columnWidths[column.key] || column.width;
    const tableWidth = activeColumns.reduce((sum, column) => sum + widthOf(column), 0);
    const startColumnResize = (event, column) => {
        event.preventDefault();
        event.stopPropagation();
        resizeCleanupRef.current();
        const drag = { startX: event.clientX, startWidth: widthOf(column), width: widthOf(column) };
        const onMove = (moveEvent) => {
            drag.width = Math.max(44, Math.min(900, Math.round(drag.startWidth + moveEvent.clientX - drag.startX)));
            setColumnWidths(previous => ({ ...previous, [column.key]: drag.width }));
        };
        const cleanup = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            resizeCleanupRef.current = () => {};
        };
        const onUp = () => {
            setColumnWidths(previous => {
                const next = { ...previous, [column.key]: drag.width };
                try { localStorage.setItem(COLUMN_WIDTHS_KEY, JSON.stringify(next)); } catch (e) {}
                return next;
            });
            cleanup();
        };
        resizeCleanupRef.current = cleanup;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    };
    const resetColumnWidth = (event, column) => {
        event.preventDefault();
        event.stopPropagation();
        setColumnWidths(previous => {
            const next = { ...previous };
            delete next[column.key];
            try { localStorage.setItem(COLUMN_WIDTHS_KEY, JSON.stringify(next)); } catch (e) {}
            return next;
        });
    };
    const resizeHandle = (column) => (
        <span className="monthly-col-resizer" onClick={event => event.stopPropagation()} onMouseDown={event => startColumnResize(event, column)} onDoubleClick={event => resetColumnWidth(event, column)}
            title="드래그: 열 너비 조정 · 더블클릭: 기본 너비"
            style={{ position: 'absolute', top: 0, right: -4, width: 9, height: '100%', cursor: 'col-resize', zIndex: 50, borderRight: '1px solid transparent' }}/>
    );

    useEffect(() => {
        setLoaded(false);
        const unsubscribe = onSnapshot(rowsColRef(currentTeam), (snapshot) => {
            setRows(orderListRows(snapshot.docs.map(doc => ({ _id: doc.id, ...doc.data() }))));
            setLoaded(true);
        }, () => setLoaded(true));
        return unsubscribe;
    }, [currentTeam]);

    useEffect(() => {
        const storageKey = `${HIDDEN_PROJECTS_KEY}_${currentTeam}`;
        const hiddenRef = collection(db, 'artifacts', appId, 'public', 'data', `monthlyReportHiddenProjects_${currentTeam}`);
        return onSnapshot(hiddenRef, snapshot => {
            const remoteKeys = snapshot.docs.map(item => String(item.data()?.projectKey || '')).filter(Boolean);
            let localKeys = [];
            try {
                const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
                if (Array.isArray(saved)) localKeys = saved.map(String).filter(Boolean);
            } catch (e) {}
            const missingLocalKeys = localKeys.filter(key => !remoteKeys.includes(key));
            setHiddenProjectKeys([...new Set([...remoteKeys, ...missingLocalKeys])]);
            if (!missingLocalKeys.length) {
                try { localStorage.removeItem(storageKey); } catch (e) {}
                return;
            }
            const migrationKey = `${currentTeam}|${missingLocalKeys.slice().sort().join('|')}`;
            if (hiddenMigrationRef.current.has(migrationKey)) return;
            hiddenMigrationRef.current.add(migrationKey);
            const migrateLocalHiddenProjects = async () => {
                try {
                    for (let offset = 0; offset < missingLocalKeys.length; offset += 400) {
                        const batch = writeBatch(db);
                        missingLocalKeys.slice(offset, offset + 400).forEach(projectKey => {
                            const savedAt = new Date().toISOString();
                            batch.set(doc(hiddenRef, hiddenProjectDocId(projectKey)), {
                                team: currentTeam,
                                projectKey,
                                createdAt: savedAt,
                                updatedAt: savedAt,
                            }, { merge: true });
                        });
                        await batch.commit();
                    }
                    try { localStorage.removeItem(storageKey); } catch (e) {}
                } catch (error) {
                    hiddenMigrationRef.current.delete(migrationKey);
                }
            };
            migrateLocalHiddenProjects();
        }, () => {
            try {
                const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
                setHiddenProjectKeys(Array.isArray(saved) ? saved : []);
            } catch (e) { setHiddenProjectKeys([]); }
        });
    }, [currentTeam]);

    useEffect(() => {
        setMemoNotes({});
        const notesRef = collection(db, 'artifacts', appId, 'public', 'data', `monthlyReportNotes_${currentTeam}`);
        return onSnapshot(notesRef, snapshot => {
            const next = {};
            snapshot.docs.forEach(item => { next[item.id] = { id: item.id, ...item.data() }; });
            setMemoNotes(next);
        }, () => setMemoNotes({}));
    }, [currentTeam]);

    useEffect(() => {
        setMonthlyEstimates({});
        setEstimateDrafts({});
        setStatusDrafts({});
        setEstimateMessage('');
        const estimatesRef = collection(db, 'artifacts', appId, 'public', 'data', `monthlyReportEstimates_${currentTeam}`);
        return onSnapshot(estimatesRef, snapshot => {
            const next = {};
            snapshot.docs.forEach(item => { next[item.id] = { id: item.id, ...item.data() }; });
            setMonthlyEstimates(next);
        }, () => setMonthlyEstimates({}));
    }, [currentTeam]);

    useEffect(() => {
        setMonthlyStatuses({});
        setStatusDrafts({});
        const statusesRef = collection(db, 'artifacts', appId, 'public', 'data', `monthlyReportStatuses_${currentTeam}`);
        return onSnapshot(statusesRef, snapshot => {
            const next = {};
            snapshot.docs.forEach(item => { next[item.id] = { id: item.id, ...item.data() }; });
            setMonthlyStatuses(next);
        }, () => setMonthlyStatuses({}));
    }, [currentTeam]);

    useEffect(() => {
        if (!memoOpen || memoDirty || !memoPeriodDate) return;
        const saved = memoNotes[memoPeriodDate] || {};
        setMemoText(String(saved.text || ''));
        setMemoFontSize(MEMO_FONT_SIZE_OPTIONS.includes(Number(saved.fontSize)) ? Number(saved.fontSize) : 14);
        setMemoColor(String(saved.color || '#37352f'));
        setMemoBaseColor(String(saved.color || '#37352f'));
        if (memoEditorRef.current) {
            if (saved.html) memoEditorRef.current.innerHTML = String(saved.html);
            else memoEditorRef.current.textContent = String(saved.text || '');
        }
    }, [memoDirty, memoNotes, memoOpen, memoPeriodDate]);

    useEffect(() => {
        if (!memoOpen) return undefined;
        const trackSelection = () => {
            const selection = window.getSelection?.();
            const editor = memoEditorRef.current;
            if (!selection || !editor || selection.rangeCount === 0) return;
            const range = selection.getRangeAt(0);
            if (editor.contains(range.commonAncestorContainer)) memoSelectionRef.current = range.cloneRange();
        };
        document.addEventListener('selectionchange', trackSelection);
        return () => document.removeEventListener('selectionchange', trackSelection);
    }, [memoOpen]);

    useEffect(() => {
        setPreviousMonthSnapshot(null);
        const unsubscribe = onSnapshot(snapshotDocRef(currentTeam, previousSnapshotKey), snapshot => {
            setPreviousMonthSnapshot(snapshot.exists() ? snapshot.data() : null);
        }, () => setPreviousMonthSnapshot(null));
        return unsubscribe;
    }, [currentTeam, previousSnapshotKey]);

    useEffect(() => {
        setAuditLoaded(false);
        const unsubscribe = subscribeAuditLog(currentTeam, entries => {
            setAuditEntries(entries);
            setAuditLoaded(true);
        }, 5000);
        return unsubscribe;
    }, [currentTeam]);

    const headers = useMemo(() => {
        const found = [];
        rows.forEach(row => Object.keys(row).forEach(key => {
            if (!key.startsWith('_') && !found.includes(key)) found.push(key);
        }));
        return found;
    }, [rows]);

    const sourceColumn = useMemo(() => {
        const result = {};
        activeColumns.forEach(column => {
            if (currentTeam === '기술1팀' && column.key === 'project') {
                result[column.key] = headers.find(header => norm(header) === norm('공사명')) || '공사명';
                return;
            }
            if (currentTeam === '기술1팀' && column.key === 'date') {
                result[column.key] = headers.find(header => norm(header) === norm('시작')) || '시작';
                return;
            }
            result[column.key] = column.names
                .map(name => headers.find(header => norm(header) === norm(name)))
                .find(Boolean) || column.names[0];
        });
        if (!result.status) {
            result.status = headers.find(header => norm(header) === norm('진행 현황')) || '진행 현황';
        }
        return result;
    }, [activeColumns, headers, currentTeam]);
    const expectedColumn = useMemo(() => (
        headers.find(header => [norm('계약'), norm('계약현황'), norm('계약 현황')].includes(norm(header))) || ''
    ), [headers]);
    const isExpectedRow = useCallback((row) => {
        const status = norm(row[sourceColumn.status]);
        const contract = expectedColumn ? norm(row[expectedColumn]) : '';
        if (status === norm('취소')) return false;
        return ['예상', '예상프로젝트'].map(norm).includes(status)
            || ['예상', '예상프로젝트'].map(norm).includes(contract);
    }, [expectedColumn, sourceColumn]);
    const subPointByParent = useMemo(() => {
        const result = {};
        let lastMain = null;
        rows.forEach(row => {
            if (!isSubRow(row)) {
                lastMain = row;
                return;
            }
            if (!lastMain) return;
            const parentKey = String(lastMain._id || projectRowKey(lastMain));
            if (!parentKey) return;
            const entry = result[parentKey] || (result[parentKey] = { count: 0, sum: 0 });
            const pointValue = row[sourceColumn.totalPoint] ?? row['포인트'] ?? row['총'] ?? row['총물량'];
            entry.count += 1;
            entry.sum = Math.round((entry.sum + (numberOf(pointValue) || 0)) * 1000) / 1000;
        });
        return result;
    }, [rows, sourceColumn]);

    const estimateEntryForRow = useCallback((row) => {
        const direct = monthlyEstimates[monthlyEstimateDocId(row)];
        if (direct) return direct;
        const projectKey = projectRowKey(row);
        const execNo = String(row[sourceColumn.exec] || '').trim();
        const projectName = String(row[sourceColumn.project] || '').trim();
        return Object.values(monthlyEstimates).find(entry => (
            (projectKey && entry.projectKey === projectKey)
            || (execNo && projectName && String(entry.execNo || '').trim() === execNo && String(entry.projectName || '').trim() === projectName)
        )) || null;
    }, [monthlyEstimates, sourceColumn]);
    const estimateBaselineForRow = useCallback((row) => {
        const saved = estimateEntryForRow(row);
        if (saved) return String(saved.estimateNo || '');
        if (currentTeam === '기술1팀') return String(row['견적코드'] ?? row['견적 코드'] ?? '');
        return '';
    }, [currentTeam, estimateEntryForRow]);
    const estimateValueForRow = useCallback((row) => {
        const key = projectRowKey(row);
        if (Object.prototype.hasOwnProperty.call(estimateDrafts, key)) return estimateDrafts[key];
        return estimateBaselineForRow(row);
    }, [estimateBaselineForRow, estimateDrafts]);
    const currentStatusPeriodKey = currentReportDate || currentMonthKey;
    const monthlyStatusEntryForRow = useCallback((row) => {
        const direct = monthlyStatuses[monthlyStatusDocId(row, currentStatusPeriodKey)];
        if (direct) return direct;
        const projectKey = projectRowKey(row);
        return Object.values(monthlyStatuses).find(entry => (
            entry.periodKey === currentStatusPeriodKey && entry.projectKey === projectKey
        )) || null;
    }, [currentStatusPeriodKey, monthlyStatuses]);
    const statusValueForRow = useCallback((row) => {
        const key = projectRowKey(row);
        if (Object.prototype.hasOwnProperty.call(statusDrafts, key)) return statusDrafts[key];
        return String(monthlyStatusEntryForRow(row)?.status || reportStatus(row[sourceColumn.status]));
    }, [monthlyStatusEntryForRow, sourceColumn, statusDrafts]);

    useEffect(() => {
        if (!loaded || !sourceColumn.status || !currentStatusPeriodKey) return;
        const targets = rows.filter(row => (
            row?._id
            && row._updatedBy === '월간보고'
            && ['미작업', '신규'].includes(String(row[sourceColumn.status] || '').trim())
        ));
        if (!targets.length) return;
        const restoreKey = `${currentTeam}|${currentStatusPeriodKey}|${targets.map(row => row._id).sort().join(',')}`;
        if (legacyStatusRestoreRef.current.has(restoreKey)) return;
        legacyStatusRestoreRef.current.add(restoreKey);
        const restoreLegacyStatuses = async () => {
            try {
                for (let offset = 0; offset < targets.length; offset += 200) {
                    const batch = writeBatch(db);
                    targets.slice(offset, offset + 200).forEach(row => {
                        const savedAt = new Date().toISOString();
                        const status = String(row[sourceColumn.status] || '').trim();
                        const projectKey = projectRowKey(row);
                        batch.set(doc(db, 'artifacts', appId, 'public', 'data', `monthlyReportStatuses_${currentTeam}`, monthlyStatusDocId(row, currentStatusPeriodKey)), {
                            team: currentTeam, periodKey: currentStatusPeriodKey, projectKey, status,
                            createdAt: savedAt, updatedAt: savedAt,
                        }, { merge: true });
                        batch.set(rowDocRef(currentTeam, row._id), {
                            [sourceColumn.status]: '진행중',
                            _updatedAt: savedAt,
                            _updatedBy: '월간보고 복구',
                        }, { merge: true });
                    });
                    await batch.commit();
                }
                const successMessage = `List ${targets.length}건 복구 완료`;
                setEstimateMessage(successMessage);
                window.setTimeout(() => setEstimateMessage(current => current === successMessage ? '' : current), 2500);
            } catch (error) {
                legacyStatusRestoreRef.current.delete(restoreKey);
                setEstimateMessage('List 복구 실패');
            }
        };
        restoreLegacyStatuses();
    }, [currentStatusPeriodKey, currentTeam, loaded, rows, sourceColumn]);

    const saveAllMonthlyChanges = useCallback(async () => {
        if (estimateBatchSaving) return;
        const pendingEstimates = Object.entries(estimateDrafts).map(([projectKey, value]) => ({
            type: 'estimate',
            projectKey,
            estimateNo: String(value || '').trim(),
            row: rows.find(item => projectRowKey(item) === projectKey),
        })).filter(item => item.row);
        const pendingStatuses = Object.entries(statusDrafts).map(([projectKey, status]) => ({
            type: 'status', projectKey, status,
            row: rows.find(item => projectRowKey(item) === projectKey),
        })).filter(item => item.row?._id && sourceColumn.status);
        const pending = [...pendingEstimates, ...pendingStatuses];
        if (!pending.length) return;
        setEstimateBatchSaving(true);
        setEstimateMessage('');
        try {
            for (let offset = 0; offset < pending.length; offset += 400) {
                const batch = writeBatch(db);
                pending.slice(offset, offset + 400).forEach(item => {
                    const savedAt = new Date().toISOString();
                    if (item.type === 'estimate') {
                        const previous = estimateEntryForRow(item.row);
                        batch.set(doc(db, 'artifacts', appId, 'public', 'data', `monthlyReportEstimates_${currentTeam}`, monthlyEstimateDocId(item.row)), {
                            team: currentTeam,
                            projectKey: item.projectKey,
                            execNo: String(item.row[sourceColumn.exec] || '').trim(),
                            projectName: String(item.row[sourceColumn.project] || '').trim(),
                            estimateNo: item.estimateNo,
                            createdAt: previous?.createdAt || savedAt,
                            updatedAt: savedAt,
                        }, { merge: true });
                    } else {
                        batch.set(doc(db, 'artifacts', appId, 'public', 'data', `monthlyReportStatuses_${currentTeam}`, monthlyStatusDocId(item.row, currentStatusPeriodKey)), {
                            team: currentTeam,
                            periodKey: currentStatusPeriodKey,
                            projectKey: item.projectKey,
                            status: item.status,
                            createdAt: savedAt,
                            updatedAt: savedAt,
                        }, { merge: true });
                    }
                });
                await batch.commit();
            }
            setEstimateDrafts(current => {
                const next = { ...current };
                pendingEstimates.forEach(({ projectKey, estimateNo }) => {
                    if (String(next[projectKey] || '').trim() === estimateNo) delete next[projectKey];
                });
                return next;
            });
            setStatusDrafts(current => {
                const next = { ...current };
                pendingStatuses.forEach(({ projectKey, status }) => {
                    if (next[projectKey] === status) delete next[projectKey];
                });
                return next;
            });
            const successMessage = `${pending.length}건 저장 완료`;
            setEstimateMessage(successMessage);
            window.setTimeout(() => setEstimateMessage(current => current === successMessage ? '' : current), 2000);
        } catch (error) {
            setEstimateMessage('저장 실패');
        } finally {
            setEstimateBatchSaving(false);
        }
    }, [currentStatusPeriodKey, currentTeam, estimateBatchSaving, estimateDrafts, estimateEntryForRow, rows, sourceColumn, statusDrafts]);

    const monthlyCompletedKeys = useMemo(() => {
        const keys = { ids: new Set(), pids: new Set(), execs: new Set(), names: new Set() };
        auditEntries.forEach(entry => {
            const entryDate = localDateKey(entry.ts);
            const isInPeriod = hasReportPeriod
                ? entryDate >= previousReportDate && entryDate < currentReportDate
                : String(entry.ts || '').slice(0, 7) === previousMonthKey;
            if (!isInPeriod) return;
            const changedToComplete = (entry.changes || []).some(change => (
                [norm('진행 현황'), norm('진행현황'), norm('작업')].includes(norm(change.field)) && String(change.to || '').trim() === '완료'
            ));
            if (!changedToComplete) return;
            if (entry.projectId) keys.ids.add(String(entry.projectId));
            if (entry.pid) keys.pids.add(String(entry.pid));
            if (entry.execNo) keys.execs.add(String(entry.execNo).trim());
            if (entry.projectName) keys.names.add(norm(entry.projectName));
        });
        return keys;
    }, [auditEntries, currentReportDate, hasReportPeriod, previousMonthKey, previousReportDate]);

    const isMonthlyCompletedRow = useCallback((row) => {
        if (String(row[sourceColumn.status] || '').trim() !== '완료') return false;
        const rowId = String(row._id || row.id || '');
        const rowPid = String(row._pid || row.pid || '');
        const rowExec = String(row['실행번호'] || row.execNo || '').trim();
        const rowName = norm(row[sourceColumn.project]);
        return (rowId && monthlyCompletedKeys.ids.has(rowId))
            || (rowPid && monthlyCompletedKeys.pids.has(rowPid))
            || (rowExec && monthlyCompletedKeys.execs.has(rowExec))
            || (rowName && monthlyCompletedKeys.names.has(rowName));
    }, [monthlyCompletedKeys, sourceColumn]);

    const pointsForPeriod = useCallback((row, period) => {
        const recordKey = row._pid || row.pid || row['실행번호'] || row.execNo || String(row._id || row.id || '');
        const record = recordKey ? progressRecordsMap[recordKey] : null;
        if (!record || record._migratedTo || !record.weekly) return '';
        const keys = Object.keys(record.weekly);
        const hasSubKeys = keys.some(key => /^sub_\d+_(commissioning|intCommissioning)$/.test(key));
        const pointName = currentTeam === '기술1팀' ? 'commissioning' : 'intCommissioning';
        const pointKeys = hasSubKeys
            ? keys.filter(key => new RegExp(`^sub_\\d+_${pointName}$`).test(key))
            : keys.filter(key => key === pointName);
        let total = 0;
        let hasValue = false;
        pointKeys.forEach(key => Object.entries(record.weekly[key] || {}).forEach(([weekKey, value]) => {
            const parts = String(weekKey).split('-');
            const keyMonth = parts.length >= 2 ? `${parts[0]}-${String(Number(parts[1])).padStart(2, '0')}` : '';
            let included = keyMonth === period?.monthKey;
            if (period?.start && period?.endExclusive && parts.length >= 3) {
                const year = Number(parts[0]);
                const month = Number(parts[1]);
                const week = Number(parts[2]);
                const bucketStart = localDateKey(new Date(year, month - 1, (week - 1) * 7 + 1));
                const lastDay = new Date(year, month, 0).getDate();
                const bucketEndExclusive = localDateKey(new Date(year, month - 1, Math.min(week * 7, lastDay) + 1));
                included = bucketStart < period.endExclusive && bucketEndExclusive > period.start;
            }
            if (!included || value === '' || value === null || value === undefined) return;
            total += Number(value) || 0;
            hasValue = true;
        }));
        return hasValue ? Math.round(total) : '';
    }, [currentTeam, progressRecordsMap]);

    const progressRateForMonth = useCallback((row, sourceRow, monthKey) => {
        if (isSoftware || !/^\d{4}-\d{2}$/.test(String(monthKey || ''))) return null;
        const recordKey = row._pid || row.pid || row['실행번호'] || row.execNo || String(row._id || row.id || '');
        const record = recordKey ? progressRecordsMap[recordKey] : null;
        const weekly = record && !record._migratedTo ? (record.weekly || {}) : {};
        const headersForRow = [...new Set([...Object.keys(row || {}), ...Object.keys(sourceRow || {})])].filter(key => !key.startsWith('_'));
        const headerOf = (names) => headersForRow.find(header => names.some(name => norm(header) === norm(name))) || '';
        const aliases = {
            plc: ['PLC'],
            etos: ['ETOS T/S', 'ETOS'],
            hmi: ['HMI'],
        };
        const offItems = (Array.isArray(row._naItems) ? row._naItems : []).map(norm);
        const onItems = (Array.isArray(row._naOn) ? row._naOn : []).map(norm);
        const itemMentioned = (list, names) => list.some(item => names.some(name => item === norm(name)));
        const weekMonth = (weekKey) => {
            const parts = String(weekKey || '').split('-');
            return parts.length >= 2 ? `${parts[0]}-${String(Number(parts[1])).padStart(2, '0')}` : '';
        };
        const latestPercent = (key, fallback) => {
            let latestOrder = -1;
            let latestValue = null;
            Object.entries(weekly[key] || {}).forEach(([weekKey, value]) => {
                const parts = String(weekKey).split('-').map(Number);
                const itemMonth = weekMonth(weekKey);
                if (!itemMonth || itemMonth > monthKey || value === '' || value === null || value === undefined) return;
                const order = (parts[0] || 0) * 1000 + (parts[1] || 0) * 10 + (parts[2] || 0);
                if (order >= latestOrder) {
                    latestOrder = order;
                    latestValue = numberOf(value);
                }
            });
            const fallbackValue = numberOf(fallback);
            return latestValue === null ? (fallbackValue ?? 0) : Math.max(0, Math.min(100, latestValue));
        };
        const selectedProgress = [];
        Object.entries(aliases).forEach(([key, names]) => {
            const header = headerOf(names);
            if (!header || itemMentioned(offItems, [...names, header])) return;
            const hasLedgerValue = Object.values(weekly[key] || {}).some(value => value !== '' && value !== null && value !== undefined);
            const explicitlyOn = itemMentioned(onItems, [...names, header]);
            const applicabilityValue = row?.[header];
            const fallbackValue = sourceRow?.[header];
            if (!explicitlyOn && !hasLedgerValue && String(applicabilityValue ?? '').trim() === '') return;
            selectedProgress.push(latestPercent(key, fallbackValue));
        });

        const commissioningKey = currentTeam === '기술1팀' ? 'commissioning' : 'intCommissioning';
        const commissioningNames = currentTeam === '기술1팀'
            ? ['자체 시운전', '자체시운전']
            : ['통합 시운전', '통합시운전', '진행율 %', '진행율(%)'];
        const commissioningOff = itemMentioned(offItems, commissioningNames);
        if (!commissioningOff) {
            const hasSubKeys = Object.keys(weekly).some(key => new RegExp(`^sub_\\d+_${commissioningKey}$`).test(key));
            const pointKeys = hasSubKeys
                ? Object.keys(weekly).filter(key => new RegExp(`^sub_\\d+_${commissioningKey}$`).test(key))
                : [commissioningKey];
            let accumulatedPoints = 0;
            let hasPointRecord = false;
            pointKeys.forEach(key => Object.entries(weekly[key] || {}).forEach(([weekKey, value]) => {
                const itemMonth = weekMonth(weekKey);
                if (itemMonth && itemMonth <= monthKey && value !== '' && value !== null && value !== undefined) {
                    accumulatedPoints += numberOf(value) || 0;
                    hasPointRecord = true;
                }
            }));
            const parentKey = String(row._id || projectRowKey(row));
            const totalPoints = subPointByParent[parentKey]?.sum || numberOf(row[sourceColumn.totalPoint]) || 0;
            const commissioningHeader = headerOf(commissioningNames);
            const fallbackCommissioningRate = numberOf(sourceRow?.[commissioningHeader]);
            const commissioningRate = hasPointRecord && totalPoints > 0
                ? Math.max(0, Math.min(100, accumulatedPoints / totalPoints * 100))
                : (fallbackCommissioningRate ?? 0);
            selectedProgress.push(commissioningRate);
        }
        if (!selectedProgress.length) return null;
        return Math.round((selectedProgress.reduce((sum, value) => sum + value, 0) / selectedProgress.length) * 10) / 10;
    }, [currentTeam, isSoftware, progressRecordsMap, sourceColumn, subPointByParent]);

    const valueForColumn = useCallback((row, column) => {
        if (column.key === 'estimate') return estimateValueForRow(row);
        if (column.key === 'status') return statusValueForRow(row);
        if (column.key === 'pointPrev') {
            if (hasReportPeriod) return reportInteger(pointsForPeriod(row, previousReportPeriod));
            if (currentTeam === '기술1팀') return reportInteger(row['전월'] ?? '');
            return reportInteger(pointsForPeriod(row, { monthKey: previousMonthKey }));
        }
        if (column.key === 'pointCurr') {
            if (hasReportPeriod) return reportInteger(pointsForPeriod(row, currentReportPeriod));
            if (currentTeam === '기술1팀') return reportInteger(row['금월'] ?? '');
            return reportInteger(pointsForPeriod(row, { monthKey: currentMonthKey }));
        }
        const sourceRow = column.period === 'prev'
            ? previousMonthSnapshot?.rows?.[row._pid || row.pid || row._id]
            : row;
        if (column.key === 'ratePrev' || column.key === 'rateCurr') {
            const periodEnd = column.key === 'ratePrev' ? previousReportDate : currentReportDate;
            const monthKey = hasReportPeriod && periodEnd
                ? moveDate(periodEnd, -1).slice(0, 7)
                : column.key === 'ratePrev' ? previousMonthKey : currentMonthKey;
            const calculatedRate = progressRateForMonth(row, sourceRow || (column.key === 'rateCurr' ? row : null), monthKey);
            if (calculatedRate !== null) return reportOneDecimal(calculatedRate);
        }
        const value = sourceRow?.[sourceColumn[column.key]] ?? '';
        if (column.key === 'totalPoint') {
            const parentKey = String(row._id || projectRowKey(row));
            const subPoint = subPointByParent[parentKey];
            return reportInteger(subPoint?.sum > 0 ? subPoint.sum : withoutSigma(value));
        }
        if (['ratePrev', 'rateCurr'].includes(column.key)) return reportOneDecimal(value);
        if (['pointAcc', 'rate'].includes(column.key)) return reportInteger(value);
        if (['date', 'start', 'end'].includes(column.key)) return formatReportDate(value, reportYear);
        return value;
    }, [currentMonthKey, currentReportDate, currentReportPeriod, currentTeam, estimateValueForRow, hasReportPeriod, pointsForPeriod, previousMonthKey, previousMonthSnapshot, previousReportDate, previousReportPeriod, progressRateForMonth, reportYear, sourceColumn, statusValueForRow, subPointByParent]);

    const yearRows = useMemo(() => (
        rows.filter(row => !isSubRow(row) && String(row._year || reportYear) === reportYear)
    ), [rows, reportYear]);
    const hiddenProjectKeySet = useMemo(() => new Set(hiddenProjectKeys), [hiddenProjectKeys]);
    const visibleYearRows = useMemo(() => yearRows.filter(row => !hiddenProjectKeySet.has(projectRowKey(row))), [hiddenProjectKeySet, yearRows]);
    const hiddenProjectRows = useMemo(() => {
        const found = new Map();
        rows.filter(row => !isSubRow(row)).forEach(row => {
            const key = projectRowKey(row);
            if (key && hiddenProjectKeySet.has(key) && !found.has(key)) found.set(key, row);
        });
        return [...found.entries()].map(([key, row]) => ({ key, row }));
    }, [hiddenProjectKeySet, rows]);

    const statusCounts = useMemo(() => {
        const statusCol = sourceColumn.status;
        if (isSoftware) {
            return {
                '금월완료': visibleYearRows.filter(isMonthlyCompletedRow).length,
                '수정중': visibleYearRows.filter(row => reportStatus(row[statusCol]) === '수정중').length,
                '개발중': visibleYearRows.filter(row => reportStatus(row[statusCol]) === '개발중').length,
            };
        }
        return {
            '금월완료': visibleYearRows.filter(isMonthlyCompletedRow).length,
            '진행중': visibleYearRows.filter(row => reportStatus(row[statusCol]) === '진행중').length,
            '신규': visibleYearRows.filter(row => reportStatus(row[statusCol]) === '신규').length,
            '미작업': visibleYearRows.filter(row => reportStatus(row[statusCol]) === '미작업').length,
            '예상': visibleYearRows.filter(isExpectedRow).length,
        };
    }, [visibleYearRows, sourceColumn, isMonthlyCompletedRow, isExpectedRow, isSoftware]);

    const displayRows = useMemo(() => {
        const mainRows = visibleYearRows.filter(row => {
            const status = reportStatus(row[sourceColumn.status]);
            return (selectedStatuses.includes('금월완료') && isMonthlyCompletedRow(row))
                || (selectedStatuses.includes('예상') && isExpectedRow(row))
                || selectedStatuses.includes(status);
        });
        const q = norm(query);
        const filteredRows = q
            ? mainRows.filter(row => activeColumns.some(column => norm(valueForColumn(row, column)).includes(q)))
            : mainRows;
        if (execSortDirection) {
            const execColumn = activeColumns.find(column => column.key === 'exec');
            const compareNumber = (a, b) => String(a[sourceColumn.no] ?? '').localeCompare(
                String(b[sourceColumn.no] ?? ''), 'ko', { numeric: true, sensitivity: 'base' }
            );
            return [...filteredRows].sort((a, b) => {
                if (execSortDirection === 'number') return compareNumber(a, b);
                const aExec = String(execColumn ? valueForColumn(a, execColumn) : '').trim();
                const bExec = String(execColumn ? valueForColumn(b, execColumn) : '').trim();
                if (execSortDirection === 'asc' && Boolean(aExec) !== Boolean(bExec)) return aExec ? -1 : 1;
                const comparison = aExec.localeCompare(
                    bExec,
                    'ko',
                    { numeric: true, sensitivity: 'base' }
                );
                return (execSortDirection === 'asc' ? comparison : -comparison) || compareNumber(a, b);
            });
        }
        if (!statusSortMode) return filteredRows;
        const compareNumber = (a, b) => String(a[sourceColumn.no] ?? '').localeCompare(
            String(b[sourceColumn.no] ?? ''), 'ko', { numeric: true, sensitivity: 'base' }
        );
        return [...filteredRows].sort((a, b) => {
            if (statusSortMode === 'number') return compareNumber(a, b);
            const aStatus = statusValueForRow(a);
            const bStatus = statusValueForRow(b);
            const statusOrder = (row, status) => {
                if (isMonthlyCompletedRow(row) || status === '완료') return 0;
                if (status === '진행중') return 1;
                if (status === '신규') return 2;
                if (status === '미작업') return 3;
                if (isExpectedRow(row) || ['예정', '예상', '추진중'].includes(status)) return 4;
                const fallback = MONTHLY_STATUS_SORT_ORDER.indexOf(status);
                return fallback < 0 ? 999 : fallback;
            };
            const aOrder = statusOrder(a, aStatus);
            const bOrder = statusOrder(b, bStatus);
            const statusCompare = (aOrder < 0 ? 999 : aOrder) - (bOrder < 0 ? 999 : bOrder)
                || String(aStatus).localeCompare(String(bStatus), 'ko');
            return statusCompare || compareNumber(a, b);
        });
    }, [activeColumns, visibleYearRows, selectedStatuses, query, sourceColumn, execSortDirection, statusSortMode, statusValueForRow, valueForColumn, isExpectedRow, isMonthlyCompletedRow]);

    const summary = useMemo(() => {
        if (isSoftware) {
            const rates = displayRows.map(row => numberOf(row[sourceColumn.rate])).filter(value => value !== null);
            return {
                projectCount: displayRows.length,
                averageRate: rates.length ? Math.round(rates.reduce((sum, value) => sum + value, 0) / rates.length) : null,
                completedCount: displayRows.filter(row => String(row[sourceColumn.status] || '').trim() === '완료').length,
            };
        }
        const totalPoints = displayRows.reduce((sum, row) => sum + (numberOf(row[sourceColumn.totalPoint]) || 0), 0);
        const performedPoints = displayRows.reduce((sum, row) => sum + (numberOf(row[sourceColumn.pointAcc]) || 0), 0);
        const rateColumn = activeColumns.find(column => column.key === 'rateCurr');
        const rates = rateColumn
            ? displayRows.map(row => numberOf(valueForColumn(row, rateColumn))).filter(value => value !== null)
            : [];
        return {
            totalPoints: Math.round(totalPoints),
            performedPoints: Math.round(performedPoints),
            averageRate: rates.length ? Math.round(rates.reduce((sum, value) => sum + value, 0) / rates.length) : null,
        };
    }, [activeColumns, displayRows, isSoftware, sourceColumn, valueForColumn]);

    const handleDownload = async () => {
        try {
            const XLSX = await loadXLSX();
            const statusOrder = isSoftware ? { '수정중': 0, '개발중': 1 } : { '진행중': 0 };
            const technicalExportOrder = { '진행중': 1, '신규': 2, '미작업': 3 };
            const compareExportNumber = (a, b) => {
                const aNumber = String(a.row[sourceColumn.no] ?? '').trim();
                const bNumber = String(b.row[sourceColumn.no] ?? '').trim();
                if (Boolean(aNumber) !== Boolean(bNumber)) return aNumber ? -1 : 1;
                return aNumber.localeCompare(bNumber, 'ko', { numeric: true, sensitivity: 'base' }) || a.index - b.index;
            };
            const exportRows = yearRows
                .filter(row => !hiddenProjectKeySet.has(projectRowKey(row)))
                .map((row, index) => ({ row, index, status: reportStatus(row[sourceColumn.status]), effectiveStatus: statusValueForRow(row) }))
                .filter(item => isSoftware
                    ? Object.prototype.hasOwnProperty.call(statusOrder, item.status) || isMonthlyCompletedRow(item.row)
                    : isMonthlyCompletedRow(item.row) || isExpectedRow(item.row) || Object.prototype.hasOwnProperty.call(technicalExportOrder, item.effectiveStatus))
                .sort((a, b) => {
                    if (isSoftware) {
                        const aOrder = isMonthlyCompletedRow(a.row) ? 2 : statusOrder[a.status];
                        const bOrder = isMonthlyCompletedRow(b.row) ? 2 : statusOrder[b.status];
                        return aOrder - bOrder || compareExportNumber(a, b);
                    }
                    const aOrder = isMonthlyCompletedRow(a.row) ? 0 : isExpectedRow(a.row) ? 4 : technicalExportOrder[a.effectiveStatus];
                    const bOrder = isMonthlyCompletedRow(b.row) ? 0 : isExpectedRow(b.row) ? 4 : technicalExportOrder[b.effectiveStatus];
                    return aOrder - bOrder || compareExportNumber(a, b);
                })
                .map(item => item.row);

            if (!exportRows.length) {
                window.alert(isSoftware ? '엑셀로 만들 수정중·개발중·금월완료 프로젝트가 없습니다.' : '엑셀로 만들 완료·진행중·신규·미작업·예상 프로젝트가 없습니다.');
                return;
            }

            const aoa = isSoftware ? [SOFTWARE_COLUMNS.map(column => column.label)] : [
                ['번호', '수행번호', '견적번호', '공장', '진행현황', 'Project', '전체포인트', '시운전', '', '', '진행율(%)', '', '날짜', '내용'],
                ['', '', '', '', '', '', '', '전월', '금월', '누적', '전월', '금월', '', ''],
            ];
            exportRows.forEach(row => {
                aoa.push(activeColumns.map(column => {
                    const value = valueForColumn(row, column);
                    if (['ratePrev', 'rateCurr'].includes(column.key)) {
                        const numeric = numberOf(value);
                        return numeric === null ? '' : Math.round(numeric * 10) / 10;
                    }
                    if (['totalPoint', 'pointPrev', 'pointCurr', 'pointAcc', 'rate'].includes(column.key)) {
                        const numeric = numberOf(value);
                        return numeric === null ? '' : Math.round(numeric);
                    }
                    if (['date', 'start', 'end'].includes(column.key)) return parseReportDate(value, reportYear) || value;
                    return value;
                }));
            });

            const worksheet = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
            worksheet['!merges'] = isSoftware ? [] : [
                { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } },
                { s: { r: 0, c: 1 }, e: { r: 1, c: 1 } },
                { s: { r: 0, c: 2 }, e: { r: 1, c: 2 } },
                { s: { r: 0, c: 3 }, e: { r: 1, c: 3 } },
                { s: { r: 0, c: 4 }, e: { r: 1, c: 4 } },
                { s: { r: 0, c: 5 }, e: { r: 1, c: 5 } },
                { s: { r: 0, c: 6 }, e: { r: 1, c: 6 } },
                { s: { r: 0, c: 7 }, e: { r: 0, c: 9 } },
                { s: { r: 0, c: 10 }, e: { r: 0, c: 11 } },
                { s: { r: 0, c: 12 }, e: { r: 1, c: 12 } },
                { s: { r: 0, c: 13 }, e: { r: 1, c: 13 } },
            ];
            worksheet['!cols'] = activeColumns.map(column => ({ wch: Math.max(8, Math.round(widthOf(column) / 7)) }));
            worksheet['!rows'] = isSoftware ? [{ hpt: 24 }] : [{ hpt: 22 }, { hpt: 22 }];
            for (let rowIndex = isSoftware ? 1 : 2; rowIndex < aoa.length; rowIndex += 1) {
                if (isSoftware) {
                    if (worksheet[`F${rowIndex + 1}`]) worksheet[`F${rowIndex + 1}`].z = '0';
                    ['G', 'H'].forEach(col => { if (worksheet[`${col}${rowIndex + 1}`]) worksheet[`${col}${rowIndex + 1}`].z = 'm/d'; });
                } else {
                    ['G', 'H', 'I', 'J'].forEach(col => { if (worksheet[`${col}${rowIndex + 1}`]) worksheet[`${col}${rowIndex + 1}`].z = '#,##0'; });
                    ['K', 'L'].forEach(col => { if (worksheet[`${col}${rowIndex + 1}`]) worksheet[`${col}${rowIndex + 1}`].z = '0.0'; });
                    if (worksheet[`M${rowIndex + 1}`]) worksheet[`M${rowIndex + 1}`].z = 'm/d';
                }
            }

            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, '월간보고');
            const now = new Date();
            const stamp = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
            XLSX.writeFile(workbook, `월간보고_${currentTeam}_${stamp}.xlsx`);
        } catch (error) {
            window.alert('엑셀 생성 실패: ' + error.message);
        }
    };

    const toggleExecSort = () => {
        setExecSortDirection(previous => previous === 'asc' ? 'desc' : previous === 'desc' ? 'number' : 'asc');
        setStatusSortMode(null);
    };
    const execSortLabel = execSortDirection === 'asc'
        ? '오름차순 ▲'
        : execSortDirection === 'desc' ? '내림차순 ▼' : execSortDirection === 'number' ? '번호순' : '';
    const nextExecSortLabel = execSortDirection === 'asc'
        ? '수행번호 내림차순'
        : execSortDirection === 'desc' ? '번호순' : '수행번호 오름차순';
    const toggleStatusSort = () => {
        const next = statusSortMode === 'status' ? 'number' : 'status';
        setStatusSortMode(next);
        if (next === 'status' && !isSoftware) setSelectedStatuses(TECHNICAL_MONTHLY_STATUS_OPTIONS);
        setExecSortDirection(null);
    };
    const changeStatusSortMode = (mode) => {
        setStatusSortMode(mode);
        setExecSortDirection(null);
        if (mode === 'status' && !isSoftware) setSelectedStatuses(TECHNICAL_MONTHLY_STATUS_OPTIONS);
    };

    const statusCell = (value, selected = false) => {
        const text = reportStatus(value);
        if (!text) return '';
        const style = STATUS_STYLE[text] || { color: '#475569', background: '#f8fafc', borderColor: '#cbd5e1' };
        return <span style={{ ...style, color: selected ? '#0f5a99' : style.color, display: 'inline-block', borderWidth: 1, borderStyle: 'solid', borderRadius: 999, padding: '2px 8px', fontSize: selected ? Math.max(16, tableFontSize) : Math.max(10, tableFontSize - 1), fontWeight: selected ? 900 : 800 }}>{text}</span>;
    };

    const memoPeriodOptions = (() => {
        const options = new Map(reportPeriodOptions.map(option => [option.endDate, option]));
        Object.values(memoNotes).forEach(note => {
            if (!note?.reportDate || options.has(note.reportDate)) return;
            options.set(note.reportDate, {
                endDate: note.reportDate,
                reportDate: note.reportDate,
                startDate: note.startDate || '',
                periodEndDate: note.periodEndDate || moveDate(note.reportDate, -1),
            });
        });
        return [...options.values()].sort((a, b) => String(b.endDate).localeCompare(String(a.endDate)));
    })();
    const setMemoDraftForPeriod = (periodDate) => {
        const saved = memoNotes[periodDate] || {};
        setMemoPeriodDate(periodDate);
        setMemoText(String(saved.text || ''));
        setMemoFontSize(MEMO_FONT_SIZE_OPTIONS.includes(Number(saved.fontSize)) ? Number(saved.fontSize) : 14);
        setMemoColor(String(saved.color || '#37352f'));
        setMemoBaseColor(String(saved.color || '#37352f'));
        if (memoEditorRef.current) {
            if (saved.html) memoEditorRef.current.innerHTML = String(saved.html);
            else memoEditorRef.current.textContent = String(saved.text || '');
        }
        memoSelectionRef.current = null;
        setMemoDirty(false);
        setMemoMessage(saved.updatedAt ? `저장됨 · ${new Date(saved.updatedAt).toLocaleString('ko-KR')}` : '새 메모');
    };
    const openMemo = () => {
        const target = currentReportDate || memoPeriodOptions[0]?.endDate || '';
        if (target) setMemoDraftForPeriod(target);
        setMemoOpen(true);
    };
    const saveMemo = async () => {
        if (!memoPeriodDate || memoSaving) return;
        const option = memoPeriodOptions.find(item => item.endDate === memoPeriodDate) || {};
        const previous = memoNotes[memoPeriodDate] || {};
        const savedAt = new Date().toISOString();
        setMemoSaving(true);
        setMemoMessage('저장 중...');
        try {
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', `monthlyReportNotes_${currentTeam}`, memoPeriodDate), {
                team: currentTeam,
                reportDate: memoPeriodDate,
                startDate: option.startDate || previous.startDate || '',
                periodEndDate: option.periodEndDate || previous.periodEndDate || moveDate(memoPeriodDate, -1),
                text: (memoEditorRef.current?.innerText ?? memoText).replace(/\u200B/g, ''),
                html: (memoEditorRef.current?.innerHTML || '').replace(/\u200B/g, ''),
                fontSize: memoFontSize,
                color: memoBaseColor,
                createdAt: previous.createdAt || savedAt,
                updatedAt: savedAt,
            }, { merge: true });
            setMemoDirty(false);
            setMemoMessage(`저장 완료 · ${new Date(savedAt).toLocaleString('ko-KR')}`);
        } catch (error) {
            setMemoMessage('저장하지 못했습니다. 잠시 후 다시 시도해 주세요.');
        } finally {
            setMemoSaving(false);
        }
    };
    const rememberMemoSelection = () => {
        const selection = window.getSelection?.();
        const editor = memoEditorRef.current;
        if (!selection || !editor || selection.rangeCount === 0) return;
        const range = selection.getRangeAt(0);
        if (editor.contains(range.commonAncestorContainer)) memoSelectionRef.current = range.cloneRange();
    };
    const applyMemoColor = (color) => {
        const editor = memoEditorRef.current;
        if (!editor || !memoPeriodDate) return;
        setMemoColor(color);
        let range = memoSelectionRef.current?.cloneRange();
        editor.focus();
        const selection = window.getSelection?.();
        if (!selection) return;
        if (!range || !editor.contains(range.commonAncestorContainer)) {
            range = document.createRange();
            range.selectNodeContents(editor);
            range.collapse(false);
        }
        selection.removeAllRanges();
        selection.addRange(range);
        if (range.collapsed) {
            const colorSpan = document.createElement('span');
            colorSpan.style.setProperty('color', color, 'important');
            colorSpan.setAttribute('data-memo-color', color);
            const marker = document.createTextNode('\u200B');
            colorSpan.appendChild(marker);
            range.insertNode(colorSpan);
            range.setStart(marker, marker.nodeValue.length);
            range.collapse(true);
        } else {
            const colorSpan = document.createElement('span');
            colorSpan.style.setProperty('color', color, 'important');
            colorSpan.setAttribute('data-memo-color', color);
            colorSpan.appendChild(range.extractContents());
            colorSpan.querySelectorAll('*').forEach(element => {
                element.removeAttribute('color');
                element.style?.setProperty('color', color, 'important');
            });
            range.insertNode(colorSpan);
            range.selectNodeContents(colorSpan);
        }
        selection.removeAllRanges();
        selection.addRange(range);
        memoSelectionRef.current = range.cloneRange();
        rememberMemoSelection();
        setMemoText((editor.innerText || '').replace(/\u200B/g, ''));
        setMemoDirty(true);
        setMemoMessage('저장하지 않은 변경사항');
    };
    const handleMemoInput = () => {
        setMemoText((memoEditorRef.current?.innerText || '').replace(/\u200B/g, ''));
        rememberMemoSelection();
        setMemoDirty(true);
        setMemoMessage('저장하지 않은 변경사항');
    };
    const handleMemoPaste = (event) => {
        event.preventDefault();
        document.execCommand('insertText', false, event.clipboardData.getData('text/plain'));
    };
    const startMemoDrag = (event) => {
        if (event.button !== 0 || event.target.closest('button, select, input')) return;
        const panel = event.currentTarget.parentElement;
        const rect = panel.getBoundingClientRect();
        const offsetX = event.clientX - rect.left;
        const offsetY = event.clientY - rect.top;
        const onMove = moveEvent => setMemoPosition({
            x: Math.max(8, Math.min(window.innerWidth - rect.width - 8, moveEvent.clientX - offsetX)),
            y: Math.max(8, Math.min(window.innerHeight - rect.height - 8, moveEvent.clientY - offsetY)),
        });
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    };

    const btnStyle = { display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 700, background: '#fff', border: '1px solid #d8d4cf', borderRadius: 8, padding: '7px 12px', cursor: 'pointer', color: '#37352f' };
    const th = { position: 'relative', padding: '7px 8px', fontSize: Math.max(10, tableFontSize - 1), fontWeight: 800, color: '#4b6076', background: '#f3f6fa', borderRight: '1px solid #dce3eb', borderBottom: '1px solid #cfd8e3', textAlign: 'center', whiteSpace: 'nowrap' };
    const statusOptions = isSoftware ? ['금월완료', '수정중', '개발중'] : TECHNICAL_MONTHLY_STATUS_OPTIONS;
    const pendingSaveCount = Object.keys(estimateDrafts).length + Object.keys(statusDrafts).length;
    const summaryItems = isSoftware ? [
        { label: '선택 프로젝트', value: `${summary.projectCount}건`, color: '#38516b', background: '#eef3f8', border: '#d6e0ea' },
        { label: '완료 프로젝트', value: `${summary.completedCount}건`, color: '#b91c1c', background: '#fff1f2', border: '#fecdd3' },
        { label: '평균 공정률', value: summary.averageRate === null ? '—' : `${summary.averageRate}%`, color: '#1e7ac8', background: '#eff6ff', border: '#bfdbfe' },
    ] : [
        { label: '총 포인트', value: summary.totalPoints.toLocaleString(), color: '#38516b', background: '#eef3f8', border: '#d6e0ea' },
        { label: '수행 Point', value: summary.performedPoints.toLocaleString(), color: '#047857', background: '#ecfdf5', border: '#a7f3d0' },
        { label: '평균 진행율', value: summary.averageRate === null ? '—' : `${summary.averageRate}%`, color: '#1e7ac8', background: '#eff6ff', border: '#bfdbfe' },
    ];

    return (
        <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#f4f3f1', fontFamily: "'Pretendard Variable', Pretendard, 'Malgun Gothic', system-ui, sans-serif", padding: '12px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8, flexShrink: 0 }}>
                <button onClick={onBack} title="홈 — 팀 선택 화면으로" style={{ ...btnStyle, padding: '7px 9px' }}><Home size={14}/></button>
                <div style={{ padding: 8, background: '#1e7ac8', borderRadius: 10, color: '#fff', display: 'flex' }}><FileText size={17}/></div>
                <div style={{ minWidth: 270, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <h1 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#37352f', whiteSpace: 'nowrap' }}>{displayTeamName(currentTeam)} 월간보고</h1>
                    {reportPeriodOptions.length > 0 ? (
                        <select aria-label="월간보고 기간 선택" value={currentReportDate} onChange={event => setSelectedReportDate(event.target.value)}
                            style={{ height: 30, minWidth: 235, padding: '0 28px 0 9px', border: '1px solid #cbd5e1', borderRadius: 7, background: '#fff', color: '#475569', fontSize: 14, fontWeight: 800, cursor: 'pointer', outline: 'none' }}>
                            {reportPeriodOptions.map(option => (
                                <option key={option.endDate} value={option.endDate}>
                                    {displayDateKey(option.startDate)} ~ {displayDateKey(option.periodEndDate)}
                                </option>
                            ))}
                        </select>
                    ) : (
                        <div style={{ fontSize: 10.5, fontWeight: 700, color: '#b45309', whiteSpace: 'nowrap' }}>월간보고일을 2개 이상 등록해 주세요</div>
                    )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 8, flexShrink: 0, whiteSpace: 'nowrap' }}>
                    <button type="button" onClick={onGoToList} title="프로젝트 List로 돌아가기" aria-label="프로젝트 List로 돌아가기"
                        style={{ width: 30, height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0, borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', color: '#475569', cursor: 'pointer', flexShrink: 0 }}>
                        <ChevronLeft size={16}/>
                    </button>
                    {!isSoftware && (
                        <label title="보기 순서" style={{ height: 30, display: 'flex', alignItems: 'center', padding: '0 4px', border: '1px solid #bcd6f0', borderRadius: 8, background: '#f5f9fd', whiteSpace: 'nowrap' }}>
                            <select aria-label="월간보고 보기 순서" value={statusSortMode === 'status' ? 'status' : 'number'} onChange={event => changeStatusSortMode(event.target.value)}
                                style={{ width: 88, border: 0, outline: 0, background: 'transparent', color: '#0f5a99', fontSize: 11.5, fontWeight: 900, cursor: 'pointer' }}>
                                <option value="number">번호순</option>
                                <option value="status">공정현황별</option>
                            </select>
                        </label>
                    )}
                    {statusOptions.map(status => {
                        const active = selectedStatuses.includes(status);
                        const color = status === '금월완료' ? '#b91c1c' : ['진행중', '개발중'].includes(status) ? '#047857' : status === '수정중' ? '#1358a0' : '#b45309';
                        const activeBg = status === '금월완료' ? '#dc2626' : ['진행중', '개발중'].includes(status) ? '#047857' : status === '수정중' ? '#1e7ac8' : '#d97706';
                        return (
                            <button key={status} type="button" aria-pressed={active} onClick={() => setSelectedStatuses(previous => previous.includes(status) ? previous.filter(item => item !== status) : [...previous, status])}
                                style={{ height: 30, padding: '0 11px', borderRadius: 8, border: `1px solid ${active ? activeBg : '#d8d4cf'}`, background: active ? activeBg : '#fff', color: active ? '#fff' : color, cursor: 'pointer', fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap', flexShrink: 0 }}>
                                {MONTHLY_STATUS_LABEL[status] || status} <span style={{ marginLeft: 3, opacity: active ? 0.95 : 0.7 }}>{status === '금월완료' && !auditLoaded ? '…' : `${statusCounts[status]}건`}</span>
                            </button>
                        );
                    })}
                    <label style={{ height: 30, display: 'flex', alignItems: 'center', gap: 5, marginLeft: 3, padding: '0 7px 0 9px', border: '1px solid #d8d4cf', borderRadius: 8, background: '#fff', color: '#73716b', fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap' }}>
                        글자 크기
                        <select value={tableFontSize} onChange={event => {
                            const value = Number(event.target.value);
                            setTableFontSize(value);
                            try { localStorage.setItem(FONT_SIZE_KEY, String(value)); } catch (e) {}
                        }} style={{ border: 0, outline: 0, background: 'transparent', color: '#37352f', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
                            {FONT_SIZE_OPTIONS.map(size => <option key={size} value={size}>{size}px</option>)}
                        </select>
                    </label>
                    {summaryItems.map(item => (
                        <span key={item.label} title="현재 화면에 표시된 프로젝트 기준"
                            style={{ height: 30, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0 9px', border: `1px solid ${item.border}`, borderRadius: 8, background: item.background, whiteSpace: 'nowrap' }}>
                            <span style={{ fontSize: 10.5, fontWeight: 800, color: '#73716b' }}>{item.label}</span>
                            <strong style={{ fontSize: 12.5, fontWeight: 900, color: item.color, fontVariantNumeric: 'tabular-nums' }}>{item.value}</strong>
                        </span>
                    ))}
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, whiteSpace: 'nowrap' }}>
                    <div style={{ position: 'relative' }} onClick={event => event.stopPropagation()}>
                        <button type="button" onClick={() => { setHiddenMenuOpen(open => !open); setRowContextMenu(null); setStatusContextMenu(null); }}
                            style={{ ...btnStyle, height: 32, padding: '7px 9px', fontSize: 11, whiteSpace: 'nowrap', flexShrink: 0, color: hiddenProjectRows.length ? '#b45309' : '#64748b', borderColor: hiddenProjectRows.length ? '#f5c980' : '#d8d4cf' }}
                            title="비활성 프로젝트 다시 활성화">
                            <EyeOff size={14}/> 비활성{hiddenProjectRows.length ? ` ${hiddenProjectRows.length}` : ''}<ChevronDown size={12}/>
                        </button>
                        {hiddenMenuOpen && (
                            <div style={{ position: 'absolute', top: 36, left: 0, zIndex: 80, width: 300, maxHeight: 320, overflowY: 'auto', padding: 6, border: '1px solid #cbd5e1', borderRadius: 9, background: '#fff', boxShadow: '0 12px 30px rgba(15,23,42,0.18)' }}>
                                <div style={{ padding: '5px 8px 7px', fontSize: 10.5, fontWeight: 800, color: '#64748b', borderBottom: '1px solid #eef1f5' }}>비활성 프로젝트 · 선택하면 다시 활성화</div>
                                {hiddenProjectRows.length === 0 ? (
                                    <div style={{ padding: '14px 8px', textAlign: 'center', fontSize: 11.5, color: '#94a3b8' }}>비활성 프로젝트가 없습니다.</div>
                                ) : hiddenProjectRows.map(({ key, row }) => (
                                    <button key={key} type="button" onClick={() => restoreProject(key)}
                                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 7, padding: '8px 9px', border: 0, borderBottom: '1px solid #f1f3f5', background: '#fff', color: '#37352f', cursor: 'pointer', textAlign: 'left', fontSize: 12, fontWeight: 700 }}
                                        onMouseEnter={event => { event.currentTarget.style.background = '#f0f7fd'; }}
                                        onMouseLeave={event => { event.currentTarget.style.background = '#fff'; }}>
                                        <Eye size={13} style={{ color: '#1e7ac8', flexShrink: 0 }}/>
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row[sourceColumn.project] || '(프로젝트명 없음)'}</span>
                                    </button>
                                ))}
                                {hiddenProjectRows.length > 1 && (
                                    <button type="button" onClick={restoreAllProjects}
                                        style={{ width: '100%', marginTop: 5, padding: '7px 8px', border: '1px solid #bfdbfe', borderRadius: 6, background: '#eff6ff', color: '#1e7ac8', cursor: 'pointer', fontSize: 11, fontWeight: 800 }}>
                                        모두 활성화
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                    <button type="button" onClick={openMemo}
                        style={{ ...btnStyle, height: 32, padding: '7px 9px', fontSize: 11, whiteSpace: 'nowrap', flexShrink: 0, color: memoOpen ? '#fff' : '#7c3aed', background: memoOpen ? '#7c3aed' : '#fff', borderColor: memoOpen ? '#7c3aed' : '#c4b5fd' }}
                        title="기간별 월간보고 메모 열기">
                        <NotebookPen size={14}/> 메모장
                    </button>
                    <button type="button" onClick={saveAllMonthlyChanges} disabled={estimateBatchSaving || pendingSaveCount === 0}
                        style={{ ...btnStyle, height: 32, padding: '7px 9px', fontSize: 11, whiteSpace: 'nowrap', flexShrink: 0, color: pendingSaveCount ? '#fff' : '#94a3b8', background: pendingSaveCount ? '#047857' : '#f8fafc', borderColor: pendingSaveCount ? '#047857' : '#d8d4cf', cursor: estimateBatchSaving || !pendingSaveCount ? 'default' : 'pointer' }}
                        title={estimateMessage || '수정한 견적번호와 진행현황을 일괄 저장'}>
                        <Save size={14}/>{estimateBatchSaving ? '저장 중' : estimateMessage || '저장'}{!estimateMessage && pendingSaveCount ? ` ${pendingSaveCount}` : ''}
                    </button>
                    <div style={{ position: 'relative' }}>
                        <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#8f8b84' }}/>
                        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="검색" aria-label="월간보고 검색" style={{ width: 112, height: 32, padding: '0 7px 0 27px', border: '1px solid #d8d4cf', borderRadius: 8, background: '#fff', color: '#37352f', outline: 'none', fontSize: 11.5 }}/>
                    </div>
                    <button onClick={handleDownload} style={{ ...btnStyle, color: '#4338ca', borderColor: '#c7d2fe' }} title={isSoftware ? '수정중, 개발중, 금월완료 순서로 엑셀 생성' : '완료, 진행중, 신규, 미작업, 예상 순서로 엑셀 생성'}>
                        <Download size={14}/> 엑셀 생성
                    </button>
                </div>
            </div>

            <div style={{ flex: 1, minHeight: 0, overflow: 'auto', background: '#fff', border: '1px solid #cfd8e3', boxShadow: '0 1px 3px rgba(55,53,47,0.06)' }}>
                <table className="tech2-monthly-table" style={{ width: tableWidth, minWidth: tableWidth, borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed' }}>
                    <colgroup>{activeColumns.map(column => <col key={column.key} style={{ width: widthOf(column) }}/>)}</colgroup>
                    <thead style={{ position: 'sticky', top: 0, zIndex: 20 }}>
                        {isSoftware ? (
                            <tr>{activeColumns.map(column => {
                                const isExecHeader = column.key === 'exec';
                                return <th key={column.key}
                                    onClick={isExecHeader ? toggleExecSort : undefined}
                                    title={isExecHeader ? `클릭: ${nextExecSortLabel} 정렬` : undefined}
                                    style={{ ...th, background: isExecHeader && execSortDirection ? '#e2edf7' : '#f2f8fd', height: 38, cursor: isExecHeader ? 'pointer' : undefined }}>
                                    {column.label}{isExecHeader && execSortDirection && <span style={{ display: 'block', marginTop: 2, color: '#1e7ac8', fontSize: 8.5, fontWeight: 900 }}>{execSortLabel}</span>}{resizeHandle(column)}
                                </th>;
                            })}</tr>
                        ) : (<>
                            <tr>
                                {COLUMNS.slice(0, 6).map(column => {
                                    const isStatusHeader = column.key === 'status';
                                    const isExecHeader = column.key === 'exec';
                                    const isSortableHeader = isStatusHeader || isExecHeader;
                                    const sortActive = (isStatusHeader && statusSortMode) || (isExecHeader && execSortDirection);
                                    const sortTitle = isStatusHeader
                                        ? `클릭: ${statusSortMode === 'number' ? '진행현황별로 모아보기' : '번호순으로 정렬'}`
                                        : isExecHeader ? `클릭: ${nextExecSortLabel} 정렬` : undefined;
                                    return (
                                        <th key={column.key} rowSpan={2}
                                            onClick={isStatusHeader ? toggleStatusSort : isExecHeader ? toggleExecSort : undefined}
                                            title={sortTitle}
                                            style={{ ...th, cursor: isSortableHeader ? 'pointer' : undefined, background: sortActive ? '#e2edf7' : th.background }}>
                                            {column.label}
                                            {isStatusHeader && statusSortMode && <span style={{ display: 'block', marginTop: 2, color: '#1e7ac8', fontSize: 8.5, fontWeight: 900 }}>{statusSortMode === 'number' ? '번호순' : '현황순'}</span>}
                                            {isExecHeader && execSortDirection && <span style={{ display: 'block', marginTop: 2, color: '#1e7ac8', fontSize: 8.5, fontWeight: 900 }}>{execSortLabel}</span>}
                                            {resizeHandle(column)}
                                        </th>
                                    );
                                })}
                                <th rowSpan={2} className="monthly-group-boundary" style={{ ...th, background: '#eef3f8', color: '#38516b', textAlign: 'center' }}>전체포인트{resizeHandle(COLUMNS[6])}</th>
                                <th colSpan={3} className="monthly-group-boundary" style={{ ...th, background: '#eaf4fb', color: '#0f5a99' }}>시운전</th>
                                <th colSpan={2} style={{ ...th, background: '#eaf4fb', color: '#0f5a99' }}>진행율(%)</th>
                                {[COLUMNS[12], COLUMNS[13]].map(column => <th key={column.key} rowSpan={2} style={{ ...th, background: '#f2f8fd' }}>{column.label}{resizeHandle(column)}</th>)}
                            </tr>
                            <tr>
                                {COLUMNS.slice(7, 12).map(column => <th key={column.key} className={column.key === 'pointAcc' ? 'monthly-group-boundary' : undefined} style={{ ...th, background: '#f2f8fd' }}>{column.label}{resizeHandle(column)}</th>)}
                            </tr>
                        </>)}
                    </thead>
                    <tbody>
                        {!loaded ? (
                            <tr><td colSpan={activeColumns.length} style={{ padding: 28, textAlign: 'center', color: '#8f8b84', fontSize: 12 }}>프로젝트 List를 불러오는 중입니다...</td></tr>
                        ) : displayRows.length === 0 ? (
                            <tr><td colSpan={activeColumns.length} style={{ padding: 28, textAlign: 'center', color: '#8f8b84', fontSize: 12 }}>표시할 프로젝트가 없습니다.</td></tr>
                        ) : displayRows.map((row, rowIndex) => (
                            <tr key={row._id || rowIndex}>
                                {activeColumns.map(column => {
                                    const value = valueForColumn(row, column);
                                    const isEmptyProgressCell = ['totalPoint', 'pointPrev', 'pointCurr', 'pointAcc', 'ratePrev', 'rateCurr', 'rate'].includes(column.key) && String(value).trim() === '';
                                    const rowId = row._id || `row-${rowIndex}`;
                                    const estimateKey = projectRowKey(row);
                                    const isSelectedProjectRow = selectedProjectId === rowId;
                                    return (
                                        <td key={column.key} className={[
                                                isEmptyProgressCell ? 'cell-na' : '',
                                                column.key === 'pointCurr' ? 'monthly-point-data' : '',
                                                ['totalPoint', 'pointAcc'].includes(column.key) ? 'monthly-group-boundary' : '',
                                                isSelectedProjectRow ? 'monthly-selected-cell' : '',
                                            ].filter(Boolean).join(' ')}
                                            title={column.key === 'project' ? `${value || '(프로젝트명 없음)'} · 더블클릭: 강조 · 우클릭: 비활성` : column.key === 'status' && !isSoftware ? `${value} · 우클릭: 진행현황 변경` : isEmptyProgressCell ? '빈칸 (값 없음)' : String(value)}
                                            onDoubleClick={column.key === 'project' ? () => setSelectedProjectId(previous => previous === rowId ? null : rowId) : undefined}
                                            onContextMenu={column.key === 'project' ? (event) => {
                                                event.preventDefault();
                                                event.stopPropagation();
                                                setHiddenMenuOpen(false);
                                                setStatusContextMenu(null);
                                                setRowContextMenu({ row, x: Math.min(event.clientX, window.innerWidth - 170), y: Math.min(event.clientY, window.innerHeight - 70) });
                                            } : column.key === 'status' && !isSoftware ? (event) => {
                                                event.preventDefault();
                                                event.stopPropagation();
                                                setHiddenMenuOpen(false);
                                                setRowContextMenu(null);
                                                setStatusContextMenu({ row, x: Math.min(event.clientX, window.innerWidth - 170), y: Math.min(event.clientY, window.innerHeight - 150) });
                                            } : undefined}
                                            style={{ height: Math.max(34, tableFontSize + 22), padding: '5px 8px', fontSize: tableFontSize, color: '#37352f', textAlign: column.align || 'left', borderRight: '1px solid #e7ebf0', borderBottom: '1px solid #ebe9e6', whiteSpace: column.key === 'content' ? 'normal' : 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', background: rowIndex % 2 ? '#fbfcfd' : '#fff', fontVariantNumeric: 'tabular-nums', cursor: column.key === 'project' || (column.key === 'status' && !isSoftware) ? 'pointer' : undefined }}>
                                            {column.key === 'estimate' ? (
                                                <div contentEditable suppressContentEditableWarning role="textbox" aria-label="견적번호 입력"
                                                    title="견적번호를 입력한 뒤 상단의 저장 버튼을 누르세요"
                                                    onInput={event => {
                                                        const nextValue = event.currentTarget.textContent || '';
                                                        const savedValue = estimateBaselineForRow(row);
                                                        setEstimateMessage('');
                                                        setEstimateDrafts(drafts => {
                                                            const next = { ...drafts };
                                                            if (nextValue === savedValue) delete next[estimateKey];
                                                            else next[estimateKey] = nextValue;
                                                            return next;
                                                        });
                                                    }}
                                                    onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }}
                                                    onPaste={event => { event.preventDefault(); document.execCommand('insertText', false, event.clipboardData.getData('text/plain').replace(/[\r\n]+/g, ' ')); }}
                                                    style={{ display: 'block', width: '100%', minHeight: '1em', padding: 0, margin: 0, border: 0, outline: 0, boxShadow: 'none', background: 'transparent', color: 'inherit', textAlign: 'center', font: 'inherit', fontWeight: 'inherit', lineHeight: 'inherit', whiteSpace: 'nowrap', overflow: 'hidden', boxSizing: 'border-box' }}>
                                                    {value}
                                                </div>
                                            ) : (
                                                <span style={isSelectedProjectRow ? { fontWeight: 900, color: '#0f5a99', fontSize: Math.max(16, tableFontSize) } : undefined}>{isSoftware && column.key === 'content'
                                                    ? <span style={{ display: 'block', lineHeight: 1.45, wordBreak: 'break-word' }}>{softwareContentLines(value).map((line, index) => <span key={index} style={{ display: 'block', paddingLeft: /^[-·•]/.test(line) ? 0 : 10 }}>{line}</span>)}</span>
                                                    : column.key === 'status' ? statusCell(value, isSelectedProjectRow) : value}</span>
                                            )}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {rowContextMenu && (
                <div onClick={event => event.stopPropagation()}
                    style={{ position: 'fixed', left: rowContextMenu.x, top: rowContextMenu.y, zIndex: 120, width: 160, padding: 5, border: '1px solid #cbd5e1', borderRadius: 8, background: '#fff', boxShadow: '0 10px 28px rgba(15,23,42,0.22)' }}>
                    <button type="button" onClick={() => hideProject(rowContextMenu.row)}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', border: 0, borderRadius: 6, background: '#fff', color: '#b45309', cursor: 'pointer', textAlign: 'left', fontSize: 12, fontWeight: 800 }}
                        onMouseEnter={event => { event.currentTarget.style.background = '#fff7ed'; }}
                        onMouseLeave={event => { event.currentTarget.style.background = '#fff'; }}>
                        <EyeOff size={14}/> 비활성
                    </button>
                </div>
            )}

            {statusContextMenu && (
                <div onClick={event => event.stopPropagation()}
                    style={{ position: 'fixed', left: statusContextMenu.x, top: statusContextMenu.y, zIndex: 120, width: 160, padding: 5, border: '1px solid #cbd5e1', borderRadius: 8, background: '#fff', boxShadow: '0 10px 28px rgba(15,23,42,0.22)' }}>
                    <div style={{ padding: '6px 9px', borderBottom: '1px solid #eef1f5', color: '#64748b', fontSize: 10.5, fontWeight: 800 }}>진행현황 변경</div>
                    {MONTHLY_STATUS_EDIT_OPTIONS.map(status => {
                        const active = statusValueForRow(statusContextMenu.row) === status;
                        const itemStyle = STATUS_STYLE[status];
                        return (
                            <button key={status} type="button" onClick={() => {
                                const row = statusContextMenu.row;
                                const projectKey = projectRowKey(row);
                                const savedStatus = String(monthlyStatusEntryForRow(row)?.status || reportStatus(row[sourceColumn.status]));
                                setStatusDrafts(drafts => {
                                    const next = { ...drafts };
                                    if (status === savedStatus) delete next[projectKey];
                                    else next[projectKey] = status;
                                    return next;
                                });
                                setEstimateMessage('');
                                setStatusContextMenu(null);
                            }}
                                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', border: 0, borderRadius: 6, background: active ? itemStyle.background : '#fff', color: itemStyle.color, cursor: 'pointer', textAlign: 'left', fontSize: 12, fontWeight: 800 }}>
                                <span>{status}</span>{active && <span aria-hidden="true">✓</span>}
                            </button>
                        );
                    })}
                </div>
            )}

            {memoOpen && (
                <section aria-label="월간보고 메모장"
                    style={{ position: 'fixed', top: memoPosition.y, left: memoPosition.x === null ? undefined : memoPosition.x, right: memoPosition.x === null ? 24 : undefined, zIndex: 110, width: 430, height: 510, display: 'flex', flexDirection: 'column', border: '1px solid #a9b8ca', borderRadius: 12, background: '#fff', boxShadow: '0 18px 50px rgba(15,23,42,0.25)', overflow: 'hidden' }}>
                    <div onMouseDown={startMemoDrag}
                        style={{ height: 46, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px 0 14px', background: '#f4f1ff', borderBottom: '1px solid #ddd6fe', cursor: 'move', userSelect: 'none' }}>
                        <NotebookPen size={17} style={{ color: '#7c3aed' }}/>
                        <strong style={{ color: '#4c1d95', fontSize: 14 }}>월간보고 메모장</strong>
                        <span style={{ color: '#8b80a8', fontSize: 10.5, fontWeight: 700 }}>표를 보면서 작성할 수 있습니다</span>
                        <button type="button" onClick={() => setMemoOpen(false)} title="메모장 닫기"
                            style={{ marginLeft: 'auto', width: 28, height: 28, display: 'grid', placeItems: 'center', border: 0, borderRadius: 7, background: 'transparent', color: '#64748b', cursor: 'pointer' }}>
                            <X size={17}/>
                        </button>
                    </div>
                    <div style={{ padding: '11px 13px 9px', display: 'grid', gap: 9, borderBottom: '1px solid #edf0f4', background: '#fbfcfe' }}>
                        <label style={{ display: 'grid', gap: 4, color: '#64748b', fontSize: 10.5, fontWeight: 800 }}>
                            메모 기간
                            <select value={memoPeriodDate} disabled={memoPeriodOptions.length === 0}
                                onChange={event => setMemoDraftForPeriod(event.target.value)}
                                style={{ width: '100%', height: 34, padding: '0 9px', border: '1px solid #cbd5e1', borderRadius: 7, background: '#fff', color: '#334155', fontSize: 13, fontWeight: 800, outline: 'none' }}>
                                {memoPeriodOptions.length === 0 && <option value="">등록된 월간보고 기간이 없습니다</option>}
                                {memoPeriodOptions.map(option => (
                                    <option key={option.endDate} value={option.endDate}>
                                        {displayDateKey(option.startDate)} ~ {displayDateKey(option.periodEndDate)}{memoNotes[option.endDate]?.text ? ' · 메모 있음' : ''}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#64748b', fontSize: 10.5, fontWeight: 800 }}>
                                글자 크기
                                <select value={memoFontSize} onChange={event => { setMemoFontSize(Number(event.target.value)); setMemoDirty(true); setMemoMessage('저장하지 않은 변경사항'); }}
                                    style={{ height: 30, padding: '0 7px', border: '1px solid #cbd5e1', borderRadius: 6, background: '#fff', color: '#334155', fontSize: 12, fontWeight: 800 }}>
                                    {MEMO_FONT_SIZE_OPTIONS.map(size => <option key={size} value={size}>{size}px</option>)}
                                </select>
                            </label>
                            <span style={{ color: '#64748b', fontSize: 10.5, fontWeight: 800 }}>글자 색</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                {MEMO_COLOR_OPTIONS.map(color => (
                                    <button key={color} type="button" aria-label={`글자 색 ${color}`} onMouseDown={event => { event.preventDefault(); applyMemoColor(color); }}
                                        style={{ width: 19, height: 19, padding: 0, borderRadius: '50%', border: memoColor === color ? '3px solid #94a3b8' : '1px solid #cbd5e1', background: color, cursor: 'pointer' }}/>
                                ))}
                                <input type="color" value={memoColor} title="다른 색 선택" onMouseDown={rememberMemoSelection} onChange={event => applyMemoColor(event.target.value)}
                                    style={{ width: 27, height: 25, padding: 1, border: '1px solid #cbd5e1', borderRadius: 5, background: '#fff', cursor: 'pointer' }}/>
                            </div>
                        </div>
                    </div>
                    <div style={{ position: 'relative', flex: 1, minHeight: 0, background: '#fffef9' }}>
                        {!memoText && (
                            <span style={{ position: 'absolute', top: 15, left: 15, color: '#a8a29e', fontSize: memoFontSize, pointerEvents: 'none' }}>이 기간의 월간보고 메모를 입력하세요...</span>
                        )}
                        <div ref={memoEditorRef} contentEditable={Boolean(memoPeriodDate)} suppressContentEditableWarning
                            role="textbox" aria-multiline="true" aria-label="월간보고 메모 입력"
                            onInput={handleMemoInput} onMouseUp={rememberMemoSelection} onKeyUp={rememberMemoSelection} onFocus={rememberMemoSelection} onPaste={handleMemoPaste}
                            style={{ height: '100%', width: '100%', padding: 15, border: 0, overflowY: 'auto', outline: 'none', color: memoBaseColor, fontSize: memoFontSize, lineHeight: 1.65, fontFamily: 'inherit', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', boxSizing: 'border-box', cursor: memoPeriodDate ? 'text' : 'not-allowed' }}/>
                    </div>
                    <div style={{ height: 49, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', borderTop: '1px solid #e5e7eb', background: '#fff' }}>
                        <span style={{ minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: memoDirty ? '#b45309' : '#64748b', fontSize: 10.5, fontWeight: 700 }}>{memoMessage}</span>
                        <button type="button" onClick={() => setMemoOpen(false)}
                            style={{ height: 32, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0 12px', border: '1px solid #cbd5e1', borderRadius: 7, background: '#fff', color: '#475569', cursor: 'pointer', fontSize: 12, fontWeight: 800 }}>
                            <X size={14}/> 나가기
                        </button>
                        <button type="button" onClick={saveMemo} disabled={!memoPeriodDate || memoSaving}
                            style={{ height: 32, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0 13px', border: 0, borderRadius: 7, background: !memoPeriodDate || memoSaving ? '#cbd5e1' : '#7c3aed', color: '#fff', cursor: !memoPeriodDate || memoSaving ? 'default' : 'pointer', fontSize: 12, fontWeight: 900 }}>
                            <Save size={14}/>{memoSaving ? '저장 중' : '저장'}
                        </button>
                    </div>
                </section>
            )}

            <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, paddingTop: 7, color: '#73716b', fontSize: 11 }}>
                <ChevronLeft size={12}/><span>2팀 프로젝트 List의 저장된 내용을 실시간으로 표시합니다.</span>
            </div>
        </div>
    );
}
