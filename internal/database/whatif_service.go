package database

import (
	"fmt"
	"math"
	"sort"
	"strings"

	"PHGC/internal/calc"
	"PHGC/internal/parser"
)

// 상담 화면 "가정해 보기"(저장하지 않음).
// 전기고: 가정값을 적용한 학생 자료로 학교별 점수를 다시 계산한다.
// 후기고: 이 학생만 바뀐다고 보고 전교 석차를 다시 매긴다. 담임 PC처럼 전교생 자료가 없으면
// 우리 반 학생들의 전교 석차(학년부장이 배포한 석차 기록)로 새 석차를 추정하고 그렇다고 알린다.

type WhatIfSchoolChange struct {
	SchoolName string  `json:"schoolName"`
	TrackName  string  `json:"trackName"`
	TotalMax   float64 `json:"totalMax"`
	Before     float64 `json:"before"`
	After      float64 `json:"after"`
}

type WhatIfGeneral struct {
	Rank          int     `json:"rank"`
	TotalStudents int     `json:"totalStudents"`
	Percentile    float64 `json:"percentile"`
	Academic      float64 `json:"academic"`    // 교과(160)
	NonAcademic   float64 `json:"nonAcademic"` // 비교과(40)
	Total         float64 `json:"total"`       // 총점(200)
	Base          float64 `json:"base"`        // 기본 지표(가산점 제외)
	High          float64 `json:"high"`        // 아직 정해지지 않은 가산점까지 받을 때
}

type WhatIfResult struct {
	Schools       []WhatIfSchoolChange `json:"schools"`
	GeneralBefore WhatIfGeneral        `json:"generalBefore"`
	GeneralAfter  WhatIfGeneral        `json:"generalAfter"`
	GeneralMethod string               `json:"generalMethod"` // exact(전교생 자료로 계산) · estimated(우리 반 전교 석차로 추정) · none
	Notes         []string             `json:"notes"`
}

func generalFrom(r calc.StudentCalcResult) WhatIfGeneral {
	return WhatIfGeneral{Rank: r.Rank, TotalStudents: r.TotalStudents, Percentile: r.Percentile, Academic: r.FinalScore,
		NonAcademic: r.NonAcademicScore, Total: r.GeneralTotalScore, Base: r.GeneralBaseScore, High: r.GeneralTotalHigh}
}

func findCalc(results []calc.StudentCalcResult, s parser.StudentExcelData) (calc.StudentCalcResult, bool) {
	for _, r := range results {
		if r.ClassNum == s.ClassNum && r.StudentNum == s.StudentNum && r.Name == s.Name {
			return r, true
		}
	}
	return calc.StudentCalcResult{}, false
}

// withAcademic 교과 점수(석차)가 바뀐 결과에 총점·기본 지표·상한을 맞춘다.
func withAcademic(g WhatIfGeneral, rank, total int) WhatIfGeneral {
	pending := g.High - g.Total
	nonBase := g.Base - g.Academic // 출결 + 봉사 + 기본 10점
	g.Rank, g.TotalStudents = rank, total
	g.Percentile = calc.Round2(float64(rank) / float64(total) * 100)
	g.Academic = calc.Round2(160 - 0.96*g.Percentile)
	g.Total = calc.Round2(g.Academic + g.NonAcademic)
	g.Base = calc.Round2(g.Academic + nonBase)
	g.High = calc.Round2(g.Total + pending)
	return g
}

// estimateRank 우리 반 학생들의 (교과 합산 점수, 전교 석차) 기록을 이어 새 점수의 전교 석차를 추정한다.
// 우리 반 점수 범위 안은 이웃한 두 학생 사이 직선으로, 범위 밖은 반 전체 기울기로 늘여 본다.
func estimateRank(snaps map[string]RankSnapshot, score float64, total int) int {
	type point struct{ score, rank float64 }
	pts := []point{}
	for _, s := range snaps {
		if s.TotalStudents > 0 && s.Rank > 0 {
			pts = append(pts, point{s.TotalSubjectScore, float64(s.Rank)})
		}
	}
	if len(pts) == 0 {
		return 0
	}
	sort.Slice(pts, func(i, j int) bool { return pts[i].score > pts[j].score })
	first, last := pts[0], pts[len(pts)-1]
	slope := 0.0 // 점수 1점당 석차 변화
	if first.score > last.score {
		slope = (last.rank - first.rank) / (first.score - last.score)
	}
	var rank float64
	switch {
	case score >= first.score:
		rank = first.rank - slope*(score-first.score)
	case score <= last.score:
		rank = last.rank + slope*(last.score-score)
	default:
		for i := 1; i < len(pts); i++ {
			a, b := pts[i-1], pts[i]
			if score <= a.score && score >= b.score {
				rank = a.rank
				if a.score > b.score {
					rank += (b.rank - a.rank) * (a.score - score) / (a.score - b.score)
				}
				break
			}
		}
	}
	r := int(math.Round(rank))
	if r < 1 {
		r = 1
	}
	if r > total {
		r = total
	}
	return r
}

