package database

import (
	"os"
	"path/filepath"
	"testing"

	"PHGC/internal/model"
)

func TestDatabaseSealAndUnsealLifecycle(t *testing.T) {
	dir := t.TempDir()
	dm := &DBManager{DataDir: dir}
	key := make([]byte, 32)
	for i := range key {
		key[i] = byte(i + 1)
	}
	dm.SetDataKey(key)

	if err := dm.InitConfigDB(); err != nil {
		t.Fatalf("InitConfigDB: %v", err)
	}
	if err := dm.SaveSchoolConfig("테스트중학교", 2, "hash", false, 2026); err != nil {
		t.Fatalf("SaveSchoolConfig: %v", err)
	}
	if err := dm.SealAllDatabases(); err != nil {
		t.Fatalf("SealAllDatabases: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, "config.db")); !os.IsNotExist(err) {
		t.Fatalf("plaintext config.db must not remain, err=%v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, "config.db.kkomi")); err != nil {
		t.Fatalf("encrypted config DB missing: %v", err)
	}

	reopened := &DBManager{DataDir: dir}
	reopened.SetDataKey(key)
	if err := reopened.UnsealAllDatabases(); err != nil {
		t.Fatalf("UnsealAllDatabases: %v", err)
	}
	config, err := reopened.GetSchoolConfig()
	if err != nil {
		t.Fatalf("GetSchoolConfig: %v", err)
	}
	if config.SchoolName != "테스트중학교" || config.ClassCount != 2 {
		t.Fatalf("unexpected restored config: %#v", config)
	}
}

func TestApplicationRecordPersistsAndTeacherPatchMerges(t *testing.T) {
	dir := t.TempDir()
	dm := &DBManager{DataDir: dir}
	dm.SetDataKey(make([]byte, 32))
	if err := dm.InitClassDB(301); err != nil {
		t.Fatalf("InitClassDB: %v", err)
	}
	record := model.ApplicationRecord{
		ClassNum: 301, StudentNum: "1", StudentName: "홍길동", AdmissionYear: 2027,
		Category: "special", SchoolName: "울산산업고등학교", Track: "일반전형",
		Status: "지원 예정", Score: 81.25, ScoreBasis: "3-1 누적 예상", Preferences: []string{"보건간호과", "식품가공과", "반려동물과", "원예디자인과", "그린스마트팜과"},
	}
	if err := dm.ApplyPatchChange(model.PatchChange{ClassNum: 301, StudentNum: "1", StudentName: "홍길동", Applications: []model.ApplicationRecord{record}}); err != nil {
		t.Fatalf("ApplyPatchChange: %v", err)
	}
	records, err := dm.GetStudentApplications(301, "1", "홍길동")
	if err != nil {
		t.Fatalf("GetStudentApplications: %v", err)
	}
	if len(records) != 1 || records[0].SchoolName != "울산산업고등학교" || len(records[0].Preferences) != 5 {
		t.Fatalf("unexpected application records: %#v", records)
	}
	if err := dm.SaveApplication(model.ApplicationRecord{ClassNum: 301, StudentNum: "1", StudentName: "홍길동", AdmissionYear: 2027, Category: "general", Status: "지원 예정", Score: 123.45, ScoreBasis: "3-1 누적 예상"}); err != nil {
		t.Fatalf("Save general application: %v", err)
	}
	if err := dm.SaveApplication(model.ApplicationRecord{ClassNum: 301, StudentNum: "1", StudentName: "홍길동", AdmissionYear: 2027, Category: "special", SchoolName: "울산산업고등학교", Status: "지원 예정", Preferences: []string{"1", "2", "3", "4", "5", "6"}}); err == nil {
		t.Fatal("more than five department preferences must be rejected")
	}
}

func TestApplicationSummaryCalculatesAcceptedAndRejectedScores(t *testing.T) {
	dir := t.TempDir()
	dm := &DBManager{DataDir: dir}
	dm.SetDataKey(make([]byte, 32))
	if err := dm.InitConfigDB(); err != nil {
		t.Fatal(err)
	}
	if err := dm.SaveSchoolConfig("테스트중학교", 2, "", false, 2027); err != nil {
		t.Fatal(err)
	}
	for _, classNum := range []int{1, 2} {
		if err := dm.InitClassDB(classNum); err != nil {
			t.Fatal(err)
		}
	}
	entries := []model.ApplicationRecord{
		{ClassNum: 1, StudentNum: "1", StudentName: "가", AdmissionYear: 2027, Category: "special", SchoolName: "울산산업고등학교", Track: "일반", Status: "합격", Score: 82, Preferences: []string{"보건간호과"}},
		{ClassNum: 2, StudentNum: "1", StudentName: "나", AdmissionYear: 2027, Category: "special", SchoolName: "울산산업고등학교", Track: "일반", Status: "최종 진학", Score: 86, Preferences: []string{"보건간호과"}},
		{ClassNum: 2, StudentNum: "2", StudentName: "다", AdmissionYear: 2027, Category: "special", SchoolName: "울산산업고등학교", Track: "일반", Status: "불합격", Score: 88, Preferences: []string{"보건간호과"}},
	}
	for _, entry := range entries {
		if err := dm.SaveApplication(entry); err != nil {
			t.Fatal(err)
		}
	}
	summaries, err := dm.GetApplicationSummaries()
	if err != nil {
		t.Fatal(err)
	}
	if len(summaries) != 1 {
		t.Fatalf("expected one summary, got %#v", summaries)
	}
	s := summaries[0]
	if s.AcceptedCount != 2 || s.RejectedCount != 1 || s.MinAcceptedScore != 82 || s.AvgAcceptedScore != 84 || s.MaxRejectedScore != 88 {
		t.Fatalf("unexpected summary: %#v", s)
	}
	classOne, err := dm.GetClassApplicationSummaries(1)
	if err != nil || len(classOne) != 1 || classOne[0].AcceptedCount != 1 || classOne[0].RejectedCount != 0 {
		t.Fatalf("unexpected class-only summary: %#v, %v", classOne, err)
	}
	records, err := dm.GetSchoolApplicationRecords()
	if err != nil || len(records) != len(entries) {
		t.Fatalf("unexpected school application register: %#v, %v", records, err)
	}
}

func TestApplicationSummaryWithZeroScoreAcceptedStudent(t *testing.T) {
	dir := t.TempDir()
	dm := &DBManager{DataDir: dir}
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
	// 합격생 1(80점), 합격생 2(90점), 점수 미입력 합격생 3(0점)
	entries := []model.ApplicationRecord{
		{ClassNum: 1, StudentNum: "1", StudentName: "합격자A", AdmissionYear: 2027, Category: "special", SchoolName: "울산공업고등학교", Track: "일반", Status: "합격", Score: 80, Preferences: []string{"스마트기계과"}},
		{ClassNum: 1, StudentNum: "2", StudentName: "합격자B", AdmissionYear: 2027, Category: "special", SchoolName: "울산공업고등학교", Track: "일반", Status: "합격", Score: 90, Preferences: []string{"스마트기계과"}},
		{ClassNum: 1, StudentNum: "3", StudentName: "합격자C_점수없음", AdmissionYear: 2027, Category: "special", SchoolName: "울산공업고등학교", Track: "일반", Status: "합격", Score: 0, Preferences: []string{"스마트기계과"}},
	}
	for _, entry := range entries {
		if err := dm.SaveApplication(entry); err != nil {
			t.Fatal(err)
		}
	}
	summaries, err := dm.GetApplicationSummaries()
	if err != nil {
		t.Fatal(err)
	}
	if len(summaries) != 1 {
		t.Fatalf("expected one summary, got %#v", summaries)
	}
	s := summaries[0]
	// 합격자 총원은 3명이지만, 유효 점수 평균은 (80+90)/2 = 85점이어야 함 (기존 버그 시 170/3=56.67점으로 왜곡됨)
	if s.AcceptedCount != 3 {
		t.Fatalf("expected AcceptedCount=3, got %d", s.AcceptedCount)
	}
	if s.AvgAcceptedScore != 85.0 {
		t.Fatalf("expected AvgAcceptedScore=85.0, got %f", s.AvgAcceptedScore)
	}
	if s.MinAcceptedScore != 80.0 || s.MaxAcceptedScore != 90.0 {
		t.Fatalf("unexpected min/max score: min=%f, max=%f", s.MinAcceptedScore, s.MaxAcceptedScore)
	}
}

func TestAdmissionClosureLocksCompletedYearAndAppliesCutoff(t *testing.T) {
	dir := t.TempDir()
	dm := &DBManager{DataDir: dir}
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
	record := model.ApplicationRecord{ClassNum: 1, StudentNum: "1", StudentName: "홍길동", AdmissionYear: 2027, Category: "special", SchoolName: "울산산업고등학교", Track: "일반전형", Status: "지원 완료", Score: 81.25, Preferences: []string{"보건간호과"}}
	if err := dm.SaveApplication(record); err != nil {
		t.Fatal(err)
	}
	if _, err := dm.CloseAdmissionYear(2027, "admin", "결과 확인 전"); err == nil {
		t.Fatal("closing must reject applications still in progress")
	}
	record.Status = "합격"
	record.AssignedDepartment = "보건간호과"
	if err := dm.SaveApplication(record); err != nil {
		t.Fatal(err)
	}
	closure, err := dm.CloseAdmissionYear(2027, "admin", "최종 결과 확정")
	if err != nil {
		t.Fatalf("CloseAdmissionYear: %v", err)
	}
	if closure.Status != "closed" || closure.CutoffsApplied != 1 {
		t.Fatalf("unexpected closure: %#v", closure)
	}
	if err := dm.SaveApplication(record); err == nil {
		t.Fatal("closed admission year must reject edits")
	}
	if err := dm.ReopenAdmissionYear(2027); err != nil {
		t.Fatalf("ReopenAdmissionYear: %v", err)
	}
	record.Status = "최종 진학"
	if err := dm.SaveApplication(record); err != nil {
		t.Fatalf("edit after reopening: %v", err)
	}
	cutoffs, err := dm.GetCutoffs()
	if err != nil || len(cutoffs) == 0 {
		t.Fatalf("result cutoff must be persisted: %#v, %v", cutoffs, err)
	}
}
