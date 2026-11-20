import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestExtraRound } from './extraRound.js';

test('후기 일반고 불합격이면 새 전기고 원서는 추가모집으로 미리 체크', () => {
    const general = (status, admissionYear = 2027) => ({ category: 'general', status, admissionYear });
    assert.equal(suggestExtraRound([general('불합격')], 2027), true);
    assert.equal(suggestExtraRound([general('합격')], 2027), false); // 합격 학생은 추가모집에 지원하지 않음
    assert.equal(suggestExtraRound([general('지원예정')], 2027), false);
    assert.equal(suggestExtraRound([general('불합격', 2026)], 2027), false); // 다른 학년도
    assert.equal(suggestExtraRound([{ category: 'special', status: '불합격', admissionYear: 2027 }], 2027), false);
    assert.equal(suggestExtraRound([], 2027), false);
});
