package database

import (
	"encoding/json"
	"fmt"
	"os"
	"time"

	"PHGC/internal/calc"
	"PHGC/internal/model"
)

// stampApplicationScoreDetails는 기존 출처가 있을 때 이를 유지해 과거 스냅샷의 표기를 바꾸지 않습니다.
func stampApplicationScoreDetails(details *model.ApplicationScoreDetails, source string) {
	if details == nil {
		return
	}
	if details.CapturedAt == "" {
		details.CapturedAt = time.Now().UTC().Format(time.RFC3339)
	}
	if details.SnapshotSource == "" {
		details.SnapshotSource = source
	}
}

// GenerateApplicationScoreDetails 원서 접수 시점의 학생 성적·출결·봉사 자료로부터 고교·전형별 세부 점수 스냅샷을 생성합니다.
func (dm *DBManager) GenerateApplicationScoreDetails(classNum int, studentNum, studentName, category, schoolName, track string) (*model.ApplicationScoreDetails, error) {
	student, err := dm.GetStudent(classNum, studentNum, studentName)
	if err != nil {
		return nil, err
	}
	full, err := calc.ParseStudentFullData(*student)
	if err != nil {
		return nil, err
	}
	snapshot, _ := dm.GetStudentRankSnapshot(classNum, studentNum, studentName)

	details := &model.ApplicationScoreDetails{
		AllAverage: full.AllAverage,
	}
	if snapshot != nil {
		details.Percentile = snapshot.Percentile
	}

	switch category {
	case "general":
		details.TotalMax = 200
		details.AcademicMax = 150
		details.NonAcademicMax = 50
		details.FormulaVersion = "2026-general-ulsan"
		if snapshot != nil {
			details.AcademicScore = snapshot.FinalScore
			details.NonAcademicScore = snapshot.NonAcademicScore
			details.TotalScore = snapshot.GeneralTotalScore
		} else {
			details.AcademicScore = full.GeneralHSAcademicScore
			details.NonAcademicScore = full.GeneralHSNonAcademicScore
			details.TotalScore = full.GeneralHSTotalScore
		}
	case "meister", "special":
		for _, result := range full.SchoolResults {
			if normalizeApplicationSchoolName(result.SchoolName) == normalizeApplicationSchoolName(schoolName) && result.TrackName == track {
				details.AcademicScore = result.AllSubjectScore + result.WeightedScore
				details.AcademicMax = result.AllSubjectMax + result.WeightedMax
				details.AttendanceScore = result.AttendanceScore
				details.AttendanceMax = result.AttendanceMax
				details.VolunteerScore = result.VolunteerScore
				details.VolunteerMax = result.VolunteerMax
				details.ExtraScore = result.ExtraScore + result.LeadershipScore
				details.NonAcademicScore = result.AttendanceScore + result.VolunteerScore + result.ExtraScore + result.LeadershipScore
				details.NonAcademicMax = result.TotalMax - details.AcademicMax
				details.TotalScore = result.TotalScore
				details.TotalMax = result.TotalMax
				details.FormulaVersion = fmt.Sprintf("%s-%s", result.SchoolName, result.TrackName)
				break
			}
		}
	default:
		details.FormulaVersion = category
	}
	return details, nil
}

// BackfillAllApplicationsScoreDetails 과거 원서 레코드 중 score_details_json이 누락된 항목을 학생의 현재 성적/출결/봉사 데이터로 자동 역산하여 채워 넣습니다.
func (dm *DBManager) BackfillAllApplicationsScoreDetails() (int, error) {
	config, err := dm.GetSchoolConfig()
	if err != nil {
		return 0, err
	}
	totalUpdated := 0
	for classNum := 1; classNum <= config.ClassCount; classNum++ {
		count, err := dm.BackfillClassApplicationsScoreDetails(classNum)
		if err == nil {
			totalUpdated += count
		}
		// 이전 버전이 만든 세부 점수는 원본 접수 시점 여부를 알 수 없으므로
		// 현재 시각을 생성 시각으로 꾸며 쓰지 않고 출처만 명시합니다.
		_ = dm.MarkLegacyClassApplicationScoreDetails(classNum)
	}
	return totalUpdated, nil
}

// MarkLegacyClassApplicationScoreDetails는 출처 메타데이터가 없는 기존 스냅샷을 legacy-unknown으로 표시합니다.
func (dm *DBManager) MarkLegacyClassApplicationScoreDetails(classNum int) error {
	dbPath := dm.GetClassDBPath(classNum)
	if _, err := os.Stat(dbPath); os.IsNotExist(err) {
		return nil
	}
	db, err := dm.OpenDB(dbPath)
	if err != nil {
		return err
	}
	defer db.Close()

	rows, err := db.Query(`SELECT id, score_details_json FROM student_applications WHERE score_details_json IS NOT NULL AND score_details_json != ''`)
	if err != nil {
		return err
	}
	defer rows.Close()
	type legacyItem struct {
		id      int
		details model.ApplicationScoreDetails
	}
	var legacyItems []legacyItem
	for rows.Next() {
		var id int
		var raw string
		if err := rows.Scan(&id, &raw); err != nil {
			return err
		}
		var details model.ApplicationScoreDetails
		if json.Unmarshal([]byte(raw), &details) == nil && details.SnapshotSource == "" {
			details.SnapshotSource = "legacy-unknown"
			legacyItems = append(legacyItems, legacyItem{id: id, details: details})
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}
	for _, item := range legacyItems {
		bytes, err := json.Marshal(item.details)
		if err != nil {
			return err
		}
		if _, err := db.Exec(`UPDATE student_applications SET score_details_json=? WHERE id=?`, string(bytes), item.id); err != nil {
			return err
		}
	}
	return nil
}

// BackfillClassApplicationsScoreDetails 특정 학급의 누락된 score_details_json을 자동 역산하여 채워 넣습니다.
func (dm *DBManager) BackfillClassApplicationsScoreDetails(classNum int) (int, error) {
	dbPath := dm.GetClassDBPath(classNum)
	if _, err := os.Stat(dbPath); os.IsNotExist(err) {
		return 0, nil
	}
	db, err := dm.OpenDB(dbPath)
	if err != nil {
		return 0, err
	}
	defer db.Close()

	rows, err := db.Query(`SELECT id, student_num, student_name, category, school_name, track FROM student_applications WHERE score_details_json IS NULL OR score_details_json = ''`)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	type targetItem struct {
		id          int
		studentNum  string
		studentName string
		category    string
		schoolName  string
		track       string
	}
	var targets []targetItem
	for rows.Next() {
		var item targetItem
		if err := rows.Scan(&item.id, &item.studentNum, &item.studentName, &item.category, &item.schoolName, &item.track); err == nil {
			targets = append(targets, item)
		}
	}
	rows.Close()

	updated := 0
	for _, item := range targets {
		details, err := dm.GenerateApplicationScoreDetails(classNum, item.studentNum, item.studentName, item.category, item.schoolName, item.track)
		if err == nil && details != nil && (details.TotalScore > 0 || details.Percentile > 0) {
			stampApplicationScoreDetails(details, "legacy-backfill")
			if bytes, mErr := json.Marshal(details); mErr == nil {
				_, _ = db.Exec(`UPDATE student_applications SET score_details_json = ? WHERE id = ?`, string(bytes), item.id)
				updated++
			}
		}
	}
	return updated, nil
}
