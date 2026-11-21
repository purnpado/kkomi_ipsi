// ===== 지원완료로 저장할 때 함께 낼 수 없는 지원희망 원서 정리 =====
// 지원희망은 아직 낸 원서가 아니라서 이중지원 금지로 막지 않는다. 한 원서를 지원완료로 저장하면
// 함께 낼 수 없는 지원희망 원서(예: 특성화고 지원완료 ↔ 마이스터고 지원희망)를 확인받아 지운다(사용자 결정 2026-11-21).
// 어떤 원서가 함께 낼 수 없는지는 백엔드 규칙(application_rounds.go)이 정한다.
import { showModalConfirm } from './dialogs.js';
import { displaySchool } from './schoolName.js';
import { displayTrack } from './utils.js';

const label = (r) => {
    const school = r.category === 'general' ? '후기 일반고' : displaySchool(r.schoolName || '');
    const track = r.category === 'general' || !r.track || r.track === '해당 없음' ? '' : ` ${displayTrack(r.track)}`;
    return `${school}${track}`;
};

/** 저장해도 되면 true(지울 지원희망이 있으면 확인받고 지운 뒤). 사용자가 그만두면 false. */
export async function dropConflictingWishes(record) {
    const App = window.go?.main?.App;
    if (!App?.GetConflictingWishApplications) return true;
    const wishes = await App.GetConflictingWishApplications(record).catch(() => []);
    if (!wishes?.length) return true;
    const ok = await showModalConfirm({
        title: '함께 낼 수 없는 지원희망 원서',
        message: `${label(record)} 원서를 지원완료로 저장하면 아래 지원희망 원서는 함께 낼 수 없습니다(이중지원 금지).\n\n${wishes.map((w) => `· ${label(w)} (지원희망)`).join('\n')}\n\n이 지원희망 원서를 지우고 저장할까요?`,
        confirmText: '지우고 저장',
        type: 'warning'
    });
    if (!ok) return false;
    for (const w of wishes) {
        await App.DeleteStudentApplication(w.classNum, w.studentNum, w.studentName, w.category, w.schoolName, w.track);
    }
    return true;
}
