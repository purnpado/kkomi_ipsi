package database

import (
	"encoding/json"
	"strings"
	"time"

	"PHGC/internal/model"
)

// 인수인계 파일(개인정보 없음)에 담거나 받아 들이는 입시 자료 저장소 함수.

// GetAdmissionClosures 결과 확정 기록 전체
func (dm *DBManager) GetAdmissionClosures() ([]AdmissionClosure, error) {
	db, err := dm.OpenDB(dm.GetConfigDBPath())
	if err != nil {
		return nil, err
	}
	defer db.Close()
	rows, err := db.Query(`SELECT admission_year,status,COALESCE(closed_at,''),closed_by,note,cutoffs_applied FROM admission_closures ORDER BY admission_year`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AdmissionClosure{}
	for rows.Next() {
		var c AdmissionClosure
		if err := rows.Scan(&c.AdmissionYear, &c.Status, &c.ClosedAt, &c.ClosedBy, &c.Note, &c.CutoffsApplied); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// ImportAdmissionClosures 받은 결과 확정 기록 중 없는 학년도만 더한다.
func (dm *DBManager) ImportAdmissionClosures(list []AdmissionClosure) (int, error) {
	db, err := dm.OpenDB(dm.GetConfigDBPath())
	if err != nil {
		return 0, err
	}
	defer db.Close()
	added := 0
	for _, c := range list {
		if c.Status != "closed" {
			continue
		}
		res, err := db.Exec(`INSERT OR IGNORE INTO admission_closures (admission_year,status,closed_at,closed_by,note,cutoffs_applied) VALUES (?, 'closed', ?, ?, ?, ?)`,
			c.AdmissionYear, c.ClosedAt, c.ClosedBy, strings.TrimSpace(c.Note+" (인수인계로 받음)"), c.CutoffsApplied)
		if err != nil {
			return added, err
		}
		if n, _ := res.RowsAffected(); n > 0 {
			added++
		}
	}
	return added, nil
}

// ImportGeneralQuotaRecords 받은 후기 일반고 정원 기록 중 없는 학년도만 더한다.
func (dm *DBManager) ImportGeneralQuotaRecords(list []GeneralQuotaRecord) (int, error) {
	have, err := dm.GetGeneralQuotaRecords()
	if err != nil {
		return 0, err
	}
	exists := map[int]bool{}
	for _, q := range have {
		exists[q.AdmissionYear] = true
	}
	added := 0
	for _, q := range list {
		if exists[q.AdmissionYear] || (q.Quota == 0 && q.Applicants == 0) {
			continue
		}
		if err := dm.SaveGeneralQuotaRecord(q); err != nil {
			return added, err
		}
		added++
	}
	return added, nil
}

// ExportStoredSharedPackages 취합해 둔 관내 공유 자료를 학교·학년도별 공유 패키지로 다시 꺼낸다(인수인계용).
func (dm *DBManager) ExportStoredSharedPackages() ([]SharedPackageV2, error) {
	if err := dm.InitSharedDatabaseTables(); err != nil {
		return nil, err
	}
	db, err := dm.OpenDB(dm.GetConfigDBPath())
	if err != nil {
		return nil, err
	}
	defer db.Close()
	type pkgRow struct {
		id                int64
		school            string
		year, format, cnt int
	}
	var pkgs []pkgRow
	rows, err := db.Query(`SELECT id, school_name, admission_year, format_version, record_count FROM shared_participating_schools ORDER BY admission_year, school_name`)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var p pkgRow
		if err := rows.Scan(&p.id, &p.school, &p.year, &p.format, &p.cnt); err == nil {
			pkgs = append(pkgs, p)
		}
	}
	rows.Close()
	out := []SharedPackageV2{}
	for _, p := range pkgs {
		pkg := SharedPackageV2{Cover: SharedPackageCover{SchoolName: p.school, AdmissionYear: p.year, CreatedAt: time.Now().UTC(), FormatVersion: 2, RecordCount: p.cnt}}
		recRows, err := db.Query(`SELECT high_school, department, track, preference_rank, status, score, score_basis, COALESCE(score_details_json,''),
			COALESCE(formula_version,''), COALESCE(first_stage_result,''), COALESCE(general_detail_json,'') FROM shared_anonymous_scores WHERE school_pkg_id = ?`, p.id)
		if err != nil {
			return nil, err
		}
		for recRows.Next() {
			var a AnonymousApplicationRecord
			var details, general string
			if err := recRows.Scan(&a.HighSchool, &a.Department, &a.Track, &a.PreferenceRank, &a.Status, &a.Score, &a.ScoreBasis, &details,
				&a.FormulaVersion, &a.FirstStageResult, &general); err != nil {
				continue
			}
			var d model.ApplicationScoreDetails
			if json.Unmarshal([]byte(details), &d) == nil {
				a.ScoreDetails = d
			}
			if strings.TrimSpace(general) != "" {
				var g SharedGeneralDetail
				if json.Unmarshal([]byte(general), &g) == nil {
					a.GeneralDetail = &g
				}
			}
			pkg.AnonymousRecords = append(pkg.AnonymousRecords, a)
		}
		recRows.Close()
		statRows, err := db.Query(`SELECT admission_year, high_school, department, track, score_type, applicant_count, accepted_count, accepted_sum, accepted_sum_sq,
			accepted_min, accepted_max, accepted_median, accepted_q1, accepted_q3, accepted_std_dev, rejected_count, rejected_sum, rejected_max,
			has_overlap, overlap_min, overlap_max FROM shared_summary_stats WHERE school_pkg_id = ?`, p.id)
		if err != nil {
			return nil, err
		}
		for statRows.Next() {
			var s SharedSummaryStat
			if err := statRows.Scan(&s.AdmissionYear, &s.HighSchool, &s.Department, &s.Track, &s.ScoreType, &s.TotalApplicants, &s.AcceptedCount,
				&s.AcceptedSum, &s.AcceptedSumSq, &s.AcceptedMin, &s.AcceptedMax, &s.AcceptedMedian, &s.AcceptedQ1, &s.AcceptedQ3, &s.AcceptedStdDev,
				&s.RejectedCount, &s.RejectedSum, &s.RejectedMax, &s.HasOverlap, &s.OverlapMin, &s.OverlapMax); err == nil {
				pkg.SummaryStats = append(pkg.SummaryStats, s)
			}
		}
		statRows.Close()
		pkg.Cover.RecordCount = len(pkg.AnonymousRecords)
		out = append(out, pkg)
	}
	return out, nil
}

// HasSharedPackage 같은 학교·학년도 관내 자료가 이미 있는지
func (dm *DBManager) HasSharedPackage(schoolName string, admissionYear int) bool {
	if dm.InitSharedDatabaseTables() != nil {
		return false
	}
	db, err := dm.OpenDB(dm.GetConfigDBPath())
	if err != nil {
		return false
	}
	defer db.Close()
	var n int
	_ = db.QueryRow(`SELECT COUNT(*) FROM shared_participating_schools WHERE school_name = ? AND admission_year = ?`, strings.TrimSpace(schoolName), admissionYear).Scan(&n)
	return n > 0
}

// StoreSharedPackage 공유 패키지 하나를 관내 자료에 더한다(같은 학교·학년도는 교체).
func (dm *DBManager) StoreSharedPackage(pkg *SharedPackageV2) (*SharedPackageImportResult, error) {
	if err := dm.InitSharedDatabaseTables(); err != nil {
		return nil, err
	}
	db, err := dm.OpenDB(dm.GetConfigDBPath())
	if err != nil {
		return nil, err
	}
	defer db.Close()
	return dm.ImportV2Package(db, pkg)
}

// HistoryFromCurrentClasses 아직 보관 기록이 없는 학년도의 지금 학급 원서 기록을 익명으로 만든다
// (결과 확정 전에 인수인계 파일을 만들거나, 이전 버전 최종 보관본을 바꿀 때).
func (dm *DBManager) HistoryFromCurrentClasses(onlyResults bool) ([]HistoryRecord, error) {
	records, err := dm.GetSchoolApplicationRecords()
	if err != nil {
		return nil, err
	}
	have := dm.historyYears()
	years := map[int]bool{}
	for _, r := range records {
		if !have[r.AdmissionYear] {
			years[r.AdmissionYear] = true
		}
	}
	var out []HistoryRecord
	for year := range years {
		general := dm.generalDetailsFor(records, year)
		for _, r := range records {
			if r.AdmissionYear != year {
				continue
			}
			if onlyResults && r.Status != "합격" && r.Status != "불합격" && r.Status != "최종 진학" && r.Status != "포기" && r.Status != "미진학" {
				continue
			}
			h := historyFromRecord(r)
			if d, ok := general[recordStudentKey(r)]; ok && r.Category == "general" {
				h.GeneralDetailJSON = d
			}
			out = append(out, h)
		}
	}
	return out, nil
}
