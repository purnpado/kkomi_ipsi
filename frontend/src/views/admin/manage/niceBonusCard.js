// ===== 나이스 항목별점수관리(창의체험·행동발달) 가산점 맞춰 보기·가져오기 (학년부장) =====
// 담임이 학업성적관리위원회 명단을 보고 나이스에 넣은 후기 일반고 학년별 가산점을 상담 화면 체크로 가져온다.
// 먼저 바뀌는 학생을 보여 주고 확인받은 뒤 바꾼다. 가산 제외(징계 등) 학년은 건드리지 않는다(백엔드 nice_bonus.go).
import { showModalAlert, showModalConfirm } from '../../../core/dialogs.js';

export function niceBonusCardHTML() {
    return `
        <div id="niceBonusCard" class="mt-3 rounded-2xl border border-slate-700/60 bg-slate-900/40 p-4">
            <div class="flex flex-wrap items-start justify-between gap-3">
                <div class="min-w-0">
                    <p class="text-base font-bold text-white">5. 후기 일반고 창체·행발 가산점 <span class="text-xs font-normal text-slate-400">(나이스에 가산점을 넣은 뒤)</span></p>
                    <p class="text-xs text-slate-400 mt-1 leading-snug">나이스 고입내신관리의 <strong>항목별점수관리(창의체험)</strong>·<strong>(행동발달)</strong> 엑셀을 한 번에 하나씩 올립니다. 상담 화면에 체크한 가산점과 학년마다 맞춰 보고, 확인하면 나이스 값으로 체크를 맞춥니다. 파일 이름은 나이스에서 받은 그대로 두세요(이름으로 창체·행발을 구별).</p>
                </div>
                <button id="niceBonusUploadBtn" type="button" class="btn-primary text-xs px-3 py-2 font-bold" style="width:auto">파일 맞춰 보기·가져오기</button>
            </div>
        </div>`;
}

function planText(plan) {
    const lines = [
        `${plan.kindLabel} 가산점: 파일 ${plan.students}명 중 ${plan.matched}명을 맞췄고, ${plan.same}명은 같습니다.`,
    ];
    if (plan.withBonus === 0) lines.push('※ 파일에 가산점이 있는 학생이 없습니다(나이스에 아직 가산점을 넣지 않았을 수 있습니다).');
    if (plan.changes.length) {
        lines.push('', `바뀌는 체크 ${plan.changes.length}건:`);
        plan.changes.slice(0, 30).forEach((c) => lines.push(`· ${c.classNum}반 ${c.studentNum}번 ${c.name} ${c.grade}학년: ${c.from ? '체크' : '없음'} → ${c.to ? '체크' : '없음'}`));
        if (plan.changes.length > 30) lines.push(`… 외 ${plan.changes.length - 30}건`);
    }
    if (plan.disqualified.length) lines.push('', `가산 제외라 그대로 두는 학년 ${plan.disqualified.length}건: ${plan.disqualified.slice(0, 10).join(', ')}`);
    if (plan.unmatched.length) lines.push('', `꼬미입시에 없는 학생 ${plan.unmatched.length}명: ${plan.unmatched.slice(0, 10).join(', ')}`);
    return lines.join('\n');
}

export function bindNiceBonusCard() {
    const App = window.go?.main?.App;
    document.getElementById('niceBonusUploadBtn')?.addEventListener('click', async () => {
        try {
            const preview = await App.PreviewNiceBonusFile();
            if (!preview) return;
            const { plan, path } = preview;
            if (!plan.changes.length) {
                await showModalAlert(`${planText(plan)}\n\n바꿀 체크가 없습니다.`, '나이스 가산점 맞춰 보기', 'success');
                return;
            }
            const ok = await showModalConfirm({
                title: '나이스 가산점으로 체크 맞추기',
                message: `${planText(plan)}\n\n나이스 값으로 상담 화면 가산점 체크를 맞출까요? 가산점 입력 완료로도 기록합니다.`,
                confirmText: '나이스 값으로 맞추기',
                type: 'warning'
            });
            if (!ok) return;
            const done = await App.ApplyNiceBonusFile(path);
            await showModalAlert(`${done.kindLabel} 가산점 체크 ${done.changes.length}건을 나이스 값으로 맞췄습니다.`, '나이스 가산점 가져오기', 'success');
        } catch (err) {
            await showModalAlert(`나이스 가산점 파일 오류: ${err}`, '오류', 'error');
        }
    });
}
