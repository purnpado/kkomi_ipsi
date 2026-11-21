import { getJudgmentSettings, judgeGeneralPercentile } from '../../../core/admissionJudgment.js';
import { percentBar } from './generalBar.js';

const score = (value, digits = 1) => Number(value || 0).toFixed(digits);
const chip = (text, tone = '') => `<span class="cg-chip${tone ? ` cg-chip--${tone}` : ''}">${text}</span>`;

// 학기 성취도는 원자료의 단순 평균이다. 실제 석차 계산의 학기별 환산점수와 혼동하지 않도록 따로 표시한다.
function semesterDetails(d) {
    const terms = d.semesterScores || {};
    const rows = [['1_1', '1학년 1학기'], ['1_2', '1학년 2학기'], ['2_1', '2학년 1학기'],
        ['2_2', '2학년 2학기'], ['3_1', '3학년 1학기'], ['3_2', '3학년 2학기']];
    const termHTML = rows.map(([key, label]) => {
        const values = terms[key] || [];
        const avg = values.length ? `${(values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)}<small> / 5.0</small>` : '<em>자료 없음</em>';
        return `<div class="counsel-term"><span>${label}</span><strong>${avg}</strong></div>`;
    }).join('');
    const substitutions = [];
    for (const grade of ['2', '3']) {
        const first = (terms[`${grade}_1`] || []).length > 0;
        const second = (terms[`${grade}_2`] || []).length > 0;
        if (grade === '3' && !d.generalHSThirdYearFinal) continue;
        if (first !== second) substitutions.push(`${grade}학년 ${first ? '2학기' : '1학기'} 자료가 없어 같은 학년의 다른 학기 성적을 사용합니다.`);
    }
    const projection = d.generalHSThirdYearProjected
        ? chip('3학년: 전년도 성적으로 예상', 'warn')
        : (!d.generalHSThirdYearFinal ? chip('3학년 2학기: 1학기 성적으로 예상', 'warn') : chip('3학년 2학기 실제 성적 반영', 'ok'));
    return `<div class="cg-chips"><span class="cg-label">학기별 단순 평균</span>${chip('학년 반영 1학년 17%')}${chip('2학년 34%')}${chip('3학년 49%')}${projection}</div>
        <div class="counsel-terms">${termHTML}</div>
        <p class="counsel-summary-note">석차는 학기별 가중치를 적용해 계산하므로 위 단순 평균과 순서가 다를 수 있습니다. 학년 기록이 없으면 반영 비율이 달라집니다.${substitutions.length ? ` ${substitutions.join(' ')}` : ''}</p>`;
}

// 커트라인 구간과의 거리: [글자, 색]
function marginChip(pct, s) {
    if (!(pct > 0)) return chip(`학교 설정: 안정 ≤ ${s.generalSafePct}% · 경계 ≤ ${s.generalBorderPct}%`);
    if (pct <= s.generalSafePct) return chip(`커트라인보다 <b>${score(s.generalSafePct - pct, 1)}%p</b> 앞`, 'ok');
    if (pct <= s.generalBorderPct) return chip(`커트라인 구간(${s.generalSafePct}~${s.generalBorderPct}%) 안`, 'warn');
    return chip(`커트라인(${s.generalBorderPct}%)보다 <b>${score(pct - s.generalBorderPct, 1)}%p</b> 뒤`, 'bad');
}

// 비교과(출석 16·봉사 8·창체 8·행발 8)는 대부분 만점이라 가산점처럼 작용한다. 최종 판정은 200점이므로 감점이 있으면 알려 준다.
const NON_ACADEMIC = [['출석', 16, 'generalHSAttendanceScore', 1], ['봉사', 8, 'generalHSVolunteerScore', 1],
    ['행발', 8, 'generalHSBehaviorScore', 0], ['창체', 8, 'generalHSCreativeScore', 0]];

function cutBox(d) {
    const cuts = NON_ACADEMIC.map(([label, max, key]) => [label, max - Number(d[key] || 0)]).filter(([, cut]) => cut > 0.001);
    const cutTotal = cuts.reduce((a, [, c]) => a + c, 0);
    if (!(cutTotal > 0.001)) return '';
    return `<div class="cg-alert" role="note"><span class="cg-alert-title">⚠ 비교과 감점 ${score(cutTotal, 1)}점</span>
        ${cuts.map(([l, c]) => chip(`${l} −${score(c, 1)}`, 'bad')).join('')}
        ${d.generalHSBonusEntered ? '' : chip('창체·행발 가산점 미입력', 'warn')}
        <span class="cg-alert-hint">커트라인 근처라면 주의</span></div>`;
}

