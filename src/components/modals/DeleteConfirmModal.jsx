import React from 'react';
import { Trash2 } from 'lucide-react';

const DeleteConfirmModal = ({ onCancel, onConfirm }) => {
    return (
        <div className="fixed inset-0 z-[200] flex justify-center items-center p-4 bg-slate-950/80 animate-in">
            <div className="bg-slate-900 border border-slate-700 p-8 rounded-3xl max-w-sm w-full text-center shadow-2xl">
                    <Trash2 className="w-12 h-12 text-rose-500 mx-auto mb-4 opacity-80" />
                    <p className="text-white text-lg font-bold mb-2">프로젝트 삭제</p>
                    <p className="text-slate-400 text-sm mb-8">정말로 삭제하시겠습니까?<br/>이 작업은 되돌릴 수 없습니다.</p>
                    <div className="flex gap-3 justify-center">
                        <button onClick={onCancel} className="flex-1 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold transition-all">취소</button>
                        <button onClick={onConfirm} className="flex-1 px-4 py-3 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-rose-900/30">삭제하기</button>
                    </div>
            </div>
        </div>
    );
};

export default DeleteConfirmModal;
