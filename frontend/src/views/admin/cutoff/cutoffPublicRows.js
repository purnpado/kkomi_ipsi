import { normalizeSchoolName } from '../../../core/utils.js';
import { admissionLabel } from '../../../core/admissionYear.js';
import { displaySchool } from '../../../core/schoolName.js';
import { matchesSearch } from '../../../core/searchMatch.js';

// 커트라인 관리: "고교 발표 자료(참고)" 탭 표 HTML (cutoffRows.js에서 옮김)
export function buildPublicRowsHTML(ctx) {
    // 공식 공개 입결 데이터 탭 뷰 (상단 입학년도 동기화 & 고교/연도별 그룹 묶음 & 실시간 검색 지원)
    const q = (ctx.searchKeyword || '').toLowerCase().trim();
    const filteredPublicList = ctx.publicOfficialData.map((item, originalIndex) => ({ ...item, originalIndex }))
        .filter(p => {
            const matchYear = ctx.publicYearFilterMode === 'all' || Number(p.year) === ctx.currentAdmissionYear;
            if (!matchYear) return false;
            if (!q) return true;
            return [p.school, p.dept, p.track, p.note].some((v) => matchesSearch(v, q));
        });

    // 2. 입학년도 + 고교명으로 그룹핑 (Rowspan 및 시각적 일체화)
    const groupedPublic = new Map();
    filteredPublicList.forEach(p => {
        const groupKey = `${p.year}_${normalizeSchoolName(p.school)}`;
        if (!groupedPublic.has(groupKey)) {
            groupedPublic.set(groupKey, {
                year: p.year,
                school: p.school,
                items: []
            });
        }
        groupedPublic.get(groupKey).items.push(p);
    });

    let publicRowsHTML = '';
    if (filteredPublicList.length === 0) {
        publicRowsHTML = `
                <tr>
                    <td colspan="11" class="p-10 text-center text-text-muted">
                        <p class="text-3xl mb-2">📭</p>
                        <p class="font-bold text-slate-300 text-sm">${admissionLabel(ctx.currentAdmissionYear)} 공식 공개 데이터가 없습니다.</p>
                        <p class="text-xs mt-1 text-slate-400">'전체 연도 모아보기'를 누르거나 우측 상단 '➕ 공개자료 추가'를 통해 등록할 수 있습니다.</p>
                    </td>
                </tr>
            `;
    } else {
        publicRowsHTML = [...groupedPublic.values()].map(group => {
            return group.items.map((p, itemIdx) => {
                const isFirstInGroup = itemIdx === 0;
                const rowSpan = group.items.length;
                const trackClean = ctx.normalizeTrack(p.track);

                // 학교 커트라인 DB(allSavedCutoffs)에 이미 반영되었는지 확인
                const pYear = Number(group.year) || Number(p.year) || ctx.currentAdmissionYear;
                const pSchoolNorm = normalizeSchoolName(group.school || p.school);
                const pDeptNorm = ctx.normalizeDept(p.dept);
                const pTrackNorm = ctx.normalizeTrack(p.track);
                const isApplied = ctx.allSavedCutoffs.some(c => 
                    Number(c.year) === pYear &&
                    normalizeSchoolName(c.schoolName) === pSchoolNorm &&
                    (ctx.normalizeDept(c.department) === pDeptNorm || (!c.department && pDeptNorm === '공통') || (c.department === '공통' && !pDeptNorm)) &&
                    (ctx.normalizeTrack(c.track) === pTrackNorm || (!c.track && pTrackNorm === '일반') || (c.track === '일반' && !pTrackNorm)) &&
                    Number(c.minValue) > 0
                );

                return `
                        <tr class="border-b border-slate-700/40 hover:bg-slate-800/40 transition-colors text-center public-item-row" data-index="${p.originalIndex}">
                            <td class="p-3 text-center border-r border-slate-700/50">
                                <input type="checkbox" class="public-item-check cursor-pointer w-4 h-4 rounded accent-indigo-500" data-index="${p.originalIndex}" />
                            </td>
                            ${isFirstInGroup ? `
                                <td class="p-3 align-middle bg-slate-900/60 border-r border-slate-700/50 text-center" rowspan="${rowSpan}">
                                    <div class="flex flex-col items-center justify-center gap-1">
                                        <span class="px-2.5 py-1 rounded-lg bg-indigo-950/90 border border-indigo-500/50 text-indigo-300 font-black text-xs shadow-inner">
                                            ${admissionLabel(group.year)}
                                        </span>
                                        <span class="text-[10px] text-slate-400">입학 기준</span>
                                        <input type="hidden" class="public-year" data-index="${p.originalIndex}" value="${group.year}" />
                                    </div>
                                </td>
                                <td class="p-3 align-middle text-left pl-3 bg-slate-900/40 border-r border-slate-700/50 min-w-40" rowspan="${rowSpan}">
                                    <div class="flex items-center gap-1.5 w-full">
                                        <span class="text-base shrink-0">🏫</span>
                                        <select class="input-field py-1 px-2.5 text-xs font-bold text-white bg-slate-800 border-slate-600 rounded-lg public-school-select w-full min-w-32.5" data-group-year="${group.year}" data-group-school="${group.school}">
                                            ${[
                                                "울산마이스터고", "울산에너지고", "현대공업고",
                                                "울산공업고", "울산기술공업고", "울산미용예술고", "울산산업고", "울산생활과학고", "울산여자상업고", "울산상업고", "울산애니원고",
                                                "울산 후기 일반계고"
                                            ].map(sName => `<option value="${sName}" ${normalizeSchoolName(group.school) === normalizeSchoolName(sName) ? 'selected' : ''}>${displaySchool(sName)}</option>`).join('')}
                                            ${!["울산마이스터고", "울산에너지고", "현대공업고", "울산공업고", "울산기술공업고", "울산미용예술고", "울산산업고", "울산생활과학고", "울산여자상업고", "울산상업고", "울산애니원고", "울산 후기 일반계고"].some(sName => normalizeSchoolName(group.school) === normalizeSchoolName(sName)) && group.school ? `<option value="${group.school}" selected>${displaySchool(group.school)}</option>` : ''}
                                        </select>
                                    </div>
                                </td>
                            ` : ''}
                            <td class="p-2.5">
                                <input type="text" class="input-field py-1.5 px-2 text-xs text-indigo-200 text-center w-24 public-dept" 
                                       value="${p.dept === '공통' ? '' : (p.dept || '')}" placeholder="학교 전체" data-index="${p.originalIndex}" />
                            </td>
                            <td class="p-2.5">
                                <input type="text" class="input-field py-1.5 px-2 text-xs font-bold text-sky-200 text-center w-20 public-track" 
                                       value="${p.track === '전체' ? '' : (p.track || '')}" placeholder="전체" data-index="${p.originalIndex}" />
                            </td>
                            <td class="p-2.5 text-center">
                                <div class="flex items-center justify-center gap-1">
                                    <input type="text" inputmode="decimal" class="input-field py-1.5 px-2 text-xs text-right font-semibold text-sky-300 w-24 public-max-score" 
                                           value="${p.max ?? ''}" placeholder="최고점" data-index="${p.originalIndex}" />
                                    <span class="text-xs text-slate-400 font-semibold">${p.unit || '점'}</span>
                                </div>
                            </td>
                            <td class="p-2.5 text-center">
                                <div class="flex items-center justify-center gap-1">
                                    <input type="text" inputmode="decimal" class="input-field py-1.5 px-2 text-xs text-right font-semibold text-amber-300 w-24 public-avg-score" 
                                           value="${p.avg ?? ''}" placeholder="평균점" data-index="${p.originalIndex}" />
                                    <span class="text-xs text-slate-400 font-semibold">${p.unit || '점'}</span>
                                </div>
                            </td>
                            <td class="p-2.5 text-center">
                                <div class="flex items-center justify-center gap-1">
                                    <input type="text" inputmode="decimal" class="input-field py-1.5 px-2 text-xs text-right font-black text-emerald-400 w-24 public-min-score" 
                                           value="${p.min ?? ''}" placeholder="최저점" data-index="${p.originalIndex}" />
                                    <span class="text-xs text-slate-400 font-semibold">${p.unit || '점'}</span>
                                </div>
                            </td>
                            <td class="p-2.5 text-center">
                                <input type="text" class="input-field py-1.5 px-2.5 text-xs text-slate-300 w-28 public-note" 
                                       value="${p.note || ''}" placeholder="출처/비고" data-index="${p.originalIndex}" />
                            </td>
                            <td class="p-2.5 text-center">
                                ${isApplied ? `
                                    <span class="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 inline-flex items-center gap-1 shadow-xs">
                                        <span>✅</span> 반영완료
                                    </span>
                                ` : `
                                    <span class="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-800 text-slate-400 border border-slate-700/60 inline-flex items-center gap-1">
                                        <span>⚪</span> 미반영
                                    </span>
                                `}
                            </td>
                            <td class="p-2.5 text-center">
                                <div class="flex items-center justify-center gap-1.5">
                                    <button class="px-2.5 py-1.5 rounded-lg ${isApplied ? 'bg-slate-700/60 hover:bg-slate-700 border border-slate-600 text-slate-200' : 'bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/40 text-emerald-300'} text-xs font-bold transition-all flex items-center gap-1 btn-apply-public-item" 
                                            data-index="${p.originalIndex}" title="${admissionLabel(group.year)} 커트라인으로 ${isApplied ? '다시 적용' : '즉시 적용'}">
                                        <span>${isApplied ? '🔄' : '📥'}</span> ${isApplied ? '재반영' : '반영'}
                                    </button>
                                    <button class="text-slate-400 hover:text-danger hover:bg-danger/10 p-1.5 rounded-lg transition-colors btn-delete-public-item" 
                                            data-index="${p.originalIndex}" title="행 삭제">
                                        🗑️
                                    </button>
                                </div>
                            </td>
                        </tr>
                    `;
            }).join('');
        }).join('');
    }

    return `
            <div class="p-6 rounded-2xl bg-slate-800/70 border border-slate-700/60 space-y-3.5 shadow-lg">
                <!-- 상단 헤더: 제목 & 기본 액션 (연도 필터, 추가) -->
                <div class="flex items-center justify-between border-b border-slate-700/50 pb-3 flex-wrap gap-3">
                    <div>
                        <h3 class="font-bold text-white text-base flex items-center gap-2">
                            <span>📊</span> 울산광역시 고등학교 공식 공개 합격선 및 입결 데이터
                        </h3>
                        <p class="text-xs text-text-muted mt-1">고교에서 공식 발표한 입결 자료입니다. 개별 [반영] 또는 아래 [선택/전체 일괄 반영]을 누르면 실제 진학 상담 커트라인으로 즉시 적용됩니다.</p>
                    </div>
                    <div class="flex items-center gap-2.5 flex-wrap">
                        <!-- 연도 필터 토글 -->
                        <div class="inline-flex rounded-xl bg-slate-900/80 p-1 border border-slate-700/60 shadow-inner text-xs h-8.5 items-center">
                            <button id="btnFilterPublicCurrentYear" class="px-3 py-1 rounded-lg font-bold transition-all ${ctx.publicYearFilterMode === 'current' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}">
                                📅 ${admissionLabel(ctx.currentAdmissionYear)}만 보기
                            </button>
                            <button id="btnFilterPublicAllYears" class="px-3 py-1 rounded-lg font-bold transition-all ${ctx.publicYearFilterMode === 'all' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}">
                                전체 연도 모아보기
                            </button>
                        </div>
                        <button id="addPublicDataBtn" class="text-xs bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-3.5 py-1 rounded-xl flex items-center gap-1.5 shadow-sm transition-all cursor-pointer h-8.5" title="새 공식 공개자료를 등록합니다">
                            <span>➕</span> 공개자료 추가
                        </button>
                    </div>
                </div>

                <!-- 일괄 작업 툴바 (테이블 바로 위에 정갈하게 분리 배치) -->
                <div class="flex items-center justify-between gap-3 flex-wrap bg-slate-900/60 p-2.5 rounded-xl border border-slate-700/50 text-xs shadow-xs">
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="text-indigo-300 font-bold ml-1 flex items-center gap-1">☑️ 체크 항목 관리:</span>
                        <button id="btnApplySelectedPublic" class="bg-indigo-600/80 hover:bg-indigo-500 text-white font-bold px-3 py-1 rounded-lg flex items-center gap-1.5 shadow-xs transition-all cursor-pointer h-7.5" title="체크된 항목들을 커트라인에 일괄 반영합니다">
                            <span>📥</span> 선택 반영
                        </button>
                        <button id="btnDeleteSelectedPublic" class="bg-rose-950/60 hover:bg-rose-900/70 border border-rose-500/50 text-rose-300 font-bold px-3 py-1 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer h-7.5" title="체크된 항목들을 삭제합니다">
                            <span>🗑️</span> 선택 삭제
                        </button>
                    </div>
                    <div>
                        <button id="btnApplyAllPublic" class="bg-emerald-600/80 hover:bg-emerald-500 text-white font-bold px-3.5 py-1 rounded-lg flex items-center gap-1.5 shadow-xs transition-all cursor-pointer h-7.5" title="현재 보이는 모든 공개 데이터를 커트라인에 일괄 반영합니다">
                            <span>⚡</span> 현재 목록 전체 일괄 반영
                        </button>
                    </div>
                </div>

                <div class="overflow-x-auto rounded-xl border border-slate-700/50 bg-slate-900/40">
                    <table class="w-full text-left border-collapse text-xs">
                        <thead class="bg-slate-800/90 text-text-muted font-bold text-center border-b border-slate-700/60 whitespace-nowrap">
                            <tr>
                                <th class="p-3 w-10 border-r border-slate-700/50 text-center">
                                    <input type="checkbox" id="checkAllPublicItems" class="cursor-pointer w-4 h-4 rounded accent-indigo-500" title="전체 선택/해제" />
                                </th>
                                <th class="p-3 w-28 border-r border-slate-700/50">고입</th>
                                <th class="p-3 text-left pl-4 w-44 border-r border-slate-700/50">고교명</th>
                                <th class="p-3 w-28">학과</th>
                                <th class="p-3 w-24">전형</th>
                                <th class="p-3 w-32 text-sky-300">최고점</th>
                                <th class="p-3 w-32 text-amber-300">평균점</th>
                                <th class="p-3 w-32 text-emerald-300">최저점 (합격선)</th>
                                <th class="p-3 w-36">출처 / 구분</th>
                                <th class="p-3 w-28 text-center">반영 상태</th>
                                <th class="p-3 w-28 text-center">관리</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${publicRowsHTML}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
}
