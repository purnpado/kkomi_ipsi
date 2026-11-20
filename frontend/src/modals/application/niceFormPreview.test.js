import test from 'node:test';
import assert from 'node:assert/strict';
import { isNicePreviewTarget } from './niceFormPreview.js';

test('나이스 대조표는 특성화고 학교·전형을 골랐을 때만', () => {
    assert.equal(isNicePreviewTarget('special', '울산상업고등학교', '취업희망자'), true);
    assert.equal(isNicePreviewTarget('special', '', '일반'), false);
    assert.equal(isNicePreviewTarget('special', '울산상업고등학교', ''), false);
    assert.equal(isNicePreviewTarget('special', '__custom_school__', '일반'), false);
    assert.equal(isNicePreviewTarget('meister', '울산마이스터고등학교', '일반'), false);
    assert.equal(isNicePreviewTarget('general', '', '후기 일반계고'), false);
});
