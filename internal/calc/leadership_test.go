package calc

import (
	"strings"
	"testing"

	"PHGC/internal/parser"
)

// 리더십: 학기별 체크가 있으면 그 개수, 예전 숫자만 있으면 숫자를 쓴다.
func TestLeadershipSemesters(t *testing.T) {
	parse := func(extra string) *StudentFullData {
		s, err := ParseStudentFullData(parser.StudentExcelData{ClassNum: 1, StudentNum: "1", Name: "가상", ExtraData: extra})
		if err != nil {
			t.Fatal(err)
		}
		return s
	}
	s := parse(`{"leadership_terms":4,"leadership_semesters":["2_2","1_2","9_9","1_2"]}`)
	if s.LeadershipTerms != 2 || strings.Join(s.LeadershipSemesters, ",") != "1_2,2_2" {
		t.Fatalf("학기별 체크: %d %v", s.LeadershipTerms, s.LeadershipSemesters)
	}
	if s := parse(`{"leadership_terms":1,"leadership_semesters":[]}`); s.LeadershipTerms != 0 || s.LeadershipSemesters == nil {
		t.Fatalf("모두 해제하면 0학기: %d %v", s.LeadershipTerms, s.LeadershipSemesters)
	}
	old := parse(`{"leadership_terms":3}`)
	if old.LeadershipTerms != 3 || old.LeadershipSemesters != nil {
		t.Fatalf("예전 숫자 입력: %d %v", old.LeadershipTerms, old.LeadershipSemesters)
	}
	// 점수: 에너지고 2학기 = 5점, 현대공고는 최대 5점
	for _, r := range parse(`{"leadership_semesters":["1_2","2_1","2_2"]}`).SchoolResults {
		if r.SchoolName == "울산에너지고" && r.LeadershipScore != 7.5 || r.SchoolName == "현대공업고" && r.LeadershipScore != 5 {
			t.Fatalf("%s 리더십 점수 %.1f", r.SchoolName, r.LeadershipScore)
		}
	}
}
