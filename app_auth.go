package main

import (
	"fmt"
	"os"
	"strings"

	"PHGC/internal/crypto"
	"PHGC/internal/database"
	"golang.org/x/crypto/bcrypt"
)

// --- 프론트엔드 바인딩 API ---

// CheckSetupComplete 초기 설정 완료 여부 확인
func (a *App) CheckSetupComplete() bool {
	if a.db.HasEncryptedConfigDB() {
		return true
	}
	return a.db.HasConfig()
}

// GetSchoolConfig 학교 설정 조회
func (a *App) GetSchoolConfig() (*database.SchoolConfig, error) {
	return a.db.GetSchoolConfig()
}

// UpdateAdmissionYear updates the default cutoff entry year without changing
// accounts, passwords, or encrypted data-key envelopes.
func (a *App) UpdateAdmissionYear(admissionYear int) error {
	return a.db.UpdateAdmissionYear(admissionYear)
}

// SetupApp 초기 설정 저장
func (a *App) SetupApp(req database.SetupRequest) error {
	if req.SchoolName == "" || req.ClassCount <= 0 || req.AdminPassword == "" || req.SharedDataPassword == "" {
		return fmt.Errorf("모든 설정 값을 올바르게 입력해주세요")
	}
	if len(a.dataKey) != 32 {
		key, err := crypto.NewDataKey()
		if err != nil {
			return fmt.Errorf("데이터 암호화 키 생성 실패: %w", err)
		}
		a.dataKey = key
		a.db.SetDataKey(key)
	}

	// 비밀번호 해싱 및 설정 저장
	hashedPwd, err := bcrypt.GenerateFromPassword([]byte(req.AdminPassword), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("비밀번호 암호화 실패: %w", err)
	}

	// DB에 설정 저장 (입학년도 포함)
	err = a.db.SaveSchoolConfig(req.SchoolName, req.ClassCount, string(hashedPwd), req.IsSmallSchool, req.AdmissionYear)
	if err != nil {
		return fmt.Errorf("설정 저장 실패: %w", err)
	}

	// 사용자 초기 계정 생성 (마스터, 뷰어, 담임)
	err = a.db.InitUsers(req.ClassCount, req.AdminPassword)
	if err != nil {
		return fmt.Errorf("초기 계정 생성 실패: %w", err)
	}

	// 담임 및 진로 계정의 초기 비밀번호를 공용 데이터 암호로 기본 설정 (학년부장이 개별 비번을 세팅하지 않아도 즉시 배포 및 로그인 가능)
	hashedShared, hashErr := bcrypt.GenerateFromPassword([]byte(req.SharedDataPassword), bcrypt.DefaultCost)
	if hashErr == nil {
		if db, dbErr := a.db.OpenDB(a.db.GetConfigDBPath()); dbErr == nil {
			_, _ = db.Exec("UPDATE users SET password_hash = ? WHERE role IN ('homeroom', 'viewer') AND (password_hash IS NULL OR password_hash = '')", string(hashedShared))
			_, _ = db.Exec("PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE")
			db.Close()
		}
	}
	adminEnvelope, err := crypto.SealDataKeyForUser("admin", req.AdminPassword, a.dataKey)
	if err != nil {
		return err
	}
	if err := crypto.SaveUserKeyEnvelope(a.db.DataDir, adminEnvelope); err != nil {
		return err
	}
	if err := crypto.SaveSharedKeyEnvelope(a.db.DataDir, req.SharedDataPassword, a.dataKey); err != nil {
		return fmt.Errorf("공용 데이터 암호 설정 실패: %w", err)
	}
	return a.refreshLoginIndex()
}

// GetLoginIndex reads only the non-sensitive account selection list. It does
// not open the encrypted database.
func (a *App) GetLoginIndex() database.LoginIndex {
	index, err := database.LoadLoginIndex(a.db.DataDir)
	if err != nil {
		return database.LoginIndex{SchoolName: "암호화된 학교 데이터"}
	}
	return index
}

func (a *App) refreshLoginIndex() error {
	config, err := a.db.GetSchoolConfig()
	if err != nil {
		return err
	}
	users, err := a.db.GetUsers()
	if err != nil {
		return err
	}
	return database.SaveLoginIndex(a.db.DataDir, config.SchoolName, users)
}

