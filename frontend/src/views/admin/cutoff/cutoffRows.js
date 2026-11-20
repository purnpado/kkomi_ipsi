import { escapeHtml, normalizeSchoolName, displayTrack } from '../../../core/utils.js';
import { admissionLabel } from '../../../core/admissionYear.js';
import { displaySchool } from '../../../core/schoolName.js';
import { buildPublicRowsHTML } from './cutoffPublicRows.js';

// 커트라인 관리: 저장값 대조표와 학교·학과별 입력 행 HTML 구성
export function buildCutoffRowsHTML(ctx, view) {
    // 현재 선택된 입학년도의 커트라인 매핑 (다양한 학과명/전형명 표기 완벽 호환)
    const savedMap = {};
    ctx.allSavedCutoffs.filter(c => Number(c.year) === Number(ctx.currentAdmissionYear)).forEach(c => {
        const schKey = normalizeSchoolName(c.schoolName);
        const deptNorm = ctx.normalizeDept(c.department);
        const trackNorm = ctx.normalizeTrack(c.track);
        const entry = {
            min: c.minValue,
            max: c.maxValue,
            avg: c.avgValue
        };

        // 정규화 키 및 원본 키 모두 등록
        savedMap[`${schKey}_${deptNorm}_${trackNorm}`] = entry;
        savedMap[`${schKey}_${c.department}_${c.track}`] = entry;
        savedMap[`${schKey}_${deptNorm}_${c.track}`] = entry;
        savedMap[`${schKey}_${c.department}_${trackNorm}`] = entry;

        // 공통/학교 전체인 경우
        if (deptNorm === '') {
            savedMap[`${schKey}_공통_${trackNorm}`] = entry;
            savedMap[`${schKey}_공통_${c.track}`] = entry;
            savedMap[`${schKey}__${trackNorm}`] = entry;
            savedMap[`${schKey}__${c.track}`] = entry;
        }
    });

    // 모든 학교를 그리고, 탭·검색은 화면에서 숨기기만 한다(cutoffList.js) — 탭을 바꿔도 입력한 값이 지워지지 않는다.
    const filteredSchools = ctx.defaultSchoolSpecs;

    // 학교 목록 카드 HTML 생성
    view.schoolsHTML = '';
    if (ctx.currentTab !== 'public') {
        {
            filteredSchools.forEach((sch, sIdx) => {
                const schKey = normalizeSchoolName(sch.name);
                // 저장된 커트라인 값 채우기 & 사용자 추가 학과 병합
                const itemsToRender = [];

                // 기본 스펙의 학과·전형 항목들 먼저 추가
                sch.items.forEach(it => {
                    const dNorm = ctx.normalizeDept(it.dept);
                    const tNorm = ctx.normalizeTrack(it.track);
                    if (!itemsToRender.some(x => ctx.normalizeDept(x.dept) === dNorm && ctx.normalizeTrack(x.track) === tNorm)) {
                        itemsToRender.push({ dept: dNorm, track: it.track });
                    }
                });

                // DB에 저장된 해당 연도 해당 고교의 커트라인 항목 병합 (공통/학교전체 포함!)
                ctx.allSavedCutoffs.filter(c => Number(c.year) === Number(ctx.currentAdmissionYear) && normalizeSchoolName(c.schoolName) === schKey).forEach(c => {
                    const dNorm = ctx.normalizeDept(c.department);
                    const tNorm = ctx.normalizeTrack(c.track);
                    const exists = itemsToRender.some(it => ctx.normalizeDept(it.dept) === dNorm && ctx.normalizeTrack(it.track) === tNorm);
                    if (!exists) {
                        itemsToRender.push({ dept: dNorm, track: c.track });
                    }
                });

                // 같은 학과는 하나의 셀로 묶고, 그 아래에서 일반·특별 등 전형별 점수만 구분
                const itemGroups = new Map();
                itemsToRender.forEach(item => {
                    const groupKey = ctx.normalizeDept(item.dept);
                    if (!itemGroups.has(groupKey)) itemGroups.set(groupKey, []);
                    itemGroups.get(groupKey).push(item);
                });
                const rowsHTML = [...itemGroups.entries()].map(([dept, group], groupIndex) =>
                    group.map((item, itemIndex) => {
                        const deptNorm = ctx.normalizeDept(item.dept);
                        const trackNorm = ctx.normalizeTrack(item.track);

                        // 1순위: 학과+전형 정확 매칭
                        let saved = savedMap[`${schKey}_${deptNorm}_${trackNorm}`] ||
                            savedMap[`${schKey}_${deptNorm}_${item.track}`] ||
                            savedMap[`${schKey}_${item.dept}_${item.track}`];

                        // 2순위: 학교 전체(공통) 행인 경우
                        if (!saved && deptNorm === '') {
                            saved = savedMap[`${schKey}_공통_${trackNorm}`] ||
                                savedMap[`${schKey}_공통_${item.track}`] ||
                                savedMap[`${schKey}__${trackNorm}`] ||
                                savedMap[`${schKey}__${item.track}`];
                        }

                        // 3순위: 학과 행인데 학과별 저장값이 없으면 학교 전체(공통) 기준선 자동 매핑
                        if (!saved && deptNorm !== '') {
                            saved = savedMap[`${schKey}__${trackNorm}`] ||
                                savedMap[`${schKey}__${item.track}`] ||
                                savedMap[`${schKey}_공통_${trackNorm}`] ||
                                savedMap[`${schKey}_공통_${item.track}`];
                        }

                        const minVal = saved && saved.min !== undefined && saved.min > 0 ? saved.min : '';
                        const maxVal = saved && saved.max !== undefined && saved.max > 0 ? saved.max : '';
                        const avgVal = saved && saved.avg !== undefined && saved.avg > 0 ? saved.avg : '';
                        const groupId = `${sIdx}-${groupIndex}`;
                        return `
                                <tr class="cutoff-item-row" data-school="${sch.name}" data-type="${sch.scoreType}" data-dept="${dept}" data-dept-group="${groupId}">
                                    ${itemIndex === 0 ? `<td class="cutoff-dept-cell" rowspan="${group.length}">
                                        <span class="cutoff-text">${dept ? escapeHtml(dept) : '<span class="cutoff-muted">학교 전체</span>'}</span>
                                        <input type="text" class="input-field cutoff-edit hidden row-dept-name" value="${escapeHtml(dept)}" placeholder="비우면 학교 전체" data-dept-group="${groupId}" aria-label="학과명" />
                                    </td>` : ''}
                                    <td><span class="cutoff-text">${escapeHtml(displayTrack(item.track))}</span><input type="text" class="input-field cutoff-edit hidden row-track-name" value="${escapeHtml(item.track)}" placeholder="전형 (예: 일반, 특별)" aria-label="전형" /></td>
                                    <td class="text-center"><span class="cutoff-score"><input type="text" inputmode="decimal" class="input-field cutoff-num row-min-score" value="${minVal}" placeholder="–" aria-label="최저점" /><span>${sch.unit}</span></span></td>
                                    <td class="text-center"><span class="cutoff-score"><input type="text" inputmode="decimal" class="input-field cutoff-num row-max-score" value="${maxVal}" placeholder="–" aria-label="최고 불합격점" /><span>${sch.unit}</span></span></td>
                                    <input type="hidden" class="row-avg-score" value="${avgVal}" />
                                    <td class="text-center whitespace-nowrap"><button type="button" class="cutoff-icon-btn btn-edit-row" title="학과·전형 이름 고치기" aria-label="학과·전형 이름 고치기">✏️</button><button type="button" class="cutoff-icon-btn btn-delete-row" title="행 삭제" aria-label="행 삭제">🗑️</button></td>
                                </tr>`;
                    }).join('')
                ).join('');

                const total = itemsToRender.length;
                const filled = (rowsHTML.match(/row-min-score" value="[^"]+"/g) || []).length;
                const searchText = [sch.name, sch.fullName || '', displaySchool(sch.name), ...itemsToRender.map(it => `${it.dept || ''} ${it.track || ''} ${displayTrack(it.track)}`)].join(' ').toLowerCase();
                view.schoolsHTML += `
                        <details class="school-cutoff-card cutoff-school" data-school="${sch.name}" data-category="${sch.category}" data-search="${escapeHtml(searchText)}" ${ctx.openSchools?.has(sch.name) ? 'open' : ''}>
                            <summary class="cutoff-summary">
                                <span class="cutoff-chev" aria-hidden="true">▸</span>
                                <strong>${escapeHtml(displaySchool(sch.fullName || sch.name))}</strong>
                                <span class="cutoff-chip">${sch.categoryLabel} · ${sch.totalMax}</span>
                                <span class="cutoff-progress num">입력 <b>${filled}</b> / ${total}칸</span>
                                ${filled === 0 ? '<span class="cutoff-tag">미입력</span>' : ''}
                            </summary>
                            <div class="cutoff-body">
                                <div class="cutoff-body-actions">
                                    <span class="cutoff-muted">${admissionLabel(ctx.currentAdmissionYear)} 기준 · 최저점(합격선)은 필수, 최고 불합격점은 선택</span>
                                    <button type="button" class="cutoff-sub-btn btn-add-dept" data-school="${sch.name}" data-type="${sch.scoreType}">➕ 학과·전형 추가</button>
                                </div>
                                <div class="overflow-x-auto">
                                    <table class="cutoff-table">
                                        <thead>
                                            <tr>
                                                <th class="w-44">학과명 <span class="cutoff-muted">(비우면 학교 전체)</span></th>
                                                <th class="w-44">전형</th>
                                                <th class="text-center w-40">최저점 (합격선)</th>
                                                <th class="text-center w-40">최고 불합격점 (선택)</th>
                                                <th class="text-center w-20">관리</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${rowsHTML}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </details>
                    `;
            });
        }
    } else {
        view.schoolsHTML = buildPublicRowsHTML(ctx);
    }
}
