import { escapeHtml, escapeAttr } from '../../core/utils.js';
import { admissionLabel } from '../../core/admissionYear.js';

// 원서대장: 결재란과 학급별 대장 페이지 HTML 구성
export function buildRegisterPages(ctx, reg) {
    const approvalHeadersHTML = ctx.activeApprovals.length > 0
        ? ctx.activeApprovals.map(role => `<th class="border border-black bg-slate-100 font-bold w-16 text-center tracking-tight" style="padding: 4px 2px;">${role}</th>`).join('')
        : '<th class="border border-black bg-slate-100 font-normal p-1 text-slate-400 text-[11px]">-</th>';

    reg.targetClasses = (ctx.printLayoutMode === 'single_class' && ctx.selectedClassFilter !== 'all')
        ? [parseInt(ctx.selectedClassFilter, 10)]
        : (ctx.classList.length > 0 ? ctx.classList : [1]);

    reg.documentPagesHTML = reg.targetClasses.map((currentClass, pageIdx) => {
        const classRecords = ctx.records.filter(r => r.classNum === currentClass).sort((a, b) => {
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

        const effectiveScale = (ctx.pageScaleMode === 'auto')
            ? (studentCount >= 26 ? 'ultra' : (studentCount >= 21 ? 'compact' : 'standard'))
            : ctx.pageScaleMode;

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
                const maxVal = ctx.getSchoolTotalMaxString(mainApp.schoolName, mainApp.category);
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

            const approvalCellsHTML = ctx.activeApprovals.length > 0
                ? ctx.activeApprovals.map(() => `<td class="border border-black p-0 w-16 text-center" style="${approvalCellHeight}"></td>`).join('')
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
                    <td colspan="${8 + Math.max(1, ctx.activeApprovals.length)}" class="border border-black p-10 text-center text-slate-400 font-medium">
                        ${currentClass}반에 등록된 지원 학생 자료가 없습니다.
                    </td>
                </tr>
            `;

        const pageBreakClass = (pageIdx > 0 && ctx.printLayoutMode === 'all_paged') ? 'print:break-before-page' : '';

        return `
                <div class="print-document bg-white text-black p-6 sm:p-8 md:p-10 shadow-2xl rounded-sm w-full flex flex-col justify-between select-text ${pageBreakClass}" 
                     style="font-family: 'Batang', 'Nanum Myeongjo', 'Malgun Gothic', serif; max-width: 1300px; min-height: 820px; margin-bottom: 2rem; ${pageIdx > 0 && ctx.printLayoutMode === 'all_paged' ? 'page-break-before: always;' : ''}">
                    <div>
                        <div class="text-center my-3 sm:my-4">
                            <h1 class="text-3xl sm:text-4xl font-black tracking-[0.6em] inline-block pb-1" style="letter-spacing: 0.6em;">
                                고 입 원 서 대 장
                            </h1>
                        </div>

                        <div class="flex items-end justify-between font-bold text-sm sm:text-base mb-2 px-1">
                            <div class="tracking-wider flex items-center gap-3">
                                <span>${ctx.admissionYear - 1}학년도</span>
                                <span class="text-xs font-semibold">(${admissionLabel(ctx.admissionYear)})</span>
                                <span class="text-indigo-900 font-black bg-indigo-50 px-2.5 py-0.5 rounded border border-indigo-200 print:border-black print:bg-transparent">
                                    제 3학년 ${currentClass}반
                                </span>
                            </div>
                            <div class="tracking-widest text-base sm:text-lg">
                                ${ctx.schoolName}
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
                                        <th colspan="${Math.max(1, ctx.activeApprovals.length)}" class="border border-black p-1 text-center font-bold">
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
                        <span>${ctx.schoolName} 3학년 진학상담시스템</span>
                    </div>
                </div>
            `;
    }).join('');
}
