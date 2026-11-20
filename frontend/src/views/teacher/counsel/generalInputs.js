// 상담 화면 후기 일반고 내신 칸 안의 "입력 고치기": 3학년 창체·행발 가산점, 학년별 출결·봉사, 전입생 봉사 환산.
// 입력 칸 ID(checkChangche1·genAbs1 등)는 그대로라 저장은 extraEditor.js가 함께 한다.
import { volunteerTransferHTML } from './volunteerTransfer.js';

export function generalInputsHTML(ctx, isViewer) {
    const disabled = isViewer ? 'disabled' : '';
    const checks = (prefix, key) => [1, 2, 3].map((g) => `
        <label class="inline-flex items-center gap-1 text-xs text-slate-200 cursor-pointer">
            <input type="checkbox" id="${prefix}${g}" class="accent-indigo-500 rounded cursor-pointer" ${ctx.extra[`${key}_${g}`] ? 'checked' : ''} ${disabled}/>
            <span>${g}학년</span>
        </label>`).join('');
    const numbers = (prefix, key) => [1, 2, 3].map((g) => `<input type="text" inputmode="numeric" id="${prefix}${g}" class="input-field py-1 px-1.5 text-xs text-center" value="${ctx.rawExtra[`${key}_${g}`] ?? ''}" placeholder="자동" ${disabled}/>`).join('');
    return `
        <div class="cg-inputs">
            <div class="cg-input-row">
                <div class="cg-input-box"><span class="cg-input-label">창체 활동 가산점 <small>각 학년 +1점</small></span><div class="flex items-center gap-2 flex-wrap">${checks('checkChangche', 'changche')}</div></div>
                <div class="cg-input-box"><span class="cg-input-label">행발(행동발달) 가산점 <small>각 학년 +1점</small></span><div class="flex items-center gap-2 flex-wrap">${checks('checkHaengbal', 'haengbal')}</div></div>
            </div>
            <div class="cg-input-box">
                <span class="cg-input-label">학년별 출결·봉사 <small>(선택 · 비우면 나이스 자료로 자동 계산)</small></span>
                <div class="grid grid-cols-4 gap-1.5 text-[11px] text-slate-300 items-center">
                    <span></span>${[1, 2, 3].map((g) => `<span class="text-center">${g}학년</span>`).join('')}
                    <span title="미인정 결석일 + 지각·조퇴·결과 3회당 1일">결석 환산(일)</span>${numbers('genAbs', 'general_absence')}
                    <span>봉사(시간)</span>${numbers('genVol', 'general_volunteer')}
                </div>
            </div>
            ${volunteerTransferHTML(ctx, isViewer)}
            <div class="cg-input-foot">
                <p class="cg-note">후기 일반고 비교과 40점(출석 16·봉사 8·행발 8·창체 8). 출석·봉사는 학년별로 계산합니다.
                    ${ctx.data.generalHSBonusEntered ? '' : '<b class="text-amber-300">가산점 미입력 — 저장하면 입력 완료로 기록됩니다.</b>'}</p>
                ${isViewer ? '<span class="cg-note">진로부장은 조회 전용입니다.</span>' : '<button type="button" class="save-extra-btn btn-primary w-auto! text-xs px-4 py-1.5 font-bold inline-flex items-center gap-1.5 cursor-pointer"><span>💾</span> 저장 후 재계산</button>'}
            </div>
        </div>`;
}
