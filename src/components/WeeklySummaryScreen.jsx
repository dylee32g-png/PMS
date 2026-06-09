// WeeklySummaryScreen - v2.0
// 주간진척율요약 — 지난주/금주 입력 + 진행실적등록 연동
import React, { useState, useEffect, useCallback } from 'react';
import {
    ArrowLeft, Plus, ChevronLeft, ChevronRight, Save,
    FolderOpen, AlertTriangle, ClipboardList,
    CheckCircle2, Circle, Pencil, Trash2, X, Building2,
    RefreshCw, Zap,
} from 'lucide-react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { appId } from '../firebase';

// ─── 상수 ─────────────────────────────────────────────────────────────────────
const TEAMS = ['기술1팀', '기술2팀', '기술3팀', 'Software팀'];

const ITEMS = [
    { key: 'drawing',          label: '도면입수',     color: '#3b82f6', section: 'pre'  },
    { key: 'iomap',            label: 'I/O Map 입수', color: '#8b5cf6', section: 'pre'  },
    { key: 'screen',           label: '화면개발',     color: '#06b6d4', section: 'pre'  },
    { key: 'baseinfo',         label: '기준정보생성', color: '#f59e0b', section: 'pre'  },
    { key: 'commissioning',    label: '자체시운전',   color: '#10b981', section: 'comm' },
    { key: 'intCommissioning', label: '통합시운전',   color: '#f43f5e', section: 'comm' },
];

// ─── 날짜 유틸 ────────────────────────────────────────────────────────────────
function getMondayOfWeek(date = new Date()) {
    const d = new Date(date);
    const day = d.getDay();
    d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
    d.setHours(0, 0, 0, 0);
    return d.toISOString().slice(0, 10);
}
function addWeeks(w, n) {
    const d = new Date(w); d.setDate(d.getDate() + n * 7);
    return d.toISOString().slice(0, 10);
}
function fmtWeek(w) {
    const s = new Date(w), e = new Date(w);
    e.setDate(e.getDate() + 4);
    return `${s.getFullYear()}.${s.getMonth()+1}.${s.getDate()} ~ ${e.getMonth()+1}.${e.getDate()}`;
}
// ProgressModal 과 동일한 wKey 형식: "year-month-week"
function wKeyOf(isoDate) {
    const d = new Date(isoDate);
    return `${d.getFullYear()}-${d.getMonth()+1}-${Math.ceil(d.getDate()/7)}`;
}
function nowId() { return Date.now().toString(36); }

// ─── Firestore 키 ─────────────────────────────────────────────────────────────
const projectsDocId = (teamId) => `wsr_projects_${teamId}`;
const reportDocId   = (teamId, projectId, weekOf) => `wsr_${teamId}_${projectId}_${weekOf}`;

