import { escapeHtml } from '../../core/utils.js';
import { showModalAlert, showModalConfirm } from '../../core/dialogs.js';
import { notifyApplicationsChanged } from '../../core/navigation.js';

// 지원현황 입력: 원서별 입력 화면 렌더러 정의
export function defineApplicationRenderer(ctx) {
    let activePreset = ctx.preset; // 1회성 적용용

    ctx.render = async (selectedIndex = 0) => {
        const records = await ctx.withFallback(
            () => window.go?.main?.App?.GetStudentApplications?.(ctx.classNum, ctx.studentNum, ctx.name),
            [],
        );

        let workingRecords = [...records];
        let activeIdx = selectedIndex;

        // [관심학교 -> 희망원서 자동 등록 연동 프리셋 처리]
        if (activePreset) {
            const rawSch = activePreset.schoolName || '';
            const matchSchool = ctx.catalog.find(s => ctx.normalizedSchoolName(s.name) === ctx.normalizedSchoolName(rawSch));
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
                admissionYear: ctx.defaultAdmissionYear,
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
                ctx.normalizedSchoolName(r.schoolName) === ctx.normalizedSchoolName(exactSchoolName) &&
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

        const record = workingRecords[activeIdx] || { admissionYear: ctx.defaultAdmissionYear, category: 'meister', status: '지원희망', preferences: [] };
        const isGeneral = record.category === 'general';
        const isNone = record.category === 'none';
        const isOther = record.category === 'other';
        const needsSchool = ['meister', 'special', 'self_foreign'].includes(record.category);
        const needsDepartment = ['meister', 'special'].includes(record.category);
        const autoScore = ctx.calculatedScore(record.category, record.schoolName, record.track);
        const isUnscored = ctx.isUnscoredCategory(record.category);
        const displayedScore = isUnscored ? 0 : (record.id ? record.score : (autoScore?.score ?? record.score));
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

        const addNewTabBtn = ctx.canEdit ? `
            <button id="btnAddNewApplication" class="px-3 py-2 rounded-lg text-xs font-bold bg-indigo-950/80 text-indigo-300 border border-indigo-500/40 hover:bg-indigo-900/60 transition-colors flex items-center gap-1 cursor-pointer">
                <span>➕</span> 새 지원 추가
            </button>
        ` : '';

        const list = workingRecords.length || ctx.canEdit ? `<div class="flex flex-wrap gap-2 mb-5">${listTabs}${addNewTabBtn}</div>` : '<span class="text-sm text-text-muted">기록된 지원 이력이 없습니다.</span>';

        const statusSelectHTML = isNone
            ? '<option value="미진학" selected>미진학</option>'
            : ctx.statusOptions.map(v => `<option ${record.status?.replace(/\s/g, '') === v.replace(/\s/g, '') ? 'selected' : ''}>${v}</option>`).join('');

        const lockedBannerHTML = isRecordFinalized ? `
            <div id="applicationLockBanner" class="md:col-span-2 p-3.5 rounded-xl bg-emerald-950/70 border border-emerald-500/60 text-emerald-200 text-xs flex items-center justify-between shadow-lg">
                <div class="flex items-center gap-2">
                    <span class="text-lg">🔒</span>
                    <div>
                        <strong class="font-bold text-emerald-300">[희망학교 비활성화 잠금]</strong>
                        <span>합격 및 최종 학과(배정고) 입력이 완료되어 희망학교 수정이 비활성화되었습니다.</span>
                    </div>
                </div>
                ${ctx.canEdit ? `<button type="button" id="unlockApplicationBtn" class="px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/50 transition-all flex items-center gap-1 shadow-sm cursor-pointer">🔓 잠금 해제하여 수정</button>` : ''}
            </div>
        ` : '';

        ctx.modal.innerHTML = `
          <div class="glass-card p-7 w-full max-w-3xl max-h-[90vh] overflow-y-auto"><div class="flex justify-between items-start gap-4 mb-5"><div><h2 class="text-2xl font-bold text-white">📝 ${escapeHtml(ctx.name)} 지원·합격 현황</h2><p class="text-sm text-text-muted mt-1">이 자료는 학급 암호화 DB와 취합자료 파일에만 저장됩니다. 중앙 서버로 전송되지 않습니다.</p></div><button id="closeApplicationModal" class="text-3xl text-text-muted cursor-pointer">×</button></div>
          ${list}
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-xl border border-slate-700 p-5 bg-slate-900/40">
            ${lockedBannerHTML}
            <label class="text-sm font-bold">고입 학년도<input id="appYear" type="text" inputmode="numeric" value="${record.admissionYear || ''}" class="input-field mt-1 w-full" ${ctx.canEdit && !isLocked ? '' : 'disabled'}></label>
            <label class="text-sm font-bold">전형 구분<select id="appCategory" class="input-field mt-1 w-full" ${ctx.canEdit && !isLocked ? '' : 'disabled'}>${ctx.categoryOptions.map(([v, t]) => `<option value="${v}" ${record.category === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
            <label class="text-sm font-bold">지원 학교<select id="appSchool" class="input-field mt-1 w-full" ${(!needsSchool && record.category !== 'other') || isNone || !ctx.canEdit || isLocked ? 'disabled' : ''}>${ctx.schoolOptions(record.category, record.schoolName)}</select></label>
            <label class="text-sm font-bold">전형 / 지원 유형<select id="appTrack" class="input-field mt-1 w-full" ${ctx.canEdit && !isOther && !isLocked ? '' : 'disabled'}>${ctx.trackOptions(record.category, record.schoolName, record.track)}</select></label>
            <label class="text-sm font-bold">지원 상태<select id="appStatus" class="input-field mt-1 w-full" ${ctx.canEdit && !isNone && !isLocked ? '' : 'disabled'}>${statusSelectHTML}</select></label>
            <label id="appStageArea" class="text-sm font-bold ${needsDepartment && ctx.stageInfo(record.schoolName, record.track) ? '' : 'hidden'}">1차 전형 결과 <span class="text-[11px] font-normal text-slate-400">(1차 합격 후 면접 등에서 떨어지면 '1차 합격' + 지원 상태 '불합격')</span><select id="appStage" class="input-field mt-1 w-full" ${ctx.canEdit && !isLocked ? '' : 'disabled'}>${ctx.stageOptions(record.firstStageResult || '')}</select><span id="appStageNote" class="block mt-1 text-[11px] font-normal text-indigo-300"></span></label>
            <label class="text-sm font-bold">점수 스냅샷 <span class="text-[11px] text-cyan-300">자동</span><input id="appScore" type="text" inputmode="decimal" value="${displayedScore || ''}" placeholder="${isUnscored && !isNone ? '별도 전형 학교 — 점수 미기록' : '학교·전형 선택 시 자동 산출'}" class="input-field mt-1 w-full" ${isUnscored ? 'disabled' : (autoScore || isLocked ? 'readonly' : (ctx.canEdit ? '' : 'disabled'))}></label>
            <label class="text-sm font-bold md:col-span-2">점수 기준 / 메모<input id="appBasis" value="${displayedBasis}" data-auto="${isAutoBasis}" placeholder="${isNone ? '예: 진학포기 사유, 기타 진로 등' : (isUnscored ? '예: 실기·면접 전형, 지원 학과, 메모 등' : '예: 3-1 누적 예상, 1차 서류점수 등')}" class="input-field mt-1 w-full" ${ctx.canEdit && !isLocked ? '' : 'disabled'}></label>
            <div id="appPreferenceArea" class="md:col-span-2 ${needsDepartment ? '' : 'hidden'}">${ctx.departmentControls(record.schoolName, record.preferences || [], record.assignedDepartment || '', ctx.preferenceLimit(record.category, record.track))}</div>
            <div id="appGeneralAssignedArea" class="md:col-span-2 ${isGeneral ? '' : 'hidden'}">
                <label class="text-sm font-bold block">배정 고등학교 (수기 입력)
                    <span class="text-text-muted font-normal text-xs ml-1">- 후기 일반고 합격 후 배정받은 학교명을 입력하세요 (원서대장에 출력됩니다)</span>
                    <input id="appAssignedSchool" type="text" value="${record.assignedSchool || ''}" placeholder="예: 학성고등학교, 울산여자고등학교, 신정고등학교 등" class="input-field mt-1 w-full text-sm" ${ctx.canEdit && !isLocked ? '' : 'disabled'}>
                </label>
            </div>
            <p id="generalApplicationGuide" class="md:col-span-2 text-xs text-cyan-300 ${isGeneral ? '' : 'hidden'}">후기 일반고는 합격 발표 후 최종 배정받은 고등학교명을 수기로 입력할 수 있으며, 원서대장에 자동 출력됩니다.</p>
            <p id="noneApplicationGuide" class="md:col-span-2 text-xs text-amber-300 ${isNone ? '' : 'hidden'}">미진학(진학포기) 학생은 학교와 점수를 입력하지 않으며, 지원 상태가 자동으로 ‘미진학’으로 처리됩니다.</p>
          </div>
          <div class="flex justify-center gap-3 mt-5 w-full">
            ${ctx.canEdit && record.id && !isLocked ? '<button id="deleteApplication" class="flex-1 btn-secondary border-rose-500/30 text-rose-400 hover:bg-rose-500/10 px-5 py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-all cursor-pointer">🗑️ 기록 삭제</button>' : ''}
            ${ctx.canEdit ? `<button id="saveApplication" class="flex-1 btn-primary px-5 py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${isLocked ? 'opacity-50 cursor-not-allowed' : ''}" ${isLocked ? 'disabled' : ''}>💾 희망학교 저장</button>` : '<span class="text-sm text-text-muted w-full text-center">진로부장 계정은 조회 전용입니다.</span>'}
          </div></div>`;
        document.getElementById('closeApplicationModal').onclick = ctx.closeModal;
        ctx.modal.querySelectorAll('.app-record-tab').forEach(btn => btn.onclick = () => ctx.render(parseInt(btn.dataset.index)));
        ctx.modal.querySelector('#btnAddNewApplication')?.addEventListener('click', () => {
            activePreset = {
                admissionYear: ctx.defaultAdmissionYear,
                category: 'meister',
                schoolName: '',
                track: '일반',
                status: '지원희망',
                score: 0,
                scoreBasis: ''
            };
            ctx.render(workingRecords.length);
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
            document.getElementById('appStage').disabled = false;
            if (!autoScore && curCat !== 'none') {
                document.getElementById('appScore').readOnly = false;
            }
            document.getElementById('appBasis').disabled = false;
            const assignedInput = document.getElementById('appAssignedSchool');
            if (assignedInput) assignedInput.disabled = false;
            ctx.modal.querySelectorAll('#appPreferenceArea select').forEach(el => { el.disabled = false; });
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
            const preferences = [...ctx.modal.querySelectorAll('.app-pref')].map(el => el.value);
            const assigned = document.getElementById('appAssigned')?.value || '';
            const area = document.getElementById('appPreferenceArea');
            const limit = ctx.preferenceLimit(document.getElementById('appCategory').value, document.getElementById('appTrack').value);
            area.innerHTML = ctx.departmentControls(schoolName, preferences, assigned, limit);
            area.dataset.limit = String(limit);
            if (!ctx.canEdit || isLocked) area.querySelectorAll('select').forEach(el => { el.disabled = true; });
            area.querySelectorAll('.app-pref').forEach(select => {
                select.addEventListener('change', () => refreshDepartmentControls());
            });
        };

        ctx.modal.querySelectorAll('.app-pref').forEach(select => {
            select.addEventListener('change', () => refreshDepartmentControls());
        });
        let scoreRequestID = 0;
        // 요강상 1차·2차로 나누어 뽑는 학교·전형에서만 1차 결과 칸을 보인다(학교별 배수는 요강 기준).
        const refreshStageArea = () => {
            const category = document.getElementById('appCategory').value;
            const info = ['meister', 'special'].includes(category)
                ? ctx.stageInfo(document.getElementById('appSchool').value, document.getElementById('appTrack').value)
                : null;
            document.getElementById('appStageArea').classList.toggle('hidden', !info);
            if (!info) document.getElementById('appStage').value = '';
            document.getElementById('appStageNote').textContent = info
                ? `요강: 1차 모집정원의 ${info.multiplier}배수 선발${info.rounding ? `(${info.rounding})` : ''} → 2차 ${info.note}`
                : '';
        };
        const refreshTrackAndScore = async () => {
            const category = document.getElementById('appCategory').value;
            const schoolName = document.getElementById('appSchool').value;
            const track = document.getElementById('appTrack');
            const previousTrack = track.value;
            track.innerHTML = ctx.trackOptions(category, schoolName, previousTrack);
            refreshStageArea();
            const prefArea = document.getElementById('appPreferenceArea');
            if (prefArea && prefArea.dataset.limit !== String(ctx.preferenceLimit(category, track.value))) refreshDepartmentControls();
            if (category === 'other') {
                track.disabled = true;
            }
            const auto = ctx.calculatedScore(category, schoolName, track.value);
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
                scoreInput.readOnly = !ctx.canEdit;
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
                    ctx.classNum, ctx.studentNum, ctx.name, category, schoolName, track.value,
                );
                if (requestID !== scoreRequestID || !document.body.contains(ctx.modal)) return;
                const score = Number(snapshot?.score);
                if (!Number.isFinite(score)) throw new Error('산출 점수를 찾지 못했습니다');
                scoreInput.value = score.toFixed(2);
                scoreInput.placeholder = '학교·전형 선택 시 자동 산출';
                if (!basisInput.value || basisInput.dataset.auto === 'true') {
                    basisInput.value = snapshot.basis || '지원 시점 자동 산출';
                    basisInput.dataset.auto = 'true';
                }
            } catch (_) {
                if (requestID !== scoreRequestID || !document.body.contains(ctx.modal)) return;
                scoreInput.placeholder = '자동 산출값 없음';
            }
        };
        ctx.refreshAutoScore = refreshTrackAndScore;
        document.getElementById('appCategory').onchange = () => {
            const category = document.getElementById('appCategory').value;
            const general = category === 'general';
            const none = category === 'none';
            const other = category === 'other';
            const schoolRequired = ['meister', 'special', 'self_foreign'].includes(category);
            const departmentRequired = ['meister', 'special'].includes(category);
            const schoolSelect = document.getElementById('appSchool');
            schoolSelect.disabled = (!schoolRequired && !other) || none || !ctx.canEdit || isLocked;
            schoolSelect.innerHTML = ctx.schoolOptions(category);

            const statusSelect = document.getElementById('appStatus');
            if (none) {
                statusSelect.innerHTML = '<option value="미진학" selected>미진학</option>';
                statusSelect.disabled = true;
            } else {
                statusSelect.innerHTML = ctx.statusOptions.map(v => `<option>${v}</option>`).join('');
                statusSelect.disabled = !ctx.canEdit || isLocked;
            }

            const trackSelect = document.getElementById('appTrack');
            trackSelect.disabled = other || !ctx.canEdit || isLocked;

            document.getElementById('appPreferenceArea').classList.toggle('hidden', !departmentRequired);
            refreshStageArea();
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
            } else if (ctx.isUnscoredCategory(category)) {
                // 자사고·외고·과학고·예술고 등은 실기·면접 등 별도 전형이라 점수를 기록하지 않는다.
                scoreInput.value = '';
                scoreInput.disabled = true;
                scoreInput.placeholder = '별도 전형 학교 — 점수 미기록';
                if (basisInput.dataset.auto === 'true') {
                    basisInput.value = '';
                    basisInput.dataset.auto = 'false';
                }
                basisInput.placeholder = '예: 실기·면접 전형, 지원 학과, 메모 등';
            } else {
                scoreInput.disabled = !ctx.canEdit || isLocked;
                scoreInput.placeholder = '학교·전형 선택 시 자동 산출';
                basisInput.placeholder = '예: 3-1 누적 예상, 1차 서류점수 등';
            }
            refreshDepartmentControls();
            refreshTrackAndScore();
        };
        document.getElementById('appSchool').onchange = () => {
            refreshDepartmentControls();
            refreshTrackAndScore();
        };
        // 최종 합격이면 1차도 합격, 1차 불합격이면 최종도 불합격으로 맞춘다.
        document.getElementById('appStatus').addEventListener('change', () => {
            const stage = document.getElementById('appStage');
            if (document.getElementById('appStatus').value === '합격' && !stage.closest('.hidden')) stage.value = '합격';
        });
        document.getElementById('appStage').addEventListener('change', () => {
            if (document.getElementById('appStage').value === '불합격') document.getElementById('appStatus').value = '불합격';
        });
        document.getElementById('appTrack').onchange = () => {
            refreshDepartmentControls();
            refreshTrackAndScore();
        };
        refreshTrackAndScore();
        document.getElementById('saveApplication')?.addEventListener('click', async () => {
            const category = document.getElementById('appCategory').value;
            const preferences = [...ctx.modal.querySelectorAll('.app-pref')].map(el => el.value.trim()).filter(Boolean);
            if (new Set(preferences).size !== preferences.length) return alert('학과 지망은 중복해서 입력할 수 없습니다.');
            const hasDepartment = category === 'meister' || category === 'special';
            const schoolVal = category === 'general' ? '' : (category === 'none' ? '미진학' : document.getElementById('appSchool').value.trim());
            const trackVal = category === 'other' ? '해당 없음' : document.getElementById('appTrack').value.trim();
            const statusVal = category === 'none' ? '미진학' : document.getElementById('appStatus').value;
            const scoreVal = ctx.isUnscoredCategory(category) ? 0 : (parseFloat(document.getElementById('appScore').value) || 0);
            const assignedSchoolVal = category === 'general' ? (document.getElementById('appAssignedSchool')?.value.trim() || '') : '';
            const payload = {
                classNum: ctx.classNum,
                studentNum: ctx.studentNum,
                studentName: ctx.name,
                admissionYear: parseInt(document.getElementById('appYear').value),
                category,
                schoolName: schoolVal,
                track: trackVal,
                status: statusVal,
                score: scoreVal,
                scoreBasis: document.getElementById('appBasis').value.trim(),
                preferences: hasDepartment ? preferences : [],
                assignedDepartment: hasDepartment ? document.getElementById('appAssigned').value.trim() : '',
                assignedSchool: assignedSchoolVal,
                firstStageResult: hasDepartment && !document.getElementById('appStageArea').classList.contains('hidden') ? document.getElementById('appStage').value : ''
            };
            const sameYear = records.filter(r => r.admissionYear === payload.admissionYear && r.schoolName !== payload.schoolName);
            const active = r => ['지원예정', '지원완료', '지원 예정', '지원 완료', '합격', '최종 진학'].includes(r.status);
            const activeIn = categoryName => sameYear.some(r => r.category === categoryName && active(r));
            if ((category === 'meister' || category === 'special' || category === 'self_foreign') && !payload.schoolName) return alert('마이스터고·특성화고·자사고·외고는 목록에서 지원 학교를 선택해주세요.');
            if (payload.firstStageResult === '불합격' && payload.status !== '불합격') return alert('1차 전형 불합격 학생은 지원 상태도 불합격으로 기록해주세요.');
            if (category === 'special' && trackVal.includes('취업') && payload.preferences.length > 1) return alert('특성화고 취업희망자 특별전형은 1지망(1개 학과)만 지원할 수 있습니다.');
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
                await ctx.render(0);
                notifyApplicationsChanged();
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
                await window.go.main.App.DeleteStudentApplication(ctx.classNum, ctx.studentNum, ctx.name, record.category, record.schoolName, record.track);
                await ctx.render(0);
                notifyApplicationsChanged();
            } catch (err) {
                await showModalAlert('희망학교 삭제 실패: ' + err, '오류', 'error');
            }
        });
    };
}
