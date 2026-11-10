package main

import (
	"encoding/json"
	"testing"

	"PHGC/internal/calc"
	"PHGC/internal/database"
	"PHGC/internal/model"
	"PHGC/internal/parser"
)

func TestStudentSchoolScoreCache(t *testing.T) {
	dm := &database.DBManager{DataDir: t.TempDir()}
	dm.SetDataKey(make([]byte, 32))
	if err := dm.InitClassDB(1); err != nil {
		t.Fatal(err)
	}
	results := []calc.SchoolCalcResult{
		{SchoolName: "울산공업고", TrackName: "일반", TotalScore: 82.5, TotalMax: 100},
		{SchoolName: "울산공업고", TrackName: "취업희망자", TotalScore: 47.25, TotalMax: 50},
	}
	if err := dm.ReplaceStudentSchoolScores(1, "1", "홍길동", results); err != nil {
		t.Fatal(err)
	}
	score, err := dm.GetStudentSchoolScore(1, "1", "홍길동", "울산공업고", "취업희망자")
	if err != nil {
		t.Fatal(err)
	}
	if score.TotalScore != 47.25 || score.TotalMax != 50 {
		t.Fatalf("unexpected cached score: %#v", score)
	}
}

func TestApplicationScoreSnapshotUsesCachedSchoolScore(t *testing.T) {
	dm := &database.DBManager{DataDir: t.TempDir()}
	dm.SetDataKey(make([]byte, 32))
	app := &App{db: dm}
	student := parser.StudentExcelData{
		ClassNum: 1, StudentNum: "1", Name: "홍길동",
		RawData: `[{"학년":"1","학기":"2","과목":"국어","성취도":"A"}]`,
	}
	if err := dm.SaveClassStudents(1, []parser.StudentExcelData{student}); err != nil {
		t.Fatal(err)
	}
	snapshot, err := app.GetStudentApplicationScoreSnapshot(1, "1", "홍길동", "special", "울산공업고등학교", "일반")
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.Score <= 0 || snapshot.TotalMax != 100 {
		t.Fatalf("unexpected snapshot: %#v", snapshot)
	}
}

func TestSaveApplicationStoresSnapshotProvenance(t *testing.T) {
	dm := &database.DBManager{DataDir: t.TempDir()}
	dm.SetDataKey(make([]byte, 32))
	student := parser.StudentExcelData{
		ClassNum: 1, StudentNum: "1", Name: "홍길동",
		RawData: `[{"학년":"1","학기":"2","과목":"국어","성취도":"A"}]`,
	}
	if err := dm.SaveClassStudents(1, []parser.StudentExcelData{student}); err != nil {
		t.Fatal(err)
	}
	if err := dm.SaveApplication(model.ApplicationRecord{
		ClassNum: 1, StudentNum: "1", StudentName: "홍길동", AdmissionYear: 2027,
		Category: "special", SchoolName: "울산공업고", Track: "일반", Status: "지원희망", Score: 80,
	}); err != nil {
		t.Fatal(err)
	}

	db, err := dm.OpenDB(dm.GetClassDBPath(1))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var raw string
	if err := db.QueryRow(`SELECT score_details_json FROM student_applications WHERE student_num='1'`).Scan(&raw); err != nil {
		t.Fatal(err)
	}
	var details model.ApplicationScoreDetails
	if err := json.Unmarshal([]byte(raw), &details); err != nil {
		t.Fatal(err)
	}
	if details.SnapshotSource != "application-save" || details.CapturedAt == "" {
		t.Fatalf("스냅샷 출처 메타데이터가 저장되지 않았습니다: %#v", details)
	}
}

func TestMarkLegacyApplicationScoreDetails(t *testing.T) {
	dm := &database.DBManager{DataDir: t.TempDir()}
	dm.SetDataKey(make([]byte, 32))
	if err := dm.InitClassDB(1); err != nil {
		t.Fatal(err)
	}
	db, err := dm.OpenDB(dm.GetClassDBPath(1))
	if err != nil {
		t.Fatal(err)
	}
	legacyJSON := `{"totalScore":180,"formulaVersion":"old-formula"}`
	if _, err := db.Exec(`INSERT INTO student_applications (student_num,student_name,admission_year,category,school_name,track,status,score,score_details_json) VALUES ('1','홍길동',2026,'meister','울산마이스터고','일반','합격',180,?)`, legacyJSON); err != nil {
		db.Close()
		t.Fatal(err)
	}
	db.Close()
	if err := dm.MarkLegacyClassApplicationScoreDetails(1); err != nil {
		t.Fatal(err)
	}
	db, err = dm.OpenDB(dm.GetClassDBPath(1))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var raw string
	if err := db.QueryRow(`SELECT score_details_json FROM student_applications WHERE student_num='1'`).Scan(&raw); err != nil {
		t.Fatal(err)
	}
	var details model.ApplicationScoreDetails
	if err := json.Unmarshal([]byte(raw), &details); err != nil {
		t.Fatal(err)
	}
	if details.SnapshotSource != "legacy-unknown" || details.CapturedAt != "" {
		t.Fatalf("기존 스냅샷 표기가 올바르지 않습니다: %#v", details)
	}
}
