import { escapeHtml } from '../core/utils.js';
import { transferBadge } from '../core/transferBadges.js';
import { judgeGeneralPercentile } from '../core/admissionJudgment.js';
import { printOnly } from '../print/printEngine.js';
import { collectSubjects, subjectTableHTML } from './transcript/transcriptSubjects.js';
import { attendanceHTML, bonusHTML, scoreSummaryHTML, volunteerHTML } from './transcript/transcriptScores.js';

// ===== 학생 종합 성적표 =====
// 나이스 「내신성적 통지표」의 내신점수 한 줄을 맨 위에, 「내신성적 기초자료 확인서」의 1~5(교과·출석·봉사·행동발달·창의체험)를
// 같은 순서·같은 칸 이름으로 둔다. 인쇄물을 나이스 확인서와 나란히 놓고 맞춰 볼 수 있게 한다(2026-11-22 사용자 요청).
const parse = (raw) => { try { return JSON.parse(raw || '{}') || {}; } catch (_) { return {}; } };

function semesterSums(full) {
    const out = {};
    for (const [key, values] of Object.entries(full?.semesterScores || {})) {
        if (values?.length) out[key.replace('_', '-')] = { sum: values.reduce((a, b) => a + b, 0), count: values.length };
    }
    return out;
}

function badgesHTML(data, full, nice) {
    const pct = Number(full?.generalHSPercentile || data.percentile || 0);
    const judged = judgeGeneralPercentile(pct);
    const chips = [
        `<span class="counsel-judgment counsel-judgment--${judged.level}">${judged.emoji} 후기 일반고 ${judged.label}${judged.level === 'unknown' ? '' : ' 구간'}</span>`,
        pct > 0 ? `<span class="cg-chip">석차백분율(교과) 상위 <b>${pct.toFixed(2)}%</b></span>` : '',
        `<span class="cg-chip">평균 성취도 <b>${Number(data.allAverage || 0).toFixed(2)}</b> / 5.0</span>`,
        full && !full.generalHSThirdYearFinal ? '<span class="cg-chip cg-chip--warn">3학년 2학기 예상(1학기 성적)</span>' : '',
        full?.generalHSThirdYearProjected ? '<span class="cg-chip cg-chip--warn">3학년 성적 예상(전년도)</span>' : '',
        nice > 0 ? '<span class="cg-chip cg-chip--ok">내신성적 나이스 값</span>' : '<span class="cg-chip">내신성적 꼬미입시 계산</span>',
    ];
    return `<div class="cg-chips tr-badges">${chips.join('')}</div>`;
}

export async function openStudentTranscriptModal(classNum, studentNum, name) {
    document.getElementById('studentTranscriptModal')?.remove();
    const modalEl = document.createElement('div');
    modalEl.id = 'studentTranscriptModal';
    modalEl.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto';
    modalEl.innerHTML = `<div class="glass-card p-8 w-full max-w-4xl text-center"><span class="spinner"></span> <span class="text-white ml-2">${escapeHtml(name)} 학생의 종합 성적표를 불러오는 중…</span></div>`;
    document.body.appendChild(modalEl);

    try {
        const App = window.go.main.App;
        const [data, full, niceRes] = await Promise.all([
            App.GetStudentTranscript(classNum, studentNum, name),
            App.GetStudentFullDetail(classNum, studentNum, name).catch(() => null),
            App.GetNiceGeneralFinalScores?.().catch(() => null),
        ]);
        const nice = Number(niceRes?.scores?.[`${classNum}|${studentNum}`] || 0);
        const grades = collectSubjects(data.subjectRecords || []);
        const att = parse(data.attendanceRaw);
        const d = full || {};

        modalEl.innerHTML = `
            <div class="glass-card print-document transcript-doc p-6 md:p-8 w-full max-w-6xl max-h-[90vh] overflow-y-auto">
                <div class="tr-head">
                    <div>
                        <h2 class="text-2xl font-black text-white flex items-center gap-2">${escapeHtml(classNum)}반 ${escapeHtml(studentNum)}번 <span class="text-primary font-bold">${escapeHtml(name)}</span>${transferBadge(classNum, studentNum, name)} 종합 성적표</h2>
                        <p class="tr-lead">나이스 내신성적 기초자료 확인서와 같은 순서 · 같은 칸 이름</p>
                    </div>
                    <div class="flex items-center gap-2 no-print">
                        <button id="printTranscriptBtn" class="btn-secondary text-xs px-3 py-1.5 font-bold cursor-pointer">🖨️ 성적표 인쇄</button>
                        <button aria-label="닫기" id="closeTranscriptBtn" class="text-slate-400 hover:text-white p-2 text-xl font-bold bg-transparent border-none cursor-pointer">✕</button>
                    </div>
                </div>
                ${badgesHTML(data, full, nice)}
                ${full ? `<section class="tr-block"><h4>내신점수</h4>${scoreSummaryHTML(d, nice)}</section>` : ''}
                <section class="tr-block"><h4>1. 교과성적 <span class="tr-legend"><i class="tr-g--A">A</i><i class="tr-g--B">B</i><i class="tr-g--C">C</i><i class="tr-g--D">D</i><i class="tr-g--E">E</i><i class="tr-g--P">P</i></span></h4>
                    ${subjectTableHTML(grades, semesterSums(full), d.generalHSAcademicScore, !!d.generalHSThirdYearFinal, !!d.generalHSThirdYearProjected)}</section>
                ${full ? `${attendanceHTML(d, att)}<div class="tr-pair">${volunteerHTML(d)}${bonusHTML(d)}</div>` : '<p class="tr-foot">출석·봉사·가산점 근거를 불러오지 못했습니다.</p>'}
            </div>`;

        document.getElementById('closeTranscriptBtn').addEventListener('click', () => modalEl.remove());
        document.getElementById('printTranscriptBtn').addEventListener('click', () => printOnly('transcript'));
        modalEl.addEventListener('click', (e) => { if (e.target === modalEl) modalEl.remove(); });
    } catch (err) {
        modalEl.innerHTML = `
            <div class="glass-card p-8 w-full max-w-md text-center">
                <div class="text-danger text-4xl mb-3">⚠️</div>
                <div class="text-white font-bold mb-4">성적표를 불러오지 못했습니다</div>
                <div class="text-text-muted text-sm mb-6">${escapeHtml(String(err))}</div>
                <button type="button" class="btn-secondary w-full cursor-pointer" id="closeTranscriptErrBtn">닫기</button>
            </div>`;
        modalEl.querySelector('#closeTranscriptErrBtn')?.addEventListener('click', () => modalEl.remove());
    }
}
