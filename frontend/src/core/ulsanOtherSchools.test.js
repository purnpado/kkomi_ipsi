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

test('학과(과정)를 고를 수 있는 기타 울산 고교', async () => {
    const { hasOtherDepartments, ULSAN_OTHER_DEPARTMENTS } = await import('./ulsanOtherSchools.js');
    assert.equal(hasOtherDepartments('other', '울산예술고등학교'), true);
    assert.equal(hasOtherDepartments('self_foreign', '울산외국어고등학교'), true);
    assert.equal(hasOtherDepartments('other', '울산고운고등학교'), false);
    assert.equal(hasOtherDepartments('other', '울산과학고등학교'), false);
    assert.equal(hasOtherDepartments('other', '현대청운고등학교'), false);
    assert.deepEqual(ULSAN_OTHER_DEPARTMENTS['울산스포츠과학고등학교'], ['스포츠전문과정', '스포츠인재과정']);
    assert.equal(hasOtherDepartments('meister', '울산예술고등학교'), false);
    assert.deepEqual(ULSAN_OTHER_DEPARTMENTS['울산예술고등학교'], ['음악과', '미술과', '무용과']);
});
