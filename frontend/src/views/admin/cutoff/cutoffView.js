import { GetSchoolConfig } from '../../../../wailsjs/go/main/App';
import { normalizeSchoolName } from '../../../core/utils.js';
import { app } from '../../../core/dom.js';
import { buildCutoffRowsHTML } from './cutoffRows.js';
import { renderCutoffLayout } from './cutoffLayout.js';
import { bindCutoffYearAndSearch, bindCutoffRowEditing, bindPublicDataApply } from './cutoffEvents.js';
import { bindPublicDataTab, bindCutoffShareAndBack } from './cutoffPublicTab.js';
import { defineCutoffSavers } from './cutoffSave.js';
import { state } from '../../../core/store.js';
import { currentAdmissionYear } from '../../../core/admissionYear.js';

// ===== 고교별 커트라인 관리 화면 (단일 페이지 통합 네비게이션 & 최저/최고/평균 입력 지원) =====
export async function renderCutoffScreen(schoolName) {
    // 화면 구성 요소들이 공유하는 상태 (파트 함수 간 전달)
    const ctx = { schoolName };
    await loadCutoffScreenData(ctx);
    defineCutoffMainRenderer(ctx);
    defineCutoffEventBinder(ctx);
    startCutoffScreen(ctx);
}

// 커트라인 관리: 입학년도·저장 커트라인·고교 목록·공식자료 적재
async function loadCutoffScreenData(ctx) {
    app.className = 'wide-layout';

    // 기준 고입 학년도: 학교 설정값(없으면 오늘 기준 현재 중3 입시). 그보다 미래 연도는 제외하고 직전 5개년을 보여 준다.
    let baseAdmissionYear = currentAdmissionYear();
    try {
        const config = await GetSchoolConfig();
        if (config && config.admissionYear) {
            const cfgYear = Number(config.admissionYear);
            if (cfgYear > 2000 && cfgYear <= 2100) {
                baseAdmissionYear = cfgYear;
            }
        }
    } catch (e) {
        console.warn(e);
    }

    ctx.currentAdmissionYear = baseAdmissionYear;

    ctx.allSavedCutoffs = [];
    try {
        ctx.allSavedCutoffs = await window.go.main.App.GetCutoffs() || [];
        // DB 내 중복 레코드(학교명 표기 차이, 전형명 중복 등) 자동 정리 및 표준화
        if (ctx.allSavedCutoffs && ctx.allSavedCutoffs.length > 0) {
            const rawCount = ctx.allSavedCutoffs.length;
            const uniqueSet = new Set(ctx.allSavedCutoffs.map(c => `${c.year}_${normalizeSchoolName(c.schoolName)}_${ctx.normalizeDept(c.department)}_${ctx.normalizeTrack(c.track)}`));
            if (uniqueSet.size < rawCount && window.go?.main?.App?.SaveCutoffs) {
                await window.go.main.App.SaveCutoffs(ctx.allSavedCutoffs);
                ctx.allSavedCutoffs = await window.go.main.App.GetCutoffs() || [];
            }
        }
    } catch (e) {
        console.error(e);
    }

    // 각 연도별 저장된 유효 커트라인 건수 집계 헬퍼 (중복 명칭 정규화하여 실제 고교·학과별 유효 항목 수 계산)
    ctx.getCutoffCountByYear = (yr) => {
        try {
            const uniqueKeys = new Set();
            (ctx.allSavedCutoffs || []).forEach(c => {
                if (Number(c.year) === Number(yr) && Number(c.minValue) > 0) {
                    const sKey = typeof normalizeSchoolName === 'function' ? normalizeSchoolName(c.schoolName) : (c.schoolName || '');
                    const dKey = typeof ctx.normalizeDept === 'function' ? ctx.normalizeDept(c.department) : (c.department || '');
                    const tKey = typeof ctx.normalizeTrack === 'function' ? ctx.normalizeTrack(c.track) : (c.track || '');
                    uniqueKeys.add(`${sKey}_${dKey}_${tKey}`);
                }
            });
            return uniqueKeys.size;
        } catch (e) {
            console.error('getCutoffCountByYear error:', e);
            return 0;
        }
    };

    // 기준 고입 연도와 그 직전 4개년(총 5개년)을 목록으로 만든다. 기준보다 미래 연도는 제외한다.
    const existingYears = (ctx.allSavedCutoffs || []).map(c => Number(c.year)).filter(y => !isNaN(y) && y > 2000 && y <= baseAdmissionYear);
    const candidateYears = new Set([baseAdmissionYear, ...existingYears]);
    for (let i = 0; i < 5; i++) {
        candidateYears.add(baseAdmissionYear - i);
    }
    ctx.admissionYears = Array.from(candidateYears).filter(y => y <= baseAdmissionYear).sort((a, b) => b - a);

    // 데이터가 가장 많이 등록된 연도가 있다면 기본 선택 우선 배정 (등록된 연도 바로 보여주기)
    const yearWithMostData = ctx.admissionYears.find(y => ctx.getCutoffCountByYear(y) > 0);
    if (ctx.getCutoffCountByYear(ctx.currentAdmissionYear) === 0 && yearWithMostData) {
        ctx.currentAdmissionYear = yearWithMostData;
    }

    // 기본 등록 고교 및 학과 목록 (동적 로드 전 빈 배열, 서버 데이터로 채워짐)
    ctx.defaultSchoolSpecs = [];

    // 울산 관내 공용 고교 목록 동적 로드 (서버의 highschools.json에서 읽어옴)
    try {
        const highSchoolData = await window.go.main.App.GetHighSchoolsData();
        const schools = highSchoolData?.schools || [];
        const catalogSpecs = schools
            .filter(s => {
                const t = (s.type || s.Type || '').toLowerCase();
                const note = (s.note || s.Note || '');
                // 영문 코드 및 한글 타입 모두 호환
                return t === 'meister' || t === 'special' || t === '마이스터고' || t === '특성화고'
                    || note.includes('마이스터고') || note.includes('특성화고');
            })
            .map(s => {
                const t = (s.type || s.Type || '').toLowerCase();
                const note = (s.note || s.Note || '');
                const isMeister = t === 'meister' || t === '마이스터고' || note.includes('마이스터고');
                const tracks = isMeister ? ['일반', '특별'] : ['일반', '취업희망자'];
                const rawName = s.name || s.Name || '';
                const shortName = normalizeSchoolName(rawName);
                // 각 학교별 환산 만점을 Go 백엔드의 AllSchoolRules에서 가져옴 (프론트엔드 하드코딩 제거)
                let totalMax = '100점 만점';
                try {
                    const rules = state.allSchoolRules || [];
                    const matchRule = rules.find(r => normalizeSchoolName(r.schoolName) === shortName && r.trackName === '일반');
                    if (matchRule && matchRule.totalMax) {
                        totalMax = `${matchRule.totalMax}점 만점`;
                    }
                } catch (_) {}
                // 하드코딩 fallback (백엔드 규칙 로드 실패 시)
                if (totalMax === '100점 만점' && isMeister) {
                    if (shortName === '울산마이스터고') totalMax = '300점 만점';
                    else if (shortName === '울산에너지고') totalMax = '230점 만점';
                    else if (shortName === '현대공업고') totalMax = '200점 만점';
                }
                const depts = s.departments || s.Departments || [];
                const defaultItems = isMeister
                    ? [
                        { dept: '', track: '일반' },
                        { dept: '', track: '특별' },
                        ...depts.flatMap(dept => tracks.map(track => ({ dept, track })))
                    ]
                    : depts.flatMap(dept => tracks.map(track => ({ dept, track })));
                return {
                    name: shortName,
                    fullName: rawName,
                    category: isMeister ? 'meister' : 'special',
                    categoryLabel: isMeister ? '마이스터고' : '특성화고',
                    totalMax,
                    scoreType: 'total_score',
                    unit: '점',
                    placeholder: isMeister ? '예: 200.0' : '예: 75.0',
                    items: defaultItems.length > 0 ? defaultItems : [{ dept: '', track: '일반' }],
                };
            });
        if (catalogSpecs.length) {
            ctx.defaultSchoolSpecs = [
                ...catalogSpecs,
                {
                    name: '울산 후기 일반계고', category: 'general', categoryLabel: '후기 일반고',
                    totalMax: '석차 백분율', scoreType: 'percentile', unit: '%', placeholder: '예: 85.00',
                    items: [{ dept: '공통', track: '일반' }],
                },
            ];
        }
    } catch (e) {
        console.warn('공용 고교 목록을 불러오지 못해 빈 목록으로 시작합니다:', e);
    }

    // 전형명 정규화 헬퍼 ('일반전형' -> '일반', '특별전형' -> '특별')
    ctx.normalizeTrack = (t) => {
        if (!t) return '일반';
        const s = String(t).trim();
        if (s === '일반' || s === '일반전형') return '일반';
        if (s === '특별' || s === '특별전형') return '특별';
        if (s === '취업' || s === '취업희망자' || s === '취업희망자전형') return '취업희망자';
        if (s === '일반계고' || s === '일반계고전형') return '일반계고';
        return s.replace(/전형$/, '');
    };

    // 학과명 정규화 헬퍼 ('공통', '전체', '학교 전체' -> '')
    ctx.normalizeDept = (d) => {
        if (!d) return '';
        const s = String(d).trim();
        return (s === '공통' || s === '전체' || s === '학교 전체') ? '' : s;
    };

    // 브라우저 캐시 잔재(구버전 localStorage) 완전 삭제
    try {
        localStorage.removeItem('publicOfficialCutoffData');
    } catch (_) {}

    // 공식 공개 입결 데이터 (하드코딩 없이 백엔드 data/official_admission_data.json 기반 로드)
    ctx.publicOfficialData = [];

    try {
        const officialResp = await window.go.main.App.GetOfficialAdmissionData().catch(() => null);
        if (officialResp?.items && Array.isArray(officialResp.items) && officialResp.items.length > 0) {
            ctx.publicOfficialData = officialResp.items.map(item => ({
                year: Number(item.admissionYear || item.year || ctx.currentAdmissionYear),
                school: item.schoolName || item.school || '',
                dept: item.department || '',
                track: item.track || '일반',
                min: Number(item.minAcceptedScore || item.minValue || item.min || 0) || '',
                max: Number(item.maxFailedScore || item.maxValue || item.max || 0) || '',
                avg: Number(item.avgAcceptedScore || item.avgValue || item.avg || 0) || '',
                unit: item.unit || '점',
                note: item.source || item.note || '공식자료'
            })).filter(x => {
                if (!x.school || x.school.includes('청량고')) return false;
                return true;
            });
        }
    } catch (e) {
        console.warn('공식 공개 데이터 불러오기 실패:', e);
        ctx.publicOfficialData = [];
    }

    // 공식 공개자료 백엔드 저장 헬퍼 (data/official_admission_data.json 동기화)
    ctx.syncPublicOfficialData = async () => {
        try {
            if (window.go?.main?.App?.SaveOfficialAdmissionData) {
                const itemsToSave = ctx.publicOfficialData.map(p => ({
                    admissionYear: Number(p.year) || ctx.currentAdmissionYear,
                    schoolName: p.school || '',
                    department: p.dept || '',
                    track: p.track || '일반',
                    minAcceptedScore: Number(p.min) || 0,
                    maxFailedScore: Number(p.max) || 0,
                    avgAcceptedScore: Number(p.avg) || 0,
                    unit: p.unit || (String(p.school).includes('일반계고') ? '%' : '점'),
                    source: p.note || '공식자료'
                }));
                await window.go.main.App.SaveOfficialAdmissionData(itemsToSave);
            }
        } catch (e) {
            console.error('공식자료 저장 실패:', e);
        }
    };
}

