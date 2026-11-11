package main

import (
	"errors"
	"os"
	"path/filepath"
	"testing"

	"PHGC/internal/database"
	"PHGC/internal/exchange"
	"PHGC/internal/model"
	"PHGC/internal/parser"
)

// 학년부장 PC를 만들고 1반 담임용 배포자료를 내보낸다.
func newMasterWithPackage(t *testing.T, schoolName, shared string) (masterApp *App, pkgPath string) {
	t.Helper()
	dir := t.TempDir()
	master := &App{db: &database.DBManager{DataDir: dir}}
	if err := master.db.InitConfigDB(); err != nil {
		t.Fatal(err)
	}
	if err := master.SetupApp(database.SetupRequest{SchoolName: schoolName, ClassCount: 1, AdminPassword: "admin-pw", SharedDataPassword: shared, AdmissionYear: 2027}); err != nil {
		t.Fatal(err)
	}
	if _, err := master.UnlockAndLogin("admin", "admin-pw"); err != nil {
		t.Fatal(err)
	}
	if err := master.SetUserPassword("301", "teacher-initial"); err != nil {
		t.Fatal(err)
	}
	raw := `[{"학년":"1","학기":"2","과목":"국어","성취도":"A"}]`
	if err := master.db.SaveClassStudents(1, []parser.StudentExcelData{{ClassNum: 1, StudentNum: "1", Name: "가상학생", RawData: raw}}); err != nil {
		t.Fatal(err)
	}
	pkgPath = filepath.Join(t.TempDir(), "301.kkomipkg")
	if err := master.ExportDistributionPackage("301", pkgPath); err != nil {
		t.Fatal(err)
	}
	return master, pkgPath
}

