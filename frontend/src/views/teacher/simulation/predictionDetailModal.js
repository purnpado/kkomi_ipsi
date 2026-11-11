import { escapeHtml, normalizeSchoolName, normalizeTrack } from '../../../core/utils.js';
import { printOnly } from '../../../print/printEngine.js';
import { getPredictionAnalysisList } from './prediction.js';
import { showSchoolScoreDetailModal } from './schoolScoreDetail.js';
import { openModal } from '../../../core/navigation.js';
import { admissionLabel } from '../../../core/admissionYear.js';

// ===== 마이스터고 및 특성화고 합격 예측 상세 분석 팝업 모달 =====
export async function openPredictionDetailModal(classNum, studentNum, studentName, category, extraData = {}) {
    document.getElementById('predictionDetailModal')?.remove();

    const isMeister = category === 'meister';
    const titleCategory = isMeister ? '마이스터고' : '특성화고';
    const categoryIcon = isMeister ? '🏛️' : '🏭';

    // 1. 학생 전체 성적 및 커트라인 로드
    let fullStudent = null;
    let cutoffs = [];
    try {
        const [fullStudents, dbCutoffs, officialResp] = await Promise.all([
            window.go.main.App.GetClassFullGrades(classNum).catch(() => []),
            window.go.main.App.GetCutoffs().catch(() => []),
            window.go.main.App.GetOfficialAdmissionData().catch(() => null),
        ]);
        fullStudent = (fullStudents || []).find(s => 
            String(s.studentNum) === String(studentNum) || s.name === studentName
        );

        const officialCutoffs = (officialResp?.items || []).map(item => ({
            schoolName: item.schoolName || '',
            department: item.department || '',
            track: item.track || '일반전형',
            minValue: Number(item.minAcceptedScore || item.minValue || 0),
            avgValue: Number(item.avgAcceptedScore || item.avgValue || 0),
            maxValue: Number(item.maxFailedScore || item.maxValue || 0),
            year: item.admissionYear || item.year || 0,
            isOfficial: true,
        })).filter(c => {
            if (!c.minValue || c.minValue <= 0) return false;
            if (c.schoolName.includes('청량고')) return false;
            return true;
        });

        cutoffs = [...(dbCutoffs || []), ...officialCutoffs];
    } catch (err) {
        console.error('분석 데이터 로드 실패:', err);
    }

    const analysisList = getPredictionAnalysisList(fullStudent?.schoolResults, cutoffs, category);
    const passCount = analysisList.filter(x => x.isPass).length;
    const passSchoolCount = new Set(analysisList.filter(x => x.isPass).map(x => normalizeSchoolName(x.schoolName))).size;

    // 석차 및 백분율 확정
    const displayPercentile = fullStudent?.generalHSPercentile != null && fullStudent.generalHSPercentile > 0
        ? Number(fullStudent.generalHSPercentile).toFixed(2) + '%'
        : (extraData.percentile ? extraData.percentile + '%' : '-');
    const displayRank = extraData.rank || fullStudent?.rank || '-';
    let displayTotal = extraData.total || fullStudent?.totalStudents || fullStudent?.TotalStudents || 0;

    // 만약 전달받은 displayTotal이 displayRank보다 작거나 비정상적인 경우 (예: 전교 49등인데 반 학생수 10명이 전달된 경우)
    const rankNum = parseInt(displayRank, 10);
    const totalNum = parseInt(displayTotal, 10);
    if ((!totalNum || (rankNum && totalNum < rankNum)) && (extraData.percentile || fullStudent?.generalHSPercentile)) {
        const pct = parseFloat(extraData.percentile || fullStudent?.generalHSPercentile);
        if (pct > 0 && rankNum > 0) {
            displayTotal = Math.round(rankNum / (pct / 100));
        }
    }
    if (!displayTotal || displayTotal === 0) displayTotal = '-';

    // 모달 DOM 생성
    const modal = document.createElement('div');
    modal.id = 'predictionDetailModal';
    modal.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 md:p-6 overflow-y-auto animate-fade-in print:p-0 print:bg-white';

    // body에 먼저 등록하여 쿼리셀렉터가 항상 성공하도록 보장
    document.body.appendChild(modal);

    let activeFilter = 'all'; // 'all' or 'pass'

    const renderModalContent = () => {
        const displayList = [...(activeFilter === 'pass' ? analysisList.filter(x => x.isPass) : analysisList)];

        // 기준연도(내림차순) -> 고교명(가나다) -> 전형구분(일반 우선) -> 학과명(공통 우선) 순서로 정렬
        displayList.sort((a, b) => {
            if (Number(b.year) !== Number(a.year)) return Number(b.year) - Number(a.year);
            const schComp = String(a.schoolName || '').localeCompare(String(b.schoolName || ''), 'ko');
            if (schComp !== 0) return schComp;
            const aTrk = String(a.track || '');
            const bTrk = String(b.track || '');
            if (aTrk !== bTrk) {
                if (aTrk.includes('일반')) return -1;
                if (bTrk.includes('일반')) return 1;
                return aTrk.localeCompare(bTrk, 'ko');
            }
            const aIsCommon = a.dept.includes('공통') || a.dept.includes('전체') ? 0 : 1;
            const bIsCommon = b.dept.includes('공통') || b.dept.includes('전체') ? 0 : 1;
            if (aIsCommon !== bIsCommon) return aIsCommon - bIsCommon;
            return String(a.dept || '').localeCompare(String(b.dept || ''), 'ko');
        });

        // 같은 기준연도, 같은 고교명, 같은 전형구분 행 병합(rowspan) 계산
        const yearSpans = [];
        const schoolSpans = [];
        const trackSpans = [];

        for (let i = 0; i < displayList.length; i++) {
            // 1. 기준연도 rowspan
            if (i === 0 || displayList[i].year !== displayList[i - 1].year) {
                let count = 1;
                while (i + count < displayList.length && displayList[i + count].year === displayList[i].year) {
                    count++;
                }
                yearSpans[i] = count;
            } else {
                yearSpans[i] = 0;
            }

            // 2. 고교명 rowspan (같은 연도 내에서)
            if (i === 0 || displayList[i].year !== displayList[i - 1].year || displayList[i].schoolName !== displayList[i - 1].schoolName) {
                let count = 1;
                while (i + count < displayList.length && 
                       displayList[i + count].year === displayList[i].year && 
                       displayList[i + count].schoolName === displayList[i].schoolName) {
                    count++;
                }
                schoolSpans[i] = count;
            } else {
                schoolSpans[i] = 0;
            }

            // 3. 전형구분 rowspan (같은 연도 & 같은 고교 내에서)
            if (i === 0 || displayList[i].year !== displayList[i - 1].year || 
                displayList[i].schoolName !== displayList[i - 1].schoolName || 
                displayList[i].track !== displayList[i - 1].track) {
                let count = 1;
                while (i + count < displayList.length && 
                       displayList[i + count].year === displayList[i].year && 
                       displayList[i + count].schoolName === displayList[i].schoolName && 
                       displayList[i + count].track === displayList[i].track) {
                    count++;
                }
                trackSpans[i] = count;
            } else {
                trackSpans[i] = 0;
            }
        }

        // 고교별 환산점수 뱃지 목록 (클릭 시 세부 산출 공식 팝업 연동)
        const schoolScoresHTML = (fullStudent?.schoolResults || [])
            .filter(r => isMeister
                ? ['울산마이스터', '울산에너지', '현대공업'].some(kw => normalizeSchoolName(r.schoolName).includes(kw))
                : ['울산상업', '울산여자상업', '울산생활과학', '울산공업', '울산산업', '울산미용예술', '울산기술공업', '울산애니원'].some(kw => normalizeSchoolName(r.schoolName).includes(kw))
            )
            .map(r => {
                const sNameNorm = normalizeSchoolName(r.schoolName);
                const tNameNorm = normalizeTrack(r.trackName);
                let defaultMax = 100;
                if (sNameNorm.includes('마이스터')) defaultMax = (tNameNorm.includes('특별') ? 280 : 300);
                else if (sNameNorm.includes('에너지')) defaultMax = (tNameNorm.includes('특별') ? 200 : 230);
                else if (sNameNorm.includes('현대공업')) defaultMax = (tNameNorm.includes('특별') ? 150 : 200);
                const maxVal = r.totalMax || r.TotalMax || defaultMax;

                // 해당 학교/전형의 커트라인 판정 조회
                const relatedPred = analysisList.find(x => 
                    normalizeSchoolName(x.schoolName) === sNameNorm && 
                    normalizeTrack(x.track) === tNameNorm
                );
                let badgeHTML = '';
                if (relatedPred) {
                    const diffStr = relatedPred.diff >= 0 ? `+${relatedPred.diff.toFixed(1)}` : relatedPred.diff.toFixed(1);
                    const bColor = relatedPred.isPass ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-rose-500/20 text-rose-300 border-rose-500/40';
                    badgeHTML = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold border ${bColor}">${relatedPred.isPass ? '🟢' : '🔴'} ${relatedPred.status} (${diffStr})</span>`;
                }

                return `
                    <div data-school="${escapeHtml(r.schoolName)}" data-track="${escapeHtml(r.trackName)}" role="button" tabindex="0" title="클릭하여 ${r.schoolName} ${r.trackName}전형 상세 성적 산출 내역 보기" class="bg-slate-900/90 p-3 rounded-xl border border-slate-700/70 hover:border-indigo-400 hover:bg-slate-800/90 flex items-center justify-between gap-3 shadow-inner hover:shadow-indigo-500/15 transition-all cursor-pointer group active:scale-98 prediction-score-item">
                        <div class="flex flex-col min-w-0">
                            <div class="flex items-center gap-1.5 flex-wrap">
                                <span class="text-xs font-bold text-white group-hover:text-indigo-300 transition-colors truncate">${r.schoolName}</span>
                                <span class="text-[10px] text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity">🔍</span>
                                ${badgeHTML}
                            </div>
                            <span class="text-[11px] text-indigo-300 font-semibold truncate mt-0.5">${r.trackName}${r.trackName.endsWith('전형') ? '' : '전형'}</span>
                        </div>
                        <div class="text-right shrink-0">
                            <div class="text-sm font-black text-amber-300">${Number(r.totalScore).toFixed(2)}점</div>
                            <div class="text-[10px] text-slate-400 font-medium">${maxVal}점 만점</div>
                        </div>
                    </div>
                `;
            }).join('');

        let tableRowsHTML = '';
        if (displayList.length === 0) {
            tableRowsHTML = `
                <tr>
                    <td colspan="8" class="p-12 text-center text-text-muted">
                        <p class="text-3xl mb-2">📭</p>
                        <p class="font-bold text-slate-300 text-sm">해당 조건에 일치하는 분석 데이터가 없습니다.</p>
                        <p class="text-xs text-slate-400 mt-1">고교 커트라인 통합 관리 화면에서 해당 고교의 합격선을 등록해 보세요.</p>
                    </td>
                </tr>
            `;
        } else {
            tableRowsHTML = displayList.map((item, idx) => {
                const diffStr = item.diff >= 0 ? `+${item.diff.toFixed(2)}` : item.diff.toFixed(2);
                const diffColor = item.diff >= 0 ? 'text-emerald-400 font-black' : 'text-rose-400 font-bold';
                const statusBadge = item.isPass
                    ? `<span class="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 inline-flex items-center gap-1 shadow-xs">🟢 ${item.status}</span>`
                    : `<span class="px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 inline-flex items-center gap-1 shadow-xs">🔴 ${item.status}</span>`;

                return `
                    <tr class="border-b border-slate-700/40 hover:bg-slate-800/50 transition-colors text-center text-xs">
                        ${yearSpans[idx] > 0 ? `
                            <td rowspan="${yearSpans[idx]}" class="p-3 text-center font-bold text-amber-300/90 font-mono bg-slate-900/40 border-r border-slate-700/60 align-middle whitespace-nowrap">
                                ${admissionLabel(item.year)}
                            </td>
                        ` : ''}
                        ${schoolSpans[idx] > 0 ? `
                            <td rowspan="${schoolSpans[idx]}" class="p-3 font-bold text-white text-left pl-3.5 bg-slate-900/20 border-r border-slate-700/60 align-middle whitespace-nowrap">
                                ${item.schoolName}
                            </td>
                        ` : ''}
                        ${trackSpans[idx] > 0 ? `
                            <td rowspan="${trackSpans[idx]}" class="p-3 text-center text-slate-300 font-semibold bg-slate-900/10 border-r border-slate-700/60 align-middle whitespace-nowrap">
                                ${item.track}${item.track.endsWith('전형') ? '' : '전형'}
                            </td>
                        ` : ''}
                        <td class="p-3 text-left pl-3 text-indigo-200 font-medium whitespace-nowrap border-r border-slate-800/40">
                            ${item.dept}
                        </td>
                        <td class="p-3 text-right font-black text-indigo-300 whitespace-nowrap border-r border-slate-800/40">
                            <button class="hover:text-amber-300 hover:underline cursor-pointer prediction-score-row-btn transition-colors" data-school="${escapeHtml(item.schoolName)}" data-track="${escapeHtml(item.track)}" title="클릭하여 상세 성적 산출 내역 보기">
                                ${item.studentScore.toFixed(2)}점 🔍
                            </button>
                        </td>
                        <td class="p-3 text-right font-semibold text-slate-300 whitespace-nowrap border-r border-slate-800/40">
                            <div class="flex flex-col items-end gap-0.5">
                                <span class="font-bold text-emerald-300">최저 ${item.minScore.toFixed(2)}점</span>
                                ${item.avgScore > 0 ? `<span class="text-[10px] text-amber-300/80">평균 ${item.avgScore.toFixed(2)}점</span>` : ''}
                            </div>
                        </td>
                        <td class="p-3 text-right ${diffColor} whitespace-nowrap border-r border-slate-800/40">
                            ${diffStr}점
                        </td>
                        <td class="p-3 whitespace-nowrap">
                            ${statusBadge}
                        </td>
                    </tr>
                `;
            }).join('');
        }

        modal.innerHTML = `
            <div class="glass-card w-full max-w-5xl p-6 md:p-8 rounded-2xl bg-slate-900/95 border border-slate-700/80 shadow-2xl space-y-5 animate-scale-up max-h-[94vh] flex flex-col print:border-none print:shadow-none print:bg-white print:text-black">
                <!-- 헤더 -->
                <div class="flex items-center justify-between border-b border-slate-700/60 pb-4 shrink-0 flex-wrap gap-3">
                    <div class="flex items-center gap-3">
                        <span class="text-3xl">${categoryIcon}</span>
                        <div>
                            <h2 class="text-xl md:text-2xl font-black text-white flex items-center gap-2">
                                <span>[${escapeHtml(studentName)}]</span> 학생 ${titleCategory} 합격 예측 정밀 분석
                            </h2>
                            <p class="text-xs text-text-muted mt-0.5">
                                학생 본인의 실제 고교별 전형 산출 점수와 등록된 과거 및 공식 합격선 커트라인을 1:1로 정밀 대조한 결과입니다.
                            </p>
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        <button id="printPredictionModalBtn" class="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs print:hidden" title="학부모 상담용 분석표 인쇄">
                            <span>🖨️</span> 인쇄
                        </button>
                        <button id="closePredictionModalBtn" class="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 text-xl transition-all cursor-pointer print:hidden">
                            ✕
                        </button>
                    </div>
                </div>

                <!-- 상단: 학생 기본 성적 & 본인 고교별 환산점수 카드 (페이지 분할 시 중복 방지) -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 shrink-0 prediction-summary-header">
                    <!-- 기본 내신 지표 -->
                    <div class="p-4 rounded-xl bg-slate-800/60 border border-slate-700/50 space-y-2.5">
                        <div class="flex items-center justify-between text-xs text-text-muted border-b border-slate-700/40 pb-1.5">
                            <span class="font-bold text-slate-300">👤 학생 기본 내신 성적 요약</span>
                            <span class="text-indigo-400 font-bold">${classNum}반 ${studentNum}번 ${studentName}</span>
                        </div>
                        <div class="grid grid-cols-3 gap-2 text-center pt-1">
                            <div class="bg-slate-900/70 p-2.5 rounded-lg border border-slate-700/50">
                                <div class="text-[11px] text-slate-400 font-medium">석차 백분율</div>
                                <div class="text-base font-black text-emerald-400 mt-0.5">${displayPercentile}</div>
                            </div>
                            <div class="bg-slate-900/70 p-2.5 rounded-lg border border-slate-700/50">
                                <div class="text-[11px] text-slate-400 font-medium">내신 석차</div>
                                <div class="text-base font-black text-sky-400 mt-0.5">${displayRank}<span class="text-[10px] text-slate-400 font-normal"> / ${displayTotal}명</span></div>
                            </div>
                            <div class="bg-slate-900/70 p-2.5 rounded-lg border border-slate-700/50">
                                <div class="text-[11px] text-slate-400 font-medium">합격권 학교 수</div>
                                <div class="text-base font-black text-amber-400 mt-0.5">${passSchoolCount}개교 <span class="text-[10px] text-slate-400 font-normal">(${passCount}개)</span></div>
                            </div>
                        </div>
                    </div>

                    <!-- 고교별 학생 본인 산출점수 (인쇄 시 스크롤 제거 및 펼침) -->
                    <div class="p-4 rounded-xl bg-slate-800/60 border border-slate-700/50 space-y-2.5">
                        <div class="flex items-center justify-between text-xs text-text-muted border-b border-slate-700/40 pb-1.5 flex-wrap gap-1">
                            <span class="font-bold text-slate-300 flex items-center gap-1.5">
                                <span>🎯</span> 학생 본인 고교별 공식 환산 점수
                                <span class="text-[10px] text-indigo-400 font-normal bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20">💡 학교를 누르면 상세 산출표 열림</span>
                            </span>
                            <span class="text-[11px] text-emerald-400 font-bold">100% 자동 산출</span>
                        </div>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-0.5 max-h-36 overflow-y-auto custom-scrollbar prediction-scores-scroll">
                            ${schoolScoresHTML || '<div class="text-xs text-slate-400 p-2 text-center col-span-2">산출된 고교 점수가 없습니다.</div>'}
                        </div>
                    </div>
                </div>

                <!-- 툴바: 필터 토글 -->
                <div class="flex items-center justify-between gap-3 shrink-0 flex-wrap print:hidden">
                    <div class="inline-flex rounded-xl bg-slate-900 p-1 border border-slate-700/60 text-xs">
                        <button id="filterAllPredictionsBtn" class="px-3.5 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${activeFilter === 'all' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}">
                            전체 고교·전형 보기 (${analysisList.length})
                        </button>
                        <button id="filterPassPredictionsBtn" class="px-3.5 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${activeFilter === 'pass' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}">
                            ✅ 지원 가능(합격권)만 보기 (${passCount})
                        </button>
                    </div>
                    <div class="text-xs text-text-muted flex items-center gap-3">
                        <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-emerald-400"></span> 안정(+5점 이상)</span>
                        <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-yellow-400"></span> 적정(0~+5점)</span>
                        <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-orange-400"></span> 소신(-5~0점)</span>
                        <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-rose-400"></span> 도전(-5점 미만)</span>
                    </div>
                </div>

                <!-- 테이블 영역 (기준연도, 고교명, 전형구분 묶음 헤더) -->
                <div class="overflow-y-auto flex-1 rounded-xl border border-slate-700/60 bg-slate-900/60 custom-scrollbar prediction-table-container">
                    <table class="w-full text-left border-collapse text-xs">
                        <thead class="bg-slate-800/90 text-text-muted font-bold text-center border-b border-slate-700/60 sticky top-0 z-10 whitespace-nowrap">
                            <tr>
                                <th class="p-3 text-center w-24 border-r border-slate-700/60">기준 연도</th>
                                <th class="p-3 text-left pl-3.5 w-36 border-r border-slate-700/60">고교명</th>
                                <th class="p-3 text-center w-28 border-r border-slate-700/60">전형 구분</th>
                                <th class="p-3 text-left pl-3 w-40 border-r border-slate-700/60">학과명</th>
                                <th class="p-3 text-right w-32 text-indigo-300 border-r border-slate-700/60">본인 환산점수</th>
                                <th class="p-3 text-right w-36 text-slate-200 border-r border-slate-700/60">고교 합격선(최저/평균)</th>
                                <th class="p-3 text-right w-28 border-r border-slate-700/60">점수 차이</th>
                                <th class="p-3 text-center w-28">합격 예측</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tableRowsHTML}
                        </tbody>
                    </table>
                </div>

                <!-- 하단 푸터 액션 바 (디자인 대폭 개선) -->
                <div class="flex items-center justify-between border-t border-slate-700/60 pt-4 shrink-0 flex-wrap gap-3 print:hidden">
                    <div class="text-xs text-slate-400">
                        * 합격 예측은 각 고교 공식 산출 공식 및 과거 입결을 바탕으로 산정된 참고 지표입니다.
                    </div>
                    <div class="flex items-center gap-2.5">
                        <button id="goToCounselFromPredictionBtn" class="bg-linear-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-black px-6 py-2.5 text-xs rounded-xl flex items-center gap-2 shadow-lg shadow-indigo-500/30 cursor-pointer active:scale-95 transition-all">
                            <span class="text-sm">💬</span> 1:1 진학 상담 시작
                        </button>
                        <button id="closePredictionModalFooterBtn" class="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 font-bold px-5 py-2.5 text-xs rounded-xl cursor-pointer active:scale-95 transition-all">
                            닫기
                        </button>
                    </div>
                </div>
            </div>
        `;

        // 모달 내부 이벤트 직접 바인딩 (안전하고 확실함)
        modal.querySelector('#closePredictionModalBtn')?.addEventListener('click', () => modal.remove());
        modal.querySelector('#closePredictionModalFooterBtn')?.addEventListener('click', () => modal.remove());
        modal.querySelector('#printPredictionModalBtn')?.addEventListener('click', () => {
            printOnly('prediction', 'portrait');
        });
        modal.querySelector('#filterAllPredictionsBtn')?.addEventListener('click', () => {
            activeFilter = 'all';
            renderModalContent();
        });
        modal.querySelector('#filterPassPredictionsBtn')?.addEventListener('click', () => {
            activeFilter = 'pass';
            renderModalContent();
        });
        modal.querySelector('#goToCounselFromPredictionBtn')?.addEventListener('click', () => {
            modal.remove();
            openModal('student', { classNum, studentNum, name: studentName });
        });

        // 고교별 환산점수 카드 클릭 시 상세 산출 모달 오픈 (일반, 특별전형 각각)
        modal.querySelectorAll('.prediction-score-item').forEach(card => {
            card.addEventListener('click', () => {
                const sch = card.dataset.school;
                const trk = card.dataset.track;
                const targetRes = (fullStudent?.schoolResults || []).find(r => 
                    normalizeSchoolName(r.schoolName) === normalizeSchoolName(sch) &&
                    normalizeTrack(r.trackName) === normalizeTrack(trk)
                );
                if (targetRes) {
                    showSchoolScoreDetailModal(studentName, classNum, studentNum, targetRes, fullStudent);
                }
            });
        });

        // 테이블 내 본인 환산점수 클릭 시 상세 산출 모달 오픈
        modal.querySelectorAll('.prediction-score-row-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const sch = btn.dataset.school;
                const trk = btn.dataset.track;
                const targetRes = (fullStudent?.schoolResults || []).find(r => 
                    normalizeSchoolName(r.schoolName) === normalizeSchoolName(sch) &&
                    normalizeTrack(r.trackName) === normalizeTrack(trk)
                );
                if (targetRes) {
                    showSchoolScoreDetailModal(studentName, classNum, studentNum, targetRes, fullStudent);
                }
            });
        });
    };

    renderModalContent();

    // ESC 키로 닫기
    const handleEsc = (e) => {
        if (e.key === 'Escape') {
            modal.remove();
            window.removeEventListener('keydown', handleEsc);
        }
    };
    window.addEventListener('keydown', handleEsc);
}
