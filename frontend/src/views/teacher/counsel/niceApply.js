// 상담 화면 "지원 원서 · 나이스 원서 입력값" 칸.
// 학생이 실제로 지원하는(지원희망·예정·완료·결과) 학교·전형의 원서마다 나이스 원서등록 화면과 같은 대조표를 보여 준다.
// 원서가 없으면 칸을 그리지 않는다. 값과 배치는 백엔드(GetStudentNiceRows)가 산출식이 쓴 값으로 만든다.
import { escapeHtml, displayTrack } from '../../../core/utils.js';
import { renderNiceFormTable } from '../../../core/niceFormTable.js';

const CATEGORY_LABEL = { meister: '마이스터고', special: '특성화고', general: '후기 일반고' };

function rowTitle(row) {
    const school = row.category === 'general' && !row.schoolName ? '후기 일반고' : row.schoolName;
    const track = row.category === 'general' ? '' : displayTrack(row.track);
    return [school, track].filter(Boolean).join(' · ');
}

function rowHTML(row, index) {
    const body = row.niceForm
        ? renderNiceFormTable(row.niceForm)
        : `<p class="nice-apply-note">${escapeHtml(row.note || '나이스 대조표가 없는 전형입니다.')}</p>`;
    return `
        <details class="nice-apply-item" ${index === 0 ? 'open' : ''}>
            <summary>
                <span class="nice-apply-cat">${escapeHtml(CATEGORY_LABEL[row.category] || '기타')}</span>
                <strong>${escapeHtml(rowTitle(row))}</strong>
                <span class="nice-apply-status">${escapeHtml(row.status || '')}</span>
            </summary>
            <div class="nice-apply-body">${body}</div>
        </details>
    `;
}

export async function mountNiceApply(ctx) {
    const mount = ctx.modalEl.querySelector('#niceApplyMount');
    const App = window.go?.main?.App;
    if (!mount || !App?.GetStudentNiceRows) return;
    let rows = [];
    try {
        rows = await App.GetStudentNiceRows(Number(ctx.classNum), String(ctx.studentNum), ctx.name) || [];
    } catch (_) {
        return;
    }
    if (rows.length === 0) return;
    mount.innerHTML = `
        <section class="nice-apply" aria-label="지원 원서 나이스 원서 입력값">
            <h3 class="nice-apply-title">📝 지원 원서 · 나이스 원서 입력값 <span>나이스 원서등록 화면과 줄마다 맞춰 보세요</span></h3>
            ${rows.map(rowHTML).join('')}
        </section>
    `;
}
