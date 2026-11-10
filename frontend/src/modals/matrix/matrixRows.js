import { normalizeSchoolName } from '../../core/utils.js';
import { getGeneralGuideBadge } from '../../core/generalGuide.js';

// 신호등 매트릭스: 필터 상태와 표 행 생성기
export function defineMatrixRows(ctx, mx) {
    // 상태 변수
    mx.currentYearMode = 'last';
    mx.currentTrackMode = 'general';
    mx.currentClassFilter = ctx.initialClass;
    mx.currentSearchQuery = '';
    mx.currentSortMode = 'num_asc';

    // 테이블 본문(tbody) 생성 함수 (소수 둘째자리 표기, 줄바꿈 방지, 정밀 학생 검색 적용)
    mx.generateTableRows = (yearMode, trackMode) => {
        let filtered = [...mx.fullGrades];

        // 1. 학급 필터링
        if (mx.currentClassFilter !== 'all') {
            filtered = filtered.filter(s => String(s.classNum) === String(mx.currentClassFilter));
        }

        // 2. 검색어 정밀 필터링 (학번이나 이름 입력 시 해당 학생만 명확히 필터링)
        if (mx.currentSearchQuery) {
            const qRaw = mx.currentSearchQuery.trim();
            const qLower = qRaw.toLowerCase().replace(/\s+/g, '');
            const isDigitOnly = /^[0-9]+$/.test(qLower);

            filtered = filtered.filter(s => {
                const sName = (s.name || '').replace(/\s+/g, '').toLowerCase();
                const sNum = parseInt(s.studentNum, 10) || 0;
                const cNum = s.classNum || 0;

                // ① 이름 검색: 입력한 이름이 학생 이름에 포함되면 매칭
                if (sName.includes(qLower)) return true;

                // ② 순수 숫자 검색 (1~2자리 번호, 3~4자리 학번, 5자리 나이스 학번)
                if (isDigitOnly) {
                    const qVal = parseInt(qLower, 10);

                    // 1~2자리 번호 (예: '1', '2', '15')
                    if (qLower.length <= 2) {
                        // 사용자가 '1'을 입력했을 때, 번호가 정확히 1인 학생만 필터링 (10~19번 섞이지 않음)
                        return sNum === qVal;
                    }

                    // 3자리 학번 (예: 101 -> 1반 1번, 215 -> 2반 15번)
                    const shortId = parseInt(`${cNum}${String(sNum).padStart(2, '0')}`, 10);
                    if (shortId === qVal) return true;

                    // 4자리 학번 (예: 3101 -> 3학년 1반 1번, 1001 -> 10반 1번)
                    const fourDigitId1 = parseInt(`3${cNum}${String(sNum).padStart(2, '0')}`, 10);
                    const fourDigitId2 = parseInt(`${cNum}${String(sNum).padStart(2, '0')}`, 10); // 10반 1번 -> 1001
                    if (fourDigitId1 === qVal || fourDigitId2 === qVal) return true;

                    // 5자리 학번 (예: 30101 -> 3학년 1반 1번, 31001 -> 3학년 10반 1번)
                    const fullId = parseInt(`3${String(cNum).padStart(2, '0')}${String(sNum).padStart(2, '0')}`, 10);
                    if (fullId === qVal) return true;
                }

                // ③ 하이픈 학번 (예: '1-1', '2-15')
                if (qLower.includes('-')) {
                    const parts = qLower.split('-');
                    if (parts.length === 2) {
                        const targetClass = parseInt(parts[0], 10);
                        const targetNum = parseInt(parts[1], 10);
                        return cNum === targetClass && sNum === targetNum;
                    }
                }

                // ④ 한글 패턴 (예: '1반 1번', '1반1번')
                const koreanPattern = `${cNum}반${sNum}번`;
                if (koreanPattern === qLower) return true;
                if (qLower.endsWith('반') && `${cNum}반` === qLower) return true;

                return false;
            });
        }

        // 3. 정렬 적용
        filtered.sort((a, b) => {
            if (mx.currentSortMode === 'num_asc') {
                const cDiff = (a.classNum || 0) - (b.classNum || 0);
                if (cDiff !== 0) return cDiff;
                const numA = parseInt(a.studentNum) || 0;
                const numB = parseInt(b.studentNum) || 0;
                return numA - numB;
            } else if (mx.currentSortMode === 'name_asc') {
                return (a.name || '').localeCompare(b.name || '', 'ko');
            } else if (mx.currentSortMode === 'avg_desc') {
                return (b.allAverage || 0) - (a.allAverage || 0);
            } else if (mx.currentSortMode === 'avg_asc') {
                return (a.allAverage || 0) - (b.allAverage || 0);
            } else if (mx.currentSortMode === 'general_asc') {
                return (a.generalHSPercentile || 999) - (b.generalHSPercentile || 999);
            } else if (mx.currentSortMode === 'meister_desc') {
                return mx.getStudentSchoolScore(b, '울산마이스터고', trackMode) - mx.getStudentSchoolScore(a, '울산마이스터고', trackMode);
            } else if (mx.currentSortMode === 'energy_desc') {
                return mx.getStudentSchoolScore(b, '울산에너지고', trackMode) - mx.getStudentSchoolScore(a, '울산에너지고', trackMode);
            } else if (mx.currentSortMode === 'hyundai_desc') {
                return mx.getStudentSchoolScore(b, '현대공업고', trackMode) - mx.getStudentSchoolScore(a, '현대공업고', trackMode);
            }
            return 0;
        });

        // 화면 표시 인원수 및 헤더 뱃지 갱신
        const countEl = ctx.modalEl.querySelector('#matrixVisibleCount');
        if (countEl) countEl.textContent = filtered.length;

        const headerClassBadge = ctx.modalEl.querySelector('#matrixHeaderClassBadge');
        if (headerClassBadge) {
            headerClassBadge.textContent = mx.currentClassFilter === 'all' 
                ? `🏫 3학년 전교생 (총 ${mx.classCount}개 학급)` 
                : `🏫 3학년 ${mx.currentClassFilter}반`;
        }

        const headerTotalBadge = ctx.modalEl.querySelector('#matrixHeaderTotalBadge');
        if (headerTotalBadge) {
            headerTotalBadge.textContent = `표시 ${filtered.length}명 / 전체 ${mx.fullGrades.length}명`;
        }

        if (filtered.length === 0) {
            return `
                    <tr>
                        <td colspan="15" class="p-12 text-center text-slate-400 font-bold">
                            <span class="text-2xl block mb-2">🔍</span>
                            일치하는 학생 데이터가 없습니다. 검색어(이름 또는 학번)를 다시 확인해 보세요.
                        </td>
                    </tr>
                `;
        }

        let rowsHTML = '';
        filtered.forEach(s => {
            const getBadge = (schoolItem) => {
                if (!s || !s.schoolResults) return '<span class="text-slate-600 font-mono text-xs">-</span>';
                const targetNorm = normalizeSchoolName(schoolItem.fullName);
                let r = null;
                if (trackMode === 'special') {
                    r = s.schoolResults.find(x => normalizeSchoolName(x.schoolName) === targetNorm && (x.trackName.includes('특별') || x.trackName.includes('취업')));
                }
                if (!r) {
                    r = s.schoolResults.find(x => normalizeSchoolName(x.schoolName) === targetNorm && x.trackName.includes('일반'));
                }
                if (!r) return '<span class="text-slate-600 font-mono text-xs">-</span>';

                const cutoffVal = mx.getSchoolCutoffVal(schoolItem.fullName, trackMode, yearMode);
                const score = Number(r.totalScore || 0);
                const scoreStr = score.toFixed(2); // 소수 둘째자리 표기

                if (cutoffVal && cutoffVal > 0) {
                    const diff = score - cutoffVal;
                    const diffStr = diff >= 0 ? `+${diff.toFixed(2)}` : `${diff.toFixed(2)}`;
                    const tooltip = `기준선: ${cutoffVal.toFixed(2)}점 (${diffStr}점 차이)`;

                    // whitespace-nowrap, inline-flex, leading-none으로 절대 줄바꿈 없이 한 화면 쏙 표시
                    // 4단계 판정 구간 (안정 / 적정 / 소신 / 도전)
                    if (score >= cutoffVal + 3) {
                        return `<span class="inline-flex items-center justify-center gap-1 leading-none font-black text-emerald-300 bg-emerald-950/80 border border-emerald-400/60 px-2 py-0.5 rounded-full text-[11px] shadow-xs whitespace-nowrap" title="${tooltip} - 안정">🟢 ${scoreStr}</span>`;
                    } else if (score >= cutoffVal) {
                        return `<span class="inline-flex items-center justify-center gap-1 leading-none font-black text-indigo-300 bg-indigo-950/80 border border-indigo-400/60 px-2 py-0.5 rounded-full text-[11px] shadow-xs whitespace-nowrap" title="${tooltip} - 적정">🟡 ${scoreStr}</span>`;
                    } else if (score >= cutoffVal - 2) {
                        return `<span class="inline-flex items-center justify-center gap-1 leading-none font-black text-amber-300 bg-amber-950/80 border border-amber-400/60 px-2 py-0.5 rounded-full text-[11px] shadow-xs whitespace-nowrap" title="${tooltip} - 소신">🟠 ${scoreStr}</span>`;
                    } else {
                        return `<span class="inline-flex items-center justify-center gap-1 leading-none font-bold text-rose-300 bg-rose-950/80 border border-rose-500/60 px-2 py-0.5 rounded-full text-[11px] shadow-xs whitespace-nowrap" title="${tooltip} - 도전">🔴 ${scoreStr}</span>`;
                    }
                }
                return `<span class="text-slate-300 font-mono font-medium text-[11px] whitespace-nowrap">${scoreStr}</span>`;
            };

            const generalBadge = getGeneralGuideBadge(s.generalHSPercentile);
            const avgStr = Number(s.allAverage || 0).toFixed(2);

            rowsHTML += `
                    <tr class="hover:bg-slate-800/70 border-b border-slate-700/50 text-center transition-colors">
                        <td class="px-1 py-1.5 text-indigo-300 font-bold font-mono text-xs whitespace-nowrap">
                            <span class="px-1.5 py-0.5 rounded bg-indigo-950 border border-indigo-500/40">${s.classNum}반</span>
                        </td>
                        <td class="px-1 py-1.5 text-slate-400 font-mono font-bold whitespace-nowrap text-xs">${s.studentNum}</td>
                        <td class="px-1.5 py-1.5 font-bold text-white cursor-pointer hover:text-indigo-300 hover:underline matrix-student-name transition-colors whitespace-nowrap text-xs"
                            data-class="${s.classNum}" data-num="${s.studentNum}" data-name="${s.name}" title="클릭하여 1:1 진학 상담 열기">
                            ${s.name}
                        </td>
                        <td class="px-1 py-1.5 text-indigo-300 font-bold font-mono text-xs whitespace-nowrap">${avgStr}</td>
                        ${mx.schoolKeywords.map(sch => `<td class="px-1 py-1.5 whitespace-nowrap text-center">${getBadge(sch)}</td>`).join('')}
                        <td class="px-2 py-1.5 font-bold whitespace-nowrap text-center">${generalBadge}</td>
                    </tr>
                `;
        });
        return rowsHTML;
    };

    mx.getModeDescription = (yearMode, trackMode) => {
        const yearText = yearMode === 'last' ? '🎯 <strong>직전 1개년(작년)</strong>'
                       : yearMode === 'avg3' ? '📊 <strong>최근 3개년 누적 평균선</strong>'
                       : '📈 <strong>최근 5개년 장기 추세선</strong>';
        const trackText = trackMode === 'special' ? '<span class="text-amber-300 font-bold">[특별전형 · 취업희망자]</span>'
                                                  : '<span class="text-indigo-300 font-bold">[일반전형]</span>';
        
        const meisterCutoff = mx.getSchoolCutoffVal('울산마이스터고', trackMode, yearMode);
        const meisterInfo = meisterCutoff > 0 ? ` · <span class="text-emerald-300">울산마이스터 기준선: ${meisterCutoff.toFixed(2)}점</span>` : '';

        return `${yearText} 기준 ${trackText} 학생 환산점수 및 합격선을 대조합니다.${meisterInfo}`;
    };
}
