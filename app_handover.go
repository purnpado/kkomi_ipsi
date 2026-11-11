package main

import (
	"fmt"
	"path/filepath"
	"strings"

	"PHGC/internal/exchange"
)

// 인수인계 파일: 학생 개인정보 없이 입시 자료(커트라인·결과 확정·지난 입시 결과·관내 공유·정원·판정 기준)를
// 다음 학년도 학년부장에게 넘긴다. 해마다 새로 설치한 프로그램에서 받아 들이고 그해 결과를 더해 다시 내보내면 누적된다.

// SaveHandoverPackage 인수인계 파일 저장(학년부장 전용). 저장한 경로와 함께 그해 결과 확정 여부를 돌려준다.
func (a *App) SaveHandoverPackage(password string) (map[string]interface{}, error) {
	if a.user == nil || a.user.Role != "master" {
		return nil, fmt.Errorf("인수인계 파일은 학년부장 계정만 만들 수 있습니다")
	}
	if strings.TrimSpace(password) == "" {
		return nil, fmt.Errorf("인수인계 파일 암호를 입력해주세요")
	}
	config, err := a.db.GetSchoolConfig()
	if err != nil {
		return nil, err
	}
	path, err := a.saveFileDialog("인수인계 파일 저장",
		fmt.Sprintf("꼬미입시-%s-%d고입-인수인계.kkomihandover", config.SchoolName, config.AdmissionYear),
		"꼬미입시 인수인계 파일 (*.kkomihandover)", "*.kkomihandover")
	if err != nil || path == "" {
		return nil, err
	}
	pkg, err := exchange.ExportHandoverPackage(a.db, password, path)
	if err != nil {
		return nil, err
	}
	closed, _ := a.db.IsAdmissionYearClosed(config.AdmissionYear)
	years := map[int]bool{}
	for _, h := range pkg.History {
		years[h.AdmissionYear] = true
	}
	return map[string]interface{}{"path": path, "currentYearClosed": closed, "years": len(years), "historyRecords": len(pkg.History), "sharedPackages": len(pkg.Shared)}, nil
}

// OpenPreviousYearFile 지난 학년도 인수인계 파일(또는 이전 버전 최종 보관본) 선택
func (a *App) OpenPreviousYearFile() (string, error) {
	return a.openFileDialog("지난 학년도 입시 자료 선택",
		"꼬미입시 인수인계 파일·이전 버전 최종 보관본 (*.kkomihandover, *.kkomiarchive)",
		"*.kkomihandover;*.kkomiarchive;*.phgcarchive")
}

// IsLegacyArchivePath 이전 버전 최종 보관본이면 그해 공용 데이터 암호도 물어야 한다.
func (a *App) IsLegacyArchivePath(path string) bool {
	ext := strings.ToLower(filepath.Ext(path))
	return ext == ".kkomiarchive" || ext == ".phgcarchive"
}

// ImportPreviousYearData 지난 학년도 입시 자료 가져오기(학년부장 전용). 학생 개인정보·계정은 가져오지 않는다.
// previousSharedPassword는 이전 버전 최종 보관본을 받을 때만 쓴다(보관본을 만든 해의 공용 데이터 암호).
func (a *App) ImportPreviousYearData(path, password, previousSharedPassword string, includeJudgment bool) (*exchange.HandoverImportResult, error) {
	if a.user == nil || a.user.Role != "master" {
		return nil, fmt.Errorf("지난 학년도 입시 자료는 학년부장 계정만 가져올 수 있습니다")
	}
	if strings.TrimSpace(password) == "" {
		return nil, fmt.Errorf("파일 암호를 입력해주세요")
	}
	if a.IsLegacyArchivePath(path) {
		if strings.TrimSpace(previousSharedPassword) == "" {
			return nil, fmt.Errorf("이전 버전 최종 보관본은 그해 공용 데이터 암호가 필요합니다")
		}
		return exchange.ImportLegacyFinalArchive(a.db, path, password, previousSharedPassword, includeJudgment)
	}
	return exchange.ImportHandoverFile(a.db, path, password, includeJudgment)
}

// ExportHandoverPackageTo 인수인계 파일을 정한 경로에 저장(대화상자 없이, 학년부장 전용).
func (a *App) ExportHandoverPackageTo(password, outputPath string) error {
	if a.user == nil || a.user.Role != "master" {
		return fmt.Errorf("인수인계 파일은 학년부장 계정만 만들 수 있습니다")
	}
	_, err := exchange.ExportHandoverPackage(a.db, password, outputPath)
	return err
}
