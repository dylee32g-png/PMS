// WeeklyInputScreen - v1.2.0
// 주간보고 웹 입력 시스템
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Upload, ArrowLeft, ChevronLeft, ChevronRight, FileSpreadsheet,
         RefreshCw, CheckCircle2, Circle, BarChart3, Search } from 'lucide-react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { loadXLSX } from '../utils';

// ─── 상수 ────────────────────────────────────────────────────────────────────
const STAGES = [
    { id: '현장확인',  label: '현장확인',  color: '#818cf8', bg: '#1e1b4b' },
    { id: 'L2확인',    label: 'L2확인',    color: '#38bdf8', bg: '#0c2a3a' },
    { id: '시운전',    label: '시운전',    color: '#34d399', bg: '#022c22' },
    { id: '통합시운전', label: '통합시운전', color: '#fbbf24', bg: '#1c1407' },
];

const TEAMS = ['기술1팀', '기술2팀', '기술3팀', 'Software팀'];

// ─── 날짜 유틸 ───────────────────────────────────────────────────────────────
function getMondayOfWeek(date = new Date()) {
    const d = new Date(date);
    const day = d.getDay();
    d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
    d.setHours(0, 0, 0, 0);
    return d.toISOString().slice(0, 10);
}
function addWeeks(weekOf, n) {
    const d = new Date(weekOf);
    d.setDate(d.getDate() + n * 7);
    return d.toISOString().slice(0, 10);
}
function formatWeekRange(weekOf) {
    const s = new Date(weekOf);
    const e = new Date(weekOf); e.setDate(e.getDate() + 4);
    return `${s.getMonth()+1}/${s.getDate()} ~ ${e.getMonth()+1}/${e.getDate()}`;
}
// ─── Excel 파싱 ───────────────────────────────────────────────────────────────
async function parseTemplateFromExcel(arrayBuffer, fileName) {
    const XLSX = await loadXLSX();
    const wb = XLSX.read(arrayBuffer, { type: 'array', raw: false });
    const categorySheets = wb.SheetNames.filter(n =>
        /^\d+\./.test(n) ||
        ['공조','대기','CDA','SCADA','FFU','만전','화면'].some(k => n.includes(k))
    );
    if (categorySheets.length === 0)
        throw new Error('카테고리 시트를 찾을 수 없습니다.\n"1.공조", "2.대기" 형식의 시트명이 필요합니다.');
    const categories = categorySheets.map(sheetName => {
        const sheet = wb.Sheets[sheetName];
        if (!sheet) return null;
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: false });
        const dataRows = rows.slice(1).filter(r => r?.[4]);
        return {
            id:    sheetName.replace(/[^a-zA-Z0-9가-힣]/g, '_'),
            name:  sheetName,
            items: dataRows.map((r, i) => ({
                id: `item_${i}`,
                name:   String(r[4] ?? '').trim(),
                desc:   String(r[5] ?? '').trim(),
                screen: String(r[6] ?? '').trim(),
            })).filter(it => it.name),
        };
    }).filter(Boolean);
    return { fileName, categories, createdAt: new Date().toISOString() };
}

// ─── 공정율 계산 ─────────────────────────────────────────────────────────────
function calcProgress(category, catEntries = {}) {
    const total = category.items.length;
    return STAGES.map(stage => {
        const done = category.items.filter(it => !!catEntries[it.id]?.[stage.id]).length;
        return { ...stage, done, total, rate: total > 0 ? Math.round(done / total * 1000) / 10 : 0 };
    });
}

// ─── 공용 스타일 ─────────────────────────────────────────────────────────────
const S = {
    page:   { height:'100vh', display:'flex', flexDirection:'column', background:'#020617', color:'white', overflow:'hidden' },
    header: { display:'flex', alignItems:'center', gap:10, padding:'8px 14px',
              background:'#080f1e', borderBottom:'1px solid #1a2540', flexShrink:0 },
};

