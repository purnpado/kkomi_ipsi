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
