package database

import (
	"testing"

	"PHGC/internal/parser"
)

// 나이스 석차 연명부를 올리면 학년도별로 저장하고, 꼬미입시 계산값과 학생마다 맞춰 본다.
func TestNiceGeneralFinalCompare(t *testing.T) {
	dm := newEvidenceTestDB(t) // 고입 연도 2027
	student := parser.StudentExcelData{
		ClassNum: 1, StudentNum: "1", Name: "가상학생",
		RawData: `[{"학년":"1","학기":"2","과목":"국어","성취도":"A"},{"학년":"2","학기":"1","과목":"국어","성취도":"A"},{"학년":"2","학기":"2","과목":"국어","성취도":"A"},{"학년":"3","학기":"1","과목":"국어","성취도":"A"},{"학년":"3","학기":"2","과목":"국어","성취도":"A"}]`,
	}
	if err := dm.SaveClassStudents(1, []parser.StudentExcelData{student}); err != nil {
		t.Fatal(err)
	}
	// 점수가 없는 파일(나이스 산출 전)은 저장하지 않는다.
	if _, err := dm.SaveNiceGeneralFinal(2027, &parser.NiceRankFile{Rows: []parser.NiceRankRow{{ClassNum: 1, StudentNum: "1"}}}); err == nil {
		t.Fatal("점수가 없는 파일은 거부해야 합니다")
	}
	first, err := dm.NiceGeneralComparison()
	if err != nil {
		t.Fatal(err)
	}
	if len(first.Rows) != 0 {
		t.Fatalf("올리기 전에는 비교할 줄이 없어야 합니다: %+v", first.Rows)
	}
	// 꼬미입시 계산값을 알아내려고 같은 값으로 한 번 올린다.
	probe := &parser.NiceRankFile{Kind: "석차 연명부", Enrolled: 10, Rows: []parser.NiceRankRow{{ClassNum: 1, StudentNum: "01", HasScores: true, Final: 1}}}
	if _, err := dm.SaveNiceGeneralFinal(2027, probe); err != nil {
		t.Fatal(err)
	}
	cmp, err := dm.NiceGeneralComparison()
	if err != nil || len(cmp.Rows) != 1 || cmp.Rows[0].Program == nil {
		t.Fatalf("비교: %+v %v", cmp, err)
	}
	p := cmp.Rows[0].Program
	same := parser.NiceRankRow{ClassNum: 1, StudentNum: "1", HasScores: true, Rank: p.Rank, Percentile: p.Percentile, Academic: p.Academic,
		Attendance: p.Attendance, Volunteer: p.Volunteer, Creative: p.Creative, Behavior: p.Behavior, Total: p.Total, Final: p.Total}
	enrolled := cmp.ProgramEnrolled
	if _, err := dm.SaveNiceGeneralFinal(2027, &parser.NiceRankFile{Kind: "석차 연명부", Enrolled: enrolled, Rows: []parser.NiceRankRow{same}}); err != nil {
		t.Fatal(err)
	}
	if cmp, _ = dm.NiceGeneralComparison(); cmp.Same != 1 || len(cmp.Rows[0].Diffs) != 0 {
		t.Fatalf("같은 값이면 다른 칸이 없어야 합니다: %+v", cmp.Rows[0])
	}
	// 출결이 다르면 그 칸과 이유를 알려 준다.
	diff := same
	diff.Attendance -= 1
	diff.Total -= 1
	diff.Final -= 1
	if _, err := dm.SaveNiceGeneralFinal(2027, &parser.NiceRankFile{Kind: "석차 연명부", Enrolled: enrolled, Rows: []parser.NiceRankRow{diff}}); err != nil {
		t.Fatal(err)
	}
	cmp, _ = dm.NiceGeneralComparison()
	got := cmp.Rows[0]
	if cmp.Same != 0 || len(got.Diffs) != 2 || got.Diffs[0] != "attendance" || got.Diffs[1] != "total" || len(got.Hints) == 0 {
		t.Fatalf("출결 차이: %+v", got)
	}
	// 원서대장용 점수: 반|번호 → 나이스 내신성적
	scores, summary, err := dm.NiceGeneralFinalScores(2027)
	if err != nil || scores["1|1"] != diff.Final || summary.UploadedAt == "" {
		t.Fatalf("원서대장 점수: %v %+v %v", scores, summary, err)
	}
	if err := dm.ClearNiceGeneralFinal(2027); err != nil {
		t.Fatal(err)
	}
	if scores, _, _ := dm.NiceGeneralFinalScores(2027); len(scores) != 0 {
		t.Fatal("지우면 원서대장 점수도 없어야 합니다")
	}
}
