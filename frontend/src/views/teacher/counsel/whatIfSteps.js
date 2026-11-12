// ===== 가정해 보기: 남은 학기 성적별 비교 =====
// 성적이 아직 없는 학기(학기 초면 3-1·3-2, 2학기면 3-2)를 두 단계 내려감 ~ 두 단계 오름으로 바꿔 가며
// 학교별 점수와 판정을 한 표로 보여 준다. "작년 기준으로 이 학교는 남은 학기에 한 단계 올려야 적정" 같은 상담용.
// 결석·봉사 등 다른 가정값은 위 입력칸 값을 그대로 쓴다. 아무것도 저장하지 않는다.
import { escapeHtml } from '../../../core/utils.js';
import { judgeScore, judgmentBadge } from '../../../core/admissionJudgment.js';

const STEPS = [[-2, '두 단계↓'], [-1, '한 단계↓'], [0, '지금과 같음'], [1, '한 단계↑'], [2, '두 단계↑']];

/** @param baselines 학교·전형 → { cutoff, year, department } (상담 화면 학교 카드 기준선) */
export async function renderRemainingStepTable(ctx, container, baseInput, baselines) {
    container.innerHTML = '<div class="p-4 text-center text-slate-300"><span class="spinner"></span> 남은 학기 성적별로 계산하는 중...</div>';
    let results;
    try {
        results = await Promise.all(STEPS.map(([step]) => window.go.main.App.WhatIfStudent(ctx.classNum, String(ctx.studentNum), ctx.name, { ...baseInput, remainingStep: step })));
    } catch (err) {
        container.innerHTML = `<p class="p-3 text-danger font-bold">계산 실패: ${escapeHtml(String(err))}</p>`;
        return;
    }
    const noRemaining = (results[4]?.notes || []).some(n => n.includes('남은 학기 성적 변화는 반영하지 않았습니다'));
    if (noRemaining) {
        container.innerHTML = '<p class="p-3 text-[11px] text-slate-400">성적이 없는 반영 학기(3-1·3-2)가 없어 남은 학기 성적별 비교를 할 수 없습니다.</p>';
        return;
    }
    const general = results.map(r => r?.generalAfter);
    const generalRow = results[0]?.generalMethod !== 'none' ? `
        <tr class="border-b border-slate-700 bg-slate-800/40">
            <td class="p-2 font-bold text-slate-200 whitespace-nowrap">후기 일반고 <span class="text-slate-400 font-normal">총점·석차</span></td>
            ${general.map(g => `<td class="p-2 text-center font-mono whitespace-nowrap">${g ? `${g.total.toFixed(2)}<div class="text-[10px] text-slate-400">${g.rank}등/${g.totalStudents}${results[0].generalMethod === 'estimated' ? '(추정)' : ''}</div>` : '-'}</td>`).join('')}
        </tr>` : '';
    const schoolRows = (results[2]?.schools || []).map((s, idx) => {
        const base = baselines.get(`${s.schoolName}|${s.trackName}`);
        if (!base) return '';
        const cells = results.map(r => {
            const score = r?.schools?.[idx]?.after;
            if (!(score >= 0)) return '<td class="p-2 text-center">-</td>';
            const judged = judgeScore({ score, cutoff: base.cutoff, totalMax: s.totalMax, schoolName: s.schoolName, track: s.trackName, source: `${base.year || ''} 기준선`, year: base.year, department: base.department });
            return `<td class="p-2 text-center whitespace-nowrap"><div class="font-mono text-slate-200">${score.toFixed(2)}</div>${judgmentBadge(judged, { compact: true })}</td>`;
        }).join('');
        return `<tr class="border-b border-slate-800"><td class="p-2 text-slate-200 whitespace-nowrap">${escapeHtml(s.schoolName)} <span class="text-slate-400">${escapeHtml(s.trackName)}</span><div class="text-[10px] text-slate-500">기준선 ${base.cutoff.toFixed(2)}</div></td>${cells}</tr>`;
    }).join('');
    container.innerHTML = `
        <div class="overflow-x-auto">
            <table class="w-full text-xs">
                <thead class="text-text-muted border-b border-slate-700"><tr>
                    <th class="p-2 text-left">남은 학기 성적 →</th>${STEPS.map(([step, label]) => `<th class="p-2 ${step === 0 ? 'text-indigo-300' : ''}">${label}</th>`).join('')}
                </tr></thead>
                <tbody>${generalRow}${schoolRows || '<tr><td colspan="6" class="p-3 text-slate-500">기준선이 있는 전기고가 없습니다.</td></tr>'}</tbody>
            </table>
        </div>
        <p class="text-[10px] text-slate-500 mt-1">${escapeHtml((results[4]?.notes || []).find(n => n.includes('성적이 없어')) || '')} 전기고는 3-2를 반영하지 않아 학기 초가 아니면 변화가 없습니다. 판정은 상담 화면 학교 카드의 직전 1개년 기준선입니다.</p>`;
}
