package database

import (
	"testing"

	"PHGC/internal/model"
	"PHGC/internal/parser"
)

func bulkTestDB(t *testing.T) *DBManager {
	t.Helper()
	dm := &DBManager{DataDir: t.TempDir()}
	if err := dm.InitConfigDB(); err != nil {
		t.Fatal(err)
	}
	if err := dm.SaveSchoolConfig("일괄중학교", 2, "", false, 2027); err != nil {
		t.Fatal(err)
	}
	raw := `[{"학년":"2","학기":"1","과목":"국어","성취도":"B"}]`
	if err := dm.SaveClassStudents(1, []parser.StudentExcelData{{ClassNum: 1, StudentNum: "1", Name: "가학생", RawData: raw}, {ClassNum: 1, StudentNum: "2", Name: "나학생", RawData: raw}}); err != nil {
		t.Fatal(err)
	}
	if err := dm.SaveClassStudents(2, []parser.StudentExcelData{{ClassNum: 2, StudentNum: "1", Name: "다학생", RawData: raw}}); err != nil {
		t.Fatal(err)
	}
	if err := dm.SaveApplication(model.ApplicationRecord{ClassNum: 2, StudentNum: "1", StudentName: "다학생", AdmissionYear: 2027, Category: "meister", SchoolName: "울산마이스터고", Track: "일반", Status: "지원완료", Preferences: []string{"정밀기계과"}}); err != nil {
		t.Fatal(err)
	}
	return dm
}

func statusOf(t *testing.T, dm *DBManager, classNum int, num, name, category string) string {
	t.Helper()
	apps, err := dm.GetStudentApplications(classNum, num, name)
	if err != nil {
		t.Fatal(err)
	}
	for _, a := range apps {
		if a.AdmissionYear == 2027 && a.Category == category {
			return a.Status
		}
	}
	return ""
}

func TestBulkApplicationFlowWithUndo(t *testing.T) {
	dm := bulkTestDB(t)
	classes := []int{1, 2}

	// 1. 일반고 일괄 지원: 원서가 없는 가·나만(다는 마이스터고 원서가 있음)
	preview, err := dm.BulkCreateGeneral(2027, classes, false)
	if err != nil || preview.Changed != 2 {
		t.Fatalf("미리보기는 2명이어야 합니다: %+v %v", preview, err)
	}
	if statusOf(t, dm, 1, "1", "가학생", "general") != "" {
		t.Fatal("미리보기는 원서를 만들면 안 됩니다")
	}
	if _, err := dm.BulkCreateGeneral(2027, classes, true); err != nil {
		t.Fatal(err)
	}
	if statusOf(t, dm, 1, "1", "가학생", "general") != "지원예정" || statusOf(t, dm, 2, "1", "다학생", "general") != "" {
		t.Fatal("원서 없는 학생에게만 일반고 지원예정이 만들어져야 합니다")
	}
	// 다학생도 일반고를 함께 써 둔 경우
	if err := dm.SaveApplication(model.ApplicationRecord{ClassNum: 2, StudentNum: "1", StudentName: "다학생", AdmissionYear: 2027, Category: "general", Track: generalTrack, Status: "지원예정"}); err != nil {
		t.Fatal(err)
	}

	// 2. 전기고 결과: 다학생 합격 → 마이스터고 합격·배정 학과, 일반고 원서는 지운다
	res, err := dm.BulkSetSchoolResults(2027, classes, "meister", "울산마이스터고", "일반", "final", map[string]string{StudentKey(2, "1", "다학생"): "정밀기계과"}, true)
	if err != nil || res.Accepted != 1 || res.Removed != 1 {
		t.Fatalf("전기고 결과: %+v %v", res, err)
	}
	if statusOf(t, dm, 2, "1", "다학생", "meister") != "합격" || statusOf(t, dm, 2, "1", "다학생", "general") != "" {
		t.Fatal("전기고 합격자는 합격, 일반고 원서는 없어야 합니다")
	}

	// 3. 일반고 결과: 나학생만 불합격, 나머지 합격
	res, err = dm.BulkSetGeneralResults(2027, classes, map[string]bool{StudentKey(1, "2", "나학생"): true}, true)
	if err != nil || res.Accepted != 1 || res.Rejected != 1 {
		t.Fatalf("일반고 결과: %+v %v", res, err)
	}
	if statusOf(t, dm, 1, "1", "가학생", "general") != "합격" || statusOf(t, dm, 1, "2", "나학생", "general") != "불합격" {
		t.Fatal("일반고 결과가 맞지 않습니다")
	}

	// 4. 되돌리기: 최근 작업부터 하나씩
	if n, err := dm.UndoLastBulk(classes, 2027); err != nil || n != 2 {
		t.Fatalf("일반고 결과 되돌리기: %d %v", n, err)
	}
	if statusOf(t, dm, 1, "1", "가학생", "general") != "지원예정" || statusOf(t, dm, 1, "2", "나학생", "general") != "지원예정" {
		t.Fatal("일반고 결과가 되돌아가야 합니다")
	}
	if _, err := dm.UndoLastBulk(classes, 2027); err != nil {
		t.Fatal(err)
	}
	if statusOf(t, dm, 2, "1", "다학생", "meister") != "지원완료" || statusOf(t, dm, 2, "1", "다학생", "general") != "지원예정" {
		t.Fatal("전기고 결과와 지운 일반고 원서가 되돌아가야 합니다")
	}
	if _, err := dm.UndoLastBulk(classes, 2027); err != nil {
		t.Fatal(err)
	}
	if statusOf(t, dm, 1, "1", "가학생", "general") != "" || statusOf(t, dm, 2, "1", "다학생", "general") != "지원예정" {
		t.Fatal("일괄로 만든 원서만 지워지고 직접 넣은 원서는 남아야 합니다")
	}
	if id, _ := dm.LastBulkBatch(classes); id != "" {
		t.Fatalf("되돌릴 작업이 더 없어야 합니다: %q", id)
	}
}

