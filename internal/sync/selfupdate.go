package sync

import (
	"bufio"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// 프로그램 안 자동 업데이트(윈도우).
//   1) GitHub 최신 릴리즈에서 실행 파일과 SHA256SUMS.txt(지문값)를 찾는다(학교망에서 막히면 Gitea).
//   2) 실행 파일 옆에 내려받고 지문값을 대조한다. 다르면 지우고 멈춘다.
//   3) 학생 자료를 봉인(암호화 저장)한 뒤 암호화된 data 파일만 "업데이트전_백업"에 복사한다.
//   4) 지금 실행 파일을 .old로 바꾸고 새 파일을 항상 "꼬미입시.exe"로 넣는다(윈도우는 실행 중인 파일의 이름 바꾸기를 허용).
//   5) 새 프로그램을 띄우고 지금 프로그램을 끝낸다. 다음 실행 때 .old 파일을 지운다.
// 학생·학교 자료는 어떤 단계에서도 밖으로 보내지 않는다(내려받기만 한다).

// UpdateExecutableName 업데이트 후 실행 파일 이름(사용자 결정: 꼬미입시.exe)
const UpdateExecutableName = "꼬미입시.exe"

// maxUpdateSize 내려받을 실행 파일의 최대 크기(잘못된 파일로 디스크를 채우지 않도록)
const maxUpdateSize = 200 << 20

// UpdateAsset 내려받을 새 버전 정보
type UpdateAsset struct {
	Version        string
	ExeURL         string
	ExeName        string
	ExpectedSHA256 string
	Source         string // GitHub · Gitea
}

type releaseJSON struct {
	TagName string `json:"tag_name"`
	Assets  []struct {
		Name string `json:"name"`
		URL  string `json:"browser_download_url"`
	} `json:"assets"`
}

// ParseSHA256Sums "지문값  파일이름" 줄들을 파일이름 → 지문값으로 바꾼다.
func ParseSHA256Sums(text string) map[string]string {
	out := map[string]string{}
	sc := bufio.NewScanner(strings.NewReader(text))
	for sc.Scan() {
		fields := strings.Fields(sc.Text())
		if len(fields) < 2 || len(fields[0]) != 64 {
			continue
		}
		name := strings.TrimPrefix(strings.Join(fields[1:], " "), "*")
		out[name] = strings.ToLower(fields[0])
	}
	return out
}

func getWithAgent(client *http.Client, url string) (*http.Response, error) {
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "kkomi-ipsi-updater")
	return client.Do(req)
}

// findUpdateIn 릴리즈 API 한 곳에서 실행 파일과 지문값을 찾는다.
func findUpdateIn(client *http.Client, apiURL, source string) (*UpdateAsset, error) {
	resp, err := getWithAgent(client, apiURL)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%s 릴리즈 조회 실패(%d)", source, resp.StatusCode)
	}
	var rel releaseJSON
	if err := json.NewDecoder(io.LimitReader(resp.Body, 4<<20)).Decode(&rel); err != nil || rel.TagName == "" {
		return nil, fmt.Errorf("%s 릴리즈 정보를 읽지 못했습니다", source)
	}
	assets := make([]ReleaseAsset, 0, len(rel.Assets))
	sumsURL := ""
	for _, a := range rel.Assets {
		assets = append(assets, ReleaseAsset{Name: a.Name, URL: a.URL})
		if strings.EqualFold(a.Name, "SHA256SUMS.txt") {
			sumsURL = a.URL
		}
	}
	exeURL := PickDownloadAsset(assets)
	exeName := ""
	for _, a := range assets {
		if a.URL == exeURL {
			exeName = a.Name
		}
	}
	if exeURL == "" {
		return nil, fmt.Errorf("%s 릴리즈에 실행 파일이 없습니다", source)
	}
	if sumsURL == "" {
		return nil, fmt.Errorf("%s 릴리즈에 지문값 파일(SHA256SUMS.txt)이 없어 안전하게 업데이트할 수 없습니다", source)
	}
	sresp, err := getWithAgent(client, sumsURL)
	if err != nil {
		return nil, err
	}
	defer sresp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(sresp.Body, 64<<10))
	if err != nil || sresp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("지문값 파일을 받지 못했습니다")
	}
	sum := ParseSHA256Sums(string(body))[exeName]
	if sum == "" {
		return nil, fmt.Errorf("지문값 파일에 %s 항목이 없습니다", exeName)
	}
	return &UpdateAsset{Version: strings.TrimPrefix(strings.TrimSpace(rel.TagName), "v"), ExeURL: exeURL, ExeName: exeName, ExpectedSHA256: sum, Source: source}, nil
}

// FindUpdate GitHub, 안 되면 Gitea에서 새 버전을 찾는다.
func FindUpdate() (*UpdateAsset, error) {
	client := &http.Client{Timeout: 15 * time.Second}
	asset, err := findUpdateIn(client, GitHubReleasesAPI, "GitHub")
	if err == nil {
		return asset, nil
	}
	if g, gerr := findUpdateIn(client, "https://gitea.gguk.link/api/v1/repos/purnpadosori/PHGC-OFFLINE/releases/latest", "Gitea"); gerr == nil {
		return g, nil
	}
	return nil, err
}

