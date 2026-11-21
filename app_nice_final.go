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

// NiceBonusPreview 항목별점수관리 파일 맞춰 보기 결과와 그 파일 경로(가져오기 때 다시 읽는다).
type NiceBonusPreview struct {
	Path string                  `json:"path"`
	Plan *database.NiceBonusPlan `json:"plan"`
}

// PreviewNiceBonusFile 나이스 항목별점수관리(창의체험·행동발달) 엑셀을 골라 상담 화면 가산점 체크와 맞춰 본다(바꾸지 않음).
func (a *App) PreviewNiceBonusFile() (*NiceBonusPreview, error) {
	if err := a.requireMaster("나이스 가산점 맞춰 보기"); err != nil {
		return nil, err
	}
	path, err := a.openFileDialog("나이스 항목별점수관리(창의체험 또는 행동발달) 엑셀 선택", "엑셀 파일 (*.xlsx)", "*.xlsx")
	if err != nil || path == "" {
		return nil, err
	}
	rows, err := parser.ParseNiceBonusFile(path)
	if err != nil {
		return nil, err
	}
	plan, err := a.db.PlanNiceBonus(parser.NiceBonusKind(path), rows)
	if err != nil {
		return nil, err
	}
	return &NiceBonusPreview{Path: path, Plan: plan}, nil
}

// ApplyNiceBonusFile 맞춰 본 파일의 가산점으로 상담 화면 체크를 맞춘다(가산 제외 학년은 그대로).
func (a *App) ApplyNiceBonusFile(path string) (*database.NiceBonusPlan, error) {
	if err := a.requireMaster("나이스 가산점 가져오기"); err != nil {
		return nil, err
	}
	rows, err := parser.ParseNiceBonusFile(path)
	if err != nil {
		return nil, err
	}
	return a.db.ApplyNiceBonus(parser.NiceBonusKind(path), rows)
}
