// ===== 전입생 표시: 이름 옆 [전입] 뱃지 =====
// 나이스 교과 성적 비고에 "전입"이 적힌 학생을 로그인할 때(그리고 나이스 자료를 올린 뒤) 읽어 두고,
// 화면 곳곳에서 transferBadge(반, 번호, 이름)로 같은 뱃지를 붙인다.
import { escapeAttr } from './utils.js';

let transfers = new Map(); // "반|번호|이름" → 비고 내용

const key = (classNum, studentNum, name) => `${Number(classNum)}|${String(studentNum).trim()}|${String(name || '').trim()}`;

export async function loadTransferStudents() {
    try {
        const list = (await window.go.main.App.GetTransferStudents?.()) || [];
        transfers = new Map(list.map((t) => [key(t.classNum, t.studentNum, t.name), t.note || '전입']));
    } catch (_) {
        transfers = new Map();
    }
}

export function clearTransferStudents() {
    transfers = new Map();
}

export function transferNote(classNum, studentNum, name) {
    return transfers.get(key(classNum, studentNum, name)) || '';
}

/** 전입생이면 이름 옆에 붙일 뱃지 HTML, 아니면 빈 문자열 */
export function transferBadge(classNum, studentNum, name) {
    const note = transferNote(classNum, studentNum, name);
    if (!note) return '';
    return `<span class="transfer-badge" title="${escapeAttr(`전입생 · 나이스 비고: ${note}`)}">전입</span>`;
}
