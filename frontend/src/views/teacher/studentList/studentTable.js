import { escapeHtml, escapeAttr } from '../../../core/utils.js';
import { transferBadge } from '../../../core/transferBadges.js';
import { showModalAlert, showModalConfirm } from '../../../core/dialogs.js';
import { renderApplicationSummary } from '../simulation/prediction.js';
import { navigate, notifyClassUpdated, openModal } from '../../../core/navigation.js';
import { state } from '../../../core/store.js';

// 학급 명렬표: 검색·정렬이 반영된 표 렌더러 정의
export function defineStudentTableRenderer(ctx) {
    // 테이블 렌더링 함수
    ctx.updateDashboardTable = () => {
        let filtered = [...ctx.processedStudents];

        // 1. 신호등 매트릭스급 학생 번호/성명 검색 필터링 (프라이버시 모드)
        if (ctx.currentSearchQuery.trim()) {
            const qRaw = ctx.currentSearchQuery.trim();
            const qLower = qRaw.toLowerCase().replace(/\s+/g, '');
            const isDigitOnly = /^[0-9]+$/.test(qLower);

            filtered = filtered.filter(s => {
                const sName = (s.name || '').replace(/\s+/g, '').toLowerCase();
                const sNum = s.numInt;

                // 이름 검색 (부분 일치)
                if (sName.includes(qLower)) return true;

                // 순수 숫자 검색 (1~2자리 번호 매칭)
                if (isDigitOnly) {
                    const qVal = parseInt(qLower, 10);
                    if (qLower.length <= 2) {
                        return sNum === qVal;
                    }
                    // 3~4자리 학번 매칭 (예: 101, 3101)
                    const shortId = parseInt(`${ctx.classNum}${String(sNum).padStart(2, '0')}`, 10);
                    if (shortId === qVal) return true;
                    const fullId = parseInt(`3${ctx.classNum}${String(sNum).padStart(2, '0')}`, 10);
                    if (fullId === qVal) return true;
                }

                // 하이픈 학번 (예: 1-1, 1반 1번)
                if (qLower.includes('-')) {
                    const parts = qLower.split('-');
                    if (parts.length === 2 && parseInt(parts[0], 10) === ctx.classNum) {
                        return sNum === parseInt(parts[1], 10);
                    }
                }
                const koreanPattern = `${ctx.classNum}반${sNum}번`;
                if (koreanPattern === qLower) return true;

                return false;
            });
        }

        // 2. 정렬 로직
        filtered.sort((a, b) => {
            switch (ctx.currentSortMode) {
                case 'num_asc':
                    return a.numInt - b.numInt;
                case 'name_asc':
                    return (a.name || '').localeCompare(b.name || '', 'ko');
                case 'general_asc':
                    return a.percentile - b.percentile;
                case 'general_desc':
                    return b.percentile - a.percentile;
                case 'meister_desc':
                    return b.meisterPassCount - a.meisterPassCount;
                case 'special_desc':
                    return b.specialPassCount - a.specialPassCount;
                default:
                    return a.numInt - b.numInt;
            }
        });

        // 3. tbody HTML 생성
        let tbody = '';
        if (!filtered.length) {
            tbody = `
                <tr>
                    <td colspan="6" class="p-12 text-center text-slate-400">
                        <div class="text-3xl mb-2">🔍</div>
                        <div class="font-bold text-white mb-1">'${escapeHtml(ctx.currentSearchQuery)}' 검색 조건과 일치하는 학생이 없습니다.</div>
                        <div class="text-xs text-slate-500">학생 번호(예: 1, 15)나 이름을 다시 확인해 주세요.</div>
                    </td>
                </tr>
            `;
        } else {
            filtered.forEach(s => {
                const isPassed = (st) => ['합격', '최종 진학', '최종진학'].includes((st || '').trim());
                const isFinalizedStudent = s.applications.some(a => {
                    if (!isPassed(a.status)) return false;
                    if (['meister', 'special'].includes(a.category)) {
                        return !!(a.assignedDepartment && a.assignedDepartment.trim());
                    }
                    if (a.category === 'general') {
                        return !!(a.assignedSchool && a.assignedSchool.trim());
                    }
                    return true;
                });

                const applicationSummary = renderApplicationSummary(s.applications, ctx.classNum, s.studentNum, s.name);

                let appCellHTML = '';
                if (!s.applications.length || s.applications.every(a => !a.status || a.status === '미입력')) {
                    appCellHTML = `
                        <button class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-dashed border-indigo-500/50 bg-indigo-500/10 hover:bg-indigo-500/25 hover:border-indigo-400 text-indigo-300 hover:text-white text-xs font-semibold transition-all cursor-pointer shadow-xs btn-student-application active:scale-95"
                                data-class="${ctx.classNum}" data-num="${s.studentNum}" data-name="${escapeAttr(s.name)}" title="클릭하여 희망학교 입력">
                            <svg class="w-3.5 h-3.5 text-indigo-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
                            <span>희망학교 입력</span>
                        </button>
                    `;
                } else {
                    appCellHTML = `
                        <div class="flex items-center justify-center gap-2 flex-wrap">
                            <div class="flex-1 min-w-36">
                                ${applicationSummary}
                            </div>
                            ${isFinalizedStudent ? `
                                <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 text-[11px] font-bold shadow-xs whitespace-nowrap" title="합격 및 최종 배정 완료 (희망학교 비활성화 잠금 상태)">
                                    <svg class="w-3.5 h-3.5 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
                                    <span>확정</span>
                                </span>
                            ` : `
                                <button class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700 hover:border-indigo-400 text-slate-300 hover:text-white text-xs font-semibold transition-all cursor-pointer shadow-xs btn-student-application active:scale-95"
                                        data-class="${ctx.classNum}" data-num="${s.studentNum}" data-name="${escapeAttr(s.name)}" title="희망학교 추가 및 수정">
                                    <svg class="w-3.5 h-3.5 text-indigo-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                                    <span>추가/수정</span>
                                </button>
                            `}
                        </div>
                    `;
                }

                tbody += `
                    <tr class="hover:bg-slate-800/70 transition-colors border-b border-slate-700/50">
                        <td class="p-3.5 text-center font-mono font-bold text-slate-400">
                            <span class="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-800 border border-slate-700 text-xs text-slate-300 shadow-inner">
                                ${s.studentNum || '-'}
                            </span>
                        </td>
                        <td class="p-3.5 font-bold text-white text-center text-lg cursor-pointer hover:text-indigo-300 hover:underline text-student-name transition-colors"
                            data-class="${ctx.classNum}" data-num="${s.studentNum}" data-name="${escapeAttr(s.name)}" title="클릭하여 진학 상담 시작">
                            <div class="flex flex-col items-center justify-center">
                                <span class="inline-flex items-center whitespace-nowrap">${escapeHtml(s.name)}${transferBadge(ctx.classNum, s.studentNum, s.name)}</span>
                                ${ctx.counselSummary && ctx.counselSummary[s.studentNum] ? `
                                    <span class="inline-flex items-center gap-1 text-[10px] px-2.5 py-0.5 rounded-full bg-indigo-600 text-white font-bold mt-1 shadow-sm border border-indigo-400" title="최근 상담일: ${ctx.counselSummary[s.studentNum]} (본인 작성)">
                                        <span>💬</span> ${ctx.counselSummary[s.studentNum]}
                                    </span>
                                ` : `
                                    <span class="inline-flex items-center gap-0.5 text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 font-semibold mt-1">
                                        미상담
                                    </span>
                                `}
                            </div>
                        </td>
                        <td class="p-3.5 text-center">${s.generalBadge}</td>
                        <td class="p-3.5 text-center min-w-56">
                            <div class="flex items-center justify-center gap-2 flex-wrap">
                                <button class="btn-prediction-detail inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95 ${s.meisterPassCount > 0 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 hover:bg-amber-500/30' : 'bg-slate-800/80 text-slate-400 border border-slate-700/60 hover:bg-slate-800'}"
                                        data-class="${ctx.classNum}" data-num="${s.studentNum}" data-name="${escapeAttr(s.name)}" data-category="meister"
                                        data-percentile="${s.percentile !== 999 ? s.percentile.toFixed(2) : ''}" data-rank="${s.rank || ''}" data-total="${s.totalStudents}"
                                        title="${escapeAttr(s.name)} 학생의 마이스터고 3개교 전형별 상세 점수 및 합격 분석표 보기 (클릭)">
                                    <span class="text-sm">🏛️</span>
                                    <span>마이스터고</span>
                                    <span class="px-2 py-0.5 rounded-full text-[11px] font-black ${s.meisterPassCount > 0 ? 'bg-amber-500 text-slate-950' : 'bg-slate-700 text-slate-400'}">${s.meisterTotalCount > 0 ? `${s.meisterPassCount}/${s.meisterTotalCount}` : '미등록'}</span>
                                </button>
                                <button class="btn-prediction-detail inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95 ${s.specialPassCount > 0 ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 hover:bg-cyan-500/30' : 'bg-slate-800/80 text-slate-400 border border-slate-700/60 hover:bg-slate-800'}"
                                        data-class="${ctx.classNum}" data-num="${s.studentNum}" data-name="${escapeAttr(s.name)}" data-category="special"
                                        data-percentile="${s.percentile !== 999 ? s.percentile.toFixed(2) : ''}" data-rank="${s.rank || ''}" data-total="${s.totalStudents}"
                                        title="${escapeAttr(s.name)} 학생의 특성화고 전형·학과별 상세 점수 및 합격 분석표 보기 (클릭)">
                                    <span class="text-sm">🏭</span>
                                    <span>특성화고</span>
                                    <span class="px-2 py-0.5 rounded-full text-[11px] font-black ${s.specialPassCount > 0 ? 'bg-cyan-500 text-slate-950' : 'bg-slate-700 text-slate-400'}">${s.specialTotalCount > 0 ? `${s.specialPassCount}/${s.specialTotalCount}` : '미등록'}</span>
                                </button>
                            </div>
                        </td>
                        <td class="p-3.5 text-center min-w-56">${appCellHTML}</td>
                        <td class="p-3.5 text-center w-36">
                            <button class="btn-primary w-full text-xs px-3.5 py-2 font-bold inline-flex items-center justify-center gap-1.5 rounded-xl btn-student-counsel transition-all hover:scale-105 shadow-md shadow-indigo-500/20 cursor-pointer active:scale-95"
                                    data-class="${ctx.classNum}" data-num="${s.studentNum}" data-name="${escapeAttr(s.name)}">
                                <svg class="w-3.5 h-3.5 text-white shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg>
                                <span class="whitespace-nowrap">진학 상담</span>
                            </button>
                        </td>
                    </tr>
                `;
            });
        }

        const tbodyEl = document.getElementById('dashboardStudentTableBody');
        if (tbodyEl) {
            tbodyEl.innerHTML = tbody;
            ctx.bindTableEventListeners();
        }

        // 프라이버시 모드 배너 갱신
        const privacyBannerEl = document.getElementById('dashboardPrivacyBanner');
        if (privacyBannerEl) {
            if (ctx.currentSearchQuery.trim()) {
                privacyBannerEl.innerHTML = `
                    <div class="flex items-center justify-between gap-3 w-full animate-in fade-in">
                        <div class="flex items-center gap-2">
                            <span class="text-base">🔒</span>
                            <span class="font-bold text-emerald-300">[1:1 프라이버시 상담 모드 가동 중]:</span>
                            <span class="text-slate-200">'<strong class="text-white">${escapeHtml(ctx.currentSearchQuery.trim())}</strong>' 검색됨 (<strong>${filtered.length}명</strong> 노출) — 상담 중 다른 학생의 점수와 개인정보가 완전히 차단되어 안전합니다.</span>
                        </div>
                        <button id="resetPrivacyFilterBtn" class="text-xs px-2.5 py-1 rounded-lg bg-indigo-600/50 hover:bg-indigo-600 text-white font-bold transition-all cursor-pointer shrink-0">
                            전체 학생 보기
                        </button>
                    </div>
                `;
                privacyBannerEl.classList.remove('hidden');
                document.getElementById('resetPrivacyFilterBtn')?.addEventListener('click', () => {
                    ctx.currentSearchQuery = '';
                    const searchInput = document.getElementById('dashboardStudentSearchInput');
                    if (searchInput) searchInput.value = '';
                    ctx.updateDashboardTable();
                });
            } else {
                privacyBannerEl.classList.add('hidden');
                privacyBannerEl.innerHTML = '';
            }
        }
    };
}

