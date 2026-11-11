// ===== 4단계 합격 가능성 판정(안정·적정·소신·도전)의 단일 기준 =====
// 모든 화면(학급 전체 표, 상담 학교 카드, 합격 예측, 통계 분석, 성적표)은 이 함수로만 판정한다.
// 화면마다 다른 것은 "어떤 기준선을 쓰느냐"뿐이며, 기준선 출처는 판정과 함께 항상 표시한다.
//
// 여유폭(margin)은 두 방식을 모두 쓴다.
//   비율: 만점 대비 % (300점·100점 학교를 같은 잣대로 비교)
//   점수: 고정 점수(“작년 합격선보다 3점 높다”처럼 상담에서 쓰는 말)
// 학년부장은 학교 기본값과 학교·전형별 예외를 정하고(학교 설정 DB → 배포자료로 담임 PC에 전달),
// 담임은 상담 화면에서 보기 방식만 잠시 바꿀 수 있다(학교 설정은 바뀌지 않음).
import { state, patchState } from './store.js';

export const DEFAULT_JUDGMENT_SETTINGS = Object.freeze({
    mode: 'ratio',        // 'ratio' | 'points'
    ratio: 2,             // 만점 대비 %
    points: 3,            // 점
    overrides: {},        // { '울산마이스터고|일반': { mode: 'points', value: 5 } }
    generalSafePct: 80,   // 후기 일반고 석차백분율 안정선(%)
    generalBorderPct: 90  // 후기 일반고 석차백분율 경계선(%)
});

export const JUDGMENT_LEVELS = Object.freeze({
    safe: { label: '안정', emoji: '🟢', tone: 'emerald' },
    proper: { label: '적정', emoji: '🟡', tone: 'indigo' },
    hope: { label: '소신', emoji: '🟠', tone: 'amber' },
    challenge: { label: '도전', emoji: '🔴', tone: 'rose' },
    unknown: { label: '기준 없음', emoji: '⚪', tone: 'slate' }
});

const TONE_CLASS = {
    emerald: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    indigo: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
    amber: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    rose: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    slate: 'bg-slate-700/40 text-slate-300 border-slate-600'
};

function mergeSettings(raw) {
    const base = { ...DEFAULT_JUDGMENT_SETTINGS, overrides: {} };
    if (!raw || typeof raw !== 'object') return base;
    const num = (v, fallback) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : fallback);
    return {
        mode: raw.mode === 'points' ? 'points' : 'ratio',
        ratio: num(raw.ratio, base.ratio),
        points: num(raw.points, base.points),
        overrides: raw.overrides && typeof raw.overrides === 'object' ? raw.overrides : {},
        generalSafePct: num(raw.generalSafePct, base.generalSafePct),
        generalBorderPct: Math.max(num(raw.generalSafePct, base.generalSafePct), num(raw.generalBorderPct, base.generalBorderPct))
    };
}

/** 저장된 학교 판정 설정. 불러오기 전에는 기본값. */
export function getJudgmentSettings() {
    return state.judgmentSettings || mergeSettings(null);
}

/** 학교·전형 만점(백엔드 산출 규칙 목록). 목록이 없으면 0. */
export function totalMaxFor(schoolName, track) {
    const key = judgmentKey(schoolName, track);
    const rule = (state.allSchoolRules || []).find(r => judgmentKey(r.schoolName, r.trackName) === key);
    if (rule) return Number(rule.totalMax) || 0;
    return String(track || '').includes('일반계') || String(schoolName || '').includes('일반고') ? 200 : 0;
}

/** 로그인 직후 학교 설정 DB에서 판정 기준을 읽는다. 실패하면 기본값을 쓴다. */
export async function loadJudgmentSettings() {
    try {
        const rules = await window.go?.main?.App?.GetSchoolRuleList?.();
        if (Array.isArray(rules)) patchState({ allSchoolRules: rules });
    } catch (_) {}
    let parsed = null;
    try {
        const raw = await window.go?.main?.App?.GetJudgmentSettings?.();
        parsed = raw ? JSON.parse(raw) : null;
    } catch (_) {
        parsed = null;
    }
    patchState({ judgmentSettings: mergeSettings(parsed) });
    return getJudgmentSettings();
}

/** 학년부장 저장. 저장 후 이 PC의 판정도 바로 바뀐다. */
export async function saveJudgmentSettings(next) {
    const merged = mergeSettings(next);
    await window.go.main.App.SaveJudgmentSettings(JSON.stringify(merged));
    patchState({ judgmentSettings: merged });
    return merged;
}

