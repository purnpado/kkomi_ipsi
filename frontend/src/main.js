import './style.css';
import './app.css';

import { CheckSetupComplete, GetSchoolConfig, VerifyAdminPassword, SyncWithServer, GetAppVersion, OpenExcelFile, ProcessExcel, GetClassStatus, GetClassGrades } from '../wailsjs/go/main/App';
import middleSchools from './assets/middleschools.json';
import logoUniversal from './assets/images/logo-universal.png';

import { escapeHtml, escapeAttr, updateAppWindowTitle, normalizeSchoolName, normalizeDept, normalizeTrack, isSameTrack } from './core/utils.js';
import { ScreenLockManager } from './core/screenLock.js';
import { showModalAlert, showModalConfirm, showModalPrompt, initGlobalEscapeHandler } from './core/dialogs.js';
import { delay, checkUpdateOnStartup, openExternalUrlSafe, quitAppSafe, showStartupUpdateModal, FEEDBACK_BOARD_URL, GITHUB_RELEASE_URL } from './core/updater.js';
import { printOnly } from './print/printEngine.js';
import { renderGuideModal } from './modals/guideModal.js';
import { openMatrixModal } from './modals/matrixModal.js';
import { openStudentApplicationModal } from './modals/studentApplicationModal.js';
import { openStudentTranscriptModal } from './modals/studentTranscriptModal.js';
import {
    openApplicationRegisterModal,
    openApplicantDetailModal,
    buildSmartApplicationGroups,
    openClassApplicationSummaryModal,
    openApplicationSummaryModal
} from './modals/applicationSummaryModal.js';
import { openSharedAdmissionModal } from './modals/sharedAdmissionModal.js';
import {
    renderFirstRunScreen,
    renderSetupScreen,
    handleSetupSubmit,
    renderSyncScreen,
    performSync,
    updateSyncStep,
    showSyncComplete,
    showSyncFailed,
    renderModeSelectScreen,
    renderAdminLoginScreen,
    renderAgreementModal,
    renderLoginScreen,
    renderPasswordChangeScreen
} from './views/auth/authViews.js';
import { eventBus, EVENTS } from './core/eventBus.js';

// 화면 잠금 및 전역 ESC 핸들러 초기화
ScreenLockManager.init();
initGlobalEscapeHandler();

// 중앙 이벤트 버스 구독 연결 (이벤트 기반 아키텍처)
eventBus.on(EVENTS.NAVIGATE, (detail) => {
    if (!detail) return;
    const schoolName = detail.schoolName || '';
    switch (detail.screen) {
        case 'teacher':
            renderTeacherScreen(schoolName, detail.classNum ?? null);
            break;
        case 'admin':
            renderAdminScreen(schoolName);
            break;
        case 'login':
            renderLoginScreen(schoolName);
            break;
        case 'mode-select':
            renderModeSelectScreen(schoolName);
            break;
        case 'setup':
            renderSetupScreen(detail.config ?? null);
            break;
    }
});

eventBus.on(EVENTS.OPEN_MODAL, (detail) => {
    if (!detail) return;
    switch (detail.modal) {
        case 'matrix':
            openMatrixModal(detail.classNum ?? null);
            break;
        case 'transcript':
            openStudentTranscriptModal(detail.classNum, detail.studentNum, detail.name);
            break;
        case 'application':
            openStudentApplicationModal(detail.classNum, detail.studentNum, detail.name, detail.preset ?? null);
            break;
        case 'student':
            openStudentModal(detail.classNum, detail.studentNum, detail.name);
            break;
        case 'guide':
            renderGuideModal(detail.role || 'homeroom');
            break;
        case 'register':
            openApplicationRegisterModal();
            break;
        case 'class-summary':
            openClassApplicationSummaryModal(detail.classNum);
            break;
        case 'application-summary':
            openApplicationSummaryModal();
            break;
        case 'shared-admission':
            openSharedAdmissionModal();
            break;
    }
});

eventBus.on(EVENTS.SHARED_ADMISSION, () => {
    openSharedAdmissionModal();
});
window.openSharedAdmissionModal = openSharedAdmissionModal;

eventBus.on(EVENTS.SCREEN_LOCK, () => {
    ScreenLockManager.lockScreen('이벤트');
});

const app = document.querySelector('#app');

// 구버전 localStorage 캐시 잔재 원천 삭제 (새 폴더 설치 시 오염 방지)
try {
    localStorage.removeItem('publicOfficialCutoffData');
} catch (_) {}

// 현재 로그인한 사용자 세션 (role, classNum, username 등 저장)
window.currentUser = null;





// ===== 화면 렌더링 함수들 =====



