// ─────────────────────────────────────────────────────────────────────────
// 작업 백로그(감사로그) — "누가·언제·무엇을 수정/추가/삭제/보류 했는지" 팀 전체를 한 곳에 모으는 기록.
//   · 프로젝트별 변경이력(_changeHistory)과 별개. 그건 프로젝트 안에서 그 건만 보는 용도,
//     이건 팀 전체를 시간순으로 모아 "누가 왜 고쳤어/삭제했어" 다툼을 막는 용도.
//   · 추가 전용(append-only) 설계 — 한 번 쌓이면 화면에서 수정·삭제 안 함(신뢰성).
//     ※ 진짜 잠금(수정·삭제 불가)은 Firebase 보안규칙으로 마무리 → 소유자(전무님) 권한 필요.
//   · 'who'는 로그인한 사람(user.email). 지금 공용 계정이면 다 같게 찍히므로, 개인 로그인 전환 후 의미 생김.
//   (2026-07-10 신설 — 백로그 1단계 토대)
// ─────────────────────────────────────────────────────────────────────────
import { collection, addDoc, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db, appId } from './firebase';

// 팀별 컬렉션 (progressRecords_${team} 과 동일 패턴)
const auditColl = (team) => collection(db, 'artifacts', appId, 'public', 'data', `auditLog_${team}`);

// 동작 종류 (사용자 결정: 값·추가·삭제·보류 전부)
export const AUDIT_ACTIONS = {
    EDIT:    '수정',
    ADD:     '추가',
    DELETE:  '삭제',
    HOLD:    '보류',
    RESTORE: '복구',
};

// 한 '사건' = 문서 1개. 한 번 저장에 여러 칸이 바뀌면 changes 배열로 묶어 기록(변경이력 표시와 동일한 묶음 감각).
//   entry = { who, action, projectId, projectName, execNo, pid, changes:[{field,from,to}], note }
// 실패해도 본 작업(저장 등)은 막지 않도록 조용히 catch.
export async function logAudit(team, entry) {
    if (!team || !entry || !entry.action) return;
    try {
        await addDoc(auditColl(team), {
            ts: new Date().toISOString(),                 // 기록 시각(ISO, 정렬용 — 문자열이라 사전순=시간순)
            who: (entry.who && String(entry.who).trim()) || '(알수없음)',
            action: entry.action,                          // AUDIT_ACTIONS 중 하나
            projectId:   entry.projectId   ?? '',
            projectName: entry.projectName ?? '',
            execNo:      entry.execNo      ?? '',
            pid:         entry.pid         ?? '',
            changes: Array.isArray(entry.changes)
                ? entry.changes
                    .map(c => ({ field: String(c.field ?? ''), from: String(c.from ?? ''), to: String(c.to ?? '') }))
                    .filter(c => c.field !== '' || c.from !== '' || c.to !== '')
                : [],
            note: entry.note ?? '',
        });
    } catch (e) {
        console.warn('[auditLog] 기록 실패(무시하고 진행):', e);
    }
}

// 실시간 구독 (백로그 화면용). 최신순, 최대 max건. 반환값 = 구독 해제 함수.
export function subscribeAuditLog(team, cb, max = 500) {
    if (!team || typeof cb !== 'function') return () => {};
    const q = query(auditColl(team), orderBy('ts', 'desc'), limit(max));
    return onSnapshot(
        q,
        (snap) => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
        (err) => console.warn('[auditLog] 구독 오류:', err)
    );
}

// 프로젝트 행에서 사람이 읽기 좋은 이름 뽑기 (열 이름이 팀마다 달라 여러 후보를 순서대로).
export function pickProjectName(row) {
    if (!row) return '';
    return row['Project'] || row['프로젝트'] || row['프로젝트명'] || row['공사명'] || row['번호'] || '';
}
