import React from 'react';
import { Save, AlertTriangle, Plus } from 'lucide-react';

const SaveConfirmModal = ({ localUnsavedProjects, currentTeam, onClose, onOverwrite, onAppend }) => {
    return (
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
                    <button onClick={onOverwrite} className="w-full px-4 py-3.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold transition-all shadow-md flex items-center justify-center gap-2">
                        <AlertTriangle size={16} /> 기존 데이터 삭제 및 덮어쓰기
                    </button>
                    <button onClick={onAppend} className="w-full px-4 py-3.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-bold transition-all shadow-md flex items-center justify-center gap-2">
                        <Plus size={16} /> 기존 데이터 유지 및 추가 저장
                    </button>
                    <button onClick={onClose} className="w-full mt-2 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold transition-all border border-slate-700">
                        취소
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SaveConfirmModal;