// ─── 빈 폼 ───────────────────────────────────────────────────────────────────
const emptyForm = () => {
    const f = { issues: '', memo: '' };
    ITEMS.forEach(({ key }) => { f[`${key}_last`] = ''; f[`${key}_curr`] = ''; });
    return f;
};

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────
const WeeklySummaryScreen = ({ db, teamId: propTeamId, onBack }) => {
    const [teamId,     setTeamId]     = useState(propTeamId || null);
    const [projects,   setProjects]   = useState([]);
    const [weekOf,     setWeekOf]     = useState(getMondayOfWeek());
    const [selProject, setSelProject] = useState(null);
    const [form,       setForm]       = useState(emptyForm());
    const [isSaving,   setIsSaving]   = useState(false);
    const [isApplying, setIsApplying] = useState(false);
    const [msg,        setMsg]        = useState({ text:'', ok:true });
    const [isLoading,  setIsLoading]  = useState(false);
    const [projModal,  setProjModal]  = useState(null);
    const [projForm,   setProjForm]   = useState({ name:'', execNo:'', client:'', site:'', startDate:'' });
    const [alertMsg,   setAlertMsg]   = useState('');

    const needTeamSelect = !teamId;

    // ── 프로젝트 목록 로드 ──────────────────────────────────────────────────
    useEffect(() => {
        if (!db || !teamId) return;
        (async () => {
            setIsLoading(true);
            try {
                const snap = await getDoc(doc(db, 'wsr_projects', projectsDocId(teamId)));
                const list = snap.exists() ? (snap.data().list ?? []) : [];
                setProjects(list);
                if (list.length > 0 && !selProject) setSelProject(list[0].id);
            } catch(e) { console.error(e); }
            finally { setIsLoading(false); }
        })();
    }, [db, teamId]); // eslint-disable-line

    // ── 주간 보고 로드 ──────────────────────────────────────────────────────
    useEffect(() => {
        if (!db || !teamId || !selProject) return;
        (async () => {
            const key = reportDocId(teamId, selProject, weekOf);
            try {
                const snap = await getDoc(doc(db, 'wsr_reports', key));
                setForm(snap.exists() ? { ...emptyForm(), ...snap.data().form } : emptyForm());
            } catch { setForm(emptyForm()); }
        })();
    }, [db, teamId, selProject, weekOf]);

    // ── 저장 ────────────────────────────────────────────────────────────────
    const saveProjects = useCallback(async (list) => {
        if (!db || !teamId) return;
        await setDoc(doc(db, 'wsr_projects', projectsDocId(teamId)), { teamId, list });
    }, [db, teamId]);

    const handleSave = useCallback(async () => {
        if (!selProject || !teamId) return;
        setIsSaving(true);
        try {
            const key = reportDocId(teamId, selProject, weekOf);
            await setDoc(doc(db, 'wsr_reports', key), {
                teamId, projectId: selProject, weekOf,
                form, updatedAt: new Date().toISOString(),
            });
            showMsg('저장됨', true);
        } catch(e) { setAlertMsg('저장 실패: ' + e.message); }
        finally { setIsSaving(false); }
    }, [db, teamId, selProject, weekOf, form]);

    // ── 적용 (진행실적등록으로 전송) ────────────────────────────────────────
    const handleApply = useCallback(async () => {
        if (!selProject || !teamId) return;
        const proj = projects.find(p => p.id === selProject);
        if (!proj?.execNo?.trim()) {
            setAlertMsg('프로젝트에 실행번호가 없습니다.\n프로젝트 수정에서 실행번호를 입력해주세요.');
            return;
        }
        const execNo   = proj.execNo.trim();
        const curWKey  = wKeyOf(weekOf);
        const lastWKey = wKeyOf(addWeeks(weekOf, -1));

        setIsApplying(true);
        try {
            const docRef = doc(db, 'artifacts', appId, 'public', 'data', `progressRecords_${teamId}`, execNo);
            const snap = await getDoc(docRef);
            const existing = snap.exists() ? (snap.data().weekly || {}) : {};

            const merged = { ...existing };
            ITEMS.forEach(({ key }) => {
                const lastVal = form[`${key}_last`] !== '' ? Number(form[`${key}_last`]) : undefined;
                const currVal = form[`${key}_curr`] !== '' ? Number(form[`${key}_curr`]) : undefined;
                if (!merged[key]) merged[key] = {};
                if (lastVal !== undefined) merged[key][lastWKey] = lastVal;
                if (currVal !== undefined) merged[key][curWKey]  = currVal;
            });

            await setDoc(docRef, {
                docKey: execNo, execNo,
                project: proj.name,
                weekly: merged,
                updatedAt: new Date().toISOString(),
            }, { merge: true });

            showMsg('진행실적 적용 완료!', true);
        } catch(e) { setAlertMsg('적용 실패: ' + e.message); }
        finally { setIsApplying(false); }
    }, [db, teamId, selProject, weekOf, form, projects]);

    const showMsg = (text, ok) => {
        setMsg({ text, ok });
        setTimeout(() => setMsg({ text:'', ok:true }), 3000);
    };

    // Ctrl+S
    useEffect(() => {
        const handler = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); handleSave(); }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [handleSave]);

    // ── 프로젝트 CRUD ────────────────────────────────────────────────────────
    const handleProjSave = async () => {
        if (!projForm.name.trim()) { setAlertMsg('프로젝트명을 입력하세요.'); return; }
        let newList;
        if (projModal.mode === 'add') {
            const newProj = { id: nowId(), ...projForm, name: projForm.name.trim() };
            newList = [...projects, newProj];
            setSelProject(newProj.id);
        } else {
            newList = projects.map(p => p.id === projModal.data.id ? { ...p, ...projForm, name: projForm.name.trim() } : p);
        }
        setProjects(newList);
        await saveProjects(newList);
        setProjModal(null);
    };

    const handleProjDelete = async (id) => {
        const newList = projects.filter(p => p.id !== id);
        setProjects(newList);
        await saveProjects(newList);
        if (selProject === id) setSelProject(newList[0]?.id ?? null);
    };

    const openAddModal  = () => { setProjForm({ name:'', execNo:'', client:'', site:'', startDate:'' }); setProjModal({ mode:'add', data:{} }); };
    const openEditModal = (p) => { setProjForm({ name:p.name, execNo:p.execNo||'', client:p.client||'', site:p.site||'', startDate:p.startDate||'' }); setProjModal({ mode:'edit', data:p }); };

    const selProj = projects.find(p => p.id === selProject);
    const hasData = ITEMS.some(({ key }) => form[`${key}_last`] || form[`${key}_curr`]) || form.issues || form.memo;
    const setField = (key, val) => setForm(f => ({ ...f, [key]: val }));

    // ── 팀 선택 화면 ──────────────────────────────────────────────────────────
    if (needTeamSelect) return (
        <Page>
            <Header>
                <NavBtn onClick={onBack}><ArrowLeft size={13}/> 나가기</NavBtn>
                <Title>주간진척율요약</Title>
            </Header>
            <Center>
                <div style={{ maxWidth:360, width:'100%' }}>
                    <IconBox color="#6366f1"><Building2 size={26} color="#818cf8"/></IconBox>
                    <h2 style={{ fontSize:17, fontWeight:'bold', marginBottom:6, textAlign:'center', color:'#e2e8f0' }}>팀 선택</h2>
                    <p style={{ color:'#64748b', fontSize:13, marginBottom:22, textAlign:'center' }}>보고서를 입력할 팀을 선택하세요.</p>
                    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                        {TEAMS.map(t => <TeamBtn key={t} onClick={() => setTeamId(t)}>{t}</TeamBtn>)}
                    </div>
                </div>
            </Center>
        </Page>
    );

    if (isLoading) return (
        <Page>
            <Center><RefreshCw size={22} color="#334155" style={{ animation:'_spin 1s linear infinite' }}/></Center>
            <style>{`@keyframes _spin{to{transform:rotate(360deg)}}`}</style>
        </Page>
    );

    return (
        <Page>
            <style>{`@keyframes _spin{to{transform:rotate(360deg)}} *{box-sizing:border-box}`}</style>

            {/* 알림 오버레이 */}
            {alertMsg && (
                <div style={{ position:'fixed', inset:0, zIndex:999, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(2,6,23,0.85)' }}>
                    <div style={{ background:'#0f172a', border:'1px solid #334155', padding:24, borderRadius:14, maxWidth:340, width:'90%', textAlign:'center' }}>
                        <p style={{ color:'#f1f5f9', fontWeight:'bold', marginBottom:18, whiteSpace:'pre-line', fontSize:13 }}>{alertMsg}</p>
                        <Btn onClick={() => setAlertMsg('')} color="#6366f1">확인</Btn>
                    </div>
                </div>
            )}

            {/* 프로젝트 추가/수정 모달 */}
            {projModal && (
                <div style={{ position:'fixed', inset:0, zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(2,6,23,0.88)' }}>
                    <div style={{ background:'#0a1120', border:'1px solid #1e2a3a', borderRadius:14, padding:24, width:420, maxWidth:'95vw' }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
                            <span style={{ fontWeight:'bold', fontSize:14, color:'#e2e8f0' }}>
                                {projModal.mode === 'add' ? '프로젝트 추가' : '프로젝트 수정'}
                            </span>
                            <button onClick={() => setProjModal(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'#64748b', display:'flex' }}><X size={16}/></button>
                        </div>
                        {[
                            { key:'name',      label:'프로젝트명 *', type:'text', placeholder:'현장명' },
                            { key:'execNo',    label:'실행번호 (진행실적 연동용)', type:'text', placeholder:'예: 2024-001' },
                            { key:'client',    label:'고객사',    type:'text', placeholder:'삼성전자' },
                            { key:'site',      label:'현장',      type:'text', placeholder:'화성 P3' },
                            { key:'startDate', label:'착수일',    type:'date', placeholder:'' },
                        ].map(f => (
                            <div key={f.key} style={{ marginBottom:12 }}>
                                <label style={{ fontSize:11, color: f.key === 'execNo' ? '#818cf8' : '#64748b', fontWeight:'600', display:'block', marginBottom:4 }}>{f.label}</label>
                                <input type={f.type} value={projForm[f.key] || ''}
                                    onChange={e => setProjForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                                    placeholder={f.placeholder}
                                    style={{ width:'100%', background:'#04090f', border:`1px solid ${f.key==='execNo'?'#3730a3':'#1e2a3a'}`, borderRadius:7, color:'#e2e8f0', padding:'7px 10px', fontSize:13, outline:'none', colorScheme:'dark' }}/>
                            </div>
                        ))}
                        <div style={{ display:'flex', gap:8, marginTop:18 }}>
                            <Btn onClick={handleProjSave} color="#6366f1" style={{ flex:1 }}><Save size={13}/> 저장</Btn>
                            <Btn onClick={() => setProjModal(null)} style={{ flex:1 }}>취소</Btn>
                        </div>
                    </div>
                </div>
            )}

            {/* 헤더 */}
            <Header>
                <NavBtn onClick={onBack}><ArrowLeft size={13}/></NavBtn>
                <Title>주간진척율요약</Title>
                <TeamTag>{teamId}</TeamTag>
                <WeekNav weekOf={weekOf} setWeekOf={setWeekOf}/>
                <div style={{ display:'flex', alignItems:'center', gap:6, marginLeft:'auto' }}>
                    {(isSaving || isApplying) && <RefreshCw size={11} color="#475569" style={{ animation:'_spin 1s linear infinite' }}/>}
                    {msg.text && <span style={{ color: msg.ok ? '#34d399' : '#f87171', fontWeight:'bold', fontSize:11 }}>{msg.text}</span>}
                    {selProject && (<>
                        <Btn onClick={handleApply} color="#10b981" small disabled={isApplying}>
                            <Zap size={11}/> 적용
                        </Btn>
                        <Btn onClick={handleSave} color="#6366f1" small disabled={isSaving}>
                            <Save size={11}/> 저장 <span style={{ opacity:0.5, fontSize:9 }}>Ctrl+S</span>
                        </Btn>
                    </>)}
                </div>
            </Header>

            {/* 본문 */}
            <div style={{ flex:1, display:'flex', overflow:'hidden' }}>

                {/* 좌: 프로젝트 목록 */}
                <div style={{ width:230, flexShrink:0, borderRight:'1px solid #1a2540', background:'#04090f', display:'flex', flexDirection:'column', overflow:'hidden' }}>
                    <div style={{ padding:'8px 10px', borderBottom:'1px solid #1a2540', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
                        <span style={{ fontSize:11, fontWeight:'700', color:'#64748b' }}>
                            <FolderOpen size={11} style={{ marginRight:4, verticalAlign:'middle' }}/>프로젝트
                        </span>
                        <button onClick={openAddModal}
                            style={{ display:'flex', alignItems:'center', gap:3, background:'#0d1f3c', border:'1px solid #1e3a5f', borderRadius:6, color:'#818cf8', padding:'3px 8px', fontSize:10, fontWeight:'700', cursor:'pointer' }}>
                            <Plus size={10}/> 추가
                        </button>
                    </div>
                    <div style={{ flex:1, overflowY:'auto' }}>
                        {projects.length === 0 ? (
                            <div style={{ padding:20, textAlign:'center', color:'#374151', fontSize:12 }}>
                                <p style={{ marginBottom:10 }}>등록된 프로젝트 없음</p>
                                <button onClick={openAddModal}
                                    style={{ background:'#0d1f3c', border:'1px solid #1e3a5f', borderRadius:8, color:'#818cf8', padding:'8px 14px', fontSize:11, fontWeight:'700', cursor:'pointer' }}>
                                    + 프로젝트 추가
                                </button>
                            </div>
                        ) : projects.map(p => {
                            const isActive = selProject === p.id;
                            return (
                                <div key={p.id} onClick={() => setSelProject(p.id)}
                                    style={{ padding:'9px 10px', cursor:'pointer', borderBottom:'1px solid #0a1120', background: isActive ? '#0d1f3c' : 'transparent', borderLeft:`3px solid ${isActive ? '#818cf8' : 'transparent'}`, transition:'all 0.15s' }}>
                                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                                        <div style={{ flex:1, minWidth:0 }}>
                                            <div style={{ fontWeight:'700', fontSize:12, color: isActive ? '#e2e8f0' : '#94a3b8', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.name}</div>
                                            {(p.execNo || p.client) && (
                                                <div style={{ fontSize:10, color:'#475569', marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                                    {p.execNo && <span style={{ color:'#6366f1', fontWeight:'700' }}>[{p.execNo}] </span>}
                                                    {p.client}{p.site ? ` · ${p.site}` : ''}
                                                </div>
                                            )}
                                        </div>
                                        {isActive && (
                                            <div style={{ display:'flex', gap:3, flexShrink:0, marginLeft:4 }}>
                                                <IconBtn onClick={e => { e.stopPropagation(); openEditModal(p); }}><Pencil size={10}/></IconBtn>
                                                <IconBtn onClick={e => { e.stopPropagation(); if (window.confirm(`"${p.name}" 프로젝트를 삭제하시겠습니까?`)) handleProjDelete(p.id); }}><Trash2 size={10}/></IconBtn>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* 우: 입력 폼 */}
                <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
                    {!selProject || !selProj ? (
                        <Center>
                            <div style={{ textAlign:'center', color:'#374151' }}>
                                <FolderOpen size={32} style={{ marginBottom:12, opacity:0.4 }}/>
                                <p style={{ fontSize:13 }}>← 프로젝트를 선택하세요</p>
                            </div>
                        </Center>
                    ) : (
                        <div style={{ flex:1, overflowY:'auto', padding:'16px 20px' }}>

                            {/* 프로젝트 정보 */}
                            <div style={{ marginBottom:14, padding:'10px 14px', background:'#04090f', border:'1px solid #1a2540', borderRadius:10, display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
                                <div style={{ flex:1, minWidth:0 }}>
                                    <div style={{ fontWeight:'800', fontSize:15, color:'#e2e8f0' }}>{selProj.name}</div>
                                    <div style={{ fontSize:11, color:'#64748b', marginTop:2 }}>
                                        {selProj.execNo
                                            ? <span style={{ color:'#818cf8', fontWeight:'700', marginRight:6 }}>[실행번호: {selProj.execNo}]</span>
                                            : <span style={{ color:'#ef4444', fontWeight:'600', marginRight:6 }}>⚠ 실행번호 없음 (적용 불가)</span>}
                                        {selProj.client}{selProj.site ? ` · ${selProj.site}` : ''}
                                        {selProj.startDate && ` · ${selProj.startDate} ~`}
                                    </div>
                                </div>
                                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                                    {hasData
                                        ? <><CheckCircle2 size={13} color="#34d399"/><span style={{ fontSize:11, color:'#34d399', fontWeight:'600' }}>입력됨</span></>
                                        : <><Circle size={13} color="#374151"/><span style={{ fontSize:11, color:'#374151' }}>미입력</span></>}
                                </div>
                            </div>

                            {/* 주차 표시 */}
                            <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap' }}>
                                <div style={{ fontSize:11, color:'#64748b', fontWeight:'600', background:'#080f1e', border:'1px solid #1e293b', borderRadius:8, padding:'5px 14px' }}>
                                    📅 지난주: {fmtWeek(addWeeks(weekOf, -1))}
                                </div>
                                <div style={{ fontSize:11, color:'#c7d2fe', fontWeight:'700', background:'#0d1f3c', border:'1px solid #3b4f78', borderRadius:8, padding:'5px 14px' }}>
                                    📅 금주: {fmtWeek(weekOf)}
                                </div>
                            </div>

                            {/* 진행실적 입력 테이블 */}
                            <div style={{ marginBottom:16, border:'1px solid #1e2a3a', borderRadius:8, overflow:'hidden' }}>
                                <table style={{ width:'100%', borderCollapse:'collapse', fontFamily:'inherit', fontSize:12 }}>
                                    <thead>
                                        <tr>
                                            <th style={{ padding:'8px 14px', textAlign:'left', color:'#64748b', fontWeight:'700', width:'42%', borderBottom:'1px solid #1e2a3a', background:'#080f1e' }}>항목</th>
                                            <th style={{ padding:'8px 14px', textAlign:'center', color:'#94a3b8', fontWeight:'700', width:'29%', borderBottom:'1px solid #1e2a3a', background:'#080f1e', borderLeft:'1px solid #1e2a3a' }}>지난주</th>
                                            <th style={{ padding:'8px 14px', textAlign:'center', color:'#c7d2fe', fontWeight:'700', width:'29%', borderBottom:'1px solid #1e2a3a', background:'#0d1f3c', borderLeft:'1px solid #1e2a3a' }}>금주</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {ITEMS.map(({ key, label, color, section }, idx) => {
                                            const isFirstComm = section === 'comm' && ITEMS[idx-1]?.section !== 'comm';
                                            const lastVal = form[`${key}_last`];
                                            const currVal = form[`${key}_curr`];
                                            return (
                                                <React.Fragment key={key}>
                                                    {isFirstComm && (
                                                        <tr>
                                                            <td colSpan={3} style={{ padding:'4px 14px', background:'#030710', borderTop:'2px solid #1e2a3a', borderBottom:'1px solid #1e2a3a' }}>
                                                                <span style={{ fontSize:10, fontWeight:'800', color:'#334155', letterSpacing:'0.1em' }}>시운전</span>
                                                            </td>
                                                        </tr>
                                                    )}
                                                    <tr style={{ borderBottom:'1px solid #0f1929' }}>
                                                        <td style={{ padding:'6px 14px', background:'#040910' }}>
                                                            <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                                                                <div style={{ width:3, height:14, background:color, borderRadius:2, flexShrink:0 }}/>
                                                                <span style={{ color:'#94a3b8', fontWeight:'600' }}>{label}</span>
                                                            </div>
                                                        </td>
                                                        <td style={{ padding:'4px 8px', background:'#04090f', borderLeft:'1px solid #0f1929' }}>
                                                            <input type="number" min="0"
                                                                value={lastVal}
                                                                onChange={e => setField(`${key}_last`, e.target.value)}
                                                                placeholder="0"
                                                                style={numStyle(lastVal)}/>
                                                        </td>
                                                        <td style={{ padding:'4px 8px', background:'#060d1c', borderLeft:'1px solid #0f1929' }}>
                                                            <input type="number" min="0"
                                                                value={currVal}
                                                                onChange={e => setField(`${key}_curr`, e.target.value)}
                                                                placeholder="0"
                                                                style={numStyle(currVal, '#818cf8')}/>
                                                        </td>
                                                    </tr>
                                                </React.Fragment>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* 이슈 / 특이사항 */}
                            <Field label="이슈 / 리스크 (금주)" icon={<AlertTriangle size={13}/>} accent="#f59e0b">
                                <textarea value={form.issues}
                                    onChange={e => setField('issues', e.target.value)}
                                    placeholder={"· 고압반 납기 지연 → 시운전 일정 영향 검토 중\n· UPS 설치 지연 (현장 반입 협의 필요)"}
                                    rows={3}
                                    style={{ ...taStyle, borderColor: form.issues ? '#f59e0b44' : '#1e2a3a' }}/>
                            </Field>
                            <Field label="특이사항 (금주, 선택)" icon={<ClipboardList size={13}/>}>
                                <textarea value={form.memo}
                                    onChange={e => setField('memo', e.target.value)}
                                    placeholder="기타 전달사항, 고객 요청사항 등"
                                    rows={2}
                                    style={taStyle}/>
                            </Field>

                            {/* 하단 버튼 */}
                            <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:8, paddingBottom:24 }}>
                                <Btn onClick={handleApply} color="#10b981" style={{ padding:'9px 24px', fontSize:12 }} disabled={isApplying}>
                                    <Zap size={13}/> {isApplying ? '적용 중...' : '적용 → 진행실적등록'}
                                </Btn>
                                <Btn onClick={handleSave} color="#6366f1" style={{ padding:'9px 22px', fontSize:12 }} disabled={isSaving}>
                                    <Save size={13}/> {isSaving ? '저장 중...' : '저장'}
                                </Btn>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </Page>
    );
};

// ─── 스타일 헬퍼 ──────────────────────────────────────────────────────────────
const numStyle = (val, activeColor = '#93c5fd') => ({
    width:'100%', background: val ? `${activeColor}12` : '#04090f',
    border:`1px solid ${val ? activeColor+'55' : '#1e2a3a'}`,
    borderRadius:6, color: val ? activeColor : '#334155',
    padding:'5px 8px', fontSize:13, fontWeight: val ? 700 : 400,
    outline:'none', textAlign:'center', boxSizing:'border-box', colorScheme:'dark',
});

const taStyle = {
    width:'100%', background:'#04090f', border:'1px solid #1e2a3a',
    borderRadius:8, color:'#e2e8f0', padding:'8px 12px', fontSize:13,
    outline:'none', colorScheme:'dark', fontFamily:'inherit', resize:'vertical', lineHeight:1.6,
};

// ─── 서브 컴포넌트 ────────────────────────────────────────────────────────────
const Field = ({ label, icon, accent='#64748b', children }) => (
    <div style={{ marginBottom:18 }}>
        <label style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, fontWeight:'700', color:accent, marginBottom:7 }}>
            <span style={{ color:accent }}>{icon}</span> {label}
        </label>
        {children}
    </div>
);

const Page = ({ children }) => (
    <div style={{ height:'100vh', display:'flex', flexDirection:'column', background:'#020617', color:'white', overflow:'hidden' }}>
        {children}
    </div>
);
const Header = ({ children }) => (
    <header style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 14px', background:'#080f1e', borderBottom:'1px solid #1a2540', flexShrink:0 }}>
        {children}
    </header>
);
const Title = ({ children }) => (
    <span style={{ fontWeight:'bold', fontSize:13, color:'#e2e8f0' }}>{children}</span>
);
const TeamTag = ({ children }) => (
    <span style={{ fontSize:11, color:'#818cf8', background:'#1e1b4b', border:'1px solid #818cf833', borderRadius:6, padding:'2px 8px', fontWeight:'600' }}>
        {children}
    </span>
);
const Center = ({ children }) => (
    <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:32 }}>
        {children}
    </div>
);
const IconBox = ({ color, children }) => (
    <div style={{ width:56, height:56, background:`${color}22`, border:`1.5px solid ${color}55`, borderRadius:16, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
        {children}
    </div>
);
const TeamBtn = ({ onClick, children }) => (
    <button onClick={onClick}
        style={{ padding:'12px 20px', background:'#080f1e', border:'1px solid #1a2540', borderRadius:10, color:'#e2e8f0', fontWeight:'600', fontSize:14, cursor:'pointer', textAlign:'left', transition:'all 0.15s' }}
        onMouseEnter={e => { e.currentTarget.style.borderColor='#818cf8'; e.currentTarget.style.background='#1e1b4b'; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor='#1a2540'; e.currentTarget.style.background='#080f1e'; }}>
        {children}
    </button>
);
const NavBtn = ({ onClick, children }) => {
    const [h, setH] = useState(false);
    return (
        <button onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
            style={{ display:'flex', alignItems:'center', gap:4, background:'none', border:'1px solid #1a2540', borderRadius:7, color:h?'#e2e8f0':'#64748b', padding:'4px 10px', fontSize:11, fontWeight:'600', cursor:'pointer', transition:'all 0.15s' }}>
            {children}
        </button>
    );
};
const Btn = ({ onClick, color, children, small, style: extra, disabled }) => {
    const [h, setH] = useState(false);
    return (
        <button onClick={disabled ? undefined : onClick}
            onMouseEnter={() => !disabled && setH(true)}
            onMouseLeave={() => setH(false)}
            style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', gap:5,
                padding: small ? '4px 10px' : '7px 18px',
                borderRadius:8, border:`1px solid ${color ? color+'55' : '#1a2540'}`,
                background: disabled ? '#111827' : (h ? (color || '#1e2a3a') : (color ? color+'22' : '#0a1120')),
                color: disabled ? '#374151' : (h ? '#fff' : (color || '#94a3b8')),
                fontSize: small ? 10 : 12, fontWeight:'700', cursor: disabled ? 'default' : 'pointer',
                transition:'all 0.15s', whiteSpace:'nowrap', opacity: disabled ? 0.6 : 1, ...extra }}>
            {children}
        </button>
    );
};
const IconBtn = ({ onClick, children }) => (
    <button onClick={onClick}
        style={{ background:'none', border:'none', cursor:'pointer', color:'#475569', display:'flex', padding:2, borderRadius:4, transition:'color 0.15s' }}
        onMouseEnter={e => e.currentTarget.style.color='#818cf8'}
        onMouseLeave={e => e.currentTarget.style.color='#475569'}>
        {children}
    </button>
);
const WeekNav = ({ weekOf, setWeekOf }) => (
    <div style={{ display:'flex', alignItems:'center', gap:2, marginLeft:4, background:'#0f172a', border:'1px solid #1e293b', borderRadius:8, padding:'2px 6px' }}>
        <button onClick={() => setWeekOf(w => addWeeks(w, -1))}
            style={{ background:'none', border:'none', cursor:'pointer', color:'#64748b', display:'flex', padding:'2px 4px', borderRadius:4 }}
            onMouseEnter={e => e.currentTarget.style.color='#e2e8f0'}
            onMouseLeave={e => e.currentTarget.style.color='#64748b'}>
            <ChevronLeft size={13}/>
        </button>
        <span style={{ fontSize:11, fontWeight:'600', color:'#cbd5e1', minWidth:120, textAlign:'center' }}>
            금주: {fmtWeek(weekOf).split(' ~ ')[0]}
        </span>
        <button onClick={() => setWeekOf(w => addWeeks(w, 1))}
            style={{ background:'none', border:'none', cursor:'pointer', color:'#64748b', display:'flex', padding:'2px 4px', borderRadius:4 }}
            onMouseEnter={e => e.currentTarget.style.color='#e2e8f0'}
            onMouseLeave={e => e.currentTarget.style.color='#64748b'}>
            <ChevronRight size={13}/>
        </button>
    </div>
);

export default WeeklySummaryScreen;
