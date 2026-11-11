package database

import (
	"fmt"
	"path/filepath"

	"PHGC/internal/calc"
	"PHGC/internal/parser"
)

// SaveClassStudents 파싱된 학급 데이터를 DB에 저장 (기존 데이터 삭제 후 덮어쓰기)
func (dm *DBManager) SaveClassStudents(classNum int, students []parser.StudentExcelData) error {
	if err := dm.InitClassDB(classNum); err != nil {
		return err
	}

	dbPath := filepath.Join(dm.DataDir, fmt.Sprintf("class_%d.db", classNum))
	db, err := dm.OpenDB(dbPath)
	if err != nil {
		return err
	}
	defer db.Close()

	// 트랜잭션 시작
	tx, err := db.Begin()
	if err != nil {
		return err
	}

	// 기존 데이터 비우기 (매번 새로 덮어쓰는 방식)
	_, err = tx.Exec("DELETE FROM students")
	if err != nil {
		tx.Rollback()
		return err
	}

	stmt, err := tx.Prepare(`
		INSERT INTO students (student_num, name, grades_json, attendance_json, volunteer_json, extra_json)
		VALUES (?, ?, ?, ?, ?, ?)
	`)
	if err != nil {
		tx.Rollback()
		return err
	}
	defer stmt.Close()

	for _, s := range students {
		_, err = stmt.Exec(s.StudentNum, s.Name, s.RawData, s.AttendanceData, s.VolunteerData, s.ExtraData)
		if err != nil {
			tx.Rollback()
			return err
		}
	}

	return tx.Commit()
}

