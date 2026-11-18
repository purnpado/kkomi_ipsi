// ===== 4단계 판정 기준 설정 (학년부장 전용) =====
// 학교 기본 여유폭(비율 또는 점수), 학교·전형별 예외, 후기 일반고 석차백분율 안정·경계선을 정한다.
// 저장값은 학교 설정 DB에 들어가 배포자료로 담임 PC에도 같은 기준이 적용된다.
import { escapeAttr, escapeHtml } from '../core/utils.js';
import { getJudgmentSettings, saveJudgmentSettings, judgmentKey } from '../core/admissionJudgment.js';
import { showModalAlert } from '../core/dialogs.js';

const MODAL_ID = 'judgmentSettingsModal';

export async function openJudgmentSettingsModal({ onSaved } = {}) {
    document.getElementById(MODAL_ID)?.remove();
    const settings = getJudgmentSettings();
    let rules = [];
    try {
        rules = (await window.go.main.App.GetSchoolRuleList()) || [];
    } catch (_) {
        rules = [];
    }

    const overrideRow = rule => {
        const key = judgmentKey(rule.schoolName, rule.trackName);
        const o = settings.overrides?.[key] || {};
        const mode = o.mode === 'ratio' || o.mode === 'points' ? o.mode : '';
        return `<tr class="border-b border-slate-700/50" data-key="${escapeAttr(key)}">
            <td class="p-2 text-slate-200">${escapeHtml(rule.schoolName)}</td>
            <td class="p-2 text-slate-300">${escapeHtml(rule.trackName)}</td>
            <td class="p-2 text-slate-400 text-center">${escapeHtml(rule.totalMax)}점</td>
            <td class="p-2"><select class="input-field py-1 text-xs jo-mode">
                <option value="" ${mode === '' ? 'selected' : ''}>학교 기본</option>
                <option value="ratio" ${mode === 'ratio' ? 'selected' : ''}>비율(%)</option>
                <option value="points" ${mode === 'points' ? 'selected' : ''}>점수(점)</option>
            </select></td>
            <td class="p-2"><input type="text" inputmode="decimal" class="input-field py-1 text-xs w-20 text-center jo-value" value="${mode ? escapeAttr(o.value) : ''}" placeholder="-"></td>
        </tr>`;
    };

    const modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4';
    modal.innerHTML = `
        <div class="glass-card p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto space-y-4">
            <div class="flex justify-between items-start">
                <div>
                    <h2 class="text-xl font-bold text-white">🎯 4단계 판정 기준 설정</h2>
                    <p class="text-xs text-text-muted mt-1">기준선(합격 최저점 또는 학교 예상선)과 학생 점수의 차이를 여유폭과 비교해 안정·적정·소신·어려움을 정합니다.
                    저장하면 배포자료를 통해 모든 담임 PC에 같은 기준이 적용됩니다.</p>
                </div>
                <button aria-label="닫기" id="closeJudgmentSettings" class="text-3xl text-text-muted cursor-pointer">×</button>
            </div>
            <div class="rounded-xl border border-slate-700 p-4 bg-slate-900/40 text-xs text-slate-300 space-y-1">
                <p>🟢 안정: 기준선 + 여유폭 이상 (불합격 최고점이 있으면 그보다 높아도 안정) · 🔵 적정: 기준선 이상(동점 포함)</p>
                <p>🟠 소신: 기준선 − 여유폭 이상 · 🔴 어려움: 그 미만</p>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                <label class="text-sm font-bold">학교 기본 방식
                    <select id="jsMode" class="input-field mt-1 w-full">
                        <option value="ratio" ${settings.mode === 'ratio' ? 'selected' : ''}>비율 (만점 대비 %)</option>
                        <option value="points" ${settings.mode === 'points' ? 'selected' : ''}>점수 (점)</option>
                    </select></label>
                <label class="text-sm font-bold">비율 여유폭 (%)<input id="jsRatio" type="text" inputmode="decimal" class="input-field mt-1 w-full" value="${settings.ratio}"></label>
                <label class="text-sm font-bold">점수 여유폭 (점)<input id="jsPoints" type="text" inputmode="decimal" class="input-field mt-1 w-full" value="${settings.points}"></label>
                <label class="text-sm font-bold">후기 일반고 안정선 (석차백분율 %)<input id="jsGeneralSafe" type="text" inputmode="decimal" class="input-field mt-1 w-full" value="${settings.generalSafePct}"></label>
                <label class="text-sm font-bold">후기 일반고 경계선 (석차백분율 %)<input id="jsGeneralBorder" type="text" inputmode="decimal" class="input-field mt-1 w-full" value="${settings.generalBorderPct}"></label>
            </div>
            <div>
                <p class="text-sm font-bold text-white mb-2">학교·전형별 예외 <span class="text-xs font-normal text-slate-400">(비워 두면 학교 기본 방식을 따릅니다)</span></p>
                <table class="w-full text-xs"><thead><tr class="text-slate-400 border-b border-slate-700">
                    <th class="p-2 text-left">학교</th><th class="p-2 text-left">전형</th><th class="p-2">만점</th><th class="p-2 text-left">방식</th><th class="p-2 text-left">값</th>
                </tr></thead><tbody>${rules.map(overrideRow).join('') || '<tr><td colspan="5" class="p-3 text-slate-500">학교 규칙 목록을 불러오지 못했습니다.</td></tr>'}</tbody></table>
            </div>
            <details id="statExclusionList" class="rounded-xl border border-slate-700/60 bg-slate-900/40">
                <summary class="cursor-pointer select-none px-4 py-2.5 text-xs font-bold text-slate-300">입시 통계에서 뺀 학생</summary>
                <div class="px-4 pb-3 pt-1 text-xs text-slate-300" id="statExclusionListBody" role="status" aria-live="polite">펼치면 불러옵니다.</div>
            </details>
            <div class="flex justify-end gap-2">
                <button id="cancelJudgmentSettings" class="btn-secondary w-auto whitespace-nowrap px-4 py-2 text-sm">취소</button>
                <button id="saveJudgmentSettings" class="btn-primary w-auto whitespace-nowrap px-5 py-2 text-sm">저장</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    const close = () => modal.remove();
    modal.querySelector('#closeJudgmentSettings').addEventListener('click', close);
    modal.querySelector('#cancelJudgmentSettings').addEventListener('click', close);
    bindStatExclusionList(modal);
    modal.querySelector('#saveJudgmentSettings').addEventListener('click', async () => {
        const num = id => parseFloat(modal.querySelector(id).value);
        const next = {
            mode: modal.querySelector('#jsMode').value,
            ratio: num('#jsRatio'),
            points: num('#jsPoints'),
            generalSafePct: num('#jsGeneralSafe'),
            generalBorderPct: num('#jsGeneralBorder'),
            overrides: {}
        };
        if (![next.ratio, next.points, next.generalSafePct, next.generalBorderPct].every(v => Number.isFinite(v) && v >= 0)) {
            return showModalAlert('여유폭과 안정·경계선은 0 이상의 숫자로 입력해주세요.', '입력 확인', 'warning');
        }
        if (next.generalBorderPct < next.generalSafePct) {
            return showModalAlert('후기 일반고 경계선은 안정선보다 크거나 같아야 합니다.', '입력 확인', 'warning');
        }
        modal.querySelectorAll('tbody tr[data-key]').forEach(tr => {
            const mode = tr.querySelector('.jo-mode').value;
            const value = parseFloat(tr.querySelector('.jo-value').value);
            if (mode && Number.isFinite(value) && value >= 0) next.overrides[tr.dataset.key] = { mode, value };
        });
        try {
            await saveJudgmentSettings(next);
            close();
            onSaved?.();
        } catch (err) {
            showModalAlert(`판정 기준 저장 실패: ${err}`, '오류', 'error');
        }
    });
}

// 입시 통계 제외 학생 확인 목록(학년부장). 펼칠 때만 불러와 창을 여는 것만으로는 이름이 보이지 않게 한다.
// 표시는 각 학생 상담 화면 맨 아래 [관리]에서 바꾼다.
function bindStatExclusionList(modal) {
    const box = modal.querySelector('#statExclusionList');
    const body = modal.querySelector('#statExclusionListBody');
    if (!box || !body) return;
    box.addEventListener('toggle', async () => {
        if (!box.open) return;
        body.textContent = '불러오는 중…';
        try {
            const list = await window.go.main.App.GetStatExclusionList();
            if (!list || list.length === 0) {
                body.textContent = '입시 통계에서 뺀 학생이 없습니다. 학생 상담 화면 맨 아래 [관리]에서 정할 수 있습니다.';
                return;
            }
            body.innerHTML = `<p class="mb-1.5 text-slate-400">${list.length}명 · 바꾸려면 학생 상담 화면 맨 아래 [관리]를 엽니다.</p>`
                + `<ul class="space-y-0.5">${list.map(s => `<li class="num">${escapeHtml(String(s.classNum))}반 ${escapeHtml(String(s.studentNum))}번 ${escapeHtml(s.studentName)}</li>`).join('')}</ul>`;
        } catch (err) {
            body.textContent = `목록을 불러오지 못했습니다: ${err}`;
        }
    });
}
