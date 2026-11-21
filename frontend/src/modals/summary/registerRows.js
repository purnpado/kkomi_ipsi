// 원서대장: 학급의 지원 기록을 대장 행으로 변환한다(화면 출력과 엑셀 내보내기가 함께 쓴다).
// 원서대장은 누적 기록이므로 최종 진학 학교 하나만 남기지 않고, 학생이 지원한 학교마다
// 한 줄씩(불합격 학교·합격 학교를 각각) 전형 진행 순서대로 기입한다.
import { isSameTrack, normalizeSchoolName, displayTrack } from '../../core/utils.js';
import { displaySchool } from '../../core/schoolName.js';
import { ULSAN_OTHER_SCHOOLS } from '../../core/ulsanOtherSchools.js';

const ACCEPTED = ['합격', '최종 진학', '최종진학'];

// "기타" 구분에서 고르는 울산 학교. 이 밖의 학교명을 직접 넣은 원서는 타시도 진학으로 본다
// (원서 입력 창 studentApplicationModal.js 의 목록과 같다).

/** 타시도 고교 원서인지: 타시도 구분, 또는 예전처럼 기타 구분에 직접 입력한 학교명(울산으로 시작하지 않음)·"타시도 고등학교". */
export function isOutOfProvince(app) {
    if (app.category === 'out_province') return true;
    if (app.category !== 'other') return false; // 예전 자사고·외고(self_foreign) 원서는 타시도로 보지 않는다(예전 판단 유지)
    const name = String(app.schoolName || '').trim();
    if (!name || name === '기타') return false;
    if (name === '타시도 고등학교') return true;
    return !ULSAN_OTHER_SCHOOLS.includes(name) && !name.startsWith('울산');
}

// 전형 진행 순서: 전기(마이스터고 → 특성화고 취업희망자 → 특성화고 일반 → 자사고·외고·기타) → 후기 일반고 → 추가모집 → 미진학
// 추가모집은 후기 일반고 발표 뒤에 있으므로 일반고 다음에 적는다.
function stageOrder(app) {
    const track = String(app.track || '');
    if (app.extraRound) return 6.5;
    switch (app.category) {
        case 'meister': return 1;
        case 'special': return track.includes('취업') ? 2 : 3;
        case 'self_foreign': return 4;
        case 'other': return 5;
        case 'out_province': return 5;
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
    if (app.category === 'general') return app.assignedSchool ? `배정: ${displaySchool(app.assignedSchool)}` : '';
    if (ACCEPTED.includes(app.status) && app.assignedDepartment) return `${app.assignedDepartment} (배정)`;
    if (app.preferences && app.preferences.length > 0) {
        return app.preferences.length > 1 ? `${app.preferences[0]} (1지망)` : app.preferences[0];
    }
    return app.assignedDepartment || '-';
}

/** 합격 여부 표시: 합격·불합격·진행(지원완료)·예정(지원희망) */
function resultText(app) {
    if (ACCEPTED.includes(app.status)) return '합격';
    if (app.status === '불합격') {
        if (app.firstStageResult === '합격') return '불합격(2차)';
        if (app.firstStageResult === '불합격') return '불합격(1차)';
        return '불합격';
    }
    if (app.firstStageResult === '합격') return '1차 합격';
    if (app.status === '지원완료' || app.status === '지원 완료') return '진행';
    if (app.status === '지원희망' || app.status === '지원 희망') return '예정';
    if (app.category === 'none') return '-';
    return app.status || '-';
}

/** 학생의 그 학교·전형 1차(서류) 산출 결과(점수·만점). 후기 일반고는 해당 없음. */
function firstStageResult(ctx, app) {
    if (app.category === 'general') return null;
    const results = ctx.studentResults?.get(`${app.classNum}|${app.studentNum}|${app.studentName}`) || [];
    const school = normalizeSchoolName(app.schoolName);
    return results.find(r => normalizeSchoolName(r.schoolName) === school && isSameTrack(r.trackName, app.track)) || null;
}

/** 나이스 석차 연명부의 내신성적(올리지 않았거나 그 학생이 없으면 0) */
export function niceFinalScore(ctx, app) {
    const num = Number.parseInt(String(app.studentNum ?? '').trim(), 10);
    return Number(ctx.niceFinal?.scores?.[`${app.classNum}|${Number.isNaN(num) ? String(app.studentNum).trim() : num}`]) || 0;
}

function scoreText(ctx, app) {
    // 자사고·외고·과학고·예술고 등 별도 전형 학교는 점수를 기록하지 않는다.
    if (['self_foreign', 'other', 'out_province', 'none'].includes(app.category)) return app.category === 'none' ? '-' : '별도전형';
    // 입시 통계 제외 학생(특수교육대상자·학생선수 등)도 성적과 다른 기준으로 선발되므로 점수 대신 "별도전형"(사유는 적지 않음).
    if (ctx.separateStudents?.has(`${app.classNum}|${String(app.studentNum ?? '').trim()}|${String(app.studentName ?? '').trim()}`)) return '별도전형';
    // 후기 일반고: 나이스 석차 연명부를 올렸으면 나이스 내신성적(공식 산출)을 쓴다.
    const niceScore = app.category === 'general' ? niceFinalScore(ctx, app) : 0;
    // 원서에 저장된 점수(지원할 때의 확정값)를 먼저 쓰고, 없으면 지금 산출한 1차 전형 점수로 채운다.
    const result = firstStageResult(ctx, app);
    const score = niceScore > 0 ? niceScore : app.score > 0 ? app.score : Number(result?.totalScore) || 0;
    if (!(score > 0)) return '-';
    const formatted = score.toFixed(2);
    // 만점은 산출 규칙(요강)의 1차 전형 만점을 쓰고, 산출 결과가 없을 때만 학교별 기본값을 쓴다.
    // 후기 일반고 내신은 교과 160 + 출결 16 + 봉사 8 + 행동발달 8 + 창의적 체험활동 8 = 200점 만점.
    const maxVal = app.category === 'general' ? '200'
        : Number(result?.totalMax) > 0 ? String(Number(result.totalMax)) : ctx.getSchoolTotalMaxString(app.schoolName, app.category, app.track);
    if (maxVal === '%') return `${formatted}%`;
    return maxVal ? `${formatted}/${maxVal}` : formatted;
}

function noteText(app) {
    const parts = [];
    if (app.track && !['해당 없음', '해당없음', '후기 일반계고'].includes(app.track) && app.category !== 'none') {
        const track = displayTrack(app.track);
        parts.push(track.includes('전형') ? track : `${track}전형`);
    }
    if (app.category === 'none' && app.track) parts.push(app.track);
    if (isOutOfProvince(app)) parts.push('타시도 진학');
    // 원서의 추가모집 표시(예전에는 학교명·전형에 '추가'를 적어 구분했다)
    if (app.extraRound || [app.schoolName, app.track, app.status].some(value => String(value || '').includes('추가'))) parts.push('[추가모집]');
    if (app.status === '최종 진학' || app.status === '최종진학') parts.push('최종 진학');
    return parts.join(' ');
}
