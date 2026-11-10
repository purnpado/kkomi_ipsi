// ===== 시스템 다이얼로그 모달 모듈 (Alert, Confirm, Prompt & ESC 제어) =====
import { escapeHtml, escapeAttr } from './utils.js';
import { notifyClassUpdated } from './navigation.js';

// ===== SweetAlert2 스타일 커스텀 모달 알림창 =====
export function showModalAlert(optionsOrMessage, defaultTitle = '알림', defaultType = 'info', confirmText = '확인') {
    return new Promise((resolve) => {
        let title = defaultTitle;
        let message = '';
        let type = defaultType;
        let cText = confirmText;

        if (typeof optionsOrMessage === 'object' && optionsOrMessage !== null) {
            title = optionsOrMessage.title || defaultTitle;
            message = optionsOrMessage.message || '';
            type = optionsOrMessage.type || defaultType;
            cText = optionsOrMessage.confirmText || confirmText;
        } else {
            message = String(optionsOrMessage || '');
            if (message.includes('실패') || message.includes('오류') || message.includes('에러') || message.includes('Error')) {
                type = 'error';
                title = '오류';
            } else if (message.includes('완료') || message.includes('성공') || message.includes('저장했습니다') || message.includes('복원했습니다')) {
                type = 'success';
                title = '완료';
            }
        }

        document.getElementById('phgcCustomAlertModal')?.remove();
        const modal = document.createElement('div');
        modal.id = 'phgcCustomAlertModal';
        modal.className = 'fixed inset-0 bg-black/80 backdrop-blur-md z-[999999] flex items-center justify-center p-4 animate-in fade-in duration-200';

        const iconConfig = {
            success: {
                bg: 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400',
                icon: `<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path></svg>`,
                btnBg: 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/30',
            },
            warning: {
                bg: 'bg-amber-500/20 border-amber-500/50 text-amber-400',
                icon: `<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>`,
                btnBg: 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/30',
            },
            error: {
                bg: 'bg-rose-500/20 border-rose-500/50 text-rose-400',
                icon: `<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>`,
                btnBg: 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/30',
            },
            info: {
                bg: 'bg-indigo-500/20 border-indigo-500/50 text-indigo-400',
                icon: `<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`,
                btnBg: 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/30',
            },
        }[type] || {
            bg: 'bg-indigo-500/20 border-indigo-500/50 text-indigo-400',
            icon: `<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`,
            btnBg: 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/30',
        };

        const formattedMsg = typeof message === 'string' && !message.includes('<')
            ? `<p class="text-slate-200 text-sm whitespace-pre-wrap">${escapeHtml(message)}</p>`
            : message;

        modal.innerHTML = `
            <div class="glass-card max-w-md w-full p-6 text-center shadow-2xl border border-slate-700/80 rounded-2xl animate-in zoom-in-95 duration-200">
                <div class="mx-auto mb-4 w-16 h-16 rounded-full flex items-center justify-center border-2 ${iconConfig.bg} shadow-lg">
                    ${iconConfig.icon}
                </div>
                <h3 class="text-xl font-bold text-white mb-2">${escapeHtml(title)}</h3>
                <div class="text-sm text-slate-300 mb-6 leading-relaxed text-left max-h-[60vh] overflow-y-auto">
                    ${formattedMsg}
                </div>
                <button id="modalAlertConfirmBtn" class="w-full py-2.5 px-5 rounded-xl text-white font-bold text-sm ${iconConfig.btnBg} shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer">
                    ${cText}
                </button>
            </div>
        `;

        document.body.appendChild(modal);

        const confirmBtn = modal.querySelector('#modalAlertConfirmBtn');
        const handleClose = () => {
            window.removeEventListener('keydown', onKeyDown);
            modal.remove();
            resolve(true);
        };

        confirmBtn.onclick = handleClose;
        modal.onclick = (e) => {
            if (e.target === modal) handleClose();
        };

        const onKeyDown = (e) => {
            if (e.key === 'Enter' || e.key === 'Escape') {
                handleClose();
            }
        };
        window.addEventListener('keydown', onKeyDown);
    });
}

