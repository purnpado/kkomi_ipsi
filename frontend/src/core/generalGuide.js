// ===== 후기 일반고 석차백분율 안정선 헬퍼 =====
// 기준은 core/admissionJudgment.js 의 학교 판정 설정(학년부장 저장, 배포자료로 전달) 하나만 쓴다.
// 예전에 PC마다 따로 저장하던 값(localStorage)은 더 이상 판정에 쓰지 않는다.
import { getJudgmentSettings, judgeGeneralPercentile, judgmentToneClass } from './admissionJudgment.js';

export function getGeneralGuideCutoff() {
    return getJudgmentSettings().generalSafePct;
}

export function getGeneralGuideBorder() {
    return getJudgmentSettings().generalBorderPct;
}

export function getGeneralGuideBadge(percentile) {
    const result = judgeGeneralPercentile(percentile);
    const p = Number(percentile);
    const text = Number.isFinite(p) && p > 0 ? `${result.emoji} ${result.label} (${p.toFixed(2)}%)` : `${result.emoji} ${result.label}`;
    return `<span class="inline-flex items-center justify-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black border shadow-xs whitespace-nowrap ${judgmentToneClass(result)}" title="학교 내 석차백분율 기준 (안정 ≤${getGeneralGuideCutoff()}%, 경계 ≤${getGeneralGuideBorder()}%)">${text}</span>`;
}
