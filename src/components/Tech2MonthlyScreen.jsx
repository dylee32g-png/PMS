import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, Download, Eye, EyeOff, FileText, Home, ListChecks, NotebookPen, Save, Search, X } from 'lucide-react';
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { orderListRows, rowsColRef, snapshotDocRef } from './projectListData';
import { subscribeAuditLog } from '../auditLog';
import { loadXLSX } from '../utils';
import { displayTeamName } from '../teamNames';
import { appId, db } from '../firebase';

const norm = (value) => String(value ?? '').replace(/\s/g, '').toLowerCase();
const numberOf = (value) => {
    const text = String(value ?? '').replace(/[,%\s]/g, '');
    if (!text) return null;
    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : null;
};
const isSubRow = (row) => {
    const exec = String(row?.['실행번호'] || '').trim().toLowerCase();
    return exec === 's' || exec.startsWith('-');
};
const reportStatus = (value) => String(value || '').trim() === '진행' ? '진행중' : String(value || '').trim();
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
    '진행중': { color: '#047857', background: '#ecfdf5', borderColor: '#a7f3d0' },
    '추진중': { color: '#92400e', background: '#fffbeb', borderColor: '#fde68a' },
    '완료': { color: '#b91c1c', background: '#fff1f2', borderColor: '#fecdd3' },
    '취소': { color: '#64748b', background: '#f8fafc', borderColor: '#cbd5e1' },
    '삭제': { color: '#64748b', background: '#f8fafc', borderColor: '#cbd5e1' },
    'Hold': { color: '#64748b', background: '#f8fafc', borderColor: '#cbd5e1' },
};

