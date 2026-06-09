import React from 'react';
import { BarChart3, Edit2, Trash2 } from 'lucide-react';

const ContextMenu = ({ contextMenu, onGraph, onEdit, onDelete }) => {
    if (!contextMenu) return null;
    return (
        <div
            className="fixed z-[9999] bg-slate-800 border border-slate-600 shadow-2xl rounded-2xl py-1.5 w-44 animate-in fade-in zoom-in duration-100 overflow-hidden"
            style={{
                top: Math.min(contextMenu.y, window.innerHeight - 150),
                left: Math.min(contextMenu.x, window.innerWidth - 180)
            }}
            onClick={(e) => e.stopPropagation()}
        >
            <div className="px-3 py-1.5 border-b border-slate-700/50 mb-1">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider truncate">Project Actions</p>
            </div>
            <button
                onClick={onGraph}
                className="w-full text-left px-4 py-2 hover:bg-slate-700 flex items-center gap-3 text-sm font-bold text-cyan-400 transition-colors"
            >
                <BarChart3 size={16} /> 실적 그래프 보기
            </button>
            <button
                onClick={onEdit}
                className="w-full text-left px-4 py-2 hover:bg-slate-700 flex items-center gap-3 text-sm font-bold text-slate-300 transition-colors"
            >
                <Edit2 size={16} className="text-emerald-400" /> 상세 수정하기
            </button>
            <div className="border-t border-slate-700/50 my-1"></div>
            <button
                onClick={onDelete}
                className="w-full text-left px-4 py-2 hover:bg-rose-900/40 flex items-center gap-3 text-sm font-bold text-rose-400 transition-colors"
            >
                <Trash2 size={16} /> 삭제하기
            </button>
        </div>
    );
};

export default ContextMenu;
