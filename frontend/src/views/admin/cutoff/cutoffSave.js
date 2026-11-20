import { showModalAlert, showModalConfirm } from '../../../core/dialogs.js';
import { app } from '../../../core/dom.js';
import { notifyStatsRecalculated } from '../../../core/navigation.js';
import { admissionLabel } from '../../../core/admissionYear.js';

// 커트라인 관리: 현재 연도·전체 연도 저장 함수
export function defineCutoffSavers(ctx, ui) {
    // 8. 전체 저장 함수 (공개자료 탭일 때는 공개자료 자동 일괄 반영 연동)
    ui.saveAllCutoffs = async (silent = false) => {
        // 만약 현재 공개자료 탭을 보고 있다면: 공개 데이터를 실제 고교 커트라인으로 일괄 반영 처리!
        if (ctx.currentTab === 'public') {
            const visibleCheckboxes = Array.from(app.querySelectorAll('.public-item-check'));
            const allIndices = visibleCheckboxes.map(cb => Number(cb.dataset.index));
            if (allIndices.length > 0) {
                const confirmed = await showModalConfirm({
                    title: '공식 데이터 일괄 반영',
                    message: `공개자료 탭에 표시된 <strong>${allIndices.length}개</strong> 공식 데이터를 현재 선택한 고입 연도 커트라인으로 일괄 반영 및 저장하시겠습니까?`,
                    confirmText: '반영 및 저장',
                    type: 'info'
                });
                if (confirmed) {
                    await ui.applyPublicDataIndices(allIndices);
                    return true;
                }
            }
        }

        const rows = app.querySelectorAll('.cutoff-item-row');
        const cutoffs = [];

        rows.forEach(tr => {
            const school = tr.dataset.school;
            const scoreType = tr.dataset.type;
            const dept = tr.querySelector('.row-dept-name')?.value.trim() ?? tr.dataset.dept ?? '';
            const track = tr.querySelector('.row-track-name')?.value.trim() || '일반';
            const minStr = tr.querySelector('.row-min-score')?.value.trim();
            const maxStr = tr.querySelector('.row-max-score')?.value.trim();
            const avgStr = tr.querySelector('.row-avg-score')?.value.trim();

            const minVal = parseFloat(minStr);
            const maxVal = parseFloat(maxStr);
            const avgVal = parseFloat(avgStr);

            if (!isNaN(minVal) && minVal > 0) {
                cutoffs.push({
                    year: ctx.currentAdmissionYear,
                    schoolName: school,
                    department: dept,
                    track: track,
                    scoreType: scoreType,
                    minValue: minVal,
                    maxValue: !isNaN(maxVal) && maxVal > 0 ? maxVal : minVal,
                    avgValue: !isNaN(avgVal) && avgVal > 0 ? avgVal : 0
                });
            } else if (school) {
                // 점수란을 지워 비워둔 항목은 DB에서도 삭제 대상으로 등록
                ctx.deletedCutoffList.push({
                    year: ctx.currentAdmissionYear,
                    schoolName: school,
                    department: ctx.normalizeDept(dept),
                    track: ctx.normalizeTrack(track)
                });
            }
        });

        // 삭제 대기 중인 항목들이 있으면 DB에서 영구 삭제
        if (ctx.deletedCutoffList.length > 0 && window.go?.main?.App?.DeleteCutoffs) {
            try {
                await window.go.main.App.DeleteCutoffs(ctx.deletedCutoffList);
            } catch (delErr) {
                console.warn('DB 커트라인 삭제 연동 실패:', delErr);
            }
            ctx.deletedCutoffList = [];
        }

        if (cutoffs.length === 0) {
            ctx.allSavedCutoffs = await window.go.main.App.GetCutoffs() || [];
            notifyStatsRecalculated({ cutoffs: ctx.allSavedCutoffs });
            if (!silent) {
                const totalAllYears = (ctx.allSavedCutoffs || []).length;
                await showModalAlert({
                    title: '커트라인 저장 완료',
                    message: `<strong>${admissionLabel(ctx.currentAdmissionYear)}</strong>에는 입력된 커트라인 점수가 없어 해당 연도 커트라인이 빈 상태(초기화)로 저장되었습니다.<br><span class="text-xs text-slate-400 mt-1.5 block">※ 다른 고입 연도의 커트라인은 안전하게 보존됩니다. (전체 누적: 총 <strong>${totalAllYears}건</strong> 유지 중)</span>`,
                    type: 'info'
                });
            }
            ctx.renderMainScreen();
            return true;
        }

        try {
            await window.go.main.App.SaveCutoffs(cutoffs);
            ctx.allSavedCutoffs = await window.go.main.App.GetCutoffs() || [];
            notifyStatsRecalculated({ cutoffs: ctx.allSavedCutoffs });
            if (!silent) {
                const totalAllYears = (ctx.allSavedCutoffs || []).length;
                await showModalAlert({
                    title: '커트라인 저장 완료',
                    message: `<strong>${admissionLabel(ctx.currentAdmissionYear)}</strong> 총 <strong>${cutoffs.length}건</strong>의 고교·학과별 커트라인 및 공식 공개 입결 자료가 안전하게 저장되었습니다!<br><span class="text-xs text-slate-400 mt-1.5 block">※ 전체 고입 연도 누적 커트라인은 총 <strong>${totalAllYears}건</strong>이 안전하게 보관 중입니다.</span>`,
                    type: 'success'
                });
            }
            ctx.renderMainScreen();
            return true;
        } catch (err) {
            await showModalAlert({ title: '저장 실패', message: String(err), type: 'error' });
            return false;
        }
    };
}
