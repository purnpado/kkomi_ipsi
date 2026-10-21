import { escapeHtml, escapeAttr } from '../core/utils.js';
import { showModalAlert, showModalConfirm } from '../core/dialogs.js';

// ===== 학생별 지원·합격 결과 (학교 내부 암호화 DB 전용) =====
export async function openStudentApplicationModal(classNum, studentNum, name, preset = null) {
    document.getElementById('studentApplicationModal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'studentApplicationModal';
    modal.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto';
    modal.innerHTML = `<div class="glass-card p-7 w-full max-w-3xl"><span class="spinner"></span> 지원 현황을 불러오는 중...</div>`;
    document.body.appendChild(modal);

    const closeModal = () => {
        document.removeEventListener('keydown', handleKeydown);
        modal.remove();
    };
    const handleKeydown = (e) => {
        if (e.key === 'Escape') closeModal();
    };
    document.addEventListener('keydown', handleKeydown);
    modal.onclick = (e) => {
        if (e.target === modal) closeModal();
    };

    const canEdit = !window.currentUser || window.currentUser.Role !== 'viewer';
    const statusOptions = ['지원희망', '지원완료', '합격', '불합격'];
    const categoryOptions = [['meister', '마이스터고'], ['special', '특성화고'], ['self_foreign', '자사고·외고'], ['general', '후기 일반고'], ['other', '기타 (전기 기타고/타시도 등)'], ['none', '미진학 (진학포기)']];
    // 지원현황 창은 목록 조회 실패 때문에 열리지 않으면 안 된다. Wails 바인딩
    // 누락·손상 또는 로컬 목록 파일 문제도 1.5초 안에 빈 목록으로 처리한다.
    const withFallback = (operation, fallback, timeoutMs = 1500) => Promise.race([
        Promise.resolve().then(operation).then(result => result ?? fallback).catch(() => fallback),
        new Promise(resolve => setTimeout(() => resolve(fallback), timeoutMs)),
    ]);
    // 고교 목록 실패는 화면을 막지 않되, 학생 산출값은 백그라운드에서 끝까지
    // 가져온 뒤 선택된 학교·전형의 점수 스냅샷을 채운다.
    const highSchoolData = await withFallback(
        () => window.go?.main?.App?.GetHighSchoolsData?.(),
        { schools: [] },
    );
    let studentDetail = null;
    let refreshAutoScore = null;
    const catalog = highSchoolData?.schools || [];
    const normalizedSchoolName = value => String(value || '').replace(/등학교$/, '').replace(/\s/g, '');
    const trackLabel = track => ({
        '일반': '일반전형',
        '특별': '특별전형',
        '취업희망자': '취업자 특별전형',
        '후기 일반계고': '후기 일반계고',
    }[track] || track);
    const calculatedTracks = (schoolName, category) => {
        const raw = [...new Set((studentDetail?.schoolResults || [])
            .filter(result => normalizedSchoolName(result.schoolName) === normalizedSchoolName(schoolName))
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
    const trackOptions = (category, schoolName, selected = '') => {
        if (category === 'other') return '<option value="해당 없음" selected>해당 없음</option>';
        const tracks = (['meister', 'special'].includes(category) && schoolName)
            ? (calculatedTracks(schoolName, category).length ? calculatedTracks(schoolName, category) : fallbackTracks(category))
            : fallbackTracks(category);
        return tracks.map(track => `<option value="${track}" ${track === selected ? 'selected' : ''}>${trackLabel(track)}</option>`).join('');
    };
    const calculatedScore = (category, schoolName, track) => {
        if (category === 'general') {
            const value = Number(studentDetail?.generalHSTotalScore);
            return Number.isFinite(value) && value > 0 ? { score: value, basis: '후기 일반계고 내신 자동 산출' } : null;
        }
        if (!['meister', 'special'].includes(category) || !schoolName || !track) return null;
        const result = (studentDetail?.schoolResults || []).find(item =>
            normalizedSchoolName(item.schoolName) === normalizedSchoolName(schoolName) && item.trackName === track,
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
    const schoolOptions = (category, selected = '') => {
        if (category === 'self_foreign') {
            const schools = ['현대청운고등학교', '울산외국어고등학교'];
            return `<option value="">학교 선택</option>${schools.map(name => `<option value="${escapeAttr(name)}" ${name === selected ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('')}`;
        }
        if (category === 'other') {
            const schools = ['울산예술고등학교', '울산스포츠과학고등학교', '울산고운고등학교', '울산애니원고등학교', '울산과학고등학교', '타시도 고등학교', '기타'];
            return `<option value="">선택 안 함</option>${schools.map(name => `<option value="${escapeAttr(name)}" ${name === selected ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('')}`;
        }
        if (category === 'none') {
            return `<option value="미진학" selected>미진학</option>`;
        }
        const filtered = catalog.filter(s => typeMatches(s.type, category));
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
        const school = catalog.find(s => s.name === schoolName || normalizedSchoolName(s.name) === normalizedSchoolName(schoolName));
        return `<option value="">${placeholder}</option>${(school?.departments || []).map(d => {
            const isSelectedHere = d === selected;
            const otherIndex = allPreferences.findIndex((p, i) => i !== currentIndex && p === d && p !== '');
            if (otherIndex !== -1) {
                return `<option value="${escapeAttr(d)}" disabled class="text-slate-500 bg-slate-800">${escapeHtml(d)} (${otherIndex + 1}지망에 이미 선택됨)</option>`;
            }
            return `<option value="${escapeAttr(d)}" ${isSelectedHere ? 'selected' : ''}>${escapeHtml(d)}</option>`;
        }).join('')}`;
    };
    const departmentControls = (schoolName, preferences = [], assignedDepartment = '') => {
        const school = catalog.find(s => s.name === schoolName || normalizedSchoolName(s.name) === normalizedSchoolName(schoolName));
        const departments = school?.departments || [];
        if (!schoolName) return '<p class="text-xs text-text-muted">지원 학교를 선택하면 해당 학교의 학과 수에 맞춰 지망 입력란이 표시됩니다.</p>';
        if (!departments.length) return '<p class="text-xs text-amber-300">이 학교의 학과 목록을 불러오지 못했습니다. 학년부장에게 최신 배포자료를 받아 다시 적용하세요.</p>';
        const count = Math.min(5, departments.length);
        const paddedPrefs = Array.from({ length: count }, (_, i) => preferences[i] || '');
        return `
            <div class="mb-2 flex items-center justify-between">
                <p class="text-sm font-bold text-white flex items-center gap-1.5">
                    <span>🎯</span> 학과 지망
                    <span class="text-xs font-normal text-slate-400">(다른 지망에 선택된 학과는 비활성화되어 중복 선택이 방지됩니다)</span>
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

    let activePreset = preset; // 1회성 적용용

    const render = async (selectedIndex = 0) => {
        const records = await withFallback(
            () => window.go?.main?.App?.GetStudentApplications?.(classNum, studentNum, name),
            [],
        );

        let workingRecords = [...records];
        let activeIdx = selectedIndex;

        // [관심학교 -> 희망원서 자동 등록 연동 프리셋 처리]
        if (activePreset) {
            const rawSch = activePreset.schoolName || '';
            const matchSchool = catalog.find(s => normalizedSchoolName(s.name) === normalizedSchoolName(rawSch));
            const exactSchoolName = matchSchool ? matchSchool.name : rawSch;
            let cat = activePreset.category || 'meister';
            if (matchSchool) {
                const t = String(matchSchool.type || '').toLowerCase();
                if (t.includes('meister') || t.includes('마이스터')) cat = 'meister';
                else if (t.includes('special') || t.includes('특성화')) cat = 'special';
                else if (t.includes('self_foreign')) cat = 'self_foreign';
                else if (t.includes('general') || t.includes('일반')) cat = 'general';
            }

            const rawTrk = activePreset.track || '';
            const cleanTrack = rawTrk.includes('특별') ? '특별' : (rawTrk.includes('취업') ? '취업희망자' : '일반');

            const presetRecord = {
                admissionYear: new Date().getFullYear() + 1,
                category: cat,
                schoolName: exactSchoolName,
                track: cleanTrack,
                status: '지원희망',
                score: activePreset.score || 0,
                scoreBasis: activePreset.scoreBasis || (activePreset.score ? `${exactSchoolName} 산출 점수 연동` : ''),
                preferences: [],
                assignedDepartment: '',
                assignedSchool: '',
                isPresetItem: true
            };

            const existingIdx = workingRecords.findIndex(r =>
                normalizedSchoolName(r.schoolName) === normalizedSchoolName(exactSchoolName) &&
                (r.track === cleanTrack || (!r.track && cleanTrack === '일반'))
            );
            if (existingIdx !== -1) {
                activeIdx = existingIdx;
            } else {
                workingRecords.push(presetRecord);
                activeIdx = workingRecords.length - 1;
            }
            activePreset = null;
        }

        const record = workingRecords[activeIdx] || { admissionYear: new Date().getFullYear() + 1, category: 'meister', status: '지원희망', preferences: [] };
        const isGeneral = record.category === 'general';
        const isNone = record.category === 'none';
        const isOther = record.category === 'other';
        const needsSchool = ['meister', 'special', 'self_foreign'].includes(record.category);
        const needsDepartment = ['meister', 'special'].includes(record.category);
        const autoScore = calculatedScore(record.category, record.schoolName, record.track);
        const displayedScore = isNone ? 0 : (record.id ? record.score : (autoScore?.score ?? record.score));
        const displayedBasis = record.scoreBasis || autoScore?.basis || '';
        const isAutoBasis = displayedBasis === (autoScore?.basis || '') || !record.scoreBasis;
        const formatTrack = (track) => track ? `(${track.includes('특별') ? '특별' : (track.includes('일반') ? '일반' : track)})` : '';

        const isPassedStatus = ['합격', '최종 진학', '최종진학'].includes((record.status || '').trim());
        const isRecordFinalized = isPassedStatus && (
            (['meister', 'special'].includes(record.category) && !!record.assignedDepartment) ||
            (record.category === 'general' && !!record.assignedSchool) ||
            (!['meister', 'special', 'general'].includes(record.category))
        );
        let isLocked = isRecordFinalized;

        const listTabs = workingRecords.map((r, i) => {
            const isRecNone = r.category === 'none';
            const nameLabel = isRecNone ? '미진학' : (r.schoolName || (r.category === 'general' ? (r.assignedSchool ? `일반고[${r.assignedSchool}]` : '후기 일반고') : '기타'));
            const trackPart = ['meister', 'special'].includes(r.category) ? formatTrack(r.track) : '';
            const statusPart = isRecNone ? '미진학' : ((r.status === '지원예정' || r.status === '지원 예정' || !r.status) ? '지원희망' : r.status);
            const isRecPassed = ['합격', '최종 진학', '최종진학'].includes((r.status || '').trim());
            const isRecFin = isRecPassed && ((['meister', 'special'].includes(r.category) && !!r.assignedDepartment) || (r.category === 'general' && !!r.assignedSchool) || (!['meister', 'special', 'general'].includes(r.category)));
            const lockIcon = isRecFin ? '🔒 ' : '';
            const presetBadge = r.isPresetItem ? '✨ ' : '';
            return `<button class="app-record-tab px-3 py-2 rounded-lg text-xs font-bold transition-all ${i === activeIdx ? 'bg-primary text-white shadow-md' : 'bg-slate-800 text-text-muted hover:text-white'}" data-index="${i}">${presetBadge}${lockIcon}${nameLabel}${trackPart} · ${statusPart}</button>`;
        }).join('');

        const addNewTabBtn = canEdit ? `
            <button id="btnAddNewApplication" class="px-3 py-2 rounded-lg text-xs font-bold bg-indigo-950/80 text-indigo-300 border border-indigo-500/40 hover:bg-indigo-900/60 transition-colors flex items-center gap-1 cursor-pointer">
                <span>➕</span> 새 지원 추가
            </button>
        ` : '';

        const list = workingRecords.length || canEdit ? `<div class="flex flex-wrap gap-2 mb-5">${listTabs}${addNewTabBtn}</div>` : '<span class="text-sm text-text-muted">기록된 지원 이력이 없습니다.</span>';

        const statusSelectHTML = isNone
            ? '<option value="미진학" selected>미진학</option>'
            : statusOptions.map(v => `<option ${record.status?.replace(/\s/g, '') === v.replace(/\s/g, '') ? 'selected' : ''}>${v}</option>`).join('');

        const lockedBannerHTML = isRecordFinalized ? `
            <div id="applicationLockBanner" class="md:col-span-2 p-3.5 rounded-xl bg-emerald-950/70 border border-emerald-500/60 text-emerald-200 text-xs flex items-center justify-between shadow-lg">
                <div class="flex items-center gap-2">
                    <span class="text-lg">🔒</span>
                    <div>
                        <strong class="font-bold text-emerald-300">[희망학교 비활성화 잠금]</strong>
                        <span>합격 및 최종 학과(배정고) 입력이 완료되어 희망학교 수정이 비활성화되었습니다.</span>
                    </div>
                </div>
                ${canEdit ? `<button type="button" id="unlockApplicationBtn" class="px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/50 transition-all flex items-center gap-1 shadow-sm cursor-pointer">🔓 잠금 해제하여 수정</button>` : ''}
            </div>
        ` : '';

        modal.innerHTML = `
          <div class="glass-card p-7 w-full max-w-3xl max-h-[90vh] overflow-y-auto"><div class="flex justify-between items-start gap-4 mb-5"><div><h2 class="text-2xl font-bold text-white">📝 ${escapeHtml(name)} 지원·합격 현황</h2><p class="text-sm text-text-muted mt-1">이 자료는 학급 암호화 DB와 취합자료 파일에만 저장됩니다. 중앙 서버로 전송되지 않습니다.</p></div><button id="closeApplicationModal" class="text-3xl text-text-muted cursor-pointer">×</button></div>
          ${list}
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-xl border border-slate-700 p-5 bg-slate-900/40">
            ${lockedBannerHTML}
            <label class="text-sm font-bold">입학년도<input id="appYear" type="text" inputmode="numeric" value="${record.admissionYear || ''}" class="input-field mt-1 w-full" ${canEdit && !isLocked ? '' : 'disabled'}></label>
            <label class="text-sm font-bold">전형 구분<select id="appCategory" class="input-field mt-1 w-full" ${canEdit && !isLocked ? '' : 'disabled'}>${categoryOptions.map(([v, t]) => `<option value="${v}" ${record.category === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
            <label class="text-sm font-bold">지원 학교<select id="appSchool" class="input-field mt-1 w-full" ${(!needsSchool && record.category !== 'other') || isNone || !canEdit || isLocked ? 'disabled' : ''}>${schoolOptions(record.category, record.schoolName)}</select></label>
            <label class="text-sm font-bold">전형 / 지원 유형<select id="appTrack" class="input-field mt-1 w-full" ${canEdit && !isOther && !isLocked ? '' : 'disabled'}>${trackOptions(record.category, record.schoolName, record.track)}</select></label>
            <label class="text-sm font-bold">지원 상태<select id="appStatus" class="input-field mt-1 w-full" ${canEdit && !isNone && !isLocked ? '' : 'disabled'}>${statusSelectHTML}</select></label>
            <label class="text-sm font-bold">점수 스냅샷 <span class="text-[11px] text-cyan-300">자동</span><input id="appScore" type="text" inputmode="decimal" value="${displayedScore || ''}" placeholder="학교·전형 선택 시 자동 산출" class="input-field mt-1 w-full" ${autoScore || isLocked ? 'readonly' : (canEdit && !isNone ? '' : 'disabled')}></label>
            <label class="text-sm font-bold md:col-span-2">점수 기준 / 메모<input id="appBasis" value="${displayedBasis}" data-auto="${isAutoBasis}" placeholder="${isNone ? '예: 진학포기 사유, 기타 진로 등' : (isOther ? '예: 실기 점수, 학과, 메모 등' : '예: 3-1 누적 예상, 1차 서류점수 등')}" class="input-field mt-1 w-full" ${canEdit && !isLocked ? '' : 'disabled'}></label>
            <div id="appPreferenceArea" class="md:col-span-2 ${needsDepartment ? '' : 'hidden'}">${departmentControls(record.schoolName, record.preferences || [], record.assignedDepartment || '')}</div>
            <div id="appGeneralAssignedArea" class="md:col-span-2 ${isGeneral ? '' : 'hidden'}">
                <label class="text-sm font-bold block">배정 고등학교 (수기 입력)
                    <span class="text-text-muted font-normal text-xs ml-1">- 후기 일반고 합격 후 배정받은 학교명을 입력하세요 (원서대장에 출력됩니다)</span>
                    <input id="appAssignedSchool" type="text" value="${record.assignedSchool || ''}" placeholder="예: 학성고등학교, 울산여자고등학교, 신정고등학교 등" class="input-field mt-1 w-full text-sm" ${canEdit && !isLocked ? '' : 'disabled'}>
                </label>
            </div>
            <p id="generalApplicationGuide" class="md:col-span-2 text-xs text-cyan-300 ${isGeneral ? '' : 'hidden'}">후기 일반고는 합격 발표 후 최종 배정받은 고등학교명을 수기로 입력할 수 있으며, 원서대장에 자동 출력됩니다.</p>
            <p id="noneApplicationGuide" class="md:col-span-2 text-xs text-amber-300 ${isNone ? '' : 'hidden'}">미진학(진학포기) 학생은 학교와 점수를 입력하지 않으며, 지원 상태가 자동으로 ‘미진학’으로 처리됩니다.</p>
          </div>
          <div class="flex justify-center gap-3 mt-5 w-full">
            ${canEdit && record.id && !isLocked ? '<button id="deleteApplication" class="flex-1 btn-secondary border-rose-500/30 text-rose-400 hover:bg-rose-500/10 px-5 py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-all cursor-pointer">🗑️ 기록 삭제</button>' : ''}
            ${canEdit ? `<button id="saveApplication" class="flex-1 btn-primary px-5 py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${isLocked ? 'opacity-50 cursor-not-allowed' : ''}" ${isLocked ? 'disabled' : ''}>💾 희망학교 저장</button>` : '<span class="text-sm text-text-muted w-full text-center">진로부장 계정은 조회 전용입니다.</span>'}
          </div></div>`;
        document.getElementById('closeApplicationModal').onclick = closeModal;
        modal.querySelectorAll('.app-record-tab').forEach(btn => btn.onclick = () => render(parseInt(btn.dataset.index)));
        modal.querySelector('#btnAddNewApplication')?.addEventListener('click', () => {
            activePreset = {
                admissionYear: new Date().getFullYear() + 1,
                category: 'meister',
                schoolName: '',
                track: '일반',
                status: '지원희망',
                score: 0,
                scoreBasis: ''
            };
            render(workingRecords.length);
        });

        // 잠금 해제 이벤트 리스너
        document.getElementById('unlockApplicationBtn')?.addEventListener('click', () => {
            isLocked = false;
            const banner = document.getElementById('applicationLockBanner');
            if (banner) {
                banner.className = 'md:col-span-2 p-3 rounded-xl bg-amber-950/60 border border-amber-500/50 text-amber-200 text-xs flex items-center justify-between shadow-sm';
                banner.innerHTML = `<div class="flex items-center gap-2"><span>⚠️</span><div><strong class="font-bold text-amber-300">[잠금 해제됨]</strong> <span>희망학교 수정이 가능합니다. 저장 시 다시 잠깁니다.</span></div></div>`;
            }
            document.getElementById('appYear').disabled = false;
            document.getElementById('appCategory').disabled = false;
            const curCat = document.getElementById('appCategory').value;
            const reqSchool = ['meister', 'special', 'self_foreign'].includes(curCat);
            document.getElementById('appSchool').disabled = (!reqSchool && curCat !== 'other') || curCat === 'none';
            document.getElementById('appTrack').disabled = curCat === 'other';
            document.getElementById('appStatus').disabled = curCat === 'none';
            if (!autoScore && curCat !== 'none') {
                document.getElementById('appScore').readOnly = false;
            }
            document.getElementById('appBasis').disabled = false;
            const assignedInput = document.getElementById('appAssignedSchool');
            if (assignedInput) assignedInput.disabled = false;
            modal.querySelectorAll('#appPreferenceArea select').forEach(el => { el.disabled = false; });
            const saveBtn = document.getElementById('saveApplication');
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            }
            const delBtn = document.getElementById('deleteApplication');
            if (delBtn) delBtn.disabled = false;
        });

        const refreshDepartmentControls = () => {
            const schoolName = document.getElementById('appSchool').value;
            const preferences = [...modal.querySelectorAll('.app-pref')].map(el => el.value);
            const assigned = document.getElementById('appAssigned')?.value || '';
            const area = document.getElementById('appPreferenceArea');
            area.innerHTML = departmentControls(schoolName, preferences, assigned);
            if (!canEdit || isLocked) area.querySelectorAll('select').forEach(el => { el.disabled = true; });
            area.querySelectorAll('.app-pref').forEach(select => {
                select.addEventListener('change', () => refreshDepartmentControls());
            });
        };

        modal.querySelectorAll('.app-pref').forEach(select => {
            select.addEventListener('change', () => refreshDepartmentControls());
        });
        let scoreRequestID = 0;
        const refreshTrackAndScore = async () => {
            const category = document.getElementById('appCategory').value;
            const schoolName = document.getElementById('appSchool').value;
            const track = document.getElementById('appTrack');
            const previousTrack = track.value;
            track.innerHTML = trackOptions(category, schoolName, previousTrack);
            if (category === 'other') {
                track.disabled = true;
            }
            const auto = calculatedScore(category, schoolName, track.value);
            const scoreInput = document.getElementById('appScore');
            const basisInput = document.getElementById('appBasis');
            const supportsAutoScore = ['meister', 'special', 'general'].includes(category);
            if (auto) {
                scoreInput.value = auto.score.toFixed(2);
                scoreInput.readOnly = true;
                if (!basisInput.value || basisInput.dataset.auto === 'true') {
                    basisInput.value = auto.basis;
                    basisInput.dataset.auto = 'true';
                }
                return;
            }
            if (!supportsAutoScore || (category !== 'general' && (!schoolName || !track.value))) {
                scoreInput.readOnly = !canEdit;
                if (supportsAutoScore) scoreInput.value = '';
                if (!supportsAutoScore && basisInput.dataset.auto === 'true') {
                    basisInput.value = '';
                    basisInput.dataset.auto = 'false';
                }
                return;
            }
            const requestID = ++scoreRequestID;
            scoreInput.value = '';
            scoreInput.placeholder = '점수 자동 산출 중…';
            scoreInput.readOnly = true;
            try {
                const snapshot = await window.go?.main?.App?.GetStudentApplicationScoreSnapshot?.(
                    classNum, studentNum, name, category, schoolName, track.value,
                );
                if (requestID !== scoreRequestID || !document.body.contains(modal)) return;
                const score = Number(snapshot?.score);
                if (!Number.isFinite(score)) throw new Error('산출 점수를 찾지 못했습니다');
                scoreInput.value = score.toFixed(2);
                scoreInput.placeholder = '학교·전형 선택 시 자동 산출';
                if (!basisInput.value || basisInput.dataset.auto === 'true') {
                    basisInput.value = snapshot.basis || '지원 시점 자동 산출';
                    basisInput.dataset.auto = 'true';
                }
            } catch (_) {
                if (requestID !== scoreRequestID || !document.body.contains(modal)) return;
                scoreInput.placeholder = '자동 산출값 없음';
            }
        };
        refreshAutoScore = refreshTrackAndScore;
        document.getElementById('appCategory').onchange = () => {
            const category = document.getElementById('appCategory').value;
            const general = category === 'general';
            const none = category === 'none';
            const other = category === 'other';
            const schoolRequired = ['meister', 'special', 'self_foreign'].includes(category);
            const departmentRequired = ['meister', 'special'].includes(category);
            const schoolSelect = document.getElementById('appSchool');
            schoolSelect.disabled = (!schoolRequired && !other) || none || !canEdit || isLocked;
            schoolSelect.innerHTML = schoolOptions(category);

            const statusSelect = document.getElementById('appStatus');
            if (none) {
                statusSelect.innerHTML = '<option value="미진학" selected>미진학</option>';
                statusSelect.disabled = true;
            } else {
                statusSelect.innerHTML = statusOptions.map(v => `<option>${v}</option>`).join('');
                statusSelect.disabled = !canEdit || isLocked;
            }

            const trackSelect = document.getElementById('appTrack');
            trackSelect.disabled = other || !canEdit || isLocked;

            document.getElementById('appPreferenceArea').classList.toggle('hidden', !departmentRequired);
            document.getElementById('appGeneralAssignedArea')?.classList.toggle('hidden', !general);
            document.getElementById('generalApplicationGuide').classList.toggle('hidden', !general);
            document.getElementById('noneApplicationGuide')?.classList.toggle('hidden', !none);
            const scoreInput = document.getElementById('appScore');
            const basisInput = document.getElementById('appBasis');
            if (none) {
                scoreInput.value = '0';
                scoreInput.disabled = true;
                if (basisInput.dataset.auto === 'true') {
                    basisInput.value = '';
                    basisInput.dataset.auto = 'false';
                }
                basisInput.placeholder = '예: 진학포기 사유, 기타 진로 등';
            } else if (other) {
                scoreInput.value = '';
                scoreInput.disabled = !canEdit || isLocked;
                if (basisInput.dataset.auto === 'true') {
                    basisInput.value = '';
                    basisInput.dataset.auto = 'false';
                }
                basisInput.placeholder = '예: 실기 점수, 학과, 메모 등';
            } else {
                scoreInput.disabled = !canEdit || isLocked;
                basisInput.placeholder = '예: 3-1 누적 예상, 1차 서류점수 등';
            }
            refreshDepartmentControls();
            refreshTrackAndScore();
        };
        document.getElementById('appSchool').onchange = () => {
            refreshDepartmentControls();
            refreshTrackAndScore();
        };
        document.getElementById('appTrack').onchange = refreshTrackAndScore;
        refreshTrackAndScore();
        document.getElementById('saveApplication')?.addEventListener('click', async () => {
            const category = document.getElementById('appCategory').value;
            const preferences = [...modal.querySelectorAll('.app-pref')].map(el => el.value.trim()).filter(Boolean);
            if (new Set(preferences).size !== preferences.length) return alert('학과 지망은 중복해서 입력할 수 없습니다.');
            const hasDepartment = category === 'meister' || category === 'special';
            const schoolVal = category === 'general' ? '' : (category === 'none' ? '미진학' : document.getElementById('appSchool').value.trim());
            const trackVal = category === 'other' ? '해당 없음' : document.getElementById('appTrack').value.trim();
            const statusVal = category === 'none' ? '미진학' : document.getElementById('appStatus').value;
            const scoreVal = category === 'none' ? 0 : (parseFloat(document.getElementById('appScore').value) || 0);
            const assignedSchoolVal = category === 'general' ? (document.getElementById('appAssignedSchool')?.value.trim() || '') : '';
            const payload = {
                classNum,
                studentNum,
                studentName: name,
                admissionYear: parseInt(document.getElementById('appYear').value),
                category,
                schoolName: schoolVal,
                track: trackVal,
                status: statusVal,
                score: scoreVal,
                scoreBasis: document.getElementById('appBasis').value.trim(),
                preferences: hasDepartment ? preferences : [],
                assignedDepartment: hasDepartment ? document.getElementById('appAssigned').value.trim() : '',
                assignedSchool: assignedSchoolVal
            };
            const sameYear = records.filter(r => r.admissionYear === payload.admissionYear && r.schoolName !== payload.schoolName);
            const active = r => ['지원예정', '지원완료', '지원 예정', '지원 완료', '합격', '최종 진학'].includes(r.status);
            const activeIn = categoryName => sameYear.some(r => r.category === categoryName && active(r));
            if ((category === 'meister' || category === 'special' || category === 'self_foreign') && !payload.schoolName) return alert('마이스터고·특성화고·자사고·외고는 목록에서 지원 학교를 선택해주세요.');
            if ((category === 'meister' || category === 'special') && ['합격', '최종 진학'].includes(payload.status) && !payload.assignedDepartment) return alert('합격 또는 최종 진학 결과는 실제 배정 학과를 선택해주세요.');

            if (active(payload)) {
                if (category === 'meister' && activeIn('meister')) return alert('마이스터고는 단 1개의 학교에만 지원 가능합니다. (동일 학교 내 특별/일반 전형 복수 지원은 허용)');
                if (category === 'special') {
                    if (payload.track.includes('취업') && sameYear.some(r => r.category === 'special' && r.track.includes('취업') && active(r))) {
                        return alert('특성화고 취업희망자 전형은 단 1개의 학교에만 지원 가능합니다.');
                    }
                    if (payload.track.includes('일반')) {
                        if (sameYear.some(r => r.category === 'special' && r.track.includes('일반') && active(r))) {
                            return alert('특성화고 일반전형은 단 1개의 학교에만 지원 가능합니다.');
                        }
                        if (sameYear.some(r => r.category === 'special' && r.track.includes('취업') && active(r))) {
                            return alert('특성화고 취업희망자 전형 결과가 불합격으로 확정된 이후에 일반전형 지원이 가능합니다.');
                        }
                    }
                }
                if ((category === 'meister' || category === 'special') && activeIn('self_foreign')) return alert('자사고·외고 지원이 진행 중이거나 합격한 학생은 마이스터고·특성화고 전형을 함께 진행할 수 없습니다.');
                if (category === 'self_foreign' && (activeIn('meister') || activeIn('special'))) return alert('마이스터고·특성화고 지원이 진행 중이거나 합격한 학생은 자사고·외고 전형을 함께 진행할 수 없습니다.');
                if (category === 'special' && activeIn('meister')) return alert('마이스터고 결과가 확정되기 전에는 특성화고 지원을 기록할 수 없습니다. 불합격 또는 포기 처리 후 진행해주세요.');
                if (category === 'general' && (activeIn('meister') || activeIn('special') || activeIn('self_foreign'))) return alert('선행 전형의 결과가 불합격 또는 포기로 확정된 뒤 후기 일반고 지원을 기록할 수 있습니다.');
            }
            try {
                await window.go.main.App.SaveStudentApplication(payload);
                await render(0);
                if (typeof window.refreshCurrentClass === 'function') window.refreshCurrentClass();
            } catch (err) { alert('희망학교 저장 실패: ' + err); }
        });
        document.getElementById('deleteApplication')?.addEventListener('click', async () => {
            const displayName = record.category === 'none' ? '미진학' : (record.schoolName || (record.category === 'general' ? '후기 일반고' : '기타'));
            const confirmed = await showModalConfirm({
                title: '지원 기록 삭제',
                message: `'${displayName}' 지원 기록을 완전히 삭제하시겠습니까?`,
                confirmText: '삭제하기',
                type: 'warning'
            });
            if (!confirmed) return;
            try {
                await window.go.main.App.DeleteStudentApplication(classNum, studentNum, name, record.category, record.schoolName, record.track);
                await render(0);
                if (typeof window.refreshCurrentClass === 'function') window.refreshCurrentClass();
            } catch (err) {
                await showModalAlert('희망학교 삭제 실패: ' + err, '오류', 'error');
            }
        });
    };
    try {
        await render();
    } catch (err) {
        modal.innerHTML = `<div class="glass-card p-7 max-w-lg"><h2 class="text-xl font-bold mb-3">지원 현황을 열 수 없습니다</h2><p class="text-text-muted wrap-break-word">${err?.message || err}</p><button id="closeApplicationModal" class="btn-secondary w-auto px-4 py-2 mt-5 cursor-pointer">닫기</button></div>`;
        document.getElementById('closeApplicationModal').onclick = closeModal;
    }
}

if (typeof window !== 'undefined') {
    window.openStudentApplicationModal = openStudentApplicationModal;
}
