// "나이스 자료 올린 날" 한 줄: 성적·출결·봉사 파일을 마지막으로 올린 날(App GetNiceUploads).
// 나이스 파일에는 마감일이 없어 프로그램이 마감일 기준 자료인지 알 수 없다. 다시 올렸는지 떠올리는 데만 쓴다.
// 상담 화면 "지원 원서 · 나이스 원서 입력값"과 나이스 원서 입력 일람표가 함께 쓴다.
import { escapeHtml } from './utils.js';

const KINDS = [['grades', '성적'], ['attendance', '출결'], ['volunteer', '봉사']];

function dayLabel(text) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(text || '');
    return m ? `${Number(m[2])}월 ${Number(m[3])}일` : '';
}

/** 종류별 문구 [{ kind, label, text }]. 반마다 날이 다르면 가장 이른 날~늦은 날. */
export function niceUploadParts(list) {
    return KINDS.map(([kind, label]) => {
        const days = (list || []).filter((u) => u.kind === kind && u.uploadedAt).map((u) => u.uploadedAt.slice(0, 10)).sort();
        if (days.length === 0) return { kind, label, text: '기록 없음' };
        const first = dayLabel(days[0]);
        const last = dayLabel(days[days.length - 1]);
        return { kind, label, text: first === last ? first : `${first}~${last}(반마다 다름)` };
    });
}

export function niceUploadLine(list) {
    const parts = niceUploadParts(list).map((p) => `${p.label} <strong class="num">${escapeHtml(p.text)}</strong>`).join(' · ');
    return `<p class="nice-upload-line">나이스 자료 올린 날 · ${parts}</p>`;
}

/** 올린 날을 읽어 줄 HTML 로. 읽지 못하면 빈 문자열(화면은 그대로 동작). */
export async function loadNiceUploadLine(classNum) {
    const App = window.go?.main?.App;
    if (!App?.GetNiceUploads) return '';
    try {
        return niceUploadLine(await App.GetNiceUploads(Number(classNum) || 0) || []);
    } catch (_) {
        return '';
    }
}
