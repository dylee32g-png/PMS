import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ChevronLeft, FileText, ListChecks, Upload, Download, Search, BarChart3, X } from 'lucide-react';
import { onSnapshot, getDoc, setDoc } from 'firebase/firestore';
import { rowsColRef, snapshotDocRef, monthlyReportDocRef } from './projectListData';
import { loadXLSX } from '../utils';
import { logAudit, AUDIT_ACTIONS } from '../auditLog';

// ─────────────────────────────────────────────────────────────────────────
// 기술1팀 월간보고 — 엑셀(월간보고_기술1팀) 원본을 웹으로 (2026-08-13 팀장님 컨셉 v3)
//   · [엑셀 업로드] = 월간보고 엑셀 '금월' 시트 전체(월별 매트릭스 포함)를 웹 원본으로 저장 (List 업로드와 같은 방식)
//   · 기준월 선택 = 엑셀 D2와 같은 역할 — 1~12월 아무 달이나 골라 그 달의 전월/금월/증감 조회 (2026년 전체)
//   · List 수준 기능: 틀고정(공사명까지)+헤더 고정, 상태 칩 필터, 검색, 정렬, KPI 집계 카드,
//     팀 월별 추이 그래프(막대=시운전 실적·선=평균 공정률), 행 클릭 = 그 프로젝트 월별 실적 상세.
//   · List = 뼈대: 견적번호로 매칭되는 행은 현재월=List 실시간 / 과거월=[월간 마감] 스냅샷이 엑셀 값을 덮음.
//     List에만 있는 행도 항상 표에 나타남.
//   · 자동 계산 = 엑셀 수식과 동일: 공증률=5개% 평균(빈칸 제외)·누적=매트릭스 전체 합(V)·잔여=Point−(누적||0)(BB)·
//     전월/금월=매트릭스[m−1]/[m](HLOOKUP)·증감=공정률 금월−전월 · 자재%=List 납품 O→100%.
// ─────────────────────────────────────────────────────────────────────────

const norm = (s) => String(s ?? '').replace(/\s/g, '');
const isSubRow = (r) => { const e = String(r?.['실행번호'] || '').trim().toLowerCase(); return e === 's' || e.startsWith('-'); };
const num = (v) => { const n = parseFloat(String(v ?? '').replace(/[%,]/g, '')); return Number.isFinite(n) ? n : null; };
const colL = (n) => { let s = ''; while (n > 0) { s = String.fromCharCode(65 + (n - 1) % 26) + s; n = Math.floor((n - 1) / 26); } return s; };

// 진행현황 번역표 (2026-08-13 팀장님 승인) — List 계약+작업 2단 → 보고용 한 단어
//   '보고완료'는 담당자 수동 승격 개념(완료 후 윗분 보고까지 마치면) — 작업 칸 값 그대로 존중.
export const reportStatus = (계약, 작업) => {
    const c = String(계약 || '').trim(), w = String(작업 || '').trim();
    if (c === '취소' || w === '취소') return 'DROP(취소)';
    if (c === '보류' || w === '보류') return '보류';
    if (c === '패찰') return '패찰';
    if (['예상', '견적', '입찰', '투심', '물량'].includes(c)) return c;
    if (c === '수주') {
        if (w === '보고완료') return '보고완료';
        if (w === '완료') return '완료';
        if (w === '진행') return '진행중';
        if (w === '준비' || w === '대기') return '준비';
        if (w === '미작업') return '미작업';
        return '수주';
    }
    return c || w || '';
};

// ── 월간보고 엑셀 '금월' 시트 파서 (순수 함수 — 시뮬 검증용 export) ──────────
//   열: A실행No B실행번호 C견적번호 D진행현황 E공장 F프로젝트명 G내용 H Point I~M 5개%
//       N시작 O종료 Q자재% R투자심의 S L1 T L2 U발주처 · AA~AM 월0~12 자체시운전 수량 · AN~AZ 월0~12 전체공정률
//       BC 업무/ISSUE · BE 비고  (P공증률·V누적·W~Z전월금월·BB잔여는 수식 → 웹이 같은 규칙으로 재계산)
export const parseMonthlyReportSheet = (ws) => {
    const cv = (r, c) => { const cell = ws[colL(c) + r]; return cell && cell.v !== undefined ? cell.v : null; };
    const asText = (v) => {
        if (v === null || v === undefined) return '';
        if (v instanceof Date) { return `${String(v.getFullYear()).slice(2)}/${String(v.getMonth() + 1).padStart(2, '0')}/${String(v.getDate()).padStart(2, '0')}`; }
        return String(v).trim();
    };
    const asNum = (v) => { const n = parseFloat(String(v ?? '').replace(/[%,\s]/g, '')); return Number.isFinite(n) ? n : null; };
    // 엑셀 % 칸은 소수(0.89=89%) 저장 — 1.5 이하는 소수로 보고 ×100, 그보다 크면 이미 % 숫자로 본다
    const asPct = (v) => { const n = asNum(v); if (n === null) return null; return n <= 1.5 ? Math.round(n * 1000) / 10 : Math.round(n * 10) / 10; };
    const baseMonth = asNum(cv(2, 4));   // D2 = 엑셀 기준월
    const rows = [];
    for (let r = 5; r <= 400; r++) {
        if (asText(cv(r, 1)) === '출장일정') break;   // 프로젝트 블록 아래 '출장일정' 표부터는 데이터 아님
        const name = asText(cv(r, 6));
        if (!name) continue;
        // 잡행 제외: 실행번호·견적번호·상태·Point 전부 빈 행(메모 줄)은 데이터 아님
        if (!asText(cv(r, 2)) && !asText(cv(r, 3)) && !asText(cv(r, 4)) && asNum(cv(r, 8)) === null) continue;
        const qty = [], pct = [];
        for (let i = 0; i <= 12; i++) { qty.push(asNum(cv(r, 27 + i))); pct.push(asPct(cv(r, 40 + i))); }
        rows.push({
            no: asText(cv(r, 1)), exec: asText(cv(r, 2)), quote: asText(cv(r, 3)), status: asText(cv(r, 4)),
            plant: asText(cv(r, 5)), name, desc: asText(cv(r, 7)), point: asNum(cv(r, 8)),
            plc: asPct(cv(r, 9)), etos: asPct(cv(r, 10)), hmi: asPct(cv(r, 11)), self: asPct(cv(r, 12)), integ: asPct(cv(r, 13)),
            start: asText(cv(r, 14)), end: asText(cv(r, 15)),
            mat: asPct(cv(r, 17)), invest: asText(cv(r, 18)), l1: asText(cv(r, 19)), l2: asText(cv(r, 20)), client: asText(cv(r, 21)),
            qty, pct, issue: asText(cv(r, 55)), note: asText(cv(r, 57)),
        });
    }
    return { baseMonth, rows };
};

