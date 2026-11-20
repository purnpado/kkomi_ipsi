import test from 'node:test';
import assert from 'node:assert/strict';
import { leadershipPayload } from './leadershipInput.js';

test('학기별 체크는 학기 순서대로 저장하고 개수도 함께 저장한다', () => {
    assert.deepEqual(leadershipPayload(['3_1', '1_2'], true, false), { leadership_semesters: ['1_2', '3_1'], leadership_terms: 2 });
    assert.deepEqual(leadershipPayload([], true, true), { leadership_semesters: [], leadership_terms: 0 });
});

test('예전 숫자 입력은 체크를 바꾸기 전까지 그대로 둔다', () => {
    assert.equal(leadershipPayload([], false, false), null);
    assert.deepEqual(leadershipPayload(['2_2'], false, true), { leadership_semesters: ['2_2'], leadership_terms: 1 });
});
