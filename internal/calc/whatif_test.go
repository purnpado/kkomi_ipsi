package calc

import (
	"encoding/json"
	"strings"
	"testing"

	"PHGC/internal/parser"
)

func whatIfStudent(semesters []string, achieve string) parser.StudentExcelData {
	var rows []map[string]string
	for _, sem := range semesters {
		p := strings.Split(sem, "_")
		for _, sub := range []string{"국어", "수학", "영어", "기술가정", "체육"} {
			rows = append(rows, map[string]string{"학년": p[0], "학기": p[1], "과목": sub, "성취도": achieve})
		}
	}
	b, _ := json.Marshal(rows)
	return parser.StudentExcelData{ClassNum: 1, StudentNum: "1", Name: "가상", RawData: string(b),
		AttendanceData: `{"absence":1,"1_absence":1,"2_absence":0,"3_absence":0}`,
		VolunteerData:  `{"total_time":6,"1_time":4,"2_time":2,"3_time":0}`,
		ExtraData:      `{"leadership_terms":1}`}
}

func schoolScore(t *testing.T, s parser.StudentExcelData, school, track string) float64 {
	t.Helper()
	full, err := ParseStudentFullData(s)
	if err != nil {
		t.Fatal(err)
	}
	for _, r := range full.SchoolResults {
		if r.SchoolName == school && r.TrackName == track {
			return r.TotalScore
		}
	}
	t.Fatalf("결과 없음 %s %s", school, track)
	return 0
}

func TestWhatIfKeepsOriginalAndNoChangeWhenEmpty(t *testing.T) {
	s := whatIfStudent([]string{"1_2", "2_1", "2_2"}, "B")
	orig := s
	out, notes := ApplyWhatIf(s, WhatIfInput{LeadershipTerms: -1})
	if s != orig {
		t.Fatal("원본이 바뀜")
	}
	if len(notes) != 0 || out.RawData != s.RawData || out.AttendanceData != s.AttendanceData {
		t.Fatalf("가정값이 없는데 자료가 바뀜: %v", notes)
	}
	if schoolScore(t, out, "울산마이스터고", "일반") != schoolScore(t, s, "울산마이스터고", "일반") {
		t.Fatal("점수가 바뀜")
	}
}

func TestWhatIfRemainingSemesterAndNonAcademic(t *testing.T) {
	s := whatIfStudent([]string{"1_2", "2_1", "2_2"}, "B")
	base := schoolScore(t, s, "울산마이스터고", "일반")

	up, notes := ApplyWhatIf(s, WhatIfInput{RemainingStep: 1, LeadershipTerms: -1})
	if len(notes) == 0 || !strings.Contains(notes[0], "3-1 성적이 없어 작년(2학년) 성적을 1단계 올려") {
		t.Fatalf("안내: %v", notes)
	}
	if got := schoolScore(t, up, "울산마이스터고", "일반"); got <= base {
		t.Fatalf("남은 학기 한 단계 올림인데 점수가 오르지 않음: %v → %v", base, got)
	}
	// 예체능은 A·B·C 안에서만 바뀐다.
	down, _ := ApplyWhatIf(whatIfStudent([]string{"1_2", "2_1", "2_2"}, "C"), WhatIfInput{RemainingStep: -2, LeadershipTerms: -1})
	for _, r := range gradedRecords(down.RawData) {
		if r.grade == "3" && r.subject == "체육" && r.score < 3 {
			t.Fatalf("예체능이 C 아래로 내려감: %+v", r)
		}
	}

	// 결석 3일: 마이스터고 일반은 1일당 8점 감점
	abs, _ := ApplyWhatIf(s, WhatIfInput{FutureAbsence: 3, LeadershipTerms: -1})
	if diff := base - schoolScore(t, abs, "울산마이스터고", "일반"); diff != 24 {
		t.Fatalf("결석 3일 감점 %v (기대 24)", diff)
	}
	if !strings.Contains(abs.AttendanceData, `"3_absence":3`) {
		t.Fatalf("3학년 결석에 더해지지 않음: %s", abs.AttendanceData)
	}

	// 봉사 6시간 더해 12시간 → 마이스터고 일반 봉사 만점(20)
	vol, _ := ApplyWhatIf(s, WhatIfInput{AddVolunteer: 6, LeadershipTerms: -1})
	full, _ := ParseStudentFullData(vol)
	if full.TotalVolunteerHours != 12 {
		t.Fatalf("봉사 시간 %d (기대 12)", full.TotalVolunteerHours)
	}

	// 리더십 4학기 → 에너지고 리더십 10점
	lead, _ := ApplyWhatIf(s, WhatIfInput{LeadershipTerms: 4})
	if diff := schoolScore(t, lead, "울산에너지고", "일반") - schoolScore(t, s, "울산에너지고", "일반"); diff != 7.5 {
		t.Fatalf("리더십 1→4학기 차이 %v (기대 7.5)", diff)
	}
}

func TestWhatIfVolunteerGoesToThirdYearWithoutPerGradeRecords(t *testing.T) {
	s := whatIfStudent([]string{"1_2", "2_1", "2_2"}, "B")
	s.VolunteerData = `{"total_time":3}`
	out, notes := ApplyWhatIf(s, WhatIfInput{AddVolunteer: 4, LeadershipTerms: -1})
	vol := decodeObject(out.VolunteerData)
	if vol["1_time"] != 1.0 || vol["2_time"] != 1.0 || vol["3_time"] != 5.0 || vol["total_time"] != 7.0 {
		t.Fatalf("학년별 봉사: %v", vol)
	}
	if len(notes) < 2 || !strings.Contains(notes[0], "학년별 봉사 기록이 없어") {
		t.Fatalf("안내: %v", notes)
	}
}

func TestWhatIfNoRemainingSemester(t *testing.T) {
	s := whatIfStudent([]string{"1_2", "2_1", "2_2", "3_1", "3_2"}, "B")
	out, notes := ApplyWhatIf(s, WhatIfInput{RemainingStep: 2, LeadershipTerms: -1})
	if out.RawData != s.RawData || len(notes) != 1 || !strings.Contains(notes[0], "없어 남은 학기") {
		t.Fatalf("남은 학기가 없을 때: %v", notes)
	}
}

// 3-1·3-2가 모두 없으면 둘 다 작년 성적에서 한 번만 바꾼다(겹쳐 두 번 오르지 않음).
func TestWhatIfBothRemainingShiftOnce(t *testing.T) {
	s := whatIfStudent([]string{"1_2", "2_1", "2_2"}, "C")
	out, _ := ApplyWhatIf(s, WhatIfInput{RemainingStep: 1, LeadershipTerms: -1})
	for _, r := range gradedRecords(out.RawData) {
		if r.grade == "3" && r.subject != "체육" && r.score != 4 {
			t.Fatalf("%s-%s %s: %d (기대 4=B)", r.grade, r.sem, r.subject, r.score)
		}
	}
}
