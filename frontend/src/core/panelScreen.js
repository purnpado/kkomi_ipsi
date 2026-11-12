// ===== 창(모달)을 화면 안에 띄우기 =====
// 입시 분석·매트릭스·지원현황·원서대장·관내 공유는 원래 body 위에 겹치는 창이다.
// 메뉴에서 열 때는 같은 창을 그대로 만들되, 만들어진 창 요소를 #app 안으로 옮겨 "화면"처럼 보이게 한다.
// 창 모듈은 고치지 않는다(다른 화면의 버튼에서 열면 지금처럼 창으로 뜬다). 이 파일은 창 모듈을 import 하지 않고
// main.js 라우팅 표가 열기 함수를 넘겨준다.
import { app } from './dom.js';
import { state } from './store.js';
import { navigate } from './navigation.js';

let active = null; // { elementId, screen, observer, onKey }
let backRoute = null; // 화면을 닫으면 돌아갈 곳 { screen, classNum }

function release() {
    if (!active) return;
    active.observer?.disconnect();
    window.removeEventListener('keydown', active.onKey, true);
    active = null;
}

/** 화면에 붙은 창이 아닌, 그 위에 새로 뜬 창(확인 상자·학생 상담 등)이 있는지 */
function hasFloatingDialog(docked) {
    return [...document.body.children].some((el) => el !== docked && el.matches?.('.fixed.inset-0') && el.id !== 'screenLockOverlay');
}

function dock(el, mount) {
    mount.appendChild(el);
    el.classList.add('docked-panel');
    // 창 바깥(빈 곳)을 누르면 닫히는 동작을 화면에서는 막는다.
    el.addEventListener('click', (event) => {
        if (event.target === el) event.stopImmediatePropagation();
    }, true);
}

/** 화면에서는 [닫기]가 들어오기 전 화면으로 돌아가므로 글자를 "돌아가기"로 바꾼다(아이콘만 있는 버튼은 그대로). */
function relabelCloseButtons(el) {
    el.querySelectorAll('button[id*="lose"]').forEach((button) => {
        const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
        let node = walker.nextNode();
        while (node) {
            // 화면에서는 Esc 로 닫히지 않으므로 "(ESC)" 안내도 뺀다.
            node.textContent = node.textContent.replace(/(창|상담 모달|모달)?\s*닫기/u, '돌아가기').replace(/\s*\(ESC\)/iu, '');
            node = walker.nextNode();
        }
        button.title = '들어오기 전 화면으로 돌아갑니다';
    });
}

/**
 * @param {{ screen: string, elementId: string, open: () => any, title: string }} options
 */
export async function renderPanelScreen({ screen, elementId, open, title }) {
    release();
    app.className = 'wide-layout';
    app.innerHTML = `<div id="panelScreenMount" class="panel-screen" aria-label="${title}"></div>`;
    const mount = document.getElementById('panelScreenMount');

    // 창 모듈이 body 에 붙이는 순간 바로 화면으로 옮겨, 겹친 창이 잠깐이라도 보이지 않게 한다.
    const catcher = new MutationObserver((records) => {
        records.forEach((r) => r.addedNodes.forEach((node) => {
            if (node.id === elementId) dock(node, mount);
        }));
    });
    catcher.observe(document.body, { childList: true });
    try {
        await open();
    } finally {
        catcher.disconnect();
    }
    const el = document.getElementById(elementId);
    if (!el || state.currentScreen !== screen) return;
    if (el.parentElement !== mount) dock(el, mount);
    relabelCloseButtons(el);

    // 창의 [닫기]를 누르면(요소가 사라지면) 대시보드로 돌아간다.
    // 단, 위에 뜬 창을 Esc 로 닫을 때 창 모듈의 Esc 처리가 화면까지 지웠다면 되돌려 놓는다.
    let floatingEscAt = 0;
    const observer = new MutationObserver(() => {
        if (mount.contains(el) || state.currentScreen !== screen || !document.body.contains(mount)) return;
        if (Date.now() - floatingEscAt < 500) {
            mount.appendChild(el);
            return;
        }
        release();
        const back = backRoute && backRoute.screen !== screen ? backRoute : { screen: 'home' };
        navigate(back.screen, { schoolName: state.schoolName, classNum: back.classNum ?? null });
    });
    observer.observe(mount, { childList: true });

    // Esc 는 화면 위에 다른 창이 떠 있을 때만 그 창에 넘기고, 화면 자체는 닫지 않는다.
    const onKey = (event) => {
        if (event.key !== 'Escape' || !document.body.contains(mount)) return;
        if (hasFloatingDialog(el)) floatingEscAt = Date.now();
        else event.stopImmediatePropagation();
    };
    window.addEventListener('keydown', onKey, true);
    active = { elementId, screen, observer, onKey };
}

/**
 * 다른 화면으로 옮길 때 정리하고, 창-화면을 닫으면 돌아갈 곳을 기억한다(main.js 라우터가 부른다).
 * @param {string} nextScreen 옮겨 갈 화면
 * @param {Set<string>} panelScreens 창-화면 이름들
 */
export function leavePanelScreen(nextScreen, panelScreens) {
    if (active && active.screen !== nextScreen) release();
    const current = state.currentScreen;
    if (panelScreens.has(nextScreen) && current && current !== nextScreen && !panelScreens.has(current)) {
        backRoute = { screen: current, classNum: current === 'teacher' ? state.activeClassNum : null };
    } else if (!panelScreens.has(nextScreen)) {
        backRoute = null;
    }
}