/** 상담 화면 보기 방식: null(학교 설정) | 'ratio' | 'points' */
export function getJudgmentViewMode() {
    return state.judgmentViewMode || null;
}

export function setJudgmentViewMode(mode) {
    patchState({ judgmentViewMode: mode === 'ratio' || mode === 'points' ? mode : null });
}

export function judgmentKey(schoolName, track) {
    const school = String(schoolName || '').replace(/\s/g, '').replace(/등학교$/, '');
    const t = String(track || '').replace(/\s/g, '');
    const normTrack = t.includes('취업') ? '취업희망자' : (t.includes('특별') ? '특별' : (t.includes('일반') ? '일반' : t));
    return `${school}|${normTrack}`;
}

/** 학교·전형의 여유폭(점수 환산값 포함). */
export function marginFor(schoolName, track, totalMax) {
    const settings = getJudgmentSettings();
    const override = settings.overrides?.[judgmentKey(schoolName, track)];
    let mode = settings.mode;
    let value = mode === 'ratio' ? settings.ratio : settings.points;
    if (override && (override.mode === 'ratio' || override.mode === 'points') && Number.isFinite(Number(override.value))) {
        mode = override.mode;
        value = Number(override.value);
    }
    // 담임이 상담 화면에서 보기 방식을 바꾸면 그 방식의 학교 기본값으로 판정한다.
    const viewMode = getJudgmentViewMode();
    if (viewMode && viewMode !== mode) {
        mode = viewMode;
        value = mode === 'ratio' ? settings.ratio : settings.points;
    }
    const max = Number(totalMax) || 0;
    const points = mode === 'ratio' ? (max > 0 ? max * value / 100 : settings.points) : value;
    return { mode, value, points };
}

/**
 * 학생 점수와 기준선으로 4단계를 판정한다.
 * @param {object} p score, cutoff(기준선=합격 최저점 또는 예상선), totalMax, schoolName, track,
 *                   maxRejected(불합격 최고점, 선택), source(기준선 출처 표시용, 선택)
 */
export function judgeScore({ score, cutoff, totalMax, schoolName = '', track = '', maxRejected = 0, source = '' }) {
    const s = Number(score);
    const c = Number(cutoff);
    const margin = marginFor(schoolName, track, totalMax);
    if (!Number.isFinite(s) || !(c > 0)) {
        return { level: 'unknown', ...JUDGMENT_LEVELS.unknown, diff: 0, diffPct: 0, margin, cutoff: 0, source };
    }
    let level = 'challenge';
    if (s >= c + margin.points || (Number(maxRejected) > 0 && s > Number(maxRejected) && s >= c)) level = 'safe';
    else if (s >= c) level = 'proper'; // 동점자는 합격선과 같으면 합격으로 본다
    else if (s >= c - margin.points) level = 'hope';
    const diff = s - c;
    const max = Number(totalMax) || 0;
    return { level, ...JUDGMENT_LEVELS[level], diff, diffPct: max > 0 ? (diff / max) * 100 : 0, margin, cutoff: c, source };
}

/** 하한~상한 범위(후기 일반고 가산점 미정 등)로 판정: 하한 기준, 상한으로 오를 수 있는 단계를 함께 준다. */
export function judgeRange({ low, high, ...rest }) {
    const base = judgeScore({ ...rest, score: low });
    const upper = Number(high) > Number(low) ? judgeScore({ ...rest, score: high }) : base;
    return { ...base, upperLevel: upper.level, upperLabel: upper.label, low: Number(low), high: Number(high) };
}

/** 후기 일반고 학교 내 석차백분율 판정(작을수록 좋음): 안정·경계·주의 */
export function judgeGeneralPercentile(percentile) {
    const { generalSafePct, generalBorderPct } = getJudgmentSettings();
    const p = Number(percentile);
    if (!Number.isFinite(p) || p <= 0) return { level: 'unknown', label: '자료 없음', emoji: '⚪', tone: 'slate' };
    if (p <= generalSafePct) return { level: 'safe', label: '안정', emoji: '🟢', tone: 'emerald' };
    if (p <= generalBorderPct) return { level: 'proper', label: '경계', emoji: '🟡', tone: 'amber' };
    return { level: 'challenge', label: '주의', emoji: '🔴', tone: 'rose' };
}

export function judgmentToneClass(result) {
    return TONE_CLASS[result?.tone] || TONE_CLASS.slate;
}

