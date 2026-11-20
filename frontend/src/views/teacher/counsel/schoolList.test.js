import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanSchoolName, matchesFilter, rowSummaryCells } from './schoolList.js';

test('학교 이름 맞춰 보기: 공업고·고등학교 표기가 달라도 같은 학교', () => {
    for (const name of ['울산공업고등학교', '울산공업고', '울산공고', ' 울산 공업고 ']) assert.equal(cleanSchoolName(name), '울산공');
    assert.equal(cleanSchoolName('울산여자상업고등학교'), cleanSchoolName('울산여자상업고'));
    assert.equal(cleanSchoolName('울산마이스터고등학교'), '울산마이스터');
    assert.notEqual(cleanSchoolName('울산상업고'), cleanSchoolName('울산여자상업고'));
    assert.equal(cleanSchoolName(null), '');
});

test('거르기: 종류와 판정을 함께 본다', () => {
    const card = { matched: true, cat: 'special', level: 'safe' };
    assert.equal(matchesFilter(card, 'all', 'all'), true);
    assert.equal(matchesFilter(card, 'matched', 'all'), true);
    assert.equal(matchesFilter(card, 'meister', 'all'), false);
    assert.equal(matchesFilter(card, 'special', 'challenge'), false);
    assert.equal(matchesFilter({ ...card, matched: false }, 'matched', 'safe'), false);
});

test('한 줄 요약: 기준선·점수차', () => {
    const cells = rowSummaryCells(null, 43.61, 44.44);
    assert.equal(cells.level, 'unknown');
    assert.match(cells.cut, /43\.61/);
    assert.match(cells.diff, /\+0\.83/);
    assert.match(cells.diff, /csr-up/);
    assert.match(rowSummaryCells(null, 0, 50).cut, /기준선 없음/);
    assert.equal(rowSummaryCells(null, 0, 50).diff, '');
    assert.match(rowSummaryCells(null, 60, 50).diff, /-10\.00/);
});
