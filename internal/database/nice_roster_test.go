package database

import (
	"testing"

	"PHGC/internal/model"
	"PHGC/internal/parser"
)

// 지원 원서마다 나이스 대조표가 붙는다: 특성화고는 표, 일반고·마이스터고는 준비 중 안내, 다른 해 원서는 빼기.
func TestNiceRosterRowsFollowApplications(t *testing.T) {
	dm := newEvidenceTestDB(t) // 고입 연도 2027
	student := parser.StudentExcelData{
		ClassNum: 1, StudentNum: "1", Name: "가상학생",
		RawData:        `[{"학년":"1","학기":"2","과목":"국어","성취도":"B"},{"학년":"1","학기":"2","과목":"수학","성취도":"C"},{"학년":"2","학기":"1","과목":"국어","성취도":"A"},{"학년":"2","학기":"2","과목":"국어","성취도":"A"},{"학년":"3","학기":"1","과목":"국어","성취도":"A"}]`,
		AttendanceData: `[{"학년":"1","결석":"0","지각":"0","조퇴":"0","결과":"0"},{"학년":"2","결석":"0","지각":"0","조퇴":"0","결과":"0"},{"학년":"3","결석":"1","지각":"2","조퇴":"1","결과":"0"}]`,
		VolunteerData:  `[{"학년":"1","시간":"10"},{"학년":"2","시간":"10"},{"학년":"3","시간":"5"}]`,
	}
	if err := dm.SaveClassStudents(1, []parser.StudentExcelData{student}); err != nil {
		t.Fatal(err)
	}
	for _, rec := range []model.ApplicationRecord{
		{ClassNum: 1, StudentNum: "1", StudentName: "가상학생", AdmissionYear: 2027, Category: "general", Status: "지원예정"},
		{ClassNum: 1, StudentNum: "1", StudentName: "가상학생", AdmissionYear: 2027, Category: "special", SchoolName: "울산상업고등학교", Track: "취업희망자", Status: "지원희망"},
		{ClassNum: 1, StudentNum: "1", StudentName: "가상학생", AdmissionYear: 2027, Category: "meister", SchoolName: "울산마이스터고등학교", Track: "일반", Status: "지원희망"},
		{ClassNum: 1, StudentNum: "1", StudentName: "가상학생", AdmissionYear: 2026, Category: "special", SchoolName: "울산공업고등학교", Track: "일반", Status: "합격"},
	} {
		if err := dm.SaveApplication(rec); err != nil {
			t.Fatal(err)
		}
	}

	rows, err := dm.GetStudentNiceRows(1, "1", "가상학생", true)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 3 {
		t.Fatalf("2027 원서 3건만 나와야 합니다: %+v", rows)
	}
	// 정렬: 마이스터고 → 특성화고 → 일반고
	if rows[0].Category != "meister" || rows[1].Category != "special" || rows[2].Category != "general" {
		t.Fatalf("정렬 순서: %s %s %s", rows[0].Category, rows[1].Category, rows[2].Category)
	}
	special := rows[1]
	if special.NiceForm == nil {
		t.Fatalf("특성화고 원서에는 대조표가 있어야 합니다: %+v", special)
	}
	// 1-2학기: B(4)+C(3)=7, 2과목
	if got := special.NiceForm.Rows[0][2].Text + "/" + special.NiceForm.Rows[0][4].Text; got != "7/2" {
		t.Fatalf("1-2 교과성취점수/과목수: %s", got)
	}
	if rows[0].NiceForm != nil || rows[0].Note == "" || rows[2].NiceForm != nil || rows[2].Note == "" {
		t.Fatalf("마이스터고·일반고는 준비 중 안내만: %+v / %+v", rows[0], rows[2])
	}

	roster, err := dm.GetNiceRoster(0, true)
	if err != nil || len(roster) != 3 {
		t.Fatalf("전교 일람표: %d건 %v", len(roster), err)
	}
	if roster[1].NiceForm == nil || roster[1].StudentName != "가상학생" {
		t.Fatalf("일람표 특성화고 줄: %+v", roster[1])
	}
}
