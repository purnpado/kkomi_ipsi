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

// GetAdmissionEvidence 판정 근거: 학년도·고교·학과·전형별 합격·불합격 사례 수(우리 학교 + 관내 공유, 개인정보 없음).
func (a *App) GetAdmissionEvidence() ([]database.AdmissionEvidence, error) {
	if a.user == nil {
		return nil, fmt.Errorf("로그인이 필요합니다")
	}
	return a.db.GetAdmissionEvidence()
}

// GetCompetitionRecords 학년부장이 입력한 공식 경쟁률(모집정원·지원자 수) 목록.
func (a *App) GetCompetitionRecords() ([]database.CompetitionRecord, error) {
	return a.db.GetCompetitionRecords()
}

// SaveCompetitionRecords 공식 경쟁률 저장(고교 발표값 수동 입력, 학년부장 전용).
func (a *App) SaveCompetitionRecords(records []database.CompetitionRecord) (int, error) {
	if a.user == nil || a.user.Role != "master" {
		return 0, fmt.Errorf("경쟁률 자료는 학년부장 계정만 입력할 수 있습니다")
	}
	return a.db.SaveCompetitionRecords(records)
}
