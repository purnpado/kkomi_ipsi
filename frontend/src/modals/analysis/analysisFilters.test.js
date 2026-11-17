import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tracksForSchool, trackLabel } from './analysisFilters.js';

test('학교 규칙에 맞는 전형을 선택하고 이름을 표시한다', () => {
    const rules = [
        { schoolName: '울산마이스터고', trackName: '일반' },
        { schoolName: '울산마이스터고', trackName: '특별' },
        { schoolName: '울산공업고', trackName: '일반' },
        { schoolName: '울산공업고', trackName: '취업희망자' },
    ];
    assert.deepEqual(tracksForSchool('울산마이스터고등학교', rules), ['일반', '특별']);
    assert.deepEqual(tracksForSchool('울산공업고등학교', rules), ['일반', '취업희망자']);
    assert.deepEqual(tracksForSchool('기타고', [], 'special', ['특별']), ['일반', '취업희망자']);
    assert.equal(trackLabel('취업희망자'), '취업희망자 특별전형');
});
