// ===== 공통 유틸리티 모듈 =====

export function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function escapeAttr(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

export function updateAppWindowTitle(role = '', detail = '') {
    let roleLabel = '';
    if (role === 'master') {
        roleLabel = detail ? `[학년부장 · ${detail}]` : '[학년부장]';
    } else if (role === 'homeroom') {
        roleLabel = detail ? `[3학년 ${detail}반 담임]` : '[담임교사]';
    } else if (role === 'viewer') {
        roleLabel = '[전체 열람 모드]';
    }

    const title = roleLabel
        ? `꼬미입시 ${roleLabel} - 울산 고입 진학상담`
        : '꼬미입시 - 울산 고입 진학상담';

    if (window.go?.main?.App?.SetWindowTitle) {
        window.go.main.App.SetWindowTitle(title).catch(() => { });
    }
}

export function normalizeSchoolName(name) {
    return String(name || '')
        .replace(/고등학교$/u, '')
        .replace(/고$/u, '')
        .replace(/\s+/gu, '')
        .trim();
}

export function normalizeDept(dept) {
    const d = String(dept || '').trim();
    if (d === '공통' || d === '전체' || d === '학교 전체' || d === '학교전체') {
        return '';
    }
    return d;
}

export function normalizeTrack(track) {
    const t = String(track || '').trim();
    if (t === '일반' || t === '일반전형' || t === '일반계고' || t === '일반계고전형') {
        return '일반';
    }
    if (t === '특별' || t === '특별전형') {
        return '특별';
    }
    if (t === '취업' || t === '취업희망자' || t === '취업희망자전형') {
        return '취업희망자';
    }
    return t.replace(/전형$/u, '');
}

export function isSameTrack(left, right) {
    const a = String(left || '').replace('전형', '').trim();
    const b = String(right || '').replace('전형', '').trim();
    return a.includes(b) || b.includes(a);
}

// 기존 인라인 템플릿과의 하위 호환성을 위해 window 객체에도 바인딩
if (typeof window !== 'undefined') {
    window.escapeHtml = escapeHtml;
    window.escapeAttr = escapeAttr;
    window.updateAppWindowTitle = updateAppWindowTitle;
    window.normalizeSchoolName = normalizeSchoolName;
    window.normalizeDept = normalizeDept;
    window.normalizeTrack = normalizeTrack;
    window.isSameTrack = isSameTrack;
}
