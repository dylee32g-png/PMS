// =========================================================================
// TechTeam PMS - Version 6.9.2 (패널 드래그 리사이즈 + 모달 위치 보정)
// v6.8.3: 프로젝트 List 관리 엑셀 업로드 미리보기 + 인라인 에디팅 추가
// v6.8.4: FortuneSheet Immer freeze 오류 수정
// v6.8.5: 툴바 줌 버튼 동작 수정
// v6.8.6: WeeklyReport 스크롤 업 버그 수정 (freeze pane rowlen 클린업)
// v6.8.7: 탭 전환 스크롤 강제 리셋 + rowlen 필터 기준 보정
// v6.8.8: FortuneSheet handleGlobalWheel 우회 → 직접 스크롤 제어
// =========================================================================
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Plus, Search, ArrowUpDown, Trash2, Edit2, Clock, 
  Filter, X, LayoutGrid, Settings, ChevronDown, Play, 
  Activity, Cpu, Monitor, Calendar, BarChart3, Info, Users, FileText, 
  LogOut, Wrench, TerminalSquare, AlertTriangle, Upload, Save, Database, CornerDownRight,
  Eye, ChevronRight, HelpCircle, CheckCircle2, Menu, PieChart, Target, Zap,
  ZoomIn, ZoomOut, Maximize, Minus, Download, FileSpreadsheet, ChevronUp, ListChecks,
  HardDrive, Link, Link2Off, PanelRight, X as XIcon, RefreshCw, AlignJustify, List, BookMarked, CheckCheck, Shuffle, TrendingUp
} from 'lucide-react';

import LoginScreen from './components/LoginScreen';
import UserManagementScreen from './components/UserManagementScreen';
import ProjectListScreen from './components/ProjectListScreen';
import ProgressModal from './components/ProgressModal';
import EstimateScreen from './components/EstimateScreen';
import WeeklyReportScreen from './components/WeeklyReportScreen';
import WeeklyPanelViewer from './components/WeeklyPanelViewer';
import WeeklyInputScreen from './components/WeeklyInputScreen';
import WeeklySummaryScreen from './components/WeeklySummaryScreen';
import HelpModal from './components/HelpModal';
import { pmsIdbSave, pmsIdbLoad, pmsIdbDelete, wrIdbLoadAll, wrIdbAdd, wrIdbGet, wrIdbDelete, generatePid } from './utils';

// --- Firebase 라이브러리 임포트 ---
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink, setPersistence, browserLocalPersistence, browserSessionPersistence, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword, updatePassword, signInAnonymously } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot, writeBatch, getDoc, getDocs, query, where } from 'firebase/firestore';
import { getStorage, ref as storageRef, uploadBytes, getBytes } from 'firebase/storage';

const localFirebaseConfig = {
  apiKey: "AIzaSyBlD6lIyfXckxEW6Fb6azc-xDsXdivC_Rw", 
  authDomain: "techteampms.firebaseapp.com",
  projectId: "techteampms",
  storageBucket: "techteampms.firebasestorage.app",
  messagingSenderId: "427625152143",
  appId: "1:427625152143:web:bda10feccaadca391c7afa"
};

// 환경 감지
const isCanvasEnv = typeof window !== 'undefined' && typeof window.__firebase_config !== 'undefined';
const firebaseConfig = isCanvasEnv ? JSON.parse(window.__firebase_config) : localFirebaseConfig;

// Firebase 초기화
let app, auth, db, storage;
try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
} catch (error) {
  console.error("Firebase 초기화 에러:", error);
}

const appId = (typeof window !== 'undefined' && typeof window.__app_id !== 'undefined') ? window.__app_id : 'tech-team-pms-app';

// 로그인 스킵 (개발용) — 배포 전 false로 변경
const SKIP_LOGIN = false;
const GUEST_USER = { email: 'guest@local', displayName: '게스트' };
const GUEST_REGISTERED = { email: 'guest@local', displayName: '게스트', role: 'admin', active: true };

const LS_LAST_EMAIL      = 'pms_last_email';     // 마지막 입력 이메일 기억
const EMAIL_FOR_SIGN_IN  = 'pms_emailForSignIn'; // 링크 발송한 이메일 임시 보관

const getLoginErrorMessage = (code) => {
    const map = {
        'auth/invalid-email':           '이메일 형식이 올바르지 않습니다.',
        'auth/user-disabled':           '비활성화된 계정입니다.',
        'auth/too-many-requests':       '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
        'auth/popup-closed-by-user':    'Google 로그인 창이 닫혔습니다.',
        'auth/cancelled-popup-request': 'Google 로그인이 취소됐습니다.',
        'auth/invalid-action-code':     '링크가 만료됐거나 이미 사용됐습니다. 다시 요청해 주세요.',
        'auth/expired-action-code':     '링크가 만료됐습니다. 다시 요청해 주세요.',
        'auth/wrong-password':          '비밀번호가 올바르지 않습니다.',
        'auth/invalid-credential':      '아이디 또는 비밀번호가 올바르지 않습니다.',
        'auth/user-not-found':          '등록되지 않은 공용 계정입니다. 관리자에게 문의하세요.',
    };
    return map[code] || '오류가 발생했습니다. 다시 시도해 주세요.';
};

// --- 외부 데이터 정의 ---
const defaultStatusOptions = [
    { label: '진행',     color: 'bg-cyan-500',   textColor: 'text-cyan-400',   borderColor: 'border-cyan-500/20'   },
    { label: '금월완료', color: 'bg-emerald-500', textColor: 'text-emerald-400', borderColor: 'border-emerald-500/20' },
    { label: '신규',     color: 'bg-blue-500',   textColor: 'text-blue-400',   borderColor: 'border-blue-500/20'   },
    { label: '미작업',   color: 'bg-slate-400',  textColor: 'text-slate-400',  borderColor: 'border-slate-400/20'  },
    { label: '예상',     color: 'bg-amber-500',  textColor: 'text-amber-400',  borderColor: 'border-amber-500/20'  },
    { label: '검토중',   color: 'bg-violet-500', textColor: 'text-violet-400', borderColor: 'border-violet-500/20' },
    { label: 'sub',      color: 'bg-orange-500', textColor: 'text-orange-400', borderColor: 'border-orange-500/20' },
    { label: '보고완료', color: 'bg-indigo-500', textColor: 'text-indigo-400', borderColor: 'border-indigo-500/20' },
    { label: '취소',     color: 'bg-rose-500',   textColor: 'text-rose-400',   borderColor: 'border-rose-500/20'   },
    { label: '삭제',     color: 'bg-slate-500',  textColor: 'text-slate-400',  borderColor: 'border-slate-500/20'  },
];

const STATUS_COLORS = {
    '진행':     { bg:'rgba(30,122,200,0.12)',  text:'#1e7ac8', border:'rgba(30,122,200,0.35)' },
    '진행중':   { bg:'rgba(30,122,200,0.12)',  text:'#1e7ac8', border:'rgba(30,122,200,0.35)' },
    '신규':     { bg:'rgba(37,99,235,0.12)',   text:'#2563eb', border:'rgba(37,99,235,0.35)' },
    '신규등록': { bg:'rgba(37,99,235,0.12)',   text:'#2563eb', border:'rgba(37,99,235,0.35)' },
    '금월완료': { bg:'rgba(5,150,105,0.12)',   text:'#059669', border:'rgba(5,150,105,0.35)' },
    '보고완료': { bg:'rgba(79,70,229,0.12)',   text:'#4f46e5', border:'rgba(79,70,229,0.35)' },
    '보고완료': { bg:'rgba(20,184,166,0.12)',  text:'#0f9488', border:'rgba(20,184,166,0.35)' },
    '예상':     { bg:'rgba(217,119,6,0.12)',   text:'#d97706', border:'rgba(217,119,6,0.35)' },
    '미작업':   { bg:'rgba(107,114,128,0.10)', text:'#6b7280', border:'rgba(107,114,128,0.3)' },
    '검토중':   { bg:'rgba(124,58,237,0.12)',  text:'#7c3aed', border:'rgba(124,58,237,0.35)' },
    'sub':      { bg:'rgba(234,88,12,0.12)',   text:'#ea580c', border:'rgba(234,88,12,0.35)'  },
    '취소':     { bg:'rgba(220,38,38,0.12)',   text:'#dc2626', border:'rgba(220,38,38,0.35)' },
    '삭제':     { bg:'rgba(107,114,128,0.08)', text:'#9ca3af', border:'rgba(107,114,128,0.25)' },
};

const DEFAULT_PROGRESS_ITEMS = { drawing: true, iomap: true, screen: true, baseinfo: true, plc: true, etos: true, hmi: true, internalTest: true, integratedTest: true };
const initialTeamSettings = {
    '기술1팀': { factory: ['P10', 'P9', '기반기술'], manager: ['홍길동 파트장', '이순신 선임'], status: defaultStatusOptions, defaultActiveStatuses: [], defaultActiveFactories: [], colOrderV2: [], progressItems: { ...DEFAULT_PROGRESS_ITEMS } },
    '기술2팀': { factory: ['P10', 'P9', 'P8', 'P7', 'Vietnam', 'Paju'], manager: ['김준혁 부장', '조장현 차장', '최영환 팀장', '이현우 과장', '박지성 대리'], status: defaultStatusOptions, defaultActiveStatuses: [], defaultActiveFactories: [], colOrderV2: [], progressItems: { ...DEFAULT_PROGRESS_ITEMS } },
    '기술3팀': { factory: ['네트워크망', '인프라센터'], manager: ['김네트 파트장', '이프라 선임'], status: defaultStatusOptions, defaultActiveStatuses: [], defaultActiveFactories: [], colOrderV2: [], progressItems: { ...DEFAULT_PROGRESS_ITEMS } },
    'Software팀': { factory: ['사내포털', '본사서버'], manager: ['박개발 수석', '최코딩 선임'], status: defaultStatusOptions, defaultActiveStatuses: [], defaultActiveFactories: [], colOrderV2: [], progressItems: { ...DEFAULT_PROGRESS_ITEMS } }
};

// --- 라이브러리 동적 로더 ---
const loadXLSX = async () => {
    if (window.XLSX) return window.XLSX;
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
        script.onload = () => resolve(window.XLSX);
        script.onerror = () => reject(new Error("XLSX 라이브러리 로드 실패"));
        document.body.appendChild(script);
    });
};

const loadExcelJS = async () => {
    if (window.ExcelJS) return window.ExcelJS;
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.3.0/exceljs.min.js";
        script.onload = () => resolve(window.ExcelJS);
        script.onerror = () => reject(new Error("ExcelJS 라이브러리 로드 실패"));
        document.body.appendChild(script);
    });
};

const loadFileSaver = async () => {
    if (window.saveAs) return window.saveAs;
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js";
        script.onload = () => resolve(window.saveAs);
        script.onerror = () => reject(new Error("FileSaver 로드 실패"));
        document.body.appendChild(script);
    });
};

// ★ 엑셀 미리보기용 (원본 순서)
const excelPreviewColDefs = [
    { key: 'no', label: 'No.', align: 'center', width: 50 },
    { key: 'execNo', label: '실행번호', color: 'text-cyan-400', width: 90 },
    { key: 'estNo', label: '견적번호', width: 90 },
    { key: 'progressStatus', label: '진행현황', color: 'text-amber-400', width: 90 },
    { key: 'factory', label: '공장구분', color: 'text-cyan-400', width: 80 },
    { key: 'project', label: '프로젝트명', color: 'text-cyan-400', width: 250 },
    { key: 'content', label: '프로젝트 내용', width: 220 },
    { key: 'point', label: 'Point', color: 'text-emerald-400', align: 'center', width: 70 },
    { key: 'plc', label: 'PLC', align: 'center', group: '진행현황(%)', width: 60 },
    { key: 'etos', label: 'ETOS', align: 'center', group: '진행현황(%)', width: 60 },
    { key: 'hmi', label: 'HMI', align: 'center', group: '진행현황(%)', width: 60 },
    { key: 'internalTest', label: '자체시운전', align: 'center', group: '진행현황(%)', width: 80 },
    { key: 'integratedTest', label: '통합시운전', align: 'center', group: '진행현황(%)', width: 80 },
    { key: 'startDate', label: '시작일', width: 90 },
    { key: 'endDate', label: '종료일', width: 90 },
    { key: 'progress', label: '공정률(%)', align: 'left', color: 'text-cyan-400', width: 80 },
    { key: 'material', label: '자재(%)', width: 80 },
    { key: 'l1', label: 'L1', align: 'center', group: '작업범위', width: 60 },
    { key: 'l2', label: 'L2', align: 'center', group: '작업범위', width: 60 },
    { key: 'investReview', label: '투자심의', width: 80 },
    { key: 'client', label: '발주처', width: 100 },
    { key: 'accPoints', label: '누적', align: 'right', group: '시운전(포인트)', color: 'text-indigo-400', bg: 'bg-cyan-500/10', width: 80 },
    { key: 'prevPoints', label: '전월', align: 'right', group: '시운전(포인트)', bg: 'bg-cyan-500/10', width: 80 },
    { key: 'currPoints', label: '금월', align: 'right', group: '시운전(포인트)', color: 'text-emerald-400', bg: 'bg-cyan-500/10', width: 80, rightBorder: true },
    { key: 'prevProgress', label: '전월', align: 'right', group: '공정률(%)', bg: 'bg-slate-800/40', width: 70 },
    { key: 'currProgress', label: '금월', align: 'right', group: '공정률(%)', color: 'text-emerald-400', bg: 'bg-slate-800/40', width: 70, rightBorder: true }
];

// ★ 메인 화면용 (시운전/공정률 열을 진행현황 앞으로 이동)
const mainBaseColDefs = [
    { key: 'no', label: 'No.', align: 'center', width: 50 },
    { key: 'execNo', label: '실행번호', color: 'text-cyan-400', width: 90 },
    { key: 'estNo', label: '견적번호', width: 90 },
    { key: 'factory', label: '공장구분', color: 'text-cyan-400', width: 80 },
    { key: 'progressStatus', label: '진행현황', color: 'text-amber-400', width: 90 },
    { key: 'project', label: '프로젝트명', color: 'text-cyan-400', width: 250 },
    { key: 'content', label: '프로젝트 내용', width: 220 },
    { key: 'point', label: 'Point', color: 'text-emerald-400', align: 'center', width: 70 },
    
    { key: 'accPoints', label: '누적', align: 'right', group: '시운전(포인트)', color: 'text-indigo-400', bg: 'bg-cyan-500/10', width: 80 },
    { key: 'prevPoints', label: '전월', align: 'right', group: '시운전(포인트)', bg: 'bg-cyan-500/10', width: 80 },
    { key: 'currPoints', label: '금월', align: 'right', group: '시운전(포인트)', color: 'text-emerald-400', bg: 'bg-cyan-500/10', width: 80, rightBorder: true },
    { key: 'prevProgress', label: '전월', align: 'right', group: '공정률(%)', bg: 'bg-slate-800/40', width: 70 },
    { key: 'currProgress', label: '금월', align: 'right', group: '공정률(%)', color: 'text-emerald-400', bg: 'bg-slate-800/40', width: 70, rightBorder: true },

    { key: 'plc', label: 'PLC', align: 'center', group: '진행현황(%)', width: 60 },
    { key: 'etos', label: 'ETOS', align: 'center', group: '진행현황(%)', width: 60 },
    { key: 'hmi', label: 'HMI', align: 'center', group: '진행현황(%)', width: 60 },
    { key: 'internalTest', label: '자체시운전', align: 'center', group: '진행현황(%)', width: 80 },
    { key: 'integratedTest', label: '통합시운전', align: 'center', group: '진행현황(%)', width: 80, rightBorder: true },
    { key: 'startDate', label: '시작일', width: 90 },
    { key: 'endDate', label: '종료일', width: 90 },
    { key: 'progress', label: '공정률(%)', align: 'left', color: 'text-cyan-400', width: 80 },
    { key: 'material', label: '자재(%)', width: 80 },
    { key: 'l1', label: 'L1', align: 'center', group: '작업범위', width: 60 },
    { key: 'l2', label: 'L2', align: 'center', group: '작업범위', width: 60 },
    { key: 'investReview', label: '투자심의', width: 80 },
    { key: 'client', label: '발주처', width: 100 }
];

const safeRender = (val) => {
    if (val === null || val === undefined) return '-';
    if (typeof val === 'object') {
        return val.name || val.label || val.title || JSON.stringify(val);
    }
    return String(val);
};

const safeNumber = (val) => {
    if (val === null || val === undefined || val === '-' || val === '') return 0;
    const cleaned = String(val).replace(/[^0-9.-]/g, '');
    const num = Number(cleaned);
    return isNaN(num) ? 0 : num;
};

const GlobalStyles = () => (
    <style>{`
        /* ── 스크롤바 (Excel 스타일) ── */
        .custom-scrollbar::-webkit-scrollbar { width: 14px; height: 14px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #f0f0f0; border: 1px solid #d8d8d8; border-radius: 0; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #b0b0b0; border-radius: 2px; border: 2px solid #f0f0f0; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #888888; }

        /* color-scheme light (날짜 입력창 등) */
        .color-scheme-dark { color-scheme: light; }

        /* ── 애니메이션 ── */
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
        .animate-in { animation: fadeIn 0.15s ease-out forwards; }

        @keyframes growUp { from { height: 0%; opacity: 0; } to { opacity: 1; } }
        .animate-grow-up { animation: growUp 0.4s ease-out forwards; transform-origin: bottom; }

        /* ── 팀 카드 호버 ── */
        @keyframes excel-border-pulse {
            0%   { box-shadow: 0 0 0 0 rgba(30,122,200,0.3); }
            70%  { box-shadow: 0 0 0 4px rgba(30,122,200,0); }
            100% { box-shadow: 0 0 0 0 rgba(30,122,200,0); }
        }
        .team-card:hover { animation: excel-border-pulse 1.5s infinite; border-color: #1e7ac8 !important; }

        /* ── sticky 고정 컬럼 ── */
        .sticky-col { position: sticky; z-index: 10; background-color: #edf1f7 !important; }
        th.sticky-col { z-index: 40; background-color: #d4dde8 !important; }
        tr:hover td.sticky-col { background-color: #d8e8fa !important; }
        .sticky-last { border-right: 2px solid #1e7ac8 !important; box-shadow: 4px 0 6px -2px rgba(0,0,0,0.08) !important; }

        /* ── 상태 배지 배경 ── */
        .bg-cyan-500\/10  { background-color: rgba(30,122,200,0.08) !important; }
        .bg-cyan-500\/20  { background-color: rgba(30,122,200,0.12) !important; }
        .bg-slate-800\/40 { background-color: rgba(200,210,220,0.35) !important; }
        .bg-slate-800\/30 { background-color: rgba(200,210,220,0.25) !important; }

        /* ── 그룹헤더 컬럼 ── */
        th[colspan] { background-color: #d4dde8 !important; border-bottom: 2px solid #9aa8b8 !important; text-align: center !important; }

        /* ── 그룹 구분선 헤더 셀 ── */
        th.th-group-sep { border-right: 1px solid #1e293b !important; }

        /* ── 우클릭 컨텍스트 메뉴 ── */
        .bg-slate-800.border-slate-600 { background-color: #ffffff !important; border-color: #c0c0c0 !important; box-shadow: 0 4px 12px rgba(0,0,0,0.12) !important; }

        /* ── 로딩 스피너 ── */
        @keyframes _wrsSpin { to { transform: rotate(360deg); } }

        /* ── 모든 rounded 제거 (Excel 직각) ── */
        [class*="rounded"] { border-radius: 0 !important; }
        .animate-spin { border-radius: 9999px !important; }

        /* ── 테이블 완전 그리드선 (Chrome sticky+collapse 버그 우회: separate 사용) ── */
        table { border-collapse: separate !important; border-spacing: 0 !important; }
        thead th, thead td { border-right: 1px solid #c4ccd8 !important; border-top: 1px solid #c4ccd8 !important; border-bottom: 1px solid #c4ccd8 !important; border-left: none !important; background-color: #dce3ec !important; }
        thead th:first-child, thead td:first-child { border-left: 1px solid #8aa0b8 !important; }
        thead tr:last-child th, thead tr:last-child td { border-bottom: 1px solid #c4ccd8 !important; }
        tbody td { border-right: 1px solid #c4ccd8 !important; border-bottom: 1px solid #c4ccd8 !important; border-top: none !important; border-left: none !important; }
        tbody td:first-child { border-left: 1px solid #c4ccd8 !important; }
        tbody tr:hover td { background-color: #e8f0fe !important; }
        tbody tr.tr-highlighted td { background-color: rgba(251,191,36,0.22) !important; }
        tbody tr.tr-highlighted td.sticky-col { background-color: rgba(251,191,36,0.28) !important; }

        /* ── 버튼/입력창 직각 ── */
        button { border-radius: 0 !important; }
        input:not([type="checkbox"]):not([type="radio"]):not([type="range"]),
        textarea, select { border-radius: 0 !important; }
    `}</style>
);

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white p-6">
          <div className="bg-slate-900 border border-rose-500/30 p-8 rounded-3xl max-w-lg w-full text-center shadow-2xl">
            <AlertTriangle className="w-16 h-16 text-rose-500 mx-auto mb-4 opacity-80" />
            <h2 className="text-xl font-bold text-rose-400 mb-4">화면 렌더링 중 오류가 발생했습니다</h2>
            <p className="text-slate-400 text-sm mb-6">데이터 구조에 일시적인 충돌이 발생했습니다. 안전을 위해 새로고침을 진행해 주세요.</p>
            <div className="bg-rose-950/50 p-4 rounded-xl mb-6 text-rose-300 text-xs font-mono border border-rose-900/50 text-left overflow-x-auto max-h-48">
                {this.state.error?.toString()}
            </div>
            <button onClick={() => window.location.reload()} className="px-6 py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-bold transition-all w-full">앱 새로고침</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const TechTeamPMS = () => {
  const [user, setUser] = useState(SKIP_LOGIN ? GUEST_USER : null);
  const [isAuthReady, setIsAuthReady] = useState(SKIP_LOGIN ? true : false);
  const [isEmailLinkTab, setIsEmailLinkTab] = useState(false); // 이메일 링크로 열린 탭 여부
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [registeredUser, setRegisteredUser]   = useState(SKIP_LOGIN ? GUEST_REGISTERED : null);
  const [userCheckDone, setUserCheckDone]     = useState(SKIP_LOGIN ? true : false);
  const [isDbLoading, setIsDbLoading] = useState(SKIP_LOGIN ? false : true);
  const [authError, setAuthError] = useState('');
  const [dbErrorDetail, setDbErrorDetail] = useState('');
  const [userPrefs, setUserPrefs] = useState({}); // ★ 사용자 설정 (팀별 저장 가능하도록 객체로 관리)

  const [logs, setLogs] = useState([]);
  const [showDebug, setShowDebug] = useState(false);
  const logEndRef = useRef(null);

  const addLog = (msg) => {
      console.log(`[DEBUG] ${msg}`);
      setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  useEffect(() => {
      if (showDebug && logEndRef.current) {
          logEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
  }, [logs, showDebug]);

  const [alertMessage, setAlertMessage] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [pidMigModal, setPidMigModal] = useState(null); // A-4a: pid 일괄 발급 — null|{stage:'scan'}|{stage:'ready',...}|{stage:'running'}|{stage:'done',...}
  const [wkMigModal, setWkMigModal] = useState(null);   // A-4b: 주간장부 pid 통일 병합 — 같은 단계 구조
  const [confirmRowSaveId, setConfirmRowSaveId] = useState(null);
  const [isDeleteAllModalOpen, setIsDeleteAllModalOpen] = useState(false);
  const [isSaveConfirmModalOpen, setIsSaveConfirmModalOpen] = useState(false);
  const [monthlySnapModal, setMonthlySnapModal] = useState(false); // boolean
  const [snapSaveMonth, setSnapSaveMonth]       = useState('');  // 모달에서 선택한 저장 대상 월
  const [monthlySnapToast, setMonthlySnapToast] = useState(null); // null | { month, count }
  const [fbSnapshots, setFbSnapshots]           = useState({}); // { [baseDate]: { savedAt, count } }

  const [teamSettings, setTeamSettings] = useState(initialTeamSettings);
  const [allProjects, setAllProjects] = useState([]);
  const [localUnsavedProjects, setLocalUnsavedProjects] = useState([]);
  const [pendingEdits, setPendingEdits] = useState({});
  const [pmsLocalInfo, setPmsLocalInfo] = useState(null); // { savedAt, count } — IDB에서 로드된 경우
  
  const [currentTeam, setCurrentTeam] = useState(null);
  
  const [currentMode, setCurrentMode] = useState(null); // ★ 'pms' (월간보고) 또는 'projectList' 또는 'estimate' 상태 추가
  const [expandedTeam, setExpandedTeam] = useState(null); // ★ 아코디언 펼침 상태 관리용 (selectingTeamMode 대체)

  // ── 견적 메뉴 패스워드 ──
  const [showEstimateModal, setShowEstimateModal] = useState(false);
  const [estimatePwInput, setEstimatePwInput] = useState('');
  const [estimatePwError, setEstimatePwError] = useState(false);
  const [estimateRememberPw, setEstimateRememberPw] = useState(false);
  const ESTIMATE_PASSWORD = '123456';
  const ESTIMATE_PW_STORAGE_KEY = 'pms_estimate_pw_saved';
  const LS_COMPACT_MODE  = 'pms_compact_mode';
  const LS_COL_WIDTHS    = 'pms_col_widths';
  const LS_MONTHLY_SNAP  = 'pms_monthly_snapshots';

  // 저장된 비밀번호 확인 (마운트 시)
  useEffect(() => {
    if (localStorage.getItem(ESTIMATE_PW_STORAGE_KEY) === 'true') {
      // 저장된 경우 자동 진입하지 않고 체크만 표시
      setEstimateRememberPw(true);
    }
  }, []);

  const handleEstimateLogin = () => {
    if (estimatePwInput === ESTIMATE_PASSWORD) {
      if (estimateRememberPw) {
        localStorage.setItem(ESTIMATE_PW_STORAGE_KEY, 'true');
      } else {
        localStorage.removeItem(ESTIMATE_PW_STORAGE_KEY);
      }
      setShowEstimateModal(false);
      setEstimatePwInput('');
      setEstimatePwError(false);
      setCurrentMode('estimate');
    } else {
      setEstimatePwError(true);
    }
  };

  // ==========================================
  // [추가] 동적 프로젝트 리스트 전용 상태 모음
  // ==========================================
  const [dynamicExcelCols, setDynamicExcelCols] = useState([]); 
  const [dynamicExcelData, setDynamicExcelData] = useState([]); 
  
  const [originalDynamicCols, setOriginalDynamicCols] = useState([]); // 취소 대비 원본 보관용
  const [originalDynamicData, setOriginalDynamicData] = useState([]); 
  
  const [stagedDynamicCols, setStagedDynamicCols] = useState([]);     // 미리보기 모달용
  const [stagedDynamicData, setStagedDynamicData] = useState([]);
  const [isDynamicPreviewOpen, setIsDynamicPreviewOpen] = useState(false);
  
  const [isDynamicUnsaved, setIsDynamicUnsaved] = useState(false);    // 임시 데이터 배너용 플래그
  const isDynamicUnsavedRef = useRef(false); // snapshot 구독 시 로컬 편집 오버라이드 방지용

  const [dynamicEditingInline, setDynamicEditingInline] = useState(null); // 동적 리스트 인라인 에디팅
  const dynamicFileInputRef = useRef(null);

  const [baseDate, setBaseDate] = useState(() => {
      const today = new Date();
      return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  });
  
  const [settingsTab, setSettingsTab] = useState('status'); 
  const [newItemInput, setNewItemInput] = useState('');
  
  const [draggedSettingKey, setDraggedSettingKey] = useState(null); 
  const [draggedStatusKey, setDraggedStatusKey] = useState(null); 
  const [draggedFactoryKey, setDraggedFactoryKey] = useState(null); 
  
  const [localColOrder, setLocalColOrder] = useState([]);
  const [draggedColKey, setDraggedColKey] = useState(null);

  const [isSettingsMenuOpen, setIsSettingsMenuOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [confirmSignOutOpen, setConfirmSignOutOpen] = useState(false);
  const [activeHeaderFilter, setActiveHeaderFilter] = useState(null);
  
  const [activeFilterFactories, setActiveFilterFactories] = useState(new Set());
  const [activeFilterStatuses, setActiveFilterStatuses] = useState(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [searchActive, setSearchActive] = useState(false);

  const [sortConfig, setSortConfig] = useState({ key: 'id', direction: 'asc' });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editModalPos, setEditModalPos] = useState({ x: 80, y: 60 });
  const editModalDragRef = useRef({ dragging: false, startX: 0, startY: 0, origX: 0, origY: 0 });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [editingInline, setEditingInline] = useState(null); // ★ 월간보고 인라인 에디팅
  const [progressRecordsMap, setProgressRecordsMap] = useState({}); // { [projectId]: { weekly: {...} } }

  // ── 주간보고 연결 & 사이드 패널 ─────────────────────────────────────────
  const [weeklyLinks,        setWeeklyLinks]        = useState({});   // { [projectId]: { reportId, fileName, savedAt } }
  const [weeklyPanel,        setWeeklyPanel]        = useState(null); // { projectId, fileName, fileBlob }
  const [weeklyLinkModal,    setWeeklyLinkModal]    = useState(null); // { projectId } — 연결 선택 모달
  const [weeklyReportList,   setWeeklyReportList]   = useState([]);   // IDB 목록 캐시
  const [weeklyListLoading,  setWeeklyListLoading]  = useState(false);
  const [weeklyLinkUploading, setWeeklyLinkUploading] = useState(false);
  const weeklyLinkFileRef = useRef(null);
  const [panelWidth,         setPanelWidth]         = useState(30);   // vw 단위 (드래그로 조절)
  const [compactMode,        setCompactMode]        = useState(() => { try { const v = localStorage.getItem(LS_COMPACT_MODE); return v !== null ? parseInt(v, 10) : 0; } catch { return 0; } }); // 0=기본 1=컴팩트 2=초소형
  const colScale = compactMode === 0 ? 1 : compactMode === 1 ? 0.75 : 0.52;
  const [panelDate1, setPanelDate1] = useState(() => { const d = new Date(); d.setDate(d.getDate()-14); return d.toISOString().split('T')[0]; }); // 14일 전
  const [panelDate2, setPanelDate2] = useState(() => { const d = new Date(); d.setDate(d.getDate()-7);  return d.toISOString().split('T')[0]; }); // 7일 전
  const [panelDate3, setPanelDate3] = useState(() => new Date().toISOString().split('T')[0]); // 오늘
  const [panelSummary,       setPanelSummary]       = useState(null); // 파싱 결과
  const [panelLoading,       setPanelLoading]       = useState(false);
  const [collapsedCats,      setCollapsedCats]      = useState(new Set()); // 접힌 카테고리
  const panelDragRef = useRef(null); // 드래그 중 mousemove 핸들러 ref
  
  const [contextMenu, setContextMenu] = useState(null);
  const [pmsProgressRow, setPmsProgressRow] = useState(null); // 월간보고 진행실적 등록 대상
  const [highlightExecNoInList,   setHighlightExecNoInList]   = useState(null); // List화면에서 하이라이트할 execNo
  const [highlightExecNoInReport, setHighlightExecNoInReport] = useState(null); // 업무현황에서 하이라이트할 execNo
  const [graphProject, setGraphProject] = useState(null);
  const [chartZoom, setChartZoom] = useState(1.0);
  const [showTeamGraph, setShowTeamGraph] = useState(false);
  const [teamChartZoom, setTeamChartZoom] = useState(1.0);

  const [hiddenColumns, setHiddenColumns] = useState(new Set([
      'estNo', 'content', 'startDate', 'endDate',
      'material', 'l1', 'l2', 'investReview', 'client'
  ]));
  const [isColumnDropdownOpen, setIsColumnDropdownOpen] = useState(false);
  const [collapsedProjects, setCollapsedProjects] = useState(new Set());
  
  const [stagedExcelData, setStagedExcelData] = useState(null);
  const [isExcelPreviewOpen, setIsExcelPreviewOpen] = useState(false);
  const [frozenPreviewIdx, setFrozenPreviewIdx] = useState(3);

  const [isExcelFormatModalOpen, setIsExcelFormatModalOpen] = useState(false);
  const [tempExcelFormat, setTempExcelFormat] = useState('ui');
  const [tempSaveDefault, setTempSaveDefault] = useState(false);
  const [customTemplateFile, setCustomTemplateFile] = useState(null);
  
  const initialWidths = {};
  mainBaseColDefs.forEach(col => initialWidths[col.key] = col.width);
  const [previewColWidths, setPreviewColWidths] = useState(() => {
      try {
          const saved = localStorage.getItem(LS_COL_WIDTHS);
          if (saved) return { ...initialWidths, ...JSON.parse(saved) };
      } catch {}
      return initialWidths;
  });

  const [resizingCol, setResizingCol] = useState(null);
  const [startX, setStartX] = useState(0);
  const [startWidth, setStartWidth] = useState(0);
  
  const fileInputRef = useRef(null);

  const [formData, setFormData] = useState({ 
      factory: '', project: '', content: '', status: '진행중', manager: '',
      startDate: '', endDate: '', plc: 0, etos: 0, hmi: 0, internalTest: 0, integratedTest: 0, progress: 0,
      totalCommissioningPoints: 0, monthlyPoints: []
  });

  const fileToBase64 = (file) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = error => reject(error);
  });

  const base64ToBuffer = (base64) => {
      const binaryString = window.atob(base64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes.buffer;
  };

  useEffect(() => {
      const handleClickOutside = () => setContextMenu(null);
      window.addEventListener('click', handleClickOutside);
      return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  // 업무현황 하이라이트: 해당 행으로 스크롤 후 3초 뒤 해제
  useEffect(() => {
      if (!highlightExecNoInReport) return;
      const t1 = setTimeout(() => {
          const el = document.querySelector('[data-highlight-row="1"]');
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 150);
      const t2 = setTimeout(() => setHighlightExecNoInReport(null), 4000);
      return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [highlightExecNoInReport]);

  useEffect(() => {
      setChartZoom(1);
  }, [graphProject]);

  useEffect(() => {
    addLog('앱 실행 완료, Firebase 초기화 시작...');
    if (!auth) {
      setAuthError("Firebase 설정(firebaseConfig)이 입력되지 않았거나 잘못되었습니다.");
      setIsDbLoading(false);
      setIsAuthReady(true);
      return;
    }
    // ① 이메일 링크 클릭으로 열린 탭: 로그인 완료 처리
    if (!SKIP_LOGIN && isSignInWithEmailLink(auth, window.location.href)) {
      setIsEmailLinkTab(true); // 이 탭은 "창 닫기" 화면만 표시
      let savedEmail = localStorage.getItem(EMAIL_FOR_SIGN_IN);
      if (!savedEmail) {
        savedEmail = window.prompt('보안을 위해 이메일을 다시 입력해 주세요:');
      }
      if (savedEmail) {
        signInWithEmailLink(auth, savedEmail, window.location.href)
          .then(() => {
            localStorage.removeItem(EMAIL_FOR_SIGN_IN);
            // 원래 탭(로그인 창)에 완료 신호 전송
            localStorage.setItem('pms_auth_signal', Date.now().toString());
            window.history.replaceState({}, document.title, window.location.pathname);
          })
          .catch(e => {
            setLoginError(getLoginErrorMessage(e.code));
            setIsAuthReady(true);
          });
      } else {
        setIsAuthReady(true);
      }
    }
    // ② Canvas/iframe 환경: custom token으로 자동 로그인
    else if (typeof window !== 'undefined' && typeof window.__initial_auth_token !== 'undefined' && window.__initial_auth_token) {
      signInWithCustomToken(auth, window.__initial_auth_token).catch(error => {
        console.error("Custom token 인증 실패:", error);
        setIsAuthReady(true);
      });
    }

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (SKIP_LOGIN) {
        if (currentUser) {
          setUser({ ...GUEST_USER, uid: currentUser.uid });
          setIsDbLoading(true);
        }
        setIsAuthReady(true);
      } else {
        setUser(currentUser);
        setIsAuthReady(true);
        if (!currentUser) setIsDbLoading(false);
      }
    });

    // 개발용 로그인 스킵: 리스너 등록 후 익명 로그인
    if (SKIP_LOGIN) {
      signInAnonymously(auth).catch(e => console.error('익명 로그인 실패:', e));
    }

    return () => unsubscribe();
  }, []);

  // ── 모달리스 창 드래그 ──────────────────────────────────────────
  useEffect(() => {
    const onMove = (e) => {
      const d = editModalDragRef.current;
      if (!d.dragging) return;
      setEditModalPos({
        x: Math.max(0, d.origX + (e.clientX - d.startX)),
        y: Math.max(0, d.origY + (e.clientY - d.startY)),
      });
    };
    const onUp = () => { editModalDragRef.current.dragging = false; };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, []);

  // ── 로그인 후 Firestore 등록 사용자 여부 확인 ─────────────────────────────
  useEffect(() => {
    if (SKIP_LOGIN) return;
    if (!user || !db) {
      setRegisteredUser(null);
      setUserCheckDone(false);
      return;
    }
    const email = user.email;
    if (!email) { setRegisteredUser(null); setUserCheckDone(true); return; }

    const userDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'registeredUsers', email);
    getDoc(userDocRef).then(async (snap) => {
      if (snap.exists()) {
        setRegisteredUser(snap.data());
      } else {
        // 등록된 사용자가 아예 없으면 최초 사용자로 자동 관리자 등록
        const colSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'registeredUsers'));
        if (colSnap.empty) {
          const userData = {
            email,
            displayName: user.displayName || email.split('@')[0],
            role: 'admin',
            active: true,
            createdAt: new Date().toISOString(),
            addedBy: '시스템 자동 등록 (최초 사용자)',
          };
          await setDoc(userDocRef, userData);
          setRegisteredUser(userData);
        } else {
          setRegisteredUser(null); // 미등록 사용자 — 접근 불가
        }
      }
      setUserCheckDone(true);
    }).catch(() => setUserCheckDone(true));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user || !db || !user.uid) return;
    addLog(`Firestore DB 구독 시작...`);

    const projectsRef = collection(db, 'artifacts', appId, 'public', 'data', 'projects');
    const settingsRef = collection(db, 'artifacts', appId, 'public', 'data', 'settings');
    const prefsRef = doc(collection(db, 'artifacts', appId, 'users', user.uid, 'preferences'), 'config');

    const LEGACY_LABELS = new Set(['진행중', '신규등록']);
    const unsubSettings = onSnapshot(settingsRef, (snapshot) => {
      if (snapshot.empty) {
        setTeamSettings(initialTeamSettings);
      } else {
        snapshot.forEach(d => {
          if (d.id === 'teamSettings') {
            const data = d.data();
            let needsMigration = false;
            Object.keys(data).forEach(team => {
              const statuses = data[team]?.status || [];
              if (statuses.some(s => s && LEGACY_LABELS.has(s.label))) {
                data[team].status = [...defaultStatusOptions];
                needsMigration = true;
              }
            });
            setTeamSettings(data);
            if (needsMigration && db) {
              setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'teamSettings'), data, { merge: true })
                .catch(e => console.warn('상태 목록 마이그레이션 저장 실패:', e));
            }
          }
        });
      }
    }, (error) => {
        console.error("Settings 로드 오류:", error);
        setAuthError("데이터베이스 접근 권한이 없습니다.");
        setDbErrorDetail(error.message || error.code);
        setIsDbLoading(false);
    });

    const unsubProjects = onSnapshot(projectsRef, (snapshot) => {
      const loadedProjects = [];
      if (!snapshot.empty) {
        snapshot.forEach(d => {
          loadedProjects.push({ ...d.data(), id: d.id });
        });
      }
      setAllProjects(loadedProjects);
      addLog(`DB 실시간 로드 완료: 총 ${loadedProjects.length}개 프로젝트 발견.`);
      setIsDbLoading(false);
    }, (error) => {
        console.error("Projects 로드 오류:", error);
        setAuthError("프로젝트 데이터를 불러올 수 없습니다.");
        setDbErrorDetail(error.message || error.code);
        setIsDbLoading(false);
    });

    const unsubPrefs = onSnapshot(prefsRef, (docSnap) => {
        if (docSnap.exists()) {
            setUserPrefs(docSnap.data());
            addLog(`사용자 기본 설정 로드됨`);
        } else {
            setUserPrefs({});
        }
    });

    // 주간보고 연결 구독 (팀별 단일 doc: weeklyLinks/{teamId})
    // currentTeam이 바뀔 때 재구독되므로 여기서는 전체 구독용 더미
    // 실제 팀 구독은 아래 currentTeam useEffect에서 담당

    return () => {
      unsubSettings();
      unsubProjects();
      unsubPrefs();
    };
  }, [user]);

  // ── 주간보고 연결 Firebase 구독 (팀 선택 시) ──────────────────────────────
  useEffect(() => {
      if (!currentTeam || !db || !user) return;
      const linkRef = doc(db, 'artifacts', appId, 'public', 'data', 'weeklyLinks', currentTeam);
      const unsub = onSnapshot(linkRef, (snap) => {
          setWeeklyLinks(snap.exists() ? (snap.data() || {}) : {});
      });
      return () => unsub();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTeam, db, user]);

  // ── 주간보고 IDB 목록 로드 (연결 모달 열 때마다 최신화) ─────────────────
  const refreshWeeklyReportList = () => {
      setWeeklyListLoading(true);
      wrIdbLoadAll()
          .then(all => setWeeklyReportList(all.sort((a, b) => b.savedAt.localeCompare(a.savedAt))))
          .catch(() => {})
          .finally(() => setWeeklyListLoading(false));
  };

  // ── ArrayBuffer ↔ base64 변환 (Firestore 저장용) ─────────────────────────
  const ab2b64 = (ab) => {
      const bytes = new Uint8Array(ab);
      const sz = 8192;
      let bin = '';
      for (let i = 0; i < bytes.length; i += sz)
          bin += String.fromCharCode(...bytes.subarray(i, Math.min(i + sz, bytes.length)));
      return btoa(bin);
  };
  const b642ab = (b64) => {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return bytes.buffer;
  };
  // 청크 문서 경로: meta = {team}_{pid}, 각 청크 = {team}_{pid}_c0, _c1, ...
  const wrMetaRef  = (team, pid) => doc(db, 'artifacts', appId, 'public', 'data', 'weeklyReportFiles', `${team}_${pid}`);
  const wrChunkRef = (team, pid, i) => doc(db, 'artifacts', appId, 'public', 'data', 'weeklyReportFiles', `${team}_${pid}_c${i}`);
  const CHUNK_BYTES = 500 * 1024; // 500KB binary → ~667KB base64 (1MB 미만)

  // ── 주간보고 연결 저장 (청크 분할 저장) ──────────────────────────────────
  const handleWeeklyLink = async (projectId, report) => {
      if (!db || !user) return;
      let hasFileData = false;
      if (report.id) {
          try {
              const full = await wrIdbGet(report.id);
              if (full?.fileBlob) {
                  const bytes = new Uint8Array(full.fileBlob);
                  const numChunks = Math.ceil(bytes.length / CHUNK_BYTES);
                  // 청크별 저장
                  for (let i = 0; i < numChunks; i++) {
                      const slice = bytes.subarray(i * CHUNK_BYTES, Math.min((i + 1) * CHUNK_BYTES, bytes.length));
                      await setDoc(wrChunkRef(currentTeam, projectId, i), { data: ab2b64(slice.buffer) });
                  }
                  // 메타 저장
                  await setDoc(wrMetaRef(currentTeam, projectId), {
                      chunks: numChunks, fileName: report.fileName,
                      sizeKB: Math.round(bytes.length / 1024), savedAt: new Date().toISOString(),
                  });
                  hasFileData = true;
                  console.log(`[WR] Firestore 저장 완료: ${numChunks}개 청크, ${Math.round(bytes.length/1024)}KB`);
              }
          } catch (e) {
              console.error('[WR] Firestore 저장 실패:', e);
              alert('파일 공유 저장 실패:\n' + e.message);
          }
      }
      const linkRef = doc(db, 'artifacts', appId, 'public', 'data', 'weeklyLinks', currentTeam);
      const newLinks = {
          ...weeklyLinks,
          [projectId]: { reportId: report.id, fileName: report.fileName, savedAt: report.savedAt, hasFileData },
      };
      await setDoc(linkRef, newLinks, { merge: false });
      setWeeklyLinkModal(null);
  };

  // ── 주간보고 연결 해제 ────────────────────────────────────────────────────
  const handleWeeklyUnlink = async (projectId) => {
      if (!db || !user) return;
      try {
          const meta = await getDoc(wrMetaRef(currentTeam, projectId));
          const numChunks = meta.exists() ? (meta.data().chunks || 1) : 0;
          for (let i = 0; i < numChunks; i++) {
              await deleteDoc(wrChunkRef(currentTeam, projectId, i));
          }
          await deleteDoc(wrMetaRef(currentTeam, projectId));
      } catch (_) {}
      const linkRef = doc(db, 'artifacts', appId, 'public', 'data', 'weeklyLinks', currentTeam);
      const newLinks = { ...weeklyLinks };
      delete newLinks[projectId];
      await setDoc(linkRef, newLinks, { merge: false });
  };

  // ── 주간보고 Excel 파싱 ─────────────────────────────────────────────────
  // 진척율요약 시트에서 날짜 범위에 해당하는 전월/금월/누적 컬럼을 읽어 반환
  const parseWeeklyProgressSummary = async (fileBlob, date1Str, date2Str, date3Str) => {
      if (!fileBlob) return null;
      const XLSX = await loadXLSX();
      let ab;
      try {
          ab = fileBlob instanceof ArrayBuffer ? fileBlob : await new Blob([fileBlob]).arrayBuffer();
      } catch (_) { return null; }

      const wb = XLSX.read(ab, { type: 'array', cellNF: true });
      console.log('[WR] SheetNames:', wb.SheetNames);

      // 진척율/진척률 요약 시트 우선
      const summaryName =
          wb.SheetNames.find(n => n.includes('진척율요약') || n.includes('진척율 요약') || n.includes('진척률요약') || n.includes('진척률 요약')) ||
          wb.SheetNames.find(n => n.includes('진척')) ||
          wb.SheetNames[0];
      console.log('[WR] summaryName:', summaryName);
      if (!summaryName) return null;
      const ws = wb.Sheets[summaryName];
      if (!ws || !ws['!ref']) { console.log('[WR] ws missing or no ref'); return null; }

      const range  = XLSX.utils.decode_range(ws['!ref']);
      const maxR   = range.e.r;
      const maxC   = range.e.c;
      const merges = ws['!merges'] || [];
      console.log('[WR] range:', maxR, 'rows x', maxC, 'cols, merges:', merges.length);

      // 셀 접근 헬퍼
      const getCell = (r, c) => ws[XLSX.utils.encode_cell({ r, c })] || null;
      const getRaw  = (r, c) => { const cell = getCell(r, c); return cell ? cell.v : null; };
      const getFmt  = (r, c) => {
          const cell = getCell(r, c);
          if (!cell) return null;
          return cell.w != null ? cell.w : (cell.v != null ? String(cell.v) : null);
      };
      const getTxt  = (r, c) => { const v = getFmt(r, c); return v != null ? String(v).trim() : ''; };

      // ① 서브헤더 행 탐색 (50행까지)
      const SUB_KW = ['전주기', '전주', '누적', 'total', 'Total', '최종', '계획', '실적', '전월', '금월', '당월', '금주', '금회'];
      let subHeaderRow = -1;
      for (let r = 0; r <= Math.min(maxR, 50); r++) {
          let cnt = 0;
          for (let c = 0; c <= maxC; c++) {
              const txt = getTxt(r, c).toLowerCase();
              if (SUB_KW.some(kw => txt.includes(kw.toLowerCase()))) cnt++;
          }
          if (cnt >= 2) { subHeaderRow = r; break; }
      }
      if (subHeaderRow < 0) {
          const preview = [];
          for (let r = 0; r <= Math.min(maxR, 30); r++) {
              const row = [];
              for (let c = 0; c <= Math.min(maxC, 15); c++) { const t = getTxt(r,c); if(t) row.push(`[${c}]${t}`); }
              if (row.length) preview.push(`행${r}: ${row.join(', ')}`);
          }
          return { _error: `헤더 인식 실패 (시트: ${summaryName})\n전주기/누적/Total 등 키워드를 찾을 수 없습니다.\n(시트 전체 ${maxR+1}행 × ${maxC+1}열)`, _preview: preview, sheetName: summaryName };
      }

      // ② 카테고리 헤더 행 = 서브헤더 바로 위 행
      const catHeaderRow = subHeaderRow > 0 ? subHeaderRow - 1 : -1;

      // ③ 병합 셀 기반 카테고리명 전파
      const catForCol = {};
      if (catHeaderRow >= 0) {
          for (let c = 0; c <= maxC; c++) {
              const txt = getTxt(catHeaderRow, c);
              if (txt) catForCol[c] = txt;
          }
          for (const m of merges) {
              if (m.s.r === catHeaderRow) {
                  const val = getTxt(catHeaderRow, m.s.c);
                  if (val) for (let c = m.s.c; c <= m.e.c; c++) catForCol[c] = val;
              }
          }
          let last = '';
          for (let c = 0; c <= maxC; c++) {
              if (catForCol[c]) last = catForCol[c];
              else if (last) catForCol[c] = last;
          }
      }

      // ④ 데이터 시작 행, 이름 컬럼 찾기
      const dataStartRow = subHeaderRow + 1;
      let nameCol = 0;
      for (let c = 0; c <= Math.min(maxC, 3); c++) {
          let cnt = 0;
          for (let r = dataStartRow; r <= Math.min(maxR, dataStartRow + 12); r++) {
              const v = getRaw(r, c);
              if (v != null && typeof v === 'string' && v.trim()) cnt++;
          }
          if (cnt >= 2) { nameCol = c; break; }
      }

      // ⑤ 날짜 헤더 행 탐색 (subHeaderRow 위에서 Excel 날짜 시리얼 또는 MM/DD 형식)
      const date1 = date1Str ? new Date(date1Str) : null;
      const date2 = date2Str ? new Date(date2Str) : null;
      const date3 = date3Str ? new Date(date3Str) : null;

      let colDates = {};
      let useDateMode = false;
      for (let r = 0; r < subHeaderRow; r++) {
          let dateCnt = 0;
          const tempDates = {};
          for (let c = 1; c <= maxC; c++) {
              const cell = getCell(r, c);
              if (!cell) continue;
              if (cell.t === 'n' && cell.v >= 40000 && cell.v <= 60000) {
                  try {
                      const di = XLSX.SSF.parse_date_code(cell.v);
                      if (di && di.y >= 2020) { tempDates[c] = new Date(di.y, di.m - 1, di.d); dateCnt++; }
                  } catch(_) {}
              } else if (cell.w) {
                  const m1 = String(cell.w).match(/^(\d{1,2})\/(\d{1,2})$/);
                  if (m1) {
                      const yr = new Date().getFullYear();
                      const d = new Date(yr, parseInt(m1[1]) - 1, parseInt(m1[2]));
                      if (!isNaN(d)) { tempDates[c] = d; dateCnt++; }
                  }
              }
          }
          if (dateCnt >= 3) { colDates = tempDates; useDateMode = true; break; }
      }

      // ⑥ parseVal 공통 헬퍼
      const parseVal = (rawV, fmtV) => {
          if (rawV === null || rawV === undefined) return { display: '-', pct: null };
          const display = fmtV ? String(fmtV).trim() : String(rawV);
          if (!display) return { display: '-', pct: null };
          let pct = null;
          if (typeof rawV === 'number') {
              if (rawV >= 0 && rawV <= 1)   pct = Math.round(rawV * 100);   // Excel % 형식 (0~1)
              else if (rawV > 1 && rawV <= 100) pct = Math.round(rawV);     // 정수 % (1~100)
          } else {
              const n = parseFloat(display.replace(/[%,]/g, ''));
              if (!isNaN(n) && n >= 0 && n <= 100) pct = Math.round(n);
          }
          return { display, pct };
      };

      const SKIP_RE = /^(no|번호|구분|분류|subtotal)$/i;
      const hasRefError = (rowData) => Object.values(rowData).some(cd => Object.values(cd).some(v => String(v?.display || '').includes('#REF')));

      // ─── DATE MODE: 날짜 기반 집계 ──────────────────────────────────────────
      if (useDateMode && date1 && date2 && date3) {
          // 카테고리 목록 (날짜 있는 컬럼만)
          const catSet = new Set();
          const catOrder = [];
          for (let c = 0; c <= maxC; c++) {
              if (c === nameCol || !colDates[c]) continue;
              const cat = catForCol[c];
              if (cat && !catSet.has(cat)) { catSet.add(cat); catOrder.push(cat); }
          }

          // 카테고리별 기간 컬럼 분류
          const catCols = {}; // cat → { prev:[c..], curr:[c..], accum:[c..] }
          for (let c = 0; c <= maxC; c++) {
              if (c === nameCol || !colDates[c]) continue;
              const d = colDates[c];
              const cat = catForCol[c];
              if (!cat) continue;
              if (!catCols[cat]) catCols[cat] = { prev: [], curr: [], accum: [] };
              if (d < date3) catCols[cat].accum.push(c);
              if (d >= date1 && d < date2) catCols[cat].prev.push(c);
              if (d >= date2 && d < date3) catCols[cat].curr.push(c);
          }

          // 날짜 없는 서브컬럼도 수집 (진척률/진척율 등 — 날짜 헤더 없이 이름만 있는 컬럼)
          const nonDateCols = {}; // cat → { subName: colIdx }
          for (let c = 0; c <= maxC; c++) {
              if (c === nameCol || colDates[c]) continue;
              const rawSub = getTxt(subHeaderRow, c);
              if (!rawSub) continue;
              const cat = catForCol[c];
              if (!cat) continue;
              if (!nonDateCols[cat]) nonDateCols[cat] = {};
              // 진척율(율) / 진척률(률) 두 표기 모두 진척률로 통일
              const subNorm = rawSub === '진척율' ? '진척률' : rawSub;
              nonDateCols[cat][subNorm] = c;
          }

          // 마지막 non-null 값 (날짜 오름차순 정렬 후 뒤에서 탐색)
          const getLastVal = (r, cols) => {
              const sorted = [...cols].sort((a, b) => colDates[a] - colDates[b]);
              for (let i = sorted.length - 1; i >= 0; i--) {
                  const raw = getRaw(r, sorted[i]);
                  if (raw !== null && raw !== undefined) {
                      return parseVal(raw, getFmt(r, sorted[i]));
                  }
              }
              return { display: '-', pct: null };
          };

          const PERIOD_SUBS = ['지난주', '금주', '누적'];
          const catList = catOrder.map(name => ({
              name,
              subs: [
                  ...PERIOD_SUBS.map(s => ({ sub: s })),
                  ...Object.keys(nonDateCols[name] || {}).map(s => ({ sub: s })),
              ],
          }));

          const dataRows = [];
          for (let r = dataStartRow; r <= maxR; r++) {
              const raw = getRaw(r, nameCol);
              if (raw === null || raw === undefined) continue;
              const name = String(raw).trim();
              if (!name || SKIP_RE.test(name) || name.includes('#REF')) continue;
              const rowData = {};
              let hasData = false;
              for (const cat of catList) {
                  const cols = catCols[cat.name] || { prev: [], curr: [], accum: [] };
                  const prev  = getLastVal(r, cols.prev);
                  const curr  = getLastVal(r, cols.curr);
                  const accum = getLastVal(r, cols.accum);
                  rowData[cat.name] = { '지난주': prev, '금주': curr, '누적': accum };
                  if (prev.pct !== null || curr.pct !== null || accum.pct !== null) hasData = true;
                  // 날짜 없는 서브컬럼 값 추가 (진척률 등)
                  const extras = nonDateCols[cat.name];
                  if (extras) {
                      for (const [subName, c] of Object.entries(extras)) {
                          const v = parseVal(getRaw(r, c), getFmt(r, c));
                          rowData[cat.name][subName] = v;
                          if (v.pct !== null) hasData = true;
                      }
                  }
              }
              if (!hasData) continue;
              if (hasRefError(rowData)) continue; // #REF! 오류 행 제외
              const isTotal = /전체|합계|소계|총계|계$|SU\+/.test(name);
              dataRows.push({ name, data: rowData, isTotal });
          }

          console.log('[WR date-mode] catList:', catList.map(c=>c.name), 'dataRows:', dataRows.length);
          if (dataRows.length > 0 && catList.length > 0) {
              return { sheetName: summaryName, date1: date1Str, date2: date2Str, date3: date3Str, catList, dataRows };
          }
          // date mode 결과 없으면 fallback
      }

      // ─── FALLBACK MODE: 서브컬럼 이름 기반 ────────────────────────────────
      // 리네임: 전주/지난주/전월 계열 → 지난주, 금주/금회/금월 계열 → 금주
      const RENAME_SUB = {
          '금주': '금주', '금회': '금주', '금주완료': '금주', '금주실적': '금주', '금월': '금주', '당월': '금주',
          '전주': '지난주', '전주기': '지난주', '지난주': '지난주', '전주실적': '지난주', '전월': '지난주',
          '진척율': '진척률',  // 율/률 두 표기 통일
      };
      // 제거할 서브컬럼 키워드 (차주예정, 완료예정 등)
      const SKIP_SUB = /차주|완료예정|next|schedule/i;

      const subCols = [];
      for (let c = 0; c <= maxC; c++) {
          if (c === nameCol) continue;
          const rawSub = getTxt(subHeaderRow, c);
          if (!rawSub) continue;
          if (SKIP_SUB.test(rawSub)) continue; // 차주예정·완료예정 제거
          const sub = RENAME_SUB[rawSub] || rawSub;
          subCols.push({ c, cat: catForCol[c] || '', sub });
      }

      const catList = [];
      const catMap  = {};
      for (const col of subCols) {
          if (!catMap[col.cat]) {
              catMap[col.cat] = { name: col.cat, subs: [] };
              catList.push(catMap[col.cat]);
          }
          catMap[col.cat].subs.push({ sub: col.sub, c: col.c });
      }

      const dataRows = [];
      for (let r = dataStartRow; r <= maxR; r++) {
          const raw = getRaw(r, nameCol);
          if (raw === null || raw === undefined) continue;
          const name = String(raw).trim();
          if (!name || SKIP_RE.test(name) || name.includes('#REF')) continue;

          const rowData = {};
          for (const cat of catList) {
              rowData[cat.name] = {};
              for (const { sub, c } of cat.subs) {
                  rowData[cat.name][sub] = parseVal(getRaw(r, c), getFmt(r, c));
              }
          }
          const hasData = Object.values(rowData).some(cd => Object.values(cd).some(v => v.display !== '-'));
          if (!hasData) continue;
          if (hasRefError(rowData)) continue; // #REF! 오류 행 제외

          const isTotal = /전체|합계|소계|총계|계$|SU\+/.test(name);
          dataRows.push({ name, data: rowData, isTotal });
      }

      console.log('[WR fallback] catList:', catList.map(c=>c.name), 'dataRows:', dataRows.length);
      if (dataRows.length === 0 || catList.length === 0) {
          return { _error: `파싱 실패: catList=${catList.length}개, dataRows=${dataRows.length}행`, sheetName: summaryName };
      }
      return { sheetName: summaryName, date1: date1Str, date2: date2Str, date3: date3Str, catList, dataRows };
  };

  // ── 주간보고 사이드 패널 열기 ─────────────────────────────────────────────
  const handleOpenWeeklyPanel = async (projectId) => {
      const link = weeklyLinks[projectId];
      if (!link) return;

      // 1. 이 PC의 IDB에서 먼저 탐색
      let fileBlob = null;
      const report = link.reportId ? await wrIdbGet(link.reportId) : null;
      if (report?.fileBlob) {
          fileBlob = report.fileBlob;
      }

      // 2. IDB에 없으면 Firestore 청크에서 조립
      if (!fileBlob && link.hasFileData) {
          try {
              const meta = await getDoc(wrMetaRef(currentTeam, projectId));
              if (!meta.exists()) throw new Error('파일 메타데이터가 없습니다');
              const { chunks: numChunks } = meta.data();
              const parts = [];
              for (let i = 0; i < numChunks; i++) {
                  const snap = await getDoc(wrChunkRef(currentTeam, projectId, i));
                  if (!snap.exists()) throw new Error(`청크 ${i} 누락`);
                  parts.push(b642ab(snap.data().data));
              }
              // 청크 합치기
              const totalLen = parts.reduce((s, ab) => s + ab.byteLength, 0);
              const combined = new Uint8Array(totalLen);
              let offset = 0;
              for (const ab of parts) { combined.set(new Uint8Array(ab), offset); offset += ab.byteLength; }
              fileBlob = combined.buffer;
              console.log(`[WR] Firestore 로드 완료: ${numChunks}청크, ${Math.round(totalLen/1024)}KB`);
          } catch (e) {
              console.error('[WR] Firestore 로드 실패:', e);
              alert('파일 로드에 실패했습니다:\n' + e.message);
              return;
          }
      }

      if (!fileBlob) {
          alert('연결된 주간보고 파일을 찾을 수 없습니다.\n원본 PC에서 연결 해제 후 다시 연결해 주세요.');
          return;
      }

      setWeeklyPanel({ projectId, fileName: link.fileName, fileBlob });
      setCollapsedCats(new Set());
      setPanelLoading(true);
      setPanelSummary(null);
      try {
          const result = await parseWeeklyProgressSummary(fileBlob, panelDate1, panelDate2, panelDate3);
          setPanelSummary(result ?? false);
      } catch (e) { console.error('[WR] 파싱 오류:', e); setPanelSummary(false); }
      finally { setPanelLoading(false); }
  };

  // ── 주간보고 다운로드 ────────────────────────────────────────────────────
  const handleWeeklyDownload = async (projectId) => {
      const link = weeklyLinks[projectId];
      if (!link) return;

      let fileBlob = null;
      const report = link.reportId ? await wrIdbGet(link.reportId) : null;
      if (report?.fileBlob) {
          fileBlob = report.fileBlob;
      }

      if (!fileBlob) {
          try {
              const meta = await getDoc(wrMetaRef(currentTeam, projectId));
              if (meta.exists()) {
                  const { chunks: numChunks } = meta.data();
                  const parts = [];
                  for (let i = 0; i < numChunks; i++) {
                      const snap = await getDoc(wrChunkRef(currentTeam, projectId, i));
                      if (!snap.exists()) throw new Error(`청크 ${i} 누락`);
                      parts.push(b642ab(snap.data().data));
                  }
                  const totalLen = parts.reduce((s, ab) => s + ab.byteLength, 0);
                  const combined = new Uint8Array(totalLen);
                  let off = 0;
                  for (const ab of parts) { combined.set(new Uint8Array(ab), off); off += ab.byteLength; }
                  fileBlob = combined.buffer;
              }
          } catch (e) {
              console.error('[WR] Firestore 다운로드 실패:', e);
          }
      }

      if (!fileBlob) {
          alert('연결된 주간보고 파일을 찾을 수 없습니다.\n원본 PC에서 연결 해제 후 다시 연결해 주세요.');
          return;
      }

      await loadFileSaver();
      window.saveAs(
          new Blob([fileBlob], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
          link.fileName
      );
  };

  // ★ 진행실적(progressRecords) 전체 로드 — pms 모드 진입 시
  useEffect(() => {
      if (currentMode !== 'pms' || !currentTeam || !db) return;
      (async () => {
          try {
              const snap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', `progressRecords_${currentTeam}`));
              const map = {};
              snap.docs.forEach(d => { map[d.id] = d.data(); });
              setProgressRecordsMap(map);
          } catch (e) { console.error('[progressRecords 로드 오류]', e); }
      })();
  }, [currentMode, currentTeam]); // eslint-disable-line react-hooks/exhaustive-deps

  // ★ PMS 월간보고 — 팀 선택 시 IndexedDB 로컬 데이터 자동 로드
  useEffect(() => {
      if (currentMode !== 'pms' || !currentTeam) return;
      if (localUnsavedProjects.length > 0) return; // 이미 임시 데이터 있으면 덮어쓰지 않음
      pmsIdbLoad(currentTeam).then(data => {
          if (data?.projects?.length > 0) {
              setLocalUnsavedProjects(data.projects);
              if (data.baseDate) setBaseDate(data.baseDate);
              setPmsLocalInfo({ savedAt: data.savedAt, count: data.projects.length });
              addLog(`[로컬DB] ${data.projects.length}건 자동 로드 (저장: ${new Date(data.savedAt).toLocaleString()})`);
          }
      }).catch(err => addLog(`[로컬DB 오류] ${err.message}`));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMode, currentTeam]);

  // ★ 프로젝트 리스트 관리 화면 데이터 로드 (currentMode가 projectList 일때만)
  useEffect(() => {
      if (currentMode !== 'projectList' || !currentTeam || !db) return;
      
      const listRef = doc(db, 'artifacts', appId, 'public', 'data', 'projectLists', currentTeam);
      const unsub = onSnapshot(listRef, (docSnap) => {
          if (docSnap.exists()) {
              const data = docSnap.data();
              // 로컬에 임시 편집 중인 상태(isDynamicUnsaved)가 아니라면 덮어쓰기
              if (!isDynamicUnsavedRef.current) {
                  setDynamicExcelCols(data.cols || []);
                  setDynamicExcelData(data.rows || []);
              }
              setOriginalDynamicCols(data.cols || []);
              setOriginalDynamicData(data.rows || []);
              addLog(`[${currentTeam}] 프로젝트 리스트 DB 로드 완료.`);
          } else {
              if (!isDynamicUnsavedRef.current) {
                  setDynamicExcelCols([]);
                  setDynamicExcelData([]);
              }
              setOriginalDynamicCols([]);
              setOriginalDynamicData([]);
          }
      }, (err) => {
          console.error("Project List 로드 오류", err);
      });

      return () => unsub();
  }, [currentMode, currentTeam, db]);

  useEffect(() => {
      if (!currentTeam) return;
      const savedOrder = teamSettings[currentTeam]?.colOrderV2 || [];
      if (savedOrder.length === 0) {
          setLocalColOrder(mainBaseColDefs.map(c => c.key));
      } else {
          const newKeys = mainBaseColDefs.map(c => c.key);
          const missing = newKeys.filter(k => !savedOrder.includes(k));
          setLocalColOrder([...savedOrder.filter(k => newKeys.includes(k)), ...missing]);
      }
  }, [teamSettings, currentTeam]);

  const orderedColDefs = useMemo(() => {
      const orderMap = new Map(localColOrder.map((key, idx) => [key, idx]));
      const sorted = [...mainBaseColDefs].sort((a, b) => {
          const aIdx = orderMap.has(a.key) ? orderMap.get(a.key) : 9999;
          const bIdx = orderMap.has(b.key) ? orderMap.get(b.key) : 9999;
          return aIdx - bIdx;
      });
      const ppIdx = sorted.findIndex(c => c.key === 'prevProgress');
      const cpIdx = sorted.findIndex(c => c.key === 'currProgress');
      if (ppIdx !== -1 && cpIdx !== -1 && ppIdx > cpIdx) {
          const [pp] = sorted.splice(ppIdx, 1);
          sorted.splice(cpIdx, 0, pp);
      }
      return sorted;
  }, [localColOrder]);

  const targetMonths = useMemo(() => {
      if (!baseDate) return { currMonthStr: '9999-12', prevMonthStr: '9999-11' }; 
      const [year, month] = baseDate.split('-').map(Number);
      const currMonthStr = baseDate; 
      const base = new Date(year, month - 1, 1);
      const prevDate = new Date(base.getFullYear(), base.getMonth() - 1, 1);
      const prevMonthStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
      return { currMonthStr, prevMonthStr };
  }, [baseDate]);

  // 월별 통합 데이터 항목 읽기 — monthlyData(이월 포함) 우선, 레거시 monthlyPoints/monthlyStatus/플랫 폴백
  // 이월 규칙(A안): 기준월 이전 기록들을 날짜순으로 겹쳐 읽어, 일부 칸만 있는 기록이 있어도
  // 빠진 칸은 가장 최근 값으로 채운다. 금월 실적(currPoints)만은 해당 월에 직접 기록된 값만 사용.
  const getMonthEntry = (p, monthStr) => {
      const upTo = (p.monthlyData || [])
          .filter(m => m.date <= monthStr)
          .sort((a, b) => a.date.localeCompare(b.date));
      if (upTo.length > 0) {
          const exact = upTo[upTo.length - 1].date === monthStr ? upTo[upTo.length - 1] : null;
          const merged = {};
          upTo.forEach(m => {
              Object.keys(m).forEach(k => {
                  if (m[k] !== undefined && m[k] !== null && m[k] !== '') merged[k] = m[k];
              });
          });
          return { ...merged, date: monthStr, currPoints: exact ? safeNumber(exact.currPoints) : 0 };
      }
      const legacyPts = (p.monthlyPoints || []).find(m => m.date === monthStr);
      const legacySt  = (p.monthlyStatus  || []).find(m => m.date === monthStr);
      return {
          date: monthStr,
          progressStatus: legacySt?.value || p.progressStatus || '',
          plc:            safeNumber(p.plc),
          etos:           safeNumber(p.etos),
          hmi:            safeNumber(p.hmi),
          internalTest:   safeNumber(p.internalTest),
          integratedTest: safeNumber(p.integratedTest),
          currPoints:     legacyPts ? safeNumber(legacyPts.value) : 0,
      };
  };

  const getEffectiveStatus = (p) => {
      // 기준월 이하에서 상태가 기록된 가장 최근 항목 사용 (상태 없는 기록은 건너뜀)
      const withStatus = (p.monthlyData || []).filter(m => m.date <= targetMonths.currMonthStr && m.progressStatus);
      if (withStatus.length > 0) {
          return withStatus.reduce((a, b) => (a.date > b.date ? a : b)).progressStatus;
      }
      if (p.monthlyStatus?.length > 0) {
          const legacy = p.monthlyStatus.find(m => m.date === targetMonths.currMonthStr);
          if (legacy) return legacy.value;
      }
      return p.progressStatus || '';
  };

  const buildMonthlyPointsFromLegacy = (p) => {
      if (p.monthlyPoints && p.monthlyPoints.length > 0) {
          return [...p.monthlyPoints].sort((a, b) => b.date.localeCompare(a.date));
      }
      const legacyPoints = [];
      Object.keys(p).forEach(k => {
          if (k.startsWith('dyn_')) {
              const val = safeNumber(p[k]);
              if (val !== 0) {
                  const parts = k.split('_');
                  const label = parts.slice(2).join('_');
                  let year = new Date().getFullYear();
                  const yearMatch = label.match(/(\d{2,4})년/);
                  if (yearMatch) {
                      let yStr = yearMatch[1];
                      year = yStr.length === 2 ? parseInt('20'+yStr, 10) : parseInt(yStr, 10);
                  }
                  const monthMatch = label.match(/(\d{1,2})월/);
                  if (monthMatch) {
                      const month = parseInt(monthMatch[1], 10);
                      const dateStr = `${year}-${String(month).padStart(2, '0')}`;
                      legacyPoints.push({ date: dateStr, value: val });
                  }
              }
          }
      });
      return legacyPoints.sort((a, b) => b.date.localeCompare(a.date));
  };

  const handleOpenModal = (project) => {
      if (project) {
          setEditingProject(project);
          // 월별 실적 리스트: 레거시(monthlyPoints/dyn_) 위에 장부A(monthlyData.currPoints)를 덮어 진실값 표시
          const legacyList = buildMonthlyPointsFromLegacy(project);
          const byDate = {};
          legacyList.forEach(mp => { if (mp?.date) byDate[mp.date] = safeNumber(mp.value); });
          (project.monthlyData || []).forEach(md => {
              if (md?.date && md.currPoints !== undefined && md.currPoints !== null && md.currPoints !== '') byDate[md.date] = safeNumber(md.currPoints);
          });
          const mergedPoints = Object.entries(byDate).map(([date, value]) => ({ date, value })).sort((a, b) => b.date.localeCompare(a.date));
          // 현재 기준월 데이터를 formData에 로드 (월별 필드 반영)
          const currEntry = getMonthEntry(project, targetMonths.currMonthStr);
          setFormData({
              ...project,
              monthlyPoints: mergedPoints,
              progressStatus: currEntry.progressStatus || project.progressStatus || '',
              plc: currEntry.plc, etos: currEntry.etos, hmi: currEntry.hmi,
              internalTest: currEntry.internalTest, integratedTest: currEntry.integratedTest,
              progressItems: { ...DEFAULT_PROGRESS_ITEMS, ...(project.progressItems || {}) },
          });
      } else {
          setEditingProject(null);
          const safeFactories = currentFactoryOptions.filter(Boolean);
          const safeManagers = currentManagerOptions.filter(Boolean);
          const safeStatuses = currentStatusOptions.filter(Boolean);
          
          setFormData({
              factory: safeFactories[0] || '', project: '', content: '', progressStatus: safeStatuses[0]?.label || '진행중', manager: safeManagers[0] || '',
              execNo: '', estNo: '', client: '', investReview: '',
              startDate: '', endDate: '', plc: 0, etos: 0, hmi: 0, internalTest: 0, integratedTest: 0, progress: 0,
              material: 0, l1: 0, l2: 0,
              totalCommissioningPoints: 0, monthlyPoints: [],
              progressItems: { ...DEFAULT_PROGRESS_ITEMS }
          });
      }
      // 창을 화면 중앙으로 초기 배치
      const w = 900;
      const h = Math.round(window.innerHeight * 0.88);
      setEditModalPos({
          x: Math.max(0, Math.round((window.innerWidth - w) / 2)),
          y: Math.max(0, Math.round((window.innerHeight - h) / 2)),
      });
      setIsModalOpen(true);
  };

  const PROGRESS_KEYS = ['plc','etos','hmi','internalTest','integratedTest'];
  const getAppliedKeys = (p) => {
      // #7 프로젝트별: 그 프로젝트의 항목 설정 우선, 없으면 전부 켜짐(DEFAULT)
      const items = (p && p.progressItems) || DEFAULT_PROGRESS_ITEMS;
      return PROGRESS_KEYS.filter(k => items[k] !== false);
  };
  const calcAvg = (entry, appliedKeys) => {
      if (appliedKeys.length === 0) return 0;
      return Math.round(appliedKeys.reduce((s, k) => s + safeNumber(entry[k]), 0) / appliedKeys.length);
  };

  const getCalculatedRowData = (p) => {
      const curr = getMonthEntry(p, targetMonths.currMonthStr);
      const prev = getMonthEntry(p, targetMonths.prevMonthStr);
      const applied = getAppliedKeys(p);

      const avgProgress     = calcAvg(curr, applied);
      const prevAvgProgress = calcAvg(prev, applied);

      // 시운전 포인트: 통일 계산기 하나만 사용 (자체=self가 기존 단일 숫자의 의미)
      const pointsTriple = getPointsTriple(p);
      const currPointsVal = pointsTriple.curr.self;
      const prevPointsVal = pointsTriple.prev.self;
      let accPointsVal = pointsTriple.acc.self;

      // 레거시 폴백: 월별 기록이 아무 데도 없는 옛 데이터(dyn_/플랫 accPoints)만 해당
      if (accPointsVal === 0 && !(p.monthlyData?.length > 0) && !(p.monthlyPoints?.length > 0)) {
          let hasDyn = false; let dynSum = 0;
          Object.keys(p).forEach(k => {
              if (k.startsWith('dyn_')) { hasDyn = true; dynSum += safeNumber(p[k]); }
          });
          accPointsVal = Math.trunc(hasDyn ? dynSum : safeNumber(p.accPoints));
      }

      return {
          avgProgress, prevAvgProgress, accPointsVal, prevPointsVal, currPointsVal, pointsTriple,
          currPlc: safeNumber(curr.plc), currEtos: safeNumber(curr.etos),
          currHmi: safeNumber(curr.hmi), currInternalTest: safeNumber(curr.internalTest),
          currIntegratedTest: safeNumber(curr.integratedTest),
          appliedKeys: applied,
      };
  };

  // 진행실적 저장 후 progressRecordsMap 메모리 즉시 갱신
  const handleProgressSaved = ({ docKey, weeklyData }) => {
      setProgressRecordsMap(prev => ({ ...prev, [docKey]: { weekly: weeklyData } }));
  };

  // 진행실적 모달 → 업무현황 월별 데이터 적용 저장
  const handleApplyProgressToMonthly = async (projectId, data) => {
      const pid = String(projectId);
      const base = localUnsavedProjects.find(p => String(p.id) === pid) || allProjects.find(p => String(p.id) === pid);
      if (!base) { console.error('[ApplyProgress] 프로젝트 없음:', pid); throw new Error('프로젝트를 찾을 수 없습니다'); }
      const baseMd = (pendingEdits[pid]?.monthlyData) || base.monthlyData || [];
      const monthStr = data.monthStr;

      // progressRecords의 월별 시운전 합산을 monthlyData에 병합
      // 자체 → currPoints, 통합 → intPoints. 누적은 통일 계산기(getPointsTriple)가 자동 계산
      let updatedMd = [...baseMd];
      const mergeSums = (sums, fieldKey) => {
          if (!sums) return;
          Object.entries(sums).forEach(([date, pts]) => {
              const idx = updatedMd.findIndex(m => m.date === date);
              if (idx >= 0) {
                  updatedMd[idx] = { ...updatedMd[idx], [fieldKey]: pts };
              } else {
                  updatedMd = [...updatedMd, { date, [fieldKey]: pts }];
              }
          });
      };
      mergeSums(data.monthlyCommSums, 'currPoints');
      mergeSums(data.monthlyIntCommSums, 'intPoints');

      // 금월 전체 업데이트 (plc/etos/hmi/internalTest/integratedTest/currPoints)
      const currUpdates = {};
      if (data.plc            != null) currUpdates.plc            = data.plc;
      if (data.etos           != null) currUpdates.etos           = data.etos;
      if (data.hmi            != null) currUpdates.hmi            = data.hmi;
      if (data.internalTest   != null) currUpdates.internalTest   = data.internalTest;
      if (data.integratedTest != null) currUpdates.integratedTest = data.integratedTest;
      if (data.currPoints     != null) currUpdates.currPoints     = data.currPoints;
      const currIdx = updatedMd.findIndex(m => m.date === monthStr);
      if (currIdx >= 0) {
          updatedMd[currIdx] = { ...updatedMd[currIdx], ...currUpdates };
      } else {
          // 이월 규칙(A안): 새 달 기록 생성 시 이전 달 기록을 이어받은 뒤 입력값 반영
          // 단, 실적(currPoints/intPoints)은 이월하지 않음 — 미정의로 두면 통일 계산기가 장부B로 폴백
          const earlier = updatedMd.filter(m => m.date < monthStr);
          let seed = {};
          if (earlier.length > 0) {
              const { currPoints: _cp, intPoints: _ip, ...rest } = earlier.reduce((a, b) => (a.date > b.date ? a : b));
              seed = rest;
          }
          updatedMd = [...updatedMd, { ...seed, date: monthStr, ...currUpdates }];
      }

      const merged = { ...base, ...(pendingEdits[pid] || {}), monthlyData: updatedMd };
      const safeData = sanitizePayload({ ...merged, id: pid, team: currentTeam });
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'projects', pid), safeData);
      setAllProjects(prev => prev.map(p => String(p.id) === pid ? { ...p, monthlyData: updatedMd } : p));
      setPendingEdits(prev => { const next = { ...prev }; delete next[pid]; return next; });
  };

  // A-4b ③(2026-06-12): List 화면 진행실적 적용 — pid로 연결된 월간 프로젝트를 찾아 그쪽에 적용
  // (List 행 id는 월간 목록(allProjects)에 없으므로, 고유ID(pid)로 짝을 찾아 위 월간적용 함수에 위임)
  const applyProgressByPid = async (pid, data) => {
      if (!pid) return;
      const monthly = allProjects.find(p => p.pid === pid) || localUnsavedProjects.find(p => p.pid === pid);
      if (!monthly) { console.warn('[ApplyByPid] 연결된 월간 프로젝트 없음 pid=', pid); return; }
      await handleApplyProgressToMonthly(monthly.id, data);
  };

  // ───────── 통일 계산기 (2026-06-11 전수검사 §6: 계산 로직 일원화) ─────────
  // 장부B(progressRecords) 월별 합산 맵 — 메인 행 키 + sub_i_* 하위 행 키 모두 포함
  // key: pid 우선(A-4b) → execNo → _id/id 폴백 (ProgressModal과 동일 규칙), 이관 표시(_migratedTo) 문서는 무시
  const getRecordMonthlySums = (p) => {
      const pick = (k) => { const r = k ? progressRecordsMap[k] : undefined; return r && !r._migratedTo ? r : undefined; };
      const rec = pick(p.pid) || pick(p.execNo) || pick(String(p._id || p.id));
      const self = {}, intg = {};
      const add = (data, target) => Object.entries(data || {}).forEach(([k, v]) => {
          const parts = String(k).split('-');
          if (parts.length < 2) return;
          const mk = `${parts[0]}-${String(Number(parts[1])).padStart(2, '0')}`; // 'YYYY-MM' 정규화
          target[mk] = (target[mk] || 0) + (Number(v) || 0);
      });
      if (rec?.weekly) {
          Object.keys(rec.weekly).forEach(key => {
              if (key === 'commissioning' || /^sub_\d+_commissioning$/.test(key)) add(rec.weekly[key], self);
              else if (key === 'intCommissioning' || /^sub_\d+_intCommissioning$/.test(key)) add(rec.weekly[key], intg);
          });
      }
      return { self, intg };
  };

  // 달마다 "장부A(monthlyData) 우선 → 레거시 monthlyPoints(자체만) → 장부B(progressRecords)"
  // 규칙으로 합친 월별 포인트 맵. 자체=self, 통합=intg
  const hasVal = (v) => v !== undefined && v !== null && v !== '';
  const getMergedPointsByMonth = (p) => {
      const b = getRecordMonthlySums(p);
      const self = { ...b.self };
      const intg = { ...b.intg };
      buildMonthlyPointsFromLegacy(p).forEach(mp => { if (mp?.date) self[mp.date] = safeNumber(mp.value); }); // C: monthlyPoints, 없으면 dyn_ 파싱
      (p.monthlyData || []).forEach(md => {
          if (!md?.date) return;
          if (hasVal(md.currPoints)) self[md.date] = safeNumber(md.currPoints);
          if (hasVal(md.intPoints))  intg[md.date] = safeNumber(md.intPoints);
      });
      return { self, intg };
  };

  // 누적/전월/금월 (자체·통합) — 화면 표, 내보내기, 셀 초기값 전부 이 함수 하나만 사용
  const getPointsTriple = (p) => {
      const { self, intg } = getMergedPointsByMonth(p);
      const cm = targetMonths.currMonthStr, pm = targetMonths.prevMonthStr;
      const upTo = (map, lim) => Object.entries(map).reduce((s, [k, v]) => (k <= lim ? s + v : s), 0);
      return {
          curr: { self: Math.trunc(self[cm] || 0), int: Math.trunc(intg[cm] || 0) },
          prev: { self: Math.trunc(self[pm] || 0), int: Math.trunc(intg[pm] || 0) },
          acc:  { self: Math.trunc(upTo(self, cm)), int: Math.trunc(upTo(intg, cm)) },
      };
  };
  // ─────────────────────────────────────────────────────────────────────────

  const handleMouseDown = (e, colKey) => {
      setResizingCol(colKey);
      setStartX(e.clientX);
      // startWidth = 현재 화면에 표시되는 실제 너비 (스케일 적용 후)
      setStartWidth(Math.round((previewColWidths[colKey] || 100) * colScale));
      e.preventDefault();
  };

  useEffect(() => {
      const handleMouseMove = (e) => {
          if (!resizingCol) return;
          const deltaX = e.clientX - startX;
          const newVisualWidth = Math.max(24, startWidth + deltaX);
          // 베이스 너비로 역산해서 저장 (스케일 적용 전 값)
          setPreviewColWidths(prev => ({ ...prev, [resizingCol]: Math.round(newVisualWidth / colScale) }));
      };
      const handleMouseUp = () => setResizingCol(null);

      if (resizingCol) {
          document.addEventListener('mousemove', handleMouseMove);
          document.addEventListener('mouseup', handleMouseUp);
      }
      return () => {
          document.removeEventListener('mousemove', handleMouseMove);
          document.removeEventListener('mouseup', handleMouseUp);
      };
  }, [resizingCol, startX, startWidth]);

  // 컴팩트 모드 변경 시 즉시 저장
  useEffect(() => {
      try { localStorage.setItem(LS_COMPACT_MODE, String(compactMode)); } catch {}
  }, [compactMode]);

  // 열 너비 변경 시 500ms 디바운스 저장 (드래그 중 과도한 쓰기 방지)
  useEffect(() => {
      const timer = setTimeout(() => {
          try { localStorage.setItem(LS_COL_WIDTHS, JSON.stringify(previewColWidths)); } catch {}
      }, 500);
      return () => clearTimeout(timer);
  }, [previewColWidths]);

  // (스냅샷 뷰 모드 제거 — 항상 라이브 데이터 표시)

  // ── 팀 변경 시 FB 스냅샷 메타데이터 로드 ─────────────────────────────
  useEffect(() => {
      if (!currentTeam || !db) { setFbSnapshots({}); return; }
      const snapsRef = collection(db, 'artifacts', appId, 'public', 'data', 'snapshots');
      const q = query(snapsRef, where('team', '==', currentTeam));
      getDocs(q).then(snap => {
          const meta = {};
          snap.forEach(d => { const data = d.data(); meta[data.baseDate] = { savedAt: data.savedAt, count: data.count }; });
          setFbSnapshots(meta);
      }).catch(() => setFbSnapshots({}));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTeam]);
  // ────────────────────────────────────────────────────────────────────────

  // ── 월간 업무현황 스냅샷 저장 ──────────────────────────────────────────
  const getMonthlySnaps = () => {
      try { return JSON.parse(localStorage.getItem(LS_MONTHLY_SNAP) || '{}'); } catch { return {}; }
  };

  // ── 로그인 핸들러 ────────────────────────────────────────────────────────
  const handleEmailLogin = async (email, stayLoggedIn) => {
      if (!auth) return false;
      setLoginLoading(true);
      setLoginError('');
      try {
          const persistence = stayLoggedIn ? browserLocalPersistence : browserSessionPersistence;
          await setPersistence(auth, persistence);
          await sendSignInLinkToEmail(auth, email, {
              url: window.location.origin + window.location.pathname,
              handleCodeInApp: true,
          });
          localStorage.setItem(EMAIL_FOR_SIGN_IN, email);
          localStorage.setItem(LS_LAST_EMAIL, email);
          return true;
      } catch (e) {
          setLoginError(getLoginErrorMessage(e.code));
          return false;
      } finally {
          setLoginLoading(false);
      }
  };

  // 원래 탭(로그인 창)에서 다른 탭의 로그인 완료 감지
  useEffect(() => {
      if (!isAuthReady || user || isEmailLinkTab || !auth) return;
      const handleStorage = (e) => {
          if (e.key === 'pms_auth_signal') {
              localStorage.removeItem('pms_auth_signal');
              window.location.reload();
          }
      };
      window.addEventListener('storage', handleStorage);
      return () => window.removeEventListener('storage', handleStorage);
  }, [isAuthReady, user, isEmailLinkTab]);

  const handleGoogleLogin = async (stayLoggedIn) => {
      if (!auth) return;
      setLoginLoading(true);
      setLoginError('');
      try {
          const persistence = stayLoggedIn ? browserLocalPersistence : browserSessionPersistence;
          await setPersistence(auth, persistence);
          await signInWithPopup(auth, new GoogleAuthProvider());
      } catch (e) {
          setLoginError(getLoginErrorMessage(e.code));
      } finally {
          setLoginLoading(false);
      }
  };

  const handleSignOut = async () => {
      if (!auth) return;
      await signOut(auth);
      setUser(null);
      setIsDbLoading(false);
  };

  // 공용 계정 로그인 (아이디 + 비밀번호)
  const handleSharedLogin = async (username, password, stayLoggedIn) => {
      if (!auth || !db) return false;
      setLoginLoading(true);
      setLoginError('');
      const syntheticEmail = `${username}@pms.shared`;
      try {
          const persistence = stayLoggedIn ? browserLocalPersistence : browserSessionPersistence;
          await setPersistence(auth, persistence);
          try {
              await signInWithEmailAndPassword(auth, syntheticEmail, password);
          } catch (firstErr) {
              // Firebase Auth 계정이 없거나 잘못된 자격증명 → Firestore 확인 후 자동 생성
              if (firstErr.code === 'auth/user-not-found' || firstErr.code === 'auth/invalid-credential') {
                  const docSnap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'registeredUsers', syntheticEmail));
                  if (!docSnap.exists()) {
                      setLoginError('등록되지 않은 공용 계정입니다. 관리자에게 문의하세요.');
                      return false;
                  }
                  const stored = docSnap.data();
                  if (stored.password !== password) {
                      setLoginError('비밀번호가 올바르지 않습니다.');
                      return false;
                  }
                  // Firestore에 등록 + 비밀번호 일치 → Firebase Auth 계정 자동 생성 후 로그인
                  const secName = 'pms_sec_' + Date.now();
                  let secApp = null;
                  try {
                      secApp = initializeApp(firebaseConfig, secName);
                      const secAuth = getAuth(secApp);
                      await createUserWithEmailAndPassword(secAuth, syntheticEmail, password);
                      await signOut(secAuth);
                  } catch (ce) {
                      if (ce.code !== 'auth/email-already-in-use') throw ce;
                  } finally {
                      if (secApp) deleteApp(secApp).catch(() => {});
                  }
                  await signInWithEmailAndPassword(auth, syntheticEmail, password);
              } else {
                  throw firstErr;
              }
          }
          return true;
      } catch (e) {
          setLoginError(getLoginErrorMessage(e.code));
          return false;
      } finally {
          setLoginLoading(false);
      }
  };

  // 공용 계정 생성 — 2차 앱 인스턴스로 현재 로그인 세션 유지
  const handleCreateSharedAccount = async (username, password, displayName, role) => {
      const syntheticEmail = `${username}@pms.shared`;
      const secondaryAppName = 'pms_secondary_' + Date.now();
      let secondaryApp = null;
      try {
          // 중복 확인
          const existDoc = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'registeredUsers', syntheticEmail));
          if (existDoc.exists()) return { success: false, error: '이미 존재하는 아이디입니다.' };

          // 2차 Firebase 앱으로 계정 생성 (현재 관리자 세션 유지)
          secondaryApp = initializeApp(firebaseConfig, secondaryAppName);
          const secondaryAuth = getAuth(secondaryApp);
          try {
              await createUserWithEmailAndPassword(secondaryAuth, syntheticEmail, password);
          } catch (e) {
              if (e.code !== 'auth/email-already-in-use') throw e;
              // 이미 Firebase Auth에 존재 → Firestore 등록만 진행
          }
          await signOut(secondaryAuth);

          // Firestore 등록 (password 포함 — 관리자 비밀번호 변경 시 필요)
          const userData = {
              email:           syntheticEmail,
              displayName:     displayName || username,
              role,
              active:          true,
              isSharedAccount: true,
              username,
              password,
              createdAt:       new Date().toISOString(),
              addedBy:         user?.email || '',
          };
          await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'registeredUsers', syntheticEmail), userData);
          return { success: true };
      } catch (e) {
          return { success: false, error: e.message || '계정 생성 중 오류가 발생했습니다.' };
      } finally {
          if (secondaryApp) deleteApp(secondaryApp).catch(() => {});
      }
  };

  // 공용 계정 비밀번호 변경 — 2차 앱으로 로그인 후 updatePassword 호출
  const handleUpdateSharedPassword = async (username, newPassword) => {
      const syntheticEmail = `${username}@pms.shared`;
      const secondaryAppName = 'pms_secondary_pw_' + Date.now();
      let secondaryApp = null;
      try {
          // Firestore에서 현재 비밀번호 조회
          const userDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'registeredUsers', syntheticEmail);
          const snap = await getDoc(userDocRef);
          if (!snap.exists()) return { success: false, error: '계정을 찾을 수 없습니다.' };
          const oldPassword = snap.data().password;
          if (!oldPassword) return { success: false, error: '기존 비밀번호 정보가 없습니다. 계정을 재생성해 주세요.' };

          // 2차 앱으로 기존 비밀번호로 로그인 → 비밀번호 변경
          secondaryApp = initializeApp(firebaseConfig, secondaryAppName);
          const secondaryAuth = getAuth(secondaryApp);
          const cred = await signInWithEmailAndPassword(secondaryAuth, syntheticEmail, oldPassword);
          await updatePassword(cred.user, newPassword);
          await signOut(secondaryAuth);

          // Firestore 비밀번호 업데이트
          await setDoc(userDocRef, { password: newPassword }, { merge: true });
          return { success: true };
      } catch (e) {
          if (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') {
              return { success: false, error: '기존 비밀번호가 일치하지 않습니다. 계정을 재생성해 주세요.' };
          }
          return { success: false, error: e.message || '비밀번호 변경 중 오류가 발생했습니다.' };
      } finally {
          if (secondaryApp) deleteApp(secondaryApp).catch(() => {});
      }
  };
  // ─────────────────────────────────────────────────────────────────────────

  const handleMonthlySaveClick = () => {
      if (!currentTeam || !db) return;
      setSnapSaveMonth(baseDate);
      setMonthlySnapModal(true);
  };

  const executeMonthlySnap = async () => {
      const targetMonth = snapSaveMonth;
      if (!targetMonth || !currentTeam || !db) return;

      // pendingEdits를 병합한 최종 데이터 (화면에 보이는 상태 그대로 저장)
      const projects = baseOrderedProjects.map(p => ({
          ...p,
          ...(pendingEdits[String(p.id)] || {}),
      }));

      const savedAt = new Date().toISOString();
      const docId = `${currentTeam}_${targetMonth}`;
      const snapData = { team: currentTeam, baseDate: targetMonth, savedAt, count: projects.length, projects };

      try {
          // 1) pendingEdits가 있는 행을 projects 컬렉션에 저장 → onSnapshot 트리거 → 테이블 즉시 반영
          const pendingIds = Object.keys(pendingEdits);
          if (pendingIds.length > 0) {
              await Promise.all(
                  pendingIds.map(pid => {
                      const merged = projects.find(p => String(p.id) === pid);
                      if (!merged) return Promise.resolve();
                      const safeData = sanitizePayload({ ...merged, id: pid, team: currentTeam });
                      return setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'projects', pid), safeData);
                  })
              );
              setPendingEdits({});
          }

          // 2) 스냅샷 저장
          await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'snapshots', docId), snapData);
          setFbSnapshots(prev => ({ ...prev, [targetMonth]: { savedAt, count: projects.length } }));
          setMonthlySnapToast({ month: targetMonth, count: projects.length });
          setTimeout(() => setMonthlySnapToast(null), 3000);
      } catch (e) {
          console.error('월간 저장 실패:', e);
          alert('저장 실패: Firebase 오류가 발생했습니다.');
      }
      setMonthlySnapModal(false);
  };

  // ── 로컬스토리지 → Firebase 일괄 마이그레이션 ──────────────────────────
  const [migrateModal, setMigrateModal] = useState(false);
  const [migrateProgress, setMigrateProgress] = useState(null); // null | { done, total, log[] }

  const localSnapMonths = (() => {
      if (!currentTeam) return [];
      const snaps = getMonthlySnaps();
      return Object.keys(snaps[currentTeam] || {}).sort();
  })();

  const executeMigration = async () => {
      if (!currentTeam || !db) return;
      const snaps = getMonthlySnaps();
      const teamSnaps = snaps[currentTeam] || {};
      const months = Object.keys(teamSnaps).sort();
      if (months.length === 0) return;

      setMigrateProgress({ done: 0, total: months.length, log: [] });
      let done = 0;
      const log = [];

      for (const month of months) {
          const snap = teamSnaps[month];
          const docId = `${currentTeam}_${month}`;
          try {
              await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'snapshots', docId), {
                  team: currentTeam, baseDate: month,
                  savedAt: snap.savedAt, count: snap.count, projects: snap.projects,
              });
              setFbSnapshots(prev => ({ ...prev, [month]: { savedAt: snap.savedAt, count: snap.count } }));
              done++;
              log.push({ month, ok: true, count: snap.count });
          } catch (e) {
              log.push({ month, ok: false, err: e.message });
          }
          setMigrateProgress({ done, total: months.length, log: [...log] });
      }
  };
  // ────────────────────────────────────────────────────────────────────────

  const handleDoubleClickResize = (colKey, headerLabel) => {
      const dataSource = isExcelPreviewOpen ? stagedExcelData : [...allProjects, ...localUnsavedProjects];
      if (!dataSource || dataSource.length === 0) return;
      let maxVisualWidth = headerLabel.length * 14 + 50; 
      dataSource.forEach((row, idx) => {
          let valStr = '';
          const { avgProgress, accPointsVal, prevPointsVal, currPointsVal } = getCalculatedRowData(row);

          if (colKey === 'no') valStr = String(idx + 1);
          else if (colKey === 'progress' || colKey === 'currProgress') valStr = `${avgProgress}%`;
          else if (colKey === 'accPoints') valStr = accPointsVal.toLocaleString();
          else if (colKey === 'prevPoints') valStr = prevPointsVal.toLocaleString();
          else if (colKey === 'currPoints') valStr = currPointsVal.toLocaleString();
          else if (colKey === 'totalCommissioningPoints') valStr = safeNumber(row[colKey]).toLocaleString();
          else valStr = safeRender(row[colKey]);

          let currentWidth = 0;
          for (let i = 0; i < valStr.length; i++) {
              currentWidth += valStr.charCodeAt(i) > 255 ? 14 : 8.5;
          }
          currentWidth += 40; 
          if (currentWidth > maxVisualWidth) maxVisualWidth = currentWidth;
      });
      const finalWidth = Math.min(Math.max(maxVisualWidth, 60), 800);
      setPreviewColWidths(prev => ({ ...prev, [colKey]: finalWidth }));
  };

  const getPreviewColClass = (idx) => {
      if (idx > frozenPreviewIdx) return '';
      let cls = 'sticky-col ';
      if (idx === frozenPreviewIdx) cls += 'sticky-last ';
      return cls;
  };

  const baseOrderedProjects = useMemo(() => {
      // 항상 라이브 데이터: Firestore + 미저장 로컬 데이터
      const savedIds = new Set(allProjects.map(p => p.id));
      const uniqueUnsaved = localUnsavedProjects.filter(p => !savedIds.has(p.id));
      const rawProjects = [...allProjects, ...uniqueUnsaved].filter(p => p.team === currentTeam);

      const sorted = rawProjects.sort((a, b) => String(a.id).localeCompare(String(b.id)));

      let lastMainId = null;
      return sorted.map(p => {
          const execNoStr = String(p.execNo).trim().toLowerCase();
          const isSub = execNoStr === 's' || execNoStr.startsWith('-');

          if (!isSub) {
              lastMainId = p.id;
              return { ...p, parentId: null, isSub: false };
          } else {
              return { ...p, parentId: lastMainId, isSub: true };
          }
      });
  }, [allProjects, localUnsavedProjects, currentTeam]);

  const currentFactoryOptions = currentTeam ? teamSettings[currentTeam]?.factory || [] : [];
  const currentManagerOptions = currentTeam ? teamSettings[currentTeam]?.manager || [] : [];
  const currentStatusOptions = currentTeam ? teamSettings[currentTeam]?.status || [] : [];

  const factorySummary = useMemo(() => {
      const counts = {};
      currentFactoryOptions.forEach(opt => counts[opt] = 0);
      baseOrderedProjects.forEach(p => {
          if (!p.isSub) {
              const f = safeRender(p.factory).trim() || '미지정';
              counts[f] = (counts[f] || 0) + 1;
          }
      });
      return counts;
  }, [baseOrderedProjects, currentFactoryOptions]);

  const displayFactories = useMemo(() => {
      return Array.from(new Set([...currentFactoryOptions, ...Object.keys(factorySummary)]));
  }, [currentFactoryOptions, factorySummary]);

  const { statusSummaryItems, filterStatusOptions, totalProjectsCount } = useMemo(() => {
      const map = new Map();
      currentStatusOptions.forEach(opt => {
          if (opt && opt.label) {
              map.set(opt.label, { ...opt, count: 0 });
          }
      });

      let total = 0;
      baseOrderedProjects.forEach(p => {
          if (!p.isSub) {
              const s = safeRender(getEffectiveStatus(p)).trim() || '미지정';
              total++;
              if (map.has(s)) {
                  map.get(s).count++;
              }
              // 목록에 없는 상태는 카운트는 하지만 상태바에 표시 안 함
          }
      });

      return {
          statusSummaryItems: Array.from(map.values()),
          filterStatusOptions: Array.from(map.keys()),
          totalProjectsCount: total
      };
  }, [baseOrderedProjects, currentStatusOptions, targetMonths]);

  // 데이터 첫 로드 시 진행 관련 상태 자동 선택 (필터가 비어 있을 때 + 데이터가 있을 때)
  useEffect(() => {
      if (currentMode !== 'pms' || activeFilterStatuses.size > 0) return;
      if (baseOrderedProjects.length === 0) return;
      // count > 0 인 항목 중 '진행' 키워드 포함 우선, 없으면 count가 가장 많은 항목
      const withData = statusSummaryItems.filter(s => s.count > 0);
      const progressing = withData.find(s => s.label === '진행중' || s.label === '진행');
      const target = (progressing || withData[0])?.label;
      if (target) setActiveFilterStatuses(new Set([target]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusSummaryItems, currentMode, baseOrderedProjects]);

  const filteredAndSortedProjects = useMemo(() => {
      // 검색 모드가 아닌데 상태 필터도 없으면 빈 결과
      if (!searchActive && activeFilterStatuses.size === 0) return [];

      let filteredMains = new Set();
      let matchedSubs = new Set();

      baseOrderedProjects.forEach(p => {
          let matchSearch = true;
          if (searchTerm) {
              const term = searchTerm.toLowerCase();
              matchSearch = safeRender(p.project).toLowerCase().includes(term) ||
                            safeRender(p.factory).toLowerCase().includes(term) ||
                            safeRender(p.manager).toLowerCase().includes(term) ||
                            safeRender(p.execNo).toLowerCase().includes(term) ||
                            safeRender(p.content).toLowerCase().includes(term);
          }

          // 검색 모드면 status 필터 무시 (전체 검색)
          const matchStatus = searchActive
              ? true
              : activeFilterStatuses.has(safeRender(getEffectiveStatus(p)).trim());
          const matchFactory = activeFilterFactories.size === 0 || activeFilterFactories.has(safeRender(p.factory).trim());

          if (matchSearch && matchFactory && matchStatus) {
              if (!p.isSub) {
                  filteredMains.add(p.id);
              } else {
                  matchedSubs.add(p.id);
                  if (p.parentId) filteredMains.add(p.parentId);
              }
          }
      });

      const mains = baseOrderedProjects.filter(p => !p.isSub && filteredMains.has(p.id));

      // 검색 모드에서는 진행현황 기준으로 그룹 정렬
      if (searchActive) {
          mains.sort((a, b) => {
              const sa = safeRender(getEffectiveStatus(a));
              const sb = safeRender(getEffectiveStatus(b));
              if (sa !== sb) return sa.localeCompare(sb);
              return String(a.id).localeCompare(String(b.id));
          });
      } else if (sortConfig.key && sortConfig.key !== 'id') {
          mains.sort((a, b) => {
              let valA = a[sortConfig.key] || '';
              let valB = b[sortConfig.key] || '';
              if (typeof valA === 'string') valA = valA.toLowerCase();
              if (typeof valB === 'string') valB = valB.toLowerCase();
              if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
              if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
              return 0;
          });
      }

      const finalResult = [];
      mains.forEach(m => {
          finalResult.push(m);
          // 부모가 필터를 통과하면 그 서브행은 항상 표시 (서브행의 자체 status와 무관)
          const children = baseOrderedProjects.filter(s => s.isSub && s.parentId === m.id);
          finalResult.push(...children);
      });

      return finalResult;
  }, [baseOrderedProjects, searchTerm, searchActive, activeFilterFactories, activeFilterStatuses, sortConfig, targetMonths]);

  const mainParentHasChildren = useMemo(() => {
      const map = {};
      filteredAndSortedProjects.forEach(p => {
          if (!p.isSub) map[p.id] = false;
          else if (p.parentId) map[p.parentId] = true;
      });
      return map;
  }, [filteredAndSortedProjects]);

  const previewParentHasChildren = useMemo(() => {
      const map = {};
      (stagedExcelData || []).forEach(p => {
          const isSub = String(p.execNo).toLowerCase() === 's' || String(p.execNo).trim().startsWith('-');
          if (!isSub) map[p.id] = false;
          else if (p.parentId) map[p.parentId] = true;
      });
      return map;
  }, [stagedExcelData]);

  const getNumberedData = (dataArray) => {
      let mainCount = 1;
      let subCount = 1;
      return dataArray.map(p => {
          let displayNo = '';
          if (p.isSub) {
              displayNo = `${subCount})`;
              subCount++;
          } else {
              displayNo = mainCount.toString();
              mainCount++;
              subCount = 1;
          }
          return { ...p, displayNo };
      });
  };

  const numberedProjects = useMemo(() => getNumberedData(filteredAndSortedProjects), [filteredAndSortedProjects]);
  const numberedPreviewData = useMemo(() => stagedExcelData ? getNumberedData(stagedExcelData) : [], [stagedExcelData]);

  const visibleProjects = useMemo(() => {
      let activeMainParentId = null;
      return numberedProjects.filter(p => {
          if (!p.isSub) activeMainParentId = p.id;
          if (p.isSub && activeMainParentId && collapsedProjects.has(activeMainParentId)) return false;
          return true;
      });
  }, [numberedProjects, collapsedProjects]);

  const visiblePreviewProjects = useMemo(() => {
      let activePreviewParentId = null;
      return numberedPreviewData.filter(row => {
          const rId = row.id || row.displayNo;
          if (!row.isSub) activePreviewParentId = rId;
          if (row.isSub && activePreviewParentId && collapsedProjects.has(activePreviewParentId)) return false;
          return true;
      });
  }, [numberedPreviewData, collapsedProjects]);

  // ★ 공통 다운로드 함수 (선택한 포맷에 맞게 컬럼 결정 후 다운로드)
  const executeExcelDownload = async (formatToUse, customBase64ForRun = null) => {
      if (!currentTeam || visibleProjects.length === 0) {
          setAlertMessage("다운로드할 데이터가 없습니다.");
          return;
      }
      
      try {
          setIsDbLoading(true);
          addLog("ExcelJS 및 FileSaver 라이브러리 동적 로드 중...");
          const ExcelJS = await loadExcelJS();
          await loadFileSaver();

          addLog(`엑셀 워크북 생성 시작... (포맷: ${formatToUse})`);
          const wb = new ExcelJS.Workbook();

          if (formatToUse === 'custom') {
              const teamPrefs = userPrefs[currentTeam] || {};
              const base64Data = customBase64ForRun || teamPrefs.customTemplateBase64;
              if (!base64Data && !customTemplateFile) {
                  throw new Error("로드할 커스텀 템플릿 파일이 없습니다.");
              }
              const buffer = customTemplateFile ? await customTemplateFile.arrayBuffer() : base64ToBuffer(base64Data);
              await wb.xlsx.load(buffer);
              
              let targetWs = null;
              let startRow = -1;
              let colMap = {}; 

              const keyMap = {
                  no: 'no', execno: 'execNo', estno: 'estNo', project: 'project', 
                  factory: 'factory', manager: 'manager', status: 'progressStatus', 
                  progressstatus: 'progressStatus', progress: 'progress', 
                  startdate: 'startDate', enddate: 'endDate', client: 'client', 
                  content: 'content', point: 'point', accpoints: 'accPoints',
                  prevpoints: 'prevPoints', currpoints: 'currPoints', 
                  totalcommissioningpoints: 'totalCommissioningPoints',
                  plc: 'plc', etos: 'etos', hmi: 'hmi', internaltest: 'internalTest', 
                  integratedtest: 'integratedTest',
                  '번호': 'no', '실행번호': 'execNo', '견적번호': 'estNo', '프로젝트명': 'project', '프로젝트': 'project', '사업명': 'project', '공사명': 'project',
                  '공장구분': 'factory', '공장': 'factory', '사이트': 'factory', '담당자': 'manager', '진행현황': 'progressStatus', '상태': 'progressStatus', '진행상태': 'progressStatus',
                  '공정률': 'progress', '시작일': 'startDate', '착수일': 'startDate', '완료일': 'endDate', '종료일': 'endDate', '납기일': 'endDate', '발주처': 'client',
                  '고객사': 'client', '투자심의': 'investReview', '투심': 'investReview', '자재': 'material', '사급': 'material', '작업범위': 'workScope',
                  '내용': 'content', '상세': 'content', '포인트': 'point', '누적': 'accPoints', '전월': 'prevPoints', '금월': 'currPoints',
                  '총포인트': 'totalCommissioningPoints', '자체시운전': 'internalTest', '통합시운전': 'integratedTest', 'l1': 'l1', 'l2': 'l2'
              };

              // 1. 모든 시트를 순회하며 태그 또는 헤더 찾기 (강력한 폴백 지원)
              for (const ws of wb.worksheets) {
                  let bestImplicitMap = null;
                  let bestImplicitRow = -1;
                  let maxImplicitMatches = 0;

                  ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
                      if (startRow !== -1 && rowNumber >= startRow) return;

                      let tempColMap = {};
                      let explicitCount = 0;
                      let implicitCount = 0;

                      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                          let valStr = '';
                          try {
                              if (cell.value != null) {
                                  if (typeof cell.value === 'object') {
                                      if (Array.isArray(cell.value.richText)) valStr = cell.value.richText.map(r => r.text || '').join('');
                                      else if (cell.value.result !== undefined) valStr = String(cell.value.result);
                                      else if (cell.value.text !== undefined) valStr = String(cell.value.text);
                                      else valStr = JSON.stringify(cell.value);
                                  } else {
                                      valStr = String(cell.value);
                                  }
                              } else if (cell.text) {
                                  valStr = String(cell.text);
                              }
                          } catch (e) {}

                          valStr = valStr.replace(/[\u200B-\u200D\uFEFF\r\n\t]/g, '').trim();
                          if (!valStr) return;

                          // 명시적 태그 검사 e.g., {{project}} or [project] or <project>
                          const tagMatch = valStr.match(/[\{\[\<]\s*([a-zA-Z0-9_가-힣]+)\s*[\}\]\>]/);
                          if (tagMatch && tagMatch[1]) {
                              const tag = tagMatch[1].replace(/\s+/g, '').toLowerCase();
                              tempColMap[colNumber] = keyMap[tag] || tagMatch[1].trim();
                              explicitCount++;
                              return;
                          }

                          // 암시적 헤더 검사
                          const lowerStr = valStr.replace(/\s+/g, '').toLowerCase();
                          for (const [k, v] of Object.entries(keyMap)) {
                              if (lowerStr === k || (k.length >= 2 && lowerStr.includes(k))) {
                                  tempColMap[colNumber] = v;
                                  implicitCount++;
                                  break;
                              }
                          }
                      });

                      if (explicitCount > 0) {
                          startRow = rowNumber;
                          colMap = tempColMap;
                      } else if (implicitCount > maxImplicitMatches) {
                          maxImplicitMatches = implicitCount;
                          bestImplicitMap = tempColMap;
                          bestImplicitRow = rowNumber;
                      }
                  });

                  if (startRow !== -1) {
                      targetWs = ws;
                      break;
                  }

                  if (startRow === -1 && maxImplicitMatches > 0) {
                      startRow = bestImplicitRow + 1;
                      colMap = bestImplicitMap;
                      targetWs = ws;
                      break;
                  }
              }

              // 템플릿에 태그/헤더가 아예 없는 경우: 강제로 첫 시트 마지막 줄 다음부터 채워넣기 (에러 방지)
              if (!targetWs || startRow === -1 || Object.keys(colMap).length === 0) {
                  targetWs = wb.worksheets[0];
                  startRow = (targetWs.lastRow && targetWs.lastRow.number > 0) ? targetWs.lastRow.number + 1 : 2;
                  
                  const defaultCols = orderedColDefs.filter(c => !hiddenColumns.has(c.key));
                  colMap = {};
                  defaultCols.forEach((col, i) => {
                      colMap[i + 1] = col.key;
                      const headerCell = targetWs.getCell(startRow - 1, i + 1);
                      if (!headerCell.value) {
                          headerCell.value = col.label;
                          headerCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
                          headerCell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
                      }
                  });
                  addLog('템플릿 태그를 찾지 못해 기본 열 매핑으로 데이터를 추가합니다.');
              }

              const templateCells = {};
              targetWs.getRow(startRow).eachCell({ includeEmpty: true }, (cell, colNumber) => {
                  templateCells[colNumber] = {
                      style: cell.style,
                      value: cell.value,
                      type: cell.type
                  };
              });

              // 3. 데이터 삽입 실행
              visibleProjects.forEach((p, idx) => {
                  const targetRow = startRow + idx;
                  const row = targetWs.getRow(targetRow);
                  const { avgProgress, accPointsVal, prevPointsVal, currPointsVal } = getCalculatedRowData(p);

                  // 기존 스타일 복사 및 태그가 없는 빈 셀은 원본 값으로 복사
                  Object.keys(templateCells).forEach(colNum => {
                      const tCell = templateCells[colNum];
                      const newCell = row.getCell(Number(colNum));
                      newCell.style = tCell.style;
                      if (!colMap[colNum]) {
                          newCell.value = tCell.value;
                      }
                  });

                  // 태그가 있던 자리에 데이터 매핑
                  Object.keys(colMap).forEach(colNumber => {
                      const key = colMap[colNumber];
                      let val = p[key];
                      
                      if (key === 'no') val = p.displayNo;
                      else if (key === 'progress' || key === 'currProgress') val = `${avgProgress}%`;
                      else if (['plc', 'etos', 'hmi', 'internalTest', 'integratedTest', 'prevProgress'].includes(key)) val = `${p[key] || 0}%`;
                      else if (key === 'accPoints') val = accPointsVal;
                      else if (key === 'prevPoints') val = prevPointsVal;
                      else if (key === 'currPoints') val = currPointsVal;
                      else if (key === 'totalCommissioningPoints') val = safeNumber(p[key]);
                      else if (key === 'execNo' && p.isSub) val = p.execNo !== 's' && p.execNo !== 'S' && p.execNo !== '-' && p.execNo !== '' ? `└ ${p.execNo}` : '└ 하위';
                      else val = safeRender(val);

                      row.getCell(Number(colNumber)).value = val;
                  });
                  row.commit();
              });

              const outBuffer = await wb.xlsx.writeBuffer();
              const blob = new Blob([outBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
              const dateStr = new Date().toISOString().slice(0,10).replace(/-/g, '');
              window.saveAs(blob, `TechTeam_PMS_${currentTeam}_Custom_${dateStr}.xlsx`);
              addLog(`커스텀 템플릿 다운로드 성공 (${visibleProjects.length}건)`);
              return;
          }

          const ws = wb.addWorksheet(`${currentTeam} 업무현황`);

          // ★ 포맷에 따라 출력할 열(Column) 구성
          let exportCols = [];
          if (formatToUse === 'all') {
              exportCols = mainBaseColDefs;
          } else if (formatToUse === 'summary') {
              const summaryKeys = ['no', 'execNo', 'project', 'client', 'progressStatus', 'progress', 'manager', 'startDate', 'endDate'];
              exportCols = mainBaseColDefs.filter(c => summaryKeys.includes(c.key));
          } else if (formatToUse === 'commissioning') {
              const pointKeys = ['no', 'execNo', 'project', 'factory', 'point', 'accPoints', 'prevPoints', 'currPoints', 'progressStatus'];
              exportCols = mainBaseColDefs.filter(c => pointKeys.includes(c.key));
          } else {
              // 'ui' 또는 기타 (기본값: 현재 화면에 표시된 열만)
              exportCols = orderedColDefs.filter(col => !hiddenColumns.has(col.key));
          }
          
          ws.columns = exportCols.map(col => ({
              header: col.label,
              key: col.key,
              width: Math.max(12, (previewColWidths[col.key] || 100) / 7.5) // UI 픽셀 너비를 엑셀 너비로 변환
          }));

          // 헤더 스타일 꾸미기
          ws.getRow(1).eachCell((cell) => {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } }; // 진한 남색
              cell.font = { color: { argb: 'FFFFFFFF' }, bold: true, name: '맑은 고딕' };
              cell.alignment = { vertical: 'middle', horizontal: 'center' };
              cell.border = {
                  top: {style:'thin', color: {argb:'FF334155'}},
                  left: {style:'thin', color: {argb:'FF334155'}},
                  bottom: {style:'thin', color: {argb:'FF334155'}},
                  right: {style:'thin', color: {argb:'FF334155'}}
              };
          });

          // 데이터 삽입 및 스타일 적용
          visibleProjects.forEach((p) => {
              const rowData = {};
              exportCols.forEach(col => {
                  let val = p[col.key];
                  const { avgProgress, accPointsVal, prevPointsVal, currPointsVal } = getCalculatedRowData(p);
                  
                  // 화면에 보이는 텍스트 그대로 엑셀에 들어가도록 변환
                  if (col.key === 'no') val = p.displayNo;
                  else if (col.key === 'progress' || col.key === 'currProgress') val = `${avgProgress}%`;
                  else if (['plc', 'etos', 'hmi', 'internalTest', 'integratedTest', 'prevProgress'].includes(col.key)) val = `${p[col.key] || 0}%`;
                  else if (col.key === 'accPoints') val = accPointsVal;
                  else if (col.key === 'prevPoints') val = prevPointsVal;
                  else if (col.key === 'currPoints') val = currPointsVal;
                  else if (col.key === 'point') val = safeNumber(p.totalCommissioningPoints || p.point); // B-3: 만점=tCP 우선(수정 팝업은 tCP만 갱신 → point가 옛 값일 수 있음)
                  else if (col.key === 'totalCommissioningPoints') val = safeNumber(p[col.key]);
                  else if (col.key === 'execNo' && p.isSub) val = p.execNo !== 's' && p.execNo !== 'S' && p.execNo !== '-' && p.execNo !== '' ? `└ ${p.execNo}` : '└ 하위';
                  else val = safeRender(val);
                  
                  rowData[col.key] = val;
              });
              
              const row = ws.addRow(rowData);

              // 서브 프로젝트는 연한 회색으로 배경 칠하기
              if (p.isSub) {
                  row.eachCell((cell) => {
                      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
                  });
              }

              // 각 셀 테두리 및 정렬
              row.eachCell((cell, colNumber) => {
                  const colDef = exportCols[colNumber - 1];
                  cell.border = {
                      top: {style:'thin', color: {argb:'FFCBD5E1'}},
                      left: {style:'thin', color: {argb:'FFCBD5E1'}},
                      bottom: {style:'thin', color: {argb:'FFCBD5E1'}},
                      right: {style:'thin', color: {argb:'FFCBD5E1'}}
                  };
                  const align = colDef.align || (colDef.key === 'no' ? 'center' : 'left');
                  cell.alignment = { vertical: 'middle', horizontal: align, wrapText: colDef.key === 'content' };
                  cell.font = { name: '맑은 고딕', color: { argb: p.isSub ? 'FF475569' : 'FF0F172A' } };
                  
                  // 진행상태 열은 눈에 띄게 파란색 볼드 처리
                  if (colDef.key === 'progressStatus' && !p.isSub) {
                      cell.font = { bold: true, name: '맑은 고딕', color: { argb: 'FF0284C7' } };
                  }
              });
          });

          // 파일 다운로드 트리거
          const buffer = await wb.xlsx.writeBuffer();
          const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
          const dateStr = new Date().toISOString().slice(0,10).replace(/-/g, '');
          window.saveAs(blob, `TechTeam_PMS_${currentTeam}_${dateStr}.xlsx`);
          
          addLog(`엑셀 다운로드 성공 (포맷: ${formatToUse}, ${visibleProjects.length}건)`);
          
      } catch (error) {
          console.error("엑셀 다운로드 실패:", error);
          addLog(`[위험] 엑셀 다운로드 실패: ${error.message}`);
          setAlertMessage(`엑셀 파일 생성 중 오류가 발생했습니다.\n${error.message}`);
      } finally {
          setIsDbLoading(false);
      }
  };

  // ★ 월간보고서 Excel 생성
  const executeMonthlyReport = async () => {
      if (!currentTeam) return;
      setIsDbLoading(true);
      try {
          const ExcelJS = await loadExcelJS();
          const wb = new ExcelJS.Workbook();
          wb.creator = 'TechTeam PMS';

          const STATUS_GROUPS = [
              { status: '진행',     label: '■  진행',     bg: 'FFD6EAF8', hdr: 'FF1A4F72', row: 'FFF0F7FF' },
              { status: '금월완료', label: '■  금월완료', bg: 'FFD5F5E3', hdr: 'FF1B6B4A', row: 'FFF0FBF5' },
              { status: '신규',     label: '■  신규',     bg: 'FFDCE3FC', hdr: 'FF1B3FA0', row: 'FFF4F6FF' },
              { status: '미작업',   label: '■  미작업',   bg: 'FFE8E8E8', hdr: 'FF444444', row: 'FFFAFAFA' },
              { status: '예상',     label: '■  예상',     bg: 'FFFDEBD0', hdr: 'FF7D4B12', row: 'FFFDF6EC' },
          ];

          const [yyyy, mm] = (baseDate || new Date().toISOString().slice(0,7)).split('-');
          const selfEnabled = (teamSettings[currentTeam]?.progressItems || DEFAULT_PROGRESS_ITEMS).internalTest !== false;
          // selfEnabled: 자체시운전(3) + 통합시운전(3) = 6 시운전 컬럼 → 총 15열
          // !selfEnabled: 통합시운전(3)만                = 3 시운전 컬럼 → 총 12열
          const TOTAL_COLS = selfEnabled ? 15 : 12;
          // 컬럼 인덱스 (1-based)
          const C_SELF_START = 7;                              // 자체시운전 시작 (selfEnabled 시)
          const C_INT_START  = selfEnabled ? 10 : 7;          // 통합시운전 시작
          const C_PCT_START  = selfEnabled ? 13 : 10;         // 공정률 시작
          const C_DATE       = TOTAL_COLS;                     // 시작일

          // ── 프로젝트 데이터 ──────────────────────────────────────────────
          const allRows = baseOrderedProjects.filter(p => !p.isSub);

          const ws = wb.addWorksheet('월간보고서', { views: [{ state: 'frozen', ySplit: 5 }] });

          // ── 열 너비 설정 ─────────────────────────────────────────────────
          const baseCols = [
              { width: 5  },  // No.
              { width: 12 },  // 실행번호
              { width: 10 },  // 진행현황
              { width: 12 },  // 공장구분
              { width: 40 },  // 프로젝트명
              { width: 8  },  // Point
          ];
          const selfCols = selfEnabled ? [
              { width: 10 }, { width: 10 }, { width: 10 }, // 자체시운전 누적/전월/금월
          ] : [];
          const intCols = [
              { width: 10 }, { width: 10 }, { width: 10 }, // 통합시운전 누적/전월/금월
          ];
          ws.columns = [...baseCols, ...selfCols, ...intCols,
              { width: 9 }, { width: 9 },  // 공정률 전월/금월
              { width: 11 },               // 시작일
          ];

          // ── 공통 스타일 헬퍼 ─────────────────────────────────────────────
          const borderThin = (argb = 'FFB0BEC5') => ({ style: 'thin', color: { argb } });
          const cellBorder = { top: borderThin(), left: borderThin(), bottom: borderThin(), right: borderThin() };
          const boldBorder  = { top: borderThin('FF4E6880'), left: borderThin('FF4E6880'), bottom: borderThin('FF4E6880'), right: borderThin('FF4E6880') };

          const applyStyle = (cell, { fill, font, align = 'center', border = cellBorder, numFmt } = {}) => {
              if (fill)   cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
              if (font)   cell.font   = { name: '맑은 고딕', size: 10, ...font };
              if (border) cell.border = border;
              if (numFmt) cell.numFmt = numFmt;
              cell.alignment = { vertical: 'middle', horizontal: align, wrapText: false };
          };

          // ── 행1: 제목 ────────────────────────────────────────────────────
          const titleRow = ws.addRow([`${currentTeam} 월간 업무 현황 보고서`]);
          ws.mergeCells(1, 1, 1, TOTAL_COLS);
          applyStyle(titleRow.getCell(1), {
              fill: 'FF1E3A5F', font: { bold: true, size: 14, color: { argb: 'FFFFFFFF' } },
              align: 'center', border: boldBorder,
          });
          titleRow.height = 28;

          // ── 행2: 기준월 + 작성일 ────────────────────────────────────────
          const subRow = ws.addRow([`기준월: ${yyyy}년 ${mm}월    /    작성일: ${new Date().toLocaleDateString('ko-KR')}`]);
          ws.mergeCells(2, 1, 2, TOTAL_COLS);
          applyStyle(subRow.getCell(1), {
              fill: 'FF2E5F8A', font: { size: 10, color: { argb: 'FFCCE0F5' } },
              align: 'left', border: boldBorder,
          });
          subRow.height = 18;

          // ── 행3 & 행4: 헤더 ─────────────────────────────────────────────
          const grpRowData = ['No.', '실행번호', '진행현황', '공장구분', '프로젝트명', 'Point'];
          if (selfEnabled) grpRowData.push('자체시운전', '', '');
          grpRowData.push('통합시운전', '', '', '공정률(%)', '', '시작일');
          const subHdrData = ['', '', '', '', '', ''];
          if (selfEnabled) subHdrData.push('누적', '전월', '금월');
          subHdrData.push('누적', '전월', '금월', '전월', '금월', '');

          const grpRow = ws.addRow(grpRowData);
          const subHdrRow = ws.addRow(subHdrData);

          grpRow.height = 18;
          grpRow.eachCell({ includeEmpty: true }, (cell) => {
              applyStyle(cell, { fill: 'FFD4DDE8', font: { bold: true, color: { argb: 'FF1A1A1A' } }, border: boldBorder });
          });
          subHdrRow.height = 18;
          subHdrRow.eachCell({ includeEmpty: true }, (cell) => {
              applyStyle(cell, { fill: 'FFE4EDF5', font: { bold: true, size: 9, color: { argb: 'FF1A1A1A' } }, border: boldBorder });
          });

          // 세로 합병 (No~Point, 시작일)
          [1, 2, 3, 4, 5, 6, C_DATE].forEach(c => ws.mergeCells(3, c, 4, c));
          if (selfEnabled) ws.mergeCells(3, C_SELF_START, 3, C_SELF_START + 2); // 자체시운전
          ws.mergeCells(3, C_INT_START, 3, C_INT_START + 2);                    // 통합시운전
          ws.mergeCells(3, C_PCT_START, 3, C_PCT_START + 1);                    // 공정률(%)

          // ── 행5~: 데이터 ─────────────────────────────────────────────────
          let globalNo = 1;
          let grandSelfAcc = 0, grandSelfPrev = 0, grandSelfCurr = 0;
          let grandIntAcc  = 0, grandIntPrev  = 0, grandIntCurr  = 0;

          for (const grp of STATUS_GROUPS) {
              const projects = allRows.filter(p => {
                  const s = (getEffectiveStatus(p) || p.status || '').trim();
                  return s === grp.status;
              });
              if (projects.length === 0) continue;

              // 섹션 헤더 행
              const secRow = ws.addRow([grp.label, ...Array(TOTAL_COLS - 1).fill('')]);
              ws.mergeCells(secRow.number, 1, secRow.number, TOTAL_COLS);
              applyStyle(secRow.getCell(1), {
                  fill: grp.bg,
                  font: { bold: true, size: 10, color: { argb: grp.hdr } },
                  align: 'left', border: boldBorder,
              });
              secRow.height = 17;

              let secSelfAcc = 0, secSelfPrev = 0, secSelfCurr = 0;
              let secIntAcc  = 0, secIntPrev  = 0, secIntCurr  = 0;

              projects.forEach(p => {
                  const { avgProgress, prevAvgProgress } = getCalculatedRowData(p);
                  const cs = getPointsTriple(p); // 통일 계산기 (화면 표와 동일 숫자)
                  secSelfAcc  += cs.acc.self;  secSelfPrev += cs.prev.self; secSelfCurr += cs.curr.self;
                  secIntAcc   += cs.acc.int;   secIntPrev  += cs.prev.int;  secIntCurr  += cs.curr.int;

                  const rowData = [
                      globalNo++,
                      p.execNo || '',
                      getEffectiveStatus(p) || p.status || '',
                      p.factory || '',
                      p.project || '',
                      p.totalCommissioningPoints || p.point || '',
                  ];
                  if (selfEnabled) rowData.push(cs.acc.self || '', cs.prev.self || '', cs.curr.self || '');
                  rowData.push(
                      cs.acc.int  || '', cs.prev.int  || '', cs.curr.int  || '',
                      prevAvgProgress ? `${prevAvgProgress}%` : '',
                      `${avgProgress}%`,
                      p.startDate || '',
                  );

                  const dataRow = ws.addRow(rowData);
                  dataRow.height = 16;
                  dataRow.eachCell((cell, ci) => {
                      applyStyle(cell, {
                          fill: grp.row,
                          font: { size: 10, color: { argb: 'FF1A1A1A' } },
                          align: (ci <= 3) ? 'center' : (ci === 4 || ci === 5) ? 'left' : ci === C_DATE ? 'center' : 'right',
                          border: cellBorder,
                      });
                  });
                  dataRow.getCell(2).font = { name: '맑은 고딕', size: 10, bold: true, color: { argb: 'FF1E4E8C' } };
              });

              grandSelfAcc += secSelfAcc; grandSelfPrev += secSelfPrev; grandSelfCurr += secSelfCurr;
              grandIntAcc  += secIntAcc;  grandIntPrev  += secIntPrev;  grandIntCurr  += secIntCurr;

              // 소계 행
              const subData = ['', `소계 (${projects.length}건)`, '', '', '', ''];
              if (selfEnabled) subData.push(secSelfAcc || '', secSelfPrev || '', secSelfCurr || '');
              subData.push(secIntAcc || '', secIntPrev || '', secIntCurr || '', '', '', '');
              const subTotalRow = ws.addRow(subData);
              ws.mergeCells(subTotalRow.number, 2, subTotalRow.number, 6);
              subTotalRow.height = 16;
              subTotalRow.eachCell((cell, ci) => {
                  applyStyle(cell, {
                      fill: grp.bg,
                      font: { bold: true, size: 10, color: { argb: grp.hdr } },
                      align: ci >= 7 ? 'right' : 'center',
                      border: boldBorder,
                  });
              });
          }

          // ── 합계 행 ─────────────────────────────────────────────────────
          const totalData = ['', '합  계', '', '', '', ''];
          if (selfEnabled) totalData.push(grandSelfAcc || '', grandSelfPrev || '', grandSelfCurr || '');
          totalData.push(grandIntAcc || '', grandIntPrev || '', grandIntCurr || '', '', '', '');
          const totalRow = ws.addRow(totalData);
          ws.mergeCells(totalRow.number, 2, totalRow.number, 6);
          totalRow.height = 20;
          totalRow.eachCell((cell, ci) => {
              applyStyle(cell, {
                  fill: 'FF1E3A5F',
                  font: { bold: true, size: 11, color: { argb: 'FFFFFFFF' } },
                  align: ci >= 7 ? 'right' : 'center',
                  border: boldBorder,
              });
          });

          // ── 파일 저장 ────────────────────────────────────────────────────
          const dateStr = `${yyyy}${mm}`;
          const buf = await wb.xlsx.writeBuffer();
          const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${currentTeam}_월간보고서_${dateStr}.xlsx`;
          a.click();
          URL.revokeObjectURL(url);
          addLog(`월간보고서 다운로드 완료 (${yyyy}년 ${mm}월)`);
      } catch (err) {
          console.error('월간보고서 생성 실패:', err);
          setAlertMessage(`월간보고서 생성 중 오류가 발생했습니다.\n${err.message}`);
      } finally {
          setIsDbLoading(false);
      }
  };

  // ★ 엑셀 다운로드 메인 버튼 클릭 (저장된 설정이 있으면 바로 다운로드)
  const handleExcelDownloadClick = () => {
      const teamPrefs = userPrefs[currentTeam] || {};
      if (teamPrefs.excelFormat) {
          addLog(`[${currentTeam}] 저장된 기본 포맷(${teamPrefs.excelFormat})으로 바로 엑셀을 다운로드합니다.`);
          executeExcelDownload(teamPrefs.excelFormat);
      } else {
          openExcelFormatModal();
      }
  };

  // ★ 엑셀 포맷 설정 모달 열기
  const openExcelFormatModal = () => {
      const teamPrefs = userPrefs[currentTeam] || {};
      setTempExcelFormat(teamPrefs.excelFormat || 'ui');
      setTempSaveDefault(!!teamPrefs.excelFormat);
      setIsExcelFormatModalOpen(true);
  };

  // ★ 엑셀 포맷 설정 모달 적용 (DB 저장 및 다운로드)
  const handleFormatModalSubmit = async () => {
      if (!user || !db) return;

      const teamPrefs = userPrefs[currentTeam] || {};

      // ★ 유효성 검사: 커스텀 템플릿인데 파일이 없는 경우 경고창 띄우고 중단
      if (tempExcelFormat === 'custom' && !customTemplateFile && !teamPrefs.customTemplateBase64) {
          setAlertMessage("적용할 엑셀 템플릿 파일(.xlsx)을 먼저 선택해주세요.");
          return; 
      }

      setIsExcelFormatModalOpen(false);

      let customBase64 = teamPrefs.customTemplateBase64;
      if (tempExcelFormat === 'custom' && customTemplateFile) {
          customBase64 = await fileToBase64(customTemplateFile);
      }

      if (tempSaveDefault) {
          // 사용자 기본 설정 저장 (팀별 독립적 저장)
          const prefsRef = doc(collection(db, 'artifacts', appId, 'users', user.uid, 'preferences'), 'config');
          const payload = { excelFormat: tempExcelFormat };
          if (tempExcelFormat === 'custom' && customBase64) payload.customTemplateBase64 = customBase64;
          
          await setDoc(prefsRef, { [currentTeam]: payload }, { merge: true });
          setUserPrefs(prev => ({ ...prev, [currentTeam]: payload }));
          addLog(`[${currentTeam}] 엑셀 기본 포맷이 [${tempExcelFormat}]으로 클라우드에 영구 저장되었습니다.`);
      } else {
          // 체크 해제 시 설정 삭제 (다음에 또 묻게 됨)
          const prefsRef = doc(collection(db, 'artifacts', appId, 'users', user.uid, 'preferences'), 'config');
          await setDoc(prefsRef, { [currentTeam]: { excelFormat: null, customTemplateBase64: null } }, { merge: true });
          setUserPrefs(prev => ({ ...prev, [currentTeam]: { excelFormat: null, customTemplateBase64: null } }));
          addLog(`[${currentTeam}] 엑셀 기본 포맷 설정이 해제되었습니다.`);
      }

      // 선택한 포맷으로 다운로드 실행
      executeExcelDownload(tempExcelFormat, customBase64);
  };

  useEffect(() => {
      const avg = Math.round((safeNumber(formData.plc) + safeNumber(formData.etos) + safeNumber(formData.hmi) + safeNumber(formData.internalTest) + safeNumber(formData.integratedTest)) / 5);
      setFormData(prev => ({ ...prev, progress: avg }));
  }, [formData.plc, formData.etos, formData.hmi, formData.internalTest, formData.integratedTest]);

  const handleInputChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });
  const handleStatusChange = (newStatus) => setFormData({ ...formData, status: newStatus });
  const openSpecificSettings = (tab) => { setSettingsTab(tab); setIsSettingsOpen(true); };
  const requestSort = (key) => {
      let direction = 'asc';
      if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
      setSortConfig({ key, direction });
  };
  
  const resetFilters = () => {
      if (!currentTeam || !teamSettings[currentTeam]) return;
      const defaults = teamSettings[currentTeam];
      const savedStatuses = defaults.defaultActiveStatuses || [];
      // 저장된 기본값이 없으면 count>0 인 '진행'/'진행중' 우선 선택
      let initStatuses;
      if (savedStatuses.length > 0) {
          initStatuses = savedStatuses;
      } else {
          const withData = statusSummaryItems.filter(s => s.count > 0);
          const prog = withData.find(s => s.label === '진행중' || s.label === '진행');
          const fallback = (prog || withData[0])?.label || null;
          initStatuses = fallback ? [fallback] : [];
      }
      setActiveFilterFactories(new Set(defaults.defaultActiveFactories || []));
      setActiveFilterStatuses(new Set(initStatuses));
      setSearchTerm('');
      setSearchActive(false);
      addLog('메인 화면 필터가 초기화되었습니다. (전체 보기 상태 변경 완료)');
  };

  const isFilterModified = useMemo(() => {
      if (searchActive || searchTerm !== '') return true;
      if (!currentTeam || !teamSettings[currentTeam]) return false;
      
      const defaults = teamSettings[currentTeam];
      const defaultStatuses = new Set(defaults.defaultActiveStatuses || []);
      const defaultFactories = new Set(defaults.defaultActiveFactories || []);

      if (activeFilterStatuses.size !== defaultStatuses.size) return true;
      if (activeFilterFactories.size !== defaultFactories.size) return true;

      for (let s of activeFilterStatuses) if (!defaultStatuses.has(s)) return true;
      for (let f of activeFilterFactories) if (!defaultFactories.has(f)) return true;

      return false;
  }, [activeFilterStatuses, activeFilterFactories, searchTerm, currentTeam, teamSettings]);

  const getStatusStyle = (statusLabel) => {
      const found = statusSummaryItems.find(s => s && s.label === statusLabel);
      if (found) return found;
      return currentStatusOptions.length > 0 ? currentStatusOptions[0] : { color: 'bg-slate-500', textColor: 'text-slate-400', borderColor: 'border-slate-500/20' };
  };

  const addMonthlyPoint = () => {
      setFormData(prev => {
          const existing = prev.monthlyPoints || [];
          let nextDate = baseDate;
          
          if (existing.length > 0) {
              const latest = existing.reduce((max, p) => p.date > max ? p.date : max, "0000-00");
              if (latest !== "0000-00") {
                  const [y, m] = latest.split('-').map(Number);
                  const nextD = new Date(y, m, 1); 
                  nextDate = `${nextD.getFullYear()}-${String(nextD.getMonth() + 1).padStart(2, '0')}`;
              }
          }
          
          const newPoints = [...existing, { date: nextDate, value: 0 }];
          newPoints.sort((a,b) => b.date.localeCompare(a.date));
          return { ...prev, monthlyPoints: newPoints };
      });
  };
  
  const updateMonthlyPoint = (index, field, value) => {
      setFormData(prev => {
          const updated = [...(prev.monthlyPoints || [])];
          // 값은 정수, 누적 ≤ Point 조건
          if (field === 'value') {
              const intVal = Math.round(Math.max(0, safeNumber(value)));
              const maxPoint = safeNumber(prev.totalCommissioningPoints || prev.point || 0);
              const otherSum = updated.reduce((s, m, i) => i !== index ? s + safeNumber(m.value) : s, 0);
              const allowed  = maxPoint > 0 ? Math.max(0, maxPoint - otherSum) : intVal;
              updated[index][field] = Math.min(intVal, allowed);
          } else {
              updated[index][field] = value;
          }
          if (field === 'date') updated.sort((a,b) => b.date.localeCompare(a.date));
          return { ...prev, monthlyPoints: updated };
      });
  };
  
  const deleteMonthlyPoint = (index) => {
      setFormData(prev => ({ ...prev, monthlyPoints: (prev.monthlyPoints || []).filter((_, i) => i !== index) }));
  };

  const sanitizePayload = (payload) => {
      const data = { ...payload };
      delete data.isUnsaved;
      delete data.displayNo;
      delete data.isSub;
      delete data.parentId;
      delete data.accPoints; 
      delete data.prevPoints; 
      delete data.currPoints;
      delete data.prevProgress; 
      delete data.currProgress;
      Object.keys(data).forEach(key => { if (data[key] === undefined) delete data[key]; });
      return data;
  };

  // ★ 월간보고: 인라인 에디팅 저장 핸들러
  const handleInlineSave = async (projectId, field, newValue) => {
      setEditingInline(null);
      
      let parsedValue = newValue;
      if (['plc', 'etos', 'hmi', 'internalTest', 'integratedTest', 'point'].includes(field)) {
          parsedValue = safeNumber(newValue);
          if (field !== 'point') {
              parsedValue = Math.min(Math.max(parsedValue, 0), 100);
          }
      }
      if (['accPoints', 'currPoints', 'prevPoints'].includes(field)) {
          parsedValue = Math.round(Math.max(0, safeNumber(newValue)));
      }
      if (field === 'point') {
          parsedValue = Math.round(Math.max(0, safeNumber(newValue)));
      }

      let updateData = { [field]: parsedValue };
      if (field === 'point') updateData = { point: parsedValue, totalCommissioningPoints: parsedValue };

      const targetProject = localUnsavedProjects.find(p => p.id === projectId)
          || allProjects.find(p => p.id === projectId);
      const MONTHLY_FIELDS = ['plc','etos','hmi','internalTest','integratedTest','progressStatus','currPoints','prevPoints'];
      if (MONTHLY_FIELDS.includes(field) && targetProject) {
          const monthDate = field === 'prevPoints' ? targetMonths.prevMonthStr : targetMonths.currMonthStr;
          const dataKey   = field === 'prevPoints' ? 'currPoints' : field;
          const baseMd = pendingEdits[String(projectId)]?.monthlyData || targetProject.monthlyData || [];
          const existing  = baseMd.find(m => m.date === monthDate);

          // 누적 ≤ Point 조건: currPoints/prevPoints 입력 시 초과하면 허용 한도로 자동 조정
          if (dataKey === 'currPoints') {
              const maxPoint = safeNumber(
                  (pendingEdits[String(projectId)]?.totalCommissioningPoints)
                  ?? targetProject.totalCommissioningPoints
                  ?? targetProject.point
              );
              if (maxPoint > 0) {
                  const otherSum = baseMd
                      .filter(m => m.date !== monthDate)
                      .reduce((s, m) => s + safeNumber(m.currPoints), 0);
                  const allowed = Math.max(0, maxPoint - otherSum);
                  parsedValue = Math.min(parsedValue, allowed);
              }
          }

          // 이월 규칙(A안): 새 달 기록을 처음 만들 때, 이전 달 기록을 이어받은 뒤 입력값 반영
          // 단, 실적(currPoints/intPoints)은 이월하지 않음 — 미정의로 두면 통일 계산기가 장부B로 폴백
          let seed = {};
          if (!existing) {
              const earlier = baseMd.filter(m => m.date < monthDate);
              if (earlier.length > 0) {
                  const { currPoints: _cp, intPoints: _ip, ...rest } = earlier.reduce((a, b) => (a.date > b.date ? a : b));
                  seed = rest;
              }
          }
          const updatedMd = existing
              ? baseMd.map(m => m.date === monthDate ? { ...m, [dataKey]: parsedValue } : m)
              : [...baseMd, { ...seed, date: monthDate, [dataKey]: parsedValue }];
          // monthlyData만 저장 — flat 필드를 업데이트하면 다른 달 폴백 시 오염됨
          updateData = { monthlyData: updatedMd };
      }

      const unsavedIndex = localUnsavedProjects.findIndex(p => p.id === projectId);
      if (unsavedIndex !== -1) {
          const updated = [...localUnsavedProjects];
          updated[unsavedIndex] = { ...updated[unsavedIndex], ...updateData };
          setLocalUnsavedProjects(updated);
          addLog(`[인라인 임시수정] ${projectId}의 ${field} 변경됨`);
          return;
      }

      // 임시 편집 저장 — 저장 버튼을 눌러야 DB에 반영됨
      setPendingEdits(prev => ({
          ...prev,
          [String(projectId)]: { ...(prev[String(projectId)] || {}), ...updateData }
      }));
  };

  const executeRowSave = async () => {
      const projectId = confirmRowSaveId;
      setConfirmRowSaveId(null);
      if (!projectId) return;
      const base = localUnsavedProjects.find(p => p.id === projectId)
          || allProjects.find(p => p.id === projectId);
      if (!base) { setAlertMessage('저장 대상 데이터를 찾을 수 없습니다.'); return; }
      const project = { ...base, ...(pendingEdits[String(projectId)] || {}) };
      if (!db || !user) { setAlertMessage('파이어베이스가 연결되지 않았습니다.'); return; }
      try {
          const safeData = sanitizePayload({ ...project, id: String(projectId), team: currentTeam });
          await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'projects', String(projectId)), safeData);
          if (localUnsavedProjects.find(p => p.id === projectId)) {
              setLocalUnsavedProjects(prev => prev.filter(p => p.id !== projectId));
          }
          setPendingEdits(prev => { const next = { ...prev }; delete next[String(projectId)]; return next; });
          addLog(`[행 저장] ${projectId} DB 저장 완료`);
      } catch (error) {
          console.error('행 저장 실패', error);
          setAlertMessage(`저장 중 오류: ${error.message}`);
      }
  };

  const handleSubmit = async (e) => {
      e.preventDefault();
      if (!db || !user) {
        setAlertMessage("파이어베이스가 연결되지 않았습니다.");
        return;
      }
      const projectId = editingProject ? String(editingProject.id) : `project_${Date.now()}`;

      // 현재 기준월 항목을 monthlyData에 반영
      const existingMd = editingProject?.monthlyData || [];
      const monthDate  = targetMonths.currMonthStr;
      const existing   = existingMd.find(m => m.date === monthDate);
      const newEntry   = {
          date: monthDate,
          progressStatus: formData.progressStatus || '',
          plc: safeNumber(formData.plc), etos: safeNumber(formData.etos),
          hmi: safeNumber(formData.hmi), internalTest: safeNumber(formData.internalTest),
          integratedTest: safeNumber(formData.integratedTest),
          ...(existing?.currPoints !== undefined ? { currPoints: existing.currPoints } : {}),
      };
      const updatedMd = existing
          ? existingMd.map(m => m.date === monthDate ? { ...m, ...newEntry } : m)
          : [...existingMd, newEntry];

      // 월별 실적 리스트(팝업 키인)를 장부A(monthlyData.currPoints)에 직접 반영 — 2026-06-11 일원화
      const updatedMd2 = [...updatedMd];
      (formData.monthlyPoints || []).forEach(mp => {
          if (!mp?.date) return;
          const v = Math.round(Math.max(0, safeNumber(mp.value)));
          const i = updatedMd2.findIndex(m => m.date === mp.date);
          if (i >= 0) updatedMd2[i] = { ...updatedMd2[i], currPoints: v };
          else updatedMd2.push({ date: mp.date, currPoints: v });
      });

      const formDataClean = { ...formData };
      // 만점 동기화: 수정 팝업 TOTAL POINTS(totalCommissioningPoints)를 point에도 반영.
      // (안 하면 표 POINT 열이 옛 point를 읽어 변경이 안 보임 — 인라인 POINT 편집과 동일 처리)
      if (formDataClean.totalCommissioningPoints !== undefined && formDataClean.totalCommissioningPoints !== '') {
          const tcp = safeNumber(formDataClean.totalCommissioningPoints);
          formDataClean.totalCommissioningPoints = tcp;
          formDataClean.point = tcp;
      }
      // #7 프로젝트별 항목 on/off: progressItems를 프로젝트에 함께 저장 (이전엔 delete로 제외했음)
      const payload = { ...formDataClean, id: projectId, team: currentTeam, monthlyData: updatedMd2 };
      if (!payload.pid) payload.pid = generatePid(); // A-4a: 고유 ID 자동 발급 (불변)

      if (localUnsavedProjects.find(p => p.id === projectId)) {
          setLocalUnsavedProjects(prev => prev.map(p => p.id === projectId ? { ...payload, isUnsaved: true } : p));
          setIsModalOpen(false);
          return;
      }

      try {
          const safeData = sanitizePayload(payload);
          await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'projects', projectId), safeData);
          setIsModalOpen(false);
      } catch (error) {
          console.error("저장 실패", error);
          setAlertMessage(`저장 중 오류: ${error.message}`);
      }
  };

  const executeDeleteProject = async () => {
      if (localUnsavedProjects.find(p => p.id === confirmDeleteId)) {
          setLocalUnsavedProjects(prev => prev.filter(p => p.id !== confirmDeleteId));
          setConfirmDeleteId(null);
          return;
      }

      if (!db || !user || !confirmDeleteId) return;
      try {
          // A-4a: 삭제 도장(soft delete) — 문서를 지우지 않고 상태='삭제' 표시 (기준문서 A3 §5)
          // 데이터·이력 보존, 상태 필터에서 '삭제'를 켜면 다시 볼 수 있음
          const target = allProjects.find(p => String(p.id) === String(confirmDeleteId));
          const baseMd = target?.monthlyData || [];
          const monthStr = targetMonths.currMonthStr;
          const idx = baseMd.findIndex(m => m.date === monthStr);
          const updatedMd = idx >= 0
              ? baseMd.map(m => m.date === monthStr ? { ...m, progressStatus: '삭제' } : m)
              : [...baseMd, { date: monthStr, progressStatus: '삭제' }];
          await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'projects', String(confirmDeleteId)), {
              progressStatus: '삭제',
              monthlyData: updatedMd,
              _deletedAt: new Date().toISOString(),
              _deletedBy: user?.email || user?.uid || '',
          }, { merge: true });
          addLog(`[삭제 도장] ${confirmDeleteId} 상태='삭제' 표시 (데이터 보존)`);
          setConfirmDeleteId(null);
      } catch (error) {
          console.error("삭제 실패", error);
          setAlertMessage(`삭제 중 오류: ${error.message}`);
      }
  };

  const executeDeleteAllTeamProjects = async () => {
      if (!db || !user || !currentTeam) return;
      setIsDbLoading(true);
      try {
          const batch = writeBatch(db);
          let count = 0;
          let deletedCount = 0;
          const projectsToDelete = allProjects.filter(p => p.team === currentTeam);
          for (const p of projectsToDelete) {
              batch.delete(doc(db, 'artifacts', appId, 'public', 'data', 'projects', p.id));
              count++;
              deletedCount++;
              if (count >= 400) {
                  await batch.commit();
                  count = 0;
              }
          }
          if (count > 0) await batch.commit();

          setLocalUnsavedProjects(prev => prev.filter(p => p.team !== currentTeam));
          setAlertMessage(`${currentTeam}의 모든 데이터(${deletedCount}건)가 삭제되었습니다.`);
          setIsDeleteAllModalOpen(false);
      } catch (error) {
          console.error("전체 삭제 실패", error);
          setAlertMessage(`전체 삭제 중 오류: ${error.message}`);
      } finally {
          setIsDbLoading(false);
      }
  };

  // ── A-4a-0: 데이터 백업 (JSON 다운로드) — 마이그레이션 전 안전장치 ──
  // 세 장부(projects 전체 / List·메타 / 주간기록) + 팀 설정을 한 파일로 저장
  const handleBackupData = async () => {
      if (!db || !user || !currentTeam) { setAlertMessage('로그인과 팀 선택 후 사용할 수 있습니다.'); return; }
      setIsDbLoading(true);
      try {
          const backup = { savedAt: new Date().toISOString(), team: currentTeam, appVersion: 'v6.9.x' };
          const base = ['artifacts', appId, 'public', 'data'];
          const projSnap = await getDocs(collection(db, ...base, 'projects'));
          backup.projects = projSnap.docs.map(d => ({ _docId: d.id, ...d.data() }));
          const listSnap = await getDocs(collection(db, ...base, `projectListRows_${currentTeam}`));
          backup.projectListRows = listSnap.docs.map(d => ({ _docId: d.id, ...d.data() }));
          const metaSnap = await getDoc(doc(db, ...base, 'projectListMeta', currentTeam));
          backup.projectListMeta = metaSnap.exists() ? metaSnap.data() : null;
          const recSnap = await getDocs(collection(db, ...base, `progressRecords_${currentTeam}`));
          backup.progressRecords = recSnap.docs.map(d => ({ _docId: d.id, ...d.data() }));
          const setSnap = await getDoc(doc(db, ...base, 'settings', 'teamSettings'));
          backup.teamSettings = setSnap.exists() ? setSnap.data() : null;

          const counts = `projects ${backup.projects.length}건 / List ${backup.projectListRows.length}건 / 주간기록 ${backup.progressRecords.length}건`;
          const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          const ts = new Date();
          const pad = n => String(n).padStart(2, '0');
          a.href = url;
          a.download = `PMS백업_${currentTeam}_${ts.getFullYear()}${pad(ts.getMonth()+1)}${pad(ts.getDate())}_${pad(ts.getHours())}${pad(ts.getMinutes())}.json`;
          a.click();
          URL.revokeObjectURL(url);
          addLog(`[백업] 다운로드 완료 — ${counts}`);
          setAlertMessage(`백업 파일 다운로드 완료!\n${counts}\n\n다운로드 폴더의 JSON 파일을 안전한 곳에 보관하세요.`);
      } catch (e) {
          console.error('백업 실패', e);
          setAlertMessage(`백업 중 오류: ${e.message}`);
      } finally { setIsDbLoading(false); }
  };

  // ── A-4a: 기존 데이터 고유 ID(pid) 일괄 발급 — 미리보기(스캔) → 확인 → 실행 ──
  const openPidMigration = async () => {
      if (!db || !user || !currentTeam) { setAlertMessage('로그인과 팀 선택 후 사용할 수 있습니다.'); return; }
      setPidMigModal({ stage: 'scan' });
      try {
          const base = ['artifacts', appId, 'public', 'data'];
          const projSnap = await getDocs(collection(db, ...base, 'projects'));
          // 현재 팀 것만 (다른 팀 데이터는 그 팀 확대 시 처리)
          const projTargets = projSnap.docs
              .filter(d => { const p = d.data(); return p.team === currentTeam && !p.pid; })
              .map(d => d.id);
          const projTeamTotal = projSnap.docs.filter(d => d.data().team === currentTeam).length;
          const listSnap = await getDocs(collection(db, ...base, `projectListRows_${currentTeam}`));
          const listTargets = listSnap.docs.filter(d => !d.data()._pid).map(d => d.id);
          setPidMigModal({ stage: 'ready', projTargets, listTargets, projTeamTotal, listTotal: listSnap.size });
      } catch (e) { setPidMigModal(null); setAlertMessage('스캔 오류: ' + e.message); }
  };

  const runPidMigration = async () => {
      const m = pidMigModal;
      if (!m || m.stage !== 'ready') return;
      setPidMigModal({ stage: 'running' });
      try {
          const base = ['artifacts', appId, 'public', 'data'];
          let batch = writeBatch(db), cnt = 0;
          for (const id of m.projTargets) {
              batch.set(doc(db, ...base, 'projects', id), { pid: generatePid() }, { merge: true });
              if (++cnt >= 400) { await batch.commit(); batch = writeBatch(db); cnt = 0; }
          }
          for (const id of m.listTargets) {
              batch.set(doc(db, ...base, `projectListRows_${currentTeam}`, id), { _pid: generatePid() }, { merge: true });
              if (++cnt >= 400) { await batch.commit(); batch = writeBatch(db); cnt = 0; }
          }
          if (cnt > 0) await batch.commit();
          addLog(`[pid 일괄발급] 월간보고 ${m.projTargets.length}건 + List ${m.listTargets.length}건 발급 완료`);
          setPidMigModal({ stage: 'done', projN: m.projTargets.length, listN: m.listTargets.length });
      } catch (e) { setPidMigModal(null); setAlertMessage('발급 중 오류: ' + e.message); }
  };

  // ── A-4b: 주간장부(progressRecords) pid 통일 병합 — 스캔(드라이런) → 확인 → 실행 ──
  // 옛 키(실행번호·행ID) 장부를 pid 장부로 병합. 충돌(같은 주차에 다른 값)은 자동 병합하지 않고 보류.
  const sumWeeklyAll = (weekly) => {
      let s = 0;
      Object.values(weekly || {}).forEach(cat => {
          if (cat && typeof cat === 'object') Object.values(cat).forEach(v => { s += Number(v) || 0; });
      });
      return Math.round(s * 100) / 100;
  };

  const openWkMigration = async () => {
      if (!db || !user || !currentTeam) { setAlertMessage('로그인과 팀 선택 후 사용할 수 있습니다.'); return; }
      setWkMigModal({ stage: 'scan' });
      try {
          const base = ['artifacts', appId, 'public', 'data'];
          const recSnap = await getDocs(collection(db, ...base, `progressRecords_${currentTeam}`));
          const recs = {}; recSnap.docs.forEach(d => { recs[d.id] = d.data(); });
          const projSnap = await getDocs(collection(db, ...base, 'projects'));
          const teamProjects = projSnap.docs.map(d => ({ _docId: d.id, ...d.data() })).filter(p => p.team === currentTeam);
          const listSnap = await getDocs(collection(db, ...base, `projectListRows_${currentTeam}`));
          const listRows = listSnap.docs.map(d => ({ _id: d.id, ...d.data() }));

          const plans = []; const conflictPlans = []; const ambiguous = [];
          const claimedKeys = new Set(); // 이미 다른 프로젝트에 배정된 옛 장부 (이중 복제 방지)
          teamProjects.forEach(p => {
              if (!p.pid) return;
              // 이 프로젝트의 옛 장부 키 후보: 실행번호(팀 내 유일할 때만), 월간 문서ID, 연결된 List 행ID
              const oldKeys = new Set();
              const execKey = String(p.execNo || '').trim();
              if (execKey) {
                  const sameExecCount = teamProjects.filter(q => String(q.execNo || '').trim() === execKey).length;
                  if (sameExecCount === 1) {
                      oldKeys.add(execKey);
                  } else if (recs[execKey]?.weekly && !recs[execKey]?._migratedTo) {
                      // 중복 실행번호의 장부는 어느 프로젝트 것인지 알 수 없음 → 자동 병합 금지, 보류 목록
                      if (!ambiguous.some(a => a.key === execKey)) {
                          ambiguous.push({ key: execKey, count: sameExecCount, sum: sumWeeklyAll(recs[execKey].weekly) });
                      }
                  }
              }
              oldKeys.add(String(p._docId));
              listRows.filter(r => r._pid === p.pid).forEach(r => oldKeys.add(String(r._id)));
              oldKeys.delete(p.pid);
              const sources = [...oldKeys].filter(k => recs[k]?.weekly && !recs[k]?._migratedTo && !claimedKeys.has(k));
              if (sources.length === 0) return;
              sources.forEach(k => claimedKeys.add(k));

              // 병합 시뮬레이션 (기존 pid 장부 포함, 빈 칸만 채움 — 값 충돌은 기록)
              const mergedWeekly = JSON.parse(JSON.stringify(recs[p.pid]?.weekly || {}));
              const confs = [];
              sources.forEach(k => {
                  Object.entries(recs[k].weekly || {}).forEach(([cat, weeks]) => {
                      if (!mergedWeekly[cat]) { mergedWeekly[cat] = { ...(weeks || {}) }; return; }
                      Object.entries(weeks || {}).forEach(([wk, val]) => {
                          const ex = mergedWeekly[cat][wk];
                          if (ex === undefined || ex === null || ex === '') mergedWeekly[cat][wk] = val;
                          else if (Number(ex) !== Number(val)) confs.push({ cat, wk, keep: ex, incoming: val, from: k });
                      });
                  });
              });
              const plan = {
                  pid: p.pid, project: p.project || '(이름 없음)', sources, mergedWeekly,
                  beforeSum: sumWeeklyAll(recs[p.pid]?.weekly), srcSums: sources.map(k => ({ k, sum: sumWeeklyAll(recs[k].weekly) })),
                  afterSum: sumWeeklyAll(mergedWeekly), confs,
              };
              if (confs.length > 0) conflictPlans.push(plan); else plans.push(plan);
          });
          setWkMigModal({ stage: 'ready', plans, conflictPlans, ambiguous, totalRecs: recSnap.size });
      } catch (e) { setWkMigModal(null); setAlertMessage('스캔 오류: ' + e.message); }
  };

  const runWkMigration = async () => {
      const m = wkMigModal;
      if (!m || m.stage !== 'ready' || m.plans.length === 0) return;
      setWkMigModal({ stage: 'running' });
      try {
          const base = ['artifacts', appId, 'public', 'data'];
          for (const plan of m.plans) {
              await setDoc(doc(db, ...base, `progressRecords_${currentTeam}`, plan.pid), {
                  docKey: plan.pid, pid: plan.pid,
                  weekly: plan.mergedWeekly,
                  _mergedFrom: plan.sources,
                  updatedAt: new Date().toISOString(),
              });
              // 옛 장부는 지우지 않고 '이관 도장'만 (보존 원칙) — 읽기에서는 무시됨
              for (const k of plan.sources) {
                  await setDoc(doc(db, ...base, `progressRecords_${currentTeam}`, k), {
                      _migratedTo: plan.pid, _migratedAt: new Date().toISOString(),
                  }, { merge: true });
              }
          }
          // 메모리 재로드 (표 즉시 반영)
          const snap2 = await getDocs(collection(db, ...base, `progressRecords_${currentTeam}`));
          const map = {}; snap2.docs.forEach(d => { map[d.id] = d.data(); });
          setProgressRecordsMap(map);
          addLog(`[주간장부 통일] ${m.plans.length}건 병합 완료 (충돌 보류 ${m.conflictPlans.length}건)`);
          setWkMigModal({ stage: 'done', n: m.plans.length, c: m.conflictPlans.length });
      } catch (e) { setWkMigModal(null); setAlertMessage('병합 오류: ' + e.message); }
  };

  const saveSettingsToDB = async (newSettings) => {
      if (!db || !user) return;
      try {
          await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'teamSettings'), newSettings, { merge: true });
      } catch (error) {
          console.error("설정 저장 실패", error);
          setAlertMessage(`설정 저장 중 오류: ${error.message}`);
      }
  };

  const extractAndSaveSettings = async (dataArray) => {
      if (!db || !user || !currentTeam) return null;

      const currentGlobalSettings = { ...initialTeamSettings, ...teamSettings };
      const currentList = currentGlobalSettings[currentTeam];

      let hasChanges = false;
      let addedFactories = 0, addedStatuses = 0, addedManagers = 0;

      const newFactories = new Set(currentList.factory.filter(Boolean));
      const newManagers = new Set(currentList.manager.filter(Boolean));
      const existingStatuses = new Set(currentList.status.filter(Boolean).map(s => s && s.label));
      const newStatuses = [...currentList.status.filter(Boolean)];

      const colors = ['bg-purple-500', 'bg-orange-500', 'bg-pink-500', 'bg-teal-500', 'bg-lime-500', 'bg-amber-500', 'bg-fuchsia-500', 'bg-cyan-500', 'bg-indigo-500'];

      dataArray.forEach(p => {
          const f = String(p.factory || '').trim();
          const m = String(p.manager || '').trim();
          const s = String(p.progressStatus || '').trim();

          if (f && f !== '-' && f !== '미지정' && !newFactories.has(f)) {
              newFactories.add(f);
              hasChanges = true;
              addedFactories++;
          }
          if (m && m !== '-' && m !== '미지정' && !newManagers.has(m)) {
              newManagers.add(m);
              hasChanges = true;
              addedManagers++;
          }
          if (s && s !== '-' && s !== '미지정' && !existingStatuses.has(s)) {
              existingStatuses.add(s);
              const color = colors[newStatuses.length % colors.length];
              newStatuses.push({ label: s, color, textColor: color.replace('bg-', 'text-').replace('500', '400'), borderColor: color.replace('bg-', 'border-').replace('500', '500/20') });
              hasChanges = true;
              addedStatuses++;
          }
      });

      if (hasChanges) {
          currentList.factory = Array.from(newFactories);
          currentList.manager = Array.from(newManagers);
          currentList.status = newStatuses;
          setTeamSettings(currentGlobalSettings);
          await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'teamSettings'), currentGlobalSettings, { merge: true });
          return { addedFactories, addedStatuses, addedManagers };
      }
      return null;
  };

  const toggleDefaultActive = (type, value) => {
      const currentGlobalSettings = { ...initialTeamSettings, ...teamSettings };
      const newSettings = JSON.parse(JSON.stringify(currentGlobalSettings));
      const current = newSettings[currentTeam];
      
      if (type === 'status') {
          const arr = current.defaultActiveStatuses || [];
          if (arr.includes(value)) current.defaultActiveStatuses = arr.filter(x => x !== value);
          else current.defaultActiveStatuses = [...arr, value];
      } else if (type === 'factory') {
          const arr = current.defaultActiveFactories || [];
          if (arr.includes(value)) current.defaultActiveFactories = arr.filter(x => x !== value);
          else current.defaultActiveFactories = [...arr, value];
      }
      
      setTeamSettings(newSettings);
      saveSettingsToDB(newSettings);
      
      if (type === 'status') setActiveFilterStatuses(new Set(newSettings[currentTeam].defaultActiveStatuses));
      else if (type === 'factory') setActiveFilterFactories(new Set(newSettings[currentTeam].defaultActiveFactories));
  };

  const addItemToOptions = () => {
      if (!newItemInput.trim() || !currentTeam) return;
      const currentGlobalSettings = { ...initialTeamSettings, ...teamSettings };
      const newSettings = JSON.parse(JSON.stringify(currentGlobalSettings));
      const current = newSettings[currentTeam];

      if (settingsTab === 'factory' && !current.factory.includes(newItemInput)) current.factory.push(newItemInput);
      else if (settingsTab === 'manager' && !current.manager.includes(newItemInput)) current.manager.push(newItemInput);
      else if (settingsTab === 'status' && !current.status.some(s => s && s.label === newItemInput)) {
          const colors = ['bg-purple-500', 'bg-orange-500', 'bg-pink-500', 'bg-teal-500', 'bg-lime-500'];
          const color = colors[current.status.length % colors.length];
          current.status.push({ label: newItemInput, color, textColor: color.replace('bg-', 'text-').replace('500', '400'), borderColor: color.replace('bg-', 'border-').replace('500', '500/20') });
      }
      setTeamSettings(newSettings); 
      saveSettingsToDB(newSettings);
      setNewItemInput('');
  };

  const removeItemFromOptions = (itemLabel) => {
      if(!currentTeam) return;
      const currentGlobalSettings = { ...initialTeamSettings, ...teamSettings };
      const newSettings = JSON.parse(JSON.stringify(currentGlobalSettings));
      const current = newSettings[currentTeam];

      if (settingsTab === 'factory') current.factory = current.factory.filter(f => f !== itemLabel);
      else if (settingsTab === 'manager') current.manager = current.manager.filter(m => m !== itemLabel);
      else if (settingsTab === 'status') current.status = current.status.filter(s => s && s.label !== itemLabel);

      setTeamSettings(newSettings);
      saveSettingsToDB(newSettings);
  };

  // ★ 프로젝트 List: 인라인 에디팅 저장 핸들러
  const handleDynamicInlineSave = async (rowId, field, newValue) => {
      setDynamicEditingInline(null);
      const updatedData = dynamicExcelData.map(row => 
          row.id === rowId ? { ...row, [field]: newValue } : row
      );
      setDynamicExcelData(updatedData);
      
      if (!isDynamicUnsaved) {
          try {
              const listRef = doc(db, 'artifacts', appId, 'public', 'data', 'projectLists', currentTeam);
              await setDoc(listRef, { cols: dynamicExcelCols, rows: updatedData }, { merge: true });
              addLog(`[프로젝트 List] ${rowId} 데이터 즉시 반영됨.`);
          } catch (error) {
              console.error("List 업데이트 오류", error);
              setAlertMessage(`자동 저장 오류: ${error.message}`);
          }
      } else {
          addLog(`[프로젝트 List] 임시 변경 적용됨.`);
      }
  };

  // ★ 프로젝트 List: 엑셀 파일 로드 및 미리보기 표시
  const handleDynamicFileUpload = async (e) => {
      const file = e.target?.files?.[0];
      if (!file) return;

      setIsDbLoading(true);
      setLogs([]); 
      addLog(`========== 프로젝트 리스트 엑셀 파싱 시작 ==========`);

      try {
          const XLSX = await loadXLSX();
          const data = await file.arrayBuffer();
          const workbook = XLSX.read(data, { cellDates: true });
          const worksheet = workbook.Sheets[workbook.SheetNames[0]];
          
          const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, dateNF: 'yyyy-mm-dd', defval: "" });
          
          if (rawData.length < 2) {
              setAlertMessage("데이터가 부족합니다. 표 헤더와 데이터 행이 모두 필요합니다.");
              setIsDbLoading(false);
              return;
          }

          const filteredData = rawData.filter(row => row.some(cell => cell !== undefined && cell !== null && String(cell).trim() !== ""));

          let headers = filteredData[0].map((h, i) => h ? String(h).trim() : `Column_${i+1}`);
          const headerCounts = {};
          headers = headers.map(h => {
              if (headerCounts[h]) {
                  headerCounts[h]++;
                  return `${h}_${headerCounts[h]}`;
              }
              headerCounts[h] = 1;
              return h;
          });

          const cols = headers.map(h => ({ key: h, label: h }));
          
          const rows = filteredData.slice(1).map((rowRaw, idx) => {
              const rowObj = { id: `dyn_${Date.now()}_${idx}` };
              headers.forEach((h, i) => {
                  rowObj[h] = rowRaw[i] !== undefined && rowRaw[i] !== null ? String(rowRaw[i]) : "";
              });
              return rowObj;
          });

          setStagedDynamicCols(cols);
          setStagedDynamicData(rows);
          setIsDynamicPreviewOpen(true);
          
          addLog(`동적 엑셀 파싱 성공! 헤더 ${cols.length}개, 데이터 ${rows.length}줄`);
      } catch (error) {
          console.error("동적 엑셀 파싱 에러:", error);
          setAlertMessage(`엑셀 파싱 중 오류: ${error.message}`);
      } finally {
          setIsDbLoading(false);
          if (dynamicFileInputRef.current) dynamicFileInputRef.current.value = '';
      }
  };

  // ★ 프로젝트 List: 미리보기를 메인 화면에 임시 적용
  const handleDynamicPreviewOnMain = () => {
      setDynamicExcelCols(stagedDynamicCols);
      setDynamicExcelData(stagedDynamicData);
      setIsDynamicUnsaved(true);
      isDynamicUnsavedRef.current = true;
      
      setIsDynamicPreviewOpen(false);
      setStagedDynamicCols([]);
      setStagedDynamicData([]);
      addLog(`프로젝트 리스트 메인 화면에 임시 적용 완료 (${stagedDynamicData.length}건).`);
  };

  // ★ 프로젝트 List: 다이렉트 DB 저장 (미리보기 모달에서 바로)
  const handleSaveDynamicDataDirect = async () => {
      if (!db || !user) return;
      setIsDbLoading(true);
      try {
          const listRef = doc(db, 'artifacts', appId, 'public', 'data', 'projectLists', currentTeam);
          await setDoc(listRef, { cols: stagedDynamicCols, rows: stagedDynamicData });
          setAlertMessage("프로젝트 리스트가 성공적으로 클라우드 DB에 저장되었습니다.");
          
          setDynamicExcelCols(stagedDynamicCols);
          setDynamicExcelData(stagedDynamicData);
          setIsDynamicUnsaved(false);
          isDynamicUnsavedRef.current = false;

          setIsDynamicPreviewOpen(false);
          setStagedDynamicCols([]);
          setStagedDynamicData([]);
      } catch (error) {
          console.error("Project list 저장 에러:", error);
          setAlertMessage(`저장 중 오류: ${error.message}`);
      } finally {
          setIsDbLoading(false);
      }
  };

  // ★ 프로젝트 List: DB 저장 (임시 데이터 배너에서)
  const handleSaveDynamicData = async () => {
      if (!db || !user) return;
      setIsDbLoading(true);
      try {
          const listRef = doc(db, 'artifacts', appId, 'public', 'data', 'projectLists', currentTeam);
          await setDoc(listRef, {
              cols: dynamicExcelCols,
              rows: dynamicExcelData
          });
          setAlertMessage("프로젝트 리스트가 성공적으로 클라우드 DB에 저장되었습니다.");
          setIsDynamicUnsaved(false);
          isDynamicUnsavedRef.current = false;
      } catch (error) {
          console.error("Project list 저장 에러:", error);
          setAlertMessage(`저장 중 오류: ${error.message}`);
      } finally {
          setIsDbLoading(false);
      }
  };

  const handleFileUpload = async (e) => {
      const file = e.target?.files?.[0];
      if (!file) return;

      setIsSettingsMenuOpen(false); 
      setIsModalOpen(false); 
      setIsDbLoading(true);
      setLogs([]); 
      
      addLog(`========== 엑셀 업로드 시작 ==========`);
      addLog(`파일명: ${file.name}, 크기: ${(file.size / 1024).toFixed(2)} KB`);

      if (!db || !user) {
          addLog("오류: 파이어베이스 DB가 연결되지 않았습니다.");
          setAlertMessage("파이어베이스가 연결되지 않았습니다.");
          setShowDebug(true); 
          setIsDbLoading(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
          return;
      }

      try {
          addLog("엑셀(XLSX) 라이브러리 로드 중...");
          const XLSX = await loadXLSX();
          const data = await file.arrayBuffer();
          addLog("파일 읽기 완료. Workbook 변환 중...");
          const workbook = XLSX.read(data, { cellDates: true });
          const worksheet = workbook.Sheets[workbook.SheetNames[0]];
          
          addLog(`첫 번째 시트명: ${workbook.SheetNames[0]}`);
          const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, dateNF: 'yyyy-mm-dd', defval: "" });
          addLog(`추출된 원시 데이터 행(Row) 수: ${rawData.length}`);

          if (rawData.length <= 4) {
              addLog("오류: 엑셀 파일의 줄 수가 너무 적습니다 (5행 미만).");
              setAlertMessage("유효한 데이터가 없습니다. 엑셀 파일에 데이터가 5행부터 채워져 있는지 확인해주세요.");
              setShowDebug(true);
              setIsDbLoading(false);
              if (fileInputRef.current) fileInputRef.current.value = '';
              return;
          }

          const headerRow1 = rawData[2] || [];
          const headerRow2 = rawData[3] || [];
          const maxCols = Math.max(headerRow1.length, headerRow2.length);
          addLog(`분석 중... 헤더 1열(${headerRow1.length}개), 헤더 2열(${headerRow2.length}개)`);

          const headers = [];
          const monthCols = [];
          let lastH1 = ""; 
          
          for (let i = 0; i < maxCols; i++) {
              if (headerRow1[i] && String(headerRow1[i]).trim() !== "") lastH1 = String(headerRow1[i]).trim();
              const h1 = lastH1;
              const h2 = String(headerRow2[i] || '').trim();
              headers[i] = (h1 + h2).replace(/\s+/g, '').toUpperCase();
              
              if (/^(0?[1-9]|1[0-2])월?$/.test(h2)) {
                  let yearStr = new Date().getFullYear().toString();
                  const yearMatch = h1.match(/(\d{2,4})년?/);
                  if (yearMatch) {
                      yearStr = yearMatch[1];
                      if (yearStr.length === 2) yearStr = '20' + yearStr;
                  }
                  const monthStr = h2.replace(/[^0-9]/g, '').padStart(2, '0');
                  monthCols.push({ index: i, date: `${yearStr}-${monthStr}` });
              }
          }
          addLog(`최종 인식된 전체 컬럼 수: ${headers.length}개`);
          addLog(`인식된 월별(Month) 데이터 컬럼 수: ${monthCols.length}개`);

          const dataRows = rawData.slice(4);
          addLog(`본문 데이터 스캔 시작 (5행부터, 총 ${dataRows.length}줄)...`);
          
          const uploadTimestamp = Date.now();
          let currentMainIdForExcel = null;
          let noDataSkipCount = 0;

          const parsedData = dataRows.map((rawRow, index) => {
              const row = {};
              for (let i = 0; i < headers.length; i++) {
                  const header = headers[i];
                  if (header) {
                      const val = rawRow[i];
                      if (val !== undefined && val !== null && String(val).trim() !== "") {
                          if (!row[header] || String(row[header]).trim() === "") row[header] = val;
                      }
                  }
              }

              const getVal = (keysArray) => {
                  for(let k of keysArray) {
                      const normK = String(k).replace(/\s+/g, '').toUpperCase();
                      let matchedKey = Object.keys(row).find(headerKey => headerKey === normK);
                      if (!matchedKey) matchedKey = Object.keys(row).find(headerKey => headerKey.endsWith(normK));
                      if (!matchedKey) matchedKey = Object.keys(row).find(headerKey => headerKey.includes(normK));
                      if(matchedKey && row[matchedKey] !== undefined && row[matchedKey] !== null && String(row[matchedKey]).trim() !== '') return String(row[matchedKey]).trim();
                  }
                  return '';
              };

              const execNo = getVal(['실행번호', '실행예산', '실행', 'EXECNO', 'EXEC', 'NO.', 'NO']); 
              const project = getVal(['프로젝트명', '프로젝트', '사업명', '공사명', '명칭', '제목', 'TITLE', 'PROJECT']);
              const estNo = getVal(['견적번호', '견적', 'ESTNO', 'EST', '견적NO', '견적 번호']);
              const rawProgressStatus = getVal(['진행현황', '현황', '진행상태', '상태', 'PROGRESSSTATUS']);
              const point = safeNumber(getVal(['POINT', '포인트', '시운전포인트', '총포인트']));
              const l1 = getVal(['L1', '엘원']);
              const l2 = getVal(['L2', '엘투']);
              const client = getVal(['발주처', '고객사', '고객', 'CLIENT']);
              const investReview = getVal(['투자심의', '투심', '투자', '심의']);
              const material = getVal(['자재', '자재(%)', '자재내역', '사급', '도급', 'MATERIAL']);
              const workScope = getVal(['작업범위', '범위', '공사범위', 'SCOPE', 'WORKSCOPE']);
              const factory = getVal(['공장구분', '공장', 'SITE', 'FACTORY']) || currentFactoryOptions[0] || '';
              const content = getVal(['내용', '프로젝트내용', '상세', 'CONTENT']);
              const status = rawProgressStatus || '신규등록';
              const manager = currentManagerOptions[0] || '';
              const startDate = getVal(['시작일', '착수일', 'START', 'STARTDATE']);
              const endDate = getVal(['완료일', '종료일', '납기일', 'END', 'ENDDATE']);
              
              const plc = safeNumber(getVal(['PLC', '피엘씨']));
              const etos = safeNumber(getVal(['ETOS', '이토스']));
              const hmi = safeNumber(getVal(['HMI', '작화']));
              const internalTest = safeNumber(getVal(['자체시운전', '자체', '자체테스트', '내부시운전']));
              const integratedTest = safeNumber(getVal(['통합시운전', '통합', '통합테스트']));
              
              const monthlyPoints = [];
              monthCols.forEach(mc => {
                  const val = rawRow[mc.index];
                  if (val !== undefined && val !== null && val !== '') {
                      const numVal = safeNumber(val);
                      if (numVal !== 0) monthlyPoints.push({ date: mc.date, value: numVal });
                  }
              });
              monthlyPoints.sort((a,b) => b.date.localeCompare(a.date));

              if (!execNo && !project && !content) {
                  noDataSkipCount++;
                  return null; 
              }

              const paddedIndex = String(index).padStart(5, '0');
              const projectId = `excel_${uploadTimestamp}_${paddedIndex}`; 
              
              const execNoStr = String(execNo).trim().toLowerCase();
              const isSub = execNoStr === 's' || execNoStr.startsWith('-');
              
              let parentId = null;
              if (!isSub) currentMainIdForExcel = projectId;
              else parentId = currentMainIdForExcel;
              
              return {
                  id: projectId, parentId, isSub, team: currentTeam,
                  pid: generatePid(), // A-4a: 고유 ID 자동 발급
                  execNo, estNo, progressStatus: status, client, investReview, material, workScope, factory, project: project || '이름 없음',
                  content, point, l1, l2, status, manager, startDate, endDate,
                  plc, etos, hmi, internalTest, integratedTest,
                  progress: 0, totalCommissioningPoints: point, monthlyPoints
              };
          }).filter(item => item !== null); 

          addLog(`스캔 완료. (핵심정보 누락 생략: ${noDataSkipCount}건)`);
          addLog(`성공적으로 추출된 유효 데이터: ${parsedData.length}건!`);

          if (parsedData.length === 0) {
              addLog(`[위험] 유효한 데이터가 0건입니다. 화면에 모달을 띄우지 못합니다.`);
              setShowDebug(true); 
              setAlertMessage(`유효한 데이터가 없습니다. \n\n[현재 시스템이 엑셀에서 추출한 데이터가 0건입니다.]`);
              setIsDbLoading(false);
              if (fileInputRef.current) fileInputRef.current.value = '';
              return;
          }

          addLog(`엑셀 검증 모달을 엽니다.`);
          setStagedExcelData(parsedData);
          setIsExcelPreviewOpen(true);
      } catch (error) {
          addLog(`[치명적 오류] 엑셀 파싱 중 에러 발생: ${error.message}`);
          console.error("엑셀 파싱 에러:", error);
          setShowDebug(true);
          setAlertMessage(`엑셀 처리 중 오류가 발생했습니다.\n상세: ${error.message}`);
      } finally {
          setIsDbLoading(false);
          if (fileInputRef.current) fileInputRef.current.value = ''; 
      }
  };

  const handlePreviewOnMain = () => {
      if (!stagedExcelData) return;
      const unsavedData = stagedExcelData.map(p => ({ ...p, isUnsaved: true }));
      setLocalUnsavedProjects(prev => {
          const existingIds = new Set(prev.map(p => p.id));
          const newItems = unsavedData.filter(p => !existingIds.has(p.id));
          return [...prev, ...newItems];
      });
      setIsExcelPreviewOpen(false);
      setStagedExcelData(null);
      
      setActiveFilterStatuses(new Set());
      setActiveFilterFactories(new Set());
      setSearchTerm('');
      
      addLog(`임시 데이터 메인 화면 적용 완료 (${unsavedData.length}건). 메인 화면을 빈 상태로 초기화했습니다.`);
  };

  // ★ PMS 로컬(IndexedDB) 임시 저장
  const handleSavePmsToLocal = async () => {
      if (!localUnsavedProjects.length) return;
      try {
          await pmsIdbSave(currentTeam, localUnsavedProjects, baseDate);
          setPmsLocalInfo({ savedAt: new Date().toISOString(), count: localUnsavedProjects.length });
          addLog(`[로컬DB] ${localUnsavedProjects.length}건 임시 저장 완료`);
          setAlertMessage(`로컬 임시 저장 완료!\n${localUnsavedProjects.length}건이 이 기기에 저장되었습니다.\n앱을 재시작해도 데이터가 유지됩니다.`);
      } catch (err) {
          addLog(`[로컬DB 오류] ${err.message}`);
          setAlertMessage(`로컬 저장 오류: ${err.message}`);
      }
  };

  // ★ PMS 로컬 데이터 삭제
  const handleDeletePmsLocal = async () => {
      try {
          await pmsIdbDelete(currentTeam);
          setPmsLocalInfo(null);
          setLocalUnsavedProjects([]);
          addLog(`[로컬DB] 삭제 완료`);
      } catch (err) { addLog(`[로컬DB 삭제 오류] ${err.message}`); }
  };

  const executeSaveUnsaved = async (overwriteExisting) => {
      if (!db || !user || localUnsavedProjects.length === 0) return;
      setIsDbLoading(true);
      setIsSaveConfirmModalOpen(false); 
      addLog(`DB 확정 저장 프로세스 시작... (덮어쓰기 모드: ${overwriteExisting})`);
      try {
          let batch = writeBatch(db);
          let count = 0;

          if (overwriteExisting) {
              const projectsToDelete = allProjects.filter(p => p.team === currentTeam);
              addLog(`기존 데이터 ${projectsToDelete.length}건 삭제 준비 중...`);
              for (const p of projectsToDelete) {
                  batch.delete(doc(db, 'artifacts', appId, 'public', 'data', 'projects', p.id));
                  count++;
                  if (count >= 400) { await batch.commit(); batch = writeBatch(db); count = 0; }
              }
          }

          let successCount = 0;
          addLog(`새로운 데이터 ${localUnsavedProjects.length}건 DB 기록 준비 중...`);
          for (const payload of localUnsavedProjects) {
              const safeData = sanitizePayload(payload); 
              batch.set(doc(db, 'artifacts', appId, 'public', 'data', 'projects', payload.id), safeData);
              count++; successCount++;
              if (count >= 400) { await batch.commit(); batch = writeBatch(db); count = 0; }
          }
          if (count > 0) await batch.commit();

          addLog(`DB 기록 완료. 설정 데이터(상태/공장 등) 추출 진행...`);
          await extractAndSaveSettings(localUnsavedProjects);

          setAlertMessage(`총 ${successCount}개의 데이터가 DB에 확정 저장되었습니다!\n${overwriteExisting ? '(기존 데이터 삭제 및 덮어쓰기 완료)' : '(기존 데이터 아래에 추가 완료)'}`);
          setLocalUnsavedProjects([]);
          setPmsLocalInfo(null);
          pmsIdbDelete(currentTeam).catch(() => {});
          addLog(`========== 전체 저장 프로세스 성공 ==========`);
      } catch (error) {
          console.error("DB 저장 에러:", error);
          addLog(`[치명적 오류] DB 저장 실패: ${error.message}`);
          setAlertMessage("데이터베이스 저장 중 오류가 발생했습니다.");
      } finally {
          setIsDbLoading(false);
      }
  };

  const handleSaveStagedData = async () => {
      if (!db || !user || !stagedExcelData) return;
      setIsDbLoading(true);
      addLog(`다이렉트 DB 저장 프로세스 시작...`);
      try {
          let batch = writeBatch(db);
          let count = 0;
          let successCount = 0;

          for (const payload of stagedExcelData) {
              const safeData = sanitizePayload(payload); 
              batch.set(doc(db, 'artifacts', appId, 'public', 'data', 'projects', payload.id), safeData);
              count++; successCount++;
              if (count >= 400) { await batch.commit(); batch = writeBatch(db); count = 0; }
          }
          if (count > 0) await batch.commit();

          await extractAndSaveSettings(stagedExcelData);

          setAlertMessage(`총 ${successCount}개의 엑셀 데이터가 성공적으로 DB에 바로 저장되었습니다!`);
          setIsExcelPreviewOpen(false);
          setStagedExcelData(null);
          addLog(`========== 전체 다이렉트 저장 성공 ==========`);
      } catch (error) {
          console.error("DB 저장 에러:", error);
          addLog(`[치명적 오류] 다이렉트 DB 저장 실패: ${error.message}`);
          setAlertMessage("데이터베이스 저장 중 오류가 발생했습니다.");
      } finally {
          setIsDbLoading(false);
      }
  };

  const currentSettingsList = settingsTab === 'status' 
      ? currentStatusOptions.map(s => s && s.label).filter(Boolean)
      : settingsTab === 'factory' 
          ? currentFactoryOptions 
          : currentManagerOptions;

  const renderTable = (dataSource, columnsDef, isPreviewMode) => {
      // 셀 초기값 계산 헬퍼
      const computeInitVal = (rowData, colKey) => {
          const rdp = { ...rowData, ...(pendingEdits[String(rowData.id ?? '')] || {}) };
          const calc = getCalculatedRowData(rdp);
          return colKey === 'prevPoints' ? calc.prevPointsVal
              : colKey === 'currPoints' ? calc.currPointsVal
              : colKey === 'accPoints' ? calc.accPointsVal
              : colKey === 'progressStatus' ? getEffectiveStatus(rdp)
              : colKey === 'plc' ? calc.currPlc
              : colKey === 'etos' ? calc.currEtos
              : colKey === 'hmi' ? calc.currHmi
              : colKey === 'internalTest' ? calc.currInternalTest
              : colKey === 'integratedTest' ? calc.currIntegratedTest
              : (rdp[colKey] !== undefined && rdp[colKey] !== null ? rdp[colKey] : '');
      };
      const NON_EDITABLE = new Set(['no', 'prevProgress', 'currProgress', 'progress']);
      const editableCols = columnsDef.filter(c => !NON_EDITABLE.has(c.key)).map(c => c.key);
      // 접힌 행 제외한 가시 행 목록
      const visibleRows = (() => {
          let lastMainId = null;
          return dataSource.filter(p => {
              if (!p.isSub) { lastMainId = p.id; return true; }
              return !(lastMainId && collapsedProjects.has(lastMainId));
          });
      })();
      const navigateCell = (curRId, curColKey, dRow, dCol, curValue) => {
          handleInlineSave(curRId, curColKey, curValue);
          const ri = visibleRows.findIndex(p => (p.id ?? p) === curRId);
          const ci = editableCols.indexOf(curColKey);
          if (dRow !== 0) {
              const nri = ri + dRow;
              if (nri >= 0 && nri < visibleRows.length) {
                  const nr = visibleRows[nri];
                  setEditingInline({ id: nr.id ?? nri, field: curColKey, value: computeInitVal(nr, curColKey) });
              } else { setEditingInline(null); }
          } else if (dCol !== 0) {
              let nci = ci + dCol;
              if (nci < 0) { nci = editableCols.length - 1; }
              else if (nci >= editableCols.length) { nci = 0; }
              const nColKey = editableCols[nci];
              const cr = visibleRows[ri];
              if (cr) setEditingInline({ id: curRId, field: nColKey, value: computeInitVal(cr, nColKey) });
          }
      };

      const h1 = [];
      const h2 = [];
      let currentGroup = null;

      columnsDef.forEach((col, idx) => {
          if (col.group) {
              h2.push({ ...col, flatIdx: idx });
              if (currentGroup !== col.group) {
                  currentGroup = col.group;
                  let contiguousCount = 0;
                  for (let i = idx; i < columnsDef.length; i++) {
                      if (columnsDef[i].group === col.group) contiguousCount++;
                      else break;
                  }
                  h1.push({
                      isGroup: true,
                      label: col.group,
                      colSpan: contiguousCount,
                      key: `grp_${col.group}_${idx}`,
                      flatIdx: idx,
                      rightBorder: columnsDef[idx + contiguousCount - 1]?.rightBorder
                  });
              }
          } else {
              h1.push({
                  isGroup: false,
                  ...col,
                  rowSpan: 2,
                  flatIdx: idx
              });
              currentGroup = null;
          }
      });

      const getStickyLeft = (idx) => {
          let left = 0;
          for(let i=0; i<idx; i++) left += Math.round((previewColWidths[columnsDef[i]?.key] || 100) * colScale);
          return left;
      };

      const tableMinW = compactMode === 0 ? '2800px' : compactMode === 1 ? '2000px' : '1400px';
      return (
          <div className="overflow-auto flex-1 custom-scrollbar bg-slate-950/50 relative">
              <table className="w-full text-left border-collapse table-fixed" style={{ minWidth: tableMinW }}>
                  <colgroup>
                      {columnsDef.map(col => <col key={col.key} style={{ width: Math.round((previewColWidths[col.key] || 100) * colScale) }} />)}
                      <col style={{ width: Math.round(100 * colScale) }} />
                  </colgroup>
                  <thead className="sticky top-0 bg-slate-900 shadow-md z-40">
                      <tr className={`text-slate-500 ${compactMode === 0 ? 'text-[11px]' : compactMode === 1 ? 'text-[10px]' : 'text-[9px]'} font-bold uppercase tracking-widest border-b border-slate-800 whitespace-nowrap`}>
                          {h1.map((col) => {
                              const isSticky = frozenPreviewIdx >= col.flatIdx;
                              const BOLD_GROUPS = ['시운전(포인트)', '공정률(%)', '진행현황(%)', '진행현황'];
                              const isBoldGroup = col.isGroup && BOLD_GROUPS.includes(col.label);
                              const groupAlign = col.isGroup && col.label === '공정률(%)' ? 'text-left' : 'text-center';
                              const alignClass = col.isGroup ? `${groupAlign} text-[11px] bg-slate-800/40 ${isBoldGroup ? '' : 'opacity-70'}` : col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left';
                              const draggedClass = draggedColKey === col.key ? 'opacity-30 bg-slate-800 border-dashed border-cyan-500' : '';

                              const thProps = {
                                  key: col.key,
                                  colSpan: col.colSpan || 1,
                                  rowSpan: col.rowSpan || 1,
                                  className: `group/th ${compactMode === 0 ? 'px-4 py-3' : compactMode === 1 ? 'px-3 py-1.5' : 'px-2 py-0.5'} relative border-b border-slate-800 transition-colors ${alignClass} ${col.color || (isBoldGroup ? '' : 'text-slate-500')} ${getPreviewColClass(col.flatIdx)} ${draggedClass} ${isBoldGroup ? 'th-bold' : ''} ${col.rightBorder ? 'th-group-sep' : ''}`,
                                  style: isSticky ? { left: getStickyLeft(col.flatIdx) } : {}
                              };

                              if (!col.isGroup) {
                                  thProps.draggable = true;
                                  thProps.onDragStart = (e) => { setDraggedColKey(col.key); e.dataTransfer.effectAllowed = 'move'; };
                                  
                                  thProps.onDragEnter = (e) => {
                                      e.preventDefault();
                                      if (!draggedColKey || draggedColKey === col.key) return;
                                      
                                      setLocalColOrder(prev => {
                                          const list = [...prev];
                                          const fromIdx = list.indexOf(draggedColKey);
                                          const toIdx = list.indexOf(col.key);
                                          if (fromIdx !== -1 && toIdx !== -1 && fromIdx !== toIdx) {
                                              const newList = list.filter(k => k !== draggedColKey);
                                              const insertIdx = newList.indexOf(col.key);
                                              if (insertIdx !== -1) {
                                                  newList.splice(insertIdx, 0, draggedColKey);
                                                  return newList;
                                              }
                                          }
                                          return list;
                                      });
                                  };
                                  thProps.onDragEnd = () => {
                                      setDraggedColKey(null);
                                      setTeamSettings(prev => {
                                          const next = JSON.parse(JSON.stringify(prev));
                                          next[currentTeam].colOrderV2 = localColOrder;
                                          saveSettingsToDB(next);
                                          return next;
                                      });
                                  };
                                  thProps.onDragOver = (e) => e.preventDefault();
                                  thProps.onContextMenu = (e) => { e.preventDefault(); setFrozenPreviewIdx(frozenPreviewIdx === col.flatIdx ? -1 : col.flatIdx); };
                                  thProps.onDoubleClick = (e) => { e.stopPropagation(); setFrozenPreviewIdx(frozenPreviewIdx === col.flatIdx ? -1 : col.flatIdx); };
                                  thProps.title = "클릭하여 정렬, 꾹 눌러서 이동, 더블클릭/우클릭하여 열 고정";
                              }

                              return (
                                  <th {...thProps}>
                                      <div className={`flex items-center ${col.isGroup ? 'justify-center' : 'justify-between'} w-full h-full relative group/inner`}>
                                          <div className={`truncate ${!col.isGroup ? `cursor-pointer hover:text-cyan-400 flex-1 pr-2 ${col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left'}` : 'text-center'}`} onClick={() => !col.isGroup && requestSort(col.key)}>
                                              {col.label} {sortConfig.key === col.key && !col.isGroup && <ArrowUpDown size={10} className="inline ml-1 opacity-50"/>}
                                          </div>
                                          {!col.isGroup && (col.key === 'progressStatus' || col.key === 'factory') && (
                                              <div className="relative flex-shrink-0 ml-1 mr-4">
                                                  <button onClick={(e) => { e.stopPropagation(); setActiveHeaderFilter(activeHeaderFilter === col.key ? null : col.key); }} className={`p-1 rounded transition-colors ${(col.key === 'factory' ? activeFilterFactories.size > 0 : activeFilterStatuses.size > 0) ? 'text-cyan-400 bg-slate-800' : 'text-slate-500 hover:text-cyan-400 hover:bg-slate-800'}`}>
                                                      <Filter size={12} />
                                                  </button>
                                                  {activeHeaderFilter === col.key && (
                                                      <>
                                                          <div className="fixed inset-0 z-[65]" onClick={(e) => { e.stopPropagation(); setActiveHeaderFilter(null); }}></div>
                                                          <div className="absolute top-full left-0 mt-2 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-4 z-[70] min-w-[200px] text-left cursor-default" onClick={e => e.stopPropagation()}>
                                                              <div className="text-xs font-bold text-slate-400 mb-3 uppercase tracking-widest border-b border-slate-800 pb-2">{col.label} 표시 항목</div>
                                                              <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-2">
                                                                  {(col.key === 'factory' ? displayFactories : filterStatusOptions).map(opt => {
                                                                      const count = col.key === 'factory' ? (factorySummary[opt] || 0) : (statusSummaryItems.find(s => s && s.label === opt)?.count || 0);
                                                                      const isChecked = col.key === 'factory' ? activeFilterFactories.has(opt) : activeFilterStatuses.has(opt);
                                                                      return (
                                                                          <label key={opt} className="flex items-center gap-3 cursor-pointer group py-1">
                                                                              <input type="checkbox" checked={isChecked} onChange={() => {
                                                                                  if (col.key === 'factory') { setActiveFilterFactories(prev => { const next = new Set(prev); if (next.has(opt)) next.delete(opt); else next.add(opt); return next; }); }
                                                                                  else { setActiveFilterStatuses(prev => { const next = new Set(prev); if (next.has(opt)) next.delete(opt); else next.add(opt); return next; }); }
                                                                              }} className="w-4 h-4 accent-cyan-500 rounded bg-slate-800 border-slate-700 cursor-pointer" />
                                                                              <span className={`text-sm font-medium flex-1 ${isChecked ? 'text-cyan-400' : 'text-slate-500 group-hover:text-slate-300'}`}>{opt}</span>
                                                                              <span className="text-xs font-mono text-slate-500">{count}</span>
                                                                          </label>
                                                                      );
                                                                  })}
                                                              </div>
                                                              <div className="mt-4 flex gap-2">
                                                                  <button onClick={() => setActiveHeaderFilter(null)} className="flex-1 py-2 bg-cyan-600 hover:bg-cyan-500 text-xs font-bold text-white rounded-lg transition-colors">닫기</button>
                                                              </div>
                                                          </div>
                                                      </>
                                                  )}
                                              </div>
                                          )}
                                      </div>
                                      {!col.isGroup && (
                                          <div className={`absolute -right-[5px] top-0 bottom-0 w-[10px] cursor-col-resize z-[55] transition-colors touch-none ${resizingCol === col.key ? 'bg-cyan-500' : 'hover:bg-cyan-500/50'} before:content-[''] before:absolute before:left-[4px] before:top-0 before:bottom-0 before:w-[2px] before:bg-slate-700/30 group-hover:before:bg-cyan-500/30`}
                                               onMouseDown={(e) => handleMouseDown(e, col.key)} onDoubleClick={(e) => { e.stopPropagation(); handleDoubleClickResize(col.key, col.label); }} />
                                      )}
                                  </th>
                              );
                          })}
                          <th className={`${compactMode === 0 ? 'px-4 py-3' : compactMode === 1 ? 'px-3 py-1.5' : 'px-2 py-0.5'} text-center sticky right-0 bg-slate-900 shadow-[-5px_0_15px_rgba(0,0,0,0.4)]`} rowSpan={h2.length > 0 ? 2 : 1}>관리</th>
                      </tr>
                      {h2.length > 0 && (
                          <tr className={`text-slate-500 ${compactMode === 0 ? 'text-[11px]' : compactMode === 1 ? 'text-[10px]' : 'text-[9px]'} font-bold uppercase tracking-widest border-b border-slate-800 whitespace-nowrap`}>
                              {h2.map((col) => {
                                  const isSticky = frozenPreviewIdx >= col.flatIdx;
                                  const alignClass = col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left';
                                  const draggedClass = draggedColKey === col.key ? 'opacity-30 bg-slate-800 border-dashed border-cyan-500' : '';
                                  const isBoldGroupSub = ['시운전(포인트)', '공정률(%)', '진행현황(%)', '진행현황'].includes(col.group);

                                  const thProps = {
                                      key: col.key,
                                      className: `group/th ${compactMode === 0 ? 'px-4 py-3' : compactMode === 1 ? 'px-3 py-1.5' : 'px-2 py-0.5'} relative border-b border-slate-800 transition-colors ${alignClass} ${col.color || (isBoldGroupSub ? '' : 'text-slate-500')} ${getPreviewColClass(col.flatIdx)} ${draggedClass} ${isBoldGroupSub ? 'th-bold' : ''} ${col.rightBorder ? 'th-group-sep' : ''}`,
                                      style: isSticky ? { left: getStickyLeft(col.flatIdx) } : {},
                                      draggable: true,
                                      onDragStart: (e) => { setDraggedColKey(col.key); e.dataTransfer.effectAllowed = 'move'; },
                                      onDragEnter: (e) => {
                                          e.preventDefault();
                                          if (!draggedColKey || draggedColKey === col.key) return;
                                          setLocalColOrder(prev => {
                                              const list = [...prev];
                                              const fromIdx = list.indexOf(draggedColKey);
                                              const toIdx = list.indexOf(col.key);
                                              if (fromIdx !== -1 && toIdx !== -1 && fromIdx !== toIdx) {
                                                  const newList = list.filter(k => k !== draggedColKey);
                                                  const insertIdx = newList.indexOf(col.key);
                                                  if (insertIdx !== -1) {
                                                      newList.splice(insertIdx, 0, draggedColKey);
                                                      return newList;
                                                  }
                                              }
                                              return list;
                                          });
                                      },
                                      onDragEnd: () => {
                                          setDraggedColKey(null);
                                          setTeamSettings(prev => {
                                              const next = JSON.parse(JSON.stringify(prev));
                                              next[currentTeam].colOrderV2 = localColOrder;
                                              saveSettingsToDB(next);
                                              return next;
                                          });
                                      },
                                      onDragOver: (e) => e.preventDefault(),
                                      onContextMenu: (e) => { e.preventDefault(); setFrozenPreviewIdx(frozenPreviewIdx === col.flatIdx ? -1 : col.flatIdx); },
                                      onDoubleClick: (e) => { setFrozenPreviewIdx(frozenPreviewIdx === col.flatIdx ? -1 : col.flatIdx); },
                                      title: "클릭하여 정렬, 꾹 눌러서 이동, 더블클릭/우클릭하여 열 고정"
                                  };

                                  return (
                                      <th {...thProps}>
                                          <div className="flex items-center justify-between w-full h-full relative">
                                              <div className={`truncate pr-4 cursor-pointer hover:text-cyan-400 flex-1 ${col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left'}`} onClick={() => requestSort(col.key)}>{col.label} {sortConfig.key === col.key && <ArrowUpDown size={10} className="inline ml-1 opacity-50"/>}</div>
                                          </div>
                                          <div className={`absolute -right-[5px] top-0 bottom-0 w-[10px] cursor-col-resize z-[55] transition-colors touch-none ${resizingCol === col.key ? 'bg-cyan-500' : 'hover:bg-cyan-500/50'} before:content-[''] before:absolute before:left-[4px] before:top-0 before:bottom-0 before:w-[2px] before:bg-slate-700/30 group-hover:before:bg-cyan-500/30`} onMouseDown={(e) => handleMouseDown(e, col.key)} onDoubleClick={(e) => { e.stopPropagation(); handleDoubleClickResize(col.key, col.label); }} />
                                      </th>
                                  );
                              })}
                          </tr>
                      )}
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                      {dataSource.length === 0 ? (
                          <tr>
                              <td colSpan={columnsDef.length + 1} className="px-6 py-16 text-center text-slate-500 font-bold">
                                  {isPreviewMode ? "조건에 맞는 데이터가 없습니다." : "상단의 현황(Status) 버튼을 눌러 데이터를 불러오거나, 새로운 엑셀을 업로드해 주세요."}
                              </td>
                          </tr>
                      ) : (
                          (() => {
                              let activeParentId = null;
                              return dataSource.map((p, idx) => {
                                  const rId = p.id || idx;
                                  if (!p.isSub) activeParentId = rId;
                                  if (p.isSub && activeParentId && collapsedProjects.has(activeParentId)) return null;

                                  const isCollapsed = collapsedProjects.has(rId);
                                  const hasSubs = !p.isSub && (isPreviewMode ? previewParentHasChildren[rId] : mainParentHasChildren[rId]);
                                  const hasPending = !p.isUnsaved && !!pendingEdits[String(rId)];
                                  // dp: 화면 표시용 (pendingEdits 반영). 카운트/필터링은 p(원본)만 사용
                                  const dp = hasPending ? { ...p, ...pendingEdits[String(rId)] } : p;
                                  const { avgProgress, prevAvgProgress, pointsTriple, currPlc, currEtos, currHmi, currInternalTest, currIntegratedTest, appliedKeys } = getCalculatedRowData(dp);
                                  const isApplied = (k) => appliedKeys.includes(k);
                                  const style = getStatusStyle(safeRender(getEffectiveStatus(dp)));
                                  const isActivePanel = weeklyPanel?.projectId === rId;
                                  const rowStyle = hasSubs ? 'bg-slate-800/20 font-extrabold text-white shadow-sm' : 'hover:bg-white/5 text-slate-300 font-medium';

                                  const isHighlighted = !isPreviewMode && !!highlightExecNoInReport && !!p.execNo && String(p.execNo) === String(highlightExecNoInReport);
                                  const trProps = {
                                      key: rId,
                                      'data-highlight-row': isHighlighted ? '1' : undefined,
                                      className: `group transition-all ${compactMode === 0 ? 'text-sm' : compactMode === 1 ? 'text-xs' : 'text-[11px]'} whitespace-nowrap ${isHighlighted ? 'tr-highlighted border-l-[3px] border-l-amber-400' : p.isUnsaved ? 'bg-amber-900/10 hover:bg-amber-900/20 border-l-[3px] border-l-amber-500' : hasPending ? 'bg-blue-900/5 hover:bg-blue-900/10 border-l-[3px] border-l-blue-400' : isActivePanel ? 'bg-indigo-950 hover:bg-indigo-900/80 text-indigo-100 font-semibold border-l-[3px] border-l-indigo-400' : rowStyle} ${(!p.isSub && hasSubs) || !isPreviewMode ? 'cursor-pointer' : ''}`,
                                      onDoubleClick: (!p.isSub && hasSubs) ? () => { setCollapsedProjects(prev => { const next = new Set(prev); if (next.has(rId)) next.delete(rId); else next.add(rId); return next; }); } : (isPreviewMode ? undefined : () => handleOpenModal(p)),
                                      onContextMenu: !isPreviewMode ? (e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          setContextMenu({ x: e.clientX, y: e.clientY, project: p });
                                      } : undefined,
                                      title: !isPreviewMode ? (!p.isSub && hasSubs ? "더블클릭하여 접기/펴기 (우클릭 메뉴 열기)" : "더블클릭하여 상세 팝업 열기 (우클릭 메뉴 열기)") : undefined
                                  };

                                  return (
                                      <tr {...trProps}>
                                          {columnsDef.map((col, cIdx) => {
                                              let content = p[col.key] || '-';
                                              
                                              // ★ NO. 컬럼에 [+] [-] 토글 버튼 그리기
                                              if (col.key === 'no') {
                                                  content = (!p.isSub && hasSubs) ? (
                                                      <div 
                                                          onClick={(e) => { 
                                                              e.stopPropagation(); 
                                                              setCollapsedProjects(prev => { 
                                                                  const next = new Set(prev); 
                                                                  if (next.has(rId)) next.delete(rId); 
                                                                  else next.add(rId); 
                                                                  return next; 
                                                              }); 
                                                          }} 
                                                          className={`inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 border rounded cursor-pointer font-extrabold shadow-sm transition-colors ${isCollapsed ? 'bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700' : 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/30'}`}
                                                          title="하위 항목 열기/접기"
                                                      >
                                                          {isCollapsed ? <Plus size={10} className="mr-0.5" /> : <Minus size={10} className="mr-0.5" />}
                                                          {p.displayNo}
                                                      </div>
                                                  ) : p.displayNo;
                                              }
                                              else if (col.key === 'execNo' && p.isSub) content = <span className="flex items-center gap-1 text-amber-500/80 pl-2"><CornerDownRight size={12}/> {dp.execNo !== 's' && dp.execNo !== 'S' && dp.execNo !== '-' && dp.execNo !== '' ? dp.execNo : '하위'}</span>;
                                              else if (col.key === 'progress' || col.key === 'currProgress') content = `${avgProgress}%`;
                                              else if (col.key === 'plc') content = isApplied('plc') ? `${currPlc}%` : <span style={{color:'#aaa',fontSize:10}}>N/A</span>;
                                              else if (col.key === 'etos') content = isApplied('etos') ? `${currEtos}%` : <span style={{color:'#aaa',fontSize:10}}>N/A</span>;
                                              else if (col.key === 'hmi') content = isApplied('hmi') ? `${currHmi}%` : <span style={{color:'#aaa',fontSize:10}}>N/A</span>;
                                              else if (col.key === 'internalTest') content = isApplied('internalTest') ? `${currInternalTest}%` : <span style={{color:'#aaa',fontSize:10}}>N/A</span>;
                                              else if (col.key === 'integratedTest') content = isApplied('integratedTest') ? `${currIntegratedTest}%` : <span style={{color:'#aaa',fontSize:10}}>N/A</span>;
                                              else if (col.key === 'prevProgress') content = `${prevAvgProgress}%`;
                                              else if (col.key === 'accPoints' || col.key === 'prevPoints' || col.key === 'currPoints') {
                                                  // 통일 계산기: 세 칸 모두 같은 출처(pointsTriple), 같은 표시(자체/통합 병기)
                                                  const t = col.key === 'accPoints' ? pointsTriple.acc
                                                          : col.key === 'prevPoints' ? pointsTriple.prev
                                                          : pointsTriple.curr;
                                                  const selfOn = isApplied('internalTest');
                                                  const intOn  = isApplied('integratedTest');
                                                  const total = (selfOn ? t.self : 0) + (intOn ? t.int : 0);
                                                  const maxPt = Math.trunc(safeNumber(dp.totalCommissioningPoints ?? dp.point));
                                                  const over = maxPt > 0 && total > maxPt;
                                                  const parts = []; if (selfOn) parts.push(t.self > 0 ? t.self.toLocaleString() : '-'); if (intOn) parts.push(t.int > 0 ? t.int.toLocaleString() : '-');
                                                  const txt = parts.every(v => v === '-') ? '-' : parts.join(' / ');
                                                  const titleParts = []; if (selfOn) titleParts.push(`자체: ${t.self}`); if (intOn) titleParts.push(`통합: ${t.int}`);
                                                  content = <span style={over ? {color:'#dc2626',fontWeight:800} : undefined} title={titleParts.join(' / ')}>{txt}</span>;
                                              }
                                              else if (col.key === 'totalCommissioningPoints') content = safeNumber(dp[col.key]).toLocaleString();
                                              else if (col.key === 'progressStatus') { const effSt = getEffectiveStatus(dp); const sc = STATUS_COLORS[safeRender(effSt)] || { bg:'rgba(107,114,128,0.10)', text:'#6b7280', border:'rgba(107,114,128,0.3)' }; content = <span style={{display:'inline-flex', padding:'1px 8px', fontSize:11, fontWeight:700, border:`1px solid ${sc.border}`, backgroundColor:sc.bg, color:sc.text, whiteSpace:'nowrap'}}>{safeRender(effSt) === 'sub' ? '하위' : safeRender(effSt)}</span>; }
                                              else content = safeRender(dp[col.key]);

                                              if (col.key === 'project') {
                                                  content = (
                                                      <div className="flex items-center gap-2">
                                                          {p.isSub && <span className="flex items-center gap-1 text-amber-500/80 pl-2"><CornerDownRight size={12}/> {p.execNo !== 's' && p.execNo !== 'S' && p.execNo !== '-' && p.execNo !== '' ? p.execNo : '하위'}</span>}
                                                          <span className={!p.isSub && hasSubs ? 'text-cyan-300 font-extrabold' : isActivePanel ? 'text-indigo-200 font-bold' : ''}>{safeRender(dp.project)}</span>
                                                          {isActivePanel && <span className="px-1.5 py-0.5 bg-indigo-500/30 text-indigo-300 text-[10px] rounded font-bold border border-indigo-400/50 ml-1 shrink-0">주간보고 열람중</span>}
                                                          {p.isUnsaved && <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-400 text-[10px] rounded font-bold border border-amber-500/30 ml-2">임시</span>}
                                                      </div>
                                                  );
                                              }

                                              // ★ 월간보고 메인 화면 인라인 에디팅 적용 로직
                                              const isNAField = PROGRESS_KEYS.includes(col.key) && !isApplied(col.key);
                                              const isEditableField = !['no', 'prevProgress', 'currProgress', 'progress', 'accPoints'].includes(col.key) && !isNAField && !(p.isSub && col.key === 'execNo');
                                              if (editingInline?.id === rId && editingInline?.field === col.key && !isPreviewMode && isEditableField) {
                                                  const commonProps = {
                                                      autoFocus: true,
                                                      value: editingInline.value,
                                                      onChange: (e) => setEditingInline({ ...editingInline, value: e.target.value }),
                                                      onBlur: () => handleInlineSave(rId, col.key, editingInline.value),
                                                      onKeyDown: (e) => {
                                                          const isSelect = col.key === 'progressStatus' || col.key === 'factory' || col.key === 'manager';
                                                          const isTextArea = col.key === 'content';
                                                          if (e.key === 'Escape') { e.preventDefault(); setEditingInline(null); return; }
                                                          if (e.key === 'Enter' && !isTextArea) {
                                                              e.preventDefault();
                                                              navigateCell(rId, col.key, e.shiftKey ? -1 : 1, 0, editingInline.value);
                                                              return;
                                                          }
                                                          if (e.key === 'Tab') {
                                                              e.preventDefault();
                                                              navigateCell(rId, col.key, 0, e.shiftKey ? -1 : 1, editingInline.value);
                                                              return;
                                                          }
                                                          const isNumber = ['plc','etos','hmi','internalTest','integratedTest','point','accPoints','prevPoints','currPoints'].includes(col.key);
                                                          const isDate   = col.key === 'startDate' || col.key === 'endDate';
                                                          const allowArrowNav = isSelect || isNumber || isDate;
                                                          if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && (allowArrowNav || !isTextArea)) {
                                                              if (allowArrowNav) { e.preventDefault(); }
                                                              navigateCell(rId, col.key, e.key === 'ArrowDown' ? 1 : -1, 0, editingInline.value);
                                                          }
                                                          if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && allowArrowNav) {
                                                              e.preventDefault();
                                                              navigateCell(rId, col.key, 0, e.key === 'ArrowRight' ? 1 : -1, editingInline.value);
                                                          }
                                                      },
                                                      className: "w-full bg-slate-950 text-slate-200 px-2 py-1 rounded outline-none border border-cyan-500 text-xs focus:ring-1 focus:ring-cyan-500 shadow-lg",
                                                      onClick: (e) => e.stopPropagation(),
                                                      onDoubleClick: (e) => e.stopPropagation(),
                                                  };
                                                  
                                                  if (col.key === 'content') content = <textarea {...commonProps} className={`${commonProps.className} resize-none min-w-[200px]`} rows={3} />;
                                                  else if (col.key === 'progressStatus') content = <select {...commonProps} onChange={(e) => handleInlineSave(rId, col.key, e.target.value)} onBlur={() => setEditingInline(null)}>{currentStatusOptions.map(opt => <option key={opt.label} value={opt.label}>{opt.label === 'sub' ? '하위' : opt.label}</option>)}</select>;
                                                  else if (col.key === 'factory') content = <select {...commonProps} onChange={(e) => handleInlineSave(rId, col.key, e.target.value)} onBlur={() => setEditingInline(null)}>{currentFactoryOptions.map(f => <option key={f} value={f}>{f}</option>)}</select>;
                                                  else if (col.key === 'manager') content = <select {...commonProps} onChange={(e) => handleInlineSave(rId, col.key, e.target.value)} onBlur={() => setEditingInline(null)}>{currentManagerOptions.map(m => <option key={m} value={m}>{m}</option>)}</select>;
                                                  else if (['startDate', 'endDate'].includes(col.key)) content = <input type="date" {...commonProps} />;
                                                  else if (['plc', 'etos', 'hmi', 'internalTest', 'integratedTest', 'point'].includes(col.key)) content = <input type="number" min="0" max="100" {...commonProps} className={`${commonProps.className} text-right w-16`} />;
                                                  else if (['accPoints', 'prevPoints', 'currPoints'].includes(col.key)) content = <input type="number" min="0" {...commonProps} className={`${commonProps.className} text-right w-20`} />;
                                                  else content = <input type="text" {...commonProps} />;
                                              } else if (!isPreviewMode && isEditableField) {
                                                  content = (
                                                      <div 
                                                          className="group/inline flex items-center justify-between w-full h-full cursor-pointer hover:bg-slate-800/80 rounded px-1 -mx-1 transition-colors min-h-[24px]"
                                                          onClick={(e) => {
                                                              e.stopPropagation();
                                                              const initVal = col.key === 'prevPoints' ? pointsTriple.prev.self
                                                                  : col.key === 'currPoints' ? pointsTriple.curr.self
                                                                  : col.key === 'accPoints' ? pointsTriple.acc.self
                                                                  : col.key === 'progressStatus' ? getEffectiveStatus(dp)
                                                                  : col.key === 'plc' ? currPlc
                                                                  : col.key === 'etos' ? currEtos
                                                                  : col.key === 'hmi' ? currHmi
                                                                  : col.key === 'internalTest' ? currInternalTest
                                                                  : col.key === 'integratedTest' ? currIntegratedTest
                                                                  : (dp[col.key] !== undefined && dp[col.key] !== null ? dp[col.key] : '');
                                                              setEditingInline({ id: rId, field: col.key, value: initVal });
                                                          }}
                                                      >
                                                          <div className="flex-1 truncate flex items-center">{content}</div>
                                                      </div>
                                                  );
                                              }

                                              const alignClass = col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left';
                                              const rowPad = compactMode === 0 ? 'px-4 py-3' : compactMode === 1 ? 'px-3 py-1' : 'px-2 py-0.5';
                                              let cellClass = `${rowPad} ${editingInline?.id === rId && editingInline?.field === col.key ? '' : 'truncate'} ${alignClass} ${col.bg || ''} ${getPreviewColClass(cIdx)} group-hover:bg-slate-800 transition-colors`;
                                              if (col.rightBorder) cellClass += " !border-r !border-r-slate-300";
                                              if (draggedColKey === col.key) cellClass += " opacity-20 bg-slate-900"; 
                                              if (col.key === 'execNo' && !p.isSub) cellClass += " font-mono font-extrabold text-cyan-400";
                                              if (col.key === 'estNo') cellClass += " font-mono text-slate-400";
                                              if (col.key === 'factory') cellClass += " uppercase";
                                              if (col.key === 'content' && editingInline?.id !== rId) cellClass += " text-slate-400";
                                              if (col.key === 'point') cellClass += " font-mono text-emerald-400 font-bold";
                                              if (col.key === 'progress') cellClass += " font-bold text-cyan-400 bg-cyan-500/10";
                                              if (col.key === 'material' || col.key === 'workScope') cellClass += " max-w-[150px]";
                                              if (col.key === 'startDate' || col.key === 'endDate') cellClass += " text-slate-400 text-xs font-mono";

                                              const cellTitle = typeof p[col.key] === 'string' || typeof p[col.key] === 'number' ? String(p[col.key]) : undefined;

                                              return <td key={col.key} className={cellClass} style={frozenPreviewIdx >= cIdx ? { left: getStickyLeft(cIdx) } : {}} title={cellTitle}>{content}</td>;
                                          })}
                                          <td className={`${compactMode === 0 ? 'px-2 py-3' : compactMode === 1 ? 'px-1.5 py-1' : 'px-1 py-0.5'} text-center sticky right-0 bg-slate-900 group-hover:bg-slate-800 transition-all shadow-[-5px_0_15px_rgba(0,0,0,0.4)]`}>
                                              <div className="flex justify-center items-center gap-0.5 opacity-40 group-hover:opacity-100">
                                                  {/* 주간보고 연결/열기 버튼 — execNo를 공통 키로 사용 */}
                                                  {(() => {
                                                      const wKey = p.execNo || rId;
                                                      const wLink = weeklyLinks[wKey];
                                                      const wActive = weeklyPanel?.projectId === wKey;
                                                      return wLink ? (
                                                          <>
                                                              <button
                                                                  onClick={(e) => { e.stopPropagation(); wActive ? setWeeklyPanel(null) : handleOpenWeeklyPanel(wKey); }}
                                                                  className={`p-1.5 rounded transition-colors ${wActive ? 'bg-indigo-500/30 text-indigo-300 ring-1 ring-indigo-400/60' : 'hover:bg-indigo-500/20 text-indigo-400 hover:text-indigo-300'}`}
                                                                  title={wActive ? '주간보고 닫기' : `주간보고 열기: ${wLink.fileName}`}
                                                              ><PanelRight size={14}/></button>
                                                              <button
                                                                  onClick={(e) => { e.stopPropagation(); handleWeeklyDownload(wKey); }}
                                                                  className="p-1.5 hover:bg-emerald-500/20 rounded text-slate-500 hover:text-emerald-400 transition-colors"
                                                                  title={`주간보고 다운로드: ${wLink.fileName}`}
                                                              ><Download size={13}/></button>
                                                              <button
                                                                  onClick={(e) => { e.stopPropagation(); handleWeeklyUnlink(wKey); }}
                                                                  className="p-1.5 hover:bg-rose-500/10 rounded text-slate-500 hover:text-rose-400 transition-colors"
                                                                  title="주간보고 연결 해제"
                                                              ><Link2Off size={13}/></button>
                                                          </>
                                                      ) : (
                                                          <button
                                                              onClick={(e) => { e.stopPropagation(); refreshWeeklyReportList(); setWeeklyLinkModal({ projectId: wKey, projectName: p.project }); }}
                                                              className="p-1.5 hover:bg-indigo-500/20 rounded text-slate-500 hover:text-indigo-400 transition-colors"
                                                              title="주간보고 연결"
                                                          ><Link size={13}/></button>
                                                      );
                                                  })()}
                                                  {!isPreviewMode ? (
                                                      <button onClick={(e) => { e.stopPropagation(); setConfirmRowSaveId(p.id); }} className={`p-1.5 rounded transition-colors ${hasPending ? 'text-blue-500 hover:bg-blue-500/20' : 'text-slate-400 hover:text-blue-500 hover:bg-blue-500/10'}`} title={hasPending ? '변경사항 저장' : '저장'}>{hasPending ? <Save size={14} strokeWidth={2.5}/> : <Save size={14}/>}</button>
                                                  ) : (
                                                      <button className="p-1.5 hover:bg-blue-500/10 rounded text-slate-400 hover:text-blue-500 transition-colors cursor-not-allowed opacity-50" title="미리보기에서는 저장할 수 없습니다"><Save size={14} /></button>
                                                  )}
                                              </div>
                                          </td>
                                      </tr>
                                  );
                              });
                          })()
                      )}
                  </tbody>
              </table>
          </div>
      );
  };

  const graphData = useMemo(() => {
      if (!graphProject) return null;
      const totalPoints = Math.trunc(safeNumber(graphProject.totalCommissioningPoints ?? graphProject.point));
      const md = graphProject.monthlyData || [];
      const mergedSelfPts = getMergedPointsByMonth(graphProject).self; // 통일 계산기 (A→C→B)

      // 시작일/완료일 기반 범위 (없으면 현재월 포함 12개월)
      const now = new Date();
      const nowMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      let startD, endD;
      if (graphProject.startDate) {
          const sd = new Date(graphProject.startDate);
          startD = new Date(sd.getFullYear(), sd.getMonth(), 1);
      } else {
          startD = new Date(now.getFullYear(), now.getMonth() - 11, 1);
      }
      if (graphProject.endDate) {
          const ed = new Date(graphProject.endDate);
          endD = new Date(ed.getFullYear(), ed.getMonth(), 1);
      } else {
          endD = nowMonth;
      }
      if (endD < startD) endD = new Date(startD); // 최소 1개월 보장

      // 표시용 날짜 문자열 (YYYY.MM)
      const fmtYM = (d) => `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}`;
      const startDateStr = graphProject.startDate ? fmtYM(startD) : null;
      const endDateStr   = graphProject.endDate   ? fmtYM(endD)   : null;

      // 타임라인 생성
      const timeline = [];
      let runningAcc = 0;
      let prevYyyy = null;
      let curr = new Date(startD);

      while (curr <= endD) {
          const yyyy = curr.getFullYear();
          const mm   = String(curr.getMonth() + 1).padStart(2, '0');
          const dStr = `${yyyy}-${mm}`;
          const showYear = prevYyyy === null || yyyy !== prevYyyy;
          prevYyyy = yyyy;

          const mdEntry = md.find(m => m.date === dStr);
          const monthPt = Math.trunc(safeNumber(mergedSelfPts[dStr] || 0)); // 통일 계산기와 동일 출처

          let progressPct = 0;
          if (mdEntry) {
              const applied = getAppliedKeys(graphProject);
              if (applied.length > 0) {
                  progressPct = Math.round(applied.reduce((s, k) => s + safeNumber(mdEntry[k]), 0) / applied.length);
              }
          }
          runningAcc += monthPt;
          timeline.push({ date: dStr, showYear, monthPt, accPt: runningAcc, progressPct, hasData: monthPt > 0 || !!mdEntry });
          curr.setMonth(curr.getMonth() + 1);
      }

      const totalAcc = runningAcc;
      const progressPercent = totalPoints > 0 ? Math.min(Math.round((totalAcc / totalPoints) * 100), 100) : 0;
      return { timeline, totalPoints, totalAcc, progressPercent, startDateStr, endDateStr };
  }, [graphProject, teamSettings, currentTeam, progressRecordsMap]);

  // ── 팀 전체 실적 그래프 데이터 ───────────────────────────────────────────
  const teamGraphData = useMemo(() => {
      if (!currentTeam) return null;
      const teamProjects = allProjects.filter(p => p.team === currentTeam && !p.isSub);

      // 항상 현재월 포함 12개월
      const now = new Date();
      const endD   = new Date(now.getFullYear(), now.getMonth(), 1);
      const startD = new Date(now.getFullYear(), now.getMonth() - 11, 1);

      const TARGET_STATUSES = ['진행', '금월완료', '신규', '미작업', '예상'];
      const STATUS_COLORS_GRAPH = {
          '진행':    '#1e7ac8',
          '금월완료':'#059669',
          '신규':    '#2563eb',
          '미작업':  '#6b7280',
          '예상':    '#d97706',
      };

      const timeline = [];
      let prevYyyy = null;
      let curr = new Date(startD);

      while (curr <= endD) {
          const yyyy = curr.getFullYear();
          const mm   = String(curr.getMonth() + 1).padStart(2, '0');
          const dStr = `${yyyy}-${mm}`;
          const showYear = prevYyyy === null || yyyy !== prevYyyy;
          prevYyyy = yyyy;

          // 각 프로젝트의 해당 월 진행현황 집계
          const counts = {};
          TARGET_STATUSES.forEach(s => { counts[s] = 0; });
          let totalCount = 0;

          teamProjects.forEach(p => {
              // 이월 규칙(A안): 해당 월 이하에서 상태가 기록된 가장 최근 기록 사용
              const withStatus = (p.monthlyData || []).filter(m => m.date <= dStr && m.progressStatus);
              const status = withStatus.length > 0
                  ? withStatus.reduce((a, b) => (a.date > b.date ? a : b)).progressStatus
                  : (p.progressStatus || '');
              if (TARGET_STATUSES.includes(status)) {
                  counts[status]++;
                  totalCount++;
              }
          });

          timeline.push({ date: dStr, showYear, counts, totalCount, totalProjects: teamProjects.length });
          curr.setMonth(curr.getMonth() + 1);
      }

      // Y축 최대값: 1년 중 단일 상태 최대값 + 여유 25% (최소 2 이상)
      const maxSingle = Math.max(...timeline.flatMap(t => TARGET_STATUSES.map(s => t.counts[s] || 0)), 1);
      const maxCount  = maxSingle + Math.max(Math.ceil(maxSingle * 0.25), 2);
      return { timeline, maxCount, targetStatuses: TARGET_STATUSES, statusColors: STATUS_COLORS_GRAPH };
  }, [allProjects, currentTeam, showTeamGraph]);

  // ── 주간보고 연결 모달: 새 파일 업로드 핸들러 ───────────────────────────
  const handleWeeklyLinkUpload = async (e) => {
      const file = e.target?.files?.[0];
      if (!file || !weeklyLinkModal) return;
      setWeeklyLinkUploading(true);
      try {
          const ab = await file.arrayBuffer();
          // LuckyExcel로 sheets 변환
          const sheets = await new Promise((resolve, reject) => {
              const run = (LE) => LE.transformExcelToLucky(
                  new Blob([ab]),
                  (exportJson) => resolve(exportJson?.sheets ?? []),
                  (err) => reject(new Error(String(err)))
              );
              if (window.LuckyExcel) {
                  run(window.LuckyExcel);
              } else {
                  const script = document.createElement('script');
                  script.src = 'https://cdn.jsdelivr.net/npm/luckyexcel/dist/luckyexcel.umd.js';
                  script.onload = () => run(window.LuckyExcel);
                  script.onerror = () => reject(new Error('LuckyExcel 로드 실패'));
                  document.body.appendChild(script);
              }
          });
          const newId = await wrIdbAdd(file.name, sheets, ab);
          const report = { id: newId, fileName: file.name, savedAt: new Date().toISOString() };
          await handleWeeklyLink(weeklyLinkModal.projectId, report);
      } catch (err) {
          alert('업로드 실패: ' + err.message);
      } finally {
          setWeeklyLinkUploading(false);
          if (weeklyLinkFileRef.current) weeklyLinkFileRef.current.value = '';
      }
  };

  // ── 주간보고 연결 선택 모달 ───────────────────────────────────────────────
  const WeeklyLinkModal = weeklyLinkModal && (
      <div style={{position:'fixed',inset:0,zIndex:600,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.4)',backdropFilter:'blur(3px)'}}>
          <input type="file" ref={weeklyLinkFileRef} accept=".xlsx,.xls"
              onChange={handleWeeklyLinkUpload} style={{display:'none'}}/>
          <div style={{background:'#ffffff',border:'1px solid #c8d4e0',borderRadius:8,width:500,maxWidth:'94vw',maxHeight:'82vh',display:'flex',flexDirection:'column',overflow:'hidden',boxShadow:'0 8px 24px rgba(0,0,0,0.15)'}}>

              {/* 헤더 */}
              <div style={{padding:'14px 20px 12px',borderBottom:'1px solid #d0d8e4',display:'flex',alignItems:'center',justifyContent:'space-between',background:'#f0f4f8'}}>
                  <div>
                      <div style={{color:'#1a1a1a',fontWeight:'bold',fontSize:15}}>주간보고 연결</div>
                      <div style={{color:'#666666',fontSize:12,marginTop:2}}>{weeklyLinkModal.projectName}</div>
                  </div>
                  <button onClick={() => setWeeklyLinkModal(null)}
                      style={{background:'none',border:'none',color:'#888888',cursor:'pointer',padding:4}}>
                      <XIcon size={18}/>
                  </button>
              </div>

              {/* 새 파일 업로드 버튼 */}
              <div style={{padding:'14px 20px',borderBottom:'1px solid #d8e0ea'}}>
                  <button
                      onClick={() => { if(weeklyLinkFileRef.current){ weeklyLinkFileRef.current.value=''; weeklyLinkFileRef.current.click(); } }}
                      disabled={weeklyLinkUploading}
                      style={{width:'100%',display:'flex',alignItems:'center',gap:12,padding:'12px 16px',
                          background:'#f0f8ff',border:'2px dashed #7bb8e8',borderRadius:6,
                          cursor:weeklyLinkUploading?'wait':'pointer',transition:'all 0.15s',
                          opacity:weeklyLinkUploading?0.7:1}}
                      onMouseEnter={e=>{ if(!weeklyLinkUploading){ e.currentTarget.style.borderColor='#1e7ac8'; e.currentTarget.style.background='#e0f0ff'; }}}
                      onMouseLeave={e=>{ e.currentTarget.style.borderColor='#7bb8e8'; e.currentTarget.style.background='#f0f8ff'; }}>
                      {weeklyLinkUploading
                          ? <RefreshCw size={20} color="#1e7ac8" style={{animation:'_wlSpin 0.8s linear infinite',flexShrink:0}}/>
                          : <Upload size={20} color="#1e7ac8" style={{flexShrink:0}}/>
                      }
                      <div style={{textAlign:'left'}}>
                          <div style={{color:'#1a6ba0',fontWeight:'700',fontSize:13}}>
                              {weeklyLinkUploading ? '업로드 중...' : '새 파일 업로드 후 바로 연결'}
                          </div>
                          <div style={{color:'#666666',fontSize:11,marginTop:2}}>.xlsx · .xls — 파일을 선택하면 즉시 연결됩니다</div>
                      </div>
                  </button>
              </div>

              {/* 기존 저장 목록 */}
              <div style={{padding:'10px 20px 6px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                  <span style={{fontSize:11,color:'#444444',fontWeight:'600'}}>
                      저장된 파일에서 선택 ({weeklyReportList.length}건)
                  </span>
                  <button onClick={refreshWeeklyReportList}
                      style={{background:'none',border:'none',cursor:'pointer',color:'#888888',
                          display:'flex',alignItems:'center',gap:4,fontSize:11,padding:'2px 6px'}}
                      onMouseEnter={e=>e.currentTarget.style.color='#1a1a1a'}
                      onMouseLeave={e=>e.currentTarget.style.color='#888888'}>
                      <RefreshCw size={11} style={weeklyListLoading?{animation:'_wlSpin 1s linear infinite'}:{}}/> 새로고침
                  </button>
              </div>
              <div style={{flex:1,overflowY:'auto',padding:'4px 20px 16px'}}>
                  {weeklyListLoading ? (
                      <div style={{textAlign:'center',color:'#888888',padding:'28px 0',display:'flex',alignItems:'center',justifyContent:'center',gap:8,fontSize:12}}>
                          <RefreshCw size={14} style={{animation:'_wlSpin 1s linear infinite'}}/> 로드 중...
                      </div>
                  ) : weeklyReportList.length === 0 ? (
                      <div style={{textAlign:'center',color:'#666666',padding:'24px 0',fontSize:12}}>
                          저장된 파일이 없습니다.<br/>위 버튼으로 새 파일을 업로드하세요.
                      </div>
                  ) : weeklyReportList.map(r => (
                      <div key={r.id}
                          style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',marginBottom:5,
                              background:'#f9fafb',border:'1px solid #d0d8e4',borderRadius:6,transition:'all 0.15s'}}>
                          <FileSpreadsheet size={15} style={{color:'#1e7ac8',flexShrink:0}}/>
                          <div style={{flex:1,minWidth:0,cursor:'pointer'}}
                              onClick={() => handleWeeklyLink(weeklyLinkModal.projectId, r)}
                              onMouseEnter={e=>{ e.currentTarget.parentElement.style.borderColor='#1e7ac8'; e.currentTarget.parentElement.style.background='#e8f4ff'; }}
                              onMouseLeave={e=>{ e.currentTarget.parentElement.style.borderColor='#d0d8e4'; e.currentTarget.parentElement.style.background='#f9fafb'; }}>
                              <div style={{color:'#1a1a1a',fontWeight:'600',fontSize:12,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.fileName}</div>
                              <div style={{color:'#888888',fontSize:10,marginTop:1}}>저장: {new Date(r.savedAt).toLocaleString()}</div>
                          </div>
                          <button
                              onClick={async (e) => {
                                  e.stopPropagation();
                                  if (!window.confirm(`"${r.fileName}" 을 목록에서 삭제할까요?`)) return;
                                  await wrIdbDelete(r.id);
                                  setWeeklyReportList(prev => prev.filter(x => x.id !== r.id));
                              }}
                              style={{background:'none',border:'none',color:'#aaaaaa',cursor:'pointer',padding:4,borderRadius:4,flexShrink:0,display:'flex'}}
                              title="목록에서 삭제"
                              onMouseEnter={e=>e.currentTarget.style.color='#dc2626'}
                              onMouseLeave={e=>e.currentTarget.style.color='#aaaaaa'}>
                              <Trash2 size={13}/>
                          </button>
                      </div>
                  ))}
              </div>
          </div>
          <style>{`@keyframes _wlSpin{to{transform:rotate(360deg)}}`}</style>
      </div>
  );


  // ── 패널 드래그 리사이즈 핸들러 ──────────────────────────────────────────
  const startPanelDrag = (e) => {
      e.preventDefault();
      const onMouseMove = (ev) => {
          const vw = window.innerWidth;
          const newW = Math.round(((vw - ev.clientX) / vw) * 100);
          setPanelWidth(Math.min(85, Math.max(25, newW)));
      };
      const onMouseUp = () => {
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
      };
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
  };

  // ── 주간보고 사이드 패널 ──────────────────────────────────────────────────
  const thSt = { padding:'4px 6px', color:'#1a1a1a', fontWeight:'bold', whiteSpace:'nowrap', fontSize:12, border:'none', borderBottom:'1px solid #c0c0c0', backgroundColor:'#e2e8f0' };
  const tdSt = { padding:'4px 6px', whiteSpace:'nowrap', fontSize:12, color:'#000000' };

  const handlePanelDateQuery = async () => {
      if (!weeklyPanel?.fileBlob) return;
      setPanelLoading(true);
      setPanelSummary(null);
      setCollapsedCats(new Set()); // 재조회 시 접힘 초기화
      try {
          const result = await parseWeeklyProgressSummary(weeklyPanel.fileBlob, panelDate1, panelDate2, panelDate3);
          setPanelSummary(result ?? false);
      } catch (e) { console.error('[WR] 파싱 오류:', e); setPanelSummary(false); }
      finally { setPanelLoading(false); }
  };

  // wKey 계산 (ProgressModal과 동일 형식)
  const panelWKeyOf = (isoDate) => {
      const d = new Date(isoDate);
      return `${d.getFullYear()}-${d.getMonth()+1}-${Math.ceil(d.getDate()/7)}`;
  };

  // 설비명 정규화: FFU(BFU)/BFU → FFU, SCADA → 전력
  const normalizeSystemName = (n) => {
      const s = String(n || '').trim();
      if (/FFU|BFU/i.test(s)) return 'FFU';
      if (/^SCADA$/i.test(s)) return '전력';
      return s;
  };

  // 서브 프로젝트명에서 시스템 키워드 추출
  const extractSystemKeyword = (name) => {
      const n = String(name || '').trim();
      if (/FFU|BFU/i.test(n)) return 'FFU';
      if (/SCADA/i.test(n)) return '전력';
      const KEYWORDS = ['공조', '대기', 'CDA', '전력', 'FFU', '안전', '화면', 'SCADA'];
      for (const kw of KEYWORDS) { if (n.includes(kw)) return kw; }
      return n;
  };

  const [panelApplying, setPanelApplying] = useState(false);
  const [panelApplyMsg, setPanelApplyMsg] = useState('');

  const handlePanelApply = async () => {
      if (!panelSummary || panelSummary._error || !weeklyPanel?.projectId) return;
      const execNo = weeklyPanel.projectId;
      if (!execNo) { setPanelApplyMsg('실행번호 없음'); setTimeout(() => setPanelApplyMsg(''), 3000); return; }
      const team = currentTeam;
      if (!team) { setPanelApplyMsg('팀 미선택'); setTimeout(() => setPanelApplyMsg(''), 3000); return; }

      const s = panelSummary;
      const currWKey = panelWKeyOf(panelDate3); // 금주만 저장 (지난주/누적은 기존 데이터 유지)

      const normalRows = (s.dataRows || []).filter(r => !r.isTotal);
      const totalRow   = (s.dataRows || []).find(r => r.isTotal);

      // 숫자 파싱 (raw count, 0도 허용)
      const parseNum = (v) => {
          if (!v || v.display === '-') return undefined;
          const n = parseFloat(String(v.display).replace(/[%,]/g, ''));
          return isNaN(n) ? undefined : n;
      };
      // 공정률 파싱 (pct 필드 우선)
      const parsePct = (v) => {
          if (!v || v.display === '-') return undefined;
          if (v.pct !== null && v.pct !== undefined) return v.pct;
          const n = parseFloat(String(v.display).replace(/[%,]/g, ''));
          return isNaN(n) ? undefined : n;
      };
      // 금주 수량: '금주' 직접값 → 없으면 Total - 지난주 계산
      const getWeeklyCount = (rowData, catName) => {
          const direct = parseNum(rowData[catName]?.['금주']);
          if (direct !== undefined && direct > 0) return direct;
          const total = parseNum(rowData[catName]?.['Total']);
          const prev  = parseNum(rowData[catName]?.['지난주']);
          if (total !== undefined && prev !== undefined) {
              const diff = Math.round(total - prev);
              return diff > 0 ? diff : undefined;
          }
          return undefined;
      };

      // 상위 프로젝트 + 서브항목 찾기 (시스템 매핑용)
      const parentProj = baseOrderedProjects.find(p =>
          !p.isSub && String(p.execNo || p['실행번호'] || '').trim() === String(execNo).trim()
      );
      const subProjects = parentProj
          ? baseOrderedProjects.filter(p => p.isSub && p.parentId === parentProj.id)
          : [];

      setPanelApplying(true);
      // A-4b: 장부 이름 = pid 우선 (연결된 프로젝트), 없으면 실행번호 (기존 호환)
      const panelDocKey = parentProj?.pid || execNo;
      console.log('[PanelApply] docKey=', panelDocKey, 'execNo=', execNo, 'team=', team, 'currWKey=', currWKey);
      try {
          const docRef = doc(db, 'artifacts', appId, 'public', 'data', `progressRecords_${team}`, panelDocKey);
          const snap = await getDoc(docRef);
          const existing = snap.exists() ? (snap.data().weekly || {}) : {};
          const merged = JSON.parse(JSON.stringify(existing)); // deep copy

          // ── 1. SIMPLE_ITEMS: 총계 컬럼의 '진척률' 값 사용 (금주 0이어도 누적율 반영) ──
          // '진척률' 없으면 'Total' 값 폴백
          const SIMPLE_CAT = {
              '도면입수': 'drawing',
              'I/O Map 입수': 'iomap', 'I/O Map입수': 'iomap',
              '화면개발': 'screen',
              '기준정보생성': 'baseinfo',
          };
          const srcRow = totalRow || normalRows[normalRows.length - 1];
          if (srcRow) {
              (s.catList || []).forEach(cat => {
                  const key = SIMPLE_CAT[cat.name];
                  if (!key) return;
                  // 진척률/진척율(두 표기) → 누적 → 금주 폴백
                  const catData = srcRow.data[cat.name] || {};
                  const pct = parsePct(catData['진척률'])
                           ?? parsePct(catData['진척율'])
                           ?? parsePct(catData['누적'])
                           ?? parsePct(catData['금주']);
                  if (pct !== undefined) {
                      if (!merged[key]) merged[key] = {};
                      merged[key][currWKey] = pct;
                  }
              });
          }

          // ── 2. 시운전: 각 시스템 컬럼별 금주 수량 → sub_i_commissioning ──────
          // 금주 행 없으면 Total - 지난주 자동 계산
          const selfCat = (s.catList || []).find(c => /자체시운전|^시운전$/.test(c.name));
          const intCat  = (s.catList || []).find(c => /통합시운전/.test(c.name));

          if (subProjects.length > 0 && (selfCat || intCat)) {
              // 컬럼 정규화 → 수량 합산 맵
              const colMap = {};
              normalRows.forEach(colRow => {
                  const norm = normalizeSystemName(colRow.name);
                  if (!colMap[norm]) colMap[norm] = { self: undefined, int: undefined };
                  if (selfCat) {
                      const v = getWeeklyCount(colRow.data, selfCat.name);
                      if (v !== undefined) colMap[norm].self = (colMap[norm].self || 0) + v;
                  }
                  if (intCat) {
                      const v = getWeeklyCount(colRow.data, intCat.name);
                      if (v !== undefined) colMap[norm].int = (colMap[norm].int || 0) + v;
                  }
              });

              subProjects.forEach((sub, idx) => {
                  const subKw = extractSystemKeyword(
                      sub.project || sub['공사명'] || sub['사업명'] || sub.content || ''
                  );
                  const data = colMap[subKw];
                  if (!data) return;

                  if (data.self !== undefined) {
                      const k = `sub_${idx}_commissioning`;
                      if (!merged[k]) merged[k] = {};
                      merged[k][currWKey] = data.self;
                  }
                  if (data.int !== undefined) {
                      const k = `sub_${idx}_intCommissioning`;
                      if (!merged[k]) merged[k] = {};
                      merged[k][currWKey] = data.int;
                  }
              });
          } else if (srcRow && (selfCat || intCat)) {
              // 서브 없음: 총계로 단순 저장
              if (selfCat) {
                  const v = getWeeklyCount(srcRow.data, selfCat.name);
                  if (v !== undefined) { if (!merged.commissioning) merged.commissioning = {}; merged.commissioning[currWKey] = v; }
              }
              if (intCat) {
                  const v = getWeeklyCount(srcRow.data, intCat.name);
                  if (v !== undefined) { if (!merged.intCommissioning) merged.intCommissioning = {}; merged.intCommissioning[currWKey] = v; }
              }
          }

          await setDoc(docRef, {
              docKey: panelDocKey, execNo,
              ...(parentProj?.pid ? { pid: parentProj.pid } : {}),
              weekly: merged,
              updatedAt: new Date().toISOString(),
          }, { merge: true });

          // 메모리 즉시 갱신 (표가 바로 새 숫자를 보게)
          setProgressRecordsMap(prev => ({ ...prev, [panelDocKey]: { ...(prev[panelDocKey] || {}), weekly: merged } }));

          const savedItems = Object.keys(merged).filter(k => merged[k][currWKey] !== undefined).length;
          console.log('[PanelApply] 저장된 키:', Object.keys(merged).filter(k => merged[k][currWKey] !== undefined), '/ 전체 merged 키:', Object.keys(merged));
          setPanelApplyMsg(`적용 완료 (${savedItems}개 항목)`);
      } catch (e) {
          console.error('[Panel Apply]', e);
          setPanelApplyMsg('적용 실패: ' + e.message);
      } finally {
          setPanelApplying(false);
          setTimeout(() => setPanelApplyMsg(''), 4000);
      }
  };

  const progressColor = (pct) => {
      if (pct === null || pct === undefined) return '#666666';
      if (pct >= 90) return '#059669';
      if (pct >= 70) return '#1d6ea0';
      if (pct >= 40) return '#b45309';
      return '#dc2626';
  };

  // 누적/합계 컬럼의 진척율로 대표 바 컬러
  const itemRepresentPct = (vals) => {
      if (!vals || vals.length === 0) return null;
      const acc = vals.find(v => /누적|합계/.test(v.label));
      if (acc?.percent != null) return acc.percent;
      return vals[vals.length - 1]?.percent ?? null;
  };

  const WeeklySidePanel = weeklyPanel && (
      <div style={{position:'fixed',top:0,right:0,bottom:0,width:`${panelWidth}vw`,minWidth:300,zIndex:500,
          display:'flex',flexDirection:'column',background:'#ffffff',borderLeft:'2px solid #c8d4e0',
          boxShadow:'-4px 0 16px rgba(0,0,0,0.12)',animation:'slideInRight 0.25s ease-out'}}>
          <style>{`@keyframes slideInRight{from{transform:translateX(100%)}to{transform:translateX(0)}}`}</style>
          {/* 드래그 핸들 */}
          <div onMouseDown={startPanelDrag}
              style={{position:'absolute',left:-4,top:0,bottom:0,width:8,cursor:'ew-resize',zIndex:10,
                  display:'flex',alignItems:'center',justifyContent:'center'}} title="드래그하여 크기 조절">
              <div style={{width:3,height:40,borderRadius:2,background:'#b0b8c8',opacity:0.9}}/>
          </div>

          {/* 패널 헤더 */}
          <div style={{padding:'10px 16px 12px',borderBottom:'1px solid #d0d8e4',background:'#f0f4f8',flexShrink:0}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                      <FileSpreadsheet size={15} style={{color:'#1e7ac8'}}/>
                      <div>
                          <div style={{color:'#1a1a1a',fontWeight:'bold',fontSize:13}}>주간 진척율 요약</div>
                          <div style={{color:'#666666',fontSize:10,marginTop:1,maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{weeklyPanel.fileName}</div>
                      </div>
                  </div>
                  <button onClick={() => { setWeeklyPanel(null); setPanelSummary(null); }}
                      style={{background:'none',border:'none',color:'#888888',cursor:'pointer',padding:4,borderRadius:6,display:'flex'}}
                      onMouseEnter={e=>e.currentTarget.style.color='#1a1a1a'}
                      onMouseLeave={e=>e.currentTarget.style.color='#888888'}>
                      <XIcon size={16}/>
                  </button>
              </div>
              {/* 기간 날짜 (전전월/전월/금월) */}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:4,marginBottom:4}}>
                  {[['이전', panelDate1, setPanelDate1], ['지난주', panelDate2, setPanelDate2], ['금주', panelDate3, setPanelDate3]].map(([label, val, setter]) => (
                      <div key={label}>
                          <div style={{color:'#666666',fontSize:9,marginBottom:2,textAlign:'center'}}>{label}</div>
                          <input type="date" value={val} onChange={e => setter(e.target.value)}
                              style={{background:'#ffffff',border:'1px solid #c0c0c0',borderRadius:4,
                                  color:'#000000',fontSize:10,padding:'3px 4px',colorScheme:'light',width:'100%'}}/>
                      </div>
                  ))}
              </div>
              <div style={{display:'flex',gap:6}}>
                  <button onClick={handlePanelDateQuery} disabled={panelLoading}
                      style={{flex:1,padding:'6px 0',background:'#1e7ac8',border:'none',borderRadius:4,
                          color:'white',fontSize:12,fontWeight:'bold',cursor:'pointer',
                          opacity: panelLoading ? 0.6 : 1, letterSpacing:'0.05em'}}>
                      {panelLoading ? '분석 중...' : '조회'}
                  </button>
                  <button onClick={handlePanelApply} disabled={panelApplying || !panelSummary || !!panelSummary?._error}
                      style={{flex:1,padding:'6px 0',background: panelApplying ? '#1a5c2a' : '#16a34a',border:'none',borderRadius:4,
                          color:'white',fontSize:12,fontWeight:'bold',cursor: (panelApplying || !panelSummary) ? 'default' : 'pointer',
                          opacity: (panelApplying || !panelSummary || panelSummary?._error) ? 0.5 : 1, letterSpacing:'0.05em'}}>
                      {panelApplying ? '적용 중...' : '적용'}
                  </button>
              </div>
              {panelApplyMsg && (
                  <div style={{marginTop:4,padding:'3px 8px',background: panelApplyMsg.includes('완료') ? '#dcfce7' : '#fee2e2',
                      borderRadius:4,fontSize:10,fontWeight:'bold',
                      color: panelApplyMsg.includes('완료') ? '#15803d' : '#dc2626',textAlign:'center'}}>
                      {panelApplyMsg}
                  </div>
              )}
          </div>

          {/* 결과 영역 */}
          <div style={{flex:1,overflowY:'auto',padding:'10px 14px',background:'#ffffff'}}>
              {panelLoading && (
                  <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:200,gap:12}}>
                      <div style={{width:28,height:28,border:'3px solid #c8d4e0',borderTopColor:'#1e7ac8',
                          borderRadius:'50%',animation:'_wrsSpin 0.8s linear infinite'}}/>
                      <span style={{color:'#666666',fontSize:12}}>엑셀 분석 중...</span>
                  </div>
              )}
              {!panelLoading && panelSummary === null && (
                  <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
                      height:180,gap:8,color:'#888888',textAlign:'center'}}>
                      <FileSpreadsheet size={32} style={{opacity:0.35,color:'#1e7ac8'}}/>
                      <div style={{fontSize:12,color:'#888888'}}>날짜 범위를 설정하고 조회하세요</div>
                  </div>
              )}
              {!panelLoading && panelSummary === false && (
                  <div style={{textAlign:'center',padding:24,color:'#888888',fontSize:12}}>
                      데이터를 찾을 수 없습니다.<br/>날짜 범위를 변경해 보세요.
                  </div>
              )}
              {!panelLoading && panelSummary?._error && (
                  <div style={{padding:12,background:'#fff5f5',border:'1px solid #fca5a5',borderRadius:4,fontSize:11}}>
                      <div style={{color:'#dc2626',fontWeight:'bold',marginBottom:6}}>파싱 실패 — 시트 구조 확인 필요</div>
                      <div style={{color:'#ef4444',marginBottom:8,whiteSpace:'pre-wrap'}}>{panelSummary._error}</div>
                      {panelSummary._preview && (
                          <div>
                              <div style={{color:'#888888',marginBottom:4,fontSize:10}}>시트 내용 (첫 10행):</div>
                              {panelSummary._preview.map((line, i) => (
                                  <div key={i} style={{color:'#444444',fontSize:10,marginBottom:2,wordBreak:'break-all'}}>{line}</div>
                              ))}
                          </div>
                      )}
                  </div>
              )}
              {!panelLoading && panelSummary && !panelSummary._error && (() => {
                  const s = panelSummary;
                  // 직접입력/자동수식 행 제외 + 중복 이름 제거 (Excel 반복 섹션 방지)
                  const SKIP_ROW = /직접입력|자동수식|자동계산|#REF/;
                  // 컬럼에서 제외할 공종명 (공종 요약행, SCR 등)
                  const SKIP_COL = /^(공종|SCR)$/i;
                  const seenNames = new Set();
                  const dataRows = s.dataRows.filter(r => {
                      if (SKIP_ROW.test(r.name)) return false;
                      if (SKIP_COL.test(r.name.trim())) return false;
                      if (seenNames.has(r.name)) return false;
                      seenNames.add(r.name);
                      return true;
                  });
                  // 공종(열): dataRows, 카테고리(행그룹): catList
                  const normalRows = dataRows.filter(r => !r.isTotal);
                  const totalRows  = dataRows.filter(r => r.isTotal);
                  const COL_W = 52;
                  const HDR_W = 90;
                  const CAT_COLORS = ['#dce8f5','#e8f5e8','#fff3cd','#fde8e8','#f0e8f8'];

                  const allCollapsed = s.catList.every(c => collapsedCats.has(c.name));
                  const toggleCat = (name) => setCollapsedCats(prev => {
                      const next = new Set(prev);
                      next.has(name) ? next.delete(name) : next.add(name);
                      return next;
                  });
                  const toggleAll = () => {
                      if (allCollapsed) setCollapsedCats(new Set());
                      else setCollapsedCats(new Set(s.catList.map(c => c.name)));
                  };

                  return (
                      <div style={{overflowX:'auto'}}>
                          {/* 시트명 + 전체접기/펴기 + 날짜 */}
                          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',
                              marginBottom:8,paddingBottom:5,borderBottom:'1px solid #c8d4e0'}}>
                              <div style={{display:'flex',alignItems:'center',gap:6}}>
                                  <span style={{color:'#1e4f8c',fontSize:11,fontWeight:'bold'}}>{s.sheetName}</span>
                                  <button onClick={toggleAll}
                                      style={{background:'#edf1f7',border:'1px solid #c0c8d4',borderRadius:4,
                                          color:'#444444',fontSize:9,padding:'2px 7px',cursor:'pointer',
                                          display:'flex',alignItems:'center',gap:3}}>
                                      {allCollapsed ? '▶ 전체 펴기' : '▼ 전체 접기'}
                                  </button>
                              </div>
                              <span style={{color:'#888888',fontSize:9}}>
                                  {s.date1 && s.date2 && s.date3
                                      ? `지난주: ${s.date1}~${s.date2}  금주: ${s.date2}~${s.date3}`
                                      : (s.date1 || '')}
                              </span>
                          </div>

                          <table style={{borderCollapse:'collapse',fontSize:10,tableLayout:'fixed',width:'100%',border:'1px solid #c8d0dc'}}>
                              <colgroup>
                                  <col style={{width:HDR_W}}/>
                                  {normalRows.map((_, i) => <col key={i} style={{width:COL_W}}/>)}
                                  {totalRows.map((_, i) => <col key={'t'+i} style={{width:COL_W}}/>)}
                              </colgroup>
                              <thead>
                                  <tr>
                                      <th style={{...thSt, textAlign:'left', position:'sticky', left:0, zIndex:2, padding:'4px 6px'}}>구분</th>
                                      {normalRows.map((row, ri) => (
                                          <th key={ri} style={{...thSt, textAlign:'center', color:'#1e4f8c', fontSize:11,
                                              borderLeft:'1px solid #c8d0dc', padding:'5px 4px',
                                              overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
                                              {row.name}
                                          </th>
                                      ))}
                                      {totalRows.map((row, ri) => (
                                          <th key={'t'+ri} style={{...thSt, textAlign:'center', color:'#7c5500', fontSize:11,
                                              borderLeft:'2px solid #b8b0a0', background:'#fff3e0', padding:'5px 4px',
                                              overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
                                              {row.name}
                                          </th>
                                      ))}
                                  </tr>
                              </thead>
                              <tbody>
                                  {s.catList.map((cat, ci) => {
                                      const catBg = CAT_COLORS[ci % CAT_COLORS.length];
                                      const isCollapsed = collapsedCats.has(cat.name);
                                      // 카테고리 전체가 데이터 없으면 숨김
                                      const allCols = [...normalRows, ...totalRows];
                                      const catAllDash = allCols.length > 0 && cat.subs.every(sub =>
                                          allCols.every(row => {
                                              const v = row.data[cat.name]?.[sub.sub];
                                              return !v || v.display === '-' || v.display === '';
                                          })
                                      );
                                      if (catAllDash) return null;
                                      return [
                                          // 카테고리 헤더 행 (클릭으로 접기/펴기)
                                          <tr key={`cat-${ci}`} onClick={() => toggleCat(cat.name)}
                                              style={{cursor:'pointer'}}>
                                              <td colSpan={normalRows.length + totalRows.length + 1}
                                                  style={{...tdSt, background:catBg, color:'#1a2a4a',
                                                      fontWeight:'bold', fontSize:12, padding:'5px 8px',
                                                      borderTop:'2px solid #b8c0cc', position:'sticky', left:0,
                                                      userSelect:'none', borderLeft:'3px solid #1e7ac8'}}>
                                                  <span style={{marginRight:5, fontSize:10, opacity:0.6}}>
                                                      {isCollapsed ? '▶' : '▼'}
                                                  </span>
                                                  {cat.name}
                                                  {isCollapsed && (
                                                      <span style={{fontSize:9,color:'#888888',marginLeft:8,fontWeight:'normal'}}>
                                                          ({cat.subs.length}개 항목 숨김)
                                                      </span>
                                                  )}
                                              </td>
                                          </tr>,
                                          // 서브메트릭 행 (접힘 시 렌더링 생략, 전체 '-'인 행 제외)
                                          ...(!isCollapsed ? cat.subs.map((sub, si) => {
                                              // 모든 데이터 컬럼이 '-'면 행 숨김
                                              const allCols = [...normalRows, ...totalRows];
                                              const allDash = sub.sub !== '금주' && allCols.length > 0 && allCols.every(row => {
                                                  const v = row.data[cat.name]?.[sub.sub];
                                                  return !v || v.display === '-' || v.display === '';
                                              });
                                              if (allDash) return null;
                                              const isKey = /최종|total|누적/i.test(sub.sub);
                                              return (
                                                  <tr key={`cat-${ci}-sub-${si}`}>
                                                      <td style={{...tdSt, background: catBg, color: isKey ? '#1a1a1a' : '#444444',
                                                          fontWeight: isKey ? 'bold' : 'normal',
                                                          fontSize:11, paddingLeft:10, position:'sticky', left:0,
                                                          borderTop:'1px solid #d4dce8', overflow:'hidden',
                                                          textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
                                                          └ {sub.sub}
                                                      </td>
                                                      {normalRows.map((row, ri) => {
                                                          const v = row.data[cat.name]?.[sub.sub] || { display: '-', pct: null };
                                                          return (
                                                              <td key={ri} style={{...tdSt,
                                                                  background: '#ffffff', textAlign:'right',
                                                                  fontWeight: isKey ? 'bold' : 'normal',
                                                                  color: progressColor(v.pct),
                                                                  borderLeft:'1px solid #d4dce8',
                                                                  borderTop:'1px solid #d4dce8',
                                                                  fontSize: isKey ? 13 : 11,
                                                              }}>{v.display}</td>
                                                          );
                                                      })}
                                                      {totalRows.map((row, ri) => {
                                                          const v = row.data[cat.name]?.[sub.sub] || { display: '-', pct: null };
                                                          return (
                                                              <td key={'t'+ri} style={{...tdSt,
                                                                  background: '#fff8ee', textAlign:'right',
                                                                  fontWeight:'bold',
                                                                  color: progressColor(v.pct),
                                                                  borderLeft:'2px solid #e8d8b0',
                                                                  borderTop:'1px solid #d4dce8',
                                                                  fontSize:13,
                                                              }}>{v.display}</td>
                                                          );
                                                      })}
                                                  </tr>
                                              );
                                          }) : [])
                                      ];
                                  })}
                              </tbody>
                          </table>
                      </div>
                  );
              })()}
          </div>
      </div>
  );

  // auth 상태 확인 중 — 스피너
  if (!isAuthReady) {
      return (
          <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#edf1f7' }}>
              <div style={{ width: '48px', height: '48px', border: '4px solid #1e7ac8', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
      );
  }

  // 이메일 링크 탭 → 창 닫기 안내
  if (isEmailLinkTab) {
      return (
          <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#edf1f7', padding: '16px' }}>
              <div style={{ width: '100%', maxWidth: '400px', backgroundColor: '#fff', border: '1px solid #c4ccd8', boxShadow: '0 4px 16px rgba(0,0,0,0.10)', padding: '32px 24px', textAlign: 'center' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#e8f5e9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: '16px', color: '#1a1a1a', marginBottom: '8px' }}>로그인이 완료됐습니다</div>
                  <div style={{ fontSize: '13px', color: '#666', marginBottom: '24px', lineHeight: '1.6' }}>
                      원래 로그인 창에서 PMS가 열렸습니다.<br />이 창은 닫으셔도 됩니다.
                  </div>
                  <button onClick={() => window.close()} style={{ padding: '10px 24px', backgroundColor: '#1e7ac8', color: '#fff', fontWeight: 700, fontSize: '13px', border: 'none', cursor: 'pointer' }}>
                      이 창 닫기
                  </button>
              </div>
          </div>
      );
  }

  // 미로그인 → 로그인 화면
  if (!user) {
      return (
          <LoginScreen
              onEmailLogin={handleEmailLogin}
              onGoogleLogin={handleGoogleLogin}
              onSharedLogin={handleSharedLogin}
              loading={loginLoading}
              error={loginError}
          />
      );
  }

  // 사용자 등록 확인 중 → 스피너
  if (!userCheckDone) {
      return (
          <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#edf1f7', gap: '12px' }}>
              <div style={{ width: '40px', height: '40px', border: '4px solid #1e7ac8', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              <div style={{ fontSize: 13, color: '#888' }}>접근 권한 확인 중...</div>
          </div>
      );
  }

  // 미등록 사용자 또는 비활성 계정 → 접근 불가 화면
  if (!registeredUser || registeredUser.active === false) {
      return (
          <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#edf1f7', padding: '16px' }}>
              <div style={{ width: '100%', maxWidth: '420px', backgroundColor: '#fff', border: '1px solid #c4ccd8', boxShadow: '0 4px 16px rgba(0,0,0,0.10)', padding: '32px 24px', textAlign: 'center' }}>
                  <div style={{ width: '52px', height: '52px', borderRadius: '50%', backgroundColor: '#fff5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#dc2626" strokeWidth="2"/><path d="M12 7v6M12 17h.01" stroke="#dc2626" strokeWidth="2" strokeLinecap="round"/></svg>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: '16px', color: '#1a1a1a', marginBottom: '8px' }}>
                      {!registeredUser ? '접근 권한이 없습니다' : '계정이 비활성화됐습니다'}
                  </div>
                  <div style={{ fontSize: '13px', color: '#666', marginBottom: '8px', lineHeight: 1.7 }}>
                      {!registeredUser
                          ? <>로그인 계정(<b style={{ color: '#1e7ac8' }}>{user?.email}</b>)이<br />PMS에 등록되지 않았습니다.<br />관리자에게 등록을 요청해 주세요.</>
                          : <>계정이 비활성화 상태입니다.<br />관리자에게 문의해 주세요.</>
                      }
                  </div>
                  <div style={{ fontSize: '11px', color: '#aaa', marginBottom: '20px' }}>관리자: PMS 사용자 관리 화면에서 등록</div>
                  <button onClick={handleSignOut}
                      style={{ padding: '9px 20px', backgroundColor: '#1e7ac8', color: '#fff', fontWeight: 700, fontSize: '13px', border: 'none', cursor: 'pointer' }}>
                      로그아웃
                  </button>
              </div>
          </div>
      );
  }

  // 사용자 관리 화면 (관리자 전용)
  if (currentMode === 'userManagement') {
      return (
          <UserManagementScreen
              db={db}
              appId={appId}
              currentUserEmail={user?.email}
              registeredUser={registeredUser}
              onCreateSharedAccount={handleCreateSharedAccount}
              onUpdateSharedPassword={handleUpdateSharedPassword}
              onBack={() => setCurrentMode(currentTeam ? 'pms' : null)}
          />
      );
  }

  return (
      <>
          {WeeklyLinkModal}
          {WeeklySidePanel}

          {/* 도움말 모달 */}
          {isHelpOpen && <HelpModal onClose={() => setIsHelpOpen(false)} />}

          {/* 로그아웃 확인 */}
          {confirmSignOutOpen && (
              <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/80 p-4">
                  <div style={{ backgroundColor:'#fff', border:'1.5px solid #c4ccd8', padding:'28px 32px', maxWidth:'320px', width:'100%', textAlign:'center', boxShadow:'0 4px 24px rgba(0,0,0,0.12)' }}>
                      <LogOut size={28} style={{ color:'#dc2626', margin:'0 auto 12px' }}/>
                      <p style={{ fontWeight:800, fontSize:'15px', color:'#1a1a1a', marginBottom:'6px' }}>로그아웃</p>
                      <p style={{ fontSize:'12px', color:'#666', marginBottom:'20px' }}>로그아웃하시겠습니까?</p>
                      <div style={{ display:'flex', gap:'10px' }}>
                          <button onClick={() => setConfirmSignOutOpen(false)}
                              style={{ flex:1, padding:'9px', backgroundColor:'#f1f5f9', border:'1px solid #c4ccd8', fontSize:'13px', fontWeight:700, color:'#555', cursor:'pointer' }}>
                              취소
                          </button>
                          <button onClick={() => { setConfirmSignOutOpen(false); handleSignOut(); }}
                              style={{ flex:1, padding:'9px', backgroundColor:'#dc2626', border:'none', fontSize:'13px', fontWeight:700, color:'#fff', cursor:'pointer' }}>
                              로그아웃
                          </button>
                      </div>
                  </div>
              </div>
          )}

          {isDbLoading && (
              <div className="fixed inset-0 z-[999] flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
                  <div className="w-16 h-16 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mb-6 shadow-[0_0_15px_rgba(6,182,212,0.5)]"></div>
                  <h2 className="text-2xl font-bold text-white drop-shadow-md">클라우드 DB 연동 및 처리 중...</h2>
              </div>
          )}

          {authError ? (
              <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white p-6">
                  <div className="bg-slate-900 border border-rose-500/30 p-8 rounded-3xl max-w-lg w-full text-center shadow-2xl">
                      <AlertTriangle className="w-16 h-16 text-rose-500 mx-auto mb-4 opacity-80" />
                      <h2 className="text-xl font-bold text-rose-400 mb-4">{authError}</h2>
                      {dbErrorDetail && (
                          <div className="bg-rose-950/50 p-4 rounded-xl mb-6 text-rose-300 text-sm font-mono border border-rose-900/50 text-left overflow-x-auto">
                              <b>Error Code:</b><br/>{dbErrorDetail}
                          </div>
                      )}
                      <div className="text-left bg-slate-950 p-4 rounded-xl text-xs text-slate-400 space-y-2">
                          <p>💡 <b>해결 팁:</b></p>
                          <p>1. 브라우저에서 <b>새로고침(F5)</b>을 시도해 보세요.</p>
                          <p>2. 만약 해결되지 않는다면 서버 설정을 다시 확인해 주세요.</p>
                      </div>
                  </div>
              </div>
          ) : !currentMode || (!currentTeam && currentMode !== 'estimate' && currentMode !== 'weeklyReport' && currentMode !== 'weeklyInput' && currentMode !== 'weeklySummary') ? (
              <div className="h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-3 relative overflow-hidden">

                  {/* 팀 선택 화면 상단 우측 — 사용자 정보 + 관리 버튼 */}
                  <div style={{ position: 'absolute', top: 12, right: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {registeredUser?.role === 'admin' && (
                          <button onClick={() => setCurrentMode('userManagement')}
                              className="flex items-center gap-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 px-2.5 py-1.5 transition-all text-xs font-bold text-slate-300 hover:text-white">
                              <Users size={13} /> 사용자 관리
                          </button>
                      )}
                      <div className="flex items-center gap-1 border border-slate-700 bg-slate-900" style={{ height: 30 }}>
                          <span className="px-2.5 text-xs font-semibold text-slate-400 max-w-[140px] truncate" title={user?.email || ''}>
                              {registeredUser?.displayName || user?.displayName || user?.email?.split('@')[0] || '사용자'}
                          </span>
                          <button onClick={() => setConfirmSignOutOpen(true)}
                              className="flex items-center gap-1 px-2 border-l border-slate-700 hover:bg-rose-900/30 text-slate-400 hover:text-rose-400 transition-all text-xs font-bold h-full"
                              title="로그아웃" style={{ height: '100%' }}>
                              <LogOut size={12} />
                          </button>
                      </div>
                  </div>

                  <div className="max-w-5xl w-full animate-in">
                      <div className="text-center mb-3">
                          <div className="inline-flex items-center justify-center gap-2 mb-1">
                              <div className="p-2 bg-slate-900 rounded-xl border border-slate-800">
                                  <LayoutGrid size={22} className="text-cyan-400" />
                              </div>
                              <h1 className="text-2xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400">
                                  통합 프로젝트 관리 플랫폼
                              </h1>
                              <span className="text-xs px-2 py-0.5 bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 font-mono font-bold">v1.0</span>
                          </div>
                          <p className="text-slate-500 text-xs">접속하실 부서를 선택해 주세요.</p>
                      </div>
                      
                      {/* ── 패스워드 모달 ── */}
                      {showEstimateModal && (
                          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => { setShowEstimateModal(false); setEstimatePwInput(''); setEstimatePwError(false); }}>
                              <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-8 w-full max-w-sm animate-in fade-in zoom-in" onClick={e => e.stopPropagation()}>
                                  <div className="flex items-center gap-3 mb-6">
                                      <div className="p-2.5 bg-amber-500/20 rounded-xl border border-amber-500/30">
                                          <Target size={20} className="text-amber-400" />
                                      </div>
                                      <div>
                                          <h3 className="text-white font-bold text-lg">견적 관리</h3>
                                          <p className="text-slate-500 text-xs">접근 권한이 필요합니다</p>
                                      </div>
                                  </div>
                                  <input
                                      type="password"
                                      placeholder="패스워드 입력"
                                      value={estimatePwInput}
                                      onChange={e => { setEstimatePwInput(e.target.value); setEstimatePwError(false); }}
                                      onKeyDown={e => { if (e.key === 'Enter') handleEstimateLogin(); }}
                                      autoFocus
                                      className={`w-full bg-slate-800 border ${estimatePwError ? 'border-rose-500' : 'border-slate-700'} rounded-xl px-4 py-3 text-white outline-none focus:border-amber-500 transition-all text-sm font-mono tracking-widest mb-2`}
                                  />
                                  {estimatePwError && <p className="text-rose-400 text-xs mb-1 font-bold">패스워드가 올바르지 않습니다.</p>}
                                  <label className="flex items-center gap-2 cursor-pointer mt-3 mb-1 select-none">
                                      <input
                                          type="checkbox"
                                          checked={estimateRememberPw}
                                          onChange={e => setEstimateRememberPw(e.target.checked)}
                                          className="w-4 h-4 accent-amber-500 rounded"
                                      />
                                      <span className="text-slate-400 text-xs font-medium">이 기기에서 비밀번호 기억</span>
                                  </label>
                                  <div className="flex gap-2 mt-3">
                                      <button onClick={() => { setShowEstimateModal(false); setEstimatePwInput(''); setEstimatePwError(false); }} className="flex-1 px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 text-sm font-bold hover:bg-slate-700 transition-all">취소</button>
                                      <button onClick={handleEstimateLogin} className="flex-1 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-sm font-bold transition-all">확인</button>
                                  </div>
                              </div>
                          </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {[
                              { id: '기술1팀', title: '기술1팀', desc: '설비 유지보수 및 하드웨어 인프라 제어', icon: <Wrench className="w-6 h-6 text-indigo-400" /> },
                              { id: '기술2팀', title: '기술2팀', desc: '자동제어 시스템 및 통합 시운전 관리', icon: <Cpu className="w-6 h-6 text-cyan-400" />, hasSubMenu: true },
                              { id: '기술3팀', title: '기술3팀', desc: '네트워크 망 및 현장 모니터링 시스템', icon: <Monitor className="w-6 h-6 text-emerald-400" /> },
                              { id: 'Software팀', title: 'Software팀', desc: '사내 포털 및 MES 데이터베이스 개발', icon: <TerminalSquare className="w-6 h-6 text-purple-400" /> }
                          ].map(card => {
                              const handleCardClick = () => {
                                  if (!card.hasSubMenu) {
                                      setCurrentTeam(card.id);
                                      setCurrentMode('pms');
                                      const defaults = teamSettings[card.id] || initialTeamSettings[card.id];
                                      const saved = defaults?.defaultActiveStatuses || [];
                                      setActiveFilterStatuses(new Set(saved));
                                      setActiveFilterFactories(new Set(defaults?.defaultActiveFactories || []));
                                      setSearchTerm('');
                                  }
                              };

                              return (
                                  <div key={card.id} className={`team-card flex flex-col text-left bg-slate-900/50 border ${card.hasSubMenu ? 'border-cyan-500/50 shadow-[0_0_20px_rgba(6,182,212,0.1)]' : 'border-slate-800 hover:bg-slate-800 hover:-translate-y-0.5'} rounded-xl transition-all overflow-hidden relative group`}>

                                      {/* 상단 (헤더) 영역 */}
                                      <div className={`px-4 py-3 relative z-10 flex items-center gap-3 ${!card.hasSubMenu ? 'cursor-pointer' : ''}`} onClick={handleCardClick}>
                                          {card.icon}
                                          <div>
                                              <h2 className="text-base font-bold text-white group-hover:text-cyan-400 transition-colors leading-tight">{card.title}</h2>
                                              <p className="text-slate-500 text-xs">{card.desc}</p>
                                          </div>
                                      </div>

                                      {/* 하위 메뉴 영역 (hasSubMenu 카드는 항상 표시) */}
                                      {card.hasSubMenu && (
                                          <div className="border-t border-cyan-500/30 bg-slate-900/80">

                                              {/* 1. 월간 업무 보고 */}
                                              <button onClick={() => {
                                                  setCurrentTeam(card.id);
                                                  setCurrentMode('pms');
                                                  const defaults = teamSettings[card.id] || initialTeamSettings[card.id];
                                                  const saved = defaults?.defaultActiveStatuses || [];
                                                  setActiveFilterStatuses(new Set(saved));
                                                  setActiveFilterFactories(new Set(defaults?.defaultActiveFactories || []));
                                                  setSearchTerm('');
                                              }} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-800/80 border-b border-slate-800/50 transition-colors text-left group/btn">
                                                  <div className="p-1.5 bg-slate-800 rounded-lg group-hover/btn:bg-cyan-500/20 transition-colors border border-slate-700 group-hover/btn:border-cyan-500/30">
                                                      <FileText size={14} className="text-slate-400 group-hover/btn:text-cyan-400 transition-colors" />
                                                  </div>
                                                  <div className="flex-1">
                                                      <div className="text-white font-bold text-sm group-hover/btn:text-cyan-400 transition-colors">월간 업무 보고</div>
                                                      <div className="text-slate-500 text-xs">시운전 실적 및 공정률 월간 현황 관리</div>
                                                  </div>
                                                  <ChevronRight size={14} className="text-slate-600 group-hover/btn:text-cyan-400 transition-colors" />
                                              </button>

                                              {/* 2. 프로젝트 List 관리 */}
                                              <button onClick={() => {
                                                  setCurrentTeam(card.id);
                                                  setCurrentMode('projectList');
                                              }} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-800/80 transition-colors text-left group/btn">
                                                  <div className="p-1.5 bg-slate-800 rounded-lg group-hover/btn:bg-emerald-500/20 transition-colors border border-slate-700 group-hover/btn:border-emerald-500/30">
                                                      <ListChecks size={14} className="text-slate-400 group-hover/btn:text-emerald-400 transition-colors" />
                                                  </div>
                                                  <div className="flex-1">
                                                      <div className="text-white font-bold text-sm group-hover/btn:text-emerald-400 transition-colors">프로젝트 List 관리</div>
                                                      <div className="text-slate-500 text-xs">팀 전체 프로젝트 목록 엑셀 기반 관리</div>
                                                  </div>
                                                  <ChevronRight size={14} className="text-slate-600 group-hover/btn:text-emerald-400 transition-colors" />
                                              </button>

                                          </div>
                                      )}
                                  </div>
                              );
                          })}
                      </div>

                      {/* ── 하단 메뉴 (주간보고 3종 + 견적) ── */}
                      <div className="mt-2 flex flex-col gap-1.5">
                          <div
                              onClick={() => setCurrentMode('weeklyReport')}
                              className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-900/50 border border-slate-800 hover:border-indigo-500/50 hover:bg-indigo-950/20 rounded-xl cursor-pointer transition-all group"
                          >
                              <div className="flex items-center gap-3">
                                  <div className="p-1.5 bg-indigo-500/10 rounded-lg border border-indigo-500/20 group-hover:bg-indigo-500/20 transition-colors">
                                      <FileSpreadsheet size={15} className="text-indigo-400"/>
                                  </div>
                                  <div>
                                      <div className="text-white font-bold text-sm group-hover:text-indigo-300 transition-colors flex items-center gap-1.5">
                                          주간 보고 뷰어
                                          <span className="text-[10px] px-1.5 py-0.5 bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 font-mono">XLSX</span>
                                      </div>
                                      <div className="text-slate-500 text-xs">업로드 → 저장 → 목록에서 선택해서 바로 열기</div>
                                  </div>
                              </div>
                              <ChevronRight size={14} className="text-slate-600 group-hover:text-indigo-400 transition-colors"/>
                          </div>

                          <div
                              onClick={() => setCurrentMode('weeklyInput')}
                              className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-900/50 border border-slate-800 hover:border-emerald-500/50 hover:bg-emerald-950/20 rounded-xl cursor-pointer transition-all group"
                          >
                              <div className="flex items-center gap-3">
                                  <div className="p-1.5 bg-emerald-500/10 rounded-lg border border-emerald-500/20 group-hover:bg-emerald-500/20 transition-colors">
                                      <FileSpreadsheet size={15} className="text-emerald-400"/>
                                  </div>
                                  <div>
                                      <div className="text-white font-bold text-sm group-hover:text-emerald-300 transition-colors flex items-center gap-1.5">
                                          주간 보고 입력
                                          <span className="text-[10px] px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 font-mono">태그</span>
                                      </div>
                                      <div className="text-slate-500 text-xs">엑셀 템플릿 분석 → 웹에서 주차별 날짜 입력 → 공정율 자동 계산</div>
                                  </div>
                              </div>
                              <ChevronRight size={14} className="text-slate-600 group-hover:text-emerald-400 transition-colors"/>
                          </div>

                          <div
                              onClick={() => setCurrentMode('weeklySummary')}
                              className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-900/50 border border-slate-800 hover:border-violet-500/50 hover:bg-violet-950/20 rounded-xl cursor-pointer transition-all group"
                          >
                              <div className="flex items-center gap-3">
                                  <div className="p-1.5 bg-violet-500/10 rounded-lg border border-violet-500/20 group-hover:bg-violet-500/20 transition-colors">
                                      <FileSpreadsheet size={15} className="text-violet-400"/>
                                  </div>
                                  <div>
                                      <div className="text-white font-bold text-sm group-hover:text-violet-300 transition-colors flex items-center gap-1.5">
                                          주간보고 요약
                                          <span className="text-[10px] px-1.5 py-0.5 bg-violet-500/20 text-violet-400 border border-violet-500/20 font-mono">NEW</span>
                                      </div>
                                      <div className="text-slate-500 text-xs">프로젝트별 주차 실적·이슈·계획 입력 → 담당보고·임원보고 자동화</div>
                                  </div>
                              </div>
                              <ChevronRight size={14} className="text-slate-600 group-hover:text-violet-400 transition-colors"/>
                          </div>

                          <div className="flex justify-center pt-1">
                              <button
                                  onClick={() => { setEstimatePwInput(''); setEstimatePwError(false); setShowEstimateModal(true); }}
                                  className="flex items-center gap-1.5 px-3 py-1 border border-slate-800 bg-slate-900/50 text-slate-600 hover:text-amber-400 hover:border-amber-500/30 hover:bg-amber-500/5 text-xs font-bold transition-all"
                              >
                                  <Target size={11} /> 견적
                              </button>
                          </div>
                      </div>
                  </div>
              </div>
          ) : currentMode === 'weeklyReport' ? (
              <WeeklyReportScreen onBack={() => setCurrentMode(null)} />
          ) : currentMode === 'weeklyInput' ? (
              <WeeklyInputScreen db={db} teamId={currentTeam} onBack={() => setCurrentMode(null)} />
          ) : currentMode === 'weeklySummary' ? (
              <WeeklySummaryScreen db={db} teamId={currentTeam} onBack={() => setCurrentMode(null)} />
          ) : currentMode === 'estimate' ? (
              <EstimateScreen onBack={() => setCurrentMode(null)} />
          ) : currentMode === 'projectList' ? (
              <ProjectListScreen
                  currentTeam={currentTeam}
                  user={user}
                  onBack={() => { setCurrentTeam(null); setCurrentMode(null); }}
                  onGoToPms={(execNo) => {
                      setCurrentMode('pms');
                      if (execNo) setHighlightExecNoInReport(String(execNo));
                      setHighlightExecNoInList(null);
                  }}
                  highlightExecNo={highlightExecNoInList}
                  allProjects={allProjects}
                  baseDate={baseDate}
                  onApplyProgressByPid={applyProgressByPid}
                  onProgressSaved={handleProgressSaved}
                  onShowGraph={(p) => setGraphProject(p)}
                  weeklyLinks={weeklyLinks}
                  weeklyPanel={weeklyPanel}
                  setWeeklyPanel={setWeeklyPanel}
                  onOpenWeeklyPanel={handleOpenWeeklyPanel}
                  onWeeklyUnlink={handleWeeklyUnlink}
                  onWeeklyDownload={handleWeeklyDownload}
                  onOpenWeeklyLinkModal={(projectId, projectName) => { refreshWeeklyReportList(); setWeeklyLinkModal({ projectId, projectName }); }}
              />
          ) : currentMode === '__REMOVED_INLINE__' ? (
              <div className="h-screen bg-slate-950 text-slate-100 font-sans p-4 md:p-6 flex flex-col animate-in overflow-hidden relative">
                  <input
                      type="file"
                      ref={dynamicFileInputRef}
                      onChange={handleDynamicFileUpload}
                      accept=".xlsx, .xls, .csv"
                      className="hidden"
                  />
                  
                  <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0 relative z-50 mb-4 bg-slate-900/50 p-4 rounded-2xl border border-slate-800">
                      <div className="flex items-center gap-4">
                          <div className="p-3 bg-amber-500/20 rounded-xl border border-amber-500/30 text-amber-400">
                              <FileText size={24}/>
                          </div>
                          <div>
                              <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
                                  {currentTeam} 프로젝트 리스트
                              </h1>
                              <p className="text-slate-400 text-xs mt-1">자유 양식의 엑셀 파일을 업로드하여 팀의 전체 목록을 관리합니다.</p>
                          </div>
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-2">
                          <button onClick={() => dynamicFileInputRef.current?.click()} className="flex items-center gap-2 px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600 border border-emerald-500/30 text-emerald-400 hover:text-white rounded-xl font-bold transition-all text-sm">
                              <Upload size={16} /> 엑셀 파일 로드
                          </button>
                          <button onClick={() => { setCurrentTeam(null); setCurrentMode(null); }} className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold transition-all border border-slate-700 text-sm">
                              <LogOut size={16} /> 뒤로 가기
                          </button>
                      </div>
                  </header>

                  {/* ★ 임시 적용 상태일 때 보여줄 노란색 경고 배너 ★ */}
                  {isDynamicUnsaved && (
                      <div className="bg-amber-900/20 border border-amber-500/50 p-4 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shrink-0 shadow-lg shadow-amber-900/10 animate-in relative z-20 mb-4">
                          <div className="flex items-center gap-3">
                              <div className="p-2 bg-amber-500/20 rounded-xl border border-amber-500/30">
                                  <AlertTriangle className="text-amber-400" size={24} />
                              </div>
                              <div>
                                  <h4 className="text-amber-400 font-bold text-sm">임시 데이터 확인 중</h4>
                                  <p className="text-amber-200/70 text-xs mt-0.5">화면에 임시로 반영된 엑셀 데이터가 있습니다. 내용을 검토한 후 DB에 확정 저장하세요.</p>
                              </div>
                          </div>
                          <div className="flex items-center gap-3 w-full md:w-auto">
                              <button onClick={() => { 
                                  setDynamicExcelCols(originalDynamicCols);
                                  setDynamicExcelData(originalDynamicData);
                                  setIsDynamicUnsaved(false);
                                  isDynamicUnsavedRef.current = false;
                              }} className="flex-1 md:flex-none px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold text-sm transition-colors border border-slate-700">전체 취소</button>
                              <button onClick={handleSaveDynamicData} className="flex-1 md:flex-none px-6 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold text-sm shadow-md transition-colors flex items-center justify-center gap-2"><Save size={16}/> DB에 모두 확정 저장</button>
                          </div>
                      </div>
                  )}

                  <div className="bg-slate-900/40 border border-slate-800 rounded-2xl overflow-hidden backdrop-blur-sm shadow-xl flex-1 flex flex-col z-0 relative min-h-0">
                      {dynamicExcelCols.length === 0 ? (
                          <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-slate-700/50 m-4 rounded-3xl">
                              <FileSpreadsheet className="w-16 h-16 text-slate-600 mb-4" />
                              <h2 className="text-xl font-bold text-slate-400 mb-2">업로드된 프로젝트 리스트가 없습니다</h2>
                              <p className="text-slate-500 font-medium text-sm">상단의 [엑셀 파일 로드] 버튼을 눌러 목록이 담긴 엑셀을 업로드하세요.</p>
                          </div>
                      ) : (
                          <div className="overflow-auto flex-1 custom-scrollbar bg-slate-950/50 relative">
                              <table className="w-full text-left border-collapse table-fixed min-w-[max-content]">
                                  <thead className="sticky top-0 bg-slate-900 shadow-md z-40">
                                      <tr className="text-slate-500 text-[11px] font-bold uppercase tracking-widest border-b border-slate-800 whitespace-nowrap">
                                          <th className="group/th px-4 py-3 relative border-b border-slate-800 transition-colors text-center text-slate-500 w-16">
                                              <div className="flex items-center justify-center w-full h-full relative group/inner">No.</div>
                                          </th>
                                          {dynamicExcelCols.map(col => (
                                              <th key={col.key} className="group/th px-4 py-3 relative border-b border-slate-800 transition-colors text-left text-slate-500 min-w-[120px]">
                                                  <div className="flex items-center justify-between w-full h-full relative group/inner">
                                                      <div className="truncate pr-2 flex-1">{col.label}</div>
                                                  </div>
                                              </th>
                                          ))}
                                      </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-800/50">
                                      {dynamicExcelData.map((row, idx) => (
                                          <tr key={row.id} className="group transition-all text-sm whitespace-nowrap hover:bg-white/5 text-slate-300 font-medium">
                                              <td className="px-4 py-3 text-center border-r border-slate-800/20 text-slate-500 font-mono text-[11px] bg-slate-900/30">{idx + 1}</td>
                                              {dynamicExcelCols.map(col => (
                                                  <td key={col.key} className="px-4 py-3 text-left border-r border-slate-800/20 group-hover:bg-slate-800 transition-colors">
                                                      {dynamicEditingInline?.id === row.id && dynamicEditingInline?.field === col.key ? (
                                                          <input
                                                              autoFocus
                                                              value={dynamicEditingInline.value}
                                                              onChange={(e) => setDynamicEditingInline({...dynamicEditingInline, value: e.target.value})}
                                                              onBlur={() => handleDynamicInlineSave(row.id, col.key, dynamicEditingInline.value)}
                                                              onKeyDown={(e) => {
                                                                  if(e.key === 'Enter') handleDynamicInlineSave(row.id, col.key, dynamicEditingInline.value);
                                                                  if(e.key === 'Escape') setDynamicEditingInline(null);
                                                              }}
                                                              className="w-full bg-slate-950 text-slate-200 px-2 py-1 rounded outline-none border border-cyan-500 text-xs focus:ring-1 focus:ring-cyan-500 shadow-lg min-w-[100px]"
                                                          />
                                                      ) : (
                                                          <div 
                                                              className="group/inline flex items-center justify-between w-full h-full cursor-pointer hover:bg-slate-800/80 rounded px-1 -mx-1 transition-colors min-h-[24px]"
                                                              onClick={(e) => {
                                                                  e.stopPropagation();
                                                                  setDynamicEditingInline({ id: row.id, field: col.key, value: row[col.key] || '' });
                                                              }}
                                                              title="클릭하여 내용 수정 (Enter 저장)"
                                                          >
                                                              <span className="truncate flex-1 text-slate-300 max-w-[250px]">{row[col.key] || '-'}</span>
                                                          </div>
                                                      )}
                                                  </td>
                                              ))}
                                          </tr>
                                      ))}
                                  </tbody>
                              </table>
                          </div>
                      )}
                  </div>
              </div>
          ) : (
              <div className="h-screen bg-slate-950 text-slate-100 font-sans p-4 md:p-6 flex flex-col animate-in overflow-hidden relative" style={weeklyPanel ? {paddingRight:`calc(${panelWidth}vw + 16px)`} : {}}>

                  {/* ★ 디버그 시스템 모니터 패널 (화면 하단) ★ */}
                  {showDebug && (
                      <div className="absolute bottom-4 right-4 w-[450px] max-h-[350px] bg-slate-950/95 border border-slate-700/80 rounded-2xl shadow-2xl z-[99999] flex flex-col overflow-hidden backdrop-blur-md animate-in fade-in slide-in-from-bottom-10">
                          <div className="flex justify-between items-center p-3 bg-slate-900 border-b border-slate-800 cursor-move">
                              <span className="text-emerald-400 font-mono text-[11px] font-black flex items-center gap-2">
                                  <TerminalSquare size={14} /> SYSTEM DEBUG MONITOR
                              </span>
                              <div className="flex items-center gap-3">
                                  <button onClick={() => setLogs([])} className="text-slate-500 hover:text-white text-[10px] font-bold tracking-widest uppercase transition-colors">Clear</button>
                                  <button onClick={() => setShowDebug(false)} className="text-slate-500 hover:text-white transition-colors bg-slate-800 p-1 rounded-md"><X size={14}/></button>
                              </div>
                          </div>
                          <div className="flex-1 overflow-y-auto p-4 font-mono text-[11px] text-slate-300 space-y-1.5 custom-scrollbar break-all">
                              {logs.length === 0 ? (
                                  <span className="text-slate-600 italic">로그 기록 대기 중... 엑셀을 업로드해 보세요.</span>
                              ) : (
                                  logs.map((l, i) => (
                                      <div key={i} className={l.includes('[위험]') || l.includes('오류') ? 'text-rose-400 font-bold' : l.includes('성공') || l.includes('완료') ? 'text-emerald-400 font-bold' : ''}>
                                          {l}
                                      </div>
                                  ))
                              )}
                              <div ref={logEndRef} />
                          </div>
                      </div>
                  )}

                  <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleFileUpload} 
                      accept=".xlsx, .xls, .csv" 
                      className="hidden" 
                  />

                  {/* ★ 우클릭 컨텍스트 메뉴 (Context Menu) ★ */}
                  {/* ── 진행실적 등록 모달 (월간보고) ── */}
                  {pmsProgressRow && (
                      <ProgressModal
                          row={pmsProgressRow}
                          team={currentTeam}
                          subRows={baseOrderedProjects
                              .filter(p => p.isSub && p.parentId === pmsProgressRow.id)
                              .map(p => ({ name: p.project || p.content || '서브항목', key: p.id }))}
                          onClose={() => setPmsProgressRow(null)}
                          weeklyLinks={weeklyLinks}
                          getWeeklyReport={wrIdbGet}
                          parseWeekly={parseWeeklyProgressSummary}
                          baseDate={baseDate}
                          progressItems={pmsProgressRow.progressItems || DEFAULT_PROGRESS_ITEMS}
                          onApplyToMonthly={handleApplyProgressToMonthly}
                          onProgressSaved={handleProgressSaved}
                      />
                  )}

                  {contextMenu && (
                      <div 
                          className="fixed z-[9999] bg-slate-800 border border-slate-600 shadow-2xl rounded-2xl py-1.5 w-44 animate-in fade-in zoom-in duration-100 overflow-hidden"
                          style={{
                              // 메뉴 실제 높이(~260px)만큼 화면 하단에서 띄워 '삭제하기'까지 항상 보이게
                              top: Math.min(contextMenu.y, window.innerHeight - 270),
                              left: Math.min(contextMenu.x, window.innerWidth - 180)
                          }}
                          onClick={(e) => e.stopPropagation()} 
                      >
                          <div className="px-3 py-1.5 border-b border-slate-700/50 mb-1">
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider truncate">Project Actions</p>
                          </div>
                          <button 
                              onClick={() => { setGraphProject(contextMenu.project); setContextMenu(null); }}
                              className="w-full text-left px-4 py-2 hover:bg-slate-700 flex items-center gap-3 text-sm font-bold text-cyan-400 transition-colors"
                          >
                              <BarChart3 size={16} /> 실적 그래프 보기
                          </button>
                          <button
                              onClick={() => { handleOpenModal(contextMenu.project); setContextMenu(null); }}
                              className="w-full text-left px-4 py-2 hover:bg-slate-700 flex items-center gap-3 text-sm font-bold text-slate-300 transition-colors"
                          >
                              <Edit2 size={16} className="text-emerald-400" /> 상세 수정하기
                          </button>
                          <button
                              onClick={() => { setPmsProgressRow(contextMenu.project); setContextMenu(null); }}
                              className="w-full text-left px-4 py-2 hover:bg-slate-700 flex items-center gap-3 text-sm font-bold text-slate-300 transition-colors"
                          >
                              <TrendingUp size={16} className="text-emerald-400" /> 진행실적 등록
                          </button>
                          {contextMenu.project?.execNo && (
                              <button
                                  onClick={() => {
                                      setHighlightExecNoInList(String(contextMenu.project.execNo));
                                      setCurrentMode('projectList');
                                      setContextMenu(null);
                                  }}
                                  className="w-full text-left px-4 py-2 hover:bg-slate-700 flex items-center gap-3 text-sm font-bold text-amber-400 transition-colors"
                              >
                                  <ListChecks size={16} /> List관리 이동
                              </button>
                          )}
                          <div className="border-t border-slate-700/50 my-1"></div>
                          <button
                              onClick={() => { setConfirmDeleteId(contextMenu.project.id); setContextMenu(null); }}
                              className="w-full text-left px-4 py-2 hover:bg-rose-900/40 flex items-center gap-3 text-sm font-bold text-rose-400 transition-colors"
                          >
                              <Trash2 size={16} /> 삭제하기
                          </button>
                      </div>
                  )}

                  <div className="max-w-[1900px] mx-auto w-full flex-1 flex flex-col gap-3 md:gap-4 overflow-hidden">
                      
                      <header className="flex flex-row justify-between items-center gap-2 shrink-0 relative z-50">
                          <div className="flex items-center gap-2 min-w-0 shrink-0">
                              <div className="p-2 bg-cyan-500 rounded-xl shadow-lg shadow-cyan-500/20 text-white shrink-0">
                                  {currentTeam === '기술1팀' && <Wrench size={20}/>}
                                  {currentTeam === '기술2팀' && <Cpu size={20}/>}
                                  {currentTeam === '기술3팀' && <Monitor size={20}/>}
                                  {currentTeam === 'Software팀' && <TerminalSquare size={20}/>}
                              </div>
                              <div className="flex items-center gap-2 min-w-0">
                                  <h1 className="text-base font-bold text-white tracking-tight flex items-center gap-1.5 whitespace-nowrap">
                                      {currentTeam} 업무 현황
                                  </h1>
                                  <div className="flex items-center bg-slate-800/80 rounded px-2 py-1 border border-slate-700 hover:border-cyan-500 transition-all cursor-pointer shrink-0">
                                      <Calendar size={11} className="text-cyan-400 mr-1" />
                                      <span className="text-[11px] font-bold text-slate-400 mr-1">기준월:</span>
                                      <input type="month" value={baseDate} onChange={(e) => setBaseDate(e.target.value)} className="bg-transparent border-none text-cyan-400 text-[11px] font-black outline-none color-scheme-dark cursor-pointer" />
                                  </div>
                              </div>
                          </div>

                          <div className="flex items-center justify-end gap-1 shrink-0">
                              {/* 이전화면 (팀 변경) */}
                              <button onClick={() => setCurrentTeam(null)} title="팀 변경" className="flex items-center justify-center px-2.5 py-1.5 rounded border border-slate-600 bg-slate-800 hover:bg-slate-700 text-[#111827] hover:text-white transition-all shrink-0 text-xs font-bold">
                                  이전화면
                              </button>

                              {/* 표시 모드 — 컴팩트 */}
                              <button
                                  onClick={() => setCompactMode(v => (v + 1) % 3)}
                                  title={['기본 보기 → 컴팩트', '컴팩트 → 초소형', '초소형 → 기본'][compactMode]}
                                  className={`flex items-center justify-center gap-1 px-2.5 py-1.5 rounded border transition-all text-xs font-bold shrink-0 ${
                                      compactMode === 0 ? 'bg-slate-900 border-slate-700 hover:bg-slate-800'
                                    : compactMode === 1 ? 'bg-cyan-500/20 border-cyan-500'
                                    : 'bg-violet-500/20 border-violet-500'
                                  }`}
                              >
                                  <AlignJustify size={14} style={{ color: '#111827' }} />
                                  <span style={{ color: '#111827' }}>컴팩트</span>
                              </button>

                              {/* 팀 실적 그래프 */}
                              <button
                                  onClick={() => { setShowTeamGraph(true); setTeamChartZoom(1); }}
                                  title="팀 전체 실적 그래프"
                                  className="flex items-center justify-center gap-1 px-2.5 py-1.5 rounded border border-indigo-500/60 bg-indigo-500/15 hover:bg-indigo-500 text-[#111827] hover:text-white transition-all text-xs font-bold shrink-0"
                              >
                                  <BarChart3 size={14} /> 실적그래프
                              </button>
                              {/* 프로젝트 추가 */}
                              <button
                                  onClick={() => handleOpenModal(null)}
                                  title="새 프로젝트 등록"
                                  className="flex items-center justify-center gap-1 px-2.5 py-1.5 rounded border border-cyan-500/60 bg-cyan-500/15 hover:bg-cyan-500 text-[#111827] hover:text-white transition-all text-xs font-bold shrink-0"
                              >
                                  <Plus size={14} /> 프로젝트 추가
                              </button>

                              {/* 검색 */}
                              <div className="flex items-center shrink-0">
                                  <div className="relative group">
                                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none z-10 transition-colors" size={13}
                                          style={{ color: searchActive ? '#f59e0b' : '#111827' }} />
                                      <input
                                          type="text"
                                          placeholder="프로젝트·공장·담당자·실행번호..."
                                          value={searchTerm}
                                          onChange={(e) => {
                                              setSearchTerm(e.target.value);
                                              if (!e.target.value) setSearchActive(false);
                                          }}
                                          onKeyDown={(e) => {
                                              if (e.key === 'Enter' && searchTerm.trim()) {
                                                  setSearchActive(true);
                                              } else if (e.key === 'Escape') {
                                                  setSearchTerm(''); setSearchActive(false);
                                              }
                                          }}
                                          style={{ borderColor: searchActive ? '#f59e0b' : undefined, borderRadius: 0 }}
                                          className={`bg-slate-900 border border-slate-700 hover:border-slate-600 py-1.5 pl-7 pr-2 text-xs font-medium text-white transition-all outline-none shadow-sm cursor-text placeholder-slate-500 ${searchActive ? 'w-52' : 'w-36 focus:w-52'}`}
                                      />
                                  </div>
                                  {/* 검색 초기화 버튼 */}
                                  {(searchTerm || searchActive) && (
                                      <button
                                          onClick={() => { setSearchTerm(''); setSearchActive(false); }}
                                          title="검색 초기화"
                                          style={{ borderRadius: 0 }}
                                          className="flex items-center justify-center px-2 py-1.5 border border-l-0 border-rose-500/60 bg-rose-500/15 text-rose-400 hover:bg-rose-500 hover:text-white text-xs font-bold transition-all"
                                      >
                                          <X size={13} />
                                      </button>
                                  )}
                              </div>


                              {/* 월간 저장 — 아이콘만 */}
                              {(() => {
                                  const hasSaved = !!fbSnapshots[baseDate];
                                  const [, m] = (baseDate || '').split('-');
                                  return (
                                      <button
                                          onClick={handleMonthlySaveClick}
                                          title={hasSaved ? `${m}월 저장됨 — 클릭하면 갱신` : `${m}월 업무현황 저장`}
                                          className={`flex items-center justify-center gap-1 px-2.5 py-1.5 rounded border transition-all text-xs font-bold shrink-0 ${hasSaved ? 'bg-amber-500/20 border-amber-500 text-amber-400 hover:bg-amber-500/30' : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'}`}
                                      >
                                          <BookMarked size={14} />
                                          <span style={{ color: '#111827' }}>전체저장</span>
                                          {hasSaved && <span className="text-[9px] font-mono">{m}월</span>}
                                      </button>
                                  );
                              })()}

                              {/* 월간보고서 — 엑셀생성 */}
                              <button onClick={executeMonthlyReport} title="월간보고서 엑셀 생성" className="flex items-center justify-center gap-1 px-2.5 py-1.5 rounded border border-indigo-500/50 bg-indigo-600/20 hover:bg-indigo-600 text-[#111827] hover:text-white transition-all shrink-0 text-xs font-bold">
                                  <FileSpreadsheet size={14} /> 엑셀생성
                              </button>

                              {/* 프로젝트 List관리 이동 버튼 */}
                              <button onClick={() => setCurrentMode('projectList')} title="프로젝트 List관리" className="flex items-center gap-1 px-2.5 py-1.5 rounded border border-emerald-700 bg-emerald-900/30 hover:bg-emerald-700 text-[#111827] hover:text-white transition-all shrink-0 text-xs font-bold">
                                  <ListChecks size={13} /> List관리
                              </button>


                              {/* 도움말 버튼 */}
                              <button onClick={() => setIsHelpOpen(true)} className="flex items-center justify-center gap-1 bg-slate-900 hover:bg-cyan-900/40 border border-slate-700 hover:border-cyan-500/50 px-2 py-1.5 rounded transition-all text-xs font-bold text-slate-400 hover:text-cyan-400 shrink-0" title="도움말">
                                  <HelpCircle size={13} /> 도움말
                              </button>

                              {/* 설정 드롭다운 — Debug·로컬→DB 포함 */}
                              <div className="relative shrink-0">
                                  <button onClick={() => setIsSettingsMenuOpen(!isSettingsMenuOpen)} className="flex items-center justify-center gap-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 px-2 py-1.5 rounded transition-all text-xs font-bold text-slate-300 hover:text-white">
                                      <Settings size={13} /> 설정 <ChevronDown size={11} />
                                  </button>
                                  {isSettingsMenuOpen && (
                                      <>
                                          <div className="fixed inset-0 z-[55]" onClick={() => setIsSettingsMenuOpen(false)}></div>
                                          <div className="absolute right-0 mt-2 w-64 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden z-[60] py-2 animate-in fade-in zoom-in-95">
                                              {/* Debug 토글 */}
                                              <button onClick={() => { setIsSettingsMenuOpen(false); setShowDebug(v => !v); }} className={`w-full text-left px-4 py-2.5 hover:bg-slate-800 text-xs font-bold flex items-center gap-2 transition-colors border-b border-slate-800 ${showDebug ? 'text-emerald-400' : 'text-slate-300'}`}>
                                                  <TerminalSquare size={14} className={showDebug ? 'text-emerald-400' : 'text-slate-500'} />
                                                  디버그 모드
                                                  <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded border font-mono ${showDebug ? 'border-emerald-500 text-emerald-400' : 'border-slate-600 text-slate-500'}`}>{showDebug ? 'ON' : 'OFF'}</span>
                                              </button>
                                              {/* A-4a-0: 데이터 백업 */}
                                              <button onClick={() => { setIsSettingsMenuOpen(false); handleBackupData(); }} className="w-full text-left px-4 py-2.5 hover:bg-slate-800 text-xs font-bold text-amber-300 flex items-center gap-2 transition-colors border-b border-slate-800">
                                                  <Download size={14} className="text-amber-400" /> 데이터 백업 (JSON 저장)
                                              </button>
                                              {/* A-4a: pid 일괄 발급 */}
                                              <button onClick={() => { setIsSettingsMenuOpen(false); openPidMigration(); }} className="w-full text-left px-4 py-2.5 hover:bg-slate-800 text-xs font-bold text-violet-300 flex items-center gap-2 transition-colors border-b border-slate-800">
                                                  <ListChecks size={14} className="text-violet-400" /> 고유 ID 일괄 발급 (A-4a)
                                              </button>
                                              {/* A-4b: 주간장부 pid 통일 병합 */}
                                              <button onClick={() => { setIsSettingsMenuOpen(false); openWkMigration(); }} className="w-full text-left px-4 py-2.5 hover:bg-slate-800 text-xs font-bold text-cyan-300 flex items-center gap-2 transition-colors border-b border-slate-800">
                                                  <TrendingUp size={14} className="text-cyan-400" /> 주간장부 통일 병합 (A-4b)
                                              </button>
                                              {/* 로컬→DB (조건부) */}
                                              {localSnapMonths.length > 0 && (
                                                  <button onClick={() => { setIsSettingsMenuOpen(false); setMigrateProgress(null); setMigrateModal(true); }} className="w-full text-left px-4 py-2.5 hover:bg-slate-800 text-xs font-bold text-violet-400 flex items-center gap-2 transition-colors border-b border-slate-800">
                                                      <Upload size={14} className="text-violet-400" /> 로컬 → DB 이전
                                                      <span className="ml-auto text-[10px] bg-violet-500/20 text-violet-300 px-1.5 py-0.5 rounded">{localSnapMonths.length}</span>
                                                  </button>
                                              )}
                                              <div className="border-t border-slate-800 my-1"></div>
                                              <button onClick={() => { setIsSettingsMenuOpen(false); if(fileInputRef.current) fileInputRef.current.value = ''; fileInputRef.current?.click(); }} className="w-full text-left px-4 py-2.5 hover:bg-slate-800 text-xs font-bold text-white flex items-center gap-2 transition-colors">
                                                  <Upload size={14} className="text-cyan-400" /> 엑셀 업로드
                                              </button>
                                              <button onClick={() => { setIsSettingsMenuOpen(false); handleOpenModal(null); }} className="w-full text-left px-4 py-2.5 hover:bg-slate-800 text-xs font-bold text-white flex items-center gap-2 transition-colors">
                                                  <Plus size={14} className="text-cyan-400" /> 수동 신규 등록
                                              </button>
                                              <button onClick={() => { setIsSettingsMenuOpen(false); setIsSettingsOpen(true); setSettingsTab('defaults'); }} className="w-full text-left px-4 py-2.5 hover:bg-slate-800 text-xs font-bold text-slate-300 flex items-center gap-2 transition-colors">
                                                  <LayoutGrid size={14} className="text-indigo-400" /> 기본 필터(초기화면)
                                              </button>
                                              <button onClick={() => { setIsSettingsMenuOpen(false); setIsSettingsOpen(true); setSettingsTab('status'); }} className="w-full text-left px-4 py-2.5 hover:bg-slate-800 text-xs font-bold text-slate-300 flex items-center gap-2 transition-colors">
                                                  <Edit2 size={14} className="text-emerald-400" /> 드롭다운 항목 편집
                                              </button>
                                              <div className="border-t border-slate-800 my-1"></div>
                                              {/* 열 표시/숨기기 */}
                                              <button onClick={() => setIsColumnDropdownOpen(v => !v)} className={`w-full text-left px-4 py-2.5 hover:bg-slate-800 text-xs font-bold flex items-center gap-2 transition-colors ${hiddenColumns.size > 0 ? 'text-rose-400' : 'text-slate-300'}`}>
                                                  <Eye size={14} className={hiddenColumns.size > 0 ? 'text-rose-400' : 'text-slate-500'} />
                                                  열 표시/숨기기
                                                  {hiddenColumns.size > 0 && <span className="ml-auto text-[10px] bg-rose-500 text-white px-1.5 py-0.5 font-mono">{hiddenColumns.size}개 숨김</span>}
                                              </button>
                                              {isColumnDropdownOpen && (
                                                  <div className="px-3 pb-2">
                                                      <div className="flex justify-end mb-1.5">
                                                          <button onClick={() => setHiddenColumns(new Set())} className="text-[11px] text-cyan-400 hover:text-cyan-300 font-bold px-2 py-0.5 bg-cyan-500/10">모두 표시</button>
                                                      </div>
                                                      <div className="space-y-0.5 max-h-48 overflow-y-auto custom-scrollbar">
                                                          {orderedColDefs.map(col => (
                                                              <label key={col.key} className="flex items-center gap-2 cursor-pointer group py-1 px-2 hover:bg-slate-800/50 transition-colors">
                                                                  <input type="checkbox" checked={!hiddenColumns.has(col.key)} onChange={() => {
                                                                      setHiddenColumns(prev => {
                                                                          const next = new Set(prev);
                                                                          if (next.has(col.key)) next.delete(col.key);
                                                                          else next.add(col.key);
                                                                          return next;
                                                                      });
                                                                  }} className="w-3 h-3 accent-cyan-500 cursor-pointer" />
                                                                  <span className={`text-[12px] font-medium ${hiddenColumns.has(col.key) ? 'text-slate-500' : 'text-slate-200 group-hover:text-white'}`}>{col.label}</span>
                                                              </label>
                                                          ))}
                                                      </div>
                                                  </div>
                                              )}
                                              {/* 엑셀 다운로드 */}
                                              <button onClick={() => { setIsSettingsMenuOpen(false); handleExcelDownloadClick(); }} className="w-full text-left px-4 py-2.5 hover:bg-emerald-900/30 text-xs font-bold text-emerald-400 flex items-center gap-2 transition-colors">
                                                  <Download size={14} className="text-emerald-400" /> 엑셀 다운로드
                                                  {userPrefs[currentTeam]?.excelFormat && <span className="ml-auto text-[10px] bg-emerald-500 text-white px-1.5 py-0.5 font-mono">{userPrefs[currentTeam].excelFormat.toUpperCase()}</span>}
                                              </button>
                                              <button onClick={() => { setIsSettingsMenuOpen(false); openExcelFormatModal(); }} className="w-full text-left px-4 py-2.5 hover:bg-slate-800 text-xs font-bold text-slate-300 flex items-center gap-2 transition-colors">
                                                  <FileSpreadsheet size={14} className="text-emerald-400" /> 엑셀 포맷 설정
                                              </button>
                                              <div className="border-t border-slate-800 my-1"></div>
                                              <button onClick={() => { setIsSettingsMenuOpen(false); setIsDeleteAllModalOpen(true); }} className="w-full text-left px-4 py-2.5 hover:bg-rose-900/30 text-xs font-bold text-rose-400 flex items-center gap-2 transition-colors">
                                                  <Trash2 size={14} /> 데이터 초기화
                                              </button>
                                          </div>
                                      </>
                                  )}
                              </div>

                              {/* 사용자 정보 + 로그아웃 */}
                              <div className="flex items-center shrink-0 border border-slate-700 bg-slate-900" style={{ height: '100%' }}>
                                  <span className="px-2 text-[11px] font-semibold text-slate-400 max-w-[90px] truncate" title={user?.email || ''}>
                                      {user?.displayName || user?.email?.split('@')[0] || '사용자'}
                                  </span>
                                  <button onClick={() => setConfirmSignOutOpen(true)} className="flex items-center px-1.5 py-1.5 border-l border-slate-700 hover:bg-rose-900/30 text-slate-400 hover:text-rose-400 transition-all h-full" title="로그아웃">
                                      <LogOut size={12} />
                                  </button>
                              </div>
                          </div>
                      </header>

                      <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-1 items-center bg-slate-900/30 p-1.5 rounded-xl border border-slate-800/50 shadow-inner shrink-0 relative z-30">
                          
                          {isFilterModified && (
                              <button onClick={resetFilters} className="px-3 py-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition-all font-bold text-[11px] flex items-center justify-center gap-1 shrink-0 mr-1 shadow-sm">
                                  <X size={12} /> 초기 상태로
                              </button>
                          )}
                          
                          {/* ★ STATUS 라벨 클릭 시 전체 토글(선택/해제) 기능 ★ */}
                          <div 
                              className="flex items-center px-2 py-1 bg-slate-900/80 rounded-md shadow-sm shrink-0 gap-1.5 border border-slate-700/50 cursor-pointer hover:bg-slate-800 transition-colors"
                              onClick={() => {
                                  const allLabels = statusSummaryItems.map(s => s && s.label).filter(Boolean);
                                  if (activeFilterStatuses.size === allLabels.length) {
                                      setActiveFilterStatuses(new Set());
                                      addLog('STATUS 라벨 클릭: 모든 진행현황 해제 (데이터 숨김)');
                                  } else {
                                      setActiveFilterStatuses(new Set(allLabels));
                                      addLog('STATUS 라벨 클릭: 모든 진행현황 선택 (전체 데이터 노출)');
                                  }
                              }}
                              title="클릭 시 모든 진행현황을 선택하거나 해제합니다."
                          >
                              <BarChart3 size={12} className="text-cyan-400" />
                              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Status <span className="text-white ml-0.5">({totalProjectsCount})</span></span>
                          </div>
                          
                          {statusSummaryItems.map((opt) => {
                              // ── "sub" 칩: 서브행 전체 접기/펼치기 전용 ──
                              if (opt.label === 'sub') {
                                  const parentIds = Object.keys(mainParentHasChildren).filter(id => mainParentHasChildren[id]);
                                  const subParentCount = parentIds.length;
                                  const allCollapsed = subParentCount > 0 && parentIds.every(id => collapsedProjects.has(id));
                                  return (
                                      <div key="sub"
                                           onClick={() => {
                                               setCollapsedProjects(prev => {
                                                   const next = new Set(prev);
                                                   if (allCollapsed) parentIds.forEach(id => next.delete(id));
                                                   else parentIds.forEach(id => next.add(id));
                                                   return next;
                                               });
                                           }}
                                           title={allCollapsed ? '서브항목 모두 펼치기' : '서브항목 모두 접기'}
                                           className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md shadow-sm shrink-0 cursor-pointer select-none transition-all
                                               ${!allCollapsed && subParentCount > 0
                                                   ? 'border-[1.5px] border-orange-500 bg-slate-800 scale-105'
                                                   : 'border border-transparent opacity-50 hover:opacity-80 hover:bg-slate-800/50'}
                                           `}>
                                          <div className="w-1.5 h-1.5 rounded-full bg-orange-500"></div>
                                          <span className="text-[11px] font-bold text-slate-300">하위</span>
                                          <span className="text-[11px] font-black text-orange-400">{subParentCount}</span>
                                          {subParentCount > 0 && (allCollapsed
                                              ? <ChevronDown size={10} className="text-orange-400" />
                                              : <ChevronUp size={10} className="text-orange-400" />
                                          )}
                                      </div>
                                  );
                              }

                              // ── 일반 상태 칩 ──
                              const isActive = activeFilterStatuses.has(opt.label);
                              return (
                                  <div key={opt.label}
                                       draggable
                                       onDragStart={(e) => {
                                           setDraggedStatusKey(opt.label);
                                           e.dataTransfer.effectAllowed = 'move';
                                       }}
                                       onDragEnter={(e) => {
                                           e.preventDefault();
                                           if (!draggedStatusKey || draggedStatusKey === opt.label) return;

                                           // ★ 진행현황(Status) 드래그 앤 드롭 안전 변경 로직
                                           setTeamSettings(prev => {
                                               const next = JSON.parse(JSON.stringify(prev));
                                               const list = next[currentTeam].status.filter(Boolean);

                                               let draggedItem = list.find(s => s && s.label === draggedStatusKey);
                                               if (!draggedItem) {
                                                   const dynItem = statusSummaryItems.find(s => s && s.label === draggedStatusKey);
                                                   if (dynItem) {
                                                       draggedItem = { label: dynItem.label, color: dynItem.color, textColor: dynItem.textColor, borderColor: dynItem.borderColor };
                                                       list.push(draggedItem);
                                                   }
                                               }

                                               let targetItem = list.find(s => s && s.label === opt.label);
                                               if (!targetItem) {
                                                   const dynItem = statusSummaryItems.find(s => s && s.label === opt.label);
                                                   if (dynItem) {
                                                       targetItem = { label: dynItem.label, color: dynItem.color, textColor: dynItem.textColor, borderColor: dynItem.borderColor };
                                                       list.push(targetItem);
                                                   }
                                               }

                                               if (draggedItem && targetItem && draggedItem.label !== targetItem.label) {
                                                   const newList = list.filter(s => s.label !== draggedStatusKey);
                                                   const insertIdx = newList.findIndex(s => s.label === opt.label);
                                                   if (insertIdx !== -1) {
                                                       newList.splice(insertIdx, 0, draggedItem);
                                                       next[currentTeam].status = newList;
                                                   }
                                               }
                                               return next;
                                           });
                                       }}
                                       onDragEnd={() => {
                                           setDraggedStatusKey(null);
                                           setTeamSettings(prev => {
                                               saveSettingsToDB(prev);
                                               return prev;
                                           });
                                       }}
                                       onDragOver={(e) => e.preventDefault()}
                                       onClick={() => {
                                           setActiveFilterStatuses(prev => {
                                               const next = new Set(prev);
                                               if (next.has(opt.label)) next.delete(opt.label);
                                               else next.add(opt.label);
                                               addLog(`진행현황 필터 변경: ${opt.label} (${next.has(opt.label) ? '켜짐' : '꺼짐'})`);
                                               return next;
                                           });
                                       }}
                                       title="클릭하여 데이터 노출/숨김 (꾹 눌러서 이동)"
                                       className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md shadow-sm shrink-0 cursor-pointer select-none transition-all
                                           ${isActive ? `border-[1.5px] ${opt.borderColor.replace('/20','')} bg-slate-800 scale-105` : 'border border-transparent opacity-50 grayscale hover:opacity-80 hover:bg-slate-800/50'}
                                           ${draggedStatusKey === opt.label ? 'opacity-40 border-dashed border-cyan-500 bg-slate-900 scale-95' : ''}
                                       `}>
                                      <div className={`w-1.5 h-1.5 rounded-full ${opt.color}`}></div>
                                      <span className="text-[11px] font-bold text-slate-300">{opt.label}</span>
                                      <span className={`text-[11px] font-black ${opt.textColor}`}>{opt.count}</span>
                                  </div>
                              )
                          })}

                          <div className="w-px h-4 bg-slate-700/60 shrink-0 mx-1"></div>

                          <div className="flex items-center px-2 py-1 bg-slate-900/80 rounded-md shadow-sm shrink-0 gap-1.5 border border-slate-700/50">
                              <LayoutGrid size={12} className="text-indigo-400" />
                              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Factory</span>
                          </div>
                          
                          {displayFactories.map((opt) => {
                              const count = factorySummary[opt] || 0;
                              const isActive = activeFilterFactories.has(opt);
                              return (
                                  <div key={opt} 
                                       draggable
                                       onDragStart={(e) => {
                                           setDraggedFactoryKey(opt);
                                           e.dataTransfer.effectAllowed = 'move';
                                       }}
                                       onDragEnter={(e) => {
                                           e.preventDefault();
                                           if (!draggedFactoryKey || draggedFactoryKey === opt) return;

                                           setTeamSettings(prev => {
                                               const next = JSON.parse(JSON.stringify(prev));
                                               const list = next[currentTeam].factory.filter(Boolean);

                                               const draggedIdx = list.indexOf(draggedFactoryKey);
                                               const targetIdx = list.indexOf(opt);

                                               if (draggedIdx !== -1 && targetIdx !== -1 && draggedIdx !== targetIdx) {
                                                   const draggedItem = list[draggedIdx];
                                                   list.splice(draggedIdx, 1);
                                                   list.splice(targetIdx, 0, draggedItem);
                                               }
                                               
                                               next[currentTeam].factory = list;
                                               return next;
                                           });
                                       }}
                                       onDragEnd={() => {
                                           setDraggedFactoryKey(null);
                                           setTeamSettings(prev => {
                                               saveSettingsToDB(prev);
                                               return prev;
                                           });
                                       }}
                                       onDragOver={(e) => e.preventDefault()}
                                       onClick={() => {
                                           setActiveFilterFactories(prev => {
                                               const next = new Set(prev);
                                               if (next.has(opt)) next.delete(opt);
                                               else next.add(opt);
                                               addLog(`공장 필터 변경: ${opt} (${next.has(opt) ? '켜짐' : '꺼짐'})`);
                                               return next;
                                           });
                                       }}
                                       title="클릭하여 데이터 노출/숨김 (꾹 눌러서 이동)"
                                       className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md shadow-sm shrink-0 cursor-pointer select-none transition-all
                                           ${isActive ? `border-[1.5px] border-indigo-500 bg-slate-800 scale-105` : 'border border-transparent opacity-50 grayscale hover:opacity-80 hover:bg-slate-800/50'}
                                           ${draggedFactoryKey === opt ? 'opacity-40 border-dashed border-indigo-500 bg-slate-900 scale-95' : ''}
                                       `}>
                                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div>
                                      <span className="text-[11px] font-bold text-slate-300">{opt}</span>
                                      <span className="text-[11px] font-black text-indigo-400">{count}</span>
                                  </div>
                              );
                          })}
                      </div>

                      {/* 로컬 IDB에서 자동 로드된 데이터 배너 */}
                      {pmsLocalInfo && localUnsavedProjects.length > 0 && (
                          <div className="bg-violet-900/20 border border-violet-500/50 p-4 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shrink-0 animate-in relative z-20">
                              <div className="flex items-center gap-3">
                                  <div className="p-2 bg-violet-500/20 rounded-xl border border-violet-500/30">
                                      <HardDrive className="text-violet-400" size={20} />
                                  </div>
                                  <div>
                                      <h4 className="text-violet-300 font-bold text-sm">로컬 임시 저장 데이터 자동 로드됨</h4>
                                      <p className="text-violet-400/70 text-xs mt-0.5">
                                          저장: {new Date(pmsLocalInfo.savedAt).toLocaleString()} · <strong className="text-violet-300">{pmsLocalInfo.count}건</strong>
                                          — 검토 완료 시 Firebase로 확정 저장하세요.
                                      </p>
                                  </div>
                              </div>
                              <button onClick={handleDeletePmsLocal} className="flex-none px-3 py-2 bg-slate-800 hover:bg-rose-900/40 text-slate-400 hover:text-rose-400 rounded-xl text-xs font-bold transition-all border border-slate-700">
                                  로컬 데이터 삭제
                              </button>
                          </div>
                      )}

                      {localUnsavedProjects.length > 0 && (
                          <div className="bg-amber-900/20 border border-amber-500/50 p-4 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shrink-0 shadow-lg shadow-amber-900/10 animate-in relative z-20">
                              <div className="flex items-center gap-3">
                                  <div className="p-2 bg-amber-500/20 rounded-xl border border-amber-500/30">
                                      <AlertTriangle className="text-amber-400" size={24} />
                                  </div>
                                  <div>
                                      <h4 className="text-amber-400 font-bold text-sm">임시 데이터 확인 중</h4>
                                      <p className="text-amber-200/70 text-xs mt-0.5">메인 화면에 임시로 표시된 <strong className="text-amber-400 font-bold">{localUnsavedProjects.length}건</strong>의 엑셀 데이터가 있습니다. 내용을 검토한 후 DB에 저장하세요.</p>
                                  </div>
                              </div>
                              <div className="flex items-center gap-2 w-full md:w-auto flex-wrap">
                                  <button onClick={() => { setLocalUnsavedProjects([]); setPmsLocalInfo(null); }} className="flex-1 md:flex-none px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold text-sm transition-colors border border-slate-700">전체 취소</button>
                                  <button onClick={handleSavePmsToLocal} className="flex-1 md:flex-none px-4 py-2 bg-violet-700 hover:bg-violet-600 text-white rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-1.5 border border-violet-500/50">
                                      <HardDrive size={14}/> 로컬에 저장하기
                                  </button>
                                  <button onClick={() => setIsSaveConfirmModalOpen(true)} className="flex-1 md:flex-none px-6 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold text-sm shadow-md transition-colors flex items-center justify-center gap-2"><Save size={16}/> DB에 모두 확정 저장</button>
                              </div>
                          </div>
                      )}

                      {/* ★ 전체 검색 모드 배너 ★ */}
                      {searchActive && (
                          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 14px', backgroundColor:'rgba(245,158,11,0.10)', borderBottom:'2px solid rgba(245,158,11,0.4)', flexShrink:0 }}>
                              <Search size={13} style={{ color:'#f59e0b', flexShrink:0 }} />
                              <span style={{ fontSize:12, fontWeight:700, color:'#f59e0b' }}>전체 검색 모드</span>
                              <span style={{ fontSize:12, color:'#92400e', fontWeight:600 }}>
                                  &nbsp;"{searchTerm}"&nbsp;—&nbsp;
                                  {filteredAndSortedProjects.filter(p => !p.isSub).length}건 발견 (모든 진행현황 포함)
                              </span>
                              <button
                                  onClick={() => { setSearchTerm(''); setSearchActive(false); }}
                                  style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:4, padding:'3px 10px', backgroundColor:'rgba(245,158,11,0.2)', border:'1px solid rgba(245,158,11,0.5)', color:'#f59e0b', fontSize:11, fontWeight:700, cursor:'pointer' }}
                              >
                                  <X size={11} /> 검색 종료
                              </button>
                          </div>
                      )}

                      {/* ★ 메인 화면 빈 상태 처리 로직 ★ */}
                      {filteredAndSortedProjects.length === 0 ? (
                          <div className="flex-1 flex flex-col items-center justify-center bg-slate-900/30 border-2 border-dashed border-slate-700/50 rounded-3xl m-2 animate-in min-h-[400px]">
                              <Database className="w-24 h-24 text-slate-700 mb-6 opacity-70" />
                              <h2 className="text-3xl font-extrabold text-slate-300 mb-3 tracking-tight">데이터가 없습니다.</h2>
                              <p className="text-slate-500 text-base font-medium">
                                  {baseOrderedProjects.length === 0 ? "엑셀 파일을 업로드하거나 새로운 프로젝트를 수동으로 등록해 주세요." : "상단의 현황(Status) 버튼을 클릭하여 데이터를 확인해 주세요."}
                              </p>
                          </div>
                      ) : (
                          <div className="bg-slate-900/40 border border-slate-800 rounded-2xl overflow-hidden backdrop-blur-sm shadow-xl flex-1 flex flex-col z-0 relative min-h-0 animate-in">
                              {renderTable(visibleProjects, orderedColDefs.filter(col => !hiddenColumns.has(col.key)), false)}
                          </div>
                      )}
                  </div>
              </div>
          )}

          {/* ★ 엑셀 다운로드 포맷 설정 모달 추가 ★ */}
          {isExcelFormatModalOpen && (
              <div className="fixed inset-0 z-[200] flex justify-center items-center p-4 bg-slate-950/80 animate-in">
                  <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-lg w-full max-h-[90vh] shadow-2xl flex flex-col overflow-hidden">
                      <div className="p-6 border-b border-slate-800 bg-slate-900/50 flex items-center gap-3 shrink-0">
                          <FileSpreadsheet className="text-emerald-400" size={24} />
                          <h3 className="text-xl font-bold text-white">[{currentTeam}] 엑셀 다운로드 포맷 설정</h3>
                      </div>
                      
                      <div className="p-6 space-y-4 text-left flex-1 overflow-y-auto custom-scrollbar">
                          <p className="text-slate-400 text-sm mb-2">출력할 엑셀 파일의 양식을 선택해주세요.</p>
                          
                          <label className={`flex flex-col p-4 border rounded-xl cursor-pointer transition-all ${tempExcelFormat === 'ui' ? 'bg-emerald-600/10 border-emerald-500/50' : 'bg-slate-950 border-slate-800 hover:border-slate-700'}`}>
                              <div className="flex items-center gap-3 mb-1">
                                  <input type="radio" name="excelFormat" value="ui" checked={tempExcelFormat === 'ui'} onChange={() => setTempExcelFormat('ui')} className="w-4 h-4 accent-emerald-500" />
                                  <span className={`font-bold ${tempExcelFormat === 'ui' ? 'text-emerald-400' : 'text-slate-300'}`}>현재 화면 그대로 (UI 포맷)</span>
                              </div>
                              <p className="text-xs text-slate-500 ml-7">상단 메뉴에서 임의로 숨김 처리한 열(Column)은 제외하고, 현재 눈에 보이는 순서와 항목 그대로 엑셀을 만듭니다.</p>
                          </label>

                          <label className={`flex flex-col p-4 border rounded-xl cursor-pointer transition-all ${tempExcelFormat === 'all' ? 'bg-emerald-600/10 border-emerald-500/50' : 'bg-slate-950 border-slate-800 hover:border-slate-700'}`}>
                              <div className="flex items-center gap-3 mb-1">
                                  <input type="radio" name="excelFormat" value="all" checked={tempExcelFormat === 'all'} onChange={() => setTempExcelFormat('all')} className="w-4 h-4 accent-emerald-500" />
                                  <span className={`font-bold ${tempExcelFormat === 'all' ? 'text-emerald-400' : 'text-slate-300'}`}>전체 항목 출력 (All 포맷)</span>
                              </div>
                              <p className="text-xs text-slate-500 ml-7">화면에서 숨겨진 데이터를 포함해, 시스템에 등록된 모든 상세 데이터를 엑셀로 출력합니다.</p>
                          </label>

                          <label className={`flex flex-col p-4 border rounded-xl cursor-pointer transition-all ${tempExcelFormat === 'summary' ? 'bg-emerald-600/10 border-emerald-500/50' : 'bg-slate-950 border-slate-800 hover:border-slate-700'}`}>
                              <div className="flex items-center gap-3 mb-1">
                                  <input type="radio" name="excelFormat" value="summary" checked={tempExcelFormat === 'summary'} onChange={() => setTempExcelFormat('summary')} className="w-4 h-4 accent-emerald-500" />
                                  <span className={`font-bold ${tempExcelFormat === 'summary' ? 'text-emerald-400' : 'text-slate-300'}`}>주간/월간 요약 보고서 (Summary)</span>
                              </div>
                              <p className="text-xs text-slate-500 ml-7">NO, 프로젝트명, 발주처, 상태, 공정률, 담당자, 기간 등 보고용 핵심 정보만 추려서 출력합니다.</p>
                          </label>

                          <label className={`flex flex-col p-4 border rounded-xl cursor-pointer transition-all ${tempExcelFormat === 'commissioning' ? 'bg-emerald-600/10 border-emerald-500/50' : 'bg-slate-950 border-slate-800 hover:border-slate-700'}`}>
                              <div className="flex items-center gap-3 mb-1">
                                  <input type="radio" name="excelFormat" value="commissioning" checked={tempExcelFormat === 'commissioning'} onChange={() => setTempExcelFormat('commissioning')} className="w-4 h-4 accent-emerald-500" />
                                  <span className={`font-bold ${tempExcelFormat === 'commissioning' ? 'text-emerald-400' : 'text-slate-300'}`}>시운전 실적 정산 (Points)</span>
                              </div>
                              <p className="text-xs text-slate-500 ml-7">포인트, 금월/전월 등 비용 정산에 필요한 시운전 실적 통계 위주로 출력합니다.</p>
                          </label>

                          <label className={`flex flex-col p-4 border rounded-xl cursor-pointer transition-all ${tempExcelFormat === 'custom' ? 'bg-emerald-600/10 border-emerald-500/50' : 'bg-slate-950 border-slate-800 hover:border-slate-700'}`}>
                              <div className="flex items-center justify-between mb-1">
                                  <div className="flex items-center gap-3">
                                      <input type="radio" name="excelFormat" value="custom" checked={tempExcelFormat === 'custom'} onChange={() => setTempExcelFormat('custom')} className="w-4 h-4 accent-emerald-500" />
                                      <span className={`font-bold ${tempExcelFormat === 'custom' ? 'text-emerald-400' : 'text-slate-300'}`}>내 템플릿 로드 (Custom)</span>
                                  </div>
                                  {userPrefs[currentTeam]?.customTemplateBase64 && tempExcelFormat === 'custom' && <span className="text-[10px] bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded border border-indigo-500/30">저장된 템플릿 있음</span>}
                              </div>
                              <p className="text-xs text-slate-500 ml-7 mb-2">미리 만들어둔 엑셀 서식을 불러와 원하는 셀 위치에 데이터를 주입합니다.</p>
                              
                              {tempExcelFormat === 'custom' && (
                                  <div className="ml-7 p-3 bg-slate-900 border border-slate-800 rounded-lg space-y-3 cursor-default" onClick={e => e.stopPropagation()}>
                                      <input type="file" accept=".xlsx" onChange={(e) => setCustomTemplateFile(e.target.files[0])} className="text-xs text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-bold file:bg-emerald-500/10 file:text-emerald-400 hover:file:bg-emerald-500/20" />
                                      <div className="text-[10px] text-slate-500 space-y-1">
                                          <p className="font-bold text-slate-400">💡 템플릿 사용 방법:</p>
                                          <p>엑셀 파일의 원하는 셀에 <b>{`{{project}}`}, {`{{progress}}`}</b> 처럼 중괄호로 태그를 입력해두면, 시스템이 해당 행을 인식해 데이터를 반복해서 채워줍니다.</p>
                                          <p>사용 가능 주요 태그: no, execNo, project, factory, manager, progressStatus, progress, startDate, endDate, client, content, point, accPoints</p>
                                      </div>
                                  </div>
                              )}
                          </label>
                      </div>

                      <div className="shrink-0 flex flex-col">
                          <div className="px-6 py-4 bg-slate-950 flex justify-between items-center border-t border-slate-800">
                              <label className="flex items-center gap-2 cursor-pointer group">
                                  <input type="checkbox" checked={tempSaveDefault} onChange={(e) => setTempSaveDefault(e.target.checked)} className="w-4 h-4 accent-cyan-500 bg-slate-800 border-slate-700 cursor-pointer" />
                                  <span className="text-sm font-bold text-cyan-400 group-hover:text-cyan-300">내 기본 포맷으로 저장 (현재 팀 항상 적용)</span>
                              </label>
                          </div>
                          
                          <div className="p-6 bg-slate-900/50 flex gap-3 border-t border-slate-800">
                              <button onClick={() => setIsExcelFormatModalOpen(false)} className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 rounded-xl font-bold text-slate-300 transition-colors">취소</button>
                              <button onClick={handleFormatModalSubmit} className="flex-[2] py-3 bg-emerald-600 hover:bg-emerald-500 rounded-xl font-bold text-white shadow-lg flex items-center justify-center gap-2 transition-all">
                                  <Download size={18} /> 다운로드 실행
                              </button>
                          </div>
                      </div>
                  </div>
              </div>
          )}

          {/* ★ 모든 팝업 모달창 (설정/수정/미리보기) 영역 ★ */}

          {isSaveConfirmModalOpen && (
              <div className="fixed inset-0 z-[200] flex justify-center items-center p-4 bg-slate-950/80 animate-in">
                  <div className="bg-slate-900 border border-slate-700 p-8 rounded-3xl max-w-md w-full text-center shadow-2xl">
                      <div className="p-4 bg-amber-500/10 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-4">
                          <Save className="w-10 h-10 text-amber-500" />
                      </div>
                      <p className="text-white text-xl font-bold mb-2">DB 확정 저장</p>
                      <p className="text-slate-400 text-sm mb-6 leading-relaxed">
                          현재 메인 화면에 임시 적용된 <strong className="text-amber-400">{localUnsavedProjects.length}건</strong>의 데이터를 클라우드 DB에 완전히 저장합니다.<br/>
                          기존의 <strong>{currentTeam}</strong> 데이터를 모두 지우고 덮어쓰시겠습니까, 아니면 기존 데이터 아래에 추가하시겠습니까?
                      </p>
                      <div className="flex flex-col gap-3">
                          <button onClick={() => executeSaveUnsaved(true)} className="w-full px-4 py-3.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold transition-all shadow-md flex items-center justify-center gap-2">
                              <AlertTriangle size={16} /> 기존 데이터 삭제 및 덮어쓰기
                          </button>
                          <button onClick={() => executeSaveUnsaved(false)} className="w-full px-4 py-3.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-bold transition-all shadow-md flex items-center justify-center gap-2">
                              <Plus size={16} /> 기존 데이터 유지 및 추가 저장
                          </button>
                          <button onClick={() => setIsSaveConfirmModalOpen(false)} className="w-full mt-2 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold transition-all border border-slate-700">
                              취소
                          </button>
                      </div>
                  </div>
              </div>
          )}

          {confirmRowSaveId && (
              <div className="fixed inset-0 z-[200] flex justify-center items-center p-4 animate-in" style={{backgroundColor:'rgba(0,0,0,0.45)'}}>
                  <div className="w-full max-w-xs text-center shadow-2xl" style={{backgroundColor:'#ffffff',border:'2px solid #9aa8b8',padding:'28px 24px'}}>
                      <Save className="mx-auto mb-3" size={32} style={{color:'#1e7ac8'}}/>
                      <p style={{color:'#1a1a1a',fontSize:15,fontWeight:700,marginBottom:8}}>DB 저장</p>
                      <p style={{color:'#555',fontSize:12,marginBottom:20,lineHeight:1.6}}>해당 항목을 DB에 저장하시겠습니까?</p>
                      <div style={{display:'flex',gap:8}}>
                          <button onClick={() => setConfirmRowSaveId(null)} style={{flex:1,padding:'9px',backgroundColor:'#ebebeb',border:'1px solid #c0c0c0',fontWeight:700,fontSize:13,cursor:'pointer',color:'#333'}}>취소</button>
                          <button onClick={executeRowSave} style={{flex:1,padding:'9px',backgroundColor:'#1e7ac8',color:'#ffffff',fontWeight:700,fontSize:13,cursor:'pointer',border:'none'}}>저장</button>
                      </div>
                  </div>
              </div>
          )}

          {confirmDeleteId && (
              <div className="fixed inset-0 z-[200] flex justify-center items-center p-4 bg-slate-950/80 animate-in">
                  <div className="bg-slate-900 border border-slate-700 p-8 rounded-3xl max-w-sm w-full text-center shadow-2xl">
                          <Trash2 className="w-12 h-12 text-rose-500 mx-auto mb-4 opacity-80" />
                          <p className="text-white text-lg font-bold mb-2">프로젝트 삭제 표시</p>
                          <p className="text-slate-400 text-sm mb-3">이 프로젝트에 <b className="text-rose-400">'삭제' 도장</b>을 찍습니다.</p>
                          <p className="text-slate-500 text-xs mb-8">데이터와 이력은 보존됩니다. 상태 필터에서 '삭제'를 켜면<br/>다시 볼 수 있고, 상태를 바꾸면 복구됩니다.</p>
                          <div className="flex gap-3 justify-center">
                              <button onClick={() => setConfirmDeleteId(null)} className="flex-1 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold transition-all">취소</button>
                              <button onClick={executeDeleteProject} className="flex-1 px-4 py-3 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-rose-900/30">삭제 표시</button>
                          </div>
                  </div>
              </div>
          )}

          {/* A-4a: pid 일괄 발급 모달 — 스캔 → 확인 → 실행 → 완료 */}
          {pidMigModal && (
              <div className="fixed inset-0 z-[200] flex justify-center items-center p-4 bg-slate-950/80 animate-in">
                  <div className="bg-slate-900 border border-violet-500/30 p-8 rounded-3xl max-w-md w-full text-center shadow-2xl">
                      <ListChecks className="w-12 h-12 text-violet-400 mx-auto mb-4" />
                      <p className="text-white text-lg font-bold mb-2">고유 ID(pid) 일괄 발급</p>
                      {pidMigModal.stage === 'scan' && (
                          <p className="text-slate-400 text-sm mb-4">대상을 스캔하는 중...</p>
                      )}
                      {pidMigModal.stage === 'ready' && (
                          <>
                              <div className="text-left text-sm text-slate-300 bg-slate-800/60 rounded-xl p-4 mb-4 leading-7">
                                  <div>월간보고({currentTeam}): 전체 {pidMigModal.projTeamTotal}건 중 <b className="text-violet-300">{pidMigModal.projTargets.length}건</b> 발급 대상</div>
                                  <div>프로젝트 List: 전체 {pidMigModal.listTotal}건 중 <b className="text-violet-300">{pidMigModal.listTargets.length}건</b> 발급 대상</div>
                                  <div className="text-slate-500 text-xs mt-2">이미 ID가 있는 항목은 건드리지 않습니다. 내용·실적 데이터는 변경되지 않습니다.</div>
                              </div>
                              {(pidMigModal.projTargets.length + pidMigModal.listTargets.length) === 0 ? (
                                  <button onClick={() => setPidMigModal(null)} className="w-full px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold transition-all">모두 발급되어 있음 — 닫기</button>
                              ) : (
                                  <div className="flex gap-3 justify-center">
                                      <button onClick={() => setPidMigModal(null)} className="flex-1 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold transition-all">취소</button>
                                      <button onClick={runPidMigration} className="flex-1 px-4 py-3 bg-violet-600 hover:bg-violet-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-violet-900/30">발급 실행</button>
                                  </div>
                              )}
                          </>
                      )}
                      {pidMigModal.stage === 'running' && (
                          <p className="text-violet-300 text-sm mb-4 animate-pulse">발급 중... 창을 닫지 마세요</p>
                      )}
                      {pidMigModal.stage === 'done' && (
                          <>
                              <p className="text-emerald-400 text-sm mb-4 font-bold">완료! 월간보고 {pidMigModal.projN}건 + List {pidMigModal.listN}건 발급</p>
                              <button onClick={() => setPidMigModal(null)} className="w-full px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold transition-all">닫기</button>
                          </>
                      )}
                  </div>
              </div>
          )}

          {/* A-4b: 주간장부 pid 통일 병합 모달 */}
          {wkMigModal && (
              <div className="fixed inset-0 z-[200] flex justify-center items-center p-4 bg-slate-950/80 animate-in">
                  <div className="bg-slate-900 border border-cyan-500/30 p-8 rounded-3xl max-w-lg w-full text-center shadow-2xl">
                      <TrendingUp className="w-12 h-12 text-cyan-400 mx-auto mb-4" />
                      <p className="text-white text-lg font-bold mb-2">주간장부 통일 병합 (A-4b)</p>
                      {wkMigModal.stage === 'scan' && (
                          <p className="text-slate-400 text-sm mb-4">옛 장부(실행번호·행ID 이름)를 스캔하는 중...</p>
                      )}
                      {wkMigModal.stage === 'ready' && (
                          <>
                              <div className="text-left text-sm text-slate-300 bg-slate-800/60 rounded-xl p-4 mb-3 leading-6">
                                  <div>병합 가능: <b className="text-cyan-300">{wkMigModal.plans.length}건</b> / 충돌 보류: <b className="text-amber-300">{wkMigModal.conflictPlans.length}건</b> (전체 주간장부 {wkMigModal.totalRecs}개)</div>
                                  <div className="text-slate-500 text-xs mt-1">옛 장부는 지우지 않고 '이관 도장'만 찍습니다. 같은 주차에 같은 값은 1번만 남습니다.</div>
                              </div>
                              {wkMigModal.plans.length > 0 && (
                                  <div className="text-left text-xs bg-slate-800/40 rounded-xl p-3 mb-3 max-h-44 overflow-y-auto custom-scrollbar">
                                      {wkMigModal.plans.map(pl => (
                                          <div key={pl.pid} className="py-1 border-b border-slate-800 last:border-0">
                                              <span className="text-slate-200 font-bold">{pl.project}</span>
                                              <span className="text-slate-500"> — 옛 장부 {pl.sources.length}개 → 병합 후 합계 {pl.afterSum.toLocaleString()}</span>
                                          </div>
                                      ))}
                                  </div>
                              )}
                              {wkMigModal.conflictPlans.length > 0 && (
                                  <div className="text-left text-xs bg-amber-900/20 border border-amber-500/30 rounded-xl p-3 mb-3 max-h-32 overflow-y-auto custom-scrollbar">
                                      <div className="text-amber-300 font-bold mb-1">충돌 보류 (자동 병합 안 함 — 개별 확인 필요)</div>
                                      {wkMigModal.conflictPlans.map(pl => (
                                          <div key={pl.pid} className="py-0.5 text-amber-200/80">{pl.project} — 같은 주차 다른 값 {pl.confs.length}건</div>
                                      ))}
                                  </div>
                              )}
                              {(wkMigModal.ambiguous || []).length > 0 && (
                                  <div className="text-left text-xs bg-rose-900/20 border border-rose-500/30 rounded-xl p-3 mb-3 max-h-32 overflow-y-auto custom-scrollbar">
                                      <div className="text-rose-300 font-bold mb-1">주인 불명 보류 — 중복 실행번호 장부 (자동 병합 금지)</div>
                                      {wkMigModal.ambiguous.map(a => (
                                          <div key={a.key} className="py-0.5 text-rose-200/80">실행번호 '{a.key}' 장부 — 같은 번호 프로젝트 {a.count}개, 합계 {a.sum.toLocaleString()}pt → 어느 것인지 확인 필요</div>
                                      ))}
                                  </div>
                              )}
                              {wkMigModal.plans.length === 0 ? (
                                  <button onClick={() => setWkMigModal(null)} className="w-full px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold transition-all">병합할 옛 장부 없음 — 닫기</button>
                              ) : (
                                  <div className="flex gap-3 justify-center">
                                      <button onClick={() => setWkMigModal(null)} className="flex-1 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold transition-all">취소</button>
                                      <button onClick={runWkMigration} className="flex-1 px-4 py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-cyan-900/30">{wkMigModal.plans.length}건 병합 실행</button>
                                  </div>
                              )}
                          </>
                      )}
                      {wkMigModal.stage === 'running' && (
                          <p className="text-cyan-300 text-sm mb-4 animate-pulse">병합 중... 창을 닫지 마세요</p>
                      )}
                      {wkMigModal.stage === 'done' && (
                          <>
                              <p className="text-emerald-400 text-sm mb-2 font-bold">완료! {wkMigModal.n}건 병합 (충돌 보류 {wkMigModal.c}건)</p>
                              <p className="text-slate-500 text-xs mb-4">표의 시운전 숫자가 그대로인지 확인해주세요 (병합은 장부 이름 정리일 뿐, 숫자가 변하면 안 됩니다)</p>
                              <button onClick={() => setWkMigModal(null)} className="w-full px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold transition-all">닫기</button>
                          </>
                      )}
                  </div>
              </div>
          )}

          {isDeleteAllModalOpen && (
              <div className="fixed inset-0 z-[200] flex justify-center items-center p-4 bg-slate-950/80 animate-in">
                  <div className="bg-slate-900 border border-rose-500/30 p-8 rounded-3xl max-w-sm w-full text-center shadow-2xl">
                          <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto mb-4 animate-pulse" />
                          <p className="text-white text-lg font-bold mb-2">{currentTeam} 전체 데이터 삭제</p>
                          <p className="text-rose-400 text-sm mb-2 font-bold">경고: 이 작업은 절대 되돌릴 수 없습니다!</p>
                          <p className="text-slate-400 text-xs mb-8">현재 팀의 모든 프로젝트와 실적 데이터가 영구적으로 삭제됩니다. 계속하시겠습니까?</p>
                          <div className="flex gap-3 justify-center">
                              <button onClick={() => setIsDeleteAllModalOpen(false)} className="flex-1 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold transition-all">취소</button>
                              <button onClick={executeDeleteAllTeamProjects} className="flex-1 px-4 py-3 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-rose-900/30">모두 삭제하기</button>
                          </div>
                  </div>
              </div>
          )}
          
          {alertMessage && (
              <div className="fixed inset-0 z-[200] flex justify-center items-center p-4 bg-slate-950/80 animate-in">
                  <div className="bg-slate-900 border border-slate-700 p-8 rounded-3xl max-w-sm w-full text-center shadow-2xl whitespace-pre-line">
                          <p className="text-white text-lg font-bold mb-6">{alertMessage}</p>
                          <button onClick={() => setAlertMessage('')} className="px-6 py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-bold transition-all w-full">확인</button>
                  </div>
              </div>
          )}

          {/* ★ 월간 스냅샷 저장 확인 (월 선택 포함) ★ */}
          {monthlySnapModal && (() => {
              const existingMeta = fbSnapshots[snapSaveMonth] || null;
              const isOverwrite = !!existingMeta;
              const accentColor = isOverwrite ? '#d97706' : '#1e7ac8';
              return (
                  <div className="fixed inset-0 z-[200] flex justify-center items-center p-4 animate-in" style={{backgroundColor:'rgba(0,0,0,0.35)'}}>
                      <div className="w-full shadow-2xl" style={{backgroundColor:'#ffffff',border:'2px solid #9aa8b8',padding:'24px',maxWidth:320}}>
                          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
                              <BookMarked size={22} style={{color:accentColor,flexShrink:0}}/>
                              <p style={{color:'#1a1a1a',fontSize:15,fontWeight:700,margin:0}}>월간 업무현황 저장</p>
                          </div>

                          {/* 월 선택기 */}
                          <div style={{marginBottom:12}}>
                              <label style={{display:'block',color:'#555',fontSize:11,fontWeight:700,marginBottom:4}}>저장할 월 선택</label>
                              <input
                                  type="month"
                                  value={snapSaveMonth}
                                  onChange={e => setSnapSaveMonth(e.target.value)}
                                  style={{width:'100%',padding:'7px 10px',border:'2px solid #1e7ac8',fontSize:13,fontWeight:700,color:'#1a1a1a',backgroundColor:'#f8fbff',outline:'none',boxSizing:'border-box'}}
                              />
                          </div>

                          {/* 데이터 건수 */}
                          <p style={{color:'#555',fontSize:12,marginBottom:8,lineHeight:1.6}}>
                              현재 화면 데이터 <strong style={{color:'#1e7ac8'}}>{baseOrderedProjects.length}건</strong>을 저장합니다
                          </p>

                          {/* 덮어쓰기 경고 */}
                          {isOverwrite && (
                              <div style={{backgroundColor:'#fff8ed',border:'1px solid #f59e0b',padding:'8px 10px',marginBottom:12,fontSize:11,color:'#92400e',lineHeight:1.5}}>
                                  ⚠ {snapSaveMonth.replace('-','년 ')}월 데이터가 이미 있습니다<br/>
                                  <span style={{color:'#888'}}>저장일: {new Date(existingMeta.savedAt).toLocaleString('ko-KR')}</span><br/>
                                  기존 <strong style={{color:'#d97706'}}>{existingMeta.count}건</strong> → 현재 <strong style={{color:'#1e7ac8'}}>{baseOrderedProjects.length}건</strong>으로 갱신
                              </div>
                          )}

                          <div style={{display:'flex',gap:8}}>
                              <button onClick={() => setMonthlySnapModal(false)} style={{flex:1,padding:'9px',backgroundColor:'#ebebeb',border:'1px solid #c0c0c0',fontWeight:700,fontSize:13,cursor:'pointer',color:'#333'}}>취소</button>
                              <button onClick={executeMonthlySnap} disabled={!snapSaveMonth} style={{flex:1,padding:'9px',backgroundColor:accentColor,color:'#ffffff',fontWeight:700,fontSize:13,cursor:'pointer',border:'none',opacity:snapSaveMonth?1:0.4}}>
                                  {isOverwrite ? '갱신 저장' : '저장'}
                              </button>
                          </div>
                      </div>
                  </div>
              );
          })()}

          {/* ★ 로컬 → Firebase 마이그레이션 모달 ★ */}
          {migrateModal && (
              <div className="fixed inset-0 z-[200] flex justify-center items-center p-4 animate-in" style={{backgroundColor:'rgba(0,0,0,0.45)'}}>
                  <div className="w-full shadow-2xl" style={{backgroundColor:'#ffffff',border:'2px solid #9aa8b8',padding:'24px',maxWidth:360}}>
                      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
                          <Upload size={20} style={{color:'#7c3aed',flexShrink:0}}/>
                          <p style={{color:'#1a1a1a',fontSize:15,fontWeight:700,margin:0}}>로컬 데이터 → Firebase 이전</p>
                      </div>

                      {!migrateProgress ? (
                          <>
                              <p style={{color:'#555',fontSize:12,marginBottom:12,lineHeight:1.6}}>
                                  로컬에 저장된 <strong style={{color:'#7c3aed'}}>{localSnapMonths.length}개월</strong> 데이터를 Firebase로 이전합니다.
                              </p>
                              <div style={{border:'1px solid #e0e0e0',marginBottom:16,maxHeight:140,overflowY:'auto'}}>
                                  {localSnapMonths.map(m => {
                                      const snap = getMonthlySnaps()[currentTeam]?.[m];
                                      const alreadyInFb = !!fbSnapshots[m];
                                      return (
                                          <div key={m} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 10px',borderBottom:'1px solid #f0f0f0',fontSize:12}}>
                                              <span style={{fontWeight:700,color:'#1a1a1a'}}>{m.replace('-','년 ')}월</span>
                                              <span style={{color:'#888'}}>{snap?.count ?? 0}건</span>
                                              {alreadyInFb
                                                  ? <span style={{color:'#d97706',fontSize:11,fontWeight:700}}>FB 있음 (덮어씀)</span>
                                                  : <span style={{color:'#059669',fontSize:11,fontWeight:700}}>신규</span>}
                                          </div>
                                      );
                                  })}
                              </div>
                              <div style={{display:'flex',gap:8}}>
                                  <button onClick={() => setMigrateModal(false)} style={{flex:1,padding:'9px',backgroundColor:'#ebebeb',border:'1px solid #c0c0c0',fontWeight:700,fontSize:13,cursor:'pointer',color:'#333'}}>취소</button>
                                  <button onClick={executeMigration} style={{flex:1,padding:'9px',backgroundColor:'#7c3aed',color:'#ffffff',fontWeight:700,fontSize:13,cursor:'pointer',border:'none'}}>이전 시작</button>
                              </div>
                          </>
                      ) : (
                          <>
                              <div style={{marginBottom:12}}>
                                  <div style={{display:'flex',justifyContent:'space-between',fontSize:12,color:'#555',marginBottom:4}}>
                                      <span>진행 중...</span>
                                      <span style={{fontWeight:700,color:'#7c3aed'}}>{migrateProgress.done} / {migrateProgress.total}</span>
                                  </div>
                                  <div style={{height:6,backgroundColor:'#e0e0e0',overflow:'hidden'}}>
                                      <div style={{height:'100%',backgroundColor:'#7c3aed',width:`${(migrateProgress.done/migrateProgress.total)*100}%`,transition:'width 0.3s'}}/>
                                  </div>
                              </div>
                              <div style={{border:'1px solid #e0e0e0',marginBottom:16,maxHeight:140,overflowY:'auto'}}>
                                  {migrateProgress.log.map((item, i) => (
                                      <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'5px 10px',borderBottom:'1px solid #f0f0f0',fontSize:12}}>
                                          <span style={{fontWeight:700}}>{item.month.replace('-','년 ')}월</span>
                                          {item.ok
                                              ? <span style={{color:'#059669',fontWeight:700}}>✓ 완료 ({item.count}건)</span>
                                              : <span style={{color:'#dc2626',fontWeight:700}}>✗ 실패</span>}
                                      </div>
                                  ))}
                              </div>
                              {migrateProgress.done === migrateProgress.total ? (
                                  <button onClick={() => setMigrateModal(false)} style={{width:'100%',padding:'9px',backgroundColor:'#1e7ac8',color:'#ffffff',fontWeight:700,fontSize:13,cursor:'pointer',border:'none'}}>완료 — 닫기</button>
                              ) : (
                                  <button disabled style={{width:'100%',padding:'9px',backgroundColor:'#ccc',color:'#fff',fontWeight:700,fontSize:13,border:'none',cursor:'not-allowed'}}>이전 중...</button>
                              )}
                          </>
                      )}
                  </div>
              </div>
          )}

          {/* ★ 월간 저장 완료 토스트 ★ */}
          {monthlySnapToast && (
              <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[300] animate-in fade-in slide-in-from-bottom-4">
                  <div className="flex items-center gap-3 bg-slate-900 border border-emerald-500/60 px-5 py-3 rounded-2xl shadow-2xl">
                      <CheckCheck size={18} className="text-emerald-400 shrink-0" />
                      <span className="text-white font-bold text-sm">
                          {monthlySnapToast.month.replace('-', '년 ')}월 업무현황 저장 완료
                      </span>
                      <span className="text-slate-400 text-xs">({monthlySnapToast.count}건)</span>
                  </div>
              </div>
          )}

          {/* ★ 수동 등록 및 상세 수정 — 모달리스 드래그 창 ★ */}
          {isModalOpen && (
              <div
                  style={{
                      position: 'fixed',
                      left: editModalPos.x,
                      top: editModalPos.y,
                      width: 900,
                      height: '88vh',
                      zIndex: 60,
                      display: 'flex',
                      flexDirection: 'column',
                      backgroundColor: '#ffffff',
                      border: '2px solid #4e6880',
                      boxShadow: '0 8px 32px rgba(0,0,0,0.22)',
                      overflow: 'hidden',
                      userSelect: editModalDragRef.current.dragging ? 'none' : 'auto',
                  }}
              >
                  {/* 타이틀바 (드래그 핸들) */}
                  <div
                      onMouseDown={(e) => {
                          if (e.target.closest('button')) return;
                          editModalDragRef.current = { dragging: true, startX: e.clientX, startY: e.clientY, origX: editModalPos.x, origY: editModalPos.y };
                          e.preventDefault();
                      }}
                      style={{ cursor: 'move', backgroundColor: '#dce3ec', borderBottom: '2px solid #9aa8b8', padding: '6px 10px 4px', flexShrink: 0 }}
                  >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <Activity size={13} style={{ color: '#1e7ac8' }}/>
                              <span style={{ fontSize: 13, fontWeight: 800, color: '#1a1a1a' }}>{editingProject ? '업무 실적 상세 수정' : '프로젝트 등록'}</span>
                              {/* A-4a: 고유 ID(pid) 표시 — 발급 확인용 */}
                              {(formData.pid || editingProject?.pid) && (
                                  <span title="고유 ID (불변·자동 발급)" style={{ fontSize: 10, fontWeight: 700, color: '#5b21b6', background: 'rgba(124,58,237,0.10)', border: '1px solid rgba(124,58,237,0.35)', borderRadius: 4, padding: '1px 6px', marginLeft: 4 }}>
                                      ID: {formData.pid || editingProject?.pid}
                                  </span>
                              )}
                              <span style={{ fontSize: 10, color: '#888', fontWeight: 500, marginLeft: 4 }}>— 창을 끌어 이동할 수 있습니다</span>
                          </div>
                          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                              {[{k:'plc',l:'PLC'},{k:'etos',l:'ETOS'},{k:'hmi',l:'HMI'},{k:'internalTest',l:'자체'},{k:'integratedTest',l:'통합'}].map(({k,l}) =>
                                  ((formData.progressItems || DEFAULT_PROGRESS_ITEMS)[k]) !== false
                                      ? <span key={k} style={{fontSize:11,color:'#555',fontWeight:600}}>{l}: <b style={{color:'#1e7ac8'}}>{formData[k]??0}%</b></span>
                                      : null
                              )}
                              <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#666', display: 'flex', alignItems: 'center', padding: 2, marginLeft:6 }}><X size={16}/></button>
                          </div>
                      </div>
                  </div>

                  <form onSubmit={handleSubmit} style={{ flex: 1, display: 'flex', flexDirection: 'row', overflow: 'hidden', minHeight: 0 }}>
                      {/* Left: Excel-style label|value rows */}
                      <div style={{ flex: 1, overflowY: 'auto', borderRight: '1px solid #c4ccd8' }} className="custom-scrollbar">
                          {(() => {
                              const rowSt = {display:'flex', borderBottom:'1px solid #c4ccd8'};
                              const lbSt  = {backgroundColor:'#dce3ec', color:'#1a1a1a', fontWeight:700, fontSize:12, padding:'6px 10px', borderRight:'2px solid #9aa8b8', minWidth:96, flexShrink:0, display:'flex', alignItems:'center'};
                              const valSt = {flex:1, backgroundColor:'#ffffff', padding:0};
                              const inSt  = {width:'100%', border:'none', backgroundColor:'transparent', fontSize:12, padding:'6px 8px', outline:'none', color:'#000000', boxSizing:'border-box'};
                              return (<>
                                  <div style={rowSt}><div style={lbSt}>공장</div><div style={valSt}><select name="factory" required value={formData.factory} onChange={handleInputChange} style={inSt}>{currentFactoryOptions.map(f => <option key={f} value={f}>{f}</option>)}</select></div></div>
                                  <div style={rowSt}><div style={lbSt}>실행번호</div><div style={valSt}><input name="execNo" value={formData.execNo || ''} onChange={handleInputChange} style={inSt} placeholder="예) 2025-001"/></div></div>
                                  <div style={rowSt}><div style={lbSt}>견적번호</div><div style={valSt}><input name="estNo" value={formData.estNo || ''} onChange={handleInputChange} style={inSt} placeholder="견적 번호"/></div></div>
                                  <div style={rowSt}><div style={lbSt}>프로젝트명</div><div style={valSt}><input name="project" required value={formData.project} onChange={handleInputChange} style={inSt} placeholder="사업 명칭"/></div></div>
                                  <div style={rowSt}><div style={lbSt}>내용</div><div style={valSt}><input name="content" value={formData.content} onChange={handleInputChange} style={inSt} placeholder="상세 내용 및 목표"/></div></div>
                                  <div style={rowSt}><div style={lbSt}>진행현황</div><div style={valSt}><select name="progressStatus" value={formData.progressStatus ?? formData.status ?? ''} onChange={handleInputChange} style={inSt}>{currentStatusOptions.map(opt => <option key={opt.label} value={opt.label}>{opt.label === 'sub' ? '하위' : opt.label}</option>)}</select></div></div>
                                  <div style={rowSt}><div style={lbSt}>발주처</div><div style={valSt}><input name="client" value={formData.client || ''} onChange={handleInputChange} style={inSt} placeholder="발주처명"/></div></div>
                                  <div style={rowSt}><div style={lbSt}>투자심의</div><div style={valSt}><input name="investReview" value={formData.investReview || ''} onChange={handleInputChange} style={inSt} placeholder="투자심의 내용"/></div></div>
                                  <div style={rowSt}><div style={lbSt}>시작일</div><div style={valSt}><input type="date" name="startDate" value={formData.startDate} onChange={handleInputChange} style={inSt} className="color-scheme-dark"/></div></div>
                                  <div style={rowSt}><div style={lbSt}>완료일</div><div style={valSt}><input type="date" name="endDate" value={formData.endDate} onChange={handleInputChange} style={inSt} className="color-scheme-dark"/></div></div>
                                  <div style={rowSt}><div style={lbSt}>L1</div><div style={valSt}><input type="number" name="l1" min="0" max="100" value={formData.l1 ?? 0} onChange={handleInputChange} style={{...inSt, textAlign:'right'}}/></div></div>
                                  <div style={rowSt}><div style={lbSt}>L2</div><div style={valSt}><input type="number" name="l2" min="0" max="100" value={formData.l2 ?? 0} onChange={handleInputChange} style={{...inSt, textAlign:'right'}}/></div></div>
                                  <div style={rowSt}><div style={lbSt}>자재(%)</div><div style={valSt}><input type="number" name="material" min="0" max="100" value={formData.material ?? 0} onChange={handleInputChange} style={{...inSt, textAlign:'right'}}/></div></div>
                                  <div style={rowSt}>
                                      <div style={{...lbSt, alignItems:'flex-start', paddingTop:8}}>진행현황(%)<br/><span style={{fontSize:10,fontWeight:400,color:'#888'}}>적용 항목</span></div>
                                      <div style={{...valSt, padding:'6px 10px', display:'flex', flexWrap:'wrap', gap:6, alignItems:'center'}}>
                                          {[{k:'drawing',l:'도면입수'},{k:'iomap',l:'I/O Map'},{k:'screen',l:'화면작성'},{k:'baseinfo',l:'기준정보'},{k:'plc',l:'PLC'},{k:'etos',l:'ETOS'},{k:'hmi',l:'HMI'},{k:'internalTest',l:'자체시운전'},{k:'integratedTest',l:'통합시운전'}].map(({k,l}) => {
                                              const items = formData.progressItems || DEFAULT_PROGRESS_ITEMS;
                                              const applied = items[k] !== false;
                                              return (
                                                  <label key={k} style={{ display:'flex', alignItems:'center', gap:4, cursor:'pointer', padding:'3px 8px', border:`1px solid ${applied ? '#1e7ac8' : '#ccc'}`, backgroundColor: applied ? '#e8f0fe' : '#f5f5f5' }}>
                                                      <input type="checkbox" checked={applied} onChange={e => {
                                                          const checked = e.target.checked;
                                                          setFormData(prev => ({
                                                              ...prev,
                                                              progressItems: { ...DEFAULT_PROGRESS_ITEMS, ...(prev.progressItems || {}), [k]: checked }
                                                          }));
                                                      }} style={{ width:13, height:13, accentColor:'#1e7ac8', cursor:'pointer' }} />
                                                      <span style={{ fontSize:12, fontWeight:700, color: applied ? '#1e7ac8' : '#999' }}>{l}</span>
                                                  </label>
                                              );
                                          })}
                                          <span style={{fontSize:11,color:'#888',marginLeft:4}}>미체크 항목은 이 프로젝트 팝업에서 숨김 · 진행현황(%) 계산은 PLC·ETOS·HMI·자체·통합만 (저장해야 반영)</span>
                                      </div>
                                  </div>
                                  <div style={rowSt}><div style={lbSt}>담당자</div><div style={valSt}><select name="manager" required value={formData.manager} onChange={handleInputChange} style={inSt}>{currentManagerOptions.map(m => <option key={m} value={m}>{m}</option>)}</select></div></div>
                              </>);
                          })()}
                      </div>

                      {/* Right: Total Points + Monthly History + Buttons */}
                      <div style={{ width: 260, display: 'flex', flexDirection: 'column', flexShrink: 0, borderLeft: '1px solid #c4ccd8' }}>
                          <div style={{ flex: 1, overflowY: 'auto', padding: 10 }} className="custom-scrollbar">
                              <div style={{backgroundColor:'#d4dde8', borderBottom:'2px solid #4e6880', padding:'5px 10px', fontSize:11, fontWeight:800, color:'#1a1a1a', letterSpacing:'0.05em', marginBottom:6}}>TOTAL POINTS</div>
                              <input type="number" name="totalCommissioningPoints" value={formData.totalCommissioningPoints} onChange={handleInputChange} style={{width:'100%', padding:'6px 10px', fontSize:16, fontWeight:900, color:'#1e7ac8', textAlign:'right', marginBottom:12, border:'2px solid #c4ccd8', boxSizing:'border-box'}}/>
                              <div style={{backgroundColor:'#d4dde8', borderBottom:'2px solid #4e6880', padding:'5px 10px', fontSize:11, fontWeight:800, color:'#1a1a1a', letterSpacing:'0.05em', marginBottom:6, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                                  <span>월별 실적 합계</span>
                                  <span style={{color:'#059669', fontWeight:700}}>{(formData.monthlyPoints || []).reduce((sum, m) => sum + safeNumber(m.value), 0).toLocaleString()} pt</span>
                              </div>
                              <button type="button" onClick={addMonthlyPoint} style={{width:'100%', padding:'5px 8px', backgroundColor:'rgba(5,150,105,0.08)', border:'1px solid rgba(5,150,105,0.4)', color:'#059669', fontWeight:700, fontSize:12, marginBottom:8, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:4, boxSizing:'border-box'}}>
                                  <Plus size={14}/> 다음 달 추가
                              </button>
                              <div style={{display:'flex', flexDirection:'column', gap:2}}>
                                  {(formData.monthlyPoints || []).length === 0 ? (
                                      <div style={{textAlign:'center', padding:'16px', border:'1px dashed #c4ccd8', color:'#888', fontSize:11}}>
                                          등록된 월별 실적이 없습니다.<br/>우측 상단의 [+] 버튼을 눌러 추가하세요.
                                      </div>
                                  ) : (
                                      (formData.monthlyPoints || []).map((mp, index) => (
                                          <div key={index} style={{display:'flex', alignItems:'center', gap:4, borderBottom:'1px solid #c4ccd8', padding:'4px 2px'}}>
                                              <input type="month" value={mp.date} onChange={(e) => updateMonthlyPoint(index, 'date', e.target.value)} className="color-scheme-dark" style={{flex:1, border:'none', backgroundColor:'transparent', fontSize:12, fontWeight:700, outline:'none', color:'#000'}}/>
                                              <input type="number" value={mp.value} onChange={(e) => updateMonthlyPoint(index, 'value', e.target.value)} placeholder="실적" style={{width:64, textAlign:'right', fontWeight:700, color:'#059669', border:'1px solid #c4ccd8', padding:'2px 4px', fontSize:12}}/>
                                              <button type="button" onClick={() => deleteMonthlyPoint(index)} style={{color:'#888', background:'none', border:'none', cursor:'pointer', padding:'0 2px'}}><Trash2 size={14}/></button>
                                          </div>
                                      ))
                                  )}
                              </div>
                          </div>
                          <div style={{padding:'10px', borderTop:'2px solid #9aa8b8', backgroundColor:'#dce3ec', display:'flex', gap:6, flexShrink:0}}>
                              <button type="button" onClick={() => setIsModalOpen(false)} style={{flex:1, padding:'8px', backgroundColor:'#ebebeb', border:'1px solid #c0c0c0', fontWeight:700, fontSize:13, cursor:'pointer', color:'#333'}}>
                                  취소
                              </button>
                              <button type="submit" style={{flex:2, padding:'8px', backgroundColor: editingProject ? '#1e7ac8' : '#059669', color:'#ffffff', fontWeight:700, fontSize:13, cursor:'pointer', border:'none'}}>
                                  {editingProject ? 'DB 저장 반영' : '등록'}
                              </button>
                          </div>
                      </div>
                  </form>
              </div>
          )}

          {/* ★ 시스템 설정(Settings) 탭 모달 ★ */}
          {isSettingsOpen && (
              <div className="fixed inset-0 z-[100] flex justify-center items-center p-4 backdrop-blur-sm bg-slate-950/90">
                  <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
                      <div className="p-6 border-b border-slate-800 bg-slate-900/50 flex justify-between items-center shrink-0">
                          <div className="flex items-center gap-2"><Settings size={18} className="text-cyan-400"/><h3 className="text-lg font-bold text-white">팀 리스트 및 초기화면 설정</h3></div>
                          <button onClick={() => setIsSettingsOpen(false)} className="text-slate-500 hover:text-white"><X size={20} /></button>
                      </div>
                      
                      <div className="bg-slate-950/60 p-3 flex justify-between items-center border-b border-slate-800 shrink-0">
                          <div className="text-[11px] text-slate-400 font-medium flex items-center gap-1.5 ml-2">
                              <Activity size={14} className="text-indigo-400" />
                              DB/엑셀에서 누락된 항목 찾기
                          </div>
                          <button onClick={async () => {
                              setIsDbLoading(true);
                              const res = await extractAndSaveSettings([...allProjects, ...localUnsavedProjects]);
                              setIsDbLoading(false);
                              if (res) {
                                  setAlertMessage(`자동 추출 완료!\n공장 ${res.addedFactories}건, 상태 ${res.addedStatuses}건, 담당자 ${res.addedManagers}건이 설정에 새롭게 추가되었습니다.`);
                              } else {
                                  setAlertMessage("현재 데이터에 등록되지 않은 새로운 항목이 없습니다.");
                              }
                          }} className="flex items-center gap-1 bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/30 text-indigo-300 hover:text-indigo-200 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm">
                              <Database size={12} /> 일괄 추출 및 저장
                          </button>
                      </div>

                      <div className="flex border-b border-slate-800 bg-slate-950/30 overflow-x-auto custom-scrollbar shrink-0">
                          {['defaults', 'status', 'factory', 'manager'].map(tab => (
                              <button key={tab} onClick={() => { setSettingsTab(tab); setNewItemInput(''); }} className={`flex-1 min-w-[80px] py-4 px-2 text-[11px] font-bold uppercase tracking-widest transition-all whitespace-nowrap ${settingsTab === tab ? 'text-cyan-400 border-b-2 border-cyan-500 bg-cyan-500/5' : 'text-slate-500 hover:text-slate-300'}`}>
                                  {tab === 'defaults' ? '초기화면' : tab === 'status' ? '상태(현황)' : tab === 'factory' ? '공장코드' : '담당자'}
                              </button>
                          ))}
                      </div>
                      
                      <div className="p-6 space-y-6 flex-1 overflow-y-auto max-h-[400px] custom-scrollbar text-left font-bold relative">
                          {settingsTab === 'defaults' ? (
                              <div className="space-y-6 animate-in">
                                  <div className="p-4 bg-cyan-500/10 border border-cyan-500/20 rounded-xl mb-2">
                                      <p className="text-xs text-cyan-300 font-medium leading-relaxed">
                                          <Info size={14} className="inline mr-1 mb-0.5" />
                                          메인 화면 진입 시 <b>기본으로 띄워둘 항목</b>을 선택하세요. <br/>
                                          <span className="text-slate-400 text-[10px] mt-1 block">(* 체크를 해제하면 해당 항목은 사용자가 버튼을 누르기 전까지 숨겨집니다.)</span>
                                      </p>
                                  </div>
                                  
                                  <div className="space-y-3">
                                      <h4 className="text-xs font-bold text-slate-400 uppercase border-b border-slate-800 pb-2 flex items-center gap-2"><BarChart3 size={14} /> 기본 표시 현황 (Status)</h4>
                                      <div className="grid grid-cols-2 gap-2">
                                          {currentStatusOptions.map(s => {
                                              const isActive = (teamSettings[currentTeam]?.defaultActiveStatuses || []).includes(s.label);
                                              return (
                                                  <label key={s.label} className={`flex items-center gap-2.5 cursor-pointer p-2.5 rounded-xl border transition-all hover:bg-slate-800 ${isActive ? 'bg-slate-800/50 border-cyan-500/30' : 'bg-slate-900 border-slate-800 opacity-60'}`}>
                                                      <input type="checkbox" checked={isActive} onChange={() => toggleDefaultActive('status', s.label)} className="w-4 h-4 accent-cyan-500 rounded bg-slate-800 border-slate-700 cursor-pointer" />
                                                      <div className={`w-2 h-2 rounded-full ${s.color}`}></div>
                                                      <span className={`text-xs font-bold ${isActive ? 'text-slate-200' : 'text-slate-500'}`}>{s.label}</span>
                                                  </label>
                                              )
                                          })}
                                      </div>
                                  </div>

                                  <div className="space-y-3">
                                      <h4 className="text-xs font-bold text-slate-400 uppercase border-b border-slate-800 pb-2 flex items-center gap-2"><LayoutGrid size={14} /> 기본 표시 공장 (Factory)</h4>
                                      <div className="grid grid-cols-2 gap-2">
                                          {currentFactoryOptions.map(f => {
                                              const isActive = (teamSettings[currentTeam]?.defaultActiveFactories || []).includes(f);
                                              return (
                                                  <label key={f} className={`flex items-center gap-2.5 cursor-pointer p-2.5 rounded-xl border transition-all hover:bg-slate-800 ${isActive ? 'bg-slate-800/50 border-indigo-500/30' : 'bg-slate-900 border-slate-800 opacity-60'}`}>
                                                      <input type="checkbox" checked={isActive} onChange={() => toggleDefaultActive('factory', f)} className="w-4 h-4 accent-indigo-500 rounded bg-slate-800 border-slate-700 cursor-pointer" />
                                                      <span className={`text-xs font-bold ${isActive ? 'text-slate-200' : 'text-slate-500'}`}>{f}</span>
                                                  </label>
                                              )
                                          })}
                                      </div>
                                  </div>
                              </div>
                          ) : (
                              <div className="animate-in space-y-6">
                                  <div className="flex gap-2">
                                      <input type="text" value={newItemInput} onChange={(e) => setNewItemInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addItemToOptions()} placeholder={`${settingsTab === 'status' ? '신규 상태' : settingsTab === 'factory' ? '신규 공장코드' : '신규 담당자'} 입력`} className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:ring-1 focus:ring-cyan-500 outline-none font-bold text-white" />
                                      <button onClick={addItemToOptions} className="bg-cyan-600 hover:bg-cyan-500 text-white px-4 rounded-xl font-bold shadow-md"><Plus size={18} /></button>
                                  </div>
                                  {settingsTab === 'status' && (
                                      <button onClick={() => {
                                          const next = JSON.parse(JSON.stringify(teamSettings));
                                          next[currentTeam].status = [...defaultStatusOptions];
                                          setTeamSettings(next);
                                          saveSettingsToDB(next);
                                      }} className="w-full py-2 bg-amber-600/20 hover:bg-amber-600/40 border border-amber-500/30 text-amber-400 text-xs font-bold rounded-lg transition-all">
                                          ↺ 기본 상태 목록으로 초기화
                                      </button>
                                  )}
                                  
                                  <div className="space-y-2 pb-4">
                                      {currentSettingsList.map((item) => (
                                          <div 
                                              key={item} 
                                              draggable
                                              onDragStart={(e) => {
                                                  setDraggedSettingKey(item);
                                                  e.dataTransfer.effectAllowed = 'move';
                                              }}
                                              onDragEnter={(e) => {
                                                  e.preventDefault();
                                                  if (!draggedSettingKey || draggedSettingKey === item) return;
                                                  setTeamSettings(prevSettings => {
                                                      const next = JSON.parse(JSON.stringify(prevSettings));
                                                      const list = next[currentTeam][settingsTab].filter(Boolean);

                                                      const getLabel = (x) => typeof x === 'string' ? x : x.label;

                                                      const draggedIdx = list.findIndex(x => getLabel(x) === draggedSettingKey);
                                                      const targetIdx = list.findIndex(x => getLabel(x) === item);
                                                      
                                                      if (draggedIdx !== -1 && targetIdx !== -1 && draggedIdx !== targetIdx) {
                                                          const draggedObj = list[draggedIdx];
                                                          list.splice(draggedIdx, 1);
                                                          list.splice(targetIdx, 0, draggedObj);
                                                      }
                                                      next[currentTeam][settingsTab] = list;
                                                      return next;
                                                  });
                                              }}
                                              onDragEnd={() => {
                                                  setDraggedSettingKey(null);
                                                  setTeamSettings(prevSettings => {
                                                      saveSettingsToDB(prevSettings);
                                                      return prevSettings;
                                                  });
                                              }}
                                              onDragOver={(e) => e.preventDefault()}
                                              className={`flex items-center justify-between bg-slate-950/50 p-4 rounded-2xl border border-slate-800 group hover:border-slate-600 transition-all cursor-grab active:cursor-grabbing ${draggedSettingKey === item ? 'opacity-40 border-dashed border-cyan-500 bg-slate-900 scale-[0.98]' : 'opacity-100'}`}
                                          >
                                              <div className="flex items-center gap-3 pointer-events-none">
                                                  <Menu size={14} className="text-slate-600 group-hover:text-slate-400 mr-1" />
                                                  {settingsTab === 'status' && <div className={`w-2 h-2 rounded-full ${currentStatusOptions.find(s => s && s.label === item)?.color}`}></div>}
                                                  {settingsTab === 'factory' && <LayoutGrid size={14} className="text-slate-500" />}
                                                  {settingsTab === 'manager' && <Users size={14} className="text-slate-500" />}
                                                  <span className="text-sm font-bold text-slate-200">{item}</span>
                                              </div>
                                              <button onClick={() => removeItemFromOptions(item)} className="text-slate-600 hover:text-rose-500 p-1"><Trash2 size={16} /></button>
                                          </div>
                                      ))}
                                  </div>
                              </div>
                          )}
                      </div>
                      <div className="p-6 border-t border-slate-800 bg-slate-950/50 shrink-0">
                          <button onClick={() => setIsSettingsOpen(false)} className="w-full py-3.5 bg-slate-800 hover:bg-slate-700 rounded-2xl font-bold text-sm border border-slate-700 transition-all text-white">설정 닫기</button>
                      </div>
                  </div>
              </div>
          )}

          {/* ★ 엑셀 미리보기 테이블 모달 직접 렌더링 로직 (독립적이고 가장 안전한 형태) ★ */}
          {isExcelPreviewOpen && stagedExcelData && (
              <div className="fixed inset-0 z-[150] flex justify-center items-start overflow-y-auto p-4 md:p-8 backdrop-blur-md bg-slate-950/80 custom-scrollbar">
                  <div className="absolute inset-0" onClick={() => {setIsExcelPreviewOpen(false); setStagedExcelData(null);}}></div>
                  <div className="relative bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-[95vw] shadow-2xl flex flex-col mt-10 mb-10 transition-all animate-in h-[85vh] overflow-hidden">
                      <div className="p-6 border-b border-slate-800 bg-slate-900/50 flex justify-between items-center shrink-0">
                          <div className="flex items-center gap-3">
                              <div className="p-2 bg-emerald-600/20 rounded-lg border border-emerald-500/30">
                                  <Database size={18} className="text-emerald-400"/>
                              </div>
                              <h3 className="text-xl font-bold text-white">업로드 데이터 전체 검증</h3>
                              <span className="ml-2 px-3 py-1 bg-slate-800 text-slate-300 rounded-full text-xs font-bold border border-slate-700">총 {stagedExcelData.length}건 읽어옴</span>
                          </div>
                          <div className="flex items-center gap-4">
                              <span className="text-xs text-slate-400">💡 표 제목을 <b>우클릭</b>하면 열 고정/해제가 가능합니다.</span>
                              <button onClick={() => {setIsExcelPreviewOpen(false); setStagedExcelData(null);}} className="text-slate-500 hover:text-white transition-colors"><X size={24}/></button>
                          </div>
                      </div>
                      
                      <div className="bg-slate-900/40 overflow-hidden backdrop-blur-sm flex-1 flex flex-col z-0 relative min-h-0">
                          {renderTable(visiblePreviewProjects, excelPreviewColDefs, true)}
                      </div>
                      
                      <div className="p-6 border-t border-slate-800 bg-slate-950/50 flex flex-wrap gap-3 justify-end rounded-b-3xl shrink-0">
                          <button onClick={() => {setIsExcelPreviewOpen(false); setStagedExcelData(null);}} className="px-6 py-3.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl font-bold text-slate-300 transition-colors">
                              취소 (다시 업로드)
                          </button>
                          <button onClick={handlePreviewOnMain} className="px-6 py-3.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-black text-white shadow-xl shadow-indigo-900/20 transition-all flex items-center gap-2">
                              <LayoutGrid size={18} /> 메인 화면에 임시 적용
                          </button>
                          <button onClick={handleSaveStagedData} className="px-8 py-3.5 bg-emerald-600 hover:bg-emerald-500 rounded-xl font-black text-white shadow-xl shadow-emerald-900/20 transition-all flex items-center gap-2">
                              <Save size={18} /> DB 바로 저장
                          </button>
                      </div>
                  </div>
              </div>
          )}

          {/* ★ 프로젝트 List 업로드 미리보기 모달 ★ */}
          {isDynamicPreviewOpen && stagedDynamicData && (
              <div className="fixed inset-0 z-[150] flex justify-center items-start overflow-y-auto p-4 md:p-8 backdrop-blur-md bg-slate-950/80 custom-scrollbar">
                  <div className="absolute inset-0" onClick={() => {setIsDynamicPreviewOpen(false); setStagedDynamicData([]); setStagedDynamicCols([]);}}></div>
                  <div className="relative bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-[95vw] shadow-2xl flex flex-col mt-10 mb-10 transition-all animate-in h-[85vh] overflow-hidden">
                      <div className="p-6 border-b border-slate-800 bg-slate-900/50 flex justify-between items-center shrink-0">
                          <div className="flex items-center gap-3">
                              <div className="p-2 bg-amber-600/20 rounded-lg border border-amber-500/30">
                                  <FileText size={18} className="text-amber-400"/>
                              </div>
                              <h3 className="text-xl font-bold text-white">업로드 프로젝트 목록 검증</h3>
                              <span className="ml-2 px-3 py-1 bg-slate-800 text-slate-300 rounded-full text-xs font-bold border border-slate-700">총 {stagedDynamicData.length}건 읽어옴</span>
                          </div>
                          <div className="flex items-center gap-4">
                              <button onClick={() => {setIsDynamicPreviewOpen(false); setStagedDynamicData([]); setStagedDynamicCols([]);}} className="text-slate-500 hover:text-white transition-colors"><X size={24}/></button>
                          </div>
                      </div>
                      
                      <div className="bg-slate-900/40 overflow-hidden backdrop-blur-sm flex-1 flex flex-col z-0 relative min-h-0">
                          <div className="overflow-auto flex-1 custom-scrollbar bg-slate-950/50 relative">
                              <table className="w-full text-left border-collapse table-fixed min-w-[max-content]">
                                  <thead className="sticky top-0 bg-slate-900 shadow-md z-40">
                                      <tr className="text-slate-500 text-[11px] font-bold uppercase tracking-widest border-b border-slate-800 whitespace-nowrap">
                                          <th className="px-4 py-3 bg-slate-900 text-center w-16 border-r border-slate-800">No.</th>
                                          {stagedDynamicCols.map(col => (
                                              <th key={col.key} className="px-4 py-3 bg-slate-900 tracking-wider border-r border-slate-800/50 whitespace-nowrap">{col.label}</th>
                                          ))}
                                      </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-800/50">
                                      {stagedDynamicData.map((row, idx) => (
                                          <tr key={row.id} className="hover:bg-white/5 transition-colors">
                                              <td className="px-4 py-3 text-center text-slate-500 font-mono border-r border-slate-800/50 text-[11px] bg-slate-900/30">{idx + 1}</td>
                                              {stagedDynamicCols.map(col => (
                                                  <td key={col.key} className="px-4 py-3 text-slate-300 border-r border-slate-800/20 max-w-[200px] truncate" title={row[col.key]}>{row[col.key]}</td>
                                              ))}
                                          </tr>
                                      ))}
                                  </tbody>
                              </table>
                          </div>
                      </div>
                      
                      <div className="p-6 border-t border-slate-800 bg-slate-950/50 flex flex-wrap gap-3 justify-end rounded-b-3xl shrink-0">
                          <button onClick={() => { setIsDynamicPreviewOpen(false); setStagedDynamicData([]); setStagedDynamicCols([]); }} className="px-6 py-3.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl font-bold text-slate-300 transition-colors">
                              취소 (다시 업로드)
                          </button>
                          <button onClick={handleDynamicPreviewOnMain} className="px-6 py-3.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-black text-white shadow-xl shadow-indigo-900/20 transition-all flex items-center gap-2">
                              <LayoutGrid size={18} /> 메인 화면에 임시 적용
                          </button>
                          <button onClick={handleSaveDynamicDataDirect} className="px-8 py-3.5 bg-emerald-600 hover:bg-emerald-500 rounded-xl font-black text-white shadow-xl shadow-emerald-900/20 transition-all flex items-center gap-2">
                              <Save size={18} /> DB 바로 저장
                          </button>
                      </div>
                  </div>
              </div>
          )}

      {/* ── 팀 실적 그래프 모달 ── */}
      {showTeamGraph && teamGraphData && (() => {
          const { timeline, maxCount, targetStatuses, statusColors } = teamGraphData;
          const BAR_H = 260;
          const colW  = Math.max(60, Math.round(80 * teamChartZoom));
          const totalW = colW * timeline.length;
          const yTick  = (v) => Math.round(BAR_H - (v / maxCount) * BAR_H);
          // Y축 눈금: maxCount에 따라 적절한 간격
          const step = maxCount <= 5 ? 1 : maxCount <= 10 ? 2 : maxCount <= 20 ? 5 : 10;
          const yGridLines = Array.from({length: Math.floor(maxCount/step)+1}, (_,i) => i*step);

          return (
              <div style={{position:'fixed',inset:0,zIndex:700,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.5)',backdropFilter:'blur(4px)'}}
                  onClick={() => setShowTeamGraph(false)}>
                  <div style={{background:'#fff',border:'1px solid #c4ccd8',boxShadow:'0 8px 32px rgba(0,0,0,0.18)',width:'min(96vw,1100px)',maxHeight:'92vh',display:'flex',flexDirection:'column',overflow:'hidden'}}
                      onClick={e => e.stopPropagation()}>

                      {/* 헤더 */}
                      <div style={{background:'#dce3ec',borderBottom:'2px solid #9aa8b8',padding:'10px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
                          <div style={{display:'flex',alignItems:'center',gap:8}}>
                              <BarChart3 size={16} color="#4f46e5"/>
                              <span style={{fontWeight:800,fontSize:14,color:'#1a1a1a'}}>팀 실적 그래프</span>
                              <span style={{fontSize:12,color:'#444',fontWeight:600,marginLeft:4}}>{currentTeam}</span>
                              <span style={{fontSize:11,color:'#888',fontWeight:500}}>— 최근 12개월 월별 프로젝트 현황 (건수)</span>
                          </div>
                          <div style={{display:'flex',alignItems:'center',gap:10}}>
                              <span style={{fontSize:11,color:'#888',fontWeight:600}}>줌</span>
                              <button onClick={() => setTeamChartZoom(z => Math.max(0.5, parseFloat((z-0.2).toFixed(1))))}
                                  style={{padding:'2px 10px',border:'1px solid #b0b8c8',background:'#f0f4f8',fontWeight:800,fontSize:14,cursor:'pointer',color:'#4f46e5'}}>−</button>
                              <span style={{fontSize:12,fontWeight:700,color:'#4f46e5',minWidth:36,textAlign:'center'}}>{Math.round(teamChartZoom*100)}%</span>
                              <button onClick={() => setTeamChartZoom(z => Math.min(3, parseFloat((z+0.2).toFixed(1))))}
                                  style={{padding:'2px 10px',border:'1px solid #b0b8c8',background:'#f0f4f8',fontWeight:800,fontSize:14,cursor:'pointer',color:'#4f46e5'}}>＋</button>
                              <button onClick={() => setTeamChartZoom(1)} style={{padding:'2px 8px',border:'1px solid #b0b8c8',background:'#f0f4f8',fontSize:11,fontWeight:700,cursor:'pointer',color:'#666',marginLeft:2}}>초기화</button>
                              <button onClick={() => setShowTeamGraph(false)} style={{marginLeft:8,background:'none',border:'none',cursor:'pointer',color:'#666',display:'flex',alignItems:'center'}}><X size={18}/></button>
                          </div>
                      </div>

                      {/* 범례 */}
                      <div style={{display:'flex',gap:16,padding:'6px 16px',background:'#f5f8fb',borderBottom:'1px solid #dce3ec',flexShrink:0,flexWrap:'wrap',alignItems:'center'}}>
                          {targetStatuses.map(s => (
                              <div key={s} style={{display:'flex',alignItems:'center',gap:5}}>
                                  <div style={{width:28,height:3,background:statusColors[s]}}/>
                                  <span style={{fontSize:11,color:'#444',fontWeight:700}}>{s}</span>
                              </div>
                          ))}
                          <span style={{fontSize:10,color:'#bbb',marginLeft:4}}>* 월별 진행현황이 기록된 프로젝트 기준</span>
                      </div>

                      {/* 차트 영역 */}
                      <div style={{flex:1,overflow:'auto',minHeight:0,padding:'16px 16px 8px'}} className="custom-scrollbar">
                          <div style={{display:'flex',minWidth:totalW+96}}>

                              {/* Y축 */}
                              <div style={{width:40,flexShrink:0,position:'relative',height:BAR_H+36}}>
                                  {yGridLines.map(v => (
                                      <div key={v} style={{position:'absolute',right:4,bottom:Math.round((v/maxCount)*BAR_H)+24,fontSize:10,color:'#888',fontWeight:600,textAlign:'right',lineHeight:1}}>
                                          {v}
                                      </div>
                                  ))}
                                  <div style={{position:'absolute',right:4,top:0,fontSize:10,color:'#4f46e5',fontWeight:700}}>건</div>
                              </div>

                              {/* 라인 차트 영역 */}
                              <div style={{flex:1,position:'relative',height:BAR_H+36}}>

                                  {/* 격자 + 라인 SVG */}
                                  <svg style={{position:'absolute',top:0,left:0,width:totalW,height:BAR_H+24,overflow:'visible',pointerEvents:'none'}}>
                                      {/* 수평 격자선 */}
                                      {yGridLines.map(v => (
                                          <line key={v} x1="0" y1={yTick(v)} x2={totalW} y2={yTick(v)}
                                              stroke={v===0?'#9aa8b8':'#e0e5ec'} strokeWidth={v===0?2:1} strokeDasharray={v===0?'':'5,3'}/>
                                      ))}
                                      {/* 수직 월 구분선 */}
                                      {timeline.map((t,i) => (
                                          <line key={t.date} x1={i*colW} y1={0} x2={i*colW} y2={BAR_H}
                                              stroke={t.showYear && i>0 ? '#4f46e5' : '#e8ecf0'}
                                              strokeWidth={t.showYear && i>0 ? 1.5 : 1}
                                              strokeOpacity={t.showYear && i>0 ? 0.35 : 1}/>
                                      ))}
                                      {/* 상태별 굵은 꺾은선 */}
                                      {targetStatuses.map(s => {
                                          const pts = timeline.map((t,i) => `${i*colW + colW/2},${yTick(t.counts[s]||0)}`).join(' ');
                                          return (
                                              <g key={s}>
                                                  <polyline points={pts} fill="none" stroke={statusColors[s]} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round"/>
                                                  {/* 데이터 포인트 도트 */}
                                                  {timeline.map((t,i) => {
                                                      const cnt = t.counts[s] || 0;
                                                      return (
                                                          <circle key={t.date} cx={i*colW + colW/2} cy={yTick(cnt)}
                                                              r={cnt > 0 ? 4 : 2.5}
                                                              fill={cnt > 0 ? statusColors[s] : '#fff'}
                                                              stroke={statusColors[s]} strokeWidth={2}/>
                                                      );
                                                  })}
                                                  {/* 값 레이블 (0 제외) */}
                                                  {timeline.map((t,i) => {
                                                      const cnt = t.counts[s] || 0;
                                                      if (!cnt) return null;
                                                      return (
                                                          <text key={t.date} x={i*colW + colW/2} y={yTick(cnt)-8}
                                                              textAnchor="middle" fontSize={9} fontWeight="800" fill={statusColors[s]}>
                                                              {cnt}
                                                          </text>
                                                      );
                                                  })}
                                              </g>
                                          );
                                      })}
                                  </svg>

                                  {/* X축 라벨 (SVG 아래) */}
                                  <div style={{position:'absolute',bottom:0,left:0,display:'flex',width:totalW}}>
                                      {timeline.map((t,i) => (
                                          <div key={t.date} style={{width:colW,flexShrink:0,textAlign:'center'}}>
                                              {t.showYear && <div style={{fontSize:9,fontWeight:800,color:'#4f46e5',lineHeight:1.2}}>{t.date.slice(0,4)}년</div>}
                                              <div style={{fontSize:10,fontWeight:700,color:'#1a1a1a',lineHeight:1.3}}>{parseInt(t.date.slice(5,7),10)}월</div>
                                          </div>
                                      ))}
                                  </div>
                              </div>
                          </div>
                      </div>

                      {/* 하단 데이터 테이블 */}
                      <div style={{flexShrink:0,borderTop:'2px solid #9aa8b8',overflow:'auto',maxHeight:180}} className="custom-scrollbar">
                          <table style={{width:'100%',fontSize:10,minWidth:totalW+96}}>
                              <thead>
                                  <tr style={{background:'#dce3ec'}}>
                                      <th style={{padding:'3px 6px',borderRight:'1px solid #b0b8c8',textAlign:'left',fontWeight:700,color:'#1a1a1a',width:60,position:'sticky',left:0,background:'#dce3ec',whiteSpace:'nowrap'}}>상태</th>
                                      {timeline.map(t => (
                                          <th key={t.date} style={{padding:'2px 4px',borderRight:'1px solid #c4ccd8',textAlign:'center',fontWeight:700,color:'#1a1a1a',whiteSpace:'nowrap',minWidth:colW}}>
                                              {t.showYear && <div style={{fontSize:8,color:'#4f46e5',lineHeight:1.2}}>{t.date.slice(0,4)}년</div>}
                                              <div style={{lineHeight:1.2,fontSize:10}}>{parseInt(t.date.slice(5,7),10)}월</div>
                                          </th>
                                      ))}
                                  </tr>
                              </thead>
                              <tbody>
                                  {targetStatuses.map(s => (
                                      <tr key={s}>
                                          <td style={{padding:'2px 6px',borderRight:'1px solid #c4ccd8',borderBottom:'1px solid #e0e5ec',fontWeight:700,position:'sticky',left:0,background:'#f5f8fb',whiteSpace:'nowrap'}}>
                                              <span style={{display:'inline-block',width:8,height:8,background:statusColors[s],marginRight:4,verticalAlign:'middle',flexShrink:0}}/>
                                              <span style={{color:statusColors[s],fontSize:10}}>{s}</span>
                                          </td>
                                          {timeline.map(t => (
                                              <td key={t.date} style={{padding:'2px 4px',borderRight:'1px solid #e0e5ec',borderBottom:'1px solid #e0e5ec',textAlign:'center',fontWeight:600,color: t.counts[s]>0 ? statusColors[s] : '#ddd'}}>
                                                  {t.counts[s] > 0 ? t.counts[s] : '—'}
                                              </td>
                                          ))}
                                      </tr>
                                  ))}
                                  <tr style={{background:'#edf1f7'}}>
                                      <td style={{padding:'2px 6px',borderRight:'1px solid #c4ccd8',fontWeight:800,color:'#1a1a1a',position:'sticky',left:0,background:'#dce3ec',fontSize:10}}>합계</td>
                                      {timeline.map(t => (
                                          <td key={t.date} style={{padding:'2px 4px',borderRight:'1px solid #c4ccd8',textAlign:'center',fontWeight:800,color:'#1a1a1a',fontSize:10}}>
                                              {t.totalCount > 0 ? t.totalCount : '—'}
                                          </td>
                                      ))}
                                  </tr>
                              </tbody>
                          </table>
                      </div>
                  </div>
              </div>
          );
      })()}

      {/* ── 실적 그래프 모달 ── */}
      {graphProject && graphData && (() => {
          const { timeline, totalPoints, totalAcc, progressPercent, startDateStr, endDateStr } = graphData;
          const BAR_H = 260;
          const colW  = Math.max(56, Math.round(80 * chartZoom));
          const totalW = colW * timeline.length;
          const maxY = totalPoints > 0 ? totalPoints : Math.max(...timeline.map(t => t.accPt), 10);

          const yTick = (v) => Math.round(BAR_H - (v / maxY) * BAR_H);

          // Y축 눈금 (5단계)
          const yGridLines = Array.from({length:6}, (_,i) => Math.round((maxY / 5) * i));

          return (
              <div style={{position:'fixed',inset:0,zIndex:700,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.5)',backdropFilter:'blur(4px)'}}
                  onClick={() => setGraphProject(null)}>
                  <div style={{background:'#fff',border:'1px solid #c4ccd8',boxShadow:'0 8px 32px rgba(0,0,0,0.18)',width:'min(96vw,1100px)',maxHeight:'92vh',display:'flex',flexDirection:'column',overflow:'hidden'}}
                      onClick={e => e.stopPropagation()}>

                      {/* 헤더 */}
                      <div style={{background:'#dce3ec',borderBottom:'2px solid #9aa8b8',padding:'10px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
                          <div style={{display:'flex',alignItems:'center',gap:8}}>
                              <BarChart3 size={16} color="#1e7ac8"/>
                              <span style={{fontWeight:800,fontSize:14,color:'#1a1a1a'}}>실적 그래프</span>
                              <span style={{fontSize:12,color:'#444',fontWeight:600,marginLeft:4}}>{graphProject.project}</span>
                          </div>
                          <div style={{display:'flex',alignItems:'center',gap:10}}>
                              {/* 줌 컨트롤 */}
                              <span style={{fontSize:11,color:'#888',fontWeight:600}}>줌</span>
                              <button onClick={() => setChartZoom(z => Math.max(0.5, parseFloat((z-0.2).toFixed(1))))}
                                  style={{padding:'2px 10px',border:'1px solid #b0b8c8',background:'#f0f4f8',fontWeight:800,fontSize:14,cursor:'pointer',color:'#1e7ac8'}}>−</button>
                              <span style={{fontSize:12,fontWeight:700,color:'#1e7ac8',minWidth:36,textAlign:'center'}}>{Math.round(chartZoom*100)}%</span>
                              <button onClick={() => setChartZoom(z => Math.min(3, parseFloat((z+0.2).toFixed(1))))}
                                  style={{padding:'2px 10px',border:'1px solid #b0b8c8',background:'#f0f4f8',fontWeight:800,fontSize:14,cursor:'pointer',color:'#1e7ac8'}}>＋</button>
                              <button onClick={() => setChartZoom(1)} style={{padding:'2px 8px',border:'1px solid #b0b8c8',background:'#f0f4f8',fontSize:11,fontWeight:700,cursor:'pointer',color:'#666',marginLeft:2}}>초기화</button>
                              <button onClick={() => setGraphProject(null)} style={{marginLeft:8,background:'none',border:'none',cursor:'pointer',color:'#666',display:'flex',alignItems:'center'}}><X size={18}/></button>
                          </div>
                      </div>

                      {/* 요약 배지 */}
                      <div style={{display:'flex',gap:12,padding:'8px 16px',background:'#f5f8fb',borderBottom:'1px solid #dce3ec',flexShrink:0,flexWrap:'wrap',alignItems:'center'}}>
                          {[
                              {l:'총 Point',   v:`${totalPoints.toLocaleString()} pt`, c:'#1e7ac8'},
                              {l:'누적 실적',  v:`${totalAcc.toLocaleString()} pt`,    c:'#059669'},
                              {l:'잔여',       v:`${Math.max(totalPoints-totalAcc,0).toLocaleString()} pt`, c:'#d97706'},
                              {l:'달성률',     v:`${progressPercent}%`,                c: progressPercent>=100?'#dc2626':'#4f46e5'},
                          ].map(({l,v,c}) => (
                              <div key={l} style={{display:'flex',alignItems:'center',gap:6,padding:'3px 12px',border:`1px solid ${c}30`,background:`${c}08`}}>
                                  <span style={{fontSize:11,color:'#888',fontWeight:600}}>{l}</span>
                                  <span style={{fontSize:13,fontWeight:900,color:c}}>{v}</span>
                              </div>
                          ))}
                          {/* 날짜 범위 */}
                          {(startDateStr || endDateStr) && (
                              <div style={{display:'flex',alignItems:'center',gap:6,padding:'3px 14px',border:'1px solid #64748b40',background:'#64748b0a',marginLeft:8}}>
                                  <span style={{fontSize:11,color:'#888',fontWeight:600}}>기간</span>
                                  <span style={{fontSize:13,fontWeight:900,color:'#1e3a5f'}}>
                                      {startDateStr || '—'} ~ {endDateStr || '진행중'}
                                  </span>
                                  <span style={{fontSize:10,color:'#94a3b8',fontWeight:600,marginLeft:2}}>
                                      ({timeline.length}개월)
                                  </span>
                              </div>
                          )}
                      </div>

                      {/* 범례 */}
                      <div style={{display:'flex',gap:16,padding:'5px 16px',background:'#fafbfc',borderBottom:'1px solid #eaecef',flexShrink:0,flexWrap:'wrap'}}>
                          {[
                              {c:'#1e7ac8',l:'금월 실적 (포인트)'},
                              {c:'rgba(30,122,200,0.18)',l:'누적 포인트 (선)'},
                              {c:'#059669',l:'공정률 (%)'},
                              {c:'#f0f6ff',l:'작업기간'},
                          ].map(({c,l}) => (
                              <div key={l} style={{display:'flex',alignItems:'center',gap:5}}>
                                  <div style={{width:12,height:12,background:c,border:`1px solid ${c}`}}/>
                                  <span style={{fontSize:11,color:'#666',fontWeight:600}}>{l}</span>
                              </div>
                          ))}
                      </div>

                      {/* 차트 영역 — 가로 스크롤 (날짜 범위가 길면 스크롤바 자동 표시) */}
                      <div style={{flex:1,minHeight:0,display:'flex',flexDirection:'column',overflow:'hidden'}}>
                          {/* 스크롤 가능한 차트 본체 */}
                          <div style={{flex:1,minHeight:0,overflowX:'auto',overflowY:'auto',padding:'16px 0 0'}} className="custom-scrollbar">
                              <div style={{display:'flex',paddingLeft:16,paddingRight:16,minWidth:totalW+96}}>

                                  {/* Y축 */}
                                  <div style={{width:56,flexShrink:0,position:'relative',height:BAR_H+40}}>
                                      {yGridLines.map(v => (
                                          <div key={v} style={{position:'absolute',right:4,bottom: Math.round((v/maxY)*BAR_H)+36,fontSize:10,color:'#888',fontWeight:600,textAlign:'right',lineHeight:'1'}}>
                                              {v.toLocaleString()}
                                          </div>
                                      ))}
                                      <div style={{position:'absolute',right:4,top:0,fontSize:10,color:'#1e7ac8',fontWeight:700}}>pt</div>
                                  </div>

                                  {/* 막대 + 격자 */}
                                  <div style={{flex:1,position:'relative',minWidth:totalW}}>
                                      {/* 격자선 */}
                                      <svg style={{position:'absolute',top:0,left:0,width:'100%',height:BAR_H+36,overflow:'visible',pointerEvents:'none'}}>
                                          {yGridLines.map(v => {
                                              const y = yTick(v);
                                              return <line key={v} x1="0" y1={y} x2={totalW} y2={y} stroke={v===0?'#9aa8b8':'#e0e5ec'} strokeWidth={v===0?2:1} strokeDasharray={v===0?'':'4,3'}/>;
                                          })}
                                          {totalPoints > 0 && totalPoints <= maxY && (
                                              <line x1="0" y1={yTick(totalPoints)} x2={totalW} y2={yTick(totalPoints)} stroke="#dc2626" strokeWidth={1.5} strokeDasharray="6,3"/>
                                          )}
                                          {timeline.length > 1 && (
                                              <polyline
                                                  points={timeline.map((t,i) => `${i*colW + colW/2},${yTick(Math.min(t.accPt,maxY))}`).join(' ')}
                                                  fill="none" stroke="rgba(30,122,200,0.55)" strokeWidth={2} strokeDasharray="5,2"
                                              />
                                          )}
                                          {timeline.length > 1 && (
                                              <polyline
                                                  points={timeline.map((t,i) => `${i*colW + colW/2},${yTick((t.progressPct/100)*maxY)}`).join(' ')}
                                                  fill="none" stroke="rgba(5,150,105,0.7)" strokeWidth={2}
                                              />
                                          )}
                                      </svg>

                                      {/* 월별 컬럼 */}
                                      <div style={{display:'flex',alignItems:'flex-end',height:BAR_H+36,position:'relative'}}>
                                          {timeline.map((t, i) => {
                                              const barH = maxY > 0 ? Math.round((t.monthPt / maxY) * BAR_H) : 0;
                                              const isOver = totalPoints > 0 && t.accPt > totalPoints;
                                              return (
                                                  <div key={t.date} style={{width:colW,flexShrink:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'flex-end',height:BAR_H+36,position:'relative',background:'#f0f6ff',borderRight:'1px solid #e8ecf0'}}>
                                                      {t.monthPt > 0 && (
                                                          <div style={{position:'absolute',bottom:barH+38,fontSize:10,fontWeight:800,color:isOver?'#dc2626':'#1e7ac8',whiteSpace:'nowrap'}}>{t.monthPt}</div>
                                                      )}
                                                      <div style={{width:Math.max(colW-12,8),height:Math.max(barH,t.monthPt>0?2:0),background:isOver?'rgba(220,38,38,0.7)':'rgba(30,122,200,0.75)',border:t.monthPt>0?`1px solid ${isOver?'#dc2626':'#1e7ac8'}`:'none',position:'relative',marginBottom:34}}>
                                                          {t.progressPct > 0 && (
                                                              <div style={{position:'absolute',bottom:Math.round((t.progressPct/100)*BAR_H)-barH-4,left:'50%',transform:'translateX(-50%)',width:7,height:7,borderRadius:'50%',background:'#059669',border:'2px solid #fff',boxShadow:'0 0 3px rgba(5,150,105,0.6)'}}/>
                                                          )}
                                                      </div>
                                                      <div style={{position:'absolute',bottom:0,textAlign:'center',whiteSpace:'nowrap'}}>
                                                          {t.showYear && <div style={{fontSize:9,fontWeight:800,color:'#1e7ac8',lineHeight:1.2}}>{t.date.slice(0,4)}년</div>}
                                                          <div style={{fontSize:10,fontWeight:700,color:t.hasData?'#1a1a1a':'#aaa',lineHeight:1.2}}>{parseInt(t.date.slice(5,7),10)}월</div>
                                                      </div>
                                                      {t.showYear && i > 0 && <div style={{position:'absolute',top:0,left:0,width:2,height:BAR_H,background:'#1e7ac8',opacity:0.3}}/>}
                                                  </div>
                                              );
                                          })}
                                      </div>
                                  </div>

                                  {/* 우측 Y축 (공정률 %) */}
                                  <div style={{width:40,flexShrink:0,position:'relative',height:BAR_H+40}}>
                                      {[0,25,50,75,100].map(v => (
                                          <div key={v} style={{position:'absolute',left:4,bottom: Math.round((v/100)*BAR_H)+36,fontSize:10,color:'#059669',fontWeight:600,lineHeight:'1'}}>
                                              {v}%
                                          </div>
                                      ))}
                                      <div style={{position:'absolute',left:4,top:0,fontSize:10,color:'#059669',fontWeight:700}}>%</div>
                                  </div>
                              </div>

                              {/* 총 Point 기준선 레이블 */}
                              {totalPoints > 0 && (
                                  <div style={{minWidth:totalW+96,padding:'4px 16px 8px 72px',fontSize:11,color:'#dc2626',fontWeight:700}}>
                                      ── 총 Point 기준: {totalPoints.toLocaleString()} pt (초과 시 빨간 막대)
                                  </div>
                              )}
                          </div>
                      </div>

                      {/* 하단 데이터 테이블 */}
                      <div style={{flexShrink:0,borderTop:'2px solid #9aa8b8',overflow:'auto',maxHeight:160}} className="custom-scrollbar">
                          <table style={{width:'100%',fontSize:11,borderCollapse:'collapse',minWidth:totalW+80}}>
                              <thead>
                                  <tr style={{background:'#dce3ec'}}>
                                      <th style={{padding:'4px 8px',borderRight:'1px solid #b0b8c8',textAlign:'left',fontWeight:700,color:'#1a1a1a',width:80,position:'sticky',left:0,background:'#dce3ec'}}>항목</th>
                                      {timeline.map(t => (
                                          <th key={t.date} style={{padding:'2px 6px',borderRight:'1px solid #c4ccd8',textAlign:'center',fontWeight:700,color:'#1a1a1a',whiteSpace:'nowrap',minWidth:colW}}>
                                              {t.showYear && <div style={{fontSize:9,color:'#1e7ac8',lineHeight:1.2}}>{t.date.slice(0,4)}년</div>}
                                              <div style={{lineHeight:1.2}}>{parseInt(t.date.slice(5,7),10)}월</div>
                                          </th>
                                      ))}
                                  </tr>
                              </thead>
                              <tbody>
                                  {[
                                      {l:'금월 pt', f: t => t.monthPt > 0 ? t.monthPt.toLocaleString() : '—', c: t => '#1e7ac8'},
                                      {l:'누적 pt', f: t => t.accPt > 0 ? t.accPt.toLocaleString() : '—', c: t => totalPoints>0&&t.accPt>totalPoints?'#dc2626':'#333'},
                                      {l:'공정률', f: t => t.progressPct > 0 ? `${t.progressPct}%` : '—', c: t => '#059669'},
                                  ].map(({l,f,c}) => (
                                      <tr key={l}>
                                          <td style={{padding:'3px 8px',borderRight:'1px solid #c4ccd8',borderBottom:'1px solid #e0e5ec',fontWeight:700,color:'#555',position:'sticky',left:0,background:'#f5f8fb'}}>{l}</td>
                                          {timeline.map(t => <td key={t.date} style={{padding:'3px 6px',borderRight:'1px solid #e0e5ec',borderBottom:'1px solid #e0e5ec',textAlign:'center',fontWeight:600,color:c(t)}}>{f(t)}</td>)}
                                      </tr>
                                  ))}
                              </tbody>
                          </table>
                      </div>
                  </div>
              </div>
          );
      })()}

      </>
  );
};

export default function App() {
  return (
    <>
      <GlobalStyles />
      <ErrorBoundary>
        <TechTeamPMS />
      </ErrorBoundary>
    </>
  );
}