// 후기 일반고 내신 칸: 석차백분율(학교 안 위치)을 중심으로 판정·막대를 두고, 200점 내신 점수와 비교과 감점을 함께 적는다.
// 산출 근거와 후기 일반고 입력(창체·행발·학년별 출결·봉사·전입생 환산)은 접힌 칸으로 둔다(inputsHTML).
// 작년 우리 학교 결과(#generalLastYear)와 관내 합격선(#generalCityCutoff)은 generalCityCutoff.js가 나중에 채운다.
export function renderGeneralSummary(d, inputsHTML = '') {
    const result = judgeGeneralPercentile(d.generalHSPercentile);
    const settings = getJudgmentSettings();
    const total = Number(d.generalHSTotalScore || 0);
    const high = Number(d.generalHSTotalHigh || 0);
    const hasRange = high > total + 0.001;
    const projected = d.generalHSProjected || !d.generalHSThirdYearFinal || d.generalHSThirdYearProjected;
    const academic = Number(d.generalHSAcademicScore || 0);
    const nonAcademic = total - academic;
    const partsHTML = `<div class="counsel-score-part"><span>교과</span><strong>${score(academic, 2)}<small> / 160</small></strong></div>`
        + NON_ACADEMIC.map(([label, max, key, digits]) => {
            const v = Number(d[key] || 0);
            const short = max - v > 0.001;
            return `<div class="counsel-score-part${short ? ' is-short' : ''}"><span>${label}</span><strong>${score(v, digits)}<small> / ${max}</small></strong></div>`;
        }).join('');
    const pct = Number(d.generalHSPercentile || 0);
    const rankText = d.generalHSRank > 0 && d.generalHSTotalStudents > 0 ? `${d.generalHSTotalStudents}명 중 <b>${d.generalHSRank}등</b>` : '';
    return `<section class="counsel-general counsel-section" id="counselSecGeneral" aria-labelledby="counselGeneralTitle">
        <div class="cg-head"><h3 id="counselGeneralTitle">후기 일반고 내신</h3><span class="counsel-status">${projected ? '예상' : '확정'}</span></div>
        <div class="cg-main">
            <div class="cg-figure"><span>석차백분율(교과)</span><strong>상위 ${score(pct, 2)}<small>%</small></strong>${rankText ? `<div class="cg-chips">${chip(rankText)}</div>` : ''}</div>
            <div class="cg-judge"><span class="counsel-judgment counsel-judgment--${result.level}">${result.emoji} ${result.label}${result.level === 'unknown' ? '' : ' 구간'}</span><div class="cg-chips">${marginChip(pct, settings)}</div></div>
        </div>
        ${percentBar(pct, settings)}
        <div class="cg-score"><span class="cg-label">내신 점수</span><strong>${score(total, 2)}</strong><span class="cg-of">/ 200점</span>
            <span class="cg-chips">${chip(`교과 ${score(academic, 2)}`)}${chip(`비교과 ${score(nonAcademic, 1)}`)}${hasRange ? chip(`미정 가산점 포함 최대 ${score(high, 2)}`, 'info') : ''}</span></div>
        ${cutBox(d)}
        <div class="counsel-score-parts" aria-label="내신 점수 구성">${partsHTML}</div>
        <div class="cg-facts">
            <div class="cg-fact" id="generalLastYear" role="status"></div>
            <div class="cg-fact counsel-city" id="generalCityCutoff" role="status"><span class="cg-fact-label">관내 합격선</span><span>자료를 확인하고 있습니다.</span></div>
        </div>
        <div class="cg-folds">
            <details class="counsel-details"><summary>산출 근거 보기 <span aria-hidden="true">⌄</span></summary>
                <div class="counsel-details-body">
                    <div class="cg-chips">${chip(`가산점 제외 기본 지표 <b>${score(d.generalHSBaseScore, 2)}점</b>`)}${chip(d.generalHSPerGradeExact ? '출석·봉사 학년별 자료 반영' : '출석·봉사 학년별 미입력분은 누적 자료로 예상', d.generalHSPerGradeExact ? 'ok' : 'warn')}${chip(d.generalHSBonusEntered ? '창체·행발 가산점 입력 완료' : '창체·행발 가산점 미입력', d.generalHSBonusEntered ? 'ok' : 'warn')}</div>
                    ${semesterDetails(d)}
                </div>
            </details>
            ${inputsHTML ? `<details class="counsel-details no-print" id="generalInputsFold"><summary>✏️ 입력 고치기 <span class="cg-fold-hint">${d.generalHSBonusEntered ? '창체·행발 입력 완료' : '창체·행발 미입력'}</span> <span aria-hidden="true">⌄</span></summary>
                <div class="counsel-details-body">${inputsHTML}</div>
            </details>` : ''}
        </div>
    </section>`;
}
