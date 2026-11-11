import { printOnly } from '../../print/printEngine.js';
import { buildRegisterPages } from './registerPages.js';
import { bindRegisterExcelExport } from './registerExcel.js';
import { state } from '../../core/store.js';
import { currentAdmissionYear } from '../../core/admissionYear.js';

export async function openApplicationRegisterModal() {
    // 화면 구성 요소들이 공유하는 상태 (파트 함수 간 전달)
    const ctx = {  };
    await prepareRegisterModal(ctx);
    defineRegisterRenderer(ctx);
    startRegisterModal(ctx);
}

// 원서대장: 학교 설정·원서 기록·결재란 상태 준비
async function prepareRegisterModal(ctx) {
    document.getElementById('applicationRegisterModal')?.remove();

    ctx.schoolName = '중학교';
    ctx.admissionYear = currentAdmissionYear();
    try {
        const config = await window.go.main.App.GetSchoolConfig();
        if (config) {
            if (config.schoolName) ctx.schoolName = config.schoolName;
            if (config.admissionYear) ctx.admissionYear = config.admissionYear;
        }
    } catch (e) {
        console.warn('학교 설정 로드 실패:', e);
    }

    ctx.records = [];
    try {
        ctx.records = await window.go.main.App.GetSchoolApplicationRecords() || [];
    } catch (e) {
        console.error('원서대장 데이터 로드 실패:', e);
    }

    ctx.isHomeroom = state.currentUser && state.currentUser.Role === 'homeroom';
    ctx.homeroomClass = ctx.isHomeroom ? state.currentUser.ClassNum : null;

    ctx.defaultApprovalCandidates = [
        { id: 'homeroom', label: '담임', defaultChecked: true },
        { id: 'gradeHead', label: '학년부장', defaultChecked: true },
        { id: 'academicHead', label: '교무부장', defaultChecked: false },
        { id: 'careerHead', label: '진로부장', defaultChecked: false },
        { id: 'vicePrincipal', label: '교감', defaultChecked: true },
        { id: 'principal', label: '교장', defaultChecked: true },
    ];

    let savedApprovals = null;
    try {
        const saved = localStorage.getItem('phgc_register_approvals');
        if (saved) savedApprovals = JSON.parse(saved);
    } catch (e) { }

    ctx.activeApprovals = Array.isArray(savedApprovals) ? savedApprovals : ['담임', '학년부장', '교감', '교장'];
    
    ctx.printLayoutMode = ctx.isHomeroom ? 'single_class' : 'all_paged';
    ctx.selectedClassFilter = ctx.isHomeroom ? String(ctx.homeroomClass) : 'all';
    ctx.pageScaleMode = 'auto'; // 'auto', 'standard', 'compact', 'ultra'

    const classSet = new Set();
    ctx.records.forEach(r => { if (r.classNum) classSet.add(r.classNum); });
    ctx.classList = Array.from(classSet).sort((a, b) => a - b);

    ctx.getSchoolTotalMaxString = (schName, cat) => {
        if (!schName) return '';
        const name = schName.trim();
        if (name.includes('마이스터') || name.includes('울산마이스터')) return '300';
        if (name.includes('에너지') || name.includes('울산에너지')) return '230';
        if (name.includes('현대공업') || name.includes('현대공고')) return '200';
        if (name.includes('일반고') || cat === 'general') return '%';
        if (cat === 'special' || name.includes('공업고') || name.includes('미용예술') || name.includes('생활과학') || name.includes('산업고') || name.includes('상업고') || name.includes('애니원고')) {
            return '100';
        }
        return '';
    };

    ctx.modal = document.createElement('div');
    ctx.modal.id = 'applicationRegisterModal';
    ctx.modal.className = 'fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex flex-col p-2 sm:p-4 md:p-6 overflow-hidden animate-in fade-in duration-200';
    document.body.appendChild(ctx.modal);
}

// 원서대장: 본문 렌더러 정의
function defineRegisterRenderer(ctx) {
    ctx.renderModalContent = () => {
        // 화면 구성 요소들이 공유하는 상태 (파트 함수 간 전달)
        const reg = {  };
        buildRegisterPages(ctx, reg);
        renderRegisterLayout(ctx, reg);
        bindRegisterExcelExport(ctx, reg);
        bindRegisterControls(ctx, reg);
    };
}

