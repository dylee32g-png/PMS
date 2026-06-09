import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
    X, Search, ChevronRight, ChevronDown, BookOpen,
    LayoutGrid, Users, FileText, ListChecks, Calendar,
    Settings, Database, Filter, Plus, Activity,
    BarChart3, Download, Upload, Eye, Link, AlertTriangle,
    Cpu, Monitor, Wrench, TerminalSquare, Edit2,
    FileSpreadsheet, HelpCircle, Info,
    ArrowRight, Star, Lightbulb, Hash
} from 'lucide-react';

// ─────────────────────────────────────────────────────
// 서브 컴포넌트 — 라이트 테마 (HELP_DATA보다 먼저 정의)
// ─────────────────────────────────────────────────────
const InfoBox = ({ type = 'info', children }) => {
    const styles = {
        info:    { bg: '#eff6ff', border: '#bfdbfe', icon: <Info size={13} style={{color:'#3b82f6',flexShrink:0,marginTop:1}}/>,          text: '#1e40af' },
        tip:     { bg: '#f0fdf4', border: '#bbf7d0', icon: <Star size={13} style={{color:'#16a34a',flexShrink:0,marginTop:1}}/>,           text: '#15803d' },
        warning: { bg: '#fffbeb', border: '#fde68a', icon: <AlertTriangle size={13} style={{color:'#d97706',flexShrink:0,marginTop:1}}/>,  text: '#92400e' },
    };
    const s = styles[type];
    return (
        <div style={{display:'flex',gap:10,alignItems:'flex-start',borderRadius:10,border:`1px solid ${s.border}`,padding:'10px 14px',background:s.bg}}>
            {s.icon}
            <p style={{fontSize:12,lineHeight:1.7,color:s.text,margin:0}}>{children}</p>
        </div>
    );
};

const StepItem = ({ step, title, children }) => (
    <div style={{display:'flex',gap:10,alignItems:'flex-start'}}>
        <div style={{flexShrink:0,width:20,height:20,borderRadius:'50%',background:'#e2e8f0',border:'1px solid #cbd5e1',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:900,color:'#475569',marginTop:2}}>{step}</div>
        <div style={{flex:1}}>
            <span style={{fontWeight:700,fontSize:12,color:'#1e293b'}}>{title}</span>
            {children && <p style={{fontSize:12,color:'#64748b',marginTop:3,lineHeight:1.7}}>{children}</p>}
        </div>
    </div>
);

const MethodCard = ({ icon, title, children }) => (
    <div style={{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:10,padding:12}}>
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
            {icon}
            <span style={{fontWeight:700,fontSize:12,color:'#1e293b'}}>{title}</span>
        </div>
        {children}
    </div>
);

const Tag = ({ color = 'slate', children }) => {
    const colors = {
        cyan:    {bg:'#ecfeff', color:'#0891b2', border:'#a5f3fc'},
        emerald: {bg:'#f0fdf4', color:'#16a34a', border:'#bbf7d0'},
        rose:    {bg:'#fff1f2', color:'#e11d48', border:'#fecdd3'},
        amber:   {bg:'#fffbeb', color:'#d97706', border:'#fde68a'},
        violet:  {bg:'#f5f3ff', color:'#7c3aed', border:'#ddd6fe'},
        slate:   {bg:'#f1f5f9', color:'#475569', border:'#cbd5e1'},
    };
    const c = colors[color] || colors.slate;
    return (
        <span style={{display:'inline-flex',alignItems:'center',padding:'1px 7px',borderRadius:5,border:`1px solid ${c.border}`,fontSize:10,fontWeight:700,background:c.bg,color:c.color}}>{children}</span>
    );
};

// ─────────────────────────────────────────────────────
// 목차 색상 매핑 (라이트 테마)
// ─────────────────────────────────────────────────────
const COLOR_MAP = {
    cyan:    { dot:'#06b6d4', text:'#0891b2', activeBg:'#ecfeff', activeBorder:'#a5f3fc', activeText:'#0e7490' },
    emerald: { dot:'#10b981', text:'#059669', activeBg:'#f0fdf4', activeBorder:'#a7f3d0', activeText:'#065f46' },
    violet:  { dot:'#8b5cf6', text:'#7c3aed', activeBg:'#f5f3ff', activeBorder:'#ddd6fe', activeText:'#5b21b6' },
    amber:   { dot:'#f59e0b', text:'#d97706', activeBg:'#fffbeb', activeBorder:'#fde68a', activeText:'#92400e' },
    slate:   { dot:'#94a3b8', text:'#64748b', activeBg:'#f1f5f9', activeBorder:'#cbd5e1', activeText:'#334155' },
    rose:    { dot:'#f43f5e', text:'#e11d48', activeBg:'#fff1f2', activeBorder:'#fecdd3', activeText:'#9f1239' },
    teal:    { dot:'#14b8a6', text:'#0d9488', activeBg:'#f0fdfa', activeBorder:'#99f6e4', activeText:'#0f766e' },
};

