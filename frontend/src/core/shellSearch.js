// ===== 위쪽 막대 학생 검색 =====
// 이름·번호(예: 3, 2반 7번 → "2-7")로 찾아 학생 상담 창을 연다.
// 담임은 우리 반만, 학년부장·진로부장은 전 학급을 찾는다. 명단은 처음 검색할 때 한 번 읽어 둔다.
import { navigate } from './navigation.js';
import { state } from './store.js';
import { escapeAttr, escapeHtml } from './utils.js';

const MAX_RESULTS = 12;
let roster = null;
let loading = null;

export function resetShellSearch() {
    roster = null;
    loading = null;
}

async function loadRoster() {
    if (roster) return roster;
    if (loading) return loading;
    loading = (async () => {
        const user = state.currentUser;
        let classes = [];
        if (user?.Role === 'homeroom') {
            classes = [user.ClassNum];
        } else {
            let count = 0;
            try {
                count = (await window.go.main.App.GetSchoolConfig())?.classCount || 0;
            } catch (_) {}
            classes = Array.from({ length: count }, (_, i) => i + 1);
        }
        const lists = await Promise.all(classes.map((classNum) =>
            window.go.main.App.GetClassGrades(classNum)
                .then((students) => (students || []).map((s) => ({ classNum, studentNum: String(s.StudentNum), name: s.Name || '' })))
                .catch(() => [])
        ));
        roster = lists.flat();
        loading = null;
        return roster;
    })();
    return loading;
}

function matches(student, query) {
    const q = query.replace(/\s+/g, '');
    if (!q) return false;
    if (student.name.replace(/\s+/g, '').includes(q)) return true;
    const num = parseInt(student.studentNum, 10);
    const pair = q.match(/^(\d+)[-.반](\d+)번?$/);
    if (pair) return student.classNum === parseInt(pair[1], 10) && num === parseInt(pair[2], 10);
    if (/^\d+$/.test(q)) return num === parseInt(q, 10) || student.studentNum === q;
    return false;
}

function renderResults(box, list, query) {
    if (!query.trim()) {
        box.classList.add('hidden');
        box.innerHTML = '';
        return;
    }
    const found = list.filter((student) => matches(student, query)).slice(0, MAX_RESULTS);
    box.innerHTML = found.length
        ? found.map((s, i) => `
            <button type="button" class="shell-search-item ${i === 0 ? 'is-focus' : ''}" role="option"
                data-class="${s.classNum}" data-num="${escapeAttr(s.studentNum)}" data-name="${escapeAttr(s.name)}">
                <span class="shell-search-name">${escapeHtml(s.name)}</span>
                <span class="shell-search-meta">${s.classNum}반 ${escapeHtml(s.studentNum)}번</span>
            </button>`).join('')
        : '<div class="shell-search-empty">찾는 학생이 없습니다.</div>';
    box.classList.remove('hidden');
}

function openStudent(button) {
    if (!button) return;
    // 상담 화면을 연 뒤에는 검색칸을 비운다(다음 검색을 바로 할 수 있게).
    const input = document.getElementById('shellSearchInput');
    if (input) input.value = '';
    navigate('counsel', {
        schoolName: state.schoolName,
        classNum: parseInt(button.dataset.class, 10),
        studentNum: button.dataset.num,
        name: button.dataset.name
    });
}

export function bindShellSearch() {
    const input = document.getElementById('shellSearchInput');
    const box = document.getElementById('shellSearchResults');
    if (!input || !box) return;

    const update = async () => {
        const query = input.value;
        if (query.trim() && !roster) {
            box.innerHTML = '<div class="shell-search-empty">명단을 읽는 중...</div>';
            box.classList.remove('hidden');
        }
        const list = await loadRoster();
        if (input.value === query) renderResults(box, list, query);
    };

    input.addEventListener('input', update);
    input.addEventListener('focus', () => {
        loadRoster();
        if (input.value.trim()) update();
    });
    input.addEventListener('keydown', (event) => {
        const items = [...box.querySelectorAll('.shell-search-item')];
        const current = items.findIndex((item) => item.classList.contains('is-focus'));
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (!items.length) return;
            const next = (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
            items.forEach((item, i) => item.classList.toggle('is-focus', i === next));
            items[next].scrollIntoView({ block: 'nearest' });
        } else if (event.key === 'Enter') {
            event.preventDefault();
            openStudent(items[current >= 0 ? current : 0]);
            box.classList.add('hidden');
        } else if (event.key === 'Escape') {
            event.stopPropagation();
            input.value = '';
            box.classList.add('hidden');
        }
    });
    box.addEventListener('mousedown', (event) => {
        // 입력칸의 blur 보다 먼저 처리해 결과가 사라지기 전에 연다.
        const button = event.target.closest('.shell-search-item');
        if (!button) return;
        event.preventDefault();
        openStudent(button);
        box.classList.add('hidden');
    });
    input.addEventListener('blur', () => setTimeout(() => box.classList.add('hidden'), 120));
}
