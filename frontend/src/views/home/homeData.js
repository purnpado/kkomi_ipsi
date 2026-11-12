// ===== 대시보드 자료 모으기 (담임·진로부장 공통) =====
// 기존 API만 쓴다: 학급별 산출 결과, 학교 원서 기록(담임은 백엔드가 우리 반만 돌려줌), 커트라인, 내 상담 기록 요약.
// 학생마다 "희망 학교"(올해 원서 중 대표 1건)와 그 학교의 4단계 판정을 붙여 돌려준다.
import { judgeGeneralPercentile, judgeScore } from '../../core/admissionJudgment.js';
import { resolveAdmissionYear } from '../../core/admissionYear.js';
import { isSameTrack, normalizeDept, normalizeSchoolName } from '../../core/utils.js';

const RESULT_STATUSES = new Set(['합격', '불합격', '최종 진학', '최종진학', '미진학']);
const CATEGORY_ORDER = { meister: 0, special: 1, general: 2 };

/** 판정 분포·표에 쓰는 단계 순서 */
export const HOME_LEVELS = [
    { key: 'safe', label: '안정', color: '#34d399' },
    { key: 'proper', label: '적정', color: '#818cf8' },
    { key: 'hope', label: '소신', color: '#fbbf24' },
    { key: 'challenge', label: '어려움', color: '#fb7185' },
    { key: 'insufficient', label: '판단 근거 부족', color: '#94a3b8' },
    { key: 'unknown', label: '기준 없음', color: '#cbd5e1' },
    { key: 'none', label: '원서 미입력', color: '#e2e8f0' }
];

function officialCutoffs(resp) {
    return (resp?.items || []).map((item) => ({
        schoolName: item.schoolName || '',
        department: item.department || '',
        track: item.track || '일반전형',
        minValue: Number(item.minAcceptedScore || item.minValue || 0),
        year: item.admissionYear || item.year || 0
    })).filter((c) => c.minValue > 0 && !c.schoolName.includes('청량고'));
}

/** 학교·전형(·학과)에 맞는 가장 최근 합격선. 학과 기준이 없으면 학교 전체 기준. */
function pickCutoff(cutoffs, schoolName, track, department) {
    const school = normalizeSchoolName(schoolName);
    const candidates = cutoffs.filter((c) => normalizeSchoolName(c.schoolName) === school && isSameTrack(c.track, track) && Number(c.minValue) > 0);
    if (!candidates.length) return null;
    const dept = normalizeDept(department || '');
    const isWhole = (c) => !c.department || ['공통', '전체', '학교 전체'].includes(c.department);
    const byYear = (a, b) => Number(b.year || 0) - Number(a.year || 0);
    const deptMatches = dept ? candidates.filter((c) => normalizeDept(c.department) === dept).sort(byYear) : [];
    return deptMatches[0] || candidates.filter(isWhole).sort(byYear)[0] || candidates.sort(byYear)[0];
}

function pickWish(apps) {
    if (!apps.length) return null;
    const ranked = [...apps].sort((a, b) => {
        const done = Number(RESULT_STATUSES.has(a.status)) - Number(RESULT_STATUSES.has(b.status));
        if (done) return done;
        return (CATEGORY_ORDER[a.category] ?? 9) - (CATEGORY_ORDER[b.category] ?? 9);
    });
    return ranked[0];
}

function judgeWish(full, wish, cutoffs) {
    if (!wish) return { level: 'none', label: '원서 미입력' };
    if (wish.category === 'general') {
        const g = judgeGeneralPercentile(full?.generalHSPercentile);
        // 후기 일반고는 석차백분율 3단계(안정·경계·주의)를 대시보드 단계에 맞춰 둔다.
        const map = { safe: 'safe', proper: 'hope', challenge: 'challenge', unknown: 'unknown' };
        return { level: map[g.level] || 'unknown', label: g.label === '자료 없음' ? '기준 없음' : g.label };
    }
    const result = (full?.schoolResults || []).find((r) =>
        normalizeSchoolName(r.schoolName) === normalizeSchoolName(wish.schoolName) && isSameTrack(r.trackName, wish.track));
    if (!result) return { level: 'unknown', label: '기준 없음' };
    const department = (wish.preferences || [])[0] || '';
    const cutoff = pickCutoff(cutoffs, wish.schoolName, wish.track, department);
    if (!cutoff) return { level: 'unknown', label: '기준 없음', score: Number(result.totalScore) };
    const judged = judgeScore({
        score: Number(result.totalScore), cutoff: cutoff.minValue, totalMax: result.totalMax,
        schoolName: result.schoolName, track: result.trackName, source: `${cutoff.year || ''} 합격선`,
        year: cutoff.year, department: cutoff.department
    });
    return { level: judged.level, label: judged.label, score: Number(result.totalScore), cutoff: cutoff.minValue };
}

