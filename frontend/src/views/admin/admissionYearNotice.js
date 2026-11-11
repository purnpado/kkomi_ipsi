// ===== 학년부장 대시보드: 고입 연도 설정 안내 띠 =====
// 학교 설정의 고입 학년도가 오늘 기준 현재 중3 입시보다 이전이면, 대시보드 상단에 안내를 띄운다.
// 연도는 자동으로 바꾸지 않는다(기존 데이터 보존 원칙). 버튼은 기존 "고입 연도 전환" 기능으로 연결한다.
import { escapeHtml } from '../../core/utils.js';
import { staleAdmissionYearNotice } from '../../core/admissionYear.js';

/**
 * @param {HTMLElement|null} card 대시보드 최상위 카드 요소
 * @param {number} configuredYear 학교 설정의 고입 학년도
 */
export function renderAdmissionYearNotice(card, configuredYear) {
    const message = staleAdmissionYearNotice(configuredYear);
    if (!card || !message) return;
    const notice = document.createElement('div');
    notice.id = 'admissionYearNotice';
    notice.className = 'mb-4 flex items-center justify-between gap-3 flex-wrap rounded-xl border border-amber-400/50 bg-amber-500/10 px-4 py-3 no-print';
    notice.innerHTML = `
        <div class="text-sm text-amber-100">
            <span class="font-bold">📅 고입 연도 확인</span>
            <span class="ml-2">${escapeHtml(message)}</span>
        </div>
        <button type="button" id="admissionYearNoticeBtn" class="text-xs font-bold px-3 py-1.5 rounded-lg border border-amber-400/60 text-amber-200 hover:bg-amber-500/20 cursor-pointer" style="width: auto;">
            고입 연도 전환하기
        </button>
    `;
    card.prepend(notice);
    notice.querySelector('#admissionYearNoticeBtn')?.addEventListener('click', () => {
        document.getElementById('resetYearBtn')?.click();
    });
}
