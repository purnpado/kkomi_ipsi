// ===== 꼬미입시 화면 자동 캡처 (개발용) =====
// 서버 모드로 띄운 꼬미입시(run.sh 가 준비)를 시스템 Chrome 으로 열어
// 역할별(학년부장·담임·진로부장) 주요 화면을 라이트·다크로 찍는다. 가상 자료만 쓴다.
// 사용: node capture.js --url http://localhost:34851/ --out <폴더> [--scenario all|master|homeroom|viewer] [--themes light,dark]
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { clickMenu, closeModals, login, logout, prepareAccounts, setLook, settle, shot, wait } from './lib/session.js';

function arg(name, fallback) {
    const i = process.argv.indexOf(`--${name}`);
    return i > 0 ? process.argv[i + 1] : fallback;
}

const URL = arg('url', 'http://localhost:34851/');
const OUT = arg('out', path.resolve('capture-out'));
const SCENARIO = arg('scenario', 'all');
const THEMES = arg('themes', 'light,dark').split(',');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const shots = [];
const problems = [];

async function each(page, name, fn) {
    for (const theme of THEMES) {
        await setLook(page, theme);
        try {
            await fn(theme);
            shots.push(await shot(page, OUT, `${name}-${theme}`));
        } catch (err) {
            problems.push(`${name}-${theme}: ${err.message}`);
        }
    }
}

async function openStudentBySearch(page) {
    await page.click('#shellSearchInput', { clickCount: 3 });
    await page.keyboard.press('Backspace');
    await page.keyboard.type('1-1');
    await wait(2500);
    await page.keyboard.press('Enter');
    await wait(2500);
}

async function masterScenario(page, accounts) {
    await login(page, URL, 'admin', accounts.firstTime);
    await each(page, '01-학년부장-대시보드', () => clickMenu(page, 'dash'));
    await each(page, '02-학년부장-나이스자료관리', () => clickMenu(page, 'admin'));
    await each(page, '03-학년부장-학급목록', () => clickMenu(page, 'classes'));
    await each(page, '04-학년부장-명렬표-1반', async () => {
        await clickMenu(page, 'classes');
        await page.click('.class-card-btn[data-class="1"]');
        await wait(800);
        await settle(page, 1200);
    });
    await each(page, '05-학년부장-커트라인', () => clickMenu(page, 'cutoff'));
    await each(page, '06-학년부장-계정', () => clickMenu(page, 'users'));
    await each(page, '07-학년부장-상담화면', async () => {
        await clickMenu(page, 'dash');
        await openStudentBySearch(page);
        const docked = await page.$('#panelScreenMount #studentDetailModal');
        if (!docked) throw new Error('상담 화면이 열리지 않았습니다');
    });
    // 메뉴에서 화면으로 여는 기능(원래 창)
    const panels = [['08', '매트릭스', 'matrix'], ['09', '입시분석', 'analysis'], ['10', '지원현황', 'app-summary'], ['10b', '원서대장', 'register'], ['10c', '관내공유', 'shared']];
    for (const [no, label, item] of panels) {
        await each(page, `${no}-학년부장-${label}`, async () => {
            await clickMenu(page, item);
            await wait(2000);
            const docked = await page.$('#panelScreenMount .docked-panel');
            if (!docked) throw new Error('화면 안에 띄워지지 않았습니다');
        });
    }
    await logout(page);
}

async function homeroomScenario(page, accounts) {
    const homeroom = accounts.users.find((u) => u.role === 'homeroom' && u.classNum === 2) || accounts.users.find((u) => u.role === 'homeroom');
    if (!homeroom) return problems.push('담임 계정이 없습니다');
    await login(page, URL, homeroom.username, accounts.firstTime);
    await each(page, '11-담임-대시보드', () => clickMenu(page, 'dash'));
    await each(page, '12-담임-명렬표', async () => {
        await clickMenu(page, 'classes');
        await settle(page, 1200);
    });
    await logout(page);
}

async function viewerScenario(page, accounts) {
    const viewer = accounts.users.find((u) => u.role === 'viewer');
    if (!viewer) return problems.push('진로부장 계정이 없습니다');
    await login(page, URL, viewer.username, accounts.firstTime);
    await each(page, '21-진로부장-대시보드', () => clickMenu(page, 'dash'));
    await each(page, '22-진로부장-학급둘러보기', () => clickMenu(page, 'classes'));
    await logout(page);
}

async function main() {
    fs.mkdirSync(OUT, { recursive: true });
    const browser = await puppeteer.launch({
        executablePath: CHROME,
        headless: true,
        defaultViewport: { width: 1366, height: 768, deviceScaleFactor: 1 },
        args: ['--lang=ko-KR', '--no-first-run', '--no-default-browser-check']
    });
    const page = await browser.newPage();
    const consoleErrors = [];
    page.on('pageerror', (err) => consoleErrors.push(String(err)));
    page.on('console', (msg) => {
        if (msg.type() === 'error' && !msg.text().includes('WebSocket')) consoleErrors.push(msg.text());
    });
    page.on('dialog', (d) => d.dismiss());
    try {
        const users = await prepareAccounts(page, URL);
        const accounts = { users, firstTime: new Set() };
        if (SCENARIO === 'all' || SCENARIO === 'master') await masterScenario(page, accounts);
        if (SCENARIO === 'all' || SCENARIO === 'homeroom') await homeroomScenario(page, accounts);
        if (SCENARIO === 'all' || SCENARIO === 'viewer') await viewerScenario(page, accounts);
    } finally {
        await browser.close();
    }
    const report = [
        `# 화면 캡처 결과 (${new Date().toLocaleString('ko-KR')})`,
        '', `찍은 화면 ${shots.length}장`, ...shots.map((f) => `- ${path.basename(f)}`),
        '', `문제 ${problems.length}건`, ...problems.map((p) => `- ${p}`),
        '', `콘솔 오류 ${consoleErrors.length}건`, ...[...new Set(consoleErrors)].slice(0, 30).map((e) => `- ${e}`)
    ].join('\n');
    fs.writeFileSync(path.join(OUT, '결과.md'), report);
    console.log(report);
    process.exit(problems.length ? 2 : 0);
}

main().catch((err) => {
    console.error('캡처 실패:', err);
    process.exit(1);
});
