// ===== Wails v3 백엔드 연결 브릿지 =====
// 화면 코드는 `window.go.main.App.메서드()` 형태로 백엔드를 호출한다(기존 코드와의 호환).
// 이 파일은 그 전역 객체를 Wails v3 바인딩 생성기(`wails3 generate bindings`)가 만든
// frontend/bindings/PHGC/app.js 의 함수로 연결한다. 생성 바인딩은 메서드 ID로 호출(Call.ByID)하므로
// Go 메서드 이름이 바뀌면 바인딩을 다시 생성해야 한다(`wails3 build` 가 자동으로 수행).
import { Browser, Application } from '@wailsio/runtime';
import * as AppService from '../../bindings/PHGC/app.js';

// Go App 구조체의 공개 메서드 목록. 없는 이름은 undefined 로 응답해
// `App.메서드?.()` 형태의 기능 확인 코드가 올바르게 동작하도록 한다.
const KNOWN_METHODS = new Set(Object.keys(AppService).filter(name => typeof AppService[name] === 'function'));

// v3는 Go 오류를 Error 객체로 reject 한다. 화면 코드의 `${err}` 표시가
// "RuntimeError: ..." 처럼 바뀌지 않도록 오류 메시지 문자열로 맞춘다.
function normalizeError(err) {
    if (typeof err === 'string') return err;
    if (err && typeof err.message === 'string' && err.message) return err.message;
    try {
        return String(err);
    } catch (_) {
        return '알 수 없는 오류';
    }
}

/** 생성 바인딩 함수를 호출하고 오류를 문자열로 맞춘다. */
export function callBackend(method, ...args) {
    const fn = AppService[method];
    if (typeof fn !== 'function') {
        return Promise.reject(`알 수 없는 백엔드 기능: ${method}`);
    }
    return Promise.resolve(fn(...args)).catch((err) => {
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
            if (!KNOWN_METHODS.has(prop)) return undefined;
            if (!cache.has(prop)) {
                cache.set(prop, (...args) => callBackend(prop, ...args));
            }
            return cache.get(prop);
        },
        has(_target, prop) {
            return typeof prop === 'string' && KNOWN_METHODS.has(prop);
        }
    });
}

/** 현재 백엔드 호출 객체를 반환한다. */
export function getBackend() {
    return window.go.main.App;
}

/** `window.go.main.App` 과 updater.js 등이 예비로 쓰는 `window.runtime` 일부를 준비한다. 여러 번 호출해도 안전하다. */
export function installWailsBridge() {
    if (typeof window === 'undefined') return;
    window.go = window.go || {};
    window.go.main = window.go.main || {};
    if (!window.go.main.App) {
        window.go.main.App = createAppProxy();
    }
    if (!window.runtime) {
        window.runtime = {
            BrowserOpenURL: (url) => Browser.OpenURL(url).catch(() => {}),
            Quit: () => Application.Quit().catch(() => {})
        };
    }
}

installWailsBridge();
