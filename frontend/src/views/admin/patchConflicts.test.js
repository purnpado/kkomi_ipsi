import test from 'node:test';
import assert from 'node:assert/strict';
import { applicationItemsHtml, batchReviewText, collectActions, describeSummary, plainSummaryText, reviewBannerHtml, splitItems } from './patchConflicts.js';

const items = [
    { id: 'a:1', kind: 'new', needsReview: false, default: 'apply', options: ['apply', 'skip'] },
    { id: 'a:2', kind: 'update', needsReview: false, default: 'apply', options: ['apply', 'skip'] },
    { id: 'r:3', kind: 'rename', needsReview: true, default: 'replace', options: ['replace', 'keep', 'both'],
      mine: { admissionYear: 2027, category: 'special', schoolName: '울산공고', track: '일반전형', status: '지원예정' },
      theirs: { admissionYear: 2027, category: 'special', schoolName: '<b>울산여상</b>', track: '일반전형', status: '지원예정' } },
];

test('원서 한 줄 요약: 지운 원서·추가모집·배정 학과', () => {
    assert.equal(describeSummary({ admissionYear: 2027, category: 'meister', schoolName: '울산마이스터고', track: '일반전형', status: '합격', assignedDepartment: '기계과', extraRound: true }), '2027 울산마이스터고 · 일반전형 · 합격 · 배정 기계과 · 추가모집');
    assert.equal(describeSummary({ admissionYear: 2027, category: 'special', schoolName: '울산상고', track: '일반전형', deleted: true }), '2027 울산상고 · 일반전형 — 지움');
    assert.equal(describeSummary({ admissionYear: 2027, category: 'general', schoolName: '', track: '해당 없음', status: '지원완료' }), '2027 후기 일반고 · 지원완료');
    assert.equal(describeSummary(null), '없음');
});

test('바로 반영할 것과 골라야 할 것 나누기', () => {
    const { review, plain } = splitItems(items);
    assert.equal(review.length, 1);
    assert.equal(plainSummaryText(plain), '새 원서 1건 · 고친 원서 1건');
    assert.deepEqual(splitItems(undefined), { review: [], plain: [] });
});

test('골라야 할 원서: 기본값 체크, 학교명은 글자로만', () => {
    const html = applicationItemsHtml({ applicationItems: items, keptApplications: 2 }, 0);
    assert.match(html, /담임이 학교·전형을 바꾼 원서/);
    assert.match(html, /value="replace" checked/);
    assert.doesNotMatch(html, /value="keep" checked/);
    assert.match(html, /&lt;b&gt;울산여상/);
    assert.match(html, /그대로 두는 원서 2건/);
    assert.equal(applicationItemsHtml({ applicationItems: [], keptApplications: 0 }, 1), '');
});

test('고른 처리 모으기', () => {
    const inputs = [{ dataset: { item: 'r:3' }, value: 'keep' }];
    const root = { querySelectorAll: (selector) => (selector.includes('data-student="0"') ? inputs : []) };
    assert.deepEqual(collectActions(root, 0), { 'r:3': 'keep' });
    assert.deepEqual(collectActions(root, 1), {});
});

test('안내 문구', () => {
    assert.match(reviewBannerHtml({ reviewCount: 3 }), /확인이 필요한 원서 3건/);
    assert.match(reviewBannerHtml({ legacy: true }), /예전 버전/);
    assert.equal(reviewBannerHtml({}), '');
    assert.equal(batchReviewText({ review: 0 }), '');
    assert.equal(batchReviewText({ review: 3, reviewByClass: { 5: 1, 3: 2 } }), '확인이 필요한 원서 3건(3반 2건, 5반 1건)은 학년부장 것을 그대로 두었습니다. [1개 반 상세 검토]로 그 반 파일을 다시 열어 고르세요.');
});
