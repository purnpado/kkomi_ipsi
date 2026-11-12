// 캡처용 브라우저 조작 도우미: 로그인·화면 이동·밝기 바꾸기·찍기
// 가상 시뮬레이션 계정만 쓴다(학년부장 sim-admin-1, 공용 데이터 암호 sim-shared-1).
import path from 'node:path';

export const ADMIN_PW = 'sim-admin-1';
export const SHARED_PW = 'sim-shared-1';
const TEMP_PW = 'capture-temp-1';
const FINAL_PW = 'capture-final-1';

export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 대시보드처럼 자료를 읽는 화면이 다 그려질 때까지 기다린다(불러오는 중 표시가 사라질 때까지). */
export async function settle(page, ms = 600) {
    await page.waitForFunction(() => !document.querySelector('#app .spinner'), { timeout: 30000 }).catch(() => {});
    await page.evaluate(() => document.fonts?.ready).catch(() => {});
    await wait(ms);
}

export async function open(page, url) {
    await page.goto(url, { waitUntil: 'networkidle0' });
    await page.waitForSelector('select, #app input[type=password]', { timeout: 20000 });
}

/** 담임·진로부장 계정은 학년부장 권한으로 임시 비밀번호를 정해 둔다(가상 자료 사본에서만). */
export async function prepareAccounts(page, url) {
    await open(page, url);
    const users = await page.evaluate(async (adminPw, tempPw) => {
        const A = window.go.main.App;
        await A.UnlockAndLogin('admin', adminPw);
        const list = await A.GetUsers();
        for (const u of list) {
            if (u.Role !== 'master') await A.SetUserPassword(u.Username, tempPw);
        }
        await A.Logout();
        return list.map((u) => ({ username: u.Username, role: u.Role, classNum: u.ClassNum }));
    }, ADMIN_PW, TEMP_PW);
    return users;
}

/** 로그인 화면에서 계정을 골라 들어간다. 처음 로그인이면 비밀번호 변경 화면을 거친다. */
export async function login(page, url, username, firstTime = new Set()) {
    await open(page, url);
    await page.evaluate((name) => {
        const sel = document.querySelector('select');
        sel.value = name;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
    }, username);
    await wait(300);
    const isAdmin = username === 'admin';
    const password = isAdmin ? ADMIN_PW : (firstTime.has(username) ? FINAL_PW : TEMP_PW);
    await page.evaluate((pw, shared) => {
        const inputs = [...document.querySelectorAll('#app input[type=password]')];
        inputs[0].value = pw;
        if (inputs[1]) inputs[1].value = shared;
        document.querySelector('#app button[type=submit]').click();
    }, password, SHARED_PW);
    await wait(1500);
    const mustChange = await page.$('#newPassword');
    if (mustChange) {
        await page.evaluate((pw) => {
            document.getElementById('newPassword').value = pw;
            document.getElementById('newPasswordConfirm').value = pw;
            document.getElementById('pwChangeForm').requestSubmit();
        }, FINAL_PW);
        firstTime.add(username);
        await wait(1500);
    }
    await page.waitForSelector('#shellNav:not([hidden])', { timeout: 30000 });
    await settle(page);
}

export async function logout(page) {
    await page.evaluate(() => document.getElementById('shellLogoutBtn')?.click());
    await wait(800);
}

/** 화면 밝기·글꼴. 앱과 같은 저장 키를 써서 다시 그려도 유지된다. */
export async function setLook(page, theme, font = 'pretendard') {
    await page.evaluate((t, f) => {
        localStorage.setItem('kkomi_theme', t);
        localStorage.setItem('kkomi_font', f);
        document.documentElement.dataset.theme = t;
        document.documentElement.dataset.font = f;
    }, theme, font);
    await wait(250);
}

export async function clickMenu(page, itemId) {
    const ok = await page.evaluate((id) => {
        const btn = document.querySelector(`#shellNav [data-item="${id}"]`);
        if (!btn) return false;
        btn.click();
        return true;
    }, itemId);
    if (!ok) throw new Error(`메뉴 항목이 없습니다: ${itemId}`);
    await wait(500);
    await settle(page);
}

export async function closeModals(page) {
    await page.keyboard.press('Escape');
    await wait(400);
    await page.evaluate(() => {
        document.querySelectorAll('body > .fixed.inset-0').forEach((el) => {
            if (el.id !== 'screenLockOverlay') el.remove();
        });
    });
}

/** 화면을 찍는다. 창이 열려 있으면 창 안쪽 스크롤 영역 전체가 아니라 보이는 화면만 찍는다. */
// 긴 화면(커트라인 표 등)은 앞부분만 찍는다. 왼쪽 메뉴처럼 고정된 부분도 함께 늘어나도록
// 찍기 전에 창 높이를 화면 길이에 맞췄다가 되돌린다.
const MAX_HEIGHT = 2200;
export async function shot(page, outDir, name, { fullPage = true } = {}) {
    const file = path.join(outDir, `${name}.png`);
    const base = page.viewport();
    if (fullPage) {
        const height = await page.evaluate(() => document.documentElement.scrollHeight);
        await page.setViewport({ ...base, height: Math.min(Math.max(height, base.height), MAX_HEIGHT) });
        await wait(300);
    }
    await page.screenshot({ path: file });
    if (fullPage) await page.setViewport(base);
    return file;
}
