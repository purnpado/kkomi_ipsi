import test from 'node:test';
import assert from 'node:assert/strict';
import { needsRoundTrack, ULSAN_OTHER_SCHOOLS } from './ulsanOtherSchools.js';

test('목록 밖 학교·타시도 고교만 지원 시기를 고른다', () => {
    assert.equal(needsRoundTrack('out_province', '부산기계공업고등학교'), true);
    assert.equal(needsRoundTrack('other', '__custom_school__'), true);
    assert.equal(needsRoundTrack('other', '어느울산고등학교'), true);
    assert.equal(needsRoundTrack('other', '울산외국어고등학교'), false);
    assert.equal(needsRoundTrack('self_foreign', '현대청운고등학교'), false);
    assert.equal(needsRoundTrack('other', ''), false);
    assert.equal(needsRoundTrack('meister', '울산마이스터고등학교'), false);
    assert.equal(ULSAN_OTHER_SCHOOLS.length, 7);
});
