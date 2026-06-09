import React from 'react';

const AlertModal = ({ alertMessage, onClose }) => {
    if (!alertMessage) return null;
    return (
        <div className="fixed inset-0 z-[200] flex justify-center items-center p-4 bg-slate-950/80 animate-in">
            <div className="bg-slate-900 border border-slate-700 p-8 rounded-3xl max-w-sm w-full text-center shadow-2xl whitespace-pre-line">
                    <p className="text-white text-lg font-bold mb-6">{alertMessage}</p>
                    <button onClick={onClose} className="px-6 py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-bold transition-all w-full">확인</button>
            </div>
        </div>
    );
};

export default AlertModal;
