// 상담 모달: 후기 일반고 관내 추정 합격선과 학생 판정
// 직전 학년도 관내 공유 결과(기본 지표 잣대)와 학생의 기본 지표~상한(가산점 포함) 범위를 비교한다.
import { currentAdmissionYear, admissionLabel } from '../../../core/admissionYear.js';
import { judgeRange, judgmentBadge, describeDiff } from '../../../core/admissionJudgment.js';

const LABEL = '<span class="cg-fact-label">관내 합격선</span>';

export async function fillGeneralCityCutoff(ctx) {
    const holder = ctx.modalEl.querySelector('#generalCityCutoff');
    if (!holder) return;
    const d = ctx.data;
    const base = Number(d.generalHSBaseScore || 0);
    if (!(base > 0)) {
        holder.textContent = '';
        holder.hidden = true;
        return;
    }
    const year = currentAdmissionYear() - 1;
    let result = null;
    let failed = false;
    try {
        result = await window.go?.main?.App?.GetConsolidatedGeneralCutoff?.(year);
    } catch (_) {
        failed = true;
    }
    if (failed || !result) {
        holder.innerHTML = `${LABEL}<span>자료를 불러오지 못했습니다. 다시 확인해 주세요.</span>`;
        return;
    }
    const e = result?.base;
    if (!e || !(e.acceptedMin > 0)) {
        holder.innerHTML = `${LABEL}<span class="cg-chip">${admissionLabel(year)} 공유 자료 없음</span><span class="cg-fact-sub">위 구간은 학교 안 석차 기준입니다.</span>`;
        return;
    }
    const judged = judgeRange({
        low: base, high: Number(d.generalHSTotalHigh || base), cutoff: e.acceptedMin, maxRejected: e.rejectedMax,
        totalMax: 200, schoolName: '후기 일반고', track: '후기 일반계고',
        source: `${admissionLabel(year)} 관내 ${result.participatingSchool}개교 배정 최저(기본 지표)`
    });
    holder.innerHTML = `${LABEL}${judgmentBadge(judged, { compact: true })}<span>관내 추정선 <b>${e.acceptedMin.toFixed(2)}점</b> 대비 ${describeDiff(judged)}</span>${e.smallSample ? '<span class="cg-chip cg-chip--warn">표본 부족(참고)</span>' : ''}`;
}

// 작년 우리 학교 결과 한 줄: 지난 학년도 후기 일반고 합격 학생의 교과 석차백분율이 어디까지였는지(지난 입시 기록).
export async function fillGeneralLastYear(ctx) {
    const holder = ctx.modalEl.querySelector('#generalLastYear');
    if (!holder) return;
    const r = await window.go?.main?.App?.GetGeneralLastYearResult?.().catch(() => null);
    if (!r || !(r.passed > 0 || r.failed > 0)) {
        holder.textContent = '';
        return;
    }
    const parts = [];
    if (r.passed > 0) parts.push(`<span class="cg-chip cg-chip--ok">합격 ${r.passed}명 · 상위 <b>${Number(r.maxPassedPct).toFixed(1)}%</b>까지</span>`);
    if (r.failed > 0) parts.push(`<span class="cg-chip cg-chip--bad">불합격 ${r.failed}명 · 가장 앞 <b>${Number(r.minFailedPct).toFixed(1)}%</b></span>`);
    holder.innerHTML = `<span class="cg-fact-label">작년 우리 학교</span>${parts.join('')}<span class="cg-fact-sub">${admissionLabel(r.admissionYear)} 후기 일반고 · 교과 석차백분율</span>`;
}
