import React from 'react';
import { AlertTriangle } from 'lucide-react';

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

export default ErrorBoundary;
