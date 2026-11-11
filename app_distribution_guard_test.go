package main

import (
	"os"
	"path/filepath"
	"testing"

	"PHGC/internal/database"
)

// 학년부장 폴더가 잠긴 상태(로그인 전)에서 담임 배포자료를 가져오려 해도 막혀야 하고,
// 학년부장의 암호화 DB가 지워지면 안 된다. 담임 폴더에서 다시 가져올 때는 기존 파일이 백업된다.
func TestDistributionImportGuardsLockedMasterFolderAndBacksUpTeacherFiles(t *testing.T) {
	masterDir := t.TempDir()
	master := &App{db: &database.DBManager{DataDir: masterDir}}
	if err := master.db.InitConfigDB(); err != nil {
		t.Fatal(err)
	}
	if err := master.SetupApp(database.SetupRequest{SchoolName: "보호테스트중학교", ClassCount: 1, AdminPassword: "admin-password", SharedDataPassword: "shared-password", AdmissionYear: 2027}); err != nil {
		t.Fatal(err)
	}
	if _, err := master.UnlockAndLogin("admin", "admin-password"); err != nil {
		t.Fatal(err)
	}
	if err := master.db.InitClassDB(1); err != nil {
		t.Fatal(err)
	}
	pkgPath := filepath.Join(t.TempDir(), "301.kkomipkg")
	if err := master.ExportDistributionPackage("301", pkgPath); err != nil {
		t.Fatal(err)
	}
	if err := master.db.SealAllDatabases(); err != nil {
		t.Fatal(err)
	}

	// 프로그램을 다시 켠 직후(잠긴 상태)의 학년부장 폴더
	locked := &App{db: &database.DBManager{DataDir: masterDir}}
	if _, err := locked.ImportDistributionPackage(pkgPath); err == nil {
		t.Fatal("잠긴 학년부장 폴더에 담임 배포자료를 덮어쓰면 안 됩니다")
	}
	for _, name := range []string{"config.db.kkomi", "class_1.db.kkomi"} {
		if _, err := os.Stat(filepath.Join(masterDir, name)); err != nil {
			t.Fatalf("학년부장 암호화 DB %s 가 보존되어야 합니다: %v", name, err)
		}
	}
	if _, err := locked.UnlockAndLogin("admin", "admin-password"); err != nil {
		t.Fatalf("거부 후에도 학년부장 로그인이 되어야 합니다: %v", err)
	}

	// 담임 폴더: 첫 가져오기 후 다시 가져오면 기존 암호화 DB가 백업 폴더에 복사된다.
	teacherDir := t.TempDir()
	teacher := &App{db: &database.DBManager{DataDir: teacherDir}}
	if _, err := teacher.ImportDistributionPackage(pkgPath); err != nil {
		t.Fatalf("담임 폴더 첫 가져오기: %v", err)
	}
	if _, err := teacher.ImportDistributionPackage(pkgPath); err != nil {
		t.Fatalf("담임 폴더 재가져오기: %v", err)
	}
	backups, _ := filepath.Glob(filepath.Join(teacherDir, "backup_before_pkg_import", "*", "class_1.db.kkomi"))
	if len(backups) == 0 {
		t.Fatal("재가져오기 전 담임의 기존 암호화 DB가 백업되어야 합니다")
	}
}
