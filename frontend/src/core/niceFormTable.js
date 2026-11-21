// "나이스 원서 화면 대조" 표: 울산 나이스 원서등록 화면(내신교과성적 및 출결상황 정보)과 같은 칸·같은 순서.
// 배치와 값은 모두 백엔드(internal/calc/nice_form.go)가 산출식이 실제로 쓴 값으로 만들어 내려준다.
// 화면은 받은 줄·칸을 그대로 그리기만 하므로, 전형이 늘어도(마이스터고·일반고) 이 파일은 고치지 않는다.
import { escapeAttr, escapeHtml } from './utils.js';

const CELL_CLASS = {
    head: 'nice-head',
    label: 'nice-label',
    accent: 'nice-label nice-accent',
    value: 'nice-value num'
};

// 화면 읽기: 값 칸마다 "1학년 2학기 교과성취점수 16"처럼 앞의 학기·항목 이름을 붙여 읽게 한다
// (항목 이름 칸에 scope 를 주면 그 줄 오른쪽 값 전체의 이름으로 읽혀 틀린다).
function rowHTML(row) {
    let head = '';
    let label = '';
    return row.map((cell) => {
        const cls = CELL_CLASS[cell.kind] || 'nice-label';
        const note = cell.note ? ` <span class="nice-note">${escapeHtml(cell.note)}</span>` : '';
        if (cell.kind === 'head') head = cell.text;
        if (cell.kind !== 'value') {
            label = cell.kind === 'head' ? '' : cell.text;
            return `<th class="${cls}">${escapeHtml(cell.text)}</th>`;
        }
        const name = [head, label, cell.text, cell.note].filter(Boolean).join(' ');
        return `<td class="${cls}" aria-label="${escapeAttr(name)}">${escapeHtml(cell.text)}${note}</td>`;
    }).join('');
}

let niceFormSeq = 0;

/** 대조표 HTML. 대조표가 없는 전형이면 빈 문자열. 한 화면에 여러 개를 그려도 제목 id 가 겹치지 않는다. */
export function renderNiceFormTable(form) {
    if (!form || !Array.isArray(form.rows) || form.rows.length === 0) return '';
    const notes = (form.notes || []).map(n => `<li>※ ${escapeHtml(n)}</li>`).join('');
    const warnings = [...(form.warnings || []).map(w => `<li class="nice-warn">⚠ ${escapeHtml(w)}</li>`), ...(form.hints || []).map(h => `<li>${escapeHtml(h)}</li>`)].join('');
    const titleId = `niceFormTitle${++niceFormSeq}`;
    return `
        <section class="nice-form" aria-labelledby="${titleId}">
            <div class="nice-form-head">
                <h4 id="${titleId}">${escapeHtml(form.title || '나이스 원서 화면 대조')} <span>${escapeHtml(form.subtitle || '나이스 원서등록 화면과 같은 순서')}</span></h4>
                ${notes ? `<ul class="nice-form-notes">${notes}</ul>` : ''}
            </div>
            <div class="nice-form-scroll">
                <table class="nice-form-table">
                    <tbody>${form.rows.map(row => `<tr>${rowHTML(row)}</tr>`).join('')}</tbody>
                </table>
            </div>
            ${warnings ? `<ul class="nice-form-warnings">${warnings}</ul>` : ''}
        </section>
    `;
}

/** 출결 한 줄 설명: 산출에 쓴 값(마감일 기준 입력이 있으면 그 값). basis 가 없으면 학생 원자료로. */
export function attendanceBasisText(basis, fullStudent) {
    if (basis) {
        const cutoff = basis.cutoffEntered ? `${basis.attendanceCutoff} 기준 입력값` : '나이스 성적 파일 출결';
        const split = basis.splitKnown
            ? `지각 ${basis.lateCount}회 · 조퇴 ${basis.earlyCount}회 · 결과 ${basis.resultCount}회`
            : `지각·조퇴·결과 합 ${basis.lateEtcCount}회`;
        return `최종결석 <strong>${basis.finalAbsenceDays}일</strong> <span class="text-[10px] text-slate-500">(결석 ${basis.absenceDays}일, ${split} · ${cutoff})</span>`;
    }
    const s = fullStudent || {};
    return `미인정 결석 환산 <strong>${s.absenceDays ?? 0}일</strong> <span class="text-[10px] text-slate-500">(결석 ${s.rawAbsenceDays ?? 0}일, 지각 ${s.rawLateCount ?? 0}회 · 조퇴 ${s.rawEarlyCount ?? 0}회 · 결과 ${s.rawResultCount ?? 0}회)</span>`;
}
