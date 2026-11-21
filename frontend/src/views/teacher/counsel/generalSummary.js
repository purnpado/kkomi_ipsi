import { getJudgmentSettings, judgeGeneralPercentile } from '../../../core/admissionJudgment.js';

const score = (value, digits = 1) => Number(value || 0).toFixed(digits);

// 학기 성취도는 원자료의 단순 평균이다. 실제 석차 계산의 학기별 환산점수와 혼동하지 않도록 따로 표시한다.
function semesterDetails(d) {
    const terms = d.semesterScores || {};
    const rows = [['1_1', '1학년 1학기'], ['1_2', '1학년 2학기'], ['2_1', '2학년 1학기'],
        ['2_2', '2학년 2학기'], ['3_1', '3학년 1학기'], ['3_2', '3학년 2학기']];
    const termHTML = rows.map(([key, label]) => {
        const values = terms[key] || [];
        const avg = values.length ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2) : '자료 없음';
        return `<div class="counsel-term"><span>${label}</span><strong>${avg}${values.length ? ' / 5.0' : ''}</strong></div>`;
    }).join('');
    const substitutions = [];
    for (const grade of ['2', '3']) {
        const first = (terms[`${grade}_1`] || []).length > 0;
        const second = (terms[`${grade}_2`] || []).length > 0;
        if (grade === '3' && !d.generalHSThirdYearFinal) continue;
        if (first !== second) substitutions.push(`${grade}학년 ${first ? '2학기' : '1학기'} 자료가 없어 같은 학년의 다른 학기 성적을 사용합니다.`);
    }
    const projection = d.generalHSThirdYearProjected
        ? '3학년 성적은 전년도 성적을 바탕으로 예상했습니다.'
        : (!d.generalHSThirdYearFinal ? '3학년 2학기는 3학년 1학기 성적으로 예상했습니다.' : '3학년 2학기 실제 성적을 반영했습니다.');
    return `<p class="counsel-summary-note">아래는 원자료의 학기별 단순 평균입니다. 일반고 석차는 학기별 가중치를 적용해 계산하므로 전체 단순 평균과 순서가 다를 수 있습니다. 일반적인 학년별 반영 비율은 1학년 17% · 2학년 34% · 3학년 49%이며, 학년 기록이 없으면 달라질 수 있습니다.</p>
        <div class="counsel-terms">${termHTML}</div>
        <p class="counsel-summary-note">${projection} ${substitutions.join(' ')}</p>`;
}

// 학교 안 위치 막대: 0~100%, 커트라인 구간(학교 판정 기준의 안정선~경계선)과 내 위치.
function percentBar(pct, s) {
    if (!(pct > 0)) return '';
    const at = Math.min(100, Math.max(0, pct));
    return `<div class="cg-bar" role="img" aria-label="우리 학교 안 위치 상위 ${score(pct, 2)}%, 커트라인 약 ${s.generalSafePct}~${s.generalBorderPct}%">
        <div class="cg-bar-track"><span class="cg-bar-band" style="left:${s.generalSafePct}%;width:${Math.max(1, s.generalBorderPct - s.generalSafePct)}%"></span><span class="cg-bar-dot" style="left:${at}%"></span></div>
        <div class="cg-bar-labels"><span>0%</span><span style="left:${at}%" class="cg-bar-me">내 위치 ${score(pct, 1)}%</span><span style="left:${(s.generalSafePct + s.generalBorderPct) / 2}%" class="cg-bar-cut">커트라인 약 ${s.generalSafePct}~${s.generalBorderPct}%</span><span>100%</span></div>
    </div>`;
}

function marginText(pct, s) {
    if (!(pct > 0)) return `학교 설정: 안정 ≤ ${s.generalSafePct}% · 경계 ≤ ${s.generalBorderPct}%`;
    if (pct <= s.generalSafePct) return `커트라인 구간(${s.generalSafePct}%)보다 ${score(s.generalSafePct - pct, 1)}%p 앞`;
    if (pct <= s.generalBorderPct) return `커트라인 구간(${s.generalSafePct}~${s.generalBorderPct}%) 안`;
    return `커트라인 구간(${s.generalBorderPct}%)보다 ${score(pct - s.generalBorderPct, 1)}%p 뒤`;
}

