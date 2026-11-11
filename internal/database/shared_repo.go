package database

import (
	"crypto/rand"
	"math/big"
	"strings"
	"time"

	"PHGC/internal/calc"
	"PHGC/internal/model"
)

// InitSharedDatabaseTables 관내 공유/취합 데이터를 저장할 SQLite 테이블 초기화
func (dm *DBManager) InitSharedDatabaseTables() error {
	db, err := dm.OpenDB(dm.GetConfigDBPath())
	if err != nil {
		return err
	}
	defer db.Close()

	// 1. 참여 학교 표지 메타데이터 (학교명+학년도 기준 고유성 보장)
	_, err = db.Exec(`CREATE TABLE IF NOT EXISTS shared_participating_schools (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		school_name TEXT NOT NULL,
		admission_year INTEGER NOT NULL,
		format_version INTEGER NOT NULL DEFAULT 2,
		record_count INTEGER NOT NULL DEFAULT 0,
		imported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		UNIQUE(school_name, admission_year)
	)`)
	if err != nil {
		return err
	}

	// 2. 관내 통합 익명 학생 점수 자료 (학생 식별 정보 절대 없음, package_id로 교체 관리만 수행)
	_, err = db.Exec(`CREATE TABLE IF NOT EXISTS shared_anonymous_scores (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		school_pkg_id INTEGER NOT NULL,
		admission_year INTEGER NOT NULL,
		high_school TEXT NOT NULL,
		department TEXT NOT NULL,
		track TEXT NOT NULL,
		preference_rank INTEGER NOT NULL,
		status TEXT NOT NULL,
		score REAL NOT NULL,
		score_basis TEXT NOT NULL,
		stage1_common_score REAL DEFAULT 0,
		stage1_school_score REAL DEFAULT 0,
		score_details_json TEXT DEFAULT '',
		formula_version TEXT DEFAULT '',
		first_stage_result TEXT DEFAULT '',
		FOREIGN KEY(school_pkg_id) REFERENCES shared_participating_schools(id) ON DELETE CASCADE
	)`)
	if err != nil {
		return err
	}

	_, _ = db.Exec(`ALTER TABLE shared_anonymous_scores ADD COLUMN first_stage_result TEXT DEFAULT ''`)
	_, _ = db.Exec(`ALTER TABLE shared_anonymous_scores ADD COLUMN general_detail_json TEXT DEFAULT ''`)

	// 3. 요약 통계 테이블 (다중 학교 모멘트 합산용)
	_, err = db.Exec(`CREATE TABLE IF NOT EXISTS shared_summary_stats (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		school_pkg_id INTEGER NOT NULL,
		admission_year INTEGER NOT NULL,
		high_school TEXT NOT NULL,
		department TEXT NOT NULL,
		track TEXT NOT NULL,
		score_type TEXT NOT NULL,
		applicant_count INTEGER NOT NULL,
		accepted_count INTEGER NOT NULL,
		accepted_sum REAL NOT NULL,
		accepted_sum_sq REAL NOT NULL,
		accepted_min REAL NOT NULL,
		accepted_max REAL NOT NULL,
		accepted_median REAL NOT NULL,
		accepted_q1 REAL NOT NULL,
		accepted_q3 REAL NOT NULL,
		accepted_std_dev REAL NOT NULL,
		rejected_count INTEGER NOT NULL,
		rejected_sum REAL NOT NULL,
		rejected_max REAL NOT NULL,
		has_overlap BOOLEAN NOT NULL,
		overlap_min REAL NOT NULL,
		overlap_max REAL NOT NULL,
		FOREIGN KEY(school_pkg_id) REFERENCES shared_participating_schools(id) ON DELETE CASCADE
	)`)
	return err
}

