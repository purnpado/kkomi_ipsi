// 판정 기준 창의 미리보기(입력값으로 바로 계산, 저장 전). 실제 판정은 core/admissionJudgment.js 의 marginFor 가 한다.
// 여기서는 같은 규칙(예외 → 학교 기본, 비율이면 만점 × %)으로 "이 입력이면 몇 점 여유폭인지"만 보여 준다.

const fmt = (v) => (Math.round(v * 10) / 10).toFixed(1);

/** base: { mode, ratio, points }, override: { mode, value } | null */
export function effectiveMargin(base, override, totalMax) {
    let mode = base.mode === 'points' ? 'points' : 'ratio';
    let value = mode === 'ratio' ? Number(base.ratio) : Number(base.points);
    const isOverride = !!(override && (override.mode === 'ratio' || override.mode === 'points') && Number.isFinite(Number(override.value)));
    if (isOverride) { mode = override.mode; value = Number(override.value); }
    const max = Number(totalMax) || 0;
    const points = mode === 'ratio' ? (max > 0 ? max * value / 100 : Number(base.points)) : value;
    return { mode, value, points: Number.isFinite(points) ? points : 0, isOverride };
}

export function marginChip(m) {
    const how = m.mode === 'ratio' ? `만점의 ${m.value}%` : `${m.value}점`;
    return `<span class="cg-chip ${m.isOverride ? 'cg-chip--info' : ''}"><b>${fmt(m.points)}점</b> · ${how}${m.isOverride ? ' · 예외' : ''}</span>`;
}

/** 판정 4단계 설명 카드(식 뱃지) */
export function legendHTML() {
    const card = (tone, label, formula, note = '') => `<div class="jg-card jg-card--${tone}"><span class="jg-card-name">${label}</span><span class="jg-formula">${formula}</span>${note ? `<small>${note}</small>` : ''}</div>`;
    return `<div class="jg-legend">
        ${card('safe', '🟢 안정', '<span class="cg-chip">기준선</span> + <span class="cg-chip">여유폭</span> 이상', '불합격 최고점보다 높아도 안정')}
        ${card('proper', '🔵 적정', '<span class="cg-chip">기준선</span> 이상', '동점 포함')}
        ${card('hope', '🟠 소신', '<span class="cg-chip">기준선</span> − <span class="cg-chip">여유폭</span> 이상')}
        ${card('challenge', '🔴 어려움', '그 미만')}
    </div>`;
}

/** 후기 일반고 석차백분율 구간 막대(0~100%, 작을수록 좋음). 구간 이름은 좁은 구간에 들어가지 않으므로 아래 뱃지로 둔다. */
export function generalZonesHTML(safe, border) {
    const s = Math.min(100, Math.max(0, Number(safe) || 0));
    const b = Math.min(100, Math.max(s, Number(border) || 0));
    const seg = (cls, from, to) => (to - from > 0 ? `<span class="jg-zone ${cls}" style="width:${to - from}%"></span>` : '');
    const close = b - s < 8; // 두 눈금 글자가 붙으면 안정선은 왼쪽, 경계선은 오른쪽으로 비켜 쓴다
    return `<div class="jg-zones" role="img" aria-label="석차백분율 상위 ${s}%까지 안정, ${b}%까지 경계, 그 뒤 주의">
        <div class="jg-zone-track">${seg('jg-zone--safe', 0, s)}${seg('jg-zone--hope', s, b)}${seg('jg-zone--bad', b, 100)}</div>
        <div class="jg-zone-ticks"><span class="jg-al-start" style="left:0">0%</span><span class="${close ? 'jg-al-end' : ''}" style="left:${s}%">${s}%</span>${b > s ? `<span class="${close ? 'jg-al-start' : ''}" style="left:${b}%">${b}%</span>` : ''}<span class="jg-al-end" style="left:100%">100%</span></div>
        <div class="cg-chips"><span class="cg-chip cg-chip--ok">🟢 안정 · 상위 <b>${s}%</b>까지</span><span class="cg-chip cg-chip--warn">🟡 경계 · <b>${s}~${b}%</b></span><span class="cg-chip cg-chip--bad">🔴 주의 · <b>${b}%</b> 뒤</span></div>
    </div>`;
}
