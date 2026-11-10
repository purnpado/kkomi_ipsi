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

	"PHGC/internal/model"
	"golang.org/x/crypto/argon2"
)

const (
	encryptedFileMagic       = "KKOMI-GCM-1"
	legacyEncryptedFileMagic = "PHGC-GCM-1"
)

type encryptedFileHeader struct {
	Magic string `json:"magic"`
	Salt  []byte `json:"salt"`
	Nonce []byte `json:"nonce"`
}

// WritePrivateFileAtomically prevents a password change from leaving a
// half-written key envelope behind if the program is closed or the computer
// loses power during the write.
func WritePrivateFileAtomically(path string, data []byte) error {
	tmp, err := os.CreateTemp(filepath.Dir(path), ".tmp-*")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	defer os.Remove(tmpPath)
	if err := tmp.Chmod(0600); err != nil {
		tmp.Close()
		return err
	}
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmpPath, path)
}

func ManifestPath(dataDir string) string { return filepath.Join(dataDir, "manifest.json") }

func deriveDataKey(password string, salt []byte) []byte {
	return argon2.IDKey([]byte(password), salt, 3, 64*1024, 4, 32)
}

func NewDataKey() ([]byte, error) {
	key := make([]byte, 32)
	if _, err := io.ReadFull(rand.Reader, key); err != nil {
		return nil, err
	}
	return key, nil
}

func EncryptFileGCM(password, sourcePath, encryptedPath string) error {
	plain, err := os.ReadFile(sourcePath)
	if err != nil {
		return err
	}
	salt, nonce := make([]byte, 16), make([]byte, 12)
	if _, err := io.ReadFull(rand.Reader, salt); err != nil {
		return err
	}
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return err
	}
	block, err := aes.NewCipher(deriveDataKey(password, salt))
	if err != nil {
		return err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return err
	}
	header, err := json.Marshal(encryptedFileHeader{Magic: encryptedFileMagic, Salt: salt, Nonce: nonce})
	if err != nil {
		return err
	}
	ciphertext := gcm.Seal(nil, nonce, plain, header)
	return os.WriteFile(encryptedPath, append(append(header, '\n'), ciphertext...), 0600)
}

func DecryptFileGCM(password, encryptedPath, destinationPath string) error {
	payload, err := os.ReadFile(encryptedPath)
	if err != nil {
		return err
	}
	var header encryptedFileHeader
	separator := 0
	for separator < len(payload) && payload[separator] != '\n' {
		separator++
	}
	if separator == len(payload) {
		return fmt.Errorf("암호화 파일 형식이 올바르지 않습니다")
	}
	head := payload[:separator]
	if err := json.Unmarshal(head, &header); err != nil || (header.Magic != encryptedFileMagic && header.Magic != legacyEncryptedFileMagic) {
		return fmt.Errorf("암호화 파일 형식이 올바르지 않습니다")
	}
	block, err := aes.NewCipher(deriveDataKey(password, header.Salt))
	if err != nil {
		return err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return err
	}
	plain, err := gcm.Open(nil, header.Nonce, payload[separator+1:], head)
	if err != nil {
		return fmt.Errorf("데이터 잠금 비밀번호가 올바르지 않거나 파일이 손상되었습니다")
	}
	return os.WriteFile(destinationPath, plain, 0600)
}

func EncryptPatchGCM(password string, patch model.PatchFile, path string) error {
	plain, err := json.Marshal(patch)
	if err != nil {
		return err
	}
	temporary := path + ".plain"
	if err := os.WriteFile(temporary, plain, 0600); err != nil {
		return err
	}
	defer os.Remove(temporary)
	return EncryptFileGCM(password, temporary, path)
}

func DecryptPatchGCM(password, path string) (model.PatchFile, error) {
	temporary := path + ".plain"
	defer os.Remove(temporary)
	if err := DecryptFileGCM(password, path, temporary); err != nil {
		return model.PatchFile{}, err
	}
	plain, err := os.ReadFile(temporary)
	if err != nil {
		return model.PatchFile{}, err
	}
	var patch model.PatchFile
	if err := json.Unmarshal(plain, &patch); err != nil {
		return model.PatchFile{}, err
	}
	return patch, nil
}

// SealDatabaseFile replaces a plaintext SQLite file with an AES-256-GCM
// package. The plaintext is removed only after the encrypted file is written.
func SealDatabaseFile(password, dbPath string) (string, error) {
	encryptedPath := dbPath + ".kkomi"
	if err := EncryptFileGCM(password, dbPath, encryptedPath); err != nil {
		return "", err
	}
	if err := os.Remove(dbPath); err != nil {
		return "", err
	}
	// 구버전 .phgc 암호화 파일이 남아 있다면 .kkomi 생성 완료 후 자동 정리
	_ = os.Remove(dbPath + ".phgc")
	return encryptedPath, nil
}

// UnsealDatabaseFile restores a database only to the caller-specified working
// path; it never overwrites an existing encrypted package.
func UnsealDatabaseFile(password, encryptedPath, workingPath string) error {
	if _, err := os.Stat(workingPath); err == nil {
		return fmt.Errorf("평문 작업 DB가 이미 존재합니다")
	}
	return DecryptFileGCM(password, encryptedPath, workingPath)
}

func RemovePlainDatabaseArtifacts(dbPath string) {
	for _, suffix := range []string{"", "-wal", "-shm"} {
		_ = os.Remove(dbPath + suffix)
	}
}