// ===== 관리자 모드 화면 =====
async function renderAdminScreen(schoolName) {
    // 1. 학교 설정(학급수) 가져오기
    let classCount = 8; // 기본값
    try {
        const config = await GetSchoolConfig();
        classCount = config.classCount;
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
                            관리자 대시보드
                            <span class="text-xs bg-slate-800 text-indigo-300 px-2.5 py-0.5 rounded-full border border-indigo-500/30 font-mono font-bold">v${localVer}</span>
                        </h1>
                        <p class="text-text-muted text-xs mt-0.5 whitespace-nowrap">${schoolName} (총 ${classCount}학급)</p>
                    </div>
                </div>
                <div class="flex items-center gap-2.5 flex-wrap">
                    ${window.currentUser && window.currentUser.Role === 'master' ? `
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
            ${window.currentUser && window.currentUser.Role === 'master' ? `
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
                    <button id="importPatchBtn" class="btn-secondary text-xs px-3 py-1.5 rounded-lg font-bold inline-flex items-center gap-1.5 hover:border-emerald-400/50 text-emerald-300" style="width: auto;" title="담임교사가 제출한 취합자료(.phgcpatch) 병합">
                        📥 취합자료병합
                    </button>
                    <button id="finalArchiveBtn" class="btn-secondary text-xs px-3 py-1.5 rounded-lg font-bold inline-flex items-center gap-1.5 hover:border-amber-400/50 text-amber-300" style="width: auto;" title="입시 종료 후 암호화 보관본 생성">
                        🗄️ 최종 보관본
                    </button>
                    <span class="text-slate-600 hidden sm:inline">|</span>
                    <!-- 연도 전환 및 초기화 -->
                    <button id="resetYearBtn" class="text-amber-400/90 border border-amber-500/30 hover:bg-amber-500/10 transition-colors cursor-pointer text-xs px-2.5 py-1.5 rounded-lg font-bold inline-flex items-center gap-1" style="width: auto;" title="커트라인은 유지하고 학생 데이터만 삭제">
                        📅 입시년도 전환
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
                    ${window.currentUser && window.currentUser.Role === 'master' ? `
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

    document.getElementById('lockScreenAdminBtn')?.addEventListener('click', () => {
        ScreenLockManager.lockScreen('수동 잠금');
    });

    document.getElementById('backBtn').addEventListener('click', async () => {
        ScreenLockManager.clearTimer();
        await window.go.main.App.Logout?.().catch(() => { });
        window.currentUser = null; // 로그아웃
        updateAppWindowTitle();
        renderLoginScreen(schoolName);
    });

    document.getElementById('openAdminGuideBtn')?.addEventListener('click', () => {
        renderGuideModal('master');
    });

    document.getElementById('goToTeacherBtn')?.addEventListener('click', () => {
        renderTeacherScreen(schoolName, null);
    });

    document.getElementById('resetYearBtn')?.addEventListener('click', async () => {
        const nextYear = await showModalPrompt({
            title: '새 입시학년도 전환',
            message: '전환할 새 입시학년도를 입력하세요 (예: 2028):',
            defaultValue: String(new Date().getFullYear() + 1),
            placeholder: '2028'
        });
        if (!nextYear) return;

        const confirmed = await showModalConfirm({
            title: '입시학년도 전환 확인',
            message: `입시년도를 [${nextYear}학년도]로 전환하시겠습니까?\n\n※ 고교별 커트라인 데이터는 안전하게 보존되며, 학생들의 성적/출결/봉사 데이터만 깔끔하게 초기화됩니다.`,
            confirmText: '전환하기',
            type: 'warning'
        });
        if (confirmed) {
            try {
                await window.go.main.App.ResetAcademicYear(parseInt(nextYear));
                await showModalAlert(`${nextYear}학년도로 성공적으로 전환되었습니다!`, '전환 완료', 'success');
                renderAdminScreen(schoolName);
            } catch (err) {
                await showModalAlert("입시년도 전환 실패: " + err, '오류', 'error');
            }
        }
    });

    document.getElementById('resetDataBtn')?.addEventListener('click', async () => {
        const confirmed = await showModalConfirm({
            title: '전체 데이터 초기화',
            message: "정말 모든 데이터를 완전 초기화하시겠습니까?\n학교 설정과 업로드된 모든 성적 파일이 삭제되며 되돌릴 수 없습니다.",
            confirmText: '완전 초기화',
            type: 'error'
        });
        if (confirmed) {
            try {
                await window.go.main.App.ResetAllData();
                await showModalAlert("모든 데이터가 초기화되었습니다. 프로그램이 재시작됩니다.", '초기화 완료', 'success');
                window.location.reload();
            } catch (err) {
                await showModalAlert("데이터 초기화 실패: " + err, '오류', 'error');
            }
        }
    });

    document.getElementById('refreshBtn').addEventListener('click', () => {
        renderAdminScreen(schoolName);
    });

    document.getElementById('openAdminMatrixBtn')?.addEventListener('click', () => openMatrixModal(null));
    document.getElementById('openAdminSchoolStatsBtn')?.addEventListener('click', openApplicationSummaryModal);
    document.getElementById('openAdminRegisterBtn')?.addEventListener('click', openApplicationRegisterModal);
    document.getElementById('openSharedAdmissionBtn')?.addEventListener('click', openSharedAdmissionModal);

    document.getElementById('finalArchiveBtn')?.addEventListener('click', async () => {
        const password = await showModalPrompt({
            title: '최종 보관본 생성',
            message: '최종 보관본을 보호할 새 암호를 입력하세요.\n이 암호는 복원할 때 반드시 필요하며 공용 데이터 암호와 별도로 안전하게 보관하세요.',
            isPassword: true
        });
        if (!password) return;
        const confirmPassword = await showModalPrompt({
            title: '암호 재확인',
            message: '보관본 암호를 한 번 더 입력하세요.',
            isPassword: true
        });
        if (password !== confirmPassword) {
            return await showModalAlert('보관본 암호가 일치하지 않습니다.', '입력 불일치', 'warning');
        }
        try {
            const path = await window.go.main.App.SaveFinalArchive(password);
            if (path) {
                await showModalAlert(`암호화된 최종 보관본을 만들었습니다.\n${path}\n\n새 프로그램 폴더의 로그인 화면에서 복원할 수 있습니다.`, '보관본 생성 완료', 'success');
            }
        } catch (err) {
            await showModalAlert('최종 보관본 생성 실패: ' + err, '오류', 'error');
        }
    });

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
        renderCutoffScreen(schoolName);
    });

    document.getElementById('userManagementBtn')?.addEventListener('click', () => {
        renderUserManagementScreen(schoolName);
    });

    document.getElementById('syncBtn')?.addEventListener('click', () => {
        renderSyncScreen(schoolName);
    });

    document.getElementById('importPatchBtn')?.addEventListener('click', () => {
        openPatchImportModal(schoolName);
    });

}

// 담임교사 취합자료 병합 방식 선택 모달 (다중 파일 일괄 병합 vs 단일 파일 상세 검토)
function openPatchImportModal(schoolName) {
    document.getElementById('patchImportModeModal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'patchImportModeModal';
    modal.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-in fade-in duration-200';

    modal.innerHTML = `
        <div class="glass-card p-6 md:p-8 w-full max-w-xl space-y-5">
            <div class="flex justify-between items-start border-b border-slate-700/60 pb-3">
                <div>
                    <h2 class="text-xl font-black text-white flex items-center gap-2">
                        <span>📥</span> 담임교사 취합자료 병합
                    </h2>
                    <p class="text-xs text-text-muted mt-1">
                        각 학급 담임선생님이 제출한 취합 파일(<strong>.phgcpatch</strong>)을 학년부장 시스템에 반영합니다.
                    </p>
                </div>
                <button id="closePatchImportModeModal" class="text-2xl text-slate-400 hover:text-white transition-colors">×</button>
            </div>

            <div class="space-y-3.5">
                <!-- 옵션 1: 여러 반 일괄 병합 (다중 선택) -->
                <div id="btnBatchPatchMerge" class="p-4 rounded-2xl bg-indigo-950/40 border border-indigo-500/50 hover:bg-indigo-900/50 hover:border-indigo-400 cursor-pointer transition-all flex items-start gap-3.5 group shadow-md">
                    <div class="w-10 h-10 rounded-xl bg-indigo-600/30 border border-indigo-400/40 flex items-center justify-center text-xl shrink-0 group-hover:scale-110 transition-transform">
                        ⚡
                    </div>
                    <div class="space-y-1">
                        <div class="flex items-center gap-2">
                            <span class="text-sm font-bold text-white group-hover:text-indigo-200">여러 반 일괄 병합 (다중 선택 권장)</span>
                            <span class="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">추천</span>
                        </div>
                        <p class="text-xs text-slate-300/90 leading-relaxed">
                            파일 탐색기에서 <strong>Ctrl 또는 Shift 키를 누른 채</strong> 여러 반 파일(예: 1반~8반 취합본)을 한꺼번에 동시 선택하여 <strong>1초 만에 전교 일괄 병합</strong>합니다.
                        </p>
                    </div>
                </div>

                <!-- 옵션 2: 1개 반 상세 검토 병합 -->
                <div id="btnSinglePatchMerge" class="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/60 hover:bg-slate-700/60 hover:border-slate-500 cursor-pointer transition-all flex items-start gap-3.5 group shadow-sm">
                    <div class="w-10 h-10 rounded-xl bg-slate-700/50 border border-slate-600/50 flex items-center justify-center text-xl shrink-0 group-hover:scale-110 transition-transform">
                        🔍
                    </div>
                    <div class="space-y-1">
                        <span class="text-sm font-bold text-white group-hover:text-indigo-200">1개 반 상세 검토 병합 (체크박스 선택)</span>
                        <p class="text-xs text-slate-400 leading-relaxed">
                            특정 학급 1개 파일을 열어 학생별로 반영할 항목(출결, 봉사, 수기 가산점, 지원현황)을 직접 눈으로 검토하고 선택적으로 병합합니다.
                        </p>
                    </div>
                </div>
            </div>

            <div class="flex justify-end pt-3 border-t border-slate-700/60">
                <button id="closePatchImportModeModal2" class="btn-secondary text-xs px-4 py-2 font-bold" style="width: auto;">
                    닫기
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const closeModal = () => modal.remove();
    document.getElementById('closePatchImportModeModal')?.addEventListener('click', closeModal);
    document.getElementById('closePatchImportModeModal2')?.addEventListener('click', closeModal);

    // 1. 여러 반 일괄 병합 핸들러
    document.getElementById('btnBatchPatchMerge')?.addEventListener('click', async () => {
        const password = await showModalPrompt({
            title: '공용 데이터 암호 확인',
            message: '취합자료를 복호화할 공용 데이터 잠금 비밀번호를 입력하세요.',
            isPassword: true
        });
        if (!password) return;
        closeModal();

        try {
            const res = await window.go.main.App.OpenTeacherPatch(password);
            if (res && res.files > 0) {
                await showModalAlert({
                    title: '취합자료 일괄 병합 완료',
                    message: `선택하신 <strong>${res.files}개 학급 취합 파일</strong>에서 학생 <strong>${res.students}명</strong>의 최신 데이터가 성공적으로 일괄 병합되었습니다!`,
                    type: 'success'
                });
                renderAdminScreen(schoolName);
            }
        } catch (err) {
            await showModalAlert({
                title: '일괄 병합 실패',
                message: String(err),
                type: 'error'
            });
        }
    });

    // 2. 1개 반 상세 검토 병합 핸들러
    document.getElementById('btnSinglePatchMerge')?.addEventListener('click', async () => {
        const password = await showModalPrompt({
            title: '공용 데이터 암호 확인',
            message: '취합자료를 복호화할 공용 데이터 잠금 비밀번호를 입력하세요.',
            isPassword: true
        });
        if (!password) return;
        closeModal();

        try {
            const preview = await window.go.main.App.OpenTeacherPatchPreview(password);
            if (preview && preview.path) {
                openPatchMergeSelection(preview, password, schoolName);
            }
        } catch (err) {
            await showModalAlert({
                title: '취합자료 가져오기 실패',
                message: String(err),
                type: 'error'
            });
        }
    });
}

function openPatchMergeSelection(preview, password, schoolName) {
    document.getElementById('patchMergeSelectionModal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'patchMergeSelectionModal';
    modal.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4 overflow-y-auto';
    const items = (Array.isArray(preview.items) ? preview.items : []).slice().sort((a, b) => {
        const numA = parseInt(a.studentNum, 10) || 0;
        const numB = parseInt(b.studentNum, 10) || 0;
        return numA - numB;
    });
    const conflict = preview.hasRevisionConflict
        ? `<div class="rounded-xl border border-amber-500/50 bg-amber-500/10 p-3.5 text-sm text-amber-200 mb-4 flex items-start gap-2.5">
            <span class="text-base font-bold text-amber-400 mt-0.5">⚠</span>
            <div>
                <p class="font-bold text-amber-300">주의: 기초 배포본 버전 차이가 있습니다.</p>
                <p class="text-xs text-amber-200/90 mt-0.5">담임교사가 작업한 시점의 버전과 현재 학년부장 자료 버전에 차이가 있습니다. 덮어쓸 항목만 학생별로 신중히 체크한 후 병합하세요.</p>
            </div>
           </div>`
        : `<div class="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3.5 text-sm text-emerald-200 mb-4 flex items-start gap-2.5">
            <span class="text-base font-bold text-emerald-400 mt-0.5">✓</span>
            <div>
                <p class="font-bold text-emerald-300">담임 취합자료 확인 완료</p>
                <p class="text-xs text-emerald-200/90 mt-0.5">담임교사가 입력·제출한 학생별 변경 자료(출결·봉사·지원현황)가 현재 자료와 정상 호환됩니다. 반영할 항목을 선택한 뒤 하단 병합 버튼을 누르세요.</p>
            </div>
           </div>`;
    const rows = items.length ? items.map((item, index) => {
        const checks = [
            ['attendance', '출결', item.attendance], ['volunteer', '봉사', item.volunteer],
            ['extra', '수기 가산점', item.extra], ['applications', '지원현황', item.applications],
        ].filter(([, , available]) => available).map(([field, label]) => `<label class="inline-flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-xs"><input type="checkbox" class="patch-choice" data-index="${index}" data-field="${field}" checked> ${label}</label>`).join('');
        return `<tr class="border-b border-slate-700/60"><td class="p-3 text-center font-mono">${item.studentNum}</td><td class="p-3 font-bold">${item.studentName}</td><td class="p-3"><div class="flex flex-wrap gap-2">${checks || '<span class="text-text-muted">변경 항목 없음</span>'}</div></td></tr>`;
    }).join('') : '<tr><td colspan="3" class="p-8 text-center text-text-muted">확인할 변경 항목이 없습니다.</td></tr>';
    modal.innerHTML = `<div class="glass-card p-7 w-full max-w-4xl"><div class="flex justify-between items-start gap-4 mb-4"><div><h2 class="text-2xl font-bold text-white">📥 취합자료 선택 병합(학년부장)</h2><p class="text-sm text-text-muted mt-1">담임 계정 ${preview.sourceUsername} · ${preview.classNum}반 · 변경 학생 ${preview.changeCount}명</p></div><button id="closePatchMergeSelection" class="text-3xl text-text-muted">×</button></div>${conflict}<p class="text-xs text-text-muted mb-3">학생별로 가져올 항목만 선택합니다. 원본 수치와 학생 개인정보는 이 화면에 표시하지 않습니다.</p><div class="overflow-auto max-h-[55vh] border border-slate-700 rounded-xl"><table class="w-full text-sm"><thead class="sticky top-0 bg-slate-800"><tr><th class="p-3 w-16 text-center">번호</th><th class="p-3 w-28 text-left">학생</th><th class="p-3 text-left">가져올 항목</th></tr></thead><tbody>${rows}</tbody></table></div><div class="flex justify-end items-center gap-3 mt-6 pt-4 border-t border-slate-700/60"><button id="closePatchMergeSelection2" type="button" class="btn-secondary w-auto! px-5 py-2.5 rounded-xl font-bold text-xs whitespace-nowrap cursor-pointer hover:bg-slate-700 transition-all">취소</button><button id="applyPatchMergeSelection" type="button" class="btn-primary w-auto! px-6 py-2.5 rounded-xl font-bold text-xs whitespace-nowrap cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/30 hover:scale-[1.02] transition-all"><span>📥</span> 선택 항목 병합</button></div></div>`;
    document.body.appendChild(modal);
    const close = () => modal.remove();
    document.getElementById('closePatchMergeSelection').onclick = close;
    document.getElementById('closePatchMergeSelection2').onclick = close;
    document.getElementById('applyPatchMergeSelection').onclick = async () => {
        const selections = items.map((item, index) => ({
            studentNum: item.studentNum,
            attendance: modal.querySelector(`.patch-choice[data-index="${index}"][data-field="attendance"]`)?.checked || false,
            volunteer: modal.querySelector(`.patch-choice[data-index="${index}"][data-field="volunteer"]`)?.checked || false,
            extra: modal.querySelector(`.patch-choice[data-index="${index}"][data-field="extra"]`)?.checked || false,
            applications: modal.querySelector(`.patch-choice[data-index="${index}"][data-field="applications"]`)?.checked || false,
        }));
        if (!selections.some(item => item.attendance || item.volunteer || item.extra || item.applications)) {
            return showModalAlert({
                type: 'warning',
                title: '선택 항목 없음',
                message: '병합할 학생별 항목(출결, 봉사, 가산점, 지원현황)을 하나 이상 선택해주세요.'
            });
        }
        const button = document.getElementById('applyPatchMergeSelection');
        button.disabled = true;
        button.innerHTML = '<span class="spinner"></span> 병합 중...';
        try {
            const count = await window.go.main.App.ImportTeacherPatchSelected(password, preview.path, selections);
            close();
            renderAdminScreen(schoolName);
            await showModalAlert({
                type: 'success',
                title: '취합자료 병합 완료',
                message: `
                    <div class="space-y-3">
                        <p class="text-center text-slate-200">
                            총 <strong class="text-emerald-400 font-bold">${count}명</strong>의 선택 항목을 성공적으로 병합했습니다.
                        </p>
                        <div class="rounded-xl border border-indigo-500/30 bg-indigo-950/40 p-3.5 text-xs text-indigo-200 leading-relaxed">
                            <span class="font-bold text-indigo-300 block mb-1">📢 담임교사 재배포 안내</span>
                            • 병합된 최신 내용이 학년부장 시스템에 반영되었습니다.<br>
                            • 다른 담임교사에게 최신 취합본을 전달하시려면, <strong>[사용자 및 권한 관리]</strong> 메뉴에서 각 반의 <strong>'배포 자료 만들기'</strong>(.phgcpkg)를 실행하여 전달하시면 됩니다.
                        </div>
                    </div>
                `,
                confirmText: '확인'
            });
        } catch (err) {
            button.disabled = false;
            button.innerHTML = '<span>📥</span> 선택 항목 병합';
            await showModalAlert({
                type: 'error',
                title: '취합자료 병합 실패',
                message: err.message || String(err),
                confirmText: '확인'
            });
        }
    };
}

// ===== 일반고 지원가이드 판정 기준선 전역 헬퍼 (기본 80%) =====
function getGeneralGuideCutoff() {
    const val = localStorage.getItem('phgc_general_guide_cutoff');
    if (val !== null && !isNaN(parseFloat(val))) {
        return parseFloat(val);
    }
    return 80.0;
}

function setGeneralGuideCutoff(val) {
    localStorage.setItem('phgc_general_guide_cutoff', val);
    window.generalGuideCutoff = val;
}

function getGeneralGuideBadge(percentile) {
    const cutoff = getGeneralGuideCutoff();
    const border = Math.min(100, cutoff + 10.0);
    if (percentile <= cutoff) {
        return `<span class="inline-flex items-center justify-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-600 text-white border border-emerald-400 shadow-xs whitespace-nowrap">🟢 안정 (${percentile.toFixed(2)}%)</span>`;
    } else if (percentile <= border) {
        return `<span class="inline-flex items-center justify-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-500 text-slate-950 border border-amber-300 shadow-xs whitespace-nowrap">🟡 경계 (${percentile.toFixed(2)}%)</span>`;
    } else {
        return `<span class="inline-flex items-center justify-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-rose-600 text-white border border-rose-400 shadow-xs whitespace-nowrap">🔴 주의 (${percentile.toFixed(2)}%)</span>`;
    }
}
window.getGeneralGuideCutoff = getGeneralGuideCutoff;
window.setGeneralGuideCutoff = setGeneralGuideCutoff;
window.getGeneralGuideBadge = getGeneralGuideBadge;



// ===== 담임 교사 모드 화면 =====
async function renderTeacherScreen(schoolName, targetClassNum = null) {
    let classCount = 8;
    try {
        const config = await GetSchoolConfig();
        classCount = config.classCount;
    } catch (e) {
        console.error(e);
    }

    if (window.currentUser && window.currentUser.Role === 'homeroom') {
        // 담임인 경우 자기 반만 선택 가능
        const myClass = window.currentUser.ClassNum;
        targetClassNum = myClass; // 강제로 타겟 클래스 변경
    }
    let activeClassNum = null;

    let localVer = '0.5.6';
    try {
        localVer = await window.go.main.App.GetAppVersion();
    } catch (e) {
        console.warn(e);
    }

    app.className = 'wide-layout';

    // 학급 선택 바둑판 카드 그리드 렌더링 함수
    const getClassGridHTML = () => {
        let cards = '';
        const isHomeroom = window.currentUser && window.currentUser.Role === 'homeroom';
        const myClass = isHomeroom ? window.currentUser.ClassNum : null;

        for (let i = 1; i <= classCount; i++) {
            const isAccessible = !isHomeroom || (i === myClass);
            if (isAccessible) {
                cards += `
                    <div class="class-card-btn bg-slate-800/70 hover:bg-indigo-950/40 border-2 border-slate-700/60 hover:border-primary/80 rounded-2xl p-6 text-center cursor-pointer transition-all duration-200 group flex flex-col items-center justify-center gap-3 shadow-md"
                         data-class="${i}">
                        <div class="w-14 h-14 rounded-2xl bg-slate-700/60 text-indigo-300 group-hover:bg-primary group-hover:text-white flex items-center justify-center text-2xl font-black transition-all">
                            ${i}
                        </div>
                        <div>
                            <div class="text-lg font-bold text-white group-hover:text-primary transition-colors">3학년 ${i}반</div>
                            <div class="text-xs text-slate-400 mt-1">${isHomeroom ? '⭐ 내 담당 학급' : '진학 상담 및 성적 명단'}</div>
                        </div>
                        <span class="inline-flex items-center gap-1 text-xs text-primary font-bold mt-1 group-hover:translate-x-1 transition-transform">
                            학생 명단 열기 →
                        </span>
                    </div>
                `;
            } else {
                cards += `
                    <div class="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 text-center opacity-40 cursor-not-allowed flex flex-col items-center justify-center gap-3 select-none"
                         title="담당 학급(${myClass}반)만 열람하실 수 있습니다.">
                        <div class="w-14 h-14 rounded-2xl bg-slate-800 text-slate-500 flex items-center justify-center text-xl font-bold">
                            🔒
                        </div>
                        <div>
                            <div class="text-lg font-bold text-slate-400">3학년 ${i}반</div>
                            <div class="text-xs text-slate-500 mt-1">타 학급 열람 제한</div>
                        </div>
                        <span class="text-xs text-slate-600 font-medium mt-1">접근 불가</span>
                    </div>
                `;
            }
        }

        const isHomeroomMsg = isHomeroom
            ? `선생님의 담당 학급인 <strong class="text-indigo-300">3학년 ${myClass}반</strong>을 클릭하여 진학 상담을 시작하세요.`
            : `조회하고자 하는 학급 카드를 클릭하세요. (총 ${classCount}학급)`;

        return `
            <div class="max-w-5xl mx-auto py-8 space-y-6 fade-in">
                <div class="text-center space-y-2">
                    <h2 class="text-2xl font-black text-white flex items-center justify-center gap-2">
                        <span>🏫</span> 상담할 학급을 선택해 주세요
                    </h2>
                    <p class="text-sm text-text-muted">${isHomeroomMsg}</p>
                </div>
                <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 md:gap-5">
                    ${cards}
                </div>
            </div>
        `;
    };

    app.innerHTML = `
        <div class="glass-card p-6 md:p-8 w-full max-w-[1700px] mx-auto min-h-[85vh]">
            <div class="flex flex-wrap items-center justify-between mb-6 pb-4 border-b border-slate-700/50 gap-4">
                <div class="flex items-center gap-3 shrink-0">
                    <img src="${logoUniversal}" alt="로고" class="w-10 h-10 rounded-xl shadow-md border border-indigo-400/40 object-cover shrink-0" />
                    <div>
                        <h1 class="text-2xl font-black text-white flex items-center gap-2.5 whitespace-nowrap">
                            진학 상담 대시보드
                            <span class="text-xs bg-slate-800 text-indigo-300 px-2.5 py-0.5 rounded-full border border-indigo-500/30 font-mono font-bold">v${localVer}</span>
                        </h1>
                        <p class="text-text-muted text-xs mt-0.5 whitespace-nowrap">${schoolName}</p>
                    </div>
                </div>
                <div class="flex items-center gap-3 flex-wrap">
                    <!-- 일반고 지원가이드 판정 기준 커스텀 -->
                    <div class="flex items-center gap-1.5 bg-slate-800/80 px-2.5 py-1.5 rounded-lg border border-slate-700/80 shadow-inner">
                        <span class="text-xs text-slate-300 font-bold" title="기본값 80%. 각 학교 상황에 맞춰 일반고 합격 안정선 기준을 조정할 수 있습니다.">🎯 일반고 안정기준:</span>
                        <input type="number" id="generalGuideCutoffInput" min="50" max="99" step="1" 
                               class="w-14 text-center py-0.5 px-1 rounded bg-slate-900 border border-slate-600 text-indigo-300 text-xs font-bold outline-none" 
                               value="${getGeneralGuideCutoff()}" />
                        <span class="text-xs text-slate-400 font-bold">%</span>
                        <button id="saveGuideCutoffBtn" class="text-[11px] bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-0.5 rounded font-bold transition-colors cursor-pointer" title="클릭 시 전체 학생 판정이 즉시 갱신됩니다">적용</button>
                    </div>

                    <button id="classGridHomeBtn" class="btn-secondary whitespace-nowrap text-xs px-3 py-2 flex items-center gap-1.5" style="display: none;">
                        <span>🗂️</span> 학급 목록
                    </button>
                    <button id="exportCurrentClassPatchBtn" class="btn-secondary whitespace-nowrap text-xs px-3 py-2 flex items-center gap-1.5" title="현재 학급의 진학 상담 및 희망원서 취합자료(패치 파일)를 내보냅니다" style="display: none;">
                        <span>📤</span> 취합자료 내보내기
                    </button>
                    <button id="lockScreenTeacherBtn" class="btn-secondary whitespace-nowrap text-xs px-3 py-2 flex items-center gap-1.5 text-amber-300 hover:text-amber-200 border-amber-500/30 hover:bg-amber-500/10 cursor-pointer transition-all font-bold" title="자리를 비우실 때 화면을 즉시 잠그고 학생 개인정보를 보호합니다 (단축키: Ctrl+L)">
                        <span>🔒</span> 화면 잠금
                    </button>
                    <button id="openTeacherGuideBtn" class="btn-secondary whitespace-nowrap text-xs px-3 py-2 flex items-center gap-1.5" title="프로그램 사용 설명서 열기">
                        <span>📖</span> 사용 설명서
                    </button>
                    <button id="backBtn" class="btn-secondary whitespace-nowrap text-xs px-4 py-2.5">
                        ${window.currentUser && window.currentUser.Role === 'homeroom' ? '← 로그아웃' : '← 돌아가기'}
                    </button>
                </div>
            </div>

            <!-- 필수 사전 검증 권장 안내 배너 -->
            <div class="mb-6 p-4 rounded-2xl bg-amber-950/40 border border-amber-500/40 flex items-start gap-3.5 shadow-sm break-keep-all select-none">
                <span class="text-2xl mt-0.5">💡</span>
                <div class="text-xs sm:text-sm leading-relaxed text-amber-200">
                    <strong class="text-amber-100 font-bold mb-1 text-sm sm:text-base flex items-center gap-1.5">
                        <span>[필수 사전 검증 권장]</span> 학생·학부모 상담 전, 지원 희망 고교 공식 산출식과 계산값을 대조해 보세요!
                    </strong>
                    고교별 전형 요강(교과/출결/봉사 반영 비율 및 가산점)은 학교별로 상이할 수 있습니다. 1:1 진학 상담 전, 표본 학생의 성적을 <strong>지원 희망 고등학교의 공식 산출 프로그램</strong>에 입력하여 <strong>본 프로그램의 산출값과 일치하는지 반드시 사전 확인</strong> 후 상담에 임해 주시기 바랍니다.
                </div>
            </div>

            <div id="teacherContent">
                ${getClassGridHTML()}
            </div>
        </div>
    `;

    // 일반고 기준 적용 버튼 이벤트
    document.getElementById('saveGuideCutoffBtn')?.addEventListener('click', () => {
        const inputVal = parseFloat(document.getElementById('generalGuideCutoffInput').value);
        if (isNaN(inputVal) || inputVal < 10 || inputVal > 100) {
            alert('유효한 백분율(10~100 사이)을 입력해 주세요.');
            return;
        }
        setGeneralGuideCutoff(inputVal);
        alert(`후기 일반고 합격 안정선 기준이 [${inputVal}%]로 설정되었습니다.\n(경계선: ${Math.min(100, inputVal + 10)}%까지)`);
        const currentClass = activeClassNum;
        if (currentClass) {
            loadClass(currentClass);
        }
    });

    // 창 제목 역할 반영
    if (window.currentUser?.Role === 'homeroom') {
        updateAppWindowTitle('homeroom', window.currentUser.ClassNum);
    } else if (window.currentUser?.Role === 'viewer') {
        updateAppWindowTitle('viewer');
    } else if (window.currentUser?.Role === 'master') {
        if (targetClassNum) {
            updateAppWindowTitle('master', `3학년 ${targetClassNum}반`);
        } else {
            updateAppWindowTitle('master');
        }
    }

    // 학급 카드 클릭 시 학급 로드 함수
    const loadClass = async (classNum) => {
        const exportPatchBtn = document.getElementById('exportCurrentClassPatchBtn');
        if (!classNum) {
            activeClassNum = null;
            document.getElementById('classGridHomeBtn').style.display = 'none';
            if (exportPatchBtn) exportPatchBtn.style.display = 'none';
            document.getElementById('teacherContent').innerHTML = getClassGridHTML();
            bindGridEvents();
            if (window.currentUser?.Role === 'master') {
                updateAppWindowTitle('master');
            }
            return;
        }

        activeClassNum = classNum;
        if (window.currentUser?.Role === 'master') {
            updateAppWindowTitle('master', `3학년 ${classNum}반`);
        } else if (window.currentUser?.Role === 'homeroom') {
            updateAppWindowTitle('homeroom', classNum);
        }

        document.getElementById('classGridHomeBtn').style.display = 'inline-flex';
        // 담임교사가 학급에 진입했을 때만 취합자료 내보내기 버튼 표시 (학년부장은 담임 자료를 받는 관리자이므로 제외)
        if (exportPatchBtn) {
            exportPatchBtn.style.display = (window.currentUser?.Role === 'homeroom') ? 'inline-flex' : 'none';
        }
        document.getElementById('teacherContent').innerHTML = '<div class="text-center py-20"><span class="spinner"></span> 데이터를 불러오는 중...</div>';

        try {
            const students = await window.go.main.App.GetClassGrades(classNum);
            renderStudentList(students, classNum);
        } catch (err) {
            document.getElementById('teacherContent').innerHTML = `<div class="text-danger py-20 text-center font-bold">오류 발생: ${err}</div>`;
        }
    };
    window.refreshCurrentClass = () => { if (activeClassNum) loadClass(activeClassNum); };

    // 학급 카드 클릭 이벤트 바인딩
    const bindGridEvents = () => {
        document.querySelectorAll('.class-card-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const cNum = parseInt(btn.dataset.class);
                loadClass(cNum);
            });
        });
    };

    bindGridEvents();
    ScreenLockManager.resetTimer();

    document.getElementById('lockScreenTeacherBtn')?.addEventListener('click', () => {
        ScreenLockManager.lockScreen('수동 잠금');
    });

    document.getElementById('classGridHomeBtn')?.addEventListener('click', () => {
        loadClass(null);
    });

    // 담임교사 취합자료 내보내기 버튼 이벤트 바인딩
    document.getElementById('exportCurrentClassPatchBtn')?.addEventListener('click', async () => {
        if (!activeClassNum) {
            await showModalAlert('상담 및 입력 내용을 제출할 학급을 먼저 선택해 주세요.', '알림', 'warning');
            return;
        }
        if (window.currentUser?.Role !== 'homeroom') {
            await showModalAlert('취합자료 제출은 담임교사 계정으로 로그인한 경우에만 가능합니다.', '안내', 'info');
            return;
        }
        const password = await showModalPrompt({
            title: '취합자료 내보내기 (학년부장 제출용)',
            message: '학년부장이 안내한 공용 데이터 암호를 입력하세요.',
            isPassword: true
        });
        if (!password) return;
        try {
            const path = await window.go.main.App.SaveCurrentClassPatch(password);
            await showModalAlert(`취합자료 파일이 안전하게 저장되었습니다.\n\n저장 위치:\n${path}\n\n이 파일을 학년부장 선생님께 전달해 주세요.`, '취합자료 저장 완료', 'success');
        } catch (err) {
            await showModalAlert('취합자료 제출 실패: ' + err, '오류', 'error');
        }
    });

    document.getElementById('openTeacherGuideBtn')?.addEventListener('click', () => {
        renderGuideModal(window.currentUser?.Role || 'homeroom');
    });

    document.getElementById('backBtn').addEventListener('click', async () => {
        app.className = '';
        if (window.currentUser && (window.currentUser.Role === 'homeroom' || window.currentUser.Role === 'viewer')) {
            ScreenLockManager.clearTimer();
            await window.go.main.App.Logout?.().catch(() => { });
            window.currentUser = null;
            updateAppWindowTitle();
            renderLoginScreen(schoolName);
        } else {
            updateAppWindowTitle('master');
            renderAdminScreen(schoolName);
        }
    });

    // 담임교사인 경우 본인 반 자동 선택
    if (targetClassNum) {
        loadClass(targetClassNum);
    }
}



// ===== 마이스터고 및 특성화고 합격 가능 예측 뱃지 렌더러 =====
// 마이스터고 및 특성화고 고교·학과별 정밀 합격 분석 목록 추출 헬퍼
function getPredictionAnalysisList(results, cutoffs, schoolGroup) {
    const isMeister = schoolGroup === 'meister';
    const schoolKeywords = isMeister
        ? ['울산마이스터', '울산에너지', '현대공업']
        : ['울산상업', '울산여자상업', '울산생활과학', '울산공업', '울산산업', '울산미용예술', '울산기술공업', '울산애니원'];

    const matchesGroup = (sName) => {
        const norm = normalizeSchoolName(sName);
        return schoolKeywords.some(kw => norm.includes(kw) || kw.includes(norm));
    };

    // 해당 학교군에 등록된 커트라인이 존재하는지 확인
    const relevantCutoffs = (cutoffs || []).filter(c =>
        matchesGroup(c.schoolName) && Number(c.minValue) > 0
    );

    const list = [];
    const seen = new Set();

    (results || []).filter(r => matchesGroup(r.schoolName)).forEach(r => {
        const candidates = relevantCutoffs
            .filter(c => {
                const normC = normalizeSchoolName(c.schoolName);
                const normR = normalizeSchoolName(r.schoolName);
                const schoolMatch = normC === normR || normC.includes(normR) || normR.includes(normC);
                return schoolMatch && isSameTrack(c.track, r.trackName);
            })
            .sort((a, b) => Number(b.year || 0) - Number(a.year || 0));

        candidates.forEach(c => {
            const deptLabel = (!c.department || c.department === '공통') ? '' : c.department;
            const key = `${normalizeSchoolName(r.schoolName)}_${deptLabel}_${r.trackName}_${c.year}`;

            if (!seen.has(key)) {
                seen.add(key);
                const studentScore = Number(r.totalScore) || 0;
                const minScore = Number(c.minValue) || 0;
                const avgScore = Number(c.avgValue) || 0;
                const maxScore = Number(c.maxValue) || 0;
                const diff = studentScore - minScore;
                const isPass = studentScore >= minScore;

                let status = '도전';
                let statusColor = 'bg-rose-500/20 text-rose-300 border-rose-500/40';
                if (diff >= 5) {
                    status = '안정';
                    statusColor = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
                } else if (diff >= 0) {
                    status = '적정';
                    statusColor = 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40';
                } else if (diff >= -5) {
                    status = '소신';
                    statusColor = 'bg-orange-500/20 text-orange-300 border-orange-500/40';
                }

                list.push({
                    schoolName: r.schoolName,
                    dept: deptLabel || '학교 전체(공통)',
                    track: r.trackName,
                    year: c.year || 2026,
                    studentScore,
                    minScore,
                    avgScore,
                    maxScore,
                    diff,
                    status,
                    statusColor,
                    isPass
                });
            }
        });
    });

    return list;
}



// ===== 희망학교 세로 1열 스택(Vertical Stack) 렌더러 (개별 즉시 삭제 X 버튼 탑재) =====
function renderApplicationSummary(applications, classNum, studentNum, studentName) {
    const completed = (applications || []).filter(a => a.status && a.status !== '미입력');
    if (!completed.length) {
        return '<span class="inline-flex items-center px-3 py-1 rounded-full bg-slate-800/90 text-slate-400 text-xs border border-slate-700 font-semibold shadow-xs">미입력</span>';
    }

    const getStatusTheme = (status) => {
        switch (status) {
            case '합격':
            case '최종 진학':
            case '최종진학':
                return {
                    border: 'border-emerald-400/80 bg-emerald-950/60 text-emerald-100',
                    badge: 'bg-emerald-600 text-white font-black border border-emerald-300 shadow-md'
                };
            case '불합격':
                return {
                    border: 'border-rose-400/80 bg-rose-950/60 text-rose-100',
                    badge: 'bg-rose-600 text-white font-black border border-rose-300 shadow-md'
                };
            case '지원 완료':
            case '지원완료':
                return {
                    border: 'border-sky-400/80 bg-sky-950/60 text-sky-100',
                    badge: 'bg-sky-600 text-white font-bold border border-sky-300 shadow-md'
                };
            case '미진학':
                return {
                    border: 'border-slate-600 bg-slate-900/80 text-slate-300',
                    badge: 'bg-slate-700 text-slate-300 border border-slate-500 font-medium'
                };
            case '지원 예정':
            case '지원예정':
            default:
                return {
                    border: 'border-amber-400/80 bg-amber-950/50 text-amber-100',
                    badge: 'bg-amber-600 text-white font-bold border border-amber-300 shadow-md'
                };
        }
    };

    const items = completed.map(a => {
        const theme = getStatusTheme(a.status);
        let school = a.schoolName || (a.category === 'general' ? '후기 일반고' : '기타');
        if (a.category === 'general' && a.assignedSchool) {
            school = `일반고 [${a.assignedSchool}]`;
        } else if (a.assignedDepartment) {
            school = `${school} (${a.assignedDepartment})`;
        }
        return `
            <div class="inline-flex items-center justify-between w-full max-w-56 px-3 py-1.5 rounded-xl text-[11px] border ${theme.border} shadow-sm group/app-badge transition-all">
                <span class="truncate max-w-28 font-bold" title="${escapeAttr(school)}">${escapeHtml(school)}</span>
                <div class="inline-flex items-center gap-1 shrink-0">
                    <span class="text-[10px] px-2 py-0.5 rounded-full ${theme.badge} whitespace-nowrap">${escapeHtml(a.status)}</span>
                    <button type="button" class="btn-delete-app-item inline-flex items-center justify-center w-4 h-4 rounded-full text-slate-400 hover:text-white hover:bg-rose-600 transition-all cursor-pointer font-black text-[11px] ml-0.5 active:scale-90"
                            data-class="${classNum || ''}" data-num="${studentNum || ''}" data-name="${escapeAttr(studentName || '')}"
                            data-cat="${escapeAttr(a.category || '')}" data-school="${escapeAttr(a.schoolName || '')}" data-track="${escapeAttr(a.track || '')}"
                            title="${escapeAttr(school)} 진로희망 삭제">
                        ✕
                    </button>
                </div>
            </div>
        `;
    });

    return `<div class="flex flex-col gap-1.5 items-center w-full">${items.join('')}</div>`;
}

async function renderStudentList(students, classNum) {
    if (!students || students.length === 0) {
        document.getElementById('teacherContent').innerHTML = `
            <div class="text-center py-20 text-warning">
                <div class="text-4xl mb-4">📭</div>
                ${classNum}반 학생 데이터가 없습니다. 관리자 모드에서 나이스 엑셀 파일을 업로드해 주세요.
            </div>
        `;
        return;
    }

    const [fullStudents, dbCutoffs, officialResp, counselSummary] = await Promise.all([
        window.go.main.App.GetClassFullGrades(classNum).catch(() => []),
        window.go.main.App.GetCutoffs().catch(() => []),
        window.go.main.App.GetOfficialAdmissionData().catch(() => null),
        window.go.main.App.GetClassCounselingSummary ? window.go.main.App.GetClassCounselingSummary(classNum).catch(() => ({})) : Promise.resolve({}),
    ]);

    // 공식 공개 자료를 커트라인 형태로 정규화 및 결합
    const officialCutoffs = (officialResp?.items || []).map(item => ({
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

    const cutoffs = [...(dbCutoffs || []), ...officialCutoffs];
    const fullByStudent = new Map((fullStudents || []).map(s => [`${s.studentNum}|${s.name}`, s]));
    const applicationRows = await Promise.all(students.map(async (s) => {
        const records = await window.go.main.App.GetStudentApplications(classNum, s.StudentNum, s.Name).catch(() => []);
        return [`${s.StudentNum}|${s.Name}`, records];
    }));
    const applicationsByStudent = new Map(applicationRows);

    // 검색 및 정렬 상태 변수
    let currentSearchQuery = '';
    let currentSortMode = 'num_asc';

    // 학생별 가공 데이터 캐싱
    const processedStudents = students.map(s => {
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
            totalStudents: totalStudents || students.length,
            meisterPassCount,
            meisterTotalCount,
            specialPassCount,
            specialTotalCount,
            applications,
            generalBadge: getGeneralGuideBadge(s.Percentile)
        };
    });

    // 테이블 렌더링 함수
    const updateDashboardTable = () => {
        let filtered = [...processedStudents];

        // 1. 신호등 매트릭스급 학생 번호/성명 검색 필터링 (프라이버시 모드)
        if (currentSearchQuery.trim()) {
            const qRaw = currentSearchQuery.trim();
            const qLower = qRaw.toLowerCase().replace(/\s+/g, '');
            const isDigitOnly = /^[0-9]+$/.test(qLower);

            filtered = filtered.filter(s => {
                const sName = (s.name || '').replace(/\s+/g, '').toLowerCase();
                const sNum = s.numInt;

                // 이름 검색 (부분 일치)
                if (sName.includes(qLower)) return true;

                // 순수 숫자 검색 (1~2자리 번호 매칭)
                if (isDigitOnly) {
                    const qVal = parseInt(qLower, 10);
                    if (qLower.length <= 2) {
                        return sNum === qVal;
                    }
                    // 3~4자리 학번 매칭 (예: 101, 3101)
                    const shortId = parseInt(`${classNum}${String(sNum).padStart(2, '0')}`, 10);
                    if (shortId === qVal) return true;
                    const fullId = parseInt(`3${classNum}${String(sNum).padStart(2, '0')}`, 10);
                    if (fullId === qVal) return true;
                }

                // 하이픈 학번 (예: 1-1, 1반 1번)
                if (qLower.includes('-')) {
                    const parts = qLower.split('-');
                    if (parts.length === 2 && parseInt(parts[0], 10) === classNum) {
                        return sNum === parseInt(parts[1], 10);
                    }
                }
                const koreanPattern = `${classNum}반${sNum}번`;
                if (koreanPattern === qLower) return true;

                return false;
            });
        }

        // 2. 정렬 로직
        filtered.sort((a, b) => {
            switch (currentSortMode) {
                case 'num_asc':
                    return a.numInt - b.numInt;
                case 'name_asc':
                    return (a.name || '').localeCompare(b.name || '', 'ko');
                case 'general_asc':
                    return a.percentile - b.percentile;
                case 'general_desc':
                    return b.percentile - a.percentile;
                case 'meister_desc':
                    return b.meisterPassCount - a.meisterPassCount;
                case 'special_desc':
                    return b.specialPassCount - a.specialPassCount;
                default:
                    return a.numInt - b.numInt;
            }
        });

        // 3. tbody HTML 생성
        let tbody = '';
        if (!filtered.length) {
            tbody = `
                <tr>
                    <td colspan="6" class="p-12 text-center text-slate-400">
                        <div class="text-3xl mb-2">🔍</div>
                        <div class="font-bold text-white mb-1">'${escapeHtml(currentSearchQuery)}' 검색 조건과 일치하는 학생이 없습니다.</div>
                        <div class="text-xs text-slate-500">학생 번호(예: 1, 15)나 이름을 다시 확인해 주세요.</div>
                    </td>
                </tr>
            `;
        } else {
            filtered.forEach(s => {
                const isPassed = (st) => ['합격', '최종 진학', '최종진학'].includes((st || '').trim());
                const isFinalizedStudent = s.applications.some(a => {
                    if (!isPassed(a.status)) return false;
                    if (['meister', 'special'].includes(a.category)) {
                        return !!(a.assignedDepartment && a.assignedDepartment.trim());
                    }
                    if (a.category === 'general') {
                        return !!(a.assignedSchool && a.assignedSchool.trim());
                    }
                    return true;
                });

                const applicationSummary = renderApplicationSummary(s.applications, classNum, s.studentNum, s.name);

                let appCellHTML = '';
                if (!s.applications.length || s.applications.every(a => !a.status || a.status === '미입력')) {
                    appCellHTML = `
                        <button class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-dashed border-indigo-500/50 bg-indigo-500/10 hover:bg-indigo-500/25 hover:border-indigo-400 text-indigo-300 hover:text-white text-xs font-semibold transition-all cursor-pointer shadow-xs btn-student-application active:scale-95"
                                data-class="${classNum}" data-num="${s.studentNum}" data-name="${escapeAttr(s.name)}" title="클릭하여 희망학교 입력">
                            <svg class="w-3.5 h-3.5 text-indigo-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
                            <span>희망학교 입력</span>
                        </button>
                    `;
                } else {
                    appCellHTML = `
                        <div class="flex items-center justify-center gap-2 flex-wrap">
                            <div class="flex-1 min-w-36">
                                ${applicationSummary}
                            </div>
                            ${isFinalizedStudent ? `
                                <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 text-[11px] font-bold shadow-xs whitespace-nowrap" title="합격 및 최종 배정 완료 (희망학교 비활성화 잠금 상태)">
                                    <svg class="w-3.5 h-3.5 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
                                    <span>확정</span>
                                </span>
                            ` : `
                                <button class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700 hover:border-indigo-400 text-slate-300 hover:text-white text-xs font-semibold transition-all cursor-pointer shadow-xs btn-student-application active:scale-95"
                                        data-class="${classNum}" data-num="${s.studentNum}" data-name="${escapeAttr(s.name)}" title="희망학교 추가 및 수정">
                                    <svg class="w-3.5 h-3.5 text-indigo-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                                    <span>추가/수정</span>
                                </button>
                            `}
                        </div>
                    `;
                }

                tbody += `
                    <tr class="hover:bg-slate-800/70 transition-colors border-b border-slate-700/50">
                        <td class="p-3.5 text-center font-mono font-bold text-slate-400">
                            <span class="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-800 border border-slate-700 text-xs text-slate-300 shadow-inner">
                                ${s.studentNum || '-'}
                            </span>
                        </td>
                        <td class="p-3.5 font-bold text-white text-center text-lg cursor-pointer hover:text-indigo-300 hover:underline text-student-name transition-colors"
                            data-class="${classNum}" data-num="${s.studentNum}" data-name="${escapeAttr(s.name)}" title="클릭하여 진학 상담 시작">
                            <div class="flex flex-col items-center justify-center">
                                <span>${escapeHtml(s.name)}</span>
                                ${counselSummary && counselSummary[s.studentNum] ? `
                                    <span class="inline-flex items-center gap-1 text-[10px] px-2.5 py-0.5 rounded-full bg-indigo-600 text-white font-bold mt-1 shadow-sm border border-indigo-400" title="최근 상담일: ${counselSummary[s.studentNum]} (본인 작성)">
                                        <span>💬</span> ${counselSummary[s.studentNum]}
                                    </span>
                                ` : `
                                    <span class="inline-flex items-center gap-0.5 text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 font-semibold mt-1">
                                        미상담
                                    </span>
                                `}
                            </div>
                        </td>
                        <td class="p-3.5 text-center">${s.generalBadge}</td>
                        <td class="p-3.5 text-center min-w-56">
                            <div class="flex items-center justify-center gap-2 flex-wrap">
                                <button class="btn-prediction-detail inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95 ${s.meisterPassCount > 0 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 hover:bg-amber-500/30' : 'bg-slate-800/80 text-slate-400 border border-slate-700/60 hover:bg-slate-800'}"
                                        data-class="${classNum}" data-num="${s.studentNum}" data-name="${escapeAttr(s.name)}" data-category="meister"
                                        data-percentile="${s.percentile !== 999 ? s.percentile.toFixed(2) : ''}" data-rank="${s.rank || ''}" data-total="${s.totalStudents}"
                                        title="${escapeAttr(s.name)} 학생의 마이스터고 3개교 전형별 상세 점수 및 합격 분석표 보기 (클릭)">
                                    <span class="text-sm">🏛️</span>
                                    <span>마이스터고</span>
                                    <span class="px-2 py-0.5 rounded-full text-[11px] font-black ${s.meisterPassCount > 0 ? 'bg-amber-500 text-slate-950' : 'bg-slate-700 text-slate-400'}">${s.meisterTotalCount > 0 ? `${s.meisterPassCount}/${s.meisterTotalCount}` : '미등록'}</span>
                                </button>
                                <button class="btn-prediction-detail inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95 ${s.specialPassCount > 0 ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 hover:bg-cyan-500/30' : 'bg-slate-800/80 text-slate-400 border border-slate-700/60 hover:bg-slate-800'}"
                                        data-class="${classNum}" data-num="${s.studentNum}" data-name="${escapeAttr(s.name)}" data-category="special"
                                        data-percentile="${s.percentile !== 999 ? s.percentile.toFixed(2) : ''}" data-rank="${s.rank || ''}" data-total="${s.totalStudents}"
                                        title="${escapeAttr(s.name)} 학생의 특성화고 전형·학과별 상세 점수 및 합격 분석표 보기 (클릭)">
                                    <span class="text-sm">🏭</span>
                                    <span>특성화고</span>
                                    <span class="px-2 py-0.5 rounded-full text-[11px] font-black ${s.specialPassCount > 0 ? 'bg-cyan-500 text-slate-950' : 'bg-slate-700 text-slate-400'}">${s.specialTotalCount > 0 ? `${s.specialPassCount}/${s.specialTotalCount}` : '미등록'}</span>
                                </button>
                            </div>
                        </td>
                        <td class="p-3.5 text-center min-w-56">${appCellHTML}</td>
                        <td class="p-3.5 text-center w-36">
                            <button class="btn-primary w-full text-xs px-3.5 py-2 font-bold inline-flex items-center justify-center gap-1.5 rounded-xl btn-student-counsel transition-all hover:scale-105 shadow-md shadow-indigo-500/20 cursor-pointer active:scale-95"
                                    data-class="${classNum}" data-num="${s.studentNum}" data-name="${escapeAttr(s.name)}">
                                <svg class="w-3.5 h-3.5 text-white shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg>
                                <span class="whitespace-nowrap">진학 상담</span>
                            </button>
                        </td>
                    </tr>
                `;
            });
        }

        const tbodyEl = document.getElementById('dashboardStudentTableBody');
        if (tbodyEl) {
            tbodyEl.innerHTML = tbody;
            bindTableEventListeners();
        }

        // 프라이버시 모드 배너 갱신
        const privacyBannerEl = document.getElementById('dashboardPrivacyBanner');
        if (privacyBannerEl) {
            if (currentSearchQuery.trim()) {
                privacyBannerEl.innerHTML = `
                    <div class="flex items-center justify-between gap-3 w-full animate-in fade-in">
                        <div class="flex items-center gap-2">
                            <span class="text-base">🔒</span>
                            <span class="font-bold text-emerald-300">[1:1 프라이버시 상담 모드 가동 중]:</span>
                            <span class="text-slate-200">'<strong class="text-white">${escapeHtml(currentSearchQuery.trim())}</strong>' 검색됨 (<strong>${filtered.length}명</strong> 노출) — 상담 중 다른 학생의 점수와 개인정보가 완전히 차단되어 안전합니다.</span>
                        </div>
                        <button id="resetPrivacyFilterBtn" class="text-xs px-2.5 py-1 rounded-lg bg-indigo-600/50 hover:bg-indigo-600 text-white font-bold transition-all cursor-pointer shrink-0">
                            전체 학생 보기
                        </button>
                    </div>
                `;
                privacyBannerEl.classList.remove('hidden');
                document.getElementById('resetPrivacyFilterBtn')?.addEventListener('click', () => {
                    currentSearchQuery = '';
                    const searchInput = document.getElementById('dashboardStudentSearchInput');
                    if (searchInput) searchInput.value = '';
                    updateDashboardTable();
                });
            } else {
                privacyBannerEl.classList.add('hidden');
                privacyBannerEl.innerHTML = '';
            }
        }
    };

    // 테이블 내부 이벤트 바인딩
    const bindTableEventListeners = () => {
        // 진학 상담 버튼
        document.querySelectorAll('.btn-student-counsel').forEach(el => {
            el.addEventListener('click', (e) => {
                const target = e.currentTarget;
                openStudentModal(parseInt(target.dataset.class), target.dataset.num, target.dataset.name);
            });
        });

        // 희망학교 입력/수정 버튼
        document.querySelectorAll('.btn-student-application').forEach(el => {
            el.addEventListener('click', (e) => {
                const target = e.currentTarget;
                openStudentApplicationModal(parseInt(target.dataset.class), target.dataset.num, target.dataset.name);
            });
        });

        // 학생 이름 클릭 (성적표 모달)
        document.querySelectorAll('.text-student-name').forEach(el => {
            el.addEventListener('click', (e) => {
                const target = e.currentTarget;
                openStudentTranscriptModal(parseInt(target.dataset.class), target.dataset.num, target.dataset.name);
            });
        });

        // 마이스터/특성화고 합격 예측 상세 버튼
        document.querySelectorAll('.btn-prediction-detail').forEach(el => {
            el.addEventListener('click', (e) => {
                const target = e.currentTarget;
                const cNum = parseInt(target.dataset.class, 10);
                const sNum = target.dataset.num;
                const sName = target.dataset.name;
                const cat = target.dataset.category;
                const extraData = {
                    percentile: target.dataset.percentile,
                    rank: target.dataset.rank,
                    total: target.dataset.total
                };
                openPredictionDetailModal(cNum, sNum, sName, cat, extraData);
            });
        });

        // 희망학교 개별 [✕] 삭제 버튼 핸들러 (원클릭 삭제)
        document.querySelectorAll('.btn-delete-app-item').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const cNum = parseInt(btn.dataset.class, 10) || classNum;
                const sNum = btn.dataset.num;
                const sName = btn.dataset.name;
                const cat = btn.dataset.cat;
                const school = btn.dataset.school;
                const track = btn.dataset.track;

                const confirmed = await showModalConfirm({
                    title: '진로희망 학교 삭제',
                    message: `<strong>${escapeHtml(sName)}</strong> (${sNum}번) 학생의<br><strong class="text-indigo-300">[${escapeHtml(school || '희망학교')}]</strong> 지원 이력을 삭제하시겠습니까?`,
                    confirmText: '삭제하기',
                    type: 'warning'
                });
                if (!confirmed) return;

                try {
                    await window.go.main.App.DeleteStudentApplication(cNum, sNum, sName, cat, school, track);
                    await showModalAlert(`'${sName}' 학생의 [${school}] 지원 기록이 삭제되었습니다.`, '삭제 완료', 'success');
                    if (window.refreshCurrentClass) {
                        window.refreshCurrentClass();
                    }
                } catch (err) {
                    await showModalAlert('삭제 실패: ' + err, '오류', 'error');
                }
            });
        });
    };

    // 전체 대시보드 UI 프레임 구성
    document.getElementById('teacherContent').innerHTML = `
        <!-- 상단 컨트롤 툴바: 정렬, 학생번호/이름 검색, 매트릭스, 반 통계 -->
        <div class="flex items-center justify-between mb-3 flex-wrap gap-3 bg-slate-800/50 p-3.5 rounded-2xl border border-slate-700/60 shadow-lg backdrop-blur-sm">
            <div class="flex items-center gap-3 flex-wrap flex-1 min-w-70">
                <div class="text-sm text-text-muted">
                    <span class="text-white font-bold text-base">학생 목록</span> (총 <span class="font-bold text-indigo-400">${students.length}</span>명)
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
    updateDashboardTable();

    // 상단 검색창 이벤트 리스너
    const searchInput = document.getElementById('dashboardStudentSearchInput');
    const clearSearchBtn = document.getElementById('clearDashboardSearchBtn');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            currentSearchQuery = e.target.value;
            if (clearSearchBtn) {
                const hasQuery = Boolean(currentSearchQuery.trim());
                clearSearchBtn.classList.toggle('hidden', !hasQuery);
                clearSearchBtn.classList.toggle('flex', hasQuery);
            }
            updateDashboardTable();
        });
    }
    if (clearSearchBtn) {
        clearSearchBtn.addEventListener('click', () => {
            currentSearchQuery = '';
            if (searchInput) searchInput.value = '';
            clearSearchBtn.classList.add('hidden');
            clearSearchBtn.classList.remove('flex');
            updateDashboardTable();
        });
    }

    // 정렬 드롭다운 이벤트 리스너
    const sortSelect = document.getElementById('dashboardStudentSortSelect');
    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            currentSortMode = e.target.value;
            updateDashboardTable();
        });
    }

    // 대시보드 새로고침 버튼
    document.getElementById('refreshDashboardBtn')?.addEventListener('click', () => {
        if (typeof window.refreshCurrentClass === 'function') {
            window.refreshCurrentClass();
        }
    });

    // 신호등 매트릭스 버튼
    document.getElementById('openMatrixBtn')?.addEventListener('click', () => {
        openMatrixModal(classNum);
    });

    // 우리 반 통계 버튼
    document.getElementById('openClassApplicationSummaryBtn')?.addEventListener('click', () => {
        openClassApplicationSummaryModal(classNum);
    });
}

// ===== 학교별 공식 성적 산출 규칙 안내 맵 =====
const SCHOOL_CALC_RULES = {
    '울산마이스터고': {
        '일반': {
            totalMax: 300,
            semesters: '1-2, 2-1, 2-2, 3-1 균등 반영',
            allSubjectMax: 150,
            weightedSubjects: '영어(20점), 수학(20점), 기술가정(10점) = 50점 만점',
            attendanceMax: 80,
            attendanceRule: '미인정 결석 1일당 8점 감점',
            volunteerMax: 20,
            volunteerRule: '12시간 이상 만점(20점), 2시간 단위 1점 감점 (최저 14점)',
            leadershipMax: 0,
        },
        '특별': {
            totalMax: 280,
            semesters: '1-2, 2-1, 2-2, 3-1 균등 반영',
            allSubjectMax: 70,
            weightedSubjects: '영어(20점), 수학(20점), 기술가정(10점) = 50점 만점',
            attendanceMax: 120,
            attendanceRule: '미인정 결석 1일당 12점 감점',
            volunteerMax: 40,
            volunteerRule: '12시간 이상 만점(40점), 2시간 단위 2점 감점 (최저 28점)',
            leadershipMax: 0,
            note: '심층면접 20점 별도 (총 전형 만점 300점)',
        }
    },
    '울산에너지고': {
        '일반': {
            totalMax: 230,
            semesters: '1-2(10%), 2-1(25%), 2-2(25%), 3-1(40%) 가중 반영 (예체능 제외)',
            allSubjectMax: 90,
            weightedSubjects: '영어(20점), 수학(20점), 기술가정/과학(20점) = 60점 만점',
            attendanceMax: 30,
            attendanceRule: '미인정 결석 1일당 5점 감점',
            volunteerMax: 40,
            volunteerRule: '12시간 이상 만점(40점), 2시간 단위 1점 감점 (최저 34점)',
            leadershipMax: 10,
            leadershipRule: '학생회/학급임원 학기당 2.5점 (최대 10점)',
        },
        '특별': {
            totalMax: 200,
            semesters: '1-2(10%), 2-1(25%), 2-2(25%), 3-1(40%) 가중 반영 (예체능 제외)',
            allSubjectMax: 60,
            weightedSubjects: '영어(10점), 수학(10점), 기술가정/과학(10점) = 30점 만점',
            attendanceMax: 60,
            attendanceRule: '미인정 결석 1일당 5점 감점',
            volunteerMax: 40,
            volunteerRule: '12시간 이상 만점(40점), 2시간 단위 1점 감점 (최저 34점)',
            leadershipMax: 10,
            leadershipRule: '학생회/학급임원 학기당 2.5점 (최대 10점)',
        }
    },
    '현대공업고': {
        '일반': {
            totalMax: 200,
            semesters: '1-2(10%), 2-1(25%), 2-2(25%), 3-1(40%) 가중 반영 (예체능 제외)',
            allSubjectMax: 100,
            weightedSubjects: '영어(20점), 수학(20점), 기술가정(10점) = 50점 만점',
            attendanceMax: 30,
            attendanceRule: '미인정 결석 1일당 6점 감점 / 미인정 지각·조퇴·결과 1회당 2점 직접 감점',
            volunteerMax: 15,
            volunteerRule: '12시간 이상 만점(15점), 2시간 단위 1점 감점 (최저 9점)',
            leadershipMax: 5,
            leadershipRule: '학생회/학급임원 학기당 2.5점 (최대 5점)',
        },
        '특별': {
            totalMax: 150,
            semesters: '1-2(10%), 2-1(25%), 2-2(25%), 3-1(40%) 가중 반영 (예체능 제외)',
            allSubjectMax: 50,
            weightedSubjects: '영어(15점), 수학(15점), 기술가정(10점) = 40점 만점',
            attendanceMax: 40,
            attendanceRule: '미인정 결석 1일당 6점 감점 / 미인정 지각·조퇴·결과 1회당 2점 직접 감점',
            volunteerMax: 15,
            volunteerRule: '12시간 이상 만점(15점), 2시간 단위 1점 감점 (최저 9점)',
            leadershipMax: 5,
            leadershipRule: '학생회/학급임원 학기당 2.5점 (최대 5점)',
        }
    },
    '울산상업고': {
        '일반': { totalMax: 100, semesters: '1-2, 2-1, 2-2, 3-1 균등 25% (예체능 감점 반영)', allSubjectMax: 80, attendanceMax: 20, attendanceRule: '10/31 기준 결석 1일당 2점 감점', volunteerMax: 0 },
        '취업희망자': { totalMax: 60, semesters: '1-2, 2-1, 2-2, 3-1 균등 25%', allSubjectMax: 20, attendanceMax: 30, attendanceRule: '9/30 기준 결석 1일당 3점 감점', volunteerMax: 10, volunteerRule: '12시간 10점, 10시간 9점, 8시간 8점 등' }
    },
    '울산여자상업고': {
        '일반': { totalMax: 100, semesters: '1-2, 2-1, 2-2, 3-1 균등 25%', allSubjectMax: 80, attendanceMax: 20, attendanceRule: '10/31 기준 결석 1일당 2점 감점', volunteerMax: 0 },
        '취업희망자': { totalMax: 80, semesters: '1-2, 2-1, 2-2, 3-1 균등 25%', allSubjectMax: 40, attendanceMax: 30, attendanceRule: '9/30 기준 결석 1일당 3점 감점', volunteerMax: 10, volunteerRule: '12시간 10점, 10시간 9점, 8시간 8점 등' }
    },
    '울산생활과학고': {
        '일반': { totalMax: 100, semesters: '1-2(20%), 2-1(20%), 2-2(20%), 3-1(40%)', allSubjectMax: 80, attendanceMax: 20, attendanceRule: '10/31 기준 결석 1일당 2점 감점', volunteerMax: 0 },
        '취업희망자': { totalMax: 50, semesters: '1-2(20%), 2-1(20%), 2-2(20%), 3-1(40%)', allSubjectMax: 25, attendanceMax: 20, attendanceRule: '9/30 기준 결석 1일당 2점 감점', volunteerMax: 5, volunteerRule: '12시간 5점, 10시간 4.5점 등' }
    },
    '울산공업고': {
        '일반': { totalMax: 100, semesters: '1-2, 2-1, 2-2, 3-1 균등 25%', allSubjectMax: 80, attendanceMax: 20, attendanceRule: '10/31 기준 결석 1일당 2점 감점', volunteerMax: 0 },
        '취업희망자': { totalMax: 50, semesters: '1-2, 2-1, 2-2, 3-1 균등 25%', allSubjectMax: 20, attendanceMax: 20, attendanceRule: '9/30 기준 결석 1일당 2점 감점', volunteerMax: 10, volunteerRule: '12시간 10점, 10시간 9점 등' }
    },
    '울산산업고': {
        '일반': { totalMax: 100, semesters: '1-2, 2-1, 2-2, 3-1 균등 25%', allSubjectMax: 80, attendanceMax: 20, attendanceRule: '10/31 기준 결석 1일당 2점 감점', volunteerMax: 0 },
        '취업희망자': { totalMax: 50, semesters: '1-2, 2-1, 2-2, 3-1 균등 25%', allSubjectMax: 20, attendanceMax: 20, attendanceRule: '9/30 기준 결석 1일당 2점 감점', volunteerMax: 10, volunteerRule: '12시간 10점, 10시간 9점 등' }
    },
    '울산미용예술고': {
        '일반': { totalMax: 100, semesters: '1-2, 2-1, 2-2, 3-1 균등 25%', allSubjectMax: 80, attendanceMax: 20, attendanceRule: '10/31 기준 결석 1일당 2점 감점', volunteerMax: 0 },
        '취업희망자': { totalMax: 50, semesters: '1-2, 2-1, 2-2, 3-1 균등 25%', allSubjectMax: 20, attendanceMax: 20, attendanceRule: '9/30 기준 결석 1일당 2점 감점', volunteerMax: 10, volunteerRule: '12시간 10점, 10시간 9점 등' }
    },
    '울산기술공업고': {
        '일반': { totalMax: 100, semesters: '1-2, 2-1, 2-2, 3-1 균등 25%', allSubjectMax: 80, attendanceMax: 20, attendanceRule: '10/31 기준 결석 1일당 2점 감점', volunteerMax: 0 },
        '취업희망자': { totalMax: 50, semesters: '1-2, 2-1, 2-2, 3-1 균등 25%', allSubjectMax: 20, attendanceMax: 20, attendanceRule: '9/30 기준 결석 1일당 2점 감점', volunteerMax: 10, volunteerRule: '12시간 10점, 10시간 9점 등' }
    },
    '울산애니원고': {
        '일반': { totalMax: 100, semesters: '1-2, 2-1, 2-2, 3-1 균등 25%', allSubjectMax: 80, attendanceMax: 20, attendanceRule: '10/31 기준 결석 1일당 2점 감점', volunteerMax: 0 },
        '취업희망자': { totalMax: 50, semesters: '1-2, 2-1, 2-2, 3-1 균등 25%', allSubjectMax: 20, attendanceMax: 20, attendanceRule: '9/30 기준 결석 1일당 2점 감점', volunteerMax: 10, volunteerRule: '12시간 10점, 10시간 9점 등' }
    }
};

// ===== 학교별 공식 환산점수 세부 산출 명세 모달 =====
function showSchoolScoreDetailModal(studentName, classNum, studentNum, r, fullStudent) {
    document.getElementById('schoolScoreDetailModal')?.remove();

    const sName = r.schoolName || '';
    const tName = r.trackName || '';
    const sNorm = normalizeSchoolName(sName);
    const tNorm = normalizeTrack(tName);

    const sRule = (SCHOOL_CALC_RULES[sName] || SCHOOL_CALC_RULES[sNorm] || {})[tNorm] || 
                  (SCHOOL_CALC_RULES[sName] || SCHOOL_CALC_RULES[sNorm] || {})['일반'] || {};

    let defaultMax = 100;
    if (sNorm.includes('마이스터')) defaultMax = (tNorm.includes('특별') ? 280 : 300);
    else if (sNorm.includes('에너지')) defaultMax = (tNorm.includes('특별') ? 200 : 230);
    else if (sNorm.includes('현대공업')) defaultMax = (tNorm.includes('특별') ? 150 : 200);
    const totalMax = r.totalMax || r.TotalMax || sRule.totalMax || defaultMax;

    // 가중치 상세 카드 HTML
    let weightedDetailsHTML = '';
    if (r.weightedDetails && Object.keys(r.weightedDetails).length > 0) {
        weightedDetailsHTML = `
            <div class="mt-2.5 pt-2.5 border-t border-slate-700/60 grid grid-cols-2 sm:grid-cols-3 gap-2">
                ${Object.entries(r.weightedDetails).map(([sub, score]) => `
                    <div class="bg-slate-900/60 p-2 rounded-lg border border-slate-700/40 text-center">
                        <div class="text-[11px] text-indigo-300 font-medium">${sub}</div>
                        <div class="text-xs font-black text-amber-300 mt-0.5">${Number(score).toFixed(2)}점</div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    const modal = document.createElement('div');
    modal.id = 'schoolScoreDetailModal';
    modal.className = 'fixed inset-0 bg-black/80 backdrop-blur-md z-[60] flex items-center justify-center p-3 md:p-6 overflow-y-auto animate-fade-in';
    modal.innerHTML = `
        <div class="glass-card w-full max-w-2xl p-6 md:p-7 rounded-2xl bg-slate-900/98 border border-slate-700/90 shadow-2xl space-y-4 animate-scale-up text-xs">
            <!-- 헤더 -->
            <div class="flex items-center justify-between border-b border-slate-700/60 pb-3.5">
                <div class="flex items-center gap-2.5">
                    <span class="text-2xl">📊</span>
                    <div>
                        <h3 class="text-lg font-black text-white flex items-center gap-2">
                            <span>[${sName}]</span> ${tName}전형 공식 성적 산출 상세
                        </h3>
                        <p class="text-[11px] text-slate-400 mt-0.5">
                            ${classNum}반 ${studentNum}번 <strong class="text-slate-200">${studentName}</strong> 학생의 고교 요강별 공식 환산 결과입니다.
                        </p>
                    </div>
                </div>
                <button id="closeSchoolScoreDetailBtn" class="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 text-lg transition-all cursor-pointer">✕</button>
            </div>

            <!-- 총점 요약 카드 (그라디언트) -->
            <div class="bg-linear-to-r from-indigo-950/60 via-slate-800/90 to-purple-950/60 p-4 rounded-xl border border-indigo-500/40 flex items-center justify-between shadow-inner">
                <div>
                    <span class="text-[11px] text-indigo-300 font-bold uppercase tracking-wider">최종 공식 환산 총점</span>
                    <div class="text-2xl font-black text-amber-300 mt-0.5">${Number(r.totalScore).toFixed(2)}<span class="text-xs text-slate-300 font-normal"> / ${totalMax}점 만점</span></div>
                </div>
                <div class="text-right space-y-0.5 text-[11px] text-slate-300 font-medium">
                    <div>교과 성적: <strong class="text-indigo-200">${(Number(r.allSubjectScore || 0) + Number(r.weightedScore || 0)).toFixed(2)}점</strong></div>
                    <div>비교과(출결·봉사·리더십): <strong class="text-emerald-300">${(Number(r.attendanceScore || 0) + Number(r.volunteerScore || 0) + Number(r.leadershipScore || 0)).toFixed(2)}점</strong></div>
                    ${Number(r.extraScore) > 0 ? `<div>가산점: <strong class="text-amber-300">+${Number(r.extraScore).toFixed(2)}점</strong></div>` : ''}
                </div>
            </div>

            <!-- 세부 점수 카드 영역 -->
            <div class="space-y-3 max-h-[60vh] overflow-y-auto custom-scrollbar pr-1">
                <!-- 1. 교과 성적 영역 -->
                <div class="bg-slate-800/60 p-3.5 rounded-xl border border-slate-700/60 space-y-2">
                    <div class="flex items-center justify-between border-b border-slate-700/40 pb-1.5">
                        <span class="font-bold text-slate-200 flex items-center gap-1.5">
                            <span>📚</span> 1. 교과 성적 산출 (전과목 + 가중치 과목)
                        </span>
                        <span class="font-black text-indigo-300">${(Number(r.allSubjectScore || 0) + Number(r.weightedScore || 0)).toFixed(2)}점 / ${(Number(r.allSubjectMax || 0) + Number(r.weightedMax || 0))}점 만점</span>
                    </div>

                    <!-- 전과목 점수 -->
                    <div class="bg-slate-900/60 p-2.5 rounded-lg border border-slate-700/40 flex items-center justify-between">
                        <div>
                            <div class="font-bold text-slate-200">기본 전과목 성적</div>
                            <div class="text-[11px] text-slate-400 mt-0.5">${sRule.semesters || '반영 학기 성적 산출'}</div>
                        </div>
                        <div class="text-right">
                            <span class="text-sm font-black text-white">${Number(r.allSubjectScore).toFixed(2)}점</span>
                            <span class="text-[10px] text-slate-400 block">${r.allSubjectMax || 0}점 만점</span>
                        </div>
                    </div>

                    <!-- 가중치 과목 점수 (있을 경우) -->
                    ${(r.weightedMax && r.weightedMax > 0) ? `
                        <div class="bg-slate-900/60 p-2.5 rounded-lg border border-slate-700/40">
                            <div class="flex items-center justify-between">
                                <div>
                                    <div class="font-bold text-slate-200">주요 과목별 가중치 배점</div>
                                    <div class="text-[11px] text-slate-400 mt-0.5">${sRule.weightedSubjects || '영어, 수학, 기술가정/과학 등 가중 반영'}</div>
                                </div>
                                <div class="text-right">
                                    <span class="text-sm font-black text-amber-300">${Number(r.weightedScore).toFixed(2)}점</span>
                                    <span class="text-[10px] text-slate-400 block">${r.weightedMax}점 만점</span>
                                </div>
                            </div>
                            ${weightedDetailsHTML}
                        </div>
                    ` : ''}
                </div>

                <!-- 2. 비교과 성적 영역 -->
                <div class="bg-slate-800/60 p-3.5 rounded-xl border border-slate-700/60 space-y-2">
                    <div class="flex items-center justify-between border-b border-slate-700/40 pb-1.5">
                        <span class="font-bold text-slate-200 flex items-center gap-1.5">
                            <span>🏃</span> 2. 비교과 성적 산출 (출결 / 봉사 / 리더십)
                        </span>
                        <span class="font-black text-emerald-300">${(Number(r.attendanceScore || 0) + Number(r.volunteerScore || 0) + Number(r.leadershipScore || 0)).toFixed(2)}점 / ${(Number(r.attendanceMax || 0) + Number(r.volunteerMax || 0) + Number(r.leadershipMax || 0))}점 만점</span>
                    </div>

                    <!-- 출결 점수 -->
                    <div class="bg-slate-900/60 p-2.5 rounded-lg border border-slate-700/40 flex items-center justify-between">
                        <div>
                            <div class="font-bold text-slate-200">출결 점수</div>
                            <div class="text-[11px] text-slate-400 mt-0.5">
                                미인정 결석 환산 <strong>${fullStudent?.absenceDays ?? 0}일</strong> 
                                <span class="text-[10px] text-slate-500">(결석 ${fullStudent?.rawAbsenceDays ?? 0}일, 지각·조퇴·결과 ${(fullStudent?.rawLateCount ?? 0) + (fullStudent?.rawEarlyCount ?? 0) + (fullStudent?.rawResultCount ?? 0)}회)</span>
                                ${sRule.attendanceRule ? ` • ${sRule.attendanceRule}` : ''}
                            </div>
                        </div>
                        <div class="text-right">
                            <span class="text-sm font-black text-emerald-400">${Number(r.attendanceScore).toFixed(2)}점</span>
                            <span class="text-[10px] text-slate-400 block">${r.attendanceMax || 0}점 만점</span>
                        </div>
                    </div>

                    <!-- 봉사 점수 -->
                    ${(r.volunteerMax && r.volunteerMax > 0) ? `
                        <div class="bg-slate-900/60 p-2.5 rounded-lg border border-slate-700/40 flex items-center justify-between">
                            <div>
                                <div class="font-bold text-slate-200">봉사활동 점수</div>
                                <div class="text-[11px] text-slate-400 mt-0.5">
                                    총 봉사시간: <strong>${fullStudent?.totalVolunteerHours || fullStudent?.volunteerHours || 0}시간</strong>
                                    ${sRule.volunteerRule ? ` • ${sRule.volunteerRule}` : ''}
                                </div>
                            </div>
                            <div class="text-right">
                                <span class="text-sm font-black text-sky-400">${Number(r.volunteerScore).toFixed(2)}점</span>
                                <span class="text-[10px] text-slate-400 block">${r.volunteerMax}점 만점</span>
                            </div>
                        </div>
                    ` : `
                        <div class="bg-slate-900/40 p-2 rounded-lg border border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
                            <span>봉사활동 점수: 본 전형 미반영 (0점)</span>
                            <span class="text-slate-500">배점 없음</span>
                        </div>
                    `}

                    <!-- 리더십 점수 (해당 학교) -->
                    ${(r.leadershipMax && r.leadershipMax > 0) ? `
                        <div class="bg-slate-900/60 p-2.5 rounded-lg border border-slate-700/40 flex items-center justify-between">
                            <div>
                                <div class="font-bold text-slate-200">리더십 가산 배점</div>
                                <div class="text-[11px] text-slate-400 mt-0.5">
                                    학생회/학급임원 <strong>${fullStudent?.leadershipTerms || 0}학기 인정</strong>
                                    ${sRule.leadershipRule ? ` • ${sRule.leadershipRule}` : ''}
                                </div>
                            </div>
                            <div class="text-right">
                                <span class="text-sm font-black text-purple-400">${Number(r.leadershipScore).toFixed(2)}점</span>
                                <span class="text-[10px] text-slate-400 block">${r.leadershipMax}점 만점</span>
                            </div>
                        </div>
                    ` : ''}

                    <!-- 창체/행발 가산점 -->
                    ${Number(r.extraScore) > 0 ? `
                        <div class="bg-slate-900/60 p-2.5 rounded-lg border border-amber-500/40 flex items-center justify-between">
                            <div>
                                <div class="font-bold text-amber-300">창체 / 행발 수기 가산점</div>
                                <div class="text-[11px] text-slate-400 mt-0.5">교과 외 추가 인정 가산 배점</div>
                            </div>
                            <div class="text-right">
                                <span class="text-sm font-black text-amber-400">+${Number(r.extraScore).toFixed(2)}점</span>
                            </div>
                        </div>
                    ` : ''}
                </div>

                ${sRule.note ? `
                    <div class="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-200 text-[11px]">
                        💡 <strong>전형 참고사항:</strong> ${sRule.note}
                    </div>
                ` : ''}
            </div>

            <!-- 하단 닫기 버튼 -->
            <div class="flex justify-end pt-2 border-t border-slate-700/60">
                <button id="closeSchoolScoreDetailFooterBtn" class="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 font-bold px-5 py-2 rounded-xl text-xs cursor-pointer active:scale-95 transition-all">
                    확인 및 닫기
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    modal.querySelector('#closeSchoolScoreDetailBtn')?.addEventListener('click', () => modal.remove());
    modal.querySelector('#closeSchoolScoreDetailFooterBtn')?.addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
}

// ===== 마이스터고 및 특성화고 합격 예측 상세 분석 팝업 모달 =====
async function openPredictionDetailModal(classNum, studentNum, studentName, category, extraData = {}) {
    document.getElementById('predictionDetailModal')?.remove();

    const isMeister = category === 'meister';
    const titleCategory = isMeister ? '마이스터고' : '특성화고';
    const categoryIcon = isMeister ? '🏛️' : '🏭';

    // 1. 학생 전체 성적 및 커트라인 로드
    let fullStudent = null;
    let cutoffs = [];
    try {
        const [fullStudents, dbCutoffs, officialResp] = await Promise.all([
            window.go.main.App.GetClassFullGrades(classNum).catch(() => []),
            window.go.main.App.GetCutoffs().catch(() => []),
            window.go.main.App.GetOfficialAdmissionData().catch(() => null),
        ]);
        fullStudent = (fullStudents || []).find(s => 
            String(s.studentNum) === String(studentNum) || s.name === studentName
        );

        const officialCutoffs = (officialResp?.items || []).map(item => ({
            schoolName: item.schoolName || '',
            department: item.department || '',
            track: item.track || '일반전형',
            minValue: Number(item.minAcceptedScore || item.minValue || 0),
            avgValue: Number(item.avgAcceptedScore || item.avgValue || 0),
            maxValue: Number(item.maxFailedScore || item.maxValue || 0),
            year: item.admissionYear || item.year || 0,
            isOfficial: true,
        })).filter(c => {
            if (!c.minValue || c.minValue <= 0) return false;
            if (c.schoolName.includes('청량고')) return false;
            return true;
        });

        cutoffs = [...(dbCutoffs || []), ...officialCutoffs];
    } catch (err) {
        console.error('분석 데이터 로드 실패:', err);
    }

    const analysisList = getPredictionAnalysisList(fullStudent?.schoolResults, cutoffs, category);
    const passCount = analysisList.filter(x => x.isPass).length;
    const passSchoolCount = new Set(analysisList.filter(x => x.isPass).map(x => normalizeSchoolName(x.schoolName))).size;

    // 석차 및 백분율 확정
    const displayPercentile = fullStudent?.generalHSPercentile != null && fullStudent.generalHSPercentile > 0
        ? Number(fullStudent.generalHSPercentile).toFixed(2) + '%'
        : (extraData.percentile ? extraData.percentile + '%' : '-');
    const displayRank = extraData.rank || fullStudent?.rank || '-';
    let displayTotal = extraData.total || fullStudent?.totalStudents || fullStudent?.TotalStudents || 0;

    // 만약 전달받은 displayTotal이 displayRank보다 작거나 비정상적인 경우 (예: 전교 49등인데 반 학생수 10명이 전달된 경우)
    const rankNum = parseInt(displayRank, 10);
    const totalNum = parseInt(displayTotal, 10);
    if ((!totalNum || (rankNum && totalNum < rankNum)) && (extraData.percentile || fullStudent?.generalHSPercentile)) {
        const pct = parseFloat(extraData.percentile || fullStudent?.generalHSPercentile);
        if (pct > 0 && rankNum > 0) {
            displayTotal = Math.round(rankNum / (pct / 100));
        }
    }
    if (!displayTotal || displayTotal === 0) displayTotal = '-';

    // 모달 DOM 생성
    const modal = document.createElement('div');
    modal.id = 'predictionDetailModal';
    modal.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 md:p-6 overflow-y-auto animate-fade-in print:p-0 print:bg-white';

    // body에 먼저 등록하여 쿼리셀렉터가 항상 성공하도록 보장
    document.body.appendChild(modal);

    let activeFilter = 'all'; // 'all' or 'pass'

    const renderModalContent = () => {
        const displayList = [...(activeFilter === 'pass' ? analysisList.filter(x => x.isPass) : analysisList)];

        // 기준연도(내림차순) -> 고교명(가나다) -> 전형구분(일반 우선) -> 학과명(공통 우선) 순서로 정렬
        displayList.sort((a, b) => {
            if (Number(b.year) !== Number(a.year)) return Number(b.year) - Number(a.year);
            const schComp = String(a.schoolName || '').localeCompare(String(b.schoolName || ''), 'ko');
            if (schComp !== 0) return schComp;
            const aTrk = String(a.track || '');
            const bTrk = String(b.track || '');
            if (aTrk !== bTrk) {
                if (aTrk.includes('일반')) return -1;
                if (bTrk.includes('일반')) return 1;
                return aTrk.localeCompare(bTrk, 'ko');
            }
            const aIsCommon = a.dept.includes('공통') || a.dept.includes('전체') ? 0 : 1;
            const bIsCommon = b.dept.includes('공통') || b.dept.includes('전체') ? 0 : 1;
            if (aIsCommon !== bIsCommon) return aIsCommon - bIsCommon;
            return String(a.dept || '').localeCompare(String(b.dept || ''), 'ko');
        });

        // 같은 기준연도, 같은 고교명, 같은 전형구분 행 병합(rowspan) 계산
        const yearSpans = [];
        const schoolSpans = [];
        const trackSpans = [];

        for (let i = 0; i < displayList.length; i++) {
            // 1. 기준연도 rowspan
            if (i === 0 || displayList[i].year !== displayList[i - 1].year) {
                let count = 1;
                while (i + count < displayList.length && displayList[i + count].year === displayList[i].year) {
                    count++;
                }
                yearSpans[i] = count;
            } else {
                yearSpans[i] = 0;
            }

            // 2. 고교명 rowspan (같은 연도 내에서)
            if (i === 0 || displayList[i].year !== displayList[i - 1].year || displayList[i].schoolName !== displayList[i - 1].schoolName) {
                let count = 1;
                while (i + count < displayList.length && 
                       displayList[i + count].year === displayList[i].year && 
                       displayList[i + count].schoolName === displayList[i].schoolName) {
                    count++;
                }
                schoolSpans[i] = count;
            } else {
                schoolSpans[i] = 0;
            }

            // 3. 전형구분 rowspan (같은 연도 & 같은 고교 내에서)
            if (i === 0 || displayList[i].year !== displayList[i - 1].year || 
                displayList[i].schoolName !== displayList[i - 1].schoolName || 
                displayList[i].track !== displayList[i - 1].track) {
                let count = 1;
                while (i + count < displayList.length && 
                       displayList[i + count].year === displayList[i].year && 
                       displayList[i + count].schoolName === displayList[i].schoolName && 
                       displayList[i + count].track === displayList[i].track) {
                    count++;
                }
                trackSpans[i] = count;
            } else {
                trackSpans[i] = 0;
            }
        }

        // 고교별 환산점수 뱃지 목록 (클릭 시 세부 산출 공식 팝업 연동)
        const schoolScoresHTML = (fullStudent?.schoolResults || [])
            .filter(r => isMeister
                ? ['울산마이스터', '울산에너지', '현대공업'].some(kw => normalizeSchoolName(r.schoolName).includes(kw))
                : ['울산상업', '울산여자상업', '울산생활과학', '울산공업', '울산산업', '울산미용예술', '울산기술공업', '울산애니원'].some(kw => normalizeSchoolName(r.schoolName).includes(kw))
            )
            .map(r => {
                const sNameNorm = normalizeSchoolName(r.schoolName);
                const tNameNorm = normalizeTrack(r.trackName);
                let defaultMax = 100;
                if (sNameNorm.includes('마이스터')) defaultMax = (tNameNorm.includes('특별') ? 280 : 300);
                else if (sNameNorm.includes('에너지')) defaultMax = (tNameNorm.includes('특별') ? 200 : 230);
                else if (sNameNorm.includes('현대공업')) defaultMax = (tNameNorm.includes('특별') ? 150 : 200);
                const maxVal = r.totalMax || r.TotalMax || defaultMax;

                // 해당 학교/전형의 커트라인 판정 조회
                const relatedPred = analysisList.find(x => 
                    normalizeSchoolName(x.schoolName) === sNameNorm && 
                    normalizeTrack(x.track) === tNameNorm
                );
                let badgeHTML = '';
                if (relatedPred) {
                    const diffStr = relatedPred.diff >= 0 ? `+${relatedPred.diff.toFixed(1)}` : relatedPred.diff.toFixed(1);
                    const bColor = relatedPred.isPass ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-rose-500/20 text-rose-300 border-rose-500/40';
                    badgeHTML = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold border ${bColor}">${relatedPred.isPass ? '🟢' : '🔴'} ${relatedPred.status} (${diffStr})</span>`;
                }

                return `
                    <div data-school="${escapeHtml(r.schoolName)}" data-track="${escapeHtml(r.trackName)}" role="button" tabindex="0" title="클릭하여 ${r.schoolName} ${r.trackName}전형 상세 성적 산출 내역 보기" class="bg-slate-900/90 p-3 rounded-xl border border-slate-700/70 hover:border-indigo-400 hover:bg-slate-800/90 flex items-center justify-between gap-3 shadow-inner hover:shadow-indigo-500/15 transition-all cursor-pointer group active:scale-98 prediction-score-item">
                        <div class="flex flex-col min-w-0">
                            <div class="flex items-center gap-1.5 flex-wrap">
                                <span class="text-xs font-bold text-white group-hover:text-indigo-300 transition-colors truncate">${r.schoolName}</span>
                                <span class="text-[10px] text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity">🔍</span>
                                ${badgeHTML}
                            </div>
                            <span class="text-[11px] text-indigo-300 font-semibold truncate mt-0.5">${r.trackName}${r.trackName.endsWith('전형') ? '' : '전형'}</span>
                        </div>
                        <div class="text-right shrink-0">
                            <div class="text-sm font-black text-amber-300">${Number(r.totalScore).toFixed(2)}점</div>
                            <div class="text-[10px] text-slate-400 font-medium">${maxVal}점 만점</div>
                        </div>
                    </div>
                `;
            }).join('');

        let tableRowsHTML = '';
        if (displayList.length === 0) {
            tableRowsHTML = `
                <tr>
                    <td colspan="8" class="p-12 text-center text-text-muted">
                        <p class="text-3xl mb-2">📭</p>
                        <p class="font-bold text-slate-300 text-sm">해당 조건에 일치하는 분석 데이터가 없습니다.</p>
                        <p class="text-xs text-slate-400 mt-1">고교 커트라인 통합 관리 화면에서 해당 고교의 합격선을 등록해 보세요.</p>
                    </td>
                </tr>
            `;
        } else {
            tableRowsHTML = displayList.map((item, idx) => {
                const diffStr = item.diff >= 0 ? `+${item.diff.toFixed(2)}` : item.diff.toFixed(2);
                const diffColor = item.diff >= 0 ? 'text-emerald-400 font-black' : 'text-rose-400 font-bold';
                const statusBadge = item.isPass
                    ? `<span class="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 inline-flex items-center gap-1 shadow-xs">🟢 ${item.status}</span>`
                    : `<span class="px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 inline-flex items-center gap-1 shadow-xs">🔴 ${item.status}</span>`;

                return `
                    <tr class="border-b border-slate-700/40 hover:bg-slate-800/50 transition-colors text-center text-xs">
                        ${yearSpans[idx] > 0 ? `
                            <td rowspan="${yearSpans[idx]}" class="p-3 text-center font-bold text-amber-300/90 font-mono bg-slate-900/40 border-r border-slate-700/60 align-middle whitespace-nowrap">
                                ${item.year}학년도
                            </td>
                        ` : ''}
                        ${schoolSpans[idx] > 0 ? `
                            <td rowspan="${schoolSpans[idx]}" class="p-3 font-bold text-white text-left pl-3.5 bg-slate-900/20 border-r border-slate-700/60 align-middle whitespace-nowrap">
                                ${item.schoolName}
                            </td>
                        ` : ''}
                        ${trackSpans[idx] > 0 ? `
                            <td rowspan="${trackSpans[idx]}" class="p-3 text-center text-slate-300 font-semibold bg-slate-900/10 border-r border-slate-700/60 align-middle whitespace-nowrap">
                                ${item.track}${item.track.endsWith('전형') ? '' : '전형'}
                            </td>
                        ` : ''}
                        <td class="p-3 text-left pl-3 text-indigo-200 font-medium whitespace-nowrap border-r border-slate-800/40">
                            ${item.dept}
                        </td>
                        <td class="p-3 text-right font-black text-indigo-300 whitespace-nowrap border-r border-slate-800/40">
                            <button class="hover:text-amber-300 hover:underline cursor-pointer prediction-score-row-btn transition-colors" data-school="${escapeHtml(item.schoolName)}" data-track="${escapeHtml(item.track)}" title="클릭하여 상세 성적 산출 내역 보기">
                                ${item.studentScore.toFixed(2)}점 🔍
                            </button>
                        </td>
                        <td class="p-3 text-right font-semibold text-slate-300 whitespace-nowrap border-r border-slate-800/40">
                            <div class="flex flex-col items-end gap-0.5">
                                <span class="font-bold text-emerald-300">최저 ${item.minScore.toFixed(2)}점</span>
                                ${item.avgScore > 0 ? `<span class="text-[10px] text-amber-300/80">평균 ${item.avgScore.toFixed(2)}점</span>` : ''}
                            </div>
                        </td>
                        <td class="p-3 text-right ${diffColor} whitespace-nowrap border-r border-slate-800/40">
                            ${diffStr}점
                        </td>
                        <td class="p-3 whitespace-nowrap">
                            ${statusBadge}
                        </td>
                    </tr>
                `;
            }).join('');
        }

        modal.innerHTML = `
            <div class="glass-card w-full max-w-5xl p-6 md:p-8 rounded-2xl bg-slate-900/95 border border-slate-700/80 shadow-2xl space-y-5 animate-scale-up max-h-[94vh] flex flex-col print:border-none print:shadow-none print:bg-white print:text-black">
                <!-- 헤더 -->
                <div class="flex items-center justify-between border-b border-slate-700/60 pb-4 shrink-0 flex-wrap gap-3">
                    <div class="flex items-center gap-3">
                        <span class="text-3xl">${categoryIcon}</span>
                        <div>
                            <h2 class="text-xl md:text-2xl font-black text-white flex items-center gap-2">
                                <span>[${escapeHtml(studentName)}]</span> 학생 ${titleCategory} 합격 예측 정밀 분석
                            </h2>
                            <p class="text-xs text-text-muted mt-0.5">
                                학생 본인의 실제 고교별 전형 산출 점수와 등록된 과거 및 공식 합격선 커트라인을 1:1로 정밀 대조한 결과입니다.
                            </p>
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        <button id="printPredictionModalBtn" class="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs print:hidden" title="학부모 상담용 분석표 인쇄">
                            <span>🖨️</span> 인쇄
                        </button>
                        <button id="closePredictionModalBtn" class="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 text-xl transition-all cursor-pointer print:hidden">
                            ✕
                        </button>
                    </div>
                </div>

                <!-- 상단: 학생 기본 성적 & 본인 고교별 환산점수 카드 (페이지 분할 시 중복 방지) -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 shrink-0 prediction-summary-header">
                    <!-- 기본 내신 지표 -->
                    <div class="p-4 rounded-xl bg-slate-800/60 border border-slate-700/50 space-y-2.5">
                        <div class="flex items-center justify-between text-xs text-text-muted border-b border-slate-700/40 pb-1.5">
                            <span class="font-bold text-slate-300">👤 학생 기본 내신 성적 요약</span>
                            <span class="text-indigo-400 font-bold">${classNum}반 ${studentNum}번 ${studentName}</span>
                        </div>
                        <div class="grid grid-cols-3 gap-2 text-center pt-1">
                            <div class="bg-slate-900/70 p-2.5 rounded-lg border border-slate-700/50">
                                <div class="text-[11px] text-slate-400 font-medium">석차 백분율</div>
                                <div class="text-base font-black text-emerald-400 mt-0.5">${displayPercentile}</div>
                            </div>
                            <div class="bg-slate-900/70 p-2.5 rounded-lg border border-slate-700/50">
                                <div class="text-[11px] text-slate-400 font-medium">내신 석차</div>
                                <div class="text-base font-black text-sky-400 mt-0.5">${displayRank}<span class="text-[10px] text-slate-400 font-normal"> / ${displayTotal}명</span></div>
                            </div>
                            <div class="bg-slate-900/70 p-2.5 rounded-lg border border-slate-700/50">
                                <div class="text-[11px] text-slate-400 font-medium">합격권 학교 수</div>
                                <div class="text-base font-black text-amber-400 mt-0.5">${passSchoolCount}개교 <span class="text-[10px] text-slate-400 font-normal">(${passCount}개)</span></div>
                            </div>
                        </div>
                    </div>

                    <!-- 고교별 학생 본인 산출점수 (인쇄 시 스크롤 제거 및 펼침) -->
                    <div class="p-4 rounded-xl bg-slate-800/60 border border-slate-700/50 space-y-2.5">
                        <div class="flex items-center justify-between text-xs text-text-muted border-b border-slate-700/40 pb-1.5 flex-wrap gap-1">
                            <span class="font-bold text-slate-300 flex items-center gap-1.5">
                                <span>🎯</span> 학생 본인 고교별 공식 환산 점수
                                <span class="text-[10px] text-indigo-400 font-normal bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20">💡 학교를 누르면 상세 산출표 열림</span>
                            </span>
                            <span class="text-[11px] text-emerald-400 font-bold">100% 자동 산출</span>
                        </div>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-0.5 max-h-36 overflow-y-auto custom-scrollbar prediction-scores-scroll">
                            ${schoolScoresHTML || '<div class="text-xs text-slate-400 p-2 text-center col-span-2">산출된 고교 점수가 없습니다.</div>'}
                        </div>
                    </div>
                </div>

                <!-- 툴바: 필터 토글 -->
                <div class="flex items-center justify-between gap-3 shrink-0 flex-wrap print:hidden">
                    <div class="inline-flex rounded-xl bg-slate-900 p-1 border border-slate-700/60 text-xs">
                        <button id="filterAllPredictionsBtn" class="px-3.5 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${activeFilter === 'all' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}">
                            전체 고교·전형 보기 (${analysisList.length})
                        </button>
                        <button id="filterPassPredictionsBtn" class="px-3.5 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${activeFilter === 'pass' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}">
                            ✅ 지원 가능(합격권)만 보기 (${passCount})
                        </button>
                    </div>
                    <div class="text-xs text-text-muted flex items-center gap-3">
                        <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-emerald-400"></span> 안정(+5점 이상)</span>
                        <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-yellow-400"></span> 적정(0~+5점)</span>
                        <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-orange-400"></span> 소신(-5~0점)</span>
                        <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-rose-400"></span> 도전(-5점 미만)</span>
                    </div>
                </div>

                <!-- 테이블 영역 (기준연도, 고교명, 전형구분 묶음 헤더) -->
                <div class="overflow-y-auto flex-1 rounded-xl border border-slate-700/60 bg-slate-900/60 custom-scrollbar prediction-table-container">
                    <table class="w-full text-left border-collapse text-xs">
                        <thead class="bg-slate-800/90 text-text-muted font-bold text-center border-b border-slate-700/60 sticky top-0 z-10 whitespace-nowrap">
                            <tr>
                                <th class="p-3 text-center w-24 border-r border-slate-700/60">기준 연도</th>
                                <th class="p-3 text-left pl-3.5 w-36 border-r border-slate-700/60">고교명</th>
                                <th class="p-3 text-center w-28 border-r border-slate-700/60">전형 구분</th>
                                <th class="p-3 text-left pl-3 w-40 border-r border-slate-700/60">학과명</th>
                                <th class="p-3 text-right w-32 text-indigo-300 border-r border-slate-700/60">본인 환산점수</th>
                                <th class="p-3 text-right w-36 text-slate-200 border-r border-slate-700/60">고교 합격선(최저/평균)</th>
                                <th class="p-3 text-right w-28 border-r border-slate-700/60">점수 차이</th>
                                <th class="p-3 text-center w-28">합격 예측</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tableRowsHTML}
                        </tbody>
                    </table>
                </div>

                <!-- 하단 푸터 액션 바 (디자인 대폭 개선) -->
                <div class="flex items-center justify-between border-t border-slate-700/60 pt-4 shrink-0 flex-wrap gap-3 print:hidden">
                    <div class="text-xs text-slate-400">
                        * 합격 예측은 각 고교 공식 산출 공식 및 과거 입결을 바탕으로 산정된 참고 지표입니다.
                    </div>
                    <div class="flex items-center gap-2.5">
                        <button id="goToCounselFromPredictionBtn" class="bg-linear-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-black px-6 py-2.5 text-xs rounded-xl flex items-center gap-2 shadow-lg shadow-indigo-500/30 cursor-pointer active:scale-95 transition-all">
                            <span class="text-sm">💬</span> 1:1 진학 상담 시작
                        </button>
                        <button id="closePredictionModalFooterBtn" class="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 font-bold px-5 py-2.5 text-xs rounded-xl cursor-pointer active:scale-95 transition-all">
                            닫기
                        </button>
                    </div>
                </div>
            </div>
        `;

        // 모달 내부 이벤트 직접 바인딩 (안전하고 확실함)
        modal.querySelector('#closePredictionModalBtn')?.addEventListener('click', () => modal.remove());
        modal.querySelector('#closePredictionModalFooterBtn')?.addEventListener('click', () => modal.remove());
        modal.querySelector('#printPredictionModalBtn')?.addEventListener('click', () => {
            printOnly('prediction', 'portrait');
        });
        modal.querySelector('#filterAllPredictionsBtn')?.addEventListener('click', () => {
            activeFilter = 'all';
            renderModalContent();
        });
        modal.querySelector('#filterPassPredictionsBtn')?.addEventListener('click', () => {
            activeFilter = 'pass';
            renderModalContent();
        });
        modal.querySelector('#goToCounselFromPredictionBtn')?.addEventListener('click', () => {
            modal.remove();
            openStudentModal(classNum, studentNum, studentName);
        });

        // 고교별 환산점수 카드 클릭 시 상세 산출 모달 오픈 (일반, 특별전형 각각)
        modal.querySelectorAll('.prediction-score-item').forEach(card => {
            card.addEventListener('click', () => {
                const sch = card.dataset.school;
                const trk = card.dataset.track;
                const targetRes = (fullStudent?.schoolResults || []).find(r => 
                    normalizeSchoolName(r.schoolName) === normalizeSchoolName(sch) &&
                    normalizeTrack(r.trackName) === normalizeTrack(trk)
                );
                if (targetRes) {
                    showSchoolScoreDetailModal(studentName, classNum, studentNum, targetRes, fullStudent);
                }
            });
        });

        // 테이블 내 본인 환산점수 클릭 시 상세 산출 모달 오픈
        modal.querySelectorAll('.prediction-score-row-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const sch = btn.dataset.school;
                const trk = btn.dataset.track;
                const targetRes = (fullStudent?.schoolResults || []).find(r => 
                    normalizeSchoolName(r.schoolName) === normalizeSchoolName(sch) &&
                    normalizeTrack(r.trackName) === normalizeTrack(trk)
                );
                if (targetRes) {
                    showSchoolScoreDetailModal(studentName, classNum, studentNum, targetRes, fullStudent);
                }
            });
        });
    };

    renderModalContent();

    // ESC 키로 닫기
    const handleEsc = (e) => {
        if (e.key === 'Escape') {
            modal.remove();
            window.removeEventListener('keydown', handleEsc);
        }
    };
    window.addEventListener('keydown', handleEsc);
}






