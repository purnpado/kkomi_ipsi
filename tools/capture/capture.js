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

async function openStudentBySearch(page, query = '1-1') {
    await page.click('#shellSearchInput', { clickCount: 3 });
    await page.keyboard.press('Backspace');
    await page.keyboard.type(query);
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
    for (const theme of THEMES) {
        await setLook(page, theme);
        try {
            await page.evaluate(() => document.getElementById('shellGuideBtn')?.click());
            await wait(800);
            shots.push(await shot(page, OUT, `07b-학년부장-사용설명서-${theme}`, { fullPage: false }));
            await closeModals(page);
        } catch (err) {
            problems.push(`사용 설명서-${theme}: ${err.message}`);
        }
    }
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
    // 화면 높이 그대로 찍어야 확인되는 것: 매트릭스를 아래로 내렸을 때 학교명 줄 고정, 공식 경쟁률 창
    const viewportShots = [
        ['08b-학년부장-매트릭스-아래로', async () => {
            await clickMenu(page, 'matrix');
            await wait(2000);
            await page.evaluate(() => { const el = document.querySelector('#panelScreenMount .matrix-scroll'); if (el) el.scrollTop = 1200; });
            await wait(400);
            const stuck = await page.evaluate(() => {
                const el = document.querySelector('#panelScreenMount .matrix-scroll');
                const th = el?.querySelector('thead th');
                return el && th ? Math.abs(th.getBoundingClientRect().top - el.getBoundingClientRect().top) < 4 : false;
            });
            if (!stuck) throw new Error('매트릭스 학교명 줄이 고정되지 않았습니다');
        }],
        ['07c-학년부장-상담-관리칸', async () => {
            await clickMenu(page, 'dash');
            await openStudentBySearch(page);
            await page.waitForSelector('#statExclusionMount details', { timeout: 10000 });
            await page.evaluate(() => {
                const d = document.querySelector('#statExclusionMount details');
                d.open = true;
                d.scrollIntoView({ block: 'center' });
            });
            // 체크해 저장되는지 확인(가상 자료 사본이라 바꿔도 된다). 두 번째 테마에서는 이미 체크돼 있다.
            const checked = await page.$eval('#statExclusionCheck', (c) => c.checked);
            if (!checked) {
                await page.click('#statExclusionCheck');
                await page.waitForFunction(() => /뺐습니다/.test(document.querySelector('#statExclusionStatus')?.textContent || ''), { timeout: 10000 });
            }
            await wait(300);
        }],
        ['07d-학년부장-원서입력창-나이스', async () => {
            // 가상 자료에서 특성화고 원서가 있는 학생(2반 9번): 상담 화면 특성화고 줄의 [희망입력] → 원서 입력 창 대조표
            await clickMenu(page, 'dash');
            await openStudentBySearch(page, '2-9');
            await page.evaluate(() => [...document.querySelectorAll('.btn-direct-apply')].find((b) => b.dataset.cat === 'special')?.click());
            await page.waitForSelector('#appNicePreview .nice-form', { timeout: 15000 })
                .catch(() => { throw new Error('원서 입력 창에 나이스 대조표가 없습니다'); });
            await page.evaluate(() => document.querySelector('#appNicePreview').scrollIntoView({ block: 'center' }));
            await wait(400);
        }],
        ['07e-학년부장-상담-학교별판정-펼침', async () => {
            await clickMenu(page, 'dash');
            await openStudentBySearch(page, '2-9');
            await page.evaluate(() => document.querySelector('.counsel-nav-btn[data-target="counselSecSchools"]')?.click());
            await wait(800);
            await page.evaluate(() => document.querySelector('#schoolCardsContainer .school-counsel-card summary')?.click());
            await wait(400);
        }],
        ['06b-학년부장-판정기준-통계제외목록', async () => {
            await clickMenu(page, 'judgment');
            await page.waitForSelector('#statExclusionList', { timeout: 10000 });
            await page.evaluate(() => {
                const d = document.querySelector('#statExclusionList');
                d.open = true;
                d.scrollIntoView({ block: 'center' });
            });
            await page.waitForFunction(() => /1명/.test(document.querySelector('#statExclusionListBody')?.textContent || ''), { timeout: 10000 })
                .catch(() => { throw new Error('상담 화면에서 체크한 학생이 확인 목록에 나오지 않습니다'); });
        }],
        ['04b-학년부장-특성화고-나이스대조', async () => {
            await clickMenu(page, 'classes');
            await page.click('.class-card-btn[data-class="1"]');
            await settle(page, 1200);
            await page.click('.btn-prediction-detail[data-category="special"]');
            await page.waitForSelector('#predictionDetailModal .prediction-score-item', { timeout: 15000 });
            await page.click('#predictionDetailModal .prediction-score-item');
            await page.waitForSelector('#schoolScoreDetailModal .nice-form', { timeout: 15000 })
                .catch(() => { throw new Error('특성화고 산출 상세 창에 나이스 대조표가 없습니다'); });
            await wait(500);
        }],
        ['10g-학년부장-관내공유-자료검증', async () => {
            await clickMenu(page, 'shared');
            await page.waitForSelector('#sharedVerifyMount .vs-table, #sharedVerifyMount .vs-guide', { timeout: 30000 });
            await page.waitForFunction(() => !/점검하는 중/.test(document.querySelector('#sharedVerifyMount')?.textContent || ''), { timeout: 30000 });
            await page.evaluate(() => document.querySelector('#sharedVerifyMount [data-pkg-open]')?.click());
            await wait(500);
            await page.evaluate(() => document.querySelector('#sharedVerifyMount').scrollIntoView({ block: 'start' }));
            await wait(400);
        }],
        ['05b-학년부장-공식경쟁률', async () => {
            await clickMenu(page, 'cutoff');
            await page.click('#openCompetitionBtn');
            await wait(1200);
        }]
    ];
    for (const [name, fn] of viewportShots) {
        for (const theme of THEMES) {
            await setLook(page, theme);
            try {
                await fn();
                shots.push(await shot(page, OUT, `${name}-${theme}`, { fullPage: false }));
            } catch (err) {
                problems.push(`${name}-${theme}: ${err.message}`);
            }
            await closeModals(page);
        }
    }
    for (const [tab, label] of [['students', '학생별'], ['school', '학교별결과'], ['general', '일반고결과']]) {
        await each(page, `10d-학년부장-원서관리-${label}`, async () => {
            await clickMenu(page, 'applications');
            await page.evaluate((t) => document.querySelector(`.apps-tab[data-tab="${t}"]`)?.click(), tab);
            await wait(800);
        });
    }
    await each(page, '10e-학년부장-나이스일람표', async () => {
        await clickMenu(page, 'nice-roster');
        await page.waitForSelector('.nice-roster', { timeout: 30000 });
    });
    // 일람표 인쇄 모양(인쇄 엔진이 붙이는 상태를 흉내 내 인쇄 매체로 찍는다)
    try {
        await setLook(page, 'light');
        await clickMenu(page, 'nice-roster');
        await page.waitForSelector('.nice-roster', { timeout: 30000 });
        await page.evaluate(() => { document.body.classList.add('printing'); document.body.dataset.printKind = 'nice-roster'; });
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.emulateMediaType('print');
        await page.setViewport({ width: 1123, height: 794, deviceScaleFactor: 1 });
        shots.push(await shot(page, OUT, '10f-학년부장-나이스일람표-인쇄', { fullPage: false }));
    } catch (err) {
        problems.push(`나이스 일람표 인쇄: ${err.message}`);
    } finally {
        await page.emulateMediaType(null);
        await page.evaluate(() => { document.body.classList.remove('printing'); delete document.body.dataset.printKind; });
        await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 });
    }
    await logout(page);
}

