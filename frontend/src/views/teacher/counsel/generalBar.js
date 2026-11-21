// 후기 일반고 학교 안 위치 막대(0~100%): 커트라인 구간과 내 위치.
// "내 위치" 글자는 막대 위, 커트라인·0%·100% 글자는 막대 아래에 두고, 글자끼리 겹치면 끝 글자(0%·100%)를 숨긴다.

const fmt = (value, digits) => Number(value || 0).toFixed(digits);

// 막대 위·아래 글자의 위치와 정렬을 정한다(화면 없이 시험할 수 있도록 따로 둔다).
// align: 'start'는 왼쪽 끝 맞춤, 'end'는 오른쪽 끝 맞춤, 'center'는 가운데.
export function barLabelLayout(pct, safePct, borderPct) {
    const at = Math.min(100, Math.max(0, Number(pct) || 0));
    const edge = (x) => (x <= 12 ? 'start' : x >= 88 ? 'end' : 'center');
    const cut = (Number(safePct) + Number(borderPct)) / 2;
    return {
        at,
        meAlign: edge(at),
        cut,
        cutAlign: edge(cut),
        // 커트라인 글자(가운데에서 좌우 약 9%)가 끝 글자(약 5%)와 겹치면 끝 글자를 숨긴다.
        showStart: cut > 14,
        showEnd: cut < 86,
    };
}

export function percentBar(pct, s) {
    if (!(pct > 0)) return '';
    const L = barLabelLayout(pct, s.generalSafePct, s.generalBorderPct);
    const width = Math.max(1, s.generalBorderPct - s.generalSafePct);
    return `<div class="cg-bar" role="img" aria-label="우리 학교 안 위치 상위 ${fmt(pct, 2)}%, 커트라인 약 ${s.generalSafePct}~${s.generalBorderPct}%">
        <div class="cg-bar-top"><span class="cg-bar-me cg-al-${L.meAlign}" style="left:${L.at}%">내 위치 ${fmt(pct, 1)}%</span></div>
        <div class="cg-bar-track"><span class="cg-bar-band" style="left:${s.generalSafePct}%;width:${width}%"></span><span class="cg-bar-dot" style="left:${L.at}%"></span></div>
        <div class="cg-bar-labels">${L.showStart ? '<span class="cg-bar-end cg-al-start" style="left:0">0%</span>' : ''}<span class="cg-bar-cut cg-al-${L.cutAlign}" style="left:${L.cut}%">커트라인 약 ${s.generalSafePct}~${s.generalBorderPct}%</span>${L.showEnd ? '<span class="cg-bar-end cg-al-end" style="left:100%">100%</span>' : ''}</div>
    </div>`;
}
