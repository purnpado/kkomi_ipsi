import { blocksNewApplication, lockMessage } from '../../core/doubleApply.js';
// 전기고 원서 빠른 입력(applicationsQuick.js)의 계산 부분: 학생 찾기·학교·전형·학과 지망 수·저장할 원서 만들기.
// 화면과 떼어 두어 node --test 로 확인한다(quickEntry.test.js).

// 학교 목록 파일(GetHighSchoolsData)이 비었을 때 쓰는 기본 목록(원서 입력 창과 같은 값)
export const EARLY_DEFAULT_SCHOOLS = {
    meister: ['울산마이스터고등학교', '울산에너지고등학교', '현대공업고등학교'],
    special: ['울산공업고등학교', '울산기술공업고등학교', '울산미용예술고등학교', '울산산업고등학교', '울산생활과학고등학교', '울산상업고등학교', '울산여자기술공업고등학교']
};
const FALLBACK_TRACKS = { meister: ['일반', '특별'], special: ['일반', '취업희망자'] };

export const normalizedSchoolName = (value) => String(value || '').replace(/등학교$/, '').replace(/\s/g, '');

function typeMatches(type, category) {
    const t = String(type || '').toLowerCase();
    if (category === 'meister') return t === 'meister' || t.includes('마이스터');
    if (category === 'special') return t === 'special' || t.includes('특성화');
    return false;
}

/** 구분(마이스터고·특성화고)의 학교 이름 목록 */
export function earlySchools(catalog, category) {
    const names = (catalog || []).filter((s) => typeMatches(s.type, category)).map((s) => s.name);
    return names.length ? names : (EARLY_DEFAULT_SCHOOLS[category] || []);
}

/** 학교의 학과 목록(학교 목록 파일 기준) */
export function schoolDepartments(catalog, schoolName) {
    const key = normalizedSchoolName(schoolName);
    return (catalog || []).find((s) => normalizedSchoolName(s.name) === key)?.departments || [];
}

/** 학교의 전형 목록: 산출 규칙에 있는 전형(특별·취업희망자를 먼저), 없으면 기본 목록 */
export function earlyTracks(ruleList, category, schoolName) {
    const key = normalizedSchoolName(schoolName);
    const tracks = [...new Set((ruleList || []).filter((r) => normalizedSchoolName(r.schoolName) === key).map((r) => r.trackName).filter(Boolean))];
    const list = tracks.length ? tracks : (FALLBACK_TRACKS[category] || []);
    return list.sort((a, b) => Number(/특별|취업/.test(b)) - Number(/특별|취업/.test(a)));
}

/** 학과 지망 칸 수: 특성화고 취업희망자 특별전형은 1개 학과만, 그 밖에는 학과 수(최대 5) */
export function preferenceLimit(category, track, departmentCount) {
    if (category === 'special' && String(track || '').includes('취업')) return Math.min(1, departmentCount);
    return Math.min(5, departmentCount);
}

/** 학생 찾기: "3-12"(반-번호), 번호만, 이름 일부. 최대 8명. */
export function findStudents(students, query) {
    const q = String(query || '').replace(/\s+/g, '');
    if (!q) return [];
    const m = /^(\d+)-(\d+)$/.exec(q);
    const hits = (students || []).filter((s) => {
        if (m) return s.classNum === Number(m[1]) && String(Number(s.studentNum)) === String(Number(m[2]));
        if (/^\d+$/.test(q)) return String(Number(s.studentNum)) === String(Number(q));
        return s.name.replace(/\s+/g, '').includes(q);
    });
    return hits.slice(0, 8);
}

/** 같은 학교·전형 원서가 이미 있으면 그 원서(저장하면 그 원서를 고친다) */
export function existingApplication(student, year, category, schoolName, track) {
    return (student?.apps || []).find((a) => a.admissionYear === year && a.category === category
        && normalizedSchoolName(a.schoolName) === normalizedSchoolName(schoolName) && a.track === track) || null;
}

/** 입력값 확인: 문제가 있으면 안내 문장, 없으면 '' */
export function quickEntryProblem({ student, category, schoolName, track, preferences, departmentCount, limit, year, status, existing }) {
    if (!student) return '학생을 먼저 고르세요.';
    const lock = blocksNewApplication(student.apps, year, { status, isExisting: Boolean(existing) });
    if (lock) return lockMessage(lock);
    if (!['meister', 'special'].includes(category)) return '구분(마이스터고·특성화고)을 고르세요.';
    if (!schoolName) return '지원 학교를 고르세요.';
    if (!track) return '전형을 고르세요.';
    const picked = (preferences || []).filter(Boolean);
    if (departmentCount > 0 && picked.length === 0) return '1지망 학과를 고르세요.';
    if (new Set(picked).size !== picked.length) return '같은 학과를 두 번 고를 수 없습니다.';
    if (picked.length > limit) return `이 전형은 ${limit}개 학과까지만 지원할 수 있습니다.`;
    return '';
}

/** 저장할 원서(SaveStudentApplication 형식). 같은 학교·전형 원서가 있으면 그 원서의 다른 값(1차 결과·배정 학과 등)은 남긴다. */
export function buildQuickRecord({ year, student, category, schoolName, track, preferences, status, extraRound, snapshot, existing }) {
    const prefs = (preferences || []).filter(Boolean);
    return {
        ...(existing || {}),
        id: existing?.id || 0,
        admissionYear: year,
        classNum: student.classNum,
        studentNum: String(student.studentNum),
        studentName: student.name,
        category,
        schoolName,
        track,
        status,
        score: Number(snapshot?.score) || 0,
        scoreBasis: snapshot?.basis || '',
        preferences: prefs,
        assignedDepartment: existing?.assignedDepartment || '',
        assignedSchool: existing?.assignedSchool || '',
        firstStageResult: existing?.firstStageResult || '',
        extraRound: Boolean(extraRound)
    };
}
