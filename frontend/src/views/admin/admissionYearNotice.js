// ===== 학년부장 대시보드: 고입 연도 안내 띠와 "고입 연도 변경(학생 자료 보존)" =====
// - 안내 띠: 학교 설정의 고입 학년도가 오늘 기준 현재 중3 입시보다 이전이면 대시보드 상단에 띄운다.
// - 연도 변경: 학교 설정의 고입 학년도만 바꾼다. 학생 성적·출결·봉사·상담·원서 기록은 지우지 않는다.
//   (학생 자료까지 비우는 "새 학년 시작"과는 별개의 기능이다.)
import { escapeHtml } from '../../core/utils.js';
import { showModalAlert, showModalConfirm, showModalPrompt } from '../../core/dialogs.js';
import { navigate } from '../../core/navigation.js';
import {
    admissionLabel,
    admissionLongLabel,
    admissionYearHint,
    currentAdmissionYear,
    staleAdmissionYearNotice
} from '../../core/admissionYear.js';

/**
 * 학교 설정의 고입 학년도만 바꾼다. 성공하면 대시보드를 다시 그린다.
 * @param {string} schoolName 학교명 (대시보드 재표시용)
 * @param {number} configuredYear 현재 학교 설정의 고입 학년도
 */
export async function changeAdmissionYearOnly(schoolName, configuredYear) {
    const suggested = Number(configuredYear) < currentAdmissionYear() ? currentAdmissionYear() : Number(configuredYear) || currentAdmissionYear();
    const input = await showModalPrompt({
        title: '고입 연도 변경 (학생 자료 보존)',
        message: `현재 설정: ${admissionLabel(configuredYear)}\n바꿀 고입 학년도를 입력하세요.\n${admissionYearHint(currentAdmissionYear())}`,
        defaultValue: String(suggested),
        placeholder: String(currentAdmissionYear())
    });
    if (!input) return false;
    const nextYear = parseInt(String(input).trim(), 10);
    if (!Number.isInteger(nextYear) || nextYear < 2000 || nextYear > 2100) {
        await showModalAlert('고입 학년도는 2000~2100 사이의 숫자로 입력해 주세요.', '입력 확인', 'warning');
        return false;
    }
    if (nextYear === Number(configuredYear)) {
        await showModalAlert(`이미 ${admissionLabel(nextYear)}으로 설정되어 있습니다.`, '변경 없음', 'info');
        return false;
    }

    // 기존 원서가 몇 건이나 원래 연도로 남는지 미리 알려 준다(자동으로 옮기지 않음).
    let remaining = 0;
    try {
        const records = await window.go.main.App.GetSchoolApplicationRecords();
        remaining = (records || []).filter(r => Number(r.admissionYear) === Number(configuredYear)).length;
    } catch (_) {}

    const confirmed = await showModalConfirm({
        title: '고입 연도 변경 확인',
        message: `[${admissionLabel(configuredYear)}] → [${admissionLabel(nextYear)}]\n학교 설정의 고입 연도만 바꿉니다.\n\n`
            + '• 학생 성적·출결·봉사·상담·원서 기록은 그대로 보존됩니다.\n'
            + `• 앞으로 새로 입력하는 원서와 입시 확정·관내 공유·통계가 ${admissionLabel(nextYear)} 기준이 됩니다.\n`
            + (remaining > 0 ? `• 이미 저장된 원서 ${remaining}건은 원래 연도(${admissionLabel(configuredYear)})로 남습니다.\n` : '')
            + '\n학생 자료를 비우고 새 학년을 시작하려면 [새 학년 시작] 버튼을 사용하세요.',
        confirmText: '연도만 변경',
        type: 'info'
    });
    if (!confirmed) return false;

    try {
        await window.go.main.App.UpdateAdmissionYear(nextYear);
        await showModalAlert(`${admissionLongLabel(nextYear)}으로 변경했습니다.\n학생 자료는 그대로 보존되었습니다.`, '변경 완료', 'success');
        navigate('admin', { schoolName });
        return true;
    } catch (err) {
        await showModalAlert('고입 연도 변경 실패: ' + err, '오류', 'error');
        return false;
    }
}

/**
 * @param {HTMLElement|null} card 대시보드 최상위 카드 요소
 * @param {number} configuredYear 학교 설정의 고입 학년도
 * @param {string} schoolName 학교명
 */
export function renderAdmissionYearNotice(card, configuredYear, schoolName) {
    document.getElementById('changeAdmissionYearBtn')?.addEventListener('click', () => changeAdmissionYearOnly(schoolName, configuredYear));
    const message = staleAdmissionYearNotice(configuredYear);
    if (!card || !message) return;
    const notice = document.createElement('div');
    notice.id = 'admissionYearNotice';
    notice.className = 'mb-4 flex items-center justify-between gap-3 flex-wrap rounded-xl border border-amber-400/50 bg-amber-500/10 px-4 py-3 no-print';
    notice.innerHTML = `
        <div class="text-sm text-amber-100">
            <span class="font-bold">📅 고입 연도 확인</span>
            <span class="ml-2">${escapeHtml(message)}</span>
            <span class="ml-1 text-xs text-amber-200/80">(학생 자료는 지우지 않습니다)</span>
        </div>
        <button type="button" id="admissionYearNoticeBtn" class="text-xs font-bold px-3 py-1.5 rounded-lg border border-amber-400/60 text-amber-200 hover:bg-amber-500/20 cursor-pointer" style="width: auto;">
            고입 연도만 변경하기
        </button>
    `;
    card.prepend(notice);
    notice.querySelector('#admissionYearNoticeBtn')?.addEventListener('click', () => changeAdmissionYearOnly(schoolName, configuredYear));
}
