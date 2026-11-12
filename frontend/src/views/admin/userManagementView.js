import { escapeHtml } from '../../core/utils.js';
import { showModalAlert, showModalConfirm } from '../../core/dialogs.js';
import { app } from '../../core/dom.js';
import { navigate } from '../../core/navigation.js';

// ===== 사용자 및 권한 관리 화면 =====
export async function renderUserManagementScreen(schoolName) {
    app.className = 'wide-layout';

    let classCount = 8;
    try {
        const config = await window.go.main.App.GetSchoolConfig();
        classCount = config.classCount;
    } catch (e) {
        console.error(e);
    }

    let classOptions = '';
    for (let i = 1; i <= classCount; i++) {
        classOptions += `<option value="${i}">${i}반</option>`;
    }

    app.innerHTML = `
        <div class="glass-card p-6 md:p-8 w-full max-w-[1700px] mx-auto min-h-[85vh]">
            <div class="flex items-center justify-between mb-8 pb-4 border-b border-slate-700/50">
                <div>
                    <h1 class="text-2xl font-bold text-white flex items-center gap-3">
                        계정·권한
                    </h1>
                    <p class="text-text-muted text-sm mt-1">${schoolName} — 교사 계정 추가·삭제, 비밀번호 설정, 담임 배포자료·비밀번호 재설정 파일 만들기</p>
                </div>
                <div class="flex items-center gap-4">
                    <button id="backToAdminBtn" class="btn-secondary whitespace-nowrap text-xs px-4 py-2.5">
                        ← 대시보드로 돌아가기
                    </button>
                </div>
            </div>

            <div class="space-y-6">
                <!-- 새 사용자 계정 추가 폼 -->
                <div class="p-6 rounded-xl bg-slate-800/50 border border-slate-700/50">
                    <h3 class="font-bold mb-4 flex items-center gap-2 text-white text-base">
                        <span>➕</span> 새 교사/관리자 계정 등록
                    </h3>
                    <form id="addUserForm" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 items-end">
                        <div>
                            <label class="block text-xs text-text-muted mb-1">사용자 ID</label>
                            <input type="text" id="newUserId" class="input-field py-2 text-xs" placeholder="예: teacher1" required />
                        </div>
                        <div>
                            <label class="block text-xs text-text-muted mb-1">초기 비밀번호</label>
                            <input type="password" id="newUserPw" class="input-field py-2 text-xs" placeholder="초기 비밀번호" required />
                        </div>
                        <div>
                            <label class="block text-xs text-text-muted mb-1">역할 (권한)</label>
                            <select id="newUserRole" class="input-field py-2 text-xs">
                                <option value="viewer">진학/학년부장 (전체 조회)</option>
                                <option value="homeroom">담임교사 (학급 담당)</option>
                                <option value="master">관리자 (전체 관리)</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs text-text-muted mb-1">담당 학급 (담임용)</label>
                            <select id="newUserClass" class="input-field py-2 text-xs" disabled>
                                <option value="0">해당 없음</option>
                                ${classOptions}
                            </select>
                        </div>
                        <div class="pb-0.5">
                            <button type="submit" id="addUserBtn" class="btn-primary py-2 px-4 rounded-lg font-bold shadow whitespace-nowrap w-full text-xs flex items-center justify-center gap-1.5">
                                <span>➕</span> 계정 생성
                            </button>
                        </div>
                    </form>
                    <div id="addUserError" class="mt-2 text-xs text-danger hidden font-bold"></div>
                </div>

                <!-- 담임 계정 일괄 비밀번호 설정 -->
                <div class="p-6 rounded-xl bg-slate-800/50 border border-slate-700/50">
                    <h3 class="font-bold mb-3 flex items-center gap-2 text-white text-base">
                        <span>🔑</span> 담임 계정 일괄 비밀번호 발급
                    </h3>
                    <form id="bulkPasswordForm" class="flex gap-4 items-end max-w-xl">
                        <div class="flex-1">
                            <label class="block text-xs text-text-muted mb-1">모든 담임(1반~N반) 공통 초기 비밀번호</label>
                            <input type="password" id="bulkPw" class="input-field py-2 text-xs" placeholder="공통 비밀번호 입력" required />
                        </div>
                        <div class="flex-none pb-0.5">
                            <button type="submit" id="bulkPwBtn" class="btn-primary py-2 px-4 rounded-lg font-bold shadow whitespace-nowrap text-xs" style="width: auto;">일괄 적용</button>
                        </div>
                    </form>
                    <div id="bulkPwError" class="mt-2 text-xs text-danger hidden font-bold"></div>
                </div>

                <!-- 계정 목록 -->
                <div>
                    <h3 class="font-bold mb-3 flex items-center gap-2 text-white text-base"><span>📋</span> 등록된 교사/관리자 계정 목록</h3>
                    <div class="bg-slate-900/50 rounded-xl border border-slate-700/50 overflow-hidden">
                        <table class="w-full text-left text-xs sm:text-sm">
                            <thead class="bg-slate-800/80 text-text-muted">
                                <tr>
                                    <th class="p-3.5 font-semibold">구분 (역할)</th>
                                    <th class="p-3.5 font-semibold">사용자 아이디</th>
                                    <th class="p-3.5 font-semibold">비번 상태</th>
                                    <th class="p-3.5 font-semibold text-center">비밀번호 재발급</th>
                                    <th class="p-3.5 font-semibold text-center">교사용 배포 자료</th>
                                    <th class="p-3.5 font-semibold text-center w-24">계정 삭제</th>
                                </tr>
                            </thead>
                            <tbody id="userListBody" class="divide-y divide-slate-700/50">
                                <tr><td colspan="6" class="p-8 text-center text-text-muted">불러오는 중...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.getElementById('backToAdminBtn').addEventListener('click', () => {
        app.className = '';
        navigate('admin', { schoolName });
    });

    const roleSelect = document.getElementById('newUserRole');
    const classSelect = document.getElementById('newUserClass');
    roleSelect.addEventListener('change', () => {
        if (roleSelect.value === 'homeroom') {
            classSelect.disabled = false;
            classSelect.value = "1";
        } else {
            classSelect.disabled = true;
            classSelect.value = "0";
        }
    });

    // 계정 추가 처리
    document.getElementById('addUserForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('newUserId').value.trim();
        const pw = document.getElementById('newUserPw').value;
        const role = roleSelect.value;
        const classNum = parseInt(classSelect.value) || 0;
        const btn = document.getElementById('addUserBtn');
        const err = document.getElementById('addUserError');

        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> 생성 중...';
        err.classList.add('hidden');

        try {
            await window.go.main.App.CreateUser(id, pw, role, classNum);
            document.getElementById('newUserId').value = '';
            document.getElementById('newUserPw').value = '';
            alert(`'${id}' 계정이 성공적으로 등록되었습니다.`);
            loadUserList();
        } catch (error) {
            err.textContent = '등록 실패: ' + error;
            err.classList.remove('hidden');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<span>➕</span> 계정 생성';
        }
    });

    // 담임 일괄 비밀번호 처리
    document.getElementById('bulkPasswordForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const pw = document.getElementById('bulkPw').value;
        const btn = document.getElementById('bulkPwBtn');
        const err = document.getElementById('bulkPwError');

        const confirmed = await showModalConfirm({
            title: '담임 비밀번호 일괄 설정',
            message: '모든 담임(1반~N반)의 비밀번호를 일괄 설정/초기화 하시겠습니까?',
            confirmText: '일괄 설정',
            type: 'warning'
        });
        if (!confirmed) return;

        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span>...';
        err.classList.add('hidden');

        try {
            const users = await window.go.main.App.GetUsers();
            const homerooms = users.filter(u => u.Role === 'homeroom');
            for (const hr of homerooms) {
                await window.go.main.App.SetUserPassword(hr.Username, pw);
            }
            document.getElementById('bulkPw').value = '';
            alert('모든 담임 계정의 비밀번호가 일괄 설정되었습니다.');
            loadUserList();
        } catch (error) {
            err.textContent = error;
            err.classList.remove('hidden');
        } finally {
            btn.disabled = false;
            btn.textContent = '일괄 적용';
        }
    });

    // 계정 목록 로드
    async function loadUserList() {
        const tbody = document.getElementById('userListBody');
        try {
            const users = await window.go.main.App.GetUsers();
            tbody.innerHTML = '';

            users.forEach(u => {
                const isInitial = u.MustChangePassword;
                let roleLabel = '학년부장 (관리자)';
                if (u.Role === 'homeroom') roleLabel = `${u.ClassNum}반 담임`;
                else if (u.Role === 'viewer') roleLabel = '진로부장 (조회전용)';

                let statusBadge = isInitial
                    ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-warning/20 text-warning border border-warning/30">초기 상태</span>`
                    : `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-success/20 text-success border border-success/30">사용 중</span>`;

                const isMasterAdmin = u.Username === 'admin';

                const tr = document.createElement('tr');
                tr.className = "hover:bg-slate-800/30 transition-colors";
                tr.innerHTML = `
                    <td class="p-3.5 font-bold text-slate-200">${escapeHtml(roleLabel)}</td>
                    <td class="p-3.5 text-text-muted font-mono">${escapeHtml(u.Username)}</td>
                    <td class="p-3.5">${statusBadge}</td>
                    <td class="p-3.5 text-center">
                        <div class="flex items-center justify-center gap-1.5">
                            <input type="password" class="input-field py-1 px-2.5 text-xs w-28 input-user-pw" placeholder="새 비번" />
                            <button type="button" class="btn-primary py-1 px-2.5 text-xs whitespace-nowrap rounded font-bold btn-update-pw" style="width: auto;">
                                ${isInitial ? '비번 설정' : '재설정'}
                            </button>
                        </div>
                    </td>
                    <td class="p-3.5 text-center">
                        ${isMasterAdmin
                        ? '<span class="text-xs text-slate-600 font-bold">해당 없음</span>'
                        : `<button type="button" class="text-xs text-indigo-200 hover:text-white font-bold px-2 py-1 rounded bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-400/30 transition-colors btn-dist-pkg">배포 자료 만들기</button>`
                    }
                    </td>
                    <td class="p-3.5 text-center">
                        ${isMasterAdmin
                        ? '<span class="text-xs text-slate-600 font-bold">보호됨</span>'
                        : `<button type="button" class="text-xs text-danger hover:underline font-bold px-2 py-1 rounded bg-danger/10 hover:bg-danger/20 border border-danger/30 transition-colors btn-delete-user">삭제</button>`
                    }
                    </td>
                `;

                // 안전한 이벤트 리스너 바인딩 (인라인 onclick 제거)
                const pwInput = tr.querySelector('.input-user-pw');
                const btnPw = tr.querySelector('.btn-update-pw');
                if (btnPw && pwInput) {
                    btnPw.addEventListener('click', () => {
                        window.updateUserPassword(u.Username, pwInput.value);
                    });
                    pwInput.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') {
                            window.updateUserPassword(u.Username, pwInput.value);
                        }
                    });
                }
                const btnDist = tr.querySelector('.btn-dist-pkg');
                if (btnDist) {
                    btnDist.addEventListener('click', () => {
                        window.createDistributionPackage(u.Username);
                    });
                }
                const btnDel = tr.querySelector('.btn-delete-user');
                if (btnDel) {
                    btnDel.addEventListener('click', () => {
                        window.deleteUserAccount(u.Username);
                    });
                }

                tbody.appendChild(tr);
            });
        } catch (error) {
            tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-danger font-bold">${escapeHtml(String(error))}</td></tr>`;
        }
    }

    window.updateUserPassword = async (username, directPw) => {
        let pw = directPw;
        let inputEl = document.getElementById(`pw_${username}`);
        if (typeof pw !== 'string' || !pw) {
            pw = inputEl ? inputEl.value : '';
        }
        if (!pw) {
            await showModalAlert('새 비밀번호를 입력하세요.', '입력 확인', 'warning');
            return;
        }

        const confirmed = await showModalConfirm({
            title: '비밀번호 설정',
            message: `'${username}' 계정의 비밀번호를 새로 설정하시겠습니까?`,
            confirmText: '설정하기',
            type: 'warning'
        });
        if (confirmed) {
            try {
                await window.go.main.App.SetUserPassword(username, pw);
                if (username !== 'admin') {
                    const resetPath = await window.go.main.App.SavePasswordResetPackage(username);
                    if (!resetPath) {
                        throw new Error('비밀번호는 설정되었지만 재설정 파일 저장이 취소되었습니다. 다시 재설정해 파일을 전달하세요.');
                    }
                    await showModalAlert(`비밀번호가 설정되고 재설정 파일이 만들어졌습니다.\n담임에게 프로그램과 함께 다음 파일을 전달하세요.\n\n${resetPath}`, '재설정 파일 생성 완료', 'success');
                } else {
                    await showModalAlert('관리자 비밀번호가 변경되었습니다. 다음 로그인부터 새 비밀번호를 사용하세요.', '비밀번호 변경 완료', 'success');
                }
                if (inputEl) inputEl.value = '';
                loadUserList();
            } catch (err) {
                await showModalAlert('설정 실패: ' + err, '오류 발생', 'error');
            }
        }
    };

    window.deleteUserAccount = async (username) => {
        const confirmed = await showModalConfirm({
            title: '계정 삭제',
            message: `정말로 '${username}' 계정을 삭제하시겠습니까?`,
            confirmText: '삭제',
            type: 'error'
        });
        if (confirmed) {
            try {
                await window.go.main.App.DeleteUser(username);
                await showModalAlert('계정이 삭제되었습니다.', '완료', 'success');
                loadUserList();
            } catch (err) {
                await showModalAlert('삭제 실패: ' + err, '오류', 'error');
            }
        }
    };

    window.createDistributionPackage = async (username) => {
        const confirmed = await showModalConfirm({
            title: '배포 자료 생성',
            message: `'${username}' 계정용 교사용 배포 자료를 만들까요?\n\n담임용 자료에는 해당 반 DB만, 진로부장용 자료에는 조회용 전체 학급 DB가 포함됩니다. 관리자 계정과 다른 담임 계정은 포함되지 않습니다.`,
            confirmText: '생성하기',
            type: 'info'
        });
        if (!confirmed) return;
        try {
            const path = await window.go.main.App.SaveDistributionPackage(username);
            if (!path) return;
            await showModalAlert(`'${username}' 계정용 배포 자료 생성이 완료되었습니다!\n\n📂 저장 위치:\n${path}\n\n💡 [안내 사항]\n• 담임 선생님께 프로그램 실행 파일과 위 배포 자료(.kkomipkg), 그리고 학년부장의 [공용 데이터 암호]를 함께 전달해 주세요.\n• 담임 선생님은 로그인 화면에서 ‘배포 자료 가져오기’를 누른 후, 공용 데이터 암호를 입력하여 안전하게 최초 로그인하실 수 있습니다.`, '배포 자료 준비 완료', 'success');
        } catch (err) {
            await showModalAlert('배포 자료 생성 실패: ' + err, '오류', 'error');
        }
    };

    loadUserList();
}
