package database

import (
	"database/sql"
	"errors"
	"fmt"

	"PHGC/internal/model"
)

// updateApplicationInPlace 화면에서 이미 있는 원서(ID)를 열어 학년도·구분·학교·전형을 바꿨을 때
// 새 원서를 하나 더 만들지 않고 그 원서를 고친다. 이름표가 그대로면 handled=false(보통 저장으로 처리).
func updateApplicationInPlace(dm *DBManager, db *sql.DB, record model.ApplicationRecord, prefsJSON, scoreDetailsJSON string) (bool, error) {
	var oldYear int
	var oldCategory, oldSchool, oldTrack string
	err := db.QueryRow(`SELECT admission_year, category, IFNULL(school_name, ''), IFNULL(track, '') FROM student_applications WHERE id=? AND student_num=? AND student_name=?`,
		record.ID, record.StudentNum, record.StudentName).Scan(&oldYear, &oldCategory, &oldSchool, &oldTrack)
	if errors.Is(err, sql.ErrNoRows) {
		if record.Category == "other" || record.Category == "out_province" {
			return true, fmt.Errorf("수정할 기타 지원 기록을 찾을 수 없습니다: %w", err)
		}
		return false, nil // 원서가 없으면 새 원서로 저장한다
	}
	if err != nil {
		return true, err
	}
	if oldYear == record.AdmissionYear && oldCategory == record.Category && oldSchool == record.SchoolName && oldTrack == record.Track {
		return false, nil
	}
	if oldYear != record.AdmissionYear {
		closed, err := dm.IsAdmissionYearClosed(oldYear)
		if err != nil {
			return true, err
		}
		if closed {
			return true, fmt.Errorf("%d 고입 결과가 확정되어 지원현황을 수정할 수 없습니다", oldYear)
		}
	}
	var other int
	err = db.QueryRow(`SELECT COUNT(*) FROM student_applications WHERE student_num=? AND student_name=? AND admission_year=? AND category=? AND school_name=? AND track=? AND id<>?`,
		record.StudentNum, record.StudentName, record.AdmissionYear, record.Category, record.SchoolName, record.Track, record.ID).Scan(&other)
	if err != nil {
		return true, err
	}
	if other > 0 {
		return true, fmt.Errorf("이 학생에게 같은 학년도·학교·전형 원서가 이미 있습니다. 그 원서를 열어 고쳐주세요")
	}
	_, err = db.Exec(`UPDATE student_applications SET admission_year=?, category=?, school_name=?, track=?, status=?, score=?, score_basis=?, preferences_json=?, assigned_department=?, assigned_school=?, first_stage_result=?, extra_round=?,
		score_details_json=CASE WHEN ? <> '' THEN ? ELSE score_details_json END, updated_at=CURRENT_TIMESTAMP WHERE id=? AND student_num=? AND student_name=?`,
		record.AdmissionYear, record.Category, record.SchoolName, record.Track, record.Status, record.Score, record.ScoreBasis, prefsJSON, record.AssignedDepartment, record.AssignedSchool, record.FirstStageResult, record.ExtraRound,
		scoreDetailsJSON, scoreDetailsJSON, record.ID, record.StudentNum, record.StudentName)
	return true, err
}
