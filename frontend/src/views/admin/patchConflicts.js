// ===== 취합 병합: 원서 확인 목록 =====
// 학년부장 PC가 최종본이다. 담임 취합 파일의 원서를 학생마다 분류(백엔드 PlanPatchApplications)해 보여 주고,
// 학년부장이 골라야 하는 원서(학교·전형을 바꿈·지움·양쪽에서 고침)는 처리 방식을 고르게 한다.
// 성적 수치는 보이지 않는다(학교·전형·상태·배정 학과만).
import { escapeHtml } from '../../core/utils.js';

export const KIND_TEXT = {
    new: '담임이 새로 넣은 원서',
    update: '담임이 고친 원서',
    conflict_edit: '양쪽에서 고친 원서',
    gh_deleted: '학년부장이 지운 원서를 담임이 고침',
    teacher_deleted: '담임이 지운 원서',
    conflict_deleted: '담임이 지웠지만 학년부장이 배포 뒤 고친 원서',
    rename: '담임이 학교·전형을 바꾼 원서',
    rename_conflict: '담임이 학교·전형을 바꿨지만 학년부장이 배포 뒤 옛 원서를 고침',
    suspect: '학교·전형을 바꾼 것으로 보이는 원서(예전 버전 파일)',
    gh_missing: '학년부장 PC에 없는 원서(학년부장이 지웠거나 PC 시계가 다름)',
    new_locked: '이중지원 금지 학생의 새 원서(이미 합격·최종 진학·등록 포기)',
};

export const ACTION_TEXT = {
    apply: '반영',
    skip: '반영하지 않기',
    keep: '학년부장 것 유지',
    teacher: '담임 것으로 바꾸기',
    delete: '지우기',
    replace: '옛 원서를 지우고 새 원서로 바꾸기',
    both: '둘 다 남기기',
};

const CATEGORY_TEXT = { meister: '마이스터고', special: '특성화고', self_foreign: '자사고·외고', general: '후기 일반고', other: '기타', out_province: '타시도 고교', none: '미진학' };

/** 원서 한 건을 한 줄 글로 바꾼다(학교 · 전형 · 상태 · 배정 학과). */
export function describeSummary(summary) {
    if (!summary) return '없음';
    const school = summary.schoolName || CATEGORY_TEXT[summary.category] || summary.category || '';
    const parts = [`${summary.admissionYear || ''} ${school}`.trim()];
    if (summary.track && summary.track !== '해당 없음') parts.push(summary.track);
    if (summary.deleted) return `${parts.join(' · ')} — 지움`;
    if (summary.status) parts.push(summary.status);
    if (summary.assignedDepartment) parts.push(`배정 ${summary.assignedDepartment}`);
    if (summary.extraRound) parts.push('추가모집');
    return parts.join(' · ');
}

/** 학생 한 명의 원서 항목을 바로 반영할 것과 골라야 할 것으로 나눈다. */
export function splitItems(items) {
    const list = Array.isArray(items) ? items : [];
    return { review: list.filter((item) => item.needsReview), plain: list.filter((item) => !item.needsReview) };
}

/** 바로 반영하는 원서를 "새 원서 1건 · 고친 원서 2건"처럼 줄인다. */
export function plainSummaryText(plain) {
    const news = plain.filter((item) => item.kind === 'new').length;
    const updates = plain.filter((item) => item.kind === 'update').length;
    return [news ? `새 원서 ${news}건` : '', updates ? `고친 원서 ${updates}건` : ''].filter(Boolean).join(' · ');
}

function sideHtml(label, summary, tone) {
    return `<div class="patch-side patch-side-${tone}"><span class="patch-side-label">${label}</span><span class="patch-side-value">${escapeHtml(describeSummary(summary))}</span></div>`;
}

