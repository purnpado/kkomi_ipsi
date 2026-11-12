package main

import (
	"fmt"

	"PHGC/internal/database"
)

// 공식 경쟁률(모집정원·지원자 수): 실제 학교에서는 학년부장이 고교 발표값을 직접 입력한다.
// 시뮬레이터는 지역 전체 원서 수와 그해 정원을 "발표값"으로 보고 참여 학교 프로그램에 입력한다.

// competitionRecords 그해 학교·전형 전체와 학과별(1지망 기준) 정원·지원자 수
func competitionRecords(yr *yearResult) []database.CompetitionRecord {
	type key struct{ school, track, dept string }
	applicants := map[key]int{}
	for _, a := range yr.apps {
		if a.category != "meister" && a.category != "special" {
			continue
		}
		school := shortSchool(a.school)
		applicants[key{school, a.track, ""}]++
		if len(a.prefs) > 0 {
			applicants[key{school, a.track, a.prefs[0]}]++
		}
	}
	quotas := map[key]int{}
	for k, n := range yr.seats {
		var school, track, dept string
		if parts := splitSeatKey(k); len(parts) == 3 {
			school, track, dept = shortSchool(parts[0]), parts[1], parts[2]
		} else {
			continue
		}
		quotas[key{school, track, dept}] += n
		quotas[key{school, track, ""}] += n
	}
	out := make([]database.CompetitionRecord, 0, len(quotas))
	for k, quota := range quotas {
		out = append(out, database.CompetitionRecord{AdmissionYear: yr.year, SchoolName: k.school, Department: k.dept, Track: k.track, Quota: quota, Applicants: applicants[k]})
	}
	return out
}

func splitSeatKey(k string) []string {
	parts := []string{}
	start := 0
	for i := 0; i < len(k); i++ {
		if k[i] == '/' {
			parts = append(parts, k[start:i])
			start = i + 1
		}
	}
	return append(parts, k[start:])
}

// basisIndex 직전 학년도 판정 근거(합격·불합격 사례 수, 공식 경쟁률)를 학교·학과·전형으로 찾는다.
type basisIndex struct {
	evidence    map[string]database.AdmissionEvidence
	competition map[string]database.CompetitionRecord
}

func basisKey(year int, school, dept, track string) string {
	return fmt.Sprintf("%d|%s|%s|%s", year, school, dept, track)
}

func newBasisIndex(dm *database.DBManager) *basisIndex {
	idx := &basisIndex{evidence: map[string]database.AdmissionEvidence{}, competition: map[string]database.CompetitionRecord{}}
	if list, err := dm.GetAdmissionEvidence(); err == nil {
		for _, e := range list {
			idx.evidence[basisKey(e.AdmissionYear, e.HighSchool, e.Department, e.Track)] = e
		}
	}
	if list, err := dm.GetCompetitionRecords(); err == nil {
		for _, c := range list {
			idx.competition[basisKey(c.AdmissionYear, c.SchoolName, c.Department, c.Track)] = c
		}
	}
	return idx
}

// noRejection 기준선이 불합격 사례 없는 합격 최저점(합격선의 상한)인지: 프론트엔드 judgeScore와 같은 조건
func (idx *basisIndex) noRejection(year int, school, dept, track string, cutoff float64) bool {
	e, ok := idx.evidence[basisKey(year, school, dept, track)]
	if !ok {
		e, ok = idx.evidence[basisKey(year, school, "", track)]
	}
	return ok && e.AcceptedCount > 0 && e.RejectedCount == 0 && cutoff >= e.AcceptedMin-0.005
}

// competitionNote 공식 경쟁률 입력값으로만 미달 여부를 말한다.
func (idx *basisIndex) competitionNote(year int, school, dept, track string) string {
	c, ok := idx.competition[basisKey(year, school, dept, track)]
	if !ok {
		c, ok = idx.competition[basisKey(year, school, "", track)]
	}
	switch {
	case !ok || c.Quota <= 0:
		return "경쟁률 미입력"
	case c.Applicants <= c.Quota:
		return "작년 미달"
	}
	return "작년 경쟁 있음"
}
