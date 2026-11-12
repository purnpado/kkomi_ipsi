package sync

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestParseSHA256Sums(t *testing.T) {
	sums := ParseSHA256Sums("2838f14ec43d2fd15c42e86e02062ec16c7c1bcadfc11abed8e00257e749c9f5  kkomi-ipsi.exe\nbad line\nC954003684ACC8252CEFEDD96D8E26F62590AF64E9B721D2331D1F00D0394E17 *꼬미입시 v1.zip\n")
	if sums["kkomi-ipsi.exe"] != "2838f14ec43d2fd15c42e86e02062ec16c7c1bcadfc11abed8e00257e749c9f5" || sums["꼬미입시 v1.zip"] == "" || len(sums) != 2 {
		t.Fatalf("지문값 읽기: %v", sums)
	}
}

func sha(b []byte) string { h := sha256.Sum256(b); return hex.EncodeToString(h[:]) }

func TestFindUpdateAndDownloadVerified(t *testing.T) {
	exe := []byte("MZ new kkomi exe")
	var srv *httptest.Server
	srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/release":
			fmt.Fprintf(w, `{"tag_name":"v9.9.9","assets":[{"name":"kkomi-ipsi.exe","browser_download_url":"%[1]s/exe"},{"name":"SHA256SUMS.txt","browser_download_url":"%[1]s/sums"}]}`, srv.URL)
		case "/exe":
			w.Write(exe)
		case "/sums":
			fmt.Fprintf(w, "%s  kkomi-ipsi.exe\n", sha(exe))
		}
	}))
	defer srv.Close()
	asset, err := findUpdateIn(srv.Client(), srv.URL+"/release", "테스트")
	if err != nil {
		t.Fatal(err)
	}
	if asset.Version != "9.9.9" || asset.ExeName != "kkomi-ipsi.exe" || asset.ExpectedSHA256 != sha(exe) {
		t.Fatalf("업데이트 정보: %+v", asset)
	}
	dest := filepath.Join(t.TempDir(), "꼬미입시.exe.download")
	if err := DownloadVerified(srv.Client(), asset.ExeURL, asset.ExpectedSHA256, dest); err != nil {
		t.Fatal(err)
	}
	// 지문값이 다르면 파일을 지우고 멈춘다.
	if err := DownloadVerified(srv.Client(), asset.ExeURL, sha([]byte("other")), dest); err == nil || !strings.Contains(err.Error(), "지문값") {
		t.Fatalf("지문값 불일치를 잡지 못함: %v", err)
	}
	if _, err := os.Stat(dest); !os.IsNotExist(err) {
		t.Fatal("지문값이 다른 파일이 남아 있음")
	}
}

func TestFindUpdateRequiresChecksumFile(t *testing.T) {
	var srv *httptest.Server
	srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, `{"tag_name":"v9.9.9","assets":[{"name":"kkomi-ipsi.exe","browser_download_url":"%s/exe"}]}`, srv.URL)
	}))
	defer srv.Close()
	if _, err := findUpdateIn(srv.Client(), srv.URL, "테스트"); err == nil || !strings.Contains(err.Error(), "SHA256SUMS") {
		t.Fatalf("지문값 파일이 없는데 진행함: %v", err)
	}
}

func TestReplaceExecutableAndCleanup(t *testing.T) {
	dir := t.TempDir()
	current := filepath.Join(dir, "PHGC.exe") // 예전 이름으로 실행 중
	os.WriteFile(current, []byte("old"), 0o755)
	os.WriteFile(filepath.Join(dir, "꼬미입시.exe"), []byte("stray"), 0o755)
	dl := filepath.Join(dir, "꼬미입시.exe.download")
	os.WriteFile(dl, []byte("new"), 0o755)
	target, err := ReplaceExecutable(current, dl)
	if err != nil {
		t.Fatal(err)
	}
	if filepath.Base(target) != "꼬미입시.exe" {
		t.Fatalf("새 실행 파일 이름: %s", target)
	}
	if b, _ := os.ReadFile(target); string(b) != "new" {
		t.Fatalf("새 파일 내용: %s", b)
	}
	if _, err := os.Stat(current + ".old"); err != nil {
		t.Fatal("원래 실행 파일 .old가 없음")
	}
	CleanupOldExecutables(target)
	left, _ := filepath.Glob(filepath.Join(dir, "*.old"))
	if len(left) != 0 {
		t.Fatalf(".old 파일이 남음: %v", left)
	}
	// 새 파일을 넣지 못하면 원래대로 되돌린다.
	cur2 := filepath.Join(dir, "꼬미입시.exe")
	if _, err := ReplaceExecutable(cur2, filepath.Join(dir, "없는파일")); err == nil {
		t.Fatal("없는 파일로 교체가 성공함")
	}
	if b, _ := os.ReadFile(cur2); string(b) != "new" {
		t.Fatal("실패 후 원래 실행 파일이 되돌아오지 않음")
	}
}

func TestBackupEncryptedDataSkipsPlainDB(t *testing.T) {
	data := t.TempDir()
	os.WriteFile(filepath.Join(data, "config.db"), []byte("plain"), 0o600)
	os.WriteFile(filepath.Join(data, "config.db.kkomi"), []byte("enc"), 0o600)
	os.MkdirAll(filepath.Join(data, "keys"), 0o700)
	os.WriteFile(filepath.Join(data, "keys", "admin.json"), []byte("{}"), 0o600)
	os.MkdirAll(filepath.Join(data, "backup_new_year"), 0o700)
	os.WriteFile(filepath.Join(data, "backup_new_year", "old.db.kkomi"), []byte("x"), 0o600)
	dst, err := BackupEncryptedData(data, t.TempDir(), "v1.6.6")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(dst, "config.db.kkomi")); err != nil {
		t.Fatal("암호화 파일이 백업되지 않음")
	}
	if _, err := os.Stat(filepath.Join(dst, "keys", "admin.json")); err != nil {
		t.Fatal("열쇠 파일이 백업되지 않음")
	}
	if _, err := os.Stat(filepath.Join(dst, "config.db")); !os.IsNotExist(err) {
		t.Fatal("평문 DB가 백업됨")
	}
	if _, err := os.Stat(filepath.Join(dst, "backup_new_year")); !os.IsNotExist(err) {
		t.Fatal("이전 백업 폴더까지 복사됨")
	}
}
