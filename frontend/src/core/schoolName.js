// ===== 학교명 표시: 화면·인쇄·엑셀에는 늘 정식 이름("○○고등학교") =====
// 산출 규칙·커트라인·관내 공유 자료는 짧은 이름표("울산공업고")를 저장 이름으로 쓴다(예전 자료·다른 학교 파일과 호환).
// 저장 이름은 바꾸지 않고, 보여 줄 때만 이 함수로 정식 이름으로 바꾼다. 거르기·정렬·학교 맞추기는 원래 값으로 한다.
// 목록에 없는 학교(타시도·직접 입력)와 "후기 일반고" 같은 묶음 이름은 그대로 둔다.

// [짧은 이름·별칭의 앞부분, 정식 이름] — 앞부분이 긴 것부터 맞춘다(울산기술공업 → 울산공업보다 먼저).
const OFFICIAL_NAMES = [
    ['울산마이스터', '울산마이스터고등학교'],
    ['울산에너지', '울산에너지고등학교'],
    ['현대공업', '현대공업고등학교'],
    ['현대공고', '현대공업고등학교'],
    ['울산기술공업', '울산기술공업고등학교'],
    ['울산공업', '울산공업고등학교'],
    ['울산공고', '울산공업고등학교'],
    ['울산미용예술', '울산미용예술고등학교'],
    ['울산생활과학', '울산생활과학고등학교'],
    ['울산여자상업', '울산여자상업고등학교'],
    ['울산여상', '울산여자상업고등학교'],
    ['울산상업', '울산상업고등학교'],
    ['울산상고', '울산상업고등학교'],
    ['울산산업', '울산산업고등학교'],
    ['울산애니원', '울산애니원고등학교'],
    ['울산스포츠과학', '울산스포츠과학고등학교'],
    ['울산과학', '울산과학고등학교'],
    ['울산예술', '울산예술고등학교'],
    ['울산고운', '울산고운고등학교'],
];

// 고교 목록(highschools.json)에서 읽은 정식 이름. 새 학교가 생기면 목록만 고쳐도 화면 이름이 따라온다.
let catalogNames = [];

/** 고교 목록의 정식 이름("○○고등학교")을 등록한다. 앞부분이 긴 것부터 맞추도록 정렬한다. */
export function registerSchoolCatalog(names) {
    catalogNames = (Array.isArray(names) ? names : [])
        .map((name) => String(name || '').replace(/\s+/g, ''))
        .filter((name) => name.endsWith('고등학교') && name.length > 4)
        .map((name) => [name.slice(0, -4), name])
        .sort((a, b) => b[0].length - a[0].length);
}

/** 로그인 뒤 한 번: 고교 목록을 읽어 등록한다(읽지 못해도 기본 이름표로 동작). */
export async function loadSchoolCatalog() {
    try {
        const data = await window.go?.main?.App?.GetHighSchoolsData?.();
        const schools = Array.isArray(data?.schools) ? data.schools : (Array.isArray(data) ? data : []);
        registerSchoolCatalog(schools.map((school) => school?.name));
    } catch (_) { /* 기본 이름표로 동작 */ }
}

/** 화면에 보일 학교명. 알려진 울산 고교면 정식 이름, 아니면 받은 그대로. */
export function displaySchool(name) {
    const original = String(name ?? '').trim();
    const compact = original.replace(/\s+/g, '');
    if (!compact) return original;
    for (const [prefix, official] of [...catalogNames, ...OFFICIAL_NAMES]) {
        if (!compact.startsWith(prefix)) continue;
        const rest = compact.slice(prefix.length);
        // "울산공업고", "울산공업고등학교", "울산공업" 처럼 학교명 끝말만 다를 때만 바꾼다("울산공업고 기계과" 등은 그대로).
        if (rest === '' || rest === '고' || rest === '고등학교') return official;
    }
    return original;
}
