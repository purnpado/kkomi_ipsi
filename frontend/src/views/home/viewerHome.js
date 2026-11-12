// ===== 진로부장 대시보드: 전교 지원 희망과 판정 분포 (조회 전용) =====
import { escapeHtml } from '../../core/utils.js';
import { admissionLongLabel } from '../../core/admissionYear.js';
import { HOME_LEVELS, countByLevel, wishLabel } from './homeData.js';
import { distributionBars, pageHeader, section, shortcutGrid, statCards } from './homeWidgets.js';

const TABLE_LEVELS = HOME_LEVELS.filter((l) => l.key !== 'none');

function schoolTable(students) {
    const groups = new Map();
    students.filter((s) => s.wish).forEach((s) => {
        const key = s.wish.category === 'general' ? '후기 일반고' : `${s.wish.schoolName} ${s.wish.track || ''}`.trim();
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(s);
    });
    if (!groups.size) {
        return '<div class="py-8 text-center text-sm text-slate-400">올해 입력된 원서가 아직 없습니다.</div>';
    }
    const rows = [...groups.entries()]
        .sort((a, b) => b[1].length - a[1].length)
        .map(([name, list]) => {
            const counts = countByLevel(list);
            return `
                <tr class="border-t border-slate-700/50">
                    <td class="py-2.5 px-2 font-bold text-white whitespace-nowrap">${escapeHtml(name)}</td>
                    <td class="py-2.5 px-2 text-slate-300 text-right">${list.length}</td>
                    ${TABLE_LEVELS.map((l) => `<td class="py-2.5 px-2 text-right ${counts[l.key] ? 'text-white font-semibold' : 'text-slate-500'}">${counts[l.key] || '·'}</td>`).join('')}
                </tr>`;
        }).join('');
    return `
        <div class="overflow-x-auto">
            <table class="w-full text-sm text-left">
                <thead><tr class="text-xs text-slate-400">
                    <th class="py-2 px-2 font-semibold">고교·전형 (대표 희망)</th>
                    <th class="py-2 px-2 font-semibold text-right">희망</th>
                    ${TABLE_LEVELS.map((l) => `<th class="py-2 px-2 font-semibold text-right whitespace-nowrap"><span class="inline-block w-2 h-2 rounded-full mr-1" style="background:${l.color}"></span>${escapeHtml(l.label)}</th>`).join('')}
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>`;
}

export function viewerHomeHTML({ data, classCount }) {
    const { students, admissionYear } = data;
    const withApps = students.filter((s) => s.apps.length > 0).length;
    const withResult = students.filter((s) => s.hasResult).length;
    const schools = new Set(students.filter((s) => s.wish).map((s) => wishLabel(s.wish).split(' · ')[0])).size;

    return `
        <div class="w-full max-w-[1500px] mx-auto fade-in">
            ${pageHeader('진로부장 대시보드', admissionYear ? admissionLongLabel(admissionYear) : '', '조회 전용')}
            ${statCards([
                { label: '전교생', value: `${students.length}명`, note: `${classCount}개 학급` },
                { label: '원서 입력', value: `${withApps}/${students.length}`, note: '올해 원서가 1건 이상인 학생' },
                { label: '희망 고교·전형', value: `${schools}곳`, note: '학생별 대표 희망 기준' },
                { label: '결과 입력', value: `${withResult}/${students.length}`, note: '합격·불합격 등 결과가 있는 학생' }
            ])}
            <div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <div class="xl:col-span-2 min-w-0">
                    ${section('전교 지원 희망과 판정 분포', schoolTable(students), { note: '학생마다 올해 원서 중 대표 1건(전기고 우선)을 기준으로 셉니다. 후기 일반고의 경계는 소신, 주의는 어려움으로 셉니다. 학과별 정밀 분석은 [입시 분석]에서 봅니다.' })}
                </div>
                <div class="flex flex-col gap-4 min-w-0">
                    ${section('전교 판정 분포', distributionBars(countByLevel(students)))}
                    ${section('바로가기', shortcutGrid([
                        { id: 'analysis', label: '입시 분석·추세', desc: '여러 해 추세·학과 지망 전략' },
                        { id: 'matrix-all', label: '신호등 매트릭스', desc: '전교 학교별 판정' },
                        { id: 'school-summary', label: '우리 학교 지원현황', desc: '학교·학과별 지원 인원' },
                        { id: 'class-list-all', label: '학급 둘러보기', desc: '학급 명렬표·상담 조회' }
                    ]))}
                </div>
            </div>
        </div>`;
}
