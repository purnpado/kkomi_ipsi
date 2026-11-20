import test from 'node:test';
import assert from 'node:assert/strict';
import { blocksNewApplication, findApplicationLock, lockLabel, lockMessage } from './doubleApply.js';
import { quickEntryProblem } from '../views/applications/quickEntry.js';

const passed = [{ admissionYear: 2027, category: 'special', schoolName: '울산공업고', track: '일반', status: '합격' }];
const gaveUp = [{ admissionYear: 2027, category: 'meister', schoolName: '울산마이스터고등학교', track: '일반', status: '포기' }];

test('잠금 원서: 합격·최종 진학·등록 포기만, 미진학·다른 해는 아님', () => {
    assert.equal(findApplicationLock(passed, 2027)?.status, '합격');
    assert.equal(findApplicationLock(gaveUp, 2027)?.status, '포기');
    assert.equal(findApplicationLock([{ ...passed[0], status: '최종 진학' }], 2027)?.status, '최종 진학');
    assert.equal(findApplicationLock([{ ...passed[0], status: '불합격' }], 2027), null);
    assert.equal(findApplicationLock([{ admissionYear: 2027, category: 'none', schoolName: '미진학', status: '미진학' }], 2027), null);
    assert.equal(findApplicationLock(passed, 2026), null);
    assert.equal(lockLabel(passed[0]), '울산공업고등학교 합격');
    assert.equal(lockLabel(gaveUp[0]), '울산마이스터고등학교 합격 후 등록 포기');
    assert.match(lockMessage(passed[0]), /이중지원 금지/);
});

test('새 원서만 막고, 이미 있는 원서 고치기·지난 불합격 기록은 허용', () => {
    assert.ok(blocksNewApplication(passed, 2027, { status: '지원완료', isExisting: false }));
    assert.equal(blocksNewApplication(passed, 2027, { status: '불합격', isExisting: false }), null);
    assert.equal(blocksNewApplication(passed, 2027, { status: '최종 진학', isExisting: true }), null);
});

test('빠른 입력: 합격·등록 포기 학생은 새 원서를 저장할 수 없음', () => {
    const base = { category: 'special', schoolName: '울산상업고등학교', track: '일반', preferences: ['회계과'], departmentCount: 3, limit: 3, year: 2027 };
    assert.match(quickEntryProblem({ ...base, student: { apps: passed }, status: '지원완료' }), /이중지원 금지/);
    assert.match(quickEntryProblem({ ...base, student: { apps: gaveUp }, status: '합격' }), /등록 포기/);
    assert.equal(quickEntryProblem({ ...base, student: { apps: passed }, status: '불합격' }), '');
    assert.equal(quickEntryProblem({ ...base, student: { apps: passed }, status: '지원완료', existing: { id: 3 } }), '');
    assert.equal(quickEntryProblem({ ...base, student: { apps: [] }, status: '지원완료' }), '');
});
