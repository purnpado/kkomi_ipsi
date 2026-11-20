import test from 'node:test';
import assert from 'node:assert/strict';
import { niceUploadParts } from './niceUploads.js';

test('종류별로 올린 날을 보이고, 반마다 다르면 범위로 보인다', () => {
    const parts = niceUploadParts([
        { classNum: 1, kind: 'grades', uploadedAt: '2026-11-20 09:05' },
        { classNum: 2, kind: 'grades', uploadedAt: '2026-11-18 15:00' },
        { classNum: 1, kind: 'attendance', uploadedAt: '2026-11-18 09:05' },
        { classNum: 2, kind: 'attendance', uploadedAt: '2026-11-18 16:40' },
    ]);
    assert.deepEqual(parts, [
        { kind: 'grades', label: '성적', text: '11월 18일~11월 20일(반마다 다름)' },
        { kind: 'attendance', label: '출결', text: '11월 18일' },
        { kind: 'volunteer', label: '봉사', text: '기록 없음' },
    ]);
});