// WhatIfStudent 가정값으로 학교별 점수·후기고 석차를 다시 계산한다(아무것도 저장하지 않음).
func (dm *DBManager) WhatIfStudent(classNum int, studentNum, name string, in calc.WhatIfInput) (*WhatIfResult, error) {
	student, err := dm.GetStudent(classNum, studentNum, name)
	if err != nil {
		return nil, fmt.Errorf("학생 정보를 찾을 수 없습니다: %w", err)
	}
	modified, notes := calc.ApplyWhatIf(*student, in)
	before, err := calc.ParseStudentFullData(*student)
	if err != nil {
		return nil, err
	}
	after, err := calc.ParseStudentFullData(modified)
	if err != nil {
		return nil, err
	}
	res := &WhatIfResult{Notes: notes, GeneralMethod: "none"}
	for i, b := range before.SchoolResults {
		if i >= len(after.SchoolResults) {
			break
		}
		res.Schools = append(res.Schools, WhatIfSchoolChange{SchoolName: b.SchoolName, TrackName: b.TrackName, TotalMax: b.TotalMax,
			Before: b.TotalScore, After: after.SchoolResults[i].TotalScore})
	}

	// 후기고: 이 학생 자료만 바꿔 전교 석차를 다시 매긴다.
	config, err := dm.GetSchoolConfig()
	if err != nil || config == nil {
		return res, nil
	}
	all, err := dm.GetAllStudents(config.ClassCount)
	if err != nil || len(all) == 0 {
		return res, nil
	}
	baseResults, err := calc.CalculateGrades(all, config.IsSmallSchool)
	if err != nil {
		return res, nil
	}
	replaced := map[int][]parser.StudentExcelData{}
	for c, list := range all {
		copied := make([]parser.StudentExcelData, len(list))
		copy(copied, list)
		for i := range copied {
			if copied[i].ClassNum == student.ClassNum && copied[i].StudentNum == student.StudentNum && copied[i].Name == student.Name {
				copied[i] = modified
			} else if in.RemainingStep != 0 {
				copied[i].RawData = calc.FillThirdYearFinal(copied[i].RawData)
			}
		}
		replaced[c] = copied
	}
	afterResults, err := calc.CalculateGrades(replaced, config.IsSmallSchool)
	if err != nil {
		return res, nil
	}
	b, okB := findCalc(baseResults, *student)
	a, okA := findCalc(afterResults, modified)
	if !okB || !okA {
		return res, nil
	}
	res.GeneralBefore, res.GeneralAfter, res.GeneralMethod = generalFrom(b), generalFrom(a), "exact"
	if in.RemainingStep != 0 && !a.ThirdYearFinalUsed {
		res.Notes = append(res.Notes, "3학년 성적이 없는 학생이 있어 후기고 석차에는 남은 학기 성적 변화를 반영하지 못했습니다.")
	}

	// 담임 PC: 전교생 자료가 없으면 배포된 우리 반 전교 석차 기록으로 석차를 맞추고 새 석차는 추정한다.
	snaps, _ := dm.GetRankSnapshots(classNum)
	key := fmt.Sprintf("%s_%s", strings.TrimSpace(student.StudentNum), strings.TrimSpace(student.Name))
	if snap, ok := snaps[key]; ok && snap.TotalStudents > b.TotalStudents {
		res.GeneralMethod = "estimated"
		res.GeneralBefore = withAcademic(res.GeneralBefore, snap.Rank, snap.TotalStudents)
		newRank := snap.Rank
		if math.Abs(a.TotalSubjectScore-b.TotalSubjectScore) >= 0.0001 {
			if est := estimateRank(snaps, a.TotalSubjectScore, snap.TotalStudents); est > 0 {
				newRank = est
			}
		}
		res.GeneralAfter = withAcademic(res.GeneralAfter, newRank, snap.TotalStudents)
		res.Notes = append(res.Notes, fmt.Sprintf("이 PC에는 전교생 성적이 없어, 우리 반 학생들의 전교 석차 기록(전교 %d명)으로 새 석차를 추정했습니다. 정확한 석차는 학년부장 PC에서 계산됩니다.", snap.TotalStudents))
	}
	return res, nil
}
