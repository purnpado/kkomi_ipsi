// ===== 공통 틀: 위쪽 막대 + 역할별 왼쪽 메뉴 =====
// 로그인 뒤 화면(admin·teacher·users·cutoff)에서만 보이고, 화면 내용은 그대로 #app 에 그려진다.
// 메뉴는 navigate·openModal 발행 함수로만 화면을 요청한다(화면 모듈을 직접 부르지 않음).
import logoUniversal from '../assets/images/logo-universal.png';
import { navigate, openModal, notifyLogout, requestScreenLock } from './navigation.js';
import { eventBus, EVENTS } from './eventBus.js';
import { state } from './store.js';
import { escapeAttr, escapeHtml, updateAppWindowTitle } from './utils.js';
import { ScreenLockManager } from './screenLock.js';
import { openFeedbackPage } from './updater.js';
import { admissionLongLabel, resolveAdmissionYear } from './admissionYear.js';
import { buildShellMenu, ROLE_LABELS, SHELL_SCREENS } from './shellMenu.js';
import { bindShellSearch, resetShellSearch } from './shellSearch.js';
import { FONT_OPTIONS, THEME_OPTIONS, getFontChoice, getThemeChoice, setFontChoice, setThemeChoice } from './preferences.js';

const GROUP_ICONS = {
    dash: '<path d="M3 12l9-8 9 8"/><path d="M5 10v10h14V10"/>',
    students: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 010 7"/><path d="M18 14.8c1.8.7 3 2.4 3.5 5.2"/>',
    apps: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>',
    analysis: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    basis: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
    exchange: '<path d="M7 7h12l-3-3M17 17H5l3 3"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M4.2 6l2.2 2M17.6 16l2.2 2M2.5 12h3M18.5 12h3M4.2 18l2.2-2M17.6 8l2.2-2"/>'
};

const icon = (paths, size = 18) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

let shellInfo = { schoolName: '', admissionYear: 0, version: '' };
let activeItemId = '';

const topEl = () => document.getElementById('shellTop');
const navEl = () => document.getElementById('shellNav');

function menuItems() {
    return buildShellMenu(state.currentUser).flatMap((group) => group.items.map((item) => ({ ...item, group: group.id })));
}

async function loadShellInfo() {
    try {
        const config = await window.go.main.App.GetSchoolConfig();
        shellInfo.schoolName = config?.schoolName || state.schoolName || '';
        shellInfo.admissionYear = resolveAdmissionYear(config);
    } catch (_) {
        shellInfo.schoolName = state.schoolName || '';
    }
    try {
        shellInfo.version = await window.go.main.App.GetAppVersion();
    } catch (_) {}
}

function userLabel() {
    const user = state.currentUser;
    if (!user) return '';
    if (user.Role === 'homeroom') return `3학년 ${user.ClassNum}반 담임`;
    return ROLE_LABELS[user.Role] || '';
}

function optionButtons(options, current, kind) {
    return options.map((option) => `
        <button type="button" class="shell-seg-btn ${option.id === current ? 'is-on' : ''}" data-${kind}="${option.id}" aria-pressed="${option.id === current}">${option.label}</button>
    `).join('');
}

function renderTop() {
    const top = topEl();
    if (!top) return;
    const yearText = shellInfo.admissionYear ? admissionLongLabel(shellInfo.admissionYear) : '';
    top.innerHTML = `
        <div class="shell-brand">
            <img src="${logoUniversal}" alt="" class="shell-logo" />
            <div class="shell-brand-text">
                <strong>꼬미입시</strong>
                <span>${escapeHtml(shellInfo.schoolName)}${yearText ? ` · ${escapeHtml(yearText)}` : ''}</span>
            </div>
        </div>
        <span class="shell-role-chip">${escapeHtml(userLabel())}</span>
        <div class="shell-search" id="shellSearchBox">
            <label class="shell-search-field">
                ${icon('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>', 16)}
                <span class="sr-only">학생 검색</span>
                <input id="shellSearchInput" type="search" autocomplete="off" placeholder="학생 이름·번호로 상담 열기" />
            </label>
            <div id="shellSearchResults" class="shell-search-results hidden" role="listbox"></div>
        </div>
        <div class="shell-actions">
            <div class="shell-view-menu">
                <button type="button" id="shellViewBtn" class="shell-btn" aria-expanded="false" title="화면 밝기와 글꼴">
                    ${icon('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>', 16)}
                    <span>화면</span>
                </button>
                <div id="shellViewPanel" class="shell-view-panel hidden">
                    <div class="shell-view-row"><span>밝기</span><div class="shell-seg">${optionButtons(THEME_OPTIONS, getThemeChoice(), 'theme')}</div></div>
                    <div class="shell-view-row"><span>글꼴</span><div class="shell-seg">${optionButtons(FONT_OPTIONS, getFontChoice(), 'font')}</div></div>
                </div>
            </div>
            <button type="button" id="shellLockBtn" class="shell-btn" title="자리를 비울 때 화면 잠금 (Ctrl+L)">
                ${icon('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>', 16)}<span>잠금</span>
            </button>
            <button type="button" id="shellLogoutBtn" class="shell-btn shell-btn-danger">
                ${icon('<path d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3"/><path d="M10 17l-5-5 5-5M5 12h11"/>', 16)}<span>로그아웃</span>
            </button>
        </div>
    `;
    bindTop();
}

