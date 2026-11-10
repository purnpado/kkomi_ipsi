import { normalizeSchoolName, normalizeTrack } from '../../../core/utils.js';

// ===== 학교별 공식 성적 산출 규칙 안내 맵 =====
const SCHOOL_CALC_RULES = {
    '울산마이스터고': {
        '일반': {
            totalMax: 300,
            semesters: '1-2, 2-1, 2-2, 3-1 균등 반영',
            allSubjectMax: 150,
            weightedSubjects: '영어(20점), 수학(20점), 기술가정(10점) = 50점 만점',
            attendanceMax: 80,
            attendanceRule: '미인정 결석 1일당 8점 감점',
            volunteerMax: 20,
            volunteerRule: '12시간 이상 만점(20점), 2시간 단위 1점 감점 (최저 14점)',
            leadershipMax: 0,
        },
        '특별': {
            totalMax: 280,
            semesters: '1-2, 2-1, 2-2, 3-1 균등 반영',
            allSubjectMax: 70,
            weightedSubjects: '영어(20점), 수학(20점), 기술가정(10점) = 50점 만점',
            attendanceMax: 120,
            attendanceRule: '미인정 결석 1일당 12점 감점',
            volunteerMax: 40,
            volunteerRule: '12시간 이상 만점(40점), 2시간 단위 2점 감점 (최저 28점)',
            leadershipMax: 0,
            note: '심층면접 20점 별도 (총 전형 만점 300점)',
        }
    },
    '울산에너지고': {
        '일반': {
            totalMax: 230,
            semesters: '1-2(10%), 2-1(25%), 2-2(25%), 3-1(40%) 가중 반영 (예체능 제외)',
            allSubjectMax: 90,
            weightedSubjects: '영어(20점), 수학(20점), 기술가정/과학(20점) = 60점 만점',
            attendanceMax: 30,
            attendanceRule: '미인정 결석 1일당 5점 감점',
            volunteerMax: 40,
            volunteerRule: '12시간 이상 만점(40점), 2시간 단위 1점 감점 (최저 34점)',
            leadershipMax: 10,
            leadershipRule: '학생회/학급임원 학기당 2.5점 (최대 10점)',
        },
        '특별': {
            totalMax: 200,
            semesters: '1-2(10%), 2-1(25%), 2-2(25%), 3-1(40%) 가중 반영 (예체능 제외)',
            allSubjectMax: 60,
            weightedSubjects: '영어(10점), 수학(10점), 기술가정/과학(10점) = 30점 만점',
            attendanceMax: 60,
            attendanceRule: '미인정 결석 1일당 5점 감점',
            volunteerMax: 40,
            volunteerRule: '12시간 이상 만점(40점), 2시간 단위 1점 감점 (최저 34점)',
            leadershipMax: 10,
            leadershipRule: '학생회/학급임원 학기당 2.5점 (최대 10점)',
        }
    },
    '현대공업고': {
        '일반': {
            totalMax: 200,
            semesters: '1-2(10%), 2-1(25%), 2-2(25%), 3-1(40%) 가중 반영 (예체능 제외)',
            allSubjectMax: 100,
            weightedSubjects: '영어(20점), 수학(20점), 기술가정(10점) = 50점 만점',
            attendanceMax: 30,
            attendanceRule: '미인정 결석 1일당 6점 감점 / 미인정 지각·조퇴·결과 1회당 2점 직접 감점',
            volunteerMax: 15,
            volunteerRule: '12시간 이상 만점(15점), 2시간 단위 1점 감점 (최저 9점)',
            leadershipMax: 5,
            leadershipRule: '학생회/학급임원 학기당 2.5점 (최대 5점)',
        },
        '특별': {
            totalMax: 150,
            semesters: '1-2(10%), 2-1(25%), 2-2(25%), 3-1(40%) 가중 반영 (예체능 제외)',
            allSubjectMax: 50,
            weightedSubjects: '영어(15점), 수학(15점), 기술가정(10점) = 40점 만점',
            attendanceMax: 40,
            attendanceRule: '미인정 결석 1일당 6점 감점 / 미인정 지각·조퇴·결과 1회당 2점 직접 감점',
            volunteerMax: 15,
            volunteerRule: '12시간 이상 만점(15점), 2시간 단위 1점 감점 (최저 9점)',
            leadershipMax: 5,
            leadershipRule: '학생회/학급임원 학기당 2.5점 (최대 5점)',
        }
    },
    '울산상업고': {
        '일반': { totalMax: 100, semesters: '1-2, 2-1, 2-2, 3-1 균등 25% (예체능 감점 반영)', allSubjectMax: 80, attendanceMax: 20, attendanceRule: '10/31 기준 결석 1일당 2점 감점', volunteerMax: 0 },
        '취업희망자': { totalMax: 60, semesters: '1-2, 2-1, 2-2, 3-1 균등 25%', allSubjectMax: 20, attendanceMax: 30, attendanceRule: '9/30 기준 결석 1일당 3점 감점', volunteerMax: 10, volunteerRule: '12시간 10점, 10시간 9점, 8시간 8점 등' }
    },
    '울산여자상업고': {
        '일반': { totalMax: 100, semesters: '1-2, 2-1, 2-2, 3-1 균등 25%', allSubjectMax: 80, attendanceMax: 20, attendanceRule: '10/31 기준 결석 1일당 2점 감점', volunteerMax: 0 },
        '취업희망자': { totalMax: 80, semesters: '1-2, 2-1, 2-2, 3-1 균등 25%', allSubjectMax: 40, attendanceMax: 30, attendanceRule: '9/30 기준 결석 1일당 3점 감점', volunteerMax: 10, volunteerRule: '12시간 10점, 10시간 9점, 8시간 8점 등' }
    },
    '울산생활과학고': {
        '일반': { totalMax: 100, semesters: '1-2(20%), 2-1(20%), 2-2(20%), 3-1(40%)', allSubjectMax: 80, attendanceMax: 20, attendanceRule: '10/31 기준 결석 1일당 2점 감점', volunteerMax: 0 },
        '취업희망자': { totalMax: 50, semesters: '1-2(20%), 2-1(20%), 2-2(20%), 3-1(40%)', allSubjectMax: 25, attendanceMax: 20, attendanceRule: '9/30 기준 결석 1일당 2점 감점', volunteerMax: 5, volunteerRule: '12시간 5점, 10시간 4.5점 등' }
    },
    '울산공업고': {
        '일반': { totalMax: 100, semesters: '1-2, 2-1, 2-2, 3-1 균등 25%', allSubjectMax: 80, attendanceMax: 20, attendanceRule: '10/31 기준 결석 1일당 2점 감점', volunteerMax: 0 },
        '취업희망자': { totalMax: 50, semesters: '1-2, 2-1, 2-2, 3-1 균등 25%', allSubjectMax: 20, attendanceMax: 20, attendanceRule: '9/30 기준 결석 1일당 2점 감점', volunteerMax: 10, volunteerRule: '12시간 10점, 10시간 9점 등' }
    },
    '울산산업고': {
        '일반': { totalMax: 100, semesters: '1-2, 2-1, 2-2, 3-1 균등 25%', allSubjectMax: 80, attendanceMax: 20, attendanceRule: '10/31 기준 결석 1일당 2점 감점', volunteerMax: 0 },
        '취업희망자': { totalMax: 50, semesters: '1-2, 2-1, 2-2, 3-1 균등 25%', allSubjectMax: 20, attendanceMax: 20, attendanceRule: '9/30 기준 결석 1일당 2점 감점', volunteerMax: 10, volunteerRule: '12시간 10점, 10시간 9점 등' }
    },
    '울산미용예술고': {
        '일반': { totalMax: 100, semesters: '1-2, 2-1, 2-2, 3-1 균등 25%', allSubjectMax: 80, attendanceMax: 20, attendanceRule: '10/31 기준 결석 1일당 2점 감점', volunteerMax: 0 },
        '취업희망자': { totalMax: 50, semesters: '1-2, 2-1, 2-2, 3-1 균등 25%', allSubjectMax: 20, attendanceMax: 20, attendanceRule: '9/30 기준 결석 1일당 2점 감점', volunteerMax: 10, volunteerRule: '12시간 10점, 10시간 9점 등' }
    },
    '울산기술공업고': {
        '일반': { totalMax: 100, semesters: '1-2, 2-1, 2-2, 3-1 균등 25%', allSubjectMax: 80, attendanceMax: 20, attendanceRule: '10/31 기준 결석 1일당 2점 감점', volunteerMax: 0 },
        '취업희망자': { totalMax: 50, semesters: '1-2, 2-1, 2-2, 3-1 균등 25%', allSubjectMax: 20, attendanceMax: 20, attendanceRule: '9/30 기준 결석 1일당 2점 감점', volunteerMax: 10, volunteerRule: '12시간 10점, 10시간 9점 등' }
    },
    '울산애니원고': {
        '일반': { totalMax: 100, semesters: '1-2, 2-1, 2-2, 3-1 균등 25%', allSubjectMax: 80, attendanceMax: 20, attendanceRule: '10/31 기준 결석 1일당 2점 감점', volunteerMax: 0 },
        '취업희망자': { totalMax: 50, semesters: '1-2, 2-1, 2-2, 3-1 균등 25%', allSubjectMax: 20, attendanceMax: 20, attendanceRule: '9/30 기준 결석 1일당 2점 감점', volunteerMax: 10, volunteerRule: '12시간 10점, 10시간 9점 등' }
    }
};

