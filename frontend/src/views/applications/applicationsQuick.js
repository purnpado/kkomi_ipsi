// ===== 원서 관리: 전기고 빠른 입력 탭 =====
// 담임이 말로 알려 준 전기고(마이스터고·특성화고) 원서를 키보드만으로 연달아 넣는다(계획서 3-2단계).
// 학생 찾기(이름·"3-12") → 구분 → 학교 → 전형 → 학과 지망 → 상태(기본 지원완료) → Enter 저장 → 다음 학생.
// 학교·전형은 저장 뒤에도 남겨 같은 학교 지원자를 이어서 넣기 쉽게 한다. 일반고 원서는 건드리지 않는다.
// 추가모집 체크는 학생을 고를 때마다 새로 정한다: 후기 일반고 불합격 학생이면 미리 체크(해제 가능).
// 점수는 원서 입력 창과 같은 산출 점수(GetStudentApplicationScoreSnapshot)를 넣는다.
import { escapeAttr, escapeHtml, displayTrack } from '../../core/utils.js';
import { appLabel } from './applicationsData.js';
import { statusChip } from './applicationsStudents.js';
import { suggestExtraRound } from '../../core/extraRound.js';
import {
    buildQuickRecord, earlySchools, earlyTracks, existingApplication, findStudents,
    preferenceLimit, quickEntryProblem, schoolDepartments
} from './quickEntry.js';
import { findApplicationLock, lockLabel } from '../../core/doubleApply.js';
import { dropConflictingWishes } from '../../core/wishCleanup.js';

const STATUSES = ['지원완료', '지원희망', '합격', '불합격'];
const quick = { student: null, category: 'meister', school: '', track: '', status: '지원완료', extraRound: false, extraSuggested: false, prefs: [], entries: [], catalog: null, rules: null, message: '', tone: '' };

/** 학교 목록·산출 규칙을 한 번만 읽는다. */
export async function loadQuickCatalog() {
    if (quick.catalog) return;
    const App = window.go?.main?.App;
    const [schools, rules] = await Promise.all([
        App?.GetHighSchoolsData?.().catch(() => null),
        App?.GetSchoolRuleList?.().catch(() => [])
    ]);
    quick.catalog = schools?.schools || [];
    quick.rules = rules || [];
}

function options(list, selected, placeholder, label = (v) => v) {
    return `${placeholder ? `<option value="">${placeholder}</option>` : ''}${list.map((v) => `<option value="${escapeAttr(v)}" ${v === selected ? 'selected' : ''}>${escapeHtml(label(v))}</option>`).join('')}`;
}

function departments() {
    return quick.school ? schoolDepartments(quick.catalog, quick.school) : [];
}

function prefsHTML() {
    const depts = departments();
    if (!quick.school) return '<span class="text-xs text-slate-400">학교를 고르면 학과 지망 칸이 나옵니다.</span>';
    if (!depts.length) return '<span class="text-xs text-amber-300">이 학교의 학과 목록이 없습니다. 지망 없이 저장됩니다.</span>';
    const limit = preferenceLimit(quick.category, quick.track, depts.length);
    return Array.from({ length: limit }, (_, i) => `
        <select class="quick-pref input-field py-1.5 text-sm" data-index="${i}" style="width:auto" aria-label="${i + 1}지망 학과">
            ${options(depts, quick.prefs[i] || '', `${i + 1}지망${i === 0 ? '' : ' (선택)'}`)}
        </select>`).join('');
}

