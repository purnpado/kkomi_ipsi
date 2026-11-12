// ===== 나이스 자료·학년도 관리 화면 구성 =====
// 학년부장 전용. 기능별로 ① 나이스 자료 올리기 ② 학급별 저장 현황 ③ 학년도 관리 ④ 인수인계 ⑤ 초기화로 나눈다.
// 매트릭스·지원현황·원서대장·커트라인·계정·취합 병합은 왼쪽 메뉴에 있으므로 여기서는 두지 않는다.
// 버튼 id 는 yearControls.js·handoverControls.js·admissionYearNotice.js·neisUpload.js 가 그대로 쓴다.
import { escapeHtml } from '../../../core/utils.js';
import { admissionLongLabel } from '../../../core/admissionYear.js';
import { NEIS_STEPS } from './neisUpload.js';

function stepCard(step, count) {
    const done = count > 0;
    return `
        <button id="${step.buttonId}" type="button"
            class="neis-step text-left rounded-2xl border ${done ? 'border-emerald-500/40 bg-emerald-950/30' : 'border-slate-700/60 bg-slate-900/40'} hover:border-indigo-500/60 p-4 flex flex-col gap-2 cursor-pointer transition-colors min-w-0">
            <span class="flex items-center justify-between gap-2 w-full">
                <span class="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm font-black shrink-0">${step.no}</span>
                <span class="text-[11px] px-2 py-0.5 rounded-full border font-bold whitespace-nowrap ${done ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-slate-700/40 text-slate-300 border-slate-600'}">${done ? `${count}명 올림` : step.required ? '필수' : '아직 없음'}</span>
            </span>
            <span class="text-base font-bold text-white">${escapeHtml(step.label)}</span>
            <span class="text-xs text-slate-400 leading-snug">${escapeHtml(step.desc)}</span>
            <span class="neis-step-state text-xs font-bold text-indigo-300">파일 고르기 →</span>
        </button>`;
}

function classGrid(classCount, status) {
    let cards = '';
    for (let i = 1; i <= classCount; i++) {
        const n = status[i] || 0;
        cards += `
            <div class="rounded-xl border ${n > 0 ? 'border-emerald-500/30 bg-emerald-950/20' : 'border-slate-700/60 bg-slate-900/40'} px-3 py-2.5 flex items-center justify-between gap-2">
                <span class="font-bold text-white">${i}반</span>
                <span class="text-xs whitespace-nowrap ${n > 0 ? 'text-emerald-300 font-semibold' : 'text-slate-400'}">${n > 0 ? `${n}명` : '자료 없음'}</span>
            </div>`;
    }
    return `<div class="grid grid-cols-3 sm:grid-cols-4 xl:grid-cols-6 gap-2" id="classGrid">${cards}</div>`;
}

function actionCard({ id, title, desc, tone = 'indigo' }) {
    const tones = {
        indigo: 'border-slate-700/60 hover:border-indigo-500/60',
        amber: 'border-amber-500/30 hover:border-amber-400/70',
        rose: 'border-rose-500/40 hover:border-rose-400/80'
    };
    return `
        <button id="${id}" type="button" class="text-left rounded-xl border ${tones[tone]} bg-slate-900/40 px-4 py-3 cursor-pointer transition-colors">
            <span class="block text-sm font-bold ${tone === 'rose' ? 'text-rose-300' : 'text-white'}">${escapeHtml(title)}</span>
            <span class="block text-xs text-slate-400 mt-0.5 leading-snug">${escapeHtml(desc)}</span>
        </button>`;
}

function section(title, body, note = '', extra = '') {
    return `
        <section class="rounded-2xl bg-slate-800/40 border border-slate-700/60 p-5">
            <div class="flex flex-wrap items-baseline justify-between gap-2 mb-1">
                <h2 class="text-base font-bold text-white">${escapeHtml(title)}</h2>${extra}
            </div>
            ${note ? `<p class="text-xs text-slate-400 mb-3">${note}</p>` : '<div class="mb-3"></div>'}
            ${body}
        </section>`;
}

