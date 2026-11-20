import { printOnly } from '../../../print/printEngine.js';
import { getWishlist } from './wishlistStore.js';
import { renderStudentModalContent } from './studentModal.js';
import { collectVolunteerTransfer } from './volunteerTransfer.js';
import { bindLeadership, collectLeadership } from './leadershipInput.js';
import { expandSchoolsForPrint } from './schoolList.js';

// 상담 모달: 비교과 저장·상담표 인쇄
export function bindExtraSaveAndPrint(ctx) {
    // 수기 가산점 및 출결 저장 (담임 및 관리자만 가능)
    bindLeadership(ctx.modalEl);
    // [저장 후 재계산]은 전기고 가산점 칸과 후기 일반고 "입력 고치기" 칸에 하나씩 있다(같은 저장).
    ctx.modalEl.querySelectorAll('.save-extra-btn').forEach((saveBtn) => {
        saveBtn.addEventListener('click', async () => {
            saveBtn.disabled = true;
            saveBtn.textContent = '저장 중…';

            // 이미 저장된 다른 항목(징계 제외 표시 등)은 지우지 않고 합친다.
            const newExtra = {
                ...ctx.rawExtra,
                general_bonus_entered: true, // 가산점 입력 완료(체크가 없어도 '가산점 없음'으로 확정)
                changche_1: Boolean(document.getElementById('checkChangche1')?.checked),
                changche_2: Boolean(document.getElementById('checkChangche2')?.checked),
                changche_3: Boolean(document.getElementById('checkChangche3')?.checked),
                haengbal_1: Boolean(document.getElementById('checkHaengbal1')?.checked),
                haengbal_2: Boolean(document.getElementById('checkHaengbal2')?.checked),
                haengbal_3: Boolean(document.getElementById('checkHaengbal3')?.checked),
            };

            // 리더십 인정 학기(예전 숫자 입력을 손대지 않았으면 그대로 둔다)
            const leadership = collectLeadership(ctx.modalEl);
            if (leadership) Object.assign(newExtra, leadership);

            for (const g of [1, 2, 3]) {
                for (const [id, key] of [[`genAbs${g}`, `general_absence_${g}`], [`genVol${g}`, `general_volunteer_${g}`]]) {
                    const raw = document.getElementById(id)?.value.trim() ?? '';
                    const value = parseInt(raw, 10);
                    if (raw === '' || !Number.isFinite(value) || value < 0) delete newExtra[key];
                    else newExtra[key] = value;
                }
            }

            // 전입생 봉사 환산 도우미(전입생에게만 있음): 전입 구분·전입일·입력값을 함께 저장
            const transfer = collectVolunteerTransfer(ctx.modalEl);
            if (transfer) {
                if (transfer.origin) newExtra.transfer_origin = transfer.origin;
                else delete newExtra.transfer_origin;
                if (transfer.date) newExtra.transfer_date = transfer.date;
                else delete newExtra.transfer_date;
                if (Object.keys(transfer.volunteer).length) newExtra.transfer_volunteer = transfer.volunteer;
                else delete newExtra.transfer_volunteer;
            }

            try {
                await window.go.main.App.SaveStudentExtra(ctx.classNum, ctx.studentNum, ctx.name, JSON.stringify(newExtra));
                const updatedData = await window.go.main.App.GetStudentFullDetail(ctx.classNum, ctx.studentNum, ctx.name);
                renderStudentModalContent(ctx.modalEl, ctx.classNum, ctx.studentNum, ctx.name, updatedData, ctx.cutoffs);
            } catch (err) {
                alert('저장 실패: ' + err);
                saveBtn.disabled = false;
                saveBtn.textContent = '💾 저장 후 재계산';
            }
        });
    });

    // 인쇄/PDF 저장
    document.getElementById('printReportBtn')?.addEventListener('click', () => {
        expandSchoolsForPrint(ctx); // 거르기로 숨긴 줄도 보이고, 접힌 줄은 모두 펼쳐 인쇄한다
        const printArea = document.getElementById('printReportArea');
        const includeCounsel = document.getElementById('printIncludeCounselCheck')?.checked ?? false;

        if (printArea) {
            if (includeCounsel) {
                printArea.classList.add('include-private-counsel');
            } else {
                printArea.classList.remove('include-private-counsel');
            }
        }

        // [인쇄 직전 실시간 관심/희망학교 필터링 동기화]
        // 1. 등록된 관심학교(로컬스토리지 다중키) 및 희망원서(DB 데이터 + 화면 입력값) 실시간 수집
        const registeredSchoolNames = new Set();
        getWishlist(ctx.classNum, ctx.studentNum, ctx.name).forEach(w => {
            if (w.schoolName && w.schoolName.trim()) registeredSchoolNames.add(w.schoolName.trim());
        });

        (ctx.data.applications || []).forEach(a => {
            if (a && a.schoolName && a.schoolName.trim()) registeredSchoolNames.add(a.schoolName.trim());
        });

        ctx.modalEl.querySelectorAll('.app-school-select, .app-school-input, select[name*="school"], input[name*="school"]').forEach(el => {
            if (el.value && el.value.trim()) registeredSchoolNames.add(el.value.trim());
        });

        // 2. 등록된 관심/희망학교가 1개 이상이면 등록된 학교 카드만 남기고 나머지는 물리적으로 display: none 강제
        const allCards = ctx.modalEl.querySelectorAll('.school-counsel-card');
        if (registeredSchoolNames.size > 0) {
            allCards.forEach(card => {
                const cardSchool = card.dataset.school || card.querySelector('.font-bold.text-white')?.textContent || '';
                const isMatched = Array.from(registeredSchoolNames).some(target => ctx.isSameSchool(target, cardSchool));
                if (isMatched) {
                    card.classList.remove('counsel-print-unregistered-school');
                    card.classList.add('counsel-print-target-school');
                    card.style.removeProperty('display');
                } else {
                    card.classList.remove('counsel-print-target-school');
                    card.classList.add('counsel-print-unregistered-school');
                    card.style.setProperty('display', 'none', 'important'); // 브라우저 인쇄 엔진에서 100% 완전 제외
                }
            });

            // 인쇄 대화상자가 닫힌 후 화면에서는 원래대로 복원
            window.addEventListener('afterprint', () => {
                allCards.forEach(card => {
                    card.style.removeProperty('display');
                });
            }, { once: true });
        } else {
            // 등록된 관심학교가 전혀 없는 학생의 경우에만 전체 학교 카드 출력
            allCards.forEach(card => {
                card.classList.remove('counsel-print-unregistered-school');
                card.classList.add('counsel-print-target-school');
                card.style.removeProperty('display');
            });
        }

        printOnly('report');
    });
}
