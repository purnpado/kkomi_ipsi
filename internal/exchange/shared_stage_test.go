package exchange

import (
	"path/filepath"
	"testing"

	"PHGC/internal/crypto"
	"PHGC/internal/database"
	"PHGC/internal/model"
)

func newStageSchool(t *testing.T, name string) *database.DBManager {
	t.Helper()
	dm := &database.DBManager{DataDir: t.TempDir()}
	key, err := crypto.NewDataKey()
	if err != nil {
		t.Fatal(err)
	}
	dm.SetDataKey(key)
	if err := dm.InitConfigDB(); err != nil {
		t.Fatal(err)
	}
	if err := dm.InitClassDB(1); err != nil {
		t.Fatal(err)
	}
	if err := dm.SaveSchoolConfig(name, 1, "", false, 2027); err != nil {
		t.Fatal(err)
	}
	return dm
}

func saveStage(t *testing.T, dm *database.DBManager, num, status, stage string, score float64) {
	t.Helper()
	r := model.ApplicationRecord{
		ClassNum: 1, StudentNum: num, StudentName: "학생" + num, AdmissionYear: 2027, Category: "meister",
		SchoolName: "울산마이스터고등학교", Track: "일반", Status: status, FirstStageResult: stage, Score: score,
		Preferences: []string{"기계과"},
	}
	if status == "합격" {
		r.AssignedDepartment = "기계과"
	}
	if err := dm.SaveApplication(r); err != nil {
		t.Fatalf("%s 저장 실패: %v", num, err)
	}
}

// 관내 여러 중학교 자료를 합쳐도 1차 합격 후 2차 탈락이 따로 집계되고,
// 불합격 점수 분포(겹침 구간)에는 1차 불합격자만 들어가야 한다.
func TestConsolidatedStatsSeparateSecondStageFailures(t *testing.T) {
	a := newStageSchool(t, "A중학교")
	saveStage(t, a, "1", "합격", "", 280)
	saveStage(t, a, "2", "불합격", "합격", 285) // 면접 탈락
	saveStage(t, a, "3", "불합격", "불합격", 250)
	b := newStageSchool(t, "B중학교")
	saveStage(t, b, "1", "합격", "합격", 275)
	saveStage(t, b, "2", "불합격", "합격", 278) // 면접 탈락

	dir := t.TempDir()
	pathA, pathB := filepath.Join(dir, "a.kkomi"), filepath.Join(dir, "b.kkomi")
	if err := ExportSharedPackageV2(a, 2027, "share-pw-a", pathA); err != nil {
		t.Fatal(err)
	}
	if err := ExportSharedPackageV2(b, 2027, "share-pw-b", pathB); err != nil {
		t.Fatal(err)
	}
	cons := &database.DBManager{DataDir: t.TempDir()}
	key, _ := crypto.NewDataKey()
	cons.SetDataKey(key)
	if err := cons.InitConfigDB(); err != nil {
		t.Fatal(err)
	}
	if _, err := ImportSharedPackageV2(cons, "share-pw-a", pathA); err != nil {
		t.Fatal(err)
	}
	if _, err := ImportSharedPackageV2(cons, "share-pw-b", pathB); err != nil {
		t.Fatal(err)
	}

	accepted, err := cons.GetConsolidatedAdmissionStats(2027, "울산마이스터고", "기계과", "일반", 5)
	if err != nil {
		t.Fatal(err)
	}
	if accepted.AcceptedCount != 2 || accepted.Stage1PassCount != 4 || accepted.Stage1PassMin != 275 {
		t.Fatalf("합격 학과 집계: 합격=%d 1차합격=%d 1차합격선=%.2f", accepted.AcceptedCount, accepted.Stage1PassCount, accepted.Stage1PassMin)
	}
	// 1차 합격 4명 = 최종 합격 2 + 2차 탈락 2. 불합격자는 1지망 학과(기계과)로 집계된다.
	if accepted.Stage2FailCount != 2 || accepted.Stage2FailAvg != 281.5 {
		t.Fatalf("2차 탈락: %d명 평균 %.2f", accepted.Stage2FailCount, accepted.Stage2FailAvg)
	}
	if accepted.RejectedCount != 1 || accepted.RejectedMax != 250 || accepted.HasOverlap {
		t.Fatalf("불합격 점수 분포에 2차 탈락이 섞임: 불합격=%d 최고=%.2f 겹침=%v", accepted.RejectedCount, accepted.RejectedMax, accepted.HasOverlap)
	}
	if accepted.TotalApplicants != 5 {
		t.Fatalf("전체 지원자 = %d, want 5", accepted.TotalApplicants)
	}
}