// UpdateStudentAttendance 파싱된 출결 데이터를 기존 학생 DB에 병합
func (dm *DBManager) UpdateStudentAttendance(classNum int, students []parser.StudentExcelData) (int, error) {
	dbPath := filepath.Join(dm.DataDir, fmt.Sprintf("class_%d.db", classNum))
	db, err := dm.OpenDB(dbPath)
	if err != nil {
		return 0, err
	}
	defer db.Close()

	tx, err := db.Begin()
	if err != nil {
		return 0, err
	}

	stmt, err := tx.Prepare(`
		UPDATE students 
		SET attendance_json = ? 
		WHERE (REPLACE(name, ' ', '') = REPLACE(?, ' ', '')) 
		  AND (CAST(student_num AS INTEGER) = CAST(? AS INTEGER) OR student_num = ?)
	`)
	if err != nil {
		tx.Rollback()
		return 0, err
	}
	defer stmt.Close()

	// 2차 fallback stmt (학번 불일치 시 반 내 이름 매칭)
	stmtNameFallback, err := tx.Prepare(`
		UPDATE students 
		SET attendance_json = ? 
		WHERE REPLACE(name, ' ', '') = REPLACE(?, ' ', '')
	`)
	if err != nil {
		tx.Rollback()
		return 0, err
	}
	defer stmtNameFallback.Close()

	updatedCount := 0
	for _, s := range students {
		res, err := stmt.Exec(s.AttendanceData, s.Name, s.StudentNum, s.StudentNum)
		if err != nil {
			tx.Rollback()
			return 0, err
		}
		rows, _ := res.RowsAffected()
		if rows > 0 {
			updatedCount += int(rows)
		} else {
			// fallback: 이름으로 매칭 시도
			resFallback, err := stmtNameFallback.Exec(s.AttendanceData, s.Name)
			if err == nil {
				r2, _ := resFallback.RowsAffected()
				updatedCount += int(r2)
			}
		}
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return updatedCount, nil
}

// UpdateStudentVolunteer 파싱된 봉사 데이터를 기존 학생 DB에 병합
func (dm *DBManager) UpdateStudentVolunteer(classNum int, students []parser.StudentExcelData) (int, error) {
	dbPath := filepath.Join(dm.DataDir, fmt.Sprintf("class_%d.db", classNum))
	db, err := dm.OpenDB(dbPath)
	if err != nil {
		return 0, err
	}
	defer db.Close()

	tx, err := db.Begin()
	if err != nil {
		return 0, err
	}

	stmt, err := tx.Prepare(`
		UPDATE students 
		SET volunteer_json = ? 
		WHERE (REPLACE(name, ' ', '') = REPLACE(?, ' ', '')) 
		  AND (CAST(student_num AS INTEGER) = CAST(? AS INTEGER) OR student_num = ?)
	`)
	if err != nil {
		tx.Rollback()
		return 0, err
	}
	defer stmt.Close()

	// 2차 fallback stmt (학번 불일치 시 반 내 이름 매칭)
	stmtNameFallback, err := tx.Prepare(`
		UPDATE students 
		SET volunteer_json = ? 
		WHERE REPLACE(name, ' ', '') = REPLACE(?, ' ', '')
	`)
	if err != nil {
		tx.Rollback()
		return 0, err
	}
	defer stmtNameFallback.Close()

	updatedCount := 0
	for _, s := range students {
		res, err := stmt.Exec(s.VolunteerData, s.Name, s.StudentNum, s.StudentNum)
		if err != nil {
			tx.Rollback()
			return 0, err
		}
		rows, _ := res.RowsAffected()
		if rows > 0 {
			updatedCount += int(rows)
		} else {
			// fallback: 이름으로 매칭 시도
			resFallback, err := stmtNameFallback.Exec(s.VolunteerData, s.Name)
			if err == nil {
				r2, _ := resFallback.RowsAffected()
				updatedCount += int(r2)
			}
		}
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return updatedCount, nil
}

// UpdateStudentExtra 수기 입력 가산점 및 추가사항 업데이트
func (dm *DBManager) UpdateStudentExtra(classNum int, studentNum, name, extraJSON string) error {
	dbPath := filepath.Join(dm.DataDir, fmt.Sprintf("class_%d.db", classNum))
	db, err := dm.OpenDB(dbPath)
	if err != nil {
		return err
	}
	defer db.Close()

	_, err = db.Exec("UPDATE students SET extra_json = ? WHERE name = ? AND student_num = ?", extraJSON, name, studentNum)
	return err
}

// ReplaceStudentSchoolScores stores all pre-calculated school/track scores for one student.
func (dm *DBManager) ReplaceStudentSchoolScores(classNum int, studentNum, name string, results []calc.SchoolCalcResult) error {
	if err := dm.InitClassDB(classNum); err != nil {
		return err
	}
	db, err := dm.OpenDB(dm.GetClassDBPath(classNum))
	if err != nil {
		return err
	}
	defer db.Close()
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	if _, err = tx.Exec("DELETE FROM student_school_scores WHERE student_num = ? AND student_name = ?", studentNum, name); err != nil {
		_ = tx.Rollback()
		return err
	}
	stmt, err := tx.Prepare("INSERT INTO student_school_scores (student_num, student_name, school_name, track, total_score, total_max, updated_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)")
	if err != nil {
		_ = tx.Rollback()
		return err
	}
	defer stmt.Close()
	for _, result := range results {
		if _, err = stmt.Exec(studentNum, name, result.SchoolName, result.TrackName, result.TotalScore, result.TotalMax); err != nil {
			_ = tx.Rollback()
			return err
		}
	}
	return tx.Commit()
}

// replaceClassSchoolScores 학급 학생 전체의 학교별 점수를 한 트랜잭션으로 교체한다.
func (dm *DBManager) replaceClassSchoolScores(classNum int, keys [][2]string, results map[string][]calc.SchoolCalcResult) error {
	if err := dm.InitClassDB(classNum); err != nil {
		return err
	}
	db, err := dm.OpenDB(dm.GetClassDBPath(classNum))
	if err != nil {
		return err
	}
	defer db.Close()
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	del, err := tx.Prepare("DELETE FROM student_school_scores WHERE student_num = ? AND student_name = ?")
	if err != nil {
		_ = tx.Rollback()
		return err
	}
	defer del.Close()
	ins, err := tx.Prepare("INSERT INTO student_school_scores (student_num, student_name, school_name, track, total_score, total_max, updated_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)")
	if err != nil {
		_ = tx.Rollback()
		return err
	}
	defer ins.Close()
	for _, k := range keys {
		if _, err := del.Exec(k[0], k[1]); err != nil {
			_ = tx.Rollback()
			return err
		}
		for _, r := range results[k[0]+"\x1f"+k[1]] {
			if _, err := ins.Exec(k[0], k[1], r.SchoolName, r.TrackName, r.TotalScore, r.TotalMax); err != nil {
				_ = tx.Rollback()
				return err
			}
		}
	}
	return tx.Commit()
}

func (dm *DBManager) GetStudentSchoolScore(classNum int, studentNum, name, schoolName, track string) (*calc.SchoolCalcResult, error) {
	if err := dm.InitClassDB(classNum); err != nil {
		return nil, err
	}
	db, err := dm.OpenDB(dm.GetClassDBPath(classNum))
	if err != nil {
		return nil, err
	}
	defer db.Close()
	var result calc.SchoolCalcResult
	err = db.QueryRow(`SELECT school_name, track, total_score, total_max FROM student_school_scores
		WHERE student_num = ? AND student_name = ? AND school_name = ? AND track = ?`,
		studentNum, name, schoolName, track).Scan(&result.SchoolName, &result.TrackName, &result.TotalScore, &result.TotalMax)
	if err != nil {
		return nil, err
	}
	return &result, nil
}

func (dm *DBManager) GetStudentSchoolScores(classNum int, studentNum, name string) ([]calc.SchoolCalcResult, error) {
	if err := dm.InitClassDB(classNum); err != nil {
		return nil, err
	}
	db, err := dm.OpenDB(dm.GetClassDBPath(classNum))
	if err != nil {
		return nil, err
	}
	defer db.Close()
	rows, err := db.Query(`SELECT school_name, track, total_score, total_max FROM student_school_scores
		WHERE student_num = ? AND student_name = ? ORDER BY school_name, track`, studentNum, name)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var results []calc.SchoolCalcResult
	for rows.Next() {
		var result calc.SchoolCalcResult
		if err := rows.Scan(&result.SchoolName, &result.TrackName, &result.TotalScore, &result.TotalMax); err != nil {
			return nil, err
		}
		results = append(results, result)
	}
	return results, rows.Err()
}

// GetClassStudentCount 학급 DB의 학생 수 반환
func (dm *DBManager) GetClassStudentCount(classNum int) int {
	dbPath := filepath.Join(dm.DataDir, fmt.Sprintf("class_%d.db", classNum))
	db, err := dm.OpenDB(dbPath)
	if err != nil {
		return 0 // 파일이 없거나 열 수 없으면 0 반환
	}
	defer db.Close()

	var count int
	err = db.QueryRow("SELECT COUNT(*) FROM students").Scan(&count)
	if err != nil {
		return 0
	}
	return count
}

// GetAllStudents 전체 학급의 학생 데이터 반환 (석차 계산용)
func (dm *DBManager) GetAllStudents(classCount int) (map[int][]parser.StudentExcelData, error) {
	allStudents := make(map[int][]parser.StudentExcelData)

	for i := 1; i <= classCount; i++ {
		dbPath := filepath.Join(dm.DataDir, fmt.Sprintf("class_%d.db", i))
		db, err := dm.OpenDB(dbPath)
		if err != nil {
			continue // 해당 반 데이터가 없으면 무시
		}

		rows, err := db.Query("SELECT student_num, name, grades_json, IFNULL(attendance_json, ''), IFNULL(volunteer_json, ''), IFNULL(extra_json, '') FROM students")
		if err != nil {
			db.Close()
			continue
		}

		var students []parser.StudentExcelData
		for rows.Next() {
			var s parser.StudentExcelData
			s.ClassNum = i
			err := rows.Scan(&s.StudentNum, &s.Name, &s.RawData, &s.AttendanceData, &s.VolunteerData, &s.ExtraData)
			if err == nil {
				students = append(students, s)
			}
		}
		rows.Close()
		db.Close()

		if len(students) > 0 {
			allStudents[i] = students
		}
	}

	return allStudents, nil
}

// GetClassStudents 특정 학급의 전체 학생 목록 반환
func (dm *DBManager) GetClassStudents(classNum int) ([]parser.StudentExcelData, error) {
	dbPath := filepath.Join(dm.DataDir, fmt.Sprintf("class_%d.db", classNum))
	db, err := dm.OpenDB(dbPath)
	if err != nil {
		return nil, err
	}
	defer db.Close()

	rows, err := db.Query("SELECT student_num, name, grades_json, IFNULL(attendance_json, ''), IFNULL(volunteer_json, ''), IFNULL(extra_json, '') FROM students ORDER BY CAST(student_num AS INTEGER) ASC, student_num ASC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []parser.StudentExcelData
	for rows.Next() {
		var s parser.StudentExcelData
		s.ClassNum = classNum
		if err := rows.Scan(&s.StudentNum, &s.Name, &s.RawData, &s.AttendanceData, &s.VolunteerData, &s.ExtraData); err == nil {
			list = append(list, s)
		}
	}
	return list, nil
}

// GetStudent 특정 학급의 학생 1명 조회
func (dm *DBManager) GetStudent(classNum int, studentNum, name string) (*parser.StudentExcelData, error) {
	dbPath := filepath.Join(dm.DataDir, fmt.Sprintf("class_%d.db", classNum))
	db, err := dm.OpenDB(dbPath)
	if err != nil {
		return nil, err
	}
	defer db.Close()

	var s parser.StudentExcelData
	s.ClassNum = classNum
	err = db.QueryRow("SELECT student_num, name, grades_json, IFNULL(attendance_json, ''), IFNULL(volunteer_json, ''), IFNULL(extra_json, '') FROM students WHERE name = ? AND student_num = ?", name, studentNum).
		Scan(&s.StudentNum, &s.Name, &s.RawData, &s.AttendanceData, &s.VolunteerData, &s.ExtraData)
	if err != nil {
		return nil, err
	}
	return &s, nil
}
