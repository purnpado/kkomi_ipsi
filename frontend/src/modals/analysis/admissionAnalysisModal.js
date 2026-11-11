import { escapeHtml, escapeAttr } from '../../core/utils.js';
import { renderStatsDashboard } from './statsDashboard.js';
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

    // 우리 학교 학과별 통계 로드
    let ourDeptStats = [];
    try {
        ourDeptStats = await window.go.main.App.GetDepartmentAdmissionStats(1.0) || [];
    } catch (e) {
        console.warn('학과별 통계 로드 실패:', e);
    }

    // 초기 학년도의 우리 학교 통계만으로 필터 목록을 구성한다. 이전·다음
    // 학년도 기록이 현재 연도 분석에 섞이는 것을 막기 위함이다.
    const statsForYear = (year) => ourDeptStats.filter(ds => Number(ds.admissionYear) === Number(year));

    // 고교 목록 및 학과 목록 추출
    const schoolMap = new Map();
    statsForYear(admissionYear).forEach(ds => {
        if (!schoolMap.has(ds.schoolName)) {
            schoolMap.set(ds.schoolName, {
                category: ds.category,
                departments: new Set(),
                tracks: new Set(),
            });
        }
        const sInfo = schoolMap.get(ds.schoolName);
        if (ds.department) sInfo.departments.add(ds.department);
        if (ds.track) sInfo.tracks.add(ds.track);
    });

    const schoolNames = Array.from(schoolMap.keys());
    const initialSchool = schoolNames.length > 0 ? schoolNames[0] : '울산마이스터고';

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
                                <option value="${admissionYear}" selected>${admissionOptionLabel(admissionYear)}</option>
                                <option value="${admissionYear - 1}">${admissionOptionLabel(admissionYear - 1)}</option>
                                <option value="${admissionYear - 2}">${admissionOptionLabel(admissionYear - 2)}</option>
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
                                <option value="일반전형" selected>일반전형</option>
                                <option value="특별전형">특별전형</option>
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

                <!-- 분석 결과 영역 컨테이너 -->
                <div id="analysisContentContainer" class="space-y-6">
                    <div class="py-16 text-center text-slate-500">
                        <span class="spinner"></span> 통계 데이터를 분석하는 중...
                    </div>
                </div>
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

    // 학과 드롭다운 갱신 함수
    const rebuildSchoolOptions = () => {
        const year = parseInt(modal.querySelector('#analysisYearSelect')?.value || admissionYear, 10);
        const schoolSelect = modal.querySelector('#analysisSchoolSelect');
        if (!schoolSelect) return;
        const schools = Array.from(new Set(statsForYear(year).map(ds => ds.schoolName)));
        if (schools.length === 0) return;
        const previous = schoolSelect.value;
        schoolSelect.innerHTML = schools.map(s => `<option value="${escapeAttr(s)}">${escapeHtml(s)}</option>`).join('');
        schoolSelect.value = schools.includes(previous) ? previous : schools[0];
    };

    const updateDeptDropdown = () => {
        const sch = modal.querySelector('#analysisSchoolSelect')?.value || '';
        const deptSelect = modal.querySelector('#analysisDeptSelect');
        if (!deptSelect) return;

        const year = parseInt(modal.querySelector('#analysisYearSelect')?.value || admissionYear, 10);
        const yearStats = statsForYear(year).filter(ds => ds.schoolName === sch);
        let optionsHTML = '<option value="" selected>전체 (학교 총괄)</option>';
        const departments = new Set(yearStats.map(ds => ds.department).filter(Boolean));
        if (departments.size > 0) {
            departments.forEach(d => {
                optionsHTML += `<option value="${escapeAttr(d)}">${escapeHtml(d)}</option>`;
            });
        }
        deptSelect.innerHTML = optionsHTML;
    };

    updateDeptDropdown();

    let currentSourceMode = 'consolidated'; // 'consolidated' or 'our'

    // 데이터 조회 및 렌더링 함수
    const loadAndRenderAnalysis = async () => {
        const container = modal.querySelector('#analysisContentContainer');
        if (!container) return;

        const year = parseInt(modal.querySelector('#analysisYearSelect')?.value || admissionYear, 10);
        const school = modal.querySelector('#analysisSchoolSelect')?.value || '';
        const dept = modal.querySelector('#analysisDeptSelect')?.value || '';
        const track = modal.querySelector('#analysisTrackSelect')?.value || '일반전형';

        container.innerHTML = `
            <div class="py-16 text-center text-slate-500">
                <span class="spinner"></span> ${escapeHtml(school)} ${dept ? `(${escapeHtml(dept)})` : ''} 데이터를 분석하는 중...
            </div>
        `;

        try {
            let stats = null;
            if (currentSourceMode === 'consolidated') {
                stats = await window.go.main.App.GetConsolidatedAdmissionStats(year, school, dept, track, 1.0);
            } else {
                // 우리 학교 학과별 통계에서 필터링
                const found = statsForYear(year).find(x =>
                    x.schoolName === school &&
                    (!dept || x.department === dept) &&
                    (x.track === track || !track)
                );
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
                            선택하신 [${escapeHtml(school)} · ${dept || '전체'} · ${track}] 조건으로 집계된 원서 자료가 없거나,
                            아직 관내 공유 파일이 취합되지 않았습니다.
                        </p>
                    </div>
                `;
                return;
            }

            renderStatsDashboard(container, stats, currentSourceMode);
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
        updateDeptDropdown();
        loadAndRenderAnalysis();
    });
    modal.querySelector('#analysisYearSelect')?.addEventListener('change', () => {
        rebuildSchoolOptions();
        updateDeptDropdown();
        loadAndRenderAnalysis();
    });
    modal.querySelector('#analysisDeptSelect')?.addEventListener('change', loadAndRenderAnalysis);
    modal.querySelector('#analysisTrackSelect')?.addEventListener('change', loadAndRenderAnalysis);

    // 초기 로드 실행
    loadAndRenderAnalysis();
}
