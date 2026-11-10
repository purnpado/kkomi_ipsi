package database

import (
	"database/sql"
	"fmt"
	"strings"

	"golang.org/x/crypto/bcrypt"
)

// User represents a system user
type User struct {
	ID                 int
	Username           string
	PasswordHash       string
	Role               string
	ClassNum           int
	MustChangePassword bool
}

// InitUsers 초기 마스터, 뷰어, 담임 계정 생성 (기존 계정 초기화)
// 교사 계정은 처음엔 비밀번호 없이 생성되며, 마스터가 추후 세팅합니다.
func (dm *DBManager) InitUsers(classCount int, adminPassword string) error {
	db, err := dm.OpenDB(dm.GetConfigDBPath())
	if err != nil {
		return err
	}
	defer db.Close()

	_, err = db.Exec("DELETE FROM users")
	if err != nil {
		return err
	}

	hashedAdmin, err := bcrypt.GenerateFromPassword([]byte(adminPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}

	// 1. 마스터 계정
	_, err = db.Exec(`
		INSERT INTO users (username, password_hash, role, class_num, must_change_password)
		VALUES (?, ?, ?, ?, ?)
	`, "admin", string(hashedAdmin), "master", 0, false)
	if err != nil {
		return err
	}

	// 2. 진로부장 계정 (초기엔 접속 불가 상태)
	_, err = db.Exec(`
		INSERT INTO users (username, password_hash, role, class_num, must_change_password)
		VALUES (?, ?, ?, ?, ?)
	`, "jinro", "", "viewer", 0, true)
	if err != nil {
		return err
	}

	// 3. 담임 계정 (1반 ~ classCount반) (초기엔 접속 불가 상태)
	for i := 1; i <= classCount; i++ {
		// 3학년 1반은 301, 2반은 302처럼 학급 자체를 계정명으로 쓴다.
		username := fmt.Sprintf("3%02d", i)
		_, err = db.Exec(`
			INSERT INTO users (username, password_hash, role, class_num, must_change_password)
			VALUES (?, ?, ?, ?, ?)
		`, username, "", "homeroom", i, true)
		if err != nil {
			return err
		}
	}

	return nil
}

// GetUsers 시스템 내 모든 사용자 목록 반환
func (dm *DBManager) GetUsers() ([]User, error) {
	db, err := dm.OpenDB(dm.GetConfigDBPath())
	if err != nil {
		return nil, err
	}
	defer db.Close()

	rows, err := db.Query(`
		SELECT id, username, role, class_num, must_change_password
		FROM users
		ORDER BY CASE role
			WHEN 'master' THEN 0
			WHEN 'homeroom' THEN 1
			WHEN 'viewer' THEN 2
			ELSE 3
		END, class_num ASC, username ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []User
	for rows.Next() {
		var u User
		if err := rows.Scan(&u.ID, &u.Username, &u.Role, &u.ClassNum, &u.MustChangePassword); err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	return users, nil
}

// SetUserPassword 관리자가 특정 유저의 비밀번호를 설정/재설정
func (dm *DBManager) SetUserPassword(username, newPassword string) error {
	db, err := dm.OpenDB(dm.GetConfigDBPath())
	if err != nil {
		return err
	}
	defer db.Close()

	hashed, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	// 관리자가 설정해주면 무조건 다시 강제 변경하도록 설정
	_, err = db.Exec(`
		UPDATE users 
		SET password_hash = ?, must_change_password = 1 
		WHERE username = ?
	`, string(hashed), username)
	return err
}

// AddViewerUser 뷰어 권한을 가진 새 계정 추가
func (dm *DBManager) AddViewerUser(username, password string) error {
	db, err := dm.OpenDB(dm.GetConfigDBPath())
	if err != nil {
		return err
	}
	defer db.Close()

	hashed, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	_, err = db.Exec(`
		INSERT INTO users (username, password_hash, role, class_num, must_change_password)
		VALUES (?, ?, ?, ?, ?)
	`, username, string(hashed), "viewer", 0, true)
	return err
}

// CreateUser 사용자 생성 (관리자, 뷰어, 담임 등 자유 생성)
func (dm *DBManager) CreateUser(username, password, role string, classNum int) error {
	db, err := dm.OpenDB(dm.GetConfigDBPath())
	if err != nil {
		return err
	}
	defer db.Close()

	hashed, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	_, err = db.Exec(`
		INSERT INTO users (username, password_hash, role, class_num, must_change_password)
		VALUES (?, ?, ?, ?, 1)
	`, username, string(hashed), role, classNum)
	return err
}

// DeleteUser 사용자 삭제
func (dm *DBManager) DeleteUser(username string) error {
	if username == "admin" {
		return fmt.Errorf("최고 관리자(admin) 계정은 삭제할 수 없습니다")
	}
	db, err := dm.OpenDB(dm.GetConfigDBPath())
	if err != nil {
		return err
	}
	defer db.Close()

	_, err = db.Exec("DELETE FROM users WHERE username = ?", username)
	return err
}

// VerifyUserLogin verifies login credentials
func (dm *DBManager) VerifyUserLogin(username, password string) (*User, error) {
	db, err := dm.OpenDB(dm.GetConfigDBPath())
	if err != nil {
		return nil, err
	}
	defer db.Close()

	var u User
	err = db.QueryRow("SELECT id, username, password_hash, role, COALESCE(class_num, 0), must_change_password FROM users WHERE username = ?", username).Scan(&u.ID, &u.Username, &u.PasswordHash, &u.Role, &u.ClassNum, &u.MustChangePassword)
	if err != nil {
		if err == sql.ErrNoRows {
			var userList []string
			if rows, qErr := db.Query("SELECT username, role, COALESCE(class_num, 0) FROM users"); qErr == nil {
				for rows.Next() {
					var un, r string
					var cn int
					rows.Scan(&un, &r, &cn)
					label := un
					if r == "master" {
						label += "(학년부장)"
					} else if r == "homeroom" {
						label += fmt.Sprintf("(%d반 담임)", cn)
					}
					userList = append(userList, label)
				}
				rows.Close()
			}
			if len(userList) > 0 {
				return nil, fmt.Errorf("계정 '%s'을(를) 찾을 수 없습니다.\n현재 등록된 계정: %s", username, strings.Join(userList, ", "))
			}
			return nil, fmt.Errorf("계정 '%s'을(를) 찾을 수 없습니다", username)
		}
		return nil, err
	}

	err = bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(password))
	if err != nil {
		return nil, fmt.Errorf("비밀번호가 일치하지 않습니다")
	}

	return &u, nil
}

// ChangeUserPassword changes the user password
func (dm *DBManager) ChangeUserPassword(username, newPassword string) error {
	db, err := dm.OpenDB(dm.GetConfigDBPath())
	if err != nil {
		return err
	}
	defer db.Close()

	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}

	_, err = db.Exec("UPDATE users SET password_hash = ?, must_change_password = 0 WHERE username = ?", string(hash), username)
	return err
}
