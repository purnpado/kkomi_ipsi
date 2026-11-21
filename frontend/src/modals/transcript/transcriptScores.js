// 종합성적표: 맨 위 내신점수 한 줄(나이스 「내신성적 통지표」 2. 내신점수)과
// 2~5 출석·봉사·행동발달·창의체험 근거(나이스 「기초자료 확인서」, 학년별 값 → 성적).
// 학년별 점수는 Go 계산(generalHSYears)을 그대로 쓴다. 화면에서 다시 계산하지 않는다.
const f = (v, d = 1) => Number(v || 0).toFixed(d);
const sum3 = (a = []) => (a[0] || 0) + (a[1] || 0) + (a[2] || 0);

/** 맨 위 내신점수 표: 만점 줄 + 값 줄. 만점보다 낮은 칸은 강조한다. */
export function scoreSummaryHTML(d, nice) {
    const total = Number(d.generalHSTotalScore || 0);
    const final = nice > 0 ? nice : total;
    const cols = [
        ['교과성적', 160, d.generalHSAcademicScore, 2],
        ['출석성적', 16, d.generalHSAttendanceScore, 1],
        ['봉사활동', 8, d.generalHSVolunteerScore, 1],
        ['창의체험', 8, d.generalHSCreativeScore, 0],
        ['행동발달', 8, d.generalHSBehaviorScore, 0],
    ];
    const short = (max, v) => max - Number(v || 0) > 0.001;
    const head = cols.map(([l]) => `<th>${l}</th>`).join('') + '<th class="tr-sep">총점</th><th>석차백분율</th><th>내신성적</th><th>학년석차</th>';
    const maxRow = cols.map(([, m]) => `<td class="tr-max num">${m}</td>`).join('') + '<td class="tr-max num tr-sep">200</td><td class="tr-max">%</td><td class="tr-max num">200</td><td class="tr-max num">' + (d.generalHSTotalStudents || '-') + '명</td>';
    const valRow = cols.map(([, m, v, dg]) => `<td class="num ${short(m, v) ? 'tr-short' : ''}">${f(v, dg)}</td>`).join('')
        + `<td class="num tr-sep"><b>${f(total, 2)}</b></td>`
        + `<td class="num">${d.generalHSPercentile > 0 ? f(d.generalHSPercentile, 2) : '-'}<small class="tr-src">교과</small></td>`
        + `<td class="num"><b>${f(final, 2)}</b><small class="tr-src">${nice > 0 ? '나이스' : '계산'}</small></td>`
        + `<td class="num">${d.generalHSRank > 0 ? `${d.generalHSRank}등` : '-'}<small class="tr-src">교과</small></td>`;
    return `<table class="tr-table tr-summary"><thead><tr>${head}</tr></thead><tbody><tr class="tr-maxrow">${maxRow}</tr><tr>${valRow}</tr></tbody></table>`;
}

function rawYear(att, g, key) {
    const v = att[`${g}_${key}`];
    return v === undefined || v === null || v === '' ? null : Number(v);
}

/** 2. 출석성적: 학년마다 미인정 결석·지각·조퇴·결과 → 환산일수 → 학년 점수(4), 기본 4점 + 합 = 출석성적(16) */
export function attendanceHTML(d, att) {
    const y = d.generalHSYears || {};
    const rows = [1, 2, 3].map((g) => {
        const cells = ['absence', 'late', 'early', 'result'].map((k) => {
            const v = rawYear(att, g, k);
            return `<td class="num ${v > 0 ? 'tr-warn' : ''}">${v === null ? '-' : v}</td>`;
        }).join('');
        const pts = (y.attendancePts || [])[g - 1];
        return `<tr><th scope="row">${g}학년</th>${cells}<td class="num">${(y.absenceDays || [])[g - 1] ?? '-'}</td><td class="num ${pts < 4 ? 'tr-short' : ''}"><b>${f(pts)}</b><small> / 4</small></td></tr>`;
    }).join('');
    return `<section class="tr-block"><h4>2. 출석성적</h4>
        <table class="tr-table tr-mini"><thead><tr><th>학년</th><th>미인정 결석</th><th>미인정 지각</th><th>미인정 조퇴</th><th>미인정 결과</th><th>환산일수</th><th>학년 점수</th></tr></thead><tbody>${rows}</tbody></table>
        ${formulaHTML(4, sum3(y.attendancePts), d.generalHSAttendanceScore, 16, '출석성적')}
        ${y.exact === false ? '<p class="tr-foot"><span class="cg-chip cg-chip--warn">학년별 자료 일부 없음 — 누적값으로 예상</span></p>' : ''}</section>`;
}

