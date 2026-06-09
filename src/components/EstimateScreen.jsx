import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
    Upload, Download, Trash2, X, LogOut,
    AlertTriangle, Search, FileSpreadsheet,
    Edit2, Save, ChevronUp, ChevronDown, Plus, Target
} from 'lucide-react';
import { loadXLSX, loadExcelJS, loadFileSaver } from '../utils';

const DROPDOWN_KW = ['진행', '현황', '담당자', '공사업체', '업체담당자'];
const isDateCol     = (h) => ['날짜', '일자', 'Date', '일시'].some(k => h.includes(k));
const isDropdownCol = (h) => DROPDOWN_KW.some(k => h.includes(k));

const EstimateScreen = ({ onBack }) => {
    const [headers, setHeaders]               = useState([]);
    const [rows, setRows]                     = useState([]);
    const [searchTerm, setSearchTerm]         = useState('');
    const [sortConfig, setSortConfig]         = useState({ key: null, dir: 'asc' });
    const [editingRow, setEditingRow]         = useState(null);
    const [addingRow, setAddingRow]           = useState(null);
    const [isLoading, setIsLoading]           = useState(false);
    const [alertMsg, setAlertMsg]             = useState('');
    const [confirmClearOpen, setConfirmClearOpen] = useState(false);
    const [colWidths, setColWidths]           = useState({});
    const [resizingCol, setResizingCol]       = useState(null);
    const [startX, setStartX]                 = useState(0);
    const [startWidth, setStartWidth]         = useState(0);

    const fileInputRef = useRef(null);

    const getW = h => colWidths[h] || Math.max(100, h.length * 14 + 40);

    // 컬럼 리사이즈
    useEffect(() => {
        const onMove = e => {
            if (!resizingCol) return;
            setColWidths(p => ({ ...p, [resizingCol]: Math.max(60, startWidth + e.clientX - startX) }));
        };
        const onUp = () => setResizingCol(null);
        if (resizingCol) { document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp); }
        return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    }, [resizingCol, startX, startWidth]);

    const handleFileUpload = async (e) => {
        const file = e.target?.files?.[0];
        if (!file) return;
        setIsLoading(true);
        try {
            const XLSX = await loadXLSX();
            const wb   = XLSX.read(await file.arrayBuffer(), { cellDates: true });
            const ws   = wb.Sheets[wb.SheetNames[0]];
            const raw  = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, dateNF: 'yyyy-mm-dd', defval: '' });

            if (raw.length < 2) {
                setAlertMsg('데이터가 없거나 형식이 올바르지 않습니다.\n첫 번째 행을 헤더로, 두 번째 행부터 데이터로 인식합니다.');
                setIsLoading(false); return;
            }

            const hdrs = (raw[0] || [])
                .map((h, i) => h ? String(h).trim() : `열${i + 1}`)
                .filter(Boolean);

            const ts = Date.now();
            const dataRows = raw.slice(1).map((row, idx) => {
                const obj = { _id: `est_${ts}_${idx}` };
                hdrs.forEach((h, i) => { obj[h] = String(row[i] ?? '').trim(); });
                return hdrs.every(h => !obj[h]) ? null : obj;
            }).filter(Boolean);

            setHeaders(hdrs);
            setRows(dataRows);
        } catch (err) {
            setAlertMsg(`파싱 오류: ${err.message}`);
        } finally {
            setIsLoading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleDownload = async () => {
        if (!headers.length) { setAlertMsg('다운로드할 데이터가 없습니다.'); return; }
        setIsLoading(true);
        try {
            const ExcelJS = await loadExcelJS(); await loadFileSaver();
            const wb = new ExcelJS.Workbook();
            const ws = wb.addWorksheet('견적');
            ws.columns = headers.map(h => ({ header: h, key: h, width: Math.max(12, getW(h) / 7.5) }));
            ws.getRow(1).eachCell(cell => {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
                cell.font = { color: { argb: 'FFFFFFFF' }, bold: true, name: '맑은 고딕' };
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FF334155' } },
                    bottom: { style: 'thin', color: { argb: 'FF334155' } },
                    left: { style: 'thin', color: { argb: 'FF334155' } },
                    right: { style: 'thin', color: { argb: 'FF334155' } }
                };
            });
            sortedRows.forEach(row => {
                const exRow = ws.addRow(Object.fromEntries(headers.map(h => [h, row[h] || ''])));
                exRow.eachCell(cell => {
                    cell.font = { name: '맑은 고딕' };
                    cell.alignment = { vertical: 'middle' };
                    cell.border = {
                        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                        right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
                    };
                });
            });
            const buf = await wb.xlsx.writeBuffer();
            window.saveAs(
                new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
                `견적_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.xlsx`
            );
        } catch (err) { setAlertMsg(`다운로드 오류: ${err.message}`); }
        finally { setIsLoading(false); }
    };

    const saveEditingRow = () => {
        if (!editingRow) return;
        setRows(prev => prev.map(r => r._id === editingRow._id ? { ...editingRow } : r));
        setEditingRow(null);
    };

    const saveAddingRow = () => {
        if (!addingRow) return;
        setRows(prev => [...prev, addingRow]);
        setAddingRow(null);
    };

    const deleteRow = id => setRows(prev => prev.filter(r => r._id !== id));

    const requestSort = key =>
        setSortConfig(p => ({ key, dir: p.key === key && p.dir === 'asc' ? 'desc' : 'asc' }));

    const getUniqueVals = (header) =>
        [...new Set(rows.map(r => String(r[header]||'').trim()).filter(Boolean))].sort();

    const FieldInput = ({ header, value, onChange }) => {
        const cls = 'bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 transition-all w-full';
        if (isDateCol(header)) {
            return <input type="date" value={value || ''} onChange={e => onChange(e.target.value)} className={cls + ' color-scheme-dark'}/>;
        }
        if (isDropdownCol(header)) {
            const listId = `est-dl-${header.replace(/\s+/g, '-')}`;
            return (
                <>
                    <input type="text" list={listId} value={value || ''} onChange={e => onChange(e.target.value)} placeholder="선택하거나 직접 입력..." className={cls}/>
                    <datalist id={listId}>{getUniqueVals(header).map(v => <option key={v} value={v}/>)}</datalist>
                </>
            );
        }
        return <input type="text" value={value || ''} onChange={e => onChange(e.target.value)} className={cls}/>;
    };

    const sortedRows = useMemo(() => {
        let out = rows;
        if (searchTerm) {
            const t = searchTerm.toLowerCase();
            out = out.filter(r => headers.some(h => String(r[h] || '').toLowerCase().includes(t)));
        }
        if (!sortConfig.key) return out;
        return [...out].sort((a, b) => {
            const av = String(a[sortConfig.key] || '').toLowerCase();
            const bv = String(b[sortConfig.key] || '').toLowerCase();
            return sortConfig.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
        });
    }, [rows, headers, searchTerm, sortConfig]);

    return (
        <div className="h-screen bg-slate-950 text-slate-100 font-sans p-4 md:p-6 flex flex-col overflow-hidden relative">

            {/* 로딩 */}
            {isLoading && (
                <div className="fixed inset-0 z-[999] flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-sm">
                    <div className="w-14 h-14 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mb-4 shadow-[0_0_20px_rgba(245,158,11,0.4)]"/>
                    <p className="text-lg font-bold text-white">처리 중...</p>
                </div>
            )}

            {/* 알림 */}
            {alertMsg && (
                <div className="fixed inset-0 z-[400] flex items-center justify-center bg-slate-950/80 p-4">
                    <div className="bg-slate-900 border border-slate-700 p-8 rounded-3xl max-w-sm w-full text-center shadow-2xl">
                        <p className="text-white font-bold mb-6 whitespace-pre-line">{alertMsg}</p>
                        <button onClick={() => setAlertMsg('')} className="px-6 py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold w-full">확인</button>
                    </div>
                </div>
            )}

            {/* 전체 삭제 확인 */}
            {confirmClearOpen && (
                <div className="fixed inset-0 z-[400] flex items-center justify-center bg-slate-950/80 p-4">
                    <div className="bg-slate-900 border border-rose-500/30 p-8 rounded-3xl max-w-sm w-full text-center shadow-2xl">
                        <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto mb-4"/>
                        <p className="text-white font-bold mb-2">전체 데이터 삭제</p>
                        <p className="text-rose-400 text-sm mb-6">현재 화면의 모든 견적 데이터가 삭제됩니다.</p>
                        <div className="flex gap-3">
                            <button onClick={() => setConfirmClearOpen(false)} className="flex-1 py-3 bg-slate-800 rounded-xl font-bold text-slate-300">취소</button>
                            <button onClick={() => { setRows([]); setHeaders([]); setConfirmClearOpen(false); }}
                                className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 rounded-xl font-bold text-white">삭제</button>
                        </div>
                    </div>
                </div>
            )}

            {/* 수정 팝업 */}
            {editingRow && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-950/90 p-4">
                    <div className="bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 shrink-0">
                            <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                <Edit2 size={18} className="text-amber-400"/> 견적 수정
                            </h2>
                            <button onClick={() => setEditingRow(null)} className="text-slate-500 hover:text-white bg-slate-800 p-1.5 rounded-xl"><X size={18}/></button>
                        </div>
                        <div className="overflow-y-auto flex-1 p-6 custom-scrollbar">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {headers.map(h => (
                                    <div key={h} className="flex flex-col gap-1.5">
                                        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider truncate flex items-center gap-1" title={h}>
                                            {h}
                                            {isDateCol(h) && <span className="text-cyan-600 text-[9px] font-bold normal-case">날짜</span>}
                                            {isDropdownCol(h) && <span className="text-amber-600 text-[9px] font-bold normal-case">선택</span>}
                                        </label>
                                        <FieldInput header={h} value={editingRow[h]} onChange={v => setEditingRow(p => ({ ...p, [h]: v }))}/>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="flex gap-3 px-6 py-4 border-t border-slate-800 shrink-0">
                            <button onClick={() => setEditingRow(null)} className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 rounded-xl font-bold text-slate-300">취소</button>
                            <button onClick={saveEditingRow} className="flex-1 py-3 bg-amber-600 hover:bg-amber-500 rounded-xl font-bold text-white flex items-center justify-center gap-2">
                                <Save size={16}/> 저장
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 추가 팝업 */}
            {addingRow && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-950/90 p-4">
                    <div className="bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 shrink-0">
                            <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                <Plus size={18} className="text-amber-400"/> 견적 추가
                            </h2>
                            <button onClick={() => setAddingRow(null)} className="text-slate-500 hover:text-white bg-slate-800 p-1.5 rounded-xl"><X size={18}/></button>
                        </div>
                        <div className="overflow-y-auto flex-1 p-6 custom-scrollbar">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {headers.map(h => (
                                    <div key={h} className="flex flex-col gap-1.5">
                                        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider truncate flex items-center gap-1" title={h}>
                                            {h}
                                            {isDateCol(h) && <span className="text-cyan-600 text-[9px] font-bold normal-case">날짜</span>}
                                            {isDropdownCol(h) && <span className="text-amber-600 text-[9px] font-bold normal-case">선택</span>}
                                        </label>
                                        <FieldInput header={h} value={addingRow[h]} onChange={v => setAddingRow(p => ({ ...p, [h]: v }))}/>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="flex gap-3 px-6 py-4 border-t border-slate-800 shrink-0">
                            <button onClick={() => setAddingRow(null)} className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 rounded-xl font-bold text-slate-300">취소</button>
                            <button onClick={saveAddingRow} className="flex-1 py-3 bg-amber-600 hover:bg-amber-500 rounded-xl font-bold text-white flex items-center justify-center gap-2">
                                <Save size={16}/> 추가 저장
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".xlsx,.xls" className="hidden"/>

            {/* 헤더 */}
            <header className="flex flex-wrap justify-between items-center gap-3 mb-3 shrink-0">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-amber-500/20 rounded-2xl border border-amber-500/30 text-amber-400">
                        <Target size={22}/>
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-white flex items-center gap-2">
                            견적 관리
                            <span className="text-xs px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded-lg border border-amber-500/30 font-mono font-bold tracking-widest">견적</span>
                        </h1>
                        <p className="text-slate-500 text-xs mt-0.5">
                            <span className="text-amber-400 font-bold">{sortedRows.length}</span>행 표시 / 전체{' '}
                            <span className="text-slate-400 font-bold">{rows.length}</span>행 ·
                            열 <span className="text-cyan-400 font-bold">{headers.length}</span>개
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {headers.length > 0 && (
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={15}/>
                            <input type="text" placeholder="전체 검색..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                                className="bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-sm text-white outline-none focus:border-amber-500 w-40 focus:w-56 transition-all"/>
                        </div>
                    )}
                    {headers.length > 0 && (
                        <button onClick={() => {
                            const newRow = { _id: `est_manual_${Date.now()}` };
                            headers.forEach(h => { newRow[h] = ''; });
                            setAddingRow(newRow);
                        }} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-amber-500/50 bg-amber-600/20 hover:bg-amber-600 text-amber-400 hover:text-white text-sm font-bold transition-all">
                            <Plus size={15}/> 견적 추가
                        </button>
                    )}
                    <button onClick={() => { if (fileInputRef.current) { fileInputRef.current.value = ''; fileInputRef.current.click(); } }}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-cyan-500/50 bg-cyan-600/20 hover:bg-cyan-600 text-cyan-400 hover:text-white text-sm font-bold transition-all">
                        <Upload size={15}/> 엑셀 업로드
                    </button>
                    <button onClick={handleDownload} disabled={!headers.length}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-emerald-500/50 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-400 hover:text-white text-sm font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed">
                        <Download size={15}/> 다운로드
                    </button>
                    {rows.length > 0 && (
                        <button onClick={() => setConfirmClearOpen(true)}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-rose-500/30 bg-rose-600/10 hover:bg-rose-600/30 text-rose-400 text-sm font-bold transition-all">
                            <Trash2 size={15}/> 전체 삭제
                        </button>
                    )}
                    <button onClick={onBack}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 text-sm font-bold transition-all">
                        <LogOut size={15}/> 나가기
                    </button>
                </div>
            </header>

            {/* 빈 상태 */}
            {headers.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-6">
                    <div className="p-8 bg-slate-900/50 rounded-3xl border border-slate-800 text-center max-w-sm">
                        <FileSpreadsheet size={48} className="text-slate-700 mx-auto mb-4"/>
                        <p className="text-slate-400 font-bold mb-2">엑셀 파일을 업로드하면</p>
                        <p className="text-slate-400 font-bold mb-4">견적 목록이 표시됩니다.</p>
                        <p className="text-slate-600 text-sm">첫 번째 행을 헤더(열 이름)로 인식합니다.</p>
                    </div>
                    <button onClick={() => { if (fileInputRef.current) { fileInputRef.current.value = ''; fileInputRef.current.click(); } }}
                        className="flex items-center gap-2 px-6 py-3 rounded-xl border border-cyan-500/50 bg-cyan-600/20 hover:bg-cyan-600 text-cyan-400 hover:text-white font-bold transition-all text-sm">
                        <Upload size={18}/> 엑셀 파일 업로드
                    </button>
                </div>
            ) : (
                /* 테이블 */
                <div className="flex-1 overflow-auto custom-scrollbar rounded-2xl border border-slate-800 shadow-xl">
                    <table className="w-full text-sm border-collapse min-w-max">
                        <thead className="sticky top-0 z-10">
                            <tr className="bg-slate-900 border-b border-slate-800">
                                <th className="px-3 py-2.5 text-[11px] font-bold text-slate-500 text-center w-10 border-r border-slate-800 shrink-0">No</th>
                                {headers.map(h => (
                                    <th key={h}
                                        className="px-3 py-2.5 text-[11px] font-bold text-slate-400 text-left cursor-pointer hover:bg-slate-800 hover:text-amber-400 transition-colors border-r border-slate-800/60 select-none relative group"
                                        style={{ width: getW(h), minWidth: getW(h) }}
                                        onClick={() => requestSort(h)}>
                                        <span className="flex items-center gap-1">
                                            {h}
                                            {sortConfig.key === h
                                                ? (sortConfig.dir === 'asc' ? <ChevronUp size={10}/> : <ChevronDown size={10}/>)
                                                : null}
                                        </span>
                                        {/* 리사이즈 핸들 */}
                                        <div
                                            className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize opacity-0 group-hover:opacity-100 hover:bg-amber-500/40 transition-opacity"
                                            onMouseDown={e => { e.stopPropagation(); setResizingCol(h); setStartX(e.clientX); setStartWidth(getW(h)); }}
                                        />
                                    </th>
                                ))}
                                <th className="px-3 py-2.5 text-[11px] font-bold text-slate-500 text-center w-20 sticky right-0 bg-slate-900 border-l border-slate-800">작업</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedRows.length === 0 ? (
                                <tr>
                                    <td colSpan={headers.length + 2} className="py-16 text-center text-slate-600 font-bold">
                                        검색 결과가 없습니다.
                                    </td>
                                </tr>
                            ) : sortedRows.map((row, idx) => (
                                <tr key={row._id} className={`border-b border-slate-800/60 hover:bg-slate-800/40 transition-colors ${idx % 2 !== 0 ? 'bg-slate-900/20' : ''}`}>
                                    <td className="px-3 py-2 text-center text-slate-500 text-xs border-r border-slate-800/40 shrink-0">{idx + 1}</td>
                                    {headers.map(h => (
                                        <td key={h}
                                            className="px-3 py-2 text-slate-300 text-xs border-r border-slate-800/40 truncate max-w-[200px]"
                                            title={row[h]}>
                                            {row[h] || <span className="text-slate-700">-</span>}
                                        </td>
                                    ))}
                                    <td className="px-2 py-2 sticky right-0 bg-slate-950 border-l border-slate-800/40">
                                        <div className="flex items-center justify-center gap-1">
                                            <button onClick={() => setEditingRow({ ...row })}
                                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-amber-500/20 text-slate-400 hover:text-amber-400 transition-colors"
                                                title="수정">
                                                <Edit2 size={12}/>
                                            </button>
                                            <button onClick={() => deleteRow(row._id)}
                                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
                                                title="삭제">
                                                <Trash2 size={12}/>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default EstimateScreen;
