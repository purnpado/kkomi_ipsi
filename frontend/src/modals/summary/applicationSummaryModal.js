import { escapeHtml } from '../../core/utils.js';
import { printOnly } from '../../print/printEngine.js';
import { showModalAlert, showModalConfirm } from '../../core/dialogs.js';
import { openApplicantDetailModal, buildSmartApplicationGroups } from './smartGroups.js';
import { openApplicationRegisterModal } from './registerModal.js';
import { state } from '../../core/store.js';
import { admissionLabel, admissionLongLabel, resolveAdmissionYear } from '../../core/admissionYear.js';
import { notifyStatsRecalculated } from '../../core/navigation.js';

// 1. 우리 반 지원희망 모달 (스마트 지망 가로 뱃지 + 학생 명단 팝업 지원)
export async function openClassApplicationSummaryModal(classNum) {
    document.getElementById('classApplicationSummaryModal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'classApplicationSummaryModal';
    modal.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto';
    modal.innerHTML = '<div class="glass-card p-7"><span class="spinner"></span> 우리 반 지원희망을 집계하는 중...</div>';
    document.body.appendChild(modal);

    try {
        const allRecords = await window.go.main.App.GetSchoolApplicationRecords() || [];
        const classRecords = allRecords.filter(r => r.classNum === classNum);
        const smartGroups = buildSmartApplicationGroups(classRecords);

        let rowsHTML = '<tr><td colspan="12" class="p-10 text-center text-text-muted">우리 반에 기록된 지원희망이 없습니다.</td></tr>';
        if (smartGroups.length > 0) {
            let currentSchool = null, currentYear = null;
            const groupedWithRowSpan = [];

            smartGroups.forEach(g => {
                const isSameGroup = currentSchool === g.schoolName && currentYear === g.admissionYear;
                let rowSpanSchool = 0;
                if (!isSameGroup) {
                    currentSchool = g.schoolName;
                    currentYear = g.admissionYear;
                    rowSpanSchool = smartGroups.filter(x => x.schoolName === currentSchool && x.admissionYear === currentYear).length;
                }
                groupedWithRowSpan.push({ ...g, isFirstGroup: !isSameGroup, rowSpanSchool });
            });

            rowsHTML = groupedWithRowSpan.map(g => {
                const schoolCells = g.isFirstGroup ? `
                    <td class="p-3 border-r border-slate-700/50 text-center font-bold text-slate-300" rowspan="${g.rowSpanSchool}">${admissionLabel(g.admissionYear)}</td>
                    <td class="p-3 border-r border-slate-700/50 text-center font-semibold text-slate-300" rowspan="${g.rowSpanSchool}">${g.categoryLabel}</td>
                    <td class="p-3 border-r border-slate-700/50 font-bold text-white" rowspan="${g.rowSpanSchool}">${g.schoolName}</td>
                ` : '';

                const rankBadges = Object.keys(g.ranks).sort((a, b) => a - b).map(rank => `
                    <button type="button" class="btn-show-class-rank px-2 py-0.5 rounded-md bg-indigo-950/90 hover:bg-indigo-800 text-indigo-200 border border-indigo-500/40 text-[11px] font-semibold transition-colors cursor-pointer"
                            data-group-key="${g.key}" data-rank="${rank}" title="클릭하여 ${rank}지망 학생 명단 보기">
                        ${rank > 0 ? `${rank}지망: ` : ''}<b>${g.ranks[rank].length}명</b>
                    </button>
                `).join('');

                const totalBadge = `
                    <button type="button" class="btn-show-class-all px-2 py-0.5 rounded-md bg-slate-800 hover:bg-slate-700 text-white font-black text-[11px] border border-slate-600 transition-colors cursor-pointer"
                            data-group-key="${g.key}" title="클릭하여 전체 지원 학생 명단 보기">
                        (총 ${g.allStudents.length}명)
                    </button>
                `;

                return `
                    <tr class="border-b border-slate-700/60 hover:bg-slate-800/40 transition-colors text-xs">
                        ${schoolCells}
                        <td class="p-3 font-semibold ${g.track.includes('특별') || g.track.includes('취업') ? 'text-amber-300' : 'text-sky-200'}">${g.track}</td>
                        <td class="p-3 font-bold text-white">${g.department}</td>
                        <td class="p-3">
                            <div class="flex flex-wrap items-center gap-1.5">${rankBadges} ${totalBadge}</div>
                        </td>
                        <td class="p-3 text-center text-cyan-200 font-medium">${g.plannedCount}</td>
                        <td class="p-3 text-center text-indigo-200 font-medium">${g.submittedCount}</td>
                        <td class="p-3 text-center text-emerald-300 font-medium">${g.acceptedCount}</td>
                        <td class="p-3 text-center text-rose-300 font-medium">${g.rejectedCount}${g.stage2FailCount ? `<div class="text-[10px] text-amber-300 font-normal" title="1차 합격 후 2차(면접 등)에서 불합격">1차합격 후 ${g.stage2FailCount}</div>` : ''}</td>
                        <td class="p-3 text-center font-bold text-white">${g.finalCount}</td>
                    </tr>
                `;
            }).join('');
        }

        modal.innerHTML = `
            <div class="glass-card print-document p-7 w-full max-w-6xl select-none break-keep-all">
                <div class="flex justify-between items-start gap-4 mb-5">
                    <div>
                        <h2 class="text-2xl font-bold text-white flex items-center gap-2">📋 ${classNum}반 지원희망 스마트 현황</h2>
                        <p class="text-sm text-text-muted mt-1">지망별 뱃지를 클릭하면 해당 지망으로 지원한 학생 명단을 즉시 확인할 수 있습니다.</p>
                    </div>
                    <div class="no-print flex items-center gap-2">
                        <button id="printClassSummary" class="btn-secondary px-3 py-2 text-sm cursor-pointer">🖨️ 인쇄 / PDF</button>
                        <button id="closeClassApplicationSummary" class="text-3xl text-text-muted hover:text-white cursor-pointer transition-colors">×</button>
                    </div>
                </div>
                <div class="overflow-auto max-h-[70vh] border border-slate-700 rounded-xl bg-slate-900/40">
                    <table class="w-full text-sm">
                        <thead class="sticky top-0 bg-slate-800 border-b border-slate-700">
                            <tr class="text-xs text-slate-400 font-bold">
                                <th class="p-3 border-r border-slate-700/50 w-24">고입</th>
                                <th class="p-3 border-r border-slate-700/50 w-24">구분</th>
                                <th class="p-3 border-r border-slate-700/50 w-40 text-left pl-3">학교</th>
                                <th class="p-3 w-28 text-left pl-3">전형</th>
                                <th class="p-3 w-36 text-left pl-3">학과</th>
                                <th class="p-3 text-left pl-3">지망별 지원 분포 (클릭 시 학생 명단)</th>
                                <th class="p-3 w-16 text-center text-cyan-300">예정</th>
                                <th class="p-3 w-16 text-center text-indigo-300">지원</th>
                                <th class="p-3 w-16 text-center text-emerald-300">합격</th>
                                <th class="p-3 w-16 text-center text-rose-300">불합</th>
                                <th class="p-3 w-16 text-center text-white">최종</th>
                            </tr>
                        </thead>
                        <tbody>${rowsHTML}</tbody>
                    </table>
                </div>
                <p class="mt-4 text-xs text-text-muted">* 지망별 뱃지(예: 1지망: 2명)를 누르면 명단이 바로 표시됩니다.</p>
            </div>
        `;
        document.getElementById('closeClassApplicationSummary').onclick = () => modal.remove();
        document.getElementById('printClassSummary').onclick = () => printOnly('summary', 'landscape');

        // 지망 뱃지 클릭 리스너 연결
        modal.querySelectorAll('.btn-show-class-rank').forEach(btn => {
            btn.addEventListener('click', () => {
                const groupKey = btn.dataset.groupKey;
                const rank = parseInt(btn.dataset.rank, 10);
                const group = smartGroups.find(g => g.key === groupKey);
                if (group && group.ranks[rank]) {
                    openApplicantDetailModal(`[${group.schoolName}] ${group.department} (${group.track}) - ${rank}지망 지원자`, group.ranks[rank]);
                }
            });
        });

        // 전체 총원 뱃지 클릭 리스너 연결
        modal.querySelectorAll('.btn-show-class-all').forEach(btn => {
            btn.addEventListener('click', () => {
                const groupKey = btn.dataset.groupKey;
                const group = smartGroups.find(g => g.key === groupKey);
                if (group) {
                    openApplicantDetailModal(`[${group.schoolName}] ${group.department} (${group.track}) - 전체 지원자`, group.allStudents);
                }
            });
        });

    } catch (err) {
        modal.innerHTML = `<div class="glass-card p-7 max-w-lg"><h2 class="text-xl font-bold mb-3">우리 반 지원희망을 불러올 수 없습니다</h2><p class="text-text-muted">${err}</p><button id="closeClassApplicationSummary" class="btn-secondary w-auto px-4 py-2 mt-5">닫기</button></div>`;
        document.getElementById('closeClassApplicationSummary').onclick = () => modal.remove();
    }
}

// 2. 우리 학교 전체 지원현황 모달 (학교-전형-학과 1줄 통합, 스마트 지망 가로 뱃지 + 학생 명단 팝업)
export async function openApplicationSummaryModal() {
    document.getElementById('applicationSummaryModal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'applicationSummaryModal';
    modal.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-start justify-center p-4 sm:p-6 overflow-y-auto';
    modal.innerHTML = '<div class="glass-card p-7 my-auto"><span class="spinner"></span> 우리 학교 지원현황을 집계하는 중...</div>';
    document.body.appendChild(modal);

    const closeModal = () => {
        document.removeEventListener('keydown', handleKeydown);
        modal.remove();
    };
    const handleKeydown = (e) => {
        if (e.key === 'Escape') closeModal();
    };
    document.addEventListener('keydown', handleKeydown);
    modal.onclick = (e) => {
        if (e.target === modal) closeModal();
    };

    try {
        const config = await window.go.main.App.GetSchoolConfig().catch(() => null);
        const recordsResp = await window.go.main.App.GetSchoolApplicationRecords().catch(() => []);
        const allRecords = Array.isArray(recordsResp) ? recordsResp : [];

        const admissionYear = resolveAdmissionYear(config);
        const [closure, review] = await Promise.all([
            window.go.main.App.GetAdmissionClosure(admissionYear).catch(() => null),
            window.go.main.App.GetAdmissionClosureReview(admissionYear).catch(() => null),
        ]);

        const smartGroups = buildSmartApplicationGroups(allRecords);

        let rowsHTML = `
            <tr>
                <td colspan="12" class="p-12 text-center text-text-muted">
                    <span class="text-3xl block mb-2">📝</span>
                    <span class="font-bold text-slate-200 text-sm block">아직 등록된 지원희망 또는 원서접수 학생 데이터가 없습니다.</span>
                    <p class="text-xs text-slate-400 mt-1.5">담임 선생님 화면의 [지원희망 요약] 또는 학생별 1:1 진학 상담 화면에서 고교 지원 희망을 등록하시면 실시간으로 통계가 집계됩니다.</p>
                </td>
            </tr>
        `;
        if (smartGroups.length > 0) {
            let currentSchool = null, currentYear = null;
            const groupedWithRowSpan = [];

            smartGroups.forEach(g => {
                const isSameGroup = currentSchool === g.schoolName && currentYear === g.admissionYear;
                let rowSpanSchool = 0;
                if (!isSameGroup) {
                    currentSchool = g.schoolName;
                    currentYear = g.admissionYear;
                    rowSpanSchool = smartGroups.filter(x => x.schoolName === currentSchool && x.admissionYear === currentYear).length;
                }
                groupedWithRowSpan.push({ ...g, isFirstGroup: !isSameGroup, rowSpanSchool });
            });

            rowsHTML = groupedWithRowSpan.map(g => {
                const schoolCells = g.isFirstGroup ? `
                    <td class="p-3 border-r border-slate-700/50 text-center font-bold text-slate-300" rowspan="${g.rowSpanSchool}">${admissionLabel(g.admissionYear)}</td>
                    <td class="p-3 border-r border-slate-700/50 text-center font-semibold text-slate-300" rowspan="${g.rowSpanSchool}">${g.categoryLabel}</td>
                    <td class="p-3 border-r border-slate-700/50 font-bold text-white" rowspan="${g.rowSpanSchool}">${g.schoolName}</td>
                ` : '';

                const rankBadges = Object.keys(g.ranks).sort((a, b) => a - b).map(rank => `
                    <button type="button" class="btn-show-school-rank px-2 py-0.5 rounded-md bg-indigo-950/90 hover:bg-indigo-800 text-indigo-200 border border-indigo-500/40 text-[11px] font-semibold transition-colors cursor-pointer"
                            data-group-key="${g.key}" data-rank="${rank}" title="클릭하여 ${rank}지망 학생 명단 보기">
                        ${rank > 0 ? `${rank}지망: ` : ''}<b>${g.ranks[rank].length}명</b>
                    </button>
                `).join('');

                const totalBadge = `
                    <button type="button" class="btn-show-school-all px-2 py-0.5 rounded-md bg-slate-800 hover:bg-slate-700 text-white font-black text-[11px] border border-slate-600 transition-colors cursor-pointer"
                            data-group-key="${g.key}" title="클릭하여 전체 지원 학생 명단 보기">
                        (총 ${g.allStudents.length}명)
                    </button>
                `;

                const scoreDisplay = g.acceptedScores.length > 0 ? `
                    <span class="text-sky-300 font-bold">${Math.max(...g.acceptedScores).toFixed(2)}</span> / 
                    <span class="text-emerald-300 font-bold">${Math.min(...g.acceptedScores).toFixed(2)}</span> / 
                    <span class="text-amber-300 font-semibold">${(g.acceptedScores.reduce((a, b) => a + b, 0) / g.acceptedScores.length).toFixed(2)}</span>
                ` : '-';

                return `
                    <tr class="border-b border-slate-700/60 hover:bg-slate-800/40 transition-colors text-xs">
                        ${schoolCells}
                        <td class="p-3 font-semibold ${g.track.includes('특별') || g.track.includes('취업') ? 'text-amber-300' : 'text-sky-200'}">${g.track}</td>
                        <td class="p-3 font-bold text-white">${g.department}</td>
                        <td class="p-3">
                            <div class="flex flex-wrap items-center gap-1.5">${rankBadges} ${totalBadge}</div>
                        </td>
                        <td class="p-3 text-center text-cyan-200 font-medium">${g.plannedCount}</td>
                        <td class="p-3 text-center text-indigo-200 font-medium">${g.submittedCount}</td>
                        <td class="p-3 text-center text-emerald-300 font-medium">${g.acceptedCount}</td>
                        <td class="p-3 text-center text-rose-300 font-medium">${g.rejectedCount}${g.stage2FailCount ? `<div class="text-[10px] text-amber-300 font-normal" title="1차 합격 후 2차(면접 등)에서 불합격">1차합격 후 ${g.stage2FailCount}</div>` : ''}</td>
                        <td class="p-3 text-center font-bold text-white">${g.finalCount}</td>
                        <td class="p-3 text-right font-mono text-xs pr-3">${scoreDisplay}</td>
                    </tr>
                `;
            }).join('');
        }

        const canApplyCutoffs = state.currentUser?.Role === 'master';
        const closeInfo = closure
            ? `<div class="rounded-xl border border-emerald-400/40 bg-emerald-500/10 p-4"><p class="font-bold text-emerald-200">🔒 ${admissionLongLabel(admissionYear)} 입시 결과 확정됨</p><p class="text-xs text-slate-300 mt-1">확정자: ${closure.closedBy || '학년부장'} · 결과 커트라인 ${closure.cutoffsApplied || 0}건 반영됨${closure.note ? ` · 메모: ${closure.note}` : ''}</p></div>`
            : `<div class="rounded-xl border ${review.pendingCount ? 'border-amber-400/40 bg-amber-500/10' : 'border-sky-400/40 bg-sky-500/10'} p-4"><p class="font-bold ${review.pendingCount ? 'text-amber-200' : 'text-sky-200'}">${admissionLabel(admissionYear)} 결과 확정 전</p><p class="text-xs text-slate-300 mt-1">기록 ${review.totalRecorded}건 · 진행 중 ${review.pendingCount}건 · 합격 ${review.acceptedCount}건 · 불합격 ${review.rejectedCount}건 · 포기 ${review.withdrawnCount}건 · 최종 진학 ${review.finalCount}건</p><p class="text-xs text-slate-400 mt-1">진행 중 기록을 모두 결과 상태로 바꾼 뒤 확정하면 수정이 잠기고, 합격 결과가 우리 학교 커트라인에 자동 반영됩니다.</p></div>`;
        const closeControls = canApplyCutoffs
            ? (closure
                ? '<button id="reopenAdmissionYear" class="btn-secondary w-auto px-4 py-2 text-sm font-medium cursor-pointer">🔓 결과 확정 해제</button>'
                : `<input id="admissionClosureNote" class="input-field w-44 py-2 text-xs" placeholder="확정 메모 (선택)"><button id="closeAdmissionYear" class="btn-primary w-auto px-4 py-2 text-sm font-medium cursor-pointer">🔒 입시 결과 확정</button>`)
            : '';

        modal.innerHTML = `
            <div class="glass-card p-6 sm:p-7 w-full max-w-7xl max-h-[92vh] flex flex-col my-auto shadow-2xl select-none break-keep-all">
                <div class="shrink-0 flex justify-between items-start gap-4 mb-4 pb-3 border-b border-slate-700/60">
                    <div>
                        <h2 class="text-2xl font-bold text-white flex items-center gap-2">📋 우리 학교 지원현황 스마트 통계</h2>
                        <p class="text-sm text-text-muted mt-1">학교-전형-학과별 1줄로 통합되어 지원 경향이 한눈에 파악되며, 지망 뱃지 클릭 시 학생 명단이 팝업됩니다.</p>
                    </div>
                    <div class="flex items-center gap-2">
                        <button id="closeApplicationSummary" class="text-2xl text-slate-400 hover:text-white px-3 py-1 rounded-lg hover:bg-slate-700/50 transition-colors cursor-pointer" title="닫기 (ESC)">✕</button>
                    </div>
                </div>
                <div class="shrink-0 mb-3">${closeInfo}</div>
                <div class="overflow-auto flex-1 min-h-40 border border-slate-700 rounded-xl mb-4 bg-slate-900/40">
                    <table class="w-full text-sm">
                        <thead class="sticky top-0 bg-slate-800 z-10 border-b border-slate-700">
                            <tr class="text-xs text-slate-400 font-bold">
                                <th class="p-3 border-r border-slate-700/50 w-24 text-center">고입</th>
                                <th class="p-3 border-r border-slate-700/50 w-24 text-center">구분</th>
                                <th class="p-3 border-r border-slate-700/50 w-44 text-left pl-3">학교</th>
                                <th class="p-3 w-28 text-left pl-3">전형</th>
                                <th class="p-3 w-36 text-left pl-3">학과</th>
                                <th class="p-3 text-left pl-3">지망별 지원 분포 (클릭 시 학생 명단)</th>
                                <th class="p-3 w-16 text-center text-cyan-300">예정</th>
                                <th class="p-3 w-16 text-center text-indigo-300">지원</th>
                                <th class="p-3 w-16 text-center text-emerald-300">합격</th>
                                <th class="p-3 w-16 text-center text-rose-300">불합</th>
                                <th class="p-3 w-16 text-center text-white">최종</th>
                                <th class="p-3 w-36 text-right pr-4 text-amber-300">합격 최고/최저/평균</th>
                            </tr>
                        </thead>
                        <tbody>${rowsHTML}</tbody>
                    </table>
                </div>
                <div class="shrink-0 pt-3 border-t border-slate-700/60 flex flex-wrap justify-between items-center gap-3">
                    <p class="text-xs text-text-muted">* 지망 뱃지(예: 1지망: 3명)를 누르면 해당 지원자들의 점수와 상태가 팝업으로 나타납니다.</p>
                    <div class="flex flex-wrap items-center gap-2">
                        <button id="closeApplicationSummaryBottom" class="btn-secondary w-auto px-4 py-2 text-sm font-bold flex items-center gap-1.5 hover:bg-slate-700 cursor-pointer">← 닫기 (목록으로)</button>
                        <span class="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5 shadow-sm">🔒 학생 자료 외부 전송 없음</span>
                        ${canApplyCutoffs ? '<button id="applyApplicationCutoffs" class="btn-secondary w-auto px-4 py-2 text-sm cursor-pointer">📈 합격 결과를 우리 학교 커트라인에 반영</button>' : ''}
                        ${closeControls}
                    </div>
                </div>
            </div>`;

        document.getElementById('closeApplicationSummary').onclick = closeModal;
        document.getElementById('closeApplicationSummaryBottom').onclick = closeModal;

        // 지망 뱃지 클릭 리스너 연결
        modal.querySelectorAll('.btn-show-school-rank').forEach(btn => {
            btn.addEventListener('click', () => {
                const groupKey = btn.dataset.groupKey;
                const rank = parseInt(btn.dataset.rank, 10);
                const group = smartGroups.find(g => g.key === groupKey);
                if (group && group.ranks[rank]) {
                    openApplicantDetailModal(`[${group.schoolName}] ${group.department} (${group.track}) - ${rank}지망 지원자`, group.ranks[rank]);
                }
            });
        });

        // 전체 총원 뱃지 클릭 리스너 연결
        modal.querySelectorAll('.btn-show-school-all').forEach(btn => {
            btn.addEventListener('click', () => {
                const groupKey = btn.dataset.groupKey;
                const group = smartGroups.find(g => g.key === groupKey);
                if (group) {
                    openApplicantDetailModal(`[${group.schoolName}] ${group.department} (${group.track}) - 전체 지원자`, group.allStudents);
                }
            });
        });

        document.getElementById('applyApplicationCutoffs')?.addEventListener('click', async () => {
            const confirmed = await showModalConfirm({
                title: '커트라인 반영 확인',
                message: '합격·최종진학 결과의 최고·최저·평균 점수를 우리 학교 커트라인으로 반영할까요?\n기존 같은 연도·학교·전형·학과의 커트라인은 결과값으로 갱신됩니다.',
                confirmText: '반영하기',
                type: 'info'
            });
            if (!confirmed) return;
            try {
                const count = await window.go.main.App.ApplyApplicationCutoffs();
                await showModalAlert(count ? `${count}건의 우리 학교 커트라인을 반영했습니다.` : '반영할 합격 결과가 없습니다.', '반영 완료', 'success');
            } catch (err) { await showModalAlert('커트라인 반영 실패: ' + err, '오류', 'error'); }
        });
        document.getElementById('closeAdmissionYear')?.addEventListener('click', async () => {
            if (review.pendingCount) return await showModalAlert(`진행 중인 기록이 ${review.pendingCount}건 있습니다. 모두 합격·불합격·포기·최종 진학으로 결과를 입력한 뒤 확정해주세요.`, '진행 중 기록 존재', 'warning');
            const confirmed = await showModalConfirm({
                title: '입시 결과 확정',
                message: `${admissionLabel(admissionYear)} 입시 결과를 확정할까요?\n\n확정하면 해당 연도 지원현황을 수정할 수 없고, 합격 결과의 최고·최저·평균이 우리 학교 커트라인에 자동 반영됩니다. 원서 결과는 이름·학번 없이 따로 보관되어 인수인계 파일과 다음 학년도 분석에 쓰입니다.`,
                confirmText: '확정하기',
                type: 'warning'
            });
            if (!confirmed) return;
            try {
                const note = document.getElementById('admissionClosureNote')?.value?.trim() || '';
                const result = await window.go.main.App.CloseAdmissionYear(admissionYear, note);
                notifyStatsRecalculated({ reason: 'closure' });
                await showModalAlert(`${admissionLabel(admissionYear)} 입시 결과를 확정했습니다.\n커트라인 ${result.cutoffsApplied || 0}건이 반영되었습니다.`, '확정 완료', 'success');
                closeModal();
                openApplicationSummaryModal();
            } catch (err) { await showModalAlert('입시 결과 확정 실패: ' + err, '오류', 'error'); }
        });
        document.getElementById('reopenAdmissionYear')?.addEventListener('click', async () => {
            const confirmed = await showModalConfirm({
                title: '입시 결과 확정 해제',
                message: `${admissionLabel(admissionYear)} 입시 결과 확정을 해제할까요?\n\n지원현황을 다시 수정할 수 있습니다. 이미 반영된 커트라인은 자동으로 지워지지 않으므로 필요하면 커트라인 관리에서 검토해주세요.`,
                confirmText: '확정 해제',
                type: 'warning'
            });
            if (!confirmed) return;
            try {
                await window.go.main.App.ReopenAdmissionYear(admissionYear);
                notifyStatsRecalculated({ reason: 'closure' });
                await showModalAlert('입시 결과 확정을 해제했습니다.', '해제 완료', 'success');
                closeModal();
                openApplicationSummaryModal();
            } catch (err) { await showModalAlert('입시 결과 확정 해제 실패: ' + err, '오류', 'error'); }
        });
    } catch (err) {
        modal.innerHTML = `
            <div class="glass-card p-7 max-w-lg my-auto text-center">
                <span class="text-3xl block mb-2">📋</span>
                <h2 class="text-xl font-bold mb-2 text-white">우리 학교 지원현황 안내</h2>
                <p class="text-sm text-slate-300 mb-2">아직 등록된 학생 지원현황 데이터가 없거나 집계 중 예외가 발생했습니다.</p>
                <p class="text-xs text-text-muted bg-slate-900/60 p-2.5 rounded-lg border border-slate-700/50 mb-4 break-all">${escapeHtml(String(err))}</p>
                <button id="closeApplicationSummary" class="btn-secondary w-auto px-5 py-2 font-bold cursor-pointer">확인</button>
            </div>
        `;
        document.getElementById('closeApplicationSummary').onclick = closeModal;
    }
}

if (typeof window !== 'undefined') {
    window.openApplicationRegisterModal = openApplicationRegisterModal;
    window.openApplicantDetailModal = openApplicantDetailModal;
    window.buildSmartApplicationGroups = buildSmartApplicationGroups;
    window.openClassApplicationSummaryModal = openClassApplicationSummaryModal;
    window.openApplicationSummaryModal = openApplicationSummaryModal;
}
