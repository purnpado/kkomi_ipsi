package database

import (
	"testing"

	"PHGC/internal/model"
	"PHGC/internal/parser"
)

// 나이스 대조표는 그 해의 마이스터고·특성화고·후기 일반고 원서에 붙는다(다른 해 원서는 빼기).
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
		{ClassNum: 1, StudentNum: "1", StudentName: "가상학생", AdmissionYear: 2027, Category: "meister", SchoolName: "울산마이스터고등학교", Track: "일반", Status: "불합격"}, // 마이스터고 불합격 뒤 특성화고(이중지원 예외)
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
	if len(rows) != 3 || rows[0].Category != "meister" || rows[1].Category != "special" || rows[2].Category != "general" {
		t.Fatalf("2027 원서 3건(마이스터고·특성화고·일반고 순)이 나와야 합니다: %+v", rows)
	}
	for _, r := range rows {
		if r.NiceForm == nil {
			t.Fatalf("%s 원서에 대조표가 없습니다: %+v", r.Category, r)
		}
	}
	special := rows[1]
	if special.NiceForm == nil {
		t.Fatalf("특성화고 원서에는 대조표가 있어야 합니다: %+v", special)
	}
	// 1-2학기: B(4)+C(3)=7, 2과목
	if got := special.NiceForm.Rows[0][2].Text + "/" + special.NiceForm.Rows[0][4].Text; got != "7/2" {
		t.Fatalf("1-2 교과성취점수/과목수: %s", got)
	}
	// 원서 입력 창: 저장하지 않은 학교·전형 하나(이름 표기가 달라도 산출 규칙으로 맞춤)
	row, err := dm.GetApplicationNiceRow(1, "1", "가상학생", true, "special", "울산상업고등학교", "취업희망자 특별전형")
	if err != nil || row.NiceForm == nil || row.NiceForm.Rows[0][2].Text != "7" {
		t.Fatalf("원서 입력 창 특성화고 대조표: %+v %v", row, err)
	}
	if row, err := dm.GetApplicationNiceRow(1, "1", "가상학생", true, "meister", "울산마이스터고등학교", "일반"); err != nil || row.NiceForm == nil || row.NiceForm.Type != "meister" {
		t.Fatalf("원서 입력 창 마이스터고 대조표: %+v %v", row, err)
	}
	general, err := dm.GetApplicationNiceRow(1, "1", "가상학생", true, "general", "", "")
	if err != nil || general.NiceForm == nil || general.NiceForm.Type != "general" {
		t.Fatalf("원서 입력 창 일반고 대조표: %+v %v", general, err)
	}
	// 일반고 1-2학기(예체능 포함): B(4)+C(3)=7, 2과목 → 첫 줄 두 번째 학기 칸
	if got := general.NiceForm.Rows[0][7].Text + "/" + general.NiceForm.Rows[0][9].Text; got != "7/2" {
		t.Fatalf("일반고 1-2 교과성취점수/과목수: %s", got)
	}
	// 교과 3줄(한 줄에 두 학기) + 결석 환산·봉사·행동특성·창체 가산(학년별) 4줄
	if len(general.NiceForm.Rows) != 7 || general.NiceForm.Rows[6][0].Text != "창의체험" || general.NiceForm.Rows[3][0].Text != "결석 환산(일)" {
		t.Fatalf("일반고 대조표 줄: %+v", general.NiceForm.Rows)
	}
	roster, err := dm.GetNiceRoster(0, true)
	if err != nil || len(roster) != 3 {
		t.Fatalf("전교 일람표: %d건 %v", len(roster), err)
	}
	if roster[1].NiceForm == nil || roster[1].StudentName != "가상학생" {
		t.Fatalf("일람표 특성화고 줄: %+v", roster[1])
	}
}