function studentHTML(year) {
    if (!quick.student) {
        return `
            <input id="quickStudent" type="search" class="input-field py-2 text-sm" style="width:240px" placeholder="이름 또는 반-번호(예: 3-12)" autocomplete="off" aria-label="학생 찾기">
            <div id="quickSuggest" class="flex flex-wrap gap-1.5"></div>`;
    }
    const s = quick.student;
    const apps = s.apps.filter((a) => a.admissionYear === year);
    return `
        <span class="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-indigo-500/15 border border-indigo-500/40 text-sm font-bold text-white">
            ${s.classNum}반 ${escapeHtml(s.studentNum)}번 ${escapeHtml(s.name)}
            <button type="button" id="quickClearStudent" class="text-xs text-indigo-200 underline" style="width:auto">다른 학생</button>
        </span>
        <span class="text-xs text-slate-400">지금 원서: ${apps.length ? apps.map((a) => `${escapeHtml(appLabel(a))} ${statusChip(a.status)}`).join(' ') : '없음'}</span>
        ${findApplicationLock(s.apps, year) ? `<span class="basis-full text-xs font-bold text-rose-300">⛔ 이중지원 금지: ${escapeHtml(lockLabel(findApplicationLock(s.apps, year)))} — 새 원서는 넣을 수 없습니다(지난 불합격 기록만 가능)</span>` : ''}`;
}

function entriesHTML() {
    if (!quick.entries.length) return '<p class="text-xs text-slate-400">저장한 원서가 여기에 쌓입니다. 잘못 넣었으면 [삭제]로 지우세요.</p>';
    return `<ul class="space-y-1.5">${quick.entries.map((e, i) => `
        <li class="flex flex-wrap items-center gap-2 text-sm">
            <span class="font-bold text-white">${e.record.classNum}반 ${escapeHtml(e.record.studentNum)}번 ${escapeHtml(e.record.studentName)}</span>
            <span class="text-slate-300">${escapeHtml(appLabel(e.record))}${e.record.preferences.length ? ` · ${escapeHtml(e.record.preferences.join(', '))}` : ''}</span>
            ${e.record.extraRound ? '<span class="text-[11px] font-bold text-amber-300">추가모집</span>' : ''}
            ${statusChip(e.record.status)}
            ${e.updated ? '<span class="text-[11px] text-slate-400">기존 원서 고침</span>' : `<button type="button" class="quick-undo text-xs text-rose-300 underline" data-index="${i}" style="width:auto">삭제</button>`}
        </li>`).join('')}</ul>`;
}

export function quickEntryHTML(data) {
    const schools = earlySchools(quick.catalog, quick.category);
    if (!schools.includes(quick.school)) quick.school = '';
    const tracks = quick.school ? earlyTracks(quick.rules, quick.category, quick.school) : [];
    if (!tracks.includes(quick.track)) quick.track = tracks[0] || '';
    const existing = quick.student && quick.school ? existingApplication(quick.student, data.year, quick.category, quick.school, quick.track) : null;
    return `
        <p class="text-xs text-slate-400 mb-3">담임이 알려 준 마이스터고·특성화고 원서를 연달아 넣습니다. <strong>Enter</strong>로 저장하면 다음 학생 찾기로 돌아가고, 학교·전형은 그대로 남습니다. 일반고 원서는 그대로 둡니다.</p>
        <form id="quickForm" class="space-y-3" autocomplete="off">
            <div class="flex flex-wrap items-center gap-2">${studentHTML(data.year)}</div>
            <div class="flex flex-wrap items-center gap-2">
                <select id="quickCategory" class="input-field py-1.5 text-sm" style="width:auto" aria-label="구분">${options(['meister', 'special'], quick.category, '', (v) => (v === 'meister' ? '마이스터고' : '특성화고'))}</select>
                <select id="quickSchool" class="input-field py-1.5 text-sm" style="width:auto" aria-label="지원 학교">${options(schools, quick.school, '학교 선택')}</select>
                <select id="quickTrack" class="input-field py-1.5 text-sm" style="width:auto" aria-label="전형" ${quick.school ? '' : 'disabled'}>${options(tracks, quick.track, '', displayTrack)}</select>
                <select id="quickStatus" class="input-field py-1.5 text-sm" style="width:auto" aria-label="지원 상태">${options(STATUSES, quick.status)}</select>
                <label class="inline-flex items-center gap-1.5 text-sm text-slate-200 cursor-pointer"><input type="checkbox" id="quickExtra" class="w-4 h-4 accent-amber-400" ${quick.extraRound ? 'checked' : ''}> 추가모집</label>
            </div>
            ${quick.student && quick.extraSuggested ? `<p id="quickExtraHint" class="text-xs text-amber-300 ${quick.extraRound ? '' : 'hidden'}">이 학생은 후기 일반고 불합격이라 추가모집으로 미리 체크했습니다. 정규 원서면 체크를 해제하세요.</p>` : ''}
            <div id="quickPrefs" class="flex flex-wrap items-center gap-2">${prefsHTML()}</div>
            ${existing ? '<p class="text-xs text-amber-300">이 학생은 같은 학교·전형 원서가 이미 있습니다. 저장하면 그 원서의 학과·상태를 고칩니다.</p>' : ''}
            <div class="flex flex-wrap items-center gap-3">
                <button type="submit" id="quickSave" class="btn-primary text-sm px-5 py-2" style="width:auto">저장 (Enter)</button>
                <span id="quickMessage" role="status" aria-live="polite" class="text-sm ${quick.tone === 'error' ? 'text-rose-300' : 'text-emerald-300'}">${escapeHtml(quick.message)}</span>
            </div>
        </form>
        <div class="mt-5 pt-4 border-t border-slate-700/60">
            <h3 class="text-sm font-bold text-white mb-2">방금 넣은 원서 <span class="text-xs font-normal text-slate-400">${quick.entries.length}건</span></h3>
            ${entriesHTML()}
        </div>`;
}

