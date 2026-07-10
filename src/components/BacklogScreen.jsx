import React, { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ClipboardList, Search } from 'lucide-react';
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

    const persons = useMemo(() => [...new Set(entries.map(e => e.who).filter(Boolean))], [entries]);

    const filtered = useMemo(() => {
        const now = Date.now();
        const days = fPeriod === '전체' ? null : Number(fPeriod);
        const ql = q.trim().toLowerCase();
        return entries.filter(e => {
            if (fTeam && e._team !== fTeam) return false;
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
    }, [entries, fTeam, fPerson, fAction, fPeriod, q, userMap]);

    const selSt = { fontSize: 12, padding: '6px 10px', border: '1px solid #c4ccd8', borderRadius: 7, color: '#333', background: '#fff', outline: 'none', cursor: 'pointer' };
    const titleTeam = multiTeam ? '전체 팀' : (teamList[0] || '');

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
                <span style={{ marginLeft: 'auto', fontSize: 12, color: '#64748b' }}>
                    표시 <b style={{ color: '#1e7ac8' }}>{filtered.length}</b> / 전체 {entries.length}건
                </span>
            </div>

            {/* 필터 바 */}
            <div style={{ background: '#fff', borderBottom: '1px solid #e6ecf5', padding: '10px 22px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                {multiTeam && (
                    <select value={fTeam} onChange={e => setFTeam(e.target.value)} style={selSt}>
                        <option value="">팀 — 전체</option>
                        {teamList.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                )}
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
                {(fTeam || fPerson || fAction || fPeriod !== '전체' || q) && (
                    <button onClick={() => { setFTeam(''); setFPerson(''); setFAction(''); setFPeriod('전체'); setQ(''); }}
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
                ) : filtered.map((e) => {
                    const st = actionStyle(e.action);
                    return (
                        <div key={e.id} style={{ background: '#fff', border: '1px solid #e5eaf3', borderRadius: 10, padding: '10px 14px', boxShadow: '0 1px 2px rgba(16,24,40,0.03)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#94a3b8', minWidth: 128 }}>{fmtDt(e.ts)}</span>
                                <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 9px', borderRadius: 20, background: st.bg, color: st.color, border: `1px solid ${st.border}` }}>{e.action}</span>
                                {multiTeam && e._team && <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 5, padding: '1px 6px' }}>{e._team}</span>}
                                <span style={{ fontSize: 13, fontWeight: 800, color: '#1e293b' }}>{nameOf(e.who)}</span>
                                <span style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>
                                    {e.projectName || '(이름 없음)'}
                                    {e.execNo ? <span style={{ color: '#94a3b8', fontWeight: 400 }}> · {e.execNo}</span> : null}
                                </span>
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
                })}
            </div>
        </div>
    );
}
