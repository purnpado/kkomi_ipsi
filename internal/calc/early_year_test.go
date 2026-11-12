package calc

import (
	"encoding/json"
	"strings"
	"testing"

	"PHGC/internal/parser"
)

func earlyStudent(num string, semesters []string, achieve string, volunteer string) parser.StudentExcelData {
	var rows []map[string]string
	for _, sem := range semesters {
		p := strings.Split(sem, "_")
		for _, sub := range []string{"국어", "수학", "영어", "과학"} {
			rows = append(rows, map[string]string{"학년": p[0], "학기": p[1], "과목": sub, "성취도": achieve})
		}
	}
	b, _ := json.Marshal(rows)
	return parser.StudentExcelData{ClassNum: 1, StudentNum: num, Name: "가상" + num, RawData: string(b), VolunteerData: volunteer}
}

func findResult(t *testing.T, results []StudentCalcResult, num string) StudentCalcResult {
	t.Helper()
	for _, r := range results {
		if r.StudentNum == num {
			return r
		}
	}
	t.Fatalf("학생 %s 결과 없음", num)
	return StudentCalcResult{}
}

// 학기 초(전교생 3학년 성적 없음): 3학년 교과를 작년(2학년) 성적으로 대신하고, 결손 공식을 쓰지 않는다.
// 출결·봉사는 예상하지 않는다(3학년 봉사 0시간 그대로).
func TestEarlyYearProjectsThirdYearFromSecondYear(t *testing.T) {
	early := map[int][]parser.StudentExcelData{1: {
		earlyStudent("1", []string{"1_2", "2_1", "2_2"}, "A", `{"total_time":8,"1_time":4,"2_time":4,"3_time":0}`),
		earlyStudent("2", []string{"1_2", "2_1", "2_2"}, "B", `{"total_time":8,"1_time":4,"2_time":4,"3_time":0}`),
	}}
	// 같은 학생들이 3-1을 2-2와 같게 받았을 때의 정식 계산과 같아야 한다.
	withThird := map[int][]parser.StudentExcelData{1: {
		earlyStudent("1", []string{"1_2", "2_1", "2_2", "3_1"}, "A", `{"total_time":8,"1_time":4,"2_time":4,"3_time":0}`),
		earlyStudent("2", []string{"1_2", "2_1", "2_2", "3_1"}, "B", `{"total_time":8,"1_time":4,"2_time":4,"3_time":0}`),
	}}
	a, err := CalculateGrades(early, false)
	if err != nil {
		t.Fatal(err)
	}
	b, _ := CalculateGrades(withThird, false)
	for _, num := range []string{"1", "2"} {
		ea, eb := findResult(t, a, num), findResult(t, b, num)
		if !ea.ThirdYearProjected || eb.ThirdYearProjected {
			t.Fatalf("예상치 표시: 학기 초=%v 3학년 있음=%v", ea.ThirdYearProjected, eb.ThirdYearProjected)
		}
		if ea.VolunteerScore != 6 {
			t.Errorf("학생 %s: 봉사는 예상하지 않아 1·2학년 4시간씩만 인정(기본 2 + 2 + 2 = 6) → %.1f", num, ea.VolunteerScore)
		}
		if ea.TotalSubjectScore != eb.TotalSubjectScore || ea.VolunteerScore != eb.VolunteerScore {
			t.Errorf("학생 %s: 학기 초 예상(교과 %.2f, 봉사 %.1f) ≠ 3학년 반영(교과 %.2f, 봉사 %.1f)", num, ea.TotalSubjectScore, ea.VolunteerScore, eb.TotalSubjectScore, eb.VolunteerScore)
		}
	}
	// 원본 자료는 바뀌지 않는다.
	if strings.Contains(early[1][0].RawData, `"학년":"3"`) {
		t.Fatal("원본 자료에 3학년 성적이 들어감")
	}
}

// 3학년 성적이 한 명이라도 있으면 예상하지 않는다(그 학생만 없는 경우는 진짜 학년 결손).
func TestEarlyYearOffWhenAnyoneHasThirdYear(t *testing.T) {
	all := map[int][]parser.StudentExcelData{1: {
		earlyStudent("1", []string{"1_2", "2_1", "2_2", "3_1"}, "A", ""),
		earlyStudent("2", []string{"1_2", "2_1", "2_2"}, "B", ""),
	}}
	res, _ := CalculateGrades(all, false)
	if findResult(t, res, "2").ThirdYearProjected {
		t.Fatal("3학년 성적이 있는 학생이 있는데 예상치로 계산함")
	}
}

// 작년(2학년) 1·2학기 평균으로 본다: 2-1이 A, 2-2가 C이면 3-1은 B 평균과 같다.
func TestEarlyYearUsesWholeSecondYearAverage(t *testing.T) {
	mixed := earlyStudent("1", []string{"1_2", "2_1"}, "A", "")
	var rows []map[string]string
	_ = json.Unmarshal([]byte(mixed.RawData), &rows)
	for _, sub := range []string{"국어", "수학", "영어", "과학"} {
		rows = append(rows, map[string]string{"학년": "2", "학기": "2", "과목": sub, "성취도": "C"})
	}
	b, _ := json.Marshal(rows)
	mixed.RawData = string(b)
	filled := FillEarlyThirdYear(mixed.RawData)
	sum, n := 0, 0
	for _, r := range gradedRecords(filled) {
		if r.grade == "3" {
			sum += r.score
			n++
		}
	}
	if n != 8 || float64(sum)/float64(n) != 4 {
		t.Fatalf("3-1 예상: %d과목 평균 %.2f (기대 8과목 평균 4.0=B)", n, float64(sum)/float64(n))
	}
}
