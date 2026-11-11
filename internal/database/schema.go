package database

import (
	"fmt"
	"path/filepath"
	"strings"

	"golang.org/x/crypto/bcrypt"
)

// InitConfigDB config.db 테이블 초기화
func (dm *DBManager) InitConfigDB() error {
	db, err := dm.OpenDB(dm.GetConfigDBPath())
	if err != nil {
		return err
	}
	defer db.Close()

	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS school_config (
			id             INTEGER PRIMARY KEY,
			school_name    TEXT NOT NULL,
			class_count    INTEGER NOT NULL,
			admin_password TEXT NOT NULL DEFAULT '',
			is_small_school BOOLEAN DEFAULT 0,
			admission_year  INTEGER DEFAULT 2025,
			expected_support_token TEXT NOT NULL DEFAULT '',
			grade       INTEGER DEFAULT 3,
			created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
		);
		CREATE TABLE IF NOT EXISTS highschool_cutoffs (
			id INTEGER PRIMARY KEY,
			year INTEGER NOT NULL,
			school_name TEXT NOT NULL,
			department TEXT NOT NULL,
			track TEXT NOT NULL,
			score_type TEXT NOT NULL,
			max_value REAL,
			min_value REAL,
			avg_value REAL DEFAULT 0,
			UNIQUE(year, school_name, department, track)
		);
		CREATE TABLE IF NOT EXISTS feedback_issues (
			id INTEGER PRIMARY KEY,
			issue_id INTEGER NOT NULL UNIQUE,
			title TEXT NOT NULL,
			status TEXT DEFAULT 'open',
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);
		CREATE TABLE IF NOT EXISTS users (
			id INTEGER PRIMARY KEY,
			username TEXT NOT NULL UNIQUE,
			password_hash TEXT NOT NULL,
			role TEXT NOT NULL,
			class_num INTEGER,
			must_change_password BOOLEAN DEFAULT 1,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);
		CREATE TABLE IF NOT EXISTS admission_closures (
			admission_year INTEGER PRIMARY KEY,
			status TEXT NOT NULL DEFAULT 'closed',
			closed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			closed_by TEXT NOT NULL DEFAULT '',
			note TEXT NOT NULL DEFAULT '',
			cutoffs_applied INTEGER NOT NULL DEFAULT 0
		);
		CREATE TABLE IF NOT EXISTS school_rank_snapshots (
			class_num INTEGER NOT NULL,
			student_num TEXT NOT NULL,
			student_name TEXT NOT NULL,
			total_students INTEGER NOT NULL,
			rank INTEGER NOT NULL,
			percentile REAL NOT NULL,
			final_score REAL NOT NULL,
			non_academic_score REAL DEFAULT 0,
			general_total_score REAL DEFAULT 0,
			total_subject_score REAL DEFAULT 0,
			general_data_complete BOOLEAN DEFAULT 1,
			general_projected BOOLEAN DEFAULT 0,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY (class_num, student_num, student_name)
		);
	`)
	if err != nil {
		return fmt.Errorf("config 테이블 생성 실패: %w", err)
	}

	// 기존 DB 마이그레이션 (avg_value 컬럼 추가)
	_, _ = db.Exec("ALTER TABLE highschool_cutoffs ADD COLUMN avg_value REAL DEFAULT 0")
	_, _ = db.Exec("ALTER TABLE school_config ADD COLUMN expected_support_token TEXT NOT NULL DEFAULT ''")
	_, _ = db.Exec(`CREATE TABLE IF NOT EXISTS school_rank_snapshots (
		class_num INTEGER NOT NULL,
		student_num TEXT NOT NULL,
		student_name TEXT NOT NULL,
		total_students INTEGER NOT NULL,
		rank INTEGER NOT NULL,
		percentile REAL NOT NULL,
		final_score REAL NOT NULL,
		non_academic_score REAL DEFAULT 0,
		general_total_score REAL DEFAULT 0,
		total_subject_score REAL DEFAULT 0,
		general_data_complete BOOLEAN DEFAULT 1,
		general_projected BOOLEAN DEFAULT 0,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY (class_num, student_num, student_name)
	)`)

	// 자가 치유(Self-healing): school_config가 설정되어 있는데 users 계정이 누락된 경우 자동 복구
	var userCount int
	_ = db.QueryRow("SELECT COUNT(*) FROM users").Scan(&userCount)
	if userCount == 0 {
		var schoolName, adminPW string
		var classCount int
		err := db.QueryRow("SELECT school_name, class_count, admin_password FROM school_config WHERE id = 1").Scan(&schoolName, &classCount, &adminPW)
		if err == nil && schoolName != "" {
			if adminPW == "" {
				adminPW = "admin1234"
			}
			hashedAdmin, _ := bcrypt.GenerateFromPassword([]byte(adminPW), bcrypt.DefaultCost)
			_, _ = db.Exec("INSERT INTO users (username, password_hash, role, class_num, must_change_password) VALUES (?, ?, ?, ?, ?)", "admin", string(hashedAdmin), "master", 0, false)
			_, _ = db.Exec("INSERT INTO users (username, password_hash, role, class_num, must_change_password) VALUES (?, ?, ?, ?, ?)", "jinro", "", "viewer", 0, true)
			if classCount <= 0 {
				classCount = 10
			}
			for i := 1; i <= classCount; i++ {
				uname := fmt.Sprintf("3%02d", i)
				_, _ = db.Exec("INSERT INTO users (username, password_hash, role, class_num, must_change_password) VALUES (?, ?, ?, ?, ?)", uname, "", "homeroom", i, true)
			}
		}
	}

	return nil
}

// InitClassDB 학급 DB 초기화 (테이블 생성)
func (dm *DBManager) InitClassDB(classNum int) error {
	return dm.EnsureClassDBSchema(filepath.Join(dm.DataDir, fmt.Sprintf("class_%d.db", classNum)))
}

// EnsureClassDBSchema 는 지정한 경로의 학급 DB에 빠진 표와 열을 추가한다(기존 자료는 보존).
// 배포자료 재가져오기처럼 data 폴더 밖 임시 사본을 다룰 때도 쓴다.
func (dm *DBManager) EnsureClassDBSchema(dbPath string) error {
	db, err := dm.OpenDB(dbPath)
	if err != nil {
		return err
	}
	defer db.Close()

	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS students (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			student_num TEXT NOT NULL,
			name TEXT NOT NULL,
			grades_json TEXT,
			attendance_json TEXT DEFAULT '',
			volunteer_json TEXT DEFAULT '',
			extra_json TEXT DEFAULT ''
		);
		CREATE TABLE IF NOT EXISTS student_applications (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			student_num TEXT NOT NULL,
			student_name TEXT NOT NULL,
			admission_year INTEGER NOT NULL,
			category TEXT NOT NULL,
			school_name TEXT DEFAULT '',
			track TEXT DEFAULT '',
			status TEXT NOT NULL DEFAULT '미입력',
			score REAL DEFAULT 0,
			score_basis TEXT DEFAULT '',
			preferences_json TEXT DEFAULT '[]',
			assigned_department TEXT DEFAULT '',
			assigned_school TEXT DEFAULT '',
			score_details_json TEXT DEFAULT '',
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(student_num, student_name, admission_year, category, school_name, track)
		);
		CREATE TABLE IF NOT EXISTS student_school_scores (
			student_num TEXT NOT NULL,
			student_name TEXT NOT NULL,
			school_name TEXT NOT NULL,
			track TEXT NOT NULL,
			total_score REAL NOT NULL,
			total_max REAL NOT NULL,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY(student_num, student_name, school_name, track)
		);
		CREATE TABLE IF NOT EXISTS student_counseling_records (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			student_num TEXT NOT NULL,
			student_name TEXT NOT NULL,
			class_num INTEGER NOT NULL,
			counsel_date TEXT NOT NULL,
			target_school TEXT DEFAULT '',
			content TEXT NOT NULL,
			author_username TEXT NOT NULL,
			author_name TEXT DEFAULT '',
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);
	`)

	// 기존 테이블에 컬럼 추가 (오류 무시 - 이미 존재할 경우)
	_, _ = db.Exec(`ALTER TABLE students ADD COLUMN attendance_json TEXT DEFAULT ''`)
	_, _ = db.Exec(`ALTER TABLE students ADD COLUMN volunteer_json TEXT DEFAULT ''`)
	_, _ = db.Exec(`ALTER TABLE students ADD COLUMN extra_json TEXT DEFAULT ''`)
	_, _ = db.Exec(`ALTER TABLE student_applications ADD COLUMN assigned_school TEXT DEFAULT ''`)
	_, _ = db.Exec(`ALTER TABLE student_applications ADD COLUMN score_details_json TEXT DEFAULT ''`)

	if err != nil {
		return fmt.Errorf("학급 DB 초기화 실패: %w", err)
	}
	return nil
}

