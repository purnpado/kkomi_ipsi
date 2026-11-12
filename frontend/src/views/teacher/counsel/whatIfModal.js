// ===== 상담 화면 "가정해 보기" =====
// 남은 학기 성적 변화·앞으로의 결석·추가 봉사·리더십·후기고 가산점을 넣으면 학교별 점수와 판정 변화를
// 보여 준다. 계산은 백엔드(WhatIfStudent)가 실제 산출 규칙으로 하고, 아무것도 저장하지 않는다.
// 판정 기준선은 상담 화면 학교 카드가 지금 쓰는 직전 1개년 기준선을 그대로 쓴다.
import { escapeHtml } from '../../../core/utils.js';
import { judgeScore, judgeRange, judgmentBadge } from '../../../core/admissionJudgment.js';
import { currentAdmissionYear, admissionLabel } from '../../../core/admissionYear.js';
import { renderRemainingStepTable } from './whatIfSteps.js';

const MODAL_ID = 'whatIfModal';

function selectHTML(id, options, selected) {
    return `<select id="${id}" class="bg-slate-800 text-white text-xs font-bold px-2 py-1.5 rounded-lg border border-slate-600 outline-none cursor-pointer">
        ${options.map(([value, label]) => `<option value="${value}" ${String(value) === String(selected) ? 'selected' : ''}>${label}</option>`).join('')}
    </select>`;
}

function numberHTML(id, placeholder) {
    return `<input id="${id}" type="text" inputmode="numeric" class="input-field py-1.5 px-2 text-xs text-right w-20" placeholder="${placeholder}" value="">`;
}

function formHTML(ctx) {
    const d = ctx.data || {};
    const lead = Number(d.leadershipTerms || 0);
    const bonus = (key) => (d.extraData?.[key] ? '받음' : '안 받음');
    const field = (label, control, hint = '') => `
        <label class="flex flex-col gap-1">
            <span class="font-bold text-slate-200">${label}</span>
            ${control}
            ${hint ? `<span class="text-[10px] text-slate-500">${hint}</span>` : ''}
        </label>`;
    return `
        <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
            ${field('남은 학기 성적', selectHTML('wiStep', [[-2, '두 단계 내려감'], [-1, '한 단계 내려감'], [0, '지금과 같음'], [1, '한 단계 오름'], [2, '두 단계 오름']], 0), '성적이 아직 없는 3-1·3-2를 바로 앞 학기 성적에서 바꿔 봄')}
            ${field('앞으로의 미인정 결석', numberHTML('wiAbsence', '0일'), '3학년에 더해짐')}
            ${field('추가 봉사', numberHTML('wiVolunteer', '0시간'), '3학년에 더해짐')}
            ${field('리더십 인정 학기', selectHTML('wiLeader', [[-1, `그대로(${lead}학기)`], [0, '0학기'], [1, '1학기'], [2, '2학기'], [3, '3학기'], [4, '4학기']], -1), '에너지고·현대공고만 반영')}
            ${field('후기고 3학년 창체 가산점', selectHTML('wiChangche', [['keep', `그대로(${bonus('changche_3')})`], ['yes', '받음'], ['no', '안 받음']], 'keep'))}
            ${field('후기고 3학년 행발 가산점', selectHTML('wiHaengbal', [['keep', `그대로(${bonus('haengbal_3')})`], ['yes', '받음'], ['no', '안 받음']], 'keep'))}
        </div>`;
}

function readInput(modal) {
    const num = (id) => Math.max(0, parseInt(modal.querySelector(`#${id}`).value, 10) || 0);
    return {
        remainingStep: Number(modal.querySelector('#wiStep').value) || 0,
        futureAbsence: num('wiAbsence'),
        addVolunteer: num('wiVolunteer'),
        leadershipTerms: Number(modal.querySelector('#wiLeader').value),
        changche3: modal.querySelector('#wiChangche').value,
        haengbal3: modal.querySelector('#wiHaengbal').value
    };
}

/** 상담 화면 학교 카드의 직전 1개년 기준선(학교·전형별) */
function cardBaselines(ctx) {
    const map = new Map();
    ctx.modalEl.querySelectorAll('.school-counsel-card').forEach(card => {
        const deptSel = card.querySelector('.dept-selector');
        const opt = deptSel?.selectedOptions?.[0];
        const cutoff = parseFloat(opt ? deptSel.value : card.dataset.lastCutoff) || 0;
        if (!(cutoff > 0)) return;
        map.set(`${card.dataset.school}|${card.dataset.track}`, {
            cutoff,
            year: Number(opt ? opt.dataset.year : card.dataset.lastYear) || 0,
            department: (opt ? opt.dataset.dept : card.dataset.lastDept) || ''
        });
    });
    return map;
}

