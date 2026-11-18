import { escapeHtml, escapeAttr, normalizeSchoolName, normalizeTrack } from '../../core/utils.js';
import { tracksForSchool, trackLabel } from './analysisFilters.js';
import { renderStatsDashboard } from './statsDashboard.js';
import { renderGeneralCutoffPanel } from './generalCutoffPanel.js';
import { renderTrendChart } from './trendChart.js';
import { renderPreferencePanel } from './preferencePanel.js';

const GENERAL_OPTION = '후기 일반고';
const generalOptionHTML = selected => `<option value="${GENERAL_OPTION}" ${selected ? 'selected' : ''}>🏫 후기 일반고 (관내 합격선)</option>`;
import { admissionOptionLabel, currentAdmissionYear } from '../../core/admissionYear.js';

/**
 * 고입 결과 정밀 분석 및 시각화 차트 모달 (설계서 10-1절 기준)
 */
export async function openAdmissionAnalysisModal() {
    document.getElementById('admissionAnalysisModal')?.remove();

    let schoolConfig = null;
    let admissionYear = currentAdmissionYear();
    try {
        schoolConfig = await window.go.main.App.GetSchoolConfig();
        if (schoolConfig && schoolConfig.admissionYear) {
            admissionYear = schoolConfig.admissionYear;
        }
    } catch (e) {
        console.warn('학교 설정 로드 실패:', e);
    }

    // 관내 참여 학교 목록 확인
    let participatingSchools = [];
    try {
        participatingSchools = await window.go.main.App.GetParticipatingSchools(admissionYear) || [];
    } catch (e) {
        console.warn('참여 학교 목록 로드 실패:', e);
    }

    // 자료가 있는 모든 학년도(우리 학교 원서·지난 입시 기록·관내 공유·커트라인). 학교 설정 학년도도 넣는다.
    let analysisYears = [];
    try {
        analysisYears = (await window.go.main.App.GetAnalysisYears()) || [];
    } catch (e) {
        console.warn('분석 학년도 로드 실패:', e);
    }
    if (!analysisYears.includes(admissionYear)) analysisYears.push(admissionYear);
    analysisYears = [...new Set(analysisYears.map(Number))].sort((a, b) => b - a);

    // 우리 학교 학과별 통계 로드
    let ourDeptStats = [];
    try {
        ourDeptStats = await window.go.main.App.GetDepartmentAdmissionStats(1.0) || [];
    } catch (e) {
        console.warn('학과별 통계 로드 실패:', e);
    }

    // 기록이 아직 없어도 전형 규칙과 고교 목록으로 분석 조건을 고를 수 있다.
    let rules = [];
    let catalog = [];
    try { rules = (await window.go.main.App.GetSchoolRuleList()) || []; } catch (e) { console.warn('고교 산출 규칙 로드 실패:', e); }
    try { catalog = (await window.go.main.App.GetHighSchoolsData())?.schools || []; } catch (e) { console.warn('고교 목록 로드 실패:', e); }

    // 초기 학년도의 우리 학교 통계만으로 필터 목록을 구성한다. 이전·다음
    // 학년도 기록이 현재 연도 분석에 섞이는 것을 막기 위함이다.
    const statsForYear = (year) => ourDeptStats.filter(ds => Number(ds.admissionYear) === Number(year));

    const knownSchools = () => {
        const byName = new Map();
        for (const rule of rules) {
            const name = rule.schoolName;
            if (name) byName.set(normalizeSchoolName(name), name);
        }
        for (const school of catalog) {
            const type = String(school.type || school.Type || '').toLowerCase();
            const name = school.name || school.Name;
            if (name && ['meister', 'special', '마이스터고', '특성화고'].includes(type) && !byName.has(normalizeSchoolName(name))) {
                byName.set(normalizeSchoolName(name), name);
            }
        }
        for (const stat of ourDeptStats) {
            if (stat.schoolName && ['meister', 'special'].includes(stat.category) && !byName.has(normalizeSchoolName(stat.schoolName))) {
                byName.set(normalizeSchoolName(stat.schoolName), stat.schoolName);
            }
        }
        return [...byName.values()];
    };
    const schoolNames = knownSchools();
    const initialSchool = schoolNames[0] || '울산마이스터고';

    const modal = document.createElement('div');
    modal.id = 'admissionAnalysisModal';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-slate-950/85 backdrop-blur-md animate-fade-in text-slate-100';

    modal.innerHTML = `
        <div class="relative w-full max-w-6xl max-h-[92vh] bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            <!-- Header -->
            <div class="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
                <div class="flex items-center gap-3">
                    <div class="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-400/20 text-indigo-400">
                        <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                    </div>
                    <div>
                        <h2 class="text-xl font-bold text-white flex items-center gap-2">
                            고입 결과 정밀 분석 및 판정 지표
                            <span class="px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                ${participatingSchools.length > 0 ? `관내 ${participatingSchools.length}개교 통합 자료` : '우리 학교 단독 자료'}
                            </span>
                        </h2>
                        <p class="text-xs text-slate-400 mt-0.5">사분위수(Q1·Q3)·중앙값·표준편차 및 합·불 경합구간 분석 (4단계 판정 가이드)</p>
                    </div>
                </div>
                <button type="button" id="closeAnalysisModalBtn" class="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors">
                    <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            <!-- Body -->
            <div class="flex-1 overflow-y-auto p-6 space-y-6">
                <!-- 상단 필터 바 -->
                <div class="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 flex flex-wrap items-center justify-between gap-4">
                    <div class="flex flex-wrap items-center gap-3">
                        <!-- 고입 연도 선택 -->
                        <div class="flex items-center gap-2">
                            <span class="text-xs font-bold text-slate-400">고입:</span>
                            <select id="analysisYearSelect" class="bg-slate-900 text-white font-bold text-xs border border-slate-700 rounded-lg px-2.5 py-1.5 outline-none cursor-pointer">
                                ${analysisYears.map(y => `<option value="${y}" ${y === admissionYear ? 'selected' : ''}>${admissionOptionLabel(y)}</option>`).join('')}
                            </select>
                        </div>

                        <!-- 분석 대상 고교 선택 -->
                        <div class="flex items-center gap-2">
                            <span class="text-xs font-bold text-slate-400">목표 고교:</span>
                            <select id="analysisSchoolSelect" class="bg-slate-900 text-white font-bold text-xs border border-slate-700 rounded-lg px-2.5 py-1.5 outline-none cursor-pointer">
                                ${schoolNames.length > 0 ? schoolNames.map(s => `
                                    <option value="${escapeAttr(s)}" ${s === initialSchool ? 'selected' : ''}>${escapeHtml(s)}</option>
                                `).join('') : `
                                    <option value="울산마이스터고">울산마이스터고</option>
                                    <option value="울산에너지고">울산에너지고</option>
                                    <option value="현대공업고">현대공업고</option>
                                `}
                                ${generalOptionHTML(false)}
                            </select>
                        </div>

                        <!-- 학과 선택 -->
                        <div class="flex items-center gap-2">
                            <span class="text-xs font-bold text-slate-400">학과:</span>
                            <select id="analysisDeptSelect" class="bg-slate-900 text-white font-bold text-xs border border-slate-700 rounded-lg px-2.5 py-1.5 outline-none cursor-pointer">
                                <option value="" selected>전체 (학교 총괄)</option>
                            </select>
                        </div>

                        <!-- 전형 선택 -->
                        <div class="flex items-center gap-2">
                            <span class="text-xs font-bold text-slate-400">전형:</span>
                            <select id="analysisTrackSelect" class="bg-slate-900 text-white font-bold text-xs border border-slate-700 rounded-lg px-2.5 py-1.5 outline-none cursor-pointer">
                                <option value="일반" selected>일반전형</option>
                            </select>
                        </div>
                    </div>

                    <!-- 데이터 소스 전환 버튼 (우리학교만 / 관내 통합) -->
                    <div class="flex items-center gap-1.5 bg-slate-900/80 p-1 rounded-xl border border-slate-700/60">
                        <button type="button" id="srcConsolidatedBtn" class="px-3 py-1 text-xs font-bold rounded-lg bg-indigo-600 text-white transition-all cursor-pointer">
                            관내 통합 (${participatingSchools.length}개교)
                        </button>
                        <button type="button" id="srcOurSchoolBtn" class="px-3 py-1 text-xs font-bold rounded-lg text-slate-400 hover:text-white transition-all cursor-pointer">
                            우리 학교만
                        </button>
                    </div>
                </div>

                <!-- 여러 해 추세(학년도 선택과 무관) -->
                <div id="analysisTrendContainer"></div>

                <!-- 분석 결과 영역 컨테이너 -->
                <div id="analysisContentContainer" class="space-y-6">
                    <div class="py-16 text-center text-slate-500">
                        <span class="spinner"></span> 통계 데이터를 분석하는 중…
                    </div>
                </div>

                <!-- 학과 지망 전략(선택 학년도) -->
                <div id="analysisPreferenceContainer"></div>
            </div>

            <!-- Footer -->
            <div class="px-6 py-4 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between text-xs text-slate-500">
                <span>R/Excel Type 7 표준 사분위수 보간법 적용 · 표본 표준편차 베셀 보정(n-1)</span>
                <button type="button" id="closeAnalysisFooterBtn" class="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium transition-colors cursor-pointer">
                    닫기
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const closeModal = () => modal.remove();
    modal.querySelector('#closeAnalysisModalBtn')?.addEventListener('click', closeModal);
    modal.querySelector('#closeAnalysisFooterBtn')?.addEventListener('click', closeModal);

    // 학년도와 무관하게 학교 목록을 유지하고, 선택 학교의 규칙으로 전형을 만든다.
    const updateSchoolFilters = () => {
        const sch = modal.querySelector('#analysisSchoolSelect')?.value || '';
        const deptSelect = modal.querySelector('#analysisDeptSelect');
        const trackSelect = modal.querySelector('#analysisTrackSelect');
        if (!deptSelect || !trackSelect) return;
        const year = parseInt(modal.querySelector('#analysisYearSelect')?.value || admissionYear, 10);
        const matchSchool = name => normalizeSchoolName(name) === normalizeSchoolName(sch);
        const yearStats = statsForYear(year).filter(ds => matchSchool(ds.schoolName));
        const school = catalog.find(item => matchSchool(item.name || item.Name));
        const departments = new Set([...(school?.departments || school?.Departments || []), ...yearStats.map(ds => ds.department)]
            .filter(d => d && !['전체', '공통', '학교 전체', '학교전체'].includes(String(d).trim())));
        const oldDept = deptSelect.value;
        deptSelect.innerHTML = '<option value="">전체 (학교 총괄)</option>' + [...departments].map(d => `<option value="${escapeAttr(d)}">${escapeHtml(d)}</option>`).join('');
        deptSelect.value = departments.has(oldDept) ? oldDept : '';
        const category = yearStats[0]?.category || school?.type || school?.Type || '';
        const tracks = tracksForSchool(sch, rules, category, yearStats.map(ds => ds.track));
        const previous = normalizeTrack(trackSelect.value);
        trackSelect.innerHTML = tracks.map(t => `<option value="${escapeAttr(t)}">${escapeHtml(trackLabel(t))}</option>`).join('');
        trackSelect.value = tracks.includes(previous) ? previous : (tracks[0] || '');
    };

    updateSchoolFilters();

    let currentSourceMode = 'consolidated'; // 'consolidated' or 'our'
    let lastTrendKey = ''; // 추세 그래프는 학교·학과·전형이 바뀔 때만 다시 그린다

    // 데이터 조회 및 렌더링 함수
    const loadAndRenderAnalysis = async () => {
        const container = modal.querySelector('#analysisContentContainer');
        if (!container) return;

        const year = parseInt(modal.querySelector('#analysisYearSelect')?.value || admissionYear, 10);
        const school = modal.querySelector('#analysisSchoolSelect')?.value || '';
        const dept = modal.querySelector('#analysisDeptSelect')?.value || '';
        const track = modal.querySelector('#analysisTrackSelect')?.value || '';
        // 후기 일반고는 학과·전형 구분 없이 관내 공유 자료로 합격선을 추정한다.
        const isGeneral = school === GENERAL_OPTION;
        ['#analysisDeptSelect', '#analysisTrackSelect'].forEach(id => { const el = modal.querySelector(id); if (el) el.disabled = isGeneral; });
        const trendKey = `${school}|${dept}|${track}`;
        if (trendKey !== lastTrendKey) {
            lastTrendKey = trendKey;
            renderTrendChart(modal.querySelector('#analysisTrendContainer'), { school, dept, track, isGeneral });
        }
        renderPreferencePanel(modal.querySelector('#analysisPreferenceContainer'), { year, school, track, isGeneral });
        if (isGeneral) {
            container.innerHTML = '<div class="py-16 text-center text-slate-500"><span class="spinner"></span> 후기 일반고 관내 합격선을 계산하는 중…</div>';
            await renderGeneralCutoffPanel(container, year);
            return;
        }

        container.innerHTML = `
            <div class="py-16 text-center text-slate-500">
                <span class="spinner"></span> ${escapeHtml(school)} ${dept ? `(${escapeHtml(dept)})` : ''} 데이터를 분석하는 중…
            </div>
        `;

        try {
            let stats = null;
            if (currentSourceMode === 'consolidated') {
                stats = await window.go.main.App.GetConsolidatedAdmissionStats(year, school, dept, track, 1.0);
            } else {
                // 학과·지망 순위별 요약을 합산하지 않고 원서별로 한 번씩 집계한다.
                const found = await window.go.main.App.GetOurSchoolAnalysisStats(year, school, dept, track, 1.0);
                if (found) {
                    stats = {
                        admissionYear: found.admissionYear,
                        highSchool: found.schoolName,
                        department: found.department,
                        track: found.track,
                        totalParticipatingSchool: 1,
                        totalApplicants: found.totalApplicants,
                        acceptedCount: found.acceptedCount,
                        acceptedMin: found.acceptedMin,
                        acceptedMax: found.acceptedMax,
                        acceptedAvg: found.acceptedAvg,
                        acceptedMedian: found.acceptedMedian,
                        acceptedQ1: found.acceptedQ1,
                        acceptedQ3: found.acceptedQ3,
                        acceptedStdDev: found.acceptedStdDev,
                        rejectedCount: found.rejectedCount,
                        stage2FailCount: found.stage2FailCount,
                        rejectedMax: found.rejectedMax,
                        rejectedAvg: found.rejectedAvg,
                        hasOverlap: found.hasOverlap,
                        overlapMin: found.overlapMin,
                        overlapMax: found.overlapMax,
                        histogram: {
                            highSchool: found.schoolName,
                            department: found.department,
                            track: found.track,
                            step: 1.0,
                            buckets: (found.distribution || []).map(b => ({
                                minScore: b.minScore,
                                maxScore: b.maxScore,
                                acceptedCount: b.acceptedCount,
                                rejectedCount: b.rejectedCount
                            }))
                        }
                    };
                }
            }

            if (!stats || stats.totalApplicants === 0) {
                container.innerHTML = `
                    <div class="p-12 text-center rounded-2xl bg-slate-800/30 border border-slate-700/50 space-y-3">
                        <div class="text-4xl">📭</div>
                        <h3 class="text-base font-bold text-slate-300">해당 조건의 분석 데이터가 없습니다</h3>
                        <p class="text-xs text-slate-500 max-w-md mx-auto">
                            선택하신 [${escapeHtml(school)} · ${escapeHtml(dept || '전체')} · ${escapeHtml(trackLabel(track))}] 조건의 ${currentSourceMode === 'consolidated' ? '관내 공유 자료가 없습니다. 관내 공유 파일을 가져왔는지 확인해 주세요.' : '우리 학교 원서 자료가 없습니다. 지원현황과 고입 연도를 확인해 주세요.'}
                        </p>
                    </div>
                `;
                if (currentSourceMode !== 'consolidated') appendStatExcludedNote(container, year);
                return;
            }

            renderStatsDashboard(container, stats, currentSourceMode);
            if (currentSourceMode !== 'consolidated') appendStatExcludedNote(container, year);
        } catch (e) {
            console.error('분석 렌더링 실패:', e);
            container.innerHTML = `
                <div class="p-8 text-center rounded-2xl bg-rose-950/20 border border-rose-500/30 text-rose-300">
                    <p class="font-bold">분석 데이터를 불러오는 중 오류가 발생했습니다</p>
                    <p class="text-xs text-rose-400/80 mt-1">${escapeHtml(String(e))}</p>
                </div>
            `;
        }
    };

    // 소스 모드 전환
    modal.querySelector('#srcConsolidatedBtn')?.addEventListener('click', () => {
        currentSourceMode = 'consolidated';
        modal.querySelector('#srcConsolidatedBtn').className = 'px-3 py-1 text-xs font-bold rounded-lg bg-indigo-600 text-white transition-all cursor-pointer';
        modal.querySelector('#srcOurSchoolBtn').className = 'px-3 py-1 text-xs font-bold rounded-lg text-slate-400 hover:text-white transition-all cursor-pointer';
        loadAndRenderAnalysis();
    });

    modal.querySelector('#srcOurSchoolBtn')?.addEventListener('click', () => {
        currentSourceMode = 'our';
        modal.querySelector('#srcOurSchoolBtn').className = 'px-3 py-1 text-xs font-bold rounded-lg bg-indigo-600 text-white transition-all cursor-pointer';
        modal.querySelector('#srcConsolidatedBtn').className = 'px-3 py-1 text-xs font-bold rounded-lg text-slate-400 hover:text-white transition-all cursor-pointer';
        loadAndRenderAnalysis();
    });

    modal.querySelector('#analysisSchoolSelect')?.addEventListener('change', () => {
        updateSchoolFilters();
        loadAndRenderAnalysis();
    });
    modal.querySelector('#analysisYearSelect')?.addEventListener('change', () => {
        updateSchoolFilters();
        loadAndRenderAnalysis();
    });
    modal.querySelector('#analysisDeptSelect')?.addEventListener('change', loadAndRenderAnalysis);
    modal.querySelector('#analysisTrackSelect')?.addEventListener('change', loadAndRenderAnalysis);

    // 초기 로드 실행
    loadAndRenderAnalysis();
}

// 우리 학교 통계에서 뺀 원서(입시 통계 제외 학생) 건수만 알린다. 학교·학과를 가리지 않은 학년도 전체 건수라
// 누가 어느 학교에 지원했는지 드러나지 않는다.
async function appendStatExcludedNote(container, year) {
    try {
        const count = await window.go.main.App.GetStatExcludedApplicationCount(Number(year) || 0);
        if (!count) return;
        const note = document.createElement('p');
        note.className = 'mt-3 text-xs text-slate-400';
        note.textContent = `이 학년도 우리 학교 원서 중 ${count}건은 입시 통계에 넣지 않도록 정한 학생의 원서라 집계에서 뺐습니다.`;
        container.appendChild(note);
    } catch (_) { /* 건수를 못 읽어도 분석은 그대로 보인다 */ }
}
