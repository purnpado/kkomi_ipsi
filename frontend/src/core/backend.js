// ===== 화면 모듈용 백엔드 함수 (Wails v3 생성 바인딩 + 오류 문자열 정규화) =====
// 예전 `frontend/wailsjs/go/main/App` 에서 가져다 쓰던 함수들을 같은 이름으로 제공한다.
// 새 코드는 `window.go.main.App.메서드()` 또는 여기서 이름 있는 함수를 가져다 쓴다.
import { callBackend } from './wailsBridge.js';

export const CheckSetupComplete = (...args) => callBackend('CheckSetupComplete', ...args);
export const GetSchoolConfig = (...args) => callBackend('GetSchoolConfig', ...args);
export const GetClassStatus = (...args) => callBackend('GetClassStatus', ...args);
export const GetAppVersion = (...args) => callBackend('GetAppVersion', ...args);
export const VerifyAdminPassword = (...args) => callBackend('VerifyAdminPassword', ...args);
export const SyncWithServer = (...args) => callBackend('SyncWithServer', ...args);
