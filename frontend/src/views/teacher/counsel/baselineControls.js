// 상담 모달: 커트라인 기준 탭·학과 선택 연결
export function bindBaselineControls(ctx) {
    let currentBaselineMode = 'last';

    // 기준선 탭 전환 함수 (직전 1개년 / 최근 3년 평균 / 최근 5년 평균)
    const applyBaselineMode = (mode) => {
        currentBaselineMode = mode;
        ctx.modalEl.querySelectorAll('.cutoff-tab-btn').forEach(btn => {
            const isActive = btn.dataset.mode === mode;
            btn.classList.toggle('active', isActive);
            btn.classList.toggle('bg-primary', isActive);
            btn.classList.toggle('text-white', isActive);
            btn.classList.toggle('text-slate-400', !isActive);
        });

        const descEl = document.getElementById('cutoffBaselineDesc');
        if (descEl) {
            if (mode === 'last') {
                descEl.innerHTML = '🎯 <strong>직전 1개년(작년)</strong> 커트라인 및 공식 발표자료를 기준으로 합격 가능성을 판정합니다.';
            } else if (mode === 'avg3') {
                descEl.innerHTML = '📊 <strong>최근 3개년 누적 평균선</strong>을 기준으로 합격 가능성을 판정합니다 (단년도 변동 완화).';
            } else if (mode === 'avg5') {
                descEl.innerHTML = '📈 <strong>최근 5개년 장기 평균선</strong>을 기준으로 합격 가능성을 판정합니다 (중장기 추세).';
            }
        }

        ctx.modalEl.querySelectorAll('.school-counsel-card').forEach(card => {
            const rIdx = card.id.replace('card_', '');
            const score = parseFloat(card.dataset.score);
            const totalMax = parseFloat(card.dataset.max);
            let cutoffVal = 0;
            let avgVal = 0;
            let labelText = '';

            if (mode === 'last') {
                const deptSel = card.querySelector('.dept-selector');
                if (deptSel) {
                    cutoffVal = parseFloat(deptSel.value) || 0;
                    avgVal = parseFloat(deptSel.selectedOptions[0]?.dataset.avg || 0);
                    labelText = '직전년도 최저';
                } else {
                    cutoffVal = parseFloat(card.dataset.lastCutoff) || 0;
                    avgVal = parseFloat(card.dataset.lastAvg) || 0;
                    labelText = '직전년도 최저';
                }
            } else if (mode === 'avg3') {
                cutoffVal = parseFloat(card.dataset.avg3Cutoff) || 0;
                labelText = '최근 3년 평균';
            } else if (mode === 'avg5') {
                cutoffVal = parseFloat(card.dataset.avg5Cutoff) || 0;
                labelText = '최근 5년 평균';
            }

            let badge = '';
            let color = 'bg-primary';
            let pct = (score / totalMax) * 100;

            if (cutoffVal && cutoffVal > 0) {
                if (score >= cutoffVal + 5) {
                    badge = '<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-success/20 text-success border border-success/30">🟢 안정권</span>';
                    color = 'bg-success';
                } else if (score >= cutoffVal) {
                    badge = '<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-warning/20 text-warning border border-warning/30">🟡 적정/경계</span>';
                    color = 'bg-warning';
                } else {
                    badge = '<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-danger/20 text-danger border border-danger/30">🔴 소신/주의</span>';
                    color = 'bg-danger';
                }
            } else {
                badge = `<span class="text-xs text-text-muted">만점의 ${pct.toFixed(1)}% (기준 부족)</span>`;
            }

            const badgeEl = document.getElementById(`badge_${rIdx}`);
            if (badgeEl) badgeEl.innerHTML = badge;

            const gaugeEl = document.getElementById(`gauge_${rIdx}`);
            if (gaugeEl) {
                gaugeEl.className = `gauge-fill ${color} h-2.5 rounded-full transition-all duration-500`;
                gaugeEl.style.width = `${Math.min(100, Math.max(5, pct))}%`;
            }

            const diffEl = document.getElementById(`diff_${rIdx}`);
            if (diffEl) {
                if (cutoffVal && cutoffVal > 0) {
                    const diff = score - cutoffVal;
                    diffEl.innerHTML = `
                        <span>합격 기준선(${labelText}): <strong class="text-slate-200">${cutoffVal.toFixed(1)}점</strong> ${avgVal > 0 ? `<span class="text-amber-300 font-medium">(평균 ${avgVal.toFixed(1)}점)</span>` : ''}</span>
                        <span>점수차: <strong class="${diff >= 0 ? 'text-success' : 'text-danger'}">${diff >= 0 ? '+' : ''}${diff.toFixed(2)}점</strong></span>
                    `;
                } else {
                    diffEl.innerHTML = `<span class="text-slate-500">※ 해당 기준(${labelText})의 누적 합격선 데이터가 부족합니다.</span>`;
                }
            }
        });
    };

    ctx.modalEl.querySelectorAll('.cutoff-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            applyBaselineMode(btn.dataset.mode);
        });
    });

    // 학과별 커트라인 선택 변경 이벤트 바인딩
    ctx.modalEl.querySelectorAll('.dept-selector').forEach(sel => {
        sel.addEventListener('change', () => {
            if (currentBaselineMode !== 'last') {
                applyBaselineMode('last');
            } else {
                applyBaselineMode('last');
            }
        });
    });
}
