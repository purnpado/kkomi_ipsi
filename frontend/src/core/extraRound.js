// 추가모집 원서 자동 체크: 후기 일반고에 불합격한 뒤 넣는 전기고(마이스터고·특성화고) 원서는 추가모집이다.
// 학생의 그 학년도 후기 일반고 원서가 불합격이면 새 전기고 원서를 추가모집으로 미리 체크한다(해제 가능).
// 후기 일반고 합격 학생은 추가모집에 지원하지 않으므로 체크하지 않는다(사용자 확인 2026-11-20).
// 원서 입력 창(modals/application)과 원서 관리 전기고 빠른 입력(views/applications)이 함께 쓴다.


/** 이 학생의 새 전기고 원서를 추가모집으로 미리 체크할지 */
export function suggestExtraRound(apps, admissionYear) {
    return (apps || []).some((a) => a.category === 'general'
        && (!admissionYear || !a.admissionYear || Number(a.admissionYear) === Number(admissionYear))
        && String(a.status || '').trim() === '불합격');
}
