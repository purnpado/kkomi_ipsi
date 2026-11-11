package calc

import (
	"math"
	"sort"
	"strconv"
	"strings"

	"PHGC/internal/model"
)

// ScoreDistributionBucket represents one interval in a score histogram.
type ScoreDistributionBucket struct {
	RangeLabel    string  `json:"rangeLabel"`
	MinScore      float64 `json:"minScore"`
	MaxScore      float64 `json:"maxScore"`
	AcceptedCount int     `json:"acceptedCount"`
	RejectedCount int     `json:"rejectedCount"`
}

// DepartmentAdmissionStats holds granular cutoffs, percentiles, overlap ranges,
// and distribution histograms for a specific department and track.
type DepartmentAdmissionStats struct {
	AdmissionYear  int    `json:"admissionYear"`
	Category       string `json:"category"`
	SchoolName     string `json:"schoolName"`
	Track          string `json:"track"`
	Department     string `json:"department"`
	PreferenceRank int    `json:"preferenceRank"`

	// Counts
	TotalApplicants int `json:"totalApplicants"`
	PlannedCount    int `json:"plannedCount"`
	SubmittedCount  int `json:"submittedCount"`
	AcceptedCount   int `json:"acceptedCount"`
	RejectedCount   int `json:"rejectedCount"`
	Stage2FailCount int `json:"stage2FailCount"` // 1차 합격 후 최종 불합격(면접 등)
	FinalCount      int `json:"finalCount"`

	// Accepted Scores
	AcceptedMin    float64 `json:"acceptedMin"`
	AcceptedMax    float64 `json:"acceptedMax"`
	AcceptedAvg    float64 `json:"acceptedAvg"`
	AcceptedMedian float64 `json:"acceptedMedian"`
	AcceptedQ1     float64 `json:"acceptedQ1"`
	AcceptedQ3     float64 `json:"acceptedQ3"`
	AcceptedStdDev float64 `json:"acceptedStdDev"`

	// Rejected Scores
	RejectedMin    float64 `json:"rejectedMin"`
	RejectedMax    float64 `json:"rejectedMax"`
	RejectedAvg    float64 `json:"rejectedAvg"`
	RejectedMedian float64 `json:"rejectedMedian"`

	// Overlap Range (불합격 최고점 ~ 합격 최저점 겹침 경합 구간)
	HasOverlap bool    `json:"hasOverlap"`
	OverlapMin float64 `json:"overlapMin"`
	OverlapMax float64 `json:"overlapMax"`

	// Distribution Histogram Buckets
	Distribution []ScoreDistributionBucket `json:"distribution,omitempty"`
}

// CalculateMedian calculates the median of a slice of sorted or unsorted float64.
func CalculateMedian(scores []float64) float64 {
	n := len(scores)
	if n == 0 {
		return 0
	}
	sorted := make([]float64, n)
	copy(sorted, scores)
	sort.Float64s(sorted)

	if n%2 == 1 {
		return sorted[n/2]
	}
	return (sorted[(n/2)-1] + sorted[n/2]) / 2.0
}

// CalculateQuartiles returns Q1 (25th percentile), Median (50th), and Q3 (75th percentile).
// Uses linear interpolation between closest ranks (Type 7 method, R/Excel standard).
func CalculateQuartiles(scores []float64) (q1 float64, median float64, q3 float64) {
	n := len(scores)
	if n == 0 {
		return 0, 0, 0
	}
	sorted := make([]float64, n)
	copy(sorted, scores)
	sort.Float64s(sorted)

	median = CalculateMedian(sorted)
	if n == 1 {
		return sorted[0], sorted[0], sorted[0]
	}

	percentile := func(p float64) float64 {
		if p <= 0 {
			return sorted[0]
		}
		if p >= 1 {
			return sorted[n-1]
		}
		rank := p * float64(n-1)
		lower := int(math.Floor(rank))
		upper := lower + 1
		weight := rank - float64(lower)
		if upper >= n {
			return sorted[lower]
		}
		return sorted[lower]*(1-weight) + sorted[upper]*weight
	}

	q1 = percentile(0.25)
	q3 = percentile(0.75)
	return Round2(q1), Round2(median), Round2(q3)
}

