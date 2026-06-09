import React from 'react';
import { TerminalSquare, X } from 'lucide-react';

const DebugPanel = ({ logs, onClear, onClose, logEndRef }) => {
    return (
        <div className="absolute bottom-4 right-4 w-[450px] max-h-[350px] bg-slate-950/95 border border-slate-700/80 rounded-2xl shadow-2xl z-[99999] flex flex-col overflow-hidden backdrop-blur-md animate-in fade-in slide-in-from-bottom-10">
            <div className="flex justify-between items-center p-3 bg-slate-900 border-b border-slate-800 cursor-move">
                <span className="text-emerald-400 font-mono text-[11px] font-black flex items-center gap-2">
                    <TerminalSquare size={14} /> SYSTEM DEBUG MONITOR
                </span>
                <div className="flex items-center gap-3">
                    <button onClick={onClear} className="text-slate-500 hover:text-white text-[10px] font-bold tracking-widest uppercase transition-colors">Clear</button>
                    <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors bg-slate-800 p-1 rounded-md"><X size={14}/></button>
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
    );
};

export default DebugPanel;
