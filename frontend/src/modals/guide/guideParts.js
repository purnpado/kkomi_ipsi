// ===== 사용 설명서 공통 조각 =====
// 설명서 본문은 역할별 파일(masterGuide.js·teacherGuide.js)에 글로만 적고, 모양은 여기서 만든다.

/** 단계 하나: 제목과 항목 목록(문자열 배열, 간단한 <strong> 허용) */
export function guideStep(no, title, items) {
    return `
        <section class="guide-step rounded-2xl border border-slate-700/60 bg-slate-800/40 p-4 space-y-2">
            <h3 class="flex items-center gap-2 text-sm sm:text-base font-bold text-white">
                <span class="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-black flex items-center justify-center shrink-0">${no}</span>
                <span>${title}</span>
            </h3>
            <ul class="space-y-1.5 pl-1">
                ${items.map((item) => `<li class="flex gap-2"><span class="text-indigo-300 shrink-0">•</span><span>${item}</span></li>`).join('')}
            </ul>
        </section>`;
}

export function guideNotice(title, body) {
    return `
        <div class="rounded-2xl border border-amber-500/40 bg-amber-950/30 p-4 text-amber-200">
            <strong class="block text-amber-100 mb-1">${title}</strong>
            <span>${body}</span>
        </div>`;
}

/** 화면 구성(모든 역할 공통) */
export function screenLayoutStep(no) {
    return guideStep(no, '화면 구성', [
        '<strong>위쪽 막대</strong>: 학교·고입 학년도, 학생 검색(이름 또는 "2-7"처럼 반-번호 → 상담 화면), [화면](라이트·다크·시스템 밝기, Pretendard·SUIT 글꼴), [잠금], [로그아웃].',
        '<strong>왼쪽 메뉴</strong>: 역할마다 다르게 보입니다. 오른쪽에 "창"이라고 붙은 항목만 창으로 열리고 나머지는 화면으로 열립니다.',
        '화면으로 연 상담·분석·원서대장 등은 [돌아가기]를 누르면 들어오기 전 화면으로 돌아갑니다. 그 위에 뜬 작은 창(가정해 보기 등)은 Esc 로 닫힙니다.',
        '자리를 비울 때는 [잠금] 또는 <strong>Ctrl + L</strong>. 본인 비밀번호를 넣으면 하던 화면 그대로 돌아옵니다.'
    ]);
}
