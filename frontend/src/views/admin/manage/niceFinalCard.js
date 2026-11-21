// ===== 나이스 후기 일반고 석차 연명부 올리기·맞춰 보기 (학년부장) =====
// 3학년 2학기 성적이 나오면 나이스가 공식 내신 성적(200점)을 산출한다. 그 결과(석차 연명부 또는 석차백분율산출 엑셀)를 올리면
// 원서대장의 후기 일반고 점수는 나이스 값을 쓰고, 꼬미입시 계산값과 학생마다 맞춰 본다(백엔드 nice_final.go).
import { escapeHtml } from '../../../core/utils.js';
import { showModalAlert, showModalConfirm } from '../../../core/dialogs.js';

const COLS = [
    ['rank', '석차'], ['percentile', '백분율'], ['academic', '교과(160)'], ['attendance', '출석(16)'],
    ['volunteer', '봉사(8)'], ['creative', '창체(8)'], ['behavior', '행발(8)'], ['total', '합계(200)']
];

const fmt = (key, v) => (v === undefined || v === null ? '-' : key === 'rank' ? String(Math.round(v)) : Number(v).toFixed(2));

/** ① 나이스 자료 올리기 아래에 붙는 카드 */
export function niceFinalCardHTML(summary) {
    const has = summary && summary.count > 0;
    const status = has
        ? `<span class="text-emerald-300 font-bold">${summary.count}명 올림</span> · 올린 날 <strong class="num">${escapeHtml(summary.uploadedAt)}</strong>${summary.enrolled ? ` · 재적수 <strong class="num">${summary.enrolled}</strong>` : ''}`
        : '<span class="text-slate-400">아직 없음</span>';
    return `
        <div id="niceFinalCard" class="mt-3 rounded-2xl border ${has ? 'border-emerald-500/40 bg-emerald-950/20' : 'border-slate-700/60 bg-slate-900/40'} p-4">
            <div class="flex flex-wrap items-start justify-between gap-3">
                <div class="min-w-0">
                    <p class="text-base font-bold text-white">4. 후기 일반고 석차 연명부 <span class="text-xs font-normal text-slate-400">(3학년 2학기 성적 산출 뒤)</span></p>
                    <p class="text-xs text-slate-400 mt-1 leading-snug">나이스 고입내신관리의 <strong>석차 연명부</strong> 또는 <strong>석차백분율산출</strong> 엑셀을 올리면 원서대장의 후기 일반고 점수는 나이스 값을 씁니다. 꼬미입시 계산값과 학생마다 맞춰 볼 수 있습니다.</p>
                    <p class="text-xs mt-1">${status}</p>
                </div>
                <div class="flex flex-wrap gap-2">
                    <button id="niceFinalUploadBtn" type="button" class="btn-primary text-xs px-3 py-2 font-bold" style="width:auto">파일 올리기</button>
                    ${has ? '<button id="niceFinalCompareBtn" type="button" class="btn-secondary text-xs px-3 py-2 font-bold" style="width:auto">맞춰 보기</button>' : ''}
                    ${has ? '<button id="niceFinalClearBtn" type="button" class="btn-secondary text-xs px-3 py-2 font-bold text-rose-300" style="width:auto">지우기</button>' : ''}
                </div>
            </div>
            <div id="niceFinalCompare" class="hidden mt-3"></div>
        </div>`;
}

