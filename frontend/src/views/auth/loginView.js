import { VerifyAdminPassword, GetAppVersion, GetSchoolConfig } from '../../../wailsjs/go/main/App';
import logoUniversal from '../../assets/images/logo-universal.png';
import { updateAppWindowTitle } from '../../core/utils.js';
import { ScreenLockManager } from '../../core/screenLock.js';
import { showModalAlert, showModalPrompt } from '../../core/dialogs.js';
import { getAppRoot } from './authRoot.js';
import {
    renderSyncScreen,
    renderSetupScreen,
    renderFirstRunScreen,
    handleSetupSubmit,
    performSync,
    updateSyncStep,
    showSyncComplete,
    showSyncFailed
} from './setupWizardView.js';
import { renderAgreementModal } from './agreementView.js';
import { navigate, notifyLoginSuccess } from '../../core/navigation.js';
import { state } from '../../core/store.js';

// ===== 모드 선택 화면 =====
export function renderModeSelectScreen(schoolName) {
    const app = getAppRoot();
    app.className = '';
    app.innerHTML = `
        <div class="glass-card p-10 w-full max-w-lg fade-in" style="margin: 2rem;">
            <div class="text-center mb-8">
                <h1 class="text-2xl font-bold text-white mb-2">📚 ${schoolName}</h1>
                <p class="text-text-muted text-sm">사용할 모드를 선택하세요</p>
            </div>

            <div class="grid grid-cols-2 gap-4 mb-6">
                <div class="mode-card" id="adminMode">
                    <span class="icon">👔</span>
                    <div class="title">관리자 모드</div>
                    <div class="desc">학년부장용<br/>엑셀 Import · 커트라인 관리</div>
                    <div class="mt-2 text-xs text-text-muted">🔒 비밀번호 필요</div>
                </div>
                <div class="mode-card" id="teacherMode">
                    <span class="icon">📋</span>
                    <div class="title">담임 모드</div>
                    <div class="desc">담임교사용<br/>내신 조회 · 합격 예측</div>
                    <div class="mt-2 text-xs text-success">🔓 바로 접근</div>
                </div>
            </div>

            <div class="flex justify-center gap-4">
                <button id="syncBtn" class="text-text-muted text-xs hover:text-primary transition-colors cursor-pointer bg-transparent border-none">
                    🔄 서버 동기화
                </button>
                <button id="editConfigBtn" class="text-text-muted text-xs hover:text-primary transition-colors cursor-pointer bg-transparent border-none">
                    ⚙️ 학교 설정 변경
                </button>
            </div>

            <div class="text-center mt-3" id="versionDisplay"></div>
        </div>
    `;

    // 버전 표시
    GetAppVersion().then(ver => {
        const verEl = document.getElementById('versionDisplay');
        if (verEl) {
            verEl.innerHTML = `<span class="text-text-muted text-[10px]">v${ver}</span>`;
        }
    });

    document.getElementById('adminMode')?.addEventListener('click', () => {
        renderAdminLoginScreen(schoolName);
    });
    document.getElementById('teacherMode')?.addEventListener('click', () => {
        navigate('teacher', { schoolName });
    });
    document.getElementById('syncBtn')?.addEventListener('click', () => {
        navigate('sync', { schoolName });
    });
    document.getElementById('editConfigBtn')?.addEventListener('click', () => {
        renderAdminLoginScreen(schoolName, 'editConfig');
    });
}

