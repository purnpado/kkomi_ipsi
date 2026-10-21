import { VerifyAdminPassword, SyncWithServer, GetAppVersion, GetSchoolConfig } from '../../../wailsjs/go/main/App';
import middleSchools from '../../assets/middleschools.json';
import logoUniversal from '../../assets/images/logo-universal.png';
import { updateAppWindowTitle } from '../../core/utils.js';
import { ScreenLockManager } from '../../core/screenLock.js';
import { showModalAlert, showModalConfirm, showModalPrompt } from '../../core/dialogs.js';
import { FEEDBACK_BOARD_URL, GITHUB_RELEASE_URL, openExternalUrlSafe, quitAppSafe, delay } from '../../core/updater.js';

function getAppRoot() {
    return document.querySelector('#app');
}

// 새 프로그램 폴더의 첫 화면. 새 학교 설정과 학년부장 배포 자료 적용을
// 명확히 분리해, data 폴더가 없는 담임 PC에서도 배포 자료를 가져올 수 있다.
export function renderFirstRunScreen() {
    const app = getAppRoot();
    app.className = '';
    app.innerHTML = `
        <div class="glass-card p-8 w-full max-w-xl fade-in" style="margin: 2rem;">
            <div class="text-center mb-8">
                <img src="${logoUniversal}" alt="로고" class="w-20 h-20 mx-auto mb-3 rounded-2xl shadow-xl border border-indigo-500/30 object-cover" style="animation: float 3s ease-in-out infinite;" />
                <h1 class="text-2xl font-black text-white tracking-tight mb-2">꼬미입시</h1>
                <div class="flex items-center justify-center gap-1.5 flex-wrap">
                    <span class="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[11px] font-bold">🔒 100% 오프라인</span>
                    <span class="px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 text-[11px] font-bold">울산 고입 진학상담</span>
                </div>
                <p class="text-text-muted text-xs mt-2">처음 실행 방법을 선택하세요</p>
            </div>
            <div class="grid gap-4">
                <button id="startSchoolSetupBtn" type="button" class="rounded-xl border border-indigo-500/50 bg-indigo-500/10 p-5 text-left hover:bg-indigo-500/20 transition-colors cursor-pointer">
                    <div class="font-bold text-white text-base">🏫 새 학교 기초 설정</div>
                    <p class="text-xs text-slate-300 mt-2">학년부장이 학교명·학급 수·암호를 처음 설정하고 나이스 자료를 준비합니다.</p>
                </button>
                <button id="firstRunDistributionImportBtn" type="button" class="rounded-xl border border-emerald-500/50 bg-emerald-500/10 p-5 text-left hover:bg-emerald-500/20 transition-colors cursor-pointer">
                    <div class="font-bold text-white text-base">📦 학년부장 배포자료 가져오기</div>
                    <p class="text-xs text-slate-300 mt-2">담임·진로부장이 받은 <strong>.phgcpkg</strong> 파일을 적용합니다. 적용 후 본인 초기 비밀번호로 로그인합니다.</p>
                </button>
                <button id="firstRunPasswordResetBtn" type="button" class="rounded-xl border border-sky-500/50 bg-sky-500/10 p-5 text-left hover:bg-sky-500/20 transition-colors cursor-pointer">
                    <div class="font-bold text-white text-base">🔑 비밀번호 재설정 파일 가져오기</div>
                    <p class="text-xs text-slate-300 mt-2">학년부장에게 받은 <strong>.phgcreset</strong> 파일을 적용합니다. 기존 학급 작업 데이터는 그대로 보존됩니다.</p>
                </button>
                <button id="firstRunArchiveImportBtn" type="button" class="rounded-xl border border-amber-500/50 bg-amber-500/10 p-5 text-left hover:bg-amber-500/20 transition-colors cursor-pointer">
                    <div class="font-bold text-white text-base">🗄️ 암호화 최종 보관본 복원</div>
                    <p class="text-xs text-slate-300 mt-2">학년부장이 보관한 <strong>.phgcarchive</strong>를 새 프로그램 폴더에 복원합니다.</p>
                </button>
            </div>
            <p class="text-[11px] text-slate-400 mt-6 text-center">기존 data 폴더가 있는 경우에는 이 화면이 아닌 로그인 화면으로 자동 이동합니다.</p>
        </div>
    `;

    document.getElementById('startSchoolSetupBtn').addEventListener('click', () => renderSetupScreen());
    document.getElementById('firstRunDistributionImportBtn').addEventListener('click', async () => {
        const button = document.getElementById('firstRunDistributionImportBtn');
        try {
            button.disabled = true;
            button.textContent = '배포자료 적용 중...';
            const username = await window.go.main.App.OpenDistributionPackage();
            if (!username) return;
            await showModalAlert(`'${username}' 계정의 배포자료를 적용했습니다.\n(기존 학급의 상담 일지와 희망학교 데이터도 안전하게 보존되었습니다)\n\n공용 데이터 암호와 초기 비밀번호로 로그인하세요.`, '배포자료 적용 완료', 'success');
            window.location.reload();
        } catch (err) {
            await showModalAlert('배포자료 가져오기 실패: ' + err, '오류', 'error');
        } finally {
            button.disabled = false;
            button.innerHTML = '<div class="font-bold text-white text-base">📦 학년부장 배포자료 가져오기</div><p class="text-xs text-slate-300 mt-2">담임·진로부장이 받은 <strong>.phgcpkg</strong> 파일을 적용합니다. 적용 후 본인 초기 비밀번호로 로그인합니다.</p>';
        }
    });
    document.getElementById('firstRunPasswordResetBtn')?.addEventListener('click', async () => {
        const button = document.getElementById('firstRunPasswordResetBtn');
        try {
            button.disabled = true;
            button.textContent = '재설정 파일 적용 중...';
            const username = await window.go.main.App.OpenPasswordResetPackage();
            if (!username) return;
            await showModalAlert(`'${username}' 계정의 비밀번호 재설정 파일을 적용했습니다.\n기존 학급 상담 데이터는 안전하게 보존되며, 새 비밀번호로 로그인하세요.`, '비밀번호 재설정 완료', 'success');
            window.location.reload();
        } catch (err) {
            await showModalAlert('비밀번호 재설정 파일 적용 실패: ' + err, '오류', 'error');
        } finally {
            button.disabled = false;
            button.innerHTML = '<div class="font-bold text-white text-base">🔑 비밀번호 재설정 파일 가져오기</div><p class="text-xs text-slate-300 mt-2">학년부장에게 받은 <strong>.phgcreset</strong> 파일을 적용합니다. 기존 학급 작업 데이터는 그대로 보존됩니다.</p>';
        }
    });
    document.getElementById('firstRunArchiveImportBtn').addEventListener('click', async () => {
        const password = await showModalPrompt({
            title: '최종 보관본 복원',
            message: '최종 보관본 암호를 입력하세요.',
            placeholder: '보관본 암호',
            isPassword: true
        });
        if (!password) return;
        const button = document.getElementById('firstRunArchiveImportBtn');
        try {
            button.disabled = true;
            button.textContent = '최종 보관본 복원 중...';
            const path = await window.go.main.App.OpenFinalArchive();
            if (!path) return;
            const school = await window.go.main.App.ImportFinalArchive(path, password);
            await showModalAlert(`${school} 최종 보관본을 복원했습니다.\n학년부장 개인 비밀번호로 로그인하세요.`, '복원 완료', 'success');
            window.location.reload();
        } catch (err) {
            await showModalAlert('최종 보관본 복원 실패: ' + err, '오류', 'error');
        } finally {
            button.disabled = false;
            button.innerHTML = '<div class="font-bold text-white text-base">🗄️ 암호화 최종 보관본 복원</div><p class="text-xs text-slate-300 mt-2">학년부장이 보관한 <strong>.phgcarchive</strong>를 새 프로그램 폴더에 복원합니다.</p>';
        }
    });
}

