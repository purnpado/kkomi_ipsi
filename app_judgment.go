package main

import (
	"fmt"

	"PHGC/internal/database"
)

// GetJudgmentSettings 4단계 판정 여유폭 설정(JSON). 모든 계정이 같은 기준으로 판정하도록 조회는 누구나 가능하다.
func (a *App) GetJudgmentSettings() (string, error) {
	return a.db.GetJudgmentSettings()
}

// SaveJudgmentSettings 판정 설정 저장. 학교 전체 기준이므로 학년부장만 바꿀 수 있다.
func (a *App) SaveJudgmentSettings(settingsJSON string) error {
	if a.user == nil || a.user.Role != "master" {
		return fmt.Errorf("판정 기준은 학년부장 계정만 바꿀 수 있습니다")
	}
	return a.db.SaveJudgmentSettings(settingsJSON)
}

// GetGeneralQuotaRecords 후기 일반고 학년도별 정원·지원자 수 목록.
func (a *App) GetGeneralQuotaRecords() ([]database.GeneralQuotaRecord, error) {
	return a.db.GetGeneralQuotaRecords()
}

// SaveGeneralQuotaRecord 후기 일반고 정원·지원자 수 저장(교육청 발표값 수동 입력, 학년부장 전용).
func (a *App) SaveGeneralQuotaRecord(record database.GeneralQuotaRecord) error {
	if a.user == nil || a.user.Role != "master" {
		return fmt.Errorf("정원 자료는 학년부장 계정만 입력할 수 있습니다")
	}
	return a.db.SaveGeneralQuotaRecord(record)
}

// GetConsolidatedGeneralCutoff 관내 공유 자료로 추정한 후기 일반고 합격선(기본 지표·완전 총점).
func (a *App) GetConsolidatedGeneralCutoff(admissionYear int) (*database.GeneralCutoffResult, error) {
	return a.db.GetConsolidatedGeneralCutoff(admissionYear)
}
