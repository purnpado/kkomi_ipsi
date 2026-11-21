package main

import (
	"fmt"

	"PHGC/internal/database"
	"PHGC/internal/parser"
)

// 나이스 후기 일반고 내신 산출 결과(석차 연명부) 올리기·맞춰 보기(학년부장). 원서대장은 모든 계정이 읽는다.

// UploadNiceGeneralRank 파일 고르는 창으로 나이스 석차 연명부(또는 석차백분율산출) 엑셀을 골라 그 학년도 값으로 저장한다.
func (a *App) UploadNiceGeneralRank() (*database.NiceFinalSummary, error) {
	if err := a.requireMaster("나이스 석차 연명부 올리기"); err != nil {
		return nil, err
	}
	config, err := a.db.GetSchoolConfig()
	if err != nil || config == nil {
		return nil, fmt.Errorf("학교 설정을 먼저 완료해 주세요")
	}
	path, err := a.openFileDialog("나이스 후기 일반고 석차 연명부(또는 석차백분율산출) 엑셀 선택", "엑셀 파일 (*.xlsx)", "*.xlsx")
	if err != nil || path == "" {
		return nil, err
	}
	file, err := parser.ParseNiceRankFile(path)
	if err != nil {
		return nil, err
	}
	return a.db.SaveNiceGeneralFinal(config.AdmissionYear, file)
}

// GetNiceGeneralComparison 꼬미입시 계산값과 나이스 값을 학생마다 나란히(학년부장).
func (a *App) GetNiceGeneralComparison() (*database.NiceComparison, error) {
	if err := a.requireMaster("나이스 석차 연명부 맞춰 보기"); err != nil {
		return nil, err
	}
	return a.db.NiceGeneralComparison()
}

// ClearNiceGeneralRank 올린 나이스 석차 연명부를 지운다(원서대장은 꼬미입시 계산값으로 돌아감).
func (a *App) ClearNiceGeneralRank() error {
	if err := a.requireMaster("나이스 석차 연명부 지우기"); err != nil {
		return err
	}
	config, err := a.db.GetSchoolConfig()
	if err != nil || config == nil {
		return fmt.Errorf("학교 설정을 불러올 수 없습니다")
	}
	return a.db.ClearNiceGeneralFinal(config.AdmissionYear)
}

// NiceGeneralFinalResult 원서대장용 나이스 내신성적과 올린 정보.
type NiceGeneralFinalResult struct {
	Scores  map[string]float64         `json:"scores"` // "반|번호" → 내신성적(200)
	Summary *database.NiceFinalSummary `json:"summary"`
}

// GetNiceGeneralFinalScores 원서대장의 후기 일반고 점수에 쓸 나이스 내신성적(그 학년도).
func (a *App) GetNiceGeneralFinalScores() (*NiceGeneralFinalResult, error) {
	config, err := a.db.GetSchoolConfig()
	if err != nil || config == nil {
		return nil, fmt.Errorf("학교 설정을 불러올 수 없습니다")
	}
	scores, summary, err := a.db.NiceGeneralFinalScores(config.AdmissionYear)
	if err != nil {
		return nil, err
	}
	return &NiceGeneralFinalResult{Scores: scores, Summary: summary}, nil
}

// CompareNiceClassRankFile 담임: 나이스 반별 석차 연명부(우리 반)를 골라 꼬미입시 값과 맞춰 본다(저장하지 않음).
func (a *App) CompareNiceClassRankFile() (*database.NiceComparison, error) {
	if err := a.requireLogin(); err != nil {
		return nil, err
	}
	if a.user.Role != "homeroom" {
		return nil, fmt.Errorf("반별 석차 연명부 맞춰 보기는 담임 계정에서 합니다(학년부장은 나이스 자료 화면의 석차 연명부를 씁니다)")
	}
	path, err := a.openFileDialog("나이스 반별 석차 연명부(우리 반) 엑셀 선택", "엑셀 파일 (*.xlsx)", "*.xlsx")
	if err != nil || path == "" {
		return nil, err
	}
	file, err := parser.ParseNiceRankFile(path)
	if err != nil {
		return nil, err
	}
	return a.db.NiceClassComparison(file, a.user.ClassNum)
}

// GetGeneralLastYearResult 상담 화면 "작년 우리 학교 결과": 지난 학년도 후기 일반고 합격·불합격 교과 석차백분율 범위(없으면 nil).
func (a *App) GetGeneralLastYearResult() (*database.GeneralYearResult, error) {
	config, err := a.db.GetSchoolConfig()
	if err != nil || config == nil {
		return nil, fmt.Errorf("학교 설정을 불러올 수 없습니다")
	}
	return a.db.GeneralLastYearResult(config.AdmissionYear)
}