func TestRedistributionMergesTeacherLocalDataWithPassword(t *testing.T) {
	master, pkgV1 := newMasterWithPackage(t, "병합테스트중학교", "shared-pw")

	// 담임 PC: 첫 배포자료 적용 → 로그인 → 상담·원서·수기 가산점 입력 → 종료(봉인)
	teacherDir := t.TempDir()
	teacher := &App{db: &database.DBManager{DataDir: teacherDir}}
	if exchange.DistributionImportNeedsPassword(teacher.db) {
		t.Fatal("빈 폴더에서는 암호가 필요 없어야 합니다")
	}
	if _, err := teacher.ImportDistributionPackageWithPassword(pkgV1, ""); err != nil {
		t.Fatalf("첫 배포자료 적용: %v", err)
	}
	if _, err := teacher.UnlockSharedAndLogin("301", "teacher-initial", "shared-pw"); err != nil {
		t.Fatalf("담임 첫 로그인: %v", err)
	}
	// 실제 운영처럼 첫 로그인 뒤 담임이 비밀번호를 바꾼다(학년부장 DB에는 반영되지 않음).
	if err := teacher.ChangeUserPassword("301", "teacher-changed"); err != nil {
		t.Fatal(err)
	}
	if err := teacher.SaveStudentCounselingRecord(database.StudentCounselingRecord{ClassNum: 1, StudentNum: "1", StudentName: "가상학생", CounselDate: "2026-11-01", Content: "담임 PC 상담 기록"}); err != nil {
		t.Fatal(err)
	}
	if err := teacher.SaveStudentApplication(model.ApplicationRecord{ClassNum: 1, StudentNum: "1", StudentName: "가상학생", AdmissionYear: 2027, Category: "meister", SchoolName: "울산마이스터고", Track: "일반", Status: "지원완료"}); err != nil {
		t.Fatal(err)
	}
	if err := teacher.SaveStudentExtra(1, "1", "가상학생", `{"leadership":2}`); err != nil {
		t.Fatal(err)
	}
	if err := teacher.db.SealAllDatabases(); err != nil {
		t.Fatal(err)
	}

	// 학년부장이 새 배포자료를 만든다(담임 입력은 아직 취합되지 않은 상태).
	pkgV2 := filepath.Join(t.TempDir(), "301-v2.kkomipkg")
	if err := master.ExportDistributionPackage("301", pkgV2); err != nil {
		t.Fatal(err)
	}
	_, otherPkg := newMasterWithPackage(t, "다른중학교", "other-shared")

	locked := &App{db: &database.DBManager{DataDir: teacherDir}}
	if !locked.DistributionImportNeedsPassword() {
		t.Fatal("기존 학급 자료가 있으면 병합용 암호가 필요해야 합니다")
	}
	if _, err := locked.ImportDistributionPackageWithPassword(pkgV2, ""); !errors.Is(err, exchange.ErrDistributionPasswordRequired) {
		t.Fatalf("암호 없이 병합 가져오기는 암호를 요구해야 합니다: %v", err)
	}
	if _, err := locked.ImportDistributionPackageWithPassword(pkgV2, "wrong-pw"); err == nil {
		t.Fatal("틀린 암호는 거부되어야 합니다")
	}
	if _, err := locked.ImportDistributionPackageWithPassword(otherPkg, "teacher-changed"); err == nil {
		t.Fatal("다른 학교 배포자료는 기존 자료를 지우기 전에 거부되어야 합니다")
	}
	if _, err := os.Stat(filepath.Join(teacherDir, "class_1.db.kkomi")); err != nil {
		t.Fatalf("거부된 시도 뒤에도 기존 학급 DB가 남아 있어야 합니다: %v", err)
	}

	result, err := locked.ImportDistributionPackageWithPassword(pkgV2, "teacher-changed")
	if err != nil {
		t.Fatalf("본인 비밀번호로 병합 가져오기: %v", err)
	}
	if !result.MergedWithLocalData || result.PreservedClasses != 1 || result.Counsels != 1 || result.Applications != 1 || result.Overrides != 1 || result.BackupFolder == "" {
		t.Fatalf("병합 결과 건수가 올바르지 않습니다: %#v", result)
	}

	// 새 배포자료로 로그인하면 담임이 입력했던 자료가 그대로 보여야 한다.
	// 개인 잠금 파일은 백업되었으므로, 로그인 화면은 공용 데이터 암호 + 초기 비밀번호로 다시 등록하게 한다.
	after := &App{db: &database.DBManager{DataDir: teacherDir}}
	if !after.NeedsSharedDataPassword("301") {
		t.Fatal("재가져오기 후에는 공용 데이터 암호로 다시 등록해야 합니다(예전 개인 잠금 파일과 새 계정 정보 불일치 방지)")
	}
	if _, err := os.Stat(filepath.Join(result.BackupFolder, "keys", "301.json")); err != nil {
		t.Fatalf("예전 개인 잠금 파일은 백업 폴더에 보관되어야 합니다: %v", err)
	}
	if _, err := after.UnlockSharedAndLogin("301", "teacher-initial", "shared-pw"); err != nil {
		t.Fatalf("재가져오기 후 로그인: %v", err)
	}
	counsels, err := after.GetStudentCounselingRecords(1, "1", "가상학생")
	if err != nil || len(counsels) != 1 || counsels[0].Content != "담임 PC 상담 기록" {
		t.Fatalf("상담 기록이 옮겨져야 합니다: %#v, %v", counsels, err)
	}
	apps, err := after.GetStudentApplications(1, "1", "가상학생")
	if err != nil || len(apps) != 1 || apps[0].Status != "지원완료" {
		t.Fatalf("지원현황이 옮겨져야 합니다: %#v, %v", apps, err)
	}
	student, err := after.db.GetStudent(1, "1", "가상학생")
	if err != nil || student.ExtraData != `{"leadership":2}` {
		t.Fatalf("직접 입력한 가산점이 옮겨져야 합니다: %#v, %v", student, err)
	}
	if err := after.db.SealAllDatabases(); err != nil {
		t.Fatal(err)
	}

	// 공용 데이터 암호로도 병합할 수 있어야 한다(같은 자료를 다시 넣어도 상담이 중복되지 않음).
	again := &App{db: &database.DBManager{DataDir: teacherDir}}
	result, err = again.ImportDistributionPackageWithPassword(pkgV2, "shared-pw")
	if err != nil || result.Counsels != 1 {
		t.Fatalf("공용 데이터 암호로 병합 가져오기: %#v, %v", result, err)
	}
	if _, err := again.UnlockSharedAndLogin("301", "teacher-initial", "shared-pw"); err != nil {
		t.Fatal(err)
	}
	if counsels, _ := again.GetStudentCounselingRecords(1, "1", "가상학생"); len(counsels) != 1 {
		t.Fatalf("상담 기록이 중복되면 안 됩니다: %d건", len(counsels))
	}
}
