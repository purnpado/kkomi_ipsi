import { showModalAlert, showModalPrompt } from '../../core/dialogs.js';
import { navigate, notifyApplicationsChanged } from '../../core/navigation.js';
import { state } from '../../core/store.js';

// 병합 뒤에는 보고 있던 화면(대시보드·관리 화면)을 다시 그린다.
const reopenCurrent = (schoolName) => {
    notifyApplicationsChanged({ source: 'patch-merge' }); // 대시보드는 이 알림으로 다시 그린다
    if (state.currentScreen !== 'home') navigate('admin', { schoolName });
};

// 담임교사 취합자료 병합 방식 선택 모달 (다중 파일 일괄 병합 vs 단일 파일 상세 검토)
export function openPatchImportModal(schoolName) {
    document.getElementById('patchImportModeModal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'patchImportModeModal';
    modal.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-in fade-in duration-200';

    modal.innerHTML = `
        <div class="glass-card p-6 md:p-8 w-full max-w-xl space-y-5">
            <div class="flex justify-between items-start border-b border-slate-700/60 pb-3">
                <div>
                    <h2 class="text-xl font-black text-white flex items-center gap-2">
                        <span>📥</span> 담임교사 취합자료 병합
                    </h2>
                    <p class="text-xs text-text-muted mt-1">
                        각 학급 담임선생님이 제출한 취합 파일(<strong>.kkomipatch</strong>)을 학년부장 시스템에 반영합니다.
                    </p>
                </div>
                <button id="closePatchImportModeModal" class="text-2xl text-slate-400 hover:text-white transition-colors">×</button>
            </div>

            <div class="space-y-3.5">
                <!-- 옵션 1: 여러 반 일괄 병합 (다중 선택) -->
                <div id="btnBatchPatchMerge" class="p-4 rounded-2xl bg-indigo-950/40 border border-indigo-500/50 hover:bg-indigo-900/50 hover:border-indigo-400 cursor-pointer transition-all flex items-start gap-3.5 group shadow-md">
                    <div class="w-10 h-10 rounded-xl bg-indigo-600/30 border border-indigo-400/40 flex items-center justify-center text-xl shrink-0 group-hover:scale-110 transition-transform">
                        ⚡
                    </div>
                    <div class="space-y-1">
                        <div class="flex items-center gap-2">
                            <span class="text-sm font-bold text-white group-hover:text-indigo-200">여러 반 일괄 병합 (다중 선택 권장)</span>
                            <span class="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">추천</span>
                        </div>
                        <p class="text-xs text-slate-300/90 leading-relaxed">
                            파일 탐색기에서 <strong>Ctrl 또는 Shift 키를 누른 채</strong> 여러 반 파일(예: 1반~8반 취합본)을 한꺼번에 동시 선택하여 <strong>1초 만에 전교 일괄 병합</strong>합니다.
                        </p>
                    </div>
                </div>

                <!-- 옵션 2: 1개 반 상세 검토 병합 -->
                <div id="btnSinglePatchMerge" class="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/60 hover:bg-slate-700/60 hover:border-slate-500 cursor-pointer transition-all flex items-start gap-3.5 group shadow-sm">
                    <div class="w-10 h-10 rounded-xl bg-slate-700/50 border border-slate-600/50 flex items-center justify-center text-xl shrink-0 group-hover:scale-110 transition-transform">
                        🔍
                    </div>
                    <div class="space-y-1">
                        <span class="text-sm font-bold text-white group-hover:text-indigo-200">1개 반 상세 검토 병합 (체크박스 선택)</span>
                        <p class="text-xs text-slate-400 leading-relaxed">
                            특정 학급 1개 파일을 열어 학생별로 반영할 항목(출결, 봉사, 수기 가산점, 지원현황)을 직접 눈으로 검토하고 선택적으로 병합합니다.
                        </p>
                    </div>
                </div>
            </div>

            <div class="flex justify-end pt-3 border-t border-slate-700/60">
                <button id="closePatchImportModeModal2" class="btn-secondary text-xs px-4 py-2 font-bold" style="width: auto;">
                    닫기
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const closeModal = () => modal.remove();
    document.getElementById('closePatchImportModeModal')?.addEventListener('click', closeModal);
    document.getElementById('closePatchImportModeModal2')?.addEventListener('click', closeModal);

    // 1. 여러 반 일괄 병합 핸들러
    document.getElementById('btnBatchPatchMerge')?.addEventListener('click', async () => {
        const password = await showModalPrompt({
            title: '공용 데이터 암호 확인',
            message: '취합자료를 복호화할 공용 데이터 잠금 비밀번호를 입력하세요.',
            isPassword: true
        });
        if (!password) return;
        closeModal();

        try {
            const res = await window.go.main.App.OpenTeacherPatch(password);
            if (res && res.files > 0) {
                await showModalAlert({
                    title: '취합자료 일괄 병합 완료',
                    message: `선택하신 <strong>${res.files}개 학급 취합 파일</strong>에서 학생 <strong>${res.students}명</strong>의 최신 데이터가 성공적으로 일괄 병합되었습니다!`,
                    type: 'success'
                });
                reopenCurrent(schoolName);
            }
        } catch (err) {
            await showModalAlert({
                title: '일괄 병합 실패',
                message: String(err),
                type: 'error'
            });
        }
    });

    // 2. 1개 반 상세 검토 병합 핸들러
    document.getElementById('btnSinglePatchMerge')?.addEventListener('click', async () => {
        const password = await showModalPrompt({
            title: '공용 데이터 암호 확인',
            message: '취합자료를 복호화할 공용 데이터 잠금 비밀번호를 입력하세요.',
            isPassword: true
        });
        if (!password) return;
        closeModal();

        try {
            const preview = await window.go.main.App.OpenTeacherPatchPreview(password);
            if (preview && preview.path) {
                openPatchMergeSelection(preview, password, schoolName);
            }
        } catch (err) {
            await showModalAlert({
                title: '취합자료 가져오기 실패',
                message: String(err),
                type: 'error'
            });
        }
    });
}

function openPatchMergeSelection(preview, password, schoolName) {
    document.getElementById('patchMergeSelectionModal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'patchMergeSelectionModal';
    modal.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4 overflow-y-auto';
    const items = (Array.isArray(preview.items) ? preview.items : []).slice().sort((a, b) => {
        const numA = parseInt(a.studentNum, 10) || 0;
        const numB = parseInt(b.studentNum, 10) || 0;
        return numA - numB;
    });
    const conflict = preview.hasRevisionConflict
        ? `<div class="rounded-xl border border-amber-500/50 bg-amber-500/10 p-3.5 text-sm text-amber-200 mb-4 flex items-start gap-2.5">
            <span class="text-base font-bold text-amber-400 mt-0.5">⚠</span>
            <div>
                <p class="font-bold text-amber-300">주의: 기초 배포본 버전 차이가 있습니다.</p>
                <p class="text-xs text-amber-200/90 mt-0.5">담임교사가 작업한 시점의 버전과 현재 학년부장 자료 버전에 차이가 있습니다. 덮어쓸 항목만 학생별로 신중히 체크한 후 병합하세요.</p>
            </div>
           </div>`
        : `<div class="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3.5 text-sm text-emerald-200 mb-4 flex items-start gap-2.5">
            <span class="text-base font-bold text-emerald-400 mt-0.5">✓</span>
            <div>
                <p class="font-bold text-emerald-300">담임 취합자료 확인 완료</p>
                <p class="text-xs text-emerald-200/90 mt-0.5">담임교사가 입력·제출한 학생별 변경 자료(출결·봉사·지원현황)가 현재 자료와 정상 호환됩니다. 반영할 항목을 선택한 뒤 하단 병합 버튼을 누르세요.</p>
            </div>
           </div>`;
    const rows = items.length ? items.map((item, index) => {
        const checks = [
            ['attendance', '출결', item.attendance], ['volunteer', '봉사', item.volunteer],
            ['extra', '수기 가산점', item.extra], ['applications', '지원현황', item.applications],
        ].filter(([, , available]) => available).map(([field, label]) => `<label class="inline-flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-xs"><input type="checkbox" class="patch-choice" data-index="${index}" data-field="${field}" checked> ${label}</label>`).join('');
        return `<tr class="border-b border-slate-700/60"><td class="p-3 text-center font-mono">${item.studentNum}</td><td class="p-3 font-bold">${item.studentName}</td><td class="p-3"><div class="flex flex-wrap gap-2">${checks || '<span class="text-text-muted">변경 항목 없음</span>'}</div></td></tr>`;
    }).join('') : '<tr><td colspan="3" class="p-8 text-center text-text-muted">확인할 변경 항목이 없습니다.</td></tr>';
    modal.innerHTML = `<div class="glass-card p-7 w-full max-w-4xl"><div class="flex justify-between items-start gap-4 mb-4"><div><h2 class="text-2xl font-bold text-white">📥 취합자료 선택 병합(학년부장)</h2><p class="text-sm text-text-muted mt-1">담임 계정 ${preview.sourceUsername} · ${preview.classNum}반 · 변경 학생 ${preview.changeCount}명</p></div><button id="closePatchMergeSelection" class="text-3xl text-text-muted">×</button></div>${conflict}<p class="text-xs text-text-muted mb-3">학생별로 가져올 항목만 선택합니다. 원본 수치와 학생 개인정보는 이 화면에 표시하지 않습니다.</p><div class="overflow-auto max-h-[55vh] border border-slate-700 rounded-xl"><table class="w-full text-sm"><thead class="sticky top-0 bg-slate-800"><tr><th class="p-3 w-16 text-center">번호</th><th class="p-3 w-28 text-left">학생</th><th class="p-3 text-left">가져올 항목</th></tr></thead><tbody>${rows}</tbody></table></div><div class="flex justify-end items-center gap-3 mt-6 pt-4 border-t border-slate-700/60"><button id="closePatchMergeSelection2" type="button" class="btn-secondary w-auto! px-5 py-2.5 rounded-xl font-bold text-xs whitespace-nowrap cursor-pointer hover:bg-slate-700 transition-all">취소</button><button id="applyPatchMergeSelection" type="button" class="btn-primary w-auto! px-6 py-2.5 rounded-xl font-bold text-xs whitespace-nowrap cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/30 hover:scale-[1.02] transition-all"><span>📥</span> 선택 항목 병합</button></div></div>`;
    document.body.appendChild(modal);
    const close = () => modal.remove();
    document.getElementById('closePatchMergeSelection').onclick = close;
    document.getElementById('closePatchMergeSelection2').onclick = close;
    document.getElementById('applyPatchMergeSelection').onclick = async () => {
        const selections = items.map((item, index) => ({
            studentNum: item.studentNum,
            attendance: modal.querySelector(`.patch-choice[data-index="${index}"][data-field="attendance"]`)?.checked || false,
            volunteer: modal.querySelector(`.patch-choice[data-index="${index}"][data-field="volunteer"]`)?.checked || false,
            extra: modal.querySelector(`.patch-choice[data-index="${index}"][data-field="extra"]`)?.checked || false,
            applications: modal.querySelector(`.patch-choice[data-index="${index}"][data-field="applications"]`)?.checked || false,
        }));
        if (!selections.some(item => item.attendance || item.volunteer || item.extra || item.applications)) {
            return showModalAlert({
                type: 'warning',
                title: '선택 항목 없음',
                message: '병합할 학생별 항목(출결, 봉사, 가산점, 지원현황)을 하나 이상 선택해주세요.'
            });
        }
        const button = document.getElementById('applyPatchMergeSelection');
        button.disabled = true;
        button.innerHTML = '<span class="spinner"></span> 병합 중...';
        try {
            const count = await window.go.main.App.ImportTeacherPatchSelected(password, preview.path, selections);
            close();
            reopenCurrent(schoolName);
            await showModalAlert({
                type: 'success',
                title: '취합자료 병합 완료',
                message: `
                    <div class="space-y-3">
                        <p class="text-center text-slate-200">
                            총 <strong class="text-emerald-400 font-bold">${count}명</strong>의 선택 항목을 성공적으로 병합했습니다.
                        </p>
                        <div class="rounded-xl border border-indigo-500/30 bg-indigo-950/40 p-3.5 text-xs text-indigo-200 leading-relaxed">
                            <span class="font-bold text-indigo-300 block mb-1">📢 담임교사 재배포 안내</span>
                            • 병합된 최신 내용이 학년부장 시스템에 반영되었습니다.<br>
                            • 다른 담임교사에게 최신 취합본을 전달하시려면, <strong>[사용자 및 권한 관리]</strong> 메뉴에서 각 반의 <strong>'배포 자료 만들기'</strong>(.kkomipkg)를 실행하여 전달하시면 됩니다.
                        </div>
                    </div>
                `,
                confirmText: '확인'
            });
        } catch (err) {
            button.disabled = false;
            button.innerHTML = '<span>📥</span> 선택 항목 병합';
            await showModalAlert({
                type: 'error',
                title: '취합자료 병합 실패',
                message: err.message || String(err),
                confirmText: '확인'
            });
        }
    };
}
