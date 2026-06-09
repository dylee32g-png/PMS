// --- 외부 데이터 정의 ---
export const defaultStatusOptions = [
    { label: '진행중', color: 'bg-cyan-500', textColor: 'text-cyan-400', borderColor: 'border-cyan-500/20' },
    { label: '신규등록', color: 'bg-blue-500', textColor: 'text-blue-400', borderColor: 'border-blue-500/20' },
    { label: '금월완료', color: 'bg-emerald-500', textColor: 'text-emerald-400', borderColor: 'border-emerald-500/20' },
    { label: '이전완료', color: 'bg-indigo-500', textColor: 'text-indigo-400', borderColor: 'border-indigo-500/20' },
    { label: '취소', color: 'bg-rose-500', textColor: 'text-rose-400', borderColor: 'border-rose-500/20' },
    { label: '삭제', color: 'bg-slate-500', textColor: 'text-slate-400', borderColor: 'border-slate-500/20' },
];

export const initialTeamSettings = {
    '기술1팀': { factory: ['P10', 'P9', '기반기술'], manager: ['홍길동 파트장', '이순신 선임'], status: defaultStatusOptions, defaultActiveStatuses: [], defaultActiveFactories: [], colOrderV2: [] },
    '기술2팀': { factory: ['P10', 'P9', 'P8', 'P7', 'Vietnam', 'Paju'], manager: ['김준혁 부장', '조장현 차장', '최영환 팀장', '이현우 과장', '박지성 대리'], status: defaultStatusOptions, defaultActiveStatuses: [], defaultActiveFactories: [], colOrderV2: [] },
    '기술3팀': { factory: ['네트워크망', '인프라센터'], manager: ['김네트 파트장', '이프라 선임'], status: defaultStatusOptions, defaultActiveStatuses: [], defaultActiveFactories: [], colOrderV2: [] },
    'Software팀': { factory: ['사내포털', '본사서버'], manager: ['박개발 수석', '최코딩 선임'], status: defaultStatusOptions, defaultActiveStatuses: [], defaultActiveFactories: [], colOrderV2: [] }
};

// ★ 엑셀 미리보기용 (원본 순서)
export const excelPreviewColDefs = [
    { key: 'no', label: 'No.', align: 'center', width: 50 },
    { key: 'execNo', label: '실행번호', color: 'text-cyan-400', width: 90 },
    { key: 'estNo', label: '견적번호', width: 90 },
    { key: 'progressStatus', label: '진행현황', color: 'text-amber-400', width: 90 },
    { key: 'factory', label: '공장구분', color: 'text-cyan-400', width: 80 },
    { key: 'project', label: '프로젝트명', color: 'text-cyan-400', width: 250 },
    { key: 'content', label: '프로젝트 내용', width: 220 },
    { key: 'point', label: 'Point', color: 'text-emerald-400', align: 'center', width: 70 },
    { key: 'plc', label: 'PLC', align: 'center', group: '진행현황', width: 60 },
    { key: 'etos', label: 'ETOS', align: 'center', group: '진행현황', width: 60 },
    { key: 'hmi', label: 'HMI', align: 'center', group: '진행현황', width: 60 },
    { key: 'internalTest', label: '자체시운전', align: 'center', group: '진행현황', width: 80 },
    { key: 'integratedTest', label: '통합시운전', align: 'center', group: '진행현황', width: 80 },
    { key: 'startDate', label: '시작일', width: 90 },
    { key: 'endDate', label: '종료일', width: 90 },
    { key: 'progress', label: '공정률(%)', align: 'center', color: 'text-cyan-400', width: 80 },
    { key: 'material', label: '자재(%)', width: 80 },
    { key: 'l1', label: 'L1', align: 'center', group: '작업범위', width: 60 },
    { key: 'l2', label: 'L2', align: 'center', group: '작업범위', width: 60 },
    { key: 'investReview', label: '투자심의', width: 80 },
    { key: 'client', label: '발주처', width: 100 },
    { key: 'accPoints', label: '누적', align: 'right', group: '시운전(포인트)', color: 'text-indigo-400', bg: 'bg-cyan-500/10', width: 80 },
    { key: 'prevPoints', label: '전월', align: 'right', group: '시운전(포인트)', bg: 'bg-cyan-500/10', width: 80 },
    { key: 'currPoints', label: '금월', align: 'right', group: '시운전(포인트)', color: 'text-emerald-400', bg: 'bg-cyan-500/10', width: 80 },
    { key: 'prevProgress', label: '전월', align: 'right', group: '공정률(%)', bg: 'bg-slate-800/40', width: 70 },
    { key: 'currProgress', label: '금월', align: 'right', group: '공정률(%)', color: 'text-emerald-400', bg: 'bg-slate-800/40', width: 70, rightBorder: true }
];

// ★ 메인 화면용 (시운전/공정률 열을 진행현황 앞으로 이동)
export const mainBaseColDefs = [
    { key: 'no', label: 'No.', align: 'center', width: 50 },
    { key: 'execNo', label: '실행번호', color: 'text-cyan-400', width: 90 },
    { key: 'estNo', label: '견적번호', width: 90 },
    { key: 'progressStatus', label: '진행현황', color: 'text-amber-400', width: 90 },
    { key: 'factory', label: '공장구분', color: 'text-cyan-400', width: 80 },
    { key: 'project', label: '프로젝트명', color: 'text-cyan-400', width: 250 },
    { key: 'content', label: '프로젝트 내용', width: 220 },
    { key: 'point', label: 'Point', color: 'text-emerald-400', align: 'center', width: 70 },

    { key: 'accPoints', label: '누적', align: 'right', group: '시운전(포인트)', color: 'text-indigo-400', bg: 'bg-cyan-500/10', width: 80 },
    { key: 'prevPoints', label: '전월', align: 'right', group: '시운전(포인트)', bg: 'bg-cyan-500/10', width: 80 },
    { key: 'currPoints', label: '금월', align: 'right', group: '시운전(포인트)', color: 'text-emerald-400', bg: 'bg-cyan-500/10', width: 80 },
    { key: 'prevProgress', label: '전월', align: 'right', group: '공정률(%)', bg: 'bg-slate-800/40', width: 70 },
    { key: 'currProgress', label: '금월', align: 'right', group: '공정률(%)', color: 'text-emerald-400', bg: 'bg-slate-800/40', width: 70, rightBorder: true },

    { key: 'plc', label: 'PLC', align: 'center', group: '진행현황', width: 60 },
    { key: 'etos', label: 'ETOS', align: 'center', group: '진행현황', width: 60 },
    { key: 'hmi', label: 'HMI', align: 'center', group: '진행현황', width: 60 },
    { key: 'internalTest', label: '자체시운전', align: 'center', group: '진행현황', width: 80 },
    { key: 'integratedTest', label: '통합시운전', align: 'center', group: '진행현황', width: 80 },
    { key: 'startDate', label: '시작일', width: 90 },
    { key: 'endDate', label: '종료일', width: 90 },
    { key: 'progress', label: '공정률(%)', align: 'center', color: 'text-cyan-400', width: 80 },
    { key: 'material', label: '자재(%)', width: 80 },
    { key: 'l1', label: 'L1', align: 'center', group: '작업범위', width: 60 },
    { key: 'l2', label: 'L2', align: 'center', group: '작업범위', width: 60 },
    { key: 'investReview', label: '투자심의', width: 80 },
    { key: 'client', label: '발주처', width: 100 }
];
