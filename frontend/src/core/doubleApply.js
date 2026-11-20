// ===== 이중지원 금지 (화면) =====
// 그 학년도에 합격·최종 진학·등록 포기 원서가 있는 학생은 새 원서를 넣을 수 없다.
// 원서는 접수 뒤 반려되지 않고, "포기"는 합격 뒤 등록을 포기한 경우다(미진학과 다름).
// 이미 있는 원서는 고칠 수 있고, 결과가 "불합격"인 지난 원서는 새로 기록할 수 있다.
// 같은 규칙을 백엔드 저장(internal/database/application_lock.go)도 확인한다.
import { displaySchool } from './schoolName.js';

const LOCK_STATUSES = new Set(['합격', '최종 진학', '포기']);

/** 그 학년도의 잠금 원서(합격·최종 진학·포기). 없으면 null. */
export function findApplicationLock(apps, year) {
    return (apps || []).find((a) => Number(a.admissionYear) === Number(year) && a.category !== 'none' && LOCK_STATUSES.has(a.status)) || null;
}

/** "울산공업고등학교 합격"처럼 잠금 이유. */
export function lockLabel(lock) {
    if (!lock) return '';
    const school = lock.schoolName ? displaySchool(lock.schoolName) : (lock.category === 'general' ? '후기 일반고' : '');
    return `${school} ${lock.status === '포기' ? '합격 후 등록 포기' : lock.status}`.trim();
}

export function lockMessage(lock) {
    return lock ? `이중지원 금지: ${lockLabel(lock)} 학생이라 새 원서를 넣을 수 없습니다. 지난 불합격 원서를 기록할 때만 상태를 '불합격'으로 저장할 수 있습니다.` : '';
}

/** 새 원서를 막아야 하는지(이미 있는 원서를 고치거나 불합격 기록이면 막지 않음). */
export function blocksNewApplication(apps, year, { status, isExisting }) {
    if (isExisting || status === '불합격') return null;
    return findApplicationLock(apps, year);
}
