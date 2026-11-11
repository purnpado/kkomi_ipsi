import { judgmentZones, totalMaxFor } from '../../core/admissionJudgment.js';

const describeMarginText = m => (m.mode === 'ratio' ? `만점의 ${m.value}%(${m.points.toFixed(2)}점)` : `${m.value}점`);
/**
 * 정밀 통계 지표 및 히스토그램 대시보드 렌더링
 */
export function renderStatsDashboard(container, stats, sourceMode) {
    const isSpecialized = stats.highSchool.includes('마이스터') || stats.highSchool.includes('공업') || stats.highSchool.includes('상업') || stats.highSchool.includes('생활과학') || stats.highSchool.includes('애니원');
    const isInterview = stats.highSchool.includes('애니원') || stats.track.includes('특별');

    // 4단계 판정 기준선 계산 (설계서 7절)
    // 안정: 불합격 최고점보다 높음 (불합격자 없으면 Q3 이상)
    // 적정: 합격자 하위 25%(Q1) 이상 ~ 불합격 최고점 이하
    // 소신: 합격 최저점 이상 ~ 합격자 하위 25%(Q1) 미만
    // 도전: 합격 최저점 미만
    // 4단계 구간: core/admissionJudgment.js 단일 기준(기준선 = 합격 최저점, 학교 설정 여유폭)
    const zones = judgmentZones({
        cutoff: stats.acceptedMin, totalMax: totalMaxFor(stats.highSchool, stats.track),
        schoolName: stats.highSchool, track: stats.track, maxRejected: stats.rejectedCount > 0 ? stats.rejectedMax : 0
    });
    const safeCutoff = zones ? zones.safeFrom : 0;
    const properCutoff = zones ? zones.properFrom : 0;
    const challengeCutoff = zones ? zones.hopeFrom : 0;

    const stdDevEmphasis = stats.acceptedCount >= 10
        ? `<span class="text-emerald-300 font-bold">${stats.acceptedStdDev.toFixed(2)}</span>`
        : `<span class="text-slate-400">${stats.acceptedStdDev.toFixed(2)} <span class="text-[10px]">(n < 10 참조용)</span></span>`;

    container.innerHTML = `
        <!-- 1. 핵심 지표 카드 4종 -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            <!-- 지원 및 합격 현황 -->
            <div class="p-4 rounded-xl bg-slate-800/50 border border-slate-700/60 space-y-1">
                <span class="text-[11px] font-semibold text-slate-400">지원 / 합격 현황</span>
                <div class="flex items-baseline gap-2">
                    <span class="text-2xl font-black text-white">${stats.acceptedCount}</span>
                    <span class="text-xs text-slate-400">/ 총 ${stats.totalApplicants}명 지원</span>
                </div>
                <div class="text-[11px] text-slate-400 flex items-center gap-1.5 pt-1 border-t border-slate-700/40">
                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                    <span>불합격 ${stats.rejectedCount}명${stats.stage2FailCount ? ` (1차 합격 후 ${stats.stage2FailCount}명)` : ''}</span>
                    ${stats.stage1PassMin ? `<span class="text-slate-600">·</span><span class="text-amber-300" title="1차 합격자 최저점(관내 통합 시 전체 학교 기준)">1차 합격선 ${Number(stats.stage1PassMin).toFixed(2)}</span>` : ''}
                    <span class="text-slate-600">·</span>
                    <span class="text-indigo-300 font-medium">${sourceMode === 'consolidated' ? `관내 ${stats.totalParticipatingSchool}개교` : '우리 학교'}</span>
                    ${stats.smallSample ? '<span class="text-amber-300" title="합격 또는 불합격 표본이 3명 미만입니다">· 표본 부족(참고)</span>' : ''}
                </div>
            </div>

            <!-- 합격 최저선 및 중앙값 -->
            <div class="p-4 rounded-xl bg-slate-800/50 border border-slate-700/60 space-y-1">
                <span class="text-[11px] font-semibold text-slate-400">합격 최저점 / 중앙값 (Median)</span>
                <div class="flex items-baseline gap-2">
                    <span class="text-2xl font-black text-emerald-400 font-mono">${stats.acceptedMin.toFixed(2)}</span>
                    <span class="text-xs text-indigo-300 font-mono">중앙 ${stats.acceptedMedian.toFixed(2)}</span>
                </div>
                <div class="text-[11px] text-slate-400 pt-1 border-t border-slate-700/40 font-mono">
                    합격자 평균: <strong class="text-white">${stats.acceptedAvg.toFixed(2)}점</strong>
                </div>
            </div>

            <!-- 사분위수 구간 (Q1 ~ Q3) -->
            <div class="p-4 rounded-xl bg-slate-800/50 border border-slate-700/60 space-y-1">
                <span class="text-[11px] font-semibold text-slate-400">사분위수 (Q1 ~ Q3 구간)</span>
                <div class="flex items-baseline gap-1.5">
                    <span class="text-lg font-black text-amber-300 font-mono">${stats.acceptedQ1.toFixed(2)}</span>
                    <span class="text-xs text-slate-500">~</span>
                    <span class="text-lg font-black text-indigo-300 font-mono">${stats.acceptedQ3.toFixed(2)}</span>
                </div>
                <div class="text-[11px] text-slate-400 pt-1 border-t border-slate-700/40">
                    표본 표준편차(s): ${stdDevEmphasis}
                </div>
            </div>

            <!-- 합·불 겹침 구간 (Overlap) -->
            <div class="p-4 rounded-xl ${stats.hasOverlap ? 'bg-amber-950/20 border-amber-500/40' : 'bg-slate-800/50 border-slate-700/60'} space-y-1">
                <span class="text-[11px] font-semibold ${stats.hasOverlap ? 'text-amber-300' : 'text-slate-400'}">합·불 경합 겹침구간</span>
                <div class="flex items-baseline gap-1.5 font-mono">
                    ${stats.hasOverlap ? `
                        <span class="text-lg font-black text-amber-300">${stats.overlapMin.toFixed(2)}</span>
                        <span class="text-xs text-amber-400/80">~</span>
                        <span class="text-lg font-black text-amber-300">${stats.overlapMax.toFixed(2)}</span>
                    ` : `
                        <span class="text-sm font-bold text-slate-400">겹침 구간 없음</span>
                    `}
                </div>
                <div class="text-[11px] ${stats.hasOverlap ? 'text-amber-300/80' : 'text-slate-400'} pt-1 border-t border-slate-700/40">
                    ${stats.hasOverlap ? `⚠️ 불합격 최고점이 합격선 상회` : `불합격 최고: ${stats.rejectedMax > 0 ? stats.rejectedMax.toFixed(2) + '점' : '-'}`}
                </div>
            </div>
        </div>

        <!-- 2. 입시 지도용 4단계 판정 구간 가이드 배너 -->
        <div class="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-3">
            <div class="flex items-center justify-between">
                <h4 class="text-xs font-bold text-white flex items-center gap-2">
                    <span>🧭</span> 진학 지도 4단계 판정 기준표
                    <span class="text-[11px] font-normal text-slate-400">
                        (${sourceMode === 'consolidated' ? `관내 ${stats.totalParticipatingSchool}개교 통합` : '우리 학교'} ${stats.totalApplicants}명 기준)
                    </span>
                </h4>
                ${isInterview ? `
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        ⚠️ 면접·실기 반영 (점수만으로 판단 주의)
                    </span>
                ` : ''}
            </div>

            <div class="grid grid-cols-2 md:grid-cols-4 gap-2.5 text-xs">
                <!-- 안정 -->
                <div class="p-3 rounded-lg bg-emerald-950/40 border border-emerald-500/30 space-y-1">
                    <div class="flex items-center justify-between font-bold text-emerald-300">
                        <span>🟢 안정권</span>
                        <span class="font-mono">${safeCutoff > 0 ? `${safeCutoff.toFixed(2)}점 ~` : '-'}</span>
                    </div>
                    <p class="text-[11px] text-slate-300">합격 최저점 + ${zones ? describeMarginText(zones.margin) : '여유폭'} 이상 또는 불합격 최고점 초과</p>
                </div>

                <!-- 적정 -->
                <div class="p-3 rounded-lg bg-indigo-950/40 border border-indigo-500/30 space-y-1">
                    <div class="flex items-center justify-between font-bold text-indigo-300">
                        <span>🟡 적정권</span>
                        <span class="font-mono">${properCutoff > 0 ? `${properCutoff.toFixed(2)}점 ~` : '-'}</span>
                    </div>
                    <p class="text-[11px] text-slate-300">합격 최저점 이상(동점 포함)</p>
                </div>

                <!-- 소신 -->
                <div class="p-3 rounded-lg bg-amber-950/40 border border-amber-500/30 space-y-1">
                    <div class="flex items-center justify-between font-bold text-amber-300">
                        <span>🟠 소신권</span>
                        <span class="font-mono">${challengeCutoff > 0 ? `${challengeCutoff.toFixed(2)}점 ~` : '-'}</span>
                    </div>
                    <p class="text-[11px] text-slate-300">합격 최저점 − 여유폭 ~ 합격 최저점 미만</p>
                </div>

                <!-- 도전 -->
                <div class="p-3 rounded-lg bg-rose-950/40 border border-rose-500/30 space-y-1">
                    <div class="flex items-center justify-between font-bold text-rose-300">
                        <span>🔴 도전권</span>
                        <span class="font-mono">${challengeCutoff > 0 ? `<${challengeCutoff.toFixed(2)}점` : '-'}</span>
                    </div>
                    <p class="text-[11px] text-slate-300">소신 구간 미만</p>
                </div>
            </div>
        </div>

        <!-- 3. 점수 구간별 합격·불합격 분포 히스토그램 (CSS/SVG 기반 고속 렌더링) -->
        <div class="p-5 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-4">
            <div class="flex items-center justify-between flex-wrap gap-2">
                <div>
                    <h4 class="text-sm font-bold text-white flex items-center gap-2">
                        <span>📊</span> 점수 구간별 합격·불합격 분포 히스토그램
                    </h4>
                    <p class="text-xs text-slate-400 mt-0.5">구간별 합격(초록) 및 불합격(빨강) 인원 분포 (막대에 마우스를 올리면 상세 인원 표시)</p>
                </div>
                <div class="flex items-center gap-4 text-xs">
                    <div class="flex items-center gap-1.5">
                        <span class="w-3 h-3 rounded bg-emerald-500"></span>
                        <span class="text-slate-300">합격</span>
                    </div>
                    <div class="flex items-center gap-1.5">
                        <span class="w-3 h-3 rounded bg-rose-500"></span>
                        <span class="text-slate-300">불합격</span>
                    </div>
                    ${stats.hasOverlap ? `
                        <div class="flex items-center gap-1.5">
                            <span class="w-3 h-3 rounded border border-amber-400 bg-amber-400/20"></span>
                            <span class="text-amber-300 font-semibold">경합 겹침구간</span>
                        </div>
                    ` : ''}
                </div>
            </div>

            <!-- 히스토그램 막대 렌더링 영역 -->
            <div class="pt-4">
                ${renderHistogramChart(stats.histogram, stats.overlapMin, stats.overlapMax, stats.hasOverlap)}
            </div>
        </div>
    `;
}

