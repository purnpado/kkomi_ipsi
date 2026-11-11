import { escapeHtml, escapeAttr, normalizeSchoolName, isSameTrack } from '../../../core/utils.js';
import { currentAdmissionYear } from '../../../core/admissionYear.js';

// ===== 마이스터고 및 특성화고 합격 가능 예측 뱃지 렌더러 =====
// 마이스터고 및 특성화고 고교·학과별 정밀 합격 분석 목록 추출 헬퍼
export function getPredictionAnalysisList(results, cutoffs, schoolGroup) {
    const isMeister = schoolGroup === 'meister';
    const schoolKeywords = isMeister
        ? ['울산마이스터', '울산에너지', '현대공업']
        : ['울산상업', '울산여자상업', '울산생활과학', '울산공업', '울산산업', '울산미용예술', '울산기술공업', '울산애니원'];

    const matchesGroup = (sName) => {
        const norm = normalizeSchoolName(sName);
        return schoolKeywords.some(kw => norm.includes(kw) || kw.includes(norm));
    };

    // 해당 학교군에 등록된 커트라인이 존재하는지 확인
    const relevantCutoffs = (cutoffs || []).filter(c =>
        matchesGroup(c.schoolName) && Number(c.minValue) > 0
    );

    const list = [];
    const seen = new Set();

    (results || []).filter(r => matchesGroup(r.schoolName)).forEach(r => {
        const candidates = relevantCutoffs
            .filter(c => {
                const normC = normalizeSchoolName(c.schoolName);
                const normR = normalizeSchoolName(r.schoolName);
                const schoolMatch = normC === normR || normC.includes(normR) || normR.includes(normC);
                return schoolMatch && isSameTrack(c.track, r.trackName);
            })
            .sort((a, b) => Number(b.year || 0) - Number(a.year || 0));

        candidates.forEach(c => {
            const deptLabel = (!c.department || c.department === '공통') ? '' : c.department;
            const key = `${normalizeSchoolName(r.schoolName)}_${deptLabel}_${r.trackName}_${c.year}`;

            if (!seen.has(key)) {
                seen.add(key);
                const studentScore = Number(r.totalScore) || 0;
                const minScore = Number(c.minValue) || 0;
                const avgScore = Number(c.avgValue) || 0;
                const maxScore = Number(c.maxValue) || 0;
                const diff = studentScore - minScore;
                const isPass = studentScore >= minScore;

                let status = '도전';
                let statusColor = 'bg-rose-500/20 text-rose-300 border-rose-500/40';
                if (diff >= 5) {
                    status = '안정';
                    statusColor = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
                } else if (diff >= 0) {
                    status = '적정';
                    statusColor = 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40';
                } else if (diff >= -5) {
                    status = '소신';
                    statusColor = 'bg-orange-500/20 text-orange-300 border-orange-500/40';
                }

                list.push({
                    schoolName: r.schoolName,
                    dept: deptLabel || '학교 전체(공통)',
                    track: r.trackName,
                    year: c.year || currentAdmissionYear() - 1, // 연도 없는 커트라인은 직전 고입 결과로 본다
                    studentScore,
                    minScore,
                    avgScore,
                    maxScore,
                    diff,
                    status,
                    statusColor,
                    isPass
                });
            }
        });
    });

    return list;
}

// ===== 희망학교 세로 1열 스택(Vertical Stack) 렌더러 (개별 즉시 삭제 X 버튼 탑재) =====
export function renderApplicationSummary(applications, classNum, studentNum, studentName) {
    const completed = (applications || []).filter(a => a.status && a.status !== '미입력');
    if (!completed.length) {
        return '<span class="inline-flex items-center px-3 py-1 rounded-full bg-slate-800/90 text-slate-400 text-xs border border-slate-700 font-semibold shadow-xs">미입력</span>';
    }

    const getStatusTheme = (status) => {
        switch (status) {
            case '합격':
            case '최종 진학':
            case '최종진학':
                return {
                    border: 'border-emerald-400/80 bg-emerald-950/60 text-emerald-100',
                    badge: 'bg-emerald-600 text-white font-black border border-emerald-300 shadow-md'
                };
            case '불합격':
                return {
                    border: 'border-rose-400/80 bg-rose-950/60 text-rose-100',
                    badge: 'bg-rose-600 text-white font-black border border-rose-300 shadow-md'
                };
            case '지원 완료':
            case '지원완료':
                return {
                    border: 'border-sky-400/80 bg-sky-950/60 text-sky-100',
                    badge: 'bg-sky-600 text-white font-bold border border-sky-300 shadow-md'
                };
            case '미진학':
                return {
                    border: 'border-slate-600 bg-slate-900/80 text-slate-300',
                    badge: 'bg-slate-700 text-slate-300 border border-slate-500 font-medium'
                };
            case '지원 예정':
            case '지원예정':
            default:
                return {
                    border: 'border-amber-400/80 bg-amber-950/50 text-amber-100',
                    badge: 'bg-amber-600 text-white font-bold border border-amber-300 shadow-md'
                };
        }
    };

    const items = completed.map(a => {
        const theme = getStatusTheme(a.status);
        let school = a.schoolName || (a.category === 'general' ? '후기 일반고' : '기타');
        if (a.category === 'general' && a.assignedSchool) {
            school = `일반고 [${a.assignedSchool}]`;
        } else if (a.assignedDepartment) {
            school = `${school} (${a.assignedDepartment})`;
        }
        return `
            <div class="inline-flex items-center justify-between w-full max-w-56 px-3 py-1.5 rounded-xl text-[11px] border ${theme.border} shadow-sm group/app-badge transition-all">
                <span class="truncate max-w-28 font-bold" title="${escapeAttr(school)}">${escapeHtml(school)}</span>
                <div class="inline-flex items-center gap-1 shrink-0">
                    <span class="text-[10px] px-2 py-0.5 rounded-full ${theme.badge} whitespace-nowrap">${escapeHtml(a.status)}</span>
                    <button type="button" class="btn-delete-app-item inline-flex items-center justify-center w-4 h-4 rounded-full text-slate-400 hover:text-white hover:bg-rose-600 transition-all cursor-pointer font-black text-[11px] ml-0.5 active:scale-90"
                            data-class="${classNum || ''}" data-num="${studentNum || ''}" data-name="${escapeAttr(studentName || '')}"
                            data-cat="${escapeAttr(a.category || '')}" data-school="${escapeAttr(a.schoolName || '')}" data-track="${escapeAttr(a.track || '')}"
                            title="${escapeAttr(school)} 진로희망 삭제">
                        ✕
                    </button>
                </div>
            </div>
        `;
    });

    return `<div class="flex flex-col gap-1.5 items-center w-full">${items.join('')}</div>`;
}