// ===== 학생 개인 진학상담 종합 모달 =====
window.openStudentModal = openStudentModal;
window.openMatrixModal = openMatrixModal;

window.openStudentModal = openStudentModal;
window.renderAdminScreen = renderAdminScreen;
window.renderTeacherScreen = renderTeacherScreen;

async function openStudentModal(classNum, studentNum, name) {
    // 기존 모달 제거
    document.getElementById('studentDetailModal')?.remove();

    // 로딩 모달 표시
    const modalEl = document.createElement('div');
    modalEl.id = 'studentDetailModal';
    modalEl.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto';
    modalEl.innerHTML = `
        <div class="glass-card p-8 w-full max-w-4xl text-center">
            <span class="spinner"></span> <span class="text-white ml-2">${escapeHtml(name)} 학생의 고교별 산출 데이터를 분석하는 중...</span>
        </div>
    `;
    document.body.appendChild(modalEl);

    try {
        const [fullData, cutoffs, official, directApps] = await Promise.all([
            window.go.main.App.GetStudentFullDetail(classNum, studentNum, name),
            window.go.main.App.GetCutoffs().catch(() => []),
            window.go.main.App.GetOfficialAdmissionData().catch(() => ({ items: [] })),
            window.go.main.App.GetStudentApplications ? window.go.main.App.GetStudentApplications(classNum, String(studentNum), name).catch(() => []) : Promise.resolve([]),
        ]);

        if (fullData) {
            if ((!fullData.applications || fullData.applications.length === 0) && Array.isArray(directApps) && directApps.length > 0) {
                fullData.applications = directApps;
            }
        }

        renderStudentModalContent(modalEl, classNum, studentNum, name, fullData, cutoffs, official?.items || []);
    } catch (err) {
        modalEl.innerHTML = `
            <div class="glass-card p-8 w-full max-w-md text-center">
                <div class="text-danger text-4xl mb-3">⚠️</div>
                <div class="text-white font-bold mb-4">데이터를 불러오지 못했습니다</div>
                <div class="text-text-muted text-sm mb-6">${escapeHtml(String(err))}</div>
                <button type="button" class="btn-secondary w-full" id="closeStudentDetailErrBtn">닫기</button>
            </div>
        `;
        modalEl.querySelector('#closeStudentDetailErrBtn')?.addEventListener('click', () => modalEl.remove());
    }
}

