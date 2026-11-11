package exchange

import (
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"

	"PHGC/internal/crypto"
	"PHGC/internal/database"
)

// ExportPasswordResetPackage creates a small encrypted recovery file for a
// non-master account.  It contains the updated encrypted config DB only, not
// any class/student DB.  The recipient imports it from the login screen.
func ExportPasswordResetPackage(dm *database.DBManager, dataKey []byte, username, outputPath string) error {
	if username == "" || outputPath == "" {
		return fmt.Errorf("재설정할 계정과 저장 위치가 필요합니다")
	}
	if len(dataKey) != 32 {
		return fmt.Errorf("데이터 잠금을 먼저 해제해주세요")
	}
	users, err := dm.GetUsers()
	if err != nil {
		return err
	}
	found := false
	for _, user := range users {
		if user.Username == username {
			if user.Role == "master" {
				return fmt.Errorf("학년부장 계정은 재설정 파일이 필요하지 않습니다")
			}
			found = true
			break
		}
	}
	if !found {
		return fmt.Errorf("계정을 찾을 수 없습니다")
	}

	// Ensure the password hash update is in the SQLite main file before taking
	// a snapshot, without sealing or interrupting the running administrator app.
	db, err := dm.OpenDB(dm.GetConfigDBPath())
	if err != nil {
		return err
	}
	if _, err = db.Exec("PRAGMA wal_checkpoint(TRUNCATE)"); err != nil {
		db.Close()
		return fmt.Errorf("재설정 정보 준비 실패: %w", err)
	}
	db.Close()

	tmp, err := os.CreateTemp(dm.DataDir, ".password-reset-config-*.kkomi")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	if err := tmp.Close(); err != nil {
		os.Remove(tmpPath)
		return err
	}
	defer os.Remove(tmpPath)
	if err := crypto.EncryptFileGCM(hex.EncodeToString(dataKey), dm.GetConfigDBPath(), tmpPath); err != nil {
		return fmt.Errorf("재설정 정보 암호화 실패: %w", err)
	}
	encryptedConfig, err := os.ReadFile(tmpPath)
	if err != nil {
		return err
	}
	payload, err := json.Marshal(crypto.PasswordResetPackage{
		Format:         "KKOMI-PASSWORD-RESET-1",
		Username:       username,
		ConfigDatabase: encryptedConfig,
	})
	if err != nil {
		return err
	}
	if err := crypto.WritePrivateFileAtomically(outputPath, payload); err != nil {
		return fmt.Errorf("재설정 파일 저장 실패: %w", err)
	}
	return nil
}

// ImportPasswordResetPackage installs a teacher-specific encrypted config
// snapshot and removes only that account's local key envelope.  The next
// login uses the existing shared-data password once and creates a fresh
// personal envelope using the newly assigned initial password.
func ImportPasswordResetPackage(dm *database.DBManager, inputPath string) (string, error) {
	if inputPath == "" {
		return "", fmt.Errorf("재설정 파일을 선택해주세요")
	}
	payload, err := os.ReadFile(inputPath)
	if err != nil {
		return "", err
	}
	var reset crypto.PasswordResetPackage
	if err := json.Unmarshal(payload, &reset); err != nil {
		return "", fmt.Errorf("재설정 파일 형식이 올바르지 않습니다")
	}
	if (reset.Format != "KKOMI-PASSWORD-RESET-1" && reset.Format != "PHGC-PASSWORD-RESET-1") || reset.Username == "" || len(reset.ConfigDatabase) == 0 {
		return "", fmt.Errorf("재설정 파일 정보가 올바르지 않습니다")
	}
	if reset.Username == "admin" {
		return "", fmt.Errorf("학년부장 계정에는 이 재설정 파일을 사용할 수 없습니다")
	}
	plainConfig := dm.GetConfigDBPath()
	if _, err := os.Stat(plainConfig); err == nil {
		return "", fmt.Errorf("프로그램의 이전 작업 DB가 남아 있습니다. 프로그램을 완전히 종료한 뒤 다시 실행해주세요")
	} else if !os.IsNotExist(err) {
		return "", err
	}
	if err := crypto.WritePrivateFileAtomically(plainConfig+".kkomi", reset.ConfigDatabase); err != nil {
		return "", fmt.Errorf("재설정 정보 적용 실패: %w", err)
	}
	crypto.BackupLegacyFile(plainConfig + ".phgc")
	if err := os.Remove(crypto.UserEnvelopePath(dm.DataDir, reset.Username)); err != nil && !os.IsNotExist(err) {
		return "", fmt.Errorf("기존 개인 잠금 정보 초기화 실패: %w", err)
	}
	return reset.Username, nil
}
