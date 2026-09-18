// ─── Software팀 진행 기록 · 일정 그래프 (2026-09-17 팀장님) ─────────────────────────
//   기술팀 '진행실적 등록·실적 그래프'(PLC·ETOS·HMI·시운전 포인트를 주차별 %)는 개발 업무에 맞는 칸이 없어
//   같은 우클릭 자리에 개발용 도구 2개를 둔다. 팀 카드 '개발기록' + 기능.진행기록/일정그래프 스위치로 켠다.
//
//   저장 위치 = 그 행 안 (주차 장부 없음 — 백업·엑셀 반영과 같이 움직임)
//     _devLog   : [{ id, kind:'log', date, pct, text, by, at }  ← 날짜별 한 줄 개발 일지
//                  { id, kind:'end', date, from, to, reason, by, at }]  ← 완료예정일 변경 이력
//     _planEnd0 : 처음 완료예정일 (한 번 정해지면 안 바뀜 — 지연 일수의 기준)
//   규칙(팀장님 확정): 시작일 = 처음 저장 후 잠금(관리자만) · 완료예정일 = 바꿀 때마다 이력 ·
//                    진행 기록 팝업에서는 사유 필수 / 메인표·상세 팝업에서는 선택(빈칸 = '표에서 변경')
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { X, CalendarClock, BarChart3, Lock } from 'lucide-react';

const norm = (s) => String(s ?? '').replace(/\s+/g, '');

