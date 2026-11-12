// ===== 대시보드 공통 부품: 카드·판정 배지·분포 막대(SVG)·바로가기 =====
// 화면 코드는 다크 기준 Tailwind 색 이름을 쓰고, 라이트 모드는 styles/theme-light-colors.css 가 바꿔 준다.
import { escapeAttr, escapeHtml } from '../../core/utils.js';
import { HOME_LEVELS } from './homeData.js';

const LEVEL_TONE = {
    safe: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    proper: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
    hope: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    challenge: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    insufficient: 'bg-slate-700/40 text-slate-300 border-slate-600',
    unknown: 'bg-slate-700/40 text-slate-400 border-slate-600',
    none: 'bg-slate-800/60 text-slate-400 border-slate-700'
};

export function levelPill(level, label) {
    return `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full border text-xs font-bold whitespace-nowrap ${LEVEL_TONE[level] || LEVEL_TONE.unknown}">${escapeHtml(label)}</span>`;
}

export function reasonChip(text) {
    return `<span class="inline-flex px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-[11px] text-slate-300 whitespace-nowrap">${escapeHtml(text)}</span>`;
}

export function pageHeader(title, subtitle = '', badge = '') {
    return `
        <div class="flex flex-wrap items-end justify-between gap-2 mb-5">
            <div>
                <h1 class="text-2xl font-black text-white">${escapeHtml(title)}</h1>
                ${subtitle ? `<p class="text-sm text-slate-400 mt-1">${escapeHtml(subtitle)}</p>` : ''}
            </div>
            ${badge ? `<span class="text-xs px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-300 font-bold">${escapeHtml(badge)}</span>` : ''}
        </div>`;
}

export function statCards(cards) {
    return `
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            ${cards.map((c) => `
                <div class="rounded-2xl bg-slate-800/50 border border-slate-700/60 p-4 flex flex-col gap-1">
                    <span class="text-xs text-slate-400 font-semibold">${escapeHtml(c.label)}</span>
                    <strong class="text-2xl font-black text-white">${escapeHtml(c.value)}</strong>
                    ${c.note ? `<span class="text-xs text-slate-400">${escapeHtml(c.note)}</span>` : ''}
                </div>`).join('')}
        </div>`;
}

export function section(title, body, { note = '', extra = '' } = {}) {
    return `
        <section class="rounded-2xl bg-slate-800/40 border border-slate-700/60 p-5 min-w-0">
            <div class="flex flex-wrap items-baseline justify-between gap-2 mb-3">
                <h2 class="text-base font-bold text-white">${escapeHtml(title)}</h2>
                ${extra}
            </div>
            ${note ? `<p class="text-xs text-slate-400 -mt-1 mb-3">${escapeHtml(note)}</p>` : ''}
            ${body}
        </section>`;
}

/** 판정 단계별 인원 가로 막대(SVG). counts: { safe: 3, ... } */
export function distributionBars(counts, { skip = [] } = {}) {
    const levels = HOME_LEVELS.filter((l) => !skip.includes(l.key));
    const max = Math.max(1, ...levels.map((l) => counts[l.key] || 0));
    const rowH = 30;
    const labelW = 104;
    const barW = 200;
    const height = levels.length * rowH;
    const rows = levels.map((l, i) => {
        const n = counts[l.key] || 0;
        const w = Math.round((n / max) * barW);
        const y = i * rowH;
        return `
            <g transform="translate(0 ${y})">
                <text x="0" y="19" class="home-bar-label">${escapeHtml(l.label)}</text>
                <rect x="${labelW}" y="8" width="${barW}" height="14" rx="7" class="home-bar-track"></rect>
                ${w > 0 ? `<rect x="${labelW}" y="8" width="${Math.max(w, 6)}" height="14" rx="7" fill="${l.color}"></rect>` : ''}
                <text x="${labelW + barW + 10}" y="20" class="home-bar-value">${n}명</text>
            </g>`;
    }).join('');
    return `<svg class="home-bars" viewBox="0 0 ${labelW + barW + 52} ${height}" role="img" aria-label="판정 단계별 인원">${rows}</svg>`;
}

/** 바로가기 버튼 묶음. items: [{ id, label, desc }] — 누르면 data-home-action 으로 처리한다. */
export function shortcutGrid(items) {
    return `
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            ${items.map((it) => `
                <button type="button" data-home-action="${escapeAttr(it.id)}"
                    class="text-left rounded-xl bg-slate-900/50 hover:bg-indigo-950/40 border border-slate-700/60 hover:border-indigo-500/50 px-4 py-3 transition-colors cursor-pointer">
                    <span class="block text-sm font-bold text-white">${escapeHtml(it.label)}</span>
                    ${it.desc ? `<span class="block text-xs text-slate-400 mt-0.5">${escapeHtml(it.desc)}</span>` : ''}
                </button>`).join('')}
        </div>`;
}

export function loadingHTML(text = '대시보드 자료를 모으는 중...') {
    return `<div class="py-24 text-center text-slate-400"><span class="spinner"></span>${escapeHtml(text)}</div>`;
}
