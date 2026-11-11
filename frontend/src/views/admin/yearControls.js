// 학년부장 화면: 학급 수 변경 · 새 학년 시작 · 전체 초기화 버튼
import { showModalAlert, showModalConfirm, showModalPrompt } from '../../core/dialogs.js';
import { admissionLabel, admissionLongLabel, admissionYearHint, currentAdmissionYear } from '../../core/admissionYear.js';

export function bindYearControls({ schoolName, classCount, rerender }) {
    document.getElementById('changeClassCountBtn')?.addEventListener('click', async () => {
        const value = await showModalPrompt({
            title: '학급 수 변경',
            message: `3학년 학급 수를 입력하세요. (지금 ${classCount}개 반)\n늘어난 반은 담임 계정(예: 3${String(classCount + 1).padStart(2, '0')})을 새로 만들고, 줄어든 반의 담임 계정은 정리합니다.\n학생 자료는 지우지 않습니다.`,
            defaultValue: String(classCount),
            placeholder: String(classCount)
        });
        if (!value) return;
        const n = parseInt(value, 10);
        if (!Number.isInteger(n) || n < 1 || n > 30) {
            await showModalAlert('학급 수는 1~30 사이의 숫자로 입력해주세요.', '입력 확인', 'warning');
            return;
        }
        try {
            await window.go.main.App.UpdateClassCount(n);
            await showModalAlert(`${n}개 반으로 바꾸었습니다. 늘어난 반 담임에게는 배포자료를 새로 만들어 주세요.`, '변경 완료', 'success');
            rerender();
        } catch (err) {
            await showModalAlert('학급 수 변경 실패: ' + err, '오류', 'error');
        }
    });

    document.getElementById('resetYearBtn')?.addEventListener('click', async () => {
        const nextYear = await showModalPrompt({
            title: '새 학년 시작 (학생 자료 초기화)',
            message: `학생 성적·출결·봉사 자료를 비우고 새로 시작할 고입 학년도를 입력하세요.\n${admissionYearHint(currentAdmissionYear())}\n\n※ 학생 자료를 지우지 않으려면 [고입 연도 변경]을 사용하세요.`,
            defaultValue: String(currentAdmissionYear()),
            placeholder: String(currentAdmissionYear())
        });
        if (!nextYear) return;
        const nextClassCount = await showModalPrompt({
            title: '새 학년 학급 수',
            message: `새 학년도의 3학년 학급 수를 입력하세요. (지금 ${classCount}개 반)\n늘어난 반은 담임 계정을 새로 만들고, 줄어든 반의 담임 계정은 정리합니다.`,
            defaultValue: String(classCount),
            placeholder: String(classCount)
        });
        if (!nextClassCount) return;
        const newClassCount = parseInt(nextClassCount, 10);
        if (!Number.isInteger(newClassCount) || newClassCount < 1 || newClassCount > 30) {
            await showModalAlert('학급 수는 1~30 사이의 숫자로 입력해주세요.', '입력 확인', 'warning');
            return;
        }

        const confirmed = await showModalConfirm({
            title: '새 학년 시작 확인',
            message: `[${admissionLongLabel(parseInt(nextYear))}] · ${newClassCount}개 반으로 전환하시겠습니까?\n\n※ 고교별 커트라인·결과 확정 기록·관내 공유 자료는 보존되고, 지난 학년도 학생·원서 자료는 data\\backup_new_year 폴더로 옮겨집니다.`,
            confirmText: '전환하기',
            type: 'warning'
        });
        if (confirmed) {
            try {
                await window.go.main.App.StartNewAcademicYear(parseInt(nextYear), newClassCount);
                await showModalAlert(`${admissionLabel(parseInt(nextYear))}으로 전환되었습니다!`, '전환 완료', 'success');
                rerender();
            } catch (err) {
                await showModalAlert("새 학년 시작 실패: " + err, '오류', 'error');
            }
        }
    });

    document.getElementById('resetDataBtn')?.addEventListener('click', async () => {
        const confirmed = await showModalConfirm({
            title: '전체 데이터 초기화',
            message: "정말 모든 데이터를 완전 초기화하시겠습니까?\n학교 설정과 업로드된 모든 성적 파일이 삭제되며 되돌릴 수 없습니다.",
            confirmText: '완전 초기화',
            type: 'error'
        });
        if (confirmed) {
            try {
                await window.go.main.App.ResetAllData();
                await showModalAlert("모든 데이터가 초기화되었습니다. 프로그램이 재시작됩니다.", '초기화 완료', 'success');
                window.location.reload();
            } catch (err) {
                await showModalAlert("데이터 초기화 실패: " + err, '오류', 'error');
            }
        }
    });

}
