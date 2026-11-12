// ===== 대시보드 화면 (app:navigate 'home') =====
// 역할에 따라 학년부장·담임·진로부장 대시보드를 그린다. 나이스 자료·학년도 관리는 기존 'admin' 화면이다.
// 다른 화면·창은 navigate·openModal 로만 요청하고, 원서·학급 자료가 바뀌면 다시 그린다.
import { app } from '../../core/dom.js';
import { state } from '../../core/store.js';
import { eventBus, EVENTS } from '../../core/eventBus.js';
import { navigate, openModal } from '../../core/navigation.js';
import { updateAppWindowTitle } from '../../core/utils.js';
import { ScreenLockManager } from '../../core/screenLock.js';
import { loadHomeData } from './homeData.js';
import { loadingHTML } from './homeWidgets.js';
import { homeroomHomeHTML } from './homeroomHome.js';
import { viewerHomeHTML } from './viewerHome.js';
import { loadMasterData } from './masterData.js';
import { masterHomeHTML } from './masterHome.js';

let subscriptions = [];
let renderToken = 0;

async function classesFor(user) {
    if (user?.Role === 'homeroom') return { classes: [user.ClassNum], classCount: 1 };
    let classCount = 0;
    try {
        classCount = (await window.go.main.App.GetSchoolConfig())?.classCount || 0;
    } catch (_) {}
    return { classes: Array.from({ length: classCount }, (_, i) => i + 1), classCount };
}

function runAction(action, schoolName) {
    const user = state.currentUser;
    const myClass = user?.Role === 'homeroom' ? user.ClassNum : null;
    const actions = {
        'class-list': () => navigate('teacher', { schoolName, classNum: myClass }),
        'class-list-all': () => navigate('teacher', { schoolName, classNum: null }),
        'class-summary': () => openModal('class-summary', { classNum: myClass }),
        'school-summary': () => openModal('application-summary'),
        matrix: () => openModal('matrix', { classNum: myClass }),
        'matrix-all': () => openModal('matrix', { classNum: null }),
        analysis: () => openModal('admission-analysis'),
        register: () => openModal('register'),
        admin: () => navigate('admin', { schoolName }),
        settings: () => navigate('admin', { schoolName }),
        cutoff: () => navigate('cutoff', { schoolName }),
        users: () => navigate('users', { schoolName }),
        patch: () => openModal('patch-import', { schoolName })
    };
    actions[action]?.();
}

function bind(root, schoolName) {
    root.querySelectorAll('[data-home-action]').forEach((btn) => {
        btn.addEventListener('click', () => runAction(btn.dataset.homeAction, schoolName));
    });
    root.querySelectorAll('.home-student-row').forEach((row) => {
        row.addEventListener('click', () => openModal('student', {
            classNum: parseInt(row.dataset.class, 10),
            studentNum: row.dataset.num,
            name: row.dataset.name
        }));
    });
}

export async function renderHomeScreen(schoolName) {
    const user = state.currentUser;
    if (!user) return navigate('login', { schoolName });
    const token = ++renderToken;
    app.className = 'wide-layout';
    app.innerHTML = loadingHTML();
    if (user.Role === 'homeroom') updateAppWindowTitle('homeroom', user.ClassNum);
    else updateAppWindowTitle(user.Role === 'master' ? 'master' : 'viewer');
    ScreenLockManager.resetTimer();

    let html = '';
    if (user.Role === 'master') {
        html = masterHomeHTML(await loadMasterData());
    } else {
        const { classes, classCount } = await classesFor(user);
        const data = await loadHomeData(classes);
        html = user.Role === 'homeroom'
            ? homeroomHomeHTML({ classNum: user.ClassNum, data })
            : viewerHomeHTML({ data, classCount });
    }
    // 그사이 다른 화면으로 옮겼으면 그리지 않는다.
    if (token !== renderToken || state.currentScreen !== 'home') return undefined;
    app.innerHTML = html;
    bind(app, schoolName);

    subscriptions.forEach((off) => off());
    const refresh = () => {
        if (state.currentScreen === 'home') renderHomeScreen(schoolName);
    };
    subscriptions = [
        eventBus.on(EVENTS.APPLICATIONS_CHANGED, refresh),
        eventBus.on(EVENTS.CLASS_UPDATED, refresh)
    ];
    return undefined;
}