// 모달 내용 렌더링
function renderStudentModalContent(modalEl, classNum, studentNum, name, data, cutoffs, officialItems = []) {
    const todayDate = new Date().toISOString().split('T')[0];

    // 학교명 정규화 헬퍼 (마이스터, 에너지, 애니원 등 고유 명칭은 보존하고 고등학교/고 접미사만 정리)
    const cleanSchoolName = (sch) => {
        let s = String(sch || '').replace(/\s+/g, '');
        return s.replace(/고등학교$/, '').replace(/공업고등학교$/, '공고').replace(/공업고$/, '공고').replace(/고$/, '');
    };
    const isSameSchool = (s1, s2) => {
        if (!s1 || !s2) return false;
        const raw1 = String(s1).trim();
        const raw2 = String(s2).trim();
        if (raw1 === raw2) return true;
        return cleanSchoolName(raw1) === cleanSchoolName(raw2);
    };
    const isSameWishItem = (item, sch, trk) => {
        if (!item) return false;
        return isSameSchool(item.schoolName, sch) && String(item.trackName || '').trim() === String(trk || '').trim();
    };
    const normalizeDept = (dept) => String(dept || '').replace(/\s+/g, '');

    // 학생별 관심학교(장바구니) 목록 로드 (모든 키 포맷 호환)
    const wishlistKey = `phgc_wishlist_${classNum}_${studentNum}`;
    const possibleKeys = [
        wishlistKey,
        `phgc_wishlist_${classNum}_${parseInt(studentNum, 10)}`,
        `phgc_wishlist_${classNum}_${String(studentNum).padStart(2, '0')}`
    ];
    let wishlist = [];
    for (const key of possibleKeys) {
        try {
            const raw = localStorage.getItem(key);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    wishlist = parsed;
                    break;
                }
            }
        } catch (_) {}
    }

    // 학교별 합격 가능성 카드 목록 생성
    let cardsHTML = '';

    data.schoolResults.forEach((r, rIdx) => {
        const isMeisterSchool = ['울산마이스터', '울산에너지', '현대공업'].some(kw => r.schoolName.includes(kw));
        const schoolCat = isMeisterSchool ? 'meister' : 'special';
        const isAlreadyWish = wishlist.some(w => isSameWishItem(w, r.schoolName, r.trackName));
        const officialForSchool = (officialItems || []).filter(item =>
            String(item.schoolName || '').includes(r.schoolName.substring(0, 4)) &&
            (!item.track || String(item.track).includes(r.trackName) || r.trackName.includes(String(item.track)))
        ).sort((a, b) => Number(b.admissionYear || 0) - Number(a.admissionYear || 0));
        const officialPrimary = officialForSchool.find(item => Number(item.minAcceptedScore || item.minValue || 0) > 0);
        // 해당 학교 및 전형의 학과별 커트라인 목록 찾기 (최신 연도 기준 학과별 1건씩 정돈)
        const rawDepts = (cutoffs || []).filter(c =>
            c.schoolName.includes(r.schoolName.substring(0, 4)) &&
            (c.track.includes(r.trackName) || r.trackName.includes(c.track)) &&
            c.department && c.department !== '공통' && c.minValue > 0
        ).sort((a, b) => b.year - a.year || a.department.localeCompare(b.department, 'ko'));

        // 학과별로 가장 최신 연도의 데이터만 1건씩 보존하여 드롭다운 중복 제거
        const deptMap = new Map();
        rawDepts.forEach(c => {
            const dNorm = normalizeDept(c.department);
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
        (cutoffs || []).filter(sameSchoolTrack).sort((a, b) => {
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
            const found = (cutoffs || []).find(c => c.schoolName.includes(r.schoolName.substring(0, 4)) && c.track.includes(r.trackName) && c.minValue > 0);
            if (found) {
                defaultCutoff = found.minValue;
                defaultAvg = found.avgValue;
            } else if (officialPrimary) {
                defaultCutoff = Number(officialPrimary.minAcceptedScore || officialPrimary.minValue);
                defaultAvg = Number(officialPrimary.avgAcceptedScore || officialPrimary.avgValue || 0);
            }
        }

        // 합격 가능성 판단 헬퍼
        const getCutoffBadgeAndGauge = (cutoffVal) => {
            let badge = '';
            let color = 'bg-primary';
            let pct = (r.totalScore / r.totalMax) * 100;
            if (cutoffVal && cutoffVal > 0) {
                if (r.totalScore >= cutoffVal + 5) {
                    badge = '<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-success/20 text-success border border-success/30">🟢 안정권</span>';
                    color = 'bg-success';
                } else if (r.totalScore >= cutoffVal) {
                    badge = '<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-warning/20 text-warning border border-warning/30">🟡 적정/경계</span>';
                    color = 'bg-warning';
                } else {
                    badge = '<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-danger/20 text-danger border border-danger/30">🔴 소신/주의</span>';
                    color = 'bg-danger';
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

        const hasRegisteredWish = (wishlist && wishlist.length > 0) || (data.applications || []).some(a => a.schoolName && a.schoolName.trim());
        const isMatchedSchool = isAlreadyWish || (data.applications || []).some(a => a.schoolName && isSameSchool(a.schoolName, r.schoolName));
        // 장바구니/희망학교가 등록된 학생: 등록된 학교만 인쇄, 아예 등록 안 한 학생: 전체 학교 인쇄
        let schoolPrintClass = '';
        if (hasRegisteredWish) {
            schoolPrintClass = isMatchedSchool ? 'counsel-print-target-school' : 'counsel-print-unregistered-school';
        } else {
            schoolPrintClass = 'counsel-print-target-school';
        }

        cardsHTML += `
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
                    ${officialForSchool.slice(0, 3).map(item => `<div>${item.admissionYear || '-'}학년도 · ${item.department || '학교 전체'} · ${item.track || r.trackName}${Number(item.maxAcceptedScore || 0) > 0 ? ` · 최고합격 ${Number(item.maxAcceptedScore)}점` : ''}${Number(item.minAcceptedScore || item.minValue || 0) > 0 ? ` · 최저합격 ${Number(item.minAcceptedScore || item.minValue)}점` : ''}${Number(item.avgAcceptedScore || item.avgValue || 0) > 0 ? ` · 평균합격 ${Number(item.avgAcceptedScore || item.avgValue)}점` : ''}<span class="text-slate-400"> · 출처: ${item.source || '-'} · 확인: ${item.verifiedAt || '-'}</span></div>`).join('')}
                </div>` : ''}

                ${cutoffHistory.length > 0 ? `
                <div class="text-[11px] text-slate-300 bg-slate-900/50 px-3 py-2 rounded-lg border border-slate-700/40 space-y-1">
					<div class="font-bold text-violet-200">🏫 우리 학교 누적 결과 <span class="font-normal text-slate-400">(수기 입력·합격자 결과)</span></div>
					<div><span class="font-bold text-indigo-200">연도별 합격선:</span>
					${cutoffHistory.map((c, index) => `<span class="ml-2 ${index === 0 ? 'text-emerald-300 font-bold' : ''}">${c.year} ${c.department || '학교 전체'} ${c.minValue}점</span>`).join('')}</div>
					<div class="text-slate-400">직전 ${cutoffHistory[0].year}학년도 ${cutoffHistory[0].minValue}점 · 최근 ${Math.min(3, cutoffHistory.length)}년 평균 ${recent3Average.toFixed(2)}점${cutoffHistory.length >= 4 ? ` · 최근 ${Math.min(5, cutoffHistory.length)}년 평균 ${recent5Average.toFixed(2)}점` : ''}</div>
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

    const extra = data.extraData || {};

    // 학생 관심학교(장바구니) HTML 생성 헬퍼
    const renderWishlistHTML = (list) => {
        if (!list || list.length === 0) {
            return `
                <div class="p-3.5 rounded-xl bg-slate-900/60 border border-dashed border-indigo-500/30 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                    <span class="text-base">📌</span>
                    <span>아직 등록된 관심학교가 없습니다. 아래 학교 목록에서 <strong class="text-amber-300">[⭐ 관심 담기]</strong>를 누르면 여기에 추가되며, <strong class="text-indigo-300">[📝 희망학교 입력]</strong>으로 지원서에 1초 만에 자동 등록됩니다.</span>
                </div>
            `;
        }

        const itemsHTML = list.map(item => `
            <div class="p-3 rounded-xl bg-slate-800/90 border border-indigo-500/40 shadow-sm flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap hover:border-indigo-400/60 transition-all">
                <div class="space-y-1">
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="font-bold text-white text-sm flex items-center gap-1.5">
                            <span class="text-amber-300">⭐</span> ${escapeHtml(item.schoolName)}
                        </span>
                        <span class="text-[10px] px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-500/40 font-semibold">
                            ${escapeHtml(item.trackName)}전형
                        </span>
                        <span class="text-xs">${item.badgeHTML || ''}</span>
                    </div>
                    <div class="text-xs text-slate-300 flex items-center gap-2">
                        <span>내신 환산점: <strong class="text-emerald-300 font-mono">${Number(item.totalScore).toFixed(2)}</strong> <span class="text-slate-500">/ ${item.totalMax}점</span></span>
                    </div>
                </div>
                <div class="flex items-center gap-1.5 shrink-0 ml-auto sm:ml-0">
                    <button type="button" class="btn-primary text-xs px-3 py-1.5 font-bold flex items-center gap-1 shadow-sm btn-wishlist-apply cursor-pointer"
                            data-school="${escapeAttr(item.schoolName)}" data-track="${escapeAttr(item.trackName)}" data-cat="${escapeAttr(item.category || 'meister')}" data-score="${item.totalScore}" data-max="${item.totalMax}" title="해당 학교 정보로 희망원서 자동 등록창 열기">
                        <span>📝</span> 희망학교 입력
                    </button>
                    <button type="button" class="p-1.5 text-xs text-slate-400 hover:text-danger rounded hover:bg-slate-700/50 transition-colors btn-wishlist-remove cursor-pointer"
                            data-school="${escapeAttr(item.schoolName)}" data-track="${escapeAttr(item.trackName)}" title="관심학교에서 제거">
                        ✕
                    </button>
                </div>
            </div>
        `).join('');

        return `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                ${itemsHTML}
            </div>
        `;
    };

    modalEl.innerHTML = `
        <div class="glass-card print-document p-6 md:p-8 w-full max-w-6xl max-h-[92vh] overflow-y-auto space-y-6 print-modal relative" id="printReportArea">
            <!-- 모달 헤더 (스크롤 시에도 우측 상단에 고정되어 창 닫기 버튼이 항상 보임) -->
            <div class="sticky -top-6 md:-top-8 -mx-6 md:-mx-8 px-6 md:px-8 py-3.5 bg-slate-900/95 backdrop-blur-md z-40 border-b border-slate-700/80 flex items-center justify-between gap-4 flex-wrap sm:flex-nowrap shadow-lg">
                <div class="min-w-0">
                    <h2 class="text-2xl font-black text-white flex items-center gap-2 truncate">
                        👨‍🎓 ${escapeHtml(name)} <span class="text-base text-slate-400 font-normal">(${escapeHtml(classNum)}반 ${escapeHtml(studentNum)}번)</span>
                    </h2>
                    <p class="text-xs text-text-muted mt-0.5">울산 특목·마이스터·특성화고 진학 상담 분석표 (3-1 누적)</p>
                </div>
                <div class="flex items-center gap-2.5 no-print shrink-0 flex-nowrap">
                    <label class="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer bg-slate-800 hover:bg-slate-700 px-3 py-2 rounded-xl border border-slate-700 select-none transition-all h-9 whitespace-nowrap" title="체크 시 상담 일지 메모 내용도 함께 인쇄됩니다">
                        <input type="checkbox" id="printIncludeCounselCheck" class="rounded accent-indigo-500 cursor-pointer w-4 h-4" />
                        <span class="font-medium">상담 메모 포함</span>
                    </label>
                    <button id="printReportBtn" class="px-4 h-9 rounded-xl font-bold text-xs bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5 shadow-md shadow-indigo-500/20 transition-all cursor-pointer whitespace-nowrap active:scale-95">
                        <span>🖨️</span> <span>인쇄 / PDF</span>
                    </button>
                    <button id="closeModalBtn" class="px-3.5 h-9 rounded-xl font-bold text-xs bg-rose-950/80 hover:bg-rose-600 text-rose-200 hover:text-white border border-rose-500/50 shadow-md shadow-rose-950/40 transition-all cursor-pointer flex items-center justify-center whitespace-nowrap active:scale-95" title="상담 모달 닫기 (단축키: ESC)">
                        <span class="text-base font-black">✕</span> <span class="ml-1 font-bold">창 닫기</span>
                    </button>
                </div>
            </div>

            <!-- 1. 기본 성적 요약 카드 -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div class="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/50 text-center">
                    <div class="text-xs text-text-muted mb-1">전과목 평균 성취도</div>
                    <div class="text-xl font-bold text-primary">${data.allAverage.toFixed(2)} <span class="text-xs text-slate-400 font-normal">/ 5.0</span></div>
                </div>
                <div class="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/50 text-center">
                    <div class="text-xs text-text-muted mb-1">미인정 출결 (1학기)</div>
                    <div class="text-xl font-bold ${data.absenceDays > 0 ? 'text-danger' : 'text-success'}">
                        ${data.absenceDays}일 <span class="text-[11px] text-slate-400 font-normal">(결석${data.rawAbsenceDays || 0}일, 기타${(data.rawLateCount || 0) + (data.rawEarlyCount || 0) + (data.rawResultCount || 0)}회)</span>
                    </div>
                </div>
                <div class="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/50 text-center">
                    <div class="text-xs text-text-muted mb-1">인정 봉사시간</div>
                    <div class="text-xl font-bold text-white">${data.totalVolunteerHours}시간 <span class="text-[11px] text-slate-400 font-normal">(기본${data.volunteerHours}+추가${data.addVolunteerHours})</span></div>
                </div>
                <div class="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/50 text-center">
                    <div class="text-xs text-text-muted mb-1">후기 일반고 내신 / 석차백분율</div>
                    <div class="text-xl font-bold ${data.generalHSPercentile <= (window.generalGuideCutoff || 80) ? 'text-success' : (data.generalHSPercentile <= (window.generalGuideCutoff || 80) + 10 ? 'text-warning' : 'text-danger')}">${data.generalHSTotalScore.toFixed(2)}점 <span class="text-[10px] font-normal text-amber-300">${data.generalHSProjected ? '예상' : '확정'}</span></div>
                    <div class="text-[11px] text-slate-400">교과 ${data.generalHSAcademicScore.toFixed(2)} / 비교과 ${data.generalHSNonAcademicScore.toFixed(2)} · ${data.generalHSPercentile.toFixed(2)}%</div>
                </div>
            </div>

            <!-- 2. 수기 입력 가산점 및 리더십 영역 (출결·봉사는 나이스 자동 산출) -->
            ${(() => {
            const isViewer = window.currentUser && window.currentUser.Role === 'viewer';

            return `
                <div class="p-4 rounded-xl bg-indigo-950/20 border border-indigo-500/30 space-y-3 non-academic-input-section no-print">
                    <div class="flex items-center justify-between flex-wrap gap-2">
                        <div class="flex items-center gap-2">
                            <span class="text-base">✏️</span>
                            <div>
                                <h3 class="font-bold text-sm text-indigo-200 flex items-center gap-2">
                                    전형별 가산점 및 리더십 수기 입력
                                    ${isViewer ? '<span class="text-[11px] text-warning font-normal">※ 진로부장은 조회 전용 모드입니다.</span>' : ''}
                                </h3>
                                <p class="text-[11px] text-slate-400 mt-0.5">출결 및 봉사점수는 <strong>나이스 공식 데이터에서 100% 자동 산출</strong>되므로 별도 입력이 필요 없습니다.</p>
                            </div>
                        </div>
                        ${!isViewer ? `
                        <button id="saveExtraBtn" class="px-4 h-9 rounded-xl font-bold text-xs bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5 shadow-md shadow-indigo-500/20 transition-all cursor-pointer whitespace-nowrap active:scale-95 no-print">
                            <span>💾</span> <span>저장 후 재계산</span>
                        </button>
                        ` : ''}
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs pt-1">
                        <!-- ① 마이스터고 리더십 가산점 -->
                        <section class="bg-slate-900/70 p-3.5 rounded-xl border border-indigo-500/30 space-y-2">
                            <div class="flex items-center justify-between">
                                <b class="text-indigo-200 text-sm flex items-center gap-1.5">
                                    <span>🏛️</span> 마이스터고 리더십 활동 가산점
                                </b>
                                <span class="text-[11px] text-amber-300 font-semibold">최대 10점</span>
                            </div>
                            <div class="flex items-center gap-3 pt-1">
                                <label class="text-slate-300 font-medium whitespace-nowrap">인정 리더십(학기):</label>
                                <div class="relative w-32">
                                    <input type="number" id="inputLeadershipTerms" min="0" max="4" step="1"
                                           class="input-field w-full text-center py-1.5 text-sm font-bold text-amber-300"
                                           value="${data.leadershipTerms || 0}" ${isViewer ? 'disabled' : ''}/>
                                    <span class="absolute right-2.5 top-2 text-[11px] text-slate-400 pointer-events-none">학기</span>
                                </div>
                                <span class="text-xs text-slate-400">= 가산점 <strong class="text-amber-300 font-mono">${Math.min(10, ((data.leadershipTerms || 0) * 2.5)).toFixed(1)}</strong>점</span>
                            </div>
                            <p class="text-[10px] text-slate-400 mt-1">※ 반장·부반장·전교 학생회장·부회장 활동만 인정 (한 학기당 2.5점, 최대 4학기 10점)</p>
                        </section>

                        <!-- ② 후기 일반고 비교과 가산점 -->
                        <section class="bg-slate-900/70 p-3.5 rounded-xl border border-emerald-500/30 space-y-2">
                            <div class="flex items-center justify-between">
                                <b class="text-emerald-200 text-sm flex items-center gap-1.5">
                                    <span>🏫</span> 후기 일반고 창체·행발 가산점
                                </b>
                                <span class="text-[11px] text-emerald-300 font-semibold">각 학년당 +1점</span>
                            </div>
                            <div class="grid grid-cols-2 gap-2 pt-1">
                                <div class="rounded-lg bg-slate-800/80 border border-slate-700 p-2.5 space-y-1.5">
                                    <span class="text-[11px] font-bold text-slate-300 block">창체 활동 가산점</span>
                                    <div class="flex items-center gap-2 flex-wrap">
                                        ${[1, 2, 3].map(g => `
                                            <label class="inline-flex items-center gap-1 text-xs text-slate-200 cursor-pointer">
                                                <input type="checkbox" id="checkChangche${g}" class="accent-indigo-500 rounded cursor-pointer" ${extra['changche_' + g] ? 'checked' : ''} ${isViewer ? 'disabled' : ''}/>
                                                <span>${g}학년</span>
                                            </label>
                                        `).join('')}
                                    </div>
                                </div>
                                <div class="rounded-lg bg-slate-800/80 border border-slate-700 p-2.5 space-y-1.5">
                                    <span class="text-[11px] font-bold text-slate-300 block">행발(행동발달) 가산점</span>
                                    <div class="flex items-center gap-2 flex-wrap">
                                        ${[1, 2, 3].map(g => `
                                            <label class="inline-flex items-center gap-1 text-xs text-slate-200 cursor-pointer">
                                                <input type="checkbox" id="checkHaengbal${g}" class="accent-indigo-500 rounded cursor-pointer" ${extra['haengbal_' + g] ? 'checked' : ''} ${isViewer ? 'disabled' : ''}/>
                                                <span>${g}학년</span>
                                            </label>
                                        `).join('')}
                                    </div>
                                </div>
                            </div>
                            <p class="text-[10px] text-slate-400 mt-1">※ 일반고 비교과(총 50점) 산출 시 각 해당 학년의 가산점으로 직결됩니다.</p>
                        </section>
                    </div>
                </div>
                `;
        })()}

            <!-- ⭐ 학생 희망·관심학교 장바구니 영역 (화면 상담용, 인쇄 시 자동 제외) -->
            <div id="studentWishlistSection" class="p-4 rounded-2xl bg-indigo-950/30 border border-indigo-500/50 space-y-3 shadow-lg no-print">
                <div class="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-indigo-500/20">
                    <div class="flex items-center gap-2">
                        <span class="text-xl">🛒</span>
                        <div>
                            <h3 class="font-black text-sm text-indigo-200 flex items-center gap-1.5">
                                학생 관심·희망학교 장바구니
                                <span id="wishlistCountBadge" class="text-[11px] px-2 py-0.5 rounded-full bg-indigo-600 text-white font-bold ml-1">${wishlist.length}</span>
                            </h3>
                            <p class="text-[11px] text-slate-400 mt-0.5">상담 중 목표하는 고교를 장바구니에 담고, [희망학교 입력]을 누르면 원서 서식에 자동 입력됩니다.</p>
                        </div>
                    </div>
                </div>
                <div id="wishlistContainer">
                    ${renderWishlistHTML(wishlist)}
                </div>
            </div>

            <!-- 3. 학교별 합격 가능성 리스트 -->
            <div class="space-y-3">
                <div class="flex items-center justify-between flex-wrap gap-2">
                    <div>
                        <h3 class="font-bold text-sm text-white">🏫 목표 고교별 산출 점수 및 합격 가능성</h3>
                        <p class="text-[11px] text-text-muted mt-0.5">* 면접 점수를 제외한 1차 서류 전형 기준</p>
                    </div>
                    <!-- 탭 메뉴: 직전년도 / 최근 3개년 평균 / 최근 5개년 평균 (인쇄 시 제외) -->
                    <div class="flex items-center gap-2 flex-wrap no-print">
                        <span class="text-xs font-bold text-slate-300">판정 기준:</span>
                        <div class="inline-flex rounded-lg bg-slate-800 p-0.5 border border-slate-700 shadow-inner" id="cutoffBaselineTabs">
                            <button type="button" class="cutoff-tab-btn active px-3 py-1.5 text-xs font-bold rounded-md bg-primary text-white transition-all cursor-pointer" data-mode="last">
                                🎯 직전 1개년
                            </button>
                            <button type="button" class="cutoff-tab-btn px-3 py-1.5 text-xs font-bold rounded-md text-slate-400 hover:text-white transition-all cursor-pointer" data-mode="avg3">
                                📊 최근 3년 평균
                            </button>
                            <button type="button" class="cutoff-tab-btn px-3 py-1.5 text-xs font-bold rounded-md text-slate-400 hover:text-white transition-all cursor-pointer" data-mode="avg5">
                                📈 최근 5년 평균
                            </button>
                        </div>
                    </div>
                </div>

                <div class="p-2.5 rounded-xl bg-slate-900/60 border border-slate-700/60 flex items-center justify-between text-xs no-print">
                    <span id="cutoffBaselineDesc" class="text-indigo-200 font-medium">🎯 <strong>직전 1개년(작년)</strong> 커트라인 및 공식 발표자료를 기준으로 합격 가능성을 판정합니다.</span>
                    <span class="text-[11px] text-slate-400">탭을 클릭하면 실시간으로 신호등·게이지가 재계산됩니다</span>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-3" id="schoolCardsContainer">
                    ${cardsHTML}
                </div>
            </div>

            <!-- 4. 스마트 1:1 진학 상담 일지 영역 -->
            <div class="p-5 rounded-2xl bg-indigo-950/25 border border-indigo-500/40 space-y-4 shadow-xl counsel-section-container">
                <div class="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-indigo-500/20">
                    <div>
                        <h3 class="font-black text-sm text-indigo-200 flex items-center gap-2">
                            <span>📝</span> ${escapeHtml(name)} 학생 1:1 진학 상담 일지
                        </h3>
                        <p class="text-[11px] text-slate-400 mt-0.5">
                            🔒 <strong>개인 상담 비밀보장:</strong> 작성자 본인만 열람 가능하며, 관내 취합 및 인쇄 시 기본적으로 상담 메모는 100% 자동 제외됩니다.
                        </p>
                    </div>
                    <span class="text-[11px] px-2.5 py-1 rounded-lg bg-indigo-900/60 text-indigo-300 border border-indigo-400/30 font-bold no-print">
                        로컬 독립 보안 모드
                    </span>
                </div>

                <!-- 비공개 상담 내용 (인쇄 시 체크 안하면 완전 숨김) -->
                <div class="counsel-private-content space-y-4">
                    <!-- 상담 작성 폼 -->
                    <div class="bg-slate-900/70 p-4 rounded-xl border border-slate-700/70 space-y-3 no-print">
                        <input type="hidden" id="counselRecordId" value="0" />
                        <div class="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                            <div class="sm:col-span-4">
                                <label class="block text-xs font-bold text-slate-300 mb-1">상담 날짜</label>
                                <input type="date" id="counselDateInput" class="input-field w-full text-xs font-mono font-bold text-indigo-200 py-1.5" value="${todayDate}" required />
                            </div>
                            <div class="sm:col-span-8">
                                <label class="block text-xs font-bold text-slate-300 mb-1">상담 목표/관련 고교 (선택)</label>
                                <input type="text" id="counselTargetSchoolInput" class="input-field w-full text-xs py-1.5" placeholder="예: 울산에너지고 신재생에너지과, 일반고 등" />
                            </div>
                        </div>

                        <!-- 스마트 빠른 태그 바 -->
                        <div>
                            <div class="text-[11px] text-slate-400 font-semibold mb-1 flex items-center gap-1">
                                <span>⚡</span> 스마트 빠른 태그 (클릭 시 내용에 자동 추가):
                            </div>
                            <div class="flex flex-wrap gap-1.5" id="counselQuickTags">
                                <button type="button" class="quick-tag-btn text-[11px] py-1 px-2.5 rounded-lg bg-indigo-950/60 hover:bg-indigo-900/80 text-indigo-300 border border-indigo-500/40 font-medium transition-all cursor-pointer" data-tag="[마이스터고 희망] ">마이스터고 희망</button>
                                <button type="button" class="quick-tag-btn text-[11px] py-1 px-2.5 rounded-lg bg-cyan-950/60 hover:bg-cyan-900/80 text-cyan-300 border border-cyan-500/40 font-medium transition-all cursor-pointer" data-tag="[특성화고 취업희망자전형] ">특성화 취업희망</button>
                                <button type="button" class="quick-tag-btn text-[11px] py-1 px-2.5 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-500/40 font-medium transition-all cursor-pointer" data-tag="[후기 일반고 안정권] ">일반고 안정권</button>
                                <button type="button" class="quick-tag-btn text-[11px] py-1 px-2.5 rounded-lg bg-amber-950/60 hover:bg-amber-900/80 text-amber-300 border border-amber-500/40 font-medium transition-all cursor-pointer" data-tag="[내신 추이 및 비교과 상담] ">성적·비교과 추이</button>
                                <button type="button" class="quick-tag-btn text-[11px] py-1 px-2.5 rounded-lg bg-purple-950/60 hover:bg-purple-900/80 text-purple-300 border border-purple-500/40 font-medium transition-all cursor-pointer" data-tag="[학부모 전화 상담 완료] ">학부모 상담</button>
                                <button type="button" class="quick-tag-btn text-[11px] py-1 px-2.5 rounded-lg bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-500/40 font-medium transition-all cursor-pointer" data-tag="[원서 변경 고민 중] ">원서 변경 고민</button>
                            </div>
                        </div>

                        <!-- 상담 내용 입력창 -->
                        <div>
                            <textarea id="counselContentInput" rows="3" class="input-field w-full text-xs leading-relaxed py-2 px-3 resize-y" placeholder="학생의 진로 희망, 강점 및 약점, 학부모 상담 내용, 추천 고교 등을 자유롭게 기록하세요. (Ctrl+Enter를 누르면 바로 저장됩니다)"></textarea>
                        </div>

                        <!-- 액션 버튼 -->
                        <div class="flex items-center justify-between pt-1">
                            <span class="text-[11px] text-slate-500 font-mono">단축키: Ctrl + Enter</span>
                            <div class="flex items-center gap-2">
                                <button type="button" id="cancelCounselEditBtn" class="btn-secondary text-xs px-3 py-1.5 font-semibold hidden">수정 취소</button>
                                <button type="button" id="saveCounselBtn" class="btn-primary text-xs px-4 py-1.5 font-bold inline-flex items-center gap-1.5 shadow-md shadow-indigo-600/30 cursor-pointer">
                                    <span>💾</span> <span id="saveCounselBtnText">상담 일지 저장</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- 누적 상담 타임라인 목록 -->
                    <div class="space-y-2">
                        <div class="flex items-center justify-between">
                            <span class="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                                <span>📋</span> 누적 상담 이력 (<span id="counselRecordCount" class="text-indigo-400 font-bold">0</span>건)
                            </span>
                            <span class="text-[11px] text-slate-400">최신순 정렬</span>
                        </div>
                        <div id="counselRecordsList" class="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                            <div class="text-center py-6 text-slate-500 text-xs">
                                <span class="spinner" style="width:14px;height:14px;border-width:2px;"></span> 상담 일지를 불러오는 중...
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 인쇄 전용 프라이버시 안심 요약 배너 (상담 메모 포함 시 사용) -->
                <div class="counsel-print-summary hidden border-t border-slate-300 pt-3 mt-4 text-xs text-slate-700">
                    <div class="flex items-center justify-between">
                        <span><strong>📅 진학 상담 일자:</strong> ${todayDate}</span>
                        <span class="text-slate-500 text-[11px]">※ 학생 개인정보 및 상담 상세 메모는 비공개 처리되었습니다.</span>
                    </div>
                </div>
            </div>

            <!-- 인쇄 전용 공식 상담 확인 푸터 (학부모·학생 배부용 표준 서식) -->
            <div class="counsel-official-footer hidden pt-3 border-t border-slate-400 text-xs text-slate-800">
                <div class="flex items-center justify-between flex-wrap gap-2">
                    <span><strong>📅 진학 상담 일자:</strong> ${todayDate}</span>
                    <span><strong>상담 교사 확인:</strong> 3학년 ${escapeHtml(classNum)}반 담임 (인)</span>
                    <span><strong>학생·학부모 확인:</strong> ________________ (인)</span>
                </div>
            </div>

            <!-- 화면용 모달 하단 닫기 바 (스크롤 끝에서도 즉시 닫기 지원) -->
            <div class="pt-4 border-t border-slate-700/60 flex items-center justify-between flex-wrap gap-3 no-print">
                <div class="text-xs text-slate-400 flex items-center gap-1.5">
                    <span>💡</span> <span>키보드 <strong>ESC</strong> 키를 누르시거나 바깥 어두운 배경을 클릭하셔도 창이 닫힙니다.</span>
                </div>
                <button type="button" id="bottomCloseModalBtn" class="px-5 py-2.5 rounded-xl font-bold text-xs bg-rose-950/70 hover:bg-rose-600 text-rose-200 hover:text-white border border-rose-500/40 transition-all cursor-pointer flex items-center gap-1.5 shadow-md active:scale-95">
                    <span class="text-sm font-black">✕</span> <span>상담 모달 닫기 (ESC)</span>
                </button>
            </div>
        </div>
    `;

    // 상담 모달 안전 닫기 및 대시보드 자동 동기화
    const closeStudentCounselModal = () => {
        window.removeEventListener('keydown', handleEscKey);
        modalEl.remove();
        if (typeof window.refreshCurrentClass === 'function') {
            window.refreshCurrentClass();
        }
    };

    const handleEscKey = (e) => {
        if (e.key === 'Escape') {
            closeStudentCounselModal();
        }
    };
    window.addEventListener('keydown', handleEscKey);

    // 닫기 이벤트 (상단 헤더 + 하단 바)
    document.getElementById('closeModalBtn')?.addEventListener('click', closeStudentCounselModal);
    document.getElementById('bottomCloseModalBtn')?.addEventListener('click', closeStudentCounselModal);

    // 배경 클릭 시 닫기
    modalEl.addEventListener('click', (e) => {
        if (e.target === modalEl) closeStudentCounselModal();
    });

    let currentBaselineMode = 'last';

    // 기준선 탭 전환 함수 (직전 1개년 / 최근 3년 평균 / 최근 5년 평균)
    const applyBaselineMode = (mode) => {
        currentBaselineMode = mode;
        modalEl.querySelectorAll('.cutoff-tab-btn').forEach(btn => {
            const isActive = btn.dataset.mode === mode;
            btn.classList.toggle('active', isActive);
            btn.classList.toggle('bg-primary', isActive);
            btn.classList.toggle('text-white', isActive);
            btn.classList.toggle('text-slate-400', !isActive);
        });

        const descEl = document.getElementById('cutoffBaselineDesc');
        if (descEl) {
            if (mode === 'last') {
                descEl.innerHTML = '🎯 <strong>직전 1개년(작년)</strong> 커트라인 및 공식 발표자료를 기준으로 합격 가능성을 판정합니다.';
            } else if (mode === 'avg3') {
                descEl.innerHTML = '📊 <strong>최근 3개년 누적 평균선</strong>을 기준으로 합격 가능성을 판정합니다 (단년도 변동 완화).';
            } else if (mode === 'avg5') {
                descEl.innerHTML = '📈 <strong>최근 5개년 장기 평균선</strong>을 기준으로 합격 가능성을 판정합니다 (중장기 추세).';
            }
        }

        modalEl.querySelectorAll('.school-counsel-card').forEach(card => {
            const rIdx = card.id.replace('card_', '');
            const score = parseFloat(card.dataset.score);
            const totalMax = parseFloat(card.dataset.max);
            let cutoffVal = 0;
            let avgVal = 0;
            let labelText = '';

            if (mode === 'last') {
                const deptSel = card.querySelector('.dept-selector');
                if (deptSel) {
                    cutoffVal = parseFloat(deptSel.value) || 0;
                    avgVal = parseFloat(deptSel.selectedOptions[0]?.dataset.avg || 0);
                    labelText = '직전년도 최저';
                } else {
                    cutoffVal = parseFloat(card.dataset.lastCutoff) || 0;
                    avgVal = parseFloat(card.dataset.lastAvg) || 0;
                    labelText = '직전년도 최저';
                }
            } else if (mode === 'avg3') {
                cutoffVal = parseFloat(card.dataset.avg3Cutoff) || 0;
                labelText = '최근 3년 평균';
            } else if (mode === 'avg5') {
                cutoffVal = parseFloat(card.dataset.avg5Cutoff) || 0;
                labelText = '최근 5년 평균';
            }

            let badge = '';
            let color = 'bg-primary';
            let pct = (score / totalMax) * 100;

            if (cutoffVal && cutoffVal > 0) {
                if (score >= cutoffVal + 5) {
                    badge = '<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-success/20 text-success border border-success/30">🟢 안정권</span>';
                    color = 'bg-success';
                } else if (score >= cutoffVal) {
                    badge = '<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-warning/20 text-warning border border-warning/30">🟡 적정/경계</span>';
                    color = 'bg-warning';
                } else {
                    badge = '<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-danger/20 text-danger border border-danger/30">🔴 소신/주의</span>';
                    color = 'bg-danger';
                }
            } else {
                badge = `<span class="text-xs text-text-muted">만점의 ${pct.toFixed(1)}% (기준 부족)</span>`;
            }

            const badgeEl = document.getElementById(`badge_${rIdx}`);
            if (badgeEl) badgeEl.innerHTML = badge;

            const gaugeEl = document.getElementById(`gauge_${rIdx}`);
            if (gaugeEl) {
                gaugeEl.className = `gauge-fill ${color} h-2.5 rounded-full transition-all duration-500`;
                gaugeEl.style.width = `${Math.min(100, Math.max(5, pct))}%`;
            }

            const diffEl = document.getElementById(`diff_${rIdx}`);
            if (diffEl) {
                if (cutoffVal && cutoffVal > 0) {
                    const diff = score - cutoffVal;
                    diffEl.innerHTML = `
                        <span>합격 기준선(${labelText}): <strong class="text-slate-200">${cutoffVal.toFixed(1)}점</strong> ${avgVal > 0 ? `<span class="text-amber-300 font-medium">(평균 ${avgVal.toFixed(1)}점)</span>` : ''}</span>
                        <span>점수차: <strong class="${diff >= 0 ? 'text-success' : 'text-danger'}">${diff >= 0 ? '+' : ''}${diff.toFixed(2)}점</strong></span>
                    `;
                } else {
                    diffEl.innerHTML = `<span class="text-slate-500">※ 해당 기준(${labelText})의 누적 합격선 데이터가 부족합니다.</span>`;
                }
            }
        });
    };

    modalEl.querySelectorAll('.cutoff-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            applyBaselineMode(btn.dataset.mode);
        });
    });

    // 학과별 커트라인 선택 변경 이벤트 바인딩
    modalEl.querySelectorAll('.dept-selector').forEach(sel => {
        sel.addEventListener('change', () => {
            if (currentBaselineMode !== 'last') {
                applyBaselineMode('last');
            } else {
                applyBaselineMode('last');
            }
        });
    });

    // 수기 가산점 및 출결 저장 (담임 및 관리자만 가능)
    const saveBtn = document.getElementById('saveExtraBtn');
    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            saveBtn.disabled = true;
            saveBtn.textContent = '저장 중...';

            const leadershipTerms = Math.min(4, Math.max(0, parseInt(document.getElementById('inputLeadershipTerms')?.value) || 0));
            const newExtra = {
                leadership_terms: leadershipTerms,
                changche_1: Boolean(document.getElementById('checkChangche1')?.checked),
                changche_2: Boolean(document.getElementById('checkChangche2')?.checked),
                changche_3: Boolean(document.getElementById('checkChangche3')?.checked),
                haengbal_1: Boolean(document.getElementById('checkHaengbal1')?.checked),
                haengbal_2: Boolean(document.getElementById('checkHaengbal2')?.checked),
                haengbal_3: Boolean(document.getElementById('checkHaengbal3')?.checked),
            };

            try {
                await window.go.main.App.SaveStudentExtra(classNum, studentNum, name, JSON.stringify(newExtra));
                const updatedData = await window.go.main.App.GetStudentFullDetail(classNum, studentNum, name);
                renderStudentModalContent(modalEl, classNum, studentNum, name, updatedData, cutoffs);
            } catch (err) {
                alert('저장 실패: ' + err);
                saveBtn.disabled = false;
                saveBtn.textContent = '💾 저장 후 재계산';
            }
        });
    }

    // 인쇄/PDF 저장
    document.getElementById('printReportBtn')?.addEventListener('click', () => {
        const printArea = document.getElementById('printReportArea');
        const includeCounsel = document.getElementById('printIncludeCounselCheck')?.checked ?? false;

        if (printArea) {
            if (includeCounsel) {
                printArea.classList.add('include-private-counsel');
            } else {
                printArea.classList.remove('include-private-counsel');
            }
        }

        // [인쇄 직전 실시간 관심/희망학교 필터링 동기화]
        // 1. 등록된 관심학교(로컬스토리지 다중키) 및 희망원서(DB 데이터 + 화면 입력값) 실시간 수집
        const registeredSchoolNames = new Set();
        for (const key of possibleKeys) {
            try {
                const raw = localStorage.getItem(key);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (Array.isArray(parsed)) {
                        parsed.forEach(w => {
                            if (w.schoolName && w.schoolName.trim()) registeredSchoolNames.add(w.schoolName.trim());
                        });
                    }
                }
            } catch (_) {}
        }

        (data.applications || []).forEach(a => {
            if (a && a.schoolName && a.schoolName.trim()) registeredSchoolNames.add(a.schoolName.trim());
        });

        modalEl.querySelectorAll('.app-school-select, .app-school-input, select[name*="school"], input[name*="school"]').forEach(el => {
            if (el.value && el.value.trim()) registeredSchoolNames.add(el.value.trim());
        });

        // 2. 등록된 관심/희망학교가 1개 이상이면 등록된 학교 카드만 남기고 나머지는 물리적으로 display: none 강제
        const allCards = modalEl.querySelectorAll('.school-counsel-card');
        if (registeredSchoolNames.size > 0) {
            allCards.forEach(card => {
                const cardSchool = card.dataset.school || card.querySelector('.font-bold.text-white')?.textContent || '';
                const isMatched = Array.from(registeredSchoolNames).some(target => isSameSchool(target, cardSchool));
                if (isMatched) {
                    card.classList.remove('counsel-print-unregistered-school');
                    card.classList.add('counsel-print-target-school');
                    card.style.removeProperty('display');
                } else {
                    card.classList.remove('counsel-print-target-school');
                    card.classList.add('counsel-print-unregistered-school');
                    card.style.setProperty('display', 'none', 'important'); // 브라우저 인쇄 엔진에서 100% 완전 제외
                }
            });

            // 인쇄 대화상자가 닫힌 후 화면에서는 원래대로 복원
            window.addEventListener('afterprint', () => {
                allCards.forEach(card => {
                    card.style.removeProperty('display');
                });
            }, { once: true });
        } else {
            // 등록된 관심학교가 전혀 없는 학생의 경우에만 전체 학교 카드 출력
            allCards.forEach(card => {
                card.classList.remove('counsel-print-unregistered-school');
                card.classList.add('counsel-print-target-school');
                card.style.removeProperty('display');
            });
        }

        printOnly('report');
    });

    // ===== 스마트 1:1 진학 상담 일지 컨트롤러 =====
    const counselDateInput = document.getElementById('counselDateInput');
    const counselTargetSchoolInput = document.getElementById('counselTargetSchoolInput');
    const counselContentInput = document.getElementById('counselContentInput');
    const counselRecordId = document.getElementById('counselRecordId');
    const saveCounselBtn = document.getElementById('saveCounselBtn');
    const saveCounselBtnText = document.getElementById('saveCounselBtnText');
    const cancelCounselEditBtn = document.getElementById('cancelCounselEditBtn');
    const counselRecordsList = document.getElementById('counselRecordsList');
    const counselRecordCount = document.getElementById('counselRecordCount');

    let currentRecords = [];

    // 1. 상담 일지 목록 불러오기 (작성자 본인 기록만 로드)
    const loadCounselRecords = async () => {
        if (!counselRecordsList) return;
        try {
            if (!window.go?.main?.App?.GetStudentCounselingRecords) {
                counselRecordsList.innerHTML = `<div class="text-center py-4 text-slate-500 text-xs">상담 일지 기능 준비 중...</div>`;
                return;
            }
            currentRecords = await window.go.main.App.GetStudentCounselingRecords(classNum, studentNum, name) || [];
            counselRecordCount.textContent = currentRecords.length;

            if (currentRecords.length === 0) {
                counselRecordsList.innerHTML = `
                    <div class="p-6 rounded-xl bg-slate-900/40 border border-slate-800 text-center text-slate-400 space-y-1">
                        <div class="text-xl">💬</div>
                        <div class="text-xs font-semibold text-slate-300">작성된 상담 일지가 없습니다</div>
                        <div class="text-[11px] text-slate-500">학생과의 진로 희망 및 상담 내용을 위 입력창에 첫 기록으로 남겨보세요.</div>
                    </div>
                `;
                return;
            }

            counselRecordsList.innerHTML = currentRecords.map(r => `
                <div class="p-3.5 rounded-xl bg-slate-900/80 border border-slate-700/70 hover:border-indigo-500/40 transition-all space-y-2 group shadow-sm">
                    <div class="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-slate-800/80">
                        <div class="flex items-center gap-2 flex-wrap">
                            <span class="inline-flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-500/40 font-mono font-bold">
                                📅 ${escapeHtml(r.counselDate)}
                            </span>
                            ${r.targetSchool ? `
                                <span class="text-[11px] px-2 py-0.5 rounded-md bg-slate-800 text-indigo-200 border border-slate-700 font-medium">
                                    🏫 ${escapeHtml(r.targetSchool)}
                                </span>
                            ` : ''}
                            <span class="text-[10px] text-slate-400">
                                작성: <strong class="text-slate-300">${escapeHtml(r.authorName || '본인')}</strong>
                            </span>
                        </div>
                        <div class="flex items-center gap-1 opacity-90 group-hover:opacity-100 transition-opacity">
                            <button type="button" class="btn-edit-counsel text-[11px] py-0.5 px-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors cursor-pointer" data-id="${escapeAttr(r.id)}">
                                수정
                            </button>
                            <button type="button" class="btn-delete-counsel text-[11px] py-0.5 px-2 rounded bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 hover:text-rose-200 border border-rose-500/30 transition-colors cursor-pointer" data-id="${escapeAttr(r.id)}">
                                삭제
                            </button>
                        </div>
                    </div>
                    <div class="text-xs text-slate-200 whitespace-pre-wrap leading-relaxed px-0.5 font-sans">
                        ${escapeHtml(r.content)}
                    </div>
                </div>
            `).join('');

            // 수정 버튼 바인딩
            counselRecordsList.querySelectorAll('.btn-edit-counsel').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const id = parseInt(e.currentTarget.dataset.id);
                    const record = currentRecords.find(item => item.id === id);
                    if (record) {
                        counselRecordId.value = record.id;
                        counselDateInput.value = record.counselDate;
                        counselTargetSchoolInput.value = record.targetSchool || '';
                        counselContentInput.value = record.content;
                        saveCounselBtnText.textContent = '수정 내용 저장';
                        cancelCounselEditBtn.classList.remove('hidden');
                        counselContentInput.focus();
                    }
                });
            });

            // 삭제 버튼 바인딩
            counselRecordsList.querySelectorAll('.btn-delete-counsel').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = parseInt(e.currentTarget.dataset.id);
                    const confirmed = await showModalConfirm({
                        title: '상담 일지 삭제',
                        message: '이 상담 일지를 삭제하시겠습니까?<br><span class="text-xs text-rose-400">※ 삭제 후에는 복구할 수 없습니다.</span>',
                        confirmText: '삭제',
                        type: 'warning'
                    });
                    if (!confirmed) return;
                    try {
                        await window.go.main.App.DeleteStudentCounselingRecord(classNum, id);
                        await loadCounselRecords();
                        if (typeof window.refreshCurrentClass === 'function') {
                            window.refreshCurrentClass();
                        }
                    } catch (err) {
                        await showModalAlert('삭제 실패: ' + err, '오류', 'error');
                    }
                });
            });

        } catch (err) {
            counselRecordsList.innerHTML = `<div class="p-3 text-danger text-xs text-center">상담 일지 로드 실패: ${err}</div>`;
        }
    };

    // 2. 스마트 빠른 태그 클릭 시 내용에 자동 추가
    document.getElementById('counselQuickTags')?.querySelectorAll('.quick-tag-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tag = btn.dataset.tag;
            if (!counselContentInput) return;
            const curVal = counselContentInput.value;
            if (!curVal.includes(tag.trim())) {
                counselContentInput.value = curVal ? (curVal + ' ' + tag) : tag;
            }
            counselContentInput.focus();
        });
    });

    // 3. 수정 취소 버튼
    cancelCounselEditBtn?.addEventListener('click', () => {
        counselRecordId.value = '0';
        counselTargetSchoolInput.value = '';
        counselContentInput.value = '';
        counselDateInput.value = todayDate;
        saveCounselBtnText.textContent = '상담 일지 저장';
        cancelCounselEditBtn.classList.add('hidden');
    });

    // 4. 저장 함수
    const handleSaveCounsel = async () => {
        const dateVal = counselDateInput.value;
        const contentVal = counselContentInput.value.trim();
        const targetSchoolVal = counselTargetSchoolInput.value.trim();
        const idVal = parseInt(counselRecordId.value) || 0;

        if (!dateVal) {
            await showModalAlert('상담 날짜를 입력해 주세요.', '입력 필요', 'warning');
            counselDateInput.focus();
            return;
        }
        if (!contentVal) {
            await showModalAlert('상담 상세 내용을 입력해 주세요.', '입력 필요', 'warning');
            counselContentInput.focus();
            return;
        }

        saveCounselBtn.disabled = true;
        saveCounselBtn.innerHTML = '<span class="spinner" style="width:12px;height:12px;border-width:1.5px;"></span> 저장 중...';

        try {
            const record = {
                id: idVal,
                classNum: classNum,
                studentNum: studentNum,
                studentName: name,
                counselDate: dateVal,
                targetSchool: targetSchoolVal,
                content: contentVal,
            };
            await window.go.main.App.SaveStudentCounselingRecord(record);

            // 입력 폼 리셋
            counselRecordId.value = '0';
            counselTargetSchoolInput.value = '';
            counselContentInput.value = '';
            counselDateInput.value = todayDate;
            saveCounselBtnText.textContent = '상담 일지 저장';
            cancelCounselEditBtn.classList.add('hidden');

            await loadCounselRecords();
            if (typeof window.refreshCurrentClass === 'function') {
                window.refreshCurrentClass();
            }
        } catch (err) {
            await showModalAlert('상담 일지 저장 실패: ' + err, '오류', 'error');
        } finally {
            saveCounselBtn.disabled = false;
            saveCounselBtn.innerHTML = `<span>💾</span> <span id="saveCounselBtnText">${counselRecordId.value !== '0' ? '수정 내용 저장' : '상담 일지 저장'}</span>`;
        }
    };

    saveCounselBtn?.addEventListener('click', handleSaveCounsel);

    // 단축키: Ctrl + Enter로 즉시 저장
    counselContentInput?.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            handleSaveCounsel();
        }
    });

    // 초기 목록 자동 로드
    loadCounselRecords();

    // ===== ⭐ 관심학교 장바구니 및 희망학교 입력 원클릭 자동화 컨트롤러 =====
    const wishlistContainer = document.getElementById('wishlistContainer');
    const wishlistCountBadge = document.getElementById('wishlistCountBadge');

    const getStoredWishlist = () => {
        for (const key of possibleKeys) {
            try {
                const raw = localStorage.getItem(key);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
                }
            } catch (_) {}
        }
        return [];
    };

    const saveStoredWishlist = (list) => {
        const jsonStr = JSON.stringify(list);
        for (const key of possibleKeys) {
            try {
                localStorage.setItem(key, jsonStr);
            } catch (e) {
                console.warn('관심학교 저장 실패:', key, e);
            }
        }
    };

    const bindWishlistInnerEvents = () => {
        if (!wishlistContainer) return;

        // 1. 장바구니 내 [📝 희망학교 입력] 버튼 클릭 -> 희망학교 입력창 열고 지원학교/지원희망 자동 세팅
        wishlistContainer.querySelectorAll('.btn-wishlist-apply').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const schoolName = btn.dataset.school || '';
                const track = btn.dataset.track || '';
                const category = btn.dataset.cat || 'meister';
                const score = parseFloat(btn.dataset.score) || 0;

                openStudentApplicationModal(classNum, studentNum, name, {
                    schoolName,
                    track,
                    category,
                    score,
                    status: '지원희망'
                });
            });
        });

        // 2. 장바구니 내 [✕] 삭제 버튼 클릭
        wishlistContainer.querySelectorAll('.btn-wishlist-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const schoolName = btn.dataset.school || '';
                const track = btn.dataset.track || '';

                let list = getStoredWishlist();
                list = list.filter(item => !(item.schoolName === schoolName && item.trackName === track));
                saveStoredWishlist(list);
                updateWishlistUI();
            });
        });
    };

    const updateWishlistUI = () => {
        const currentList = getStoredWishlist();
        if (wishlistContainer) {
            wishlistContainer.innerHTML = renderWishlistHTML(currentList);
            bindWishlistInnerEvents();
        }
        if (wishlistCountBadge) {
            wishlistCountBadge.textContent = currentList.length;
        }

        // 목표 고교별 카드 목록의 [⭐ 관심 담기 / 관심 등록됨] 버튼 상태 동기화
        modalEl.querySelectorAll('.btn-toggle-wishlist').forEach(btn => {
            const sch = btn.dataset.school || '';
            const trk = btn.dataset.track || '';
            const isWish = currentList.some(w => isSameWishItem(w, sch, trk));
            const textSpan = btn.querySelector('.wishlist-btn-text');
            const iconSpan = btn.querySelector('span');

            if (isWish) {
                btn.className = 'btn-toggle-wishlist px-2.5 py-1 text-xs font-bold rounded-lg border transition-all flex items-center gap-1 cursor-pointer bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm';
                if (iconSpan) iconSpan.textContent = '⭐';
                if (textSpan) textSpan.textContent = '관심 등록됨';
            } else {
                btn.className = 'btn-toggle-wishlist px-2.5 py-1 text-xs font-bold rounded-lg border transition-all flex items-center gap-1 cursor-pointer bg-slate-800 text-slate-300 border-slate-600 hover:text-white hover:border-slate-500';
                if (iconSpan) iconSpan.textContent = '☆';
                if (textSpan) textSpan.textContent = '관심 담기';
            }
        });

        // 인쇄 대상 클래스(counsel-print-target-school / counsel-print-unregistered-school) 실시간 동기화
        const hasRegistered = currentList.length > 0 || (data.applications || []).some(a => a.schoolName && a.schoolName.trim());
        modalEl.querySelectorAll('.school-counsel-card').forEach(card => {
            const sch = card.dataset.school || card.querySelector('.font-bold.text-white')?.textContent || '';
            const isMatch = currentList.some(w => isSameSchool(w.schoolName, sch)) || (data.applications || []).some(a => isSameSchool(a.schoolName, sch));
            if (hasRegistered) {
                if (isMatch) {
                    card.classList.remove('counsel-print-unregistered-school');
                    card.classList.add('counsel-print-target-school');
                } else {
                    card.classList.remove('counsel-print-target-school');
                    card.classList.add('counsel-print-unregistered-school');
                }
            } else {
                card.classList.remove('counsel-print-unregistered-school');
                card.classList.add('counsel-print-target-school');
            }
        });
    };

    // 학교 카드 목록의 [⭐ 관심 담기 / 관심 해제] 버튼 이벤트 바인딩
    modalEl.querySelectorAll('.btn-toggle-wishlist').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const schoolName = btn.dataset.school || '';
            const trackName = btn.dataset.track || '';
            const totalScore = parseFloat(btn.dataset.score) || 0;
            const totalMax = parseFloat(btn.dataset.max) || 0;
            const category = btn.dataset.cat || 'meister';
            const cardIdx = btn.dataset.card;

            // 현재 카드의 합격 가능성 신호등 뱃지 HTML 추출
            const badgeEl = document.getElementById(`badge_${cardIdx}`);
            const badgeHTML = badgeEl ? badgeEl.innerHTML : '';

            let list = getStoredWishlist();
            const existingIdx = list.findIndex(w => isSameWishItem(w, schoolName, trackName));

            if (existingIdx !== -1) {
                list.splice(existingIdx, 1);
            } else {
                list.push({
                    schoolName,
                    trackName,
                    totalScore,
                    totalMax,
                    category,
                    badgeHTML,
                    addedAt: new Date().toISOString()
                });
            }
            saveStoredWishlist(list);
            updateWishlistUI();
        });
    });

    // 학교 카드 목록의 [📝 희망입력] 직행 버튼 이벤트 바인딩
    modalEl.querySelectorAll('.btn-direct-apply').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const schoolName = btn.dataset.school || '';
            const track = btn.dataset.track || '';
            const category = btn.dataset.cat || 'meister';
            const score = parseFloat(btn.dataset.score) || 0;

            // 희망원서 자동 등록 모달 즉시 실행
            openStudentApplicationModal(classNum, studentNum, name, {
                schoolName,
                track,
                category,
                score,
                status: '지원희망'
            });
        });
    });

    // 장바구니 초기 내부 이벤트 바인딩
    bindWishlistInnerEvents();
}

// ===== 전체 고교 신호등 매트릭스 모달 (단일 학급 및 전교생 종합 매트릭스 지원, 정렬/검색/학급필터 탑재) =====








// 앱 정상 시작 진행 함수
async function proceedAppInit() {
    try {
        const isSetup = await CheckSetupComplete();
        if (isSetup) {
            renderLoginScreen(await window.go.main.App.GetLoginIndex());
        } else {
            renderFirstRunScreen();
        }
    } catch (err) {
        app.innerHTML = `<div class="p-10 text-center text-danger font-bold">계정 정보를 불러올 수 없습니다.<br>${err}</div>`;
    }
}

// ===== 앱 시작 =====
async function init() {
    try {
        // 최초 실행 시 개인정보 보호 서약 동의 여부 검사
        const isAgreed = await window.go.main.App.IsAgreementAccepted?.();
        if (!isAgreed) {
            renderAgreementModal(() => {
                // 서약서 동의 완료 후에만 서버 업데이트 확인 및 초기화 진행
                checkUpdateOnStartup();
                proceedAppInit();
            });
            return;
        }

        // 이미 서약에 동의한 경우 정상 초기화 진행
        checkUpdateOnStartup();
        proceedAppInit();
    } catch (err) {
        console.warn('동의 여부 확인 실패:', err);
        proceedAppInit();
    }
}

// 전역 플로팅 피드백 버튼 리스너 바인딩 (모든 페이지 공통)
function bindGlobalFeedbackListener() {
    const btn = document.getElementById('globalFeedbackFloatingBtn');
    if (btn && !btn.dataset.bound) {
        btn.dataset.bound = 'true';
        btn.addEventListener('click', () => {
            openExternalUrlSafe(FEEDBACK_BOARD_URL);
        });
    }
}
bindGlobalFeedbackListener();
document.addEventListener('DOMContentLoaded', bindGlobalFeedbackListener);

init();



// ===== 사용자 및 권한 관리 화면 =====
async function renderUserManagementScreen(schoolName) {
    app.className = 'wide-layout';

    let classCount = 8;
    try {
        const config = await window.go.main.App.GetSchoolConfig();
        classCount = config.classCount;
    } catch (e) {
        console.error(e);
    }

    let classOptions = '';
    for (let i = 1; i <= classCount; i++) {
        classOptions += `<option value="${i}">${i}반</option>`;
    }

    app.innerHTML = `
        <div class="glass-card p-6 md:p-8 w-full max-w-[1700px] mx-auto min-h-[85vh]">
            <div class="flex items-center justify-between mb-8 pb-4 border-b border-slate-700/50">
                <div>
                    <h1 class="text-2xl font-bold text-white flex items-center gap-3">
                        👥 스마트 사용자 및 권한 관리
                    </h1>
                    <p class="text-text-muted text-sm mt-1">${schoolName} — 교사별 권한 및 계정을 자유롭게 추가/삭제/관리합니다.</p>
                </div>
                <div class="flex items-center gap-4">
                    <button id="backToAdminBtn" class="btn-secondary whitespace-nowrap text-xs px-4 py-2.5">
                        ← 대시보드로 돌아가기
                    </button>
                </div>
            </div>

            <div class="space-y-6">
                <!-- 새 사용자 계정 추가 폼 -->
                <div class="p-6 rounded-xl bg-slate-800/50 border border-slate-700/50">
                    <h3 class="font-bold mb-4 flex items-center gap-2 text-white text-base">
                        <span>➕</span> 새 교사/관리자 계정 등록
                    </h3>
                    <form id="addUserForm" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 items-end">
                        <div>
                            <label class="block text-xs text-text-muted mb-1">사용자 ID</label>
                            <input type="text" id="newUserId" class="input-field py-2 text-xs" placeholder="예: teacher1" required />
                        </div>
                        <div>
                            <label class="block text-xs text-text-muted mb-1">초기 비밀번호</label>
                            <input type="password" id="newUserPw" class="input-field py-2 text-xs" placeholder="초기 비밀번호" required />
                        </div>
                        <div>
                            <label class="block text-xs text-text-muted mb-1">역할 (권한)</label>
                            <select id="newUserRole" class="input-field py-2 text-xs">
                                <option value="viewer">진학/학년부장 (전체 조회)</option>
                                <option value="homeroom">담임교사 (학급 담당)</option>
                                <option value="master">관리자 (전체 관리)</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs text-text-muted mb-1">담당 학급 (담임용)</label>
                            <select id="newUserClass" class="input-field py-2 text-xs" disabled>
                                <option value="0">해당 없음</option>
                                ${classOptions}
                            </select>
                        </div>
                        <div class="pb-0.5">
                            <button type="submit" id="addUserBtn" class="btn-primary py-2 px-4 rounded-lg font-bold shadow whitespace-nowrap w-full text-xs flex items-center justify-center gap-1.5">
                                <span>➕</span> 계정 생성
                            </button>
                        </div>
                    </form>
                    <div id="addUserError" class="mt-2 text-xs text-danger hidden font-bold"></div>
                </div>

                <!-- 담임 계정 일괄 비밀번호 설정 -->
                <div class="p-6 rounded-xl bg-slate-800/50 border border-slate-700/50">
                    <h3 class="font-bold mb-3 flex items-center gap-2 text-white text-base">
                        <span>🔑</span> 담임 계정 일괄 비밀번호 발급
                    </h3>
                    <form id="bulkPasswordForm" class="flex gap-4 items-end max-w-xl">
                        <div class="flex-1">
                            <label class="block text-xs text-text-muted mb-1">모든 담임(1반~N반) 공통 초기 비밀번호</label>
                            <input type="password" id="bulkPw" class="input-field py-2 text-xs" placeholder="공통 비밀번호 입력" required />
                        </div>
                        <div class="flex-none pb-0.5">
                            <button type="submit" id="bulkPwBtn" class="btn-primary py-2 px-4 rounded-lg font-bold shadow whitespace-nowrap text-xs" style="width: auto;">일괄 적용</button>
                        </div>
                    </form>
                    <div id="bulkPwError" class="mt-2 text-xs text-danger hidden font-bold"></div>
                </div>

                <!-- 계정 목록 -->
                <div>
                    <h3 class="font-bold mb-3 flex items-center gap-2 text-white text-base"><span>📋</span> 등록된 교사/관리자 계정 목록</h3>
                    <div class="bg-slate-900/50 rounded-xl border border-slate-700/50 overflow-hidden">
                        <table class="w-full text-left text-xs sm:text-sm">
                            <thead class="bg-slate-800/80 text-text-muted">
                                <tr>
                                    <th class="p-3.5 font-semibold">구분 (역할)</th>
                                    <th class="p-3.5 font-semibold">사용자 아이디</th>
                                    <th class="p-3.5 font-semibold">비번 상태</th>
                                    <th class="p-3.5 font-semibold text-center">비밀번호 재발급</th>
                                    <th class="p-3.5 font-semibold text-center">교사용 배포 자료</th>
                                    <th class="p-3.5 font-semibold text-center w-24">계정 삭제</th>
                                </tr>
                            </thead>
                            <tbody id="userListBody" class="divide-y divide-slate-700/50">
                                <tr><td colspan="6" class="p-8 text-center text-text-muted">불러오는 중...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.getElementById('backToAdminBtn').addEventListener('click', () => {
        app.className = '';
        renderAdminScreen(schoolName);
    });

    const roleSelect = document.getElementById('newUserRole');
    const classSelect = document.getElementById('newUserClass');
    roleSelect.addEventListener('change', () => {
        if (roleSelect.value === 'homeroom') {
            classSelect.disabled = false;
            classSelect.value = "1";
        } else {
            classSelect.disabled = true;
            classSelect.value = "0";
        }
    });

    // 계정 추가 처리
    document.getElementById('addUserForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('newUserId').value.trim();
        const pw = document.getElementById('newUserPw').value;
        const role = roleSelect.value;
        const classNum = parseInt(classSelect.value) || 0;
        const btn = document.getElementById('addUserBtn');
        const err = document.getElementById('addUserError');

        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> 생성 중...';
        err.classList.add('hidden');

        try {
            await window.go.main.App.CreateUser(id, pw, role, classNum);
            document.getElementById('newUserId').value = '';
            document.getElementById('newUserPw').value = '';
            alert(`'${id}' 계정이 성공적으로 등록되었습니다.`);
            loadUserList();
        } catch (error) {
            err.textContent = '등록 실패: ' + error;
            err.classList.remove('hidden');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<span>➕</span> 계정 생성';
        }
    });

    // 담임 일괄 비밀번호 처리
    document.getElementById('bulkPasswordForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const pw = document.getElementById('bulkPw').value;
        const btn = document.getElementById('bulkPwBtn');
        const err = document.getElementById('bulkPwError');

        const confirmed = await showModalConfirm({
            title: '담임 비밀번호 일괄 설정',
            message: '모든 담임(1반~N반)의 비밀번호를 일괄 설정/초기화 하시겠습니까?',
            confirmText: '일괄 설정',
            type: 'warning'
        });
        if (!confirmed) return;

        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span>...';
        err.classList.add('hidden');

        try {
            const users = await window.go.main.App.GetUsers();
            const homerooms = users.filter(u => u.Role === 'homeroom');
            for (const hr of homerooms) {
                await window.go.main.App.SetUserPassword(hr.Username, pw);
            }
            document.getElementById('bulkPw').value = '';
            alert('모든 담임 계정의 비밀번호가 일괄 설정되었습니다.');
            loadUserList();
        } catch (error) {
            err.textContent = error;
            err.classList.remove('hidden');
        } finally {
            btn.disabled = false;
            btn.textContent = '일괄 적용';
        }
    });

    // 계정 목록 로드
    async function loadUserList() {
        const tbody = document.getElementById('userListBody');
        try {
            const users = await window.go.main.App.GetUsers();
            tbody.innerHTML = '';

            users.forEach(u => {
                const isInitial = u.MustChangePassword;
                let roleLabel = '학년부장 (관리자)';
                if (u.Role === 'homeroom') roleLabel = `${u.ClassNum}반 담임`;
                else if (u.Role === 'viewer') roleLabel = '진로부장 (조회전용)';

                let statusBadge = isInitial
                    ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-warning/20 text-warning border border-warning/30">초기 상태</span>`
                    : `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-success/20 text-success border border-success/30">사용 중</span>`;

                const isMasterAdmin = u.Username === 'admin';

                const tr = document.createElement('tr');
                tr.className = "hover:bg-slate-800/30 transition-colors";
                tr.innerHTML = `
                    <td class="p-3.5 font-bold text-slate-200">${escapeHtml(roleLabel)}</td>
                    <td class="p-3.5 text-text-muted font-mono">${escapeHtml(u.Username)}</td>
                    <td class="p-3.5">${statusBadge}</td>
                    <td class="p-3.5 text-center">
                        <div class="flex items-center justify-center gap-1.5">
                            <input type="password" class="input-field py-1 px-2.5 text-xs w-28 input-user-pw" placeholder="새 비번" />
                            <button type="button" class="btn-primary py-1 px-2.5 text-xs whitespace-nowrap rounded font-bold btn-update-pw" style="width: auto;">
                                ${isInitial ? '비번 설정' : '재설정'}
                            </button>
                        </div>
                    </td>
                    <td class="p-3.5 text-center">
                        ${isMasterAdmin
                        ? '<span class="text-xs text-slate-600 font-bold">해당 없음</span>'
                        : `<button type="button" class="text-xs text-indigo-200 hover:text-white font-bold px-2 py-1 rounded bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-400/30 transition-colors btn-dist-pkg">배포 자료 만들기</button>`
                    }
                    </td>
                    <td class="p-3.5 text-center">
                        ${isMasterAdmin
                        ? '<span class="text-xs text-slate-600 font-bold">보호됨</span>'
                        : `<button type="button" class="text-xs text-danger hover:underline font-bold px-2 py-1 rounded bg-danger/10 hover:bg-danger/20 border border-danger/30 transition-colors btn-delete-user">삭제</button>`
                    }
                    </td>
                `;

                // 안전한 이벤트 리스너 바인딩 (인라인 onclick 제거)
                const pwInput = tr.querySelector('.input-user-pw');
                const btnPw = tr.querySelector('.btn-update-pw');
                if (btnPw && pwInput) {
                    btnPw.addEventListener('click', () => {
                        window.updateUserPassword(u.Username, pwInput.value);
                    });
                    pwInput.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') {
                            window.updateUserPassword(u.Username, pwInput.value);
                        }
                    });
                }
                const btnDist = tr.querySelector('.btn-dist-pkg');
                if (btnDist) {
                    btnDist.addEventListener('click', () => {
                        window.createDistributionPackage(u.Username);
                    });
                }
                const btnDel = tr.querySelector('.btn-delete-user');
                if (btnDel) {
                    btnDel.addEventListener('click', () => {
                        window.deleteUserAccount(u.Username);
                    });
                }

                tbody.appendChild(tr);
            });
        } catch (error) {
            tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-danger font-bold">${escapeHtml(String(error))}</td></tr>`;
        }
    }

    window.updateUserPassword = async (username, directPw) => {
        let pw = directPw;
        let inputEl = document.getElementById(`pw_${username}`);
        if (typeof pw !== 'string' || !pw) {
            pw = inputEl ? inputEl.value : '';
        }
        if (!pw) {
            await showModalAlert('새 비밀번호를 입력하세요.', '입력 확인', 'warning');
            return;
        }

        const confirmed = await showModalConfirm({
            title: '비밀번호 설정',
            message: `'${username}' 계정의 비밀번호를 새로 설정하시겠습니까?`,
            confirmText: '설정하기',
            type: 'warning'
        });
        if (confirmed) {
            try {
                await window.go.main.App.SetUserPassword(username, pw);
                if (username !== 'admin') {
                    const resetPath = await window.go.main.App.SavePasswordResetPackage(username);
                    if (!resetPath) {
                        throw new Error('비밀번호는 설정되었지만 재설정 파일 저장이 취소되었습니다. 다시 재설정해 파일을 전달하세요.');
                    }
                    await showModalAlert(`비밀번호가 설정되고 재설정 파일이 만들어졌습니다.\n담임에게 프로그램과 함께 다음 파일을 전달하세요.\n\n${resetPath}`, '재설정 파일 생성 완료', 'success');
                } else {
                    await showModalAlert('관리자 비밀번호가 변경되었습니다. 다음 로그인부터 새 비밀번호를 사용하세요.', '비밀번호 변경 완료', 'success');
                }
                if (inputEl) inputEl.value = '';
                loadUserList();
            } catch (err) {
                await showModalAlert('설정 실패: ' + err, '오류 발생', 'error');
            }
        }
    };

    window.deleteUserAccount = async (username) => {
        const confirmed = await showModalConfirm({
            title: '계정 삭제',
            message: `정말로 '${username}' 계정을 삭제하시겠습니까?`,
            confirmText: '삭제',
            type: 'error'
        });
        if (confirmed) {
            try {
                await window.go.main.App.DeleteUser(username);
                await showModalAlert('계정이 삭제되었습니다.', '완료', 'success');
                loadUserList();
            } catch (err) {
                await showModalAlert('삭제 실패: ' + err, '오류', 'error');
            }
        }
    };

    window.createDistributionPackage = async (username) => {
        const confirmed = await showModalConfirm({
            title: '배포 자료 생성',
            message: `'${username}' 계정용 교사용 배포 자료를 만들까요?\n\n담임용 자료에는 해당 반 DB만, 진로부장용 자료에는 조회용 전체 학급 DB가 포함됩니다. 관리자 계정과 다른 담임 계정은 포함되지 않습니다.`,
            confirmText: '생성하기',
            type: 'info'
        });
        if (!confirmed) return;
        try {
            const path = await window.go.main.App.SaveDistributionPackage(username);
            if (!path) return;
            await showModalAlert(`'${username}' 계정용 배포 자료 생성이 완료되었습니다!\n\n📂 저장 위치:\n${path}\n\n💡 [안내 사항]\n• 담임 선생님께 프로그램 실행 파일과 위 배포 자료(.phgcpkg), 그리고 학년부장의 [공용 데이터 암호]를 함께 전달해 주세요.\n• 담임 선생님은 로그인 화면에서 ‘배포 자료 가져오기’를 누른 후, 공용 데이터 암호를 입력하여 안전하게 최초 로그인하실 수 있습니다.`, '배포 자료 준비 완료', 'success');
        } catch (err) {
            await showModalAlert('배포 자료 생성 실패: ' + err, '오류', 'error');
        }
    };

    loadUserList();
}

// ===== 고교별 커트라인 관리 화면 (단일 페이지 통합 네비게이션 & 최저/최고/평균 입력 지원) =====
async function renderCutoffScreen(schoolName) {
    app.className = 'wide-layout';

    // 최신 고교 입학년도 기준: 2026학년도 (미래 연도 2027 이상은 제외하고 2026년 기준 직전 5개년 산출)
    let baseAdmissionYear = 2026;
    try {
        const config = await GetSchoolConfig();
        if (config && config.admissionYear) {
            const cfgYear = Number(config.admissionYear);
            if (cfgYear > 2000 && cfgYear <= 2026) {
                baseAdmissionYear = cfgYear;
            }
        }
    } catch (e) {
        console.warn(e);
    }

    let currentAdmissionYear = baseAdmissionYear;

    let allSavedCutoffs = [];
    try {
        allSavedCutoffs = await window.go.main.App.GetCutoffs() || [];
        // DB 내 중복 레코드(학교명 표기 차이, 전형명 중복 등) 자동 정리 및 표준화
        if (allSavedCutoffs && allSavedCutoffs.length > 0) {
            const rawCount = allSavedCutoffs.length;
            const uniqueSet = new Set(allSavedCutoffs.map(c => `${c.year}_${normalizeSchoolName(c.schoolName)}_${normalizeDept(c.department)}_${normalizeTrack(c.track)}`));
            if (uniqueSet.size < rawCount && window.go?.main?.App?.SaveCutoffs) {
                await window.go.main.App.SaveCutoffs(allSavedCutoffs);
                allSavedCutoffs = await window.go.main.App.GetCutoffs() || [];
            }
        }
    } catch (e) {
        console.error(e);
    }

    // 각 연도별 저장된 유효 커트라인 건수 집계 헬퍼 (중복 명칭 정규화하여 실제 고교·학과별 유효 항목 수 계산)
    const getCutoffCountByYear = (yr) => {
        try {
            const uniqueKeys = new Set();
            (allSavedCutoffs || []).forEach(c => {
                if (Number(c.year) === Number(yr) && Number(c.minValue) > 0) {
                    const sKey = typeof normalizeSchoolName === 'function' ? normalizeSchoolName(c.schoolName) : (c.schoolName || '');
                    const dKey = typeof normalizeDept === 'function' ? normalizeDept(c.department) : (c.department || '');
                    const tKey = typeof normalizeTrack === 'function' ? normalizeTrack(c.track) : (c.track || '');
                    uniqueKeys.add(`${sKey}_${dKey}_${tKey}`);
                }
            });
            return uniqueKeys.size;
        } catch (e) {
            console.error('getCutoffCountByYear error:', e);
            return 0;
        }
    };

    // 2026년 최근 기준 및 그 밑으로 5년치(2026, 2025, 2024, 2023, 2022) 산출 (2027년 이상 미래 연도는 원천 배제)
    const existingYears = (allSavedCutoffs || []).map(c => Number(c.year)).filter(y => !isNaN(y) && y > 2000 && y <= baseAdmissionYear);
    const candidateYears = new Set([baseAdmissionYear, ...existingYears]);
    for (let i = 0; i < 5; i++) {
        candidateYears.add(baseAdmissionYear - i);
    }
    const admissionYears = Array.from(candidateYears).filter(y => y <= baseAdmissionYear).sort((a, b) => b - a);

    // 데이터가 가장 많이 등록된 연도가 있다면 기본 선택 우선 배정 (등록된 연도 바로 보여주기)
    const yearWithMostData = admissionYears.find(y => getCutoffCountByYear(y) > 0);
    if (getCutoffCountByYear(currentAdmissionYear) === 0 && yearWithMostData) {
        currentAdmissionYear = yearWithMostData;
    }

    // 기본 등록 고교 및 학과 목록 (동적 로드 전 빈 배열, 서버 데이터로 채워짐)
    let defaultSchoolSpecs = [];

    // 울산 관내 공용 고교 목록 동적 로드 (서버의 highschools.json에서 읽어옴)
    try {
        const highSchoolData = await window.go.main.App.GetHighSchoolsData();
        const schools = highSchoolData?.schools || [];
        const catalogSpecs = schools
            .filter(s => {
                const t = (s.type || s.Type || '').toLowerCase();
                const note = (s.note || s.Note || '');
                // 영문 코드 및 한글 타입 모두 호환
                return t === 'meister' || t === 'special' || t === '마이스터고' || t === '특성화고'
                    || note.includes('마이스터고') || note.includes('특성화고');
            })
            .map(s => {
                const t = (s.type || s.Type || '').toLowerCase();
                const note = (s.note || s.Note || '');
                const isMeister = t === 'meister' || t === '마이스터고' || note.includes('마이스터고');
                const tracks = isMeister ? ['일반', '특별'] : ['일반', '취업희망자'];
                const rawName = s.name || s.Name || '';
                const shortName = normalizeSchoolName(rawName);
                // 각 학교별 환산 만점을 Go 백엔드의 AllSchoolRules에서 가져옴 (프론트엔드 하드코딩 제거)
                let totalMax = '100점 만점';
                try {
                    const rules = window._allSchoolRules || [];
                    const matchRule = rules.find(r => normalizeSchoolName(r.schoolName) === shortName && r.trackName === '일반');
                    if (matchRule && matchRule.totalMax) {
                        totalMax = `${matchRule.totalMax}점 만점`;
                    }
                } catch (_) {}
                // 하드코딩 fallback (백엔드 규칙 로드 실패 시)
                if (totalMax === '100점 만점' && isMeister) {
                    if (shortName === '울산마이스터고') totalMax = '300점 만점';
                    else if (shortName === '울산에너지고') totalMax = '230점 만점';
                    else if (shortName === '현대공업고') totalMax = '200점 만점';
                }
                const depts = s.departments || s.Departments || [];
                const defaultItems = isMeister
                    ? [
                        { dept: '', track: '일반' },
                        { dept: '', track: '특별' },
                        ...depts.flatMap(dept => tracks.map(track => ({ dept, track })))
                    ]
                    : depts.flatMap(dept => tracks.map(track => ({ dept, track })));
                return {
                    name: shortName,
                    fullName: rawName,
                    category: isMeister ? 'meister' : 'special',
                    categoryLabel: isMeister ? '마이스터고' : '특성화고',
                    totalMax,
                    scoreType: 'total_score',
                    unit: '점',
                    placeholder: isMeister ? '예: 200.0' : '예: 75.0',
                    items: defaultItems.length > 0 ? defaultItems : [{ dept: '', track: '일반' }],
                };
            });
        if (catalogSpecs.length) {
            defaultSchoolSpecs = [
                ...catalogSpecs,
                {
                    name: '울산 후기 일반계고', category: 'general', categoryLabel: '후기 일반고',
                    totalMax: '석차 백분율', scoreType: 'percentile', unit: '%', placeholder: '예: 85.00',
                    items: [{ dept: '공통', track: '일반' }],
                },
            ];
        }
    } catch (e) {
        console.warn('공용 고교 목록을 불러오지 못해 빈 목록으로 시작합니다:', e);
    }

    // 전형명 정규화 헬퍼 ('일반전형' -> '일반', '특별전형' -> '특별')
    const normalizeTrack = (t) => {
        if (!t) return '일반';
        const s = String(t).trim();
        if (s === '일반' || s === '일반전형') return '일반';
        if (s === '특별' || s === '특별전형') return '특별';
        if (s === '취업' || s === '취업희망자' || s === '취업희망자전형') return '취업희망자';
        if (s === '일반계고' || s === '일반계고전형') return '일반계고';
        return s.replace(/전형$/, '');
    };

    // 학과명 정규화 헬퍼 ('공통', '전체', '학교 전체' -> '')
    const normalizeDept = (d) => {
        if (!d) return '';
        const s = String(d).trim();
        return (s === '공통' || s === '전체' || s === '학교 전체') ? '' : s;
    };

    // 브라우저 캐시 잔재(구버전 localStorage) 완전 삭제
    try {
        localStorage.removeItem('publicOfficialCutoffData');
    } catch (_) {}

    // 공식 공개 입결 데이터 (하드코딩 없이 백엔드 data/official_admission_data.json 기반 로드)
    let publicOfficialData = [];

    try {
        const officialResp = await window.go.main.App.GetOfficialAdmissionData().catch(() => null);
        if (officialResp?.items && Array.isArray(officialResp.items) && officialResp.items.length > 0) {
            publicOfficialData = officialResp.items.map(item => ({
                year: Number(item.admissionYear || item.year || currentAdmissionYear),
                school: item.schoolName || item.school || '',
                dept: item.department || '',
                track: item.track || '일반',
                min: Number(item.minAcceptedScore || item.minValue || item.min || 0) || '',
                max: Number(item.maxFailedScore || item.maxValue || item.max || 0) || '',
                avg: Number(item.avgAcceptedScore || item.avgValue || item.avg || 0) || '',
                unit: item.unit || '점',
                note: item.source || item.note || '공식자료'
            })).filter(x => {
                if (!x.school || x.school.includes('청량고')) return false;
                return true;
            });
        }
    } catch (e) {
        console.warn('공식 공개 데이터 불러오기 실패:', e);
        publicOfficialData = [];
    }

    // 공식 공개자료 백엔드 저장 헬퍼 (data/official_admission_data.json 동기화)
    const syncPublicOfficialData = async () => {
        try {
            if (window.go?.main?.App?.SaveOfficialAdmissionData) {
                const itemsToSave = publicOfficialData.map(p => ({
                    admissionYear: Number(p.year) || currentAdmissionYear,
                    schoolName: p.school || '',
                    department: p.dept || '',
                    track: p.track || '일반',
                    minAcceptedScore: Number(p.min) || 0,
                    maxFailedScore: Number(p.max) || 0,
                    avgAcceptedScore: Number(p.avg) || 0,
                    unit: p.unit || (String(p.school).includes('일반계고') ? '%' : '점'),
                    source: p.note || '공식자료'
                }));
                await window.go.main.App.SaveOfficialAdmissionData(itemsToSave);
            }
        } catch (e) {
            console.error('공식자료 저장 실패:', e);
        }
    };


    let currentTab = 'all'; // 'all', 'meister', 'special', 'general', 'public'
    let searchKeyword = '';
    let publicYearFilterMode = 'current'; // 'current': 상단 고교 입학년도 동기화, 'all': 전체 연도 모아보기
    let deletedCutoffList = []; // 사용자가 UI에서 삭제하거나 비운 커트라인 목록 (DB 삭제 동기화용)

    const renderMainScreen = () => {
        // 현재 선택된 입학년도의 커트라인 매핑 (다양한 학과명/전형명 표기 완벽 호환)
        const savedMap = {};
        allSavedCutoffs.filter(c => Number(c.year) === Number(currentAdmissionYear)).forEach(c => {
            const schKey = normalizeSchoolName(c.schoolName);
            const deptNorm = normalizeDept(c.department);
            const trackNorm = normalizeTrack(c.track);
            const entry = {
                min: c.minValue,
                max: c.maxValue,
                avg: c.avgValue
            };

            // 정규화 키 및 원본 키 모두 등록
            savedMap[`${schKey}_${deptNorm}_${trackNorm}`] = entry;
            savedMap[`${schKey}_${c.department}_${c.track}`] = entry;
            savedMap[`${schKey}_${deptNorm}_${c.track}`] = entry;
            savedMap[`${schKey}_${c.department}_${trackNorm}`] = entry;

            // 공통/학교 전체인 경우
            if (deptNorm === '') {
                savedMap[`${schKey}_공통_${trackNorm}`] = entry;
                savedMap[`${schKey}_공통_${c.track}`] = entry;
                savedMap[`${schKey}__${trackNorm}`] = entry;
                savedMap[`${schKey}__${c.track}`] = entry;
            }
        });

        // 탭 및 검색어 필터링
        const filteredSchools = defaultSchoolSpecs.filter(sch => {
            const matchTab = currentTab === 'all' || sch.category === currentTab;
            if (!matchTab) return false;
            if (!searchKeyword) return true;
            const q = searchKeyword.toLowerCase();
            return sch.name.toLowerCase().includes(q) || sch.items.some(it => (it.dept || '').toLowerCase().includes(q) || (it.track || '').toLowerCase().includes(q));
        });

        // 학교 목록 카드 HTML 생성
        let schoolsHTML = '';
        if (currentTab !== 'public') {
            if (filteredSchools.length === 0) {
                schoolsHTML = `
                    <div class="glass-card p-12 text-center text-text-muted">
                        <p class="text-3xl mb-2">🔍</p>
                        <p class="font-bold text-slate-300">검색 조건에 맞는 학교가 없습니다.</p>
                        <p class="text-xs mt-1">다른 검색어를 입력하거나 탭 필터를 변경해보세요.</p>
                    </div>
                `;
            } else {
                filteredSchools.forEach((sch, sIdx) => {
                    const schKey = normalizeSchoolName(sch.name);
                    // 저장된 커트라인 값 채우기 & 사용자 추가 학과 병합
                    const itemsToRender = [];

                    // 기본 스펙의 학과·전형 항목들 먼저 추가
                    sch.items.forEach(it => {
                        const dNorm = normalizeDept(it.dept);
                        const tNorm = normalizeTrack(it.track);
                        if (!itemsToRender.some(x => normalizeDept(x.dept) === dNorm && normalizeTrack(x.track) === tNorm)) {
                            itemsToRender.push({ dept: dNorm, track: it.track });
                        }
                    });

                    // DB에 저장된 해당 연도 해당 고교의 커트라인 항목 병합 (공통/학교전체 포함!)
                    allSavedCutoffs.filter(c => Number(c.year) === Number(currentAdmissionYear) && normalizeSchoolName(c.schoolName) === schKey).forEach(c => {
                        const dNorm = normalizeDept(c.department);
                        const tNorm = normalizeTrack(c.track);
                        const exists = itemsToRender.some(it => normalizeDept(it.dept) === dNorm && normalizeTrack(it.track) === tNorm);
                        if (!exists) {
                            itemsToRender.push({ dept: dNorm, track: c.track });
                        }
                    });

                    // 같은 학과는 하나의 셀로 묶고, 그 아래에서 일반·특별 등 전형별 점수만 구분
                    const itemGroups = new Map();
                    itemsToRender.forEach(item => {
                        const groupKey = normalizeDept(item.dept);
                        if (!itemGroups.has(groupKey)) itemGroups.set(groupKey, []);
                        itemGroups.get(groupKey).push(item);
                    });
                    const rowsHTML = [...itemGroups.entries()].map(([dept, group], groupIndex) =>
                        group.map((item, itemIndex) => {
                            const deptNorm = normalizeDept(item.dept);
                            const trackNorm = normalizeTrack(item.track);

                            // 1순위: 학과+전형 정확 매칭
                            let saved = savedMap[`${schKey}_${deptNorm}_${trackNorm}`] ||
                                savedMap[`${schKey}_${deptNorm}_${item.track}`] ||
                                savedMap[`${schKey}_${item.dept}_${item.track}`];

                            // 2순위: 학교 전체(공통) 행인 경우
                            if (!saved && deptNorm === '') {
                                saved = savedMap[`${schKey}_공통_${trackNorm}`] ||
                                    savedMap[`${schKey}_공통_${item.track}`] ||
                                    savedMap[`${schKey}__${trackNorm}`] ||
                                    savedMap[`${schKey}__${item.track}`];
                            }

                            // 3순위: 학과 행인데 학과별 저장값이 없으면 학교 전체(공통) 기준선 자동 매핑
                            if (!saved && deptNorm !== '') {
                                saved = savedMap[`${schKey}__${trackNorm}`] ||
                                    savedMap[`${schKey}__${item.track}`] ||
                                    savedMap[`${schKey}_공통_${trackNorm}`] ||
                                    savedMap[`${schKey}_공통_${item.track}`];
                            }

                            const minVal = saved && saved.min !== undefined && saved.min > 0 ? saved.min : '';
                            const maxVal = saved && saved.max !== undefined && saved.max > 0 ? saved.max : '';
                            const avgVal = saved && saved.avg !== undefined && saved.avg > 0 ? saved.avg : '';
                            const groupId = `${sIdx}-${groupIndex}`;
                            return `
                                <tr class="border-b border-slate-700/40 hover:bg-slate-800/40 transition-colors cutoff-item-row" data-school="${sch.name}" data-type="${sch.scoreType}" data-dept="${dept}" data-dept-group="${groupId}">
                                    ${itemIndex === 0 ? `<td class="p-3 align-middle" rowspan="${group.length}">
                                        <input type="text" class="input-field py-1.5 px-2.5 text-xs font-bold text-white row-dept-name" value="${dept}" placeholder="비우면 학교 전체" data-dept-group="${groupId}" />
                                    </td>` : ''}
                                    <td class="p-3"><input type="text" class="input-field py-1.5 px-2.5 text-xs text-indigo-300 row-track-name" value="${item.track}" placeholder="전형 (예: 일반, 특별)" /></td>
                                    <td class="p-3 text-center"><div class="flex items-center justify-center gap-1"><input type="text" inputmode="decimal" class="input-field py-1.5 px-2 text-xs text-right font-bold text-emerald-300 w-28 row-min-score" value="${minVal}" placeholder="${sch.placeholder}" /><span class="text-xs text-slate-400">${sch.unit}</span></div></td>
                                    <td class="p-3 text-center"><div class="flex items-center justify-center gap-1"><input type="text" inputmode="decimal" class="input-field py-1.5 px-2 text-xs text-right font-semibold text-sky-300 w-28 row-max-score" value="${maxVal}" placeholder="선택" /><span class="text-xs text-slate-400">${sch.unit}</span></div></td>
                                    <input type="hidden" class="row-avg-score" value="${avgVal}" />
                                    <td class="p-3 text-center"><button class="text-xs text-danger/80 hover:text-danger hover:bg-danger/10 p-1.5 rounded transition-colors btn-delete-row" title="행 삭제">🗑️</button></td>
                                </tr>`;
                        }).join('')
                    ).join('');

                    schoolsHTML += `
                        <div class="p-5 rounded-2xl bg-slate-800/70 border border-slate-700/60 space-y-3 school-cutoff-card shadow-lg" data-school="${sch.name}">
                            <div class="flex items-center justify-between border-b border-slate-700/50 pb-3 flex-wrap gap-2">
                                <div class="flex items-center gap-2.5 flex-wrap">
                                    <span class="text-xl">🏫</span>
                                    <h3 class="font-bold text-white text-base">${sch.name}</h3>
                                    <span class="text-xs px-2.5 py-0.5 rounded-full bg-indigo-900/60 text-indigo-300 border border-indigo-500/30 font-semibold">${sch.categoryLabel} (${sch.totalMax})</span>
                                    <span class="text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-950/70 text-emerald-300 border border-emerald-500/40 font-bold flex items-center gap-1">🏷️ ${currentAdmissionYear}년 입학 기준</span>
                                </div>
                                <button class="text-xs btn-secondary py-1.5 px-3 rounded-lg flex items-center gap-1.5 font-bold btn-add-dept" data-school="${sch.name}" data-type="${sch.scoreType}">
                                    <span>➕</span> 학과·전형 추가
                                </button>
                            </div>

                            <div class="overflow-x-auto">
                                <table class="w-full text-left border-collapse text-xs">
                                    <thead>
                                        <tr class="text-text-muted border-b border-slate-700/60 font-semibold bg-slate-900/40">
                                            <th class="p-2.5 w-44">학과명 <span class="text-slate-500 font-normal">(비우면 학교 전체)</span></th>
                                            <th class="p-2.5 w-32">전형</th>
                                            <th class="p-2.5 text-center w-44 text-emerald-300">최저점 (합격선/필수)</th>
                                            <th class="p-2.5 text-center w-44 text-sky-300">최고 불합격점 (선택)</th>
                                            <th class="p-2.5 text-center w-16">관리</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${rowsHTML}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    `;
                });
            }
        } else {
            // 공식 공개 입결 데이터 탭 뷰 (상단 입학년도 동기화 & 고교/연도별 그룹 묶음 & 실시간 검색 지원)
            const q = (searchKeyword || '').toLowerCase().trim();
            const filteredPublicList = publicOfficialData.map((item, originalIndex) => ({ ...item, originalIndex }))
                .filter(p => {
                    const matchYear = publicYearFilterMode === 'all' || Number(p.year) === currentAdmissionYear;
                    if (!matchYear) return false;
                    if (!q) return true;
                    return (p.school || '').toLowerCase().includes(q) ||
                           (p.dept || '').toLowerCase().includes(q) ||
                           (p.track || '').toLowerCase().includes(q) ||
                           (p.note || '').toLowerCase().includes(q);
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
                            <p class="font-bold text-slate-300 text-sm">${currentAdmissionYear}학년도 공식 공개 데이터가 없습니다.</p>
                            <p class="text-xs mt-1 text-slate-400">'전체 연도 모아보기'를 누르거나 우측 상단 '➕ 공개자료 추가'를 통해 등록할 수 있습니다.</p>
                        </td>
                    </tr>
                `;
            } else {
                publicRowsHTML = [...groupedPublic.values()].map(group => {
                    return group.items.map((p, itemIdx) => {
                        const isFirstInGroup = itemIdx === 0;
                        const rowSpan = group.items.length;
                        const trackClean = normalizeTrack(p.track);

                        // 학교 커트라인 DB(allSavedCutoffs)에 이미 반영되었는지 확인
                        const pYear = Number(group.year) || Number(p.year) || currentAdmissionYear;
                        const pSchoolNorm = normalizeSchoolName(group.school || p.school);
                        const pDeptNorm = normalizeDept(p.dept);
                        const pTrackNorm = normalizeTrack(p.track);
                        const isApplied = allSavedCutoffs.some(c => 
                            Number(c.year) === pYear &&
                            normalizeSchoolName(c.schoolName) === pSchoolNorm &&
                            (normalizeDept(c.department) === pDeptNorm || (!c.department && pDeptNorm === '공통') || (c.department === '공통' && !pDeptNorm)) &&
                            (normalizeTrack(c.track) === pTrackNorm || (!c.track && pTrackNorm === '일반') || (c.track === '일반' && !pTrackNorm)) &&
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
                                                ${group.year}학년도
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
                                                ].map(sName => `<option value="${sName}" ${normalizeSchoolName(group.school) === normalizeSchoolName(sName) ? 'selected' : ''}>${sName}</option>`).join('')}
                                                ${!["울산마이스터고", "울산에너지고", "현대공업고", "울산공업고", "울산기술공업고", "울산미용예술고", "울산산업고", "울산생활과학고", "울산여자상업고", "울산상업고", "울산애니원고", "울산 후기 일반계고"].some(sName => normalizeSchoolName(group.school) === normalizeSchoolName(sName)) && group.school ? `<option value="${group.school}" selected>${group.school}</option>` : ''}
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
                                                data-index="${p.originalIndex}" title="${group.year}학년도 커트라인으로 ${isApplied ? '다시 적용' : '즉시 적용'}">
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

            schoolsHTML = `
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
                                <button id="btnFilterPublicCurrentYear" class="px-3 py-1 rounded-lg font-bold transition-all ${publicYearFilterMode === 'current' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}">
                                    📅 ${currentAdmissionYear}학년도만 보기
                                </button>
                                <button id="btnFilterPublicAllYears" class="px-3 py-1 rounded-lg font-bold transition-all ${publicYearFilterMode === 'all' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}">
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
                                    <th class="p-3 w-28 border-r border-slate-700/50">입학년도</th>
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

        app.innerHTML = `
            <div class="glass-card p-6 md:p-8 w-full mx-auto min-h-[85vh] space-y-6 fade-in" style="max-width: 1500px;">
                <!-- 1. 상단 타이틀 & 입학년도 & 주요 액션 바 (버튼 크기 완벽 통일 h-[36px]) -->
                <div class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-700/50 pb-4">
                    <div>
                        <h1 class="text-2xl font-black text-white flex items-center gap-2.5">
                            <span>🎯</span> 고교별·학과별 입학 커트라인 통합 관리
                        </h1>
                        <p class="text-xs text-text-muted mt-1">
                            고교 입학년도별 합격선(최저점)과 최고 불합격점을 관리하며, 학생 진학 상담 시 실시간 합격 가능성 판정 기준으로 적용됩니다.
                        </p>
                        <div class="flex items-center gap-2 mt-2 flex-wrap">
                            <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 font-bold text-xs shadow-sm">
                                <span>🏷️</span> ${currentAdmissionYear}학년도 입학 (중3 ${currentAdmissionYear - 1}학년도)
                            </span>
                            <span class="text-xs text-text-muted">연도 선택 시 해당 입학년도의 저장값으로 즉시 전환됩니다.</span>
                        </div>
                    </div>

                    <div class="flex items-center gap-2 flex-wrap">
                        <!-- 입학년도(입시년도) 선택기: 선택 즉시 자동 전환 및 건수 현황 표시 -->
                        <div class="flex items-center gap-2 bg-slate-900/80 px-3 rounded-xl border border-indigo-500/40 shadow-inner h-9">
                            <label class="text-xs font-bold text-indigo-300 whitespace-nowrap">📅 고교 입학년도:</label>
                            <select id="admissionYearSelect" class="bg-slate-800 text-white font-bold text-xs px-2.5 py-0.5 rounded-lg border border-slate-700 outline-none cursor-pointer">
                                ${admissionYears.map(year => {
                                    const count = getCutoffCountByYear(year);
                                    const badge = count > 0 ? `(${count}건 등록)` : `(미등록)`;
                                    return `<option value="${year}" ${Number(currentAdmissionYear) === Number(year) ? 'selected' : ''}>${year}학년도 ${badge}</option>`;
                                }).join('')}
                            </select>
                        </div>

                        <button id="copyFromOtherYearBtn" class="text-xs bg-purple-600/30 border border-purple-500/50 text-purple-200 hover:bg-purple-600/50 px-3.5 rounded-xl font-bold flex items-center gap-1.5 transition-colors cursor-pointer h-9" title="다른 학년도의 커트라인을 현재 선택된 학년도로 그대로 복사해옵니다">
                            <span>📋</span> 다른 연도 복사
                        </button>
                        <button id="saveAllYearsCutoffsBtn" class="text-xs bg-emerald-600/30 border border-emerald-500/60 text-emerald-200 hover:bg-emerald-600/50 px-3.5 rounded-xl font-bold flex items-center gap-1.5 transition-colors cursor-pointer h-9 shadow-sm" title="현재 입력된 커트라인을 5개년 전체 연도에 한 번에 일괄 복제 저장합니다">
                            <span>🌐</span> 전체연도 일괄 저장
                        </button>
                        <button id="saveAllCutoffsBtn" class="text-xs bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-3.5 rounded-xl flex items-center gap-1.5 shadow-sm transition-all cursor-pointer h-9" title="현재 선택된 학년도의 커트라인만 데이터베이스에 영구 저장합니다">
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
                    const curCount = getCutoffCountByYear(currentAdmissionYear);
                    const sourceYears = admissionYears.filter(y => Number(y) !== Number(currentAdmissionYear) && getCutoffCountByYear(y) > 0);
                    if (curCount === 0 && sourceYears.length > 0) {
                        const topYear = sourceYears[0];
                        return `
                            <div class="mb-4 p-3.5 rounded-2xl bg-linear-to-r from-indigo-950/70 via-purple-950/50 to-slate-900/80 border border-indigo-500/50 flex items-center justify-between flex-wrap gap-3 shadow-lg">
                                <div class="flex items-center gap-3">
                                    <span class="text-2xl">💡</span>
                                    <div>
                                        <div class="text-xs font-bold text-indigo-200">현재 <strong>${currentAdmissionYear}학년도</strong>에는 등록된 커트라인 점수가 없습니다.</div>
                                        <div class="text-[11px] text-slate-400 mt-0.5">이미 등록된 <strong>${topYear}학년도</strong>(${getCutoffCountByYear(topYear)}건)의 커트라인을 한 번의 클릭으로 그대로 가져와 사용하실 수 있습니다.</div>
                                    </div>
                                </div>
                                <button id="quickCopyYearBtn" data-year="${topYear}" class="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer">
                                    <span>📋</span> ${topYear}학년도 커트라인 바로 채우기
                                </button>
                            </div>
                        `;
                    }
                    return '';
                })()}

                <!-- 2. 카테고리 네비게이션 탭 바 & 스마트 실시간 검색 -->
                <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700/60 pb-3">
                    <div class="flex items-center gap-2 overflow-x-auto custom-scrollbar">
                        <button class="nav-tab-btn px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${currentTab === 'all' ? 'bg-primary text-white shadow-md' : 'bg-slate-800/60 text-slate-400 hover:text-white'}" data-tab="all">
                            <span>🏷️</span> 전체 학교
                        </button>
                        <button class="nav-tab-btn px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${currentTab === 'meister' ? 'bg-primary text-white shadow-md' : 'bg-slate-800/60 text-slate-400 hover:text-white'}" data-tab="meister">
                            <span>🏛️</span> 마이스터고
                        </button>
                        <button class="nav-tab-btn px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${currentTab === 'special' ? 'bg-primary text-white shadow-md' : 'bg-slate-800/60 text-slate-400 hover:text-white'}" data-tab="special">
                            <span>🏭</span> 특성화고
                        </button>
                        <button class="nav-tab-btn px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${currentTab === 'general' ? 'bg-primary text-white shadow-md' : 'bg-slate-800/60 text-slate-400 hover:text-white'}" data-tab="general">
                            <span>🏫</span> 후기 일반고
                        </button>
                        <button class="nav-tab-btn px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${currentTab === 'public' ? 'bg-amber-500 text-white shadow-md' : 'bg-amber-950/30 text-amber-300 border border-amber-500/30 hover:bg-amber-900/40'}" data-tab="public">
                            <span>📊</span> 고교 공식 공개 데이터 (참고자료)
                        </button>
                    </div>

                    <div class="relative w-64">
                        <input id="cutoffSchoolSearch" type="text" value="${searchKeyword}" placeholder="🔍 고교명·학과·전형 검색..." class="input-field py-1.5 pl-3 pr-8 text-xs w-full bg-slate-900/80 border border-slate-700/60 rounded-xl" />
                        ${searchKeyword ? `<button id="clearCutoffSearch" class="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white">✕</button>` : ''}
                    </div>
                </div>

                <!-- 3. 학교별 커트라인 목록 -->
                <div class="space-y-5">
                    ${schoolsHTML}
                </div>
            </div>
        `;

        bindEvents();
    };

    const bindEvents = () => {
        // 다른 학년도 커트라인 복사 공통 함수
        const executeCopyFromYear = async (sourceYear) => {
            const sourceData = (allSavedCutoffs || []).filter(c => Number(c.year) === Number(sourceYear) && Number(c.minValue) > 0);
            if (sourceData.length === 0) {
                await showModalAlert({
                    title: '복사 불가',
                    message: `<strong>${sourceYear}학년도</strong>에는 저장된 유효 커트라인 점수가 없습니다.`,
                    type: 'warning'
                });
                return;
            }

            const confirmed = await showModalConfirm({
                title: '커트라인 데이터 복사',
                message: `<strong>${sourceYear}학년도</strong>의 커트라인(총 <strong>${sourceData.length}건</strong>)을 현재 <strong>${currentAdmissionYear}학년도</strong>로 복사해 오시겠습니까?<br><br><span class="text-xs text-amber-300">※ 복사 후 상단의 <strong>[💾 커트라인 저장]</strong> 버튼을 누르시면 ${currentAdmissionYear}학년도 데이터로 DB에 최종 저장됩니다.</span>`,
                confirmText: '복사하기',
                type: 'info'
            });

            if (!confirmed) return;

            const rows = app.querySelectorAll('.cutoff-item-row');
            let filledCount = 0;
            rows.forEach(tr => {
                const schName = normalizeSchoolName(tr.dataset.school || '');
                const dept = normalizeDept(tr.querySelector('.row-dept-name')?.value || tr.dataset.dept || '');
                const track = normalizeTrack(tr.querySelector('.row-track-name')?.value || tr.dataset.track || '일반');

                const match = sourceData.find(c =>
                    normalizeSchoolName(c.schoolName) === schName &&
                    normalizeDept(c.department) === dept &&
                    normalizeTrack(c.track) === track
                );

                if (match) {
                    const minInput = tr.querySelector('.row-min-score');
                    const maxInput = tr.querySelector('.row-max-score');
                    const avgInput = tr.querySelector('.row-avg-score');
                    if (minInput) minInput.value = match.minValue || '';
                    if (maxInput) maxInput.value = match.maxValue || '';
                    if (avgInput) avgInput.value = match.avgValue || '';
                    filledCount++;
                }
            });

            await showModalAlert({
                title: '복사 완료',
                message: `<strong>${sourceYear}학년도</strong> 커트라인 중 <strong>${filledCount}개</strong> 항목이 현재 화면에 채워졌습니다!<br><br>내용을 확인하신 후 상단의 <strong>[💾 커트라인 저장]</strong> 버튼을 꼭 눌러주세요.`,
                type: 'success'
            });
        };

        // 0-1. 다른 학년도 복사 버튼 클릭 시
        document.getElementById('copyFromOtherYearBtn')?.addEventListener('click', async () => {
            const availableYears = admissionYears.filter(y => Number(y) !== Number(currentAdmissionYear) && getCutoffCountByYear(y) > 0);
            if (availableYears.length === 0) {
                await showModalAlert({
                    title: '복사 가능한 연도 없음',
                    message: '다른 학년도에 저장된 커트라인 데이터가 없습니다.<br>타교자료를 병합하거나 직접 커트라인을 먼저 입력해 주세요.',
                    type: 'info'
                });
                return;
            }

            if (availableYears.length === 1) {
                await executeCopyFromYear(availableYears[0]);
            } else {
                // 여러 연도가 있을 경우 가장 최근 등록 연도로 복사 확인
                await executeCopyFromYear(availableYears[0]);
            }
        });

        // 0-2. 배너의 바로 복사 버튼
        document.getElementById('quickCopyYearBtn')?.addEventListener('click', async (e) => {
            const yr = e.currentTarget.dataset.year;
            if (yr) {
                await executeCopyFromYear(yr);
            }
        });

        // 1. 입학년도 변경 이벤트: 선택 즉시 해당 연도 데이터 로드
        document.getElementById('admissionYearSelect')?.addEventListener('change', (e) => {
            currentAdmissionYear = parseInt(e.target.value, 10);
            renderMainScreen();
        });

        // 2. 스마트 실시간 검색 이벤트
        const searchInput = document.getElementById('cutoffSchoolSearch');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                searchKeyword = e.target.value.trim();
                renderMainScreen();
                const freshInput = document.getElementById('cutoffSchoolSearch');
                if (freshInput) {
                    freshInput.focus();
                    freshInput.selectionStart = freshInput.selectionEnd = freshInput.value.length;
                }
            });
            document.getElementById('clearCutoffSearch')?.addEventListener('click', () => {
                searchKeyword = '';
                renderMainScreen();
            });
        }

        // 3. 탭 전환 이벤트
        app.querySelectorAll('.nav-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                currentTab = btn.dataset.tab;
                renderMainScreen();
            });
        });

        // 4. 행 삭제 이벤트 (UI 제거 및 백엔드 DB 삭제 즉시 연동)
        app.querySelectorAll('.btn-delete-row').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const tr = e.target.closest('tr');
                if (tr) {
                    const school = tr.dataset.school;
                    const dept = tr.querySelector('.row-dept-name')?.value.trim() ?? tr.dataset.dept ?? '';
                    const track = tr.querySelector('.row-track-name')?.value.trim() || '일반';
                    deletedCutoffList.push({
                        year: currentAdmissionYear,
                        schoolName: school,
                        department: normalizeDept(dept),
                        track: normalizeTrack(track)
                    });
                    tr.remove();
                    if (window.go?.main?.App?.DeleteCutoff) {
                        try {
                            await window.go.main.App.DeleteCutoff(currentAdmissionYear, school, normalizeDept(dept), normalizeTrack(track));
                            allSavedCutoffs = (allSavedCutoffs || []).filter(c => 
                                !(c.year === currentAdmissionYear && normalizeSchoolName(c.schoolName) === normalizeSchoolName(school) && normalizeDept(c.department) === normalizeDept(dept) && normalizeTrack(c.track) === normalizeTrack(track))
                            );
                            window.dispatchEvent(new CustomEvent('cutoffs-updated', { detail: allSavedCutoffs }));
                        } catch (delErr) {
                            console.warn('DB 커트라인 삭제 연동 경고:', delErr);
                        }
                    }
                }
            });
        });

        // 5. 병합된 학과 셀 수정 동기화
        app.querySelectorAll('.row-dept-name[data-dept-group]').forEach(input => {
            input.addEventListener('input', () => {
                const dept = input.value.trim();
                app.querySelectorAll(`.cutoff-item-row[data-dept-group="${input.dataset.deptGroup}"]`)
                    .forEach(row => { row.dataset.dept = dept; });
            });
        });

        // 6. 학과·전형 추가 이벤트
        app.querySelectorAll('.btn-add-dept').forEach(btn => {
            btn.addEventListener('click', () => {
                const schName = btn.dataset.school;
                const scoreType = btn.dataset.type;
                const card = btn.closest('.school-cutoff-card');
                const tbody = card.querySelector('tbody');
                if (tbody) {
                    const tr = document.createElement('tr');
                    tr.className = "border-b border-slate-700/40 hover:bg-slate-800/40 transition-colors cutoff-item-row";
                    tr.dataset.school = schName;
                    tr.dataset.type = scoreType;
                    const unit = scoreType === 'percentile' ? '%' : '점';
                    tr.innerHTML = `
                        <td class="p-3">
                            <input type="text" class="input-field py-1.5 px-2.5 text-xs font-bold text-white row-dept-name" value="" placeholder="비우면 학교 전체" />
                        </td>
                        <td class="p-3">
                            <input type="text" class="input-field py-1.5 px-2.5 text-xs text-indigo-300 row-track-name" value="일반" placeholder="전형 (예: 일반)" />
                        </td>
                        <td class="p-3 text-center">
                            <div class="flex items-center justify-center gap-1">
                                <input type="text" inputmode="decimal" class="input-field py-1.5 px-2 text-xs text-right font-bold text-emerald-300 w-28 row-min-score" 
                                       value="" placeholder="최저점" />
                                <span class="text-xs text-slate-400">${unit}</span>
                            </div>
                        </td>
                        <td class="p-3 text-center">
                            <div class="flex items-center justify-center gap-1">
                                <input type="text" inputmode="decimal" class="input-field py-1.5 px-2 text-xs text-right font-semibold text-sky-300 w-28 row-max-score" 
                                       value="" placeholder="선택" />
                                <span class="text-xs text-slate-400">${unit}</span>
                            </div>
                        </td>
                        <input type="hidden" class="row-avg-score" value="" />
                        <td class="p-3 text-center">
                            <button class="text-xs text-danger/80 hover:text-danger hover:bg-danger/10 p-1.5 rounded transition-colors btn-delete-row" title="행 삭제">🗑️</button>
                        </td>
                    `;
                    tbody.appendChild(tr);
                    tr.querySelector('.btn-delete-row').addEventListener('click', () => tr.remove());
                }
            });
        });

        // 공개 데이터 일괄/선택 반영 헬퍼 함수
        const applyPublicDataIndices = async (indices) => {
            if (!indices || indices.length === 0) {
                await showModalAlert({
                    title: '선택 확인',
                    message: '반영할 항목을 선택해주세요.',
                    type: 'warning'
                });
                return;
            }

            const newCutoffs = [];
            indices.forEach(idx => {
                const item = publicOfficialData[idx];
                if (!item || !item.school || !item.min || Number(item.min) <= 0) return;
                const min = parseFloat(item.min);
                const max = parseFloat(item.max);
                const avg = parseFloat(item.avg);
                const targetYear = item.year || currentAdmissionYear;
                const scoreType = String(item.school).includes('일반계고') ? 'percentile' : 'total_score';

                newCutoffs.push({
                    year: targetYear,
                    schoolName: item.school,
                    department: normalizeDept(item.dept),
                    track: normalizeTrack(item.track),
                    scoreType: scoreType,
                    minValue: min,
                    maxValue: Number.isFinite(max) && max > 0 ? max : min,
                    avgValue: Number.isFinite(avg) && avg > 0 ? avg : 0
                });
            });

            if (newCutoffs.length === 0) {
                await showModalAlert({
                    title: '반영 대상 없음',
                    message: '선택한 항목 중 유효한 고교명과 최저 합격선(양수)이 입력된 항목이 없습니다.',
                    type: 'warning'
                });
                return;
            }

            try {
                await window.go.main.App.SaveCutoffs(newCutoffs);
                allSavedCutoffs = await window.go.main.App.GetCutoffs() || [];
                window.dispatchEvent(new CustomEvent('cutoffs-updated', { detail: allSavedCutoffs }));
                await showModalAlert({
                    title: '커트라인 반영 완료',
                    message: `총 <strong>${newCutoffs.length}건</strong>의 공식 입결 데이터가 각 연도별 고교 커트라인으로 성공적으로 반영되었습니다!<br><br>이제 신호등 종합 매트릭스와 진학 상담 화면에서 실시간 적용됩니다.`,
                    type: 'success'
                });
                renderMainScreen();
            } catch (err) {
                await showModalAlert({ title: '반영 실패', message: String(err), type: 'error' });
            }
        };

        // 7. 개별 공개 데이터 복사 적용 버튼
        app.querySelectorAll('.btn-apply-public-item').forEach(btn => {
            btn.addEventListener('click', async () => {
                const idx = Number(btn.dataset.index);
                await applyPublicDataIndices([idx]);
            });
        });

        document.getElementById('saveAllCutoffsBtn')?.addEventListener('click', () => saveAllCutoffs(false));

        // 7-1. 커트라인 초기화 버튼 이벤트 (연도별 선택 또는 전체 초기화)
        document.getElementById('resetCutoffsBtn')?.addEventListener('click', async () => {
            const confirmed = await showModalConfirm({
                title: '커트라인 초기화 확인',
                message: `현재 선택된 <strong>${currentAdmissionYear}학년도</strong> 커트라인을 초기화하시겠습니까?<br><br><span class="text-xs text-slate-400">※ 전체 5개년 모든 데이터를 완전 백지화하려면 다음 질문에서 전체 초기화를 선택할 수 있습니다.</span>`,
                confirmText: '초기화 진행',
                type: 'warning'
            });
            if (!confirmed) return;

            const isAllYears = await showModalConfirm({
                title: '전체 연도 초기화 선택',
                message: `모든 연도(5개년 전체)의 커트라인과 공개 입결 데이터를 완전 백지화하시겠습니까?<br><br>- <strong>[전체 백지화]</strong>: 5개년 전체 데이터 삭제<br>- <strong>[해당 연도만]</strong>: 현재 ${currentAdmissionYear}학년도 데이터만 삭제`,
                confirmText: '전체 백지화',
                cancelText: '해당 연도만',
                type: 'error'
            });

            try {
                if (isAllYears) {
                    if (window.go?.main?.App?.ResetCutoffs) {
                        await window.go.main.App.ResetCutoffs(0);
                    }
                    publicOfficialData = [];
                    await syncPublicOfficialData();
                } else {
                    if (window.go?.main?.App?.ResetCutoffs) {
                        await window.go.main.App.ResetCutoffs(currentAdmissionYear);
                    }
                    publicOfficialData = publicOfficialData.filter(item => Number(item.year) !== currentAdmissionYear);
                    await syncPublicOfficialData();
                }
                allSavedCutoffs = await window.go.main.App.GetCutoffs() || [];
                window.dispatchEvent(new CustomEvent('cutoffs-updated', { detail: allSavedCutoffs }));
                await showModalAlert({
                    title: '초기화 완료',
                    message: isAllYears 
                        ? '전체 연도의 고교 커트라인 및 공개 입결 데이터가 완전히 초기화되었습니다.' 
                        : `<strong>${currentAdmissionYear}학년도</strong>의 고교 커트라인이 안전하게 초기화되었습니다.`,
                    type: 'success'
                });
                renderMainScreen();
            } catch (err) {
                await showModalAlert({ title: '초기화 실패', message: String(err), type: 'error' });
            }
        });

        if (currentTab === 'public') {
            // 연도 필터링 버튼 이벤트
            document.getElementById('btnFilterPublicCurrentYear')?.addEventListener('click', () => {
                publicYearFilterMode = 'current';
                renderMainScreen();
            });
            document.getElementById('btnFilterPublicAllYears')?.addEventListener('click', () => {
                publicYearFilterMode = 'all';
                renderMainScreen();
            });

            // 전체 선택 / 해제 체크박스 이벤트
            const checkAllBox = document.getElementById('checkAllPublicItems');
            checkAllBox?.addEventListener('change', (e) => {
                const checked = e.target.checked;
                app.querySelectorAll('.public-item-check').forEach(cb => { cb.checked = checked; });
            });

            // 전체 일괄 반영 버튼 이벤트
            document.getElementById('btnApplyAllPublic')?.addEventListener('click', async () => {
                const visibleCheckboxes = Array.from(app.querySelectorAll('.public-item-check'));
                const allIndices = visibleCheckboxes.map(cb => Number(cb.dataset.index));
                if (allIndices.length === 0) {
                    await showModalAlert({ title: '안내', message: '반영할 공개 데이터가 없습니다.', type: 'info' });
                    return;
                }
                const confirmed = await showModalConfirm({
                    title: '공개 데이터 일괄 반영',
                    message: `현재 화면에 표시된 <strong>${allIndices.length}개</strong> 공개 데이터를 각 연도별 고교 커트라인에 일괄 반영하시겠습니까?`,
                    confirmText: '일괄 반영',
                    type: 'info'
                });
                if (confirmed) {
                    await applyPublicDataIndices(allIndices);
                }
            });

            // 선택 항목 반영 버튼 이벤트
            document.getElementById('btnApplySelectedPublic')?.addEventListener('click', async () => {
                const checkedBoxes = Array.from(app.querySelectorAll('.public-item-check:checked'));
                const selectedIndices = checkedBoxes.map(cb => Number(cb.dataset.index));
                if (selectedIndices.length === 0) {
                    await showModalAlert({ title: '선택 확인', message: '반영할 항목의 체크박스를 1개 이상 선택해주세요.', type: 'warning' });
                    return;
                }
                await applyPublicDataIndices(selectedIndices);
            });

            // 선택 항목 삭제 버튼 이벤트
            document.getElementById('btnDeleteSelectedPublic')?.addEventListener('click', async () => {
                const checkedBoxes = Array.from(app.querySelectorAll('.public-item-check:checked'));
                const selectedIndices = checkedBoxes.map(cb => Number(cb.dataset.index)).sort((a, b) => b - a);
                if (selectedIndices.length === 0) {
                    await showModalAlert({ title: '선택 확인', message: '삭제할 항목의 체크박스를 1개 이상 선택해주세요.', type: 'warning' });
                    return;
                }
                const confirmed = await showModalConfirm({
                    title: '공개자료 삭제',
                    message: `선택한 <strong>${selectedIndices.length}개</strong> 공개자료 항목을 삭제하시겠습니까?`,
                    confirmText: '삭제',
                    type: 'warning'
                });
                if (confirmed) {
                    const toDelete = [];
                    selectedIndices.forEach(idx => {
                        if (idx >= 0 && idx < publicOfficialData.length) {
                            const item = publicOfficialData[idx];
                            if (item) {
                                toDelete.push({
                                    year: item.year || currentAdmissionYear,
                                    schoolName: item.school,
                                    department: normalizeDept(item.dept),
                                    track: normalizeTrack(item.track)
                                });
                            }
                            publicOfficialData.splice(idx, 1);
                        }
                    });
                    await syncPublicOfficialData();
                    if (toDelete.length > 0 && window.go?.main?.App?.DeleteCutoffs) {
                        try {
                            await window.go.main.App.DeleteCutoffs(toDelete);
                            allSavedCutoffs = await window.go.main.App.GetCutoffs() || [];
                            window.dispatchEvent(new CustomEvent('cutoffs-updated', { detail: allSavedCutoffs }));
                        } catch (e) {
                            console.warn('DB 커트라인 삭제 연동 실패:', e);
                        }
                    }
                    renderMainScreen();
                }
            });

            // 테이블 학교명 셀 변경 동기화
            app.querySelectorAll('.public-school-select').forEach(sel => {
                sel.addEventListener('change', async (e) => {
                    const newSchool = e.target.value;
                    const oldSchool = sel.dataset.groupSchool;
                    const gYear = Number(sel.dataset.groupYear);
                    publicOfficialData.forEach(item => {
                        if (item.year === gYear && normalizeSchoolName(item.school) === normalizeSchoolName(oldSchool)) {
                            item.school = newSchool;
                            item.unit = newSchool.includes('일반계고') ? '%' : '점';
                        }
                    });
                    await syncPublicOfficialData();
                    renderMainScreen();
                });
            });

            // 인풋 실시간 동기화
            const updateField = async (input, field, isNum = false) => {
                const idx = Number(input.dataset.index);
                if (publicOfficialData[idx]) {
                    const val = input.value.trim();
                    publicOfficialData[idx][field] = isNum ? (parseFloat(val) || '') : val;
                    await syncPublicOfficialData();
                }
            };
            app.querySelectorAll('.public-dept').forEach(inp => inp.addEventListener('change', () => updateField(inp, 'dept')));
            app.querySelectorAll('.public-track').forEach(inp => inp.addEventListener('change', () => updateField(inp, 'track')));
            app.querySelectorAll('.public-min-score').forEach(inp => inp.addEventListener('change', () => updateField(inp, 'min', true)));
            app.querySelectorAll('.public-max-score').forEach(inp => inp.addEventListener('change', () => updateField(inp, 'max', true)));
            app.querySelectorAll('.public-avg-score').forEach(inp => inp.addEventListener('change', () => updateField(inp, 'avg', true)));
            app.querySelectorAll('.public-note').forEach(inp => inp.addEventListener('change', () => updateField(inp, 'note')));
            app.querySelectorAll('.public-year').forEach(inp => inp.addEventListener('change', () => updateField(inp, 'year', true)));

            // 공식 공개자료 추가 버튼
            document.getElementById('addPublicDataBtn')?.addEventListener('click', async () => {
                await renderAddPublicDataModal(currentAdmissionYear, admissionYears, async (newEntry) => {
                    publicOfficialData.unshift(newEntry);
                    await syncPublicOfficialData();
                    renderMainScreen();
                });
            });

            // 개별 행 삭제 버튼 (UI 및 DB 즉시 삭제 연동)
            app.querySelectorAll('.btn-delete-public-item').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const index = Number(btn.dataset.index);
                    if (index >= 0 && index < publicOfficialData.length) {
                        const item = publicOfficialData[index];
                        if (item && window.go?.main?.App?.DeleteCutoff) {
                            try {
                                await window.go.main.App.DeleteCutoff(
                                    item.year || currentAdmissionYear,
                                    item.school,
                                    normalizeDept(item.dept),
                                    normalizeTrack(item.track)
                                );
                                allSavedCutoffs = await window.go.main.App.GetCutoffs() || [];
                                window.dispatchEvent(new CustomEvent('cutoffs-updated', { detail: allSavedCutoffs }));
                            } catch (e) {
                                console.warn('DB 커트라인 삭제 연동 실패:', e);
                            }
                        }
                        publicOfficialData.splice(index, 1);
                        await syncPublicOfficialData();
                        renderMainScreen();
                    }
                });
            });
        }

        // 8. 전체 저장 함수 (공개자료 탭일 때는 공개자료 자동 일괄 반영 연동)
        const saveAllCutoffs = async (silent = false) => {
            // 만약 현재 공개자료 탭을 보고 있다면: 공개 데이터를 실제 고교 커트라인으로 일괄 반영 처리!
            if (currentTab === 'public') {
                const visibleCheckboxes = Array.from(app.querySelectorAll('.public-item-check'));
                const allIndices = visibleCheckboxes.map(cb => Number(cb.dataset.index));
                if (allIndices.length > 0) {
                    const confirmed = await showModalConfirm({
                        title: '공식 데이터 일괄 반영',
                        message: `공개자료 탭에 표시된 <strong>${allIndices.length}개</strong> 공식 데이터를 현재 입학년도 커트라인으로 일괄 반영 및 저장하시겠습니까?`,
                        confirmText: '반영 및 저장',
                        type: 'info'
                    });
                    if (confirmed) {
                        await applyPublicDataIndices(allIndices);
                        return true;
                    }
                }
            }

            const rows = app.querySelectorAll('.cutoff-item-row');
            const cutoffs = [];

            rows.forEach(tr => {
                const school = tr.dataset.school;
                const scoreType = tr.dataset.type;
                const dept = tr.querySelector('.row-dept-name')?.value.trim() ?? tr.dataset.dept ?? '';
                const track = tr.querySelector('.row-track-name')?.value.trim() || '일반';
                const minStr = tr.querySelector('.row-min-score')?.value.trim();
                const maxStr = tr.querySelector('.row-max-score')?.value.trim();
                const avgStr = tr.querySelector('.row-avg-score')?.value.trim();

                const minVal = parseFloat(minStr);
                const maxVal = parseFloat(maxStr);
                const avgVal = parseFloat(avgStr);

                if (!isNaN(minVal) && minVal > 0) {
                    cutoffs.push({
                        year: currentAdmissionYear,
                        schoolName: school,
                        department: dept,
                        track: track,
                        scoreType: scoreType,
                        minValue: minVal,
                        maxValue: !isNaN(maxVal) && maxVal > 0 ? maxVal : minVal,
                        avgValue: !isNaN(avgVal) && avgVal > 0 ? avgVal : 0
                    });
                } else if (school) {
                    // 점수란을 지워 비워둔 항목은 DB에서도 삭제 대상으로 등록
                    deletedCutoffList.push({
                        year: currentAdmissionYear,
                        schoolName: school,
                        department: normalizeDept(dept),
                        track: normalizeTrack(track)
                    });
                }
            });

            // 삭제 대기 중인 항목들이 있으면 DB에서 영구 삭제
            if (deletedCutoffList.length > 0 && window.go?.main?.App?.DeleteCutoffs) {
                try {
                    await window.go.main.App.DeleteCutoffs(deletedCutoffList);
                } catch (delErr) {
                    console.warn('DB 커트라인 삭제 연동 실패:', delErr);
                }
                deletedCutoffList = [];
            }

            if (cutoffs.length === 0) {
                allSavedCutoffs = await window.go.main.App.GetCutoffs() || [];
                window.dispatchEvent(new CustomEvent('cutoffs-updated', { detail: allSavedCutoffs }));
                if (!silent) {
                    const totalAllYears = (allSavedCutoffs || []).length;
                    await showModalAlert({
                        title: '커트라인 저장 완료',
                        message: `<strong>${currentAdmissionYear}학년도</strong>에는 입력된 커트라인 점수가 없어 해당 학년도 커트라인이 빈 상태(초기화)로 저장되었습니다.<br><span class="text-xs text-slate-400 mt-1.5 block">※ 다른 학년도(2024, 2026 등)의 커트라인은 안전하게 보존됩니다. (전체 누적: 총 <strong>${totalAllYears}건</strong> 유지 중)</span>`,
                        type: 'info'
                    });
                }
                renderMainScreen();
                return true;
            }

            try {
                await window.go.main.App.SaveCutoffs(cutoffs);
                allSavedCutoffs = await window.go.main.App.GetCutoffs() || [];
                window.dispatchEvent(new CustomEvent('cutoffs-updated', { detail: allSavedCutoffs }));
                if (!silent) {
                    const totalAllYears = (allSavedCutoffs || []).length;
                    await showModalAlert({
                        title: '커트라인 저장 완료',
                        message: `<strong>${currentAdmissionYear}학년도</strong> 총 <strong>${cutoffs.length}건</strong>의 고교·학과별 커트라인 및 공식 공개 입결 자료가 안전하게 저장되었습니다!<br><span class="text-xs text-slate-400 mt-1.5 block">※ 전체 학년도 누적 커트라인은 총 <strong>${totalAllYears}건</strong>이 안전하게 보관 중입니다.</span>`,
                        type: 'success'
                    });
                }
                renderMainScreen();
                return true;
            } catch (err) {
                await showModalAlert({ title: '저장 실패', message: String(err), type: 'error' });
                return false;
            }
        };

        // 8-1. 전체 연도 일괄 저장 함수 (현재 화면의 점수들을 최근 5개년 전체에 일괄 복제 저장)
        const saveAllYearsCutoffs = async () => {
            const rows = app.querySelectorAll('.cutoff-item-row');
            const baseCutoffs = [];

            rows.forEach(tr => {
                const school = tr.dataset.school;
                const scoreType = tr.dataset.type;
                const dept = tr.querySelector('.row-dept-name')?.value.trim() ?? tr.dataset.dept ?? '';
                const track = tr.querySelector('.row-track-name')?.value.trim() || '일반';
                const minStr = tr.querySelector('.row-min-score')?.value.trim();
                const maxStr = tr.querySelector('.row-max-score')?.value.trim();
                const avgStr = tr.querySelector('.row-avg-score')?.value.trim();

                const minVal = parseFloat(minStr);
                const maxVal = parseFloat(maxStr);
                const avgVal = parseFloat(avgStr);

                if (!isNaN(minVal) && minVal > 0) {
                    baseCutoffs.push({
                        schoolName: school,
                        department: dept,
                        track: track,
                        scoreType: scoreType,
                        minValue: minVal,
                        maxValue: !isNaN(maxVal) && maxVal > 0 ? maxVal : minVal,
                        avgValue: !isNaN(avgVal) && avgVal > 0 ? avgVal : 0
                    });
                }
            });

            if (baseCutoffs.length === 0) {
                await showModalAlert({
                    title: '저장할 점수 없음',
                    message: '현재 화면에 입력된 유효 커트라인 점수가 없습니다.<br>점수를 먼저 입력하거나 타 연도 데이터를 복사해온 후 일괄 저장을 실행해주세요.',
                    type: 'warning'
                });
                return false;
            }

            const yearListText = admissionYears.map(y => `<strong>${y}학년도</strong>`).join(', ');
            const confirmed = await showModalConfirm({
                title: '전체 연도 커트라인 일괄 저장',
                message: `현재 화면에 입력된 <strong>총 ${baseCutoffs.length}개</strong>의 고교·학과별 커트라인을<br>최근 5개년 전체(${yearListText})에 일괄 복제 저장하시겠습니까?<br><br>` +
                         `<span class="text-xs text-indigo-300">✓ 5개년 전체에 동일한 기준 커트라인이 한 번에 등록됩니다.<br>✓ 저장 후 어떤 학년도를 선택하셔도 커트라인이 정상 표시됩니다.<br>✓ 특정 학년도의 세부 점수는 언제든 개별 수정 가능합니다.</span>`,
                confirmText: '5개년 전체 일괄 저장',
                type: 'info'
            });

            if (!confirmed) return false;

            // 5개년 전체 연도에 대해 커트라인 레코드 생성
            const allYearsToSave = [];
            admissionYears.forEach(year => {
                baseCutoffs.forEach(item => {
                    allYearsToSave.push({
                        ...item,
                        year: Number(year)
                    });
                });
            });

            try {
                await window.go.main.App.SaveCutoffs(allYearsToSave);
                allSavedCutoffs = await window.go.main.App.GetCutoffs() || [];
                window.dispatchEvent(new CustomEvent('cutoffs-updated', { detail: allSavedCutoffs }));
                await showModalAlert({
                    title: '전체 연도 일괄 저장 완료',
                    message: `최근 5개년 전체(${yearListText})에 걸쳐<br>총 <strong>${allYearsToSave.length}건</strong>(${baseCutoffs.length}개 항목 × ${admissionYears.length}개년)의 커트라인이 안전하게 일괄 저장되었습니다!<br><br>이제 상단 학년도를 어떤 연도로 바꾸셔도 등록된 커트라인을 바로 확인하실 수 있습니다.`,
                    type: 'success'
                });
                renderMainScreen();
                return true;
            } catch (err) {
                await showModalAlert({ title: '일괄 저장 실패', message: String(err), type: 'error' });
                return false;
            }
        };

        // 전체 연도 일괄 저장 버튼 이벤트 연결
        document.getElementById('saveAllYearsCutoffsBtn')?.addEventListener('click', () => {
            saveAllYearsCutoffs();
        });

        // 9. 관내 진학자료 내보내기 (커트라인 + 지원현황 통계 + 공식자료 오프라인 패키징)
        document.getElementById('exportJointDataBtn')?.addEventListener('click', async () => {
            const btn = document.getElementById('exportJointDataBtn');
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner"></span> 내보내는 중...';
            try {
                // 현재 수정 중인 커트라인 우선 자동 저장
                await saveAllCutoffs(true);
                const path = await window.go.main.App.ExportJointShareData(currentAdmissionYear);
                if (path) {
                    await showModalAlert({
                        title: '자료 내보내기 완료',
                        message: `<strong>${currentAdmissionYear}학년도</strong> 관내 진학자료가 안전하게 저장되었습니다!<br><br>📂 <strong>저장 파일:</strong><br><span class="text-xs text-indigo-300 font-mono break-all">${path}</span><br><br><span class="text-emerald-400 text-xs">✓ 학생 성명, 학급 등 개인정보는 100% 원천 배제되었습니다.<br>✓ 이 파일을 타 학교 진학 담당 선생님께 전달하여 공유하세요.</span>`,
                        type: 'success'
                    });
                }
            } catch (err) {
                await showModalAlert({ title: '내보내기 실패', message: String(err), type: 'error' });
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<span>📤</span> 자료 내보내기';
            }
        });

        // 10. 타교 진학자료 병합 (타 학교 커트라인, 합격결과, 공식자료 스마트 병합)
        document.getElementById('importJointDataBtn')?.addEventListener('click', async () => {
            const btn = document.getElementById('importJointDataBtn');
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner"></span> 병합 중...';
            try {
                const res = await window.go.main.App.ImportJointShareData(currentAdmissionYear);
                if (res) {
                    allSavedCutoffs = await window.go.main.App.GetCutoffs() || [];
                    const totalAllYears = (allSavedCutoffs || []).length;
                    await showModalAlert({
                        title: '타교자료 일괄 병합 완료',
                        message: `선택하신 타 학교 진학자료가 성공적으로 병합되었습니다!<br><br>` +
                                 `• 처리된 파일: <strong>${res.files || 1}개 학교 자료</strong><br>` +
                                 `• 커트라인 갱신: 총 <strong>${res.cutoffs || 0}건</strong> (전체 학년도 누적 병합)<br>` +
                                 `• 타교 지원현황 합격선 반영: <strong>${res.applications || 0}건</strong><br>` +
                                 `• 공식 공개자료 보완: <strong>${res.official || 0}건</strong><br><br>` +
                                 `<span class="text-xs text-slate-400 block">💡 상단 학년도(2026, 2025 등)를 전환하시면 각 학년도별로 분할 저장된 커트라인(${res.cutoffs || 0}건 중 해당 연도분)을 확인하실 수 있습니다. (전체 보관: ${totalAllYears}건)</span>`,
                        type: 'success'
                    });
                    renderMainScreen();
                }
            } catch (err) {
                await showModalAlert({ title: '병합 실패', message: String(err), type: 'error' });
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<span>📥</span> 타교자료 병합';
            }
        });

        // 11. 대시보드로 돌아가기
        document.getElementById('backToAdminBtn')?.addEventListener('click', () => {
            renderAdminScreen(schoolName);
        });
    };

    renderMainScreen();
}

