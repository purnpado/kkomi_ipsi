import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesCutoffFilter } from './cutoffList.js';

test('커트라인 학교 거르기: 탭과 검색어', () => {
    const card = { category: 'special', search: '울산공업고 울산공업고등학교 스마트기계과 일반 일반전형' };
    assert.equal(matchesCutoffFilter(card, 'all', ''), true);
    assert.equal(matchesCutoffFilter(card, 'special', ''), true);
    assert.equal(matchesCutoffFilter(card, 'meister', ''), false);
    assert.equal(matchesCutoffFilter(card, 'all', '스마트기계'), true);
    assert.equal(matchesCutoffFilter(card, 'all', '  울산공업고등학교 '), true);
    assert.equal(matchesCutoffFilter(card, 'special', '전기전자'), false);
});
