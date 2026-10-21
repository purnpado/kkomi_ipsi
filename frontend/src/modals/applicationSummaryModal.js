import { escapeHtml, escapeAttr } from '../core/utils.js';
import { printOnly } from '../print/printEngine.js';
import { showModalAlert, showModalConfirm } from '../core/dialogs.js';

export async function openApplicationRegisterModal() {
    document.getElementById('applicationRegisterModal')?.remove();

    let schoolName = '중학교';
    let admissionYear = 2026;
    try {
        const config = await GetSchoolConfig();
        if (config) {
            if (config.schoolName) schoolName = config.schoolName;
            if (config.admissionYear) admissionYear = config.admissionYear;
        }
    } catch (e) {
        console.warn('학교 설정 로드 실패:', e);
    }

    let records = [];
    try {
        records = await window.go.main.App.GetSchoolApplicationRecords() || [];
    } catch (e) {
        console.error('원서대장 데이터 로드 실패:', e);
    }

    const isHomeroom = window.currentUser && window.currentUser.Role === 'homeroom';
    const homeroomClass = isHomeroom ? window.currentUser.ClassNum : null;

    const defaultApprovalCandidates = [
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

    let activeApprovals = Array.isArray(savedApprovals) ? savedApprovals : ['담임', '학년부장', '교감', '교장'];
    
    let printLayoutMode = isHomeroom ? 'single_class' : 'all_paged';
    let selectedClassFilter = isHomeroom ? String(homeroomClass) : 'all';
    let pageScaleMode = 'auto'; // 'auto', 'standard', 'compact', 'ultra'

    const classSet = new Set();
    records.forEach(r => { if (r.classNum) classSet.add(r.classNum); });
    const classList = Array.from(classSet).sort((a, b) => a - b);

    const getSchoolTotalMaxString = (schName, cat) => {
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

    const modal = document.createElement('div');
    modal.id = 'applicationRegisterModal';
    modal.className = 'fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex flex-col p-2 sm:p-4 md:p-6 overflow-hidden animate-in fade-in duration-200';
    document.body.appendChild(modal);

    const renderModalContent = () => {
        const approvalHeadersHTML = activeApprovals.length > 0
            ? activeApprovals.map(role => `<th class="border border-black bg-slate-100 font-bold w-16 text-center tracking-tight" style="padding: 4px 2px;">${role}</th>`).join('')
            : '<th class="border border-black bg-slate-100 font-normal p-1 text-slate-400 text-[11px]">-</th>';

        const targetClasses = (printLayoutMode === 'single_class' && selectedClassFilter !== 'all')
            ? [parseInt(selectedClassFilter, 10)]
            : (classList.length > 0 ? classList : [1]);

        const documentPagesHTML = targetClasses.map((currentClass, pageIdx) => {
            const classRecords = records.filter(r => r.classNum === currentClass).sort((a, b) => {
                const numA = parseInt(a.studentNum, 10) || 0;
                const numB = parseInt(b.studentNum, 10) || 0;
                return numA - numB;
            });

            const studentCount = classRecords.length;

            let cellPaddingStyle = 'padding: 5px 6px;';
            let cellFontSizeStyle = 'font-size: 11.5px;';
            let approvalCellHeight = 'height: 34px;';
            let tableHeaderPadding = 'padding: 5px 3px;';
            let tableHeaderFont = 'font-size: 11.5px;';

            const effectiveScale = (pageScaleMode === 'auto')
                ? (studentCount >= 26 ? 'ultra' : (studentCount >= 21 ? 'compact' : 'standard'))
                : pageScaleMode;

            if (effectiveScale === 'ultra') {
                cellPaddingStyle = 'padding: 2.5px 4px;';
                cellFontSizeStyle = 'font-size: 10px; line-height: 1.25;';
                approvalCellHeight = 'height: 25px;';
                tableHeaderPadding = 'padding: 3.5px 2px;';
                tableHeaderFont = 'font-size: 10.5px;';
            } else if (effectiveScale === 'compact') {
                cellPaddingStyle = 'padding: 4px 5px;';
                cellFontSizeStyle = 'font-size: 11px; line-height: 1.3;';
                approvalCellHeight = 'height: 30px;';
                tableHeaderPadding = 'padding: 4px 3px;';
                tableHeaderFont = 'font-size: 11px;';
            } else if (effectiveScale === 'standard') {
                cellPaddingStyle = 'padding: 6px 8px;';
                cellFontSizeStyle = 'font-size: 12px; line-height: 1.4;';
                approvalCellHeight = 'height: 38px;';
                tableHeaderPadding = 'padding: 6px 4px;';
                tableHeaderFont = 'font-size: 12px;';
            }

            // 학급 내 학생 번호순으로 학생별 지원 기록들을 그룹화
            const studentGroupMap = new Map();
            classRecords.forEach(r => {
                const sKey = r.studentNum || 0;
                if (!studentGroupMap.has(sKey)) {
                    studentGroupMap.set(sKey, []);
                }
                studentGroupMap.get(sKey).push(r);
            });

            // 학생 번호순 정렬된 고유 학생 목록
            const uniqueStudentNums = Array.from(studentGroupMap.keys()).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

            const rowsHTML = uniqueStudentNums.length > 0 ? uniqueStudentNums.map((sNum, idx) => {
                const apps = studentGroupMap.get(sNum) || [];
                // 1순위: 최종 합격/최종 진학 기록, 2순위: 가장 마지막 지원 기록 (후기 일반고 등)
                const acceptedApp = apps.find(a => a.status === '합격' || a.status === '최종 진학' || a.status === '최종진학');
                const mainApp = acceptedApp || (apps.length > 0 ? apps[apps.length - 1] : {});
                // 이전 지원 이력 (메인 기록을 제외한 나머지 기록들, 주로 전기 불합격 등)
                const priorApps = apps.filter(a => a !== mainApp);

                const paddedClass = String(mainApp.classNum || currentClass || 1);
                const paddedNum = String(mainApp.studentNum || sNum).padStart(2, '0');
                const studentId = `3${paddedClass.padStart(2, '0')}${paddedNum}`;

                let schoolDisplay = escapeHtml(mainApp.schoolName || '-');
                if (mainApp.category === 'general') {
                    schoolDisplay = '후기 일반고';
                } else if (mainApp.category === 'none') {
                    schoolDisplay = '미진학 (진학포기)';
                }

                let deptDisplayHTML = '';
                if (mainApp.category === 'general') {
                    deptDisplayHTML = `
                        <div class="flex items-center justify-center gap-1 w-full">
                            <input type="text" 
                                   class="register-assigned-school-input font-bold text-indigo-900 border-b border-dashed border-indigo-400 bg-transparent text-left w-full outline-none print:border-none print:text-black print:p-0"
                                   style="border-bottom-style: dashed; ${cellFontSizeStyle} padding: 1px 2px;"
                                   value="${escapeAttr(mainApp.assignedSchool || '')}" 
                                   placeholder="배정고 입력(수기)" 
                                   data-class="${escapeAttr(mainApp.classNum || currentClass)}" 
                                   data-num="${escapeAttr(mainApp.studentNum || sNum)}" 
                                   data-name="${escapeAttr(mainApp.studentName)}" />
                        </div>
                    `;
                } else {
                    if (mainApp.assignedDepartment) {
                        deptDisplayHTML = `<span class="font-semibold">${escapeHtml(mainApp.assignedDepartment)}</span> <span class="text-[10px] text-slate-500 font-normal">(배정)</span>`;
                    } else if (mainApp.preferences && mainApp.preferences.length > 0) {
                        deptDisplayHTML = `<span class="font-medium">${escapeHtml(mainApp.preferences[0])}</span>`;
                    } else {
                        deptDisplayHTML = '-';
                    }
                }

                // 합격 여부 (O/X 대신 '합격', '불합격', '진행'으로 명확히 표기)
                let passDisplay = '-';
                if (mainApp.status === '합격' || mainApp.status === '최종 진학' || mainApp.status === '최종진학') {
                    passDisplay = '<span class="font-black text-emerald-800 text-xs">합격</span>';
                } else if (mainApp.status === '불합격') {
                    passDisplay = '<span class="font-black text-rose-800 text-xs">불합격</span>';
                } else if (mainApp.status === '지원완료' || mainApp.status === '지원희망') {
                    passDisplay = '<span class="text-[11px] text-slate-600 font-medium">진행</span>';
                }

                let scoreDisplay = '-';
                if (mainApp.score && mainApp.score > 0) {
                    const formattedScore = mainApp.score.toFixed(2);
                    const maxVal = getSchoolTotalMaxString(mainApp.schoolName, mainApp.category);
                    if (maxVal === '%') {
                        scoreDisplay = `${formattedScore}%`;
                    } else if (maxVal) {
                        scoreDisplay = `${formattedScore}/${maxVal}`;
                    } else {
                        scoreDisplay = formattedScore;
                    }
                }

                // 비고란: 전형 표시 + 추가모집 뱃지 + 이전 전기 지원이력(전기 불합격 학교·학과·점수)
                let noteParts = [];
                if (mainApp.track && mainApp.track !== '해당 없음' && mainApp.track !== '해당없음') {
                    const trackText = mainApp.track.includes('전형') ? mainApp.track : `${mainApp.track}전형`;
                    noteParts.push(escapeHtml(trackText));
                }
                const isExtraRecruit = (mainApp.schoolName || '').includes('추가') || (mainApp.track || '').includes('추가') || (mainApp.status || '').includes('추가');
                if (isExtraRecruit) {
                    noteParts.push('<span class="font-bold text-indigo-700">[추가모집]</span>');
                }

                // 이전 전기 지원이력 표시 (마이스터고, 특성화고 불합격 이력 등)
                if (priorApps.length > 0) {
                    const priorSummary = priorApps.map(p => {
                        const dept = p.assignedDepartment || (p.preferences && p.preferences[0]) || '';
                        const scoreStr = p.score ? ` (${p.score.toFixed(1)}점)` : '';
                        const statusStr = p.status || '불합격';
                        return `${p.schoolName}${dept ? ' ' + dept : ''}[${statusStr}${scoreStr}]`;
                    }).join(', ');
                    noteParts.push(`<div class="text-[9.5px] text-slate-600 leading-tight mt-0.5"><span class="text-rose-700 font-semibold">전기이력:</span> ${escapeHtml(priorSummary)}</div>`);
                }

                const noteDisplay = noteParts.join(' ') || '';

                const approvalCellsHTML = activeApprovals.length > 0
                    ? activeApprovals.map(() => `<td class="border border-black p-0 w-16 text-center" style="${approvalCellHeight}"></td>`).join('')
                    : `<td class="border border-black p-0 text-center text-slate-300" style="${approvalCellHeight}">-</td>`;

                return `
                    <tr class="text-center text-black font-sans hover:bg-slate-50 print:hover:bg-transparent" style="${cellFontSizeStyle}">
                        <td class="border border-black font-mono" style="${cellPaddingStyle}">${idx + 1}</td>
                        <td class="border border-black font-mono font-medium" style="${cellPaddingStyle}">${escapeHtml(studentId)}</td>
                        <td class="border border-black font-bold whitespace-nowrap" style="${cellPaddingStyle}">${escapeHtml(mainApp.studentName)}</td>
                        <td class="border border-black font-mono font-medium whitespace-nowrap" style="${cellPaddingStyle}">${scoreDisplay}</td>
                        <td class="border border-black font-semibold text-left pl-2.5" style="${cellPaddingStyle}">${schoolDisplay}</td>
                        <td class="border border-black text-left pl-2.5" style="${cellPaddingStyle} min-width: 190px;">${deptDisplayHTML}</td>
                        <td class="border border-black" style="${cellPaddingStyle}">${passDisplay}</td>
                        ${approvalCellsHTML}
                        <td class="border border-black text-left pl-2 text-[10.5px] text-slate-700" style="${cellPaddingStyle}">${noteDisplay}</td>
                    </tr>
                `;
            }).join('') : `
                <tr>
                    <td colspan="${8 + Math.max(1, activeApprovals.length)}" class="border border-black p-10 text-center text-slate-400 font-medium">
                        ${currentClass}반에 등록된 지원 학생 자료가 없습니다.
                    </td>
                </tr>
            `;

            const pageBreakClass = (pageIdx > 0 && printLayoutMode === 'all_paged') ? 'print:break-before-page' : '';

            return `
                <div class="print-document bg-white text-black p-6 sm:p-8 md:p-10 shadow-2xl rounded-sm w-full flex flex-col justify-between select-text ${pageBreakClass}" 
                     style="font-family: 'Batang', 'Nanum Myeongjo', 'Malgun Gothic', serif; max-width: 1300px; min-height: 820px; margin-bottom: 2rem; ${pageIdx > 0 && printLayoutMode === 'all_paged' ? 'page-break-before: always;' : ''}">
                    <div>
                        <div class="text-center my-3 sm:my-4">
                            <h1 class="text-3xl sm:text-4xl font-black tracking-[0.6em] inline-block pb-1" style="letter-spacing: 0.6em;">
                                고 입 원 서 대 장
                            </h1>
                        </div>

                        <div class="flex items-end justify-between font-bold text-sm sm:text-base mb-2 px-1">
                            <div class="tracking-wider flex items-center gap-3">
                                <span>${admissionYear}학년도</span>
                                <span class="text-indigo-900 font-black bg-indigo-50 px-2.5 py-0.5 rounded border border-indigo-200 print:border-black print:bg-transparent">
                                    제 3학년 ${currentClass}반
                                </span>
                            </div>
                            <div class="tracking-widest text-base sm:text-lg">
                                ${schoolName}
                            </div>
                        </div>

                        <div class="w-full overflow-x-auto">
                            <table class="w-full border-collapse border-2 border-black text-center" style="border: 2px solid black;">
                                <thead>
                                    <tr class="bg-slate-100 font-bold" style="background-color: #f1f5f9; ${tableHeaderFont}">
                                        <th rowspan="2" class="border border-black w-10" style="${tableHeaderPadding}">연번</th>
                                        <th rowspan="2" class="border border-black w-16" style="${tableHeaderPadding}">학번</th>
                                        <th rowspan="2" class="border border-black w-20" style="${tableHeaderPadding}">이름</th>
                                        <th rowspan="2" class="border border-black w-28" style="${tableHeaderPadding}">내신총점<br><span class="text-[10px] font-normal">(취득점/만점)</span></th>
                                        <th rowspan="2" class="border border-black w-48" style="${tableHeaderPadding}">지원고등학교</th>
                                        <th rowspan="2" class="border border-black text-center" style="${tableHeaderPadding} min-width: 190px;">
                                            지원학과(전기, 1지망)<br>
                                             OR 최종배정학교(후기고)
                                        </th>
                                        <th rowspan="2" class="border border-black p-2 w-16">
                                            합격여부
                                        </th>
                                        <th colspan="${Math.max(1, activeApprovals.length)}" class="border border-black p-1 text-center font-bold">
                                            결재
                                        </th>
                                        <th rowspan="2" class="border border-black p-2 w-28">비고</th>
                                    </tr>
                                    <tr class="bg-slate-50 font-semibold text-xs" style="background-color: #f8fafc;">
                                        ${approvalHeadersHTML}
                                    </tr>
                                </thead>
                                <tbody>
                                    ${rowsHTML}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- 하단 출력 정보 및 안내 -->
                    <div class="mt-8 pt-3 border-t border-slate-200 flex justify-between items-center text-xs text-slate-500 font-sans">
                        <span>출력일시: ${new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                        <span>[내부 결재 및 원서 접수 확인용]</span>
                        <span>${schoolName} 3학년 진학상담시스템</span>
                    </div>
                </div>
            `;
        }).join('');

        modal.innerHTML = `
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
                    ${!isHomeroom ? `
                    <div class="flex items-center bg-slate-800 p-0.5 rounded-xl border border-slate-700 text-xs">
                        <button id="modeAllPagedBtn" class="px-3.5 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${printLayoutMode === 'all_paged' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}">
                            📜 전교 일괄 (반별 자동분할 인쇄)
                        </button>
                        <button id="modeSingleClassBtn" class="px-3.5 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${printLayoutMode === 'single_class' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}">
                            📑 학급별 개별 출력
                        </button>
                    </div>
                    ` : `
                    <div class="px-3 py-1 rounded-xl bg-indigo-950 border border-indigo-500/50 text-xs font-bold text-indigo-200 flex items-center gap-1.5">
                        <span>👩‍🏫</span> 3학년 ${homeroomClass}반 담임 전용 대장 모드
                    </div>
                    `}

                    <!-- 우측: 크기 맞춤 + 엑셀 저장 + 인쇄/PDF 저장 + 닫기 버튼 -->
                    <div class="flex items-center gap-2">
                        <!-- 페이지 크기 맞춤 셀렉트 -->
                        <div class="flex items-center gap-1.5 bg-slate-800 px-2.5 py-1 rounded-xl border border-slate-700 text-xs">
                            <span>📐</span>
                            <select id="registerPageScaleSelect" class="bg-transparent text-indigo-200 font-bold text-xs outline-none cursor-pointer">
                                <option value="auto" ${pageScaleMode === 'auto' ? 'selected' : ''} class="bg-slate-900 text-white">자동 한페이지 맞춤</option>
                                <option value="standard" ${pageScaleMode === 'standard' ? 'selected' : ''} class="bg-slate-900 text-white">표준 (12px)</option>
                                <option value="compact" ${pageScaleMode === 'compact' ? 'selected' : ''} class="bg-slate-900 text-white">컴팩트 (11px)</option>
                                <option value="ultra" ${pageScaleMode === 'ultra' ? 'selected' : ''} class="bg-slate-900 text-white">초컴팩트 (10px)</option>
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
                            ${defaultApprovalCandidates.map(c => {
                                const isChecked = activeApprovals.includes(c.label);
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
                    ${(!isHomeroom && printLayoutMode === 'single_class') ? `
                    <div class="flex items-center gap-2 bg-slate-800 px-3 py-1 rounded-xl border border-slate-700">
                        <label class="font-bold text-indigo-300">출력 학급:</label>
                        <select id="registerClassFilterSelect" class="bg-slate-900 text-white font-bold text-xs px-2.5 py-1 rounded-lg border border-slate-600 outline-none cursor-pointer">
                            ${classList.map(c => {
                                const cnt = studentGroupMap.has(c) ? studentGroupMap.get(c).length : records.filter(r => r.classNum === c).length;
                                return `<option value="${c}" ${String(selectedClassFilter) === String(c) ? 'selected' : ''}>${c}반 (${cnt}명)</option>`;
                            }).join('')}
                        </select>
                    </div>
                    ` : ''}
                </div>
            </div>

            <!-- 대장 본문 영역 (A4 가로 화이트 페이퍼 뷰어) -->
            <div class="flex-1 overflow-auto custom-scrollbar flex flex-col items-center p-2 sm:p-4 bg-slate-950/60 rounded-2xl border border-slate-800">
                ${documentPagesHTML}
            </div>
        `;

        // 이벤트 바인딩 (modal 내부에서 직접 쿼리하여 첫 진입 시점부터 100% 즉시 바인딩 보장)
        modal.querySelector('#closeRegisterBtn')?.addEventListener('click', () => modal.remove());
        modal.querySelector('#printRegisterBtn')?.addEventListener('click', () => printOnly('register', 'landscape'));

        // 원서대장 엑셀 다운로드 (.xls 스프레드시트 포맷)
        modal.querySelector('#exportRegisterExcelBtn')?.addEventListener('click', () => {
            const classTag = (printLayoutMode === 'single_class' && selectedClassFilter !== 'all') ? `${selectedClassFilter}반` : '전체';
            const totalCols = 7 + Math.max(1, activeApprovals.length) + 1;

            let html = `
            <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
            <head>
                <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
                <!--[if gte mso 9]>
                <xml>
                <x:ExcelWorkbook>
                <x:ExcelWorksheets>
                <x:ExcelWorksheet>
                <x:Name>고입원서대장</x:Name>
                <x:WorksheetOptions>
                <x:DisplayGridlines/>
                </x:WorksheetOptions>
                </x:ExcelWorksheet>
                </x:ExcelWorksheets>
                </x:ExcelWorkbook>
                </xml>
                <![endif]-->
                <style>
                    table { border-collapse: collapse; font-family: 'Malgun Gothic', '맑은 고딕', dotum, sans-serif; font-size: 10pt; }
                    th, td { border: 1px solid #333333; text-align: center; vertical-align: middle; }
                    .th-header { background-color: #f1f5f9; font-weight: bold; }
                    .title { font-size: 18pt; font-weight: bold; text-align: center; border: none; }
                    .meta { font-size: 11pt; font-weight: bold; border: none; }
                </style>
            </head>
            <body>
            `;

            targetClasses.forEach((currentClass, pIdx) => {
                if (pIdx > 0) {
                    html += `<br style="mso-data-placement:same-cell;" /><br /><hr /><br />`;
                }

                const classRecords = records.filter(r => r.classNum === currentClass).sort((a, b) => {
                    const numA = parseInt(a.studentNum, 10) || 0;
                    const numB = parseInt(b.studentNum, 10) || 0;
                    return numA - numB;
                });

                const studentGroupMap = new Map();
                classRecords.forEach(r => {
                    const sKey = r.studentNum || 0;
                    if (!studentGroupMap.has(sKey)) studentGroupMap.set(sKey, []);
                    studentGroupMap.get(sKey).push(r);
                });
                const uniqueStudentNums = Array.from(studentGroupMap.keys()).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

                html += `
                <table>
                    <tr><td colspan="${totalCols}" class="title" style="height:45px;">고 입 원 서 대 장</td></tr>
                    <tr>
                        <td colspan="4" class="meta" style="text-align:left;height:30px;">
                            ${admissionYear}학년도 제 3학년 ${currentClass}반
                        </td>
                        <td colspan="${totalCols - 4}" class="meta" style="text-align:right;">
                            학교명: ${escapeHtml(schoolName)}
                        </td>
                    </tr>
                    <tr>
                        <td colspan="${totalCols - activeApprovals.length}" style="border:none;"></td>
                        ${activeApprovals.map(role => `<td class="th-header" style="width:70px;height:24px;">${escapeHtml(role)}</td>`).join('')}
                    </tr>
                    <tr>
                        <td colspan="${totalCols - activeApprovals.length}" style="border:none;"></td>
                        ${activeApprovals.map(() => `<td style="height:50px;"></td>`).join('')}
                    </tr>
                    <tr><td colspan="${totalCols}" style="border:none;height:10px;"></td></tr>
                    <tr class="th-header" style="height:32px;">
                        <th style="width:45px;">연번</th>
                        <th style="width:80px;">학번</th>
                        <th style="width:85px;">성명</th>
                        <th style="width:90px;">산출점수</th>
                        <th style="width:130px;">지원학교</th>
                        <th style="width:160px;">지원(배정)학과</th>
                        <th style="width:70px;">합격여부</th>
                        ${activeApprovals.map(role => `<th style="width:65px;">${escapeHtml(role)}</th>`).join('')}
                        <th style="width:200px;">비고</th>
                    </tr>
                `;

                if (uniqueStudentNums.length === 0) {
                    html += `<tr><td colspan="${totalCols}" style="height:40px;color:#888;">등록된 학생 데이터가 없습니다.</td></tr>`;
                } else {
                    uniqueStudentNums.forEach((sNum, idx) => {
                        const apps = studentGroupMap.get(sNum) || [];
                        const acceptedApp = apps.find(a => a.status === '합격' || a.status === '최종 진학' || a.status === '최종진학');
                        const mainApp = acceptedApp || (apps.length > 0 ? apps[apps.length - 1] : {});
                        const priorApps = apps.filter(a => a !== mainApp);

                        const paddedClass = String(mainApp.classNum || currentClass || 1);
                        const paddedNum = String(mainApp.studentNum || sNum).padStart(2, '0');
                        const studentId = `3${paddedClass.padStart(2, '0')}${paddedNum}`;

                        let schoolDisplay = mainApp.schoolName || '-';
                        if (mainApp.category === 'general') schoolDisplay = '후기 일반고';
                        else if (mainApp.category === 'none') schoolDisplay = '미진학 (진학포기)';

                        let deptDisplay = '-';
                        if (mainApp.category === 'general') {
                            deptDisplay = mainApp.assignedSchool ? `배정: ${mainApp.assignedSchool}` : '배정고 미입력';
                        } else if (mainApp.assignedDepartment) {
                            deptDisplay = `${mainApp.assignedDepartment} (배정)`;
                        } else if (mainApp.preferences && mainApp.preferences.length > 0) {
                            deptDisplay = mainApp.preferences[0];
                        }

                        let passDisplay = mainApp.status || '-';
                        let scoreDisplay = '-';
                        if (mainApp.score && mainApp.score > 0) {
                            const formattedScore = mainApp.score.toFixed(2);
                            const maxVal = getSchoolTotalMaxString(mainApp.schoolName, mainApp.category);
                            scoreDisplay = maxVal === '%' ? `${formattedScore}%` : (maxVal ? `${formattedScore}/${maxVal}` : formattedScore);
                        }

                        let noteParts = [];
                        if (mainApp.track && mainApp.track !== '해당 없음' && mainApp.track !== '해당없음') {
                            noteParts.push(mainApp.track.includes('전형') ? mainApp.track : `${mainApp.track}전형`);
                        }
                        const isExtra = (mainApp.schoolName || '').includes('추가') || (mainApp.track || '').includes('추가') || (mainApp.status || '').includes('추가');
                        if (isExtra) noteParts.push('[추가모집]');
                        if (priorApps.length > 0) {
                            const priorSummary = priorApps.map(p => {
                                const dept = p.assignedDepartment || (p.preferences && p.preferences[0]) || '';
                                const scoreStr = p.score ? ` (${p.score.toFixed(1)}점)` : '';
                                return `${p.schoolName}${dept ? ' ' + dept : ''}[${p.status || '불합격'}${scoreStr}]`;
                            }).join(', ');
                            noteParts.push(`(전기이력: ${priorSummary})`);
                        }
                        const noteDisplay = noteParts.join(' ');

                        html += `
                        <tr style="height:28px;">
                            <td style="mso-number-format:'\\@';">${idx + 1}</td>
                            <td style="mso-number-format:'\\@';">${studentId}</td>
                            <td style="font-weight:bold;">${escapeHtml(mainApp.studentName || '')}</td>
                            <td style="mso-number-format:'\\@';">${scoreDisplay}</td>
                            <td style="text-align:left;padding-left:6px;">${escapeHtml(schoolDisplay)}</td>
                            <td style="text-align:left;padding-left:6px;">${escapeHtml(deptDisplay)}</td>
                            <td>${escapeHtml(passDisplay)}</td>
                            ${activeApprovals.map(() => `<td></td>`).join('')}
                            <td style="text-align:left;padding-left:6px;font-size:9pt;color:#555;">${escapeHtml(noteDisplay)}</td>
                        </tr>
                        `;
                    });
                }
                html += `</table><br />`;
            });

            html += `</body></html>`;

            const blob = new Blob(['\uFEFF' + html], { type: 'application/vnd.ms-excel;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${admissionYear}학년도_${schoolName}_고입원서대장_${classTag}.xls`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        });

        // 페이지 크기 맞춤 변경 이벤트
        modal.querySelector('#registerPageScaleSelect')?.addEventListener('change', (e) => {
            pageScaleMode = e.target.value;
            renderModalContent();
        });

        // 모드 토글 이벤트 (전교 일괄 vs 학급별 개별)
        modal.querySelector('#modeAllPagedBtn')?.addEventListener('click', () => {
            printLayoutMode = 'all_paged';
            selectedClassFilter = 'all';
            renderModalContent();
        });
        modal.querySelector('#modeSingleClassBtn')?.addEventListener('click', () => {
            printLayoutMode = 'single_class';
            if (selectedClassFilter === 'all') selectedClassFilter = String(classList[0] || 1);
            renderModalContent();
        });

        // 학급 필터 변경 이벤트
        modal.querySelector('#registerClassFilterSelect')?.addEventListener('change', (e) => {
            selectedClassFilter = e.target.value;
            renderModalContent();
        });

        // 결재라인 뱃지 토글 이벤트 (체크 여부가 확실한 선명한 버튼)
        modal.querySelectorAll('.approval-role-badge-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const role = e.currentTarget.dataset.role;
                if (activeApprovals.includes(role)) {
                    activeApprovals = activeApprovals.filter(r => r !== role);
                } else {
                    const order = defaultApprovalCandidates.map(c => c.label);
                    const newSet = new Set([...activeApprovals, role]);
                    activeApprovals = order.filter(r => newSet.has(r));
                }
                try {
                    localStorage.setItem('phgc_register_approvals', JSON.stringify(activeApprovals));
                } catch (err) { }
                renderModalContent();
            });
        });

        // 일반고 배정학교 인라인 수정 & DB 즉시 저장 이벤트
        modal.querySelectorAll('.register-assigned-school-input').forEach(input => {
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
                    const target = records.find(r => r.classNum === cNum && r.studentNum === sNum);
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
    };

    renderModalContent();
}

// 지원 학생 상세 명단 팝업 모달 (지망 뱃지 또는 총 인원수 클릭 시)
export function openApplicantDetailModal(title, students) {
    document.getElementById('applicantDetailModal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'applicantDetailModal';
    modal.className = 'fixed inset-0 bg-black/85 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-150';
    
    // 학급, 번호 순 정렬
    const sorted = [...students].sort((a, b) => (a.classNum - b.classNum) || (parseInt(a.studentNum || 0) - parseInt(b.studentNum || 0)));
    
    const rowsHTML = sorted.map((s, idx) => {
        let statusBadge = '<span class="px-2 py-0.5 rounded text-xs bg-slate-800 text-slate-300">지원예정</span>';
        if (s.status === '지원완료') statusBadge = '<span class="px-2 py-0.5 rounded text-xs bg-indigo-900/60 text-indigo-200 border border-indigo-500/40">지원완료</span>';
        else if (s.status === '합격') statusBadge = '<span class="px-2 py-0.5 rounded text-xs bg-emerald-900/60 text-emerald-300 font-bold border border-emerald-500/40">합격</span>';
        else if (s.status === '불합격') statusBadge = '<span class="px-2 py-0.5 rounded text-xs bg-rose-900/60 text-rose-300 border border-rose-500/40">불합격</span>';
        else if (s.status === '최종 진학' || s.status === '최종진학') statusBadge = '<span class="px-2 py-0.5 rounded text-xs bg-sky-900/60 text-sky-200 font-black border border-sky-400/40">최종진학</span>';

        return `
            <tr class="border-b border-slate-700/60 hover:bg-slate-800/40 text-xs">
                <td class="p-2.5 text-center text-slate-400">${idx + 1}</td>
                <td class="p-2.5 text-center font-bold text-white">${escapeHtml(s.classNum)}반 ${escapeHtml(s.studentNum)}번</td>
                <td class="p-2.5 text-left font-black text-indigo-200 pl-4">${escapeHtml(s.studentName)}</td>
                <td class="p-2.5 text-center font-semibold text-sky-300">${s.prefRank ? `${s.prefRank}지망` : (s.assignedDepartment ? `배정 (${escapeHtml(s.assignedDepartment)})` : '-')}</td>
                <td class="p-2.5 text-right font-mono font-bold text-amber-300 pr-4">${s.score ? s.score.toFixed(2) : '-'}</td>
                <td class="p-2.5 text-center">${statusBadge}</td>
            </tr>
        `;
    }).join('') || '<tr><td colspan="6" class="p-6 text-center text-slate-400">해당 조건의 지원 학생이 없습니다.</td></tr>';

    modal.innerHTML = `
        <div class="glass-card max-w-2xl w-full p-6 border border-indigo-500/40 rounded-3xl shadow-2xl flex flex-col gap-4 text-left animate-in zoom-in-95 duration-150 select-none break-keep-all">
            <div class="flex items-center justify-between border-b border-slate-700/60 pb-3">
                <div class="flex items-center gap-2">
                    <span class="text-xl">👥</span>
                    <h3 class="font-bold text-white text-base">${title}</h3>
                </div>
                <button id="closeApplicantDetailBtn" class="text-slate-400 hover:text-white p-1 rounded-lg text-lg cursor-pointer transition-colors">✕</button>
            </div>
            <div class="overflow-auto max-h-[60vh] border border-slate-700/70 rounded-xl bg-slate-900/50">
                <table class="w-full text-left border-collapse">
                    <thead class="bg-slate-800 sticky top-0 text-slate-400 font-bold text-xs border-b border-slate-700">
                        <tr>
                            <th class="p-2.5 w-12 text-center">번호</th>
                            <th class="p-2.5 w-24 text-center">학급·번호</th>
                            <th class="p-2.5 w-28 text-left pl-4">학생 성명</th>
                            <th class="p-2.5 w-24 text-center">지망구분</th>
                            <th class="p-2.5 w-24 text-right pr-4">내신 점수</th>
                            <th class="p-2.5 w-24 text-center">진행 상태</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHTML}</tbody>
                </table>
            </div>
            <div class="flex justify-between items-center pt-2 border-t border-slate-700/60 text-xs">
                <span class="text-slate-400">조회된 지원자: <b class="text-indigo-300 font-bold">${sorted.length}명</b></span>
                <button id="closeApplicantDetailBottomBtn" class="btn-secondary py-1.5 px-4 text-xs font-bold rounded-xl cursor-pointer">닫기</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    const close = () => modal.remove();
    document.getElementById('closeApplicantDetailBtn').onclick = close;
    document.getElementById('closeApplicantDetailBottomBtn').onclick = close;
}

// 스마트 지원현황 그룹 생성 헬퍼 함수
export function buildSmartApplicationGroups(records) {
    if (!Array.isArray(records) || records.length === 0) return [];

    const categoryLabel = category => ({
        meister: '마이스터고', special: '특성화고', self_foreign: '자사고·외고', general: '후기 일반고', other: '기타', none: '미진학'
    }[category] || category);

    const groupsMap = new Map();

    records.forEach(r => {
        if (!r) return;
        const year = r.admissionYear;
        const cat = r.category || 'general';
        const school = r.schoolName || (cat === 'general' ? '후기 일반고' : '-');
        const track = r.track || (cat === 'general' ? '후기 일반계고' : '일반');

        // 학생의 학과 및 지망 추출
        let items = [];
        if (cat === 'general') {
            const dept = r.assignedSchool ? `[배정고] ${r.assignedSchool}` : '일반계고 공통';
            items.push({ dept, rank: 0 });
        } else {
            // 전기고 (마이스터/특성화): preferences 순회
            if (r.preferences && r.preferences.length > 0) {
                r.preferences.forEach((d, idx) => {
                    if (d && d.trim()) {
                        items.push({ dept: d.trim(), rank: idx + 1 });
                    }
                });
            }
            if (items.length === 0) {
                const dept = r.assignedDepartment || '학교 전체';
                items.push({ dept, rank: 1 });
            }
        }

        items.forEach(({ dept, rank }) => {
            const key = `${year}__${cat}__${school}__${track}__${dept}`;
            if (!groupsMap.has(key)) {
                groupsMap.set(key, {
                    key,
                    admissionYear: year,
                    category: cat,
                    categoryLabel: categoryLabel(cat),
                    schoolName: school,
                    track,
                    department: dept,
                    ranks: {}, // rank -> [student info]
                    allStudents: [],
                    plannedCount: 0,
                    submittedCount: 0,
                    acceptedCount: 0,
                    rejectedCount: 0,
                    finalCount: 0,
                    acceptedScores: [],
                    maxRejectedScore: 0
                });
            }
            const g = groupsMap.get(key);
            const studentInfo = {
                classNum: r.classNum,
                studentNum: r.studentNum,
                studentName: r.studentName,
                prefRank: rank,
                score: r.score,
                status: r.status,
                assignedDepartment: r.assignedDepartment
            };
            if (!g.ranks[rank]) g.ranks[rank] = [];
            g.ranks[rank].push(studentInfo);
            g.allStudents.push(studentInfo);

            if (r.status === '지원희망' || r.status === '지원예정') g.plannedCount++;
            else if (r.status === '지원완료') g.submittedCount++;
            else if (r.status === '합격') {
                g.acceptedCount++;
                if (r.score > 0) g.acceptedScores.push(r.score);
            } else if (r.status === '불합격') {
                g.rejectedCount++;
                if (r.score > g.maxRejectedScore) g.maxRejectedScore = r.score;
            } else if (r.status === '최종 진학' || r.status === '최종진학') {
                g.finalCount++;
                g.acceptedCount++;
                if (r.score > 0) g.acceptedScores.push(r.score);
            }
        });
    });

    // 정렬: 입학년도 역순 -> 학교구분(마이스터, 특성화, 자사고, 일반고) -> 학교명 -> 전형(특별 먼저, 일반) -> 학과명
    const catOrder = { meister: 1, special: 2, self_foreign: 3, general: 4, other: 5, none: 6 };
    const trackOrder = track => (track.includes('특별') || track.includes('취업') ? 1 : 2);

    const list = Array.from(groupsMap.values()).sort((a, b) => {
        if (b.admissionYear !== a.admissionYear) return b.admissionYear - a.admissionYear;
        const ca = catOrder[a.category] || 9, cb = catOrder[b.category] || 9;
        if (ca !== cb) return ca - cb;
        if (a.schoolName !== b.schoolName) return a.schoolName.localeCompare(b.schoolName);
        const ta = trackOrder(a.track), tb = trackOrder(b.track);
        if (ta !== tb) return ta - tb;
        return a.department.localeCompare(b.department);
    });

    return list;
}

// 1. 우리 반 지원희망 모달 (스마트 지망 가로 뱃지 + 학생 명단 팝업 지원)
export async function openClassApplicationSummaryModal(classNum) {
    document.getElementById('classApplicationSummaryModal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'classApplicationSummaryModal';
    modal.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto';
    modal.innerHTML = '<div class="glass-card p-7"><span class="spinner"></span> 우리 반 지원희망을 집계하는 중...</div>';
    document.body.appendChild(modal);

    try {
        const allRecords = await window.go.main.App.GetSchoolApplicationRecords() || [];
        const classRecords = allRecords.filter(r => r.classNum === classNum);
        const smartGroups = buildSmartApplicationGroups(classRecords);

        let rowsHTML = '<tr><td colspan="12" class="p-10 text-center text-text-muted">우리 반에 기록된 지원희망이 없습니다.</td></tr>';
        if (smartGroups.length > 0) {
            let currentSchool = null, currentYear = null;
            const groupedWithRowSpan = [];

            smartGroups.forEach(g => {
                const isSameGroup = currentSchool === g.schoolName && currentYear === g.admissionYear;
                let rowSpanSchool = 0;
                if (!isSameGroup) {
                    currentSchool = g.schoolName;
                    currentYear = g.admissionYear;
                    rowSpanSchool = smartGroups.filter(x => x.schoolName === currentSchool && x.admissionYear === currentYear).length;
                }
                groupedWithRowSpan.push({ ...g, isFirstGroup: !isSameGroup, rowSpanSchool });
            });

            rowsHTML = groupedWithRowSpan.map(g => {
                const schoolCells = g.isFirstGroup ? `
                    <td class="p-3 border-r border-slate-700/50 text-center font-bold text-slate-300" rowspan="${g.rowSpanSchool}">${g.admissionYear}학년도</td>
                    <td class="p-3 border-r border-slate-700/50 text-center font-semibold text-slate-300" rowspan="${g.rowSpanSchool}">${g.categoryLabel}</td>
                    <td class="p-3 border-r border-slate-700/50 font-bold text-white" rowspan="${g.rowSpanSchool}">${g.schoolName}</td>
                ` : '';

                const rankBadges = Object.keys(g.ranks).sort((a, b) => a - b).map(rank => `
                    <button type="button" class="btn-show-class-rank px-2 py-0.5 rounded-md bg-indigo-950/90 hover:bg-indigo-800 text-indigo-200 border border-indigo-500/40 text-[11px] font-semibold transition-colors cursor-pointer"
                            data-group-key="${g.key}" data-rank="${rank}" title="클릭하여 ${rank}지망 학생 명단 보기">
                        ${rank > 0 ? `${rank}지망: ` : ''}<b>${g.ranks[rank].length}명</b>
                    </button>
                `).join('');

                const totalBadge = `
                    <button type="button" class="btn-show-class-all px-2 py-0.5 rounded-md bg-slate-800 hover:bg-slate-700 text-white font-black text-[11px] border border-slate-600 transition-colors cursor-pointer"
                            data-group-key="${g.key}" title="클릭하여 전체 지원 학생 명단 보기">
                        (총 ${g.allStudents.length}명)
                    </button>
                `;

                return `
                    <tr class="border-b border-slate-700/60 hover:bg-slate-800/40 transition-colors text-xs">
                        ${schoolCells}
                        <td class="p-3 font-semibold ${g.track.includes('특별') || g.track.includes('취업') ? 'text-amber-300' : 'text-sky-200'}">${g.track}</td>
                        <td class="p-3 font-bold text-white">${g.department}</td>
                        <td class="p-3">
                            <div class="flex flex-wrap items-center gap-1.5">${rankBadges} ${totalBadge}</div>
                        </td>
                        <td class="p-3 text-center text-cyan-200 font-medium">${g.plannedCount}</td>
                        <td class="p-3 text-center text-indigo-200 font-medium">${g.submittedCount}</td>
                        <td class="p-3 text-center text-emerald-300 font-medium">${g.acceptedCount}</td>
                        <td class="p-3 text-center text-rose-300 font-medium">${g.rejectedCount}</td>
                        <td class="p-3 text-center font-bold text-white">${g.finalCount}</td>
                    </tr>
                `;
            }).join('');
        }

        modal.innerHTML = `
            <div class="glass-card print-document p-7 w-full max-w-6xl select-none break-keep-all">
                <div class="flex justify-between items-start gap-4 mb-5">
                    <div>
                        <h2 class="text-2xl font-bold text-white flex items-center gap-2">📋 ${classNum}반 지원희망 스마트 현황</h2>
                        <p class="text-sm text-text-muted mt-1">지망별 뱃지를 클릭하면 해당 지망으로 지원한 학생 명단을 즉시 확인할 수 있습니다.</p>
                    </div>
                    <div class="no-print flex items-center gap-2">
                        <button id="printClassSummary" class="btn-secondary px-3 py-2 text-sm cursor-pointer">🖨️ 인쇄 / PDF</button>
                        <button id="closeClassApplicationSummary" class="text-3xl text-text-muted hover:text-white cursor-pointer transition-colors">×</button>
                    </div>
                </div>
                <div class="overflow-auto max-h-[70vh] border border-slate-700 rounded-xl bg-slate-900/40">
                    <table class="w-full text-sm">
                        <thead class="sticky top-0 bg-slate-800 border-b border-slate-700">
                            <tr class="text-xs text-slate-400 font-bold">
                                <th class="p-3 border-r border-slate-700/50 w-24">입학년도</th>
                                <th class="p-3 border-r border-slate-700/50 w-24">구분</th>
                                <th class="p-3 border-r border-slate-700/50 w-40 text-left pl-3">학교</th>
                                <th class="p-3 w-28 text-left pl-3">전형</th>
                                <th class="p-3 w-36 text-left pl-3">학과</th>
                                <th class="p-3 text-left pl-3">지망별 지원 분포 (클릭 시 학생 명단)</th>
                                <th class="p-3 w-16 text-center text-cyan-300">예정</th>
                                <th class="p-3 w-16 text-center text-indigo-300">지원</th>
                                <th class="p-3 w-16 text-center text-emerald-300">합격</th>
                                <th class="p-3 w-16 text-center text-rose-300">불합</th>
                                <th class="p-3 w-16 text-center text-white">최종</th>
                            </tr>
                        </thead>
                        <tbody>${rowsHTML}</tbody>
                    </table>
                </div>
                <p class="mt-4 text-xs text-text-muted">* 지망별 뱃지(예: 1지망: 2명)를 누르면 명단이 바로 표시됩니다.</p>
            </div>
        `;
        document.getElementById('closeClassApplicationSummary').onclick = () => modal.remove();
        document.getElementById('printClassSummary').onclick = () => printOnly('summary', 'landscape');

        // 지망 뱃지 클릭 리스너 연결
        modal.querySelectorAll('.btn-show-class-rank').forEach(btn => {
            btn.addEventListener('click', () => {
                const groupKey = btn.dataset.groupKey;
                const rank = parseInt(btn.dataset.rank, 10);
                const group = smartGroups.find(g => g.key === groupKey);
                if (group && group.ranks[rank]) {
                    openApplicantDetailModal(`[${group.schoolName}] ${group.department} (${group.track}) - ${rank}지망 지원자`, group.ranks[rank]);
                }
            });
        });

        // 전체 총원 뱃지 클릭 리스너 연결
        modal.querySelectorAll('.btn-show-class-all').forEach(btn => {
            btn.addEventListener('click', () => {
                const groupKey = btn.dataset.groupKey;
                const group = smartGroups.find(g => g.key === groupKey);
                if (group) {
                    openApplicantDetailModal(`[${group.schoolName}] ${group.department} (${group.track}) - 전체 지원자`, group.allStudents);
                }
            });
        });

    } catch (err) {
        modal.innerHTML = `<div class="glass-card p-7 max-w-lg"><h2 class="text-xl font-bold mb-3">우리 반 지원희망을 불러올 수 없습니다</h2><p class="text-text-muted">${err}</p><button id="closeClassApplicationSummary" class="btn-secondary w-auto px-4 py-2 mt-5">닫기</button></div>`;
        document.getElementById('closeClassApplicationSummary').onclick = () => modal.remove();
    }
}

// 2. 우리 학교 전체 지원현황 모달 (학교-전형-학과 1줄 통합, 스마트 지망 가로 뱃지 + 학생 명단 팝업)
export async function openApplicationSummaryModal() {
    document.getElementById('applicationSummaryModal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'applicationSummaryModal';
    modal.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-start justify-center p-4 sm:p-6 overflow-y-auto';
    modal.innerHTML = '<div class="glass-card p-7 my-auto"><span class="spinner"></span> 우리 학교 지원현황을 집계하는 중...</div>';
    document.body.appendChild(modal);

    const closeModal = () => {
        document.removeEventListener('keydown', handleKeydown);
        modal.remove();
    };
    const handleKeydown = (e) => {
        if (e.key === 'Escape') closeModal();
    };
    document.addEventListener('keydown', handleKeydown);
    modal.onclick = (e) => {
        if (e.target === modal) closeModal();
    };

    try {
        const config = await window.go.main.App.GetSchoolConfig().catch(() => null);
        const recordsResp = await window.go.main.App.GetSchoolApplicationRecords().catch(() => []);
        const allRecords = Array.isArray(recordsResp) ? recordsResp : [];

        const admissionYear = config?.admissionYear || 2026;
        const [closure, review] = await Promise.all([
            window.go.main.App.GetAdmissionClosure(admissionYear).catch(() => null),
            window.go.main.App.GetAdmissionClosureReview(admissionYear).catch(() => null),
        ]);

        const smartGroups = buildSmartApplicationGroups(allRecords);

        let rowsHTML = `
            <tr>
                <td colspan="12" class="p-12 text-center text-text-muted">
                    <span class="text-3xl block mb-2">📝</span>
                    <span class="font-bold text-slate-200 text-sm block">아직 등록된 지원희망 또는 원서접수 학생 데이터가 없습니다.</span>
                    <p class="text-xs text-slate-400 mt-1.5">담임 선생님 화면의 [지원희망 요약] 또는 학생별 1:1 진학 상담 화면에서 고교 지원 희망을 등록하시면 실시간으로 통계가 집계됩니다.</p>
                </td>
            </tr>
        `;
        if (smartGroups.length > 0) {
            let currentSchool = null, currentYear = null;
            const groupedWithRowSpan = [];

            smartGroups.forEach(g => {
                const isSameGroup = currentSchool === g.schoolName && currentYear === g.admissionYear;
                let rowSpanSchool = 0;
                if (!isSameGroup) {
                    currentSchool = g.schoolName;
                    currentYear = g.admissionYear;
                    rowSpanSchool = smartGroups.filter(x => x.schoolName === currentSchool && x.admissionYear === currentYear).length;
                }
                groupedWithRowSpan.push({ ...g, isFirstGroup: !isSameGroup, rowSpanSchool });
            });

            rowsHTML = groupedWithRowSpan.map(g => {
                const schoolCells = g.isFirstGroup ? `
                    <td class="p-3 border-r border-slate-700/50 text-center font-bold text-slate-300" rowspan="${g.rowSpanSchool}">${g.admissionYear}학년도</td>
                    <td class="p-3 border-r border-slate-700/50 text-center font-semibold text-slate-300" rowspan="${g.rowSpanSchool}">${g.categoryLabel}</td>
                    <td class="p-3 border-r border-slate-700/50 font-bold text-white" rowspan="${g.rowSpanSchool}">${g.schoolName}</td>
                ` : '';

                const rankBadges = Object.keys(g.ranks).sort((a, b) => a - b).map(rank => `
                    <button type="button" class="btn-show-school-rank px-2 py-0.5 rounded-md bg-indigo-950/90 hover:bg-indigo-800 text-indigo-200 border border-indigo-500/40 text-[11px] font-semibold transition-colors cursor-pointer"
                            data-group-key="${g.key}" data-rank="${rank}" title="클릭하여 ${rank}지망 학생 명단 보기">
                        ${rank > 0 ? `${rank}지망: ` : ''}<b>${g.ranks[rank].length}명</b>
                    </button>
                `).join('');

                const totalBadge = `
                    <button type="button" class="btn-show-school-all px-2 py-0.5 rounded-md bg-slate-800 hover:bg-slate-700 text-white font-black text-[11px] border border-slate-600 transition-colors cursor-pointer"
                            data-group-key="${g.key}" title="클릭하여 전체 지원 학생 명단 보기">
                        (총 ${g.allStudents.length}명)
                    </button>
                `;

                const scoreDisplay = g.acceptedScores.length > 0 ? `
                    <span class="text-sky-300 font-bold">${Math.max(...g.acceptedScores).toFixed(2)}</span> / 
                    <span class="text-emerald-300 font-bold">${Math.min(...g.acceptedScores).toFixed(2)}</span> / 
                    <span class="text-amber-300 font-semibold">${(g.acceptedScores.reduce((a, b) => a + b, 0) / g.acceptedScores.length).toFixed(2)}</span>
                ` : '-';

                return `
                    <tr class="border-b border-slate-700/60 hover:bg-slate-800/40 transition-colors text-xs">
                        ${schoolCells}
                        <td class="p-3 font-semibold ${g.track.includes('특별') || g.track.includes('취업') ? 'text-amber-300' : 'text-sky-200'}">${g.track}</td>
                        <td class="p-3 font-bold text-white">${g.department}</td>
                        <td class="p-3">
                            <div class="flex flex-wrap items-center gap-1.5">${rankBadges} ${totalBadge}</div>
                        </td>
                        <td class="p-3 text-center text-cyan-200 font-medium">${g.plannedCount}</td>
                        <td class="p-3 text-center text-indigo-200 font-medium">${g.submittedCount}</td>
                        <td class="p-3 text-center text-emerald-300 font-medium">${g.acceptedCount}</td>
                        <td class="p-3 text-center text-rose-300 font-medium">${g.rejectedCount}</td>
                        <td class="p-3 text-center font-bold text-white">${g.finalCount}</td>
                        <td class="p-3 text-right font-mono text-xs pr-3">${scoreDisplay}</td>
                    </tr>
                `;
            }).join('');
        }

        const canApplyCutoffs = window.currentUser?.Role === 'master';
        const closeInfo = closure
            ? `<div class="rounded-xl border border-emerald-400/40 bg-emerald-500/10 p-4"><p class="font-bold text-emerald-200">🔒 ${admissionYear}학년도 입시 결과 확정됨</p><p class="text-xs text-slate-300 mt-1">확정자: ${closure.closedBy || '학년부장'} · 결과 커트라인 ${closure.cutoffsApplied || 0}건 반영됨${closure.note ? ` · 메모: ${closure.note}` : ''}</p></div>`
            : `<div class="rounded-xl border ${review.pendingCount ? 'border-amber-400/40 bg-amber-500/10' : 'border-sky-400/40 bg-sky-500/10'} p-4"><p class="font-bold ${review.pendingCount ? 'text-amber-200' : 'text-sky-200'}">${admissionYear}학년도 결과 확정 전</p><p class="text-xs text-slate-300 mt-1">기록 ${review.totalRecorded}건 · 진행 중 ${review.pendingCount}건 · 합격 ${review.acceptedCount}건 · 불합격 ${review.rejectedCount}건 · 포기 ${review.withdrawnCount}건 · 최종 진학 ${review.finalCount}건</p><p class="text-xs text-slate-400 mt-1">진행 중 기록을 모두 결과 상태로 바꾼 뒤 확정하면 수정이 잠기고, 합격 결과가 우리 학교 커트라인에 자동 반영됩니다.</p></div>`;
        const closeControls = canApplyCutoffs
            ? (closure
                ? '<button id="reopenAdmissionYear" class="btn-secondary w-auto px-4 py-2 text-sm font-medium cursor-pointer">🔓 결과 확정 해제</button>'
                : `<input id="admissionClosureNote" class="input-field w-44 py-2 text-xs" placeholder="확정 메모 (선택)"><button id="closeAdmissionYear" class="btn-primary w-auto px-4 py-2 text-sm font-medium cursor-pointer">🔒 입시 결과 확정</button>`)
            : '';

        modal.innerHTML = `
            <div class="glass-card p-6 sm:p-7 w-full max-w-7xl max-h-[92vh] flex flex-col my-auto shadow-2xl select-none break-keep-all">
                <div class="shrink-0 flex justify-between items-start gap-4 mb-4 pb-3 border-b border-slate-700/60">
                    <div>
                        <h2 class="text-2xl font-bold text-white flex items-center gap-2">📋 우리 학교 지원현황 스마트 통계</h2>
                        <p class="text-sm text-text-muted mt-1">학교-전형-학과별 1줄로 통합되어 지원 경향이 한눈에 파악되며, 지망 뱃지 클릭 시 학생 명단이 팝업됩니다.</p>
                    </div>
                    <div class="flex items-center gap-2">
                        <button id="closeApplicationSummary" class="text-2xl text-slate-400 hover:text-white px-3 py-1 rounded-lg hover:bg-slate-700/50 transition-colors cursor-pointer" title="닫기 (ESC)">✕</button>
                    </div>
                </div>
                <div class="shrink-0 mb-3">${closeInfo}</div>
                <div class="overflow-auto flex-1 min-h-40 border border-slate-700 rounded-xl mb-4 bg-slate-900/40">
                    <table class="w-full text-sm">
                        <thead class="sticky top-0 bg-slate-800 z-10 border-b border-slate-700">
                            <tr class="text-xs text-slate-400 font-bold">
                                <th class="p-3 border-r border-slate-700/50 w-24 text-center">입학년도</th>
                                <th class="p-3 border-r border-slate-700/50 w-24 text-center">구분</th>
                                <th class="p-3 border-r border-slate-700/50 w-44 text-left pl-3">학교</th>
                                <th class="p-3 w-28 text-left pl-3">전형</th>
                                <th class="p-3 w-36 text-left pl-3">학과</th>
                                <th class="p-3 text-left pl-3">지망별 지원 분포 (클릭 시 학생 명단)</th>
                                <th class="p-3 w-16 text-center text-cyan-300">예정</th>
                                <th class="p-3 w-16 text-center text-indigo-300">지원</th>
                                <th class="p-3 w-16 text-center text-emerald-300">합격</th>
                                <th class="p-3 w-16 text-center text-rose-300">불합</th>
                                <th class="p-3 w-16 text-center text-white">최종</th>
                                <th class="p-3 w-36 text-right pr-4 text-amber-300">합격 최고/최저/평균</th>
                            </tr>
                        </thead>
                        <tbody>${rowsHTML}</tbody>
                    </table>
                </div>
                <div class="shrink-0 pt-3 border-t border-slate-700/60 flex flex-wrap justify-between items-center gap-3">
                    <p class="text-xs text-text-muted">* 지망 뱃지(예: 1지망: 3명)를 누르면 해당 지원자들의 점수와 상태가 팝업으로 나타납니다.</p>
                    <div class="flex flex-wrap items-center gap-2">
                        <button id="closeApplicationSummaryBottom" class="btn-secondary w-auto px-4 py-2 text-sm font-bold flex items-center gap-1.5 hover:bg-slate-700 cursor-pointer">← 닫기 (목록으로)</button>
                        <span class="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5 shadow-sm">🔒 100% 오프라인 안전 모드 (외부 유출 원천 차단)</span>
                        ${canApplyCutoffs ? '<button id="applyApplicationCutoffs" class="btn-secondary w-auto px-4 py-2 text-sm cursor-pointer">📈 합격 결과를 우리 학교 커트라인에 반영</button>' : ''}
                        ${closeControls}
                    </div>
                </div>
            </div>`;

        document.getElementById('closeApplicationSummary').onclick = closeModal;
        document.getElementById('closeApplicationSummaryBottom').onclick = closeModal;

        // 지망 뱃지 클릭 리스너 연결
        modal.querySelectorAll('.btn-show-school-rank').forEach(btn => {
            btn.addEventListener('click', () => {
                const groupKey = btn.dataset.groupKey;
                const rank = parseInt(btn.dataset.rank, 10);
                const group = smartGroups.find(g => g.key === groupKey);
                if (group && group.ranks[rank]) {
                    openApplicantDetailModal(`[${group.schoolName}] ${group.department} (${group.track}) - ${rank}지망 지원자`, group.ranks[rank]);
                }
            });
        });

        // 전체 총원 뱃지 클릭 리스너 연결
        modal.querySelectorAll('.btn-show-school-all').forEach(btn => {
            btn.addEventListener('click', () => {
                const groupKey = btn.dataset.groupKey;
                const group = smartGroups.find(g => g.key === groupKey);
                if (group) {
                    openApplicantDetailModal(`[${group.schoolName}] ${group.department} (${group.track}) - 전체 지원자`, group.allStudents);
                }
            });
        });

        document.getElementById('applyApplicationCutoffs')?.addEventListener('click', async () => {
            const confirmed = await showModalConfirm({
                title: '커트라인 반영 확인',
                message: '합격·최종진학 결과의 최고·최저·평균 점수를 우리 학교 커트라인으로 반영할까요?\n기존 같은 연도·학교·전형·학과의 커트라인은 결과값으로 갱신됩니다.',
                confirmText: '반영하기',
                type: 'info'
            });
            if (!confirmed) return;
            try {
                const count = await window.go.main.App.ApplyApplicationCutoffs();
                await showModalAlert(count ? `${count}건의 우리 학교 커트라인을 반영했습니다.` : '반영할 합격 결과가 없습니다.', '반영 완료', 'success');
            } catch (err) { await showModalAlert('커트라인 반영 실패: ' + err, '오류', 'error'); }
        });
        document.getElementById('closeAdmissionYear')?.addEventListener('click', async () => {
            if (review.pendingCount) return await showModalAlert(`진행 중인 기록이 ${review.pendingCount}건 있습니다. 모두 합격·불합격·포기·최종 진학으로 결과를 입력한 뒤 확정해주세요.`, '진행 중 기록 존재', 'warning');
            const confirmed = await showModalConfirm({
                title: '입시 결과 확정',
                message: `${admissionYear}학년도 입시 결과를 확정할까요?\n\n확정하면 해당 연도 지원현황을 수정할 수 없고, 합격 결과의 최고·최저·평균이 우리 학교 커트라인에 자동 반영됩니다.`,
                confirmText: '확정하기',
                type: 'warning'
            });
            if (!confirmed) return;
            try {
                const note = document.getElementById('admissionClosureNote')?.value?.trim() || '';
                const result = await window.go.main.App.CloseAdmissionYear(admissionYear, note);
                await showModalAlert(`${admissionYear}학년도 입시 결과를 확정했습니다.\n커트라인 ${result.cutoffsApplied || 0}건이 반영되었습니다.`, '확정 완료', 'success');
                closeModal();
                openApplicationSummaryModal();
            } catch (err) { await showModalAlert('입시 결과 확정 실패: ' + err, '오류', 'error'); }
        });
        document.getElementById('reopenAdmissionYear')?.addEventListener('click', async () => {
            const confirmed = await showModalConfirm({
                title: '입시 결과 확정 해제',
                message: `${admissionYear}학년도 입시 결과 확정을 해제할까요?\n\n지원현황을 다시 수정할 수 있습니다. 이미 반영된 커트라인은 자동으로 지워지지 않으므로 필요하면 커트라인 관리에서 검토해주세요.`,
                confirmText: '확정 해제',
                type: 'warning'
            });
            if (!confirmed) return;
            try {
                await window.go.main.App.ReopenAdmissionYear(admissionYear);
                await showModalAlert('입시 결과 확정을 해제했습니다.', '해제 완료', 'success');
                closeModal();
                openApplicationSummaryModal();
            } catch (err) { await showModalAlert('입시 결과 확정 해제 실패: ' + err, '오류', 'error'); }
        });
    } catch (err) {
        modal.innerHTML = `
            <div class="glass-card p-7 max-w-lg my-auto text-center">
                <span class="text-3xl block mb-2">📋</span>
                <h2 class="text-xl font-bold mb-2 text-white">우리 학교 지원현황 안내</h2>
                <p class="text-sm text-slate-300 mb-2">아직 등록된 학생 지원현황 데이터가 없거나 집계 중 예외가 발생했습니다.</p>
                <p class="text-xs text-text-muted bg-slate-900/60 p-2.5 rounded-lg border border-slate-700/50 mb-4 break-all">${escapeHtml(String(err))}</p>
                <button id="closeApplicationSummary" class="btn-secondary w-auto px-5 py-2 font-bold cursor-pointer">확인</button>
            </div>
        `;
        document.getElementById('closeApplicationSummary').onclick = closeModal;
    }
}

if (typeof window !== 'undefined') {
    window.openApplicationRegisterModal = openApplicationRegisterModal;
    window.openApplicantDetailModal = openApplicantDetailModal;
    window.buildSmartApplicationGroups = buildSmartApplicationGroups;
    window.openClassApplicationSummaryModal = openClassApplicationSummaryModal;
    window.openApplicationSummaryModal = openApplicationSummaryModal;
}
