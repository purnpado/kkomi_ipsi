package parser

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func writeCSV(t *testing.T, body string) string {
	t.Helper()
	p := filepath.Join(t.TempDir(), "x.csv")
	if err := os.WriteFile(p, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
	return p
}

// 출결 파일에 학년 칸이 있으면 누적값과 함께 학년별 값도 저장한다.
func TestAttendancePerGrade(t *testing.T) {
	p := writeCSV(t, "2026학년도,출결상황,3학년 1반\n"+
		"번호,성명,학년,수업일수,결석,,,지각,,,조퇴,,,결과,,\n"+
		",,,,질병,미인정,기타,질병,미인정,기타,질병,미인정,기타,질병,미인정,기타\n"+
		"1,가나다,1,190,2,0,0,0,1,0,0,0,0,0,0,0\n"+
		",,2,190,0,10,0,0,0,0,0,0,0,0,0,0\n"+
		",,3,95,0,1,0,0,2,0,0,1,0,0,0,0\n")
	got, err := ParseAttendanceExcel(p)
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]int
	_ = json.Unmarshal([]byte(got[1][0].AttendanceData), &m)
	if m["absence"] != 11 || m["late"] != 3 || m["2_absence"] != 10 || m["3_early"] != 1 || m["1_absence"] != 0 {
		t.Fatalf("출결 학년별 저장: %v", m)
	}
}

// 봉사 파일에 학년·시간 칸이 있으면 학년별 시간을 저장한다(병합된 학년 칸은 위 행을 이어 쓴다).
func TestVolunteerPerGrade(t *testing.T) {
	p := writeCSV(t, "2026학년도,봉사활동실적,3학년 1반\n"+
		"번호,성명,학년,일자 또는 기간,장소,활동내용,시간,시간누계(학년),시간누계(전체)\n"+
		"1,가나다,1,2024.05.01.,학교,정화,3,3,3\n"+
		",,,2024.06.01.,학교,정화,9,12,12\n"+
		",,3,2026.04.01.,학교,정화,2,2,14\n"+
		"2,라마바,,,,,0,0,0\n")
	got, err := ParseVolunteerExcel(p)
	if err != nil {
		t.Fatal(err)
	}
	byName := map[string]map[string]int{}
	for _, s := range got[1] {
		m := map[string]int{}
		_ = json.Unmarshal([]byte(s.VolunteerData), &m)
		byName[s.Name] = m
	}
	if m := byName["가나다"]; m["total_time"] != 14 || m["1_time"] != 12 || m["3_time"] != 2 {
		t.Fatalf("봉사 학년별 저장: %v", m)
	}
	if _, ok := byName["라마바"]; !ok {
		t.Fatalf("기록이 없는 학생도 명단에 남아야 함: %v", byName)
	}
}