// ===== SweetAlert2 스타일 커스텀 모달 확인창 =====
export function showModalConfirm(optionsOrMessage, defaultTitle = '확인', defaultType = 'warning', confirmText = '확인', cancelText = '취소') {
    return new Promise((resolve) => {
        let title = defaultTitle;
        let message = '';
        let type = defaultType;
        let cText = confirmText;
        let canText = cancelText;

        if (typeof optionsOrMessage === 'object' && optionsOrMessage !== null) {
            title = optionsOrMessage.title || defaultTitle;
            message = optionsOrMessage.message || '';
            type = optionsOrMessage.type || defaultType;
            cText = optionsOrMessage.confirmText || confirmText;
            canText = optionsOrMessage.cancelText || cancelText;
        } else {
            message = String(optionsOrMessage || '');
        }

        document.getElementById('phgcCustomConfirmModal')?.remove();
        const modal = document.createElement('div');
        modal.id = 'phgcCustomConfirmModal';
        modal.className = 'fixed inset-0 bg-black/80 backdrop-blur-md z-[999999] flex items-center justify-center p-4 animate-in fade-in duration-200';

        const iconConfig = {
            success: {
                bg: 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400',
                icon: `<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path></svg>`,
                btnBg: 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/30',
            },
            warning: {
                bg: 'bg-amber-500/20 border-amber-500/50 text-amber-400',
                icon: `<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>`,
                btnBg: 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/30',
            },
            error: {
                bg: 'bg-rose-500/20 border-rose-500/50 text-rose-400',
                icon: `<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>`,
                btnBg: 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/30',
            },
            info: {
                bg: 'bg-indigo-500/20 border-indigo-500/50 text-indigo-400',
                icon: `<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`,
                btnBg: 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/30',
            },
        }[type] || {
            bg: 'bg-amber-500/20 border-amber-500/50 text-amber-400',
            icon: `<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>`,
            btnBg: 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/30',
        };

        const formattedMsg = typeof message === 'string' && !message.includes('<')
            ? `<p class="text-slate-200 text-sm whitespace-pre-wrap">${escapeHtml(message)}</p>`
            : message;

        modal.innerHTML = `
            <div class="glass-card max-w-md w-full p-6 text-center shadow-2xl border border-slate-700/80 rounded-2xl animate-in zoom-in-95 duration-200">
                <div class="mx-auto mb-4 w-16 h-16 rounded-full flex items-center justify-center border-2 ${iconConfig.bg} shadow-lg">
                    ${iconConfig.icon}
                </div>
                <h3 class="text-xl font-bold text-white mb-2">${escapeHtml(title)}</h3>
                <div class="text-sm text-slate-300 mb-6 leading-relaxed text-left max-h-[60vh] overflow-y-auto">
                    ${formattedMsg}
                </div>
                <div class="flex items-center justify-center gap-3">
                    <button id="modalConfirmCancelBtn" class="flex-1 py-2.5 px-4 rounded-xl text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-600 font-bold text-sm transition-all cursor-pointer">
                        ${canText}
                    </button>
                    <button id="modalConfirmOkBtn" class="flex-1 py-2.5 px-4 rounded-xl text-white font-bold text-sm ${iconConfig.btnBg} shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer">
                        ${cText}
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const okBtn = modal.querySelector('#modalConfirmOkBtn');
        const cancelBtn = modal.querySelector('#modalConfirmCancelBtn');

        const closeWith = (val) => {
            window.removeEventListener('keydown', onKeyDown);
            modal.remove();
            resolve(val);
        };

        okBtn.onclick = () => closeWith(true);
        cancelBtn.onclick = () => closeWith(false);
        modal.onclick = (e) => {
            if (e.target === modal) closeWith(false);
        };

        const onKeyDown = (e) => {
            if (e.key === 'Escape') {
                closeWith(false);
            } else if (e.key === 'Enter') {
                closeWith(true);
            }
        };
        window.addEventListener('keydown', onKeyDown);
    });
}

// ===== SweetAlert2 스타일 커스텀 모달 입력창 =====
export function showModalPrompt(optionsOrMessage, defaultVal = '', titleText = '입력') {
    let title = titleText;
    let message = '';
    let defaultValue = defaultVal;
    let placeholder = '';
    let isPassword = false;

    if (typeof optionsOrMessage === 'object' && optionsOrMessage !== null) {
        title = optionsOrMessage.title || titleText;
        message = optionsOrMessage.message || '';
        defaultValue = optionsOrMessage.defaultValue !== undefined ? optionsOrMessage.defaultValue : defaultVal;
        placeholder = optionsOrMessage.placeholder || '';
        isPassword = !!optionsOrMessage.isPassword;
    } else {
        message = String(optionsOrMessage || '');
        if (message.includes('암호') || message.includes('비밀번호')) {
            isPassword = true;
        }
    }

    return new Promise((resolve) => {
        document.getElementById('phgcCustomPromptModal')?.remove();
        const modal = document.createElement('div');
        modal.id = 'phgcCustomPromptModal';
        modal.className = 'fixed inset-0 bg-black/80 backdrop-blur-md z-[999999] flex items-center justify-center p-4 animate-in fade-in duration-200';

        modal.innerHTML = `
            <div class="glass-card max-w-md w-full p-6 text-center shadow-2xl border border-slate-700/80 rounded-2xl animate-in zoom-in-95 duration-200">
                <div class="mx-auto mb-4 w-16 h-16 rounded-full flex items-center justify-center border-2 bg-indigo-500/20 border-indigo-500/50 text-indigo-400 shadow-lg">
                    <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                </div>
                <h3 class="text-xl font-bold text-white mb-2">${escapeHtml(title)}</h3>
                <div class="text-sm text-slate-300 mb-4 leading-relaxed text-left max-h-[40vh] overflow-y-auto">
                    ${message ? `<p class="text-center text-slate-200">${escapeHtml(message).replace(/\\n/g, '<br>')}</p>` : ''}
                </div>
                <div class="mb-6">
                    <input id="modalPromptInput" type="${isPassword ? 'password' : 'text'}"
                           class="w-full px-4 py-3 bg-slate-900/90 border border-indigo-500/50 rounded-xl text-white ph-muted text-center font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-inner"
                           placeholder="${escapeAttr(placeholder || '내용을 입력하세요')}" value="${escapeAttr(String(defaultValue || ''))}" />
                </div>
                <div class="flex items-center justify-center gap-3">
                    <button id="modalPromptCancelBtn" class="flex-1 py-2.5 px-4 rounded-xl text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-600 font-bold text-sm transition-all cursor-pointer">
                        취소
                    </button>
                    <button id="modalPromptOkBtn" class="flex-1 py-2.5 px-4 rounded-xl text-white font-bold text-sm bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-600/30 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer">
                        확인
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        const input = modal.querySelector('#modalPromptInput');
        const okBtn = modal.querySelector('#modalPromptOkBtn');
        const cancelBtn = modal.querySelector('#modalPromptCancelBtn');

        input.focus();
        input.select();

        const closeWith = (val) => {
            window.removeEventListener('keydown', onKeyDown);
            modal.remove();
            resolve(val);
        };

        okBtn.onclick = () => closeWith(input.value);
        cancelBtn.onclick = () => closeWith(null);
        modal.onclick = (e) => {
            if (e.target === modal) closeWith(null);
        };

        const onKeyDown = (e) => {
            if (e.key === 'Escape') {
                closeWith(null);
            } else if (e.key === 'Enter') {
                closeWith(input.value);
            }
        };
        window.addEventListener('keydown', onKeyDown);
    });
}

