// ===== 검색어 맞추기: 모든 검색 칸이 함께 쓰는 규칙 =====
// - 글자가 들어 있으면 찾는다(띄어쓰기·영문 대소문자 무시).
// - 자음만 쳐도 찾는다(초성 검색): "ㄱ" → 강민수·김강호, "ㄱㅁ" → 강민수.
// - 한글을 치는 중(조합 중)인 마지막 글자도 맞춘다: "기"(김을 치는 중) → 김민수, "김"(기민을 치는 중) → 기민지.
// - 목록은 첫 글자부터 맞는 것을 먼저, 그중에서도 글자가 그대로 맞는 것을 먼저 보여 준다(sortByStart).
//   예: "강" → 강남·강동(그대로 맞음) 다음에 가온(가온을 치는 중에도 "강"이 보이므로 함께 보임).

const CHO = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const JONG = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

/** 한글 음절을 초성·중성·종성 번호로 나눈다(음절이 아니면 null). */
function splitSyllable(ch) {
    const code = ch ? ch.charCodeAt(0) - 0xac00 : -1;
    if (code < 0 || code > 11171) return null;
    return { cho: Math.floor(code / 588), jung: Math.floor((code % 588) / 28), jong: code % 28 };
}

const normalize = (value) => String(value ?? '').replace(/\s+/g, '').toLowerCase();

// 맞으면 'exact'(글자 그대로) 또는 'partial'(초성·치는 중), 안 맞으면 ''.
function charMatches(q, t, isLast, nextT) {
    if (q === t) return 'exact';
    if (CHO.includes(q)) {
        const s = splitSyllable(t);
        return s && CHO[s.cho] === q ? 'partial' : '';
    }
    if (!isLast) return '';
    const qs = splitSyllable(q);
    const ts = splitSyllable(t);
    if (!qs || !ts || qs.cho !== ts.cho || qs.jung !== ts.jung) return '';
    if (qs.jong === 0) return 'partial'; // 받침을 치기 전
    // 친 받침이 다음 글자의 첫소리가 되는 중("김" → "기민")
    if (ts.jong !== 0) return '';
    const ns = splitSyllable(nextT);
    return ns && CHO[ns.cho] === JONG[qs.jong] ? 'partial' : '';
}

// 가장 좋은 맞춤 등급: 0 첫 글자부터 그대로, 1 첫 글자부터(초성·치는 중), 2 가운데 그대로, 3 가운데(초성·치는 중), -1 없음.
function matchRank(text, query) {
    const t = [...normalize(text)];
    const q = [...normalize(query)];
    if (!q.length) return 0;
    let best = -1;
    for (let i = 0; i + q.length <= t.length; i++) {
        let exact = true;
        let ok = true;
        for (let j = 0; j < q.length && ok; j++) {
            const r = charMatches(q[j], t[i + j], j === q.length - 1, t[i + j + 1]);
            ok = Boolean(r);
            if (r === 'partial') exact = false;
        }
        if (!ok) continue;
        const rank = (i === 0 ? 0 : 2) + (exact ? 0 : 1);
        if (best < 0 || rank < best) best = rank;
        if (best === 0) break;
    }
    return best;
}

/** 검색어가 처음 맞는 위치(못 찾으면 -1, 검색어가 비면 0). */
export function matchIndex(text, query) {
    const t = [...normalize(text)];
    const q = [...normalize(query)];
    if (!q.length) return 0;
    for (let i = 0; i + q.length <= t.length; i++) {
        let ok = true;
        for (let j = 0; j < q.length && ok; j++) {
            ok = Boolean(charMatches(q[j], t[i + j], j === q.length - 1, t[i + j + 1]));
        }
        if (ok) return i;
    }
    return -1;
}

/** 검색어가 들어 있는가(초성·조합 중 글자 포함). */
export function matchesSearch(text, query) {
    return matchIndex(text, query) >= 0;
}

/** 첫 글자부터 맞는 것을 앞으로, 같은 자리면 글자 그대로 맞는 것을 앞으로(나머지 순서는 그대로). */
export function sortByStart(items, query, getText) {
    if (!normalize(query)) return [...items];
    return items
        .map((item, order) => {
            const rank = matchRank(getText(item), query);
            return { item, order, rank: rank < 0 ? 9 : rank };
        })
        .sort((a, b) => a.rank - b.rank || a.order - b.order)
        .map((x) => x.item);
}