// ===== 관리자 비밀번호 입력 화면 =====
export function renderAdminLoginScreen(schoolName, nextAction = 'adminDashboard') {
    const app = getAppRoot();
    app.className = '';
    app.innerHTML = `
        <div class="glass-card p-10 w-full max-w-sm fade-in" style="margin: 2rem;">
            <div class="text-center mb-8">
                <div class="text-4xl mb-4">🔐</div>
                <h1 class="text-xl font-bold text-white mb-2">관리자 인증</h1>
                <p class="text-text-muted text-sm">관리자 비밀번호를 입력하세요</p>
            </div>

            <form id="loginForm" class="space-y-5">
                <div>
                    <input type="password" id="loginPassword" class="input-field"
                        placeholder="비밀번호" autocomplete="off" required />
                    <div id="loginError" class="error-msg">비밀번호가 올바르지 않습니다.</div>
                </div>
                <button type="submit" id="loginBtn" class="btn-primary">확인</button>
            </form>

            <div class="text-center mt-4">
                <button id="backBtn" class="text-text-muted text-xs hover:text-primary transition-colors cursor-pointer bg-transparent border-none">
                    ← 모드 선택으로 돌아가기
                </button>
            </div>
        </div>
    `;

    document.getElementById('loginPassword').focus();

    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const passwordInput = document.getElementById('loginPassword');
        const loginBtn = document.getElementById('loginBtn');
        const loginError = document.getElementById('loginError');

        loginError.classList.remove('show');
        loginBtn.disabled = true;
        loginBtn.innerHTML = '<span class="spinner"></span>확인 중...';

        try {
            const result = await VerifyAdminPassword(passwordInput.value);
            if (result) {
                if (nextAction === 'editConfig') {
                    const config = await GetSchoolConfig();
                    navigate('setup', { config });
                } else {
                    navigate('admin', { schoolName });
                }
            } else {
                loginError.classList.add('show');
                loginBtn.disabled = false;
                loginBtn.textContent = '확인';
                passwordInput.value = '';
                passwordInput.focus();
            }
        } catch (err) {
            loginError.textContent = err;
            loginError.classList.add('show');
            loginBtn.disabled = false;
            loginBtn.textContent = '확인';
        }
    });

    document.getElementById('backBtn')?.addEventListener('click', () => {
        renderModeSelectScreen(schoolName);
    });
}