const signed = (v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}`;

function schoolRowsHTML(ctx, result) {
    const baselines = cardBaselines(ctx);
    const rows = (result.schools || []).map(s => {
        const base = baselines.get(`${s.schoolName}|${s.trackName}`);
        const diff = s.after - s.before;
        const judge = (score) => base ? judgmentBadge(judgeScore({ score, cutoff: base.cutoff, totalMax: s.totalMax, schoolName: s.schoolName, track: s.trackName, source: `${base.year || ''} 기준선`, year: base.year, department: base.department }), { compact: true }) : '<span class="text-slate-600">기준선 없음</span>';
        return `
            <tr class="border-b border-slate-800 ${Math.abs(diff) >= 0.005 ? 'bg-indigo-950/30' : ''}">
                <td class="p-2 text-slate-200 whitespace-nowrap">${escapeHtml(s.schoolName)} <span class="text-slate-400">${escapeHtml(s.trackName)}</span></td>
                <td class="p-2 text-right font-mono text-slate-300">${s.before.toFixed(2)}</td>
                <td class="p-2 text-right font-mono font-bold text-white">${s.after.toFixed(2)} <span class="text-[10px] ${diff > 0 ? 'text-emerald-300' : diff < 0 ? 'text-rose-300' : 'text-slate-500'}">${Math.abs(diff) >= 0.005 ? signed(diff) : '변화 없음'}</span></td>
                <td class="p-2 text-[10px] text-slate-500 text-right">/${s.totalMax}</td>
                <td class="p-2 whitespace-nowrap">${judge(s.before)} <span class="text-slate-500">→</span> ${judge(s.after)}</td>
            </tr>`;
    }).join('');
    return `
        <table class="w-full text-xs">
            <thead class="text-text-muted border-b border-slate-700"><tr>
                <th class="p-2 text-left">전기고·전형</th><th class="p-2 text-right">지금</th><th class="p-2 text-right">가정</th><th></th><th class="p-2 text-left">판정 (지금 → 가정)</th>
            </tr></thead>
            <tbody>${rows}</tbody>
        </table>`;
}

async function generalHTML(result) {
    if (result.generalMethod === 'none') return '<p class="text-slate-500">후기 일반고 석차를 계산할 자료가 없습니다.</p>';
    const b = result.generalBefore;
    const a = result.generalAfter;
    const year = currentAdmissionYear() - 1;
    let estimate = null;
    try {
        estimate = (await window.go?.main?.App?.GetConsolidatedGeneralCutoff?.(year))?.base || null;
    } catch (_) {
        estimate = null;
    }
    const judge = (g) => {
        if (!(estimate?.acceptedMin > 0)) return '';
        return judgmentBadge(judgeRange({ low: g.base, high: g.high || g.base, cutoff: estimate.acceptedMin, maxRejected: estimate.rejectedMax, totalMax: 200, schoolName: '후기 일반고', track: '후기 일반계고', source: `${admissionLabel(year)} 관내 추정선(기본 지표)` }), { compact: true });
    };
    const line = (label, before, after, digits = 2) => {
        const diff = after - before;
        return `<div class="flex justify-between gap-2"><span class="text-slate-400">${label}</span><span class="font-mono"><span class="text-slate-300">${before.toFixed(digits)}</span> → <strong class="text-white">${after.toFixed(digits)}</strong> ${Math.abs(diff) >= 0.005 ? `<span class="text-[10px] ${diff > 0 ? 'text-emerald-300' : 'text-rose-300'}">${signed(diff)}</span>` : ''}</span></div>`;
    };
    const method = result.generalMethod === 'estimated'
        ? '<span class="text-amber-300">석차는 추정값</span>'
        : '<span class="text-emerald-300">전교생 자료로 다시 계산</span>';
    return `
        <div class="grid md:grid-cols-2 gap-3">
            <div class="space-y-1">
                <div class="flex justify-between gap-2"><span class="text-slate-400">전교 석차 (${a.totalStudents}명)</span><span class="font-mono"><span class="text-slate-300">${b.rank}등</span> → <strong class="text-white">${a.rank}등</strong></span></div>
                ${line('석차백분율(%)', b.percentile, a.percentile)}
                ${line('교과(160)', b.academic, a.academic)}
                ${line('비교과(40)', b.nonAcademic, a.nonAcademic)}
            </div>
            <div class="space-y-1">
                ${line('총점(200)', b.total, a.total)}
                ${line('기본 지표', b.base, a.base)}
                ${line('가산점 모두 받을 때', b.high, a.high)}
                <div class="flex justify-between gap-2 pt-1"><span class="text-slate-400">관내 판정</span><span>${estimate?.acceptedMin > 0 ? `${judge(b)} <span class="text-slate-500">→</span> ${judge(a)}` : `<span class="text-slate-600">${admissionLabel(year)} 관내 공유 자료 없음</span>`}</span></div>
            </div>
        </div>
        <p class="text-[10px] text-slate-500 mt-1">${method} · 다른 학생 성적은 바뀌지 않는다고 봅니다.</p>`;
}

async function runWhatIf(ctx, modal) {
    const out = modal.querySelector('#whatIfResult');
    out.innerHTML = '<div class="p-6 text-center text-slate-300"><span class="spinner"></span> 계산하는 중...</div>';
    try {
        const result = await window.go.main.App.WhatIfStudent(ctx.classNum, String(ctx.studentNum), ctx.name, readInput(modal));
        const notes = (result?.notes || []).map(n => `<li>${escapeHtml(n)}</li>`).join('');
        out.innerHTML = `
            ${notes ? `<ul class="list-disc pl-5 text-[11px] text-amber-200 space-y-0.5">${notes}</ul>` : '<p class="text-[11px] text-slate-400">바꾼 항목이 없습니다. 위에서 가정값을 고른 뒤 다시 계산하세요.</p>'}
            <div class="rounded-xl border border-slate-700/60 bg-slate-900/60 p-3">
                <h4 class="font-bold text-slate-200 mb-2">🏫 후기 일반고</h4>
                ${await generalHTML(result)}
            </div>
            <div class="rounded-xl border border-slate-700/60 bg-slate-900/60 p-2 overflow-x-auto">${schoolRowsHTML(ctx, result)}</div>`;
    } catch (err) {
        out.innerHTML = `<p class="p-4 text-danger font-bold">계산 실패: ${escapeHtml(String(err))}</p>`;
    }
}

export function openWhatIfModal(ctx) {
    document.getElementById(MODAL_ID)?.remove();
    const modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.className = 'fixed inset-0 bg-black/80 backdrop-blur-md z-[60] flex items-center justify-center p-3 md:p-6';
    modal.innerHTML = `
        <div class="glass-card w-full max-w-4xl max-h-[92vh] flex flex-col p-5 md:p-6 rounded-2xl bg-slate-900/98 border border-slate-700 shadow-2xl space-y-3 text-xs">
            <div class="flex items-start justify-between gap-3 border-b border-slate-700/60 pb-3">
                <div>
                    <h3 class="text-lg font-black text-white">🔮 가정해 보기 · ${escapeHtml(ctx.name)}</h3>
                    <p class="text-[11px] text-slate-400 mt-0.5">가정값으로 다시 계산만 하고 <strong class="text-slate-200">아무것도 저장하지 않습니다.</strong> 판정 기준선은 상담 화면 학교 카드의 직전 1개년 기준선입니다.</p>
                </div>
                <button id="closeWhatIfBtn" class="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 text-lg cursor-pointer">✕</button>
            </div>
            ${formHTML(ctx)}
            <div class="flex justify-end gap-2">
                <button id="runStepTableBtn" class="bg-slate-700 hover:bg-slate-600 text-white font-bold px-4 py-2 rounded-xl cursor-pointer" title="남은 학기 성적을 두 단계 내려감~두 단계 오름으로 바꿔 가며 한 표로 비교합니다">📊 남은 학기 성적별 비교</button>
                <button id="runWhatIfBtn" class="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-5 py-2 rounded-xl cursor-pointer">계산하기</button>
            </div>
            <div id="whatIfResult" class="flex-1 overflow-y-auto custom-scrollbar space-y-3"></div>
        </div>`;
    document.body.appendChild(modal);
    const close = () => {
        modal.remove();
        document.removeEventListener('keydown', onKey, true);
    };
    const onKey = (e) => {
        if (e.key === 'Escape') {
            e.stopPropagation();
            close();
        }
    };
    document.addEventListener('keydown', onKey, true);
    modal.querySelector('#closeWhatIfBtn').addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    modal.querySelector('#runWhatIfBtn').addEventListener('click', () => runWhatIf(ctx, modal));
    modal.querySelector('#runStepTableBtn').addEventListener('click', () => {
        const out = modal.querySelector('#whatIfResult');
        out.innerHTML = '<div class="rounded-xl border border-slate-700/60 bg-slate-900/60 p-3"><h4 class="font-bold text-slate-200 mb-2">📊 남은 학기 성적별 비교</h4><div id="whatIfStepTable"></div></div>';
        renderRemainingStepTable(ctx, out.querySelector('#whatIfStepTable'), readInput(modal), cardBaselines(ctx));
    });
}
