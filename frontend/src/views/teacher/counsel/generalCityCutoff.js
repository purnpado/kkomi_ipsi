// 상담 모달: 후기 일반고 관내 추정 합격선과 학생 판정
// 직전 학년도 관내 공유 결과(기본 지표 잣대)와 학생의 기본 지표~상한(가산점 포함) 범위를 비교한다.
import { currentAdmissionYear, admissionLabel } from '../../../core/admissionYear.js';
import { judgeRange, judgmentBadge, describeDiff } from '../../../core/admissionJudgment.js';

export async function fillGeneralCityCutoff(ctx) {
    const holder = ctx.modalEl.querySelector('#generalCityCutoff');
    if (!holder) return;
    const d = ctx.data;
    const base = Number(d.generalHSBaseScore || 0);
    if (!(base > 0)) {
        holder.textContent = '';
        return;
    }
    const year = currentAdmissionYear() - 1;
    let result = null;
    try {
        result = await window.go?.main?.App?.GetConsolidatedGeneralCutoff?.(year);
    } catch (_) {
        result = null;
    }
    const e = result?.base;
    if (!e || !(e.acceptedMin > 0)) {
        holder.innerHTML = `<span class="text-slate-500">관내 추정 합격선: ${admissionLabel(year)} 공유 자료 없음</span>`;
        return;
    }
    const judged = judgeRange({
        low: base, high: Number(d.generalHSTotalHigh || base), cutoff: e.acceptedMin, maxRejected: e.rejectedMax,
        totalMax: 200, schoolName: '후기 일반고', track: '후기 일반계고',
        source: `${admissionLabel(year)} 관내 ${result.participatingSchool}개교 배정 최저(기본 지표)`
    });
    holder.innerHTML = `${judgmentBadge(judged, { compact: true })} <span class="text-slate-400">관내 추정선 ${e.acceptedMin.toFixed(2)}점 대비 ${describeDiff(judged)}${e.smallSample ? ' · 표본 부족(참고)' : ''}</span>`;
}
