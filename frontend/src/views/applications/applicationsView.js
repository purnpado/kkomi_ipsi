// ===== 원서 관리 화면 (app:navigate 'applications') =====
// 학년부장은 전교생(반 고르기), 담임은 우리 반, 진로부장은 조회만. 계획서 docs/application-management-plan.md.
// 탭: 학생별 원서(일반고 일괄 지원·되돌리기) / 학교별 결과 입력 / 일반고 결과 / 전기고 빠른 입력(applicationsQuick.js, 진로부장에게는 없음).
import { app } from '../../core/dom.js';
import { state } from '../../core/store.js';
import { eventBus, EVENTS } from '../../core/eventBus.js';
import { notifyApplicationsChanged, openModal } from '../../core/navigation.js';
import { showModalAlert, showModalConfirm } from '../../core/dialogs.js';
import { escapeHtml } from '../../core/utils.js';
import { admissionLongLabel } from '../../core/admissionYear.js';
import { ScreenLockManager } from '../../core/screenLock.js';
import { STUDENT_FILTERS, loadApplicationsData } from './applicationsData.js';
import { filterStudents, studentsTableHTML } from './applicationsStudents.js';
import { collectAccepted, collectRejected, generalResultsHTML, groupOptions, schoolResultsHTML } from './applicationsResults.js';
import { bindQuickEntry, loadQuickCatalog, quickEntryHTML } from './applicationsQuick.js';
import { displaySchool } from '../../core/schoolName.js';

const TABS = [
    { id: 'students', label: '학생별 원서' },
    { id: 'school', label: '학교별 결과 입력' },
    { id: 'general', label: '일반고 결과' },
    { id: 'quick', label: '전기고 빠른 입력', editOnly: true }
];

const view = { tab: 'students', classNum: 0, filter: 'all', query: '', groupKey: '' };
let data = null;
let unsubscribe = null;

const who = () => {
    const u = state.currentUser || {};
    return { role: u.Role, myClass: u.Role === 'homeroom' ? u.ClassNum : null };
};
const canEdit = () => ['master', 'homeroom'].includes(state.currentUser?.Role);
const scopeClass = () => (who().role === 'homeroom' ? who().myClass : view.classNum);

function visibleStudents() {
    const list = view.classNum && who().role === 'master' ? data.students.filter((s) => s.classNum === view.classNum) : data.students;
    return filterStudents(list, view.filter, view.query);
}

function visibleGroups() {
    if (!view.classNum || who().role !== 'master') return data.groups;
    return data.groups.map((g) => ({ ...g, applicants: g.applicants.filter((a) => a.student.classNum === view.classNum) })).filter((g) => g.applicants.length);
}

function summaryHTML() {
    const s = data.students;
    const none = s.filter((x) => x.apps.length === 0).length;
    const early = s.filter((x) => x.apps.some((a) => a.category !== 'general' && a.category !== 'none')).length;
    return `${s.length}명 · 원서 없음 ${none}명 · 전기고 지원 ${early}명`;
}

function toolbarHTML() {
    const classSelect = who().role === 'master' ? `
        <select id="appsClass" class="input-field py-1.5 text-sm" style="width:auto" aria-label="반 고르기">
            <option value="0">전체 학급</option>
            ${Array.from({ length: data.classCount }, (_, i) => `<option value="${i + 1}" ${view.classNum === i + 1 ? 'selected' : ''}>${i + 1}반</option>`).join('')}
        </select>` : '';
    return `
        <div class="flex flex-wrap items-center gap-2">
            ${TABS.filter((t) => !t.editOnly || canEdit()).map((t) => `<button type="button" class="apps-tab px-4 py-2 rounded-xl text-sm font-bold border ${view.tab === t.id ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-slate-800/60 text-slate-300 border-slate-700 hover:border-indigo-500/60'}" data-tab="${t.id}" style="width:auto">${t.label}</button>`).join('')}
            <span class="flex-1"></span>
            ${classSelect}
        </div>`;
}

