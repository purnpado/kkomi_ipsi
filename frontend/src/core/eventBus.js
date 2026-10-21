// ===== 꼬미입시 중앙 이벤트 버스 (EventBus) =====
// 컴포넌트 및 모달 간의 직접 결합을 제거하고 느슨한 결합(Loose Coupling)을 구현합니다.

export const EVENTS = {
    // 네비게이션 및 화면 전환
    NAVIGATE: 'app:navigate',

    // 모달 제어
    OPEN_MODAL: 'modal:open',
    CLOSE_MODAL: 'modal:close',
    SHARED_ADMISSION: 'modal:shared-admission',

    // 인증 및 세션
    SCREEN_LOCK: 'auth:screen-lock',
    LOGIN_SUCCESS: 'auth:login-success',
    LOGOUT: 'auth:logout',

    // 데이터 변경 및 통계 갱신
    CLASS_UPDATED: 'data:class-updated',
    APPLICATIONS_CHANGED: 'data:applications-changed',
    STATS_RECALCULATED: 'stats:recalculated'
};

class EventBusImpl {
    constructor() {
        this.listeners = new Map();
    }

    /**
     * 이벤트 구독 (Listener 등록)
     * @param {string} eventName 이벤트 이름 (EVENTS 상수 사용 권장)
     * @param {Function} handler 콜백 함수
     * @returns {Function} 구독 해제 함수 (Unsubscribe)
     */
    on(eventName, handler) {
        if (!this.listeners.has(eventName)) {
            this.listeners.set(eventName, new Set());
        }
        this.listeners.get(eventName).add(handler);

        // 손쉬운 해제를 위한 언마운트 함수 반환
        return () => this.off(eventName, handler);
    }

    /**
     * 이벤트 1회성 구독
     * @param {string} eventName 
     * @param {Function} handler 
     */
    once(eventName, handler) {
        const wrapper = (detail) => {
            this.off(eventName, wrapper);
            handler(detail);
        };
        return this.on(eventName, wrapper);
    }

    /**
     * 이벤트 구독 해제
     * @param {string} eventName 
     * @param {Function} handler 
     */
    off(eventName, handler) {
        const handlers = this.listeners.get(eventName);
        if (handlers) {
            handlers.delete(handler);
            if (handlers.size === 0) {
                this.listeners.delete(eventName);
            }
        }
    }

    /**
     * 이벤트 발행 (모든 구독자에게 디스패치)
     * @param {string} eventName 
     * @param {any} detail 페이로드 데이터
     */
    emit(eventName, detail = null) {
        // 1. 내부 메모리 버스 핸들러 호출
        const handlers = this.listeners.get(eventName);
        if (handlers) {
            handlers.forEach(handler => {
                try {
                    handler(detail);
                } catch (err) {
                    console.error(`[EventBus] Error in handler for event "${eventName}":`, err);
                }
            });
        }

        // 2. 브라우저 네이티브 CustomEvent 동시 발행 (DOM 연동 편의 제공)
        if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
            try {
                window.dispatchEvent(new CustomEvent(eventName, { detail }));
            } catch (_) {}
        }
    }
}

export const eventBus = new EventBusImpl();

// 전역 디버깅 및 브라우저 콘솔 접근 지원
if (typeof window !== 'undefined') {
    window.AppEventBus = eventBus;
    window.APP_EVENTS = EVENTS;
}
