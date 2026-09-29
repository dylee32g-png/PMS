// ─────────────────────────────────────────────────────────────────────────
// 기술1팀 진행 수치 '누계' 계산 — 순수 함수 (2026-09-29 팀장님 확정 "바꾸기")
//   화면·Firebase와 안 얽힘 → tests/list/tech1_progress_test.js가 이 파일을 그대로 불러 검사한다.
//
//   왜 바꿨나: 8/19 방식 = '이번 달 증가분만 넣고 [월간 마감] 때 누적으로 넘김'.
//     → 3~7월에 끝난 프로젝트를 9월에 한꺼번에 넣으면(소급) 계산에 안 들어감 (001: 3월 3,210점 → 누적·자체 빈칸)
//     → 공정률이 늘 4칸 평균이라 HMI만 있는 완료 프로젝트가 25%
//   새 방식: 원장 = 진행실적 주차 장부(weekly). 메인표 자동 칸은 매번 장부 전체에서 다시 계산한다.
//     진행률(PLC·ETOS·HMI) = 지금까지 누계 % (메인표에 친 지금 값 + 지난 달은 장부)
//     누적 = 지금까지 포인트 합 · 금월/전월 = 그 달 포인트 · 자체 시운전 = 누적 ÷ 총물량 %
//     공정률 전체 = 적용 항목 '지금까지 %' 평균 · 금월(2)/전월(2) = 그 달에 늘어난 만큼
//   장부 주차 키 = 'YYYY-M-W' (월 0채움 없음, W = 1~7일 1주 … 29일~ 5주) — ProgressModal과 동일
// ─────────────────────────────────────────────────────────────────────────

const ym = (y, m) => y * 100 + m;
const prevYm = (v) => { const y = Math.floor(v / 100), m = v % 100; return m === 1 ? ym(y - 1, 12) : v - 1; };
const parseWk = (k) => {
    const p = String(k ?? '').split('-').map(Number);
    if (p.length < 3 || !p.slice(0, 3).every(Number.isFinite)) return null;
    return { y: p[0], m: p[1], w: p[2], ym: ym(p[0], p[1]), ord: p[0] * 1000 + p[1] * 10 + p[2] };
};
const hasV = (v) => v !== undefined && v !== null && String(v).trim() !== '';
const r1 = (n) => Math.round(n * 10) / 10;
const ymOfStr = (s) => { const [y, m] = String(s ?? '').split('-').map(Number); return (Number.isFinite(y) && Number.isFinite(m)) ? ym(y, m) : null; };

// 기술1팀 원문 날짜 표기(26'03/20 · 26’3/2) + 일반 표기(2026-03-20 · 26.03.20 · 2026/3/20) → 'YYYY-MM-DD' (못 읽으면 '')
export const t1DateToYmd = (v) => {
    const s = String(v ?? '').trim();
    const ok = (mo, d) => mo >= 1 && mo <= 12 && d >= 1 && d <= 31;
    const out = (y, mo, d) => `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    let m = s.match(/^(\d{2})\s*['’`]\s*(\d{1,2})\s*[/.-]\s*(\d{1,2})$/);
    if (m && ok(+m[2], +m[3])) return out(2000 + +m[1], +m[2], +m[3]);
    m = s.match(/^(\d{4})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})/);
    if (m && ok(+m[2], +m[3])) return out(+m[1], +m[2], +m[3]);
    m = s.match(/^(\d{2})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})$/);
    if (m && ok(+m[2], +m[3])) return out(2000 + +m[1], +m[2], +m[3]);
    return '';
};

