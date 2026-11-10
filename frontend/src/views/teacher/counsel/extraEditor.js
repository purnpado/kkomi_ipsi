import { printOnly } from '../../../print/printEngine.js';
import { renderStudentModalContent } from './studentModal.js';

// 상담 모달: 비교과 저장·상담표 인쇄
export function bindExtraSaveAndPrint(ctx) {
    // 수기 가산점 및 출결 저장 (담임 및 관리자만 가능)
    const saveBtn = document.getElementById('saveExtraBtn');
    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            saveBtn.disabled = true;
            saveBtn.textContent = '저장 중...';

            const leadershipTerms = Math.min(4, Math.max(0, parseInt(document.getElementById('inputLeadershipTerms')?.value) || 0));
            const newExtra = {
                leadership_terms: leadershipTerms,
                changche_1: Boolean(document.getElementById('checkChangche1')?.checked),
                changche_2: Boolean(document.getElementById('checkChangche2')?.checked),
                changche_3: Boolean(document.getElementById('checkChangche3')?.checked),
                haengbal_1: Boolean(document.getElementById('checkHaengbal1')?.checked),
                haengbal_2: Boolean(document.getElementById('checkHaengbal2')?.checked),
                haengbal_3: Boolean(document.getElementById('checkHaengbal3')?.checked),
            };

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
    }

    // 인쇄/PDF 저장
    document.getElementById('printReportBtn')?.addEventListener('click', () => {
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
        for (const key of ctx.possibleKeys) {
            try {
                const raw = localStorage.getItem(key);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (Array.isArray(parsed)) {
                        parsed.forEach(w => {
                            if (w.schoolName && w.schoolName.trim()) registeredSchoolNames.add(w.schoolName.trim());
                        });
                    }
                }
            } catch (_) {}
        }

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
