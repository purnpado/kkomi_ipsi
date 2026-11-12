// ===== 나이스 자료·학년도 관리 화면 (app:navigate 'admin', 학년부장 전용) =====
// 화면 구성은 manage/manageLayout.js, 나이스 올리기는 manage/neisUpload.js,
// 학년도 버튼은 yearControls.js·admissionYearNotice.js, 인수인계 버튼은 handoverControls.js 가 맡는다.
import { GetSchoolConfig, GetClassStatus } from '../../core/backend.js';
import { updateAppWindowTitle } from '../../core/utils.js';
import { ScreenLockManager } from '../../core/screenLock.js';
import { app } from '../../core/dom.js';
import { navigate } from '../../core/navigation.js';
import { state } from '../../core/store.js';
import { renderAdmissionYearNotice } from './admissionYearNotice.js';
import { bindYearControls } from './yearControls.js';
import { bindHandoverControls } from './handoverControls.js';
import { manageHTML } from './manage/manageLayout.js';
import { bindNeisUploads } from './manage/neisUpload.js';

export async function renderAdminScreen(schoolName) {
    // 나이스 자료·학년도 관리는 학년부장만 쓴다. 다른 역할은 대시보드로 보낸다.
    if (state.currentUser && state.currentUser.Role !== 'master') {
        return navigate('home', { schoolName });
    }

    let classCount = 8;
    let configuredYear = 0;
    try {
        const config = await GetSchoolConfig();
        classCount = config.classCount;
        configuredYear = config.admissionYear;
    } catch (e) {
        console.error('설정 불러오기 실패:', e);
    }

    let status = {};
    let updateStatus = {};
    try {
        status = await GetClassStatus(classCount);
        updateStatus = (await window.go?.main?.App?.GetDataUpdateStatus?.()) || {};
    } catch (e) {
        console.error('상태 불러오기 실패:', e);
    }

    app.className = 'wide-layout';
    updateAppWindowTitle('master');
    app.innerHTML = manageHTML({ schoolName, classCount, configuredYear, status, updateStatus });

    ScreenLockManager.resetTimer();
    const rerender = () => renderAdminScreen(schoolName);
    // 고입 연도 안내 띠(지난 연도로 설정된 경우)와 [고입 연도 변경] 버튼
    renderAdmissionYearNotice(document.getElementById('manageScreen'), configuredYear, schoolName);
    bindYearControls({ schoolName, classCount, rerender });
    bindHandoverControls({ rerender });
    bindNeisUploads({ totalStudents: updateStatus.totalStudents || 0, rerender });
    document.getElementById('refreshBtn')?.addEventListener('click', rerender);
    return undefined;
}
