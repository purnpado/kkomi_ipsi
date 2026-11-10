import { escapeHtml, escapeAttr } from '../../../core/utils.js';
import { showModalAlert, showModalConfirm } from '../../../core/dialogs.js';
import { notifyClassUpdated } from '../../../core/navigation.js';

// 상담 모달: 상담 일지 조회·저장·삭제
export function bindCounselRecords(ctx) {
    // ===== 스마트 1:1 진학 상담 일지 컨트롤러 =====
    const counselDateInput = document.getElementById('counselDateInput');
    const counselTargetSchoolInput = document.getElementById('counselTargetSchoolInput');
    const counselContentInput = document.getElementById('counselContentInput');
    const counselRecordId = document.getElementById('counselRecordId');
    const saveCounselBtn = document.getElementById('saveCounselBtn');
    const saveCounselBtnText = document.getElementById('saveCounselBtnText');
    const cancelCounselEditBtn = document.getElementById('cancelCounselEditBtn');
    const counselRecordsList = document.getElementById('counselRecordsList');
    const counselRecordCount = document.getElementById('counselRecordCount');

    let currentRecords = [];

    // 1. 상담 일지 목록 불러오기 (작성자 본인 기록만 로드)
    const loadCounselRecords = async () => {
        if (!counselRecordsList) return;
        try {
            if (!window.go?.main?.App?.GetStudentCounselingRecords) {
                counselRecordsList.innerHTML = `<div class="text-center py-4 text-slate-500 text-xs">상담 일지 기능 준비 중...</div>`;
                return;
            }
            currentRecords = await window.go.main.App.GetStudentCounselingRecords(ctx.classNum, ctx.studentNum, ctx.name) || [];
            counselRecordCount.textContent = currentRecords.length;

            if (currentRecords.length === 0) {
                counselRecordsList.innerHTML = `
                    <div class="p-6 rounded-xl bg-slate-900/40 border border-slate-800 text-center text-slate-400 space-y-1">
                        <div class="text-xl">💬</div>
                        <div class="text-xs font-semibold text-slate-300">작성된 상담 일지가 없습니다</div>
                        <div class="text-[11px] text-slate-500">학생과의 진로 희망 및 상담 내용을 위 입력창에 첫 기록으로 남겨보세요.</div>
                    </div>
                `;
                return;
            }

            counselRecordsList.innerHTML = currentRecords.map(r => `
                <div class="p-3.5 rounded-xl bg-slate-900/80 border border-slate-700/70 hover:border-indigo-500/40 transition-all space-y-2 group shadow-sm">
                    <div class="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-slate-800/80">
                        <div class="flex items-center gap-2 flex-wrap">
                            <span class="inline-flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-500/40 font-mono font-bold">
                                📅 ${escapeHtml(r.counselDate)}
                            </span>
                            ${r.targetSchool ? `
                                <span class="text-[11px] px-2 py-0.5 rounded-md bg-slate-800 text-indigo-200 border border-slate-700 font-medium">
                                    🏫 ${escapeHtml(r.targetSchool)}
                                </span>
                            ` : ''}
                            <span class="text-[10px] text-slate-400">
                                작성: <strong class="text-slate-300">${escapeHtml(r.authorName || '본인')}</strong>
                            </span>
                        </div>
                        <div class="flex items-center gap-1 opacity-90 group-hover:opacity-100 transition-opacity">
                            <button type="button" class="btn-edit-counsel text-[11px] py-0.5 px-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors cursor-pointer" data-id="${escapeAttr(r.id)}">
                                수정
                            </button>
                            <button type="button" class="btn-delete-counsel text-[11px] py-0.5 px-2 rounded bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 hover:text-rose-200 border border-rose-500/30 transition-colors cursor-pointer" data-id="${escapeAttr(r.id)}">
                                삭제
                            </button>
                        </div>
                    </div>
                    <div class="text-xs text-slate-200 whitespace-pre-wrap leading-relaxed px-0.5 font-sans">
                        ${escapeHtml(r.content)}
                    </div>
                </div>
            `).join('');

            // 수정 버튼 바인딩
            counselRecordsList.querySelectorAll('.btn-edit-counsel').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const id = parseInt(e.currentTarget.dataset.id);
                    const record = currentRecords.find(item => item.id === id);
                    if (record) {
                        counselRecordId.value = record.id;
                        counselDateInput.value = record.counselDate;
                        counselTargetSchoolInput.value = record.targetSchool || '';
                        counselContentInput.value = record.content;
                        saveCounselBtnText.textContent = '수정 내용 저장';
                        cancelCounselEditBtn.classList.remove('hidden');
                        counselContentInput.focus();
                    }
                });
            });

            // 삭제 버튼 바인딩
            counselRecordsList.querySelectorAll('.btn-delete-counsel').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = parseInt(e.currentTarget.dataset.id);
                    const confirmed = await showModalConfirm({
                        title: '상담 일지 삭제',
                        message: '이 상담 일지를 삭제하시겠습니까?<br><span class="text-xs text-rose-400">※ 삭제 후에는 복구할 수 없습니다.</span>',
                        confirmText: '삭제',
                        type: 'warning'
                    });
                    if (!confirmed) return;
                    try {
                        await window.go.main.App.DeleteStudentCounselingRecord(ctx.classNum, id);
                        await loadCounselRecords();
                        notifyClassUpdated();
                    } catch (err) {
                        await showModalAlert('삭제 실패: ' + err, '오류', 'error');
                    }
                });
            });

        } catch (err) {
            counselRecordsList.innerHTML = `<div class="p-3 text-danger text-xs text-center">상담 일지 로드 실패: ${err}</div>`;
        }
    };

    // 2. 스마트 빠른 태그 클릭 시 내용에 자동 추가
    document.getElementById('counselQuickTags')?.querySelectorAll('.quick-tag-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tag = btn.dataset.tag;
            if (!counselContentInput) return;
            const curVal = counselContentInput.value;
            if (!curVal.includes(tag.trim())) {
                counselContentInput.value = curVal ? (curVal + ' ' + tag) : tag;
            }
            counselContentInput.focus();
        });
    });

    // 3. 수정 취소 버튼
    cancelCounselEditBtn?.addEventListener('click', () => {
        counselRecordId.value = '0';
        counselTargetSchoolInput.value = '';
        counselContentInput.value = '';
        counselDateInput.value = ctx.todayDate;
        saveCounselBtnText.textContent = '상담 일지 저장';
        cancelCounselEditBtn.classList.add('hidden');
    });

    // 4. 저장 함수
    const handleSaveCounsel = async () => {
        const dateVal = counselDateInput.value;
        const contentVal = counselContentInput.value.trim();
        const targetSchoolVal = counselTargetSchoolInput.value.trim();
        const idVal = parseInt(counselRecordId.value) || 0;

        if (!dateVal) {
            await showModalAlert('상담 날짜를 입력해 주세요.', '입력 필요', 'warning');
            counselDateInput.focus();
            return;
        }
        if (!contentVal) {
            await showModalAlert('상담 상세 내용을 입력해 주세요.', '입력 필요', 'warning');
            counselContentInput.focus();
            return;
        }

        saveCounselBtn.disabled = true;
        saveCounselBtn.innerHTML = '<span class="spinner" style="width:12px;height:12px;border-width:1.5px;"></span> 저장 중...';

        try {
            const record = {
                id: idVal,
                classNum: ctx.classNum,
                studentNum: ctx.studentNum,
                studentName: ctx.name,
                counselDate: dateVal,
                targetSchool: targetSchoolVal,
                content: contentVal,
            };
            await window.go.main.App.SaveStudentCounselingRecord(record);

            // 입력 폼 리셋
            counselRecordId.value = '0';
            counselTargetSchoolInput.value = '';
            counselContentInput.value = '';
            counselDateInput.value = ctx.todayDate;
            saveCounselBtnText.textContent = '상담 일지 저장';
            cancelCounselEditBtn.classList.add('hidden');

            await loadCounselRecords();
            notifyClassUpdated();
        } catch (err) {
            await showModalAlert('상담 일지 저장 실패: ' + err, '오류', 'error');
        } finally {
            saveCounselBtn.disabled = false;
            saveCounselBtn.innerHTML = `<span>💾</span> <span id="saveCounselBtnText">${counselRecordId.value !== '0' ? '수정 내용 저장' : '상담 일지 저장'}</span>`;
        }
    };

    saveCounselBtn?.addEventListener('click', handleSaveCounsel);

    // 단축키: Ctrl + Enter로 즉시 저장
    counselContentInput?.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            handleSaveCounsel();
        }
    });

    // 초기 목록 자동 로드
    loadCounselRecords();
}
