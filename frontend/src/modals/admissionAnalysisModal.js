import { escapeHtml, escapeAttr } from '../core/utils.js';
import { showModalAlert } from '../core/dialogs.js';

/**
 * 고입 결과 정밀 분석 및 시각화 차트 모달 (설계서 10-1절 기준)
 */
export async function openAdmissionAnalysisModal() {
    document.getElementById('admissionAnalysisModal')?.remove();

    let schoolConfig = null;
    let admissionYear = 2026;
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

    // 고교 목록 및 학과 목록 추출
    const schoolMap = new Map();
    ourDeptStats.forEach(ds => {
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
                        <!-- 입학 학년도 선택 -->
                        <div class="flex items-center gap-2">
                            <span class="text-xs font-bold text-slate-400">학년도:</span>
                            <select id="analysisYearSelect" class="bg-slate-900 text-white font-bold text-xs border border-slate-700 rounded-lg px-2.5 py-1.5 outline-none cursor-pointer">
                                <option value="${admissionYear}" selected>${admissionYear}학년도</option>
                                <option value="${admissionYear - 1}">${admissionYear - 1}학년도</option>
                                <option value="${admissionYear - 2}">${admissionYear - 2}학년도</option>
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
    const updateDeptDropdown = () => {
        const sch = modal.querySelector('#analysisSchoolSelect')?.value || '';
        const deptSelect = modal.querySelector('#analysisDeptSelect');
        if (!deptSelect) return;

        const info = schoolMap.get(sch);
        let optionsHTML = '<option value="" selected>전체 (학교 총괄)</option>';
        if (info && info.departments.size > 0) {
            info.departments.forEach(d => {
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
                const found = ourDeptStats.find(x =>
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
    modal.querySelector('#analysisYearSelect')?.addEventListener('change', loadAndRenderAnalysis);
    modal.querySelector('#analysisDeptSelect')?.addEventListener('change', loadAndRenderAnalysis);
    modal.querySelector('#analysisTrackSelect')?.addEventListener('change', loadAndRenderAnalysis);

    // 초기 로드 실행
    loadAndRenderAnalysis();
}

/**
 * 정밀 통계 지표 및 히스토그램 대시보드 렌더링
 */
function renderStatsDashboard(container, stats, sourceMode) {
    const isSpecialized = stats.highSchool.includes('마이스터') || stats.highSchool.includes('공업') || stats.highSchool.includes('상업') || stats.highSchool.includes('생활과학') || stats.highSchool.includes('애니원');
    const isInterview = stats.highSchool.includes('애니원') || stats.track.includes('특별');

    // 4단계 판정 기준선 계산 (설계서 7절)
    // 안정: 불합격 최고점보다 높음 (불합격자 없으면 Q3 이상)
    // 적정: 합격자 하위 25%(Q1) 이상 ~ 불합격 최고점 이하
    // 소신: 합격 최저점 이상 ~ 합격자 하위 25%(Q1) 미만
    // 도전: 합격 최저점 미만
    const safeCutoff = stats.rejectedCount > 0 ? stats.rejectedMax : (stats.acceptedQ3 || stats.acceptedAvg);
    const properCutoff = stats.acceptedQ1 || stats.acceptedMin;
    const challengeCutoff = stats.acceptedMin;

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
                    <span>불합격 ${stats.rejectedCount}명</span>
                    <span class="text-slate-600">·</span>
                    <span class="text-indigo-300 font-medium">${sourceMode === 'consolidated' ? `관내 ${stats.totalParticipatingSchool}개교` : '우리 학교'}</span>
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
                        <span class="font-mono">${safeCutoff > 0 ? `>${safeCutoff.toFixed(2)}점` : '-'}</span>
                    </div>
                    <p class="text-[11px] text-slate-300">불합격 최고점 초과 구간</p>
                </div>

                <!-- 적정 -->
                <div class="p-3 rounded-lg bg-indigo-950/40 border border-indigo-500/30 space-y-1">
                    <div class="flex items-center justify-between font-bold text-indigo-300">
                        <span>🟡 적정권</span>
                        <span class="font-mono">${properCutoff > 0 ? `${properCutoff.toFixed(2)}점 ~` : '-'}</span>
                    </div>
                    <p class="text-[11px] text-slate-300">합격자 하위 25%(Q1) 이상</p>
                </div>

                <!-- 소신 -->
                <div class="p-3 rounded-lg bg-amber-950/40 border border-amber-500/30 space-y-1">
                    <div class="flex items-center justify-between font-bold text-amber-300">
                        <span>🟠 소신/주의</span>
                        <span class="font-mono">${challengeCutoff > 0 ? `${challengeCutoff.toFixed(2)}점 ~` : '-'}</span>
                    </div>
                    <p class="text-[11px] text-slate-300">합격 최저 ~ Q1 미만 경합</p>
                </div>

                <!-- 도전 -->
                <div class="p-3 rounded-lg bg-rose-950/40 border border-rose-500/30 space-y-1">
                    <div class="flex items-center justify-between font-bold text-rose-300">
                        <span>🔴 도전권</span>
                        <span class="font-mono">${challengeCutoff > 0 ? `<${challengeCutoff.toFixed(2)}점` : '-'}</span>
                    </div>
                    <p class="text-[11px] text-slate-300">합격 최저점 미달 구간</p>
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
