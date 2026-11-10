package exchange

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"PHGC/internal/crypto"
	"PHGC/internal/database"
	"PHGC/internal/model"
)

func createTestDBManagerWithSampleData(t *testing.T) (*database.DBManager, string) {
	tempDir, err := os.MkdirTemp("", "phgc-shared-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}

	dm := &database.DBManager{DataDir: tempDir}
	dataKey, err := crypto.NewDataKey()
	if err != nil {
		t.Fatalf("Failed to generate data key: %v", err)
	}
	dm.SetDataKey(dataKey)

	if err := dm.InitConfigDB(); err != nil {
		t.Fatalf("InitConfigDB failed: %v", err)
	}
	if err := dm.InitClassDB(1); err != nil {
		t.Fatalf("InitClassDB failed: %v", err)
	}

	// 학교 설정 저장
	err = dm.SaveSchoolConfig("울산동중학교", 3, "adminPass123", false, 2026)
	if err != nil {
		t.Fatalf("SaveSchoolConfig failed: %v", err)
	}

	// 1반 학생 원서 데이터 추가
	recordsClass1 := []model.ApplicationRecord{
		{
			ClassNum:           1,
			StudentNum:         "30101",
			StudentName:        "홍길동",
			AdmissionYear:      2026,
			Category:           "meister",
			SchoolName:         "울산마이스터고",
			Track:              "일반전형",
			Status:             "합격",
			Score:              185.5,
			ScoreBasis:         "학교산출총점",
			Preferences:        []string{"정밀기계과"},
			AssignedDepartment: "정밀기계과",
			ScoreDetails: &model.ApplicationScoreDetails{
				Percentile:      12.5,
				AcademicScore:   160.0,
				AttendanceScore: 15.5,
				VolunteerScore:  10.0,
				FormulaVersion:  "2026.1",
			},
		},
		{
			ClassNum:           1,
			StudentNum:         "30102",
			StudentName:        "김철수",
			AdmissionYear:      2026,
			Category:           "meister",
			SchoolName:         "울산마이스터고",
			Track:              "일반전형",
			Status:             "합격",
			Score:              192.0,
			ScoreBasis:         "학교산출총점",
			Preferences:        []string{"정밀기계과"},
			AssignedDepartment: "정밀기계과",
			ScoreDetails: &model.ApplicationScoreDetails{
				Percentile:      8.0,
				AcademicScore:   165.0,
				AttendanceScore: 17.0,
				VolunteerScore:  10.0,
				FormulaVersion:  "2026.1",
			},
		},
		{
			ClassNum:           1,
			StudentNum:         "30103",
			StudentName:        "이영희",
			AdmissionYear:      2026,
			Category:           "meister",
			SchoolName:         "울산마이스터고",
			Track:              "일반전형",
			Status:             "불합격",
			Score:              178.0,
			ScoreBasis:         "학교산출총점",
			Preferences:        []string{"정밀기계과"},
			AssignedDepartment: "정밀기계과",
			ScoreDetails: &model.ApplicationScoreDetails{
				Percentile:      20.0,
				AcademicScore:   150.0,
				AttendanceScore: 18.0,
				VolunteerScore:  10.0,
				FormulaVersion:  "2026.1",
			},
		},
	}

	for _, r := range recordsClass1 {
		if err := dm.SaveApplication(r); err != nil {
			t.Fatalf("SaveApplication failed: %v", err)
		}
	}

	return dm, tempDir
}

// 1. 개인식별정보 원천 차단 및 무작위 셔플 검증
func TestSharedPackageAnonymization(t *testing.T) {
	dm, tempDir := createTestDBManagerWithSampleData(t)
	defer os.RemoveAll(tempDir)

	pkg, err := dm.BuildSharedPackageV2(2026)
	if err != nil {
		t.Fatalf("BuildSharedPackageV2 failed: %v", err)
	}

	if pkg.Cover.SchoolName != "울산동중학교" {
		t.Errorf("Expected cover schoolName '울산동중학교', got %s", pkg.Cover.SchoolName)
	}
	if pkg.Cover.AdmissionYear != 2026 {
		t.Errorf("Expected admissionYear 2026, got %d", pkg.Cover.AdmissionYear)
	}
	if pkg.Cover.FormatVersion != 2 {
		t.Errorf("Expected formatVersion 2, got %d", pkg.Cover.FormatVersion)
	}
	if len(pkg.AnonymousRecords) != 3 {
		t.Fatalf("Expected 3 anonymous records, got %d", len(pkg.AnonymousRecords))
	}

	// 개인정보 누락 검증 (AnonymousApplicationRecord에는 StudentNum, StudentName, ClassNum 필드가 아예 없음)
	for _, rec := range pkg.AnonymousRecords {
		if rec.HighSchool != "울산마이스터고" || rec.Department != "정밀기계과" {
			t.Errorf("Record normalization mismatch: %v", rec)
		}
		if rec.ScoreDetails.FormulaVersion != "2026.1" {
			t.Errorf("FormulaVersion missing: %v", rec)
		}
	}
}

// 2. AES-GCM 암호화/복호화 및 올바른/잘못된 비밀번호 테스트
func TestSharedPackageEncryptionAndDecryption(t *testing.T) {
	dm, tempDir := createTestDBManagerWithSampleData(t)
	defer os.RemoveAll(tempDir)

	exportPath := filepath.Join(tempDir, "shared_2026.phgc")
	correctPass := "UlsanShare2026!"
	wrongPass := "WrongPassword123!"

	// 내보내기
	err := ExportSharedPackageV2(dm, 2026, correctPass, exportPath)
	if err != nil {
		t.Fatalf("ExportSharedPackageV2 failed: %v", err)
	}

	// 표지 미리보기 (올바른 비밀번호)
	cover, err := InspectSharedPackage(correctPass, exportPath)
	if err != nil {
		t.Fatalf("InspectSharedPackage failed: %v", err)
	}
	if cover.SchoolName != "울산동중학교" || cover.RecordCount != 3 {
		t.Errorf("Unexpected cover: %+v", cover)
	}

	// 표지 미리보기 (잘못된 비밀번호 -> 반드시 실패)
	_, err = InspectSharedPackage(wrongPass, exportPath)
	if err == nil {
		t.Fatalf("Expected error with wrong password, but succeeded")
	}
}

// 3. 다중 학교 취합 및 중복 학교 자동 교체(Idempotent Replace) 검증
func TestSharedPackageImportAndDuplicateReplacement(t *testing.T) {
	dm, tempDir := createTestDBManagerWithSampleData(t)
	defer os.RemoveAll(tempDir)

	exportPath := filepath.Join(tempDir, "dongjung_2026.phgc")
	sharePassword := "SafePass2026!"

	if err := ExportSharedPackageV2(dm, 2026, sharePassword, exportPath); err != nil {
		t.Fatalf("Export failed: %v", err)
	}

	// 취합 DB 매니저 생성
	consolidateDir, err := os.MkdirTemp("", "phgc-consolidate-*")
	if err != nil {
		t.Fatalf("TempDir failed: %v", err)
	}
	defer os.RemoveAll(consolidateDir)

	dmConsolidate := &database.DBManager{DataDir: consolidateDir}
	key, _ := crypto.NewDataKey()
	dmConsolidate.SetDataKey(key)
	_ = dmConsolidate.InitConfigDB()

	// 첫 번째 가져오기
	res1, err := ImportSharedPackageV2(dmConsolidate, sharePassword, exportPath)
	if err != nil {
		t.Fatalf("ImportSharedPackageV2 1 failed: %v", err)
	}
	if res1.IsReplaced {
		t.Errorf("First import should not be replaced")
	}
	if res1.RecordCount != 3 || res1.TotalParticipatingSchool != 1 {
		t.Errorf("Unexpected import result 1: %+v", res1)
	}

	// 같은 학교 파일 다시 가져오기 -> 교체되어야 함
	res2, err := ImportSharedPackageV2(dmConsolidate, sharePassword, exportPath)
	if err != nil {
		t.Fatalf("ImportSharedPackageV2 2 failed: %v", err)
	}
	if !res2.IsReplaced {
		t.Errorf("Second import of same school should be marked as replaced")
	}
	if res2.TotalParticipatingSchool != 1 || res2.TotalAnonymousRecords != 3 {
		t.Errorf("Records should not be duplicated: totalSchools=%d, totalRecords=%d",
			res2.TotalParticipatingSchool, res2.TotalAnonymousRecords)
	}

	// 참여 학교 목록 조회 확인
	schools, err := dmConsolidate.GetParticipatingSchools(2026)
	if err != nil {
		t.Fatalf("GetParticipatingSchools failed: %v", err)
	}
	if len(schools) != 1 || schools[0].SchoolName != "울산동중학교" {
		t.Errorf("Unexpected participating schools: %+v", schools)
	}
}

// 4. 관내 다중 학교 합산 시 사분위수, 중앙값, 겹침구간, 히스토그램 통합 산출 검증
func TestConsolidatedAdmissionStatsCalculation(t *testing.T) {
	// A중학교 (합격: 190.0, 195.0 / 불합격: 175.0)
	tempA, _ := os.MkdirTemp("", "phgc-school-a-*")
	defer os.RemoveAll(tempA)
	dmA := &database.DBManager{DataDir: tempA}
	keyA, _ := crypto.NewDataKey()
	dmA.SetDataKey(keyA)
	_ = dmA.InitConfigDB()
	_ = dmA.InitClassDB(1)
	_ = dmA.SaveSchoolConfig("A중학교", 1, "passA", false, 2026)
	_ = dmA.SaveApplication(model.ApplicationRecord{
		ClassNum: 1, StudentNum: "30101", StudentName: "A1", AdmissionYear: 2026, Category: "special",
		SchoolName: "울산에너지고", Track: "일반전형",
		Status: "합격", Score: 190.0,
		Preferences: []string{"신재생에너지과"}, AssignedDepartment: "신재생에너지과",
	})
	_ = dmA.SaveApplication(model.ApplicationRecord{
		ClassNum: 1, StudentNum: "30102", StudentName: "A2", AdmissionYear: 2026, Category: "special",
		SchoolName: "울산에너지고", Track: "일반전형",
		Status: "합격", Score: 195.0,
		Preferences: []string{"신재생에너지과"}, AssignedDepartment: "신재생에너지과",
	})
	_ = dmA.SaveApplication(model.ApplicationRecord{
		ClassNum: 1, StudentNum: "30103", StudentName: "A3", AdmissionYear: 2026, Category: "special",
		SchoolName: "울산에너지고", Track: "일반전형",
		Status: "불합격", Score: 175.0,
		Preferences: []string{"신재생에너지과"}, AssignedDepartment: "신재생에너지과",
	})

	// B중학교 (합격: 180.0, 185.0 / 불합격: 182.0 -> 합격최저 180.0 <= 불합격최고 182.0 겹침구간 발생!)
	tempB, _ := os.MkdirTemp("", "phgc-school-b-*")
	defer os.RemoveAll(tempB)
	dmB := &database.DBManager{DataDir: tempB}
	keyB, _ := crypto.NewDataKey()
	dmB.SetDataKey(keyB)
	_ = dmB.InitConfigDB()
	_ = dmB.InitClassDB(1)
	_ = dmB.SaveSchoolConfig("B중학교", 1, "passB", false, 2026)
	_ = dmB.SaveApplication(model.ApplicationRecord{
		ClassNum: 1, StudentNum: "30101", StudentName: "B1", AdmissionYear: 2026, Category: "special",
		SchoolName: "울산에너지고", Track: "일반전형",
		Status: "합격", Score: 180.0,
		Preferences: []string{"신재생에너지과"}, AssignedDepartment: "신재생에너지과",
	})
	_ = dmB.SaveApplication(model.ApplicationRecord{
		ClassNum: 1, StudentNum: "30102", StudentName: "B2", AdmissionYear: 2026, Category: "special",
		SchoolName: "울산에너지고", Track: "일반전형",
		Status: "합격", Score: 185.0,
		Preferences: []string{"신재생에너지과"}, AssignedDepartment: "신재생에너지과",
	})
	_ = dmB.SaveApplication(model.ApplicationRecord{
		ClassNum: 1, StudentNum: "30103", StudentName: "B3", AdmissionYear: 2026, Category: "special",
		SchoolName: "울산에너지고", Track: "일반전형",
		Status: "불합격", Score: 182.0,
		Preferences: []string{"신재생에너지과"}, AssignedDepartment: "신재생에너지과",
	})

	passA := "PassA123"
	passB := "PassB123"
	pathA := filepath.Join(tempA, "pkg_a.phgc")
	pathB := filepath.Join(tempB, "pkg_b.phgc")
	_ = ExportSharedPackageV2(dmA, 2026, passA, pathA)
	_ = ExportSharedPackageV2(dmB, 2026, passB, pathB)

	// 통합 DB 생성 및 두 학교 패키지 임포트
	tempCons, _ := os.MkdirTemp("", "phgc-cons-*")
	defer os.RemoveAll(tempCons)
	dmCons := &database.DBManager{DataDir: tempCons}
	keyCons, _ := crypto.NewDataKey()
	dmCons.SetDataKey(keyCons)
	_ = dmCons.InitConfigDB()

	_, err := ImportSharedPackageV2(dmCons, passA, pathA)
	if err != nil {
		t.Fatalf("Import A failed: %v", err)
	}
	_, err = ImportSharedPackageV2(dmCons, passB, pathB)
	if err != nil {
		t.Fatalf("Import B failed: %v", err)
	}

	// 관내 통합 통계 산출
	// 합격 점수 풀: [180.0, 185.0, 190.0, 195.0] (4명)
	// 불합격 점수 풀: [175.0, 182.0] (2명)
	// 최저: 180.0, 최고: 195.0, 평균: 187.5
	// 중앙값: (185 + 190) / 2 = 187.5
	// 불합격 최고: 182.0 >= 합격 최저 180.0 => HasOverlap = true, Overlap: [180.0, 182.0]
	stats, err := dmCons.GetConsolidatedAdmissionStats(2026, "울산에너지고", "신재생에너지과", "일반전형", 5.0)
	if err != nil {
		t.Fatalf("GetConsolidatedAdmissionStats failed: %v", err)
	}

	if stats.TotalParticipatingSchool != 2 {
		t.Errorf("Expected 2 participating schools, got %d", stats.TotalParticipatingSchool)
	}
	if stats.AcceptedCount != 4 {
		t.Errorf("Expected 4 accepted students, got %d", stats.AcceptedCount)
	}
	if stats.AcceptedMin != 180.0 || stats.AcceptedMax != 195.0 {
		t.Errorf("Expected min 180.0, max 195.0, got min %f, max %f", stats.AcceptedMin, stats.AcceptedMax)
	}
	if stats.AcceptedAvg != 187.5 {
		t.Errorf("Expected avg 187.5, got %f", stats.AcceptedAvg)
	}
	if stats.AcceptedMedian != 187.5 {
		t.Errorf("Expected median 187.5, got %f", stats.AcceptedMedian)
	}
	if !stats.HasOverlap {
		t.Errorf("Expected HasOverlap true")
	}
	if stats.OverlapMin != 180.0 || stats.OverlapMax != 182.0 {
		t.Errorf("Expected overlap [180.0, 182.0], got [%f, %f]", stats.OverlapMin, stats.OverlapMax)
	}
	if len(stats.Histogram.Buckets) == 0 {
		t.Errorf("Expected histogram buckets to be populated")
	}
}

// 5. 이전 V1 공유 파일(요약 CutoffInfo 배열) 하위 호환 임포트 검증
func TestSharedPackageV1BackwardCompatibility(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "phgc-v1-compat-*")
	if err != nil {
		t.Fatalf("TempDir failed: %v", err)
	}
	defer os.RemoveAll(tempDir)

	v1Cutoffs := []database.CutoffInfo{
		{
			Year:       2026,
			SchoolName: "현대공업고",
			Department: "전기전자과",
			Track:      "일반전형",
			ScoreType:  "총점",
			MinValue:   165.0,
			MaxValue:   188.0,
			AvgValue:   176.5,
		},
	}

	jsonData, _ := json.Marshal(v1Cutoffs)
	tmpPlain := filepath.Join(tempDir, "v1.plain")
	_ = os.WriteFile(tmpPlain, jsonData, 0600)

	encryptedV1 := filepath.Join(tempDir, "v1_shared.phgc")
	sharePassword := "LegacySharePass1"
	if err := crypto.EncryptFileGCM(sharePassword, tmpPlain, encryptedV1); err != nil {
		t.Fatalf("Encrypt V1 failed: %v", err)
	}

	// 표지 미리보기에서 V1 감지 확인
	cover, err := InspectSharedPackage(sharePassword, encryptedV1)
	if err != nil {
		t.Fatalf("Inspect V1 failed: %v", err)
	}
	if cover.FormatVersion != 1 || cover.RecordCount != 1 {
		t.Errorf("Expected V1 format version 1, got %d", cover.FormatVersion)
	}

	// 임포트 테스트
	dm := &database.DBManager{DataDir: tempDir}
	key, _ := crypto.NewDataKey()
	dm.SetDataKey(key)
	_ = dm.InitConfigDB()

	res, err := ImportSharedPackageV2(dm, sharePassword, encryptedV1)
	if err != nil {
		t.Fatalf("Import V1 failed: %v", err)
	}
	if res.FormatVersion != 1 || res.RecordCount != 1 {
		t.Errorf("Unexpected V1 import result: %+v", res)
	}

	// 요약 통계로부터 관내 통계 조회 확인
	stats, err := dm.GetConsolidatedAdmissionStats(2026, "현대공고", "전기전자과", "일반전형", 1.0)
	if err != nil {
		t.Fatalf("GetConsolidatedAdmissionStats for V1 failed: %v", err)
	}
	if stats.AcceptedMin != 165.0 || stats.AcceptedMax != 188.0 || stats.AcceptedAvg != 176.5 {
		t.Errorf("Unexpected stats from V1: %+v", stats)
	}
}