// CalculateStdDev calculates sample standard deviation (Bessel's correction n-1).
func CalculateStdDev(scores []float64, avg float64) float64 {
	n := len(scores)
	if n < 2 {
		return 0
	}
	var sumSq float64
	for _, s := range scores {
		diff := s - avg
		sumSq += diff * diff
	}
	variance := sumSq / float64(n-1)
	return Round2(math.Sqrt(variance))
}

// CalculateScoreHistogram generates distribution buckets for accepted and rejected scores.
// If bucketStep <= 0, defaults to 5.0 points (or 2.0% for percentiles).
func CalculateScoreHistogram(acceptedScores, rejectedScores []float64, bucketStep float64) []ScoreDistributionBucket {
	allScores := append([]float64{}, acceptedScores...)
	allScores = append(allScores, rejectedScores...)
	if len(allScores) == 0 {
		return nil
	}

	minVal := allScores[0]
	maxVal := allScores[0]
	for _, s := range allScores {
		if s < minVal {
			minVal = s
		}
		if s > maxVal {
			maxVal = s
		}
	}

	if bucketStep <= 0 {
		bucketStep = 5.0
	}

	startBucket := math.Floor(minVal/bucketStep) * bucketStep
	endBucket := math.Ceil(maxVal/bucketStep) * bucketStep
	if startBucket == endBucket {
		endBucket += bucketStep
	}

	bucketCount := int(math.Round((endBucket - startBucket) / bucketStep))
	if bucketCount > 100 {
		bucketStep = (endBucket - startBucket) / 30.0
		bucketCount = int(math.Ceil((endBucket - startBucket) / bucketStep))
	}

	buckets := make([]ScoreDistributionBucket, bucketCount)
	for i := 0; i < bucketCount; i++ {
		bMin := startBucket + float64(i)*bucketStep
		bMax := bMin + bucketStep
		buckets[i] = ScoreDistributionBucket{
			RangeLabel: strconv.FormatFloat(bMin, 'f', 1, 64) + " ~ " + strconv.FormatFloat(bMax, 'f', 1, 64),
			MinScore:   Round2(bMin),
			MaxScore:   Round2(bMax),
		}
	}

	for _, s := range acceptedScores {
		idx := int((s - startBucket) / bucketStep)
		if idx >= bucketCount {
			idx = bucketCount - 1
		}
		if idx < 0 {
			idx = 0
		}
		buckets[idx].AcceptedCount++
	}

	for _, s := range rejectedScores {
		idx := int((s - startBucket) / bucketStep)
		if idx >= bucketCount {
			idx = bucketCount - 1
		}
		if idx < 0 {
			idx = 0
		}
		buckets[idx].RejectedCount++
	}

	return buckets
}