async function homeroomScenario(page, accounts) {
    const homeroom = accounts.users.find((u) => u.role === 'homeroom' && u.classNum === 2) || accounts.users.find((u) => u.role === 'homeroom');
    if (!homeroom) return problems.push('담임 계정이 없습니다');
    await login(page, URL, homeroom.username, accounts.firstTime);
    await each(page, '11-담임-대시보드', () => clickMenu(page, 'dash'));
    await each(page, '13-담임-원서관리', () => clickMenu(page, 'applications'));
    await each(page, '14-담임-나이스일람표', async () => {
        await clickMenu(page, 'nice-roster');
        await page.waitForSelector('.nice-roster', { timeout: 20000 });
    });
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
    // 어느 화면에서 났는지 알 수 있도록 마지막으로 찍은 화면 이름을 함께 남긴다.
    const where = () => (shots.length ? ` (직전 화면: ${path.basename(shots[shots.length - 1])})` : ' (첫 화면 전)');
    page.on('pageerror', (err) => consoleErrors.push(`${err && err.stack ? err.stack.split('\n').slice(0, 3).join(' / ') : String(err)}${where()}`));
    page.on('response', (res) => {
        if (res.status() >= 400) consoleErrors.push(`HTTP ${res.status()} ${res.request().method()} ${res.url()}${where()}`);
    });
    page.on('console', async (msg) => {
        if (msg.type() !== 'error' || msg.text().includes('WebSocket')) return;
        if (msg.text().startsWith('Failed to load resource')) return; // 위 response 기록에 주소와 함께 남는다
        // console.error(err) 는 text() 가 "JSHandle@error" 로만 나오므로 오류 본문을 꺼낸다.
        const parts = await Promise.all(msg.args().map((a) =>
            a.evaluate((v) => (v instanceof Error ? `${v.name}: ${v.message}` : typeof v === 'object' ? JSON.stringify(v) : String(v))).catch(() => '?')));
        const loc = msg.location();
        consoleErrors.push(`${parts.join(' ') || msg.text()}${loc && loc.url ? ` @ ${loc.url.replace(/^.*\/assets\//, '')}:${loc.lineNumber}` : ''}${where()}`);
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