// ===== 전역 ESC 키 모달 닫기 제어 시스템 등록 =====
export function initGlobalEscapeHandler() {
    window.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;

        // 1. 확인/알림/프롬프트 모달
        const promptModal = document.getElementById('appPromptModal');
        if (promptModal) {
            document.getElementById('modalPromptCancelBtn')?.click();
            return;
        }
        const confirmModal = document.getElementById('appConfirmModal');
        if (confirmModal) {
            document.getElementById('modalConfirmCancelBtn')?.click();
            return;
        }
        const alertModal = document.getElementById('appAlertModal');
        if (alertModal) {
            document.getElementById('modalAlertConfirmBtn')?.click();
            return;
        }

        // 2. 사용 설명서 모달
        const guideModal = document.getElementById('programGuideModal');
        if (guideModal) {
            document.getElementById('closeGuideBtn')?.click() || document.getElementById('closeGuideModalBtn')?.click();
            guideModal.remove();
            return;
        }

        // 3. 학생 종합 성적표 모달
        const transcriptModal = document.getElementById('studentTranscriptModal');
        if (transcriptModal) {
            document.getElementById('closeTranscriptBtn')?.click();
            transcriptModal.remove();
            return;
        }

        // 4. 합격 예측 상세 분석 모달
        const predModal = document.getElementById('predictionDetailModal');
        if (predModal) {
            document.getElementById('closePredictionDetailBtn')?.click();
            predModal.remove();
            return;
        }

        // 5. 학생 희망학교 입력/수정 모달
        const appModal = document.getElementById('studentApplicationModal');
        if (appModal) {
            document.getElementById('closeApplicationModal')?.click();
            appModal.remove();
            return;
        }

        // 6. 진학 상담 모달
        const studentModal = document.getElementById('studentDetailModal');
        if (studentModal) {
            const closeBtn = document.getElementById('closeModalBtn');
            if (closeBtn) {
                closeBtn.click();
            } else {
                studentModal.remove();
                notifyClassUpdated();
            }
            return;
        }

        // 7. 신호등 매트릭스 모달
        const matrixModal = document.getElementById('matrixModal');
        if (matrixModal) {
            document.getElementById('closeMatrixBtn')?.click();
            matrixModal.remove();
            return;
        }

        // 8. 고입원서대장 모달
        const regModal = document.getElementById('applicationRegisterModal');
        if (regModal) {
            document.getElementById('closeRegisterBtn')?.click();
            regModal.remove();
            return;
        }

        // 9. 우리 반 통계 모달
        const classSummaryModal = document.getElementById('classApplicationSummaryModal');
        if (classSummaryModal) {
            document.getElementById('closeClassApplicationSummaryBtn')?.click();
            classSummaryModal.remove();
            return;
        }

        // 10. 학교 지원현황 모달
        const schoolSummaryModal = document.getElementById('schoolApplicationSummaryModal');
        if (schoolSummaryModal) {
            document.getElementById('closeSchoolApplicationSummaryBtn')?.click();
            schoolSummaryModal.remove();
            return;
        }

        // 11. 기타 열려있는 최상단 오버레이 모달 제거
        const activeModals = Array.from(document.querySelectorAll('.fixed.inset-0'));
        if (activeModals.length > 0) {
            const topModal = activeModals[activeModals.length - 1];
            if (topModal && topModal.parentNode) {
                topModal.remove();
            }
        }
    });
}

// 전역 바인딩
if (typeof window !== 'undefined') {
    window.showModalAlert = showModalAlert;
    window.showModalConfirm = showModalConfirm;
    window.showModalPrompt = showModalPrompt;
    window.alert = (msg) => showModalAlert(msg);
}
