// ===== 나이스 엑셀 올리기 (교과 성적·출결·봉사) =====
// 세 단계가 같은 흐름(파일 여러 개 고르기 → 분석·저장 → 결과 표시 → 화면 다시 그리기)이라 하나로 묶었다.
import { showModalAlert } from '../../../core/dialogs.js';
import { loadTransferStudents } from '../../../core/transferBadges.js';

export const NEIS_STEPS = [
    {
        no: 1, key: 'grades', buttonId: 'uploadExcelBtn', required: true,
        label: '교과 성적', desc: '학생 명단과 학기별 교과 성적. 가장 먼저 올립니다.',
        dialogTitle: '나이스 교과 성적 엑셀 파일 선택 (Ctrl 또는 Shift 키로 모든 반 파일 동시 선택 가능)',
        process: (paths) => window.go.main.App.ProcessMultipleExcel(paths),
        done: (files, classes, students) => `총 ${files}개 파일에서 ${classes}개 학급, ${students}명의 성적을 저장했습니다.`
    },
    {
        no: 2, key: 'attendance', buttonId: 'uploadAttendanceBtn',
        label: '출결 현황', desc: '결석·지각·조퇴·결과. 교과 성적을 올린 뒤에 올립니다.',
        dialogTitle: '나이스 출결 현황 엑셀 파일 선택 (Ctrl 또는 Shift 키로 모든 반 파일 동시 선택 가능)',
        process: (paths) => window.go.main.App.ProcessMultipleAttendanceExcel(paths),
        done: (files, classes, students) => `총 ${files}개 파일에서 ${classes}개 학급, ${students}명 출결을 연동했습니다.`
    },
    {
        no: 3, key: 'volunteer', buttonId: 'uploadVolunteerBtn',
        label: '봉사활동', desc: '학년별 봉사 시간. 교과 성적을 올린 뒤에 올립니다.',
        dialogTitle: '나이스 봉사활동 엑셀 파일 선택 (Ctrl 또는 Shift 키로 모든 반 파일 동시 선택 가능)',
        process: (paths) => window.go.main.App.ProcessMultipleVolunteerExcel(paths),
        done: (files, classes, students) => `총 ${files}개 파일에서 ${classes}개 학급, ${students}명 봉사를 연동했습니다.`
    }
];

function showStatus(text, tone) {
    const el = document.getElementById('uploadStatus');
    if (!el) return;
    const tones = { busy: 'text-warning', ok: 'text-success', error: 'text-danger break-all' };
    el.className = `mt-3 text-sm text-center font-bold ${tones[tone] || ''}`;
    el.textContent = text;
}

/**
 * @param {{ totalStudents: number, rerender: () => void }} options
 */
export function bindNeisUploads({ totalStudents, rerender }) {
    NEIS_STEPS.forEach((step) => {
        const button = document.getElementById(step.buttonId);
        button?.addEventListener('click', async () => {
            if (step.no > 1 && totalStudents === 0) {
                await showModalAlert('1단계 [교과 성적 엑셀]을 먼저 불러와 학생 명단을 생성해 주세요.', '사전 필수 작업', 'warning');
                return;
            }
            const stateEl = button.querySelector('.neis-step-state');
            const idleText = stateEl?.textContent || '';
            try {
                const paths = await window.go.main.App.OpenMultipleExcelFiles(step.dialogTitle);
                if (!paths || paths.length === 0) return;
                button.disabled = true;
                if (stateEl) stateEl.innerHTML = `<span class="spinner"></span>${paths.length}개 반 분석 중...`;
                showStatus(`고른 ${paths.length}개 파일의 ${step.label} 자료를 분석·저장하는 중입니다...`, 'busy');
                const result = await step.process(paths);
                const classes = Object.keys(result || {}).length;
                const students = Object.values(result || {}).reduce((a, b) => a + b, 0);
                showStatus(step.done(paths.length, classes, students), 'ok');
                // 교과 성적을 새로 올리면 비고의 전입 표시도 다시 읽는다.
                if (step.key === 'grades') await loadTransferStudents();
                setTimeout(rerender, 1200);
            } catch (err) {
                showStatus(`${step.label} 올리기 오류: ${err}`, 'error');
            } finally {
                button.disabled = false;
                if (stateEl && stateEl.querySelector('.spinner')) stateEl.textContent = idleText;
            }
        });
    });
}