// ===== 로그인 화면 =====
export async function renderLoginScreen(schoolName) {
    const app = getAppRoot();
    app.className = '';
    updateAppWindowTitle();
    try {
        const loginIndex = typeof schoolName === 'string' ? { schoolName, accounts: [] } : schoolName;
        schoolName = loginIndex.schoolName || '암호화된 학교 데이터';
        const roleOrder = { master: 0, homeroom: 1, viewer: 2 };
        const loginAccounts = [...(loginIndex.accounts || [])].sort((a, b) => {
            const roleDiff = (roleOrder[a.role] ?? 9) - (roleOrder[b.role] ?? 9);
            return roleDiff || (a.classNum || 0) - (b.classNum || 0) || a.username.localeCompare(b.username);
        });
        let localVer = '0.5.5';
        try {
            localVer = await window.go.main.App.GetAppVersion();
        } catch (e) {
            console.warn(e);
        }

        const savedLastUsername = localStorage.getItem('phgc_last_login_username') || '';

        app.innerHTML = `
            <div class="glass-card p-10 w-full max-w-md fade-in" style="margin: 2rem;">
                <div class="text-center mb-6">
                    <img src="${logoUniversal}" alt="로고" class="w-20 h-20 mx-auto mb-3 rounded-2xl shadow-xl border border-indigo-500/30 object-cover" style="animation: float 3s ease-in-out infinite;" />
                    <h1 class="text-2xl font-black text-white tracking-tight mb-1">꼬미입시</h1>
                    <div class="flex items-center justify-center gap-1.5 mt-2 flex-wrap">
                        <span class="px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 text-[11px] font-bold">🏫 ${schoolName}</span>
                        <span class="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[11px] font-bold">🔒 100% 오프라인</span>
                    </div>
                </div>
                <form id="loginForm" class="space-y-4">
                    <div>
                        <label class="block text-xs font-semibold text-text-muted mb-1.5">로그인 계정 선택</label>
                        <select id="loginUsername" class="input-field cursor-pointer py-2 text-xs" required>
                            ${loginAccounts.map(account => {
                                const isSelected = savedLastUsername ? account.username === savedLastUsername : false;
                                return `<option value="${account.username}" ${isSelected ? 'selected' : ''}>${account.role === 'master' ? '학년부장' : account.role === 'viewer' ? '진로부장' : `${account.username} 담임`}</option>`;
                            }).join('') || '<option value="admin">학년부장 (admin)</option>'}
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs font-semibold text-text-muted mb-1.5">비밀번호</label>
                        <input type="password" id="loginPassword" class="input-field py-2 text-xs" placeholder="비밀번호 입력" required />
                    </div>
                    <div id="sharedPasswordRow" class="hidden">
                        <label class="block text-xs font-semibold text-amber-300 mb-1.5">공용 데이터 암호 <span class="text-slate-400 font-normal">(이 PC 첫 실행만)</span></label>
                        <input type="password" id="sharedLoginPassword" class="input-field py-2 text-xs" placeholder="학년부장에게 받은 공용 데이터 암호" />
                    </div>
                    <div class="pt-2">
                        <button type="submit" id="loginBtn" class="btn-primary py-2 text-xs font-bold">로그인</button>
                    </div>
                    <div id="loginError" class="error-msg text-center text-xs"></div>
                    <div class="space-y-2.5 mt-5 pt-4 border-t border-slate-700/60">
                        <button type="button" id="distributionPackageImportBtn" 
                                class="group w-full py-2.5 px-4 rounded-xl border border-emerald-500/40 bg-emerald-950/25 hover:bg-emerald-900/40 hover:border-emerald-400/70 transition-all duration-200 flex items-center justify-center gap-2 shadow-sm cursor-pointer active:scale-[0.99]">
                            <span class="text-base group-hover:scale-110 transition-transform">📦</span>
                            <span class="font-bold text-emerald-300 text-xs tracking-wide">학년부장 배포 자료 가져오기 (.kkomipkg)</span>
                        </button>
                        <button type="button" id="passwordResetImportBtn" 
                                class="group w-full py-2.5 px-4 rounded-xl border border-sky-500/40 bg-sky-950/25 hover:bg-sky-900/40 hover:border-sky-400/70 transition-all duration-200 flex items-center justify-center gap-2 shadow-sm cursor-pointer active:scale-[0.99]">
                            <span class="text-base group-hover:scale-110 transition-transform">🔑</span>
                            <span class="font-bold text-sky-300 text-xs tracking-wide">비밀번호 재설정 파일 가져오기 (.kkomireset)</span>
                        </button>
                        <button type="button" id="finalArchiveImportBtn" 
                                class="group w-full py-2.5 px-4 rounded-xl border border-amber-500/30 bg-amber-950/15 hover:bg-amber-900/30 hover:border-amber-400/60 transition-all duration-200 flex items-center justify-center gap-2 shadow-sm cursor-pointer active:scale-[0.99]">
                            <span class="text-base group-hover:scale-110 transition-transform">🗄️</span>
                            <span class="font-bold text-amber-300/90 group-hover:text-amber-200 text-xs tracking-wide">암호화 최종 보관본 복원하기</span>
                        </button>
                    </div>
                </form>

                <!-- 현재 설치된 버전 -->
                <div class="mt-6 flex flex-col items-center justify-center text-xs text-text-muted gap-1.5">
                    <div>
                        <span>현재 버전: <strong class="text-indigo-300 font-mono font-bold">v${localVer}</strong></span>
                    </div>
                    <div id="startupUpdateStatus" class="text-[11px] text-slate-400"></div>
                </div>
            </div>
        `;

        const refreshSharedPasswordRequirement = async () => {
            const username = document.getElementById('loginUsername').value;
            const required = await window.go.main.App.NeedsSharedDataPassword(username);
            document.getElementById('sharedPasswordRow').classList.toggle('hidden', !required);
            document.getElementById('sharedLoginPassword').required = required;
        };
        document.getElementById('loginUsername').addEventListener('change', refreshSharedPasswordRequirement);
        await refreshSharedPasswordRequirement();

        document.getElementById('distributionPackageImportBtn').addEventListener('click', async () => {
            const button = document.getElementById('distributionPackageImportBtn');
            try {
                button.disabled = true;
                button.innerHTML = '<span class="spinner" style="width:12px;height:12px;border-width:1.5px;"></span> <span class="text-xs font-bold text-emerald-200">배포 자료 적용 중...</span>';
                const username = await window.go.main.App.OpenDistributionPackage();
                if (!username) return;
                const accountSelect = document.getElementById('loginUsername');
                const exists = [...accountSelect.options].some(option => option.value === username);
                if (!exists) {
                    accountSelect.insertAdjacentHTML('beforeend', `<option value="${username}">${username}</option>`);
                }
                accountSelect.value = username;
                await refreshSharedPasswordRequirement();
                document.getElementById('loginPassword').focus();
                await showModalAlert(`'${username}' 계정의 배포 자료를 성공적으로 적용했습니다.\n(기존에 작성하신 상담 일지와 희망학교 데이터도 안전하게 보존되었습니다)\n\n학년부장에게 받은 공용 데이터 암호와 초기 비밀번호로 처음 로그인하세요.`, '배포 자료 적용 완료', 'success');
            } catch (err) {
                await showModalAlert('배포 자료 가져오기 실패: ' + err, '오류', 'error');
            } finally {
                button.disabled = false;
                button.innerHTML = '<span class="text-base group-hover:scale-110 transition-transform">📦</span><span class="font-bold text-emerald-300 text-xs tracking-wide">학년부장 배포 자료 가져오기 (.kkomipkg)</span>';
            }
        });

        document.getElementById('passwordResetImportBtn')?.addEventListener('click', async () => {
            const button = document.getElementById('passwordResetImportBtn');
            try {
                button.disabled = true;
                button.innerHTML = '<span class="spinner" style="width:12px;height:12px;border-width:1.5px;"></span> <span class="text-xs font-bold text-sky-200">재설정 파일 확인 중...</span>';
                const username = await window.go.main.App.OpenPasswordResetPackage();
                if (!username) return;
                await showModalAlert(`'${username}' 계정의 비밀번호 재설정 파일이 성공적으로 적용되었습니다.\n기존 학급 상담 데이터는 안전하게 보존되며, 학년부장이 설정한 새 비밀번호로 로그인해 주세요.`, '비밀번호 재설정 완료', 'success');
                window.location.reload();
            } catch (err) {
                await showModalAlert('비밀번호 재설정 파일 적용 실패: ' + err, '오류', 'error');
            } finally {
                button.disabled = false;
                button.innerHTML = '<span class="text-base group-hover:scale-110 transition-transform">🔑</span><span class="font-bold text-sky-300 text-xs tracking-wide">비밀번호 재설정 파일 가져오기 (.kkomireset)</span>';
            }
        });

        document.getElementById('finalArchiveImportBtn').addEventListener('click', async () => {
            const button = document.getElementById('finalArchiveImportBtn');
            const password = await showModalPrompt({
                title: '최종 보관본 복원',
                message: '최종 보관본 암호를 입력하세요. 복원은 새 프로그램 폴더에서만 가능합니다.',
                isPassword: true
            });
            if (!password) return;
            try {
                button.disabled = true;
                button.innerHTML = '<span class="spinner" style="width:12px;height:12px;border-width:1.5px;"></span> <span class="text-xs font-bold text-amber-200">최종 보관본 복원 중...</span>';
                const path = await window.go.main.App.OpenFinalArchive();
                if (!path) return;
                const school = await window.go.main.App.ImportFinalArchive(path, password);
                await showModalAlert(`${school} 최종 보관본을 복원했습니다.\n학년부장 개인 비밀번호로 로그인하세요.`, '복원 완료', 'success');
                window.location.reload();
            } catch (err) {
                await showModalAlert('최종 보관본 복원 실패: ' + err, '오류', 'error');
            } finally {
                button.disabled = false;
                button.innerHTML = '<span class="text-base group-hover:scale-110 transition-transform">🗄️</span><span class="font-bold text-amber-300/90 group-hover:text-amber-200 text-xs tracking-wide">암호화 최종 보관본 복원하기</span>';
            }
        });

        document.getElementById('loginPassword').focus();
        document.getElementById('loginForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('loginUsername').value;
            const password = document.getElementById('loginPassword').value;
            const sharedRow = document.getElementById('sharedPasswordRow');
            const isSharedRequired = sharedRow && !sharedRow.classList.contains('hidden');
            const sharedPassword = isSharedRequired ? document.getElementById('sharedLoginPassword').value.trim() : '';
            const btn = document.getElementById('loginBtn');
            const errorDiv = document.getElementById('loginError');

            if (isSharedRequired && !sharedPassword) {
                errorDiv.textContent = '학년부장에게 받은 공용 데이터 암호를 입력해 주세요.';
                errorDiv.classList.add('show');
                return;
            }

            btn.disabled = true;
            btn.innerHTML = '<span class="spinner"></span>확인 중...';
            errorDiv.classList.remove('show');

            try {
                const user = isSharedRequired
                    ? await window.go.main.App.UnlockSharedAndLogin(username, password, sharedPassword)
                    : await window.go.main.App.UnlockAndLogin(username, password);
                notifyLoginSuccess(user);
                ScreenLockManager.resetTimer();
                localStorage.setItem('phgc_last_login_username', username);

                if (user.MustChangePassword) {
                    renderPasswordChangeScreen(username);
                } else {
                    if (user.Role === 'homeroom') {
                        updateAppWindowTitle('homeroom', user.ClassNum);
                        navigate('teacher', { schoolName, classNum: user.ClassNum });
                    } else if (user.Role === 'viewer') {
                        updateAppWindowTitle('viewer');
                        navigate('teacher', { schoolName, classNum: null });
                    } else {
                        updateAppWindowTitle('master');
                        navigate('admin', { schoolName });
                    }
                }
            } catch (err) {
                errorDiv.textContent = err;
                errorDiv.classList.add('show');
                btn.disabled = false;
                btn.innerHTML = '로그인';
            }
        });
    } catch (err) {
        app.innerHTML = `<div class="text-danger py-10 text-center">계정 정보를 불러오지 못했습니다. 데이터베이스를 확인해주세요.<br>${err}</div>`;
    }
}

