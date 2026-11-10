package database

import (
	"fmt"
	"path/filepath"
	"strings"
	"time"
)

// StudentCounselingRecord 학생 1:1 진학 상담 일지 구조체
type StudentCounselingRecord struct {
	ID             int64  `json:"id"`
	StudentNum     string `json:"studentNum"`
	StudentName    string `json:"studentName"`
	ClassNum       int    `json:"classNum"`
	CounselDate    string `json:"counselDate"`    // YYYY-MM-DD
	TargetSchool   string `json:"targetSchool"`   // 상담 대상/희망 고교 (선택)
	Content        string `json:"content"`        // 상담 상세 내용
	AuthorUsername string `json:"authorUsername"` // 작성 교사 아이디 (본인 격리용)
	AuthorName     string `json:"authorName"`     // 작성 교사 표시명
	CreatedAt      string `json:"createdAt"`
	UpdatedAt      string `json:"updatedAt"`
}

// GetStudentCounselingRecords 특정 학생의 상담 일지 목록 반환 (오직 작성자 본인이 작성한 기록만 반환)
func (dm *DBManager) GetStudentCounselingRecords(classNum int, studentNum, studentName, authorUsername string) ([]StudentCounselingRecord, error) {
	if err := dm.InitClassDB(classNum); err != nil {
		return nil, err
	}
	dbPath := filepath.Join(dm.DataDir, fmt.Sprintf("class_%d.db", classNum))
	db, err := dm.OpenDB(dbPath)
	if err != nil {
		return nil, err
	}
	defer db.Close()

	query := `
		SELECT id, student_num, student_name, class_num, counsel_date, IFNULL(target_school, ''), content, 
		       author_username, IFNULL(author_name, ''), created_at, updated_at
		FROM student_counseling_records
		WHERE student_num = ? AND student_name = ? AND author_username = ?
		ORDER BY counsel_date DESC, id DESC
	`
	rows, err := db.Query(query, studentNum, studentName, authorUsername)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []StudentCounselingRecord
	for rows.Next() {
		var r StudentCounselingRecord
		if err := rows.Scan(&r.ID, &r.StudentNum, &r.StudentName, &r.ClassNum, &r.CounselDate, &r.TargetSchool, &r.Content,
			&r.AuthorUsername, &r.AuthorName, &r.CreatedAt, &r.UpdatedAt); err == nil {
			list = append(list, r)
		}
	}
	if list == nil {
		list = []StudentCounselingRecord{}
	}
	return list, nil
}

// GetClassCounselingSummary 학급 내 학생별 최근 상담 일자 맵 반환 (작성자 본인 기준)
func (dm *DBManager) GetClassCounselingSummary(classNum int, authorUsername string) (map[string]string, error) {
	if err := dm.InitClassDB(classNum); err != nil {
		return map[string]string{}, nil
	}
	dbPath := filepath.Join(dm.DataDir, fmt.Sprintf("class_%d.db", classNum))
	db, err := dm.OpenDB(dbPath)
	if err != nil {
		return map[string]string{}, nil
	}
	defer db.Close()

	query := `
		SELECT student_num, MAX(counsel_date) as last_date
		FROM student_counseling_records
		WHERE author_username = ?
		GROUP BY student_num
	`
	rows, err := db.Query(query, authorUsername)
	if err != nil {
		return map[string]string{}, nil
	}
	defer rows.Close()

	summary := make(map[string]string)
	for rows.Next() {
		var sNum, lastDate string
		if err := rows.Scan(&sNum, &lastDate); err == nil {
			summary[sNum] = lastDate
		}
	}
	return summary, nil
}

// SaveStudentCounselingRecord 상담 기록 저장 또는 수정 (본인 기록만 수정 가능)
func (dm *DBManager) SaveStudentCounselingRecord(record StudentCounselingRecord) error {
	if record.ClassNum < 1 || record.StudentNum == "" || record.CounselDate == "" || strings.TrimSpace(record.Content) == "" {
		return fmt.Errorf("필수 입력 항목(학급, 학번, 상담일자, 상담내용)이 누락되었습니다")
	}
	if err := dm.InitClassDB(record.ClassNum); err != nil {
		return err
	}
	dbPath := filepath.Join(dm.DataDir, fmt.Sprintf("class_%d.db", record.ClassNum))
	db, err := dm.OpenDB(dbPath)
	if err != nil {
		return err
	}
	defer db.Close()

	now := time.Now().Format("2006-01-02 15:04:05")

	if record.ID > 0 {
		// 기존 기록 수정 (본인이 작성한 글인지 검증)
		var existingAuthor string
		err := db.QueryRow("SELECT author_username FROM student_counseling_records WHERE id = ?", record.ID).Scan(&existingAuthor)
		if err != nil {
			return fmt.Errorf("수정할 상담 기록을 찾을 수 없습니다: %w", err)
		}
		if existingAuthor != record.AuthorUsername {
			return fmt.Errorf("본인이 작성한 상담 기록만 수정할 수 있습니다")
		}

		_, err = db.Exec(`
			UPDATE student_counseling_records 
			SET counsel_date = ?, target_school = ?, content = ?, updated_at = ?
			WHERE id = ? AND author_username = ?
		`, record.CounselDate, record.TargetSchool, record.Content, now, record.ID, record.AuthorUsername)
		return err
	}

	// 신규 기록 삽입
	_, err = db.Exec(`
		INSERT INTO student_counseling_records (student_num, student_name, class_num, counsel_date, target_school, content, author_username, author_name, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, record.StudentNum, record.StudentName, record.ClassNum, record.CounselDate, record.TargetSchool, record.Content, record.AuthorUsername, record.AuthorName, now, now)
	return err
}

// DeleteStudentCounselingRecord 상담 기록 삭제 (본인이 작성한 글만 삭제 가능)
func (dm *DBManager) DeleteStudentCounselingRecord(classNum int, id int64, authorUsername string) error {
	dbPath := filepath.Join(dm.DataDir, fmt.Sprintf("class_%d.db", classNum))
	db, err := dm.OpenDB(dbPath)
	if err != nil {
		return err
	}
	defer db.Close()

	res, err := db.Exec("DELETE FROM student_counseling_records WHERE id = ? AND author_username = ?", id, authorUsername)
	if err != nil {
		return err
	}
	rowsAffected, _ := res.RowsAffected()
	if rowsAffected == 0 {
		return fmt.Errorf("삭제할 권한이 없거나 해당 상담 기록이 존재하지 않습니다")
	}
	return nil
}
