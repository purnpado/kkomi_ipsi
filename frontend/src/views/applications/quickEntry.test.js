import test from 'node:test';
import assert from 'node:assert/strict';
import { buildQuickRecord, earlySchools, earlyTracks, existingApplication, findStudents, preferenceLimit, quickEntryProblem, schoolDepartments } from './quickEntry.js';

const students = [
    { classNum: 3, studentNum: '12', name: '가상하나', apps: [{ admissionYear: 2027, category: 'general', schoolName: '', track: '후기 일반계고', status: '지원예정' }] },
    { classNum: 3, studentNum: '2', name: '가상둘', apps: [{ id: 7, admissionYear: 2027, category: 'special', schoolName: '울산상업고등학교', track: '일반', status: '지원희망', firstStageResult: '합격' }] },
    { classNum: 4, studentNum: '12', name: '나상셋', apps: [] }
];

test('학생 찾기: 반-번호·번호·이름', () => {
    assert.deepEqual(findStudents(students, '3-12').map((s) => s.name), ['가상하나']);
    assert.deepEqual(findStudents(students, '12').map((s) => s.name), ['가상하나', '나상셋']);
    assert.deepEqual(findStudents(students, '가상').map((s) => s.name), ['가상하나', '가상둘']);
    assert.deepEqual(findStudents(students, ''), []);
});

test('학교·전형·학과 지망 수', () => {
    const catalog = [{ name: '울산에너지고등학교', type: 'meister', departments: ['A과', 'B과'] }];
    assert.deepEqual(earlySchools(catalog, 'meister'), ['울산에너지고등학교']);
    assert.equal(earlySchools([], 'special').length, 7); // 목록 파일이 없으면 기본 목록
    assert.deepEqual(schoolDepartments(catalog, '울산에너지고'), ['A과', 'B과']);
    const rules = [{ schoolName: '울산상업고', trackName: '일반' }, { schoolName: '울산상업고', trackName: '취업희망자' }];
    assert.deepEqual(earlyTracks(rules, 'special', '울산상업고등학교'), ['취업희망자', '일반']);
    assert.deepEqual(earlyTracks([], 'meister', '울산에너지고등학교'), ['특별', '일반']);
    assert.equal(preferenceLimit('special', '취업희망자', 6), 1);
    assert.equal(preferenceLimit('special', '일반', 8), 5);
    assert.equal(preferenceLimit('meister', '일반', 3), 3);
});

test('입력 확인과 저장할 원서', () => {
    const base = { student: students[0], category: 'special', schoolName: '울산상업고등학교', track: '일반', departmentCount: 4, limit: 5 };
    assert.equal(quickEntryProblem({ ...base, student: null, preferences: [] }), '학생을 먼저 고르세요.');
    assert.equal(quickEntryProblem({ ...base, preferences: [] }), '1지망 학과를 고르세요.');
    assert.equal(quickEntryProblem({ ...base, preferences: ['A과', 'A과'] }), '같은 학과를 두 번 고를 수 없습니다.');
    assert.equal(quickEntryProblem({ ...base, preferences: ['A과', 'B과'], limit: 1 }), '이 전형은 1개 학과까지만 지원할 수 있습니다.');
    assert.equal(quickEntryProblem({ ...base, preferences: ['A과'] }), '');

    // 같은 학교·전형 원서가 있으면 그 원서를 고치고, 1차 결과 등은 남긴다.
    const existing = existingApplication(students[1], 2027, 'special', '울산상업고', '일반');
    assert.equal(existing.id, 7);
    const rec = buildQuickRecord({ year: 2027, student: students[1], category: 'special', schoolName: '울산상업고등학교', track: '일반', preferences: ['A과', ''], status: '지원완료', extraRound: true, snapshot: { score: 81.5, basis: '자동 산출' }, existing });
    assert.equal(rec.id, 7);
    assert.equal(rec.firstStageResult, '합격');
    assert.deepEqual(rec.preferences, ['A과']);
    assert.equal(rec.score, 81.5);
    assert.equal(rec.extraRound, true);
    assert.equal(existingApplication(students[0], 2027, 'special', '울산상업고', '일반'), null);
});