/** 3. 봉사활동: 학년마다 활동시수(인정 시간) → 학년 점수(2), 기본 2점 + 합 = 봉사활동성적(8) */
export function volunteerHTML(d) {
    const y = d.generalHSYears || {};
    const rows = [1, 2, 3].map((g) => {
        const h = (y.volunteerHours || [])[g - 1];
        const c = (y.convertedHours || [])[g - 1];
        const converted = c !== undefined && Math.abs(c - (h || 0)) > 0.001;
        const pts = (y.volunteerPts || [])[g - 1];
        return `<tr><th scope="row">${g}학년</th><td class="num">${h ?? '-'}${converted ? ` <span class="cg-chip cg-chip--info">환산 ${f(c, 2)}</span>` : ''}</td><td class="num ${pts < 2 ? 'tr-short' : ''}"><b>${f(pts)}</b><small> / 2</small></td></tr>`;
    }).join('');
    return `<section class="tr-block"><h4>3. 봉사활동</h4>
        <table class="tr-table tr-mini"><thead><tr><th>학년</th><th>활동시수</th><th>학년 점수</th></tr></thead><tbody>${rows}</tbody></table>
        ${formulaHTML(2, sum3(y.volunteerPts), d.generalHSVolunteerScore, 8, '봉사활동성적')}</section>`;
}

const bonusChip = (state, entered) => {
    if (state === '인정') return '<span class="cg-chip cg-chip--ok">+1 인정</span>';
    if (state === '제외') return '<span class="cg-chip cg-chip--bad">제외</span>';
    return `<span class="cg-chip${entered ? '' : ' cg-chip--warn'}">${entered ? '0' : '미입력'}</span>`;
};

/** 4·5. 행동발달·창의체험: 기본 5점 + 학년별 추가 1점 = 성적(8) */
export function bonusHTML(d) {
    const y = d.generalHSYears || {};
    const entered = !!d.generalHSBonusEntered;
    const row = (no, label, states = [], score) => `<tr><th scope="row">${no}. ${label}</th><td class="num">5</td>${[0, 1, 2].map((i) => `<td>${bonusChip(states[i], entered)}</td>`).join('')}<td class="num ${score < 8 ? 'tr-short' : ''}"><b>${f(score, 0)}</b><small> / 8</small></td></tr>`;
    return `<section class="tr-block"><h4>4·5. 행동발달 · 창의체험</h4>
        <table class="tr-table tr-mini"><thead><tr><th>항목</th><th>기본점수</th><th>1학년</th><th>2학년</th><th>3학년</th><th>성적</th></tr></thead>
        <tbody>${row(4, '행동발달', y.behavior, d.generalHSBehaviorScore)}${row(5, '창의체험', y.creative, d.generalHSCreativeScore)}</tbody></table>
        <p class="tr-foot">학업성적관리위원회 명단으로 담임이 체크한 값${entered ? '' : ' · <span class="cg-chip cg-chip--warn">가산점 입력 전</span>'}</p></section>`;
}

function formulaHTML(base, years, total, max, label) {
    return `<p class="tr-formula"><span class="cg-chip">기본 ${base}</span> + <span class="cg-chip">학년별 ${f(years)}</span> = <span class="cg-chip ${max - Number(total || 0) > 0.001 ? 'cg-chip--bad' : 'cg-chip--ok'}">${label} <b>${f(total)}</b> / ${max}</span></p>`;
}
