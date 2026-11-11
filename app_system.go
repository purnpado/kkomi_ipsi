package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
	"unicode/utf16"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// OpenExternalURL 기본 웹브라우저로 외부 웹페이지(공식 GitHub 릴리즈 페이지 등)를 엽니다.
func (a *App) OpenExternalURL(targetURL string) error {
	if targetURL == "" {
		targetURL = "https://github.com/purnpado/kkomi_ipsi/releases"
	}
	if appInst := application.Get(); appInst != nil {
		return appInst.Browser.OpenURL(targetURL)
	}
	return nil
}

// QuitApp 프로그램 정상 안전 종료
func (a *App) QuitApp() {
	if appInst := application.Get(); appInst != nil {
		appInst.Quit()
	} else {
		os.Exit(0)
	}
}

// SetWindowTitle 창 제목을 동적으로 변경 (학년부장, 담임교사 구분용)
func (a *App) SetWindowTitle(title string) {
	if a.window != nil && title != "" {
		a.window.SetTitle(title)
	}
}

// AgreementRecord 사용 서약 동의 기록 구조체
type AgreementRecord struct {
	Accepted   bool   `json:"accepted"`
	AcceptedAt string `json:"acceptedAt"`
	Version    string `json:"version"`
}

func getAgreementPath() string {
	exePath, err := os.Executable()
	if err != nil {
		return "data/agreement.json"
	}
	exePath, _ = filepath.EvalSymlinks(exePath)
	return filepath.Join(filepath.Dir(exePath), "data", "agreement.json")
}

// IsAgreementAccepted 프로그램 이용 및 개인정보 보호 서약 동의 여부 확인
func (a *App) IsAgreementAccepted() bool {
	p := getAgreementPath()
	data, err := os.ReadFile(p)
	if err != nil {
		return false
	}
	var rec AgreementRecord
	if err := json.Unmarshal(data, &rec); err != nil {
		return false
	}
	return rec.Accepted
}

// AcceptAgreement 프로그램 이용 및 개인정보 보호 서약 동의 처리
func (a *App) AcceptAgreement() error {
	p := getAgreementPath()
	dir := filepath.Dir(p)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("동의 정보 저장 폴더 생성 실패: %w", err)
	}

	rec := AgreementRecord{
		Accepted:   true,
		AcceptedAt: time.Now().Format(time.RFC3339),
		Version:    "1.0",
	}
	b, err := json.MarshalIndent(rec, "", "  ")
	if err != nil {
		return err
	}
	if err := os.WriteFile(p, b, 0644); err != nil {
		return err
	}

	// 서약 동의가 완료되었으므로 이제 기본 config DB 초기화 진행
	if !a.db.HasEncryptedConfigDB() {
		if err := a.db.InitConfigDB(); err != nil {
			fmt.Println("서약 동의 후 config DB 초기화 오류:", err)
		}
	}
	return nil
}

// SelfDestruct 사용자가 서약에 비동의 시 프로그램 실행 파일 및 관련 데이터를 즉시 안전하게 파기하고 종료
func (a *App) SelfDestruct() error {
	currentExe, err := os.Executable()
	if err != nil {
		return fmt.Errorf("실행 파일 경로를 확인할 수 없습니다: %w", err)
	}
	currentExe, _ = filepath.EvalSymlinks(currentExe)
	exeDir := filepath.Dir(currentExe)
	dataDir := filepath.Join(exeDir, "data")
	currentPid := os.Getpid()

	psScript := fmt.Sprintf(`
$pidToWait = %d
$exePath = '%s'
$dataDirPath = '%s'

try {
    $proc = Get-Process -Id $pidToWait -ErrorAction SilentlyContinue
    if ($proc) { $proc.WaitForExit(5000) }
} catch {}
Start-Sleep -Milliseconds 500

# 1. data 폴더 영구 완전 삭제 (휴지통 우회)
if (Test-Path -LiteralPath $dataDirPath) {
    for ($i = 0; $i -lt 10; $i++) {
        try {
            [System.IO.Directory]::Delete($dataDirPath, $true)
            break
        } catch {
            try {
                Remove-Item -LiteralPath $dataDirPath -Recurse -Force -ErrorAction Stop
                break
            } catch { Start-Sleep -Milliseconds 300 }
        }
    }
}

# 2. 실행 파일(.exe) 영구 완전 삭제 (휴지통 우회)
for ($i = 0; $i -lt 15; $i++) {
    try {
        [System.IO.File]::Delete($exePath)
        break
    } catch {
        try {
            Remove-Item -LiteralPath $exePath -Force -ErrorAction Stop
            break
        } catch { Start-Sleep -Milliseconds 400 }
    }
}
`, currentPid, strings.ReplaceAll(currentExe, "'", "''"), strings.ReplaceAll(dataDir, "'", "''"))

	encodedScript := encodePowerShell(psScript)
	cmd := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-EncodedCommand", encodedScript)

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("자가 삭제 스크립트 실행 실패: %w", err)
	}

	go func() {
		time.Sleep(300 * time.Millisecond)
		os.Exit(0)
	}()

	return nil
}

// encodePowerShell PowerShell -EncodedCommand용 UTF-16LE Base64 인코딩
func encodePowerShell(script string) string {
	runes := []rune(script)
	u16s := utf16.Encode(runes)
	bytes := make([]byte, len(u16s)*2)
	for i, u := range u16s {
		bytes[i*2] = byte(u)
		bytes[i*2+1] = byte(u >> 8)
	}
	return base64.StdEncoding.EncodeToString(bytes)
}
