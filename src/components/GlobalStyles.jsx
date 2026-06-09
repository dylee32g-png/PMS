import React from 'react';

const GlobalStyles = () => (
    <style>{`
        /* ── 스크롤바 (Excel 스타일) ── */
        .custom-scrollbar::-webkit-scrollbar { width: 14px; height: 14px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #f0f0f0; border: 1px solid #d8d8d8; border-radius: 0; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #b0b0b0; border-radius: 2px; border: 2px solid #f0f0f0; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #888888; }

        /* color-scheme을 light으로 (날짜 입력창 등) */
        .color-scheme-dark { color-scheme: light; }

        /* ── 애니메이션 ── */
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
        .animate-in { animation: fadeIn 0.15s ease-out forwards; }

        @keyframes growUp { from { height: 0%; opacity: 0; } to { opacity: 1; } }
        .animate-grow-up { animation: growUp 0.4s ease-out forwards; transform-origin: bottom; }

        /* ── 팀 카드 호버 (Excel 스타일) ── */
        @keyframes excel-border-pulse {
            0%   { box-shadow: 0 0 0 0 rgba(30,122,200,0.3); }
            70%  { box-shadow: 0 0 0 4px rgba(30,122,200,0); }
            100% { box-shadow: 0 0 0 0 rgba(30,122,200,0); }
        }
        .team-card:hover { animation: excel-border-pulse 1.5s infinite; border-color: #1e7ac8 !important; }

        /* ── sticky 고정 컬럼 (Excel 고정 창 스타일) ── */
        .sticky-col { position: sticky; z-index: 10; background-color: #edf1f7 !important; }
        th.sticky-col { z-index: 40; background-color: #d4dde8 !important; }
        tr:hover td.sticky-col { background-color: #d8e8fa !important; }
        .sticky-last { border-right: 2px solid #1e7ac8 !important; box-shadow: 4px 0 6px -2px rgba(0,0,0,0.08) !important; }

        /* ── Excel 그리드 셀 강조 (선택/편집 상태) ── */
        td:has(> input:focus),
        td:has(> textarea:focus),
        td:has(> select:focus) {
            outline: 2px solid #1e7ac8 !important;
            outline-offset: -2px;
        }

        /* ── 상태 배지 배경 조정 ── */
        .bg-cyan-500\/10  { background-color: rgba(30,122,200,0.08) !important; }
        .bg-cyan-500\/20  { background-color: rgba(30,122,200,0.12) !important; }
        .bg-slate-800\/40 { background-color: rgba(200,210,220,0.35) !important; }
        .bg-slate-800\/30 { background-color: rgba(200,210,220,0.25) !important; }
        .bg-slate-800\/20 { background-color: rgba(200,210,220,0.18) !important; }

        /* ── 로딩 스피너 ── */
        @keyframes _wrsSpin { to { transform: rotate(360deg); } }

        /* ── 드래그 컬럼 ── */
        .dragging-col { opacity: 0.4 !important; background-color: #e0e8f0 !important; }

        /* ── 엑셀 다운로드/업로드 버튼 ── */
        .bg-emerald-600\/20 { background-color: rgba(5,150,105,0.08) !important; }
        .border-emerald-500\/50 { border-color: rgba(5,150,105,0.4) !important; }

        /* ── 진행 상황 컬럼 색상 (상태 도트) ── */
        .bg-cyan-500    { background-color: #1e7ac8 !important; }
        .bg-blue-500    { background-color: #2563eb !important; }
        .bg-emerald-500 { background-color: #059669 !important; }
        .bg-indigo-500  { background-color: #4f46e5 !important; }
        .bg-rose-500    { background-color: #dc2626 !important; }
        .bg-slate-500   { background-color: #6b7280 !important; }
        .bg-amber-500   { background-color: #d97706 !important; }

        /* =========================================================
           모든 rounded 제거 — Excel 직각 스타일
           ========================================================= */
        [class*="rounded"] { border-radius: 0 !important; }

        /* 로딩 스피너 원형 유지 */
        .animate-spin { border-radius: 9999px !important; }

        /* 상태 색상 도트(작은 원형 배지) 원형 유지 */
        .w-1\\.5.h-1\\.5,
        .w-2.h-2,
        .w-2\\.5.h-2\\.5,
        .w-3.h-3 { border-radius: 9999px !important; }

        /* =========================================================
           테이블 그리드선 강화 (Chrome sticky+collapse 버그 우회: separate)
           ========================================================= */
        table { border-collapse: separate !important; border-spacing: 0 !important; }

        /* thead 헤더 셀 */
        thead th, thead td {
            background-color: #dce3ec !important;
            border-right: 2px solid #4e6880 !important;
            border-top: 1px solid #8aa0b8 !important;
            border-bottom: 1px solid #8aa0b8 !important;
            border-left: none !important;
        }
        thead th:first-child, thead td:first-child {
            border-left: 1px solid #8aa0b8 !important;
        }
        thead tr:last-child th, thead tr:last-child td {
            border-bottom: 3px solid #4e6880 !important;
        }

        /* tbody 데이터 셀 */
        tbody td {
            border-right: 1px solid #c4ccd8 !important;
            border-bottom: 1px solid #c4ccd8 !important;
            border-top: none !important;
            border-left: none !important;
        }
        tbody td:first-child {
            border-left: 1px solid #c4ccd8 !important;
        }

        /* 버튼 직각 */
        button { border-radius: 0 !important; }

        /* 입력창 직각 */
        input:not([type="checkbox"]):not([type="radio"]):not([type="range"]),
        textarea, select { border-radius: 0 !important; }

        /* 그룹 헤더 컬럼 (colspan 있는 th) */
        th[colspan] {
            background-color: #d4dde8 !important;
            border-bottom: 2px solid #9aa8b8 !important;
            text-align: center !important;
        }

        /* 강조 헤더 (시운전/공정률/진행현황 그룹) — text-slate-500보다 높은 특이성 */
        thead tr th.th-bold, thead tr td.th-bold { font-weight: 900 !important; color: #1a1a1a !important; }
    `}</style>
);

export default GlobalStyles;
