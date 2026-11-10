// ===== 꼬미입시 중앙 상태 저장소 (Store) =====
// 과거 window.* 전역 변수로 흩어져 있던 세션·화면 상태를 한곳에서 관리한다.
// state 는 Proxy 이므로 `state.currentUser = user` 처럼 대입하면 구독자에게 변경이 통지된다.

const data = {
    // 현재 로그인한 사용자 세션 (Role, ClassNum, Username 등)
    currentUser: null,
    // 현재 화면 이름과 학교명 (app:navigate 로 갱신)
    currentScreen: '',
    schoolName: '',
    // 담임·진로 화면에서 보고 있는 학급과 선택한 학생
    activeClassNum: null,
    selectedStudent: null,
    // 후기 일반고 안정권 기준 석차백분율(%)
    generalGuideCutoff: null,
    // 고교별 산출 규칙 목록 캐시
    allSchoolRules: null
};

const subscribers = new Map();

function notify(key, value, previous) {
    const handlers = subscribers.get(key);
    if (!handlers) return;
    handlers.forEach((handler) => {
        try {
            handler(value, previous);
        } catch (err) {
            console.error(`[Store] "${key}" 구독자 처리 오류:`, err);
        }
    });
}

export const state = new Proxy(data, {
    set(target, key, value) {
        const previous = target[key];
        target[key] = value;
        if (previous !== value) notify(key, value, previous);
        return true;
    }
});

/**
 * 상태 항목 변경 구독
 * @param {string} key 상태 항목 이름
 * @param {Function} handler (value, previous) => void
 * @returns {Function} 구독 해제 함수
 */
export function subscribe(key, handler) {
    if (!subscribers.has(key)) subscribers.set(key, new Set());
    subscribers.get(key).add(handler);
    return () => subscribers.get(key)?.delete(handler);
}

/** 여러 항목을 한 번에 갱신 */
export function patchState(partial) {
    Object.keys(partial || {}).forEach((key) => {
        state[key] = partial[key];
    });
}

// 과거 전역 변수 이름과의 호환: 인라인 핸들러나 콘솔 디버깅에서 쓰던 이름을 저장소에 연결한다.
const LEGACY_GLOBALS = {
    currentUser: 'currentUser',
    generalGuideCutoff: 'generalGuideCutoff',
    _allSchoolRules: 'allSchoolRules'
};

if (typeof window !== 'undefined') {
    Object.entries(LEGACY_GLOBALS).forEach(([globalName, key]) => {
        try {
            Object.defineProperty(window, globalName, {
                configurable: true,
                get: () => state[key],
                set: (value) => { state[key] = value; }
            });
        } catch (_) {}
    });
    window.AppStore = { state, subscribe, patchState };
}