function reviewItemHtml(item, studentIndex, itemIndex) {
    const name = `patch-act-${studentIndex}-${itemIndex}`;
    const options = (item.options || []).map((option) => `
        <label class="patch-option"><input type="radio" class="patch-action" name="${name}" data-student="${studentIndex}" data-item="${escapeHtml(item.id)}" value="${option}" ${option === item.default ? 'checked' : ''}>
        ${ACTION_TEXT[option] || option}${option === item.default ? ' <span class="patch-default">기본</span>' : ''}</label>`).join('');
    return `<li class="patch-review">
        <p class="patch-review-title">⚠ ${KIND_TEXT[item.kind] || item.kind}</p>
        <div class="patch-sides">${sideHtml('학년부장 PC (최종본)', item.mine, 'mine')}${sideHtml('담임 파일', item.theirs, 'theirs')}</div>
        <div class="patch-options" role="radiogroup" aria-label="${KIND_TEXT[item.kind] || '원서'} 처리">${options}</div>
    </li>`;
}

/** 학생 줄 아래에 붙는 원서 확인 칸. 보일 것이 없으면 빈 문자열. */
export function applicationItemsHtml(student, studentIndex) {
    const { review, plain } = splitItems(student.applicationItems);
    const notes = [];
    const plainText = plainSummaryText(plain);
    if (plainText) notes.push(`반영: ${plainText}`);
    if (student.keptApplications > 0) notes.push(`담임 파일에 없어 그대로 두는 원서 ${student.keptApplications}건`);
    if (!review.length && !notes.length) return '';
    return `<div class="patch-apps" data-student="${studentIndex}">
        ${notes.length ? `<p class="patch-note">${notes.join(' · ')}</p>` : ''}
        ${review.length ? `<ul class="patch-review-list">${review.map((item, i) => reviewItemHtml(item, studentIndex, i)).join('')}</ul>` : ''}
    </div>`;
}

/** 화면에서 고른 처리를 { 항목 ID: 처리 } 로 모은다. */
export function collectActions(root, studentIndex) {
    const actions = {};
    root.querySelectorAll(`.patch-action[data-student="${studentIndex}"]:checked`).forEach((input) => {
        actions[input.dataset.item] = input.value;
    });
    return actions;
}

/** 미리보기 맨 위 안내(확인 필요 원서 수·예전 버전 파일). */
export function reviewBannerHtml(preview) {
    const parts = [];
    if (preview.reviewCount > 0) {
        parts.push(`<p class="patch-banner-title">확인이 필요한 원서 ${Number(preview.reviewCount)}건</p>
            <p>학년부장 PC가 최종본입니다. 학년부장이 배포한 뒤 고친 원서는 기본으로 학년부장 것을 남기고, 담임이 지우거나 학교·전형을 바꾼 원서는 기본으로 반영합니다. 학생마다 아래에서 바꿀 수 있습니다.</p>`);
    }
    if (preview.legacy && !(preview.formatVersion >= 2)) {
        parts.push('<p>예전 버전에서 만든 담임 파일입니다. 배포 시각이 없어 더 최근에 고친 원서만 반영하고, 학년부장 원서는 지우지 않습니다.</p>');
    } else if (preview.legacy) {
        parts.push('<p>담임이 업데이트 전에 받은 배포자료로 만든 파일이라 배포 시각이 없습니다. 원서마다 고친 시각과 지운 시각을 비교해 분류했습니다.</p>');
    }
    if (preview.skippedApplications > 0) {
        parts.push(`<p>학년부장 PC 것이 최종본이라 건너뛰는 원서 ${Number(preview.skippedApplications)}건(학년부장이 배포 뒤 고치거나 지운 원서, 확정된 학년도 원서).</p>`);
    }
    return parts.length ? `<div class="patch-banner" role="note">${parts.join('')}</div>` : '';
}

/** 일괄 병합 결과의 "확인 필요" 안내. */
export function batchReviewText(result) {
    if (!result || !(result.review > 0)) return '';
    const byClass = Object.entries(result.reviewByClass || {})
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([classNum, count]) => `${classNum}반 ${count}건`).join(', ');
    return `확인이 필요한 원서 ${result.review}건(${byClass})은 학년부장 것을 그대로 두었습니다. [1개 반 상세 검토]로 그 반 파일을 다시 열어 고르세요.`;
}