function tabBodyHTML() {
    const opts = { showClass: who().role !== 'homeroom', canEdit: canEdit(), year: data.year };
    if (view.tab === 'school') {
        const groups = visibleGroups();
        if (!groups.find((g) => g.key === view.groupKey)) view.groupKey = groups[0]?.key || '';
        return `
            <div class="flex flex-wrap items-center gap-2 mb-4">
                <label class="text-sm text-slate-300 font-semibold" for="appsGroup">학교·전형</label>
                <select id="appsGroup" class="input-field py-1.5 text-sm" style="width:auto">${groupOptions(groups, view.groupKey)}</select>
            </div>
            ${schoolResultsHTML(groups.find((g) => g.key === view.groupKey), opts)}`;
    }
    if (view.tab === 'general') return generalResultsHTML(visibleStudents(), opts);
    if (view.tab === 'quick' && canEdit()) return quickEntryHTML(data);
    return `
        <div class="flex flex-wrap items-center gap-2 mb-3">
            ${STUDENT_FILTERS.map((f) => `<button type="button" class="apps-filter px-3 py-1.5 rounded-full text-xs font-bold border ${view.filter === f.id ? 'bg-indigo-500/20 text-indigo-200 border-indigo-500/50' : 'bg-slate-800/60 text-slate-300 border-slate-700'}" data-filter="${f.id}" style="width:auto">${f.label}</button>`).join('')}
            <input id="appsQuery" type="search" class="input-field py-1.5 text-sm" style="width:200px" placeholder="이름·번호 찾기" value="${escapeHtml(view.query)}">
            <span class="flex-1"></span>
            ${canEdit() ? `
                <button type="button" id="appsBulkGeneral" class="btn-primary text-sm px-4 py-2" style="width:auto">일반고 일괄 지원</button>
                <button type="button" id="appsUndo" class="btn-secondary text-sm px-3 py-2" style="width:auto">방금 일괄 처리 되돌리기</button>` : ''}
        </div>
        <div id="appsTable">${studentsTableHTML(visibleStudents(), opts)}</div>`;
}

function render() {
    app.innerHTML = `
        <div class="w-full max-w-[1500px] mx-auto fade-in">
            <div class="flex flex-wrap items-end justify-between gap-2 mb-4">
                <div>
                    <h1 class="text-2xl font-black text-white">원서 관리</h1>
                    <p class="text-sm text-slate-400 mt-1">${escapeHtml(admissionLongLabel(data.year))} · ${escapeHtml(summaryHTML())}${canEdit() ? '' : ' · 조회 전용'}</p>
                </div>
            </div>
            <div class="mb-4">${toolbarHTML()}</div>
            <section id="appsBody" class="rounded-2xl bg-slate-800/40 border border-slate-700/60 p-5">${tabBodyHTML()}</section>
        </div>`;
    bind();
}

/** 미리보기(apply=false)로 건수를 보여 주고 확인을 받은 뒤 실제로 처리한다. */
async function runBulk(title, call, describe) {
    try {
        const preview = await call(false);
        if (!preview || preview.changed === 0) {
            await showModalAlert('바뀔 원서가 없습니다.', title, 'info');
            return;
        }
        const names = (preview.names || []).slice(0, 12).map(escapeHtml).join(', ');
        const ok = await showModalConfirm({
            title,
            message: `${describe(preview)}<br><span class="text-xs text-slate-400">${names}${preview.changed > 12 ? ' 외' : ''}</span><br><span class="text-xs">잘못 눌렀으면 [방금 일괄 처리 되돌리기]로 되돌릴 수 있습니다.</span>`,
            confirmText: '진행'
        });
        if (!ok) return;
        await call(true);
        notifyApplicationsChanged({ source: 'bulk' });
        await renderApplicationsScreen();
    } catch (err) {
        await showModalAlert(String(err), '처리하지 못했습니다', 'error');
    }
}