/**
 * CSS Flex 기반 점수 히스토그램 차트 렌더링
 */
function renderHistogramChart(histogram, overlapMin, overlapMax, hasOverlap) {
    if (!histogram || !histogram.buckets || histogram.buckets.length === 0) {
        return `
            <div class="py-12 text-center text-xs text-slate-500">
                표시할 점수 구간 데이터가 없습니다.
            </div>
        `;
    }

    const buckets = histogram.buckets;
    let maxBucketCount = 1;
    buckets.forEach(b => {
        const sum = (b.acceptedCount || 0) + (b.rejectedCount || 0);
        if (sum > maxBucketCount) maxBucketCount = sum;
    });

    return `
        <div class="flex items-end gap-1.5 h-48 w-full border-b border-slate-700 pb-2 px-1">
            ${buckets.map(b => {
                const acc = b.acceptedCount || 0;
                const rej = b.rejectedCount || 0;
                const total = acc + rej;
                const heightPct = Math.max(8, Math.round((total / maxBucketCount) * 100));

                const isOverlapBucket = hasOverlap && (
                    (b.minScore >= overlapMin && b.minScore <= overlapMax) ||
                    (b.maxScore >= overlapMin && b.maxScore <= overlapMax)
                );

                const accRatio = total > 0 ? (acc / total) * 100 : 0;
                const rejRatio = total > 0 ? (rej / total) * 100 : 0;

                const tooltip = `[${b.minScore.toFixed(1)}점 ~ ${b.maxScore.toFixed(1)}점]\n합격: ${acc}명\n불합격: ${rej}명\n총 ${total}명${isOverlapBucket ? '\n⚠️ 합·불 경합구간' : ''}`;

                return `
                    <div class="flex-1 flex flex-col items-center justify-end h-full group relative cursor-pointer" title="${tooltip}">
                        <!-- 수치 라벨 (호버 시 표시) -->
                        <span class="text-[10px] font-mono font-bold text-slate-300 mb-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            ${total}명
                        </span>

                        <!-- 막대 바 -->
                        <div class="w-full rounded-t flex flex-col overflow-hidden transition-all duration-300 group-hover:brightness-125 ${isOverlapBucket ? 'ring-2 ring-amber-400' : ''}" style="height: ${heightPct}%;">
                            <!-- 불합격 (상단 빨강) -->
                            ${rej > 0 ? `
                                <div class="bg-rose-500 transition-all" style="height: ${rejRatio}%;"></div>
                            ` : ''}
                            <!-- 합격 (하단 초록) -->
                            ${acc > 0 ? `
                                <div class="bg-emerald-500 transition-all" style="height: ${accRatio}%;"></div>
                            ` : ''}
                        </div>

                        <!-- X축 점수 구간 라벨 -->
                        <div class="text-[9px] text-slate-400 font-mono mt-1.5 truncate max-w-full text-center">
                            ${b.minScore.toFixed(0)}
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
        <div class="flex justify-between items-center text-[10px] text-slate-500 font-mono mt-2 px-1">
            <span>최저 ${buckets[0].minScore.toFixed(1)}점</span>
            <span>점수 구간 (1점 단위)</span>
            <span>최고 ${buckets[buckets.length - 1].maxScore.toFixed(1)}점</span>
        </div>
    `;
}
