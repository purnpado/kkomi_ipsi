// ===== 학년부장 배포자료 가져오기 (기존 학급 자료 보존) =====
// 로그인 화면과 첫 실행 화면이 함께 쓰는 흐름이다.
// - 이 PC에 기존 학급 자료가 없으면: 배포자료만 적용한다.
// - 있으면: 공용 데이터 암호(또는 본인 비밀번호)를 받아 상담 일지·수기 비교과를 새 배포자료로 옮긴다.
//   원서는 학년부장 최종본(새 배포자료)을 따른다. 아직 제출하지 않은 원서가 있으면 먼저 확인받는다.
//   암호 입력을 취소하면, 기존 자료는 백업 폴더에만 남는다는 점을 확인받은 뒤 배포자료만 적용한다.
import { showModalConfirm, showModalPrompt } from '../../core/dialogs.js';

/**
 * @returns {Promise<{username: string, summary: string} | null>} 취소하면 null
 */
export async function importDistributionWithPreservation() {
    const App = window.go.main.App;
    const needsPassword = await App.DistributionImportNeedsPassword().catch(() => false);
    if (!needsPassword) {
        const username = await App.OpenDistributionPackage();
        return username ? { username, summary: '' } : null;
    }

    const password = await showModalPrompt({
        title: '기존 학급 자료 옮기기',
        message: '이 PC에 기존 학급 자료(상담 일지·지원현황·직접 입력한 출결/봉사)가 있습니다.\n새 배포자료로 함께 옮기려면 공용 데이터 암호 또는 본인 비밀번호를 입력하세요.',
        placeholder: '공용 데이터 암호 또는 본인 비밀번호',
        isPassword: true
    });
    if (!password) {
        const skip = await showModalConfirm({
            title: '기존 자료를 옮기지 않고 가져오기',
            message: '암호 없이 가져오면 기존 상담 일지·지원현황은 새 화면에 나타나지 않고\ndata/backup_before_pkg_import 폴더에 백업본으로만 남습니다.\n\n그래도 배포자료만 적용할까요?',
            confirmText: '배포자료만 적용',
            type: 'warning'
        });
        if (!skip) return null;
        const username = await App.OpenDistributionPackage();
        return username ? { username, summary: '기존 학급 자료는 옮기지 않았습니다(백업 폴더에 보관).' } : null;
    }

    let result = await App.OpenDistributionPackageWithPassword(password);
    if (result && result.pendingConfirm) {
        // 학년부장 PC가 최종본: 원서는 새 배포자료를 따른다. 아직 내지 않은 원서가 있으면 먼저 묻는다.
        const go = await showModalConfirm({
            title: '아직 제출하지 않은 원서가 있습니다',
            message: `이 PC에서 고치거나 지운 원서 ${result.unsubmittedApplications}건이 아직 학년부장에게 제출되지 않았습니다.\n\n새 배포자료(학년부장 최종본)를 가져오면 원서는 학년부장 자료로 맞춰지고, 이 원서들은 data/backup_before_pkg_import 폴더의 백업에만 남습니다.\n\n먼저 [취합자료 제출]로 학년부장에게 보내는 것을 권합니다. 그래도 지금 가져올까요?`,
            confirmText: '그래도 가져오기',
            type: 'warning'
        });
        if (!go) return null;
        result = await App.ImportDistributionPackageConfirmed(result.path, password);
    }
    if (!result || !result.username) return null;
    const parts = [];
    if (result.preservedClasses > 0) {
        parts.push(`기존 자료를 새 배포자료로 옮겼습니다: 상담 일지 ${result.counsels}건, 직접 입력한 출결·봉사·가산점 ${result.overrides}명`);
        parts.push('원서(지원현황)는 학년부장 최종본(새 배포자료)으로 맞췄습니다.');
    } else {
        parts.push('옮길 기존 상담 일지·지원현황이 없었습니다.');
    }
    if ((result.unrestoredClasses || []).length > 0) {
        parts.push(`이번 배포자료에 없는 학급(${result.unrestoredClasses.join(', ')}반)의 기존 자료는 백업 폴더에만 남았습니다.`);
    }
    return { username: result.username, summary: parts.join('\n') };
}
