package database

// 관내 공유 패키지 받아 들이기(V2·V1)와 참여 학교 조회.

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

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
		(school_pkg_id, admission_year, high_school, department, track, preference_rank, status, score, score_basis, stage1_common_score, stage1_school_score, score_details_json, formula_version, first_stage_result, general_detail_json) 
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
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
			string(detailsJSON), rec.FormulaVersion, rec.FirstStageResult, generalDetailJSON(rec.GeneralDetail),
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

func generalDetailJSON(d *SharedGeneralDetail) string {
	if d == nil {
		return ""
	}
	b, err := json.Marshal(d)
	if err != nil {
		return ""
	}
	return string(b)
}
