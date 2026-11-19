// 후기 일반고 "타 시·도 전입생 봉사 환산" 도우미(상담 화면 학년별 출결·봉사 칸 아래).
// 요강 Ⅴ-5-다-3): 타 시·도에서 전입한 학생 중 기준 시수가 울산과 다른 경우 학년별로
//   환산 시수 = 4(시간) × 본인이 실시한 해당 학년 실시 시수 ÷ 타 시·도의 해당 학년 기준 시수 (소수 첫째 자리에서 반올림해 정수)
// 단, 8월 31일 이전에 전입한 학년은 울산 기준 시수를 그대로 쓴다. 재학생 대상이므로 2022년 이후 기준(4시간 만점)만 다룬다.
// 전입생([전입] 뱃지가 붙는 학생: 나이스 교과 성적 비고에 "전입")에게만 보인다. 계산한 값은 위의 학년별 "봉사(시간)" 칸에
// 채워 넣을 뿐이고, 점수 계산은 그 칸([저장 후 재계산])이 맡는다. 진로부장(조회 전용)에게는 보이지 않는다.
// 나이스 비고만으로는 울산 관내 전입인지 타 시·도 전입인지 알 수 없으므로 담임이 고른다(기본: 고르지 않음).
// 관내 전입은 기준 시수가 같아 환산하지 않는다. 나이스 성적 파일 비고에는 보통 전입일이 없으므로 담임이 학적을 보고 넣는다.
// 전입 구분·전입일·도우미 입력값은 [저장 후 재계산] 때 학생 수기 입력(extra)의 transfer_origin·transfer_date·transfer_volunteer 로
// 함께 저장한다(extraEditor.js).
import { escapeAttr, escapeHtml } from '../../../core/utils.js';
import { transferNote } from '../../../core/transferBadges.js';
import { currentSchoolYear } from '../../../core/admissionYear.js';

const SCORE_TIERS = [[4, 2.0], [3, 1.7], [2, 1.4], [1, 1.0]];

function volunteerScore(hours) {
    for (const [min, score] of SCORE_TIERS) if (hours >= min) return score;
    return 0;
}

