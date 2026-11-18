import { openModal } from '../../../core/navigation.js';
import { showModalAlert } from '../../../core/dialogs.js';
import { getWishlist, saveWishlist } from './wishlistStore.js';

// 상담 모달: 목표고교 담기·바로 지원 연결
export function bindWishlistControls(ctx) {
    // ===== ⭐ 관심학교 장바구니 및 희망학교 입력 원클릭 자동화 컨트롤러 =====
    const wishlistContainer = document.getElementById('wishlistContainer');
    const wishlistCountBadge = document.getElementById('wishlistCountBadge');

    // 관심학교 목록은 학급 DB에 저장한다(wishlistStore.js). 화면은 저장소의 사본을 고쳐 다시 저장한다.
    const getStoredWishlist = () => [...getWishlist(ctx.classNum, ctx.studentNum, ctx.name)];

    const saveStoredWishlist = (list) => {
        ctx.wishlist = list;
        saveWishlist(ctx.classNum, ctx.studentNum, ctx.name, list).catch((err) => {
            // 저장에 실패하면(조회 전용 계정 등) 화면을 저장된 목록으로 되돌린다.
            ctx.wishlist = getWishlist(ctx.classNum, ctx.studentNum, ctx.name);
            updateWishlistUI();
            showModalAlert('관심학교를 저장하지 못했습니다: ' + err, '저장 실패', 'error');
        });
    };

    const bindWishlistInnerEvents = () => {
        if (!wishlistContainer) return;

        // 1. 장바구니 내 [📝 희망학교 입력] 버튼 클릭 -> 희망학교 입력창 열고 지원학교/지원희망 자동 세팅
        wishlistContainer.querySelectorAll('.btn-wishlist-apply').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const schoolName = btn.dataset.school || '';
                const track = btn.dataset.track || '';
                const category = btn.dataset.cat || 'meister';
                const score = parseFloat(btn.dataset.score) || 0;

                openModal('application', { classNum: ctx.classNum, studentNum: ctx.studentNum, name: ctx.name, preset: {
                    schoolName,
                    track,
                    category,
                    score,
                    status: '지원희망'
                } });
            });
        });

        // 2. 장바구니 내 [✕] 삭제 버튼 클릭
        wishlistContainer.querySelectorAll('.btn-wishlist-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const schoolName = btn.dataset.school || '';
                const track = btn.dataset.track || '';

                let list = getStoredWishlist();
                list = list.filter(item => !(item.schoolName === schoolName && item.trackName === track));
                saveStoredWishlist(list);
                updateWishlistUI();
            });
        });
    };

    const updateWishlistUI = () => {
        const currentList = getStoredWishlist();
        if (wishlistContainer) {
            wishlistContainer.innerHTML = ctx.renderWishlistHTML(currentList);
            bindWishlistInnerEvents();
        }
        if (wishlistCountBadge) {
            wishlistCountBadge.textContent = currentList.length;
        }

        // 목표 고교별 카드 목록의 [⭐ 관심 담기 / 관심 등록됨] 버튼 상태 동기화
        ctx.modalEl.querySelectorAll('.btn-toggle-wishlist').forEach(btn => {
            const sch = btn.dataset.school || '';
            const trk = btn.dataset.track || '';
            const isWish = currentList.some(w => ctx.isSameWishItem(w, sch, trk));
            const textSpan = btn.querySelector('.wishlist-btn-text');
            const iconSpan = btn.querySelector('span');

            if (isWish) {
                btn.className = 'btn-toggle-wishlist px-2.5 py-1 text-xs font-bold rounded-lg border transition-all flex items-center gap-1 cursor-pointer bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm';
                if (iconSpan) iconSpan.textContent = '⭐';
                if (textSpan) textSpan.textContent = '관심 등록됨';
            } else {
                btn.className = 'btn-toggle-wishlist px-2.5 py-1 text-xs font-bold rounded-lg border transition-all flex items-center gap-1 cursor-pointer bg-slate-800 text-slate-300 border-slate-600 hover:text-white hover:border-slate-500';
                if (iconSpan) iconSpan.textContent = '☆';
                if (textSpan) textSpan.textContent = '관심 담기';
            }
        });

        // 인쇄 대상 클래스(counsel-print-target-school / counsel-print-unregistered-school) 실시간 동기화
        const hasRegistered = currentList.length > 0 || (ctx.data.applications || []).some(a => a.schoolName && a.schoolName.trim());
        ctx.modalEl.querySelectorAll('.school-counsel-card').forEach(card => {
            const sch = card.dataset.school || card.querySelector('.font-bold.text-white')?.textContent || '';
            const isMatch = currentList.some(w => ctx.isSameSchool(w.schoolName, sch)) || (ctx.data.applications || []).some(a => ctx.isSameSchool(a.schoolName, sch));
            if (hasRegistered) {
                if (isMatch) {
                    card.classList.remove('counsel-print-unregistered-school');
                    card.classList.add('counsel-print-target-school');
                } else {
                    card.classList.remove('counsel-print-target-school');
                    card.classList.add('counsel-print-unregistered-school');
                }
            } else {
                card.classList.remove('counsel-print-unregistered-school');
                card.classList.add('counsel-print-target-school');
            }
        });
    };

    // 학교 카드 목록의 [⭐ 관심 담기 / 관심 해제] 버튼 이벤트 바인딩
    ctx.modalEl.querySelectorAll('.btn-toggle-wishlist').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const schoolName = btn.dataset.school || '';
            const trackName = btn.dataset.track || '';
            const totalScore = parseFloat(btn.dataset.score) || 0;
            const totalMax = parseFloat(btn.dataset.max) || 0;
            const category = btn.dataset.cat || 'meister';
            const cardIdx = btn.dataset.card;

            // 현재 카드의 합격 가능성 신호등 뱃지 HTML 추출
            const badgeEl = document.getElementById(`badge_${cardIdx}`);
            const badgeHTML = badgeEl ? badgeEl.innerHTML : '';

            let list = getStoredWishlist();
            const existingIdx = list.findIndex(w => ctx.isSameWishItem(w, schoolName, trackName));

            if (existingIdx !== -1) {
                list.splice(existingIdx, 1);
            } else {
                list.push({
                    schoolName,
                    trackName,
                    totalScore,
                    totalMax,
                    category,
                    badgeHTML,
                    addedAt: new Date().toISOString()
                });
            }
            saveStoredWishlist(list);
            updateWishlistUI();
        });
    });

    // 학교 카드 목록의 [📝 희망입력] 직행 버튼 이벤트 바인딩
    ctx.modalEl.querySelectorAll('.btn-direct-apply').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const schoolName = btn.dataset.school || '';
            const track = btn.dataset.track || '';
            const category = btn.dataset.cat || 'meister';
            const score = parseFloat(btn.dataset.score) || 0;

            // 희망원서 자동 등록 모달 즉시 실행
            openModal('application', { classNum: ctx.classNum, studentNum: ctx.studentNum, name: ctx.name, preset: {
                schoolName,
                track,
                category,
                score,
                status: '지원희망'
            } });
        });
    });

    // 장바구니 초기 내부 이벤트 바인딩
    bindWishlistInnerEvents();
}
