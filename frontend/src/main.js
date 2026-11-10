// ===== 꼬미입시 프론트엔드 진입점 =====
// 앱 부트스트랩과 최상위 이벤트 라우팅만 담당한다. 화면·모달 모듈은 서로를 직접 호출하지 않고
// core/navigation.js 의 발행 함수(navigate, openModal 등)로 요청하며, 실제 연결은 이 파일의 구독자가 수행한다.
import './core/wailsBridge.js';
import './style.css';
import './app.css';
import { CheckSetupComplete } from '../wailsjs/go/main/App';
import { app } from './core/dom.js';
import { eventBus, EVENTS } from './core/eventBus.js';
import { state, patchState } from './core/store.js';
import { ScreenLockManager } from './core/screenLock.js';
import { initGlobalEscapeHandler } from './core/dialogs.js';
import { checkUpdateOnStartup, openExternalUrlSafe, FEEDBACK_BOARD_URL } from './core/updater.js';
import { getGeneralGuideCutoff, setGeneralGuideCutoff, getGeneralGuideBadge } from './core/generalGuide.js';
import { renderFirstRunScreen, renderSetupScreen, renderSyncScreen } from './views/auth/setupWizardView.js';
import { renderModeSelectScreen, renderLoginScreen } from './views/auth/loginView.js';
import { renderAgreementModal } from './views/auth/agreementView.js';
import { renderAdminScreen } from './views/admin/dashboardView.js';
import { renderUserManagementScreen } from './views/admin/userManagementView.js';
import { renderCutoffScreen } from './views/admin/cutoff/cutoffView.js';
import { openPatchImportModal } from './views/admin/patchMergeView.js';
import { renderTeacherScreen } from './views/teacher/classListView.js';
import { openStudentModal } from './views/teacher/counsel/studentModal.js';
import { openPredictionDetailModal } from './views/teacher/simulation/predictionDetailModal.js';
import { renderGuideModal } from './modals/guideModal.js';
import { openMatrixModal } from './modals/matrix/matrixModal.js';
import { openStudentApplicationModal } from './modals/application/studentApplicationModal.js';
import { openStudentTranscriptModal } from './modals/studentTranscriptModal.js';
import { openApplicationRegisterModal } from './modals/summary/registerModal.js';
import { openClassApplicationSummaryModal, openApplicationSummaryModal } from './modals/summary/applicationSummaryModal.js';
import { openSharedAdmissionModal } from './modals/sharedAdmissionModal.js';
import { openAdmissionAnalysisModal } from './modals/analysis/admissionAnalysisModal.js';

// 화면 잠금 및 전역 ESC 핸들러 초기화
ScreenLockManager.init();
initGlobalEscapeHandler();

// 로그인 화면에는 계정 선택 목록(login-index)이 필요하다. 로그아웃 등에서 학교명 문자열만 넘어와도
// 계정 목록이 비지 않도록 백엔드에서 목록을 다시 읽는다. 실패하면 학교명만으로 표시한다.
async function resolveLoginIndex(value) {
    if (value && typeof value === 'object') return value;
    try {
        const index = await window.go.main.App.GetLoginIndex();
        if (index && Array.isArray(index.accounts) && index.accounts.length > 0) return index;
    } catch (_) {}
    return value || '';
}

// ----- 화면(메뉴) 라우팅 표: app:navigate 이벤트의 screen 값 → 렌더러 -----
const SCREEN_ROUTES = {
    'first-run': () => renderFirstRunScreen(),
    'setup': (d) => renderSetupScreen(d.config ?? null),
    'sync': (d) => renderSyncScreen(d.schoolName || ''),
    'mode-select': (d) => renderModeSelectScreen(d.schoolName || ''),
    'login': async (d) => renderLoginScreen(await resolveLoginIndex(d.schoolName)),
    'admin': (d) => renderAdminScreen(d.schoolName || ''),
    'users': (d) => renderUserManagementScreen(d.schoolName || ''),
    'cutoff': (d) => renderCutoffScreen(d.schoolName || ''),
    'teacher': (d) => renderTeacherScreen(d.schoolName || '', d.classNum ?? null)
};

