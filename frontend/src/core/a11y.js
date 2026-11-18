// ===== 키보드 접근성 보완 =====
// 버튼이 아닌 요소(학급 카드·학생 이름 칸·대시보드 학생 줄 등)에 role="button" tabindex="0" 을 붙이면,
// 키보드로 포커스한 뒤 Enter 나 스페이스로도 누를 수 있게 한다(각 화면의 click 처리 그대로 실행).
document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const el = event.target;
    if (!(el instanceof HTMLElement) || el.getAttribute('role') !== 'button') return;
    if (el.matches('button, a, input, select, textarea')) return;
    event.preventDefault();
    el.click();
});
