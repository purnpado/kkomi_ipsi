// ===== 판정 기준 설정 (학년부장 전용) =====
// 학교 기본 여유폭(비율 또는 점수), 학교·전형별 예외, 후기 일반고 석차백분율 안정·경계선을 정한다.
// 저장값은 학교 설정 DB에 들어가 배포자료로 담임 PC에도 같은 기준이 적용된다.
import { escapeAttr, escapeHtml } from '../core/utils.js';
import { getJudgmentSettings, saveJudgmentSettings, judgmentKey } from '../core/admissionJudgment.js';
import { showModalAlert } from '../core/dialogs.js';
import { displaySchool } from '../core/schoolName.js';
import { effectiveMargin, generalZonesHTML, legendHTML, marginChip } from './judgment/judgmentPreview.js';

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

    // 같은 학교가 이어지면 두 번째 줄부터 학교명을 비워 묶어 보이게 한다.
    const overrideRow = (rule, i) => {
        const key = judgmentKey(rule.schoolName, rule.trackName);
        const o = settings.overrides?.[key] || {};
        const mode = o.mode === 'ratio' || o.mode === 'points' ? o.mode : '';
        const sameSchool = i > 0 && rules[i - 1].schoolName === rule.schoolName;
        return `<tr class="jg-row ${sameSchool ? 'jg-row--same' : ''}" data-key="${escapeAttr(key)}" data-max="${escapeAttr(rule.totalMax)}">
            <td class="jg-school">${sameSchool ? '' : escapeHtml(displaySchool(rule.schoolName))}</td>
            <td>${escapeHtml(rule.trackName)}</td>
            <td class="num jg-c">${escapeHtml(rule.totalMax)}점</td>
            <td><select class="input-field py-1 text-xs jo-mode" aria-label="${escapeAttr(displaySchool(rule.schoolName))} ${escapeAttr(rule.trackName)} 여유폭 방식">
                <option value="" ${mode === '' ? 'selected' : ''}>학교 기본</option>
                <option value="ratio" ${mode === 'ratio' ? 'selected' : ''}>비율(%)</option>
                <option value="points" ${mode === 'points' ? 'selected' : ''}>점수(점)</option>
            </select></td>
            <td><input type="text" inputmode="decimal" class="input-field py-1 text-xs w-20 text-center jo-value" value="${mode ? escapeAttr(o.value) : ''}" placeholder="-" aria-label="예외 값"></td>
            <td class="jg-applied"></td>
        </tr>`;
    };

    const modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4';
    modal.innerHTML = `
        <div class="glass-card p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto jg-doc">
            <div class="flex justify-between items-start">
                <div>
                    <h2 class="text-xl font-bold text-white">판정 기준</h2>
                    <div class="cg-chips"><span class="cg-chip cg-chip--info">저장하면 배포자료로 모든 담임 PC에 같은 기준</span></div>
                </div>
                <button aria-label="닫기" id="closeJudgmentSettings" class="text-3xl text-text-muted cursor-pointer">×</button>
            </div>

            <section class="jg-section">
                <h3>1. 학교별 점수 판정 <small>마이스터고·특성화고 등, 기준선(합격 최저점 또는 학교 예상선)과 학생 점수의 차이</small></h3>
                ${legendHTML()}
                <div class="jg-controls">
                    <label class="text-sm font-bold">학교 기본 방식
                        <select id="jsMode" class="input-field mt-1 w-full">
                            <option value="ratio" ${settings.mode === 'ratio' ? 'selected' : ''}>비율 (만점 대비 %)</option>
                            <option value="points" ${settings.mode === 'points' ? 'selected' : ''}>점수 (점)</option>
                        </select></label>
                    <label class="text-sm font-bold jg-field" data-mode="ratio">비율 여유폭 (%) <span class="jg-off-tag">상담 화면에서 '비율' 보기로 바꿀 때만</span><input id="jsRatio" type="text" inputmode="decimal" class="input-field mt-1 w-full" value="${settings.ratio}"></label>
                    <label class="text-sm font-bold jg-field" data-mode="points">점수 여유폭 (점) <span class="jg-off-tag">상담 화면에서 '점수' 보기로 바꿀 때만</span><input id="jsPoints" type="text" inputmode="decimal" class="input-field mt-1 w-full" value="${settings.points}"></label>
                </div>
                <div class="cg-chips" id="jsExample"></div>
            </section>

            <section class="jg-section">
                <h3>2. 후기 일반고 <small>학교 안 교과 석차백분율 · 숫자가 작을수록 앞</small></h3>
                <div class="jg-controls jg-controls--two">
                    <label class="text-sm font-bold">안정선 (상위 %)<input id="jsGeneralSafe" type="text" inputmode="decimal" class="input-field mt-1 w-full" value="${settings.generalSafePct}"></label>
                    <label class="text-sm font-bold">경계선 (상위 %)<input id="jsGeneralBorder" type="text" inputmode="decimal" class="input-field mt-1 w-full" value="${settings.generalBorderPct}"></label>
                </div>
                <div id="jsGeneralZones"></div>
            </section>

            <section class="jg-section">
                <h3>3. 학교·전형별 예외 <span id="jsOverrideCount"></span> <small>비워 두면 학교 기본 방식</small></h3>
                <div class="jg-table-wrap"><table class="jg-table"><thead><tr>
                    <th>학교</th><th>전형</th><th class="jg-c">만점</th><th>방식</th><th>값</th><th>적용 여유폭</th>
                </tr></thead><tbody>${rules.map(overrideRow).join('') || '<tr><td colspan="6" class="p-3 text-slate-500">학교 규칙 목록을 불러오지 못했습니다.</td></tr>'}</tbody></table></div>
            </section>

            <section class="jg-section">
                <h3>기타</h3>
                <details id="statExclusionList" class="rounded-xl border border-slate-700/60 bg-slate-900/40">
                    <summary class="cursor-pointer select-none px-4 py-2.5 text-xs font-bold text-slate-300">입시 통계에서 뺀 학생</summary>
                    <div class="px-4 pb-3 pt-1 text-xs text-slate-300" id="statExclusionListBody" role="status" aria-live="polite">펼치면 불러옵니다.</div>
                </details>
            </section>
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
    bindPreview(modal);
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

// 입력할 때마다 미리보기를 바꾼다: 쓰지 않는 방식 칸 흐리게, 예시 여유폭, 후기 일반고 구간 막대, 예외 줄별 적용 여유폭.
function bindPreview(modal) {
    const q = (sel) => modal.querySelector(sel);
    const update = () => {
        const base = { mode: q('#jsMode').value, ratio: parseFloat(q('#jsRatio').value) || 0, points: parseFloat(q('#jsPoints').value) || 0 };
        modal.querySelectorAll('.jg-field').forEach((f) => f.classList.toggle('is-off', f.dataset.mode !== base.mode));
        const ex = (max) => effectiveMargin(base, null, max).points.toFixed(1);
        q('#jsExample').innerHTML = `<span class="cg-label">예</span><span class="cg-chip">만점 100점 → 여유폭 <b>${ex(100)}점</b></span><span class="cg-chip">만점 200점 → <b>${ex(200)}점</b></span><span class="cg-chip">만점 300점 → <b>${ex(300)}점</b></span>`;
        q('#jsGeneralZones').innerHTML = generalZonesHTML(parseFloat(q('#jsGeneralSafe').value), parseFloat(q('#jsGeneralBorder').value));
        let count = 0;
        modal.querySelectorAll('tbody tr[data-key]').forEach((tr) => {
            const mode = tr.querySelector('.jo-mode').value;
            const value = parseFloat(tr.querySelector('.jo-value').value);
            const override = mode && Number.isFinite(value) && value >= 0 ? { mode, value } : null;
            if (override) count++;
            tr.classList.toggle('is-override', !!override);
            tr.querySelector('.jg-applied').innerHTML = marginChip(effectiveMargin(base, override, tr.dataset.max));
        });
        q('#jsOverrideCount').innerHTML = `<span class="cg-chip ${count ? 'cg-chip--info' : ''}">예외 <b>${count}</b>곳</span>`;
    };
    modal.addEventListener('input', update);
    modal.addEventListener('change', update);
    update();
}