// 월0(이월)~m월까지 합 — 값이 하나도 없으면 null (0으로 오인 금지)
const sumTo = (arr, m) => {
    if (!arr) return null;
    let s = null;
    for (let i = 0; i <= m && i < arr.length; i++) { const v = arr[i]; if (v !== null && v !== undefined) s = (s || 0) + v; }
    return s;
};

// 틀고정 열(왼쪽부터 순서대로 — 고정폭이라 sticky 오프셋이 항상 정확)
const FROZEN = [
    { k: 'no', w: 46 }, { k: 'exec', w: 86 }, { k: 'quote', w: 98 }, { k: 'status', w: 100 }, { k: 'plant', w: 62 }, { k: 'name', w: 250 },
];
const FROZEN_LEFT = FROZEN.reduce((acc, c, i) => { acc.push(i === 0 ? 0 : acc[i - 1] + FROZEN[i - 1].w); return acc; }, []);
const FROZEN_KEYS = FROZEN.map(c => c.k);

const COLS = [
    { h: '순번', k: 'no' }, { h: '실행번호', k: 'exec' }, { h: '견적번호', k: 'quote' }, { h: '진행현황', k: 'status' },
    { h: '공장', k: 'plant' }, { h: '공사명', k: 'name' }, { h: '내용', k: 'desc' }, { h: 'Point', k: 'point', n: 1 },
    { h: 'PLC', k: 'plc', n: 1, pct: 1 }, { h: 'ETOS', k: 'etos', n: 1, pct: 1 }, { h: 'HMI', k: 'hmi', n: 1, pct: 1 },
    { h: '자체', k: 'self', n: 1, pct: 1 }, { h: '통합', k: 'integ', n: 1, pct: 1 },
    { h: '공증률', k: 'avg', n: 1, pct: 1 }, { h: '자재%', k: 'mat', n: 1, pct: 1 },
    { h: '투자심의', k: 'invest' }, { h: 'L1', k: 'l1' }, { h: 'L2', k: 'l2' },
    { h: '시작일', k: 'start' }, { h: '종료일', k: 'end' }, { h: '발주처', k: 'client' },
    { h: '누적', k: 'acc', n: 1 }, { h: '시운전 전월', k: 'qPrev', n: 1 }, { h: '시운전 금월', k: 'qCur', n: 1 },
    { h: '공정률 전월', k: 'pPrev', n: 1, pct: 1 }, { h: '공정률 금월', k: 'pCur', n: 1, pct: 1 },
    { h: '잔여', k: 'remain', n: 1 }, { h: '증감', k: 'delta' }, { h: '업무/ISSUE', k: 'issue' }, { h: '비고', k: 'note' },
];

const chipStyleOf = (st) => {
    const s = String(st || '');
    const bad = s === '보류' || s === '패찰' || s.startsWith('DROP') || s === '취소';
    const done = s.includes('완료');
    const run = s === '진행중' || s === '진행' || s === '수주';
    return {
        bg: done ? '#d9f3e1' : run ? '#e3effa' : bad ? '#fde8e8' : '#f3f1ee',
        cl: done ? '#116329' : run ? '#0f5a99' : bad ? '#b91c1c' : '#55524d',
    };
};

// ── 팀 월별 추이 그래프: 막대=그 달 시운전 실적 합 · 선=그 달 평균 공정률 (막대 클릭=기준월 이동) ──
function TeamTrend({ recs, month, onPick }) {
    const sums = [], avgs = [];
    for (let m = 1; m <= 12; m++) {
        let s = 0; const ps = [];
        recs.forEach(r => {
            const v = r._qty ? r._qty[m] : null; if (v !== null && v !== undefined) s += v;
            const p = r._pct ? r._pct[m] : null; if (p !== null && p !== undefined) ps.push(p);
        });
        sums.push(s);
        avgs.push(ps.length ? Math.round(ps.reduce((a, b) => a + b, 0) / ps.length * 10) / 10 : null);
    }
    const maxS = Math.max(...sums, 1);
    const W = 960, H = 190, padL = 16, padR = 16, top = 26, base = 150;
    const slot = (W - padL - padR) / 12, barW = Math.min(46, slot * 0.62);
    const yQ = (v) => base - (v / maxS) * (base - top);
    const yP = (v) => base - (v / 100) * (base - top);
    const linePts = avgs.map((v, i) => v === null ? null : `${padL + slot * i + slot / 2},${yP(v)}`).filter(Boolean).join(' ');
    return (
        <div style={{ background: '#fff', border: '1px solid #e5e3df', borderRadius: 12, padding: '10px 14px 4px', marginBottom: 10, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 11.5, color: '#73716b', marginBottom: 2 }}>
                <b style={{ fontSize: 12.5, color: '#37352f' }}>월별 추이 (표시 중인 {recs.length}건 기준)</b>
                <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#8ec3ec', borderRadius: 2, marginRight: 4 }}/>시운전 실적(그 달 합)</span>
                <span><span style={{ display: 'inline-block', width: 14, height: 3, background: '#16a34a', borderRadius: 2, marginRight: 4, verticalAlign: 'middle' }}/>평균 공정률(%)</span>
                <span style={{ color: '#a4a097' }}>막대를 누르면 그 달로 이동합니다</span>
            </div>
            <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: 1100, display: 'block' }}>
                {Array.from({ length: 12 }, (_, i) => {
                    const m = i + 1, x = padL + slot * i + (slot - barW) / 2, h = Math.max(2, base - yQ(sums[i]));
                    const sel = m === month;
                    return (
                        <g key={m} style={{ cursor: 'pointer' }} onClick={() => onPick(m)}>
                            <rect x={padL + slot * i} y={top - 12} width={slot} height={base - top + 30} fill={sel ? 'rgba(30,122,200,0.07)' : 'transparent'} rx={6}/>
                            <rect x={x} y={base - h} width={barW} height={h} rx={4} fill={sel ? '#1e7ac8' : '#8ec3ec'}/>
                            {sums[i] > 0 && <text x={x + barW / 2} y={base - h - 5} textAnchor="middle" fontSize="10.5" fontWeight="700" fill={sel ? '#0f5a99' : '#73716b'}>{sums[i].toLocaleString()}</text>}
                            <text x={padL + slot * i + slot / 2} y={base + 18} textAnchor="middle" fontSize="11.5" fontWeight={sel ? 800 : 600} fill={sel ? '#0f5a99' : '#8f8b84'}>{m}월</text>
                        </g>
                    );
                })}
                {linePts && <polyline points={linePts} fill="none" stroke="#16a34a" strokeWidth="2.2" strokeLinejoin="round"/>}
                {avgs.map((v, i) => v === null ? null : (
                    <g key={'p' + i}>
                        <circle cx={padL + slot * i + slot / 2} cy={yP(v)} r="3.4" fill="#16a34a"/>
                        <text x={padL + slot * i + slot / 2} y={yP(v) - 7} textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#15803d">{v}%</text>
                    </g>
                ))}
            </svg>
        </div>
    );
}

