package database

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

// resolveDataDir keeps existing portable installations unchanged, except that
// macOS app bundles use the directory containing the .app as their base.
func resolveDataDir(exePath, goos string) string {
	exeDir := filepath.Dir(exePath)
	legacy := filepath.Join(exeDir, "data")
	if goos != "darwin" || filepath.Base(exeDir) != "MacOS" || filepath.Base(filepath.Dir(exeDir)) != "Contents" {
		return legacy
	}
	appDir := filepath.Dir(filepath.Dir(exeDir))
	if !strings.HasSuffix(strings.ToLower(filepath.Base(appDir)), ".app") {
		return legacy
	}
	dest := filepath.Join(filepath.Dir(appDir), "data")
	if _, err := os.Stat(dest); err == nil || !os.IsNotExist(err) {
		return dest
	}
	if _, err := os.Stat(legacy); os.IsNotExist(err) {
		return dest
	} else if err != nil {
		return legacy
	}
	if err := copyLegacyData(legacy, dest); err != nil {
		fmt.Fprintf(os.Stderr, "기존 데이터 복사 실패, 원래 위치 사용: %v\n", err)
		return legacy
	}
	return dest
}

// Copy into a temporary sibling and publish only a complete copy; the original
// remains untouched so a failed or interrupted copy cannot lose user data.
func copyLegacyData(src, dest string) error {
	stage, err := os.MkdirTemp(filepath.Dir(dest), ".kkomi-data-copy-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(stage)
	err = filepath.WalkDir(src, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		rel, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		target := filepath.Join(stage, rel)
		info, err := entry.Info()
		if err != nil {
			return err
		}
		if entry.IsDir() {
			return os.MkdirAll(target, info.Mode().Perm())
		}
		if !info.Mode().IsRegular() {
			return fmt.Errorf("지원하지 않는 데이터 파일: %s", path)
		}
		in, err := os.Open(path)
		if err != nil {
			return err
		}
		defer in.Close()
		out, err := os.OpenFile(target, os.O_CREATE|os.O_EXCL|os.O_WRONLY, info.Mode().Perm())
		if err != nil {
			return err
		}
		_, copyErr := io.Copy(out, in)
		closeErr := out.Close()
		if copyErr != nil {
			return copyErr
		}
		return closeErr
	})
	if err != nil {
		return err
	}
	if _, err = os.Lstat(dest); err == nil {
		return fmt.Errorf("대상 데이터 폴더가 이미 있습니다: %s", dest)
	} else if !os.IsNotExist(err) {
		return err
	}
	return os.Rename(stage, dest)
}
