import { escapeHtml, escapeAttr } from '../../core/utils.js';
import { admissionLabel } from '../../core/admissionYear.js';
import { buildRegisterEntries } from './registerRows.js';

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

        // 원서대장은 누적 기록: 학생이 지원한 학교마다 한 줄(불합격·합격 각각)을 전형 순서대로 적는다.
        const entries = buildRegisterEntries(ctx, classRecords, currentClass);
        let studentIndex = 0;
        const approvalCellsHTML = ctx.activeApprovals.length > 0
            ? ctx.activeApprovals.map(() => `<td class="border border-black p-0 w-16 text-center" style="${approvalCellHeight}"></td>`).join('')
            : `<td class="border border-black p-0 text-center text-slate-300" style="${approvalCellHeight}">-</td>`;

        const rowsHTML = entries.length > 0 ? entries.map(entry => {
            const { app } = entry;
            const span = entry.applyCount > 1 ? ` rowspan="${entry.applyCount}"` : '';
            if (entry.applyOrder === 1) studentIndex += 1;
            const studentCells = entry.applyOrder === 1 ? `
                        <td class="border border-black font-mono"${span} style="${cellPaddingStyle}">${studentIndex}</td>
                        <td class="border border-black font-mono font-medium"${span} style="${cellPaddingStyle}">${escapeHtml(entry.studentId)}</td>
                        <td class="border border-black font-bold whitespace-nowrap"${span} style="${cellPaddingStyle}">${escapeHtml(app.studentName)}</td>` : '';

            let deptDisplayHTML = escapeHtml(entry.departmentText);
            if (app.category === 'general') {
                deptDisplayHTML = `
                        <div class="flex items-center justify-center gap-1 w-full">
                            <input type="text"
                                   class="register-assigned-school-input font-bold text-indigo-900 border-b border-dashed border-indigo-400 bg-transparent text-left w-full outline-none print:border-none print:text-black print:p-0"
                                   style="border-bottom-style: dashed; ${cellFontSizeStyle} padding: 1px 2px;"
                                   value="${escapeAttr(app.assignedSchool || '')}"
                                   placeholder="배정고 입력(수기)"
                                   data-class="${escapeAttr(app.classNum || currentClass)}"
                                   data-num="${escapeAttr(app.studentNum)}"
                                   data-name="${escapeAttr(app.studentName)}" />
                        </div>
                    `;
            } else if (app.assignedDepartment && entry.departmentText.endsWith('(배정)')) {
                deptDisplayHTML = `<span class="font-semibold">${escapeHtml(app.assignedDepartment)}</span> <span class="text-[10px] text-slate-500 font-normal">(배정)</span>`;
            }

            const resultClass = entry.resultText === '합격' ? 'font-black text-emerald-800 text-xs'
                : (entry.resultText.startsWith('불합격') ? 'font-black text-rose-800 text-xs' : (entry.resultText === '1차 합격' ? 'font-bold text-indigo-800 text-xs' : null))
                || 'text-[11px] text-slate-600 font-medium';
            const scoreClass = entry.scoreText === '별도전형' ? 'text-[10.5px] text-slate-500' : 'font-mono font-medium';

            return `
                    <tr class="text-center text-black font-sans hover:bg-slate-50 print:hover:bg-transparent" style="${cellFontSizeStyle}">
                        ${studentCells}
                        <td class="border border-black ${scoreClass} whitespace-nowrap" style="${cellPaddingStyle}">${escapeHtml(entry.scoreText)}</td>
                        <td class="border border-black font-semibold text-left pl-2.5" style="${cellPaddingStyle}">${escapeHtml(entry.schoolText)}</td>
                        <td class="border border-black text-left pl-2.5" style="${cellPaddingStyle} min-width: 190px;">${deptDisplayHTML}</td>
                        <td class="border border-black" style="${cellPaddingStyle}"><span class="${resultClass} whitespace-nowrap">${escapeHtml(entry.resultText).replace('(', '<br>(')}</span></td>
                        ${approvalCellsHTML}
                        <td class="border border-black text-left pl-2 text-[10.5px] text-slate-700" style="${cellPaddingStyle}">${escapeHtml(entry.noteText)}</td>
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
                                        <th rowspan="2" class="border border-black w-28" style="${tableHeaderPadding}">내신·1차 점수<br><span class="text-[10px] font-normal">(취득점/만점)</span></th>
                                        <th rowspan="2" class="border border-black w-48" style="${tableHeaderPadding}">지원고등학교</th>
                                        <th rowspan="2" class="border border-black text-center" style="${tableHeaderPadding} min-width: 190px;">
                                            지원학과(전기: 1지망·배정학과)<br>
                                             또는 배정학교(후기고)
                                        </th>
                                        <th rowspan="2" class="border border-black p-2 w-16 whitespace-nowrap">
                                            합격<br>여부
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
