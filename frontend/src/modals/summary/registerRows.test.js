import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRegisterEntries } from './registerRows.js';

test('타시도 실제 학교명을 원서대장에 보존하고 같은 학생의 원서를 누적한다', () => {
    const ctx = { admissionYear: 2027, getSchoolTotalMaxString: () => '200' };
    const records = [
        { id: 1, admissionYear: 2027, classNum: 1, studentNum: '1', studentName: '가상학생', category: 'other', schoolName: '제주서귀포고등학교', track: '해당 없음', status: '지원완료' },
        { id: 2, admissionYear: 2027, classNum: 1, studentNum: '1', studentName: '가상학생', category: 'general', schoolName: '', status: '지원희망' },
        { id: 3, admissionYear: 2026, classNum: 1, studentNum: '1', studentName: '가상학생', category: 'other', schoolName: '이전 학교' },
    ];
    const rows = buildRegisterEntries(ctx, records, 1);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].schoolText, '제주서귀포고등학교');
    assert.equal(rows[0].scoreText, '별도전형');
    assert.equal(rows[0].resultText, '진행');
    assert.equal(rows[0].applyCount, 2);
    assert.equal(rows[1].schoolText, '후기 일반고');
    assert.equal(rows[1].applyOrder, 2);
});
