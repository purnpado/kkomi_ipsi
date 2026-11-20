package database

import (
	"database/sql"
	"strings"
	"time"

	"PHGC/internal/model"
)

// 지운 원서 기록(application_deletions)과 학급 정보(class_meta).
//
// 학년부장 PC가 최종본이므로, 취합 병합 때 "담임이 지웠거나 학교·전형을 바꾼 원서"와
// "학년부장이 배포 뒤 지운 원서"를 구분해야 한다. 원서가 지워지거나 원서 이름표(학년도·구분·학교·전형)가
// 바뀌면 DB 트리거가 옛 이름표와 시각만 적는다(점수·상태는 적지 않는다). 같은 이름표 원서가 다시 생기면 기록을 지운다.
// 어느 화면·일괄 처리·되돌리기에서 바뀌든 같은 규칙이 적용되도록 트리거로 둔다.

const (
	// MetaDistributedAt 학년부장이 이 학급 배포자료를 만든 시각(UTC). 배포 사본에만 적힌다.
	MetaDistributedAt = "distributed_at"
	// MetaPatchExportedAt 담임이 마지막으로 반 전체 취합 파일을 낸 시각(UTC, 담임 PC 시계).
	MetaPatchExportedAt = "patch_exported_at"
	// MetaReceivedAt 담임 PC에서 이 배포자료로 처음 로그인한 시각(UTC, 담임 PC 시계).
	// 담임 원서 시각과 같은 시계라, PC 시계가 서로 달라도 "배포 뒤 담임이 고쳤는지"를 가릴 수 있다.
	MetaReceivedAt = "received_at"
)

const applicationTrackingSchema = `
	CREATE TABLE IF NOT EXISTS application_deletions (
		student_num TEXT NOT NULL,
		student_name TEXT NOT NULL,
		admission_year INTEGER NOT NULL,
		category TEXT NOT NULL,
		school_name TEXT NOT NULL DEFAULT '',
		track TEXT NOT NULL DEFAULT '',
		deleted_at TEXT NOT NULL,
		PRIMARY KEY(student_num, student_name, admission_year, category, school_name, track)
	);
	-- 학년부장 PC에서 취합 병합으로 쓴 원서와 그때 적은 시각. 학년부장이 직접 고친 원서와 구분한다.
	CREATE TABLE IF NOT EXISTS application_merge_marks (
		student_num TEXT NOT NULL,
		student_name TEXT NOT NULL,
		admission_year INTEGER NOT NULL,
		category TEXT NOT NULL,
		school_name TEXT NOT NULL DEFAULT '',
		track TEXT NOT NULL DEFAULT '',
		merged_updated_at TEXT NOT NULL,
		PRIMARY KEY(student_num, student_name, admission_year, category, school_name, track)
	);
	CREATE TABLE IF NOT EXISTS class_meta (
		key TEXT PRIMARY KEY,
		value TEXT NOT NULL DEFAULT ''
	);
	CREATE TRIGGER IF NOT EXISTS trg_application_deleted AFTER DELETE ON student_applications BEGIN
		INSERT OR REPLACE INTO application_deletions (student_num, student_name, admission_year, category, school_name, track, deleted_at)
		VALUES (OLD.student_num, OLD.student_name, OLD.admission_year, OLD.category, IFNULL(OLD.school_name, ''), IFNULL(OLD.track, ''), strftime('%Y-%m-%d %H:%M:%S', 'now'));
	END;
	CREATE TRIGGER IF NOT EXISTS trg_application_inserted AFTER INSERT ON student_applications BEGIN
		DELETE FROM application_deletions WHERE student_num = NEW.student_num AND student_name = NEW.student_name
			AND admission_year = NEW.admission_year AND category = NEW.category AND school_name = IFNULL(NEW.school_name, '') AND track = IFNULL(NEW.track, '');
	END;
	CREATE TRIGGER IF NOT EXISTS trg_application_rekeyed AFTER UPDATE OF admission_year, category, school_name, track ON student_applications
	WHEN OLD.admission_year IS NOT NEW.admission_year OR OLD.category IS NOT NEW.category OR OLD.school_name IS NOT NEW.school_name OR OLD.track IS NOT NEW.track BEGIN
		INSERT OR REPLACE INTO application_deletions (student_num, student_name, admission_year, category, school_name, track, deleted_at)
		VALUES (OLD.student_num, OLD.student_name, OLD.admission_year, OLD.category, IFNULL(OLD.school_name, ''), IFNULL(OLD.track, ''), strftime('%Y-%m-%d %H:%M:%S', 'now'));
		DELETE FROM application_deletions WHERE student_num = NEW.student_num AND student_name = NEW.student_name
			AND admission_year = NEW.admission_year AND category = NEW.category AND school_name = IFNULL(NEW.school_name, '') AND track = IFNULL(NEW.track, '');
	END;
`