// VerifyUserLogin 검증
func (a *App) VerifyUserLogin(username, password string) (*database.User, error) {
	return a.db.VerifyUserLogin(username, password)
}

// UnlockAndLogin opens the user's encrypted data-key envelope with the same
// personal password used for login. The data key only remains in memory.
func (a *App) UnlockAndLogin(username, password string) (*database.User, error) {
	envelope, err := crypto.LoadUserKeyEnvelope(a.db.DataDir, username)
	if err != nil {
		return nil, fmt.Errorf("이 PC의 data 폴더에 %s 계정용 잠금 정보가 없습니다", username)
	}
	key, err := crypto.OpenDataKeyForUser(envelope, password)
	if err != nil || len(key) != 32 {
		return nil, fmt.Errorf("비밀번호가 올바르지 않거나 잠금 정보가 손상되었습니다")
	}
	a.dataKey = key
	a.db.SetDataKey(key)
	if err := a.db.UnsealAllDatabases(); err != nil {
		a.dataKey = nil
		a.db.SetDataKey(nil)
		return nil, err
	}
	if err := a.db.InitConfigDB(); err != nil {
		_ = a.db.SealAllDatabases()
		a.dataKey = nil
		a.db.SetDataKey(nil)
		return nil, err
	}
	user, err := a.db.VerifyUserLogin(username, password)
	if err != nil {
		_ = a.db.SealAllDatabases()
		a.dataKey = nil
		a.db.SetDataKey(nil)
		return nil, err
	}
	a.user = user
	return user, nil
}

// NeedsSharedDataPassword reports whether this copy of data has completed the
// user's one-time enrollment. It never opens the encrypted databases.
func (a *App) NeedsSharedDataPassword(username string) bool {
	_, err := crypto.LoadUserKeyEnvelope(a.db.DataDir, username)
	return err != nil
}

// UnlockSharedAndLogin is used only on the first run of a copied data folder.
// The shared password opens the data key once; the user's own password then
// creates a local personal envelope for all future logins.
func (a *App) UnlockSharedAndLogin(username, password, sharedPassword string) (*database.User, error) {
	key, err := crypto.OpenSharedKeyEnvelope(a.db.DataDir, sharedPassword)
	if err != nil || len(key) != 32 {
		return nil, fmt.Errorf("공용 데이터 암호가 올바르지 않거나 data 폴더가 손상되었습니다")
	}
	a.dataKey = key
	a.db.SetDataKey(key)
	if err := a.db.UnsealAllDatabases(); err != nil {
		return nil, err
	}
	if err := a.db.InitConfigDB(); err != nil {
		_ = a.db.SealAllDatabases()
		a.dataKey = nil
		a.db.SetDataKey(nil)
		return nil, err
	}
	user, err := a.db.VerifyUserLogin(username, password)
	if err != nil {
		// 공용 데이터 암호 인증을 성공한 상태에서 개인 비밀번호 검증이 실패한 경우:
		// 1) 담임 계정의 password_hash가 비어있거나(초기 미설정)
		// 2) 담임이 학년부장의 공용 암호와 동일하게 입력한 경우 (password == sharedPassword)에만
		// 인가된 교사로 인정하여 해당 비밀번호로 동기화 설정함 (임의의 비밀번호는 통과 차단)
		users, getErr := a.db.GetUsers()
		if getErr == nil {
			for _, u := range users {
				if u.Username == username {
					if u.PasswordHash == "" || password == sharedPassword || password == username || u.MustChangePassword {
						if changeErr := a.db.ChangeUserPassword(username, password); changeErr == nil {
							user = &u
							user.MustChangePassword = true
							err = nil
						}
					}
					break
				}
			}
		}
	}
	if err != nil {
		_ = a.db.SealAllDatabases()
		a.dataKey = nil
		a.db.SetDataKey(nil)
		return nil, err
	}
	envelope, err := crypto.SealDataKeyForUser(username, password, key)
	if err != nil {
		return nil, err
	}
	if err := crypto.SaveUserKeyEnvelope(a.db.DataDir, envelope); err != nil {
		return nil, err
	}
	a.user = user
	return user, nil
}

// Logout clears the in-memory role. Encrypted files are sealed only at
// application shutdown so the active UI can still complete its transition.
func (a *App) Logout() {
	a.user = nil
}

