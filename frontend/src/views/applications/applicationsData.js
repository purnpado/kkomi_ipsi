// ===== 원서 관리: 자료 모으기 =====
// 학급 명단(GetClassGrades)과 학교 원서 기록(GetSchoolApplicationRecords, 담임은 백엔드가 우리 반만 돌려줌)을
// 학생 한 줄로 합치고, 전기고 지원을 학교·전형별로 묶는다.
import { resolveAdmissionYear } from '../../core/admissionYear.js';

export const RESULT_STATUSES = new Set(['합격', '불합격', '최종 진학', '최종진학', '미진학', '포기']);
export const PENDING_STATUSES = new Set(['미입력', '지원희망', '지원 희망', '지원예정', '지원 예정', '지원완료', '지원 완료']);
export const EARLY_CATEGORIES = new Set(['meister', 'special', 'self_foreign', 'other', 'out_province']);

export const CATEGORY_LABELS = {
    meister: '마이스터고', special: '특성화고', self_foreign: '기타 울산 고교', other: '기타 울산 고교', out_province: '타시도', general: '후기 일반고', none: '미진학'
};

export const studentKey = (classNum, studentNum, name) => `${Number(classNum)}|${String(studentNum).trim()}|${String(name || '').trim()}`;

export function appLabel(app) {
    if (app.category === 'general') return '후기 일반고';
    if (app.category === 'none') return '미진학';
    return `${app.schoolName || CATEGORY_LABELS[app.category] || ''}${app.track ? ` · ${app.track}` : ''}`;
}

/**
 * @param {{ role: string, myClass: number|null }} who
 * @returns {Promise<{ year:number, classCount:number, students:object[], groups:object[] }>}
 */
export async function loadApplicationsData(who) {
    const App = window.go.main.App;
    const config = await App.GetSchoolConfig().catch(() => null);
    const year = resolveAdmissionYear(config);
    const classCount = config?.classCount || 0;
    const classes = who.role === 'homeroom' ? [who.myClass] : Array.from({ length: classCount }, (_, i) => i + 1);
    const [records, rosters] = await Promise.all([
        App.GetSchoolApplicationRecords().catch(() => []),
        Promise.all(classes.map((classNum) => App.GetClassGrades(classNum)
            .then((list) => (list || []).map((s) => ({ classNum, studentNum: String(s.StudentNum), name: s.Name || '' })))
            .catch(() => [])))
    ]);

    const appsByKey = new Map();
    (records || []).filter((r) => !year || r.admissionYear === year).forEach((r) => {
        const key = studentKey(r.classNum, r.studentNum, r.studentName);
        if (!appsByKey.has(key)) appsByKey.set(key, []);
        appsByKey.get(key).push(r);
    });

    const students = rosters.flat().map((s) => ({
        ...s,
        key: studentKey(s.classNum, s.studentNum, s.name),
        apps: appsByKey.get(studentKey(s.classNum, s.studentNum, s.name)) || []
    })).sort((a, b) => a.classNum - b.classNum || (parseInt(a.studentNum, 10) || 0) - (parseInt(b.studentNum, 10) || 0));

    // 전기고 지원을 학교·전형별로 묶는다(학교별 결과 입력용)
    const groupMap = new Map();
    students.forEach((s) => s.apps.filter((a) => EARLY_CATEGORIES.has(a.category) && a.schoolName).forEach((a) => {
        const gk = `${a.category}|${a.schoolName}|${a.track || ''}`;
        if (!groupMap.has(gk)) groupMap.set(gk, { key: gk, category: a.category, schoolName: a.schoolName, track: a.track || '', applicants: [] });
        groupMap.get(gk).applicants.push({ student: s, app: a });
    }));
    const groups = [...groupMap.values()].sort((a, b) => b.applicants.length - a.applicants.length || a.schoolName.localeCompare(b.schoolName, 'ko'));

    return { year, classCount, students, groups };
}

/** 학생 거르기 */
export const STUDENT_FILTERS = [
    { id: 'all', label: '전체', test: () => true },
    { id: 'none', label: '원서 없음', test: (s) => s.apps.length === 0 },
    { id: 'general-only', label: '일반고만', test: (s) => s.apps.length > 0 && s.apps.every((a) => a.category === 'general') },
    { id: 'early', label: '전기고 지원', test: (s) => s.apps.some((a) => EARLY_CATEGORIES.has(a.category)) },
    { id: 'pending', label: '결과 없음', test: (s) => s.apps.some((a) => !RESULT_STATUSES.has(a.status)) }
];
