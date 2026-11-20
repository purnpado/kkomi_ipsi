// ===== 원서 관리: 학교별 결과 입력 · 일반고 결과 탭 =====
// 학교별: 학교·전형을 고르면 지원자 목록 → 합격자만 체크(배정 학과) → [저장: 나머지 불합격].
// 일반고: 일반고 지원자 목록 → 불합격자만 체크 → [저장: 나머지 합격].
import { escapeAttr, escapeHtml } from '../../core/utils.js';
import { transferBadge } from '../../core/transferBadges.js';
import { CATEGORY_LABELS, studentKey } from './applicationsData.js';
import { statusChip } from './applicationsStudents.js';

export function groupOptions(groups, selectedKey) {
    if (!groups.length) return '<option value="">전기고 지원 기록이 없습니다</option>';
    return groups.map((g) => `<option value="${escapeAttr(g.key)}" ${g.key === selectedKey ? 'selected' : ''}>${escapeHtml(`${g.schoolName} · ${g.track || CATEGORY_LABELS[g.category]} (${g.applicants.length}명)`)}</option>`).join('');
}

function nameCell(s, showClass) {
    return `${showClass ? `<span class="text-slate-400 mr-1">${s.classNum}반</span>` : ''}<span class="text-slate-400 num mr-1">${escapeHtml(s.studentNum)}</span><strong class="text-white">${escapeHtml(s.name)}</strong>${transferBadge(s.classNum, s.studentNum, s.name)}`;
}

/** 학교별 결과 입력 영역 HTML */
export function schoolResultsHTML(group, { showClass, canEdit }) {
    if (!group) return '<div class="py-10 text-center text-sm text-slate-400">결과를 넣을 학교·전형을 고르세요.</div>';
    const rows = group.applicants.map(({ student, app }) => {
        const key = studentKey(student.classNum, student.studentNum, student.name);
        const prefs = app.preferences || [];
        const accepted = app.status === '합격' || app.status === '최종 진학';
        return `
            <tr class="border-t border-slate-700/50">
                <td class="py-2 px-2 w-10"><input type="checkbox" class="apps-accept w-4 h-4 cursor-pointer" data-key="${escapeAttr(key)}" ${accepted ? 'checked' : ''} ${canEdit ? '' : 'disabled'} aria-label="${escapeAttr(student.name)} 합격"></td>
                <td class="py-2 px-2 whitespace-nowrap">${nameCell(student, showClass)}</td>
                <td class="py-2 px-2">
                    ${prefs.length ? `<select class="apps-dept input-field py-1 text-xs" data-key="${escapeAttr(key)}" ${canEdit ? '' : 'disabled'} style="width:auto">
                        <option value="">배정 학과 (선택)</option>
                        ${prefs.map((p, i) => `<option value="${escapeAttr(p)}" ${p === app.assignedDepartment ? 'selected' : ''}>${i + 1}지망 · ${escapeHtml(p)}</option>`).join('')}
                    </select>` : '<span class="text-xs text-slate-500">지망 학과 없음</span>'}
                </td>
                <td class="py-2 px-2 whitespace-nowrap">${app.extraRound ? '<span class="text-[11px] font-bold text-amber-300 mr-1">추가모집</span>' : ''}${app.firstStageResult ? `<span class="text-[11px] text-indigo-300 mr-1">1차 ${escapeHtml(app.firstStageResult)}</span>` : ''}${statusChip(app.status)}</td>
            </tr>`;
    }).join('');
    return `
        <div class="flex flex-wrap items-center gap-4 mb-3 text-sm text-slate-300">
            <label class="inline-flex items-center gap-1.5 cursor-pointer"><input type="radio" name="appsResultMode" value="final" checked> 최종 결과(합격·불합격)</label>
            <label class="inline-flex items-center gap-1.5 cursor-pointer"><input type="radio" name="appsResultMode" value="first"> 1차 결과(1차 합격·불합격)</label>
            <span class="text-xs text-slate-400">합격자만 체크하세요. 체크하지 않은 지원자는 불합격으로 저장됩니다.</span>
        </div>
        <div class="overflow-x-auto"><table class="w-full text-sm text-left">
            <thead><tr class="text-xs text-slate-400"><th class="py-2 px-2">합격</th><th class="py-2 px-2">학생</th><th class="py-2 px-2">배정 학과</th><th class="py-2 px-2">지금 상태</th></tr></thead>
            <tbody>${rows}</tbody>
        </table></div>
        ${canEdit ? '<div class="mt-4 flex justify-end"><button type="button" id="appsSaveSchoolResults" class="btn-primary text-sm px-5 py-2.5" style="width:auto">결과 저장 (체크 안 한 지원자는 불합격)</button></div>' : ''}`;
}

/** 학교별 결과 화면에서 체크한 합격자 → { "반|번호|이름": 배정 학과 } */
export function collectAccepted(root) {
    const accepted = {};
    root.querySelectorAll('.apps-accept:checked').forEach((box) => {
        const dept = root.querySelector(`.apps-dept[data-key="${CSS.escape(box.dataset.key)}"]`)?.value || '';
        accepted[box.dataset.key] = dept;
    });
    return accepted;
}

/** 일반고 결과 영역 HTML */
export function generalResultsHTML(students, { showClass, canEdit }) {
    const applicants = students.filter((s) => s.apps.some((a) => a.category === 'general'));
    if (!applicants.length) return '<div class="py-10 text-center text-sm text-slate-400">일반고 원서가 없습니다. [학생별 원서] 탭에서 [일반고 일괄 지원]을 먼저 하세요.</div>';
    const rows = applicants.map((s) => {
        const app = s.apps.find((a) => a.category === 'general');
        return `
            <tr class="border-t border-slate-700/50">
                <td class="py-2 px-2 w-10"><input type="checkbox" class="apps-reject w-4 h-4 cursor-pointer" data-key="${escapeAttr(s.key)}" ${app.status === '불합격' ? 'checked' : ''} ${canEdit ? '' : 'disabled'} aria-label="${escapeAttr(s.name)} 불합격"></td>
                <td class="py-2 px-2 whitespace-nowrap">${nameCell(s, showClass)}</td>
                <td class="py-2 px-2">${statusChip(app.status)}</td>
            </tr>`;
    }).join('');
    return `
        <p class="text-xs text-slate-400 mb-3">후기 발표 뒤 <strong>불합격자만 체크</strong>하고 저장하면 결과가 없는 나머지 일반고 원서는 모두 합격이 됩니다. 이미 합격인 학생을 체크하면 불합격으로 바뀝니다.</p>
        <div class="overflow-x-auto"><table class="w-full text-sm text-left">
            <thead><tr class="text-xs text-slate-400"><th class="py-2 px-2">불합격</th><th class="py-2 px-2">학생</th><th class="py-2 px-2">지금 상태</th></tr></thead>
            <tbody>${rows}</tbody>
        </table></div>
        ${canEdit ? '<div class="mt-4 flex justify-end"><button type="button" id="appsSaveGeneralResults" class="btn-primary text-sm px-5 py-2.5" style="width:auto">결과 저장 (체크 안 한 지원자는 합격)</button></div>' : ''}`;
}

export function collectRejected(root) {
    return [...root.querySelectorAll('.apps-reject:checked')].map((box) => box.dataset.key);
}