// 초기 설정 화면 (관리자 전용)
export function renderSetupScreen(existingConfig = null) {
    const schoolName = existingConfig?.schoolName || '';
    const classCount = existingConfig?.classCount || '';
    const isSmallSchool = existingConfig?.isSmallSchool || false;
    const admissionYear = existingConfig?.admissionYear || 2026;
    const isEdit = existingConfig !== null;

    const app = getAppRoot();
    app.className = '';
    app.innerHTML = `
        <div class="glass-card p-10 w-full max-w-xl fade-in" style="margin: 2rem;">
            <!-- 헤더 -->
            <div class="text-center mb-8">
                <div class="text-5xl mb-4" style="animation: float 3s ease-in-out infinite;">🏫</div>
                <h1 class="text-2xl font-bold text-white mb-2">꼬미입시 🏫 초기 설정</h1>
                <p class="text-text-muted text-sm">관리자(학년부장)가 최초 1회 설정합니다</p>
            </div>

            <!-- 설정 폼 -->
            <form id="setupForm" class="space-y-5">
                <div>
                    <label class="block text-sm font-semibold text-text-muted mb-2">중학교명</label>
                    <input type="text" id="schoolName" class="input-field" list="schoolList"
                        placeholder="예: 푸른파도소리중학교 (검색 가능)" value="${schoolName}" autocomplete="off" required />
                    <datalist id="schoolList">
                        ${middleSchools.map(school => `<option value="${school}"></option>`).join('')}
                    </datalist>
                    <div id="schoolNameError" class="error-msg">학교명을 입력해 주세요.</div>
                </div>

                <div>
                    <label class="block text-sm font-semibold text-text-muted mb-2">3학년 학급수</label>
                    <input type="number" id="classCount" class="input-field"
                        placeholder="예: 8" value="${classCount}" min="1" max="30" autocomplete="off" required />
                    <div id="classCountError" class="error-msg">학급수는 1~30 사이로 입력해 주세요.</div>
                </div>

                <div>
                    <label class="block text-sm font-semibold text-text-muted mb-2">고교 입학년도</label>
                    <input type="text" inputmode="numeric" id="admissionYear" class="input-field" value="${admissionYear}" maxlength="4" required />
                    <p class="text-xs text-text-muted mt-1">현재 중3 학생이 다음 해 3월에 고등학교에 입학하는 연도입니다. 예: 2026년 중3 → 2027학년도</p>
                    <div id="admissionYearError" class="error-msg">입학년도는 2000~2100년 사이로 입력해 주세요.</div>
                </div>

                <div class="flex items-center gap-2 mt-2">
                    <input type="checkbox" id="isSmallSchool" class="w-4 h-4 rounded border-slate-700 bg-slate-800 text-primary focus:ring-primary focus:ring-offset-slate-900 cursor-pointer" ${isSmallSchool ? 'checked' : ''}>
                    <label for="isSmallSchool" class="text-sm font-medium text-text-muted cursor-pointer hover:text-white transition-colors">소인수 학교 (3학년 전체 10명 미만)</label>
                </div>

                <div>
                    <label class="block text-sm font-semibold text-text-muted mb-2">마스터(학년부장) 비밀번호</label>
                    <input type="password" id="adminPassword" class="input-field"
                        placeholder="마스터 계정 (admin) 진입 시 사용됩니다" autocomplete="off" required />
                    <div id="passwordError" class="error-msg">비밀번호를 입력해 주세요.</div>
                </div>

                <div>
                    <label class="block text-sm font-semibold text-text-muted mb-2">비밀번호 확인</label>
                    <input type="password" id="adminPasswordConfirm" class="input-field"
                        placeholder="비밀번호를 한 번 더 입력하세요" autocomplete="off" required />
                    <div id="passwordConfirmError" class="error-msg">비밀번호가 일치하지 않습니다.</div>
                </div>

                <div>
                    <label class="block text-sm font-semibold text-text-muted mb-2">공용 데이터 암호</label>
                    <input type="password" id="sharedDataPassword" class="input-field" placeholder="data 폴더 수령 교사가 최초 1회 입력" autocomplete="off" required />
                    <p class="text-xs text-text-muted mt-1">개인 로그인 비밀번호와 별도이며, 전달되는 data 폴더의 AES 잠금을 엽니다.</p>
                    <div id="sharedDataPasswordError" class="error-msg">공용 데이터 암호를 입력해 주세요.</div>
                </div>

                <div class="pt-3">
                    <button type="submit" id="saveBtn" class="btn-primary">설정 완료</button>
                </div>
                <div id="generalError" class="error-msg text-center"></div>
            </form>

            ${isEdit ? `
            <div class="text-center mt-5">
                <button id="backToModeBtn" type="button" class="btn-secondary text-xs px-4 py-2 font-bold inline-flex items-center gap-1.5 cursor-pointer" style="width: auto;">
                    <span>↩️</span> 모드 선택으로 돌아가기
                </button>
            </div>` : ''}
        </div>
    `;

    document.getElementById('schoolName').focus();
    document.getElementById('setupForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await handleSetupSubmit(isEdit);
    });

    if (isEdit) {
        document.getElementById('backToModeBtn')?.addEventListener('click', () => {
            renderModeSelectScreen(existingConfig.schoolName);
        });
    }
}

