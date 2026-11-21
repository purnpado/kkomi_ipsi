// ===== A4 전용 선택 인쇄 제어 엔진 =====

// 화면 전체가 아닌 선택한 문서만 A4로 인쇄한다.
// 매트릭스는 열 수가 많아 A4 가로, 개인 문서는 A4 세로를 기본값으로 사용한다.
export function printOnly(kind, orientation = 'portrait') {
    const allowedKinds = new Set(['report', 'transcript', 'matrix', 'register', 'summary', 'guide', 'prediction', 'nice-roster']);
    const safeKind = allowedKinds.has(kind) ? kind : 'report';
    const safeOrientation = orientation === 'landscape' ? 'landscape' : 'portrait';
    const previous = document.getElementById('runtimePrintPageStyle');
    previous?.remove();

    const pageStyle = document.createElement('style');
    pageStyle.id = 'runtimePrintPageStyle';
    const printMargin = safeKind === 'transcript' ? '6mm 8mm' : '10mm';
    // 용지 여백을 0으로 두면 브라우저가 머리글·꼬리글(날짜·제목·wails.localhost 주소·쪽 번호)을 넣지 못한다.
    // 대신 본문 안쪽 여백을 주고, 여러 장으로 넘어가도 장마다 같은 여백이 생기도록 clone 으로 나눈다.
    pageStyle.textContent = `@page { size: A4 ${safeOrientation}; margin: 0; }
@media print { body.printing { margin: 0 !important; padding: ${printMargin} !important; -webkit-box-decoration-break: clone; box-decoration-break: clone; } }`;
    document.head.appendChild(pageStyle);
    document.body.classList.add('printing');
    document.body.dataset.printKind = safeKind;

    const cleanup = () => {
        document.body.classList.remove('printing');
        delete document.body.dataset.printKind;
        pageStyle.remove();
    };
    window.addEventListener('afterprint', cleanup, { once: true });
    // 인쇄 CSS가 적용된 뒤 브라우저 미리보기를 열도록 두 프레임을 기다린다.
    // 미리보기가 열리면 화면 코드가 멈추므로, "인쇄 중" 알림이 Go 에 닿은 뒤(최대 0.5초) 연다.
    requestAnimationFrame(() => requestAnimationFrame(async () => {
        await Promise.race([setPrinting(true), new Promise((resolve) => setTimeout(resolve, 500))]);
        window.print();
    }));
}

// 인쇄 미리보기가 열려 있는 동안을 프로그램(Go)에 알린다. 윈도우는 미리보기가 프로그램 창 안을 덮어 열리므로,
// 그동안 창의 X 를 누르면 프로그램 대신 인쇄 화면만 닫는다(app_print.go). Ctrl+P 로 연 인쇄도 같다.
function setPrinting(on) {
    try {
        return Promise.resolve(window.go?.main?.App?.SetPrinting?.(on)).catch(() => {});
    } catch (_) { /* 바인딩이 없으면(서버 모드 등) 할 일 없음 */ }
    return Promise.resolve();
}

if (typeof window !== 'undefined') {
    window.printOnly = printOnly;
    window.addEventListener('beforeprint', () => setPrinting(true));
    window.addEventListener('afterprint', () => setPrinting(false));
}