// DownloadVerified 실행 파일을 dest에 내려받고 지문값이 맞는지 확인한다. 다르면 파일을 지운다.
func DownloadVerified(client *http.Client, url, expectedSHA256, dest string) error {
	resp, err := getWithAgent(client, url)
	if err != nil {
		return fmt.Errorf("새 버전을 내려받지 못했습니다: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("새 버전을 내려받지 못했습니다(%d)", resp.StatusCode)
	}
	f, err := os.OpenFile(dest, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o755)
	if err != nil {
		return fmt.Errorf("프로그램 폴더에 파일을 쓸 수 없습니다(권한 확인): %w", err)
	}
	h := sha256.New()
	n, err := io.Copy(io.MultiWriter(f, h), io.LimitReader(resp.Body, maxUpdateSize+1))
	closeErr := f.Close()
	if err == nil {
		err = closeErr
	}
	if err == nil && n > maxUpdateSize {
		err = fmt.Errorf("내려받은 파일이 너무 큽니다")
	}
	if err == nil && hex.EncodeToString(h.Sum(nil)) != strings.ToLower(expectedSHA256) {
		err = fmt.Errorf("내려받은 파일의 지문값이 맞지 않습니다(손상되었거나 바뀐 파일)")
	}
	if err != nil {
		_ = os.Remove(dest)
		return err
	}
	return nil
}

// BackupEncryptedData 봉인된 data 폴더에서 암호화 파일·설정 파일만 백업 폴더로 복사한다(평문 DB는 복사하지 않음).
func BackupEncryptedData(dataDir, backupRoot, label string) (string, error) {
	dst := filepath.Join(backupRoot, time.Now().Format("20060102-150405")+"_"+label)
	err := filepath.WalkDir(dataDir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(dataDir, path)
		if d.IsDir() {
			if strings.HasPrefix(d.Name(), "backup") && rel != "." {
				return filepath.SkipDir // 이전 백업은 다시 복사하지 않는다
			}
			return os.MkdirAll(filepath.Join(dst, rel), 0o700)
		}
		lower := strings.ToLower(d.Name())
		if strings.HasSuffix(lower, ".db") || strings.HasSuffix(lower, ".db-wal") || strings.HasSuffix(lower, ".db-shm") || strings.HasSuffix(lower, ".db-journal") {
			return nil
		}
		b, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		return os.WriteFile(filepath.Join(dst, rel), b, 0o600)
	})
	if err != nil {
		return "", fmt.Errorf("업데이트 전 자료 백업 실패: %w", err)
	}
	return dst, nil
}

// ReplaceExecutable 지금 실행 파일을 .old로 바꾸고 새 파일을 꼬미입시.exe로 넣는다. 실패하면 되돌린다.
func ReplaceExecutable(currentExe, downloaded string) (string, error) {
	dir := filepath.Dir(currentExe)
	target := filepath.Join(dir, UpdateExecutableName)
	oldPath := currentExe + ".old"
	_ = os.Remove(oldPath)
	if err := os.Rename(currentExe, oldPath); err != nil {
		return "", fmt.Errorf("지금 실행 파일을 바꿀 수 없습니다: %w", err)
	}
	// 예전 이름(PHGC.exe)으로 실행 중인데 꼬미입시.exe가 따로 있으면 그것도 .old로 비켜 둔다.
	if !strings.EqualFold(filepath.Clean(target), filepath.Clean(currentExe)) {
		if _, err := os.Stat(target); err == nil {
			_ = os.Remove(target + ".old")
			if err := os.Rename(target, target+".old"); err != nil {
				_ = os.Rename(oldPath, currentExe)
				return "", fmt.Errorf("기존 %s 파일을 비킬 수 없습니다: %w", UpdateExecutableName, err)
			}
		}
	}
	if err := os.Rename(downloaded, target); err != nil {
		_ = os.Rename(oldPath, currentExe)
		return "", fmt.Errorf("새 실행 파일을 넣지 못해 원래 파일로 되돌렸습니다: %w", err)
	}
	return target, nil
}

// CleanupOldExecutables 지난 업데이트에서 남은 .exe.old 파일과 덜 받은 파일을 지운다(프로그램 시작 때).
func CleanupOldExecutables(exePath string) {
	dir := filepath.Dir(exePath)
	for _, pattern := range []string{"*.exe.old", "*.exe.download"} {
		matches, _ := filepath.Glob(filepath.Join(dir, pattern))
		for _, m := range matches {
			_ = os.Remove(m)
		}
	}
}

// NormalizeExecutableName GitHub에서 받은 실행 파일(kkomi-ipsi.exe, "kkomi-ipsi (1).exe" 등)을
// 처음 실행할 때 꼬미입시.exe로 이름을 바꾼다. GitHub는 첨부 파일 이름의 한글을 영문으로 바꿔 버리기 때문이다.
// 윈도우는 실행 중인 파일의 이름 바꾸기를 허용한다. 같은 폴더에 꼬미입시.exe가 이미 있으면 건드리지 않는다.
// 예전 이름(PHGC.exe)은 바탕화면 바로가기가 깨지지 않도록 바꾸지 않는다. 바꾼 경로(또는 빈 문자열)를 돌려준다.
func NormalizeExecutableName(exePath string) string {
	base := strings.ToLower(filepath.Base(exePath))
	if !strings.HasPrefix(base, "kkomi-ipsi") || !strings.HasSuffix(base, ".exe") {
		return ""
	}
	target := filepath.Join(filepath.Dir(exePath), UpdateExecutableName)
	if _, err := os.Stat(target); err == nil {
		return ""
	}
	if err := os.Rename(exePath, target); err != nil {
		return ""
	}
	return target
}
