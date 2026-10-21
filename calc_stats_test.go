package main

import (
	"math"
	"testing"
)

func TestCalculateMedianAndQuartiles(t *testing.T) {
	// 1. 단일 점수 테스트
	single := []float64{180.5}
	q1, med, q3 := CalculateQuartiles(single)
	if q1 != 180.5 || med != 180.5 || q3 != 180.5 {
		t.Errorf("Single element quartiles failed: got (%v, %v, %v), want (180.5, 180.5, 180.5)", q1, med, q3)
	}

	// 2. 홀수 개수 (5개) 테스트: [100, 120, 140, 160, 180]
	// Type 7: p=0.25 -> rank = 0.25*(4) = 1.0 -> sorted[1] = 120
	// p=0.5 -> rank = 2.0 -> sorted[2] = 140
	// p=0.75 -> rank = 3.0 -> sorted[3] = 160
	odd := []float64{140, 180, 100, 160, 120} // Unsorted
	q1, med, q3 = CalculateQuartiles(odd)
	if q1 != 120 || med != 140 || q3 != 160 {
		t.Errorf("Odd quartiles failed: got (%v, %v, %v), want (120, 140, 160)", q1, med, q3)
	}

	// 3. 짝수 개수 (4개) 테스트: [10, 20, 30, 40]
	// p=0.25 -> rank = 0.25*3 = 0.75 -> 10*(0.25) + 20*(0.75) = 17.5
	// p=0.5  -> rank = 0.5*3 = 1.5 -> (20+30)/2 = 25
	// p=0.75 -> rank = 0.75*3 = 2.25 -> 30*(0.75) + 40*(0.25) = 32.5
	even := []float64{40, 10, 30, 20}
	q1, med, q3 = CalculateQuartiles(even)
	if q1 != 17.5 || med != 25.0 || q3 != 32.5 {
		t.Errorf("Even quartiles failed: got (%v, %v, %v), want (17.5, 25.0, 32.5)", q1, med, q3)
	}
}

func TestCalculateStdDev(t *testing.T) {
	// 데이터: [10, 20, 30, 40, 50]
	// 평균: 30
	// 편차 제곱합: 400 + 100 + 0 + 100 + 400 = 1000
	// 표본 분산: 1000 / (5 - 1) = 250
	// 표준편차: sqrt(250) ≈ 15.811388... -> round2 = 15.81
	scores := []float64{10, 20, 30, 40, 50}
	stdDev := CalculateStdDev(scores, 30.0)
	expected := 15.81
	if math.Abs(stdDev-expected) > 0.01 {
		t.Errorf("StdDev calculation failed: got %v, want %v", stdDev, expected)
	}

	// 요소 1개 이하 시 0이어야 함
	if CalculateStdDev([]float64{100}, 100.0) != 0 {
		t.Errorf("StdDev for single item should be 0")
	}
}

func TestCalculateScoreHistogram(t *testing.T) {
	accepted := []float64{182.0, 188.5, 195.0, 198.0}
	rejected := []float64{175.0, 178.5, 183.0}

	buckets := CalculateScoreHistogram(accepted, rejected, 5.0)
	if len(buckets) == 0 {
		t.Fatalf("Histogram buckets should not be empty")
	}

	totalAcc := 0
	totalRej := 0
	for _, b := range buckets {
		totalAcc += b.AcceptedCount
		totalRej += b.RejectedCount
	}

	if totalAcc != len(accepted) {
		t.Errorf("Histogram accepted count mismatch: got %v, want %v", totalAcc, len(accepted))
	}
	if totalRej != len(rejected) {
		t.Errorf("Histogram rejected count mismatch: got %v, want %v", totalRej, len(rejected))
	}
}

func TestComputeDepartmentAdmissionStatsAndOverlap(t *testing.T) {
	records := []ApplicationRecord{
		// 마이스터고 특별전형 전기전자과 지원자 4명
		{
			StudentNum:         "1",
			StudentName:        "김합격A",
			AdmissionYear:      2026,
			Category:           "meister",
			SchoolName:         "울산마이스터고등학교",
			Track:              "특별",
			Status:             "합격",
			Score:              185.0,
			AssignedDepartment: "전기전자과",
			Preferences:        []string{"전기전자과", "정밀기계과"},
		},
		{
			StudentNum:         "2",
			StudentName:        "김합격B",
			AdmissionYear:      2026,
			Category:           "meister",
			SchoolName:         "울산마이스터고등학교",
			Track:              "특별",
			Status:             "최종 진학",
			Score:              195.0,
			AssignedDepartment: "전기전자과",
			Preferences:        []string{"전기전자과"},
		},
		{
			StudentNum:         "3",
			StudentName:        "이불합A",
			AdmissionYear:      2026,
			Category:           "meister",
			SchoolName:         "울산마이스터고등학교",
			Track:              "특별",
			Status:             "불합격",
			Score:              187.0, // 합격 최저점(185.0)보다 높음 -> 겹침(Overlap) 발생!
			AssignedDepartment: "전기전자과",
			Preferences:        []string{"전기전자과"},
		},
		{
			StudentNum:         "4",
			StudentName:        "이불합B",
			AdmissionYear:      2026,
			Category:           "meister",
			SchoolName:         "울산마이스터고등학교",
			Track:              "특별",
			Status:             "불합격",
			Score:              170.0,
			AssignedDepartment: "전기전자과",
			Preferences:        []string{"전기전자과"},
		},
	}

	statsList := ComputeDepartmentAdmissionStats(records, 5.0)
	if len(statsList) == 0 {
		t.Fatalf("Computed stats should not be empty")
	}

	stat := statsList[0]
	if stat.SchoolName != "울산마이스터고등학교" || stat.Department != "전기전자과" {
		t.Errorf("Stat group key mismatch: got school=%s, dept=%s", stat.SchoolName, stat.Department)
	}

	if stat.AcceptedCount != 2 {
		t.Errorf("AcceptedCount mismatch: got %v, want 2", stat.AcceptedCount)
	}
	if stat.RejectedCount != 2 {
		t.Errorf("RejectedCount mismatch: got %v, want 2", stat.RejectedCount)
	}

	// 합격점수 검증: [185.0, 195.0]
	if stat.AcceptedMin != 185.0 || stat.AcceptedMax != 195.0 || stat.AcceptedAvg != 190.0 {
		t.Errorf("Accepted scores mismatch: got min=%v, max=%v, avg=%v", stat.AcceptedMin, stat.AcceptedMax, stat.AcceptedAvg)
	}
	if stat.AcceptedMedian != 190.0 {
		t.Errorf("Accepted median mismatch: got %v, want 190.0", stat.AcceptedMedian)
	}

	// 불합격점수 검증: [170.0, 187.0]
	if stat.RejectedMin != 170.0 || stat.RejectedMax != 187.0 || stat.RejectedAvg != 178.5 {
		t.Errorf("Rejected scores mismatch: got min=%v, max=%v, avg=%v", stat.RejectedMin, stat.RejectedMax, stat.RejectedAvg)
	}

	// 겹침 구간(Overlap) 검증: 합격최저(185.0) <= 불합격최고(187.0)
	if !stat.HasOverlap {
		t.Errorf("HasOverlap should be true, but got false")
	}
	if stat.OverlapMin != 185.0 || stat.OverlapMax != 187.0 {
		t.Errorf("Overlap range mismatch: got [%v, %v], want [185.0, 187.0]", stat.OverlapMin, stat.OverlapMax)
	}

	// 분포 히스토그램 검증
	if len(stat.Distribution) == 0 {
		t.Errorf("Histogram distribution should not be empty")
	}
}
