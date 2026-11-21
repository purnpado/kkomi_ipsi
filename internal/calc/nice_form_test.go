package calc

import (
	"math"
	"strings"
	"testing"
)

// 특성화고 나이스 원서등록 화면 대조표 고정 정답.
// 나이스 화면 배치(1줄 1-2·2-2, 2줄 2-1·3-1, 3줄 출결·봉사)나 산출식이 바뀌면 이 테스트를 함께 고친다.
func vocationalSampleStudent() *StudentFullData {
	return &StudentFullData{
		Name: "가상학생",
		NonArtSemesterScores: map[string][]int{
			"1_2": {2, 2, 2, 2, 2, 2, 2, 2}, // 16 / 8 (나이스 캡처 예시와 같은 값)
			"2_1": {3, 2, 3, 2, 3, 2, 2, 2}, // 19 / 8
			"2_2": {3, 2, 2, 3, 2, 3, 2, 2}, // 19 / 8
			"3_1": {2, 2, 2, 2, 3, 2, 2, 2}, // 17 / 8
		},
		SemesterScores:      map[string][]int{"1_2": {2}, "2_1": {2}, "2_2": {2}, "3_1": {2}},
		RawAbsenceDays:      1,
		RawLateCount:        2,
		RawEarlyCount:       1,
		RawResultCount:      1,
		AbsenceDays:         2, // 1 + (2+1+1)/3
		TotalVolunteerHours: 40,
	}
}

func cellTexts(row []NiceFormCell) string {
	parts := make([]string, len(row))
	for i, c := range row {
		parts[i] = c.Text
		if c.Note != "" {
			parts[i] += "(" + c.Note + ")"
		}
	}
	return strings.Join(parts, " | ")
}

func TestVocationalNiceFormGolden(t *testing.T) {
	form := NiceFormFor(vocationalSampleStudent(), "울산상업고", "일반")
	if form == nil {
		t.Fatal("특성화고는 대조표가 있어야 합니다")
	}
	want := []string{
		"1학년 2학기 | 교과성취점수 | 16 | 과목수 | 8 | 2학년 2학기 | 교과성취점수 | 19 | 과목수 | 8",
		"2학년 1학기 | 교과성취점수 | 19 | 과목수 | 8 | 3학년 1학기 | 교과성취점수 | 17 | 과목수 | 8",
		"최종결석(일) | 2 | 지각(회) | 2 | 조퇴(회) | 1 | 결과(회) | 1 | 결석(일) | 1 | 봉사시수 | 40",
	}
	if len(form.Rows) != len(want) {
		t.Fatalf("줄 수: %d", len(form.Rows))
	}
	for i, w := range want {
		if got := cellTexts(form.Rows[i]); got != w {
			t.Errorf("%d줄\n 기대: %s\n 실제: %s", i+1, w, got)
		}
	}
	// 나이스 파일에는 마감일이 없으므로 경고 없이 늘 같은 안내만 붙는다.
	if len(form.Warnings) != 0 || len(form.Hints) != 1 || form.Hints[0] != NiceFileHint {
		t.Fatalf("경고 없이 안내만: %v / %v", form.Warnings, form.Hints)
	}
}

// 마감일 기준 출결을 입력하면 그 값을 쓰고, 전형마다 마감일이 다르다(일반 10/31, 취업희망자 9/30).
func TestVocationalNiceFormUsesCutoffAttendance(t *testing.T) {
	s := vocationalSampleStudent()
	s.HasSeptAbsence, s.SeptAbsenceDays, s.SeptLateEtc = true, 3, 5 // 최종 3 + 5/3 = 4
	form := NiceFormFor(s, "울산상업고", "취업희망자")
	if form == nil {
		t.Fatal("대조표가 있어야 합니다")
	}
	if got := cellTexts(form.Rows[2]); got != "최종결석(일) | 4 | 지각(회) | - | 조퇴(회) | - | 결과(회) | - | 결석(일) | 3 | 봉사시수 | 40" {
		t.Fatalf("9/30 기준 출결: %s", got)
	}
	for _, w := range form.Warnings {
		if strings.Contains(w, "따로 없어") {
			t.Fatalf("입력했으면 미입력 안내가 없어야 합니다: %v", form.Warnings)
		}
	}
	if !strings.Contains(strings.Join(form.Warnings, " "), "합계(5회)") {
		t.Fatalf("예전 합계 입력은 합계를 알려야 합니다: %v", form.Warnings)
	}
	// 일반전형(10/31)은 9/30 입력을 쓰지 않는다.
	if got := cellTexts(NiceFormFor(s, "울산상업고", "일반").Rows[2]); !strings.HasPrefix(got, "최종결석(일) | 2 |") {
		t.Fatalf("일반전형은 10/31 기준이어야 합니다: %s", got)
	}
}

// 대조표의 최종결석과 학기 값은 실제 산출에 쓴 값과 같아야 한다(화면과 점수가 어긋나지 않게).
func TestVocationalNiceFormMatchesCalculation(t *testing.T) {
	s := vocationalSampleStudent()
	for _, rule := range AllSchoolRules {
		if rule.NiceForm != NiceFormVocational {
			continue
		}
		basis := buildScoreBasis(s, rule)
		result := calculateForSchool(s, rule)
		wantAttendance := math.Max(0, rule.AttendanceMax-float64(basis.FinalAbsenceDays)*rule.AbsencePenalty)
		if math.Abs(result.AttendanceScore-roundToTwoDecimals(wantAttendance)) > 1e-9 {
			t.Errorf("%s %s: 대조표 최종결석 %d일로 계산한 출결 %.2f ≠ 산출 %.2f", rule.SchoolName, rule.TrackName, basis.FinalAbsenceDays, wantAttendance, result.AttendanceScore)
		}
		for _, sem := range basis.Semesters {
			if sem.Count != len(ruleSemesterScores(s, rule, sem.Semester)) {
				t.Errorf("%s %s %s: 과목수가 산출과 다릅니다", rule.SchoolName, rule.TrackName, sem.Semester)
			}
		}
	}
	// 마이스터고: 특성화고와 같은 요약 + 리더십 학기 줄(1-1 ~ 3-2, 나이스 현대공고 화면 순서)
	s.LeadershipSemesters = []string{"2_1", "3_1"}
	form := NiceFormFor(s, "현대공업고", "일반")
	if form == nil || form.Type != NiceFormMeister || len(form.Rows) != 4 {
		t.Fatalf("마이스터고 대조표: %+v", form)
	}
	got := []string{}
	for _, c := range form.Rows[3] {
		got = append(got, c.Text)
	}
	want := "리더십 1-1 - 1-2 - 2-1 인정 2-2 - 3-1 인정 3-2 -"
	if strings.Join(got, " ") != want {
		t.Fatalf("리더십 줄: %q, want %q", strings.Join(got, " "), want)
	}
}
