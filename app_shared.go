package main

import (
	"fmt"

	"PHGC/internal/database"
	"PHGC/internal/exchange"
)

// ExportSharedAdmissionPackage 우리 학교의 익명 학생 점수 및 학과별 통계가 포함된 관내 공유 파일(.phgc) 내보내기
func (a *App) ExportSharedAdmissionPackage(admissionYear int, password, outputPath string) error {
	if a.user == nil || a.user.Role != "master" {
		return fmt.Errorf("관내 공유 자료 내보내기는 학년부장만 가능합니다")
	}
	return exchange.ExportSharedPackageV2(a.db, admissionYear, password, outputPath)
}

// SaveSharedAdmissionPackageDialog 파일 저장 대화상자를 열어 관내 공유 파일(.kkomi) 저장
func (a *App) SaveSharedAdmissionPackageDialog(admissionYear int, password string) (string, error) {
	if a.user == nil || a.user.Role != "master" {
		return "", fmt.Errorf("관내 공유 자료 생성은 학년부장만 가능합니다")
	}
	config, err := a.db.GetSchoolConfig()
	if err != nil || config == nil {
		return "", fmt.Errorf("학교 설정을 먼저 완료해주세요")
	}
	if admissionYear <= 0 {
		admissionYear = config.AdmissionYear
	}
	defaultName := fmt.Sprintf("%s_%d학년도_고입결과_공유.kkomi", config.SchoolName, admissionYear)
	path, err := a.saveFileDialog(
		"관내 공유용 고입 결과 자료 내보내기 (V2)",
		defaultName,
		"꼬미입시 관내 공유 파일 (*.kkomi)",
		"*.kkomi",
	)
	if err != nil || path == "" {
		return "", err
	}
	if err := exchange.ExportSharedPackageV2(a.db, admissionYear, password, path); err != nil {
		return "", err
	}
	return path, nil
}

// OpenSharedAdmissionPackageDialog 파일 열기 대화상자로 관내 공유 파일 선택
func (a *App) OpenSharedAdmissionPackageDialog() (string, error) {
	if a.user == nil || a.user.Role != "master" {
		return "", fmt.Errorf("관내 공유 자료 취합은 학년부장만 가능합니다")
	}
	path, err := a.openFileDialog(
		"관내 공유 고입 결과 자료 선택 (V1/V2)",
		"꼬미입시 관내 공유 파일 (*.kkomi;*.phgc;*.json)",
		"*.kkomi;*.phgc;*.json",
	)
	if err != nil || path == "" {
		return "", err
	}
	return path, nil
}

// InspectSharedAdmissionPackage 공유 파일의 표지(학교명, 학년도, 학생수 등) 미리보기
func (a *App) InspectSharedAdmissionPackage(password, inputPath string) (*database.SharedPackageCover, error) {
	return exchange.InspectSharedPackage(password, inputPath)
}

// ImportSharedAdmissionPackage 선택된 관내 공유 파일을 복호화하여 통합 DB에 취합
func (a *App) ImportSharedAdmissionPackage(password, inputPath string) (*database.SharedPackageImportResult, error) {
	if a.user == nil || a.user.Role != "master" {
		return nil, fmt.Errorf("관내 공유 자료 취합은 학년부장만 가능합니다")
	}
	return exchange.ImportSharedPackageV2(a.db, password, inputPath)
}
