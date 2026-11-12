// ===== 입시 분석: 학과 지망 전략 =====
// 지난 학년도 학과별로 몇 지망으로 배정된 학생이 몇 명·최저 몇 점이었는지 보여 주고,
// 학생 점수를 넣으면 학과별로 "1지망으로 쓰면 작년 기준 배정되었을지"를 풀어 준다.
// 근거: 정원 총원제로 합격자를 정한 뒤 점수 순으로 선지망부터 학과를 배정하는 방식(마이스터고·특성화고 일반전형).
import { escapeHtml } from '../../core/utils.js';
import { admissionLabel } from '../../core/admissionYear.js';

const fmt = v => (Number(v) > 0 ? Number(v).toFixed(2) : '-');

function rankCell(dept, rank) {
    const r = (dept.byRank || []).filter(x => (rank === 3 ? x.rank >= 3 : x.rank === rank));
    if (r.length === 0) return '<span class="text-slate-600">-</span>';
    const count = r.reduce((s, x) => s + x.count, 0);
    const min = Math.min(...r.map(x => x.minScore).filter(v => v > 0));
    return `<span class="text-white font-bold">${count}명</span> <span class="text-slate-400 font-mono">최저 ${fmt(min)}</span>`;
}

function verdict(dept, score, schoolMin) {
    if (!(score > 0)) return '';
    if (schoolMin > 0 && score < schoolMin) {
        return `<span class="text-rose-300">학교 합격 최저(${fmt(schoolMin)})보다 ${(schoolMin - score).toFixed(2)}점 낮음</span>`;
    }
    if (dept.seatsLeftOver) {
        return '<span class="text-emerald-300">1지망이면 작년 기준 배정(2지망 이하 배정자가 있을 만큼 자리가 남음)</span>';
    }
    if (dept.firstRankMin > 0 && score >= dept.firstRankMin) {
        return `<span class="text-emerald-300">1지망이면 작년 기준 배정(1지망 배정 최저 ${fmt(dept.firstRankMin)} 이상)</span>`;
    }
    if (dept.firstRankMin > 0) {
        return `<span class="text-amber-300">1지망 배정 최저보다 ${(dept.firstRankMin - score).toFixed(2)}점 낮음 → 자리가 남던 학과를 2지망 이하로 함께 쓰는 것을 고려</span>`;
    }
    return '<span class="text-slate-400">작년 이 학과 1지망 배정 기록 없음</span>';
}

function render(container, st, track, score) {
    const isJobTrack = String(track).includes('취업');
    const depts = st.departments || [];
    const rows = depts.map(d => `
        <tr class="border-b border-slate-800">
            <td class="p-2 font-bold text-slate-200 whitespace-nowrap">${escapeHtml(d.department)}</td>
            <td class="p-2 whitespace-nowrap">${rankCell(d, 1)}</td>
            <td class="p-2 whitespace-nowrap">${rankCell(d, 2)}</td>
            <td class="p-2 whitespace-nowrap">${rankCell(d, 3)}</td>
            <td class="p-2 text-center text-rose-300">${d.rejectedFirst || 0}</td>
            <td class="p-2 text-[11px]">${d.seatsLeftOver ? '<span class="text-sky-300">자리 남음</span>' : '<span class="text-slate-500">1지망으로 마감</span>'}</td>
            ${score > 0 ? `<td class="p-2 text-[11px]">${verdict(d, score, st.schoolMin)}</td>` : ''}
        </tr>`).join('');
    container.innerHTML = `
        <div class="p-5 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
                <h4 class="text-sm font-bold text-white">🎯 학과 지망 전략 · ${escapeHtml(st.highSchool)} ${escapeHtml(st.track)} · ${admissionLabel(st.admissionYear)} 결과</h4>
                <label class="flex items-center gap-2 text-xs text-slate-300">학생 점수로 보기
                    <input id="prefScoreInput" type="text" inputmode="decimal" class="input-field py-1 px-2 text-xs text-right w-24" placeholder="예: 251.5" value="${score > 0 ? score : ''}">
                </label>
            </div>
            ${isJobTrack ? '<p class="text-[11px] text-amber-300">취업희망자 특별전형은 한 학과만 지원하므로 지망 순서 전략이 없습니다. 학과별 합격선은 위 통계를 보세요.</p>' : ''}
            ${depts.length === 0 ? '<p class="text-xs text-slate-500">이 학년도 학과별 배정 기록이 없습니다.</p>' : `
            <div class="overflow-x-auto"><table class="w-full text-xs">
                <thead class="text-text-muted border-b border-slate-700"><tr>
                    <th class="p-2 text-left">학과</th><th class="p-2 text-left">1지망 배정</th><th class="p-2 text-left">2지망 배정</th><th class="p-2 text-left">3지망 이하</th>
                    <th class="p-2">1지망 불합격</th><th class="p-2 text-left">작년 상황</th>${score > 0 ? '<th class="p-2 text-left">이 점수라면</th>' : ''}
                </tr></thead>
                <tbody>${rows}</tbody>
            </table></div>
            <p class="text-[10px] text-slate-500">학교 합격 최저 ${fmt(st.schoolMin)}점 · 기록 ${st.records}건(우리 학교 + 관내 공유, 비참여 학교 지원자는 빠짐) · 같은 점수라도 그해 지원자 구성에 따라 배정은 달라집니다.</p>`}
        </div>`;
    const input = container.querySelector('#prefScoreInput');
    input?.addEventListener('change', () => render(container, st, track, parseFloat(input.value) || 0));
}

/** 학과 지망 전략 패널. 후기 일반고는 표시하지 않는다. */
export async function renderPreferencePanel(container, { year, school, track, isGeneral }) {
    if (!container) return;
    if (isGeneral) {
        container.innerHTML = '';
        return;
    }
    const prevScore = parseFloat(container.querySelector('#prefScoreInput')?.value) || 0;
    let st = null;
    try {
        st = await window.go.main.App.GetPreferenceStrategy(year, school, track);
    } catch (err) {
        container.innerHTML = `<p class="text-xs text-rose-300">학과 지망 자료를 불러오지 못했습니다: ${escapeHtml(String(err))}</p>`;
        return;
    }
    if (!st) {
        container.innerHTML = '';
        return;
    }
    render(container, st, track, prevScore);
}
