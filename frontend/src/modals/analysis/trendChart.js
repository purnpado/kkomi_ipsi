// ===== 입시 분석: 여러 해 추세 그래프(SVG) =====
// 학교·학과·전형별로 학년도마다 관내 통합·우리 학교 합격 최저점, 관내 1차 합격선과 지원·합격 인원을 그린다.
// 산출식(만점·요강)이 바뀐 해는 점선으로 표시하고, 만점이 다른 해끼리 비교할 수 있게 "만점 대비 %" 보기를 둔다.
import { escapeHtml } from '../../core/utils.js';
import { totalMaxFor } from '../../core/admissionJudgment.js';
import { admissionLabel } from '../../core/admissionYear.js';

const W = 720;
const PAD = { left: 52, right: 20, top: 18, bottom: 34 };
const SERIES = [
    { key: 'regionAcceptedMin', label: '관내 합격 최저', color: '#34d399', dash: '' },
    { key: 'ourAcceptedMin', label: '우리 학교 합격 최저', color: '#38bdf8', dash: '' },
    { key: 'regionStage1Min', label: '관내 1차 합격선', color: '#fbbf24', dash: '5 4' }
];

let viewMode = 'score'; // 'score' | 'pct'

function niceRange(values) {
    let lo = Math.min(...values);
    let hi = Math.max(...values);
    if (lo === hi) {
        lo -= 5;
        hi += 5;
    }
    const pad = (hi - lo) * 0.12;
    return [lo - pad, hi + pad];
}

function yearX(index, count) {
    const inner = W - PAD.left - PAD.right;
    return count <= 1 ? PAD.left + inner / 2 : PAD.left + (inner * index) / (count - 1);
}

