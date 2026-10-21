// ===== 📊 신호등 매트릭스 모달 모듈 =====
import { printOnly } from '../print/printEngine.js';
import { escapeHtml, escapeAttr, normalizeSchoolName, normalizeDept, normalizeTrack } from '../core/utils.js';

export async function openMatrixModal(classNum = null) {
    document.getElementById('matrixModal')?.remove();

    const initialClass = classNum ? String(classNum) : 'all';

    const modalEl = document.createElement('div');
    modalEl.id = 'matrixModal';
    modalEl.className = 'fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-200';
    modalEl.innerHTML = `
        <div class="glass-card p-8 w-full max-w-[1850px] text-center">
            <span class="spinner"></span> 
            <span class="text-white ml-2">${classNum ? `${classNum}반 학생들의 신호등 매트릭스를 구성하는 중...` : '3학년 전교생의 5개년 신호등 매트릭스를 구성하는 중...'}</span>
        </div>
    `;
    document.body.appendChild(modalEl);

    try {
        let fullGrades = [];
        let classCount = 8;
        try {
            const config = await window.go.main.App.GetSchoolConfig();
            if (config?.classCount) classCount = config.classCount;
        } catch (e) {
            console.warn(e);
        }

        // 전체 학급 데이터를 일괄 로드하여 반별/전체 필터 전환을 자유롭게 지원
        const promises = [];
        for (let c = 1; c <= classCount; c++) {
            promises.push(
                window.go.main.App.GetClassFullGrades(c).catch(() => []).then(list => {
                    (list || []).forEach(s => { s.classNum = c; });
                    return list || [];
                })
            );
        }
        const allResults = await Promise.all(promises);
        fullGrades = allResults.flat();

        const cutoffs = await window.go.main.App.GetCutoffs().catch(() => []);

        // 학교 목록 정의 (정확한 공식 명칭 기반 완전 일치)
        const schoolKeywords = [
            { fullName: '울산마이스터고', label: '울산마이스터', isMeister: true },
            { fullName: '울산에너지고', label: '에너지고', isMeister: true },
            { fullName: '현대공업고', label: '현대공고', isMeister: true },
            { fullName: '울산상업고', label: '울산상고', isMeister: false },
            { fullName: '울산여자상업고', label: '울산여상', isMeister: false },
            { fullName: '울산생활과학고', label: '울산생과고', isMeister: false },
            { fullName: '울산공업고', label: '울산공고', isMeister: false },
            { fullName: '울산산업고', label: '울산산업고', isMeister: false },
            { fullName: '울산미용예술고', label: '미용예술고', isMeister: false },
            { fullName: '울산기술공업고', label: '기술공고', isMeister: false }
        ];

        // 전형별(general/special) 및 학교별 연도별 커트라인 히스토리 맵 구축 (정확한 학교명 일치)
        const cutoffHistoryMap = new Map();
        schoolKeywords.forEach(s => {
            const sNorm = normalizeSchoolName(s.fullName);
            ['general', 'special'].forEach(trackType => {
                const historyByYear = new Map();
                (cutoffs || []).filter(c => {
                    if (normalizeSchoolName(c.schoolName) !== sNorm || Number(c.minValue) <= 0) return false;
                    const isSpec = c.track.includes('특별') || c.track.includes('취업');
                    return trackType === 'special' ? isSpec : !isSpec;
                }).sort((a, b) => b.year - a.year)
                  .forEach(c => {
                      if (!historyByYear.has(c.year)) {
                          historyByYear.set(c.year, Number(c.minValue));
                      }
                  });

                const sortedValues = [...historyByYear.entries()].sort((a, b) => b[0] - a[0]).map(x => x[1]);
                cutoffHistoryMap.set(`${s.fullName}_${trackType}`, sortedValues);
            });
        });

        // 특정 학교/전형/연도모드 기준선 계산 함수
        const getSchoolCutoffVal = (schoolName, trackType, yearMode) => {
            const history = cutoffHistoryMap.get(`${schoolName}_${trackType}`) || [];
            if (!history.length) return 0;
            if (yearMode === 'last') {
                return history[0] || 0;
            } else if (yearMode === 'avg3') {
                const slice3 = history.slice(0, 3);
                return slice3.length ? slice3.reduce((a, b) => a + b, 0) / slice3.length : 0;
            } else if (yearMode === 'avg5') {
                const slice5 = history.slice(0, 5);
                return slice5.length ? slice5.reduce((a, b) => a + b, 0) / slice5.length : 0;
            }
            return history[0] || 0;
        };

        // 학생의 특정 고교 환산점수 반환 헬퍼 (정확한 학교명 완전 일치 매칭)
        const getStudentSchoolScore = (student, schoolName, trackMode) => {
            if (!student || !student.schoolResults) return 0;
            const targetNorm = normalizeSchoolName(schoolName);
            let r = null;
            if (trackMode === 'special') {
                r = student.schoolResults.find(x => normalizeSchoolName(x.schoolName) === targetNorm && (x.trackName.includes('특별') || x.trackName.includes('취업')));
            }
            if (!r) {
                r = student.schoolResults.find(x => normalizeSchoolName(x.schoolName) === targetNorm && x.trackName.includes('일반'));
            }
            return r ? Number(r.totalScore || 0) : 0;
        };

        // 상태 변수
        let currentYearMode = 'last';
        let currentTrackMode = 'general';
        let currentClassFilter = initialClass;
        let currentSearchQuery = '';
        let currentSortMode = 'num_asc';

        // 테이블 본문(tbody) 생성 함수 (소수 둘째자리 표기, 줄바꿈 방지, 정밀 학생 검색 적용)
        const generateTableRows = (yearMode, trackMode) => {
            let filtered = [...fullGrades];

            // 1. 학급 필터링
            if (currentClassFilter !== 'all') {
                filtered = filtered.filter(s => String(s.classNum) === String(currentClassFilter));
            }

            // 2. 검색어 정밀 필터링 (학번이나 이름 입력 시 해당 학생만 명확히 필터링)
            if (currentSearchQuery) {
                const qRaw = currentSearchQuery.trim();
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
                if (currentSortMode === 'num_asc') {
                    const cDiff = (a.classNum || 0) - (b.classNum || 0);
                    if (cDiff !== 0) return cDiff;
                    const numA = parseInt(a.studentNum) || 0;
                    const numB = parseInt(b.studentNum) || 0;
                    return numA - numB;
                } else if (currentSortMode === 'name_asc') {
                    return (a.name || '').localeCompare(b.name || '', 'ko');
                } else if (currentSortMode === 'avg_desc') {
                    return (b.allAverage || 0) - (a.allAverage || 0);
                } else if (currentSortMode === 'avg_asc') {
                    return (a.allAverage || 0) - (b.allAverage || 0);
                } else if (currentSortMode === 'general_asc') {
                    return (a.generalHSPercentile || 999) - (b.generalHSPercentile || 999);
                } else if (currentSortMode === 'meister_desc') {
                    return getStudentSchoolScore(b, '울산마이스터고', trackMode) - getStudentSchoolScore(a, '울산마이스터고', trackMode);
                } else if (currentSortMode === 'energy_desc') {
                    return getStudentSchoolScore(b, '울산에너지고', trackMode) - getStudentSchoolScore(a, '울산에너지고', trackMode);
                } else if (currentSortMode === 'hyundai_desc') {
                    return getStudentSchoolScore(b, '현대공업고', trackMode) - getStudentSchoolScore(a, '현대공업고', trackMode);
                }
                return 0;
            });

            // 화면 표시 인원수 및 헤더 뱃지 갱신
            const countEl = modalEl.querySelector('#matrixVisibleCount');
            if (countEl) countEl.textContent = filtered.length;

            const headerClassBadge = modalEl.querySelector('#matrixHeaderClassBadge');
            if (headerClassBadge) {
                headerClassBadge.textContent = currentClassFilter === 'all' 
                    ? `🏫 3학년 전교생 (총 ${classCount}개 학급)` 
                    : `🏫 3학년 ${currentClassFilter}반`;
            }

            const headerTotalBadge = modalEl.querySelector('#matrixHeaderTotalBadge');
            if (headerTotalBadge) {
                headerTotalBadge.textContent = `표시 ${filtered.length}명 / 전체 ${fullGrades.length}명`;
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

                    const cutoffVal = getSchoolCutoffVal(schoolItem.fullName, trackMode, yearMode);
                    const score = Number(r.totalScore || 0);
                    const scoreStr = score.toFixed(2); // 소수 둘째자리 표기

                    if (cutoffVal && cutoffVal > 0) {
                        const diff = score - cutoffVal;
                        const diffStr = diff >= 0 ? `+${diff.toFixed(2)}` : `${diff.toFixed(2)}`;
                        const tooltip = `기준선: ${cutoffVal.toFixed(2)}점 (${diffStr}점 차이)`;

                        // whitespace-nowrap, inline-flex, leading-none으로 절대 줄바꿈 없이 한 화면 쏙 표시
                        if (score >= cutoffVal + 5) {
                            return `<span class="inline-flex items-center justify-center gap-1 leading-none font-black text-emerald-300 bg-emerald-950/80 border border-emerald-400/60 px-2 py-0.5 rounded-full text-[11px] shadow-xs whitespace-nowrap" title="${tooltip} - 안정">🟢 ${scoreStr}</span>`;
                        } else if (score >= cutoffVal) {
                            return `<span class="inline-flex items-center justify-center gap-1 leading-none font-black text-amber-200 bg-amber-950/80 border border-amber-400/60 px-2 py-0.5 rounded-full text-[11px] shadow-xs whitespace-nowrap" title="${tooltip} - 적정/경계">🟡 ${scoreStr}</span>`;
                        } else {
                            return `<span class="inline-flex items-center justify-center gap-1 leading-none font-bold text-rose-300 bg-rose-950/80 border border-rose-500/60 px-2 py-0.5 rounded-full text-[11px] shadow-xs whitespace-nowrap" title="${tooltip} - 소신/주의">🔴 ${scoreStr}</span>`;
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
                        ${schoolKeywords.map(sch => `<td class="px-1 py-1.5 whitespace-nowrap text-center">${getBadge(sch)}</td>`).join('')}
                        <td class="px-2 py-1.5 font-bold whitespace-nowrap text-center">${generalBadge}</td>
                    </tr>
                `;
            });
            return rowsHTML;
        };

        const getModeDescription = (yearMode, trackMode) => {
            const yearText = yearMode === 'last' ? '🎯 <strong>직전 1개년(작년)</strong>'
                           : yearMode === 'avg3' ? '📊 <strong>최근 3개년 누적 평균선</strong>'
                           : '📈 <strong>최근 5개년 장기 추세선</strong>';
            const trackText = trackMode === 'special' ? '<span class="text-amber-300 font-bold">[특별전형 · 취업희망자]</span>'
                                                      : '<span class="text-indigo-300 font-bold">[일반전형]</span>';
            
            const meisterCutoff = getSchoolCutoffVal('울산마이스터고', trackMode, yearMode);
            const meisterInfo = meisterCutoff > 0 ? ` · <span class="text-emerald-300">울산마이스터 기준선: ${meisterCutoff.toFixed(2)}점</span>` : '';

            return `${yearText} 기준 ${trackText} 학생 환산점수 및 합격선을 대조합니다.${meisterInfo}`;
        };

        modalEl.innerHTML = `
            <div class="glass-card print-document p-4 sm:p-6 w-full max-w-[1920px] max-h-[94vh] overflow-y-auto space-y-3.5">
                <!-- 모달 헤더 -->
                <div class="flex items-center justify-between border-b border-slate-700/50 pb-3 flex-wrap gap-3">
                    <div>
                        <div class="flex items-center gap-2 flex-wrap">
                            <span id="matrixHeaderClassBadge" class="px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 text-xs font-bold">
                                ${currentClassFilter === 'all' ? `🏫 3학년 전교생 (총 ${classCount}개 학급)` : `🏫 3학년 ${currentClassFilter}반`}
                            </span>
                            <span id="matrixHeaderTotalBadge" class="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-xs font-bold">
                                총 ${fullGrades.length}명
                            </span>
                        </div>
                        <h2 class="text-2xl font-black text-white flex items-center gap-2 mt-1">
                            📊 관내 고교별 진학 신호등 종합 매트릭스
                        </h2>
                    </div>
                    <button id="closeMatrixBtn" class="no-print text-slate-400 hover:text-white p-2 text-2xl font-bold bg-transparent border-none cursor-pointer leading-none">✕</button>
                </div>

                <!-- 1열: 6개 원클릭 탭 바 & 실시간 설명 바 -->
                <div class="flex items-center justify-between gap-3 flex-wrap bg-slate-900/70 p-2.5 rounded-2xl border border-slate-700/60 shadow-inner">
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="text-xs font-bold text-slate-300 flex items-center gap-1 mr-1">
                            <span>⚙️</span> 전형·연도 선택:
                        </span>
                        <div class="flex items-center gap-1.5 flex-wrap">
                            <!-- 1. 직전 1개년 -->
                            <button class="matrix-6tab px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer border" data-year="last" data-track="general">
                                🎯 직전 1년 · 일반
                            </button>
                            <button class="matrix-6tab px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer border" data-year="last" data-track="special">
                                🌟 직전 1년 · 특별(취업)
                            </button>

                            <!-- 2. 최근 3개년 평균 -->
                            <button class="matrix-6tab px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer border" data-year="avg3" data-track="general">
                                📊 최근 3년 · 일반
                            </button>
                            <button class="matrix-6tab px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer border" data-year="avg3" data-track="special">
                                ✨ 최근 3년 · 특별(취업)
                            </button>

                            <!-- 3. 최근 5개년 장기 -->
                            <button class="matrix-6tab px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer border" data-year="avg5" data-track="general">
                                📈 최근 5년 · 일반
                            </button>
                            <button class="matrix-6tab px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer border" data-year="avg5" data-track="special">
                                🚀 최근 5년 · 특별(취업)
                            </button>
                        </div>
                    </div>
                    <div id="matrixModeDesc" class="text-xs text-indigo-200 font-medium">
                        ${getModeDescription(currentYearMode, currentTrackMode)}
                    </div>
                </div>

                <!-- 2열: 정렬, 검색, 학급 필터 도구 바 (전체/반별 매트릭스 모두 완벽 지원) -->
                <div class="flex items-center justify-between gap-3 flex-wrap bg-slate-900/50 p-2.5 rounded-2xl border border-slate-700/50">
                    <div class="flex items-center gap-2.5 flex-wrap">
                        <!-- 학급 필터 드롭다운 (반별 모달에서도 자유롭게 전체 및 타 학급 전환 가능) -->
                        <div class="flex items-center gap-1.5 bg-slate-800 px-3 py-1 rounded-xl border border-slate-700 text-xs shadow-xs">
                            <span class="font-bold text-indigo-300">🏫 학급:</span>
                            <select id="matrixClassSelect" class="bg-slate-900 text-white font-bold text-xs rounded-lg border border-slate-600 px-2 py-0.5 outline-none cursor-pointer">
                                <option value="all" ${currentClassFilter === 'all' ? 'selected' : ''}>전체 학급 (${classCount}개 학급)</option>
                                ${Array.from({ length: classCount }, (_, i) => `<option value="${i + 1}" ${String(currentClassFilter) === String(i + 1) ? 'selected' : ''}>${i + 1}반</option>`).join('')}
                            </select>
                        </div>

                        <!-- 정밀 학생 검색창 -->
                        <div class="flex items-center gap-2 bg-slate-800 px-3 py-1 rounded-xl border border-slate-700 text-xs shadow-xs">
                            <span class="text-slate-400">🔍</span>
                            <input type="text" id="matrixSearchInput" placeholder="학생 성명 또는 학번 검색 (예: 강감찬, 1, 101)" 
                                   class="bg-transparent text-white ph-muted font-medium text-xs outline-none w-44 sm:w-64" />
                            <button id="clearMatrixSearchBtn" class="text-slate-400 hover:text-white text-xs cursor-pointer hidden">✕</button>
                        </div>

                        <!-- 정렬 드롭다운 -->
                        <div class="flex items-center gap-1.5 bg-slate-800 px-3 py-1 rounded-xl border border-slate-700 text-xs shadow-xs">
                            <span class="font-bold text-indigo-300">🔃 정렬:</span>
                            <select id="matrixSortSelect" class="bg-slate-900 text-white font-bold text-xs rounded-lg border border-slate-600 px-2 py-0.5 outline-none cursor-pointer">
                                <option value="num_asc">학번 기본순</option>
                                <option value="name_asc">성명 가나다순</option>
                                <option value="avg_desc">내신평균 높은순 (상위권)</option>
                                <option value="avg_asc">내신평균 낮은순</option>
                                <option value="general_asc">일반고 안정순 (석차백분율 낮은순)</option>
                                <option value="meister_desc">울산마이스터 환산점 높은순</option>
                                <option value="energy_desc">울산에너지고 환산점 높은순</option>
                                <option value="hyundai_desc">현대공업고 환산점 높은순</option>
                            </select>
                        </div>
                    </div>

                    <!-- 표시 인원수 뱃지 -->
                    <div class="text-xs font-bold text-slate-400 bg-slate-800/80 px-3 py-1 rounded-xl border border-slate-700">
                        표시 인원: <span class="text-emerald-400 font-mono text-sm font-black" id="matrixVisibleCount">${fullGrades.length}</span>명
                    </div>
                </div>

                <!-- 매트릭스 테이블 (가로 스크롤 없이 모니터 한 화면에 100% 쏙 들어가도록 유연한 반응형 구조 적용) -->
                <div class="overflow-x-auto rounded-xl border border-slate-700/50 bg-slate-800/30 custom-scrollbar">
                    <table class="w-full text-left border-collapse text-xs">
                        <thead>
                            <tr class="bg-slate-800/90 text-text-muted border-b border-slate-700/70 text-center whitespace-nowrap">
                                <th class="p-2 w-12 font-bold text-indigo-300">반</th>
                                <th class="p-2 w-10 font-bold">번호</th>
                                <th class="p-2 w-16 font-bold">성명</th>
                                <th class="p-2 w-16 font-bold text-indigo-300">내신평균</th>
                                <th class="p-1.5 text-amber-300 font-bold">🎓 울산마이스터</th>
                                <th class="p-1.5 text-amber-300 font-bold">🎓 에너지고</th>
                                <th class="p-1.5 text-amber-300 font-bold">🎓 현대공고</th>
                                <th class="p-1.5 text-cyan-300 font-bold">🏭 울산상고</th>
                                <th class="p-1.5 text-cyan-300 font-bold">🏭 울산여상</th>
                                <th class="p-1.5 text-cyan-300 font-bold">🏭 울산생과고</th>
                                <th class="p-1.5 text-cyan-300 font-bold">🏭 울산공고</th>
                                <th class="p-1.5 text-cyan-300 font-bold">🏭 울산산업고</th>
                                <th class="p-1.5 text-cyan-300 font-bold">🏭 미용예술고</th>
                                <th class="p-1.5 text-cyan-300 font-bold">🏭 기술공고</th>
                                <th class="p-2 w-32 text-emerald-300 font-bold whitespace-nowrap">🏫 후기 일반계고</th>
                            </tr>
                        </thead>
                        <tbody id="matrixTableBody">
                            ${generateTableRows(currentYearMode, currentTrackMode)}
                        </tbody>
                    </table>
                </div>

                <!-- 하단 범례 및 인쇄 버튼 -->
                <div class="flex justify-between items-center text-xs text-text-muted flex-wrap gap-3 pt-1">
                    <div class="flex items-center gap-3 flex-wrap">
                        <span><strong>신호등 범례:</strong></span>
                        <span class="inline-flex items-center gap-1 text-emerald-300 font-black bg-emerald-950/80 px-2.5 py-0.5 rounded-full border border-emerald-400/50">🟢 안정 (기준선 +5점 이상)</span>
                        <span class="inline-flex items-center gap-1 text-amber-300 font-black bg-amber-950/80 px-2.5 py-0.5 rounded-full border border-amber-400/50">🟡 적정/경계 (기준선 이상)</span>
                        <span class="inline-flex items-center gap-1 text-rose-300 font-black bg-rose-950/80 px-2.5 py-0.5 rounded-full border border-rose-400/50">🔴 소신/주의 (기준선 미만)</span>
                        <span class="text-slate-400 font-medium">※ 학생 이름을 클릭하면 해당 학생의 1:1 세부 상담 화면으로 즉시 이동합니다.</span>
                    </div>
                    <button id="matrixPrintBtn" class="no-print btn-secondary text-xs px-3.5 py-2 font-bold inline-flex items-center gap-1.5 rounded-xl cursor-pointer">
                        <span>🖨️</span> 매트릭스 인쇄
                    </button>
                </div>
            </div>
        `;

        // 탭 스타일 갱신 헬퍼 함수
        const updateTabStyles = () => {
            modalEl.querySelectorAll('.matrix-6tab').forEach(btn => {
                const y = btn.dataset.year;
                const t = btn.dataset.track;
                const isSelected = (y === currentYearMode && t === currentTrackMode);

                if (isSelected) {
                    if (t === 'special') {
                        btn.className = 'matrix-6tab px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer bg-amber-500 text-slate-950 border-amber-400 shadow-lg shadow-amber-500/25 scale-105';
                    } else {
                        btn.className = 'matrix-6tab px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer bg-primary text-white border-indigo-400 shadow-lg shadow-indigo-500/25 scale-105';
                    }
                } else {
                    if (t === 'special') {
                        btn.className = 'matrix-6tab px-3 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer bg-amber-950/30 text-amber-300/80 border-amber-500/30 hover:bg-amber-900/40 hover:text-amber-200';
                    } else {
                        btn.className = 'matrix-6tab px-3 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white';
                    }
                }
            });
        };

        const renderTableOnly = () => {
            const tbodyEl = modalEl.querySelector('#matrixTableBody');
            if (tbodyEl) {
                tbodyEl.innerHTML = generateTableRows(currentYearMode, currentTrackMode);
                bindStudentNameClick();
            }
        };

        updateTabStyles();

        // 6개 탭 클릭 이벤트 바인딩
        modalEl.querySelectorAll('.matrix-6tab').forEach(btn => {
            btn.addEventListener('click', () => {
                const y = btn.dataset.year;
                const t = btn.dataset.track;
                if (currentYearMode === y && currentTrackMode === t) return;

                currentYearMode = y;
                currentTrackMode = t;
                updateTabStyles();

                const descEl = modalEl.querySelector('#matrixModeDesc');
                if (descEl) descEl.innerHTML = getModeDescription(currentYearMode, currentTrackMode);

                renderTableOnly();
            });
        });

        // 학급 필터 변경 이벤트
        modalEl.querySelector('#matrixClassSelect')?.addEventListener('change', (e) => {
            currentClassFilter = e.target.value;
            renderTableOnly();
        });

        // 정렬 모드 변경 이벤트
        modalEl.querySelector('#matrixSortSelect')?.addEventListener('change', (e) => {
            currentSortMode = e.target.value;
            renderTableOnly();
        });

        // 검색창 실시간 입력 이벤트
        const searchInput = modalEl.querySelector('#matrixSearchInput');
        const clearSearchBtn = modalEl.querySelector('#clearMatrixSearchBtn');
        searchInput?.addEventListener('input', (e) => {
            currentSearchQuery = e.target.value;
            if (clearSearchBtn) {
                clearSearchBtn.classList.toggle('hidden', !currentSearchQuery);
            }
            renderTableOnly();
        });
        clearSearchBtn?.addEventListener('click', () => {
            if (searchInput) {
                searchInput.value = '';
                currentSearchQuery = '';
                clearSearchBtn.classList.add('hidden');
                renderTableOnly();
                searchInput.focus();
            }
        });

        const bindStudentNameClick = () => {
            modalEl.querySelectorAll('.matrix-student-name').forEach(el => {
                el.addEventListener('click', (e) => {
                    const cNum = parseInt(e.currentTarget.dataset.class);
                    const sNum = e.currentTarget.dataset.num;
                    const sName = e.currentTarget.dataset.name;
                    modalEl.remove();
                    openStudentModal(cNum, sNum, sName);
                });
            });
        };

        bindStudentNameClick();
        document.getElementById('closeMatrixBtn').addEventListener('click', () => modalEl.remove());
        document.getElementById('matrixPrintBtn').addEventListener('click', () => printOnly('matrix', 'landscape'));

    } catch (err) {
        modalEl.innerHTML = `<div class="glass-card p-8 text-center text-danger font-bold">매트릭스 생성 실패: ${err}</div>`;
    }
}

if (typeof window !== 'undefined') {
    window.openMatrixModal = openMatrixModal;
}
