package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

// UserKeyEnvelope lets a teacher unlock the shared package with a personal
// password after completing the one-time shared-password onboarding.
type UserKeyEnvelope struct {
	Username string `json:"username"`
	Salt     []byte `json:"salt"`
	Nonce    []byte `json:"nonce"`
	Data     []byte `json:"data"`
}

// PasswordResetPackage contains only the encrypted account/configuration
// snapshot needed to reset a teacher's local login.  It intentionally never
// contains a class database or plaintext student information.
type PasswordResetPackage struct {
	Format         string `json:"format"`
	Username       string `json:"username"`
	ConfigDatabase []byte `json:"configDatabase"`
}

func SealDataKeyForUser(username, personalPassword string, dataKey []byte) (UserKeyEnvelope, error) {
	salt, nonce := make([]byte, 16), make([]byte, 12)
	if _, err := io.ReadFull(rand.Reader, salt); err != nil {
		return UserKeyEnvelope{}, err
	}
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return UserKeyEnvelope{}, err
	}
	block, err := aes.NewCipher(deriveDataKey(personalPassword, salt))
	if err != nil {
		return UserKeyEnvelope{}, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return UserKeyEnvelope{}, err
	}
	data := gcm.Seal(nil, nonce, dataKey, []byte(username))
	return UserKeyEnvelope{Username: username, Salt: salt, Nonce: nonce, Data: data}, nil
}

func OpenDataKeyForUser(envelope UserKeyEnvelope, personalPassword string) ([]byte, error) {
	block, err := aes.NewCipher(deriveDataKey(personalPassword, envelope.Salt))
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return gcm.Open(nil, envelope.Nonce, envelope.Data, []byte(envelope.Username))
}

func UserEnvelopePath(dataDir, username string) string {
	return filepath.Join(dataDir, "keys", username+".json")
}

func SharedEnvelopePath(dataDir string) string { return filepath.Join(dataDir, "shared-key.json") }

func SaveSharedKeyEnvelope(dataDir, sharedPassword string, dataKey []byte) error {
	envelope, err := SealDataKeyForUser("shared-data", sharedPassword, dataKey)
	if err != nil {
		return err
	}
	data, err := json.Marshal(envelope)
	if err != nil {
		return err
	}
	return os.WriteFile(SharedEnvelopePath(dataDir), data, 0600)
}

func OpenSharedKeyEnvelope(dataDir, sharedPassword string) ([]byte, error) {
	data, err := os.ReadFile(SharedEnvelopePath(dataDir))
	if err != nil {
		return nil, err
	}
	var envelope UserKeyEnvelope
	if err := json.Unmarshal(data, &envelope); err != nil {
		return nil, err
	}
	if envelope.Username != "shared-data" {
		return nil, fmt.Errorf("공용 데이터 잠금 정보가 올바르지 않습니다")
	}
	return OpenDataKeyForUser(envelope, sharedPassword)
}

func SaveUserKeyEnvelope(dataDir string, envelope UserKeyEnvelope) error {
	if envelope.Username == "" {
		return fmt.Errorf("사용자명이 없습니다")
	}
	if err := os.MkdirAll(filepath.Dir(UserEnvelopePath(dataDir, envelope.Username)), 0700); err != nil {
		return err
	}
	data, err := json.Marshal(envelope)
	if err != nil {
		return err
	}
	return WritePrivateFileAtomically(UserEnvelopePath(dataDir, envelope.Username), data)
}

func LoadUserKeyEnvelope(dataDir, username string) (UserKeyEnvelope, error) {
	data, err := os.ReadFile(UserEnvelopePath(dataDir, username))
	if err != nil {
		return UserKeyEnvelope{}, err
	}
	var envelope UserKeyEnvelope
	if err := json.Unmarshal(data, &envelope); err != nil {
		return UserKeyEnvelope{}, err
	}
	if envelope.Username != username {
		return UserKeyEnvelope{}, fmt.Errorf("사용자 잠금 정보가 일치하지 않습니다")
	}
	return envelope, nil
}
