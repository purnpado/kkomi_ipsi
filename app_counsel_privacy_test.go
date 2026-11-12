package main

import (
	"path/filepath"
	"testing"

	"PHGC/internal/database"
)

// 상담 일지는 작성자 본인만 본다: 학년부장이 쓴 기록은 담임 배포자료에 담기지 않고,
// 담임 PC에서는 담임 본인이 쓴 기록만 보인다.
func TestCounselingRecordsStayWithAuthor(t *testing.T) {
	master, _ := newMasterWithPackage(t, "상담격리중학교", "shared-pw")
	if err := master.SaveStudentCounselingRecord(database.StudentCounselingRecord{ClassNum: 1, StudentNum: "1", StudentName: "가상학생", CounselDate: "2026-11-02", Content: "학년부장만 아는 상담 내용"}); err != nil {
		t.Fatal(err)
	}
	pkg := filepath.Join(t.TempDir(), "301-privacy.kkomipkg")
	if err := master.ExportDistributionPackage("301", pkg); err != nil {
		t.Fatal(err)
	}
	// 학년부장 PC에서는 본인 기록이 그대로 보인다.
	own, err := master.GetStudentCounselingRecords(1, "1", "가상학생")
	if err != nil || len(own) != 1 {
		t.Fatalf("학년부장 본인 기록이 사라지면 안 됩니다: %v %v", own, err)
	}

	teacher := &App{db: &database.DBManager{DataDir: t.TempDir()}}
	if _, err := teacher.ImportDistributionPackageWithPassword(pkg, ""); err != nil {
		t.Fatal(err)
	}
	if _, err := teacher.UnlockSharedAndLogin("301", "teacher-initial", "shared-pw"); err != nil {
		t.Fatal(err)
	}
	if err := teacher.SaveStudentCounselingRecord(database.StudentCounselingRecord{ClassNum: 1, StudentNum: "1", StudentName: "가상학생", CounselDate: "2026-11-03", Content: "담임 상담"}); err != nil {
		t.Fatal(err)
	}
	seen, err := teacher.GetStudentCounselingRecords(1, "1", "가상학생")
	if err != nil {
		t.Fatal(err)
	}
	if len(seen) != 1 || seen[0].Content != "담임 상담" {
		t.Fatalf("담임에게는 담임 본인 기록만 보여야 합니다: %+v", seen)
	}
	// 파일 자체에도 학년부장 기록이 없어야 한다.
	db, err := teacher.db.OpenDB(teacher.db.GetClassDBPath(1))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var leaked int
	if err := db.QueryRow("SELECT COUNT(*) FROM student_counseling_records WHERE author_username <> '301'").Scan(&leaked); err != nil {
		t.Fatal(err)
	}
	if leaked != 0 {
		t.Fatalf("배포자료에 다른 교사의 상담 기록 %d건이 담겼습니다", leaked)
	}
}
