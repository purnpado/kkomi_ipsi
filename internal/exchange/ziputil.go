package exchange

import (
	"archive/zip"
	"fmt"
	"io"
	"os"
	"path/filepath"

	"PHGC/internal/crypto"
	"PHGC/internal/database"
)

func snapshotDatabase(dm *database.DBManager, source, destination string) error {
	db, err := dm.OpenDB(source)
	if err != nil {
		return err
	}
	_, err = db.Exec("PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE")
	db.Close()
	if err != nil {
		return err
	}
	return copyPackageFile(source, destination)
}

func copyPackageFile(source, destination string) error {
	data, err := os.ReadFile(source)
	if err != nil {
		return err
	}
	return crypto.WritePrivateFileAtomically(destination, data)
}

func writeDistributionZip(outputPath, sourceDir string, names []string) error {
	tmp, err := os.CreateTemp(filepath.Dir(outputPath), ".kkomi-package-*.tmp")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	defer os.Remove(tmpPath)
	writer := zip.NewWriter(tmp)
	for _, name := range names {
		data, err := os.ReadFile(filepath.Join(sourceDir, name))
		if err != nil {
			writer.Close()
			tmp.Close()
			return err
		}
		entry, err := writer.Create(name)
		if err != nil {
			writer.Close()
			tmp.Close()
			return err
		}
		if _, err := entry.Write(data); err != nil {
			writer.Close()
			tmp.Close()
			return err
		}
	}
	if err := writer.Close(); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmpPath, outputPath)
}

func readZipEntry(file *zip.File) ([]byte, error) {
	reader, err := file.Open()
	if err != nil {
		return nil, err
	}
	defer reader.Close()
	return io.ReadAll(io.LimitReader(reader, 64<<20))
}

// snapshotClassForRecipient 학급 DB 사본에서 받는 사람이 쓰지 않은 상담 일지를 지우고 암호화한다.
// 상담 일지는 작성자 본인만 보는 자료이므로, 다른 교사가 쓴 기록은 화면에서 감추는 데 그치지 않고
// 파일에도 담지 않는다. 지운 내용이 빈 페이지에 남지 않도록 VACUUM 으로 정리한다.
func snapshotClassForRecipient(dm *database.DBManager, source, workDir, destination, password, recipient string) error {
	plain, err := os.CreateTemp(workDir, "class-*.db")
	if err != nil {
		return err
	}
	plainPath := plain.Name()
	plain.Close()
	defer os.Remove(plainPath)
	if err := snapshotDatabase(dm, source, plainPath); err != nil {
		return err
	}
	db, err := dm.OpenDB(plainPath)
	if err != nil {
		return err
	}
	var tables int
	err = db.QueryRow("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'student_counseling_records'").Scan(&tables)
	if err == nil && tables > 0 {
		_, err = db.Exec("DELETE FROM student_counseling_records WHERE IFNULL(author_username, '') <> ?", recipient)
	}
	if err == nil {
		_, err = db.Exec("VACUUM")
	}
	if err == nil {
		_, err = db.Exec("PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE")
	}
	db.Close()
	if err != nil {
		return fmt.Errorf("배포용 상담 일지 정리 실패: %w", err)
	}
	return crypto.EncryptFileGCM(password, plainPath, destination)
}
