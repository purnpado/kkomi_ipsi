package database

import (
	"errors"
	"testing"

	"PHGC/internal/model"
)

// 이중지원 금지: 합격·최종 진학·등록 포기 원서가 있는 학생은 그해 새 원서를 넣을 수 없다.
func TestDoubleApplyBlocksNewApplication(t *testing.T) {
	app := func(category, school, track, status string) model.ApplicationRecord {
		return model.ApplicationRecord{ClassNum: 1, StudentNum: "1", StudentName: "가상학생", AdmissionYear: 2027, Category: category, SchoolName: school, Track: track, Status: status}
	}
	tests := []struct {
		name    string
		first   model.ApplicationRecord
		next    model.ApplicationRecord
		blocked bool
	}{
		{"합격 뒤 다른 학교 지원", app("meister", "울산마이스터고등학교", "일반", "합격"), app("special", "울산공업고등학교", "일반", "지원완료"), true},
		{"등록 포기 뒤 다른 학교 지원", app("special", "울산상업고등학교", "일반", "포기"), app("general", "", generalTrack, "지원예정"), true},
		{"최종 진학 뒤 같은 학교 다른 전형", app("meister", "울산마이스터고등학교", "일반", "최종 진학"), app("meister", "울산마이스터고등학교", "특별", "지원희망"), true},
		{"합격 뒤 다른 학교 합격으로 새로", app("special", "울산상업고등학교", "일반", "합격"), app("special", "울산공업고등학교", "일반", "합격"), true},
		{"합격 학생의 지난 불합격 원서 기록", app("special", "울산상업고등학교", "일반", "합격"), app("general", "", generalTrack, "불합격"), false},
		{"불합격만 있으면 추가모집 지원 가능", app("general", "", generalTrack, "불합격"), app("special", "울산공업고등학교", "일반", "지원완료"), false},
		{"결과 기다리는 학생은 다른 구분 지원 가능", app("meister", "울산마이스터고등학교", "일반", "지원완료"), app("self_foreign", "현대청운고등학교", "해당 없음", "지원희망"), false},
		{"미진학은 막는 대상이 아님", app("none", "미진학", "", "미진학"), app("general", "", generalTrack, "지원예정"), false},
		{"다른 학년도는 상관없음", func() model.ApplicationRecord {
			r := app("special", "울산상업고등학교", "일반", "합격")
			r.AdmissionYear = 2026
			return r
		}(), app("special", "울산공업고등학교", "일반", "지원완료"), false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			dm := newEvidenceTestDB(t)
			if err := dm.SaveApplication(tt.first); err != nil {
				t.Fatal(err)
			}
			err := dm.SaveApplication(tt.next)
			if tt.blocked != (err != nil) {
				t.Fatalf("막힘 기대 %v, 결과 %v", tt.blocked, err)
			}
			if tt.blocked && !errors.Is(err, ErrDoubleApply) {
				t.Fatalf("이중지원 금지 오류여야 합니다: %v", err)
			}
		})
	}
}

// 합격 학생도 이미 있는 원서는 고칠 수 있다(배정 학과, 합격 → 최종 진학, 등록 포기).
func TestDoubleApplyAllowsEditingExisting(t *testing.T) {
	dm := newEvidenceTestDB(t)
	r := model.ApplicationRecord{ClassNum: 1, StudentNum: "1", StudentName: "가상학생", AdmissionYear: 2027, Category: "special", SchoolName: "울산상업고등학교", Track: "일반", Status: "합격", Preferences: []string{"회계과"}}
	if err := dm.SaveApplication(r); err != nil {
		t.Fatal(err)
	}
	for _, status := range []string{"최종 진학", "포기"} {
		r.Status = status
		r.AssignedDepartment = "회계과"
		if err := dm.SaveApplication(r); err != nil {
			t.Fatalf("%s로 고치기: %v", status, err)
		}
	}
}
