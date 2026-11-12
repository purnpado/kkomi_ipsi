package database

import (
	"encoding/json"
	"strings"
	"testing"

	"PHGC/internal/calc"
	"PHGC/internal/parser"
)

// whatIfRaw 과목별 성취도 문자열(예: "ABBBB")을 모든 학기에 같게 넣는다.
func whatIfRaw(semesters []string, pattern string) string {
	var rows []map[string]string
	for _, sem := range semesters {
		p := strings.Split(sem, "_")
		for i, sub := range []string{"국어", "수학", "영어", "과학", "사회"} {
			rows = append(rows, map[string]string{"학년": p[0], "학기": p[1], "과목": sub, "성취도": pattern[i : i+1]})
		}
	}
	b, _ := json.Marshal(rows)
	return string(b)
}

func newWhatIfDB(t *testing.T) *DBManager {
	t.Helper()
	dm := &DBManager{DataDir: t.TempDir()}
	dm.SetDataKey(make([]byte, 32))
	if err := dm.InitConfigDB(); err != nil {
		t.Fatal(err)
	}
	if err := dm.SaveSchoolConfig("가람중학교", 1, "x", false, 2027); err != nil {
		t.Fatal(err)
	}
	sems := []string{"1_2", "2_1", "2_2", "3_1"} // 3-2 성적은 아직 없음
	students := []parser.StudentExcelData{}
	// 과목 하나 차이(합산 6.4점)씩 촘촘하게 벌어진 학생들. 3-2 한 학기 두 단계 올림(최대 +7.84점)으로 한 명을 넘을 수 있다.
	for i, a := range []string{"AAAAA", "AAAAB", "AAABB", "AABBB", "ABBBB", "BBBBB", "BBBBC", "BBBCC"} {
		num := string(rune('1' + i))
		students = append(students, parser.StudentExcelData{ClassNum: 1, StudentNum: num, Name: "가상" + num, RawData: whatIfRaw(sems, a)})
	}
	if err := dm.SaveClassStudents(1, students); err != nil {
		t.Fatal(err)
	}
	return dm
}

func TestWhatIfStudentExactRerank(t *testing.T) {
	dm := newWhatIfDB(t)
	res, err := dm.WhatIfStudent(1, "6", "가상6", calc.WhatIfInput{RemainingStep: 2, FutureAbsence: 1, LeadershipTerms: -1})
	if err != nil {
		t.Fatal(err)
	}
	if res.GeneralMethod != "exact" {
		t.Fatalf("전교생 자료가 있는데 방법=%s", res.GeneralMethod)
	}
	if !(res.GeneralAfter.Rank < res.GeneralBefore.Rank) || !(res.GeneralAfter.Academic > res.GeneralBefore.Academic) {
		t.Fatalf("3-2 두 단계 올림인데 석차·교과가 나아지지 않음: %+v → %+v", res.GeneralBefore, res.GeneralAfter)
	}
	changed := false
	for _, s := range res.Schools {
		if s.SchoolName == "울산마이스터고" && s.TrackName == "일반" && s.After < s.Before {
			changed = true // 결석 1일 감점(전기고는 3-2를 반영하지 않음)
		}
	}
	if !changed {
		t.Fatalf("전기고 점수에 결석 감점이 반영되지 않음: %+v", res.Schools)
	}
	// 저장하지 않으므로 다시 조회한 학생 자료는 그대로다.
	s, _ := dm.GetStudent(1, "6", "가상6")
	if strings.Contains(s.RawData, `"학기":"2","과목":"국어","성취도":"A","학년":"3"`) || strings.Contains(s.AttendanceData, "absence") {
		t.Fatal("가정해 보기가 자료를 저장함")
	}
}

func TestWhatIfStudentEstimatedOnHomeroomPC(t *testing.T) {
	dm := newWhatIfDB(t)
	// 학년부장이 배포한 전교 석차 기록(전교 100명)이 있는 담임 PC를 흉내 낸다.
	results, err := calc.CalculateGrades(mustAll(t, dm), false)
	if err != nil {
		t.Fatal(err)
	}
	for i := range results {
		results[i].TotalStudents = 100
		results[i].Rank = 10 + i*10
	}
	if err := dm.SaveRankSnapshots(results); err != nil {
		t.Fatal(err)
	}
	res, err := dm.WhatIfStudent(1, "6", "가상6", calc.WhatIfInput{RemainingStep: 2, LeadershipTerms: -1})
	if err != nil {
		t.Fatal(err)
	}
	if res.GeneralMethod != "estimated" || res.GeneralBefore.TotalStudents != 100 {
		t.Fatalf("추정 방식이어야 함: %+v", res)
	}
	if !(res.GeneralAfter.Rank < res.GeneralBefore.Rank) {
		t.Fatalf("추정 석차가 나아지지 않음: %d → %d", res.GeneralBefore.Rank, res.GeneralAfter.Rank)
	}
	found := false
	for _, n := range res.Notes {
		if strings.Contains(n, "추정했습니다") {
			found = true
		}
	}
	if !found {
		t.Fatalf("추정 안내 없음: %v", res.Notes)
	}
}

func mustAll(t *testing.T, dm *DBManager) map[int][]parser.StudentExcelData {
	t.Helper()
	all, err := dm.GetAllStudents(1)
	if err != nil {
		t.Fatal(err)
	}
	return all
}

func TestEstimateRankInterpolatesAndExtends(t *testing.T) {
	snaps := map[string]RankSnapshot{
		"a": {TotalStudents: 100, Rank: 10, TotalSubjectScore: 90},
		"b": {TotalStudents: 100, Rank: 30, TotalSubjectScore: 70},
		"c": {TotalStudents: 100, Rank: 50, TotalSubjectScore: 50},
	}
	if got := estimateRank(snaps, 80, 100); got != 20 {
		t.Errorf("중간 점수 %d (기대 20)", got)
	}
	if got := estimateRank(snaps, 95, 100); got != 5 {
		t.Errorf("최고점 위 %d (기대 5)", got)
	}
	if got := estimateRank(snaps, 0, 100); got != 100 {
		t.Errorf("최저점 아래는 전체 인원을 넘지 않음 %d", got)
	}
}
