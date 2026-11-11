package database

import (
	"os"
	"path/filepath"
	"testing"

	"PHGC/internal/crypto"
)

// 구버전(PHGC) 확장자 *.db.phgc 로 봉인된 data 폴더가 로그인(봉인 해제) 시
// *.db.kkomi 로 자동 전환되고, 원본 .phgc 는 삭제되지 않고 백업 폴더에 남는지 확인한다.
func TestLegacyPhgcDatabasesMigrateToKkomiWithBackup(t *testing.T) {
	dir := t.TempDir()
	key, err := crypto.NewDataKey()
	if err != nil {
		t.Fatal(err)
	}
	dm := &DBManager{DataDir: dir}
	dm.SetDataKey(key)
	if err := dm.InitConfigDB(); err != nil {
		t.Fatal(err)
	}
	if err := dm.SaveSchoolConfig("구버전중학교", 1, "hash", false, 2026); err != nil {
		t.Fatal(err)
	}
	if err := dm.InitClassDB(1); err != nil {
		t.Fatal(err)
	}
	if err := dm.SealAllDatabases(); err != nil {
		t.Fatal(err)
	}
	// 구버전 data 폴더 모양으로 확장자를 되돌린다.
	for _, name := range []string{"config.db", "class_1.db"} {
		if err := os.Rename(filepath.Join(dir, name+".kkomi"), filepath.Join(dir, name+".phgc")); err != nil {
			t.Fatal(err)
		}
	}

	restarted := &DBManager{DataDir: dir}
	if !restarted.HasEncryptedConfigDB() {
		t.Fatal("구버전 config.db.phgc 도 봉인된 학교 자료로 인식해야 합니다")
	}
	restarted.SetDataKey(key)
	if err := restarted.UnsealAllDatabases(); err != nil {
		t.Fatalf("구버전 자료 봉인 해제 실패: %v", err)
	}
	config, err := restarted.GetSchoolConfig()
	if err != nil || config == nil || config.SchoolName != "구버전중학교" || config.AdmissionYear != 2026 {
		t.Fatalf("전환 후 학교 설정이 보존되어야 합니다: %#v, %v", config, err)
	}
	for _, name := range []string{"config.db", "class_1.db"} {
		if _, err := os.Stat(filepath.Join(dir, name+".kkomi")); err != nil {
			t.Fatalf("%s.kkomi 가 만들어져야 합니다: %v", name, err)
		}
		if _, err := os.Stat(filepath.Join(dir, name+".phgc")); !os.IsNotExist(err) {
			t.Fatalf("%s.phgc 는 data 폴더에서 치워져야 합니다", name)
		}
		if _, err := os.Stat(filepath.Join(dir, crypto.LegacyBackupDirName, name+".phgc")); err != nil {
			t.Fatalf("%s.phgc 원본이 백업 폴더에 보존되어야 합니다: %v", name, err)
		}
	}

	// 종료(봉인) 후 다시 열어도 .kkomi 만으로 정상 동작해야 한다.
	if err := restarted.SealAllDatabases(); err != nil {
		t.Fatal(err)
	}
	again := &DBManager{DataDir: dir}
	again.SetDataKey(key)
	if err := again.UnsealAllDatabases(); err != nil {
		t.Fatalf("전환 후 재실행 봉인 해제 실패: %v", err)
	}
	if config, err := again.GetSchoolConfig(); err != nil || config.SchoolName != "구버전중학교" {
		t.Fatalf("재실행 후 학교 설정 불일치: %#v, %v", config, err)
	}
}

// v1.6.2 학급 DB처럼 score_details_json·assigned_school 열이 없는 구조에서도
// 로그인 직후 구조 갱신(MigrateExistingClassDBs)을 거치면 학교 전체 원서 조회에 빠짐없이 나와야 한다.
func TestLegacyClassDBSchemaMigratedBeforeApplicationQueries(t *testing.T) {
	dir := t.TempDir()
	key, err := crypto.NewDataKey()
	if err != nil {
		t.Fatal(err)
	}
	dm := &DBManager{DataDir: dir}
	dm.SetDataKey(key)
	if err := dm.InitConfigDB(); err != nil {
		t.Fatal(err)
	}
	if err := dm.SaveSchoolConfig("구버전중학교", 1, "hash", false, 2026); err != nil {
		t.Fatal(err)
	}
	db, err := dm.OpenDB(dm.GetClassDBPath(1))
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(`
		CREATE TABLE student_applications (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			student_num TEXT NOT NULL, student_name TEXT NOT NULL, admission_year INTEGER NOT NULL,
			category TEXT NOT NULL, school_name TEXT DEFAULT '', track TEXT DEFAULT '',
			status TEXT NOT NULL DEFAULT '미입력', score REAL DEFAULT 0, score_basis TEXT DEFAULT '',
			preferences_json TEXT DEFAULT '[]', assigned_department TEXT DEFAULT '',
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(student_num, student_name, admission_year, category, school_name, track));
		INSERT INTO student_applications (student_num, student_name, admission_year, category, school_name, track, status)
			VALUES ('1', '옛학생하나', 2026, 'meister', '울산마이스터고', '일반', '지원완료');`)
	db.Close()
	if err != nil {
		t.Fatal(err)
	}

	before, _ := dm.GetSchoolApplicationRecords()
	if len(before) != 0 {
		t.Fatalf("구조 갱신 전에는 조회가 그 반을 건너뛰는 기존 동작을 재현해야 합니다: %d건", len(before))
	}
	if err := dm.MigrateExistingClassDBs(); err != nil {
		t.Fatal(err)
	}
	after, err := dm.GetSchoolApplicationRecords()
	if err != nil || len(after) != 1 || after[0].Status != "지원완료" || after[0].AdmissionYear != 2026 {
		t.Fatalf("구조 갱신 후 기존 원서가 보존·조회되어야 합니다: %#v, %v", after, err)
	}
}
