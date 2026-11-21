// ===== 나이스 원서 입력 일람표 (app:navigate 'nice-roster') =====
// 담임이 나이스에서 학생을 한 명씩 넘기며 원서를 쓸 때 옆에 띄워 두거나 인쇄해 줄마다 맞춰 보는 표.
// 마이스터고·특성화고·후기 일반고 원서가 있는 학생(전형별로 표를 나눔), 원서 한 건이 한 줄이다. 값과 칸은 백엔드(GetNiceRoster)가 나이스 화면 배치대로 만든다.
// 열은 대조표의 값 칸 순서(나이스 화면 순서)를 그대로 쓰므로 전형이 늘어도 이 파일은 고치지 않는다.
// 담임은 우리 반, 학년부장·진로부장은 반을 고른다(조회 전용).
import { app } from '../../core/dom.js';
import { state } from '../../core/store.js';
import { escapeAttr, escapeHtml, displayTrack } from '../../core/utils.js';
import { admissionLongLabel } from '../../core/admissionYear.js';
import { printOnly } from '../../print/printEngine.js';
import { ScreenLockManager } from '../../core/screenLock.js';
import { loadNiceUploadLine } from '../../core/niceUploads.js';
import { displaySchool } from '../../core/schoolName.js';

const view = { classNum: 0, classCount: 0, admissionYear: 0, rows: [], uploadLine: '' };
const CATEGORY_LABEL = { meister: '마이스터고', special: '특성화고', general: '후기 일반고' };
// 전형 표 순서: 원서 순서대로 마이스터고 → 특성화고 → 후기 일반고(대조표 종류 이름 기준)
const GROUP_ORDER = { meister: 0, vocational: 1, general: 2 };

const isHomeroom = () => state.currentUser?.Role === 'homeroom';

/** 대조표의 값 칸에서 열 목록을 만든다: [{ group, label }]
 * group 은 학기 이름이나 줄 이름(결석 환산·봉사·행동특성 가산·창체 가산·리더십처럼 뒤에 "1학년"·"1-1" 칸이 이어지는 강조 칸),
 * 최종결석·봉사시수처럼 바로 값이 오는 칸은 group 없이 label 만 둔다. */
function columnsOf(form) {
    const cols = [];
    for (const row of form.rows || []) {
        let head = '';
        let label = '';
        row.forEach((cell, i) => {
            const next = row[i + 1];
            if (cell.kind === 'head' || (cell.kind === 'accent' && next?.kind === 'label')) { head = cell.text; label = ''; return; }
            if (cell.kind !== 'value') { label = cell.text; return; }
            cols.push({ group: head, label });
        });
    }
    return cols;
}

function valuesOf(form) {
    return (form.rows || []).flatMap((row) => row.filter((c) => c.kind === 'value'));
}

function headerHTML(cols) {
    // 1줄: 학기 이름(같은 학기는 묶음), 출결 칸은 두 줄을 합친다. 2줄: 항목 이름
    let top = '';
    let bottom = '';
    for (let i = 0; i < cols.length; i++) {
        const c = cols[i];
        if (!c.group) { top += `<th rowspan="2" scope="col">${escapeHtml(c.label)}</th>`; continue; }
        if (i > 0 && cols[i - 1].group === c.group) continue;
        let span = 1;
        while (i + span < cols.length && cols[i + span].group === c.group) span++;
        top += `<th colspan="${span}" scope="colgroup">${escapeHtml(c.group)}</th>`;
    }
    cols.filter((c) => c.group).forEach((c) => { bottom += `<th scope="col">${escapeHtml(c.label.replace('교과성취점수', '성취점수'))}</th>`; });
    return `<tr><th rowspan="2" scope="col">반</th><th rowspan="2" scope="col">번호</th><th rowspan="2" scope="col">이름</th><th rowspan="2" scope="col">지원 학교 · 전형</th><th rowspan="2" scope="col">상태</th>${top}<th rowspan="2" scope="col">확인</th></tr><tr>${bottom}</tr>`;
}

