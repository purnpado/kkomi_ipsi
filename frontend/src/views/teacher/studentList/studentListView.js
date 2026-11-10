import { normalizeSchoolName } from '../../../core/utils.js';
import { defineStudentTableRenderer, defineStudentTableEvents } from './studentTable.js';
import { getGeneralGuideBadge } from '../../../core/generalGuide.js';
import { getPredictionAnalysisList } from '../simulation/prediction.js';
import { notifyClassUpdated, openModal } from '../../../core/navigation.js';

export async function renderStudentList(students, classNum) {
    // 화면 구성 요소들이 공유하는 상태 (파트 함수 간 전달)
    const ctx = { students, classNum };
    const r0 = await loadStudentListData(ctx);
    if (r0 && r0.stop) return r0.value;
    defineStudentTableRenderer(ctx);
    defineStudentTableEvents(ctx);
    renderStudentListLayout(ctx);
    bindStudentListToolbar(ctx);
}

// 학급 명렬표: 고교별 산출·커트라인·상담 요약 자료 적재
async function loadStudentListData(ctx) {
    if (!ctx.students || ctx.students.length === 0) {
        document.getElementById('teacherContent').innerHTML = `
            <div class="text-center py-20 text-warning">
                <div class="text-4xl mb-4">📭</div>
                ${ctx.classNum}반 학생 데이터가 없습니다. 관리자 모드에서 나이스 엑셀 파일을 업로드해 주세요.
            </div>
        `;
        return { stop: true };
    }

    [ctx.fullStudents, ctx.dbCutoffs, ctx.officialResp, ctx.counselSummary] = await Promise.all([
        window.go.main.App.GetClassFullGrades(ctx.classNum).catch(() => []),
        window.go.main.App.GetCutoffs().catch(() => []),
        window.go.main.App.GetOfficialAdmissionData().catch(() => null),
        window.go.main.App.GetClassCounselingSummary ? window.go.main.App.GetClassCounselingSummary(ctx.classNum).catch(() => ({})) : Promise.resolve({}),
    ]);

    // 공식 공개 자료를 커트라인 형태로 정규화 및 결합
    const officialCutoffs = (ctx.officialResp?.items || []).map(item => ({
        schoolName: item.schoolName || '',
        department: item.department || '',
        track: item.track || '일반전형',
        minValue: Number(item.minAcceptedScore || item.minValue || 0),
        avgValue: Number(item.avgAcceptedScore || item.avgValue || 0),
        year: item.admissionYear || item.year || 0,
        isOfficial: true,
    })).filter(c => {
        if (!c.minValue || c.minValue <= 0) return false;
        if (c.schoolName.includes('청량고')) return false;
        return true;
    });

    const cutoffs = [...(ctx.dbCutoffs || []), ...officialCutoffs];
    const fullByStudent = new Map((ctx.fullStudents || []).map(s => [`${s.studentNum}|${s.name}`, s]));
    const applicationRows = await Promise.all(ctx.students.map(async (s) => {
        const records = await window.go.main.App.GetStudentApplications(ctx.classNum, s.StudentNum, s.Name).catch(() => []);
        return [`${s.StudentNum}|${s.Name}`, records];
    }));
    const applicationsByStudent = new Map(applicationRows);

    // 검색 및 정렬 상태 변수
    ctx.currentSearchQuery = '';
    ctx.currentSortMode = 'num_asc';

    // 학생별 가공 데이터 캐싱
    ctx.processedStudents = ctx.students.map(s => {
        const full = fullByStudent.get(`${s.StudentNum}|${s.Name}`);
        const meisterList = getPredictionAnalysisList(full?.schoolResults, cutoffs, 'meister');
        const specialList = getPredictionAnalysisList(full?.schoolResults, cutoffs, 'special');
        const meisterPassCount = new Set(meisterList.filter(x => x.isPass).map(x => normalizeSchoolName(x.schoolName))).size;
        const specialPassCount = new Set(specialList.filter(x => x.isPass).map(x => normalizeSchoolName(x.schoolName))).size;
        const applications = applicationsByStudent.get(`${s.StudentNum}|${s.Name}`) || [];

        // 전교 학생수: s.TotalStudents 우선, 백분율/석차 기반 유추, 학급 학생수
        let totalStudents = s.TotalStudents || full?.totalStudents || full?.TotalStudents || 0;
        if ((!totalStudents || totalStudents <= 0) && s.Percentile > 0 && s.Rank > 0) {
            totalStudents = Math.round(Number(s.Rank) / (Number(s.Percentile) / 100));
        }

        // 커트라인이 등록된 학교 수 기준 산출 (미등록 학교로 인한 불합격 오해 방지)
        const meisterSchoolsSet = new Set(meisterList.map(x => normalizeSchoolName(x.schoolName)));
        const meisterTotalCount = meisterSchoolsSet.size > 0 ? meisterSchoolsSet.size : 3;
        const specialSchoolsSet = new Set(specialList.map(x => normalizeSchoolName(x.schoolName)));
        const specialTotalCount = specialSchoolsSet.size;

        return {
            raw: s,
            studentNum: s.StudentNum,
            numInt: parseInt(s.StudentNum, 10) || 0,
            name: s.Name,
            percentile: s.Percentile != null ? Number(s.Percentile) : 999,
            rank: s.Rank || '',
            totalStudents: totalStudents || ctx.students.length,
            meisterPassCount,
            meisterTotalCount,
            specialPassCount,
            specialTotalCount,
            applications,
            generalBadge: getGeneralGuideBadge(s.Percentile)
        };
    });
}

