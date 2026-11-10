import { state } from './store.js';
// ===== 일반고 지원가이드 판정 기준선 전역 헬퍼 (기본 80%) =====
export function getGeneralGuideCutoff() {
    const val = localStorage.getItem('phgc_general_guide_cutoff');
    if (val !== null && !isNaN(parseFloat(val))) {
        return parseFloat(val);
    }
    return 80.0;
}

export function setGeneralGuideCutoff(val) {
    localStorage.setItem('phgc_general_guide_cutoff', val);
    state.generalGuideCutoff = val;
}

export function getGeneralGuideBadge(percentile) {
    const cutoff = getGeneralGuideCutoff();
    const border = Math.min(100, cutoff + 10.0);
    if (percentile <= cutoff) {
        return `<span class="inline-flex items-center justify-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-600 text-white border border-emerald-400 shadow-xs whitespace-nowrap">🟢 안정 (${percentile.toFixed(2)}%)</span>`;
    } else if (percentile <= border) {
        return `<span class="inline-flex items-center justify-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-500 text-slate-950 border border-amber-300 shadow-xs whitespace-nowrap">🟡 경계 (${percentile.toFixed(2)}%)</span>`;
    } else {
        return `<span class="inline-flex items-center justify-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-rose-600 text-white border border-rose-400 shadow-xs whitespace-nowrap">🔴 주의 (${percentile.toFixed(2)}%)</span>`;
    }
}
