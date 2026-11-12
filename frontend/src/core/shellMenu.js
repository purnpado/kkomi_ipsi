// ===== 공통 틀 왼쪽 메뉴 구성 (역할별) =====
// 메뉴 묶음(group)마다 항목(items)을 두고, 항목은 화면 전환(screen) 또는 창 열기(modal) 중 하나를 요청한다.
// 권한 없는 항목은 아예 넣지 않는다. 실제 화면·창의 권한 확인은 각 화면 모듈과 백엔드가 그대로 한다.

/**
 * @param {{Role:string, ClassNum?:number}} user
 * @returns {{id:string,label:string,items:{id:string,label:string,hint?:string,screen?:string,modal?:string,params?:object}[]}[]}
 */
export function buildShellMenu(user) {
    const role = user?.Role || '';
    const myClass = role === 'homeroom' ? user.ClassNum : null;

    if (role === 'master') {
        return [
            { id: 'dash', label: '대시보드', items: [
                { id: 'dash', label: '학년부장 대시보드', hint: '올해 할 일·현황·주의 알림', screen: 'home' }
            ] },
            { id: 'students', label: '학생·성적', items: [
                { id: 'admin', label: '나이스 자료·학년도 관리', hint: '엑셀 올리기·고입 연도·인수인계', screen: 'admin' },
                { id: 'classes', label: '학급 명렬표·상담', hint: '학급을 골라 학생 상담', screen: 'teacher', params: { classNum: null } }
            ] },
            { id: 'apps', label: '원서·결과', items: [
                { id: 'app-summary', label: '우리 학교 지원현황', modal: 'application-summary' },
                { id: 'register', label: '원서대장', modal: 'register' },
                { id: 'matrix', label: '신호등 매트릭스', modal: 'matrix', params: { classNum: null } }
            ] },
            { id: 'analysis', label: '입시 분석', items: [
                { id: 'analysis', label: '입시 분석·추세', modal: 'admission-analysis' },
                { id: 'shared', label: '관내 공유 결과', modal: 'shared-admission' }
            ] },
            { id: 'basis', label: '기준 자료', items: [
                { id: 'cutoff', label: '커트라인·경쟁률', screen: 'cutoff' },
                { id: 'judgment', label: '판정 기준', modal: 'judgment-settings' }
            ] },
            { id: 'exchange', label: '자료 주고받기', items: [
                { id: 'patch', label: '담임 취합자료 병합', modal: 'patch-import' }
            ] },
            { id: 'settings', label: '설정', items: [
                { id: 'users', label: '계정·권한', screen: 'users' }
            ] }
        ];
    }

    if (role === 'homeroom') {
        return [
            { id: 'dash', label: '대시보드', items: [
                { id: 'dash', label: '우리 반 대시보드', hint: '상담이 필요한 학생·판정 분포', screen: 'home' }
            ] },
            { id: 'students', label: '학생·성적', items: [
                { id: 'classes', label: '우리 반 명렬표·상담', hint: `3학년 ${myClass}반 · 취합자료 제출`, screen: 'teacher', params: { classNum: myClass } }
            ] },
            { id: 'apps', label: '원서·결과', items: [
                { id: 'class-summary', label: '우리 반 지원현황', modal: 'class-summary', params: { classNum: myClass } },
                { id: 'register', label: '원서대장', modal: 'register' },
                { id: 'matrix', label: '신호등 매트릭스', modal: 'matrix', params: { classNum: myClass } }
            ] },
            { id: 'analysis', label: '입시 분석', items: [
                { id: 'analysis', label: '입시 분석·추세', modal: 'admission-analysis' },
                { id: 'shared', label: '관내 공유 결과', modal: 'shared-admission' }
            ] }
        ];
    }

    if (role === 'viewer') {
        return [
            { id: 'dash', label: '대시보드', items: [
                { id: 'dash', label: '진로부장 대시보드', hint: '전교 판정 분포', screen: 'home' }
            ] },
            { id: 'students', label: '학생·성적', items: [
                { id: 'classes', label: '학급 둘러보기', hint: '명렬표·상담 조회 전용', screen: 'teacher', params: { classNum: null } }
            ] },
            { id: 'apps', label: '원서·결과', items: [
                { id: 'app-summary', label: '우리 학교 지원현황', modal: 'application-summary' },
                { id: 'matrix', label: '신호등 매트릭스', modal: 'matrix', params: { classNum: null } }
            ] },
            { id: 'analysis', label: '입시 분석', items: [
                { id: 'analysis', label: '입시 분석·추세', modal: 'admission-analysis' },
                { id: 'shared', label: '관내 공유 결과', modal: 'shared-admission' }
            ] }
        ];
    }
    return [];
}

/** 공통 틀을 보여 줄 화면(로그인 뒤 화면)인지 */
export const SHELL_SCREENS = new Set(['admin', 'home', 'teacher', 'users', 'cutoff']);

export const ROLE_LABELS = { master: '학년부장', homeroom: '담임', viewer: '진로부장' };
