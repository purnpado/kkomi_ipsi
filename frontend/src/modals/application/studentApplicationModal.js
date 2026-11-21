import { escapeHtml, escapeAttr, displayTrack } from '../../core/utils.js';
import { defineApplicationRenderer } from './applicationForm.js';
import { state } from '../../core/store.js';
import { resolveAdmissionYear } from '../../core/admissionYear.js';
import { ULSAN_OTHER_SCHOOLS, ULSAN_OTHER_DEPARTMENTS, ROUND_TRACKS, needsRoundTrack, hasOtherDepartments } from '../../core/ulsanOtherSchools.js';

// ===== 학생별 지원·합격 결과 (학교 내부 암호화 DB 전용) =====
export async function openStudentApplicationModal(classNum, studentNum, name, preset = null) {
    // 화면 구성 요소들이 공유하는 상태 (파트 함수 간 전달)
    const ctx = { classNum, studentNum, name, preset };
    await prepareApplicationModal(ctx);
    defineApplicationRenderer(ctx);
    await startApplicationModal(ctx);
}

// 지원현황 입력: 모달 골격과 학교·전형·학과 선택 도우미 준비
async function prepareApplicationModal(ctx) {
    document.getElementById('studentApplicationModal')?.remove();
    ctx.modal = document.createElement('div');
    ctx.modal.id = 'studentApplicationModal';
    ctx.modal.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto';
    ctx.modal.innerHTML = `<div class="glass-card p-7 w-full max-w-3xl"><span class="spinner"></span> 지원현황을 불러오는 중…</div>`;
    document.body.appendChild(ctx.modal);

    ctx.closeModal = () => {
        document.removeEventListener('keydown', handleKeydown);
        ctx.modal.remove();
    };
    const handleKeydown = (e) => {
        if (e.key === 'Escape') ctx.closeModal();
    };
    document.addEventListener('keydown', handleKeydown);
    ctx.modal.onclick = (e) => {
        if (e.target === ctx.modal) ctx.closeModal();
    };

    // 새 원서의 고입 학년도 기본값은 날짜가 아니라 학교 설정을 따른다(확정·공유·통계와 일치).
    ctx.defaultAdmissionYear = resolveAdmissionYear(await window.go.main.App.GetSchoolConfig().catch(() => null));
    ctx.canEdit = !state.currentUser || state.currentUser.Role !== 'viewer';
    ctx.statusOptions = ['지원희망', '지원완료', '합격', '불합격'];
    // 자사고·외고와 기타를 "기타 울산 고교" 하나로 합쳤다(2026-11-21). 예전 자사고·외고(self_foreign) 원서는 이 구분으로 보여 준다.
    // 세 번째 값은 고른 구분 아래 작은 글씨 안내(긴 설명을 선택 칸에 넣으면 잘린다).
    ctx.categoryOptions = [['meister', '마이스터고'], ['special', '특성화고'], ['general', '후기 일반고'],
        ['other', '기타 울산 고교', '과학고·예술고·스포츠과학고·애니원고·외고·자사고·고운고 등'],
        ['out_province', '타시도 고교', '다른 시·도의 자사고·외고·특목고·마이스터고·특성화고·일반고 등'], ['none', '미진학 (진학포기)']];
    ctx.categoryHint = category => (ctx.categoryOptions.find(([v]) => v === category) || [])[2] || '';
    // 학교명을 직접 넣을 수 있는 구분: 기타(울산 예술고 등 + 직접 입력), 타시도 고교(늘 직접 입력)
    ctx.isCustomSchoolCategory = category => category === 'other' || category === 'out_province';
    // 지원현황 창은 목록 조회 실패 때문에 열리지 않으면 안 된다. Wails 바인딩
    // 누락·손상 또는 로컬 목록 파일 문제도 1.5초 안에 빈 목록으로 처리한다.
    ctx.withFallback = (operation, fallback, timeoutMs = 1500) => Promise.race([
        Promise.resolve().then(operation).then(result => result ?? fallback).catch(() => fallback),
        new Promise(resolve => setTimeout(() => resolve(fallback), timeoutMs)),
    ]);
    // 고교 목록 실패는 화면을 막지 않되, 학생 산출값은 백그라운드에서 끝까지
    // 가져온 뒤 선택된 학교·전형의 점수 스냅샷을 채운다.
    const highSchoolData = await ctx.withFallback(
        () => window.go?.main?.App?.GetHighSchoolsData?.(),
        { schools: [] },
    );
    let studentDetail = null;
    ctx.refreshAutoScore = null;
    // 기타 울산 고교의 학과(과정)도 고를 수 있게 학교 목록에 더한다(고교 목록 파일에는 마이스터고·특성화고만 있음).
    ctx.catalog = [...(highSchoolData?.schools || []), ...Object.entries(ULSAN_OTHER_DEPARTMENTS)
        .filter(([name]) => !(highSchoolData?.schools || []).some((s) => s.name === name))
        .map(([name, departments]) => ({ name, type: 'other', departments }))];
    // 학교·전형별 1차 선발 배수와 2차 전형 구성(백엔드 calc/stages.go, 2027 요강 확인값)
    const ruleList = await ctx.withFallback(() => window.go?.main?.App?.GetSchoolRuleList?.(), []);
    const stageTrack = track => {
        const t = String(track || '').replace(/\s/g, '');
        if (t.includes('취업')) return '취업희망자';
        if (t.includes('특별')) return '특별';
        if (t.includes('일반')) return '일반';
        return t;
    };
    ctx.stageInfo = (schoolName, track) => {
        const school = String(schoolName || '').replace(/\s/g, '').replace(/등학교$/, '');
        const rule = (ruleList || []).find(r => r.schoolName === school && r.trackName === stageTrack(track));
        const multiplier = Number(rule?.firstStageMultiplier || 0);
        return multiplier > 0 ? { multiplier, rounding: rule.firstStageRounding || '', note: rule.secondStageNote || '' } : null;
    };
    ctx.normalizedSchoolName = value => String(value || '').replace(/등학교$/, '').replace(/\s/g, '');
    const trackLabel = displayTrack;
    const calculatedTracks = (schoolName, category) => {
        const raw = [...new Set((studentDetail?.schoolResults || [])
            .filter(result => ctx.normalizedSchoolName(result.schoolName) === ctx.normalizedSchoolName(schoolName))
            .map(result => result.trackName)
            .filter(Boolean))];
        if (category === 'meister') {
            return raw.sort((a, b) => (b.includes('특별') ? 1 : 0) - (a.includes('특별') ? 1 : 0));
        }
        if (category === 'special') {
            return raw.sort((a, b) => (b.includes('취업') ? 1 : 0) - (a.includes('취업') ? 1 : 0));
        }
        return raw;
    };
    const fallbackTracks = category => {
        if (category === 'meister') return ['특별', '일반'];
        if (category === 'special') return ['취업희망자', '일반'];
        if (category === 'self_foreign') return ['자사고·외고 전형'];
        if (category === 'general') return ['후기 일반계고'];
        if (category === 'none') return ['진학포기', '취업·가사', '해외유학', '검정고시', '기타'];
        return ['해당 없음'];
    };
    ctx.trackOptions = (category, schoolName, selected = '') => {
        if (ctx.isCustomSchoolCategory(category)) {
            // 목록 밖 학교·타시도 고교는 이중지원 금지 규칙을 위해 지원 시기를 고른다(전형 칸에 저장).
            if (!needsRoundTrack(category, schoolName)) return '<option value="해당 없음" selected>해당 없음</option>';
            return `<option value="">지원 시기 선택</option>${ROUND_TRACKS.map(([v, t]) => `<option value="${v}" ${v === selected ? 'selected' : ''}>${t}</option>`).join('')}`;
        }
        const tracks = (['meister', 'special'].includes(category) && schoolName)
            ? (calculatedTracks(schoolName, category).length ? calculatedTracks(schoolName, category) : fallbackTracks(category))
            : fallbackTracks(category);
        return tracks.map(track => `<option value="${track}" ${track === selected ? 'selected' : ''}>${trackLabel(track)}</option>`).join('');
    };
    ctx.calculatedScore = (category, schoolName, track) => {
        if (category === 'general') {
            const value = Number(studentDetail?.generalHSTotalScore);
            return Number.isFinite(value) && value > 0 ? { score: value, basis: '후기 일반계고 내신 자동 산출' } : null;
        }
        if (!['meister', 'special'].includes(category) || !schoolName || !track) return null;
        const result = (studentDetail?.schoolResults || []).find(item =>
            ctx.normalizedSchoolName(item.schoolName) === ctx.normalizedSchoolName(schoolName) && item.trackName === track,
        );
        if (!result || !Number.isFinite(Number(result.totalScore))) return null;
        return { score: Number(result.totalScore), basis: `${result.schoolName} ${trackLabel(result.trackName)} 자동 산출 (${result.totalMax}점 만점)` };
    };
    const typeMatches = (schoolType, cat) => {
        if (!schoolType) return false;
        const t = String(schoolType).toLowerCase().trim();
        if (cat === 'meister') return t === 'meister' || t.includes('마이스터');
        if (cat === 'special') return t === 'special' || t.includes('특성화');
        if (cat === 'general') return t === 'general' || t.includes('일반');
        return false;
    };
    ctx.schoolOptions = (category, selected = '') => {
        // 타시도 고교는 유형과 상관없이 학교명을 직접 입력한다.
        if (category === 'out_province') return '<option value="__custom_school__" selected>학교명 직접 입력</option>';
        if (category === 'other' || category === 'self_foreign') {
            const schools = ULSAN_OTHER_SCHOOLS;
            const custom = selected && !schools.includes(selected);
            return `<option value="">학교 선택</option>${schools.map(name => `<option value="${escapeAttr(name)}" ${name === selected ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('')}<option value="__custom_school__" ${custom ? 'selected' : ''}>기타 학교 직접 입력</option>`;
        }
        if (category === 'none') {
            return `<option value="미진학" selected>미진학</option>`;
        }
        const filtered = ctx.catalog.filter(s => typeMatches(s.type, category));
        if (!filtered.length) {
            if (category === 'meister') {
                const meisterDefaults = ['울산마이스터고등학교', '울산에너지고등학교', '현대공업고등학교'];
                return `<option value="">학교 선택</option>${meisterDefaults.map(name => `<option value="${escapeAttr(name)}" ${name === selected ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('')}`;
            }
            if (category === 'special') {
                const specialDefaults = ['울산공업고등학교', '울산기술공업고등학교', '울산미용예술고등학교', '울산산업고등학교', '울산생활과학고등학교', '울산상업고등학교', '울산여자기술공업고등학교'];
                return `<option value="">학교 선택</option>${specialDefaults.map(name => `<option value="${escapeAttr(name)}" ${name === selected ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('')}`;
            }
            return '<option value="">해당 없음</option>';
        }
        return `<option value="">학교 선택</option>${filtered.map(s => `<option value="${escapeAttr(s.name)}" ${s.name === selected ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}`;
    };
    const departmentOptions = (schoolName, selected = '', placeholder = '', allPreferences = [], currentIndex = -1) => {
        const school = ctx.catalog.find(s => s.name === schoolName || ctx.normalizedSchoolName(s.name) === ctx.normalizedSchoolName(schoolName));
        return `<option value="">${placeholder}</option>${(school?.departments || []).map(d => {
            const isSelectedHere = d === selected;
            const otherIndex = allPreferences.findIndex((p, i) => i !== currentIndex && p === d && p !== '');
            if (otherIndex !== -1) {
                return `<option value="${escapeAttr(d)}" disabled class="text-slate-500 bg-slate-800">${escapeHtml(d)} (${otherIndex + 1}지망에 이미 선택됨)</option>`;
            }
            return `<option value="${escapeAttr(d)}" ${isSelectedHere ? 'selected' : ''}>${escapeHtml(d)}</option>`;
        }).join('')}`;
    };
    // 자사고·외고·과학고·예술고·스포츠과학고·애니원고 등(기타 포함)은 실기·면접 등 별도 전형이므로
    // 점수를 기록·집계하지 않고 지원·합격 결과만 남긴다.
    // 1차(정원의 1.3~1.5배 선발)·2차(면접 등) 전형 단계 결과. 커트라인 분석에서 2차 탈락을 구분한다.
    ctx.stageOptions = (selected = '') => [['', '미발표 · 구분 안 함'], ['합격', '1차 합격'], ['불합격', '1차 불합격']]
        .map(([v, t]) => `<option value="${v}" ${v === selected ? 'selected' : ''}>${t}</option>`).join('');
    ctx.isUnscoredCategory = category => ['self_foreign', 'other', 'out_province', 'none'].includes(category);
    // 특성화고 취업희망자 특별전형은 1개 학과(1지망)만 지원할 수 있다.
    // 기타 울산 고교는 지원 학과(과정) 1개를 고른다.
    ctx.preferenceLimit = (category, track) => ((category === 'special' && String(track || '').includes('취업')) || category === 'other' || category === 'self_foreign' ? 1 : 5);
    ctx.showsDepartments = (category, schoolName) => ['meister', 'special'].includes(category) || hasOtherDepartments(category, schoolName);
    ctx.departmentControls = (schoolName, preferences = [], assignedDepartment = '', limit = 5) => {
        const school = ctx.catalog.find(s => s.name === schoolName || ctx.normalizedSchoolName(s.name) === ctx.normalizedSchoolName(schoolName));
        const departments = school?.departments || [];
        if (!schoolName) return '<p class="text-xs text-text-muted">지원 학교를 선택하면 해당 학교의 학과 수에 맞춰 지망 입력란이 표시됩니다.</p>';
        if (!departments.length) return '<p class="text-xs text-amber-300">이 학교의 학과 목록을 불러오지 못했습니다. 학년부장에게 최신 배포자료를 받아 다시 적용하세요.</p>';
        const count = Math.min(limit, departments.length);
        const paddedPrefs = Array.from({ length: count }, (_, i) => preferences[i] || '');
        return `
            <div class="mb-2 flex items-center justify-between">
                <p class="text-sm font-bold text-white flex items-center gap-1.5">
                    <span>🎯</span> 학과 지망
                    <span class="text-xs font-normal text-slate-400">${limit === 1 ? '(1개 학과만 고릅니다)' : '(다른 지망에 선택된 학과는 비활성화되어 중복 선택이 방지됩니다)'}</span>
                </p>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                ${paddedPrefs.map((selected, i) => `
                    <div class="space-y-1">
                        <label class="text-xs font-semibold text-slate-300 flex items-center gap-1">
                            <span class="inline-flex items-center justify-center w-4 h-4 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] font-bold border border-indigo-400/30">${i + 1}</span>
                            <span>${i + 1}지망 학과</span>
                        </label>
                        <select class="input-field app-pref text-sm py-2" data-rank="${i + 1}">
                            ${departmentOptions(schoolName, selected, `${i + 1}지망 학과 선택`, paddedPrefs, i)}
                        </select>
                    </div>
                `).join('')}
            </div>
            <label class="text-sm font-bold block mt-4 text-white">
                <span class="flex items-center gap-1.5 mb-1.5">
                    <span>🏆</span> 최종 합격(배정) 학과
                    <span class="text-xs font-normal text-emerald-400">(합격 발표 후 실제 배정된 학과를 지정하세요)</span>
                </span>
                <select id="appAssigned" class="input-field w-full text-sm py-2">
                    ${departmentOptions(schoolName, assignedDepartment, '최종 배정 학과 선택')}
                </select>
            </label>
        `;
    };
}

// 지원현황 입력: 학생 자료 적재 후 최초 렌더링
async function startApplicationModal(ctx) {
    try {
        await ctx.render();
    } catch (err) {
        ctx.modal.innerHTML = `<div class="glass-card p-7 max-w-lg"><h2 class="text-xl font-bold mb-3">지원현황을 열 수 없습니다</h2><p class="text-text-muted wrap-break-word">${err?.message || err}</p><button id="closeApplicationModal" class="btn-secondary w-auto px-4 py-2 mt-5 cursor-pointer">닫기</button></div>`;
        document.getElementById('closeApplicationModal').onclick = ctx.closeModal;
    }
}

if (typeof window !== 'undefined') {
    window.openStudentApplicationModal = openStudentApplicationModal;
}