// ─────────────────────────────────────────────────────
// 도움말 데이터 (서브 컴포넌트 이후에 위치)
// ─────────────────────────────────────────────────────
const HELP_DATA = [
    {
        id: 'getting-started',
        category: '시작하기',
        icon: <BookOpen size={14} />,
        color: 'cyan',
        sections: [
            {
                id: 'intro',
                title: '앱 소개',
                keywords: ['소개', '개요', '플랫폼', 'PMS', 'firebase', '클라우드'],
                content: (
                    <div className="space-y-4">
                        <p style={{color:'#334155',lineHeight:1.8,fontSize:13}}>
                            <strong style={{color:'#0f172a'}}>TechTeam PMS</strong>는 기술팀의 프로젝트 현황, 공정률, 월간보고, 주간보고를
                            하나의 플랫폼에서 통합 관리하는 웹 기반 시스템입니다.
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                            {[
                                { icon: <Database size={15} style={{color:'#06b6d4'}}/>,   label: '실시간 동기화', desc: 'Firebase Firestore로 여러 PC에서 동일 데이터 공유' },
                                { icon: <LayoutGrid size={15} style={{color:'#6366f1'}}/>, label: '통합 관리',    desc: '월간보고·주간보고·List 관리를 하나의 앱에서' },
                                { icon: <FileText size={15} style={{color:'#10b981'}}/>,   label: '엑셀 연동',    desc: '업로드·다운로드·보고서 자동 생성 지원' },
                                { icon: <Users size={15} style={{color:'#8b5cf6'}}/>,       label: '팀별 분리',    desc: '기술1·2·3팀, Software팀 데이터 독립 관리' },
                            ].map(item => (
                                <div key={item.label} style={{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:10,padding:12,display:'flex',gap:10,alignItems:'flex-start'}}>
                                    <div style={{marginTop:1}}>{item.icon}</div>
                                    <div>
                                        <div style={{fontWeight:700,fontSize:12,color:'#1e293b',marginBottom:3}}>{item.label}</div>
                                        <div style={{fontSize:11,color:'#64748b',lineHeight:1.6}}>{item.desc}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <InfoBox type="tip">
                            인터넷이 연결된 어느 PC에서도 <strong>neconsys.web.app</strong>에 접속하면 동일한 데이터를 조회하고 입력할 수 있습니다.
                        </InfoBox>
                    </div>
                ),
            },
            {
                id: 'team-select',
                title: '팀 선택 화면',
                keywords: ['팀 선택', '기술1팀', '기술2팀', '기술3팀', 'software팀', '서브메뉴', '메뉴'],
                content: (
                    <div className="space-y-4">
                        <p style={{color:'#475569',fontSize:13}}>앱 접속 후 처음 나타나는 화면에서 접속할 부서를 선택합니다.</p>
                        <div className="space-y-2">
                            {[
                                { team: '기술1팀',    icon: <Wrench size={14} style={{color:'#6366f1'}}/>,        desc: '카드를 클릭하면 월간 업무 보고 화면으로 바로 이동합니다.' },
                                { team: '기술2팀',    icon: <Cpu size={14} style={{color:'#06b6d4'}}/>,           desc: '▼ 메뉴 버튼을 클릭하면 「월간 업무 보고」와 「프로젝트 List 관리」 두 가지 서브메뉴가 펼쳐집니다.' },
                                { team: '기술3팀',    icon: <Monitor size={14} style={{color:'#10b981'}}/>,       desc: '카드를 클릭하면 월간 업무 보고 화면으로 바로 이동합니다.' },
                                { team: 'Software팀', icon: <TerminalSquare size={14} style={{color:'#8b5cf6'}}/>,desc: '카드를 클릭하면 월간 업무 보고 화면으로 바로 이동합니다.' },
                            ].map(item => (
                                <div key={item.team} style={{display:'flex',alignItems:'flex-start',gap:10,background:'#f8fafc',borderRadius:10,padding:'10px 14px',border:'1px solid #e2e8f0'}}>
                                    <div style={{marginTop:2}}>{item.icon}</div>
                                    <div>
                                        <span style={{fontWeight:700,fontSize:13,color:'#1e293b'}}>{item.team}</span>
                                        <p style={{fontSize:12,color:'#64748b',marginTop:2,lineHeight:1.6}}>{item.desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <InfoBox type="info">기술2팀의 서브메뉴는 팀 카드를 한 번 클릭하면 펼쳐지고, 다시 클릭하면 접힙니다.</InfoBox>
                    </div>
                ),
            },
        ],
    },
    {
        id: 'monthly-report',
        category: '월간 업무 보고',
        icon: <FileText size={14} />,
        color: 'emerald',
        sections: [
            {
                id: 'monthly-overview',
                title: '화면 구성',
                keywords: ['월간', '보고', '화면', '헤더', '테이블', '패널', '상세'],
                content: (
                    <div className="space-y-4">
                        <p style={{color:'#475569',fontSize:13}}>월간 업무 보고 화면은 크게 네 영역으로 구성됩니다.</p>
                        <div className="space-y-2">
                            {[
                                { area: '① 상단 헤더',       desc: '검색창, 월 선택, 엑셀생성, List관리 이동, 설정·도움말 버튼이 위치합니다.' },
                                { area: '② 필터 바',         desc: '상태 버튼(진행·완료·신규 등)과 공장 버튼으로 프로젝트를 빠르게 필터링합니다.' },
                                { area: '③ 프로젝트 테이블', desc: '프로젝트 목록이 표시됩니다. 행을 클릭하면 우측 상세 패널이 열립니다.' },
                                { area: '④ 우측 상세 패널',  desc: '선택한 프로젝트의 상세 정보, 공정률 입력, 그래프 보기 기능이 있습니다.' },
                            ].map((item, i) => (
                                <div key={i} style={{display:'flex',gap:10,alignItems:'flex-start'}}>
                                    <span style={{color:'#059669',fontWeight:800,fontSize:11,flexShrink:0,width:100}}>{item.area}</span>
                                    <span style={{color:'#475569',fontSize:12,lineHeight:1.6}}>{item.desc}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                ),
            },
            {
                id: 'filter',
                title: '필터 사용법',
                keywords: ['필터', '상태', '공장', '진행', '완료', '신규', '초기화', '상태필터'],
                content: (
                    <div className="space-y-4">
                        <p style={{color:'#475569',fontSize:13}}>필터 바에서 상태와 공장을 조합하여 원하는 프로젝트만 표시할 수 있습니다.</p>
                        <div className="space-y-3">
                            <StepItem step={1} title="상태 필터">필터 바에서 <Tag color="cyan">진행</Tag> <Tag color="emerald">금월완료</Tag> 등 상태 버튼을 클릭하면 해당 상태만 표시됩니다. 여러 개 동시 선택 가능합니다.</StepItem>
                            <StepItem step={2} title="공장 필터">공장 버튼(P10·P9 등)을 클릭하여 특정 현장의 프로젝트만 필터링합니다.</StepItem>
                            <StepItem step={3} title="필터 초기화">왼쪽의 <Tag color="rose">초기 상태로</Tag> 버튼을 클릭하면 설정에 저장된 기본 필터로 돌아갑니다.</StepItem>
                        </div>
                        <InfoBox type="tip">자주 사용하는 필터 조합은 설정 → 「기본 필터(초기화면)」에서 저장해 두면 앱을 열 때마다 자동 적용됩니다.</InfoBox>
                    </div>
                ),
            },
            {
                id: 'project-add',
                title: '프로젝트 등록',
                keywords: ['등록', '신규', '추가', '엑셀 업로드', '수동 등록'],
                content: (
                    <div className="space-y-4">
                        <p style={{color:'#475569',fontSize:13}}>프로젝트는 두 가지 방법으로 등록할 수 있습니다.</p>
                        <div className="space-y-3">
                            <MethodCard icon={<Upload size={14} style={{color:'#7c3aed'}}/>} title="방법 1 — 엑셀 업로드 (권장)">
                                <p style={{color:'#64748b',fontSize:12,marginTop:4,lineHeight:1.7}}>설정 메뉴 → 「엑셀 업로드」를 클릭하고 기존 프로젝트 목록 엑셀 파일을 선택합니다. 미리보기 화면에서 내용을 확인 후 저장합니다.</p>
                            </MethodCard>
                            <MethodCard icon={<Plus size={14} style={{color:'#0891b2'}}/>} title="방법 2 — 수동 등록">
                                <p style={{color:'#64748b',fontSize:12,marginTop:4,lineHeight:1.7}}>설정 메뉴 → 「수동 신규 등록」을 클릭하면 입력 폼이 열립니다. 프로젝트명, 현장, 담당자, 상태, 시작일, 완료일 등을 입력합니다.</p>
                            </MethodCard>
                        </div>
                    </div>
                ),
            },
            {
                id: 'progress',
                title: '공정률 입력',
                keywords: ['공정률', '실적', '입력', 'plc', 'hmi', 'etos', '체크리스트', '월별'],
                content: (
                    <div className="space-y-4">
                        <p style={{color:'#475569',fontSize:13}}>월별 공정률과 항목별 진행 상태를 기록합니다.</p>
                        <div className="space-y-2">
                            <StepItem step={1} title="행 클릭">테이블에서 공정률을 입력할 프로젝트 행을 클릭하여 우측 패널을 엽니다.</StepItem>
                            <StepItem step={2} title="실적 입력 버튼">우측 패널 하단의 「실적 입력」 버튼을 클릭합니다.</StepItem>
                            <StepItem step={3} title="월 선택">입력할 월을 선택합니다. 이전 달 데이터도 소급 입력 가능합니다.</StepItem>
                            <StepItem step={4} title="항목 체크">PLC, ETOS, HMI, 내부시험, 통합시험 등 각 항목의 완료 여부를 체크하고 공정률(%)을 입력합니다.</StepItem>
                            <StepItem step={5} title="저장">「저장」 버튼을 클릭하면 Firebase에 즉시 반영됩니다.</StepItem>
                        </div>
                        <InfoBox type="info">입력된 공정률은 월간보고서 엑셀 생성 시 자동으로 반영됩니다.</InfoBox>
                    </div>
                ),
            },
            {
                id: 'graph',
                title: '실적 그래프',
                keywords: ['그래프', '차트', '실적', '달성률', '목표', '기간', '시작일', '완료일', '스크롤'],
                content: (
                    <div className="space-y-4">
                        <p style={{color:'#475569',fontSize:13}}>프로젝트 기간 전체의 목표 공정률과 실제 실적을 시각적으로 비교합니다.</p>
                        <div className="space-y-2">
                            <StepItem step={1} title="그래프 열기">행을 클릭 후 우측 패널에서 그래프 아이콘을 클릭합니다.</StepItem>
                            <StepItem step={2} title="기간 확인">그래프 상단에 프로젝트 <strong style={{color:'#1e293b'}}>시작일 ~ 완료일</strong>과 달성률이 표시됩니다.</StepItem>
                            <StepItem step={3} title="가로 스크롤">프로젝트 기간이 길 경우 그래프 하단 스크롤바로 이전/이후 월을 확인합니다.</StepItem>
                        </div>
                        <div style={{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:10,padding:12}}>
                            <p style={{fontSize:12,fontWeight:700,color:'#1e293b',marginBottom:8}}>그래프 구성 요소</p>
                            <div style={{display:'flex',gap:16,flexWrap:'wrap'}}>
                                <div style={{display:'flex',alignItems:'center',gap:6}}><div style={{width:12,height:12,borderRadius:3,background:'rgba(99,102,241,0.4)',border:'1px solid #818cf8'}}></div><span style={{fontSize:11,color:'#64748b'}}>목표 공정률</span></div>
                                <div style={{display:'flex',alignItems:'center',gap:6}}><div style={{width:12,height:12,borderRadius:3,background:'rgba(16,185,129,0.4)',border:'1px solid #34d399'}}></div><span style={{fontSize:11,color:'#64748b'}}>실제 실적</span></div>
                                <div style={{display:'flex',alignItems:'center',gap:6}}><div style={{width:12,height:12,borderRadius:3,background:'rgba(251,191,36,0.4)',border:'1px solid #fbbf24'}}></div><span style={{fontSize:11,color:'#64748b'}}>현재 월</span></div>
                            </div>
                        </div>
                    </div>
                ),
            },
            {
                id: 'excel',
                title: '엑셀 업로드 / 다운로드',
                keywords: ['엑셀', '업로드', '다운로드', 'xlsx', 'csv', '내보내기', '가져오기'],
                content: (
                    <div className="space-y-4">
                        <div className="space-y-3">
                            <MethodCard icon={<Upload size={14} style={{color:'#0891b2'}}/>} title="엑셀 업로드">
                                <p style={{color:'#64748b',fontSize:12,marginTop:4}}>설정 → 「엑셀 업로드」. 기존 프로젝트 목록 xlsx 파일을 선택하면 미리보기 후 저장됩니다.</p>
                            </MethodCard>
                            <MethodCard icon={<Download size={14} style={{color:'#059669'}}/>} title="엑셀 다운로드">
                                <p style={{color:'#64748b',fontSize:12,marginTop:4}}>설정 → 「엑셀 다운로드」. 현재 필터 상태의 프로젝트 목록을 파일로 내보냅니다.</p>
                            </MethodCard>
                            <MethodCard icon={<FileText size={14} style={{color:'#6366f1'}}/>} title="월간보고서 엑셀 생성">
                                <p style={{color:'#64748b',fontSize:12,marginTop:4}}>상단 「엑셀생성」 버튼. 현재 월 기준 공정률이 포함된 보고서 파일을 자동 생성합니다.</p>
                            </MethodCard>
                        </div>
                        <InfoBox type="tip">설정 → 「엑셀 포맷 설정」에서 xlsx(기본)와 csv 형식 중 선택할 수 있습니다.</InfoBox>
                    </div>
                ),
            },
            {
                id: 'columns',
                title: '열 표시 / 숨기기',
                keywords: ['열', '컬럼', '숨기기', '표시', '숨김'],
                content: (
                    <div className="space-y-4">
                        <p style={{color:'#475569',fontSize:13}}>테이블에 표시할 컬럼을 자유롭게 선택할 수 있습니다.</p>
                        <div className="space-y-2">
                            <StepItem step={1} title="메뉴 열기">설정 메뉴 → 「열 표시/숨기기」를 클릭합니다.</StepItem>
                            <StepItem step={2} title="체크박스 선택">표시하려는 열에 체크, 숨기려면 체크 해제합니다.</StepItem>
                            <StepItem step={3} title="전체 복원">「모두 표시」 버튼으로 숨긴 열을 한 번에 복원합니다.</StepItem>
                        </div>
                        <InfoBox type="info">숨긴 열 수가 설정 버튼에 빨간색 숫자로 표시됩니다. 숨긴 열도 엑셀 다운로드에는 포함됩니다.</InfoBox>
                    </div>
                ),
            },
        ],
    },
    {
        id: 'project-list',
        category: '프로젝트 List 관리',
        icon: <ListChecks size={14} />,
        color: 'violet',
        sections: [
            {
                id: 'list-overview',
                title: '화면 구성',
                keywords: ['list', '관리', '화면', '구성', '기술2팀'],
                content: (
                    <div className="space-y-4">
                        <p style={{color:'#475569',fontSize:13}}>기술2팀 전용 화면으로, 팀 전체 프로젝트 목록을 엑셀 기반으로 관리합니다.</p>
                        <InfoBox type="info">팀 선택 화면에서 기술2팀 → 프로젝트 List 관리를 선택하거나, 월간보고 화면 상단의 「List관리」 버튼으로 이동합니다.</InfoBox>
                        <div className="space-y-2">
                            {[
                                { area: '상단 툴바',      desc: '엑셀 업로드, 행 추가, 저장, 주간보고 연결 버튼이 있습니다.' },
                                { area: '프로젝트 테이블', desc: '업로드된 전체 프로젝트 목록이 표시됩니다. 셀을 더블클릭하면 인라인 편집이 가능합니다.' },
                                { area: '주간보고 패널',   desc: '우측에서 연결된 주간보고 파일을 미리보기합니다.' },
                            ].map((item, i) => (
                                <div key={i} style={{display:'flex',gap:10,alignItems:'flex-start'}}>
                                    <span style={{color:'#7c3aed',fontWeight:700,fontSize:11,flexShrink:0,width:90}}>{item.area}</span>
                                    <span style={{color:'#475569',fontSize:12,lineHeight:1.6}}>{item.desc}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                ),
            },
            {
                id: 'list-excel',
                title: '엑셀 업로드 (List)',
                keywords: ['엑셀', '업로드', 'list', '목록', '미리보기'],
                content: (
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <StepItem step={1} title="업로드 버튼">화면 상단 「엑셀 업로드」를 클릭합니다.</StepItem>
                            <StepItem step={2} title="파일 선택">팀 프로젝트 목록 엑셀 파일(.xlsx)을 선택합니다.</StepItem>
                            <StepItem step={3} title="미리보기 확인">업로드 전 미리보기 화면에서 데이터를 검토합니다.</StepItem>
                            <StepItem step={4} title="저장">「Firebase 저장」 버튼을 클릭하면 클라우드에 저장됩니다.</StepItem>
                        </div>
                        <InfoBox type="tip">기존 데이터는 삭제되지 않고 병합됩니다. 중복 실행번호는 최신 데이터로 덮어씁니다.</InfoBox>
                    </div>
                ),
            },
            {
                id: 'weekly-link',
                title: '주간보고 연결',
                keywords: ['주간보고', '연결', '파일', '공유', '다른 pc', '다운로드'],
                content: (
                    <div className="space-y-4">
                        <p style={{color:'#475569',fontSize:13}}>프로젝트별로 주간보고 파일을 연결하여 팀원 모두가 열람할 수 있도록 공유합니다.</p>
                        <div className="space-y-2">
                            <StepItem step={1} title="프로젝트 선택">List 관리 화면에서 연결할 프로젝트 행을 클릭합니다.</StepItem>
                            <StepItem step={2} title="주간보고 연결">상단 「주간보고 연결」 버튼 또는 행의 연결 아이콘을 클릭합니다.</StepItem>
                            <StepItem step={3} title="파일 선택">저장된 주간보고 파일을 선택합니다.</StepItem>
                            <StepItem step={4} title="업로드 대기">파일이 Firebase에 업로드됩니다. 파일 크기에 따라 수 초 소요됩니다.</StepItem>
                            <StepItem step={5} title="다른 PC에서 열기">연결 후 다른 PC에서 접속해도 동일 파일을 열람할 수 있습니다.</StepItem>
                        </div>
                        <InfoBox type="warning">파일 크기가 크면(1MB 이상) 업로드 시간이 길어질 수 있습니다. 업로드 중 창을 닫지 마세요.</InfoBox>
                        <InfoBox type="tip">연결 해제 후 재연결하면 최신 파일로 교체됩니다.</InfoBox>
                    </div>
                ),
            },
            {
                id: 'monthly-link',
                title: '업무현황 연동',
                keywords: ['업무현황', '하이라이트', '연동', '이동', '황색', '강조'],
                content: (
                    <div className="space-y-4">
                        <p style={{color:'#475569',fontSize:13}}>월간보고 화면에서 특정 프로젝트의 업무현황을 클릭하면 List 관리 화면에서 해당 행이 강조 표시됩니다.</p>
                        <div className="space-y-2">
                            <StepItem step={1} title="월간보고 화면">프로젝트 행을 클릭하여 우측 패널을 엽니다.</StepItem>
                            <StepItem step={2} title="업무현황 클릭">우측 패널에서 「업무현황」 버튼 또는 링크를 클릭합니다.</StepItem>
                            <StepItem step={3} title="자동 이동">List 관리 화면으로 이동하면서 해당 프로젝트 행이 <span style={{color:'#d97706',fontWeight:700}}>황색으로 4초간 하이라이트</span>됩니다.</StepItem>
                        </div>
                    </div>
                ),
            },
        ],
    },
    {
        id: 'weekly',
        category: '주간보고',
        icon: <Calendar size={14} />,
        color: 'amber',
        sections: [
            {
                id: 'weekly-view',
                title: '주간보고 조회',
                keywords: ['주간보고', '조회', '열람', '엑셀', '뷰어'],
                content: (
                    <div className="space-y-4">
                        <p style={{color:'#475569',fontSize:13}}>저장된 주간보고 엑셀 파일을 웹 브라우저에서 직접 열람합니다.</p>
                        <div className="space-y-2">
                            <StepItem step={1} title="메뉴 진입">팀 선택 화면 → 주간보고 조회를 클릭합니다.</StepItem>
                            <StepItem step={2} title="파일 열기">저장된 주간보고 목록에서 원하는 파일을 선택합니다.</StepItem>
                            <StepItem step={3} title="열람">FortuneSheet 기반 스프레드시트 뷰어에서 엑셀과 동일하게 확인합니다.</StepItem>
                        </div>
                        <InfoBox type="info">뷰어 내에서 셀 내용 확인, 시트 이동, 확대/축소가 가능합니다. 편집 후 저장하려면 다시 업로드하세요.</InfoBox>
                    </div>
                ),
            },
            {
                id: 'weekly-input',
                title: '주간보고 입력',
                keywords: ['주간보고', '입력', '작성', '저장'],
                content: (
                    <div className="space-y-4">
                        <p style={{color:'#475569',fontSize:13}}>팀별 주간 업무 내용을 입력하고 Firebase에 저장합니다.</p>
                        <div className="space-y-2">
                            <StepItem step={1} title="메뉴 진입">팀 선택 화면 → 주간보고 입력을 클릭합니다.</StepItem>
                            <StepItem step={2} title="주차 선택">입력할 주차를 선택합니다.</StepItem>
                            <StepItem step={3} title="내용 작성">프로젝트별 금주 실적, 차주 계획, 이슈사항을 입력합니다.</StepItem>
                            <StepItem step={4} title="저장">「저장」을 클릭하면 Firebase에 저장됩니다.</StepItem>
                        </div>
                    </div>
                ),
            },
            {
                id: 'weekly-summary',
                title: '주간보고 현황',
                keywords: ['주간보고', '현황', '제출', '팀원', '확인'],
                content: (
                    <div className="space-y-4">
                        <p style={{color:'#475569',fontSize:13}}>팀원별 주간보고 제출 현황을 한눈에 파악합니다.</p>
                        <InfoBox type="info">제출 완료한 팀원은 초록색, 미제출은 붉은색으로 표시됩니다. 팀 리더가 현황을 빠르게 확인하는 데 활용합니다.</InfoBox>
                    </div>
                ),
            },
        ],
    },
    {
        id: 'settings',
        category: '설정',
        icon: <Settings size={14} />,
        color: 'slate',
        sections: [
            {
                id: 'settings-defaults',
                title: '기본 필터 설정',
                keywords: ['기본 필터', '초기화면', '자동', '저장', '설정'],
                content: (
                    <div className="space-y-4">
                        <p style={{color:'#475569',fontSize:13}}>앱 접속 시 자동으로 적용되는 상태·공장 필터를 저장합니다.</p>
                        <div className="space-y-2">
                            <StepItem step={1} title="필터 조합">원하는 상태·공장 버튼을 클릭해 필터를 설정합니다.</StepItem>
                            <StepItem step={2} title="설정 열기">설정 메뉴 → 「기본 필터(초기화면)」을 클릭합니다.</StepItem>
                            <StepItem step={3} title="저장">「현재 필터 저장」을 클릭하면 Firebase에 저장됩니다.</StepItem>
                        </div>
                        <InfoBox type="tip">팀별로 기본 필터가 독립적으로 저장됩니다.</InfoBox>
                    </div>
                ),
            },
            {
                id: 'settings-status',
                title: '드롭다운 항목 편집',
                keywords: ['드롭다운', '상태', '공장', '편집', '추가', '삭제', '순서'],
                content: (
                    <div className="space-y-4">
                        <p style={{color:'#475569',fontSize:13}}>상태 목록(진행·완료 등)과 공장 목록을 팀별로 커스터마이징합니다.</p>
                        <div className="space-y-2">
                            <StepItem step={1} title="설정 열기">설정 메뉴 → 「드롭다운 항목 편집」을 클릭합니다.</StepItem>
                            <StepItem step={2} title="탭 선택">상단 탭에서 「상태」 또는 「공장」을 선택합니다.</StepItem>
                            <StepItem step={3} title="항목 추가">하단 입력창에 새 항목명을 입력하고 「추가」를 클릭합니다.</StepItem>
                            <StepItem step={4} title="항목 삭제">항목 오른쪽의 × 버튼으로 삭제합니다.</StepItem>
                        </div>
                        <InfoBox type="info">변경 사항은 Firebase에 저장되어 모든 PC에 즉시 반영됩니다.</InfoBox>
                    </div>
                ),
            },
            {
                id: 'settings-excel-format',
                title: '엑셀 포맷 설정',
                keywords: ['엑셀', '포맷', 'xlsx', 'csv', '형식'],
                content: (
                    <div className="space-y-4">
                        <p style={{color:'#475569',fontSize:13}}>엑셀 다운로드 파일 형식을 선택합니다.</p>
                        <div style={{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:10,padding:14,display:'flex',flexDirection:'column',gap:10}}>
                            <div style={{display:'flex',gap:12}}><span style={{fontWeight:700,fontSize:12,color:'#1e293b',width:40}}>XLSX</span><span style={{fontSize:12,color:'#64748b'}}>Microsoft Excel 형식. 서식·수식이 유지됩니다. <Tag color="emerald">권장</Tag></span></div>
                            <div style={{display:'flex',gap:12}}><span style={{fontWeight:700,fontSize:12,color:'#1e293b',width:40}}>CSV</span><span style={{fontSize:12,color:'#64748b'}}>텍스트 기반 형식. 서식이 없어 다른 시스템 연동 시 사용합니다.</span></div>
                        </div>
                    </div>
                ),
            },
            {
                id: 'settings-reset',
                title: '데이터 초기화',
                keywords: ['초기화', '삭제', '전체 삭제', '리셋'],
                content: (
                    <div className="space-y-4">
                        <InfoBox type="warning"><strong>주의:</strong> 이 기능은 해당 팀의 <strong>모든 프로젝트 데이터를 Firebase에서 영구 삭제</strong>합니다. 복구할 수 없습니다.</InfoBox>
                        <p style={{color:'#475569',fontSize:13}}>설정 메뉴 → 「데이터 초기화」를 클릭하면 확인 다이얼로그가 표시됩니다. 「삭제」를 클릭해야 실행됩니다.</p>
                        <InfoBox type="tip">데이터 초기화 전에 반드시 엑셀 다운로드로 백업하세요.</InfoBox>
                    </div>
                ),
            },
        ],
    },
    {
        id: 'data',
        category: '데이터 & 동기화',
        icon: <Database size={14} />,
        color: 'rose',
        sections: [
            {
                id: 'data-firebase',
                title: 'Firebase 데이터 저장',
                keywords: ['firebase', '저장', '동기화', '클라우드', '실시간'],
                content: (
                    <div className="space-y-4">
                        <p style={{color:'#475569',fontSize:13}}>모든 프로젝트 데이터는 Firebase Firestore에 실시간 저장됩니다.</p>
                        <div className="space-y-2">
                            {[
                                { item: '프로젝트 데이터', desc: 'Firestore에 팀별로 분리 저장. 여러 PC 동시 접속 시 실시간 동기화.' },
                                { item: '팀 설정',         desc: '상태 목록, 공장 목록, 기본 필터 등이 팀별로 저장.' },
                                { item: '주간보고 파일',   desc: '500KB 단위 청크로 분할하여 Firestore에 저장. 다른 PC에서 다운로드 가능.' },
                                { item: '주간보고 입력',   desc: '주차별 업무 내용이 팀별로 저장.' },
                            ].map((item, i) => (
                                <div key={i} style={{display:'flex',gap:10,alignItems:'flex-start',background:'#f8fafc',borderRadius:8,padding:'8px 12px',border:'1px solid #e2e8f0'}}>
                                    <span style={{color:'#e11d48',fontWeight:700,fontSize:11,flexShrink:0,width:90}}>{item.item}</span>
                                    <span style={{color:'#475569',fontSize:12,lineHeight:1.6}}>{item.desc}</span>
                                </div>
                            ))}
                        </div>
                        <InfoBox type="info">인터넷 연결이 없으면 데이터 로드가 되지 않습니다. 반드시 인터넷이 연결된 상태에서 사용하세요.</InfoBox>
                    </div>
                ),
            },
            {
                id: 'data-share',
                title: '파일 공유 방식',
                keywords: ['파일', '공유', '청크', '업로드', '용량', '크기'],
                content: (
                    <div className="space-y-4">
                        <p style={{color:'#475569',fontSize:13}}>주간보고 파일은 용량이 크더라도 여러 조각(청크)으로 나누어 Firestore에 저장합니다.</p>
                        <div style={{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:10,padding:14,display:'flex',flexDirection:'column',gap:8}}>
                            {['파일을 500KB 단위로 분할','각 청크를 Firestore 문서에 Base64로 저장','다른 PC 접속 시 청크를 순서대로 다운로드 후 조립','1.3MB 파일 기준 약 3개 청크로 분할'].map((t,i)=>(
                                <div key={i} style={{display:'flex',alignItems:'center',gap:8,fontSize:12,color:'#475569'}}>
                                    <ArrowRight size={11} style={{color:'#0891b2',flexShrink:0}}/>{t}
                                </div>
                            ))}
                        </div>
                        <InfoBox type="tip">파일 크기가 클수록 업로드/다운로드 시간이 늘어납니다. 가능하면 파일을 압축하여 사용하세요.</InfoBox>
                    </div>
                ),
            },
        ],
    },
    {
        id: 'tips',
        category: '사용 팁 & FAQ',
        icon: <Lightbulb size={14} />,
        color: 'teal',
        sections: [
            {
                id: 'tips-shortcuts',
                title: '빠른 사용 팁',
                keywords: ['팁', '단축', '빠른', '검색', '정렬', '클릭'],
                content: (
                    <div className="space-y-2">
                        {[
                            { tip: '행 클릭',           icon: <ArrowRight size={11}/>, desc: '프로젝트 행을 클릭하면 우측 상세 패널이 열립니다.' },
                            { tip: '셀 더블클릭 (List)', icon: <Edit2 size={11}/>,      desc: 'List 관리 화면에서 셀을 더블클릭하면 인라인 편집이 활성화됩니다.' },
                            { tip: '헤더 클릭',          icon: <ArrowRight size={11}/>, desc: '컬럼 헤더를 클릭하면 오름/내림차순으로 정렬됩니다.' },
                            { tip: '검색',               icon: <Search size={11}/>,     desc: '상단 검색창에 프로젝트명·현장명을 입력하면 실시간으로 필터링됩니다.' },
                            { tip: '상태 라벨 클릭',     icon: <ArrowRight size={11}/>, desc: '필터 바의 「상태」 라벨 자체를 클릭하면 전체 선택/해제가 됩니다.' },
                            { tip: '공장 배지 드래그',   icon: <ArrowRight size={11}/>, desc: '필터 바의 공장 배지를 드래그하여 표시 순서를 변경할 수 있습니다.' },
                            { tip: '다른 PC 접속',       icon: <ArrowRight size={11}/>, desc: 'neconsys.web.app 접속으로 어느 PC에서도 동일 데이터 조회가 가능합니다.' },
                        ].map(item => (
                            <div key={item.tip} style={{display:'flex',gap:10,alignItems:'flex-start',background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:10,padding:'8px 12px'}}>
                                <div style={{flexShrink:0,marginTop:2,color:'#0d9488'}}>{item.icon}</div>
                                <div><span style={{fontWeight:700,fontSize:12,color:'#1e293b'}}>{item.tip}</span><span style={{fontSize:12,color:'#64748b',marginLeft:8}}>{item.desc}</span></div>
                            </div>
                        ))}
                    </div>
                ),
            },
            {
                id: 'faq',
                title: 'FAQ (자주 묻는 질문)',
                keywords: ['faq', '자주', '묻는', '질문', '오류', '안됨', '느림'],
                content: (
                    <div className="space-y-2">
                        {[
                            { q: '다른 PC에서 주간보고 파일이 안 열립니다.', a: '원본 PC에서 주간보고 연결을 해제한 후 다시 연결하면 Firestore에 파일이 업로드됩니다. 그 후 다른 PC에서 열람 가능합니다.' },
                            { q: '업무현황 클릭 후 List 관리로 이동했는데 하이라이트가 안 됩니다.', a: 'Firebase 데이터 로딩이 완료된 후 하이라이트가 적용됩니다. 데이터가 많으면 1~2초 후 황색으로 표시됩니다.' },
                            { q: '필터를 초기화하고 싶습니다.', a: '필터 바 왼쪽의 「초기 상태로」 버튼(빨간 배경)을 클릭하면 설정에 저장된 기본 필터로 돌아갑니다.' },
                            { q: '데이터가 로딩되지 않습니다.', a: '인터넷 연결을 확인하세요. Firebase 접속이 차단된 네트워크(일부 회사 방화벽)에서는 데이터 로딩이 되지 않을 수 있습니다.' },
                            { q: '엑셀 파일이 다운로드되지 않습니다.', a: '브라우저의 팝업 차단 설정을 확인하세요. neconsys.web.app 도메인의 팝업을 허용해 주세요.' },
                        ].map((item, i) => (
                            <details key={i} style={{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:10,overflow:'hidden'}}>
                                <summary style={{padding:'10px 14px',cursor:'pointer',display:'flex',alignItems:'center',gap:8,listStyle:'none',outline:'none'}}>
                                    <HelpCircle size={13} style={{color:'#0d9488',flexShrink:0}}/>
                                    <span style={{fontWeight:700,fontSize:12,color:'#1e293b',flex:1}}>{item.q}</span>
                                    <ChevronRight size={12} style={{color:'#94a3b8',flexShrink:0}}/>
                                </summary>
                                <div style={{padding:'0 14px 12px',borderTop:'1px solid #e2e8f0'}}>
                                    <p style={{fontSize:12,color:'#475569',lineHeight:1.7,marginTop:10}}>{item.a}</p>
                                </div>
                            </details>
                        ))}
                    </div>
                ),
            },
        ],
    },
];

// ─────────────────────────────────────────────────────
// 메인 모달리스 다이얼로그 (드래그 + 리사이즈)
// ─────────────────────────────────────────────────────
const MIN_W = 540, MIN_H = 380;
const INIT_W = 860, INIT_H = 580;

const HelpModal = ({ onClose }) => {
    const [query, setQuery]               = useState('');
    const [activeCatId, setActiveCatId]   = useState('getting-started');
    const [activeSecId, setActiveSecId]   = useState('intro');
    const [expandedCats, setExpandedCats] = useState(() => {
        const init = {};
        HELP_DATA.forEach(c => { init[c.id] = true; });
        return init;
    });
    const [pos,  setPos]  = useState({ x: Math.max(0, window.innerWidth - INIT_W - 24), y: 60 });
    const [size, setSize] = useState({ w: INIT_W, h: INIT_H });

    const interactRef    = useRef({ mode: null, startX:0, startY:0, origX:0, origY:0, origW:0, origH:0 });
    const contentRef     = useRef(null);

    // 드래그 + 리사이즈 통합 mousemove/mouseup
    useEffect(() => {
        const onMove = (e) => {
            const d = interactRef.current;
            if (!d.mode) return;
            const dx = e.clientX - d.startX;
            const dy = e.clientY - d.startY;
            if (d.mode === 'drag') {
                setPos({
                    x: Math.max(0, Math.min(window.innerWidth  - size.w, d.origX + dx)),
                    y: Math.max(0, Math.min(window.innerHeight - size.h, d.origY + dy)),
                });
            } else {
                const newW = d.mode.includes('e') ? Math.max(MIN_W, d.origW + dx) : size.w;
                const newH = d.mode.includes('s') ? Math.max(MIN_H, d.origH + dy) : size.h;
                const newX = d.mode.includes('w') ? Math.min(d.origX + dx, d.origX + d.origW - MIN_W) : pos.x;
                const newY = d.mode.includes('n') ? Math.min(d.origY + dy, d.origY + d.origH - MIN_H) : pos.y;
                const finalW = d.mode.includes('w') ? Math.max(MIN_W, d.origW - dx) : newW;
                const finalH = d.mode.includes('n') ? Math.max(MIN_H, d.origH - dy) : newH;
                setSize({ w: finalW, h: finalH });
                if (d.mode.includes('w')) setPos(p => ({ ...p, x: newX }));
                if (d.mode.includes('n')) setPos(p => ({ ...p, y: newY }));
            }
        };
        const onUp = () => { interactRef.current.mode = null; document.body.style.cursor = ''; document.body.style.userSelect = ''; };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    }, [size, pos]);

    const startDrag = (e) => {
        if (e.target.closest('button') || e.target.closest('input')) return;
        interactRef.current = { mode:'drag', startX:e.clientX, startY:e.clientY, origX:pos.x, origY:pos.y, origW:size.w, origH:size.h };
        document.body.style.userSelect = 'none';
        e.preventDefault();
    };
    const startResize = (mode) => (e) => {
        interactRef.current = { mode, startX:e.clientX, startY:e.clientY, origX:pos.x, origY:pos.y, origW:size.w, origH:size.h };
        document.body.style.cursor = e.currentTarget.style.cursor;
        document.body.style.userSelect = 'none';
        e.preventDefault(); e.stopPropagation();
    };

    const searchResults = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return null;
        const results = [];
        HELP_DATA.forEach(cat => {
            cat.sections.forEach(sec => {
                const hit = sec.title.toLowerCase().includes(q)
                    || sec.keywords.some(k => k.toLowerCase().includes(q))
                    || cat.category.toLowerCase().includes(q);
                if (hit) results.push({ catId: cat.id, catLabel: cat.category, catColor: cat.color, sec });
            });
        });
        return results;
    }, [query]);

    const activeCat = HELP_DATA.find(c => c.id === activeCatId);
    const activeSec = activeCat?.sections.find(s => s.id === activeSecId);

    const navigate = (catId, secId) => {
        setQuery('');
        setActiveCatId(catId);
        setActiveSecId(secId);
        setExpandedCats(prev => ({ ...prev, [catId]: true }));
        contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const allSecs = HELP_DATA.flatMap(c => c.sections.map(s => ({ catId: c.id, sec: s })));
    const curIdx  = allSecs.findIndex(x => x.catId === activeCatId && x.sec.id === activeSecId);
    const prevSec = allSecs[curIdx - 1];
    const nextSec = allSecs[curIdx + 1];
    const totalSections = HELP_DATA.reduce((a, c) => a + c.sections.length, 0);

    // 리사이즈 핸들 스타일
    const rh = (cursor, style) => ({
        position:'absolute', ...style,
        cursor, zIndex:10,
        background:'transparent',
    });

    return (
        <div style={{
            position:'fixed', left:pos.x, top:pos.y,
            width:size.w, height:size.h, zIndex:9000,
            display:'flex', flexDirection:'column',
            borderRadius:12, overflow:'hidden',
            boxShadow:'0 8px 40px rgba(0,0,0,0.22), 0 0 0 1px #cbd5e1',
            background:'#ffffff',
        }}>
            {/* ── 리사이즈 핸들 ── */}
            <div style={rh('ew-resize',  {left:0,  top:4, bottom:4, width:5})}  onMouseDown={startResize('w')}/>
            <div style={rh('ew-resize',  {right:0, top:4, bottom:4, width:5})}  onMouseDown={startResize('e')}/>
            <div style={rh('ns-resize',  {top:0,  left:4, right:4, height:5})}  onMouseDown={startResize('n')}/>
            <div style={rh('ns-resize',  {bottom:0,left:4, right:4, height:5})} onMouseDown={startResize('s')}/>
            <div style={rh('nwse-resize',{top:0,  left:0,  width:10, height:10})} onMouseDown={startResize('nw')}/>
            <div style={rh('nesw-resize',{top:0,  right:0, width:10, height:10})} onMouseDown={startResize('ne')}/>
            <div style={rh('nesw-resize',{bottom:0,left:0,  width:10, height:10})} onMouseDown={startResize('sw')}/>
            <div style={rh('nwse-resize',{bottom:0,right:0, width:10, height:10})} onMouseDown={startResize('se')}/>

            {/* ── 헤더 (드래그 핸들) ── */}
            <div
                onMouseDown={startDrag}
                style={{cursor:'grab', userSelect:'none', display:'flex', alignItems:'center', gap:10,
                    padding:'8px 14px', borderBottom:'1px solid #e2e8f0', flexShrink:0,
                    background:'linear-gradient(to right,#f8fafc,#f1f5f9)'}}
            >
                {/* 드래그 힌트 */}
                <div style={{display:'flex',flexDirection:'column',gap:2.5,opacity:0.35,flexShrink:0}}>
                    {[0,1,2].map(r=><div key={r} style={{display:'flex',gap:2.5}}>{[0,1].map(c=><div key={c} style={{width:3,height:3,borderRadius:'50%',background:'#64748b'}}/>)}</div>)}
                </div>
                <div style={{padding:'4px 8px',background:'#ecfeff',border:'1px solid #a5f3fc',borderRadius:8,flexShrink:0}}>
                    <BookOpen size={14} style={{color:'#0891b2',display:'block'}}/>
                </div>
                <div style={{flex:1,minWidth:0}}>
                    <span style={{fontWeight:900,fontSize:13,color:'#0f172a',letterSpacing:'-0.3px'}}>사용자 도움말</span>
                    <span style={{color:'#94a3b8',fontSize:11,marginLeft:8}}>TechTeam PMS v1.0</span>
                </div>
                {/* 검색 */}
                <div style={{position:'relative',flexShrink:0}}>
                    <Search size={11} style={{position:'absolute',left:8,top:'50%',transform:'translateY(-50%)',color:'#94a3b8',pointerEvents:'none'}}/>
                    <input
                        value={query} onChange={e=>setQuery(e.target.value)}
                        placeholder="검색..."
                        style={{background:'#ffffff',border:'1px solid #cbd5e1',borderRadius:7,
                            paddingLeft:24,paddingRight:24,paddingTop:5,paddingBottom:5,
                            fontSize:12,color:'#0f172a',outline:'none',width:130,
                            fontFamily:'inherit'}}
                        onFocus={e=>e.target.style.borderColor='#06b6d4'}
                        onBlur={e=>e.target.style.borderColor='#cbd5e1'}
                    />
                    {query && <button onClick={()=>setQuery('')} style={{position:'absolute',right:7,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:'#94a3b8',lineHeight:1,padding:0}}><X size={11}/></button>}
                </div>
                <button onClick={onClose} style={{padding:5,background:'none',border:'none',cursor:'pointer',color:'#94a3b8',borderRadius:6,display:'flex',alignItems:'center',flexShrink:0}}
                    onMouseOver={e=>e.currentTarget.style.background='#fee2e2'}
                    onMouseOut={e=>e.currentTarget.style.background='none'}>
                    <X size={14} style={{color:'#64748b'}}/>
                </button>
            </div>

            {/* ── 바디 ── */}
            <div style={{display:'flex',flex:1,minHeight:0}}>

                {/* ── 좌측 목차 ── */}
                <aside style={{width:170,flexShrink:0,borderRight:'1px solid #e2e8f0',overflowY:'auto',background:'#f8fafc',scrollbarWidth:'thin'}}>
                    <div style={{padding:'10px 6px 10px'}}>
                        <p style={{fontSize:9,fontWeight:900,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'0.12em',padding:'0 6px 8px',display:'flex',alignItems:'center',gap:4}}>
                            <Hash size={8}/> 목차
                        </p>
                        {HELP_DATA.map(cat => {
                            const clr  = COLOR_MAP[cat.color] || COLOR_MAP.slate;
                            const open = expandedCats[cat.id];
                            const isCatActive = activeCatId === cat.id && !query;
                            return (
                                <div key={cat.id}>
                                    <button
                                        onClick={()=>setExpandedCats(prev=>({...prev,[cat.id]:!prev[cat.id]}))}
                                        style={{width:'100%',display:'flex',alignItems:'center',gap:6,padding:'6px 8px',borderRadius:8,
                                            border:'none',background:'none',cursor:'pointer',textAlign:'left',
                                            fontSize:11,fontWeight:700,
                                            color: isCatActive ? clr.text : '#64748b'}}
                                        onMouseOver={e=>{if(!isCatActive) e.currentTarget.style.background='#e2e8f0';}}
                                        onMouseOut={e=>{if(!isCatActive) e.currentTarget.style.background='none';}}
                                    >
                                        <span style={{color: isCatActive ? clr.text : '#94a3b8'}}>{cat.icon}</span>
                                        <span style={{flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{cat.category}</span>
                                        <ChevronDown size={10} style={{color:'#cbd5e1',flexShrink:0,transform: open?'':'rotate(-90deg)',transition:'transform 0.15s'}}/>
                                    </button>
                                    {open && (
                                        <div style={{marginLeft:10,paddingLeft:8,borderLeft:'2px solid #e2e8f0',marginTop:2,marginBottom:4}}>
                                            {cat.sections.map(sec => {
                                                const isActive = isCatActive && activeSecId === sec.id;
                                                return (
                                                    <button key={sec.id} onClick={()=>navigate(cat.id,sec.id)}
                                                        style={{width:'100%',textAlign:'left',padding:'4px 8px',borderRadius:6,
                                                            fontSize:10,fontWeight: isActive ? 700 : 500,
                                                            border: isActive ? `1px solid ${clr.activeBorder}` : '1px solid transparent',
                                                            background: isActive ? clr.activeBg : 'none',
                                                            color: isActive ? clr.activeText : '#64748b',
                                                            cursor:'pointer',marginBottom:1,
                                                            overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}
                                                        onMouseOver={e=>{if(!isActive){e.currentTarget.style.background='#e2e8f0';e.currentTarget.style.color='#334155';}}}
                                                        onMouseOut={e=>{if(!isActive){e.currentTarget.style.background='none';e.currentTarget.style.color='#64748b';}}}
                                                    >{sec.title}</button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </aside>

                {/* ── 우측 콘텐츠 ── */}
                <main ref={contentRef} style={{flex:1,overflowY:'auto',padding:'18px 22px',background:'#ffffff',scrollbarWidth:'thin'}}>

                    {/* 검색 결과 */}
                    {query && (
                        <div style={{display:'flex',flexDirection:'column',gap:8}}>
                            <p style={{fontSize:11,color:'#64748b',marginBottom:8,display:'flex',alignItems:'center',gap:6}}>
                                <Search size={10}/> 「<strong style={{color:'#0f172a'}}>{query}</strong>」 검색 결과 — {searchResults.length}건
                            </p>
                            {searchResults.length === 0 ? (
                                <div style={{textAlign:'center',padding:'48px 0',color:'#94a3b8'}}>
                                    <Search size={24} style={{margin:'0 auto 8px',opacity:0.4}}/>
                                    <p style={{fontSize:13}}>검색 결과가 없습니다.</p>
                                </div>
                            ) : searchResults.map(r => {
                                const clr = COLOR_MAP[r.catColor] || COLOR_MAP.slate;
                                return (
                                    <button key={r.sec.id} onClick={()=>navigate(r.catId,r.sec.id)}
                                        style={{width:'100%',textAlign:'left',background:'#f8fafc',border:'1px solid #e2e8f0',
                                            borderRadius:10,padding:'10px 14px',cursor:'pointer'}}
                                        onMouseOver={e=>e.currentTarget.style.borderColor='#94a3b8'}
                                        onMouseOut={e=>e.currentTarget.style.borderColor='#e2e8f0'}
                                    >
                                        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                                            <span style={{fontSize:9,fontWeight:900,padding:'2px 7px',borderRadius:4,border:`1px solid ${clr.activeBorder}`,background:clr.activeBg,color:clr.activeText}}>{r.catLabel}</span>
                                            <ChevronRight size={10} style={{color:'#cbd5e1'}}/>
                                            <span style={{fontWeight:700,fontSize:12,color:'#1e293b'}}>{r.sec.title}</span>
                                        </div>
                                        <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                                            {r.sec.keywords.filter(k=>k.toLowerCase().includes(query.toLowerCase())).slice(0,4).map(k=>(
                                                <span key={k} style={{fontSize:10,background:'#e2e8f0',color:'#64748b',padding:'1px 7px',borderRadius:4}}>{k}</span>
                                            ))}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* 일반 콘텐츠 */}
                    {!query && activeSec && activeCat && (() => {
                        const clr = COLOR_MAP[activeCat.color] || COLOR_MAP.slate;
                        return (
                            <div>
                                {/* 브레드크럼 */}
                                <div style={{display:'flex',alignItems:'center',gap:4,fontSize:10,color:'#94a3b8',marginBottom:12}}>
                                    <span style={{color:clr.text}}>{activeCat.icon}</span>
                                    <span>{activeCat.category}</span>
                                    <ChevronRight size={9}/>
                                    <span style={{color:'#64748b'}}>{activeSec.title}</span>
                                </div>
                                {/* 섹션 타이틀 */}
                                <h2 style={{fontSize:17,fontWeight:900,color:'#0f172a',margin:'0 0 4px'}}>{activeSec.title}</h2>
                                <div style={{height:3,width:36,borderRadius:2,background:clr.dot,marginBottom:18}}/>
                                {/* 본문 */}
                                <div style={{fontSize:13}}>{activeSec.content}</div>
                                {/* 이전/다음 */}
                                <div style={{display:'flex',justifyContent:'space-between',marginTop:24,paddingTop:14,borderTop:'1px solid #e2e8f0'}}>
                                    {prevSec ? (
                                        <button onClick={()=>navigate(prevSec.catId,prevSec.sec.id)}
                                            style={{display:'flex',alignItems:'center',gap:5,fontSize:11,fontWeight:700,color:'#64748b',background:'none',border:'none',cursor:'pointer',padding:'4px 8px',borderRadius:6}}
                                            onMouseOver={e=>{e.currentTarget.style.color='#0f172a';e.currentTarget.style.background='#f1f5f9';}}
                                            onMouseOut={e=>{e.currentTarget.style.color='#64748b';e.currentTarget.style.background='none';}}>
                                            <ChevronRight size={12} style={{transform:'rotate(180deg)'}}/>{prevSec.sec.title}
                                        </button>
                                    ) : <div/>}
                                    {nextSec ? (
                                        <button onClick={()=>navigate(nextSec.catId,nextSec.sec.id)}
                                            style={{display:'flex',alignItems:'center',gap:5,fontSize:11,fontWeight:700,color:'#64748b',background:'none',border:'none',cursor:'pointer',padding:'4px 8px',borderRadius:6}}
                                            onMouseOver={e=>{e.currentTarget.style.color='#0f172a';e.currentTarget.style.background='#f1f5f9';}}
                                            onMouseOut={e=>{e.currentTarget.style.color='#64748b';e.currentTarget.style.background='none';}}>
                                            {nextSec.sec.title}<ChevronRight size={12}/>
                                        </button>
                                    ) : <div/>}
                                </div>
                            </div>
                        );
                    })()}
                </main>
            </div>

            {/* ── 푸터 ── */}
            <div style={{padding:'5px 14px',borderTop:'1px solid #e2e8f0',background:'#f8fafc',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <span style={{fontSize:10,color:'#94a3b8'}}>헤더 드래그로 이동 · 가장자리 드래그로 크기 조절</span>
                <span style={{fontSize:10,color:'#94a3b8'}}>{totalSections}개 항목 · {HELP_DATA.length}개 카테고리</span>
            </div>
        </div>
    );
};

export default HelpModal;
