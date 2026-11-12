import { GetSchoolConfig } from '../../core/backend.js';
import { updateAppWindowTitle } from '../../core/utils.js';
import { ScreenLockManager } from '../../core/screenLock.js';
import { showModalAlert, showModalPrompt } from '../../core/dialogs.js';
import { app } from '../../core/dom.js';
import { judgmentSummaryText } from '../../core/admissionJudgment.js';
import { renderStudentList } from './studentList/studentListView.js';
import { navigate, notifyLogout, openModal, requestScreenLock } from '../../core/navigation.js';
import { state } from '../../core/store.js';
import { eventBus, EVENTS } from '../../core/eventBus.js';

// 학급 새로고침 이벤트 구독 해제 함수 목록 (화면 재진입 시 교체)
let classRefreshSubscriptions = [];

// ===== 담임 교사 모드 화면 =====
export async function renderTeacherScreen(schoolName, targetClassNum = null) {
    let classCount = 8;
    try {
        const config = await GetSchoolConfig();
        classCount = config.classCount;
    } catch (e) {
        console.error(e);
    }

    if (state.currentUser && state.currentUser.Role === 'homeroom') {
        // 담임인 경우 자기 반만 선택 가능
        const myClass = state.currentUser.ClassNum;
        targetClassNum = myClass; // 강제로 타겟 클래스 변경
    }
    let activeClassNum = null;

    app.className = 'wide-layout';

    // 학급 선택 바둑판 카드 그리드 렌더링 함수
    const getClassGridHTML = () => {
        let cards = '';
        const isHomeroom = state.currentUser && state.currentUser.Role === 'homeroom';
        const myClass = isHomeroom ? state.currentUser.ClassNum : null;

        for (let i = 1; i <= classCount; i++) {
            const isAccessible = !isHomeroom || (i === myClass);
            if (isAccessible) {
                cards += `
                    <div class="class-card-btn bg-slate-800/70 hover:bg-indigo-950/40 border-2 border-slate-700/60 hover:border-primary/80 rounded-2xl p-6 text-center cursor-pointer transition-all duration-200 group flex flex-col items-center justify-center gap-3 shadow-md"
                         data-class="${i}">
                        <div class="w-14 h-14 rounded-2xl bg-slate-700/60 text-indigo-300 group-hover:bg-primary group-hover:text-white flex items-center justify-center text-2xl font-black transition-all">
                            ${i}
                        </div>
                        <div>
                            <div class="text-lg font-bold text-white group-hover:text-primary transition-colors">3학년 ${i}반</div>
                            <div class="text-xs text-slate-400 mt-1">${isHomeroom ? '⭐ 내 담당 학급' : '진학 상담 및 성적 명단'}</div>
                        </div>
                        <span class="inline-flex items-center gap-1 text-xs text-primary font-bold mt-1 group-hover:translate-x-1 transition-transform">
                            학생 명단 열기 →
                        </span>
                    </div>
                `;
            } else {
                cards += `
                    <div class="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 text-center opacity-40 cursor-not-allowed flex flex-col items-center justify-center gap-3 select-none"
                         title="담당 학급(${myClass}반)만 열람하실 수 있습니다.">
                        <div class="w-14 h-14 rounded-2xl bg-slate-800 text-slate-500 flex items-center justify-center text-xl font-bold">
                            🔒
                        </div>
                        <div>
                            <div class="text-lg font-bold text-slate-400">3학년 ${i}반</div>
                            <div class="text-xs text-slate-500 mt-1">타 학급 열람 제한</div>
                        </div>
                        <span class="text-xs text-slate-600 font-medium mt-1">접근 불가</span>
                    </div>
                `;
            }
        }

        const isHomeroomMsg = isHomeroom
            ? `선생님의 담당 학급인 <strong class="text-indigo-300">3학년 ${myClass}반</strong>을 클릭하여 진학 상담을 시작하세요.`
            : `조회하고자 하는 학급 카드를 클릭하세요. (총 ${classCount}학급)`;

        return `
            <div class="max-w-5xl mx-auto py-8 space-y-6 fade-in">
                <div class="text-center space-y-2">
                    <h2 class="text-2xl font-black text-white flex items-center justify-center gap-2">
                        <span>🏫</span> 상담할 학급을 선택해 주세요
                    </h2>
                    <p class="text-sm text-text-muted">${isHomeroomMsg}</p>
                </div>
                <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 md:gap-5">
                    ${cards}
                </div>
            </div>
        `;
    };

    app.innerHTML = `
        <div class="glass-card p-6 md:p-8 w-full max-w-[1700px] mx-auto min-h-[85vh]">
            <div class="flex flex-wrap items-center justify-between mb-6 pb-4 border-b border-slate-700/50 gap-4">
                <div class="shrink-0">
                    <h1 class="text-2xl font-black text-white whitespace-nowrap">${state.currentUser?.Role === 'homeroom' ? `3학년 ${state.currentUser.ClassNum}반 명렬표·상담` : '학급 명렬표·상담'}</h1>
                    <p class="text-text-muted text-xs mt-0.5 whitespace-nowrap">${schoolName}${state.currentUser?.Role === 'viewer' ? ' · 조회 전용' : ''}</p>
                </div>
                <div class="flex items-center gap-3 flex-wrap">
                    <!-- 4단계 판정·후기 일반고 안정선 (학교 설정, 학년부장만 변경) -->
                    <div class="flex items-center gap-1.5 bg-slate-800/80 px-2.5 py-1.5 rounded-lg border border-slate-700/80 shadow-inner" title="학년부장이 정한 학교 판정 기준입니다. 배포자료로 모든 담임 PC에 같은 기준이 적용됩니다.">
                        <span class="text-xs text-slate-300 font-bold">🎯 판정 기준:</span>
                        <span class="text-xs text-indigo-300 font-bold">${judgmentSummaryText()}</span>
                        ${state.currentUser?.Role === 'master' ? '<button id="openJudgmentSettingsBtn" class="text-[11px] bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-0.5 rounded font-bold transition-colors cursor-pointer">설정</button>' : ''}
                    </div>

                    <button id="classGridHomeBtn" class="btn-secondary whitespace-nowrap text-xs px-3 py-2 flex items-center gap-1.5" style="display: none;">
                        <span>🗂️</span> 학급 목록
                    </button>
                    <button id="exportCurrentClassPatchBtn" class="btn-secondary whitespace-nowrap text-xs px-3 py-2 flex items-center gap-1.5" title="현재 학급의 진학 상담 및 희망원서 취합자료(패치 파일)를 내보냅니다" style="display: none;">
                        <span>📤</span> 취합자료 내보내기
                    </button>
                    <button id="lockScreenTeacherBtn" class="btn-secondary whitespace-nowrap text-xs px-3 py-2 flex items-center gap-1.5 text-amber-300 hover:text-amber-200 border-amber-500/30 hover:bg-amber-500/10 cursor-pointer transition-all font-bold" title="자리를 비우실 때 화면을 즉시 잠그고 학생 개인정보를 보호합니다 (단축키: Ctrl+L)">
                        <span>🔒</span> 화면 잠금
                    </button>
                    <button id="openTeacherGuideBtn" class="btn-secondary whitespace-nowrap text-xs px-3 py-2 flex items-center gap-1.5" title="프로그램 사용 설명서 열기">
                        <span>📖</span> 사용 설명서
                    </button>
                    <button id="backBtn" class="btn-secondary whitespace-nowrap text-xs px-4 py-2.5">
                        ${state.currentUser && state.currentUser.Role === 'homeroom' ? '← 로그아웃' : '← 돌아가기'}
                    </button>
                </div>
            </div>

            <!-- 상담 전 확인 안내(짧게) -->
            <div class="mb-5 px-4 py-2.5 rounded-xl bg-amber-950/30 border border-amber-500/40 text-xs text-amber-200 break-keep-all">
                <strong class="text-amber-100">상담 전 꼭 확인하세요.</strong> 표본 학생의 성적을 지원 희망 고교의 공식 산출 프로그램에 넣어 이 프로그램의 계산값과 같은지 대조한 뒤 상담에 쓰세요.
            </div>

            <div id="teacherContent">
                ${getClassGridHTML()}
            </div>
        </div>
    `;

    // 판정 기준 설정(학년부장): 저장되면 현재 학급을 다시 그린다.
    document.getElementById('openJudgmentSettingsBtn')?.addEventListener('click', () => {
        openModal('judgment-settings', { onSaved: () => renderTeacherScreen(schoolName, activeClassNum) });
    });

    // 창 제목 역할 반영
    if (state.currentUser?.Role === 'homeroom') {
        updateAppWindowTitle('homeroom', state.currentUser.ClassNum);
    } else if (state.currentUser?.Role === 'viewer') {
        updateAppWindowTitle('viewer');
    } else if (state.currentUser?.Role === 'master') {
        if (targetClassNum) {
            updateAppWindowTitle('master', `3학년 ${targetClassNum}반`);
        } else {
            updateAppWindowTitle('master');
        }
    }

    // 학급 카드 클릭 시 학급 로드 함수
    const loadClass = async (classNum) => {
        const exportPatchBtn = document.getElementById('exportCurrentClassPatchBtn');
        if (!classNum) {
            activeClassNum = null;
            document.getElementById('classGridHomeBtn').style.display = 'none';
            if (exportPatchBtn) exportPatchBtn.style.display = 'none';
            document.getElementById('teacherContent').innerHTML = getClassGridHTML();
            bindGridEvents();
            if (state.currentUser?.Role === 'master') {
                updateAppWindowTitle('master');
            }
            return;
        }

        activeClassNum = classNum;
        state.activeClassNum = classNum;
        if (state.currentUser?.Role === 'master') {
            updateAppWindowTitle('master', `3학년 ${classNum}반`);
        } else if (state.currentUser?.Role === 'homeroom') {
            updateAppWindowTitle('homeroom', classNum);
        }

        document.getElementById('classGridHomeBtn').style.display = 'inline-flex';
        // 담임교사가 학급에 진입했을 때만 취합자료 내보내기 버튼 표시 (학년부장은 담임 자료를 받는 관리자이므로 제외)
        if (exportPatchBtn) {
            exportPatchBtn.style.display = (state.currentUser?.Role === 'homeroom') ? 'inline-flex' : 'none';
        }
        document.getElementById('teacherContent').innerHTML = '<div class="text-center py-20"><span class="spinner"></span> 데이터를 불러오는 중...</div>';

        try {
            const students = await window.go.main.App.GetClassGrades(classNum);
            renderStudentList(students, classNum);
        } catch (err) {
            document.getElementById('teacherContent').innerHTML = `<div class="text-danger py-20 text-center font-bold">오류 발생: ${err}</div>`;
        }
    };
    // 학급 자료·지원현황 변경 이벤트를 받으면 보고 있는 학급을 다시 불러온다.
    // 화면을 다시 그릴 때마다 이전 구독을 해제해 중복 새로고침을 막는다.
    classRefreshSubscriptions.forEach(off => off());
    const refreshActiveClass = () => {
        if (activeClassNum && document.getElementById('teacherContent')) loadClass(activeClassNum);
    };
    classRefreshSubscriptions = [
        eventBus.on(EVENTS.CLASS_UPDATED, refreshActiveClass),
        eventBus.on(EVENTS.APPLICATIONS_CHANGED, refreshActiveClass)
    ];

    // 학급 카드 클릭 이벤트 바인딩
    const bindGridEvents = () => {
        document.querySelectorAll('.class-card-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const cNum = parseInt(btn.dataset.class);
                loadClass(cNum);
            });
        });
    };

    bindGridEvents();
    ScreenLockManager.resetTimer();

    document.getElementById('lockScreenTeacherBtn')?.addEventListener('click', () => {
        requestScreenLock('수동 잠금');
    });

    document.getElementById('classGridHomeBtn')?.addEventListener('click', () => {
        loadClass(null);
    });

    // 담임교사 취합자료 내보내기 버튼 이벤트 바인딩
    document.getElementById('exportCurrentClassPatchBtn')?.addEventListener('click', async () => {
        if (!activeClassNum) {
            await showModalAlert('상담 및 입력 내용을 제출할 학급을 먼저 선택해 주세요.', '알림', 'warning');
            return;
        }
        if (state.currentUser?.Role !== 'homeroom') {
            await showModalAlert('취합자료 제출은 담임교사 계정으로 로그인한 경우에만 가능합니다.', '안내', 'info');
            return;
        }
        const password = await showModalPrompt({
            title: '취합자료 내보내기 (학년부장 제출용)',
            message: '학년부장이 안내한 공용 데이터 암호를 입력하세요.',
            isPassword: true
        });
        if (!password) return;
        try {
            const path = await window.go.main.App.SaveCurrentClassPatch(password);
            await showModalAlert(`취합자료 파일이 안전하게 저장되었습니다.\n\n저장 위치:\n${path}\n\n이 파일을 학년부장 선생님께 전달해 주세요.`, '취합자료 저장 완료', 'success');
        } catch (err) {
            await showModalAlert('취합자료 제출 실패: ' + err, '오류', 'error');
        }
    });

    document.getElementById('openTeacherGuideBtn')?.addEventListener('click', () => {
        openModal('guide', { role: state.currentUser?.Role || 'homeroom' });
    });

    document.getElementById('backBtn').addEventListener('click', async () => {
        app.className = '';
        if (state.currentUser && (state.currentUser.Role === 'homeroom' || state.currentUser.Role === 'viewer')) {
            ScreenLockManager.clearTimer();
            await window.go.main.App.Logout?.().catch(() => { });
            notifyLogout();
            updateAppWindowTitle();
            navigate('login', { schoolName });
        } else {
            updateAppWindowTitle('master');
            navigate('admin', { schoolName });
        }
    });

    // 담임교사인 경우 본인 반 자동 선택
    if (targetClassNum) {
        loadClass(targetClassNum);
    }
}
