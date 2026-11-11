import { escapeHtml } from '../core/utils.js';
import { showModalAlert, showModalConfirm, showModalPrompt } from '../core/dialogs.js';
import { state } from '../core/store.js';
import { admissionLabel, admissionLongLabel, currentAdmissionYear, resolveAdmissionYear } from '../core/admissionYear.js';

/**
 * 관내 고입 결과 공유 및 취합 관리 모달 (V2 규격)
 */
export async function openSharedAdmissionModal() {
    document.getElementById('sharedAdmissionModal')?.remove();

    let schoolConfig = null;
    let admissionYear = currentAdmissionYear();
    let schoolName = '우리학교';
    try {
        schoolConfig = await window.go.main.App.GetSchoolConfig();
        if (schoolConfig) {
            admissionYear = resolveAdmissionYear(schoolConfig);
            schoolName = schoolConfig.schoolName || '우리학교';
        }
    } catch (e) {
        console.warn('학교 설정 조회 실패:', e);
    }

    let participatingSchools = [];
    try {
        participatingSchools = await window.go.main.App.GetParticipatingSchools(admissionYear) || [];
    } catch (e) {
        console.warn('참여 학교 목록 조회 실패:', e);
    }

    const isMaster = state.currentUser && state.currentUser.Role === 'master';

    const modal = document.createElement('div');
    modal.id = 'sharedAdmissionModal';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in';

    modal.innerHTML = `
        <div class="relative w-full max-w-4xl max-h-[90vh] bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100">
            <!-- Header -->
            <div class="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
                <div class="flex items-center gap-3">
                    <div class="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-400/20 text-indigo-400">
                        <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                        </svg>
                    </div>
                    <div>
                        <h2 class="text-xl font-bold text-white flex items-center gap-2">
                            관내 고입 결과 공유 및 취합 관리
                            <span class="px-2 py-0.5 text-xs font-semibold rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">V2 익명화 규격</span>
                        </h2>
                        <p class="text-xs text-slate-400 mt-0.5">${admissionLongLabel(admissionYear)} · 관내 중학교 간 고입 지원·합격 결과 익명 자료 교환 및 통계 통합</p>
                    </div>
                </div>
                <button type="button" id="closeSharedModalBtn" class="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors">
                    <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            <!-- Body Tabs / Actions -->
            <div class="flex-1 overflow-y-auto p-6 space-y-6">
                <!-- 안내 배너 -->
                <div class="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-2">
                    <div class="flex items-start gap-2.5">
                        <svg class="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div class="text-xs text-slate-300 leading-relaxed">
                            <strong class="text-white">학생 개인정보 철저 보호:</strong>
                            관내 공유 파일(V2)은 학생 이름, 학번, 반, 입력 시각 등 모든 식별 정보가 100% 원천 제외되며,
                            학번 추정을 차단하기 위해 암호학적 난수로 순서가 무작위 셔플된 후 AES-256-GCM으로 암호화됩니다.
                        </div>
                    </div>
                </div>

                <!-- 주요 기능 카드 2열 -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <!-- 1. 우리 학교 자료 내보내기 -->
                    <div class="p-5 rounded-xl bg-slate-800/40 border border-slate-700/60 flex flex-col justify-between space-y-4 hover:border-indigo-500/40 transition-colors">
                        <div class="space-y-2">
                            <div class="flex items-center gap-2">
                                <span class="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
                                    <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                    </svg>
                                </span>
                                <h3 class="text-base font-bold text-white">우리 학교 공유 자료 내보내기</h3>
                            </div>
                            <p class="text-xs text-slate-400 leading-relaxed">
                                우리 학교의 고입 지원 및 합격 결과를 관내 공유 형식(V2)의 암호화 파일(<code class="text-indigo-300">.phgc</code>)로 안전하게 생성합니다.
                            </p>
                        </div>
                        <div>
                            ${isMaster ? `
                                <button type="button" id="exportSharedPkgBtn" class="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/40 transition-all cursor-pointer">
                                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    ${admissionLabel(admissionYear)} 공유 파일 내보내기 (.phgc)
                                </button>
                            ` : `
                                <div class="p-2.5 text-center text-xs text-slate-500 bg-slate-900/40 rounded-xl border border-slate-800">
                                    🔒 학년부장 전용 권한입니다
                                </div>
                            `}
                        </div>
                    </div>

                    <!-- 2. 타 학교 공유 자료 취합(가져오기) -->
                    <div class="p-5 rounded-xl bg-slate-800/40 border border-slate-700/60 flex flex-col justify-between space-y-4 hover:border-indigo-500/40 transition-colors">
                        <div class="space-y-2">
                            <div class="flex items-center gap-2">
                                <span class="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400">
                                    <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                    </svg>
                                </span>
                                <h3 class="text-base font-bold text-white">타 중학교 공유 자료 취합</h3>
                            </div>
                            <p class="text-xs text-slate-400 leading-relaxed">
                                관내 타 중학교에서 전달받은 암호화 파일(<code class="text-indigo-300">.phgc</code>)을 관내 통합 분석 데이터베이스로 불러옵니다. (V1 호환 지원)
                            </p>
                        </div>
                        <div>
                            ${isMaster ? `
                                <button type="button" id="importSharedPkgBtn" class="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-950/40 transition-all cursor-pointer">
                                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    공유 파일 선택 및 취합 (.phgc)
                                </button>
                            ` : `
                                <div class="p-2.5 text-center text-xs text-slate-500 bg-slate-900/40 rounded-xl border border-slate-800">
                                    🔒 학년부장 전용 권한입니다
                                </div>
                            `}
                        </div>
                    </div>
                </div>

                <!-- 3. 취합된 관내 참여 중학교 현황 목록 -->
                <div class="space-y-3">
                    <div class="flex items-center justify-between">
                        <h3 class="text-sm font-bold text-slate-200 flex items-center gap-2">
                            <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
                            취합된 관내 참여 중학교 목록
                            <span id="participatingSchoolCount" class="text-xs text-slate-400 font-normal">
                                (총 ${participatingSchools.length}개 학교 자료 취합됨)
                            </span>
                        </h3>
                        <button type="button" id="refreshParticipatingBtn" class="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer">
                            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            새로고침
                        </button>
                    </div>

                    <div class="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/50">
                        <table class="w-full text-left text-xs text-slate-300">
                            <thead class="bg-slate-800/80 text-slate-400 uppercase font-semibold border-b border-slate-700/60">
                                <tr>
                                    <th class="py-3 px-4">참여 중학교명</th>
                                    <th class="py-3 px-4 text-center">고입</th>
                                    <th class="py-3 px-4 text-center">규격</th>
                                    <th class="py-3 px-4 text-center">포함 레코드 수</th>
                                    <th class="py-3 px-4 text-right">취합 일시</th>
                                </tr>
                            </thead>
                            <tbody id="participatingSchoolsTbody" class="divide-y divide-slate-800/60">
                                ${renderParticipatingSchoolsRows(participatingSchools)}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- Footer -->
            <div class="px-6 py-4 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between text-xs text-slate-500">
                <span>PHGC 고입 진학상담 데스크톱 플랫폼</span>
                <button type="button" id="closeSharedModalFooterBtn" class="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium transition-colors cursor-pointer">
                    닫기
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // 이벤트 리스너 바인딩
    const closeModal = () => modal.remove();
    modal.querySelector('#closeSharedModalBtn')?.addEventListener('click', closeModal);
    modal.querySelector('#closeSharedModalFooterBtn')?.addEventListener('click', closeModal);

    // 새로고침 버튼
    modal.querySelector('#refreshParticipatingBtn')?.addEventListener('click', async () => {
        try {
            const list = await window.go.main.App.GetParticipatingSchools(admissionYear) || [];
            updateSchoolsTable(modal, list);
        } catch (e) {
            console.error('새로고침 실패:', e);
        }
    });

    // 1. 내보내기 버튼 핸들러
    modal.querySelector('#exportSharedPkgBtn')?.addEventListener('click', async () => {
        const password = await showModalPrompt(
            '관내 공유 파일 암호화에 사용할 비밀번호를 입력해주세요.\n(공유받을 관내 중학교 담당자에게 안전하게 전달해야 합니다.)',
            '관내 공유 비밀번호 설정',
            ''
        );
        if (!password || !password.trim()) {
            return;
        }

        const confirmPass = await showModalPrompt(
            '비밀번호를 한 번 더 입력해주세요.',
            '비밀번호 확인',
            ''
        );
        if (password.trim() !== confirmPass?.trim()) {
            await showModalAlert('비밀번호가 일치하지 않습니다. 다시 시도해주세요.', '오류', 'error');
            return;
        }

        try {
            const savedPath = await window.go.main.App.SaveSharedAdmissionPackageDialog(admissionYear, password.trim());
            if (savedPath) {
                await showModalAlert(
                    `성공적으로 관내 공유 파일이 생성되었습니다.\n\n저장 위치: ${savedPath}\n\n※ 설정하신 비밀번호를 공유 대상 학교 담당자에게 전달해주세요.`,
                    '내보내기 완료',
                    'success'
                );
            }
        } catch (e) {
            console.error('내보내기 실패:', e);
            await showModalAlert(`내보내기에 실패했습니다: ${e}`, '오류', 'error');
        }
    });

    // 2. 취합(가져오기) 버튼 핸들러
    modal.querySelector('#importSharedPkgBtn')?.addEventListener('click', async () => {
        try {
            const filePath = await window.go.main.App.OpenSharedAdmissionPackageDialog();
            if (!filePath) {
                return;
            }

            const password = await showModalPrompt(
                '전달받은 관내 공유 파일의 비밀번호를 입력해주세요.',
                '공유 파일 잠금 해제',
                ''
            );
            if (!password || !password.trim()) {
                return;
            }

            // 표지 미리보기
            let cover = null;
            try {
                cover = await window.go.main.App.InspectSharedAdmissionPackage(password.trim(), filePath);
            } catch (inspectErr) {
                await showModalAlert(`파일을 열 수 없습니다:\n${inspectErr}`, '인증 실패', 'error');
                return;
            }

            const formatLabel = cover.formatVersion === 2 ? 'V2 (익명 점수)' : 'V1 (요약 컷오프)';
            const confirmImport = await showModalConfirm(
                `다음 학교의 공유 자료를 취합하시겠습니까?\n\n` +
                `• 발송 학교: ${cover.schoolName}\n` +
                `• 고입 학년도: ${admissionLabel(cover.admissionYear)}\n` +
                `• 자료 규격: ${formatLabel}\n` +
                `• 포함 레코드: ${cover.recordCount}건\n\n` +
                `(동일 학교의 이전 자료가 존재할 경우 최신 파일로 자동 교체됩니다)`,
                '자료 취합 확인'
            );

            if (!confirmImport) {
                return;
            }

            const result = await window.go.main.App.ImportSharedAdmissionPackage(password.trim(), filePath);
            if (result) {
                const replaceMsg = result.isReplaced ? ' (기존 자료 교체됨)' : '';
                await showModalAlert(
                    `성공적으로 자료를 취합했습니다!${replaceMsg}\n\n` +
                    `• 학교명: ${result.schoolName}\n` +
                    `• 포함 레코드: ${result.recordCount}건\n` +
                    `• 현재 참여 학교: 총 ${result.totalParticipatingSchool}곳\n` +
                    `• 관내 통합 학생 레코드: 총 ${result.totalAnonymousRecords}건`,
                    '취합 완료',
                    'success'
                );

                // 목록 갱신
                const list = await window.go.main.App.GetParticipatingSchools(admissionYear) || [];
                updateSchoolsTable(modal, list);
            }
        } catch (e) {
            console.error('취합 실패:', e);
            await showModalAlert(`자료 취합에 실패했습니다: ${e}`, '오류', 'error');
        }
    });
}

function renderParticipatingSchoolsRows(schools) {
    if (!schools || schools.length === 0) {
        return `
            <tr>
                <td colspan="5" class="py-8 text-center text-slate-500">
                    아직 취합된 타 중학교 공유 자료가 없습니다.
                </td>
            </tr>
        `;
    }

    return schools.map(s => {
        const formatBadge = s.formatVersion === 2
            ? `<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">V2 익명형</span>`
            : `<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">V1 요약형</span>`;

        const dateStr = s.importedAt ? new Date(s.importedAt).toLocaleString('ko-KR') : '-';

        return `
            <tr class="hover:bg-slate-800/40 transition-colors">
                <td class="py-3 px-4 font-semibold text-white flex items-center gap-2">
                    <span class="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
                    ${escapeHtml(s.schoolName)}
                </td>
                <td class="py-3 px-4 text-center">${admissionLabel(s.admissionYear)}</td>
                <td class="py-3 px-4 text-center">${formatBadge}</td>
                <td class="py-3 px-4 text-center font-mono font-medium text-slate-200">${s.recordCount}건</td>
                <td class="py-3 px-4 text-right text-slate-400 font-mono text-[11px]">${dateStr}</td>
            </tr>
        `;
    }).join('');
}

function updateSchoolsTable(modal, schools) {
    const tbody = modal.querySelector('#participatingSchoolsTbody');
    const countSpan = modal.querySelector('#participatingSchoolCount');
    if (tbody) {
        tbody.innerHTML = renderParticipatingSchoolsRows(schools);
    }
    if (countSpan) {
        countSpan.textContent = `(총 ${schools.length}개 학교 자료 취합됨)`;
    }
}
