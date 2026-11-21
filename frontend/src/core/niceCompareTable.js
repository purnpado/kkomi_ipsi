// ===== 나이스 석차 연명부 ↔ 꼬미입시 맞춰 보기 표 =====
// 학년부장(나이스 자료 화면, 저장한 전교 연명부)과 담임(학급 명렬표, 우리 반 반별 연명부)이 함께 쓴다.
import { escapeHtml } from './utils.js';

const COLS = [
    ['rank', '석차'], ['percentile', '백분율'], ['academic', '교과(160)'], ['attendance', '출석(16)'],
    ['volunteer', '봉사(8)'], ['creative', '창체(8)'], ['behavior', '행발(8)'], ['total', '합계(200)']
];

const fmt = (key, v) => (v === undefined || v === null ? '-' : key === 'rank' ? String(Math.round(v)) : Number(v).toFixed(2));

/** 맞춰 보기 결과(백엔드 NiceComparison) 표 HTML */
export function niceCompareHTML(cmp) {
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
        ${cmp.percentileWithNonAcademic ? '<p class="text-xs text-slate-400 mb-2">이 파일의 석차·백분율은 200점(비교과포함) 기준이라 꼬미입시도 200점 기준 석차로 비교합니다. 담임 PC에서는 전교 200점 석차를 알 수 없어 두 칸은 비교하지 않습니다.</p>' : ''}
        <div class="nice-compare-scroll"><table class="nice-compare-table">
            <thead><tr><th rowspan="2" scope="col">반</th><th rowspan="2" scope="col">번호</th><th rowspan="2" scope="col">이름</th>${head}<th rowspan="2" scope="col">확인</th></tr><tr>${sub}</tr></thead>
            <tbody>${body}</tbody>
        </table></div>`;
}

/** 맞춰 보기 표를 화면 위 창으로 띄운다(담임 학급 명렬표). Esc·닫기·바깥 누르기로 닫힌다. */
export function openNiceCompareOverlay(cmp, title) {
    document.getElementById('niceCompareOverlay')?.remove();
    const el = document.createElement('div');
    el.id = 'niceCompareOverlay';
    el.className = 'fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', title);
    el.innerHTML = `
        <div class="glass-card p-6 w-full max-w-6xl max-h-[90vh] overflow-y-auto">
            <div class="flex items-center justify-between gap-3 mb-3">
                <h2 class="text-lg font-black text-white">${escapeHtml(title)}</h2>
                <button type="button" id="niceCompareClose" class="btn-secondary text-xs px-3 py-1.5 font-bold" style="width:auto">닫기</button>
            </div>
            ${niceCompareHTML(cmp)}
            <p class="text-xs text-slate-400 mt-3">꼬미입시 값은 배포받은 전교 석차 기준(상담 화면과 같은 값)입니다. 다른 칸은 상담 화면의 출결·봉사·가산점 입력을 확인해 고쳐 주세요. 이 비교는 저장하지 않습니다.</p>
        </div>`;
    const close = () => { el.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    el.addEventListener('click', (e) => { if (e.target === el) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(el);
    el.querySelector('#niceCompareClose')?.addEventListener('click', close);
    el.querySelector('#niceCompareClose')?.focus();
}
