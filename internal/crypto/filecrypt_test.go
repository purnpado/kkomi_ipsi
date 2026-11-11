package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// writeLegacyEncryptedFile 은 v1.6.2(PHGC) 시절과 같은 헤더(PHGC-GCM-1)로 파일을 암호화한다.
func writeLegacyEncryptedFile(t *testing.T, password string, plain []byte, path string) {
	t.Helper()
	salt, nonce := make([]byte, 16), make([]byte, 12)
	for i := range salt {
		salt[i] = byte(i + 1)
	}
	for i := range nonce {
		nonce[i] = byte(i + 7)
	}
	block, err := aes.NewCipher(deriveDataKey(password, salt))
	if err != nil {
		t.Fatal(err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		t.Fatal(err)
	}
	header, err := json.Marshal(encryptedFileHeader{Magic: legacyEncryptedFileMagic, Salt: salt, Nonce: nonce})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, append(append(header, '\n'), gcm.Seal(nil, nonce, plain, header)...), 0600); err != nil {
		t.Fatal(err)
	}
}

func TestDecryptLegacyPHGCHeader(t *testing.T) {
	dir := t.TempDir()
	legacy := filepath.Join(dir, "config.db.phgc")
	writeLegacyEncryptedFile(t, "legacy-key", []byte("구버전 평문"), legacy)

	out := filepath.Join(dir, "config.db")
	if err := DecryptFileGCM("legacy-key", legacy, out); err != nil {
		t.Fatalf("구버전 헤더 복호화 실패: %v", err)
	}
	if got, _ := os.ReadFile(out); string(got) != "구버전 평문" {
		t.Fatalf("복호화 내용 불일치: %q", got)
	}
	if err := DecryptFileGCM("wrong-key", legacy, filepath.Join(dir, "x.db")); err == nil {
		t.Fatal("잘못된 암호로 구버전 파일이 열리면 안 됩니다")
	}
}

func TestBackupLegacyFileKeepsOriginal(t *testing.T) {
	dir := t.TempDir()
	legacy := filepath.Join(dir, "class_1.db.phgc")
	if err := os.WriteFile(legacy, []byte("first"), 0600); err != nil {
		t.Fatal(err)
	}
	BackupLegacyFile(legacy)
	if _, err := os.Stat(legacy); !os.IsNotExist(err) {
		t.Fatal("원래 위치의 .phgc 파일은 백업 폴더로 옮겨져야 합니다")
	}
	backup := filepath.Join(dir, LegacyBackupDirName, "class_1.db.phgc")
	if got, _ := os.ReadFile(backup); string(got) != "first" {
		t.Fatalf("백업 내용 불일치: %q", got)
	}

	// 같은 이름이 다시 생겨도 최초 백업을 덮어쓰지 않는다.
	if err := os.WriteFile(legacy, []byte("second"), 0600); err != nil {
		t.Fatal(err)
	}
	BackupLegacyFile(legacy)
	if got, _ := os.ReadFile(backup); string(got) != "first" {
		t.Fatal("최초 백업이 덮어써지면 안 됩니다")
	}
	entries, _ := os.ReadDir(filepath.Join(dir, LegacyBackupDirName))
	if len(entries) != 2 {
		t.Fatalf("두 번째 백업은 별도 이름으로 보관되어야 합니다: %d개", len(entries))
	}

	// 없는 파일은 아무 일도 하지 않는다.
	BackupLegacyFile(filepath.Join(dir, "none.db.phgc"))
}
