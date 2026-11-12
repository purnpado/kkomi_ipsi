package database

import (
	"database/sql"
	"fmt"
	"sort"
	"strings"

	"PHGC/internal/model"
)

// 판정 근거 자료.
//   CompetitionRecord: 학년부장이 직접 입력하는 학교·전형·학과별 공식 경쟁률(모집정원·지원자 수).
//   AdmissionEvidence: 우리 학교·관내 공유 결과에서 센 합격·불합격 사례 수.
// 불합격 사례가 없는 "작년 최저 합격점"은 합격선의 상한일 뿐이므로, 화면은 이 자료로
// "판단 근거 부족"을 가려내고, "작년 미달"은 공식 경쟁률 입력값으로만 표시한다.

// CompetitionRecord 공식 발표 경쟁률 한 건(운영자 수동 입력).
type CompetitionRecord struct {
	AdmissionYear int    `json:"admissionYear"`
	SchoolName    string `json:"schoolName"`
	Department    string `json:"department"` // 빈 문자열이면 학교·전형 전체
	Track         string `json:"track"`
	Quota         int    `json:"quota"`
	Applicants    int    `json:"applicants"`
}

// AdmissionEvidence 학년도·고교·학과·전형별 합격·불합격 사례 수(점수 기준).
type AdmissionEvidence struct {
	AdmissionYear   int     `json:"admissionYear"`
	HighSchool      string  `json:"highSchool"`
	Department      string  `json:"department"` // 빈 문자열이면 학교·전형 전체 합계
	Track           string  `json:"track"`
	AcceptedCount   int     `json:"acceptedCount"`
	RejectedCount   int     `json:"rejectedCount"`   // 점수로 떨어진 사례(1차 통과 후 면접 탈락 제외)
	Stage2FailCount int     `json:"stage2FailCount"` // 1차 통과 후 2차(면접 등) 탈락
	AcceptedMin     float64 `json:"acceptedMin"`
	RejectedMax     float64 `json:"rejectedMax"`
}

func initCompetitionTable(db *sql.DB) error {
	_, err := db.Exec(`CREATE TABLE IF NOT EXISTS competition_records (
		admission_year INTEGER NOT NULL,
		school_name TEXT NOT NULL,
		department TEXT NOT NULL DEFAULT '',
		track TEXT NOT NULL DEFAULT '',
		quota INTEGER NOT NULL DEFAULT 0,
		applicants INTEGER NOT NULL DEFAULT 0,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY (admission_year, school_name, department, track)
	)`)
	return err
}

