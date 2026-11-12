import { showModalAlert } from './dialogs.js';

// 질문·피드백: GitHub 이슈 작성 양식(.github/ISSUE_TEMPLATE/feedback.yml). 공개 게시판이므로 양식 맨 위에 개인정보 주의를 둔다.
export const FEEDBACK_BOARD_URL = "https://github.com/purnpado/kkomi_ipsi/issues/new?template=feedback.yml";
export const GITHUB_RELEASE_URL = "https://github.com/purnpado/kkomi_ipsi/releases/latest";

export function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function detectOS() {
    const ua = navigator.userAgent || '';
    if (/Windows NT 10/.test(ua)) return 'Windows 10/11';
    if (/Windows/.test(ua)) return 'Windows';
    if (/Mac OS X/.test(ua)) return 'macOS';
    return '';
}

/** 질문·피드백 양식을 연다. 프로그램 버전과 운영체제만 미리 채우고 학교·학생 정보는 넣지 않는다. */
export async function openFeedbackPage() {
    let version = '';
    try {
        version = (await window.go?.main?.App?.GetAppVersion?.()) || '';
    } catch (_) {}
    const params = new URLSearchParams();
    if (version) params.set('version', version);
    const os = detectOS();
    if (os) params.set('os', os);
    const query = params.toString();
    openExternalUrlSafe(query ? `${FEEDBACK_BOARD_URL}&${query}` : FEEDBACK_BOARD_URL);
}

export function openExternalUrlSafe(url) {
    try {
        if (window.go?.main?.App?.OpenExternalURL) {
            window.go.main.App.OpenExternalURL(url);
        } else if (window.runtime?.BrowserOpenURL) {
            window.runtime.BrowserOpenURL(url);
        } else {
            window.open(url, '_blank');
        }
    } catch (err) {
        console.error("외부 링크 열기 실패:", err);
    }
}

export function quitAppSafe() {
    try {
        if (window.go?.main?.App?.QuitApp) {
            window.go.main.App.QuitApp();
        } else if (window.runtime?.Quit) {
            window.runtime.Quit();
        } else {
            window.close();
        }
    } catch (err) {
        console.error("프로그램 종료 실패:", err);
    }
}

