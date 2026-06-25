import React from 'react';
import { LayoutList, X, Clock } from 'lucide-react';
import { isStatusCol, isAssigneeCol, isDateCol, STATUS_CHIP_COLORS, DEFAULT_STATUS_OPTIONS, ASSIGNEE_LIST, toDateInputVal } from './projectColumns';

// ─────────────────────────────────────────────────────────────────────────
// 프로젝트 List — 상세 보기 / 수정 팝업
// ProjectListScreen.jsx에서 분리 (2026-06-25, 코드 분리 3조각 = 상세팝업)
// 저장 로직(saveDetailRow)은 부모에 그대로 두고 onSave 로 받음. 이 파일은 화면만 그림.
// props: detailRow · setDetailRow · onSave · mainVisibleHeaders · activeHeaders · activeColGroups
// ─────────────────────────────────────────────────────────────────────────
export default function DetailModal({ detailRow, setDetailRow, onSave, mainVisibleHeaders, activeHeaders, activeColGroups }) {
    if (!detailRow) return null;
    return (
                <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-950/90 p-4"
                     onClick={() => setDetailRow(null)}>
                    <div className="w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl"
                         style={{ backgroundColor:'#fff', border:'1.5px solid #c4ccd8' }}
                         onClick={e => e.stopPropagation()}>

                        {/* 타이틀 바 */}
                        <div style={{ backgroundColor:'#1e7ac8', padding:'10px 18px', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
                            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                                <LayoutList size={15} style={{ color:'#fff' }}/>
                                <span style={{ color:'#fff', fontWeight:800, fontSize:'14px' }}>상세 보기 / 수정</span>
                                {(detailRow['번호'] || detailRow['Project'] || detailRow['프로젝트']) && (
                                    <span style={{ color:'rgba(255,255,255,0.75)', fontSize:'12px', marginLeft:4 }}>
                                        — {detailRow['번호'] || detailRow['Project'] || detailRow['프로젝트']}
                                    </span>
                                )}
                                {/* A-4a: 고유 ID(_pid) 표시 — 발급 확인용 */}
                                {detailRow._pid && (
                                    <span title="고유 ID (불변·자동 발급)" style={{ color:'#e9d5ff', background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.35)', borderRadius:4, fontSize:'10px', fontWeight:700, padding:'1px 6px', marginLeft:6 }}>
                                        ID: {detailRow._pid}
                                    </span>
                                )}
                            </div>
                            <button onClick={() => setDetailRow(null)}
                                style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.8)', display:'flex', alignItems:'center' }}>
                                <X size={18}/>
                            </button>
                        </div>

                        {/* 요약 바 — 주요 열 값 */}
                        <div style={{ backgroundColor:'#f0f4fa', borderBottom:'1.5px solid #c4ccd8', padding:'7px 18px', display:'flex', flexWrap:'wrap', gap:'4px 16px', flexShrink:0 }}>
                            {mainVisibleHeaders.filter(h => detailRow[h]).map(h => {
                                const val = detailRow[h];
                                if (isStatusCol(h)) {
                                    const c = STATUS_CHIP_COLORS[val] || { bg:'rgba(100,116,139,0.08)', text:'#475569', border:'rgba(100,116,139,0.3)' };
                                    return (
                                        <span key={h} style={{ fontSize:'11px' }}>
                                            <span style={{ fontWeight:700, color:'#666' }}>{h}: </span>
                                            <span style={{ display:'inline-block', padding:'0 7px', fontSize:'11px', fontWeight:700, backgroundColor:c.bg, color:c.text, border:`1px solid ${c.border}` }}>{val}</span>
                                        </span>
                                    );
                                }
                                return (
                                    <span key={h} style={{ fontSize:'11px' }}>
                                        <span style={{ fontWeight:700, color:'#666' }}>{h}: </span>
                                        <span style={{ color:'#222' }}>{val}</span>
                                    </span>
                                );
                            })}
                        </div>

                        {/* 전체 필드 편집 그리드 */}
                        <div className="overflow-y-auto flex-1 custom-scrollbar" style={{ padding:'14px 18px' }}>
                            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', border:'1px solid #d0d7e3' }}>
                                {activeHeaders.filter(h => !h.startsWith('_')).map((h, i) => {
                                    const val = detailRow[h] || '';
                                    const isContentCol = !isDateCol(h) && (h.includes('내용') || h.includes('내역') || h.includes('비고') || h.includes('참조'));
                                    const span2 = isContentCol || activeColGroups.some(g => (g.label?.includes('공사진행')||g.label?.includes('공사 진행')) && g.cols.includes(h) && !isDateCol(h));
                                    const isStatus = isStatusCol(h);
                                    const isAssignee = isAssigneeCol(h);
                                    return (
                                        <div key={h}
                                            style={{ display:'flex', borderBottom:'1px solid #e5eaf3', gridColumn: span2 ? 'span 2' : undefined, backgroundColor: i%2===0?'#fff':'#fafcff' }}>
                                            <div style={{ width:'120px', flexShrink:0, backgroundColor:'#eef2fb', borderRight:'1px solid #d8dfee', padding:'6px 10px', fontSize:'11px', fontWeight:700, color:'#4a5a80', display:'flex', alignItems:'center', gap:4 }}>
                                                {h}
                                                {isStatus && <span style={{ fontSize:'9px', color:'#1e7ac8', fontWeight:800 }}>▼</span>}
                                                {isAssignee && <span style={{ fontSize:'9px', color:'#059669', fontWeight:800 }}>▼</span>}
                                            </div>
                                            <div style={{ flex:1, padding:'2px 0', display:'flex', alignItems:'stretch' }}>
                                                {isStatus ? (
                                                    <select value={val}
                                                        onChange={e => setDetailRow(p => ({...p, [h]: e.target.value}))}
                                                        style={{ width:'100%', border:'none', outline:'none', padding:'4px 10px', fontSize:'12px', color:'#222', backgroundColor:'transparent', fontFamily:'inherit', cursor:'pointer' }}>
                                                        <option value="">—</option>
                                                        {DEFAULT_STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                                                    </select>
                                                ) : isAssignee ? (
                                                    <select value={val}
                                                        onChange={e => setDetailRow(p => ({...p, [h]: e.target.value}))}
                                                        style={{ width:'100%', border:'none', outline:'none', padding:'4px 10px', fontSize:'12px', color:'#222', backgroundColor:'transparent', fontFamily:'inherit', cursor:'pointer' }}>
                                                        <option value="">—</option>
                                                        {ASSIGNEE_LIST.map(a => <option key={a} value={a}>{a}</option>)}
                                                    </select>
                                                ) : isDateCol(h) ? (
                                                    <input type="date" value={toDateInputVal(val)}
                                                        onChange={e => setDetailRow(p => ({...p, [h]: e.target.value}))}
                                                        style={{ width:'100%', border:'none', outline:'none', padding:'4px 10px', fontSize:'12px', color:'#222', backgroundColor:'transparent', fontFamily:'inherit' }}/>
                                                ) : (
                                                    <textarea value={val}
                                                        onChange={e => setDetailRow(p => ({...p, [h]: e.target.value}))}
                                                        rows={span2 ? 3 : 1}
                                                        style={{ width:'100%', border:'none', outline:'none', resize:'none', padding:'4px 10px', fontSize:'12px', color:'#222', backgroundColor:'transparent', fontFamily:'inherit', lineHeight:1.5 }}
                                                        onFocus={e => e.target.style.backgroundColor='#fffde7'}
                                                        onBlur={e => e.target.style.backgroundColor='transparent'}/>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* 변경 이력 히스토리 박스 */}
                        {(() => {
                            const changeHist = Array.isArray(detailRow._changeHistory) ? detailRow._changeHistory : [];
                            const statusHist = Array.isArray(detailRow._statusHistory) ? detailRow._statusHistory : [];
                            if (!changeHist.length && !statusHist.length) return null;
                            // 날짜+시간 포맷
                            const fmtDt = iso => {
                                const d = new Date(iso);
                                return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
                            };
                            return (
                                <div style={{ borderTop:'1.5px solid #c4ccd8', flexShrink:0, backgroundColor:'#f8fafc' }}>
                                    <div style={{ padding:'8px 18px 4px', display:'flex', alignItems:'center', gap:8 }}>
                                        <Clock size={13} style={{ color:'#1e7ac8' }}/>
                                        <span style={{ fontSize:'12px', fontWeight:800, color:'#1e7ac8' }}>변경 이력</span>
                                        <span style={{ fontSize:'10px', color:'#999', marginLeft:'auto' }}>최신순</span>
                                    </div>
                                    <div style={{ maxHeight:'280px', overflowY:'auto', padding:'0 18px 12px', display:'flex', flexDirection:'column', gap:6 }}>
                                        {/* 일반 변경 이력 (최신순) */}
                                        {[...changeHist].reverse().map((entry, i) => (
                                            <div key={`ch-${i}`} style={{ backgroundColor:'#fff', border:'1px solid #d8e3f0', padding:'8px 12px', fontSize:'12px' }}>
                                                <div style={{ fontWeight:800, color:'#1e7ac8', marginBottom:5, fontFamily:'monospace', fontSize:'11px', borderBottom:'1px solid #eef2fb', paddingBottom:4 }}>
                                                    🕐 {fmtDt(entry.datetime)}
                                                </div>
                                                {entry.changes.map((c, ci) => (
                                                    <div key={ci} style={{ display:'flex', alignItems:'baseline', gap:6, color:'#333', paddingLeft:8, borderLeft:'3px solid #c4ccd8', marginBottom:3, flexWrap:'wrap' }}>
                                                        <span style={{ fontWeight:800, color:'#4a5a80', minWidth:80 }}>{c.field}</span>
                                                        <span style={{ color:'#cc2a2a', textDecoration:'line-through', fontSize:'11px' }}>{c.from || '—'}</span>
                                                        <span style={{ color:'#999', fontSize:'13px' }}>→</span>
                                                        <span style={{ color:'#0a6a28', fontWeight:700, fontSize:'12px' }}>{c.to || '—'}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        ))}
                                        {/* 진행현황 이력 */}
                                        {statusHist.length > 0 && (
                                            <div style={{ backgroundColor:'#f0f6ff', border:'1px solid #c8d8f0', padding:'6px 10px', fontSize:'11px' }}>
                                                <div style={{ fontWeight:800, color:'#1e7ac8', marginBottom:4, fontSize:'10px' }}>📋 진행현황 이력</div>
                                                <div style={{ display:'flex', flexWrap:'wrap', gap:'4px 8px' }}>
                                                    {[...statusHist].reverse().map((entry, i) => {
                                                        const c = STATUS_CHIP_COLORS[entry.status] || { bg:'rgba(100,116,139,0.08)', text:'#475569', border:'rgba(100,116,139,0.3)' };
                                                        return (
                                                            <span key={i} style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:'10px' }}>
                                                                <span style={{ color:'#888', fontFamily:'monospace' }}>{entry.date}</span>
                                                                <span style={{ backgroundColor:c.bg, color:c.text, border:`1px solid ${c.border}`, padding:'0 5px', fontWeight:700 }}>{entry.status}</span>
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })()}

                        {/* 푸터 */}
                        <div style={{ borderTop:'1.5px solid #c4ccd8', padding:'10px 18px', display:'flex', justifyContent:'flex-end', gap:8, flexShrink:0, backgroundColor:'#f8fafc' }}>
                            <button onClick={() => setDetailRow(null)}
                                style={{ padding:'8px 22px', backgroundColor:'#f1f5f9', border:'1px solid #c4ccd8', fontSize:'13px', fontWeight:700, color:'#555', cursor:'pointer' }}>
                                닫기
                            </button>
                            <button onClick={onSave}
                                style={{ padding:'8px 22px', backgroundColor:'#1e7ac8', border:'none', fontSize:'13px', fontWeight:700, color:'#fff', cursor:'pointer' }}>
                                저장
                            </button>
                        </div>
                    </div>
                </div>
    );
}
