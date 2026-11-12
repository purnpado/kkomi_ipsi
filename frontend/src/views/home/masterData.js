// ===== 학년부장 대시보드 자료: 학년도 진행표·현황·주의 알림 =====
// 기존 API만 쓴다. 담임 배포·인수인계처럼 기록이 남지 않는 단계는 "직접 확인"으로 둔다.
import { admissionLabel, staleAdmissionYearNotice } from '../../core/admissionYear.js';
import { loadHomeData } from './homeData.js';

const RESULT_STATUSES = new Set(['합격', '불합격', '최종 진학', '최종진학', '미진학']);

function step(id, label, detail, status, action) {
    return { id, label, detail, status, action };
}

/** 단계 목록에서 처음으로 끝나지 않은 단계를 '진행 중'으로 표시한다. */
function markCurrent(steps) {
    const index = steps.findIndex((s) => s.status === 'todo');
    if (index >= 0) steps[index].status = 'now';
    return steps;
}

export async function loadMasterData() {
    const App = window.go.main.App;
    const config = await App.GetSchoolConfig().catch(() => null);
    const classCount = config?.classCount || 0;
    const classes = Array.from({ length: classCount }, (_, i) => i + 1);
    const home = await loadHomeData(classes);
    const year = home.admissionYear;
    const [status, competition, closure, review] = await Promise.all([
        App.GetDataUpdateStatus().catch(() => ({})),
        App.GetCompetitionRecords().catch(() => []),
        App.GetAdmissionClosure(year).catch(() => null),
        App.GetAdmissionClosureReview(year).catch(() => null)
    ]);

    const students = home.students;
    const total = status.totalStudents || students.length;
    const att = status.attendanceCount || 0;
    const vol = status.volunteerCount || 0;
    const classesWithApps = new Set(students.filter((s) => s.apps.length).map((s) => s.classNum));
    const missingClasses = classes.filter((c) => !classesWithApps.has(c));
    const withApps = students.filter((s) => s.apps.length).length;
    const allApps = students.flatMap((s) => s.apps);
    const early = new Set(students.filter((s) => s.apps.some((a) => a.category !== 'general')).map((s) => `${s.classNum}|${s.studentNum}`)).size;
    const late = new Set(students.filter((s) => s.apps.some((a) => a.category === 'general')).map((s) => `${s.classNum}|${s.studentNum}`)).size;
    const resulted = allApps.filter((a) => RESULT_STATUSES.has(a.status)).length;
    const pending = review?.pendingCount ?? (allApps.length - resulted);
    const closed = closure?.status === 'closed';
    const lastYearCompetition = competition.filter((c) => c.admissionYear === year - 1).length;

    const steps = markCurrent([
        step('setup', '초기 설정', `학급 ${classCount}개 · ${admissionLabel(year)}`, 'done', 'settings'),
        step('neis', '나이스 자료 올리기', `교과 ${total} · 출결 ${att} · 봉사 ${vol}명`,
            total > 0 && att > 0 && vol > 0 ? 'done' : 'todo', 'admin'),
        step('basis', '합격선·경쟁률 준비', `합격선 ${home.cutoffCount}건 · ${year - 1} 경쟁률 ${lastYearCompetition}건`,
            home.cutoffCount > 0 ? 'done' : 'todo', 'cutoff'),
        step('deploy', '담임 배포자료', '계정·권한 화면에서 반별로 만듭니다', 'info', 'users'),
        step('collect', '원서 취합', `${classesWithApps.size}/${classCount}반 · 학생 ${withApps}/${students.length}명`,
            classCount > 0 && missingClasses.length === 0 ? 'done' : 'todo', 'patch'),
        step('result', '결과 입력', allApps.length ? `결과 ${resulted}건 · 남은 원서 ${pending}건` : '원서가 들어온 뒤 입력',
            allApps.length > 0 && pending === 0 ? 'done' : 'todo', 'school-summary'),
        step('close', '결과 확정', closed ? `${(closure.closedAt || '').slice(0, 10)} 확정` : '확정하면 익명 기록으로 보관',
            closed ? 'done' : 'todo', 'school-summary'),
        step('handover', '인수인계·관내 공유', '다음 학년도 학년부장·관내 학교에 넘기기', closed ? 'info' : 'todo', 'admin')
    ]);

    const alerts = [];
    const stale = staleAdmissionYearNotice(config?.admissionYear);
    if (stale) alerts.push({ tone: 'amber', title: '고입 연도 확인', detail: stale, action: 'admin' });
    if (total === 0) alerts.push({ tone: 'rose', title: '학생 자료가 없습니다', detail: '나이스 교과 성적 엑셀부터 올리세요.', action: 'admin' });
    else if (att === 0 || vol === 0) alerts.push({ tone: 'amber', title: '출결·봉사 자료가 비어 있습니다', detail: `출결 ${att}명 · 봉사 ${vol}명 — 판정 점수가 낮게 나올 수 있습니다.`, action: 'admin' });
    if (home.cutoffCount === 0) alerts.push({ tone: 'amber', title: '합격선이 없습니다', detail: '판정이 모두 "기준 없음"으로 나옵니다. 커트라인을 등록하거나 지난 학년도 자료를 가져오세요.', action: 'cutoff' });
    if (lastYearCompetition === 0) alerts.push({ tone: 'slate', title: `${year - 1} 고입 공식 경쟁률 미입력`, detail: '요강 모집정원은 채워져 있고 지원자 수만 넣으면 미달 여부를 판정에 함께 표시합니다.', action: 'cutoff' });
    if (classCount > 0 && missingClasses.length > 0 && missingClasses.length < classCount) {
        alerts.push({ tone: 'amber', title: `원서가 없는 반 ${missingClasses.length}곳`, detail: `${missingClasses.join('·')}반 — 담임 취합자료를 받아 병합하세요.`, action: 'patch' });
    }
    if (!closed && resulted > 0 && pending > 0) {
        alerts.push({ tone: 'slate', title: `결과가 없는 원서 ${pending}건`, detail: '결과를 모두 입력한 뒤 [우리 학교 지원현황]에서 결과를 확정합니다.', action: 'school-summary' });
    }

    return {
        year, classCount, steps, alerts, home,
        cards: [
            { label: '학생', value: `${total}명`, note: `출결 ${att} · 봉사 ${vol}명 연동` },
            { label: '원서 취합', value: `${classesWithApps.size}/${classCount}반`, note: missingClasses.length ? `원서 없는 반 ${missingClasses.length}곳` : '모든 반에 원서가 있음' },
            { label: '원서 입력 학생', value: `${withApps}/${students.length}`, note: `전기 ${early} · 후기 ${late}명` },
            { label: '결과', value: closed ? '확정됨' : `${resulted}건 입력`, note: closed ? '익명 기록 보관 완료' : `남은 원서 ${pending}건` }
        ]
    };
}
