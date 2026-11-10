package database

import (
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"fmt"
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
		FOREIGN KEY(school_pkg_id) REFERENCES shared_participating_schools(id) ON DELETE CASCADE
	)`)
	if err != nil {
		return err
	}

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

	var anonymousRecords []AnonymousApplicationRecord
	for _, r := range records {
		if r.AdmissionYear > 0 && r.AdmissionYear != admissionYear {
			continue
		}
		if strings.TrimSpace(r.SchoolName) == "" {
			continue
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
			HighSchool:     normalizeCutoffSchool(r.SchoolName),
			Department:     normalizeCutoffDept(dept),
			Track:          normalizeCutoffTrack(r.Track),
			PreferenceRank: rank,
			Status:         r.Status,
			Score:          r.Score,
			ScoreBasis:     r.ScoreBasis,
			ScoreDetails:   details,
			FormulaVersion: details.FormulaVersion,
		}
		anonymousRecords = append(anonymousRecords, anon)
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

		rejCount := float64(ds.RejectedCount)
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

// ImportV2Package V2 형식의 패키지 적재 및 중복 학교 자동 교체 처리
func (dm *DBManager) ImportV2Package(db *sql.DB, v2 *SharedPackageV2) (*SharedPackageImportResult, error) {
	tx, err := db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	schoolName := strings.TrimSpace(v2.Cover.SchoolName)
	if schoolName == "" {
		schoolName = "미확인학교"
	}
	admissionYear := v2.Cover.AdmissionYear
	if admissionYear <= 0 {
		admissionYear = time.Now().Year() + 1
	}

	// 기존 동일 학교, 동일 학년도 데이터가 있는지 확인
	var existingPkgID int64
	var isReplaced bool
	err = tx.QueryRow("SELECT id FROM shared_participating_schools WHERE school_name = ? AND admission_year = ?", schoolName, admissionYear).Scan(&existingPkgID)
	if err == nil && existingPkgID > 0 {
		isReplaced = true
		// 이전 데이터 삭제 (CASCADE 또는 명시적 삭제)
		_, _ = tx.Exec("DELETE FROM shared_anonymous_scores WHERE school_pkg_id = ?", existingPkgID)
		_, _ = tx.Exec("DELETE FROM shared_summary_stats WHERE school_pkg_id = ?", existingPkgID)
		_, _ = tx.Exec("DELETE FROM shared_participating_schools WHERE id = ?", existingPkgID)
	}

	// 신규 참여 학교 등록
	res, err := tx.Exec(`INSERT INTO shared_participating_schools 
		(school_name, admission_year, format_version, record_count, imported_at) 
		VALUES (?, ?, 2, ?, CURRENT_TIMESTAMP)`,
		schoolName, admissionYear, len(v2.AnonymousRecords))
	if err != nil {
		return nil, err
	}
	pkgID, err := res.LastInsertId()
	if err != nil {
		return nil, err
	}

	// 익명 학생 점수 자료 배치 삽입
	stmtScore, err := tx.Prepare(`INSERT INTO shared_anonymous_scores 
		(school_pkg_id, admission_year, high_school, department, track, preference_rank, status, score, score_basis, stage1_common_score, stage1_school_score, score_details_json, formula_version) 
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		return nil, err
	}
	defer stmtScore.Close()

	for _, rec := range v2.AnonymousRecords {
		detailsJSON, _ := json.Marshal(rec.ScoreDetails)
		_, err := stmtScore.Exec(
			pkgID, admissionYear, rec.HighSchool, rec.Department, rec.Track,
			rec.PreferenceRank, rec.Status, rec.Score, rec.ScoreBasis,
			rec.ScoreDetails.Percentile, rec.ScoreDetails.AcademicScore,
			string(detailsJSON), rec.FormulaVersion,
		)
		if err != nil {
			return nil, err
		}
	}

	// 요약 통계 배치 삽입
	stmtStat, err := tx.Prepare(`INSERT INTO shared_summary_stats 
		(school_pkg_id, admission_year, high_school, department, track, score_type, applicant_count, accepted_count, accepted_sum, accepted_sum_sq, accepted_min, accepted_max, accepted_median, accepted_q1, accepted_q3, accepted_std_dev, rejected_count, rejected_sum, rejected_max, has_overlap, overlap_min, overlap_max) 
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		return nil, err
	}
	defer stmtStat.Close()

	for _, s := range v2.SummaryStats {
		_, err := stmtStat.Exec(
			pkgID, admissionYear, s.HighSchool, s.Department, s.Track, s.ScoreType,
			s.TotalApplicants, s.AcceptedCount, s.AcceptedSum, s.AcceptedSumSq,
			s.AcceptedMin, s.AcceptedMax, s.AcceptedMedian, s.AcceptedQ1, s.AcceptedQ3, s.AcceptedStdDev,
			s.RejectedCount, s.RejectedSum, s.RejectedMax, s.HasOverlap, s.OverlapMin, s.OverlapMax,
		)
		if err != nil {
			return nil, err
		}
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}

	// 현재 관내 전체 참여 학교 수 및 총 학생 레코드 수 조회
	var totalSchools, totalRecords int
	_ = db.QueryRow("SELECT COUNT(*), COALESCE(SUM(record_count), 0) FROM shared_participating_schools WHERE admission_year = ?", admissionYear).Scan(&totalSchools, &totalRecords)

	return &SharedPackageImportResult{
		SchoolName:               schoolName,
		AdmissionYear:            admissionYear,
		FormatVersion:            2,
		RecordCount:              len(v2.AnonymousRecords),
		IsReplaced:               isReplaced,
		TotalParticipatingSchool: totalSchools,
		TotalAnonymousRecords:    totalRecords,
	}, nil
}

// ImportV1Package 하위 호환: 기존 V1 컷오프 파일 적재
func (dm *DBManager) ImportV1Package(db *sql.DB, cutoffs []CutoffInfo) (*SharedPackageImportResult, error) {
	admissionYear := cutoffs[0].Year
	schoolName := "관내공유학교(V1)"

	tx, err := db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	res, err := tx.Exec(`INSERT INTO shared_participating_schools 
		(school_name, admission_year, format_version, record_count, imported_at) 
		VALUES (?, ?, 1, ?, CURRENT_TIMESTAMP)`,
		schoolName, admissionYear, len(cutoffs))
	if err != nil {
		return nil, err
	}
	pkgID, err := res.LastInsertId()
	if err != nil {
		return nil, err
	}

	stmtStat, err := tx.Prepare(`INSERT INTO shared_summary_stats 
		(school_pkg_id, admission_year, high_school, department, track, score_type, applicant_count, accepted_count, accepted_sum, accepted_sum_sq, accepted_min, accepted_max, accepted_median, accepted_q1, accepted_q3, accepted_std_dev, rejected_count, rejected_sum, rejected_max, has_overlap, overlap_min, overlap_max) 
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		return nil, err
	}
	defer stmtStat.Close()

	for _, c := range cutoffs {
		sNorm := normalizeCutoffSchool(c.SchoolName)
		dNorm := normalizeCutoffDept(c.Department)
		tNorm := normalizeCutoffTrack(c.Track)
		val := c.AvgValue
		if val <= 0 {
			val = c.MinValue
		}
		if _, err := stmtStat.Exec(
			pkgID, c.Year, sNorm, dNorm, tNorm, c.ScoreType,
			1, 1, val, val*val,
			c.MinValue, c.MaxValue, val, c.MinValue, c.MaxValue, 0,
			0, 0, 0, false, 0, 0,
		); err != nil {
			return nil, fmt.Errorf("요약 통계 삽입 실패: %w", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}

	var totalSchools, totalRecords int
	_ = db.QueryRow("SELECT COUNT(*), COALESCE(SUM(record_count), 0) FROM shared_participating_schools WHERE admission_year = ?", admissionYear).Scan(&totalSchools, &totalRecords)

	return &SharedPackageImportResult{
		SchoolName:               schoolName,
		AdmissionYear:            admissionYear,
		FormatVersion:            1,
		RecordCount:              len(cutoffs),
		IsReplaced:               false,
		TotalParticipatingSchool: totalSchools,
		TotalAnonymousRecords:    totalRecords,
	}, nil
}

// GetParticipatingSchools 취합된 참여 중학교 목록 반환 (표지 정보만 제공)
func (dm *DBManager) GetParticipatingSchools(admissionYear int) ([]SharedParticipatingSchool, error) {
	if err := dm.InitSharedDatabaseTables(); err != nil {
		return nil, err
	}
	db, err := dm.OpenDB(dm.GetConfigDBPath())
	if err != nil {
		return nil, err
	}
	defer db.Close()

	query := "SELECT id, school_name, admission_year, format_version, record_count, imported_at FROM shared_participating_schools"
	var args []interface{}
	if admissionYear > 0 {
		query += " WHERE admission_year = ?"
		args = append(args, admissionYear)
	}
	query += " ORDER BY imported_at DESC"

	rows, err := db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []SharedParticipatingSchool
	for rows.Next() {
		var s SharedParticipatingSchool
		var importedAtStr string
		if err := rows.Scan(&s.ID, &s.SchoolName, &s.AdmissionYear, &s.FormatVersion, &s.RecordCount, &importedAtStr); err == nil {
			s.ImportedAt, _ = time.Parse("2006-01-02 15:04:05", importedAtStr)
			list = append(list, s)
		}
	}
	return list, nil
}
