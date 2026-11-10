package exchange

import (
	"archive/zip"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"PHGC/internal/crypto"
	"PHGC/internal/database"
)

type FinalArchiveManifest struct {
	Format        string   `json:"format"`
	SchoolName    string   `json:"schoolName"`
	AdmissionYear int      `json:"admissionYear"`
	CreatedAt     string   `json:"createdAt"`
	Files         []string `json:"files"`
}

func ExportFinalArchive(dm *database.DBManager, dataKey []byte, archivePassword, outputPath string) error {
	if len(dataKey) != 32 {
		return fmt.Errorf("학년부장 로그인 후에만 보관본을 만들 수 있습니다")
	}
	config, err := dm.GetSchoolConfig()
	if err != nil {
		return err
	}
	tmpDir, err := os.MkdirTemp("", "kkomi-archive-*")
	if err != nil {
		return err
	}
	defer os.RemoveAll(tmpDir)
	keyPassword := hex.EncodeToString(dataKey)
	files := []string{"config.db.kkomi", "shared-key.json", "login-index.json"}
	if err := snapshotAndEncryptDatabase(dm, dm.GetConfigDBPath(), filepath.Join(tmpDir, "config.db.kkomi"), keyPassword); err != nil {
		return err
	}
	for _, name := range []string{"shared-key.json", "login-index.json"} {
		if err := copyPackageFile(filepath.Join(dm.DataDir, name), filepath.Join(tmpDir, name)); err != nil {
			return err
		}
	}
	if _, err := os.Stat(crypto.ManifestPath(dm.DataDir)); err == nil {
		if err := copyPackageFile(crypto.ManifestPath(dm.DataDir), filepath.Join(tmpDir, "manifest.json")); err != nil {
			return err
		}
		files = append(files, "manifest.json")
	}
	for n := 1; n <= config.ClassCount; n++ {
		source := dm.GetClassDBPath(n)
		if _, err := os.Stat(source); os.IsNotExist(err) {
			continue
		} else if err != nil {
			return err
		}
		name := fmt.Sprintf("class_%d.db.kkomi", n)
		if err := snapshotAndEncryptDatabase(dm, source, filepath.Join(tmpDir, name), keyPassword); err != nil {
			return err
		}
		files = append(files, name)
	}
	keyEntries, _ := os.ReadDir(filepath.Join(dm.DataDir, "keys"))
	for _, entry := range keyEntries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".json" {
			continue
		}
		name := filepath.Join("keys", entry.Name())
		if err := os.MkdirAll(filepath.Join(tmpDir, "keys"), 0700); err != nil {
			return err
		}
		if err := copyPackageFile(filepath.Join(dm.DataDir, name), filepath.Join(tmpDir, name)); err != nil {
			return err
		}
		files = append(files, name)
	}
	archive := FinalArchiveManifest{Format: "KKOMI-FINAL-ARCHIVE-1", SchoolName: config.SchoolName, AdmissionYear: config.AdmissionYear, CreatedAt: time.Now().Format(time.RFC3339), Files: files}
	b, err := json.Marshal(archive)
	if err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(tmpDir, "archive.json"), b, 0600); err != nil {
		return err
	}
	zipPath := filepath.Join(tmpDir, "archive.zip")
	if err := writeDistributionZip(zipPath, tmpDir, append([]string{"archive.json"}, files...)); err != nil {
		return err
	}
	return crypto.EncryptFileGCM(archivePassword, zipPath, outputPath)
}

// ImportFinalArchive is intentionally permitted only into an empty program
// data folder, avoiding accidental overwrite of a live school's data.
func ImportFinalArchive(dm *database.DBManager, inputPath, archivePassword string) (string, error) {
	if strings.TrimSpace(archivePassword) == "" {
		return "", fmt.Errorf("보관본 암호를 입력해주세요")
	}
	if dm.HasEncryptedConfigDB() {
		return "", fmt.Errorf("기존 학교 자료가 있습니다. 새 프로그램 폴더에서 보관본을 복원하세요")
	}
	if _, err := os.Stat(dm.GetConfigDBPath()); err == nil {
		cfg, cfgErr := dm.GetSchoolConfig()
		if cfgErr != nil || cfg != nil {
			return "", fmt.Errorf("기존 학교 설정이 있습니다. 새 프로그램 폴더에서 보관본을 복원하세요")
		}
		crypto.RemovePlainDatabaseArtifacts(dm.GetConfigDBPath())
	}
	tmpDir, err := os.MkdirTemp("", "kkomi-restore-*")
	if err != nil {
		return "", err
	}
	defer os.RemoveAll(tmpDir)
	zipPath := filepath.Join(tmpDir, "archive.zip")
	if err := crypto.DecryptFileGCM(archivePassword, inputPath, zipPath); err != nil {
		return "", fmt.Errorf("보관본 암호가 올바르지 않거나 파일이 손상되었습니다")
	}
	reader, err := zip.OpenReader(zipPath)
	if err != nil {
		return "", err
	}
	defer reader.Close()
	entries := map[string]*zip.File{}
	for _, f := range reader.File {
		if strings.Contains(f.Name, "..") || filepath.IsAbs(f.Name) {
			return "", fmt.Errorf("허용되지 않은 보관 파일 경로입니다")
		}
		entries[f.Name] = f
	}
	meta := entries["archive.json"]
	if meta == nil {
		return "", fmt.Errorf("보관본 정보가 없습니다")
	}
	raw, err := readZipEntry(meta)
	if err != nil {
		return "", err
	}
	var archive FinalArchiveManifest
	if err := json.Unmarshal(raw, &archive); err != nil || (archive.Format != "KKOMI-FINAL-ARCHIVE-1" && archive.Format != "PHGC-FINAL-ARCHIVE-1") || archive.SchoolName == "" {
		return "", fmt.Errorf("지원하지 않는 보관본입니다")
	}
	for _, name := range archive.Files {
		f := entries[name]
		if f == nil {
			return "", fmt.Errorf("보관본에 %s 파일이 없습니다", name)
		}
		allowedDB := name == "config.db.kkomi" || name == "config.db.phgc" ||
			(strings.HasPrefix(name, "class_") && (strings.HasSuffix(name, ".db.kkomi") || strings.HasSuffix(name, ".db.phgc")))
		if !(allowedDB || name == "shared-key.json" || name == "login-index.json" || name == "manifest.json" || (strings.HasPrefix(name, "keys/") && filepath.Ext(name) == ".json")) {
			return "", fmt.Errorf("허용되지 않은 보관 파일입니다")
		}
		data, err := readZipEntry(f)
		if err != nil {
			return "", err
		}
		dest := filepath.Join(dm.DataDir, name)
		if err := os.MkdirAll(filepath.Dir(dest), 0700); err != nil {
			return "", err
		}
		if err := crypto.WritePrivateFileAtomically(dest, data); err != nil {
			return "", err
		}
	}
	return archive.SchoolName, nil
}