// 학급 명렬표: 화면 골격 렌더링
function renderStudentListLayout(ctx) {
    // 전체 대시보드 UI 프레임 구성
    document.getElementById('teacherContent').innerHTML = `
        <!-- 상단 컨트롤 툴바: 정렬, 학생번호/이름 검색, 매트릭스, 반 통계 -->
        <div class="flex items-center justify-between mb-3 flex-wrap gap-3 bg-slate-800/50 p-3.5 rounded-2xl border border-slate-700/60 shadow-lg backdrop-blur-sm">
            <div class="flex items-center gap-3 flex-wrap flex-1 min-w-70">
                <div class="text-sm text-text-muted">
                    <span class="text-white font-bold text-base">학생 목록</span> (총 <span class="font-bold text-indigo-400">${ctx.students.length}</span>명)
                </div>

                <!-- 학생 검색창 (신호등 매트릭스급 실시간 검색) -->
                <div class="relative flex-1 max-w-xs min-w-50">
                    <span class="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                    </span>
                    <input id="dashboardStudentSearchInput" type="text"
                           class="w-full pl-9 pr-7 py-1.5 rounded-xl bg-slate-900/90 border border-slate-700 text-xs text-white ph-subtle focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all font-semibold"
                           placeholder="번호(1, 15) 또는 이름 검색..." />
                    <button id="clearDashboardSearchBtn" class="absolute inset-y-0 right-0 items-center pr-2.5 text-slate-400 hover:text-white cursor-pointer text-xs font-bold hidden" title="검색 지우기">✕</button>
                </div>

                <!-- 정렬 드롭다운 -->
                <select id="dashboardStudentSortSelect" class="rounded-xl bg-slate-900/90 border border-slate-700 text-xs text-white px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-semibold cursor-pointer">
                    <option value="num_asc">🔢 번호순 (오름차순)</option>
                    <option value="name_asc">🔤 성명순 (가나다)</option>
                    <option value="general_asc">🟢 일반계고 안정순 (석차백분율↑)</option>
                    <option value="general_desc">🔴 일반계고 위험순 (석차백분율↓)</option>
                    <option value="meister_desc">🏛️ 마이스터고 유망순</option>
                    <option value="special_desc">🏭 특성화고 유망순</option>
                </select>
            </div>

            <!-- 우측 액션 버튼들 -->
            <div class="flex gap-2 flex-wrap items-center">
                <button id="refreshDashboardBtn" class="btn-secondary text-xs px-3 py-2 font-bold flex items-center gap-1.5 hover:border-sky-400/80 hover:text-sky-300 transition-all cursor-pointer" title="대시보드 학생 목록 및 상담 상태 새로고침">
                    <span class="text-xs">🔄</span>
                    <span>새로고침</span>
                </button>
                <button id="openMatrixBtn" class="btn-secondary text-xs px-3 py-2 font-bold flex items-center gap-1.5 hover:border-indigo-400/80 transition-all" title="우리 반 전체 고교별 신호등 매트릭스 보기">
                    <svg class="w-3.5 h-3.5 text-indigo-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
                    <span>신호등 매트릭스</span>
                </button>
                <button id="openClassApplicationSummaryBtn" class="btn-secondary text-xs px-3 py-2 font-bold flex items-center gap-1.5 hover:border-emerald-400/80 transition-all" title="우리 반 지원희망 통계">
                    <svg class="w-3.5 h-3.5 text-emerald-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 00-2-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path></svg>
                    <span>우리 반 통계</span>
                </button>
            </div>
        </div>

        <!-- 1:1 프라이버시 모드 안내 배너 (검색 시 자동 활성화) -->
        <div id="dashboardPrivacyBanner" class="hidden mb-3 px-4 py-2.5 rounded-xl bg-indigo-950/80 border border-indigo-500/60 shadow-md text-xs text-indigo-200"></div>

        <!-- 학생 목록 메인 테이블 -->
        <div class="overflow-x-auto rounded-2xl border border-slate-700/60 bg-slate-800/30 shadow-xl">
            <table class="w-full text-left border-collapse">
                <thead>
                    <tr class="bg-slate-800/90 text-text-muted text-sm border-b border-slate-700/70 select-none">
                        <th class="p-3.5 font-semibold text-center w-16">번호</th>
                        <th class="p-3.5 font-semibold text-center w-32">성명</th>
                        <th class="p-3.5 font-semibold text-center w-48">일반계고 합격 예측</th>
                        <th class="p-3.5 font-semibold text-center min-w-64">마이스터고 및 특성화고 합격 예측</th>
                        <th class="p-3.5 font-semibold text-center min-w-56">희망학교</th>
                        <th class="p-3.5 font-semibold text-center w-36">진학 상담</th>
                    </tr>
                </thead>
                <tbody id="dashboardStudentTableBody">
                </tbody>
            </table>
        </div>
        <div class="mt-3.5 text-xs text-text-muted flex items-center justify-between flex-wrap gap-2">
            <span class="text-slate-400">💡 <strong>프라이버시 보호 안내:</strong> 상담 시 상단 검색창에 학생 번호나 이름을 입력하면 해당 학생만 화면에 단독 노출되어 다른 학생들의 점수가 완벽히 가려집니다.</span>
            <span>* 일반고 지표는 3학년 1학기 성적 기준 간이 참고치이며, 정식 일반고 내신은 교육청 프로그램을 따릅니다.</span>
        </div>
    `;

    // 초기 테이블 렌더링
    ctx.updateDashboardTable();
}