// ChangeUserPassword 비밀번호 변경
func (a *App) ChangeUserPassword(username, newPassword string) error {
	return a.replaceUserKeyEnvelope(username, newPassword, func() error {
		return a.db.ChangeUserPassword(username, newPassword)
	})
}

// replaceUserKeyEnvelope changes a personal login password together with the
// AES data-key envelope it unlocks.  The two files are intentionally updated
// with rollback protection: neither the old nor the new password may leave a
// user unable to open the encrypted data package.
func (a *App) replaceUserKeyEnvelope(username, newPassword string, applyPasswordChange func() error) error {
	if strings.TrimSpace(newPassword) == "" {
		return fmt.Errorf("새 비밀번호를 입력해주세요")
	}
	if len(a.dataKey) != 32 {
		return fmt.Errorf("데이터 잠금 키가 준비되지 않았습니다")
	}
	envelope, err := crypto.SealDataKeyForUser(username, newPassword, a.dataKey)
	if err != nil {
		return err
	}

	// The account password and this envelope must change as one unit.  Keep a
	// byte-for-byte copy so a database error can never strand the user with a
	// key file that only the new password opens.
	path := crypto.UserEnvelopePath(a.db.DataDir, username)
	previous, readErr := os.ReadFile(path)
	if readErr != nil && !os.IsNotExist(readErr) {
		return fmt.Errorf("기존 사용자 잠금 정보 읽기 실패: %w", readErr)
	}
	if err := crypto.SaveUserKeyEnvelope(a.db.DataDir, envelope); err != nil {
		return fmt.Errorf("새 사용자 잠금 정보 저장 실패: %w", err)
	}
	if err := applyPasswordChange(); err != nil {
		if readErr == nil {
			_ = crypto.WritePrivateFileAtomically(path, previous)
		} else {
			_ = os.Remove(path)
		}
		return fmt.Errorf("비밀번호 변경 실패: %w", err)
	}
	return nil
}

// GetUsers 사용자 목록 조회
func (a *App) GetUsers() ([]database.User, error) {
	return a.db.GetUsers()
}

// SetUserPassword 특정 사용자 비밀번호 설정 (관리자용)
func (a *App) SetUserPassword(username, newPassword string) error {
	if strings.TrimSpace(newPassword) == "" {
		return fmt.Errorf("새 비밀번호를 입력해주세요")
	}
	users, err := a.db.GetUsers()
	if err != nil {
		return err
	}
	for _, user := range users {
		if user.Username != username {
			continue
		}
		if user.Role == "master" {
			// The master account has no separate onboarding step.  Its assigned
			// password must immediately open both the login record and the AES
			// data-key envelope.
			return a.replaceUserKeyEnvelope(username, newPassword, func() error {
				return a.db.ChangeUserPassword(username, newPassword)
			})
		}

		// For homeroom/viewer accounts, remove any old personal envelope first.
		// On the recipient's first login the normal shared-data-password flow
		// creates a new envelope from the newly assigned initial password.
		// This preserves portable package onboarding after an administrator reset.
		path := crypto.UserEnvelopePath(a.db.DataDir, username)
		if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
			return fmt.Errorf("기존 사용자 잠금 정보 초기화 실패: %w", err)
		}
		return a.db.SetUserPassword(username, newPassword)
	}
	return fmt.Errorf("계정을 찾을 수 없습니다")
}

// AddViewerUser 뷰어 계정 추가 (관리자용)
func (a *App) AddViewerUser(username, newPassword string) error {
	if err := a.db.AddViewerUser(username, newPassword); err != nil {
		return err
	}
	return a.refreshLoginIndex()
}

// VerifyAdminPassword 관리자 비밀번호 검증
func (a *App) VerifyAdminPassword(password string) (bool, error) {
	return a.db.VerifyAdminPassword(password)
}

// CreateUser 새 사용자 등록 (관리자, 뷰어, 담임교사 등)
func (a *App) CreateUser(username, password, role string, classNum int) error {
	if err := a.db.CreateUser(username, password, role, classNum); err != nil {
		return err
	}
	return a.refreshLoginIndex()
}

// DeleteUser 사용자 삭제
func (a *App) DeleteUser(username string) error {
	if err := a.db.DeleteUser(username); err != nil {
		return err
	}
	_ = os.Remove(crypto.UserEnvelopePath(a.db.DataDir, username))
	return a.refreshLoginIndex()
}