// ----- 모달 라우팅 표: modal:open 이벤트의 modal 값 → 모달 열기 함수 -----
const MODAL_ROUTES = {
    'matrix': (d) => openMatrixModal(d.classNum ?? null),
    'transcript': (d) => openStudentTranscriptModal(d.classNum, d.studentNum, d.name),
    'application': (d) => openStudentApplicationModal(d.classNum, d.studentNum, d.name, d.preset ?? null),
    'student': (d) => openStudentModal(d.classNum, d.studentNum, d.name),
    'prediction': (d) => openPredictionDetailModal(d.classNum, d.studentNum, d.studentName, d.category, d.extraData ?? {}),
    'guide': (d) => renderGuideModal(d.role || 'homeroom'),
    'register': () => openApplicationRegisterModal(),
    'class-summary': (d) => openClassApplicationSummaryModal(d.classNum),
    'application-summary': () => openApplicationSummaryModal(),
    'shared-admission': () => openSharedAdmissionModal(),
    'admission-analysis': () => openAdmissionAnalysisModal(),
    'patch-import': (d) => openPatchImportModal(d.schoolName || '')
};

// ----- 중앙 이벤트 버스 구독 연결 (이벤트 기반 아키텍처) -----
eventBus.on(EVENTS.NAVIGATE, (detail) => {
    if (!detail) return undefined;
    const route = SCREEN_ROUTES[detail.screen];
    if (!route) {
        console.warn('[라우터] 알 수 없는 화면:', detail.screen);
        return undefined;
    }
    patchState({
        currentScreen: detail.screen,
        schoolName: typeof detail.schoolName === 'string' ? detail.schoolName : state.schoolName
    });
    return route(detail);
});

eventBus.on(EVENTS.OPEN_MODAL, (detail) => {
    if (!detail) return undefined;
    const route = MODAL_ROUTES[detail.modal];
    if (!route) {
        console.warn('[라우터] 알 수 없는 모달:', detail.modal);
        return undefined;
    }
    return route(detail);
});

eventBus.on(EVENTS.CLOSE_MODAL, (detail) => {
    if (detail?.id) document.getElementById(detail.id)?.remove();
});

eventBus.on(EVENTS.SHARED_ADMISSION, () => openSharedAdmissionModal());
eventBus.on(EVENTS.ADMISSION_ANALYSIS, () => openAdmissionAnalysisModal());

// 인증·세션: 로그인 사용자와 선택 상태는 중앙 저장소에서만 바꾼다.
eventBus.on(EVENTS.LOGIN_SUCCESS, (detail) => {
    state.currentUser = detail?.user ?? null;
});

eventBus.on(EVENTS.LOGOUT, () => {
    patchState({ currentUser: null, activeClassNum: null, selectedStudent: null });
});

eventBus.on(EVENTS.SCREEN_LOCK, (detail) => {
    ScreenLockManager.lockScreen(detail?.reason || '이벤트');
});

eventBus.on(EVENTS.STUDENT_SELECTED, (detail) => {
    state.selectedStudent = detail || null;
});

// 구버전 localStorage 캐시 잔재 원천 삭제 (새 폴더 설치 시 오염 방지)
try {
    localStorage.removeItem('publicOfficialCutoffData');
} catch (_) {}

// 콘솔 디버깅·구버전 호환용 전역 이름 (화면 코드는 이벤트 버스와 import 를 사용한다)
Object.assign(window, {
    renderAdminScreen,
    renderTeacherScreen,
    openStudentModal,
    openMatrixModal,
    openSharedAdmissionModal,
    openAdmissionAnalysisModal,
    getGeneralGuideCutoff,
    setGeneralGuideCutoff,
    getGeneralGuideBadge
});

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