const COLUMNS = [
    { key: 'no', label: '번호', width: 58, align: 'center', names: ['번호', '순번'] },
    { key: 'exec', label: '수행번호', width: 78, align: 'center', names: ['수행번호'] },
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
    { key: 'project', label: '프로젝트명', width: 430, names: ['프로젝트명'] },
    { key: 'rate', label: '공정률', width: 100, align: 'right', names: ['공정률(%)', '공정률'] },
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
    }, [currentTeam]);
    useEffect(() => {
        const closeMenus = () => { setHiddenMenuOpen(false); setRowContextMenu(null); };
        document.addEventListener('click', closeMenus);
        window.addEventListener('blur', closeMenus);
        return () => {
            document.removeEventListener('click', closeMenus);
            window.removeEventListener('blur', closeMenus);
        };
    }, []);

    const saveHiddenProjectKeys = useCallback((next) => {
        const values = [...new Set(next.filter(Boolean))];
        setHiddenProjectKeys(values);
        try { localStorage.setItem(`${HIDDEN_PROJECTS_KEY}_${currentTeam}`, JSON.stringify(values)); } catch (e) {}
    }, [currentTeam]);
    const hideProject = useCallback((row) => {
        const key = projectRowKey(row);
        if (!key) return;
        saveHiddenProjectKeys([...hiddenProjectKeys, key]);
        setSelectedProjectId(previous => previous === (row._id || '') ? null : previous);
        setRowContextMenu(null);
    }, [hiddenProjectKeys, saveHiddenProjectKeys]);
    const restoreProject = useCallback((key) => {
        saveHiddenProjectKeys(hiddenProjectKeys.filter(item => item !== key));
    }, [hiddenProjectKeys, saveHiddenProjectKeys]);

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
        <span className="monthly-col-resizer" onMouseDown={event => startColumnResize(event, column)} onDoubleClick={event => resetColumnWidth(event, column)}
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
        setMemoNotes({});
        const notesRef = collection(db, 'artifacts', appId, 'public', 'data', `monthlyReportNotes_${currentTeam}`);
        return onSnapshot(notesRef, snapshot => {
            const next = {};
            snapshot.docs.forEach(item => { next[item.id] = { id: item.id, ...item.data() }; });
            setMemoNotes(next);
        }, () => setMemoNotes({}));
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
            result[column.key] = column.names
                .map(name => headers.find(header => norm(header) === norm(name)))
                .find(Boolean) || column.names[0];
        });
        if (!result.status) {
            result.status = headers.find(header => norm(header) === norm('진행 현황')) || '진행 현황';
        }
        return result;
    }, [activeColumns, headers, currentTeam]);

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
        return hasValue ? Math.round(total * 100) / 100 : '';
    }, [currentTeam, progressRecordsMap]);

    const valueForColumn = useCallback((row, column) => {
        if (column.key === 'pointPrev') {
            if (hasReportPeriod) return pointsForPeriod(row, previousReportPeriod);
            if (currentTeam === '기술1팀') return row['전월'] ?? '';
            return pointsForPeriod(row, { monthKey: previousMonthKey });
        }
        if (column.key === 'pointCurr') {
            if (hasReportPeriod) return pointsForPeriod(row, currentReportPeriod);
            if (currentTeam === '기술1팀') return row['금월'] ?? '';
            return pointsForPeriod(row, { monthKey: currentMonthKey });
        }
        const sourceRow = column.period === 'prev'
            ? previousMonthSnapshot?.rows?.[row._pid || row.pid || row._id]
            : row;
        const value = sourceRow?.[sourceColumn[column.key]] ?? '';
        return column.key === 'status' ? reportStatus(value) : value;
    }, [currentMonthKey, currentReportPeriod, currentTeam, hasReportPeriod, pointsForPeriod, previousMonthKey, previousMonthSnapshot, previousReportPeriod, sourceColumn]);

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
            '추진중': visibleYearRows.filter(row => reportStatus(row[statusCol]) === '추진중').length,
        };
    }, [visibleYearRows, sourceColumn, isMonthlyCompletedRow, isSoftware]);

    const displayRows = useMemo(() => {
        const mainRows = visibleYearRows.filter(row => {
            const status = reportStatus(row[sourceColumn.status]);
            return (selectedStatuses.includes('금월완료') && isMonthlyCompletedRow(row))
                || selectedStatuses.includes(status);
        });
        const q = norm(query);
        if (!q) return mainRows;
        return mainRows.filter(row => activeColumns.some(column => norm(valueForColumn(row, column)).includes(q)));
    }, [activeColumns, visibleYearRows, selectedStatuses, query, sourceColumn, valueForColumn, isMonthlyCompletedRow]);

    const summary = useMemo(() => {
        if (isSoftware) {
            const rates = displayRows.map(row => numberOf(row[sourceColumn.rate])).filter(value => value !== null);
            return {
                projectCount: displayRows.length,
                averageRate: rates.length ? Math.round(rates.reduce((sum, value) => sum + value, 0) / rates.length * 10) / 10 : null,
                completedCount: displayRows.filter(row => String(row[sourceColumn.status] || '').trim() === '완료').length,
            };
        }
        const totalPoints = displayRows.reduce((sum, row) => sum + (numberOf(row[sourceColumn.totalPoint]) || 0), 0);
        const performedPoints = displayRows.reduce((sum, row) => sum + (numberOf(row[sourceColumn.pointAcc]) || 0), 0);
        const rates = displayRows.map(row => numberOf(row[sourceColumn.rateCurr])).filter(value => value !== null);
        return {
            totalPoints,
            performedPoints,
            averageRate: rates.length ? Math.round(rates.reduce((sum, value) => sum + value, 0) / rates.length * 10) / 10 : null,
        };
    }, [displayRows, isSoftware, sourceColumn]);

    const handleDownload = async () => {
        try {
            const XLSX = await loadXLSX();
            const statusOrder = isSoftware ? { '수정중': 0, '개발중': 1 } : { '진행중': 0, '추진중': 1 };
            const exportRows = visibleYearRows
                .map((row, index) => ({ row, index, status: reportStatus(row[sourceColumn.status]) }))
                .filter(item => Object.prototype.hasOwnProperty.call(statusOrder, item.status) || isMonthlyCompletedRow(item.row))
                .sort((a, b) => {
                    const aOrder = isMonthlyCompletedRow(a.row) ? 2 : statusOrder[a.status];
                    const bOrder = isMonthlyCompletedRow(b.row) ? 2 : statusOrder[b.status];
                    return aOrder - bOrder || a.index - b.index;
                })
                .map(item => item.row);

            if (!exportRows.length) {
                window.alert(isSoftware ? '엑셀로 만들 수정중·개발중·금월완료 프로젝트가 없습니다.' : '엑셀로 만들 진행중·추진중·금월완료 프로젝트가 없습니다.');
                return;
            }

            const aoa = isSoftware ? [SOFTWARE_COLUMNS.map(column => column.label)] : [
                ['번호', '수행번호', '공장', '진행현황', 'Project', '전체포인트', '시운전', '', '', '진행율(%)', '', '날짜', '내용'],
                ['', '', '', '', '', '', '전월', '금월', '누적', '전월', '금월', '', ''],
            ];
            exportRows.forEach(row => {
                aoa.push(activeColumns.map(column => {
                    const value = valueForColumn(row, column);
                    if (['totalPoint', 'pointPrev', 'pointCurr', 'pointAcc', 'ratePrev', 'rateCurr', 'rate'].includes(column.key)) {
                        const numeric = numberOf(value);
                        return numeric === null ? '' : numeric;
                    }
                    return value;
                }));
            });

            const worksheet = XLSX.utils.aoa_to_sheet(aoa);
            worksheet['!merges'] = isSoftware ? [] : [
                { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } },
                { s: { r: 0, c: 1 }, e: { r: 1, c: 1 } },
                { s: { r: 0, c: 2 }, e: { r: 1, c: 2 } },
                { s: { r: 0, c: 3 }, e: { r: 1, c: 3 } },
                { s: { r: 0, c: 4 }, e: { r: 1, c: 4 } },
                { s: { r: 0, c: 5 }, e: { r: 1, c: 5 } },
                { s: { r: 0, c: 6 }, e: { r: 0, c: 8 } },
                { s: { r: 0, c: 9 }, e: { r: 0, c: 10 } },
                { s: { r: 0, c: 11 }, e: { r: 1, c: 11 } },
                { s: { r: 0, c: 12 }, e: { r: 1, c: 12 } },
            ];
            worksheet['!cols'] = activeColumns.map(column => ({ wch: Math.max(8, Math.round(widthOf(column) / 7)) }));
            worksheet['!rows'] = isSoftware ? [{ hpt: 24 }] : [{ hpt: 22 }, { hpt: 22 }];
            for (let rowIndex = isSoftware ? 1 : 2; rowIndex < aoa.length; rowIndex += 1) {
                if (isSoftware) {
                    if (worksheet[`E${rowIndex + 1}`]) worksheet[`E${rowIndex + 1}`].z = '0.0';
                } else {
                    ['F', 'G', 'H', 'I'].forEach(col => { if (worksheet[`${col}${rowIndex + 1}`]) worksheet[`${col}${rowIndex + 1}`].z = '#,##0.##'; });
                    ['J', 'K'].forEach(col => { if (worksheet[`${col}${rowIndex + 1}`]) worksheet[`${col}${rowIndex + 1}`].z = '0.0'; });
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
    const statusOptions = isSoftware ? ['금월완료', '수정중', '개발중'] : ['금월완료', '진행중', '추진중'];
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 8 }}>
                    <button type="button" onClick={onGoToList} title="프로젝트 List로 돌아가기"
                        style={{ height: 30, display: 'inline-flex', alignItems: 'center', gap: 4, padding: '0 10px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', color: '#475569', cursor: 'pointer', fontSize: 12, fontWeight: 800 }}>
                        <ChevronLeft size={14}/> 이전화면
                    </button>
                    {statusOptions.map(status => {
                        const active = selectedStatuses.includes(status);
                        const color = status === '금월완료' ? '#b91c1c' : ['진행중', '개발중'].includes(status) ? '#047857' : status === '수정중' ? '#1358a0' : '#b45309';
                        const activeBg = status === '금월완료' ? '#dc2626' : ['진행중', '개발중'].includes(status) ? '#047857' : status === '수정중' ? '#1e7ac8' : '#d97706';
                        return (
                            <button key={status} type="button" aria-pressed={active} onClick={() => setSelectedStatuses(previous => previous.includes(status) ? previous.filter(item => item !== status) : [...previous, status])}
                                style={{ height: 30, padding: '0 11px', borderRadius: 8, border: `1px solid ${active ? activeBg : '#d8d4cf'}`, background: active ? activeBg : '#fff', color: active ? '#fff' : color, cursor: 'pointer', fontSize: 12, fontWeight: 800 }}>
                                {status} <span style={{ marginLeft: 3, opacity: active ? 0.95 : 0.7 }}>{status === '금월완료' && !auditLoaded ? '…' : `${statusCounts[status]}건`}</span>
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
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ position: 'relative' }} onClick={event => event.stopPropagation()}>
                        <button type="button" onClick={() => { setHiddenMenuOpen(open => !open); setRowContextMenu(null); }}
                            style={{ ...btnStyle, height: 32, padding: '7px 9px', fontSize: 11, whiteSpace: 'nowrap', flexShrink: 0, color: hiddenProjectRows.length ? '#b45309' : '#64748b', borderColor: hiddenProjectRows.length ? '#f5c980' : '#d8d4cf' }}
                            title="숨긴 프로젝트 다시 표시">
                            <EyeOff size={14}/> 숨기기{hiddenProjectRows.length ? ` ${hiddenProjectRows.length}` : ''}<ChevronDown size={12}/>
                        </button>
                        {hiddenMenuOpen && (
                            <div style={{ position: 'absolute', top: 36, left: 0, zIndex: 80, width: 300, maxHeight: 320, overflowY: 'auto', padding: 6, border: '1px solid #cbd5e1', borderRadius: 9, background: '#fff', boxShadow: '0 12px 30px rgba(15,23,42,0.18)' }}>
                                <div style={{ padding: '5px 8px 7px', fontSize: 10.5, fontWeight: 800, color: '#64748b', borderBottom: '1px solid #eef1f5' }}>숨긴 프로젝트 · 선택하면 다시 표시</div>
                                {hiddenProjectRows.length === 0 ? (
                                    <div style={{ padding: '14px 8px', textAlign: 'center', fontSize: 11.5, color: '#94a3b8' }}>숨긴 프로젝트가 없습니다.</div>
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
                                    <button type="button" onClick={() => saveHiddenProjectKeys([])}
                                        style={{ width: '100%', marginTop: 5, padding: '7px 8px', border: '1px solid #bfdbfe', borderRadius: 6, background: '#eff6ff', color: '#1e7ac8', cursor: 'pointer', fontSize: 11, fontWeight: 800 }}>
                                        모두 다시 표시
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
                    <div style={{ position: 'relative' }}>
                        <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#8f8b84' }}/>
                        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="전체 검색..." style={{ width: 180, height: 32, padding: '0 10px 0 29px', border: '1px solid #d8d4cf', borderRadius: 8, background: '#fff', color: '#37352f', outline: 'none', fontSize: 12 }}/>
                    </div>
                    <button onClick={handleDownload} style={{ ...btnStyle, color: '#4338ca', borderColor: '#c7d2fe' }} title={isSoftware ? '수정중, 개발중, 금월완료 순서로 엑셀 생성' : '진행중, 추진중, 금월완료 순서로 엑셀 생성'}>
                        <Download size={14}/> 엑셀 생성
                    </button>
                    <button onClick={onGoToList} style={{ ...btnStyle, color: '#047857', borderColor: '#bfe3c8' }}><ListChecks size={14}/> 프로젝트 List로</button>
                </div>
            </div>

            <div style={{ flex: 1, minHeight: 0, overflow: 'auto', background: '#fff', border: '1px solid #cfd8e3', boxShadow: '0 1px 3px rgba(55,53,47,0.06)' }}>
                <table className="tech2-monthly-table" style={{ width: tableWidth, minWidth: tableWidth, borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed' }}>
                    <colgroup>{activeColumns.map(column => <col key={column.key} style={{ width: widthOf(column) }}/>)}</colgroup>
                    <thead style={{ position: 'sticky', top: 0, zIndex: 20 }}>
                        {isSoftware ? (
                            <tr>{activeColumns.map(column => <th key={column.key} style={{ ...th, background: '#f2f8fd', height: 38 }}>{column.label}{resizeHandle(column)}</th>)}</tr>
                        ) : (<>
                            <tr>
                                {COLUMNS.slice(0, 5).map(column => <th key={column.key} rowSpan={2} style={th}>{column.label}{resizeHandle(column)}</th>)}
                                <th rowSpan={2} className="monthly-group-boundary" style={{ ...th, background: '#eef3f8', color: '#38516b', textAlign: 'center' }}>전체포인트{resizeHandle(COLUMNS[5])}</th>
                                <th colSpan={3} className="monthly-group-boundary" style={{ ...th, background: '#eaf4fb', color: '#0f5a99' }}>시운전</th>
                                <th colSpan={2} style={{ ...th, background: '#eaf4fb', color: '#0f5a99' }}>진행율(%)</th>
                                {[COLUMNS[11], COLUMNS[12]].map(column => <th key={column.key} rowSpan={2} style={{ ...th, background: '#f2f8fd' }}>{column.label}{resizeHandle(column)}</th>)}
                            </tr>
                            <tr>
                                {COLUMNS.slice(6, 11).map(column => <th key={column.key} className={column.key === 'pointAcc' ? 'monthly-group-boundary' : undefined} style={{ ...th, background: '#f2f8fd' }}>{column.label}{resizeHandle(column)}</th>)}
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
                                    const isSelectedProjectRow = selectedProjectId === rowId;
                                    return (
                                        <td key={column.key} className={[
                                                isEmptyProgressCell ? 'cell-na' : '',
                                                column.key === 'pointCurr' ? 'monthly-point-data' : '',
                                                ['totalPoint', 'pointAcc'].includes(column.key) ? 'monthly-group-boundary' : '',
                                                isSelectedProjectRow ? 'monthly-selected-cell' : '',
                                            ].filter(Boolean).join(' ')}
                                            title={column.key === 'project' ? `${value || '(프로젝트명 없음)'} · 더블클릭: 강조 · 우클릭: 숨기기` : isEmptyProgressCell ? '빈칸 (값 없음)' : String(value)}
                                            onDoubleClick={column.key === 'project' ? () => setSelectedProjectId(previous => previous === rowId ? null : rowId) : undefined}
                                            onContextMenu={column.key === 'project' ? (event) => {
                                                event.preventDefault();
                                                event.stopPropagation();
                                                setHiddenMenuOpen(false);
                                                setRowContextMenu({ row, x: Math.min(event.clientX, window.innerWidth - 170), y: Math.min(event.clientY, window.innerHeight - 70) });
                                            } : undefined}
                                            style={{ height: Math.max(34, tableFontSize + 22), padding: '5px 8px', fontSize: tableFontSize, color: '#37352f', textAlign: column.align || 'left', borderRight: '1px solid #e7ebf0', borderBottom: '1px solid #ebe9e6', whiteSpace: column.key === 'content' ? 'normal' : 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', background: rowIndex % 2 ? '#fbfcfd' : '#fff', fontVariantNumeric: 'tabular-nums', cursor: column.key === 'project' ? 'pointer' : undefined }}>
                                            <span style={isSelectedProjectRow ? { fontWeight: 900, color: '#0f5a99', fontSize: Math.max(16, tableFontSize) } : undefined}>{column.key === 'status' ? statusCell(value, isSelectedProjectRow) : value}</span>
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
                        <EyeOff size={14}/> 숨기기
                    </button>
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
