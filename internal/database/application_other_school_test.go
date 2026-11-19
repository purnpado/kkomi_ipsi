package database

import (
	"testing"

	"PHGC/internal/model"
)

func TestOtherSchoolNameEditPreservesRecordAndMemo(t *testing.T) {
	dm := newEvidenceTestDB(t)
	rec := model.ApplicationRecord{ClassNum: 1, StudentNum: "1", StudentName: "가상학생", AdmissionYear: 2027, Category: "other", SchoolName: "타시도 고등학교", Track: "해당 없음", Status: "지원완료", ScoreBasis: "제주서귀포고등학교"}
	if err := dm.SaveApplication(rec); err != nil {
		t.Fatal(err)
	}
	before, err := dm.GetStudentApplications(1, "1", "가상학생")
	if err != nil || len(before) != 1 {
		t.Fatalf("기존 원서: %+v %v", before, err)
	}
	rec.ID = before[0].ID
	rec.SchoolName = "제주서귀포고등학교"
	if err := dm.SaveApplication(rec); err != nil {
		t.Fatal(err)
	}
	after, err := dm.GetStudentApplications(1, "1", "가상학생")
	if err != nil || len(after) != 1 || after[0].ID != rec.ID || after[0].SchoolName != rec.SchoolName || after[0].ScoreBasis != "제주서귀포고등학교" {
		t.Fatalf("학교명 수정 후: %+v %v", after, err)
	}
	other := rec
	other.ID, other.SchoolName = 0, "다른고등학교"
	if err := dm.SaveApplication(other); err != nil {
		t.Fatal(err)
	}
	rec.SchoolName = other.SchoolName
	if err := dm.SaveApplication(rec); err == nil {
		t.Fatal("동일한 원서로 덮어쓰기를 허용함")
	}
	after, err = dm.GetStudentApplications(1, "1", "가상학생")
	if err != nil || len(after) != 2 {
		t.Fatalf("중복 충돌 이후 기록: %+v %v", after, err)
	}
}

// 예전에 기타 구분으로 저장한 타시도 원서를 타시도 구분으로 바꾸면 새 원서를 만들지 않고 그 원서를 고친다.
func TestOtherToOutProvinceKeepsRecord(t *testing.T) {
	dm := newEvidenceTestDB(t)
	rec := model.ApplicationRecord{ClassNum: 1, StudentNum: "2", StudentName: "가상둘", AdmissionYear: 2027, Category: "other", SchoolName: "제주서귀포고등학교", Track: "해당 없음", Status: "합격", ScoreBasis: "메모"}
	if err := dm.SaveApplication(rec); err != nil {
		t.Fatal(err)
	}
	before, _ := dm.GetStudentApplications(1, "2", "가상둘")
	rec.ID, rec.Category = before[0].ID, "out_province"
	if err := dm.SaveApplication(rec); err != nil {
		t.Fatal(err)
	}
	after, err := dm.GetStudentApplications(1, "2", "가상둘")
	if err != nil || len(after) != 1 || after[0].ID != rec.ID || after[0].Category != "out_province" || after[0].ScoreBasis != "메모" {
		t.Fatalf("구분 변경 후: %+v %v", after, err)
	}
	// 새 타시도 원서: 학교명이 꼭 있어야 하고, 학과 지망도 적을 수 있다(타시도 마이스터고·특성화고).
	if err := dm.SaveApplication(model.ApplicationRecord{ClassNum: 1, StudentNum: "3", StudentName: "가상셋", AdmissionYear: 2027, Category: "out_province", Track: "해당 없음", Status: "지원완료"}); err == nil {
		t.Fatal("학교명 없는 타시도 원서를 허용함")
	}
	if err := dm.SaveApplication(model.ApplicationRecord{ClassNum: 1, StudentNum: "3", StudentName: "가상셋", AdmissionYear: 2027, Category: "out_province", SchoolName: "경기기계공업고등학교", Track: "해당 없음", Status: "지원완료", Preferences: []string{"기계과"}}); err != nil {
		t.Fatalf("타시도 원서 저장: %v", err)
	}
}
