// ===== 화면 전환·모달·데이터 변경 알림 도우미 =====
// 화면 모듈끼리 서로를 직접 import 하지 않고 이벤트 버스로만 연결되도록 하는 얇은 발행 함수 모음.
import { eventBus, EVENTS } from './eventBus.js';

/**
 * 화면(메뉴) 전환 요청. 실제 렌더링은 main.js 의 라우팅 구독자가 수행한다.
 * @param {string} screen 화면 이름 (admin, teacher, login, mode-select, setup, sync, users, cutoff ...)
 * @param {object} params 화면별 매개변수 (schoolName, classNum 등)
 * @returns {Promise<any[]>} 구독자들의 렌더링 완료 시점
 */
export function navigate(screen, params = {}) {
    return Promise.all(eventBus.emit(EVENTS.NAVIGATE, { screen, ...params }));
}

/** 모달 열기 요청 (matrix, student, transcript, application, guide, register ...) */
export function openModal(modal, params = {}) {
    return Promise.all(eventBus.emit(EVENTS.OPEN_MODAL, { modal, ...params }));
}

/** 모달 닫기 요청. id 는 모달 최상위 요소의 id */
export function closeModal(id) {
    eventBus.emit(EVENTS.CLOSE_MODAL, { id });
}

/** 로그인 성공 알림. 세션 저장은 main.js 의 구독자가 중앙 저장소에 반영한다. */
export function notifyLoginSuccess(user) {
    eventBus.emit(EVENTS.LOGIN_SUCCESS, { user });
}

/** 로그아웃 알림 (세션·선택 상태 초기화) */
export function notifyLogout() {
    eventBus.emit(EVENTS.LOGOUT, null);
}

/** 화면 잠금 요청 */
export function requestScreenLock(reason = '') {
    eventBus.emit(EVENTS.SCREEN_LOCK, { reason });
}

/** 상담·조회 대상 학생이 선택되었음을 알린다. */
export function notifyStudentSelected(detail) {
    eventBus.emit(EVENTS.STUDENT_SELECTED, detail);
}

/** 성적·비교과·상담 등 학급 자료가 바뀌었음을 알린다. */
export function notifyClassUpdated(detail = {}) {
    eventBus.emit(EVENTS.CLASS_UPDATED, detail);
}

/** 원서 지원현황이 바뀌었음을 알린다. */
export function notifyApplicationsChanged(detail = {}) {
    eventBus.emit(EVENTS.APPLICATIONS_CHANGED, detail);
}

/** 커트라인·통계가 다시 계산되었음을 알린다. */
export function notifyStatsRecalculated(detail = {}) {
    eventBus.emit(EVENTS.STATS_RECALCULATED, detail);
}
