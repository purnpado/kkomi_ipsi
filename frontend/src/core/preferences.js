// ===== 화면 밝기·글꼴 선택 (이 PC에 저장) =====
// <html data-theme="light|dark" data-font="pretendard|suit"> 로 반영하고, 스타일은 styles/theme-light.css·fonts.css 가 맡는다.
// 학생 자료가 아닌 화면 취향이므로 localStorage 에 둔다. 저장이 막혀 있어도 기본값으로 동작한다.

const THEME_KEY = 'kkomi_theme';
const FONT_KEY = 'kkomi_font';

export const THEME_OPTIONS = [
    { id: 'light', label: '라이트' },
    { id: 'dark', label: '다크' },
    { id: 'system', label: '시스템' }
];

export const FONT_OPTIONS = [
    { id: 'pretendard', label: 'Pretendard' },
    { id: 'suit', label: 'SUIT' }
];

function read(key, fallback, allowed) {
    try {
        const value = localStorage.getItem(key);
        if (allowed.some((option) => option.id === value)) return value;
    } catch (_) {}
    return fallback;
}

function write(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch (_) {}
}

export function getThemeChoice() {
    return read(THEME_KEY, 'light', THEME_OPTIONS);
}

export function getFontChoice() {
    return read(FONT_KEY, 'pretendard', FONT_OPTIONS);
}

function systemPrefersDark() {
    try {
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch (_) {
        return false;
    }
}

/** 지금 실제로 쓰는 밝기(light/dark). '시스템'이면 운영체제 설정을 따른다. */
export function resolvedTheme(choice = getThemeChoice()) {
    if (choice === 'system') return systemPrefersDark() ? 'dark' : 'light';
    return choice;
}

export function applyPreferences() {
    const root = document.documentElement;
    root.dataset.theme = resolvedTheme();
    root.dataset.font = getFontChoice();
}

export function setThemeChoice(choice) {
    write(THEME_KEY, choice);
    applyPreferences();
}

export function setFontChoice(choice) {
    write(FONT_KEY, choice);
    applyPreferences();
}

// 시작하자마자 반영해 로그인 화면부터 같은 밝기·글꼴로 보이게 한다.
applyPreferences();
try {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (getThemeChoice() === 'system') applyPreferences();
    });
} catch (_) {}
