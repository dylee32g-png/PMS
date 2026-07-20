// ─────────────────────────────────────────────────────────────────────────
// 모바일 진행실적 입력 전용 화면 (2026-07-15 신설)
//  · 휴대폰 접속 시 자동 진입(App.js UA 감지). PC 팀선택 화면의 '모바일 입력' 버튼으로도 진입.
//  · 로그인한 사람(registeredUsers.displayName)과 List '담당자' 칸을 extractName 기준으로 매칭
//    (김준혁TL ↔ 김준혁 팀장 = 같은 사람 — 2026-07-07 필터·카운트와 동일 규칙)
//  · 기능 = 진행실적 등록/적용'만'. 수정·삭제·설정 등 관리 기능은 화면에 없음.
//  · 저장·계산 경로 = PC와 100% 동일: ProgressModal(진행실적 팝업)을 통째로 재사용하고,
//    '적용하기'의 메인표 반영도 ProjectListScreen.applyProgressToMainRow와 같은 규칙
//    (도장 _updatedAt/_updatedBy + 변경이력 _changeHistory + 백로그 기록).
// ─────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, LogOut, Monitor, ChevronRight, ClipboardList, Smartphone } from 'lucide-react';
import { getDoc, getDocs, setDoc } from 'firebase/firestore';
import { metaDocRef, rowsColRef, rowDocRef } from './projectListData';
import { extractName, normalizeStatus } from './projectColumns';
import { logAudit, AUDIT_ACTIONS, pickProjectName } from '../auditLog';
import ProgressModal from './ProgressModal';

const TEAMS = ['기술1팀', '기술2팀', '기술3팀', 'Software팀'];

// 헤더 이름 비교는 공백 제거 후 (엑셀 헤더 '참 조' 같은 공백 함정 — 2026-07-08 교훈)
const norm = (h) => String(h ?? '').replace(/\s+/g, '');
const findCol = (headers, want, exclude) =>
    (headers || []).find(h => norm(h).includes(want) && (!exclude || !norm(h).includes(exclude)));
// 하위(sub) 행 판별 — ProjectListScreen 진행실적 팝업과 동일 규칙
const isSubRow = (r) => { const e = String(r?.['실행번호'] || '').trim().toLowerCase(); return e === 's' || e.startsWith('-'); };

