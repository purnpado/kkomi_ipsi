import { normalizeSchoolName } from '../../../core/utils.js';
import { showModalAlert } from '../../../core/dialogs.js';
import { admissionOptionLabel, currentAdmissionYear } from '../../../core/admissionYear.js';

// 울산 관내 고교 공식 공개자료 신규 추가 모달 (학교별 학과·전형 자동 연동 & 최고/평균/최저점)
export async function renderAddPublicDataModal(defaultYear, availableYears, onAddCallback) {
    document.getElementById('addPublicDataModal')?.remove();

    // 서버의 highschools.json에서 고교 목록 동적 로드 (하드코딩 제거)
    let ulsanSchools = [];
    let schoolDeptMap = {};
    try {
        const highSchoolData = await window.go.main.App.GetHighSchoolsData();
        const schools = highSchoolData?.schools || [];
        schools.forEach(s => {
            const t = (s.type || s.Type || '').toLowerCase();
            const note = (s.note || s.Note || '');
            const isMeister = t === 'meister' || t === '마이스터고' || note.includes('마이스터고');
            const isSpecial = t === 'special' || t === '특성화고' || note.includes('특성화고');
            if (!isMeister && !isSpecial) return;
            const rawName = s.name || s.Name || '';
            const shortName = normalizeSchoolName(rawName);
            const category = isMeister ? '마이스터고' : '특성화고';
            ulsanSchools.push({ name: shortName, category, unit: '점' });
            schoolDeptMap[shortName] = s.departments || s.Departments || [];
        });
        // 후기 일반고 추가
        ulsanSchools.push({ name: '울산 후기 일반계고', category: '후기 일반고', unit: '%' });
        schoolDeptMap['울산 후기 일반계고'] = [];
    } catch (e) {
        console.warn('공식자료 모달: 고교 목록 동적 로드 실패', e);
    }

    // 고입 연도 기준: 화면에서 넘겨받은 연도 목록, 없으면 오늘 기준 현재 중3 입시부터 직전 5개년
    const fallbackYear = currentAdmissionYear();
    const yearOptions = (availableYears && availableYears.length > 0)
        ? availableYears.filter(y => y <= Math.max(fallbackYear, ...availableYears))
        : Array.from({ length: 5 }, (_, idx) => fallbackYear - idx);

    const selectedYear = (yearOptions.includes(defaultYear)) ? defaultYear : yearOptions[0];

    const modal = document.createElement('div');
    modal.id = 'addPublicDataModal';
    modal.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-200';
    modal.innerHTML = `
        <div class="glass-card max-w-lg w-full p-6 border border-indigo-500/40 rounded-3xl shadow-2xl flex flex-col gap-4 text-left animate-in zoom-in-95 duration-200 break-keep-all select-none">
            <div class="flex items-center justify-between border-b border-slate-700/60 pb-3">
                <div class="flex items-center gap-2">
                    <span class="text-xl">📊</span>
                    <h3 class="font-bold text-white text-base">공식 공개 입결자료 추가</h3>
                </div>
                <button id="closeAddPublicModalBtn" class="text-slate-400 hover:text-white p-1.5 rounded-lg text-base cursor-pointer transition-colors">✕</button>
            </div>

            <div class="space-y-3.5 text-xs">
                <!-- 1. 고입 연도 (직전 5개년 자동 연동) -->
                <div>
                    <label class="text-slate-300 font-bold mb-1 flex items-center justify-between">
                        <span>📅 고입 연도</span>
                        <span class="text-[11px] text-slate-400 font-normal">결과 발표된 최근 5개년 기준</span>
                    </label>
                    <select id="modalPublicYear" class="input-field w-full py-2.5 px-3 bg-slate-900 border-slate-700 rounded-xl text-white font-bold cursor-pointer text-xs">
                        ${yearOptions.map(y => `<option value="${y}" ${y === selectedYear ? 'selected' : ''}>${admissionOptionLabel(y)}</option>`).join('')}
                    </select>
                </div>

                <!-- 2. 대상 고등학교 (학교 이름만 깔끔하게 표시) -->
                <div>
                    <label class="block text-slate-300 font-bold mb-1">🏫 울산 관내 대상 고등학교</label>
                    <select id="modalPublicSchool" class="input-field w-full py-2.5 px-3 bg-slate-900 border-slate-700 rounded-xl text-white font-bold cursor-pointer text-xs">
                        ${ulsanSchools.map(s => `<option value="${s.name}" data-category="${s.category}" data-unit="${s.unit}">[${s.category}] ${s.name}</option>`).join('')}
                    </select>
                </div>

                <!-- 3. 학과명 (최신 공식 학과 자동 연동) & 전형 (비우면 전체) -->
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-slate-300 font-bold mb-1">학과명 <span class="text-indigo-400 font-normal">(최신 개편 학과)</span></label>
                        <select id="modalPublicDeptSelect" class="input-field w-full py-2.5 px-2.5 bg-slate-900 border-slate-700 rounded-xl text-white font-semibold cursor-pointer text-xs">
                            <option value="">학교 전체 (공통)</option>
                        </select>
                        <input id="modalPublicDeptCustom" type="text" placeholder="학과 직접 입력" class="input-field w-full py-2 px-2.5 mt-1.5 bg-slate-900 border-indigo-500/50 rounded-lg text-white hidden text-xs" />
                    </div>
                    <div>
                        <label class="block text-slate-300 font-bold mb-1">전형 <span class="text-indigo-400 font-normal">(비우면 전체)</span></label>
                        <select id="modalPublicTrackSelect" class="input-field w-full py-2.5 px-2.5 bg-slate-900 border-slate-700 rounded-xl text-indigo-300 font-bold cursor-pointer text-xs">
                            <option value="">전체 (비움)</option>
                            <option value="일반" selected>일반</option>
                            <option value="특별">특별</option>
                        </select>
                    </div>
                </div>

                <!-- 4. 점수 입력 (최고점, 평균점, 최저점) & 전형별 점수 기준 동적 뱃지 -->
                <div>
                    <label class="text-slate-300 font-bold mb-1.5 flex items-center justify-between">
                        <span>🎯 입결 점수 입력</span>
                        <span id="modalScoreHintBadge" class="text-[11px] font-bold text-indigo-300 px-2 py-0.5 rounded bg-indigo-950/80 border border-indigo-500/30"></span>
                    </label>
                    <div class="grid grid-cols-3 gap-2.5">
                        <!-- 최고점 -->
                        <div class="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                            <label class="block text-sky-300 font-bold mb-1 text-[11px] text-center">최고점 (선택)</label>
                            <div class="flex items-center justify-center gap-1">
                                <input id="modalPublicMax" type="text" inputmode="decimal" placeholder="선택" class="input-field w-full py-1.5 px-1 text-right font-bold text-sky-300 bg-slate-900 border-slate-700 rounded-lg text-xs" />
                                <span class="modal-unit text-slate-400 text-[11px] shrink-0">점</span>
                            </div>
                        </div>

                        <!-- 평균점 -->
                        <div class="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                            <label class="block text-amber-300 font-bold mb-1 text-[11px] text-center">평균점 (선택)</label>
                            <div class="flex items-center justify-center gap-1">
                                <input id="modalPublicAvg" type="text" inputmode="decimal" placeholder="선택" class="input-field w-full py-1.5 px-1 text-right font-bold text-amber-300 bg-slate-900 border-slate-700 rounded-lg text-xs" />
                                <span class="modal-unit text-slate-400 text-[11px] shrink-0">점</span>
                            </div>
                        </div>

                        <!-- 최저점 (합격선/필수) -->
                        <div class="bg-slate-900/60 p-2.5 rounded-xl border border-emerald-500/40">
                            <label class="block text-emerald-400 font-black mb-1 text-[11px] text-center">최저점 (합격선) *</label>
                            <div class="flex items-center justify-center gap-1">
                                <input id="modalPublicMin" type="text" inputmode="decimal" placeholder="필수" class="input-field w-full py-1.5 px-1 text-right font-black text-emerald-400 bg-slate-900 border-emerald-500/50 rounded-lg text-xs" />
                                <span class="modal-unit text-slate-400 text-[11px] shrink-0">점</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 5. 출처 / 비고 -->
                <div>
                    <label class="block text-slate-300 font-semibold mb-1">출처 / 비고</label>
                    <input id="modalPublicNote" type="text" value="공식 합격선" placeholder="예: 고교 입시설명회 발표 자료" class="input-field w-full py-2 px-3 bg-slate-900 border-slate-700 rounded-xl text-slate-300 text-xs" />
                </div>
            </div>

            <!-- 하단 취소 및 추가하기 버튼 (시원한 5:5 그리드) -->
            <div class="grid grid-cols-2 gap-3 pt-3 border-t border-slate-700/60 mt-2">
                <button id="cancelAddPublicModalBtn" type="button" class="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 font-bold text-xs transition-colors cursor-pointer text-center">
                    취소
                </button>
                <button id="submitAddPublicModalBtn" type="button" class="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs shadow-lg shadow-indigo-950/50 hover:shadow-indigo-500/25 transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 text-center">
                    <span>➕</span> 추가하기
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    const schoolSel = document.getElementById('modalPublicSchool');
    const deptSel = document.getElementById('modalPublicDeptSelect');
    const deptCustom = document.getElementById('modalPublicDeptCustom');
    const trackSel = document.getElementById('modalPublicTrackSelect');

    // 학교와 전형에 따른 실시간 점수 만점 힌트 계산 함수
    const getSchoolTrackHint = (schoolName, trackName, category) => {
        const sch = (schoolName || '').trim();
        const trk = (trackName || '').trim();

        if (sch.includes('일반고') || category === '후기 일반고') {
            return '석차 백분율 (%) 기준';
        }

        if (sch.includes('마이스터') || sch.includes('울산마이스터')) {
            if (trk.includes('특별')) return '300점 만점 기준 (특별전형)';
            return '300점 만점 기준 (일반전형)';
        }

        if (sch.includes('에너지') || sch.includes('울산에너지')) {
            if (trk.includes('특별')) return '230점 만점 기준 (특별전형)';
            return '230점 만점 기준 (일반전형)';
        }

        if (sch.includes('현대공업') || sch.includes('현대공고')) {
            if (trk.includes('특별')) return '200점 만점 기준 (특별전형)';
            return '200점 만점 기준 (일반전형)';
        }

        // 특성화고
        if (trk.includes('취업') || trk.includes('특별')) {
            return '100점 만점 기준 (취업희망자/특별전형)';
        }
        return '100점 만점 기준 (일반전형)';
    };

    // 점수 입력창의 힌트 텍스트 및 placeholder 동적 업데이트
    const updateScoreHint = () => {
        const selectedOpt = schoolSel.options[schoolSel.selectedIndex];
        const schoolName = selectedOpt ? selectedOpt.value : '';
        const category = selectedOpt ? selectedOpt.dataset.category : '';
        const unit = (selectedOpt ? selectedOpt.dataset.unit : '') || '점';
        const trackName = trackSel ? trackSel.value : '';

        const hintText = getSchoolTrackHint(schoolName, trackName, category);
        const badge = modal.querySelector('#modalScoreHintBadge');
        if (badge) badge.textContent = hintText;

        const minInput = modal.querySelector('#modalPublicMin');
        const maxInput = modal.querySelector('#modalPublicMax');
        const avgInput = modal.querySelector('#modalPublicAvg');

        if (unit === '%') {
            if (minInput) minInput.placeholder = '예: 142.44';
            if (avgInput) avgInput.placeholder = '예: 166.44';
            if (maxInput) maxInput.placeholder = '선택';
        } else {
            if (schoolName.includes('마이스터')) {
                if (minInput) minInput.placeholder = '예: 245.22';
                if (avgInput) avgInput.placeholder = '예: 272.60';
                if (maxInput) maxInput.placeholder = '예: 300.0';
            } else if (schoolName.includes('에너지')) {
                if (minInput) minInput.placeholder = '예: 185.0';
                if (avgInput) avgInput.placeholder = '선택';
                if (maxInput) maxInput.placeholder = '선택';
            } else if (schoolName.includes('현대공업')) {
                if (minInput) minInput.placeholder = '예: 160.0';
                if (avgInput) avgInput.placeholder = '선택';
                if (maxInput) maxInput.placeholder = '선택';
            } else {
                if (minInput) minInput.placeholder = '예: 70.0';
                if (avgInput) avgInput.placeholder = '선택';
                if (maxInput) maxInput.placeholder = '선택';
            }
        }
    };

    // 학교 변경 시 최신 학과 목록 및 전형 목록, 단위 자동 연동
    const syncSchoolFields = () => {
        const selectedOpt = schoolSel.options[schoolSel.selectedIndex];
        const schoolName = selectedOpt.value;
        const category = selectedOpt.dataset.category;
        const unit = selectedOpt.dataset.unit || '점';

        // 1. 점수 단위 업데이트
        modal.querySelectorAll('.modal-unit').forEach(el => el.textContent = unit);

        // 2. 최신 학과 드롭다운 자동 갱신
        const depts = schoolDeptMap[schoolName] || [];
        let deptHTML = `<option value="">학교 전체 (공통)</option>`;
        depts.forEach(d => {
            deptHTML += `<option value="${d}">${d}</option>`;
        });
        deptHTML += `<option value="__custom__">✏️ 직접 입력...</option>`;
        deptSel.innerHTML = deptHTML;
        deptCustom.classList.add('hidden');
        deptCustom.value = '';

        // 3. 전형 드롭다운 학교 유형별 맞춤 갱신
        let trackHTML = `<option value="">전체 (비움)</option>`;
        if (category === '마이스터고') {
            trackHTML += `<option value="일반" selected>일반</option>`;
            trackHTML += `<option value="특별">특별</option>`;
        } else if (category === '특성화고') {
            trackHTML += `<option value="일반" selected>일반</option>`;
            trackHTML += `<option value="취업희망자">취업희망자</option>`;
        } else {
            // 후기 일반고
            trackHTML += `<option value="일반" selected>일반</option>`;
        }
        trackSel.innerHTML = trackHTML;

        // 4. 점수 힌트 갱신
        updateScoreHint();
    };

    deptSel.addEventListener('change', () => {
        if (deptSel.value === '__custom__') {
            deptCustom.classList.remove('hidden');
            deptCustom.focus();
        } else {
            deptCustom.classList.add('hidden');
        }
    });

    trackSel.addEventListener('change', updateScoreHint);
    schoolSel.addEventListener('change', syncSchoolFields);
    syncSchoolFields();

    const closeModal = () => modal.remove();
    document.getElementById('closeAddPublicModalBtn').addEventListener('click', closeModal);
    document.getElementById('cancelAddPublicModalBtn').addEventListener('click', closeModal);

    document.getElementById('submitAddPublicModalBtn').addEventListener('click', async () => {
        const year = parseInt(document.getElementById('modalPublicYear').value, 10);
        const school = schoolSel.value;
        
        let dept = deptSel.value;
        if (dept === '__custom__') {
            dept = deptCustom.value.trim();
        }

        const track = trackSel.value.trim(); // 비우면 '' (전체)
        const minStr = document.getElementById('modalPublicMin').value.trim();
        const maxStr = document.getElementById('modalPublicMax').value.trim();
        const avgStr = document.getElementById('modalPublicAvg').value.trim();
        const note = document.getElementById('modalPublicNote').value.trim() || '공식 합격선';

        const minVal = parseFloat(minStr);
        if (isNaN(minVal) || minVal <= 0) {
            await showModalAlert({
                title: '입력 확인',
                message: '최저점(합격선/필수)을 올바른 숫자로 입력해 주세요.',
                type: 'warning'
            });
            document.getElementById('modalPublicMin').focus();
            return;
        }

        const maxVal = parseFloat(maxStr);
        const avgVal = parseFloat(avgStr);
        const unit = school.includes('일반계고') ? '%' : '점';

        onAddCallback({
            year,
            school,
            dept,
            track,
            min: minVal,
            max: !isNaN(maxVal) && maxVal > 0 ? maxVal : '',
            avg: !isNaN(avgVal) && avgVal > 0 ? avgVal : '',
            unit,
            note
        });

        closeModal();
    });
}