// ComputeDepartmentAdmissionStats aggregates application records into granular stats.
func ComputeDepartmentAdmissionStats(records []model.ApplicationRecord, bucketStep float64) []DepartmentAdmissionStats {
	type statGroup struct {
		stats          DepartmentAdmissionStats
		acceptedScores []float64
		rejectedScores []float64
		expectedScores []float64
		acceptedSum    float64
		rejectedSum    float64
	}

	groups := make(map[string]*statGroup)

	addRecord := func(r model.ApplicationRecord, department string, rank int) {
		key := strings.Join([]string{
			strconv.Itoa(r.AdmissionYear),
			r.Category,
			r.SchoolName,
			r.Track,
			department,
			strconv.Itoa(rank),
		}, "\x1f")

		g := groups[key]
		if g == nil {
			g = &statGroup{
				stats: DepartmentAdmissionStats{
					AdmissionYear:  r.AdmissionYear,
					Category:       r.Category,
					SchoolName:     r.SchoolName,
					Track:          r.Track,
					Department:     department,
					PreferenceRank: rank,
				},
			}
			groups[key] = g
		}

		g.stats.TotalApplicants++

		cleanStatus := strings.TrimSpace(r.Status)
		switch cleanStatus {
		case "지원희망", "지원 희망", "지원예정", "지원 예정":
			g.stats.PlannedCount++
		case "지원완료", "지원 완료":
			g.stats.SubmittedCount++
		case "합격":
			g.stats.AcceptedCount++
		case "불합격":
			g.stats.RejectedCount++
			if r.FirstStageResult == "합격" {
				g.stats.Stage2FailCount++
			}
		case "최종 진학", "최종진학":
			g.stats.FinalCount++
			g.stats.AcceptedCount++
		}

		// Score gathering (별도 전형 학교는 인원만 집계)
		if r.Score > 0 && model.IsScoredCategory(r.Category) {
			switch cleanStatus {
			case "합격", "최종 진학", "최종진학":
				g.acceptedScores = append(g.acceptedScores, r.Score)
				g.acceptedSum += r.Score
			case "불합격":
				// 1차 통과 후 2차에서 떨어진 학생은 점수 때문이 아니므로 불합격 점수 분포에서 뺀다.
				if r.FirstStageResult == "합격" {
					break
				}
				g.rejectedScores = append(g.rejectedScores, r.Score)
				g.rejectedSum += r.Score
			default:
				g.expectedScores = append(g.expectedScores, r.Score)
			}
		}
	}

	for _, r := range records {
		if r.Category == "meister" || r.Category == "special" {
			cleanStatus := strings.TrimSpace(r.Status)
			isPlanning := cleanStatus == "지원희망" || cleanStatus == "지원 희망" || cleanStatus == "지원예정" || cleanStatus == "지원 예정" || cleanStatus == "지원완료" || cleanStatus == "지원 완료"

			if isPlanning {
				for i, dept := range r.Preferences {
					if strings.TrimSpace(dept) != "" {
						addRecord(r, strings.TrimSpace(dept), i+1)
					}
				}
			} else {
				dept := strings.TrimSpace(r.AssignedDepartment)
				if dept == "" {
					dept = "전체"
				}
				rank := 0
				for i, p := range r.Preferences {
					if strings.TrimSpace(p) == dept {
						rank = i + 1
						break
					}
				}
				addRecord(r, dept, rank)
			}
		} else {
			addRecord(r, "", 0)
		}
	}

	out := make([]DepartmentAdmissionStats, 0, len(groups))
	for _, g := range groups {
		// 1. Accepted stats
		nAcc := len(g.acceptedScores)
		if nAcc > 0 {
			sort.Float64s(g.acceptedScores)
			g.stats.AcceptedMin = Round2(g.acceptedScores[0])
			g.stats.AcceptedMax = Round2(g.acceptedScores[nAcc-1])
			g.stats.AcceptedAvg = Round2(g.acceptedSum / float64(nAcc))
			g.stats.AcceptedQ1, g.stats.AcceptedMedian, g.stats.AcceptedQ3 = CalculateQuartiles(g.acceptedScores)
			g.stats.AcceptedStdDev = CalculateStdDev(g.acceptedScores, g.stats.AcceptedAvg)
		}

		// 2. Rejected stats
		nRej := len(g.rejectedScores)
		if nRej > 0 {
			sort.Float64s(g.rejectedScores)
			g.stats.RejectedMin = Round2(g.rejectedScores[0])
			g.stats.RejectedMax = Round2(g.rejectedScores[nRej-1])
			g.stats.RejectedAvg = Round2(g.rejectedSum / float64(nRej))
			g.stats.RejectedMedian = Round2(CalculateMedian(g.rejectedScores))
		}

		// 3. Overlap range
		if nAcc > 0 && nRej > 0 && g.stats.RejectedMax >= g.stats.AcceptedMin {
			g.stats.HasOverlap = true
			g.stats.OverlapMin = g.stats.AcceptedMin
			g.stats.OverlapMax = g.stats.RejectedMax
		}

		// 4. Distribution histogram
		if nAcc > 0 || nRej > 0 {
			g.stats.Distribution = CalculateScoreHistogram(g.acceptedScores, g.rejectedScores, bucketStep)
		}

		out = append(out, g.stats)
	}

	sort.Slice(out, func(i, j int) bool {
		if out[i].AdmissionYear != out[j].AdmissionYear {
			return out[i].AdmissionYear > out[j].AdmissionYear
		}
		if out[i].Category != out[j].Category {
			return out[i].Category < out[j].Category
		}
		if out[i].SchoolName != out[j].SchoolName {
			return out[i].SchoolName < out[j].SchoolName
		}
		if out[i].Department != out[j].Department {
			return out[i].Department < out[j].Department
		}
		return out[i].PreferenceRank < out[j].PreferenceRank
	})

	return out
}

func Round2(val float64) float64 {
	return math.Round(val*100) / 100
}