// MigrateExistingClassDBs 는 data 폴더에 있는 모든 학급 DB(class_N.db)의 구조를 최신으로 맞춘다.
// 구버전(v1.6.2 등)에서 넘어온 학급 DB에는 새 열(score_details_json 등)이 없어서, 일부 조회가
// 오류 없이 그 반을 건너뛰어 원서가 0건으로 보일 수 있다. 로그인 직후 한 번 호출해 이를 막는다.
// 기존 자료는 지우거나 바꾸지 않고 빠진 표와 열만 추가한다.
func (dm *DBManager) MigrateExistingClassDBs() error {
	paths, err := filepath.Glob(filepath.Join(dm.DataDir, "class_*.db"))
	if err != nil {
		return err
	}
	var failed []string
	for _, path := range paths {
		var classNum int
		if _, scanErr := fmt.Sscanf(filepath.Base(path), "class_%d.db", &classNum); scanErr != nil || classNum < 1 {
			continue
		}
		if err := dm.InitClassDB(classNum); err != nil {
			failed = append(failed, fmt.Sprintf("%d반: %v", classNum, err))
		}
	}
	if len(failed) > 0 {
		return fmt.Errorf("학급 DB 구조 갱신 실패: %s", strings.Join(failed, "; "))
	}
	return nil
}