// 커트라인 관리: 탭·검색 상태와 본문 렌더러 정의
function defineCutoffMainRenderer(ctx) {
    ctx.currentTab = 'all'; // 'all', 'meister', 'special', 'general', 'public'
    ctx.searchKeyword = '';
    ctx.publicYearFilterMode = 'current'; // 'current': 상단 고교 입학년도 동기화, 'all': 전체 연도 모아보기
    ctx.deletedCutoffList = []; // 사용자가 UI에서 삭제하거나 비운 커트라인 목록 (DB 삭제 동기화용)

    ctx.renderMainScreen = () => {
        // 화면 구성 요소들이 공유하는 상태 (파트 함수 간 전달)
        const view = {  };
        buildCutoffRowsHTML(ctx, view);
        renderCutoffLayout(ctx, view);
    };
}

// 커트라인 관리: 이벤트 연결 함수 정의
function defineCutoffEventBinder(ctx) {
    ctx.bindEvents = () => {
        // 화면 구성 요소들이 공유하는 상태 (파트 함수 간 전달)
        const ui = {  };
        bindCutoffYearAndSearch(ctx, ui);
        bindCutoffRowEditing(ctx, ui);
        bindPublicDataApply(ctx, ui);
        bindPublicDataTab(ctx, ui);
        defineCutoffSavers(ctx, ui);
        bindCutoffShareAndBack(ctx, ui);
    };
}

// 커트라인 관리: 최초 렌더링
function startCutoffScreen(ctx) {
    ctx.renderMainScreen();
}
