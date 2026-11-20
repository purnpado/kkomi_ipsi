import { normalizeSchoolName } from '../../../core/utils.js';
import { showModalAlert, showModalConfirm } from '../../../core/dialogs.js';
import { app } from '../../../core/dom.js';
import { notifyStatsRecalculated } from '../../../core/navigation.js';
import { admissionLabel } from '../../../core/admissionYear.js';
import { openCompetitionModal } from './competitionModal.js';
import { applyCutoffFilter, confirmDiscard, markRowDirty } from './cutoffList.js';
import { chooseResetScope, chooseSourceYear } from './cutoffDialogs.js';

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

        // 학년도 고르기 창에서 이미 확인했다.

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
                markRowDirty(tr); // 채운 값은 [저장]해야 반영된다
                filledCount++;
            }
        });

        await showModalAlert({
            title: '복사 완료',
            message: `<strong>${admissionLabel(sourceYear)}</strong> 커트라인 중 <strong>${filledCount}개</strong> 항목을 칸에 채웠습니다.<br><br>확인한 뒤 위쪽 <strong>[💾 저장]</strong>을 눌러야 반영됩니다.`,
            type: 'success'
        });
    };

    // 0-1. 다른 학년도 복사 버튼 클릭 시
    // 공식 경쟁률(모집정원·지원자 수) 입력 창
    document.getElementById('openCompetitionBtn')?.addEventListener('click', () => openCompetitionModal(ctx));

    document.getElementById('copyFromOtherYearBtn')?.addEventListener('click', async () => {
        const availableYears = ctx.admissionYears.filter(y => Number(y) !== Number(ctx.currentAdmissionYear) && ctx.getCutoffCountByYear(y) > 0);
        if (availableYears.length === 0) {
            await showModalAlert({
                title: '복사 가능한 연도 없음',
                message: '다른 고입 연도에 저장된 커트라인이 없습니다.<br>커트라인을 직접 넣거나 [고교 발표 자료(참고)]에서 반영해 주세요.',
                type: 'info'
            });
            return;
        }

        // 가져올 학년도를 고른다(예전에는 가장 최근 학년도만 가져왔다).
        const year = await chooseSourceYear(admissionLabel(ctx.currentAdmissionYear),
            availableYears.map((y) => ({ year: y, label: `${admissionLabel(y)} (${ctx.getCutoffCountByYear(y)}건)` })));
        if (year) await executeCopyFromYear(year);
    });

    // 0-2. 배너의 바로 복사 버튼
    document.getElementById('quickCopyYearBtn')?.addEventListener('click', async (e) => {
        const yr = e.currentTarget.dataset.year;
        if (yr) {
            await executeCopyFromYear(yr);
        }
    });

    // 1. 입학년도 변경 이벤트: 선택 즉시 해당 연도 데이터 로드
    document.getElementById('admissionYearSelect')?.addEventListener('change', async (e) => {
        if (!(await confirmDiscard())) {
            e.target.value = String(ctx.currentAdmissionYear); // 저장하지 않은 변경을 지키려고 그대로 둔다
            return;
        }
        ctx.currentAdmissionYear = parseInt(e.target.value, 10);
        ctx.renderMainScreen();
    });

    // 2. 스마트 실시간 검색 이벤트
    const searchInput = document.getElementById('cutoffSchoolSearch');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            ctx.searchKeyword = e.target.value.trim();
            // 학교 목록은 다시 그리지 않고 숨기기만 한다(입력한 값이 지워지지 않음). 발표 자료 탭은 예전처럼 다시 그린다.
            if (ctx.currentTab !== 'public') return applyCutoffFilter(ctx);
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
        btn.addEventListener('click', async () => {
            const next = btn.dataset.tab;
            const redraw = next === 'public' || ctx.currentTab === 'public';
            if (!redraw) {
                // 학교 종류 탭: 다시 그리지 않고 숨기기만(입력한 값 유지)
                ctx.currentTab = next;
                app.querySelectorAll('.nav-tab-btn').forEach((b) => {
                    const on = b.dataset.tab === next;
                    b.classList.toggle('bg-primary', on);
                    b.classList.toggle('text-white', on);
                    b.classList.toggle('shadow-md', on);
                    b.classList.toggle('bg-slate-800/60', !on && b.dataset.tab !== 'public');
                    b.classList.toggle('text-slate-400', !on && b.dataset.tab !== 'public');
                });
                return applyCutoffFilter(ctx);
            }
            if (!(await confirmDiscard())) return;
            ctx.currentTab = next;
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
                tr.className = 'cutoff-item-row';
                tr.dataset.school = schName;
                tr.dataset.type = scoreType;
                const unit = scoreType === 'percentile' ? '%' : '점';
                tr.innerHTML = `
                        <td class="cutoff-dept-cell"><input type="text" class="input-field cutoff-edit row-dept-name" value="" placeholder="비우면 학교 전체" aria-label="학과명" /></td>
                        <td><input type="text" class="input-field cutoff-edit row-track-name" value="일반" placeholder="전형 (예: 일반, 취업희망자)" aria-label="전형" /></td>
                        <td class="text-center"><span class="cutoff-score"><input type="text" inputmode="decimal" class="input-field cutoff-num row-min-score" value="" placeholder="–" aria-label="최저점" /><span>${unit}</span></span></td>
                        <td class="text-center"><span class="cutoff-score"><input type="text" inputmode="decimal" class="input-field cutoff-num row-max-score" value="" placeholder="–" aria-label="최고 불합격점" /><span>${unit}</span></span></td>
                        <input type="hidden" class="row-avg-score" value="" />
                        <td class="text-center"><button type="button" class="cutoff-icon-btn btn-delete-row" title="행 삭제" aria-label="행 삭제">🗑️</button></td>
                    `;
                tbody.appendChild(tr);
                card.open = true;
                markRowDirty(tr);
                tr.querySelector('.row-dept-name')?.focus();
                tr.querySelector('.btn-delete-row').addEventListener('click', () => { tr.remove(); markRowDirty(null); });
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
        // 한 창에서 범위를 고른다. 취소·Esc는 아무것도 지우지 않는다(5개년 전체는 "전체 지우기"를 직접 써야 함).
        const scope = await chooseResetScope(admissionLabel(ctx.currentAdmissionYear));
        if (!scope) return;
        const isAllYears = scope === 'all';
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
                title: '지우기 완료',
                message: isAllYears 
                    ? '5개년 전체 커트라인과 고교 발표 자료를 지웠습니다.' 
                    : `<strong>${admissionLabel(ctx.currentAdmissionYear)}</strong>의 커트라인을 지웠습니다.`,
                type: 'success'
            });
            ctx.renderMainScreen();
        } catch (err) {
            await showModalAlert({ title: '초기화 실패', message: String(err), type: 'error' });
        }
    });
}
