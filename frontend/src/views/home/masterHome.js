// ===== 학년부장 대시보드: "올해 할 일" 중심 =====
// 학년도 진행표(누르면 해당 화면·창), 현황 카드, 확인이 필요한 일, 판정 분포, 바로가기.
import { escapeAttr, escapeHtml } from '../../core/utils.js';
import { admissionLongLabel } from '../../core/admissionYear.js';
import { countByLevel } from './homeData.js';
import { distributionBars, pageHeader, section, shortcutGrid, statCards } from './homeWidgets.js';

const STEP_STATUS = {
    done: { text: '완료', badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40', card: 'border-slate-700/60 bg-slate-900/40' },
    now: { text: '지금 할 일', badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40', card: 'border-amber-500/50 bg-amber-950/30' },
    todo: { text: '남음', badge: 'bg-slate-700/40 text-slate-300 border-slate-600', card: 'border-slate-700/60 bg-slate-900/40' },
    info: { text: '직접 확인', badge: 'bg-sky-500/20 text-sky-300 border-sky-500/40', card: 'border-slate-700/60 bg-slate-900/40' }
};

const ALERT_DOT = { rose: '#fb7185', amber: '#fbbf24', slate: '#94a3b8', indigo: '#818cf8' };

function progressBoard(steps) {
    return `
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            ${steps.map((s, i) => {
                const st = STEP_STATUS[s.status] || STEP_STATUS.todo;
                return `
                    <button type="button" data-home-action="${escapeAttr(s.action)}"
                        class="text-left rounded-xl border ${st.card} hover:border-indigo-500/60 px-3.5 py-3 transition-colors cursor-pointer flex flex-col gap-1.5 min-w-0">
                        <span class="flex items-center justify-between gap-2 w-full">
                            <span class="text-[11px] text-slate-400 font-semibold">${i + 1}단계</span>
                            <span class="text-[11px] px-2 py-0.5 rounded-full border font-bold whitespace-nowrap ${st.badge}">${st.text}</span>
                        </span>
                        <span class="text-sm font-bold text-white">${escapeHtml(s.label)}</span>
                        <span class="text-xs text-slate-400 leading-snug">${escapeHtml(s.detail)}</span>
                    </button>`;
            }).join('')}
        </div>`;
}

function alertList(alerts) {
    if (!alerts.length) {
        return '<div class="py-6 text-center text-sm text-slate-400">지금 확인할 일이 없습니다.</div>';
    }
    return `
        <ul class="flex flex-col gap-2">
            ${alerts.map((a) => `
                <li>
                    <button type="button" data-home-action="${escapeAttr(a.action)}"
                        class="w-full text-left flex gap-3 items-start rounded-xl bg-slate-900/40 border border-slate-700/60 hover:border-indigo-500/50 px-3.5 py-2.5 cursor-pointer transition-colors">
                        <span class="mt-1.5 w-2.5 h-2.5 rounded-full shrink-0" style="background:${ALERT_DOT[a.tone] || ALERT_DOT.slate}" aria-hidden="true"></span>
                        <span class="flex flex-col gap-0.5 min-w-0">
                            <span class="text-sm font-bold text-white">${escapeHtml(a.title)}</span>
                            <span class="text-xs text-slate-400">${escapeHtml(a.detail)}</span>
                        </span>
                    </button>
                </li>`).join('')}
        </ul>`;
}

export function masterHomeHTML(data) {
    const { year, steps, alerts, cards, home } = data;
    return `
        <div class="w-full max-w-[1500px] mx-auto fade-in">
            ${pageHeader('학년부장 대시보드', year ? admissionLongLabel(year) : '')}
            <div class="mb-5">${section('올해 할 일 (학년도 진행표)', progressBoard(steps), { note: '단계를 누르면 그 일을 하는 화면이나 창이 열립니다.' })}</div>
            ${statCards(cards)}
            <div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <div class="xl:col-span-2 flex flex-col gap-4 min-w-0">
                    ${section('확인이 필요한 일', alertList(alerts))}
                    ${section('바로가기', shortcutGrid([
                        { id: 'admin', label: '나이스 자료·학년도 관리', desc: '엑셀 올리기, 고입 연도·학급 수, 인수인계' },
                        { id: 'class-list-all', label: '학급 명렬표·상담', desc: '학급을 골라 학생 상담' },
                        { id: 'matrix-all', label: '신호등 매트릭스', desc: '전교 학교별 판정' },
                        { id: 'school-summary', label: '우리 학교 지원현황', desc: '학교·학과별 지원 인원, 결과 확정' },
                        { id: 'register', label: '원서대장', desc: '학급별 누적 기입·인쇄' },
                        { id: 'analysis', label: '입시 분석·추세', desc: '여러 해 추세·학과 지망 전략' }
                    ]))}
                </div>
                <div class="flex flex-col gap-4 min-w-0">
                    ${section('전교 희망 학교 판정', distributionBars(countByLevel(home.students)), { note: '학생마다 올해 원서 중 대표 1건(전기고 우선)을 기준으로 합니다. 후기 일반고의 경계는 소신, 주의는 어려움으로 셉니다.' })}
                </div>
            </div>
        </div>`;
}
