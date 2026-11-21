import test from 'node:test';
import assert from 'node:assert/strict';
import { matchIndex, matchesSearch, sortByStart } from './searchMatch.js';

test('글자가 들어 있으면 찾는다(띄어쓰기·대소문자 무시)', () => {
    assert.equal(matchesSearch('김강호', '강'), true);
    assert.equal(matchesSearch('강 민수', '민수'), true);
    assert.equal(matchesSearch('Kim', 'ki'), true);
    assert.equal(matchesSearch('이수진', '강'), false);
    assert.equal(matchIndex('강민수', ''), 0);
});

test('자음만 쳐도 찾는다(초성)', () => {
    assert.equal(matchesSearch('강민수', 'ㄱ'), true);
    assert.equal(matchesSearch('강민수', 'ㄱㅁ'), true);
    assert.equal(matchesSearch('강민수', 'ㅁㅅ'), true);
    assert.equal(matchesSearch('강민수', 'ㄱㅅ'), false);
    assert.equal(matchesSearch('김강호', '김ㄱ'), true);
});

test('치는 중인 마지막 글자도 맞춘다', () => {
    assert.equal(matchesSearch('김민수', '기'), true); // 김을 치는 중
    assert.equal(matchesSearch('김민수', '김미'), true); // 민을 치는 중
    assert.equal(matchesSearch('기민지', '김'), true); // 기민을 치는 중(받침이 다음 첫소리)
    assert.equal(matchesSearch('김민수', '가'), false);
    assert.equal(matchesSearch('기수', '김'), false);
    assert.equal(matchesSearch('기민지', '기'), true);
});

test('가운데 글자는 정확히 맞아야 한다', () => {
    assert.equal(matchesSearch('김민수', '기민'), false);
    assert.equal(matchesSearch('가온중학교', '가온'), true);
});

test('첫 글자부터 맞는 것을 앞으로, 나머지 순서는 그대로', () => {
    const names = ['김강호', '이강', '강민수', '박지민', '강동원'];
    const hits = names.filter((n) => matchesSearch(n, '강'));
    assert.deepEqual(sortByStart(hits, '강', (n) => n), ['강민수', '강동원', '김강호', '이강']);
    assert.deepEqual(sortByStart(names, '', (n) => n), names);
    assert.deepEqual(sortByStart(['가온', '강남'], '강', (n) => n), ['강남', '가온']); // 그대로 맞는 것이 먼저
});
