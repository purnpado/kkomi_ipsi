import { escapeHtml } from '../../../core/utils.js';
import { state } from '../../../core/store.js';

// 상담 모달: 전체 레이아웃 렌더링
export function renderStudentModalLayout(ctx) {
    ctx.modalEl.innerHTML = `
        <div class="glass-card print-document p-6 md:p-8 w-full max-w-6xl max-h-[92vh] overflow-y-auto space-y-6 print-modal relative" id="printReportArea">
            <!-- 모달 헤더 (스크롤 시에도 우측 상단에 고정되어 창 닫기 버튼이 항상 보임) -->
            <div class="sticky -top-6 md:-top-8 -mx-6 md:-mx-8 px-6 md:px-8 py-3.5 bg-slate-900/95 backdrop-blur-md z-40 border-b border-slate-700/80 flex items-center justify-between gap-4 flex-wrap sm:flex-nowrap shadow-lg">
                <div class="min-w-0">
                    <h2 class="text-2xl font-black text-white flex items-center gap-2 truncate">
                        👨‍🎓 ${escapeHtml(ctx.name)} <span class="text-base text-slate-400 font-normal">(${escapeHtml(ctx.classNum)}반 ${escapeHtml(ctx.studentNum)}번)</span>
                    </h2>
                    <p class="text-xs text-text-muted mt-0.5">울산 특목·마이스터·특성화고 진학 상담 분석표 (3-1 누적)</p>
                </div>
                <div class="flex items-center gap-2.5 no-print shrink-0 flex-nowrap">
                    <label class="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer bg-slate-800 hover:bg-slate-700 px-3 py-2 rounded-xl border border-slate-700 select-none transition-all h-9 whitespace-nowrap" title="체크 시 상담 일지 메모 내용도 함께 인쇄됩니다">
                        <input type="checkbox" id="printIncludeCounselCheck" class="rounded accent-indigo-500 cursor-pointer w-4 h-4" />
                        <span class="font-medium">상담 메모 포함</span>
                    </label>
                    <button id="printReportBtn" class="px-4 h-9 rounded-xl font-bold text-xs bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5 shadow-md shadow-indigo-500/20 transition-all cursor-pointer whitespace-nowrap active:scale-95">
                        <span>🖨️</span> <span>인쇄 / PDF</span>
                    </button>
                    <button id="closeModalBtn" class="px-3.5 h-9 rounded-xl font-bold text-xs bg-rose-950/80 hover:bg-rose-600 text-rose-200 hover:text-white border border-rose-500/50 shadow-md shadow-rose-950/40 transition-all cursor-pointer flex items-center justify-center whitespace-nowrap active:scale-95" title="상담 모달 닫기 (단축키: ESC)">
                        <span class="text-base font-black">✕</span> <span class="ml-1 font-bold">창 닫기</span>
                    </button>
                </div>
            </div>

            <!-- 1. 기본 성적 요약 카드 -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div class="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/50 text-center">
                    <div class="text-xs text-text-muted mb-1">전과목 평균 성취도</div>
                    <div class="text-xl font-bold text-primary">${ctx.data.allAverage.toFixed(2)} <span class="text-xs text-slate-400 font-normal">/ 5.0</span></div>
                </div>
                <div class="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/50 text-center">
                    <div class="text-xs text-text-muted mb-1">미인정 출결 (1학기)</div>
                    <div class="text-xl font-bold ${ctx.data.absenceDays > 0 ? 'text-danger' : 'text-success'}">
                        ${ctx.data.absenceDays}일 <span class="text-[11px] text-slate-400 font-normal">(결석${ctx.data.rawAbsenceDays || 0}일, 기타${(ctx.data.rawLateCount || 0) + (ctx.data.rawEarlyCount || 0) + (ctx.data.rawResultCount || 0)}회)</span>
                    </div>
                </div>
                <div class="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/50 text-center">
                    <div class="text-xs text-text-muted mb-1">인정 봉사시간</div>
                    <div class="text-xl font-bold text-white">${ctx.data.totalVolunteerHours}시간 <span class="text-[11px] text-slate-400 font-normal">(기본${ctx.data.volunteerHours}+추가${ctx.data.addVolunteerHours})</span></div>
                </div>
                <div class="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/50 text-center">
                    <div class="text-xs text-text-muted mb-1">후기 일반고 내신 / 석차백분율</div>
                    <div class="text-xl font-bold ${ctx.data.generalHSPercentile <= (state.generalGuideCutoff || 80) ? 'text-success' : (ctx.data.generalHSPercentile <= (state.generalGuideCutoff || 80) + 10 ? 'text-warning' : 'text-danger')}">${ctx.data.generalHSTotalScore.toFixed(2)}점 <span class="text-[10px] font-normal text-amber-300">${ctx.data.generalHSProjected ? '예상' : '확정'}</span></div>
                    <div class="text-[11px] text-slate-400">교과 ${ctx.data.generalHSAcademicScore.toFixed(2)} / 비교과 ${ctx.data.generalHSNonAcademicScore.toFixed(2)} · ${ctx.data.generalHSPercentile.toFixed(2)}%</div>
                </div>
            </div>

            <!-- 2. 수기 입력 가산점 및 리더십 영역 (출결·봉사는 나이스 자동 산출) -->
            ${(() => {
            const isViewer = state.currentUser && state.currentUser.Role === 'viewer';

            return `
                <div class="p-4 rounded-xl bg-indigo-950/20 border border-indigo-500/30 space-y-3 non-academic-input-section no-print">
                    <div class="flex items-center justify-between flex-wrap gap-2">
                        <div class="flex items-center gap-2">
                            <span class="text-base">✏️</span>
                            <div>
                                <h3 class="font-bold text-sm text-indigo-200 flex items-center gap-2">
                                    전형별 가산점 및 리더십 수기 입력
                                    ${isViewer ? '<span class="text-[11px] text-warning font-normal">※ 진로부장은 조회 전용 모드입니다.</span>' : ''}
                                </h3>
                                <p class="text-[11px] text-slate-400 mt-0.5">출결 및 봉사점수는 <strong>나이스 공식 데이터에서 100% 자동 산출</strong>되므로 별도 입력이 필요 없습니다.</p>
                            </div>
                        </div>
                        ${!isViewer ? `
                        <button id="saveExtraBtn" class="px-4 h-9 rounded-xl font-bold text-xs bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5 shadow-md shadow-indigo-500/20 transition-all cursor-pointer whitespace-nowrap active:scale-95 no-print">
                            <span>💾</span> <span>저장 후 재계산</span>
                        </button>
                        ` : ''}
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs pt-1">
                        <!-- ① 마이스터고 리더십 가산점 -->
                        <section class="bg-slate-900/70 p-3.5 rounded-xl border border-indigo-500/30 space-y-2">
                            <div class="flex items-center justify-between">
                                <b class="text-indigo-200 text-sm flex items-center gap-1.5">
                                    <span>🏛️</span> 마이스터고 리더십 활동 가산점
                                </b>
                                <span class="text-[11px] text-amber-300 font-semibold">최대 10점</span>
                            </div>
                            <div class="flex items-center gap-3 pt-1">
                                <label class="text-slate-300 font-medium whitespace-nowrap">인정 리더십(학기):</label>
                                <div class="relative w-32">
                                    <input type="number" id="inputLeadershipTerms" min="0" max="4" step="1"
                                           class="input-field w-full text-center py-1.5 text-sm font-bold text-amber-300"
                                           value="${ctx.data.leadershipTerms || 0}" ${isViewer ? 'disabled' : ''}/>
                                    <span class="absolute right-2.5 top-2 text-[11px] text-slate-400 pointer-events-none">학기</span>
                                </div>
                                <span class="text-xs text-slate-400">= 가산점 <strong class="text-amber-300 font-mono">${Math.min(10, ((ctx.data.leadershipTerms || 0) * 2.5)).toFixed(1)}</strong>점</span>
                            </div>
                            <p class="text-[10px] text-slate-400 mt-1">※ 반장·부반장·전교 학생회장·부회장 활동만 인정 (한 학기당 2.5점, 최대 4학기 10점)</p>
                        </section>

                        <!-- ② 후기 일반고 비교과 가산점 -->
                        <section class="bg-slate-900/70 p-3.5 rounded-xl border border-emerald-500/30 space-y-2">
                            <div class="flex items-center justify-between">
                                <b class="text-emerald-200 text-sm flex items-center gap-1.5">
                                    <span>🏫</span> 후기 일반고 창체·행발 가산점
                                </b>
                                <span class="text-[11px] text-emerald-300 font-semibold">각 학년당 +1점</span>
                            </div>
                            <div class="grid grid-cols-2 gap-2 pt-1">
                                <div class="rounded-lg bg-slate-800/80 border border-slate-700 p-2.5 space-y-1.5">
                                    <span class="text-[11px] font-bold text-slate-300 block">창체 활동 가산점</span>
                                    <div class="flex items-center gap-2 flex-wrap">
                                        ${[1, 2, 3].map(g => `
                                            <label class="inline-flex items-center gap-1 text-xs text-slate-200 cursor-pointer">
                                                <input type="checkbox" id="checkChangche${g}" class="accent-indigo-500 rounded cursor-pointer" ${ctx.extra['changche_' + g] ? 'checked' : ''} ${isViewer ? 'disabled' : ''}/>
                                                <span>${g}학년</span>
                                            </label>
                                        `).join('')}
                                    </div>
                                </div>
                                <div class="rounded-lg bg-slate-800/80 border border-slate-700 p-2.5 space-y-1.5">
                                    <span class="text-[11px] font-bold text-slate-300 block">행발(행동발달) 가산점</span>
                                    <div class="flex items-center gap-2 flex-wrap">
                                        ${[1, 2, 3].map(g => `
                                            <label class="inline-flex items-center gap-1 text-xs text-slate-200 cursor-pointer">
                                                <input type="checkbox" id="checkHaengbal${g}" class="accent-indigo-500 rounded cursor-pointer" ${ctx.extra['haengbal_' + g] ? 'checked' : ''} ${isViewer ? 'disabled' : ''}/>
                                                <span>${g}학년</span>
                                            </label>
                                        `).join('')}
                                    </div>
                                </div>
                            </div>
                            <p class="text-[10px] text-slate-400 mt-1">※ 일반고 비교과(총 50점) 산출 시 각 해당 학년의 가산점으로 직결됩니다.</p>
                        </section>
                    </div>
                </div>
                `;
        })()}

            <!-- ⭐ 학생 희망·관심학교 장바구니 영역 (화면 상담용, 인쇄 시 자동 제외) -->
            <div id="studentWishlistSection" class="p-4 rounded-2xl bg-indigo-950/30 border border-indigo-500/50 space-y-3 shadow-lg no-print">
                <div class="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-indigo-500/20">
                    <div class="flex items-center gap-2">
                        <span class="text-xl">🛒</span>
                        <div>
                            <h3 class="font-black text-sm text-indigo-200 flex items-center gap-1.5">
                                학생 관심·희망학교 장바구니
                                <span id="wishlistCountBadge" class="text-[11px] px-2 py-0.5 rounded-full bg-indigo-600 text-white font-bold ml-1">${ctx.wishlist.length}</span>
                            </h3>
                            <p class="text-[11px] text-slate-400 mt-0.5">상담 중 목표하는 고교를 장바구니에 담고, [희망학교 입력]을 누르면 원서 서식에 자동 입력됩니다.</p>
                        </div>
                    </div>
                </div>
                <div id="wishlistContainer">
                    ${ctx.renderWishlistHTML(ctx.wishlist)}
                </div>
            </div>

            <!-- 3. 학교별 합격 가능성 리스트 -->
            <div class="space-y-3">
                <div class="flex items-center justify-between flex-wrap gap-2">
                    <div>
                        <h3 class="font-bold text-sm text-white">🏫 목표 고교별 산출 점수 및 합격 가능성</h3>
                        <p class="text-[11px] text-text-muted mt-0.5">* 면접 점수를 제외한 1차 서류 전형 기준</p>
                    </div>
                    <!-- 탭 메뉴: 직전년도 / 최근 3개년 평균 / 최근 5개년 평균 (인쇄 시 제외) -->
                    <div class="flex items-center gap-2 flex-wrap no-print">
                        <span class="text-xs font-bold text-slate-300">판정 기준:</span>
                        <div class="inline-flex rounded-lg bg-slate-800 p-0.5 border border-slate-700 shadow-inner" id="cutoffBaselineTabs">
                            <button type="button" class="cutoff-tab-btn active px-3 py-1.5 text-xs font-bold rounded-md bg-primary text-white transition-all cursor-pointer" data-mode="last">
                                🎯 직전 1개년
                            </button>
                            <button type="button" class="cutoff-tab-btn px-3 py-1.5 text-xs font-bold rounded-md text-slate-400 hover:text-white transition-all cursor-pointer" data-mode="avg3">
                                📊 최근 3년 평균
                            </button>
                            <button type="button" class="cutoff-tab-btn px-3 py-1.5 text-xs font-bold rounded-md text-slate-400 hover:text-white transition-all cursor-pointer" data-mode="avg5">
                                📈 최근 5년 평균
                            </button>
                        </div>
                    </div>
                </div>

                <div class="p-2.5 rounded-xl bg-slate-900/60 border border-slate-700/60 flex items-center justify-between text-xs no-print">
                    <span id="cutoffBaselineDesc" class="text-indigo-200 font-medium">🎯 <strong>직전 1개년(작년)</strong> 커트라인 및 공식 발표자료를 기준으로 합격 가능성을 판정합니다.</span>
                    <span class="text-[11px] text-slate-400">탭을 클릭하면 실시간으로 신호등·게이지가 재계산됩니다</span>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-3" id="schoolCardsContainer">
                    ${ctx.cardsHTML}
                </div>
            </div>

            <!-- 4. 스마트 1:1 진학 상담 일지 영역 -->
            <div class="p-5 rounded-2xl bg-indigo-950/25 border border-indigo-500/40 space-y-4 shadow-xl counsel-section-container">
                <div class="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-indigo-500/20">
                    <div>
                        <h3 class="font-black text-sm text-indigo-200 flex items-center gap-2">
                            <span>📝</span> ${escapeHtml(ctx.name)} 학생 1:1 진학 상담 일지
                        </h3>
                        <p class="text-[11px] text-slate-400 mt-0.5">
                            🔒 <strong>개인 상담 비밀보장:</strong> 작성자 본인만 열람 가능하며, 관내 취합 및 인쇄 시 기본적으로 상담 메모는 100% 자동 제외됩니다.
                        </p>
                    </div>
                    <span class="text-[11px] px-2.5 py-1 rounded-lg bg-indigo-900/60 text-indigo-300 border border-indigo-400/30 font-bold no-print">
                        로컬 독립 보안 모드
                    </span>
                </div>

                <!-- 비공개 상담 내용 (인쇄 시 체크 안하면 완전 숨김) -->
                <div class="counsel-private-content space-y-4">
                    <!-- 상담 작성 폼 -->
                    <div class="bg-slate-900/70 p-4 rounded-xl border border-slate-700/70 space-y-3 no-print">
                        <input type="hidden" id="counselRecordId" value="0" />
                        <div class="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                            <div class="sm:col-span-4">
                                <label class="block text-xs font-bold text-slate-300 mb-1">상담 날짜</label>
                                <input type="date" id="counselDateInput" class="input-field w-full text-xs font-mono font-bold text-indigo-200 py-1.5" value="${ctx.todayDate}" required />
                            </div>
                            <div class="sm:col-span-8">
                                <label class="block text-xs font-bold text-slate-300 mb-1">상담 목표/관련 고교 (선택)</label>
                                <input type="text" id="counselTargetSchoolInput" class="input-field w-full text-xs py-1.5" placeholder="예: 울산에너지고 신재생에너지과, 일반고 등" />
                            </div>
                        </div>

                        <!-- 스마트 빠른 태그 바 -->
                        <div>
                            <div class="text-[11px] text-slate-400 font-semibold mb-1 flex items-center gap-1">
                                <span>⚡</span> 스마트 빠른 태그 (클릭 시 내용에 자동 추가):
                            </div>
                            <div class="flex flex-wrap gap-1.5" id="counselQuickTags">
                                <button type="button" class="quick-tag-btn text-[11px] py-1 px-2.5 rounded-lg bg-indigo-950/60 hover:bg-indigo-900/80 text-indigo-300 border border-indigo-500/40 font-medium transition-all cursor-pointer" data-tag="[마이스터고 희망] ">마이스터고 희망</button>
                                <button type="button" class="quick-tag-btn text-[11px] py-1 px-2.5 rounded-lg bg-cyan-950/60 hover:bg-cyan-900/80 text-cyan-300 border border-cyan-500/40 font-medium transition-all cursor-pointer" data-tag="[특성화고 취업희망자전형] ">특성화 취업희망</button>
                                <button type="button" class="quick-tag-btn text-[11px] py-1 px-2.5 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-500/40 font-medium transition-all cursor-pointer" data-tag="[후기 일반고 안정권] ">일반고 안정권</button>
                                <button type="button" class="quick-tag-btn text-[11px] py-1 px-2.5 rounded-lg bg-amber-950/60 hover:bg-amber-900/80 text-amber-300 border border-amber-500/40 font-medium transition-all cursor-pointer" data-tag="[내신 추이 및 비교과 상담] ">성적·비교과 추이</button>
                                <button type="button" class="quick-tag-btn text-[11px] py-1 px-2.5 rounded-lg bg-purple-950/60 hover:bg-purple-900/80 text-purple-300 border border-purple-500/40 font-medium transition-all cursor-pointer" data-tag="[학부모 전화 상담 완료] ">학부모 상담</button>
                                <button type="button" class="quick-tag-btn text-[11px] py-1 px-2.5 rounded-lg bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-500/40 font-medium transition-all cursor-pointer" data-tag="[원서 변경 고민 중] ">원서 변경 고민</button>
                            </div>
                        </div>

                        <!-- 상담 내용 입력창 -->
                        <div>
                            <textarea id="counselContentInput" rows="3" class="input-field w-full text-xs leading-relaxed py-2 px-3 resize-y" placeholder="학생의 진로 희망, 강점 및 약점, 학부모 상담 내용, 추천 고교 등을 자유롭게 기록하세요. (Ctrl+Enter를 누르면 바로 저장됩니다)"></textarea>
                        </div>

                        <!-- 액션 버튼 -->
                        <div class="flex items-center justify-between pt-1">
                            <span class="text-[11px] text-slate-500 font-mono">단축키: Ctrl + Enter</span>
                            <div class="flex items-center gap-2">
                                <button type="button" id="cancelCounselEditBtn" class="btn-secondary text-xs px-3 py-1.5 font-semibold hidden">수정 취소</button>
                                <button type="button" id="saveCounselBtn" class="btn-primary text-xs px-4 py-1.5 font-bold inline-flex items-center gap-1.5 shadow-md shadow-indigo-600/30 cursor-pointer">
                                    <span>💾</span> <span id="saveCounselBtnText">상담 일지 저장</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- 누적 상담 타임라인 목록 -->
                    <div class="space-y-2">
                        <div class="flex items-center justify-between">
                            <span class="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                                <span>📋</span> 누적 상담 이력 (<span id="counselRecordCount" class="text-indigo-400 font-bold">0</span>건)
                            </span>
                            <span class="text-[11px] text-slate-400">최신순 정렬</span>
                        </div>
                        <div id="counselRecordsList" class="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                            <div class="text-center py-6 text-slate-500 text-xs">
                                <span class="spinner" style="width:14px;height:14px;border-width:2px;"></span> 상담 일지를 불러오는 중...
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 인쇄 전용 프라이버시 안심 요약 배너 (상담 메모 포함 시 사용) -->
                <div class="counsel-print-summary hidden border-t border-slate-300 pt-3 mt-4 text-xs text-slate-700">
                    <div class="flex items-center justify-between">
                        <span><strong>📅 진학 상담 일자:</strong> ${ctx.todayDate}</span>
                        <span class="text-slate-500 text-[11px]">※ 학생 개인정보 및 상담 상세 메모는 비공개 처리되었습니다.</span>
                    </div>
                </div>
            </div>

            <!-- 인쇄 전용 공식 상담 확인 푸터 (학부모·학생 배부용 표준 서식) -->
            <div class="counsel-official-footer hidden pt-3 border-t border-slate-400 text-xs text-slate-800">
                <div class="flex items-center justify-between flex-wrap gap-2">
                    <span><strong>📅 진학 상담 일자:</strong> ${ctx.todayDate}</span>
                    <span><strong>상담 교사 확인:</strong> 3학년 ${escapeHtml(ctx.classNum)}반 담임 (인)</span>
                    <span><strong>학생·학부모 확인:</strong> ________________ (인)</span>
                </div>
            </div>

            <!-- 화면용 모달 하단 닫기 바 (스크롤 끝에서도 즉시 닫기 지원) -->
            <div class="pt-4 border-t border-slate-700/60 flex items-center justify-between flex-wrap gap-3 no-print">
                <div class="text-xs text-slate-400 flex items-center gap-1.5">
                    <span>💡</span> <span>키보드 <strong>ESC</strong> 키를 누르시거나 바깥 어두운 배경을 클릭하셔도 창이 닫힙니다.</span>
                </div>
                <button type="button" id="bottomCloseModalBtn" class="px-5 py-2.5 rounded-xl font-bold text-xs bg-rose-950/70 hover:bg-rose-600 text-rose-200 hover:text-white border border-rose-500/40 transition-all cursor-pointer flex items-center gap-1.5 shadow-md active:scale-95">
                    <span class="text-sm font-black">✕</span> <span>상담 모달 닫기 (ESC)</span>
                </button>
            </div>
        </div>
    `;
}
