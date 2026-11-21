import test from 'node:test';
import assert from 'node:assert/strict';
import { collectSubjects, subjectPriority, subjectTableHTML } from './transcriptSubjects.js';

test('나이스 확인서 과목 순서: 기본 교과 → 기타 → 체육·미술·음악', () => {
    const names = ['음악', '국어', '일본어', '체육', '정보', '기술 가정', '미술'];
    const sorted = [...names].sort((a, b) => subjectPriority(a) - subjectPriority(b));
    assert.deepEqual(sorted, ['국어', '기술 가정', '정보', '일본어', '체육', '미술', '음악']);
});

test('학기별 성적을 모으고 1-1에 A~E가 없으면 자유학기로 본다', () => {
    const rows = [
        { 학년: '1', 학기: '1', 과목: '국어', 성취도: 'P' },
        { 학년: '1', 학기: '2', 과목: '국어', 성취도: 'A', 원점수: '99/72.5' },
        { 과목: '수학', 성취도: 'C', 원점수: '71' },
    ];
    const { subjects, freeFirst } = collectSubjects(rows);
    assert.equal(freeFirst, true);
    assert.deepEqual(subjects.map((s) => s.name), ['국어', '수학']);
    assert.deepEqual(subjects[0].scores['1-2'], { achieve: 'A', letter: 'A', points: 5, raw: '99' });
    assert.equal(subjects[1].scores['1-2'].points, 3); // 학년·학기 빈칸은 윗줄 값을 이어 쓴다
});

test('표: 6학기 칸, 학기별점수 줄, 교과성적 160', () => {
    const html = subjectTableHTML(collectSubjects([{ 학년: '1', 학기: '2', 과목: '국어', 성취도: 'B', 원점수: '85' }]), { '1-2': { sum: 4, count: 1 } }, 150.5, false);
    assert.match(html, /3학년 2학기 <span class="tr-tag">예상/);
    assert.match(html, /tr-g--B/);
    assert.match(html, /<b>4<\/b><small> \(1과목\)/);
    assert.match(html, /150\.50/);
});
