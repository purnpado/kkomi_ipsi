package exchange

import (
	"fmt"

	"PHGC/internal/database"
	"PHGC/internal/model"
)

type preservedAppRow struct {
	StudentNum         string
	StudentName        string
	AdmissionYear      int
	Category           string
	SchoolName         string
	Track              string
	Status             string
	Score              float64
	ScoreBasis         string
	PreferencesJSON    string
	AssignedDepartment string
	AssignedSchool     string
	ScoreDetailsJSON   string
	FirstStageResult   string
	ExtraRound         bool
	UpdatedAt          string
}

type preservedCounselRow struct {
	StudentNum     string
	StudentName    string
	ClassNum       int
	CounselDate    string
	TargetSchool   string
	Content        string
	AuthorUsername string
	AuthorName     string
	CreatedAt      string
	UpdatedAt      string
}

type preservedStudentOverride struct {
	StudentNum     string
	Name           string
	AttendanceJSON string
	VolunteerJSON  string
	ExtraJSON      string
}

// preservedWishlist 상담 화면 관심학교 목록(학급 DB student_wishlists)
type preservedWishlist struct {
	StudentNum  string
	StudentName string
	ItemsJSON   string
	UpdatedAt   string
}

type preservedClassData struct {
	Apps      []preservedAppRow
	Counsels  []preservedCounselRow
	Overrides []preservedStudentOverride
	Wishlists []preservedWishlist
	// StatExclusions 입시 통계 제외 표시(해제 기록 포함): 번호·이름 → 표시
	StatExclusions map[[2]string]model.StatExclusionMark
}

func extractPreservedClassData(dm *database.DBManager, dbPath string) (preservedClassData, error) {
	var result preservedClassData
	db, err := dm.OpenDB(dbPath)
	if err != nil {
		return result, err
	}
	defer db.Close()

	// 1. Applications 추출. 칸이 늦게 생긴 예전 DB도 읽도록 먼저 칸을 만들어 둔다(이미 있으면 무시됨).
	_, _ = db.Exec(`ALTER TABLE student_applications ADD COLUMN first_stage_result TEXT DEFAULT ''`)
	_, _ = db.Exec(`ALTER TABLE student_applications ADD COLUMN extra_round INTEGER NOT NULL DEFAULT 0`)
	appRows, err := db.Query(`SELECT student_num, student_name, admission_year, category, school_name, track, status, score, score_basis, preferences_json, assigned_department, COALESCE(assigned_school, ''), COALESCE(score_details_json, ''), COALESCE(first_stage_result, ''), COALESCE(extra_round, 0), updated_at FROM student_applications`)
	if err == nil {
		defer appRows.Close()
		for appRows.Next() {
			var a preservedAppRow
			if err := appRows.Scan(&a.StudentNum, &a.StudentName, &a.AdmissionYear, &a.Category, &a.SchoolName, &a.Track, &a.Status, &a.Score, &a.ScoreBasis, &a.PreferencesJSON, &a.AssignedDepartment, &a.AssignedSchool, &a.ScoreDetailsJSON, &a.FirstStageResult, &a.ExtraRound, &a.UpdatedAt); err == nil {
				result.Apps = append(result.Apps, a)
			}
		}
	}

	// 2. Counseling records 추출
	counselRows, err := db.Query(`SELECT student_num, student_name, class_num, counsel_date, target_school, content, author_username, IFNULL(author_name, ''), created_at, updated_at FROM student_counseling_records`)
	if err == nil {
		defer counselRows.Close()
		for counselRows.Next() {
			var c preservedCounselRow
			if err := counselRows.Scan(&c.StudentNum, &c.StudentName, &c.ClassNum, &c.CounselDate, &c.TargetSchool, &c.Content, &c.AuthorUsername, &c.AuthorName, &c.CreatedAt, &c.UpdatedAt); err == nil {
				result.Counsels = append(result.Counsels, c)
			}
		}
	}

	// 3. Student Overrides (출결, 봉사, 가산점)
	stRows, err := db.Query(`SELECT student_num, name, IFNULL(attendance_json, ''), IFNULL(volunteer_json, ''), IFNULL(extra_json, '') FROM students WHERE (attendance_json != '' AND attendance_json IS NOT NULL) OR (volunteer_json != '' AND volunteer_json IS NOT NULL) OR (extra_json != '' AND extra_json IS NOT NULL)`)
	if err == nil {
		defer stRows.Close()
		for stRows.Next() {
			var so preservedStudentOverride
			if err := stRows.Scan(&so.StudentNum, &so.Name, &so.AttendanceJSON, &so.VolunteerJSON, &so.ExtraJSON); err == nil {
				result.Overrides = append(result.Overrides, so)
			}
		}
	}

	// 4. 관심학교 목록(예전 학급 DB에는 표가 없을 수 있다)
	wishRows, err := db.Query(`SELECT student_num, student_name, items_json, IFNULL(updated_at, '') FROM student_wishlists`)
	if err == nil {
		defer wishRows.Close()
		for wishRows.Next() {
			var w preservedWishlist
			if err := wishRows.Scan(&w.StudentNum, &w.StudentName, &w.ItemsJSON, &w.UpdatedAt); err == nil {
				result.Wishlists = append(result.Wishlists, w)
			}
		}
	}

	// 5. 입시 통계 제외 표시
	result.StatExclusions = database.ReadStatExclusions(db)

	return result, nil
}