// 울산 관내 고교 공식 공개자료 신규 추가 모달 (학교별 학과·전형 자동 연동 & 최고/평균/최저점)
async function renderAddPublicDataModal(defaultYear, availableYears, onAddCallback) {
    document.getElementById('addPublicDataModal')?.remove();

    // 서버의 highschools.json에서 고교 목록 동적 로드 (하드코딩 제거)
    let ulsanSchools = [];
    let schoolDeptMap = {};
    try {
        const highSchoolData = await window.go.main.App.GetHighSchoolsData();
        const schools = highSchoolData?.schools || [];
        schools.forEach(s => {
            const t = (s.type || s.Type || '').toLowerCase();
            const note = (s.note || s.Note || '');
            const isMeister = t === 'meister' || t === '마이스터고' || note.includes('마이스터고');
            const isSpecial = t === 'special' || t === '특성화고' || note.includes('특성화고');
            if (!isMeister && !isSpecial) return;
            const rawName = s.name || s.Name || '';
            const shortName = normalizeSchoolName(rawName);
            const category = isMeister ? '마이스터고' : '특성화고';
            ulsanSchools.push({ name: shortName, category, unit: '점' });
            schoolDeptMap[shortName] = s.departments || s.Departments || [];
        });
        // 후기 일반고 추가
        ulsanSchools.push({ name: '울산 후기 일반계고', category: '후기 일반고', unit: '%' });
        schoolDeptMap['울산 후기 일반계고'] = [];
    } catch (e) {
        console.warn('공식자료 모달: 고교 목록 동적 로드 실패', e);
    }

    // 입학년도 기준: 2026년 기준 직전 5개년(2026, 2025, 2024, 2023, 2022) 연동
    const fallbackYear = 2026;
    const yearOptions = (availableYears && availableYears.length > 0)
        ? availableYears.filter(y => y <= 2026)
        : Array.from({ length: 5 }, (_, idx) => fallbackYear - idx);

    const selectedYear = (yearOptions.includes(defaultYear)) ? defaultYear : yearOptions[0];

    const modal = document.createElement('div');
    modal.id = 'addPublicDataModal';
    modal.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-200';
    modal.innerHTML = `
        <div class="glass-card max-w-lg w-full p-6 border border-indigo-500/40 rounded-3xl shadow-2xl flex flex-col gap-4 text-left animate-in zoom-in-95 duration-200 break-keep-all select-none">
            <div class="flex items-center justify-between border-b border-slate-700/60 pb-3">
                <div class="flex items-center gap-2">
                    <span class="text-xl">📊</span>
                    <h3 class="font-bold text-white text-base">공식 공개 입결자료 추가</h3>
                </div>
                <button id="closeAddPublicModalBtn" class="text-slate-400 hover:text-white p-1.5 rounded-lg text-base cursor-pointer transition-colors">✕</button>
            </div>

            <div class="space-y-3.5 text-xs">
                <!-- 1. 입학년도 (직전 5개년 자동 연동) -->
                <div>
                    <label class="text-slate-300 font-bold mb-1 flex items-center justify-between">
                        <span>📅 입학년도</span>
                        <span class="text-[11px] text-slate-400 font-normal">결과 발표된 최근 5개년 기준</span>
                    </label>
                    <select id="modalPublicYear" class="input-field w-full py-2.5 px-3 bg-slate-900 border-slate-700 rounded-xl text-white font-bold cursor-pointer text-xs">
                        ${yearOptions.map(y => `<option value="${y}" ${y === selectedYear ? 'selected' : ''}>${y}학년도 입학 기준</option>`).join('')}
                    </select>
                </div>

                <!-- 2. 대상 고등학교 (학교 이름만 깔끔하게 표시) -->
                <div>
                    <label class="block text-slate-300 font-bold mb-1">🏫 울산 관내 대상 고등학교</label>
                    <select id="modalPublicSchool" class="input-field w-full py-2.5 px-3 bg-slate-900 border-slate-700 rounded-xl text-white font-bold cursor-pointer text-xs">
                        ${ulsanSchools.map(s => `<option value="${s.name}" data-category="${s.category}" data-unit="${s.unit}">[${s.category}] ${s.name}</option>`).join('')}
                    </select>
                </div>

                <!-- 3. 학과명 (최신 공식 학과 자동 연동) & 전형 (비우면 전체) -->
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-slate-300 font-bold mb-1">학과명 <span class="text-indigo-400 font-normal">(최신 개편 학과)</span></label>
                        <select id="modalPublicDeptSelect" class="input-field w-full py-2.5 px-2.5 bg-slate-900 border-slate-700 rounded-xl text-white font-semibold cursor-pointer text-xs">
                            <option value="">학교 전체 (공통)</option>
                        </select>
                        <input id="modalPublicDeptCustom" type="text" placeholder="학과 직접 입력" class="input-field w-full py-2 px-2.5 mt-1.5 bg-slate-900 border-indigo-500/50 rounded-lg text-white hidden text-xs" />
                    </div>
                    <div>
                        <label class="block text-slate-300 font-bold mb-1">전형 <span class="text-indigo-400 font-normal">(비우면 전체)</span></label>
                        <select id="modalPublicTrackSelect" class="input-field w-full py-2.5 px-2.5 bg-slate-900 border-slate-700 rounded-xl text-indigo-300 font-bold cursor-pointer text-xs">
                            <option value="">전체 (비움)</option>
                            <option value="일반" selected>일반</option>
                            <option value="특별">특별</option>
                        </select>
                    </div>
                </div>

                <!-- 4. 점수 입력 (최고점, 평균점, 최저점) & 전형별 점수 기준 동적 뱃지 -->
                <div>
                    <label class="text-slate-300 font-bold mb-1.5 flex items-center justify-between">
                        <span>🎯 입결 점수 입력</span>
                        <span id="modalScoreHintBadge" class="text-[11px] font-bold text-indigo-300 px-2 py-0.5 rounded bg-indigo-950/80 border border-indigo-500/30"></span>
                    </label>
                    <div class="grid grid-cols-3 gap-2.5">
                        <!-- 최고점 -->
                        <div class="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                            <label class="block text-sky-300 font-bold mb-1 text-[11px] text-center">최고점 (선택)</label>
                            <div class="flex items-center justify-center gap-1">
                                <input id="modalPublicMax" type="text" inputmode="decimal" placeholder="선택" class="input-field w-full py-1.5 px-1 text-right font-bold text-sky-300 bg-slate-900 border-slate-700 rounded-lg text-xs" />
                                <span class="modal-unit text-slate-400 text-[11px] shrink-0">점</span>
                            </div>
                        </div>

                        <!-- 평균점 -->
                        <div class="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                            <label class="block text-amber-300 font-bold mb-1 text-[11px] text-center">평균점 (선택)</label>
                            <div class="flex items-center justify-center gap-1">
                                <input id="modalPublicAvg" type="text" inputmode="decimal" placeholder="선택" class="input-field w-full py-1.5 px-1 text-right font-bold text-amber-300 bg-slate-900 border-slate-700 rounded-lg text-xs" />
                                <span class="modal-unit text-slate-400 text-[11px] shrink-0">점</span>
                            </div>
                        </div>

                        <!-- 최저점 (합격선/필수) -->
                        <div class="bg-slate-900/60 p-2.5 rounded-xl border border-emerald-500/40">
                            <label class="block text-emerald-400 font-black mb-1 text-[11px] text-center">최저점 (합격선) *</label>
                            <div class="flex items-center justify-center gap-1">
                                <input id="modalPublicMin" type="text" inputmode="decimal" placeholder="필수" class="input-field w-full py-1.5 px-1 text-right font-black text-emerald-400 bg-slate-900 border-emerald-500/50 rounded-lg text-xs" />
                                <span class="modal-unit text-slate-400 text-[11px] shrink-0">점</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 5. 출처 / 비고 -->
                <div>
                    <label class="block text-slate-300 font-semibold mb-1">출처 / 비고</label>
                    <input id="modalPublicNote" type="text" value="공식 합격선" placeholder="예: 고교 입시설명회 발표 자료" class="input-field w-full py-2 px-3 bg-slate-900 border-slate-700 rounded-xl text-slate-300 text-xs" />
                </div>
            </div>

            <!-- 하단 취소 및 추가하기 버튼 (시원한 5:5 그리드) -->
            <div class="grid grid-cols-2 gap-3 pt-3 border-t border-slate-700/60 mt-2">
                <button id="cancelAddPublicModalBtn" type="button" class="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 font-bold text-xs transition-colors cursor-pointer text-center">
                    취소
                </button>
                <button id="submitAddPublicModalBtn" type="button" class="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs shadow-lg shadow-indigo-950/50 hover:shadow-indigo-500/25 transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 text-center">
                    <span>➕</span> 추가하기
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    const schoolSel = document.getElementById('modalPublicSchool');
    const deptSel = document.getElementById('modalPublicDeptSelect');
    const deptCustom = document.getElementById('modalPublicDeptCustom');
    const trackSel = document.getElementById('modalPublicTrackSelect');

    // 학교와 전형에 따른 실시간 점수 만점 힌트 계산 함수
    const getSchoolTrackHint = (schoolName, trackName, category) => {
        const sch = (schoolName || '').trim();
        const trk = (trackName || '').trim();

        if (sch.includes('일반고') || category === '후기 일반고') {
            return '석차 백분율 (%) 기준';
        }

        if (sch.includes('마이스터') || sch.includes('울산마이스터')) {
            if (trk.includes('특별')) return '300점 만점 기준 (특별전형)';
            return '300점 만점 기준 (일반전형)';
        }

        if (sch.includes('에너지') || sch.includes('울산에너지')) {
            if (trk.includes('특별')) return '230점 만점 기준 (특별전형)';
            return '230점 만점 기준 (일반전형)';
        }

        if (sch.includes('현대공업') || sch.includes('현대공고')) {
            if (trk.includes('특별')) return '200점 만점 기준 (특별전형)';
            return '200점 만점 기준 (일반전형)';
        }

        // 특성화고
        if (trk.includes('취업') || trk.includes('특별')) {
            return '100점 만점 기준 (취업희망자/특별전형)';
        }
        return '100점 만점 기준 (일반전형)';
    };

    // 점수 입력창의 힌트 텍스트 및 placeholder 동적 업데이트
    const updateScoreHint = () => {
        const selectedOpt = schoolSel.options[schoolSel.selectedIndex];
        const schoolName = selectedOpt ? selectedOpt.value : '';
        const category = selectedOpt ? selectedOpt.dataset.category : '';
        const unit = (selectedOpt ? selectedOpt.dataset.unit : '') || '점';
        const trackName = trackSel ? trackSel.value : '';

        const hintText = getSchoolTrackHint(schoolName, trackName, category);
        const badge = modal.querySelector('#modalScoreHintBadge');
        if (badge) badge.textContent = hintText;

        const minInput = modal.querySelector('#modalPublicMin');
        const maxInput = modal.querySelector('#modalPublicMax');
        const avgInput = modal.querySelector('#modalPublicAvg');

        if (unit === '%') {
            if (minInput) minInput.placeholder = '예: 142.44';
            if (avgInput) avgInput.placeholder = '예: 166.44';
            if (maxInput) maxInput.placeholder = '선택';
        } else {
            if (schoolName.includes('마이스터')) {
                if (minInput) minInput.placeholder = '예: 245.22';
                if (avgInput) avgInput.placeholder = '예: 272.60';
                if (maxInput) maxInput.placeholder = '예: 300.0';
            } else if (schoolName.includes('에너지')) {
                if (minInput) minInput.placeholder = '예: 185.0';
                if (avgInput) avgInput.placeholder = '선택';
                if (maxInput) maxInput.placeholder = '선택';
            } else if (schoolName.includes('현대공업')) {
                if (minInput) minInput.placeholder = '예: 160.0';
                if (avgInput) avgInput.placeholder = '선택';
                if (maxInput) maxInput.placeholder = '선택';
            } else {
                if (minInput) minInput.placeholder = '예: 70.0';
                if (avgInput) avgInput.placeholder = '선택';
                if (maxInput) maxInput.placeholder = '선택';
            }
        }
    };

    // 학교 변경 시 최신 학과 목록 및 전형 목록, 단위 자동 연동
    const syncSchoolFields = () => {
        const selectedOpt = schoolSel.options[schoolSel.selectedIndex];
        const schoolName = selectedOpt.value;
        const category = selectedOpt.dataset.category;
        const unit = selectedOpt.dataset.unit || '점';

        // 1. 점수 단위 업데이트
        modal.querySelectorAll('.modal-unit').forEach(el => el.textContent = unit);

        // 2. 최신 학과 드롭다운 자동 갱신
        const depts = schoolDeptMap[schoolName] || [];
        let deptHTML = `<option value="">학교 전체 (공통)</option>`;
        depts.forEach(d => {
            deptHTML += `<option value="${d}">${d}</option>`;
        });
        deptHTML += `<option value="__custom__">✏️ 직접 입력...</option>`;
        deptSel.innerHTML = deptHTML;
        deptCustom.classList.add('hidden');
        deptCustom.value = '';

        // 3. 전형 드롭다운 학교 유형별 맞춤 갱신
        let trackHTML = `<option value="">전체 (비움)</option>`;
        if (category === '마이스터고') {
            trackHTML += `<option value="일반" selected>일반</option>`;
            trackHTML += `<option value="특별">특별</option>`;
        } else if (category === '특성화고') {
            trackHTML += `<option value="일반" selected>일반</option>`;
            trackHTML += `<option value="취업희망자">취업희망자</option>`;
        } else {
            // 후기 일반고
            trackHTML += `<option value="일반" selected>일반</option>`;
        }
        trackSel.innerHTML = trackHTML;

        // 4. 점수 힌트 갱신
        updateScoreHint();
    };

    deptSel.addEventListener('change', () => {
        if (deptSel.value === '__custom__') {
            deptCustom.classList.remove('hidden');
            deptCustom.focus();
        } else {
            deptCustom.classList.add('hidden');
        }
    });

    trackSel.addEventListener('change', updateScoreHint);
    schoolSel.addEventListener('change', syncSchoolFields);
    syncSchoolFields();

    const closeModal = () => modal.remove();
    document.getElementById('closeAddPublicModalBtn').addEventListener('click', closeModal);
    document.getElementById('cancelAddPublicModalBtn').addEventListener('click', closeModal);

    document.getElementById('submitAddPublicModalBtn').addEventListener('click', async () => {
        const year = parseInt(document.getElementById('modalPublicYear').value, 10);
        const school = schoolSel.value;
        
        let dept = deptSel.value;
        if (dept === '__custom__') {
            dept = deptCustom.value.trim();
        }

        const track = trackSel.value.trim(); // 비우면 '' (전체)
        const minStr = document.getElementById('modalPublicMin').value.trim();
        const maxStr = document.getElementById('modalPublicMax').value.trim();
        const avgStr = document.getElementById('modalPublicAvg').value.trim();
        const note = document.getElementById('modalPublicNote').value.trim() || '공식 합격선';

        const minVal = parseFloat(minStr);
        if (isNaN(minVal) || minVal <= 0) {
            await showModalAlert({
                title: '입력 확인',
                message: '최저점(합격선/필수)을 올바른 숫자로 입력해 주세요.',
                type: 'warning'
            });
            document.getElementById('modalPublicMin').focus();
            return;
        }

        const maxVal = parseFloat(maxStr);
        const avgVal = parseFloat(avgStr);
        const unit = school.includes('일반계고') ? '%' : '점';

        onAddCallback({
            year,
            school,
            dept,
            track,
            min: minVal,
            max: !isNaN(maxVal) && maxVal > 0 ? maxVal : '',
            avg: !isNaN(avgVal) && avgVal > 0 ? avgVal : '',
            unit,
            note
        });

        closeModal();
    });
}