// ===== 비밀번호 변경 화면 =====
export function renderPasswordChangeScreen(username) {
    const app = getAppRoot();
    app.className = '';
    app.innerHTML = `
        <div class="glass-card p-10 w-full max-w-md fade-in" style="margin: 2rem;">
            <div class="text-center mb-8">
                <div class="text-5xl mb-4">🔑</div>
                <h1 class="text-2xl font-bold text-white mb-2">초기 비밀번호 변경</h1>
                <p class="text-text-muted text-sm">보안을 위해 비밀번호를 새로 설정해주세요.</p>
            </div>
            <form id="pwChangeForm" class="space-y-5">
                <div>
                    <label class="block text-sm font-semibold text-text-muted mb-2">새 비밀번호</label>
                    <input type="password" id="newPassword" class="input-field" required />
                </div>
                <div>
                    <label class="block text-sm font-semibold text-text-muted mb-2">새 비밀번호 확인</label>
                    <input type="password" id="newPasswordConfirm" class="input-field" required />
                </div>
                <div class="pt-3">
                    <button type="submit" id="pwChangeBtn" class="btn-primary">변경 완료 및 시작</button>
                </div>
                <div id="pwChangeError" class="error-msg text-center"></div>
            </form>
        </div>
    `;

    document.getElementById('newPassword').focus();
    document.getElementById('pwChangeForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const pw = document.getElementById('newPassword').value;
        const pwC = document.getElementById('newPasswordConfirm').value;
        const btn = document.getElementById('pwChangeBtn');
        const err = document.getElementById('pwChangeError');

        if (pw !== pwC) {
            err.textContent = "비밀번호가 일치하지 않습니다.";
            err.classList.add('show');
            return;
        }

        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span>변경 중...';

        try {
            await window.go.main.App.ChangeUserPassword(username, pw);
            state.currentUser.MustChangePassword = false;
            const config = await window.go.main.App.GetSchoolConfig();
            if (state.currentUser.Role === 'homeroom') {
                navigate('teacher', { schoolName: config.schoolName, classNum: state.currentUser.ClassNum });
            } else if (state.currentUser.Role === 'viewer') {
                navigate('teacher', { schoolName: config.schoolName, classNum: null });
            } else {
                navigate('admin', { schoolName: config.schoolName });
            }
        } catch (e) {
            err.textContent = e;
            err.classList.add('show');
            btn.disabled = false;
            btn.innerHTML = '변경 완료 및 시작';
        }
    });
}

// 전역 바인딩 (인라인 HTML 및 템플릿 호출용)
if (typeof window !== 'undefined') {
    window.renderFirstRunScreen = renderFirstRunScreen;
    window.renderSetupScreen = renderSetupScreen;
    window.handleSetupSubmit = handleSetupSubmit;
    window.renderSyncScreen = renderSyncScreen;
    window.performSync = performSync;
    window.updateSyncStep = updateSyncStep;
    window.showSyncComplete = showSyncComplete;
    window.showSyncFailed = showSyncFailed;
    window.renderModeSelectScreen = renderModeSelectScreen;
    window.renderAdminLoginScreen = renderAdminLoginScreen;
    window.renderAgreementModal = renderAgreementModal;
    window.renderLoginScreen = renderLoginScreen;
    window.renderPasswordChangeScreen = renderPasswordChangeScreen;
}
