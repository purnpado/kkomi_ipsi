package calc

import (
	"testing"

	"PHGC/internal/parser"
)

func nonAcademicFor(t *testing.T, attendance, volunteer, extra string) (generalNonAcademic, bool) {
	t.Helper()
	s := parser.StudentExcelData{ClassNum: 1, StudentNum: "1", Name: "가", AttendanceData: attendance, VolunteerData: volunteer, ExtraData: extra}
	all := map[int][]parser.StudentExcelData{1: {s}}
	return calculateGeneralNonAcademic(all, StudentCalcResult{ClassNum: 1, StudentNum: "1", Name: "가"})
}

// 봉사는 학년별 4시간까지만 인정: 1학년에만 12시간이면 2(기본) + 2 = 4점이다.
func TestGeneralVolunteerIsCappedPerGrade(t *testing.T) {
	r, _ := nonAcademicFor(t, `{}`, `{"total_time":12}`, `{"general_volunteer_1":12,"general_volunteer_2":0,"general_volunteer_3":0}`)
	if r.VolunteerScore != 4 {
		t.Fatalf("학년별 봉사 = %.2f, want 4.00", r.VolunteerScore)
	}
	// 학년별 값이 없으면 누적 12시간을 학년마다 4시간으로 나눈 예상치(만점 8)
	r, _ = nonAcademicFor(t, `{}`, `{"total_time":12}`, `{}`)
	if r.VolunteerScore != 8 {
		t.Fatalf("누적 분배 봉사 = %.2f, want 8.00", r.VolunteerScore)
	}
	// 6시간(학년당 2시간) → 2 + 1.4×3 = 6.2
	r, _ = nonAcademicFor(t, `{}`, `{"total_time":6}`, `{}`)
	if r.VolunteerScore != 6.2 {
		t.Fatalf("6시간 분배 봉사 = %.2f, want 6.20", r.VolunteerScore)
	}
}

// 출결은 학년별 8일 이상이면 그 학년만 0점: 한 학년 10일 결석 → 4 + 0 + 4 + 4 = 12점.
func TestGeneralAttendancePerGrade(t *testing.T) {
	r, _ := nonAcademicFor(t, `{"1_absence":10,"2_absence":0,"3_absence":0}`, `{}`, `{}`)
	if r.AttendanceScore != 12 {
		t.Fatalf("나이스 학년별 출결 = %.2f, want 12.00", r.AttendanceScore)
	}
	// 학년별 지각 등은 학년마다 3회 = 1일(2회 이하 버림)
	r, _ = nonAcademicFor(t, `{"1_late":2,"2_late":2,"3_late":3}`, `{}`, `{}`)
	if r.AttendanceScore != 15.5 {
		t.Fatalf("학년별 지각 환산 출결 = %.2f, want 15.50", r.AttendanceScore)
	}
}

// 가산점 입력을 마치지 않으면 빈 칸 전부가 상한 범위에 들어가고, 마치면 3학년 빈 칸만 남는다.
func TestGeneralPendingBonusRange(t *testing.T) {
	r, complete := nonAcademicFor(t, `{}`, `{}`, `{"haengbal_1":true}`)
	if complete || r.PendingBonus != 5 || r.BehaviorScore != 6 {
		t.Fatalf("미입력: 남은 가산=%.0f 행발=%.0f complete=%v", r.PendingBonus, r.BehaviorScore, complete)
	}
	r, _ = nonAcademicFor(t, `{}`, `{}`, `{"general_bonus_entered":true,"haengbal_1":true}`)
	if r.PendingBonus != 2 {
		t.Fatalf("입력 완료 후 남은 가산(3학년 2칸) = %.0f, want 2", r.PendingBonus)
	}
	full := `{"general_bonus_entered":true,"general_absence_1":0,"general_absence_2":0,"general_absence_3":0,"general_volunteer_1":4,"general_volunteer_2":4,"general_volunteer_3":4}`
	r, complete = nonAcademicFor(t, `{}`, `{}`, full)
	if !complete || r.PendingBonus != 0 || r.Total != 34 {
		t.Fatalf("확정: complete=%v 남은 가산=%.0f 합계=%.2f(want 34)", complete, r.PendingBonus, r.Total)
	}
}

// 요강 예시 1: 1학년 봉사 실적이 없고(중도 입국) 2학년 4시간, 3학년 3시간이면
// 1학년 환산 시수 = 4 × (4+3) ÷ 8 = 3.5시간 → 1.7점. 봉사 = 2 + 1.7 + 2.0 + 1.7 = 7.4점.
func TestGeneralVolunteerConvertedForMissingGrade(t *testing.T) {
	s := parser.StudentExcelData{ClassNum: 1, StudentNum: "1", Name: "가",
		AttendanceData: `{"2_absence":0,"3_absence":0}`, VolunteerData: `{"2_time":4,"3_time":3,"total_time":7}`, ExtraData: `{}`}
	all := map[int][]parser.StudentExcelData{1: {s}}
	target := StudentCalcResult{ClassNum: 1, StudentNum: "1", Name: "가", gradePresent: [3]bool{false, true, true}}
	r, _ := calculateGeneralNonAcademic(all, target)
	if r.VolunteerScore != 7.4 {
		t.Fatalf("환산 봉사 = %.2f, want 7.40", r.VolunteerScore)
	}
	// 요강 예시 2: 1·2학년 실적이 없고 3학년 3시간 → 1·2학년 각 3시간 환산 → 2 + 1.7×3 = 7.1
	s.AttendanceData, s.VolunteerData = `{"3_absence":0}`, `{"3_time":3,"total_time":3}`
	all = map[int][]parser.StudentExcelData{1: {s}}
	target.gradePresent = [3]bool{false, false, true}
	if r, _ = calculateGeneralNonAcademic(all, target); r.VolunteerScore != 7.1 {
		t.Fatalf("두 학년 환산 봉사 = %.2f, want 7.10", r.VolunteerScore)
	}
}
