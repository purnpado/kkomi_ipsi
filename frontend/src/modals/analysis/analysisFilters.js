import { normalizeSchoolName, normalizeTrack, displayTrack } from '../../core/utils.js';

// 실제 학교별 산출 규칙을 우선 사용하고, 규칙이 없을 때 학교 유형·기록으로 보완한다.
export function tracksForSchool(school, rules, category, recordedTracks = []) {
    const name = normalizeSchoolName(school);
    const ruleTracks = (rules || []).filter(r => normalizeSchoolName(r.schoolName) === name)
        .map(r => normalizeTrack(r.trackName)).filter(Boolean);
    if (ruleTracks.length) return [...new Set(ruleTracks)];
    if (category === 'meister') return ['일반', '특별'];
    if (category === 'special') return ['일반', '취업희망자'];
    return [...new Set(recordedTracks.map(normalizeTrack).filter(Boolean))];
}

export function trackLabel(track) {
    return displayTrack(track);
}
