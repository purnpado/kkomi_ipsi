import { escapeHtml } from '../core/utils.js';
import { judgeGeneralPercentile } from '../core/admissionJudgment.js';
import { printOnly } from '../print/printEngine.js';

// ===== 학생 전학년 전과목 교과/비교과 종합 성적표 모달 =====
export async function openStudentTranscriptModal(classNum, studentNum, name) {
    document.getElementById('studentTranscriptModal')?.remove();

    const modalEl = document.createElement('div');
    modalEl.id = 'studentTranscriptModal';
    modalEl.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto';
    modalEl.innerHTML = `
        <div class="glass-card p-8 w-full max-w-4xl text-center">
            <span class="spinner"></span> <span class="text-white ml-2">${escapeHtml(name)} 학생의 전학년 종합 성적표를 조회하는 중...</span>
        </div>
    `;
    document.body.appendChild(modalEl);

    try {
        const data = await window.go.main.App.GetStudentTranscript(classNum, studentNum, name);

        // 1. 교과 성적 맵 생성 (과목별 행, 학기별 열 - 나이스 표준 매트릭스)
        // 나이스 생활기록부 공식 편제 순서: 기본교과 -> 선택교과 -> 체육/예술(예체능 교과는 맨 마지막)
        const subjectOrder = [
            '국어', '도덕', '사회', '역사', '수학', '과학',
            '기술·가정', '기술가정', '정보', '영어',
            '한문', '제2외국어', '중국어', '일본어',
            '체육', '음악', '미술'
        ];
        const getSubjectPriority = (name) => {
            const clean = name.replace(/\s+/g, '');
            // 예체능 교과(체육, 음악, 미술)는 무조건 가장 마지막 순위(800번대)로 배치
            if (clean.includes('체육')) return 801;
            if (clean.includes('음악')) return 802;
            if (clean.includes('미술')) return 803;

            const idx = subjectOrder.findIndex(s => clean.includes(s) || s.includes(clean));
            return idx !== -1 ? idx : 500; // 정의되지 않은 기타 선택과목은 일반교과 뒤, 예체능 앞에 배치
        };

        const subjectMap = new Map(); // normSubject -> { displayName, scores: {} }
        let has1_1Data = false;
        let has1_1Graded = false; // A~E 일반 성취도가 있는지 여부

        if (data.subjectRecords && data.subjectRecords.length > 0) {
            let lastGrade = '1';
            let lastSem = '1';

            data.subjectRecords.forEach(rec => {
                let grade = '';
                let sem = '';
                let subject = '';
                let achieve = '';
                let rawScore = '';

                for (const [k, v] of Object.entries(rec)) {
                    const cleanK = k.replace(/\s+/g, '').replace(/["'\r\n]/g, '');
                    const cleanV = String(v || '').trim().replace(/["'\r\n]/g, '');

                    if (cleanK.includes('학년도')) continue;
                    if (cleanK === '학년' || (cleanK.includes('학년') && !cleanK.includes('학기'))) {
                        grade = cleanV;
                    } else if (cleanK === '학기' || cleanK.includes('학기')) {
                        sem = cleanV;
                    } else if (cleanK.includes('성취도')) {
                        achieve = cleanV;
                    } else if (cleanK.includes('원점수') || cleanK.includes('과목평균') || cleanK.includes('평균')) {
                        rawScore = cleanV;
                    } else if (cleanK === '과목' || cleanK === '교과목' || cleanK.includes('과목명') || (cleanK.includes('과목') && !cleanK.includes('평균'))) {
                        subject = cleanV;
                    }
                }

                if (grade) lastGrade = grade;
                else grade = lastGrade;

                if (sem) lastSem = sem;
                else sem = lastSem;

                if (!subject || !achieve || subject === '/' || !isNaN(Number(subject)) || subject.length < 2) return;

                const gNum = grade.replace(/[^0-9]/g, '') || '1';
                const sNum = sem.replace(/[^0-9]/g, '') || '1';
                const semKey = `${gNum}-${sNum}`;

                const firstChar = achieve[0].toUpperCase();
                const isPass = firstChar === 'P' || achieve === '이수';
                if (!['A', 'B', 'C', 'D', 'E', 'P'].includes(firstChar) && !isPass) return;

                if (semKey === '1-1') {
                    has1_1Data = true;
                    if (!isPass && ['A', 'B', 'C', 'D', 'E'].includes(firstChar)) {
                        has1_1Graded = true;
                    }
                }

                // 과목명 정규화 (기술·가정 등 통일)
                const normSubject = subject.replace(/\s+/g, '');
                if (!subjectMap.has(normSubject)) {
                    subjectMap.set(normSubject, {
                        displayName: subject,
                        scores: {}
                    });
                }
                subjectMap.get(normSubject).scores[semKey] = {
                    achieve,
                    rawScore,
                    isPass
                };
            });
        }

        // 1학년 1학기 자유학기제 판정 (A~E 일반 성취도가 없거나 데이터가 없는 경우 자유학기제로 자동 판정)
        const is1_1FreeSemester = !has1_1Graded;

        // 표준 과목 순서대로 정렬
        const sortedSubjects = [...subjectMap.values()].sort((a, b) => {
            const pA = getSubjectPriority(a.displayName);
            const pB = getSubjectPriority(b.displayName);
            if (pA !== pB) return pA - pB;
            return a.displayName.localeCompare(b.displayName, 'ko');
        });

        // 성취도 배지 생성 헬퍼
        const getAchieveBadge = (achieve) => {
            if (!achieve) return '-';
            const firstChar = achieve[0].toUpperCase();
            let color = 'text-slate-300';
            if (firstChar === 'A') color = 'text-emerald-400 font-bold';
            else if (firstChar === 'B') color = 'text-sky-400 font-bold';
            else if (firstChar === 'C') color = 'text-amber-400 font-bold';
            else if (firstChar === 'D') color = 'text-orange-400 font-bold';
            else if (firstChar === 'E') color = 'text-rose-400 font-bold';
            else if (firstChar === 'P') color = 'text-indigo-300 font-semibold';
            return `<span class="${color}">${escapeHtml(achieve)}</span>`;
        };

        // 테이블 행(TR) 생성
        let matrixRows = '';
        if (sortedSubjects.length === 0) {
            matrixRows = `<tr><td colspan="6" class="p-8 text-center text-text-muted">업로드된 교과 성적 데이터가 없거나 성취평가 대상 과목이 없습니다.</td></tr>`;
        } else {
            sortedSubjects.forEach((subObj, rowIdx) => {
                let tds = '';

                // 1. 1학년 1학기 셀 (자유학기제인 경우 전체 과목 높이만큼 1개 셀로 통합 병합)
                if (is1_1FreeSemester) {
                    if (rowIdx === 0) {
                        tds += `
                            <td rowspan="${sortedSubjects.length}" class="p-2 border-l border-slate-700/60 bg-indigo-950/20 text-indigo-300 font-bold text-center text-xs align-middle leading-relaxed free-semester-cell">
                                <span class="px-2 py-0.5 rounded-full bg-indigo-600/40 text-indigo-200 border border-indigo-500/40 text-[11px] font-black inline-block mb-1">자유학기제</span>
                                <div class="text-[10px] text-slate-400 font-normal">성적 미산출<br>(지필평가 미실시)</div>
                            </td>
                        `;
                    }
                    // rowIdx > 0일 때는 rowspan 병합에 의해 td 생략
                } else {
                    const sc = subObj.scores['1-1'];
                    tds += `
                        <td class="p-2 border-l border-slate-700/60 text-center">
                            ${sc ? `<div>${getAchieveBadge(sc.achieve)}</div>${sc.rawScore ? `<div class="text-[10px] text-slate-400 font-mono mt-0.5">${escapeHtml(sc.rawScore)}</div>` : ''}` : '<span class="text-slate-600">-</span>'}
                        </td>
                    `;
                }

                // 2. 나머지 학기 (1-2, 2-1, 2-2, 3-1)
                const otherSemKeys = ['1-2', '2-1', '2-2', '3-1'];
                otherSemKeys.forEach(semKey => {
                    const sc = subObj.scores[semKey];
                    tds += `
                        <td class="p-2 border-l border-slate-700/60 text-center">
                            ${sc ? `<div>${getAchieveBadge(sc.achieve)}</div>${sc.rawScore ? `<div class="text-[10px] text-slate-400 font-mono mt-0.5">${escapeHtml(sc.rawScore)}</div>` : ''}` : '<span class="text-slate-600">-</span>'}
                        </td>
                    `;
                });

                matrixRows += `
                    <tr class="hover:bg-slate-800/40 border-b border-slate-700/40">
                        <td class="p-2.5 font-bold text-white text-left pl-3">${escapeHtml(subObj.displayName)}</td>
                        ${tds}
                    </tr>
                `;
            });
        }

        // 2. 출결 및 봉사 파싱
        let attObj = {};
        if (data.attendanceRaw) {
            try { attObj = JSON.parse(data.attendanceRaw); } catch (e) { }
        }
        let volObj = {};
        if (data.volunteerRaw) {
            try { volObj = JSON.parse(data.volunteerRaw); } catch (e) { }
        }

        // 출결 일수 종합 집계
        let totalAbsence = attObj['absence'] || attObj['absent'] || (Number(attObj['1_absence'] || 0) + Number(attObj['2_absence'] || 0) + Number(attObj['3_absence'] || 0));
        let totalLate = attObj['late'] || (Number(attObj['1_late'] || 0) + Number(attObj['2_late'] || 0) + Number(attObj['3_late'] || 0));
        let totalEarly = attObj['early'] || (Number(attObj['1_early'] || 0) + Number(attObj['2_early'] || 0) + Number(attObj['3_early'] || 0));
        let totalResult = attObj['result'] || (Number(attObj['1_result'] || 0) + Number(attObj['2_result'] || 0) + Number(attObj['3_result'] || 0));

        modalEl.innerHTML = `
            <div class="glass-card print-document p-6 md:p-8 w-full max-w-4xl max-h-[90vh] overflow-y-auto space-y-6">
                <!-- 헤더 -->
                <div class="flex items-center justify-between border-b border-slate-700/50 pb-4">
                    <div>
                        <h2 class="text-2xl font-black text-white flex items-center gap-2">
                            <span>📄</span> ${escapeHtml(classNum)}반 ${escapeHtml(studentNum)}번 <span class="text-primary font-bold">${escapeHtml(name)}</span> 종합 성적표
                        </h2>
                        <p class="text-xs text-text-muted mt-1">나이스 생활기록부 교과 성적(전학년) 및 출결·봉사활동 상세 내역</p>
                    </div>
                    <div class="flex items-center gap-2 no-print">
                        <button id="printTranscriptBtn" class="btn-secondary text-xs px-3 py-1.5 font-bold flex items-center gap-1 cursor-pointer">
                            <span>🖨️</span> 성적표 인쇄
                        </button>
                        <button id="closeTranscriptBtn" class="text-slate-400 hover:text-white p-2 text-xl font-bold bg-transparent border-none cursor-pointer">✕</button>
                    </div>
                </div>

                <!-- 1. 종합 내신 지표 카드 -->
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div class="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/50 text-center">
                        <div class="text-xs text-text-muted mb-1">전과목 평균 성취도</div>
                        <div class="text-xl font-bold text-primary">${data.allAverage.toFixed(2)} <span class="text-xs text-slate-400 font-normal">/ 5.0</span></div>
                    </div>
                    <div class="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/50 text-center">
                        <div class="text-xs text-text-muted mb-1">전교 석차</div>
                        <div class="text-xl font-bold text-white">${data.rank}등 <span class="text-xs text-slate-400 font-normal">/ ${data.totalStudents}명</span></div>
                    </div>
                    <div class="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/50 text-center">
                        <div class="text-xs text-text-muted mb-1">석차 백분율</div>
                        <div class="text-xl font-bold text-indigo-300">${data.percentile.toFixed(2)}%</div>
                    </div>
                    <div class="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/50 text-center">
                        <div class="text-xs text-text-muted mb-1">후기 일반고 판정</div>
                        <div class="text-sm font-bold ${{ safe: 'text-success', proper: 'text-warning', challenge: 'text-danger' }[judgeGeneralPercentile(data.percentile).level] || 'text-slate-300'}">
                            ${judgeGeneralPercentile(data.percentile).emoji} ${judgeGeneralPercentile(data.percentile).label} <span class="text-[10px] font-normal text-slate-400">(학교 내 석차 기준)</span>
                        </div>
                    </div>
                </div>

                <!-- 2. 전학년 전과목 교과 성적표 (나이스 표준 매트릭스) -->
                <div class="space-y-2">
                    <div class="flex items-center justify-between flex-wrap gap-2">
                        <h3 class="text-sm font-bold text-white flex items-center gap-1.5">
                            <span>📚</span> 전학년 학기별 교과 성적 매트릭스
                        </h3>
                        <span class="text-[11px] text-slate-400 font-mono">성취도(원점수/과목평균)</span>
                    </div>
                    <div class="overflow-x-auto rounded-xl border border-slate-700/50 bg-slate-900/40 custom-scrollbar">
                        <table class="w-full text-left border-collapse text-xs">
                            <thead class="sticky top-0 bg-slate-800 border-b border-slate-700/70 text-text-muted text-center z-10 text-xs">
                                <tr>
                                    <th rowspan="2" class="p-2.5 text-left pl-3.5 w-28 border-r border-slate-700/60 bg-slate-800">교과목</th>
                                    <th colspan="2" class="p-2 border-r border-slate-700/60 bg-slate-800/95 text-slate-200 font-bold">1학년</th>
                                    <th colspan="2" class="p-2 border-r border-slate-700/60 bg-slate-800/95 text-slate-200 font-bold">2학년</th>
                                    <th class="p-2 bg-slate-800/95 text-slate-200 font-bold">3학년</th>
                                </tr>
                                <tr class="text-[11px] border-t border-slate-700/50 text-slate-400">
                                    <th class="p-1.5 w-28 border-r border-slate-700/60 ${is1_1FreeSemester ? 'bg-indigo-950/40 text-indigo-300 font-bold' : ''}">
                                        1학기
                                    </th>
                                    <th class="p-1.5 w-28 border-r border-slate-700/60">2학기</th>
                                    <th class="p-1.5 w-28 border-r border-slate-700/60">1학기</th>
                                    <th class="p-1.5 w-28 border-r border-slate-700/60">2학기</th>
                                    <th class="p-1.5 w-28">1학기</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${matrixRows}
                            </tbody>
                        </table>
                    </div>
                    ${is1_1FreeSemester ? `
                        <div class="p-2 rounded-lg bg-indigo-950/20 border border-indigo-500/20 text-[11px] flex items-center gap-1.5 text-indigo-300">
                            <span class="text-sm">ℹ️</span>
                            <span>1학년 1학기는 교육과정상 <strong>자유학기제</strong>로 운영되어 지필 성적이 산출되지 않으며, 고입 내신성적 산출에서 제외됩니다.</span>
                        </div>
                    ` : ''}
                </div>

                <!-- 3. 비교과 (출결 및 봉사) 요약 -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    <div class="p-4 rounded-xl bg-slate-800/40 border border-slate-700/50 space-y-2">
                        <h4 class="font-bold text-indigo-300 flex items-center gap-1">
                            <span>📅</span> 출결 상황 요약
                        </h4>
                        <div class="grid grid-cols-4 gap-2 text-center pt-2">
                            <div class="p-2 rounded bg-slate-900/60 border border-slate-700/40">
                                <div class="text-[10px] text-text-muted">미인정 결석</div>
                                <div class="text-sm font-bold text-danger mt-1">${totalAbsence}일</div>
                            </div>
                            <div class="p-2 rounded bg-slate-900/60 border border-slate-700/40">
                                <div class="text-[10px] text-text-muted">미인정 지각</div>
                                <div class="text-sm font-bold text-warning mt-1">${totalLate}회</div>
                            </div>
                            <div class="p-2 rounded bg-slate-900/60 border border-slate-700/40">
                                <div class="text-[10px] text-text-muted">미인정 조퇴</div>
                                <div class="text-sm font-bold text-warning mt-1">${totalEarly}회</div>
                            </div>
                            <div class="p-2 rounded bg-slate-900/60 border border-slate-700/40">
                                <div class="text-[10px] text-text-muted">미인정 결과</div>
                                <div class="text-sm font-bold text-warning mt-1">${totalResult}회</div>
                            </div>
                        </div>
                    </div>

                    <div class="p-4 rounded-xl bg-slate-800/40 border border-slate-700/50 space-y-2">
                        <h4 class="font-bold text-emerald-300 flex items-center gap-1">
                            <span>🕒</span> 봉사활동 실적 요약
                        </h4>
                        <div class="flex items-center justify-between p-3 rounded bg-slate-900/60 border border-slate-700/40 mt-2">
                            <div>
                                <div class="text-xs text-text-muted">나이스 인정 총 봉사시간</div>
                                <div class="text-[10px] text-slate-400 mt-0.5">학교 교육계획 및 개인봉사 합산</div>
                            </div>
                            <div class="text-xl font-black text-emerald-300">
                                ${volObj['total_time'] || 0} <span class="text-xs font-normal text-slate-400">시간</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('closeTranscriptBtn').addEventListener('click', () => modalEl.remove());
        document.getElementById('printTranscriptBtn').addEventListener('click', () => printOnly('transcript'));
        modalEl.addEventListener('click', (e) => {
            if (e.target === modalEl) modalEl.remove();
        });

        // 자유학기 P 과목 접기/펼치기 토글
        const togglePBtn = document.getElementById('togglePassSubjectsBtn');
        const pContainer = document.getElementById('passSubjectsContainer');
        if (togglePBtn && pContainer) {
            togglePBtn.addEventListener('click', () => {
                const isHidden = pContainer.classList.contains('hidden');
                if (isHidden) {
                    pContainer.classList.remove('hidden');
                    togglePBtn.textContent = `자유학기(P) 접기 ▲`;
                } else {
                    pContainer.classList.add('hidden');
                    togglePBtn.textContent = `자유학기(P) 과목 보기 (${passSubjectCount}) ▼`;
                }
            });
        }

    } catch (err) {
        modalEl.innerHTML = `
            <div class="glass-card p-8 w-full max-w-md text-center">
                <div class="text-danger text-4xl mb-3">⚠️</div>
                <div class="text-white font-bold mb-4">성적표를 불러오지 못했습니다</div>
                <div class="text-text-muted text-sm mb-6">${escapeHtml(String(err))}</div>
                <button type="button" class="btn-secondary w-full cursor-pointer" id="closeTranscriptErrBtn">닫기</button>
            </div>
        `;
        modalEl.querySelector('#closeTranscriptErrBtn')?.addEventListener('click', () => modalEl.remove());
    }
}

if (typeof window !== 'undefined') {
    window.openStudentTranscriptModal = openStudentTranscriptModal;
}
