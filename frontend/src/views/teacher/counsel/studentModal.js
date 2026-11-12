import { escapeHtml, escapeAttr } from '../../../core/utils.js';
import { buildSchoolResultCards } from './schoolCards.js';
import { renderStudentModalLayout } from './modalLayout.js';
import { bindBaselineControls } from './baselineControls.js';
import { bindExtraSaveAndPrint } from './extraEditor.js';
import { fillGeneralCityCutoff } from './generalCityCutoff.js';
import { bindCounselRecords } from './counselLog.js';
import { bindWishlistControls } from './wishlist.js';
import { notifyClassUpdated, notifyStudentSelected } from '../../../core/navigation.js';
import { openWhatIfModal } from './whatIfModal.js';

export async function openStudentModal(classNum, studentNum, name) {
    // 기존 모달 제거
    document.getElementById('studentDetailModal')?.remove();
    notifyStudentSelected({ classNum, studentNum, name });

    // 로딩 모달 표시
    const modalEl = document.createElement('div');
    modalEl.id = 'studentDetailModal';
    modalEl.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto';
    modalEl.innerHTML = `
        <div class="glass-card p-8 w-full max-w-4xl text-center">
            <span class="spinner"></span> <span class="text-white ml-2">${escapeHtml(name)} 학생의 고교별 산출 데이터를 분석하는 중...</span>
        </div>
    `;
    document.body.appendChild(modalEl);

    try {
        const [fullData, cutoffs, official, directApps] = await Promise.all([
            window.go.main.App.GetStudentFullDetail(classNum, studentNum, name),
            window.go.main.App.GetCutoffs().catch(() => []),
            window.go.main.App.GetOfficialAdmissionData().catch(() => ({ items: [] })),
            window.go.main.App.GetStudentApplications ? window.go.main.App.GetStudentApplications(classNum, String(studentNum), name).catch(() => []) : Promise.resolve([]),
        ]);

        if (fullData) {
            if ((!fullData.applications || fullData.applications.length === 0) && Array.isArray(directApps) && directApps.length > 0) {
                fullData.applications = directApps;
            }
        }

        renderStudentModalContent(modalEl, classNum, studentNum, name, fullData, cutoffs, official?.items || []);
    } catch (err) {
        modalEl.innerHTML = `
            <div class="glass-card p-8 w-full max-w-md text-center">
                <div class="text-danger text-4xl mb-3">⚠️</div>
                <div class="text-white font-bold mb-4">데이터를 불러오지 못했습니다</div>
                <div class="text-text-muted text-sm mb-6">${escapeHtml(String(err))}</div>
                <button type="button" class="btn-secondary w-full" id="closeStudentDetailErrBtn">닫기</button>
            </div>
        `;
        modalEl.querySelector('#closeStudentDetailErrBtn')?.addEventListener('click', () => modalEl.remove());
    }
}

// 모달 내용 렌더링
export function renderStudentModalContent(modalEl, classNum, studentNum, name, data, cutoffs, officialItems = []) {
    // 화면 구성 요소들이 공유하는 상태 (파트 함수 간 전달)
    const ctx = { modalEl, classNum, studentNum, name, data, cutoffs, officialItems };
    prepareStudentModalState(ctx);
    buildSchoolResultCards(ctx);
    defineWishlistRenderer(ctx);
    renderStudentModalLayout(ctx);
    bindStudentModalClose(ctx);
    bindBaselineControls(ctx);
    bindExtraSaveAndPrint(ctx);
    fillGeneralCityCutoff(ctx);
    bindCounselRecords(ctx);
    bindWishlistControls(ctx);
    ctx.modalEl.querySelector('#openWhatIfBtn')?.addEventListener('click', () => openWhatIfModal(ctx));
}

// 상담 모달: 학교명 비교 도우미와 목표고교(위시리스트) 초기 상태
function prepareStudentModalState(ctx) {
    ctx.todayDate = new Date().toISOString().split('T')[0];

    // 학교명 정규화 헬퍼 (마이스터, 에너지, 애니원 등 고유 명칭은 보존하고 고등학교/고 접미사만 정리)
    const cleanSchoolName = (sch) => {
        let s = String(sch || '').replace(/\s+/g, '');
        return s.replace(/고등학교$/, '').replace(/공업고등학교$/, '공고').replace(/공업고$/, '공고').replace(/고$/, '');
    };
    ctx.isSameSchool = (s1, s2) => {
        if (!s1 || !s2) return false;
        const raw1 = String(s1).trim();
        const raw2 = String(s2).trim();
        if (raw1 === raw2) return true;
        return cleanSchoolName(raw1) === cleanSchoolName(raw2);
    };
    ctx.isSameWishItem = (item, sch, trk) => {
        if (!item) return false;
        return ctx.isSameSchool(item.schoolName, sch) && String(item.trackName || '').trim() === String(trk || '').trim();
    };
    ctx.normalizeDept = (dept) => String(dept || '').replace(/\s+/g, '');

    // 학생별 관심학교(장바구니) 목록 로드 (모든 키 포맷 호환)
    const wishlistKey = `phgc_wishlist_${ctx.classNum}_${ctx.studentNum}`;
    ctx.possibleKeys = [
        wishlistKey,
        `phgc_wishlist_${ctx.classNum}_${parseInt(ctx.studentNum, 10)}`,
        `phgc_wishlist_${ctx.classNum}_${String(ctx.studentNum).padStart(2, '0')}`
    ];
    ctx.wishlist = [];
    for (const key of ctx.possibleKeys) {
        try {
            const raw = localStorage.getItem(key);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    ctx.wishlist = parsed;
                    break;
                }
            }
        } catch (_) {}
    }
}