func TestBulkRejectsClosedYear(t *testing.T) {
	dm := bulkTestDB(t)
	db, err := dm.OpenDB(dm.GetConfigDBPath())
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO admission_closures (admission_year, status) VALUES (2027, 'closed')`); err != nil {
		t.Fatal(err)
	}
	db.Close()
	if _, err := dm.BulkCreateGeneral(2027, []int{1, 2}, true); err == nil {
		t.Fatal("확정한 학년도에는 일괄 지원을 할 수 없어야 합니다")
	}
	if _, err := dm.BulkSetGeneralResults(2027, []int{1, 2}, nil, true); err == nil {
		t.Fatal("확정한 학년도에는 일괄 결과를 넣을 수 없어야 합니다")
	}
}

// 일반고 불합격 뒤 특성화고 추가모집에 합격한 학생: 특성화고 합격을 넣어도 일반고 불합격 기록은 남는다.
func TestEarlyPassKeepsDecidedGeneral(t *testing.T) {
	dm := bulkTestDB(t)
	for _, rec := range []model.ApplicationRecord{
		{ClassNum: 1, StudentNum: "1", StudentName: "가학생", AdmissionYear: 2027, Category: "general", Track: generalTrack, Status: "불합격"},
		{ClassNum: 1, StudentNum: "1", StudentName: "가학생", AdmissionYear: 2027, Category: "special", SchoolName: "울산상업고", Track: "일반", Status: "지원완료"},
		{ClassNum: 1, StudentNum: "2", StudentName: "나학생", AdmissionYear: 2027, Category: "general", Track: generalTrack, Status: "지원예정"},
		{ClassNum: 1, StudentNum: "2", StudentName: "나학생", AdmissionYear: 2027, Category: "special", SchoolName: "울산상업고", Track: "일반", Status: "지원완료"},
	} {
		if err := dm.SaveApplication(rec); err != nil {
			t.Fatal(err)
		}
	}
	accepted := map[string]string{StudentKey(1, "1", "가학생"): "", StudentKey(1, "2", "나학생"): ""}
	sum, err := dm.BulkSetSchoolResults(2027, []int{1}, "special", "울산상업고", "일반", "final", accepted, true)
	if err != nil {
		t.Fatal(err)
	}
	if sum.Removed != 1 {
		t.Fatalf("결과가 없는 일반고 원서(나학생)만 지워야 합니다: %+v", sum)
	}
	if got := statusOf(t, dm, 1, "1", "가학생", "general"); got != "불합격" {
		t.Fatalf("가학생 일반고 불합격 기록이 남아야 합니다: %q", got)
	}
	if got := statusOf(t, dm, 1, "2", "나학생", "general"); got != "" {
		t.Fatalf("나학생 일반고 원서(결과 없음)는 지워져야 합니다: %q", got)
	}
}
