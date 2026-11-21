// 원서 입력 창: 마이스터고·특성화고는 학교·전형을 고르면, 후기 일반고는 구분만 고르면 그 자리에서 나이스 원서 입력값 대조표를 보여 준다.
// (상담 화면에 있던 "지원 원서 · 나이스 원서 입력값" 칸을 옮겼다. 원서 전체는 나이스 원서 입력 일람표에서 본다.)
// 값과 배치는 백엔드(GetApplicationNiceRow)가 산출식이 쓴 값으로 만든다. 가산점 줄은 상담 화면에서 체크한 값이다.
import { escapeHtml, displayTrack } from '../../core/utils.js';
import { renderNiceFormTable } from '../../core/niceFormTable.js';
import { loadNiceUploadLine } from '../../core/niceUploads.js';
import { displaySchool } from '../../core/schoolName.js';

/** 원서 입력 창의 대조표 자리. */
export const NICE_PREVIEW_SLOT = '<div id="appNicePreview" class="md:col-span-2 hidden" aria-live="polite"></div>';

/** 대조표를 보일 원서인지(후기 일반고, 또는 마이스터고·특성화고 + 학교·전형을 고름). */
export function isNicePreviewTarget(category, schoolName, track) {
    if (category === 'general') return true;
    return ['special', 'meister'].includes(category) && Boolean(String(schoolName || '').trim()) && schoolName !== '__custom_school__' && Boolean(String(track || '').trim());
}

let requestSeq = 0;

export async function refreshNicePreview(ctx, category, schoolName, track) {
    const slot = ctx.modal?.querySelector('#appNicePreview');
    if (!slot) return;
    const seq = ++requestSeq;
    const App = window.go?.main?.App;
    if (!isNicePreviewTarget(category, schoolName, track) || !App?.GetApplicationNiceRow) {
        slot.classList.add('hidden');
        slot.innerHTML = '';
        return;
    }
    slot.classList.remove('hidden');
    slot.innerHTML = '<p class="nice-apply-note">나이스 원서 입력값을 불러오는 중…</p>';
    let row = null;
    let uploadLine = '';
    try {
        [row, uploadLine] = await Promise.all([
            App.GetApplicationNiceRow(Number(ctx.classNum), String(ctx.studentNum), ctx.name, category, schoolName, track),
            loadNiceUploadLine(ctx.classNum),
        ]);
    } catch (_) {
        row = null;
    }
    // 학교를 빨리 바꾸면 앞서 부른 값이 늦게 와도 덮어쓰지 않는다.
    if (seq !== requestSeq || !document.body.contains(slot)) return;
    const title = category === 'general' ? '후기 일반고' : `${escapeHtml(displaySchool(schoolName))} · ${escapeHtml(displayTrack(track))}`;
    const body = row?.niceForm
        ? `${uploadLine}${renderNiceFormTable(row.niceForm)}`
        : `<p class="nice-apply-note">${escapeHtml(row?.note || '나이스 원서 입력값을 불러오지 못했습니다.')}</p>`;
    slot.innerHTML = `
        <details class="nice-apply-item" open>
            <summary>
                <span class="nice-apply-cat">나이스 대조</span>
                <strong>📝 나이스 원서 입력값 · ${title}</strong>
                <span class="nice-apply-status">나이스 원서등록 화면과 줄마다 맞춰 보세요</span>
            </summary>
            <div class="nice-apply-body">${body}</div>
        </details>`;
}
