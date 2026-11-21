package parser

import "testing"

// 내신석차연명부 양식(사용자 제공 2026학년도 가상 자료의 값): 칸 이름 두 줄 + 재적수·만점 줄 + 학생 줄.
func TestParseNiceRankRoster(t *testing.T) {
	rows := [][]string{
		{"", "", "석차 연명부"},
		{"", "2026년도 00중학교"},
		{"", "내신\n석차", "", "3학년", "", "", "", "성명", "성별", "영역별 점수", "", "", "", "", "", "", "합계점수", "", "석차\n백분율", "내신\n성적"},
		{"", "", "", "반", "", "", "번", "", "", "교과성적", "출석성적", "", "봉사활동", "창의체험", "", "행동발달"},
		{"", "10", "", "", "", "", "", "", "", "160", "16", "", "8", "8", "", "8", "200", "", "%", "200"},
		{"", "6", "", "1", "", "", "1", "", "", "102.40", "15.0", "", "8.0", "8.0", "", "6.0", "139.40", "", "60.00", "139.40"},
		{"", "2", "", "1", "", "", "2", "", "", "140.80", "15.5", "", "8.0", "6.0", "", "6.0", "176.30", "", "20.00", "176.30"},
		{"", "위의 기재 사항은 사실과 틀림이 없음."},
	}
	f, err := ParseNiceRankRows(rows)
	if err != nil {
		t.Fatal(err)
	}
	if f.Kind != "석차 연명부" || f.Enrolled != 10 || len(f.Rows) != 2 {
		t.Fatalf("양식 %q 재적 %d 학생 %d", f.Kind, f.Enrolled, len(f.Rows))
	}
	r := f.Rows[1]
	if r.ClassNum != 1 || r.StudentNum != "2" || r.Rank != 2 || r.Academic != 140.8 || r.Attendance != 15.5 || r.Volunteer != 8 ||
		r.Creative != 6 || r.Behavior != 6 || r.Total != 176.3 || r.Percentile != 20 || r.Final != 176.3 || !r.HasScores {
		t.Fatalf("2번 학생: %+v", r)
	}
}

// 석차백분율산출 양식: "내신성적" 묶음 아래에 교과성적이 있고 학년석차·석차백분율(비교과포함) 칸.
func TestParseNiceRankPercentileSheet(t *testing.T) {
	rows := [][]string{
		{"학년", "반", "번호", "성명", "내신성적", "", "", "", "", "", "학년_x000D_\n석차", "석차백분율_x000D_\n(비교과포함)"},
		{"", "", "", "", "교과성적", "출석성적", "봉사활동", "창의체험", "행동발달", "합계점수"},
		{"3", "1", "6", "", "150.40", "16.0", "8.0", "8.0", "8.0", "190.40", "1", "10.00"},
		{"3", "1", "7"},
	}
	f, err := ParseNiceRankRows(rows)
	if err != nil {
		t.Fatal(err)
	}
	if f.Kind != "석차백분율산출" || len(f.Rows) != 2 {
		t.Fatalf("양식 %q 학생 %d", f.Kind, len(f.Rows))
	}
	r := f.Rows[0]
	if r.StudentNum != "6" || r.Academic != 150.4 || r.Total != 190.4 || r.Final != 190.4 || r.Rank != 1 || r.Percentile != 10 {
		t.Fatalf("6번 학생: %+v", r)
	}
	if f.Rows[1].HasScores {
		t.Fatal("점수 칸이 빈 학생은 HasScores=false")
	}
	if _, err := ParseNiceRankRows([][]string{{"아무", "표"}, {"1", "2"}}); err == nil {
		t.Fatal("다른 양식은 오류")
	}
}
