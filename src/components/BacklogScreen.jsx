import React, { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ClipboardList, Search, Clock, FolderOpen, ChevronDown, ChevronRight } from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db, appId } from '../firebase';
import { subscribeAuditLog } from '../auditLog';

// ─────────────────────────────────────────────────────────────────────────
// 작업 백로그 화면 — "누가·언제·무엇을 수정/추가/삭제/보류 했는지" 시간순.
//   · teams(배열) 구독. 랜딩(팀 미선택)=전체 팀 병합, 팀 안=그 팀만.
//   · 사람 이름은 registeredUsers 명단에서 이메일→이름 변환.
//   · 필터: 팀(여러 팀일 때) · 사람 · 동작 · 기간 · 검색. 전원 공개.
//   (2026-07-10 신설 / 여러 팀 병합 지원)
// ─────────────────────────────────────────────────────────────────────────

const ACTION_STYLE = {
    '수정': { bg: '#eef2fb', color: '#1e7ac8', border: '#cfe0f2' },
    '추가': { bg: '#ecfdf5', color: '#047857', border: '#a7f3d0' },
    '삭제': { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
    '보류': { bg: '#fffbeb', color: '#b45309', border: '#fde68a' },
    '복구': { bg: '#f0f9ff', color: '#0369a1', border: '#bae6fd' },
};
const actionStyle = (a) => ACTION_STYLE[a] || { bg: '#f1f5f9', color: '#475569', border: '#e2e8f0' };

// ★ 같은 프로젝트 식별 키 (2026-07-14) — 이름이 바뀌어도 흩어지지 않도록 고유 ID 우선
const projKeyOf = (e) => String(e.pid || e.projectId || e.projectName || '(알수없음)');

export default function BacklogScreen({ teams, onBack }) {
    const teamList = useMemo(
        () => (Array.isArray(teams) ? teams.filter(Boolean) : (teams ? [teams] : [])),
        [teams]
    );
    const multiTeam = teamList.length > 1;

    const [entries, setEntries] = useState([]);
    const [userMap, setUserMap] = useState({});
    const [loading, setLoading] = useState(true);
    const [fTeam, setFTeam] = useState('');
    const [fProject, setFProject] = useState('');       // ★ 프로젝트 필터 (2026-07-14)
    const [groupMode, setGroupMode] = useState(false);  // ★ false=시간순, true=프로젝트별 (2026-07-14)
    const [openKeys, setOpenKeys] = useState(new Set()); // 프로젝트별 보기에서 펼친 카드
    const [fPerson, setFPerson] = useState('');
    const [fAction, setFAction] = useState('');
    const [fPeriod, setFPeriod] = useState('전체');   // '전체' | '0'(오늘) | '7' | '30'
    const [q, setQ] = useState('');

    // 감사로그 구독 — 여러 팀 각각 구독 후 병합(최신순)
    useEffect(() => {
        if (!teamList.length) { setEntries([]); setLoading(false); return; }
        setLoading(true);
        const byTeam = {};
        const unsubs = teamList.map(t => subscribeAuditLog(t, (list) => {
            byTeam[t] = list.map(e => ({ ...e, _team: t }));
            const merged = Object.values(byTeam).flat().sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
            setEntries(merged);
            setLoading(false);
        }, 1000));
        return () => unsubs.forEach(u => u && u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [teamList.join(',')]);

    // 사용자 명단 구독 (이메일 → 이름)
    useEffect(() => {
        const ref = collection(db, 'artifacts', appId, 'public', 'data', 'registeredUsers');
        const unsub = onSnapshot(ref, (snap) => {
            const m = {};
            snap.docs.forEach(d => { const u = d.data(); if (u && u.email) m[u.email] = u.displayName || u.email; });
            setUserMap(m);
        }, () => {});
        return unsub;
    }, []);

    const nameOf = (email) => userMap[email] || (email ? String(email).split('@')[0] : '(알수없음)');
    const fmtDt = (iso) => {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return iso || '';
        const p = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}  ${p(d.getHours())}:${p(d.getMinutes())}`;
    };

    const fmtDay = (iso) => {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return iso || '';
        const p = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    };

    const persons = useMemo(() => [...new Set(entries.map(e => e.who).filter(Boolean))], [entries]);

    // ★ 프로젝트 목록 — 고유 키로 묶고 최신 이름·건수·최근 수정일 계산 (entries가 최신순이라 첫 등장이 최신 이름)
    const projects = useMemo(() => {
        const m = new Map();
        entries.forEach(e => {
            const k = projKeyOf(e);
            if (!m.has(k)) m.set(k, { key: k, name: e.projectName || '(이름 없음)', execNo: e.execNo || '', team: e._team, count: 0, lastTs: e.ts });
            const o = m.get(k);
            o.count += 1;
            if (!o.execNo && e.execNo) o.execNo = e.execNo;
            if (String(e.ts) > String(o.lastTs)) o.lastTs = e.ts;
        });
        return [...m.values()].sort((a, b) => String(b.lastTs).localeCompare(String(a.lastTs)));
    }, [entries]);

    const filtered = useMemo(() => {
        const now = Date.now();
        const days = fPeriod === '전체' ? null : Number(fPeriod);
        const ql = q.trim().toLowerCase();
        return entries.filter(e => {
            if (fTeam && e._team !== fTeam) return false;
            if (fProject && projKeyOf(e) !== fProject) return false;
            if (fPerson && e.who !== fPerson) return false;
            if (fAction && e.action !== fAction) return false;
            if (days !== null) {
                const t = new Date(e.ts).getTime();
                const cutoff = days === 0 ? new Date().setHours(0, 0, 0, 0) : now - days * 86400000;
                if (!(t >= cutoff)) return false;
            }
            if (ql) {
                const hay = [e.projectName, e.execNo, nameOf(e.who), e.action, e._team,
                    ...((e.changes || []).flatMap(c => [c.field, c.from, c.to]))].join(' ').toLowerCase();
                if (!hay.includes(ql)) return false;
            }
            return true;
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [entries, fTeam, fProject, fPerson, fAction, fPeriod, q, userMap]);

    // ★ 프로젝트별 보기 — 필터를 통과한 기록만 프로젝트 카드로 묶는다 (2026-07-14)
    const grouped = useMemo(() => {
        const m = new Map();
        filtered.forEach(e => {
            const k = projKeyOf(e);
            if (!m.has(k)) m.set(k, { key: k, name: e.projectName || '(이름 없음)', execNo: e.execNo || '', team: e._team, items: [], people: new Set() });
            const g = m.get(k);
            g.items.push(e);
            if (e.who) g.people.add(e.who);
            if (!g.execNo && e.execNo) g.execNo = e.execNo;
        });
        // filtered가 최신순 → 각 묶음의 items[0]이 최신. 카드도 최근 수정 프로젝트가 위로.
        return [...m.values()].sort((a, b) => String(b.items[0]?.ts).localeCompare(String(a.items[0]?.ts)));
    }, [filtered]);

    const toggleOpen = (k) => setOpenKeys(prev => {
        const n = new Set(prev);
        if (n.has(k)) n.delete(k); else n.add(k);
        return n;
    });

    const selSt = { fontSize: 12, padding: '6px 10px', border: '1px solid #c4ccd8', borderRadius: 7, color: '#333', background: '#fff', outline: 'none', cursor: 'pointer' };
    const titleTeam = multiTeam ? '전체 팀' : (teamList[0] || '');
    const hasFilter = fTeam || fProject || fPerson || fAction || fPeriod !== '전체' || q;

    // 기록 한 건 렌더 — 시간순·프로젝트별 공용. inGroup이면 프로젝트명 줄 생략(카드 제목과 중복)
    const renderEntry = (e, inGroup) => {
        const st = actionStyle(e.action);
        return (
            <div key={e.id} style={{ background: '#fff', border: '1px solid #e5eaf3', borderRadius: 10, padding: '10px 14px', boxShadow: inGroup ? 'none' : '0 1px 2px rgba(16,24,40,0.03)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#94a3b8', minWidth: 128 }}>{fmtDt(e.ts)}</span>
                    <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 9px', borderRadius: 20, background: st.bg, color: st.color, border: `1px solid ${st.border}` }}>{e.action}</span>
                    {multiTeam && e._team && !inGroup && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 5, padding: '1px 6px' }}>{e._team}</span>
                    )}
                    <span style={{ fontSize: 13, fontWeight: 800, color: '#1e293b' }}>{nameOf(e.who)}</span>
                    {!inGroup && (
                        <span onClick={() => setFProject(projKeyOf(e))} title="이 프로젝트의 기록만 보기"
                            style={{ fontSize: 13, color: '#475569', fontWeight: 600, cursor: 'pointer', borderBottom: '1px dashed #cbd5e1' }}>
                            {e.projectName || '(이름 없음)'}
                            {e.execNo ? <span style={{ color: '#94a3b8', fontWeight: 400 }}> · {e.execNo}</span> : null}
                        </span>
                    )}
                </div>
                {Array.isArray(e.changes) && e.changes.length > 0 && (
                    <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3, paddingLeft: 136 }}>
                        {e.changes.map((c, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 12, flexWrap: 'wrap' }}>
                                <span style={{ fontWeight: 800, color: '#4a5a80', minWidth: 90 }}>{c.field}</span>
                                <span style={{ color: '#cc2a2a', textDecoration: 'line-through' }}>{c.from || '—'}</span>
                                <span style={{ color: '#9aa8b8' }}>→</span>
                                <span style={{ color: '#0a6a28', fontWeight: 700 }}>{c.to || '—'}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div style={{ minHeight: '100vh', background: '#f4f7fb', fontFamily: 'Pretendard, system-ui, sans-serif' }}>
            {/* 헤더 */}
            <div style={{ background: '#fff', borderBottom: '1.5px solid #dbe2ee', padding: '12px 22px', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 10 }}>
                <button onClick={onBack}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 700, color: '#475569', background: '#f1f5f9', border: '1px solid #dbe2ee', borderRadius: 8, padding: '7px 12px', cursor: 'pointer' }}>
                    <ChevronLeft size={15} /> 뒤로 가기
                </button>
                <ClipboardList size={18} style={{ color: '#1e7ac8' }} />
                <span style={{ fontSize: 16, fontWeight: 800, color: '#1e293b' }}>작업 백로그</span>
                {titleTeam && <span style={{ fontSize: 12, fontWeight: 700, color: '#1e7ac8', background: '#eef2fb', border: '1px solid #cfe0f2', borderRadius: 6, padding: '2px 8px' }}>{titleTeam}</span>}
                <span style={{ fontSize: 12, color: '#8a97a8' }}>— 누가·언제·무엇을 바꿨는지 (전원 공개)</span>
                {/* 보기 전환: 시간순 / 프로젝트별 (2026-07-14) */}
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ display: 'flex', border: '1px solid #c4ccd8', borderRadius: 8, overflow: 'hidden' }}>
                        <button onClick={() => setGroupMode(false)}
                            style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, padding: '6px 11px', cursor: 'pointer', border: 'none', background: groupMode ? '#fff' : '#1e7ac8', color: groupMode ? '#64748b' : '#fff' }}>
                            <Clock size={13} /> 시간순
                        </button>
                        <button onClick={() => setGroupMode(true)}
                            style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, padding: '6px 11px', cursor: 'pointer', border: 'none', borderLeft: '1px solid #c4ccd8', background: groupMode ? '#1e7ac8' : '#fff', color: groupMode ? '#fff' : '#64748b' }}>
                            <FolderOpen size={13} /> 프로젝트별
                        </button>
                    </div>
                    <span style={{ fontSize: 12, color: '#64748b' }}>
                        {groupMode
                            ? <span>프로젝트 <b style={{ color: '#1e7ac8' }}>{grouped.length}</b>개 · 기록 {filtered.length}건</span>
                            : <span>표시 <b style={{ color: '#1e7ac8' }}>{filtered.length}</b> / 전체 {entries.length}건</span>}
                    </span>
                </div>
            </div>

            {/* 필터 바 */}
            <div style={{ background: '#fff', borderBottom: '1px solid #e6ecf5', padding: '10px 22px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                {multiTeam && (
                    <select value={fTeam} onChange={e => setFTeam(e.target.value)} style={selSt}>
                        <option value="">팀 — 전체</option>
                        {teamList.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                )}
                {/* ★ 프로젝트 필터 — 최근 수정순 (2026-07-14) */}
                <select value={fProject} onChange={e => setFProject(e.target.value)}
                    style={{ ...selSt, maxWidth: 320, minWidth: 150 }}
                    title={fProject ? (projects.find(x => x.key === fProject)?.name || '') : '프로젝트 선택'}>
                    <option value="">프로젝트 — 전체 ({projects.length})</option>
                    {projects.map(x => <option key={x.key} value={x.key}>{x.name} ({x.count})</option>)}
                </select>
                <select value={fPerson} onChange={e => setFPerson(e.target.value)} style={selSt}>
                    <option value="">사람 — 전체</option>
                    {persons.map(p => <option key={p} value={p}>{nameOf(p)}</option>)}
                </select>
                <select value={fAction} onChange={e => setFAction(e.target.value)} style={selSt}>
                    <option value="">동작 — 전체</option>
                    {['수정', '추가', '삭제', '보류', '복구'].map(a => <option key={a} value={a}>{a}</option>)}
                </select>
                <select value={fPeriod} onChange={e => setFPeriod(e.target.value)} style={selSt}>
                    <option value="전체">기간 — 전체</option>
                    <option value="0">오늘</option>
                    <option value="7">최근 7일</option>
                    <option value="30">최근 30일</option>
                </select>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid #c4ccd8', borderRadius: 7, padding: '6px 10px', background: '#fff', minWidth: 220, flex: 1, maxWidth: 380 }}>
                    <Search size={14} style={{ color: '#94a3b8' }} />
                    <input value={q} onChange={e => setQ(e.target.value)} placeholder="프로젝트·항목·값·이름 검색"
                        style={{ border: 'none', outline: 'none', fontSize: 12, color: '#333', background: 'transparent', width: '100%' }} />
                </div>
                {hasFilter && (
                    <button onClick={() => { setFTeam(''); setFProject(''); setFPerson(''); setFAction(''); setFPeriod('전체'); setQ(''); }}
                        style={{ fontSize: 12, fontWeight: 700, color: '#dc2626', background: '#fff', border: '1px solid #fecaca', borderRadius: 7, padding: '6px 10px', cursor: 'pointer' }}>
                        × 필터 초기화
                    </button>
                )}
            </div>

            {/* 목록 */}
            <div style={{ padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 1100, margin: '0 auto' }}>
                {loading ? (
                    <div style={{ textAlign: 'center', color: '#8a97a8', fontSize: 13, padding: '60px 0' }}>불러오는 중…</div>
                ) : filtered.length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#8a97a8', fontSize: 13, padding: '60px 0' }}>
                        {entries.length === 0 ? '아직 기록이 없습니다. 프로젝트를 수정하면 여기에 쌓입니다.' : '조건에 맞는 기록이 없습니다.'}
                    </div>
                ) : groupMode ? (
                    /* ★ 프로젝트별 보기 — 카드 클릭 시 그 프로젝트의 기록이 펼쳐진다 (2026-07-14) */
                    grouped.map(g => {
                        const open = openKeys.has(g.key);
                        const last = g.items[0];
                        return (
                            <div key={g.key} style={{ background: '#fff', border: '1px solid #e5eaf3', borderRadius: 10, boxShadow: '0 1px 2px rgba(16,24,40,0.03)', overflow: 'hidden' }}>
                                <div onClick={() => toggleOpen(g.key)}
                                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', cursor: 'pointer', background: open ? '#f8fafc' : '#fff' }}>
                                    {open
                                        ? <ChevronDown size={16} style={{ color: '#1e7ac8', flexShrink: 0 }} />
                                        : <ChevronRight size={16} style={{ color: '#94a3b8', flexShrink: 0 }} />}
                                    <span title={g.name}
                                        style={{ fontSize: 13, fontWeight: 800, color: '#1e293b', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {g.name}
                                        {g.execNo ? <span style={{ color: '#94a3b8', fontWeight: 500 }}> · {g.execNo}</span> : null}
                                    </span>
                                    {multiTeam && g.team && (
                                        <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 5, padding: '1px 6px', flexShrink: 0 }}>{g.team}</span>
                                    )}
                                    <span title="이 프로젝트를 고친 사람" style={{ fontSize: 11, color: '#64748b', flexShrink: 0, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {[...g.people].map(nameOf).join(', ')}
                                    </span>
                                    <span title="최근 수정일" style={{ fontSize: 11, fontFamily: 'monospace', color: '#94a3b8', flexShrink: 0 }}>
                                        {fmtDay(last && last.ts)}
                                    </span>
                                    <span style={{ fontSize: 11, fontWeight: 800, color: '#1e7ac8', background: '#eef2fb', border: '1px solid #cfe0f2', borderRadius: 20, padding: '2px 9px', flexShrink: 0 }}>
                                        {g.items.length}건
                                    </span>
                                </div>
                                {open && (
                                    <div style={{ borderTop: '1px solid #e5eaf3', background: '#fbfcfe', padding: '8px 10px 10px 28px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        {g.items.map(e => renderEntry(e, true))}
                                    </div>
                                )}
                            </div>
                        );
                    })
                ) : (
                    /* 시간순 보기 — 프로젝트명을 클릭하면 그 프로젝트만 걸러진다 */
                    filtered.map(e => renderEntry(e, false))
                )}
            </div>
        </div>
    );
}
