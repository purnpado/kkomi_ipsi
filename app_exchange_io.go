package main

import (
	"fmt"
	"os"

	"PHGC/internal/exchange"
	"PHGC/internal/model"
)

// 이 파일은 교환 파일(재설정·배포·보관본·취합·관내 공유 V1)의 실제 입출력을
// internal/exchange 패키지에 위임한다. 권한 확인과 대화상자만 App이 담당한다.

// ExportPasswordResetPackage 담임·진로 계정용 암호화 비밀번호 재설정 파일 생성
func (a *App) ExportPasswordResetPackage(username, outputPath string) error {
	return exchange.ExportPasswordResetPackage(a.db, a.dataKey, username, outputPath)
}

// ImportPasswordResetPackage 재설정 파일을 적용하고 해당 계정명을 반환
func (a *App) ImportPasswordResetPackage(inputPath string) (string, error) {
	return exchange.ImportPasswordResetPackage(a.db, inputPath)
}

// ExportDistributionPackage 대상 교사의 학급 DB만 담은 배포 자료 생성
func (a *App) ExportDistributionPackage(username, outputPath string) error {
	if !a.isMaster() {
		return fmt.Errorf("학년부장으로 로그인한 뒤에만 배포 자료를 만들 수 있습니다")
	}
	return exchange.ExportDistributionPackage(a.db, a.dataKey, username, outputPath)
}

// ImportDistributionPackage 배포 자료를 현재 data 폴더에 가져오기
func (a *App) ImportDistributionPackage(inputPath string) (string, error) {
	return exchange.ImportDistributionPackage(a.db, inputPath)
}

// ExportFinalArchive 암호화 최종 보관본 생성
func (a *App) ExportFinalArchive(archivePassword, outputPath string) error {
	if !a.isMaster() {
		return fmt.Errorf("학년부장 로그인 후에만 보관본을 만들 수 있습니다")
	}
	return exchange.ExportFinalArchive(a.db, a.dataKey, archivePassword, outputPath)
}

// ImportFinalArchive 비어 있는 프로그램 폴더에만 최종 보관본 복원
func (a *App) ImportFinalArchive(inputPath, archivePassword string) (string, error) {
	return exchange.ImportFinalArchive(a.db, inputPath, archivePassword)
}

// ExportTeacherPatch 학급 단위 암호화 취합자료 작성
func (a *App) ExportTeacherPatch(password, username string, classNum int, changes []model.PatchChange, outputPath string) error {
	return exchange.ExportTeacherPatch(a.db, password, username, classNum, changes, outputPath)
}

// ImportTeacherPatch 취합자료 복호화 후 허용된 변경만 반영
func (a *App) ImportTeacherPatch(password, inputPath string) (int, error) {
	return exchange.ImportTeacherPatch(a.db, password, inputPath)
}

// ImportTeacherPatchSelected 학년부장이 미리보기에서 선택한 항목만 병합
func (a *App) ImportTeacherPatchSelected(password, inputPath string, selections []model.PatchMergeSelection) (int, error) {
	return exchange.ImportTeacherPatchSelected(a.db, password, inputPath, selections)
}

// InspectTeacherPatch 병합 전 안전한 메타정보만 미리보기
func (a *App) InspectTeacherPatch(password, inputPath string) (model.PatchPreview, error) {
	return exchange.InspectTeacherPatch(a.db, password, inputPath)
}

// ExportJointShareData 현재 연도의 커트라인과 지원현황 집계(개인정보 없음) 및 공식자료를 관내 공유용 파일로 내보냄
func (a *App) ExportJointShareData(admissionYear int) (string, error) {
	if !a.isMaster() {
		return "", fmt.Errorf("관내 진학자료 내보내기는 학년부장 계정만 가능합니다")
	}
	data, defaultFilename, err := exchange.BuildJointShareData(a.db, a.sync, admissionYear)
	if err != nil {
		return "", err
	}
	path, err := a.saveFileDialog(
		"관내 진학자료 내보내기",
		defaultFilename,
		"꼬미입시 관내 진학자료 (*.kkomidata)",
		"*.kkomidata",
	)
	if err != nil || path == "" {
		return "", err
	}
	if err := os.WriteFile(path, data, 0644); err != nil {
		return "", fmt.Errorf("파일 저장 실패: %w", err)
	}
	return path, nil
}

// ImportJointShareData 타 학교의 진학자료 파일(단일 또는 다중 선택)을 열어 우리 학교 커트라인과 공식자료에 일괄 병합
func (a *App) ImportJointShareData(admissionYear int) (map[string]int, error) {
	if !a.isMaster() {
		return nil, fmt.Errorf("타교자료 병합은 학년부장 계정만 가능합니다")
	}
	paths, err := a.openMultipleFilesDialog(
		"타교 진학자료 일괄 병합 - 여러 파일 동시 선택 가능",
		"꼬미입시 관내 진학자료 (*.kkomidata · 이전 버전 파일 포함)",
		"*.kkomidata;*.phgcdata",
	)
	if err != nil || len(paths) == 0 {
		return nil, err
	}
	return exchange.MergeJointShareFiles(a.db, paths)
}