function lineChartSVG(points, fallbackMax) {
    const H = 260;
    const value = (p, key) => {
        const v = Number(p[key]) || 0;
        if (!(v > 0)) return null;
        if (viewMode === 'score') return v;
        const max = Number(p.totalMax) || fallbackMax;
        return max > 0 ? (v / max) * 100 : null;
    };
    const all = [];
    points.forEach(p => SERIES.forEach(s => { const v = value(p, s.key); if (v !== null) all.push(v); }));
    if (all.length === 0) return '<p class="text-xs text-slate-500 py-6 text-center">합격 점수 자료가 있는 학년도가 없습니다.</p>';
    const [lo, hi] = niceRange(all);
    const y = v => PAD.top + (H - PAD.top - PAD.bottom) * (1 - (v - lo) / (hi - lo));
    const n = points.length;
    const ticks = [0, 0.25, 0.5, 0.75, 1].map(t => lo + (hi - lo) * t);
    const unit = viewMode === 'score' ? '' : '%';

    const grid = ticks.map(t => `
        <line x1="${PAD.left}" x2="${W - PAD.right}" y1="${y(t)}" y2="${y(t)}" stroke="#334155" stroke-width="1"/>
        <text x="${PAD.left - 6}" y="${y(t) + 4}" text-anchor="end" font-size="10" fill="#94a3b8">${t.toFixed(viewMode === 'score' ? 0 : 1)}${unit}</text>`).join('');
    const xLabels = points.map((p, i) => `<text x="${yearX(i, n)}" y="${H - 12}" text-anchor="middle" font-size="11" fill="#cbd5e1">${p.admissionYear}</text>`).join('');
    const changes = points.map((p, i) => {
        if (!p.formulaChanged || i === 0) return '';
        const x = (yearX(i - 1, n) + yearX(i, n)) / 2;
        return `<line x1="${x}" x2="${x}" y1="${PAD.top}" y2="${H - PAD.bottom}" stroke="#f472b6" stroke-width="1.5" stroke-dasharray="4 4"/>
            <text x="${x + 4}" y="${PAD.top + 10}" font-size="10" fill="#f9a8d4">산출식 변경</text>`;
    }).join('');
    // 같은 해 숫자 표시가 겹치지 않게 놓는다.
    // 점끼리 떨어져 있으면 숫자를 점 바로 위에, 점이 몰려 있으면(18px 안) 몰린 점들의 숫자를
    // 점 옆(마지막 해는 왼쪽, 그 밖은 오른쪽)에 세로로 나란히 놓아 점·눈금 글자와 겹치지 않게 한다.
    const LABEL_GAP = 13;
    const labelPos = new Map();
    points.forEach((p, i) => {
        const x = yearX(i, n);
        const items = SERIES.map(s => ({ key: s.key, v: value(p, s.key) })).filter(it => it.v !== null)
            .map(it => ({ ...it, py: y(it.v) })).sort((a, b) => a.py - b.py);
        const clusters = [];
        items.forEach((it) => {
            const last = clusters[clusters.length - 1];
            if (last && it.py - last[last.length - 1].py < 18) last.push(it);
            else clusters.push([it]);
        });
        const right = i < n - 1;
        clusters.forEach((group) => {
            if (group.length === 1) {
                labelPos.set(`${i}|${group[0].key}`, { x, y: group[0].py - 8, anchor: 'middle' });
                return;
            }
            const center = group.reduce((sum, it) => sum + it.py, 0) / group.length;
            group.forEach((it, k) => labelPos.set(`${i}|${it.key}`, {
                x: right ? x + 9 : x - 9,
                y: center - ((group.length - 1) * LABEL_GAP) / 2 + k * LABEL_GAP + 4,
                anchor: right ? 'start' : 'end'
            }));
        });
    });
    const lines = SERIES.map(s => {
        const pts = points.map((p, i) => ({ v: value(p, s.key), x: yearX(i, n), p }));
        const segs = [];
        let cur = [];
        pts.forEach(pt => {
            if (pt.v === null) {
                if (cur.length) segs.push(cur);
                cur = [];
            } else {
                cur.push(pt);
            }
        });
        if (cur.length) segs.push(cur);
        const paths = segs.filter(seg => seg.length > 1).map(seg => `<polyline fill="none" stroke="${s.color}" stroke-width="2.2" ${s.dash ? `stroke-dasharray="${s.dash}"` : ''} points="${seg.map(pt => `${pt.x},${y(pt.v)}`).join(' ')}"/>`).join('');
        const dots = pts.filter(pt => pt.v !== null).map((pt) => {
            const idx = points.indexOf(pt.p);
            const raw = Number(pt.p[s.key]);
            const max = Number(pt.p.totalMax) || fallbackMax;
            const pos = labelPos.get(`${idx}|${s.key}`) || { x: pt.x, y: y(pt.v) - 8, anchor: 'middle' };
            const tip = `${pt.p.admissionYear} 고입 ${s.label}: ${raw.toFixed(2)}점${max ? ` / ${max}점 만점 (${(raw / max * 100).toFixed(1)}%)` : ''}`;
            return `<circle cx="${pt.x}" cy="${y(pt.v)}" r="4" fill="${s.color}"><title>${escapeHtml(tip)}</title></circle>
                <text x="${pos.x}" y="${pos.y}" text-anchor="${pos.anchor}" font-size="10" font-weight="600" class="trend-label" fill="${s.color}">${pt.v.toFixed(viewMode === 'score' ? 1 : 1)}${unit}</text>`;
        }).join('');
        return paths + dots;
    }).join('');
    return `<svg viewBox="0 0 ${W} ${H}" class="w-full h-auto" role="img" aria-label="학년도별 합격선 추세">${grid}${changes}${lines}${xLabels}</svg>`;
}

function barChartSVG(points) {
    const H = 170;
    const groups = [
        { key: 'regionApplicants', label: '관내 지원', color: '#64748b' },
        { key: 'regionAccepted', label: '관내 합격', color: '#34d399' },
        { key: 'ourApplicants', label: '우리 학교 지원', color: '#475569' },
        { key: 'ourAccepted', label: '우리 학교 합격', color: '#38bdf8' }
    ];
    const max = Math.max(1, ...points.flatMap(p => groups.map(g => Number(p[g.key]) || 0)));
    const n = points.length;
    const inner = W - PAD.left - PAD.right;
    const slot = inner / Math.max(1, n);
    const barW = Math.min(18, (slot * 0.8) / groups.length);
    const base = H - PAD.bottom;
    const scale = v => ((base - PAD.top) * v) / max;
    const bars = points.map((p, i) => {
        const cx = PAD.left + slot * (i + 0.5);
        const start = cx - (barW * groups.length) / 2;
        const rects = groups.map((g, k) => {
            const v = Number(p[g.key]) || 0;
            const h = scale(v);
            const x = start + k * barW;
            return `<rect x="${x}" y="${base - h}" width="${barW - 2}" height="${h}" fill="${g.color}" rx="2"><title>${p.admissionYear} 고입 ${g.label} ${v}명</title></rect>
                ${v > 0 ? `<text x="${x + (barW - 2) / 2}" y="${base - h - 3}" text-anchor="middle" font-size="9" fill="#cbd5e1">${v}</text>` : ''}`;
        }).join('');
        return `${rects}<text x="${cx}" y="${H - 12}" text-anchor="middle" font-size="11" fill="#cbd5e1">${p.admissionYear}</text>`;
    }).join('');
    const legend = groups.map((g, k) => `<rect x="${PAD.left + k * 120}" y="2" width="10" height="10" fill="${g.color}" rx="2"/><text x="${PAD.left + k * 120 + 14}" y="11" font-size="10" fill="#cbd5e1">${g.label}</text>`).join('');
    return `<svg viewBox="0 0 ${W} ${H}" class="w-full h-auto" role="img" aria-label="학년도별 지원·합격 인원">${legend}<line x1="${PAD.left}" x2="${W - PAD.right}" y1="${base}" y2="${base}" stroke="#475569"/>${bars}</svg>`;
}

