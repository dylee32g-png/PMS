import React from 'react';
import { LayoutList, X, Clock } from 'lucide-react';
import { isStatusCol, isAssigneeCol, isDateCol, STATUS_CHIP_COLORS, DEFAULT_STATUS_OPTIONS, ASSIGNEE_LIST, toDateInputVal, normalizeStatus, isCheckCol } from './projectColumns';

// ─────────────────────────────────────────────────────────────────────────
// 프로젝트 List — 상세 보기 / 수정 팝업
// ProjectListScreen.jsx에서 분리 (2026-06-25, 코드 분리 3조각 = 상세팝업)
// 저장 로직(saveDetailRow)은 부모에 그대로 두고 onSave 로 받음. 이 파일은 화면만 그림.
// ⑧ Hold/HOLD 표기 통일: 상태 표시에 normalizeStatus 적용 (표시만, 데이터 불변)
// 2026-06-29: 묶음(activeColGroups)별 섹션 재구성 — 묶음 제목 줄 + 같은 묶음 가로 배치 + 라벨 너비 정리.
//   · 항목 순서는 엑셀(activeColGroups) 그대로 유지 (엑셀 우선 원칙).
//   · 묶음 없는 단독 항목은 모아서 2열, 묶음(공사진행 등)은 3열 + 제목 줄.
//   · colGroups에 안 잡힌 항목은 '기타'로 모아 누락 방지.
// ─────────────────────────────────────────────────────────────────────────
export default function DetailModal({ detailRow, setDetailRow, onSave, mainVisibleHeaders, activeHeaders, activeColGroups, hiddenCols, onToggleCol }) {
    if (!detailRow) return null;

    // ── 전체폭(한 줄 통째) 차지 판정: 내용·내역·비고·참조·프로젝트명 = 긴 텍스트 ──
    const isWideField = (h) => !isDateCol(h) && (/내용|내역|비고|참조/.test(h) || /project|프로젝트/i.test(h));
    const isInternal  = (h) => String(h).startsWith('_'); // _pid 등 내부 필드는 화면에서 제외
    // 공사진행 % 칸(포인트 제외) — 표시: 숫자에 % 자동 / 입력: 숫자만. 메인표와 동일 (2026-06-29 팀장님)
    const isPctCol = (h) => { const s = String(h).replace(/\s/g,''); if (s.includes('포인트') || /point/i.test(s)) return false; return ['도면입수','I/OMap','IOMap','화면작성','기준정보','PLC','ETOS','HMI','시운전'].some(k => s.includes(k)); };
    const pctDisplay = (h, val) => { if (!isPctCol(h)) return val; const s = String(val ?? '').trim(); if (!s || s.endsWith('%')) return s; return /^-?\d+(\.\d+)?$/.test(s) ? s + '%' : s; };

    // ── 묶음 섹션 빌드 (엑셀 순서 그대로) ──
    //   label 있는 묶음 = 제목 줄 + 3열, 묶음 없는 단독들은 모아 2열.
    const sections = [];
    let soloBuf = [];
    const flushSolo = () => { if (soloBuf.length) { sections.push({ label: null, isGroup: false, cols: soloBuf }); soloBuf = []; } };
    (activeColGroups || []).forEach(g => {
        const cols = (g.cols || []).filter(h => !isInternal(h));
        if (!cols.length) return;
        if (g.label && g.label.trim()) { flushSolo(); sections.push({ label: g.label.trim(), isGroup: true, cols }); }
        else soloBuf.push(...cols);
    });
    flushSolo();
    // colGroups에 안 잡힌 항목 누락 방지 → '기타'로 모음 (묶음 정보가 아예 없으면 제목 없이 2열)
    const covered = new Set();
    (activeColGroups || []).forEach(g => (g.cols || []).forEach(c => covered.add(c)));
    const leftovers = (activeHeaders || []).filter(h => !isInternal(h) && !covered.has(h));
    if (leftovers.length) sections.push({ label: sections.length ? '기타' : null, isGroup: false, cols: leftovers });

    // ── 한 필드(라벨 + 입력칸 + 메인표 표시토글) 렌더 ──
    const renderField = (h) => {
        const val = detailRow[h] || '';
        const wide = isWideField(h);
        const isStatus = isStatusCol(h);
        const isAssignee = isAssigneeCol(h);
        const isCheck = isCheckCol(h);
        const hidden = hiddenCols?.has(h);
        return (
            <div key={h} style={{ gridColumn: wide ? '1 / -1' : undefined, display:'flex', border:'1px solid #e5eaf3', backgroundColor:'#fff', minWidth:0 }}>
                <div style={{ minWidth:'56px', flexShrink:0, backgroundColor: hidden ? '#f1f5f9' : '#eef2fb', borderRight:'1px solid #d8dfee', padding:'6px 9px', fontSize:'11px', fontWeight:700, color: hidden ? '#9aa6bb' : '#4a5a80', display:'flex', alignItems:'center', gap:4 }}>
                    <span style={{ whiteSpace:'nowrap' }} title={h}>{h}</span>
                    {isStatus && <span style={{ fontSize:'9px', color:'#1e7ac8', fontWeight:800 }}>▼</span>}
                    {isAssignee && <span style={{ fontSize:'9px', color:'#059669', fontWeight:800 }}>▼</span>}
                    {onToggleCol && (
                        <button type="button" onClick={(e) => { e.stopPropagation(); onToggleCol(h); }}
                            title={hidden ? '메인표에서 숨김 — 누르면 표시' : '메인표에 표시 중 — 누르면 숨김'}
                            style={{ flexShrink:0, width:'22px', height:'13px', borderRadius:'7px', border:'none', cursor:'pointer', position:'relative', padding:0,
                                backgroundColor: hidden ? '#cbd5e1' : '#1e7ac8' }}>
                            <span style={{ position:'absolute', top:'2px', left: hidden ? '2px' : '11px', width:'9px', height:'9px', borderRadius:'50%', backgroundColor:'#fff' }}/>
                        </button>
                    )}
                </div>
                <div style={{ flex:1, minWidth:0, padding:'1px 0', display:'flex', alignItems:'stretch' }}>
                    {isCheck ? (
                        <button type="button"
                            onClick={() => setDetailRow(p => ({...p, [h]: (String(val).toUpperCase()==='O' ? '' : 'O')}))}
                            style={{ width:'100%', border:'none', outline:'none', padding:'4px 9px', fontSize:'13px', fontWeight:700, backgroundColor:'transparent', fontFamily:'inherit', cursor:'pointer', textAlign:'left', color: String(val).toUpperCase()==='O' ? '#047857' : '#aaa' }}>
                            {String(val).toUpperCase()==='O' ? '☑ O (제출)' : '☐ 미제출'}
                        </button>
                    ) : isStatus ? (
                        <select value={normalizeStatus(val)}
                            onChange={e => setDetailRow(p => ({...p, [h]: e.target.value}))}
                            style={{ width:'100%', border:'none', outline:'none', padding:'4px 8px', fontSize:'12px', color:'#222', backgroundColor:'transparent', fontFamily:'inherit', cursor:'pointer' }}>
                            <option value="">—</option>
                            {DEFAULT_STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    ) : isAssignee ? (
                        <select value={val}
                            onChange={e => setDetailRow(p => ({...p, [h]: e.target.value}))}
                            style={{ width:'100%', border:'none', outline:'none', padding:'4px 8px', fontSize:'12px', color:'#222', backgroundColor:'transparent', fontFamily:'inherit', cursor:'pointer' }}>
                            <option value="">—</option>
                            {ASSIGNEE_LIST.map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                    ) : isDateCol(h) ? (
                        <input type="date" value={toDateInputVal(val)}
                            onChange={e => setDetailRow(p => ({...p, [h]: e.target.value}))}
                            style={{ width:'100%', border:'none', outline:'none', padding:'4px 8px', fontSize:'12px', color:'#222', backgroundColor:'transparent', fontFamily:'inherit' }}/>
                    ) : isPctCol(h) ? (
                        <div style={{ width:'100%', display:'flex', alignItems:'center' }}>
                            <input type="text" inputMode="numeric" value={String(val).replace(/%/g,'')}
                                onChange={e => setDetailRow(p => ({...p, [h]: e.target.value.replace(/[^0-9.]/g,'')}))}
                                style={{ flex:1, minWidth:0, border:'none', outline:'none', padding:'4px 8px', fontSize:'12px', color:'#222', backgroundColor:'transparent', fontFamily:'inherit' }}
                                onFocus={e => e.target.parentElement.style.backgroundColor='#fffde7'}
                                onBlur={e => e.target.parentElement.style.backgroundColor='transparent'}/>
                            {String(val).trim() !== '' && <span style={{ paddingRight:8, fontSize:'12px', color:'#888' }}>%</span>}
                        </div>
                    ) : (
                        <textarea value={val}
                            onChange={e => setDetailRow(p => ({...p, [h]: e.target.value}))}
                            rows={wide ? 2 : 1}
                            style={{ width:'100%', border:'none', outline:'none', resize:'none', padding:'4px 8px', fontSize:'12px', color:'#222', backgroundColor:'transparent', fontFamily:'inherit', lineHeight:1.5 }}
                            onFocus={e => e.target.style.backgroundColor='#fffde7'}
                            onBlur={e => e.target.style.backgroundColor='transparent'}/>
                    )}
                </div>
            </div>
        );
    };

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
                                    const sv = normalizeStatus(val);
                                    return (
                                        <span key={h} style={{ fontSize:'11px' }}>
                                            <span style={{ fontWeight:700, color:'#666' }}>{h}: </span>
                                            <span style={{ color:'#222' }}>{sv}</span>
                                        </span>
                                    );
                                }
                                return (
                                    <span key={h} style={{ fontSize:'11px' }}>
                                        <span style={{ fontWeight:700, color:'#666' }}>{h}: </span>
                                        <span style={{ color:'#222' }}>{pctDisplay(h, val)}</span>
                                    </span>
                                );
                            })}
                        </div>

                        {/* 전체 필드 편집 — 묶음별 섹션 (제목 줄 + 같은 묶음 가로 배치) */}
                        <div className="overflow-y-auto flex-1 custom-scrollbar" style={{ padding:'14px 18px', display:'flex', flexDirection:'column', gap:14 }}>
                            {sections.map((sec, si) => (
                                <div key={si}>
                                    {sec.label && (
                                        <div style={{ fontSize:'12px', fontWeight:800, color:'#1e7ac8', borderBottom:'1.5px solid #cfe0f2', padding:'0 2px 4px', marginBottom:7 }}>
                                            {sec.label}
                                        </div>
                                    )}
                                    <div style={{ display:'grid', gridTemplateColumns: sec.isGroup ? 'repeat(3, minmax(0,1fr))' : 'repeat(2, minmax(0,1fr))', gap:6 }}>
                                        {sec.cols.map(h => renderField(h))}
                                    </div>
                                </div>
                            ))}
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