// 상담 모달: 목표고교 목록 HTML 렌더러
function defineWishlistRenderer(ctx) {
    ctx.extra = ctx.data.extraData || {};
    // 숫자 항목(학년별 결석·봉사 등)까지 담긴 원본 JSON. extraData는 참/거짓 항목만 담는다.
    try { ctx.rawExtra = JSON.parse(ctx.data.extraJSON || '{}') || {}; } catch (_) { ctx.rawExtra = {}; }

    // 학생 관심학교(장바구니) HTML 생성 헬퍼
    ctx.renderWishlistHTML = (list) => {
        if (!list || list.length === 0) {
            return `
                <div class="p-3.5 rounded-xl bg-slate-900/60 border border-dashed border-indigo-500/30 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                    <span class="text-base">📌</span>
                    <span>아직 등록된 관심학교가 없습니다. 아래 학교 목록에서 <strong class="text-amber-300">[⭐ 관심 담기]</strong>를 누르면 여기에 추가되며, <strong class="text-indigo-300">[📝 희망학교 입력]</strong>으로 지원서에 1초 만에 자동 등록됩니다.</span>
                </div>
            `;
        }

        const itemsHTML = list.map(item => `
            <div class="p-3 rounded-xl bg-slate-800/90 border border-indigo-500/40 shadow-sm flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap hover:border-indigo-400/60 transition-all">
                <div class="space-y-1">
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="font-bold text-white text-sm flex items-center gap-1.5">
                            <span class="text-amber-300">⭐</span> ${escapeHtml(item.schoolName)}
                        </span>
                        <span class="text-[10px] px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-500/40 font-semibold">
                            ${escapeHtml(item.trackName)}전형
                        </span>
                        <span class="text-xs">${item.badgeHTML || ''}</span>
                    </div>
                    <div class="text-xs text-slate-300 flex items-center gap-2">
                        <span>내신 환산점: <strong class="text-emerald-300 font-mono">${Number(item.totalScore).toFixed(2)}</strong> <span class="text-slate-500">/ ${item.totalMax}점</span></span>
                    </div>
                </div>
                <div class="flex items-center gap-1.5 shrink-0 ml-auto sm:ml-0">
                    <button type="button" class="btn-primary text-xs px-3 py-1.5 font-bold flex items-center gap-1 shadow-sm btn-wishlist-apply cursor-pointer"
                            data-school="${escapeAttr(item.schoolName)}" data-track="${escapeAttr(item.trackName)}" data-cat="${escapeAttr(item.category || 'meister')}" data-score="${item.totalScore}" data-max="${item.totalMax}" title="해당 학교 정보로 희망원서 자동 등록창 열기">
                        <span>📝</span> 희망학교 입력
                    </button>
                    <button type="button" class="p-1.5 text-xs text-slate-400 hover:text-danger rounded hover:bg-slate-700/50 transition-colors btn-wishlist-remove cursor-pointer"
                            data-school="${escapeAttr(item.schoolName)}" data-track="${escapeAttr(item.trackName)}" title="관심학교에서 제거">
                        ✕
                    </button>
                </div>
            </div>
        `).join('');

        return `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                ${itemsHTML}
            </div>
        `;
    };
}

// 상담 모달: 닫기·ESC 처리
function bindStudentModalClose(ctx) {
    // 상담 모달 안전 닫기 및 대시보드 자동 동기화
    const closeStudentCounselModal = () => {
        window.removeEventListener('keydown', handleEscKey);
        ctx.modalEl.remove();
        notifyClassUpdated();
    };

    const handleEscKey = (e) => {
        if (e.key === 'Escape') {
            closeStudentCounselModal();
        }
    };
    window.addEventListener('keydown', handleEscKey);

    // 닫기 이벤트 (상단 헤더 + 하단 바)
    document.getElementById('closeModalBtn')?.addEventListener('click', closeStudentCounselModal);
    document.getElementById('bottomCloseModalBtn')?.addEventListener('click', closeStudentCounselModal);

    // 배경 클릭 시 닫기
    ctx.modalEl.addEventListener('click', (e) => {
        if (e.target === ctx.modalEl) closeStudentCounselModal();
    });
}
