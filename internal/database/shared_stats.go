package database

import (
	"database/sql"
	"fmt"
	"math"
	"sort"
	"strings"

	"PHGC/internal/calc"
)

// GetConsolidatedAdmissionStats 취합된 관내 통합 점수 자료로부터 학과별/전형별 정밀 통계 산출
func (dm *DBManager) GetConsolidatedAdmissionStats(admissionYear int, highSchool, department, track string, bucketStep float64) (*ConsolidatedStatsResult, error) {
	if err := dm.InitSharedDatabaseTables(); err != nil {
		return nil, err
	}
	db, err := dm.OpenDB(dm.GetConfigDBPath())
	if err != nil {
		return nil, err
	}
	defer db.Close()

	if bucketStep <= 0 {
		bucketStep = 1.0
	}

	highSchool = normalizeCutoffSchool(highSchool)
	department = normalizeCutoffDept(department)
	track = normalizeCutoffTrack(track)

	// 참여 학교 수 확인
	var totalSchools int
	_ = db.QueryRow("SELECT COUNT(DISTINCT school_name) FROM shared_participating_schools WHERE admission_year = ?", admissionYear).Scan(&totalSchools)

	// 통합 점수 레코드 로드
	query := `SELECT status, score, COALESCE(first_stage_result, '') FROM shared_anonymous_scores 
		WHERE admission_year = ? AND high_school = ? AND department = ? AND track = ?`
	rows, err := db.Query(query, admissionYear, highSchool, department, track)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var acceptedScores []float64
	var rejectedScores []float64
	var stage1PassCount, stage2FailCount int
	var stage1PassMin, stage2FailSum float64
	for rows.Next() {
		var status, firstStage string
		var score float64
		if err := rows.Scan(&status, &score, &firstStage); err == nil {
			cleanStatus := strings.TrimSpace(status)
			if firstStage == "합격" {
				stage1PassCount++
				if score > 0 && (stage1PassMin == 0 || score < stage1PassMin) {
					stage1PassMin = score
				}
			}
			if strings.Contains(cleanStatus, "불합격") && firstStage == "합격" {
				// 1차 통과 후 2차(면접 등) 탈락은 점수 분포·겹침 구간에서 빼고 따로 센다.
				stage2FailCount++
				stage2FailSum += score
				continue
			}
			if strings.Contains(cleanStatus, "불합격") {
				rejectedScores = append(rejectedScores, score)
			} else if strings.Contains(cleanStatus, "합격") || strings.Contains(cleanStatus, "진학") {
				acceptedScores = append(acceptedScores, score)
			}
		}
	}

	sort.Float64s(acceptedScores)
	sort.Float64s(rejectedScores)

	totalApplicants := len(acceptedScores) + len(rejectedScores) + stage2FailCount
	if totalApplicants == 0 {
		// V2 레코드가 없다면 요약 테이블에서 조회
		return dm.getConsolidatedFromSummaryStats(db, admissionYear, highSchool, department, track, totalSchools)
	}

	var accMin, accMax, accAvg float64
	if len(acceptedScores) > 0 {
		accMin = calc.Round2(acceptedScores[0])
		accMax = calc.Round2(acceptedScores[len(acceptedScores)-1])
		var sum float64
		for _, s := range acceptedScores {
			sum += s
		}
		accAvg = calc.Round2(sum / float64(len(acceptedScores)))
	}

	median := calc.CalculateMedian(acceptedScores)
	q1, _, q3 := calc.CalculateQuartiles(acceptedScores)
	stdDev := calc.CalculateStdDev(acceptedScores, accAvg)

	var rejMax, rejAvg float64
	if len(rejectedScores) > 0 {
		rejMax = calc.Round2(rejectedScores[len(rejectedScores)-1])
		var sum float64
		for _, s := range rejectedScores {
			sum += s
		}
		rejAvg = calc.Round2(sum / float64(len(rejectedScores)))
	}

	var hasOverlap bool
	var overlapMin, overlapMax float64
	if len(acceptedScores) > 0 && len(rejectedScores) > 0 && rejMax >= accMin {
		hasOverlap = true
		overlapMin = accMin
		overlapMax = rejMax
	}

	// 히스토그램 생성
	histBuckets := calc.CalculateScoreHistogram(acceptedScores, rejectedScores, bucketStep)
	var sharedBuckets []SharedScoreHistogramBucket
	for _, b := range histBuckets {
		sharedBuckets = append(sharedBuckets, SharedScoreHistogramBucket{
			MinScore:      b.MinScore,
			MaxScore:      b.MaxScore,
			AcceptedCount: b.AcceptedCount,
			RejectedCount: b.RejectedCount,
		})
	}

	scoreType := "총점"
	if strings.Contains(track, "일반고") {
		scoreType = "내신백분율"
	}

	return &ConsolidatedStatsResult{
		AdmissionYear:            admissionYear,
		HighSchool:               highSchool,
		Department:               department,
		Track:                    track,
		TotalParticipatingSchool: totalSchools,
		TotalApplicants:          totalApplicants,
		AcceptedCount:            len(acceptedScores),
		AcceptedMin:              accMin,
		AcceptedMax:              accMax,
		AcceptedAvg:              accAvg,
		AcceptedMedian:           median,
		AcceptedQ1:               q1,
		AcceptedQ3:               q3,
		AcceptedStdDev:           stdDev,
		RejectedCount:            len(rejectedScores),
		RejectedMax:              rejMax,
		RejectedAvg:              rejAvg,
		SmallSample:              len(acceptedScores) < MinSharedSample || (len(rejectedScores) > 0 && len(rejectedScores) < MinSharedSample),
		Stage1PassCount:          stage1PassCount,
		Stage1PassMin:            calc.Round2(stage1PassMin),
		Stage2FailCount:          stage2FailCount,
		Stage2FailAvg:            stage2FailAvg(stage2FailSum, stage2FailCount),
		HasOverlap:               hasOverlap,
		OverlapMin:               overlapMin,
		OverlapMax:               overlapMax,
		Histogram: SharedDepartmentHistogram{
			HighSchool: highSchool,
			Department: department,
			Track:      track,
			ScoreType:  scoreType,
			Step:       bucketStep,
			Buckets:    sharedBuckets,
		},
	}, nil
}

