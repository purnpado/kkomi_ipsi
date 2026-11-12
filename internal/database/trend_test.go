package database

import (
	"testing"

	"PHGC/internal/model"
)

func TestAdmissionTrendAcrossYears(t *testing.T) {
	dm := newEvidenceTestDB(t)
	save := func(year int, num, status string, score, max float64, version string) {
		t.Helper()
		rec := model.ApplicationRecord{ClassNum: 1, StudentNum: num, StudentName: "가상" + num, AdmissionYear: year, Category: "meister",
			SchoolName: "울산마이스터고", Track: "일반", Status: status, Score: score, Preferences: []string{"기계과"},
			ScoreDetails: &model.ApplicationScoreDetails{TotalMax: max, FormulaVersion: version, TotalScore: score}}
		if status == "합격" {
			rec.AssignedDepartment = "기계과"
		}
		if err := dm.SaveApplication(rec); err != nil {
			t.Fatal(err)
		}
	}
	save(2025, "1", "합격", 250, 300, "울산마이스터고-일반/2025요강")
	save(2025, "2", "불합격", 230, 300, "울산마이스터고-일반/2025요강")
	save(2026, "3", "합격", 255, 300, "울산마이스터고-일반/2025요강")
	save(2027, "4", "합격", 270, 320, "울산마이스터고-일반/2027요강")

	years, _ := dm.GetAnalysisYears()
	if len(years) != 3 || years[0] != 2027 || years[2] != 2025 {
		t.Fatalf("분석 학년도: %v", years)
	}
	trend, err := dm.GetAdmissionTrend("울산마이스터고등학교", "", "일반전형")
	if err != nil {
		t.Fatal(err)
	}
	if len(trend) != 3 {
		t.Fatalf("추세 %d개: %+v", len(trend), trend)
	}
	p25, p26, p27 := trend[0], trend[1], trend[2]
	if p25.OurApplicants != 2 || p25.OurAccepted != 1 || p25.OurAcceptedMin != 250 || p25.TotalMax != 300 {
		t.Errorf("2025: %+v", p25)
	}
	if p26.FormulaChanged {
		t.Errorf("2026은 산출식이 같은데 변경 표시: %+v", p26)
	}
	if !p27.FormulaChanged || p27.TotalMax != 320 {
		t.Errorf("2027은 만점·요강이 바뀌었는데 표시 없음: %+v", p27)
	}
	// 학과로 거르면 같은 학과 기록만
	byDept, _ := dm.GetAdmissionTrend("울산마이스터고", "없는과", "일반")
	if len(byDept) != 0 {
		t.Errorf("없는 학과 추세가 나옴: %+v", byDept)
	}
}
