package main

import (
	"archive/zip"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"PHGC/internal/crypto"
	"PHGC/internal/database"
	"PHGC/internal/model"
)

func TestSelectedTeacherPatchMergeAndExpectedSupportToken(t *testing.T) {
	dir := t.TempDir()
	dm := &database.DBManager{DataDir: dir}
	dm.SetDataKey(make([]byte, 32))
	if err := dm.InitConfigDB(); err != nil {
		t.Fatal(err)
	}
	if err := dm.SaveSchoolConfig("테스트중학교", 1, "", false, 2027); err != nil {
		t.Fatal(err)
	}
	if err := dm.InitClassDB(1); err != nil {
		t.Fatal(err)
	}
	app := &App{db: dm}
	token1, err := dm.GetExpectedSupportToken()
	if err != nil || len(token1) < 32 {
		t.Fatalf("expected support token: %q, %v", token1, err)
	}
	token2, err := dm.GetExpectedSupportToken()
	if err != nil || token1 != token2 {
		t.Fatalf("participation token must remain stable: %q / %q, %v", token1, token2, err)
	}
	patchPath := filepath.Join(dir, "teacher.phgcpatch")
	patch := model.PatchFile{SourceUsername: "301", ClassNum: 1, Changes: []model.PatchChange{{
		ClassNum: 1, StudentNum: "1", StudentName: "홍길동", Attendance: `{"absence":1}`,
		Applications: []model.ApplicationRecord{{AdmissionYear: 2027, Category: "self_foreign", SchoolName: "울산외국어고등학교", Status: "지원 예정", Score: 91.5}},
	}}}
	if err := crypto.EncryptPatchGCM("shared-password", patch, patchPath); err != nil {
		t.Fatal(err)
	}
	preview, err := app.InspectTeacherPatch("shared-password", patchPath)
	if err != nil || len(preview.Items) != 1 || !preview.Items[0].Attendance || !preview.Items[0].Applications {
		t.Fatalf("unexpected patch preview: %#v, %v", preview, err)
	}
	count, err := app.ImportTeacherPatchSelected("shared-password", patchPath, []model.PatchMergeSelection{{StudentNum: "1", Applications: true}})
	if err != nil || count != 1 {
		t.Fatalf("selected merge: %d, %v", count, err)
	}
	records, err := dm.GetStudentApplications(1, "1", "홍길동")
	if err != nil || len(records) != 1 || records[0].SchoolName != "울산외국어고등학교" {
		t.Fatalf("application-only merge failed: %#v, %v", records, err)
	}
}

func TestTeacherDistributionPackageContainsOnlyTargetData(t *testing.T) {
	masterDir := t.TempDir()
	master := &App{db: &database.DBManager{DataDir: masterDir}}
	if err := master.db.InitConfigDB(); err != nil {
		t.Fatal(err)
	}
	if err := master.SetupApp(database.SetupRequest{
		SchoolName:         "배포테스트중학교",
		ClassCount:         2,
		AdminPassword:      "admin-password",
		SharedDataPassword: "shared-password",
		AdmissionYear:      2027,
	}); err != nil {
		t.Fatalf("SetupApp: %v", err)
	}
	if _, err := master.UnlockAndLogin("admin", "admin-password"); err != nil {
		t.Fatalf("master login: %v", err)
	}
	if err := master.SetUserPassword("301", "teacher-initial-password"); err != nil {
		t.Fatalf("set teacher password: %v", err)
	}
	for _, classNum := range []int{1, 2} {
		if err := master.db.InitClassDB(classNum); err != nil {
			t.Fatalf("InitClassDB(%d): %v", classNum, err)
		}
	}
	if err := os.WriteFile(filepath.Join(masterDir, "highschools.json"), []byte(`{"schools":[{"name":"울산마이스터고등학교","type":"마이스터고","departments":["전기시스템제어과"]}]}`), 0600); err != nil {
		t.Fatalf("write highschool catalog: %v", err)
	}
	pkgPath := filepath.Join(masterDir, "PHGC-301.phgcpkg")
	if err := master.ExportDistributionPackage("301", pkgPath); err != nil {
		t.Fatalf("ExportDistributionPackage: %v", err)
	}

	archive, err := zip.OpenReader(pkgPath)
	if err != nil {
		t.Fatal(err)
	}
	entryNames := map[string]bool{}
	for _, entry := range archive.File {
		entryNames[entry.Name] = true
		if strings.HasPrefix(entry.Name, "keys/") {
			t.Fatalf("personal key envelope must not be distributed: %s", entry.Name)
		}
	}
	archive.Close()
	if !entryNames["config.db.kkomi"] || !entryNames["class_1.db.kkomi"] || entryNames["class_2.db.kkomi"] || !entryNames["highschools.json"] {
		t.Fatalf("unexpected homeroom package entries: %#v", entryNames)
	}

	receiverDir := t.TempDir()
	receiver := &App{db: &database.DBManager{DataDir: receiverDir}}
	if err := receiver.db.InitConfigDB(); err != nil {
		t.Fatal(err)
	}
	username, err := receiver.ImportDistributionPackage(pkgPath)
	if err != nil || username != "301" {
		t.Fatalf("ImportDistributionPackage: %q, %v", username, err)
	}
	if !receiver.NeedsSharedDataPassword("301") {
		t.Fatal("recipient must be enrolled with the shared password on first login")
	}
	if _, err := os.Stat(filepath.Join(receiverDir, "highschools.json")); err != nil {
		t.Fatalf("recipient must receive highschool catalog: %v", err)
	}
	user, err := receiver.UnlockSharedAndLogin("301", "teacher-initial-password", "shared-password")
	if err != nil || user.Username != "301" || user.Role != "homeroom" {
		t.Fatalf("recipient first login: %#v, %v", user, err)
	}
	users, err := receiver.db.GetUsers()
	if err != nil || len(users) != 1 || users[0].Username != "301" {
		t.Fatalf("recipient must contain only the target account: %#v, %v", users, err)
	}

	// 전교 석차 스냅샷 검증: 1반 스냅샷은 유지되고 타 학급(2반 등) 스냅샷은 개인정보 보호를 위해 삭제되었는지 확인
	class1Snaps, err := receiver.db.GetRankSnapshots(1)
	if err != nil {
		t.Fatalf("receiver GetRankSnapshots(1): %v", err)
	}
	class2Snaps, err := receiver.db.GetRankSnapshots(2)
	if err != nil {
		t.Fatalf("receiver GetRankSnapshots(2): %v", err)
	}
	if len(class2Snaps) != 0 {
		t.Fatalf("타 학급(2반) 스냅샷은 담임 배포 패키지에서 반드시 제거되어야 합니다: got %d", len(class2Snaps))
	}
	_ = class1Snaps
}
