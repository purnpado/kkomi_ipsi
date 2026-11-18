package database

import (
	"encoding/json"
	"fmt"
	"path/filepath"
	"strings"
)

// 상담 화면 관심학교(장바구니) 목록. 예전에는 화면 쪽 localStorage 에 "반·번호" 키로 평문 저장했으나,
// 학생 자료이므로 암호화되는 학급 DB(student_wishlists)에 학생(번호·이름)별로 둔다.
// 항목 모양은 화면이 정하므로 JSON 배열 문자열을 그대로 저장한다.

const maxWishlistJSON = 64 << 10

func (dm *DBManager) classDBPath(classNum int) string {
	return filepath.Join(dm.DataDir, fmt.Sprintf("class_%d.db", classNum))
}

// GetStudentWishlist 학생의 관심학교 목록(JSON 배열 문자열). 없으면 "[]".
func (dm *DBManager) GetStudentWishlist(classNum int, studentNum, studentName string) (string, error) {
	if err := dm.InitClassDB(classNum); err != nil {
		return "[]", err
	}
	db, err := dm.OpenDB(dm.classDBPath(classNum))
	if err != nil {
		return "[]", err
	}
	defer db.Close()
	var items string
	err = db.QueryRow(`SELECT items_json FROM student_wishlists WHERE student_num = ? AND student_name = ?`, studentNum, studentName).Scan(&items)
	if err != nil || strings.TrimSpace(items) == "" {
		return "[]", nil
	}
	return items, nil
}

// SaveStudentWishlist 학생의 관심학교 목록을 저장한다. 빈 배열이면 행을 지운다.
func (dm *DBManager) SaveStudentWishlist(classNum int, studentNum, studentName, itemsJSON string) error {
	if classNum < 1 || strings.TrimSpace(studentNum) == "" || strings.TrimSpace(studentName) == "" {
		return fmt.Errorf("학생 정보가 올바르지 않습니다")
	}
	if len(itemsJSON) > maxWishlistJSON {
		return fmt.Errorf("관심학교 목록이 너무 큽니다")
	}
	var items []json.RawMessage
	if err := json.Unmarshal([]byte(itemsJSON), &items); err != nil {
		return fmt.Errorf("관심학교 목록 형식이 올바르지 않습니다")
	}
	if err := dm.InitClassDB(classNum); err != nil {
		return err
	}
	db, err := dm.OpenDB(dm.classDBPath(classNum))
	if err != nil {
		return err
	}
	defer db.Close()
	if len(items) == 0 {
		_, err = db.Exec(`DELETE FROM student_wishlists WHERE student_num = ? AND student_name = ?`, studentNum, studentName)
		return err
	}
	_, err = db.Exec(`INSERT INTO student_wishlists (student_num, student_name, items_json, updated_at)
		VALUES (?, ?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(student_num, student_name) DO UPDATE SET items_json = excluded.items_json, updated_at = CURRENT_TIMESTAMP`,
		studentNum, studentName, itemsJSON)
	return err
}
