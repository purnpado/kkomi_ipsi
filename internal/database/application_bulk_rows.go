package database

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

// 원서 일괄 처리(원서 관리 화면)의 행 읽기·기록·되돌리기 도우미.
// 일괄 작업은 바꾸기 전 행을 application_bulk_log 에 남겨 [방금 일괄 처리 되돌리기]로 원래대로 돌린다.

// bulkRow student_applications 한 행(id 제외)
type bulkRow struct {
	StudentNum         string  `json:"studentNum"`
	StudentName        string  `json:"studentName"`
	AdmissionYear      int     `json:"admissionYear"`
	Category           string  `json:"category"`
	SchoolName         string  `json:"schoolName"`
	Track              string  `json:"track"`
	Status             string  `json:"status"`
	Score              float64 `json:"score"`
	ScoreBasis         string  `json:"scoreBasis"`
	PreferencesJSON    string  `json:"preferencesJson"`
	AssignedDepartment string  `json:"assignedDepartment"`
	AssignedSchool     string  `json:"assignedSchool"`
	ScoreDetailsJSON   string  `json:"scoreDetailsJson"`
	FirstStageResult   string  `json:"firstStageResult"`
	UpdatedAt          string  `json:"updatedAt"`
}

const bulkRowColumns = `student_num, student_name, admission_year, category, school_name, track, status, score, IFNULL(score_basis,''), IFNULL(preferences_json,'[]'), IFNULL(assigned_department,''), IFNULL(assigned_school,''), IFNULL(score_details_json,''), IFNULL(first_stage_result,''), IFNULL(updated_at,'')`

func scanBulkRows(rows *sql.Rows) ([]bulkRow, error) {
	defer rows.Close()
	var out []bulkRow
	for rows.Next() {
		var r bulkRow
		if err := rows.Scan(&r.StudentNum, &r.StudentName, &r.AdmissionYear, &r.Category, &r.SchoolName, &r.Track, &r.Status, &r.Score, &r.ScoreBasis, &r.PreferencesJSON, &r.AssignedDepartment, &r.AssignedSchool, &r.ScoreDetailsJSON, &r.FirstStageResult, &r.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// yearRows 한 학급의 그 학년도 원서 전체
func yearRows(db *sql.DB, year int) ([]bulkRow, error) {
	rows, err := db.Query(`SELECT `+bulkRowColumns+` FROM student_applications WHERE admission_year = ?`, year)
	if err != nil {
		return nil, err
	}
	return scanBulkRows(rows)
}

func newBatchID() string {
	return time.Now().Format("20060102150405.000000")
}

func logBulk(tx *sql.Tx, batchID, action string, row bulkRow) error {
	data, err := json.Marshal(row)
	if err != nil {
		return err
	}
	_, err = tx.Exec(`INSERT INTO application_bulk_log (batch_id, action, row_json) VALUES (?, ?, ?)`, batchID, action, string(data))
	return err
}

const rowKeyWhere = `student_num = ? AND student_name = ? AND admission_year = ? AND category = ? AND school_name = ? AND track = ?`

func (r bulkRow) keyArgs() []any {
	return []any{r.StudentNum, r.StudentName, r.AdmissionYear, r.Category, r.SchoolName, r.Track}
}

// updateRowResult 상태·1차 결과·배정 학과를 바꾸고 바꾸기 전 행을 남긴다.
func updateRowResult(tx *sql.Tx, batchID string, before bulkRow, status, firstStage, assignedDept string) error {
	if err := logBulk(tx, batchID, "updated", before); err != nil {
		return err
	}
	_, err := tx.Exec(`UPDATE student_applications SET status = ?, first_stage_result = ?, assigned_department = ?, updated_at = CURRENT_TIMESTAMP WHERE `+rowKeyWhere,
		append([]any{status, firstStage, assignedDept}, before.keyArgs()...)...)
	return err
}

func deleteRow(tx *sql.Tx, batchID string, before bulkRow) error {
	if err := logBulk(tx, batchID, "deleted", before); err != nil {
		return err
	}
	_, err := tx.Exec(`DELETE FROM student_applications WHERE `+rowKeyWhere, before.keyArgs()...)
	return err
}

// undoBatchInDB 한 학급 DB에서 batchID 작업을 거꾸로 되돌린다. 되돌린 건수를 돌려준다.
func undoBatchInDB(db *sql.DB, batchID string) (int, error) {
	rows, err := db.Query(`SELECT action, row_json FROM application_bulk_log WHERE batch_id = ? ORDER BY id DESC`, batchID)
	if err != nil {
		return 0, err
	}
	type entry struct {
		action string
		row    bulkRow
	}
	var entries []entry
	for rows.Next() {
		var action, data string
		if err := rows.Scan(&action, &data); err != nil {
			rows.Close()
			return 0, err
		}
		var r bulkRow
		if err := json.Unmarshal([]byte(data), &r); err != nil {
			rows.Close()
			return 0, fmt.Errorf("되돌리기 기록을 읽지 못했습니다: %w", err)
		}
		entries = append(entries, entry{action, r})
	}
	rows.Close()
	tx, err := db.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()
	for _, e := range entries {
		switch e.action {
		case "created":
			_, err = tx.Exec(`DELETE FROM student_applications WHERE `+rowKeyWhere, e.row.keyArgs()...)
		case "updated", "deleted":
			r := e.row
			_, err = tx.Exec(`INSERT INTO student_applications (student_num, student_name, admission_year, category, school_name, track, status, score, score_basis, preferences_json, assigned_department, assigned_school, score_details_json, first_stage_result, updated_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
				ON CONFLICT(student_num, student_name, admission_year, category, school_name, track) DO UPDATE SET
					status = excluded.status, score = excluded.score, score_basis = excluded.score_basis, preferences_json = excluded.preferences_json,
					assigned_department = excluded.assigned_department, assigned_school = excluded.assigned_school,
					score_details_json = excluded.score_details_json, first_stage_result = excluded.first_stage_result, updated_at = CURRENT_TIMESTAMP`,
				r.StudentNum, r.StudentName, r.AdmissionYear, r.Category, r.SchoolName, r.Track, r.Status, r.Score, r.ScoreBasis, r.PreferencesJSON, r.AssignedDepartment, r.AssignedSchool, r.ScoreDetailsJSON, r.FirstStageResult)
		}
		if err != nil {
			return 0, err
		}
	}
	if _, err := tx.Exec(`DELETE FROM application_bulk_log WHERE batch_id = ?`, batchID); err != nil {
		return 0, err
	}
	return len(entries), tx.Commit()
}

// StudentKey "반|번호|이름" 형태의 학생 식별자
func StudentKey(classNum int, studentNum, studentName string) string {
	return fmt.Sprintf("%d|%s|%s", classNum, strings.TrimSpace(studentNum), strings.TrimSpace(studentName))
}

var pendingStatuses = map[string]bool{"미입력": true, "지원희망": true, "지원 희망": true, "지원예정": true, "지원 예정": true, "지원완료": true, "지원 완료": true}
