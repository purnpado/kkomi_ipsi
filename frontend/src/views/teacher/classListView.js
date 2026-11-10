import { GetSchoolConfig } from '../../../wailsjs/go/main/App';
import logoUniversal from '../../assets/images/logo-universal.png';
import { updateAppWindowTitle } from '../../core/utils.js';
import { ScreenLockManager } from '../../core/screenLock.js';
import { showModalAlert, showModalPrompt } from '../../core/dialogs.js';
import { app } from '../../core/dom.js';
import { getGeneralGuideCutoff, setGeneralGuideCutoff } from '../../core/generalGuide.js';
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

    let localVer = '0.5.6';
    try {
        localVer = await window.go.main.App.GetAppVersion();
    } catch (e) {
        console.warn(e);
    }

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
                <div class="flex items-center gap-3 shrink-0">
                    <img src="${logoUniversal}" alt="로고" class="w-10 h-10 rounded-xl shadow-md border border-indigo-400/40 object-cover shrink-0" />
                    <div>
                        <h1 class="text-2xl font-black text-white flex items-center gap-2.5 whitespace-nowrap">
                            진학 상담 대시보드
                            <span class="text-xs bg-slate-800 text-indigo-300 px-2.5 py-0.5 rounded-full border border-indigo-500/30 font-mono font-bold">v${localVer}</span>
                        </h1>
                        <p class="text-text-muted text-xs mt-0.5 whitespace-nowrap">${schoolName}</p>
                    </div>
                </div>
                <div class="flex items-center gap-3 flex-wrap">
                    <!-- 일반고 지원가이드 판정 기준 커스텀 -->
                    <div class="flex items-center gap-1.5 bg-slate-800/80 px-2.5 py-1.5 rounded-lg border border-slate-700/80 shadow-inner">
                        <span class="text-xs text-slate-300 font-bold" title="기본값 80%. 각 학교 상황에 맞춰 일반고 합격 안정선 기준을 조정할 수 있습니다.">🎯 일반고 안정기준:</span>
                        <input type="number" id="generalGuideCutoffInput" min="50" max="99" step="1" 
                               class="w-14 text-center py-0.5 px-1 rounded bg-slate-900 border border-slate-600 text-indigo-300 text-xs font-bold outline-none" 
                               value="${getGeneralGuideCutoff()}" />
                        <span class="text-xs text-slate-400 font-bold">%</span>
                        <button id="saveGuideCutoffBtn" class="text-[11px] bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-0.5 rounded font-bold transition-colors cursor-pointer" title="클릭 시 전체 학생 판정이 즉시 갱신됩니다">적용</button>
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

            <!-- 필수 사전 검증 권장 안내 배너 -->
            <div class="mb-6 p-4 rounded-2xl bg-amber-950/40 border border-amber-500/40 flex items-start gap-3.5 shadow-sm break-keep-all select-none">
                <span class="text-2xl mt-0.5">💡</span>
                <div class="text-xs sm:text-sm leading-relaxed text-amber-200">
                    <strong class="text-amber-100 font-bold mb-1 text-sm sm:text-base flex items-center gap-1.5">
                        <span>[필수 사전 검증 권장]</span> 학생·학부모 상담 전, 지원 희망 고교 공식 산출식과 계산값을 대조해 보세요!
                    </strong>
                    고교별 전형 요강(교과/출결/봉사 반영 비율 및 가산점)은 학교별로 상이할 수 있습니다. 1:1 진학 상담 전, 표본 학생의 성적을 <strong>지원 희망 고등학교의 공식 산출 프로그램</strong>에 입력하여 <strong>본 프로그램의 산출값과 일치하는지 반드시 사전 확인</strong> 후 상담에 임해 주시기 바랍니다.
                </div>
            </div>

            <div id="teacherContent">
                ${getClassGridHTML()}
            </div>
        </div>
    `;

    // 일반고 기준 적용 버튼 이벤트
    document.getElementById('saveGuideCutoffBtn')?.addEventListener('click', () => {
        const inputVal = parseFloat(document.getElementById('generalGuideCutoffInput').value);
        if (isNaN(inputVal) || inputVal < 10 || inputVal > 100) {
            alert('유효한 백분율(10~100 사이)을 입력해 주세요.');
            return;
        }
        setGeneralGuideCutoff(inputVal);
        alert(`후기 일반고 합격 안정선 기준이 [${inputVal}%]로 설정되었습니다.\n(경계선: ${Math.min(100, inputVal + 10)}%까지)`);
        const currentClass = activeClassNum;
        if (currentClass) {
            loadClass(currentClass);
        }
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
