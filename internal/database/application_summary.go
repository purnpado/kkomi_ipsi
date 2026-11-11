package database

import (
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strconv"
	"strings"

	"PHGC/internal/calc"
	"PHGC/internal/model"
)

// ApplicationSummary is a school-internal aggregate. It intentionally has no
// student, class, teacher or middle-school identifier and can be used for the
// grade-head's application dashboard.
type ApplicationSummary struct {
	AdmissionYear    int     `json:"admissionYear"`
	Category         string  `json:"category"`
	SchoolName       string  `json:"schoolName"`
	Track            string  `json:"track"`
	Department       string  `json:"department"`
	PreferenceRank   int     `json:"preferenceRank"`
	PlannedCount     int     `json:"plannedCount"`
	SubmittedCount   int     `json:"submittedCount"`
	AcceptedCount    int     `json:"acceptedCount"`
	RejectedCount    int     `json:"rejectedCount"`
	FinalCount       int     `json:"finalCount"`
	MinAcceptedScore float64 `json:"minAcceptedScore"`
	MaxAcceptedScore float64 `json:"maxAcceptedScore"`
	AvgAcceptedScore float64 `json:"avgAcceptedScore"`
	AcceptedMedian   float64 `json:"acceptedMedian"`
	AcceptedQ1       float64 `json:"acceptedQ1"`
	AcceptedQ3       float64 `json:"acceptedQ3"`
	AcceptedStdDev   float64 `json:"acceptedStdDev"`
	MinRejectedScore float64 `json:"minRejectedScore"`
	MaxRejectedScore float64 `json:"maxRejectedScore"`
	AvgRejectedScore float64 `json:"avgRejectedScore"`
	HasOverlap       bool    `json:"hasOverlap"`
	OverlapMin       float64 `json:"overlapMin"`
	OverlapMax       float64 `json:"overlapMax"`
	MinExpectedScore float64 `json:"minExpectedScore"`
	MaxExpectedScore float64 `json:"maxExpectedScore"`
	AvgExpectedScore float64 `json:"avgExpectedScore"`
	// 1차·2차 단계 구분(마이스터고·특성화고). 1차 미구분 기존 기록은 단계 통계에서 빠진다.
	Stage1PassCount    int     `json:"stage1PassCount"`    // 1차 합격(최종 합격·2차 탈락·2차 대기 포함)
	Stage1FailCount    int     `json:"stage1FailCount"`    // 1차 불합격
	Stage2FailCount    int     `json:"stage2FailCount"`    // 1차 합격 후 최종 불합격
	MinStage1PassScore float64 `json:"minStage1PassScore"` // 1차 합격선(1차 합격자 최저점)
	MaxStage1FailScore float64 `json:"maxStage1FailScore"` // 1차 불합격자 최고점
	AvgStage2FailScore float64 `json:"avgStage2FailScore"` // 2차 탈락자 평균(면접 등 점수화 어려운 전형 영향)
}

// GetApplicationSummaries aggregates only data held inside this school's
// encrypted class DBs. It never sends records to a network service.
func (dm *DBManager) GetApplicationSummaries() ([]ApplicationSummary, error) {
	config, err := dm.GetSchoolConfig()
	if err != nil {
		return nil, err
	}
	classNums := make([]int, 0, config.ClassCount)
	for classNum := 1; classNum <= config.ClassCount; classNum++ {
		classNums = append(classNums, classNum)
	}
	return dm.getApplicationSummaries(classNums, true)
}

// GetClassApplicationSummaries is the homeroom-safe view: it aggregates only
// one class DB and never exposes other homeroom teachers' records.
func (dm *DBManager) GetClassApplicationSummaries(classNum int) ([]ApplicationSummary, error) {
	if classNum < 1 {
		return nil, fmt.Errorf("학급 정보가 올바르지 않습니다")
	}
	return dm.getApplicationSummaries([]int{classNum})
}

