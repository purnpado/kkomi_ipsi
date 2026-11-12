import { normalizeSchoolName } from '../../core/utils.js';
import { defineMatrixRows } from './matrixRows.js';
import { renderMatrixLayout, bindMatrixControls } from './matrixLayout.js';

export async function openMatrixModal(classNum = null) {
    // 화면 구성 요소들이 공유하는 상태 (파트 함수 간 전달)
    const ctx = { classNum };
    createMatrixModalShell(ctx);
    defineMatrixBuilder(ctx);
    await runMatrixBuilder(ctx);
}

// 신호등 매트릭스: 모달 골격 생성
function createMatrixModalShell(ctx) {
    document.getElementById('matrixModal')?.remove();

    ctx.initialClass = ctx.classNum ? String(ctx.classNum) : 'all';

    ctx.modalEl = document.createElement('div');
    ctx.modalEl.id = 'matrixModal';
    ctx.modalEl.className = 'fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-200';
    ctx.modalEl.innerHTML = `
        <div class="glass-card p-8 w-full max-w-[1850px] text-center">
            <span class="spinner"></span> 
            <span class="text-white ml-2">${ctx.classNum ? `${ctx.classNum}반 학생들의 신호등 매트릭스를 구성하는 중...` : '3학년 전교생의 5개년 신호등 매트릭스를 구성하는 중...'}</span>
        </div>
    `;
    document.body.appendChild(ctx.modalEl);
}

// 신호등 매트릭스: 본문 구성 함수 정의
function defineMatrixBuilder(ctx) {
    ctx.buildMatrixModal = async () => {
        // 화면 구성 요소들이 공유하는 상태 (파트 함수 간 전달)
        const mx = {  };
        await loadMatrixData(ctx, mx);
        defineMatrixRows(ctx, mx);
        renderMatrixLayout(ctx, mx);
        bindMatrixControls(ctx, mx);
    };
}

// 신호등 매트릭스: 전 학급 산출 결과와 커트라인 이력 적재
async function loadMatrixData(ctx, mx) {
    mx.fullGrades = [];
    mx.classCount = 8;
    try {
        const config = await window.go.main.App.GetSchoolConfig();
        if (config?.classCount) mx.classCount = config.classCount;
    } catch (e) {
        console.warn(e);
    }

    // 전체 학급 데이터를 일괄 로드하여 반별/전체 필터 전환을 자유롭게 지원
    const promises = [];
    for (let c = 1; c <= mx.classCount; c++) {
        promises.push(
            window.go.main.App.GetClassFullGrades(c).catch(() => []).then(list => {
                (list || []).forEach(s => { s.classNum = c; });
                return list || [];
            })
        );
    }
    const allResults = await Promise.all(promises);
    mx.fullGrades = allResults.flat();

    const cutoffs = await window.go.main.App.GetCutoffs().catch(() => []);

    // 학교 목록 정의 (정확한 공식 명칭 기반 완전 일치)
    mx.schoolKeywords = [
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
    const cutoffLastYearMap = new Map(); // 직전 1개년 기준선의 학년도·학과(근거 자료 조회용)
    mx.schoolKeywords.forEach(s => {
        const sNorm = normalizeSchoolName(s.fullName);
        ['general', 'special'].forEach(trackType => {
            const historyByYear = new Map();
            const basisByYear = new Map();
            (cutoffs || []).filter(c => {
                if (normalizeSchoolName(c.schoolName) !== sNorm || Number(c.minValue) <= 0) return false;
                const isSpec = c.track.includes('특별') || c.track.includes('취업');
                return trackType === 'special' ? isSpec : !isSpec;
            }).sort((a, b) => b.year - a.year)
              .forEach(c => {
                  if (!historyByYear.has(c.year)) {
                      historyByYear.set(c.year, Number(c.minValue));
                      basisByYear.set(c.year, { year: c.year, department: c.department || '' });
                  }
              });

            const sortedValues = [...historyByYear.entries()].sort((a, b) => b[0] - a[0]).map(x => x[1]);
            cutoffHistoryMap.set(`${s.fullName}_${trackType}`, sortedValues);
            const lastYear = [...historyByYear.keys()].sort((a, b) => b - a)[0];
            if (lastYear) cutoffLastYearMap.set(`${s.fullName}_${trackType}`, basisByYear.get(lastYear));
        });
    });

    // 특정 학교/전형/연도모드 기준선 계산 함수
    mx.getSchoolCutoffVal = (schoolName, trackType, yearMode) => {
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

    // 직전 1개년 기준선일 때만 그 학년도·학과를 돌려준다(평균선은 근거 자료를 보지 않는다).
    mx.getSchoolCutoffBasis = (schoolName, trackType, yearMode) =>
        (yearMode === 'last' ? cutoffLastYearMap.get(`${schoolName}_${trackType}`) : null) || null;

    // 학생의 특정 고교 환산점수 반환 헬퍼 (정확한 학교명 완전 일치 매칭)
    mx.getStudentSchoolScore = (student, schoolName, trackMode) => {
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
}

// 신호등 매트릭스: 본문 구성 실행 및 오류 표시
async function runMatrixBuilder(ctx) {
    try {
        await ctx.buildMatrixModal();
    } catch (err) {
        ctx.modalEl.innerHTML = `<div class="glass-card p-8 text-center text-danger font-bold">매트릭스 생성 실패: ${err}</div>`;
    }
}

if (typeof window !== 'undefined') {
    window.openMatrixModal = openMatrixModal;
}
