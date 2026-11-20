// 상담 화면 "목표 고교별 산출 점수 및 합격 가능성": 학교마다 한 줄 요약(누르면 펼침), 거르기, 바로가기.
// 카드 안 내용·ID(badge_·gauge_·diff_)는 그대로라 판정 기준 탭(baselineControls.js)·관심 담기(wishlist.js)·인쇄가 그대로 동작한다.
import { judgmentBadge } from '../../../core/admissionJudgment.js';

const KIND_FILTERS = [['all', '전체'], ['matched', '관심·지원'], ['meister', '마이스터고'], ['special', '특성화고']];
const LEVEL_FILTERS = [['all', '판정 전체'], ['safe', '🟢 안정'], ['proper', '🔵 적정'], ['hope', '🟠 소신'], ['challenge', '🔴 어려움'], ['insufficient', '❔ 근거 부족'], ['unknown', '기준 없음']];

const fmt = (value) => Number(value).toFixed(2);

/**
 * 학교 이름 맞춰 보기용으로 줄인다. "울산공업고등학교"·"울산공업고"·"울산공고"는 모두 "울산공".
 * (예전에는 "고등학교"를 먼저 지워 "울산공업"과 "울산공"으로 달라져, 지원 원서 학교를 알아보지 못했다.)
 */
export function cleanSchoolName(name) {
    return String(name || '').replace(/\s+/g, '').replace(/고등학교$/, '고').replace(/공업고$/, '공고').replace(/고$/, '');
}

/** 한 줄 요약의 판정·기준선·점수차 칸 HTML. */
export function rowSummaryCells(result, cutoff, score) {
    const hasCutoff = Number(cutoff) > 0;
    const diff = hasCutoff ? Number(score) - Number(cutoff) : null;
    return {
        level: result?.level || 'unknown',
        pill: !result || result.level === 'unknown' ? '<span class="csr-none">기준 없음</span>' : judgmentBadge(result, { compact: true }),
        cut: hasCutoff ? `기준 <b>${fmt(cutoff)}</b>` : '<span class="csr-none">기준선 없음</span>',
        diff: diff === null ? '' : `<b class="${diff >= 0 ? 'csr-up' : 'csr-down'}">${diff >= 0 ? '+' : ''}${fmt(diff)}</b>`,
    };
}

/** 판정 기준 탭·학과를 바꿨을 때 한 줄 요약을 새로 쓴다. */
export function updateRowSummary(card, result, cutoff) {
    if (!card) return;
    const cells = rowSummaryCells(result, cutoff, card.dataset.score);
    card.dataset.level = cells.level;
    const set = (cls, html) => {
        const el = card.querySelector(cls);
        if (el) el.innerHTML = html;
    };
    set('.csr-pill', cells.pill);
    set('.csr-cut', cells.cut);
    set('.csr-diff', cells.diff);
}

/** 학교 목록 위 거르기 줄. */
export function schoolListToolbarHTML() {
    return `<div class="csl-toolbar no-print" role="group" aria-label="학교 목록 거르기">
        <div class="csl-chips">${KIND_FILTERS.map(([value, label], i) => `<button type="button" class="csl-chip${i === 0 ? ' is-on' : ''}" data-kind="${value}" aria-pressed="${i === 0}">${label}</button>`).join('')}</div>
        <select class="csl-level input-field" aria-label="판정으로 거르기">${LEVEL_FILTERS.map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select>
        <span class="csl-count" aria-live="polite"></span>
        <button type="button" class="csl-expand">모두 펼치기</button>
    </div>`;
}

/** 거르기 조건에 맞는지(순수 함수: 테스트용). */
export function matchesFilter(card, kind, level) {
    const kindOk = kind === 'all' || (kind === 'matched' ? card.matched : card.cat === kind);
    const levelOk = level === 'all' || card.level === level;
    return kindOk && levelOk;
}

export function bindSchoolList(ctx) {
    const root = ctx.modalEl;
    const cards = [...root.querySelectorAll('#schoolCardsContainer .school-counsel-card')];
    const toolbar = root.querySelector('.csl-toolbar');
    let kind = 'all';
    let level = 'all';
    const apply = () => {
        let shown = 0;
        cards.forEach((card) => {
            const ok = matchesFilter({ matched: card.dataset.matched === '1', cat: card.dataset.cat, level: card.dataset.level }, kind, level);
            card.hidden = !ok;
            if (ok) shown++;
        });
        const count = toolbar?.querySelector('.csl-count');
        if (count) count.textContent = `${shown} / ${cards.length}개`;
        root.querySelector('#schoolListEmpty')?.classList.toggle('hidden', shown > 0);
    };
    toolbar?.querySelectorAll('.csl-chip').forEach((chip) => chip.addEventListener('click', () => {
        kind = chip.dataset.kind;
        toolbar.querySelectorAll('.csl-chip').forEach((c) => {
            c.classList.toggle('is-on', c === chip);
            c.setAttribute('aria-pressed', String(c === chip));
        });
        apply();
    }));
    toolbar?.querySelector('.csl-level')?.addEventListener('change', (e) => {
        level = e.target.value;
        apply();
    });
    toolbar?.querySelector('.csl-expand')?.addEventListener('click', (e) => {
        const open = !cards.every((card) => card.open || card.hidden);
        cards.forEach((card) => { if (!card.hidden) card.open = open; });
        e.target.textContent = open ? '모두 접기' : '모두 펼치기';
    });
    // 줄 안의 버튼(관심 담기·희망입력)을 눌러도 줄이 펼쳐지거나 접히지 않게 한다.
    cards.forEach((card) => card.querySelector('summary')?.addEventListener('click', (e) => {
        if (e.target.closest('button, select, a')) e.preventDefault();
    }));
    ctx.refreshSchoolFilter = apply;
    apply();

    // 위쪽 고정 줄 바로가기
    root.querySelectorAll('.counsel-nav-btn').forEach((btn) => btn.addEventListener('click', () => {
        const target = root.querySelector(`#${btn.dataset.target}`);
        if (!target) return;
        target.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    }));
}

/** 인쇄 직전: 거르기로 숨긴 줄을 보이고 모두 펼친다. 인쇄가 끝나면 되돌린다. */
export function expandSchoolsForPrint(ctx) {
    const cards = [...ctx.modalEl.querySelectorAll('#schoolCardsContainer .school-counsel-card')];
    const before = cards.map((card) => ({ card, open: card.open, hidden: card.hidden }));
    cards.forEach((card) => { card.open = true; card.hidden = false; });
    window.addEventListener('afterprint', () => {
        before.forEach(({ card, open, hidden }) => { card.open = open; card.hidden = hidden; });
    }, { once: true });
}