export function wishLabel(wish) {
    if (!wish) return '';
    if (wish.category === 'general') return '후기 일반고';
    const dept = (wish.preferences || [])[0];
    return `${wish.schoolName || ''} ${wish.track || ''}${dept ? ` · ${dept}` : ''}`.trim();
}

/**
 * @param {number[]} classes 볼 학급 번호
 * @returns {Promise<{admissionYear:number, students:object[], cutoffCount:number}>}
 */
export async function loadHomeData(classes) {
    const App = window.go.main.App;
    const [config, records, dbCutoffs, officialResp] = await Promise.all([
        App.GetSchoolConfig().catch(() => null),
        App.GetSchoolApplicationRecords().catch(() => []),
        App.GetCutoffs().catch(() => []),
        App.GetOfficialAdmissionData().catch(() => null)
    ]);
    const admissionYear = resolveAdmissionYear(config);
    const cutoffs = [...(dbCutoffs || []), ...officialCutoffs(officialResp)];
    const perClass = await Promise.all(classes.map(async (classNum) => {
        const [full, counsel] = await Promise.all([
            App.GetClassFullGrades(classNum).catch(() => []),
            App.GetClassCounselingSummary(classNum).catch(() => ({}))
        ]);
        return { classNum, full: full || [], counsel: counsel || {} };
    }));

    const appsByStudent = new Map();
    (records || []).filter((r) => !admissionYear || !r.admissionYear || r.admissionYear === admissionYear).forEach((r) => {
        const key = `${r.classNum}|${r.studentNum}|${r.studentName}`;
        if (!appsByStudent.has(key)) appsByStudent.set(key, []);
        appsByStudent.get(key).push(r);
    });

    const students = perClass.flatMap(({ classNum, full, counsel }) => full.map((s) => {
        const apps = appsByStudent.get(`${classNum}|${s.studentNum}|${s.name}`) || [];
        const wish = pickWish(apps);
        const lastCounsel = counsel[`${s.studentNum}|${s.name}`] || counsel[s.studentNum] || '';
        return {
            classNum,
            studentNum: String(s.studentNum),
            name: s.name || '',
            apps,
            wish,
            judgment: judgeWish(s, wish, cutoffs),
            hasResult: apps.some((a) => RESULT_STATUSES.has(a.status)),
            lastCounsel
        };
    })).sort((a, b) => a.classNum - b.classNum || (parseInt(a.studentNum, 10) || 0) - (parseInt(b.studentNum, 10) || 0));

    return { admissionYear, students, cutoffCount: cutoffs.length };
}

/** 상담이 필요한 학생: 희망 학교 판정이 어려움·판단 근거 부족, 원서 미입력, 내 상담 기록 없음 */
export function counselReasons(student) {
    const reasons = [];
    if (student.judgment.level === 'challenge') reasons.push(`판정 ${student.judgment.label}`);
    if (student.judgment.level === 'insufficient') reasons.push('판단 근거 부족');
    if (student.judgment.level === 'none') reasons.push('원서 미입력');
    if (!student.lastCounsel) reasons.push('내 상담 기록 없음');
    return reasons;
}

export function countByLevel(students) {
    const counts = Object.fromEntries(HOME_LEVELS.map((l) => [l.key, 0]));
    students.forEach((s) => { counts[s.judgment.level] = (counts[s.judgment.level] || 0) + 1; });
    return counts;
}
