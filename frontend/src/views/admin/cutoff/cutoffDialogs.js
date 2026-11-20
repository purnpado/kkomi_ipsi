// 커트라인 화면 확인 창: "다른 학년도에서 가져오기" 학년도 고르기, "커트라인 지우기…" 범위 고르기.
// 두 창 모두 [취소]·Esc·바깥 누르기는 아무것도 하지 않는다(예전 지우기 창은 취소가 "해당 연도만 지우기"였다).
import { escapeHtml } from '../../../core/utils.js';

const CONFIRM_ALL_TEXT = '전체 지우기';

function openDialog(innerHTML, onReady) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'fixed inset-0 bg-black/70 z-[70] flex items-center justify-center p-4';
        overlay.innerHTML = `<div class="glass-card cutoff-dialog" role="dialog" aria-modal="true">${innerHTML}</div>`;
        document.body.appendChild(overlay);
        const close = (value) => {
            overlay.remove();
            document.removeEventListener('keydown', onKey, true);
            resolve(value);
        };
        const onKey = (e) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                close(null);
            }
        };
        document.addEventListener('keydown', onKey, true);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });
        overlay.querySelector('[data-cancel]')?.addEventListener('click', () => close(null));
        onReady(overlay, close);
    });
}

/** 가져올 학년도를 고른다. years: [{ year, label }] → 고른 학년도 또는 null */
export function chooseSourceYear(targetLabel, years) {
    return openDialog(`
        <h3 class="cutoff-dialog-title">📋 다른 학년도에서 가져오기</h3>
        <p class="cutoff-dialog-text">고른 학년도의 커트라인을 <strong>${escapeHtml(targetLabel)}</strong> 칸에 채웁니다. 채운 뒤 <strong>[저장]</strong>을 눌러야 반영됩니다.</p>
        <label class="cutoff-dialog-field">가져올 학년도
            <select class="input-field" data-year>${years.map((y) => `<option value="${y.year}">${escapeHtml(y.label)}</option>`).join('')}</select>
        </label>
        <div class="cutoff-dialog-actions"><button type="button" class="cutoff-sub-btn" data-cancel>취소</button><button type="button" class="cutoff-main-btn" data-ok>칸에 채우기</button></div>`,
    (overlay, close) => {
        overlay.querySelector('[data-ok]').addEventListener('click', () => close(Number(overlay.querySelector('[data-year]').value)));
        overlay.querySelector('[data-year]').focus();
    });
}

/** 지울 범위를 고른다 → 'year' | 'all' | null. 5개년 전체는 "전체 지우기"를 직접 써야 한다. */
export function chooseResetScope(yearLabel) {
    return openDialog(`
        <h3 class="cutoff-dialog-title">🗑️ 커트라인 지우기</h3>
        <p class="cutoff-dialog-text">지운 커트라인은 되살릴 수 없습니다. 지울 범위를 고르세요.</p>
        <label class="cutoff-dialog-choice"><input type="radio" name="cutoffResetScope" value="year" checked> <span><strong>${escapeHtml(yearLabel)}</strong>만 지우기</span></label>
        <label class="cutoff-dialog-choice"><input type="radio" name="cutoffResetScope" value="all"> <span><strong>5개년 전체</strong> 커트라인과 고교 발표 자료 지우기</span></label>
        <label class="cutoff-dialog-field hidden" data-all-confirm>확인을 위해 <strong>${CONFIRM_ALL_TEXT}</strong>라고 쓰세요
            <input type="text" class="input-field" data-all-text autocomplete="off">
        </label>
        <div class="cutoff-dialog-actions"><button type="button" class="cutoff-sub-btn" data-cancel>취소</button><button type="button" class="cutoff-danger-btn" data-ok>지우기</button></div>`,
    (overlay, close) => {
        const ok = overlay.querySelector('[data-ok]');
        const confirmBox = overlay.querySelector('[data-all-confirm]');
        const text = overlay.querySelector('[data-all-text]');
        const scope = () => overlay.querySelector('input[name="cutoffResetScope"]:checked').value;
        const refresh = () => {
            const all = scope() === 'all';
            confirmBox.classList.toggle('hidden', !all);
            ok.disabled = all && text.value.trim() !== CONFIRM_ALL_TEXT;
            ok.textContent = all ? '5개년 전체 지우기' : '지우기';
        };
        overlay.querySelectorAll('input[name="cutoffResetScope"]').forEach((r) => r.addEventListener('change', refresh));
        text.addEventListener('input', refresh);
        ok.addEventListener('click', () => { if (!ok.disabled) close(scope()); });
        refresh();
        overlay.querySelector('[data-cancel]').focus();
    });
}
