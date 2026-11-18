package database

import (
	"os"
	"path/filepath"
	"testing"
)

func TestMacBundleDataLocationAndMigration(t *testing.T) {
	root := t.TempDir()
	exe := filepath.Join(root, "꼬미입시.app", "Contents", "MacOS", "kkomi-ipsi")
	legacy := filepath.Join(filepath.Dir(exe), "data")
	dest := filepath.Join(root, "data")
	if err := os.MkdirAll(filepath.Join(legacy, "keys"), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(legacy, "keys", "test.json"), []byte("original"), 0600); err != nil {
		t.Fatal(err)
	}
	if got := resolveDataDir(exe, "darwin"); got != dest {
		t.Fatalf("got %s, want %s", got, dest)
	}
	for _, dir := range []string{legacy, dest} {
		b, err := os.ReadFile(filepath.Join(dir, "keys", "test.json"))
		if err != nil || string(b) != "original" {
			t.Fatalf("%s: %q %v", dir, b, err)
		}
	}
	if err := os.WriteFile(filepath.Join(dest, "keys", "test.json"), []byte("new"), 0600); err != nil {
		t.Fatal(err)
	}
	resolveDataDir(exe, "darwin")
	b, err := os.ReadFile(filepath.Join(dest, "keys", "test.json"))
	if err != nil || string(b) != "new" {
		t.Fatalf("existing destination overwritten: %q %v", b, err)
	}
}

func TestDataLocationDoesNotChangeNonBundle(t *testing.T) {
	exe := filepath.Join(t.TempDir(), "app")
	want := filepath.Join(filepath.Dir(exe), "data")
	for _, goos := range []string{"darwin", "windows", "linux"} {
		if got := resolveDataDir(exe, goos); got != want {
			t.Errorf("%s: got %s want %s", goos, got, want)
		}
	}
}

func TestMigrationFailureKeepsOriginal(t *testing.T) {
	root := t.TempDir()
	exe := filepath.Join(root, "x.app", "Contents", "MacOS", "x")
	legacy := filepath.Join(filepath.Dir(exe), "data")
	if err := os.MkdirAll(legacy, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink("target", filepath.Join(legacy, "link")); err != nil {
		t.Fatal(err)
	}
	if got := resolveDataDir(exe, "darwin"); got != legacy {
		t.Fatalf("failed migration must use original, got %s", got)
	}
	if _, err := os.Lstat(filepath.Join(legacy, "link")); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(root, "data")); !os.IsNotExist(err) {
		t.Fatalf("partial destination: %v", err)
	}
}
