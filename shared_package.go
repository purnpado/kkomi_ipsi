package main

import (
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"fmt"
	"math"
	"math/big"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// SharedPackageCover V2 공유 파일 표지
type SharedPackageCover struct {
	SchoolName    string    `json:"schoolName"`    // 발송 중학교 이름 (취합 메타데이터 및 중복 파일 식별용)
	AdmissionYear int       `json:"admissionYear"` // 입학 학년도
	CreatedAt     time.Time `json:"createdAt"`     // 작성 시각
	AppVersion    string    `json:"appVersion"`    // 앱 버전
	FormatVersion int       `json:"formatVersion"` // 포맷 버전 (2)
	RecordCount   int       `json:"recordCount"`   // 포함된 익명 학생 레코드 수
}

// AnonymousApplicationRecord 개인 식별 정보(이름, 학번, 반, 입력시각)가 완전히 제거된 익명 학생별 점수 자료
type AnonymousApplicationRecord struct {
	HighSchool     string                  `json:"highSchool"`     // 목표 고교명
	Department     string                  `json:"department"`     // 지원/배정 학과
	Track          string                  `json:"track"`          // 전형 (일반, 특별 등)
	PreferenceRank int                     `json:"preferenceRank"` // 지망 순위 (1지망, 2지망 등)
	Status         string                  `json:"status"`         // 결과 (합격, 불합격 등)
	Score          float64                 `json:"score"`          // 2차 총점 / 백분율
	ScoreBasis     string                  `json:"scoreBasis"`     // 점수 기준
	ScoreDetails   ApplicationScoreDetails `json:"scoreDetails"`   // 세부 점수 스냅샷 (1차 교과, 출결, 봉사 등)
	FormulaVersion string                  `json:"formulaVersion"` // 고교 산출식 버전
}

// SharedSummaryStat 다중 학교 자료 취합 시 평균과 표준편차를 정확하게 재계산하기 위한 모멘트(인원, 합, 제곱합) 포함 요약
type SharedSummaryStat struct {
	AdmissionYear   int     `json:"admissionYear"`
	HighSchool      string  `json:"highSchool"`
	Department      string  `json:"department"`
	Track           string  `json:"track"`
	ScoreType       string  `json:"scoreType"`
	TotalApplicants int     `json:"totalApplicants"`
	AcceptedCount   int     `json:"acceptedCount"`
	AcceptedSum     float64 `json:"acceptedSum"`   // 합계 (다중 학교 평균 산출용)
	AcceptedSumSq   float64 `json:"acceptedSumSq"` // 제곱합 (다중 학교 표준편차 산출용)
	AcceptedMin     float64 `json:"acceptedMin"`
	AcceptedMax     float64 `json:"acceptedMax"`
	AcceptedAvg     float64 `json:"acceptedAvg"`
	AcceptedMedian  float64 `json:"acceptedMedian"`
	AcceptedQ1      float64 `json:"acceptedQ1"`
	AcceptedQ3      float64 `json:"acceptedQ3"`
	AcceptedStdDev  float64 `json:"acceptedStdDev"`
	RejectedCount   int     `json:"rejectedCount"`
	RejectedSum     float64 `json:"rejectedSum"`
	RejectedMax     float64 `json:"rejectedMax"`
	RejectedAvg     float64 `json:"rejectedAvg"`
	HasOverlap      bool    `json:"hasOverlap"`
	OverlapMin      float64 `json:"overlapMin"`
	OverlapMax      float64 `json:"overlapMax"`
}

// SharedScoreHistogramBucket 구간별 점수 히스토그램
type SharedScoreHistogramBucket struct {
	MinScore      float64 `json:"minScore"`
	MaxScore      float64 `json:"maxScore"`
	AcceptedCount int     `json:"acceptedCount"`
	RejectedCount int     `json:"rejectedCount"`
}

// SharedDepartmentHistogram 분석 단위별 히스토그램 묶음
type SharedDepartmentHistogram struct {
	HighSchool string                       `json:"highSchool"`
	Department string                       `json:"department"`
	Track      string                       `json:"track"`
	ScoreType  string                       `json:"scoreType"`
	Step       float64                      `json:"step"`
	Buckets    []SharedScoreHistogramBucket `json:"buckets"`
}

// SharedPackageV2 관내 공유 패키지 V2 전체 구조
type SharedPackageV2 struct {
	Cover            SharedPackageCover           `json:"cover"`
	AnonymousRecords []AnonymousApplicationRecord `json:"anonymousRecords"` // Fisher-Yates 무작위 셔플 적용
	Histograms       []SharedDepartmentHistogram  `json:"histograms"`
	SummaryStats     []SharedSummaryStat          `json:"summaryStats"`
	FormulaVersions  map[string]string            `json:"formulaVersions"`
}

// SharedParticipatingSchool 참여 학교 정보
type SharedParticipatingSchool struct {
	ID            int64     `json:"id"`
	SchoolName    string    `json:"schoolName"`
	AdmissionYear int       `json:"admissionYear"`
	FormatVersion int       `json:"formatVersion"`
	RecordCount   int       `json:"recordCount"`
	ImportedAt    time.Time `json:"importedAt"`
}

// SharedPackageImportResult 패키지 가져오기 결과
type SharedPackageImportResult struct {
	SchoolName               string `json:"schoolName"`
	AdmissionYear            int    `json:"admissionYear"`
	FormatVersion            int    `json:"formatVersion"`
	RecordCount              int    `json:"recordCount"`
	IsReplaced               bool   `json:"isReplaced"`
	TotalParticipatingSchool int    `json:"totalParticipatingSchool"`
	TotalAnonymousRecords    int    `json:"totalAnonymousRecords"`
}

// ConsolidatedStatsResult 관내 통합 통계 산출 결과
type ConsolidatedStatsResult struct {
	AdmissionYear            int                       `json:"admissionYear"`
	HighSchool               string                    `json:"highSchool"`
	Department               string                    `json:"department"`
	Track                    string                    `json:"track"`
	TotalParticipatingSchool int                       `json:"totalParticipatingSchool"`
	TotalApplicants          int                       `json:"totalApplicants"`
	AcceptedCount            int                       `json:"acceptedCount"`
	AcceptedMin              float64                   `json:"acceptedMin"`
	AcceptedMax              float64                   `json:"acceptedMax"`
	AcceptedAvg              float64                   `json:"acceptedAvg"`
	AcceptedMedian           float64                   `json:"acceptedMedian"`
	AcceptedQ1               float64                   `json:"acceptedQ1"`
	AcceptedQ3               float64                   `json:"acceptedQ3"`
	AcceptedStdDev           float64                   `json:"acceptedStdDev"`
	RejectedCount            int                       `json:"rejectedCount"`
	RejectedMax              float64                   `json:"rejectedMax"`
	RejectedAvg              float64                   `json:"rejectedAvg"`
	HasOverlap               bool                      `json:"hasOverlap"`
	OverlapMin               float64                   `json:"overlapMin"`
	OverlapMax               float64                   `json:"overlapMax"`
	Histogram                SharedDepartmentHistogram `json:"histogram"`
}

// InitSharedDatabaseTables 관내 공유/취합 데이터를 저장할 SQLite 테이블 초기화
func (dm *DBManager) InitSharedDatabaseTables() error {
	db, err := dm.openDB(dm.getConfigDBPath())
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

		var details ApplicationScoreDetails
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
	deptStats := ComputeDepartmentAdmissionStats(records, 1.0)
	var summaryStats []SharedSummaryStat
	var histograms []SharedDepartmentHistogram

	for _, ds := range deptStats {
		if ds.AdmissionYear > 0 && ds.AdmissionYear != admissionYear {
			continue
		}

		// 다중 학교 통합을 위한 모멘트(합, 제곱합) 계산
		accCount := float64(ds.AcceptedCount)
		accSum := round2(ds.AcceptedAvg * accCount)
		var accSumSq float64
		if ds.AcceptedCount == 1 {
			accSumSq = round2(ds.AcceptedAvg * ds.AcceptedAvg)
		} else if ds.AcceptedCount > 1 {
			// s^2 = (SumSq - n*avg^2) / (n - 1) => SumSq = (n - 1)*s^2 + n*avg^2
			variance := ds.AcceptedStdDev * ds.AcceptedStdDev
			accSumSq = round2((accCount-1.0)*variance + accCount*ds.AcceptedAvg*ds.AcceptedAvg)
		}

		rejCount := float64(ds.RejectedCount)
		rejSum := round2(ds.RejectedAvg * rejCount)

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

// ExportSharedPackageV2 암호화된 관내 공유 파일(.phgc)로 내보내기
func (dm *DBManager) ExportSharedPackageV2(admissionYear int, password, outputPath string) error {
	if strings.TrimSpace(password) == "" {
		return fmt.Errorf("관내 공유 비밀번호를 입력해주세요")
	}
	pkg, err := dm.BuildSharedPackageV2(admissionYear)
	if err != nil {
		return err
	}

	jsonData, err := json.Marshal(pkg)
	if err != nil {
		return err
	}

	tmpFile := outputPath + ".plain.tmp"
	if err := os.WriteFile(tmpFile, jsonData, 0600); err != nil {
		return err
	}
	defer os.Remove(tmpFile)

	if err := os.MkdirAll(filepath.Dir(outputPath), 0700); err != nil {
		return err
	}

	return encryptFileGCM(password, tmpFile, outputPath)
}

// InspectSharedPackage 암호화된 관내 공유 파일의 표지 메타데이터 미리보기
func InspectSharedPackage(password, inputPath string) (*SharedPackageCover, error) {
	tmpFile := inputPath + ".inspect.tmp"
	defer os.Remove(tmpFile)

	if err := decryptFileGCM(password, inputPath, tmpFile); err != nil {
		return nil, fmt.Errorf("비밀번호가 올바르지 않거나 파일이 손상되었습니다: %w", err)
	}

	data, err := os.ReadFile(tmpFile)
	if err != nil {
		return nil, err
	}

	// V2 감지
	var v2 SharedPackageV2
	if err := json.Unmarshal(data, &v2); err == nil && v2.Cover.FormatVersion == 2 {
		return &v2.Cover, nil
	}

	// V1 감지 (요약 CutoffInfo 배열)
	var v1Cutoffs []CutoffInfo
	if err := json.Unmarshal(data, &v1Cutoffs); err == nil && len(v1Cutoffs) > 0 {
		year := v1Cutoffs[0].Year
		return &SharedPackageCover{
			SchoolName:    "외부중학교(V1)",
			AdmissionYear: year,
			CreatedAt:     time.Now().UTC(),
			AppVersion:    "1.0.0",
			FormatVersion: 1,
			RecordCount:   len(v1Cutoffs),
		}, nil
	}

	return nil, fmt.Errorf("지원되지 않는 공유 파일 형식입니다")
}

// ImportSharedPackageV2 암호화된 공유 파일을 복호화하여 관내 통합 DB에 취합/적재
func (dm *DBManager) ImportSharedPackageV2(password, inputPath string) (*SharedPackageImportResult, error) {
	if err := dm.InitSharedDatabaseTables(); err != nil {
		return nil, err
	}

	tmpFile := inputPath + ".import.tmp"
	defer os.Remove(tmpFile)

	if err := decryptFileGCM(password, inputPath, tmpFile); err != nil {
		return nil, fmt.Errorf("비밀번호가 올바르지 않거나 파일이 손상되었습니다: %w", err)
	}

	data, err := os.ReadFile(tmpFile)
	if err != nil {
		return nil, err
	}

	db, err := dm.openDB(dm.getConfigDBPath())
	if err != nil {
		return nil, err
	}
	defer db.Close()

	// V2 형식 시도
	var v2 SharedPackageV2
	if err := json.Unmarshal(data, &v2); err == nil && v2.Cover.FormatVersion == 2 {
		return dm.importV2Package(db, &v2)
	}

	// V1 형식(요약 배열) 시도
	var v1Cutoffs []CutoffInfo
	if err := json.Unmarshal(data, &v1Cutoffs); err == nil && len(v1Cutoffs) > 0 {
		return dm.importV1Package(db, v1Cutoffs)
	}

	return nil, fmt.Errorf("공유 파일의 형식을 인식할 수 없습니다")
}

// importV2Package V2 형식의 패키지 적재 및 중복 학교 자동 교체 처리
func (dm *DBManager) importV2Package(db *sql.DB, v2 *SharedPackageV2) (*SharedPackageImportResult, error) {
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

// importV1Package 하위 호환: 기존 V1 컷오프 파일 적재
func (dm *DBManager) importV1Package(db *sql.DB, cutoffs []CutoffInfo) (*SharedPackageImportResult, error) {
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
	db, err := dm.openDB(dm.getConfigDBPath())
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

// GetConsolidatedAdmissionStats 취합된 관내 통합 점수 자료로부터 학과별/전형별 정밀 통계 산출
func (dm *DBManager) GetConsolidatedAdmissionStats(admissionYear int, highSchool, department, track string, bucketStep float64) (*ConsolidatedStatsResult, error) {
	if err := dm.InitSharedDatabaseTables(); err != nil {
		return nil, err
	}
	db, err := dm.openDB(dm.getConfigDBPath())
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
	query := `SELECT status, score FROM shared_anonymous_scores 
		WHERE admission_year = ? AND high_school = ? AND department = ? AND track = ?`
	rows, err := db.Query(query, admissionYear, highSchool, department, track)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var acceptedScores []float64
	var rejectedScores []float64
	for rows.Next() {
		var status string
		var score float64
		if err := rows.Scan(&status, &score); err == nil {
			cleanStatus := strings.TrimSpace(status)
			if strings.Contains(cleanStatus, "불합격") {
				rejectedScores = append(rejectedScores, score)
			} else if strings.Contains(cleanStatus, "합격") || strings.Contains(cleanStatus, "진학") {
				acceptedScores = append(acceptedScores, score)
			}
		}
	}

	sort.Float64s(acceptedScores)
	sort.Float64s(rejectedScores)

	totalApplicants := len(acceptedScores) + len(rejectedScores)
	if totalApplicants == 0 {
		// V2 레코드가 없다면 요약 테이블에서 조회
		return dm.getConsolidatedFromSummaryStats(db, admissionYear, highSchool, department, track, totalSchools)
	}

	var accMin, accMax, accAvg float64
	if len(acceptedScores) > 0 {
		accMin = round2(acceptedScores[0])
		accMax = round2(acceptedScores[len(acceptedScores)-1])
		var sum float64
		for _, s := range acceptedScores {
			sum += s
		}
		accAvg = round2(sum / float64(len(acceptedScores)))
	}

	median := CalculateMedian(acceptedScores)
	q1, _, q3 := CalculateQuartiles(acceptedScores)
	stdDev := CalculateStdDev(acceptedScores, accAvg)

	var rejMax, rejAvg float64
	if len(rejectedScores) > 0 {
		rejMax = round2(rejectedScores[len(rejectedScores)-1])
		var sum float64
		for _, s := range rejectedScores {
			sum += s
		}
		rejAvg = round2(sum / float64(len(rejectedScores)))
	}

	var hasOverlap bool
	var overlapMin, overlapMax float64
	if len(acceptedScores) > 0 && len(rejectedScores) > 0 && rejMax >= accMin {
		hasOverlap = true
		overlapMin = accMin
		overlapMax = rejMax
	}

	// 히스토그램 생성
	histBuckets := CalculateScoreHistogram(acceptedScores, rejectedScores, bucketStep)
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
		accAvg = round2(accSum / float64(accCount))
		if accCount > 1 {
			variance := (accSumSq - (accSum*accSum)/float64(accCount)) / float64(accCount-1)
			if variance > 0 {
				accStdDev = round2(math.Sqrt(variance))
			}
		}
	}

	var rejAvg float64
	if rejCount > 0 {
		rejAvg = round2(rejSum / float64(rejCount))
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