// 설정 폼 제출 처리
export async function handleSetupSubmit(isEdit = false) {
    const schoolName = document.getElementById('schoolName').value.trim();
    const classCount = parseInt(document.getElementById('classCount').value, 10);
    const password = document.getElementById('adminPassword').value;
    const passwordConfirm = document.getElementById('adminPasswordConfirm').value;
    const sharedDataPassword = document.getElementById('sharedDataPassword').value;
    const isSmallSchool = document.getElementById('isSmallSchool').checked;
    const admissionYear = parseInt(document.getElementById('admissionYear').value, 10);
    const saveBtn = document.getElementById('saveBtn');

    // 에러 초기화
    ['schoolNameError', 'classCountError', 'admissionYearError', 'passwordError', 'passwordConfirmError', 'sharedDataPasswordError', 'generalError']
        .forEach(id => document.getElementById(id)?.classList.remove('show'));

    // 유효성 검사
    let hasError = false;
    if (!schoolName) { document.getElementById('schoolNameError')?.classList.add('show'); hasError = true; }
    if (!classCount || classCount < 1 || classCount > 30) { document.getElementById('classCountError')?.classList.add('show'); hasError = true; }
    if (!admissionYear || admissionYear < 2000 || admissionYear > 2100) { document.getElementById('admissionYearError')?.classList.add('show'); hasError = true; }
    if (!password) { document.getElementById('passwordError')?.classList.add('show'); hasError = true; }
    if (password !== passwordConfirm) { document.getElementById('passwordConfirmError')?.classList.add('show'); hasError = true; }
    if (!sharedDataPassword) { document.getElementById('sharedDataPasswordError')?.classList.add('show'); hasError = true; }
    if (hasError) return;

    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spinner"></span>저장 중...';

    try {
        await window.go.main.App.SetupApp({
            schoolName: schoolName,
            classCount: classCount,
            adminPassword: password,
            sharedDataPassword: sharedDataPassword,
            isSmallSchool: isSmallSchool,
            admissionYear: admissionYear
        });

        // 설정 후 무조건 로그인 화면으로 이동
        renderLoginScreen(schoolName);
    } catch (err) {
        const generalError = document.getElementById('generalError');
        if (generalError) {
            generalError.textContent = err;
            generalError.classList.add('show');
        }
        saveBtn.disabled = false;
        saveBtn.textContent = '설정 완료';
    }
}

