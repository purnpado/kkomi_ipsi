// ===== 후기 일반고 관내 합격선 추정 패널 =====
// 교육청은 후기 일반고 합격점(총점 200점 컷)을 공개하지 않는다. 관내 중학교가 결과를 익명으로
// 공유하면 그 자료로 합격선을 추정한다. 창체·행발 가산점은 입력하지 않는 학교가 있을 수 있어
// "기본 지표(교과+출석+봉사+기본 10점)"를 주 잣대로, 가산점까지 입력한 자료만으로 "완전 총점"을 따로 본다.
import { escapeHtml } from '../../core/utils.js';
import { admissionLabel } from '../../core/admissionYear.js';
import { state } from '../../core/store.js';

const fmt = v => (Number(v) > 0 ? Number(v).toFixed(2) : '-');

function estimateCard(title, subtitle, e) {
    const range = e.rangeHigh > 0
        ? (e.rangeLow > 0 ? `${fmt(e.rangeLow)} ~ ${fmt(e.rangeHigh)}점` : `${fmt(e.rangeHigh)}점 이하 (불합격 사례 없음)`)
        : '-';
    return `
        <div class="p-4 rounded-xl bg-slate-800/50 border border-slate-700/60 space-y-2">
            <div class="flex items-center justify-between">
                <span class="text-sm font-bold text-white">${title}</span>
                <span class="text-[11px] text-slate-400">표본 ${e.sampleCount}명 (배정 ${e.acceptedCount} · 미배정 ${e.rejectedCount})</span>
            </div>
            <p class="text-[11px] text-slate-400">${subtitle}</p>
            <div class="grid grid-cols-2 gap-2 text-xs">
                <div class="p-2 rounded-lg bg-slate-900/60"><div class="text-slate-400">실제 사례 범위</div><div class="font-bold text-amber-300">${range}</div></div>
                <div class="p-2 rounded-lg bg-slate-900/60"><div class="text-slate-400">정원 비율 추정선</div><div class="font-bold text-indigo-300">${e.quotaCutoff > 0 ? `${fmt(e.quotaCutoff)}점` : '정원·지원자 수 입력 필요'}</div></div>
                <div class="p-2 rounded-lg bg-slate-900/60"><div class="text-slate-400">배정 최저점</div><div class="font-bold text-emerald-300">${fmt(e.acceptedMin)}</div></div>
                <div class="p-2 rounded-lg bg-slate-900/60"><div class="text-slate-400">미배정 최고점</div><div class="font-bold text-rose-300">${fmt(e.rejectedMax)}</div></div>
            </div>
            ${e.smallSample ? '<p class="text-[11px] text-amber-300">⚠️ 표본이 적어(3명 미만 포함) 참고용으로만 보세요. 참여 학교가 늘수록 정확해집니다.</p>' : ''}
        </div>`;
}

export async function renderGeneralCutoffPanel(container, year) {
    let result = null;
    let quotas = [];
    try {
        [result, quotas] = await Promise.all([
            window.go.main.App.GetConsolidatedGeneralCutoff(year),
            window.go.main.App.GetGeneralQuotaRecords().catch(() => [])
        ]);
    } catch (e) {
        container.innerHTML = `<div class="p-8 text-center text-rose-300">후기 일반고 합격선 자료를 불러오지 못했습니다: ${escapeHtml(String(e))}</div>`;
        return;
    }
    const quota = (quotas || []).find(q => Number(q.admissionYear) === Number(year)) || { quota: 0, applicants: 0, note: '' };
    const isMaster = state.currentUser?.Role === 'master';
    container.innerHTML = `
        <div class="space-y-4">
            <div class="p-4 rounded-xl bg-indigo-950/30 border border-indigo-500/30 text-xs text-slate-300 space-y-1">
                <p class="text-sm font-bold text-white">🏫 ${admissionLabel(year)} 후기 일반고 관내 추정 합격선</p>
                <p>관내 참여 ${result.participatingSchool}개교 · 공유 자료 ${result.totalRecords}명 · 3학년 2학기까지 반영된 확정 자료 ${result.confirmedRecords}명으로 계산합니다(예상치는 제외).</p>
                <p class="text-slate-400">교과는 학교 안 석차백분율로 환산되므로 총점은 학교가 달라도 같은 잣대입니다. 합격선은 하나의 점수가 아니라 범위로 보세요.</p>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                ${estimateCard('기본 지표 기준 (주 잣대)', '교과 + 출석 + 봉사 + 창체·행발 기본 10점 · 가산점을 입력하지 않은 학교 자료도 모두 사용', result.base)}
                ${estimateCard('완전 총점 기준 (200점)', '창체·행발 가산점까지 입력한 학교 자료만 사용 · 실제 선발 기준과 같음', result.total)}
            </div>
            <div class="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-2">
                <p class="text-sm font-bold text-white">📋 ${admissionLabel(year)} 후기 일반고 선발 정원·지원자 수 <span class="text-[11px] font-normal text-slate-400">(교육청 발표값을 직접 입력 · 정원 비율 추정과 여러 해 비교에 사용)</span></p>
                <div class="flex flex-wrap items-center gap-2 text-xs">
                    <label>정원 <input id="genQuotaInput" type="text" inputmode="numeric" class="input-field py-1 w-24 text-center" value="${quota.quota || ''}" ${isMaster ? '' : 'disabled'}></label>
                    <label>지원자 <input id="genApplicantsInput" type="text" inputmode="numeric" class="input-field py-1 w-24 text-center" value="${quota.applicants || ''}" ${isMaster ? '' : 'disabled'}></label>
                    <label>출처 <input id="genQuotaNote" type="text" class="input-field py-1 w-56" value="${escapeHtml(quota.note || '')}" placeholder="예: 교육청 보도자료" ${isMaster ? '' : 'disabled'}></label>
                    ${isMaster ? '<button id="genQuotaSaveBtn" class="btn-primary px-3 py-1 text-xs">저장</button>' : '<span class="text-slate-500">학년부장만 입력할 수 있습니다</span>'}
                </div>
            </div>
        </div>`;
    container.querySelector('#genQuotaSaveBtn')?.addEventListener('click', async () => {
        const toInt = id => parseInt(container.querySelector(id).value, 10) || 0;
        try {
            await window.go.main.App.SaveGeneralQuotaRecord({
                admissionYear: Number(year), quota: toInt('#genQuotaInput'), applicants: toInt('#genApplicantsInput'),
                note: container.querySelector('#genQuotaNote').value.trim()
            });
            renderGeneralCutoffPanel(container, year);
        } catch (e) {
            alert(`정원 자료 저장 실패: ${e}`);
        }
    });
}
