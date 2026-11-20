// ===== 원서 관리: 학생별 원서 탭 =====
// 학생 한 줄에 올해 원서(학교·전형·상태)를 보여 주고, [원서 입력]은 기존 원서 입력 창을 연다.
import { escapeAttr, escapeHtml } from '../../core/utils.js';
import { transferBadge } from '../../core/transferBadges.js';
import { RESULT_STATUSES, STUDENT_FILTERS, appLabel } from './applicationsData.js';
import { findApplicationLock } from '../../core/doubleApply.js';

const STATUS_TONE = {
    합격: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    '최종 진학': 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    불합격: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    지원완료: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
    '지원 완료': 'bg-sky-500/20 text-sky-300 border-sky-500/40'
};

export function statusChip(status) {
    const tone = STATUS_TONE[status] || 'bg-amber-500/15 text-amber-300 border-amber-500/40';
    return `<span class="inline-flex px-2 py-0.5 rounded-full border text-[11px] font-bold whitespace-nowrap ${tone}">${escapeHtml(status || '미입력')}</span>`;
}

function appChips(apps) {
    if (!apps.length) return '<span class="text-xs text-slate-500">원서 없음</span>';
    return apps.map((a) => `
        <span class="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-900/50 border border-slate-700/60 text-xs whitespace-nowrap">
            <span class="text-slate-200 font-semibold">${escapeHtml(appLabel(a))}</span>
            ${a.extraRound ? '<span class="text-[11px] font-bold text-amber-300">추가모집</span>' : ''}
            ${a.firstStageResult && !RESULT_STATUSES.has(a.status) ? `<span class="text-[11px] text-indigo-300">1차 ${escapeHtml(a.firstStageResult)}</span>` : ''}
            ${statusChip(a.status)}
        </span>`).join(' ');
}

export function filterStudents(students, filterId, query) {
    const filter = STUDENT_FILTERS.find((f) => f.id === filterId) || STUDENT_FILTERS[0];
    const q = String(query || '').replace(/\s+/g, '');
    return students.filter((s) => filter.test(s) && (!q || s.name.replace(/\s+/g, '').includes(q) || `${s.classNum}-${s.studentNum}` === q || s.studentNum === q));
}

/** @returns {string} 학생별 원서 표 HTML */
export function studentsTableHTML(students, { showClass, canEdit, year }) {
    if (!students.length) {
        return '<div class="py-10 text-center text-sm text-slate-400">조건에 맞는 학생이 없습니다.</div>';
    }
    const rows = students.map((s) => `
        <tr class="border-t border-slate-700/50 hover:bg-slate-800/50">
            ${showClass ? `<td class="py-2 px-2 text-slate-400 whitespace-nowrap">${s.classNum}반</td>` : ''}
            <td class="py-2 px-2 text-slate-400 num">${escapeHtml(s.studentNum)}</td>
            <td class="py-2 px-2 font-bold text-white whitespace-nowrap">${escapeHtml(s.name)}${transferBadge(s.classNum, s.studentNum, s.name)}</td>
            <td class="py-2 px-2"><div class="flex flex-wrap gap-1.5">${appChips(s.apps)}</div></td>
            <td class="py-2 px-2 text-right">
                <button type="button" class="apps-open-form btn-secondary text-xs px-3 py-1.5 font-bold whitespace-nowrap" style="width:auto"
                    data-class="${s.classNum}" data-num="${escapeAttr(s.studentNum)}" data-name="${escapeAttr(s.name)}">${!canEdit ? '원서 보기' : (findApplicationLock(s.apps, year) ? '원서 보기·결과 고치기' : '원서 입력')}</button>
            </td>
        </tr>`).join('');
    return `
        <div class="overflow-x-auto">
            <table class="w-full text-sm text-left">
                <thead><tr class="text-xs text-slate-400">
                    ${showClass ? '<th class="py-2 px-2 font-semibold whitespace-nowrap">반</th>' : ''}
                    <th class="py-2 px-2 font-semibold whitespace-nowrap">번호</th>
                    <th class="py-2 px-2 font-semibold whitespace-nowrap">이름</th>
                    <th class="py-2 px-2 font-semibold whitespace-nowrap">올해 원서</th>
                    <th class="py-2 px-2"></th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>`;
}