/** "+3.00점 · 만점의 1.0%" */
export function describeDiff(result) {
    if (!result || result.level === 'unknown') return '';
    const sign = v => (v >= 0 ? `+${v.toFixed(2)}` : v.toFixed(2));
    const pct = Number.isFinite(result.diffPct) ? ` · 만점의 ${result.diffPct >= 0 ? '+' : ''}${result.diffPct.toFixed(1)}%` : '';
    return `${sign(result.diff)}점${pct}`;
}

export function describeMargin(result) {
    const m = result?.margin;
    if (!m) return '';
    return m.mode === 'ratio' ? `여유폭 만점의 ${m.value}%(${m.points.toFixed(2)}점)` : `여유폭 ${m.value}점`;
}

/** 판정 설명(툴팁): 기준선·출처·차이·여유폭 */
export function judgmentTitle(result) {
    if (!result || result.level === 'unknown') return '비교할 기준선이 없습니다';
    const source = result.source ? ` (${result.source})` : '';
    const range = result.upperLevel && result.upperLevel !== result.level ? ` · 가산점 반영 시 최대 ${result.upperLabel}` : '';
    return `기준선 ${result.cutoff.toFixed(2)}점${source} · ${describeDiff(result)} · ${describeMargin(result)} → ${result.label}${range}`;
}

/** 표준 판정 배지 HTML. text를 주면 라벨 대신 표시(예: 점수). */
export function judgmentBadge(result, { text = '', compact = false } = {}) {
    const label = text || `${result.emoji} ${result.label}`;
    const size = compact ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-0.5 text-xs';
    const range = result.upperLevel && result.upperLevel !== result.level ? `<span class="opacity-70">↗${result.upperLabel}</span>` : '';
    const safeTitle = judgmentTitle(result).replace(/"/g, '&quot;');
    return `<span class="inline-flex items-center justify-center gap-1 leading-none font-bold rounded-full border whitespace-nowrap ${size} ${judgmentToneClass(result)}" title="${safeTitle}">${label}${range}</span>`;
}

/** 상담 화면용 보기 방식 전환 버튼 묶음 HTML */
export function judgmentModeToggleHTML() {
    const current = getJudgmentViewMode();
    const settings = getJudgmentSettings();
    const btn = (mode, text) => `<button type="button" data-judgment-mode="${mode}" class="judgment-mode-btn px-2 py-0.5 rounded-md text-[11px] font-bold ${String(current) === String(mode) ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-700'}">${text}</button>`;
    return `<span class="inline-flex items-center gap-0.5 rounded-lg border border-slate-600 bg-slate-900/70 p-0.5" title="판정 여유폭 보기 방식 (학교 기본: ${settings.mode === 'ratio' ? `만점의 ${settings.ratio}%` : `${settings.points}점`})">
        <span class="px-1 text-[10px] text-slate-400">판정</span>${btn('null', '학교 설정')}${btn('ratio', `비율 ${settings.ratio}%`)}${btn('points', `점수 ${settings.points}점`)}</span>`;
}

/** 전환 버튼 연결: 누르면 보기 방식을 바꾸고 onChange(다시 그리기)를 부른다. */
export function bindJudgmentModeToggle(container, onChange) {
    container?.querySelectorAll('.judgment-mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.dataset.judgmentMode;
            setJudgmentViewMode(mode === 'null' ? null : mode);
            onChange?.();
        });
    });
}

/** 화면 머리글용 요약: "여유폭 만점의 2% · 일반고 안정 80%·경계 90%" */
export function judgmentSummaryText() {
    const s = getJudgmentSettings();
    const margin = s.mode === 'ratio' ? `여유폭 만점의 ${s.ratio}%` : `여유폭 ${s.points}점`;
    const extra = Object.keys(s.overrides || {}).length ? ` (학교별 예외 ${Object.keys(s.overrides).length}건)` : '';
    return `${margin}${extra} · 일반고 안정 ${s.generalSafePct}%·경계 ${s.generalBorderPct}%`;
}

/** 통계 화면용 4단계 구간 경계(기준선 = 합격 최저점). */
export function judgmentZones({ cutoff, totalMax, schoolName = '', track = '', maxRejected = 0 }) {
    const c = Number(cutoff);
    if (!(c > 0)) return null;
    const margin = marginFor(schoolName, track, totalMax);
    let safeFrom = c + margin.points;
    if (Number(maxRejected) > 0) safeFrom = Math.min(safeFrom, Math.max(c, Number(maxRejected) + 0.01));
    return { safeFrom, properFrom: c, hopeFrom: c - margin.points, margin };
}