// ===== 서버 동기화 화면 =====
export function renderSyncScreen(schoolName) {
    const app = getAppRoot();
    app.className = '';
    app.innerHTML = `
        <div class="glass-card p-10 w-full max-w-md fade-in" style="margin: 2rem;">
            <div class="text-center mb-8">
                <div class="text-4xl mb-4 sync-icon">🔄</div>
                <h1 class="text-xl font-bold text-white mb-2">서버 동기화</h1>
                <p class="text-text-muted text-sm">Gitea 서버에서 데이터를 받아오는 중입니다...</p>
            </div>

            <!-- 동기화 단계 표시 -->
            <div class="space-y-4" id="syncSteps">
                <div class="sync-step" id="step-connect">
                    <div class="sync-step-icon"><span class="spinner"></span></div>
                    <div class="sync-step-text">
                        <div class="sync-step-title">서버 연결 중</div>
                        <div class="sync-step-desc text-text-muted text-xs">로컬 저장소 (오프라인 모드)</div>
                    </div>
                </div>
                <div class="sync-step" id="step-schools">
                    <div class="sync-step-icon pending">⏳</div>
                    <div class="sync-step-text">
                        <div class="sync-step-title">고등학교 정보 다운로드</div>
                        <div class="sync-step-desc text-text-muted text-xs">대기 중</div>
                    </div>
                </div>
                <div class="sync-step" id="step-version">
                    <div class="sync-step-icon pending">⏳</div>
                    <div class="sync-step-text">
                        <div class="sync-step-title">앱 업데이트 확인</div>
                        <div class="sync-step-desc text-text-muted text-xs">대기 중</div>
                    </div>
                </div>
            </div>

            <!-- 결과 영역 (동기화 완료 후 표시) -->
            <div id="syncResult" class="hidden mt-6"></div>
        </div>
    `;

    // 동기화 실행
    performSync(schoolName);
}

// 동기화 실행 로직
export async function performSync(schoolName) {
    const stepConnect = document.getElementById('step-connect');
    const stepSchools = document.getElementById('step-schools');
    const stepVersion = document.getElementById('step-version');
    const syncResult = document.getElementById('syncResult');

    try {
        await delay(800);
        updateSyncStep(stepConnect, 'success', '서버 연결 완료', '✅');

        updateSyncStep(stepSchools, 'loading', '다운로드 중...', null);
        await delay(300);

        const result = await SyncWithServer();

        if (result.success) {
            updateSyncStep(stepSchools, 'success', `${result.schoolCount}개 고교 정보 저장 완료`, '✅');
            await delay(500);

            updateSyncStep(stepVersion, 'loading', '확인 중...', null);
            await delay(500);

            if (result.hasUpdate) {
                updateSyncStep(stepVersion, 'update', `새 버전 ${result.latestVersion} 사용 가능`, '⬆️');
            } else {
                updateSyncStep(stepVersion, 'success', `v${result.currentVersion} — 최신 버전`, '✅');
            }

            await delay(600);
            showSyncComplete(syncResult, schoolName, result);
        } else {
            updateSyncStep(stepSchools, 'error', result.message, '❌');
            updateSyncStep(stepVersion, 'skipped', '건너뜀', '⏭️');

            await delay(500);
            showSyncFailed(syncResult, schoolName, result.message);
        }
    } catch (err) {
        updateSyncStep(stepConnect, 'error', '서버에 연결할 수 없습니다', '❌');
        updateSyncStep(stepSchools, 'skipped', '건너뜀', '⏭️');
        updateSyncStep(stepVersion, 'skipped', '건너뜀', '⏭️');

        await delay(500);
        showSyncFailed(syncResult, schoolName, '서버 연결 실패 — 오프라인 모드로 진행합니다');
    }
}

export function updateSyncStep(element, status, message, icon) {
    if (!element) return;
    const iconEl = element.querySelector('.sync-step-icon');
    const descEl = element.querySelector('.sync-step-desc');

    if (status === 'loading') {
        iconEl.innerHTML = '<span class="spinner"></span>';
        iconEl.classList.remove('pending');
    } else {
        iconEl.textContent = icon;
        iconEl.classList.remove('pending');
    }

    descEl.textContent = message;

    if (status === 'error') {
        descEl.classList.add('text-danger');
        descEl.classList.remove('text-text-muted');
    } else if (status === 'success') {
        descEl.classList.add('text-success');
        descEl.classList.remove('text-text-muted');
    } else if (status === 'update') {
        descEl.classList.add('text-warning');
        descEl.classList.remove('text-text-muted');
    }
}