export function showStartupUpdateModal(result) {
    document.getElementById('startupUpdateModal')?.remove();

    const latestVer = result.latestVersion || '1.0.0';
    const currentVer = result.currentVersion || '1.0.0';
    const releaseNotes = result.releaseNotes || '새로운 기능 추가 및 시스템 안정화 패치가 포함되어 있습니다.';

    const modal = document.createElement('div');
    modal.id = 'startupUpdateModal';
    modal.className = 'fixed inset-0 bg-black/80 backdrop-blur-md z-[9999] flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200';
    modal.innerHTML = `
        <div class="glass-card max-w-lg w-full p-6 sm:p-7 border border-indigo-500/40 rounded-3xl shadow-2xl flex flex-col gap-4 text-left animate-in zoom-in-95 duration-200 break-keep-all select-none">
            
            <!-- 헤더 영역 -->
            <div class="flex items-start gap-3.5 border-b border-slate-700/60 pb-4">
                <div class="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-400/40 flex items-center justify-center text-2xl shadow-inner shrink-0">
                    🚀
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-1 flex-wrap">
                        <span class="px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-[11px] font-bold border border-indigo-500/30">
                            NEW UPDATE
                        </span>
                        <span class="text-xs text-slate-400 font-mono">
                            v${currentVer} → <strong class="text-amber-300 font-bold">v${latestVer}</strong>
                        </span>
                    </div>
                    <h3 class="text-lg font-black text-white tracking-tight leading-snug">
                        새로운 버전(v${latestVer})이 출시되었습니다!
                    </h3>
                </div>
            </div>

            <!-- 안내 메시지 -->
            <div class="text-xs sm:text-sm text-slate-300 leading-relaxed">
                더욱 안정적이고 편리한 진학 상담을 위해 최신 버전 이용을 권장합니다.<br>
                <strong>공식 다운로드 페이지(GitHub Releases)</strong>로 이동하시겠습니까?
            </div>

            <!-- 주요 변경 사항 카드 -->
            <div class="space-y-1.5">
                <div class="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <span>📦</span> 업데이트 주요 내용:
                </div>
                <div class="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 text-xs text-slate-300 leading-relaxed max-h-40 overflow-y-auto whitespace-pre-wrap font-sans select-text shadow-inner">
${releaseNotes}
                </div>
            </div>

            <!-- 안전 보장 안내 -->
            <div class="flex items-center gap-2 p-2.5 rounded-xl bg-slate-800/40 border border-slate-700/40 text-[11px] text-slate-400">
                <span class="text-emerald-400 text-sm shrink-0">🔒</span>
                <span>기존 학생 상담 데이터와 합격선 설정은 안전하게 그대로 유지됩니다.</span>
            </div>

            <!-- 하단 액션 버튼 영역 -->
            <div class="pt-2 flex flex-col gap-2.5">
                <div class="grid grid-cols-2 gap-3">
                    <button id="skipStartupUpdateBtn" 
                            type="button"
                            class="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 font-bold text-xs transition-colors cursor-pointer text-center">
                        나중에 하기
                    </button>
                    <button id="goToDownloadReleaseBtn" 
                            type="button"
                            class="w-full py-2.5 px-4 rounded-xl bg-linear-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-bold text-xs shadow-lg shadow-indigo-950/50 hover:shadow-indigo-500/25 transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95">
                        <span>🌐</span> 다운로드 받으러 이동
                    </button>
                </div>
                <div class="text-center pt-1">
                    <button id="openFeedbackInUpdateBtn" 
                            type="button"
                            class="text-[11px] text-slate-400 hover:text-emerald-300 inline-flex items-center gap-1 transition-colors cursor-pointer underline underline-offset-2">
                        <span>💬</span> 질문이나 의견이 있으신가요? 질문·피드백 남기기(GitHub)
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('openFeedbackInUpdateBtn')?.addEventListener('click', () => {
        openFeedbackPage();
    });

    document.getElementById('skipStartupUpdateBtn')?.addEventListener('click', () => {
        modal.remove();
    });

    document.getElementById('goToDownloadReleaseBtn')?.addEventListener('click', () => {
        openExternalUrlSafe(GITHUB_RELEASE_URL);
        modal.remove();
        setTimeout(() => {
            quitAppSafe();
        }, 400);
    });
}

export async function checkUpdateOnStartup(localVer, isManual = false) {
    const statusEl = document.getElementById('startupUpdateStatus');
    if (statusEl) {
        statusEl.innerHTML = '<span class="spinner" style="width:10px;height:10px;border-width:1.5px;"></span> 서버 확인 중...';
    }

    // Wails 바인딩 주입 대기 (최대 3초)
    for (let i = 0; i < 30; i++) {
        if (window.go?.main?.App?.SyncWithServer) break;
        await delay(100);
    }

    try {
        if (window.go?.main?.App?.SyncWithServer) {
            const result = await window.go.main.App.SyncWithServer();
            if (result && result.hasUpdate) {
                if (statusEl) {
                    statusEl.innerHTML = `<span class="text-rose-400 font-bold animate-pulse">🚀 새 버전 v${result.latestVersion} 출시!</span>`;
                }
                showStartupUpdateModal(result);
            } else {
                const serverVer = result?.latestVersion || localVer || '';
                if (statusEl) {
                    statusEl.innerHTML = `<span class="text-emerald-400">✅ 최신 버전 (v${serverVer})</span>`;
                }
                if (isManual) {
                    await showModalAlert({
                        title: '최신 버전 확인',
                        message: `현재 최신 버전(<strong>v${serverVer}</strong>)을 사용하고 있습니다.<br>새로운 업데이트가 없습니다.`,
                        type: 'success'
                    });
                }
            }
        }
    } catch (e) {
        console.log("업데이트 확인 실패:", e);
        if (statusEl) {
            statusEl.innerHTML = `<span class="text-slate-400">오프라인 안전 모드</span>`;
        }
        if (isManual) {
            await showModalAlert({
                title: '오프라인 상태',
                message: '인터넷 연결이 필요합니다.<br>네트워크가 연결된 환경에서 다시 확인해 주세요.',
                type: 'warning'
            });
        }
    }
}

// 전역 바인딩
if (typeof window !== 'undefined') {
    window.delay = delay;
    window.openExternalUrlSafe = openExternalUrlSafe;
    window.quitAppSafe = quitAppSafe;
    window.showStartupUpdateModal = showStartupUpdateModal;
    window.checkUpdateOnStartup = checkUpdateOnStartup;
    window.FEEDBACK_BOARD_URL = FEEDBACK_BOARD_URL;
    window.GITHUB_RELEASE_URL = GITHUB_RELEASE_URL;
}