// getConsolidatedFromSummaryStats V1 호환 요약 통계 테이블에서 집계
func (dm *DBManager) getConsolidatedFromSummaryStats(db *sql.DB, admissionYear int, highSchool, department, track string, totalSchools int) (*ConsolidatedStatsResult, error) {
	row := db.QueryRow(`SELECT 
		COALESCE(SUM(applicant_count), 0),
		COALESCE(SUM(accepted_count), 0),
		COALESCE(SUM(accepted_sum), 0),
		COALESCE(SUM(accepted_sum_sq), 0),
		COALESCE(MIN(accepted_min), 0),
		COALESCE(MAX(accepted_max), 0),
		COALESCE(SUM(rejected_count), 0),
		COALESCE(SUM(rejected_sum), 0),
		COALESCE(MAX(rejected_max), 0)
	FROM shared_summary_stats 
	WHERE admission_year = ? AND high_school = ? AND department = ? AND track = ?`,
		admissionYear, highSchool, department, track)

	var appCount, accCount, rejCount int
	var accSum, accSumSq, accMin, accMax, rejSum, rejMax float64
	err := row.Scan(&appCount, &accCount, &accSum, &accSumSq, &accMin, &accMax, &rejCount, &rejSum, &rejMax)
	if err != nil || appCount == 0 {
		var totalInTable int
		_ = db.QueryRow("SELECT COUNT(*) FROM shared_summary_stats").Scan(&totalInTable)
		return nil, fmt.Errorf("해당 조건의 취합 통계 자료가 없습니다: year=%d, school=%q, dept=%q, track=%q (전체 summary_stats 행수: %d, scanErr: %v)",
			admissionYear, highSchool, department, track, totalInTable, err)
	}

	var accAvg, accStdDev float64
	if accCount > 0 {
		accAvg = calc.Round2(accSum / float64(accCount))
		if accCount > 1 {
			variance := (accSumSq - (accSum*accSum)/float64(accCount)) / float64(accCount-1)
			if variance > 0 {
				accStdDev = calc.Round2(math.Sqrt(variance))
			}
		}
	}

	var rejAvg float64
	if rejCount > 0 {
		rejAvg = calc.Round2(rejSum / float64(rejCount))
	}

	hasOverlap := accCount > 0 && rejCount > 0 && rejMax >= accMin
	var overlapMin, overlapMax float64
	if hasOverlap {
		overlapMin = accMin
		overlapMax = rejMax
	}

	return &ConsolidatedStatsResult{
		AdmissionYear:            admissionYear,
		HighSchool:               highSchool,
		Department:               department,
		Track:                    track,
		TotalParticipatingSchool: totalSchools,
		TotalApplicants:          appCount,
		AcceptedCount:            accCount,
		AcceptedMin:              accMin,
		AcceptedMax:              accMax,
		AcceptedAvg:              accAvg,
		AcceptedMedian:           accAvg, // V1 요약 데이터는 중앙값 근사치로 평균 사용
		AcceptedQ1:               accMin,
		AcceptedQ3:               accMax,
		AcceptedStdDev:           accStdDev,
		RejectedCount:            rejCount,
		RejectedMax:              rejMax,
		RejectedAvg:              rejAvg,
		HasOverlap:               hasOverlap,
		OverlapMin:               overlapMin,
		OverlapMax:               overlapMax,
	}, nil
}

func stage2FailAvg(sum float64, count int) float64 {
	if count == 0 {
		return 0
	}
	return calc.Round2(sum / float64(count))
}