function bind() {
    const App = window.go.main.App;
    app.querySelectorAll('.apps-tab').forEach((b) => b.addEventListener('click', () => { view.tab = b.dataset.tab; render(); }));
    app.querySelectorAll('.apps-filter').forEach((b) => b.addEventListener('click', () => { view.filter = b.dataset.filter; render(); }));
    app.querySelector('#appsClass')?.addEventListener('change', (e) => { view.classNum = Number(e.target.value) || 0; render(); });
    app.querySelector('#appsGroup')?.addEventListener('change', (e) => { view.groupKey = e.target.value; render(); });
    const query = app.querySelector('#appsQuery');
    query?.addEventListener('input', () => {
        view.query = query.value;
        const table = app.querySelector('#appsTable');
        if (table) table.innerHTML = studentsTableHTML(visibleStudents(), { showClass: who().role !== 'homeroom', canEdit: canEdit(), year: data.year });
        bindRowButtons();
    });
    bindRowButtons();
    if (view.tab === 'quick' && canEdit()) {
        bindQuickEntry(app.querySelector('#appsBody'), {
            getData: () => data,
            reload: async () => { data = await loadApplicationsData(who()); },
            rerender: render,
            notify: () => notifyApplicationsChanged({ source: 'bulk-quick' }) // 'bulk' 로 시작하면 아래 구독이 화면을 다시 읽지 않는다
        });
    }
    app.querySelector('#appsBulkGeneral')?.addEventListener('click', () => runBulk('일반고 일괄 지원',
        (apply) => App.BulkCreateGeneralApplications(data.year, scopeClass(), apply),
        (p) => `올해 원서가 없는 <strong>${p.changed}명</strong>에게 "후기 일반고 · 지원예정" 원서를 만듭니다.`));
    app.querySelector('#appsUndo')?.addEventListener('click', async () => {
        try {
            if (!(await App.HasUndoableBulk(scopeClass()))) return showModalAlert('되돌릴 일괄 처리가 없습니다.', '되돌리기', 'info');
            if (!(await showModalConfirm({ title: '방금 일괄 처리 되돌리기', message: '가장 최근에 한 일괄 처리(일괄 지원·결과 저장)를 처리 전으로 되돌립니다.', confirmText: '되돌리기' }))) return;
            const n = await App.UndoLastBulkApplications(data.year, scopeClass());
            await showModalAlert(`원서 ${n}건을 처리 전으로 되돌렸습니다.`, '되돌리기', 'success');
            notifyApplicationsChanged({ source: 'bulk-undo' });
            await renderApplicationsScreen();
        } catch (err) {
            await showModalAlert(String(err), '되돌리지 못했습니다', 'error');
        }
    });
    app.querySelector('#appsSaveSchoolResults')?.addEventListener('click', () => {
        const group = visibleGroups().find((g) => g.key === view.groupKey);
        const mode = app.querySelector('input[name="appsResultMode"]:checked')?.value || 'final';
        const accepted = collectAccepted(app);
        runBulk(`${displaySchool(group.schoolName)} 결과 저장`,
            (apply) => App.BulkSetSchoolResults(data.year, scopeClass(), group.category, group.schoolName, group.track, mode, accepted, apply),
            (p) => `${mode === 'first' ? '1차 ' : ''}합격 <strong>${p.accepted}명</strong>, ${mode === 'first' ? '1차 ' : ''}불합격 <strong>${p.rejected}명</strong>으로 저장합니다.${p.removed ? `<br>전기고 합격자 ${p.removed}명의 일반고 원서는 지웁니다(전기고 합격자는 후기고 지원 불가).` : ''}`);
    });
    app.querySelector('#appsSaveGeneralResults')?.addEventListener('click', () => {
        const rejected = collectRejected(app);
        runBulk('일반고 결과 저장',
            (apply) => App.BulkSetGeneralResults(data.year, scopeClass(), rejected, apply),
            (p) => `합격 <strong>${p.accepted}명</strong>, 불합격 <strong>${p.rejected}명</strong>으로 저장합니다.`);
    });
}

function bindRowButtons() {
    app.querySelectorAll('.apps-open-form').forEach((b) => b.addEventListener('click', () => openModal('application', {
        classNum: Number(b.dataset.class), studentNum: b.dataset.num, name: b.dataset.name
    })));
}

export async function renderApplicationsScreen() {
    app.className = 'wide-layout';
    app.innerHTML = '<div class="py-24 text-center text-slate-400"><span class="spinner"></span>원서 자료를 읽는 중…</div>';
    ScreenLockManager.resetTimer();
    [data] = await Promise.all([loadApplicationsData(who()), canEdit() ? loadQuickCatalog() : null]);
    if (state.currentScreen !== 'applications') return;
    render();
    unsubscribe?.();
    unsubscribe = eventBus.on(EVENTS.APPLICATIONS_CHANGED, (detail) => {
        // 원서 입력 창에서 저장하면 다시 읽는다(일괄 처리는 위에서 직접 다시 그림).
        if (state.currentScreen === 'applications' && !String(detail?.source || '').startsWith('bulk')) renderApplicationsScreen();
    });
}