export function manageHTML({ schoolName, classCount, configuredYear, status, updateStatus }) {
    const counts = {
        grades: updateStatus.totalStudents || 0,
        attendance: updateStatus.attendanceCount || 0,
        volunteer: updateStatus.volunteerCount || 0
    };
    return `
        <div id="manageScreen" class="w-full max-w-[1500px] mx-auto fade-in flex flex-col gap-4">
            <div class="flex flex-wrap items-end justify-between gap-2">
                <div>
                    <h1 class="text-2xl font-black text-white">나이스 자료·학년도 관리</h1>
                    <p class="text-sm text-slate-400 mt-1">${escapeHtml(schoolName)} · ${classCount}학급 · ${escapeHtml(admissionLongLabel(configuredYear))}</p>
                </div>
            </div>

            ${section('① 나이스 자료 올리기', `
                <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                    ${NEIS_STEPS.map((step) => stepCard(step, counts[step.key])).join('')}
                </div>
                <div id="uploadStatus" class="mt-3 text-sm text-center hidden"></div>`,
                '순서대로 1 → 2 → 3단계 파일을 고르세요. 파일 고르는 창에서 <strong>모든 반 파일을 한 번에(Ctrl 또는 Shift)</strong> 고르면 전 학급이 함께 올라갑니다.')}

            <div class="rounded-2xl border border-amber-500/40 bg-amber-950/30 px-4 py-3 text-xs text-amber-200 leading-relaxed">
                <strong class="text-amber-100">상담 전 꼭 확인하세요.</strong>
                표본 학생 1~2명의 성적을 지원 희망 고교의 공식 산출 프로그램(또는 산출표)에 넣어, 이 프로그램의 계산값과 같은지 대조한 뒤 상담에 쓰세요. 전형 요강·가산점은 해마다 조금씩 바뀔 수 있습니다.
            </div>

            ${section('② 학급별 저장 현황', classGrid(classCount, status), '',
                '<button id="refreshBtn" type="button" class="btn-secondary text-xs px-3 py-1.5 font-bold" style="width:auto">새로고침</button>')}

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                ${section('③ 학년도 관리', `
                    <div class="grid grid-cols-1 gap-2">
                        ${actionCard({ id: 'changeAdmissionYearBtn', title: '고입 연도 변경', desc: '학생 자료는 그대로 두고 학교 설정의 고입 연도만 바꿉니다.' })}
                        ${actionCard({ id: 'changeClassCountBtn', title: '학급 수 변경', desc: '늘어난 반은 담임 계정을 새로 만들고, 줄어든 반의 담임 계정은 정리합니다.' })}
                        ${actionCard({ id: 'resetYearBtn', title: '새 학년 시작', desc: '커트라인은 보존하고 학생 성적·출결·봉사 자료를 비운 뒤 새 고입 연도로 시작합니다.', tone: 'amber' })}
                    </div>`)}
                ${section('④ 인수인계', `
                    <div class="grid grid-cols-1 gap-2">
                        ${actionCard({ id: 'handoverExportBtn', title: '인수인계 파일 만들기', desc: '다음 학년도 학년부장에게 넘길 입시 자료(학생 개인정보 없음, 지난 해들 누적).' })}
                        ${actionCard({ id: 'handoverImportBtn', title: '지난 학년도 입시 자료 가져오기', desc: '작년 인수인계 파일(또는 이전 버전 최종 보관본)에서 입시 자료만 가져옵니다.' })}
                    </div>`, '관내 공유 파일은 왼쪽 메뉴 [관내 공유 결과]에서 주고받습니다.')}
            </div>

            ${section('⑤ 초기화', `
                <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
                    ${actionCard({ id: 'resetDataBtn', title: '전체 초기화', desc: '모든 학생 자료와 설정을 지웁니다. 되돌릴 수 없으니 신중히 쓰세요.', tone: 'rose' })}
                </div>`)}
        </div>`;
}
