import { normalizeSchoolName } from '../../../core/utils.js';
import { showModalAlert, showModalConfirm } from '../../../core/dialogs.js';
import { app } from '../../../core/dom.js';
import { notifyStatsRecalculated } from '../../../core/navigation.js';
import { admissionLabel } from '../../../core/admissionYear.js';

// 커트라인 관리: 연도 복사·연도 선택·검색·탭 전환
export function bindCutoffYearAndSearch(ctx, ui) {
    // 다른 학년도 커트라인 복사 공통 함수
    const executeCopyFromYear = async (sourceYear) => {
        const sourceData = (ctx.allSavedCutoffs || []).filter(c => Number(c.year) === Number(sourceYear) && Number(c.minValue) > 0);
        if (sourceData.length === 0) {
            await showModalAlert({
                title: '복사 불가',
                message: `<strong>${admissionLabel(sourceYear)}</strong>에는 저장된 유효 커트라인 점수가 없습니다.`,
                type: 'warning'
            });
            return;
        }

        const confirmed = await showModalConfirm({
            title: '커트라인 데이터 복사',
            message: `<strong>${admissionLabel(sourceYear)}</strong>의 커트라인(총 <strong>${sourceData.length}건</strong>)을 현재 <strong>${admissionLabel(ctx.currentAdmissionYear)}</strong>로 복사해 오시겠습니까?<br><br><span class="text-xs text-amber-300">※ 복사 후 상단의 <strong>[💾 커트라인 저장]</strong> 버튼을 누르시면 ${admissionLabel(ctx.currentAdmissionYear)} 데이터로 DB에 최종 저장됩니다.</span>`,
            confirmText: '복사하기',
            type: 'info'
        });

        if (!confirmed) return;

        const rows = app.querySelectorAll('.cutoff-item-row');
        let filledCount = 0;
        rows.forEach(tr => {
            const schName = normalizeSchoolName(tr.dataset.school || '');
            const dept = ctx.normalizeDept(tr.querySelector('.row-dept-name')?.value || tr.dataset.dept || '');
            const track = ctx.normalizeTrack(tr.querySelector('.row-track-name')?.value || tr.dataset.track || '일반');

            const match = sourceData.find(c =>
                normalizeSchoolName(c.schoolName) === schName &&
                ctx.normalizeDept(c.department) === dept &&
                ctx.normalizeTrack(c.track) === track
            );

            if (match) {
                const minInput = tr.querySelector('.row-min-score');
                const maxInput = tr.querySelector('.row-max-score');
                const avgInput = tr.querySelector('.row-avg-score');
                if (minInput) minInput.value = match.minValue || '';
                if (maxInput) maxInput.value = match.maxValue || '';
                if (avgInput) avgInput.value = match.avgValue || '';
                filledCount++;
            }
        });

        await showModalAlert({
            title: '복사 완료',
            message: `<strong>${admissionLabel(sourceYear)}</strong> 커트라인 중 <strong>${filledCount}개</strong> 항목이 현재 화면에 채워졌습니다!<br><br>내용을 확인하신 후 상단의 <strong>[💾 커트라인 저장]</strong> 버튼을 꼭 눌러주세요.`,
            type: 'success'
        });
    };

    // 0-1. 다른 학년도 복사 버튼 클릭 시
    document.getElementById('copyFromOtherYearBtn')?.addEventListener('click', async () => {
        const availableYears = ctx.admissionYears.filter(y => Number(y) !== Number(ctx.currentAdmissionYear) && ctx.getCutoffCountByYear(y) > 0);
        if (availableYears.length === 0) {
            await showModalAlert({
                title: '복사 가능한 연도 없음',
                message: '다른 고입 연도에 저장된 커트라인 데이터가 없습니다.<br>타교자료를 병합하거나 직접 커트라인을 먼저 입력해 주세요.',
                type: 'info'
            });
            return;
        }

        if (availableYears.length === 1) {
            await executeCopyFromYear(availableYears[0]);
        } else {
            // 여러 연도가 있을 경우 가장 최근 등록 연도로 복사 확인
            await executeCopyFromYear(availableYears[0]);
        }
    });

    // 0-2. 배너의 바로 복사 버튼
    document.getElementById('quickCopyYearBtn')?.addEventListener('click', async (e) => {
        const yr = e.currentTarget.dataset.year;
        if (yr) {
            await executeCopyFromYear(yr);
        }
    });

    // 1. 입학년도 변경 이벤트: 선택 즉시 해당 연도 데이터 로드
    document.getElementById('admissionYearSelect')?.addEventListener('change', (e) => {
        ctx.currentAdmissionYear = parseInt(e.target.value, 10);
        ctx.renderMainScreen();
    });

    // 2. 스마트 실시간 검색 이벤트
    const searchInput = document.getElementById('cutoffSchoolSearch');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            ctx.searchKeyword = e.target.value.trim();
            ctx.renderMainScreen();
            const freshInput = document.getElementById('cutoffSchoolSearch');
            if (freshInput) {
                freshInput.focus();
                freshInput.selectionStart = freshInput.selectionEnd = freshInput.value.length;
            }
        });
        document.getElementById('clearCutoffSearch')?.addEventListener('click', () => {
            ctx.searchKeyword = '';
            ctx.renderMainScreen();
        });
    }

    // 3. 탭 전환 이벤트
    app.querySelectorAll('.nav-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            ctx.currentTab = btn.dataset.tab;
            ctx.renderMainScreen();
        });
    });
}