/** 비고에서 전입일을 "YYYY-MM-DD"로 꺼낸다(예: "2025.03.04 전입"). 없으면 ''. */
export function parseTransferDate(note) {
    const m = String(note || '').match(/(20\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/);
    if (!m) return '';
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return '';
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * 학년별 적용 기준. third: 중3 학년도(예: 2026). 반환 [{grade, year, mode}] — mode: 'other'(타 시·도 기준 환산) | 'ulsan'.
 * 전입 학년도는 3월 시작 기준(1~2월 전입은 직전 학년도의 9.1. 이후).
 */
export function transferGradeModes(dateText, third) {
    const date = new Date(`${dateText}T00:00:00`);
    if (!dateText || Number.isNaN(date.getTime())) return [];
    const month = date.getMonth() + 1;
    const schoolYear = month >= 3 ? date.getFullYear() : date.getFullYear() - 1;
    const beforeSep = month >= 3 && month <= 8;
    return [1, 2, 3].map((grade) => {
        const year = third - (3 - grade);
        let mode = 'ulsan';
        if (year < schoolYear) mode = 'other';
        else if (year === schoolYear && !beforeSep) mode = 'other';
        return { grade, year, mode };
    });
}

/** 환산 시수: 4 × 실시 ÷ 기준, 소수 첫째 자리에서 반올림한 정수. 기준이 없으면 null. */
export function convertedHours(done, standard) {
    if (!(standard > 0) || !(done >= 0)) return null;
    return Math.round((4 * done) / standard);
}

export function volunteerTransferHTML(ctx, isViewer) {
    const note = transferNote(ctx.classNum, ctx.studentNum, ctx.name);
    if (!note || isViewer) return '';
    const saved = typeof ctx.rawExtra?.transfer_date === 'string' ? ctx.rawExtra.transfer_date : '';
    const fromNote = parseTransferDate(note);
    const origin = ['other', 'ulsan'].includes(ctx.rawExtra?.transfer_origin) ? ctx.rawExtra.transfer_origin : '';
    const radio = (value, label) => `
        <label class="inline-flex items-center gap-1.5 cursor-pointer">
            <input type="radio" name="volTransferOrigin" value="${value}" class="accent-amber-400" ${origin === value ? 'checked' : ''} />
            <span>${label}</span>
        </label>`;
    const hint = saved ? '저장해 둔 전입일입니다.'
        : fromNote ? '나이스 비고에서 읽은 날짜입니다. 학적의 전입일과 다르면 고쳐 주세요.'
        : '나이스 성적 파일에는 전입일이 없습니다. 학적(전입 일자)을 보고 넣어 주세요. [저장 후 재계산] 때 함께 저장됩니다.';
    return `
        <details id="volTransferBox" class="rounded-lg bg-slate-800/60 border border-amber-500/40 p-2.5 text-[11px] text-slate-300" open>
            <summary class="cursor-pointer select-none font-bold text-amber-200">전입생 봉사 환산 <span class="font-normal text-slate-400">(나이스 비고: ${escapeHtml(note)})</span></summary>
            <div class="mt-2 space-y-2">
                <div class="flex items-center gap-3 flex-wrap" role="radiogroup" aria-label="전입 구분">
                    <span>전입 구분</span>
                    ${radio('other', '타 시·도에서 전입')}
                    ${radio('ulsan', '울산 관내 전입')}
                </div>
                <p id="volTransferOriginMsg" class="text-amber-200"></p>
                <div id="volTransferOther" class="space-y-2">
                <label class="flex items-center gap-2 flex-wrap">
                    <span>전입일</span>
                    <input type="date" id="volTransferDate" class="input-field py-1 px-1.5 text-xs" value="${escapeAttr(saved || fromNote)}" />
                    <span class="${saved || fromNote ? 'text-slate-400' : 'text-amber-200'}">${hint}</span>
                </label>
                <div id="volTransferRows"></div>
                <div class="flex items-center gap-2 flex-wrap">
                    <button type="button" id="volTransferApply" class="btn-secondary text-xs px-3 py-1">환산 시수를 위 봉사 칸에 넣기</button>
                    <span id="volTransferStatus" class="text-slate-400" role="status" aria-live="polite"></span>
                </div>
                <p class="text-[10px] text-slate-400 leading-relaxed">
                    환산 시수 = 4시간 × 실시 시수 ÷ 그 시·도의 해당 학년 기준 시수(소수 첫째 자리에서 반올림). 8월 31일 이전에 전입한 학년과 그 뒤 학년은 울산 기준을 그대로 씁니다.
                    재학하지 않은 학년(해외 귀국 등)은 칸을 비워 두면 요강 4)항 공식으로 자동 환산합니다. 넣은 뒤 [저장 후 재계산]을 눌러야 반영됩니다.
                </p>
                </div>
            </div>
        </details>
    `;
}

export function bindVolunteerTransfer(ctx) {
    const box = ctx.modalEl.querySelector('#volTransferBox');
    if (!box) return;
    const dateInput = box.querySelector('#volTransferDate');
    const rowsEl = box.querySelector('#volTransferRows');
    const status = box.querySelector('#volTransferStatus');
    const third = currentSchoolYear();
    // 학년 → { done, standard } (날짜를 바꿔 다시 그려도 입력값 유지). 저장해 둔 값이 있으면 그것부터.
    const values = {};
    const stored = ctx.rawExtra?.transfer_volunteer;
    if (stored && typeof stored === 'object') {
        for (const g of [1, 2, 3]) {
            const v = stored[g];
            if (v && typeof v === 'object') values[g] = { done: String(v.done ?? ''), standard: String(v.standard ?? '') };
        }
    }

    const volInput = (g) => ctx.modalEl.querySelector(`#genVol${g}`);
    const result = (g, mode) => {
        const v = values[g] || {};
        const done = v.done === '' || v.done == null ? null : Number(v.done);
        if (done == null || Number.isNaN(done)) return null;
        return mode === 'other' ? convertedHours(done, Number(v.standard)) : Math.round(done);
    };

    const render = () => {
        const modes = transferGradeModes(dateInput.value, third);
        if (modes.length === 0) {
            rowsEl.innerHTML = '<p class="text-amber-200">전입일을 넣으면 학년별로 울산 기준인지 타 시·도 환산인지 보여 줍니다.</p>';
            return;
        }
        if (modes.every(m => m.mode === 'ulsan')) {
            rowsEl.innerHTML = '<p>중학교 1학년 8월 31일 이전에 전입해 세 학년 모두 울산 기준입니다. 환산할 학년이 없습니다.</p>';
            return;
        }
        rowsEl.innerHTML = `
            <div class="grid gap-1.5 items-center" style="grid-template-columns: auto auto 1fr 1fr auto auto;">
                <span>학년</span><span>기준</span><span>실시 시수</span><span>그 시·도 기준 시수</span><span>환산</span><span>점수</span>
                ${modes.map(({ grade, year, mode }) => {
                    const v = values[grade] || {};
                    if (v.done == null) v.done = volInput(grade)?.value.trim() ?? '';
                    values[grade] = v;
                    const r = result(grade, mode);
                    return `
                        <span>${grade}학년 <span class="text-slate-500">(${year})</span></span>
                        <span class="${mode === 'other' ? 'text-amber-200' : 'text-slate-400'}">${mode === 'other' ? '타 시·도 환산' : '울산 기준'}</span>
                        <input type="text" inputmode="numeric" data-g="${grade}" data-k="done" class="input-field py-1 px-1.5 text-xs text-center" value="${escapeAttr(v.done ?? '')}" placeholder="시간" aria-label="${grade}학년 실시 시수" />
                        ${mode === 'other'
                            ? `<input type="text" inputmode="numeric" data-g="${grade}" data-k="standard" class="input-field py-1 px-1.5 text-xs text-center" value="${escapeAttr(v.standard ?? '')}" placeholder="예: 10" aria-label="${grade}학년 그 시·도 기준 시수" />`
                            : '<span class="text-center text-slate-500">—</span>'}
                        <span class="num text-center" data-out="${grade}">${r == null ? '-' : `${r}시간`}</span>
                        <span class="num text-center" data-score="${grade}">${r == null ? '-' : volunteerScore(r).toFixed(1)}</span>
                    `;
                }).join('')}
            </div>
        `;
    };

    rowsEl.addEventListener('input', (e) => {
        const el = e.target;
        if (!el.dataset?.g) return;
        const g = Number(el.dataset.g);
        values[g] = { ...(values[g] || {}), [el.dataset.k]: el.value.trim() };
        const mode = transferGradeModes(dateInput.value, third).find(m => m.grade === g)?.mode;
        const r = result(g, mode);
        rowsEl.querySelector(`[data-out="${g}"]`).textContent = r == null ? '-' : `${r}시간`;
        rowsEl.querySelector(`[data-score="${g}"]`).textContent = r == null ? '-' : volunteerScore(r).toFixed(1);
    });
    dateInput.addEventListener('change', render);
    // 전입 구분: 타 시·도일 때만 환산 칸을 보인다. 관내로 바꿔도 넣어 둔 시수는 지우지 않고 숨기기만 한다.
    const otherEl = box.querySelector('#volTransferOther');
    const originMsg = box.querySelector('#volTransferOriginMsg');
    const showOrigin = () => {
        const origin = box.querySelector('input[name="volTransferOrigin"]:checked')?.value || '';
        otherEl.hidden = origin !== 'other';
        originMsg.hidden = origin === 'other';
        originMsg.className = origin === 'ulsan' ? 'text-slate-300' : 'text-amber-200';
        originMsg.textContent = origin === 'ulsan'
            ? '울산 관내 전입은 기준 시수가 같아 환산하지 않습니다. 학년별 봉사 칸을 비워 두면 나이스 자료로 자동 계산합니다(전에 환산 값을 넣었다면 지우고 저장해 주세요).'
            : '울산 관내 전입인지 타 시·도 전입인지 골라 주세요. 타 시·도 전입일 때만 기준 시수를 환산합니다.';
    };
    box.querySelectorAll('input[name="volTransferOrigin"]').forEach((el) => el.addEventListener('change', showOrigin));
    showOrigin();
    box.querySelector('#volTransferApply').addEventListener('click', () => {
        const modes = transferGradeModes(dateInput.value, third);
        const filled = [];
        for (const { grade, mode } of modes) {
            const r = result(grade, mode);
            if (r == null) continue;
            const input = volInput(grade);
            if (input) {
                input.value = String(r);
                filled.push(`${grade}학년 ${r}시간`);
            }
        }
        status.textContent = filled.length
            ? `${filled.join(', ')}을 넣었습니다. [저장 후 재계산]을 눌러 주세요.`
            : '넣을 값이 없습니다. 실시 시수와 기준 시수를 넣어 주세요.';
    });
    render();
}

/** [저장 후 재계산] 때 함께 저장할 값. 도우미가 없으면 null(기존 저장값을 건드리지 않음). */
export function collectVolunteerTransfer(modalEl) {
    const box = modalEl.querySelector('#volTransferBox');
    if (!box) return null;
    const date = box.querySelector('#volTransferDate')?.value || '';
    const origin = box.querySelector('input[name="volTransferOrigin"]:checked')?.value || '';
    const volunteer = {};
    box.querySelectorAll('#volTransferRows input[data-g]').forEach((el) => {
        const g = el.dataset.g;
        if (el.value.trim() === '') return;
        volunteer[g] = { ...(volunteer[g] || {}), [el.dataset.k]: el.value.trim() };
    });
    return { origin, date, volunteer };
}