// ── 행 클릭 = 프로젝트 보고 팝업 (2026-08-13 팀장님: 임원 보고 관점 — 전월→금월 진행률·남은 작업) ──
function RowDetail({ rec, month, onClose }) {
    const chip = chipStyleOf(rec.status);
    const hasMatrix = (rec._qty && rec._qty.some(v => v !== null)) || (rec._pct && rec._pct.some(v => v !== null));
    const maxQ = hasMatrix ? Math.max(...(rec._qty || []).map(v => v || 0), 1) : 1;
    const fmtv = (v, sfx) => (v === null || v === undefined ? '—' : `${v}${sfx || ''}`);
    // 남은 작업: 잔여 포인트 + 100% 미만 항목 목록
    const items = [['PLC', rec.plc], ['ETOS', rec.etos], ['HMI', rec.hmi], ['자체 시운전', rec.self], ['통합 시운전', rec.integ]];
    const known = items.filter(([, v]) => v !== null && v !== undefined);
    const remainItems = known.filter(([, v]) => v < 100);
    const pctBar = rec.point ? Math.max(0, Math.min(100, Math.round((rec.acc || 0) / rec.point * 100))) : null;
    const box = { background: '#faf9f7', border: '1px solid #efedeb', borderRadius: 10, padding: '8px 12px' };
    const lbl = { fontSize: 10.5, fontWeight: 700, color: '#8f8b84' };
    const cell = { padding: '6px 8px', fontSize: 12, borderBottom: '1px solid #efedeb', borderRight: '1px solid #f3f1ee', textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };
    return (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(30,30,28,0.45)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: '18px 20px', maxWidth: 940, width: '100%', maxHeight: '86vh', overflow: 'auto', boxShadow: '0 18px 50px rgba(0,0,0,0.25)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <h3 style={{ fontSize: 15.5, fontWeight: 800, color: '#37352f', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rec.name}</h3>
                    <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 9px', borderRadius: 999, background: chip.bg, color: chip.cl }}>{rec.status || '—'}</span>
                    <button onClick={onClose} style={{ border: 'none', background: '#f3f1ee', borderRadius: 8, padding: 6, cursor: 'pointer', display: 'flex' }}><X size={15}/></button>
                </div>
                <div style={{ fontSize: 11.5, color: '#8f8b84', marginBottom: 12 }}>
                    {[rec.exec && `실행번호 ${rec.exec}`, rec.quote && `견적번호 ${rec.quote}`, rec.client && `발주처 ${rec.client}`, (rec.start || rec.end) && `기간 ${rec.start || '?'} ~ ${rec.end || '?'}`].filter(Boolean).join(' · ') || '기본 정보 없음'}
                </div>
                {/* 보고 핵심 4칸: 전월 → 금월 → 시운전 실적 → 남은 작업 */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 8 }}>
                    <div style={box}>
                        <div style={lbl}>공정률 전월 ({month > 1 ? `${month - 1}월` : '이월'})</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: '#73716b', fontVariantNumeric: 'tabular-nums' }}>{fmtv(rec.pPrev, '%')}</div>
                    </div>
                    <div style={{ ...box, background: '#f4f9fe', borderColor: '#cfe4f7' }}>
                        <div style={lbl}>공정률 금월 ({month}월)</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: '#1e5f9e', fontVariantNumeric: 'tabular-nums' }}>
                            {fmtv(rec.pCur, '%')}
                            {rec.delta !== null && <span style={{ fontSize: 12.5, fontWeight: 800, marginLeft: 6, color: rec.delta > 0 ? '#116329' : rec.delta < 0 ? '#b91c1c' : '#73716b' }}>{rec.delta > 0 ? `▲${rec.delta}` : rec.delta < 0 ? `▼${Math.abs(rec.delta)}` : '±0'}</span>}
                        </div>
                    </div>
                    <div style={box}>
                        <div style={lbl}>시운전 실적 (전월 → 금월)</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: '#37352f', fontVariantNumeric: 'tabular-nums' }}>
                            {fmtv(rec.qPrev)} <span style={{ fontSize: 13, color: '#a4a097', fontWeight: 700 }}>→</span> {fmtv(rec.qCur)}
                        </div>
                    </div>
                    <div style={box}>
                        <div style={lbl}>남은 작업 (포인트 잔여)</div>
                        <div style={{ fontSize: 22, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: rec.remain === null ? '#a4a097' : rec.remain > 0 ? '#b45309' : '#116329' }}>{fmtv(rec.remain)}</div>
                        {pctBar !== null && (
                            <div style={{ marginTop: 4 }}>
                                <div style={{ height: 5, background: '#edeae6', borderRadius: 3 }}>
                                    <div style={{ height: 5, width: `${pctBar}%`, background: pctBar >= 100 ? '#059669' : '#1e7ac8', borderRadius: 3 }}/>
                                </div>
                                <div style={{ fontSize: 10, color: '#a4a097', marginTop: 2 }}>누적 {fmtv(rec.acc)} / 총점 {fmtv(rec.point)} ({pctBar}%)</div>
                            </div>
                        )}
                    </div>
                </div>
                {/* 남은 작업 항목 (100% 미만) + 내용/ISSUE */}
                <div style={{ ...box, marginBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11.5, fontWeight: 800, color: '#55524d' }}>남은 작업</span>
                        {known.length === 0 ? (
                            <span style={{ fontSize: 11.5, color: '#a4a097' }}>진행% 항목 값 없음</span>
                        ) : remainItems.length === 0 ? (
                            <span style={{ fontSize: 11.5, fontWeight: 800, color: '#116329', background: '#d9f3e1', borderRadius: 999, padding: '2px 9px' }}>전 항목 100% 완료</span>
                        ) : remainItems.map(([l, v]) => (
                            <span key={l} style={{ fontSize: 11.5, fontWeight: 700, color: '#9a3412', background: '#ffedd5', border: '1px solid #fed7aa', borderRadius: 999, padding: '2px 9px' }}>
                                {l} {v}% <span style={{ fontWeight: 800 }}>({Math.round((100 - v) * 10) / 10}% 남음)</span>
                            </span>
                        ))}
                    </div>
                    {(rec.desc || rec.issue || rec.note) && (
                        <div style={{ fontSize: 11.5, color: '#73716b', marginTop: 6 }}>
                            {[rec.desc && `내용: ${rec.desc}`, rec.issue && `업무/ISSUE: ${rec.issue}`, rec.note && `비고: ${rec.note}`].filter(Boolean).join(' · ')}
                        </div>
                    )}
                </div>
                {hasMatrix ? (
                    <div style={{ overflow: 'auto', border: '1px solid #e5e3df', borderRadius: 10 }}>
                        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                            <thead><tr>
                                <th style={{ ...cell, textAlign: 'left', background: '#f3f6fa', fontWeight: 800, color: '#5a6b7f' }}>월</th>
                                {Array.from({ length: 13 }, (_, m) => <th key={m} style={{ ...cell, background: '#f3f6fa', fontWeight: 800, color: '#5a6b7f' }}>{m === 0 ? '이월' : m + '월'}</th>)}
                            </tr></thead>
                            <tbody>
                                <tr>
                                    <td style={{ ...cell, textAlign: 'left', fontWeight: 700 }}>시운전 수량</td>
                                    {Array.from({ length: 13 }, (_, m) => {
                                        const v = rec._qty ? rec._qty[m] : null;
                                        return (
                                            <td key={m} style={cell}>
                                                {v === null || v === undefined ? <span style={{ color: '#c9c5be' }}>—</span> : (
                                                    <div>
                                                        <div style={{ fontWeight: 700 }}>{v.toLocaleString()}</div>
                                                        <div style={{ height: 4, background: '#eef2f7', borderRadius: 2, marginTop: 2 }}>
                                                            <div style={{ height: 4, width: `${Math.min(100, v / maxQ * 100)}%`, background: '#1e7ac8', borderRadius: 2 }}/>
                                                        </div>
                                                    </div>
                                                )}
                                            </td>
                                        );
                                    })}
                                </tr>
                                <tr>
                                    <td style={{ ...cell, textAlign: 'left', fontWeight: 700 }}>전체 공정률</td>
                                    {Array.from({ length: 13 }, (_, m) => {
                                        const v = rec._pct ? rec._pct[m] : null;
                                        return <td key={m} style={{ ...cell, fontWeight: 700, color: v === null || v === undefined ? '#c9c5be' : '#15803d' }}>{v === null || v === undefined ? '—' : v + '%'}</td>;
                                    })}
                                </tr>
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div style={{ fontSize: 12, color: '#8f8b84', background: '#faf9f7', border: '1px dashed #dcd8d2', borderRadius: 10, padding: '14px 16px' }}>
                        이 프로젝트는 아직 월별 실적 칸이 비어 있습니다 (엑셀 월별 매트릭스 빈칸 — 앞으로 [월간 마감]이 쌓이면 채워집니다).
                    </div>
                )}
            </div>
        </div>
    );
}