// GetCompetitionRecords 입력된 공식 경쟁률 전체(최근 학년도부터).
func (dm *DBManager) GetCompetitionRecords() ([]CompetitionRecord, error) {
	db, err := dm.OpenDB(dm.GetConfigDBPath())
	if err != nil {
		return nil, err
	}
	defer db.Close()
	if err := initCompetitionTable(db); err != nil {
		return nil, err
	}
	rows, err := db.Query(`SELECT admission_year, school_name, department, track, quota, applicants FROM competition_records
		ORDER BY admission_year DESC, school_name, track, department`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []CompetitionRecord{}
	for rows.Next() {
		var r CompetitionRecord
		if err := rows.Scan(&r.AdmissionYear, &r.SchoolName, &r.Department, &r.Track, &r.Quota, &r.Applicants); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// SaveCompetitionRecords 공식 경쟁률 저장. 정원·지원자 수가 모두 0인 항목은 지운다.
func (dm *DBManager) SaveCompetitionRecords(records []CompetitionRecord) (int, error) {
	for _, r := range records {
		if r.AdmissionYear < 2000 || strings.TrimSpace(r.SchoolName) == "" || r.Quota < 0 || r.Applicants < 0 {
			return 0, fmt.Errorf("경쟁률 자료의 학년도·학교·정원·지원자 수가 올바르지 않습니다")
		}
	}
	db, err := dm.OpenDB(dm.GetConfigDBPath())
	if err != nil {
		return 0, err
	}
	defer db.Close()
	if err := initCompetitionTable(db); err != nil {
		return 0, err
	}
	tx, err := db.Begin()
	if err != nil {
		return 0, err
	}
	saved := 0
	for _, r := range records {
		school := normalizeCutoffSchool(r.SchoolName)
		dept := normalizeCutoffDept(r.Department)
		track := normalizeCutoffTrack(r.Track)
		if r.Quota == 0 && r.Applicants == 0 {
			_, err = tx.Exec(`DELETE FROM competition_records WHERE admission_year = ? AND school_name = ? AND department = ? AND track = ?`,
				r.AdmissionYear, school, dept, track)
		} else {
			_, err = tx.Exec(`INSERT INTO competition_records (admission_year, school_name, department, track, quota, applicants, updated_at)
				VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
				ON CONFLICT(admission_year, school_name, department, track)
				DO UPDATE SET quota = excluded.quota, applicants = excluded.applicants, updated_at = CURRENT_TIMESTAMP`,
				r.AdmissionYear, school, dept, track, r.Quota, r.Applicants)
			saved++
		}
		if err != nil {
			_ = tx.Rollback()
			return 0, fmt.Errorf("경쟁률 저장 실패: %w", err)
		}
	}
	return saved, tx.Commit()
}

// ImportCompetitionRecords 인수인계로 받은 공식 경쟁률 중 지금 없는 항목만 더한다.
func (dm *DBManager) ImportCompetitionRecords(list []CompetitionRecord) (int, error) {
	have, err := dm.GetCompetitionRecords()
	if err != nil {
		return 0, err
	}
	key := func(r CompetitionRecord) string {
		return fmt.Sprintf("%d\x1f%s\x1f%s\x1f%s", r.AdmissionYear, normalizeCutoffSchool(r.SchoolName), normalizeCutoffDept(r.Department), normalizeCutoffTrack(r.Track))
	}
	exists := map[string]bool{}
	for _, r := range have {
		exists[key(r)] = true
	}
	var fresh []CompetitionRecord
	for _, r := range list {
		if exists[key(r)] || (r.Quota == 0 && r.Applicants == 0) {
			continue
		}
		exists[key(r)] = true
		fresh = append(fresh, r)
	}
	if len(fresh) == 0 {
		return 0, nil
	}
	return dm.SaveCompetitionRecords(fresh)
}

type evidenceAcc struct {
	e AdmissionEvidence
}

func (acc *evidenceAcc) add(status, firstStage string, score float64) {
	status = strings.TrimSpace(status)
	switch {
	case strings.Contains(status, "불합격") && firstStage == "합격":
		acc.e.Stage2FailCount++
	case strings.Contains(status, "불합격"):
		acc.e.RejectedCount++
		if score > acc.e.RejectedMax {
			acc.e.RejectedMax = score
		}
	case strings.Contains(status, "합격") || strings.Contains(status, "진학"):
		acc.e.AcceptedCount++
		if score > 0 && (acc.e.AcceptedMin == 0 || score < acc.e.AcceptedMin) {
			acc.e.AcceptedMin = score
		}
	}
}

// GetAdmissionEvidence 우리 학교 결과(지난 학년도 익명 보관 포함)와 관내 공유 결과에서
// 학년도·고교·학과·전형별 합격·불합격 사례 수를 센다. 학과가 빈 항목은 학교·전형 전체 합계다.
func (dm *DBManager) GetAdmissionEvidence() ([]AdmissionEvidence, error) {
	groups := map[string]*evidenceAcc{}
	add := func(year int, school, dept, track, status, firstStage string, score float64) {
		for _, d := range []string{dept, ""} {
			key := fmt.Sprintf("%d\x1f%s\x1f%s\x1f%s", year, school, d, track)
			acc := groups[key]
			if acc == nil {
				acc = &evidenceAcc{e: AdmissionEvidence{AdmissionYear: year, HighSchool: school, Department: d, Track: track}}
				groups[key] = acc
			}
			acc.add(status, firstStage, score)
			if dept == "" {
				break // 학과가 없는 기록은 전체 합계에 한 번만 더한다.
			}
		}
	}

	// 1) 우리 학교: 지금 학급 기록 + 지난 학년도 익명 보관 기록
	records, err := dm.schoolRecordsWithHistory()
	if err != nil {
		return nil, err
	}
	for _, r := range records {
		if strings.TrimSpace(r.SchoolName) == "" || !model.IsScoredCategory(r.Category) || r.Category == "general" {
			continue
		}
		dept := strings.TrimSpace(r.AssignedDepartment)
		if dept == "" && len(r.Preferences) > 0 {
			dept = strings.TrimSpace(r.Preferences[0])
		}
		add(r.AdmissionYear, normalizeCutoffSchool(r.SchoolName), normalizeCutoffDept(dept), normalizeCutoffTrack(r.Track), r.Status, r.FirstStageResult, r.Score)
	}

	// 2) 관내 공유 자료(우리 학교가 낸 자료는 위에서 이미 셌으므로 뺀다)
	if err := dm.InitSharedDatabaseTables(); err != nil {
		return nil, err
	}
	ownSchool := ""
	if config, _ := dm.GetSchoolConfig(); config != nil {
		ownSchool = strings.TrimSpace(config.SchoolName)
	}
	db, err := dm.OpenDB(dm.GetConfigDBPath())
	if err != nil {
		return nil, err
	}
	defer db.Close()
	rows, err := db.Query(`SELECT s.admission_year, s.high_school, s.department, s.track, s.status, s.score, COALESCE(s.first_stage_result, '')
		FROM shared_anonymous_scores s JOIN shared_participating_schools p ON p.id = s.school_pkg_id
		WHERE p.school_name <> ?`, ownSchool)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var year int
		var school, dept, track, status, firstStage string
		var score float64
		if err := rows.Scan(&year, &school, &dept, &track, &status, &score, &firstStage); err != nil {
			return nil, err
		}
		if strings.Contains(school, "일반계고") {
			continue // 후기 일반고는 관내 합격선 추정(정원·지원자 수)으로 따로 판정한다.
		}
		add(year, normalizeCutoffSchool(school), normalizeCutoffDept(dept), normalizeCutoffTrack(track), status, firstStage, score)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	out := make([]AdmissionEvidence, 0, len(groups))
	for _, acc := range groups {
		if acc.e.AcceptedCount+acc.e.RejectedCount+acc.e.Stage2FailCount == 0 {
			continue
		}
		out = append(out, acc.e)
	}
	sort.Slice(out, func(i, j int) bool {
		a, b := out[i], out[j]
		if a.AdmissionYear != b.AdmissionYear {
			return a.AdmissionYear > b.AdmissionYear
		}
		if a.HighSchool != b.HighSchool {
			return a.HighSchool < b.HighSchool
		}
		if a.Track != b.Track {
			return a.Track < b.Track
		}
		return a.Department < b.Department
	})
	return out, nil
}