// 커트라인 관리: 행 삭제·학과명 편집·학과 추가
export function bindCutoffRowEditing(ctx, ui) {
    // 4. 행 삭제 이벤트 (UI 제거 및 백엔드 DB 삭제 즉시 연동)
    app.querySelectorAll('.btn-delete-row').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const tr = e.target.closest('tr');
            if (tr) {
                const school = tr.dataset.school;
                const dept = tr.querySelector('.row-dept-name')?.value.trim() ?? tr.dataset.dept ?? '';
                const track = tr.querySelector('.row-track-name')?.value.trim() || '일반';
                ctx.deletedCutoffList.push({
                    year: ctx.currentAdmissionYear,
                    schoolName: school,
                    department: ctx.normalizeDept(dept),
                    track: ctx.normalizeTrack(track)
                });
                tr.remove();
                if (window.go?.main?.App?.DeleteCutoff) {
                    try {
                        await window.go.main.App.DeleteCutoff(ctx.currentAdmissionYear, school, ctx.normalizeDept(dept), ctx.normalizeTrack(track));
                        ctx.allSavedCutoffs = (ctx.allSavedCutoffs || []).filter(c => 
                            !(c.year === ctx.currentAdmissionYear && normalizeSchoolName(c.schoolName) === normalizeSchoolName(school) && ctx.normalizeDept(c.department) === ctx.normalizeDept(dept) && ctx.normalizeTrack(c.track) === ctx.normalizeTrack(track))
                        );
                        notifyStatsRecalculated({ cutoffs: ctx.allSavedCutoffs });
                    } catch (delErr) {
                        console.warn('DB 커트라인 삭제 연동 경고:', delErr);
                    }
                }
            }
        });
    });

    // 5. 병합된 학과 셀 수정 동기화
    app.querySelectorAll('.row-dept-name[data-dept-group]').forEach(input => {
        input.addEventListener('input', () => {
            const dept = input.value.trim();
            app.querySelectorAll(`.cutoff-item-row[data-dept-group="${input.dataset.deptGroup}"]`)
                .forEach(row => { row.dataset.dept = dept; });
        });
    });

    // 6. 학과·전형 추가 이벤트
    app.querySelectorAll('.btn-add-dept').forEach(btn => {
        btn.addEventListener('click', () => {
            const schName = btn.dataset.school;
            const scoreType = btn.dataset.type;
            const card = btn.closest('.school-cutoff-card');
            const tbody = card.querySelector('tbody');
            if (tbody) {
                const tr = document.createElement('tr');
                tr.className = "border-b border-slate-700/40 hover:bg-slate-800/40 transition-colors cutoff-item-row";
                tr.dataset.school = schName;
                tr.dataset.type = scoreType;
                const unit = scoreType === 'percentile' ? '%' : '점';
                tr.innerHTML = `
                        <td class="p-3">
                            <input type="text" class="input-field py-1.5 px-2.5 text-xs font-bold text-white row-dept-name" value="" placeholder="비우면 학교 전체" />
                        </td>
                        <td class="p-3">
                            <input type="text" class="input-field py-1.5 px-2.5 text-xs text-indigo-300 row-track-name" value="일반" placeholder="전형 (예: 일반)" />
                        </td>
                        <td class="p-3 text-center">
                            <div class="flex items-center justify-center gap-1">
                                <input type="text" inputmode="decimal" class="input-field py-1.5 px-2 text-xs text-right font-bold text-emerald-300 w-28 row-min-score" 
                                       value="" placeholder="최저점" />
                                <span class="text-xs text-slate-400">${unit}</span>
                            </div>
                        </td>
                        <td class="p-3 text-center">
                            <div class="flex items-center justify-center gap-1">
                                <input type="text" inputmode="decimal" class="input-field py-1.5 px-2 text-xs text-right font-semibold text-sky-300 w-28 row-max-score" 
                                       value="" placeholder="선택" />
                                <span class="text-xs text-slate-400">${unit}</span>
                            </div>
                        </td>
                        <input type="hidden" class="row-avg-score" value="" />
                        <td class="p-3 text-center">
                            <button class="text-xs text-danger/80 hover:text-danger hover:bg-danger/10 p-1.5 rounded transition-colors btn-delete-row" title="행 삭제">🗑️</button>
                        </td>
                    `;
                tbody.appendChild(tr);
                tr.querySelector('.btn-delete-row').addEventListener('click', () => tr.remove());
            }
        });
    });
}