function compareHTML(cmp) {
    const rows = cmp.rows || [];
    const enrolledNote = cmp.summary?.enrolled && cmp.programEnrolled && cmp.summary.enrolled !== cmp.programEnrolled
        ? `<p class="text-xs text-amber-300 mb-2">⚠ 재적수가 다릅니다: 나이스 ${cmp.summary.enrolled}명, 꼬미입시 ${cmp.programEnrolled}명(소인수 학교는 10명으로 보정).</p>` : '';
    const head = COLS.map(([, label]) => `<th colspan="2" scope="colgroup">${label}</th>`).join('');
    const sub = COLS.map(() => '<th scope="col">꼬미입시</th><th scope="col">나이스</th>').join('');
    const body = rows.map((r) => {
        const diffs = new Set(r.diffs || []);
        const cells = COLS.map(([key]) => {
            const cls = diffs.has(key) ? ' class="nice-compare-diff"' : '';
            return `<td${cls}>${fmt(key, r.program?.[key])}</td><td${cls}>${fmt(key, r.nice?.[key])}</td>`;
        }).join('');
        const ok = r.program && r.nice && diffs.size === 0 && !(r.hints || []).length;
        return `<tr><td class="num">${r.classNum}</td><td class="num">${escapeHtml(r.studentNum)}</td><th scope="row">${escapeHtml(r.name || '')}</th>${cells}
            <td class="text-left">${ok ? '<span class="text-emerald-300 font-bold">같음</span>' : (r.hints || []).map((h) => `<span class="block text-amber-300">${escapeHtml(h)}</span>`).join('')}</td></tr>`;
    }).join('');
    return `
        <p class="text-sm font-bold text-white mb-1">꼬미입시 ↔ 나이스 맞춰 보기 <span class="text-xs font-normal text-slate-400">${cmp.same}명 같음 / ${rows.length}명</span></p>
        <p class="text-xs text-slate-400 mb-2">다른 칸은 색으로 표시합니다. 같은 자료(3-2 성적·학년별 출결·봉사·가산점 체크)를 올렸다면 값이 같아야 합니다.</p>
        ${enrolledNote}
        <div class="nice-compare-scroll"><table class="nice-compare-table">
            <thead><tr><th rowspan="2" scope="col">반</th><th rowspan="2" scope="col">번호</th><th rowspan="2" scope="col">이름</th>${head}<th rowspan="2" scope="col">확인</th></tr><tr>${sub}</tr></thead>
            <tbody>${body}</tbody>
        </table></div>`;
}

export function bindNiceFinalCard({ rerender }) {
    const App = window.go?.main?.App;
    document.getElementById('niceFinalUploadBtn')?.addEventListener('click', async () => {
        try {
            const summary = await App.UploadNiceGeneralRank();
            if (!summary) return;
            await showModalAlert(`${summary.scored}명의 나이스 내신 성적을 올렸습니다(${summary.kind}${summary.enrolled ? `, 재적수 ${summary.enrolled}명` : ''}). 원서대장의 후기 일반고 점수는 이 값을 씁니다. [맞춰 보기]로 꼬미입시 계산값과 비교해 보세요.`, '나이스 석차 연명부', 'success');
            rerender();
        } catch (err) {
            await showModalAlert(`나이스 석차 연명부 올리기 오류: ${err}`, '오류', 'error');
        }
    });
    document.getElementById('niceFinalCompareBtn')?.addEventListener('click', async () => {
        const box = document.getElementById('niceFinalCompare');
        if (!box) return;
        if (!box.classList.contains('hidden')) { box.classList.add('hidden'); return; }
        box.classList.remove('hidden');
        box.innerHTML = '<p class="text-sm text-slate-400"><span class="spinner"></span> 맞춰 보는 중…</p>';
        try {
            box.innerHTML = compareHTML(await App.GetNiceGeneralComparison());
        } catch (err) {
            box.innerHTML = `<p class="text-sm text-rose-300">맞춰 보지 못했습니다: ${escapeHtml(String(err))}</p>`;
        }
    });
    document.getElementById('niceFinalClearBtn')?.addEventListener('click', async () => {
        const ok = await showModalConfirm({ title: '나이스 석차 연명부 지우기', message: '올린 나이스 내신 성적을 지울까요? 원서대장의 후기 일반고 점수는 꼬미입시 계산값으로 돌아갑니다.', confirmText: '지우기', type: 'warning' });
        if (!ok) return;
        try {
            await App.ClearNiceGeneralRank();
            rerender();
        } catch (err) {
            await showModalAlert(`지우기 오류: ${err}`, '오류', 'error');
        }
    });
}