// 원서대장: 화면 골격 렌더링과 닫기·인쇄 연결
function renderRegisterLayout(ctx, reg) {
    ctx.modal.innerHTML = `
            <!-- 상단 제어 대시보드 바 (인쇄 시 완벽 숨김) -->
            <div class="no-print bg-slate-900 border border-slate-700/90 rounded-2xl p-3.5 mb-3 shadow-2xl shrink-0 flex flex-col gap-2.5">
                <!-- 1열: 타이틀 + 모드 탭 + 페이지 배율 + 인쇄/닫기 버튼 -->
                <div class="flex items-center justify-between flex-wrap gap-3 pb-2.5 border-b border-slate-800">
                    <!-- 좌측: 제목 및 공식 서식 뱃지 -->
                    <div class="flex items-center gap-3">
                        <span class="text-2xl">📋</span>
                        <div class="flex items-center gap-2 flex-wrap">
                            <h2 class="text-base font-black text-white tracking-tight">고입원서대장</h2>
                            <span class="text-xs font-bold text-white bg-indigo-600 px-2.5 py-0.5 rounded-md shadow-sm">원서대장 서식</span>
                        </div>
                    </div>

                    <!-- 중앙: 출력 모드 토글 (학년부장: 전교 vs 학급별, 담임: 우리 반 고정) -->
                    ${!ctx.isHomeroom ? `
                    <div class="flex items-center bg-slate-800 p-0.5 rounded-xl border border-slate-700 text-xs">
                        <button id="modeAllPagedBtn" class="px-3.5 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${ctx.printLayoutMode === 'all_paged' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}">
                            📜 전교 일괄 (반별 자동분할 인쇄)
                        </button>
                        <button id="modeSingleClassBtn" class="px-3.5 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${ctx.printLayoutMode === 'single_class' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}">
                            📑 학급별 개별 출력
                        </button>
                    </div>
                    ` : `
                    <div class="px-3 py-1 rounded-xl bg-indigo-950 border border-indigo-500/50 text-xs font-bold text-indigo-200 flex items-center gap-1.5">
                        <span>👩‍🏫</span> 3학년 ${ctx.homeroomClass}반 담임 전용 대장 모드
                    </div>
                    `}

                    <!-- 우측: 크기 맞춤 + 엑셀 저장 + 인쇄/PDF 저장 + 닫기 버튼 -->
                    <div class="flex items-center gap-2">
                        <!-- 페이지 크기 맞춤 셀렉트 -->
                        <div class="flex items-center gap-1.5 bg-slate-800 px-2.5 py-1 rounded-xl border border-slate-700 text-xs">
                            <span>📐</span>
                            <select id="registerPageScaleSelect" class="bg-transparent text-indigo-200 font-bold text-xs outline-none cursor-pointer">
                                <option value="auto" ${ctx.pageScaleMode === 'auto' ? 'selected' : ''} class="bg-slate-900 text-white">자동 한페이지 맞춤</option>
                                <option value="standard" ${ctx.pageScaleMode === 'standard' ? 'selected' : ''} class="bg-slate-900 text-white">표준 (12px)</option>
                                <option value="compact" ${ctx.pageScaleMode === 'compact' ? 'selected' : ''} class="bg-slate-900 text-white">컴팩트 (11px)</option>
                                <option value="ultra" ${ctx.pageScaleMode === 'ultra' ? 'selected' : ''} class="bg-slate-900 text-white">초컴팩트 (10px)</option>
                            </select>
                        </div>

                        <button id="exportRegisterExcelBtn" class="bg-emerald-700 hover:bg-emerald-600 text-white text-xs px-3.5 py-2 font-black flex items-center gap-1.5 rounded-xl shadow-lg shadow-emerald-700/30 hover:scale-[1.02] active:scale-95 transition-all cursor-pointer" title="엑셀 파일(.xls)로 내려받아 학교별 양식에 맞게 틀을 자유롭게 편집·수정할 수 있습니다">
                            <span>📊</span> 엑셀 다운로드
                        </button>
                        <button id="printRegisterBtn" class="bg-linear-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white text-xs px-4 py-2 font-black flex items-center gap-1.5 rounded-xl shadow-lg shadow-indigo-600/30 hover:scale-[1.02] active:scale-95 transition-all cursor-pointer">
                            <span>🖨️</span> 인쇄 / PDF 저장
                        </button>
                        <button id="closeRegisterBtn" class="bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs px-3.5 py-2 font-bold rounded-xl border border-slate-700 transition-colors cursor-pointer">
                            ✕ 닫기
                        </button>
                    </div>
                </div>

                <!-- 2열: 결재라인 직책 뱃지 선택 (선명한 ON/OFF 토글) & 학급 선택 -->
                <div class="flex items-center justify-between flex-wrap gap-3 text-xs">
                    <!-- 좌측: 결재라인 직책 뱃지 그룹 (투명도 없이 100% 선명하게 구분) -->
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="font-bold text-slate-300 flex items-center gap-1 shrink-0">
                            <span>✍️</span> 결재라인 직책:
                        </span>
                        <div class="flex items-center gap-1.5 flex-wrap">
                            ${ctx.defaultApprovalCandidates.map(c => {
                                const isChecked = ctx.activeApprovals.includes(c.label);
                                return `
                                    <button type="button" 
                                            class="approval-role-badge-btn inline-flex items-center gap-1 text-xs px-3 py-1 rounded-lg font-bold transition-all cursor-pointer select-none ${
                                                isChecked
                                                    ? 'bg-emerald-600 text-white border-2 border-emerald-400 shadow-md ring-2 ring-emerald-500/20'
                                                    : 'bg-slate-800 text-slate-400 border border-slate-600 hover:bg-slate-700 hover:text-slate-200'
                                            }"
                                            data-role="${c.label}">
                                        <span>${isChecked ? '✓' : '+'}</span>
                                        <span>${c.label}</span>
                                    </button>
                                `;
                            }).join('')}
                        </div>
                    </div>

                    <!-- 우측: 학급 선택 필터 (개별 출력 모드 시 활성화) -->
                    ${(!ctx.isHomeroom && ctx.printLayoutMode === 'single_class') ? `
                    <div class="flex items-center gap-2 bg-slate-800 px-3 py-1 rounded-xl border border-slate-700">
                        <label class="font-bold text-indigo-300">출력 학급:</label>
                        <select id="registerClassFilterSelect" class="bg-slate-900 text-white font-bold text-xs px-2.5 py-1 rounded-lg border border-slate-600 outline-none cursor-pointer">
                            ${ctx.classList.map(c => {
                                const cnt = new Set(ctx.records.filter(r => r.classNum === c).map(r => r.studentNum)).size;
                                return `<option value="${c}" ${String(ctx.selectedClassFilter) === String(c) ? 'selected' : ''}>${c}반 (${cnt}명)</option>`;
                            }).join('')}
                        </select>
                    </div>
                    ` : ''}
                </div>
            </div>

            <!-- 대장 본문 영역 (A4 가로 화이트 페이퍼 뷰어) -->
            <div class="flex-1 overflow-auto custom-scrollbar flex flex-col items-center p-2 sm:p-4 bg-slate-950/60 rounded-2xl border border-slate-800">
                ${reg.documentPagesHTML}
            </div>
        `;

    // 이벤트 바인딩 (modal 내부에서 직접 쿼리하여 첫 진입 시점부터 100% 즉시 바인딩 보장)
    ctx.modal.querySelector('#closeRegisterBtn')?.addEventListener('click', () => ctx.modal.remove());
    ctx.modal.querySelector('#printRegisterBtn')?.addEventListener('click', () => printOnly('register', 'landscape'));
}

