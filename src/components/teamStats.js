// ─── 홈 팀 카드 미니 지표 (2026-08-11 팀장님 — 벤치마크 D안의 홈 축소판) ───────────
//   표시 전용 파생 계산. 저장·엑셀 업로드·병합 로직 무접촉 (읽기만 함).
//   규칙은 List 화면 KPI 카드(kpiData)와 동일: 올해(_year) 기준 · 하위/삭제 행 제외 ·
//   공정률 = PLC·ETOS·HMI·통합시운전 4항목 평균(없으면 공정률/진척률 열 폴백) ·
//   포인트 달성률 = Σ누적 ÷ Σ총점(하위 '포인트' 합>0이면 부모 총점 = 하위 합 — 2단계 규칙 동일)
import { getDocs } from 'firebase/firestore';
import { rowsColRef } from './projectListData';
import { getTeamProfile } from '../teamProfiles';

const norm = (h) => String(h).replace(/\s/g, '');
// 하위(공종) 행 판별 — List·월간·팝업과 완전히 같은 규칙 (실행번호 s / -)
const isSubRow = (r) => { const e = String(r?.['실행번호'] || '').trim().toLowerCase(); return e === 's' || e.startsWith('-'); };

export function computeTeamStats(rows, team) {
    const profile = getTeamProfile(team);
    const year = String(new Date().getFullYear());
    const rowsY = (rows || []).filter(r => !r._year || String(r._year) === year);
    const keySet = {};
    rowsY.forEach(r => Object.keys(r).forEach(k => { keySet[k] = 1; }));
    const keys = Object.keys(keySet);
    // 상태 열 = 팀 카드 '상태.칩기준열'(기술1팀 '계약') 우선, 없으면 '진행현황' 포함 열
    const cardStatus = profile?.상태?.칩기준열;
    const statusCol = (cardStatus && keys.find(k => norm(k) === norm(cardStatus))) || keys.find(k => norm(k).includes('진행현황'));
    const mains = rowsY.filter(r => !isSubRow(r) && String(statusCol ? (r[statusCol] || '') : '').trim() !== '삭제');
    const progCnt = statusCol ? mains.filter(r => String(r[statusCol] || '').trim() === '진행중').length : 0;
    const pctCols0 = keys.filter(k => ['PLC', 'ETOS', 'HMI', '통합시운전'].includes(norm(k)));
    const useCols = pctCols0.length ? pctCols0 : keys.filter(k => norm(k).includes('공정률') || norm(k).includes('진척률'));
    let pctSum = 0, pctN = 0;
    mains.forEach(r => {
        const vals = useCols.map(c => parseFloat(String(r[c] ?? '').replace(/%/g, ''))).filter(Number.isFinite);
        if (vals.length) { pctSum += vals.reduce((a, b) => a + b, 0) / vals.length; pctN += 1; }
    });
    const accCol = keys.find(k => norm(k) === '누적');
    // 하위 포인트 합 (표 순서 기준 직전 메인이 부모 — ProjectListScreen subPtByParent와 동일 방식)
    const subSum = {};
    let lastMain = null;
    rowsY.forEach(r => {
        if (!isSubRow(r)) { lastMain = r; return; }
        if (!lastMain) return;
        subSum[lastMain._id] = Math.round(((subSum[lastMain._id] || 0) + (Number(r['포인트'] ?? r['총']) || 0)) * 1000) / 1000;
    });
    let accSum = 0, totSum = 0;
    mains.forEach(r => {
        const own = Number(r['포인트'] ?? r['총']) || 0;
        totSum += (subSum[r._id] > 0 ? subSum[r._id] : own);
        if (accCol) { const v = Number(String(r[accCol] ?? '').replace(/,/g, '')); if (Number.isFinite(v)) accSum += v; }
    });
    accSum = Math.round(accSum); totSum = Math.round(totSum);
    const statusCounts = {};
    if (statusCol) mains.forEach(r => { let v = String(r[statusCol] || '').trim(); if (v.toUpperCase() === 'HOLD') v = 'Hold'; if (v) statusCounts[v] = (statusCounts[v] || 0) + 1; });
    // 근거 표기용 (2026-08-11 팀장님: 130건이 어디서 나왔는지 카드에 작게 병기)
    const subCnt = rowsY.filter(r => isSubRow(r)).length;
    const delCnt = rowsY.filter(r => !isSubRow(r) && String(statusCol ? (r[statusCol] || '') : '').trim() === '삭제').length;
    return {
        total: mains.length, progCnt, rawCnt: rowsY.length, subCnt, delCnt,
        avgPct: pctN ? Math.round(pctSum / pctN * 10) / 10 : null, pctN,
        ptPct: (accCol && totSum > 0) ? Math.round(accSum / totSum * 100) : null, accSum, totSum,
        statusCounts,
    };
}

// 세션 캐시 — 홈 재방문 시 즉시 표시(0초), 뒤에서 최신값 받아 교체 (List 진입과 같은 방식)
const _cache = {};
export const cachedTeamStats = (team) => _cache[team] || null;

export async function fetchTeamStats(team) {
    try {
        const snap = await getDocs(rowsColRef(team));
        const rows = snap.docs.map(d => ({ _id: d.id, ...d.data() }));
        const st = computeTeamStats(rows, team);
        _cache[team] = st;
        return st;
    } catch (e) {
        return _cache[team] || null;   // 오프라인 등 실패 시 캐시라도 (없으면 null → 카드에 지표 미표시)
    }
}
