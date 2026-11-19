// 실행: node --test frontend/src/views/teacher/counsel/volunteerTransfer.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTransferDate, transferGradeModes, convertedHours } from './volunteerTransfer.js';

test('비고에서 전입일을 읽는다', () => {
    assert.equal(parseTransferDate('2025.03.04 전입'), '2025-03-04');
    assert.equal(parseTransferDate('2024. 9. 2. 전입(경기)'), '2024-09-02');
    assert.equal(parseTransferDate('2025-11-03 전입'), '2025-11-03');
    assert.equal(parseTransferDate('전입'), '');
});

const modes = (date) => transferGradeModes(date, 2026).map(m => `${m.grade}:${m.mode}`).join(' ');

test('8월 31일 이전 전입 학년은 울산 기준, 그 전 학년은 타 시·도 환산', () => {
    // 2학년(2025학년도) 3월 전입: 1학년만 환산
    assert.equal(modes('2025-03-04'), '1:other 2:ulsan 3:ulsan');
    assert.equal(modes('2025-08-31'), '1:other 2:ulsan 3:ulsan');
});

test('9월 1일 이후 전입 학년은 그 학년도 타 시·도 환산', () => {
    assert.equal(modes('2025-09-01'), '1:other 2:other 3:ulsan');
    // 1~2월 전입은 직전 학년도의 9.1. 이후
    assert.equal(modes('2026-02-10'), '1:other 2:other 3:ulsan');
    assert.equal(modes('2026-03-02'), '1:other 2:other 3:ulsan');
});

test('중1 8월 31일 이전 전입이면 모두 울산 기준', () => {
    assert.equal(modes('2024-03-04'), '1:ulsan 2:ulsan 3:ulsan');
    assert.equal(modes('2024-09-02'), '1:other 2:ulsan 3:ulsan');
});

test('환산 시수 = 4 × 실시 ÷ 기준, 반올림 정수', () => {
    assert.equal(convertedHours(8, 10), 3); // 3.2 → 3
    assert.equal(convertedHours(9, 10), 4); // 3.6 → 4
    assert.equal(convertedHours(5, 20), 1);
    assert.equal(convertedHours(5, 0), null);
});
