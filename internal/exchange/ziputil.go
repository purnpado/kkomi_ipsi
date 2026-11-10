package exchange

import (
	"archive/zip"
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

func snapshotAndEncryptDatabase(dm *database.DBManager, source, destination, password string) error {
	db, err := dm.OpenDB(source)
	if err != nil {
		return err
	}
	_, err = db.Exec("PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE")
	db.Close()
	if err != nil {
		return err
	}
	return crypto.EncryptFileGCM(password, source, destination)
}

func copyPackageFile(source, destination string) error {
	data, err := os.ReadFile(source)
	if err != nil {
		return err
	}
	return crypto.WritePrivateFileAtomically(destination, data)
}

func writeDistributionZip(outputPath, sourceDir string, names []string) error {
	tmp, err := os.CreateTemp(filepath.Dir(outputPath), ".phgc-package-*.tmp")
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
