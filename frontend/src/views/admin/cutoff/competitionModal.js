// ===== 공식 경쟁률(모집정원·지원자 수) 입력 창 — 학년부장 전용 =====
// 고교가 발표한 학교·전형·학과별 모집정원과 지원자 수를 직접 입력한다(자동 수집 없음).
// 판정은 이 값으로만 "미달"과 경쟁률을 표시한다. 우리 자료에 불합격자가 0명이라는 사실만으로는
// 미달인지, 지원자 점수가 모두 높아 다 붙은 것인지 구분할 수 없기 때문이다.
import { escapeHtml, escapeAttr } from '../../../core/utils.js';
import { showModalAlert } from '../../../core/dialogs.js';
import { state } from '../../../core/store.js';
import { evidenceKey } from '../../../core/admissionJudgment.js';
import { loadAdmissionEvidence, competitionSummary } from '../../../core/admissionEvidence.js';
import { admissionOptionLabel } from '../../../core/admissionYear.js';
import { notifyStatsRecalculated } from '../../../core/navigation.js';

const MODAL_ID = 'competitionModal';

/** 학교별로 "학교 전체" 행과 학과 행을 전형마다 만든다. */
function buildRows(ctx) {
    const rows = [];
    (ctx.defaultSchoolSpecs || []).filter(sch => sch.category === 'meister' || sch.category === 'special').forEach(sch => {
        const tracks = [...new Set((sch.items || []).map(it => ctx.normalizeTrack(it.track)).filter(Boolean))];
        const depts = [...new Set((sch.items || []).map(it => ctx.normalizeDept(it.dept)).filter(Boolean))];
        tracks.forEach(track => {
            rows.push({ school: sch.name, categoryLabel: sch.categoryLabel, dept: '', track });
            depts.forEach(dept => rows.push({ school: sch.name, categoryLabel: sch.categoryLabel, dept, track }));
        });
    });
    return rows;
}

function ratioCell(quota, applicants) {
    const summary = competitionSummary({ quota, applicants });
    if (!summary) return '<span class="text-slate-600">-</span>';
    return summary.underfilled
        ? `<span class="text-sky-300 font-bold">미달 ${summary.ratioText}</span>`
        : `<span class="text-amber-300 font-bold">${summary.ratioText}</span>`;
}

function evidenceCell(year, row) {
    const ev = state.admissionEvidence?.get?.(evidenceKey(year, row.school, row.dept, row.track));
    if (!ev) return '<span class="text-slate-600">자료 없음</span>';
    const stage2 = ev.stage2FailCount ? ` · 면접 탈락 ${ev.stage2FailCount}` : '';
    const warn = ev.acceptedCount > 0 && ev.rejectedCount === 0 ? ' <span class="text-amber-300" title="불합격 사례가 없어 합격 최저점이 합격선의 상한일 뿐입니다">⚠</span>' : '';
    return `<span class="text-slate-300">합격 ${ev.acceptedCount} · 불합격 ${ev.rejectedCount}${stage2}</span>${warn}`;
}

function renderBody(modal, ctx, year) {
    const rows = buildRows(ctx);
    const rowsHTML = rows.map((row, idx) => {
        const saved = state.competitionRecords?.get?.(evidenceKey(year, row.school, row.dept, row.track));
        const quota = Number(saved?.quota) || 0;
        const applicants = Number(saved?.applicants) || 0;
        const firstOfSchool = idx === 0 || rows[idx - 1].school !== row.school;
        return `
            <tr class="competition-row border-b border-slate-800 ${firstOfSchool ? 'border-t-2 border-t-slate-600' : ''}"
                data-school="${escapeAttr(row.school)}" data-dept="${escapeAttr(row.dept)}" data-track="${escapeAttr(row.track)}" data-had="${saved ? '1' : ''}">
                <td class="p-2 font-bold text-white whitespace-nowrap">${firstOfSchool ? escapeHtml(row.school) : ''}</td>
                <td class="p-2 text-slate-300">${row.dept ? escapeHtml(row.dept) : '<span class="text-indigo-300 font-bold">학교 전체</span>'}</td>
                <td class="p-2 text-slate-300 whitespace-nowrap">${escapeHtml(row.track)}</td>
                <td class="p-2 text-center"><input type="text" inputmode="numeric" class="competition-quota input-field py-1 px-2 text-xs text-right w-20" value="${quota || ''}" placeholder="정원"></td>
                <td class="p-2 text-center"><input type="text" inputmode="numeric" class="competition-applicants input-field py-1 px-2 text-xs text-right w-20" value="${applicants || ''}" placeholder="지원자"></td>
                <td class="p-2 text-center competition-ratio whitespace-nowrap">${ratioCell(quota, applicants)}</td>
                <td class="p-2 text-[11px] whitespace-nowrap">${evidenceCell(year, row)}</td>
            </tr>`;
    }).join('');

    modal.querySelector('#competitionBody').innerHTML = rows.length ? `
        <table class="w-full text-xs text-left">
            <thead class="sticky top-0 bg-slate-900 text-text-muted font-bold border-b border-slate-700">
                <tr>
                    <th class="p-2">고교</th><th class="p-2">학과</th><th class="p-2">전형</th>
                    <th class="p-2 text-center">모집정원</th><th class="p-2 text-center">지원자 수</th>
                    <th class="p-2 text-center">경쟁률</th><th class="p-2">우리 학교·관내 자료</th>
                </tr>
            </thead>
            <tbody>${rowsHTML}</tbody>
        </table>` : '<p class="p-8 text-center text-slate-400">고교 목록을 불러오지 못했습니다.</p>';

    modal.querySelectorAll('.competition-row').forEach(tr => {
        const update = () => {
            const quota = parseInt(tr.querySelector('.competition-quota').value, 10) || 0;
            const applicants = parseInt(tr.querySelector('.competition-applicants').value, 10) || 0;
            tr.querySelector('.competition-ratio').innerHTML = ratioCell(quota, applicants);
        };
        tr.querySelectorAll('input').forEach(input => input.addEventListener('input', update));
    });
}

