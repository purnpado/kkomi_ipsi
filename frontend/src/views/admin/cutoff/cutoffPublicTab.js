import { normalizeSchoolName } from '../../../core/utils.js';
import { showModalAlert, showModalConfirm } from '../../../core/dialogs.js';
import { app } from '../../../core/dom.js';
import { renderAddPublicDataModal } from './publicDataModal.js';
import { navigate, notifyStatsRecalculated } from '../../../core/navigation.js';
import { admissionLabel } from '../../../core/admissionYear.js';

// 커트라인 관리: 공식자료 탭 전용 이벤트
export function bindPublicDataTab(ctx, ui) {
    if (ctx.currentTab === 'public') {
        // 연도 필터링 버튼 이벤트
        document.getElementById('btnFilterPublicCurrentYear')?.addEventListener('click', () => {
            ctx.publicYearFilterMode = 'current';
            ctx.renderMainScreen();
        });
        document.getElementById('btnFilterPublicAllYears')?.addEventListener('click', () => {
            ctx.publicYearFilterMode = 'all';
            ctx.renderMainScreen();
        });

        // 전체 선택 / 해제 체크박스 이벤트
        const checkAllBox = document.getElementById('checkAllPublicItems');
        checkAllBox?.addEventListener('change', (e) => {
            const checked = e.target.checked;
            app.querySelectorAll('.public-item-check').forEach(cb => { cb.checked = checked; });
        });

        // 전체 일괄 반영 버튼 이벤트
        document.getElementById('btnApplyAllPublic')?.addEventListener('click', async () => {
            const visibleCheckboxes = Array.from(app.querySelectorAll('.public-item-check'));
            const allIndices = visibleCheckboxes.map(cb => Number(cb.dataset.index));
            if (allIndices.length === 0) {
                await showModalAlert({ title: '안내', message: '반영할 공개 데이터가 없습니다.', type: 'info' });
                return;
            }
            const confirmed = await showModalConfirm({
                title: '공개 데이터 일괄 반영',
                message: `현재 화면에 표시된 <strong>${allIndices.length}개</strong> 공개 데이터를 각 연도별 고교 커트라인에 일괄 반영하시겠습니까?`,
                confirmText: '일괄 반영',
                type: 'info'
            });
            if (confirmed) {
                await ui.applyPublicDataIndices(allIndices);
            }
        });

        // 선택 항목 반영 버튼 이벤트
        document.getElementById('btnApplySelectedPublic')?.addEventListener('click', async () => {
            const checkedBoxes = Array.from(app.querySelectorAll('.public-item-check:checked'));
            const selectedIndices = checkedBoxes.map(cb => Number(cb.dataset.index));
            if (selectedIndices.length === 0) {
                await showModalAlert({ title: '선택 확인', message: '반영할 항목의 체크박스를 1개 이상 선택해주세요.', type: 'warning' });
                return;
            }
            await ui.applyPublicDataIndices(selectedIndices);
        });

        // 선택 항목 삭제 버튼 이벤트
        document.getElementById('btnDeleteSelectedPublic')?.addEventListener('click', async () => {
            const checkedBoxes = Array.from(app.querySelectorAll('.public-item-check:checked'));
            const selectedIndices = checkedBoxes.map(cb => Number(cb.dataset.index)).sort((a, b) => b - a);
            if (selectedIndices.length === 0) {
                await showModalAlert({ title: '선택 확인', message: '삭제할 항목의 체크박스를 1개 이상 선택해주세요.', type: 'warning' });
                return;
            }
            const confirmed = await showModalConfirm({
                title: '공개자료 삭제',
                message: `선택한 <strong>${selectedIndices.length}개</strong> 공개자료 항목을 삭제하시겠습니까?`,
                confirmText: '삭제',
                type: 'warning'
            });
            if (confirmed) {
                const toDelete = [];
                selectedIndices.forEach(idx => {
                    if (idx >= 0 && idx < ctx.publicOfficialData.length) {
                        const item = ctx.publicOfficialData[idx];
                        if (item) {
                            toDelete.push({
                                year: item.year || ctx.currentAdmissionYear,
                                schoolName: item.school,
                                department: ctx.normalizeDept(item.dept),
                                track: ctx.normalizeTrack(item.track)
                            });
                        }
                        ctx.publicOfficialData.splice(idx, 1);
                    }
                });
                await ctx.syncPublicOfficialData();
                if (toDelete.length > 0 && window.go?.main?.App?.DeleteCutoffs) {
                    try {
                        await window.go.main.App.DeleteCutoffs(toDelete);
                        ctx.allSavedCutoffs = await window.go.main.App.GetCutoffs() || [];
                        notifyStatsRecalculated({ cutoffs: ctx.allSavedCutoffs });
                    } catch (e) {
                        console.warn('DB 커트라인 삭제 연동 실패:', e);
                    }
                }
                ctx.renderMainScreen();
            }
        });

        // 테이블 학교명 셀 변경 동기화
        app.querySelectorAll('.public-school-select').forEach(sel => {
            sel.addEventListener('change', async (e) => {
                const newSchool = e.target.value;
                const oldSchool = sel.dataset.groupSchool;
                const gYear = Number(sel.dataset.groupYear);
                ctx.publicOfficialData.forEach(item => {
                    if (item.year === gYear && normalizeSchoolName(item.school) === normalizeSchoolName(oldSchool)) {
                        item.school = newSchool;
                        item.unit = newSchool.includes('일반계고') ? '%' : '점';
                    }
                });
                await ctx.syncPublicOfficialData();
                ctx.renderMainScreen();
            });
        });

        // 인풋 실시간 동기화
        const updateField = async (input, field, isNum = false) => {
            const idx = Number(input.dataset.index);
            if (ctx.publicOfficialData[idx]) {
                const val = input.value.trim();
                ctx.publicOfficialData[idx][field] = isNum ? (parseFloat(val) || '') : val;
                await ctx.syncPublicOfficialData();
            }
        };
        app.querySelectorAll('.public-dept').forEach(inp => inp.addEventListener('change', () => updateField(inp, 'dept')));
        app.querySelectorAll('.public-track').forEach(inp => inp.addEventListener('change', () => updateField(inp, 'track')));
        app.querySelectorAll('.public-min-score').forEach(inp => inp.addEventListener('change', () => updateField(inp, 'min', true)));
        app.querySelectorAll('.public-max-score').forEach(inp => inp.addEventListener('change', () => updateField(inp, 'max', true)));
        app.querySelectorAll('.public-avg-score').forEach(inp => inp.addEventListener('change', () => updateField(inp, 'avg', true)));
        app.querySelectorAll('.public-note').forEach(inp => inp.addEventListener('change', () => updateField(inp, 'note')));
        app.querySelectorAll('.public-year').forEach(inp => inp.addEventListener('change', () => updateField(inp, 'year', true)));

        // 공식 공개자료 추가 버튼
        document.getElementById('addPublicDataBtn')?.addEventListener('click', async () => {
            await renderAddPublicDataModal(ctx.currentAdmissionYear, ctx.admissionYears, async (newEntry) => {
                ctx.publicOfficialData.unshift(newEntry);
                await ctx.syncPublicOfficialData();
                ctx.renderMainScreen();
            });
        });

        // 개별 행 삭제 버튼 (UI 및 DB 즉시 삭제 연동)
        app.querySelectorAll('.btn-delete-public-item').forEach(btn => {
            btn.addEventListener('click', async () => {
                const index = Number(btn.dataset.index);
                if (index >= 0 && index < ctx.publicOfficialData.length) {
                    const item = ctx.publicOfficialData[index];
                    if (item && window.go?.main?.App?.DeleteCutoff) {
                        try {
                            await window.go.main.App.DeleteCutoff(
                                item.year || ctx.currentAdmissionYear,
                                item.school,
                                ctx.normalizeDept(item.dept),
                                ctx.normalizeTrack(item.track)
                            );
                            ctx.allSavedCutoffs = await window.go.main.App.GetCutoffs() || [];
                            notifyStatsRecalculated({ cutoffs: ctx.allSavedCutoffs });
                        } catch (e) {
                            console.warn('DB 커트라인 삭제 연동 실패:', e);
                        }
                    }
                    ctx.publicOfficialData.splice(index, 1);
                    await ctx.syncPublicOfficialData();
                    ctx.renderMainScreen();
                }
            });
        });
    }
}

// 커트라인 관리: 돌아가기
// (전체연도 일괄 저장·예전 형식 관내 자료 내보내기/병합 버튼은 뺐다 — 지난 해 커트라인을 덮어쓰거나 점검 없이 다른 학교 자료를 넣었다.
//  관내 공유는 [관내 공유 결과] 메뉴의 새 형식으로 한다. 백엔드 ExportJointShareData·ImportJointShareData는 호환을 위해 남겨 둔다.)
export function bindCutoffShareAndBack(ctx, ui) {
    // 11. 대시보드로 돌아가기
    document.getElementById('backToAdminBtn')?.addEventListener('click', () => {
        navigate('admin', { schoolName: ctx.schoolName });
    });
}
