// 학년부장 화면: 인수인계 파일 내보내기 · 지난 학년도 입시 자료 가져오기
// 인수인계 파일에는 학생 개인정보가 없다(커트라인·결과 확정·지난 입시 결과(익명)·관내 공유 자료·정원·판정 기준).
// 해마다 새로 설치한 프로그램에서 받아 들이고, 그해 결과를 더해 다시 내보내면 누적된다.
import { showModalAlert, showModalConfirm, showModalPrompt } from '../../core/dialogs.js';
import { loadJudgmentSettings } from '../../core/admissionJudgment.js';
import { notifyStatsRecalculated } from '../../core/navigation.js';

async function askNewPassword() {
    const password = await showModalPrompt({
        title: '인수인계 파일 암호',
        message: '인수인계 파일을 보호할 암호를 입력하세요.\n다음 학년도 학년부장에게 파일과 함께 이 암호를 전달하세요.',
        isPassword: true
    });
    if (!password) return '';
    const again = await showModalPrompt({ title: '암호 재확인', message: '암호를 한 번 더 입력하세요.', isPassword: true });
    if (password !== again) {
        await showModalAlert('암호가 일치하지 않습니다.', '입력 불일치', 'warning');
        return '';
    }
    return password;
}

export function bindHandoverControls({ rerender }) {
    document.getElementById('handoverExportBtn')?.addEventListener('click', async () => {
        const password = await askNewPassword();
        if (!password) return;
        try {
            const r = await window.go.main.App.SaveHandoverPackage(password);
            if (!r?.path) return;
            const warn = r.currentYearClosed ? '' : '\n\n⚠️ 올해 입시 결과가 아직 확정되지 않았습니다. 결과가 나온 원서만 담았습니다. 결과 확정 후 다시 만들면 올해 자료가 빠짐없이 들어갑니다.';
            await showModalAlert(`인수인계 파일을 만들었습니다.\n${r.path}\n\n지난 입시 결과 ${r.years}개 학년도(${r.historyRecords}건) · 관내 공유 자료 ${r.sharedPackages}건 포함 · 학생 개인정보 없음${warn}`, '인수인계 파일 완료', 'success');
        } catch (err) {
            await showModalAlert('인수인계 파일 만들기 실패: ' + err, '오류', 'error');
        }
    });

    document.getElementById('handoverImportBtn')?.addEventListener('click', async () => {
        try {
            const path = await window.go.main.App.OpenPreviousYearFile();
            if (!path) return;
            const legacy = await window.go.main.App.IsLegacyArchivePath(path);
            const password = await showModalPrompt({
                title: legacy ? '이전 버전 최종 보관본 암호' : '인수인계 파일 암호',
                message: legacy ? '최종 보관본을 만들 때 정한 보관본 암호를 입력하세요.' : '인수인계 파일 암호를 입력하세요.',
                isPassword: true
            });
            if (!password) return;
            let previousShared = '';
            if (legacy) {
                previousShared = await showModalPrompt({
                    title: '그해 공용 데이터 암호',
                    message: '이전 버전 최종 보관본은 그 학년도의 공용 데이터 암호로 한 번 더 잠겨 있습니다.\n보관본을 만든 해의 공용 데이터 암호를 입력하세요.\n(학생 이름·성적·상담 일지·계정은 가져오지 않고 입시 자료만 익명으로 꺼냅니다)',
                    isPassword: true
                });
                if (!previousShared) return;
            }
            const includeJudgment = await showModalConfirm({
                title: '판정 기준도 가져올까요?',
                message: '작년 학년부장이 정한 4단계 판정 기준(여유폭·후기고 안정선)도 가져올까요?\n이미 올해 판정 기준을 정했다면 바뀌지 않습니다.',
                confirmText: '함께 가져오기',
                cancelText: '가져오지 않음',
                type: 'info'
            });
            const r = await window.go.main.App.ImportPreviousYearData(path, password, previousShared, includeJudgment);
            if (r.judgmentImported) await loadJudgmentSettings();
            notifyStatsRecalculated({ reason: 'handover-import' });
            const years = (r.years || []).map(y => `${y} 고입`).join(', ') || '없음';
            const open = r.currentYearOpen ? '\n⚠️ 보낸 쪽의 마지막 학년도 결과가 확정 전이었습니다. 빠진 결과가 있을 수 있습니다.' : '';
            await showModalAlert(`${r.schoolName} 입시 자료를 가져왔습니다.\n\n학년도: ${years}\n지난 입시 결과 ${r.historyRecords}건 · 커트라인 ${r.cutoffs}건 · 결과 확정 ${r.closures}건 · 관내 공유 ${r.sharedPackages}건(이미 있어 건너뜀 ${r.sharedSkipped}건) · 후기고 정원 ${r.quotas}건 · 공식 경쟁률 ${r.competition || 0}건${open}\n\n작년 프로그램 폴더와 작년 담임 PC의 배포자료 폴더에는 학생 개인정보가 남아 있습니다. 보관 기간이 지나면 삭제해 주세요.`, '가져오기 완료', 'success');
            rerender();
        } catch (err) {
            await showModalAlert('지난 학년도 입시 자료 가져오기 실패: ' + err, '오류', 'error');
        }
    });
}
