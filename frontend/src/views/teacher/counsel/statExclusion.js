// 상담 화면 위쪽 버튼 줄의 [관리] 버튼: 입시 통계 제외(특수교육대상자·학생선수 등).
// 민감한 정보이므로 명단·인쇄물·뱃지 어디에도 표시하지 않고, 이 칸에서만 켜고 끈다.
// 사유는 저장하지 않는다. 담임은 본인 반, 학년부장은 전교생, 진로부장에게는 칸 자체를 보이지 않는다.
import { state } from '../../../core/store.js';

function canManage(classNum) {
    const user = state.currentUser;
    if (!user) return false;
    if (user.Role === 'master') return true;
    return user.Role === 'homeroom' && Number(user.ClassNum) === Number(classNum);
}

export async function mountStatExclusion(ctx) {
    const mount = ctx.modalEl.querySelector('#statExclusionMount');
    const App = window.go?.main?.App;
    if (!mount || !App?.GetStudentStatExclusion || !canManage(ctx.classNum)) return;

    let excluded = false;
    try {
        excluded = await App.GetStudentStatExclusion(Number(ctx.classNum), String(ctx.studentNum), ctx.name);
    } catch (_) {
        return; // 권한이 없거나 읽지 못하면 칸을 그리지 않는다
    }
    // 버튼에는 상태를 드러내지 않는다(학생·학부모와 화면을 함께 볼 때 표시가 보이지 않도록). 눌러야 체크 칸이 보인다.
    mount.innerHTML = `
        <details class="stat-exclusion relative">
            <summary class="list-none px-3.5 h-9 rounded-xl font-bold text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 flex items-center gap-1.5 transition-all cursor-pointer select-none whitespace-nowrap" title="입시 통계 제외 등 학생 관리">
                <span aria-hidden="true">⚙️</span> <span>관리</span>
            </summary>
            <div class="absolute right-0 top-11 z-50 w-80 max-w-[85vw] rounded-xl border border-slate-600 bg-slate-900 shadow-xl px-4 py-3.5 space-y-2">
                <label class="flex items-start gap-2.5 cursor-pointer text-sm text-slate-200">
                    <input type="checkbox" id="statExclusionCheck" class="mt-0.5 w-4 h-4 accent-indigo-500" ${excluded ? 'checked' : ''} />
                    <span>입시 통계에 넣지 않음</span>
                </label>
                <p class="text-xs text-slate-400 leading-relaxed">
                    성적 산출·판정·원서는 그대로이고, 합격선·커트라인 통계와 관내 공유·인수인계 파일에서만 이 학생의 원서를 뺍니다.
                    사유는 저장하지 않으며 명단·인쇄물에는 표시되지 않습니다. 이미 결과를 확정한 해는 확정을 해제했다가 다시 확정해야 반영됩니다.
                </p>
                <p id="statExclusionStatus" class="text-xs text-slate-400" role="status" aria-live="polite"></p>
            </div>
        </details>
    `;
    const details = mount.querySelector('details');
    // 바깥을 누르거나 Esc를 누르면 닫는다(Esc는 상담 창 닫기보다 먼저 이 칸만 닫는다).
    const closeOnOutside = (e) => {
        if (!mount.isConnected) return document.removeEventListener('click', closeOnOutside, true);
        if (details.open && !details.contains(e.target)) details.open = false;
    };
    document.addEventListener('click', closeOnOutside, true);
    details.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && details.open) {
            e.stopPropagation();
            details.open = false;
            details.querySelector('summary').focus();
        }
    });
    const check = mount.querySelector('#statExclusionCheck');
    const status = mount.querySelector('#statExclusionStatus');
    check.addEventListener('change', async () => {
        const next = check.checked;
        check.disabled = true;
        status.textContent = '저장하는 중…';
        try {
            await App.SetStudentStatExclusion(Number(ctx.classNum), String(ctx.studentNum), ctx.name, next);
            status.textContent = next ? '입시 통계에서 뺐습니다.' : '입시 통계에 다시 넣었습니다.';
        } catch (err) {
            check.checked = !next;
            status.textContent = `저장하지 못했습니다: ${err}`;
        } finally {
            check.disabled = false;
        }
    });
}