function rowHTML(row, cols) {
    const values = valuesOf(row.niceForm);
    const warn = (row.niceForm.warnings || []).join(' ');
    const cells = cols.map((c, i) => {
        const v = values[i] || { text: '-' };
        const name = [row.studentName, c.group, c.label].filter(Boolean).join(' ');
        return `<td class="num" aria-label="${escapeAttr(`${name} ${v.text}`)}">${escapeHtml(v.text)}${v.note ? `<span class="nice-note">${escapeHtml(v.note)}</span>` : ''}</td>`;
    }).join('');
    return `<tr>
        <td class="num">${row.classNum}</td><td class="num">${escapeHtml(row.studentNum)}</td><th scope="row">${escapeHtml(row.studentName)}</th>
        <td class="nice-roster-school">${row.category === 'general' ? '후기 일반고' : `${escapeHtml(displaySchool(row.schoolName))} · ${escapeHtml(displayTrack(row.track))}`}</td>
        <td>${escapeHtml(row.status || '')}</td>${cells}
        <td class="nice-roster-check">${warn ? `<span class="nice-warn" title="${escapeAttr(warn)}">⚠ ${escapeHtml(warnShort(row.niceForm.warnings))}</span>` : ''}</td>
    </tr>`;
}

// 확인 칸의 짧은 이유(전체 문장은 마우스를 올리면 보임)
const WARN_SHORT = [['가산점', '가산점 미입력'], ['누적값', '학년별 값 예상'], ['리더십', '리더십 학기'], ['출결', '출결 확인']];
function warnShort(warnings) {
    const labels = (warnings || []).map((w) => (WARN_SHORT.find(([key]) => w.includes(key)) || [null, '확인'])[1]);
    return [...new Set(labels)].join(' · ');
}

// 표 위 안내: 원서마다 다를 수 있다(예: 마이스터고는 학교 요강에 따라 예체능 포함·제외).
// 모든 학교에 같은 안내는 그대로, 일부 학교에만 붙는 안내는 뒤에 그 학교 이름을 붙인다.
function groupNotes(rows) {
    const schoolsOf = new Map();
    const allSchools = new Set(rows.map((r) => displaySchool(r.schoolName) || '후기 일반고'));
    for (const r of rows) {
        for (const n of r.niceForm.notes || []) {
            if (!schoolsOf.has(n)) schoolsOf.set(n, new Set());
            schoolsOf.get(n).add(displaySchool(r.schoolName) || '후기 일반고');
        }
    }
    return [...schoolsOf.entries()].map(([n, set]) => (set.size < allSchools.size ? `${n} (${[...set].join(', ')})` : n));
}

function groupHTML(type, rows) {
    const cols = columnsOf(rows[0].niceForm);
    const title = rows[0].niceForm.title || '';
    const notes = groupNotes(rows).map((n) => `<li>※ ${escapeHtml(n)}</li>`).join('');
    const hints = (rows[0].niceForm.hints || []).map((h) => `<li>${escapeHtml(h)}</li>`).join('');
    const label = CATEGORY_LABEL[rows[0].category] || type;
    return `
        <section class="nice-roster-group">
            <h3>${escapeHtml(label)} — ${escapeHtml(title)} <span>${rows.length}건 · ${escapeHtml(rows[0].niceForm.subtitle || '나이스 원서등록 화면과 같은 순서')}</span></h3>
            ${notes ? `<ul class="nice-form-notes">${notes}</ul>` : ''}
            <div class="nice-roster-scroll"><table class="nice-roster-table">
                <thead>${headerHTML(cols)}</thead>
                <tbody>${rows.map((r) => rowHTML(r, cols)).join('')}</tbody>
            </table></div>
            ${hints ? `<ul class="nice-form-warnings">${hints}</ul>` : ''}
        </section>`;
}

