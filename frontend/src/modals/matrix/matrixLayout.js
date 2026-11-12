import { printOnly } from '../../print/printEngine.js';
import { openModal } from '../../core/navigation.js';
import { judgmentModeToggleHTML, bindJudgmentModeToggle, judgmentSummaryText } from '../../core/admissionJudgment.js';

// 신호등 매트릭스: 화면 골격 렌더링
export function renderMatrixLayout(ctx, mx) {
    ctx.modalEl.innerHTML = `
            <div class="glass-card print-document p-4 sm:p-6 w-full max-w-[1920px] max-h-[94vh] overflow-y-auto space-y-3.5">
                <!-- 모달 헤더 -->
                <div class="flex items-center justify-between border-b border-slate-700/50 pb-3 flex-wrap gap-3">
                    <div>
                        <div class="flex items-center gap-2 flex-wrap">
                            <span id="matrixHeaderClassBadge" class="px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 text-xs font-bold">
                                ${mx.currentClassFilter === 'all' ? `🏫 3학년 전교생 (총 ${mx.classCount}개 학급)` : `🏫 3학년 ${mx.currentClassFilter}반`}
                            </span>
                            <span id="matrixHeaderTotalBadge" class="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-xs font-bold">
                                총 ${mx.fullGrades.length}명
                            </span>
                        </div>
                        <h2 class="text-2xl font-black text-white flex items-center gap-2 mt-1">
                            📊 관내 고교별 진학 신호등 종합 매트릭스
                        </h2>
                    </div>
                    <button id="closeMatrixBtn" class="no-print text-slate-400 hover:text-white p-2 text-2xl font-bold bg-transparent border-none cursor-pointer leading-none">✕</button>
                </div>

                <!-- 1열: 6개 원클릭 탭 바 & 실시간 설명 바 -->
                <div class="flex items-center justify-between gap-3 flex-wrap bg-slate-900/70 p-2.5 rounded-2xl border border-slate-700/60 shadow-inner">
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="text-xs font-bold text-slate-300 flex items-center gap-1 mr-1">
                            <span>⚙️</span> 전형·연도 선택:
                        </span>
                        <div class="flex items-center gap-1.5 flex-wrap">
                            <!-- 1. 직전 1개년 -->
                            <button class="matrix-6tab px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer border" data-year="last" data-track="general">
                                🎯 직전 1년 · 일반
                            </button>
                            <button class="matrix-6tab px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer border" data-year="last" data-track="special">
                                🌟 직전 1년 · 특별(취업)
                            </button>

                            <!-- 2. 최근 3개년 평균 -->
                            <button class="matrix-6tab px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer border" data-year="avg3" data-track="general">
                                📊 최근 3년 · 일반
                            </button>
                            <button class="matrix-6tab px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer border" data-year="avg3" data-track="special">
                                ✨ 최근 3년 · 특별(취업)
                            </button>

                            <!-- 3. 최근 5개년 장기 -->
                            <button class="matrix-6tab px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer border" data-year="avg5" data-track="general">
                                📈 최근 5년 · 일반
                            </button>
                            <button class="matrix-6tab px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer border" data-year="avg5" data-track="special">
                                🚀 최근 5년 · 특별(취업)
                            </button>
                        </div>
                    </div>
                    <div id="matrixModeDesc" class="text-xs text-indigo-200 font-medium">
                        ${mx.getModeDescription(mx.currentYearMode, mx.currentTrackMode)}
                    </div>
                </div>

                <!-- 2열: 정렬, 검색, 학급 필터 도구 바 (전체/반별 매트릭스 모두 완벽 지원) -->
                <div class="flex items-center justify-between gap-3 flex-wrap bg-slate-900/50 p-2.5 rounded-2xl border border-slate-700/50">
                    <div class="flex items-center gap-2.5 flex-wrap">
                        <!-- 학급 필터 드롭다운 (반별 모달에서도 자유롭게 전체 및 타 학급 전환 가능) -->
                        <div class="flex items-center gap-1.5 bg-slate-800 px-3 py-1 rounded-xl border border-slate-700 text-xs shadow-xs">
                            <span class="font-bold text-indigo-300">🏫 학급:</span>
                            <select id="matrixClassSelect" class="bg-slate-900 text-white font-bold text-xs rounded-lg border border-slate-600 px-2 py-0.5 outline-none cursor-pointer">
                                <option value="all" ${mx.currentClassFilter === 'all' ? 'selected' : ''}>전체 학급 (${mx.classCount}개 학급)</option>
                                ${Array.from({ length: mx.classCount }, (_, i) => `<option value="${i + 1}" ${String(mx.currentClassFilter) === String(i + 1) ? 'selected' : ''}>${i + 1}반</option>`).join('')}
                            </select>
                        </div>

                        <!-- 정밀 학생 검색창 -->
                        <div class="flex items-center gap-2 bg-slate-800 px-3 py-1 rounded-xl border border-slate-700 text-xs shadow-xs">
                            <span class="text-slate-400">🔍</span>
                            <input type="text" id="matrixSearchInput" placeholder="학생 성명 또는 학번 검색 (예: 강감찬, 1, 101)" 
                                   class="bg-transparent text-white ph-muted font-medium text-xs outline-none w-44 sm:w-64" />
                            <button id="clearMatrixSearchBtn" class="text-slate-400 hover:text-white text-xs cursor-pointer hidden">✕</button>
                        </div>

                        <!-- 정렬 드롭다운 -->
                        <div class="flex items-center gap-1.5 bg-slate-800 px-3 py-1 rounded-xl border border-slate-700 text-xs shadow-xs">
                            <span class="font-bold text-indigo-300">🔃 정렬:</span>
                            <select id="matrixSortSelect" class="bg-slate-900 text-white font-bold text-xs rounded-lg border border-slate-600 px-2 py-0.5 outline-none cursor-pointer">
                                <option value="num_asc">학번 기본순</option>
                                <option value="name_asc">성명 가나다순</option>
                                <option value="avg_desc">내신평균 높은순 (상위권)</option>
                                <option value="avg_asc">내신평균 낮은순</option>
                                <option value="general_asc">일반고 안정순 (석차백분율 낮은순)</option>
                                <option value="meister_desc">울산마이스터 환산점 높은순</option>
                                <option value="energy_desc">울산에너지고 환산점 높은순</option>
                                <option value="hyundai_desc">현대공업고 환산점 높은순</option>
                            </select>
                        </div>
                    </div>

                    <!-- 표시 인원수 뱃지 -->
                    <div class="text-xs font-bold text-slate-400 bg-slate-800/80 px-3 py-1 rounded-xl border border-slate-700">
                        표시 인원: <span class="text-emerald-400 font-mono text-sm font-black" id="matrixVisibleCount">${mx.fullGrades.length}</span>명
                    </div>
                </div>

                <!-- 매트릭스 테이블 (가로 스크롤 없이 모니터 한 화면에 100% 쏙 들어가도록 유연한 반응형 구조 적용) -->
                <div class="overflow-x-auto rounded-xl border border-slate-700/50 bg-slate-800/30 custom-scrollbar">
                    <table class="w-full text-left border-collapse text-xs">
                        <thead>
                            <tr class="bg-slate-800/90 text-text-muted border-b border-slate-700/70 text-center whitespace-nowrap">
                                <th class="p-2 w-12 font-bold text-indigo-300">반</th>
                                <th class="p-2 w-10 font-bold">번호</th>
                                <th class="p-2 w-16 font-bold">성명</th>
                                <th class="p-2 w-16 font-bold text-indigo-300">내신평균</th>
                                <th class="p-1.5 text-amber-300 font-bold">🎓 울산마이스터</th>
                                <th class="p-1.5 text-amber-300 font-bold">🎓 에너지고</th>
                                <th class="p-1.5 text-amber-300 font-bold">🎓 현대공고</th>
                                <th class="p-1.5 text-cyan-300 font-bold">🏭 울산상고</th>
                                <th class="p-1.5 text-cyan-300 font-bold">🏭 울산여상</th>
                                <th class="p-1.5 text-cyan-300 font-bold">🏭 울산생과고</th>
                                <th class="p-1.5 text-cyan-300 font-bold">🏭 울산공고</th>
                                <th class="p-1.5 text-cyan-300 font-bold">🏭 울산산업고</th>
                                <th class="p-1.5 text-cyan-300 font-bold">🏭 미용예술고</th>
                                <th class="p-1.5 text-cyan-300 font-bold">🏭 기술공고</th>
                                <th class="p-2 w-32 text-emerald-300 font-bold whitespace-nowrap">🏫 후기 일반계고</th>
                            </tr>
                        </thead>
                        <tbody id="matrixTableBody">
                            ${mx.generateTableRows(mx.currentYearMode, mx.currentTrackMode)}
                        </tbody>
                    </table>
                </div>

                <!-- 하단 범례 및 인쇄 버튼 -->
                <div class="flex justify-between items-center text-xs text-text-muted flex-wrap gap-3 pt-1">
                    <div class="flex items-center gap-3 flex-wrap">
                        <span><strong>신호등 범례:</strong></span>
                        <span class="text-emerald-300 font-bold">🟢 안정</span><span class="text-indigo-300 font-bold">🟡 적정</span><span class="text-amber-300 font-bold">🟠 소신</span><span class="text-rose-300 font-bold">🔴 어려움</span>
                        <span class="text-slate-400">(${judgmentSummaryText()} · 점수에 마우스를 올리면 기준선·차이가 보입니다)</span>
                        <span class="no-print" id="matrixJudgmentToggle">${judgmentModeToggleHTML()}</span>
                        <span class="text-slate-400 font-medium">※ 학생 이름을 클릭하면 해당 학생의 1:1 세부 상담 화면으로 즉시 이동합니다.</span>
                    </div>
                    <button id="matrixPrintBtn" class="no-print btn-secondary text-xs px-3.5 py-2 font-bold inline-flex items-center gap-1.5 rounded-xl cursor-pointer">
                        <span>🖨️</span> 매트릭스 인쇄
                    </button>
                </div>
            </div>
        `;
}

