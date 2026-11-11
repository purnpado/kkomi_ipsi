import { showModalConfirm } from '../../core/dialogs.js';

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
                        <li>학년부장과 담임교사 간의 데이터 전달은 암호화된 학급별 배포 패키지(<span class="px-1.5 py-0.5 rounded bg-slate-800 text-emerald-300 font-mono text-xs border border-emerald-500/30">.kkomipkg</span>)와 변경분 취합 파일(<span class="px-1.5 py-0.5 rounded bg-slate-800 text-emerald-300 font-mono text-xs border border-emerald-500/30">.kkomipatch</span>)을 통해서만 안전하게 오프라인으로 교환됩니다.</li>
                        <li>관내 타 학교와의 커트라인 공유 파일(<span class="px-1.5 py-0.5 rounded bg-slate-800 text-indigo-300 font-mono text-xs border border-indigo-500/30">.kkomidata</span>) 내보내기 시 <strong class="text-white">학생 개인 식별 정보(성명, 학번, 개별 성적 등)는 100% 원천 배제</strong>되며, 고교별 합격선 및 학교 단위 단순 통계 수치만 안전하게 포함됩니다.</li>
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