/**
 * @param {HTMLElement} root 탭 본문
 * @param {{ getData: () => any, reload: () => Promise<void>, rerender: () => void, notify: () => void }} ctx
 */
export function bindQuickEntry(root, ctx) {
    const App = window.go.main.App;
    const data = () => ctx.getData(); // 저장 뒤 다시 읽은 최신 자료를 쓴다
    const rerender = (focus) => {
        ctx.rerender();
        const el = focus && root.ownerDocument.querySelector(focus);
        el?.focus();
    };
    const pick = (student) => {
        quick.student = student;
        quick.extraSuggested = suggestExtraRound(student.apps, data().year);
        quick.extraRound = quick.extraSuggested;
        quick.message = '';
        rerender(quick.school ? '.quick-pref, #quickSave' : '#quickCategory');
    };
    const input = root.querySelector('#quickStudent');
    if (input) {
        const suggest = root.querySelector('#quickSuggest');
        let hits = [];
        input.addEventListener('input', () => {
            hits = findStudents(data().students, input.value);
            suggest.innerHTML = hits.map((s, i) => `<button type="button" class="quick-hit px-2.5 py-1 rounded-lg text-xs border ${i === 0 ? 'border-indigo-400 text-white bg-indigo-500/20' : 'border-slate-600 text-slate-200'}" data-index="${i}" style="width:auto">${s.classNum}반 ${escapeHtml(s.studentNum)}번 ${escapeHtml(s.name)}${findApplicationLock(s.apps, data().year) ? ` <span class="text-rose-300 font-bold">· ${escapeHtml(findApplicationLock(s.apps, data().year).status === '포기' ? '등록 포기' : '합격')}</span>` : ''}</button>`).join('')
                || (input.value.trim() ? '<span class="text-xs text-slate-400">찾는 학생이 없습니다.</span>' : '');
            suggest.querySelectorAll('.quick-hit').forEach((b) => b.addEventListener('click', () => pick(hits[Number(b.dataset.index)])));
        });
        input.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            if (hits[0]) pick(hits[0]);
        });
        input.focus();
    }
    root.querySelector('#quickClearStudent')?.addEventListener('click', () => { quick.student = null; quick.extraRound = quick.extraSuggested = false; rerender('#quickStudent'); });
    root.querySelector('#quickCategory')?.addEventListener('change', (e) => { quick.category = e.target.value; quick.school = ''; quick.prefs = []; rerender('#quickSchool'); });
    root.querySelector('#quickSchool')?.addEventListener('change', (e) => { quick.school = e.target.value; quick.track = ''; quick.prefs = []; rerender('#quickTrack'); });
    root.querySelector('#quickTrack')?.addEventListener('change', (e) => { quick.track = e.target.value; quick.prefs = quick.prefs.slice(0, 1); rerender('.quick-pref'); });
    root.querySelector('#quickStatus')?.addEventListener('change', (e) => { quick.status = e.target.value; });
    root.querySelector('#quickExtra')?.addEventListener('change', (e) => {
        quick.extraRound = e.target.checked;
        root.querySelector('#quickExtraHint')?.classList.toggle('hidden', !quick.extraRound); // 해제하면 안내도 감춘다
    });
    root.querySelectorAll('.quick-pref').forEach((sel) => sel.addEventListener('change', () => { quick.prefs[Number(sel.dataset.index)] = sel.value; }));

    const form = root.querySelector('#quickForm');
    // 고르기 칸에서도 Enter 로 저장한다(학생 찾기 칸의 Enter 는 학생 고르기).
    form?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.id !== 'quickStudent' && e.target.tagName === 'SELECT') {
            e.preventDefault();
            form.requestSubmit();
        }
    });
    form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const depts = departments();
        const limit = preferenceLimit(quick.category, quick.track, depts.length);
        const problem = quickEntryProblem({ student: quick.student, category: quick.category, schoolName: quick.school, track: quick.track, preferences: quick.prefs.slice(0, limit), departmentCount: depts.length, limit,
            year: data().year, status: quick.status, existing: quick.student ? existingApplication(quick.student, data().year, quick.category, quick.school, quick.track) : null });
        if (problem) {
            quick.message = problem;
            quick.tone = 'error';
            return rerender(quick.student ? '#quickSave' : '#quickStudent');
        }
        const s = quick.student;
        const year = data().year;
        const existing = existingApplication(s, year, quick.category, quick.school, quick.track);
        const snapshot = await App.GetStudentApplicationScoreSnapshot(s.classNum, String(s.studentNum), s.name, quick.category, quick.school, quick.track).catch(() => null);
        const record = buildQuickRecord({ year, student: s, category: quick.category, schoolName: quick.school, track: quick.track, preferences: quick.prefs.slice(0, limit), status: quick.status, extraRound: quick.extraRound, snapshot, existing });
        try {
            if (!(await dropConflictingWishes(record))) {
                quick.message = '저장하지 않았습니다(함께 낼 수 없는 지원희망 원서를 그대로 둠).';
                quick.tone = 'error';
                return rerender('#quickSave');
            }
            await App.SaveStudentApplication(record);
        } catch (err) {
            quick.message = `저장하지 못했습니다: ${err}`;
            quick.tone = 'error';
            return rerender('#quickSave');
        }
        quick.entries.unshift({ record, updated: Boolean(existing) });
        quick.message = `${s.name} 학생 원서를 ${existing ? '고쳤' : '넣었'}습니다.`;
        quick.tone = 'ok';
        quick.student = null;
        quick.prefs = [];
        quick.extraRound = quick.extraSuggested = false;
        rerender('#quickStudent');
        ctx.notify();
        // 다음 학생의 "이미 있는 원서" 확인에 쓰도록 자료만 다시 읽는다(화면은 다시 그리지 않아 입력 중인 내용이 지워지지 않음).
        await ctx.reload();
    });
    root.querySelectorAll('.quick-undo').forEach((b) => b.addEventListener('click', async () => {
        const entry = quick.entries[Number(b.dataset.index)];
        const r = entry.record;
        try {
            await App.DeleteStudentApplication(r.classNum, r.studentNum, r.studentName, r.category, r.schoolName, r.track);
        } catch (err) {
            quick.message = `지우지 못했습니다: ${err}`;
            quick.tone = 'error';
            return rerender();
        }
        quick.entries.splice(Number(b.dataset.index), 1);
        quick.message = `${r.studentName} 학생 원서를 지웠습니다.`;
        quick.tone = 'ok';
        rerender('#quickStudent');
        ctx.notify();
        await ctx.reload();
    }));
}
