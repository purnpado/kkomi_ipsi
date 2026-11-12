// ===== 프로그램 사용 설명서(가이드) 모달 및 A4 인쇄 =====
import { printOnly } from '../print/printEngine.js';
import { state } from '../core/store.js';
import { getTeacherGuideHTML } from './guide/teacherGuide.js';
import { getMasterGuideHTML } from './guide/masterGuide.js';

export { getTeacherGuideHTML, getMasterGuideHTML };

export function renderGuideModal(role = 'homeroom') {
    document.getElementById('programGuideModal')?.remove();

    const isMaster = (role === 'master' || state.currentUser?.Role === 'master');

    const modal = document.createElement('div');
    modal.id = 'programGuideModal';
    modal.className = 'fixed inset-0 bg-black/80 backdrop-blur-md z-[60000] flex items-center justify-center p-4 sm:p-6 overflow-y-auto animate-in fade-in duration-200';

    modal.innerHTML = `
        <div class="glass-card max-w-4xl w-full p-6 sm:p-8 border border-slate-700/80 rounded-3xl shadow-2xl flex flex-col max-h-[92vh] break-keep-all">
            <!-- 모달 상단 헤더 & 인쇄/닫기 버튼 (화면 전용) -->
            <div class="flex items-center justify-between pb-4 border-b border-slate-700/60 no-print flex-wrap gap-3">
                <div class="flex items-center gap-2.5">
                    <span class="text-2xl sm:text-3xl">📖</span>
                    <div>
                        <h2 class="text-xl sm:text-2xl font-black text-white">
                            『꼬미입시』 프로그램 사용 설명서
                        </h2>
                        <p class="text-xs text-text-muted mt-0.5">새 화면(대시보드·왼쪽 메뉴) 기준 단계별 업무 안내</p>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <button id="printGuideBtn" class="btn-secondary text-xs px-3.5 py-2 font-bold inline-flex items-center gap-1.5 shadow-sm hover:scale-105 transition-all">
                        <span>🖨️</span> 설명서 인쇄 (A4)
                    </button>
                    <button id="closeGuideBtn" class="text-2xl text-slate-400 hover:text-white px-2 cursor-pointer transition-colors">&times;</button>
                </div>
            </div>

            <!-- 역할별 탭 (학년부장에게는 2개 탭 모두 노출, 담임에게는 담임용만 노출) -->
            <div class="flex gap-2 pt-4 pb-3 border-b border-slate-700/50 no-print">
                ${isMaster ? `
                <button id="tabMasterGuide" class="px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-indigo-600 text-white transition-colors cursor-pointer">
                    학년부장 운영 매뉴얼
                </button>
                <button id="tabTeacherGuide" class="px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer">
                    담임·진로부장 진학지도 매뉴얼
                </button>
                ` : `
                <div class="px-4 py-1.5 rounded-xl text-xs sm:text-sm font-bold bg-indigo-600 text-white">
                    담임·진로부장 진학지도 매뉴얼
                </div>
                `}
            </div>

            <!-- 설명서 본문 스크롤 영역 -->
            <div class="my-4 overflow-y-auto max-h-[60vh] custom-scrollbar pr-2 space-y-6 text-slate-200 text-xs sm:text-sm leading-relaxed" id="guideContentArea">
                ${isMaster ? getMasterGuideHTML() : getTeacherGuideHTML()}
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const closeBtn = modal.querySelector('#closeGuideBtn');
    const printBtn = modal.querySelector('#printGuideBtn');
    const tabMaster = modal.querySelector('#tabMasterGuide');
    const tabTeacher = modal.querySelector('#tabTeacherGuide');
    const contentArea = modal.querySelector('#guideContentArea');

    closeBtn.onclick = () => modal.remove();

    printBtn.onclick = () => {
        printOnly('guide', 'portrait');
    };

    if (isMaster && tabMaster && tabTeacher) {
        tabMaster.onclick = () => {
            tabMaster.className = 'px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-indigo-600 text-white transition-colors cursor-pointer';
            tabTeacher.className = 'px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer';
            contentArea.innerHTML = getMasterGuideHTML();
        };
        tabTeacher.onclick = () => {
            tabTeacher.className = 'px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-indigo-600 text-white transition-colors cursor-pointer';
            tabMaster.className = 'px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer';
            contentArea.innerHTML = getTeacherGuideHTML();
        };
    }
}

if (typeof window !== 'undefined') {
    window.renderGuideModal = renderGuideModal;
}
