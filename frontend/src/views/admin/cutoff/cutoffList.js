// 커트라인 화면 학교 목록: 탭·검색 거르기(다시 그리지 않고 숨기기만 → 입력한 값이 지워지지 않음),
// 학교 줄 펼침 상태 기억, [✏️] 학과·전형 이름 고치기, 저장하지 않은 변경 표시와 떠날 때 확인.
import { showModalConfirm } from '../../../core/dialogs.js';

const ROW_INPUTS = '.cutoff-item-row input:not([type="hidden"])';

/** 저장하지 않은 변경이 있는 줄 수 */
export function dirtyCount() {
    return document.querySelectorAll('.cutoff-item-row.is-dirty').length;
}

export function updateDirtyUI() {
    const n = dirtyCount();
    const badge = document.getElementById('cutoffDirtyCount');
    const note = document.getElementById('cutoffDirtyNote');
    if (badge) {
        badge.textContent = n ? ` (${n})` : '';
        badge.classList.toggle('hidden', !n);
    }
    if (note) {
        note.textContent = n ? `저장하지 않은 변경 ${n}줄 — [저장]을 눌러야 반영됩니다.` : '';
        note.classList.toggle('hidden', !n);
    }
}

export function markRowDirty(tr) {
    tr?.classList.add('is-dirty');
    updateDirtyUI();
}

/** 저장하지 않은 변경이 있으면 버릴지 묻는다. 없거나 버리기로 하면 true. */
export async function confirmDiscard() {
    const n = dirtyCount();
    if (!n) return true;
    const ok = await showModalConfirm({
        title: '저장하지 않은 변경',
        message: `커트라인 ${n}줄을 고쳤지만 아직 저장하지 않았습니다.<br>저장하지 않고 넘어가면 고친 값이 사라집니다.`,
        confirmText: '저장하지 않고 넘어가기',
        type: 'warning',
    });
    if (ok) document.querySelectorAll('.cutoff-item-row.is-dirty').forEach((tr) => tr.classList.remove('is-dirty'));
    return ok;
}

/** 탭·검색 조건에 맞는지(순수 함수: 테스트용) */
export function matchesCutoffFilter(card, tab, keyword) {
    const tabOk = tab === 'all' || card.category === tab;
    const q = String(keyword || '').trim().toLowerCase();
    return tabOk && (!q || card.search.includes(q));
}

export function applyCutoffFilter(ctx) {
    const cards = [...document.querySelectorAll('.cutoff-school')];
    const q = String(ctx.searchKeyword || '').trim().toLowerCase();
    let shown = 0;
    cards.forEach((card) => {
        const ok = matchesCutoffFilter({ category: card.dataset.category, search: card.dataset.search || '' }, ctx.currentTab, q);
        card.hidden = !ok;
        if (ok) shown++;
        if (ok && q) card.open = true; // 검색하면 맞는 학교를 펼쳐 보인다
    });
    const count = document.getElementById('cutoffShownCount');
    if (count) count.textContent = `${shown} / ${cards.length}개 학교`;
    document.getElementById('cutoffNoMatch')?.classList.toggle('hidden', shown > 0 || cards.length === 0);
}

/** [✏️]: 그 줄의 학과·전형 이름을 입력 칸으로 바꾼다. */
export function startRowEdit(tr) {
    const reveal = (input) => {
        if (!input) return;
        input.classList.remove('hidden');
        input.previousElementSibling?.classList.contains('cutoff-text') && input.previousElementSibling.classList.add('hidden');
    };
    reveal(tr.querySelector('.row-track-name'));
    const group = tr.dataset.deptGroup;
    const dept = group ? document.querySelector(`.row-dept-name[data-dept-group="${group}"]`) : tr.querySelector('.row-dept-name');
    reveal(dept);
    (dept || tr.querySelector('.row-track-name'))?.focus();
}

export function bindCutoffList(ctx) {
    ctx.openSchools ??= new Set();
    document.querySelectorAll('.cutoff-school').forEach((card) => card.addEventListener('toggle', () => {
        if (card.open) ctx.openSchools.add(card.dataset.school);
        else ctx.openSchools.delete(card.dataset.school);
    }));
    document.getElementById('cutoffExpandAll')?.addEventListener('click', (e) => {
        const cards = [...document.querySelectorAll('.cutoff-school:not([hidden])')];
        const open = !cards.every((c) => c.open);
        cards.forEach((c) => { c.open = open; });
        e.currentTarget.textContent = open ? '모두 접기' : '모두 펼치기';
    });
    document.querySelectorAll('.btn-edit-row').forEach((btn) => btn.addEventListener('click', () => startRowEdit(btn.closest('tr'))));
    // 칸을 고치면 그 줄을 "저장하지 않은 변경"으로 표시
    document.querySelector('.cutoff-school-list')?.addEventListener('input', (e) => {
        if (e.target.matches(ROW_INPUTS)) markRowDirty(e.target.closest('tr'));
    });
    document.getElementById('goSharedResultsBtn')?.addEventListener('click', () => document.querySelector('#shellNav [data-item="shared"]')?.click());
    applyCutoffFilter(ctx);
    updateDirtyUI();
    installLeaveGuard();
}

// 공통 틀의 메뉴·위쪽 막대·학생 검색으로 다른 화면에 가려 하면, 저장하지 않은 변경이 있을 때 먼저 묻는다.
let guardInstalled = false;
function installLeaveGuard() {
    if (guardInstalled) return;
    guardInstalled = true;
    const LEAVE = '#shellNav button, #shellNav a, header.no-print button, header.no-print a, .shell-search-results button, .shell-search-results a';
    document.addEventListener('click', (e) => {
        const target = e.target.closest?.(LEAVE);
        if (!target || !document.getElementById('saveAllCutoffsBtn') || !dirtyCount()) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        confirmDiscard().then((ok) => { if (ok) target.click(); });
    }, true);
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || e.target?.id !== 'shellSearchInput' || !document.getElementById('saveAllCutoffsBtn') || !dirtyCount()) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        confirmDiscard().then((ok) => { if (ok) e.target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    }, true);
}
