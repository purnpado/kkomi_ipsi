package main

import (
	"path/filepath"
	"testing"

	"PHGC/internal/database"
	"PHGC/internal/exchange"
	"PHGC/internal/model"
)

// 배포 → 담임이 학교 바꾸기·지우기·고치기 → 학년부장도 배포 뒤 고침 → 일괄 병합·상세 검토.
// 학년부장 PC가 최종본이므로 일괄 병합은 아무것도 지우거나 덮지 않고, 상세 검토 기본값은
// 담임의 바꾸기·지우기는 반영하되 학년부장이 배포 뒤 고친 원서는 지킨다.
func TestPatchConflictFlowKeepsGradeHeadFinal(t *testing.T) {
	master, _ := newMasterWithPackage(t, "충돌테스트중학교", "shared-pw")
	app := func(category, school, track, status string) model.ApplicationRecord {
		return model.ApplicationRecord{ClassNum: 1, StudentNum: "1", StudentName: "가상학생", AdmissionYear: 2027, Category: category, SchoolName: school, Track: track, Status: status}
	}
	for _, r := range []model.ApplicationRecord{
		// 이중지원 금지 규칙에 맞는 원서: 마이스터고 불합격 → 특성화고, 특성화고 일반전형 불합격 → 특별전형
		app("meister", "울산마이스터고", "일반전형", "불합격"),
		app("special", "울산상고", "일반전형", "불합격"),
		app("special", "울산공고", "취업희망자 특별전형", "지원예정"),
	} {
		if err := master.SaveStudentApplication(r); err != nil {
			t.Fatal(err)
		}
	}
	shift := func(dm *database.DBManager, sql string) {
		t.Helper()
		db, err := dm.OpenDB(dm.GetClassDBPath(1))
		if err != nil {
			t.Fatal(err)
		}
		defer db.Close()
		if _, err := db.Exec(sql); err != nil {
			t.Fatal(err)
		}
	}
	// 같은 초 안에 일어나지 않도록 배포 전 원서 시각을 앞으로 당긴다.
	shift(master.db, `UPDATE student_applications SET updated_at = datetime('now', '-1 hour')`)
	pkg := filepath.Join(t.TempDir(), "301.kkomipkg")
	if err := master.ExportDistributionPackage("301", pkg); err != nil {
		t.Fatal(err)
	}

	teacher := &App{db: &database.DBManager{DataDir: t.TempDir()}}
	if _, err := teacher.ImportDistributionPackageWithPassword(pkg, ""); err != nil {
		t.Fatal(err)
	}
	if _, err := teacher.UnlockSharedAndLogin("301", "teacher-initial", "shared-pw"); err != nil {
		t.Fatal(err)
	}
	if d, _ := teacher.db.GetClassMeta(1, database.MetaDistributedAt); d == "" {
		t.Fatal("배포 사본에 배포 시각이 있어야 합니다")
	}
	rows, _ := teacher.GetStudentApplications(1, "1", "가상학생")
	for _, r := range rows {
		switch r.SchoolName {
		case "울산공고": // 학교를 바꾼다(제자리 수정)
			r.SchoolName = "울산여상"
			if err := teacher.SaveStudentApplication(r); err != nil {
				t.Fatal(err)
			}
		case "울산상고":
			if err := teacher.DeleteStudentApplication(1, "1", "가상학생", r.Category, r.SchoolName, r.Track); err != nil {
				t.Fatal(err)
			}
		case "울산마이스터고": // 담임도 고친다(메모)
			r.ScoreBasis = "담임 메모"
			if err := teacher.SaveStudentApplication(r); err != nil {
				t.Fatal(err)
			}
		}
	}
	shift(teacher.db, `UPDATE student_applications SET updated_at = datetime(updated_at, '+1 minute')`)
	shift(teacher.db, `UPDATE application_deletions SET deleted_at = datetime(deleted_at, '+1 minute')`)
	changes, err := teacher.db.GetClassPatchChanges(1)
	if err != nil {
		t.Fatal(err)
	}
	patchPath := filepath.Join(t.TempDir(), "301.kkomipatch")
	if err := exchange.ExportTeacherPatch(teacher.db, "shared-pw", "301", 1, changes, patchPath); err != nil {
		t.Fatal(err)
	}

	// 학년부장도 배포 뒤 마이스터고 원서를 고친다(메모 — 합격이면 이중지원 금지로 새 원서가 막혀 이 흐름과 다르다).
	for _, r := range mustApps(t, master) {
		if r.SchoolName == "울산마이스터고" {
			r.ScoreBasis = "학년부장 메모"
			if err := master.SaveStudentApplication(r); err != nil {
				t.Fatal(err)
			}
		}
	}
	shift(master.db, `UPDATE student_applications SET updated_at = datetime('now', '+2 minutes') WHERE school_name = '울산마이스터고'`)

	preview, err := master.InspectTeacherPatch("shared-pw", patchPath)
	if err != nil {
		t.Fatal(err)
	}
	if preview.Legacy || preview.ReviewCount != 3 {
		t.Fatalf("확인 필요 3건(학교 바꿈·지움·양쪽 고침)이어야 합니다: %+v", preview)
	}
	kinds := map[string]bool{}
	for _, item := range preview.Items[0].ApplicationItems {
		kinds[item.Kind] = true
	}
	for _, k := range []string{database.PatchKindRename, database.PatchKindTeacherDeleted, database.PatchKindConflictEdit} {
		if !kinds[k] {
			t.Fatalf("%s 분류가 있어야 합니다: %+v", k, preview.Items[0].ApplicationItems)
		}
	}

	// 일괄 병합: 학년부장 것을 그대로 두고 3건을 알린다.
	count, held, err := exchange.ImportTeacherPatchBulk(master.db, "shared-pw", patchPath)
	if err != nil || count != 1 || held != 3 {
		t.Fatalf("일괄 병합: count=%d held=%d err=%v", count, held, err)
	}
	assertSchools(t, master, map[string]string{"울산공고": "지원예정", "울산상고": "불합격", "울산마이스터고": "불합격"})

	// 상세 검토 기본값: 학교 바꿈·지움은 반영, 학년부장이 고친 원서는 유지.
	if _, err := master.ImportTeacherPatchSelected("shared-pw", patchPath, []model.PatchMergeSelection{{StudentNum: "1", Applications: true}}); err != nil {
		t.Fatal(err)
	}
	assertSchools(t, master, map[string]string{"울산여상": "지원예정", "울산마이스터고": "불합격"})
}

func mustApps(t *testing.T, a *App) []model.ApplicationRecord {
	t.Helper()
	rows, err := a.GetStudentApplications(1, "1", "가상학생")
	if err != nil {
		t.Fatal(err)
	}
	return rows
}

func assertSchools(t *testing.T, a *App, want map[string]string) {
	t.Helper()
	rows := mustApps(t, a)
	got := map[string]string{}
	for _, r := range rows {
		got[r.SchoolName] = r.Status
	}
	if len(got) != len(want) {
		t.Fatalf("학년부장 원서 %v, 기대 %v", got, want)
	}
	for k, v := range want {
		if got[k] != v {
			t.Fatalf("학년부장 원서 %v, 기대 %v", got, want)
		}
	}
}
