import test from 'node:test';
import assert from 'node:assert/strict';
import { displaySchool } from './schoolName.js';

test('짧은 이름·별칭은 정식 이름으로', () => {
    const cases = {
        '울산공업고': '울산공업고등학교', '울산공고': '울산공업고등학교', ' 울산 공업고 ': '울산공업고등학교', '울산공업고등학교': '울산공업고등학교',
        '울산기술공업고': '울산기술공업고등학교', '현대공업고': '현대공업고등학교', '현대공고': '현대공업고등학교',
        '울산마이스터고': '울산마이스터고등학교', '울산에너지고': '울산에너지고등학교', '울산여자상업고': '울산여자상업고등학교',
        '울산여상': '울산여자상업고등학교', '울산상업고': '울산상업고등학교', '울산상고': '울산상업고등학교', '울산산업고': '울산산업고등학교',
        '울산미용예술고': '울산미용예술고등학교', '울산생활과학고': '울산생활과학고등학교', '울산애니원고': '울산애니원고등학교',
    };
    for (const [input, want] of Object.entries(cases)) assert.equal(displaySchool(input), want, input);
});

test('목록에 없는 학교·묶음 이름·우리 중학교 이름은 그대로', () => {
    for (const name of ['제주서귀포고등학교', '울산 후기 일반계고', '후기 일반고', '가람중학교', '타시도 고등학교', '울산공업고 기계과', '']) {
        assert.equal(displaySchool(name), name.trim());
    }
    assert.equal(displaySchool(null), '');
});

test('고교 목록에 새 학교가 있으면 그 이름도 정식 이름으로', async () => {
    const { registerSchoolCatalog } = await import('./schoolName.js');
    assert.equal(displaySchool('울산새빛고'), '울산새빛고');
    registerSchoolCatalog(['울산새빛고등학교', '울산공업고등학교', '이상한이름']);
    assert.equal(displaySchool('울산새빛고'), '울산새빛고등학교');
    assert.equal(displaySchool('울산공고'), '울산공업고등학교'); // 별칭은 그대로 동작
    registerSchoolCatalog([]);
});
