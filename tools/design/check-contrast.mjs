// 디자인 기준 변수(frontend/src/styles/tokens.css)의 글자/바탕 대비 검사.
// 실행: node tools/design/check-contrast.mjs   (기준 미달이 하나라도 있으면 종료 코드 1)
// 기준: WCAG 2.2 일반 글자 4.5:1. 라이트·다크 두 벌을 모두 본다.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const cssPath = fileURLToPath(new URL('../../frontend/src/styles/tokens.css', import.meta.url));
const css = readFileSync(cssPath, 'utf8');

function block(selector) {
    const start = css.indexOf(selector + ' {');
    if (start < 0) throw new Error(`${selector} 블록이 없습니다`);
    const body = css.slice(start, css.indexOf('\n}', start));
    const vars = {};
    for (const m of body.matchAll(/--(kk-[a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)) vars[m[1]] = m[2];
    return vars;
}

function luminance(hex) {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a, b) {
    const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (l1 + 0.05) / (l2 + 0.05);
}

const TEXTS = ['text-strong', 'text-1', 'text-2', 'text-3', 'accent', 'success', 'warning', 'danger'];
const BACKS = ['bg', 'surface', 'sunken'];
const JUDGES = ['safe', 'proper', 'hope', 'challenge', 'none'];

const dark = block(':root');
const themes = { 다크: dark, 라이트: { ...dark, ...block('html[data-theme="light"]') } };
let fails = 0;
const rows = [];
for (const [name, v] of Object.entries(themes)) {
    const pairs = [];
    for (const t of TEXTS) for (const bg of BACKS) pairs.push([t, bg]);
    for (const j of JUDGES) pairs.push([`judge-${j}`, `judge-${j}-bg`], [`judge-${j}`, 'surface']);
    pairs.push(['on-fill', 'accent-fill']);
    for (const [fg, bg] of pairs) {
        const r = ratio(v[`kk-${fg}`], v[`kk-${bg}`]);
        const ok = r >= 4.5;
        if (!ok) fails++;
        rows.push(`| ${name} | ${fg} | ${bg} | ${r.toFixed(2)} | ${ok ? '통과' : '미달'} |`);
    }
}
console.log('| 모드 | 글자 | 바탕 | 대비 | 결과 |\n|---|---|---|---|---|');
console.log(rows.join('\n'));
console.log(fails ? `\n기준 미달 ${fails}건` : '\n모두 4.5:1 이상');
process.exit(fails ? 1 : 0);
