import { app } from '../../../core/dom.js';
import { admissionLabel, admissionOptionLabel } from '../../../core/admissionYear.js';

// 커트라인 관리: 화면 골격 렌더링 후 이벤트 연결
export function renderCutoffLayout(ctx, view) {
    app.innerHTML = `
            <div class="glass-card p-6 md:p-8 w-full mx-auto min-h-[85vh] space-y-6 fade-in" style="max-width: 1500px;">
                <!-- 1. 제목과 작업 줄: [고입 연도] → [저장] → 보조 작업 … 오른쪽 끝 [커트라인 지우기…] -->
                <div class="cutoff-head">
                    <div>
                        <h1 class="text-2xl font-black text-white flex items-center gap-2.5"><span>🎯</span> 커트라인·경쟁률</h1>
                        <p class="text-xs text-text-muted mt-1">고입 연도별 학과·전형 합격선(최저점)과 최고 불합격점을 넣습니다. 상담 화면·매트릭스의 합격 가능성 판정 기준이 됩니다.</p>
                    </div>
                    <div class="cutoff-actions" role="toolbar" aria-label="커트라인 작업">
                        <label class="cutoff-year"><span>고입 연도</span>
                            <select id="admissionYearSelect" class="input-field">
                                ${ctx.admissionYears.map(year => {
                                    const count = ctx.getCutoffCountByYear(year);
                                    return `<option value="${year}" ${Number(ctx.currentAdmissionYear) === Number(year) ? 'selected' : ''}>${admissionOptionLabel(year)} · ${count > 0 ? `${count}건` : '미등록'}</option>`;
                                }).join('')}
                            </select>
                        </label>
                        <button id="saveAllCutoffsBtn" type="button" class="cutoff-main-btn" title="선택한 고입 연도의 커트라인을 저장합니다">💾 저장<span id="cutoffDirtyCount" class="cutoff-dirty-count hidden"></span></button>
                        <button id="copyFromOtherYearBtn" type="button" class="cutoff-sub-btn" title="다른 고입 연도의 커트라인을 이 연도 칸에 채웁니다(저장해야 반영)">📋 다른 학년도에서 가져오기</button>
                        <button id="openCompetitionBtn" type="button" class="cutoff-sub-btn" title="고교가 발표한 지원자 수를 넣어 경쟁률을 봅니다. 모집정원은 그해 요강대로 미리 채워져 있습니다(요강이 바뀌면 고칠 수 있음). 상담 화면의 '미달'·경쟁률 표시에 쓰입니다">📊 지원자 수·경쟁률</button>
                        <button id="goSharedResultsBtn" type="button" class="cutoff-link-btn" title="다른 학교 자료는 관내 공유 결과에서 점검을 거쳐 주고받습니다">다른 학교 자료는 관내 공유 결과에서 →</button>
                        <button id="resetCutoffsBtn" type="button" class="cutoff-danger-btn" title="이 고입 연도 또는 5개년 전체 커트라인을 지웁니다">🗑️ 커트라인 지우기…</button>
                        <button id="backToAdminBtn" type="button" class="cutoff-sub-btn">← 대시보드</button>
                    </div>
                    <p id="cutoffDirtyNote" class="cutoff-dirty-note hidden" role="status" aria-live="polite"></p>
                </div>

                ${(() => {
                    const curCount = ctx.getCutoffCountByYear(ctx.currentAdmissionYear);
                    const sourceYears = ctx.admissionYears.filter(y => Number(y) !== Number(ctx.currentAdmissionYear) && ctx.getCutoffCountByYear(y) > 0);
                    if (curCount === 0 && sourceYears.length > 0) {
                        const topYear = sourceYears[0];
                        return `
                            <div class="cutoff-empty-hint">
                                <div class="flex items-center gap-3">
                                    <span class="text-2xl">💡</span>
                                    <div>
                                        <div class="text-xs font-bold text-indigo-200">현재 <strong>${admissionLabel(ctx.currentAdmissionYear)}</strong>에는 등록된 커트라인 점수가 없습니다.</div>
                                        <div class="text-[11px] text-slate-400 mt-0.5">이미 등록된 <strong>${admissionLabel(topYear)}</strong>(${ctx.getCutoffCountByYear(topYear)}건)의 커트라인을 한 번의 클릭으로 그대로 가져와 사용하실 수 있습니다.</div>
                                    </div>
                                </div>
                                <button id="quickCopyYearBtn" type="button" data-year="${topYear}" class="cutoff-sub-btn">
                                    <span>📋</span> ${admissionLabel(topYear)} 커트라인 바로 채우기
                                </button>
                            </div>
                        `;
                    }
                    return '';
                })()}

                <!-- 2. 카테고리 네비게이션 탭 바 & 스마트 실시간 검색 -->
                <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700/60 pb-3">
                    <div class="flex items-center gap-2 overflow-x-auto custom-scrollbar">
                        <button class="nav-tab-btn px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${ctx.currentTab === 'all' ? 'bg-primary text-white shadow-md' : 'bg-slate-800/60 text-slate-400 hover:text-white'}" data-tab="all">
                            전체 학교
                        </button>
                        <button class="nav-tab-btn px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${ctx.currentTab === 'meister' ? 'bg-primary text-white shadow-md' : 'bg-slate-800/60 text-slate-400 hover:text-white'}" data-tab="meister">
                            마이스터고
                        </button>
                        <button class="nav-tab-btn px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${ctx.currentTab === 'special' ? 'bg-primary text-white shadow-md' : 'bg-slate-800/60 text-slate-400 hover:text-white'}" data-tab="special">
                            특성화고
                        </button>
                        <button class="nav-tab-btn px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${ctx.currentTab === 'general' ? 'bg-primary text-white shadow-md' : 'bg-slate-800/60 text-slate-400 hover:text-white'}" data-tab="general">
                            후기 일반고
                        </button>
                        <button class="nav-tab-btn px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${ctx.currentTab === 'public' ? 'bg-amber-500 text-white shadow-md' : 'bg-amber-950/30 text-amber-300 border border-amber-500/30 hover:bg-amber-900/40'}" data-tab="public">
                            <span>📊</span> 고교 발표 자료(참고)
                        </button>
                    </div>

                    <div class="flex items-center gap-2">
                    ${ctx.currentTab !== 'public' ? '<span id="cutoffShownCount" class="cutoff-muted"></span><button type="button" id="cutoffExpandAll" class="cutoff-sub-btn">모두 펼치기</button>' : ''}
                    <div class="relative w-64">
                        <input id="cutoffSchoolSearch" type="text" value="${ctx.searchKeyword}" placeholder="🔍 고교명·학과·전형 검색…" class="input-field py-1.5 pl-3 pr-8 text-xs w-full bg-slate-900/80 border border-slate-700/60 rounded-xl" />
                        ${ctx.searchKeyword ? `<button aria-label="검색어 지우기" id="clearCutoffSearch" class="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white">✕</button>` : ''}
                    </div>
                    </div>
                </div>

                <!-- 3. 학교별 커트라인 목록 -->
                <div class="cutoff-school-list">
                    ${view.schoolsHTML}
                    <p id="cutoffNoMatch" class="hidden cutoff-muted p-8 text-center">조건에 맞는 학교가 없습니다. 다른 검색어나 탭을 골라 보세요.</p>
                </div>
            </div>
        `;

    ctx.bindEvents();
}
