// 자료 검증: 튀는 값으로 걸린 원서 한 건을, 실제로 비교한 다른 학교 합격 점수 분포 위에 보여 준다(한 줄 점 그림).
// dataviz 스킬 기준: 점 지름 10px·겹치면 바탕색 테두리, 글자는 글자 색(점 색 아님), 걸린 점은 색 + ⚠ 표시,
// 마우스를 올리면 점수(title). 색은 styles/tokens.css 의 --kk-chart-* (색약·명도 범위 검증 통과).
// 화면 너비에 따라 글자가 커지지 않도록 SVG 대신 백분율 위치의 HTML 로 그린다.
import { escapeHtml, displayTrack } from '../../core/utils.js';

const pct = (score, max) => `${(Math.min(1, Math.max(0, score / max)) * 100).toFixed(2)}%`;

/**
 * @param {{admissionYear:number, highSchool:string, track:string, status:string, score:number,
 *          refScope:string, fence:number, refScores:number[], refMax:number, code:string}} issue
 */
export function stripHTML(issue) {
    const max = issue.refMax || Math.max(...issue.refScores, issue.score) || 100;
    const dots = issue.refScores.map((v) => `<span class="vs-dot" style="left:${pct(v, max)}" title="다른 학교 합격 ${Number(v).toFixed(2)}점"></span>`).join('');
    const flag = `<span class="vs-dot vs-dot-flag" style="left:${pct(issue.score, max)}" title="⚠ 확인 필요 ${escapeHtml(issue.status)} ${Number(issue.score).toFixed(2)}점"></span>`
        + `<span class="vs-flag-label" style="left:${pct(issue.score, max)}">⚠ ${escapeHtml(issue.status)} ${Number(issue.score).toFixed(1)}</span>`;
    const fence = `<span class="vs-fence" style="left:${pct(issue.fence, max)}"></span><span class="vs-fence-label" style="left:${pct(issue.fence, max)}">확인 기준 ${Number(issue.fence).toFixed(1)}</span>`;
    const label = `${issue.admissionYear} 고입 ${issue.highSchool} ${displayTrack(issue.track)} ${issue.refScope}: 다른 학교 합격 ${issue.refScores.length}건, 확인 기준 ${Number(issue.fence).toFixed(2)}점, 걸린 원서 ${issue.status} ${Number(issue.score).toFixed(2)}점`;
    return `
        <figure class="vs-strip">
            <figcaption>${escapeHtml(issue.highSchool)} · ${escapeHtml(displayTrack(issue.track))} · ${escapeHtml(issue.refScope)} <span>${issue.admissionYear} 고입 · 다른 학교 합격 ${issue.refScores.length}건과 비교 · ${max}점 만점</span></figcaption>
            <div class="vs-plot" role="img" aria-label="${escapeHtml(label)}">
                <span class="vs-axis"></span>${fence}${dots}${flag}
                <span class="vs-tick" style="left:0">0</span><span class="vs-tick vs-tick-end">${max}</span>
            </div>
        </figure>`;
}