function collectRecords(modal, year) {
    const records = [];
    let invalid = false;
    modal.querySelectorAll('.competition-row').forEach(tr => {
        const quotaText = tr.querySelector('.competition-quota').value.trim();
        const applicantsText = tr.querySelector('.competition-applicants').value.trim();
        const isNumber = text => text === '' || /^\d+$/.test(text);
        if (!isNumber(quotaText) || !isNumber(applicantsText)) {
            invalid = true;
            return;
        }
        const quota = parseInt(quotaText, 10) || 0;
        const applicants = parseInt(applicantsText, 10) || 0;
        // 비어 있고 원래 저장값도 없던 행은 보내지 않는다. 원래 있던 값을 지운 행은 0으로 보내 삭제한다.
        if (quota === 0 && applicants === 0 && !tr.dataset.had) return;
        records.push({ admissionYear: year, schoolName: tr.dataset.school, department: tr.dataset.dept, track: tr.dataset.track, quota, applicants });
    });
    return { records, invalid };
}

export async function openCompetitionModal(ctx) {
    document.getElementById(MODAL_ID)?.remove();
    await loadAdmissionEvidence();
    let year = Number(ctx.currentAdmissionYear);

    const modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.className = 'fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-3 md:p-6';
    modal.innerHTML = `
        <div class="glass-card w-full max-w-5xl max-h-[92vh] flex flex-col p-5 md:p-6 rounded-2xl bg-slate-900/98 border border-slate-700 shadow-2xl space-y-3 text-xs">
            <div class="flex items-start justify-between gap-3 border-b border-slate-700/60 pb-3">
                <div>
                    <h3 class="text-lg font-black text-white flex items-center gap-2"><span>📊</span> 공식 경쟁률 입력 (모집정원·지원자 수)</h3>
                    <p class="text-[11px] text-slate-400 mt-1 leading-relaxed">
                        고교가 발표한 값만 입력합니다. 상담 화면은 이 값으로만 <strong class="text-sky-300">미달</strong>과 경쟁률을 표시합니다.<br>
                        우리 자료에 불합격자가 없다는 것만으로는 미달인지, 지원자 점수가 높아 모두 합격한 것인지 알 수 없습니다(⚠ 표시).
                    </p>
                </div>
                <button id="closeCompetitionBtn" class="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 text-lg cursor-pointer">✕</button>
            </div>
            <div class="flex items-center gap-2">
                <label class="font-bold text-indigo-300">📅 고입 연도:</label>
                <select id="competitionYearSelect" class="bg-slate-800 text-white font-bold text-xs px-2.5 py-1 rounded-lg border border-slate-700 outline-none cursor-pointer">
                    ${(ctx.admissionYears || [year]).map(y => `<option value="${y}" ${Number(y) === year ? 'selected' : ''}>${admissionOptionLabel(y)}</option>`).join('')}
                </select>
                <span class="text-[11px] text-slate-400">학과별 값을 모르면 "학교 전체" 행만 입력해도 됩니다. 칸을 비우고 저장하면 지워집니다.</span>
            </div>
            <div id="competitionBody" class="flex-1 overflow-y-auto custom-scrollbar rounded-xl border border-slate-700/60 bg-slate-900/60"></div>
            <div class="flex justify-end gap-2 pt-2 border-t border-slate-700/60">
                <button id="cancelCompetitionBtn" class="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 font-bold px-4 py-2 rounded-xl cursor-pointer">닫기</button>
                <button id="saveCompetitionBtn" class="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-5 py-2 rounded-xl cursor-pointer">💾 경쟁률 저장</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    renderBody(modal, ctx, year);

    const close = () => modal.remove();
    modal.querySelector('#closeCompetitionBtn').addEventListener('click', close);
    modal.querySelector('#cancelCompetitionBtn').addEventListener('click', close);
    modal.querySelector('#competitionYearSelect').addEventListener('change', (e) => {
        year = Number(e.target.value);
        renderBody(modal, ctx, year);
    });
    modal.querySelector('#saveCompetitionBtn').addEventListener('click', async () => {
        const { records, invalid } = collectRecords(modal, year);
        if (invalid) {
            await showModalAlert('모집정원과 지원자 수는 숫자만 입력해 주세요.', '입력 확인', 'warning');
            return;
        }
        try {
            const saved = await window.go.main.App.SaveCompetitionRecords(records);
            await loadAdmissionEvidence();
            notifyStatsRecalculated({ reason: 'competition' });
            renderBody(modal, ctx, year);
            await showModalAlert(`${admissionOptionLabel(year)} 공식 경쟁률 ${saved}건을 저장했습니다.`, '저장 완료', 'success');
        } catch (err) {
            await showModalAlert(`경쟁률 저장 실패: ${err}`, '오류', 'error');
        }
    });
}
