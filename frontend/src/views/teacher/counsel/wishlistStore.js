// ===== 상담 화면 관심학교(장바구니) 저장소 =====
// 학생별 관심학교 목록은 암호화되는 학급 DB(student_wishlists)에 둔다(App GetStudentWishlist·SaveStudentWishlist).
// 예전 버전은 화면 쪽 localStorage 에 "반·번호" 키로 평문 저장했으므로, 그 학생의 DB 목록이 비어 있으면
// 한 번만 DB로 옮기고 localStorage 값은 지운다(진로부장은 조회 전용이라 옮기지 않는다).
import { state } from '../../../core/store.js';

const cache = new Map(); // "반|번호|이름" → 목록

const keyOf = (classNum, studentNum, name) => `${Number(classNum)}|${String(studentNum)}|${String(name || '')}`;

function legacyKeys(classNum, studentNum) {
    return [...new Set([
        `phgc_wishlist_${classNum}_${studentNum}`,
        `phgc_wishlist_${classNum}_${parseInt(studentNum, 10)}`,
        `phgc_wishlist_${classNum}_${String(studentNum).padStart(2, '0')}`
    ])];
}

function readLegacy(classNum, studentNum) {
    for (const key of legacyKeys(classNum, studentNum)) {
        try {
            const parsed = JSON.parse(localStorage.getItem(key) || 'null');
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        } catch (_) {}
    }
    return [];
}

function removeLegacy(classNum, studentNum) {
    legacyKeys(classNum, studentNum).forEach((key) => {
        try { localStorage.removeItem(key); } catch (_) {}
    });
}

function parseList(raw) {
    try {
        const parsed = JSON.parse(raw || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
        return [];
    }
}

/** 상담 화면을 열 때 DB에서 읽는다(필요하면 예전 localStorage 값을 옮긴다). */
export async function loadWishlist(classNum, studentNum, name) {
    let list = [];
    try {
        list = parseList(await window.go.main.App.GetStudentWishlist(classNum, String(studentNum), name));
    } catch (err) {
        console.warn('관심학교 목록을 읽지 못했습니다:', err);
    }
    if (list.length === 0 && state.currentUser?.Role !== 'viewer') {
        const legacy = readLegacy(classNum, studentNum);
        if (legacy.length > 0) {
            try {
                await window.go.main.App.SaveStudentWishlist(classNum, String(studentNum), name, JSON.stringify(legacy));
                removeLegacy(classNum, studentNum);
                list = legacy;
            } catch (err) {
                console.warn('예전 관심학교 목록을 옮기지 못했습니다:', err);
            }
        }
    }
    cache.set(keyOf(classNum, studentNum, name), list);
    return list;
}

/** 지금 화면이 들고 있는 목록(동기). */
export function getWishlist(classNum, studentNum, name) {
    return cache.get(keyOf(classNum, studentNum, name)) || [];
}

/** 목록을 바꾸고 DB에 저장한다. 실패하면 이전 목록으로 되돌리고 오류를 던진다. */
export async function saveWishlist(classNum, studentNum, name, list) {
    const key = keyOf(classNum, studentNum, name);
    const previous = cache.get(key) || [];
    cache.set(key, list);
    try {
        await window.go.main.App.SaveStudentWishlist(classNum, String(studentNum), name, JSON.stringify(list));
    } catch (err) {
        cache.set(key, previous);
        throw err;
    }
}