// 대조표가 아직 없는 원서: 이유(전형)별로 묶어 접어 둔다(같은 안내를 학생마다 반복하지 않는다).
function pendingHTML(rows) {
    if (rows.length === 0) return '';
    const byNote = new Map();
    for (const r of rows) {
        const note = r.note || '나이스 대조표가 없는 원서입니다.';
        if (!byNote.has(note)) byNote.set(note, []);
        byNote.get(note).push(r);
    }
    const items = [...byNote.entries()].map(([note, list]) => `
        <details class="nice-roster-pending">
            <summary>${escapeHtml(note)} <span>${list.length}건</span></summary>
            <p>${list.map((r) => `<span class="num">${r.classNum}반 ${escapeHtml(r.studentNum)}번</span> ${escapeHtml(r.studentName)}${r.category === 'general' ? '' : ` (${escapeHtml(displaySchool(r.schoolName))})`}`).join(' · ')}</p>
        </details>`).join('');
    return `
        <section class="nice-roster-group">
            <h3>나이스 대조표 준비 중인 원서 <span>${rows.length}건</span></h3>
            ${items}
        </section>`;
}

function render() {
    const groups = new Map();
    const pending = [];
    for (const row of view.rows) {
        if (!row.niceForm) { pending.push(row); continue; }
        const key = row.niceForm.type;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
    }
    const classOptions = isHomeroom() ? '' : `
        <label class="nice-roster-class">반
            <select id="niceRosterClass" class="input-field">
                <option value="0" ${view.classNum === 0 ? 'selected' : ''}>전교</option>
                ${Array.from({ length: view.classCount }, (_, i) => i + 1).map((n) => `<option value="${n}" ${view.classNum === n ? 'selected' : ''}>${n}반</option>`).join('')}
            </select>
        </label>`;
    const body = view.rows.length === 0
        ? '<p class="nice-roster-empty">올해 원서가 있는 학생이 없습니다. 마이스터고·특성화고·후기 일반고 원서를 입력하면 여기에 학생별 나이스 원서 입력값이 나옵니다.</p>'
        : [...groups.entries()].sort(([a], [b]) => (GROUP_ORDER[a] ?? 9) - (GROUP_ORDER[b] ?? 9))
            .map(([type, rows]) => groupHTML(type, rows)).join('') + pendingHTML(pending);
    app.innerHTML = `
        <div class="nice-roster print-document">
            <div class="nice-roster-head">
                <div>
                    <h2>나이스 원서 입력 일람표</h2>
                    <p>${escapeHtml(admissionLongLabel(view.admissionYear))} · 마이스터고·특성화고·후기 일반고 원서가 있는 학생의 나이스 원서등록 화면 입력값입니다. 나이스에서 학생을 넘기며 줄마다 맞춰 보세요.</p>
                    ${view.uploadLine}
                </div>
                <div class="nice-roster-actions no-print">
                    ${classOptions}
                    <button type="button" id="niceRosterPrint" class="btn-secondary w-auto whitespace-nowrap px-4 py-2 text-sm">🖨 인쇄</button>
                </div>
            </div>
            ${body}
        </div>`;
    app.querySelector('#niceRosterClass')?.addEventListener('change', (e) => {
        view.classNum = Number(e.target.value) || 0;
        load();
    });
    app.querySelector('#niceRosterPrint')?.addEventListener('click', () => printOnly('nice-roster', 'landscape'));
}

async function load() {
    app.innerHTML = '<div class="py-24 text-center text-slate-400"><span class="spinner"></span> 나이스 원서 입력값을 만드는 중…</div>';
    try {
        [view.rows, view.uploadLine] = await Promise.all([
            window.go.main.App.GetNiceRoster(view.classNum).then((r) => r || []),
            loadNiceUploadLine(view.classNum),
        ]);
    } catch (err) {
        app.innerHTML = `<div class="py-24 text-center text-rose-300" role="alert">일람표를 만들지 못했습니다: ${escapeHtml(String(err))}</div>`;
        return;
    }
    if (state.currentScreen !== 'nice-roster') return;
    render();
}

export async function renderNiceRosterScreen(classNum = null) {
    app.className = 'wide-layout';
    ScreenLockManager.resetTimer();
    const config = await window.go.main.App.GetSchoolConfig().catch(() => null);
    view.classCount = Number(config?.classCount) || 0;
    view.admissionYear = Number(config?.admissionYear) || 0;
    view.classNum = isHomeroom() ? Number(state.currentUser.ClassNum) : (Number(classNum) || 0);
    await load();
}
