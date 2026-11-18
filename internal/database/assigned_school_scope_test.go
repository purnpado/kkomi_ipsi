package database

import (
	"testing"

	"PHGC/internal/model"
)

func TestAssignedSchoolRespectsRecordAndClosedYear(t *testing.T) {
	dm := newEvidenceTestDB(t)
	for _, year := range []int{2026, 2027} {
		r := model.ApplicationRecord{ClassNum: 1, StudentNum: "1", StudentName: "가상학생", AdmissionYear: year, Category: "general", Track: "후기 일반계고", Status: "지원완료"}
		if err := dm.SaveApplication(r); err != nil {
			t.Fatal(err)
		}
	}
	records, err := dm.GetStudentApplications(1, "1", "가상학생")
	if err != nil || len(records) != 2 {
		t.Fatalf("records: %+v %v", records, err)
	}
	ids := map[int]int{}
	for _, r := range records {
		ids[r.AdmissionYear] = r.ID
	}
	if err := dm.UpdateAssignedSchoolForRecord(1, "1", "가상학생", 2027, ids[2027], "가상고"); err != nil {
		t.Fatal(err)
	}
	records, err = dm.GetStudentApplications(1, "1", "가상학생")
	if err != nil {
		t.Fatal(err)
	}
	for _, r := range records {
		if r.AdmissionYear == 2026 && r.AssignedSchool != "" {
			t.Fatalf("다른 학년도 변경: %+v", r)
		}
		if r.AdmissionYear == 2027 && r.AssignedSchool != "가상고" {
			t.Fatalf("배정학교 누락: %+v", r)
		}
	}
	config, err := dm.OpenDB(dm.GetConfigDBPath())
	if err != nil {
		t.Fatal(err)
	}
	if _, err := config.Exec(`INSERT INTO admission_closures(admission_year,status) VALUES(2027,'closed')`); err != nil {
		t.Fatal(err)
	}
	config.Close()
	if err := dm.UpdateAssignedSchoolForRecord(1, "1", "가상학생", 2027, ids[2027], "다른고"); err == nil {
		t.Fatal("확정 학년도 수정 허용")
	}
}
