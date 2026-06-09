import React from 'react';
import { AlertTriangle } from 'lucide-react';

const DeleteAllModal = ({ currentTeam, onCancel, onConfirm }) => {
    return (
        <div className="fixed inset-0 z-[200] flex justify-center items-center p-4 bg-slate-950/80 animate-in">
            <div className="bg-slate-900 border border-rose-500/30 p-8 rounded-3xl max-w-sm w-full text-center shadow-2xl">
                    <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto mb-4 animate-pulse" />
                    <p className="text-white text-lg font-bold mb-2">{currentTeam} 전체 데이터 삭제</p>
                    <p className="text-rose-400 text-sm mb-2 font-bold">경고: 이 작업은 절대 되돌릴 수 없습니다!</p>
                    <p className="text-slate-400 text-xs mb-8">현재 팀의 모든 프로젝트와 실적 데이터가 영구적으로 삭제됩니다. 계속하시겠습니까?</p>
                    <div className="flex gap-3 justify-center">
                        <button onClick={onCancel} className="flex-1 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold transition-all">취소</button>
                        <button onClick={onConfirm} className="flex-1 px-4 py-3 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-rose-900/30">모두 삭제하기</button>
                    </div>
            </div>
        </div>
    );
};

export default DeleteAllModal;
