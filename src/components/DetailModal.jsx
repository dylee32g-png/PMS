import React from 'react';
import { LayoutList, Plus, X, Clock } from 'lucide-react';
import { isStatusCol, isAssigneeCol, isManagerCol, isDateCol, isClientCol, isVendorAssCol, STATUS_CHIP_COLORS, DEFAULT_STATUS_OPTIONS, ASSIGNEE_LIST, toDateInputVal, normalizeStatus, isCheckCol, isRefCol, buildUncPath, extractName, normalizeAssignee, toExcelAssignee, splitAssigneeCell } from './projectColumns';

// ─────────────────────────────────────────────────────────────────────────
// 프로젝트 List — 상세 보기 / 수정 팝업  +  프로젝트 추가 팝업 (2026-07-13 통합)
// ProjectListScreen.jsx에서 분리 (2026-06-25, 코드 분리 3조각 = 상세팝업)
// 저장 로직(saveDetailRow / saveAddingRow)은 부모에 두고 onSave 로 받음. 이 파일은 화면만 그림.
// ⑧ Hold/HOLD 표기 통일: 상태 표시에 normalizeStatus 적용 (표시만, 데이터 불변)
// 2026-06-29: 묶음(activeColGroups)별 섹션 재구성 — 묶음 제목 줄 + 같은 묶음 가로 배치 + 라벨 너비 정리.
//   · 항목 순서는 엑셀(activeColGroups) 그대로 유지 (엑셀 우선 원칙).
// 2026-07-10: 모든 섹션 2열 통일 + 라벨 고정폭 + 행높이 통일(토글은 행 오른쪽).
// 2026-07-13: mode='add' 지원 — 프로젝트 추가 팝업이 같은 틀·같은 폭을 쓰도록 통합(옛 1열 640px 폼 폐기).
//   · 진행현황/담당자 목록은 부모(teamSettings 마스터)에서 props로 받음 — 추가·수정 팝업 모두 팀 설정 반영.
//   · 등록일(_regDate): 프로젝트 추가 시 자동 기입되는 내부 필드. 두 팝업 모두 '등록 정보' 섹션에 읽기전용 표시.
// ─────────────────────────────────────────────────────────────────────────
export default function DetailModal({
    detailRow, setDetailRow, onSave,
    mainVisibleHeaders = [], activeHeaders, activeColGroups,
    hiddenCols, onToggleCol, currentTeam,
    mode = 'edit',            // 'edit' = 상세 보기/수정, 'add' = 프로젝트 추가
    statusOptions, assignees, // 팀 마스터 목록(없으면 기본값 폴백)
    copiedFromRow = false,    // 추가 모드: 선택 행 복사로 열렸는지
    suggestions = {},         // { 항목명: [기존값들] } — 발주처·업체담당자 자동완성 목록
    subPtInfo = null,         // 2단계(2026-07-20): 메인 행에 하위(공종)가 있으면 {count, sum} — '포인트' 칸 잠금+합계 표시
    extLockedCols = [],       // NAS 진척자료 자동 반영 대상 헤더들 (2026-07-22) — 보기 전용, 수정은 NAS 원본 엑셀
    execLockedCols = [],      // 수행번호(당해 연도) — 손 키인 금지, 메인표 [+]/✕로만 (2026-08-28 팀장님)
}) {
    const [copiedRef, setCopiedRef] = React.useState(false);
    const [asgOpen, setAsgOpen] = React.useState(null);   // 담당자 다중 선택 펼침 항목 (2026-07-28 팀장님)
    if (!detailRow) return null;
    const isAdd = mode === 'add';
    const isExtLockedDM = (h) => (extLockedCols || []).some(t => String(t ?? '').replace(/\s+/g, '').toUpperCase() === String(h ?? '').replace(/\s+/g, '').toUpperCase());   // NAS 자동 칸 (2026-07-22)
    const isExecLockedDM = (h) => (execLockedCols || []).some(t => String(t ?? '').replace(/\s+/g, '') === String(h ?? '').replace(/\s+/g, ''));   // 수행번호 자동 부여 칸 (2026-08-28)

    // 팀 마스터 목록 우선(진행현황 관리 / 담당자 관리) — 없으면 기본 상수
    const STATUS_OPTS   = (statusOptions && statusOptions.length) ? statusOptions : DEFAULT_STATUS_OPTIONS;
    const ASSIGNEE_OPTS = (assignees && assignees.length) ? assignees : ASSIGNEE_LIST;
    // 목록에 없는 기존 값도 사라지지 않게 현재 값을 합쳐서 보여줌 (데이터 보존)
    const withCurrent = (list, val) => {
        const v = String(val ?? '').trim();
        return (!v || list.includes(v)) ? list : [...list, v];
    };

    // ⑥ 참조 UNC 경로 복사 — 폴더명 앞에 팀 서버주소를 붙여 클립보드로. 탐색기 주소창 붙여넣기용 (2026-07-08)
    const copyUncPath = (folderName) => {
        const path = buildUncPath(currentTeam, folderName);
        if (!path) return;
        const done = () => { setCopiedRef(true); setTimeout(() => setCopiedRef(false), 1500); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(path).then(done).catch(done);
        else done();
    };

    // ── 전체폭(한 줄 통째) 차지 판정: 내용·내역·비고·참조·프로젝트명 = 긴 텍스트 ──
    const isWideField = (h) => { const s = String(h).replace(/\s/g, ''); return !isDateCol(h) && (/내용|내역|비고|참조/.test(s) || /project|프로젝트/i.test(s)); };
    const isInternal  = (h) => String(h).startsWith('_'); // _pid·_regDate 등 내부 필드는 일반 필드 목록에서 제외
    // 공사진행 % 칸(포인트 제외) — 표시: 숫자에 % 자동 / 입력: 숫자만. 메인표와 동일 (2026-06-29 팀장님)
    const isPctCol = (h) => { const s = String(h).replace(/\s/g,''); if (s.includes('포인트') || /point/i.test(s)) return false; return ['도면입수','I/OMap','IOMap','화면작성','기준정보','PLC','ETOS','HMI','시운전'].some(k => s.includes(k)); };
    // 포인트(총점) 칸 판별 — 메인표 isPointCol과 동일 규칙 (2026-07-20 2단계)
    const isPointColDM = (h) => { const s = String(h).replace(/\s/g,''); return s === '포인트' || /^point$/i.test(s); };
    const pctDisplay = (h, val) => { if (!isPctCol(h)) return val; const s = String(val ?? '').trim(); if (!s || s.endsWith('%')) return s; return /^-?\d+(\.\d+)?$/.test(s) ? s + '%' : s; };

    // ── 묶음 섹션 빌드 (엑셀 순서 그대로) ──
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
    // colGroups에 안 잡힌 항목 누락 방지 → '기타'로 모음
    const covered = new Set();
    (activeColGroups || []).forEach(g => (g.cols || []).forEach(c => covered.add(c)));
    const leftovers = (activeHeaders || []).filter(h => !isInternal(h) && !covered.has(h));
    if (leftovers.length) sections.push({ label: sections.length ? '기타' : null, isGroup: false, cols: leftovers });

    // ── 공통 스타일 (한 필드 = 라벨칸 + 값칸, 높이 34px 고정) ──
    const fieldBox = { display:'flex', alignItems:'stretch', minHeight:'34px', border:'1px solid #e5eaf3', backgroundColor:'#fff', minWidth:0 };
    const labelBox = (hidden) => ({ width:'116px', minWidth:'116px', maxWidth:'116px', flexShrink:0, backgroundColor: hidden ? '#f1f5f9' : '#eef2fb', borderRight:'1px solid #d8dfee', padding:'6px 9px', fontSize:'11px', fontWeight:700, color: hidden ? '#9aa6bb' : '#4a5a80', display:'flex', alignItems:'center', gap:4 });
    const grid2    = { display:'grid', gridTemplateColumns:'repeat(2, minmax(0,1fr))', gap:6 };

    // ── 한 필드(라벨 + 입력칸 + 메인표 표시토글) 렌더 ──
    const renderField = (h) => {
        const val = detailRow[h] || '';
        const wide = isWideField(h);
        const isStatus = isStatusCol(h);
        const isAssignee = isAssigneeCol(h) || isManagerCol(h);   // 관리자 = 담당자와 같은 선택 형식 (2026-07-22)
        const isCheck = isCheckCol(h);
        const hidden = hiddenCols?.has(h);
        return (
            <div key={h} style={{ gridColumn: wide ? '1 / -1' : undefined, ...fieldBox }}>
                {/* 라벨(고정폭·한 줄). 메인표 토글은 행 오른쪽 끝 → 라벨이 좁아도 이름이 한 줄에 들어가 행 높이 일정 (2026-07-10) */}
                <div style={labelBox(hidden)}>
                    <span style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', flex:1, minWidth:0 }} title={h}>{h}</span>
                    {isStatus && <span style={{ fontSize:'9px', color:'#1e7ac8', fontWeight:800, flexShrink:0 }}>▼</span>}
                    {isAssignee && <span style={{ fontSize:'9px', color:'#059669', fontWeight:800, flexShrink:0 }}>▼</span>}
                </div>
                <div style={{ flex:1, minWidth:0, padding:'1px 0', display:'flex', alignItems:'center' }}>
                    {(subPtInfo && isPointColDM(h)) ? (
                        // 2단계(2026-07-20): 하위(공종) 있는 메인 행의 총점 = 하위 합계 자동 → 이 칸 잠금(읽기전용)
                        <div style={{ width:'100%', display:'flex', alignItems:'center', gap:8, padding:'4px 8px' }}
                            title={subPtInfo.sum > 0 ? `총점 = 하위 ${subPtInfo.count}개 '포인트' 합계 (자동)` : `하위 ${subPtInfo.count}개의 총점이 아직 빈칸 — 입력 전까지 기존 부모 총점 유지`}>
                            <span style={{ fontSize:'12px', fontWeight:800, color:'#1e293b' }}>{subPtInfo.sum > 0 ? `Σ ${subPtInfo.sum}` : (String(val).trim() ? val : '—')}</span>
                            <span style={{ fontSize:'11px', fontWeight:700, color:'#7c3aed', whiteSpace:'nowrap' }}>하위 {subPtInfo.count}개 합계 자동{subPtInfo.sum > 0 ? '' : ' 대기'}</span>
                            <span style={{ marginLeft:'auto', fontSize:'11px', color:'#94a3b8', flexShrink:0 }}>🔒 잠금</span>
                        </div>
                    ) : isExecLockedDM(h) ? (
                        // 수행번호 (2026-08-28 팀장님): 손 키인 금지 — 메인표 빈칸의 [+]로 다음 번호 자동 부여, ✕로 회수
                        <div style={{ width:'100%', display:'flex', alignItems:'center', gap:8, padding:'4px 8px' }}
                            title="수행번호는 손으로 키인하지 않습니다 — 메인표 빈칸의 [+] = 다음 번호 자동 부여, ✕ = 회수">
                            <span style={{ fontSize:'12px', fontWeight:800, color:'#1e293b' }}>{String(val).trim() !== '' ? val : '—'}</span>
                            <span style={{ fontSize:'11px', fontWeight:700, color:'#1e7ac8', whiteSpace:'nowrap' }}>메인표 [+]로 자동 부여</span>
                            <span style={{ marginLeft:'auto', fontSize:'11px', color:'#94a3b8', flexShrink:0 }}>🔒 잠금</span>
                        </div>
                    ) : isExtLockedDM(h) ? (
                        // NAS 진척자료 자동 반영 값 (2026-07-22) — 보기 전용, 수정은 NAS 원본 엑셀에서
                        <div style={{ width:'100%', display:'flex', alignItems:'center', gap:8, padding:'4px 8px' }}
                            title="NAS 진척자료에서 자동으로 들어오는 값 — 수정은 NAS 원본 엑셀에서">
                            <span style={{ fontSize:'12px', fontWeight:800, color:'#1e293b' }}>{String(val).trim() !== '' ? String(val).replace(/%/g,'') + '%' : '—'}</span>
                            <span style={{ fontSize:'11px', fontWeight:700, color:'#0369a1', whiteSpace:'nowrap' }}>NAS 자동</span>
                            <span style={{ marginLeft:'auto', fontSize:'11px', color:'#94a3b8', flexShrink:0 }}>🔒 잠금</span>
                        </div>
                    ) : isCheck ? (
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
                            {withCurrent(STATUS_OPTS, normalizeStatus(val)).map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    ) : isAssignee ? (
                        <div style={{ width:'100%' }}>
                            <button type="button" onClick={() => setAsgOpen(asgOpen === h ? null : h)}
                                title="클릭하여 담당자 선택 — 여러 명 가능"
                                style={{ width:'100%', border:'none', outline:'none', padding:'4px 8px', fontSize:'12px', color: String(val).trim() ? '#222' : '#aaa', backgroundColor:'transparent', fontFamily:'inherit', cursor:'pointer', textAlign:'left' }}>
                                {String(val).trim() || '— 클릭하여 선택'}
                            </button>
                            {asgOpen === h && (
                                <div style={{ display:'flex', flexWrap:'wrap', gap:4, padding:'6px 8px 8px', borderTop:'1px dashed #dbe3ee' }}>
                                    {ASSIGNEE_OPTS.map(a => {
                                        const parts = splitAssigneeCell(val);
                                        const on = parts.some(p => extractName(normalizeAssignee(p)) === extractName(normalizeAssignee(a)));
                                        return (
                                            <button key={a} type="button"
                                                onClick={() => { const next = on ? parts.filter(p => extractName(normalizeAssignee(p)) !== extractName(normalizeAssignee(a))) : [...parts, toExcelAssignee(a)]; setDetailRow(pr => ({ ...pr, [h]: next.join(' ') })); }}
                                                style={{ padding:'3px 9px', borderRadius:12, fontSize:'11px', fontWeight:700, cursor:'pointer', border:'1px solid ' + (on ? '#059669' : '#cbd5e1'), backgroundColor: on ? '#059669' : '#fff', color: on ? '#fff' : '#475569' }}>
                                                {on ? '✓ ' : ''}{toExcelAssignee(a)}
                                            </button>
                                        );
                                    })}
                                    <button type="button" onClick={() => setAsgOpen(null)}
                                        style={{ padding:'3px 9px', borderRadius:12, fontSize:'11px', fontWeight:700, cursor:'pointer', border:'1px solid #94a3b8', backgroundColor:'#f1f5f9', color:'#475569' }}>접기 ▲</button>
                                </div>
                            )}
                        </div>
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
                    ) : isRefCol(h) ? (
                        <div style={{ width:'100%', display:'flex', alignItems:'center', gap:6 }}>
                            <input type="text" value={val}
                                onChange={e => setDetailRow(p => ({...p, [h]: e.target.value}))}
                                placeholder="폴더명"
                                style={{ flex:1, minWidth:0, border:'none', outline:'none', padding:'4px 8px', fontSize:'12px', color:'#222', backgroundColor:'transparent', fontFamily:'inherit' }}
                                onFocus={e => e.target.parentElement.style.backgroundColor='#fffde7'}
                                onBlur={e => e.target.parentElement.style.backgroundColor='transparent'}/>
                            <button type="button" onClick={() => copyUncPath(val)}
                                disabled={!String(val).trim() || !buildUncPath(currentTeam, val)}
                                title={buildUncPath(currentTeam, val) ? '폴더 전체경로(UNC)를 클립보드에 복사 — 탐색기 주소창에 붙여넣기' : (String(val).trim() ? currentTeam + '는 경로가 아직 등록 안 됨' : '폴더명을 먼저 입력하세요')}
                                style={{ flexShrink:0, marginRight:6, padding:'3px 8px', fontSize:'11px', fontWeight:700, borderRadius:5, border:'1px solid', cursor:'pointer',
                                    ...(copiedRef ? {background:'#059669',color:'#fff',borderColor:'#059669'} : (!String(val).trim() || !buildUncPath(currentTeam, val)) ? {background:'#f1f5f9',color:'#aebbc9',borderColor:'#e2e8f0',cursor:'not-allowed'} : {background:'#eaf2fb',color:'#1358a0',borderColor:'#bcd6f0'}) }}>
                                {copiedRef ? '✓ 복사됨' : '경로 복사'}
                            </button>
                        </div>
                    ) : (isClientCol(h) || isVendorAssCol(h)) && (suggestions[h] || []).length ? (
                        // 발주처·업체담당자 — 기존 입력값 자동완성(직접 입력도 가능). 옛 추가 팝업 기능 유지 (2026-07-13)
                        <div style={{ width:'100%', display:'flex', alignItems:'center' }}>
                            <input type="text" list={`dm-dl-${h}`} value={val}
                                onChange={e => setDetailRow(p => ({...p, [h]: e.target.value}))}
                                style={{ flex:1, minWidth:0, border:'none', outline:'none', padding:'4px 8px', fontSize:'12px', color:'#222', backgroundColor:'transparent', fontFamily:'inherit' }}
                                onFocus={e => e.target.parentElement.style.backgroundColor='#fffde7'}
                                onBlur={e => e.target.parentElement.style.backgroundColor='transparent'}/>
                            <datalist id={`dm-dl-${h}`}>
                                {(suggestions[h] || []).map(o => <option key={o} value={o}/>)}
                            </datalist>
                        </div>
                    ) : (
                        <textarea value={val}
                            onChange={e => setDetailRow(p => ({...p, [h]: e.target.value}))}
                            rows={1}
                            style={{ width:'100%', border:'none', outline:'none', resize:'none', padding:'4px 8px', fontSize:'12px', color:'#222', backgroundColor:'transparent', fontFamily:'inherit', lineHeight:1.5 }}
                            onFocus={e => e.target.style.backgroundColor='#fffde7'}
                            onBlur={e => e.target.style.backgroundColor='transparent'}/>
                    )}
                </div>
                {/* 오른쪽 토글: 공정/시운전 9칸 = 이 프로젝트 적용/미적용(_naItems·메인표 ×) · 그 외 = 메인표 표시/숨김(팀 공통) (2026-07-21) */}
                {isPctCol(h) ? (
                    <div style={{ flexShrink:0, display:'flex', alignItems:'center', gap:5, padding:'0 9px', borderLeft:'1px solid #eef1f6' }}>
                        <span style={{ fontSize:'10px', fontWeight:700, whiteSpace:'nowrap', color: naItems.includes(h) ? '#b0b8c4' : '#1e7ac8' }}>{naItems.includes(h) ? '미적용' : '적용'}</span>
                        <button type="button" onClick={(e) => { e.stopPropagation(); toggleNa(h); }}
                            title={naItems.includes(h) ? '이 프로젝트엔 미적용 — 누르면 적용' : '이 프로젝트에 적용 중 — 누르면 미적용(메인표 ×)'}
                            style={{ flexShrink:0, width:'22px', height:'13px', borderRadius:'7px', border:'none', cursor:'pointer', position:'relative', padding:0,
                                backgroundColor: naItems.includes(h) ? '#cbd5e1' : '#1e7ac8' }}>
                            <span style={{ position:'absolute', top:'2px', left: naItems.includes(h) ? '2px' : '11px', width:'9px', height:'9px', borderRadius:'50%', backgroundColor:'#fff' }}/>
                        </button>
                    </div>
                ) : onToggleCol ? (
                    <div style={{ flexShrink:0, display:'flex', alignItems:'center', padding:'0 9px', borderLeft:'1px solid #eef1f6' }}>
                        <button type="button" onClick={(e) => { e.stopPropagation(); onToggleCol(h); }}
                            title={hidden ? '메인표에서 숨김 — 누르면 표시' : '메인표에 표시 중 — 누르면 숨김'}
                            style={{ flexShrink:0, width:'22px', height:'13px', borderRadius:'7px', border:'none', cursor:'pointer', position:'relative', padding:0,
                                backgroundColor: hidden ? '#cbd5e1' : '#1e7ac8' }}>
                            <span style={{ position:'absolute', top:'2px', left: hidden ? '2px' : '11px', width:'9px', height:'9px', borderRadius:'50%', backgroundColor:'#fff' }}/>
                        </button>
                    </div>
                ) : null}
            </div>
        );
    };

    // ── 등록 정보 섹션 — 등록일(_regDate): 프로젝트 추가 시 자동 기입, 읽기전용 (2026-07-13) ──
    const regDate = String(detailRow._regDate || '').trim();
    const renderRegSection = () => (
        <div>
            <div style={{ fontSize:'12px', fontWeight:800, color:'#1e7ac8', borderBottom:'1.5px solid #cfe0f2', padding:'0 2px 4px', marginBottom:7 }}>
                등록 정보
            </div>
            <div style={grid2}>
                <div style={fieldBox}>
                    <div style={labelBox(false)}>
                        <span style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', flex:1, minWidth:0 }}>등록일</span>
                    </div>
                    <div style={{ flex:1, minWidth:0, display:'flex', alignItems:'center', gap:6, padding:'4px 8px', fontSize:'12px', color: regDate ? '#222' : '#9aa6bb' }}>
                        <span>{regDate || '—'}</span>
                        <span style={{ fontSize:'10px', fontWeight:700, color:'#9aa6bb', backgroundColor:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:4, padding:'0 5px' }}>
                            {isAdd ? '자동 기입 · 수정 불가' : '수정 불가'}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );

    // 프로젝트별 적용/미적용 (2026-07-21): 공정/시운전 칸 오른쪽 토글 = 이 프로젝트에 그 항목 적용 여부.
    //   off(미적용) = _naItems(헤더명 배열)에 추가 → 메인표 회색 ×, (2단계) 진척률·그래프서 제외.
    // (naItems·toggleNa는 missingProgItems 계산 뒤에 정의 — 기본 미적용 규칙 적용, 아래 참조)
    // 엑셀에 열이 없는 진행 항목 — '공사 진행' 섹션 끝에 값칸 없는 적용/미적용 토글 줄로 표시 (2026-07-21 팀장님)
    //   저장 이름 = 진행실적 설정키와 매칭되는 표준 표기('기준정보' 등) → naToProgressItems가 그대로 인식(계산 제외 연동).
    const PROG_ALL_ITEMS = ['도면입수', 'I/O Map', '화면작성', '기준정보', 'PLC', 'ETOS', 'HMI', '자체시운전', '통합시운전'];
    const _npNorm = (v) => String(v ?? '').replace(/\s+/g, '').toUpperCase();
    const missingProgItems = PROG_ALL_ITEMS.filter(name =>
        !(activeHeaders || []).some(h => !isInternal(h) && _npNorm(h).includes(_npNorm(name))));
    const isProgSec = (sec) => !!(sec && sec.label) && _npNorm(sec.label).includes('공사진행');
    // ★ 기본 미적용 (2026-07-21 팀장님): 엑셀에 열 없는 항목(missingProgItems)은 전 프로젝트 기본 off.
    //   켜면 _naOn(예외 목록)에 저장. 엑셀 열 있는 항목은 기존대로 _naItems(끈 목록)에 저장.
    const _exNa = Array.isArray(detailRow._naItems) ? detailRow._naItems : [];
    const _exOn = Array.isArray(detailRow._naOn) ? detailRow._naOn : [];
    const naItems = [...new Set([..._exNa, ...missingProgItems.filter(n => !_exOn.includes(n))])];
    const toggleNa = (h) => setDetailRow(p => {
        const ex = Array.isArray(p._naItems) ? p._naItems : [];
        const on = Array.isArray(p._naOn) ? p._naOn : [];
        const defOff = missingProgItems.includes(h);
        const isOff = ex.includes(h) || (defOff && !on.includes(h));
        if (isOff) return { ...p, _naItems: ex.filter(x => x !== h), _naOn: defOff ? [...new Set([...on, h])] : on };
        return { ...p, _naItems: defOff ? ex : [...new Set([...ex, h])], _naOn: on.filter(x => x !== h) };
    });
    const renderNaOnlyField = (name) => {
        const off = naItems.includes(name);
        return (
            <div key={'na-' + name} style={fieldBox}>
                <div style={labelBox(off)}>
                    <span style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', flex:1, minWidth:0 }} title={name}>{name}</span>
                </div>
                <div style={{ flex:1, minWidth:0, display:'flex', alignItems:'center', padding:'4px 8px' }}>
                    <span style={{ fontSize:'11px', color:'#9aa6bb' }}>주간 키인 전용 · 메인표 열 없음</span>
                </div>
                <div style={{ flexShrink:0, display:'flex', alignItems:'center', gap:5, padding:'0 9px', borderLeft:'1px solid #eef1f6' }}>
                    <span style={{ fontSize:'10px', fontWeight:700, whiteSpace:'nowrap', color: off ? '#b0b8c4' : '#1e7ac8' }}>{off ? '미적용' : '적용'}</span>
                    <button type="button" onClick={(e) => { e.stopPropagation(); toggleNa(name); }}
                        title={off ? '이 프로젝트엔 미적용 — 누르면 적용' : '이 프로젝트에 적용 중 — 누르면 미적용(진척률서 제외)'}
                        style={{ flexShrink:0, width:'22px', height:'13px', borderRadius:'7px', border:'none', cursor:'pointer', position:'relative', padding:0,
                            backgroundColor: off ? '#cbd5e1' : '#1e7ac8' }}>
                        <span style={{ position:'absolute', top:'2px', left: off ? '2px' : '11px', width:'9px', height:'9px', borderRadius:'50%', backgroundColor:'#fff' }}/>
                    </button>
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
                                {isAdd ? <Plus size={15} style={{ color:'#fff' }}/> : <LayoutList size={15} style={{ color:'#fff' }}/>}
                                <span style={{ color:'#fff', fontWeight:800, fontSize:'14px' }}>{isAdd ? '프로젝트 추가' : '상세 보기 / 수정'}</span>
                                {!isAdd && (detailRow['번호'] || detailRow['Project'] || detailRow['프로젝트']) && (
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

                        {/* 안내 바 — 추가: 선택 행 복사 안내 / 수정: 주요 열 요약 */}
                        {isAdd ? (
                            copiedFromRow && (
                                <div style={{ backgroundColor:'#e8f0fe', borderBottom:'1.5px solid #c4ccd8', padding:'7px 18px', fontSize:'11px', color:'#1e7ac8', fontWeight:700, flexShrink:0 }}>
                                    선택한 행의 데이터를 초기값으로 복사했습니다. 수정 후 저장하세요.
                                </div>
                            )
                        ) : (
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
                        )}

                        {/* 전체 필드 편집 — 등록 정보 + 묶음별 섹션 (제목 줄 + 2열 통일) */}
                        <div className="overflow-y-auto flex-1 custom-scrollbar" style={{ padding:'14px 18px', display:'flex', flexDirection:'column', gap:14 }}>
                            {renderRegSection()}
                            {sections.map((sec, si) => (
                                <div key={si}>
                                    {sec.label && (
                                        <div style={{ fontSize:'12px', fontWeight:800, color:'#1e7ac8', borderBottom:'1.5px solid #cfe0f2', padding:'0 2px 4px', marginBottom:7 }}>
                                            {sec.label}
                                        </div>
                                    )}
                                    {/* 모든 섹션 2열 통일 (2026-07-10) — 칸 폭 일관성. 긴 항목(내용·Project·참조)만 renderField에서 한 줄 전체 차지 */}
                                    <div style={grid2}>
                                        {sec.cols.map(h => renderField(h))}
                                        {isProgSec(sec) && missingProgItems.map(name => renderNaOnlyField(name))}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* 변경 이력 히스토리 박스 (추가 모드에는 없음) */}
                        {!isAdd && (() => {
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
                                {isAdd ? '취소' : '닫기'}
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
