import React, { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import {
    Upload, Download, Trash2, X, Shuffle,
    AlertTriangle, ListChecks, Search,
    FileSpreadsheet, TerminalSquare, Eye,
    Edit2, Save, ChevronUp, ChevronDown, Check, Copy,
    Database, HardDrive, CloudUpload, Clock, Plus, Settings, AlignJustify, Calendar,
    FileText, LayoutList, Link2, BarChart3, TrendingUp,
    PanelRight, Link, Link2Off, Users, ZoomIn, RotateCcw, CornerDownRight, Hash, Home, Palette
} from 'lucide-react';
import { collection, doc, setDoc, updateDoc, deleteDoc, deleteField, getDoc, getDocs, onSnapshot, writeBatch } from 'firebase/firestore';
import ProgressModal from './ProgressModal';
import DetailModal from './DetailModal';
import { db, appId } from '../firebase';
import { logAudit, AUDIT_ACTIONS, pickProjectName } from '../auditLog';
import { loadXLSX, loadExcelJS, loadFileSaver, generatePid, mapLegacyStatus } from '../utils';
import { isFilterable, isDateCol, isDropdownCol, isStatusCol, isAssigneeCol, isClientCol, isVendorAssCol, toDateInputVal, parseDateFlex, MAIN_COL_KEYWORDS, STATUS_CHIP_COLORS, STATUS_COLOR_PRESETS, DEFAULT_STATUS_OPTIONS, ASSIGNEE_LIST, normalizeAssignee, extractName, toExcelAssignee, splitAssigneeCell, isProgressContentCol, isProgressDateCol, isManagerCol } from './projectColumns';
import { extractYear, metaDocRef, rowsColRef, rowDocRef, idbSave, idbLoad, idbDelete, computeMergePreview, computeMergePlan, parseExcelHeaders, padProjectNo, extRulesOf, extLockedColsOf, pickLatestExtFile, extNameDate, computeExtRuleValue, computeExtSubTable, extLockedItemKeysAllOf, NAS_SYNC_ENABLED, RULE_UI_ENABLED, extRulesRawOf, readerStatusRef, readerRequestRef, snapshotDocRef } from './projectListData';
import { getTeamProfile, LIST_TEAMS } from '../teamProfiles';   // 팀 프로파일 카드 + 팀 탭 목록 (2026-08-11)

const VERSION = 'v6.8.7';

// 데이터 도구 함수(Firebase경로·IDB·엑셀파싱·병합)는 ./projectListData.js 로 분리 (2026-06-25 코드분리 2조각)

// (2026-07-09) 열 숨김 설정을 브라우저에 기억 — 팀별 키. 새로고침해도 유지. localStorage만 사용(이 PC 한정, 공유 아님).
const hiddenColsKey  = (team) => `pms_list_hiddenCols_${team || 'default'}`;
const loadHiddenCols = (team) => { try { const raw = localStorage.getItem(hiddenColsKey(team)); const arr = raw ? JSON.parse(raw) : []; return new Set(Array.isArray(arr) ? arr : []); } catch (e) { return new Set(); } };
const saveHiddenCols = (team, set) => { try { localStorage.setItem(hiddenColsKey(team), JSON.stringify([...set])); } catch (e) {} };

// (2026-07-13) 개인 화면 설정 — '이 PC(브라우저)'에만 저장. 계정·서버와 무관 → 사람마다 각자 화면, 서로 영향 없음.
//   · 표 배율(%)  : 모니터 크기에 맞춘 전체 확대/축소. 팀 공통(내 PC 한정)
//   · 열 너비     : 마우스로 끌어 맞춘 폭 / 더블클릭 자동맞춤. 팀별로 따로 기억
const SCALE_KEY = 'pms_list_scale';
const SCALE_OPTIONS = [70, 80, 90, 100, 110, 125, 150];
const loadScale = () => { try { const v = Number(localStorage.getItem(SCALE_KEY)); return SCALE_OPTIONS.includes(v) ? v : 100; } catch (e) { return 100; } };
const saveScale = (v) => { try { localStorage.setItem(SCALE_KEY, String(v)); } catch (e) {} };
const colWidthsKey = (team) => `pms_list_colWidths_${team || 'default'}`;
const loadColWidths = (team) => { try { const raw = localStorage.getItem(colWidthsKey(team)); const o = raw ? JSON.parse(raw) : {}; return (o && typeof o === 'object' && !Array.isArray(o)) ? o : {}; } catch (e) { return {}; } };
const saveColWidths = (team, obj) => { try { localStorage.setItem(colWidthsKey(team), JSON.stringify(obj || {})); } catch (e) {} };

// (2026-07-27) 메인 PC 자동 반영 — 항상 켜져 있는 공용 PC 1대를 '메인 PC'로 지정하면
//   30분마다 NAS를 조용히 다시 읽어 값 갱신을 자동 저장한다(하위 행 '신규 생성'만 확인창).
//   이 PC 한정(localStorage) — 클라우드 공유가 아니라 여러 대를 메인으로 둬도 서로 안 부딪힘(같은 값을 쓰므로).
const EXT_MAINPC_KEY = 'pms_ext_mainpc';
const EXT_AUTO_MS = 30 * 60 * 1000;                       // 자동 검사 간격 30분 (2026-07-27 팀장님 확정)
const EXT_TICK_MS = 60 * 1000;                            // 1분 심장박동 — 절전·백그라운드 지연을 벽시계로 따라잡음
// (2026-08-07) 메인 PC가 지켜볼 팀 목록 — 콤마로 구분해 이 PC에만 저장 (예: "기술2팀" 또는 "기술2팀,기술1팀").
//   화면 하나는 한 팀만 보므로, 팀이 둘 이상이면 App.js가 정해진 간격으로 다음 팀 화면으로 옮겨간다(창 1개로 여러 팀 커버).
//   재시작 뒤 홈 화면에서 멈추지 않도록 App.js가 이 값을 읽어 그 팀 List 화면으로 자동 복귀시킨다.
const EXT_MAINPC_TEAM_KEY = 'pms_ext_mainpc_team';
const loadMainPcTeams = () => { try {
    if (localStorage.getItem(EXT_MAINPC_KEY) !== '1') return [];
    return (localStorage.getItem(EXT_MAINPC_TEAM_KEY) || '').split(',').map(s => s.trim()).filter(Boolean);
} catch (e) { return []; } };
const saveMainPcTeams = (list) => { try {
    const arr = Array.from(new Set((list || []).map(s => String(s).trim()).filter(Boolean)));
    if (arr.length) { localStorage.setItem(EXT_MAINPC_KEY, '1'); localStorage.setItem(EXT_MAINPC_TEAM_KEY, arr.join(',')); }
    else           { localStorage.removeItem(EXT_MAINPC_KEY); localStorage.removeItem(EXT_MAINPC_TEAM_KEY); }
} catch (e) {} };
const extHHMM = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

// ── 자동 반영기(NAS Docker 프로그램 pms-reader) 상태 표시 도우미 (2026-07-31) ──
//   프로그램이 Firestore에 남긴 기록을 '언제·정상인지'로 바꿔 보여주기만 한다. 판단 기준 하나뿐:
//   마지막 확인이 주기의 2.5배보다 오래됐으면 = 멈춘 것으로 본다 (15분 주기면 38분).
const rdTimeText = (iso) => { try { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()} ${extHHMM(d)}`; } catch (e) { return ''; } };
const rdMinsAgo  = (iso) => { try { const t = new Date(iso).getTime(); return Number.isFinite(t) ? Math.max(0, Math.round((Date.now() - t) / 60000)) : null; } catch (e) { return null; } };
const rdState = (s) => {
    if (!s || !s.at) return { color: '#94a3b8', mins: null, stale: false };
    const mins = rdMinsAgo(s.at);
    const stale = mins != null && mins > (Number(s.intervalMin) || 15) * 2.5;
    if (s.ok === false) return { color: '#dc2626', mins, stale };
    return { color: stale ? '#d97706' : '#059669', mins, stale };
};

// (2026-07-22) NAS 폴더 핸들(읽기 허가증) IndexedDB — 이 PC 브라우저 한정.
//   규칙·경로는 클라우드(행 _extSync)로 공유하고, 실제 파일 접근 허가증(핸들)만 PC별로 보관한다.
const openExtIDB = () => new Promise((res, rej) => {
    const q = indexedDB.open('PmsExtSyncDB', 1);
    q.onupgradeneeded = e => { const d = e.target.result; if (!d.objectStoreNames.contains('handles')) d.createObjectStore('handles'); };
    q.onsuccess = e => res(e.target.result); q.onerror = e => rej(e.target.error);
});
const extIdbSet = async (key, handle) => { const d = await openExtIDB(); return new Promise((res, rej) => { const q = d.transaction('handles', 'readwrite').objectStore('handles').put(handle, key); q.onsuccess = res; q.onerror = e => rej(e.target.error); }); };
const extIdbGet = async (key) => { const d = await openExtIDB(); return new Promise((res, rej) => { const q = d.transaction('handles', 'readonly').objectStore('handles').get(key); q.onsuccess = e => res(e.target.result || null); q.onerror = e => rej(e.target.error); }); };
const extIdbDel = async (key) => { const d = await openExtIDB(); return new Promise((res, rej) => { const q = d.transaction('handles', 'readwrite').objectStore('handles').delete(key); q.onsuccess = res; q.onerror = e => rej(e.target.error); }); };
const EXT_TARGET_OPTIONS = ['도면입수', 'I/O Map', '화면작성', '기준정보', 'PLC', 'ETOS', 'HMI', '자체시운전', '통합시운전'];
// 파일2(진척자료_YYMMDD) 하위 공종표 프리셋 — 공종별 6항목%+총점(AG), 부모 총계 4항목%+누적(AN) (2026-07-22 팀장님 확정)
const EXT_SUBTABLE_PRESET = { type: 'subTable', target: '하위 공종표', filePattern: '진척자료', sheet: '진척률요약(Main)', nameCol: 'C',
    subCols: { '도면입수': 'H', 'I/O Map': 'M', '화면작성': 'R', '기준정보': 'Z', '자체시운전': 'AH', '통합시운전': 'AP' },
    subPtCol: 'AG', parentCols: { '도면입수': 'H', 'I/O Map': 'M', '화면작성': 'R', '기준정보': 'Z', 'HMI': 'Z' }, parentAccCol: 'AN', decimals: 1 };   // HMI = 기준정보생성 총계 진척율 (2026-07-22 팀장님)

// ─── 세션 메모리 캐시 (2026-08-11 진입 속도) ───────────────────────────────
//   마지막으로 받은 팀별 행·헤더를 앱 메모리에 보관 → 재진입·팀 탭 전환 시 즉시 표시.
//   onSnapshot 실시간 구독은 그대로 살아 있어 서버 최신값 도착 즉시 자동 교체됨 (표시 순서만 캐시 먼저).
//   F5(새로고침) 하면 비워짐 — 데이터의 원본은 언제나 Firestore.
const _memRowsCache = {};   // { 팀: rows[] }
const _memMetaCache = {};   // { 팀: { headers, colGroups } }

// ─── 컴포넌트 ──────────────────────────────────────────────────────────────
// ★ 행 메모 컴포넌트 (2026-08-25 팀장님 "메인표 수정이 너무 느림"): 표 188행×30칸을 상태가 바뀔 때마다 전부 다시 그리던 것을
//   '그 행의 데이터(객체 동일성)·편집·선택·강조·NAS 상태·하위 합·전역 레이아웃 신호(gsig)'가 바뀐 행만 다시 그린다.
//   렌더 본체는 부모의 최신 클로저(rowCtxRef.current.renderRow)를 그대로 실행 — 기존 셀 코드 무변경.
const MemoRow = React.memo(function MemoRow({ row, ri, sig, ctx }) { return ctx.current.renderRow(row, ri); },
    (p, n) => p.row === n.row && p.ri === n.ri && p.sig === n.sig);

const ProjectListScreen = ({ currentTeam, user, onBack, onGoToPms, onGoToBacklog, onSwitchTeam, highlightExecNo, allProjects, onShowGraph,
    weeklyLinks, weeklyPanel, setWeeklyPanel, onOpenWeeklyPanel, onWeeklyUnlink, onWeeklyDownload, onOpenWeeklyLinkModal,
    baseDate = '', onApplyProgressByPid, onProgressSaved, teamSettings, isAdmin = false,
    openProgressPid = null, onProgressOpened, progressRecordsMap = null }) => {
    // ── 팀 프로파일 카드 (2026-08-11 2단계) — 팀별 값·규칙은 카드에서만 읽는다 (src/teamProfiles/, if(팀명) 하드코딩 금지)
    const teamProfile = getTeamProfile(currentTeam);
    // List 전용 마스터 목록 — teamSettings[팀].listStatus/listManager 우선 → 팀 카드 → 공용 기본값 (2026-07-06 구조 + 2026-08-11 카드)
    const _teamCfg = currentTeam ? (teamSettings?.[currentTeam] || null) : null;
    const STATUS_OPTIONS = (_teamCfg?.listStatus?.length) ? _teamCfg.listStatus : (teamProfile?.상태?.기본목록 || DEFAULT_STATUS_OPTIONS);
    const ASSIGNEES      = (_teamCfg?.listManager?.length) ? _teamCfg.listManager : (teamProfile?.담당자목록 || ASSIGNEE_LIST);   // 팀 카드 담당자 명단 (2026-08-11 — 기술1팀 칩이 기술2팀 명단으로 뜨던 문제)
    // 팀 카드 '상태색'이 있으면 그 목록만 색을 입히고 나머지는 전부 회색(기본) — 기술1팀 (2026-08-21 팀장님: 완료=빨강·진행=초록·그 외 회색)
    const _baseColors    = teamProfile?.상태색 ? teamProfile.상태색 : STATUS_CHIP_COLORS;
    const STATUS_COLORS  = _teamCfg?.listStatusColors ? { ..._baseColors, ..._teamCfg.listStatusColors } : _baseColors;
    // 단어(카테고리) 칸 드롭다운 대상 — 팀 카드 '드롭다운열'의 열 이름(공백 무시)과 일치하면 그 사전 목록 키를 돌려줌 (2026-08-19 팀장님)
    const wordDropCols = teamProfile?.드롭다운열 || {};
    const wordDropKey = (h) => { const k = String(h).replace(/\s/g, ''); return Object.keys(wordDropCols).find(c => String(c).replace(/\s/g, '') === k || aliasCol(c) === h) || null; };   // 옛 연도 열 이름은 별칭으로 (2026-08-21)
    // 팝업(상세/추가)용 드롭다운 목록 — 메인표 단어 드롭다운과 같은 규칙: 카드 사전 + 기준연도 실제 사용값(가나다) (2026-09-04 팀장님)
    const buildWordDropOptions = () => {
        const out = {};
        Object.entries(wordDropCols).forEach(([col, preset]) => {
            const h = aliasCol(col) || col;
            const used = [...new Set(yearFilteredRows.map(r => String(r[h] || '').trim()).filter(Boolean))];
            out[h] = [...(preset || []), ...used.filter(v => !(preset || []).includes(v)).sort()];
        });
        return out;
    };
    // 담당자식(다중 선택) 드롭다운 열 — 팀 카드 '담당자식열' (2026-08-21 팀장님: 기술1팀 담당·수행 = 명단 5명+직접 입력+여러 명)
    const asgColCfg = teamProfile?.담당자식열 || null;
    const isCardAsgCol = (h) => !!asgColCfg && (asgColCfg.열 || []).some(c => String(c).replace(/\s/g, '') === String(h).replace(/\s/g, '') || aliasCol(c) === h);
    // 발주처(고객사) 담당자 칸 — 팀 카드 '고객담당자열' (2026-09-04 팀장님: 기술 1팀 '담당자'=고객 이름 — 직원 드롭다운·직책 보정 제외, 일반 입력칸)
    const isCustAsgCol = (h) => (teamProfile?.고객담당자열 || []).some(c => String(c).replace(/\s+/g, '') === String(h ?? '').replace(/\s+/g, ''));
    // ★ 이름만 저장 → 표시할 때 직책 자동 부착 (2026-08-27 팀장님: 기술1팀 심광호 담당·염경록 팀장·나머지 책임).
    //   직책은 팀 명단(ASSIGNEES)에서 찾음 — 저장값·엑셀 표기는 이름만 그대로(원본 엑셀 불변). 명단에 없는 이름은 그대로.
    const asgTitleOf = (token) => { const k = extractName(normalizeAssignee(token)); const hit = k ? ASSIGNEES.find(n => extractName(normalizeAssignee(n)) === k) : null; return hit ? toExcelAssignee(hit) : String(token ?? '').trim(); };
    const decorateAsg = (val) => { const s = String(val ?? '').trim(); if (!s) return s; return s.split(/[,/·]/).map(t => t.trim()).filter(Boolean).map(asgTitleOf).join(' / '); };
    // ── 연도별 1:1 헤더 별칭 (2026-08-21 팀장님): 옛 연도 표는 그 해 엑셀 열 이름 그대로라, 화면 기능(칩·카드·드롭다운)이 찾는
    //    표준 이름(계약·작업·수행·공사명…)을 팀 카드 '열번역'(옛 이름→표준 이름)으로 역추적. 올해는 정확 일치만.
    //    ★헤더에 열을 추가하지 않는 '읽기 전용 찾기' — 표·데이터는 엑셀 그대로 유지.
    const _curY4 = String(new Date().getFullYear());
    const _xlatNorm = {}; Object.entries(teamProfile?.파서옵션?.열번역 || {}).forEach(([k, v]) => { _xlatNorm[String(k).replace(/\s+/g, '')] = String(v).replace(/\s+/g, ''); });
    const aliasCol = (name) => {
        const key = String(name ?? '').replace(/\s+/g, '');
        const hs = activeHeaders || [];   // 아래에서 정의되지만 호출은 렌더 중이라 안전
        const legacy = !!selectedYear && String(selectedYear) !== _curY4;
        const exact = hs.find(h => String(h).replace(/\s+/g, '') === key);
        if (exact && (!legacy || !_xlatNorm[key] || _xlatNorm[key] === key)) return exact;   // 옛 연도의 동명이인 열('계약'=O/X)은 번역이 다른 이름이면 건너뜀
        if (legacy) { const via = hs.find(h => _xlatNorm[String(h).replace(/\s+/g, '')] === key); if (via) return via; }
        return exact || null;
    };
    // 상태 칩으로 그릴 칸 — 공용 키워드(진행현황·현황·진행) + 팀 카드가 상태로 지정한 열의 연도별 별칭(2015 '상태'·2017~ '작업 현황'·'견적'·2026 '계약'·'작업')
    //   (2026-08-21 팀장님: 2015년만 글자로 보이던 문제 — 연도마다 같은 모양으로). 클릭 동작(드롭다운)은 기존 판별 그대로.
    // 빈칸 회색 열 (2026-08-21 팀장님: 엑셀처럼 수량·진척 칸은 비어 있으면 진한 회색, 값이 들어오면 원래 색) — 팀 카드 '빈칸회색열' 키워드
    const _grayKws = (teamProfile?.빈칸회색열 || []).map(k => String(k).replace(/\s+/g, '').toLowerCase());
    const isGrayEmptyCol = (h) => teamProfile?.빈칸회색 === true || (_grayKws.length > 0 && _grayKws.some(k => String(h).replace(/\s+/g, '').toLowerCase().includes(k)));   // 카드 빈칸회색:true = 모든 열 (2026-08-21 팀장님 '전부 빈칸')
    const isStatusCell = (h) => isStatusCol(h) || [teamProfile?.상태?.칩기준열, teamProfile?.당해카드?.상태열, teamProfile?.보고카드?.작업열, teamProfile?.보고카드?.상태열].filter(Boolean).some(nm => aliasCol(nm) === h);
    // 자동 2단계 보조줄(계약·작업 추정)은 상태 1칸 팀(기술2·3팀)용 — 카드에 계약/작업이 따로 있는 팀(기술1팀)은 추정이 틀려 숨김
    const showLegacySub = !(teamProfile?.상태?.계약현황) && teamProfile?.상태?.보조줄 !== false;   // 카드 보조줄:false = 칩만 (2026-08-24 팀장님: 행 높이 커져 기술2·3팀도 숨김)
    // ── 수행번호 (2026-08-21 팀장님, 기술1팀): 형식 YY-NNN 고정(26-01→26-001) · 빈칸 [+] = 그 해 최대번호+1 자동 부여 · 회수 ✕
    const execCfg = teamProfile?.수행번호 || null;
    const execNoNorm = (v) => { const s = String(v ?? '').trim(); const m = s.match(/^(\d{2})\s*-\s*(\d{1,3})([A-Za-z가-힣]*)$/); return m ? `${m[1]}-${m[2].padStart(3, '0')}${m[3]}` : s; };
    const execColBase = execCfg ? (execCfg.열 || teamProfile?.열?.번호 || null) : null;   // 수행번호 칸 — 카드 수행번호.열 우선 (2026-08-24: 기술2팀은 매칭키 '번호'와 분리)
    const isExecNoCol = (h) => !!execColBase && aliasCol(execColBase) === h;
    // [+] 자동부여·✕회수·YY-NNN 정형화는 실제 이름이 카드의 수행번호 열('수행번호')인 칸만 —
    //   지난 연도 별칭 칸(프로젝트 코드·NO. 등)은 다른 의미라 엑셀 값 그대로 둔다 (2026-08-24 팀장님)
    const isExecAssignCol = (h) => isExecNoCol(h) && String(h).replace(/\s+/g, '') === String(execColBase).replace(/\s+/g, '');
    // [+]·✕·YY-NNN 정형화는 당해 연도 행만 (2026-08-24 팀장님: 지난 연도는 수동 키인 — 기술3팀 과거 시트도 열 이름이 '수행번호'라 행 _year로 구분)
    const isExecAssignRowCol = (row, h) => { if (!isExecAssignCol(h)) return false; const cy = String(new Date().getFullYear()); return String((row && row._year) || cy) === cy; };
    // ★ 최신 행 목록(activeRowsRef = 초안 노란 칸 포함)으로 계산 (2026-08-28 팀장님 버그: 행 렌더가 캐시(MemoRow)라 [+] 클릭 핸들러가
    //   초안 반영 전 옛 목록을 붙잡고 있어 저장 전까지 몇 번을 눌러도 같은 번호(26-003)가 나오던 것)
    const execMaxOf = (year, h) => { const cy = String(new Date().getFullYear()); const yr = String(year || cy); const yy = yr.slice(-2); let max = 0; (activeRowsRef.current || []).forEach(r => { if (String(r._year || cy) !== yr) return; const m = String(r[h] || '').trim().match(/^(\d{2})-(\d{3})/); if (m && m[1] === yy) max = Math.max(max, Number(m[2])); }); return { yy, max }; };
    // 같은 연도 다른 메인 행에 이미 있는 수행번호인지 (초안 포함) → 중복이면 그 행, 없으면 null (2026-08-28 중복 차단)
    const execDupOf = (rowId, year, h, value) => {
        const v = execNoNorm(value); if (!v) return null;
        const cy = String(new Date().getFullYear()); const yr = String(year || cy);
        return (activeRowsRef.current || []).find(r => r._id !== rowId && !isSubListRow(r) && String(r._year || cy) === yr && execNoNorm(r[h]) === v) || null;
    };
    const execDupMsg = (v, dup) => `⛔ 수행번호 중복 — 저장할 수 없습니다!\n\n'${v}'은(는) 이미 등록돼 있습니다:\n→ ${String((projectNameCol && dup[projectNameCol]) || '').trim() || '(이름 없음)'}\n\n다른 번호로 바꾸거나 [+]로 다음 번호를 받아 주세요.`;
    const assignExecNo = (row, h) => { const { yy, max } = execMaxOf(row._year, h); let n = max + 1, next = `${yy}-${String(n).padStart(3, '0')}`; while (execDupOf(row._id, row._year, h, next)) { n++; next = `${yy}-${String(n).padStart(3, '0')}`; } commitCellWith(row._id, h, next); };
    const revokeExecNo = (row, h) => {
        const cur = String(row[h] || '').trim(); const { max } = execMaxOf(row._year, h);
        const m = cur.match(/^\d{2}-(\d{3})/); const n = m ? Number(m[1]) : 0;
        const gapMsg = (n && n < max) ? `\n\n⚠ 마지막 번호가 아닙니다 (현재 최대 ${String(max).padStart(3, '0')}). 지우면 ${cur} 자리가 비게 됩니다.` : '';
        if (!window.confirm(`[수행번호 회수]\n${cur} 을(를) 비웁니다. (작업 백로그에 기록됨)${gapMsg}\n\n계속할까요?`)) return;
        commitCellWith(row._id, h, '');
    };
    // ── NAS 진척자료 자동 반영 상태 (2026-07-22) ──────────────────────────────
    const [extModalRowId, setExtModalRowId] = useState(null);   // NAS 연결 모달(행 _id)
    const [extStatus, setExtStatus] = useState({});             // { rowId: {state,msg,fileName,value,checkedAt} }
    const [extBusy, setExtBusy] = useState(false);
    const [extProposals, setExtProposals] = useState(null);     // 변경 감지 → 반영 확인창 목록
    const [userMerge, setUserMerge] = useState(null);           // 일반 사용자 [엑셀 반영] 미리보기 (2026-08-10)
    const userFileRef = useRef(null);                           // [엑셀 반영] 전용 파일 선택 (관리자 업로드와 별개)
    const histFileRef = useRef(null);                           // [과거 연도 추가 적재] 파일 선택 (2026-08-20)
    const restoreFileRef = useRef(null);                        // [백업 복원] 파일 선택 (2026-08-20 1층 백업 체계)
    const yearFileRef = useRef(null);                           // [연도별 1:1 적재·검증] 파일 선택 (2026-08-21)
    const [yearLoad, setYearLoad] = useState(null);             // 연도별 1:1 적재 모달 { fileName, sheets[], sel, report }
    const [fbByYear, setFbByYear] = useState({});               // 연도별 헤더 벌 meta.byYear[연도] = {headers, colGroups} (2026-08-21 기술1팀 1:1)
    const [fbColMids, setFbColMids] = useState({});             // 3층 헤더 중간 라벨 {열: 라벨} (2026-08-24)
    // ── 메인 PC 자동 반영 (2026-07-27) ────────────────────────────────────
    // (2026-08-07) '이 PC가 메인 PC인가' → '지금 보고 있는 팀이 이 PC의 메인 팀 목록에 있는가'로 바뀜.
    //   팀 순환을 넣으면서, 사람이 목록에 없는 팀으로 들어갔을 때 그 팀까지 무인 반영되는 일을 막는다.
    const [extMainTeams, setExtMainTeams] = useState(loadMainPcTeams);   // 이 PC가 지켜볼 팀 목록 (이 PC에만 저장)
    const extMainPc = extMainTeams.includes(currentTeam);                // 이 화면이 지금 메인 PC 역할인가
    const [extToast, setExtToast]         = useState('');           // 자동 반영 알림 — 모달과 달리 화면을 안 막음
    const [extToastWarn, setExtToastWarn] = useState(false);
    const [extLastAuto, setExtLastAuto]   = useState('');           // 마지막 자동 검사 시각 HH:MM (설정 메뉴 표시)
    const extStatusRef   = useRef({});                              // extStatus 즉시 읽기용 (setState 지연 회피)
    const extAutoFnRef   = useRef(null);                            // 타이머가 부를 '최신' 실행 함수
    const extLastRunRef  = useRef(0);                               // 마지막 자동 실행 시각(벽시계)
    const extToastTimerRef = useRef(null);
    const showExtToast = (msg, warn = false) => {
        setExtToast(msg); setExtToastWarn(!!warn);
        if (extToastTimerRef.current) clearTimeout(extToastTimerRef.current);
        extToastTimerRef.current = setTimeout(() => setExtToast(''), warn ? 30000 : 12000);
    };
    const [readerStatus, setReaderStatus] = useState(null);     // 자동 반영기 상태 문서 (2026-07-31, 읽기 전용)
    const [readerReqBusy, setReaderReqBusy] = useState(false);  // [지금 확인] 요청 보내는 중
    const [myReaderReqAt, setMyReaderReqAt] = useState(null);   // 내가 보낸 요청 시각 — 처리됐는지 대조용
    const [showAllFiles, setShowAllFiles] = useState(false);    // 파일 목록: 이 프로젝트 것만 / 폴더 전체
    const [extFolderDraft, setExtFolderDraft] = useState(null);  // '이 프로젝트 폴더' 고르는 중 (null=표시 모드)
    const [extRuleDraft, setExtRuleDraft] = useState(null);     // 규칙 추가 폼(관리자)
    const [extPathDraft, setExtPathDraft] = useState(null);     // 경로 입력 중 값(관리자, null=표시 모드)
    const [extLocalDraft, setExtLocalDraft] = useState(null);   // 이 PC용 주소(드라이브 별명) 입력 중 값 — localStorage 저장 (2026-07-22)
    const [extSharedPathDraft, setExtSharedPathDraft] = useState(null);   // 공용 폴더 주소 입력 중 값 — 클라우드 _extSync.sharedUncPath (2026-08-05)
    const extAutoRef = useRef({});                              // 팀별 자동확인 1회 가드
    const extTeamRunRef = useRef({});                           // (2026-08-07) { 팀: 마지막 무인 검사 시각 } — 메인 PC 팀 순환용 되먹임 차단
    const [statusMgr, setStatusMgr] = useState(null); // 진행현황 관리 모달 — 편집 중 상태이름 배열(null=닫힘) (2026-07-06 2단계)
    const [statusMgrOrig, setStatusMgrOrig] = useState([]); // 열 때의 원본 이름들 — '기존 이름 잠금' 판별용 (2026-07-07 안전안: 이름수정 금지, 추가·삭제만)
    const [managerMgr, setManagerMgr] = useState(null); // 담당자 관리 모달 — 편집 중 이름 배열(null=닫힘) (2026-07-07 3단계)
    const [managerMgrOrig, setManagerMgrOrig] = useState([]); // 열 때의 원본 담당자들 — 잠금 판별용 (2026-07-07 3단계)
    // 색 선택·삭제 경고 (2026-07-08 ②)
    const [statusMgrColors, setStatusMgrColors] = useState({}); // {상태명: 색객체} — 진행현황 관리 모달 편집 중 색
    const [statusColorOpenIdx, setStatusColorOpenIdx] = useState(null); // 색 팔레트가 펼쳐진 행(null=닫힘)
    const [statusDelIdx, setStatusDelIdx] = useState(null); // 진행현황 삭제 확인 대기 행
    const [managerDelIdx, setManagerDelIdx] = useState(null); // 담당자 삭제 확인 대기 행
    // ── Firebase 데이터 ──
    const [fbHeaders,   setFbHeaders]   = useState(() => _memMetaCache[currentTeam]?.headers   || []);
    const [fbColGroups, setFbColGroups] = useState(() => _memMetaCache[currentTeam]?.colGroups || []);
    const [fbRows,      setFbRows]      = useState(() => _memRowsCache[currentTeam] || []);
    const [fbLoaded,    setFbLoaded]    = useState(() => !!_memRowsCache[currentTeam]);   // 행 첫 스냅샷 도착 여부 — 캐시 있으면 즉시 true (2026-08-11)
    const [fbMetaLoaded, setFbMetaLoaded] = useState(() => !!_memMetaCache[currentTeam]);  // 헤더(메타) 첫 도착 여부 — 행보다 늦게 오면 '없습니다' 오판하던 원인 (2026-08-12)

    // ── 로컬(IndexedDB) 임시 데이터 ──
    const [localData, setLocalData]     = useState(null); // { headers, colGroups, rows, savedAt } | null

    // ── 엑셀 업로드 후 미저장 미리보기 데이터 ──
    const [pendingData, setPendingData] = useState(null); // { headers, colGroups, rows, fileName } | null

    // ── UI 상태 ──
    const [isLoading, setIsLoading]         = useState(false);   // 진입 시엔 가림막 안 씀 — 업로드·저장 등 작업 중에만 (2026-08-11)
    const [alertMsg, setAlertMsg]           = useState('');
    const [searchTerm, setSearchTerm]       = useState('');
    const [sortConfig, setSortConfig]       = useState({ key: null, dir: 'asc' });
    const [columnFilters, setColumnFilters] = useState({});
    const [openFilter, setOpenFilter]       = useState(null);
    const [hiddenCols, setHiddenCols]         = useState(() => loadHiddenCols(currentTeam)); // 브라우저 기억 로드 (2026-07-09)
    const [colDropOpen, setColDropOpen]       = useState(false);
    // 기본 활성 상태 칩 = 팀 카드 '상태.기본활성칩' (2026-08-11 — 기술2팀 [진행중·추진중] 그대로, 기술1팀 []=전체)
    const [activeStatusChips, setActiveStatusChips] = useState(() => new Set(getTeamProfile(currentTeam)?.상태?.기본활성칩 ?? ['진행중', '추진중']));
    const [activeAssignees, setActiveAssignees]     = useState(new Set());
    const [activeManagers, setActiveManagers]       = useState(new Set());   // 관리자 칩 필터 (2026-07-22 팀장님 — 담당자와 동일 형식)
    const [settingsOpen, setSettingsOpen]           = useState(false);
    const [compactMode, setCompactMode]             = useState(() => {
        try { const raw = localStorage.getItem('pms_list_compactMode'); const v = Number(raw); return (raw !== null && (v === 0 || v === 1 || v === 2)) ? v : 1; } catch (e) { return 1; }
    }); // 0=기본 1=컴팩트 2=초소형 — 마지막 선택 기억(localStorage) (2026-07-07)
    const [confirmClearOpen, setConfirmClearOpen]   = useState(false);
    const [clearYearSel, setClearYearSel]           = useState('ALL');   // 삭제 범위: 'ALL' 또는 '2025' 같은 특정 연도 (2026-09-04 팀장님)
    const [confirmDialog, setConfirmDialog]         = useState(null); // { message, onConfirm }
    const [execNoModal, setExecNoModal]             = useState(null); // { row, candidates, selected, loading }
    const [progressRow, setProgressRow]             = useState(null); // 진행실적 등록 대상 row
    const [statusDropdown, setStatusDropdown]       = useState(null); // { rowId, col, top, left, width }
    const [assigneeDropdown, setAssigneeDropdown]   = useState(null); // { rowId, col, top, left, width }
    const [clientDropdown, setClientDropdown]       = useState(null); // { rowId, col, top, left, width }
    const [wordDropdown, setWordDropdown]           = useState(null); // 단어(카테고리) 칸 공용 드롭다운 — 팀 카드 '드롭다운열' (2026-08-19)
    const [vendorDropdown, setVendorDropdown]       = useState(null); // { rowId, col, top, left, width }
    const [contextMenu, setContextMenu]             = useState(null); // { x, y, row, col }
    const [fmtBar, setFmtBar]                       = useState(null); // 서식 팔레트 위치 {x,y} | null=닫힘 — 항상 떠서 작업·드래그 이동 (2026-09-01 팀장님)
    const fmtBarRef = useRef(false);                                  // 행 클로저(셀 onClick)는 상태 대신 ref로 읽어야 최신 (MemoRow가 재렌더 안 해도 동작)
    const fmtBarPosRef = useRef(null);
    const [fmtScope, setFmtScope]                   = useState('cells'); // 'cells'=선택 칸 | 'row'=행 전체
    const [fmtSelTick, setFmtSelTick]               = useState(0);    // 선택 변경 → 팔레트 표시(N칸) 갱신
    const [highlightedRowId, setHighlightedRowId]   = useState(null); // 외부에서 이동 시 하이라이트
    const appliedHighlightRef = useRef(null); // 중복 하이라이트 방지
    const [detailRow, setDetailRow]                 = useState(null); // 상세 화면용 row 사본
    const [detailRowOriginal, setDetailRowOriginal] = useState(null); // 변경 감지용 원본
    const [conflictDlg, setConflictDlg] = useState(null); // 동시수정 감지 확인창 {who, at, fields, server, onOverwrite} (2026-07-14)
    const [editingRow, setEditingRow]       = useState(null);
    const [addingRow, setAddingRow]         = useState(null);
    const [selectedRowId, setSelectedRowId] = useState(null);
    const [editingCell, setEditingCell]     = useState({ id: null, key: null, value: '' });
    const [colWidths, setColWidths]         = useState(() => loadColWidths(currentTeam)); // 이 PC에 기억된 열 너비 (2026-07-13)
    const [tableScale, setTableScale]       = useState(loadScale);                        // 표 배율(%) — 이 PC에 기억 (2026-07-13)
    const resizeRef                          = useRef({ col: null, startX: 0, startWidth: 0 });
    useEffect(() => { setColWidths(loadColWidths(currentTeam)); }, [currentTeam]);   // 팀 전환 시 그 팀 열 너비 복원 (2026-07-13)
    // 팀 전환 시 상태 칩도 그 팀 기본값으로 — 다른 팀 칩(진행중 등)이 남아 새 팀 표가 비어 보이는 것 방지 (2026-08-11)
    useEffect(() => { setActiveStatusChips(new Set(getTeamProfile(currentTeam)?.상태?.기본활성칩 ?? ['진행중', '추진중'])); }, [currentTeam]);
    const [logs, setLogs]                   = useState([]);
    const [showDebug, setShowDebug]         = useState(false);
    const [selectedYear, setSelectedYear]   = useState(String(new Date().getFullYear()));
    // 기준월 필터 (2026-07-13) — 기준 날짜 = 메인표 '공사 계약' 칸.
    //   'all'=전체(모든 월) | '01'~'12'=해당 월만 | 'etc'=기타(년·월·일 중 하나라도 없으면. 빈칸 포함)
    const [selectedMonth, setSelectedMonth] = useState('all');
    // ── 월별 보기 (월간보고식 월 선택기 + 그달만/이전전체 토글) — 1단계: UI 뼈대 ──
    const [viewMonth, setViewMonth] = useState(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });
    const [monthMode, setMonthMode] = useState('single'); // 'single'=그 달만 | 'cumul'=이전 전체

    // 연도 자동전환(엑셀 업로드 등)으로 selectedYear가 바뀌면 월 선택기 연도도 맞춘다
    useEffect(() => {
        setViewMonth(vm => { const y = vm.slice(0, 4); return (selectedYear && y !== selectedYear) ? selectedYear + '-' + vm.slice(5) : vm; });
    }, [selectedYear]);
    const [frozenUpTo, setFrozenUpTo]       = useState(null); // 고정 열 — 이 열까지 sticky

    const fileInputRef = useRef(null);
    const logEndRef    = useRef(null);
    const filterRefs   = useRef({});

    const addLog = (msg) => {
        console.log('[PL]', msg);
        setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
    };

    useEffect(() => {
        if (showDebug && logEndRef.current) logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }, [logs, showDebug]);

    // ── IndexedDB 로드 (마운트 시) ───────────────────────────────────────
    useEffect(() => {
        idbLoad(currentTeam).then(data => {
            if (data) {
                setLocalData(data);
                addLog(`[로컬DB] ${data.rows.length}행 로드 (저장: ${new Date(data.savedAt).toLocaleString()})`);
            }
        }).catch(err => addLog(`[로컬DB 오류] ${err.message}`));
    }, [currentTeam]);

    // ── 열 숨김 설정: 팀 바뀌면 그 팀 저장값으로 다시 로드 (2026-07-09) ──
    useEffect(() => { setHiddenCols(loadHiddenCols(currentTeam)); }, [currentTeam]);

    // ── Firebase 구독 ────────────────────────────────────────────────────
    useEffect(() => {
        if (!user || !db) return;
        // 진입 가림막 제거 (2026-08-11): 화면 뼈대는 바로 보여주고 표 안에 '불러오는 중' 한 줄만.
        //   팀 전환·재진입 시 세션 메모리 캐시로 즉시 채우고(0초), 서버 최신값 도착 시 자동 교체.
        const memR = _memRowsCache[currentTeam], memM = _memMetaCache[currentTeam];
        const _t0 = Date.now(); let _gotMeta = false, _gotRows = false;   // 속도 계측 (2026-08-24) — 첫 도착만 기록
        setFbRows(memR || []); setFbLoaded(!!memR);
        setFbHeaders(memM?.headers || []); setFbColGroups(memM?.colGroups || []); setFbByYear(memM?.byYear || {}); setFbColMids(memM?.colMids || {});
        setFbMetaLoaded(!!memM);
        addLog(`[Firebase] ${currentTeam} 구독 시작${memR ? ` (캐시 ${memR.length}행 선표시)` : ''}`);

        const unsubMeta = onSnapshot(metaDocRef(currentTeam), snap => {
            if (!_gotMeta) { _gotMeta = true; addLog(`[속도] 헤더 도착 +${Date.now() - _t0}ms (${snap.metadata.fromCache ? '로컬 캐시' : '서버'})`); }
            const d = snap.exists() ? snap.data() : {};
            _memMetaCache[currentTeam] = { headers: d.headers || [], colGroups: d.colGroups || [], byYear: d.byYear || {}, colMids: d.colMids || {} };
            setFbHeaders(d.headers || []);
            setFbColGroups(d.colGroups || []);
            setFbByYear(d.byYear || {});
            setFbColMids(d.colMids || {});
            setFbMetaLoaded(true);
            addLog(`[Firebase] 헤더 ${(d.headers||[]).length}개`);
        }, err => { addLog(`[Firebase 오류] ${err.message}`); setIsLoading(false); setFbLoaded(true); setFbMetaLoaded(true); });

        const unsubRows = onSnapshot(rowsColRef(currentTeam), snap => {
            if (!_gotRows) { _gotRows = true; addLog(`[속도] 행 ${snap.docs.length}개 도착 +${Date.now() - _t0}ms (${snap.metadata.fromCache ? '로컬 캐시' : '서버'})`); }
            // ★ 안 바뀐 문서는 이전 행 객체 그대로 재사용 (2026-08-25): 매 갱신마다 2천 개 객체를 새로 만들면
            //   행 메모(MemoRow)가 전부 '바뀜'으로 보고 다시 그린다. docChanges로 바뀐 문서만 새 객체.
            const _prevMap = new Map((_memRowsCache[currentTeam] || []).map(x => [x._id, x]));
            const _chg = new Set(snap.docChanges().map(c => c.doc.id));
            const r = snap.docs
                .map(d => { const pv = _prevMap.get(d.id); return (pv && !_chg.has(d.id)) ? pv : { _id: d.id, ...d.data() }; })
                .sort((a, b) => String(a._id).localeCompare(String(b._id)));
            _memRowsCache[currentTeam] = r;
            setFbRows(r);
            setFbLoaded(true);
            setIsLoading(false);
            addLog(`[Firebase] 행 ${r.length}개`);
        }, err => { addLog(`[Firebase 오류] ${err.message}`); setIsLoading(false); setFbLoaded(true); setFbMetaLoaded(true); });

        return () => { unsubMeta(); unsubRows(); };
    }, [user, currentTeam]);

    // ── 표시 데이터 결정 (pending > local > firebase) ────────────────────
    // pending: 방금 업로드, 아직 저장 안 함
    // local  : IndexedDB에 임시 저장된 것
    // firebase: 확정 저장된 것
    // 연도별 1:1 헤더 벌 (2026-08-21 팀장님): 그 연도 전용 헤더(meta.byYear)가 있으면 그것, 없으면 팀 공통 헤더 (기술2·3팀 = 종전 그대로)
    const _yearMeta       = (!pendingData && !localData && selectedYear && fbByYear && fbByYear[selectedYear]) ? fbByYear[selectedYear] : null;
    const _rawHeaders     = pendingData?.headers   || localData?.headers   || (_yearMeta ? (_yearMeta.headers || fbHeaders) : fbHeaders);
    const _rawColGroups   = pendingData?.colGroups  || localData?.colGroups  || (_yearMeta ? (_yearMeta.colGroups || fbColGroups) : fbColGroups);
    // '관리자' 열 표시 제외 (2026-08-21 팀장님): 옛 파서가 자동 삽입해 둔 열 — 카드 파서옵션.관리자열=false 팀(기술1팀)만.
    //   클라우드 메타·행 값은 안 건드리는 표시 필터 → 카드 값을 되돌리면 즉시 복구.
    const _mgrOff         = teamProfile?.파서옵션?.관리자열 === false;
    // ★useMemo 필수 — 매 렌더 새 배열이면 activeHeaders를 지켜보는 useEffect(틀고정 실측 등)가 무한 반복 (2026-08-21 실기기)
    const activeHeaders   = useMemo(() => {
        if (!_mgrOff) return _rawHeaders;
        return (_rawHeaders || []).filter(h => String(h ?? '').replace(/\s+/g, '') !== '관리자');
    }, [_rawHeaders, _mgrOff]);
    const activeColGroups = useMemo(() => {
        if (!_mgrOff) return _rawColGroups;
        return (_rawColGroups || []).map(g => ({ ...g, cols: (g.cols || []).filter(c => String(c ?? '').replace(/\s+/g, '') !== '관리자') })).filter(g => (g.cols || []).length > 0);
    }, [_rawColGroups, _mgrOff]);
    // 3층 헤더 중간 라벨 (2026-08-24): 연도 별 우선, 없으면 팀 공통 — {열이름: 중간라벨}
    const activeColMids = useMemo(() => (_yearMeta && _yearMeta.colMids) || pendingData?.colMids || localData?.colMids || fbColMids || {}, [_yearMeta, pendingData, localData, fbColMids]);
    const activeRowsBase  = pendingData?.rows       || localData?.rows       || fbRows;
    const dataSource      = pendingData ? 'pending' : localData ? 'local' : 'firebase';
    // ★ 임시 편집(초안) (2026-08-27 팀장님): 메인표 키인·드롭다운은 즉시 저장하지 않고 여기에 모았다가 [저장 N칸]/Ctrl+S 때
    //   행별 1회 저장 — 팝업 [저장]과 같은 방식. 칸 1개당 쓰기 2~3회·저장 뒤 배경 작업(IndexedDB 왕복)이 칸마다 붙던 것을 1번으로.
    //   구조 { rowId: { patch:{칸:값(파생 칸 포함)}, orig:{칸:편집 시작 때 서버 값}, edited:{칸:내가 친 값}, entries:[변경이력] } }
    //   표에는 overlay로 즉시 보임(activeRows) · 서버 값(fbRows)은 그대로 → [취소]하면 원래대로.
    const [draft, setDraft] = useState({});
    const draftRef = useRef(draft); draftRef.current = draft;
    const [draftSaving, setDraftSaving] = useState(false);
    const draftCellCount = useMemo(() => Object.values(draft).reduce((n, d) => n + Object.keys(d.edited || {}).length, 0), [draft]);
    const activeRows = useMemo(() => {
        if (dataSource !== 'firebase' || !Object.keys(draft).length) return activeRowsBase;
        return activeRowsBase.map(r => draft[r._id] ? { ...r, ...draft[r._id].patch } : r);
    }, [activeRowsBase, draft, dataSource]);
    const activeRowsRef = useRef([]); activeRowsRef.current = activeRows;   // 클릭 핸들러(캐시된 행 렌더)에서도 최신 목록 (2026-08-28)
    const hasDraftCell = (rowId, key) => !!(draftRef.current[rowId] && draftRef.current[rowId].orig && Object.prototype.hasOwnProperty.call(draftRef.current[rowId].orig, key));
    const addDraft = (rowId, patch, orig, edited, entry) => {
        setDraft(prev => {
            const d = prev[rowId] || { patch: {}, orig: {}, edited: {}, entries: [] };
            const nOrig = { ...d.orig };
            Object.keys(orig).forEach(k => { if (!Object.prototype.hasOwnProperty.call(nOrig, k)) nOrig[k] = orig[k]; });
            return { ...prev, [rowId]: { patch: { ...d.patch, ...patch }, orig: nOrig, edited: { ...d.edited, ...edited }, entries: entry ? [...d.entries, entry] : d.entries } };
        });
    };
    const draftNavBlock = () => { setAlertMsg(`임시 편집 ${draftCellCount}칸이 아직 저장되지 않았습니다.\n\n헤더의 [저장 ${draftCellCount}칸] 또는 [취소]를 누른 뒤 이동해 주세요.`); };
    const guardNav = (fn) => () => { if (draftCellCount > 0) { draftNavBlock(); return; } fn && fn(); };
    // 초안 보관 — 이 PC(localStorage) 팀별. F5·재접속해도 노란 칸 유지 (2026-08-27)
    const draftKey = (t) => `pms_list_draft_${t}`;
    useEffect(() => {
        try { const s = localStorage.getItem(draftKey(currentTeam)); const d = s ? JSON.parse(s) : {}; setDraft(d && typeof d === 'object' ? d : {}); } catch (e) { setDraft({}); }
    }, [currentTeam]);
    useEffect(() => {
        try { if (Object.keys(draft).length) localStorage.setItem(draftKey(currentTeam), JSON.stringify(draft)); else localStorage.removeItem(draftKey(currentTeam)); } catch (e) {}
    }, [draft]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => {
        if (!draftCellCount) return;
        const onBU = (e) => { e.preventDefault(); e.returnValue = ''; return ''; };
        window.addEventListener('beforeunload', onBU);
        return () => window.removeEventListener('beforeunload', onBU);
    }, [draftCellCount]);
    const saveDraftRef = useRef(() => {});
    useEffect(() => {
        const onKey = (e) => { if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 's') { e.preventDefault(); saveDraftRef.current(); } };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    // ── 하위(공종) 행 규칙 (2026-07-16) ──────────────────────────────────────────
    //   판별 = 실행번호가 's' 또는 '-'로 시작 — 월간보고·진행실적 팝업·모바일과 완전히 같은 규칙.
    //   ※ 추후 팀 협의로 엑셀 원본에 하위 줄이 생겨도(실행번호 열에 s) 업로드만 하면 그대로 인식됨(코드 추가 불필요).
    const isSubListRow = (r) => { const e = String(r?.['실행번호'] || '').trim().toLowerCase(); return e === 's' || e.startsWith('-'); };
    // ── 2단계: 메인 POINT 총점 = 하위 합계 자동 (2026-07-20 팀장님 확정) ─────────────────
    //   · 하위(실행번호 s/-)가 있는 메인 행의 총점 = 하위 '포인트' 합 (파생 계산 — 저장 안 함, 그래프 실적 합산과 동일 방식)
    //   · 하위 총점이 전부 빈칸(합 0)이면 부모에 원래 입력된 총점 유지 (전환기 안전)
    //   · 손입력 잠금: 부모 메인표 POINT 칸(실적)·부모 상세팝업 '포인트'(총점) — 입력 입구는 진행실적 팝업·하위 행으로 통일
    const subPtByParent = useMemo(() => {
        const map = {};                                     // { 부모_id: { count, sum } } — 하위 있는 메인 행만 키 존재
        let lastMain = null;
        activeRows.forEach(r => {
            if (!isSubListRow(r)) { lastMain = r; return; }
            if (!lastMain) return;                          // 부모 없는 하위(비정상 데이터)는 합계 대상 아님
            const e = map[lastMain._id] || (map[lastMain._id] = { count: 0, sum: 0 });
            e.count += 1;
            e.sum = Math.round((e.sum + (Number(r['포인트'] ?? r['총']) || 0)) * 1000) / 1000;   // 소수 오차 방지
        });
        return map;
    }, [activeRows]);   // eslint-disable-line react-hooks/exhaustive-deps
    const getSubPt = (rowId) => subPtByParent[rowId] || null;   // 하위 없으면 null
    // 화면·그래프·엑셀 공통 '유효 총점' — 하위 합>0이면 합, 아니면 부모 자체 총점
    const effTotalPt = (row) => { const sp = getSubPt(row._id); const own = Number(row['포인트'] ?? row['총'] ?? row['총물량']) || 0; return sp && sp.sum > 0 ? sp.sum : own; };   // 총점 = '포인트'→'총'(2026-07-21)→'총물량'(기술1팀, 2026-08-19) 폴백
    // 프로젝트 이름이 표시되는 열 — └ 하위 마커 표시용
    const projectNameCol = useMemo(() => {
        const nameKeys = ['프로젝트명', '프로젝트', 'Project', '공사명', '건명', '명칭'];
        return nameKeys.find(k => activeHeaders.includes(k)) || activeHeaders.find(h => /프로젝트|공사|건명/.test(h)) || '';
    }, [activeHeaders]);

    // ── 열 고정 (2026-07-21 팀장님): 기본 = Project 열까지(번호·발주처·Project) — 엑셀 셀고정처럼 좌측 따라옴.
    //   헤더 더블클릭 = 그 열까지 고정/해제(기존 기능). 바꾼 설정은 이 PC에 팀별 기억(localStorage).
    const frozenKey = (t) => `pms_list_frozenUpTo_${t}`;
    useEffect(() => {
        if (!activeHeaders.length) return;
        let v = null;
        try { v = localStorage.getItem(frozenKey(currentTeam)); } catch (e) {}
        if (v === 'NONE') { setFrozenUpTo(null); return; }              // 사용자가 명시적으로 해제해 둔 상태
        if (v && activeHeaders.includes(v)) { setFrozenUpTo(v); return; } // 기억된 열
        // 기본값 = 팀 카드 '열.고정기본열' (2026-08-11): null=고정 없음(기술1팀 — 이름 열이 12번째라 절반이 고정되던 문제),
        //   '자동'/미지정=이름 열까지(기술2팀 현행 Project까지), 열 이름=그 열까지
        const dft = teamProfile?.열?.고정기본열;
        if (dft === null) { setFrozenUpTo(null); return; }
        if (typeof dft === 'string' && dft !== '자동' && activeHeaders.includes(dft)) { setFrozenUpTo(dft); return; }
        setFrozenUpTo(projectNameCol || null);                            // 기본: 이름 열까지 (기술2팀 현행)
    }, [currentTeam, projectNameCol, teamProfile]); // eslint-disable-line react-hooks/exhaustive-deps
    const toggleFreeze = (h) => setFrozenUpTo(p => {
        const nv = p === h ? null : h;
        try { localStorage.setItem(frozenKey(currentTeam), nv === null ? 'NONE' : nv); } catch (e) {}
        return nv;
    });
    // 우클릭 메뉴로 열 고정 지정/해제 (2026-07-21 팀장님)
    const freezeTo = (h) => {
        try { localStorage.setItem(frozenKey(currentTeam), h === null ? 'NONE' : h); } catch (e) {}
        setFrozenUpTo(h);
    };
    const [headerMenu, setHeaderMenu] = useState(null);   // { h, x, y } — 헤더 우클릭 메뉴
    // ★ 고정 열 오프셋 '실측' (2026-07-21): 표가 내용맞춤(한 줄 펼침)이라 저장 너비(getW) 누적과 실제 폭이 달라
    //   넓은 열(Project 등) 뒤로 고정하면 겹치는 버그 → 첫 데이터 행의 실제 위치(offsetLeft)를 재서 쓴다.
    const tbodyRef = useRef(null);
    // ★ 고정 열 오프셋은 React 상태가 아니라 표(<table>)의 CSS 변수(--frz-i)로 직접 기록 (2026-08-26 속도):
    //   종전엔 실측값을 state로 두어 값 하나 저장해도 열 폭이 2px 넘게 흔들리면 188행 전체 재렌더(≈430ms)가 따라왔다.
    //   셀은 left:var(--frz-i)만 들고 있고, 실측은 변수 값만 바꾼다 → 재실측이 행 재렌더를 일으키지 않는다.
    const frzVarsRef = useRef({});
    // 재실측 신호 (2026-08-18): 표는 sortedRows(칩·검색·정렬 반영)를 그리는데 아래 실측 의존성엔 전체(activeRows)만
    //   있어, 필터로 행이 줄어 내용맞춤 열이 좁아져도 옛 오프셋이 남았음(기술3팀 발주처↔Project 틈 벌어짐).
    //   sortedRows가 이 지점보다 뒤에 선언돼 직접 의존 불가 → 신호 값으로 연결.
    const [frzTick, setFrzTick] = useState(0);
    const [fitWidths, setFitWidths] = useState({});   // 기본 화면 맞춤 폭 (2026-08-21) — 수동 폭(colWidths)보다 낮은 우선순위
    const [fitTick, setFitTick] = useState(0);        // 창 크기 변경 신호
    const measureFrzRef = useRef(() => {});
    const measureFrz = () => {
        if (!frozenUpTo) {
            const tbl0 = tbodyRef.current ? tbodyRef.current.closest('table') : null;
            if (tbl0 && Object.keys(frzVarsRef.current).length) for (let i = 0; i < 64; i++) tbl0.style.removeProperty(`--frz-${i}`);
            frzVarsRef.current = {};
            return;
        }
        // 데이터 행만 실측 (2026-08-11): '불러오는 중/데이터 없음'은 colSpan 한 칸짜리 행이라
        //   그걸로 재면 발주처·Project 오프셋이 빠져 고정 열이 좁은 예비값으로 겹침 → 번호 잘림.
        let tr = null;
        if (tbodyRef.current) {
            for (const cand of tbodyRef.current.querySelectorAll('tr')) {
                const first = cand.children[0];
                if (first && (!first.colSpan || first.colSpan <= 1)) { tr = cand; break; }
            }
        }
        if (!tr) return;
        const tds = tr.children;
        const map = {};
        const F = mainVisibleHeaders.indexOf(frozenUpTo);
        if (F >= 0 && F + 1 < tds.length && F + 1 < mainVisibleHeaders.length) {
            // ★측정 방식 교체 (2026-08-18 기술3팀 '진행중 칩' 깨짐의 진짜 원인):
            //   고정(sticky) 셀의 offsetLeft는 가로 스크롤 중엔 '붙어 있는 위치'를 돌려줘서,
            //   스크롤된 상태에서 재측정하면 옛 고정 위치가 그대로 다시 나옴(재측정 무효).
            //   → 오염 없는 값만 사용: 첫 비고정 셀(자연 위치)에서 고정 셀들의 너비(offsetWidth,
            //   스크롤·고정과 무관)를 거꾸로 빼며 자연 위치를 복원. 첫 칸=0 정규화는 동일.
            let x = tds[F + 1].offsetLeft;
            for (let i = F; i >= 0; i--) { x -= tds[i].offsetWidth; map[mainVisibleHeaders[i]] = x; }
            const b = map[mainVisibleHeaders[0]];
            Object.keys(map).forEach(k => { map[k] = Math.round(map[k] - b); });
        } else {
            // 폴백(마지막 열까지 고정 등 비고정 셀이 없을 때): 기존 방식 — 첫 칸 기준 정규화
            const base = tds.length ? tds[0].offsetLeft : 0;
            for (let i = 0; i < mainVisibleHeaders.length && i < tds.length; i++) {
                map[mainVisibleHeaders[i]] = tds[i].offsetLeft - base;
                if (mainVisibleHeaders[i] === frozenUpTo) break;
            }
        }
        {
            const prev = frzVarsRef.current, keys = Object.keys(map);
            // ±2px 허용 오차 — sticky 적용 시 테두리 반올림으로 1~2px 오가는 값에 반응하지 않음
            const same = keys.length === Object.keys(prev).length && keys.every(k => Math.abs((prev[k] ?? -9999) - map[k]) <= 2);
            if (!same) {
                const tbl1 = tbodyRef.current.closest('table');
                mainVisibleHeaders.forEach((h, i) => { if (map[h] !== undefined) tbl1.style.setProperty(`--frz-${i}`, `${map[h]}px`); });
                frzVarsRef.current = map;
            }
        }
    };
    measureFrzRef.current = measureFrz;
    // ★ 구조 변경(열구성·너비·배율·컴팩트·맞춤) = 즉시(레이아웃 효과) — 어긋난 화면이 한 프레임도 보이면 안 되는 경우
    useLayoutEffect(() => { measureFrzRef.current(); }, [frozenUpTo, activeHeaders, hiddenCols, colWidths, tableScale, compactMode, fitWidths]); // eslint-disable-line react-hooks/exhaustive-deps
    // ★ 값 변경(행 데이터·표시행 신호) = 0.4초 뒤 (2026-08-26 속도): 커밋 중 offsetLeft 읽기 = 표 전체 강제 배치(≈290ms)라 저장 직후
    //   프레임을 막았음. 브라우저가 그리기용 배치를 끝낸 뒤 읽으면 비용 0. (이전의 '매 렌더 실측'은 무한루프 원인이라 금지)
    useEffect(() => { const t = setTimeout(() => measureFrzRef.current(), 400); return () => clearTimeout(t); }, [activeRows, frzTick]);

    // ── 기본 화면 맞춤 (2026-08-21 팀장님): 손대지 않은 기본 상태에서 카드 '기본맞춤.까지열'(기술1팀 2026 = 발주처 담당자)까지
    //    화면 100% 폭에 들어오게 비례 축소. 글자는 잘려도 됨(한 줄·말줄임 col-clip). 손잡이로 고친 열(colWidths)은 그대로, 나머지만 축소.
    //    ★무한루프 방지: (연도·열구성·배율·컴팩트·창폭·행수·수동폭) 키가 바뀔 때만 — 1패스: 맞춤 비워 자연 폭으로 그림 → 2패스: 실측·계산 → 이후 같은 키면 무시.
    const fitKeyRef = useRef('');
    // ★ 자연 폭 캐시 (2026-08-26 속도): 열의 자연 폭은 창 폭(W)과 무관 → 한 번 재 두면 창 폭이 바뀌어도
    //   '맞춤 해제→자연 폭으로 전체 재렌더(1패스)' 없이 바로 계산 (재맞춤 전체 재렌더 2회→1회, 틀고정 실측도 1회 감소).
    //   캐시 키 = 연도·열구성·배율·컴팩트·행수 (W 제외). 값(글자)이 바뀌어도 열 자연 폭이 달라질 수 있으나 기본맞춤은
    //   '대략 화면에 들어오게'가 목적이라 행수 같으면 재측정 안 함(수동 폭 손잡이·행 추가 시 자동 재측정).
    const natCacheRef = useRef({ key: '', nat: null });
    const fitWRef = useRef({ key: '', W: 0 });   // 창 폭 캐시 — 값 저장마다 getBoundingClientRect(강제 배치) 안 읽게 (2026-08-26)
    useEffect(() => { const onR = () => setFitTick(t => t + 1); window.addEventListener('resize', onR); return () => window.removeEventListener('resize', onR); }, []);
    useLayoutEffect(() => {
        const cfg = teamProfile?.기본맞춤;
        const on = !!cfg && (!Array.isArray(cfg.연도) || cfg.연도.includes(String(selectedYear || '')));
        if (!on) { if (Object.keys(fitWidths).length) setFitWidths({}); fitKeyRef.current = ''; return; }
        const target = aliasCol(cfg.까지열);
        const tbl = tbodyRef.current ? tbodyRef.current.closest('table') : null;
        const wrap = tbl ? tbl.parentElement : null;
        if (!target || !wrap) return;
        const z = (tableScale || 100) / 100;
        const wKey = [fitTick, tableScale, compactMode, mainVisibleHeaders.join('|'), selectedYear, currentTeam].join('#');
        let W;
        if (fitWRef.current.key === wKey) W = fitWRef.current.W;
        else { W = Math.floor(wrap.getBoundingClientRect().width / z) - 2; fitWRef.current = { key: wKey, W }; }
        if (W <= 0) return;
        // 키에 수동 폭(colWidths)은 넣지 않음 — 손잡이 드래그 중 매 픽셀마다 재맞춤·깜빡임 방지. 수동 폭은 계산 때 '고정'으로만 취급.
        const natKey = [selectedYear, mainVisibleHeaders.join('|'), tableScale, compactMode, activeRows.length].join('#');
        const key = natKey + '#' + W;
        if (fitKeyRef.current === key) return;
        let nat = natCacheRef.current.key === natKey ? natCacheRef.current.nat : null;
        if (!nat) {
            // 자연 폭을 모를 때만: 맞춤 해제 → 자연 폭으로 다시 그린 뒤 재진입해 실측 (1패스)
            if (Object.keys(fitWidths).length) { setFitWidths({}); return; }
            nat = {};
            tbl.querySelectorAll('thead th[data-col]').forEach(th => { nat[th.getAttribute('data-col')] = th.getBoundingClientRect().width / z; });
            natCacheRef.current = { key: natKey, nat };
        }
        const idx = mainVisibleHeaders.indexOf(target);
        fitKeyRef.current = key;
        if (idx < 0) return;
        const cols = mainVisibleHeaders.slice(0, idx + 1);
        let fixed = 0, flex = 0;
        cols.forEach(h => { const w = nat[h] || getW(h) || 40; if (colWidths[h]) fixed += w; else flex += w; });
        if (fixed + flex <= W || flex <= 0) {   // 이미 다 들어옴 — 맞춤 없음 (적용돼 있던 축소는 해제)
            if (Object.keys(fitWidths).length) { setFitWidths({}); }
            return;
        }
        const scale = Math.max(0, W - fixed) / flex;
        const next = {};
        // %표기 칸('35%')은 압축돼도 안 잘리게 최소 44px (2026-09-01 팀장님 — 표시.퍼센트표기열·막대제거)
        const pctMinCols = [...(teamProfile?.표시?.퍼센트표기열 || []), ...(teamProfile?.표시?.막대제거 || [])].map(c => String(c).replace(/\s+/g, ''));
        cols.forEach(h => { if (colWidths[h]) return; const w = nat[h] || getW(h) || 40; const mn = pctMinCols.includes(String(h).replace(/\s+/g, '')) ? 44 : 28; next[h] = Math.max(mn, Math.floor(w * scale)); });
        const sameFit = Object.keys(next).length === Object.keys(fitWidths).length && Object.keys(next).every(k => fitWidths[k] === next[k]);
        if (sameFit) return;   // 결과 동일 → 재렌더 생략
        setFitWidths(next);
    }, [selectedYear, activeHeaders, hiddenCols, tableScale, compactMode, colWidths, fitTick, activeRows, fitWidths]); // eslint-disable-line react-hooks/exhaustive-deps

    // (2026-06-27) 엑셀 전체 항목 표시 — 기본 자동 숨김 제거.
    //   담당자가 필요없는 항목은 상세팝업의 표시/숨김 토글로 끄면 메인표에서 빠짐(hiddenCols).


    // ── 외부(업무현황)에서 이동 시 실행번호 행 하이라이트 ────────────────
    useEffect(() => {
        if (!highlightExecNo || !activeRows.length) return;
        if (appliedHighlightRef.current === highlightExecNo) return; // 이미 적용됨
        const target = activeRows.find(r => String(r['실행번호'] || '') === String(highlightExecNo));
        if (!target) return;
        appliedHighlightRef.current = highlightExecNo;
        setSelectedRowId(target._id);
        setHighlightedRowId(target._id);
        const t1 = setTimeout(() => {
            const el = document.querySelector(`[data-row-id="${target._id}"]`);
            if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
            // 창 렌더 중이라 아직 안 그려진 행 → 위치를 계산해 스크롤(창이 따라 이동) 후 재시도 (2026-08-27)
            if (winOnRef.current && winWrapRef.current) {
                const idx = (sortedRowsRef.current || []).findIndex(r => r._id === target._id);
                if (idx >= 0) {
                    winWrapRef.current.scrollTop = Math.max(0, idx * (winRowHRef.current || 30) - winWrapRef.current.clientHeight / 2);
                    setTimeout(() => { const el2 = document.querySelector(`[data-row-id="${target._id}"]`); if (el2) el2.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 450);
                }
            }
        }, 300);
        const t2 = setTimeout(() => setHighlightedRowId(null), 4000);
        return () => { clearTimeout(t1); clearTimeout(t2); };
    }, [highlightExecNo, activeRows]); // eslint-disable-line

    // ── 콤보박스 외부 클릭 닫기 ──────────────────────────────────────────
    useEffect(() => {
        const handler = e => {
            if (openFilter && filterRefs.current[openFilter] && !filterRefs.current[openFilter].contains(e.target)) {
                setOpenFilter(null);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [openFilter]);

    // 날짜 표시 통일 — 비표준('6/8','5-21' 등)도 기준월 연도를 붙여 YYYY-MM-DD로 표준화.
    //   표시·클릭편집·미변경판정에 공용. 데이터는 사용자가 수정 저장할 때만 표준값으로 바뀜 (2026-06-29)
    const displayDate = (val, rowYear) => {
        const s = String(val ?? '').trim();
        if (!s) return '';
        const std = toDateInputVal(s);                   // YYYY-MM-DD / YYYY.M.D / YYMMDD → 표준
        if (std) return std;
        const md = s.match(/^(\d{1,2})[./-](\d{1,2})$/); // 'M/D','M-D','M.D' (연도 없음)
        if (md) {
            // 연도 없는 날짜의 연도 = ①그 행의 연도(_year) ②기준 날짜 ③올해 — 과거 연도 행이 전부 올해(26)로 보이던 문제 수리 (2026-08-21 팀장님)
            const yr = /^\d{4}$/.test(String(rowYear || '')) ? String(rowYear)
                : (baseDate && /\d{4}/.test(baseDate)) ? baseDate.match(/\d{4}/)[0] : String(new Date().getFullYear());
            return `${yr}-${md[1].padStart(2,'0')}-${md[2].padStart(2,'0')}`;
        }
        return s;
    };
    // 날짜 '표시' 형식 = YY/MM/DD (2026-08-19 팀장님 협의: 엑셀에 어떤 표기든 이 형식으로 통일해 표현).
    //   ★표시만 — 데이터 저장·달력 편집·비교판정은 기존 표준(YYYY-MM-DD) 그대로. 날짜로 해석 안 되는 값('?' 등)은 원본 표시.
    const fmtDate = (val, rowYear) => {
        const std = displayDate(val, rowYear);
        const m = String(std).match(/^(\d{4})-(\d{2})-(\d{2})$/);
        return m ? `${m[1].slice(2)}/${m[2]}/${m[3]}` : std;
    };

    // 공사진행 % 칸(포인트 제외) — 표시: 숫자에 % 자동 / 편집: % 떼고 숫자만. 데이터는 숫자로 저장 (2026-06-29 팀장님)
    const isPctCol = (h) => { const s = String(h).replace(/\s/g,''); if (s.includes('포인트') || /point/i.test(s)) return false; return ['도면입수','I/OMap','IOMap','화면작성','기준정보','PLC','ETOS','HMI','시운전','진행율'].some(k=>s.includes(k)); };   // '진행율' = 기술2팀 260822 (%·막대, 포인트·Point는 위에서 제외)
    const pctDisplay = (h, val) => { if (!isPctCol(h)) return val; const s = String(val ?? '').trim(); if (!s || s.endsWith('%')) return s; return /^-?\d+(\.\d+)?$/.test(s) ? s + '%' : s; };
    // ── 기술1팀 수식 (2026-08-19 팀장님 협의 — 팀 카드 '수식', 지정 연도 행만) ──
    //   자체 시운전 = 금월÷총물량% · 누적 = 지난달까지(_accBase)+금월 · 금월(2) = (PLC+ETOS+HMI+자체)÷4 · 전체 = 지난달까지(_pctBase)+금월(2) [누적]
    //   전월·전월(2)은 [월간 마감] 때만 이동. _accBase = 마감 시점의 누적(내부 필드).
    const fmCfg = teamProfile?.수식 || null;
    const fmActive = (row) => !!fmCfg && (!Array.isArray(fmCfg.연도) || fmCfg.연도.includes(String(row?._year || '')));
    const fmNorm = (v) => String(v ?? '').replace(/\s+/g, '');
    const fmCol = (nm) => (activeHeaders || []).find(h => fmNorm(h) === fmNorm(nm)) || nm;
    const fmNum = (v) => { const n = parseFloat(String(v ?? '').replace(/[%,]/g, '')); return Number.isFinite(n) ? n : 0; };
    const fmAutoSet = new Set((fmCfg && fmCfg.자동 ? fmCfg.자동 : []).map(fmNorm));
    const fmTrigSet = new Set((fmCfg && fmCfg.트리거 ? fmCfg.트리거 : []).map(fmNorm));
    const isFmAutoCell = (row, h) => fmActive(row) && fmAutoSet.has(fmNorm(h));
    // 자동 칸 '보이는 표시' (2026-08-20 팀장님): 헤더 '자동' 칩 — 기준연도가 수식 대상 연도일 때만
    const fmHdrAuto = (h) => !!fmCfg && fmAutoSet.has(fmNorm(h)) && (!Array.isArray(fmCfg.연도) || fmCfg.연도.includes(String(selectedYear || '')));
    // ── 진행율 자동 (2026-08-24 팀장님, 기술2팀 260822 — 카드 '진행율자동'): 진행율% = Point ÷ 포인트(Total) ×100 ──
    //   포인트·Point 키인 시 재계산 · 자동 칸 표시/잠금 · 적재 시(parseSheetExact)에도 같은 식으로 계산.
    //   건설 공사(NAS 연동 행)는 기존처럼 NAS 진척 엑셀이 원장 — NAS가 Point를 갱신하면 이 식이 그대로 따라감 (같은 수식).
    const paCfg = teamProfile?.진행율자동 || null;
    const paActive = (row) => !!paCfg && (!Array.isArray(paCfg.연도) || paCfg.연도.includes(String(row?._year || '')));
    const paCol = (nm) => (activeHeaders || []).find(h => fmNorm(h) === fmNorm(nm)) || null;
    const isPaAutoCell = (row, h) => paActive(row) && paCol(paCfg.결과열) === h;
    const paTrigger = (h) => !!paCfg && [paCfg.분자열, paCfg.분모열].some(nm => paCol(nm) === h);
    const paHdrAuto = (h) => !!paCfg && fmNorm(paCfg.결과열) === fmNorm(h) && (!Array.isArray(paCfg.연도) || paCfg.연도.includes(String(selectedYear || '')));
    const paRecalc = (row) => {
        if (!paActive(row)) return {};
        const rc = paCol(paCfg.결과열); if (!rc) return {};
        // 분모: 저장값 → 없으면 유효 총점(하위 Σ 포함) — 건설 공사는 포인트 저장값이 빈칸(총점=하위 합)이라
        // 팝업 저장 때 den 0 → NAS가 넣어준 %를 지우던 버그 (2026-08-25, 010 실측. NAS 식 누적÷Σ총점과 통일)
        const den = fmNum(row[paCol(paCfg.분모열)]) || effTotalPt(row);
        const numS = String(row[paCol(paCfg.분자열)] ?? '').trim();
        return { [rc]: (den > 0 && numS !== '') ? String(Math.round(fmNum(numS) / den * 1000) / 10) : '' };
    };
    const fmRecalc = (row, baseRow) => {   // 트리거 칸 수정 후의 자동 칸 값 일괄 계산 → patch. baseRow = 수정 전 행
        if (!fmActive(row)) return {};
        const cAcc = fmCol('누적'), cSelf = fmCol('자체 시운전');
        const tot = fmNum(row[fmCol('총물량')]), cur = fmNum(row[fmCol('금월')]);
        const b = baseRow || row;
        const base = (row._accBase !== undefined && row._accBase !== null && row._accBase !== '')
            ? (Number(row._accBase) || 0)
            : fmNum(b[cAcc]) - fmNum(b[fmCol('금월')]);   // ★수정 전 행의 누적−금월 = '지난달까지' (새 금월로 역산하면 틀림 — 시뮬 검출)
        const acc = Math.round((base + cur) * 10) / 10;
        const self = tot > 0 ? Math.round(cur / tot * 1000) / 10 : '';   // 금월÷총물량 %
        const avg = Math.round((fmNum(row[fmCol('PLC')]) + fmNum(row[fmCol('ETOS T/S')]) + fmNum(row[fmCol('HMI')]) + (self === '' ? 0 : self)) / 4 * 10) / 10;
        // 공정률 '전체' = 누적 (2026-08-19 팀장님: 전체=누적과 같은 뜻 — 지난달까지(_pctBase) + 금월 평균)
        const pctBase = (row._pctBase !== undefined && row._pctBase !== null && row._pctBase !== '')
            ? (Number(row._pctBase) || 0)
            : fmNum(b[fmCol('전체')]) - fmNum(b[fmCol('금월 (2)')]);   // 최초엔 엑셀 전체−금월
        const pctAll = Math.round((pctBase + avg) * 10) / 10;
        const z0 = (n) => (n === 0 ? '' : String(n));   // 0 = 빈칸 (2026-08-28, 8/27 '0=지우기' 통일 — 빈 행 자동 칸이 0으로 채워지지 않게)
        return { [cAcc]: z0(acc), [cSelf]: self === '' ? '' : z0(self), [fmCol('전체')]: z0(pctAll), [fmCol('금월 (2)')]: z0(avg), _accBase: base, _pctBase: pctBase };
    };
    // ── 월간 마감 스냅샷 (2026-08-13 팀장님 확정 b안: 담당자가 값 확인 후 버튼으로 '찰칵') ──
    //   월간보고(웹) 전월/금월/증감의 근거. 팀 카드 '월간마감' 팀만 노출(기술1팀). 달마다 문서 1개, 재실행=덮어쓰기(확인창).
    const handleMonthlyClose = async () => {
        setSettingsOpen(false);
        if (dataSource !== 'firebase') { setAlertMsg('엑셀 미리보기(미저장) 상태에서는 월간 마감을 할 수 없습니다.\n확정 저장 후 진행하세요.'); return; }
        const now = new Date();
        // ★ 마감 대상 달 선택 (2026-09-01 팀장님: 9/1에 눌렀더니 '2026-09'로 떠 혼란 — 월초에 하는 마감은 '지난달' 결과 확정):
        //   월초(1~10일) 기본값 = 지난달, 그 외 = 이번 달. 창에서 YYYY-MM을 고칠 수도 있음. 스냅샷 키·롤오버 모두 이 달로.
        //   ※ 12월 마감은 해가 바뀌기 전(12월 중)에 실행 권장 — 1월에 지난달(작년 12월)로 마감하면 당해 연도 행 필터와 어긋남.
        const _d0 = new Date(now.getFullYear(), now.getMonth() - (now.getDate() <= 10 ? 1 : 0), 1);
        const ymDef = `${_d0.getFullYear()}-${String(_d0.getMonth() + 1).padStart(2, '0')}`;
        const ymIn = window.prompt(
            `[월간 마감] 어느 달의 확정값으로 저장할까요? (YYYY-MM)\n\n· 지금 화면의 값이 '그 달의 결과'로 사진 찍혀 저장됩니다\n· 월초(1~10일)에 누르면 지난달 마감이 기본입니다 — 보통 그대로 [확인]`,
            ymDef);
        if (ymIn === null) return;
        const ym = String(ymIn).trim();
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ym)) { setAlertMsg(`달 형식이 올바르지 않습니다: "${ymIn}"\n예: 2026-08`); return; }
        const _cyMc = String(now.getFullYear());
        const mains = activeRows.filter(r => !isSubListRow(r) && String(r._year || _cyMc) === _cyMc);   // 당해 연도만 — 월간보고=당해 (2026-08-24 3팀 통일)
        if (!mains.length) { setAlertMsg('마감할 데이터가 없습니다.'); return; }
        const pick = (r, key) => { const k = key.replace(/\s/g, ''); const h = activeHeaders.find(x => String(x).replace(/\s/g, '') === k); return h ? (r[h] ?? '') : ''; };
        const rows = {};
        mains.forEach(r => {
            // 전 열 스냅샷(팀 공통 — 기술2·3팀은 열 이름이 달라서, 2026-08-24) + 기술1팀 월간보고 화면이 읽는 명명 키 유지(호환)
            const snap1 = {};
            (activeHeaders || []).forEach(h => { snap1[h] = r[h] ?? ''; });
            rows[r._pid || r._id] = {
                ...snap1,
                수행번호: pick(r, '수행번호'), 공사명: pick(r, '공사명'),
                PLC: pick(r, 'PLC'), 'ETOS T/S': pick(r, 'ETOS T/S'), HMI: pick(r, 'HMI'),
                '자체 시운전': pick(r, '자체 시운전'), '통합 시운전': pick(r, '통합 시운전'),
                총물량: pick(r, '총물량'), 누적: pick(r, '누적'), 공정률전체: pick(r, '전체'),
                계약: pick(r, '계약'), 작업: pick(r, '작업'), 납품: pick(r, '납품'),
            };
        });
        try {
            const ref = snapshotDocRef(currentTeam, ym);
            const prev = await getDoc(ref);
            const msg = prev.exists()
                ? `[월간 마감] ${ym} — 이미 마감본이 있습니다(${String(prev.data().savedAt || '').slice(0, 16)} 저장).\n지금 List 값 ${mains.length}건으로 덮어쓸까요?`
                : `[월간 마감] ${ym}\n\n지금 List의 값 ${mains.length}건을 ${ym}의 확정값으로 저장합니다.\n(월간보고의 전월/금월/증감 계산 근거 — 엑셀의 '시트 복사'와 같은 역할)\n\n진행할까요?`;
            if (!window.confirm(msg)) return;
            await setDoc(ref, { ym, savedAt: new Date().toISOString(), savedBy: user?.email || '', count: mains.length, rows });
            // ★ 수식 팀 롤오버 (2026-08-19 팀장님 확정: [월간 마감] 버튼 때 달 전환) —
            //   전월=금월 · 전월(2)=금월(2) · _accBase=누적(지난달까지 확정) · 금월 비움 → 자동 칸 재계산
            if (fmCfg) {
                const cCur = fmCol('금월'), cPrev = fmCol('전월'), cAcc2 = fmCol('누적'), cCurP = fmCol('금월 (2)'), cPrevP = fmCol('전월 (2)');
                let rolled = 0;
                for (const r of mains) {
                    if (!fmActive(r)) continue;
                    // 마감 = 이 달 확정: 전월←금월 · 누적/전체 베이스 확정 · 금월성 칸(금월·PLC·ETOS·HMI) 비움 → 새 달 0부터 (2026-08-19 팀장님 확정)
                    const roll = { [cPrev]: r[cCur] ?? '', [cPrevP]: r[cCurP] ?? '', [cCur]: '',
                        [fmCol('PLC')]: '', [fmCol('ETOS T/S')]: '', [fmCol('HMI')]: '',
                        _accBase: fmNum(r[cAcc2]), _pctBase: fmNum(r[fmCol('전체')]) };
                    const patch2 = { ...roll, ...fmRecalc({ ...r, ...roll }, r) };
                    const { _id: rid, ...rest2 } = r;
                    await setDoc(rowDocRef(currentTeam, rid), stampSave({ ...rest2, ...patch2 }), { merge: true });
                    rolled++;
                }
                if (rolled) addLog(`[월간 마감] 금월→전월 이동 ${rolled}건 (수식 팀)`);
            }
            logAudit(currentTeam, { who: user?.email || '', action: AUDIT_ACTIONS.EDIT, projectName: '(월간 마감)',
                note: `월간 마감 스냅샷 저장: ${ym} · ${mains.length}건${prev.exists() ? ' (덮어쓰기)' : ''}` });
            setAlertMsg(`월간 마감 완료!\n\n${ym} 확정값 ${mains.length}건이 저장되었습니다.`);
            addLog(`[월간 마감] ${ym} ${mains.length}건 저장`);
        } catch (e) { setAlertMsg(`월간 마감 실패: ${e.message}`); }
    };

    // 시운전%·공정률 칸 = 막대+굵은 숫자 (2026-08-11 승인 시안 — 간부가 제일 먼저 보는 칸을 제일 크게. 100% 도달=초록)
    //   표시 전용: 셀 편집·저장·엑셀 생성은 원래 숫자 값 그대로. PLC·ETOS·HMI 등 세부 %는 숫자만 굵게.
    const pctCell = (h, val) => {
        const disp = pctDisplay(h, val);
        const s = String(h).replace(/\s/g, '');
        // 팀 카드 '표시.퍼센트표기열' (2026-09-01 팀장님, 기술1팀 공정률[%] 전체·전월·금월): 숫자+% 표기
        const pctTxt = teamProfile?.표시?.퍼센트표기열;
        if (Array.isArray(pctTxt) && pctTxt.some(c => String(c).replace(/\s/g, '') === s)) {
            const n0 = parseFloat(String(val ?? '').replace(/%/g, ''));
            if (!isFinite(n0)) return disp;
            return <span style={{ fontWeight: 600 }}>{n0}<span style={{ fontSize: '10px', fontWeight: 700, color: '#a4a097' }}>%</span></span>;
        }
        if (!isPctCol(h)) return disp;
        const num = parseFloat(String(val ?? '').replace(/%/g, ''));
        if (!isFinite(num)) return disp;
        if (!(s.includes('시운전') || s.includes('공정률'))) return <span style={{ fontWeight: 600 }}>{disp}</span>;
        const w = Math.max(0, Math.min(100, num));
        const full = num >= 100;
        // 팀 카드 '표시.막대제거' (2026-09-01 팀장님, 기술1팀 자체 시운전): 막대 없이 숫자+%만
        const noBar = teamProfile?.표시?.막대제거;
        if (Array.isArray(noBar) && noBar.some(c => String(c).replace(/\s/g, '') === s)) {
            return <span style={{ fontWeight: 600 }}>{disp}</span>;   // PLC·HMI와 동일 표기 (2026-09-01 팀장님)
        }
        return (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                <span style={{ position: 'relative', width: 44, height: 7, background: '#edeae6', borderRadius: 9999, overflow: 'hidden', flex: 'none' }}>
                    <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: w + '%', background: full ? '#059669' : '#1e7ac8', borderRadius: 9999 }}/>
                </span>
                <span style={{ fontWeight: 800, fontSize: '12.5px', color: full ? '#047857' : '#1e5f9e' }}>{num}<span style={{ fontSize: '10px', fontWeight: 700, color: '#a4a097' }}>%</span></span>
            </span>
        );
    };
    // 프로젝트별 '미적용' 항목 (2026-07-21): _naItems(헤더명 배열)에 든 공정/시운전 칸 = 이 프로젝트엔 해당 없음 → 메인표 회색 ×
    // ★ 기본 미적용 (2026-07-21 팀장님): 엑셀에 열이 없는 진행 항목(도면입수·I/O Map·화면작성·기준정보·자체시운전 등)은
    //   전 프로젝트 기본 off — 상세팝업에서 켠 항목(_naOn)만 예외. 기본값 방식이라 기존 행·신규 행·엑셀 재업로드 전부 자동 적용.
    const PROG_NA_ALL = ['도면입수', 'I/O Map', '화면작성', '기준정보', 'PLC', 'ETOS', 'HMI', '자체시운전', '통합시운전'];
    const _naNorm = (v) => String(v ?? '').replace(/\s+/g, '').toUpperCase();
    const defaultNaItems = PROG_NA_ALL.filter(name => !(activeHeaders || []).some(h => !String(h).startsWith('_') && _naNorm(h).includes(_naNorm(name))))
        // 팀 통합열 별칭 (2026-08-25 팀장님: 기술2·3팀 통합시운전 기본 ON) — 통합열('진행율 %')이 표에 있으면 통합시운전은 '열 있음' 취급
        .filter(name => !(name === '통합시운전' && teamProfile?.시운전?.통합열 && (activeHeaders || []).some(h => _naNorm(h) === _naNorm(teamProfile.시운전.통합열))));
    const naItemsOf = (row) => {
        const ex = Array.isArray(row && row._naItems) ? row._naItems : [];
        const on = Array.isArray(row && row._naOn) ? row._naOn : [];
        // 팀 카드 '기본미적용' (2026-08-19 팀장님, 기술1팀 통합 시운전): 지정 연도 행만 기본 off — 켬(_naOn)이 예외
        const pf = teamProfile?.기본미적용;
        const pfItems = (pf && Array.isArray(pf.항목) && (!Array.isArray(pf.연도) || pf.연도.includes(String(row?._year || '')))) ? pf.항목 : [];
        return [...new Set([...ex, ...defaultNaItems.filter(n => !on.includes(n)), ...pfItems.filter(n => !on.includes(n))])];
    };
    const isNaItemCell = (row, h) => isPctCol(h) && naItemsOf(row).includes(h);
    // _naItems(헤더명) → progressItems({설정키:false}) — 진행실적 팝업·실적 그래프 계산에서 미적용 항목 제외 (2026-07-21)
    const naToProgressItems = (row) => {
        const na = naItemsOf(row);
        if (!na.length) return undefined;
        const pi = {};
        na.forEach(h => {
            const k = progItemKeyOf(h);
            const c = String(h).replace(/\s/g, '');
            if (k) pi[k] = false;
            else if (c.includes('자체시운전')) pi.internalTest = false;
            else if (c.includes('통합시운전')) pi.integratedTest = false;
        });
        return Object.keys(pi).length ? pi : undefined;
    };
    // 포인트 칸 — 메인표에서 '실적/만점' 형식. 만점=상세팝업 row['포인트'](고정), 실적=row['포인트실적'](메인표 입력/진행실적) 2026-06-29
    const isPointCol = (h) => {
        const s = String(h).replace(/\s/g,'');
        // 시운전 실적 칸(팀 카드 누적열 — 기술2팀 260822 'Point')은 총점 아님: Σ하위합 표시·잠금 대상에서 제외 (2026-08-24 팀장님: Point 칸에 총점 합 17230이 잘못 표시되던 버그)
        const acc = String(teamProfile?.시운전?.누적열 || '').replace(/\s/g,'');
        if (acc && acc !== '포인트' && s.toUpperCase() === acc.toUpperCase()) return false;
        return s === '포인트' || /^point$/i.test(s);
    };
    // 번호 칸 판별 — 정확히 '번호'만 (실행번호·전화번호 등 제외). 값 패딩은 padProjectNo (2026-07-20)
    const isProjNoCol = (h) => ['번호', '순번'].includes(String(h).replace(/\s/g, ''));   // '순번'(기술1팀)도 3자리 통일 (2026-08-27 팀장님: 설정 [번호 3자리 정리]가 순번을 못 찾던 문제)

    const getW = h => {
        if (colWidths[h]) return colWidths[h];
        if (fitWidths[h]) return fitWidths[h];   // 기본 화면 맞춤 (2026-08-21)
        // 공사진행 % / O체크 칸들 — 그룹 멤버십 누락과 무관하게 60 통일 (헤더 기준).
        //   도면입수·I/O Map·화면작성·기준정보·PLC·ETOS·HMI·자체/통합시운전·포인트 (2026-06-29 팀장님: 연관 칸 한 번에 통일)
        const _hsw = String(h).replace(/\s/g, '');
        if (_hsw.includes('포인트') || /POINT/i.test(_hsw)) return 88;
        const PROG_NARROW = ['도면입수', 'I/OMap', 'IOMap', '화면작성', '기준정보', 'PLC', 'ETOS', 'HMI', '시운전', '포인트', 'POINT'];
        if (PROG_NARROW.some(k => _hsw.includes(k))) return 60;
        // '공사진행' 그룹 내 날짜 열 → 80(YYYY-MM-DD 통일표시 수용), 내용 열 → 크게
        const inProgressGrp = activeColGroups.some(g =>
            (g.label?.includes('공사진행') || g.label?.includes('공사 진행')) && g.cols.includes(h)
        );
        if (inProgressGrp) {
            if (isDateCol(h) || h.includes('날짜') || h.includes('일자')) return 80;
            if (h.includes('내용') || h.includes('내역') || h.includes('비고')) return 210; // 긴 텍스트
            return 60; // PLC·ETOS·HMI·시운전·포인트 등 짧은 % 값 → 좁게 (2026-06-26)
        }
        // 날짜 열 (공사계약·공사완료) — 2025-11-25 형태가 들어가게 넓힘 (2026-06-26 ①)
        if (isDateCol(h)) return 80;
        // 열별 고정 너비
        if (isStatusCol(h)) return 54;
        if (h === '번호' || (h.includes('번호') && !h.includes('전화') && !h.includes('사업'))) return 22;
        if (h.includes('업체') && h.includes('담당자')) return 42;
        if (h.includes('발주처')) return 48;
        if (h.includes('담당자') && !h.includes('업체')) return 48;
        if ((h.includes('Project') || h.includes('프로젝트')) && !isDateCol(h)) return 280;
        // 헤더 텍스트 기반 최소 폭 (한글 13px, 영문·숫자 8px + 여백 20px)
        const korCnt = (h.match(/[가-힣]/g) || []).length;
        const etcCnt = h.replace(/[가-힣]/g, '').length;
        return Math.max(44, korCnt * 13 + etcCnt * 8 + 20);
    };

    // ── 리사이즈 ──────────────────────────────────────────────────────────
    const startResize = (h, e) => {
        e.preventDefault();
        e.stopPropagation();
        // 배율(zoom) 보정 — 화면에서 잰 px ÷ 배율 = 실제 열 너비 (2026-07-13)
        const z = (tableScale || 100) / 100;
        // 실제 렌더링된 너비를 DOM에서 직접 읽음 (getW와 불일치 방지)
        const th = e.currentTarget.closest('th');
        const startWidth = th ? Math.round(th.getBoundingClientRect().width / z) : getW(h);
        resizeRef.current = { col: h, startX: e.clientX, startWidth };
        const onMove = ev => {
            if (!ev.buttons) { onUp(); return; }
            const { col, startX, startWidth } = resizeRef.current;
            if (!col) return;
            setColWidths(p => ({ ...p, [col]: Math.max(40, Math.round(startWidth + (ev.clientX - startX) / z)) }));
        };
        const onUp = () => {
            resizeRef.current = { col: null, startX: 0, startWidth: 0 };
            setColWidths(p => { saveColWidths(currentTeam, p); return p; });   // 끌기 끝 → 이 PC에 기억 (2026-07-13)
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    };

    // ── 더블클릭 자동 너비 맞춤 ──────────────────────────────────────────
    const autoFitCol = (h) => {
        const pad = compactMode === 0 ? 24 : 16;
        const kw  = compactMode === 0 ? 13 : 11; // 한글 자 너비
        const ew  = compactMode === 0 ? 8  : 7;  // 영문/숫자 자 너비
        const measure = str => {
            const s = String(str ?? '');
            const k = (s.match(/[가-힣]/g) || []).length;
            return k * kw + (s.length - k) * ew + pad;
        };
        const headerW = measure(h) + 20; // 정렬 아이콘 여유
        const dataW   = activeRows.reduce((mx, row) => Math.max(mx, measure(row[h] ?? '')), 0);
        setColWidths(p => {
            const next = { ...p, [h]: Math.min(500, Math.max(40, Math.max(headerW, dataW))) };
            saveColWidths(currentTeam, next);   // 이 PC에 기억 (2026-07-13)
            return next;
        });
    };

    // ── 엑셀 업로드 → 전체 시트 파싱 → pendingData (미저장 미리보기) ────
    // ── 엑셀 파일 → { headers, colGroups, rows } 공용 해석기 (2026-08-10) ─────────
    //   관리자 [엑셀 업로드]와 일반 사용자 [엑셀 반영]이 같은 해석기를 쓴다 (계산 일원화).
    //   동작은 기존 업로드 그대로 이동: 최신 연도 시트만 · 3층 헤더 · 번호 3자리 패딩.
    const parseListWorkbook = async (file) => {
        const XLSX = await loadXLSX();
        const wb   = XLSX.read(await file.arrayBuffer(), { cellDates: true });
        addLog(`시트 ${wb.SheetNames.length}개: ${wb.SheetNames.join(', ')}`);

        let allRows       = [];
        let canonHeaders  = null;
        let canonColGroups = null;
        let canonColCount  = 0;

        // 팀 카드 파서옵션 (2026-08-11 2단계) — 없으면 전부 기존 동작
        const po = teamProfile?.파서옵션 || {};
        // 관리자열 게이트 (2026-08-21 팀장님): '관리자' 자동 삽입은 카드가 끈 팀(기술1팀) 제외 — parseExcelHeaders가 읽음
        const poHdr = { ...(Number.isInteger(po.헤더시작행) ? { startRow: po.헤더시작행, layers: po.헤더층 } : {}), 관리자열: po.관리자열 !== false };
        // 최신 연도 시트 1개만 읽기 (2026 등) — 2026-06-27 팀장님: 과거 연도·SM대응 제외
        const _years   = wb.SheetNames.map(n => extractYear(n)).filter(y => /^\d{4}$/.test(y));
        const _latestY = _years.sort((a, b) => b.localeCompare(a))[0];
        addLog(po.전연도 ? `전연도 모드: 최신 ${_latestY} + 과거 전부` : `최신 연도 시트만 사용: ${_latestY}`);
        // 한시트만(기술1팀): 최신 연도 시트가 여러 개면("2026"+"2026 (2)") 열이 가장 많은 1개만 — 중복 적재 방지
        let _useSheets = wb.SheetNames.filter(n => extractYear(n) === _latestY);
        if (po.한시트만 && _useSheets.length > 1) {
            let best = null, bestCols = -1;
            for (const sn of _useSheets) {
                const raw0 = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: false, dateNF: 'yyyy-mm-dd', defval: '' });
                const cols = raw0.length >= 2 ? parseExcelHeaders(raw0, () => {}, poHdr).colDefs.length : 0;
                if (cols > bestCols) { best = sn; bestCols = cols; }
            }
            addLog(`한 시트만(팀 카드): "${best}" (${bestCols}열) — 나머지 ${_useSheets.length - 1}개 제외`);
            _useSheets = [best];
        }
        // ── 전연도 모드 (2026-08-19 팀장님, 기술1팀): 옛 연도 시트 전부 추가 — 최신 연도는 위 한시트만 결과 유지.
        //    같은 옛 연도 2탭(2017(C)+(P) 등)은 전부 읽고, 중복은 아래에서 공사명 기준 제거(실측 겹침 0건 — 안전장치).
        if (po.전연도) {
            _useSheets = _useSheets.concat(wb.SheetNames.filter(n => { const y = extractYear(n); return /^\d{4}$/.test(y) && y !== _latestY; }));
        }
        // 옛 시트 열 이름 번역기 (전연도 모드) — 팀 카드 '열번역', 공백 무시 일치. 최신 연도 시트엔 적용 안 함.
        const _xlat = po.열번역 || null;
        const _xlatMap = _xlat ? Object.fromEntries(Object.entries(_xlat).map(([k, v]) => [String(k).replace(/\s+/g, ''), v])) : null;
        let _si = 0;   // 시트 순번 — 같은 밀리초에 두 시트를 읽어도 _id가 안 겹치게 (전연도에서 같은 연도 2탭)
        for (const sheetName of wb.SheetNames) {
            const year = extractYear(sheetName);
            if (!_useSheets.includes(sheetName)) { addLog(`시트 "${sheetName}" 건너뜀${po.전연도 ? '' : ` (최신연도 ${_latestY}만)`}`); continue; }
            const ws   = wb.Sheets[sheetName];
            const raw  = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, dateNF: 'yyyy-mm-dd', defval: '' });
            addLog(`── 시트 "${sheetName}" (연도: ${year}): ${raw.length}행`);
            if (raw.length < 2) { addLog(`  ↳ 스킵 (행 부족)`); continue; }

            const { colDefs, colGroups: cg, dataStart } = parseExcelHeaders(raw, addLog, poHdr);
            if (colDefs.length === 0) { addLog(`  ↳ 스킵 (헤더 없음)`); continue; }
            if (_xlatMap && year !== _latestY) {   // 옛 시트만 번역 — '프로젝트명'→'공사명' 등 (2026-08-19)
                let xn = 0;
                colDefs.forEach(cd => { const t = _xlatMap[String(cd.name).replace(/\s+/g, '')]; if (t) { cd.name = t; xn++; } });
                if (xn) addLog(`  ↳ 열 이름 번역 ${xn}건 (2026 양식으로)`);
            }

            // 헤더 기준 = 열이 가장 많은(가장 풍부한) 시트. 맨 앞 'SM대응'(10열)처럼 단순한 시트가 기준이 돼
            // 2026년(31열) 열들이 표에서 통째로 가려지던 문제 수정 (2026-06-26)
            if (colDefs.length > canonColCount) { canonHeaders = colDefs.map(c => c.name); canonColGroups = cg; canonColCount = colDefs.length; }

            const ts = Date.now() + (_si++);   // 시트별 +1 — 같은 연도 2탭 _id 충돌 방지 (2026-08-19)
            // 번호 3자리 패딩 (2026-07-20 팀장님): 원본 엑셀은 1·2·3 그대로 두고, 업로드가 001·002·003으로 자동 변환
            const _noColName = (colDefs.find(c => String(c.name).replace(/\s/g, '') === '번호') || {}).name;
            // 필수열(팀 카드): 문자열 1개 또는 배열 — 하나라도 빈 행은 제외.
            //   기술1팀 = 순번+공사명 둘 다: 템플릿 행(순번만)은 공사명에서, 하단 집계표(접수건·수주·완료·잔여 — 공사명 칸에 라벨만)는 순번에서 탈락 (2026-08-11 실측)
            const _reqCols = (po.필수열 ? [].concat(po.필수열) : [])
                .map(rq => (colDefs.find(c => String(c.name).replace(/\s/g, '') === String(rq).replace(/\s/g, '')) || {}).name)
                .filter(Boolean);
            // 값 치환(팀 카드 파서옵션.값치환, 2026-09-01 팀장님): 업로드 시 지정 칸 값 통일 — 기술1팀 '작업' 준비→추진중
            const _subst = po.값치환 ? Object.entries(po.값치환).map(([cn, map]) => ({
                name: (colDefs.find(c => String(c.name).replace(/\s/g, '') === String(cn).replace(/\s/g, '')) || {}).name, map
            })).filter(x => x.name) : [];
            const sheetRows = raw.slice(dataStart).map((row, idx) => {
                const obj = {
                    _id:   `row_${year}_${ts}_${String(idx).padStart(5,'0')}`,
                    _pid:  generatePid(), // A-4a: 고유 ID (보존 병합에서 매칭되면 기존 _id·_pid가 유지되고 이건 버려짐)
                    _year: year,
                    _srcSheet: sheetName   // 임시 — 같은 연도 '다른 탭' 중복 판정용, 반환 전 제거 (2026-08-19)
                };
                colDefs.forEach(({ idx: ci, name }) => { obj[name] = String(row[ci] ?? '').trim(); });
                if (po.번호패딩 !== false && _noColName && obj[_noColName]) obj[_noColName] = padProjectNo(obj[_noColName]);
                _subst.forEach(({ name, map }) => { const v0 = String(obj[name] ?? '').trim(); if (map[v0] !== undefined) obj[name] = map[v0]; });   // 값치환 (2026-09-01)
                if (_reqCols.length && _reqCols.some(n => !obj[n])) return null;
                return colDefs.every(({ name }) => !obj[name]) ? null : obj;
            }).filter(Boolean);

            addLog(`  ↳ ${sheetRows.length}건`);
            allRows = allRows.concat(sheetRows);
        }
        // ── 전연도 후처리 (2026-08-19 팀장님) ──
        if (po.전연도 && canonHeaders) {
            // ① 옛 전용 열 보존: 번역 후에도 2026 양식(canonHeaders)에 없는 열 값은 비고 끝에 [열: 값]으로
            if (po.옛전용열비고) {
                const canonSet = new Set(canonHeaders.map(h => String(h).replace(/\s+/g, '')));
                const remarkCol = canonHeaders.find(h => String(h).replace(/\s+/g, '').includes('비고')) || '비고';
                let moved = 0;
                allRows.forEach(r => {
                    Object.keys(r).forEach(k => {
                        if (k.startsWith('_') || canonSet.has(String(k).replace(/\s+/g, ''))) return;
                        const v = String(r[k] ?? '').trim();
                        if (v) { r[remarkCol] = `${String(r[remarkCol] || '').trim()} [${k}: ${v}]`.trim(); moved++; }
                        delete r[k];
                    });
                });
                if (moved) addLog(`옛 전용 열 값 ${moved}건 → '${remarkCol}'에 보존`);
            }
            // ② 같은 연도 '다른 탭' 사이 중복만 제거 — 공사명(공백 무시) 기준, 먼저 읽은 시트 우선.
            //    ★같은 탭 안 동명 행은 보존 (2026-08-19 실측: 2015 'GP2 Line 자동제어공사' 등 6건 =
            //    L1/L2 단계를 별도 행으로 관리한 진짜 다른 공사 — 수행번호·발주처 다름. 이름만으로 지우면 실데이터 소실)
            const nameCol = canonHeaders.find(h => String(h).replace(/\s+/g, '') === '공사명');
            if (nameCol) {
                const seen = {}; const before = allRows.length;
                allRows = allRows.filter(r => {
                    const nm = String(r[nameCol] || '').replace(/\s+/g, '');
                    if (!nm) return true;
                    const key = `${r._year}|${nm}`;
                    if (seen[key] && seen[key] !== r._srcSheet) return false;   // 다른 탭의 동명 = 중복 제거
                    if (!seen[key]) seen[key] = r._srcSheet;
                    return true;
                });
                if (before !== allRows.length) addLog(`같은 연도 다른 탭 중복 ${before - allRows.length}건 제거`);
            }
            allRows.forEach(r => { delete r._srcSheet; })
            const _yrCnt = {};
            allRows.forEach(r => { _yrCnt[r._year] = (_yrCnt[r._year] || 0) + 1; });
            addLog(`연도별: ${Object.entries(_yrCnt).sort((a,b)=>b[0].localeCompare(a[0])).map(([y,c])=>`${y}=${c}건`).join(' · ')}`);
        }
        allRows.forEach(r => { delete r._srcSheet; });   // 임시 표식 제거 (전 모드 공통)
        return { headers: canonHeaders, colGroups: canonColGroups, rows: allRows };
    };

    const handleFileUpload = async (e) => {
        // ★ 관리자 전용 (2026-07-14): 업로드하면 화면이 '미리보기'로 바뀌어 클라우드와 분리됨 → 일반 사용자 혼선·오조작 방지
        if (!isAdmin) { setAlertMsg('엑셀 업로드는 관리자만 할 수 있습니다.'); return; }
        const file = e.target?.files?.[0];
        if (!file) return;
        setIsLoading(true); setLogs([]);
        addLog(`파일: ${file.name} (${(file.size/1024).toFixed(1)} KB)`);
        try {
            const { headers: canonHeaders, colGroups: canonColGroups, rows: allRows } = await parseListWorkbook(file);

            if (!canonHeaders || allRows.length === 0) {
                setAlertMsg('데이터를 찾지 못했습니다.\n디버그 패널을 확인해주세요.');
                setIsLoading(false); return;
            }

            addLog(`전체 유효 행: ${allRows.length}건 (${[...new Set(allRows.map(r=>r._year))].join(', ')})`);
            setPendingData({ headers: canonHeaders, colGroups: canonColGroups, rows: allRows, fileName: file.name });

            // 현재 연도가 없으면 가장 최근 연도로 선택 (내림차순 → 첫번째가 최신)
            const years = [...new Set(allRows.map(r => r._year))].sort((a, b) => b.localeCompare(a));
            const curY  = String(new Date().getFullYear());
            if (years.includes(curY))       setSelectedYear(curY);
            else if (!years.includes(selectedYear)) setSelectedYear(years[0]);

            addLog(`미리보기 준비 완료 — 아직 저장 안 됨`);
        } catch (err) {
            addLog(`[오류] ${err.message}`);
            setAlertMsg(`파싱 오류: ${err.message}`);
        } finally {
            setIsLoading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    // ── 로컬(IndexedDB)에 임시 저장 ──────────────────────────────────────
    const handleSaveToLocal = async () => {
        const src = pendingData || { headers: activeHeaders, colGroups: activeColGroups, rows: activeRows };
        if (!src.rows?.length) return;
        setIsLoading(true);
        try {
            await idbSave(currentTeam, src.headers, src.colGroups, src.rows);
            const saved = { headers: src.headers, colGroups: src.colGroups, rows: src.rows, savedAt: new Date().toISOString() };
            setLocalData(saved);
            setPendingData(null);
            addLog(`[로컬DB] 임시 저장 완료 (${src.rows.length}건)`);
            setAlertMsg(`로컬 임시 저장 완료!\n${src.rows.length}건이 이 기기에 저장되었습니다.\n앱을 재시작해도 유지됩니다.`);
        } catch (err) {
            setAlertMsg(`로컬 저장 오류: ${err.message}`);
        } finally { setIsLoading(false); }
    };

    // ── Firebase에 확정 저장 = 보존 병합 (3단계, 2026-07-20 팀장님 확정) ──────────────
    //   옛 방식(기존 전량삭제 → 엑셀로 교체)은 pid가 전부 바뀌어 진행실적 장부·하위 행·이력이 통째로 끊겼다.
    //   새 방식: 매칭(연도+번호→연도+이름) 행은 기존 문서를 유지한 채 엑셀 컬럼 값만 갱신(엑셀 절대우선),
    //   신규는 추가, 엑셀에 없는 행·하위(공종) 행은 그대로 유지. 삭제는 하지 않는다(개별 삭제 = 우클릭 완전삭제).
    //   저장 직전 현재 클라우드 데이터를 JSON으로 자동 백업(다운로드)한다.
    const handleSaveToFirebase = async () => {
        // ★ 관리자 전용 (2026-07-14)
        if (!isAdmin) { setAlertMsg('관리자만 실행할 수 있습니다.\n\n[엑셀 확정 저장]은 엑셀과 클라우드를 보존 병합합니다\n(매칭 행 갱신 · 신규 추가 · 하위/누락 행 유지).'); return; }
        const src = pendingData || localData;
        if (!src?.rows?.length) return;
        const hdrs = src.headers || activeHeaders;
        const mains = fbRows.filter(r => !isSubListRow(r));            // 하위 제외 = 하위는 병합에서 완전 보존
        const subCnt = fbRows.length - mains.length;
        const plan = computeMergePlan(mains, src.rows, hdrs);
        const ok = window.confirm(
`[엑셀 확정 저장 — 보존 병합]

✓ 갱신 ${plan.counts.updates}건 (값 변경 ${plan.counts.changed}건만 실제 저장 · pid/실행번호/이력/포인트실적 보존)
＋ 신규 ${plan.counts.news}건
· 엑셀에 없음 ${plan.counts.missing}건 → 그대로 유지 (삭제 안 함)
· 하위(공종) ${subCnt}건 → 보존

매칭 기준: 연도+번호(${plan.numCol || '없음'}) → 연도+이름(${plan.nameCol || '없음'})
저장 직전, 현재 클라우드 데이터 백업(JSON)이 자동 다운로드됩니다.

진행할까요?`);
        if (!ok) return;
        setIsLoading(true);
        try {
            // 0) 자동 백업 (JSON) — 문제가 생기면 이 파일이 되돌리기 기준
            await loadFileSaver();
            const _bs = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '_');
            window.saveAs(new Blob([JSON.stringify({ team: currentTeam, savedAt: new Date().toISOString(), headers: activeHeaders, colGroups: activeColGroups, rows: fbRows }, null, 1)], { type: 'application/json' }),
                `ProjectList백업_${currentTeam}_${_bs}.json`);
            // 1) 메타(헤더·그룹) = 엑셀 기준으로 갱신 (표 구조는 엑셀이 기준 — 기존 동작 유지)
            await setDoc(metaDocRef(currentTeam), {
                headers: src.headers, colGroups: src.colGroups,
                byYear: fbByYear || {}, colMids: fbColMids || {},   // ★연도별 헤더 벌 보존 (2026-08-24 — 종전엔 통째 덮어써 byYear 유실)
                updatedAt: new Date().toISOString()
            });
            // 2) 쓰기 = 값이 바뀐 갱신 행 + 신규 행만. 삭제 0건 (하위·엑셀에 없음 행은 문서 그대로).
            let batch = writeBatch(db), cnt = 0;
            const flush = async () => { if (cnt > 0) { await batch.commit(); batch = writeBatch(db); cnt = 0; } };
            for (const u of plan.updates) {
                if (!u.changed) continue;                                  // 값 전부 동일 → 쓰기 생략 (도장 오염·쓰기량 방지)
                batch.set(rowDocRef(currentTeam, u._id), stampSave(u.data));
                if (++cnt >= 400) await flush();
            }
            for (const c of plan.creates) {
                batch.set(rowDocRef(currentTeam, c._id), stampSave(c.data));
                if (++cnt >= 400) await flush();
            }
            await flush();

            // 성공 후 로컬/pending 초기화
            setPendingData(null);
            setLocalData(null);
            await idbDelete(currentTeam);
            addLog(`[Firebase] 보존 병합 저장 완료 — 갱신 ${plan.counts.changed}/${plan.counts.updates} · 신규 ${plan.counts.news} · 유지 ${plan.counts.missing} · 하위 ${subCnt}`);
            setAlertMsg(`엑셀 확정 저장(보존 병합) 완료!\n\n갱신 ${plan.counts.updates}건 (실제 쓰기 ${plan.counts.changed}건) · 신규 ${plan.counts.news}건\n엑셀에 없음 ${plan.counts.missing}건 유지 · 하위(공종) ${subCnt}건 보존`);
        } catch (err) {
            addLog(`[Firebase 오류] ${err.message}`);
            setAlertMsg(`Firebase 저장 오류: ${err.message}`);
        } finally { setIsLoading(false); }
    };

    // ── A-4c 병합 미리보기(드라이런) — Firebase 저장 없이 매칭 결과만 보여줌 ──
    const handleMergePreview = () => {
        if (!pendingData?.rows?.length) { setAlertMsg('먼저 엑셀을 업로드하세요 (미리보기 상태에서 실행).'); return; }
        const pv = computeMergePreview(fbRows, pendingData.rows, pendingData.headers || activeHeaders);
        const sample = (arr) => arr.slice(0, 5).map(x => x.name || x.num || '?').join(', ') + (arr.length > 5 ? ` 외 ${arr.length - 5}건` : '');
        addLog(`[드라이런] 갱신 ${pv.counts.updates}(값변경 ${pv.counts.changed}) · 신규 ${pv.counts.news} · 엑셀에없음 ${pv.counts.missing} | 매칭열 번호=${pv.numCol||'없음'}, 이름=${pv.nameCol||'없음'}`);
        setAlertMsg(
`[병합 미리보기 · 드라이런]  — 저장 안 됨, 데이터 안 바뀜

매칭 기준: 연도+번호(${pv.numCol || '없음'}) → 연도+이름(${pv.nameCol || '없음'})

✓ 갱신 ${pv.counts.updates}건  (그중 값이 바뀌는 행 ${pv.counts.changed}건)
＋ 신규 ${pv.counts.news}건
⚠ 엑셀에 없음 ${pv.counts.missing}건  (삭제하지 않음)

· 신규 예: ${pv.news.length ? sample(pv.news) : '-'}
· 엑셀에 없음 예: ${pv.missing.length ? sample(pv.missing) : '-'}

※ 현재 클라우드 ${fbRows.length}건 / 업로드 ${pendingData.rows.length}건 기준.
신규가 비정상적으로 많으면 매칭 키(번호)가 안 맞는 것 — 알려주세요.`
        );
    };

    // ── 일반 사용자 [엑셀 반영] — 보존 병합 (2026-08-10 팀장님 확정) ─────────────────
    //   배경: 직원들이 아직 웹 대신 엑셀에서 List를 관리하는 적응기 → 엑셀을 올리면
    //   웹 데이터와 비교해 "신규 추가 + 값 갱신"만 반영한다. 삭제는 절대 없음.
    //   보호 규칙:
    //     ① 하위(공종) 행 완전 불변 — 주인은 NAS 자동 연동 (병합 대상에서 제외)
    //     ② 엑셀 안 하위형 줄(실행번호 s · 이름 '- '/'└' 시작)은 무시 + 안내
    //     ③ NAS 연동 칸·하위 부모 '포인트'(Σ합계)는 엑셀 값 무시 (자동 값 보호)
    //     ④ 실행번호는 웹 전용 관리 값이라 열 짝짓기에서 제외 (pid·등록일·이력은 병합기가 보존)
    //     ⑤ 표 구조(헤더)는 안 건드림 — 겹치는 열만 반영 (구조 변경 = 관리자 업로드 영역)
    const handleUserExcelPick = async (e) => {
        const file = e.target?.files?.[0];
        if (!file) return;
        if (dataSource !== 'firebase') { setAlertMsg('클라우드 데이터 상태에서만 반영할 수 있습니다.\n(관리자 업로드 미리보기 중이면 확정 저장 또는 업로드 취소 후 실행하세요)'); return; }
        setIsLoading(true); setLogs([]);
        addLog(`[엑셀 반영] 파일: ${file.name} (${(file.size/1024).toFixed(1)} KB)`);
        try {
            const parsed = await parseListWorkbook(file);
            if (!parsed.headers || !parsed.rows.length) { setAlertMsg('데이터를 찾지 못했습니다.\n(시트·헤더 형식이 List 엑셀과 같은지 확인해주세요)'); return; }
            const nosp = (s) => String(s ?? '').replace(/\s+/g, '');
            // ⑤ 열 짝짓기: 웹 표 열 ↔ 엑셀 열 (공백 무시). 겹치는 열만 반영 대상.
            const exByNosp = new Map(parsed.headers.filter(Boolean).map(h => [nosp(h), h]));
            const colPairs = activeHeaders
                .filter(h => h && nosp(h) !== '실행번호' && exByNosp.has(nosp(h)))
                .map(h => ({ web: h, ex: exByNosp.get(nosp(h)) }));
            const interCols = colPairs.map(p => p.web);
            const usedNosp  = new Set(colPairs.map(p => nosp(p.ex)));
            const webOnly   = activeHeaders.filter(h => h && nosp(h) !== '실행번호' && !exByNosp.has(nosp(h)));
            const excelOnly = parsed.headers.filter(h => h && !usedNosp.has(nosp(h)));
            if (!interCols.length) { setAlertMsg('웹 표와 겹치는 열이 하나도 없습니다.\nList 엑셀이 맞는지 확인해주세요.'); return; }
            // ② 엑셀 줄에서 하위(공종)형 제외
            const exNameCol = parsed.headers.find(h => { const n = nosp(h).toUpperCase(); return n === 'PROJECT' || n.includes('프로젝트') || n.includes('공사명'); });
            const looksSub  = (r) => isSubListRow(r) || /^(-\s|└)/.test(String((exNameCol ? r[exNameCol] : '') ?? '').trim());
            const upMains     = parsed.rows.filter(r => !looksSub(r));
            const skippedSubs = parsed.rows.length - upMains.length;
            // 병합기에 넣기 전, 엑셀 행을 '웹 열 이름' 기준으로 다시 담는다 (겹치는 열만)
            const rmRows = upMains.map(r => {
                const o = { _id: r._id, _pid: r._pid, _year: r._year };
                colPairs.forEach(p => { o[p.web] = String(r[p.ex] ?? '').trim(); });
                return o;
            });
            // ①+④ 병합 계획 — 확정 저장과 같은 계산기 (하위 제외, pid·이력 보존)
            const mains  = fbRows.filter(r => !isSubListRow(r));
            const subCnt = fbRows.length - mains.length;
            const plan = computeMergePlan(mains, rmRows, interCols);
            // ③ NAS 연동 칸 + 하위 부모 '포인트' 보호 — 엑셀의 옛 값이 자동 값을 덮지 않게
            const byId = new Map(mains.map(r => [r._id, r]));
            const parentsWithSubs = new Set(fbRows.filter(isSubListRow).map(s => String(s._id).replace(/_sub\d+$/, '')));
            const nasSkips = [];
            plan.updates.forEach(u => {
                const m = byId.get(u._id); if (!m) return;
                const lockedNosp = new Set(extLockedColsRow(m).map(t => nosp(t).toUpperCase()));
                if (parentsWithSubs.has(u._id)) lockedNosp.add('포인트');
                interCols.forEach(c => {
                    if (!lockedNosp.has(nosp(c).toUpperCase())) return;
                    const oldV = String(m[c] ?? ''), nv = String(u.data[c] ?? '');
                    if (oldV !== nv) { u.data[c] = oldV; nasSkips.push({ name: pickProjectName(m), col: c }); }
                });
                // 보호 반영 후 다시 계산: 무엇이 어떻게 바뀌는지 (미리보기 표시용)
                u.diffs = interCols
                    .filter(c => String(m[c] ?? '') !== String(u.data[c] ?? ''))
                    .map(c => ({ col: c, from: String(m[c] ?? ''), to: String(u.data[c] ?? '') }));
                u.name = pickProjectName(m);
                u.changed = u.diffs.length > 0 || (m._year || '') !== (u.data._year || '');
            });
            const changedCnt = plan.updates.filter(u => u.changed).length;
            addLog(`[엑셀 반영] 매칭 ${plan.counts.updates} (값변경 ${changedCnt}) · 신규 ${plan.creates.length} · 엑셀에없음 ${plan.counts.missing} · 하위줄 무시 ${skippedSubs} · 잠금칸 보호 ${nasSkips.length}`);
            setUserMerge({ fileName: file.name, plan, changedCnt, subCnt, skippedSubs, nasSkips, webOnly, excelOnly, upCnt: rmRows.length });
        } catch (err) {
            addLog(`[엑셀 반영 오류] ${err.message}`);
            setAlertMsg(`엑셀 해석 오류: ${err.message}`);
        } finally {
            setIsLoading(false);
            if (userFileRef.current) userFileRef.current.value = '';
        }
    };

    const applyUserMerge = async () => {
        const um = userMerge;
        if (!um || isLoading) return;
        setIsLoading(true);
        try {
            // 자동 백업 (JSON) — 확정 저장과 동일한 되돌리기 기준
            await loadFileSaver();
            const _bs = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '_');
            window.saveAs(new Blob([JSON.stringify({ team: currentTeam, savedAt: new Date().toISOString(), headers: activeHeaders, colGroups: activeColGroups, rows: fbRows }, null, 1)], { type: 'application/json' }),
                `ProjectList백업_${currentTeam}_${_bs}.json`);
            // 쓰기 = 값 바뀐 갱신 + 신규만. 삭제 0건 · 메타(표 구조)도 안 건드림.
            let batch = writeBatch(db), cnt = 0;
            const flush = async () => { if (cnt > 0) { await batch.commit(); batch = writeBatch(db); cnt = 0; } };
            for (const u of um.plan.updates) {
                if (!u.changed) continue;
                batch.set(rowDocRef(currentTeam, u._id), stampSave(u.data));
                if (++cnt >= 400) await flush();
            }
            for (const c of um.plan.creates) {
                batch.set(rowDocRef(currentTeam, c._id), stampSave(c.data));
                if (++cnt >= 400) await flush();
            }
            await flush();
            logAudit(currentTeam, { who: user?.email || '', action: AUDIT_ACTIONS.EDIT, projectName: '(엑셀 일괄 반영)',
                note: `엑셀 반영(보존 병합): 값 갱신 ${um.changedCnt}건 · 신규 ${um.plan.creates.length}건 — ${um.fileName}` });
            addLog(`[엑셀 반영] 저장 완료 — 갱신 ${um.changedCnt} · 신규 ${um.plan.creates.length}`);
            setUserMerge(null);
            setAlertMsg(`엑셀 반영 완료!\n\n값 갱신 ${um.changedCnt}건 · 신규 추가 ${um.plan.creates.length}건\n삭제 없음 · 하위(공종) ${um.subCnt}건 보존\n(반영 직전 백업 JSON이 다운로드되었습니다)`);
        } catch (err) {
            setAlertMsg(`반영 오류: ${err.message}`);
        } finally { setIsLoading(false); }
    };

    // ── 과거 연도 추가 적재 (2026-08-20 팀장님, 기술2팀) — 옛 연도 행만 '순수 추가', 올해·기존 연도 무접촉 ──
    //   기술1팀 전연도(전체삭제→재업로드) 방식 금지: NAS 규칙·pid·주차장부 보존이 우선 → 기존 문서에는 쓰기 자체가 없다.
    //   올해 시트·웹에 이미 있는 연도 시트는 통째로 건너뜀(중복 적재 방지 = 재실행 안전).
    const handleHistoryImportPick = async (e) => {
        const file = e.target?.files?.[0];
        if (histFileRef.current) histFileRef.current.value = '';
        if (!file) return;
        const hCfg = teamProfile?.과거적재;
        if (!isAdmin || !hCfg) return;
        if (dataSource !== 'firebase') { setAlertMsg('클라우드 데이터 상태에서만 실행할 수 있습니다.'); return; }
        setIsLoading(true);
        try {
            const XLSX = await loadXLSX();
            const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
            const curY = String(new Date().getFullYear());
            const haveYears = new Set(fbRows.map(r => String(r._year || '')).filter(Boolean));
            const hNorm = (v) => String(v ?? '').replace(/\s+/g, '');
            const xlatCommon = {}; Object.entries(hCfg.열번역 || {}).forEach(([k, v]) => { xlatCommon[hNorm(k)] = v; });
            const canonSet = new Set((activeHeaders || []).map(h => hNorm(h)));
            const remarkCol = (activeHeaders || []).find(h => hNorm(h) === hNorm(hCfg.보존덧붙임열 || '내용')) || '내용';
            const nameCol = (activeHeaders || []).find(h => hNorm(h) === 'Project') || 'Project';
            // 옛 날짜 5종 → YYYY-MM-DD (확실할 때만 — '2022년' 같은 애매값은 원문 보존, '-'는 빈칸)
            const oldDate = (v) => {
                const t = String(v ?? '').trim();
                if (!t || t === '-') return '';
                if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
                let m2 = t.match(/^(\d{2})(\d{2})(\d{2})$/) || t.match(/^(\d{2})\.(\d{2})\.(\d{2})$/);
                if (m2) { const mo = Number(m2[2]), d = Number(m2[3]); if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return `20${m2[1]}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`; }
                m2 = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);   // 엑셀 미국식 M/D/YY
                if (m2) { const mo = Number(m2[1]), d = Number(m2[2]); if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return `20${m2[3]}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`; }
                return t;
            };
            const newRows = []; const perYear = {}; const skipped = []; let moved = 0; let _si = 0;
            for (const sheetName of wb.SheetNames) {
                const year = extractYear(sheetName);
                if (!/^\d{4}$/.test(year)) { skipped.push(`${sheetName}(연도 없음)`); continue; }
                if (year === curY) { skipped.push(`${sheetName}(올해 — 제외)`); continue; }
                if (haveYears.has(year)) { skipped.push(`${sheetName}(웹에 이미 있음)`); continue; }
                const raw = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: false, dateNF: 'yyyy-mm-dd', defval: '' });
                // ★진짜 날짜 셀은 연도까지 살리기 (2026-08-21 팀장님): 옛 시트가 'm/d' 서식이면 글자로는 "6/21"만 남아
                //   연도가 사라짐 → 셀 원본(Date)에서 YYYY-MM-DD로 직접 복원 (시트 연도와 다른 해의 날짜도 정확).
                const rawD = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: true, defval: '' });
                for (let ri = 0; ri < rawD.length; ri++) {
                    const rrow = rawD[ri]; if (!rrow) continue;
                    for (let ci2 = 0; ci2 < rrow.length; ci2++) {
                        const dv = rrow[ci2];
                        if (dv instanceof Date && !isNaN(dv)) {
                            const dt = new Date(dv.getTime() + 30 * 60000);   // SheetJS 0.18.5 cellDates가 1899년 옛 시간대(한국 LMT +8:27:52)로 계산해 자정보다 52초 모자람 → +30분 보정 후 날짜만 (2026-08-24 실측)
                            if (!raw[ri]) raw[ri] = [];
                            raw[ri][ci2] = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
                        }
                    }
                }
                const yCfg = (hCfg.연도별 || {})[year];
                let colDefs, dataStart;
                if (yCfg && Number.isInteger(yCfg.헤더행)) {   // 특례 = 헤더 1줄 직접 (2013·2014)
                    colDefs = (raw[yCfg.헤더행] || []).map((h, i) => ({ idx: i, name: String(h).trim() })).filter(c => c.name);
                    dataStart = yCfg.헤더행 + 1;
                } else {
                    const parsed = parseExcelHeaders(raw, addLog, undefined);
                    colDefs = parsed.colDefs; dataStart = parsed.dataStart;
                }
                if (!colDefs.length) { skipped.push(`${sheetName}(헤더 없음)`); continue; }
                const xlatY = {}; Object.entries((yCfg && yCfg.열번역) || {}).forEach(([k, v]) => { xlatY[hNorm(k)] = v; });
                colDefs.forEach(cd => { const t = xlatY[hNorm(cd.name)] || xlatCommon[hNorm(cd.name)]; if (t) cd.name = t; });
                const ts = Date.now() + (_si++);
                const noCol = (colDefs.find(c => hNorm(c.name) === '번호') || {}).name;
                const rows2 = raw.slice(dataStart).map((rr, idx) => {
                    const o = { _id: `row_${year}_${ts}_${String(idx).padStart(5, '0')}`, _pid: generatePid(), _year: year };
                    colDefs.forEach(({ idx: ci, name }) => { const val = String(rr[ci] ?? '').trim(); if (o[name] === undefined || val !== '') o[name] = val; });
                    if (noCol && o[noCol]) o[noCol] = padProjectNo(o[noCol]);
                    if (!String(o['번호'] || '').trim() || !String(o[nameCol] || '').trim()) return null;   // 필수 = 번호+Project
                    ['공사 계약', '공사 완료'].forEach(c => { if (o[c] !== undefined) o[c] = oldDate(o[c]); });
                    // 표준에 없는 열 → '내용' 끝 [열: 값] 보존 (팀장님 확정 ②)
                    Object.keys(o).forEach(k => {
                        if (k.startsWith('_') || canonSet.has(hNorm(k))) return;
                        const v = String(o[k] ?? '').trim();
                        if (v) { o[remarkCol] = `${String(o[remarkCol] || '').trim()} [${k}: ${v}]`.trim(); moved++; }
                        delete o[k];
                    });
                    return o;
                }).filter(Boolean);
                if (rows2.length) { newRows.push(...rows2); perYear[year] = rows2.length; }
            }
            if (!newRows.length) { setAlertMsg(`추가할 과거 연도 행이 없습니다.\n건너뜀: ${skipped.join(', ') || '없음'}`); return; }
            const yrLine = Object.entries(perYear).sort((a, b) => b[0].localeCompare(a[0])).map(([y3, c]) => `${y3}=${c}건`).join(' · ');
            if (!window.confirm(`[과거 연도 추가 적재]\n\n${yrLine}\n총 ${newRows.length}건 — 전부 '신규 추가'만 합니다.\n갱신 0 · 삭제 0 · 올해(${curY}) 데이터·NAS 규칙·장부 무접촉.\n표준에 없는 옛 열 값 ${moved}건은 '${remarkCol}' 끝에 [열: 값]으로 보존.\n건너뜀: ${skipped.join(', ') || '없음'}\n\n저장 직전 백업 JSON이 다운로드됩니다. 진행할까요?`)) return;
            await loadFileSaver();
            const _bs = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '_');
            window.saveAs(new Blob([JSON.stringify({ team: currentTeam, savedAt: new Date().toISOString(), headers: activeHeaders, colGroups: activeColGroups, rows: fbRows }, null, 1)], { type: 'application/json' }), `ProjectList백업_${currentTeam}_${_bs}.json`);
            let batch = writeBatch(db), cnt = 0;
            for (const r of newRows) {
                const { _id, ...rest } = r;
                batch.set(rowDocRef(currentTeam, _id), stampSave(rest));
                if (++cnt >= 400) { await batch.commit(); batch = writeBatch(db); cnt = 0; }
            }
            if (cnt > 0) await batch.commit();
            logAudit(currentTeam, { who: user?.email || '', action: AUDIT_ACTIONS.EDIT, projectName: '(과거 연도 추가 적재)',
                note: `과거 연도 추가 적재: ${yrLine} (총 ${newRows.length}건, 신규만) — ${file.name}` });
            addLog(`[과거 적재] 완료 — ${yrLine} (총 ${newRows.length}건)`);
            setAlertMsg(`과거 연도 추가 적재 완료!\n\n${yrLine}\n총 ${newRows.length}건 추가 · 올해 데이터 무변경\n기준연도 선택기에서 연도를 골라 확인하세요.`);
        } catch (err) {
            setAlertMsg(`과거 연도 적재 오류: ${err.message}`);
        } finally { setIsLoading(false); }
    };

    // ── 수행번호 3자리 정리 (2026-08-21 팀장님): 실제 '수행번호' 칸만 YY-N(N)→YY-NNN
    //    (2026-08-24 팀장님: 지난 연도 프로젝트 코드·NO.는 다른 의미 — 옛 이름 확장 폐지, 정리 대상 아님)
    const handleExecNoPad = async () => {
        if (!isAdmin || !execCfg || !execColBase) return;
        const N2 = (v) => String(v ?? '').replace(/\s+/g, '');
        const base = N2(execColBase);
        const cands = new Set([base]);
        const ups = [];
        const _cyPad = String(new Date().getFullYear());
        fbRows.forEach(r => {
            if (String(r._year || _cyPad) !== _cyPad) return;   // 당해 연도만 — 지난 연도 수행번호는 수동 관리 (2026-08-24)
            const patch = {};
            Object.keys(r).forEach(k => { if (!cands.has(N2(k))) return; const v = String(r[k] ?? ''); const nv = execNoNorm(v); if (nv !== v) patch[k] = nv; });
            if (Object.keys(patch).length) ups.push({ id: r._id, patch });
        });
        if (!ups.length) { setAlertMsg('정리할 수행번호가 없습니다 — 전부 YY-NNN 형식입니다.'); return; }
        const sample = ups.slice(0, 3).map(u => Object.entries(u.patch).map(([k, v]) => `${v}`).join(',')).join(' · ');
        if (!window.confirm(`[수행번호 3자리 정리]\n대상 ${ups.length}건 (예: ${sample})\nYY-NNN 형식으로 통일합니다. 진행할까요?`)) return;
        setIsLoading(true);
        try {
            let batch = writeBatch(db), cnt = 0;
            for (const u of ups) { batch.set(rowDocRef(currentTeam, u.id), stampSave(u.patch), { merge: true }); if (++cnt >= 400) { await batch.commit(); batch = writeBatch(db); cnt = 0; } }
            if (cnt > 0) await batch.commit();
            logAudit(currentTeam, { who: user?.email || '', action: AUDIT_ACTIONS.EDIT, projectName: '(수행번호 3자리 정리)', note: `수행번호 YY-NNN 통일 ${ups.length}건` });
            setAlertMsg(`수행번호 ${ups.length}건을 YY-NNN 형식으로 정리했습니다.`);
        } catch (err) { setAlertMsg(`정리 오류: ${err.message}`); }
        finally { setIsLoading(false); }
    };

    // ── 연도별 1:1 적재·검증 (2026-08-21 팀장님, 기술1팀) ───────────────────────────────
    //   원칙: 엑셀 시트 1장 = 웹 연도 1개. 열 이름·순서·값을 그 시트 그대로(번역·비고 덧붙임·관리자 열 없음) 저장하고
    //   연도별 헤더 벌(meta.byYear[연도])로 표시. 연도마다 [적재] → [대조 검증](웹 저장본 ↔ 엑셀 전수 비교) 순서.
    const parseSheetExact = (XLSX, wb, sheetName, seq = 0) => {
        const po0 = teamProfile?.파서옵션 || {};
        const year = extractYear(sheetName);
        const po = { ...po0, ...((po0.연도별파서 || {})[year] || {}) };   // 연도별 특례(기술2팀 2013·2014 등) — 그 해만 덮어쓰기 (2026-08-24)
        const raw = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: false, dateNF: 'yyyy-mm-dd', defval: '' });
        // ★진짜 날짜 셀 연도 복원 (2026-08-24, 카드 파서옵션.날짜복원): 옛 시트 'm/d' 서식은 글자로 "6/21"만 남아
        //   연도가 사라짐 → 셀 원본(Date)에서 YYYY-MM-DD 복원 (기술1팀은 원문 보존이라 끔 — 카드로 제어)
        if (po.날짜복원) {
            const rawD = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: true, defval: '' });
            for (let ri = 0; ri < rawD.length; ri++) {
                const rrow = rawD[ri]; if (!rrow) continue;
                for (let ci2 = 0; ci2 < rrow.length; ci2++) {
                    const dv = rrow[ci2];
                    if (dv instanceof Date && !isNaN(dv)) {
                        const dt = new Date(dv.getTime() + 30 * 60000);   // SheetJS 0.18.5 cellDates가 1899년 옛 시간대(한국 LMT +8:27:52)로 계산해 자정보다 52초 모자람 → +30분 보정 후 날짜만 (2026-08-24 실측)
                        if (!raw[ri]) raw[ri] = [];
                        raw[ri][ci2] = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
                    }
                }
            }
        }
        const opts = { ...(Number.isInteger(po.헤더시작행) ? { startRow: po.헤더시작행, layers: po.헤더층 } : {}), 관리자열: false };
        const { colDefs, colGroups, dataStart } = parseExcelHeaders(raw, () => {}, opts);
        const n = (v) => String(v ?? '').replace(/\s+/g, '');
        // 필수열(카드 '순번'·'공사명') — 옛 시트는 열번역으로 역추적('프로젝트명'→'공사명'). 이름은 안 바꾸고 찾기만.
        const xl = {}; Object.entries(po.열번역 || {}).forEach(([k, v]) => { xl[n(k)] = n(v); });
        const reqCols = (po.필수열 ? [].concat(po.필수열) : []).map(rq => {
            const cd = colDefs.find(c => n(c.name) === n(rq)) || colDefs.find(c => xl[n(c.name)] === n(rq));
            return cd ? cd.name : null;
        }).filter(Boolean);
        const noCol = (colDefs.find(c => n(c.name) === '번호') || {}).name;
        // 수행번호 열 YY-NNN 통일 — 실제 이름이 '수행번호'인 칸만 (2026-08-24 팀장님: 옛 연도 프로젝트 코드는 다른 의미라 값 그대로, 열번역 역추적 폐지)
        const execNm = teamProfile?.수행번호 ? (n(teamProfile.수행번호.열 || teamProfile?.열?.번호 || '') || null) : null;   // 카드 수행번호.열 우선 (2026-08-24)
        const execCol = execNm ? ((colDefs.find(c => n(c.name) === execNm) || {}).name || null) : null;
        // 값변환 (2026-08-24 팀장님 확정, 기술2팀 260822): 백분율소수 = 0~1 소수·'90%' 표기를 % 숫자로(0.9→90) ·
        //   비우기 = 엑셀 쪽 잘못 든 칸 무시(진행율% — 웹이 실적÷총점으로 자동 계산 예정)
        const vc = po.값변환 || null;
        const vcOn = !!vc && (!vc.연도 || [].concat(vc.연도).map(String).includes(String(year)));
        const vcPct = vcOn ? (vc.백분율소수 || []).map(nm => (colDefs.find(c => n(c.name) === n(nm)) || {}).name).filter(Boolean) : [];
        const vcClear = vcOn ? (vc.비우기 || []).map(nm => (colDefs.find(c => n(c.name) === n(nm)) || {}).name).filter(Boolean) : [];
        // 진행율% 자동 (2026-08-24): 적재 때도 웹과 같은 식(Point÷포인트×100)으로 계산해 넣음 — 엑셀 K열 오류값(포인트 복사) 대체
        const pa = teamProfile?.진행율자동 || null;
        const paOn = !!pa && (!Array.isArray(pa.연도) || pa.연도.map(String).includes(String(year)));
        const paK = paOn ? (colDefs.find(c => n(c.name) === n(pa.결과열)) || {}).name : null;
        const paNum = paOn ? (colDefs.find(c => n(c.name) === n(pa.분자열)) || {}).name : null;
        const paDen = paOn ? (colDefs.find(c => n(c.name) === n(pa.분모열)) || {}).name : null;
        const ts = Date.now() + seq;   // 같은 해 탭 2개를 같은 밀리초에 읽어도 _id·순서가 안 겹치게
        const rows = raw.slice(dataStart).map((rr, idx) => {
            const o = { _id: `row_${year}_${ts}_${String(idx).padStart(5, '0')}`, _pid: generatePid(), _year: year, _srcSheet: sheetName };   // _srcSheet = 어느 탭에서 왔는지(내부, 대조용)
            colDefs.forEach(({ idx: ci, name }) => { o[name] = String(rr[ci] ?? '').trim(); });
            if (po.번호패딩 !== false && noCol && o[noCol]) o[noCol] = padProjectNo(o[noCol]);
            if (execCol && o[execCol]) o[execCol] = execNoNorm(o[execCol]);
            vcPct.forEach(c => { let s = String(o[c] ?? '').trim(); if (s.endsWith('%')) s = s.slice(0, -1).trim(); const f = Number(s); if (s !== '' && Number.isFinite(f)) o[c] = String(Math.abs(f) <= 1 ? Math.round(f * 1000) / 10 : f); });
            vcClear.forEach(c => { if (o[c] !== undefined) o[c] = ''; });
            if (paK && paNum && paDen) {
                const dn = parseFloat(String(o[paDen] ?? '').replace(/[%,]/g, ''));
                const ns = String(o[paNum] ?? '').trim();
                o[paK] = (Number.isFinite(dn) && dn > 0 && ns !== '') ? String(Math.round((parseFloat(ns.replace(/[%,]/g, '')) || 0) / dn * 1000) / 10) : '';
            }
            if (reqCols.length && reqCols.some(c => !o[c])) return null;
            return colDefs.every(({ name }) => !o[name]) ? null : o;
        }).filter(Boolean);
        const colMids = {}; colDefs.forEach(cd => { if (cd.mid) colMids[cd.name] = cd.mid; });   // 3층 중간 라벨 (2026-08-24)
        return { year, headers: colDefs.map(c => c.name), colGroups, colMids, rows, reqCols };
    };
    const handleYearFilePick = async (e) => {
        const file = e.target?.files?.[0];
        if (yearFileRef.current) yearFileRef.current.value = '';
        if (!file || !isAdmin) return;
        setIsLoading(true);
        try {
            const XLSX = await loadXLSX();
            const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });   // 날짜복원용 Date 원본 (raw:false 결과엔 영향 없음)
            const sheets = wb.SheetNames.filter(sn => /^\d{4}$/.test(extractYear(sn))).map((sn, si) => {
                try { return { name: sn, ...parseSheetExact(XLSX, wb, sn, si) }; }
                catch (err) { return { name: sn, year: extractYear(sn), headers: [], colGroups: [], rows: [], error: err.message }; }
            });
            // 적재 단위 = 연도: 같은 해 탭(2017(C)+(P), 2018~21 (C)+(기타))은 합치고 열은 '엑셀에 있는 것'의 합집합(열 최다 탭 순서 기준).
            //   최신 연도는 카드 '한시트만'(2026+2026 (2) = 같은 12건 중복) → 열 최다 탭 1개만.
            const po2 = teamProfile?.파서옵션 || {};
            const byY = {}; sheets.forEach(sh => { (byY[sh.year] = byY[sh.year] || []).push(sh); });
            const latestY = Object.keys(byY).sort().pop();
            const entries = Object.keys(byY).sort((a, b) => b.localeCompare(a)).map(y => {
                let shs = byY[y]; let note = '';
                if (po2.한시트만 && y === latestY && shs.length > 1) {
                    const best = shs.reduce((m, s) => (s.headers.length > m.headers.length ? s : m), shs[0]);
                    note = `한시트만: "${best.name}" 사용 (${shs.filter(s => s !== best).map(s => s.name).join(', ')} 제외 — 같은 건 중복)`;
                    shs = [best];
                }
                const ordered = [...shs].sort((a, b) => b.headers.length - a.headers.length);   // 열 최다 탭의 순서를 기준 틀로
                const headers = []; const colGroups = [];
                ordered.forEach(s => {
                    (s.colGroups || []).forEach(g => {
                        const fresh = (g.cols || []).filter(c => !headers.includes(c));
                        if (!fresh.length) return;
                        fresh.forEach(c => headers.push(c));
                        const same = colGroups.find(x => x.label === g.label && g.label);
                        if (same) same.cols.push(...fresh); else colGroups.push({ label: g.label, cols: [...fresh] });
                    });
                    s.headers.forEach(h => { if (!headers.includes(h)) { headers.push(h); colGroups.push({ label: '', cols: [h] }); } });
                });
                const rows = shs.flatMap(s => s.rows);   // 탭 순서 = 엑셀 순서, 행 순서 그대로
                const colMids = {}; ordered.forEach(s => Object.assign(colMids, s.colMids || {}));   // 3층 중간 라벨 합집합 (2026-08-24)
                const errors = shs.filter(s => s.error).map(s => `${s.name}: ${s.error}`);
                return { year: y, name: shs.map(s => s.name).join(' + '), sheets: shs.map(s => s.name), headers, colGroups, colMids, rows, note, error: errors.join(' / ') || null };
            });
            setYearLoad({ fileName: file.name, sheets: entries, sel: null, report: null });
        } catch (err) { setAlertMsg(`파일 읽기 오류: ${err.message}`); }
        finally { setIsLoading(false); }
    };
    // 웹 저장본 ↔ 엑셀 시트 전수 대조: ① 열 이름·순서 ② 행 수 ③ 모든 셀 값
    const yearCompare = (sh) => {
        const webH = (fbByYear && fbByYear[sh.year] && fbByYear[sh.year].headers) || [];
        const webRows = fbRows.filter(r => String(r._year || '') === String(sh.year)).sort((a, b) => String(a._id).localeCompare(String(b._id)));
        const lines = [];
        const hdrOk = JSON.stringify(webH) === JSON.stringify(sh.headers);
        lines.push(`① 열: ${hdrOk ? `일치 (${sh.headers.length}개, 순서 동일)` : `불일치 — 웹 ${webH.length}개 / 엑셀 ${sh.headers.length}개`}`);
        if (!hdrOk) {
            const onlyWeb = webH.filter(h => !sh.headers.includes(h)), onlyXl = sh.headers.filter(h => !webH.includes(h));
            if (onlyWeb.length) lines.push(`   웹에만: ${onlyWeb.join(', ')}`);
            if (onlyXl.length) lines.push(`   엑셀에만: ${onlyXl.join(', ')}`);
            if (!onlyWeb.length && !onlyXl.length) lines.push('   (같은 열이지만 순서가 다름)');
        }
        lines.push(`② 행: ${webRows.length === sh.rows.length ? `일치 (${sh.rows.length}건)` : `불일치 — 웹 ${webRows.length}건 / 엑셀 ${sh.rows.length}건`}`);
        let cells = 0, bad = 0; const diffs = [];
        const n2 = Math.min(webRows.length, sh.rows.length);
        for (let i = 0; i < n2; i++) {
            sh.headers.forEach(h => {
                cells++;
                const a = String(webRows[i][h] ?? '').trim(), b = String(sh.rows[i][h] ?? '').trim();
                if (a !== b) { bad++; if (diffs.length < 15) diffs.push(`   행${i + 1} [${h}] 웹 "${a}" ≠ 엑셀 "${b}"`); }
            });
        }
        lines.push(`③ 값: ${bad === 0 ? `전부 일치 (${cells.toLocaleString()}칸)` : `불일치 ${bad}칸 / ${cells.toLocaleString()}칸`}`);
        lines.push(...diffs);
        if (bad > diffs.length) lines.push(`   … 외 ${bad - diffs.length}칸`);
        const ok = hdrOk && webRows.length === sh.rows.length && bad === 0;
        return { ok, text: `${ok ? '✅ 100% 일치' : '⚠ 불일치 있음'} — ${sh.year}년 (탭: ${sh.name})${sh.note ? `\n   ※ ${sh.note}` : ''}\n` + lines.join('\n') };
    };
    const handleYearLoad = async (sh) => {
        if (!isAdmin || !sh) return;
        const curRows = fbRows.filter(r => String(r._year || '') === String(sh.year));
        if (!window.confirm(`[${sh.year}년 1:1 적재]\n탭: ${sh.name} → 열 ${sh.headers.length}개 · 행 ${sh.rows.length}건${sh.note ? `\n※ ${sh.note}` : ''}\n\n웹의 ${sh.year}년 기존 ${curRows.length}건은 지우고 이 탭 그대로 넣습니다 (다른 연도 무접촉).\n진행할까요?`)) return;
        setIsLoading(true);
        try {
            let batch = writeBatch(db), cnt = 0;
            const bump = async () => { if (++cnt >= 400) { await batch.commit(); batch = writeBatch(db); cnt = 0; } };
            for (const r of curRows) { batch.delete(rowDocRef(currentTeam, r._id)); await bump(); }
            for (const r of sh.rows) { const { _id, ...rest } = r; batch.set(rowDocRef(currentTeam, _id), stampSave(rest)); await bump(); }
            if (cnt > 0) await batch.commit();
            const byYear = { ...(fbByYear || {}), [sh.year]: { headers: sh.headers, colGroups: sh.colGroups, colMids: sh.colMids || {} } };
            const isCur = String(sh.year) === String(new Date().getFullYear());
            // 메타 문서 통째 기록(merge 아님 — 지운 연도 키가 남지 않게). 올해면 팀 공통 헤더도 같이 갱신(홈 카드·다른 화면 호환)
            await setDoc(metaDocRef(currentTeam), { headers: (isCur || !(fbHeaders || []).length) ? sh.headers : fbHeaders, colGroups: (isCur || !(fbHeaders || []).length) ? sh.colGroups : fbColGroups, colMids: (isCur || !(fbHeaders || []).length) ? (sh.colMids || {}) : (fbColMids || {}), byYear, updatedAt: new Date().toISOString() });
            logAudit(currentTeam, { who: user?.email || '', action: AUDIT_ACTIONS.EDIT, projectName: `(${sh.year}년 1:1 적재)`,
                note: `연도별 1:1 적재: ${sh.year}년 시트 "${sh.name}" 열 ${sh.headers.length}·행 ${sh.rows.length} (기존 ${curRows.length}건 교체) — ${yearLoad?.fileName || ''}` });
            setSelectedYear(String(sh.year));
            setYearLoad(prev => prev ? { ...prev, sel: sh.name, report: `✔ ${sh.year}년 적재 완료 — 행 ${sh.rows.length}건 · 열 ${sh.headers.length}개\n잠시 후 [대조 검증]을 눌러 웹 저장본과 엑셀을 전수 비교하세요.` } : prev);
        } catch (err) { setAlertMsg(`적재 오류: ${err.message}`); }
        finally { setIsLoading(false); }
    };
    const handleYearDelete = async (year) => {
        if (!isAdmin) return;
        const cur = fbRows.filter(r => String(r._year || '') === String(year));
        if (!window.confirm(`[${year}년 웹에서 지우기]\n${cur.length}건 + 그 해 헤더 벌을 지웁니다 (다른 연도 무접촉). 진행할까요?`)) return;
        setIsLoading(true);
        try {
            let batch = writeBatch(db), cnt = 0;
            for (const r of cur) { batch.delete(rowDocRef(currentTeam, r._id)); if (++cnt >= 400) { await batch.commit(); batch = writeBatch(db); cnt = 0; } }
            if (cnt > 0) await batch.commit();
            const byYear = { ...(fbByYear || {}) }; delete byYear[year];
            await setDoc(metaDocRef(currentTeam), { headers: fbHeaders || [], colGroups: fbColGroups || [], colMids: fbColMids || {}, byYear, updatedAt: new Date().toISOString() });
            logAudit(currentTeam, { who: user?.email || '', action: AUDIT_ACTIONS.DELETE, projectName: `(${year}년 연도 삭제)`, note: `연도별 삭제: ${year}년 ${cur.length}건` });
            setYearLoad(prev => prev ? { ...prev, report: `🗑 ${year}년 ${cur.length}건 삭제 완료` } : prev);
        } catch (err) { setAlertMsg(`삭제 오류: ${err.message}`); }
        finally { setIsLoading(false); }
    };

    // ── 1층 백업 체계 (2026-08-20 팀장님) — 웹이 원본(어미)이 되는 단계 대비 ─────────────
    //   [전체 백업] = 행·표구조 + 주차장부·백로그·월간마감본·월간보고·팀설정까지 팀 전체를 JSON 1개로.
    //   [백업 복원] = 관리자 전용, 그 시점으로 되돌림 — 행·장부·마감본·월간보고는 교체, 팀설정은 병합,
    //   백로그(감사 기록)는 append-only 원칙이라 지우지도 되돌리지도 않음. 복원 직전 현재 상태 자동 백업(안전망).
    const collDump = async (name) => {   // 컬렉션 통째 → { 문서id: 값 }
        const snap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', name));
        const out = {}; snap.docs.forEach(d => { out[d.id] = d.data(); });
        return out;
    };
    const buildFullBackup = async () => {
        const [ledger, audit, snaps, monthly] = await Promise.all([
            collDump(`progressRecords_${currentTeam}`),
            collDump(`auditLog_${currentTeam}`),
            collDump(`projectListSnapshots_${currentTeam}`),
            collDump(`monthlyReport_${currentTeam}`),
        ]);
        const tsDoc = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'teamSettings'));
        return {
            format: 'PMS-FULL-1', team: currentTeam, savedAt: new Date().toISOString(),
            meta: { headers: fbHeaders, colGroups: fbColGroups, byYear: fbByYear || {}, colMids: fbColMids || {} },   // 팀 공통 헤더 + 연도별 헤더 벌 (2026-08-21·24)
            rows: fbRows, progressRecords: ledger, auditLog: audit,
            snapshots: snaps, monthlyReport: monthly,
            teamSettings: tsDoc.exists() ? (tsDoc.data()[currentTeam] || null) : null,
        };
    };
    const downloadFullBackup = async (payload, prefix) => {
        await loadFileSaver();
        const _bs = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '_');
        window.saveAs(new Blob([JSON.stringify(payload, null, 1)], { type: 'application/json' }), `${prefix}_${currentTeam}_${_bs}.json`);
    };
    const handleFullBackup = async () => {
        if (!isAdmin) { setAlertMsg('전체 백업은 관리자만 할 수 있습니다.'); return; }
        if (dataSource !== 'firebase') { setAlertMsg('클라우드 데이터 상태에서만 백업할 수 있습니다.'); return; }
        setIsLoading(true);
        try {
            const payload = await buildFullBackup();
            await downloadFullBackup(payload, 'PMS전체백업');
            setAlertMsg(`전체 백업 완료!\n\n프로젝트 행 ${payload.rows.length}건 · 진행실적 장부 ${Object.keys(payload.progressRecords).length}건\n백로그 ${Object.keys(payload.auditLog).length}건 · 월간마감본 ${Object.keys(payload.snapshots).length}건 · 월간보고 ${Object.keys(payload.monthlyReport).length}건 · 팀설정 ${payload.teamSettings ? '포함' : '없음'}\n\n★ 내려받은 파일을 NAS 백업 폴더에 옮겨 두세요 (주 1회 권장)`);
        } catch (err) { setAlertMsg(`전체 백업 오류: ${err.message}`); }
        finally { setIsLoading(false); }
    };
    const handleRestorePick = async (e) => {
        const file = e.target?.files?.[0];
        if (restoreFileRef.current) restoreFileRef.current.value = '';
        if (!file) return;
        if (!isAdmin) { setAlertMsg('백업 복원은 관리자만 할 수 있습니다.'); return; }
        if (dataSource !== 'firebase') { setAlertMsg('클라우드 데이터 상태에서만 복원할 수 있습니다.'); return; }
        setIsLoading(true);
        try {
            const bk = JSON.parse(await file.text());
            if (bk.format !== 'PMS-FULL-1') { setAlertMsg('전체 백업 파일이 아닙니다.\n[전체 백업]으로 만든 PMS전체백업_*.json만 복원할 수 있습니다.\n(옛 ProjectList백업 파일은 행·표구조만 담겨 있어 이 기능 대상이 아닙니다)'); return; }
            if (bk.team !== currentTeam) { setAlertMsg(`팀이 다릅니다.\n백업 파일 = ${bk.team} / 현재 화면 = ${currentTeam}`); return; }
            const bkRows = Array.isArray(bk.rows) ? bk.rows : [];
            const bkLedger = bk.progressRecords || {}, bkSnaps = bk.snapshots || {}, bkMonthly = bk.monthlyReport || {};
            if (!window.confirm(`[백업 복원] ${bk.team}\n백업 시점: ${String(bk.savedAt).slice(0, 16).replace('T', ' ')}\n\n지금 클라우드 데이터를 이 시점으로 되돌립니다:\n· 프로젝트 행 ${fbRows.length}건 → ${bkRows.length}건 (교체)\n· 진행실적 장부 → ${Object.keys(bkLedger).length}건 (교체)\n· 표 구조·마감본 ${Object.keys(bkSnaps).length}건·월간보고 ${Object.keys(bkMonthly).length}건·팀설정 → 백업 값으로\n· 백로그(감사 기록)는 지우지 않고 그대로 둡니다\n\n복원 직전, 현재 상태의 전체 백업이 자동 다운로드됩니다(안전망).\n진행할까요?`)) return;
            // 0) 안전망 — 현재 상태 먼저 통째 백업
            await downloadFullBackup(await buildFullBackup(), 'PMS복원직전백업');
            let batch = writeBatch(db), cnt = 0;
            const bump = async (n) => { cnt += n; if (cnt >= 400) { await batch.commit(); batch = writeBatch(db); cnt = 0; } };
            // 1) 프로젝트 행 = 교체 (지금 행 전부 삭제 → 백업 행 기록. 값·도장·이력까지 백업 원문 그대로)
            for (const r of fbRows) { batch.delete(rowDocRef(currentTeam, r._id)); await bump(1); }
            for (const r of bkRows) { const { _id, ...rest } = r; batch.set(rowDocRef(currentTeam, _id), rest); await bump(1); }
            // 2) 표 구조(메타)
            batch.set(metaDocRef(currentTeam), { headers: bk.meta?.headers || [], colGroups: bk.meta?.colGroups || [], byYear: bk.meta?.byYear || {}, colMids: bk.meta?.colMids || {}, updatedAt: new Date().toISOString() }); await bump(1);
            // 3) 진행실적 장부 = 교체
            const curLed = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', `progressRecords_${currentTeam}`));
            for (const d of curLed.docs) { if (!bkLedger[d.id]) { batch.delete(d.ref); await bump(1); } }
            for (const [id, v] of Object.entries(bkLedger)) { batch.set(doc(db, 'artifacts', appId, 'public', 'data', `progressRecords_${currentTeam}`, id), v); await bump(1); }
            // 4) 월간 마감본 = 교체
            const curSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', `projectListSnapshots_${currentTeam}`));
            for (const d of curSnap.docs) { if (!bkSnaps[d.id]) { batch.delete(d.ref); await bump(1); } }
            for (const [id, v] of Object.entries(bkSnaps)) { batch.set(doc(db, 'artifacts', appId, 'public', 'data', `projectListSnapshots_${currentTeam}`, id), v); await bump(1); }
            // 5) 월간보고 = 교체
            const curMon = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', `monthlyReport_${currentTeam}`));
            for (const d of curMon.docs) { if (!bkMonthly[d.id]) { batch.delete(d.ref); await bump(1); } }
            for (const [id, v] of Object.entries(bkMonthly)) { batch.set(doc(db, 'artifacts', appId, 'public', 'data', `monthlyReport_${currentTeam}`, id), v); await bump(1); }
            // 6) 팀설정 = 병합 (이 팀 조각만 — 다른 팀 설정 안 건드림)
            if (bk.teamSettings) { batch.set(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'teamSettings'), { [currentTeam]: bk.teamSettings }, { merge: true }); await bump(1); }
            if (cnt > 0) await batch.commit();
            logAudit(currentTeam, { who: user?.email || '', action: AUDIT_ACTIONS.EDIT, projectName: '(백업 복원)',
                note: `백업 복원: ${String(bk.savedAt).slice(0, 16)} 시점으로 — 행 ${bkRows.length}건 · 장부 ${Object.keys(bkLedger).length}건 — ${file.name}` });
            setAlertMsg(`백업 복원 완료!\n\n${String(bk.savedAt).slice(0, 16).replace('T', ' ')} 시점으로 되돌렸습니다.\n행 ${bkRows.length}건 · 장부 ${Object.keys(bkLedger).length}건 · 마감본 ${Object.keys(bkSnaps).length}건\n(복원 직전 상태도 백업 파일로 내려받아졌으니, 잘못 복원했다면 그 파일로 다시 복원하면 됩니다)`);
        } catch (err) { setAlertMsg(`백업 복원 오류: ${err.message}`); }
        finally { setIsLoading(false); }
    };

    // ── 로컬 데이터 삭제 ─────────────────────────────────────────────────
    const handleDeleteLocal = async () => {
        try { await idbDelete(currentTeam); setLocalData(null); addLog(`[로컬DB] 삭제 완료`); }
        catch (err) { setAlertMsg(`로컬 삭제 오류: ${err.message}`); }
    };

    // ── 번호 3자리 일괄 정리 (2026-07-20 팀장님) — 엑셀 업로드 없이, 이미 저장된 1·2자리 번호를 001 형태로 ──
    //   대상 = 이 팀 전체 연도의 숫자 1~2자리 번호. 번호 칸만 merge 저장(다른 값·pid·이력 안 건드림).
    //   문자('SM' 등)·빈칸(하위 행 포함)·이미 3자리는 건너뜀. 관리자 전용.
    const handlePadAllNumbers = async () => {
        if (!isAdmin) { setAlertMsg('관리자만 실행할 수 있습니다.'); return; }
        if (dataSource !== 'firebase') { setAlertMsg('클라우드 데이터 상태에서만 실행할 수 있습니다.\n(엑셀 업로드 미리보기 중이면 확정 저장 또는 업로드 취소 후 실행하세요)'); return; }
        const noCol = projNoColOf() || '번호';   // 팀 번호 열('번호' 또는 기술1팀 '순번') — 종전엔 '번호'만 봐서 기술1팀은 대상 0건 (2026-08-27)
        const targets = fbRows.filter(r => {
            const v = String(r[noCol] ?? '').trim();
            return v && padProjectNo(v) !== v;
        });
        if (!targets.length) { setAlertMsg(`정리할 ${noCol}가 없습니다 — 전부 3자리(또는 문자·빈칸)입니다.`); return; }
        const sample = targets.slice(0, 3).map(r => `${r[noCol]}→${padProjectNo(r[noCol])}`).join(', ');
        if (!window.confirm(`[번호 3자리 일괄 정리]\n\n${targets.length}건의 번호를 3자리로 바꿉니다 (전체 연도 대상).\n예: ${sample}${targets.length > 3 ? ' …' : ''}\n\n번호 칸만 바뀌고 다른 값·pid·이력은 건드리지 않습니다.\n진행할까요?`)) return;
        setIsLoading(true);
        try {
            let batch = writeBatch(db), cnt = 0;
            for (const r of targets) {
                batch.set(rowDocRef(currentTeam, r._id), { [noCol]: padProjectNo(r[noCol]) }, { merge: true });   // 팀 번호 열(번호/순번) (2026-08-27)
                if (++cnt >= 400) { await batch.commit(); batch = writeBatch(db); cnt = 0; }
            }
            if (cnt > 0) await batch.commit();
            addLog(`[번호정리] ${targets.length}건 3자리 패딩 완료`);
            setAlertMsg(`번호 3자리 정리 완료!\n${targets.length}건 변경 (예: 1→001)`);
        } catch (err) { setAlertMsg(`번호 정리 오류: ${err.message}`); }
        finally { setIsLoading(false); }
    };

    // ── 단일 필드 변경 이력 엔트리 생성 ──────────────────────────────────
    const makeChangeEntry = (row, key, newValue) => {
        const from = String(row?.[key] ?? '');
        const to   = String(newValue ?? '');
        if (from === to) return null;
        return { datetime: new Date().toISOString(), changes: [{ field: key, from, to }] };
    };
    // 변경 이력 상한 300건 (2026-08-26): 무제한이면 행 문서가 저장마다 커져 업로드·응답·에코가 느려지고 1MB 한도 위험
    const HIST_MAX = 300;
    const pushChangeHist = (row, entry) => {
        const base = Array.isArray(row._changeHistory) ? row._changeHistory : [];
        const arr = entry ? [...base, entry] : base;
        return arr.length > HIST_MAX ? arr.slice(arr.length - HIST_MAX) : arr;
    };

    // ── 동시 편집 안전장치 (2026-07-14) ────────────────────────────────────────
    //  ① stampSave = 저장할 때마다 '누가·언제' 도장(_updatedAt/_updatedBy)을 찍는다.
    //  ② findConflicts = 상세팝업 저장 직전, 서버 최신본과 '팝업을 열 때의 원본'을 대조해
    //     내가 고친 칸을 그 사이 다른 사람이 먼저 고쳤는지 찾는다(겹치는 칸만 = 오탐 방지).
    //     서로 다른 칸이면 기존 병합 로직(latest + popupChanges)이 양쪽 다 살리므로 경고하지 않는다.
    const stampSave = (data) => ({
        ...data,
        _updatedAt: new Date().toISOString(),
        _updatedBy: user?.email || '',
    });
    const findConflicts = async (rowId, myKeys) => {
        if (dataSource !== 'firebase' || !rowId || !myKeys.length) return null;
        try {
            const snap = await getDoc(rowDocRef(currentTeam, rowId));
            if (!snap.exists()) return null;
            const server = snap.data();
            const base   = detailRowOriginal || {};
            const who    = String(server._updatedBy || '');
            if (who && who === String(user?.email || '')) return null;    // 내가 방금 고친 것 → 충돌 아님
            const fields = myKeys.filter(h => String(server[h] ?? '') !== String(base[h] ?? ''));
            if (!fields.length) return null;                              // 겹치는 칸 없음 → 병합으로 둘 다 보존
            return { who, at: server._updatedAt || '', fields, server };
        } catch (e) { return null; }   // 확인 실패 시 저장을 막지 않음(기존 동작 유지)
    };

    // ── 인라인(표에서 바로 수정)용 동시수정 감지 (2026-07-14) ──────────────────
    //  editOrigRef = 셀 편집을 '시작한 순간'의 값. 편집하는 동안 실시간 구독으로 화면값이
    //  바뀌어도 이 원본은 그대로 두어야, 그 사이 남이 고친 걸 잡아낼 수 있다.
    const editOrigRef = useRef(null);   // { id, key, value }
    // ★ 키인 속도 (2026-08-25 팀장님 "예전보다 너무 느림"): 편집 칸이 제어형(value=state)이라 한 글자마다
    //   화면 전체(2,198행 데이터·표 188×30칸) 재렌더 → 14개년 적재(8/24) 후 체감 급락. 입력 중 값은 ref에만 두고
    //   (비제어 defaultValue) Enter/이동(blur) 때만 doCommitCell로 넘긴다. 저장 로직은 불변.
    const editWRef = useRef(0);   // 편집 시작 시 칸 내용 폭(px) — 입력창을 이 폭으로 고정해 열 재분배(표 전체 재배치) 방지 (2026-08-26)
    const editValRef = useRef('');
    const datePickRef = useRef(null);   // 날짜 편집 달력(숨은 date input) — 편집중인 칸은 항상 1개 (2026-09-02)
    const editDirtyRef = useRef(false);   // 편집창에서 실제 타이핑했는지 — ←/→를 '칸 이동'으로 쓸지 판단 (2026-09-03 엑셀 입력모드)
    useEffect(() => {
        editDirtyRef.current = false;
        editValRef.current = String(editingCell.value ?? '');   // 편집 시작 값으로 초기화 (타이핑 없이 바로 이동해도 원값 보존)
        if (!editingCell.id || !editingCell.key) { editOrigRef.current = null; return; }
        const cur = editOrigRef.current;
        if (cur && cur.id === editingCell.id && cur.key === editingCell.key) return;   // 같은 셀 편집 중 → 원본 유지
        const r = activeRows.find(x => x._id === editingCell.id);
        editOrigRef.current = { id: editingCell.id, key: editingCell.key, value: String(r?.[editingCell.key] ?? '') };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editingCell.id, editingCell.key]);

    // 칸 하나만 비교 — 내가 편집을 시작할 때 보던 값과 서버 최신값이 다르면 = 그 사이 남이 고침
    const findCellConflict = async (rowId, key, baseVal) => {
        if (dataSource !== 'firebase' || !rowId || !key) return null;
        try {
            // ★ 서버 getDoc(왕복 1회) 대신 실시간 구독 메모리(fbRows) — onSnapshot이 항상 최신이라 결과 동일, 대기 0 (2026-08-25 속도)
            const server = fbRows.find(r => r._id === rowId);
            if (!server) return null;
            const who = String(server._updatedBy || '');
            if (who && who === String(user?.email || '')) return null;              // 내가 방금 고친 것
            if (String(server[key] ?? '') === String(baseVal ?? '')) return null;   // 그대로 → 충돌 아님
            return { who, at: server._updatedAt || '', fields: [key], server };
        } catch (e) { return null; }
    };
    // ★ 장부(progressRecords) 쓰기 직렬 큐 (2026-08-25): 저장을 낙관적으로(편집창 먼저 닫음) 바꾸면서
    //   연속 키인의 장부 쓰기가 겹칠 수 있음 → 같은 '읽고 통째로 쓰기' 패턴이라 반드시 한 줄로 세움 (8/19 ETOS 소실 재발 방지)
    const ledgerQRef = useRef(Promise.resolve());
    // ★ 장부 직전 쓰기 최신본 캐시 (2026-08-27): 초안 [저장]이 한 행의 여러 칸을 밀리초 간격으로 연속 쓰는데,
    //   각 쓰기가 실시간 구독본(progressRecordsMap)을 읽으면 에코가 못 따라와 뒤 쓰기가 앞 쓰기를 통째로 지움
    //   (PLC·ETOS·HMI 소실 — 실기 재현으로 확정). 15초 안에 내가 쓴 최신본이 있으면 그것을 base로 사용.
    const ledgerFreshRef = useRef({});   // { docKey: { at, data } }
    const queueLedger = (fn) => { const p = ledgerQRef.current.then(fn, fn); ledgerQRef.current = p.catch(() => {}); return p; };

    // ── 인라인 셀 편집 ────────────────────────────────────────────────────
    //   onBlur={commitCellEdit} 로도 불리므로(이벤트 객체가 인자로 들어옴) 저장 본체는 doCommitCell로 분리.
    const commitCellEdit = () => {
        const ec = { ...editingCell, value: editValRef.current };
        const nav = kbNavRef.current; kbNavRef.current = null;
        const p = doCommitCell(ec, false);
        if (nav && ec.id) Promise.resolve(p).then(() => moveCursorFromRef.current(ec, nav));   // 엑셀식: 저장 후 커서 이동 (2026-09-03)
        return p;
    };
    const doCommitCell = async (editingCell, isForce) => {
        if (!editingCell.id || !editingCell.key) return;
        // ★ 0 입력 = 지우기(빈칸) 통일 (2026-08-27 팀장님): 팝업 규칙(7/10 '0입력→빈칸·이월유지')을 메인표에도.
        //   대상 = 팝업과 동기화되는 칸(공정률 7개·Point) + 포인트(총점 — 0 만점은 의미 없음, 2026-08-27 실기 확인).
        if ((progItemKeyOf(editingCell.key) || isAccPointCol(editingCell.key) || isPointCol(editingCell.key))
            && String(editingCell.value ?? '').trim() !== ''
            && Number(String(editingCell.value).replace(/[,%]/g, '')) === 0) {
            editingCell = { ...editingCell, value: '' };
        }
        const srcRow = activeRows.find(r => r._id === editingCell.id);
        // ★ 직원 이름 칸 직책 자동 (2026-09-04 팀장님): 담당자·관리자 칸에 이름만 키인해도 팀 명단에서 찾아 '이름 직책'으로 완성
        //   (기술 1팀 담당자식 칸은 '이름만 저장'이 원칙이라 제외 · 발주처 고객 담당자 칸도 제외 · 명단에 없는 이름은 그대로)
        if ((isAssigneeCol(editingCell.key) || isManagerCol(editingCell.key)) && !isCustAsgCol(editingCell.key) && !isCardAsgCol(editingCell.key)
            && String(editingCell.value ?? '').trim() !== '') {
            const _fixed = splitAssigneeCell(editingCell.value).map(t => asgTitleOf(t)).filter(Boolean).join(' ');
            if (_fixed && _fixed !== String(editingCell.value)) editingCell = { ...editingCell, value: _fixed };
        }
        // 날짜 칸 (2026-09-02 팀장님: 엑셀처럼 자유 타이핑·달력·Del 지우기):
        //   ① 입력을 표준 날짜로 해석(260126·26/01/26·2026-01-26 등, 연도 없는 M/D는 행 연도)
        //   ② 못 알아보면 안내 후 저장 안 함(오염 방지) ③ 원본과 같으면 스킵 — 비표준 날짜 클릭만 해도 빈칸 덮던 버그 방지(2026-06-29 유지)
        if (isDateCol(editingCell.key)) {
            const _rawIn = String(editingCell.value ?? '').trim();
            const _origD = String(displayDate(srcRow?.[editingCell.key] ?? '', srcRow?._year));
            let _normD = _rawIn === '' ? '' : parseDateFlex(_rawIn);
            if (_normD === null) { const _d2 = String(displayDate(_rawIn, srcRow?._year)); _normD = /^\d{4}-\d{2}-\d{2}$/.test(_d2) ? _d2 : null; }   // ★displayDate는 해석 불가 시 원본을 돌려줌(682행) — 진짜 날짜만 인정 (2026-09-02, 실기 테스트가 잡은 버그)
            if (_normD === null) { setAlertMsg(`날짜를 알아볼 수 없어요: "${_rawIn}"\n예: 260126 · 26/01/26 · 2026-01-26`); setEditingCell({ id: null, key: null, value: '' }); return; }
            if (_normD === _origD) { setEditingCell({ id: null, key: null, value: '' }); return; }
            editingCell = { ...editingCell, value: _normD };
        }
        // ② 내용↔날짜 연동: '내용' 칸을 실제로 바꿨으면 같은 줄 '날짜'도 오늘로 함께 저장
        // 포인트 칸 = 엑셀 '포인트' 값 그대로 편집·저장 (2026-07-21 팀장님: '실적/총점' 복합표시 폐지)
        const patch = { [editingCell.key]: isProjNoCol(editingCell.key) ? padProjectNo(editingCell.value) : isExecAssignRowCol(srcRow, editingCell.key) ? execNoNorm(editingCell.value) : editingCell.value };   // 번호 3자리 통일 (2026-07-20) · 수행번호 YY-NNN은 당해 연도 실제 수행번호 칸만 (2026-08-24)
        // ★ 수행번호 중복 차단 (2026-08-28 팀장님): 같은 연도 다른 메인 행(초안 포함)과 겹치면 키인 단계에서 거부
        if (srcRow && isExecAssignRowCol(srcRow, editingCell.key) && !isSubListRow(srcRow)) {
            const dup = execDupOf(srcRow._id, srcRow._year, editingCell.key, patch[editingCell.key]);
            if (dup) { setAlertMsg(execDupMsg(patch[editingCell.key], dup)); setEditingCell({ id: null, key: null, value: '' }); return; }
        }
        // ★ 프로젝트 번호 중복 차단 (2026-09-01 팀장님): 번호 수동 키인 — 같은 연도 다른 메인 행(초안 포함)과 겹치면(001=01=1) 키인 단계에서 거부
        if (srcRow && isProjNoCol(editingCell.key) && !isSubListRow(srcRow) && String(patch[editingCell.key] ?? '').trim() !== '') {
            const dupN = projNoDupOf(patch[editingCell.key], srcRow._year, srcRow._id);
            if (dupN) { setAlertMsg(projNoDupMsg(patch[editingCell.key], dupN)); setEditingCell({ id: null, key: null, value: '' }); return; }
        }
        // ★ 수식 재계산 (2026-08-19, 기술1팀): 트리거 칸(PLC·ETOS·HMI·총물량·금월)을 고치면 자동 칸 함께 갱신
        //   (2026-08-20 팀장님: 팝업 자체시운전 = 메인표와 별개 운영 — 금월 키인을 주차장부로 밀어넣던 자동은 폐지, 사람이 팝업에서 직접 키인)
        //   ★ 값이 실제로 바뀐 경우에만 (2026-08-28 팀장님: ETOS 칸을 클릭만 하고 나와도 누적·전체·금월이 0 노란 칸으로 잡히던 버그 —
        //     빈칸 행에서 재계산이 '0' 문자열을 만들어 ''→'0' 변경으로 초안에 올라감)
        const cellChanged = String(srcRow?.[editingCell.key] ?? '') !== String(patch[editingCell.key] ?? '');
        if (cellChanged && srcRow && fmActive(srcRow) && fmTrigSet.has(fmNorm(editingCell.key))) {
            Object.assign(patch, fmRecalc({ ...srcRow, ...patch }, srcRow));
        }
        // ★ 진행율% 자동 (2026-08-24): 포인트(Total)·Point를 고치면 진행율% 함께 갱신
        if (cellChanged && srcRow && paTrigger(editingCell.key)) Object.assign(patch, paRecalc({ ...srcRow, ...patch }));
        const contentChanged = isProgressContentCol(editingCell.key)
            && String(srcRow?.[editingCell.key] ?? '') !== String(editingCell.value ?? '');
        if (contentChanged) {
            const today = new Date().toISOString().slice(0, 10);
            activeHeaders.forEach(h => { if (isProgressDateCol(h)) patch[h] = today; });
        }
        // 변경 이력: 실제로 바뀐 필드(내용, 그리고 따라 바뀐 날짜)를 함께 기록
        const changes = Object.keys(patch)
            .filter(k => !k.startsWith('_'))   // 내부 필드(_accBase 등)는 변경이력·백로그에서 제외 (2026-08-19)
            .map(k => ({ field: k, from: String(srcRow?.[k] ?? ''), to: String(patch[k] ?? '') }))
            .filter(c => c.from !== c.to);
        const entry = changes.length ? { datetime: new Date().toISOString(), changes } : null;
        // ★ 역방향 동기화(2026-07-10): 공정률 7개 셀이면 진행실적 주차장부에도 반영 → 팝업 합계와 양방향 일치.
        //    (progItemKeyOf가 공정률 7개만 통과시키므로 포인트·시운전·날짜·상태는 자동 제외)
        if (dataSource !== 'firebase') {
            // ★순차 await 필수 (2026-08-19 버그): 두 기록이 같은 장부 문서를 '읽고 통째로 다시 쓰기'라
            //   동시에 나가면 나중 쓰기가 먼저 쓰기를 덮음(ETOS 키인이 자체시운전 기록에 지워지던 원인)
            await queueLedger(() => syncProgressCellToLedger(srcRow, editingCell.key, editingCell.value));
            {   // Point(실적) 키인 → 장부 증분 동기화 — 감소면 저장 전체 중단 (2026-08-25)
                const accR = await queueLedger(() => syncAccPointToLedger(srcRow, editingCell.key, editingCell.value));
                if (!accR.ok) { setAlertMsg(accSyncBlockMsg(editingCell.value, accR.sum, accR.cur)); setEditingCell({ id: null, key: null, value: '' }); return; }
            }
            const updater = rows => rows.map(r => {
                if (r._id !== editingCell.id) return r;
                return { ...r, ...patch, _changeHistory: pushChangeHist(r, entry) };
            });
            if (dataSource === 'pending') setPendingData(p => ({ ...p, rows: updater(p.rows) }));
            if (dataSource === 'local')   setLocalData(p => ({ ...p, rows: updater(p.rows) }));
            setEditingCell({ id: null, key: null, value: '' });
            return;
        }
        const row = fbRows.find(r => r._id === editingCell.id);
        if (!row) { setEditingCell({ id: null, key: null, value: '' }); return; }
        // ★ 동시수정 감지 (2026-07-14): 편집을 시작할 때 보던 값 ↔ 서버 최신값 비교
        //   (이미 초안이 있는 칸은 '내 초안값 ≠ 서버값'이 정상이라 여기선 건너뛰고 [저장] 직전 검사에 맡김 — 2026-08-27)
        if (!isForce && !hasDraftCell(editingCell.id, editingCell.key)) {
            const o = editOrigRef.current;
            const baseVal = (o && o.id === editingCell.id && o.key === editingCell.key)
                ? o.value : String(srcRow?.[editingCell.key] ?? '');
            const cf = await findCellConflict(editingCell.id, editingCell.key, baseVal);
            if (cf) {
                const cell = { ...editingCell };   // 확인창을 띄우는 사이 상태가 바뀌어도 내 입력값 보존
                setConflictDlg({
                    ...cf,
                    mine: { [cell.key]: cell.value },
                    onOverwrite: () => { setConflictDlg(null); setEditingCell({ id: null, key: null, value: '' }); doCommitCell(cell, true); },
                    onCancel:    () => { setConflictDlg(null); setEditingCell({ id: null, key: null, value: '' }); },
                });
                return;
            }
        }
        // ★ 역방향 동기화(공정률 7개 → 진행실적 주차장부)는 '저장이 확정된 뒤'에만 —
        //   충돌 확인창에서 [취소]를 눌렀는데 주차장부만 바뀌는 일을 막는다 (2026-07-14)
        // ★순차 await 필수 (2026-08-19 버그): 같은 장부 문서 동시 쓰기 = 나중 것이 먼저 것을 덮음 (ETOS 소실 원인)
        {   // Point(실적) 키인 → 장부 증분 동기화 — 감소면 메인표 저장까지 전체 중단 (2026-08-25)
            //   Point 칸일 때만 장부를 읽으므로(왕복 1회) PLC·ETOS·HMI 등은 대기 없이 통과
            const accR = await queueLedger(() => syncAccPointToLedger(row, editingCell.key, editingCell.value, { checkOnly: true }));
            if (!accR.ok) { setAlertMsg(accSyncBlockMsg(editingCell.value, accR.sum, accR.cur)); setEditingCell({ id: null, key: null, value: '' }); return; }
        }
        // ★ 낙관적 저장 (2026-08-25 팀장님 "키인 너무 느림·멈춤"): 종전엔 충돌검사 getDoc → 장부 getDoc+setDoc → 행 setDoc을
        //   전부 기다린 뒤에야 편집창이 닫혀 Enter마다 클라우드 왕복 3~4회를 그대로 체감. 이제 행 저장을 먼저 던지고(Firestore가
        //   로컬 스냅샷을 즉시 줘서 표에는 바로 반영) 편집창을 곧바로 닫는다. 장부 기록은 뒤에서 직렬 큐로(순서·안전 동일).
        // ★ 변경 칸만 전송 (2026-08-26 속도): 종전엔 행 전체(수십 칸+이력+NAS 정보)를 매번 통째로 보내 업로드·확정·에코가 비쌌음.
        //   merge=true → 고친 칸·도장·이력만 올라가고 나머지 칸은 서버 값 그대로 (삭제 없음 = 종전과 동일 결과)
        // ★ 초안 적재 (2026-08-27 팀장님): 즉시 저장 대신 초안에 모음 → 표에는 overlay로 바로 보임(노란 칸) → [저장 N칸]에서 행별 1회 저장.
        //   백로그·장부 동기화(공정률→주차장부, Point→증분)도 [저장] 때 최종값으로 1번.
        if (!entry) { setEditingCell({ id: null, key: null, value: '' }); return; }   // 값이 안 바뀜 = 초안 안 만듦
        const _chg = new Set(entry.changes.map(c => c.field));   // 노란 칸 = 실제 저장될 변경 칸만 (2026-08-27: 값 그대로인 자동 동반 칸 제외)
        const patch2 = {};
        Object.keys(patch).forEach(k => { if (k.startsWith('_') || _chg.has(k)) patch2[k] = patch[k]; });
        addDraft(row._id, patch2, { [editingCell.key]: String(row[editingCell.key] ?? '') }, { [editingCell.key]: editingCell.value }, entry);
        setEditingCell({ id: null, key: null, value: '' });
    };

    // ── ★ 초안 저장/취소 (2026-08-27) ─────────────────────────────────────
    const saveDraft = async (force = false) => {
        const d = draftRef.current; const ids = Object.keys(d);
        if (!ids.length || draftSaving || dataSource !== 'firebase') return;
        const nameOf = (r) => String((projectNameCol && r[projectNameCol]) || r._id || '');
        // ★ 수행번호 중복 최종 검사 (2026-08-28): 초안에 든 수행번호가 다른 행(기존·초안)과 겹치면 저장 보류 (노란 칸 유지)
        {
            const dups = [];
            ids.forEach(id => {
                const r = activeRowsRef.current.find(x => x._id === id); if (!r || isSubListRow(r)) return;
                Object.keys(d[id].patch || {}).forEach(k => {
                    if (isExecAssignRowCol(r, k)) {
                        const dup = execDupOf(id, r._year, k, d[id].patch[k]);
                        if (dup) dups.push(`· ${nameOf(r)} — 수행번호 '${execNoNorm(d[id].patch[k])}' ↔ ${nameOf(dup)}`);
                    }
                    // ★ 프로젝트 번호도 최종 중복 검사 (2026-09-01 팀장님, 001=01=1)
                    if (isProjNoCol(k) && String(d[id].patch[k] ?? '').trim() !== '') {
                        const dupN = projNoDupOf(d[id].patch[k], r._year, id);
                        if (dupN) dups.push(`· ${nameOf(r)} — 번호 '${String(d[id].patch[k]).trim()}' ↔ ${nameOf(dupN)}`);
                    }
                });
            });
            if (dups.length) { setAlertMsg(`⛔ 번호 중복 — 저장할 수 없습니다!\n\n${dups.slice(0, 8).join('\n')}${dups.length > 8 ? '\n…' : ''}\n\n겹치는 행의 번호를 고치거나 [취소]로 되돌린 뒤 다시 저장해 주세요.`); return; }
        }
        // 동시수정 검사: 편집 시작 때 서버 값(orig) ≠ 지금 서버 값 → 그 사이 다른 사람이 고침 (내 값과 같으면 무시)
        if (!force) {
            const conflicts = [];
            ids.forEach(id => {
                const sv = fbRows.find(r => r._id === id); if (!sv) return;
                Object.keys(d[id].orig || {}).forEach(k => {
                    const now = String(sv[k] ?? '');
                    if (now !== String(d[id].orig[k] ?? '') && now !== String(d[id].patch[k] ?? '')) conflicts.push(`· ${nameOf(sv)} — ${k}: 서버 '${now}' ↔ 내 값 '${d[id].patch[k] ?? ''}'`);
                });
            });
            if (conflicts.length) {
                const ok = window.confirm(`다른 사람이 먼저 고친 칸이 ${conflicts.length}개 있습니다:\n\n${conflicts.slice(0, 8).join('\n')}${conflicts.length > 8 ? '\n…' : ''}\n\n내 값으로 덮어쓸까요? (취소 = 저장 보류, 노란 칸 유지)`);
                if (!ok) return;
            }
        }
        setDraftSaving(true);
        let okRows = 0, okCells = 0;
        try {
            for (const id of ids) {
                const sv = fbRows.find(r => r._id === id);
                const { patch = {}, edited = {}, entries = [] } = d[id] || {};
                if (sv) {
                    let hist = Array.isArray(sv._changeHistory) ? sv._changeHistory : [];
                    entries.forEach(en => { hist = pushChangeHist({ _changeHistory: hist }, en); });
                    await setDoc(rowDocRef(currentTeam, id), stampSave({ ...patch, _changeHistory: hist }), { merge: true });   // 변경 칸만(merge) · 행당 1회
                    const allChanges = entries.flatMap(en => (en && en.changes) || []);
                    if (allChanges.length) {   // 백로그 1건/행 — 상태를 보류·삭제로 바꿨으면 그 동작으로 기록
                        let act = AUDIT_ACTIONS.EDIT;
                        const stKey = Object.keys(patch).find(k => isStatusCol(k));
                        if (stKey) { const v = String(patch[stKey] ?? '').replace(/\s/g, '').toUpperCase(); if (v === 'HOLD' || v === '보류') act = AUDIT_ACTIONS.HOLD; else if (v === '삭제' || v === 'DELETE') act = AUDIT_ACTIONS.DELETE; }
                        recordAudit(act, { ...sv, ...patch }, allChanges);
                    }
                    // 장부 동기화 = 내가 직접 친 칸만(파생 칸 제외), 최종값으로 1번 — 함수가 공정률 7개/Point 칸을 스스로 가려냄
                    const finalRow = { ...sv, ...patch };
                    for (const k of Object.keys(edited)) {
                        await queueLedger(() => syncProgressCellToLedger(finalRow, k, edited[k]));
                        const accR = await queueLedger(() => syncAccPointToLedger(finalRow, k, edited[k]));
                        if (accR && accR.ok === false) setAlertMsg(accSyncBlockMsg(edited[k], accR.sum, accR.cur));
                    }
                    okRows++; okCells += Object.keys(edited).length;
                }
                // 행 단위로 초안 비움 (중간 오류 시 남은 행만 노란 칸으로 남음 · 사라진 행의 초안은 버림)
                setDraft(prev => { if (!prev[id]) return prev; const n = { ...prev }; delete n[id]; return n; });
            }
            showExtToast(`저장 완료 — ${okRows}행 ${okCells}칸`);
        } catch (err) {
            setAlertMsg(`저장 오류: ${err.message}\n\n저장되지 않은 행은 노란 칸으로 남아 있습니다 — 다시 [저장]을 눌러 주세요.`);
        } finally { setDraftSaving(false); }
    };
    saveDraftRef.current = () => saveDraft();
    const discardDraft = () => {
        const n = draftCellCount; if (!n || draftSaving) return;
        if (!window.confirm(`임시 편집 ${n}칸을 모두 되돌릴까요? (서버 값으로 복구)`)) return;
        setDraft({});
    };

    // ── 직접 셀 값 저장 (상태·담당자 드롭다운용) ─────────────────────────
    const appendStatusHistory = (row, key, value) => {
        if (!isStatusCol(key)) return row._statusHistory || [];
        const today = new Date().toISOString().slice(0, 10);
        const prev  = row._statusHistory || [];
        const last  = prev[prev.length - 1];
        if (last && last.status === value && last.date === today) return prev;
        return [...prev, { date: today, status: value }];
    };

    const commitCellWith = async (id, key, value, isForce) => {
        if (!id || !key) return;
        const srcRow = activeRows.find(r => r._id === id);
        const entry  = makeChangeEntry(srcRow, key, value);
        // ★ 동시수정 감지 (2026-07-14): 드롭다운은 화면에 보이던 값이 곧 '내가 본 원본'
        if (dataSource === 'firebase' && isForce !== true && !hasDraftCell(id, key)) {   // 초안 칸은 [저장] 직전 검사 (2026-08-27)
            const cf = await findCellConflict(id, key, String(srcRow?.[key] ?? ''));
            if (cf) {
                setConflictDlg({
                    ...cf,
                    mine: { [key]: value },
                    onOverwrite: () => { setConflictDlg(null); commitCellWith(id, key, value, true); },
                    onCancel:    () => setConflictDlg(null),
                });
                return;
            }
        }
        if (dataSource !== 'firebase') {
            const updater = rows => rows.map(r => {
                if (r._id !== id) return r;
                return {
                    ...r, [key]: value,
                    _statusHistory: appendStatusHistory(r, key, value),
                    _changeHistory: pushChangeHist(r, entry)
                };
            });
            if (dataSource === 'pending') setPendingData(p => ({ ...p, rows: updater(p.rows) }));
            if (dataSource === 'local')   setLocalData(p =>   ({ ...p, rows: updater(p.rows) }));
            return;
        }
        const row = fbRows.find(r => r._id === id);
        if (!row || !entry) return;   // 같은 값 다시 고름 = 초안 안 만듦
        // ★ 초안 적재 (2026-08-27): 드롭다운 변경도 즉시 저장 대신 초안 — 상태 이력은 초안 위에 이어 붙임(srcRow=overlay) · 백로그(보류/삭제 구분)는 [저장] 때
        addDraft(id, { [key]: value, _statusHistory: appendStatusHistory(srcRow || row, key, value) }, { [key]: String(row[key] ?? '') }, { [key]: value }, entry);
    };

    // ── 팝업 편집 저장 ────────────────────────────────────────────────────
    const saveEditingRow = async () => {
        if (!editingRow) return;
        if (dataSource !== 'firebase') {
            const updater = rows => rows.map(r => r._id === editingRow._id ? { ...editingRow } : r);
            if (dataSource === 'pending') setPendingData(p => ({ ...p, rows: updater(p.rows) }));
            if (dataSource === 'local')   setLocalData(p => ({ ...p, rows: updater(p.rows) }));
            setEditingRow(null); return;
        }
        const { _id, ...data } = editingRow;
        try { await setDoc(rowDocRef(currentTeam, _id), stampSave(data)); setEditingRow(null); }
        catch (err) { setAlertMsg(`저장 오류: ${err.message}`); }
    };

    // ── 변경 이력 계산 ─────────────────────────────────────────────────────
    const buildChangeEntry = (original, current) => {
        const changes = activeHeaders
            .filter(h => !h.startsWith('_'))
            .map(h => ({ field: h, from: String(original?.[h] ?? ''), to: String(current?.[h] ?? '') }))
            .filter(c => c.from !== c.to);
        if (!changes.length) return null;
        return { datetime: new Date().toISOString(), changes };
    };

    // ── 상세 화면 저장 ─────────────────────────────────────────────────────
    // ── 진행실적 '적용하기' → 메인표 행(rows) 갱신 (List 안 동기화. 월간 monthlyData는 보류) 2026-06-29 ──
    const applyProgressToMainRow = async (rowId, mainTable) => {
        if (!rowId || !mainTable) return;
        const srcRow = activeRows.find(r => r._id === rowId);
        if (!srcRow) return;
        const patch = {};
        Object.entries(mainTable).forEach(([h, v]) => { if (v !== null && v !== undefined) patch[h] = String(v); });
        Object.keys(patch).forEach(h => { if (isExtLockedCell(srcRow, h)) delete patch[h]; });   // NAS 자동 칸은 파일이 주인 — 적용하기로 덮지 않음 (2026-07-22)
        // 팀 누적열 재배선 (2026-08-25 팀장님): 팝업 실적은 웹 전용 '포인트실적'에만 쓰였는데
        //   기술2·3팀 260822 양식은 실적 칸이 'Point' 열 → 그 칸에도 쓰고 진행율%(Point÷총점)도 자동 재계산
        //   (팝업 합계 185 ≠ 메인표 Point 140 어긋남의 원인. '포인트실적'은 호환용으로 그대로 유지)
        {
            const _accNmP = teamProfile?.시운전?.누적열;
            if (!fmActive(srcRow) && _accNmP && patch['포인트실적'] !== undefined) {
                const _accColP = (activeHeaders || []).find(h => String(h).replace(/\s/g, '') === String(_accNmP).replace(/\s/g, ''));
                if (_accColP && !isExtLockedCell(srcRow, _accColP)) {
                    patch[_accColP] = patch['포인트실적'];
                    Object.assign(patch, paRecalc({ ...srcRow, ...patch }));
                }
            }
        }
        // 수식 팀 (2026-08-20 팀장님): ① 메인표에 없는 열(포인트실적 등)·자동 칸(자체 시운전 등)은 버림 — 팝업 자체시운전은 별개 운영
        //   ② 'ETOS'는 기술1팀 열 이름 'ETOS T/S'로 짝 ③ 트리거(%)가 바뀌니 공정률 자동 칸 재계산
        if (fmActive(srcRow)) {
            // ★ _clearComm (2026-09-01 팀장님): 팝업에서 자체시운전 기록을 '전부' 지운 세션 — _accBase(마감 기준값)까지 백지
            //   → fmRecalc가 누적·자체%·공정률을 재계산해 함께 빈칸이 된다 (팝업→메인 지우기 완전 동기화)
            const clearComm = String(patch._clearComm ?? '') === '1';
            delete patch._clearComm;
            const colByNorm = {}; (activeHeaders || []).forEach(h => { colByNorm[fmNorm(h)] = h; });
            const p2 = {};
            Object.entries(patch).forEach(([k, v]) => {
                const col = colByNorm[fmNorm(k)] || (fmNorm(k) === 'ETOS' ? fmCol('ETOS T/S') : null);
                if (!col || (fmAutoSet.has(fmNorm(col)) && fmNorm(col) !== '금월')) return;   // 금월 = 팝업(기준월 합)이 주인 — 자동 칸이지만 적용하기로는 들어옴 (2026-08-20)
                p2[col] = v;
            });
            Object.keys(patch).forEach(k => delete patch[k]);
            Object.assign(patch, p2, fmRecalc({ ...srcRow, ...p2, ...(clearComm ? { _accBase: '' } : {}) }, srcRow));
            if (clearComm) patch._accBase = '';
        }
        if (!Object.keys(patch).length) return;
        const changes = Object.keys(patch).map(k => ({ field: k, from: String(srcRow[k] ?? ''), to: String(patch[k]) })).filter(c => c.from !== c.to);
        const entry = changes.length ? { datetime: new Date().toISOString(), changes } : null;
        try {
            if (dataSource !== 'firebase') {
                const updater = rows => rows.map(r => r._id === rowId ? { ...r, ...patch, _changeHistory: pushChangeHist(r, entry) } : r);
                if (dataSource === 'pending') setPendingData(p => ({ ...p, rows: updater(p.rows) }));
                if (dataSource === 'local')   setLocalData(p => ({ ...p, rows: updater(p.rows) }));
            } else {
                const { _id, ...rest } = srcRow;
                await setDoc(rowDocRef(currentTeam, _id), stampSave({ ...rest, ...patch, _changeHistory: pushChangeHist(srcRow, entry) }));
                if (entry) recordAudit(AUDIT_ACTIONS.EDIT, { ...srcRow, ...patch }, entry.changes);   // 백로그: 진행실적 적용
            }
            setAlertMsg('✓ 진행실적이 메인표에 반영되었습니다 (' + Object.keys(patch).length + '개 항목)');
            setTimeout(() => setAlertMsg(''), 3500);
        } catch (e) {
            setAlertMsg('메인표 반영 오류: ' + e.message);
        }
    };

    // ── 메인표 공정률 셀 편집 → 진행실적(주차장부) 역방향 동기화 (2026-07-10) ───────────────
    //   양방향 동기화: 팝업→메인표 = '적용하기'(applyProgressToMainRow), 메인표→팝업 = 이 함수.
    //   대상 = 공정률 7개(도면입수·I/O Map·화면작성·기준정보·PLC·ETOS·HMI)뿐. %(누적)이라 되돌리기가 깔끔·안전.
    //   제외 = 시운전·포인트(단위가 포인트+주차별 합산 → 거꾸로 흩뿌리면 주차 기록 손상). progItemKeyOf가 자동으로 걸러냄.
    //   쓰는 위치 = 오늘이 속한 '현재 주차' 칸 (기준월 마지막 주 아님) — 메인표 수정은 '지금' 벌어진 일이므로.
    //   ★ HEADER_MAP(ProgressModal)의 정확한 역매핑 — 공백/대소문자 무시 후 대조.
    const PROG_COL_TO_KEY = { '도면입수':'drawing', 'I/OMAP':'iomap', '화면작성':'screen', '기준정보':'baseinfo', 'PLC':'plc', 'ETOS':'etos', 'ETOST/S':'etos', 'HMI':'hmi' };   // ETOS T/S = 기술1팀 열 이름 (2026-08-19 팀장님: ETOS와 동일)
    const progItemKeyOf = (header) => PROG_COL_TO_KEY[String(header ?? '').replace(/\s+/g, '').toUpperCase()];
    const syncProgressCellToLedger = async (row, header, value, forceItemKey) => {
        const itemKey = forceItemKey || progItemKeyOf(header);          // forceItemKey: 수식 자동값(자체시운전) 반영용 (2026-08-19)
        if (!itemKey || !row) return;                                   // 공정률 7개가 아니면 무시(포인트·시운전·날짜·상태 등)
        const _sv = String(value ?? '').replace(/[,%]/g, '').trim();     // '50%'처럼 붙여 넣어도 숫자만 (2026-08-27)
        // 빈칸 = '이번 주' 기록 삭제 → 팝업도 함께 되돌아감 (2026-08-27 팀장님 "지워도 동기화").
        //   지난 주·지난 달 기록(이력)은 보존 — 이번에 넣은 것만 되돌린다는 의미.
        const isClear = _sv === '';
        const num = isClear ? 0 : Math.max(0, Number(_sv));
        if (!isClear && !Number.isFinite(num)) return;                  // 숫자가 아니면 무시
        // docKey = ProgressModal과 동일 규칙: pid 우선 → 실행번호 → 행ID
        const docKey = row._pid || row.pid || row['실행번호'] || row.execNo || String(row._id || row.id || '');
        if (!docKey) return;
        // ★ 오늘이 속한 '현재 주차'에 기록 — 앱 규칙과 동일(1주=1~7·2주=8~14·3주=15~21·4주=22~28·5주=29~).
        //   예: 오늘 7/10 → 7월 2주차('2026-7-2'). 월은 0채움 없음(ProgressModal wKey와 동일).
        const now = new Date();
        const cy = now.getFullYear(), cm = now.getMonth() + 1;
        const curW = Math.min(5, Math.max(1, Math.ceil(now.getDate() / 7)));
        const curWKey = `${cy}-${cm}-${curW}`;
        const ref = doc(db, 'artifacts', appId, 'public', 'data', `progressRecords_${currentTeam}`, docKey);
        try {
            // 읽어서 고쳐 쓰기 — 중첩 맵의 특정 주차를 지우려면 필요. 다른 항목·과거 주차 값은 그대로 보존.
            // 실시간 구독본(App.js progressRecordsMap) 우선 (2026-08-26 속도): 장부는 이미 onSnapshot으로 최신 상태라
            //   서버 getDoc 왕복(수백 ms + 읽기 1회)을 생략. 구독본에 없을 때만 서버에서 읽음.
            const _fresh = ledgerFreshRef.current[docKey];               // 직전 쓰기 최신본 우선 (2026-08-27 일괄 저장 소실 수리)
            const _live = progressRecordsMap && progressRecordsMap[docKey];
            let data;
            if (_fresh && Date.now() - _fresh.at < 15000) data = { docKey, execNo: (row['실행번호'] || row.execNo || ''), ..._fresh.data };
            else if (_live && _live.weekly) data = { docKey, execNo: (row['실행번호'] || row.execNo || ''), ..._live };
            else { const snap = await getDoc(ref); data = snap.exists() ? snap.data() : { docKey, execNo: (row['실행번호'] || row.execNo || '') }; }
            const weekly = { ...(data.weekly || {}) };
            const itemWeeks = { ...(weekly[itemKey] || {}) };
            // 이번 달에서 '현재 주차보다 뒤(미래)' 주차값 제거 → 현재 주차가 '누적 최신값'이 되어 팝업 합계와 일치.
            //   (지난 버전이 기준월 마지막주에 넣어둔 잔재도 여기서 함께 정리됨)
            Object.keys(itemWeeks).forEach(wk => {
                const parts = String(wk).split('-').map(Number);
                if (parts[0] === cy && parts[1] === cm && parts[2] > curW) delete itemWeeks[wk];
                // 자체시운전(팝업 합계=월합)은 이번 달의 다른 주차도 정리 — 이번 달 값은 '한 칸'만 유지해 월합=금월값 (2026-08-19)
                if (forceItemKey && parts[0] === cy && parts[1] === cm && parts[2] !== curW) delete itemWeeks[wk];
            });
            if (isClear) {
                // ★ 빈칸(0 포함) = 그 항목 주차 기록 '전부' 삭제 (2026-09-01 팀장님: 메인표에서 지우면 팝업도 빈칸 — 완전 동기화)
                //   구(2026-08-27) '이번 주만 삭제'는 주·달이 바뀌면 지난 주 값이 팝업에 이월 표시되는 구멍(9/1 실사례: 8월 4주차 잔존).
                //   변경 이력(_changeHistory)·백로그 기록은 남음. 과거 주차도 지워지므로 그래프 월별 추이에서도 이 항목은 빠짐.
                if (!(itemKey in weekly)) return;                        // 지울 것 없음 → 쓰기 생략
                delete weekly[itemKey];
            } else {
                itemWeeks[curWKey] = num;                                // 현재 주차에 값 기록
                weekly[itemKey] = itemWeeks;
            }
            await setDoc(ref, { ...data, weekly, updatedAt: new Date().toISOString() });
            ledgerFreshRef.current[docKey] = { at: Date.now(), data: { ...data, weekly } };
            if (onProgressSaved) onProgressSaved({ docKey, weeklyData: weekly });   // 그래프·팝업 즉시 반영 (Point 동기화와 동일)
        } catch (e) { console.warn('[reverseSync] progressRecords 반영 실패:', e); }
    };

    // ── Point(누적 실적) 키인 → 통합시운전 주차장부 동기화 (2026-08-25 팀장님 확정: 증분 배치) ──
    //   장부는 '주마다 그 주에 딴 점수'(합산)인데 메인표 Point는 '지금까지 총합'(누적)이라 그대로 넣으면 이중 계산.
    //   → 이번 주 값 = 새 누적 − (다른 주차 합). 장부 합계 = 키인값 일치 · 과거 이력 보존 · 같은 주 재키인 멱등.
    //   새 누적 < 다른 주차 합 = 실적 감소 → { ok:false } 반환 → 호출부가 저장 전체를 중단하고 경고 (실수 방지).
    //   메인 행 전용 — 하위(sub) 체제 장부(NAS 원장)는 건드리지 않음 (NAS 칸은 어차피 키인 잠금).
    const isAccPointCol = (h) => !!teamProfile?.시운전?.누적열
        && String(h).replace(/\s/g, '') === String(teamProfile.시운전.누적열).replace(/\s/g, '');
    const syncAccPointToLedger = async (row, header, value, opts = {}) => {
        if (!row || isSubListRow(row) || !isAccPointCol(header)) return { ok: true };
        const s = String(value ?? '').replace(/[,%]/g, '').trim();
        const isClear = s === '';                                           // 빈칸 = '이번 주' 기록 삭제(팝업 되돌림) — 아래 분기 (2026-08-27)
        const num = isClear ? 0 : Number(s);
        if (!isClear && (!Number.isFinite(num) || num < 0)) return { ok: true };
        const docKey = row._pid || row.pid || row['실행번호'] || row.execNo || String(row._id || row.id || '');
        if (!docKey) return { ok: true };
        const now = new Date();
        const cy = now.getFullYear(), cm = now.getMonth() + 1, cw = Math.min(5, Math.max(1, Math.ceil(now.getDate() / 7)));
        const curWKey = `${cy}-${cm}-${cw}`;
        const ref = doc(db, 'artifacts', appId, 'public', 'data', `progressRecords_${currentTeam}`, docKey);
        try {
            // 실시간 구독본(App.js progressRecordsMap) 우선 (2026-08-26 속도): 장부는 이미 onSnapshot으로 최신 상태라
            //   서버 getDoc 왕복(수백 ms + 읽기 1회)을 생략. 구독본에 없을 때만 서버에서 읽음.
            const _fresh = ledgerFreshRef.current[docKey];               // 직전 쓰기 최신본 우선 (2026-08-27 일괄 저장 소실 수리)
            const _live = progressRecordsMap && progressRecordsMap[docKey];
            let data;
            if (_fresh && Date.now() - _fresh.at < 15000) data = { docKey, execNo: (row['실행번호'] || row.execNo || ''), ..._fresh.data };
            else if (_live && _live.weekly) data = { docKey, execNo: (row['실행번호'] || row.execNo || ''), ..._live };
            else { const snap = await getDoc(ref); data = snap.exists() ? snap.data() : { docKey, execNo: (row['실행번호'] || row.execNo || '') }; }
            const weekly = { ...(data.weekly || {}) };
            // 하위(sub_i) 체제 장부 = NAS가 원장 → 메인 키인 동기화 금지 (잠금과 별개의 이중 안전장치)
            if (Object.keys(weekly).some(k => /^sub_\d+_(commissioning|intCommissioning)$/.test(k))) return { ok: true };
            const iw = { ...(weekly.intCommissioning || {}) };
            if (isClear) {                                               // ★ Point 지움 = 통합시운전 주차 기록 '전부' 삭제 (2026-09-01 팀장님: 팝업 완전 동기화 — 구 '이번 주만'은 주가 바뀌면 지난 주 값 잔존)
                if (!Object.keys(iw).length) return { ok: true };        // 지울 것 없음
                delete weekly.intCommissioning;
                await setDoc(ref, { ...data, weekly, updatedAt: new Date().toISOString() });
                ledgerFreshRef.current[docKey] = { at: Date.now(), data: { ...data, weekly } };
                if (onProgressSaved) onProgressSaved({ docKey, weeklyData: weekly });
                return { ok: true };
            }
            const otherSum = Object.entries(iw).reduce((s2, [wk, v]) => (wk === curWKey ? s2 : s2 + (Number(v) || 0)), 0);
            if (num < otherSum) return { ok: false, sum: otherSum, cur: Number(iw[curWKey] || 0) };   // 감소 → 저장 중단 (호출부에서 경고)
            if (opts.checkOnly) return { ok: true };                              // 초안 단계 = 검사만 (쓰기는 [저장] 때)
            const delta = Math.round((num - otherSum) * 1000) / 1000;
            if (Number(iw[curWKey] ?? NaN) === delta) return { ok: true };  // 변화 없음 → 쓰기 생략
            iw[curWKey] = delta;
            weekly.intCommissioning = iw;
            await setDoc(ref, { ...data, weekly, updatedAt: new Date().toISOString() });
            ledgerFreshRef.current[docKey] = { at: Date.now(), data: { ...data, weekly } };
            if (onProgressSaved) onProgressSaved({ docKey, weeklyData: weekly });   // 그래프·팝업 즉시 반영
        } catch (e) { console.warn('[accSync] Point→장부 반영 실패:', e); }
        return { ok: true };
    };
    const accSyncBlockMsg = (num, sum, cur = 0) => `Point(실적) ${num}점은 저장할 수 없습니다.\n\n진행실적 장부에 지난 주차까지 ${sum}점이 기록돼 있습니다\n(이번 주 ${cur}점 포함 총 ${sum + cur}점).\n지난 주차 합(${sum})보다 작은 값은 주간 기록이 어긋나 막습니다.\n\n실적을 줄이려면 진행실적 팝업에서\n해당 주차 값을 직접 고쳐주세요.`;   // 2026-08-25 테스트: '185인데 왜 135?' 혼동 방지 — 총합 병기

    // ─── NAS 진척자료 자동 반영 (2026-07-22) ─────────────────────────────────
    //   개념: 원본은 NAS 폴더의 최신 진척 엑셀(복사본 안 올림). 이 PC에 '폴더 읽기 허가증'을 한 번 받아두면
    //   List 화면을 열 때(또는 [지금 확인]) 최신 파일을 다시 읽어 규칙(시트·셀·계산)대로 값을 뽑고,
    //   바뀐 값만 '미리보기 → 반영' 확인창을 거쳐 메인표 + 주간 진행실적 장부에 기록한다.
    const extSupported = typeof window !== 'undefined' && !!window.showDirectoryPicker;
    const extHandleKey = (rowId) => `${currentTeam}_${rowId}`;
    const extSetStatus = (rowId, st) => {
        const v = { ...st, checkedAt: new Date().toISOString() };
        extStatusRef.current = { ...extStatusRef.current, [rowId]: v };   // 자동 반영이 곧바로 읽음 (2026-07-27)
        setExtStatus(prev => ({ ...prev, [rowId]: v }));
    };
    // 행별 잠금 열 — 자기 규칙 + (하위 행이면) 부모의 공종표 규칙 항목들, (부모면) 공종표의 부모 항목·누적·통합시운전 (2026-07-22)
    // NAS 내부 이름 → 이 팀의 실제 열 이름 (2026-08-24 재배선): 기술2팀 260822 개편 — '누적'→'Point' · '통합시운전'→'진행율 %'
    //   팀 카드(시운전.누적열/통합열) 없는 팀은 이름 그대로 = 기존 팀(기술1팀 등) 동작 불변
    const extWebCol = (nm) => {
        const n = String(nm).replace(/\s+/g, '');
        if (n === '누적') return teamProfile?.시운전?.누적열 || nm;
        if (n === '통합시운전') return teamProfile?.시운전?.통합열 || nm;
        return nm;
    };
    const extLockedColsRow = (row) => {
        const own = extLockedColsOf(row).filter(t => t !== '하위 공종표');
        if (isSubListRow(row)) {
            const pidStr = String(row._id).replace(/_sub\d+$/, '');
            const par = pidStr !== String(row._id) ? fbRows.find(r => r._id === pidStr) : null;
            const st2 = par ? extRulesOf(par).find(r => r.type === 'subTable') : null;
            const baseSub = [...own, 'PLC', 'ETOS', 'HMI'];   // 하위(공종) 행은 프로젝트 지표 키인 금지 — NAS 잠금과 동일 처리 (2026-07-28 팀장님)
            return st2 ? [...baseSub, ...Object.keys(st2.subCols || {}), '포인트', extWebCol('누적')] : baseSub;
        }
        const st2 = extRulesOf(row).find(r => r.type === 'subTable');
        return st2 ? [...own, ...Object.keys(st2.parentCols || {}), extWebCol('누적'), extWebCol('통합시운전')] : own;
    };
    const isExtLockedCell = (row, h) => { const nh = String(h ?? '').replace(/\s+/g, '').toUpperCase(); return extLockedColsRow(row).some(t => String(t).replace(/\s+/g, '').toUpperCase() === nh); };

    // ── 관리 칸 원클릭 [엑셀로 열기] (2026-08-24 팀장님: NAS 창 안 거치고 바로) ──────
    //   파일 목록은 검사 때 클라우드(_extSync.lastFiles)에 남겨 새로고침·다른 PC에서도 버튼 유지.
    //   열기는 주소(WebDAV 웹주소 변환)만 쓰므로 폴더 허가증 없는 PC에서도 동작 — 모달의 [엑셀로 열기]와 같은 원리.
    const _DAV_HOST2 = 'https://necon-pj.synology.me:5006';
    const _DAV_SHARE2 = 'NECONSYS_PJ';
    const extLocalBaseOf = (row) => { try { return (localStorage.getItem('pms_ext_localbase_' + currentTeam + '_' + row._id) || '').trim(); } catch (er) { return ''; } };
    const davUrlRow = (row, rel, shared) => {
        const ex2 = row._extSync || {};
        const base = String((shared ? ex2.sharedUncPath : '') || ex2.uncPath || extLocalBaseOf(row) || '').trim();
        if (!base) return '';
        let parts = base.replace(/^[\\/]+/, '').replace(/[\\/]+$/, '').split(/[\\/]+/).filter(Boolean);
        if (parts.length && /^[A-Za-z]:$/.test(parts[0])) parts.shift();
        if (parts.length && /^(neconsys_pj|necon-pj\.synology\.me|192\.168\.\d+\.\d+)$/i.test(parts[0])) parts.shift();
        if (parts.length && parts[0].toUpperCase() === _DAV_SHARE2) parts.shift();
        const relParts = String(rel || '').split(/[\\/]+/).filter(Boolean);
        return _DAV_HOST2 + '/' + [_DAV_SHARE2, ...parts, ...relParts].map(encodeURIComponent).join('/');
    };
    const extOpenExcelRow = (row, f) => {
        const ex2 = row._extSync || {};
        if (f.shared && !String(ex2.sharedUncPath || '').trim()) { setAlertMsg('공용 폴더에서 읽는 파일입니다.\nNAS 창(관리 칸 아이콘)에서 공용 폴더 주소를 한 번 저장하면 바로 열립니다.'); return; }
        const u = davUrlRow(row, f.rel, !!f.shared);
        if (!u) { setAlertMsg('NAS 폴더 주소가 저장돼 있지 않습니다.\nNAS 창에서 ① 폴더 주소를 저장해주세요.'); return; }
        try { window.location.href = 'ms-excel:ofe|u|' + u; } catch (er) {}
        if (!localStorage.getItem('pms_excel_open_hint')) {
            try { localStorage.setItem('pms_excel_open_hint', '1'); } catch (eh) {}
            setAlertMsg(`'${f.name}'\n진짜 엑셀로 여는 중... (안 열리면 이 PC 1회 준비 필요)\n처음이면 로그인 창에 NAS 계정을 입력하세요.\n\n(이 안내는 이 PC에서 처음 한 번만 표시됩니다)`);
            setTimeout(() => setAlertMsg(''), 3500);
        }
    };

    // 한 행 검사 — 핸들 → 최신 파일 → 규칙 계산 → 현재값과 비교. silent=true면 허용창을 안 띄움(이미 허용된 폴더만).
    const extCheckRow = async (row, { silent = true } = {}) => {
        if (!NAS_SYNC_ENABLED) return [];                    // NAS 동기화 전면 비활성화 (2026-07-30) — 파일 읽기 자체를 막는다
        const rules = extRulesOf(row);
        if (!rules.length) return [];
        if (!extSupported) { extSetStatus(row._id, { state: 'error', msg: '이 브라우저 미지원 — 크롬·엣지(PC)에서 하세요' }); return []; }
        let handle = null;
        try { handle = await extIdbGet(extHandleKey(row._id)); } catch (e) {}
        if (!handle) { extSetStatus(row._id, { state: 'nofolder', msg: '이 PC에 폴더 지정 안 됨' }); return []; }
        // 공용 폴더(선택) — 다른 프로젝트 폴더에 있는 공용 파일(예: P9·P10 공용 '01 진행현황')용 (2026-08-05)
        let sharedHandle = null;
        try { sharedHandle = await extIdbGet(extHandleKey(row._id) + '::shared'); } catch (e) {}
        try {
            // (2026-08-07) 허가증 자동 되살리기 — 크롬을 껐다 켜면 허가증이 '다시 물어봄'으로 돌아갈 수 있다.
            //   그러면 무인 공용 PC는 사람이 [지금 확인]을 눌러줄 때까지 영영 멈춘다.
            //   폴더 지정 때 [방문할 때마다 허용]을 받아둔 폴더는 requestPermission이 창 없이 바로 허용을 돌려준다 → 스스로 복구.
            //   ★ 단 메인 PC에서만 시도한다 — 일반 직원 PC까지 허용하면 화면에 들어오자마자 권한 창이 튀어나올 수 있다
            //     (silent=true로 창을 막아온 원래 의도 유지). 일반 PC 동작은 이전과 100% 동일.
            const mayRequest = !silent || extMainPc;
            let perm = await handle.queryPermission({ mode: 'read' });
            if (perm === 'prompt' && mayRequest) { try { perm = await handle.requestPermission({ mode: 'read' }); } catch (e) {} }
            if (perm !== 'granted') { extSetStatus(row._id, { state: 'perm', msg: '폴더 읽기 허용 필요 — NAS 버튼 → [지금 확인]' }); return []; }
            if (sharedHandle) {
                let permS = await sharedHandle.queryPermission({ mode: 'read' });
                if (permS === 'prompt' && mayRequest) { try { permS = await sharedHandle.requestPermission({ mode: 'read' }); } catch (e) {} }
                if (permS !== 'granted') sharedHandle = null;   // 공용 폴더는 선택 사항 — 허용 전이면 기본 폴더만으로 진행
            }
            // 폴더 안 엑셀 파일 목록(이름 + 수정시각) — 하위 폴더까지 자동 탐색 (2026-07-22)
            //   실제 NAS 구조: 01 진척자료 > 01 진행현황_L1L2 > 엑셀 (한 층 아래) → 재귀 필요.
            //   Backup·백업 이름 폴더는 옛 복사본이라 제외, 깊이는 3층까지(과도한 탐색 방지).
            const metas = [];
            const metasShared = [];   // 공용 폴더에서 모은 파일 — 기본 폴더에 없는 파일만 여기서 찾는다 (오배정 방지)
            let sink = metas;
            const walk = async (dir, depth, rel) => {
                for await (const entry of dir.values()) {
                    if (entry.kind === 'directory') {
                        if (depth >= 3) continue;
                        if (/backup|백업/i.test(String(entry.name || ''))) continue;
                        try { await walk(entry, depth + 1, rel ? rel + '\\' + entry.name : entry.name); } catch (e) {}
                        continue;
                    }
                    const nm = String(entry.name || '');
                    if (nm.startsWith('~$') || !/\.(xlsx|xlsm|xls)$/i.test(nm)) continue;
                    try { const f = await entry.getFile(); sink.push({ name: nm, rel: rel ? rel + '\\' + nm : nm, lastModified: f.lastModified, _file: f }); } catch (e) {}
                }
            };
            await walk(handle, 0, '');
            if (sharedHandle) { sink = metasShared; try { await walk(sharedHandle, 0, ''); } catch (e) {} sink = metas; metasShared.forEach(m => { m._shared = true; }); }
            const XLSX = await loadXLSX();
            const wbCache = {};
            const out = [];
            const usedFiles = [];   // 이번 검사에서 실제 읽은 파일들 — 파일별 [경로 복사]용 (2026-07-22)
            let okInfo = null, errMsg = '';
            for (const rule of rules) {
                // ── 하위 공종표 규칙 (2026-07-22 파일2): 공종 8행 생성/갱신 + 부모 총계 반영 제안 ──
                if (rule.type === 'subTable') {
                    const picked2 = pickLatestExtFile(metas, rule.filePattern) || pickLatestExtFile(metasShared, rule.filePattern);
                    if (!picked2) { errMsg = `'${rule.filePattern}' 파일을 폴더${sharedHandle ? '·공용 폴더' : ''}에서 못 찾음`; continue; }
                    if (!wbCache[picked2.name]) { const ab2 = await picked2._file.arrayBuffer(); wbCache[picked2.name] = XLSX.read(ab2, { type: 'array' }); }
                    if (!usedFiles.some(f => f.rel === picked2.rel)) usedFiles.push({ name: picked2.name, rel: picked2.rel, shared: !!picked2._shared });
                    const res2 = computeExtSubTable(wbCache[picked2.name], rule);
                    if (res2.error) { errMsg = `하위 공종표: ${res2.error} (${picked2.name})`; continue; }
                    okInfo = { fileName: picked2.name, rel: picked2.rel, value: `공종 ${res2.rows.length}개`, target: '하위표' };
                    const hdrOf = (nm) => (activeHeaders || []).find(x => String(x).replace(/\s+/g, '').toUpperCase() === String(nm).replace(/\s+/g, '').toUpperCase()) || nm;
                    const subs2 = fbRows.filter(rr => String(rr._id).startsWith(row._id + '_sub'));
                    const nrm = (s) => String(s ?? '').replace(/^[-\s]+/, '').replace(/\s+/g, '').toUpperCase();
                    for (const exr of res2.rows) {
                        const want = { ...exr.values, '포인트': exr.pt };
                        if (exr.acc !== undefined) want[extWebCol('누적')] = exr.acc;   // 공종별 누적(진행 pt)도 자동 키인 (2026-07-22 팀장님 · 2026-08-24 팀별 열 이름)
                        const found = subs2.find(rr => nrm(projectNameCol ? rr[projectNameCol] : '') === nrm(exr.name));
                        if (!found) {
                            out.push({ rowId: row._id, kind: 'subCreate', target: `└ ${exr.name} 신규`, from: '—', to: Object.entries(want).map(([k, v]) => `${k} ${v}`).join(' · '), fileName: picked2.name, fileRel: picked2.rel, projectName: pickProjectName(row), _sub: { name: exr.name, want } });
                        } else {
                            const chg = [];
                            for (const [cn, v] of Object.entries(want)) {
                                const cur = String(found[hdrOf(cn)] ?? '').replace(/%/g, '').trim();
                                const curN = cur === '' ? null : Number(cur);
                                if (!(curN !== null && Number.isFinite(curN) && Math.abs(curN - v) < 0.05)) chg.push({ col: cn, from: cur === '' ? '—' : cur, to: v });
                            }
                            if (chg.length) out.push({ rowId: found._id, kind: 'subSet', target: `└ ${exr.name}`, from: `${chg.length}칸`, to: chg.map(c => `${c.col} ${c.from}→${c.to}`).join(' · '), fileName: picked2.name, fileRel: picked2.rel, projectName: pickProjectName(row), _sub: { name: exr.name, changes: chg } });
                        }
                    }
                    const pWant = { ...(res2.total.values || {}) };
                    if (res2.total.acc !== undefined) pWant[extWebCol('누적')] = res2.total.acc;
                    const ptSum2 = res2.rows.reduce((s2, x) => s2 + (Number(x.pt) || 0), 0);
                    if (res2.total.acc !== undefined && ptSum2 > 0) pWant[extWebCol('통합시운전')] = Math.round(res2.total.acc / ptSum2 * 1000) / 10;   // 누적÷Σ총점 — 파일 총계와 동일식 (2026-08-24 팀별 열 이름)
                    for (const [cn, v] of Object.entries(pWant)) {
                        const cur = String(row[hdrOf(cn)] ?? '').replace(/%/g, '').trim();
                        const curN = cur === '' ? null : Number(cur);
                        if (!(curN !== null && Number.isFinite(curN) && Math.abs(curN - v) < 0.05))
                            out.push({ rowId: row._id, target: cn, from: cur === '' ? '—' : cur, to: v, fileName: picked2.name, fileRel: picked2.rel, shared: !!picked2._shared, projectName: pickProjectName(row) });
                    }
                    // 부모 팝업 '하위별 통합' 줄 자동 채움(모니터링·그래프) — 현재 주차 장부와 다르면 제안 (2026-07-22 팀장님)
                    try {
                        const dkP = row._pid || row.pid || row['실행번호'] || row.execNo || String(row._id || '');
                        if (dkP) {
                            const snapP = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', `progressRecords_${currentTeam}`, dkP));
                            const wkP = snapP.exists() ? ((snapP.data() || {}).weekly || {}) : {};
                            const extraSubP = Object.keys(wkP).some(k => { const m = k.match(/^sub_(\d+)_(commissioning|intCommissioning)$/); return m && Number(m[1]) >= res2.rows.length; });   // 유령 칸(재등록 잔재 sub_6 등) 감지 — 그래프만 부풀리는 원인 (2026-08-05)
                            const sumWkP = (m2) => Object.values(m2 || {}).reduce((s2, v2) => s2 + (Number(v2) || 0), 0);
                            const diffP = extraSubP || res2.rows.some((exr, i) => Math.abs(sumWkP(wkP[`sub_${i}_intCommissioning`]) - Number(exr.acc || 0)) > 0.005);   // ★주차 '전체 합' vs 누적 (2026-09-01) — 현재 주차만 보면 주가 바뀔 때 값이 그대로여도 거짓 '변경 감지'
                            if (diffP) out.push({ rowId: row._id, kind: 'subLedger', target: '팝업 하위별 통합', from: '—', to: res2.rows.map(exr => `${exr.name} ${exr.acc || 0}`).join(' · '), fileName: picked2.name, fileRel: picked2.rel, projectName: pickProjectName(row), _ints: res2.rows.map(exr => Number(exr.acc || 0)) });
                        }
                    } catch (eP) {}
                    continue;
                }
                const picked = pickLatestExtFile(metas, rule.filePattern) || pickLatestExtFile(metasShared, rule.filePattern);
                if (!picked) { errMsg = `'${rule.filePattern}' 파일을 폴더${sharedHandle ? '·공용 폴더' : ''}에서 못 찾음`; continue; }
                if (!wbCache[picked.name]) {
                    const ab = await picked._file.arrayBuffer();
                    wbCache[picked.name] = XLSX.read(ab, { type: 'array' });
                }
                if (!usedFiles.some(f => f.rel === picked.rel)) usedFiles.push({ name: picked.name, rel: picked.rel, shared: !!picked._shared });
                const res = computeExtRuleValue(wbCache[picked.name], rule);
                if (res.error) { errMsg = `${rule.target}: ${res.error} (${picked.name})`; continue; }
                const curRaw = String(row[rule.target] ?? '').replace(/%/g, '').trim();
                const cur = curRaw === '' ? null : Number(curRaw);
                const same = cur !== null && Number.isFinite(cur) && Math.abs(cur - res.value) < 0.05;
                okInfo = { fileName: picked.name, rel: picked.rel, value: res.value, target: rule.target };
                if (!same) out.push({ rowId: row._id, target: rule.target, from: curRaw === '' ? '—' : curRaw, to: res.value, fileName: picked.name, fileRel: picked.rel, shared: !!picked._shared, projectName: pickProjectName(row) });
            }
            // 파일 목록 클라우드 보존 (2026-08-24) — 관리 칸 원클릭 버튼용 (새로고침·다른 PC에서도 유지, 변경 시에만 저장)
            try {
                if (usedFiles.length) {
                    const lf = usedFiles.map(f => ({ name: f.name, rel: f.rel, shared: !!f.shared }));
                    if (JSON.stringify(lf) !== JSON.stringify((row._extSync || {}).lastFiles || []))
                        await setDoc(rowDocRef(currentTeam, row._id), { _extSync: { ...(row._extSync || {}), lastFiles: lf } }, { merge: true });
                }
            } catch (eLf) {}
            if (errMsg) extSetStatus(row._id, { state: 'error', msg: errMsg, files: usedFiles });
            else if (out.length) extSetStatus(row._id, { state: 'changed', msg: `변경 감지 ${out.length}건 — 반영 대기`, fileName: out[0].fileName, fileRel: out[0].fileRel, files: usedFiles });
            else if (okInfo) extSetStatus(row._id, { state: 'ok', msg: `최신 상태 (${okInfo.target} ${okInfo.value})`, fileName: okInfo.fileName, fileRel: okInfo.rel, value: okInfo.value, files: usedFiles });
            return out;
        } catch (e) {
            extSetStatus(row._id, { state: 'error', msg: 'NAS 읽기 실패: ' + e.message });
            return [];
        }
    };

    // 규칙 있는 모든 행 검사 — silent(자동)면 이미 허용된 폴더만 조용히
    const extCheckAll = async ({ silent = true } = {}) => {
        if (dataSource !== 'firebase') return;
        const targets = fbRows.filter(r => extRulesOf(r).length);
        if (!targets.length) return;
        setExtBusy(true);
        try {
            const all = [];
            for (const r of targets) { const ps = await extCheckRow(r, { silent }); all.push(...ps); }
            if (all.length) setExtProposals(all);
        } finally { setExtBusy(false); }
    };

    // 폴더 지정(허가증 발급) — 이 PC 한정 · 읽기 전용. NAS 파일은 절대 수정하지 않는다.
    const extPickFolder = async (row) => {
        if (!extSupported) { setAlertMsg('이 브라우저는 폴더 지정을 지원하지 않습니다.\n크롬 또는 엣지(PC)에서 해주세요.'); return; }
        try {
            const handle = await window.showDirectoryPicker({ mode: 'read' });
            await extIdbSet(extHandleKey(row._id), handle);
            extSetStatus(row._id, { state: 'ok', msg: `폴더 지정됨: ${handle.name}` });
            const ps = await extCheckRow(row, { silent: false });
            if (ps.length) setExtProposals(ps);
        } catch (e) { if (e && e.name !== 'AbortError') setAlertMsg('폴더 지정 실패: ' + e.message); }
    };

    // 공용 폴더 지정(선택) — 다른 프로젝트 폴더에 있는 공용 파일(예: P9·P10 공용 '01 진행현황')을 읽을 때만 (2026-08-05)
    //   파일은 항상 기본 폴더에서 먼저 찾고, 기본 폴더에 없는 파일만 공용 폴더에서 찾는다 (같은 이름 조각 오배정 방지).
    //   허가증 키 = 기본키 + '::shared' (PC별 IndexedDB — 기본 폴더와 같은 방식)
    const extPickSharedFolder = async (row) => {
        if (!extSupported) { setAlertMsg('이 브라우저는 폴더 지정을 지원하지 않습니다.\n크롬 또는 엣지(PC)에서 해주세요.'); return; }
        try {
            const handle = await window.showDirectoryPicker({ mode: 'read' });
            await extIdbSet(extHandleKey(row._id) + '::shared', handle);
            extSetStatus(row._id, { state: 'ok', msg: `공용 폴더 지정됨: ${handle.name}` });
            const ps = await extCheckRow(row, { silent: false });
            if (ps.length) setExtProposals(ps);
        } catch (e) { if (e && e.name !== 'AbortError') setAlertMsg('공용 폴더 지정 실패: ' + e.message); }
    };

    // ★ 누적값의 주간 장부 배치 = 이번 주 '증분' (2026-09-01): 이번 주 칸 = 누적 − 다른 주차 합.
    //   누적 전체를 현재 주차에 그대로 쓰면 주차가 바뀔 때마다 이전 주차와 이중 합산(팝업 합계·그래프 부풀기 — 8/25 의심 확정).
    //   Σ주차 == 누적 불변 유지. NAS 값이 줄면 이번 주가 음수일 수 있음(원본이 정답 — 합계는 정확).
    const placeAccIntoWeek = (weekMap, wKey, acc) => {
        const others = Object.entries(weekMap || {}).reduce((s, [k, v]) => (k === wKey ? s : s + (Number(v) || 0)), 0);
        return Math.round(((Number(acc) || 0) - others) * 100) / 100;
    };

    // 통합시운전 주간장부 심기(현재 주차, 재실행 안전) — NAS 자동 반영 공용 (2026-07-22)
    const extSeedIntLedger = async (row, pts) => { try {
        const dk = row._pid || row.pid || row['실행번호'] || row.execNo || String(row._id || '');
        if (!dk) return;
        const ref = doc(db, 'artifacts', appId, 'public', 'data', `progressRecords_${currentTeam}`, dk);
        const snap = await getDoc(ref);
        const data = snap.exists() ? snap.data() : { docKey: dk, execNo: (row['실행번호'] || '') };
        const weekly = { ...(data.weekly || {}) };
        const now = new Date(); const cy = now.getFullYear(), cm = now.getMonth() + 1, cw = Math.min(5, Math.max(1, Math.ceil(now.getDate() / 7)));
        const iw = { ...(weekly.intCommissioning || {}) };
        const wkKey = `${cy}-${cm}-${cw}`;
        iw[wkKey] = placeAccIntoWeek(iw, wkKey, pts);   // ★누적→이번 주 증분 (2026-09-01, 이중 합산 방지)
        weekly.intCommissioning = iw;
        await setDoc(ref, { ...data, weekly, updatedAt: new Date().toISOString() });
    } catch (e) {} };

    // 하위(공종) 행의 진행실적 = 부모 팝업으로 통일 (2026-07-22 팀장님: 팝업 하나로, 하위 팝업 별도 의미 없음)
    const progressRowFor = (row) => {
        if (!row || !isSubListRow(row)) return row;
        const pId = String(row._id).replace(/_sub\d+$/, '');
        return (pId !== String(row._id) && activeRows.find(r => r._id === pId)) || row;
    };

    // 반영 — 메인표 값(도장+이력+백로그) + 주간 진행실적 장부(현재 주차) + 그래프 갱신 + 반영 기록
    const extApplyProposals = async (list, opts = {}) => {   // opts.auto = 메인 PC 무인 반영 (2026-07-27)
        if (!list || !list.length) return;
        setExtBusy(true);
        try {
            const histAcc = {};   // 같은 행 연속 반영 시 변경이력 누적 (덮어쓰기 방지)
            const naAcc = {};     // 같은 행 _naOn 누적 + 하위 생성 번호 카운터
            const hOfA = (nm) => (activeHeaders || []).find(x => String(x).replace(/\s+/g, '').toUpperCase() === String(nm).replace(/\s+/g, '').toUpperCase()) || nm;
            for (const p of list) {
                // ── 부모 장부 '하위별 통합' 심기 (팝업 모니터링·그래프) ──
                if (p.kind === 'subLedger') {
                    const parentRow = fbRows.find(r => r._id === p.rowId);
                    if (!parentRow) continue;
                    try {
                        const dkP = parentRow._pid || parentRow.pid || parentRow['실행번호'] || parentRow.execNo || String(parentRow._id || '');
                        if (!dkP) continue;
                        const refP = doc(db, 'artifacts', appId, 'public', 'data', `progressRecords_${currentTeam}`, dkP);
                        const snapP = await getDoc(refP);
                        const dataP = snapP.exists() ? snapP.data() : { docKey: dkP, execNo: (parentRow['실행번호'] || '') };
                        const weeklyP = { ...(dataP.weekly || {}) };
                        const nowP = new Date(); const wKeyP = `${nowP.getFullYear()}-${nowP.getMonth() + 1}-${Math.min(5, Math.max(1, Math.ceil(nowP.getDate() / 7)))}`;
                        p._ints.forEach((pts, i) => {
                            const k = `sub_${i}_intCommissioning`;
                            const iw = { ...(weeklyP[k] || {}) };
                            const incP = placeAccIntoWeek(iw, wKeyP, pts);   // ★누적→이번 주 증분 (2026-09-01, 주차 넘어가도 Σ=누적 — 이중 합산 방지)
                            if (incP !== 0 || iw[wKeyP] !== undefined) { iw[wKeyP] = incP; weeklyP[k] = iw; }
                        });
                        // 유령 칸 정리 (2026-08-05): 하위 개수 밖의 sub_i 키 삭제.
                        //   재등록 과정에서 다른 프로젝트 공종표가 남긴 잔재(예: 010 문서의 sub_6=FFU 3027)가
                        //   실적 그래프에만 합산돼 누적이 총점을 넘는 문제의 원인.
                        //   (진행실적 팝업은 하위 행 개수만큼만 읽어 안 보이고, 그래프는 문서의 sub_* 전부를 합산)
                        Object.keys(weeklyP).forEach(k => { const m = k.match(/^sub_(\d+)_(commissioning|intCommissioning)$/); if (m && Number(m[1]) >= p._ints.length) delete weeklyP[k]; });
                        await setDoc(refP, { ...dataP, weekly: weeklyP, updatedAt: new Date().toISOString() });
                        if (onProgressSaved) onProgressSaved({ docKey: dkP, weeklyData: weeklyP });
                        extSetStatus(parentRow._id, { state: 'ok', msg: `반영됨 하위별 통합 ${p._ints.length}건`, fileName: p.fileName, fileRel: p.fileRel });
                    } catch (eL) {}
                    continue;
                }
                // ── 하위 공종 행 신규 생성 (하위표 규칙) ──
                if (p.kind === 'subCreate') {
                    const parentRow = fbRows.find(r => r._id === p.rowId);
                    if (!parentRow) continue;
                    let maxSeq = 0;
                    fbRows.forEach(r => { if (String(r._id).startsWith(`${parentRow._id}_sub`)) { const m = String(r._id).match(/_sub(\d+)$/); if (m) maxSeq = Math.max(maxSeq, Number(m[1])); } });
                    maxSeq += (naAcc[`_seq_${parentRow._id}`] || 0);                     // 한 번에 여러 공종 생성 시 번호 겹침 방지
                    naAcc[`_seq_${parentRow._id}`] = (naAcc[`_seq_${parentRow._id}`] || 0) + 1;
                    const newId = `${parentRow._id}_sub${String(maxSeq + 1).padStart(2, '0')}`;
                    const _d = new Date();
                    const newRow = { _pid: generatePid(), _year: parentRow._year || String(_d.getFullYear()), _regDate: `${_d.getFullYear()}-${String(_d.getMonth() + 1).padStart(2, '0')}-${String(_d.getDate()).padStart(2, '0')}`, _subParent: parentRow._pid || '' };
                    (activeHeaders || []).forEach(h => { newRow[h] = ''; });
                    (activeHeaders || []).forEach(h => { const hn = String(h).replace(/\s+/g, ''); if (hn.includes('공장') || hn === '발주처' || isAssigneeCol(h) || isManagerCol(h)) newRow[h] = parentRow[h] || ''; });
                    newRow['실행번호'] = 's';
                    const stCol2 = (activeHeaders || []).find(h => isStatusCol(h));
                    if (stCol2) newRow[stCol2] = 'sub';
                    if (projectNameCol) newRow[projectNameCol] = `- ${p._sub.name}`;
                    Object.entries(p._sub.want).forEach(([cn, v]) => { newRow[hOfA(cn)] = String(v); });
                    newRow._naOn = ['도면입수', 'I/O Map', '화면작성', '기준정보', '자체시운전'];   // 기본 미적용 5항목 → 값 보이게 켬
                    await setDoc(rowDocRef(currentTeam, newId), stampSave(newRow));
                    recordAudit(AUDIT_ACTIONS.ADD, { ...newRow, _id: newId }, [{ field: '하위 공종 자동 생성 (NAS)', from: '', to: p._sub.name }]);
                    // 주간 장부에도 심기 — 진행실적 팝업·실적 그래프 일치 (2026-07-22)
                    const subObjC = { ...newRow, _id: newId };
                    const _accNmU = String(extWebCol('누적')).replace(/\s+/g, '').toUpperCase();   // 팀별 누적 열 이름 (2026-08-24)
                    for (const [cn2, v2] of Object.entries(p._sub.want)) {
                        const nn2 = String(cn2).replace(/\s+/g, '').toUpperCase();
                        if (nn2 === _accNmU) await extSeedIntLedger(subObjC, v2);
                        else if (nn2 !== '포인트') await syncProgressCellToLedger(subObjC, hOfA(cn2), v2);   // 공정률 4개만 통과(자체·통합%는 자동 무시)
                    }
                    if (subObjC._pid && onProgressSaved) { try { const s3 = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', `progressRecords_${currentTeam}`, subObjC._pid)); if (s3.exists()) onProgressSaved({ docKey: subObjC._pid, weeklyData: s3.data().weekly || {} }); } catch (e3) {} }
                    continue;
                }
                // ── 기존 하위 공종 행 값 갱신 ──
                if (p.kind === 'subSet') {
                    const subRow = fbRows.find(r => r._id === p.rowId);
                    if (!subRow) continue;
                    const patch2 = {};
                    p._sub.changes.forEach(c => { patch2[hOfA(c.col)] = String(c.to); });
                    const prevOn2 = naAcc[subRow._id] || (Array.isArray(subRow._naOn) ? subRow._naOn : []);
                    const nextOn2 = [...new Set([...prevOn2, '도면입수', 'I/O Map', '화면작성', '기준정보', '자체시운전'])];
                    naAcc[subRow._id] = nextOn2;
                    const entry2 = { datetime: new Date().toISOString(), changes: p._sub.changes.map(c => ({ field: c.col, from: String(c.from), to: String(c.to) })) };
                    const baseH2 = histAcc[subRow._id] || (Array.isArray(subRow._changeHistory) ? subRow._changeHistory : []);
                    histAcc[subRow._id] = [...baseH2, entry2];
                    await setDoc(rowDocRef(currentTeam, subRow._id), stampSave({ ...patch2, _naOn: nextOn2, _changeHistory: histAcc[subRow._id] }), { merge: true });
                    recordAudit(AUDIT_ACTIONS.EDIT, subRow, entry2.changes.map(c => ({ field: c.field + ' (NAS 자동)', from: c.from, to: c.to })));
                    // 주간 장부에도 심기 — 진행실적 팝업·실적 그래프 일치 (2026-07-22)
                    const _accNmU2 = String(extWebCol('누적')).replace(/\s+/g, '').toUpperCase();   // 팀별 누적 열 이름 (2026-08-24)
                    for (const c2 of p._sub.changes) {
                        const nn3 = String(c2.col).replace(/\s+/g, '').toUpperCase();
                        if (nn3 === _accNmU2) await extSeedIntLedger(subRow, c2.to);
                        else if (nn3 !== '포인트') await syncProgressCellToLedger(subRow, hOfA(c2.col), c2.to);
                    }
                    const dkS = subRow._pid || '';
                    if (dkS && onProgressSaved) { try { const s4 = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', `progressRecords_${currentTeam}`, dkS)); if (s4.exists()) onProgressSaved({ docKey: dkS, weeklyData: s4.data().weekly || {} }); } catch (e4) {} }
                    continue;
                }
                // ── 값 1개 반영 (단일 규칙 + 하위표의 부모 총계) ──
                const row = fbRows.find(r => r._id === p.rowId);
                if (!row) continue;
                const tgtH = hOfA(p.target);
                const valStr = String(p.to);
                const entry = { datetime: new Date().toISOString(), changes: [{ field: tgtH, from: String(row[tgtH] ?? ''), to: valStr }] };
                const baseH = histAcc[row._id] || (Array.isArray(row._changeHistory) ? row._changeHistory : []);
                histAcc[row._id] = [...baseH, entry];
                const patch = {
                    [tgtH]: valStr,
                    _changeHistory: histAcc[row._id],
                    _extSync: { ...(row._extSync || {}), lastApplied: { ...((row._extSync || {}).lastApplied || {}), [p.target]: { value: p.to, fileName: p.fileName, rel: p.fileRel || '', shared: !!p.shared, at: new Date().toISOString() } } },
                };
                // 부모 총계 %(도면입수·I/O Map·화면작성·기준정보) = 기본 미적용 항목 → 자동 '적용' 켬
                const tn = String(p.target).replace(/\s+/g, '').toUpperCase();
                if (['도면입수', 'I/OMAP', '화면작성', '기준정보'].includes(tn)) {
                    const prevOn = naAcc[row._id] || (Array.isArray(row._naOn) ? row._naOn : []);
                    const onName = tn === 'I/OMAP' ? 'I/O Map' : p.target;
                    patch._naOn = [...new Set([...prevOn, onName])];
                    naAcc[row._id] = patch._naOn;
                }
                await setDoc(rowDocRef(currentTeam, row._id), stampSave(patch), { merge: true });
                recordAudit(AUDIT_ACTIONS.EDIT, { ...row, [tgtH]: valStr }, [{ field: tgtH + ' (NAS 자동)', from: entry.changes[0].from, to: valStr }]);
                await syncProgressCellToLedger(row, tgtH, p.to);
                // 누적(진행 pt) 반영 시 — 심기와 동일하게 통합시운전 주간장부에도 기록 → 그래프·팝업 일치
                if (tn === String(extWebCol('누적')).replace(/\s+/g, '').toUpperCase()) { try {
                    const _dk2 = row._pid || row.pid || row['실행번호'] || row.execNo || String(row._id || '');
                    if (_dk2) {
                        const _ref2 = doc(db, 'artifacts', appId, 'public', 'data', `progressRecords_${currentTeam}`, _dk2);
                        const _snap2 = await getDoc(_ref2);
                        const _data2 = _snap2.exists() ? _snap2.data() : { docKey: _dk2, execNo: (row['실행번호'] || '') };
                        const _weekly2 = { ...(_data2.weekly || {}) };
                        const now2 = new Date(); const cy2 = now2.getFullYear(), cm2 = now2.getMonth() + 1, cw2 = Math.min(5, Math.max(1, Math.ceil(now2.getDate() / 7)));
                        const _iw2 = { ...(_weekly2.intCommissioning || {}) };
                        const _wk2 = `${cy2}-${cm2}-${cw2}`;
                        _iw2[_wk2] = placeAccIntoWeek(_iw2, _wk2, p.to);   // ★누적→이번 주 증분 (2026-09-01, 이중 합산 방지)
                        _weekly2.intCommissioning = _iw2;
                        await setDoc(_ref2, { ..._data2, weekly: _weekly2, updatedAt: new Date().toISOString() });
                    }
                } catch (e2) {} }
                const dk = row._pid || row.pid || row['실행번호'] || row.execNo || String(row._id || '');
                if (dk && onProgressSaved) { try { const s = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', `progressRecords_${currentTeam}`, dk)); if (s.exists()) onProgressSaved({ docKey: dk, weeklyData: s.data().weekly || {} }); } catch (e) {} }
                extSetStatus(row._id, { state: 'ok', msg: `반영됨 ${p.target}=${p.to}`, fileName: p.fileName, fileRel: p.fileRel, value: p.to });
            }
            // 완료 안내 — 건수가 많으면 요약 (전체 나열 시 화면을 넘어가는 문제, 2026-07-22)
            const _lines = list.map(p => {
                if (p.kind === 'subCreate') return `· └ ${p._sub.name} 하위 생성 (6항목+총점·누적)`;
                if (p.kind === 'subSet') return `· └ ${p._sub.name} 갱신 ${p._sub.changes.length}칸`;
                if (p.kind === 'subLedger') return `· 팝업 하위별 통합 ${p._ints.length}건 기록`;
                return `· ${p.target}: ${p.from} → ${p.to}`;
            });
            const _shown = _lines.slice(0, 8).join('\n');
            const _more = _lines.length > 8 ? `\n· … 외 ${_lines.length - 8}건 (전체 내역은 백로그에서 확인)` : '';
            // 자동(메인 PC)일 땐 모달 대신 구석 토스트 — 무인 PC에 확인창이 쌓이면 다음 검사가 막힌다 (2026-07-27)
            if (opts.auto) {
                const _t = _lines.slice(0, 3).join('\n') + (_lines.length > 3 ? `\n· … 외 ${_lines.length - 3}건` : '');
                showExtToast(`자동 반영 ${list.length}건 · ${extHHMM(new Date())}\n${_t}`);
            } else setAlertMsg(`NAS 진척자료 반영 완료! (총 ${list.length}건)\n\n${_shown}${_more}\n\n주간 진행실적 장부에도 함께 기록되었습니다.`);
        } catch (e) { if (opts.auto) showExtToast('NAS 반영 오류: ' + e.message, true); else setAlertMsg('NAS 반영 오류: ' + e.message); }
        // (2026-08-07) auto = 무인 반영일 땐 확인창을 건드리지 않는다.
        //   예전엔 무조건 null로 지워서, 사람이 보고 있던 '하위 행 새로 만들기' 확인창이 소리 없이 사라졌다.
        finally { setExtBusy(false); if (!opts.auto) setExtProposals(null); }
    };

    // 규칙·경로 저장(관리자) — 행 _extSync에 병합 저장
    const extSaveSync = async (row, next) => {
        try {
            await setDoc(rowDocRef(currentTeam, row._id), stampSave({ _extSync: { ...(row._extSync || {}), ...next } }), { merge: true });
            recordAudit(AUDIT_ACTIONS.EDIT, row, [{ field: '진척자료 자동 규칙', from: '',
                to: next.rules ? next.rules.map(r => r.target).join(',')
                  : (next.folder !== undefined ? `폴더 '${next.folder || '(지정 안 함)'}'` : (next.sharedUncPath !== undefined ? '공용 폴더 주소' : '경로 변경')) }]);
        } catch (e) { setAlertMsg('규칙 저장 오류: ' + e.message); }
    };

    // [지금 확인] (2026-07-31) — 자동 반영기에게 '지금 한 바퀴 돌아달라'고 요청한다.
    //   요청 문서 한 줄만 쓴다. 리더가 20초마다 그 문서를 확인해 즉시 실행하고,
    //   처리하면 상태 문서에 lastRequestAt 을 남긴다 → 아래 화면이 '처리 완료'로 바뀐다.
    const sendReaderRequest = async () => {
        if (readerReqBusy) return;
        setReaderReqBusy(true);
        try {
            const at = new Date().toISOString();
            await setDoc(readerRequestRef(currentTeam), { at, by: user?.email || '', team: currentTeam });
            setMyReaderReqAt(at);
        } catch (e) {
            setAlertMsg('지금 확인 요청 실패: ' + e.message + '\n\n15분 주기 자동 반영은 그대로 동작합니다.');
        } finally { setReaderReqBusy(false); }
    };

    // 자동 반영기 상태 구독 (2026-07-31) — NAS 프로그램이 매 회차 남기는 문서 1개. 실시간이라 새로고침 불필요.
    useEffect(() => {
        if (!RULE_UI_ENABLED || !currentTeam) { setReaderStatus(null); return; }
        const unsub = onSnapshot(readerStatusRef(currentTeam),
            snap => setReaderStatus(snap.exists() ? snap.data() : null),
            ()   => setReaderStatus(null));
        return () => unsub();
    }, [currentTeam]);

    // 화면 진입 후 1회 자동 확인 — 이미 허용된 폴더만 조용히 검사(팀별 1번), 변경 있으면 반영 확인창
    //   (2026-08-07) 메인 PC는 예외로 둔다. 이유 두 가지:
    //     ① 팀을 번갈아 보므로 '팀별 딱 1번' 잠금을 걸면 두 번째 방문부터 검사가 안 된다.
    //     ② 확인창 대신 자동 저장이어야 한다 — 무인 PC에 확인창이 쌓이면 그 뒤가 막힌다.
    //   단 이 훅은 fbRows가 바뀔 때마다 다시 도는데, 자동 반영이 값을 바꾸면 또 fbRows가 바뀐다.
    //   그래서 '같은 팀은 1분 안에 다시 안 돈다'는 가드로 되먹임 고리를 끊는다(팀 전환 간격은 15분이라 영향 없음).
    useEffect(() => {
        if (!NAS_SYNC_ENABLED) return;                       // NAS 동기화 전면 비활성화 (2026-07-30)
        if (dataSource !== 'firebase' || !fbRows.length) return;
        if (!fbRows.some(r => extRulesOf(r).length)) return;
        if (extMainPc) {
            if (Date.now() - (extTeamRunRef.current[currentTeam] || 0) < 60 * 1000) return;
            extTeamRunRef.current[currentTeam] = Date.now();
            extLastRunRef.current = Date.now();              // 30분 타이머도 '방금 돈' 것으로 맞춰 중복 실행 방지
            try { extAutoFnRef.current && extAutoFnRef.current(); } catch (e) {}
            return;
        }
        if (extAutoRef.current[currentTeam]) return;
        extAutoRef.current[currentTeam] = true;
        extCheckAll({ silent: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dataSource, currentTeam, fbRows, extMainPc]);

    // ── 메인 PC 주기 자동 반영 (2026-07-27, 30분) ─────────────────────────────
    //   값 갱신(%·포인트·누적·하위 값 갱신)은 확인 없이 자동 저장.
    //   하위 행 '신규 생성'만 확인창을 남긴다 — 데이터가 늘어나는 일은 사람 눈으로 한 번 본다(팀장님 확정).
    const extAutoRun = async () => {
        if (!NAS_SYNC_ENABLED) return;                       // NAS 동기화 전면 비활성화 (2026-07-30) — 30분 주기 무인 반영 정지
        if (!extMainPc || extBusy || dataSource !== 'firebase') return;
        // (2026-08-07) 예전엔 확인창이 떠 있으면 검사를 통째로 건너뛰었다 → 공용 PC에 확인창이 하나 뜨고
        //   아무도 안 누르면 그때부터 자동 반영이 영영 멈췄다(화면은 멀쩡한데 값만 안 올라옴).
        //   이제는 값 갱신은 계속 하고, '하위 행 새로 만들기' 제안만 미룬다 — 사람이 보던 확인창을 덮어쓰지 않기 위해.
        const holding = !!(extProposals && extProposals.length);
        const targets = fbRows.filter(r => extRulesOf(r).length);
        if (!targets.length) return;
        const all = [];
        setExtBusy(true);
        try {
            for (const r of targets) { const ps = await extCheckRow(r, { silent: true }); all.push(...ps); }
        } finally { setExtBusy(false); setExtLastAuto(extHHMM(new Date())); }
        // 폴더 허가증 만료·오류는 조용히 넘기지 않는다 — 공용 PC는 아무도 안 보고 있을 수 있음
        const bad = targets.filter(r => ['perm', 'nofolder', 'error'].includes((extStatusRef.current[r._id] || {}).state));
        if (bad.length) showExtToast(`NAS 자동 확인 실패 ${bad.length}건 (${extHHMM(new Date())})\n관리 칸의 NAS 버튼 → [지금 확인]으로 폴더 읽기를 다시 허용해주세요.`, true);
        if (!all.length) return;
        const autoList = all.filter(p => p.kind !== 'subCreate');
        const askList  = all.filter(p => p.kind === 'subCreate');
        if (autoList.length) await extApplyProposals(autoList, { auto: true });
        if (askList.length && !holding) setExtProposals(askList);         // 하위 신규 생성 → 확인창 유지 (이미 떠 있으면 그대로 둠)
    };
    extAutoFnRef.current = extAutoRun;   // 매 렌더마다 최신 함수로 교체 (타이머는 아래에서 딱 1번만 건다)

    //   1분 심장박동 + 벽시계 비교 방식: 크롬이 백그라운드 탭 타이머를 늦추거나
    //   PC가 잠깐 절전에 들어가도, 깨어나는 즉시 밀린 검사를 따라잡는다.
    useEffect(() => {
        if (!NAS_SYNC_ENABLED) return;                       // NAS 동기화 전면 비활성화 (2026-07-30) — 타이머를 아예 걸지 않는다
        if (!extMainPc) return;
        if (!extLastRunRef.current) extLastRunRef.current = Date.now();   // 화면 진입 1회 검사 직후이므로 30분 뒤부터
        const tick = () => {
            const now = Date.now();
            if (now - (extLastRunRef.current || 0) < EXT_AUTO_MS) return;
            extLastRunRef.current = now;
            try { extAutoFnRef.current && extAutoFnRef.current(); } catch (e) {}
        };
        const t = setInterval(tick, EXT_TICK_MS);
        return () => clearInterval(t);
    }, [extMainPc]);

    // ── 메인 PC 창 닫기 경고 (2026-08-07) ─────────────────────────────────────
    //   공용 PC에서 누가 무심코 창을 닫으면 자동 반영이 그대로 멈춘다(다시 열어 List까지 들어와야 재개).
    //   메인 PC로 지정된 PC에서만 브라우저 기본 확인창을 띄운다 — 일반 PC·직원 PC는 전혀 영향 없음.
    //   ※ 브라우저 정책상 그 창에서 클릭 등 상호작용이 한 번이라도 있어야 확인창이 뜬다(사람이 닫을 땐 항상 해당됨).
    useEffect(() => {
        if (!NAS_SYNC_ENABLED || !extMainPc) return;
        const onBeforeUnload = (e) => { e.preventDefault(); e.returnValue = ''; return ''; };
        window.addEventListener('beforeunload', onBeforeUnload);
        return () => window.removeEventListener('beforeunload', onBeforeUnload);
    }, [extMainPc]);

    // ── 일회성: 메인표 공정률(%) → 진행실적 주간 장부 '심기' (2026-07-21) ────────────
    //   엑셀 업로드는 표 칸만 채우고 주간 장부(progressRecords)는 안 채워, 진행실적 팝업·그래프가 비어 보인다.
    //   값이 있는 공정률 7개(도면입수·I/O Map·화면작성·기준정보·PLC·ETOS·HMI)를 '오늘이 속한 현재 주차'에 한 번 심는다.
    //   누적%라 현재 주차 1칸이면 의미가 맞고, 이후 주별 갱신이 그대로 이어진다.
    //   ★ 값이 '90'이든 '90%'(엑셀 퍼센트 서식)든 인식 — 앱 편집 로직과 동일하게 '%' 떼고 숫자만 본다.
    //   ★ 검증된 역방향 동기화(syncProgressCellToLedger) 그대로 재사용 — 메인표 값은 안 건드린다(주간 장부만 씀).
    //   시운전·포인트는 대상 아님(progItemKeyOf가 자동 제외). 관리자·클라우드 상태 전용.
    //   ★2026-09-02 수리: 하위(공종) 있는 행 = 부모 장부 sub_○_intCommissioning으로 심기(팝업·그래프가 읽는 곳),
    //   하위 행 자체는 건너뜀(자기 pid 문서는 아무도 안 읽음). 수식 팀(기술1팀)은 시운전 심기 제외.
    const handleSeedProgressFromMain = async () => {
        if (!isAdmin) { setAlertMsg('진행실적 심기는 관리자만 할 수 있습니다.'); return; }
        if (dataSource !== 'firebase') { setAlertMsg('클라우드 데이터 상태에서만 실행할 수 있습니다.\n(엑셀 업로드 미리보기 중이면 확정 저장 또는 업로드 취소 후 실행하세요)'); return; }
        const progHeaders = (activeHeaders || []).filter(h => progItemKeyOf(h));   // 공정률 7개 헤더만
        const _accNm3 = String(extWebCol('누적')).replace(/\s/g, ''), _intNm3 = String(extWebCol('통합시운전')).replace(/\s/g, '');   // 팀별 열 이름 (2026-08-24: 기술2팀 Point·진행율 %)
        const accCol = (activeHeaders || []).find(h => String(h).replace(/\s/g, '') === _accNm3);      // 누적 = 진행 포인트 (2026-07-21 팀장님: 포인트=총점·누적=진행)
        const intCol = (activeHeaders || []).find(h => String(h).replace(/\s/g, '') === _intNm3);
        const targets = [];
        let cellCnt = 0, intCnt = 0;
        const accOf = (row) => { const raw = accCol ? String(row[accCol] ?? '').replace(/%/g, '').trim() : ''; return /^\d+(\.\d+)?$/.test(raw) ? Number(raw) : 0; };
        for (let ri = 0; ri < fbRows.length; ri++) {
            const r = fbRows[ri];
            if (isSubListRow(r)) continue;   // ★하위(공종) 행은 건너뜀 (2026-09-02): 하위 pid 문서에 쓰면 팝업·그래프 어디서도 안 읽음 — 부모 장부 sub_○ 키로 심는다
            const cells = [];
            for (const h of progHeaders) {
                const raw = String(r[h] ?? '').replace(/%/g, '').trim();   // '%'·공백 제거 후 숫자만 (엑셀이 90%로 저장한 경우 대응)
                if (/^-?\d+(\.\d+)?$/.test(raw)) cells.push({ h, val: raw });
            }
            // 바로 아래 연속된 하위(실행번호 s/-) 행 — 진행실적 팝업 subRows와 같은 걷기 = 같은 순번 (2026-09-02)
            const subsArr = [];
            for (let si = ri + 1; si < fbRows.length; si++) { if (isSubListRow(fbRows[si])) subsArr.push(fbRows[si]); else break; }
            // 누적(진행 포인트) → 통합시운전 심기 (2026-07-21 팀장님: 통합시운전% = 누적÷포인트 자동)
            //   수식 팀(기술1팀 2026)은 '누적' 칸이 포인트가 아니라 공정 수량 누적 — 시운전 심기 제외 (2026-09-02)
            const _tot = effTotalPt(r);
            let seedInt = null;
            if (!fmActive(r)) {
                if (subsArr.length > 0) {
                    const ints = subsArr.map(accOf);   // 하위 체제: 부모 장부 sub_○_intCommissioning — NAS '하위별 통합'과 동일 구조 (2026-09-02)
                    if (ints.some(v => v > 0) && _tot > 0) seedInt = { subInts: ints, pts: ints.reduce((s, v) => s + v, 0), tot: _tot };
                } else {
                    const _accPts = accOf(r);
                    if (_accPts > 0 && _tot > 0) seedInt = { pts: _accPts, tot: _tot };
                }
            }
            if (cells.length || seedInt) { targets.push({ r, cells, seedInt }); cellCnt += cells.length; if (seedInt) intCnt++; }
        }
        if (!targets.length) { setAlertMsg('심을 값이 없습니다.\n(공정률 % 또는 누적 포인트가 있는 행이 없음)'); return; }
        const now = new Date();
        const cy = now.getFullYear(), cm = now.getMonth() + 1;
        const cw = Math.min(5, Math.max(1, Math.ceil(now.getDate() / 7)));
        if (!window.confirm(`[진행실적 심기]\n\n대상 ${targets.length}개 프로젝트 → '${cy}년 ${cm}월 ${cw}주차'에 심습니다.\n\n· 공정률 값 ${cellCnt}개 (PLC·ETOS·HMI 등 — 주간 장부만)\n· 시운전 누적 ${intCnt}건 (통합시운전 장부 + %칸 자동 = 누적÷포인트 · 하위 공종 있는 행은 부모 팝업 하위별로)\n\n진행할까요?`)) return;
        setIsLoading(true);
        try {
            for (const { r, cells, seedInt } of targets) {
                for (const { h, val } of cells) { await syncProgressCellToLedger(r, h, val); }
                if (seedInt) {
                    // 누적(진행 포인트) → 통합시운전 주간장부(이번 주차 — 재실행해도 같은 칸 덮어쓰기라 안전) + %칸 자동
                    const _dk = r._pid || r.pid || r['실행번호'] || r.execNo || String(r._id || r.id || '');
                    if (_dk) { try {
                        const _ref = doc(db, 'artifacts', appId, 'public', 'data', `progressRecords_${currentTeam}`, _dk);
                        const _snap = await getDoc(_ref);
                        const _data = _snap.exists() ? _snap.data() : { docKey: _dk, execNo: (r['실행번호'] || r.execNo || '') };
                        const _weekly = { ...(_data.weekly || {}) };
                        const _wkS = `${cy}-${cm}-${cw}`;
                        if (seedInt.subInts) {
                            // ★하위 체제 (2026-09-02): 팝업·그래프가 읽는 곳 = 부모 장부의 sub_○_intCommissioning — NAS extApplyProposals 'subLedger'와 동일 규칙
                            seedInt.subInts.forEach((pts, i) => {
                                const k = `sub_${i}_intCommissioning`;
                                const iw = { ...(_weekly[k] || {}) };
                                const inc = placeAccIntoWeek(iw, _wkS, pts);   // 누적→이번 주 증분 (2026-09-01, 이중 합산 방지)
                                if (inc !== 0 || iw[_wkS] !== undefined) { iw[_wkS] = inc; _weekly[k] = iw; }
                            });
                            delete _weekly.intCommissioning;   // 하위 체제에선 최상위 키를 아무도 안 읽음 — 예전 심기가 여기 쓴 잔재 제거 (2026-09-02)
                            Object.keys(_weekly).forEach(k => { const m = k.match(/^sub_(\d+)_(commissioning|intCommissioning)$/); if (m && Number(m[1]) >= seedInt.subInts.length) delete _weekly[k]; });   // 유령 칸 정리 (2026-08-05 규칙)
                        } else {
                            const _iw = { ...(_weekly.intCommissioning || {}) };
                            _iw[_wkS] = placeAccIntoWeek(_iw, _wkS, seedInt.pts);   // ★누적→이번 주 증분 (2026-09-01, 이중 합산 방지)
                            _weekly.intCommissioning = _iw;
                        }
                        await setDoc(_ref, { ..._data, weekly: _weekly, updatedAt: new Date().toISOString() });
                        const _pct = Math.round(seedInt.pts / seedInt.tot * 1000) / 10;   // 진행율% = 팝업 적용(paRecalc)과 동일식, 소수 1자리 (2026-09-02 통일 — 예전엔 정수 반올림)
                        if (intCol && String(r[intCol] ?? '').replace(/%/g, '').trim() !== String(_pct) && !isExtLockedCell(r, intCol)) {   // NAS 자동 칸 보호 (2026-07-22)
                            await setDoc(rowDocRef(currentTeam, r._id), { [intCol]: String(_pct) }, { merge: true });
                        }
                    } catch (e) { console.warn('[심기-시운전] 실패:', e); } }
                }
                // ★ 그래프 즉시 반영: App.js progressRecordsMap 메모리 갱신 (심기는 Firestore 직접 write라 맵이 안 바뀜)
                const dk = r._pid || r.pid || r['실행번호'] || r.execNo || String(r._id || r.id || '');
                if (dk && onProgressSaved) {
                    try { const s = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', `progressRecords_${currentTeam}`, dk)); if (s.exists()) onProgressSaved({ docKey: dk, weeklyData: s.data().weekly || {} }); } catch (e) {}
                }
            }
            addLog(`[진행실적 심기] ${targets.length}행 · 공정률 ${cellCnt}값 · 시운전누적 ${intCnt}건 → ${cy}-${cm}-${cw} 주차`);
            setAlertMsg(`진행실적 심기 완료!\n\n${targets.length}개 프로젝트 — 공정률 ${cellCnt}개 값 · 시운전 누적 ${intCnt}건을 ${cm}월 ${cw}주차에 심었습니다.\n통합시운전 %는 누적÷포인트로 자동 반영되었습니다.\n진행실적 팝업·실적 그래프에서 확인해보세요.`);
        } catch (err) {
            addLog(`[진행실적 심기 오류] ${err.message}`);
            setAlertMsg(`진행실적 심기 오류: ${err.message}`);
        } finally { setIsLoading(false); }
    };

    // 진행실적 백지 초기화 — progressRecords 주차값 + 메인표(List 행) 반영 필드 모두 비움 (2026-07-06)
    const PROGRESS_RESET_FIELDS = ['자체시운전','통합시운전','포인트실적','포인트소스','도면입수','I/O Map','화면작성','기준정보','PLC','ETOS','HMI'];
    const handleResetProgress = async (row) => {
        if (!row) return;
        // ★ 관리자 전용 (2026-07-14): 주차별 진행실적이 전부 백지가 됨(되돌리기 불가)
        if (!isAdmin) { setAlertMsg('진행실적 초기화는 관리자만 할 수 있습니다.'); return; }
        const nm = row['프로젝트명'] || row['프로젝트'] || row['Project'] || row['공사명'] || '이 프로젝트';
        if (!window.confirm(`[${nm}]\n\n진행실적(주차 입력)과 메인표 반영값(공정률·시운전·포인트)을 모두 지워 백지로 만듭니다.\n되돌릴 수 없습니다. 계속할까요?`)) return;
        const _id = row._id;
        const pid = row._pid;
        try {
            if (pid) {
                await setDoc(doc(db, 'artifacts', appId, 'public', 'data', `progressRecords_${currentTeam}`, pid), { weekly: {}, updatedAt: new Date().toISOString(), _clearedAt: new Date().toISOString() });
                // 연결된 월간보고(projects)의 monthlyData도 비움 — 그래프가 여기서도 시운전/공정 포인트를 읽기 때문 (2026-07-06)
                const linkedM = allProjects ? allProjects.find(p => p.pid === pid) : null;
                if (linkedM && linkedM.id != null) {
                    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'projects', String(linkedM.id)), { monthlyData: [], monthlyPoints: [] }, { merge: true });
                }
            }
            if (dataSource !== 'firebase') {
                const updater = rows => rows.map(r => { if (r._id !== _id) return r; const c = { ...r }; PROGRESS_RESET_FIELDS.forEach(f => delete c[f]); return c; });
                if (dataSource === 'pending') setPendingData(p => ({ ...p, rows: updater(p.rows) }));
                if (dataSource === 'local')   setLocalData(p => ({ ...p, rows: updater(p.rows) }));
            } else {
                const { _id: _drop, ...rest } = row;
                PROGRESS_RESET_FIELDS.forEach(f => delete rest[f]);
                await setDoc(rowDocRef(currentTeam, _id), rest);
            }
            setAlertMsg('✓ 진행실적을 백지로 초기화했습니다 — ' + nm);
            setTimeout(() => setAlertMsg(''), 3500);
        } catch (e) {
            setAlertMsg('초기화 오류: ' + e.message);
        }
    };

    // 진행현황 관리 저장 — List 전용 상태목록을 teamSettings[팀].listStatus로 저장(onSnapshot이 App.js 자동 갱신) (2026-07-06 2단계)
    const saveStatusMgr = async () => {
        if (!statusMgr || !currentTeam) return;
        // 중복 제거(같은 이름 두 번 방지) + 앞뒤 공백 제거 + 빈칸 제외
        const labels = [...new Set(statusMgr.map(s => String(s).trim()).filter(Boolean))];
        if (!labels.length) { setAlertMsg('진행현황을 1개 이상 남겨주세요'); return; }
        // 색 맵 — 남은 상태들의 편집 색만 모아 저장(안 건드린 색은 원본 유지) (2026-07-08 ②)
        const colorMap = {};
        labels.forEach(name => { if (statusMgrColors[name]) colorMap[name] = statusMgrColors[name]; });
        try {
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'teamSettings'), { [currentTeam]: { listStatus: labels, listStatusColors: colorMap } }, { merge: true });
            setAlertMsg('✓ 진행현황 목록 저장됨 (' + labels.length + '개)');
            setStatusMgr(null);
            setTimeout(() => setAlertMsg(''), 3000);
        } catch (e) { setAlertMsg('저장 오류: ' + e.message); }
    };
    // 진행현황 관리 안전장치 (2026-07-07): 기존 이름은 잠그고(수정 불가), 추가·삭제만 허용.
    //   - statusMgrOrigSet: 모달 열 때의 원본 이름들 → 여기 있으면 '기존'(잠금)
    //   - countStatusUse: 그 상태값을 실제로 쓰는 행 수(삭제 시 안내용) — 목록에서만 빼며 행 데이터는 안 지움
    const statusMgrOrigSet = new Set(statusMgrOrig);
    const countStatusUse = (name) => {
        if (!statusFilterCol || !name) return 0;
        const target = String(name).toUpperCase() === 'HOLD' ? 'Hold' : String(name);
        return activeRows.filter(r => {
            let v = String(r[statusFilterCol] || '').trim();
            if (v.toUpperCase() === 'HOLD') v = 'Hold';
            return v === target;
        }).length;
    };
    // 담당자 관리 저장 — List 전용 담당자 목록을 teamSettings[팀].listManager로 저장 (2026-07-07 3단계)
    const saveManagerMgr = async () => {
        if (!managerMgr || !currentTeam) return;
        const names = [...new Set(managerMgr.map(s => String(s).trim()).filter(Boolean))];
        if (!names.length) { setAlertMsg('담당자를 1명 이상 남겨주세요'); return; }
        try {
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'teamSettings'), { [currentTeam]: { listManager: names } }, { merge: true });
            setAlertMsg('✓ 담당자 목록 저장됨 (' + names.length + '명)');
            setManagerMgr(null);
            setTimeout(() => setAlertMsg(''), 3000);
        } catch (e) { setAlertMsg('저장 오류: ' + e.message); }
    };
    // 담당자 관리 안전장치 (2026-07-07 3단계): 기존 이름 잠금 + 배정 0명일 때만 삭제. 카운트는 담당자열 이름(직책 제외) 기준 — 필터와 동일.
    const managerMgrOrigSet = new Set(managerMgrOrig);
    const countManagerUse = (name) => {
        // 상단 담당자 탭과 '같은 기준(기준연도)'으로 셈 = assigneeCountMap 재사용. 탭이 0이면 삭제 잠금도 풀림 (2026-07-07)
        const key = extractName(normalizeAssignee(name));
        return key ? (assigneeCountMap[key] || 0) : 0;
    };
    // 인라인 드롭다운 위치 — 아래 공간이 부족하면 위로 펼침. 위로 펼 땐 '클릭한 지점(cy)' 기준이라 셀이 높아도 가깝게 뜸 (2026-07-07). maxH 넘으면 스크롤
    const dropAnchor = (rect, clientY) => {
        const cy = (clientY == null ? rect.bottom : clientY);
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;
        const up = spaceBelow < 260 && spaceAbove > spaceBelow;
        return { top: rect.bottom, upBottom: window.innerHeight - cy, up, maxH: Math.max(140, (up ? cy : spaceBelow) - 12) };
    };

    // ── 작업 백로그 기록 (2026-07-10) — 누가·언제·무엇을. who=회사 이메일(백로그 화면에서 명단의 이름으로 변환) ──
    //   실데이터(firebase) 저장만 기록 — 엑셀 미리보기(pending)·로컬은 제외해 노이즈 방지.
    const recordAudit = (action, row, changes) => {
        if (dataSource !== 'firebase') return;
        logAudit(currentTeam, {
            who: user?.email || '',
            action,
            projectId: String(row?._id || row?.id || ''),
            projectName: pickProjectName(row),
            execNo: row?.['실행번호'] || row?.execNo || '',
            pid: row?._pid || row?.pid || '',
            changes: changes || [],
        });
    };

    const saveDetailRow = async (force) => {
        if (!detailRow) return;
        const isForce = (force === true);   // ★ onClick 이벤트 객체가 들어와도 강제저장으로 오인하지 않도록 엄격 비교
        // ⑨ 동시수정 보완 + ② 내용↔날짜:
        //   팝업이 열린 사이 표(인라인)에서 같은 행을 고쳤을 수 있으니, '현재 최신 원본(latest)'에
        //   '팝업에서 실제로 바뀐 칸'만 덮어쓴다(표 편집 보존). 그 위에 내용↔날짜 연동을 적용.
        const latest = activeRows.find(r => r._id === detailRow._id) || detailRowOriginal || detailRow;
        const popupChanges = {};
        activeHeaders.forEach(h => {
            if (String(detailRowOriginal?.[h] ?? '') !== String(detailRow[h] ?? '')) popupChanges[h] = detailRow[h];
        });
        // ★ 동시수정 감지 (2026-07-14): 내가 고친 칸을 팝업 열어둔 사이 다른 사람이 먼저 고쳤으면 확인부터.
        if (!isForce && dataSource === 'firebase') {
            const cf = await findConflicts(detailRow._id, Object.keys(popupChanges));
            if (cf) { setConflictDlg({ ...cf, mine: { ...popupChanges }, onOverwrite: () => { setConflictDlg(null); saveDetailRow(true); } }); return; }
        }
        let working = { ...latest, ...popupChanges };
        if (Array.isArray(detailRow._naItems)) working._naItems = detailRow._naItems;   // 프로젝트별 적용/미적용 저장 (2026-07-21)
        if (Array.isArray(detailRow._naOn)) working._naOn = detailRow._naOn;             // 기본 미적용 항목의 예외(켬) 저장 (2026-07-21)
        if (working['번호'] !== undefined) working['번호'] = padProjectNo(working['번호']);   // 번호 3자리 통일 (2026-07-20)
        const contentChanged = activeHeaders.some(h =>
            isProgressContentCol(h) && String(detailRowOriginal?.[h] ?? '') !== String(detailRow[h] ?? ''));
        if (contentChanged) {
            const today = new Date().toISOString().slice(0, 10);
            activeHeaders.forEach(h => { if (isProgressDateCol(h)) working[h] = today; });
        }
        // ★ 수식 재계산 (2026-08-19, 기술1팀): 상세팝업에서 트리거 칸을 고쳤어도 자동 칸 일관 유지
        if (fmActive(working)) Object.assign(working, fmRecalc(working, latest));
        if (paCfg) Object.assign(working, paRecalc(working));   // 진행율% 자동 (2026-08-24)
        const entry = buildChangeEntry(latest, working);
        const prevHist = Array.isArray(latest._changeHistory) ? latest._changeHistory : [];
        const updatedRow = entry ? { ...working, _changeHistory: [...prevHist, entry] } : working;
        if (dataSource !== 'firebase') {
            const updater = rows => rows.map(r => r._id === updatedRow._id ? { ...updatedRow } : r);
            if (dataSource === 'pending') setPendingData(p => ({ ...p, rows: updater(p.rows) }));
            if (dataSource === 'local')   setLocalData(p => ({ ...p, rows: updater(p.rows) }));
            setDetailRow(null); setDetailRowOriginal(null); return;
        }
        const { _id, ...data } = updatedRow;
        try {
            await setDoc(rowDocRef(currentTeam, _id), stampSave(data));
            if (entry) recordAudit(AUDIT_ACTIONS.EDIT, working, entry.changes);   // 백로그: 상세팝업 수정
            setDraft(prev => { if (!prev[_id]) return prev; const n = { ...prev }; delete n[_id]; return n; });   // 팝업이 행 전체를 썼으니 그 행 초안은 해소 (2026-08-27)
            setDetailRow(null); setDetailRowOriginal(null);
        }
        catch (err) { setAlertMsg(`저장 오류: ${err.message}`); }
    };

    // ── 실행번호 등록 ─────────────────────────────────────────────────────
    const calcSimilarity = (a, b) => {
        if (!a || !b) return 0;
        const norm = s => s.toLowerCase().replace(/[\s\-_\(\)\.\/]/g, '');
        const na = norm(a), nb = norm(b);
        if (na === nb) return 1;
        if (na.includes(nb) || nb.includes(na)) return 0.75;
        const wa = a.split(/[\s\-_\/]+/).filter(w => w.length > 1).map(w => w.toLowerCase());
        const wb = b.split(/[\s\-_\/]+/).filter(w => w.length > 1).map(w => w.toLowerCase());
        const sa = new Set(wa), sb = new Set(wb);
        let overlap = 0;
        sa.forEach(w => { if (sb.has(w)) overlap++; });
        return overlap / Math.max(sa.size, sb.size, 1);
    };

    const openExecNoModal = async (row) => {
        setExecNoModal({ row, candidates: [], selected: null, loading: true });
        // 프로젝트명 컬럼 추정
        const nameKeys = ['프로젝트명', '프로젝트', 'Project', '공사명', '건명', '명칭', '공사'];
        const activeH = activeHeaders;
        const nameKey = nameKeys.find(k => activeH.includes(k)) || activeH.find(h => /프로젝트|공사|건명/.test(h)) || '';
        const rowName = nameKey ? (row[nameKey] || '') : '';
        try {
            const snap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'projects'));
            // A-4a: 다른 List 행과 이미 연결된 pid 집합 (연결 상태 표시용)
            const linkedPidSet = new Set(activeRows.filter(r => r._id !== row._id).map(r => r._pid).filter(Boolean));
            const candidates = [];
            snap.forEach(d => {
                const p = d.data();
                if (p.team && p.team !== currentTeam) return;
                if (!p.execNo) return;
                const score = calcSimilarity(rowName, p.project || '');
                candidates.push({
                    execNo: p.execNo, project: p.project || '', score,
                    docId: d.id, pid: p.pid || '',
                    linkedToThis: !!p.pid && p.pid === (row._pid || ''),
                    linkedToOther: !!p.pid && p.pid !== (row._pid || '') && linkedPidSet.has(p.pid),
                });
            });
            candidates.sort((a, b) => b.score - a.score);
            setExecNoModal(prev => ({ ...prev, candidates, loading: false }));
        } catch (e) {
            setAlertMsg('월간보고 데이터 로드 실패: ' + e.message);
            setExecNoModal(null);
        }
    };

    const saveExecNo = async () => {
        if (!execNoModal?.selected || !execNoModal?.row) return;
        const { row, selected } = execNoModal;
        const { _id, ...rest } = row;
        try {
            // A-4a: 프로젝트 연결 — 실행번호 기록 + 고유 ID 통일 (List 행의 _pid가 정(正), List = 어미)
            const rowPid = rest._pid || generatePid();
            await setDoc(rowDocRef(currentTeam, _id), { ...rest, _pid: rowPid, '실행번호': selected.execNo });
            if (selected.docId) {
                await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'projects', selected.docId), { pid: rowPid }, { merge: true });
            }
            // A-4b 보완(2026-06-12): 연결로 pid가 바뀌면 기존 진행실적(progressRecords)을 옛 pid→새 pid로 이전
            // (옛 열쇠 사물함에 남아 고아가 되는 것 방지. ProgressModal의 _migratedTo 폴백 규칙과 동일)
            const oldPid = selected.pid;
            if (oldPid && oldPid !== rowPid) {
                const prCol = `progressRecords_${currentTeam}`;
                const oldRef = doc(db, 'artifacts', appId, 'public', 'data', prCol, oldPid);
                const newRef = doc(db, 'artifacts', appId, 'public', 'data', prCol, rowPid);
                const [oldSnap, newSnap] = await Promise.all([getDoc(oldRef), getDoc(newRef)]);
                const oldWeekly = oldSnap.exists() ? (oldSnap.data().weekly || {}) : {};
                const oldHasData = Object.keys(oldWeekly).length > 0;
                const newHasData = newSnap.exists() && Object.keys(newSnap.data().weekly || {}).length > 0;
                if (oldHasData && !oldSnap.data()._migratedTo && !newHasData) {
                    // 새 사물함이 비어있을 때만 자동 이전 (안전)
                    await setDoc(newRef, { weekly: oldWeekly, execNo: selected.execNo, updatedAt: new Date().toISOString(), _mergedFrom: oldPid }, { merge: true });
                    await setDoc(oldRef, { _migratedTo: rowPid }, { merge: true });
                } else if (oldHasData && newHasData) {
                    // 양쪽 다 진행실적 존재 → 자동 병합 보류 (수동 도구로 확인)
                    setAlertMsg('연결됨. 단, 양쪽 모두 진행실적이 있어 자동 이전은 보류했습니다. [설정 > 주간장부 통일 병합]에서 확인하세요.');
                }
            }
            // 로컬 상태 업데이트
            if (dataSource !== 'firebase') {
                const updater = rows => rows.map(r => r._id === _id ? { ...r, _pid: rowPid, '실행번호': selected.execNo } : r);
                if (dataSource === 'pending') setPendingData(p => ({ ...p, rows: updater(p.rows) }));
                if (dataSource === 'local')   setLocalData(p => ({ ...p, rows: updater(p.rows) }));
            }
            setExecNoModal(null);
        } catch (e) {
            setAlertMsg('연결 저장 오류: ' + e.message);
        }
    };

    // ── 행 저장 (관리 열 저장 버튼) ──────────────────────────────────────
    const saveRow = async (row) => {
        if (!row) return;
        const { _id, ...data } = row;
        if (dataSource !== 'firebase') {
            const updater = rows => rows.map(r => r._id === _id ? { ...row } : r);
            if (dataSource === 'pending') setPendingData(p => ({ ...p, rows: updater(p.rows) }));
            if (dataSource === 'local')   setLocalData(p =>   ({ ...p, rows: updater(p.rows) }));
            return;
        }
        try { await setDoc(rowDocRef(currentTeam, _id), stampSave(data)); }
        catch (err) { setAlertMsg(`저장 오류: ${err.message}`); }
    };

    // ── 전체 행 저장 (메타 포함) ──────────────────────────────────────────
    const saveAllRows = async () => {
        if (!activeRows.length) return;
        // ★ 관리자 전용 (2026-07-14): 내 화면의 모든 행을 한꺼번에 덮어씀 → 다른 사람의 최신 수정을 밀어낼 수 있음
        //    (로컬/임시 저장은 내 PC에만 쓰므로 제한 없음)
        if (dataSource === 'firebase' && !isAdmin) {
            setAlertMsg('관리자만 실행할 수 있습니다.\n\n[전체 저장]은 화면의 모든 행을 한꺼번에\n덮어쓰기 때문에 다른 사람의 수정이 밀릴 수 있습니다.\n\n개별 수정은 셀·상세 팝업에서 바로 저장됩니다.'); return;
        }
        setIsLoading(true);
        try {
            if (dataSource !== 'firebase') {
                // 로컬/pending: IndexedDB에 저장
                await idbSave(currentTeam, activeHeaders, activeColGroups, activeRows);
                if (dataSource === 'pending') setPendingData(p => ({ ...p }));
                setAlertMsg(`${activeRows.length}행 로컬 저장 완료`);
            } else {
                // Firebase: 메타 + 행 데이터 배치 저장
                await setDoc(metaDocRef(currentTeam), {
                    headers: activeHeaders, colGroups: activeColGroups,
                    byYear: fbByYear || {}, colMids: pendingData?.colMids || fbColMids || {},   // ★연도별 헤더 벌 보존 (2026-08-24)
                    updatedAt: new Date().toISOString()
                });
                let batch = writeBatch(db), cnt = 0;
                for (const row of activeRows) {
                    const { _id, ...data } = row;
                    batch.set(rowDocRef(currentTeam, _id), data);
                    if (++cnt >= 400) { await batch.commit(); batch = writeBatch(db); cnt = 0; }
                }
                if (cnt > 0) await batch.commit();
                setAlertMsg(`전체 ${activeRows.length}행 저장 완료`);
            }
        } catch (err) { setAlertMsg(`저장 오류: ${err.message}`); }
        setIsLoading(false);
    };

    // ── 저장 전 confirm 다이얼로그 표시 ──────────────────────────────────
    const confirmSaveAll = () => {
        const target = dataSource === 'firebase' ? 'Firebase' : dataSource === 'local' ? '로컬' : '임시';
        setConfirmDialog({
            message: `전체 ${activeRows.length}행을 ${target}에 저장하시겠습니까?`,
            onConfirm: saveAllRows
        });
    };

    const confirmSaveRow = (row) => {
        setConfirmDialog({
            message: `이 행을 저장하시겠습니까?\n${row['번호'] ? '번호: ' + row['번호'] : ''} ${row['Project'] || row['프로젝트'] || ''}`.trim(),
            onConfirm: () => saveRow(row)
        });
    };

    // ── 프로젝트 번호 = 수동 키인 · 중복 차단 (2026-09-01 팀장님 — 구 2026-08-25 자동+1 폐지) ──────────
    //   자동+1 폐지 이유: 삭제된 번호(예: 50)를 다른 이름으로 재사용할지는 담당자가 판단 — 번호는 절대 안 밀림(재정렬 없음).
    //   번호 열 = '번호'(기술2·3팀) 또는 '순번'(기술1팀). 중복 판정 정규화 = 001=01=1(숫자는 앞 0 제거) 전부 같은 번호.
    const projNoColOf = () => (activeHeaders || []).find(h => ['번호', '순번'].includes(String(h).replace(/\s/g, '')));
    const _cyStr = () => String(new Date().getFullYear());
    const projNoNorm = (v) => { const t = String(v ?? '').trim(); return /^\d+$/.test(t) ? String(Number(t)) : t.replace(/\s+/g, '').toUpperCase(); };
    const projNoDupOf = (val, year, exceptId) => {
        const c = projNoColOf(); const key = projNoNorm(val);
        if (!c || key === '') return null;
        return activeRowsRef.current.find(r => r._id !== exceptId && !isSubListRow(r)
            && String(r._year || _cyStr()) === String(year)
            && projNoNorm(r[c]) === key) || null;
    };
    const projNoDupMsg = (v, dup) => `⛔ 프로젝트 번호 중복 — 저장할 수 없습니다!\n\n'${String(v ?? '').trim()}'번은 이미 등록돼 있습니다 (001=01=1 같은 번호 취급):\n→ ${String((projectNameCol && dup[projectNameCol]) || '').trim() || '(이름 없음)'}\n\n다른 번호로 키인해 주세요.`;

    // ── 새 행 추가 ────────────────────────────────────────────────────────
    const addCopiedRef = useRef(false);   // 추가 팝업이 '행 복사'로 열렸는지 — 팝업 상단 안내 표시용 (2026-08-31)
    const handleOpenAddRow = (baseOverride) => {   // baseOverride = 우클릭 [이 행 복사해서 추가] (2026-08-31 팀장님). 버튼 onClick이 주는 이벤트 객체는 _id가 없어 무시됨
        if (!activeHeaders.length) {
            setAlertMsg('먼저 엑셀 파일을 업로드하거나 데이터를 불러오세요.');
            return;
        }
        const newId = `row_manual_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
        const newPid = generatePid(); // A-4a: 고유 ID 자동 발급
        const newYear = selectedYear || String(new Date().getFullYear());
        // 선택된 행이 있으면 해당 데이터를 초기값으로 복사
        const baseRow = (baseOverride && baseOverride._id) ? baseOverride
            : selectedRowId ? activeRows.find(r => r._id === selectedRowId)
            : null;
        addCopiedRef.current = !!baseRow;
        // 등록일(_regDate) — 프로젝트 추가 시점 자동 기입. 내부 필드·읽기전용·불변 (2026-07-13)
        const _d = new Date();
        const regDate = `${_d.getFullYear()}-${String(_d.getMonth()+1).padStart(2,'0')}-${String(_d.getDate()).padStart(2,'0')}`;
        const newRow = { _id: newId, _pid: newPid, _year: newYear, _regDate: regDate };
        activeHeaders.forEach(h => { newRow[h] = baseRow ? (baseRow[h] || '') : ''; });   // 엑셀 항목만 복사(_ 내부필드는 복사 안 됨)
        // ★ 번호 = 수동 키인 (2026-09-01 팀장님, 구 자동+1 폐지): 빈칸으로 열고 추가하는 사람이 직접 키인 — 복사 추가여도 비움(원본 번호 따라오면 중복)
        const _autoNoC = projNoColOf();
        if (_autoNoC) newRow[_autoNoC] = '';
        // 수행번호는 복사하지 않음 (2026-08-28): 선택 행의 번호가 그대로 따라오면 중복 — 빈칸으로 두고 저장 후 메인표 [+]로 받는다
        activeHeaders.forEach(h => { if (isExecAssignRowCol(newRow, h)) newRow[h] = ''; });
        setAddingRow(newRow);
    };

    // ── 하위(공종) 추가 (2026-07-16) ─────────────────────────────────────────────
    //   큰 프로젝트 밑에 공조·CDA 같은 공종 행을 만든다 (월간보고의 '하위'와 같은 개념).
    //   · _id = 부모 _id + '_sub##' → _id 문자순 정렬에서 항상 부모 바로 아래·다음 메인 앞에 위치
    //   · 실행번호 's' = 하위 표식 (월간보고·진행실적 팝업·모바일 공통 규칙 — 지우면 하위 해제)
    //   · 저장은 기존 '프로젝트 추가' 팝업(DetailModal)·saveAddingRow 그대로 재사용
    const handleAddSubRow = (parentRow) => {
        if (!parentRow || isSubListRow(parentRow)) return;
        if (!activeHeaders.length) { setAlertMsg('먼저 엑셀 파일을 업로드하거나 데이터를 불러오세요.'); return; }
        let maxSeq = 0;                                    // 다음 하위 번호 = 기존 _sub## 최대값 + 1 (중간 삭제 후 재추가에도 안전)
        activeRows.forEach(r => {
            if (String(r._id).startsWith(`${parentRow._id}_sub`)) {
                const m = String(r._id).match(/_sub(\d+)$/);
                if (m) maxSeq = Math.max(maxSeq, Number(m[1]));
            }
        });
        const newId = `${parentRow._id}_sub${String(maxSeq + 1).padStart(2, '0')}`;
        const _d = new Date();
        const regDate = `${_d.getFullYear()}-${String(_d.getMonth() + 1).padStart(2, '0')}-${String(_d.getDate()).padStart(2, '0')}`;
        const newRow = { _id: newId, _pid: generatePid(), _year: parentRow._year || selectedYear || String(new Date().getFullYear()), _regDate: regDate, _subParent: parentRow._pid || '' };
        activeHeaders.forEach(h => { newRow[h] = ''; });
        activeHeaders.forEach(h => {                       // 부모에게 물려받는 값 — 현장(공장동)·발주처·담당자
            const hn = String(h).replace(/\s+/g, '');
            if (hn.includes('공장') || hn === '발주처' || isAssigneeCol(h) || isManagerCol(h)) newRow[h] = parentRow[h] || '';
        });
        newRow['실행번호'] = 's';                           // 하위 표식
        const stCol = activeHeaders.find(h => isStatusCol(h));
        if (stCol) newRow[stCol] = 'sub';                  // 진행현황 칩 '하위'(보라)
        if (projectNameCol) newRow[projectNameCol] = '- ';  // 이름 앞 '-'는 월간보고 하위 표기 관례
        setAddingRow(newRow);
    };

    // ── 공사 계약/완료 날짜 짝 검사 (2026-07-14 팀장님 규칙) ──────────────────────
    //   · 계약 O / 완료 X → 저장 불가 (완료일을 반드시 같이)
    //   · 계약 X / 완료 O → 저장 불가 (완료일만 넣기 금지)
    //   · 둘 다 X        → 저장 OK (기존 동작 유지 — 아직 계약 전인 건들)
    //   ※ 지금은 '프로젝트 추가'에만 적용. 상세/수정 팝업은 기존 152건 중 완료일이 빈 행이 많아
    //     그대로 걸면 수정 자체가 막힘 → 데이터 정리 후 함께 적용 예정. [[contract-date-pair-rule]]
    //   ※ 계약일 > 완료일(순서 뒤바뀜) 검사도 데이터 정리 때 함께 결정 예정.
    // 날짜짝 열 찾기 — 팀 카드 '열.날짜짝' [시작열, 끝열] (2026-08-11 2단계: 기술2팀 = 공사 계약/공사 완료)
    const datePairCols = useMemo(() => {
        const pair = teamProfile?.열?.날짜짝;
        if (!Array.isArray(pair) || pair.length !== 2) return [undefined, undefined];
        return pair.map(nm => {
            const key = String(nm).replace(/\s/g, '');
            return activeHeaders.find(h => String(h).replace(/\s/g, '').includes(key));
        });
    }, [activeHeaders, teamProfile]);
    const checkContractDates = (rowObj) => {
        const [cCol, dCol] = datePairCols;                     // 팀 카드 '열.날짜짝' (2026-08-11 2단계)
        if (!cCol || !dCol) return null;                       // 해당 열이 없는 팀/양식이면 검사 안 함
        const [cName, dName] = teamProfile.열.날짜짝;           // 안내문도 팀 열 이름으로 (기술2팀 = 기존 문구 그대로)
        const c = String(rowObj?.[cCol] ?? '').trim();
        const d = String(rowObj?.[dCol] ?? '').trim();
        if (c && !d) return `[${dName}] 일자를 입력해 주세요.\n\n${cName} 일자를 넣으면 ${dName} 일자도 함께 넣어야 합니다.\n(둘 다 비워두는 것은 가능합니다)`;
        if (!c && d) return `[${cName}] 일자를 입력해 주세요.\n\n${dName} 일자만 넣을 수는 없습니다.\n(둘 다 비워두는 것은 가능합니다)`;
        return null;                                           // 둘 다 있음 / 둘 다 없음 → 통과
    };

    // 하위(_sub##) 행은 부모 바로 아래에 끼워 넣기 — 클라우드는 _id 정렬이 자동 처리, 미확정(pending/local)만 수동 (2026-07-16)
    const insertRowInOrder = (rows, r) => {
        const m = String(r._id).match(/^(.*)_sub\d+$/);
        if (!m) return [...rows, r];
        let at = rows.findIndex(x => x._id === m[1]);
        if (at < 0) return [...rows, r];
        while (at + 1 < rows.length && String(rows[at + 1]._id).startsWith(`${m[1]}_sub`)) at++;
        return [...rows.slice(0, at + 1), r, ...rows.slice(at + 1)];
    };
    const saveAddingRow = async () => {
        if (!addingRow) return;
        // 번호 3자리 통일 (2026-07-20 팀장님): 웹에서 추가할 때도 1→001 — '순번'(기술1팀) 포함 (2026-09-01)
        const _padC0 = projNoColOf();
        const rowToAdd = _padC0 && addingRow[_padC0] !== undefined ? { ...addingRow, [_padC0]: padProjectNo(String(addingRow[_padC0] ?? '').trim()) } : addingRow;
        // ★ 프로젝트 번호 = 수동 키인·중복 차단 (2026-09-01 팀장님, 001=01=1 동일 취급) — 하위(s) 추가는 번호 없음·제외
        {
            const _noC = projNoColOf();
            const _isSubAdd = String(rowToAdd['실행번호'] ?? '').trim().toLowerCase() === 's';
            if (_noC && !_isSubAdd) {
                const _no = String(rowToAdd[_noC] ?? '').trim();
                if (_no === '') { setAlertMsg('⛔ 프로젝트 번호가 비어 있습니다.\n\n번호는 자동으로 채워지지 않습니다 — 직접 키인해 주세요.\n(삭제된 번호를 다시 쓸지, 새 번호로 할지는 담당자가 정합니다)'); return; }
                const dup = projNoDupOf(_no, String(rowToAdd._year || _cyStr()), rowToAdd._id);
                if (dup) { setAlertMsg(projNoDupMsg(_no, dup)); return; }
            }
        }
        // ★ 공사 계약/완료는 짝으로만 (2026-07-14)
        const dateErr = checkContractDates(rowToAdd);
        if (dateErr) { setAlertMsg(dateErr); return; }
        if (dataSource !== 'firebase') {
            if (dataSource === 'pending') setPendingData(p => ({ ...p, rows: insertRowInOrder(p.rows, rowToAdd) }));
            else if (dataSource === 'local') setLocalData(p => ({ ...p, rows: insertRowInOrder(p.rows, rowToAdd) }));
            else { setLocalData({ headers: activeHeaders, colGroups: activeColGroups, rows: [rowToAdd], savedAt: new Date().toISOString() }); }
            setAddingRow(null); return;
        }
        const { _id, ...data } = rowToAdd;
        try { await setDoc(rowDocRef(currentTeam, _id), stampSave(data)); recordAudit(AUDIT_ACTIONS.ADD, rowToAdd, []); setAddingRow(null); }
        catch (err) { setAlertMsg(`저장 오류: ${err.message}`); }
    };

    // ★ 그래프 → 진행실적 복귀 (2026-07-14): App.js 그래프 모달의 '진행실적 등록' 버튼이 pid를 내려주면 그 행의 팝업을 연다.
    useEffect(() => {
        if (!openProgressPid) return;
        const row = activeRows.find(r => String(r._pid || '') === String(openProgressPid));
        if (row) setProgressRow(progressRowFor(row));
        else setAlertMsg('이 화면(기준연도/필터)에서 해당 프로젝트를 찾지 못했습니다.');
        onProgressOpened?.();   // 소비 완료 — 같은 pid를 다시 눌러도 열리도록 초기화
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [openProgressPid]);

    // ★ 실적 그래프 열기 (2026-07-14): 우클릭 메뉴와 '진행실적 등록' 팝업에서 함께 쓴다.
    //    pid 기준. 연결된 월간보고가 있으면 그 월별데이터까지, 없으면 List 행 + 진행실적으로 그린다.
    const openGraphForRow = (row) => {
        if (!row) return;
        const pid = row._pid;
        const nm = row['Project'] || row['프로젝트명'] || row['공사명'] || row['프로젝트'] || '프로젝트';
        if (!pid) { setAlertMsg('이 프로젝트는 내부 ID가 없어 그래프를 열 수 없습니다. (상세/수정에서 한 번 저장하면 발급됩니다)'); return; }
        const linked = allProjects ? allProjects.find(p => p.pid === pid) : null;
        // 그래프 기간 = List '공사 계약'(시작) ~ '공사 완료'(끝). 없으면 월간보고 값으로 폴백 (2026-07-13 규칙)
        const [_contractCol, _doneCol] = datePairCols;   // 팀 카드 '열.날짜짝' (2026-08-11 2단계)
        const _sd = _contractCol ? toDateInputVal(row[_contractCol]) : '';
        const _ed = _doneCol     ? toDateInputVal(row[_doneCol])     : '';
        const _spTot = effTotalPt(row);   // 2단계(2026-07-20): 하위 합계 자동 총점 (합 0이면 부모 총점)
        const graphObj = {
            ...(linked || {}),
            pid,
            _year: row._year || '',   // 수식 팀(연도 게이트) 판정용 — 없으면 그래프 쪽 수식 분기가 안 탐 (2026-08-20 미반영 원인)
            progressItems: naToProgressItems(row) || (linked ? linked.progressItems : undefined),   // 프로젝트별 미적용 → 그래프 공정률서 제외 (2026-07-21)
            execNo: row[EXEC_NO_COL] || linked?.execNo,
            project: nm,
            totalCommissioningPoints: _spTot || linked?.totalCommissioningPoints || linked?.point || 0,
            point: _spTot || linked?.point || 0,
            monthlyData: linked?.monthlyData || [],
            startDate: _sd || linked?.startDate || '',
            endDate:   _ed || linked?.endDate   || '',
        };
        if (onShowGraph) onShowGraph(graphObj);
    };

    const deleteRow = async id => {
        // 전 직원 허용 (2026-09-01 팀장님: 담당자가 직접 추가·삭제 — 구 2026-07-14 관리자 전용 해제. 확인창+백로그 기록은 그대로)
        if (dataSource !== 'firebase') {
            const updater = rows => rows.filter(r => r._id !== id);
            if (dataSource === 'pending') setPendingData(p => ({ ...p, rows: updater(p.rows) }));
            if (dataSource === 'local')   setLocalData(p => ({ ...p, rows: updater(p.rows) }));
            return;
        }
        const delRow = fbRows.find(r => r._id === id);   // 삭제 전 정보 확보(백로그용)
        try {
            await deleteDoc(rowDocRef(currentTeam, id));
            recordAudit(AUDIT_ACTIONS.DELETE, delRow || { _id: id }, []);   // 백로그: 프로젝트 삭제
        }
        catch (err) { setAlertMsg(`삭제 오류: ${err.message}`); }
    };

    const clearAll = async () => {
        // ★ 관리자 전용 (2026-07-14): 팀의 모든 프로젝트가 통째로 삭제됨
        if (!isAdmin) { setConfirmClearOpen(false); setAlertMsg('전체 데이터 삭제는 관리자만 할 수 있습니다.'); return; }
        setIsLoading(true); setConfirmClearOpen(false);
        try {
            // ★ 삭제 직전 자동 백업 + 백로그 기록 (2026-09-04 팀장님 — 9/1 과거 연도 소실 사고: 이 버튼이 흔적·백업 없이 전 연도를 지워 추적·복구가 어려웠음)
            try {
                await loadFileSaver();
                const _bs = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '_');
                window.saveAs(new Blob([JSON.stringify({ team: currentTeam, savedAt: new Date().toISOString(), headers: activeHeaders, colGroups: activeColGroups, rows: fbRows }, null, 1)], { type: 'application/json' }), `PMS전체삭제직전백업_${currentTeam}_${_bs}.json`);
            } catch (e2) {}
            // 연도 선택식 (2026-09-04 팀장님): 'ALL'=전 연도+헤더 초기화 / 특정 연도=그 해 행만(헤더·다른 연도 무접촉)
            const _yr = clearYearSel;
            const _targets = _yr === 'ALL' ? fbRows : fbRows.filter(r => String(r._year || '') === _yr);
            const _delN = _targets.length;
            let batch = writeBatch(db), cnt = 0;
            for (const r of _targets) {
                batch.delete(rowDocRef(currentTeam, r._id));
                if (++cnt >= 400) { await batch.commit(); batch = writeBatch(db); cnt = 0; }
            }
            if (cnt > 0) await batch.commit();
            if (_yr === 'ALL') {
                await setDoc(metaDocRef(currentTeam), { headers: [], colGroups: [], colMids: {}, updatedAt: new Date().toISOString() });
                setPendingData(null);
                setLocalData(null);
                await idbDelete(currentTeam);
            }
            const _scope = _yr === 'ALL' ? '전 연도' : `${_yr}년`;
            logAudit(currentTeam, { who: user?.email || '', action: AUDIT_ACTIONS.DELETE, projectName: '(데이터 삭제)',
                note: `데이터 삭제: ${_scope} ${_delN}건${_yr === 'ALL' ? ' + 헤더 초기화' : ' (다른 연도·헤더 무접촉)'}` });
            addLog(`[데이터 삭제] ${_scope} ${_delN}건`);
            setAlertMsg(`삭제 완료 — ${_scope} ${_delN}건
(삭제 직전 백업 JSON이 다운로드되었습니다)`);
        } catch (err) { setAlertMsg(`초기화 오류: ${err.message}`); }
        finally { setIsLoading(false); }
    };

    // ── 엑셀 다운로드 ────────────────────────────────────────────────────
    const handleDownload = async () => {
        if (!activeHeaders.length) { setAlertMsg('다운로드할 데이터가 없습니다.'); return; }
        setIsLoading(true);
        try {
            const ExcelJS = await loadExcelJS(); await loadFileSaver();
            const wb = new ExcelJS.Workbook();
            const ws = wb.addWorksheet(`${currentTeam} 프로젝트List`);
            const visH = activeHeaders.filter(h => !hiddenCols.has(h));
            ws.columns = visH.map(h => ({ header: dispHeader(h), key: h, width: Math.max(12, getW(h)/7.5) }));   // 엑셀 헤더도 (2) 없이 원본 이름 (2026-08-19)
            ws.getRow(1).eachCell(cell => {
                cell.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FF0F172A'} };
                cell.font = { color:{argb:'FFFFFFFF'}, bold:true, name:'맑은 고딕' };
                cell.alignment = { vertical:'middle', horizontal:'center' };
                cell.border = { top:{style:'thin',color:{argb:'FF334155'}}, bottom:{style:'thin',color:{argb:'FF334155'}}, left:{style:'thin',color:{argb:'FF334155'}}, right:{style:'thin',color:{argb:'FF334155'}} };
            });
            sortedRows.forEach(row => {
                const rec = Object.fromEntries(visH.map(h => [h, row[h]||'']));
                // 2단계(2026-07-20): 하위 합계 자동 총점을 엑셀에도 동일 반영 (화면=엑셀 일치)
                const _ptH = visH.find(isPointCol);
                if (_ptH) { const _sp = getSubPt(row._id); if (_sp && _sp.sum > 0) rec[_ptH] = _sp.sum; }
                const exRow = ws.addRow(rec);
                exRow.eachCell(cell => {
                    cell.border = { top:{style:'thin',color:{argb:'FFCBD5E1'}}, bottom:{style:'thin',color:{argb:'FFCBD5E1'}}, left:{style:'thin',color:{argb:'FFCBD5E1'}}, right:{style:'thin',color:{argb:'FFCBD5E1'}} };
                    cell.font = { name:'맑은 고딕' }; cell.alignment = { vertical:'middle' };
                });
            });
            const buf = await wb.xlsx.writeBuffer();
            window.saveAs(new Blob([buf], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
                `ProjectList_${currentTeam}_${new Date().toISOString().slice(0,10).replace(/-/g,'')}.xlsx`);
        } catch (err) { setAlertMsg(`다운로드 오류: ${err.message}`); }
        finally { setIsLoading(false); }
    };

    // ── 연도 목록 (행의 _year 필드 기준) ────────────────────────────────
    const availableYears = useMemo(() => {
        const ys = [...new Set(activeRows.map(r => r._year).filter(Boolean))].sort((a, b) => b.localeCompare(a));
        // _year 없으면 연도 구분 없이 단일 "전체"로 처리
        return ys;
    }, [activeRows]);

    // 선택 연도의 행만
    const yearFilteredRows = useMemo(() => {
        if (!availableYears.length) return activeRows; // 연도 정보 없음 → 전체
        return activeRows.filter(r => !r._year || r._year === selectedYear);
    }, [activeRows, availableYears, selectedYear]);

    // ── 기준월 필터 (2026-07-13) — 기준 날짜 열 = 팀 카드 '열.기준월기준' (2026-08-11 2단계 연결)
    //    기술2팀 = '공사 계약' 그대로 · 카드 값이 null(기술1팀 미정)이면 기준월 필터 비활성(전체 취급)
    const contractDateCol = useMemo(() => {
        const base = teamProfile?.열?.기준월기준;
        if (!base) return undefined;
        const key = String(base).replace(/\s/g, '');
        return activeHeaders.find(h => String(h).replace(/\s/g, '').includes(key));
    }, [activeHeaders, teamProfile]);

    // '기준연도 + 완전한 날짜(년·월·일 전부)'만 그 달로 인정 (2026-07-13 팀장님: 연도까지 따짐).
    //   → 기타 = 기준연도의 어느 달에도 못 들어가는 나머지 전부
    //     (빈칸 · '2022년' · '2025-10' 같은 불완전 날짜 + 기준연도와 다른 해의 날짜)
    //   덕분에 1~12월 건수 + 기타 건수 = 전체 건수 로 딱 맞음(빠지는 행 없음).
    const contractMonthOf = (row) => {
        if (!contractDateCol) return null;
        const std = toDateInputVal(row[contractDateCol]);           // 'YYYY-MM-DD' 또는 ''
        if (!/^\d{4}-\d{2}-\d{2}$/.test(std)) return null;         // 불완전 날짜 → 기타
        if (selectedYear && std.slice(0, 4) !== String(selectedYear)) return null;  // 다른 해 → 기타
        return std.slice(5, 7);                                     // 'MM'
    };

    const MONTHS = ['01','02','03','04','05','06','07','08','09','10','11','12'];

    // 드롭다운에 보여줄 월별 건수 (기준연도 안에서)
    const monthCountMap = useMemo(() => {
        const m = { etc: 0 };
        yearFilteredRows.forEach(r => {
            if (isSubListRow(r)) return;   // 하위는 부모를 따라가므로 건수는 메인만 (2026-07-16)
            const mm = contractMonthOf(r);
            if (mm) m[mm] = (m[mm] || 0) + 1; else m.etc += 1;
        });
        return m;
    }, [yearFilteredRows, contractDateCol, selectedYear]); // eslint-disable-line

    const monthFilteredRows = useMemo(() => {
        if (selectedMonth === 'all' || !contractDateCol) return yearFilteredRows;
        if (selectedMonth === 'etc') return yearFilteredRows.filter(r => !contractMonthOf(r));
        return yearFilteredRows.filter(r => contractMonthOf(r) === selectedMonth);
    }, [yearFilteredRows, selectedMonth, contractDateCol, selectedYear]); // eslint-disable-line

    // ── 진행현황 칩 필터 ─────────────────────────────────────────────────
    //   기준열 = 팀 카드 '상태.칩기준열'(공백무시 정확일치 — '계약'이 '공사 계약'에 안 걸리게) 우선,
    //   카드 미지정(기술2팀 null)이면 현행 키워드 자동 그대로 (2026-08-11)
    const statusFilterCol = useMemo(() => {
        const base = teamProfile?.상태?.칩기준열;
        if (base) {
            const hit = aliasCol(base);   // 연도별 별칭 — 옛 연도 '견적'→계약, '수행 담당'→수행 (2026-08-21)
            if (hit) return hit;
        }
        return activeHeaders.find(h => ['진행현황', '현황', '진행'].some(k => h.includes(k)));
    }, [activeHeaders, teamProfile, selectedYear]);   // eslint-disable-line react-hooks/exhaustive-deps

    const statusChipData = useMemo(() => {
        if (!statusFilterCol) return [];
        const countMap = {};
        let blankCnt = 0;
        monthFilteredRows.forEach(r => {
            if (isSubListRow(r)) return;   // 하위 제외 — 'sub' 칩 생기지 않게 (2026-07-16)
            let v = String(r[statusFilterCol] || '').trim();
            if (v.toUpperCase() === 'HOLD') v = 'Hold';
            if (v) countMap[v] = (countMap[v] || 0) + 1;
            else blankCnt += 1;
        });
        // 상태 빈칸도 '(빈칸)' 칩으로 — 칩 합 = 전체 행 수와 일치, 혼선 방지 (2026-08-24 팀장님)
        //   팀 카드 상태.빈칸칩=true(기술1팀) = 전 연도 표시 / 그 외(기술2·3팀) = 지난 연도만(당해 제외)
        const _yNum = Number(String(selectedYear || '').replace(/[^0-9]/g, ''));
        if (blankCnt > 0 && (teamProfile?.상태?.빈칸칩 === true || (_yNum && _yNum < new Date().getFullYear()))) countMap['(빈칸)'] = blankCnt;
        return Object.entries(countMap).sort((a, b) => {
            if (a[0] === '(빈칸)') return 1;                    // 빈칸 칩은 항상 맨 뒤
            if (b[0] === '(빈칸)') return -1;
            const ai = STATUS_OPTIONS.indexOf(a[0]);
            const bi = STATUS_OPTIONS.indexOf(b[0]);
            if (ai === -1 && bi === -1) return b[1] - a[1];
            if (ai === -1) return 1;
            if (bi === -1) return -1;
            return ai - bi;
        });
    }, [monthFilteredRows, statusFilterCol, selectedYear]);   // eslint-disable-line react-hooks/exhaustive-deps

    // ── D안 KPI 요약 카드 (2026-08-11 팀장님 승인) — 표시 전용 파생 계산, 저장·엑셀 무접촉 ──
    //   기준 = 칩 필터와 같은 monthFilteredRows(기준연도·월 반영) · 하위/삭제 행 제외.
    //   공정률 = 그래프 공정률과 같은 PLC·ETOS·HMI·통합시운전 평균(열 없는 팀은 '공정률/진척률' 열 폴백).
    //   포인트 = Σ누적 ÷ Σ총점(effTotalPt — 하위합 자동 규칙 그대로). 해당 열 없으면 카드 자동 숨김.
    const kpiData = useMemo(() => {
        const norm = (h) => String(h).replace(/\s/g, '');
        const mains = monthFilteredRows.filter(r => !isSubListRow(r) && String(statusFilterCol ? (r[statusFilterCol] || '') : '').trim() !== '삭제');
        const subCnt = monthFilteredRows.filter(r => isSubListRow(r)).length;
        const progCnt = statusFilterCol ? mains.filter(r => String(r[statusFilterCol] || '').trim() === '진행중').length : 0;
        const _intNmK = norm(teamProfile?.시운전?.통합열 || '통합시운전');   // 팀별 통합 열 (2026-08-24: 기술2팀 '진행율 %' · 기술3팀 '통합시운전')
        const pctCols0 = activeHeaders.filter(h => ['PLC', 'ETOS', 'HMI', _intNmK].includes(norm(h)));
        let useCols = pctCols0.length ? pctCols0 : activeHeaders.filter(h => norm(h).includes('공정률') || norm(h).includes('진척률'));
        // 수식 팀 (2026-08-20 팀장님): 공정률 = '전체' 열 평균 — 홈 팀 카드(teamStats)와 같은 규칙 (ETOS T/S·자체 누락 왜곡 방지)
        if (fmCfg && (!Array.isArray(fmCfg.연도) || fmCfg.연도.includes(String(selectedYear || '')))) {
            const allCol = activeHeaders.find(h => fmNorm(h) === '전체');
            if (allCol) useCols = [allCol];
        }
        let pctSum = 0, pctN = 0;
        mains.forEach(r => {
            const vals = useCols.map(c => parseFloat(String(r[c] ?? '').replace(/%/g, ''))).filter(Number.isFinite);
            if (vals.length) { pctSum += vals.reduce((a, b) => a + b, 0) / vals.length; pctN += 1; }
        });
        const accCol = activeHeaders.find(h => norm(h) === '누적')
            || (teamProfile?.시운전?.누적열 ? activeHeaders.find(h => norm(h) === norm(teamProfile.시운전.누적열)) : null);   // 팀 카드 누적열 (2026-08-24: 기술2팀 'Point')
        let accSum = 0, totSum = 0;
        mains.forEach(r => {
            totSum += effTotalPt(r);
            if (accCol) { const v = Number(String(r[accCol] ?? '').replace(/,/g, '')); if (Number.isFinite(v)) accSum += v; }
        });
        accSum = Math.round(accSum); totSum = Math.round(totSum);
        // 이번 달 완료 (2026-08-31 미니 요약 ▲배지): 공사 완료 날짜가 실제 이번 달인 메인 행 수
        let doneThisMonth = 0;
        {
            const doneCol = (datePairCols && datePairCols[1]) || null;
            if (doneCol) {
                const now = new Date(); const ym = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
                mains.forEach(r => { const d = toDateInputVal(r[doneCol]); if (d && String(d).slice(0, 7) === ym) doneThisMonth++; });
            }
        }
        return {
            total: mains.length, subCnt, progCnt, doneThisMonth,
            avgPct: pctN ? Math.round(pctSum / pctN * 10) / 10 : null, pctN,
            ptPct: (accCol && totSum > 0) ? Math.round(accSum / totSum * 100) : null, accSum, totSum,
            // '—' 카드 사유 구분용 (2026-08-11): 항목 자체가 없음 vs 열은 있는데 아직 값 없음
            pctColCnt: useCols.length, hasAccCol: !!accCol,
            // ── 당해(현재 연도) 카드 (2026-08-21 팀장님, 기술1팀): 전체=순번 있는 행 수 · 항목 = 작업 칸 값 건수 ──
            ...(() => {
                const cc = teamProfile?.당해카드;
                if (!cc) return {};
                const colOf = (nm) => aliasCol(nm);   // 연도별 별칭 (2026-08-21)
                const noCol = colOf(cc.건수기준열 || '순번'), stCol = colOf(cc.상태열);
                const ccRows = monthFilteredRows.filter(r => !isSubListRow(r));
                const ccItems = (cc.항목 || []).map(it => {
                    const vals = [].concat(it.값).map(v => String(v).trim());
                    return { 라벨: it.라벨, cnt: stCol ? ccRows.filter(r => vals.includes(String(r[stCol] || '').trim())).length : null };
                });
                // 전체 산정 (2026-08-24 팀장님 확정): '항목합' 팀(기술2·3팀) = 진행중·추진중·완료만 합산, 그 외(삭제·2018이전 등) 미포함. 기술1팀은 종전(순번 기준) 유지.
                const ccTotal = cc.전체 === '항목합'
                    ? ccItems.reduce((s, it) => s + (it.cnt || 0), 0)
                    : (noCol ? ccRows.filter(r => String(r[noCol] ?? '').trim() !== '').length : ccRows.length);
                const nm2 = (h) => String(h).replace(/\s*\(\d+\)\s*$/, '');   // dispHeader는 아래에서 정의돼(TDZ) 여기선 직접
                return { ccOn: true, ccTotal, ccItems,
                    ccBasis: cc.전체 === '항목합' ? (cc.항목 || []).map(it => it.라벨).join('·') + ' 합' : (noCol ? `${nm2(noCol)} 기준` : '행 수 기준'),
                    ccStName: stCol ? nm2(stCol) : '' };
            })(),
            // ── 보고 카드 (2026-08-19 팀장님, 기술1팀 — 연도별 임원 보고 양식) ──
            ...(() => {
                const rc = teamProfile?.보고카드;
                if (!rc) return {};
                const colOf = (nm) => aliasCol(nm);   // 연도별 별칭 (2026-08-21)
                const stCol = colOf(rc.상태열), wkCol = colOf(rc.작업열), ptCol = colOf(rc.포인트열), acCol = colOf(rc.누적열);
                const byStatus = {};
                if (stCol) mains.forEach(r => { const v = String(r[stCol] || '').trim() || '미기재'; byStatus[v] = (byStatus[v] || 0) + 1; });   // 빈칸도 '미기재'로 정직하게 (2026-08-20)
                const rcDone = wkCol ? mains.filter(r => String(r[wkCol] || '').trim() === rc.완료값).length : 0;
                // 작업 칸 실제 값 분포 (2026-08-20 팀장님): '진행중=전체−완료' 빼기 표기가 취소·빈칸까지 진행중으로 둔갑시켰음 → 실제 분포로 표시
                const byWork = {};
                if (wkCol) mains.forEach(r => { const v = String(r[wkCol] || '').trim() || '미기재'; byWork[v] = (byWork[v] || 0) + 1; });
                let rcPtSum = 0, rcAccSum = 0, rcPtN = 0;
                mains.forEach(r => {
                    if (ptCol) { const v = Number(String(r[ptCol] ?? '').replace(/,/g, '')); if (Number.isFinite(v) && v) { rcPtSum += v; rcPtN++; } }
                    if (acCol) { const v = Number(String(r[acCol] ?? '').replace(/,/g, '')); if (Number.isFinite(v)) rcAccSum += v; }
                });
                return { rcOn: true, rcTitle2: rc.카드2제목 || '계약 현황',
                    rcByStatus: Object.entries(byStatus).sort((a, b) => b[1] - a[1]),
                    rcByWork: Object.entries(byWork).sort((a, b) => (a[0] === rc.완료값 ? -1 : b[0] === rc.완료값 ? 1 : b[1] - a[1])),
                    rcDone, rcRate: mains.length ? Math.round(rcDone / mains.length * 100) : null,   // 달성율 = 완료 ÷ 전체 (2026-08-19 팀장님 확정)
                    rcPtSum: Math.round(rcPtSum), rcAccSum: Math.round(rcAccSum), rcPtN };
            })(),
        };
    }, [datePairCols, monthFilteredRows, activeHeaders, statusFilterCol, selectedYear]);   // eslint-disable-line react-hooks/exhaustive-deps

    // '이름, 이름' 다중 담당자 지원 (2026-07-28 팀장님) — 쉼표 형식 + 옛 형식 모두 사람별로 나눠 취급
    const splitAssignees = (v) => splitAssigneeCell(v);
    const assigneeKeys = (v) => {   // 같은 사람 중복 표기('김종석 책임'+'김종석C')는 1명으로
        const seen = new Set(); const out = [];
        splitAssignees(v).forEach(p => { const k = extractName(normalizeAssignee(p)); if (k && !seen.has(k)) { seen.add(k); out.push(k); } });
        return out;
    };

    //   담당자 칩 열 = 팀 카드 '열.담당자필터열'(기술1팀 '수행' — 2026-08-11 확정) 우선, 없으면 현행 키워드
    const assigneeFilterCol = useMemo(() => {
        const base = teamProfile?.열?.담당자필터열;
        if (base) {
            const hit = aliasCol(base);   // 연도별 별칭 — 옛 연도 '견적'→계약, '수행 담당'→수행 (2026-08-21)
            if (hit) return hit;
        }
        return activeHeaders.find(h => h.includes('담당자') && !h.includes('업체'));
    }, [activeHeaders, teamProfile, selectedYear]);   // eslint-disable-line react-hooks/exhaustive-deps

    const assigneeCountMap = useMemo(() => {
        if (!assigneeFilterCol) return {};
        const map = {};
        monthFilteredRows.forEach(r => {
            if (isSubListRow(r)) return;   // 하위 제외 — 부모와 담당자 같아 이중 계산 방지 (2026-07-16)
            assigneeKeys(r[assigneeFilterCol] || '').forEach(name => { map[name] = (map[name] || 0) + 1; });   // 다중 각각 카운트 (2026-07-28)
        });
        return map;
    }, [monthFilteredRows, assigneeFilterCol]);

    // 관리자 칩 필터 (2026-07-22 팀장님): 명단 나열이 아니라 '관리자 열에 실제 들어있는 이름만' 건수순 자동 나열.
    //   같은 사람의 표기 변형('김준혁 팀장'·'김준혁TL')은 이름 핵심으로 묶고, 가장 많이 쓰인 원문을 칩 이름으로 보여준다.
    const managerFilterCol = useMemo(() => activeHeaders.find(h => isManagerCol(h)), [activeHeaders]);
    const managerChips = useMemo(() => {
        if (!managerFilterCol) return [];
        const agg = {};
        monthFilteredRows.forEach(r => {
            if (isSubListRow(r)) return;   // 하위 제외 — 부모 상속이라 이중 계산 방지
            splitAssignees(r[managerFilterCol] || '').forEach(raw => {   // 다중 관리자 각각 (2026-07-28)
                const key = extractName(normalizeAssignee(raw));
                if (!key) return;
                if (!agg[key]) agg[key] = { key, count: 0, labelCnt: {} };
                agg[key].count += 1;
                agg[key].labelCnt[raw] = (agg[key].labelCnt[raw] || 0) + 1;
            });
        });
        // 명단(직책) 순서 우선 — 담당자 칩과 동일 기준 (2026-08-20 팀장님: 최영환 담당(DD)이 김준혁 팀장보다 앞). 명단 밖 이름은 뒤에 건수순.
        const mgrRank = (k) => { const i = ASSIGNEES.findIndex(nm => extractName(normalizeAssignee(nm)) === k); return i === -1 ? 999 : i; };
        return Object.values(agg)
            .map(a => ({ key: a.key, count: a.count, label: Object.entries(a.labelCnt).sort((x, y) => y[1] - x[1])[0][0] }))
            .sort((a, b) => { const ra = mgrRank(a.key), rb = mgrRank(b.key); return ra !== rb ? ra - rb : b.count - a.count; });
    }, [monthFilteredRows, managerFilterCol, ASSIGNEES]);   // eslint-disable-line react-hooks/exhaustive-deps

    // ── 필터 고유값 + 카운트 맵 (연도 필터 적용 후 기준) ─────────────────
    const uniqueVals = useMemo(() => {
        const res = {};
        activeHeaders.forEach(h => {
            if (!isFilterable(h)) return;
            const cm = {};
            monthFilteredRows.forEach(r => {
                if (isSubListRow(r)) return;   // 하위 제외 (2026-07-16)
                let v = String(r[h]||'').trim();
                if (isStatusCol(h) && v.toUpperCase() === 'HOLD') v = 'Hold';
                if (v) cm[v] = (cm[v] || 0) + 1;
            });
            res[h] = cm; // { val: count }
        });
        return res;
    }, [monthFilteredRows, activeHeaders]);

    // ── 검색·컬럼필터·정렬 (연도 필터 이후 적용) ─────────────────────────
    const sortedRows = useMemo(() => {
        let out = monthFilteredRows;
        // ★ 하위(공종)는 부모를 따라간다 (2026-07-16) — 필터·칩·기준월·검색·정렬은 '메인 행'만 판정하고,
        //   하위 행은 자기 값(빈 계약일·sub 상태)과 무관하게 보이는 부모 바로 아래에 항상 붙는다 (월간보고와 동일 규칙).
        //   (수정 전: 기본 상태칩(진행중·추진중)·기준월에서 하위가 걸러져 '저장했는데 안 보이는' 문제)
        const subsByParent = {};
        const orphanSubs = [];
        { let lastMainId = null;
          activeRows.forEach(r => {
              if (!isSubListRow(r)) { lastMainId = r._id; return; }
              if (lastMainId) { if (!subsByParent[lastMainId]) subsByParent[lastMainId] = []; subsByParent[lastMainId].push(r); }
              else orphanSubs.push(r);
          });
        }
        if (activeStatusChips.size > 0 && statusFilterCol) {
            out = out.filter(r => {
                let v = String(r[statusFilterCol] || '').trim();
                if (v.toUpperCase() === 'HOLD') v = 'Hold';
                return v ? activeStatusChips.has(v) : activeStatusChips.has('(빈칸)');   // '(빈칸)' 칩 = 상태 빈 행 (2026-08-24)
            });
        }
        if (activeAssignees.size > 0 && assigneeFilterCol) {
            const selectedNames = new Set([...activeAssignees].map(extractName));
            out = out.filter(r => assigneeKeys(r[assigneeFilterCol]).some(k => selectedNames.has(k)));
        }
        if (activeManagers.size > 0 && managerFilterCol) {
            const selM = new Set([...activeManagers].map(extractName));
            out = out.filter(r => assigneeKeys(r[managerFilterCol]).some(k => selM.has(k)));
        }
        if (searchTerm) {
            const t = searchTerm.toLowerCase();
            const hit = (r) => activeHeaders.some(h => String(r[h]||'').toLowerCase().includes(t));
            out = out.filter(r => hit(r) || (subsByParent[r._id] || []).some(hit));   // 하위 이름으로 검색해도 부모 묶음이 나온다
        }
        Object.entries(columnFilters).forEach(([col, vals]) => {
            if (!(vals instanceof Set) || vals.size === 0) return;
            if (isAssigneeCol(col)) {
                const names = new Set([...vals].map(v => extractName(normalizeAssignee(v))));
                out = out.filter(r => assigneeKeys(r[col]||'').some(k => names.has(k)));
            } else {
                out = out.filter(r => {
                    let v = String(r[col]||'').trim();
                    if (isStatusCol(col) && v.toUpperCase() === 'HOLD') v = 'Hold';
                    return vals.has(v);
                });
            }
        });
        // 보이는 메인 행 뒤에 하위 붙이기 — 하위 자신은 필터 결과(out)에서 빼고 부모 뒤에서만 등장
        const attachSubs = (list) => {
            const fin = [];
            const hideSubs = teamProfile?.하위숨김 === true;   // NAS 공종 하위 행은 표에서 숨김 — 부모만 표시 (2026-08-24 팀장님 · 데이터·자동계산·팝업은 유지)
            list.forEach(r => {
                if (isSubListRow(r)) return;
                fin.push(r);
                if (!hideSubs) (subsByParent[r._id] || []).forEach(s => fin.push(s));
            });
            if (!hideSubs) orphanSubs.forEach(s => fin.push(s));   // 부모 없는 하위(비정상 데이터)는 맨 끝에 표시
            return fin;
        };
        if (!sortConfig.key) return attachSubs(out);
        return attachSubs([...out].sort((a, b) => {
            const av = String(a[sortConfig.key]||'').toLowerCase();
            const bv = String(b[sortConfig.key]||'').toLowerCase();
            // 둘 다 숫자면 숫자로 비교 (2026-07-20): '1'과 '001' 혼재기·포인트 등 숫자열도 순서 보장
            const an = Number(av), bn = Number(bv);
            if (av !== '' && bv !== '' && Number.isFinite(an) && Number.isFinite(bn) && an !== bn) {
                return sortConfig.dir === 'asc' ? an - bn : bn - an;
            }
            return sortConfig.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
        }));
    }, [activeRows, monthFilteredRows, activeHeaders, searchTerm, sortConfig, columnFilters, activeStatusChips, statusFilterCol, activeAssignees, assigneeFilterCol, activeManagers, managerFilterCol]); // eslint-disable-line

    // ★ 표시 행이 바뀌면(칩·검색·정렬·기준월) 내용맞춤 열 너비가 같이 변함 → 틀고정 오프셋 재실측 신호 (2026-08-18)
    //   frzTick은 sortedRows에 영향을 주지 않으므로 무한루프 없음. ±2px 허용 오차가 2중 장치.
    const sortedIdsRef = useRef('');
    useEffect(() => {
        const sig = sortedRows.map(r => r._id).join('|');
        if (sortedIdsRef.current === sig) return;   // 값만 바뀐 커밋(초안 키인)은 행 구성 그대로 → 신호 생략 (2026-08-27 속도: 여분 렌더 1회 제거 — 폭 재실측은 activeRows 효과가 담당)
        sortedIdsRef.current = sig;
        setFrzTick(t => t + 1);
    }, [sortedRows]);

    // ── 창 렌더링 (2026-08-27 팀장님 "키인 후 이동이 너무 느림"): 화면 근처 행만 그린다 ──
    //   표가 202행×35칸(≈7,000칸)이라 칸 하나만 바뀌어도 브라우저가 표 전체 스타일·배치를 다시 계산(실측 0.5~1.3초/키인).
    //   40행만 그리면 0.15초(실측 4~8배 개선) → 처음 1회는 전체를 그려 열 폭을 실측해 고정(winPinW, 화면 모습 종전과 동일)한 뒤
    //   화면 근처 ±15행만 그리고 위·아래는 같은 높이의 빈 줄로 대체(스크롤바 길이·위치 동일 — 한 줄 펼침 불변 기준 유지).
    //   내용이 더 길어지면 열은 자동으로 넓어짐(고정 폭은 '최소 제안'일 뿐 잘림 없음) + 아래 넓힘 효과가 고정 폭도 따라 올림.
    const WIN_MIN = 80, WIN_OVERSCAN = 15, WIN_STEP = 10;
    const [winStart, setWinStart] = useState(0);
    const [winReady, setWinReady] = useState(false);
    const [winPinW, setWinPinW] = useState({});
    const winRowHRef = useRef(0);          // 행 높이(배율 반영 사용값 px) — 배율·밀집도 바뀌면 재실측
    const winCntRef = useRef(40);
    const winWrapRef = useRef(null);
    const winOnRef = useRef(false);
    const winStartRef = useRef(0); winStartRef.current = winStart;
    const winScrollRAF = useRef(0);
    const sortedRowsRef = useRef([]); sortedRowsRef.current = sortedRows;
    winOnRef.current = winReady && sortedRows.length > WIN_MIN;
    // 팀·연도·열구성·자료원·배율·밀집도가 바뀌면 전체를 다시 그려 재실측 (열 폭·행 높이가 달라짐)
    useEffect(() => { setWinReady(false); setWinPinW({}); setWinStart(0); }, [currentTeam, selectedYear, activeHeaders, dataSource, tableScale, compactMode]); // eslint-disable-line react-hooks/exhaustive-deps
    // 전체 렌더가 그려진 뒤(0.6초) 열 폭·행 높이 실측 → 창 렌더 켬 (그리기 끝난 뒤 읽어 강제 배치 비용 없음)
    useEffect(() => {
        if (winReady || sortedRows.length <= WIN_MIN) return;
        const t = setTimeout(() => {
            const tbl = tbodyRef.current ? tbodyRef.current.closest('table') : null;
            if (!tbl) return;
            const z = (tableScale || 100) / 100;
            const pins = {};
            tbl.querySelectorAll('thead th[data-col]').forEach(th => {
                const c = th.getAttribute('data-col');
                pins[c] = Math.max(pins[c] || 0, Math.ceil(th.getBoundingClientRect().width / z));
            });
            let tr = null;
            for (const cand of tbodyRef.current.querySelectorAll('tr')) {
                const f = cand.children[0];
                if (f && (!f.colSpan || f.colSpan <= 1)) { tr = cand; break; }
            }
            if (!tr) return;
            winRowHRef.current = Math.max(16, tr.offsetHeight);
            const wrap = tbl.parentElement;
            winWrapRef.current = wrap;
            if (wrap) winCntRef.current = Math.max(30, Math.ceil(wrap.clientHeight / winRowHRef.current) + WIN_OVERSCAN * 2);
            setWinPinW(pins);
            setWinReady(true);
        }, 600);
        return () => clearTimeout(t);
    }, [winReady, sortedRows.length, tableScale]); // eslint-disable-line react-hooks/exhaustive-deps
    // 값 키인으로 열이 실제 넓어졌으면 고정 폭도 따라 넓힘 (넓어지기만 — 스크롤 중 흔들림 방지)
    useEffect(() => {
        if (!winOnRef.current) return;
        const t = setTimeout(() => {
            const tbl = tbodyRef.current ? tbodyRef.current.closest('table') : null;
            if (!tbl) return;
            const z = (tableScale || 100) / 100;
            const cur = {};
            tbl.querySelectorAll('thead th[data-col]').forEach(th => { cur[th.getAttribute('data-col')] = Math.ceil(th.getBoundingClientRect().width / z); });
            setWinPinW(prev => {
                let grew = false; const next = { ...prev };
                Object.keys(cur).forEach(c => { if ((cur[c] || 0) > (next[c] || 0)) { next[c] = cur[c]; grew = true; } });
                return grew ? next : prev;
            });
        }, 700);
        return () => clearTimeout(t);
    }, [activeRows]); // eslint-disable-line react-hooks/exhaustive-deps
    const onWinScroll = (e) => {
        if (!winOnRef.current) return;
        const el = e.currentTarget;
        if (winScrollRAF.current) return;
        winScrollRAF.current = requestAnimationFrame(() => {
            winScrollRAF.current = 0;
            const rh = winRowHRef.current || 30;
            let s = Math.floor((el.scrollTop || 0) / rh) - WIN_OVERSCAN;
            s = Math.max(0, s - (s % WIN_STEP));
            if (Math.abs(s - winStartRef.current) >= WIN_STEP || (s === 0 && winStartRef.current !== 0)) setWinStart(s);
        });
    };

    // 헤더 클릭 정렬 3단계: 오름차순 → 내림차순 → 해제(기본 순서) (2026-08-28 팀장님: 수행번호 헤더를 눌러 내림차순이 걸린 채
    //   [+]로 번호를 받으니 행이 위로 튀어 '번호가 아래로 바뀐다'고 보임 — 종전엔 연도를 바꾸기 전엔 정렬을 끌 방법이 없었음)
    const requestSort = key =>
        setSortConfig(p => p.key !== key ? { key, dir: 'asc' } : p.dir === 'asc' ? { key, dir: 'desc' } : { key: null, dir: 'asc' });

    const visibleHeaders    = activeHeaders.filter(h => !hiddenCols.has(h));
    const activeFilterCount = Object.values(columnFilters).reduce((acc, v) => acc + (v instanceof Set ? v.size : (v ? 1 : 0)), 0)
                           + activeStatusChips.size
                           + activeAssignees.size
                           + activeManagers.size;

    const visibleGroups = useMemo(() =>
        activeColGroups.map(g => ({ ...g, cols: g.cols.filter(c => !hiddenCols.has(c)) })).filter(g => g.cols.length > 0),
    [activeColGroups, hiddenCols]);

    // ── 메인 테이블 열 (키워드 매칭 + 공사진행 그룹) ─────────────────────
    // 2026-06-27 엑셀 전체 항목을 메인표에 표시 (담당자가 필요없는 항목은 상세팝업 토글로 숨김). 실행번호·내부키만 제외.
    const isMainTableCol = (h) => h !== '실행번호' && !String(h).startsWith('_');

    const allMainCols = useMemo(() =>
        activeHeaders.filter(h => isMainTableCol(h)),
    [activeHeaders, activeColGroups]); // eslint-disable-line

    const EXEC_NO_COL = '실행번호';
    // 실행번호(EXEC_NO_COL)는 표에서 숨김 — 데이터·연결 기능은 유지 (2026-06-26 팀장님 요청, 복원하려면 예전처럼 splice로 삽입)
    // 발주처·업체담당자 자동완성 목록 — 기존 입력값 모음 (추가·상세 팝업 공용, 2026-07-13)
    const fieldSuggestions = useMemo(() => {
        const out = {};
        (activeHeaders || []).forEach(h => {
            if (isClientCol(h) || isVendorAssCol(h)) {
                out[h] = [...new Set(activeRows.map(r => String(r[h] || '').trim()).filter(Boolean))].sort();
            }
        });
        return out;
    }, [activeHeaders, activeRows]);

    const mainVisibleHeaders = useMemo(() =>
        allMainCols.filter(h => !hiddenCols.has(h) && h !== EXEC_NO_COL),
    [allMainCols, hiddenCols]);

    // 실행번호 숨김에 맞춰 그룹에서도 제외 (2026-06-26)
    const mainVisibleGroups = useMemo(() =>
        activeColGroups
            .map(g => ({ ...g, cols: g.cols.filter(c => mainVisibleHeaders.includes(c) && c !== EXEC_NO_COL) }))
            .filter(g => g.cols.length > 0),
    [activeColGroups, mainVisibleHeaders]);

    const hasMainGroups = mainVisibleGroups.some(g => g.label);
    // 3층 헤더 (2026-08-24, 기술2팀 260822): 중간행 라벨(Total·진행현황·시운전)이 있으면 헤더 3줄 — 엑셀과 동일
    const hasMainMids = hasMainGroups && mainVisibleHeaders.some(h => (activeColMids || {})[h]);
    const headRows = hasMainMids ? 3 : 2;
    // ── 그룹 경계선 (2026-08-19 팀장님, 기술1팀): 라벨 그룹이 연달아 붙으면 어디까지가 한 묶음인지 안 보임
    //    → 각 라벨 그룹의 '마지막 열' + 라벨 그룹 '직전 열'에 진한 세로선(.grp-sep, index.css).
    //    ★색·선은 CSS 클래스로 — index.css !important가 인라인을 이김 (2026-06-26 교훈)
    const grpEndCols = useMemo(() => {
        const set = new Set();
        if (!hasMainGroups) return set;
        mainVisibleGroups.forEach((g, i) => {
            const isEdge = g.label || (mainVisibleGroups[i + 1] && mainVisibleGroups[i + 1].label);
            if (isEdge && g.cols.length) set.add(g.cols[g.cols.length - 1]);
        });
        return set;
    }, [mainVisibleGroups, hasMainGroups]);
    const grpSep = (h) => (grpEndCols.has(h) && h !== frozenUpTo) ? ' grp-sep' : '';   // 틀고정 경계(파란선)가 우선 — isPinH는 렌더부 지역함수라 직접 판정
    // '공사 진행' 묶음 범위 — 짧은 값 중앙정렬 판정용 (강조 색·경계는 2026-06-29 제거)
    const _progGrp  = mainVisibleGroups.find(g => g.label && (g.label.includes('공사진행') || g.label.includes('공사 진행')));
    const isProgCol = (h) => !!_progGrp && _progGrp.cols.includes(h);
    const centerCol = (h) => isProgCol(h) && !String(h).replace(/\s/g,'').includes('내용'); // 짧은 % 값 → 중앙정렬

    // 상세 화면에 표시할 비-메인 열
    const detailOnlyHeaders = useMemo(() =>
        activeHeaders.filter(h => !isMainTableCol(h)),
    [activeHeaders, activeColGroups]); // eslint-disable-line

    // ── 헤더 드롭다운 멀티필터 (월간보고 스타일) ─────────────────────────
    // 진행현황→activeStatusChips, 담당자→activeAssignees, 나머지→columnFilters 로 통합
    // ★ ComboFilter·SortHeader는 컴포넌트가 아니라 '렌더 함수'로 직접 호출 (2026-08-25 속도):
    //   컴포넌트 안에서 정의한 함수를 <ComboFilter/>로 쓰면 매 렌더마다 새 타입 → 헤더 30여 칸 전부 언마운트/리마운트.
    //   훅을 안 쓰므로 ComboFilter({ h })처럼 부르면 같은 화면·리마운트 0.
    const ComboFilter = ({ h, small = false }) => {
        const isStatusH   = !!statusFilterCol   && h === statusFilterCol;
        const isAssigneeH = !!assigneeFilterCol && h === assigneeFilterCol;

        // 어느 상태를 쓸지 결정
        const selSet = isStatusH   ? activeStatusChips
                     : isAssigneeH ? activeAssignees
                     : (columnFilters[h] instanceof Set ? columnFilters[h] : new Set());

        const isActive  = selSet.size > 0;
        const isOpen    = openFilter === h;
        const isSortKey = sortConfig.key === h;

        // 표시할 [val, count] 목록
        let entries;
        if (isAssigneeH) {
            // 담당자: ASSIGNEE_LIST 순서로, 이름 기준 카운트
            entries = ASSIGNEES
                .map(name => [name, assigneeCountMap[extractName(name)] || 0])
                .filter(([, cnt]) => cnt > 0);
        } else {
            const countMap = uniqueVals[h] || {};
            entries = Object.entries(countMap).sort((a, b) => {
                if (isStatusH) {
                    const ai = STATUS_OPTIONS.indexOf(a[0]);
                    const bi = STATUS_OPTIONS.indexOf(b[0]);
                    if (ai !== -1 || bi !== -1) {
                        if (ai === -1) return 1;
                        if (bi === -1) return -1;
                        return ai - bi;
                    }
                }
                return b[1] - a[1];
            });
        }

        const szCls  = compactMode === 0 ? (small ? 'text-[11px]' : 'text-[11px]')
                     : compactMode === 1 ? (small ? 'text-[9px]'  : 'text-[10px]')
                     :                     'text-[9px]';
        const iconSz = compactMode === 0 ? (small ? 8 : 10) : 8;

        const toggle = (val) => {
            if (isStatusH) {
                setActiveStatusChips(prev => {
                    const next = new Set(prev);
                    next.has(val) ? next.delete(val) : next.add(val);
                    return next;
                });
            } else if (isAssigneeH) {
                setActiveAssignees(prev => {
                    const next = new Set(prev);
                    next.has(val) ? next.delete(val) : next.add(val);
                    return next;
                });
            } else {
                setColumnFilters(p => {
                    const prev = p[h] instanceof Set ? p[h] : new Set();
                    const next = new Set(prev);
                    next.has(val) ? next.delete(val) : next.add(val);
                    if (next.size === 0) { const n = {...p}; delete n[h]; return n; }
                    return {...p, [h]: next};
                });
            }
        };

        const clear = () => {
            if (isStatusH)        setActiveStatusChips(new Set());
            else if (isAssigneeH) setActiveAssignees(new Set());
            else setColumnFilters(p => { const n = {...p}; delete n[h]; return n; });
        };

        // 선택 여부 (담당자는 이름 정규화 비교)
        const isSelected = (val) => {
            if (isAssigneeH) {
                const selectedNames = new Set([...selSet].map(v => extractName(normalizeAssignee(v))));
                return selectedNames.has(extractName(normalizeAssignee(val)));
            }
            return selSet.has(val);
        };

        return (
            <div ref={el => { filterRefs.current[h] = el; }} className="relative w-full flex items-center justify-center gap-0.5">
                <button
                    onClick={e => { e.stopPropagation(); requestSort(h); }}
                    className={`flex-1 truncate text-left font-bold transition-colors leading-none py-0 ${szCls}
                        ${isActive ? 'text-[#1e7ac8]' : isSortKey ? 'text-[#1e7ac8]' : 'text-slate-400 hover:text-[#1e7ac8]'}`}
                >
                    {(fmHdrAuto(h) || paHdrAuto(h))
                        ? <span title="자동 계산 칸 — 셀 키인 잠금" style={{ color: '#1e7ac8', border: '1px solid #7fb3e3', background: '#eaf3fc', borderRadius: 4, padding: '0 4px', whiteSpace: 'nowrap' }}>{isActive ? `${dispHeader(h)}(${selSet.size})` : dispHeader(h)}</span>
                        : (isActive ? `${dispHeader(h)}(${selSet.size})` : dispHeader(h))}
                    {isSortKey && !isActive && (sortConfig.dir === 'asc'
                        ? <ChevronUp size={iconSz} className="inline ml-0.5"/>
                        : <ChevronDown size={iconSz} className="inline ml-0.5"/>)}
                </button>
                <button
                    onClick={e => { e.stopPropagation(); setOpenFilter(isOpen ? null : h); }}
                    className={`shrink-0 flex items-center justify-center rounded px-0.5 py-0 transition-colors
                        ${isActive ? 'text-amber-400 bg-amber-950/50' : isOpen ? 'text-white bg-slate-600' : 'text-slate-500 hover:text-amber-400 hover:bg-slate-700/60'}`}
                >
                    <ChevronDown size={iconSz} className={`transition-transform duration-150 ${isOpen?'rotate-180':''}`}/>
                </button>
                {isActive && (
                    <button onClick={e => { e.stopPropagation(); clear(); }}
                        className="shrink-0 text-amber-500 hover:text-rose-400 transition-colors" title="필터 해제">
                        <X size={small?9:11}/>
                    </button>
                )}
                {isOpen && (
                    <div className="absolute top-full left-0 mt-1 z-[9999] shadow-2xl overflow-hidden"
                        style={{ backgroundColor:'#fff', border:'1.5px solid #9aa8b8', minWidth:180, maxWidth:260 }}
                        onClick={e => e.stopPropagation()}>
                        {/* 타이틀 바 */}
                        <div style={{ backgroundColor:'#dce3ec', borderBottom:'1px solid #c4ccd8',
                                      padding:'5px 10px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                            <span style={{ fontSize:11, fontWeight:800, color:'#1a1a1a' }}>{h} 필터</span>
                            <button onClick={clear}
                                style={{ fontSize:11, fontWeight:700, color:'#059669', background:'none', border:'none', cursor:'pointer' }}>
                                전체
                            </button>
                        </div>
                        {/* 목록 */}
                        <div style={{ maxHeight:200, overflowY:'auto' }} className="custom-scrollbar">
                            {entries.length === 0
                                ? <div style={{ padding:'12px', fontSize:11, color:'#888', textAlign:'center' }}>데이터 없음</div>
                                : entries.map(([val, cnt]) => {
                                    const isSel = isSelected(val);
                                    return (
                                        <label key={val}
                                            style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 10px',
                                                     cursor:'pointer', borderBottom:'1px solid #f0f4f8',
                                                     backgroundColor: isSel ? '#e8f0fe' : 'transparent' }}>
                                            <input type="checkbox" checked={isSel} onChange={() => toggle(val)}
                                                style={{ accentColor:'#1e7ac8', cursor:'pointer', flexShrink:0 }}/>
                                            <span style={{ flex:1, fontSize:12, fontWeight: isSel ? 700 : 400,
                                                           color: isSel ? '#1e7ac8' : '#1e293b', overflow:'hidden',
                                                           textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{val}</span>
                                            <span style={{ fontSize:10, color:'#888', fontWeight:600, flexShrink:0 }}>{cnt}</span>
                                        </label>
                                    );
                                })
                            }
                        </div>
                        {/* 닫기 */}
                        <div style={{ borderTop:'1px solid #c4ccd8', padding:'6px 10px', display:'flex', justifyContent:'flex-end', backgroundColor:'#f8fafc' }}>
                            <button onClick={() => setOpenFilter(null)}
                                style={{ padding:'3px 14px', backgroundColor:'#1e7ac8', color:'#fff',
                                         fontSize:11, fontWeight:700, border:'none', cursor:'pointer' }}>
                                닫기
                            </button>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    // ── 스마트 필드 입력 (드롭다운/날짜/텍스트 자동 판별) ────────────────
    const getUniqueVals = (header) =>
        [...new Set(activeRows.map(r => String(r[header]||'').trim()).filter(Boolean))].sort();

    const FieldInput = ({ header, value, onChange, focusColor = 'emerald' }) => {
        const inputCls = `bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-${focusColor}-500 focus:ring-1 focus:ring-${focusColor}-500/30 transition-all w-full`;
        if (isDateCol(header)) {
            // 날짜 필드: date picker
            return (
                <input
                    type="date"
                    value={value || ''}
                    onChange={e => onChange(e.target.value)}
                    className={inputCls + ' color-scheme-dark'}
                />
            );
        }
        if (isDropdownCol(header)) {
            // 드롭다운 필드: datalist(기존값 선택) + 직접 입력 가능
            const listId = `dl-${header.replace(/\s+/g, '-')}`;
            return (
                <>
                    <input
                        type="text"
                        list={listId}
                        value={value || ''}
                        onChange={e => onChange(e.target.value)}
                        placeholder="선택하거나 직접 입력..."
                        className={inputCls}
                    />
                    <datalist id={listId}>
                        {getUniqueVals(header).map(v => <option key={v} value={v}/>)}
                    </datalist>
                </>
            );
        }
        return (
            <input
                type="text"
                value={value || ''}
                onChange={e => onChange(e.target.value)}
                className={inputCls}
            />
        );
    };

    // 헤더 표시 이름 — 중복 구분 꼬리표 ' (2)' 등은 웹 내부용이라 화면·엑셀 생성에서 숨김 (2026-08-19 팀장님. 내부 키는 유지)
    const dispHeader = (h) => String(h).replace(/\s*\(\d+\)\s*$/, '');
    const SortHeader = ({ h, small = false, forceColor }) => {
        const isSortKey = sortConfig.key === h;
        const szCls = compactMode === 0 ? (small ? 'text-[11px]' : 'text-[11px]')
                    : compactMode === 1 ? (small ? 'text-[9px]'  : 'text-[10px]')
                    :                     'text-[9px]';
        const iconSz = compactMode === 0 ? (small ? 8 : 10) : 8;
        const colorCls = forceColor ? '' : (isSortKey ? 'text-[#1e7ac8]' : 'text-slate-400');
        return (
            <button onClick={() => requestSort(h)}
                style={forceColor ? { color: isSortKey ? '#1e7ac8' : forceColor } : undefined}
                className={`w-full ${small ? 'whitespace-normal break-words leading-tight' : 'truncate leading-none'} text-left font-bold hover:text-cyan-400 transition-colors py-0
                    ${szCls} ${colorCls}`}>
                {/* 자동 계산 칸 = 이름 자체에 파란 테두리 ('자동' 꼬리표 제거 — 2026-08-21 팀장님: 배치 틀어짐) */}
                {(fmHdrAuto(h) || paHdrAuto(h))
                    ? <span title="자동 계산 칸 — 진행실적 팝업·수식이 채웁니다 (셀 키인 잠금)" style={{ color: '#1e7ac8', border: '1px solid #7fb3e3', background: '#eaf3fc', borderRadius: 4, padding: '0 4px', whiteSpace: 'nowrap' }}>{dispHeader(h)}</span>
                    : dispHeader(h)}
                {isSortKey && (sortConfig.dir==='asc'
                    ? <ChevronUp size={iconSz} className="inline ml-0.5"/>
                    : <ChevronDown size={iconSz} className="inline ml-0.5"/>)}
            </button>
        );
    };

    // ─── 데이터 소스 배지 색상 — 라이트 테마 대비 (2026-08-11: amber-300 등 다크용 옅은 글자가 흰 배경에서 안 보임)
    const srcBadge = {
        pending:  { bg: 'bg-amber-100 border-amber-500 rounded',  text: 'text-amber-900',  icon: <Clock size={14}/>,       label: '미저장 미리보기' },
        local:    { bg: 'bg-violet-100 border-violet-500 rounded', text: 'text-violet-900', icon: <HardDrive size={14}/>,   label: '로컬 임시 저장' },
        firebase: { bg: 'bg-cyan-50 border-cyan-500 rounded',     text: 'text-cyan-900',   icon: <Database size={14}/>,    label: '' },
    }[dataSource];

    // ─── 홈/팀 전환 탭 (2026-08-11 팀장님) ─────────────────────────────────
    //   미저장(pending/local) 상태에서는 이동 차단 — 미리보기 데이터가 다른 팀에 섞이는 사고 방지
    const switchTeam = (t) => {
        if (t === currentTeam) return;
        if (draftCellCount > 0) { draftNavBlock(); return; }   // 임시 편집 미저장 (2026-08-27)
        if (dataSource !== 'firebase') { setAlertMsg('엑셀 미리보기(미저장) 상태에서는 팀 이동을 할 수 없습니다.\n확정 저장 또는 업로드 취소 후 이동해 주세요.'); return; }
        if (onSwitchTeam) onSwitchTeam(t);
    };
    const [teamDropOpen, setTeamDropOpen] = useState(false);   // 제목 옆 ▾ 팀 전환 (2026-08-31 팀장님: 팀 탭 제거)
    // ── 헤더 미니 요약 부품 (2026-08-31 팀장님: 큰 KPI 카드 줄 → 제목 라인 흡수, 동일 폭·그림 포함) ──
    const MINI_STATUS_COLORS = { '추진중': '#1e7ac8', '진행중': '#059669', '완료': '#94a3b8', '준비': '#d97706' };
    const miniNumColor = (nm) => nm === '완료' ? '#059669' : nm === '진행중' ? '#1e7ac8' : '#37352f';
    const miniDonut = (pct, color, txt) => {
        const C = 97.4;   // 반지름 15.5 원둘레
        const p = Math.max(0, Math.min(100, Number(pct) || 0));
        return (
            <span style={{ position: 'relative', width: 40, height: 40, flex: 'none' }}>
                <svg width="40" height="40" viewBox="0 0 40 40" style={{ transform: 'rotate(-90deg)', display: 'block' }}>
                    <circle cx="20" cy="20" r="15.5" fill="none" stroke="#eef2f7" strokeWidth="5.5"/>
                    <circle cx="20" cy="20" r="15.5" fill="none" stroke={color} strokeWidth="5.5" strokeLinecap="round" strokeDasharray={`${p / 100 * C} ${C}`}/>
                </svg>
                <b style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color }}>{txt}</b>
            </span>
        );
    };

    // ── 드래그 범위 선택 → Del 일괄 지우기 (2026-08-27 팀장님: 엑셀처럼 끌어서 한 번에) ──
    //   하이라이트는 DOM 클래스(cell-selr)로만 칠함(React 재렌더 0 = 속도 유지) · Del = 초안(노란 칸)으로 일괄 적재
    //   → [저장 N칸]으로 확정, [취소]로 복구. 잠금·자동 계산·드롭다운(진행현황·담당자 등)·실행번호 칸은 건너뜀.
    const selRef = useRef(null);           // { r1, c1, r2, c2 } — sortedRows 인덱스 × 열 인덱스
    const clearSelPaint = () => { document.querySelectorAll('td.cell-selr').forEach(td => td.classList.remove('cell-selr')); };
    const paintSel = () => {
        clearSelPaint();
        const sel = selRef.current; if (!sel || !tbodyRef.current) return;
        for (let r = sel.r1; r <= sel.r2; r++) {
            const row = sortedRowsRef.current[r]; if (!row) continue;
            const tr = tbodyRef.current.querySelector(`tr[data-row-id="${CSS.escape(String(row._id))}"]`);
            if (!tr) continue;   // 창 렌더 밖 행 — 표시만 생략(범위엔 포함)
            for (let c = sel.c1; c <= sel.c2 && c < tr.children.length; c++) tr.children[c].classList.add('cell-selr');
        }
    };
    const canClearCell = (row, h) => {
        if (isNaItemCell(row, h) || isExtLockedCell(row, h) || isFmAutoCell(row, h) || isPaAutoCell(row, h)) return false;   // 미적용·NAS·자동 계산 잠금
        if (isStatusCol(h) || (!isCustAsgCol(h) && (isAssigneeCol(h) || isManagerCol(h))) || isCardAsgCol(h) || isClientCol(h) || isVendorAssCol(h) || wordDropKey(h)) return false;   // 드롭다운 칸 — 실수 방지
        if (isExecNoCol(h)) return false;                                  // 실행번호 = 하위(s) 구조 마커와 얽힘
        if (isPointCol(h) && getSubPt(row._id)) return false;              // 하위 합계 자동
        return true;
    };
    const onSelMouseDown = (e) => {
        // 우클릭이 드래그 선택 범위 '안'이면 선택 유지 — 우클릭 메뉴 [서식]을 범위 전체에 적용 (2026-09-01)
        if (e.button === 2 && selRef.current) {
            const td0 = e.target.closest && e.target.closest('td');
            const tr0 = td0 && td0.closest('tr[data-row-id]');
            if (td0 && tr0) {
                const ci0 = td0.cellIndex;
                const ri0 = sortedRowsRef.current.findIndex(r => String(r._id) === tr0.getAttribute('data-row-id'));
                const s0 = selRef.current;
                if (ri0 >= s0.r1 && ri0 <= s0.r2 && ci0 >= s0.c1 && ci0 <= s0.c2) return;
            }
        }
        clearSelPaint(); selRef.current = null;
        if (e.button !== 0) return;
        const td = e.target.closest && e.target.closest('td');
        const tr = td && td.closest('tr[data-row-id]');
        if (!td || !tr || td.colSpan > 1) return;
        const ci = td.cellIndex;
        if (ci < 0 || ci >= mainVisibleHeaders.length) return;
        const ri = sortedRowsRef.current.findIndex(r => String(r._id) === tr.getAttribute('data-row-id'));
        if (ri < 0) return;
        const anchor = { r: ri, c: ci };
        let dragging = false, last = '';
        const mm = (ev) => {
            const td2 = ev.target && ev.target.closest && ev.target.closest('td');
            const tr2 = td2 && td2.closest('tr[data-row-id]');
            if (!td2 || !tr2 || td2.cellIndex < 0 || td2.cellIndex >= mainVisibleHeaders.length) return;
            const ri2 = sortedRowsRef.current.findIndex(r => String(r._id) === tr2.getAttribute('data-row-id'));
            if (ri2 < 0) return;
            if (!dragging && (ri2 !== anchor.r || td2.cellIndex !== anchor.c)) { dragging = true; document.body.classList.add('sel-noselect'); }
            if (!dragging) return;
            const key = ri2 + ':' + td2.cellIndex;
            if (key === last) return;
            last = key;
            selRef.current = { r1: Math.min(anchor.r, ri2), r2: Math.max(anchor.r, ri2), c1: Math.min(anchor.c, td2.cellIndex), c2: Math.max(anchor.c, td2.cellIndex) };
            selAnchor2Ref.current = { r: anchor.r, c: anchor.c }; selActiveRef.current = { r: ri2, c: td2.cellIndex };   // 키보드 확장·이동 기준 (2026-09-03)
            paintSel();
            ev.preventDefault();
        };
        const mu = () => {
            document.removeEventListener('mousemove', mm); document.removeEventListener('mouseup', mu);
            document.body.classList.remove('sel-noselect');
            if (!dragging) { selRef.current = null; clearSelPaint(); }
            if (fmtBarRef.current) setFmtSelTick(k => k + 1);   // 서식 팔레트 '선택 N칸' 갱신 (2026-09-01)
        };
        document.addEventListener('mousemove', mm);
        document.addEventListener('mouseup', mu);
    };
    const clearSelectedCells = () => {
        const sel = selRef.current; if (!sel) return;
        if (dataSource !== 'firebase') { setAlertMsg('드래그 지우기는 확정 저장된(클라우드) 데이터에서만 동작합니다.'); return; }
        const rows = sortedRowsRef.current;
        const adds = {}; let cleared = 0, skipped = 0;
        for (let r = sel.r1; r <= sel.r2 && r < rows.length; r++) {
            const row = rows[r];
            const sv = fbRows.find(x => x._id === row._id) || row;
            const patch = {}, orig = {}, edited = {};
            for (let c = sel.c1; c <= sel.c2 && c < mainVisibleHeaders.length; c++) {
                const h = mainVisibleHeaders[c];
                if (String(row[h] ?? '').trim() === '') continue;          // 이미 빈칸
                if (!canClearCell(row, h)) { skipped++; continue; }
                patch[h] = ''; orig[h] = String(sv[h] ?? ''); edited[h] = '';
                cleared++;
            }
            if (!Object.keys(patch).length) continue;
            // 파생 자동 칸 재계산 — 키인과 동일 규칙 (기술1팀 수식·진행율%)
            if (fmActive(row) && Object.keys(patch).some(k => fmTrigSet.has(fmNorm(k)))) Object.assign(patch, fmRecalc({ ...row, ...patch }, row));
            if (Object.keys(patch).some(k => paTrigger(k))) Object.assign(patch, paRecalc({ ...row, ...patch }));
            // 내용 지움 → 날짜=오늘 (셀 키인 규칙과 동일)
            if (Object.keys(edited).some(k => isProgressContentCol(k))) {
                const today = new Date().toISOString().slice(0, 10);
                activeHeaders.forEach(hh => { if (isProgressDateCol(hh)) patch[hh] = today; });
            }
            const changes = Object.keys(patch).filter(k => !k.startsWith('_'))
                .map(k => ({ field: k, from: String(row[k] ?? ''), to: String(patch[k] ?? '') })).filter(ch => ch.from !== ch.to);
            if (!changes.length) continue;
            const chg = new Set(changes.map(ch => ch.field));   // 노란 칸 = 실제 바뀌는 칸만 (키인 규칙과 동일)
            const p2 = {}; Object.keys(patch).forEach(k => { if (k.startsWith('_') || chg.has(k)) p2[k] = patch[k]; });
            adds[row._id] = { patch: p2, orig, edited, entry: { datetime: new Date().toISOString(), changes } };
        }
        clearSelPaint(); selRef.current = null;
        if (!Object.keys(adds).length) { if (skipped) setAlertMsg('선택한 칸은 잠금·자동 계산·드롭다운 칸이라 지울 수 없습니다.'); return; }
        setDraft(prev => {
            const n = { ...prev };
            Object.keys(adds).forEach(id => {
                const a = adds[id]; const d = n[id] || { patch: {}, orig: {}, edited: {}, entries: [] };
                const nOrig = { ...d.orig };
                Object.keys(a.orig).forEach(k => { if (!Object.prototype.hasOwnProperty.call(nOrig, k)) nOrig[k] = a.orig[k]; });
                n[id] = { patch: { ...d.patch, ...a.patch }, orig: nOrig, edited: { ...d.edited, ...a.edited }, entries: [...d.entries, a.entry] };
            });
            return n;
        });
        showExtToast(`${cleared}칸 지움(임시) — 위 [저장] 버튼으로 확정, [취소]로 복구` + (skipped ? ` · 잠금 ${skipped}칸 건너뜀` : ''));
    };
    const clearSelectedCellsRef = useRef(() => {}); clearSelectedCellsRef.current = clearSelectedCells;
    // ── 엑셀식 키보드 (2026-09-03 팀장님: 표를 엑셀처럼 — 직원들이 엑셀에 친숙) ──────────
    //   셀 커서 = selRef 1×1 재사용(드래그 범위와 같은 파란 칠) · 화살표/Home/End/PageUp·Down 이동 · Shift+화살표=범위 확장
    //   Enter=아래로 · Shift+Enter=위로 · Tab=오른쪽(편집 중에도 — 저장 후 이동) · 글자 타이핑=바로 편집 시작 · F2=편집 · Esc=취소(커서 유지)
    //   Ctrl+C: 셀 범위=엑셀 붙여넣기용 TSV / 행 전체 선택(번호 클릭)=기존 행 복사 · Del=기존 일괄 지우기
    //   ※ 한글 첫 글자 타이핑 시작은 IME 한계로 미지원 — F2나 클릭으로 열고 입력 (영문·숫자는 즉시)
    const selActiveRef = useRef(null);    // 활성 셀 {r,c} — Shift 확장의 움직이는 쪽
    const selAnchor2Ref = useRef(null);   // 고정 모서리 {r,c}
    const kbNavRef = useRef(null);        // 편집 저장 직후 이동 방향
    const ensureRowVisible = (ri) => {
        const row = (sortedRowsRef.current || [])[ri]; if (!row) return;
        const tr = tbodyRef.current && tbodyRef.current.querySelector(`tr[data-row-id="${CSS.escape(String(row._id))}"]`);
        if (tr) { tr.scrollIntoView({ block: 'nearest' }); return; }
        if (winOnRef.current && winWrapRef.current) {   // 창 렌더 밖 — 위치 계산 스크롤(8/27 하이라이트 점프와 동일) 후 다시 칠하기
            winWrapRef.current.scrollTop = Math.max(0, ri * (winRowHRef.current || 30) - winWrapRef.current.clientHeight / 2);
            setTimeout(() => paintSel(), 350);
        }
    };
    const setCellCursor = (ri, ci, extend) => {
        const rows = sortedRowsRef.current || [];
        if (!rows.length || !mainVisibleHeaders.length) return;
        ri = Math.max(0, Math.min(ri, rows.length - 1));
        ci = Math.max(0, Math.min(ci, mainVisibleHeaders.length - 1));
        if (!extend || !selAnchor2Ref.current) selAnchor2Ref.current = { r: ri, c: ci };
        selActiveRef.current = { r: ri, c: ci };
        const a = selAnchor2Ref.current;
        selRef.current = { r1: Math.min(a.r, ri), r2: Math.max(a.r, ri), c1: Math.min(a.c, ci), c2: Math.max(a.c, ci) };
        ensureRowVisible(ri);
        paintSel();
        if (fmtBarRef.current) setFmtSelTick(k => k + 1);
    };
    const cursorTd = () => {
        const a = selActiveRef.current; if (!a) return null;
        const row = (sortedRowsRef.current || [])[a.r]; if (!row) return null;
        const tr = tbodyRef.current && tbodyRef.current.querySelector(`tr[data-row-id="${CSS.escape(String(row._id))}"]`);
        return (tr && tr.children[a.c]) || null;
    };
    // 커서 칸 편집 열기 = 실제 클릭과 동일 경로(잠금 안내·드롭다운·폭 측정 전부 기존 그대로) · seed = 타이핑 시작 글자
    const openCursorCell = (seed) => {
        const td = cursorTd(); if (!td) return;
        td.click();
        if (seed === undefined) return;
        let tries = 0;
        const put = () => {
            const inp = tbodyRef.current && tbodyRef.current.querySelector('td input[type="text"]');
            if (inp) {
                const setV = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                setV.call(inp, seed);
                inp.dispatchEvent(new Event('input', { bubbles: true }));
                try { inp.setSelectionRange(seed.length, seed.length); } catch (e2) {}
                return;
            }
            if (++tries < 8) requestAnimationFrame(put);
        };
        requestAnimationFrame(put);
    };
    // 셀 범위 Ctrl+C — 엑셀에 그대로 붙는 TSV (행 복사와 동일하게 원본 값 기준)
    const copyCellRange = () => {
        const sel = selRef.current; if (!sel) return;
        const TAB = String.fromCharCode(9), NL = String.fromCharCode(10);
        const lines = [];
        for (let r = sel.r1; r <= sel.r2; r++) {
            const row = sortedRowsRef.current[r]; if (!row) continue;
            const cells = [];
            for (let c = sel.c1; c <= sel.c2; c++) cells.push(String(row[mainVisibleHeaders[c]] ?? ''));
            lines.push(cells.join(TAB));
        }
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(lines.join(NL)).catch(() => {});
        showExtToast(`${sel.r2 - sel.r1 + 1}×${sel.c2 - sel.c1 + 1} 칸 복사됨 — 엑셀·메모장에 Ctrl+V로 붙습니다`);
    };
    // 전역 키 → 표 키보드 (편집창·모달·드롭다운 열림이면 통과)
    const handleGridKey = (e) => {
        if (!selRef.current || editingCell.id) return false;
        if (statusDropdown || assigneeDropdown || clientDropdown || vendorDropdown || wordDropdown) return false;
        if (document.querySelector('div.fixed.inset-0')) return false;   // 모달·오버레이 열림
        const act = selActiveRef.current || { r: selRef.current.r1, c: selRef.current.c1 };
        const maxR = (sortedRowsRef.current || []).length - 1;
        const maxC = mainVisibleHeaders.length - 1;
        const page = Math.max(5, Math.floor(((winWrapRef.current && winWrapRef.current.clientHeight) || 600) / (winRowHRef.current || 30)) - 2);
        const mv = (r, c, ext) => { setCellCursor(r, c, ext); return true; };
        switch (e.key) {
            case 'ArrowUp':    return mv(e.ctrlKey ? 0 : act.r - 1, act.c, e.shiftKey);
            case 'ArrowDown':  return mv(e.ctrlKey ? maxR : act.r + 1, act.c, e.shiftKey);
            case 'ArrowLeft':  return mv(act.r, e.ctrlKey ? 0 : act.c - 1, e.shiftKey);
            case 'ArrowRight': return mv(act.r, e.ctrlKey ? maxC : act.c + 1, e.shiftKey);
            case 'Home':       return e.ctrlKey ? mv(0, 0, e.shiftKey) : mv(act.r, 0, e.shiftKey);
            case 'End':        return e.ctrlKey ? mv(maxR, maxC, e.shiftKey) : mv(act.r, maxC, e.shiftKey);
            case 'PageUp':     return mv(act.r - page, act.c, e.shiftKey);
            case 'PageDown':   return mv(act.r + page, act.c, e.shiftKey);
            case 'Enter':      return mv(e.shiftKey ? act.r - 1 : act.r + 1, act.c, false);   // 엑셀: Enter=아래로
            case 'F2':         openCursorCell(); return true;
            default:
                if (e.key && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && /[ -~]/.test(e.key)) { openCursorCell(e.key); return true; }   // 영문·숫자·기호 = 바로 입력 시작
                return false;
        }
    };
    const gridKeyRef = useRef(() => false); gridKeyRef.current = handleGridKey;
    const copyCellRangeRef = useRef(() => {}); copyCellRangeRef.current = copyCellRange;
    const isFullRowSel = () => { const s = selRef.current; return !!s && s.c1 === 0 && s.c2 === mainVisibleHeaders.length - 1; };
    const isFullRowSelRef = useRef(() => false); isFullRowSelRef.current = isFullRowSel;
    // 편집 저장 후 커서 이동 (Enter=아래·Tab=오른쪽 — commitCellEdit 래퍼에서 사용)
    const moveCursorFrom = (ec, nav) => {
        const ri = (sortedRowsRef.current || []).findIndex(r => r._id === ec.id);
        const ci = mainVisibleHeaders.indexOf(ec.key);
        if (ri < 0 || ci < 0) return;
        const d = { down: [1, 0], up: [-1, 0], right: [0, 1], left: [0, -1], stay: [0, 0] }[nav] || [0, 0];
        setCellCursor(ri + d[0], ci + d[1], false);
    };
    const moveCursorFromRef = useRef(() => {}); moveCursorFromRef.current = moveCursorFrom;
    // 창 렌더 이동으로 새로 그려진 행에 선택 칠 복원
    useEffect(() => { if (selRef.current) paintSel(); }, [winStart]);   // eslint-disable-line react-hooks/exhaustive-deps
    // 편집창이 닫힐 때 그 행이 다시 그려져 칠이 지워짐 — 닫힌 뒤 한 박자 쉬고 다시 칠하기 (2026-09-03 실기 테스트가 잡음)
    useEffect(() => { if (!editingCell.id && selRef.current) { const t = setTimeout(() => paintSel(), 0); return () => clearTimeout(t); } }, [editingCell.id]);   // eslint-disable-line react-hooks/exhaustive-deps
    // ── 서식 (2026-09-01 팀장님: 엑셀처럼 굵기·글자색·배경 — 떠 있는 팔레트, 칸 클릭/드래그 선택 → 원클릭) ──
    //   저장 = 행 문서 _fmt { row:{b,c,bg}, cells:{ [열]:{b,c,bg} } } — 값(글자)은 안 건드리는 웹 화면 전용 꼬리표
    //   [엑셀 반영](보존 병합)·값 갱신에는 유지 · ⚠관리자 [엑셀 확정 저장](전량 교체)에는 pid처럼 소실
    const openFmtBar = () => {   // 헤더 팔레트 버튼·우클릭 메뉴 — 위치는 이 PC에 기억
        if (dataSource !== 'firebase') { setAlertMsg('서식은 확정 저장된(클라우드) 데이터에서만 사용할 수 있습니다.'); return; }
        let pos = null;
        try { pos = JSON.parse(localStorage.getItem('pms_fmtbar_pos') || 'null'); } catch (e) { pos = null; }
        if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) pos = { x: window.innerWidth - 300, y: 110 };
        pos = { x: Math.min(Math.max(0, pos.x), window.innerWidth - 140), y: Math.min(Math.max(0, pos.y), window.innerHeight - 140) };
        fmtBarPosRef.current = pos; fmtBarRef.current = true; setFmtBar(pos);
    };
    const closeFmtBar = () => { fmtBarRef.current = false; setFmtBar(null); };
    const fmtSelectCell = (rowId, h) => {   // 팔레트 켠 동안 셀 클릭 = 편집 대신 '서식 대상 선택' (엑셀 감각)
        const ri = sortedRowsRef.current.findIndex(r => String(r._id) === String(rowId));
        const ci = mainVisibleHeaders.indexOf(h);
        if (ri < 0 || ci < 0) return;
        selRef.current = { r1: ri, r2: ri, c1: ci, c2: ci };
        paintSel(); setFmtSelTick(k => k + 1);
    };
    const fmtBarDragStart = (e) => {   // 제목줄 잡고 이동
        e.preventDefault();
        const sx = e.clientX, sy = e.clientY, p0 = fmtBarPosRef.current || { x: 0, y: 0 };
        const mm = (ev) => {
            const np = { x: Math.min(Math.max(0, p0.x + ev.clientX - sx), window.innerWidth - 140),
                         y: Math.min(Math.max(0, p0.y + ev.clientY - sy), window.innerHeight - 60) };
            fmtBarPosRef.current = np; setFmtBar(np);
        };
        const mu = () => {
            document.removeEventListener('mousemove', mm); document.removeEventListener('mouseup', mu);
            try { localStorage.setItem('pms_fmtbar_pos', JSON.stringify(fmtBarPosRef.current)); } catch (e2) {}
        };
        document.addEventListener('mousemove', mm); document.addEventListener('mouseup', mu);
    };
    // 팀이 바뀌면 선택(행 번호 기반)은 무효 — 엉뚱한 행에 서식이 가지 않게 비움
    useEffect(() => { selRef.current = null; clearSelPaint(); if (fmtBarRef.current) setFmtSelTick(k => k + 1); }, [currentTeam]);   // eslint-disable-line react-hooks/exhaustive-deps
    const fmtTargets = () => {   // [{ row, cols }] — cols=null이면 행 전체. 대상 = 클릭/드래그 선택(selRef)
        const sel = selRef.current; if (!sel) return [];
        const out = [];
        for (let r = sel.r1; r <= sel.r2; r++) {
            const row = sortedRowsRef.current[r]; if (!row) continue;
            out.push({ row, cols: fmtScope === 'row' ? null : mainVisibleHeaders.slice(sel.c1, sel.c2 + 1) });
        }
        return out;
    };
    const fmtCurrent = () => {   // 팔레트 표시용 현재 서식 (첫 대상 기준)
        const tg = fmtTargets()[0]; if (!tg) return {};
        const f = tg.row._fmt || {};
        return tg.cols ? { ...(f.row || {}), ...((f.cells || {})[tg.cols[0]] || {}) } : (f.row || {});
    };
    const applyFmt = async (patch) => {   // patch = {b|c|bg: 값 | null(그 속성 제거)} · 'clear' = 서식 전부 지우기
        const tg = fmtTargets();
        if (!tg.length) { showExtToast('먼저 표에서 칸을 클릭하거나 드래그로 범위를 고르세요'); return; }
        try {
            for (const { row, cols } of tg) {
                const cur = row._fmt || {};
                const mut = (f0) => {
                    if (patch === 'clear') return {};
                    const f = { ...f0 };
                    Object.entries(patch).forEach(([k, v]) => { if (v === null || v === undefined || v === 0) delete f[k]; else f[k] = v; });
                    return f;
                };
                const next = { row: { ...(cur.row || {}) }, cells: { ...(cur.cells || {}) } };
                if (cols === null) {
                    next.row = mut(cur.row || {});
                    if (patch === 'clear') next.cells = {};   // 행 전체 지우기 = 칸 서식도 함께
                } else cols.forEach(cn => {
                    const v = mut((cur.cells || {})[cn] || {});
                    if (Object.keys(v).length) next.cells[cn] = v; else delete next.cells[cn];
                });
                if (!Object.keys(next.row || {}).length) delete next.row;
                if (!Object.keys(next.cells || {}).length) delete next.cells;
                // updateDoc = _fmt 통째 교체 (setDoc merge는 깊은 병합이라 지운 칸 서식이 남음)
                // ★ 서버 확인(ack)은 기다리지 않음 (2026-09-01 실측): ack가 수 초씩 걸려 원클릭 반응을 막았음 —
                //   화면은 로컬 반영(잠정 스냅샷)이 바로 그려 주고, 실패했을 때만 알림창
                updateDoc(rowDocRef(currentTeam, row._id), { ...stampSave({}), _fmt: Object.keys(next).length ? next : deleteField() })
                    .catch(e3 => setAlertMsg('서식 저장 오류: ' + (e3 && e3.message)));
            }
        } catch (err) { setAlertMsg('서식 저장 오류: ' + err.message); }
    };
    // ── 행 복사(Ctrl+C) → 새 프로젝트로 붙여넣기(Ctrl+V) (2026-08-31 팀장님: 엑셀처럼) ──
    //   번호 칸 클릭 = 행 전체 선택(Shift+클릭 = 여러 행) → Ctrl+C = 내부 보관 + 엑셀용 텍스트도 클립보드에
    //   → Ctrl+V = 즉시 새 프로젝트로 추가(번호 = 그 연도 마지막+1 연속 부여 · 수행번호 빈칸 · 새 ID/등록일)
    const rowClipRef = useRef(null);          // { team, rows:[{...행}] }
    const pasteBusyRef = useRef(false);
    const copySelectedRows = () => {
        const sel = selRef.current; if (!sel) { showExtToast('먼저 번호 칸을 클릭해 행을 선택하세요'); return; }
        const rows = [];
        for (let r = sel.r1; r <= sel.r2; r++) { const row = sortedRowsRef.current[r]; if (row && !isSubListRow(row)) rows.push({ ...row }); }
        if (!rows.length) { showExtToast('복사할 메인 행이 없습니다 (하위 행은 제외)'); return; }
        rowClipRef.current = { team: currentTeam, rows };
        const TAB = String.fromCharCode(9), NL = String.fromCharCode(10);   // 엑셀 호환 탭 구분 텍스트
        const tsv = rows.map(r => mainVisibleHeaders.map(h => String(r[h] ?? '')).join(TAB)).join(NL);
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(tsv).catch(() => {});
        showExtToast(`${rows.length}행 복사됨 — Ctrl+V = 새 프로젝트로 추가 (번호는 비워짐 — 붙여넣기 후 직접 키인)`);
    };
    const pasteCopiedRows = async () => {
        const clip = rowClipRef.current;
        if (!clip || !clip.rows.length || pasteBusyRef.current) return;
        if (dataSource !== 'firebase') { setAlertMsg('붙여넣기는 확정 저장된(클라우드) 데이터에서만 동작합니다.'); return; }
        if (clip.team !== currentTeam) { setAlertMsg('다른 팀 화면에서 복사한 행입니다. 같은 팀에서만 붙여넣을 수 있습니다.'); return; }
        pasteBusyRef.current = true;
        try {
            const yr = String(selectedYear || new Date().getFullYear());
            const noC = projNoColOf();   // ★ 번호 수동 키인 (2026-09-01 팀장님, 구 자동+1 폐지): 붙여넣은 행은 번호 빈칸 — 더블클릭으로 키인(중복 자동 차단)
            const _d = new Date();
            const regDate = `${_d.getFullYear()}-${String(_d.getMonth() + 1).padStart(2, '0')}-${String(_d.getDate()).padStart(2, '0')}`;
            for (let i = 0; i < clip.rows.length; i++) {
                const src = clip.rows[i];
                const newId = `row_manual_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
                const newRow = { _id: newId, _pid: generatePid(), _year: yr, _regDate: regDate };
                activeHeaders.forEach(h => { newRow[h] = src[h] || ''; });                         // 엑셀 항목만 복사(_ 내부필드 제외 = NAS 규칙·이력 안 따라옴)
                activeHeaders.forEach(h => { if (isExecAssignRowCol(newRow, h)) newRow[h] = ''; }); // 수행번호는 복사 안 함 — [+]로
                if (noC) newRow[noC] = '';   // 번호 = 수동 키인 (중복 차단은 셀 키인·초안 저장에서)
                const { _id, ...data } = newRow;
                await setDoc(rowDocRef(currentTeam, _id), stampSave(data));
                recordAudit(AUDIT_ACTIONS.ADD, newRow, []);
            }
            clearSelPaint(); selRef.current = null;
            showExtToast(`${clip.rows.length}건 새 프로젝트로 추가됨 — 번호는 비워 뒀습니다: 번호 칸 더블클릭으로 직접 키인 (중복 자동 차단)`);
        } catch (err) {
            setAlertMsg(`붙여넣기 오류: ${err.message}`);
        } finally { pasteBusyRef.current = false; }
    };
    const copyRowsRef = useRef(() => {}); copyRowsRef.current = copySelectedRows;
    const pasteRowsRef = useRef(() => {}); pasteRowsRef.current = pasteCopiedRows;
    useEffect(() => {
        const onKey = (e) => {
            const t = e.target;
            const inEdit = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);   // 편집창 안 키는 원래대로
            if (e.key === 'Escape') { if (!inEdit && selRef.current) { selRef.current = null; selActiveRef.current = null; selAnchor2Ref.current = null; clearSelPaint(); if (fmtBarRef.current) setFmtSelTick(k => k + 1); } return; }
            const k = String(e.key).toLowerCase();
            if ((e.ctrlKey || e.metaKey) && k === 'c') {   // 복사: 행 전체 선택=행 복사(8/31) / 셀 범위=엑셀용 TSV(2026-09-03)
                if (inEdit || !selRef.current) return;
                if (window.getSelection && String(window.getSelection())) return;   // 글자 드래그 복사는 원래대로
                e.preventDefault();
                if (isFullRowSelRef.current()) copyRowsRef.current(); else copyCellRangeRef.current();
                return;
            }
            if ((e.ctrlKey || e.metaKey) && k === 'v') {   // 새 프로젝트로 붙여넣기 (2026-08-31)
                if (inEdit || !rowClipRef.current) return;
                e.preventDefault();
                pasteRowsRef.current();
                return;
            }
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (inEdit) return;
                if (!selRef.current) return;
                e.preventDefault();
                clearSelectedCellsRef.current();
                return;
            }
            // 엑셀식 이동·입력 (2026-09-03) — 커서 있을 때만
            if (inEdit) return;
            if (gridKeyRef.current(e)) e.preventDefault();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    // ── 행 단위 재렌더 게이트 (2026-08-25) ───────────────────────────────────
    //   gsig = 행 모양에 영향을 주는 전역 상태의 '버전 번호'. 여기 든 것이 바뀌면 전 행 재렌더(종전과 동일),
    //   안 든 것(알림창·토스트·로그·팝업 열림 등)이 바뀌면 행은 그대로 둔다. 행별 신호는 rowSig에서 따로 본다.
    const gsigRef = useRef(0);
    const _gsigDeps = [columnFilters, colWidths, fitWidths, frozenUpTo, tableScale, compactMode, hiddenCols,
        activeHeaders, mainVisibleHeaders, activeColMids, selectedYear, selectedMonth, viewMonth, monthMode, sortConfig, searchTerm,
        activeStatusChips, activeAssignees, activeManagers, teamSettings, currentTeam, isAdmin, user, weeklyLinks, weeklyPanel, highlightExecNo,
        pendingData, localData, fbHeaders, fbColGroups, fbByYear, fbColMids, extMainTeams];
    const gsig = useMemo(() => {
        return ++gsigRef.current;
    }, _gsigDeps);   // eslint-disable-line react-hooks/exhaustive-deps
    const rowCtxRef = useRef({ renderRow: () => null });
    const rowSig = (row) => {
        const sp = getSubPt(row._id);
        const st = extStatus[row._id];
        let par = '';
        if (isSubListRow(row)) {   // 하위 행의 잠금 칸은 부모 규칙에 좌우 → 부모 갱신 도장·규칙 수를 신호에 포함
            const pid = String(row._id).replace(/_sub\d+$/, '');
            const p = pid !== String(row._id) ? fbRows.find(r => r._id === pid) : null;
            par = p ? `${p._updatedAt || ''}/${(p._extSync && Array.isArray(p._extSync.rules)) ? p._extSync.rules.length : 0}` : '';
        }
        return `${gsig}|${editingCell.id === row._id ? editingCell.key : ''}|${selectedRowId === row._id ? 1 : 0}|${highlightedRowId === row._id ? 1 : 0}`
            + `|${st ? `${st.state}/${st.checkedAt || ''}/${(st.files || []).length}` : ''}|${sp ? `${sp.sum}/${sp.count}` : ''}|${par}`;
    };

    // ─── 렌더 ──────────────────────────────────────────────────────────────
    return (
        <div className="h-screen bg-slate-950 text-slate-100 font-sans p-4 md:p-6 flex flex-col overflow-hidden relative" onContextMenu={e => e.preventDefault()}>

            {/* 로딩 */}
            {isLoading && (
                <div className="fixed inset-0 z-[999] flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-sm">
                    <div className="w-14 h-14 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4 shadow-[0_0_20px_rgba(16,185,129,0.4)]"/>
                    <p className="text-lg font-bold text-white">처리 중...</p>
                </div>
            )}

            {/* NAS 자동 반영 토스트 (2026-07-27) — 화면을 막지 않는 구석 알림. 무인 공용 PC 운전용 */}
            {extToast && (
                <div className="fixed z-[9700]" style={{ right: 16, bottom: 16, maxWidth: 380 }}>
                    <div className="shadow-2xl" style={{ background: '#fff', border: `1.5px solid ${extToastWarn ? '#f2b8b8' : '#a9e2cd'}`, borderRadius: 10, overflow: 'hidden' }}>
                        <div style={{ background: extToastWarn ? '#dc2626' : '#059669', padding: '7px 12px', color: '#fff', fontSize: 11.5, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <HardDrive size={13}/> {extToastWarn ? 'NAS 자동 확인 경고' : 'NAS 자동 반영'}
                            <button onClick={() => setExtToast('')} style={{ marginLeft: 'auto', color: '#fff', fontWeight: 800, cursor: 'pointer', lineHeight: 1, fontSize: 12 }}>✕</button>
                        </div>
                        <div style={{ padding: '10px 13px', fontSize: 12, color: '#1e293b', whiteSpace: 'pre-line', lineHeight: 1.6 }}>{extToast}</div>
                    </div>
                </div>
            )}

            {/* 알림 (모달리스) — 화면 정중앙 + 진행실적 팝업(z-9500)보다 위로 띄움(z-10000) 2026-07-10 */}
            {alertMsg && (
                <div className="fixed z-[10000] flex items-center justify-center pointer-events-none" style={{ inset:0 }}>
                    <div className="pointer-events-auto shadow-2xl" style={{ backgroundColor:'#fff', border:'1.5px solid #c4ccd8', minWidth:'280px', maxWidth:'400px', overflow:'hidden' }}>
                        <div style={{ backgroundColor:'#1e7ac8', padding:'8px 16px', color:'#fff', fontSize:'12px', fontWeight:700 }}>알림</div>
                        <div style={{ padding:'16px 20px' }}>
                            <p style={{ fontSize:'13px', color:'#1e293b', marginBottom:'14px', whiteSpace:'pre-line' }}>{alertMsg}</p>
                            <div style={{ display:'flex', justifyContent:'flex-end' }}>
                                <button onClick={() => setAlertMsg('')}
                                    style={{ padding:'5px 18px', backgroundColor:'#1e7ac8', color:'#fff', border:'none', fontSize:'12px', fontWeight:700, cursor:'pointer' }}>
                                    확인
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ★ 동시수정 감지 확인창 (2026-07-14) — 상세팝업(z-9000대)·알림(z-10000)보다 위 */}
            {conflictDlg && (
                <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/50">
                    <div className="shadow-2xl" style={{ backgroundColor:'#fff', border:'1.5px solid #dc2626', width:460, maxWidth:'95vw', overflow:'hidden' }}>
                        <div style={{ backgroundColor:'#dc2626', padding:'9px 16px', color:'#fff', fontSize:12, fontWeight:800 }}>
                            ⚠ 동시 수정 감지
                        </div>
                        <div style={{ padding:'16px', fontSize:12.5, color:'#222', lineHeight:1.7 }}>
                            <p style={{ marginBottom:10 }}>
                                <b style={{ color:'#dc2626' }}>{(conflictDlg.who || '다른 사용자').split('@')[0]}</b>님이
                                내가 이 창을 열어둔 사이에 <b>같은 칸</b>을 수정했습니다.
                                {conflictDlg.at ? <span style={{ color:'#888' }}> ({(() => { try { return new Date(conflictDlg.at).toLocaleString('ko-KR', { hour12: false }); } catch (e) { return String(conflictDlg.at); } })()})</span> : null}
                            </p>
                            <div style={{ backgroundColor:'#fff5f5', border:'1px solid #fecaca', padding:'8px 10px', marginBottom:12, maxHeight:150, overflowY:'auto' }}>
                                {conflictDlg.fields.slice(0,8).map(h => (
                                    <div key={h} style={{ fontSize:11.5, marginBottom:3 }}>
                                        <b>{h}</b> — 상대방 값: <span style={{ color:'#dc2626' }}>"{String(conflictDlg.server?.[h] ?? '')}"</span>
                                        {' → '}내 값: <span style={{ color:'#1e7ac8' }}>"{String(conflictDlg.mine?.[h] ?? detailRow?.[h] ?? '')}"</span>
                                    </div>
                                ))}
                                {conflictDlg.fields.length > 8 && <div style={{ fontSize:11, color:'#888' }}>외 {conflictDlg.fields.length - 8}칸</div>}
                            </div>
                            <p style={{ fontSize:11.5, color:'#666' }}>
                                [내 값으로 덮어쓰기] = 상대방 값이 사라집니다(변경 이력·작업 백로그에는 남습니다).<br/>
                                [취소] = 저장하지 않고 팝업을 닫습니다. 창을 다시 열면 상대방의 최신 값이 보입니다.
                            </p>
                        </div>
                        <div style={{ display:'flex', gap:8, justifyContent:'flex-end', padding:'10px 16px', borderTop:'1px solid #e5eaf3', backgroundColor:'#f8fafc' }}>
                            <button onClick={() => { const c = conflictDlg; setConflictDlg(null); if (c.onCancel) c.onCancel(); else { setDetailRow(null); setDetailRowOriginal(null); } }}
                                style={{ padding:'6px 14px', fontSize:12, fontWeight:700, color:'#555', backgroundColor:'#fff', border:'1px solid #c4ccd8' }}>
                                취소 (저장 안 함)
                            </button>
                            <button onClick={() => conflictDlg.onOverwrite && conflictDlg.onOverwrite()}
                                style={{ padding:'6px 14px', fontSize:12, fontWeight:700, color:'#fff', backgroundColor:'#dc2626', border:'1px solid #b91c1c' }}>
                                내 값으로 덮어쓰기
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 모달리스 저장 확인 다이얼로그 */}
            {confirmDialog && (
                <div className="fixed z-[500] flex items-end justify-center pointer-events-none" style={{ inset:0, paddingBottom:'48px' }}>
                    <div className="pointer-events-auto shadow-2xl"
                        style={{ backgroundColor:'#fff', border:'1.5px solid #c4ccd8', minWidth:'320px', maxWidth:'420px', width:'100%' }}>
                        <div style={{ backgroundColor:'#1e7ac8', padding:'10px 16px', display:'flex', alignItems:'center', gap:8 }}>
                            <Save size={14} style={{ color:'#fff' }}/>
                            <span style={{ color:'#fff', fontWeight:800, fontSize:'13px' }}>저장 확인</span>
                        </div>
                        <div style={{ padding:'18px 20px' }}>
                            <p style={{ fontSize:'13px', color:'#222', fontWeight:600, whiteSpace:'pre-line', lineHeight:1.7, marginBottom:20 }}>
                                {confirmDialog.message}
                            </p>
                            <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
                                <button onClick={() => setConfirmDialog(null)}
                                    style={{ padding:'7px 22px', backgroundColor:'#f1f5f9', border:'1px solid #c4ccd8', fontSize:'13px', fontWeight:700, color:'#555', cursor:'pointer' }}>
                                    취소
                                </button>
                                <button onClick={() => { confirmDialog.onConfirm(); setConfirmDialog(null); }}
                                    style={{ padding:'7px 22px', backgroundColor:'#16a34a', border:'none', fontSize:'13px', fontWeight:700, color:'#fff', cursor:'pointer' }}>
                                    저장
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* 진행현황 인라인 드롭다운 */}
            {statusDropdown && (
                <>
                    <div className="fixed inset-0 z-[350]" onClick={() => setStatusDropdown(null)}/>
                    <div className="fixed z-[351] shadow-2xl overflow-hidden"
                        style={{ ...(statusDropdown.up ? { bottom: statusDropdown.upBottom + 2 } : { top: statusDropdown.top + 2 }), left: statusDropdown.left, minWidth: Math.max(statusDropdown.width, 120),
                                 backgroundColor:'#fff', border:'1.5px solid #c4ccd8', maxHeight: statusDropdown.maxH, overflowY:'auto' }}>
                        {(() => {
                            const colVals = [...new Set(activeRows.map(r => String(r[statusDropdown.col]||'').trim()).filter(Boolean))];
                            const merged  = [...new Set([...STATUS_OPTIONS, ...colVals])];
                            return merged.map(s => {
                                const c = STATUS_COLORS[s] || { bg:'rgba(100,116,139,0.08)', text:'#475569', border:'rgba(100,116,139,0.3)', activeBg:'#475569' };
                                const isCur = String(activeRows.find(r=>r._id===statusDropdown.rowId)?.[statusDropdown.col]||'') === s;
                                return (
                                    <button key={s}
                                        onClick={() => { commitCellWith(statusDropdown.rowId, statusDropdown.col, s); setStatusDropdown(null); }}
                                        style={{ display:'flex', alignItems:'center', gap:'8px', width:'100%', padding:'6px 12px',
                                                 backgroundColor: isCur ? c.activeBg : 'transparent',
                                                 border:'none', cursor:'pointer', textAlign:'left' }}
                                        onMouseEnter={e => { if (!isCur) e.currentTarget.style.backgroundColor = c.bg; }}
                                        onMouseLeave={e => { if (!isCur) e.currentTarget.style.backgroundColor = 'transparent'; }}>
                                        <span style={{ display:'inline-block', width:'8px', height:'8px', borderRadius:'50%', backgroundColor: c.activeBg, flexShrink:0 }}/>
                                        <span style={{ fontSize:'12px', fontWeight: isCur ? 800 : 600, color: isCur ? '#fff' : c.text }}>{s}</span>
                                        {isCur && <Check size={11} style={{ marginLeft:'auto', color:'#fff' }}/>}
                                    </button>
                                );
                            });
                        })()}
                    </div>
                </>
            )}

            {/* 담당자 인라인 드롭다운 — '이름, 이름' 다중 선택 토글 (2026-07-28 팀장님) */}
            {assigneeDropdown && (
                <>
                    <div className="fixed inset-0 z-[350]" onClick={() => setAssigneeDropdown(null)}/>
                    <div className="fixed z-[351] shadow-2xl overflow-hidden"
                        style={{ ...(assigneeDropdown.up ? { bottom: assigneeDropdown.upBottom + 2 } : { top: assigneeDropdown.top + 2 }), left: assigneeDropdown.left, minWidth: Math.max(assigneeDropdown.width, 180),
                                 backgroundColor:'#fff', border:'1.5px solid #c4ccd8', maxHeight:'300px', overflowY:'auto' }}>
                        <div style={{ padding:'5px 12px', fontSize:'10.5px', fontWeight:700, color:'#94a3b8', borderBottom:'1px solid #eef2f7', backgroundColor:'#f8fafc' }}>클릭 = 추가/해제 (여러 명 가능) · 바깥 클릭 = 완료</div>
                        {(() => {
                            // 카드 담당자식열(기술1팀 담당·수행) = 이름만 표기·'/' 연결 / 기존 담당자·관리자 칸 = 직책 표기·공백 연결 (2026-08-21)
                            const cardMode = isCardAsgCol(assigneeDropdown.col);
                            const disp = (name) => (cardMode && asgColCfg?.이름만) ? extractName(name) : toExcelAssignee(name);
                            const sep = cardMode ? (asgColCfg?.구분자 || ' ') : ' ';
                            const curRaw = activeRows.find(r=>r._id===assigneeDropdown.rowId)?.[assigneeDropdown.col]||'';
                            const parts = splitAssigneeCell(curRaw);
                            return (<>
                                {ASSIGNEES.map(name => {
                                    const isCur = parts.some(p => extractName(normalizeAssignee(p)) === extractName(name));
                                    return (
                                        <button key={name}
                                            onClick={() => {
                                                const next = isCur ? parts.filter(p => extractName(normalizeAssignee(p)) !== extractName(name)) : [...parts, disp(name)];
                                                commitCellWith(assigneeDropdown.rowId, assigneeDropdown.col, next.join(sep));   // 표기: 기술2팀 공백(2026-07-28) · 카드팀 구분자(2026-08-21)
                                            }}
                                            style={{ display:'flex', alignItems:'center', gap:'8px', width:'100%', padding:'6px 12px',
                                                     backgroundColor: isCur ? '#374151' : 'transparent', border:'none', cursor:'pointer' }}
                                            onMouseEnter={e=>{ if(!isCur) e.currentTarget.style.backgroundColor='rgba(107,114,128,0.1)'; }}
                                            onMouseLeave={e=>{ if(!isCur) e.currentTarget.style.backgroundColor='transparent'; }}>
                                            <span style={{ fontSize:'12px', fontWeight: isCur ? 800 : 500, color: isCur ? '#fff' : '#374151' }}>{toExcelAssignee(name)}</span>{/* 라벨은 직책 표기, 저장은 disp(이름만 팀=이름만) (2026-08-27) */}
                                            {isCur && <Check size={11} style={{ marginLeft:'auto', color:'#fff' }}/>}
                                        </button>
                                    );
                                })}
                                <div style={{ borderTop:'1px solid #e2e8f0', display:'flex' }}>
                                    <button onClick={() => { setEditingCell({ id: assigneeDropdown.rowId, key: assigneeDropdown.col, value: String(curRaw ?? '') }); setAssigneeDropdown(null); }}
                                        style={{ flex:1, padding:'6px 10px', background:'#f8fafc', border:'none', cursor:'pointer', fontSize:'11px', fontWeight:700, color:'#1358a0' }}>✎ 직접 입력</button>
                                    {!!String(curRaw).trim() && (
                                    <button onClick={() => { commitCellWith(assigneeDropdown.rowId, assigneeDropdown.col, ''); setAssigneeDropdown(null); }}
                                        style={{ flex:1, padding:'6px 10px', background:'#f8fafc', border:'none', borderLeft:'1px solid #e2e8f0', cursor:'pointer', fontSize:'11px', fontWeight:700, color:'#94a3b8' }}>빈칸으로</button>
                                    )}
                                </div>
                            </>);
                        })()}
                    </div>
                </>
            )}

            {/* 발주처 인라인 드롭다운 */}
            {clientDropdown && (
                <>
                    <div className="fixed inset-0 z-[350]" onClick={() => setClientDropdown(null)}/>
                    <div className="fixed z-[351] shadow-2xl overflow-hidden"
                        style={{ ...(clientDropdown.up ? { bottom: clientDropdown.upBottom + 2 } : { top: clientDropdown.top + 2 }), left: clientDropdown.left, minWidth: Math.max(clientDropdown.width, 140),
                                 backgroundColor:'#fff', border:'1.5px solid #c4ccd8', maxHeight:'260px', overflowY:'auto' }}>
                        {[...new Set(yearFilteredRows.map(r => String(r[clientDropdown.col]||'').trim()).filter(Boolean))].sort().map(name => {   // 기준연도 행만 (2026-08-21: 옛 연도 값 딸려오던 문제)
                            const curRaw = String(activeRows.find(r=>r._id===clientDropdown.rowId)?.[clientDropdown.col]||'').trim();
                            const isCur = curRaw === name;
                            return (
                                <button key={name}
                                    onClick={() => { commitCellWith(clientDropdown.rowId, clientDropdown.col, name); setClientDropdown(null); }}
                                    style={{ display:'flex', alignItems:'center', gap:'8px', width:'100%', padding:'6px 12px',
                                             backgroundColor: isCur ? '#1e7ac8' : 'transparent', border:'none', cursor:'pointer' }}
                                    onMouseEnter={e=>{ if(!isCur) e.currentTarget.style.backgroundColor='rgba(30,122,200,0.08)'; }}
                                    onMouseLeave={e=>{ if(!isCur) e.currentTarget.style.backgroundColor='transparent'; }}>
                                    <span style={{ fontSize:'12px', fontWeight: isCur ? 700 : 400, color: isCur ? '#fff' : '#1e293b' }}>{name}</span>
                                    {isCur && <Check size={11} style={{ marginLeft:'auto', color:'#fff' }}/>}
                                </button>
                            );
                        })}
                    </div>
                </>
            )}

            {/* 연도별 1:1 적재·검증 모달 (2026-08-21 팀장님, 기술1팀) */}
            {yearLoad && (
                <div className="fixed inset-0 z-[9000] flex items-center justify-center" style={{ backgroundColor:'rgba(15,23,42,0.45)' }} onClick={() => setYearLoad(null)}>
                    <div onClick={e => e.stopPropagation()} style={{ width:'min(860px, 94vw)', maxHeight:'88vh', overflow:'auto', background:'#fff', borderRadius:'12px', border:'1px solid #dfe5ee', boxShadow:'0 20px 60px rgba(0,0,0,0.25)', padding:'16px 18px' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'6px' }}>
                            <LayoutList size={16} color="#4f46e5"/>
                            <div style={{ fontSize:'14px', fontWeight:800, color:'#1e293b' }}>연도별 1:1 적재·검증</div>
                            <div style={{ fontSize:'11px', color:'#64748b' }}>{yearLoad.fileName}</div>
                            <button onClick={() => setYearLoad(null)} style={{ marginLeft:'auto', background:'none', border:'none', cursor:'pointer', color:'#94a3b8' }}><X size={16}/></button>
                        </div>
                        <div style={{ fontSize:'11px', color:'#64748b', marginBottom:'10px' }}>시트 1장 = 웹 연도 1개. 열 이름·순서·값을 시트 그대로 넣습니다(번역·추가 열 없음). 연도마다 <b>[적재] → [대조 검증]</b> 순서로 한 해씩 진행하세요.</div>
                        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px' }}>
                            <thead><tr style={{ background:'#f1f5f9', color:'#475569' }}>
                                <th style={{ padding:'6px 8px', textAlign:'left' }}>연도 (탭)</th><th>연도</th><th>열</th><th>엑셀 행</th><th>웹 현재</th><th>헤더 벌</th><th></th>
                            </tr></thead>
                            <tbody>
                            {yearLoad.sheets.map(sh => {
                                const webCnt = fbRows.filter(r => String(r._year || '') === String(sh.year)).length;
                                const hasMeta = !!(fbByYear && fbByYear[sh.year]);
                                const sel = yearLoad.sel === sh.name;
                                return (
                                    <tr key={sh.year} onClick={() => setYearLoad(p => ({ ...p, sel: sh.name, report: null }))}
                                        style={{ cursor:'pointer', background: sel ? 'rgba(79,70,229,0.08)' : 'transparent', borderBottom:'1px solid #eef2f7' }}>
                                        <td style={{ padding:'6px 8px', fontWeight: sel ? 800 : 500 }}>{sh.name}{sh.note ? <div style={{ fontSize:'10px', color:'#64748b', fontWeight:400 }}>{sh.note}</div> : null}{sh.error ? <span style={{ color:'#dc2626', marginLeft:6 }}>오류: {sh.error}</span> : null}</td>
                                        <td style={{ textAlign:'center' }}>{sh.year}</td>
                                        <td style={{ textAlign:'center' }}>{sh.headers.length}</td>
                                        <td style={{ textAlign:'center' }}>{sh.rows.length}</td>
                                        <td style={{ textAlign:'center', color: webCnt ? '#1e293b' : '#94a3b8' }}>{webCnt}</td>
                                        <td style={{ textAlign:'center' }}>{hasMeta ? <span style={{ color:'#059669', fontWeight:700 }}>1:1</span> : <span style={{ color:'#94a3b8' }}>—</span>}</td>
                                        <td style={{ textAlign:'right', whiteSpace:'nowrap', padding:'4px 6px' }}>
                                            <button disabled={!sh.rows.length} onClick={e => { e.stopPropagation(); handleYearLoad(sh); }} style={{ fontSize:'11px', fontWeight:700, padding:'3px 8px', borderRadius:'6px', border:'1px solid #4f46e5', background:'#4f46e5', color:'#fff', cursor:'pointer', marginRight:'4px', opacity: sh.rows.length ? 1 : 0.4 }}>적재</button>
                                            <button onClick={e => { e.stopPropagation(); const rep = yearCompare(sh); setYearLoad(p => ({ ...p, sel: sh.name, report: rep.text })); }} style={{ fontSize:'11px', fontWeight:700, padding:'3px 8px', borderRadius:'6px', border:'1px solid #059669', background:'#fff', color:'#059669', cursor:'pointer', marginRight:'4px' }}>대조 검증</button>
                                            <button disabled={!webCnt} onClick={e => { e.stopPropagation(); handleYearDelete(sh.year); }} style={{ fontSize:'11px', fontWeight:700, padding:'3px 8px', borderRadius:'6px', border:'1px solid #e5e7eb', background:'#fff', color:'#dc2626', cursor:'pointer', opacity: webCnt ? 1 : 0.4 }}>지우기</button>
                                        </td>
                                    </tr>
                                );
                            })}
                            </tbody>
                        </table>
                        {yearLoad.report && (
                            <pre style={{ marginTop:'10px', padding:'10px 12px', background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:'8px', fontSize:'11.5px', lineHeight:1.5, whiteSpace:'pre-wrap', color:'#1e293b', maxHeight:'260px', overflow:'auto', fontFamily:'inherit' }}>{yearLoad.report}</pre>
                        )}
                    </div>
                </div>
            )}
            {/* 단어(카테고리) 칸 공용 드롭다운 — 사전 목록(팀 카드) + 열에 실제 쓰인 단어, 맨 아래 직접 입력·빈칸 (2026-08-19 팀장님) */}
            {wordDropdown && (
                <>
                    <div className="fixed inset-0 z-[350]" onClick={() => setWordDropdown(null)}/>
                    <div className="fixed z-[351] shadow-2xl overflow-hidden"
                        style={{ ...(wordDropdown.up ? { bottom: wordDropdown.upBottom + 2 } : { top: wordDropdown.top + 2 }), left: wordDropdown.left, minWidth: Math.max(wordDropdown.width, 110),
                                 backgroundColor:'#fff', border:'1.5px solid #c4ccd8', maxHeight:'280px', overflowY:'auto' }}>
                        {(() => {
                            const used = [...new Set(yearFilteredRows.map(r => String(r[wordDropdown.col]||'').trim()).filter(Boolean))];   // 기준연도 행만 (2026-08-21 팀장님: 2017년 'LGD'·2020년 '생산' 등 옛 값이 2026 드롭다운에 딸려오던 문제)
                            const preset = wordDropdown.preset || [];
                            const opts = [...preset, ...used.filter(v => !preset.includes(v)).sort()];   // 사전 순서 우선, 나머지는 가나다
                            const curRaw = String(activeRows.find(r=>r._id===wordDropdown.rowId)?.[wordDropdown.col]||'').trim();
                            return (
                                <>
                                    {opts.map(name => {
                                        const isCur = curRaw === name;
                                        return (
                                            <button key={name}
                                                onClick={() => { commitCellWith(wordDropdown.rowId, wordDropdown.col, name); setWordDropdown(null); }}
                                                style={{ display:'flex', alignItems:'center', gap:'8px', width:'100%', padding:'6px 12px',
                                                         backgroundColor: isCur ? '#1e7ac8' : 'transparent', border:'none', cursor:'pointer' }}
                                                onMouseEnter={e=>{ if(!isCur) e.currentTarget.style.backgroundColor='rgba(30,122,200,0.08)'; }}
                                                onMouseLeave={e=>{ if(!isCur) e.currentTarget.style.backgroundColor='transparent'; }}>
                                                <span style={{ fontSize:'12px', fontWeight: isCur ? 700 : 400, color: isCur ? '#fff' : '#1e293b' }}>{name}</span>
                                                {isCur && <Check size={11} style={{ marginLeft:'auto', color:'#fff' }}/>}
                                            </button>
                                        );
                                    })}
                                    <div style={{ borderTop:'1px solid #e2e8f0', display:'flex' }}>
                                        <button onClick={() => { const r = activeRows.find(x=>x._id===wordDropdown.rowId); setEditingCell({ id: wordDropdown.rowId, key: wordDropdown.col, value: String(r?.[wordDropdown.col] ?? '') }); setWordDropdown(null); }}
                                            style={{ flex:1, padding:'6px 10px', background:'#f8fafc', border:'none', cursor:'pointer', fontSize:'11px', fontWeight:700, color:'#1358a0' }}>✎ 직접 입력</button>
                                        {curRaw && (
                                        <button onClick={() => { commitCellWith(wordDropdown.rowId, wordDropdown.col, ''); setWordDropdown(null); }}
                                            style={{ flex:1, padding:'6px 10px', background:'#f8fafc', border:'none', borderLeft:'1px solid #e2e8f0', cursor:'pointer', fontSize:'11px', fontWeight:700, color:'#94a3b8' }}>빈칸으로</button>
                                        )}
                                    </div>
                                </>
                            );
                        })()}
                    </div>
                </>
            )}

            {/* 업체담당자 인라인 드롭다운 */}
            {vendorDropdown && (
                <>
                    <div className="fixed inset-0 z-[350]" onClick={() => setVendorDropdown(null)}/>
                    <div className="fixed z-[351] shadow-2xl overflow-hidden"
                        style={{ ...(vendorDropdown.up ? { bottom: vendorDropdown.upBottom + 2 } : { top: vendorDropdown.top + 2 }), left: vendorDropdown.left, minWidth: Math.max(vendorDropdown.width, 140),
                                 backgroundColor:'#fff', border:'1.5px solid #c4ccd8', maxHeight:'260px', overflowY:'auto' }}>
                        {[...new Set(yearFilteredRows.map(r => String(r[vendorDropdown.col]||'').trim()).filter(Boolean))].sort().map(name => {   // 기준연도 행만 (2026-08-21)
                            const curRaw = String(activeRows.find(r=>r._id===vendorDropdown.rowId)?.[vendorDropdown.col]||'').trim();
                            const isCur = curRaw === name;
                            return (
                                <button key={name}
                                    onClick={() => { commitCellWith(vendorDropdown.rowId, vendorDropdown.col, name); setVendorDropdown(null); }}
                                    style={{ display:'flex', alignItems:'center', gap:'8px', width:'100%', padding:'6px 12px',
                                             backgroundColor: isCur ? '#374151' : 'transparent', border:'none', cursor:'pointer' }}
                                    onMouseEnter={e=>{ if(!isCur) e.currentTarget.style.backgroundColor='rgba(107,114,128,0.1)'; }}
                                    onMouseLeave={e=>{ if(!isCur) e.currentTarget.style.backgroundColor='transparent'; }}>
                                    <span style={{ fontSize:'12px', fontWeight: isCur ? 700 : 400, color: isCur ? '#fff' : '#374151' }}>{name}</span>
                                    {isCur && <Check size={11} style={{ marginLeft:'auto', color:'#fff' }}/>}
                                </button>
                            );
                        })}
                    </div>
                </>
            )}

            {/* ── 우클릭 컨텍스트 메뉴 ── */}
            {contextMenu && (
                <>
                    <div className="fixed inset-0 z-[8000]" onClick={() => setContextMenu(null)}/>
                    <div className="fixed z-[8001] bg-white border border-[#c4ccd8] shadow-2xl rounded-lg py-1.5 w-48 animate-in fade-in zoom-in duration-100 overflow-hidden"
                        style={{ top: Math.min(contextMenu.y, window.innerHeight-370), left: Math.min(contextMenu.x, window.innerWidth-200) }}
                        onClick={e => e.stopPropagation()}>
                        <div className="px-3 py-1.5 border-b border-[#e5eaf3] mb-1">
                            <p className="text-[10px] font-black text-[#888] uppercase tracking-wider truncate">
                                {contextMenu.row['실행번호'] || contextMenu.row['번호'] || contextMenu.row['Project'] || contextMenu.row['프로젝트'] || 'Project'}
                            </p>
                        </div>
                        <button onClick={() => { setDetailRow({...contextMenu.row}); setDetailRowOriginal({...contextMenu.row}); setContextMenu(null); }}
                            className="w-full text-left px-4 py-2 hover:bg-blue-50 flex items-center gap-3 text-sm font-bold text-[#222] transition-colors">
                            <Edit2 size={16} className="text-[#1e7ac8]"/> 상세/수정
                        </button>
                        <button onClick={() => { setProgressRow(progressRowFor(contextMenu.row)); setContextMenu(null); }}
                            className="w-full text-left px-4 py-2 hover:bg-blue-50 flex items-center gap-3 text-sm font-bold text-[#222] transition-colors">
                            <TrendingUp size={16} className="text-[#1e7ac8]"/> 진행실적 등록
                        </button>
                        <button onClick={() => { openGraphForRow(contextMenu.row); setContextMenu(null); }}
                            className="w-full text-left px-4 py-2 hover:bg-blue-50 flex items-center gap-3 text-sm font-bold text-[#222] transition-colors">
                            <BarChart3 size={16} className="text-[#1e7ac8]"/> 실적 그래프 보기
                        </button>
                        {/* ★ 서식 (2026-09-01 팀장님: 엑셀처럼 굵기·글자색·배경) — 떠 있는 팔레트 열기 (이미 드래그 선택이 있으면 그 범위 유지) */}
                        <button onClick={() => { const m = contextMenu; setContextMenu(null); if (!selRef.current && m.col) fmtSelectCell(m.row._id, m.col); openFmtBar(); }}
                            className="w-full text-left px-4 py-2 hover:bg-blue-50 flex items-center gap-3 text-sm font-bold text-[#222] transition-colors">
                            <Palette size={16} className="text-[#d97706]"/> 서식 (색·굵기)
                        </button>
                        {/* ★ 이 행 복사해서 추가 (2026-08-31 팀장님: 행 복/붙 — 값을 초기값으로 복사한 추가 팝업. 번호=새 번호·수행번호=빈칸) */}
                        {!isSubListRow(contextMenu.row) && (
                            <button onClick={() => { handleOpenAddRow(contextMenu.row); setContextMenu(null); }}
                                className="w-full text-left px-4 py-2 hover:bg-blue-50 flex items-center gap-3 text-sm font-bold text-[#222] transition-colors">
                                <Copy size={16} className="text-[#1e7ac8]"/> 이 행 복사해서 추가
                            </button>
                        )}
                        {/* ★ 하위(공종) 추가 — 큰 프로젝트 밑에 공조·CDA 같은 공종 행 (2026-07-16). 하위 행에서는 숨김 */}
                        {!isSubListRow(contextMenu.row) && (
                        <button onClick={() => { const r = contextMenu.row; setContextMenu(null); handleAddSubRow(r); }}
                            className="w-full text-left px-4 py-2 hover:bg-blue-50 flex items-center gap-3 text-sm font-bold text-[#222] transition-colors">
                            <CornerDownRight size={16} className="text-[#7c3aed]"/> 하위(공종) 추가
                        </button>
                        )}
                        {/* 프로젝트 연결 — '월간보고로 넘기기'가 기본 경로가 되면서 평소엔 숨김.
                            옛 월간보고 잇기·끊긴 연결 복구용으로 기능(openExecNoModal/saveExecNo)은 보관.
                            관리자에게 노출하려면 아래 false를 조건으로 교체 (2026-07-06) */}
                        {false && (
                        <button onClick={() => { openExecNoModal(contextMenu.row); setContextMenu(null); }}
                            className="w-full text-left px-4 py-2 hover:bg-blue-50 flex items-center gap-3 text-sm font-bold text-[#222] transition-colors">
                            <FileText size={16} className="text-[#1e7ac8]"/> 프로젝트 연결 (실행번호+ID)
                        </button>
                        )}
                        {contextMenu.row[EXEC_NO_COL] && onGoToPms && (
                            <>
                                <div className="border-t border-[#e5eaf3] my-1"/>
                                <button onClick={() => {
                                    onGoToPms(contextMenu.row[EXEC_NO_COL]);
                                    setContextMenu(null);
                                }} className="w-full text-left px-4 py-2 hover:bg-blue-50 flex items-center gap-3 text-sm font-bold text-[#d97706] transition-colors">
                                    <AlignJustify size={16}/> 업무현황 이동
                                </button>
                            </>
                        )}
                        {/* 진행실적 초기화(백지) — ★관리자 전용 적용 완료 (2026-07-14, 기존 TODO 해소) */}
                        <div className="border-t border-[#e5eaf3] my-1"/>
                        {isAdmin && (
                        <button onClick={() => { handleResetProgress(contextMenu.row); setContextMenu(null); }}
                            className="w-full text-left px-4 py-2 hover:bg-red-50 flex items-center gap-3 text-sm font-bold text-[#dc2626] transition-colors">
                            <Trash2 size={16}/> 진행실적 초기화 (백지)
                        </button>
                        )}
                        {/* ★ 프로젝트 완전 삭제 — 전 직원 허용 (2026-09-01 팀장님: 담당자 직접 추가·삭제. 구 2026-07-14 관리자 전용).
                            deleteRow()는 있었으나 호출 버튼이 없어 테스트 행조차 지울 수 없었음.
                            평소 운영은 진행현황을 '삭제'로 바꾸는 방식(soft, 행 보존) 권장 — 이 메뉴는 테스트·오등록 정리용. */}
                        <button onClick={() => {
                            const row = contextMenu.row;
                            const nm = row['Project'] || row['프로젝트명'] || row['공사명'] || row['프로젝트'] || '(이름 없음)';
                            const no = row['번호'] ? `번호 ${row['번호']} · ` : '';
                            // 하위(공종) 행도 함께 삭제 — 부모만 지우면 남은 하위가 앞 프로젝트에 잘못 붙는 사고 방지 (2026-07-16)
                            const subIds = [];
                            const i0 = activeRows.findIndex(x => x._id === row._id);
                            // 메인 행을 지울 때만 하위 동반 삭제 — 하위 행 하나를 우클릭하면 '그 행만' 지운다 (2026-07-16)
                            if (!isSubListRow(row) && i0 >= 0) { for (let i = i0 + 1; i < activeRows.length; i++) { if (isSubListRow(activeRows[i])) subIds.push(activeRows[i]._id); else break; } }
                            const subMsg = subIds.length ? `\n※ 이 프로젝트의 하위(공종) ${subIds.length}개 행도 함께 삭제됩니다.` : '';
                            setContextMenu(null);
                            setConfirmDialog({
                                message: `[완전 삭제]\n${no}${nm}\n\n이 프로젝트를 클라우드에서 완전히 지웁니다.\n되돌릴 수 없습니다. (작업 백로그에는 삭제 기록이 남습니다)${subMsg}\n\n※ 실제 운영 중인 프로젝트라면 삭제 대신\n   진행현황을 '삭제'로 바꾸는 방식을 권장합니다.`,
                                onConfirm: async () => { for (const sid of subIds) { await deleteRow(sid); } await deleteRow(row._id); },
                            });
                        }} className="w-full text-left px-4 py-2 hover:bg-red-50 flex items-center gap-3 text-sm font-black text-[#b91c1c] transition-colors">
                            <Trash2 size={16}/> 프로젝트 완전 삭제
                        </button>
                    </div>
                </>
            )}

            {/* ── 서식 팔레트 (2026-09-01 팀장님: 항상 떠서 작업 — 제목줄 드래그 이동, 오버레이 없음 = 표 그대로 조작) ── */}
            {fmtBar && (() => {
                const cur = fmtCurrent();
                const sel = selRef.current;
                const nSel = sel ? (sel.r2 - sel.r1 + 1) * (sel.c2 - sel.c1 + 1) : 0;
                const nRow = sel ? (sel.r2 - sel.r1 + 1) : 0;
                const scopeBtn = (sc, label) => (
                    <button key={sc} onClick={() => setFmtScope(sc)}
                        style={{ flex: 1, padding: '5px 0', borderRadius: 7, fontSize: 11.5, fontWeight: 800, cursor: 'pointer',
                            border: fmtScope === sc ? '1.5px solid var(--brand)' : '1px solid #dde3ea',
                            background: fmtScope === sc ? '#eaf2fb' : '#fff', color: fmtScope === sc ? 'var(--brand)' : '#64748b' }}>{label}</button>
                );
                const FC = ['#37352f', '#dc2626', '#ea580c', '#16a34a', '#2563eb', '#7c3aed', '#6b7280'];
                const BG = ['#fef9c3', '#fee2e2', '#ffedd5', '#dcfce7', '#dbeafe', '#ede9fe', '#f1f5f9'];
                return (
                    <>
                        <div className="fixed z-[7900] bg-white border border-[#c4ccd8] shadow-2xl rounded-xl" data-tick={fmtSelTick}
                            style={{ top: fmtBar.y, left: fmtBar.x, width: 262, userSelect: 'none' }}
                            onClick={e => e.stopPropagation()}>
                            <div onMouseDown={fmtBarDragStart} title="잡고 끌면 이동합니다"
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px 6px', cursor: 'move', borderBottom: '1px solid #eef1f6' }}>
                                <span style={{ fontSize: 12.5, fontWeight: 800, color: '#1a1a1a', display: 'flex', alignItems: 'center', gap: 6 }}><Palette size={14} color="#d97706"/> 서식 <span style={{ fontSize: 9.5, color: '#b6bcc7', fontWeight: 700 }}>≡ 잡고 이동</span></span>
                                <button onMouseDown={e => e.stopPropagation()} onClick={closeFmtBar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 2 }}><X size={14}/></button>
                            </div>
                            <div style={{ padding: '8px 12px 10px' }}>
                            <div style={{ display: 'flex', gap: 5, marginBottom: 9 }}>
                                {scopeBtn('cells', sel ? `선택 ${nSel}칸` : '선택 칸')}
                                {scopeBtn('row', sel && nRow > 1 ? `행 전체 ×${nRow}` : '행 전체')}
                            </div>
                            <button onClick={() => applyFmt({ b: cur.b ? null : 1 })}
                                style={{ width: '100%', padding: '6px 0', borderRadius: 8, marginBottom: 9, cursor: 'pointer', fontSize: 12.5, fontWeight: 900,
                                    border: cur.b ? '1.5px solid var(--brand)' : '1px solid #dde3ea', background: cur.b ? '#eaf2fb' : '#fff', color: '#1a1a1a' }}>
                                가　굵게 {cur.b ? '켜짐' : ''}
                            </button>
                            <div style={{ fontSize: 10.5, fontWeight: 800, color: '#64748b', marginBottom: 4 }}>글자색</div>
                            <div style={{ display: 'flex', gap: 5, marginBottom: 9 }}>
                                {FC.map(c => (
                                    <button key={c} onClick={() => applyFmt({ c: c === '#37352f' ? null : c })} title={c === '#37352f' ? '기본' : ''}
                                        style={{ width: 27, height: 27, borderRadius: 7, cursor: 'pointer', background: '#fff',
                                            border: (cur.c || '#37352f') === c ? '2px solid var(--brand)' : '1px solid #dde3ea',
                                            color: c, fontWeight: 900, fontSize: 12, padding: 0 }}>가</button>
                                ))}
                            </div>
                            <div style={{ fontSize: 10.5, fontWeight: 800, color: '#64748b', marginBottom: 4 }}>배경색</div>
                            <div style={{ display: 'flex', gap: 5, marginBottom: 10 }}>
                                <button onClick={() => applyFmt({ bg: null })} title="없음"
                                    style={{ width: 27, height: 27, borderRadius: 7, cursor: 'pointer', background: '#fff',
                                        border: !cur.bg ? '2px solid var(--brand)' : '1px solid #dde3ea', color: '#94a3b8', fontSize: 11, padding: 0 }}>✕</button>
                                {BG.map(c => (
                                    <button key={c} onClick={() => applyFmt({ bg: c })}
                                        style={{ width: 27, height: 27, borderRadius: 7, cursor: 'pointer', background: c,
                                            border: cur.bg === c ? '2px solid var(--brand)' : '1px solid #dde3ea', padding: 0 }}/>
                                ))}
                            </div>
                            <button onClick={() => applyFmt('clear')}
                                style={{ width: '100%', padding: '6px 0', borderRadius: 8, cursor: 'pointer', fontSize: 11.5, fontWeight: 800,
                                    border: '1px solid #fca5a5', background: '#fff5f5', color: '#dc2626' }}>서식 지우기</button>
                            <div style={{ marginTop: 7, fontSize: 9.5, color: '#94a3b8', lineHeight: 1.4 }}>
                                {sel ? '누르는 즉시 저장 — 전 직원 화면에 똑같이 보입니다.' : '표에서 칸을 클릭하거나 드래그로 범위를 고르세요.'}<br/>
                                팔레트가 켜진 동안 칸 클릭 = 선택 (내용 편집은 팔레트를 닫고)
                            </div>
                            </div>
                        </div>
                    </>
                );
            })()}

            {/* ── 실행번호 등록 모달 ── */}
            {execNoModal && (
                <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div style={{background:'#ffffff', border:'1px solid var(--line)', borderRadius:12, width:560, maxWidth:'95vw', maxHeight:'80vh', display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:'0 8px 40px rgba(0,0,0,0.18)'}}>
                        {/* 헤더 */}
                        <div style={{padding:'14px 20px', borderBottom:'1px solid var(--line)', display:'flex', alignItems:'center', justifyContent:'space-between', background:'var(--brand)'}}>
                            <div>
                                <div style={{color:'#ffffff', fontWeight:800, fontSize:14}}>프로젝트 연결 (월간보고와 잇기)</div>
                                <div style={{color:'rgba(255,255,255,0.85)', fontSize:11, marginTop:2}}>선택하면 실행번호가 기록되고 양쪽의 고유 ID가 하나로 통일됩니다</div>
                            </div>
                            <button onClick={() => setExecNoModal(null)} style={{background:'none', border:'none', color:'#ffffff', cursor:'pointer', padding:4}}>
                                <X size={16}/>
                            </button>
                        </div>

                        {/* 현재 행 프로젝트명 */}
                        <div style={{padding:'10px 20px', background:'#f3f6fa', borderBottom:'1px solid var(--line)', fontSize:12, color:'var(--txt-mid)'}}>
                            현재 행: {(() => {
                                const nameKeys = ['프로젝트명','프로젝트','Project','공사명','건명','명칭'];
                                const k = nameKeys.find(k => activeHeaders.includes(k)) || activeHeaders.find(h => /프로젝트|공사|건명/.test(h)) || '';
                                return k ? (execNoModal.row[k] || '(이름 없음)') : '(이름 없음)';
                            })()}
                        </div>

                        {/* 후보 목록 */}
                        <div style={{flex:1, overflowY:'auto', padding:'8px 0'}}>
                            {execNoModal.loading ? (
                                <div style={{textAlign:'center', padding:'40px 0', color:'var(--txt-mid)', fontSize:13}}>
                                    월간보고 데이터 불러오는 중...
                                </div>
                            ) : execNoModal.candidates.length === 0 ? (
                                <div style={{textAlign:'center', padding:'40px 0', color:'var(--txt-mid)', fontSize:13}}>
                                    등록된 월간보고 프로젝트가 없습니다
                                </div>
                            ) : (
                                execNoModal.candidates.map((c, i) => {
                                    const isSelected = execNoModal.selected?.execNo === c.execNo;
                                    return (
                                        <div key={i} onClick={() => setExecNoModal(p => ({...p, selected: c}))}
                                            style={{
                                                display:'flex', alignItems:'center', gap:12, padding:'10px 20px',
                                                cursor:'pointer', borderBottom:'1px solid var(--line)',
                                                background: isSelected ? 'rgba(30,122,200,0.10)' : 'transparent',
                                                borderLeft: isSelected ? '3px solid var(--brand)' : '3px solid transparent'
                                            }}>
                                            <div style={{minWidth:90, fontFamily:'monospace', fontSize:12, fontWeight:700, color: c.score > 0.3 ? 'var(--brand)' : 'var(--txt-soft)'}}>
                                                {c.execNo}
                                            </div>
                                            <div style={{flex:1, fontSize:12, color: isSelected ? 'var(--txt-strong)' : 'var(--txt-mid)'}}>
                                                {c.project}
                                            </div>
                                            {c.linkedToThis && (
                                                <span style={{fontSize:9, fontWeight:800, color:'#059669', border:'1px solid rgba(5,150,105,0.4)', borderRadius:4, padding:'1px 5px', flexShrink:0}}>현재 연결</span>
                                            )}
                                            {c.linkedToOther && (
                                                <span style={{fontSize:9, fontWeight:800, color:'#d97706', border:'1px solid rgba(217,119,6,0.4)', borderRadius:4, padding:'1px 5px', flexShrink:0}} title="다른 List 행과 이미 연결됨 — 선택 시 이 행으로 다시 연결됩니다">타 행 연결됨</span>
                                            )}
                                            {c.score > 0 && (
                                                <div style={{fontSize:10, color: c.score > 0.5 ? '#059669' : c.score > 0.2 ? '#d97706' : '#94a3b8', fontWeight:700, minWidth:36, textAlign:'right'}}>
                                                    {Math.round(c.score * 100)}%
                                                </div>
                                            )}
                                            {isSelected && <Check size={14} style={{color:'var(--brand)', flexShrink:0}}/>}
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        {/* 선택된 항목 표시 */}
                        {execNoModal.selected && (
                            <div style={{padding:'10px 20px', background:'rgba(30,122,200,0.06)', borderTop:'1px solid var(--line)', fontSize:12, color:'var(--brand)'}}>
                                선택: <strong>{execNoModal.selected.execNo}</strong> — {execNoModal.selected.project}
                            </div>
                        )}

                        {/* 버튼 */}
                        <div style={{padding:'12px 20px', borderTop:'1px solid var(--line)', display:'flex', justifyContent:'flex-end', gap:8, background:'#f3f6fa'}}>
                            <button onClick={() => setExecNoModal(null)}
                                style={{padding:'7px 20px', background:'#e5e7eb', border:'none', color:'var(--txt-mid)', fontSize:12, fontWeight:700, borderRadius:6, cursor:'pointer'}}>
                                취소
                            </button>
                            <button onClick={saveExecNo} disabled={!execNoModal.selected}
                                style={{padding:'7px 20px', background: execNoModal.selected ? 'var(--brand)' : '#e5e7eb', border:'none', color: execNoModal.selected ? '#fff' : 'var(--txt-soft)', fontSize:12, fontWeight:700, borderRadius:6, cursor: execNoModal.selected ? 'pointer' : 'not-allowed'}}>
                                확인
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── 진행실적 등록 모달리스 ── */}
            {progressRow && (() => {
                const idx = activeRows.findIndex(r => r._id === progressRow._id);
                const subs = [];
                if (idx >= 0) {
                    for (let i = idx + 1; i < activeRows.length; i++) {
                        const eNo = String(activeRows[i]['실행번호'] || '').trim().toLowerCase();
                        if (eNo === 's' || eNo.startsWith('-')) {
                            subs.push({
                                name: activeRows[i]['공사명'] || activeRows[i]['프로젝트명'] || activeRows[i]['Project'] || activeRows[i]['사업명'] || `서브${subs.length + 1}`,
                                key: activeRows[i]._id,
                                pt: Number(activeRows[i]['포인트']) || 0,   // 2단계(2026-07-20): 부모 총점 = 하위 합 (ProgressModal 합산용)
                            });
                        } else break;
                    }
                }
                return (
                    <ProgressModal
                        row={progressRow}
                        progressItems={naToProgressItems(progressRow)}   /* 미적용 항목 → 팝업 진척률서 제외 (2026-07-21) */
                        lockedItems={extLockedItemKeysAllOf(progressRow)}   /* NAS 자동 항목만 잠금 — 팝업 자체시운전은 메인표와 별개 운영·직접 키인 (2026-08-20 팀장님) */
                        sumAsPct={fmActive(progressRow)}   /* 수식 팀: 진척률의 자체시운전 성분 = 그 달 포인트÷총물량 % (합계 칸은 포인트 숫자 — 2026-08-20 팀장님) */
                        team={currentTeam}
                        subRows={subs}
                        baseDate={baseDate}
                        onApplyToMonthly={(rowId, data) => { applyProgressToMainRow(rowId, data?.mainTable); onApplyProgressByPid?.(progressRow._pid, data); }}
                        onProgressSaved={onProgressSaved}
                        onClose={() => setProgressRow(null)}
                        /* ★ 진행실적 → 실적 그래프 바로 이동 (2026-07-14). 저장(적용) 후 눌러야 최신 값이 반영된다 */
                        onShowGraph={() => { const r = progressRow; setProgressRow(null); openGraphForRow(r); }}
                    />
                );
            })()}

            {/* ── 상세 화면 (월간보고 동일 포맷) ── */}
            {detailRow && (
                <DetailModal
                    detailRow={detailRow}
                    setDetailRow={setDetailRow}
                    onSave={saveDetailRow}
                    mainVisibleHeaders={mainVisibleHeaders}
                    activeHeaders={activeHeaders}
                    activeColGroups={activeColGroups}
                    hiddenCols={hiddenCols}
                    onToggleCol={(h) => setHiddenCols(prev => { const n = new Set(prev); n.has(h) ? n.delete(h) : n.add(h); saveHiddenCols(currentTeam, n); return n; })}
                    currentTeam={currentTeam}
                    statusOptions={STATUS_OPTIONS}
                    assignees={ASSIGNEES}
                    suggestions={fieldSuggestions}
                    wordDropOptions={buildWordDropOptions()}
                    customerAsgCols={teamProfile?.고객담당자열 || []}
                    subPtInfo={detailRow ? getSubPt(detailRow._id) : null}
                    extLockedCols={detailRow ? extLockedColsRow(detailRow) : []}
                    execLockedCols={detailRow && !isSubListRow(detailRow) ? (activeHeaders || []).filter(h => isExecAssignRowCol(detailRow, h)) : []}
                />
            )}

            {/* ── 헤더 우클릭: 열 고정 메뉴 (2026-07-21 팀장님) ── */}
            {headerMenu && (
                <>
                    <div className="fixed inset-0 z-[490]" onClick={() => setHeaderMenu(null)} onContextMenu={e => { e.preventDefault(); setHeaderMenu(null); }}/>
                    <div className="fixed z-[500] shadow-2xl" style={{ left: Math.min(headerMenu.x, (window.innerWidth || 1200) - 250), top: Math.min(headerMenu.y, (window.innerHeight || 800) - 130), backgroundColor:'#fff', border:'1.5px solid #c4ccd8', borderRadius:8, overflow:'hidden', minWidth:210 }}>
                        <div style={{ padding:'7px 12px', fontSize:'11px', fontWeight:800, color:'#666', borderBottom:'1px solid #e5eaf3', backgroundColor:'#f8fafc' }}>{headerMenu.h}</div>
                        <button onClick={() => { freezeTo(headerMenu.h); setHeaderMenu(null); }}
                            className="w-full text-left px-4 py-2.5 hover:bg-blue-50 text-xs font-bold text-[#1358a0]">
                            📌 이 열까지 고정 <span style={{ fontWeight:400, color:'#8a97a8' }}>— 여기까지 왼쪽이 따라옴</span>
                        </button>
                        {frozenUpTo && (
                            <button onClick={() => { freezeTo(null); setHeaderMenu(null); }}
                                className="w-full text-left px-4 py-2.5 hover:bg-rose-50 text-xs font-bold text-rose-600">
                                고정 해제 <span style={{ fontWeight:400, color:'#c98a8a' }}>(현재: {frozenUpTo}까지)</span>
                            </button>
                        )}
                    </div>
                </>
            )}

            {/* 삭제 확인 */}
            {confirmClearOpen && (
                <div className="fixed inset-0 z-[400] flex items-center justify-center bg-slate-950/80 p-4">
                    <div className="bg-white border border-[#c4ccd8] p-8 rounded-lg max-w-sm w-full text-center shadow-2xl">
                        <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto mb-4"/>
                        <p className="text-[#222] font-bold mb-2">데이터 삭제</p>
                        <select value={clearYearSel} onChange={e => setClearYearSel(e.target.value)}
                            className="w-full mb-3 py-2 px-3 border border-[#c4ccd8] rounded-lg text-sm font-bold text-[#222] bg-white">
                            <option value="ALL">전체 (모든 연도)</option>
                            {(() => { const by = {}; fbRows.forEach(r => { const y = String(r._year || '').trim(); if (y) by[y] = (by[y] || 0) + 1; }); return Object.keys(by).sort().reverse().map(y => <option key={y} value={y}>{y}년만 ({by[y]}건)</option>); })()}
                        </select>
                        {clearYearSel === 'ALL'
                            ? <p className="text-rose-600 text-sm mb-2 font-bold">⚠ 2026년만이 아니라 이 팀의 모든 연도 + 헤더가 삭제됩니다.</p>
                            : <p className="text-rose-600 text-sm mb-2 font-bold">{clearYearSel}년 행만 삭제됩니다 (다른 연도·헤더 무접촉).</p>}
                        <p className="text-[#475569] text-xs mb-2" style={{lineHeight:1.6}}>{(() => { const by = {}; fbRows.forEach(r => { const y = String(r._year || '?'); by[y] = (by[y] || 0) + 1; }); return Object.keys(by).sort().reverse().map(y => `${y}: ${by[y]}건`).join(' · ') || '(빈 상태)'; })()}</p>
                        <p className="text-[#94a3b8] text-[11px] mb-6">삭제 직전 백업 JSON이 자동 다운로드됩니다. 과거 연도 복구는 [연도별 1:1 적재]로만 가능합니다.</p>
                        <div className="flex gap-3">
                            <button onClick={() => setConfirmClearOpen(false)} className="flex-1 py-3 bg-[#f1f5f9] border border-[#c4ccd8] rounded-lg font-bold text-[#555]">취소</button>
                            <button onClick={clearAll} className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 rounded-lg font-bold text-white">{clearYearSel === 'ALL' ? '전체 삭제' : clearYearSel + '년만 삭제'}</button>
                        </div>
                    </div>
                </div>
            )}


            {/* ── 프로젝트 추가 팝업 — 상세 팝업(DetailModal)과 같은 틀·같은 폭 (2026-07-13 통합) ──
                 옛 1열 640px 폼 폐기. 항목 순서·묶음·2열 그리드·입력 컨트롤 전부 상세 팝업과 동일.
                 onToggleCol은 넘기지 않음 → 추가 화면에는 '메인표 표시' 토글 없음(추가에는 불필요). */}
            {addingRow && (
                <DetailModal
                    mode="add"
                    detailRow={addingRow}
                    setDetailRow={setAddingRow}
                    onSave={saveAddingRow}
                    execLockedCols={addingRow && !isSubListRow(addingRow) ? (activeHeaders || []).filter(h => isExecAssignRowCol(addingRow, h)) : []}
                    activeHeaders={activeHeaders}
                    activeColGroups={activeColGroups}
                    hiddenCols={hiddenCols}
                    currentTeam={currentTeam}
                    statusOptions={STATUS_OPTIONS}
                    assignees={ASSIGNEES}
                    suggestions={fieldSuggestions}
                    wordDropOptions={buildWordDropOptions()}
                    customerAsgCols={teamProfile?.고객담당자열 || []}
                    copiedFromRow={addCopiedRef.current}
                />
            )}

            {/* 디버그 */}
            {showDebug && (
                <div className="absolute bottom-4 right-4 w-[460px] max-h-[340px] bg-slate-950/95 border border-slate-700 rounded-2xl shadow-2xl z-[99999] flex flex-col overflow-hidden backdrop-blur-md">
                    <div className="flex justify-between items-center p-3 bg-slate-900 border-b border-slate-800">
                        <span className="text-emerald-400 font-mono text-[11px] font-black flex items-center gap-2"><TerminalSquare size={13}/> DEBUG</span>
                        <div className="flex gap-3">
                            <button onClick={() => setLogs([])} className="text-slate-500 hover:text-white text-[10px] font-bold uppercase">Clear</button>
                            <button onClick={() => setShowDebug(false)} className="text-slate-500 hover:text-white bg-slate-800 p-1 rounded"><X size={13}/></button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3 font-mono text-[11px] text-slate-300 space-y-1 custom-scrollbar">
                        {logs.length === 0
                            ? <span className="text-slate-600 italic">로그 대기 중...</span>
                            : logs.map((l,i) => (
                                <div key={i} className={l.includes('오류')||l.includes('ERROR')?'text-rose-400 font-bold':l.includes('완료')||l.includes('저장')?'text-emerald-400':l.includes('건너뜀')?'text-amber-400':''}>
                                    {l}
                                </div>
                            ))
                        }
                        <div ref={logEndRef}/>
                    </div>
                </div>
            )}

            {/* 일반 사용자 [엑셀 반영] 미리보기 — 보존 병합 (2026-08-10) */}
            {userMerge && (() => {
                const um = userMerge; const p = um.plan;
                const chgRows = p.updates.filter(u => u.changed);
                const noMatch = p.counts.updates === 0 && p.creates.length > 0;
                const nothing = um.changedCnt === 0 && p.creates.length === 0;
                return (
                <div className="fixed inset-0 z-[9600] flex items-center justify-center bg-black/40" onClick={() => setUserMerge(null)}>
                    <div className="bg-white rounded-lg shadow-2xl border border-[#c4ccd8] w-[680px] max-w-[94vw] max-h-[86vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="px-5 py-3.5 border-b border-[#e5eaf3] flex items-center gap-2">
                            <CloudUpload size={16} className="text-emerald-600 shrink-0"/>
                            <span className="font-extrabold text-[14px] text-[#1e3a5f] shrink-0">엑셀 반영 미리보기</span>
                            <span className="text-[11px] text-[#888] truncate">{um.fileName}</span>
                            <button className="ml-auto text-[#999] hover:text-[#333] shrink-0" onClick={() => setUserMerge(null)}><X size={16}/></button>
                        </div>
                        <div className="px-5 py-3 overflow-y-auto text-[12px] text-[#333]" style={{ lineHeight: 1.6 }}>
                            {/* 요약 칩 */}
                            <div className="flex flex-wrap gap-1.5 mb-3">
                                <span className="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold">＋ 신규 {p.creates.length}건</span>
                                <span className="px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-[#1e7ac8] font-bold">✎ 값 갱신 {um.changedCnt}건</span>
                                <span className="px-2 py-0.5 rounded-full bg-slate-50 border border-slate-200 text-[#666]">변화 없음 {p.counts.updates - um.changedCnt}건</span>
                                <span className="px-2 py-0.5 rounded-full bg-slate-50 border border-slate-200 text-[#666]">엑셀에 없음 {p.counts.missing}건 → 유지</span>
                                <span className="px-2 py-0.5 rounded-full bg-violet-50 border border-violet-200 text-violet-700">하위 {um.subCnt}건 보존</span>
                            </div>
                            {noMatch && (
                                <div className="mb-3 px-3 py-2 rounded border border-red-300 bg-red-50 text-red-700 font-bold">
                                    ⚠ 기존 목록과 하나도 일치하지 않습니다 — 다른 파일(진척자료 등)이 아닌지 확인하세요.
                                    이대로 반영하면 {p.creates.length}건이 전부 새 프로젝트로 추가됩니다.
                                </div>
                            )}
                            {nothing && (
                                <div className="mb-3 px-3 py-2 rounded border border-slate-300 bg-slate-50 text-[#555]">
                                    반영할 변경이 없습니다 — 엑셀과 웹이 이미 같습니다.
                                </div>
                            )}
                            {um.skippedSubs > 0 && (
                                <div className="mb-2 px-3 py-1.5 rounded border border-amber-300 bg-amber-50 text-amber-800 text-[11.5px]">
                                    엑셀 안 하위(공종)형 줄 <b>{um.skippedSubs}건</b>은 무시했습니다 — 하위 행은 웹(NAS 자동 연동)에서 관리됩니다.
                                </div>
                            )}
                            {um.nasSkips.length > 0 && (
                                <div className="mb-2 px-3 py-1.5 rounded border border-violet-300 bg-violet-50 text-violet-800 text-[11.5px]">
                                    NAS 자동 연동 칸 <b>{um.nasSkips.length}개</b>는 자동 값 보호를 위해 엑셀 값을 무시했습니다
                                    <span className="text-[10.5px]"> — {um.nasSkips.slice(0, 4).map(s => `${s.name}·${s.col}`).join(', ')}{um.nasSkips.length > 4 ? ` 외 ${um.nasSkips.length - 4}개` : ''}</span>
                                </div>
                            )}
                            {(um.webOnly.length > 0 || um.excelOnly.length > 0) && (
                                <div className="mb-3 text-[10.5px] text-[#999]">
                                    {um.webOnly.length > 0 && <div>· 엑셀에 없는 웹 열 (그대로 유지): {um.webOnly.join(', ')}</div>}
                                    {um.excelOnly.length > 0 && <div>· 웹 표에 없는 엑셀 열 (무시): {um.excelOnly.join(', ')}</div>}
                                </div>
                            )}
                            {/* 값 갱신 상세 */}
                            {chgRows.length > 0 && (
                                <div className="mb-3">
                                    <div className="font-extrabold text-[#1e3a5f] mb-1">값이 바뀌는 행 ({um.changedCnt}건{chgRows.length > 40 ? ' — 앞 40건만 표시' : ''})</div>
                                    <div className="border border-[#e5eaf3] rounded max-h-[220px] overflow-y-auto px-2.5 py-1 bg-[#f8fafc]">
                                        {chgRows.slice(0, 40).map(u => (
                                            <div key={u._id} className="py-1.5 border-b border-[#eef2f7] last:border-0">
                                                <div className="font-bold text-[#222]">{u.data['번호'] ? `[${u.data['번호']}] ` : ''}{u.name || '(이름 없음)'}</div>
                                                {(u.diffs || []).slice(0, 6).map((d, i) => (
                                                    <div key={i} className="pl-3 text-[11px] text-[#555]">
                                                        {d.col}: <span className="text-[#aaa] line-through">{d.from || '(빈칸)'}</span>
                                                        {' → '}<span className="text-[#1e7ac8] font-bold">{d.to || '(빈칸)'}</span>
                                                    </div>
                                                ))}
                                                {(u.diffs || []).length > 6 && <div className="pl-3 text-[10px] text-[#999]">외 {u.diffs.length - 6}칸</div>}
                                                {(u.diffs || []).length === 0 && <div className="pl-3 text-[10px] text-[#999]">(연도 변경)</div>}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {/* 신규 상세 */}
                            {p.creates.length > 0 && (
                                <div className="mb-3">
                                    <div className="font-extrabold text-emerald-700 mb-1">신규 추가 ({p.creates.length}건{p.creates.length > 20 ? ' — 앞 20건만 표시' : ''})</div>
                                    <div className="border border-emerald-100 rounded max-h-[120px] overflow-y-auto px-2.5 py-1.5 bg-emerald-50/40 text-[11.5px]">
                                        {p.creates.slice(0, 20).map(c => (
                                            <div key={c._id}>{c.data['번호'] ? `[${c.data['번호']}] ` : ''}{pickProjectName(c.data) || '(이름 없음)'}</div>
                                        ))}
                                        {p.creates.length > 20 && <div className="text-[#999]">외 {p.creates.length - 20}건</div>}
                                    </div>
                                </div>
                            )}
                            <div className="text-[10.5px] text-[#999]">
                                삭제는 하지 않습니다 (엑셀에 없는 행·하위 행 전부 유지) · pid·등록일·변경이력·포인트실적 보존 · 반영 직전 백업(JSON) 자동 다운로드
                            </div>
                        </div>
                        <div className="px-5 py-3 border-t border-[#e5eaf3] bg-[#f8fafc] flex justify-end gap-2 rounded-b-lg">
                            <button onClick={() => setUserMerge(null)} disabled={isLoading}
                                className="px-4 py-1.5 text-xs font-bold text-[#555] bg-white border border-[#c4ccd8] rounded hover:bg-slate-50">
                                취소 (반영 안 함)
                            </button>
                            <button onClick={applyUserMerge} disabled={isLoading || nothing}
                                className="px-4 py-1.5 text-xs font-extrabold text-white bg-emerald-600 border border-emerald-600 rounded hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed">
                                {isLoading ? '반영 중...' : `이대로 반영 (신규 ${p.creates.length} · 갱신 ${um.changedCnt})`}
                            </button>
                        </div>
                    </div>
                </div>
                );
            })()}

            {/* NAS 진척자료 반영 확인창 (2026-07-22) — 변경 감지 미리보기 → 원클릭 반영 */}
            {extProposals && extProposals.length > 0 && (
                <div className="fixed inset-0 z-[9800] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)' }}>
                    <div style={{ background: '#fff', border: '1px solid #c8d4e0', borderRadius: 10, width: 460, maxWidth: '92vw', boxShadow: '0 8px 24px rgba(0,0,0,0.18)', overflow: 'hidden' }}>
                        <div style={{ padding: '13px 18px', borderBottom: '1px solid #d0d8e4', background: '#eff6ff', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <HardDrive size={16} color="#2563eb"/>
                            <span style={{ fontWeight: 800, fontSize: 14, color: '#1e3a5f' }}>NAS 진척자료 변경 감지</span>
                        </div>
                        <div style={{ padding: '12px 18px', maxHeight: '46vh', overflowY: 'auto' }}>
                            {extProposals.map((p, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', marginBottom: 6, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 7 }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 12, fontWeight: 700, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.projectName || p.rowId}</div>
                                        <div style={{ fontSize: 10.5, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.fileName}>{p.fileName}</div>
                                    </div>
                                    <span style={{ fontSize: 12, fontWeight: 800, color: '#0369a1', whiteSpace: 'nowrap' }}>{p.target}</span>
                                    <span style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap', maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.from}</span>
                                    <span style={{ fontSize: 12, color: '#94a3b8' }}>→</span>
                                    <span style={{ fontSize: 13, fontWeight: 800, color: '#2563eb', whiteSpace: p.kind ? 'normal' : 'nowrap', maxWidth: 230, textAlign: 'right', lineHeight: 1.45 }}>{p.to}</span>
                                </div>
                            ))}
                            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>반영하면 메인표 값과 주간 진행실적 장부에 함께 기록됩니다.</div>
                        </div>
                        <div style={{ padding: '11px 18px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button onClick={() => setExtProposals(null)} disabled={extBusy}
                                style={{ padding: '7px 14px', fontSize: 12, fontWeight: 700, borderRadius: 7, border: '1px solid #cbd5e1', background: '#fff', color: '#475569', cursor: 'pointer' }}>나중에</button>
                            <button onClick={() => extApplyProposals(extProposals)} disabled={extBusy}
                                style={{ padding: '7px 16px', fontSize: 12, fontWeight: 800, borderRadius: 7, border: '1px solid #2563eb', background: extBusy ? '#93c5fd' : '#2563eb', color: '#fff', cursor: 'pointer' }}>{extBusy ? '반영 중...' : `모두 반영 (${extProposals.length}건)`}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* NAS 진척자료 연결 모달 (2026-07-22) — 경로(공유)·규칙(관리자)·이 PC 폴더 지정/확인 */}
            {/* 2026-07-31: 화면 스위치를 RULE_UI_ENABLED 로 분리.
                오피스365 방식에서도 '규칙 등록'은 사람이 해줘야 하므로 이 모달은 켠다.
                브라우저가 파일을 직접 읽어 반영하는 동작만 계속 끈 상태(NAS_SYNC_ENABLED=false)로 둔다. */}
            {RULE_UI_ENABLED && extModalRowId && (() => {
                const exRow = activeRows.find(r => r._id === extModalRowId) || fbRows.find(r => r._id === extModalRowId);
                if (!exRow) return null;
                const ex = exRow._extSync || {};
                const st = extStatus[extModalRowId];
                const exRules = extRulesRawOf(exRow);   // ★ 원본 읽기 필수 (2026-07-31) — extRulesOf는 NAS_SYNC_ENABLED=false면 빈 배열이라, 그걸 기준으로 저장하면 기존 규칙이 통째로 지워진다
                const inSt = { width: '100%', border: '1px solid #cbd5e1', borderRadius: 6, padding: '6px 9px', fontSize: 12, color: '#1e293b', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', background: '#fff' };
                const bSt = (bg, bd, fg) => ({ padding: '7px 12px', fontSize: 12, fontWeight: 700, borderRadius: 7, border: '1px solid ' + bd, background: bg, color: fg, cursor: 'pointer', whiteSpace: 'nowrap' });
                const secT = { fontSize: 11.5, fontWeight: 800, color: '#475569', margin: '0 0 6px' };
                // 섹션 번호 자동 매기기 (2026-07-31) — NAS 전용 섹션이 숨겨져도 ①②③ 이 끊기지 않게
                const SEC_NUMS = ['①', '②', '③', '④', '⑤'];
                let _secI = 0;
                const secNo = () => SEC_NUMS[_secI++] || '·';
                const dotColor = st ? (st.state === 'changed' ? '#7c3aed' : st.state === 'perm' ? '#d97706' : st.state === 'error' ? '#dc2626' : st.state === 'ok' ? '#059669' : '#94a3b8') : '#94a3b8';
                const closeAllExt = () => { setExtModalRowId(null); setExtRuleDraft(null); setExtPathDraft(null); setExtLocalDraft(null); setExtSharedPathDraft(null); setMyReaderReqAt(null); setShowAllFiles(false); setExtFolderDraft(null); };
                const extJoin = (base, rel) => { const b = String(base || '').replace(/[\\/]+$/, ''); return (b && rel) ? (b + '\\' + rel) : ''; };
                const extLocalKey = 'pms_ext_localbase_' + currentTeam + '_' + exRow._id;
                const extLocalBase = () => { try { return (localStorage.getItem(extLocalKey) || '').trim(); } catch (er) { return ''; } };
                const extBase = () => extLocalBase() || ex.uncPath || '';   // 열기·복사는 이 PC용 주소 우선 (이름찾기 실패 대비)
                // [엑셀로 열기]용 웹주소 만들기 (2026-07-28 길A) — UNC(또는 Z:)주소 → https://…:5006/NECONSYS_PJ/…
                const DAV_HOST = 'https://necon-pj.synology.me:5006';   // NAS WebDAV(HTTPS)
                const DAV_SHARE = 'NECONSYS_PJ';                        // 최상위 공유 폴더(영문) — 웹주소는 반드시 여기부터 시작
                const davUrlFor = (rel, baseOverride) => {   // baseOverride: 공용 파일은 공용 폴더 주소로 (2026-08-05)
                    const base = String(baseOverride || ex.uncPath || extLocalBase() || '').trim();
                    if (!base) return '';
                    let parts = base.replace(/^[\\/]+/, '').replace(/[\\/]+$/, '').split(/[\\/]+/).filter(Boolean);
                    if (parts.length && /^[A-Za-z]:$/.test(parts[0])) parts.shift();                                                  // Z: 드라이브 글자 제거
                    if (parts.length && /^(neconsys_pj|necon-pj\.synology\.me|192\.168\.\d+\.\d+)$/i.test(parts[0])) parts.shift();   // 서버 이름 제거
                    if (parts.length && parts[0].toUpperCase() === DAV_SHARE) parts.shift();                                          // 공유 이름 중복 방지
                    const relParts = String(rel || '').split(/[\\/]+/).filter(Boolean);
                    return DAV_HOST + '/' + [DAV_SHARE, ...parts, ...relParts].map(encodeURIComponent).join('/');
                };
                return (
                    <div className="fixed inset-0 z-[9700] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)' }} onMouseDown={e => { if (e.target === e.currentTarget) closeAllExt(); }}>
                        <div style={{ background: '#fff', border: '1px solid #c8d4e0', borderRadius: 10, width: 580, maxWidth: '94vw', maxHeight: '86vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.18)' }} onClick={e => e.stopPropagation()}>
                            <div style={{ padding: '13px 18px', borderBottom: '1px solid #d0d8e4', background: '#f0f4f8', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                                    <HardDrive size={16} color="#1e7ac8"/>
                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ fontWeight: 800, fontSize: 14, color: '#1a1a1a' }}>{NAS_SYNC_ENABLED ? 'NAS 진척자료 자동 연결' : '진척자료 자동 반영 규칙'}</div>
                                        <div style={{ fontSize: 11.5, color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 420 }}>{pickProjectName(exRow)}</div>
                                    </div>
                                </div>
                                <button onClick={closeAllExt} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', padding: 4 }}><X size={18}/></button>
                            </div>
                            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px' }}>
                                <div style={{ fontSize: 11.5, color: '#475569', background: '#f0f7ff', border: '1px solid #cfe3f7', borderRadius: 7, padding: '8px 11px', marginBottom: 12, lineHeight: 1.55 }}>
                                    {NAS_SYNC_ENABLED ? (<>
                                    원본은 NAS 폴더의 최신 엑셀 하나입니다. 직원들은 평소처럼 열어 <b>수정·저장만</b> 하면 되고,
                                    이 화면을 여는 PC가 최신 파일을 읽어 <b>바뀐 값만 확인 후 자동 반영</b>합니다. (파일 복사본은 올리지 않음 · 읽기 전용)
                                    </>) : (<>
                                    원본은 <b>오피스365 클라우드</b>의 진척자료 엑셀입니다. 직원들은 평소처럼 열어 <b>수정·저장만</b> 하면 되고,
                                    NAS에서 도는 자동 프로그램이 <b>15분마다</b> 클라우드를 직접 읽어 이 표에 반영합니다.<br/>
                                    여기서는 <b>어느 파일·시트·셀을 읽을지(규칙)만</b> 등록하면 됩니다 — PC 지정·폴더 허가증은 이제 필요 없습니다.
                                    </>)}
                                </div>

                                {/* 자동 반영기 상태 (2026-07-31) — NAS Docker 프로그램(pms-reader)이 매 회차 남기는 기록을 그대로 보여준다 */}
                                {!NAS_SYNC_ENABLED && (() => {
                                    const rs = rdState(readerStatus);
                                    const rsd = readerStatus;
                                    return (
                                        <div style={{ border: '1px solid #e2e8f0', background: '#fbfdff', borderRadius: 7, padding: '9px 11px', marginBottom: 13, fontSize: 11.5, color: '#475569', lineHeight: 1.6 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                                                <span style={{ width: 9, height: 9, borderRadius: '50%', background: rs.color, flexShrink: 0 }}/>
                                                <b style={{ color: '#334155' }}>자동 반영기</b>
                                                {rsd && rsd.at
                                                    ? <span>{rdTimeText(rsd.at)} 확인{rs.mins != null ? ` (${rs.mins}분 전)` : ''} · {rsd.intervalMin || 15}분 주기</span>
                                                    : <span style={{ color: '#94a3b8' }}>아직 기록 없음 — NAS 프로그램이 한 바퀴 돌면 여기에 표시됩니다</span>}
                                                {rsd && rsd.dryRun ? <span style={{ color: '#d97706', fontWeight: 700 }}>· 시험 모드(쓰기 안 함)</span> : null}
                                                <span style={{ flex: 1 }}/>
                                                {/* [지금 확인] (2026-07-31) — 15분을 기다리지 않고 즉시 한 바퀴 돌게 한다 */}
                                                <button style={{ ...bSt('#eaf2fb', '#bcd6f0', '#1358a0'), padding: '5px 10px' }} disabled={readerReqBusy}
                                                    title="자동 반영기에게 '지금 한 번 확인해달라'고 요청합니다. 최대 20초 안에 처리됩니다."
                                                    onClick={sendReaderRequest}>{readerReqBusy ? '요청 중...' : '지금 확인'}</button>
                                            </div>
                                            {myReaderReqAt && (
                                                (rsd && rsd.lastRequestAt === myReaderReqAt)
                                                    ? <div style={{ paddingLeft: 16, color: '#059669', fontWeight: 700 }}>요청 처리 완료 — 위 시각 기준으로 최신입니다.</div>
                                                    : <div style={{ paddingLeft: 16, color: '#2563eb', fontWeight: 700 }}>요청을 보냈습니다 — 최대 20초 안에 반영됩니다. 이 창을 열어두시면 저절로 바뀝니다.</div>
                                            )}
                                            {rsd && rsd.at && (
                                                <div style={{ paddingLeft: 16, color: '#64748b' }}>
                                                    규칙 걸린 프로젝트 {rsd.targets || 0}건 · 규칙 {rsd.rules || 0}개 · 지난 회차 메인표 {rsd.wrote || 0}칸 · 주간장부 {rsd.ledger || 0}건
                                                </div>
                                            )}
                                            {rs.stale && (
                                                <div style={{ paddingLeft: 16, color: '#b45309', fontWeight: 700 }}>※ 주기보다 오래 소식이 없습니다 — NAS의 pms-reader 컨테이너가 멈췄는지 확인해 주세요.</div>
                                            )}
                                            {rsd && Array.isArray(rsd.errors) && rsd.errors.length > 0 && (
                                                <div style={{ paddingLeft: 16, color: '#dc2626' }} title={rsd.errors.join('\n')}>오류 {rsd.errors.length}건 — {rsd.errors[0]}</div>
                                            )}
                                        </div>
                                    );
                                })()}

                                {/* 이 프로젝트의 폴더 (2026-07-31 팀장님 결정) — 프로젝트마다 클라우드 폴더를 따로 둔다.
                                    규칙(파일 이름 조각)은 이 폴더 안에서만 파일을 찾으므로, 프로젝트가 늘어도 남의 파일이 안 걸린다. */}
                                {!NAS_SYNC_ENABLED && (() => {
                                    const dirs = (readerStatus && Array.isArray(readerStatus.dirs)) ? readerStatus.dirs : [];
                                    const curDir = extFolderDraft !== null ? extFolderDraft : (ex.folder || '');
                                    const dirty = extFolderDraft !== null && extFolderDraft !== (ex.folder || '');
                                    return (
                                    <div style={{ marginBottom: 13 }}>
                                        <div style={secT}>{secNo()} 이 프로젝트의 폴더 (클라우드)</div>
                                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                            <select style={{ ...inSt, background: isAdmin ? '#fff' : '#f8fafc' }} disabled={!isAdmin}
                                                value={curDir} onChange={e => setExtFolderDraft(e.target.value)}>
                                                <option value="">(지정 안 함 — 폴더 전체에서 찾음)</option>
                                                {dirs.map(d => <option key={d} value={d}>{d}</option>)}
                                                {ex.folder && !dirs.includes(ex.folder) && <option value={ex.folder}>{ex.folder}  ← 클라우드에 없는 폴더!</option>}
                                            </select>
                                            {dirty && isAdmin && (
                                                <button style={bSt('#059669', '#059669', '#fff')}
                                                    onClick={async () => { await extSaveSync(exRow, { folder: extFolderDraft }); setExtFolderDraft(null); }}>저장</button>
                                            )}
                                            {dirty && <button style={bSt('#fff', '#cbd5e1', '#475569')} onClick={() => setExtFolderDraft(null)}>취소</button>}
                                        </div>
                                        <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 4, lineHeight: 1.5 }}>
                                            이 프로젝트 자료가 들어 있는 클라우드 폴더입니다. 규칙은 <b>이 폴더(와 하위) + 맨 위(공통 자리)</b> 에서만 파일을 찾습니다.<br/>
                                            <b>파일 두는 자리</b> — 이 프로젝트 전용 파일은 <b>프로젝트 폴더</b>에, 여러 프로젝트가 같이 쓰는 파일(예: 01 진행현황_P9_10…)은 <b>맨 위</b>에 두세요.<br/>
                                            {dirs.length === 0
                                                ? <>클라우드에 하위 폴더가 아직 없습니다 — OneDrive의 '{readerStatus?.folder || 'PMS진척자료'}' 안에 프로젝트 폴더를 만들고 파일을 옮기면 여기 목록에 나타납니다.</>
                                                : <>지정하지 않으면 폴더 전체에서 찾습니다 — 프로젝트가 여럿이면 <b>다른 프로젝트 파일이 잡힐 수 있으니</b> 지정하는 편이 안전합니다.</>}
                                        </div>
                                    </div>
                                    );
                                })()}

                                {/* 클라우드 원본 파일 — 오피스365가 파일마다 주는 웹주소(webUrl)로 바로 연다 (2026-07-31).
                                    NAS 방식의 [엑셀로 열기]는 WebDAV 주소가 필요했지만, 오피스365는 웹주소가 이미 있어 그대로 쓴다. */}
                                {!NAS_SYNC_ENABLED && readerStatus && Array.isArray(readerStatus.files) && readerStatus.files.length > 0 && (() => {
                                    // 파일 목록은 '폴더 전체'라 프로젝트가 늘면 남의 파일까지 다 보인다 (2026-07-31 팀장님 지적).
                                    //   → 기본은 이 프로젝트의 규칙이 실제로 읽는 파일만. 규칙이 없으면(새 프로젝트) 전체를 보여준다
                                    //     — 규칙을 만들려면 폴더에 어떤 파일이 있는지 봐야 하므로.
                                    const nrmF = (v) => String(v ?? '').replace(/\s+/g, '').toUpperCase();
                                    const usedOf = (f) => exRules.filter(r => r.filePattern && nrmF(f.name).includes(nrmF(r.filePattern))).map(r => r.target);
                                    const allF = readerStatus.files;
                                    // 이 프로젝트 폴더로 먼저 좁힌다 (리더의 in_dir 과 같은 규칙: 그 폴더 또는 그 하위)
                                    const rowDir = String(ex.folder || '').replace(/^\/+|\/+$/g, '');
                                    // 리더의 in_dir 과 같은 규칙: 이 프로젝트 폴더(와 하위) + 맨 위(공통 자리)
                                    const inDir = (f) => !rowDir || !String(f.dir || '') || String(f.dir || '') === rowDir || String(f.dir || '').startsWith(rowDir + '/');
                                    const scopedF = allF.filter(inDir);
                                    const mineF = scopedF.filter(f => usedOf(f).length > 0);
                                    // 폴더를 지정했으면 그 폴더 파일 전부, 아니면 규칙이 읽는 파일만 (없으면 전체)
                                    const baseF = rowDir ? scopedF : mineF;
                                    const showAll = showAllFiles || baseF.length === 0;
                                    const listF = showAll ? allF : baseF;
                                    return (
                                    <div style={{ marginBottom: 13 }}>
                                        <div style={secT}>{secNo()} {showAll
                                            ? `클라우드 폴더 파일 전체 (${allF.length}개 · '${readerStatus.folder}')`
                                            : (rowDir ? `이 프로젝트 폴더의 파일 (${baseF.length}개 · '${rowDir}')` : `이 프로젝트가 읽는 파일 (${baseF.length}개)`)}</div>
                                        {showAll && (
                                            <div style={{ fontSize: 10.5, color: '#94a3b8', margin: '-2px 0 6px' }}>
                                                {baseF.length === 0
                                                    ? <>※ 이 프로젝트 폴더·규칙에 걸리는 파일이 아직 없어 <b>폴더에 있는 파일 전부</b>를 보여줍니다. 위에서 <b>폴더</b>를 고르거나, 아래 규칙의 <b>'파일 이름 조각'</b>을 여기서 정하세요.</>
                                                    : <>※ <b>다른 프로젝트 파일까지 포함한 폴더 전체</b>입니다.</>}
                                            </div>
                                        )}
                                        {listF.map((f, i) => {
                                            const usedBy = usedOf(f);
                                            return (
                                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 9px', marginBottom: 4, background: usedBy.length ? '#f0f7ff' : '#f8fafc', border: '1px solid ' + (usedBy.length ? '#bcd6f0' : '#e2e8f0'), borderRadius: 6 }}>
                                                <FileSpreadsheet size={13} style={{ color: usedBy.length ? '#1e7ac8' : '#94a3b8', flexShrink: 0 }}/>
                                                <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.rel || f.name}>
                                                    {showAll && f.dir ? <span style={{ color: '#94a3b8' }}>{f.dir}/</span> : null}{f.name}
                                                </span>
                                                {rowDir && !f.dir && (
                                                    <span style={{ fontSize: 10, fontWeight: 800, color: '#92400e', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 4, padding: '1px 5px', whiteSpace: 'nowrap' }}
                                                        title="맨 위(공통 자리)에 있는 파일입니다 — 여러 프로젝트가 같이 씁니다">공통</span>
                                                )}
                                                {usedBy.length > 0 && (
                                                    <span style={{ fontSize: 10, fontWeight: 800, color: '#0369a1', background: '#e0f2fe', border: '1px solid #bae6fd', borderRadius: 4, padding: '1px 5px', whiteSpace: 'nowrap' }}
                                                        title={`이 프로젝트의 규칙이 이 파일을 읽습니다: ${usedBy.join(', ')}`}>이 프로젝트가 읽음 · {usedBy.join(', ')}</span>
                                                )}
                                                <span style={{ fontSize: 10.5, color: '#94a3b8', whiteSpace: 'nowrap' }}>{String(f.modified || '').replace('T', ' ')}</span>
                                                {f.webUrl
                                                    ? <button style={bSt('#059669', '#059669', '#fff')} title="오피스365 웹 엑셀로 이 파일을 엽니다 (새 탭)" onClick={() => window.open(f.webUrl, '_blank', 'noopener,noreferrer')}>엑셀 열기</button>
                                                    : <span style={{ fontSize: 10.5, color: '#cbd5e1', whiteSpace: 'nowrap' }}>주소 없음</span>}
                                            </div>
                                            );
                                        })}
                                        {baseF.length > 0 && allF.length > baseF.length && (
                                            <button style={{ background: 'none', border: 'none', color: '#1358a0', cursor: 'pointer', fontSize: 11, fontWeight: 700, padding: '2px 0' }}
                                                onClick={() => setShowAllFiles(v => !v)}>
                                                {showAll ? `↑ 이 프로젝트 것만 보기 (${baseF.length}개)` : `↓ 폴더 전체 보기 (${allF.length}개)`}
                                            </button>
                                        )}
                                        <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 5, lineHeight: 1.5 }}>
                                            웹 엑셀(브라우저)로 열립니다 — <b>오피스365 라이선스 계정으로 로그인</b>되어 있어야 합니다.<br/>
                                            웹 엑셀 화면 오른쪽 위 [편집] → [데스크톱 앱에서 열기]를 누르면 설치된 진짜 엑셀로도 열 수 있습니다.
                                        </div>
                                    </div>
                                    );
                                })()}

                                {/* NAS 폴더 주소 — NAS 방식 전용 (2026-07-31).
                                    오피스365 방식에서는 NAS 프로그램이 클라우드를 직접 읽으므로 이 PC가 알 주소가 없다. */}
                                {NAS_SYNC_ENABLED && (
                                <div style={{ marginBottom: 13 }}>
                                    <div style={secT}>{secNo()} NAS 폴더 주소 (전 직원 공통 · 표시용)</div>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        <input style={{ ...inSt, background: isAdmin ? '#fff' : '#f8fafc' }} readOnly={!isAdmin} title={extPathDraft !== null ? extPathDraft : (ex.uncPath || '')}
                                            placeholder="\\neconsys_pj\001 Project\..."
                                            value={extPathDraft !== null ? extPathDraft : (ex.uncPath || '')}
                                            onChange={e => isAdmin && setExtPathDraft(e.target.value)}/>
                                        <button style={bSt('#eaf2fb', '#bcd6f0', '#1358a0')}
                                            onClick={() => { const v = extPathDraft !== null ? extPathDraft : (ex.uncPath || ''); if (v) { navigator.clipboard?.writeText(v); setAlertMsg('경로가 복사되었습니다.\n탐색기 주소창에 붙여넣으면 폴더가 열립니다.'); setTimeout(() => setAlertMsg(''), 2500); } }}>복사</button>
                                        {isAdmin && extPathDraft !== null && extPathDraft !== (ex.uncPath || '') && (
                                            <button style={bSt('#059669', '#059669', '#fff')} onClick={async () => { await extSaveSync(exRow, { uncPath: extPathDraft }); setExtPathDraft(null); }}>저장</button>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                                        <input style={inSt} title={extLocalDraft !== null ? extLocalDraft : extLocalBase()}
                                            placeholder="이 PC용 주소(선택) — 예: Z:\001 Project\...\01 진척자료 (내 별명 드라이브)"
                                            value={extLocalDraft !== null ? extLocalDraft : extLocalBase()}
                                            onChange={e => setExtLocalDraft(e.target.value)}/>
                                        {extLocalDraft !== null && (
                                            <button style={bSt('#059669', '#059669', '#fff')} onClick={() => { try { localStorage.setItem(extLocalKey, String(extLocalDraft || '').trim()); } catch (er) {} setExtLocalDraft(null); setAlertMsg('이 PC용 주소 저장 완료!\n(이 PC에서만 사용 — 열기·경로 복사가 이 주소를 우선 씁니다)'); setTimeout(() => setAlertMsg(''), 2500); }}>저장</button>
                                        )}
                                    </div>
                                    <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 4 }}>회사 주소(\\neconsys_pj)가 이 PC에서 안 열리면 '이 PC용 주소' 칸에 드라이브 별명(Z:\...)을 넣어두세요 — [엑셀로 열기]·[경로 복사]가 이 주소를 우선 씁니다.</div>
                                    {(String(ex.sharedUncPath || '').trim() || isAdmin) && (<>
                                    <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
                                        <span style={{ fontSize: 10, fontWeight: 800, color: '#6d28d9', background: '#f5f3ff', border: '1px solid #c4b5fd', borderRadius: 4, padding: '1px 5px', flexShrink: 0 }}>공용</span>
                                        <input style={{ ...inSt, background: isAdmin ? '#fff' : '#f8fafc' }} readOnly={!isAdmin} title={extSharedPathDraft !== null ? extSharedPathDraft : (ex.sharedUncPath || '')}
                                            placeholder="공용 폴더 주소(전 직원 공통) — 공용 파일이 있는 폴더 (예: \\neconsys_pj\...\011 P10 ...\01 진척자료)"
                                            value={extSharedPathDraft !== null ? extSharedPathDraft : (ex.sharedUncPath || '')}
                                            onChange={e => isAdmin && setExtSharedPathDraft(e.target.value)}/>
                                        {isAdmin && extSharedPathDraft !== null && extSharedPathDraft !== (ex.sharedUncPath || '') && (
                                            <button style={bSt('#059669', '#059669', '#fff')} onClick={async () => { await extSaveSync(exRow, { sharedUncPath: String(extSharedPathDraft || '').trim() }); setExtSharedPathDraft(null); }}>저장</button>
                                        )}
                                    </div>
                                    <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 4 }}>공용 배지가 붙은 파일의 [엑셀로 열기]·[경로 복사]는 이 공용 폴더 주소를 씁니다 — 한 번 저장하면 전 직원이 이 모달에서 바로 엽니다.</div>
                                    </>)}
                                </div>
                                )}

                                <div style={{ marginBottom: 13 }}>
                                    <div style={secT}>{secNo()} 자동 반영 규칙</div>
                                    {exRules.length === 0 && <div style={{ fontSize: 12, color: '#94a3b8', padding: '4px 2px' }}>등록된 규칙 없음{isAdmin ? ' — 아래 [규칙 추가]로 등록하세요' : ''}</div>}
                                    {exRules.map((r, i) => (
                                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', marginBottom: 5, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 7 }}>
                                            <span style={{ fontSize: 12.5, fontWeight: 800, color: '#0369a1', whiteSpace: 'nowrap' }}>{r.target}</span>
                                            {(ex.lastApplied || {})[r.target]?.shared && <span style={{ fontSize: 9.5, fontWeight: 800, color: '#6d28d9', background: '#f5f3ff', border: '1px solid #c4b5fd', borderRadius: 4, padding: '0 4px', flexShrink: 0 }} title="다른 프로젝트 폴더(공용 폴더)에서 읽는 공용 파일입니다">공용</span>}
                                            <span style={{ fontSize: 11.5, color: '#475569', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                                title={r.type === 'subTable' ? `파일 '${r.filePattern}' → 시트 '${r.sheet}' → 공종 하위행 자동생성+6항목%·총점, 부모 5항목%·누적(HMI=기준정보생성)` : `파일 '${r.filePattern}' → 시트 '${r.sheet}' → 셀 ${(r.cells || []).join(', ')} ${r.op === 'sum' ? '합계' : '평균'}`}>
                                                {r.type === 'subTable'
                                                    ? <>← '{r.filePattern}' 최신 파일 · 시트 '{r.sheet}' · 공종 하위행+부모 총계 자동</>
                                                    : <>← '{r.filePattern}' 최신 파일 · 시트 '{r.sheet}' · {(r.cells || []).join(',')} {r.op === 'sum' ? '합계' : '평균'}</>}
                                            </span>
                                            {isAdmin && <button style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', padding: 2, fontWeight: 800 }} title="규칙 삭제"
                                                onClick={() => { if (window.confirm(`'${r.target}' 자동 규칙을 삭제할까요?\n(잠금이 풀리고 직접 수정 가능해집니다)`)) extSaveSync(exRow, { rules: exRules.filter((_, j) => j !== i) }); }}>✕</button>}
                                        </div>
                                    ))}
                                    {isAdmin && !extRuleDraft && (
                                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                            <button style={bSt('#f0f7ff', '#bcd6f0', '#1358a0')}
                                                onClick={() => setExtRuleDraft({ target: 'PLC', filePattern: '01 진행현황', sheet: '#1 L1 진행현황', cells: 'L5,M5,L14,M14', op: 'avg', decimals: 1 })}>+ 규칙 추가</button>
                                            {!exRules.some(r => r.type === 'subTable') && (
                                                <button style={bSt('#f5f0ff', '#c9b3f0', '#6d28d9')}
                                                    title="파일2(진척자료_YYMMDD) 진척률요약(Main) — 공종 8개 하위 행 자동 생성/갱신 + 부모 총계 반영"
                                                    onClick={async () => {
                                                        await extSaveSync(exRow, { rules: [...exRules, EXT_SUBTABLE_PRESET] });
                                                        setAlertMsg('하위 공종표 규칙 등록 완료!\n\n' + (NAS_SYNC_ENABLED
                                                            ? '[지금 확인]을 누르면 공종 하위 행 생성/갱신과\n부모 총계 반영 미리보기가 뜹니다.'
                                                            : '[지금 확인]을 누르면 20초 안에, 그냥 두면 15분 주기로\n부모 총계와 하위 8행 값이 자동 반영됩니다.\n(하위 행 자동 생성은 아직 미구현 — 하위 행이 있어야 갱신됩니다)'));
                                                    }}>+ 하위 공종표 규칙 (파일2)</button>
                                            )}
                                        </div>
                                    )}
                                    {isAdmin && extRuleDraft && (
                                        <div style={{ border: '1px dashed #7bb8e8', borderRadius: 8, padding: '10px 12px', marginTop: 4, background: '#fbfdff' }}>
                                            <div style={{ display: 'grid', gridTemplateColumns: '96px 1fr', gap: '7px 8px', alignItems: 'center', fontSize: 12 }}>
                                                <span style={{ color: '#475569', fontWeight: 700 }}>들어갈 칸</span>
                                                <select style={inSt} value={extRuleDraft.target} onChange={e => setExtRuleDraft(d => ({ ...d, target: e.target.value }))}>
                                                    {EXT_TARGET_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                                                </select>
                                                <span style={{ color: '#475569', fontWeight: 700 }}>파일 이름 조각</span>
                                                <input style={inSt} value={extRuleDraft.filePattern} onChange={e => setExtRuleDraft(d => ({ ...d, filePattern: e.target.value }))} placeholder="예: 01 진행현황 (이 글자가 든 최신 파일)"/>
                                                <span style={{ color: '#475569', fontWeight: 700 }}>시트 이름</span>
                                                <input style={inSt} value={extRuleDraft.sheet} onChange={e => setExtRuleDraft(d => ({ ...d, sheet: e.target.value }))} placeholder="예: #1 L1 진행현황"/>
                                                <span style={{ color: '#475569', fontWeight: 700 }}>셀 주소들</span>
                                                <input style={inSt} value={extRuleDraft.cells} onChange={e => setExtRuleDraft(d => ({ ...d, cells: e.target.value }))} placeholder="예: L5,M5,L14,M14 또는 F24:M25 (범위 가능, 쉼표 구분)"/>
                                                <span style={{ color: '#475569', fontWeight: 700 }}>계산</span>
                                                <div style={{ display: 'flex', gap: 6 }}>
                                                    <select style={{ ...inSt, width: 110 }} value={extRuleDraft.op} onChange={e => setExtRuleDraft(d => ({ ...d, op: e.target.value }))}>
                                                        <option value="avg">평균</option><option value="sum">합계</option>
                                                    </select>
                                                    <select style={{ ...inSt, width: 130 }} value={extRuleDraft.decimals} onChange={e => setExtRuleDraft(d => ({ ...d, decimals: Number(e.target.value) }))}>
                                                        <option value={0}>정수(90)</option><option value={1}>소수 1자리(89.6)</option><option value={2}>소수 2자리</option>
                                                    </select>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 9 }}>
                                                <button style={bSt('#fff', '#cbd5e1', '#475569')} onClick={() => setExtRuleDraft(null)}>취소</button>
                                                <button style={bSt('#059669', '#059669', '#fff')} onClick={async () => {
                                                    const cs = String(extRuleDraft.cells || '').split(',').map(s => s.trim().toUpperCase()).filter(s => /^[A-Z]{1,3}\d{1,5}(:[A-Z]{1,3}\d{1,5})?$/.test(s));   // 단일 셀 + 범위(F24:M25) 허용 (2026-07-22)
                                                    if (!cs.length) { setAlertMsg('셀 주소를 확인하세요 (예: L5,M5,L14,M14)'); return; }
                                                    if (!String(extRuleDraft.sheet || '').trim()) { setAlertMsg('시트 이름을 입력하세요'); return; }
                                                    if (exRules.some(r => String(r.target) === String(extRuleDraft.target))) { setAlertMsg(`'${extRuleDraft.target}' 규칙이 이미 있습니다. 기존 규칙을 삭제 후 추가하세요.`); return; }
                                                    await extSaveSync(exRow, { rules: [...exRules, { target: extRuleDraft.target, filePattern: String(extRuleDraft.filePattern || '').trim(), sheet: String(extRuleDraft.sheet).trim(), cells: cs, op: extRuleDraft.op, decimals: extRuleDraft.decimals }] });
                                                    setExtRuleDraft(null);
                                                    setAlertMsg(`규칙 저장 완료!\n${extRuleDraft.target} ← 시트 '${extRuleDraft.sheet}' ${cs.join(',')} ${extRuleDraft.op === 'sum' ? '합계' : '평균'}\n\n` + (NAS_SYNC_ENABLED ? '이제 아래에서 [폴더 지정]을 해주세요.' : '[지금 확인]을 누르면 20초 안에, 그냥 두면 15분 주기로\n자동 반영기가 클라우드 원본을 읽어 반영합니다.'));
                                                }}>규칙 저장</button>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* 오피스365 방식에서 이 섹션에 남는 건 [NAS 잔재 정리](관리자 전용)뿐 → 일반 직원에겐 통째로 숨김 (2026-07-31) */}
                                {(NAS_SYNC_ENABLED || isAdmin) && (
                                <div style={{ marginBottom: 13 }}>
                                    <div style={secT}>{secNo()} {NAS_SYNC_ENABLED ? '이 PC 연결 (폴더 읽기 허가증 — PC마다 1회)' : '관리 (관리자)'}</div>
                                    {/* 상태 점 — 이 PC가 파일을 읽었을 때만 의미가 있다. 오피스365 방식은 NAS가 읽으므로 숨김 (2026-07-31) */}
                                    {NAS_SYNC_ENABLED && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8, fontSize: 12, color: '#334155' }}>
                                        <span style={{ width: 9, height: 9, borderRadius: '50%', background: dotColor, flexShrink: 0 }}/>
                                        <span style={{ flex: 1, minWidth: 0 }}>
                                            {st ? (st.msg || st.state) : '아직 확인 안 함'}
                                            {st?.fileName ? <span style={{ color: '#94a3b8' }}> · {st.fileName}</span> : null}
                                            {st?.checkedAt ? <span style={{ color: '#b6c2d0' }}> · {new Date(st.checkedAt).toLocaleTimeString()}</span> : null}
                                        </span>
                                    </div>
                                    )}
                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                        {/* 폴더 지정 · 지금 확인 · 이 PC 지정 해제 = 브라우저가 직접 파일을 읽는 NAS 방식 전용 (2026-07-31) */}
                                        {NAS_SYNC_ENABLED && (<>
                                        <button style={bSt('#1e7ac8', '#1e7ac8', '#fff')} disabled={extBusy} onClick={() => extPickFolder(exRow)}>폴더 지정/변경</button>
                                        <button style={bSt('#f5f3ff', '#c4b5fd', '#6d28d9')} disabled={extBusy} title="다른 프로젝트 폴더에 있는 공용 엑셀(예: P9·P10 공용 01 진행현황)을 읽어야 할 때만 지정합니다 — 자기 폴더에서 먼저 찾고, 없는 파일만 공용 폴더에서 찾습니다." onClick={() => extPickSharedFolder(exRow)}>공용 폴더(선택)</button>
                                        <button style={bSt('#eaf2fb', '#bcd6f0', '#1358a0')} disabled={extBusy} onClick={async () => {
                                            if (!extRulesRawOf(exRow).length) { setAlertMsg('아직 자동 반영 규칙이 없습니다.\n\n위 ② [+ 규칙 추가] → [규칙 저장]을 먼저 해주세요.\n(폼에 파일1 규칙이 미리 채워져 있습니다)'); return; }
                                            const ps = await extCheckRow(exRow, { silent: false });
                                            if (ps.length) setExtProposals(ps);
                                            else { const s2 = extStatus[exRow._id]; if (!s2 || s2.state === 'ok') { setAlertMsg('확인 완료 — 변경 없음 (메인표가 최신)'); setTimeout(() => setAlertMsg(''), 2500); } }
                                        }}>{extBusy ? '확인 중...' : '지금 확인'}</button>
                                        <button style={bSt('#fff', '#e2c4c4', '#b91c1c')} disabled={extBusy} onClick={async () => { await extIdbDel(extHandleKey(exRow._id)); await extIdbDel(extHandleKey(exRow._id) + '::shared'); extSetStatus(exRow._id, { state: 'nofolder', msg: '이 PC 지정 해제됨 (공용 폴더 포함)' }); }}>이 PC 지정 해제</button>
                                        </>)}
                                        {/* NAS 잔재 정리 (2026-07-30) — 표시용 주소·과거 반영기록(lastApplied)·이 PC 폴더 핸들만 지움. 규칙은 파일명·시트·셀 기준이라 유지 */}
                                        {isAdmin && (
                                        <button style={bSt('#fffbeb', '#f0c98c', '#92400e')} disabled={extBusy} title="표시용 NAS 주소 + 과거 반영기록 + 이 PC 폴더 지정을 지웁니다. 자동 반영 규칙은 그대로 유지됩니다." onClick={async () => {
                                            try {
                                                const nGhost = Object.keys((exRow._extSync || {}).lastApplied || {}).length;
                                                const nRules = extRulesRawOf(exRow).length;
                                                await setDoc(rowDocRef(currentTeam, exRow._id), stampSave({ _extSync: { ...(exRow._extSync || {}), uncPath: deleteField(), lastApplied: deleteField() } }), { merge: true });
                                                await extIdbDel(extHandleKey(exRow._id));
                                                await extIdbDel(extHandleKey(exRow._id) + '::shared');
                                                setExtPathDraft(null);
                                                extSetStatus(exRow._id, { state: 'nofolder', msg: 'NAS 잔재 정리됨 — [폴더 지정/변경]으로 새 폴더를 지정하세요' });
                                                recordAudit(AUDIT_ACTIONS.EDIT, exRow, [{ field: 'NAS 잔재 정리', from: `주소·반영기록 ${nGhost}건`, to: '삭제' }]);
                                                setAlertMsg(`NAS 잔재를 정리했습니다.\n\n· 표시용 NAS 주소 삭제\n· 과거 반영기록 ${nGhost}건 삭제 (찾은 파일 중복 표시 해소)\n· 이 PC 폴더 지정 해제\n\n자동 반영 규칙 ${nRules}개는 유지했습니다.\n(규칙은 파일명·시트·셀 기준이라 NAS/OneDrive 어느 쪽에서도 그대로 동작합니다)\n\n이제 [폴더 지정/변경]으로 OneDrive 폴더를 지정하세요.`);
                                            } catch (e) { setAlertMsg('NAS 잔재 정리 오류: ' + e.message); }
                                        }}>NAS 잔재 정리</button>
                                        )}
                                    </div>
                                    {/* 찾은 원본 파일 목록 — [엑셀로 열기]가 NAS WebDAV 주소 전용이라 NAS 방식에서만 표시 (2026-07-31) */}
                                    {NAS_SYNC_ENABLED && (() => {
                                        const seen = {};
                                        const files = [];
                                        (st && st.files ? st.files : []).forEach(f => { if (f && f.rel && !seen[f.rel]) { seen[f.rel] = 1; files.push(f); } });
                                        Object.values(ex.lastApplied || {}).forEach(v => { if (v && v.rel && !seen[v.rel]) { seen[v.rel] = 1; files.push({ name: v.fileName, rel: v.rel, shared: !!v.shared }); } });
                                        // ★ 같은 파일 계열(이름에서 날짜 6자리만 다른 것)은 최신 날짜 1개만 표시 (2026-08-19 팀장님):
                                        //   '마지막 자동 반영' 기록에 남은 옛 날짜 파일(값이 안 바뀌어 재기록 안 됨)이 새 파일과 나란히 떠서
                                        //   직원이 헷갈림. 시스템은 원래 최신만 읽음(pickLatestExtFile) — 표시만 그 규칙에 맞춤.
                                        const famKey = (f) => String(f.name || '').toLowerCase().replace(/\s+/g, '').replace(/\d{6}(?!.*\d{6})/, '');
                                        const fam = {};
                                        files.forEach(f => {
                                            const k = famKey(f);
                                            if (!fam[k] || extNameDate(f.name) > extNameDate(fam[k].name)) fam[k] = f;
                                        });
                                        const shown = files.filter(f => fam[famKey(f)] === f);
                                        if (!shown.length) return null;
                                        return (
                                            <div style={{ marginTop: 9 }}>
                                                <div style={{ fontSize: 10.5, fontWeight: 800, color: '#64748b', marginBottom: 4 }}>찾은 원본 파일 — [엑셀로 열기]=바로 편집·저장(NAS 원본) · [경로 복사]=Win+R/탐색기용</div>
                                                {shown.map((f, i) => (
                                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 9px', marginBottom: 4, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6 }}>
                                                        <FileSpreadsheet size={13} style={{ color: '#1e7ac8', flexShrink: 0 }}/>
                                                        <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.rel}>{f.name}</span>
                                                        {f.shared && <span style={{ fontSize: 10, fontWeight: 800, color: '#6d28d9', background: '#f5f3ff', border: '1px solid #c4b5fd', borderRadius: 4, padding: '1px 5px', flexShrink: 0 }} title="공용 폴더에서 읽는 파일 — ① 공용 폴더 주소가 저장돼 있으면 여기서 바로 열 수 있습니다">공용</span>}
                                                        <button style={bSt('#059669', '#059669', '#fff')} title="진짜 엑셀 프로그램으로 NAS 원본을 바로 열기 — 수정 후 Ctrl+S 하면 원본에 저장됩니다" onClick={() => {
                                                            if (f.shared && !String(ex.sharedUncPath || '').trim()) { setAlertMsg('공용 폴더에서 읽는 파일입니다.\n위 ① 공용 폴더 주소(전 직원 공통)를 저장하면 여기서 바로 열 수 있습니다.'); return; }
                                                            const u = davUrlFor(f.rel, f.shared ? ex.sharedUncPath : '');
                                                            if (!u) { setAlertMsg('① NAS 폴더 주소(또는 이 PC용 주소)를 먼저 저장해주세요.'); return; }
                                                            try { window.location.href = 'ms-excel:ofe|u|' + u; } catch (er) {}
                                                            // 안내창은 이 PC 최초 1회만 — 이후엔 조용히 엑셀만 연다 (2026-08-24 팀장님)
                                                            if (!localStorage.getItem('pms_excel_open_hint')) {
                                                                try { localStorage.setItem('pms_excel_open_hint', '1'); } catch (eh) {}
                                                                setAlertMsg(`'${f.name}'\n진짜 엑셀로 여는 중... (안 열리면 이 PC 1회 준비 필요)\n처음이면 로그인 창에 NAS 계정을 입력하세요.\n\n(이 안내는 이 PC에서 처음 한 번만 표시됩니다)`);
                                                                setTimeout(() => setAlertMsg(''), 3500);
                                                            }
                                                        }}>엑셀로 열기</button>
                                                        <button style={bSt('#eaf2fb', '#bcd6f0', '#1358a0')} onClick={() => {
                                                            if (f.shared && !String(ex.sharedUncPath || '').trim()) { setAlertMsg('공용 폴더에서 읽는 파일입니다.\n위 ① 공용 폴더 주소(전 직원 공통)를 저장하면 여기서 바로 복사할 수 있습니다.'); return; }
                                                            if (!f.shared && !extBase()) { setAlertMsg('① NAS 폴더 주소(또는 이 PC용 주소)를 먼저 저장해주세요.'); return; }
                                                            navigator.clipboard?.writeText('"' + extJoin(f.shared ? ex.sharedUncPath : extBase(), f.rel) + '"');
                                                            setAlertMsg(`'${f.name}'\n경로가 복사되었습니다 (따옴표 포함).\nWin+R 또는 탐색기 주소창에 붙여넣고 엔터 → 엑셀이 열립니다.`);
                                                            setTimeout(() => setAlertMsg(''), 3000);
                                                        }}>경로 복사</button>
                                                    </div>
                                                ))}
                                            </div>
                                        );
                                    })()}
                                    <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 7, lineHeight: 1.5 }}>
                                        {NAS_SYNC_ENABLED ? (<>
                                        담당 PC 한 대만 지정해도 그 PC에서 List를 열 때마다 팀 전체 값이 최신으로 유지됩니다.<br/>
                                        <b>하위 폴더까지 자동으로</b> 찾습니다 (Backup·백업 폴더 제외) · 브라우저를 껐다 켠 뒤에는 [지금 확인]에서 허용 1번이 필요할 수 있습니다.<br/>
                                        [엑셀로 열기]는 PC마다 1회 준비(NAS 주소·Office 예외 등록)가 필요합니다 — 준비 전 PC는 [경로 복사]를 쓰세요.
                                        </>) : (<>
                                        [NAS 잔재 정리] = 옛 NAS 방식이 남긴 <b>표시용 주소 · 과거 반영기록 · 이 PC 폴더 지정</b>만 지웁니다. <b>자동 반영 규칙은 그대로 유지</b>됩니다.<br/>
                                        규칙은 파일 이름 조각 · 시트 · 셀 기준이라, 원본이 NAS에 있든 오피스365 클라우드에 있든 똑같이 동작합니다.
                                        </>)}
                                    </div>
                                </div>
                                )}

                                {ex.lastApplied && Object.keys(ex.lastApplied).length > 0 && (
                                    <div>
                                        <div style={secT}>{secNo()} 마지막 자동 반영{NAS_SYNC_ENABLED ? '' : ' (칸별 · 값이 바뀐 시각)'}</div>
                                        {Object.entries(ex.lastApplied).map(([k, v]) => (
                                            <div key={k} style={{ fontSize: 11.5, color: '#475569', padding: '3px 2px' }}>
                                                <b style={{ color: '#0369a1' }}>{k}</b> = {String(v.value)} · <span style={{ color: '#94a3b8' }}>{v.fileName}</span>{v.shared ? <span style={{ color: '#6d28d9', fontWeight: 800 }}> (공용)</span> : null} · {v.at ? new Date(v.at).toLocaleString() : ''}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* 진행현황 관리 모달 (2026-07-06 2단계) */}
            {statusMgr && (
                <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setStatusMgr(null)}>
                    <div className="bg-white rounded-xl shadow-2xl w-[420px] max-w-[95vw] max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-5 py-3" style={{background:'#1e7ac8',color:'#fff'}}>
                            <span className="font-bold text-sm flex items-center gap-2"><ListChecks size={16}/> 진행현황 관리</span>
                            <button onClick={() => setStatusMgr(null)} style={{background:'none',border:'none',color:'#fff',cursor:'pointer'}}><X size={16}/></button>
                        </div>
                        <div className="px-4 py-2 text-[11px] text-slate-500 bg-slate-50 border-b border-slate-200">칩·필터·드롭다운에 쓰이는 List 진행현황 목록 (월간보고와 별개). <b className="text-slate-600">기존 이름은 원본 엑셀 기준이라 고정</b> — 추가·삭제만 됩니다. 위아래 순서 = 표시 순서.</div>
                        <div className="flex-1 overflow-y-auto p-3 space-y-2">
                            {statusMgr.map((s, i) => {
                                const locked = statusMgrOrigSet.has(s); // 원본에 있던 기존 이름 → 잠금(수정 불가)
                                const curColor = statusMgrColors[s] || STATUS_COLOR_PRESETS[8];
                                const used = countStatusUse(s);
                                const canDel = !locked || used === 0; // 잠긴(기존) 이름은 사용 0개일 때만 삭제 가능
                                const confirming = statusDelIdx === i;
                                return (
                                <div key={i} className="rounded" style={confirming ? {background:'#fef2f2',border:'1px solid #fecaca',padding:'6px'} : {}}>
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-slate-400 text-xs w-5 text-center">{i+1}</span>
                                    {locked ? (
                                        <div className="flex-1 flex items-center gap-1.5 px-2 py-1 bg-slate-100 border border-slate-200 rounded">
                                            <span className="text-sm text-slate-700">{s}</span>
                                            <span className="text-[10px] text-slate-400 ml-auto">🔒 기존 · 이름 고정</span>
                                        </div>
                                    ) : (
                                        <input value={s} onChange={e => setStatusMgr(arr => arr.map((x,j) => j===i ? e.target.value : x))}
                                            className="flex-1 border border-[#1e7ac8] rounded px-2 py-1 text-sm outline-none focus:border-[#1e7ac8]" placeholder="새 진행현황 이름"/>
                                    )}
                                    <button type="button" title="색 바꾸기" onClick={() => { setStatusColorOpenIdx(statusColorOpenIdx===i?null:i); setStatusDelIdx(null); }}
                                        className="shrink-0 rounded-full border border-slate-300 hover:border-slate-500" style={{width:'20px',height:'20px',background:curColor.activeBg}}/>
                                    <button onClick={() => setStatusMgr(arr => { if(i<=0) return arr; const a=[...arr]; const t=a[i-1]; a[i-1]=a[i]; a[i]=t; return a; })} disabled={i===0} className="px-1 text-slate-500 disabled:opacity-30 font-bold">↑</button>
                                    <button onClick={() => setStatusMgr(arr => { if(i>=arr.length-1) return arr; const a=[...arr]; const t=a[i+1]; a[i+1]=a[i]; a[i]=t; return a; })} disabled={i===statusMgr.length-1} className="px-1 text-slate-500 disabled:opacity-30 font-bold">↓</button>
                                    <button
                                        title={canDel ? '목록에서 빼기' : `${used}개 행에서 사용 중 — 먼저 그 프로젝트들의 진행현황을 바꿔야 지울 수 있어요`}
                                        disabled={!canDel}
                                        onClick={() => { if (!canDel) return; setStatusDelIdx(i); setStatusColorOpenIdx(null); }}
                                        className={`px-1.5 font-bold ${canDel ? 'text-rose-500' : 'text-slate-300 cursor-not-allowed'}`}>✕</button>
                                  </div>
                                  {confirming && (
                                    <div className="flex items-center gap-2 mt-1.5 pl-7">
                                        <span className="text-[12px] text-rose-700 mr-auto">'{s}'{used>0?` (${used}개 사용)`:''}를 목록에서 뺄까요?</span>
                                        <button onClick={() => { setStatusMgr(arr => arr.filter((_,j) => j!==i)); setStatusDelIdx(null); }}
                                            className="text-[12px] px-3 py-0.5 bg-rose-600 text-white rounded font-bold hover:bg-rose-700">예</button>
                                        <button onClick={() => setStatusDelIdx(null)}
                                            className="text-[12px] px-3 py-0.5 bg-slate-200 text-slate-600 rounded font-bold hover:bg-slate-300">아니오</button>
                                    </div>
                                  )}
                                  {statusColorOpenIdx === i && (
                                    <div className="flex flex-wrap gap-2 mt-2 pl-7">
                                        {STATUS_COLOR_PRESETS.map((p, pi) => {
                                            const sel = p.activeBg === curColor.activeBg;
                                            return (
                                                <button key={pi} type="button" title={p.label}
                                                    onClick={() => { setStatusMgrColors(m => ({...m, [s]: p})); setStatusColorOpenIdx(null); }}
                                                    className="rounded-full flex items-center justify-center"
                                                    style={{width: sel?'26px':'22px', height: sel?'26px':'22px', background:p.activeBg, border: sel?'2px solid #1e293b':'1px solid rgba(0,0,0,0.15)'}}>
                                                    {sel && <span style={{color:'#fff',fontSize:'13px',lineHeight:1}}>✓</span>}
                                                </button>
                                            );
                                        })}
                                    </div>
                                  )}
                                </div>
                                );
                            })}
                            <button onClick={() => setStatusMgr(arr => [...arr, ''])}
                                className="w-full border border-dashed border-[#1e7ac8] text-[#1e7ac8] rounded py-1.5 text-xs font-bold hover:bg-blue-50">+ 새 진행현황 추가</button>
                        </div>
                        <div className="flex gap-2 px-4 py-3 border-t border-slate-200 bg-slate-50">
                            <button onClick={saveStatusMgr} className="flex-1 bg-emerald-600 text-white rounded py-2 text-sm font-bold hover:bg-emerald-700">저장</button>
                            <button onClick={() => setStatusMgr(null)} className="px-5 bg-slate-200 text-slate-700 rounded py-2 text-sm font-bold hover:bg-slate-300">닫기</button>
                        </div>
                    </div>
                </div>
            )}
            {/* 담당자 관리 모달 (2026-07-07 3단계) */}
            {managerMgr && (
                <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setManagerMgr(null)}>
                    <div className="bg-white rounded-xl shadow-2xl w-[420px] max-w-[95vw] max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-5 py-3" style={{background:'#1e7ac8',color:'#fff'}}>
                            <span className="font-bold text-sm flex items-center gap-2"><Users size={16}/> 담당자 관리</span>
                            <button onClick={() => setManagerMgr(null)} style={{background:'none',border:'none',color:'#fff',cursor:'pointer'}}><X size={16}/></button>
                        </div>
                        <div className="px-4 py-2 text-[11px] text-slate-500 bg-slate-50 border-b border-slate-200">필터·드롭다운에 쓰이는 List 담당자 목록. <b className="text-slate-600">기존 이름은 고정</b> — 추가·삭제만 됩니다. 위아래 순서 = 표시 순서.</div>
                        <div className="flex-1 overflow-y-auto p-3 space-y-2">
                            {managerMgr.map((s, i) => {
                                const locked = managerMgrOrigSet.has(s); // 원본에 있던 기존 담당자 → 잠금(수정 불가)
                                const used = countManagerUse(s);
                                const canDel = !locked || used === 0; // 잠긴(기존) 이름은 배정 0명일 때만 삭제 가능
                                const confirming = managerDelIdx === i;
                                return (
                                <div key={i} className="rounded" style={confirming ? {background:'#fef2f2',border:'1px solid #fecaca',padding:'6px'} : {}}>
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-slate-400 text-xs w-5 text-center">{i+1}</span>
                                    {locked ? (
                                        <div className="flex-1 flex items-center gap-1.5 px-2 py-1 bg-slate-100 border border-slate-200 rounded">
                                            <span className="text-sm text-slate-700">{toExcelAssignee(s)}</span>
                                            <span className="text-[10px] text-slate-400 ml-auto">🔒 기존 · 이름 고정</span>
                                        </div>
                                    ) : (
                                        <input value={s} onChange={e => setManagerMgr(arr => arr.map((x,j) => j===i ? e.target.value : x))}
                                            className="flex-1 border border-[#1e7ac8] rounded px-2 py-1 text-sm outline-none focus:border-[#1e7ac8]" placeholder="새 담당자 이름"/>
                                    )}
                                    <button onClick={() => setManagerMgr(arr => { if(i<=0) return arr; const a=[...arr]; const t=a[i-1]; a[i-1]=a[i]; a[i]=t; return a; })} disabled={i===0} className="px-1 text-slate-500 disabled:opacity-30 font-bold">↑</button>
                                    <button onClick={() => setManagerMgr(arr => { if(i>=arr.length-1) return arr; const a=[...arr]; const t=a[i+1]; a[i+1]=a[i]; a[i]=t; return a; })} disabled={i===managerMgr.length-1} className="px-1 text-slate-500 disabled:opacity-30 font-bold">↓</button>
                                    <button title={canDel ? '목록에서 빼기' : `${used}명이 배정돼 있어요 — 먼저 그 프로젝트들의 담당자를 바꿔야 지울 수 있어요`}
                                        disabled={!canDel}
                                        onClick={() => { if (!canDel) return; setManagerDelIdx(i); }}
                                        className={`px-1.5 font-bold ${canDel ? 'text-rose-500' : 'text-slate-300 cursor-not-allowed'}`}>✕</button>
                                  </div>
                                  {confirming && (
                                    <div className="flex items-center gap-2 mt-1.5 pl-7">
                                        <span className="text-[12px] text-rose-700 mr-auto">'{s}'를 목록에서 뺄까요?</span>
                                        <button onClick={() => { setManagerMgr(arr => arr.filter((_,j) => j!==i)); setManagerDelIdx(null); }}
                                            className="text-[12px] px-3 py-0.5 bg-rose-600 text-white rounded font-bold hover:bg-rose-700">예</button>
                                        <button onClick={() => setManagerDelIdx(null)}
                                            className="text-[12px] px-3 py-0.5 bg-slate-200 text-slate-600 rounded font-bold hover:bg-slate-300">아니오</button>
                                    </div>
                                  )}
                                </div>
                                );
                            })}
                            <button onClick={() => setManagerMgr(arr => [...arr, ''])}
                                className="w-full border border-dashed border-[#1e7ac8] text-[#1e7ac8] rounded py-1.5 text-xs font-bold hover:bg-blue-50">+ 새 담당자 추가</button>
                        </div>
                        <div className="flex gap-2 px-4 py-3 border-t border-slate-200 bg-slate-50">
                            <button onClick={saveManagerMgr} className="flex-1 bg-emerald-600 text-white rounded py-2 text-sm font-bold hover:bg-emerald-700">저장</button>
                            <button onClick={() => setManagerMgr(null)} className="px-5 bg-slate-200 text-slate-700 rounded py-2 text-sm font-bold hover:bg-slate-300">닫기</button>
                        </div>
                    </div>
                </div>
            )}
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".xlsx,.xls" className="hidden"/>
            <input type="file" ref={userFileRef} onChange={handleUserExcelPick} accept=".xlsx,.xls" className="hidden"/>
            <input type="file" ref={histFileRef} onChange={handleHistoryImportPick} accept=".xlsx,.xls" className="hidden"/>
            <input type="file" ref={yearFileRef} onChange={handleYearFilePick} accept=".xlsx,.xls" className="hidden"/>
            <input type="file" ref={restoreFileRef} onChange={handleRestorePick} accept=".json" className="hidden"/>

            {/* ── 헤더 (월간업무보고 동일 스타일) ── */}
            <header className="flex flex-row flex-wrap justify-between items-center gap-2 mb-2 shrink-0 relative z-50">
                {/* 왼쪽: 홈·팀 탭 + 타이틀 + 연도 + 카운트 */}
                <div className="flex items-center gap-2 min-w-0 shrink-0">
                    {/* 팀 탭 제거 (2026-08-31 팀장님) — 팀 전환은 제목 옆 ▾ 드롭다운, 홈은 오른쪽 버튼줄로 이동 */}
                    <div className="p-2 bg-[#1e7ac8] rounded-xl shadow-sm text-white shrink-0">
                        <ListChecks size={20}/>
                    </div>
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                        <div className="relative shrink-0">
                            <h1 onClick={() => setTeamDropOpen(v => !v)} title="팀 전환 — 클릭"
                                className="text-base font-bold text-gray-800 tracking-tight flex items-center gap-1 whitespace-nowrap cursor-pointer select-none">
                                {currentTeam} <ChevronDown size={13} className="text-slate-400"/> 프로젝트 List
                            </h1>
                            {teamDropOpen && (<>
                                <div className="fixed inset-0 z-40" onClick={() => setTeamDropOpen(false)}/>
                                <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-[#dde2e9] rounded-lg shadow-lg py-1 min-w-[130px]">
                                    {LIST_TEAMS.map(t => (
                                        <button key={t} onClick={() => { setTeamDropOpen(false); switchTeam(t); }}
                                            className={`w-full text-left px-3.5 py-1.5 text-[12px] font-bold hover:bg-blue-50 transition-colors ${t === currentTeam ? 'text-[#1e7ac8]' : 'text-[#37352f]'}`}>
                                            {t}{t === currentTeam ? ' ✓' : ''}
                                        </button>
                                    ))}
                                </div>
                            </>)}
                        </div>
                        {/* 연도 선택 — 월선택기·그달만/이전전체 토글을 연도 선택기로 단순화 (2026-07-06, List 실제 필터는 연도만) */}
                        <div className="flex items-center px-2 py-1 rounded bg-gray-50 hover:bg-gray-100 transition-all cursor-pointer shrink-0">
                            <Calendar size={11} className="text-[#1e7ac8] mr-1" />
                            <span className="text-[11px] font-bold text-gray-500 mr-1">기준연도:</span>
                            <select
                                value={selectedYear}
                                onChange={e => { setSelectedYear(e.target.value); setColumnFilters({}); setSortConfig({key:null,dir:'asc'}); setActiveStatusChips(new Set()); setActiveAssignees(new Set()); setActiveManagers(new Set()); }}
                                className="bg-transparent border-none text-gray-700 text-[11px] font-bold outline-none color-scheme-light cursor-pointer">
                                {(availableYears.length ? availableYears : [selectedYear]).map(y => <option key={y} value={y}>{y}년</option>)}
                            </select>
                        </div>
                        {/* 기준월 (2026-07-13) — 기준 날짜 = 메인표 '공사 계약' 칸.
                            전체=모든 월 / N월=그 달만 / 기타=년·월·일 하나라도 없는 행(빈칸 포함) */}
                        <div className="flex items-center px-2 py-1 rounded bg-gray-50 hover:bg-gray-100 transition-all cursor-pointer shrink-0"
                             title="기준 날짜 = 공사 계약. 월은 기준연도의 그 달만. '기타' = 년·월·일이 하나라도 없는 행(빈칸 포함) + 다른 해의 날짜">
                            <span className="text-[11px] font-bold text-gray-500 mr-1">기준월:</span>
                            <select
                                value={selectedMonth}
                                onChange={e => setSelectedMonth(e.target.value)}
                                className="bg-transparent border-none text-gray-700 text-[11px] font-bold outline-none color-scheme-light cursor-pointer">
                                <option value="all">전체 ({yearFilteredRows.length})</option>
                                {MONTHS.map(mm => <option key={mm} value={mm}>{selectedYear}년 {Number(mm)}월 ({monthCountMap[mm] || 0})</option>)}
                                <option value="etc">기타 ({monthCountMap.etc || 0})</option>
                            </select>
                        </div>
                        {/* ── 미니 요약 (2026-08-31 팀장님: KPI 카드 줄을 제목 라인으로 — 동일 폭 200px, 그림 포함) ── */}
                        {dataSource === 'firebase' && kpiData.total > 0 && (kpiData.ccOn || !(kpiData.rcOn && selectedYear && selectedYear < String(new Date().getFullYear()))) && (() => {
                            // 폭 185→172(9/1)→152 (2026-09-02 팀장님: '필터 N' 배지+[저장·취소] 겹치면 2단 — 실측 여유 13px→4칸 −80px로 ~93px 확보. ★헤더에 뭐든 추가하면 3팀×필터+초안 상태 실측(hdr_filter_test) 통과 후 완료 보고)
                            const chip = { display: 'inline-flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, border: '1px solid #dfe5ee', background: '#fbfdff', borderRadius: 10, padding: '3px 8px 3px 11px', whiteSpace: 'nowrap', width: 152, flex: 'none', height: 46 };
                            const colorOf = (nm) => MINI_STATUS_COLORS[nm] || '#cbd5e1';
                            const items = kpiData.ccOn ? (kpiData.ccItems || []).filter(it => it.cnt !== null) : [];
                            const total = kpiData.ccOn ? (kpiData.ccTotal || 0) : kpiData.total;
                            return (
                                <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                                    <span style={chip} title={(kpiData.ccOn ? `전체 ${total}건 = ` + items.map(it => `${it.라벨} ${it.cnt}건`).join(' + ') : `전체 ${total}건`) + (kpiData.ptPct !== null ? ` · 포인트 달성률 ${kpiData.ptPct}% (${kpiData.accSum.toLocaleString()}/${kpiData.totSum.toLocaleString()})` : '')}>
                                        <span style={{ flex: 1, minWidth: 0 }}>
                                            <span style={{ fontSize: 10.5, fontWeight: 800, color: '#64748b' }}>전체 <b style={{ fontSize: 14, color: '#37352f' }}>{total}</b><span style={{ fontSize: 9.5, color: '#a4a097' }}>건</span></span>
                                            <span style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 3, background: '#eef2f7' }}>
                                                {items.map(it => it.cnt > 0 && <i key={it.라벨} style={{ width: `${total > 0 ? it.cnt / total * 100 : 0}%`, background: colorOf(it.라벨) }}/>)}
                                            </span>
                                            <span style={{ display: 'flex', gap: 8, fontSize: 9, color: '#64748b', marginTop: 2, fontWeight: 700 }}>
                                                {items.map(it => <span key={it.라벨}><i style={{ display: 'inline-block', width: 6, height: 6, borderRadius: 2, marginRight: 2, background: colorOf(it.라벨) }}/>{it.cnt}</span>)}
                                            </span>
                                        </span>
                                    </span>
                                    {kpiData.ccOn ? items.map(it => {
                                        // 도넛 = 전체 대비 비중으로 3칸 통일 (2026-08-31 팀장님: 평균 공정률은 모수가 애매 — 툴팁으로만)
                                        const share = total > 0 ? Math.round(it.cnt / total * 100) : 0;
                                        const tip = `${kpiData.ccStName || '진행 현황'} 칸 기준 · 전체의 ${share}%`
                                            + (it.라벨 === '진행중' && kpiData.avgPct !== null ? ` · 평균 공정률 ${kpiData.avgPct}% (공정률 값 있는 ${kpiData.pctN}건 평균)` : '');
                                        return (
                                            <span key={it.라벨} style={chip} title={tip}>
                                                <span>
                                                    <span style={{ fontSize: 10.5, fontWeight: 800, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                        {it.라벨}
                                                        {it.라벨 === '완료' && kpiData.doneThisMonth > 0 && <span style={{ fontSize: 9, fontWeight: 800, color: '#166534', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 99, padding: '0 5px' }}>▲{kpiData.doneThisMonth} 이번 달</span>}
                                                    </span>
                                                    <span style={{ fontSize: 16, fontWeight: 800, color: miniNumColor(it.라벨), lineHeight: 1.15 }}>{it.cnt}<span style={{ fontSize: 10, color: '#a4a097' }}>건</span></span>
                                                </span>
                                                {miniDonut(share, colorOf(it.라벨), share + '%')}
                                            </span>
                                        );
                                    }) : (<>
                                        <span style={chip} title={kpiData.avgPct !== null ? `값 있는 ${kpiData.pctN}건 평균` : '아직 입력된 공정률 없음'}>
                                            <span>
                                                <span style={{ fontSize: 10.5, fontWeight: 800, color: '#64748b' }}>평균 공정률</span>
                                                <span style={{ fontSize: 16, fontWeight: 800, color: '#1e7ac8', lineHeight: 1.15, display: 'block' }}>{kpiData.avgPct !== null ? kpiData.avgPct + '%' : '—'}</span>
                                            </span>
                                            {miniDonut(kpiData.avgPct || 0, '#1e7ac8', kpiData.avgPct !== null ? Math.round(kpiData.avgPct) + '%' : '—')}
                                        </span>
                                        <span style={chip} title={kpiData.ptPct !== null ? `누적 ${kpiData.accSum.toLocaleString()} / 총점 ${kpiData.totSum.toLocaleString()}` : '아직 총점(포인트) 값 없음'}>
                                            <span>
                                                <span style={{ fontSize: 10.5, fontWeight: 800, color: '#64748b' }}>포인트 달성률</span>
                                                <span style={{ fontSize: 16, fontWeight: 800, color: '#059669', lineHeight: 1.15, display: 'block' }}>{kpiData.ptPct !== null ? kpiData.ptPct + '%' : '—'}</span>
                                            </span>
                                            {miniDonut(kpiData.ptPct || 0, '#059669', kpiData.ptPct !== null ? kpiData.ptPct + '%' : '—')}
                                        </span>
                                    </>)}
                                </div>
                            );
                        })()}
                        {/* 행 수(188/202행)는 하단 상태줄 '표시/전체'와 중복이라 제거 (2026-08-31 팀장님) — 필터 켜짐 표시만 유지 */}
                        {activeFilterCount > 0 && <span className="text-[11px] text-amber-500 font-bold whitespace-nowrap">필터 {activeFilterCount}</span>}
                        {/* 데이터 소스 인디케이터 */}
                        {dataSource !== 'firebase' && (
                            <span className={`text-[10px] font-bold px-2 py-0.5 border ${srcBadge.bg} ${srcBadge.text} whitespace-nowrap flex items-center gap-1`}>
                                {srcBadge.icon} {srcBadge.label}
                                {dataSource === 'pending' && pendingData?.fileName && <span className="opacity-60 ml-1 truncate max-w-[120px]">— {pendingData.fileName}</span>}
                                {dataSource === 'local' && localData?.savedAt && <span className="opacity-60 ml-1">{new Date(localData.savedAt).toLocaleDateString()}</span>}
                            </span>
                        )}
                    </div>
                </div>

                {/* 오른쪽: 버튼 (월간업무보고 동일 스타일) */}
                <div className="flex items-center justify-end gap-1 shrink-0">
                    {/* 홈 — 컴팩트 왼쪽 (2026-08-31 팀장님: 팀 탭 제거로 이동) */}
                    <button onClick={guardNav(onBack)} title="홈 — 팀 선택 화면으로"
                        className="flex items-center justify-center px-2.5 py-1.5 rounded border border-[#d8d4cf] bg-white hover:bg-gray-50 transition-all shrink-0">
                        <Home size={14} style={{ color: '#37352f' }}/>
                    </button>

                    {/* 서식 팔레트 (2026-09-01 팀장님: 항상 띄워 두고 원클릭) */}
                    <button onClick={() => fmtBar ? closeFmtBar() : openFmtBar()} title="서식 — 칸을 클릭/드래그로 고르고 굵기·색 원클릭 (팔레트는 제목줄을 잡아 이동)"
                        className="flex items-center justify-center px-2.5 py-1.5 rounded border transition-all shrink-0"
                        style={{ background: fmtBar ? '#fdf2e3' : '#ffffff', borderColor: fmtBar ? '#d97706' : '#d8d4cf' }}>
                        <Palette size={14} style={{ color: fmtBar ? '#d97706' : '#37352f' }}/>
                    </button>

                    {/* 표시 모드 — 컴팩트 */}
                    <button
                        onClick={() => setCompactMode(v => { const nv = (v + 1) % 3; try { localStorage.setItem('pms_list_compactMode', String(nv)); } catch (e) {} return nv; })}
                        title={['보통 → 컴팩트', '컴팩트 → 초소형', '초소형 → 보통'][compactMode]}
                        style={{ background: compactMode === 0 ? '#ffffff' : compactMode === 1 ? '#eaf2fb' : '#d8e9f9', borderColor: '#d8d4cf', color: '#37352f' }}
                        className="flex items-center justify-center gap-1 px-2.5 py-1.5 rounded border transition-all text-xs font-bold shrink-0"
                    >
                        <AlignJustify size={14} style={{ color: '#37352f' }} />
                        <span style={{ color: '#37352f' }}>{['보통','컴팩트','초소형'][compactMode]}</span>
                    </button>

                    {/* 표 배율 — 내 PC에만 저장(개인별). 모니터에 맞춰 한 번 고르면 계속 유지 (2026-07-13) */}
                    <div className="flex items-center gap-1 px-2 py-1 rounded border border-[#d8d4cf] bg-white shrink-0"
                         title="표 전체 확대/축소 — 이 컴퓨터에만 저장됩니다(다른 사람 화면에 영향 없음)">
                        <ZoomIn size={13} className="text-[#1e7ac8]" />
                        <select
                            value={tableScale}
                            onChange={e => { const v = Number(e.target.value); setTableScale(v); saveScale(v); }}
                            className="bg-transparent border-none text-[#37352f] text-xs font-bold outline-none cursor-pointer">
                            {SCALE_OPTIONS.map(v => <option key={v} value={v}>{v}%</option>)}
                        </select>
                    </div>

                    {/* 프로젝트 추가 */}
                    <button onClick={handleOpenAddRow} title="프로젝트 추가"
                        className="flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg border border-[#1e7ac8] bg-[#1e7ac8] hover:bg-[#1866a8] text-white transition-all text-xs font-bold shrink-0 shadow-sm">
                        <Plus size={14}/> 추가
                    </button>

                    {/* 검색 */}
                    <div className="flex items-center shrink-0">
                        <div className="relative">
                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none z-10 transition-colors" size={13}
                                style={{ color: searchTerm ? '#d97706' : '#8f8b84' }}/>
                            {/* 폭: 초안([저장 N칸]/[취소] 131px) 등장 시만 72px로 축소 — FHD 헤더 한 줄 유지(여유 81px 실측, 2026-09-01) */}
                            <input type="text" placeholder="전체 검색..." value={searchTerm} title="전체 검색"
                                onChange={e => setSearchTerm(e.target.value)}
                                style={{ borderRadius: 8 }}
                                className={`bg-white border border-[#d8d4cf] hover:border-[#b9b3ab] focus:border-[#1e7ac8] py-1.5 pl-7 pr-2 text-xs text-[#37352f] outline-none transition-all placeholder-[#a4a097] ${dataSource === 'firebase' && draftCellCount > 0 ? 'w-[72px]' : 'w-32 focus:w-48'}`}/>
                        </div>
                    </div>


                    {/* ★ 임시 편집 저장 (2026-08-27 팀장님): 메인표 키인·드롭다운은 노란 칸(초안)으로 모아 두었다가 여기서 행별 1회 저장 (Ctrl+S) */}
                    {dataSource === 'firebase' && draftCellCount > 0 && (
                        <div className="flex items-center gap-0.5 shrink-0">
                            <button onClick={() => saveDraft()} disabled={draftSaving} title="임시 편집을 서버에 저장 (Ctrl+S)"
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded border text-xs font-bold shrink-0"
                                style={{ backgroundColor: draftSaving ? '#9ca3af' : '#16a34a', borderColor: draftSaving ? '#9ca3af' : '#15803d', color: '#fff', animation: draftSaving ? 'none' : 'pmsDraftPulse 1.6s ease-in-out infinite' }}>
                                <Save size={13}/> {draftSaving ? '저장 중…' : `저장 ${draftCellCount}칸`}
                            </button>
                            <button onClick={discardDraft} disabled={draftSaving} title="임시 편집 전부 되돌리기 (서버 값으로)"
                                className="px-1.5 py-1.5 rounded border text-xs font-bold shrink-0"
                                style={{ backgroundColor: '#fff', borderColor: '#d8d4cf', color: '#b91c1c' }}>취소</button>
                        </div>
                    )}
                    {/* 전체 저장 — ★관리자 전용 (2026-07-14). 일반 사용자는 셀·상세팝업 개별 저장만 사용
                        ★2026-08-11 팀장님: 숨김 처리 — 모든 수정 경로가 즉시 저장이라 평상시 용도 없음 + 전량 덮어쓰기 위험.
                        원개발자 의도 불명이라 삭제 아닌 숨김 (아래 false 지우면 복원. 로컬 임시 저장은 설정 메뉴에 있음) */}
                    {false && (isAdmin || dataSource !== 'firebase') && (
                    <button onClick={confirmSaveAll} title="전체 행 저장"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs font-bold transition-all shrink-0"
                        style={{ backgroundColor:'#37352f', borderColor:'#37352f', color:'#fff', boxShadow:'0 1px 3px rgba(55,53,47,0.35)' }}
                        onMouseEnter={e=>e.currentTarget.style.backgroundColor='#232019'}
                        onMouseLeave={e=>e.currentTarget.style.backgroundColor='#37352f'}>
                        <Save size={13}/> 전체 저장
                    </button>
                    )}




                    {/* 월간 업무 보고 이동 버튼 */}
                    {onGoToPms && (
                        <button onClick={guardNav(onGoToPms)} title="월간 업무 보고"
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#d8d4cf] bg-white hover:bg-[#f0f7fd] hover:border-[#bcd6f0] text-[#37352f] hover:text-[#1e7ac8] transition-all shrink-0 text-xs font-bold">
                            <FileText size={13}/> 월간보고
                        </button>
                    )}

                    {/* 작업 백로그 이동 (2026-07-10) */}
                    {onGoToBacklog && (
                        <button onClick={guardNav(onGoToBacklog)} title="작업 백로그 — 누가·언제·무엇을 바꿨는지"
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#d8d4cf] bg-white hover:bg-[#f0f7fd] hover:border-[#bcd6f0] text-[#37352f] hover:text-[#1e7ac8] transition-all shrink-0 text-xs font-bold">
                            <Clock size={13}/>
                        </button>
                    )}


                    {/* 설정 드롭다운 */}
                    <div className="relative shrink-0">
                        <button onClick={() => setSettingsOpen(v=>!v)}
                            className="flex items-center justify-center gap-1 bg-white hover:bg-[#f7f5f2] border border-[#d8d4cf] px-2.5 py-1.5 rounded-lg transition-all text-xs font-bold text-[#37352f]">
                            <Settings size={13}/> <ChevronDown size={11}/>
                        </button>
                        {settingsOpen && (
                            <>
                                <div className="fixed inset-0 z-[55]" onClick={() => setSettingsOpen(false)}/>
                                <div className="absolute right-0 mt-2 w-56 bg-white border border-[#c4ccd8] rounded-lg shadow-2xl overflow-hidden z-[60] py-2">
                                    {/* 데이터 소스 표시 — firebase(정상저장)일 땐 숨김, 미저장(pending/local)일 때만 경고용으로 표시 (2026-06-29) */}
                                    {dataSource !== 'firebase' && (
                                    <div className={`px-4 py-2 border-b border-[#e5eaf3] mb-1 flex items-center gap-2 ${srcBadge.text}`}>
                                        {srcBadge.icon}
                                        <span className="text-[11px] font-bold">{srcBadge.label}</span>
                                        <span className="text-[#aaa] text-[10px] ml-auto">{activeRows.length}행</span>
                                    </div>
                                    )}
                                    {/* 로컬 임시 저장 (pending) — 업로드가 관리자 전용이므로 함께 게이팅 */}
                                    {isAdmin && dataSource === 'pending' && (
                                        <button onClick={() => { setSettingsOpen(false); handleSaveToLocal(); }}
                                            className="w-full text-left px-4 py-2.5 hover:bg-blue-50 text-xs font-bold text-violet-600 flex items-center gap-2 transition-colors">
                                            <HardDrive size={14}/> 로컬 임시 저장
                                        </button>
                                    )}
                                    {/* A-4c 병합 미리보기 (드라이런 · 저장 없음 · 데이터 안 바뀜) */}
                                    {isAdmin && dataSource === 'pending' && (
                                        <button onClick={() => { setSettingsOpen(false); handleMergePreview(); }}
                                            className="w-full text-left px-4 py-2.5 hover:bg-blue-50 text-xs font-bold text-sky-600 flex items-center gap-2 transition-colors">
                                            <Eye size={14}/> 병합 미리보기 (드라이런)
                                        </button>
                                    )}
                                    {/* Firebase 확정 저장 (pending/local) — ★관리자 전용 (2026-07-14) */}
                                    {isAdmin && (dataSource === 'pending' || dataSource === 'local') && (
                                        <button onClick={() => { setSettingsOpen(false); handleSaveToFirebase(); }}
                                            className="w-full text-left px-4 py-2.5 hover:bg-blue-50 text-xs font-bold text-emerald-600 flex items-center gap-2 transition-colors">
                                            <CloudUpload size={14}/> 엑셀 확정 저장 (보존 병합)
                                        </button>
                                    )}
                                    {/* 로컬 삭제 (local) */}
                                    {isAdmin && dataSource === 'local' && (
                                        <button onClick={() => { setSettingsOpen(false); handleDeleteLocal(); }}
                                            className="w-full text-left px-4 py-2.5 hover:bg-blue-50 text-xs font-bold text-amber-600 flex items-center gap-2 transition-colors">
                                            <Trash2 size={14}/> 로컬 데이터 삭제
                                        </button>
                                    )}
                                    {/* 업로드 취소 (pending) */}
                                    {isAdmin && dataSource === 'pending' && (
                                        <button onClick={() => { setSettingsOpen(false); setPendingData(null); }}
                                            className="w-full text-left px-4 py-2.5 hover:bg-blue-50 text-xs font-bold text-[#888] flex items-center gap-2 transition-colors">
                                            <X size={14}/> 업로드 취소
                                        </button>
                                    )}
                                    {/* 엑셀 업로드 — ★관리자 전용 (2026-07-14) */}
                                    {isAdmin && (
                                    <button onClick={() => { setSettingsOpen(false); if(fileInputRef.current){fileInputRef.current.value='';fileInputRef.current.click();} }}
                                        className="w-full text-left px-4 py-2.5 hover:bg-blue-50 text-xs font-bold text-[#222] flex items-center gap-2 transition-colors">
                                        <Upload size={14} className="text-cyan-600"/> 엑셀 업로드
                                    </button>
                                    )}
                                    {/* 엑셀 생성 */}
                                    <button onClick={() => { setSettingsOpen(false); handleDownload(); }} disabled={!activeHeaders.length}
                                        className="w-full text-left px-4 py-2.5 hover:bg-blue-50 text-xs font-bold text-[#222] flex items-center gap-2 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                                        <FileSpreadsheet size={14} className="text-indigo-600"/> 엑셀 생성
                                    </button>
                                    {/* 월간 마감 — 팀 카드 '월간마감' 팀만 (기술1팀, 2026-08-13 b안). 담당자가 값 확인 후 이 달 확정값 저장 */}
                                    {teamProfile?.월간마감 && (
                                    <button onClick={handleMonthlyClose} disabled={!activeRows.length}
                                        className="w-full text-left px-4 py-2.5 hover:bg-emerald-50 text-xs font-bold text-emerald-700 flex items-center gap-2 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                                        <Calendar size={14} className="text-emerald-600"/> 월간 마감 (그 달 값 확정)
                                    </button>
                                    )}

                                    {/* 엑셀 반영 (추가·수정) — 일반 사용자용 보존 병합 (2026-08-10 팀장님):
                                        엑셀 적응기 대응. 올리면 웹과 비교해 신규·갱신만 미리보기 → 반영. 삭제 없음, 하위·NAS 칸 보호 */}
                                    {dataSource === 'firebase' && (
                                    <button onClick={() => { setSettingsOpen(false); if (userFileRef.current) { userFileRef.current.value = ''; userFileRef.current.click(); } }}
                                        className="w-full text-left px-4 py-2.5 hover:bg-blue-50 text-xs font-bold text-[#222] flex items-center gap-2 transition-colors">
                                        <CloudUpload size={14} className="text-emerald-600"/> 엑셀 반영 (추가·수정) <span className="text-[10px] text-[#999] font-normal">삭제 없음</span>
                                    </button>
                                    )}
                                    {/* 과거 연도 추가 적재 — 관리자 + 과거적재 카드 팀만 (2026-08-20): 옛 연도 순수 추가, 올해 무접촉 */}
                                    {isAdmin && teamProfile?.과거적재 && dataSource === 'firebase' && (
                                    <button onClick={() => { setSettingsOpen(false); if (histFileRef.current) { histFileRef.current.value = ''; histFileRef.current.click(); } }}
                                        className="w-full text-left px-4 py-2.5 hover:bg-blue-50 text-xs font-bold text-[#222] flex items-center gap-2 transition-colors">
                                        <Clock size={14} className="text-violet-600"/> 과거 연도 추가 적재 <span className="text-[10px] text-[#999] font-normal">올해 무접촉</span>
                                    </button>
                                    )}
                                    {/* 수행번호 3자리 정리 (2026-08-21 팀장님, 기술1팀): 26-01 → 26-001, 전 연도 한 번에 */}
                                    {isAdmin && execCfg && dataSource === 'firebase' && (
                                    <button onClick={() => { setSettingsOpen(false); handleExecNoPad(); }}
                                        className="w-full text-left px-4 py-2.5 hover:bg-blue-50 text-xs font-bold text-[#222] flex items-center gap-2 transition-colors">
                                        <Hash size={14} className="text-indigo-600"/> 수행번호 3자리 정리 <span className="text-[10px] text-[#999] font-normal">26-01 → 26-001</span>
                                    </button>
                                    )}
                                    {/* 연도별 1:1 적재·검증 (2026-08-21 팀장님, 기술1팀): 시트 1장 = 연도 1개, 열·값 엑셀 그대로 — 연도마다 적재→대조 */}
                                    {isAdmin && teamProfile?.연도별적재 && dataSource === 'firebase' && (
                                    <button onClick={() => { setSettingsOpen(false); if (yearFileRef.current) { yearFileRef.current.value = ''; yearFileRef.current.click(); } }}
                                        className="w-full text-left px-4 py-2.5 hover:bg-blue-50 text-xs font-bold text-[#222] flex items-center gap-2 transition-colors">
                                        <LayoutList size={14} className="text-indigo-600"/> 연도별 1:1 적재·검증 <span className="text-[10px] text-[#999] font-normal">시트 1장씩</span>
                                    </button>
                                    )}
                                    {/* 1층 백업 체계 (2026-08-20 팀장님): 전체 백업 + 복원 — 웹이 원본이 되는 단계 대비 */}
                                    {isAdmin && dataSource === 'firebase' && (<>
                                    <button onClick={() => { setSettingsOpen(false); handleFullBackup(); }}
                                        className="w-full text-left px-4 py-2.5 hover:bg-blue-50 text-xs font-bold text-[#222] flex items-center gap-2 transition-colors">
                                        <Database size={14} className="text-sky-600"/> 전체 백업 (JSON) <span className="text-[10px] text-[#999] font-normal">행+장부+설정 통째</span>
                                    </button>
                                    <button onClick={() => { setSettingsOpen(false); if (restoreFileRef.current) { restoreFileRef.current.value = ''; restoreFileRef.current.click(); } }}
                                        className="w-full text-left px-4 py-2.5 hover:bg-red-50 text-xs font-bold text-red-700 flex items-center gap-2 transition-colors">
                                        <Database size={14} className="text-red-500"/> 백업 복원 <span className="text-[10px] text-[#999] font-normal">그 시점으로 되돌림</span>
                                    </button>
                                    </>)}
                                    {/* 진행현황·담당자 관리 — ★관리자 전용 (2026-07-14): 팀 공통 마스터 목록 */}
                                    {isAdmin && (<>
                                    <div className="border-t border-[#e5eaf3] my-1"/>
                                    {/* 번호 3자리 일괄 정리 (2026-07-20) — 기존 클라우드 데이터의 1·2자리 번호를 001 형태로 */}
                                    <button onClick={() => { setSettingsOpen(false); handlePadAllNumbers(); }}
                                        className="w-full text-left px-4 py-2.5 hover:bg-blue-50 text-xs font-bold text-[#333] flex items-center gap-2 transition-colors">
                                        <Hash size={14} className="text-[#1e7ac8]"/> 번호 3자리 정리 (1→001)
                                    </button>
                                    <button onClick={() => { setSettingsOpen(false); handleSeedProgressFromMain(); }}
                                        className="w-full text-left px-4 py-2.5 hover:bg-blue-50 text-xs font-bold text-[#333] flex items-center gap-2 transition-colors">
                                        <TrendingUp size={14} className="text-emerald-600"/> 진행실적 심기 (표 %→주간)
                                    </button>
                                    <button onClick={() => { setSettingsOpen(false); setStatusMgrOrig([...STATUS_OPTIONS]); setStatusMgr([...STATUS_OPTIONS]); setStatusMgrColors(Object.fromEntries(STATUS_OPTIONS.map(s => [s, STATUS_COLORS[s] || STATUS_COLOR_PRESETS[8]]))); setStatusColorOpenIdx(null); setStatusDelIdx(null); }}
                                        className="w-full text-left px-4 py-2.5 hover:bg-blue-50 text-xs font-bold text-[#333] flex items-center gap-2 transition-colors">
                                        <ListChecks size={14} className="text-[#1e7ac8]"/> 진행현황 관리
                                    </button>
                                    <button onClick={() => { setSettingsOpen(false); setManagerMgrOrig([...ASSIGNEES]); setManagerMgr([...ASSIGNEES]); setManagerDelIdx(null); }}
                                        className="w-full text-left px-4 py-2.5 hover:bg-blue-50 text-xs font-bold text-[#333] flex items-center gap-2 transition-colors">
                                        <Users size={14} className="text-[#1e7ac8]"/> 담당자 관리
                                    </button>
                                    {/* 메인 PC 자동 반영 (2026-07-27) — ★관리자 전용 메뉴.
                                        공용 PC에서 관리자가 한 번 켜두면 설정은 이 PC(localStorage)에 남는다.
                                        → 이후 일반 계정으로 바꿔 로그인해도 자동 반영은 계속 돈다(실행에는 isAdmin 가드 없음).
                                        2026-07-30: NAS_SYNC_ENABLED=false 이면 메뉴를 숨긴다 (구분선까지 함께) */}
                                    {NAS_SYNC_ENABLED && (<>
                                    <div className="border-t border-[#e5eaf3] my-1"/>
                                    <button onClick={() => {
                                            // (2026-08-07) 켜고 끄기 = 이 PC의 '지켜볼 팀 목록'에 지금 팀을 넣고 빼는 것.
                                            //   팀을 여러 개 넣어두면 창 하나가 번갈아 보므로, 팀마다 창을 따로 띄울 필요가 없다.
                                            const _has = extMainTeams.includes(currentTeam);
                                            const _next = _has ? extMainTeams.filter(t => t !== currentTeam) : [...extMainTeams, currentTeam];
                                            setExtMainTeams(_next); saveMainPcTeams(_next); setSettingsOpen(false);
                                            extLastRunRef.current = Date.now();
                                            if (!_has) { showExtToast(`이 PC가 '${currentTeam}' 메인 PC로 지정되었습니다.\n30분마다 NAS를 확인해 자동 반영합니다.` + (_next.length > 1 ? `\n지켜볼 팀 ${_next.length}개 (${_next.join(', ')}) — 15분마다 화면을 번갈아 엽니다.` : '') + `\n(List 화면을 켜둔 상태여야 합니다)`); setTimeout(() => { try { extAutoFnRef.current && extAutoFnRef.current(); } catch (e) {} }, 800); }
                                            else showExtToast(`'${currentTeam}' 메인 PC 지정을 해제했습니다.` + (_next.length ? `\n남은 팀: ${_next.join(', ')}` : '\n자동 반영이 멈춥니다.'));
                                        }}
                                        className={`w-full text-left px-4 py-2.5 hover:bg-blue-50 text-xs font-bold flex items-center gap-2 transition-colors ${extMainPc ? 'text-emerald-700' : 'text-[#333]'}`}>
                                        <HardDrive size={14} className={extMainPc ? 'text-emerald-600' : 'text-[#999]'}/>
                                        이 PC를 메인 PC로 지정
                                        <span className="ml-auto text-[10px] font-normal text-[#999]">{extMainPc
                                            ? `켜짐${extMainTeams.length > 1 ? ` · 팀 ${extMainTeams.length}개 번갈아` : ' · 30분마다'}${extLastAuto ? ` · ${extLastAuto} 확인` : ''}`
                                            : (extMainTeams.length ? `꺼짐 (이 PC는 ${extMainTeams.join(', ')} 담당)` : '꺼짐')}</span>
                                    </button>
                                    </>)}
                                    </>)}
                                    <div className="border-t border-[#e5eaf3] my-1"/>
                                    {/* 내 화면 설정 초기화 — 배율 100% + 열 너비 기본값 (이 PC만) (2026-07-13) */}
                                    <button onClick={() => { setSettingsOpen(false); setTableScale(100); saveScale(100); setColWidths({}); saveColWidths(currentTeam, {}); }}
                                        className="w-full text-left px-4 py-2.5 hover:bg-blue-50 text-xs font-bold text-[#333] flex items-center gap-2 transition-colors">
                                        <RotateCcw size={14} className="text-[#1e7ac8]"/> 내 화면 설정 초기화 <span className="text-[10px] text-[#999] font-normal">(배율·열너비)</span>
                                    </button>
                                    <div className="border-t border-[#e5eaf3] my-1"/>
                                    {/* 열 표시/숨기기 */}
                                    <button onClick={() => setColDropOpen(v=>!v)}
                                        className={`w-full text-left px-4 py-2.5 hover:bg-blue-50 text-xs font-bold flex items-center gap-2 transition-colors ${hiddenCols.size>0?'text-rose-600':'text-[#333]'}`}>
                                        <Eye size={14} className={hiddenCols.size>0?'text-rose-600':'text-[#999]'}/>
                                        열 표시/숨기기
                                        {hiddenCols.size>0 && <span className="ml-auto text-[10px] bg-rose-500 text-[#222] px-1.5 py-0.5 font-mono">{hiddenCols.size}개 숨김</span>}
                                    </button>
                                    {colDropOpen && (
                                        <div className="px-3 pb-2">
                                            <div className="flex justify-end mb-1.5">
                                                <button onClick={() => { const n = new Set(); saveHiddenCols(currentTeam, n); setHiddenCols(n); }} className="text-[11px] text-emerald-600 hover:text-emerald-600 font-bold px-2 py-0.5 bg-emerald-50">모두 표시</button>
                                            </div>
                                            {detailOnlyHeaders.length > 0 && (
                                                <p className="text-[10px] text-[#aaa] mb-1 px-1">※ 나머지 {detailOnlyHeaders.length}개 열은 우클릭 → 상세 화면에서 확인</p>
                                            )}
                                            <div className="space-y-0.5 max-h-48 overflow-y-auto custom-scrollbar">
                                                {allMainCols.map(h => (
                                                    <label key={h} className="flex items-center gap-2 cursor-pointer group py-1 px-2 hover:bg-blue-50 transition-colors">
                                                        <input type="checkbox" checked={!hiddenCols.has(h)}
                                                            onChange={() => setHiddenCols(p => { const n=new Set(p); n.has(h)?n.delete(h):n.add(h); saveHiddenCols(currentTeam, n); return n; })}
                                                            className="w-3 h-3 accent-emerald-500 cursor-pointer"/>
                                                        <span className={`text-[12px] font-medium ${hiddenCols.has(h)?'text-[#999]':'text-[#222] group-hover:text-[#1e7ac8]'}`}>{h}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {/* 디버그 모드 — ★관리자 전용 적용 완료 (2026-07-14, 기존 TODO 해소) */}
                                    {isAdmin && (<>
                                    <div className="border-t border-[#e5eaf3] my-1"/>
                                    <button onClick={() => { setSettingsOpen(false); setShowDebug(v=>!v); }}
                                        className={`w-full text-left px-4 py-2.5 hover:bg-blue-50 text-xs font-bold flex items-center gap-2 transition-colors border-b border-[#e5eaf3] ${showDebug?'text-emerald-600':'text-[#333]'}`}>
                                        <TerminalSquare size={14}/> 디버그 모드
                                        <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded border font-mono ${showDebug?'border-emerald-600 text-emerald-600':'border-[#c4ccd8] text-[#999]'}`}>{showDebug?'ON':'OFF'}</span>
                                    </button>
                                    <div className="border-t border-[#e5eaf3] my-1"/>
                                    {/* 전체 삭제 — ★관리자 전용 (2026-07-14) */}
                                    <button onClick={() => { setSettingsOpen(false); setClearYearSel('ALL'); setConfirmClearOpen(true); }} disabled={!activeRows.length}
                                        className="w-full text-left px-4 py-2.5 hover:bg-rose-50 text-xs font-bold text-rose-600 flex items-center gap-2 transition-colors disabled:opacity-40">
                                        <Trash2 size={14}/> 전체 데이터 삭제
                                    </button>
                                    </>)}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </header>


            {/* ── 빈 상태 / 테이블 ── */}
            {activeHeaders.length === 0 ? (((!fbLoaded || !fbMetaLoaded) && dataSource === 'firebase') ? (
                /* 첫 데이터 도착 전 — 업로드 안내가 먼저 번쩍이지 않게 '불러오는 중'만 (2026-08-11) */
                <div className="flex-1 flex flex-col items-center justify-center">
                    <div className="text-center">
                        <div className="inline-block w-8 h-8 border-[3px] border-[#1e7ac8] border-t-transparent rounded-full animate-spin mb-4"/>
                        <p className="text-slate-400 font-bold text-base">데이터를 불러오는 중입니다…</p>
                    </div>
                </div>
            ) : (
                <div className="flex-1 flex flex-col items-center justify-center animate-in">
                    <div className="max-w-lg w-full text-center">
                        <div className="inline-flex items-center justify-center p-5 bg-slate-900 rounded-3xl shadow-[0_0_40px_rgba(16,185,129,0.12)] border border-slate-800 mb-8">
                            <FileSpreadsheet size={52} className="text-emerald-500/60"/>
                        </div>
                        <h2 className="text-3xl font-extrabold text-slate-200 mb-3 tracking-tight">등록된 프로젝트 List가 없습니다</h2>
                        <p className="text-slate-500 text-base mb-2">엑셀 파일을 업로드하면 헤더를 자동으로 인식하여<br/>테이블 형태로 표시됩니다.</p>
                        <p className="text-slate-600 text-sm mb-10">업로드 후 검토 → 병합 미리보기 → 엑셀 확정 저장(보존 병합) 순으로 진행하세요.</p>
                        {isAdmin ? (<>
                        <button onClick={() => { if(fileInputRef.current){fileInputRef.current.value='';fileInputRef.current.click();} }}
                            className="inline-flex items-center gap-3 px-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-bold text-base shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all">
                            <Upload size={20}/> 엑셀 파일 업로드
                        </button>
                        {teamProfile?.연도별적재 && (
                        <button onClick={() => { if (yearFileRef.current) { yearFileRef.current.value = ''; yearFileRef.current.click(); } }}
                            className="inline-flex items-center gap-3 px-8 py-4 ml-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-bold text-base shadow-[0_0_20px_rgba(79,70,229,0.3)] transition-all">
                            <LayoutList size={20}/> 연도별 1:1 적재·검증
                        </button>
                        )}
                        <p className="text-slate-700 text-xs mt-5">지원 형식: .xlsx · .xls{teamProfile?.연도별적재 ? ' · 이 팀은 [연도별 1:1 적재]로 한 해씩 넣고 대조 검증하세요' : ''}</p>
                        </>) : (
                        <p className="text-slate-500 text-sm">엑셀 업로드는 관리자만 할 수 있습니다. 관리자에게 요청하세요.</p>
                        )}
                    </div>
                </div>
            )) : (
                <div className="flex-1 bg-slate-900/40 border border-slate-800 rounded-2xl overflow-hidden flex flex-col min-h-0">
                    {/* ── KPI 요약 카드 (D안 2026-08-11 — 표시 전용. 간부가 물어볼 숫자를 표 위에 상시) ── */}
                    {/* ── 보고 카드 (2026-08-19 팀장님, 팀 카드 '보고카드' 팀 = 기술1팀): 지난 연도만 — 당해(진행중)는 기존 카드 ── */}
                    {/* 지난 연도 보고 카드 — 당해카드 팀(기술1팀)은 지난 연도도 같은 4장(전체·준비·진행중·완료)으로 (2026-08-21 팀장님) */}
                    {kpiData.rcOn && !kpiData.ccOn && selectedYear && selectedYear < String(new Date().getFullYear()) && kpiData.total > 0 && (
                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', padding: '10px 14px', backgroundColor: '#edf1f7', flexShrink: 0 }}>
                            {/* 1. 총 프로젝트 */}
                            <div style={{ flex: '1 1 150px', minWidth: '150px', background: '#fff', border: '1px solid #dfe5ee', borderRadius: '10px', padding: '8px 14px' }}>
                                <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#8f8b84', marginBottom: '2px' }}>{selectedYear ? `${selectedYear}년 프로젝트` : '전체 프로젝트'}</div>
                                <div style={{ fontSize: '20px', fontWeight: 800, color: '#37352f', lineHeight: 1.2 }}>{kpiData.total}<span style={{ fontSize: '12px', color: '#a4a097' }}>건</span></div>
                                <div style={{ fontSize: '10.5px', color: '#a4a097', marginTop: '1px' }}>{(kpiData.rcByWork || []).map(([nm, c]) => `${nm} ${c}건`).join(' · ')}</div>
                            </div>
                            {/* 2. 계약 현황별 건수 */}
                            <div style={{ flex: '1.4 1 200px', minWidth: '200px', background: '#fff', border: '1px solid #dfe5ee', borderRadius: '10px', padding: '8px 14px' }}>
                                <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#8f8b84', marginBottom: '2px' }}>{kpiData.rcTitle2 || '계약 현황'}</div>
                                {kpiData.rcByStatus.length ? (
                                    <>
                                        <div style={{ fontSize: '15px', fontWeight: 800, color: '#37352f', lineHeight: 1.35 }}>
                                            {kpiData.rcByStatus.slice(0, 3).map(([nm, c], i) => (
                                                <span key={nm}>{i > 0 && <span style={{ color: '#c0c8d4', fontWeight: 400 }}> · </span>}{nm} <span style={{ color: '#1e7ac8' }}>{c}</span></span>
                                            ))}
                                        </div>
                                        <div style={{ fontSize: '10.5px', color: '#a4a097', marginTop: '1px' }}>
                                            {kpiData.rcByStatus.length > 3
                                                ? kpiData.rcByStatus.slice(3).map(([nm, c]) => `${nm} ${c}`).join(' · ')
                                                : '계약 칸 값 기준'}
                                        </div>
                                    </>
                                ) : (
                                    <div style={{ fontSize: '20px', fontWeight: 800, color: '#c0c8d4', lineHeight: 1.2 }}>—</div>
                                )}
                            </div>
                            {/* 3. 달성율 = 완료 ÷ 전체 */}
                            <div style={{ flex: '1 1 150px', minWidth: '150px', background: '#fff', border: '1px solid #dfe5ee', borderRadius: '10px', padding: '8px 14px' }}>
                                <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#8f8b84', marginBottom: '2px' }}>달성율</div>
                                {kpiData.rcRate !== null ? (
                                    <div style={{ fontSize: '20px', fontWeight: 800, color: '#059669', lineHeight: 1.2 }}>{kpiData.rcRate}<span style={{ fontSize: '12px' }}>%</span></div>
                                ) : (
                                    <div style={{ fontSize: '20px', fontWeight: 800, color: '#c0c8d4', lineHeight: 1.2 }}>—</div>
                                )}
                                <div style={{ fontSize: '10.5px', color: '#a4a097', marginTop: '1px' }}>완료 {kpiData.rcDone}건 ÷ 전체 {kpiData.total}건</div>
                            </div>
                            {/* 4. 전체 포인트 */}
                            <div style={{ flex: '1 1 150px', minWidth: '150px', background: '#fff', border: '1px solid #dfe5ee', borderRadius: '10px', padding: '8px 14px' }}>
                                <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#8f8b84', marginBottom: '2px' }}>전체 포인트</div>
                                {kpiData.rcPtSum > 0 ? (
                                    <div style={{ fontSize: '20px', fontWeight: 800, color: '#1e7ac8', lineHeight: 1.2 }}>{kpiData.rcPtSum.toLocaleString()}<span style={{ fontSize: '12px', color: '#a4a097' }}>pt</span></div>
                                ) : (
                                    <div style={{ fontSize: '20px', fontWeight: 800, color: '#c0c8d4', lineHeight: 1.2 }}>—</div>
                                )}
                                <div style={{ fontSize: '10.5px', color: '#a4a097', marginTop: '1px' }}>
                                    {kpiData.rcPtSum > 0 ? `총물량 ${kpiData.rcPtN}건 합 · 누적 ${kpiData.rcAccSum.toLocaleString()}pt` : '이 연도엔 포인트(총물량) 값 없음'}
                                </div>
                            </div>
                        </div>
                    )}
                    {/* KPI 카드 줄(당해·일반)은 헤더 미니 요약으로 이동 (2026-08-31 팀장님) — 지난 연도 보고 카드(rcOn)만 위에 유지 */}
                    {/* ── 진행현황 + 담당자 칩 필터 바 (한 행) ── */}
                    {statusFilterCol && statusChipData.length > 0 && (
                        <div style={{ padding: '6px 14px', borderBottom: '1px solid #c4ccd8', backgroundColor: '#edf1f7', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', flexShrink: 0 }}>
                            {/* 진행현황 */}
                            <span style={{ fontSize: '11px', fontWeight: 700, color: '#666' }}>{statusFilterCol}</span>
                            <button onClick={() => setActiveStatusChips(new Set())}
                                style={{ padding: '3px 10px', fontSize: '11px', fontWeight: activeStatusChips.size === 0 ? 800 : 600, backgroundColor: activeStatusChips.size === 0 ? 'rgba(30,122,200,0.12)' : '#fff', color: activeStatusChips.size === 0 ? '#1358a0' : '#888', border: activeStatusChips.size === 0 ? '1.5px solid #1e7ac8' : '1.5px solid #e5e7eb', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                전체 <span style={{ fontSize: '10px', opacity: 0.85 }}>({yearFilteredRows.length})</span>
                            </button>
                            {statusChipData.map(([status, count]) => {
                                const isActive = activeStatusChips.has(status);
                                const c = STATUS_COLORS[status] || { bg: 'rgba(100,116,139,0.12)', text: '#475569', border: 'rgba(100,116,139,0.4)', activeBg: '#475569', activeText: '#fff' };
                                return (
                                    <button key={status}
                                        onClick={() => setActiveStatusChips(prev => { const next = new Set(prev); if (next.has(status)) next.delete(status); else next.add(status); return next; })}
                                        style={{ padding: '3px 10px', fontSize: '11px', fontWeight: isActive ? 800 : 600, backgroundColor: isActive ? c.bg : '#fff', color: isActive ? c.text : '#888', border: `1.5px solid ${isActive ? c.border : '#e5e7eb'}`, borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        {status} <span style={{ fontSize: '10px', opacity: isActive ? 0.9 : 0.75 }}>({count})</span>
                                    </button>
                                );
                            })}
                            {activeStatusChips.size > 0 && (
                                <button onClick={() => setActiveStatusChips(new Set())}
                                    style={{ fontSize: '10px', fontWeight: 700, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', display: 'flex', alignItems: 'center', gap: '2px' }}>
                                    <X size={10}/> 초기화
                                </button>
                            )}
                            {/* 구분선 */}
                            {assigneeFilterCol && <div style={{ width: '1px', height: '18px', backgroundColor: '#c4ccd8', margin: '0 4px', flexShrink: 0 }}/>}
                            {/* 관리자 (2026-07-22 팀장님 — 담당자와 동일 형식, 담당자 앞) */}
                            {managerFilterCol && managerChips.length > 0 && (<>
                                <span style={{ fontSize: '11px', fontWeight: 700, color: '#666' }}>관리자</span>
                                <button onClick={() => setActiveManagers(new Set())}
                                    style={{ padding: '3px 8px', fontSize: '11px', fontWeight: activeManagers.size === 0 ? 800 : 600, backgroundColor: activeManagers.size === 0 ? 'rgba(30,122,200,0.12)' : '#fff', color: activeManagers.size === 0 ? '#1358a0' : '#888', border: activeManagers.size === 0 ? '1.5px solid #1e7ac8' : '1.5px solid #e5e7eb', borderRadius: '6px', cursor: 'pointer' }}>
                                    전체
                                </button>
                                {managerChips.map(({ key, label, count }) => {
                                    const isActive = activeManagers.has(label);
                                    return (
                                        <button key={key}
                                            onClick={() => setActiveManagers(prev => { const n = new Set(prev); if (n.has(label)) n.delete(label); else n.add(label); return n; })}
                                            style={{ padding: '3px 8px', fontSize: '11px', fontWeight: isActive ? 800 : 600, backgroundColor: isActive ? 'rgba(30,122,200,0.12)' : '#fff', color: isActive ? '#1358a0' : '#888', border: isActive ? '1.5px solid #1e7ac8' : '1.5px solid #e5e7eb', borderRadius: '6px', cursor: 'pointer', display:'flex', alignItems:'center', gap:'4px' }}>
                                            {label}
                                            <span style={{ fontSize:'10px', opacity:0.8 }}>({count})</span>
                                        </button>
                                    );
                                })}
                                {activeManagers.size > 0 && (
                                    <button onClick={() => setActiveManagers(new Set())}
                                        style={{ fontSize: '10px', fontWeight: 700, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', display: 'flex', alignItems: 'center', gap: '2px' }}>
                                        <X size={10}/> 초기화
                                    </button>
                                )}
                            </>)}
                            {/* 담당자 */}
                            {assigneeFilterCol && (<>
                                <span style={{ fontSize: '11px', fontWeight: 700, color: '#666' }}>담당자</span>
                                <button onClick={() => setActiveAssignees(new Set())}
                                    style={{ padding: '3px 8px', fontSize: '11px', fontWeight: activeAssignees.size === 0 ? 800 : 600, backgroundColor: activeAssignees.size === 0 ? 'rgba(30,122,200,0.12)' : '#fff', color: activeAssignees.size === 0 ? '#1358a0' : '#888', border: activeAssignees.size === 0 ? '1.5px solid #1e7ac8' : '1.5px solid #e5e7eb', borderRadius: '6px', cursor: 'pointer' }}>
                                    전체
                                </button>
                                {ASSIGNEES.map(name => {
                                    const isActive = activeAssignees.has(name);
                                    return (
                                        <button key={name}
                                            onClick={() => setActiveAssignees(prev => { const n = new Set(prev); if (n.has(name)) n.delete(name); else n.add(name); return n; })}
                                            style={{ padding: '3px 8px', fontSize: '11px', fontWeight: isActive ? 800 : 600, backgroundColor: isActive ? 'rgba(30,122,200,0.12)' : '#fff', color: isActive ? '#1358a0' : '#888', border: isActive ? '1.5px solid #1e7ac8' : '1.5px solid #e5e7eb', borderRadius: '6px', cursor: 'pointer', display:'flex', alignItems:'center', gap:'4px' }}>
                                            {toExcelAssignee(name)}{/* 직책 한글 통일 (2026-08-27 팀장님: DD·TL·C → 담당·팀장·책임 · 이름만 팀도 칩은 직책 표기) */}
                                            <span style={{ fontSize:'10px', opacity:0.8 }}>({assigneeCountMap[extractName(name)] || 0})</span>
                                        </button>
                                    );
                                })}
                                {activeAssignees.size > 0 && (
                                    <button onClick={() => setActiveAssignees(new Set())}
                                        style={{ fontSize: '10px', fontWeight: 700, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', display: 'flex', alignItems: 'center', gap: '2px' }}>
                                        <X size={10}/> 초기화
                                    </button>
                                )}
                            </>)}
                        </div>
                    )}
                    {/* zoom = 개인 배율. 표만 확대/축소되고 위 버튼·헤더는 그대로 (2026-07-13) */}
                    <div className="overflow-auto flex-1 custom-scrollbar" ref={winWrapRef} onScroll={onWinScroll} onMouseDown={onSelMouseDown} style={{ zoom: (tableScale || 100) / 100 }}>
                        <table className="text-left border-collapse list-oneline" style={{ minWidth:'100%' }}>
                            <colgroup>
                                {/* (2026-06-29) 맨 앞 'No.칸' 잔재 <col width:22> 제거 — 이 빈 col이 모든 칸 너비를 한 칸씩 밀어, 도면입수에 옆 '내용' 칸(210px)이 적용되던 진짜 원인. Chrome 실측 확인(210→60). 칸 너비 = getW(h). */}
                                {mainVisibleHeaders.map(h => <col key={h} style={{ width: getW(h) || winPinW[h] || 40, minWidth: getW(h) || winPinW[h] || 40 }}/>)}
                                <col style={{width:120}}/>
                            </colgroup>
                            {(() => {
                                // 헤드 높이 약 20% 축소
                                const thPx    = compactMode===0 ? 'px-3 py-1'   : compactMode===1 ? 'px-2 py-px'  : 'px-1.5 py-0';
                                const thSub   = compactMode===0 ? 'px-2 py-0.5' : compactMode===1 ? 'px-2 py-px'  : 'px-1.5 py-0';
                                const tdPx    = compactMode===0 ? 'px-3 py-2'   : compactMode===1 ? 'px-2 py-1'   : 'px-1.5 py-0.5';
                                const cellSz  = compactMode===0 ? 'text-[12.5px]' : compactMode===1 ? 'text-[11.5px]' : 'text-[10px]';   // 간부 가독성: 보통 12.5px (2026-08-11 시안)
                                const noTdPx  = compactMode===0 ? 'px-2 py-2'   : compactMode===1 ? 'px-2 py-1'   : 'px-1 py-0.5';
                                const actTdPx = compactMode===0 ? 'px-1 py-1'   : compactMode===1 ? 'px-1 py-0.5'   : 'px-0.5 py-0';
                                const noSz    = compactMode===0 ? 'text-[11px]' : compactMode===1 ? 'text-[11px]' : 'text-[9px]';
                                const mgrSz   = compactMode===0 ? 'text-[11px]' : compactMode===1 ? 'text-[10px]' : 'text-[9px]';
                                const iconSz  = compactMode===2 ? 12 : 14;

                                // ── 고정 열 오프셋 — '실측값'만 사용 (2026-08-11 잘림 수리) ──
                                //   getW 기본폭 누적 폴백은 실제 내용맞춤 폭보다 좁아(번호 22px 등) 스크롤 시
                                //   고정 열끼리 겹쳐 왼쪽 열이 잘리는 원인이라 폐기. 실측 전 찰나엔 고정 미적용
                                //   (스크롤 전이라 화면 차이 없음 — 실측(useLayoutEffect)이 같은 프레임에 채워줌).
                                // 값 = CSS 변수 참조 (실측 px는 useLayoutEffect가 <table>의 --frz-i에 기록)
                                let frozenOffsets = {};
                                if (frozenUpTo && mainVisibleHeaders.includes(frozenUpTo)) {
                                    const _F = mainVisibleHeaders.indexOf(frozenUpTo);
                                    mainVisibleHeaders.slice(0, _F + 1).forEach((h, i) => { frozenOffsets[h] = `var(--frz-${i})`; });
                                }
                                const isFrz  = h => frozenOffsets[h] !== undefined;
                                const isPinH = h => h === frozenUpTo;

                                return (<>
                            <thead className="sticky top-0 z-30" style={{background:'var(--head-bg)'}}>
                                <tr className="border-b border-slate-800">
                                    {/* No. 칸 제거 — 엑셀 '번호'와 중복 (2026-06-26) */}
                                    {hasMainGroups ? mainVisibleGroups.map((g,gi) => {
                                        if (!g.label) {
                                            const h = g.cols[0];
                                            {/* 3층: 중간 라벨 있는 무그룹 열(엑셀 Total>포인트) — 1층은 엑셀처럼 빈칸 (2026-08-24) */}
                                            if (hasMainMids && activeColMids[h]) return (
                                                <th key={`sg-${gi}`} className={`${thPx} border-r border-slate-400`} style={{background:'var(--head-bg)'}}/>
                                            );
                                            if (h === EXEC_NO_COL) return (
                                                <th key={`sg-${gi}`} rowSpan={headRows}
                                                    className={`${thPx} text-center text-slate-400 text-[11px] border-r border-slate-400`}
                                                    style={{background:'var(--head-bg)', width: getW(h)||90, minWidth: getW(h)||90, whiteSpace:'nowrap'}}>
                                                    실행번호
                                                </th>
                                            );
                                            return (
                                                <th key={`sg-${gi}`} rowSpan={headRows} data-col={h}
                                                    className={`${thPx} relative align-middle ${isPinH(h)?'border-r-2 border-blue-400 frz-edge':'border-r border-slate-400'} ${isFrz(h)?'z-40':''}${grpSep(h)}`}
                                                    style={{...(isStatusCol(h)?{}:{width:getW(h)||40, minWidth:getW(h)||40, maxWidth:getW(h)||40}), ...(isFrz(h)?{position:'sticky',left:frozenOffsets[h],background:'var(--head-bg)'}:{})}}
                                                    onDoubleClick={()=>toggleFreeze(h)} onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setHeaderMenu({ h, x: e.clientX, y: e.clientY }); }}>
                                                    {isFilterable(h) ? ComboFilter({ h }) : SortHeader({ h })}
                                                    <div className="absolute -right-[7px] top-0 bottom-0 w-[14px] cursor-col-resize hover:bg-blue-500/50 z-50"
                                                        onMouseDown={e => startResize(h, e)} onDoubleClick={e => { e.stopPropagation(); autoFitCol(h); }}/>
                                                </th>
                                            );
                                        }
                                        {
                                            return (
                                            <th key={`g-${gi}`} colSpan={g.cols.length}
                                                className={`${thPx} text-center border-b-2 border-r border-slate-400 grp-sep`}
                                                style={{ background:'var(--head-bg)', borderBottomColor:'var(--brand)' }}>
                                                <span style={{ fontWeight:700, fontSize:11, letterSpacing:'0.05em' }}>{g.label}</span>
                                            </th>
                                            );
                                        }
                                    }) : mainVisibleHeaders.map(h => {
                                        if (h === EXEC_NO_COL) return (
                                            <th key={h} className={`${thPx} text-center text-slate-400 text-[11px] border-r border-slate-400`}
                                                style={{background:'var(--head-bg)', width: getW(h)||90, minWidth: getW(h)||90, whiteSpace:'nowrap'}}>
                                                실행번호
                                            </th>
                                        );
                                        return (
                                        <th key={h}
                                            className={`${thPx} relative ${isPinH(h)?'border-r-2 border-blue-400 frz-edge':'border-r border-slate-400'} ${isFrz(h)?'z-40':''}`}
                                            style={isFrz(h)?{position:'sticky',left:frozenOffsets[h],background:'var(--head-bg)'}:{}}
                                            onDoubleClick={()=>toggleFreeze(h)} onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setHeaderMenu({ h, x: e.clientX, y: e.clientY }); }}>
                                            {isFilterable(h) ? ComboFilter({ h }) : SortHeader({ h })}
                                            <div className="absolute -right-[7px] top-0 bottom-0 w-[14px] cursor-col-resize hover:bg-blue-500/50 z-50"
                                                onMouseDown={e => startResize(h, e)} onDoubleClick={e => { e.stopPropagation(); autoFitCol(h); }}/>
                                        </th>
                                        );
                                    })}
                                    <th rowSpan={hasMainGroups?headRows:1} className={`${actTdPx} text-center text-slate-400 ${mgrSz} font-bold sticky right-0 z-40`} style={{background:'var(--head-bg)'}}>관리</th>
                                </tr>
                                {/* 3층 중간행 (2026-08-24): Total · 진행현황 · 시운전 — 라벨 없는 열(날짜·내용)은 여기서 2층 세로 통합 헤더 */}
                                {hasMainMids && (
                                    <tr className="border-b border-slate-800">
                                        {mainVisibleGroups.map((g,gi) => {
                                            if (!g.label) {
                                                const h = g.cols[0];
                                                if (!activeColMids[h]) return null;
                                                return (
                                                    <th key={`mid-s-${gi}`} className={`${thSub} mid-head text-center border-r border-slate-400`} style={{background:'var(--head-bg)'}}>
                                                        <span className="font-bold text-[10px]" style={{ color:'#333' }}>{activeColMids[h]}</span>
                                                    </th>
                                                );
                                            }
                                            const segs = [];
                                            g.cols.forEach(h => {
                                                const m = activeColMids[h] || '';
                                                const last = segs[segs.length - 1];
                                                if (last && m !== '' && last.m === m) last.cols.push(h); else segs.push({ m, cols: [h] });
                                            });
                                            return segs.map((sg, si) => sg.m ? (
                                                <th key={`mid-${gi}-${si}`} colSpan={sg.cols.length}
                                                    className={`${thSub} mid-head text-center border-r border-slate-400${grpSep(sg.cols[sg.cols.length - 1])}`}
                                                    style={{ background:'var(--head-bg)' }}>
                                                    <span className="font-bold text-[10px]" style={{ color:'#333' }}>{sg.m}</span>
                                                </th>
                                            ) : sg.cols.map((h, ci) => (
                                                <th key={`mid-${gi}-${si}-${ci}`} data-col={h} rowSpan={2}
                                                    className={`${thSub} relative align-middle ${isPinH(h)?'border-r-2 border-blue-400 frz-edge':'border-r border-slate-400'} ${isFrz(h)?'z-40':''}${grpSep(h)} ${(colWidths[h]||fitWidths[h])?'col-clip':''}`}
                                                    style={{width: getW(h)||40, minWidth: getW(h)||40, maxWidth: getW(h)||40, '--cw': `${getW(h)||40}px`, ...(isFrz(h)?{position:'sticky',left:frozenOffsets[h]}:{}), background:'var(--head-bg)', ...(centerCol(h)?{textAlign:'center'}:{})}}
                                                    onDoubleClick={()=>toggleFreeze(h)} onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setHeaderMenu({ h, x: e.clientX, y: e.clientY }); }}>
                                                    {isFilterable(h)
                                                        ? ComboFilter({ h, small: true })
                                                        : SortHeader({ h, small: true })}
                                                    <div className="absolute -right-[7px] top-0 bottom-0 w-[14px] cursor-col-resize hover:bg-blue-500/50 z-50"
                                                        onMouseDown={e => startResize(h, e)} onDoubleClick={e => { e.stopPropagation(); autoFitCol(h); }}/>
                                                </th>
                                            )));
                                        })}
                                    </tr>
                                )}
                                {hasMainGroups && (
                                    <tr className="border-b border-slate-800">
                                        {mainVisibleGroups.map((g,gi) => {
                                            if (!g.label) {
                                                const h0 = g.cols[0];
                                                if (!(hasMainMids && activeColMids[h0])) return null;   {/* 3층: 무그룹+중간라벨 열(포인트)의 세부 헤더 */}
                                                return [h0].map((h,ci) => (
                                                <th key={`sub-s-${gi}-${ci}`} data-col={h}
                                                    className={`${thSub} relative ${isPinH(h)?'border-r-2 border-blue-400 frz-edge':'border-r border-slate-400'} ${isFrz(h)?'z-40':''}${grpSep(h)} ${(colWidths[h]||fitWidths[h])?'col-clip':''}`}
                                                    style={{width: getW(h)||40, minWidth: getW(h)||40, maxWidth: getW(h)||40, '--cw': `${getW(h)||40}px`, ...(isFrz(h)?{position:'sticky',left:frozenOffsets[h]}:{}), background:'var(--head-bg)', ...(centerCol(h)?{textAlign:'center'}:{})}}
                                                    onDoubleClick={()=>toggleFreeze(h)} onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setHeaderMenu({ h, x: e.clientX, y: e.clientY }); }}>
                                                    {isFilterable(h)
                                                        ? ComboFilter({ h, small: true })
                                                        : SortHeader({ h, small: true })}
                                                    <div className="absolute -right-[7px] top-0 bottom-0 w-[14px] cursor-col-resize hover:bg-blue-500/50 z-50"
                                                        onMouseDown={e => startResize(h, e)} onDoubleClick={e => { e.stopPropagation(); autoFitCol(h); }}/>
                                                </th>
                                                ));
                                            }
                                            return g.cols.filter(h => !hasMainMids || activeColMids[h]).map((h,ci) => (
                                                <th key={`sub-${gi}-${ci}`} data-col={h}
                                                    className={`${thSub} relative ${isPinH(h)?'border-r-2 border-blue-400 frz-edge':'border-r border-slate-400'} ${isFrz(h)?'z-40':''}${grpSep(h)} ${(colWidths[h]||fitWidths[h])?'col-clip':''}`}
                                                    style={{width: getW(h)||40, minWidth: getW(h)||40, maxWidth: getW(h)||40, '--cw': `${getW(h)||40}px`, ...(isFrz(h)?{position:'sticky',left:frozenOffsets[h]}:{}), background:'var(--head-bg)', ...(centerCol(h)?{textAlign:'center'}:{})}}
                                                    onDoubleClick={()=>toggleFreeze(h)} onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setHeaderMenu({ h, x: e.clientX, y: e.clientY }); }}>
                                                    {isFilterable(h)
                                                        ? ComboFilter({ h, small: true })
                                                        : SortHeader({ h, small: true })}
                                                    <div className="absolute -right-[7px] top-0 bottom-0 w-[14px] cursor-col-resize hover:bg-blue-500/50 z-50"
                                                        onMouseDown={e => startResize(h, e)} onDoubleClick={e => { e.stopPropagation(); autoFitCol(h); }}/>
                                                </th>
                                            ));
                                        })}
                                    </tr>
                                )}
                            </thead>
                            <tbody ref={tbodyRef} className="divide-y divide-slate-800/50">
                                {sortedRows.length === 0 ? (
                                    <tr>
                                        <td colSpan={mainVisibleHeaders.length+2} className="py-20 text-center">
                                            {(!fbLoaded && dataSource === 'firebase') ? (
                                                <>
                                                    <div className="inline-block w-6 h-6 border-[3px] border-[#1e7ac8] border-t-transparent rounded-full animate-spin mb-3"/>
                                                    <p className="text-slate-400 font-bold text-base mb-1">데이터를 불러오는 중입니다…</p>
                                                </>
                                            ) : (
                                                <>
                                                    <p className="text-slate-400 font-bold text-base mb-1">조건에 맞는 데이터가 없습니다.</p>
                                                    <p className="text-slate-600 text-sm">필터/검색 조건을 변경해보세요.</p>
                                                </>
                                            )}
                                        </td>
                                    </tr>
                                ) : (
                                // 행 렌더 본체를 매 렌더마다 최신 클로저로 갱신(ref) → MemoRow는 신호가 바뀐 행만 이걸 실행 (2026-08-25)
                                // eslint-disable-next-line no-sequences
                                rowCtxRef.current.renderRow = (row, ri) => {
                                    const isSelected    = selectedRowId    === row._id;
                                    const isHlRow       = highlightedRowId === row._id;
                                    // 고정(sticky) 열은 스크롤 내용이 밑으로 지나가므로 배경 반투명 금지 — 같은 톤 불투명 색 (2026-08-11 틀고정 겹침 수리)
                                    const rowBg = isHlRow ? '#fdf3d8' : isSelected ? '#dbeafe' : '#ffffff';
                                    return (
                                    <tr key={row._id}
                                        data-row-id={row._id}
                                        className={`group cursor-pointer
                                            ${isHlRow
                                                ? 'tr-highlighted border-l-[3px] border-l-amber-400'
                                                : isSelected ? 'bg-blue-50 ring-1 ring-inset ring-blue-300' : 'hover:bg-white/5'}`}
                                        style={isHlRow ? { backgroundColor: 'rgba(251,191,36,0.18)' } : {}}
                                        onClick={() => setSelectedRowId(prev => prev === row._id ? null : row._id)}
                                        /* 행 더블클릭 → 상세 팝업 제거 (2026-08-28 팀장님: 셀 편집 중 더블클릭에 팝업이 튀어 혼란) — 상세 팝업은 우클릭 메뉴 [상세 보기/수정]으로만 */
                                        onContextMenu={e => { e.preventDefault(); e.stopPropagation(); const _td = e.target.closest && e.target.closest('td'); const _ci = _td ? _td.cellIndex : -1; setContextMenu({ x: e.clientX, y: e.clientY, row, col: (_ci >= 0 && _ci < mainVisibleHeaders.length) ? mainVisibleHeaders[_ci] : null }); }}>
                                        {/* No. 칸 제거 — 엑셀 '번호'와 중복 (2026-06-26) */}
                                        {mainVisibleHeaders.map(h => {
                                            // 서식 (2026-09-01): 행 서식 위에 칸 서식 덮어쓰기 — CSS 변수+클래스 (index.css !important를 이기려면 클래스 필수)
                                            const _ff = row._fmt ? { ...(row._fmt.row || {}), ...((row._fmt.cells || {})[h] || {}) } : null;
                                            const _ffCls = _ff ? `${_ff.b ? ' fmt-w' : ''}${_ff.c ? ' fmt-c' : ''}${_ff.bg ? ' fmt-b' : ''}` : '';
                                            const _ffSty = _ff ? { ...(_ff.c ? { '--fmc': _ff.c } : {}), ...(_ff.bg ? { '--fmb': _ff.bg } : {}) } : {};
                                            // 실행번호 — 전용 셀
                                            if (h === EXEC_NO_COL) return (
                                                <td key={h} className={`${tdPx} text-center text-[11px] border-r border-cyan-800/30${_ffCls}`}
                                                    style={{background: isHlRow ? 'rgba(251,191,36,0.28)' : row[EXEC_NO_COL] ? '#f0f9ff' : rowBg, color: isHlRow ? '#92400e' : row[EXEC_NO_COL] ? '#1a1a1a' : '#64748b', width: getW(h)||90, minWidth: getW(h)||90, ..._ffSty}}>
                                                    {row[EXEC_NO_COL] || '—'}
                                                </td>
                                            );
                                            const isEd = editingCell.id===row._id && editingCell.key===h;
                                            if (isEd) return (
                                                // 편집 칸 = 보통 칸과 같은 상자(패딩·테두리·폭) + 안쪽 그림자 강조 (2026-08-26 속도):
                                                //   종전엔 테두리 4면·패딩 축소·w-full 입력창(고유폭 ~150px)이 열 폭을 바꿔 표 전체가 다시 배치됐음
                                                <td key={h} className={`${tdPx} align-middle ${isPinH(h)?'border-r-2 border-blue-400/50 frz-edge':'border-r border-slate-400'} ${isFrz(h)?'z-10':''}`}
                                                    style={{ width: getW(h)||40, minWidth: getW(h)||40, maxWidth: getW(h)||40, boxShadow: `inset 0 0 0 2px ${isDateCol(h)?'#3b82f6':'#10b981'}`, background: isDateCol(h)?'#fff':'#ecfdf5', ...(isFrz(h)?{position:'sticky',left:frozenOffsets[h]}:{}) }}>
                                                    {isDateCol(h) ? (
                                                        /* 날짜 편집 = 엑셀식 (2026-09-02 팀장님): 자유 타이핑(260126·26/01/26…) + 달력 버튼 + 전체선택이라 Del 한 번에 지움 */
                                                        <span style={{ display: 'flex', alignItems: 'center' }}>
                                                            <input autoFocus type="text" defaultValue={editingCell.value} placeholder="260126"
                                                                onChange={e=>{ editValRef.current = e.target.value; editDirtyRef.current = true; }}
                                                                onFocus={e=>e.target.select()} onBlur={commitCellEdit}
                                                                onKeyDown={e=>{ if(e.key==='Enter'){ kbNavRef.current=e.shiftKey?'up':'down'; e.preventDefault(); commitCellEdit(); } else if(e.key==='Tab'){ kbNavRef.current=e.shiftKey?'left':'right'; e.preventDefault(); commitCellEdit(); } else if(e.key==='ArrowDown'||e.key==='ArrowUp'){ kbNavRef.current=(e.key==='ArrowDown'?'down':'up'); e.preventDefault(); commitCellEdit(); } else if((e.key==='ArrowLeft'||e.key==='ArrowRight')&&!editDirtyRef.current){ kbNavRef.current=(e.key==='ArrowLeft'?'left':'right'); e.preventDefault(); commitCellEdit(); } else if(e.key==='Escape'){ const _ec=editingCell; setEditingCell({id:null,key:null,value:''}); moveCursorFromRef.current(_ec,'stay'); } }}
                                                                style={{ width: editWRef.current ? `${Math.max(24, editWRef.current - 16)}px` : '100%', boxSizing: 'border-box', padding: 0, margin: 0, border: 'none', outline: 'none', background: 'transparent', font: 'inherit', lineHeight: 'inherit', color: '#111827', display: 'block' }}/>
                                                            <button type="button" title="달력에서 고르기" tabIndex={-1}
                                                                onMouseDown={e=>e.preventDefault()}
                                                                onClick={e=>{ e.stopPropagation(); const p = datePickRef.current; if (p) { try { if (p.showPicker) p.showPicker(); else p.click(); } catch (err) {} } }}
                                                                style={{ border: 'none', background: 'transparent', padding: 0, margin: 0, cursor: 'pointer', fontSize: 12, lineHeight: 1 }}>📅</button>
                                                            <input ref={datePickRef} type="date" tabIndex={-1}
                                                                defaultValue={parseDateFlex(String(editingCell.value || '')) || ''}
                                                                onChange={e=>{ if (e.target.value) { editValRef.current = e.target.value; commitCellEdit(); } }}
                                                                style={{ width: 0, height: 0, opacity: 0, border: 'none', padding: 0, margin: 0 }}/>
                                                        </span>
                                                    ) : (
                                                        <input autoFocus type="text" defaultValue={editingCell.value}
                                                            onChange={e=>{ editValRef.current = e.target.value; editDirtyRef.current = true; }}
                                                            onFocus={e=>e.target.select()} onBlur={commitCellEdit}
                                                            onKeyDown={e=>{ if(e.key==='Enter'){ kbNavRef.current=e.shiftKey?'up':'down'; e.preventDefault(); commitCellEdit(); } else if(e.key==='Tab'){ kbNavRef.current=e.shiftKey?'left':'right'; e.preventDefault(); commitCellEdit(); } else if(e.key==='ArrowDown'||e.key==='ArrowUp'){ kbNavRef.current=(e.key==='ArrowDown'?'down':'up'); e.preventDefault(); commitCellEdit(); } else if((e.key==='ArrowLeft'||e.key==='ArrowRight')&&!editDirtyRef.current){ kbNavRef.current=(e.key==='ArrowLeft'?'left':'right'); e.preventDefault(); commitCellEdit(); } else if(e.key==='Escape'){ const _ec=editingCell; setEditingCell({id:null,key:null,value:''}); moveCursorFromRef.current(_ec,'stay'); } }}
                                                            style={{ width: editWRef.current ? `${editWRef.current}px` : '100%', boxSizing: 'border-box', padding: 0, margin: 0, border: 'none', outline: 'none', background: 'transparent', font: 'inherit', lineHeight: 'inherit', color: '#111827', display: 'block' }}/>
                                                    )}
                                                </td>
                                            );
                                            const val = row[h];
                                            const isHl = columnFilters[h] && String(val||'')===columnFilters[h];
                                            // 자동 칸 표시 (2026-08-20 팀장님): 수식 자동(기술1팀) · NAS 자동(기술2팀 행별) · 하위 합계 포인트 — 배경+툴팁으로 '기계가 채우는 칸' 예고
                                            const autoTip = isFmAutoCell(row, h) ? '자동 계산 칸 (수식)'
                                                : isPaAutoCell(row, h) ? '자동 계산 칸 (Point ÷ 포인트 %)'
                                                : isExtLockedCell(row, h) ? 'NAS 자동 칸 (원본 엑셀이 채움)'
                                                : (isPointCol(h) && getSubPt(row._id)) ? '하위(공종) 합계 자동' : null;
                                            // NAS 연결 행에서 규칙이 안 다루는 PLC·ETOS·HMI = 그 프로젝트 엑셀에 없는 항목 → ×표시 (2026-08-20 팀장님. 값이 남아있으면 값 우선)
                                            const nasX = ['PLC', 'ETOS', 'HMI'].includes(String(h).replace(/\s/g, ''))
                                                && extRulesOf(row).length > 0 && !isExtLockedCell(row, h) && !String(val || '').trim();
                                            return (
                                                <td key={h}
                                                    className={`${tdPx} align-middle cursor-text hover:bg-emerald-950/20
                                                        ${isPinH(h)?'border-r-2 border-blue-400/50 frz-edge':'border-r border-slate-400'}
                                                        ${isStatusCol(h)?'cursor-pointer':''}
                                                        ${cellSz}
                                                        ${isHl?'bg-amber-100 text-amber-900':''}
                                                        ${autoTip && !isHl ? 'cell-auto' : ''}
                                                        ${(!isHl && !autoTip && isGrayEmptyCol(h) && !String(val ?? '').trim() && !isNaItemCell(row, h) && !nasX) ? 'cell-empty' : ''}
                                                        ${isFrz(h)?'z-10':''}
                                                        ${(colWidths[h]||fitWidths[h])?'col-clip':''}
                                                        ${(draft[row._id] && Object.prototype.hasOwnProperty.call(draft[row._id].patch || {}, h)) ? 'cell-draft' : ''}${_ffCls}`}
                                                    style={{width: getW(h)||40, minWidth: getW(h)||40, maxWidth: getW(h)||40, '--cw': `${getW(h)||40}px`, ...(centerCol(h)?{textAlign:'center'}:{}), ...(isFrz(h)?{position:'sticky',left:frozenOffsets[h],background: isHl?'#fef3c7':rowBg}:{}), ..._ffSty}}
                                                    title={autoTip ? (autoTip + (val ? ' — ' + val : '')) : (val||'')}
                                                    onDoubleClick={e => {   // 번호 칸: 클릭=행 선택이라 편집은 더블클릭 (2026-08-31)
                                                        if (!isProjNoCol(h) || isNaItemCell(row, h)) return;
                                                        e.stopPropagation();
                                                        { const _cs = getComputedStyle(e.currentTarget); editWRef.current = Math.max(20, e.currentTarget.clientWidth - (parseFloat(_cs.paddingLeft) || 0) - (parseFloat(_cs.paddingRight) || 0)); }
                                                        clearSelPaint(); selRef.current = null;
                                                        setEditingCell({ id: row._id, key: h, value: String(val ?? '') });
                                                    }}
                                                    onClick={e=>{
                                                        e.stopPropagation();
                                                        if (fmtBarRef.current) { fmtSelectCell(row._id, h); return; }   // 서식 팔레트 켜짐 = 클릭은 대상 선택 (편집은 팔레트 닫고, 2026-09-01)
                                                        if (isNaItemCell(row, h)) return;   // 미적용(×) 칸 편집 잠금 (2026-07-21)
                                                        // ★ 수행번호(당해 연도) 손 키인 금지 (2026-08-28 팀장님: [+] 옆 빈 곳을 눌러 편집창이 열려 '011' 같은 값이 들어가는 사고) — [+] 자동 부여·✕ 회수만
                                                        if (isExecAssignRowCol(row, h) && !isSubListRow(row)) { showExtToast('수행번호는 손으로 키인할 수 없습니다 — 빈칸의 [+] = 다음 번호 자동 부여, ✕ = 회수'); return; }
                                                        { const _cs = getComputedStyle(e.currentTarget); editWRef.current = Math.max(20, e.currentTarget.clientWidth - (parseFloat(_cs.paddingLeft) || 0) - (parseFloat(_cs.paddingRight) || 0)); }
                                                        if (nasX) { setAlertMsg(`'${h}'은(는) 이 프로젝트의 NAS 진척자료(엑셀)에 없는 항목입니다.
NAS 연결 프로젝트의 진행률은 원본 엑셀이 기준이라 직접 키인하지 않습니다.`); return; }   // NAS 미포함 항목 (2026-08-20)
                                                        if (isExtLockedCell(row, h)) { setAlertMsg(`'${h}' 칸은 NAS 진척자료에서 자동으로 들어옵니다.\n수정은 NAS 원본 엑셀에서 하세요.\n(관리 칸의 NAS 버튼 = 상태 확인·새로고침)`); return; }   // NAS 자동 칸 잠금 (2026-07-22)
                                                        if (isFmAutoCell(row, h)) { setAlertMsg(`'${dispHeader(h)}' 칸은 자동 계산됩니다.
· 자체 시운전 = 금월 ÷ 총물량 %
· 누적 = 지난달까지 + 금월
· 공정률(전체·금월) = (PLC+ETOS+HMI+자체) ÷ 4
· 금월 = 진행실적 팝업 기준월 포인트 합 ([적용하기])
· 전월은 [월간 마감] 때 넘어갑니다

수정: PLC·ETOS·HMI·총물량은 셀에서, 시운전 수량은 진행실적 팝업에서.`); return; }   // 수식 자동 칸 잠금 (2026-08-19·08-20)
                                                        if (isPaAutoCell(row, h)) { setAlertMsg(`'${dispHeader(h)}' 칸은 자동 계산됩니다.
· 진행율% = Point ÷ 포인트(Total) × 100

수정: 포인트·Point 칸을 고치면 자동으로 따라 바뀝니다.
(건설 공사는 NAS 진척자료가 채웁니다)`); return; }   // 진행율% 자동 잠금 (2026-08-24)
                                                        const closeAll = () => { setStatusDropdown(null); setAssigneeDropdown(null); setClientDropdown(null); setVendorDropdown(null); setWordDropdown(null); };
                                                        if (isStatusCol(h)) {
                                                            closeAll();
                                                            const rect = e.currentTarget.getBoundingClientRect();
                                                            setStatusDropdown({ rowId: row._id, col: h, left: rect.left, width: Math.max(rect.width, 120), ...dropAnchor(rect, e.clientY) });
                                                        } else if (!isCustAsgCol(h) && (isAssigneeCol(h) || isManagerCol(h) || isCardAsgCol(h))) {   // 관리자 = 담당자와 같은 드롭다운 (2026-07-22) · 카드 담당자식열 (2026-08-21)
                                                            closeAll();
                                                            const rect = e.currentTarget.getBoundingClientRect();
                                                            setAssigneeDropdown({ rowId: row._id, col: h, left: rect.left, width: Math.max(rect.width, 160), ...dropAnchor(rect, e.clientY) });
                                                        } else if (isClientCol(h)) {
                                                            closeAll();
                                                            const rect = e.currentTarget.getBoundingClientRect();
                                                            setClientDropdown({ rowId: row._id, col: h, left: rect.left, width: Math.max(rect.width, 140), ...dropAnchor(rect, e.clientY) });
                                                        } else if (isVendorAssCol(h)) {
                                                            closeAll();
                                                            const rect = e.currentTarget.getBoundingClientRect();
                                                            setVendorDropdown({ rowId: row._id, col: h, left: rect.left, width: Math.max(rect.width, 140), ...dropAnchor(rect, e.clientY) });
                                                        } else if (wordDropKey(h)) {
                                                            // 단어(카테고리) 칸 — 사전 목록+열에 쓰인 단어에서 택1 (2026-08-19 팀장님 협의)
                                                            closeAll();
                                                            const rect = e.currentTarget.getBoundingClientRect();
                                                            setWordDropdown({ rowId: row._id, col: h, preset: wordDropCols[wordDropKey(h)] || [], left: rect.left, width: Math.max(rect.width, 110), ...dropAnchor(rect, e.clientY) });
                                                        } else if (isProjNoCol(h)) {
                                                            // 번호 칸 클릭 = 행 전체 선택 (2026-08-31 엑셀 행 머리글처럼) · Shift+클릭 = 여러 행 · 번호 편집 = 더블클릭
                                                            closeAll();
                                                            const riNo = sortedRowsRef.current.findIndex(r => r._id === row._id);
                                                            if (riNo >= 0) {
                                                                const lastC = mainVisibleHeaders.length - 1;
                                                                const prev = selRef.current;
                                                                if (e.shiftKey && prev && prev.c1 === 0 && prev.c2 === lastC) selRef.current = { r1: Math.min(prev.r1, riNo), r2: Math.max(prev.r2, riNo), c1: 0, c2: lastC };
                                                                else selRef.current = { r1: riNo, r2: riNo, c1: 0, c2: lastC };
                                                                selAnchor2Ref.current = { r: selRef.current.r1, c: 0 }; selActiveRef.current = { r: riNo, c: lastC };   // 키보드 이동 기준 (2026-09-03)
                                                                paintSel();
                                                            }
                                                        } else if (isDateCol(h)) {
                                                            setEditingCell({id:row._id,key:h,value:fmtDate(val, row._year)});   // 편집 표기 = 표와 같은 YY/MM/DD (2026-09-02, 좀은 칸에 다 보임)
                                                        } else if (isPointCol(h)) {
                                                            // 포인트 칸 = 엑셀 값 자체 편집 (2026-07-21). 하위(공종) 있으면 Σ 자동합이라 잠금 유지 (2026-07-20 2단계)
                                                            if (getSubPt(row._id)) { setAlertMsg('하위(공종)가 있는 프로젝트는 포인트가 하위 합계로 자동 계산됩니다.\n하위 행에서 수정하세요.'); return; }
                                                            setEditingCell({id:row._id,key:h,value: String(val ?? '')});
                                                        } else {
                                                            setEditingCell({id:row._id,key:h,value: isPctCol(h) ? String(val||'').replace(/%/g,'') : (val||'')});
                                                        }
                                                    }}>
                                                    {isExecNoCol(h) && !isSubListRow(row) ? (
                                                        !isExecAssignRowCol(row, h) ? (val ? val : <span style={{ color:'#6b7280', fontWeight:700 }}>-</span>)
                                                        : val ? (<span style={{ display:'inline-flex', alignItems:'center', gap:4 }}>{val}
                                                            <button className="exec-del" title="수행번호 회수(비우기)" onClick={e => { e.stopPropagation(); revokeExecNo(row, h); }}
                                                                style={{ border:'none', background:'transparent', color:'#94a3b8', fontSize:'10px', lineHeight:1, padding:'0 2px', cursor:'pointer' }}>✕</button></span>)
                                                        : (<button title={`다음 수행번호 자동 부여 (${execMaxOf(row._year, h).yy}-${String(execMaxOf(row._year, h).max + 1).padStart(3, '0')})`} onClick={e => { e.stopPropagation(); assignExecNo(row, h); }}
                                                            style={{ border:'1px dashed #94a3b8', background:'#fff', color:'#1e7ac8', fontSize:'11px', fontWeight:800, lineHeight:1, padding:'1px 6px', borderRadius:'4px', cursor:'pointer' }}>+</button>)
                                                    ) : isNaItemCell(row, h) ? (<span title="이 프로젝트엔 해당 없는 항목 (상세설정에서 적용/미적용)" style={{color:'#c0c8d4',fontWeight:700,fontSize:'13px'}}>×</span>)
                                                    : nasX ? (<span title="NAS 진척자료(엑셀)에 없는 항목 — 이 프로젝트는 대상 아님" style={{color:'#c0c8d4',fontWeight:700,fontSize:'13px'}}>×</span>)
                                                    : isStatusCell(h) && val ? (() => {
                                                        const nv = String(val).toUpperCase() === 'HOLD' ? 'Hold' : val;
                                                        const disp = String(val).toLowerCase() === 'sub' ? '하위' : nv;
                                                        const c = STATUS_COLORS[nv] || { bg:'rgba(100,116,139,0.08)', text:'#475569', border:'rgba(100,116,139,0.3)' };
                                                        const _m = mapLegacyStatus(nv);
                                                        return (
                                                            <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-start', gap:2 }}>
                                                                <span style={{ display:'inline-flex', padding:'1px 8px', fontSize:'11px', fontWeight:700, backgroundColor:c.bg, color:c.text, border:`1px solid ${c.border}`, borderRadius:'5px', whiteSpace:'nowrap' }}>{disp}</span>
                                                                {showLegacySub && (_m.contractStatus || _m.workStatus) ? (
                                                                    <span style={{ fontSize:11, whiteSpace:'nowrap', lineHeight:1.2 }} title="자동 2단계 — 계약현황 · 작업현황"><span style={{ color:'#fbbf24' }}>{_m.contractStatus || '–'}</span><span style={{ color:'#64748b' }}> · </span><span style={{ color:'#60a5fa' }}>{_m.workStatus || '–'}</span></span>
                                                                ) : null}
                                                            </div>
                                                        );
                                                    })() : isDateCol(h) && val ? fmtDate(val, row._year) : isCardAsgCol(h) ? (decorateAsg(val) || <span className="text-slate-700">—</span>) : h === assigneeFilterCol ? (normalizeAssignee(val) || <span className="text-slate-700">—</span>) : isPointCol(h) ? (() => {
                                                        // 포인트 칸 = 엑셀 값만 표시 ('실적/총점' 복합표시 폐지, 2026-07-21 팀장님). 하위 있으면 Σ 자동합 (2026-07-20 2단계).
                                                        const _sp = getSubPt(row._id);
                                                        const _auto = !!(_sp && _sp.sum > 0);
                                                        if (!_auto && String(val ?? '').trim() === '') return <span className="text-slate-700">—</span>;
                                                        const _tot = _auto ? _sp.sum : String(val).trim();
                                                        const _tip = _auto ? `포인트 ${_tot} = 하위 ${_sp.count}개 합계 (자동)` : undefined;
                                                        return <span title={_tip} style={{wordBreak:'break-word',lineHeight:1.4,fontWeight:700,color:'#1e293b'}}>{_auto ? 'Σ ' : ''}{String(_tot)}</span>;
                                                    })() : (h === projectNameCol && isSubListRow(row) ? <span style={{whiteSpace:'nowrap'}}><span style={{color:'#7c3aed', fontWeight:800, marginRight:5}} title="하위(공종) 행 — 실행번호 s">└ 하위</span>{val ? <span style={{wordBreak:'break-word',lineHeight:1.4}}>{pctCell(h, val)}</span> : null}</span> : val ? <span style={{wordBreak:'break-word',lineHeight:1.4}}>{pctCell(h, val)}</span> : <span className="text-slate-700">—</span>)}
                                                </td>
                                            );
                                        })}
                                        <td className="px-0.5 py-0 text-left sticky right-0 bg-white group-hover:bg-blue-50 shadow-[-2px_0_4px_rgba(0,0,0,0.05)]">
                                            {(() => {
                                                const wKey = row._pid || row['실행번호'] || row.execNo || '';   // 주간보고 연결 키 = pid (실행번호 폐지, 2026-07-21)
                                                const hasLink = wKey && weeklyLinks?.[wKey];
                                                const isActivePanelRow = weeklyPanel?.projectId === wKey;
                                                const projName = row['공사명'] || row['프로젝트명'] || row['Project'] || '';
                                                return (
                                                    <div className="flex items-center justify-center gap-0.5 opacity-40 group-hover:opacity-100">
                                                        {/* 주간보고 연결·열기·해제 — 현재 미사용, 숨김 (2026-08-20 팀장님, 3팀 공통. false 지우면 복구) */}
                                                        {false && (hasLink ? (
                                                            <>
                                                                <button
                                                                    onClick={e => { e.stopPropagation(); isActivePanelRow ? setWeeklyPanel?.(null) : onOpenWeeklyPanel?.(wKey); }}
                                                                    className={`p-1.5 rounded transition-colors ${isActivePanelRow ? 'bg-indigo-500/30 text-indigo-300 ring-1 ring-indigo-400/60' : 'hover:bg-indigo-500/20 text-indigo-400 hover:text-indigo-300'}`}
                                                                    title={isActivePanelRow ? '주간보고 닫기' : `주간보고 열기: ${weeklyLinks[wKey].fileName}`}>
                                                                    <PanelRight size={14}/>
                                                                </button>
                                                                <button
                                                                    onClick={e => { e.stopPropagation(); onWeeklyDownload?.(wKey); }}
                                                                    className="p-1.5 hover:bg-emerald-500/20 rounded text-slate-500 hover:text-emerald-400 transition-colors"
                                                                    title={`주간보고 다운로드: ${weeklyLinks[wKey].fileName}`}>
                                                                    <Download size={13}/>
                                                                </button>
                                                                <button
                                                                    onClick={e => { e.stopPropagation(); onWeeklyUnlink?.(wKey); }}
                                                                    className="p-1.5 hover:bg-rose-500/10 rounded text-slate-500 hover:text-rose-400 transition-colors"
                                                                    title="주간보고 연결 해제">
                                                                    <Link2Off size={13}/>
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <button
                                                                onClick={e => { e.stopPropagation(); onOpenWeeklyLinkModal?.(wKey, projName); }}   /* pid 키 — 실행번호 검사 폐지 (2026-07-21) */
                                                                className="p-1.5 hover:bg-indigo-500/20 rounded text-slate-500 hover:text-indigo-400 transition-colors"
                                                                title="주간보고 연결 (엑셀 첨부)">
                                                                <Link size={13}/>
                                                            </button>
                                                        ))}
                                                        {/* 규칙 칩 버튼 — RULE_UI_ENABLED 로 켠다 (2026-07-31). 규칙 있음=색 칩 / 없음=미첨부 표시(× 겹침, 2026-08-20 팀장님 — 전 사용자에게 보임) */}
                                                        {RULE_UI_ENABLED && !isSubListRow(row) && (() => {
                                                            const hasRule = extRulesRawOf(row).length > 0;
                                                            if (!hasRule) return (
                                                                <button onClick={e => { e.stopPropagation(); if (isAdmin) setExtModalRowId(row._id); else setAlertMsg(`이 프로젝트는 NAS 진척자료(엑셀)가 첨부되지 않았습니다.
자동 반영 없이 직접 키인으로 관리합니다.
(첨부 등록은 관리자가 합니다)`); }}
                                                                    className="p-0.5 rounded transition-colors hover:bg-slate-100"
                                                                    title={isAdmin ? 'NAS 진척자료 미첨부 — 클릭하여 규칙 등록' : 'NAS 진척자료 미첨부 — 자동 반영 없음 (직접 키인 관리)'}>
                                                                    <span style={{ position: 'relative', display: 'inline-flex' }}>
                                                                        <HardDrive size={13} color="#cbd5e1"/>
                                                                        <X size={9} strokeWidth={4} color="#94a3b8" style={{ position: 'absolute', right: -4, top: -4, background: '#fff', borderRadius: '50%' }}/>
                                                                    </span>
                                                                </button>
                                                            );
                                                            const st = extStatus[row._id];
                                                            const fill = (!st || st.state === 'nofolder') ? '#1e7ac8' : st.state === 'changed' ? '#7c3aed' : st.state === 'perm' ? '#d97706' : st.state === 'error' ? '#dc2626' : st.state === 'ok' ? '#059669' : '#1e7ac8';
                                                            const _nfRaw = (st?.files && st.files.length ? st.files : (row._extSync?.lastFiles || []));
                                                            // 칩 순서 통일 (2026-09-01 팀장님: 등록 순서와 무관하게 P9·P10 전용 파일 먼저 → 공통(진행현황·공용) 2번째)
                                                            const _nfKey = (f) => (String(f.name || '').replace(/\.[^.]+$/, '').match(/^[A-Za-z]+\d+/) ? 0 : 2) + (f.shared ? 1 : 0);
                                                            const nasFiles = [..._nfRaw].sort((a, b) => _nfKey(a) - _nfKey(b));
                                                            return (<>
                                                            {/* 파일별 원클릭 [엑셀로 열기] (2026-08-24 팀장님) — 맨 앞: 등록 후엔 파일 열기가 주 용도. 라벨=파일명 머리글, 전체 이름은 툴팁 */}
                                                            {nasFiles.slice(0, 3).map((f, fi) => {
                                                                const _bn = String(f.name || '').replace(/\.[^.]+$/, '');
                                                                const _tk = _bn.match(/^[A-Za-z]+\d+/);   // P9·P10 같은 영문+숫자 머리글은 통째로 (잘림 방지, 2026-08-24)
                                                                const _lb = _tk ? _tk[0] : (_bn.replace(/^[\d\s_-]+/, '').slice(0, 2) || 'XL');
                                                                return (
                                                                    <button key={fi} onClick={e => { e.stopPropagation(); extOpenExcelRow(row, f); }}
                                                                        className="rounded transition-colors hover:bg-emerald-100"
                                                                        style={{ padding: '1px 3px', border: '1px solid #a7d7c5', background: '#e8f6f0', color: '#047857', fontSize: 9.5, fontWeight: 800, lineHeight: 1.4, whiteSpace: 'nowrap', cursor: 'pointer' }}
                                                                        title={`엑셀로 열기 — ${f.name}${f.shared ? ' (공용 폴더)' : ''}`}>
                                                                        {_lb}
                                                                    </button>
                                                                );
                                                            })}
                                                            <button onClick={e => { e.stopPropagation(); setExtModalRowId(row._id); }}
                                                                className="p-0.5 hover:bg-sky-500/20 rounded transition-colors"
                                                                style={{ background: fill }}
                                                                title={NAS_SYNC_ENABLED
                                                                    ? 'NAS 자동: ' + (!st || st.state === 'nofolder' ? '파일 연계 등록됨 — 클릭하여 열기·상태 확인' : (st.msg || st.state))
                                                                    : '자동 반영 규칙 등록됨 — 클릭하여 확인·수정'}>
                                                                <HardDrive size={13} color="#fff"/>
                                                            </button>
                                                            </>);
                                                        })()}
                                                        {/* 행 저장 — 현재 미사용, 숨김 (2026-08-20 팀장님. 셀 편집이 즉시 저장이라 중복 기능) */}
                                                        {false && (<button onClick={e => { e.stopPropagation(); confirmSaveRow(row); }}
                                                            className="p-1.5 hover:bg-emerald-500/20 rounded text-slate-500 hover:text-emerald-400 transition-colors"
                                                            title="저장">
                                                            <Save size={13}/>
                                                        </button>)}
                                                    </div>
                                                );
                                            })()}
                                        </td>
                                    </tr>
                                    );
                                }, (() => {
                                    const total = sortedRows.length;
                                    if (!winReady || total <= WIN_MIN) return sortedRows.map((row, ri) => <MemoRow key={row._id} row={row} ri={ri} sig={rowSig(row)} ctx={rowCtxRef}/>);
                                    const z = (tableScale || 100) / 100;
                                    const rowH = winRowHRef.current || 30;
                                    const cnt = winCntRef.current;
                                    const start = Math.max(0, Math.min(winStart, Math.max(0, total - cnt)));
                                    const end = Math.min(total, start + cnt);
                                    const nCols = mainVisibleHeaders.length + 2;
                                    return (<>
                                        {start > 0 && <tr aria-hidden="true"><td colSpan={nCols} style={{ height: start * rowH / z, padding: 0, border: 0 }}/></tr>}
                                        {sortedRows.slice(start, end).map((row, i) => <MemoRow key={row._id} row={row} ri={start + i} sig={rowSig(row)} ctx={rowCtxRef}/>)}
                                        {end < total && <tr aria-hidden="true"><td colSpan={nCols} style={{ height: (total - end) * rowH / z, padding: 0, border: 0 }}/></tr>}
                                    </>);
                                })())}
                            </tbody>
                                </>);
                            })()}
                        </table>
                    </div>
                    <div className="px-5 py-2.5 border-t border-slate-800 bg-slate-900/60 flex items-center justify-between text-xs shrink-0">
                        <span className="text-slate-600">
                            표시 <span className="text-slate-300 font-bold">{sortedRows.length}</span> /
                            전체 <span className="text-slate-300 font-bold">{monthFilteredRows.length}</span>행{availableYears.length > 0 ? <span className="text-slate-600"> ({selectedYear}년)</span> : ''} ·
                            주요열 <span className="text-slate-300 font-bold">{mainVisibleHeaders.length}</span> / 전체 {activeHeaders.length}개
                            {selectedRowId && <span className="ml-3 text-violet-400 font-bold">· 행 선택됨 — 프로젝트 추가 시 초기값으로 복사</span>}
                            {/* 정렬 상태 표시 + 1클릭 해제 (2026-08-28 팀장님: 헤더 정렬이 켜진 줄 몰라 '번호 넣으면 행이 움직인다' 혼란 — 왜 움직이는지 여기서 보이게) */}
                            {sortConfig.key && <span className="ml-3 font-bold" style={{ color: '#1e7ac8' }}>· 정렬: {dispHeader(sortConfig.key)} {sortConfig.dir === 'asc' ? '↑ 오름차순' : '↓ 내림차순'}
                                <button onClick={() => setSortConfig({ key: null, dir: 'asc' })} title="정렬을 끄고 기본 순서(번호 순)로" style={{ marginLeft: 6, padding: '0 6px', border: '1px solid #7fb3e3', borderRadius: 4, background: '#eaf3fc', color: '#1e7ac8', fontWeight: 800, cursor: 'pointer' }}>해제</button></span>}
                            {/* 메인 PC 표시 (2026-07-27) — 관리자 메뉴가 안 보이는 일반 계정도 이 PC의 자동 반영 여부를 알 수 있게 */}
                            {/* NAS_SYNC_ENABLED=false 이면 배지도 숨김 (2026-07-30) */}
                            {NAS_SYNC_ENABLED && extMainPc && (
                                <span className="ml-3 font-bold" style={{ color: '#059669' }}
                                    title={`이 PC가 메인 PC입니다. 30분마다 NAS 진척자료를 확인해 자동 반영합니다.${extMainTeams.length > 1 ? `\n지켜보는 팀 ${extMainTeams.length}개: ${extMainTeams.join(', ')} — 15분마다 화면을 번갈아 엽니다.` : ''}${extLastAuto ? `\n마지막 확인 ${extLastAuto}` : ''}\n(끄기: 관리자 계정 → 설정 메뉴)`}>
                                    · ● 메인 PC 자동 반영 중 · {extMainTeams.join(', ')}{extLastAuto ? ` (${extLastAuto} 확인)` : ''}
                                </span>
                            )}
                            {/* 자동 반영기 배지 (2026-07-31) — 규칙 화면을 안 열어도 프로그램이 살아있는지 보이게 */}
                            {RULE_UI_ENABLED && !NAS_SYNC_ENABLED && readerStatus && readerStatus.at && (() => {
                                const rs = rdState(readerStatus);
                                return (
                                    <span className="ml-3 font-bold" style={{ color: rs.color }}
                                        title={`진척자료 자동 반영기 (NAS 프로그램)\n마지막 확인 ${rdTimeText(readerStatus.at)}\n주기 ${readerStatus.intervalMin || 15}분 · 규칙 ${readerStatus.rules || 0}개\n지난 회차 메인표 ${readerStatus.wrote || 0}칸 갱신`}>
                                        · ● 자동 반영기 {rdTimeText(readerStatus.at)} 확인{rs.stale ? ' — 멈춘 듯' : ''}
                                    </span>
                                );
                            })()}
                        </span>
                        {dataSource !== 'firebase' && (
                        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-bold ${srcBadge.bg} ${srcBadge.text}`}>
                            {srcBadge.icon}
                            <span>{srcBadge.label}</span>
                        </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProjectListScreen;