// 원서대장: 배율·출력 방식·학급 필터·결재란·배정학교 입력 연결
function bindRegisterControls(ctx, reg) {
    // 페이지 크기 맞춤 변경 이벤트
    ctx.modal.querySelector('#registerPageScaleSelect')?.addEventListener('change', (e) => {
        ctx.pageScaleMode = e.target.value;
        ctx.renderModalContent();
    });

    // 모드 토글 이벤트 (전교 일괄 vs 학급별 개별)
    ctx.modal.querySelector('#modeAllPagedBtn')?.addEventListener('click', () => {
        ctx.printLayoutMode = 'all_paged';
        ctx.selectedClassFilter = 'all';
        ctx.renderModalContent();
    });
    ctx.modal.querySelector('#modeSingleClassBtn')?.addEventListener('click', () => {
        ctx.printLayoutMode = 'single_class';
        if (ctx.selectedClassFilter === 'all') ctx.selectedClassFilter = String(ctx.classList[0] || 1);
        ctx.renderModalContent();
    });

    // 학급 필터 변경 이벤트
    ctx.modal.querySelector('#registerClassFilterSelect')?.addEventListener('change', (e) => {
        ctx.selectedClassFilter = e.target.value;
        ctx.renderModalContent();
    });

    // 결재라인 뱃지 토글 이벤트 (체크 여부가 확실한 선명한 버튼)
    ctx.modal.querySelectorAll('.approval-role-badge-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const role = e.currentTarget.dataset.role;
            if (ctx.activeApprovals.includes(role)) {
                ctx.activeApprovals = ctx.activeApprovals.filter(r => r !== role);
            } else {
                const order = ctx.defaultApprovalCandidates.map(c => c.label);
                const newSet = new Set([...ctx.activeApprovals, role]);
                ctx.activeApprovals = order.filter(r => newSet.has(r));
            }
            try {
                localStorage.setItem('phgc_register_approvals', JSON.stringify(ctx.activeApprovals));
            } catch (err) { }
            ctx.renderModalContent();
        });
    });

    // 일반고 배정학교 인라인 수정 & DB 즉시 저장 이벤트
    ctx.modal.querySelectorAll('.register-assigned-school-input').forEach(input => {
        const saveAssigned = async () => {
            const cNum = parseInt(input.dataset.class, 10);
            const sNum = input.dataset.num;
            const sName = input.dataset.name;
            const val = input.value.trim();

            try {
                if (window.go?.main?.App?.UpdateAssignedSchool) {
                    await window.go.main.App.UpdateAssignedSchool(cNum, sNum, sName, val);
                }
                // 메모리 레코드에도 즉시 반영
                const target = ctx.records.find(r => r.classNum === cNum && r.studentNum === sNum);
                if (target) target.assignedSchool = val;
            } catch (err) {
                console.error('배정학교 저장 실패:', err);
            }
        };

        input.addEventListener('blur', saveAssigned);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                input.blur();
            }
        });
    });
}

// 원서대장: 최초 렌더링
function startRegisterModal(ctx) {
    ctx.renderModalContent();
}