func restorePreservedClassData(dm *database.DBManager, dbPath string, data preservedClassData) error {
	// 예전 버전 배포자료의 학급 DB에도 새 표(관심학교 등)가 있도록 먼저 맞춘다.
	if err := dm.EnsureClassDBSchema(dbPath); err != nil {
		return err
	}
	db, err := dm.OpenDB(dbPath)
	if err != nil {
		return err
	}
	defer db.Close()
	var firstErr error
	keep := func(err error) {
		if err != nil && firstErr == nil {
			firstErr = err
		}
	}

	// 1. Applications 복원 (같은 학생·학년도·전형이면 담임 PC의 최신 입력으로 갱신)
	for _, a := range data.Apps {
		_, err := db.Exec(`INSERT INTO student_applications (student_num, student_name, admission_year, category, school_name, track, status, score, score_basis, preferences_json, assigned_department, assigned_school, score_details_json, first_stage_result, extra_round, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(student_num, student_name, admission_year, category, school_name, track) DO UPDATE SET
				status = excluded.status,
				score = excluded.score,
				score_basis = excluded.score_basis,
				preferences_json = excluded.preferences_json,
				assigned_department = excluded.assigned_department,
				assigned_school = excluded.assigned_school,
				first_stage_result = excluded.first_stage_result,
				extra_round = excluded.extra_round,
				score_details_json = CASE WHEN excluded.score_details_json <> '' THEN excluded.score_details_json ELSE student_applications.score_details_json END,
				updated_at = excluded.updated_at`,
			a.StudentNum, a.StudentName, a.AdmissionYear, a.Category, a.SchoolName, a.Track, a.Status, a.Score, a.ScoreBasis, a.PreferencesJSON, a.AssignedDepartment, a.AssignedSchool, a.ScoreDetailsJSON, a.FirstStageResult, a.ExtraRound, a.UpdatedAt)
		keep(err)
	}

	// 2. Counseling records 복원 (중복이 없는 건만 추가)
	for _, c := range data.Counsels {
		var exists int
		keep(db.QueryRow(`SELECT COUNT(*) FROM student_counseling_records WHERE student_num = ? AND student_name = ? AND counsel_date = ? AND author_username = ? AND content = ?`,
			c.StudentNum, c.StudentName, c.CounselDate, c.AuthorUsername, c.Content).Scan(&exists))
		if exists == 0 {
			_, err := db.Exec(`INSERT INTO student_counseling_records (student_num, student_name, class_num, counsel_date, target_school, content, author_username, author_name, created_at, updated_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				c.StudentNum, c.StudentName, c.ClassNum, c.CounselDate, c.TargetSchool, c.Content, c.AuthorUsername, c.AuthorName, c.CreatedAt, c.UpdatedAt)
			keep(err)
		}
	}

	// 3. Student overrides 복원 (담임이 직접 입력한 출결·봉사·가산점)
	for _, so := range data.Overrides {
		_, err := db.Exec(`UPDATE students SET attendance_json = ?, volunteer_json = ?, extra_json = ? WHERE student_num = ? AND name = ?`,
			so.AttendanceJSON, so.VolunteerJSON, so.ExtraJSON, so.StudentNum, so.Name)
		keep(err)
	}
	// 4. 관심학교 목록 복원(담임 PC에서 고친 목록을 그대로 남긴다)
	for _, w := range data.Wishlists {
		_, err := db.Exec(`INSERT INTO student_wishlists (student_num, student_name, items_json, updated_at) VALUES (?, ?, ?, ?)
			ON CONFLICT(student_num, student_name) DO UPDATE SET items_json = excluded.items_json, updated_at = excluded.updated_at`,
			w.StudentNum, w.StudentName, w.ItemsJSON, w.UpdatedAt)
		keep(err)
	}
	// 5. 입시 통계 제외 표시: 새 배포자료(학년부장 기록)보다 담임 PC에서 더 최근에 바꾼 것만 남긴다.
	for key, mark := range data.StatExclusions {
		keep(database.UpsertStatExclusion(db, key[0], key[1], mark, true))
	}
	if firstErr != nil {
		return fmt.Errorf("기존 학급 자료 병합 중 오류: %w", firstErr)
	}
	_, err = db.Exec("PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE")
	return err
}
