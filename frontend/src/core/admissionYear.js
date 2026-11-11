// ===== 고입 학년도 계산·표시 공통 함수 =====
// 저장 기준은 언제나 "고교 입학 학년도"(예: 2027) 하나다. 화면에는 "2027 고입"처럼 표시하고,
// 올해 중3이 치르는 입시에는 "(현 중3 · 2026학년도)"를 덧붙여 중학교 학년도와 헷갈리지 않게 한다.

// 학년도는 3월에 시작한다. 1~2월은 아직 직전 학년도다.
const SCHOOL_YEAR_START_MONTH = 3;

/** 오늘 기준 중학교 학년도 (예: 2026년 11월 → 2026, 2027년 1월 → 2026) */
export function currentSchoolYear(date = new Date()) {
    const year = date.getFullYear();
    return date.getMonth() + 1 >= SCHOOL_YEAR_START_MONTH ? year : year - 1;
}

/** 오늘 기준 현재 중3이 치르는 고입 학년도 (중학교 학년도 + 1) */
export function currentAdmissionYear(date = new Date()) {
    return currentSchoolYear(date) + 1;
}

/** 학교 설정의 고입 학년도. 설정이 없거나 잘못되었으면 오늘 기준 값을 쓴다. */
export function resolveAdmissionYear(config) {
    const year = Number(config?.admissionYear);
    return Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : currentAdmissionYear();
}

/** 짧은 표기: "2027 고입" */
export function admissionLabel(year) {
    const y = Number(year);
    return Number.isFinite(y) && y > 0 ? `${y} 고입` : '-';
}

/** 긴 표기: 올해 입시는 "2027 고입 (현 중3 · 2026학년도)", 지난 입시는 "2025 고입 결과" */
export function admissionLongLabel(year, date = new Date()) {
    const y = Number(year);
    if (!Number.isFinite(y) || y <= 0) return '-';
    const current = currentAdmissionYear(date);
    if (y === current) return `${y} 고입 (현 중3 · ${y - 1}학년도)`;
    if (y < current) return `${y} 고입 결과`;
    return `${y} 고입`;
}

/** 선택 목록 표기: "2027 고입 (현 중3)" / "2026 고입 결과" */
export function admissionOptionLabel(year, date = new Date()) {
    const y = Number(year);
    if (!Number.isFinite(y) || y <= 0) return '-';
    const current = currentAdmissionYear(date);
    if (y === current) return `${y} 고입 (현 중3)`;
    if (y < current) return `${y} 고입 결과`;
    return `${y} 고입`;
}

/** 초기 설정 등에서 쓰는 설명 문장 */
export function admissionYearHint(year = currentAdmissionYear()) {
    const y = Number(year);
    return `현재 중3 학생이 고등학교에 입학하는 해입니다 (${y - 1}학년도 중3 → ${y}학년도 고1)`;
}

/** 학교 설정 연도가 오늘 기준 현재 중3 입시보다 이전이면 안내 문장을, 아니면 빈 문자열을 돌려준다. */
export function staleAdmissionYearNotice(configuredYear, date = new Date()) {
    const y = Number(configuredYear);
    const current = currentAdmissionYear(date);
    if (!Number.isFinite(y) || y <= 0 || y >= current) return '';
    return `현재 설정은 ${admissionLabel(y)}입니다. 올해 중3(${current - 1}학년도) 입시라면 ${admissionLabel(current)}이 맞습니다.`;
}