// ─── 메인 컴포넌트 ───────────────────────────────────────────────────────────
const WeeklyInputScreen = ({ db, teamId: propTeamId, onBack }) => {
    const [selectedTeam, setSelectedTeam] = useState(propTeamId || null);
    const teamId = selectedTeam;
    const [pageMode,  setPageMode]  = useState(propTeamId ? 'loading' : 'teamSelect');
    const [template,  setTemplate]  = useState(null);
    const [weekOf,    setWeekOf]    = useState(getMondayOfWeek());
    const [activeTab, setActiveTab] = useState('summary');
    const [entries,   setEntries]   = useState({});
    const [search,    setSearch]    = useState('');
    const [isSaving,  setIsSaving]  = useState(false);
    const [saveMsg,   setSaveMsg]   = useState('');
    const [isLoading,  setIsLoading]  = useState(false);
    const [alertMsg,   setAlertMsg]   = useState('');
    const [mailCopied,  setMailCopied]  = useState(false);
    const [leftWidth,   setLeftWidth]   = useState(260);
    const fileInputRef  = useRef(null);
    const saveTimerRef  = useRef(null);
    const isDragging    = useRef(false);
    const dragStartX    = useRef(0);
    const dragStartW    = useRef(260);

    // ── 템플릿 로드 ──────────────────────────────────────────────────────────
    useEffect(() => {
        if (!db || !teamId) return;
        (async () => {
            setPageMode('loading');
            try {
                const snap = await getDoc(doc(db, 'weeklyTemplate', teamId));
                if (snap.exists()) { setTemplate(snap.data()); setPageMode('input'); }
                else setPageMode('setup');
            } catch { setPageMode('setup'); }
        })();
    }, [db, teamId]);

    // ── 주간 데이터 로드 ──────────────────────────────────────────────────────
    useEffect(() => {
        if (pageMode !== 'input' || !template) return;
        (async () => {
            try {
                const snap = await getDoc(doc(db, 'weeklyReports', `${teamId}_${weekOf}`));
                setEntries(snap.exists() ? (snap.data().entries ?? {}) : {});
                setSearch('');
            } catch { setEntries({}); }
        })();
    }, [db, teamId, weekOf, pageMode, template]);

    // ── 자동 저장 ────────────────────────────────────────────────────────────
    const triggerSave = useCallback((newEntries) => {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(async () => {
            setIsSaving(true);
            try {
                await setDoc(doc(db, 'weeklyReports', `${teamId}_${weekOf}`), {
                    teamId, weekOf, entries: newEntries,
                    updatedAt: new Date().toISOString(),
                });
                setSaveMsg('저장됨');
                setTimeout(() => setSaveMsg(''), 2000);
            } catch (err) { console.error('[WeeklyInput] save error', err); }
            finally { setIsSaving(false); }
        }, 800);
    }, [db, teamId, weekOf]);

    // ── 날짜 변경 ────────────────────────────────────────────────────────────
    const handleDateChange = useCallback((catId, itemId, stageId, value) => {
        setEntries(prev => {
            const next = {
                ...prev,
                [catId]: {
                    ...prev[catId],
                    [itemId]: { ...(prev[catId]?.[itemId] ?? {}), [stageId]: value || null },
                },
            };
            triggerSave(next);
            return next;
        });
    }, [triggerSave]);

    // ── 템플릿 업로드 ────────────────────────────────────────────────────────
    const handleTemplateUpload = useCallback(async (e) => {
        const file = e.target?.files?.[0];
        if (!file) return;
        setIsLoading(true);
        try {
            const ab = await file.arrayBuffer();
            const tmpl = await parseTemplateFromExcel(ab, file.name);
            await setDoc(doc(db, 'weeklyTemplate', teamId), tmpl);
            setTemplate(tmpl);
            setPageMode('input');
        } catch (err) { setAlertMsg(err.message); }
        finally { setIsLoading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
    }, [db, teamId]);

    // ── 오버레이 ─────────────────────────────────────────────────────────────
    const Overlays = (
        <>
            {isLoading && (
                <div style={{position:'fixed',inset:0,zIndex:999,display:'flex',flexDirection:'column',
                    alignItems:'center',justifyContent:'center',background:'rgba(2,6,23,0.92)',backdropFilter:'blur(6px)'}}>
                    <div style={{width:44,height:44,border:'3px solid #34d399',borderTopColor:'transparent',
                        borderRadius:'50%',animation:'_spin 0.8s linear infinite',marginBottom:14}}/>
                    <p style={{color:'#94a3b8',fontWeight:'bold',fontSize:13}}>처리 중...</p>
                </div>
            )}
            {alertMsg && (
                <div style={{position:'fixed',inset:0,zIndex:500,display:'flex',alignItems:'center',
                    justifyContent:'center',background:'rgba(2,6,23,0.85)'}}>
                    <div style={{background:'#0f172a',border:'1px solid #334155',padding:28,borderRadius:16,
                        maxWidth:360,width:'90%',textAlign:'center'}}>
                        <p style={{color:'white',fontWeight:'bold',marginBottom:20,whiteSpace:'pre-line',fontSize:14}}>{alertMsg}</p>
                        <button onClick={()=>setAlertMsg('')}
                            style={{padding:'9px 24px',background:'#34d399',color:'#020617',border:'none',
                            borderRadius:8,fontWeight:'bold',width:'100%',cursor:'pointer',fontSize:13}}>확인</button>
                    </div>
                </div>
            )}
        </>
    );

    // ── 팀 선택 ──────────────────────────────────────────────────────────────
    if (pageMode === 'teamSelect') return (
        <div style={S.page}>
            <header style={S.header}>
                <WBtn onClick={onBack}><ArrowLeft size={13}/> 나가기</WBtn>
                <span style={{fontWeight:'bold',fontSize:14,color:'#e2e8f0'}}>주간보고 입력</span>
            </header>
            <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',padding:32}}>
                <div style={{maxWidth:380,width:'100%'}}>
                    <div style={{textAlign:'center',marginBottom:28}}>
                        <div style={{width:56,height:56,background:'#022c22',border:'1.5px solid #34d399',
                            borderRadius:16,display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 14px'}}>
                            <BarChart3 size={28} color="#34d399"/>
                        </div>
                        <h2 style={{fontSize:18,fontWeight:'bold',marginBottom:6}}>팀 선택</h2>
                        <p style={{color:'#64748b',fontSize:13}}>주간보고를 입력할 팀을 선택하세요.</p>
                    </div>
                    <div style={{display:'flex',flexDirection:'column',gap:8}}>
                        {TEAMS.map(team => (
                            <button key={team} onClick={() => setSelectedTeam(team)}
                                style={{padding:'13px 20px',background:'#080f1e',border:'1px solid #1a2540',
                                    borderRadius:10,color:'#e2e8f0',fontWeight:'600',fontSize:14,cursor:'pointer',
                                    textAlign:'left',transition:'all 0.15s'}}
                                onMouseEnter={e=>{e.currentTarget.style.borderColor='#34d399';e.currentTarget.style.background='#022c22';}}
                                onMouseLeave={e=>{e.currentTarget.style.borderColor='#1a2540';e.currentTarget.style.background='#080f1e';}}>
                                {team}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );

    // ── 로딩 ─────────────────────────────────────────────────────────────────
    if (pageMode === 'loading') return (
        <div style={{height:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#020617'}}>
            <RefreshCw size={22} color="#334155" style={{animation:'_spin 1s linear infinite'}}/>
        </div>
    );

    // ── 셋업 ─────────────────────────────────────────────────────────────────
    if (pageMode === 'setup') return (
        <div style={S.page}>
            {Overlays}
            <input type="file" ref={fileInputRef} onChange={handleTemplateUpload} accept=".xlsx,.xls" style={{display:'none'}}/>
            <header style={S.header}>
                <WBtn onClick={onBack}><ArrowLeft size={13}/> 나가기</WBtn>
                <span style={{fontWeight:'bold',fontSize:14,color:'#e2e8f0'}}>주간보고 입력</span>
                {teamId && <TeamBadge>{teamId}</TeamBadge>}
            </header>
            <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',padding:32}}>
                <div style={{maxWidth:440,width:'100%',textAlign:'center'}}>
                    <div style={{width:64,height:64,background:'#022c22',border:'1.5px solid #34d399',
                        borderRadius:18,display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 18px'}}>
                        <FileSpreadsheet size={32} color="#34d399"/>
                    </div>
                    <h2 style={{fontSize:18,fontWeight:'bold',marginBottom:8}}>템플릿 설정</h2>
                    <p style={{color:'#64748b',fontSize:13,marginBottom:28,lineHeight:1.7}}>
                        기존 주간보고 Excel 파일을 업로드하면<br/>
                        태그 목록과 시트 구조를 자동으로 추출합니다.<br/>
                        <span style={{color:'#475569',fontSize:12}}>최초 1회만 설정하면 이후 웹에서 바로 입력합니다.</span>
                    </p>
                    <div onClick={() => fileInputRef.current?.click()}
                        style={{border:'2px dashed #1a3a2a',borderRadius:14,padding:'28px 24px',
                            cursor:'pointer',background:'#040f09',transition:'all 0.2s'}}
                        onMouseEnter={e=>e.currentTarget.style.borderColor='#34d399'}
                        onMouseLeave={e=>e.currentTarget.style.borderColor='#1a3a2a'}>
                        <Upload size={22} color="#34d399" style={{margin:'0 auto 8px'}}/>
                        <div style={{color:'#34d399',fontWeight:'bold',marginBottom:4,fontSize:13}}>Excel 파일 업로드</div>
                        <div style={{color:'#475569',fontSize:12}}>.xlsx · .xls</div>
                    </div>
                </div>
            </div>
        </div>
    );

    // ── 입력 화면 ────────────────────────────────────────────────────────────
    const cats = template?.categories ?? [];
    const activeCat = cats.find(c => c.id === activeTab) ?? null;
    const catEntries = entries[activeTab] ?? {};

    // 메일 핸들러 (헤더에서도 접근)
    const handleMail = () => {
        const subject = encodeURIComponent(`[주간보고] ${teamId} 진척률 요약 - ${formatWeekRange(weekOf)}`);
        const body    = encodeURIComponent(buildMailText(teamId, weekOf, cats, entries));
        window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
    };
    const handleCopyHtml = async () => {
        const html = buildHtmlTable(teamId, weekOf, cats, entries);
        const text = buildMailText(teamId, weekOf, cats, entries);
        try {
            await navigator.clipboard.write([
                new ClipboardItem({
                    'text/html':  new Blob([html], { type: 'text/html' }),
                    'text/plain': new Blob([text], { type: 'text/plain' }),
                })
            ]);
        } catch { await navigator.clipboard.writeText(text); }
        setMailCopied(true);
        setTimeout(() => setMailCopied(false), 2500);
    };

    return (
        <div style={S.page}>
            {Overlays}
            <input type="file" ref={fileInputRef} onChange={handleTemplateUpload} accept=".xlsx,.xls" style={{display:'none'}}/>

            {/* ── 헤더 ── */}
            <header style={{...S.header, gap:8}}>
                <WBtn onClick={onBack}><ArrowLeft size={13}/></WBtn>
                <span style={{fontWeight:'bold',fontSize:13,color:'#e2e8f0'}}>주간보고 입력</span>
                {teamId && <TeamBadge>{teamId}</TeamBadge>}

                {/* 주 네비게이션 */}
                <div style={{display:'flex',alignItems:'center',gap:2,marginLeft:4,
                    background:'#0f172a',border:'1px solid #1e293b',borderRadius:8,padding:'2px 6px'}}>
                    <NavBtn onClick={() => setWeekOf(w => addWeeks(w, -1))}><ChevronLeft size={13}/></NavBtn>
                    <span style={{fontSize:12,fontWeight:'600',color:'#cbd5e1',minWidth:96,textAlign:'center'}}>
                        {formatWeekRange(weekOf)}
                    </span>
                    <NavBtn onClick={() => setWeekOf(w => addWeeks(w, 1))}><ChevronRight size={13}/></NavBtn>
                </div>

                {/* 메일 버튼들 */}
                <div style={{display:'flex',alignItems:'center',gap:5,marginLeft:'auto'}}>
                    {isSaving && <RefreshCw size={11} color="#475569" style={{animation:'_spin 1s linear infinite'}}/>}
                    {saveMsg && <span style={{color:'#34d399',fontWeight:'bold',fontSize:11}}>{saveMsg}</span>}
                    <WBtn onClick={handleCopyHtml} small>
                        {mailCopied ? '✓ 복사됨' : '📋 복사'}
                    </WBtn>
                    <WBtn onClick={handleMail} small highlight>✉️ 메일</WBtn>
                    <WBtn onClick={() => fileInputRef.current?.click()} small><Upload size={11}/> 재설정</WBtn>
                </div>
            </header>

            {/* ── 본문: 좌(진척률) + 드래그바 + 우(입력) ── */}
            <div
                style={{flex:1,overflow:'hidden',display:'flex',flexDirection:'row',userSelect: isDragging.current ? 'none' : 'auto'}}
                onMouseMove={e => {
                    if (!isDragging.current) return;
                    const delta = e.clientX - dragStartX.current;
                    const next  = Math.min(480, Math.max(160, dragStartW.current + delta));
                    setLeftWidth(next);
                }}
                onMouseUp={() => { isDragging.current = false; document.body.style.cursor = ''; }}
                onMouseLeave={() => { isDragging.current = false; document.body.style.cursor = ''; }}
            >
                {/* ── 왼쪽: 진척률 요약 패널 ── */}
                <div style={{
                    width: leftWidth, flexShrink:0,
                    background:'#04090f',
                    display:'flex', flexDirection:'column',
                    overflow:'hidden',
                }}>
                    <div style={{padding:'8px 10px',borderBottom:'1px solid #1a2540',
                        display:'flex',alignItems:'center',gap:6,flexShrink:0}}>
                        <BarChart3 size={13} color="#34d399"/>
                        <span style={{fontSize:11,fontWeight:'700',color:'#94a3b8'}}>진척률 요약</span>
                    </div>
                    <SummaryPanel cats={cats} entries={entries}/>
                </div>

                {/* ── 드래그 구분선 ── */}
                <div
                    onMouseDown={e => {
                        isDragging.current = true;
                        dragStartX.current = e.clientX;
                        dragStartW.current = leftWidth;
                        document.body.style.cursor = 'col-resize';
                        e.preventDefault();
                    }}
                    style={{
                        width: 5, flexShrink:0, cursor:'col-resize',
                        background:'#1a2540',
                        transition:'background 0.15s',
                        position:'relative', zIndex:5,
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#34d39966'}
                    onMouseLeave={e => { if (!isDragging.current) e.currentTarget.style.background = '#1a2540'; }}
                />

                {/* ── 오른쪽: 탭 + 입력 ── */}
                <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
                    {/* 탭 바 */}
                    <div style={{display:'flex',overflowX:'auto',background:'#080f1e',
                        borderBottom:'1px solid #1a2540',flexShrink:0,scrollbarWidth:'none'}}>
                        {cats.length === 0
                            ? <span style={{padding:'10px 14px',fontSize:11,color:'#374151'}}>카테고리 없음</span>
                            : cats.map(cat => {
                                const prog = calcProgress(cat, entries[cat.id] ?? {});
                                const last = prog[prog.length - 1];
                                return (
                                    <Tab key={cat.id} active={activeTab===cat.id}
                                        onClick={()=>{setActiveTab(cat.id);setSearch('');}}>
                                        {cat.name}
                                        <span style={{fontSize:9,marginLeft:3,
                                            color: activeTab===cat.id ? '#34d39999' : '#374151'}}>
                                            {last.done}/{last.total}
                                        </span>
                                    </Tab>
                                );
                            })
                        }
                    </div>
                    {/* 입력 영역 */}
                    <div style={{flex:1,overflow:'hidden',display:'flex',flexDirection:'column'}}>
                        {activeCat
                            ? <CategoryView
                                cat={activeCat}
                                catEntries={catEntries}
                                search={search}
                                onSearch={setSearch}
                                onChange={handleDateChange}
                              />
                            : <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',
                                color:'#374151',fontSize:13}}>
                                ← 왼쪽 탭에서 카테고리를 선택하세요
                              </div>
                        }
                    </div>
                </div>
            </div>

            <style>{`@keyframes _spin{to{transform:rotate(360deg)}}`}</style>
        </div>
    );
};

// ─── 진척률 요약 빌더 ────────────────────────────────────────────────────────
function buildSummaryRows(cats, entries) {
    return cats.map(cat => ({
        name: cat.name,
        total: cat.items.length,
        progress: calcProgress(cat, entries[cat.id] ?? {}),
    }));
}
function buildTotals(cats, entries) {
    return STAGES.map(stage => {
        const done  = cats.reduce((s,c) => s + calcProgress(c, entries[c.id]??{}).find(p=>p.id===stage.id).done, 0);
        const total = cats.reduce((s,c) => s + c.items.length, 0);
        return { ...stage, done, total, rate: total>0 ? Math.round(done/total*1000)/10 : 0 };
    });
}

// plain-text 메일 본문 생성
function buildMailText(teamId, weekOf, cats, entries) {
    const rows = buildSummaryRows(cats, entries);
    const totals = buildTotals(cats, entries);
    const weekStr = formatWeekRange(weekOf);
    const bar = (rate) => {
        const filled = Math.round(rate / 10);
        return '█'.repeat(filled) + '░'.repeat(10 - filled) + ` ${rate}%`;
    };
    const stageLabels = STAGES.map(s => s.label).join(' | ');
    const header = `[주간보고 진척률 요약] ${teamId} - ${weekStr}\n${'='.repeat(60)}\n`;
    const colW = 14;
    const pad = (s, w) => String(s).padEnd(w);
    const padC = (s, w) => { const str = String(s); const sp = Math.max(0, w - str.length); return ' '.repeat(Math.floor(sp/2)) + str + ' '.repeat(Math.ceil(sp/2)); };
    const tableHead = pad('카테고리', 18) + pad('전체', 6) + STAGES.map(s => padC(s.label, colW)).join('') + '\n';
    const divider = '-'.repeat(18 + 6 + colW * STAGES.length) + '\n';
    const tableBody = rows.map(r =>
        pad(r.name, 18) + pad(r.total, 6) +
        r.progress.map(p => padC(`${p.rate}% (${p.done}/${p.total})`, colW)).join('')
    ).join('\n');
    const totalRow = '\n' + '='.repeat(18 + 6 + colW * STAGES.length) + '\n' +
        pad('전체 합계', 18) + pad(cats.reduce((s,c)=>s+c.items.length,0), 6) +
        totals.map(p => padC(`${p.rate}% (${p.done}/${p.total})`, colW)).join('');
    const bars = '\n\n' + STAGES.map(s => {
        const p = totals.find(t => t.id === s.id);
        return `${s.label.padEnd(8)}: ${bar(p.rate)}  (${p.done}/${p.total})`;
    }).join('\n');
    return header + tableHead + divider + tableBody + totalRow + bars + `\n\n${'='.repeat(60)}\n자동생성 - PMS 주간보고 시스템`;
}

// HTML 클립보드용 테이블 생성
function buildHtmlTable(teamId, weekOf, cats, entries) {
    const rows = buildSummaryRows(cats, entries);
    const totals = buildTotals(cats, entries);
    const weekStr = formatWeekRange(weekOf);
    const stageColors = { '현장확인':'#4f46e5','L2확인':'#0284c7','시운전':'#059669','통합시운전':'#d97706' };
    const cell = (c, v, extra='') => `<td style="padding:8px 12px;text-align:center;border:1px solid #e2e8f0;${extra}">${v}</td>`;
    const pct = (p) => {
        const col = stageColors[p.id] || '#333';
        const w = p.rate;
        return `<div style="font-weight:bold;color:${col};font-size:14px">${p.rate}%</div>
<div style="font-size:11px;color:#64748b">${p.done}/${p.total}</div>
<div style="width:80px;height:4px;background:#e2e8f0;border-radius:4px;margin:4px auto 0;overflow:hidden">
  <div style="width:${w}%;height:100%;background:${col};border-radius:4px"></div>
</div>`;
    };
    const th = (v, c='#374151') => `<th style="padding:9px 12px;border:1px solid #e2e8f0;background:#f8fafc;color:${c};font-size:12px;white-space:nowrap">${v}</th>`;
    const tableRows = rows.map((r,i) =>
        `<tr style="background:${i%2===0?'#fff':'#f8fafc'}">
            <td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:600;color:#1e293b">${r.name}</td>
            <td style="padding:8px 12px;border:1px solid #e2e8f0;text-align:center;color:#64748b">${r.total}</td>
            ${r.progress.map(p=>`<td style="padding:8px 12px;border:1px solid #e2e8f0;text-align:center">${pct(p)}</td>`).join('')}
        </tr>`
    ).join('');
    const totalRow = `<tr style="background:#f0fdf4;font-weight:bold">
        <td style="padding:9px 12px;border:1px solid #e2e8f0;font-weight:700;color:#166534">전체 합계</td>
        <td style="padding:9px 12px;border:1px solid #e2e8f0;text-align:center;color:#374151">${cats.reduce((s,c)=>s+c.items.length,0)}</td>
        ${totals.map(p=>`<td style="padding:9px 12px;border:1px solid #e2e8f0;text-align:center">${pct(p)}</td>`).join('')}
    </tr>`;
    return `<div style="font-family:Arial,sans-serif;max-width:700px">
<p style="font-size:15px;font-weight:bold;color:#1e293b;margin-bottom:4px">📊 주간보고 진척률 요약</p>
<p style="font-size:13px;color:#64748b;margin-bottom:16px">${teamId} · ${weekStr}</p>
<table style="border-collapse:collapse;width:100%;font-size:13px">
<thead><tr>
  ${th('카테고리')} ${th('전체')} ${STAGES.map(s=>th(s.label, stageColors[s.id]||'#333')).join('')}
</tr></thead>
<tbody>${tableRows}${totalRow}</tbody>
</table>
<p style="font-size:11px;color:#94a3b8;margin-top:12px">PMS 주간보고 시스템 자동생성</p>
</div>`;
}

// ─── 좌측 진척률 패널 (세로 컴팩트) ─────────────────────────────────────────
const SummaryPanel = ({ cats, entries }) => {
    const rows   = buildSummaryRows(cats, entries);
    const totals = buildTotals(cats, entries);
    const grandTotal = cats.reduce((s,c)=>s+c.items.length,0);

    return (
        <div style={{flex:1,overflowY:'auto',padding:'8px 0'}}>
            {/* 전체 합계 미니 바 */}
            <div style={{padding:'6px 10px 10px',borderBottom:'1px solid #0d1525',marginBottom:4}}>
                {totals.map(p => (
                    <div key={p.id} style={{marginBottom:7}}>
                        <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
                            <span style={{fontSize:10,fontWeight:'700',color:p.color}}>{p.label}</span>
                            <span style={{fontSize:10,fontWeight:'800',color:p.color}}>{p.rate}%</span>
                        </div>
                        <div style={{height:5,background:'#0d1525',borderRadius:3,overflow:'hidden'}}>
                            <div style={{height:'100%',width:`${p.rate}%`,background:p.color,
                                borderRadius:3,transition:'width 0.5s'}}/>
                        </div>
                        <div style={{fontSize:9,color:'#374151',textAlign:'right',marginTop:2}}>
                            {p.done}/{p.total}
                        </div>
                    </div>
                ))}
            </div>

            {/* 카테고리별 */}
            {rows.map((row, ci) => (
                <div key={row.name} style={{
                    padding:'7px 10px',
                    borderBottom:'1px solid #0a1120',
                    background: ci%2===0 ? 'transparent' : '#040d18',
                }}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:5}}>
                        <span style={{fontSize:11,fontWeight:'700',color:'#cbd5e1',
                            overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:140}}>
                            {row.name}
                        </span>
                        <span style={{fontSize:10,color:'#374151',flexShrink:0}}>{row.total}개</span>
                    </div>
                    {row.progress.map(p => (
                        <div key={p.id} style={{display:'flex',alignItems:'center',gap:5,marginBottom:3}}>
                            <span style={{fontSize:9,color:p.color,fontWeight:'700',minWidth:44,flexShrink:0}}>{p.label}</span>
                            <div style={{flex:1,height:4,background:'#0d1525',borderRadius:2,overflow:'hidden'}}>
                                <div style={{height:'100%',width:`${p.rate}%`,background:p.color,
                                    borderRadius:2,transition:'width 0.5s'}}/>
                            </div>
                            <span style={{fontSize:9,fontWeight:'800',color:p.color,minWidth:30,textAlign:'right',flexShrink:0}}>
                                {p.rate}%
                            </span>
                        </div>
                    ))}
                </div>
            ))}
        </div>
    );
};

// 완료 단계 수에 따른 행 배경색 (0~4단계)
function rowBgByDone(doneCnt, allDone) {
    if (allDone)   return { bg: '#031a0c', left: '#34d399' };
    if (doneCnt === 3) return { bg: '#041508', left: '#a3e635' };
    if (doneCnt === 2) return { bg: '#04100d', left: '#38bdf8' };
    if (doneCnt === 1) return { bg: '#05091a', left: '#818cf8' };
    return { bg: 'transparent', left: '#1e293b' };
}

// ─── 카테고리 탭 ─────────────────────────────────────────────────────────────
const CategoryView = ({ cat, catEntries, search, onSearch, onChange, onFillColumn }) => {
    const [selected,  setSelected]  = useState(new Set());  // 선택된 itemId Set
    const [bulkDates, setBulkDates] = useState({});          // stageId → date (플로팅 바용)

    const filtered = search
        ? cat.items.filter(it =>
            it.name.toLowerCase().includes(search.toLowerCase()) ||
            it.desc.toLowerCase().includes(search.toLowerCase()) ||
            it.screen.toLowerCase().includes(search.toLowerCase())
          )
        : cat.items;

    const progress = calcProgress(cat, catEntries);
    const allChecked = filtered.length > 0 && filtered.every(it => selected.has(it.id));

    const toggleAll = () => {
        setSelected(prev => {
            const next = new Set(prev);
            if (allChecked) filtered.forEach(it => next.delete(it.id));
            else filtered.forEach(it => next.add(it.id));
            return next;
        });
    };
    const toggleOne = (id) => {
        setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    };

    // 선택 항목에 날짜 일괄 적용
    const applyBulk = () => {
        const targetIds = filtered.filter(it => selected.has(it.id)).map(it => it.id);
        if (!targetIds.length) return;
        STAGES.forEach(stage => {
            if (!bulkDates[stage.id]) return;
            targetIds.forEach(itemId => onChange(cat.id, itemId, stage.id, bulkDates[stage.id]));
        });
        setBulkDates({});
        setSelected(new Set());
    };

    const selectedCount = [...selected].filter(id => filtered.some(it => it.id === id)).length;

    return (
        <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',position:'relative'}}>
            {/* 공정율 + 검색 바 */}
            <div style={{padding:'6px 12px',background:'#04090f',borderBottom:'1px solid #1e2a3a',
                display:'flex',alignItems:'center',gap:12,flexWrap:'wrap',flexShrink:0}}>
                {progress.map(p => (
                    <div key={p.id} style={{display:'flex',alignItems:'center',gap:5,fontSize:11}}>
                        <span style={{color:p.color,fontWeight:'700',minWidth:52}}>{p.label}</span>
                        <div style={{width:52,height:5,background:'#1e2a3a',borderRadius:3,overflow:'hidden'}}>
                            <div style={{height:'100%',width:`${p.rate}%`,background:p.color,
                                transition:'width 0.4s',borderRadius:3}}/>
                        </div>
                        <span style={{fontWeight:'700',color:p.color,minWidth:36}}>{p.rate}%</span>
                        <span style={{color:'#64748b',fontSize:10}}>{p.done}/{p.total}</span>
                    </div>
                ))}
                <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:5,
                    background:'#0a1325',border:'1px solid #1e2a3a',borderRadius:7,padding:'4px 10px'}}>
                    <Search size={11} color="#64748b"/>
                    <input value={search} onChange={e=>onSearch(e.target.value)}
                        placeholder="태그 검색..." style={{background:'none',border:'none',outline:'none',
                        color:'#e2e8f0',fontSize:11,width:120}} />
                </div>
            </div>

            {/* 테이블 */}
            <div style={{flex:1,overflowY:'auto',overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:12,minWidth:640}}>
                    <colgroup>
                        <col style={{width:30}}/>   {/* 체크 */}
                        <col style={{width:34}}/>   {/* # */}
                        <col style={{width:4}}/>    {/* 컬러 바 */}
                        <col style={{width:170}}/>  {/* 태그명 */}
                        <col style={{width:80}}/>   {/* 화면명 */}
                        {STAGES.map(s => <col key={s.id} style={{width:102}}/>)}
                        <col style={{width:30}}/>   {/* 완료 */}
                    </colgroup>
                    <thead style={{position:'sticky',top:0,zIndex:2}}>
                        <tr style={{background:'#060d1c',borderBottom:'2px solid #1e2a3a'}}>
                            {/* 전체 체크박스 */}
                            <th style={{padding:'8px 0 8px 8px',textAlign:'center'}}>
                                <input type="checkbox" checked={allChecked} onChange={toggleAll}
                                    style={{cursor:'pointer',accentColor:'#34d399',width:13,height:13}}/>
                            </th>
                            <th style={{padding:'8px 4px',textAlign:'center',color:'#64748b',fontSize:10,fontWeight:'700'}}>#</th>
                            <th/>
                            <th style={{padding:'8px 10px',textAlign:'left',color:'#94a3b8',fontSize:11,fontWeight:'700'}}>태그명</th>
                            <th style={{padding:'8px 8px',textAlign:'left',color:'#64748b',fontSize:11,fontWeight:'600'}}>화면명</th>
                            {STAGES.map(s => (
                                <th key={s.id} style={{padding:'8px 6px',textAlign:'center',color:s.color,fontSize:11,fontWeight:'700',
                                    borderLeft:'1px solid #1e2a3a'}}>
                                    {s.label}
                                </th>
                            ))}
                            <th style={{padding:'8px 0',textAlign:'center',color:'#374151',fontSize:10}}>완료</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.length === 0
                            ? <tr><td colSpan={9} style={{textAlign:'center',padding:32,color:'#64748b',fontSize:12}}>검색 결과 없음</td></tr>
                            : filtered.map((item, idx) => {
                                const itemEntry = catEntries[item.id] ?? {};
                                const doneCnt = STAGES.filter(s => !!itemEntry[s.id]).length;
                                const allDone = doneCnt === 4;
                                const isSelected = selected.has(item.id);
                                const { bg, left } = rowBgByDone(doneCnt, allDone);
                                const rowBg = isSelected ? '#0d1f3c' : bg;
                                return (
                                    <tr key={item.id}
                                        style={{borderBottom:'1px solid #0d1525',background:rowBg,
                                            outline: isSelected ? '1px solid #38bdf833' : 'none',
                                            cursor:'pointer'}}
                                        onClick={() => toggleOne(item.id)}>
                                        {/* 체크박스 */}
                                        <td style={{padding:'5px 0 5px 8px',textAlign:'center'}} onClick={e=>e.stopPropagation()}>
                                            <input type="checkbox" checked={isSelected} onChange={()=>toggleOne(item.id)}
                                                style={{cursor:'pointer',accentColor:'#38bdf8',width:13,height:13}}/>
                                        </td>
                                        {/* 번호 */}
                                        <td style={{padding:'5px 4px',textAlign:'center',
                                            color: allDone ? '#34d39988' : '#64748b',fontSize:10,fontWeight:'700'}}>
                                            {idx + 1}
                                        </td>
                                        {/* 진행 단계 컬러 바 */}
                                        <td style={{padding:0}}>
                                            <div style={{width:3,height:'100%',minHeight:28,background:left,borderRadius:2}}/>
                                        </td>
                                        {/* 태그명 */}
                                        <td style={{padding:'5px 10px'}} onClick={e=>e.stopPropagation()}>
                                            <div style={{fontWeight:'700',fontSize:12,
                                                color: allDone ? '#6ee7b7' : '#e2e8f0',
                                                overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                                                {item.name}
                                            </div>
                                            {item.desc && (
                                                <div style={{fontSize:10,color:'#94a3b8',marginTop:1,
                                                    overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                                                    {item.desc}
                                                </div>
                                            )}
                                        </td>
                                        {/* 화면명 */}
                                        <td style={{padding:'5px 8px',color:'#94a3b8',fontSize:10,
                                            overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}
                                            onClick={e=>e.stopPropagation()}>
                                            {item.screen}
                                        </td>
                                        {/* 날짜 입력 */}
                                        {STAGES.map(stage => {
                                            const val = itemEntry[stage.id] ?? '';
                                            return (
                                                <td key={stage.id}
                                                    style={{padding:'3px 5px',textAlign:'center',borderLeft:'1px solid #0d1525'}}
                                                    onClick={e=>e.stopPropagation()}>
                                                    <input
                                                        type="date"
                                                        value={val}
                                                        onChange={e => onChange(cat.id, item.id, stage.id, e.target.value)}
                                                        style={{
                                                            background: val ? stage.bg : '#0a1325',
                                                            border: `1px solid ${val ? stage.color+'99' : '#1e2a3a'}`,
                                                            borderRadius: 5,
                                                            color: val ? stage.color : '#64748b',
                                                            padding: '3px 4px',
                                                            fontSize: 11,
                                                            cursor: 'pointer',
                                                            width: 90,
                                                            outline: 'none',
                                                            colorScheme: 'dark',
                                                            fontWeight: val ? '600' : '400',
                                                        }}
                                                    />
                                                </td>
                                            );
                                        })}
                                        {/* 완료 */}
                                        <td style={{padding:'3px 0',textAlign:'center'}}>
                                            {allDone
                                                ? <CheckCircle2 size={14} color="#34d399"/>
                                                : doneCnt > 0
                                                    ? <div style={{display:'inline-flex',gap:2}}>
                                                        {STAGES.map((s,i) => (
                                                            <div key={s.id} style={{width:4,height:4,borderRadius:'50%',
                                                                background: itemEntry[s.id] ? s.color : '#1e2a3a'}}/>
                                                        ))}
                                                      </div>
                                                    : <Circle size={12} color="#1e2a3a"/>
                                            }
                                        </td>
                                    </tr>
                                );
                              })
                        }
                    </tbody>
                </table>
            </div>

            {/* ── 플로팅 일괄입력 바 (항목 선택 시 표시) ── */}
            {selectedCount > 0 && (
                <div style={{
                    position:'absolute',bottom:0,left:0,right:0,zIndex:10,
                    background:'#0d1f3c',borderTop:'2px solid #38bdf8',
                    padding:'10px 14px',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',
                    boxShadow:'0 -4px 24px rgba(56,189,248,0.15)',
                }}>
                    <span style={{color:'#38bdf8',fontWeight:'700',fontSize:12,minWidth:70}}>
                        {selectedCount}개 선택
                    </span>
                    <span style={{color:'#64748b',fontSize:11}}>→ 날짜 입력 후 적용:</span>
                    {STAGES.map(s => (
                        <div key={s.id} style={{display:'flex',alignItems:'center',gap:4}}>
                            <span style={{color:s.color,fontSize:10,fontWeight:'700',minWidth:46}}>{s.label}</span>
                            <input
                                type="date"
                                value={bulkDates[s.id] ?? ''}
                                onChange={e => setBulkDates(prev => ({...prev, [s.id]: e.target.value}))}
                                style={{
                                    background:'#0a1325',border:`1px solid ${s.color}66`,borderRadius:6,
                                    color:s.color,padding:'3px 5px',fontSize:11,outline:'none',
                                    colorScheme:'dark',width:100,cursor:'pointer',fontWeight:'600',
                                }}
                            />
                        </div>
                    ))}
                    <button onClick={applyBulk}
                        style={{marginLeft:'auto',padding:'6px 18px',background:'#38bdf8',color:'#020617',
                            border:'none',borderRadius:8,fontWeight:'800',fontSize:12,cursor:'pointer'}}>
                        적용
                    </button>
                    <button onClick={() => { setSelected(new Set()); setBulkDates({}); }}
                        style={{padding:'6px 12px',background:'transparent',color:'#64748b',
                            border:'1px solid #1e2a3a',borderRadius:8,fontWeight:'600',fontSize:11,cursor:'pointer'}}>
                        취소
                    </button>
                </div>
            )}
        </div>
    );
};

// ─── 서브 컴포넌트 ────────────────────────────────────────────────────────────
const Tab = ({ active, onClick, children }) => (
    <button onClick={onClick} style={{
        display:'flex',alignItems:'center',gap:4,padding:'9px 14px',whiteSpace:'nowrap',
        background:'none',border:'none',borderBottom:`2px solid ${active?'#34d399':'transparent'}`,
        color: active ? '#34d399' : '#475569',fontWeight: active ? '700' : '500',
        cursor:'pointer',fontSize:11,transition:'all 0.15s',flexShrink:0,
    }}>{children}</button>
);

const TeamBadge = ({ children }) => (
    <span style={{fontSize:11,color:'#34d399',background:'#022c22',
        border:'1px solid #34d39933',borderRadius:6,padding:'2px 8px',fontWeight:'600'}}>
        {children}
    </span>
);

const NavBtn = ({ onClick, children }) => {
    const [h, setH] = useState(false);
    return (
        <button onClick={onClick} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
            style={{background:'none',border:'none',cursor:'pointer',display:'flex',padding:'2px 4px',
                borderRadius:4,color:h?'#e2e8f0':'#64748b',transition:'color 0.15s'}}>
            {children}
        </button>
    );
};

const WBtn = ({ onClick, children, small, highlight }) => {
    const [h, setH] = useState(false);
    const baseColor  = highlight ? '#1e3a5f' : '#1a2540';
    const hoverColor = highlight ? '#1d4ed8' : '#0f172a';
    const textColor  = highlight ? (h ? '#fff' : '#60a5fa') : (h ? '#cbd5e1' : '#64748b');
    return (
        <button onClick={onClick} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
            style={{display:'flex',alignItems:'center',gap:4,
                padding:small?'3px 9px':'5px 12px',
                borderRadius:7,border:`1px solid ${baseColor}`,
                background:h?hoverColor:'#080f1e',
                color:textColor,
                fontSize:small?10:11,fontWeight:'600',cursor:'pointer',
                transition:'all 0.15s',whiteSpace:'nowrap'}}>
            {children}
        </button>
    );
};

export default WeeklyInputScreen;
