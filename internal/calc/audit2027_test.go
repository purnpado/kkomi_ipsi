package calc

import (
	"encoding/json"
	"testing"

	"PHGC/internal/parser"
)

// 2027학년도 최종 요강 대조(docs/admission-score-audit-plan.md 9장 D1~D6) 회귀 테스트.

func findRule(t *testing.T, school, track string) SchoolRule {
	t.Helper()
	for _, rule := range AllSchoolRules {
		if rule.SchoolName == school && rule.TrackName == track {
			return rule
		}
	}
	t.Fatalf("규칙 없음: %s/%s", school, track)
	return SchoolRule{}
}

func gradeRows(t *testing.T, rows [][3]string) string {
	t.Helper()
	out := make([]map[string]string, 0, len(rows))
	for _, r := range rows {
		out = append(out, map[string]string{"학년": r[0], "학기": r[1], "과목": "국어" + r[0] + r[1] + r[2], "성취도": r[2]})
	}
	b, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

// D1: 3학년 2학기 성적이 있으면 S22에 그 성적을 쓰고, 없으면 3-1로 대신한다.
func TestGeneralUsesThirdYearSecondSemester(t *testing.T) {
	base := [][3]string{{"1", "1", "A"}, {"2", "1", "A"}, {"2", "2", "A"}, {"3", "1", "A"}}
	withFinal := append(append([][3]string{}, base...), [3]string{"3", "2", "C"})
	got, err := calcSingleStudent(parser.StudentExcelData{RawData: gradeRows(t, withFinal)})
	if err != nil {
		t.Fatal(err)
	}
	if got.S22 != 23.52 { // 3-2 평균 C(3) × 7.84
		t.Fatalf("3-2 반영 S22 = %.2f, want 23.52", got.S22)
	}
	projected, _ := calcSingleStudent(parser.StudentExcelData{RawData: gradeRows(t, base)})
	if projected.S22 != projected.S21 {
		t.Fatalf("3-2 전 예상치는 S21과 같아야 함: S22=%.2f S21=%.2f", projected.S22, projected.S21)
	}
}

// D1 보완: 일부 학생만 3-2 성적이 있으면 학교 전체를 3-1 복사 예상치로 계산하고,
// 모든 학생에게 3-2가 있을 때만 실제 3-2를 반영한다.
func TestGeneralThirdYearFinalAppliedSchoolWide(t *testing.T) {
	base := [][3]string{{"1", "1", "A"}, {"2", "1", "A"}, {"2", "2", "A"}, {"3", "1", "A"}}
	withFinal := append(append([][3]string{}, base...), [3]string{"3", "2", "C"})
	mixed := map[int][]parser.StudentExcelData{1: {
		{ClassNum: 1, StudentNum: "1", Name: "가", RawData: gradeRows(t, withFinal)},
		{ClassNum: 1, StudentNum: "2", Name: "나", RawData: gradeRows(t, base)},
	}}
	results, err := CalculateGrades(mixed, false)
	if err != nil {
		t.Fatal(err)
	}
	for _, r := range results {
		if r.ThirdYearFinalUsed || r.S22 != r.S21 {
			t.Fatalf("일부만 3-2가 있으면 전원 예상치여야 함: %s S22=%.2f S21=%.2f", r.Name, r.S22, r.S21)
		}
	}
	complete := map[int][]parser.StudentExcelData{1: {
		{ClassNum: 1, StudentNum: "1", Name: "가", RawData: gradeRows(t, withFinal)},
		{ClassNum: 1, StudentNum: "2", Name: "나", RawData: gradeRows(t, withFinal)},
	}}
	results, err = CalculateGrades(complete, false)
	if err != nil {
		t.Fatal(err)
	}
	for _, r := range results {
		if !r.ThirdYearFinalUsed || r.S22 != 23.52 {
			t.Fatalf("전원 3-2가 있으면 실제 3-2 반영: %s S22=%.2f", r.Name, r.S22)
		}
	}
}

// D4: 성적이 없는 학기는 같은 학년 다른 학기 성적으로 인정한다.
func TestGeneralSiblingSemesterSubstitution(t *testing.T) {
	rows := [][3]string{{"1", "1", "A"}, {"2", "2", "B"}, {"3", "1", "A"}}
	got, err := calcSingleStudent(parser.StudentExcelData{RawData: gradeRows(t, rows)})
	if err != nil {
		t.Fatal(err)
	}
	if got.S12 != got.S13 || got.S12 == 0 {
		t.Fatalf("2-1은 2-2 성적으로 인정해야 함: S12=%.2f S13=%.2f", got.S12, got.S13)
	}
}

// D2: 현대공업고는 지각·조퇴·결과를 1회당 2점만 감점한다(3회=1일 환산 이중 감점 금지).
func TestHyundaiTechAttendanceNoDoubleCount(t *testing.T) {
	rule := findRule(t, "현대공업고", "일반")
	student := &StudentFullData{SemesterScores: map[string][]int{}, RawAbsenceDays: 1, RawLateCount: 3, AbsenceDays: 2}
	if got := calculateForSchool(student, rule).AttendanceScore; got != 18 { // 30 − 6 − 3×2
		t.Fatalf("현대공고 출결 = %.2f, want 18.00", got)
	}
	sept := &StudentFullData{SemesterScores: map[string][]int{}, HasSeptAbsence: true, SeptAbsenceDays: 0, SeptLateEtc: 4}
	if got := calculateForSchool(sept, rule).AttendanceScore; got != 22 { // 30 − 4×2
		t.Fatalf("현대공고 9/30 수기 출결 = %.2f, want 22.00", got)
	}
	// 다른 학교는 기존처럼 3회=결석 1일 환산(울산마이스터고 일반: 80 − 2일×8)
	meister := findRule(t, "울산마이스터고", "일반")
	if got := calculateForSchool(student, meister).AttendanceScore; got != 64 {
		t.Fatalf("마이스터고 출결 = %.2f, want 64.00", got)
	}
}

// D3: 울산마이스터고는 1-2가 자유학기면 1-1 성적을 반영한다.
func TestMeisterUsesFirstSemesterWhenSecondIsFree(t *testing.T) {
	rule := findRule(t, "울산마이스터고", "일반")
	student := &StudentFullData{SemesterScores: map[string][]int{
		"1_1": {1, 1}, "2_1": {5, 5}, "2_2": {5, 5}, "3_1": {5, 5},
	}}
	// 평균 (2+10+10+10)/8 = 4 → 4/5 × 150 = 120
	if got := calculateForSchool(student, rule).AllSubjectScore; got != 120 {
		t.Fatalf("마이스터고 전과목 = %.2f, want 120.00", got)
	}
}

// D5: 울산에너지고는 2학년 성적이 통째로 없으면 2-1←1-1, 2-2←1-2로 인정한다.
func TestEnergyWholeSecondYearSubstitution(t *testing.T) {
	rule := findRule(t, "울산에너지고", "일반")
	student := &StudentFullData{SemesterScores: map[string][]int{"1_1": {5}, "1_2": {1}, "3_1": {5}}, ArtPenaltyBySemester: map[string]float64{}}
	if got := ruleSemesterSource(student, rule, "2_1"); got != "1_1" {
		t.Fatalf("에너지고 2-1 대체 = %s, want 1_1", got)
	}
	if got := ruleSemesterSource(student, rule, "2_2"); got != "1_2" {
		t.Fatalf("에너지고 2-2 대체 = %s, want 1_2", got)
	}
}

// D6: 현대공업고 대체 인정 학기에도 원래 학기의 예체능 감점을 적용한다.
func TestHyundaiTechSubstitutedSemesterArtPenalty(t *testing.T) {
	rule := findRule(t, "현대공업고", "일반")
	scores := map[string][]int{"1_1": {5}, "2_1": {5}, "2_2": {5}, "3_1": {5}}
	student := &StudentFullData{
		SemesterScores: scores, NonArtSemesterScores: scores,
		ArtPenaltyBySemester: map[string]float64{"1_1": 0.2},
	}
	if got := calculateForSchool(student, rule).AllSubjectScore; got != 99.8 {
		t.Fatalf("현대공고 전과목(1-1 대체·감점 0.2) = %.2f, want 99.80", got)
	}
}

// 1차·2차 단계 구분은 요강에서 배수를 확인한 학교·전형에만 적용한다.
func TestAdmissionStagesFromGuidelines(t *testing.T) {
	cases := []struct {
		school, track string
		two           bool
		mult          float64
	}{
		{"울산마이스터고등학교", "특별", true, 1.3},
		{"울산에너지고등학교", "일반전형", true, 1.3},
		{"현대공업고등학교", "일반", true, 1.3},
		{"울산상업고등학교", "취업희망자", true, 1.5},
		{"울산공업고등학교", "취업자 특별전형", true, 1.5},
		{"울산기술공업고등학교", "취업희망자", false, 0}, // 면접 점수 미반영
		{"울산상업고등학교", "일반", false, 0},      // 특성화고 일반전형은 단일 전형
	}
	for _, c := range cases {
		if got := HasSecondStage(c.school, c.track); got != c.two {
			t.Errorf("%s/%s 2단계=%v, want %v", c.school, c.track, got, c.two)
		}
		if s, _ := FindAdmissionStage(c.school, c.track); s.Multiplier != c.mult {
			t.Errorf("%s/%s 배수=%.1f, want %.1f", c.school, c.track, s.Multiplier, c.mult)
		}
	}
}

// 한 학년 기록이 없으면 낮은 학년 두 학기 × 6.4 + 높은 학년 두 학기 × 9.6,
// 두 학년이 없으면 남은 학년 두 학기 × 16. 전 과목 A는 어느 경우든 160점 만점(교과점수 총점 160).
func TestGeneralMissingGradeFormula(t *testing.T) {
	cases := []struct {
		name string
		rows [][3]string
	}{
		{"정상(1-1 자유학기)", [][3]string{{"1", "2", "A"}, {"2", "1", "A"}, {"2", "2", "A"}, {"3", "1", "A"}, {"3", "2", "A"}}},
		{"1학년 없음", [][3]string{{"2", "1", "A"}, {"2", "2", "A"}, {"3", "1", "A"}, {"3", "2", "A"}}},
		{"2학년 2학기부터", [][3]string{{"2", "2", "A"}, {"3", "1", "A"}, {"3", "2", "A"}}},
		{"1·2학년 없음", [][3]string{{"3", "1", "A"}, {"3", "2", "A"}}},
	}
	for _, c := range cases {
		got, err := calcSingleStudent(parser.StudentExcelData{RawData: gradeRows(t, c.rows)})
		if err != nil {
			t.Fatal(err)
		}
		if got.TotalSubjectScore != 160 {
			t.Errorf("%s: 교과점수 총점 = %.2f, want 160", c.name, got.TotalSubjectScore)
		}
	}
	// 1학년 없음 + 2학년 B(4), 3학년 A(5): 4×6.4×2 + 5×9.6×2 = 51.2 + 96 = 147.2
	got, _ := calcSingleStudent(parser.StudentExcelData{RawData: gradeRows(t, [][3]string{{"2", "1", "B"}, {"2", "2", "B"}, {"3", "1", "A"}, {"3", "2", "A"}})})
	if got.TotalSubjectScore != 147.2 {
		t.Fatalf("40/60 가중 = %.2f, want 147.20", got.TotalSubjectScore)
	}
}
