// 종합성적표 1. 교과성적: 나이스 「내신성적 기초자료 확인서」와 같은 과목 × 6학기(성취도·환산점수·원점수) 표.
// 성취도는 칸 배경색(히트맵)으로 칠해 강한 과목·약한 학기가 한눈에 보이게 한다.
// 나이스의 "구분" 칸은 쓰임을 몰라 넣지 않는다(사용자 결정 2026-11-22, 쓰이는 곳이 확인되면 그때 추가).
import { escapeHtml } from '../../core/utils.js';

export const SEMESTERS = ['1-1', '1-2', '2-1', '2-2', '3-1', '3-2'];
const POINTS = { A: 5, B: 4, C: 3, D: 2, E: 1 };

// 나이스 확인서의 과목 순서. 목록에 없는 과목은 정보 뒤·체육 앞에 둔다.
const NICE_ORDER = ['국어', '도덕', '사회', '수학', '과학', '기술·가정', '영어', '역사', '한문', '정보'];
const ARTS_ORDER = ['체육', '미술', '음악'];

export function subjectPriority(name) {
    const clean = String(name).replace(/\s+/g, '').replace('기술가정', '기술·가정');
    const art = ARTS_ORDER.findIndex((s) => clean.includes(s));
    if (art >= 0) return 900 + art;
    const idx = NICE_ORDER.findIndex((s) => clean === s || clean.startsWith(s));
    return idx >= 0 ? idx : 500;
}

/** 나이스 교과 성적 원자료(행마다 열 이름이 조금씩 다름)를 과목별 학기 성적으로 모은다. */
export function collectSubjects(records = []) {
    const map = new Map();
    let lastGrade = '1';
    let lastSem = '1';
    let graded11 = false;
    for (const rec of records) {
        let grade = '', sem = '', subject = '', achieve = '', raw = '';
        for (const [k, v] of Object.entries(rec || {})) {
            const key = k.replace(/\s+/g, '').replace(/["'\r\n]/g, '');
            const val = String(v ?? '').trim().replace(/["'\r\n]/g, '');
            if (key.includes('학년도')) continue;
            if (key === '학년' || (key.includes('학년') && !key.includes('학기'))) grade = val;
            else if (key.includes('학기')) sem = val;
            else if (key.includes('성취도')) achieve = val;
            else if (key.includes('원점수') || key.includes('평균')) raw = val;
            else if (key === '과목' || key === '교과목' || key.includes('과목명') || key.includes('과목')) subject = val;
        }
        grade = grade || lastGrade; lastGrade = grade;
        sem = sem || lastSem; lastSem = sem;
        if (!subject || !achieve || subject === '/' || !isNaN(Number(subject)) || subject.length < 2) continue;
        const first = achieve[0].toUpperCase();
        const isPass = first === 'P' || achieve === '이수';
        if (!POINTS[first] && !isPass) continue;
        const semKey = `${grade.replace(/[^0-9]/g, '') || '1'}-${sem.replace(/[^0-9]/g, '') || '1'}`;
        if (semKey === '1-1' && POINTS[first]) graded11 = true;
        const norm = subject.replace(/\s+/g, '');
        if (!map.has(norm)) map.set(norm, { name: subject, scores: {} });
        // 원점수 칸에 "99/72.5"처럼 과목평균이 붙어 오면 원점수만 쓴다.
        map.get(norm).scores[semKey] = { achieve, letter: isPass ? 'P' : first, points: POINTS[first] || 0, raw: raw.split('/')[0] };
    }
    const subjects = [...map.values()].sort((a, b) => subjectPriority(a.name) - subjectPriority(b.name) || a.name.localeCompare(b.name, 'ko'));
    return { subjects, freeFirst: !graded11 };
}

const cell = (sc, proj = false) => {
    if (!sc) return '<td class="tr-empty" colspan="3">-</td>';
    const tone = `tr-g tr-g--${sc.letter}${proj ? ' tr-proj' : ''}`;
    // 성취도는 나이스 확인서처럼 글자만(원자료의 "D(311)" 같은 수강자수 표기는 마우스를 올리면 보임)
    return `<td class="${tone} tr-ach" title="${escapeHtml(sc.achieve)}">${sc.letter}</td><td class="${tone} num">${sc.points || '-'}</td><td class="${tone} num tr-raw">${escapeHtml(sc.raw || '-')}</td>`;
};

/** semSums: { '1-2': { sum, count } } — 학기별 성취점수 합(서버 계산, 원서 대조표와 같은 값)
 *  thirdFinal 이 아니면 석차·교과성적은 3학년 2학기를 1학기 성적으로 예상해 계산한다. 표도 같은 값을 흐리게 채워
 *  "교과성적이 어디서 나왔는지" 맞아 보이게 한다(3학년 전체를 전년도로 예상한 경우는 채우지 않음). */
export function subjectTableHTML({ subjects, freeFirst }, semSums, academic, thirdFinal, thirdProjected = false) {
    const fill32 = !thirdFinal && !thirdProjected;
    const head1 = SEMESTERS.map((k) => {
        const [g, s] = k.split('-');
        const projected = k === '3-2' && !thirdFinal;
        return `<th colspan="3" class="${k.endsWith('-1') ? 'tr-gstart' : ''}">${g}학년 ${s}학기${projected ? ` <span class="tr-tag">${fill32 ? '예상 · 1학기 성적' : '예상'}</span>` : ''}</th>`;
    }).join('');
    const head2 = SEMESTERS.map((k) => `<th class="tr-sub ${k.endsWith('-1') ? 'tr-gstart' : ''}">성취도</th><th class="tr-sub">환산</th><th class="tr-sub">원점수</th>`).join('');
    let body = '';
    if (!subjects.length) {
        body = `<tr><td colspan="${1 + SEMESTERS.length * 3}" class="tr-none">올린 교과 성적이 없습니다.</td></tr>`;
    } else {
        subjects.forEach((sub, i) => {
            const tds = SEMESTERS.map((k) => {
                if (k === '1-1' && freeFirst) {
                    return i === 0 ? `<td colspan="3" rowspan="${subjects.length}" class="tr-free"><span class="cg-chip cg-chip--info">자유학기</span><small>성적 미산출 · 내신 제외</small></td>` : '';
                }
                if (k === '3-2' && fill32 && !sub.scores['3-2']) return cell(sub.scores['3-1'], true);
                return cell(sub.scores[k]);
            }).join('');
            body += `<tr><th scope="row" class="tr-subj">${escapeHtml(sub.name)}</th>${tds}</tr>`;
        });
    }
    const sums = SEMESTERS.map((k) => {
        const proj = k === '3-2' && fill32 && !semSums['3-2'];
        const v = proj ? semSums['3-1'] : semSums[k];
        return `<td colspan="3" class="num tr-sum${proj ? ' tr-proj' : ''}">${v ? `<b>${v.sum}</b><small> (${v.count}과목${proj ? ' · 예상' : ''})</small>` : '-'}</td>`;
    }).join('');
    return `<div class="tr-scroll"><table class="tr-table tr-grades">
        <thead><tr><th rowspan="2" class="tr-subj">과목명</th>${head1}</tr><tr>${head2}</tr></thead>
        <tbody>${body}</tbody>
        <tfoot><tr><th scope="row" class="tr-subj">학기별점수<small>성취점수 합</small></th>${sums}</tr>
            <tr><th scope="row" class="tr-subj">교과성적</th><td colspan="${SEMESTERS.length * 3}" class="tr-total num"><b>${Number(academic || 0).toFixed(2)}</b><small> / 160</small></td></tr></tfoot>
    </table></div>`;
}