func (dm *DBManager) getApplicationSummaries(classNums []int, includeHistory ...bool) ([]ApplicationSummary, error) {
	type accumulator struct {
		ApplicationSummary
		acceptedSum        float64
		acceptedScoreCount int
		expectedSum        float64
		expectedCount      int
		rejectedSum        float64
		acceptedScores     []float64
		rejectedScores     []float64
		hasMin             bool
		hasAcceptedMax     bool
		hasRejectedMax     bool
		hasExpectedMin     bool
		hasExpectedMax     bool
		hasStage1Pass      bool
		stage2FailSum      float64
		stage2FailScored   int
	}
	groups := map[string]*accumulator{}
	add := func(r model.ApplicationRecord, department string, rank int) {
		if !model.IsScoredCategory(r.Category) {
			r.Score = 0 // 별도 전형 학교는 인원만 집계한다.
		}
		key := strings.Join([]string{strconv.Itoa(r.AdmissionYear), r.Category, r.SchoolName, r.Track, department, strconv.Itoa(rank)}, "\x1f")
		a := groups[key]
		if a == nil {
			a = &accumulator{ApplicationSummary: ApplicationSummary{AdmissionYear: r.AdmissionYear, Category: r.Category, SchoolName: r.SchoolName, Track: r.Track, Department: department, PreferenceRank: rank}}
			groups[key] = a
		}
		switch r.Status {
		case "지원희망", "지원 희망", "지원예정", "지원 예정":
			a.PlannedCount++
		case "지원완료", "지원 완료":
			a.SubmittedCount++
		case "합격":
			a.AcceptedCount++
		case "불합격":
			a.RejectedCount++
		case "최종 진학":
			a.FinalCount++
			a.AcceptedCount++
		}
		if (r.Status == "지원희망" || r.Status == "지원 희망" || r.Status == "지원예정" || r.Status == "지원 예정" || r.Status == "지원완료" || r.Status == "지원 완료") && r.Score > 0 {
			a.expectedSum += r.Score
			a.expectedCount++
			if !a.hasExpectedMin || r.Score < a.MinExpectedScore {
				a.MinExpectedScore, a.hasExpectedMin = r.Score, true
			}
			if !a.hasExpectedMax || r.Score > a.MaxExpectedScore {
				a.MaxExpectedScore, a.hasExpectedMax = r.Score, true
			}
		}
		if (r.Status == "합격" || r.Status == "최종 진학") && r.Score > 0 {
			a.acceptedSum += r.Score
			a.acceptedScoreCount++
			a.acceptedScores = append(a.acceptedScores, r.Score)
			if !a.hasMin || r.Score < a.MinAcceptedScore {
				a.MinAcceptedScore, a.hasMin = r.Score, true
			}
			if !a.hasAcceptedMax || r.Score > a.MaxAcceptedScore {
				a.MaxAcceptedScore, a.hasAcceptedMax = r.Score, true
			}
		}
		stage2Fail := r.Status == "불합격" && r.FirstStageResult == "합격"
		stage1Pass := r.FirstStageResult == "합격" || ((r.Status == "합격" || r.Status == "최종 진학") && (r.Category == "meister" || r.Category == "special"))
		if stage1Pass {
			a.Stage1PassCount++
			if r.Score > 0 && (!a.hasStage1Pass || r.Score < a.MinStage1PassScore) {
				a.MinStage1PassScore, a.hasStage1Pass = r.Score, true
			}
		}
		if r.FirstStageResult == "불합격" {
			a.Stage1FailCount++
			if r.Score > a.MaxStage1FailScore {
				a.MaxStage1FailScore = r.Score
			}
		}
		if stage2Fail {
			// 1차를 통과한 뒤 면접 등에서 떨어진 학생은 점수 커트라인 아래가 아니므로
			// 불합격 점수 분포(겹침 구간)에 넣지 않고 따로 집계한다.
			a.Stage2FailCount++
			if r.Score > 0 {
				a.stage2FailSum += r.Score
				a.stage2FailScored++
			}
		}
		if r.Status == "불합격" && r.Score > 0 && !stage2Fail {
			a.rejectedSum += r.Score
			a.rejectedScores = append(a.rejectedScores, r.Score)
			if !a.hasRejectedMax || r.Score > a.MaxRejectedScore {
				a.MaxRejectedScore, a.hasRejectedMax = r.Score, true
			}
		}
	}
	// 기록 한 건을 학과·지망별 묶음에 더한다. 진행 중 원서는 지망 학과마다, 결과가 나온 원서는 배정 학과로 센다.
	presentYears := map[int]bool{}
	dispatch := func(r model.ApplicationRecord) {
		if r.Category != "meister" && r.Category != "special" {
			add(r, "", 0)
			return
		}
		if r.Status == "지원희망" || r.Status == "지원 희망" || r.Status == "지원예정" || r.Status == "지원 예정" || r.Status == "지원완료" || r.Status == "지원 완료" {
			for i, department := range r.Preferences {
				if department != "" {
					add(r, department, i+1)
				}
			}
			return
		}
		department := r.AssignedDepartment
		if department == "" {
			department = "전체"
		}
		rank := 0
		for i, preferred := range r.Preferences {
			if preferred == department {
				rank = i + 1
				break
			}
		}
		add(r, department, rank)
	}
	for _, classNum := range classNums {
		db, err := dm.OpenDB(dm.GetClassDBPath(classNum))
		if err != nil {
			if os.IsNotExist(err) {
				continue
			}
			return nil, err
		}
		rows, err := db.Query(`SELECT student_num,student_name,admission_year,category,school_name,track,status,score,score_basis,preferences_json,assigned_department,COALESCE(assigned_school, ''),COALESCE(first_stage_result, ''),updated_at FROM student_applications`)
		if err != nil {
			db.Close()
			continue
		}
		for rows.Next() {
			var r model.ApplicationRecord
			var prefs string
			if err := rows.Scan(&r.StudentNum, &r.StudentName, &r.AdmissionYear, &r.Category, &r.SchoolName, &r.Track, &r.Status, &r.Score, &r.ScoreBasis, &prefs, &r.AssignedDepartment, &r.AssignedSchool, &r.FirstStageResult, &r.UpdatedAt); err == nil {
				_ = json.Unmarshal([]byte(prefs), &r.Preferences)
				presentYears[r.AdmissionYear] = true
				dispatch(r)
			}
		}
		rows.Close()
		db.Close()
	}
	// 학교 전체 집계는 지금 학급 DB에 없는 학년도의 익명 보관 기록도 더한다(새 프로그램으로 이어 받은 지난 입시).
	if len(includeHistory) > 0 && includeHistory[0] {
		for _, r := range dm.historyAsRecords(presentYears) {
			dispatch(r)
		}
	}
	out := make([]ApplicationSummary, 0, len(groups))
	for _, a := range groups {
		if a.PlannedCount == 0 && a.SubmittedCount == 0 && a.AcceptedCount == 0 && a.RejectedCount == 0 && a.FinalCount == 0 {
			continue
		}
		if a.acceptedScoreCount > 0 {
			a.AvgAcceptedScore = calc.Round2(a.acceptedSum / float64(a.acceptedScoreCount))
			a.AcceptedQ1, a.AcceptedMedian, a.AcceptedQ3 = calc.CalculateQuartiles(a.acceptedScores)
			a.AcceptedStdDev = calc.CalculateStdDev(a.acceptedScores, a.AvgAcceptedScore)
		}
		if a.expectedCount > 0 {
			a.AvgExpectedScore = calc.Round2(a.expectedSum / float64(a.expectedCount))
		}
		if a.stage2FailScored > 0 {
			a.AvgStage2FailScore = calc.Round2(a.stage2FailSum / float64(a.stage2FailScored))
		}
		if len(a.rejectedScores) > 0 {
			a.AvgRejectedScore = calc.Round2(a.rejectedSum / float64(len(a.rejectedScores)))
			sort.Float64s(a.rejectedScores)
			a.MinRejectedScore = calc.Round2(a.rejectedScores[0])
		}
		if a.acceptedScoreCount > 0 && len(a.rejectedScores) > 0 && a.MaxRejectedScore >= a.MinAcceptedScore {
			a.HasOverlap = true
			a.OverlapMin = a.MinAcceptedScore
			a.OverlapMax = a.MaxRejectedScore
		}
		out = append(out, a.ApplicationSummary)
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
		if out[i].PreferenceRank != out[j].PreferenceRank {
			return out[i].PreferenceRank < out[j].PreferenceRank
		}
		return out[i].Track < out[j].Track
	})
	return out, nil
}

// GetDepartmentAdmissionStats calculates granular cutoffs, percentiles, overlap ranges,
// and distribution histograms for all departments and tracks across classes.
func (dm *DBManager) GetDepartmentAdmissionStats(bucketStep float64) ([]calc.DepartmentAdmissionStats, error) {
	// 지금 학급 DB 기록 + 지난 학년도 익명 보관 기록(새 프로그램으로 이어 받은 입시 결과 포함)
	records, err := dm.schoolRecordsWithHistory()
	if err != nil {
		return nil, err
	}
	return calc.ComputeDepartmentAdmissionStats(records, bucketStep), nil
}
