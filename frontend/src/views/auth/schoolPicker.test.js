import test from 'node:test';
import assert from 'node:assert/strict';
import { findSchools } from './schoolPicker.js';

const SCHOOLS = ['가온중학교', '강남중학교', '강동중학교', '고헌중학교', '구영중학교', '신정중학교', '남창중학교'];

test('한 글자만 쳐도 맞는 학교만, 첫 글자부터 맞는 학교 먼저', () => {
    assert.deepEqual(findSchools(SCHOOLS, '강'), ['강남중학교', '강동중학교', '가온중학교']); // 가온: "가온"을 치는 중에도 "강"이 보임
    assert.deepEqual(findSchools(SCHOOLS, '남'), ['남창중학교', '강남중학교']);
    assert.deepEqual(findSchools(SCHOOLS, ''), []);
});

test('자음만 쳐도 찾고, "중학교"의 자음에는 모든 학교가 걸리지 않는다', () => {
    assert.deepEqual(findSchools(SCHOOLS, 'ㄱㄴ'), ['강남중학교']);
    assert.deepEqual(findSchools(SCHOOLS, 'ㅈ'), ['신정중학교']);
    assert.deepEqual(findSchools(SCHOOLS, '강남중학교'), ['강남중학교']);
});

test('치는 중인 글자도 맞춘다', () => {
    assert.deepEqual(findSchools(SCHOOLS, '가'), ['가온중학교', '강남중학교', '강동중학교']);
    assert.deepEqual(findSchools(SCHOOLS, '구여'), ['구영중학교']);
});
