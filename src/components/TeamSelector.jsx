import React, { useState } from 'react';
import { LayoutGrid, Wrench, Cpu, Monitor, TerminalSquare, FileText, ListChecks, ChevronRight } from 'lucide-react';
import { initialTeamSettings } from '../constants';

// 서브메뉴가 있는 팀 목록 (추후 다른 팀도 추가 가능)
const TEAM_SUBMENU = {
    '기술2팀': [
        { mode: 'report',      label: '월간 업무 보고',    desc: '시운전 실적 및 공정률 월간 현황 관리', icon: <FileText className="w-5 h-5 text-cyan-400" /> },
        { mode: 'projectlist', label: '프로젝트 List 관리', desc: '팀 전체 프로젝트 목록 엑셀 기반 관리',  icon: <ListChecks className="w-5 h-5 text-emerald-400" /> },
    ]
};

const TeamSelector = ({ teamSettings, onSelectTeam }) => {
    const [expandedTeam, setExpandedTeam] = useState(null);

    const icons = {
        '기술1팀':    <Wrench       className="w-10 h-10 text-indigo-400 mb-4" />,
        '기술2팀':    <Cpu          className="w-10 h-10 text-cyan-400 mb-4"   />,
        '기술3팀':    <Monitor      className="w-10 h-10 text-emerald-400 mb-4"/>,
        'Software팀': <TerminalSquare className="w-10 h-10 text-purple-400 mb-4"/>
    };
    const descs = {
        '기술1팀':    '설비 유지보수 및 하드웨어 인프라 제어',
        '기술2팀':    '자동제어 시스템 및 통합 시운전 관리',
        '기술3팀':    '네트워크 망 및 현장 모니터링 시스템',
        'Software팀': '사내 포털 및 MES 데이터베이스 개발'
    };

    const handleTeamClick = (teamId) => {
        if (TEAM_SUBMENU[teamId]) {
            setExpandedTeam(expandedTeam === teamId ? null : teamId);
        } else {
            onSelectTeam(teamId, 'report', teamSettings, initialTeamSettings);
        }
    };

    return (
        <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6">
            <div className="max-w-5xl w-full animate-in">
                <div className="text-center mb-16">
                    <div className="inline-flex items-center justify-center p-4 bg-slate-900 rounded-3xl shadow-[0_0_40px_rgba(6,182,212,0.15)] border border-slate-800 mb-6">
                        <LayoutGrid size={40} className="text-cyan-400" />
                    </div>
                    <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4 text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400 flex flex-col md:flex-row items-center justify-center gap-4">
                        통합 프로젝트 관리 플랫폼
                        <span className="text-lg px-3 py-1 bg-cyan-500/20 text-cyan-400 rounded-xl border border-cyan-500/30 font-mono font-bold tracking-widest shadow-sm">v1.0</span>
                    </h1>
                    <p className="text-slate-400 text-lg mt-4">데이터 조회를 위해 접속하실 부서를 선택해 주세요.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {['기술1팀', '기술2팀', '기술3팀', 'Software팀'].map(teamId => {
                        const hasSubmenu = !!TEAM_SUBMENU[teamId];
                        const isExpanded = expandedTeam === teamId;

                        return (
                            <div key={teamId} className="flex flex-col">
                                {/* 팀 메인 카드 */}
                                <button
                                    onClick={() => handleTeamClick(teamId)}
                                    className={`team-card flex flex-col items-start text-left p-8 bg-slate-900/50 border rounded-3xl transition-all group
                                        ${isExpanded
                                            ? 'border-cyan-500/60 bg-slate-800/60 rounded-b-none shadow-[0_0_20px_rgba(6,182,212,0.1)]'
                                            : 'border-slate-800 hover:bg-slate-800 hover:-translate-y-1'
                                        }`}
                                >
                                    <div className="flex justify-between items-start w-full">
                                        {icons[teamId]}
                                        {hasSubmenu && (
                                            <span className={`text-[10px] font-black px-2 py-1 rounded-md border transition-all ${isExpanded ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' : 'bg-slate-800 text-slate-500 border-slate-700'}`}>
                                                {isExpanded ? '▲ 접기' : '▼ 메뉴'}
                                            </span>
                                        )}
                                    </div>
                                    <h2 className={`text-2xl font-bold mb-2 transition-colors ${isExpanded ? 'text-cyan-400' : 'text-white group-hover:text-cyan-400'}`}>{teamId}</h2>
                                    <p className="text-slate-500 font-medium">{descs[teamId]}</p>
                                </button>

                                {/* 서브메뉴 (확장 시) */}
                                {hasSubmenu && isExpanded && (
                                    <div className="bg-slate-800/60 border border-cyan-500/30 border-t-0 rounded-b-3xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                                        {TEAM_SUBMENU[teamId].map((sub, idx) => (
                                            <button
                                                key={sub.mode}
                                                onClick={() => onSelectTeam(teamId, sub.mode, teamSettings, initialTeamSettings)}
                                                className={`w-full flex items-center gap-4 px-8 py-5 text-left hover:bg-slate-700/60 transition-all group/sub
                                                    ${idx < TEAM_SUBMENU[teamId].length - 1 ? 'border-b border-slate-700/50' : ''}`}
                                            >
                                                <div className="p-2.5 bg-slate-900 rounded-xl border border-slate-700 group-hover/sub:border-slate-600 transition-colors shrink-0">
                                                    {sub.icon}
                                                </div>
                                                <div className="flex-1">
                                                    <div className="font-bold text-white text-sm group-hover/sub:text-cyan-300 transition-colors">{sub.label}</div>
                                                    <div className="text-xs text-slate-500 mt-0.5">{sub.desc}</div>
                                                </div>
                                                <ChevronRight size={16} className="text-slate-600 group-hover/sub:text-cyan-400 transition-colors shrink-0" />
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default TeamSelector;
