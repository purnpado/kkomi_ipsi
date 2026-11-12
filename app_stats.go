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

// GetAnalysisYears 입시 자료가 있는 학년도 목록(최근부터). 입시 분석 화면의 연도 선택에 쓴다.
func (a *App) GetAnalysisYears() ([]int, error) {
	if a.user == nil {
		return nil, fmt.Errorf("로그인이 필요합니다")
	}
	return a.db.GetAnalysisYears()
}

// GetAdmissionTrend 학교·학과·전형별 학년도 추세(관내 통합·우리 학교 합격선, 지원·합격 인원, 만점·산출식 변경).
func (a *App) GetAdmissionTrend(highSchool, department, track string) ([]database.TrendPoint, error) {
	if a.user == nil {
		return nil, fmt.Errorf("로그인이 필요합니다")
	}
	return a.db.GetAdmissionTrend(highSchool, department, track)
}

// GetPreferenceStrategy 학과 지망 전략: 학년도·고교·전형의 학과별 지망 순위별 배정 인원·최저점(우리 학교 + 관내 공유).
func (a *App) GetPreferenceStrategy(admissionYear int, highSchool, track string) (*database.PreferenceStrategy, error) {
	if a.user == nil {
		return nil, fmt.Errorf("로그인이 필요합니다")
	}
	return a.db.GetPreferenceStrategy(admissionYear, highSchool, track)
}
