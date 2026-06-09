import React, { useState } from 'react';
import { LayoutGrid, Mail, LogIn, AlertCircle, CheckCircle, Users, Lock, ChevronDown, ChevronUp, Eye, EyeOff } from 'lucide-react';

const LS_LAST_EMAIL = 'pms_last_email';

const GoogleIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
);

const accent  = '#1e7ac8';
const border  = '#c4ccd8';
const bgLight = '#edf1f7';
const bgHead  = '#dce3ec';

export default function LoginScreen({ onEmailLogin, onGoogleLogin, onSharedLogin, loading, error }) {
    const [email, setEmail]               = useState(() => localStorage.getItem(LS_LAST_EMAIL) || '');
    const [stayLoggedIn, setStayLoggedIn] = useState(true);
    const [sent, setSent]                 = useState(false);

    // 공용 계정 섹션
    const [showShared,   setShowShared]   = useState(false);
    const [sharedId,     setSharedId]     = useState('');
    const [sharedPw,     setSharedPw]     = useState('');
    const [showPw,       setShowPw]       = useState(false);

    const handleEmailSubmit = async (e) => {
        e.preventDefault();
        if (!email) return;
        const ok = await onEmailLogin(email, stayLoggedIn);
        if (ok) setSent(true);
    };

    const handleSharedSubmit = async (e) => {
        e.preventDefault();
        if (!sharedId || !sharedPw) return;
        await onSharedLogin(sharedId.trim(), sharedPw, stayLoggedIn);
    };

    return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: bgLight, padding: '16px' }}>
            <div style={{ width: '100%', maxWidth: '400px', backgroundColor: '#fff', border: `1px solid ${border}`, boxShadow: '0 4px 16px rgba(0,0,0,0.10)' }}>

                {/* 헤더 */}
                <div style={{ backgroundColor: bgHead, borderBottom: `2px solid #9aa8b8`, padding: '18px 24px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ padding: '6px', backgroundColor: '#fff', border: `1px solid ${border}` }}>
                        <LayoutGrid size={20} color={accent} />
                    </div>
                    <div>
                        <div style={{ fontWeight: 800, fontSize: '15px', color: '#1a1a1a' }}>통합 프로젝트 관리 플랫폼</div>
                        <div style={{ fontSize: '11px', color: '#666', marginTop: '1px' }}>TechTeam PMS</div>
                    </div>
                </div>

                {/* 탭 라인 */}
                <div style={{ borderBottom: `1px solid ${border}`, padding: '0 24px' }}>
                    <div style={{ display: 'inline-block', padding: '11px 4px', borderBottom: `3px solid ${accent}`, color: accent, fontWeight: 700, fontSize: '13px' }}>
                        로그인
                    </div>
                </div>

                <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

                    {/* 에러 */}
                    {error && (
                        <div style={{ display: 'flex', gap: '8px', backgroundColor: '#fff5f5', border: '1px solid #fca5a5', padding: '10px 12px', color: '#dc2626', fontSize: '12px', lineHeight: '1.5' }}>
                            <AlertCircle size={14} style={{ marginTop: '1px', flexShrink: 0 }} />
                            <span>{error}</span>
                        </div>
                    )}

                    {sent ? (
                        /* ── 링크 발송 완료 ── */
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center', textAlign: 'center', padding: '8px 0' }}>
                            <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#e8f5e9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <CheckCircle size={26} color="#059669" />
                            </div>
                            <div>
                                <div style={{ fontWeight: 800, fontSize: '15px', color: '#1a1a1a', marginBottom: '6px' }}>이메일을 확인해 주세요</div>
                                <div style={{ fontSize: '12px', color: '#555', lineHeight: '1.7' }}>
                                    <b style={{ color: accent }}>{email}</b><br />
                                    으로 로그인 링크를 발송했습니다.<br />
                                    이메일의 링크를 클릭하면 자동으로 로그인됩니다.
                                </div>
                            </div>
                            <button type="button" onClick={() => setSent(false)}
                                style={{ marginTop: '4px', background: 'none', border: 'none', color: accent, fontSize: '12px', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
                                다른 이메일로 다시 시도
                            </button>
                        </div>
                    ) : (
                        /* ── 이메일 입력 ── */
                        <form onSubmit={handleEmailSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                <label style={{ fontSize: '12px', fontWeight: 700, color: '#444' }}>이메일 주소</label>
                                <div style={{ position: 'relative' }}>
                                    <Mail size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#888', pointerEvents: 'none' }} />
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={e => setEmail(e.target.value)}
                                        placeholder="example@company.com"
                                        required
                                        autoFocus
                                        style={{ width: '100%', padding: '9px 10px 9px 34px', border: `1px solid ${border}`, fontSize: '13px', color: '#1a1a1a', outline: 'none', boxSizing: 'border-box' }}
                                        onFocus={e => e.target.style.borderColor = accent}
                                        onBlur={e => e.target.style.borderColor = border}
                                    />
                                </div>
                                <div style={{ fontSize: '11px', color: '#888' }}>입력한 이메일로 로그인 링크를 발송합니다.</div>
                            </div>

                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' }}>
                                <input type="checkbox" checked={stayLoggedIn} onChange={e => setStayLoggedIn(e.target.checked)}
                                    style={{ width: '14px', height: '14px', accentColor: accent, cursor: 'pointer' }} />
                                <span style={{ fontSize: '12px', color: '#555', fontWeight: 600 }}>로그인 유지</span>
                            </label>

                            <button type="submit" disabled={loading || !email}
                                style={{ width: '100%', padding: '11px', backgroundColor: (loading || !email) ? '#94b8dc' : accent, color: '#fff', fontWeight: 700, fontSize: '13px', border: 'none', cursor: (loading || !email) ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px' }}>
                                <LogIn size={15} />
                                {loading ? '처리 중...' : '로그인 링크 받기'}
                            </button>

                            {/* ── 또는 ── */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{ flex: 1, height: '1px', backgroundColor: border }} />
                                <span style={{ fontSize: '11px', color: '#aaa', fontWeight: 600 }}>또는</span>
                                <div style={{ flex: 1, height: '1px', backgroundColor: border }} />
                            </div>

                            <button type="button" onClick={() => onGoogleLogin(stayLoggedIn)} disabled={loading}
                                style={{ width: '100%', padding: '10px', backgroundColor: '#fff', border: `1px solid ${border}`, color: '#333', fontWeight: 700, fontSize: '13px', cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                                onMouseEnter={e => { if (!loading) e.currentTarget.style.backgroundColor = '#f5f8fd'; }}
                                onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#fff'; }}>
                                <GoogleIcon /> Google 계정으로 로그인
                            </button>

                            {/* ── 또는 ── */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{ flex: 1, height: '1px', backgroundColor: border }} />
                                <span style={{ fontSize: '11px', color: '#aaa', fontWeight: 600 }}>또는</span>
                                <div style={{ flex: 1, height: '1px', backgroundColor: border }} />
                            </div>

                            {/* ── 공용 계정 토글 버튼 ── */}
                            <button type="button" onClick={() => setShowShared(v => !v)}
                                style={{ width: '100%', padding: '9px 12px', backgroundColor: showShared ? '#f0f6ff' : '#fafafa', border: `1px solid ${showShared ? '#b8d4f0' : border}`, color: showShared ? accent : '#666', fontWeight: 700, fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Users size={13} /> 공용 계정으로 로그인
                                </span>
                                {showShared ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                            </button>
                        </form>
                    )}

                    {/* ── 공용 계정 로그인 폼 (접기/펴기) ── */}
                    {showShared && !sent && (
                        <form onSubmit={handleSharedSubmit}
                            style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '14px 14px 14px', backgroundColor: '#f8fbff', border: `1px solid #b8d4f0`, marginTop: '-8px' }}>

                            <div style={{ fontSize: '11px', color: '#777', fontWeight: 600, marginBottom: '2px' }}>공용 계정 아이디 / 비밀번호</div>

                            <div style={{ display: 'flex', gap: '8px' }}>
                                {/* 아이디 */}
                                <div style={{ position: 'relative', flex: 1 }}>
                                    <Users size={13} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: '#888', pointerEvents: 'none' }} />
                                    <input
                                        type="text"
                                        value={sharedId}
                                        onChange={e => setSharedId(e.target.value)}
                                        placeholder="아이디"
                                        required
                                        autoFocus={showShared}
                                        style={{ width: '100%', padding: '8px 8px 8px 28px', border: `1px solid ${border}`, fontSize: '13px', color: '#1a1a1a', outline: 'none', boxSizing: 'border-box', backgroundColor: '#fff' }}
                                        onFocus={e => e.target.style.borderColor = accent}
                                        onBlur={e => e.target.style.borderColor = border}
                                    />
                                </div>
                                {/* 비밀번호 */}
                                <div style={{ position: 'relative', flex: 1 }}>
                                    <Lock size={13} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: '#888', pointerEvents: 'none' }} />
                                    <input
                                        type={showPw ? 'text' : 'password'}
                                        value={sharedPw}
                                        onChange={e => setSharedPw(e.target.value)}
                                        placeholder="비밀번호"
                                        required
                                        style={{ width: '100%', padding: '8px 30px 8px 28px', border: `1px solid ${border}`, fontSize: '13px', color: '#1a1a1a', outline: 'none', boxSizing: 'border-box', backgroundColor: '#fff' }}
                                        onFocus={e => e.target.style.borderColor = accent}
                                        onBlur={e => e.target.style.borderColor = border}
                                    />
                                    <button type="button" onClick={() => setShowPw(v => !v)}
                                        style={{ position: 'absolute', right: '7px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#999', padding: 0, display: 'flex', alignItems: 'center' }}>
                                        {showPw ? <EyeOff size={13} /> : <Eye size={13} />}
                                    </button>
                                </div>
                            </div>

                            <button type="submit" disabled={loading || !sharedId || !sharedPw}
                                style={{ width: '100%', padding: '9px', backgroundColor: (loading || !sharedId || !sharedPw) ? '#94b8dc' : accent, color: '#fff', fontWeight: 700, fontSize: '12px', border: 'none', cursor: (loading || !sharedId || !sharedPw) ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                <Users size={13} />
                                {loading ? '확인 중...' : '공용 계정 로그인'}
                            </button>
                        </form>
                    )}
                </div>

                {/* 푸터 */}
                <div style={{ padding: '11px 24px', backgroundColor: '#f7f9fb', borderTop: `1px solid ${border}`, textAlign: 'center', fontSize: '11px', color: '#aaa' }}>
                    비밀번호 없이 이메일 링크 또는 Google 계정으로 로그인합니다.
                </div>
            </div>
        </div>
    );
}
