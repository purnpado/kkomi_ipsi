// ===== 판정 근거 자료(불합격 사례 수·공식 경쟁률) =====
// 불합격 사례가 없는 "작년 최저 합격점"은 합격선의 상한일 뿐이다. 그보다 낮은 점수를
// "도전"으로 단정하지 않도록, 합격·불합격 사례 수(우리 학교 + 관내 공유)와 학년부장이 입력한
// 공식 경쟁률(모집정원·지원자 수)을 로그인 뒤 한 번 읽어 중앙 저장소에 둔다.
// 판정 규칙 자체는 core/admissionJudgment.js가 이 자료를 읽어 적용한다.
import { patchState } from './store.js';
import { evidenceKey } from './admissionJudgment.js';

function toMap(list, schoolField) {
    const map = new Map();
    (list || []).forEach(item => {
        map.set(evidenceKey(item.admissionYear, item[schoolField], item.department, item.track), item);
    });
    return map;
}

/** 백엔드에서 판정 근거를 다시 읽는다. 실패해도 판정은 기존 방식으로 계속된다. */
export async function loadAdmissionEvidence() {
    const app = window.go?.main?.App;
    const [evidence, competition] = await Promise.all([
        Promise.resolve(app?.GetAdmissionEvidence?.()).catch(() => []),
        Promise.resolve(app?.GetCompetitionRecords?.()).catch(() => [])
    ]);
    patchState({
        admissionEvidence: toMap(evidence, 'highSchool'),
        competitionRecords: toMap(competition, 'schoolName')
    });
}

/** 정원·지원자 수로 만든 경쟁률 요약. 정원이 없으면 null. */
export function competitionSummary(record) {
    const quota = Number(record?.quota) || 0;
    const applicants = Number(record?.applicants) || 0;
    if (quota <= 0) return null;
    const ratio = applicants / quota;
    return { quota, applicants, ratio, underfilled: applicants <= quota, ratioText: `${ratio.toFixed(2)}:1` };
}
