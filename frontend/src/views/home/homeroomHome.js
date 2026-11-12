// ===== 담임 대시보드: "우리 반" 한눈에 =====
// 상담이 필요한 학생, 반 판정 분포, 원서·상담 진행, 할 일·바로가기. 수정 기능은 없고 각 화면·창으로 보낸다.
import { escapeAttr, escapeHtml } from '../../core/utils.js';
import { admissionLongLabel } from '../../core/admissionYear.js';
import { countByLevel, counselReasons, wishLabel } from './homeData.js';
import { distributionBars, levelPill, pageHeader, reasonChip, section, shortcutGrid, statCards } from './homeWidgets.js';

const MAX_ROWS = 12;

function needTable(students) {
    const rows = students
        .map((s) => ({ s, reasons: counselReasons(s) }))
        .filter(({ reasons }) => reasons.length > 0)
        // 판정 문제가 있는 학생을 먼저, 그다음 상담 기록이 없는 학생
        .sort((a, b) => Number(b.reasons.some((r) => r !== '내 상담 기록 없음')) - Number(a.reasons.some((r) => r !== '내 상담 기록 없음'))
            || (parseInt(a.s.studentNum, 10) || 0) - (parseInt(b.s.studentNum, 10) || 0));
    if (!rows.length) {
        return { count: 0, html: '<div class="py-8 text-center text-sm text-slate-400">지금은 따로 살펴볼 학생이 없습니다.</div>' };
    }
    const body = rows.slice(0, MAX_ROWS).map(({ s, reasons }) => `
        <tr class="border-t border-slate-700/50 hover:bg-slate-800/60 cursor-pointer home-student-row"
            data-class="${s.classNum}" data-num="${escapeAttr(s.studentNum)}" data-name="${escapeAttr(s.name)}" title="눌러서 상담 창 열기">
            <td class="py-2.5 px-2 text-slate-400 font-mono">${escapeHtml(s.studentNum)}</td>
            <td class="py-2.5 px-2 font-bold text-white whitespace-nowrap">${escapeHtml(s.name)}</td>
            <td class="py-2.5 px-2 text-slate-300">${escapeHtml(wishLabel(s.wish) || '-')}</td>
            <td class="py-2.5 px-2">${levelPill(s.judgment.level, s.judgment.label)}</td>
            <td class="py-2.5 px-2"><div class="flex flex-wrap gap-1">${reasons.map(reasonChip).join('')}</div></td>
            <td class="py-2.5 px-2 text-slate-400 text-xs whitespace-nowrap">${escapeHtml(s.lastCounsel || '없음')}</td>
        </tr>`).join('');
    const more = rows.length > MAX_ROWS ? `<p class="text-xs text-slate-400 mt-2">외 ${rows.length - MAX_ROWS}명은 [우리 반 명렬표]에서 확인하세요.</p>` : '';
    return {
        count: rows.length,
        html: `
            <div class="overflow-x-auto">
                <table class="w-full text-sm text-left">
                    <thead><tr class="text-xs text-slate-400">
                        <th class="py-2 px-2 font-semibold">번호</th><th class="py-2 px-2 font-semibold">이름</th>
                        <th class="py-2 px-2 font-semibold">희망 학교</th><th class="py-2 px-2 font-semibold">판정</th>
                        <th class="py-2 px-2 font-semibold">살펴볼 점</th><th class="py-2 px-2 font-semibold">내 마지막 상담</th>
                    </tr></thead>
                    <tbody>${body}</tbody>
                </table>
            </div>${more}`
    };
}

/** @returns {string} 화면 HTML */
export function homeroomHomeHTML({ classNum, data }) {
    const { students, admissionYear, cutoffCount } = data;
    const withApps = students.filter((s) => s.apps.length > 0).length;
    const counseled = students.filter((s) => s.lastCounsel).length;
    const withResult = students.filter((s) => s.hasResult).length;
    const need = needTable(students);

    const cards = statCards([
        { label: '우리 반 학생', value: `${students.length}명`, note: `상담이 필요한 학생 ${need.count}명` },
        { label: '원서 입력', value: `${withApps}/${students.length}`, note: '올해 원서가 1건 이상인 학생' },
        { label: '내 상담 기록', value: `${counseled}/${students.length}`, note: '내가 쓴 상담 일지 기준' },
        { label: '결과 입력', value: `${withResult}/${students.length}`, note: '합격·불합격 등 결과가 있는 학생' }
    ]);

    const todo = `
        <ul class="space-y-2 text-sm text-slate-300 list-disc pl-5">
            ${students.length - withApps > 0 ? `<li>원서를 아직 입력하지 않은 학생 ${students.length - withApps}명</li>` : ''}
            ${cutoffCount === 0 ? '<li>합격선(커트라인)이 아직 없어 판정이 "기준 없음"으로 나옵니다. 학년부장 배포자료를 확인하세요.</li>' : ''}
            <li>상담·원서를 입력한 뒤에는 [우리 반 명렬표]의 <strong>취합자료 내보내기</strong>로 학년부장에게 제출합니다.</li>
        </ul>`;

    return `
        <div class="w-full max-w-[1500px] mx-auto fade-in">
            ${pageHeader(`3학년 ${classNum}반 담임 대시보드`, admissionYear ? admissionLongLabel(admissionYear) : '')}
            ${cards}
            <div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <div class="xl:col-span-2 min-w-0">
                    ${section('상담이 필요한 학생', need.html, { note: '희망 학교 판정이 어려움·판단 근거 부족이거나, 원서가 없거나, 내 상담 기록이 없는 학생입니다. 줄을 누르면 상담 창이 열립니다.' })}
                </div>
                <div class="flex flex-col gap-4 min-w-0">
                    ${section('우리 반 희망 학교 판정', distributionBars(countByLevel(students)), { note: '학생마다 올해 원서 중 대표 1건(전기고 우선)을 기준으로 합니다. 후기 일반고의 경계는 소신, 주의는 어려움으로 셉니다.' })}
                    ${section('할 일', todo)}
                    ${section('바로가기', shortcutGrid([
                        { id: 'class-list', label: '우리 반 명렬표', desc: '학생별 점수·상담·취합자료 제출' },
                        { id: 'class-summary', label: '우리 반 지원현황', desc: '학교·학과별 지원 인원' },
                        { id: 'matrix', label: '신호등 매트릭스', desc: '학교별 판정을 한 표로' },
                        { id: 'analysis', label: '입시 분석·추세', desc: '합격선 추세·학과 지망 전략' }
                    ]))}
                </div>
            </div>
        </div>`;
}
