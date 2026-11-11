package database

import (
	"testing"

	"PHGC/internal/model"
)

// 1차 합격 후 최종 불합격(2차 탈락)은 1차 불합격과 따로 집계하고,
// 불합격 점수 분포(커트라인 겹침 구간)에는 넣지 않는다.
func TestApplicationSummarySeparatesSecondStageFailures(t *testing.T) {
	dm := &DBManager{DataDir: t.TempDir()}
	dm.SetDataKey(make([]byte, 32))
	if err := dm.InitConfigDB(); err != nil {
		t.Fatal(err)
	}
	if err := dm.SaveSchoolConfig("테스트중학교", 1, "", false, 2027); err != nil {
		t.Fatal(err)
	}
	if err := dm.InitClassDB(1); err != nil {
		t.Fatal(err)
	}
	base := model.ApplicationRecord{ClassNum: 1, AdmissionYear: 2027, Category: "meister", SchoolName: "울산마이스터고등학교", Track: "일반"}
	entries := []struct {
		num, name, status, stage, dept string
		score                          float64
	}{
		{"1", "가", "합격", "", "기계과", 280},  // 최종 합격 → 1차 합격 자동 기록
		{"2", "나", "불합격", "합격", "", 290},  // 1차 합격, 면접 탈락
		{"3", "다", "불합격", "불합격", "", 250}, // 1차 불합격
		{"4", "라", "지원완료", "합격", "", 270}, // 1차 합격, 2차 대기
		{"5", "마", "불합격", "", "", 240},    // 단계 미구분(기존 자료)
	}
	for _, e := range entries {
		r := base
		r.StudentNum, r.StudentName, r.Status, r.FirstStageResult, r.Score = e.num, e.name, e.status, e.stage, e.score
		r.Preferences = []string{"기계과"}
		r.AssignedDepartment = e.dept
		if err := dm.SaveApplication(r); err != nil {
			t.Fatalf("%s 저장 실패: %v", e.name, err)
		}
	}
	bad := base
	bad.StudentNum, bad.StudentName, bad.Status, bad.FirstStageResult = "6", "바", "합격", "불합격"
	if err := dm.SaveApplication(bad); err == nil {
		t.Fatal("1차 불합격인데 최종 합격인 기록은 거부해야 함")
	}

	summaries, err := dm.GetApplicationSummaries()
	if err != nil {
		t.Fatal(err)
	}
	var stage1Pass, stage1Fail, stage2Fail int
	var minPass, maxRejected float64
	for _, s := range summaries {
		stage1Pass += s.Stage1PassCount
		stage1Fail += s.Stage1FailCount
		stage2Fail += s.Stage2FailCount
		if s.MinStage1PassScore > 0 && (minPass == 0 || s.MinStage1PassScore < minPass) {
			minPass = s.MinStage1PassScore
		}
		if s.MaxRejectedScore > maxRejected {
			maxRejected = s.MaxRejectedScore
		}
	}
	if stage1Pass != 3 || stage1Fail != 1 || stage2Fail != 1 {
		t.Fatalf("단계 인원: 1차합격=%d 1차불합격=%d 2차탈락=%d", stage1Pass, stage1Fail, stage2Fail)
	}
	if minPass != 270 {
		t.Fatalf("1차 합격선 = %.2f, want 270", minPass)
	}
	if maxRejected != 250 {
		t.Fatalf("불합격 점수 분포에 2차 탈락(290)이 섞임: max=%.2f", maxRejected)
	}
	records, err := dm.GetSchoolApplicationRecords()
	if err != nil {
		t.Fatal(err)
	}
	for _, r := range records {
		if r.StudentName == "가" && r.FirstStageResult != "합격" {
			t.Fatalf("최종 합격자의 1차 결과 자동 기록 실패: %q", r.FirstStageResult)
		}
	}
}
