import test from 'node:test';
import assert from 'node:assert/strict';
import { barLabelLayout, percentBar } from './generalBar.js';

test('내 위치가 끝에 붙으면 글자를 안쪽으로 맞춘다', () => {
    assert.equal(barLabelLayout(100, 80, 85).meAlign, 'end');
    assert.equal(barLabelLayout(3, 80, 85).meAlign, 'start');
    assert.equal(barLabelLayout(50, 80, 85).meAlign, 'center');
    assert.equal(barLabelLayout(140, 80, 85).at, 100);
});

test('커트라인 글자가 끝 글자와 겹치면 끝 글자를 숨긴다', () => {
    const near = barLabelLayout(50, 88, 92);
    assert.equal(near.showEnd, false);
    assert.equal(near.showStart, true);
    const mid = barLabelLayout(50, 80, 85);
    assert.equal(mid.showEnd, true);
    assert.equal(mid.showStart, true);
});

test('막대 HTML: 내 위치는 막대 위 줄, 100% 글자와 같은 줄에 있지 않다', () => {
    const html = percentBar(100, { generalSafePct: 80, generalBorderPct: 85 });
    const top = html.split('cg-bar-track')[0];
    assert.match(top, /내 위치 100\.0%/);
    assert.doesNotMatch(top, />100%</);
    assert.equal(percentBar(0, { generalSafePct: 80, generalBorderPct: 85 }), '');
});