function renderNav() {
    const nav = navEl();
    if (!nav) return;
    const groups = buildShellMenu(state.currentUser);
    nav.innerHTML = `
        <div class="shell-nav-groups">
            ${groups.map((group) => `
                <div class="shell-nav-group">
                    <div class="shell-nav-title">${icon(GROUP_ICONS[group.id] || GROUP_ICONS.dash, 16)}<span>${escapeHtml(group.label)}</span></div>
                    ${group.items.map((item) => `
                        <button type="button" class="shell-nav-item ${item.id === activeItemId ? 'is-active' : ''}" data-item="${escapeAttr(item.id)}" ${item.id === activeItemId ? 'aria-current="page"' : ''}>
                            <span class="shell-nav-label">${escapeHtml(item.label)}</span>
                            ${item.hint ? `<span class="shell-nav-hint">${escapeHtml(item.hint)}</span>` : ''}
                            ${item.modal ? '<span class="shell-nav-badge">창</span>' : ''}
                        </button>
                    `).join('')}
                </div>
            `).join('')}
        </div>
        <div class="shell-nav-foot">
            <button type="button" id="shellGuideBtn" class="shell-nav-item">${icon('<path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z"/><path d="M4 19V5"/>', 16)}<span class="shell-nav-label">사용 설명서</span></button>
            <button type="button" id="shellFeedbackBtn" class="shell-nav-item">${icon('<path d="M4 5h16v11H8l-4 4z"/>', 16)}<span class="shell-nav-label">질문·피드백 (GitHub)</span></button>
            <span class="shell-version">${shellInfo.version ? `v${escapeHtml(shellInfo.version)}` : ''}</span>
        </div>
    `;
    nav.querySelectorAll('[data-item]').forEach((btn) => {
        btn.addEventListener('click', () => runItem(btn.dataset.item));
    });
    nav.querySelector('#shellGuideBtn')?.addEventListener('click', () => openModal('guide', { role: state.currentUser?.Role || 'homeroom' }));
    nav.querySelector('#shellFeedbackBtn')?.addEventListener('click', () => openFeedbackPage());
}

function runItem(itemId) {
    const item = menuItems().find((entry) => entry.id === itemId);
    if (!item) return;
    const params = { schoolName: state.schoolName, ...(item.params || {}) };
    if (item.screen) {
        activeItemId = item.id;
        navigate(item.screen, params);
        return;
    }
    if (item.modal === 'judgment-settings') {
        // 판정 기준을 저장하면 보고 있던 화면을 다시 그려 새 기준으로 판정한다.
        params.onSaved = () => navigate(state.currentScreen, { schoolName: state.schoolName, classNum: state.activeClassNum ?? null });
    }
    openModal(item.modal, params);
}

async function logout() {
    ScreenLockManager.clearTimer();
    await window.go.main.App.Logout?.().catch(() => { });
    const schoolName = state.schoolName;
    notifyLogout();
    updateAppWindowTitle();
    navigate('login', { schoolName });
}

function bindTop() {
    document.getElementById('shellLockBtn')?.addEventListener('click', () => requestScreenLock('수동 잠금'));
    document.getElementById('shellLogoutBtn')?.addEventListener('click', logout);

    const viewBtn = document.getElementById('shellViewBtn');
    const panel = document.getElementById('shellViewPanel');
    viewBtn?.addEventListener('click', (event) => {
        event.stopPropagation();
        const open = panel.classList.toggle('hidden') === false;
        viewBtn.setAttribute('aria-expanded', String(open));
    });
    panel?.addEventListener('click', (event) => {
        event.stopPropagation();
        const button = event.target.closest('button');
        if (!button) return;
        if (button.dataset.theme) setThemeChoice(button.dataset.theme);
        if (button.dataset.font) setFontChoice(button.dataset.font);
        panel.querySelectorAll('[data-theme]').forEach((b) => b.classList.toggle('is-on', b.dataset.theme === getThemeChoice()));
        panel.querySelectorAll('[data-font]').forEach((b) => b.classList.toggle('is-on', b.dataset.font === getFontChoice()));
    });
    bindShellSearch();
}

document.addEventListener('click', () => {
    document.getElementById('shellViewPanel')?.classList.add('hidden');
    document.getElementById('shellViewBtn')?.setAttribute('aria-expanded', 'false');
});

function pickActiveItem(screen, classNum) {
    const items = menuItems().filter((item) => item.screen === screen);
    if (items.length === 0) return;
    if (items.some((item) => item.id === activeItemId)) return;
    const exact = items.find((item) => (item.params?.classNum ?? null) === (classNum ?? null));
    activeItemId = (exact || items[0]).id;
}

/** 화면 전환 뒤 공통 틀을 보이거나 감춘다. main.js 의 라우터가 부른다. */
export async function updateShell(detail = {}) {
    const show = Boolean(state.currentUser) && SHELL_SCREENS.has(detail.screen);
    document.body.classList.toggle('shell-on', show);
    const top = topEl();
    const nav = navEl();
    if (!show) {
        if (top) { top.hidden = true; top.innerHTML = ''; }
        if (nav) { nav.hidden = true; nav.innerHTML = ''; }
        activeItemId = '';
        resetShellSearch();
        return;
    }
    pickActiveItem(detail.screen, detail.classNum);
    // 고입 연도·버전 표시는 화면을 옮길 때마다 다시 읽는다(설정 변경 반영, 호출 두 번뿐).
    await loadShellInfo();
    const searchText = document.getElementById('shellSearchInput')?.value || '';
    renderTop();
    if (searchText) document.getElementById('shellSearchInput').value = searchText;
    renderNav();
    if (top) top.hidden = false;
    if (nav) nav.hidden = false;
}

// 학생 자료가 바뀌면 검색용 명단을 다시 읽는다.
eventBus.on(EVENTS.CLASS_UPDATED, () => {
    resetShellSearch();
});
eventBus.on(EVENTS.LOGOUT, () => resetShellSearch());
