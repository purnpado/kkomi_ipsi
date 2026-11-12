package database

import (
	"testing"

	"PHGC/internal/model"
)

func TestPreferenceStrategyByRank(t *testing.T) {
	dm := newEvidenceTestDB(t)
	save := func(num string, prefs []string, assigned, status string, score float64) {
		t.Helper()
		if err := dm.SaveApplication(model.ApplicationRecord{ClassNum: 1, StudentNum: num, StudentName: "가상" + num, AdmissionYear: 2026,
			Category: "special", SchoolName: "울산공업고", Track: "일반", Status: status, Score: score, Preferences: prefs, AssignedDepartment: assigned}); err != nil {
			t.Fatal(err)
		}
	}
	// 기계과: 1지망 배정 2명(90, 80), 전기과: 1지망 배정 1명(85)·2지망 배정 1명(70, 기계과 1지망 탈락), 불합격 1명(기계과 1지망)
	save("1", []string{"기계과", "전기과"}, "기계과", "합격", 90)
	save("2", []string{"기계과", "전기과"}, "기계과", "합격", 80)
	save("3", []string{"전기과", "기계과"}, "전기과", "합격", 85)
	save("4", []string{"기계과", "전기과"}, "전기과", "합격", 70)
	save("5", []string{"기계과", "전기과"}, "", "불합격", 60)

	st, err := dm.GetPreferenceStrategy(2026, "울산공업고등학교", "일반전형")
	if err != nil {
		t.Fatal(err)
	}
	if st.SchoolMin != 70 || st.Records != 5 || len(st.Departments) != 2 {
		t.Fatalf("전체: %+v", st)
	}
	by := map[string]DepartmentPreferenceStat{}
	for _, d := range st.Departments {
		by[d.Department] = d
	}
	m, e := by["기계과"], by["전기과"]
	if m.FirstRankMin != 80 || m.SeatsLeftOver || m.RejectedFirst != 1 || m.AssignedTotal != 2 {
		t.Errorf("기계과: %+v", m)
	}
	if e.FirstRankMin != 85 || !e.SeatsLeftOver || e.LowestAssigned != 70 || len(e.ByRank) != 2 || e.ByRank[1].Rank != 2 || e.ByRank[1].MinScore != 70 {
		t.Errorf("전기과: %+v", e)
	}
}
