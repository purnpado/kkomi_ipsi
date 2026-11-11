import { judgeScore, judgmentBadge, describeDiff, describeMargin, judgmentModeToggleHTML, bindJudgmentModeToggle } from '../../../core/admissionJudgment.js';
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

            // 4단계 판정: core/admissionJudgment.js 단일 기준(학교 설정 여유폭)
            const pct = (score / totalMax) * 100;
            const result = judgeScore({ score, cutoff: cutoffVal, totalMax, schoolName: card.dataset.school, track: card.dataset.track, source: labelText });
            const color = { safe: 'bg-emerald-500', proper: 'bg-indigo-500', hope: 'bg-amber-500', challenge: 'bg-rose-500' }[result.level] || 'bg-primary';
            const badge = result.level === 'unknown'
                ? `<span class="text-xs text-text-muted">만점의 ${pct.toFixed(1)}% (기준 부족)</span>`
                : `${judgmentBadge(result)} <span class="text-[10px] text-slate-400">${describeDiff(result)} · ${describeMargin(result)}</span>`;

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
                        <span>점수차: <strong class="${diff >= 0 ? 'text-success' : 'text-danger'}">${diff >= 0 ? '+' : ''}${diff.toFixed(2)}점</strong> <span class="text-slate-500">(만점의 ${(diff / totalMax * 100).toFixed(1)}%)</span></span>
                    `;
                } else {
                    diffEl.innerHTML = `<span class="text-slate-500">※ 해당 기준(${labelText})의 누적 합격선 데이터가 부족합니다.</span>`;
                }
            }
        });
    };

    // 판정 보기 방식(학교 설정/비율/점수) 전환: 현재 기준선 탭으로 다시 판정한다.
    const bindToggle = () => {
        const holder = ctx.modalEl.querySelector('#counselJudgmentToggle');
        bindJudgmentModeToggle(holder, () => {
            holder.innerHTML = judgmentModeToggleHTML();
            bindToggle();
            applyBaselineMode(currentBaselineMode);
        });
    };
    bindToggle();

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
