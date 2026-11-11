import { escapeAttr } from '../../../core/utils.js';
import { admissionLabel } from '../../../core/admissionYear.js';

// 상담 모달: 고교별 산출 결과 카드 HTML 구성
export function buildSchoolResultCards(ctx) {
    // 학교별 합격 가능성 카드 목록 생성
    ctx.cardsHTML = '';

    ctx.data.schoolResults.forEach((r, rIdx) => {
        const isMeisterSchool = ['울산마이스터', '울산에너지', '현대공업'].some(kw => r.schoolName.includes(kw));
        const schoolCat = isMeisterSchool ? 'meister' : 'special';
        const isAlreadyWish = ctx.wishlist.some(w => ctx.isSameWishItem(w, r.schoolName, r.trackName));
        const officialForSchool = (ctx.officialItems || []).filter(item =>
            String(item.schoolName || '').includes(r.schoolName.substring(0, 4)) &&
            (!item.track || String(item.track).includes(r.trackName) || r.trackName.includes(String(item.track)))
        ).sort((a, b) => Number(b.admissionYear || 0) - Number(a.admissionYear || 0));
        const officialPrimary = officialForSchool.find(item => Number(item.minAcceptedScore || item.minValue || 0) > 0);
        // 해당 학교 및 전형의 학과별 커트라인 목록 찾기 (최신 연도 기준 학과별 1건씩 정돈)
        const rawDepts = (ctx.cutoffs || []).filter(c =>
            c.schoolName.includes(r.schoolName.substring(0, 4)) &&
            (c.track.includes(r.trackName) || r.trackName.includes(c.track)) &&
            c.department && c.department !== '공통' && c.minValue > 0
        ).sort((a, b) => b.year - a.year || a.department.localeCompare(b.department, 'ko'));

        // 학과별로 가장 최신 연도의 데이터만 1건씩 보존하여 드롭다운 중복 제거
        const deptMap = new Map();
        rawDepts.forEach(c => {
            const dNorm = ctx.normalizeDept(c.department);
            if (!deptMap.has(dNorm)) {
                deptMap.set(dNorm, c);
            }
        });
        const deptsForSchool = [...deptMap.values()].sort((a, b) => a.department.localeCompare(b.department, 'ko'));

        let defaultCutoff = null;
        let defaultAvg = null;
        const sameSchoolTrack = (c) =>
            c.schoolName.includes(r.schoolName.substring(0, 4)) &&
            (c.track.includes(r.trackName) || r.trackName.includes(c.track)) &&
            c.minValue > 0;

        // 연도별로 한 건만 표시한다. 학과 자료가 없던 해에는 "학교 전체" 값을
        // 우선 사용하므로, 원서대장에 학과가 없는 학교도 추세에 포함된다.
        const historyByYear = new Map();
        (ctx.cutoffs || []).filter(sameSchoolTrack).sort((a, b) => {
            const aWhole = !a.department || a.department === '공통' ? 0 : 1;
            const bWhole = !b.department || b.department === '공통' ? 0 : 1;
            return b.year - a.year || aWhole - bWhole;
        }).forEach(c => {
            if (!historyByYear.has(c.year)) historyByYear.set(c.year, c);
        });
        const cutoffHistory = [...historyByYear.values()].sort((a, b) => b.year - a.year).slice(0, 5);
        const averageMin = (count) => {
            const values = cutoffHistory.slice(0, count).map(c => c.minValue);
            return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
        };
        const recent3Average = averageMin(3);
        const recent5Average = averageMin(5);

        // 합격 기준선 우선순위:
        // 1순위: 교사가 수기 입력한 우리 학교 학과별 커트라인
        // 2순위: 교사가 수기 입력한 우리 학교 전체(공통) 커트라인
        // 3순위: 고교 공식 발표 입결 데이터 (학교 데이터가 없을 때 보완)
        if (deptsForSchool.length > 0) {
            defaultCutoff = deptsForSchool[0].minValue;
            defaultAvg = deptsForSchool[0].avgValue;
        } else {
            const found = (ctx.cutoffs || []).find(c => c.schoolName.includes(r.schoolName.substring(0, 4)) && c.track.includes(r.trackName) && c.minValue > 0);
            if (found) {
                defaultCutoff = found.minValue;
                defaultAvg = found.avgValue;
            } else if (officialPrimary) {
                defaultCutoff = Number(officialPrimary.minAcceptedScore || officialPrimary.minValue);
                defaultAvg = Number(officialPrimary.avgAcceptedScore || officialPrimary.avgValue || 0);
            }
        }

        // 합격 가능성 판단 헬퍼
        // 4단계 판정 구간 (안정 / 적정 / 소신 / 도전)
        const getCutoffBadgeAndGauge = (cutoffVal) => {
            let badge = '';
            let color = 'bg-primary';
            let pct = (r.totalScore / r.totalMax) * 100;
            if (cutoffVal && cutoffVal > 0) {
                const diff = r.totalScore - cutoffVal;
                const diffStr = diff >= 0 ? `+${diff.toFixed(2)}` : diff.toFixed(2);
                if (r.totalScore >= cutoffVal + 3) {
                    badge = `<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40" title="기준선: ${cutoffVal.toFixed(2)}점 (${diffStr}점) - 안정권">🟢 안정</span>`;
                    color = 'bg-emerald-500';
                } else if (r.totalScore >= cutoffVal) {
                    badge = `<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40" title="기준선: ${cutoffVal.toFixed(2)}점 (${diffStr}점) - 적정권">🟡 적정</span>`;
                    color = 'bg-indigo-500';
                } else if (r.totalScore >= cutoffVal - 2) {
                    badge = `<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40" title="기준선: ${cutoffVal.toFixed(2)}점 (${diffStr}점) - 소신 지원">🟠 소신</span>`;
                    color = 'bg-amber-500';
                } else {
                    badge = `<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40" title="기준선: ${cutoffVal.toFixed(2)}점 (${diffStr}점) - 도전 지원">🔴 도전</span>`;
                    color = 'bg-rose-500';
                }
            } else {
                badge = `<span class="text-xs text-text-muted">만점의 ${pct.toFixed(1)}%</span>`;
            }
            return { badge, color, pct };
        };

        const { badge: initialBadge, color: initialColor, pct: initialPct } = getCutoffBadgeAndGauge(defaultCutoff);

        // 가중치 과목 상세 텍스트
        let weightDetailText = '';
        if (r.weightedDetails && Object.keys(r.weightedDetails).length > 0) {
            const parts = [];
            for (let [sub, pts] of Object.entries(r.weightedDetails)) {
                parts.push(`${sub} ${pts.toFixed(1)}점`);
            }
            weightDetailText = `<span class="text-slate-400 text-xs">(${parts.join(', ')})</span>`;
        }

        const hasRegisteredWish = (ctx.wishlist && ctx.wishlist.length > 0) || (ctx.data.applications || []).some(a => a.schoolName && a.schoolName.trim());
        const isMatchedSchool = isAlreadyWish || (ctx.data.applications || []).some(a => a.schoolName && ctx.isSameSchool(a.schoolName, r.schoolName));
        // 장바구니/희망학교가 등록된 학생: 등록된 학교만 인쇄, 아예 등록 안 한 학생: 전체 학교 인쇄
        let schoolPrintClass = '';
        if (hasRegisteredWish) {
            schoolPrintClass = isMatchedSchool ? 'counsel-print-target-school' : 'counsel-print-unregistered-school';
        } else {
            schoolPrintClass = 'counsel-print-target-school';
        }

        ctx.cardsHTML += `
            <div class="p-4 rounded-xl bg-slate-800/70 border border-slate-700/70 space-y-2.5 school-counsel-card ${schoolPrintClass}" id="card_${rIdx}"
                 data-school="${escapeAttr(r.schoolName)}"
                 data-track="${escapeAttr(r.trackName)}"
                 data-score="${r.totalScore}"
                 data-max="${r.totalMax}"
                 data-last-cutoff="${defaultCutoff || 0}"
                 data-last-avg="${defaultAvg || 0}"
                 data-avg3-cutoff="${recent3Average ? recent3Average.toFixed(2) : 0}"
                 data-avg5-cutoff="${recent5Average ? recent5Average.toFixed(2) : 0}"
                 data-history-count="${cutoffHistory.length}">
                <div class="flex items-center justify-between flex-wrap gap-2">
                    <div class="flex items-center gap-2">
                        <span class="font-bold text-white text-base">${r.schoolName}</span>
                        <span class="text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-300 font-semibold">${r.trackName}전형</span>
                    </div>
                    <div class="flex items-center gap-1.5 flex-wrap">
                        <button type="button" class="btn-toggle-wishlist px-2.5 py-1 text-xs font-bold rounded-lg border transition-all flex items-center gap-1 cursor-pointer ${isAlreadyWish ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm' : 'bg-slate-800 text-slate-300 border-slate-600 hover:text-white hover:border-slate-500'}"
                                data-school="${escapeAttr(r.schoolName)}" data-track="${escapeAttr(r.trackName)}" data-score="${r.totalScore}" data-max="${r.totalMax}" data-cat="${schoolCat}" data-card="${rIdx}">
                            <span>${isAlreadyWish ? '⭐' : '☆'}</span> <span class="wishlist-btn-text">${isAlreadyWish ? '관심 등록됨' : '관심 담기'}</span>
                        </button>
                        <button type="button" class="btn-direct-apply px-2.5 py-1 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-all flex items-center gap-1 shadow-sm cursor-pointer"
                                data-school="${escapeAttr(r.schoolName)}" data-track="${escapeAttr(r.trackName)}" data-score="${r.totalScore}" data-cat="${schoolCat}" title="해당 학교로 희망원서 자동 입력">
                            <span>📝</span> 희망입력
                        </button>
                        <div id="badge_${rIdx}">${initialBadge}</div>
                    </div>
                </div>

                <!-- 학과별 커트라인 선택 드롭다운 (최신 연도 기준 학과별 깔끔 표기) -->
                ${deptsForSchool.length > 0 ? `
                <div class="flex items-center justify-between bg-slate-900/60 px-3 py-1.5 rounded-lg border border-slate-700/50 text-xs">
                    <span class="text-indigo-200 font-bold flex items-center gap-1">🎯 목표 학과:</span>
                    <select class="dept-selector bg-slate-800 text-white font-bold border border-slate-600 rounded px-2 py-1 outline-none cursor-pointer"
                            data-card="${rIdx}" data-score="${r.totalScore}" data-max="${r.totalMax}">
                        ${deptsForSchool.map((d, dIdx) => `
                            <option value="${d.minValue}" data-avg="${d.avgValue || 0}" ${dIdx === 0 ? 'selected' : ''}>
                                ${d.department} (${d.year}년 · 최저: ${d.minValue}점${d.avgValue > 0 ? `, 평균: ${d.avgValue}점` : ''})
                            </option>
                        `).join('')}
                    </select>
                </div>
                ` : ''}

                ${officialForSchool.length > 0 ? `
                <div class="text-[11px] text-cyan-100 bg-cyan-950/30 px-3 py-2 rounded-lg border border-cyan-500/30 space-y-1">
                    <div class="font-bold text-cyan-300">📘 공식·교육청 공개자료 <span class="font-normal text-slate-400">(읽기 전용)</span></div>
                    ${officialForSchool.slice(0, 3).map(item => `<div>${admissionLabel(item.admissionYear)} · ${item.department || '학교 전체'} · ${item.track || r.trackName}${Number(item.maxAcceptedScore || 0) > 0 ? ` · 최고합격 ${Number(item.maxAcceptedScore)}점` : ''}${Number(item.minAcceptedScore || item.minValue || 0) > 0 ? ` · 최저합격 ${Number(item.minAcceptedScore || item.minValue)}점` : ''}${Number(item.avgAcceptedScore || item.avgValue || 0) > 0 ? ` · 평균합격 ${Number(item.avgAcceptedScore || item.avgValue)}점` : ''}<span class="text-slate-400"> · 출처: ${item.source || '-'} · 확인: ${item.verifiedAt || '-'}</span></div>`).join('')}
                </div>` : ''}

                ${cutoffHistory.length > 0 ? `
                <div class="text-[11px] text-slate-300 bg-slate-900/50 px-3 py-2 rounded-lg border border-slate-700/40 space-y-1">
					<div class="font-bold text-violet-200">🏫 우리 학교 누적 결과 <span class="font-normal text-slate-400">(수기 입력·합격자 결과)</span></div>
					<div><span class="font-bold text-indigo-200">연도별 합격선:</span>
					${cutoffHistory.map((c, index) => `<span class="ml-2 ${index === 0 ? 'text-emerald-300 font-bold' : ''}">${admissionLabel(c.year)} ${c.department || '학교 전체'} ${c.minValue}점</span>`).join('')}</div>
					<div class="text-slate-400">직전 ${admissionLabel(cutoffHistory[0].year)} ${cutoffHistory[0].minValue}점 · 최근 ${Math.min(3, cutoffHistory.length)}년 평균 ${recent3Average.toFixed(2)}점${cutoffHistory.length >= 4 ? ` · 최근 ${Math.min(5, cutoffHistory.length)}년 평균 ${recent5Average.toFixed(2)}점` : ''}</div>
				</div>` : ''}

                <div class="flex items-baseline justify-between">
                    <div class="text-xs text-text-muted">
                        교과 ${r.allSubjectScore.toFixed(1)}${r.weightedScore > 0 ? ` + 가중치 ${r.weightedScore.toFixed(1)}` : ''} 
                        | 출결 ${r.attendanceScore.toFixed(1)} | 봉사 ${r.volunteerScore.toFixed(1)}
                        ${r.leadershipMax > 0 ? ` | 리더십 ${r.leadershipScore.toFixed(1)}` : ''}
                        ${weightDetailText}
                    </div>
                    <div class="text-lg font-black text-white">
                        ${r.totalScore.toFixed(2)} <span class="text-xs text-slate-400 font-normal">/ ${r.totalMax}점</span>
                    </div>
                </div>

                <!-- 게이지 바 -->
                <div class="gauge-bg w-full bg-slate-700/50 rounded-full h-2.5 overflow-hidden">
                    <div id="gauge_${rIdx}" class="gauge-fill ${initialColor} h-2.5 rounded-full transition-all duration-500" style="width: ${Math.min(100, Math.max(5, initialPct))}%;"></div>
                </div>

                <div id="diff_${rIdx}" class="flex justify-between text-[11px] text-slate-400 pt-0.5">
                    ${defaultCutoff ? `
                    <span>합격 기준선(최저): <strong class="text-slate-200">${defaultCutoff}점</strong> ${defaultAvg > 0 ? `<span class="text-amber-300 font-medium">(평균 ${defaultAvg}점)</span>` : ''}</span>
                    <span>점수차: <strong class="${r.totalScore >= defaultCutoff ? 'text-success' : 'text-danger'}">${(r.totalScore - defaultCutoff) >= 0 ? '+' : ''}${(r.totalScore - defaultCutoff).toFixed(2)}점</strong></span>
                    ` : '<span class="text-slate-500">※ 등록된 커트라인 점수가 없습니다.</span>'}
                </div>
            </div>
        `;
    });
}