const MobileInputScreen = ({ user, registeredUser, baseDate, onApplyProgressByPid, onProgressSaved, onExitToPc, onSignOut }) => {
    const myName = extractName(registeredUser?.displayName || '');
    const [teamData, setTeamData] = useState({});   // { [팀]: { headers, rows } }
    const [loading,  setLoading]  = useState(true);
    const [progress, setProgress] = useState(null); // { team, row, subs } — 진행실적 팝업 열림
    const [toast,    setToast]    = useState('');
    // 상태 필터 (2026-07-15): ''=전체. 마지막 선택을 이 기기에 기억 (개인 화면 설정과 동일하게 localStorage)
    const [statusFilter, setStatusFilter] = useState(() => {
        try { return localStorage.getItem('pms_mobile_status_filter') || ''; } catch (e) { return ''; }
    });

    const loadTeam = useCallback(async (team) => {
        try {
            const [metaSnap, rowsSnap] = await Promise.all([getDoc(metaDocRef(team)), getDocs(rowsColRef(team))]);
            const headers = metaSnap.exists() ? (metaSnap.data().headers || []) : [];
            const rows = rowsSnap.docs
                .map(d => ({ _id: d.id, ...d.data() }))
                .sort((a, b) => String(a._id).localeCompare(String(b._id)));   // List 화면과 동일 정렬(하위 행 연결 유지)
            setTeamData(prev => ({ ...prev, [team]: { headers, rows } }));
        } catch (e) { console.warn('[모바일] ' + team + ' 불러오기 실패:', e); }
    }, []);

    const loadAll = useCallback(async () => {
        setLoading(true);
        await Promise.all(TEAMS.map(t => loadTeam(t)));
        setLoading(false);
    }, [loadTeam]);

    useEffect(() => { loadAll(); }, [loadAll]);

    // 내 담당 카드 목록 — 메인 행만(하위 행은 팝업의 '하위'로 따라감), '삭제' 도장 행 제외
    const sections = TEAMS.map(team => {
        const d = teamData[team];
        if (!d || !d.rows || !d.rows.length || !myName) return null;
        const assigneeCol = findCol(d.headers, '담당자', '업체');
        if (!assigneeCol) return null;
        const statusCol = findCol(d.headers, '진행현황');
        const totalCol  = findCol(d.headers, '총진척률');
        const mine = d.rows.filter(r => !isSubRow(r)
            && extractName(r[assigneeCol]) === myName
            && normalizeStatus(statusCol ? r[statusCol] : '') !== '삭제');
        if (!mine.length) return null;
        return { team, rows: mine, statusCol, totalCol };
    }).filter(Boolean);

    // ── 상태 필터 칩 (2026-07-15): 내 카드에 실제 있는 상태값으로 자동 생성 ──
    //    상태 이름을 하드코딩하지 않음 — 팀마다 명칭이 달라도('추진중'·'2018이전' 등) 그대로 칩이 됨.
    const rowStatus = (sec, r) => (normalizeStatus(sec.statusCol ? r[sec.statusCol] : '') || '(상태없음)');
    const statusCounts = {};
    sections.forEach(sec => sec.rows.forEach(r => {
        const k = rowStatus(sec, r);
        statusCounts[k] = (statusCounts[k] || 0) + 1;
    }));
    // 칩 순서 (2026-07-20 팀장님): '전체'(항상 첫 번째, 아래 렌더링) 다음에 진행중·추진중을 고정 배치, 나머지는 건수 많은 순
    const CHIP_PRIORITY = ['진행중', '추진중'];
    const chipRank = (name) => { const i = CHIP_PRIORITY.indexOf(name); return i < 0 ? CHIP_PRIORITY.length : i; };
    const chipList = Object.entries(statusCounts).sort((a, b) => (chipRank(a[0]) - chipRank(b[0])) || (b[1] - a[1]));
    const totalCnt = sections.reduce((s, sec) => s + sec.rows.length, 0);
    const effFilter = statusFilter && statusCounts[statusFilter] ? statusFilter : '';   // 기억된 상태가 지금 없으면 전체로
    const viewSections = !effFilter ? sections : sections
        .map(sec => ({ ...sec, rows: sec.rows.filter(r => rowStatus(sec, r) === effFilter) }))
        .filter(sec => sec.rows.length);
    const pickFilter = (v) => {
        setStatusFilter(v);
        try { localStorage.setItem('pms_mobile_status_filter', v); } catch (e) { /* 시크릿모드 등 저장 불가 시 무시 */ }
    };
    const chipStyle = (on) => ({ flexShrink: 0, whiteSpace: 'nowrap', fontSize: 11.5, fontWeight: 800, padding: '5px 11px', borderRadius: 999, cursor: 'pointer', border: on ? '1px solid #1e7ac8' : '1px solid #d7dde6', background: on ? '#1e7ac8' : '#fff', color: on ? '#fff' : '#475569' });

    // 카드 탭 → 진행실적 팝업 (하위 행 수집은 ProjectListScreen과 동일: 바로 아래 연속된 s/- 행)
    const openProgress = (team, row) => {
        const rows = teamData[team]?.rows || [];
        const idx = rows.findIndex(r => r._id === row._id);
        const subs = [];
        if (idx >= 0) {
            for (let i = idx + 1; i < rows.length; i++) {
                if (isSubRow(rows[i])) {
                    subs.push({
                        name: rows[i]['공사명'] || rows[i]['프로젝트명'] || rows[i]['Project'] || rows[i]['사업명'] || `서브${subs.length + 1}`,
                        key: rows[i]._id,
                        pt: Number(rows[i]['포인트']) || 0,   // 2단계(2026-07-20): 부모 총점 = 하위 합 (ProgressModal 합산용)
                    });
                } else break;
            }
        }
        setProgress({ team, row, subs });
    };

    // '적용하기' → 메인표(List 행) 반영 — applyProgressToMainRow(ProjectListScreen 709행)와 같은 규칙
    const applyToMain = async (team, rowId, mainTable) => {
        if (!rowId || !mainTable) return;
        const rows = teamData[team]?.rows || [];
        const srcRow = rows.find(r => r._id === rowId);
        if (!srcRow) return;
        const patch = {};
        Object.entries(mainTable).forEach(([h, v]) => { if (v !== null && v !== undefined) patch[h] = String(v); });
        if (!Object.keys(patch).length) return;
        const changes = Object.keys(patch)
            .map(k => ({ field: k, from: String(srcRow[k] ?? ''), to: String(patch[k]) }))
            .filter(c => c.from !== c.to);
        const entry = changes.length ? { datetime: new Date().toISOString(), changes } : null;
        try {
            const { _id, ...rest } = srcRow;
            const hist = entry
                ? [...(Array.isArray(srcRow._changeHistory) ? srcRow._changeHistory : []), entry]
                : (srcRow._changeHistory || []);
            await setDoc(rowDocRef(team, _id), {
                ...rest, ...patch, _changeHistory: hist,
                _updatedAt: new Date().toISOString(),               // 동시수정 감지 도장 (2026-07-14 규칙과 동일)
                _updatedBy: user?.email || '',
            });
            if (entry) {
                logAudit(team, {
                    who: user?.email || '', action: AUDIT_ACTIONS.EDIT,
                    projectId: String(_id), projectName: pickProjectName(srcRow),
                    execNo: srcRow['실행번호'] || '', pid: srcRow._pid || srcRow.pid || '',
                    changes, note: '모바일 진행실적 적용',
                });
            }
            setToast('✓ 진행실적이 반영되었습니다 (' + Object.keys(patch).length + '개 항목)');
            setTimeout(() => setToast(''), 3000);
            loadTeam(team);   // 카드·행 데이터 새로 읽기 (다음 팝업이 최신값에서 시작)
        } catch (e) {
            setToast('반영 오류: ' + e.message);
            setTimeout(() => setToast(''), 5000);
        }
    };

    const iconBtn = { background: '#fff', border: '1px solid #d7dde6', borderRadius: 8, padding: '7px 9px', color: '#475569', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, cursor: 'pointer' };

    return (
        <div style={{ minHeight: '100vh', background: '#edf1f7', paddingBottom: 40 }}>
            {/* 상단 바 */}
            <div style={{ position: 'sticky', top: 0, zIndex: 100, background: '#fff', borderBottom: '1px solid #d7dde6', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <Smartphone size={17} color="#1e7ac8" style={{ flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: 14, color: '#1a1a1a', whiteSpace: 'nowrap' }}>진행실적 입력</div>
                        <div style={{ fontSize: 11, color: '#8a94a3', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {registeredUser?.displayName || user?.email || ''} · 담당 프로젝트만 표시
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                    <button onClick={loadAll} title="새로고침" style={iconBtn}><RefreshCw size={13} /></button>
                    <button onClick={onExitToPc} title="PC 화면으로" style={iconBtn}><Monitor size={13} /></button>
                    <button onClick={() => { if (window.confirm('로그아웃하시겠습니까?')) onSignOut?.(); }} title="로그아웃" style={{ ...iconBtn, color: '#dc2626' }}><LogOut size={13} /></button>
                </div>
            </div>

            {/* 본문 */}
            <div style={{ padding: '12px 12px 0', maxWidth: 560, margin: '0 auto' }}>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '60px 0', color: '#8a94a3', fontSize: 13 }}>
                        <div style={{ width: 34, height: 34, border: '3px solid #1e7ac8', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
                        담당 프로젝트 불러오는 중...
                        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                    </div>
                ) : sections.length === 0 ? (
                    <div style={{ background: '#fff', border: '1px solid #d7dde6', borderRadius: 12, padding: '28px 18px', textAlign: 'center', marginTop: 24 }}>
                        <ClipboardList size={30} color="#b4bcca" style={{ margin: '0 auto 10px' }} />
                        <div style={{ fontWeight: 800, fontSize: 14, color: '#1a1a1a', marginBottom: 6 }}>담당 프로젝트가 없습니다</div>
                        <div style={{ fontSize: 12, color: '#666', lineHeight: 1.7 }}>
                            담당자명 <b style={{ color: '#1e7ac8' }}>{myName || '(이름 없음)'}</b>(으)로 배정된 프로젝트를 찾지 못했습니다.<br />
                            프로젝트 List의 '담당자' 이름과 내 계정 이름이 같은지<br />관리자에게 확인을 요청해 주세요.
                        </div>
                    </div>
                ) : (
                    <>
                    {/* 상태 필터 칩 — 가로 스크롤, 선택은 이 기기에 기억 */}
                    <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '2px 2px 10px', WebkitOverflowScrolling: 'touch' }}>
                        <button onClick={() => pickFilter('')} style={chipStyle(!effFilter)}>전체 {totalCnt}</button>
                        {chipList.map(([st, n]) => (
                            <button key={st} onClick={() => pickFilter(st)} style={chipStyle(effFilter === st)}>{st} {n}</button>
                        ))}
                    </div>
                    {viewSections.map(sec => (
                        <div key={sec.team} style={{ marginBottom: 18 }}>
                            <div style={{ fontSize: 12, fontWeight: 800, color: '#1e7ac8', margin: '2px 2px 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
                                {sec.team} <span style={{ color: '#8a94a3', fontWeight: 700 }}>{sec.rows.length}건</span>
                            </div>
                            {sec.rows.map(r => {
                                const st = sec.statusCol ? normalizeStatus(r[sec.statusCol]) : '';
                                const tot = sec.totalCol ? String(r[sec.totalCol] ?? '').trim() : '';
                                return (
                                    <button key={r._id} onClick={() => openProgress(sec.team, r)}
                                        style={{ width: '100%', textAlign: 'left', background: '#fff', border: '1px solid #d7dde6', borderRadius: 12, padding: '12px 12px 12px 14px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontWeight: 800, fontSize: 13.5, color: '#1a1a1a', lineHeight: 1.4, wordBreak: 'break-all' }}>
                                                {pickProjectName(r) || '(이름 없음)'}
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 5 }}>
                                                {r['실행번호'] ? <span style={{ fontSize: 10.5, color: '#8a94a3', fontWeight: 700 }}>[{r['실행번호']}]</span> : null}
                                                {st ? <span style={{ fontSize: 10.5, fontWeight: 800, color: '#1e7ac8', background: 'rgba(30,122,200,0.08)', border: '1px solid rgba(30,122,200,0.25)', borderRadius: 999, padding: '1px 8px' }}>{st}</span> : null}
                                                {tot !== '' ? <span style={{ fontSize: 10.5, color: '#475569', fontWeight: 700 }}>진척률 {tot.includes('%') ? tot : tot + '%'}</span> : null}
                                            </div>
                                        </div>
                                        <ChevronRight size={16} color="#b4bcca" style={{ flexShrink: 0 }} />
                                    </button>
                                );
                            })}
                        </div>
                    ))}
                    </>
                )}

                <div style={{ textAlign: 'center', fontSize: 10.5, color: '#a8b0bc', margin: '10px 0 0', lineHeight: 1.6 }}>
                    카드를 누르면 진행실적 등록 창이 열립니다.<br />저장·적용하면 PC의 List·월간보고에 바로 반영됩니다.
                </div>
            </div>

            {/* 알림 토스트 */}
            {toast && (
                <div style={{ position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)', zIndex: 10000, background: '#1a1a1a', color: '#fff', fontSize: 12, fontWeight: 700, padding: '9px 16px', borderRadius: 999, whiteSpace: 'nowrap', boxShadow: '0 6px 20px rgba(0,0,0,0.25)' }}>
                    {toast}
                </div>
            )}

            {/* 진행실적 팝업 — PC List와 동일 부품·동일 연결 */}
            {progress && (() => {
                // ── 이전/다음 프로젝트 이동 (2026-07-20 팀장님): 지금 보이는 카드 목록(칩 필터 반영) 순서 그대로 ──
                const navList = viewSections.flatMap(sec => sec.rows.map(r => ({ team: sec.team, row: r })));
                const navIdx = navList.findIndex(e => e.team === progress.team && e.row._id === progress.row._id);
                const nameOf = (e) => e ? (e.row['공사명'] || e.row['프로젝트명'] || e.row['Project'] || e.row['사업명'] || '') : '';
                const mobileNav = {
                    idx: navIdx, total: navIdx < 0 ? 0 : navList.length,   // 필터에서 빠진 행이면 이동 버튼 숨김
                    prevName: nameOf(navList[navIdx - 1]), nextName: nameOf(navList[navIdx + 1]),
                    onGo: (delta) => { const t = navList[navIdx + delta]; if (t) openProgress(t.team, t.row); },
                };
                return (
                <ProgressModal
                    key={progress.row._id}   /* 프로젝트 이동 시 새로 열어 장부를 새로 읽음 */
                    row={progress.row}
                    team={progress.team}
                    subRows={progress.subs}
                    mobileMode={true}
                    mobileNav={mobileNav}
                    baseDate={baseDate}
                    onApplyToMonthly={(rowId, data) => { applyToMain(progress.team, rowId, data?.mainTable); onApplyProgressByPid?.(progress.row._pid, data); }}
                    onProgressSaved={onProgressSaved}
                    onClose={() => setProgress(null)}
                />
                );
            })()}
        </div>
    );
};

export default MobileInputScreen;
