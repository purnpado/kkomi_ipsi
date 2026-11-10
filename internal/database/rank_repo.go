package database

import (
	"database/sql"
	"fmt"
	"strings"

	"PHGC/internal/calc"
)

// RankSnapshot 전교 기준 학생 석차 및 백분율 스냅샷 모델
type RankSnapshot struct {
	ClassNum            int     `json:"classNum"`
	StudentNum          string  `json:"studentNum"`
	StudentName         string  `json:"studentName"`
	TotalStudents       int     `json:"totalStudents"`
	Rank                int     `json:"rank"`
	Percentile          float64 `json:"percentile"`
	FinalScore          float64 `json:"finalScore"`
	NonAcademicScore    float64 `json:"nonAcademicScore"`
	GeneralTotalScore   float64 `json:"generalTotalScore"`
	TotalSubjectScore   float64 `json:"totalSubjectScore"`
	GeneralDataComplete bool    `json:"generalDataComplete"`
	GeneralProjected    bool    `json:"generalProjected"`
}

// SaveRankSnapshots 전교 석차 및 백분율 스냅샷을 config.db에 저장 (배포 및 조회 동기화용)
func (dm *DBManager) SaveRankSnapshots(records []calc.StudentCalcResult) error {
	if len(records) == 0 {
		return nil
	}
	db, err := dm.OpenDB(dm.GetConfigDBPath())
	if err != nil {
		return err
	}
	defer db.Close()

	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(`
		INSERT INTO school_rank_snapshots (
			class_num, student_num, student_name, total_students, rank, percentile,
			final_score, non_academic_score, general_total_score, total_subject_score,
			general_data_complete, general_projected, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(class_num, student_num, student_name) DO UPDATE SET
			total_students = excluded.total_students,
			rank = excluded.rank,
			percentile = excluded.percentile,
			final_score = excluded.final_score,
			non_academic_score = excluded.non_academic_score,
			general_total_score = excluded.general_total_score,
			total_subject_score = excluded.total_subject_score,
			general_data_complete = excluded.general_data_complete,
			general_projected = excluded.general_projected,
			updated_at = CURRENT_TIMESTAMP
	`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, r := range records {
		_, err := stmt.Exec(
			r.ClassNum, r.StudentNum, r.Name, r.TotalStudents, r.Rank, r.Percentile,
			r.FinalScore, r.NonAcademicScore, r.GeneralTotalScore, r.TotalSubjectScore,
			r.GeneralDataComplete, r.GeneralProjected,
		)
		if err != nil {
			return err
		}
	}

	return tx.Commit()
}

// GetRankSnapshots 특정 반의 학생별 전교 석차 스냅샷 목록을 맵(키: studentNum + "_" + studentName)으로 반환
func (dm *DBManager) GetRankSnapshots(classNum int) (map[string]RankSnapshot, error) {
	db, err := dm.OpenDB(dm.GetConfigDBPath())
	if err != nil {
		return nil, err
	}
	defer db.Close()

	rows, err := db.Query(`
		SELECT class_num, student_num, student_name, total_students, rank, percentile,
		       final_score, non_academic_score, general_total_score, total_subject_score,
		       general_data_complete, general_projected
		FROM school_rank_snapshots
		WHERE class_num = ?
	`, classNum)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	results := make(map[string]RankSnapshot)
	for rows.Next() {
		var s RankSnapshot
		if err := rows.Scan(
			&s.ClassNum, &s.StudentNum, &s.StudentName, &s.TotalStudents, &s.Rank, &s.Percentile,
			&s.FinalScore, &s.NonAcademicScore, &s.GeneralTotalScore, &s.TotalSubjectScore,
			&s.GeneralDataComplete, &s.GeneralProjected,
		); err != nil {
			return nil, err
		}
		key := fmt.Sprintf("%s_%s", strings.TrimSpace(s.StudentNum), strings.TrimSpace(s.StudentName))
		results[key] = s
	}

	return results, nil
}

// GetStudentRankSnapshot 단일 학생의 전교 석차 스냅샷 조회
func (dm *DBManager) GetStudentRankSnapshot(classNum int, studentNum, studentName string) (*RankSnapshot, error) {
	db, err := dm.OpenDB(dm.GetConfigDBPath())
	if err != nil {
		return nil, err
	}
	defer db.Close()

	var s RankSnapshot
	err = db.QueryRow(`
		SELECT class_num, student_num, student_name, total_students, rank, percentile,
		       final_score, non_academic_score, general_total_score, total_subject_score,
		       general_data_complete, general_projected
		FROM school_rank_snapshots
		WHERE class_num = ? AND student_num = ? AND student_name = ?
	`, classNum, studentNum, studentName).Scan(
		&s.ClassNum, &s.StudentNum, &s.StudentName, &s.TotalStudents, &s.Rank, &s.Percentile,
		&s.FinalScore, &s.NonAcademicScore, &s.GeneralTotalScore, &s.TotalSubjectScore,
		&s.GeneralDataComplete, &s.GeneralProjected,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &s, nil
}