// 후기 일반고 내신 칸: 석차백분율(학교 안 위치)을 중심으로 판정·막대를 두고, 200점 내신 점수와 비교과 감점을 함께 적는다.
// 산출 근거와 후기 일반고 입력(창체·행발·학년별 출결·봉사·전입생 환산)은 접힌 칸으로 둔다(inputsHTML).
export function renderGeneralSummary(d, inputsHTML = '') {
    const result = judgeGeneralPercentile(d.generalHSPercentile);
    const settings = getJudgmentSettings();
    const total = Number(d.generalHSTotalScore || 0);
    const high = Number(d.generalHSTotalHigh || 0);
    const hasRange = high > total + 0.001;
    const projected = d.generalHSProjected || !d.generalHSThirdYearFinal || d.generalHSThirdYearProjected;
    const parts = [['교과', d.generalHSAcademicScore, 2], ['출석', d.generalHSAttendanceScore, 1],
        ['봉사', d.generalHSVolunteerScore, 1], ['행발', d.generalHSBehaviorScore, 0], ['창체', d.generalHSCreativeScore, 0]];
    const partsHTML = parts.map(([label, value, digits]) => `<div class="counsel-score-part"><span>${label}</span><strong>${score(value, digits)}</strong></div>`).join('');
    const rangeNote = hasRange ? ` · 미정 가산점 포함 ~ ${score(high, 2)}점` : '';
    const pct = Number(d.generalHSPercentile || 0);
    const rankText = d.generalHSRank > 0 && d.generalHSTotalStudents > 0 ? `${d.generalHSTotalStudents}명 중 ${d.generalHSRank}등` : '';
    // 비교과(출석 16·봉사 8·창체 8·행발 8)는 대부분 만점이라 가산점처럼 작용한다. 최종 판정은 200점이므로 감점이 있으면 알려 준다.
    const academic = Number(d.generalHSAcademicScore || 0);
    const nonAcademic = total - academic;
    const cuts = [['출석', 16, d.generalHSAttendanceScore], ['봉사', 8, d.generalHSVolunteerScore], ['창체', 8, d.generalHSCreativeScore], ['행발', 8, d.generalHSBehaviorScore]]
        .map(([label, max, v]) => [label, max - Number(v || 0)]).filter(([, cut]) => cut > 0.001);
    const cutTotal = cuts.reduce((a, [, c]) => a + c, 0);
    const cutNote = cutTotal > 0.001 ? `<p class="cg-cut">⚠ 비교과 ${score(cutTotal, 1)}점 감점(${cuts.map(([l, c]) => `${l} −${score(c, 1)}`).join(' · ')})${d.generalHSBonusEntered ? '' : ' · 창체·행발 가산점 미입력'} — 커트라인 근처라면 주의</p>` : '';
    return `<section class="counsel-general counsel-section" id="counselSecGeneral" aria-labelledby="counselGeneralTitle">
        <div class="cg-head"><h3 id="counselGeneralTitle">후기 일반고 내신</h3><span class="counsel-status">${projected ? '예상' : '확정'}</span></div>
        <div class="cg-main">
            <div class="cg-figure"><span>석차백분율(교과)</span><strong>상위 ${score(pct, 2)}<small>%</small></strong>${rankText ? `<p class="cg-note">${rankText}</p>` : ''}</div>
            <div class="cg-judge"><span class="counsel-judgment counsel-judgment--${result.level}">${result.emoji} ${result.label}${result.level === 'unknown' ? '' : ' 구간'}</span><p class="cg-note">${marginText(pct, settings)}</p></div>
        </div>
        ${percentBar(pct, settings)}
        <p class="cg-score">내신 점수 <strong>${score(total, 2)}</strong> / 200점 <span>(교과 ${score(academic, 2)} + 비교과 ${score(nonAcademic, 1)})${rangeNote}</span></p>
        ${cutNote}
        <p class="cg-note" id="generalLastYear" role="status"></p>
        <div class="counsel-city" id="generalCityCutoff" role="status">관내 추정 합격선 자료를 확인하고 있습니다.</div>
        <div class="counsel-score-parts" aria-label="내신 점수 구성">${partsHTML}</div>
        <div class="cg-folds">
            <details class="counsel-details"><summary>산출 근거 보기 <span aria-hidden="true">⌄</span></summary>
                <div class="counsel-details-body"><p class="counsel-summary-note">가산점 제외 기본 지표 ${score(d.generalHSBaseScore, 2)}점.</p>${semesterDetails(d)}<p class="counsel-summary-note">출석·봉사는 학년별로 산출합니다. ${d.generalHSPerGradeExact ? '학년별 자료를 반영했습니다.' : '학년별 미입력분은 누적 자료로 예상했습니다.'} ${d.generalHSBonusEntered ? '창체·행발 가산점 입력 완료.' : '창체·행발 가산점 미입력.'}</p></div>
            </details>
            ${inputsHTML ? `<details class="counsel-details no-print" id="generalInputsFold"><summary>✏️ 입력 고치기 <span class="cg-fold-hint">${d.generalHSBonusEntered ? '창체·행발 입력 완료' : '창체·행발 미입력'}</span> <span aria-hidden="true">⌄</span></summary>
                <div class="counsel-details-body">${inputsHTML}</div>
            </details>` : ''}
        </div>
    </section>`;
}