export default function Tech1MonthlyScreen({ currentTeam, user, onBack, onGoToList }) {
    const now = new Date();
    const YEAR = now.getFullYear();
    const curMonth = now.getMonth() + 1;
    const ymOf = (m) => (m >= 1 && m <= 12 ? `${YEAR}-${String(m).padStart(2, '0')}` : null);

    const [rows, setRows] = useState([]);            // List 실시간
    const [loaded, setLoaded] = useState(false);
    const [excelDoc, setExcelDoc] = useState(null);  // 업로드된 월간보고 엑셀 원본 (연도 문서)
    const [excelLoaded, setExcelLoaded] = useState(false);
    const [snaps, setSnaps] = useState({});          // {ym: 마감본|null}
    const [month, setMonth] = useState(curMonth);    // 기준월 (엑셀 D2 역할)
    const [sort, setSort] = useState(null);          // {k, dir}
    const [statusFilter, setStatusFilter] = useState(null);   // 상태 칩 (null=전체)
    const [query, setQuery] = useState('');          // 검색
    const [trendOpen, setTrendOpen] = useState(false);
    const [detail, setDetail] = useState(null);      // 행 클릭 상세
    const fileRef = useRef(null);

    useEffect(() => {
        setSnaps({}); setStatusFilter(null); setQuery('');
        const unsub1 = onSnapshot(rowsColRef(currentTeam), snap => {
            const r = snap.docs.map(d => ({ _id: d.id, ...d.data() }))
                .sort((a, b) => String(a._id).localeCompare(String(b._id)));
            setRows(r); setLoaded(true);
        }, () => setLoaded(true));
        const unsub2 = onSnapshot(monthlyReportDocRef(currentTeam, YEAR), s => {
            setExcelDoc(s.exists() ? s.data() : null); setExcelLoaded(true);
        }, () => setExcelLoaded(true));
        return () => { unsub1(); unsub2(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentTeam]);

    // 기준월이 바뀌면 그 달·전달의 [월간 마감] 스냅샷을 확보 (한 번 읽으면 캐시)
    useEffect(() => {
        [month, month - 1].forEach(m => {
            const ym = ymOf(m);
            if (!ym || snaps[ym] !== undefined) return;
            getDoc(snapshotDocRef(currentTeam, ym))
                .then(s => setSnaps(p => ({ ...p, [ym]: s.exists() ? s.data() : null })))
                .catch(() => setSnaps(p => ({ ...p, [ym]: null })));
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentTeam, month, snaps]);

    const mains = useMemo(() => rows.filter(r => !isSubRow(r)), [rows]);
    const headers = useMemo(() => { const s = {}; mains.forEach(r => Object.keys(r).forEach(k => { s[k] = 1; })); return Object.keys(s); }, [mains]);
    const col = (key) => headers.find(h => norm(h) === norm(key));
    const val = (r, key) => { const h = col(key); return h ? (r[h] ?? '') : ''; };

    // ── 표시 행 만들기: 엑셀 원본 + List 연동(견적번호 매칭) + List에만 있는 행 추가 ──
    const display = useMemo(() => {
        const isCur = month === curMonth;
        const snapCur = snaps[ymOf(month)] || null;
        const snapPrev = snaps[ymOf(month - 1)] || null;
        const snapRowOf = (sd, lr) => sd?.rows?.[lr._pid || lr._id] || null;
        // ★매칭 키 = 견적번호(엑셀) ↔ 견적코드(List). 수행번호는 상단(실행 승격)·하단(견적 이력)에 같은 26-XX가
        //   서로 다른 프로젝트로 중복돼 못 쓴다 (2026-08-13 실측: 99행 26-01=Infra vs 160행 26-01=용인).
        const listByQuote = {};
        mains.forEach(r => { const k = norm(val(r, '견적코드')).toUpperCase(); if (k) listByQuote[k] = r; });
        const used = new Set();

        const build = (er, lr, idx) => {
            const q = er ? er.qty : null, pA = er ? er.pct : null;
            const rec = {
                key: er ? 'x' + idx : 'l' + lr._id,
                fromList: !!lr,
                _qty: q, _pct: pA,   // 그래프·상세 팝업용 (표에는 안 그림)
                no: (er && er.no) || (lr ? String(val(lr, '수행번호') || '') : ''),
                exec: (er && er.exec) || '',
                quote: (er && er.quote) || (lr ? String(val(lr, '견적코드') || '') : ''),
                status: (er && er.status) || '',
                plant: (er && er.plant) || (lr ? String(val(lr, '공장명') || '') : ''),
                name: (er && er.name) || (lr ? String(val(lr, '공사명') || '') : ''),
                desc: (er && er.desc) || '',
                point: er ? er.point : (lr ? num(val(lr, '총물량')) : null),
                plc: er ? er.plc : null, etos: er ? er.etos : null, hmi: er ? er.hmi : null,
                self: er ? er.self : null, integ: er ? er.integ : null,
                start: (er && er.start) || (lr ? String(val(lr, '시작') || '') : ''),
                end: (er && er.end) || (lr ? String(val(lr, '종료') || '') : ''),
                mat: er ? er.mat : null,
                invest: (er && er.invest) || '', l1: (er && er.l1) || '', l2: (er && er.l2) || '',
                client: (er && er.client) || (lr ? String(val(lr, '업체명') || '') : ''),
                acc: sumTo(q, 12),   // 엑셀 V와 동일 = 매트릭스 전체 합 (기준월과 무관 — 엑셀 충실)
                qPrev: q ? (q[month - 1] ?? null) : null,
                qCur: q ? (q[month] ?? null) : null,
                pPrev: pA ? (pA[month - 1] ?? null) : null,
                pCur: pA ? (pA[month] ?? null) : null,
                issue: (er && er.issue) || '',
                note: (er && er.note) || (lr ? String(val(lr, '비고 [ISSUE]') || '') : ''),
            };
            if (lr) {
                const sPrev = snapRowOf(snapPrev, lr);
                const prevAcc = sPrev ? num(sPrev['누적']) : sumTo(q, month - 1);
                const applyLive = (get) => {
                    rec.plc = num(get('PLC')); rec.etos = num(get('ETOS T/S')); rec.hmi = num(get('HMI'));
                    rec.self = num(get('자체 시운전')); rec.integ = num(get('통합 시운전'));
                    const tot = num(get('총물량')); if (tot !== null) rec.point = tot;
                    const acc = num(get('누적'));
                    if (acc !== null) { rec.acc = acc; rec.qCur = prevAcc !== null ? Math.round((acc - prevAcc) * 10) / 10 : null; }
                    const pAll = num(get('전체') !== '' && get('전체') !== undefined ? get('전체') : get('공정률전체'));
                    if (pAll !== null) rec.pCur = pAll;
                };
                if (isCur) {
                    applyLive((k) => val(lr, k));
                    rec.status = reportStatus(val(lr, '계약'), val(lr, '작업'));
                    if (norm(String(val(lr, '납품'))).toUpperCase() === 'O') rec.mat = 100;
                } else {
                    const sCur = snapRowOf(snapCur, lr);
                    if (sCur) {
                        applyLive((k) => (k === '전체' ? undefined : sCur[k]));
                        const st = reportStatus(sCur['계약'], sCur['작업']); if (st) rec.status = st;
                        if (norm(String(sCur['납품'] || '')).toUpperCase() === 'O') rec.mat = 100;
                    }
                }
                if (sPrev) { const pv = num(sPrev['공정률전체']); if (pv !== null) rec.pPrev = pv; }
            }
            const vs = [rec.plc, rec.etos, rec.hmi, rec.self, rec.integ].filter(v => v !== null && v !== undefined);
            rec.avg = vs.length ? Math.round(vs.reduce((a, b) => a + b, 0) / vs.length * 10) / 10 : null;
            rec.remain = rec.point !== null ? Math.round((rec.point - (rec.acc || 0)) * 10) / 10 : null;   // 엑셀 BB 규칙: 누적 없으면 0으로 간주
            rec.delta = (rec.pCur !== null && rec.pPrev !== null) ? Math.round((rec.pCur - rec.pPrev) * 10) / 10 : null;
            return rec;
        };

        const excelRows = excelDoc?.rows || [];
        const out = excelRows.map((er, i) => {
            const k = norm(er.quote).toUpperCase();
            // 같은 견적번호가 두 줄(실행 승격 시 상단+하단)이면 먼저 나오는 상단(실행) 행만 List와 연동
            const cand = k ? listByQuote[k] : null;
            const lr = (cand && !used.has(cand._id)) ? cand : null;
            if (lr) used.add(lr._id);
            return build(er, lr, i);
        });
        // List에만 있는 행 — 월간보고에서 빠지면 안 됨 (List = 뼈대 원칙)
        mains.forEach(r => { if (!used.has(r._id)) out.push(build(null, r, 0)); });
        return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [excelDoc, mains, month, snaps]);

    // ── 상태 칩(건수) · 검색 · 정렬 ──
    const statusCounts = useMemo(() => {
        const m = {};
        display.forEach(r => { const s = r.status || '(없음)'; m[s] = (m[s] || 0) + 1; });
        return Object.entries(m).sort((a, b) => b[1] - a[1]);
    }, [display]);

    const filtered = useMemo(() => {
        const qq = norm(query).toLowerCase();
        let out = display;
        if (statusFilter) out = out.filter(r => (r.status || '(없음)') === statusFilter);
        if (qq) out = out.filter(r => ['name', 'quote', 'exec', 'no', 'client', 'plant', 'desc', 'issue', 'note'].some(k => norm(r[k]).toLowerCase().includes(qq)));
        return out;
    }, [display, statusFilter, query]);

    const sorted = useMemo(() => {
        if (!sort) return filtered;
        const d = sort.dir === 'asc' ? 1 : -1;
        return [...filtered].sort((a, b) => {
            const av = a[sort.k], bv = b[sort.k];
            const an = typeof av === 'number' ? av : num(av);
            const bn = typeof bv === 'number' ? bv : num(bv);
            if (an !== null && bn !== null) return (an - bn) * d;
            if (an !== null) return -d;
            if (bn !== null) return d;
            return String(av ?? '').localeCompare(String(bv ?? ''), 'ko') * d;
        });
    }, [filtered, sort]);

    // ── KPI 집계 (표시 중 행 기준 — 칩·검색과 같은 모수) ──
    const kpi = useMemo(() => {
        const rs = filtered;
        const avgVals = rs.map(r => r.avg).filter(v => v !== null);
        const totPt = rs.reduce((s, r) => s + (r.point || 0), 0);
        const totAcc = rs.reduce((s, r) => s + (r.acc || 0), 0);
        return {
            n: rs.length, all: display.length,
            avgPct: avgVals.length ? Math.round(avgVals.reduce((a, b) => a + b, 0) / avgVals.length * 10) / 10 : null,
            avgN: avgVals.length,
            totPt, totAcc,
            ptPct: totPt ? Math.round(totAcc / totPt * 1000) / 10 : null,
            monQ: rs.reduce((s, r) => s + (r.qCur || 0), 0),
            up: rs.filter(r => r.delta !== null && r.delta > 0).length,
            down: rs.filter(r => r.delta !== null && r.delta < 0).length,
        };
    }, [filtered, display]);

    // ── 엑셀 업로드 (금월 시트 → 웹 원본 저장, 전 사용자 실시간 공유) ──
    const handleUpload = async (e) => {
        const f = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!f) return;
        try {
            const XLSX = await loadXLSX();
            const wb = XLSX.read(await f.arrayBuffer(), { cellDates: true });
            const ws = wb.Sheets['금월'];
            if (!ws) { window.alert("'금월' 시트가 없습니다.\n월간보고 엑셀 파일이 맞는지 확인해 주세요."); return; }
            const { baseMonth, rows: parsed } = parseMonthlyReportSheet(ws);
            if (!parsed.length) { window.alert('읽을 수 있는 행이 없습니다.'); return; }
            const already = excelDoc ? `\n(기존 원본 ${excelDoc.count}행을 교체합니다 — ${String(excelDoc.savedAt || '').slice(0, 10)} 업로드분)` : '';
            if (!window.confirm(`[월간보고 엑셀 업로드]\n\n파일: ${f.name}\n읽은 행: ${parsed.length}건 · 엑셀 기준월: ${baseMonth ?? '?'}월${already}\n\n웹 월간보고 원본을 이 파일 내용으로 저장할까요?`)) return;
            await setDoc(monthlyReportDocRef(currentTeam, YEAR), {
                year: String(YEAR), savedAt: new Date().toISOString(), savedBy: (user && user.email) || '',
                baseMonth: baseMonth ?? null, count: parsed.length, fileName: f.name, rows: parsed,
            });
            logAudit(currentTeam, { who: (user && user.email) || '', action: AUDIT_ACTIONS.EDIT, projectName: '(월간보고 엑셀 업로드)', note: `${f.name} · ${parsed.length}행 저장` });
            window.alert(`업로드 완료!\n\n${parsed.length}행이 저장되었습니다.\n기준월을 바꿔 2026년 아무 달이나 조회할 수 있습니다.`);
        } catch (err) { window.alert('업로드 실패: ' + err.message); }
    };

    // ── 엑셀 생성 (지금 보이는 표 그대로 내려받기) ──
    const handleDownload = async () => {
        try {
            const XLSX = await loadXLSX();
            const aoa = [COLS.map(c => c.h)];
            sorted.forEach(rec => aoa.push(COLS.map(c => {
                const v = rec[c.k];
                return v === null || v === undefined ? '' : v;
            })));
            const ws = XLSX.utils.aoa_to_sheet(aoa);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, `${month}월`);
            const d = new Date();
            XLSX.writeFile(wb, `월간보고_웹_${currentTeam}_${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.xlsx`);
        } catch (err) { window.alert('엑셀 생성 실패: ' + err.message); }
    };

    const fmt = (v, suffix) => (v === null || v === undefined || v === '' ? '—' : `${v}${suffix || ''}`);
    const chip = (st) => {
        const c = chipStyleOf(st);
        return <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: c.bg, color: c.cl }}>{st || '—'}</span>;
    };

    const thS = { padding: '7px 8px', fontSize: 11, fontWeight: 800, color: '#5a6b7f', background: '#f3f6fa', borderBottom: '1px solid #d8d4cf', borderRight: '1px solid #eaeef4', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none', position: 'sticky', top: 0, zIndex: 30 };
    const tdS = { padding: '7px 8px', fontSize: 12.5, color: '#37352f', borderBottom: '1px solid #efedeb', borderRight: '1px solid #efedeb', whiteSpace: 'nowrap', background: '#fff' };
    const tdN = { ...tdS, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
    const btnS = { display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 700, background: '#fff', border: '1px solid #dcd8d2', borderRadius: 8, padding: '7px 12px', cursor: 'pointer' };

    // 틀고정 스타일 (헤더=상단+좌측 이중 고정)
    const frozenIdx = (i) => (i < FROZEN.length ? i : -1);
    const frozenTh = (i) => (frozenIdx(i) < 0 ? {} : { position: 'sticky', left: FROZEN_LEFT[i], zIndex: 40, minWidth: FROZEN[i].w, maxWidth: FROZEN[i].w, width: FROZEN[i].w, boxShadow: i === FROZEN.length - 1 ? '2px 0 4px rgba(55,53,47,0.06)' : undefined });
    const frozenTd = (i) => (frozenIdx(i) < 0 ? {} : { position: 'sticky', left: FROZEN_LEFT[i], zIndex: 20, minWidth: FROZEN[i].w, maxWidth: FROZEN[i].w, width: FROZEN[i].w, boxShadow: i === FROZEN.length - 1 ? '2px 0 4px rgba(55,53,47,0.06)' : undefined });
    const clampDiv = (w, children, title) => (
        <div title={title} style={{ width: w - 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{children}</div>
    );

    const ready = loaded && excelLoaded;
    const isCur = month === curMonth;

    return (
        <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#f4f3f1', fontFamily: "'Pretendard Variable', Pretendard, 'Malgun Gothic', system-ui, sans-serif", padding: '12px 18px' }}>
            {/* 헤더 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8, flexShrink: 0 }}>
                <button onClick={onBack} style={{ ...btnS, color: '#73716b' }}><ChevronLeft size={15}/> 홈</button>
                <div style={{ padding: 8, background: '#1e7ac8', borderRadius: 12, color: '#fff', display: 'flex' }}><FileText size={18}/></div>
                <h1 style={{ fontSize: 16, fontWeight: 800, color: '#37352f' }}>{currentTeam} 월간보고</h1>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: '#55524d' }}>{YEAR}년</span>
                <select value={month} onChange={e => setMonth(Number(e.target.value))}
                    style={{ fontSize: 13, fontWeight: 800, color: '#0f5a99', background: '#e3effa', border: '1px solid #cfe4f7', borderRadius: 8, padding: '5px 8px', cursor: 'pointer' }}>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                        <option key={m} value={m}>{m}월{m === curMonth ? ' (이번 달)' : ''}</option>
                    ))}
                </select>
                <span style={{ fontSize: 11.5, color: '#8f8b84' }}>기준월을 바꾸면 그 달의 전월/금월/증감으로 재계산 (엑셀 기준월 칸과 같은 역할)</span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                    <button onClick={() => fileRef.current && fileRef.current.click()} style={{ ...btnS, color: '#116329', borderColor: '#bfe3cb' }}>
                        <Upload size={14}/> 엑셀 업로드
                    </button>
                    <button onClick={handleDownload} disabled={!sorted.length} style={{ ...btnS, color: '#4338ca', borderColor: '#c7d2fe', opacity: sorted.length ? 1 : 0.4 }}>
                        <Download size={14}/> 엑셀 생성
                    </button>
                    <button onClick={onGoToList} style={{ ...btnS, color: '#1e7ac8', borderColor: '#bcd9f2' }}>
                        <ListChecks size={14}/> 프로젝트 List로
                    </button>
                </div>
                <input ref={fileRef} type="file" accept=".xlsx,.xlsm,.xls" style={{ display: 'none' }} onChange={handleUpload}/>
            </div>

            {/* 원본 상태 줄 */}
            <div style={{ fontSize: 11.5, color: '#8f8b84', marginBottom: 8, display: 'flex', gap: 12, flexWrap: 'wrap', flexShrink: 0 }}>
                {excelDoc ? (
                    <span>엑셀 원본: <b style={{ color: '#55524d' }}>{excelDoc.fileName || '(이름 없음)'}</b> · {String(excelDoc.savedAt || '').slice(0, 10)} 업로드 · {excelDoc.count}행 · 엑셀 기준월 {excelDoc.baseMonth ?? '?'}월</span>
                ) : (
                    <span style={{ color: '#b45309', fontWeight: 700 }}>아직 월간보고 엑셀이 업로드되지 않았습니다 — [엑셀 업로드]로 원본을 올리면 2026년 월별 조회가 열립니다 (지금은 List 실시간만 표시)</span>
                )}
                <span>{isCur
                    ? 'List 매칭 행의 금월 = 프로젝트 List 실시간'
                    : `과거 달 조회 중 — List 매칭 행은 그 달 [월간 마감]본${snaps[ymOf(month)] ? '' : ' (마감본 없음 → 엑셀 값)'}`}</span>
                <span>행을 클릭하면 그 프로젝트의 월별 실적이 열립니다</span>
            </div>

            {/* KPI 집계 카드 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10, marginBottom: 10, flexShrink: 0 }}>
                {[
                    { label: '프로젝트', big: `${kpi.n}건`, cap: statusFilter || query ? `전체 ${kpi.all}건 중 표시` : '전체 (엑셀 + List)' },
                    { label: '평균 공증률', big: kpi.avgPct === null ? '—' : `${kpi.avgPct}%`, cap: kpi.avgPct === null ? '값 있는 행 없음' : `값 있는 ${kpi.avgN}건 평균`, color: '#1e5f9e' },
                    { label: '포인트 (누적/총점)', big: kpi.totPt ? `${kpi.totAcc.toLocaleString()} / ${kpi.totPt.toLocaleString()}` : '—', cap: kpi.ptPct === null ? 'Point 값 없음' : `달성률 ${kpi.ptPct}%`, color: '#7c3aed' },
                    { label: `${month}월 실적`, big: `${kpi.monQ.toLocaleString()}pt`, cap: `공정률 상승 ▲${kpi.up}건 · 하락 ▼${kpi.down}건`, color: '#116329' },
                ].map((c, i) => (
                    <div key={i} style={{ background: '#fff', border: '1px solid #e5e3df', borderRadius: 12, padding: '10px 14px' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#8f8b84' }}>{c.label}</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: c.color || '#37352f', fontVariantNumeric: 'tabular-nums', lineHeight: 1.25 }}>{c.big}</div>
                        <div style={{ fontSize: 10.5, color: '#a4a097' }}>{c.cap}</div>
                    </div>
                ))}
            </div>

            {/* 상태 칩 + 검색 + 그래프 토글 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8, flexShrink: 0 }}>
                <button onClick={() => setStatusFilter(null)}
                    style={{ fontSize: 11.5, fontWeight: 800, padding: '4px 11px', borderRadius: 999, cursor: 'pointer', border: '1px solid', borderColor: !statusFilter ? '#1e7ac8' : '#dcd8d2', background: !statusFilter ? '#1e7ac8' : '#fff', color: !statusFilter ? '#fff' : '#73716b' }}>
                    전체 {display.length}
                </button>
                {statusCounts.map(([st, cnt]) => {
                    const c = chipStyleOf(st === '(없음)' ? '' : st);
                    const on = statusFilter === st;
                    return (
                        <button key={st} onClick={() => setStatusFilter(on ? null : st)}
                            style={{ fontSize: 11.5, fontWeight: 800, padding: '4px 11px', borderRadius: 999, cursor: 'pointer', border: '1px solid', borderColor: on ? c.cl : '#e5e3df', background: on ? c.cl : c.bg, color: on ? '#fff' : c.cl }}>
                            {st} {cnt}
                        </button>
                    );
                })}
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#fff', border: '1px solid #dcd8d2', borderRadius: 8, padding: '5px 10px' }}>
                        <Search size={13} color="#a4a097"/>
                        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="공사명·번호·발주처 검색"
                            style={{ border: 'none', outline: 'none', fontSize: 12, width: 170, background: 'transparent', color: '#37352f' }}/>
                        {query && <button onClick={() => setQuery('')} style={{ border: 'none', background: 'none', cursor: 'pointer', display: 'flex', padding: 0 }}><X size={13} color="#a4a097"/></button>}
                    </div>
                    <button onClick={() => setTrendOpen(o => !o)}
                        style={{ ...btnS, padding: '5px 11px', color: trendOpen ? '#fff' : '#0f5a99', background: trendOpen ? '#1e7ac8' : '#fff', borderColor: trendOpen ? '#1e7ac8' : '#bcd9f2' }}>
                        <BarChart3 size={14}/> 월별 추이
                    </button>
                </div>
            </div>

            {trendOpen && <TeamTrend recs={filtered} month={month} onPick={setMonth}/>}

            {/* 표 — 남는 화면 높이를 전부 사용(flex), 세로 스크롤은 표 안에서 (헤더 고정 + 좌측 틀고정) */}
            <div style={{ overflow: 'auto', flex: 1, minHeight: 200, background: '#fff', border: '1px solid #e5e3df', borderRadius: 12 }}>
                <table style={{ borderCollapse: 'separate', borderSpacing: 0, minWidth: '100%' }}>
                    <thead>
                        <tr>
                            {COLS.map((c, i) => (
                                <th key={i} style={{ ...thS, ...frozenTh(i) }} title="클릭하면 이 열로 정렬합니다"
                                    onClick={() => setSort(s => (s && s.k === c.k) ? (s.dir === 'asc' ? { k: c.k, dir: 'desc' } : null) : { k: c.k, dir: 'asc' })}>
                                    {c.h}{sort && sort.k === c.k ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {!ready ? (
                            <tr><td colSpan={COLS.length} style={{ ...tdS, textAlign: 'center', padding: '46px 0', color: '#8f8b84' }}>데이터를 불러오는 중입니다…</td></tr>
                        ) : !sorted.length ? (
                            <tr><td colSpan={COLS.length} style={{ ...tdS, textAlign: 'center', padding: '46px 0', color: '#8f8b84' }}>
                                {display.length ? '조건에 맞는 행이 없습니다 — 상태 칩/검색을 확인하세요.' : '표시할 데이터가 없습니다 — [엑셀 업로드] 또는 프로젝트 List 등록 후 이용하세요.'}
                            </td></tr>
                        ) : sorted.map(rec => (
                            <tr key={rec.key} onClick={() => setDetail(rec)} style={{ cursor: 'pointer' }} title="클릭 = 월별 실적 상세">
                                {COLS.map((c, i) => {
                                    const v = rec[c.k];
                                    const fz = frozenIdx(i) >= 0;
                                    if (c.k === 'status') return <td key={i} style={{ ...tdS, ...frozenTd(i) }}>{clampDiv(FROZEN[i].w, chip(v))}</td>;
                                    if (c.k === 'name') return (
                                        <td key={i} style={{ ...tdS, fontWeight: 700, ...frozenTd(i) }}>
                                            {clampDiv(FROZEN[i].w, (<>
                                                {fmt(v)}
                                                {rec.fromList && <span title="프로젝트 List와 연동 중 (견적번호 매칭)" style={{ marginLeft: 6, fontSize: 10, fontWeight: 800, color: '#0f5a99', background: '#e3effa', borderRadius: 999, padding: '1px 6px' }}>List</span>}
                                            </>), String(v || ''))}
                                        </td>
                                    );
                                    if (fz) return <td key={i} style={{ ...tdS, ...frozenTd(i) }}>{clampDiv(FROZEN[i].w, fmt(v), String(v || ''))}</td>;
                                    if (c.k === 'delta') return (
                                        <td key={i} style={{ ...tdN, fontWeight: 800, color: v === null ? '#a4a097' : v > 0 ? '#116329' : v < 0 ? '#b91c1c' : '#73716b' }}>
                                            {v === null ? '—' : v > 0 ? `▲${v}` : v < 0 ? `▼${Math.abs(v)}` : '0'}
                                        </td>
                                    );
                                    if (c.k === 'avg' || c.k === 'pCur') return <td key={i} style={{ ...tdN, fontWeight: 800, color: '#1e5f9e' }}>{fmt(v, '%')}</td>;
                                    if (c.n) return <td key={i} style={tdN}>{fmt(v, c.pct ? '%' : '')}</td>;
                                    return <td key={i} style={tdS}>{fmt(v)}</td>;
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <p style={{ fontSize: 11.5, color: '#8f8b84', margin: '8px 0 0', flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                title="열 제목 클릭 = 정렬(▲오름 → ▼내림 → 해제) · 행 클릭 = 월별 실적 상세 · 자동 계산: 공증률 = 5개 진행% 평균(빈칸 제외) · 누적 = 월별 매트릭스 전체 합(엑셀 V와 동일) · 잔여 = Point − 누적 · 증감 = 공정률 금월 − 전월 · 자재% = List 납품 O → 100%. List 매칭(견적번호=견적코드, 파란 List 표시) 행은 이번 달엔 List 실시간, 지난 달엔 그 달 [월간 마감]본을 보여줍니다.">
                열 제목 클릭 = 정렬 · 행 클릭 = 월별 실적 상세 · 공증률 = 5개 진행% 평균 · 누적 = 월별 매트릭스 전체 합(엑셀 V) · 잔여 = Point − 누적 ·
                증감 = 공정률 금월 − 전월 · 자재% = List 납품 O → 100% · List 표시 행 = 이번 달 List 실시간, 지난 달 [월간 마감]본 (전체 규칙은 마우스를 올리면 표시)
            </p>

            {detail && <RowDetail rec={detail} month={month} onClose={() => setDetail(null)}/>}
        </div>
    );
}
