import { escapeHtml } from '../../core/utils.js';

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
                            ${ctx.admissionYear}학년도 제 3학년 ${currentClass}반
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
                        const maxVal = ctx.getSchoolTotalMaxString(mainApp.schoolName, mainApp.category);
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
                            ${ctx.activeApprovals.map(() => `<td></td>`).join('')}
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
        link.download = `${ctx.admissionYear}학년도_${ctx.schoolName}_고입원서대장_${classTag}.xls`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    });
}