func ensureApplicationTrackingSchema(db *sql.DB) error {
	_, err := db.Exec(applicationTrackingSchema)
	return err
}

// GetClassMeta 학급 정보 값을 읽는다(없으면 빈 문자열).
func (dm *DBManager) GetClassMeta(classNum int, key string) (string, error) {
	db, err := dm.OpenDB(dm.GetClassDBPath(classNum))
	if err != nil {
		return "", err
	}
	defer db.Close()
	return readClassMeta(db, key)
}

func readClassMeta(db *sql.DB, key string) (string, error) {
	var value string
	err := db.QueryRow(`SELECT value FROM class_meta WHERE key = ?`, key).Scan(&value)
	if err == sql.ErrNoRows || (err != nil && strings.Contains(err.Error(), "no such table")) {
		return "", nil
	}
	return value, err
}

// SetClassMeta 학급 정보 값을 적는다.
func (dm *DBManager) SetClassMeta(classNum int, key, value string) error {
	db, err := dm.OpenDB(dm.GetClassDBPath(classNum))
	if err != nil {
		return err
	}
	defer db.Close()
	return WriteClassMeta(db, key, value)
}

// WriteClassMeta 열린 학급 DB(배포 사본 등)에 학급 정보 값을 적는다.
func WriteClassMeta(db *sql.DB, key, value string) error {
	if err := ensureApplicationTrackingSchema(db); err != nil {
		return err
	}
	_, err := db.Exec(`INSERT OR REPLACE INTO class_meta (key, value) VALUES (?, ?)`, key, value)
	return err
}

// markDistributionReceived 배포 사본(배포 시각 있음)에 처음 로그인한 시각을 적는다. 학년부장 PC 학급 DB에는 배포 시각이 없어 적지 않는다.
func (dm *DBManager) markDistributionReceived(classNum int) {
	db, err := dm.OpenDB(dm.GetClassDBPath(classNum))
	if err != nil {
		return
	}
	defer db.Close()
	if readOrEmpty(db, MetaDistributedAt) == "" || readOrEmpty(db, MetaReceivedAt) != "" {
		return
	}
	_ = WriteClassMeta(db, MetaReceivedAt, NowDBTime())
}

func readOrEmpty(db *sql.DB, key string) string {
	value, _ := readClassMeta(db, key)
	return value
}

// mergeMarks 한 학생의 취합 병합 표시(원서 이름표 → 병합 때 적은 시각).
func (dm *DBManager) mergeMarks(classNum int, studentNum, studentName string) map[string]string {
	out := map[string]string{}
	db, err := dm.OpenDB(dm.GetClassDBPath(classNum))
	if err != nil {
		return out
	}
	defer db.Close()
	rows, err := db.Query(`SELECT admission_year, category, school_name, track, merged_updated_at FROM application_merge_marks WHERE student_num = ? AND student_name = ?`, studentNum, studentName)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var year int
		var category, school, track, at string
		if rows.Scan(&year, &category, &school, &track, &at) == nil {
			out[appKeyString(year, category, school, track)] = at
		}
	}
	return out
}