export function showSyncComplete(container, schoolName, result) {
    if (!container) return;
    let updateNotice = '';
    if (result.hasUpdate) {
        updateNotice = `
            <div class="p-4 rounded-xl bg-amber-950/25 border border-amber-500/30 mb-4 text-sm space-y-3 text-left">
                <div class="font-bold text-amber-300 flex items-center justify-between text-base">
                    <span>🚀 새로운 최신 버전 출시 (v${result.latestVersion})</span>
                    <span class="text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold">v${result.latestVersion}</span>
                </div>
                <div class="text-slate-300 text-xs leading-relaxed">
                    새로 업데이트되었습니다. 공식 다운로드 페이지로 이동하여 최신 버전을 받으시겠습니까?
                </div>
                ${result.releaseNotes ? `
                <div class="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 text-[11px] text-slate-400 max-h-28 overflow-y-auto whitespace-pre-wrap font-sans">
                    ${result.releaseNotes}
                </div>` : ''}
                <div class="flex items-center gap-2 pt-1 flex-wrap">
                    <button id="goToDownloadInSyncBtn" class="btn-primary text-xs px-4 py-2 font-bold flex items-center gap-1.5 shadow-md" style="background: linear-gradient(135deg, #6366f1, #4f46e5); width: auto;">
                        <span>🌐</span> 다운로드 페이지로 이동
                    </button>
                    <button id="goToFeedbackInSyncBtn" class="btn-secondary text-xs px-3 py-2 font-bold text-emerald-300 border-emerald-500/40 hover:bg-emerald-950/40" style="width: auto;">
                        <span>💬</span> 질문·피드백 게시판
                    </button>
                </div>
            </div>
        `;
    }

    container.innerHTML = `
        <div class="fade-in">
            ${updateNotice}
            <button id="continueBtn" class="btn-primary">
                시작하기 →
            </button>
        </div>
    `;
    container.classList.remove('hidden');

    document.getElementById('goToDownloadInSyncBtn')?.addEventListener('click', () => {
        openExternalUrlSafe(GITHUB_RELEASE_URL);
        setTimeout(() => {
            quitAppSafe();
        }, 400);
    });

    document.getElementById('goToFeedbackInSyncBtn')?.addEventListener('click', () => {
        openExternalUrlSafe(FEEDBACK_BOARD_URL);
    });

    document.getElementById('continueBtn')?.addEventListener('click', () => {
        renderModeSelectScreen(schoolName);
    });
}

