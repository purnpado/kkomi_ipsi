package database

import "testing"

func TestGeneralLastYearResult(t *testing.T) {
	dm := newEvidenceTestDB(t)
	db, err := dm.OpenDB(dm.GetConfigDBPath())
	if err != nil {
		t.Fatal(err)
	}
	if err := dm.initHistoryTable(db); err != nil {
		t.Fatal(err)
	}
	// 교과 102.40 → 60%, 140.80 → 20%, 85.6 → 77.5%(불합격)
	rows := []HistoryRecord{
		{AdmissionYear: 2026, Category: "general", Status: "합격", GeneralDetailJSON: `{"academicScore":102.4}`},
		{AdmissionYear: 2026, Category: "general", Status: "최종 진학", GeneralDetailJSON: `{"academicScore":140.8}`},
		{AdmissionYear: 2026, Category: "general", Status: "불합격", GeneralDetailJSON: `{"academicScore":85.6}`},
		{AdmissionYear: 2025, Category: "general", Status: "합격", GeneralDetailJSON: `{"academicScore":80}`},
		{AdmissionYear: 2026, Category: "meister", Status: "합격", GeneralDetailJSON: `{"academicScore":10}`},
	}
	if err := insertHistory(db, rows, "local"); err != nil {
		t.Fatal(err)
	}
	db.Close()
	r, err := dm.GeneralLastYearResult(2027)
	if err != nil || r == nil {
		t.Fatalf("결과: %+v %v", r, err)
	}
	if r.AdmissionYear != 2026 || r.Passed != 2 || r.MaxPassedPct != 60 || r.Failed != 1 || r.MinFailedPct != 77.5 {
		t.Fatalf("2026 결과: %+v", r)
	}
	if none, _ := dm.GeneralLastYearResult(2025); none != nil {
		t.Fatalf("2025 전 기록은 없어야 합니다: %+v", none)
	}
}
