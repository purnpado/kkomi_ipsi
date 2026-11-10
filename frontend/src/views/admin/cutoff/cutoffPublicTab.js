import { normalizeSchoolName } from '../../../core/utils.js';
import { showModalAlert, showModalConfirm } from '../../../core/dialogs.js';
import { app } from '../../../core/dom.js';
import { renderAddPublicDataModal } from './publicDataModal.js';
import { navigate, notifyStatsRecalculated } from '../../../core/navigation.js';

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

// 커트라인 관리: 전체 연도 저장·관내 공유·돌아가기
export function bindCutoffShareAndBack(ctx, ui) {
    // 전체 연도 일괄 저장 버튼 이벤트 연결
    document.getElementById('saveAllYearsCutoffsBtn')?.addEventListener('click', () => {
        ui.saveAllYearsCutoffs();
    });

    // 9. 관내 진학자료 내보내기 (커트라인 + 지원현황 통계 + 공식자료 오프라인 패키징)
    document.getElementById('exportJointDataBtn')?.addEventListener('click', async () => {
        const btn = document.getElementById('exportJointDataBtn');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> 내보내는 중...';
        try {
            // 현재 수정 중인 커트라인 우선 자동 저장
            await ui.saveAllCutoffs(true);
            const path = await window.go.main.App.ExportJointShareData(ctx.currentAdmissionYear);
            if (path) {
                await showModalAlert({
                    title: '자료 내보내기 완료',
                    message: `<strong>${ctx.currentAdmissionYear}학년도</strong> 관내 진학자료가 안전하게 저장되었습니다!<br><br>📂 <strong>저장 파일:</strong><br><span class="text-xs text-indigo-300 font-mono break-all">${path}</span><br><br><span class="text-emerald-400 text-xs">✓ 학생 성명, 학급 등 개인정보는 100% 원천 배제되었습니다.<br>✓ 이 파일을 타 학교 진학 담당 선생님께 전달하여 공유하세요.</span>`,
                    type: 'success'
                });
            }
        } catch (err) {
            await showModalAlert({ title: '내보내기 실패', message: String(err), type: 'error' });
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<span>📤</span> 자료 내보내기';
        }
    });

    // 10. 타교 진학자료 병합 (타 학교 커트라인, 합격결과, 공식자료 스마트 병합)
    document.getElementById('importJointDataBtn')?.addEventListener('click', async () => {
        const btn = document.getElementById('importJointDataBtn');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> 병합 중...';
        try {
            const res = await window.go.main.App.ImportJointShareData(ctx.currentAdmissionYear);
            if (res) {
                ctx.allSavedCutoffs = await window.go.main.App.GetCutoffs() || [];
                const totalAllYears = (ctx.allSavedCutoffs || []).length;
                await showModalAlert({
                    title: '타교자료 일괄 병합 완료',
                    message: `선택하신 타 학교 진학자료가 성공적으로 병합되었습니다!<br><br>` +
                             `• 처리된 파일: <strong>${res.files || 1}개 학교 자료</strong><br>` +
                             `• 커트라인 갱신: 총 <strong>${res.cutoffs || 0}건</strong> (전체 학년도 누적 병합)<br>` +
                             `• 타교 지원현황 합격선 반영: <strong>${res.applications || 0}건</strong><br>` +
                             `• 공식 공개자료 보완: <strong>${res.official || 0}건</strong><br><br>` +
                             `<span class="text-xs text-slate-400 block">💡 상단 학년도(2026, 2025 등)를 전환하시면 각 학년도별로 분할 저장된 커트라인(${res.cutoffs || 0}건 중 해당 연도분)을 확인하실 수 있습니다. (전체 보관: ${totalAllYears}건)</span>`,
                    type: 'success'
                });
                ctx.renderMainScreen();
            }
        } catch (err) {
            await showModalAlert({ title: '병합 실패', message: String(err), type: 'error' });
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<span>📥</span> 타교자료 병합';
        }
    });

    // 11. 대시보드로 돌아가기
    document.getElementById('backToAdminBtn')?.addEventListener('click', () => {
        navigate('admin', { schoolName: ctx.schoolName });
    });
}
