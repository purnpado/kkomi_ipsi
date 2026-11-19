import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRegisterEntries, isOutOfProvince } from './registerRows.js';

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

test('통계 제외 학생은 점수 대신 별도전형, 타시도 원서는 비고에 타시도 진학', () => {
    const ctx = { admissionYear: 2027, getSchoolTotalMaxString: () => '100', separateStudents: new Set(['1|2|가상둘']) };
    const records = [
        { id: 1, admissionYear: 2027, classNum: 1, studentNum: '2', studentName: '가상둘', category: 'special', schoolName: '울산상업고등학교', track: '일반', status: '지원완료', score: 70.5 },
        { id: 2, admissionYear: 2027, classNum: 1, studentNum: '3', studentName: '가상셋', category: 'special', schoolName: '울산상업고등학교', track: '일반', status: '지원완료', score: 70.5 },
        { id: 3, admissionYear: 2027, classNum: 1, studentNum: '4', studentName: '가상넷', category: 'other', schoolName: '제주서귀포고등학교', track: '해당 없음', status: '합격' },
        { id: 4, admissionYear: 2027, classNum: 1, studentNum: '5', studentName: '가상다섯', category: 'other', schoolName: '울산예술고등학교', track: '해당 없음', status: '합격' },
    ];
    const rows = buildRegisterEntries(ctx, records, 1);
    assert.equal(rows[0].scoreText, '별도전형');
    assert.equal(rows[1].scoreText, '70.50/100');
    assert.match(rows[2].noteText, /타시도 진학/);
    assert.doesNotMatch(rows[3].noteText, /타시도/);
    assert.equal(isOutOfProvince({ category: 'other', schoolName: '타시도 고등학교' }), true);
    assert.equal(isOutOfProvince({ category: 'other', schoolName: '기타' }), false);
    assert.equal(isOutOfProvince({ category: 'self_foreign', schoolName: '민족사관고등학교' }), false);
    assert.equal(isOutOfProvince({ category: 'out_province', schoolName: '경기기계공업고등학교' }), true);
    const out = buildRegisterEntries(ctx, [{ id: 9, admissionYear: 2027, classNum: 1, studentNum: '9', studentName: '가상아홉', category: 'out_province', schoolName: '민족사관고등학교', track: '해당 없음', status: '합격' }], 1)[0];
    assert.equal(out.scoreText, '별도전형');
    assert.equal(out.noteText, '타시도 진학');
});