// 학급 명렬표: 검색·정렬·도구 버튼 연결
function bindStudentListToolbar(ctx) {
    // 상단 검색창 이벤트 리스너
    const searchInput = document.getElementById('dashboardStudentSearchInput');
    const clearSearchBtn = document.getElementById('clearDashboardSearchBtn');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            ctx.currentSearchQuery = e.target.value;
            if (clearSearchBtn) {
                const hasQuery = Boolean(ctx.currentSearchQuery.trim());
                clearSearchBtn.classList.toggle('hidden', !hasQuery);
                clearSearchBtn.classList.toggle('flex', hasQuery);
            }
            ctx.updateDashboardTable();
        });
    }
    if (clearSearchBtn) {
        clearSearchBtn.addEventListener('click', () => {
            ctx.currentSearchQuery = '';
            if (searchInput) searchInput.value = '';
            clearSearchBtn.classList.add('hidden');
            clearSearchBtn.classList.remove('flex');
            ctx.updateDashboardTable();
        });
    }

    // 정렬 드롭다운 이벤트 리스너
    const sortSelect = document.getElementById('dashboardStudentSortSelect');
    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            ctx.currentSortMode = e.target.value;
            ctx.updateDashboardTable();
        });
    }

    // 대시보드 새로고침 버튼
    document.getElementById('refreshDashboardBtn')?.addEventListener('click', () => {
        notifyClassUpdated();
    });

    // 신호등 매트릭스 버튼
    document.getElementById('openMatrixBtn')?.addEventListener('click', () => {
        openModal('matrix', { classNum: ctx.classNum });
    });

    // 우리 반 통계 버튼
    document.getElementById('openClassApplicationSummaryBtn')?.addEventListener('click', () => {
        openModal('class-summary', { classNum: ctx.classNum });
    });
}
