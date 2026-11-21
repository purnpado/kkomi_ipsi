// ===== 초기 설정: 중학교명 고르기 =====
// 브라우저 기본 목록(datalist)은 한글을 치는 중에는 잘 걸러지지 않고 65개 학교가 한꺼번에 보여서,
// 글자를 칠 때마다(초성·치는 중인 글자 포함) 맞는 학교만 보여 주는 목록으로 바꾼다. 목록에 없는 학교명도 그대로 쓸 수 있다.
import { escapeAttr, escapeHtml } from '../../core/utils.js';
import { matchesSearch, sortByStart } from '../../core/searchMatch.js';

const MAX_ITEMS = 8;
// "중학교"는 모든 학교에 붙어 있어 초성 "ㅈ"·"ㅎ"이 모든 학교에 맞지 않도록 빼고 맞춘다.
const stem = (name) => String(name || '').replace(/\s+/g, '').replace(/중학교$/, '');

/** 입력한 글자에 맞는 학교(첫 글자부터 맞는 학교 먼저, 최대 8개) */
export function findSchools(schools, query) {
    const q = String(query || '').trim();
    if (!q) return [];
    const qStem = stem(q) || q;
    const hits = (schools || []).filter((name) => matchesSearch(stem(name), qStem));
    return sortByStart(hits, qStem, stem).slice(0, MAX_ITEMS);
}

/** 학교명 입력칸 아래 목록을 연결한다. */
export function bindSchoolPicker(input, box, schools) {
    if (!input || !box) return;
    let items = [];
    let focusIndex = -1;

    const close = () => {
        box.classList.add('hidden');
        box.innerHTML = '';
        input.setAttribute('aria-expanded', 'false');
        items = [];
        focusIndex = -1;
    };
    const paintFocus = () => {
        box.querySelectorAll('[role="option"]').forEach((el, i) => {
            const on = i === focusIndex;
            el.classList.toggle('bg-slate-700/70', on);
            el.setAttribute('aria-selected', on ? 'true' : 'false');
            if (on) el.scrollIntoView({ block: 'nearest' });
        });
    };
    const render = () => {
        items = findSchools(schools, input.value);
        focusIndex = -1;
        if (!items.length) return close();
        box.innerHTML = items.map((name, i) => `
            <div role="option" id="schoolOption${i}" aria-selected="false" data-name="${escapeAttr(name)}"
                class="px-3 py-2 rounded-lg text-sm text-slate-200 cursor-pointer hover:bg-slate-700/70">${escapeHtml(name)}</div>`).join('');
        box.classList.remove('hidden');
        input.setAttribute('aria-expanded', 'true');
    };
    const choose = (name) => {
        input.value = name;
        close();
        document.getElementById('schoolNameError')?.classList.remove('show');
    };

    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-controls', box.id);
    input.setAttribute('aria-expanded', 'false');

    input.addEventListener('input', render);
    input.addEventListener('focus', () => { if (input.value.trim()) render(); });
    input.addEventListener('blur', () => setTimeout(close, 120));
    input.addEventListener('keydown', (e) => {
        if (e.isComposing || box.classList.contains('hidden')) return;
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const step = e.key === 'ArrowDown' ? 1 : -1;
            focusIndex = (focusIndex + step + items.length) % items.length;
            paintFocus();
        } else if (e.key === 'Enter' && focusIndex >= 0) {
            e.preventDefault(); // 고른 학교를 넣기만 하고 설정 저장은 하지 않는다
            choose(items[focusIndex]);
        } else if (e.key === 'Escape') {
            close();
        }
    });
    // 누르는 순간 입력칸이 포커스를 잃어 목록이 닫히지 않도록 mousedown 에서 고른다.
    box.addEventListener('mousedown', (e) => {
        const option = e.target.closest('[role="option"]');
        if (!option) return;
        e.preventDefault();
        choose(option.dataset.name);
    });
}
