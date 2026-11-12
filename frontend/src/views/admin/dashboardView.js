import { GetSchoolConfig, GetClassStatus } from '../../core/backend.js';
import logoUniversal from '../../assets/images/logo-universal.png';
import { updateAppWindowTitle } from '../../core/utils.js';
import { ScreenLockManager } from '../../core/screenLock.js';
import { showModalAlert, showModalConfirm, showModalPrompt } from '../../core/dialogs.js';
import { app } from '../../core/dom.js';
import { navigate, notifyLogout, openModal, requestScreenLock } from '../../core/navigation.js';
import { state } from '../../core/store.js';
import { renderAdmissionYearNotice } from './admissionYearNotice.js';
import { bindYearControls } from './yearControls.js';
import { bindHandoverControls } from './handoverControls.js';
import { admissionLabel, admissionLongLabel, admissionYearHint, currentAdmissionYear } from '../../core/admissionYear.js';

// ===== 화면 렌더링 함수들 =====



// ===== 관리자 모드 화면 =====
export async function renderAdminScreen(schoolName) {
    // 1. 학교 설정(학급수) 가져오기
    let classCount = 8; // 기본값
    let configuredYear = 0;
    try {
        const config = await GetSchoolConfig();
        classCount = config.classCount;
        configuredYear = config.admissionYear;
    } catch (e) {
        console.error("설정 불러오기 실패:", e);
    }

    // 2. 현재 저장된 학급별 데이터 상태 가져오기
    let status = {};
    let updateStatus = {};
    try {
        status = await GetClassStatus(classCount);
        if (window.go?.main?.App?.GetDataUpdateStatus) {
            updateStatus = await window.go.main.App.GetDataUpdateStatus();
        }
    } catch (e) {
        console.error("상태 불러오기 실패:", e);
    }

    // 학급 카드 HTML 생성
    let classCardsHTML = '';
    for (let i = 1; i <= classCount; i++) {
        const studentCount = status[i] || 0;
        const isDone = studentCount > 0;

        classCardsHTML += `
            <div class="p-4 rounded-xl border ${isDone ? 'border-success/30 bg-success/5' : 'border-slate-700/50 bg-slate-800/30'} flex justify-between items-center transition-all">
                <div class="font-bold text-lg">${i}반</div>
                <div class="text-sm flex items-center gap-2">
                    ${isDone
                ? `<span class="text-success font-medium">${studentCount}명 저장됨</span> <span class="text-xl">🟢</span>`
                : `<span class="text-text-muted">데이터 없음</span> <span class="text-xl opacity-50 grayscale">🔴</span>`
            }
                </div>
            </div>
        `;
    }

    // 데이터 연동 상태 바
    const totalStd = updateStatus.totalStudents || 0;
    const attCount = updateStatus.attendanceCount || 0;
    const volCount = updateStatus.volunteerCount || 0;

    let localVer = '0.5.5';
    try {
        localVer = await window.go.main.App.GetAppVersion();
    } catch (e) {
        console.warn(e);
    }

    app.className = 'wide-layout';
    updateAppWindowTitle('master');

    app.innerHTML = `
        <div class="glass-card p-6 md:p-8 w-full max-w-[1700px] mx-auto min-h-[85vh]">
            <!-- 헤더 영역 -->
            <div class="flex items-center justify-between mb-5 pb-4 border-b border-slate-700/50 flex-wrap gap-4">
                <div class="flex items-center gap-3 shrink-0">
                    <img src="${logoUniversal}" alt="로고" class="w-10 h-10 rounded-xl shadow-md border border-indigo-400/40 object-cover shrink-0" />
                    <div>
                        <h1 class="text-2xl font-black text-white flex items-center gap-2.5 whitespace-nowrap">
                            나이스 자료·학년도 관리
                            <span class="text-xs bg-slate-800 text-indigo-300 px-2.5 py-0.5 rounded-full border border-indigo-500/30 font-mono font-bold">v${localVer}</span>
                        </h1>
                        <p class="text-text-muted text-xs mt-0.5 whitespace-nowrap">${schoolName} (총 ${classCount}학급)</p>
                    </div>
                </div>
                <div class="flex items-center gap-2.5 flex-wrap">
                    ${state.currentUser && state.currentUser.Role === 'master' ? `
                    <button id="goToTeacherBtn" class="btn-primary px-4 py-2 rounded-xl font-bold text-xs inline-flex items-center gap-1.5 shadow-md hover:brightness-110 transition-all" style="width: auto;">
                        👩‍🏫 진학 상담 모드
                    </button>
                    ` : ''}
                    <button id="lockScreenAdminBtn" class="btn-secondary text-xs px-3.5 py-2 font-bold inline-flex items-center gap-1.5 rounded-xl text-amber-300 hover:text-amber-200 border-amber-500/30 hover:bg-amber-500/10 cursor-pointer transition-all" style="width: auto;" title="자리를 비우실 때 화면을 즉시 잠그고 학생 성적을 보호합니다 (단축키: Ctrl+L)">
                        <span>🔒</span> 화면 잠금
                    </button>
                    <button id="openAdminGuideBtn" class="btn-secondary text-xs px-3.5 py-2 font-bold inline-flex items-center gap-1.5 rounded-xl" style="width: auto;" title="프로그램 사용 설명서 열기">
                        <span>📖</span> 사용 설명서
                    </button>
                    <button id="backBtn" class="btn-secondary text-xs px-3.5 py-2 font-bold inline-flex items-center gap-1.5 rounded-xl text-slate-300 hover:text-white" style="width: auto;">
                        <span>🚪</span> 로그아웃
                    </button>
                </div>
            </div>

            <!-- 학년부장 전용 관리 도구 바 -->
            ${state.currentUser && state.currentUser.Role === 'master' ? `
            <div class="mb-5 p-3.5 rounded-2xl bg-slate-800/80 border border-slate-700/60 shadow-lg flex flex-wrap items-center justify-between gap-3">
                <div class="flex items-center gap-2 text-xs font-bold text-indigo-200 whitespace-nowrap">
                    <span class="text-base">🛠️</span>
                    <span>학년부장 관리 도구:</span>
                </div>
                <div class="flex items-center gap-2 flex-wrap">
                    <!-- 신호등 매트릭스, 지원현황 및 원서대장 -->
                    <button id="openAdminMatrixBtn" class="btn-secondary text-xs px-3 py-1.5 rounded-lg font-bold inline-flex items-center gap-1.5 hover:border-indigo-400/50 text-indigo-300 hover:text-white" style="width: auto;" title="전교생 관내 고교별 신호등 매트릭스 종합 조회">
                        📊 신호등 매트릭스
                    </button>
                    <button id="openAdminSchoolStatsBtn" class="btn-secondary text-xs px-3 py-1.5 rounded-lg font-bold inline-flex items-center gap-1.5 hover:border-indigo-400/50" style="width: auto;" title="우리학교 고교별 지원현황 및 학교 통계">
                        🏫 우리학교 지원현황
                    </button>
                    <button id="openAdminRegisterBtn" class="btn-secondary text-xs px-3 py-1.5 rounded-lg font-bold inline-flex items-center gap-1.5 hover:border-indigo-400/50" style="width: auto;" title="학교 내부 원서대장 출력">
                        🖨️ 원서대장
                    </button>
                    <span class="text-slate-600 hidden sm:inline">|</span>
                    <!-- 취합 및 보관 -->
                    <button id="importPatchBtn" class="btn-secondary text-xs px-3 py-1.5 rounded-lg font-bold inline-flex items-center gap-1.5 hover:border-emerald-400/50 text-emerald-300" style="width: auto;" title="담임교사가 제출한 취합자료(.kkomipatch) 병합">
                        📥 취합자료병합
                    </button>
                    <button id="handoverExportBtn" class="btn-secondary text-xs px-3 py-1.5 rounded-lg font-bold inline-flex items-center gap-1.5 hover:border-amber-400/50 text-amber-300" style="width: auto;" title="다음 학년도 학년부장에게 넘길 입시 자료(학생 개인정보 없음)">
                        📦 인수인계 파일
                    </button>
                    <button id="handoverImportBtn" class="btn-secondary text-xs px-3 py-1.5 rounded-lg font-bold inline-flex items-center gap-1.5 hover:border-emerald-400/50 text-emerald-300" style="width: auto;" title="작년 인수인계 파일(또는 이전 버전 최종 보관본)에서 입시 자료만 가져옵니다">
                        📥 지난 학년도 입시 자료 가져오기
                    </button>
                    <span class="text-slate-600 hidden sm:inline">|</span>
                    <!-- 연도 전환 및 초기화 -->
                    <button id="changeAdmissionYearBtn" class="text-sky-300/90 border border-sky-500/30 hover:bg-sky-500/10 transition-colors cursor-pointer text-xs px-2.5 py-1.5 rounded-lg font-bold inline-flex items-center gap-1" style="width: auto;" title="학생 자료는 그대로 두고 학교 설정의 고입 연도만 바꿉니다">📅 고입 연도 변경</button>
                    <button id="changeClassCountBtn" class="text-sky-300/90 border border-sky-500/30 hover:bg-sky-500/10 transition-colors cursor-pointer text-xs px-2.5 py-1.5 rounded-lg font-bold inline-flex items-center gap-1" style="width: auto;" title="학급 수를 바꿉니다. 늘어난 반은 담임 계정을 새로 만들고 줄어든 반의 담임 계정은 정리합니다">🏫 학급 수 변경</button>
                    <button id="resetYearBtn" class="text-amber-400/90 border border-amber-500/30 hover:bg-amber-500/10 transition-colors cursor-pointer text-xs px-2.5 py-1.5 rounded-lg font-bold inline-flex items-center gap-1" style="width: auto;" title="커트라인은 보존하고 학생 성적·출결·봉사 자료를 비운 뒤 새 고입 연도로 시작합니다">
                        🔄 새 학년 시작
                    </button>
                    <button id="resetDataBtn" class="text-rose-400/90 border border-rose-500/30 hover:bg-rose-500/10 transition-colors cursor-pointer text-xs px-2.5 py-1.5 rounded-lg font-bold inline-flex items-center gap-1" style="width: auto;">
                        전체 초기화
                    </button>
                </div>
            </div>
            ` : ''}

            <!-- 데이터 연동 현황 바 -->
            <div class="mb-4 p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div class="font-bold text-slate-300">📊 데이터 연동 현황:</div>
                <div class="flex items-center gap-4 flex-wrap">
                    <span class="inline-flex items-center gap-1.5 ${totalStd > 0 ? 'text-success' : 'text-slate-400'}">
                        ${totalStd > 0 ? '✅' : '⚪'} 교과성적: <strong>${totalStd}명</strong>
                    </span>
                    <span class="inline-flex items-center gap-1.5 ${attCount > 0 ? 'text-success' : 'text-slate-400'}">
                        ${attCount > 0 ? '✅' : '⚪'} 출결: <strong>${attCount}명</strong>
                    </span>
                    <span class="inline-flex items-center gap-1.5 ${volCount > 0 ? 'text-success' : 'text-slate-400'}">
                        ${volCount > 0 ? '✅' : '⚪'} 봉사: <strong>${volCount}명</strong>
                    </span>
                </div>
            </div>

            <!-- 필수 사전 검증 권장 안내 배너 -->
            <div class="mb-6 p-4 rounded-2xl bg-amber-950/40 border border-amber-500/40 flex items-start gap-3.5 shadow-sm break-keep-all select-none">
                <span class="text-2xl mt-0.5">💡</span>
                <div class="text-xs sm:text-sm leading-relaxed text-amber-200">
                    <strong class="text-amber-100 font-bold mb-1 text-sm sm:text-base flex items-center gap-1.5">
                        <span>[필수 사전 검증 권장]</span> 본격적인 진학 상담 전, 고교 공식 산출 프로그램과 계산값을 꼭 대조해 보세요!
                    </strong>
                    고등학교별 전형 요강 및 가산점 세부 산출식은 매년 미세한 차이가 있을 수 있습니다. 나이스 엑셀 연동 후, 표본 학생 1~2명의 성적을 <strong>지원 희망 고등학교의 공식 산출 프로그램(또는 산출표)</strong>에 직접 입력하여 <strong>본 프로그램의 계산값과 100% 일치하는지 반드시 사전 대조·검증</strong>하신 후 상담에 활용하시기 바랍니다.
                </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                <!-- 왼쪽 패널 (액션) -->
                <div class="space-y-4">
                    ${state.currentUser && state.currentUser.Role === 'master' ? `
                    <div class="p-5 rounded-xl bg-slate-800/50 border border-slate-700/50">
                        <h3 class="font-bold mb-1.5 flex items-center gap-2">
                            <span>📥</span> 나이스 엑셀 데이터 연동
                        </h3>
                        <p class="text-xs text-text-muted mb-4 leading-relaxed">
                            순서대로 1 ➡️ 2 ➡️ 3단계 파일을 업로드하세요. 파일 선택 창에서 <strong>모든 반 파일을 한 번에 다중 선택(Ctrl 또는 Shift 키)</strong>하시면 전 학급이 일괄 연동됩니다.
                        </p>
                        <div class="space-y-2.5">
                            <!-- 1단계: 교과 성적 -->
                            <button id="uploadExcelBtn" class="btn-primary w-full py-3 px-4 flex items-center justify-between text-xs font-bold shadow-md hover:brightness-110 transition-all rounded-xl border border-indigo-400/40 cursor-pointer">
                                <div class="flex items-center gap-2.5">
                                    <span class="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-xs font-black">1</span>
                                    <span class="text-sm">📚 교과 성적 엑셀 (모든 반 일괄 선택)</span>
                                </div>
                                <span class="text-[11px] font-semibold ${totalStd > 0 ? 'text-emerald-300' : 'text-indigo-200'}">${totalStd > 0 ? '✅ 연동됨' : '필수'}</span>
                            </button>

                            <!-- 2단계: 출결 현황 -->
                            <button id="uploadAttendanceBtn" class="w-full py-3 px-4 flex items-center justify-between text-xs font-bold shadow-md hover:brightness-110 transition-all rounded-xl border border-sky-500/40 cursor-pointer text-white"
                                    style="background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);">
                                <div class="flex items-center gap-2.5">
                                    <span class="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-xs font-black">2</span>
                                    <span class="text-sm">📅 출결 현황 엑셀 (모든 반 일괄 선택)</span>
                                </div>
                                <span class="text-[11px] font-semibold ${attCount > 0 ? 'text-emerald-300' : 'text-sky-200'}">${attCount > 0 ? '✅ 연동됨' : '비교과'}</span>
                            </button>

                            <!-- 3단계: 봉사활동 실적 -->
                            <button id="uploadVolunteerBtn" class="w-full py-3 px-4 flex items-center justify-between text-xs font-bold shadow-md hover:brightness-110 transition-all rounded-xl border border-emerald-500/40 cursor-pointer text-white"
                                    style="background: linear-gradient(135deg, #059669 0%, #047857 100%);">
                                <div class="flex items-center gap-2.5">
                                    <span class="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-xs font-black">3</span>
                                    <span class="text-sm">🕒 봉사활동 엑셀 (모든 반 일괄 선택)</span>
                                </div>
                                <span class="text-[11px] font-semibold ${volCount > 0 ? 'text-emerald-300' : 'text-emerald-200'}">${volCount > 0 ? '✅ 연동됨' : '비교과'}</span>
                            </button>
                        </div>
                        <div id="uploadStatus" class="mt-3 text-xs text-center hidden"></div>
                    </div>
                    <div class="mode-card" id="cutoffBtn">
                        <span class="icon">🎯</span>
                        <div class="title">고교별 커트라인 관리</div>
                        <div class="desc">커트라인 입력 및 서버 데이터 전송</div>
                    </div>

                    <div class="mode-card" id="userManagementBtn">
                        <span class="icon">👥</span>
                        <div class="title">사용자 및 권한 관리</div>
                        <div class="desc">담임 및 진로부장 계정 비밀번호 설정</div>
                    </div>
                    ` : `
                    <div class="p-5 rounded-xl bg-slate-800/50 border border-slate-700/50 text-center text-text-muted py-10">
                        <span class="text-2xl block mb-2">👁️</span>
                        조회 전용 계정입니다.
                    </div>
                    `}
                </div>

                <!-- 오른쪽 패널 (데이터 현황) -->
                <div class="md:col-span-2">
                    <h3 class="font-bold mb-4 flex items-center justify-between">
                        <span>학급별 데이터 현황</span>
                        <button id="refreshBtn" class="btn-secondary text-xs px-3 py-1 font-bold inline-flex items-center gap-1" style="width: auto;"><span>🔄</span> 새로고침</button>
                    </h3>
                    <div class="grid grid-cols-2 gap-3" id="classGrid">
                        ${classCardsHTML}
                    </div>
                </div>
            </div>
        </div>
    `;

    // 이벤트 바인딩
    ScreenLockManager.resetTimer();
    renderAdmissionYearNotice(app.querySelector('.glass-card'), configuredYear, schoolName);

    document.getElementById('lockScreenAdminBtn')?.addEventListener('click', () => {
        requestScreenLock('수동 잠금');
    });

    document.getElementById('backBtn').addEventListener('click', async () => {
        ScreenLockManager.clearTimer();
        await window.go.main.App.Logout?.().catch(() => { });
        notifyLogout();
        updateAppWindowTitle();
        navigate('login', { schoolName });
    });

    document.getElementById('openAdminGuideBtn')?.addEventListener('click', () => {
        openModal('guide', { role: 'master' });
    });

    document.getElementById('goToTeacherBtn')?.addEventListener('click', () => {
        navigate('teacher', { schoolName, classNum: null });
    });

    // 학급 수 변경·새 학년 시작·전체 초기화(별도 모듈)
    bindYearControls({ schoolName, classCount, rerender: () => renderAdminScreen(schoolName) });

    document.getElementById('refreshBtn').addEventListener('click', () => {
        renderAdminScreen(schoolName);
    });

    document.getElementById('openAdminMatrixBtn')?.addEventListener('click', () => openModal('matrix', { classNum: null }));
    document.getElementById('openAdminSchoolStatsBtn')?.addEventListener('click', () => openModal('application-summary'));
    document.getElementById('openAdminRegisterBtn')?.addEventListener('click', () => openModal('register'));
    document.getElementById('openAdminAnalysisBtn')?.addEventListener('click', () => openModal('admission-analysis'));
    document.getElementById('openSharedAdmissionBtn')?.addEventListener('click', () => openModal('shared-admission'));

    // 인수인계 파일 내보내기·지난 학년도 입시 자료 가져오기(별도 모듈)
    bindHandoverControls({ rerender: () => renderAdminScreen(schoolName) });

    document.getElementById('uploadExcelBtn').addEventListener('click', async () => {
        const btn = document.getElementById('uploadExcelBtn');
        const statusDiv = document.getElementById('uploadStatus');

        try {
            // 복수 엑셀 파일 동시 선택 다이얼로그 호출 (Ctrl / Shift 지원)
            let filePaths = await window.go.main.App.OpenMultipleExcelFiles('나이스 교과 성적 엑셀 파일 선택 (Ctrl 또는 Shift 키로 모든 반 파일 동시 선택 가능)');
            if (!filePaths || filePaths.length === 0) return;

            // UI 업데이트
            btn.disabled = true;
            btn.innerHTML = `<span class="spinner"></span> <span>${filePaths.length}개 반 분석 중...</span>`;
            statusDiv.className = 'mt-3 text-xs text-center text-warning font-bold';
            statusDiv.textContent = `선택된 ${filePaths.length}개 엑셀 파일의 성적 데이터를 분석하고 저장하는 중입니다...`;
            statusDiv.classList.remove('hidden');

            // 엑셀 파싱 및 분할 저장 호출
            const result = await window.go.main.App.ProcessMultipleExcel(filePaths);

            // 결과 메시지 구성
            let processedClasses = Object.keys(result).length;
            let totalStudents = Object.values(result).reduce((a, b) => a + b, 0);

            btn.disabled = false;
            btn.innerHTML = '<span class="text-sm">📚 교과 성적 엑셀 (모든 반 일괄 선택)</span>';
            statusDiv.className = 'mt-3 text-xs text-center text-success font-bold';
            statusDiv.textContent = `🎉 성공! 총 ${filePaths.length}개 파일에서 ${processedClasses}개 학급, 총 ${totalStudents}명의 성적을 일괄 저장했습니다!`;

            // 화면 갱신을 위해 약간 대기 후 리렌더링
            setTimeout(() => {
                renderAdminScreen(schoolName);
            }, 1200);

        } catch (err) {
            btn.disabled = false;
            btn.innerHTML = '<span class="text-sm">📚 교과 성적 엑셀 (모든 반 일괄 선택)</span>';
            statusDiv.className = 'mt-3 text-xs text-center text-danger font-bold break-all';
            statusDiv.textContent = `오류 발생: ${err}`;
            statusDiv.classList.remove('hidden');
        }
    });

    document.getElementById('uploadAttendanceBtn')?.addEventListener('click', async () => {
        const btn = document.getElementById('uploadAttendanceBtn');
        const statusDiv = document.getElementById('uploadStatus');

        if (totalStd === 0) {
            await showModalAlert('1단계 [교과 성적 엑셀]을 먼저 불러와 학생 명단을 생성해 주세요.', '사전 필수 작업', 'warning');
            return;
        }

        try {
            let filePaths = await window.go.main.App.OpenMultipleExcelFiles('나이스 출결 현황 엑셀 파일 선택 (Ctrl 또는 Shift 키로 모든 반 파일 동시 선택 가능)');
            if (!filePaths || filePaths.length === 0) return;

            btn.disabled = true;
            btn.innerHTML = `<span class="spinner"></span> <span>${filePaths.length}개 반 분석 중...</span>`;
            statusDiv.className = 'mt-3 text-xs text-center text-warning font-bold';
            statusDiv.textContent = `선택된 ${filePaths.length}개 출결 데이터를 분석하고 연동하는 중입니다...`;
            statusDiv.classList.remove('hidden');

            const result = await window.go.main.App.ProcessMultipleAttendanceExcel(filePaths);

            let processedClasses = Object.keys(result).length;
            let totalStudents = Object.values(result).reduce((a, b) => a + b, 0);

            btn.disabled = false;
            btn.innerHTML = '<span class="text-sm">📅 출결 현황 엑셀 (모든 반 일괄 선택)</span>';
            statusDiv.className = 'mt-3 text-xs text-center text-success font-bold';
            statusDiv.textContent = `🎉 성공! 총 ${filePaths.length}개 파일에서 ${processedClasses}개 학급, 총 ${totalStudents}명 출결 연동 완료!`;

            // 상단 데이터 연동 현황판 갱신
            setTimeout(() => {
                renderAdminScreen(schoolName);
            }, 1200);
        } catch (err) {
            btn.disabled = false;
            btn.innerHTML = '<span class="text-sm">📅 출결 현황 엑셀 (모든 반 일괄 선택)</span>';
            statusDiv.className = 'mt-3 text-xs text-center text-danger font-bold break-all';
            statusDiv.textContent = `출결 오류: ${err}`;
            statusDiv.classList.remove('hidden');
        }
    });

    document.getElementById('uploadVolunteerBtn')?.addEventListener('click', async () => {
        const btn = document.getElementById('uploadVolunteerBtn');
        const statusDiv = document.getElementById('uploadStatus');

        if (totalStd === 0) {
            await showModalAlert('1단계 [교과 성적 엑셀]을 먼저 불러와 학생 명단을 생성해 주세요.', '사전 필수 작업', 'warning');
            return;
        }

        try {
            let filePaths = await window.go.main.App.OpenMultipleExcelFiles('나이스 봉사활동 엑셀 파일 선택 (Ctrl 또는 Shift 키로 모든 반 파일 동시 선택 가능)');
            if (!filePaths || filePaths.length === 0) return;

            btn.disabled = true;
            btn.innerHTML = `<span class="spinner"></span> <span>${filePaths.length}개 반 분석 중...</span>`;
            statusDiv.className = 'mt-3 text-xs text-center text-warning font-bold';
            statusDiv.textContent = `선택된 ${filePaths.length}개 봉사활동 데이터를 분석하고 연동하는 중입니다...`;
            statusDiv.classList.remove('hidden');

            const result = await window.go.main.App.ProcessMultipleVolunteerExcel(filePaths);

            let processedClasses = Object.keys(result).length;
            let totalStudents = Object.values(result).reduce((a, b) => a + b, 0);

            btn.disabled = false;
            btn.innerHTML = '<span class="text-sm">🕒 봉사활동 엑셀 (모든 반 일괄 선택)</span>';
            statusDiv.className = 'mt-3 text-xs text-center text-success font-bold';
            statusDiv.textContent = `🎉 성공! 총 ${filePaths.length}개 파일에서 ${processedClasses}개 학급, 총 ${totalStudents}명 봉사 연동 완료!`;

            // 상단 데이터 연동 현황판 갱신
            setTimeout(() => {
                renderAdminScreen(schoolName);
            }, 1200);
        } catch (err) {
            btn.disabled = false;
            btn.innerHTML = '<span class="text-sm">🕒 봉사활동 엑셀 (모든 반 일괄 선택)</span>';
            statusDiv.className = 'mt-3 text-xs text-center text-danger font-bold break-all';
            statusDiv.textContent = `봉사 오류: ${err}`;
            statusDiv.classList.remove('hidden');
        }
    });

    document.getElementById('cutoffBtn')?.addEventListener('click', () => {
        navigate('cutoff', { schoolName });
    });

    document.getElementById('userManagementBtn')?.addEventListener('click', () => {
        navigate('users', { schoolName });
    });

    document.getElementById('syncBtn')?.addEventListener('click', () => {
        navigate('sync', { schoolName });
    });

    document.getElementById('importPatchBtn')?.addEventListener('click', () => {
        openModal('patch-import', { schoolName });
    });

}
