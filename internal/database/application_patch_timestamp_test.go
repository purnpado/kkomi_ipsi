package database

import (
	"testing"

	"PHGC/internal/model"
)

func TestPatchApplicationKeepsNewestAndIgnoresForeignID(t *testing.T) {
	dm := newEvidenceTestDB(t)
	r := model.ApplicationRecord{ClassNum: 1, StudentNum: "1", StudentName: "가상학생", AdmissionYear: 2027, Category: "other", SchoolName: "타시도고", Track: "해당 없음", Status: "합격"}
	if err := dm.SaveApplication(r); err != nil {
		t.Fatal(err)
	}
	db, err := dm.OpenDB(dm.GetClassDBPath(1))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`UPDATE student_applications SET updated_at='2026-11-18 10:00:00'`); err != nil {
		t.Fatal(err)
	}
	db.Close()
	patch := model.PatchChange{ClassNum: 1, StudentNum: "1", StudentName: "가상학생"}
	apply := func(timestamp, status string) {
		t.Helper()
		incoming := r
		incoming.ID = 999
		incoming.UpdatedAt = timestamp
		incoming.Status = status
		patch.Applications = []model.ApplicationRecord{incoming}
		if err := dm.ApplyPatchChange(patch); err != nil {
			t.Fatal(err)
		}
	}
	preview := func(timestamp string, expected bool) {
		t.Helper()
		candidate := r
		candidate.UpdatedAt = timestamp
		candidate.Status = "불합격"
		plan, err := dm.PlanPatchApplications(model.PatchChange{ClassNum: 1, StudentNum: "1", StudentName: "가상학생", Applications: []model.ApplicationRecord{candidate}}, PatchBase{})
		skip := plan.Silent == 1 && len(plan.Items()) == 0
		if err != nil || skip != expected {
			t.Fatalf("preview %q: skip=%v err=%v", timestamp, skip, err)
		}
	}
	check := func(want string) {
		t.Helper()
		rows, err := dm.GetStudentApplications(1, "1", "가상학생")
		if err != nil || len(rows) != 1 || rows[0].Status != want {
			t.Fatalf("want %s: %+v %v", want, rows, err)
		}
	}
	preview("2026-11-18 09:00:00", true)
	preview("2026-11-18 11:00:00", false)
	apply("2026-11-18 09:00:00", "불합격")
	check("합격")
	apply("", "불합격")
	check("합격")
	apply("2026-11-18 10:00:00", "불합격")
	check("합격")
	apply("2026-11-18 11:00:00", "불합격")
	check("불합격")
	apply("2026-11-18 10:30:00", "합격")
	check("불합격")
}
