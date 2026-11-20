package database

import (
	"database/sql"
	"os"
	"time"
)

// 나이스 자료(성적·출결·봉사)를 반마다 마지막으로 올린 때.
// 나이스 파일 안에는 마감일이 없어 프로그램이 "원서 마감일 기준 자료인지" 알 수 없다.
// 담임이 마감일 기준으로 다시 내려받아 올렸는지 떠올릴 수 있도록 올린 때만 적어 둔다(증명은 아님).
// 학급 DB 안에 두므로 "새 학년 시작" 때 학급 자료와 함께 보관 폴더로 옮겨진다.

// 나이스 자료 종류(NiceUpload.Kind)
const (
	NiceUploadGrades     = "grades"
	NiceUploadAttendance = "attendance"
	NiceUploadVolunteer  = "volunteer"
)

// NiceUpload 한 반·한 종류의 마지막 올린 때("2006-01-02 15:04", 컴퓨터 시각).
type NiceUpload struct {
	ClassNum   int    `json:"classNum"`
	Kind       string `json:"kind"`
	UploadedAt string `json:"uploadedAt"`
}

const niceUploadTable = `CREATE TABLE IF NOT EXISTS nice_uploads (kind TEXT PRIMARY KEY, uploaded_at TEXT NOT NULL)`

// niceUploadNow 기록에 쓰는 시각(테스트에서 바꾼다).
var niceUploadNow = time.Now

// recordNiceUpload 올리기에 성공한 반에 올린 때를 적는다. 기록 실패는 올리기 결과에 영향을 주지 않는다.
func (dm *DBManager) recordNiceUpload(classNum int, kind string) {
	if err := dm.InitClassDB(classNum); err != nil {
		return
	}
	db, err := dm.OpenDB(dm.classDBPath(classNum))
	if err != nil {
		return
	}
	defer db.Close()
	if _, err := db.Exec(niceUploadTable); err != nil {
		return
	}
	_, _ = db.Exec(`INSERT INTO nice_uploads (kind, uploaded_at) VALUES (?, ?)
		ON CONFLICT(kind) DO UPDATE SET uploaded_at = excluded.uploaded_at`, kind, niceUploadNow().Format("2006-01-02 15:04"))
}

// GetNiceUploads 반(0이면 전교)의 나이스 자료 올린 때. 기록이 없는 반·종류는 빠진다.
func (dm *DBManager) GetNiceUploads(classNum int) ([]NiceUpload, error) {
	classes := []int{classNum}
	if classNum == 0 {
		config, err := dm.GetSchoolConfig()
		if err != nil {
			return nil, err
		}
		classes = classes[:0]
		for c := 1; c <= config.ClassCount; c++ {
			classes = append(classes, c)
		}
	}
	out := []NiceUpload{}
	for _, c := range classes {
		if _, err := os.Stat(dm.classDBPath(c)); err != nil {
			continue // 자료를 올린 적 없는 반(빈 학급 DB를 새로 만들지 않는다)
		}
		list, err := dm.classNiceUploads(c)
		if err != nil {
			return nil, err
		}
		out = append(out, list...)
	}
	return out, nil
}

func (dm *DBManager) classNiceUploads(classNum int) ([]NiceUpload, error) {
	db, err := dm.OpenDB(dm.classDBPath(classNum))
	if err != nil {
		return nil, err
	}
	defer db.Close()
	if _, err := db.Exec(niceUploadTable); err != nil {
		return nil, err
	}
	rows, err := db.Query(`SELECT kind, uploaded_at FROM nice_uploads ORDER BY kind`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []NiceUpload
	for rows.Next() {
		u := NiceUpload{ClassNum: classNum}
		if err := rows.Scan(&u.Kind, &u.UploadedAt); err != nil && err != sql.ErrNoRows {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}
