import { app } from '../../../core/dom.js';
import { admissionLabel, admissionLongLabel, admissionOptionLabel } from '../../../core/admissionYear.js';

// 커트라인 관리: 화면 골격 렌더링 후 이벤트 연결
export function renderCutoffLayout(ctx, view) {
    app.innerHTML = `
            <div class="glass-card p-6 md:p-8 w-full mx-auto min-h-[85vh] space-y-6 fade-in" style="max-width: 1500px;">
                <!-- 1. 상단 타이틀 & 고입 연도 & 주요 액션 바 (버튼 크기 완벽 통일 h-[36px]) -->
                <div class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-700/50 pb-4">
                    <div>
                        <h1 class="text-2xl font-black text-white flex items-center gap-2.5">
                            <span>🎯</span> 고교별·학과별 입학 커트라인 통합 관리
                        </h1>
                        <p class="text-xs text-text-muted mt-1">
                            고입 연도별 합격선(최저점)과 최고 불합격점을 관리하며, 학생 진학 상담 시 실시간 합격 가능성 판정 기준으로 적용됩니다.
                        </p>
                        <div class="flex items-center gap-2 mt-2 flex-wrap">
                            <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 font-bold text-xs shadow-sm">
                                <span>🏷️</span> ${admissionLongLabel(ctx.currentAdmissionYear)}
                            </span>
                            <span class="text-xs text-text-muted">연도 선택 시 해당 고입 연도의 저장값으로 즉시 전환됩니다.</span>
                        </div>
                    </div>

                    <div class="flex items-center gap-2 flex-wrap">
                        <!-- 고입 연도 선택기: 선택 즉시 자동 전환 및 건수 현황 표시 -->
                        <div class="flex items-center gap-2 bg-slate-900/80 px-3 rounded-xl border border-indigo-500/40 shadow-inner h-9">
                            <label class="text-xs font-bold text-indigo-300 whitespace-nowrap">📅 고입 연도:</label>
                            <select id="admissionYearSelect" class="bg-slate-800 text-white font-bold text-xs px-2.5 py-0.5 rounded-lg border border-slate-700 outline-none cursor-pointer">
                                ${ctx.admissionYears.map(year => {
                                    const count = ctx.getCutoffCountByYear(year);
                                    const badge = count > 0 ? `(${count}건 등록)` : `(미등록)`;
                                    return `<option value="${year}" ${Number(ctx.currentAdmissionYear) === Number(year) ? 'selected' : ''}>${admissionOptionLabel(year)} ${badge}</option>`;
                                }).join('')}
                            </select>
                        </div>

                        <button id="copyFromOtherYearBtn" class="text-xs bg-purple-600/30 border border-purple-500/50 text-purple-200 hover:bg-purple-600/50 px-3.5 rounded-xl font-bold flex items-center gap-1.5 transition-colors cursor-pointer h-9" title="다른 고입 연도의 커트라인을 현재 선택된 고입 연도로 그대로 복사해옵니다">
                            <span>📋</span> 다른 연도 복사
                        </button>
                        <button id="saveAllYearsCutoffsBtn" class="text-xs bg-emerald-600/30 border border-emerald-500/60 text-emerald-200 hover:bg-emerald-600/50 px-3.5 rounded-xl font-bold flex items-center gap-1.5 transition-colors cursor-pointer h-9 shadow-sm" title="현재 입력된 커트라인을 5개년 전체 연도에 한 번에 일괄 복제 저장합니다">
                            <span>🌐</span> 전체연도 일괄 저장
                        </button>
                        <button id="saveAllCutoffsBtn" class="text-xs bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-3.5 rounded-xl flex items-center gap-1.5 shadow-sm transition-all cursor-pointer h-9" title="현재 선택된 고입 연도의 커트라인만 데이터베이스에 영구 저장합니다">
                            <span>💾</span> 커트라인 저장
                        </button>
                        <button id="resetCutoffsBtn" class="text-xs bg-rose-950/60 border border-rose-500/50 text-rose-300 hover:bg-rose-900/70 px-3.5 rounded-xl font-bold flex items-center gap-1.5 transition-colors cursor-pointer h-9" title="입력된 커트라인 데이터를 초기화합니다">
                            <span>🗑️</span> 커트라인 초기화
                        </button>
                        <button id="exportJointDataBtn" class="text-xs bg-indigo-600/30 border border-indigo-500/50 text-indigo-200 hover:bg-indigo-600/50 px-3.5 rounded-xl font-bold flex items-center gap-1.5 transition-colors cursor-pointer h-9">
                            <span>📤</span> 자료 내보내기
                        </button>
                        <button id="importJointDataBtn" class="text-xs bg-emerald-600/30 border border-emerald-500/50 text-emerald-200 hover:bg-emerald-600/50 px-3.5 rounded-xl font-bold flex items-center gap-1.5 transition-colors cursor-pointer h-9">
                            <span>📥</span> 타교자료 병합
                        </button>
                        <button id="backToAdminBtn" class="text-xs bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-200 px-3.5 rounded-xl font-bold flex items-center justify-center transition-colors cursor-pointer h-9">
                            ← 대시보드
                        </button>
                    </div>
                </div>

                ${(() => {
                    const curCount = ctx.getCutoffCountByYear(ctx.currentAdmissionYear);
                    const sourceYears = ctx.admissionYears.filter(y => Number(y) !== Number(ctx.currentAdmissionYear) && ctx.getCutoffCountByYear(y) > 0);
                    if (curCount === 0 && sourceYears.length > 0) {
                        const topYear = sourceYears[0];
                        return `
                            <div class="mb-4 p-3.5 rounded-2xl bg-linear-to-r from-indigo-950/70 via-purple-950/50 to-slate-900/80 border border-indigo-500/50 flex items-center justify-between flex-wrap gap-3 shadow-lg">
                                <div class="flex items-center gap-3">
                                    <span class="text-2xl">💡</span>
                                    <div>
                                        <div class="text-xs font-bold text-indigo-200">현재 <strong>${admissionLabel(ctx.currentAdmissionYear)}</strong>에는 등록된 커트라인 점수가 없습니다.</div>
                                        <div class="text-[11px] text-slate-400 mt-0.5">이미 등록된 <strong>${admissionLabel(topYear)}</strong>(${ctx.getCutoffCountByYear(topYear)}건)의 커트라인을 한 번의 클릭으로 그대로 가져와 사용하실 수 있습니다.</div>
                                    </div>
                                </div>
                                <button id="quickCopyYearBtn" data-year="${topYear}" class="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer">
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
                            <span>🏷️</span> 전체 학교
                        </button>
                        <button class="nav-tab-btn px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${ctx.currentTab === 'meister' ? 'bg-primary text-white shadow-md' : 'bg-slate-800/60 text-slate-400 hover:text-white'}" data-tab="meister">
                            <span>🏛️</span> 마이스터고
                        </button>
                        <button class="nav-tab-btn px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${ctx.currentTab === 'special' ? 'bg-primary text-white shadow-md' : 'bg-slate-800/60 text-slate-400 hover:text-white'}" data-tab="special">
                            <span>🏭</span> 특성화고
                        </button>
                        <button class="nav-tab-btn px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${ctx.currentTab === 'general' ? 'bg-primary text-white shadow-md' : 'bg-slate-800/60 text-slate-400 hover:text-white'}" data-tab="general">
                            <span>🏫</span> 후기 일반고
                        </button>
                        <button class="nav-tab-btn px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${ctx.currentTab === 'public' ? 'bg-amber-500 text-white shadow-md' : 'bg-amber-950/30 text-amber-300 border border-amber-500/30 hover:bg-amber-900/40'}" data-tab="public">
                            <span>📊</span> 고교 공식 공개 데이터 (참고자료)
                        </button>
                    </div>

                    <div class="relative w-64">
                        <input id="cutoffSchoolSearch" type="text" value="${ctx.searchKeyword}" placeholder="🔍 고교명·학과·전형 검색..." class="input-field py-1.5 pl-3 pr-8 text-xs w-full bg-slate-900/80 border border-slate-700/60 rounded-xl" />
                        ${ctx.searchKeyword ? `<button id="clearCutoffSearch" class="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white">✕</button>` : ''}
                    </div>
                </div>

                <!-- 3. 학교별 커트라인 목록 -->
                <div class="space-y-5">
                    ${view.schoolsHTML}
                </div>
            </div>
        `;

    ctx.bindEvents();
}