// 학급 명렬표: 표 내부 버튼 이벤트 연결
export function defineStudentTableEvents(ctx) {
    // 테이블 내부 이벤트 바인딩
    ctx.bindTableEventListeners = () => {
        // 진학 상담 버튼
        document.querySelectorAll('.btn-student-counsel').forEach(el => {
            el.addEventListener('click', (e) => {
                const target = e.currentTarget;
                // 명렬표의 [진학 상담]은 상담 화면으로 연다(닫으면 이 학급 명렬표로 돌아온다).
                navigate('counsel', { schoolName: state.schoolName, classNum: parseInt(target.dataset.class), studentNum: target.dataset.num, name: target.dataset.name });
            });
        });

        // 희망학교 입력/수정 버튼
        document.querySelectorAll('.btn-student-application').forEach(el => {
            el.addEventListener('click', (e) => {
                const target = e.currentTarget;
                openModal('application', { classNum: parseInt(target.dataset.class), studentNum: target.dataset.num, name: target.dataset.name });
            });
        });

        // 학생 이름 클릭 (성적표 모달)
        document.querySelectorAll('.text-student-name').forEach(el => {
            el.addEventListener('click', (e) => {
                const target = e.currentTarget;
                openModal('transcript', { classNum: parseInt(target.dataset.class), studentNum: target.dataset.num, name: target.dataset.name });
            });
        });

        // 마이스터/특성화고 합격 예측 상세 버튼
        document.querySelectorAll('.btn-prediction-detail').forEach(el => {
            el.addEventListener('click', (e) => {
                const target = e.currentTarget;
                const cNum = parseInt(target.dataset.class, 10);
                const sNum = target.dataset.num;
                const sName = target.dataset.name;
                const cat = target.dataset.category;
                const extraData = {
                    percentile: target.dataset.percentile,
                    rank: target.dataset.rank,
                    total: target.dataset.total
                };
                openModal('prediction', { classNum: cNum, studentNum: sNum, studentName: sName, category: cat, extraData });
            });
        });

        // 희망학교 개별 [✕] 삭제 버튼 핸들러 (원클릭 삭제)
        document.querySelectorAll('.btn-delete-app-item').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const cNum = parseInt(btn.dataset.class, 10) || ctx.classNum;
                const sNum = btn.dataset.num;
                const sName = btn.dataset.name;
                const cat = btn.dataset.cat;
                const school = btn.dataset.school;
                const track = btn.dataset.track;

                const confirmed = await showModalConfirm({
                    title: '진로희망 학교 삭제',
                    message: `<strong>${escapeHtml(sName)}</strong> (${sNum}번) 학생의<br><strong class="text-indigo-300">[${escapeHtml(school || '희망학교')}]</strong> 지원 이력을 삭제하시겠습니까?`,
                    confirmText: '삭제하기',
                    type: 'warning'
                });
                if (!confirmed) return;

                try {
                    await window.go.main.App.DeleteStudentApplication(cNum, sNum, sName, cat, school, track);
                    await showModalAlert(`'${sName}' 학생의 [${school}] 지원 기록이 삭제되었습니다.`, '삭제 완료', 'success');
                    notifyClassUpdated();
                } catch (err) {
                    await showModalAlert('삭제 실패: ' + err, '오류', 'error');
                }
            });
        });
    };
}