// 신호등 매트릭스: 탭·학급·정렬·검색·인쇄 연결
export function bindMatrixControls(ctx, mx) {
    // 탭 스타일 갱신 헬퍼 함수
    const updateTabStyles = () => {
        ctx.modalEl.querySelectorAll('.matrix-6tab').forEach(btn => {
            const y = btn.dataset.year;
            const t = btn.dataset.track;
            const isSelected = (y === mx.currentYearMode && t === mx.currentTrackMode);

            if (isSelected) {
                if (t === 'special') {
                    btn.className = 'matrix-6tab px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer bg-amber-500 text-slate-950 border-amber-400 shadow-lg shadow-amber-500/25 scale-105';
                } else {
                    btn.className = 'matrix-6tab px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer bg-primary text-white border-indigo-400 shadow-lg shadow-indigo-500/25 scale-105';
                }
            } else {
                if (t === 'special') {
                    btn.className = 'matrix-6tab px-3 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer bg-amber-950/30 text-amber-300/80 border-amber-500/30 hover:bg-amber-900/40 hover:text-amber-200';
                } else {
                    btn.className = 'matrix-6tab px-3 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white';
                }
            }
        });
    };

    const renderTableOnly = () => {
        const tbodyEl = ctx.modalEl.querySelector('#matrixTableBody');
        if (tbodyEl) {
            tbodyEl.innerHTML = mx.generateTableRows(mx.currentYearMode, mx.currentTrackMode);
            bindStudentNameClick();
        }
    };

    updateTabStyles();

    // 판정 보기 방식(학교 설정/비율/점수) 전환: 표만 다시 그린다.
    const bindToggle = () => {
        const holder = ctx.modalEl.querySelector('#matrixJudgmentToggle');
        bindJudgmentModeToggle(holder, () => {
            holder.innerHTML = judgmentModeToggleHTML();
            bindToggle();
            renderTableOnly();
        });
    };
    bindToggle();

    // 6개 탭 클릭 이벤트 바인딩
    ctx.modalEl.querySelectorAll('.matrix-6tab').forEach(btn => {
        btn.addEventListener('click', () => {
            const y = btn.dataset.year;
            const t = btn.dataset.track;
            if (mx.currentYearMode === y && mx.currentTrackMode === t) return;

            mx.currentYearMode = y;
            mx.currentTrackMode = t;
            updateTabStyles();

            const descEl = ctx.modalEl.querySelector('#matrixModeDesc');
            if (descEl) descEl.innerHTML = mx.getModeDescription(mx.currentYearMode, mx.currentTrackMode);

            renderTableOnly();
        });
    });

    // 학급 필터 변경 이벤트
    ctx.modalEl.querySelector('#matrixClassSelect')?.addEventListener('change', (e) => {
        mx.currentClassFilter = e.target.value;
        renderTableOnly();
    });

    // 정렬 모드 변경 이벤트
    ctx.modalEl.querySelector('#matrixSortSelect')?.addEventListener('change', (e) => {
        mx.currentSortMode = e.target.value;
        renderTableOnly();
    });

    // 검색창 실시간 입력 이벤트
    const searchInput = ctx.modalEl.querySelector('#matrixSearchInput');
    const clearSearchBtn = ctx.modalEl.querySelector('#clearMatrixSearchBtn');
    searchInput?.addEventListener('input', (e) => {
        mx.currentSearchQuery = e.target.value;
        if (clearSearchBtn) {
            clearSearchBtn.classList.toggle('hidden', !mx.currentSearchQuery);
        }
        renderTableOnly();
    });
    clearSearchBtn?.addEventListener('click', () => {
        if (searchInput) {
            searchInput.value = '';
            mx.currentSearchQuery = '';
            clearSearchBtn.classList.add('hidden');
            renderTableOnly();
            searchInput.focus();
        }
    });

    const bindStudentNameClick = () => {
        ctx.modalEl.querySelectorAll('.matrix-student-name').forEach(el => {
            el.addEventListener('click', (e) => {
                const cNum = parseInt(e.currentTarget.dataset.class);
                const sNum = e.currentTarget.dataset.num;
                const sName = e.currentTarget.dataset.name;
                // 창으로 띄웠을 때만 매트릭스를 닫는다. 메뉴의 화면(docked-panel)은 상담 창을 닫으면 그대로 돌아온다.
                if (!ctx.modalEl.classList.contains('docked-panel')) ctx.modalEl.remove();
                openModal('student', { classNum: cNum, studentNum: sNum, name: sName });
            });
        });
    };

    bindStudentNameClick();
    document.getElementById('closeMatrixBtn').addEventListener('click', () => ctx.modalEl.remove());
    document.getElementById('matrixPrintBtn').addEventListener('click', () => printOnly('matrix', 'landscape'));
}
