package database

import (
	"testing"

	"PHGC/internal/model"
)

// 추가모집 원서: 저장·읽기에서 표시가 남고, 추가모집이 아닌 구분(일반고)에는 붙지 않는다.
func TestExtraRoundSavedOnEarlyOnly(t *testing.T) {
	dm := newEvidenceTestDB(t)
	for _, rec := range []model.ApplicationRecord{
		{ClassNum: 1, StudentNum: "1", StudentName: "가상학생", AdmissionYear: 2027, Category: "special", SchoolName: "울산상업고", Track: "일반", Status: "합격", Score: 40, ExtraRound: true},
		{ClassNum: 1, StudentNum: "1", StudentName: "가상학생", AdmissionYear: 2027, Category: "general", Track: generalTrack, Status: "불합격", ExtraRound: true},
	} {
		if err := dm.SaveApplication(rec); err != nil {
			t.Fatal(err)
		}
	}
	apps, err := dm.GetStudentApplications(1, "1", "가상학생")
	if err != nil {
		t.Fatal(err)
	}
	got := map[string]bool{}
	for _, a := range apps {
		got[a.Category] = a.ExtraRound
	}
	if !got["special"] || got["general"] {
		t.Fatalf("추가모집 표시는 특성화고에만: %+v", got)
	}
	all, _ := dm.GetSchoolApplicationRecords()
	found := false
	for _, a := range all {
		found = found || (a.Category == "special" && a.ExtraRound)
	}
	if !found {
		t.Fatal("학교 전체 원서 목록에도 추가모집 표시가 있어야 합니다")
	}
	// 분석 근거: 합격 수에는 들어가고 추가모집 합격으로 따로 센다.
	evidence, err := dm.GetAdmissionEvidence()
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range evidence {
		if e.HighSchool == "울산상업고" && e.Department == "" && (e.AcceptedCount != 1 || e.ExtraRoundAccepted != 1) {
			t.Fatalf("근거: %+v", e)
		}
	}
}

// 관내 공유 자료: 추가모집 표시가 파일을 거쳐도 남고, 검증은 낮은 추가모집 합격을 이상한 값으로 보지 않는다.
func TestExtraRoundSharedAndVerify(t *testing.T) {
	dm := verifyTestDB(t)
	rej := AnonymousApplicationRecord{HighSchool: "울산상업고", Track: "일반", Status: "불합격", FirstStageResult: "불합격", Score: 60, ScoreDetails: model.ApplicationScoreDetails{TotalScore: 60}}
	extra := acc(45)
	extra.ExtraRound = true
	_, _ = dm.StoreSharedPackage(simplePkg("가중학교", 2027, acc(80), acc(82), acc(78)))
	_, _ = dm.StoreSharedPackage(simplePkg("나중학교", 2027, acc(81), acc(79), acc(83), rej))
	if _, err := dm.StoreSharedPackage(simplePkg("다중학교", 2027, acc(80), extra)); err != nil {
		t.Fatal(err)
	}
	report, err := dm.VerifySharedData()
	if err != nil {
		t.Fatal(err)
	}
	for _, is := range report.Issues {
		if is.Code == "low_accepted" {
			t.Fatalf("추가모집 합격은 낮아도 걸지 않아야 합니다: %+v", is)
		}
	}
	stats, err := dm.GetConsolidatedAdmissionStats(2027, "울산상업고", "", "일반", 1)
	if err != nil {
		t.Fatal(err)
	}
	if stats.ExtraRoundAccepted != 1 || stats.AcceptedMin != 45 {
		t.Fatalf("관내 통계: 추가모집 1명, 합격선에는 그대로 포함: %+v", stats)
	}
	// 인수인계로 넘길 때도 표시가 남는다.
	pkgs, err := dm.ExportStoredSharedPackages()
	if err != nil {
		t.Fatal(err)
	}
	kept := false
	for _, p := range pkgs {
		for _, r := range p.AnonymousRecords {
			kept = kept || r.ExtraRound
		}
	}
	if !kept {
		t.Fatal("인수인계 자료에 추가모집 표시가 남아야 합니다")
	}
}