function legendHTML() {
    return SERIES.map(s => `<span class="inline-flex items-center gap-1"><svg width="22" height="8"><line x1="0" x2="22" y1="4" y2="4" stroke="${s.color}" stroke-width="2.5" ${s.dash ? `stroke-dasharray="${s.dash}"` : ''}/></svg>${s.label}</span>`).join('')
        + '<span class="inline-flex items-center gap-1"><svg width="14" height="12"><line x1="7" x2="7" y1="0" y2="12" stroke="#f472b6" stroke-width="1.5" stroke-dasharray="3 3"/></svg>산출식(만점·요강) 변경</span>';
}

function render(container, points, ctx) {
    const fallbackMax = totalMaxFor(ctx.school, ctx.track);
    const changed = points.filter(p => p.formulaChanged).map(p => admissionLabel(p.admissionYear));
    const btn = (mode, text) => `<button type="button" data-trend-mode="${mode}" class="px-2.5 py-1 rounded-lg text-[11px] font-bold ${viewMode === mode ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-700'}">${text}</button>`;
    container.innerHTML = `
        <div class="p-5 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
                <h4 class="text-sm font-bold text-white">📈 학년도 추세 · ${escapeHtml(ctx.school)} ${ctx.dept ? escapeHtml(ctx.dept) : '(학교 전체)'} · ${escapeHtml(ctx.track)}</h4>
                <span class="inline-flex gap-0.5 rounded-lg border border-slate-600 bg-slate-900/70 p-0.5">${btn('score', '점수')}${btn('pct', '만점 대비 %')}</span>
            </div>
            <div class="flex flex-wrap gap-3 text-[11px] text-slate-300">${legendHTML()}</div>
            ${lineChartSVG(points, fallbackMax)}
            ${changed.length ? `<p class="text-[11px] text-pink-300">⚠ ${changed.join(', ')}에 산출식(만점 또는 요강)이 바뀌었습니다. 그 앞뒤 해 점수는 "만점 대비 %"로 비교하세요.</p>` : ''}
            ${barChartSVG(points)}
            <p class="text-[10px] text-slate-500">관내 = 관내 공유 파일로 취합한 참여 학교 자료(비참여 학교 지원자는 빠져 있어 실제 합격선보다 높게 나올 수 있음) · 우리 학교 = 학교 원서 기록과 지난 학년도 인수인계 기록</p>
        </div>`;
    container.querySelectorAll('[data-trend-mode]').forEach(b => b.addEventListener('click', () => {
        viewMode = b.dataset.trendMode;
        render(container, points, ctx);
    }));
}

/** 추세 그래프를 container에 그린다. school이 후기 일반고면 안내만 보인다. */
export async function renderTrendChart(container, { school, dept, track, isGeneral }) {
    if (!container) return;
    if (isGeneral) {
        container.innerHTML = '';
        return;
    }
    container.innerHTML = '<div class="py-6 text-center text-xs text-slate-500"><span class="spinner"></span> 학년도 추세를 불러오는 중...</div>';
    let points = [];
    try {
        points = (await window.go.main.App.GetAdmissionTrend(school, dept, track)) || [];
    } catch (err) {
        container.innerHTML = `<p class="text-xs text-rose-300">추세를 불러오지 못했습니다: ${escapeHtml(String(err))}</p>`;
        return;
    }
    if (points.length === 0) {
        container.innerHTML = '<p class="text-xs text-slate-500 py-3">이 학교·학과·전형의 여러 해 자료가 아직 없습니다.</p>';
        return;
    }
    render(container, points, { school, dept, track });
}
