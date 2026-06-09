// WeeklyPanelViewer - v1.0.0
// 월간보고 사이드 패널용 FortuneSheet 읽기 전용 뷰어
// WeeklyReportScreen과 동일한 스크롤/줌 핸들러 적용
import React, { useRef, useEffect, useState } from 'react';
import { Workbook } from '@fortune-sheet/react';
import '@fortune-sheet/react/dist/index.css';

const ZOOM_MIN  = 0.5;
const ZOOM_MAX  = 3.0;
const ZOOM_STEP = 0.1;

const WeeklyPanelViewer = ({ sheets }) => {
    const workbookRef = useRef(null);
    const zoomRef     = useRef(1.0);
    const [mounted, setMounted]   = useState(false);

    // 마운트 후 약간의 delay로 FortuneSheet 렌더링 안정화
    useEffect(() => {
        const t = setTimeout(() => setMounted(true), 50);
        return () => clearTimeout(t);
    }, []);

    // ── 탭 클릭 → 스크롤 리셋 ────────────────────────────────────────────
    useEffect(() => {
        if (!mounted) return;
        const handleTabClick = (e) => {
            const tab = e.target.closest('.luckysheet-sheets-item');
            if (!tab || tab.classList.contains('luckysheet-sheets-item-active')) return;
            const doReset = () => {
                // 패널 내부 스크롤바만 대상 (패널이 여러 개일 경우 querySelector는 첫 번째 매칭)
                const sbY = document.querySelector('.fortune-sheet-container .luckysheet-scrollbar-y');
                if (sbY) sbY.scrollTop = 0;
            };
            setTimeout(doReset, 50);
            setTimeout(doReset, 300);
        };
        document.addEventListener('click', handleTabClick, true);
        return () => document.removeEventListener('click', handleTabClick, true);
    }, [mounted]);

    // ── 휠 통합 핸들러 ────────────────────────────────────────────────────
    useEffect(() => {
        if (!mounted) return;
        const onWheel = (e) => {
            if (e.ctrlKey) {
                e.preventDefault();
                e.stopImmediatePropagation();
                const btns = document.querySelectorAll('.fortune-zoom-container > .fortune-zoom-button');
                if (e.deltaY < 0) {
                    const nz = Math.min(ZOOM_MAX, Math.round((zoomRef.current + ZOOM_STEP) * 10) / 10);
                    if (nz !== zoomRef.current) { btns[1]?.click(); zoomRef.current = nz; }
                } else if (e.deltaY > 0) {
                    const nz = Math.max(ZOOM_MIN, Math.round((zoomRef.current - ZOOM_STEP) * 10) / 10);
                    if (nz !== zoomRef.current) { btns[0]?.click(); zoomRef.current = nz; }
                }
                return;
            }
            const container = document.querySelector('.fortune-sheet-container');
            if (!container || !container.contains(e.target)) return;
            e.stopImmediatePropagation();
            e.preventDefault();
            if (e.deltaY !== 0) {
                const sbY = document.querySelector('.luckysheet-scrollbar-y');
                if (sbY) sbY.scrollTop += e.deltaY;
            }
            if (e.deltaX !== 0) {
                const sbX = document.querySelector('.luckysheet-scrollbar-x');
                if (sbX) sbX.scrollLeft += e.deltaX;
            }
        };
        document.addEventListener('wheel', onWheel, { passive: false, capture: true });
        return () => document.removeEventListener('wheel', onWheel, { capture: true });
    }, [mounted]);

    if (!mounted || !sheets) return null;

    return (
        <div style={{ position: 'absolute', inset: 0 }}>
            <Workbook
                ref={workbookRef}
                data={sheets}
                style={{ width: '100%', height: '100%' }}
                showToolbar={false}
                showFormulaBar={false}
                showSheetTabs={true}
                allowEdit={false}
                lang="en"
            />
        </div>
    );
};

export default WeeklyPanelViewer;