// 커트라인 관리: 공식자료 반영·전체 저장·초기화 버튼
export function bindPublicDataApply(ctx, ui) {
    // 공개 데이터 일괄/선택 반영 헬퍼 함수
    ui.applyPublicDataIndices = async (indices) => {
        if (!indices || indices.length === 0) {
            await showModalAlert({
                title: '선택 확인',
                message: '반영할 항목을 선택해주세요.',
                type: 'warning'
            });
            return;
        }

        const newCutoffs = [];
        indices.forEach(idx => {
            const item = ctx.publicOfficialData[idx];
            if (!item || !item.school || !item.min || Number(item.min) <= 0) return;
            const min = parseFloat(item.min);
            const max = parseFloat(item.max);
            const avg = parseFloat(item.avg);
            const targetYear = item.year || ctx.currentAdmissionYear;
            const scoreType = String(item.school).includes('일반계고') ? 'percentile' : 'total_score';

            newCutoffs.push({
                year: targetYear,
                schoolName: item.school,
                department: ctx.normalizeDept(item.dept),
                track: ctx.normalizeTrack(item.track),
                scoreType: scoreType,
                minValue: min,
                maxValue: Number.isFinite(max) && max > 0 ? max : min,
                avgValue: Number.isFinite(avg) && avg > 0 ? avg : 0
            });
        });

        if (newCutoffs.length === 0) {
            await showModalAlert({
                title: '반영 대상 없음',
                message: '선택한 항목 중 유효한 고교명과 최저 합격선(양수)이 입력된 항목이 없습니다.',
                type: 'warning'
            });
            return;
        }

        try {
            await window.go.main.App.SaveCutoffs(newCutoffs);
            ctx.allSavedCutoffs = await window.go.main.App.GetCutoffs() || [];
            notifyStatsRecalculated({ cutoffs: ctx.allSavedCutoffs });
            await showModalAlert({
                title: '커트라인 반영 완료',
                message: `총 <strong>${newCutoffs.length}건</strong>의 공식 입결 데이터가 각 연도별 고교 커트라인으로 성공적으로 반영되었습니다!<br><br>이제 신호등 종합 매트릭스와 진학 상담 화면에서 실시간 적용됩니다.`,
                type: 'success'
            });
            ctx.renderMainScreen();
        } catch (err) {
            await showModalAlert({ title: '반영 실패', message: String(err), type: 'error' });
        }
    };

    // 7. 개별 공개 데이터 복사 적용 버튼
    app.querySelectorAll('.btn-apply-public-item').forEach(btn => {
        btn.addEventListener('click', async () => {
            const idx = Number(btn.dataset.index);
            await ui.applyPublicDataIndices([idx]);
        });
    });

    document.getElementById('saveAllCutoffsBtn')?.addEventListener('click', () => ui.saveAllCutoffs(false));

    // 7-1. 커트라인 초기화 버튼 이벤트 (연도별 선택 또는 전체 초기화)
    document.getElementById('resetCutoffsBtn')?.addEventListener('click', async () => {
        const confirmed = await showModalConfirm({
            title: '커트라인 초기화 확인',
            message: `현재 선택된 <strong>${admissionLabel(ctx.currentAdmissionYear)}</strong> 커트라인을 초기화하시겠습니까?<br><br><span class="text-xs text-slate-400">※ 전체 5개년 모든 데이터를 완전 백지화하려면 다음 질문에서 전체 초기화를 선택할 수 있습니다.</span>`,
            confirmText: '초기화 진행',
            type: 'warning'
        });
        if (!confirmed) return;

        const isAllYears = await showModalConfirm({
            title: '전체 연도 초기화 선택',
            message: `모든 연도(5개년 전체)의 커트라인과 공개 입결 데이터를 완전 백지화하시겠습니까?<br><br>- <strong>[전체 백지화]</strong>: 5개년 전체 데이터 삭제<br>- <strong>[해당 연도만]</strong>: 현재 ${admissionLabel(ctx.currentAdmissionYear)} 데이터만 삭제`,
            confirmText: '전체 백지화',
            cancelText: '해당 연도만',
            type: 'error'
        });

        try {
            if (isAllYears) {
                if (window.go?.main?.App?.ResetCutoffs) {
                    await window.go.main.App.ResetCutoffs(0);
                }
                ctx.publicOfficialData = [];
                await ctx.syncPublicOfficialData();
            } else {
                if (window.go?.main?.App?.ResetCutoffs) {
                    await window.go.main.App.ResetCutoffs(ctx.currentAdmissionYear);
                }
                ctx.publicOfficialData = ctx.publicOfficialData.filter(item => Number(item.year) !== ctx.currentAdmissionYear);
                await ctx.syncPublicOfficialData();
            }
            ctx.allSavedCutoffs = await window.go.main.App.GetCutoffs() || [];
            notifyStatsRecalculated({ cutoffs: ctx.allSavedCutoffs });
            await showModalAlert({
                title: '초기화 완료',
                message: isAllYears 
                    ? '전체 연도의 고교 커트라인 및 공개 입결 데이터가 완전히 초기화되었습니다.' 
                    : `<strong>${admissionLabel(ctx.currentAdmissionYear)}</strong>의 고교 커트라인이 안전하게 초기화되었습니다.`,
                type: 'success'
            });
            ctx.renderMainScreen();
        } catch (err) {
            await showModalAlert({ title: '초기화 실패', message: String(err), type: 'error' });
        }
    });
}