// ===== 학교별 공식 환산점수 세부 산출 명세 모달 =====
export function showSchoolScoreDetailModal(studentName, classNum, studentNum, r, fullStudent) {
    document.getElementById('schoolScoreDetailModal')?.remove();

    const sName = r.schoolName || '';
    const tName = r.trackName || '';
    const sNorm = normalizeSchoolName(sName);
    const tNorm = normalizeTrack(tName);

    const sRule = (SCHOOL_CALC_RULES[sName] || SCHOOL_CALC_RULES[sNorm] || {})[tNorm] || 
                  (SCHOOL_CALC_RULES[sName] || SCHOOL_CALC_RULES[sNorm] || {})['일반'] || {};

    let defaultMax = 100;
    if (sNorm.includes('마이스터')) defaultMax = (tNorm.includes('특별') ? 280 : 300);
    else if (sNorm.includes('에너지')) defaultMax = (tNorm.includes('특별') ? 200 : 230);
    else if (sNorm.includes('현대공업')) defaultMax = (tNorm.includes('특별') ? 150 : 200);
    const totalMax = r.totalMax || r.TotalMax || sRule.totalMax || defaultMax;

    // 가중치 상세 카드 HTML
    let weightedDetailsHTML = '';
    if (r.weightedDetails && Object.keys(r.weightedDetails).length > 0) {
        weightedDetailsHTML = `
            <div class="mt-2.5 pt-2.5 border-t border-slate-700/60 grid grid-cols-2 sm:grid-cols-3 gap-2">
                ${Object.entries(r.weightedDetails).map(([sub, score]) => `
                    <div class="bg-slate-900/60 p-2 rounded-lg border border-slate-700/40 text-center">
                        <div class="text-[11px] text-indigo-300 font-medium">${sub}</div>
                        <div class="text-xs font-black text-amber-300 mt-0.5">${Number(score).toFixed(2)}점</div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    const modal = document.createElement('div');
    modal.id = 'schoolScoreDetailModal';
    modal.className = 'fixed inset-0 bg-black/80 backdrop-blur-md z-[60] flex items-center justify-center p-3 md:p-6 overflow-y-auto animate-fade-in';
    modal.innerHTML = `
        <div class="glass-card w-full max-w-2xl p-6 md:p-7 rounded-2xl bg-slate-900/98 border border-slate-700/90 shadow-2xl space-y-4 animate-scale-up text-xs">
            <!-- 헤더 -->
            <div class="flex items-center justify-between border-b border-slate-700/60 pb-3.5">
                <div class="flex items-center gap-2.5">
                    <span class="text-2xl">📊</span>
                    <div>
                        <h3 class="text-lg font-black text-white flex items-center gap-2">
                            <span>[${sName}]</span> ${tName}전형 공식 성적 산출 상세
                        </h3>
                        <p class="text-[11px] text-slate-400 mt-0.5">
                            ${classNum}반 ${studentNum}번 <strong class="text-slate-200">${studentName}</strong> 학생의 고교 요강별 공식 환산 결과입니다.
                        </p>
                    </div>
                </div>
                <button id="closeSchoolScoreDetailBtn" class="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 text-lg transition-all cursor-pointer">✕</button>
            </div>

            <!-- 총점 요약 카드 (그라디언트) -->
            <div class="bg-linear-to-r from-indigo-950/60 via-slate-800/90 to-purple-950/60 p-4 rounded-xl border border-indigo-500/40 flex items-center justify-between shadow-inner">
                <div>
                    <span class="text-[11px] text-indigo-300 font-bold uppercase tracking-wider">최종 공식 환산 총점</span>
                    <div class="text-2xl font-black text-amber-300 mt-0.5">${Number(r.totalScore).toFixed(2)}<span class="text-xs text-slate-300 font-normal"> / ${totalMax}점 만점</span></div>
                </div>
                <div class="text-right space-y-0.5 text-[11px] text-slate-300 font-medium">
                    <div>교과 성적: <strong class="text-indigo-200">${(Number(r.allSubjectScore || 0) + Number(r.weightedScore || 0)).toFixed(2)}점</strong></div>
                    <div>비교과(출결·봉사·리더십): <strong class="text-emerald-300">${(Number(r.attendanceScore || 0) + Number(r.volunteerScore || 0) + Number(r.leadershipScore || 0)).toFixed(2)}점</strong></div>
                    ${Number(r.extraScore) > 0 ? `<div>가산점: <strong class="text-amber-300">+${Number(r.extraScore).toFixed(2)}점</strong></div>` : ''}
                </div>
            </div>

            <!-- 세부 점수 카드 영역 -->
            <div class="space-y-3 max-h-[60vh] overflow-y-auto custom-scrollbar pr-1">
                <!-- 1. 교과 성적 영역 -->
                <div class="bg-slate-800/60 p-3.5 rounded-xl border border-slate-700/60 space-y-2">
                    <div class="flex items-center justify-between border-b border-slate-700/40 pb-1.5">
                        <span class="font-bold text-slate-200 flex items-center gap-1.5">
                            <span>📚</span> 1. 교과 성적 산출 (전과목 + 가중치 과목)
                        </span>
                        <span class="font-black text-indigo-300">${(Number(r.allSubjectScore || 0) + Number(r.weightedScore || 0)).toFixed(2)}점 / ${(Number(r.allSubjectMax || 0) + Number(r.weightedMax || 0))}점 만점</span>
                    </div>

                    <!-- 전과목 점수 -->
                    <div class="bg-slate-900/60 p-2.5 rounded-lg border border-slate-700/40 flex items-center justify-between">
                        <div>
                            <div class="font-bold text-slate-200">기본 전과목 성적</div>
                            <div class="text-[11px] text-slate-400 mt-0.5">${sRule.semesters || '반영 학기 성적 산출'}</div>
                        </div>
                        <div class="text-right">
                            <span class="text-sm font-black text-white">${Number(r.allSubjectScore).toFixed(2)}점</span>
                            <span class="text-[10px] text-slate-400 block">${r.allSubjectMax || 0}점 만점</span>
                        </div>
                    </div>

                    <!-- 가중치 과목 점수 (있을 경우) -->
                    ${(r.weightedMax && r.weightedMax > 0) ? `
                        <div class="bg-slate-900/60 p-2.5 rounded-lg border border-slate-700/40">
                            <div class="flex items-center justify-between">
                                <div>
                                    <div class="font-bold text-slate-200">주요 과목별 가중치 배점</div>
                                    <div class="text-[11px] text-slate-400 mt-0.5">${sRule.weightedSubjects || '영어, 수학, 기술가정/과학 등 가중 반영'}</div>
                                </div>
                                <div class="text-right">
                                    <span class="text-sm font-black text-amber-300">${Number(r.weightedScore).toFixed(2)}점</span>
                                    <span class="text-[10px] text-slate-400 block">${r.weightedMax}점 만점</span>
                                </div>
                            </div>
                            ${weightedDetailsHTML}
                        </div>
                    ` : ''}
                </div>

                <!-- 2. 비교과 성적 영역 -->
                <div class="bg-slate-800/60 p-3.5 rounded-xl border border-slate-700/60 space-y-2">
                    <div class="flex items-center justify-between border-b border-slate-700/40 pb-1.5">
                        <span class="font-bold text-slate-200 flex items-center gap-1.5">
                            <span>🏃</span> 2. 비교과 성적 산출 (출결 / 봉사 / 리더십)
                        </span>
                        <span class="font-black text-emerald-300">${(Number(r.attendanceScore || 0) + Number(r.volunteerScore || 0) + Number(r.leadershipScore || 0)).toFixed(2)}점 / ${(Number(r.attendanceMax || 0) + Number(r.volunteerMax || 0) + Number(r.leadershipMax || 0))}점 만점</span>
                    </div>

                    <!-- 출결 점수 -->
                    <div class="bg-slate-900/60 p-2.5 rounded-lg border border-slate-700/40 flex items-center justify-between">
                        <div>
                            <div class="font-bold text-slate-200">출결 점수</div>
                            <div class="text-[11px] text-slate-400 mt-0.5">
                                미인정 결석 환산 <strong>${fullStudent?.absenceDays ?? 0}일</strong> 
                                <span class="text-[10px] text-slate-500">(결석 ${fullStudent?.rawAbsenceDays ?? 0}일, 지각·조퇴·결과 ${(fullStudent?.rawLateCount ?? 0) + (fullStudent?.rawEarlyCount ?? 0) + (fullStudent?.rawResultCount ?? 0)}회)</span>
                                ${sRule.attendanceRule ? ` • ${sRule.attendanceRule}` : ''}
                            </div>
                        </div>
                        <div class="text-right">
                            <span class="text-sm font-black text-emerald-400">${Number(r.attendanceScore).toFixed(2)}점</span>
                            <span class="text-[10px] text-slate-400 block">${r.attendanceMax || 0}점 만점</span>
                        </div>
                    </div>

                    <!-- 봉사 점수 -->
                    ${(r.volunteerMax && r.volunteerMax > 0) ? `
                        <div class="bg-slate-900/60 p-2.5 rounded-lg border border-slate-700/40 flex items-center justify-between">
                            <div>
                                <div class="font-bold text-slate-200">봉사활동 점수</div>
                                <div class="text-[11px] text-slate-400 mt-0.5">
                                    총 봉사시간: <strong>${fullStudent?.totalVolunteerHours || fullStudent?.volunteerHours || 0}시간</strong>
                                    ${sRule.volunteerRule ? ` • ${sRule.volunteerRule}` : ''}
                                </div>
                            </div>
                            <div class="text-right">
                                <span class="text-sm font-black text-sky-400">${Number(r.volunteerScore).toFixed(2)}점</span>
                                <span class="text-[10px] text-slate-400 block">${r.volunteerMax}점 만점</span>
                            </div>
                        </div>
                    ` : `
                        <div class="bg-slate-900/40 p-2 rounded-lg border border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
                            <span>봉사활동 점수: 본 전형 미반영 (0점)</span>
                            <span class="text-slate-500">배점 없음</span>
                        </div>
                    `}

                    <!-- 리더십 점수 (해당 학교) -->
                    ${(r.leadershipMax && r.leadershipMax > 0) ? `
                        <div class="bg-slate-900/60 p-2.5 rounded-lg border border-slate-700/40 flex items-center justify-between">
                            <div>
                                <div class="font-bold text-slate-200">리더십 가산 배점</div>
                                <div class="text-[11px] text-slate-400 mt-0.5">
                                    학생회/학급임원 <strong>${fullStudent?.leadershipTerms || 0}학기 인정</strong>
                                    ${sRule.leadershipRule ? ` • ${sRule.leadershipRule}` : ''}
                                </div>
                            </div>
                            <div class="text-right">
                                <span class="text-sm font-black text-purple-400">${Number(r.leadershipScore).toFixed(2)}점</span>
                                <span class="text-[10px] text-slate-400 block">${r.leadershipMax}점 만점</span>
                            </div>
                        </div>
                    ` : ''}

                    <!-- 창체/행발 가산점 -->
                    ${Number(r.extraScore) > 0 ? `
                        <div class="bg-slate-900/60 p-2.5 rounded-lg border border-amber-500/40 flex items-center justify-between">
                            <div>
                                <div class="font-bold text-amber-300">창체 / 행발 수기 가산점</div>
                                <div class="text-[11px] text-slate-400 mt-0.5">교과 외 추가 인정 가산 배점</div>
                            </div>
                            <div class="text-right">
                                <span class="text-sm font-black text-amber-400">+${Number(r.extraScore).toFixed(2)}점</span>
                            </div>
                        </div>
                    ` : ''}
                </div>

                ${sRule.note ? `
                    <div class="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-200 text-[11px]">
                        💡 <strong>전형 참고사항:</strong> ${sRule.note}
                    </div>
                ` : ''}
            </div>

            <!-- 하단 닫기 버튼 -->
            <div class="flex justify-end pt-2 border-t border-slate-700/60">
                <button id="closeSchoolScoreDetailFooterBtn" class="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 font-bold px-5 py-2 rounded-xl text-xs cursor-pointer active:scale-95 transition-all">
                    확인 및 닫기
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    modal.querySelector('#closeSchoolScoreDetailBtn')?.addEventListener('click', () => modal.remove());
    modal.querySelector('#closeSchoolScoreDetailFooterBtn')?.addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
}
