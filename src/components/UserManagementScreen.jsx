import React, { useState, useEffect } from 'react';
import { collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import {
    Users, Plus, Trash2, Edit2, X, ChevronLeft,
    Shield, UserCheck, UserX, CheckCircle, AlertCircle, Mail, Lock, Key
} from 'lucide-react';

const accent  = '#1e7ac8';
const border  = '#c4ccd8';
const bgHead  = '#dce3ec';
const bgLight = '#edf1f7';

const ROLES = [
    { value: 'admin', label: '관리자' },
    { value: 'user',  label: '일반사용자' },
];

export default function UserManagementScreen({ db, appId, currentUserEmail, onCreateSharedAccount, onUpdateSharedPassword, onBack }) {
    const [users,        setUsers]        = useState([]);
    const [loading,      setLoading]      = useState(true);
    const [modal,        setModal]        = useState(null);  // null | { mode:'add'|'edit', data?:{} }
    const [accountType,  setAccountType]  = useState('email'); // 'email' | 'shared'
    const [form,         setForm]         = useState({ email: '', username: '', password: '', displayName: '', role: 'user', active: true });
    const [newPassword,  setNewPassword]  = useState('');   // 공용 계정 비밀번호 변경용
    const [saving,       setSaving]       = useState(false);
    const [formError,    setFormError]    = useState('');
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [toast,        setToast]        = useState('');

    const colRef = () => collection(db, 'artifacts', appId, 'public', 'data', 'registeredUsers');
    const docRef = (id) => doc(db, 'artifacts', appId, 'public', 'data', 'registeredUsers', id);

    const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

    useEffect(() => {
        if (!db) return;
        const unsub = onSnapshot(colRef(), (snap) => {
            const list = snap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
            setUsers(list);
            setLoading(false);
        }, () => setLoading(false));
        return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [db]);

    const openAdd = () => {
        setForm({ email: '', username: '', password: '', displayName: '', role: 'user', active: true });
        setFormError('');
        setAccountType('email');
        setModal({ mode: 'add' });
    };

    const openEdit = (u) => {
        setForm({ email: u.email, username: u.username || '', password: '', displayName: u.displayName || '', role: u.role || 'user', active: u.active !== false });
        setNewPassword('');
        setFormError('');
        setModal({ mode: 'edit', data: u });
    };

    const handleSave = async () => {
        setFormError('');
        if (modal.mode === 'add') {
            if (accountType === 'shared') {
                // 공용 계정 생성
                const username = form.username.trim();
                const password = form.password.trim();
                const displayName = form.displayName.trim();
                if (!username)    { setFormError('아이디를 입력하세요.'); return; }
                if (!password)    { setFormError('비밀번호를 입력하세요.'); return; }
                if (password.length < 6) { setFormError('비밀번호는 6자 이상이어야 합니다.'); return; }
                setSaving(true);
                const result = await onCreateSharedAccount(username, password, displayName || username, form.role);
                setSaving(false);
                if (!result.success) { setFormError(result.error || '계정 생성 중 오류가 발생했습니다.'); return; }
                setModal(null);
                showToast('공용 계정이 생성됐습니다.');
                return;
            } else {
                // 일반 이메일 계정 등록
                const email = form.email.trim();
                const displayName = form.displayName.trim();
                if (!email)       { setFormError('이메일을 입력하세요.'); return; }
                if (!displayName) { setFormError('이름을 입력하세요.'); return; }
                if (users.find(u => u.email === email)) { setFormError('이미 등록된 이메일입니다.'); return; }
                setSaving(true);
                try {
                    const data = { email, displayName, role: form.role, active: true, createdAt: new Date().toISOString(), addedBy: currentUserEmail || '' };
                    await setDoc(docRef(email), data);
                    setModal(null);
                    showToast('사용자가 등록됐습니다.');
                } catch { setFormError('저장 중 오류가 발생했습니다.'); }
                finally { setSaving(false); }
                return;
            }
        }

        // 수정 모드
        const displayName = form.displayName.trim();
        if (!displayName) { setFormError('이름을 입력하세요.'); return; }

        // 공용 계정 비밀번호 변경 요청이 있을 때
        const pwTrimmed = newPassword.trim();
        if (modal.data.isSharedAccount && pwTrimmed) {
            if (pwTrimmed.length < 6) { setFormError('새 비밀번호는 6자 이상이어야 합니다.'); return; }
            setSaving(true);
            const pwResult = await onUpdateSharedPassword(modal.data.username, pwTrimmed);
            if (!pwResult.success) { setFormError(pwResult.error || '비밀번호 변경 중 오류가 발생했습니다.'); setSaving(false); return; }
        } else {
            setSaving(true);
        }

        try {
            await setDoc(docRef(modal.data.id), { displayName, role: form.role, active: form.active }, { merge: true });
            setModal(null);
            showToast(pwTrimmed && modal.data.isSharedAccount ? '사용자 정보 및 비밀번호가 변경됐습니다.' : '사용자 정보가 수정됐습니다.');
        } catch { setFormError('저장 중 오류가 발생했습니다.'); }
        finally { setSaving(false); }
    };

    const confirmDelete = (u) => {
        const adminCount = users.filter(x => x.role === 'admin' && x.active !== false).length;
        if (u.role === 'admin' && adminCount <= 1) { showToast('마지막 관리자는 삭제할 수 없습니다.'); return; }
        setDeleteTarget(u);
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setSaving(true);
        try {
            await deleteDoc(docRef(deleteTarget.id));
            setDeleteTarget(null);
            showToast('사용자가 삭제됐습니다.');
        } catch { showToast('삭제 중 오류가 발생했습니다.'); }
        finally { setSaving(false); }
    };

    const handleToggleActive = async (u) => {
        const adminCount = users.filter(x => x.role === 'admin' && x.active !== false).length;
        if (u.role === 'admin' && u.active !== false && adminCount <= 1) { showToast('마지막 활성 관리자는 비활성화할 수 없습니다.'); return; }
        await setDoc(docRef(u.id), { active: !(u.active !== false) }, { merge: true });
    };

    const isActive = (u) => u.active !== false;

    /* ── 스타일 상수 ── */
    const th = { padding: '8px 10px', fontSize: 12, fontWeight: 700, color: '#1a1a1a', backgroundColor: bgHead, borderRight: `2px solid #4e6880`, borderTop: '1px solid #8aa0b8', borderBottom: '3px solid #4e6880', whiteSpace: 'nowrap', userSelect: 'none' };
    const td = { padding: '7px 10px', fontSize: 12, color: '#222', borderRight: '1px solid #c4ccd8', borderBottom: '1px solid #c4ccd8', backgroundColor: '#ffffff' };

    return (
        <div style={{ minHeight: '100vh', backgroundColor: bgLight, display: 'flex', flexDirection: 'column' }}>

            {/* 헤더 */}
            <div style={{ backgroundColor: bgHead, borderBottom: `2px solid #9aa8b8`, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                <button onClick={onBack}
                    style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: `1px solid ${border}`, padding: '5px 10px', fontSize: 12, fontWeight: 700, color: '#555', cursor: 'pointer', backgroundColor: '#fff' }}>
                    <ChevronLeft size={13} /> 뒤로 가기
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flex: 1 }}>
                    <Users size={16} color={accent} />
                    <span style={{ fontWeight: 800, fontSize: 15, color: '#1a1a1a' }}>사용자 관리</span>
                    <span style={{ fontSize: 11, color: '#888' }}>— PMS 접근 허용 사용자 등록 및 관리</span>
                </div>
                <button onClick={openAdd}
                    style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 14px', backgroundColor: accent, color: '#fff', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    <Plus size={13} /> 사용자 등록
                </button>
            </div>

            {/* 토스트 */}
            {toast && (
                <div style={{ margin: '10px 16px 0', display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#f0fdf4', border: '1px solid #86efac', padding: '9px 12px', fontSize: 12, color: '#166534' }}>
                    <CheckCircle size={14} color="#16a34a" /><span>{toast}</span>
                </div>
            )}

            {/* 테이블 */}
            <div style={{ flex: 1, padding: '16px', overflowX: 'auto' }}>
                {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
                        <div style={{ width: 32, height: 32, border: `3px solid ${accent}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                    </div>
                ) : (
                    <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%', backgroundColor: '#fff', border: `1px solid ${border}` }}>
                        <thead>
                            <tr>
                                <th style={{ ...th, width: 40, textAlign: 'center' }}>No.</th>
                                <th style={{ ...th, minWidth: 100 }}>이름</th>
                                <th style={{ ...th, minWidth: 200 }}>이메일 / 아이디</th>
                                <th style={{ ...th, width: 80,  textAlign: 'center' }}>계정 유형</th>
                                <th style={{ ...th, width: 100, textAlign: 'center' }}>권한</th>
                                <th style={{ ...th, width: 90,  textAlign: 'center' }}>상태</th>
                                <th style={{ ...th, width: 140 }}>등록일</th>
                                <th style={{ ...th, width: 80,  textAlign: 'center', borderRight: '1px solid #8aa0b8' }}>관리</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.length === 0 ? (
                                <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: '#aaa', padding: '30px', borderLeft: `1px solid ${border}` }}>등록된 사용자가 없습니다.</td></tr>
                            ) : users.map((u, i) => (
                                <tr key={u.id} style={{ backgroundColor: i % 2 === 1 ? '#f9fafc' : '#fff' }}
                                    onMouseEnter={e => Array.from(e.currentTarget.cells).forEach(c => c.style.backgroundColor = '#e8f0fe')}
                                    onMouseLeave={e => Array.from(e.currentTarget.cells).forEach(c => c.style.backgroundColor = i % 2 === 1 ? '#f9fafc' : '#fff')}>
                                    <td style={{ ...td, textAlign: 'center', color: '#888', borderLeft: `1px solid ${border}` }}>{i + 1}</td>
                                    <td style={{ ...td, fontWeight: 600 }}>{u.displayName || '—'}</td>
                                    <td style={{ ...td, color: '#555' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                            {u.isSharedAccount ? <Key size={11} color="#888" /> : <Mail size={11} color="#888" />}
                                            <span>{u.isSharedAccount ? u.username : u.email}</span>
                                            {u.email === currentUserEmail && (
                                                <span style={{ fontSize: 10, backgroundColor: '#e0f0ff', color: accent, padding: '1px 5px', fontWeight: 700 }}>나</span>
                                            )}
                                        </div>
                                    </td>
                                    <td style={{ ...td, textAlign: 'center' }}>
                                        {u.isSharedAccount ? (
                                            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', backgroundColor: 'rgba(217,119,6,0.1)', color: '#b45309', border: '1px solid rgba(217,119,6,0.3)' }}>공용</span>
                                        ) : (
                                            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', backgroundColor: 'rgba(107,114,128,0.08)', color: '#555', border: '1px solid #ddd' }}>이메일</span>
                                        )}
                                    </td>
                                    <td style={{ ...td, textAlign: 'center' }}>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: 11, fontWeight: 700, padding: '2px 8px', backgroundColor: u.role === 'admin' ? 'rgba(30,122,200,0.1)' : 'rgba(107,114,128,0.1)', color: u.role === 'admin' ? accent : '#555', border: `1px solid ${u.role === 'admin' ? 'rgba(30,122,200,0.3)' : '#d0d0d0'}` }}>
                                            <Shield size={10} />{u.role === 'admin' ? '관리자' : '일반사용자'}
                                        </span>
                                    </td>
                                    <td style={{ ...td, textAlign: 'center' }}>
                                        <button onClick={() => handleToggleActive(u)}
                                            style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: 11, fontWeight: 700, padding: '3px 8px', cursor: 'pointer', border: 'none', backgroundColor: isActive(u) ? 'rgba(5,150,105,0.1)' : 'rgba(220,38,38,0.1)', color: isActive(u) ? '#059669' : '#dc2626' }}>
                                            {isActive(u) ? <UserCheck size={11} /> : <UserX size={11} />}
                                            {isActive(u) ? '활성' : '비활성'}
                                        </button>
                                    </td>
                                    <td style={{ ...td, fontSize: 11, color: '#888' }}>
                                        {u.createdAt ? u.createdAt.slice(0, 10) : '—'}
                                        {u.addedBy && <div style={{ fontSize: 10, color: '#bbb', marginTop: 1 }}>{u.addedBy}</div>}
                                    </td>
                                    <td style={{ ...td, textAlign: 'center', borderRight: `1px solid ${border}` }}>
                                        <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                                            <button onClick={() => openEdit(u)}
                                                style={{ padding: '3px 7px', backgroundColor: 'rgba(30,122,200,0.1)', border: `1px solid rgba(30,122,200,0.3)`, color: accent, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '2px', fontSize: 11, fontWeight: 600 }}>
                                                <Edit2 size={10} /> 수정
                                            </button>
                                            <button onClick={() => confirmDelete(u)}
                                                style={{ padding: '3px 7px', backgroundColor: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)', color: '#dc2626', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '2px', fontSize: 11, fontWeight: 600 }}>
                                                <Trash2 size={10} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
                <div style={{ marginTop: 10, fontSize: 11, color: '#aaa' }}>
                    총 {users.length}명 등록됨 · 상태 버튼 클릭으로 활성/비활성 전환 · 관리자 최소 1명 유지 필요
                </div>
            </div>

            {/* ── 추가/수정 모달 ── */}
            {modal && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
                    onClick={() => setModal(null)}>
                    <div style={{ backgroundColor: '#fff', border: `1px solid ${border}`, boxShadow: '0 8px 32px rgba(0,0,0,0.15)', width: '100%', maxWidth: 420 }}
                        onClick={e => e.stopPropagation()}>

                        {/* 모달 헤더 */}
                        <div style={{ backgroundColor: bgHead, borderBottom: `2px solid #9aa8b8`, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                                <Users size={15} color={accent} />
                                <span style={{ fontWeight: 800, fontSize: 14, color: '#1a1a1a' }}>
                                    {modal.mode === 'add' ? '사용자 등록' : '사용자 수정'}
                                </span>
                            </div>
                            <button onClick={() => setModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888' }}><X size={16} /></button>
                        </div>

                        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '13px' }}>

                            {/* 계정 유형 탭 (추가 모드만) */}
                            {modal.mode === 'add' && (
                                <div style={{ display: 'flex', border: `1px solid ${border}`, overflow: 'hidden' }}>
                                    {[{ val: 'email', label: '이메일 계정', icon: <Mail size={12} /> }, { val: 'shared', label: '공용 계정 (ID/PW)', icon: <Key size={12} /> }].map(t => (
                                        <button key={t.val} type="button" onClick={() => { setAccountType(t.val); setFormError(''); }}
                                            style={{ flex: 1, padding: '8px 4px', fontSize: 12, fontWeight: 700, cursor: 'pointer', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', backgroundColor: accountType === t.val ? accent : '#f5f5f5', color: accountType === t.val ? '#fff' : '#666', borderRight: t.val === 'email' ? `1px solid ${border}` : 'none' }}>
                                            {t.icon}{t.label}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {formError && (
                                <div style={{ display: 'flex', gap: '7px', backgroundColor: '#fff5f5', border: '1px solid #fca5a5', padding: '8px 10px', fontSize: 12, color: '#dc2626' }}>
                                    <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} />{formError}
                                </div>
                            )}

                            {/* 이메일 계정 필드 */}
                            {(modal.mode === 'edit' || accountType === 'email') && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    <label style={{ fontSize: 12, fontWeight: 700, color: '#444' }}>이메일 <span style={{ color: '#dc2626' }}>*</span></label>
                                    <input type="email" value={form.email}
                                        onChange={e => { setForm(f => ({ ...f, email: e.target.value })); setFormError(''); }}
                                        disabled={modal.mode === 'edit'}
                                        placeholder="user@company.com"
                                        style={{ padding: '8px 10px', border: `1px solid ${border}`, fontSize: 13, color: '#1a1a1a', outline: 'none', backgroundColor: modal.mode === 'edit' ? '#f5f5f5' : '#fff', boxSizing: 'border-box', width: '100%' }}
                                        onFocus={e => e.target.style.borderColor = accent}
                                        onBlur={e => e.target.style.borderColor = border} />
                                    {modal.mode === 'edit' && <div style={{ fontSize: 10, color: '#aaa' }}>이메일은 변경할 수 없습니다.</div>}
                                </div>
                            )}

                            {/* 공용 계정 필드 */}
                            {modal.mode === 'add' && accountType === 'shared' && (
                                <>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                        <label style={{ fontSize: 12, fontWeight: 700, color: '#444' }}>아이디 <span style={{ color: '#dc2626' }}>*</span></label>
                                        <div style={{ position: 'relative' }}>
                                            <Key size={13} style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: '#888', pointerEvents: 'none' }} />
                                            <input type="text" value={form.username}
                                                onChange={e => { setForm(f => ({ ...f, username: e.target.value.replace(/\s/g, '') })); setFormError(''); }}
                                                placeholder="necosys"
                                                style={{ width: '100%', padding: '8px 10px 8px 30px', border: `1px solid ${border}`, fontSize: 13, color: '#1a1a1a', outline: 'none', boxSizing: 'border-box' }}
                                                onFocus={e => e.target.style.borderColor = accent}
                                                onBlur={e => e.target.style.borderColor = border} />
                                        </div>
                                        <div style={{ fontSize: 10, color: '#aaa' }}>영문·숫자만 사용 권장, 공백 없이 입력</div>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                        <label style={{ fontSize: 12, fontWeight: 700, color: '#444' }}>비밀번호 <span style={{ color: '#dc2626' }}>*</span></label>
                                        <div style={{ position: 'relative' }}>
                                            <Lock size={13} style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: '#888', pointerEvents: 'none' }} />
                                            <input type="password" value={form.password}
                                                onChange={e => { setForm(f => ({ ...f, password: e.target.value })); setFormError(''); }}
                                                placeholder="6자 이상"
                                                style={{ width: '100%', padding: '8px 10px 8px 30px', border: `1px solid ${border}`, fontSize: 13, color: '#1a1a1a', outline: 'none', boxSizing: 'border-box' }}
                                                onFocus={e => e.target.style.borderColor = accent}
                                                onBlur={e => e.target.style.borderColor = border} />
                                        </div>
                                    </div>
                                </>
                            )}

                            {/* 공통: 이름 */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <label style={{ fontSize: 12, fontWeight: 700, color: '#444' }}>
                                    {accountType === 'shared' && modal.mode === 'add' ? '표시 이름 (선택)' : '이름 *'}
                                </label>
                                <input type="text" value={form.displayName}
                                    onChange={e => { setForm(f => ({ ...f, displayName: e.target.value })); setFormError(''); }}
                                    placeholder={accountType === 'shared' ? 'NECOSYS 공용계정' : '홍길동'}
                                    style={{ padding: '8px 10px', border: `1px solid ${border}`, fontSize: 13, color: '#1a1a1a', outline: 'none', boxSizing: 'border-box', width: '100%' }}
                                    onFocus={e => e.target.style.borderColor = accent}
                                    onBlur={e => e.target.style.borderColor = border} />
                            </div>

                            {/* 권한 */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <label style={{ fontSize: 12, fontWeight: 700, color: '#444' }}>권한</label>
                                <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                                    style={{ padding: '8px 10px', border: `1px solid ${border}`, fontSize: 13, color: '#1a1a1a', outline: 'none', boxSizing: 'border-box', width: '100%', backgroundColor: '#fff' }}>
                                    {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                                </select>
                            </div>

                            {/* 활성 상태 (수정 모드) */}
                            {modal.mode === 'edit' && (
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' }}>
                                    <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))}
                                        style={{ width: 14, height: 14, accentColor: accent, cursor: 'pointer' }} />
                                    <span style={{ fontSize: 12, fontWeight: 600, color: '#444' }}>활성 (체크 해제 시 로그인 차단)</span>
                                </label>
                            )}

                            {/* 공용 계정 비밀번호 변경 (수정 모드) */}
                            {modal.mode === 'edit' && modal.data?.isSharedAccount && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '12px', backgroundColor: '#fffbf0', border: '1px solid #fde68a' }}>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                        <Key size={12} /> 비밀번호 변경 (선택 — 입력 시에만 변경됨)
                                    </div>
                                    <div style={{ position: 'relative' }}>
                                        <Lock size={13} style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: '#888', pointerEvents: 'none' }} />
                                        <input
                                            type="password"
                                            value={newPassword}
                                            onChange={e => { setNewPassword(e.target.value); setFormError(''); }}
                                            placeholder="새 비밀번호 (6자 이상, 비워두면 유지)"
                                            style={{ width: '100%', padding: '8px 10px 8px 30px', border: `1px solid #fbbf24`, fontSize: 13, color: '#1a1a1a', outline: 'none', boxSizing: 'border-box', backgroundColor: '#fff' }}
                                            onFocus={e => e.target.style.borderColor = '#d97706'}
                                            onBlur={e => e.target.style.borderColor = '#fbbf24'}
                                        />
                                    </div>
                                    <div style={{ fontSize: 10, color: '#b45309' }}>
                                        현재 아이디: <b>{modal.data.username}</b> · 비워두면 기존 비밀번호 유지
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* 모달 푸터 */}
                        <div style={{ padding: '12px 16px', borderTop: `1px solid ${border}`, display: 'flex', gap: '8px', justifyContent: 'flex-end', backgroundColor: '#f7f9fb' }}>
                            <button onClick={() => setModal(null)}
                                style={{ padding: '8px 16px', border: `1px solid ${border}`, backgroundColor: '#fff', color: '#555', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                                취소
                            </button>
                            <button onClick={handleSave} disabled={saving}
                                style={{ padding: '8px 16px', backgroundColor: saving ? '#94b8dc' : accent, color: '#fff', border: 'none', fontSize: 12, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
                                {saving ? '저장 중...' : (modal.mode === 'add' ? '등록' : '저장')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── 삭제 확인 모달 ── */}
            {deleteTarget && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
                    onClick={() => setDeleteTarget(null)}>
                    <div style={{ backgroundColor: '#fff', border: `1px solid ${border}`, boxShadow: '0 8px 32px rgba(0,0,0,0.15)', width: '100%', maxWidth: 360, padding: '24px 20px', textAlign: 'center' }}
                        onClick={e => e.stopPropagation()}>
                        <Trash2 size={28} color="#dc2626" style={{ margin: '0 auto 12px' }} />
                        <div style={{ fontWeight: 800, fontSize: 15, color: '#1a1a1a', marginBottom: 6 }}>사용자 삭제</div>
                        <div style={{ fontSize: 12, color: '#555', lineHeight: 1.7, marginBottom: 20 }}>
                            <b style={{ color: '#1a1a1a' }}>{deleteTarget.displayName}</b> ({deleteTarget.isSharedAccount ? deleteTarget.username : deleteTarget.email})<br />
                            삭제하면 PMS에 접근할 수 없게 됩니다.<br />
                            삭제 후에는 복구할 수 없습니다.
                        </div>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                            <button onClick={() => setDeleteTarget(null)}
                                style={{ padding: '8px 20px', border: `1px solid ${border}`, backgroundColor: '#fff', color: '#555', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>취소</button>
                            <button onClick={handleDelete} disabled={saving}
                                style={{ padding: '8px 20px', backgroundColor: saving ? '#f0a0a0' : '#dc2626', color: '#fff', border: 'none', fontSize: 12, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
                                {saving ? '삭제 중...' : '삭제'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
