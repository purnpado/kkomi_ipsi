import test from 'node:test';
import assert from 'node:assert/strict';
import { isNicePreviewTarget } from './niceFormPreview.js';

test('나이스 대조표: 마이스터고·특성화고는 학교·전형을 골랐을 때, 후기 일반고는 늘', () => {
    assert.equal(isNicePreviewTarget('special', '울산상업고등학교', '취업희망자'), true);
    assert.equal(isNicePreviewTarget('special', '', '일반'), false);
    assert.equal(isNicePreviewTarget('special', '울산상업고등학교', ''), false);
    assert.equal(isNicePreviewTarget('special', '__custom_school__', '일반'), false);
    assert.equal(isNicePreviewTarget('meister', '울산마이스터고등학교', '일반'), true);
    assert.equal(isNicePreviewTarget('meister', '울산마이스터고등학교', ''), false);
    assert.equal(isNicePreviewTarget('general', '', ''), true);
    assert.equal(isNicePreviewTarget('self_foreign', '어느고', '일반'), false);
});
