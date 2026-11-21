package database

import (
	"encoding/json"
	"math"
)

// 상담 화면 "작년 우리 학교 결과" 한 줄: 지난 학년도 후기 일반고 합격·불합격 학생의 교과 석차백분율 범위.
// 지난 입시 기록(admission_history, 우리 학교 확정·인수인계)에는 백분율이 없고 교과 점수(160점)가 남아 있어
// 백분율 = (160 − 교과) ÷ 0.96 으로 되살린다(사용자 요청 2026-11-21).

// GeneralYearResult 한 학년도의 우리 학교 후기 일반고 결과.
type GeneralYearResult struct {
	AdmissionYear int     `json:"admissionYear"`
	Passed        int     `json:"passed"`        // 합격(배정) 학생 수
	MaxPassedPct  float64 `json:"maxPassedPct"`  // 합격 학생 중 가장 큰 교과 석차백분율
	Failed        int     `json:"failed"`        // 불합격 학생 수
	MinFailedPct  float64 `json:"minFailedPct"`  // 불합격 학생 중 가장 작은 교과 석차백분율
}

func percentileFromAcademic(academic float64) float64 {
	return math.Round((160-academic)/0.96*100) / 100
}

// GeneralLastYearResult 고입 학년도 year 이전 가운데 우리 학교 후기 일반고 기록이 있는 가장 최근 학년도 결과(없으면 nil).
func (dm *DBManager) GeneralLastYearResult(year int) (*GeneralYearResult, error) {
	history, err := dm.GetAdmissionHistory()
	if err != nil {
		return nil, err
	}
	byYear := map[int]*GeneralYearResult{}
	latest := 0
	for _, h := range history {
		if h.Category != "general" || h.AdmissionYear >= year || (h.Source != "local" && h.Source != "handover" && h.Source != "") || h.GeneralDetailJSON == "" {
			continue
		}
		var d SharedGeneralDetail
		if json.Unmarshal([]byte(h.GeneralDetailJSON), &d) != nil || d.AcademicScore <= 0 {
			continue
		}
		pct := percentileFromAcademic(d.AcademicScore)
		r := byYear[h.AdmissionYear]
		if r == nil {
			r = &GeneralYearResult{AdmissionYear: h.AdmissionYear}
			byYear[h.AdmissionYear] = r
		}
		switch h.Status {
		case "합격", "최종 진학", "포기":
			r.Passed++
			r.MaxPassedPct = math.Max(r.MaxPassedPct, pct)
		case "불합격":
			if r.Failed == 0 || pct < r.MinFailedPct {
				r.MinFailedPct = pct
			}
			r.Failed++
		default:
			continue
		}
		if h.AdmissionYear > latest {
			latest = h.AdmissionYear
		}
	}
	if latest == 0 {
		return nil, nil
	}
	return byYear[latest], nil
}
