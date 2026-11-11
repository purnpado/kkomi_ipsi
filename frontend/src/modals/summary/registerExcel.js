import { escapeHtml } from '../../core/utils.js';
import { admissionLabel } from '../../core/admissionYear.js';
import { buildRegisterEntries } from './registerRows.js';

// 원서대장: 엑셀 내보내기
export function bindRegisterExcelExport(ctx, reg) {
    // 원서대장 엑셀 다운로드 (.xls 스프레드시트 포맷)
    ctx.modal.querySelector('#exportRegisterExcelBtn')?.addEventListener('click', () => {
        const classTag = (ctx.printLayoutMode === 'single_class' && ctx.selectedClassFilter !== 'all') ? `${ctx.selectedClassFilter}반` : '전체';
        const totalCols = 7 + Math.max(1, ctx.activeApprovals.length) + 1;

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

        reg.targetClasses.forEach((currentClass, pIdx) => {
            if (pIdx > 0) {
                html += `<br style="mso-data-placement:same-cell;" /><br /><hr /><br />`;
            }

            const classRecords = ctx.records.filter(r => r.classNum === currentClass).sort((a, b) => {
                const numA = parseInt(a.studentNum, 10) || 0;
                const numB = parseInt(b.studentNum, 10) || 0;
                return numA - numB;
            });

            const entries = buildRegisterEntries(ctx, classRecords, currentClass);

            html += `
                <table>
                    <tr><td colspan="${totalCols}" class="title" style="height:45px;">고 입 원 서 대 장</td></tr>
                    <tr>
                        <td colspan="4" class="meta" style="text-align:left;height:30px;">
                            ${ctx.admissionYear - 1}학년도 제 3학년 ${currentClass}반 (${admissionLabel(ctx.admissionYear)})
                        </td>
                        <td colspan="${totalCols - 4}" class="meta" style="text-align:right;">
                            학교명: ${escapeHtml(ctx.schoolName)}
                        </td>
                    </tr>
                    <tr>
                        <td colspan="${totalCols - ctx.activeApprovals.length}" style="border:none;"></td>
                        ${ctx.activeApprovals.map(role => `<td class="th-header" style="width:70px;height:24px;">${escapeHtml(role)}</td>`).join('')}
                    </tr>
                    <tr>
                        <td colspan="${totalCols - ctx.activeApprovals.length}" style="border:none;"></td>
                        ${ctx.activeApprovals.map(() => `<td style="height:50px;"></td>`).join('')}
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
                        ${ctx.activeApprovals.map(role => `<th style="width:65px;">${escapeHtml(role)}</th>`).join('')}
                        <th style="width:200px;">비고</th>
                    </tr>
                `;

            if (entries.length === 0) {
                html += `<tr><td colspan="${totalCols}" style="height:40px;color:#888;">등록된 학생 데이터가 없습니다.</td></tr>`;
            } else {
                // 누적 기입: 지원한 학교마다 한 줄씩(불합격·합격 각각) 적고 학생 칸은 병합한다.
                let studentIndex = 0;
                entries.forEach(entry => {
                    const { app } = entry;
                    const span = entry.applyCount > 1 ? ` rowspan="${entry.applyCount}"` : '';
                    if (entry.applyOrder === 1) studentIndex += 1;
                    const studentCells = entry.applyOrder === 1 ? `
                            <td${span} style="mso-number-format:'\\@';">${studentIndex}</td>
                            <td${span} style="mso-number-format:'\\@';">${entry.studentId}</td>
                            <td${span} style="font-weight:bold;">${escapeHtml(app.studentName || '')}</td>` : '';
                    const deptDisplay = app.category === 'general' ? (entry.departmentText || '배정고 미입력') : entry.departmentText;
                    html += `
                        <tr style="height:28px;">
                            ${studentCells}
                            <td style="mso-number-format:'\\@';">${escapeHtml(entry.scoreText)}</td>
                            <td style="text-align:left;padding-left:6px;">${escapeHtml(entry.schoolText)}</td>
                            <td style="text-align:left;padding-left:6px;">${escapeHtml(deptDisplay)}</td>
                            <td>${escapeHtml(entry.resultText)}</td>
                            ${ctx.activeApprovals.map(() => `<td></td>`).join('')}
                            <td style="text-align:left;padding-left:6px;font-size:9pt;color:#555;">${escapeHtml(entry.noteText)}</td>
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
        link.download = `${ctx.admissionYear}고입_${ctx.schoolName}_고입원서대장_${classTag}.xls`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    });
}