export function showSyncFailed(container, schoolName, errorMsg) {
    if (!container) return;
    container.innerHTML = `
        <div class="fade-in">
            <div class="p-3 rounded-lg bg-danger/10 border border-danger/30 mb-4 text-sm">
                <div class="text-text-muted text-xs">${errorMsg}</div>
            </div>
            <div class="flex gap-3">
                <button id="retryBtn" class="btn-primary flex-1" style="background: linear-gradient(135deg, #64748b, #475569); box-shadow: none;">
                    다시 시도
                </button>
                <button id="skipBtn" class="btn-primary flex-1">
                    오프라인으로 계속 →
                </button>
            </div>
        </div>
    `;
    container.classList.remove('hidden');

    document.getElementById('retryBtn')?.addEventListener('click', () => {
        renderSyncScreen(schoolName);
    });
    document.getElementById('skipBtn')?.addEventListener('click', () => {
        if (window.currentUser) {
            if (window.currentUser.Role === 'master' || window.currentUser.Role === 'viewer') {
                if (typeof window.renderAdminScreen === 'function') window.renderAdminScreen(schoolName);
            } else {
                if (typeof window.renderTeacherScreen === 'function') window.renderTeacherScreen(schoolName, window.currentUser.ClassNum);
            }
        } else {
            renderLoginScreen(schoolName);
        }
    });
}

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
        if (typeof window.renderTeacherScreen === 'function') {
            window.renderTeacherScreen(schoolName);
        }
    });
    document.getElementById('syncBtn')?.addEventListener('click', () => {
        renderSyncScreen(schoolName);
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
                    renderSetupScreen(config);
                } else {
                    if (typeof window.renderAdminScreen === 'function') {
                        window.renderAdminScreen(schoolName);
                    }
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

// ===== 프로그램 이용 및 학생 개인정보 보호 서약 모달창 =====
export function renderAgreementModal(onAcceptCallback) {
    document.getElementById('securityAgreementModal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'securityAgreementModal';
    modal.className = 'fixed inset-0 bg-black/90 backdrop-blur-md z-[50000] flex items-center justify-center p-4 sm:p-6 overflow-y-auto animate-in fade-in duration-300';

    modal.innerHTML = `
        <div class="glass-card max-w-3xl w-full p-6 sm:p-10 border border-indigo-500/40 rounded-3xl shadow-2xl flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200 break-keep-all select-none">
            <!-- 모달 헤더 -->
            <div class="text-center pb-5 border-b border-slate-700/60">
                <div class="flex items-center justify-center gap-2 mb-3 flex-wrap">
                    <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/40 text-indigo-300 text-xs font-bold shadow-inner">
                        <span>🏫</span> 꼬미입시
                    </span>
                    <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-xs font-bold shadow-inner">
                        <span>🔒</span> 100% 오프라인 안전 모드
                    </span>
                </div>
                <h2 class="text-2xl sm:text-3xl font-black text-white tracking-tight leading-snug">
                    프로그램 이용 및 학생 개인정보 보호 서약서
                </h2>
                <p class="text-xs sm:text-sm text-slate-300 mt-2.5 leading-relaxed max-w-3xl mx-auto opacity-90 break-keep-all text-balance">
                    본 프로그램은 중학교 3학년 고입 진학 상담 및 내신 산출을 돕는 <strong>교원 전용 오프라인 업무 지원 도구</strong>입니다.<br>
                    안전한 학생 정보 보호와 책임 있는 진학 지도를 위해 아래 사항을 숙지하고 서약해 주시기 바랍니다.
                </p>
            </div>

            <!-- 서약서 전문 스크롤 영역 -->
            <div class="my-5 p-4 sm:p-5 rounded-2xl bg-slate-900/90 border border-slate-800 text-xs sm:text-[13px] text-slate-300 leading-relaxed overflow-y-auto max-h-[48vh] space-y-4 font-sans select-text custom-scrollbar">
                <div class="p-4 rounded-xl bg-indigo-950/40 border border-indigo-500/25 shadow-xs">
                    <div class="flex items-center gap-2 mb-2">
                        <span class="px-2.5 py-0.5 rounded-full text-xs font-black bg-indigo-500/30 text-indigo-300 border border-indigo-400/40">제1조</span>
                        <h3 class="font-bold text-indigo-200 text-sm sm:text-base">100% 오프라인 구동 및 외부 전송 원천 차단</h3>
                    </div>
                    <ul class="list-disc list-inside space-y-1.5 text-slate-300 leading-relaxed">
                        <li>본 프로그램은 교육청 보안 지침을 준수하여 <strong class="text-white">외부 인터넷 서버와의 자동 통신을 일절 수행하지 않는 100% 오프라인 독립형 소프트웨어</strong>입니다.</li>
                        <li>나이스(NEIS) 엑셀에서 연동된 학생 성명, 학번, 성적 등 <strong class="text-white">모든 학생 정보는 사용자 로컬 PC에만 군사등급 AES-256-GCM 알고리즘으로 강력 암호화되어 안전하게 보관</strong>되며 외부로 전송되지 않습니다.</li>
                    </ul>
                </div>

                <div class="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/25 shadow-xs">
                    <div class="flex items-center gap-2 mb-2">
                        <span class="px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-500/30 text-emerald-300 border border-emerald-400/40">제2조</span>
                        <h3 class="font-bold text-emerald-200 text-sm sm:text-base">교내 안전 배포 및 파일 기반 오프라인 취합 체계</h3>
                    </div>
                    <ul class="list-disc list-inside space-y-1.5 text-slate-300 leading-relaxed">
                        <li>학년부장과 담임교사 간의 데이터 전달은 암호화된 학급별 배포 패키지(<span class="px-1.5 py-0.5 rounded bg-slate-800 text-emerald-300 font-mono text-xs border border-emerald-500/30">.phgcpkg</span>)와 변경분 취합 파일(<span class="px-1.5 py-0.5 rounded bg-slate-800 text-emerald-300 font-mono text-xs border border-emerald-500/30">.phgcpatch</span>)을 통해서만 안전하게 오프라인으로 교환됩니다.</li>
                        <li>관내 타 학교와의 커트라인 공유 파일(<span class="px-1.5 py-0.5 rounded bg-slate-800 text-indigo-300 font-mono text-xs border border-indigo-500/30">.phgcdata</span>) 내보내기 시 <strong class="text-white">학생 개인 식별 정보(성명, 학번, 개별 성적 등)는 100% 원천 배제</strong>되며, 고교별 합격선 및 학교 단위 단순 통계 수치만 안전하게 포함됩니다.</li>
                    </ul>
                </div>

                <div class="p-4 rounded-xl bg-rose-950/40 border border-rose-500/30 shadow-xs">
                    <div class="flex items-center gap-2 mb-2">
                        <span class="px-2.5 py-0.5 rounded-full text-xs font-black bg-rose-500/30 text-rose-300 border border-rose-400/40">제3조 (필독)</span>
                        <h3 class="font-bold text-rose-200 text-sm sm:text-base">개인정보 관리 책임의 사용자 전적 귀속</h3>
                    </div>
                    <ul class="list-disc list-inside space-y-1.5 text-slate-300 leading-relaxed">
                        <li class="text-rose-200 font-semibold">
                            ⚠️ <strong class="text-white">개인정보 관리 책임의 사용자 전적 귀속:</strong> 본 프로그램은 네트워크 통신이 없는 로컬 오프라인 도구에 불과하며, 프로그램에 입력되는 나이스(NEIS) 엑셀 원본 파일, 학생 인적사항, 성적 및 산출 데이터의 <strong class="text-white underline underline-offset-2">취급·보관·관리·폐기 및 유출 방지에 대한 모든 법적·행정적 책임은 전적으로 사용자(이용 교원 및 소속 학교)에게 있습니다.</strong>
                        </li>
                        <li>비밀번호 분실, 학교 공용 데이터 암호 유출, PC 보안 관리 소홀(분실, 도난, 악성코드 감염 등)로 인하여 발생하는 일체의 개인정보 사고 및 데이터 유실에 대해 개발자는 어떠한 민·형사상 책임도 지지 않습니다.</li>
                        <li>사용자는 상담 완료 후 교실·교무실 이석 시 반드시 화면 잠금(<span class="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200 font-mono text-xs border border-slate-600">Win + L</span>) 및 프로그램 로그아웃을 실천해야 합니다.</li>
                    </ul>
                </div>

                <div class="p-4 rounded-xl bg-amber-950/40 border border-amber-500/30 shadow-xs">
                    <div class="flex items-center gap-2 mb-2">
                        <span class="px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-500/30 text-amber-300 border border-amber-400/40">제4조 (필독)</span>
                        <h3 class="font-bold text-amber-200 text-sm sm:text-base">진학 지도 보조 목적 고지 및 입시 결과 면책</h3>
                    </div>
                    <ul class="list-disc list-inside space-y-1.5 text-slate-300 leading-relaxed">
                        <li class="text-amber-200 font-semibold">
                            📢 <strong class="text-white">실제 입시와의 차이 및 최종 합격 미보증:</strong> 본 프로그램에서 제공하는 내신 환산 점수, 고교별 합격선, 5개년 추세선 및 합격 예측 진단은 교원의 진학 지도를 돕기 위한 <strong class="text-white underline underline-offset-2">'단순 보조 참고 자료'</strong>입니다. 실제 고입 입학전형 결과는 당해 연도 관내 전체 학생들의 지원 성향, 경쟁률, 면접·실기·신체검사 결과 등에 따라 크게 달라질 수 있으므로 법적 합격을 절대 보증하지 않습니다.
                        </li>
                        <li class="text-amber-200 font-semibold">
                            ⚖️ <strong class="text-white">입시 결과 관련 문제 발생 시 책임 귀속:</strong> 본 프로그램의 모의 산출값이나 합격 예측 진단을 신뢰하여 발생한 원서 접수 착오, 고교 불합격, 기타 입시 관련 분쟁이나 불이익에 대한 <strong class="text-white underline underline-offset-2">모든 책임은 전적으로 사용자(상담 교원 및 학교)에게 있으며, 개발자에게 어떠한 이의 제기나 법적 손해배상 책임을 물을 수 없습니다.</strong>
                        </li>
                        <li>
                            🔍 <strong class="text-white">필수 사전 교차 검증 의무:</strong> 고교별 전형 요강 세부 기준은 매년 변경될 수 있으므로, 사용자는 나이스 연동 후 <strong class="text-amber-300">반드시 지원 희망 고등학교의 공식 산출 프로그램(또는 산출표)에 표본 학생 성적을 입력하여 본 프로그램의 계산 결과와 100% 일치하는지 사전 대조·검증한 후 상담에 활용</strong>해야 합니다.
                        </li>
                    </ul>
                </div>

                <div class="p-4 rounded-xl bg-slate-950/60 border border-slate-700/50 shadow-xs">
                    <div class="flex items-center gap-2 mb-2">
                        <span class="px-2.5 py-0.5 rounded-full text-xs font-black bg-slate-700 text-slate-300 border border-slate-600">제5조</span>
                        <h3 class="font-bold text-slate-200 text-sm sm:text-base">동의 거부 권리 및 프로그램 사용 제한</h3>
                    </div>
                    <ul class="list-disc list-inside space-y-1.5 text-slate-300 leading-relaxed">
                        <li>귀하는 본 서약 및 동의를 거부할 권리가 있습니다. 단, 학생 개인정보 보호 및 법적 책임 한계 명확화 규정에 따라 동의하지 않을 경우 프로그램의 모든 기능 사용이 원천 차단되며 즉시 프로그램이 종료됩니다.</li>
                    </ul>
                </div>
            </div>

            <!-- 동의 체크박스 -->
            <div class="pt-2 pb-5">
                <label class="flex items-center gap-3 p-3.5 rounded-2xl bg-slate-800/80 border border-slate-700/90 cursor-pointer hover:bg-slate-800 transition-colors select-none shadow-sm">
                    <input type="checkbox" id="agreementCheckbox" class="w-5 h-5 rounded text-indigo-600 focus:ring-indigo-500 border-slate-600 cursor-pointer">
                    <span class="text-xs sm:text-sm font-bold text-white leading-tight">
                        위 서약 내용을 모두 충분히 확인하였으며, 학생 개인정보 보호 의무를 성실히 준수할 것에 동의합니다.
                    </span>
                </label>
            </div>

            <!-- 하단 버튼 영역 -->
            <div class="flex items-center justify-between gap-3 pt-3 border-t border-slate-700/60">
                <button type="button" id="rejectAgreementBtn" 
                        class="px-5 py-3 rounded-2xl border border-rose-500/50 bg-rose-950/30 hover:bg-rose-900/50 text-rose-300 font-bold text-xs sm:text-sm transition-all cursor-pointer shadow-sm active:scale-95">
                    동의하지 않음 (프로그램 삭제 및 종료)
                </button>
                <button type="button" id="acceptAgreementBtn" disabled
                        class="flex-1 py-3 px-6 rounded-2xl bg-indigo-600 text-white font-bold text-xs sm:text-sm shadow-lg shadow-indigo-600/30 transition-all opacity-40 cursor-not-allowed">
                    서약하고 시작하기 →
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const checkbox = modal.querySelector('#agreementCheckbox');
    const acceptBtn = modal.querySelector('#acceptAgreementBtn');
    const rejectBtn = modal.querySelector('#rejectAgreementBtn');

    checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
            acceptBtn.disabled = false;
            acceptBtn.className = 'flex-1 py-3 px-6 rounded-2xl bg-linear-to-r from-indigo-600 via-indigo-500 to-primary text-white font-bold text-xs sm:text-sm shadow-xl shadow-indigo-600/30 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer opacity-100';
        } else {
            acceptBtn.disabled = true;
            acceptBtn.className = 'flex-1 py-3 px-6 rounded-2xl bg-indigo-600 text-white font-bold text-xs sm:text-sm shadow-lg shadow-indigo-600/30 transition-all opacity-40 cursor-not-allowed';
        }
    });

    acceptBtn.addEventListener('click', async () => {
        if (!checkbox.checked) return;
        acceptBtn.disabled = true;
        acceptBtn.innerHTML = '<span class="spinner" style="width:12px;height:12px;border-width:1.5px;"></span> 처리 중...';
        try {
            await window.go.main.App.AcceptAgreement();
            modal.remove();
            if (typeof onAcceptCallback === 'function') {
                onAcceptCallback();
            }
        } catch (err) {
            alert('동의 정보 저장 실패: ' + err);
            acceptBtn.disabled = false;
            acceptBtn.textContent = '서약하고 시작하기 →';
        }
    });

    rejectBtn.addEventListener('click', async () => {
        const confirmed = await showModalConfirm({
            title: '🚨 프로그램 및 데이터 영구 파기 경고',
            message: `
                <div class="space-y-3 text-xs leading-relaxed text-left break-keep-all">
                    <div class="p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-200">
                        <p class="font-bold text-sm text-rose-100 mb-1">⚠️ 정말 동의하지 않으시겠습니까?</p>
                        <p>학생 개인정보 보호 규정에 따라 비동의 시 <strong>프로그램 실행 파일(.exe)과 모든 저장 데이터가 즉시 영구 삭제(파기)</strong>되며 프로그램이 완전히 종료됩니다.</p>
                    </div>
                    <p class="text-slate-300">삭제된 프로그램 및 데이터는 복구할 수 없습니다. 계속 진행하시겠습니까?</p>
                </div>
            `,
            type: 'error',
            confirmText: '네, 삭제하고 종료합니다',
            cancelText: '다시 생각하기'
        });

        if (!confirmed) return;

        rejectBtn.disabled = true;
        rejectBtn.innerHTML = '<span class="spinner" style="width:12px;height:12px;border-width:1.5px;"></span> 프로그램 파기 중...';
        try {
            await window.go.main.App.SelfDestruct();
        } catch (err) {
            alert('자가 삭제 처리 중 오류: ' + err);
        }
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
                            <span class="font-bold text-emerald-300 text-xs tracking-wide">학년부장 배포 자료 가져오기 (.phgcpkg)</span>
                        </button>
                        <button type="button" id="passwordResetImportBtn" 
                                class="group w-full py-2.5 px-4 rounded-xl border border-sky-500/40 bg-sky-950/25 hover:bg-sky-900/40 hover:border-sky-400/70 transition-all duration-200 flex items-center justify-center gap-2 shadow-sm cursor-pointer active:scale-[0.99]">
                            <span class="text-base group-hover:scale-110 transition-transform">🔑</span>
                            <span class="font-bold text-sky-300 text-xs tracking-wide">비밀번호 재설정 파일 가져오기 (.phgcreset)</span>
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
                button.innerHTML = '<span class="text-base group-hover:scale-110 transition-transform">📦</span><span class="font-bold text-emerald-300 text-xs tracking-wide">학년부장 배포 자료 가져오기 (.phgcpkg)</span>';
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
                button.innerHTML = '<span class="text-base group-hover:scale-110 transition-transform">🔑</span><span class="font-bold text-sky-300 text-xs tracking-wide">비밀번호 재설정 파일 가져오기 (.phgcreset)</span>';
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
                window.currentUser = user;
                ScreenLockManager.resetTimer();
                localStorage.setItem('phgc_last_login_username', username);

                if (user.MustChangePassword) {
                    renderPasswordChangeScreen(username);
                } else {
                    if (user.Role === 'homeroom') {
                        updateAppWindowTitle('homeroom', user.ClassNum);
                        if (typeof window.renderTeacherScreen === 'function') {
                            window.renderTeacherScreen(schoolName, user.ClassNum);
                        }
                    } else if (user.Role === 'viewer') {
                        updateAppWindowTitle('viewer');
                        if (typeof window.renderTeacherScreen === 'function') {
                            window.renderTeacherScreen(schoolName, null);
                        }
                    } else {
                        updateAppWindowTitle('master');
                        if (typeof window.renderAdminScreen === 'function') {
                            window.renderAdminScreen(schoolName);
                        }
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
            window.currentUser.MustChangePassword = false;
            const config = await window.go.main.App.GetSchoolConfig();
            if (window.currentUser.Role === 'homeroom') {
                if (typeof window.renderTeacherScreen === 'function') {
                    window.renderTeacherScreen(config.schoolName, window.currentUser.ClassNum);
                }
            } else if (window.currentUser.Role === 'viewer') {
                if (typeof window.renderTeacherScreen === 'function') {
                    window.renderTeacherScreen(config.schoolName, null);
                }
            } else {
                if (typeof window.renderAdminScreen === 'function') {
                    window.renderAdminScreen(config.schoolName);
                }
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
