import { SyncWithServer } from '../../../wailsjs/go/main/App';
import middleSchools from '../../assets/middleschools.json';
import logoUniversal from '../../assets/images/logo-universal.png';
import { showModalAlert, showModalPrompt } from '../../core/dialogs.js';
import { FEEDBACK_BOARD_URL, GITHUB_RELEASE_URL, openExternalUrlSafe, quitAppSafe, delay } from '../../core/updater.js';
import { getAppRoot } from './authRoot.js';
import { navigate } from '../../core/navigation.js';
import { state } from '../../core/store.js';
import { admissionLabel, admissionYearHint, currentAdmissionYear } from '../../core/admissionYear.js';

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
    const admissionYear = existingConfig?.admissionYear || currentAdmissionYear();
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
                    <label class="block text-sm font-semibold text-text-muted mb-2">고입 학년도 (고교 입학 연도)</label>
                    <input type="text" inputmode="numeric" id="admissionYear" class="input-field" value="${admissionYear}" maxlength="4" required />
                    <p class="text-xs text-text-muted mt-1">${admissionYearHint(currentAdmissionYear())}. 화면에는 "${admissionLabel(currentAdmissionYear())}"처럼 표시됩니다.</p>
                    <div id="admissionYearError" class="error-msg">고입 학년도는 2000~2100 사이로 입력해 주세요.</div>
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
            navigate('mode-select', { schoolName: existingConfig.schoolName });
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
        navigate('login', { schoolName });
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
        navigate('mode-select', { schoolName });
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
        if (state.currentUser) {
            if (state.currentUser.Role === 'master' || state.currentUser.Role === 'viewer') {
                navigate('admin', { schoolName });
            } else {
                navigate('teacher', { schoolName, classNum: state.currentUser.ClassNum });
            }
        } else {
            navigate('login', { schoolName });
        }
    });
}