// ── 날짜 도우미 (로컬 날짜 기준 — toISOString은 UTC라 새벽에 하루 밀림) ──
export const todayYMD = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const toYMD = (v) => { const m = String(v ?? '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[1]}-${m[2]}-${m[3]}` : ''; };
const dayNum = (ymd) => { const [y, m, d] = ymd.split('-').map(Number); return Date.UTC(y, m - 1, d) / 86400000; };
export const daysBetween = (a, b) => (a && b) ? Math.round(dayNum(b) - dayNum(a)) : null;
const addDays = (ymd, n) => { const t = new Date((dayNum(ymd) + n) * 86400000); return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`; };
const short = (ymd) => ymd ? ymd.slice(2).replace(/-/g, '/') : '—';        // 26/09/30 (메인표와 같은 모양)
const md = (ymd) => ymd ? ymd.slice(5).replace('-', '/') : '';              // 09/30
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pctOf = (v) => { const n = parseFloat(String(v ?? '').replace(/[%\s,]/g, '')); return Number.isFinite(n) ? n : null; };

// 팀 카드 '개발기록' → 실제 표 머리글 이름 (공백 무시 매칭)
export const devCols = (headers, cfg) => {
    if (!cfg) return null;
    const find = (nm) => (nm && (headers || []).find(h => norm(h) === norm(nm))) || null;
    const c = { start: find(cfg.시작열), end: find(cfg.완료열), pct: find(cfg.공정률열), content: find(cfg.내용열) };
    return (c.start || c.end) ? c : null;
};

// 진행 내용 칸에 '- 한 일' 한 줄 추가 (옛 한 줄짜리 ' - ' 구분 글은 먼저 줄로 나눔)
export const appendContentLine = (content, text) => {
    const line = '- ' + String(text ?? '').trim().replace(/^[-·•]\s*/, '');
    let cur = String(content ?? '').replace(/\s+$/, '');
    if (cur && !cur.includes('\n') && /^\s*[-·•]\s/.test(cur)) cur = cur.split(/\s+(?=[-·•]\s)/).join('\n');
    return cur ? `${cur}\n${line}` : line;
};

// 요약 — 팝업 윗줄·그래프 지표가 같은 숫자를 쓰도록 한 곳에서 계산
export const devSummary = (row, cols, today = todayYMD()) => {
    const start = cols?.start ? toYMD(row?.[cols.start]) : '';
    const end   = cols?.end ? toYMD(row?.[cols.end]) : '';
    const plan0 = toYMD(row?._planEnd0) || end;
    const log   = Array.isArray(row?._devLog) ? row._devLog : [];
    const changes = log.filter(e => e && e.kind === 'end');
    return {
        start, end, plan0, log, changes,
        rawEnd: cols?.end ? String(row?.[cols.end] ?? '').trim() : '',
        pct: cols?.pct ? pctOf(row?.[cols.pct]) : null,
        delay: (plan0 && end) ? daysBetween(plan0, end) : null,
        total: (start && end) ? daysBetween(start, end) : null,
        elapsed: start ? Math.max(0, daysBetween(start, today)) : null,
        left: end ? daysBetween(today, end) : null,
    };
};

// 진행 기록 팝업 [적용] → 행에 쓸 칸 (검증은 호출 쪽에서 끝낸 뒤)
//   input = { date, pct, text, endOn, newEnd, reason }
export const buildDevApply = (row, cols, input, who, now = new Date()) => {
    const at = now.toISOString(), day = input.date || todayYMD();
    const prevLog = Array.isArray(row?._devLog) ? row._devLog : [];
    const log = [...prevLog], patch = {};
    const pctStr = String(input.pct ?? '').trim();
    const text = String(input.text ?? '').trim();
    if (pctStr !== '' || text) {
        const p = pctStr === '' ? '' : Math.round(Number(pctStr) * 10) / 10;
        log.push({ id: newId(), kind: 'log', date: day, pct: p, text, by: who || '', at });
        if (p !== '' && cols.pct) patch[cols.pct] = String(p);
        if (text && cols.content) patch[cols.content] = appendContentLine(row?.[cols.content], text);
    }
    const curEnd = cols.end ? toYMD(row?.[cols.end]) : '';
    if (input.endOn && cols.end) {
        const to = toYMD(input.newEnd);
        if (to && to !== curEnd) {
            log.push({ id: newId(), kind: 'end', date: day, from: curEnd, to, reason: String(input.reason ?? '').trim(), by: who || '', at });
            patch[cols.end] = to;
            if (!toYMD(row?._planEnd0) && curEnd) patch._planEnd0 = curEnd;
        }
    }
    if (!toYMD(row?._planEnd0) && !patch._planEnd0 && curEnd) patch._planEnd0 = curEnd;   // 옛 행: 처음 기록할 때 지금 날짜를 '처음 계획'으로 보관
    if (log.length !== prevLog.length) patch._devLog = log;
    return patch;
};

// 메인표·상세 팝업에서 완료예정일을 바꿔 저장할 때 붙일 칸 (사유 선택)
export const devSavePatch = (sv, patch, cols, reason, who, now = new Date()) => {
    const out = {};
    if (!cols?.end) return out;
    const k = Object.keys(patch || {}).find(x => norm(x) === norm(cols.end));
    if (!k) return out;
    const from = toYMD(sv?.[k]), to = toYMD(patch[k]);
    if (!toYMD(sv?._planEnd0)) { if (from) out._planEnd0 = from; else if (to) out._planEnd0 = to; }
    if (from && to && from !== to) {
        out._devLog = [...(Array.isArray(sv?._devLog) ? sv._devLog : []),
            { id: newId(), kind: 'end', date: todayYMD(), from, to, reason: String(reason || '').trim() || '표에서 변경', by: who || '', at: now.toISOString() }];
    }
    return out;
};

// 입력 검사 — 문제 있으면 안내문, 없으면 null
export const checkDevInput = (sum, input) => {
    const pctStr = String(input.pct ?? '').trim(), text = String(input.text ?? '').trim();
    if (pctStr === '' && !text && !input.endOn) return '적을 내용이 없습니다 — 공정률이나 한 일을 적거나, 완료예정일 바꾸기를 켜 주세요.';
    if (!toYMD(input.date)) return '날짜를 골라 주세요.';
    if (pctStr !== '') {
        const n = Number(pctStr);
        if (!Number.isFinite(n) || n < 0 || n > 100) return `공정률은 0~100 사이 숫자로 적어 주세요: "${pctStr}"`;
    }
    if (input.endOn) {
        const to = toYMD(input.newEnd);
        if (!to) return '새 완료예정일을 골라 주세요.';
        if (to === sum.end) return '지금 완료예정일과 같은 날짜입니다.';
        if (sum.start && daysBetween(sum.start, to) < 0) return `완료예정일이 시작일(${short(sum.start)})보다 빠를 수 없습니다.`;
        if (!String(input.reason ?? '').trim()) return '완료예정일을 바꾸는 사유를 꼭 적어 주세요.';
    }
    return null;
};

// ── 지난 월 진행 기록 채우기 (2026-09-18 팀장님, Software팀) ─────────────────
//   월간보고 엑셀을 변환한 '월별기록' 시트(번호·기록날짜·공정률·한 일·완료예정일)를 읽어
//   그 행의 기록(_devLog)·처음 완료예정(_planEnd0)으로 심는다. 표 칸 값은 건드리지 않는다.
//   심은 기록에는 src 도장을 찍는다 → 다시 넣으면 도장 찍힌 것만 갈아끼우고 손으로 적은 기록은 그대로 둔다.
export const MLOG_SRC = '월간보고';
const MLOG_COL = { no: '번호', name: '프로젝트명', date: '기록날짜', pct: '공정률', text: '한 일', end: '완료예정일' };
const pad3 = (s) => /^\d{1,3}$/.test(String(s).trim()) ? String(s).trim().padStart(3, '0') : String(s).trim();

// 시트(2차원 배열) → 기록 목록 (머리글 줄은 스스로 찾는다)
export const parseMonthLogSheet = (raw) => {
    const rows = Array.isArray(raw) ? raw : [];
    const hi = rows.findIndex(r => Array.isArray(r) && r.some(c => norm(c) === '번호') && r.some(c => norm(c) === '기록날짜'));
    if (hi < 0) return { items: [], error: "'월별기록' 시트에서 머리글(번호·기록날짜)을 찾지 못했습니다." };
    const head = rows[hi].map(c => norm(c));
    const ci = {}; Object.keys(MLOG_COL).forEach(k => { ci[k] = head.indexOf(norm(MLOG_COL[k])); });
    const get = (r, i) => (i >= 0 && r[i] !== undefined && r[i] !== null) ? String(r[i]).trim() : '';
    const items = [];
    rows.slice(hi + 1).forEach(r => {
        if (!Array.isArray(r)) return;
        const no = get(r, ci.no), date = toYMD(get(r, ci.date));
        if (!no || !date) return;
        items.push({ no: pad3(no), name: get(r, ci.name), date, pct: get(r, ci.pct), text: get(r, ci.text), end: toYMD(get(r, ci.end)) });
    });
    return { items, error: items.length ? null : "'월별기록' 시트에 읽을 줄이 없습니다." };
};

// 기록 목록 + 웹 행 → 행별 계획 (실제 쓰기는 부르는 쪽에서)
export const buildMonthLogPlan = (items, rows, o = {}) => {
    const numCol = o.numCol || '번호', nameCol = o.nameCol || '프로젝트명';
    const by = o.by || MLOG_SRC, reason = o.reason || '월간보고 기준 변경';
    const at = (o.now || new Date()).toISOString();
    const byNo = new Map(), byName = new Map();
    (rows || []).forEach(r => {
        const y = String(r._year || ''), n = String(r[numCol] ?? '').trim();
        if (n) byNo.set(`${y}||${pad3(n)}`, r);
        const nm = norm(r[nameCol]);
        if (nm && !byName.has(`${y}||${nm}`)) byName.set(`${y}||${nm}`, r);   // 이름 짝도 연도 안에서만 (2026-09-18)
    });
    // ★묶음 열쇠 = 연도 + 번호 (2026-09-18): 번호는 해마다 001부터 다시 시작하므로
    //   번호만으로 묶으면 2025년 001과 2024년 001이 한 프로젝트가 된다.
    const groups = new Map();
    (items || []).forEach(it => {
        const k = `${String(it.date).slice(0, 4)}||${it.no}`;
        if (!groups.has(k)) groups.set(k, []); groups.get(k).push(it);
    });
    const plan = [], unmatched = [];
    let seq = 0;
    groups.forEach((list0, gkey) => {
        const list = list0.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
        const year = String(list[0].date).slice(0, 4);
        const no = list[0].no;
        // 이름 짝은 그 해 행에서만 찾는다(해마다 같은 이름이 이어지는 프로젝트가 있어 연도를 넘으면 안 됨)
        const row = byNo.get(gkey) || byName.get(`${year}||${norm(list[0].name)}`) || null;
        if (!row) { unmatched.push({ no, year, name: list[0].name, months: list.length }); return; }
        const cur = Array.isArray(row._devLog) ? row._devLog : [];
        const keep = cur.filter(e => !e || e.src !== MLOG_SRC);
        const entries = [];
        let prevEnd = '', ends = 0;
        list.forEach(it => {
            const ps = String(it.pct ?? '').replace(/[%\s,]/g, '');
            const p = (ps === '' || !Number.isFinite(Number(ps))) ? '' : Math.round(Number(ps) * 10) / 10;
            const text = String(it.text ?? '').trim();
            if (p !== '' || text) entries.push({ id: `ml-${gkey}-${it.date}-${seq++}`, kind: 'log', date: it.date, pct: p, text, by, at, src: MLOG_SRC });
            if (it.end) {
                if (prevEnd && it.end !== prevEnd) { entries.push({ id: `me-${gkey}-${it.date}-${seq++}`, kind: 'end', date: it.date, from: prevEnd, to: it.end, reason, by, at, src: MLOG_SRC }); ends++; }
                prevEnd = it.end;
            }
        });
        const first = (list.find(x => x.end) || {}).end || '';
        const have0 = toYMD(row._planEnd0);
        plan.push({
            rowId: row._id, no, year, name: String(row[nameCol] ?? '') || list[0].name, months: list.length,
            logs: entries.filter(e => e.kind === 'log').length, ends, replaced: cur.length - keep.length, kept: keep.length,
            planEnd0: (!have0 && first) ? first : '', planEnd0Have: have0,
            devLog: [...keep, ...entries].sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.at).localeCompare(String(b.at))),
        });
    });
    plan.sort((a, b) => String(a.year).localeCompare(String(b.year)) || String(a.no).localeCompare(String(b.no)));
    const sum = (k) => plan.reduce((s, p) => s + p[k], 0);
    return { plan, unmatched, counts: { rows: plan.length, logs: sum('logs'), ends: sum('ends'), replaced: sum('replaced'), unmatched: unmatched.length } };
};

// 심은 기록만 걷어내기 (되돌리기) — 손으로 적은 기록은 남긴다. 지울 게 없으면 null
export const stripMonthLog = (row) => {
    const cur = Array.isArray(row && row._devLog) ? row._devLog : [];
    const keep = cur.filter(e => !e || e.src !== MLOG_SRC);
    return keep.length === cur.length ? null : keep;
};

// ── 공통 겉모양 ──
const Overlay = ({ children }) => (
    // 바깥(어두운 곳) 클릭으로는 닫히지 않음 — 버튼으로만 (2026-09-15 전 팝업 공통 규칙)
    <div className="fixed inset-0 z-[9400] bg-black/30 flex items-center justify-center p-3">{children}</div>
);
const Head = ({ no, name, status, statusColor, icon, title, onClose }) => (
    <div className="flex items-center gap-2.5 px-5 py-3 border-b border-[#f0edea] shrink-0">
        {icon}
        <span className="text-[12px] font-bold text-[#8f8b84] shrink-0">{title}</span>
        {no && <span className="text-[11.5px] font-bold text-[#8f8b84] bg-[#f3f1ee] rounded px-1.5 shrink-0">{no}</span>}
        <b className="text-[15px] text-[#37352f] truncate min-w-0">{name || '(이름 없음)'}</b>
        {status && (
            <span className="text-[11px] font-bold rounded-full px-2 py-px border shrink-0"
                style={{ color: statusColor?.text || '#6b7280', background: statusColor?.bg || '#f3f4f6', borderColor: statusColor?.border || '#e5e7eb' }}>{status}</span>
        )}
        <button onClick={onClose} className="ml-auto p-1 rounded-lg text-[#a4a097] hover:bg-[#f3f1ee] hover:text-[#37352f] shrink-0" title="닫기"><X size={18} /></button>
    </div>
);
const Fact = ({ k, v, s, color, lock }) => (
    <div className="px-3.5 py-2.5 border-r border-[#f0edea] last:border-r-0 min-w-0">
        <div className="text-[10.5px] font-bold text-[#8f8b84] flex items-center gap-1 whitespace-nowrap">{k}{lock && <Lock size={10} />}</div>
        <div className="text-[18px] font-bold mt-0.5 tracking-tight whitespace-nowrap" style={{ color: color || '#37352f', fontVariantNumeric: 'tabular-nums' }}>{v}</div>
        <div className="text-[10px] text-[#a4a097] mt-0.5 whitespace-nowrap">{s}</div>
    </div>
);
const delayText = (d) => d === null ? '—' : d > 0 ? `+${d}일` : d < 0 ? `${d}일` : '없음';
const delayColor = (d) => d > 0 ? '#d97706' : d < 0 ? '#059669' : '#37352f';

// ═══ ① 진행 기록 팝업 ═══
export function DevLogModal({ row, cols, no, name, status, statusColor, who, startLocked, onApply, onClose, onOpenGraph, notify }) {
    const sum = useMemo(() => devSummary(row, cols), [row, cols]);
    const [date, setDate] = useState(todayYMD());
    const [pct, setPct] = useState('');
    const [text, setText] = useState('');
    const [endOn, setEndOn] = useState(false);
    const [newEnd, setNewEnd] = useState(sum.end);
    const [reason, setReason] = useState('');
    const [saving, setSaving] = useState(false);
    const textRef = useRef(null);
    useEffect(() => { if (textRef.current) textRef.current.focus(); }, []);
    const dirty = pct !== '' || text.trim() !== '' || endOn;
    const alertFn = notify || ((m) => window.alert(m));

    const close = () => { if (dirty && !window.confirm('적어 둔 내용이 아직 적용되지 않았습니다. 닫을까요?')) return; onClose(); };
    const apply = async () => {
        if (saving) return;
        const input = { date, pct, text, endOn, newEnd, reason };
        const bad = checkDevInput(sum, input);
        if (bad) { alertFn(bad); return; }
        setSaving(true);
        const ok = await onApply(buildDevApply(row, cols, input, who));
        setSaving(false);
        if (ok) { setPct(''); setText(''); setEndOn(false); setReason(''); }
    };
    // 최신이 위 — 같은 날이면 나중에 적은 것이 위
    const list = [...sum.log].sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.at).localeCompare(String(a.at)));
    const endChanged = sum.changes.length;

    return (
        <Overlay>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[780px] max-h-[92vh] flex flex-col border border-[#e5e3df]"
                onKeyDown={e => { if (e.key === 'Escape') close(); }}>
                <Head no={no} name={name} status={status} statusColor={statusColor} title="진행 기록"
                    icon={<CalendarClock size={18} className="text-[#1e7ac8] shrink-0" />} onClose={close} />
                {/* 요약 */}
                <div className="grid grid-cols-5 border-b border-[#f0edea] shrink-0">
                    <Fact k="시작일" lock={startLocked} v={short(sum.start)} s={startLocked ? '처음 저장 후 고정' : sum.start ? '시작' : '시작일 없음'} />
                    <Fact k="처음 완료예정" v={short(sum.plan0)} s="처음 계획 보관" />
                    <Fact k="지금 완료예정" v={sum.end ? short(sum.end) : (sum.rawEnd || '—')} s={endChanged ? `${endChanged}번 변경` : '변경 없음'} color={sum.delay > 0 ? '#d97706' : undefined} />
                    <Fact k="지연" v={delayText(sum.delay)} s="지금 − 처음" color={delayColor(sum.delay)} />
                    <Fact k="공정률" v={sum.pct === null ? '—' : `${sum.pct}%`} s={sum.left === null ? '' : sum.left >= 0 ? `완료까지 ${sum.left}일` : `예정일 ${-sum.left}일 지남`} color="#1e7ac8" />
                </div>
                {/* 적기 */}
                <div className="px-5 py-3.5 bg-[#fbfaf8] border-b border-[#f0edea] shrink-0">
                    <div className="text-[12px] font-bold text-[#8f8b84] mb-2">오늘 한 일 적기</div>
                    <div className="flex gap-2 items-end flex-wrap">
                        <label className="flex flex-col text-[10px] font-bold text-[#a4a097]">날짜
                            <input type="date" value={date} onChange={e => setDate(e.target.value)} max={todayYMD()}
                                className="mt-0.5 border border-[#d9d5ce] rounded-lg px-2 py-1.5 text-[13px] text-[#37352f] font-normal outline-none focus:border-[#1e7ac8]" />
                        </label>
                        <label className="flex flex-col text-[10px] font-bold text-[#a4a097]">공정률 %
                            <input type="number" min="0" max="100" step="1" value={pct} placeholder={sum.pct === null ? '' : String(sum.pct)}
                                onChange={e => setPct(e.target.value)} onWheel={e => e.currentTarget.blur()}
                                className="mt-0.5 w-[88px] border border-[#d9d5ce] rounded-lg px-2 py-1.5 text-[13px] text-[#37352f] font-normal outline-none focus:border-[#1e7ac8]" />
                        </label>
                        <label className="flex flex-col text-[10px] font-bold text-[#a4a097] flex-1 min-w-[240px]">한 일 (진행 내용에 '- ' 한 줄로 추가됨)
                            <input ref={textRef} value={text} onChange={e => setText(e.target.value)} placeholder="예) 파주 현장 셋업 완료"
                                onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); apply(); } }}
                                className="mt-0.5 border border-[#d9d5ce] rounded-lg px-2.5 py-1.5 text-[13px] text-[#37352f] font-normal outline-none focus:border-[#1e7ac8]" />
                        </label>
                    </div>
                    {cols.end && (
                        <button type="button" onClick={() => { setEndOn(v => !v); if (!endOn) setNewEnd(sum.end || ''); }}
                            className={`mt-2.5 flex items-center gap-2 text-[12.5px] font-bold ${endOn ? 'text-[#d97706]' : 'text-[#8f8b84] hover:text-[#d97706]'}`}>
                            <span className={`relative w-[30px] h-[17px] rounded-full transition-colors ${endOn ? 'bg-[#d97706]' : 'bg-[#d6d2ca]'}`}>
                                <span className="absolute top-[2px] w-[13px] h-[13px] rounded-full bg-white" style={{ left: endOn ? 15 : 2 }} />
                            </span>
                            완료예정일 바꾸기
                        </button>
                    )}
                    {endOn && (
                        <div className="mt-2 p-2.5 rounded-lg border border-dashed border-[#f0c27a] bg-[#fdf0dc] flex gap-2 items-end flex-wrap">
                            <div className="flex flex-col text-[10px] font-bold text-[#a4a097]">지금
                                <span className="mt-0.5 px-2 py-1.5 text-[13px] text-[#37352f] font-normal">{sum.end ? short(sum.end) : (sum.rawEnd || '없음')}</span>
                            </div>
                            <span className="pb-2 text-[#d97706] font-bold">→</span>
                            <label className="flex flex-col text-[10px] font-bold text-[#a4a097]">새 완료예정
                                <input type="date" value={newEnd} onChange={e => setNewEnd(e.target.value)} min={sum.start || undefined}
                                    className="mt-0.5 border border-[#d9d5ce] rounded-lg px-2 py-1.5 text-[13px] text-[#37352f] font-normal bg-white outline-none focus:border-[#d97706]" />
                            </label>
                            <label className="flex flex-col text-[10px] font-bold text-[#a4a097] flex-1 min-w-[240px]">사유 (필수)
                                <input value={reason} onChange={e => setReason(e.target.value)} placeholder="예) 현장 일정 미정 — 셋업 순연"
                                    className="mt-0.5 border border-[#d9d5ce] rounded-lg px-2.5 py-1.5 text-[13px] text-[#37352f] font-normal bg-white outline-none focus:border-[#d97706]" />
                            </label>
                            {sum.end && toYMD(newEnd) && toYMD(newEnd) !== sum.end && (
                                <span className="pb-2 text-[12px] font-bold text-[#d97706] whitespace-nowrap">{daysBetween(sum.end, toYMD(newEnd)) > 0 ? '+' : ''}{daysBetween(sum.end, toYMD(newEnd))}일</span>
                            )}
                        </div>
                    )}
                </div>
                {/* 기록 목록 */}
                <div className="px-5 py-1 overflow-y-auto min-h-[90px]">
                    <div className="text-[12px] font-bold text-[#8f8b84] mt-2 mb-1">기록 {list.length}건</div>
                    {list.length === 0 && <div className="py-6 text-center text-[12.5px] text-[#a4a097]">아직 기록이 없습니다. 위에 오늘 한 일을 적고 [적용]을 누르세요.</div>}
                    {list.map((e, i) => (
                        <div key={e.id || `${e.at || ""}-${i}`} className="grid gap-2.5 py-2 border-t border-[#f0edea] text-[13px] items-baseline" style={{ gridTemplateColumns: '48px 48px 1fr' }}>
                            <span className="text-[12px] text-[#8f8b84]" style={{ fontVariantNumeric: 'tabular-nums' }}>{md(e.date)}</span>
                            {e.kind === 'end'
                                ? <span className="font-bold text-[#d97706]">일정</span>
                                : <span className="font-bold text-[#1e7ac8]" style={{ fontVariantNumeric: 'tabular-nums' }}>{e.pct === '' || e.pct === undefined ? '—' : `${e.pct}%`}</span>}
                            <span className="text-[#37352f] min-w-0 break-words whitespace-pre-line">
                                {e.kind === 'end'
                                    ? <>완료예정 {e.from ? md(e.from) : '없음'} → <b>{md(e.to)}</b>{e.reason ? <span className="text-[#a4a097] text-[11.5px]"> · {e.reason}</span> : null}</>
                                    : (e.text || <span className="text-[#a4a097]">(공정률만 기록)</span>)}
                                {e.by ? <span className="text-[#b8b4ac] text-[11px]"> · {String(e.by).replace(/@.*$/, '')}</span> : null}
                            </span>
                        </div>
                    ))}
                </div>
                {/* 아래 버튼 */}
                <div className="flex gap-2 items-center px-5 py-3 border-t border-[#f0edea] shrink-0 flex-wrap">
                    <span className="text-[11.5px] text-[#a4a097] mr-auto">[적용] = 공정률·완료예정일·진행 내용이 메인표에 바로 저장 · 100%면 진행 현황이 '완료'로</span>
                    {onOpenGraph && (
                        <button onClick={() => { if (dirty && !window.confirm('적어 둔 내용이 아직 적용되지 않았습니다. 그래프로 넘어갈까요?')) return; onOpenGraph(); }}
                            className="flex items-center gap-1.5 text-[13px] font-bold rounded-lg px-3 py-1.5 border border-[#d6c9f5] text-[#7c3aed] hover:bg-[#f7f4fd]">
                            <BarChart3 size={14} /> 일정 그래프
                        </button>
                    )}
                    <button onClick={close} className="text-[13px] font-bold rounded-lg px-3.5 py-1.5 border border-[#d9d5ce] text-[#37352f] hover:bg-[#f3f1ee]">닫기</button>
                    <button onClick={apply} disabled={saving}
                        className="text-[13px] font-bold rounded-lg px-4 py-1.5 bg-[#1e7ac8] text-white hover:bg-[#1968ad] disabled:opacity-50">{saving ? '저장 중…' : '적용'}</button>
                </div>
            </div>
        </Overlay>
    );
}

// ═══ ② 일정 그래프 ═══
//   위 = 일정 막대(점선 = 처음 계획 · 주황 빗금 = 늘어난 기간 · 진한 파랑 = 지난 기간)
//   아래 = 기록에서 나온 공정률 선 + '계획대로라면' 점선(시작 0% → 처음 완료예정 100%)
export const buildScheduleGeom = (sum, today = todayYMD(), W = 680) => {
    const L = 46, R = 22;
    const dates = [sum.start, sum.end, sum.plan0, today, ...sum.log.map(e => toYMD(e.date))].filter(Boolean).sort();
    if (!dates.length) return null;
    const d0 = addDays(dates[0], -5), d1 = addDays(dates[dates.length - 1], 10);
    const span = Math.max(1, daysBetween(d0, d1));
    const x = (ymd) => L + (daysBetween(d0, ymd) / span) * (W - L - R);
    const months = [];
    let [yy, mm] = d0.split('-').map(Number); mm += 1; if (mm > 12) { mm = 1; yy += 1; }
    for (let i = 0; i < 36; i++) {
        const m = `${yy}-${String(mm).padStart(2, '0')}-01`;
        if (m > d1) break;
        months.push({ x: x(m), label: mm === 1 ? `${yy}년 1월` : `${mm}월` });
        mm += 1; if (mm > 12) { mm = 1; yy += 1; }
    }
    const y = (p) => 210 - Math.max(0, Math.min(100, p)) * 0.96;
    const pts = sum.log.filter(e => e.kind !== 'end' && e.pct !== '' && e.pct !== undefined && toYMD(e.date))
        .map(e => ({ d: toYMD(e.date), p: Number(e.pct), at: e.at || '' }))
        .sort((a, b) => a.d.localeCompare(b.d) || a.at.localeCompare(b.at));
    // 같은 날 여러 번이면 마지막 값만
    const byDay = []; pts.forEach(p => { if (byDay.length && byDay[byDay.length - 1].d === p.d) byDay[byDay.length - 1] = p; else byDay.push(p); });
    if (!byDay.length && sum.pct !== null) byDay.push({ d: today, p: sum.pct });
    if (byDay.length && sum.start && byDay[0].d > sum.start) byDay.unshift({ d: sum.start, p: 0, origin: true });
    const line = byDay.map(p => ({ ...p, cx: x(p.d), cy: y(p.p) }));
    // 라벨 겹침 피하기 — 다음 점과 28px 안쪽이면 앞 점 라벨 생략 (마지막 점은 항상)
    line.forEach((p, i) => { p.label = !p.origin && (i === line.length - 1 || line[i + 1].cx - p.cx >= 28); });
    return {
        W, H: 250, L, R, x, y, months, line,
        bar: sum.start && sum.end ? { x1: x(sum.start), x2: x(sum.end) } : null,
        plan: sum.start && sum.plan0 ? { x1: x(sum.start), x2: x(sum.plan0) } : null,
        todayX: x(today),
        doneX: sum.start && sum.end ? Math.min(x(sum.end), Math.max(x(sum.start), x(today))) : null,
        marks: sum.changes.filter(c => toYMD(c.date)).map(c => ({ x: x(toYMD(c.date)), c })),
    };
};

export function DevScheduleModal({ row, cols, no, name, status, statusColor, onClose, onOpenLog }) {
    const today = todayYMD();
    const sum = useMemo(() => devSummary(row, cols, today), [row, cols, today]);
    const g = useMemo(() => buildScheduleGeom(sum, today), [sum, today]);
    const ext = g && g.plan && g.bar && sum.delay > 0 ? { x1: g.plan.x2, x2: g.bar.x2 } : null;
    const Kpi = ({ k, v, warn }) => (
        <span className={`text-[11.5px] font-bold rounded-lg px-2.5 py-1 whitespace-nowrap ${warn ? 'bg-[#fdf0dc] text-[#9a5a05]' : 'bg-[#f3f1ee] text-[#8f8b84]'}`}>
            {k}<strong className={`ml-1 text-[14px] ${warn ? 'text-[#d97706]' : 'text-[#37352f]'}`}>{v}</strong>
        </span>
    );
    return (
        <Overlay>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[780px] max-h-[92vh] flex flex-col border border-[#e5e3df]"
                onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
                <Head no={no} name={name} status={status} statusColor={statusColor} title="일정 그래프"
                    icon={<BarChart3 size={18} className="text-[#7c3aed] shrink-0" />} onClose={onClose} />
                <div className="px-5 pt-3 pb-4 overflow-y-auto">
                    <div className="flex gap-2 flex-wrap mb-2">
                        <Kpi k="기간" v={sum.total === null ? '—' : `${sum.total}일`} />
                        <Kpi k="경과" v={sum.elapsed === null ? '—' : `${sum.elapsed}일`} />
                        <Kpi k="남음" v={sum.left === null ? '—' : sum.left >= 0 ? `${sum.left}일` : `${-sum.left}일 지남`} warn={sum.left !== null && sum.left < 0} />
                        <Kpi k="공정률" v={sum.pct === null ? '—' : `${sum.pct}%`} />
                        <Kpi k="지연" v={delayText(sum.delay)} warn={sum.delay > 0} />
                    </div>
                    {!g || !g.bar ? (
                        <div className="py-10 text-center text-[13px] text-[#8f8b84] leading-relaxed">
                            시작일과 완료예정일이 모두 있어야 그래프를 그릴 수 있습니다.<br />
                            지금 값 — 시작일 <b>{sum.start ? short(sum.start) : '없음'}</b> · 완료예정 <b>{sum.end ? short(sum.end) : (sum.rawEnd || '없음')}</b>
                        </div>
                    ) : (
                        <svg viewBox={`0 0 ${g.W} ${g.H}`} width="100%" role="img" aria-label="일정과 공정률 그래프" style={{ fontFamily: 'inherit' }}>
                            <defs>
                                <pattern id="devHatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                                    <rect width="6" height="6" fill="#fdf0dc" />
                                    <line x1="0" y1="0" x2="0" y2="6" stroke="#d97706" strokeWidth="2.2" />
                                </pattern>
                            </defs>
                            {g.months.map((m, i) => (
                                <g key={i}>
                                    <line x1={m.x} y1={22} x2={m.x} y2={212} stroke="#eeeae3" />
                                    <text x={m.x + 4} y={15} fontSize="11" fill="#8f8b84" fontWeight="600">{m.label}</text>
                                </g>
                            ))}
                            <text x={g.L - 6} y={60} fontSize="10.5" fill="#a4a097" fontWeight="700" textAnchor="end">일정</text>
                            <rect x={g.bar.x1} y={44} width={Math.max(2, g.bar.x2 - g.bar.x1)} height={24} rx={6} fill="#dcebf8" />
                            {ext && <rect x={ext.x1} y={44} width={Math.max(0, ext.x2 - ext.x1)} height={24} fill="url(#devHatch)" />}
                            {g.doneX > g.bar.x1 && <rect x={g.bar.x1} y={44} width={g.doneX - g.bar.x1} height={24} rx={6} fill="#1e7ac8" />}
                            {g.plan && <rect x={g.plan.x1} y={44} width={Math.max(2, g.plan.x2 - g.plan.x1)} height={24} rx={6} fill="none" stroke="#7d8793" strokeWidth="1.4" strokeDasharray="4 3" />}
                            {g.doneX - g.bar.x1 > 70 && <text x={g.bar.x1 + 7} y={60.5} fontSize="11" fill="#fff" fontWeight="700">경과 {sum.elapsed}일</text>}
                            <text x={g.bar.x1} y={84} fontSize="10.5" fill="#6d6860" fontWeight="600" textAnchor="middle">{md(sum.start)} 시작</text>
                            {sum.delay !== 0 && g.plan && Math.abs(g.plan.x2 - g.bar.x2) > 40 && (
                                <text x={g.plan.x2} y={84} fontSize="10.5" fill="#6d6860" textAnchor="middle">처음 {md(sum.plan0)}</text>
                            )}
                            <text x={g.bar.x2} y={sum.delay !== 0 && g.plan && Math.abs(g.plan.x2 - g.bar.x2) <= 40 ? 96 : 84} fontSize="10.5"
                                fill={sum.delay > 0 ? '#d97706' : '#37352f'} fontWeight="700" textAnchor="middle">{sum.delay ? '지금 ' : '완료예정 '}{md(sum.end)}</text>
                            {g.marks.map((m, i) => (
                                <path key={i} d={`M${m.x} 34 l5 5 -5 5 -5 -5z`} fill="#d97706">
                                    <title>{`${md(m.c.date)} 완료예정 ${m.c.from ? md(m.c.from) : '없음'} → ${md(m.c.to)}${m.c.reason ? ' · ' + m.c.reason : ''}`}</title>
                                </path>
                            ))}

                            <text x={g.L - 6} y={117} fontSize="10.5" fill="#a4a097" fontWeight="700" textAnchor="end">%</text>
                            {[100, 50, 0].map(p => (
                                <g key={p}>
                                    <line x1={g.L} y1={g.y(p)} x2={g.W - g.R} y2={g.y(p)} stroke="#f0edea" />
                                    <text x={g.L - 6} y={g.y(p) + 3} fontSize="9.5" fill="#a4a097" textAnchor="end">{p}</text>
                                </g>
                            ))}
                            {g.plan && (
                                <>
                                    <line x1={g.plan.x1} y1={g.y(0)} x2={g.plan.x2} y2={g.y(100)} stroke="#7d8793" strokeWidth="1.2" strokeDasharray="4 4" />
                                    <text x={Math.min(g.plan.x2 + 5, g.W - g.R - 60)} y={g.y(100) - 3} fontSize="10" fill="#8f8b84">계획대로라면</text>
                                </>
                            )}
                            {g.line.length > 1 && (
                                <>
                                    <polygon points={`${g.line.map(p => `${p.cx},${p.cy}`).join(' ')} ${g.line[g.line.length - 1].cx},${g.y(0)} ${g.line[0].cx},${g.y(0)}`} fill="#059669" fillOpacity=".08" />
                                    <polyline points={g.line.map(p => `${p.cx},${p.cy}`).join(' ')} fill="none" stroke="#059669" strokeWidth="2.4" strokeLinejoin="round" />
                                </>
                            )}
                            {g.line.filter(p => !p.origin).map((p, i, arr) => (
                                <g key={i}>
                                    <circle cx={p.cx} cy={p.cy} r={i === arr.length - 1 ? 4.5 : 3.5} fill={i === arr.length - 1 ? '#059669' : '#fff'} stroke="#059669" strokeWidth="2">
                                        <title>{`${md(p.d)} · ${p.p}%`}</title>
                                    </circle>
                                    {p.label && <text x={p.cx} y={p.cy - 8} fontSize="10.5" fontWeight="700" fill="#047857" textAnchor="middle">{p.p}%</text>}
                                </g>
                            ))}
                            {g.todayX >= g.L && g.todayX <= g.W - g.R && (
                                <>
                                    <line x1={g.todayX} y1={26} x2={g.todayX} y2={214} stroke="#dc2626" strokeWidth="1.4" />
                                    <rect x={g.todayX - 30} y={226} width={60} height={18} rx={9} fill="#dc2626" />
                                    <text x={g.todayX} y={239} fontSize="10.5" fill="#fff" fontWeight="700" textAnchor="middle">오늘 {md(today)}</text>
                                </>
                            )}
                        </svg>
                    )}
                    <div className="flex gap-3.5 flex-wrap text-[11.5px] text-[#8f8b84] mt-1">
                        <span className="flex items-center gap-1.5"><i className="block w-4 h-2 rounded-sm bg-[#1e7ac8]" />지난 기간</span>
                        <span className="flex items-center gap-1.5"><i className="block w-4 h-2 rounded-sm bg-[#dcebf8]" />남은 기간</span>
                        <span className="flex items-center gap-1.5"><i className="block w-4 h-2 rounded-sm border border-dashed border-[#7d8793]" />처음 계획</span>
                        <span className="flex items-center gap-1.5"><i className="block w-4 h-2 rounded-sm" style={{ background: 'repeating-linear-gradient(45deg,#d97706 0 2px,#fdf0dc 2px 5px)' }} />늘어난 기간</span>
                        <span className="flex items-center gap-1.5"><i className="block w-4 h-[3px] rounded-sm bg-[#059669]" />공정률 (진행 기록)</span>
                        <span className="flex items-center gap-1.5"><i className="block w-4 border-t border-dashed border-[#7d8793]" />계획대로라면</span>
                    </div>
                    <div className="mt-3 text-[12px] font-bold text-[#8f8b84]">완료예정일 변경 이력 {sum.changes.length}건</div>
                    {sum.changes.length === 0 ? (
                        <div className="py-3 text-[12.5px] text-[#a4a097]">변경 없음 — 처음 계획대로 진행 중입니다.</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-[12.5px] mt-1 border-collapse">
                                <thead><tr className="text-[11px] text-[#a4a097]">
                                    {['변경', '날짜', '완료예정', '늘어난 날', '사유', '누가'].map(h => <th key={h} className="text-left font-bold px-2 py-1.5 border-t border-[#f0edea] whitespace-nowrap">{h}</th>)}
                                </tr></thead>
                                <tbody>
                                    {sum.changes.map((c, i) => {
                                        const dd = c.from && c.to ? daysBetween(c.from, c.to) : null;
                                        return (
                                            <tr key={c.id || i} className="text-[#37352f]">
                                                <td className="px-2 py-1.5 border-t border-[#f0edea] whitespace-nowrap">{i + 1}회</td>
                                                <td className="px-2 py-1.5 border-t border-[#f0edea] whitespace-nowrap">{short(c.date)}</td>
                                                <td className="px-2 py-1.5 border-t border-[#f0edea] whitespace-nowrap">{c.from ? short(c.from) : '없음'} → {short(c.to)}</td>
                                                <td className="px-2 py-1.5 border-t border-[#f0edea] whitespace-nowrap font-bold" style={{ color: delayColor(dd || 0) }}>{dd === null ? '—' : (dd > 0 ? `+${dd}` : dd)}</td>
                                                <td className="px-2 py-1.5 border-t border-[#f0edea]">{c.reason || '—'}</td>
                                                <td className="px-2 py-1.5 border-t border-[#f0edea] whitespace-nowrap text-[#8f8b84]">{String(c.by || '').replace(/@.*$/, '') || '—'}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                    <p className="text-[11px] text-[#a4a097] mt-2">초록 선이 '계획대로라면' 점선보다 위면 앞서가는 것, 아래면 늦는 것입니다.</p>
                </div>
                <div className="flex gap-2 justify-end px-5 py-3 border-t border-[#f0edea] shrink-0">
                    {onOpenLog && (
                        <button onClick={onOpenLog} className="flex items-center gap-1.5 text-[13px] font-bold rounded-lg px-3 py-1.5 border border-[#bcd7f0] text-[#1e7ac8] hover:bg-[#f0f7fd]">
                            <CalendarClock size={14} /> 진행 기록
                        </button>
                    )}
                    <button onClick={onClose} className="text-[13px] font-bold rounded-lg px-3.5 py-1.5 border border-[#d9d5ce] text-[#37352f] hover:bg-[#f3f1ee]">닫기</button>
                </div>
            </div>
        </Overlay>
    );
}
