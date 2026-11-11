package database

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"golang.org/x/crypto/bcrypt"
)

// SchoolConfig 학교 설정 정보
type SchoolConfig struct {
	SchoolName    string `json:"schoolName"`
	ClassCount    int    `json:"classCount"`
	IsSmallSchool bool   `json:"isSmallSchool"`
	AdmissionYear int    `json:"admissionYear"`
}

// SetupRequest 초기 설정 요청
type SetupRequest struct {
	SchoolName         string `json:"schoolName"`
	ClassCount         int    `json:"classCount"`
	AdminPassword      string `json:"adminPassword"`
	SharedDataPassword string `json:"sharedDataPassword"`
	IsSmallSchool      bool   `json:"isSmallSchool"`
	AdmissionYear      int    `json:"admissionYear"`
}

// SaveSchoolConfig 학교 설정 저장
func (dm *DBManager) SaveSchoolConfig(schoolName string, classCount int, adminPassword string, isSmallSchool bool, admissionYear int) error {
	db, err := dm.OpenDB(dm.GetConfigDBPath())
	if err != nil {
		return err
	}
	defer db.Close()

	// 기존 설정이 있으면 업데이트, 없으면 삽입
	_, err = db.Exec(`
		INSERT INTO school_config (id, school_name, class_count, admin_password, is_small_school, admission_year, updated_at)
		VALUES (1, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(id) DO UPDATE SET
			school_name    = excluded.school_name,
			class_count    = excluded.class_count,
			admin_password = excluded.admin_password,
			is_small_school = excluded.is_small_school,
			admission_year  = excluded.admission_year,
			updated_at     = CURRENT_TIMESTAMP
	`, schoolName, classCount, adminPassword, isSmallSchool, admissionYear)
	if err != nil {
		return fmt.Errorf("학교 설정 저장 실패: %w", err)
	}
	return nil
}

// GetSchoolConfig 학교 설정 조회
func (dm *DBManager) GetSchoolConfig() (*SchoolConfig, error) {
	db, err := dm.OpenDB(dm.GetConfigDBPath())
	if err != nil {
		return nil, err
	}
	defer db.Close()

	var config SchoolConfig
	err = db.QueryRow("SELECT school_name, class_count, is_small_school, admission_year FROM school_config WHERE id = 1").
		Scan(&config.SchoolName, &config.ClassCount, &config.IsSmallSchool, &config.AdmissionYear)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil // 설정이 없는 경우
		}
		return nil, fmt.Errorf("학교 설정 조회 실패: %w", err)
	}
	return &config, nil
}

// GetExpectedSupportToken returns an opaque, random participation key for the
// optional expected-support service. It is stored only in the encrypted local
// config DB and is not derived from a user's password or device identity.
func (dm *DBManager) GetExpectedSupportToken() (string, error) {
	db, err := dm.OpenDB(dm.GetConfigDBPath())
	if err != nil {
		return "", err
	}
	defer db.Close()
	var token string
	if err := db.QueryRow("SELECT expected_support_token FROM school_config WHERE id = 1").Scan(&token); err != nil {
		if err == sql.ErrNoRows {
			return "", fmt.Errorf("학교 초기 설정을 먼저 완료해주세요")
		}
		return "", fmt.Errorf("예상 지원현황 참여 키 조회 실패: %w", err)
	}
	if strings.TrimSpace(token) != "" {
		return token, nil
	}
	bytes := make([]byte, 24)
	if _, err := rand.Read(bytes); err != nil {
		return "", fmt.Errorf("예상 지원현황 참여 키 생성 실패: %w", err)
	}
	token = hex.EncodeToString(bytes)
	if _, err := db.Exec("UPDATE school_config SET expected_support_token = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1", token); err != nil {
		return "", fmt.Errorf("예상 지원현황 참여 키 저장 실패: %w", err)
	}
	return token, nil
}

// UpdateAdmissionYear changes only the default admission year.  It intentionally
// does not recreate teacher accounts or touch their password/key envelopes.
func (dm *DBManager) UpdateAdmissionYear(admissionYear int) error {
	if admissionYear < 2000 || admissionYear > 2100 {
		return fmt.Errorf("고입 학년도는 2000~2100 사이여야 합니다")
	}
	db, err := dm.OpenDB(dm.GetConfigDBPath())
	if err != nil {
		return err
	}
	defer db.Close()
	result, err := db.Exec(`UPDATE school_config SET admission_year = ?, updated_at = CURRENT_TIMESTAMP`, admissionYear)
	if err != nil {
		return fmt.Errorf("고입 학년도 설정 저장 실패: %w", err)
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count == 0 {
		return fmt.Errorf("학교 초기 설정을 먼저 완료해주세요")
	}
	return nil
}

// VerifyAdminPassword 관리자 비밀번호 검증
func (dm *DBManager) VerifyAdminPassword(password string) (bool, error) {
	db, err := dm.OpenDB(dm.GetConfigDBPath())
	if err != nil {
		return false, err
	}
	defer db.Close()

	var storedPassword string
	err = db.QueryRow("SELECT admin_password FROM school_config WHERE id = 1").
		Scan(&storedPassword)
	if err != nil {
		return false, fmt.Errorf("비밀번호 조회 실패: %w", err)
	}

	err = bcrypt.CompareHashAndPassword([]byte(storedPassword), []byte(password))
	return err == nil, nil
}

// HasConfig 설정 존재 여부 확인
func (dm *DBManager) HasConfig() bool {
	config, err := dm.GetSchoolConfig()
	return err == nil && config != nil
}

// ----------------------------------------------------
// Feedback Issues
// ----------------------------------------------------

type FeedbackIssue struct {
	IssueID   int    `json:"issue_id"`
	Title     string `json:"title"`
	Status    string `json:"status"`
	CreatedAt string `json:"created_at"`
}

func (dm *DBManager) SaveFeedbackIssue(issueID int, title string) error {
	db, err := dm.OpenDB(dm.GetConfigDBPath())
	if err != nil {
		return err
	}
	defer db.Close()

	_, err = db.Exec("INSERT INTO feedback_issues (issue_id, title) VALUES (?, ?)", issueID, title)
	return err
}

func (dm *DBManager) GetFeedbackIssues() ([]FeedbackIssue, error) {
	db, err := dm.OpenDB(dm.GetConfigDBPath())
	if err != nil {
		return nil, err
	}
	defer db.Close()

	rows, err := db.Query("SELECT issue_id, title, status, created_at FROM feedback_issues ORDER BY created_at DESC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	issues := []FeedbackIssue{}
	for rows.Next() {
		var i FeedbackIssue
		rows.Scan(&i.IssueID, &i.Title, &i.Status, &i.CreatedAt)
		issues = append(issues, i)
	}
	return issues, nil
}

// ResetAcademicYear 입시년도 전환 시 커트라인 데이터(highschool_cutoffs)를 제외한 모든 학급 데이터 삭제
func (dm *DBManager) ResetAcademicYear(newYear int) error {
	// 1. 모든 class_*.db 파일 삭제
	files, err := filepath.Glob(filepath.Join(dm.DataDir, "class_*.db"))
	if err == nil {
		for _, f := range files {
			_ = os.Remove(f)
		}
	}

	// 2. config.db의 admissionYear 업데이트
	configDBPath := dm.GetConfigDBPath()
	db, err := dm.OpenDB(configDBPath)
	if err != nil {
		return err
	}
	defer db.Close()

	_, err = db.Exec("UPDATE school_config SET admission_year = ? WHERE id = 1", newYear)
	return err
}