// 'YYYY-MM-DD' → 장부 주차 키 'YYYY-M-W' (앱 규칙: 1~7일 1주 · 8~14일 2주 · 15~21일 3주 · 22~28일 4주 · 29일~ 5주)
export const t1WeekKeyOfYmd = (ymd) => {
    const m = String(ymd ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return '';
    return `${+m[1]}-${+m[2]}-${Math.min(5, Math.max(1, Math.ceil(+m[3] / 7)))}`;
};

// ── 누계 계산 ──
//   weekly   : 진행실적 장부 { plc:{wk:%}, etos, hmi, commissioning:{wk:점}, intCommissioning, sub_i_… }
//   cur      : 메인표 '지금' 값 { plc, etos, hmi } (방금 친 값 포함 · 빈칸이면 null) — curFrom 달부터 이 값을 씀
//   curFrom  : 'YYYY-MM' — 보통 기준월. 완료 프로젝트는 종료 달(그 달에 끝난 값)
//   totalPt  : 총물량 · apply : { plc, etos, hmi, self, int } 공정률 평균에 넣을 항목(호출부 규칙)
//   refYm    : 기준월 'YYYY-MM'
//   돌려줌: acc(누적) · curPts(금월) · prevPts(전월) · selfPct(자체 시운전 %, 포인트 없으면 null) · intPct(통합 시운전 % — 같은 식, 2026-09-29)
//           all(공정률 전체) · cur2(금월 늘어난 만큼) · prev2(전월 늘어난 만큼) · items(기준월 항목별 %)
export function t1CumDerive({ weekly, cur = {}, curFrom, totalPt, apply = {}, refYm }) {
    const wk = weekly || {};
    const M = ymOfStr(refYm);
    if (M === null) return null;
    const M1 = prevYm(M), M2 = prevYm(M1);
    const F = ymOfStr(curFrom) ?? M;
    const entries = (key) => Object.entries(wk[key] || {})
        .map(([k, v]) => { const p = parseWk(k); return p ? { ...p, v } : null; })
        .filter(e => e && hasV(e.v)).sort((a, b) => a.ord - b.ord);
    // 하위(sub_i) 체제 장부면 메인 직접 키는 무시 — 그래프·팝업과 같은 규칙 (2026-07-16)
    const ptsEntries = (base) => {
        const sk = Object.keys(wk).filter(k => new RegExp('^sub_\\d+_' + base + '$').test(k));
        return (sk.length ? sk : [base]).flatMap(k => entries(k));
    };
    const clamp = (n) => Math.max(0, Math.min(100, Number(n) || 0));
    const pctAt = (key, lim) => { let last = null; entries(key).forEach(e => { if (e.ym <= lim) last = Number(e.v) || 0; }); return last; };
    const ptsUpTo = (base, lim) => ptsEntries(base).reduce((s, e) => (e.ym <= lim ? s + (Number(e.v) || 0) : s), 0);
    const ptsIn = (base, v) => ptsEntries(base).reduce((s, e) => (e.ym === v ? s + (Number(e.v) || 0) : s), 0);
    const itemAt = (k, X) => clamp((X >= F && hasV(cur[k])) ? cur[k] : (pctAt(k, X) ?? 0));
    const tot = Number(totalPt) || 0;
    const ptPct = (base, X) => (tot > 0 ? clamp(ptsUpTo(base, X) / tot * 100) : 0);
    const pk = ['plc', 'etos', 'hmi'].filter(k => apply[k]);
    const n = pk.length + (apply.self ? 1 : 0) + (apply.int ? 1 : 0);
    const C = (X) => {
        if (!n) return null;
        let s = pk.reduce((a, k) => a + itemAt(k, X), 0);
        if (apply.self) s += ptPct('commissioning', X);
        if (apply.int) s += ptPct('intCommissioning', X);
        return r1(s / n);
    };
    const cM = C(M), c1 = C(M1), c2 = C(M2);
    const acc = r1(ptsUpTo('commissioning', M));
    const accInt = r1(ptsUpTo('intCommissioning', M));   // 통합 시운전 = 자체와 같은 식 (2026-09-29 팀장님 "자체 시운전과 같게")
    return {
        acc, curPts: r1(ptsIn('commissioning', M)), prevPts: r1(ptsIn('commissioning', M1)),
        selfPct: (tot > 0 && acc > 0) ? r1(clamp(acc / tot * 100)) : null,
        intPct: (tot > 0 && accInt > 0) ? r1(clamp(accInt / tot * 100)) : null,
        all: cM, cur2: cM === null ? null : r1(cM - c1), prev2: c1 === null ? null : r1(c1 - c2),
        items: { plc: itemAt('plc', M), etos: itemAt('etos', M), hmi: itemAt('hmi', M), self: ptPct('commissioning', M), int: ptPct('intCommissioning', M) },
    };
}

// 장부에서 그 % 항목(PLC·ETOS·HMI…)의 '기준월까지 마지막 값' — 없으면 null (2026-09-29 전수 점검)
//   [진행 수치 다시 계산] ③ = 장부엔 값·메인표 빈칸일 때 메인표를 장부 값으로 채우는 복구용 (옛 [월간 마감]이 칸을 비운 경우)
export function t1LatestPct(weekly, key, refYm) {
    const lim = ymOfStr(refYm);
    let best = null, bo = -Infinity;
    Object.entries((weekly || {})[key] || {}).forEach(([k, v]) => {
        const p = parseWk(k);
        if (!p || !hasV(v) || (lim !== null && p.ym > lim)) return;
        if (p.ord > bo) { bo = p.ord; best = Number(v) || 0; }
    });
    return best;
}

// ── 완료 프로젝트 기록을 종료 주로 옮기기 (2026-09-29 팀장님 "종료 주 + 기존 4건 이동") ──
//   종료 달보다 '뒤 달'에 들어간 기록만 대상(같은 달 안의 주는 그대로 — 월별 계산에 차이 없음).
//   % 항목(누계) = 뒤 달 기록 중 가장 나중 값을 종료 주 값으로 · 포인트 항목(주별 합) = 뒤 달 포인트를 종료 주에 더함.
//   하위(sub_i) 키는 건드리지 않음. 옮길 게 없으면 null.
const PCT_KEYS = ['plc', 'etos', 'hmi', 'drawing', 'iomap', 'screen', 'baseinfo'];
const PT_KEYS = ['commissioning', 'intCommissioning'];
export function t1PlanDoneMove(weekly, endWKey) {
    const end = parseWk(endWKey);
    if (!end || !weekly) return null;
    const next = { ...weekly };
    const moved = [];
    [...PCT_KEYS, ...PT_KEYS].forEach(key => {
        const src = weekly[key];
        if (!src || typeof src !== 'object') return;
        const later = Object.entries(src).map(([k, v]) => ({ k, p: parseWk(k), v })).filter(e => e.p && e.p.ym > end.ym && hasV(e.v)).sort((a, b) => a.p.ord - b.p.ord);
        if (!later.length) return;
        const item = { ...src };
        later.forEach(e => { delete item[e.k]; });
        if (PT_KEYS.includes(key)) {
            const add = later.reduce((s, e) => s + (Number(e.v) || 0), 0);
            item[endWKey] = r1((Number(item[endWKey]) || 0) + add);
        } else {
            item[endWKey] = Number(later[later.length - 1].v) || 0;
        }
        next[key] = item;
        moved.push({ key, from: later.map(e => e.k), to: endWKey, value: item[endWKey] });
    });
    return moved.length ? { weekly: next, moved } : null;
}
