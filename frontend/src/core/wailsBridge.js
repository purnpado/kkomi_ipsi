// ===== Wails 런타임 호환 브릿지 =====
// 화면 코드는 Wails v2 방식의 `window.go.main.App.메서드()` 호출을 그대로 사용한다.
// Wails v3 런타임에는 이 전역 객체가 없으므로, 여기서 v3 바인딩 호출(Call.ByName)로
// 연결되는 동일한 모양의 객체를 만들어 준다. v2 런타임이 이미 주입한 경우에는 건드리지 않는다.
import { Call, Browser, Application } from '@wailsio/runtime';
import * as generatedBindings from '../../wailsjs/go/main/App';

const BINDING_PREFIX = 'main.App.';
// Go App 구조체의 공개 메서드 이름 목록 (wailsjs 생성 파일 기준). 없는 이름은 undefined 로 응답해
// `App.메서드?.()` 형태의 기능 확인 코드가 v2 와 동일하게 동작하도록 한다.
const KNOWN_METHODS = new Set(Object.keys(generatedBindings));

// v2는 Go 오류를 문자열로 reject 했다. 화면 코드의 `${err}` 표시가 달라지지 않도록 문자열로 맞춘다.
function normalizeError(err) {
    if (typeof err === 'string') return err;
    if (err && typeof err.message === 'string' && err.message) return err.message;
    try {
        return String(err);
    } catch (_) {
        return '알 수 없는 오류';
    }
}

function callBinding(method, args) {
    return Call.ByName(BINDING_PREFIX + method, ...args).catch((err) => {
        throw normalizeError(err);
    });
}

function createAppProxy() {
    const cache = new Map();
    return new Proxy({}, {
        get(_target, prop) {
            if (typeof prop !== 'string') return undefined;
            // Promise 판별(then 조회) 등으로 프록시가 thenable 로 오인되지 않게 한다.
            if (prop === 'then' || prop === 'toJSON') return undefined;
            if (KNOWN_METHODS.size > 0 && !KNOWN_METHODS.has(prop)) return undefined;
            if (!cache.has(prop)) {
                cache.set(prop, (...args) => callBinding(prop, args));
            }
            return cache.get(prop);
        },
        has(_target, prop) {
            return typeof prop === 'string' && (KNOWN_METHODS.size === 0 || KNOWN_METHODS.has(prop));
        }
    });
}

/** 현재 런타임에 맞는 백엔드 호출 객체를 반환한다. */
export function getBackend() {
    return window.go.main.App;
}

/** `window.go.main.App` 과 v2 호환 `window.runtime` 일부를 보장한다. 여러 번 호출해도 안전하다. */
export function installWailsBridge() {
    if (typeof window === 'undefined') return;
    const hasV2Bindings = !!(window.go && window.go.main && window.go.main.App);
    if (!hasV2Bindings) {
        window.go = window.go || {};
        window.go.main = window.go.main || {};
        window.go.main.App = createAppProxy();
    }
    if (!window.runtime) {
        // updater.js 등이 예비 경로로 쓰는 v2 런타임 함수 호환
        window.runtime = {
            BrowserOpenURL: (url) => Browser.OpenURL(url).catch(() => {}),
            Quit: () => Application.Quit().catch(() => {})
        };
    }
}

installWailsBridge();
