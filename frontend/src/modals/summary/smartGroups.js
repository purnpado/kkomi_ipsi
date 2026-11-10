import { escapeHtml } from '../../core/utils.js';

// 지원 학생 상세 명단 팝업 모달 (지망 뱃지 또는 총 인원수 클릭 시)
export function openApplicantDetailModal(title, students) {
    document.getElementById('applicantDetailModal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'applicantDetailModal';
    modal.className = 'fixed inset-0 bg-black/85 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-150';
    
    // 학급, 번호 순 정렬
    const sorted = [...students].sort((a, b) => (a.classNum - b.classNum) || (parseInt(a.studentNum || 0) - parseInt(b.studentNum || 0)));
    
    const rowsHTML = sorted.map((s, idx) => {
        let statusBadge = '<span class="px-2 py-0.5 rounded text-xs bg-slate-800 text-slate-300">지원예정</span>';
        if (s.status === '지원완료') statusBadge = '<span class="px-2 py-0.5 rounded text-xs bg-indigo-900/60 text-indigo-200 border border-indigo-500/40">지원완료</span>';
        else if (s.status === '합격') statusBadge = '<span class="px-2 py-0.5 rounded text-xs bg-emerald-900/60 text-emerald-300 font-bold border border-emerald-500/40">합격</span>';
        else if (s.status === '불합격') statusBadge = '<span class="px-2 py-0.5 rounded text-xs bg-rose-900/60 text-rose-300 border border-rose-500/40">불합격</span>';
        else if (s.status === '최종 진학' || s.status === '최종진학') statusBadge = '<span class="px-2 py-0.5 rounded text-xs bg-sky-900/60 text-sky-200 font-black border border-sky-400/40">최종진학</span>';

        return `
            <tr class="border-b border-slate-700/60 hover:bg-slate-800/40 text-xs">
                <td class="p-2.5 text-center text-slate-400">${idx + 1}</td>
                <td class="p-2.5 text-center font-bold text-white">${escapeHtml(s.classNum)}반 ${escapeHtml(s.studentNum)}번</td>
                <td class="p-2.5 text-left font-black text-indigo-200 pl-4">${escapeHtml(s.studentName)}</td>
                <td class="p-2.5 text-center font-semibold text-sky-300">${s.prefRank ? `${s.prefRank}지망` : (s.assignedDepartment ? `배정 (${escapeHtml(s.assignedDepartment)})` : '-')}</td>
                <td class="p-2.5 text-right font-mono font-bold text-amber-300 pr-4">${s.score ? s.score.toFixed(2) : '-'}</td>
                <td class="p-2.5 text-center">${statusBadge}</td>
            </tr>
        `;
    }).join('') || '<tr><td colspan="6" class="p-6 text-center text-slate-400">해당 조건의 지원 학생이 없습니다.</td></tr>';

    modal.innerHTML = `
        <div class="glass-card max-w-2xl w-full p-6 border border-indigo-500/40 rounded-3xl shadow-2xl flex flex-col gap-4 text-left animate-in zoom-in-95 duration-150 select-none break-keep-all">
            <div class="flex items-center justify-between border-b border-slate-700/60 pb-3">
                <div class="flex items-center gap-2">
                    <span class="text-xl">👥</span>
                    <h3 class="font-bold text-white text-base">${title}</h3>
                </div>
                <button id="closeApplicantDetailBtn" class="text-slate-400 hover:text-white p-1 rounded-lg text-lg cursor-pointer transition-colors">✕</button>
            </div>
            <div class="overflow-auto max-h-[60vh] border border-slate-700/70 rounded-xl bg-slate-900/50">
                <table class="w-full text-left border-collapse">
                    <thead class="bg-slate-800 sticky top-0 text-slate-400 font-bold text-xs border-b border-slate-700">
                        <tr>
                            <th class="p-2.5 w-12 text-center">번호</th>
                            <th class="p-2.5 w-24 text-center">학급·번호</th>
                            <th class="p-2.5 w-28 text-left pl-4">학생 성명</th>
                            <th class="p-2.5 w-24 text-center">지망구분</th>
                            <th class="p-2.5 w-24 text-right pr-4">내신 점수</th>
                            <th class="p-2.5 w-24 text-center">진행 상태</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHTML}</tbody>
                </table>
            </div>
            <div class="flex justify-between items-center pt-2 border-t border-slate-700/60 text-xs">
                <span class="text-slate-400">조회된 지원자: <b class="text-indigo-300 font-bold">${sorted.length}명</b></span>
                <button id="closeApplicantDetailBottomBtn" class="btn-secondary py-1.5 px-4 text-xs font-bold rounded-xl cursor-pointer">닫기</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    const close = () => modal.remove();
    document.getElementById('closeApplicantDetailBtn').onclick = close;
    document.getElementById('closeApplicantDetailBottomBtn').onclick = close;
}

// 스마트 지원현황 그룹 생성 헬퍼 함수
export function buildSmartApplicationGroups(records) {
    if (!Array.isArray(records) || records.length === 0) return [];

    const categoryLabel = category => ({
        meister: '마이스터고', special: '특성화고', self_foreign: '자사고·외고', general: '후기 일반고', other: '기타', none: '미진학'
    }[category] || category);

    const groupsMap = new Map();

    records.forEach(r => {
        if (!r) return;
        const year = r.admissionYear;
        const cat = r.category || 'general';
        const school = r.schoolName || (cat === 'general' ? '후기 일반고' : '-');
        const track = r.track || (cat === 'general' ? '후기 일반계고' : '일반');

        // 학생의 학과 및 지망 추출
        let items = [];
        if (cat === 'general') {
            const dept = r.assignedSchool ? `[배정고] ${r.assignedSchool}` : '일반계고 공통';
            items.push({ dept, rank: 0 });
        } else {
            // 전기고 (마이스터/특성화): preferences 순회
            if (r.preferences && r.preferences.length > 0) {
                r.preferences.forEach((d, idx) => {
                    if (d && d.trim()) {
                        items.push({ dept: d.trim(), rank: idx + 1 });
                    }
                });
            }
            if (items.length === 0) {
                const dept = r.assignedDepartment || '학교 전체';
                items.push({ dept, rank: 1 });
            }
        }

        items.forEach(({ dept, rank }) => {
            const key = `${year}__${cat}__${school}__${track}__${dept}`;
            if (!groupsMap.has(key)) {
                groupsMap.set(key, {
                    key,
                    admissionYear: year,
                    category: cat,
                    categoryLabel: categoryLabel(cat),
                    schoolName: school,
                    track,
                    department: dept,
                    ranks: {}, // rank -> [student info]
                    allStudents: [],
                    plannedCount: 0,
                    submittedCount: 0,
                    acceptedCount: 0,
                    rejectedCount: 0,
                    finalCount: 0,
                    acceptedScores: [],
                    maxRejectedScore: 0
                });
            }
            const g = groupsMap.get(key);
            const studentInfo = {
                classNum: r.classNum,
                studentNum: r.studentNum,
                studentName: r.studentName,
                prefRank: rank,
                score: r.score,
                status: r.status,
                assignedDepartment: r.assignedDepartment
            };
            if (!g.ranks[rank]) g.ranks[rank] = [];
            g.ranks[rank].push(studentInfo);
            g.allStudents.push(studentInfo);

            if (r.status === '지원희망' || r.status === '지원예정') g.plannedCount++;
            else if (r.status === '지원완료') g.submittedCount++;
            else if (r.status === '합격') {
                g.acceptedCount++;
                if (r.score > 0) g.acceptedScores.push(r.score);
            } else if (r.status === '불합격') {
                g.rejectedCount++;
                if (r.score > g.maxRejectedScore) g.maxRejectedScore = r.score;
            } else if (r.status === '최종 진학' || r.status === '최종진학') {
                g.finalCount++;
                g.acceptedCount++;
                if (r.score > 0) g.acceptedScores.push(r.score);
            }
        });
    });

    // 정렬: 입학년도 역순 -> 학교구분(마이스터, 특성화, 자사고, 일반고) -> 학교명 -> 전형(특별 먼저, 일반) -> 학과명
    const catOrder = { meister: 1, special: 2, self_foreign: 3, general: 4, other: 5, none: 6 };
    const trackOrder = track => (track.includes('특별') || track.includes('취업') ? 1 : 2);

    const list = Array.from(groupsMap.values()).sort((a, b) => {
        if (b.admissionYear !== a.admissionYear) return b.admissionYear - a.admissionYear;
        const ca = catOrder[a.category] || 9, cb = catOrder[b.category] || 9;
        if (ca !== cb) return ca - cb;
        if (a.schoolName !== b.schoolName) return a.schoolName.localeCompare(b.schoolName);
        const ta = trackOrder(a.track), tb = trackOrder(b.track);
        if (ta !== tb) return ta - tb;
        return a.department.localeCompare(b.department);
    });

    return list;
}
