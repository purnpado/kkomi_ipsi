package exchange

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"PHGC/internal/crypto"
	"PHGC/internal/database"
)

// ExportSharedPackageV2 암호화된 관내 공유 파일(.phgc)로 내보내기
func ExportSharedPackageV2(dm *database.DBManager, admissionYear int, password, outputPath string) error {
	if strings.TrimSpace(password) == "" {
		return fmt.Errorf("관내 공유 비밀번호를 입력해주세요")
	}
	pkg, err := dm.BuildSharedPackageV2(admissionYear)
	if err != nil {
		return err
	}

	jsonData, err := json.Marshal(pkg)
	if err != nil {
		return err
	}

	tmpFile := outputPath + ".plain.tmp"
	if err := os.WriteFile(tmpFile, jsonData, 0600); err != nil {
		return err
	}
	defer os.Remove(tmpFile)

	if err := os.MkdirAll(filepath.Dir(outputPath), 0700); err != nil {
		return err
	}

	return crypto.EncryptFileGCM(password, tmpFile, outputPath)
}

// InspectSharedPackage 암호화된 관내 공유 파일의 표지 메타데이터 미리보기
func InspectSharedPackage(password, inputPath string) (*database.SharedPackageCover, error) {
	tmpFile := inputPath + ".inspect.tmp"
	defer os.Remove(tmpFile)

	if err := crypto.DecryptFileGCM(password, inputPath, tmpFile); err != nil {
		return nil, fmt.Errorf("비밀번호가 올바르지 않거나 파일이 손상되었습니다: %w", err)
	}

	data, err := os.ReadFile(tmpFile)
	if err != nil {
		return nil, err
	}

	// V2 감지
	var v2 database.SharedPackageV2
	if err := json.Unmarshal(data, &v2); err == nil && v2.Cover.FormatVersion == 2 {
		return &v2.Cover, nil
	}

	// V1 감지 (요약 CutoffInfo 배열)
	var v1Cutoffs []database.CutoffInfo
	if err := json.Unmarshal(data, &v1Cutoffs); err == nil && len(v1Cutoffs) > 0 {
		year := v1Cutoffs[0].Year
		return &database.SharedPackageCover{
			SchoolName:    "외부중학교(V1)",
			AdmissionYear: year,
			CreatedAt:     time.Now().UTC(),
			AppVersion:    "1.0.0",
			FormatVersion: 1,
			RecordCount:   len(v1Cutoffs),
		}, nil
	}

	return nil, fmt.Errorf("지원되지 않는 공유 파일 형식입니다")
}

// ImportSharedPackageV2 암호화된 공유 파일을 복호화하여 관내 통합 DB에 취합/적재
func ImportSharedPackageV2(dm *database.DBManager, password, inputPath string) (*database.SharedPackageImportResult, error) {
	if err := dm.InitSharedDatabaseTables(); err != nil {
		return nil, err
	}

	tmpFile := inputPath + ".import.tmp"
	defer os.Remove(tmpFile)

	if err := crypto.DecryptFileGCM(password, inputPath, tmpFile); err != nil {
		return nil, fmt.Errorf("비밀번호가 올바르지 않거나 파일이 손상되었습니다: %w", err)
	}

	data, err := os.ReadFile(tmpFile)
	if err != nil {
		return nil, err
	}

	db, err := dm.OpenDB(dm.GetConfigDBPath())
	if err != nil {
		return nil, err
	}
	defer db.Close()

	// V2 형식 시도
	var v2 database.SharedPackageV2
	if err := json.Unmarshal(data, &v2); err == nil && v2.Cover.FormatVersion == 2 {
		return dm.ImportV2Package(db, &v2)
	}

	// V1 형식(요약 배열) 시도
	var v1Cutoffs []database.CutoffInfo
	if err := json.Unmarshal(data, &v1Cutoffs); err == nil && len(v1Cutoffs) > 0 {
		return dm.ImportV1Package(db, v1Cutoffs)
	}

	return nil, fmt.Errorf("공유 파일의 형식을 인식할 수 없습니다")
}
