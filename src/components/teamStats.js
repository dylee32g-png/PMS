// ─── 홈 팀 카드 미니 지표 (2026-08-11 팀장님 — 벤치마크 D안의 홈 축소판) ───────────
//   표시 전용 파생 계산. 저장·엑셀 업로드·병합 로직 무접촉 (읽기만 함).
//   규칙은 List 화면 KPI 카드(kpiData)와 동일: 올해(_year) 기준 · 하위/삭제 행 제외 ·
//   공정률 = PLC·ETOS·HMI·통합시운전 4항목 평균(없으면 공정률/진척률 열 폴백) ·
//   포인트 달성률 = Σ누적 ÷ Σ총점(하위 '포인트' 합>0이면 부모 총점 = 하위 합 — 2단계 규칙 동일)
import { getDocs, getDoc } from 'firebase/firestore';
import { rowsColRef, monthlyReportDocRef } from './projectListData';
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
    let useCols = pctCols0.length ? pctCols0 : keys.filter(k => norm(k).includes('공정률') || norm(k).includes('진척률'));
    // 수식 팀 (2026-08-20 팀장님, 기술1팀): 공정률 = 팀 수식의 최종값인 '전체' 열 평균 —
    //   공용 4항목 규칙은 'ETOS T/S' 열 이름을 못 읽고(공백·/ 차이) 자체 시운전도 빠져 평균이 틀어짐
    const fmCfg2 = profile?.수식;
    let pctBasis = 'PLC·ETOS·HMI·통합';
    if (fmCfg2 && (!Array.isArray(fmCfg2.연도) || fmCfg2.연도.includes(year))) {
        const allCol = keys.find(k => norm(k) === '전체');
        if (allCol) { useCols = [allCol]; pctBasis = '전체 공정률'; }
    }
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
        const own = Number(r['포인트'] ?? r['총'] ?? r['총물량']) || 0;   // '총물량' = 기술1팀 (List effTotalPt와 동일 폴백, 2026-08-20)
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
        avgPct: pctN ? Math.round(pctSum / pctN * 10) / 10 : null, pctN, pctBasis,
        ptPct: (accCol && totSum > 0) ? Math.round(accSum / totSum * 100) : null, accSum, totSum,
        statusCounts,
    };
}

// ── 월간보고 자료 기준 지표 (2026-08-13 팀장님: 최종 보고 자료 = 월간보고 → 홈 카드도 그 달 진행 합산) ──
//   기준월 = ★엑셀 기준월(D2) 최우선 — 엑셀에 8~12월 선입력/잔존 값이 있는 행들이 있어
//   '값 있는 마지막 달'로 잡으면 12월로 튐(2026-08-13 실측). D2 없을 때만 값 있는 마지막 달(현재 월 이하로 제한).
export function computeMonthlyStats(mrDoc) {
    const rows = Array.isArray(mrDoc?.rows) ? mrDoc.rows : [];
    if (!rows.length) return null;
    const curM = new Date().getMonth() + 1;
    let dm = Number(mrDoc.baseMonth);
    if (!(dm >= 1 && dm <= 12)) {
        dm = 0;
        rows.forEach(r => {
            for (let m = Math.min(12, curM); m >= 1; m--) {
                const q = r.qty && r.qty[m], p = r.pct && r.pct[m];
                if ((q !== null && q !== undefined) || (p !== null && p !== undefined)) { if (m > dm) dm = m; break; }
            }
        });
        if (!dm) dm = curM;
    }
    let activeCnt = 0, monQ = 0, pctSum = 0, pctN = 0, accSum = 0, totSum = 0;
    rows.forEach(r => {
        const q = r.qty ? r.qty[dm] : null, p = r.pct ? r.pct[dm] : null;
        if ((q !== null && q !== undefined) || (p !== null && p !== undefined)) activeCnt += 1;
        if (q) monQ += q;
        if (p !== null && p !== undefined) { pctSum += p; pctN += 1; }
        (r.qty || []).forEach(v => { if (v) accSum += v; });
        if (r.point) totSum += r.point;
    });
    return {
        mode: 'monthly', month: dm, total: rows.length, activeCnt, monQ: Math.round(monQ),
        avgPct: pctN ? Math.round(pctSum / pctN * 10) / 10 : null, pctN,
        ptPct: totSum > 0 ? Math.round(accSum / totSum * 100) : null,
        accSum: Math.round(accSum), totSum: Math.round(totSum),
        progCnt: activeCnt,   // 기존 렌더 호환용
    };
}

// 세션 캐시 — 홈 재방문 시 즉시 표시(0초), 뒤에서 최신값 받아 교체 (List 진입과 같은 방식)
const _cache = {};
export const cachedTeamStats = (team) => _cache[team] || null;

export async function fetchTeamStats(team) {
    try {
        // 월간보고 우선 분기(2026-08-13)는 잠금 — 홈 카드 = 프로젝트 List 기준으로 복귀 (2026-08-20 팀장님.
        //   월간보고 3팀 잠금과 발맞춤 — 재가동 결정 나면 MONTHLY_STATS_OPEN=true로 복구)
        const MONTHLY_STATS_OPEN = false;
        const profile = getTeamProfile(team);
        if (MONTHLY_STATS_OPEN && profile?.월간마감) {
            try {
                const mr = await getDoc(monthlyReportDocRef(team, new Date().getFullYear()));
                if (mr.exists()) {
                    const st = computeMonthlyStats(mr.data());
                    if (st) { _cache[team] = st; return st; }
                }
            } catch (e) { /* 월간보고 자료 없으면 아래 List 기준으로 */ }
        }
        const snap = await getDocs(rowsColRef(team));
        const rows = snap.docs.map(d => ({ _id: d.id, ...d.data() }));
        const st = computeTeamStats(rows, team);
        _cache[team] = st;
        return st;
    } catch (e) {
        return _cache[team] || null;   // 오프라인 등 실패 시 캐시라도 (없으면 null → 카드에 지표 미표시)
    }
}
