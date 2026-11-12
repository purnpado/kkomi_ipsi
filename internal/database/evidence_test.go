package database

import (
	"testing"

	"PHGC/internal/model"
)

func newEvidenceTestDB(t *testing.T) *DBManager {
	t.Helper()
	dm := &DBManager{DataDir: t.TempDir()}
	dm.SetDataKey(make([]byte, 32))
	if err := dm.InitConfigDB(); err != nil {
		t.Fatal(err)
	}
	if err := dm.SaveSchoolConfig("가람중학교", 1, "x", false, 2027); err != nil {
		t.Fatal(err)
	}
	if err := dm.InitClassDB(1); err != nil {
		t.Fatal(err)
	}
	return dm
}

func TestCompetitionRecordsSaveNormalizeAndDelete(t *testing.T) {
	dm := newEvidenceTestDB(t)
	n, err := dm.SaveCompetitionRecords([]CompetitionRecord{
		{AdmissionYear: 2026, SchoolName: "울산마이스터고등학교", Department: "공통", Track: "일반전형", Quota: 100, Applicants: 140},
		{AdmissionYear: 2026, SchoolName: "울산공업고", Department: "기계과", Track: "일반", Quota: 20, Applicants: 15},
	})
	if err != nil || n != 2 {
		t.Fatalf("저장 실패: n=%d err=%v", n, err)
	}
	list, err := dm.GetCompetitionRecords()
	if err != nil || len(list) != 2 {
		t.Fatalf("조회: %v %v", list, err)
	}
	found := false
	for _, r := range list {
		if r.SchoolName == "울산마이스터고" && r.Department == "" && r.Track == "일반" && r.Quota == 100 && r.Applicants == 140 {
			found = true
		}
	}
	if !found {
		t.Fatalf("학교·학과·전형 이름이 표준 표기로 저장되지 않음: %+v", list)
	}
	// 정원·지원자 수를 모두 0으로 저장하면 지워진다.
	if _, err := dm.SaveCompetitionRecords([]CompetitionRecord{{AdmissionYear: 2026, SchoolName: "울산공업고", Department: "기계과", Track: "일반"}}); err != nil {
		t.Fatal(err)
	}
	list, _ = dm.GetCompetitionRecords()
	if len(list) != 1 {
		t.Fatalf("삭제되지 않음: %+v", list)
	}
	if _, err := dm.SaveCompetitionRecords([]CompetitionRecord{{AdmissionYear: 2026, SchoolName: "", Quota: 1}}); err == nil {
		t.Fatal("학교명이 없는 자료가 저장됨")
	}
	// 인수인계 가져오기는 이미 있는 항목을 덮어쓰지 않는다.
	added, err := dm.ImportCompetitionRecords([]CompetitionRecord{
		{AdmissionYear: 2026, SchoolName: "울산마이스터고", Track: "일반", Quota: 1, Applicants: 1},
		{AdmissionYear: 2025, SchoolName: "울산마이스터고", Track: "일반", Quota: 90, Applicants: 120},
	})
	if err != nil || added != 1 {
		t.Fatalf("가져오기: added=%d err=%v", added, err)
	}
}

func TestAdmissionEvidenceCountsScoreRejectionsOnly(t *testing.T) {
	dm := newEvidenceTestDB(t)
	save := func(num, school, track, dept, status, first string, score float64) {
		t.Helper()
		rec := model.ApplicationRecord{ClassNum: 1, StudentNum: num, StudentName: "가상" + num, AdmissionYear: 2026, Category: "meister",
			SchoolName: school, Track: track, Status: status, FirstStageResult: first, Score: score, Preferences: []string{dept}}
		if status == "합격" {
			rec.AssignedDepartment = dept
		}
		if err := dm.SaveApplication(rec); err != nil {
			t.Fatal(err)
		}
	}
	// 학과 A: 합격 2명, 불합격 없음 / 학과 B: 합격 1명, 점수 불합격 1명, 면접 탈락 1명
	save("1", "울산마이스터고", "일반", "A과", "합격", "합격", 250)
	save("2", "울산마이스터고", "일반", "A과", "합격", "합격", 240)
	save("3", "울산마이스터고", "일반", "B과", "합격", "합격", 230)
	save("4", "울산마이스터고", "일반", "B과", "불합격", "불합격", 200)
	save("5", "울산마이스터고", "일반", "B과", "불합격", "합격", 245)

	list, err := dm.GetAdmissionEvidence()
	if err != nil {
		t.Fatal(err)
	}
	by := map[string]AdmissionEvidence{}
	for _, e := range list {
		by[e.Department] = e
	}
	a, b, whole := by["A과"], by["B과"], by[""]
	if a.AcceptedCount != 2 || a.RejectedCount != 0 || a.AcceptedMin != 240 {
		t.Errorf("A과: %+v", a)
	}
	if b.AcceptedCount != 1 || b.RejectedCount != 1 || b.Stage2FailCount != 1 || b.RejectedMax != 200 || b.AcceptedMin != 230 {
		t.Errorf("B과(면접 탈락은 점수 불합격으로 세지 않음): %+v", b)
	}
	if whole.AcceptedCount != 3 || whole.RejectedCount != 1 || whole.Stage2FailCount != 1 || whole.AcceptedMin != 230 {
		t.Errorf("학교·전형 전체: %+v", whole)
	}
}
