package database

import (
	"testing"

	"PHGC/internal/model"
)

func TestOurSchoolAnalysisAggregatesTracksAndDepartments(t *testing.T) {
	dm := newEvidenceTestDB(t)
	for _, rec := range []model.ApplicationRecord{
		{ClassNum: 1, StudentNum: "1", StudentName: "가상1", AdmissionYear: 2027, Category: "special", SchoolName: "울산공업고", Track: "취업희망자", Status: "합격", Score: 90, Preferences: []string{"기계과"}, AssignedDepartment: "기계과"},
		{ClassNum: 1, StudentNum: "2", StudentName: "가상2", AdmissionYear: 2027, Category: "special", SchoolName: "울산공업고등학교", Track: "취업희망자전형", Status: "합격", Score: 80, Preferences: []string{"전기과"}, AssignedDepartment: "전기과"},
		{ClassNum: 1, StudentNum: "3", StudentName: "가상3", AdmissionYear: 2027, Category: "special", SchoolName: "울산공업고", Track: "일반", Status: "합격", Score: 70, Preferences: []string{"기계과"}, AssignedDepartment: "기계과"},
	} {
		if err := dm.SaveApplication(rec); err != nil {
			t.Fatal(err)
		}
	}
	all, err := dm.GetOurSchoolAnalysisStats(2027, "울산공업고등학교", "", "취업희망자전형", 1)
	if err != nil || all == nil || all.TotalApplicants != 2 || all.AcceptedCount != 2 || all.AcceptedMin != 80 || all.AcceptedMax != 90 {
		t.Fatalf("전형별 전체 집계: %+v %v", all, err)
	}
	dept, err := dm.GetOurSchoolAnalysisStats(2027, "울산공업고", "기계과", "취업", 1)
	if err != nil || dept == nil || dept.TotalApplicants != 1 || dept.AcceptedMin != 90 {
		t.Fatalf("학과 집계: %+v %v", dept, err)
	}
	if empty, err := dm.GetOurSchoolAnalysisStats(2026, "울산공업고", "", "취업", 1); err != nil || empty != nil {
		t.Fatalf("자료 없음: %+v %v", empty, err)
	}
}

func TestConsolidatedAnalysisNoDataIsNotError(t *testing.T) {
	dm := newEvidenceTestDB(t)
	result, err := dm.GetConsolidatedAdmissionStats(2027, "울산마이스터고", "", "특별전형", 1)
	if err != nil || result != nil {
		t.Fatalf("자료가 없는 정상 상태: %+v %v", result, err)
	}
}

func TestConsolidatedAnalysisKeepsSpecialAndEmploymentTracksSeparate(t *testing.T) {
	dm := newEvidenceTestDB(t)
	if err := dm.InitSharedDatabaseTables(); err != nil {
		t.Fatal(err)
	}
	db, err := dm.OpenDB(dm.GetConfigDBPath())
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(`INSERT INTO shared_participating_schools (id, school_name, admission_year) VALUES (1, '가상중학교', 2027)`)
	if err == nil {
		_, err = db.Exec(`INSERT INTO shared_anonymous_scores (school_pkg_id, admission_year, high_school, department, track, preference_rank, status, score, score_basis)
			VALUES (1, 2027, '울산공업고', '기계과', '취업희망자', 1, '합격', 90, '총점'),
			       (1, 2027, '울산공업고', '기계과', '특별', 1, '합격', 50, '총점')`)
	}
	db.Close()
	if err != nil {
		t.Fatal(err)
	}
	job, err := dm.GetConsolidatedAdmissionStats(2027, "울산공업고", "", "취업희망자전형", 1)
	if err != nil || job == nil || job.AcceptedMin != 90 || job.TotalApplicants != 1 {
		t.Fatalf("취업희망자 전형: %+v %v", job, err)
	}
	special, err := dm.GetConsolidatedAdmissionStats(2027, "울산공업고", "", "특별전형", 1)
	if err != nil || special == nil || special.AcceptedMin != 50 || special.TotalApplicants != 1 {
		t.Fatalf("특별 전형: %+v %v", special, err)
	}
}