// markMerged 취합 병합으로 쓴 원서를 표시한다.
func (dm *DBManager) markMerged(r model.ApplicationRecord) error {
	db, err := dm.OpenDB(dm.GetClassDBPath(r.ClassNum))
	if err != nil {
		return err
	}
	defer db.Close()
	_, err = db.Exec(`INSERT OR REPLACE INTO application_merge_marks (student_num, student_name, admission_year, category, school_name, track, merged_updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		r.StudentNum, r.StudentName, r.AdmissionYear, r.Category, r.SchoolName, r.Track, r.UpdatedAt)
	return err
}

// GetApplicationDeletions 한 학생의 지운 원서 기록을 읽는다. since가 있으면 그 뒤에 지운 것만 돌려준다.
func (dm *DBManager) GetApplicationDeletions(classNum int, studentNum, studentName, since string) ([]model.ApplicationKey, error) {
	db, err := dm.OpenDB(dm.GetClassDBPath(classNum))
	if err != nil {
		return nil, err
	}
	defer db.Close()
	return readApplicationDeletions(db, studentNum, studentName, since)
}

func readApplicationDeletions(db *sql.DB, studentNum, studentName, since string) ([]model.ApplicationKey, error) {
	rows, err := db.Query(`SELECT admission_year, category, school_name, track, deleted_at FROM application_deletions WHERE student_num = ? AND student_name = ? ORDER BY deleted_at`, studentNum, studentName)
	if err != nil {
		if strings.Contains(err.Error(), "no such table") {
			return nil, nil
		}
		return nil, err
	}
	defer rows.Close()
	var out []model.ApplicationKey
	for rows.Next() {
		var k model.ApplicationKey
		if err := rows.Scan(&k.AdmissionYear, &k.Category, &k.SchoolName, &k.Track, &k.DeletedAt); err != nil {
			return nil, err
		}
		if since != "" && !TimeAfter(k.DeletedAt, since) {
			continue
		}
		out = append(out, k)
	}
	return out, rows.Err()
}

// NowDBTime 지금 시각을 DB 저장 형식(UTC "2006-01-02 15:04:05")으로 돌려준다.
func NowDBTime() string {
	return time.Now().UTC().Format("2006-01-02 15:04:05")
}

var dbTimeLayouts = []string{"2006-01-02 15:04:05", time.RFC3339Nano, "2006-01-02T15:04:05Z", "2006-01-02 15:04:05.000", "2006-01-02T15:04:05", "2006-01-02 15:04:05Z07:00"}

// ParseDBTime DB·교환 파일의 시각 문자열을 읽는다. 시간대가 없으면 UTC로 본다.
func ParseDBTime(value string) (time.Time, bool) {
	value = strings.TrimSpace(value)
	if value == "" {
		return time.Time{}, false
	}
	for _, layout := range dbTimeLayouts {
		if t, err := time.Parse(layout, value); err == nil {
			return t.UTC(), true
		}
	}
	return time.Time{}, false
}

// TimeAfter a가 b보다 엄격히 늦을 때만 true. 어느 한쪽이라도 읽을 수 없으면 false.
func TimeAfter(a, b string) bool {
	ta, okA := ParseDBTime(a)
	tb, okB := ParseDBTime(b)
	return okA && okB && ta.After(tb)
}

// TimeNear 두 시각이 within 초 안에 있으면 true(학교·전형을 바꾼 원서의 옛·새 이름표 짝 찾기).
func TimeNear(a, b string, within time.Duration) bool {
	ta, okA := ParseDBTime(a)
	tb, okB := ParseDBTime(b)
	if !okA || !okB {
		return false
	}
	d := ta.Sub(tb)
	if d < 0 {
		d = -d
	}
	return d <= within
}

// ReadClassMeta 열린 학급 DB(임시 사본 등)에서 학급 정보 값을 읽는다.
func ReadClassMeta(db *sql.DB, key string) string {
	value, _ := readClassMeta(db, key)
	return value
}

// StudentApplicationKey 학생 번호·이름이 붙은 지운 원서 기록.
type StudentApplicationKey struct {
	StudentNum  string
	StudentName string
	model.ApplicationKey
}

// ReadAllApplicationDeletions 열린 학급 DB의 지운 원서 기록 전체를 읽는다.
func ReadAllApplicationDeletions(db *sql.DB) []StudentApplicationKey {
	rows, err := db.Query(`SELECT student_num, student_name, admission_year, category, school_name, track, deleted_at FROM application_deletions`)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var out []StudentApplicationKey
	for rows.Next() {
		var k StudentApplicationKey
		if rows.Scan(&k.StudentNum, &k.StudentName, &k.AdmissionYear, &k.Category, &k.SchoolName, &k.Track, &k.DeletedAt) == nil {
			out = append(out, k)
		}
	}
	return out
}

// SameDBTime 두 시각 문자열이 같은 때를 가리키는지(표기 방식이 달라도). 읽을 수 없으면 글자 그대로 비교한다.
func SameDBTime(a, b string) bool {
	ta, okA := ParseDBTime(a)
	tb, okB := ParseDBTime(b)
	if okA && okB {
		return ta.Equal(tb)
	}
	return a == b
}