// shuffleAnonymousRecords Fisher-Yates 알고리즘을 암호학적으로 안전한 난수로 수행하여 순서 무작위화
func shuffleAnonymousRecords(records []AnonymousApplicationRecord) error {
	for i := len(records) - 1; i > 0; i-- {
		nBig, err := rand.Int(rand.Reader, big.NewInt(int64(i+1)))
		if err != nil {
			return err
		}
		j := int(nBig.Int64())
		records[i], records[j] = records[j], records[i]
	}
	return nil
}

// BuildSharedPackageV2 우리 학교의 원서 데이터를 기반으로 개인정보가 완전히 제거된 V2 공유 패키지 생성
func (dm *DBManager) BuildSharedPackageV2(admissionYear int) (*SharedPackageV2, error) {
	config, err := dm.GetSchoolConfig()
	if err != nil {
		return nil, err
	}
	schoolName := "미등록학교"
	if config != nil && strings.TrimSpace(config.SchoolName) != "" {
		schoolName = strings.TrimSpace(config.SchoolName)
	}
	if admissionYear <= 0 && config != nil {
		admissionYear = config.AdmissionYear
	}
	if admissionYear <= 0 {
		admissionYear = time.Now().Year() + 1
	}

	records, err := dm.GetSchoolApplicationRecords()
	if err != nil {
		return nil, err
	}
	// 지금 학급 DB에 그 학년도 기록이 없으면(지난 학년도) 익명 보관 기록으로 만든다.
	fromHistory := true
	for _, r := range records {
		if r.AdmissionYear == admissionYear {
			fromHistory = false
			break
		}
	}
	var historyGeneral []AnonymousApplicationRecord
	if fromHistory {
		records = nil
		rows, _ := dm.GetAdmissionHistory()
		for _, h := range rows {
			if h.AdmissionYear != admissionYear {
				continue
			}
			if a, ok := generalAnonFromHistory(h); ok {
				historyGeneral = append(historyGeneral, a)
				continue
			}
			records = append(records, historyToRecord(h))
		}
	}

	var anonymousRecords []AnonymousApplicationRecord
	for _, r := range records {
		if r.AdmissionYear > 0 && r.AdmissionYear != admissionYear {
			continue
		}
		if strings.TrimSpace(r.SchoolName) == "" {
			continue
		}
		if !model.IsScoredCategory(r.Category) {
			continue // 자사고·외고·예술고 등 별도 전형 학교는 점수 커트라인 자료가 아니다.
		}

		dept := strings.TrimSpace(r.AssignedDepartment)
		rank := 1
		if dept == "" && len(r.Preferences) > 0 {
			dept = strings.TrimSpace(r.Preferences[0])
		}
		if dept != "" && len(r.Preferences) > 0 {
			for idx, p := range r.Preferences {
				if strings.TrimSpace(p) == dept {
					rank = idx + 1
					break
				}
			}
		}

		var details model.ApplicationScoreDetails
		if r.ScoreDetails != nil {
			details = *r.ScoreDetails
		}

		anon := AnonymousApplicationRecord{
			HighSchool:       normalizeCutoffSchool(r.SchoolName),
			Department:       normalizeCutoffDept(dept),
			Track:            normalizeCutoffTrack(r.Track),
			PreferenceRank:   rank,
			Status:           r.Status,
			Score:            r.Score,
			ScoreBasis:       r.ScoreBasis,
			ScoreDetails:     details,
			FormulaVersion:   details.FormulaVersion,
			FirstStageResult: r.FirstStageResult,
		}
		anonymousRecords = append(anonymousRecords, anon)
	}

	// 후기 일반고 결과(배정·미배정)는 학교명이 없으므로 따로 만든다(항목별 확정 총점).
	if fromHistory {
		anonymousRecords = append(anonymousRecords, historyGeneral...)
	} else {
		anonymousRecords = append(anonymousRecords, dm.buildGeneralAnonymousRecords(records, admissionYear)...)
	}

	// 1. 개인 식별 방지: 순서 무작위 셔플 (Fisher-Yates)
	if err := shuffleAnonymousRecords(anonymousRecords); err != nil {
		return nil, err
	}

	// 2. 학과별/전형별 세부 통계 및 히스토그램 산출
	deptStats := calc.ComputeDepartmentAdmissionStats(records, 1.0)
	var summaryStats []SharedSummaryStat
	var histograms []SharedDepartmentHistogram

	for _, ds := range deptStats {
		if ds.AdmissionYear > 0 && ds.AdmissionYear != admissionYear {
			continue
		}

		// 다중 학교 통합을 위한 모멘트(합, 제곱합) 계산
		accCount := float64(ds.AcceptedCount)
		accSum := calc.Round2(ds.AcceptedAvg * accCount)
		var accSumSq float64
		if ds.AcceptedCount == 1 {
			accSumSq = calc.Round2(ds.AcceptedAvg * ds.AcceptedAvg)
		} else if ds.AcceptedCount > 1 {
			// s^2 = (SumSq - n*avg^2) / (n - 1) => SumSq = (n - 1)*s^2 + n*avg^2
			variance := ds.AcceptedStdDev * ds.AcceptedStdDev
			accSumSq = calc.Round2((accCount-1.0)*variance + accCount*ds.AcceptedAvg*ds.AcceptedAvg)
		}

		// 2차(면접 등) 탈락자는 불합격 점수 평균에 들어 있지 않으므로 합계 계산에서도 뺀다.
		rejCount := float64(ds.RejectedCount - ds.Stage2FailCount)
		rejSum := calc.Round2(ds.RejectedAvg * rejCount)

		scoreType := "총점"
		if strings.Contains(ds.Track, "일반고") {
			scoreType = "내신백분율"
		}

		stat := SharedSummaryStat{
			AdmissionYear:   ds.AdmissionYear,
			HighSchool:      ds.SchoolName,
			Department:      ds.Department,
			Track:           ds.Track,
			ScoreType:       scoreType,
			TotalApplicants: ds.TotalApplicants,
			AcceptedCount:   ds.AcceptedCount,
			AcceptedSum:     accSum,
			AcceptedSumSq:   accSumSq,
			AcceptedMin:     ds.AcceptedMin,
			AcceptedMax:     ds.AcceptedMax,
			AcceptedAvg:     ds.AcceptedAvg,
			AcceptedMedian:  ds.AcceptedMedian,
			AcceptedQ1:      ds.AcceptedQ1,
			AcceptedQ3:      ds.AcceptedQ3,
			AcceptedStdDev:  ds.AcceptedStdDev,
			RejectedCount:   ds.RejectedCount,
			RejectedSum:     rejSum,
			RejectedMax:     ds.RejectedMax,
			RejectedAvg:     ds.RejectedAvg,
			HasOverlap:      ds.HasOverlap,
			OverlapMin:      ds.OverlapMin,
			OverlapMax:      ds.OverlapMax,
		}
		summaryStats = append(summaryStats, stat)

		// 히스토그램 변환
		var buckets []SharedScoreHistogramBucket
		for _, b := range ds.Distribution {
			buckets = append(buckets, SharedScoreHistogramBucket{
				MinScore:      b.MinScore,
				MaxScore:      b.MaxScore,
				AcceptedCount: b.AcceptedCount,
				RejectedCount: b.RejectedCount,
			})
		}
		histograms = append(histograms, SharedDepartmentHistogram{
			HighSchool: ds.SchoolName,
			Department: ds.Department,
			Track:      ds.Track,
			ScoreType:  scoreType,
			Step:       1.0,
			Buckets:    buckets,
		})
	}

	pkg := &SharedPackageV2{
		Cover: SharedPackageCover{
			SchoolName:    schoolName,
			AdmissionYear: admissionYear,
			CreatedAt:     time.Now().UTC(),
			AppVersion:    "2.0.0",
			FormatVersion: 2,
			RecordCount:   len(anonymousRecords),
		},
		AnonymousRecords: anonymousRecords,
		Histograms:       histograms,
		SummaryStats:     summaryStats,
		FormulaVersions:  make(map[string]string),
	}

	return pkg, nil
}
