package main

import (
	"fmt"

	"PHGC/internal/calc"
	"PHGC/internal/database"
)

// GetDepartmentAdmissionStats returns granular cutoffs, percentiles, overlap ranges,
// and histograms across all departments and tracks for career guidance.
func (a *App) GetDepartmentAdmissionStats(bucketStep float64) ([]calc.DepartmentAdmissionStats, error) {
	if a.user == nil {
		return nil, fmt.Errorf("로그인이 필요합니다")
	}
	return a.db.GetDepartmentAdmissionStats(bucketStep)
}

// GetParticipatingSchools 취합된 참여 중학교 목록 반환
func (a *App) GetParticipatingSchools(admissionYear int) ([]database.SharedParticipatingSchool, error) {
	return a.db.GetParticipatingSchools(admissionYear)
}

// GetConsolidatedAdmissionStats 취합된 관내 통합 점수 자료로부터 학과별 정밀 통계 산출
func (a *App) GetConsolidatedAdmissionStats(admissionYear int, highSchool, department, track string, bucketStep float64) (*database.ConsolidatedStatsResult, error) {
	return a.db.GetConsolidatedAdmissionStats(admissionYear, highSchool, department, track, bucketStep)
}
