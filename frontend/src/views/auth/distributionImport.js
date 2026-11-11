// ===== 학년부장 배포자료 가져오기 (기존 학급 자료 보존) =====
// 로그인 화면과 첫 실행 화면이 함께 쓰는 흐름이다.
// - 이 PC에 기존 학급 자료가 없으면: 배포자료만 적용한다.
// - 있으면: 공용 데이터 암호(또는 본인 비밀번호)를 받아 상담 일지·지원현황·수기 비교과를 새 배포자료로 옮긴다.
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

    const result = await App.OpenDistributionPackageWithPassword(password);
    if (!result || !result.username) return null;
    const parts = [];
    if (result.preservedClasses > 0) {
        parts.push(`기존 자료를 새 배포자료로 옮겼습니다: 상담 일지 ${result.counsels}건, 지원현황 ${result.applications}건, 직접 입력한 출결·봉사·가산점 ${result.overrides}명`);
    } else {
        parts.push('옮길 기존 상담 일지·지원현황이 없었습니다.');
    }
    if ((result.unrestoredClasses || []).length > 0) {
        parts.push(`이번 배포자료에 없는 학급(${result.unrestoredClasses.join(', ')}반)의 기존 자료는 백업 폴더에만 남았습니다.`);
    }
    return { username: result.username, summary: parts.join('\n') };
}
