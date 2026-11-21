// ===== "기타 울산 고교" 학교 목록과 지원 시기 =====
// 마이스터고·특성화고·후기 일반고 밖의 울산 고교(옛 "자사고·외고"와 "기타"를 합침, 2026-11-21).
// 시기는 2027 울산 입학전형 일정표 기준(이중지원 금지 규칙은 백엔드 application_rounds.go).
export const ULSAN_OTHER_SCHOOLS = [
    '울산과학고등학교', '울산스포츠과학고등학교', '울산예술고등학교', '울산애니원고등학교',
    '울산외국어고등학교', '현대청운고등학교', '울산고운고등학교'
];

// 목록에 없는 학교·타시도 고교는 원서의 전형 칸에 시기를 적는다(백엔드 RoundTrack* 와 같은 글자).
export const ROUND_TRACKS = [
    ['전기', '전기 (마이스터고·특성화고·과학고·예술고·체육고 등)'],
    ['후기', '후기 (일반고·자사고·외고·국제고 등)'],
    ['이중지원 예외', '이중지원 예외 (영재학교·대안학교·평생교육시설·군인자녀 전형)']
];

/** 학교명을 직접 넣는(목록에 없는) 원서인지: 타시도 고교, 또는 기타 울산 고교 중 목록 밖 학교 */
export function needsRoundTrack(category, schoolName) {
    if (category === 'out_province') return true;
    if (category !== 'other' && category !== 'self_foreign') return false;
    const name = String(schoolName || '').trim();
    return name === '__custom_school__' || (Boolean(name) && !ULSAN_OTHER_SCHOOLS.includes(name));
}
