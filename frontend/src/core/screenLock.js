// ===== 🔒 개인정보 보호 자동 화면 잠금(Auto Screen Lock) 시스템 =====
import { escapeHtml } from './utils.js';

export const ScreenLockManager = {
    timer: null,
    defaultTimeoutMinutes: 5, // 기본 5분 동안 입력이 없을 때 자동 잠금 (교무실 표준 권고)
    isLocked: false,

    getTimeoutMs() {
        const saved = localStorage.getItem('phgc_screen_lock_minutes');
        const mins = saved !== null ? parseInt(saved, 10) : this.defaultTimeoutMinutes;
        return (isNaN(mins) || mins <= 0) ? 0 : mins * 60 * 1000;
    },

    setTimeoutMinutes(mins) {
        localStorage.setItem('phgc_screen_lock_minutes', String(mins));
        this.resetTimer();
    },

    init() {
        const onActivity = () => {
            if (!this.isLocked && window.currentUser) {
                this.resetTimer();
            }
        };

        ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'].forEach(evt => {
            window.addEventListener(evt, onActivity, { passive: true });
        });

        // 단축키: Ctrl + L (또는 Cmd + L) 즉시 잠금
        window.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
                if (window.currentUser && !this.isLocked) {
                    e.preventDefault();
                    this.lockScreen('단축키');
                }
            }
        });
    },

    clearTimer() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    },

    resetTimer() {
        this.clearTimer();
        if (!window.currentUser || this.isLocked) return;

        const ms = this.getTimeoutMs();
        if (ms > 0) {
            this.timer = setTimeout(() => {
                this.lockScreen('시간초과');
            }, ms);
        }
    },

    lockScreen(reason = '') {
        if (this.isLocked || !window.currentUser) return;
        this.isLocked = true;
        this.clearTimer();

        const user = window.currentUser;
        let userTitle = '교직원';
        if (user.Role === 'master') {
            userTitle = '학년부장 (관리자)';
        } else if (user.Role === 'homeroom') {
            userTitle = `3학년 ${user.ClassNum}반 담임교사`;
        } else if (user.Role === 'viewer') {
            userTitle = '전체 열람 교사';
        }

        const username = user.Username || (user.Role === 'master' ? 'admin' : `30${user.ClassNum}`);

        document.getElementById('screenLockOverlay')?.remove();
        const overlay = document.createElement('div');
        overlay.id = 'screenLockOverlay';
        overlay.className = 'fixed inset-0 z-[9999999] bg-slate-950/85 backdrop-blur-2xl flex items-center justify-center p-4 select-none animate-in fade-in duration-300';
        overlay.innerHTML = `
            <div class="relative w-full max-w-md bg-slate-900/90 border border-slate-700/80 rounded-3xl p-8 shadow-2xl text-center space-y-6 backdrop-blur-xl">
                <!-- 잠금 자물쇠 뱃지 -->
                <div class="relative mx-auto w-20 h-20 flex items-center justify-center rounded-3xl bg-linear-to-tr from-amber-600/30 to-rose-600/20 border border-amber-500/40 shadow-lg shadow-amber-500/10">
                    <span class="text-4xl animate-bounce">🔒</span>
                    <span class="absolute -top-1 -right-1 flex h-3 w-3">
                        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                        <span class="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                    </span>
                </div>

                <div>
                    <h2 class="text-xl font-black text-white flex items-center justify-center gap-2">
                        개인정보 보호 화면 잠금
                    </h2>
                    <p class="text-xs text-amber-300/90 mt-1.5 font-medium">
                        학생 성적 및 진학 상담 자료 보호를 위해 화면이 안전하게 잠겼습니다.
                    </p>
                    <div class="mt-3 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-800/90 border border-slate-700 text-xs text-slate-300 shadow-inner">
                        <span>👤</span>
                        <span class="font-bold text-white">${escapeHtml(userTitle)}</span>
                        <span class="text-slate-400">(${escapeHtml(username)})</span>
                    </div>
                </div>

                <form id="screenUnlockForm" class="space-y-4">
                    <div class="text-left">
                        <label class="block text-xs font-bold text-slate-300 mb-1.5 ml-1">비밀번호 입력</label>
                        <div class="relative">
                            <input type="password" id="unlockPasswordInput" 
                                   class="input-field w-full py-3 text-sm text-center tracking-widest font-mono" 
                                   placeholder="비밀번호를 입력하세요" autocomplete="current-password" autofocus required />
                        </div>
                        <p id="unlockErrorMsg" class="text-xs text-rose-400 mt-1.5 hidden text-center font-bold"></p>
                    </div>

                    <button type="submit" id="unlockSubmitBtn" class="w-full py-3 px-4 bg-linear-to-r from-indigo-600 to-primary hover:from-indigo-500 hover:to-primary/90 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/30 transition-all cursor-pointer flex items-center justify-center gap-2 text-sm">
                        <span>🔓</span> 잠금 해제 (이전 작업 복귀)
                    </button>
                </form>

                <div class="pt-2 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
                    <button type="button" id="lockLogoutBtn" class="hover:text-rose-400 transition-colors cursor-pointer flex items-center gap-1 font-bold">
                        <span>🚪</span> 로그아웃
                    </button>
                    <span class="text-[11px] text-slate-500">단축키: Ctrl + L (즉시 잠금)</span>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        const input = document.getElementById('unlockPasswordInput');
        setTimeout(() => input?.focus(), 150);

        const form = document.getElementById('screenUnlockForm');
        form?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const pw = input?.value || '';
            const errEl = document.getElementById('unlockErrorMsg');
            const submitBtn = document.getElementById('unlockSubmitBtn');

            if (!pw) {
                if (errEl) {
                    errEl.textContent = '비밀번호를 입력해 주세요.';
                    errEl.classList.remove('hidden');
                }
                return;
            }

            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="spinner"></span> 확인 중...';
            if (errEl) errEl.classList.add('hidden');

            try {
                let isValid = false;
                if (window.go?.main?.App?.VerifyUserLogin) {
                    try {
                        const verifiedUser = await window.go.main.App.VerifyUserLogin(username, pw);
                        if (verifiedUser) isValid = true;
                    } catch (vErr) {
                        if (user.Role === 'master' && window.go?.main?.App?.VerifyAdminPassword) {
                            try {
                                const ok = await window.go.main.App.VerifyAdminPassword(pw);
                                if (ok) isValid = true;
                            } catch (_) {}
                        }
                    }
                }

                if (isValid) {
                    overlay.classList.add('fade-out');
                    setTimeout(() => overlay.remove(), 200);
                    this.isLocked = false;
                    this.resetTimer();
                } else {
                    if (errEl) {
                        errEl.textContent = '비밀번호가 일치하지 않습니다. 다시 입력해 주세요.';
                        errEl.classList.remove('hidden');
                    }
                    input.classList.add('animate-shake');
                    setTimeout(() => input.classList.remove('animate-shake'), 500);
                    input.value = '';
                    input.focus();
                }
            } catch (err) {
                if (errEl) {
                    errEl.textContent = '확인 중 오류가 발생했습니다: ' + String(err);
                    errEl.classList.remove('hidden');
                }
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<span>🔓</span> 잠금 해제 (이전 작업 복귀)';
            }
        });

        document.getElementById('lockLogoutBtn')?.addEventListener('click', () => {
            overlay.remove();
            this.isLocked = false;
            this.clearTimer();
            window.currentUser = null;
            if (typeof renderMainScreen === 'function') {
                renderMainScreen();
            } else {
                location.reload();
            }
        });
    }
};

if (typeof window !== 'undefined') {
    window.ScreenLockManager = ScreenLockManager;
}
