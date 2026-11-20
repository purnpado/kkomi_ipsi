// 상담 화면 "마이스터고 리더십 활동 가산점": 인정 학기(1-2·2-1·2-2·3-1)를 학기마다 체크한다.
// 요강(에너지고·현대공고)이 학기별로 인정하므로 학기를 저장한다(extra.leadership_semesters, docs/admission-score-audit-plan.md 3.2절).
// 예전 버전과 섞여 써도 점수가 같도록 개수(leadership_terms)도 함께 저장한다.
// 예전에 숫자로만 넣은 학생은 체크를 하나라도 바꾸기 전까지 그 숫자를 그대로 둔다(저장해도 점수가 갑자기 줄지 않게).

export const LEADERSHIP_SEMESTERS = [['1_2', '1-2'], ['2_1', '2-1'], ['2_2', '2-2'], ['3_1', '3-1']];

/** 저장할 값. 학기를 알 수 없고 손대지도 않았으면 null(기존 값 유지). */
export function leadershipPayload(checkedKeys, known, touched) {
    if (!known && !touched) return null;
    const picked = LEADERSHIP_SEMESTERS.map(([key]) => key).filter((key) => checkedKeys.includes(key));
    return { leadership_semesters: picked, leadership_terms: picked.length };
}

function pointsText(terms) {
    return `에너지고 <strong class="text-amber-300 num">${Math.min(10, terms * 2.5).toFixed(1)}</strong>점 · 현대공고 <strong class="text-amber-300 num">${Math.min(5, terms * 2.5).toFixed(1)}</strong>점`;
}

export function leadershipHTML(data, isViewer) {
    const semesters = Array.isArray(data?.leadershipSemesters) ? data.leadershipSemesters : null;
    const terms = Number(data?.leadershipTerms || 0);
    const boxes = LEADERSHIP_SEMESTERS.map(([key, label]) => `
        <label class="flex items-center gap-1.5 cursor-pointer text-slate-200 font-semibold">
            <input type="checkbox" class="leadership-sem w-4 h-4 accent-amber-400" value="${key}" ${semesters?.includes(key) ? 'checked' : ''} ${isViewer ? 'disabled' : ''}/>
            <span class="num">${label}</span>
        </label>`).join('');
    const legacy = !semesters && terms > 0
        ? `<p class="text-[11px] text-amber-300" id="leadershipLegacy">예전에 학기 없이 ${terms}학기로 저장돼 있습니다. 인정 학기를 체크해 주세요(체크하기 전까지는 ${terms}학기로 계산합니다).</p>`
        : '';
    return `
        <div id="leadershipBox" data-known="${semesters ? '1' : '0'}" class="space-y-1.5 pt-1">
            <div class="flex items-center gap-x-4 gap-y-1.5 flex-wrap">
                <span class="text-slate-300 font-medium whitespace-nowrap">인정 학기:</span>
                ${boxes}
            </div>
            <p class="text-xs text-slate-400">= <span id="leadershipTerms" class="num">${terms}</span>학기 · 가산점 <span id="leadershipPoints">${pointsText(terms)}</span></p>
            ${legacy}
        </div>`;
}

export function bindLeadership(modalEl) {
    const box = modalEl.querySelector('#leadershipBox');
    if (!box) return;
    box.addEventListener('change', (e) => {
        if (!e.target.classList.contains('leadership-sem')) return;
        box.dataset.touched = '1';
        const terms = box.querySelectorAll('.leadership-sem:checked').length;
        box.querySelector('#leadershipTerms').textContent = String(terms);
        box.querySelector('#leadershipPoints').innerHTML = pointsText(terms);
        box.querySelector('#leadershipLegacy')?.remove();
    });
}

/** 저장 버튼: extra 에 합칠 값(null 이면 손대지 않음). */
export function collectLeadership(modalEl) {
    const box = modalEl.querySelector('#leadershipBox');
    if (!box) return null;
    const checked = [...box.querySelectorAll('.leadership-sem:checked')].map((el) => el.value);
    return leadershipPayload(checked, box.dataset.known === '1', box.dataset.touched === '1');
}
