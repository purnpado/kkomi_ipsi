package database

import (
	"os"
	"path/filepath"
	"testing"

	"PHGC/internal/parser"
)

// 새 학년 시작은 작업용 평문과 암호화 보관본(.kkomi)을 모두 보관 폴더로 옮겨야 한다.
// 보관본이 남으면 새 자료를 올리지 않은 반의 옛 학생이 다음 로그인 때 되살아난다.
func TestResetAcademicYearMovesSealedClassFiles(t *testing.T) {
	dm := &DBManager{DataDir: t.TempDir()}
	dm.SetDataKey(make([]byte, 32))
	if err := dm.InitConfigDB(); err != nil {
		t.Fatal(err)
	}
	if err := dm.SaveSchoolConfig("테스트중학교", 2, "", false, 2027); err != nil {
		t.Fatal(err)
	}
	for c := 1; c <= 2; c++ {
		if err := dm.SaveClassStudents(c, []parser.StudentExcelData{{ClassNum: c, StudentNum: "1", Name: "옛학생"}}); err != nil {
			t.Fatal(err)
		}
	}
	if err := dm.SealAllDatabases(); err != nil { // 프로그램 종료 시 봉인
		t.Fatal(err)
	}
	if err := dm.UnsealAllDatabases(); err != nil { // 다시 로그인
		t.Fatal(err)
	}
	if err := dm.ResetAcademicYear(2028); err != nil {
		t.Fatal(err)
	}
	left, _ := filepath.Glob(filepath.Join(dm.DataDir, "class_*"))
	if len(left) != 0 {
		t.Fatalf("학급 파일이 남아 있음: %v", left)
	}
	backups, _ := filepath.Glob(filepath.Join(dm.DataDir, "backup_new_year", "*", "class_*.db.kkomi"))
	if len(backups) != 2 {
		t.Fatalf("보관 폴더의 암호화 학급 파일 = %d, want 2", len(backups))
	}
	// 봉인·재로그인 뒤에도 옛 학생이 되살아나지 않아야 한다.
	if err := dm.SealAllDatabases(); err != nil {
		t.Fatal(err)
	}
	if err := dm.UnsealAllDatabases(); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(dm.GetClassDBPath(1)); err == nil {
		t.Fatal("새 학년 시작 후 옛 1반 DB가 되살아남")
	}
	cfg, _ := dm.GetSchoolConfig()
	if cfg.AdmissionYear != 2028 {
		t.Fatalf("학년도 = %d, want 2028", cfg.AdmissionYear)
	}
}
