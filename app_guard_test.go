package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"PHGC/internal/database"
)

// 백엔드 권한 확인: 화면에서 버튼을 감추지 못해도 진로부장·담임·로그인 전 사용자는
// 학년부장 작업을 할 수 없어야 한다(AGENTS.md 원칙 4).
func TestBackendRejectsNonMasterWrites(t *testing.T) {
	dir := t.TempDir()
	master := &App{db: &database.DBManager{DataDir: dir}}
	if err := master.db.InitConfigDB(); err != nil {
		t.Fatal(err)
	}
	if err := master.SetupApp(database.SetupRequest{SchoolName: "권한중학교", ClassCount: 2, AdminPassword: "admin-pw", SharedDataPassword: "shared-pw", AdmissionYear: 2027}); err != nil {
		t.Fatal(err)
	}
	if _, err := master.UnlockAndLogin("admin", "admin-pw"); err != nil {
		t.Fatal(err)
	}

	// 같은 자료를 보는 다른 역할(로그인한 것으로 둔다)과 로그인 전 상태
	viewer := &App{db: master.db, dataKey: master.dataKey, user: &database.User{Username: "jinro", Role: "viewer"}}
	homeroom := &App{db: master.db, dataKey: master.dataKey, user: &database.User{Username: "301", Role: "homeroom", ClassNum: 1}}
	anonymous := &App{db: master.db}

	cutoff := []database.CutoffInfo{{Year: 2027, SchoolName: "울산마이스터고", Track: "일반", MinValue: 250}}
	writes := map[string]func(a *App) error{
		"SaveCutoffs":               func(a *App) error { return a.SaveCutoffs(cutoff) },
		"ResetCutoffs":              func(a *App) error { return a.ResetCutoffs(2027) },
		"ResetAllData":              func(a *App) error { return a.ResetAllData() },
		"SaveOfficialAdmissionData": func(a *App) error { return a.SaveOfficialAdmissionData(nil) },
		"CreateUser":                func(a *App) error { return a.CreateUser("teacher9", "pw", "homeroom", 2) },
		"DeleteUser":                func(a *App) error { return a.DeleteUser("302") },
		"SetUserPassword":           func(a *App) error { return a.SetUserPassword("admin", "taken-over") },
		"ProcessMultipleExcel": func(a *App) error {
			_, err := a.ProcessMultipleExcel([]string{filepath.Join(dir, "없는파일.xlsx")})
			return err
		},
		"ImportTeacherPatchSelected": func(a *App) error {
			_, err := a.ImportTeacherPatchSelected("shared-pw", filepath.Join(dir, "없는파일.kkomipatch"), nil)
			return err
		},
		"UpdateSchoolRankSnapshots": func(a *App) error { return a.UpdateSchoolRankSnapshots() },
	}
	for name, call := range writes {
		for role, app := range map[string]*App{"viewer": viewer, "homeroom": homeroom, "anonymous": anonymous} {
			err := call(app)
			if err == nil || !(strings.Contains(err.Error(), "학년부장") || strings.Contains(err.Error(), "로그인")) {
				t.Errorf("%s 를 %s 가 실행할 수 있으면 안 됩니다: %v", name, role, err)
			}
		}
	}
	// 거부된 전체 초기화는 자료 폴더를 지우지 않아야 한다.
	if _, err := os.Stat(master.db.GetConfigDBPath()); err != nil {
		t.Fatalf("거부된 전체 초기화가 자료를 지웠습니다: %v", err)
	}

	// 비밀번호 바꾸기는 본인만(학년부장은 누구나)
	if err := homeroom.ChangeUserPassword("admin", "taken-over"); err == nil {
		t.Error("담임이 학년부장 비밀번호를 바꿀 수 있으면 안 됩니다")
	}
	// 취합자료는 해당 반 담임만 만든다
	if err := homeroom.ExportTeacherPatch("shared-pw", "301", 2, nil, filepath.Join(dir, "x.kkomipatch")); err == nil {
		t.Error("담임이 다른 반 취합자료를 만들 수 있으면 안 됩니다")
	}
	// 초기 설정이 끝난 뒤 로그인 없이 다시 설정할 수 없다(새 키로 기존 자료를 잃지 않도록)
	if err := anonymous.SetupApp(database.SetupRequest{SchoolName: "가로채기", ClassCount: 1, AdminPassword: "x", SharedDataPassword: "y", AdmissionYear: 2027}); err == nil {
		t.Error("설정이 끝난 뒤 로그인 없이 초기 설정을 다시 할 수 있으면 안 됩니다")
	}
	// 학년부장은 그대로 할 수 있다
	if err := master.SaveCutoffs(cutoff); err != nil {
		t.Errorf("학년부장의 커트라인 저장이 막히면 안 됩니다: %v", err)
	}
	if err := master.SetUserPassword("302", "new-initial"); err != nil {
		t.Errorf("학년부장의 비밀번호 설정이 막히면 안 됩니다: %v", err)
	}
}
