// 원서대장: 학급의 지원 기록을 대장 행으로 변환한다(화면 출력과 엑셀 내보내기가 함께 쓴다).
// 원서대장은 누적 기록이므로 최종 진학 학교 하나만 남기지 않고, 학생이 지원한 학교마다
// 한 줄씩(불합격 학교·합격 학교를 각각) 전형 진행 순서대로 기입한다.

const ACCEPTED = ['합격', '최종 진학', '최종진학'];

// 전형 진행 순서: 전기(마이스터고 → 특성화고 취업희망자 → 특성화고 일반 → 자사고·외고·기타) → 후기 일반고 → 미진학
function stageOrder(app) {
    const track = String(app.track || '');
    switch (app.category) {
        case 'meister': return 1;
        case 'special': return track.includes('취업') ? 2 : 3;
        case 'self_foreign': return 4;
        case 'other': return 5;
        case 'general': return 6;
        case 'none': return 7;
        default: return 8;
    }
}

const studentNumber = value => parseInt(value, 10) || 0;

/** 학급 기록을 학생 번호 → 전형 진행 순서로 정렬한 원서대장 행 목록으로 만든다. */
export function buildRegisterEntries(ctx, classRecords, currentClass) {
    // 원서대장은 학년도별 문서이므로 해당 고입 학년도 기록만 적는다.
    const yearRecords = classRecords.filter(r => !ctx.admissionYear || !r.admissionYear || r.admissionYear === ctx.admissionYear);
    const sorted = [...yearRecords].sort((a, b) =>
        studentNumber(a.studentNum) - studentNumber(b.studentNum)
        || stageOrder(a) - stageOrder(b)
        || String(a.updatedAt || '').localeCompare(String(b.updatedAt || ''))
        || (a.id || 0) - (b.id || 0));
    const counts = new Map();
    sorted.forEach(app => counts.set(app.studentNum, (counts.get(app.studentNum) || 0) + 1));
    const seen = new Map();
    return sorted.map(app => {
        const order = (seen.get(app.studentNum) || 0) + 1;
        seen.set(app.studentNum, order);
        const paddedClass = String(app.classNum || currentClass || 1).padStart(2, '0');
        const paddedNum = String(app.studentNum || '').padStart(2, '0');
        return {
            app,
            studentId: `3${paddedClass}${paddedNum}`,
            applyOrder: order,
            applyCount: counts.get(app.studentNum) || 1,
            schoolText: schoolText(app),
            departmentText: departmentText(app),
            resultText: resultText(app),
            scoreText: scoreText(ctx, app),
            noteText: noteText(app),
        };
    });
}

function schoolText(app) {
    if (app.category === 'general') return '후기 일반고';
    if (app.category === 'none') return '미진학 (진학포기)';
    return app.schoolName || '-';
}

function departmentText(app) {
    if (app.category === 'general') return app.assignedSchool ? `배정: ${app.assignedSchool}` : '';
    if (ACCEPTED.includes(app.status) && app.assignedDepartment) return `${app.assignedDepartment} (배정)`;
    if (app.preferences && app.preferences.length > 0) {
        return app.preferences.length > 1 ? `${app.preferences[0]} (1지망)` : app.preferences[0];
    }
    return app.assignedDepartment || '-';
}

/** 합격 여부 표시: 합격·불합격·진행(지원완료)·예정(지원희망) */
function resultText(app) {
    if (ACCEPTED.includes(app.status)) return '합격';
    if (app.status === '불합격') return '불합격';
    if (app.status === '지원완료' || app.status === '지원 완료') return '진행';
    if (app.status === '지원희망' || app.status === '지원 희망') return '예정';
    if (app.category === 'none') return '-';
    return app.status || '-';
}

function scoreText(ctx, app) {
    // 자사고·외고·과학고·예술고 등 별도 전형 학교는 점수를 기록하지 않는다.
    if (['self_foreign', 'other', 'none'].includes(app.category)) return app.category === 'none' ? '-' : '별도전형';
    if (!(app.score > 0)) return '-';
    const formatted = app.score.toFixed(2);
    const maxVal = ctx.getSchoolTotalMaxString(app.schoolName, app.category, app.track);
    if (maxVal === '%') return `${formatted}%`;
    return maxVal ? `${formatted}/${maxVal}` : formatted;
}

function noteText(app) {
    const parts = [];
    if (app.track && !['해당 없음', '해당없음', '후기 일반계고'].includes(app.track) && app.category !== 'none') {
        const track = app.track === '취업희망자' ? '취업자 특별' : app.track;
        parts.push(track.includes('전형') ? track : `${track}전형`);
    }
    if (app.category === 'none' && app.track) parts.push(app.track);
    if ([app.schoolName, app.track, app.status].some(value => String(value || '').includes('추가'))) parts.push('[추가모집]');
    if (app.status === '최종 진학' || app.status === '최종진학') parts.push('최종 진학');
    return parts.join(' ');
}
