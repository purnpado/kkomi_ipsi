// ===== 프로그램 사용 설명서(가이드) 모달 및 A4 인쇄 =====
import { printOnly } from '../print/printEngine.js';
import { state } from '../core/store.js';

export function renderGuideModal(role = 'homeroom') {
    document.getElementById('programGuideModal')?.remove();

    const isMaster = (role === 'master' || state.currentUser?.Role === 'master');

    const modal = document.createElement('div');
    modal.id = 'programGuideModal';
    modal.className = 'fixed inset-0 bg-black/80 backdrop-blur-md z-[60000] flex items-center justify-center p-4 sm:p-6 overflow-y-auto animate-in fade-in duration-200';

    modal.innerHTML = `
        <div class="glass-card max-w-4xl w-full p-6 sm:p-8 border border-slate-700/80 rounded-3xl shadow-2xl flex flex-col max-h-[92vh] break-keep-all">
            <!-- 모달 상단 헤더 & 인쇄/닫기 버튼 (화면 전용) -->
            <div class="flex items-center justify-between pb-4 border-b border-slate-700/60 no-print flex-wrap gap-3">
                <div class="flex items-center gap-2.5">
                    <span class="text-2xl sm:text-3xl">📖</span>
                    <div>
                        <h2 class="text-xl sm:text-2xl font-black text-white">
                            『꼬미입시』 프로그램 사용 설명서
                        </h2>
                        <p class="text-xs text-text-muted mt-0.5">안전하고 효율적인 중3 고입 진학 지도를 위한 단계별 업무 매뉴얼</p>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <button id="printGuideBtn" class="btn-secondary text-xs px-3.5 py-2 font-bold inline-flex items-center gap-1.5 shadow-sm hover:scale-105 transition-all">
                        <span>🖨️</span> 설명서 인쇄 (A4)
                    </button>
                    <button id="closeGuideBtn" class="text-2xl text-slate-400 hover:text-white px-2 cursor-pointer transition-colors">&times;</button>
                </div>
            </div>

            <!-- 역할별 탭 (학년부장에게는 2개 탭 모두 노출, 담임에게는 담임용만 노출) -->
            <div class="flex gap-2 pt-4 pb-3 border-b border-slate-700/50 no-print">
                ${isMaster ? `
                <button id="tabMasterGuide" class="px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-indigo-600 text-white transition-colors cursor-pointer">
                    👔 학년부장(마스터) 운영 매뉴얼
                </button>
                <button id="tabTeacherGuide" class="px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer">
                    📘 담임·진로교사 진학지도 매뉴얼
                </button>
                ` : `
                <div class="px-4 py-1.5 rounded-xl text-xs sm:text-sm font-bold bg-indigo-600 text-white">
                    📘 담임·진로교사 진학지도 매뉴얼
                </div>
                `}
            </div>

            <!-- 설명서 본문 스크롤 영역 -->
            <div class="my-4 overflow-y-auto max-h-[60vh] custom-scrollbar pr-2 space-y-6 text-slate-200 text-xs sm:text-sm leading-relaxed" id="guideContentArea">
                ${isMaster ? getMasterGuideHTML() : getTeacherGuideHTML()}
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const closeBtn = modal.querySelector('#closeGuideBtn');
    const printBtn = modal.querySelector('#printGuideBtn');
    const tabMaster = modal.querySelector('#tabMasterGuide');
    const tabTeacher = modal.querySelector('#tabTeacherGuide');
    const contentArea = modal.querySelector('#guideContentArea');

    closeBtn.onclick = () => modal.remove();

    printBtn.onclick = () => {
        printOnly('guide', 'portrait');
    };

    if (isMaster && tabMaster && tabTeacher) {
        tabMaster.onclick = () => {
            tabMaster.className = 'px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-indigo-600 text-white transition-colors cursor-pointer';
            tabTeacher.className = 'px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer';
            contentArea.innerHTML = getMasterGuideHTML();
        };
        tabTeacher.onclick = () => {
            tabTeacher.className = 'px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-indigo-600 text-white transition-colors cursor-pointer';
            tabMaster.className = 'px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer';
            contentArea.innerHTML = getTeacherGuideHTML();
        };
    }
}

// 담임교사용 가이드 HTML
export function getTeacherGuideHTML() {
    return `
        <div class="space-y-4">
            <!-- 사전 검증 권장 주의 카드 -->
            <div class="p-4 rounded-2xl bg-amber-950/40 border border-amber-500/40 text-amber-200 shadow-xs">
                <h4 class="font-bold text-amber-100 text-sm sm:text-base mb-1.5 flex items-center gap-2">
                    <span>⚠️</span> [필수 점검] 상담 전 고교 공식 산출 프로그램과 계산값 대조
                </h4>
                <p class="text-xs sm:text-[13px] leading-relaxed">
                    본격적인 1:1 진학 상담 전, 표본 학생 성적을 <strong>지원 희망 고등학교의 공식 산출 프로그램(또는 산출표)</strong>에 직접 대입하여 <strong>본 프로그램의 계산값과 100% 일치하는지 사전 확인</strong> 후 상담에 활용해 주시기 바랍니다.
                </p>
            </div>

            <div class="p-4 rounded-2xl bg-indigo-950/30 border border-indigo-500/20">
                <h3 class="font-bold text-indigo-300 text-base mb-2 flex items-center gap-2">
                    <span>1️⃣</span> 1단계: 배포 자료(.phgcpkg) 적용 및 안전 로그인
                </h3>
                <p class="text-slate-300 leading-relaxed">
                    • <strong>배포 패키지 적용:</strong> 학년부장 선생님께 전달받은 학급 패키지 파일(<strong>.phgcpkg</strong>)을 로그인 화면의 <strong>[📦 학년부장 배포 자료 가져오기]</strong> 버튼을 눌러 적용합니다.<br>
                    • <strong>상담 이력 자동 보존·병합:</strong> 학기 중 학년부장 배포 자료를 새로 다시 받더라도, <strong>기존에 담임이 입력해 둔 상담일지·희망학교·메모는 100% 안전하게 자동 보존</strong>됩니다.<br>
                    • <strong>안전 접속 및 초기 비밀번호:</strong> 본인 학급을 선택하고 접속합니다. 초기 비밀번호는 학급번호(예: 3반은 301)로 바로 로그인 가능합니다.<br>
                    • <strong>비밀번호 재설정 파일(.phgcreset) 지원:</strong> 비밀번호를 분실했을 경우, 학년부장에게 발급받은 재설정 파일을 <strong>[🔑 재설정 파일 가져오기]</strong> 버튼으로 불러와 즉시 복구할 수 있습니다.
                </p>
            </div>

            <div class="p-4 rounded-2xl bg-slate-800/50 border border-slate-700/60">
                <h3 class="font-bold text-emerald-300 text-base mb-2 flex items-center gap-2">
                    <span>2️⃣</span> 2단계: 학급 진학 현황, 1:1 프라이버시 대시보드 & 종합 성적표 인쇄
                </h3>
                <p class="text-slate-300 leading-relaxed">
                    • <strong>🔒 1:1 프라이버시 상담 모드:</strong> 대시보드 상단 검색창에 학생 번호(예: 1, 15) 또는 이름을 입력하면 해당 학생만 화면에 단독 표시되어, <strong>학부모·학생 대면 상담 중 타 학생의 점수나 지망이 노출되지 않는 안심 상담 환경</strong>을 제공합니다.<br>
                    • <strong>다차원 실시간 정렬:</strong> 번호순, 성명 가나다순, 일반계고 안정순/위험순, 마이스터고 유망순 등으로 학생 목록을 자유롭게 정렬할 수 있습니다.<br>
                    • <strong>희망학교 원클릭 즉시 삭제([✕]):</strong> 대시보드 목록의 희망학교 배지 옆 <strong>[✕] 버튼</strong>을 눌러 상담 모달을 열지 않고도 지망 학교를 즉시 취소·삭제할 수 있습니다.<br>
                    • <strong>🖨️ 학생 종합 성적표(교과/출결/봉사) A4 1장 완벽 맞춤 인쇄:</strong> [🖨️ 성적표 인쇄] 버튼 클릭 시 교과 매트릭스와 출결, 봉사활동 요약이 <strong>A4 1장에 칼같이 쏙 들어가도록 자동 최적화</strong>되어 학부모 상담용으로 바로 배부할 수 있습니다.<br>
                    • <strong>전교 석차 스냅샷 기반 일반계고 합격 예측:</strong> 학년부장이 배포한 전교 석차 스냅샷을 기반으로 전교 석차백분율(%) 기준 🟢 안정, 🟡 경계선, 🔴 주의 판정을 정확하게 제공합니다.<br>
                    • <strong>📊 신호등 매트릭스 & 👥 우리 반 통계:</strong> [📊 신호등 매트릭스]로 전체 학생의 전기고 합격 가능성을 종합 비교하고, [우리 반 통계]에서 지망별 뱃지를 클릭하여 지원자 명단을 즉시 확인합니다.
                </p>
            </div>

            <div class="p-4 rounded-2xl bg-slate-800/50 border border-slate-700/60">
                <h3 class="font-bold text-amber-300 text-base mb-2 flex items-center gap-2">
                    <span>3️⃣</span> 3단계: 1:1 심층 상담 (고정 닫기, 학과 중복 방지 & 학부모용 공식 서명 푸터)
                </h3>
                <p class="text-slate-300 leading-relaxed">
                    • 학생 성명 또는 <strong>[🎯 진학 상담]</strong> 버튼을 클릭하여 개인별 심층 상담창을 엽니다.<br>
                    • <strong>상단 고정(Sticky) 닫기 버튼 & ESC 키 지원:</strong> 모달을 아래로 끝까지 스크롤해도 <strong>우측 상단에 붉은빛 [✕ 창 닫기] 버튼이 계속 고정</strong>되며, 키보드 <strong>ESC 키</strong>를 누르거나 맨 아래의 [✕ 상담 모달 닫기] 버튼을 눌러도 즉시 안전하게 닫힙니다. (실수로 윈도우 창 X를 눌러 프로그램이 종료되는 현상 방지)<br>
                    • <strong>다각도 합격선 비교:</strong> [🎯 직전 1개년], [📊 최근 3년 평균], [📈 최근 5년 평균] 탭과 <strong>공식 최고점·평균점·최저점</strong>을 대조하여 합격 가능성을 정밀 진단합니다.<br>
                    • <strong>학과 지망 중복 방지 실시간 비활성화:</strong> 1~5지망 선택 시 이미 선택된 학과는 다른 지망 드롭다운에서 자동으로 비활성화(회색)되어 중복 접수 실수를 원천 방지합니다.<br>
                    • <strong>학부모 배부용 정갈한 공식 서명 푸터:</strong> '상담 메모 포함' 체크를 해제한 상태로 [🖨️ 인쇄 / PDF]를 누르면, 어색한 빈 상담 일지 박스는 100% 숨겨지고 맨 아래에 <strong>[📅 진학 상담 일자 | 담임교사 확인 (인) | 학생·학부모 확인 (인)]</strong> 공식 서명 라인이 정갈하게 출력됩니다. (선생님 상담 메모 보관용은 '상담 메모 포함' 체크 시 함께 인쇄)<br>
                    • <strong>합격(배정) 학과 최종 지정:</strong> 고교 합격자 발표 후 실제 배정된 학과를 지정하여 원서대장에 정확히 반영합니다.
                </p>
            </div>

            <div class="p-4 rounded-2xl bg-slate-800/50 border border-slate-700/60">
                <h3 class="font-bold text-cyan-300 text-base mb-2 flex items-center gap-2">
                    <span>4️⃣</span> 4단계: 우리 반 고입원서대장 검토 & 배정고 입력 & 담임 결재
                </h3>
                <p class="text-slate-300 leading-relaxed">
                    • <strong>원서대장 서식 & 엑셀 다운로드:</strong> 상단의 [🖨️ 원서대장] 버튼을 누르면 정갈한 A4 대장이 열리며, [📊 엑셀 다운로드]를 통해 학교별 틀에 맞추어 자유롭게 편집·수정할 수 있습니다.<br>
                    • <strong>내신총점(취득점/만점):</strong> 울산마이스터고(/300), 울산에너지고(/230), 현대공업고(/200), 특성화고(/100), 일반고(%) 등 전형별 만점 대비 취득 점수가 정확히 표기됩니다.<br>
                    • <strong>후기 일반고 배정고 인라인 즉시 입력:</strong> 1월 말 일반고 배정 발표 후, 대장 화면에서 배정학교 칸을 클릭하여 학교명(예: 울산고)을 타이핑하면 즉시 DB에 영구 저장됩니다.<br>
                    • <strong>A4 1페이지 자동 맞춤:</strong> 학생 수에 맞춰 행 높이와 글자 크기가 한 페이지에 칼같이 맞춰져 출력됩니다.
                </p>
            </div>

            <div class="p-4 rounded-2xl bg-slate-800/50 border border-slate-700/60">
                <h3 class="font-bold text-sky-300 text-base mb-2 flex items-center gap-2">
                    <span>5️⃣</span> 5단계: 변경분 취합자료(.phgcpatch) 학년부장 제출
                </h3>
                <p class="text-slate-300 leading-relaxed">
                    • 2학기 출결(미인정 결석/지각)이나 추가 봉사시간, 리더십 가산점을 상담창에서 수기 반영합니다.<br>
                    • 학급 상담이 마무리되면 화면 상단의 <strong>[📤 취합자료제출(담임)]</strong> 버튼을 눌러 공용 암호로 암호화된 변경분 파일(<strong>.phgcpatch</strong>)을 생성하여 학년부장 선생님께 전달합니다.
                </p>
            </div>

            <div class="p-4 rounded-2xl bg-slate-800/50 border border-slate-700/60">
                <h3 class="font-bold text-rose-300 text-base mb-2 flex items-center gap-2">
                    <span>🔒</span> 6단계: 교무실 개인정보 보호 원클릭 화면 잠금 (Ctrl + L)
                </h3>
                <p class="text-slate-300 leading-relaxed">
                    • 상담 도중 잠시 자리를 비우거나 학생·학부모가 교무실에 출입할 때, 상단 도구 바의 <strong>[🔒 화면 잠금]</strong> 버튼이나 단축키 <strong>Ctrl + L</strong>을 누르면 즉시 화면이 안전하게 잠깁니다.<br>
                    • 본인의 비밀번호를 입력하면 작업 중이던 화면 그대로 안전하게 복귀할 수 있습니다.
                </p>
            </div>
        </div>
    `;
}

// 학년부장(마스터) 가이드 HTML
export function getMasterGuideHTML() {
    return `
        <div class="space-y-4">
            <!-- 사전 검증 권장 주의 카드 -->
            <div class="p-4 rounded-2xl bg-amber-950/40 border border-amber-500/40 text-amber-200 shadow-xs">
                <h4 class="font-bold text-amber-100 text-sm sm:text-base mb-1.5 flex items-center gap-2">
                    <span>⚠️</span> [필수 점검] 나이스 연동 후 고교 공식 산출 프로그램과 계산값 사전 대조
                </h4>
                <p class="text-xs sm:text-[13px] leading-relaxed">
                    나이스 성적/출결/봉사 엑셀 3종 업로드 완료 후, 담임교사 배포 전 표본 학생 1~2명의 성적을 <strong>지원 희망 고등학교의 공식 산출 프로그램(또는 공식 산출표)</strong>에 직접 입력하여 <strong>본 프로그램의 산출 점수와 100% 일치하는지 반드시 사전 대조·검증</strong>해 주시기 바랍니다.
                </p>
            </div>

            <div class="p-4 rounded-2xl bg-indigo-950/30 border border-indigo-500/20">
                <h3 class="font-bold text-indigo-300 text-base mb-2 flex items-center gap-2">
                    <span>1️⃣</span> 1단계: 학교 기초 설정, 입학년도 관리 & 공용 암호 관리
                </h3>
                <p class="text-slate-300 leading-relaxed">
                    • 최초 실행 시 학교명, 3학년 전체 학급 수, 고교 입학년도(예: 2026학년도 입학)를 설정합니다.<br>
                    • 담임교사 PC와 안전하게 오프라인 암호화 통신을 수행하기 위한 <strong>[공용 데이터 잠금 암호]</strong>를 지정합니다.
                </p>
            </div>

            <div class="p-4 rounded-2xl bg-slate-800/50 border border-slate-700/60">
                <h3 class="font-bold text-emerald-300 text-base mb-2 flex items-center gap-2">
                    <span>2️⃣</span> 2단계: 나이스 엑셀 연동 및 공식 공개 입결자료 등록
                </h3>
                <p class="text-slate-300 leading-relaxed">
                    • 관리자 대시보드에서 나이스 출력 엑셀(<strong>교과성적, 출결, 봉사활동</strong>) 3종을 업로드하여 전교생 데이터를 연동합니다.<br>
                    • <strong>📊 공식 공개 입결자료 등록:</strong> [공식 공개자료 추가] 버튼으로 관내 고교별 <strong>최신 개편 학과명</strong>과 전형(일반/특별), <strong>최고점·평균점·최저점 3대 합격 지표</strong>를 등록하여 상담의 공신력을 극대화합니다.<br>
                    • <strong>타교 커트라인 다중 파일 일괄 병합:</strong> [관내자료 병합] 시 여러 학교의 <strong>.phgcdata</strong> 파일을 한꺼번에 다중 선택하여 1초 만에 일괄 병합할 수 있습니다.
                </p>
            </div>

            <div class="p-4 rounded-2xl bg-slate-800/50 border border-slate-700/60">
                <h3 class="font-bold text-amber-300 text-base mb-2 flex items-center gap-2">
                    <span>3️⃣</span> 3단계: 담임교사용 배포 패키지(.phgcpkg) 생성 & 비밀번호 관리
                </h3>
                <p class="text-slate-300 leading-relaxed">
                    • <strong>전교 석차 스냅샷 자동 내장:</strong> 학급 배포 파일(<strong>.phgcpkg</strong>) 생성 시 전교생 석차백분율 스냅샷이 암호화 패키지에 자동 내장되어, 담임 PC에서도 학년부장 화면과 100% 동일한 전교 백분율이 산출됩니다.<br>
                    • <strong>비밀번호 재설정 파일(.phgcreset) 발급:</strong> 담임선생님이 비밀번호를 분실했을 경우, [사용자 관리]에서 비밀번호를 재설정한 뒤 <strong>[비밀번호 재설정 파일 저장]</strong> 버튼으로 발급하여 안전하게 전달할 수 있습니다.<br>
                    • <strong>[배포 자료 만들기]:</strong> 학급별 패키지 파일(<strong>.phgcpkg</strong>)을 생성하여 공용 암호와 함께 각 반 담임선생님께 전달합니다.
                </p>
            </div>

            <div class="p-4 rounded-2xl bg-slate-800/50 border border-slate-700/60">
                <h3 class="font-bold text-sky-300 text-base mb-2 flex items-center gap-2">
                    <span>4️⃣</span> 4단계: 담임교사 취합 자료 '다중 파일 일괄 병합 (1초 완료)'
                </h3>
                <p class="text-slate-300 leading-relaxed">
                    • 담임선생님들이 상담 후 제출한 패치 파일(<strong>.phgcpatch</strong>)들을 수신합니다.<br>
                    • 관리자 도구 바의 <strong>[📥 취합자료병합]</strong> 버튼을 클릭하고 파일 선택 창에서 <strong>Ctrl 또는 Shift 키로 전 학급 파일을 한꺼번에 다중 선택</strong>합니다.<br>
                    • 1초 만에 전 학급의 변경 내역(출결, 봉사, 가산점, 지망학교)이 한 번에 검토 화면으로 로드되어 간편하게 승인·병합됩니다.
                </p>
            </div>

            <div class="p-4 rounded-2xl bg-slate-800/50 border border-slate-700/60">
                <h3 class="font-bold text-purple-300 text-base mb-2 flex items-center gap-2">
                    <span>5️⃣</span> 5단계: 전교 스마트 통계 분석 및 고입원서대장 반별 분할 출력
                </h3>
                <p class="text-slate-300 leading-relaxed">
                    • <strong>[📊 신호등 매트릭스]:</strong> 3학년 전교생 또는 학급별 관내 10대 직업계고 및 후기 일반고 합격 가능성을 한눈에 조회하며, 검색 및 다차원 정렬(내신순, 고교별 점수순 등)을 지원합니다.<br>
                    • <strong>[🏫 우리학교 지원현황]:</strong> 학교-전형-학과별 1줄 요약과 1~5지망 가로 뱃지 통계를 제공하며, 클릭 시 전교 지원 학생 명단이 즉시 팝업됩니다.<br>
                    • <strong>[🖨️ 고입원서대장]:</strong><br>
                    &nbsp;&nbsp;① <strong>동적 결재라인 체크:</strong> 담임, 학년부장, 교무부장, 진로부장, 교감, 교장 직책을 체크하여 소규모 학교 및 학교 환경에 맞게 결재란을 즉시 변경합니다.<br>
                    &nbsp;&nbsp;② <strong>전교 반별 자동 분할 인쇄:</strong> [전교 일괄] 모드로 출력 시, 반이 바뀔 때마다 자동으로 새 A4 용지에서 시작되어 인쇄 버튼 한 번으로 학급별 대장이 1장씩 착착 분할 출력됩니다.<br>
                    &nbsp;&nbsp;③ <strong>한 페이지 자동 맞춤:</strong> 학급별 학생 수(20~30명 이상)에 맞춰 글자 크기와 행 간격이 자동으로 한 페이지에 딱 맞게 조절됩니다.<br>
                    &nbsp;&nbsp;④ <strong>특성화고 추가모집 자동 표기:</strong> 후기 일반고 탈락 후 추가모집에 합격한 학생은 비고란에 [추가모집] 뱃지가 자동 표기됩니다.<br>
                    &nbsp;&nbsp;⑤ <strong>원서대장 엑셀(.xls) 다운로드:</strong> [📊 엑셀 다운로드] 버튼으로 내려받아 학교별 고유 양식이나 틀에 맞게 자유롭게 편집·수정할 수 있습니다.
                </p>
            </div>

            <div class="p-4 rounded-2xl bg-slate-800/50 border border-slate-700/60">
                <h3 class="font-bold text-rose-300 text-base mb-2 flex items-center gap-2">
                    <span>6️⃣</span> 6단계: 입시 확정, 최종 암호화 보관본 생성 및 차년도 전환
                </h3>
                <p class="text-slate-300 leading-relaxed">
                    • <strong>[🔒 입시 결과 확정]:</strong> 모든 고입 전형 종료 후 결과를 확정하여 당해 연도 최종 커트라인을 통계에 반영합니다.<br>
                    • <strong>[🗄️ 최종 보관본 생성]:</strong> 감사 및 차후 조회를 위한 100% 암호화 백업 아카이브를 생성합니다.<br>
                    • <strong>[📅 새 학년도 전환]:</strong> 졸업생 개인정보를 안전하게 비우고, 다음 학년도(예: 2027학년도 입학)로 5개년 커트라인 기준을 한 칸씩 자동 시프트(Shift)하여 완벽한 인수인계를 준비합니다.
                </p>
            </div>

            <div class="p-4 rounded-2xl bg-slate-800/50 border border-slate-700/60">
                <h3 class="font-bold text-amber-300 text-base mb-2 flex items-center gap-2">
                    <span>🔒</span> 7단계: 개인정보 보호 화면 잠금 (Ctrl + L)
                </h3>
                <p class="text-slate-300 leading-relaxed">
                    • 전교생 성적 및 민감 정보를 다루는 학년부장 화면 특성상, 자리 비움 시 상단 도구 바의 <strong>[🔒 화면 잠금]</strong> 버튼이나 단축키 <strong>Ctrl + L</strong>을 누르면 즉시 암막 보호 화면으로 전환됩니다.<br>
                    • 관리자 비밀번호를 입력하면 작업 중이던 데이터 그대로 안전하게 복귀합니다.
                </p>
            </div>
        </div>
    `;
}

if (typeof window !== 'undefined') {
    window.renderGuideModal = renderGuideModal;
}
