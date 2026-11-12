package main

import (
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"time"

	"PHGC/internal/sync"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// UpdateResult 자동 업데이트 결과(화면 안내용)
type UpdateResult struct {
	Version    string `json:"version"`
	BackupPath string `json:"backupPath"`
	NewExePath string `json:"newExePath"`
}

// ApplyUpdate 새 버전을 내려받아 확인한 뒤 실행 파일을 바꾸고 프로그램을 다시 시작한다(윈도우 전용).
// 학생 자료는 봉인(암호화 저장)한 뒤 암호화 파일만 "업데이트전_백업" 폴더에 복사해 둔다. 아무것도 밖으로 보내지 않는다.
func (a *App) ApplyUpdate() (*UpdateResult, error) {
	if runtime.GOOS != "windows" {
		return nil, fmt.Errorf("자동 업데이트는 윈도우에서만 할 수 있습니다. 다운로드 페이지에서 새 버전을 받아 주세요")
	}
	exe, err := os.Executable()
	if err != nil {
		return nil, fmt.Errorf("실행 파일 위치를 알 수 없습니다: %w", err)
	}
	if resolved, err := filepath.EvalSymlinks(exe); err == nil {
		exe = resolved
	}
	asset, err := sync.FindUpdate()
	if err != nil {
		return nil, err
	}
	if !sync.IsNewerVersion(asset.Version, sync.AppVersion) {
		return nil, fmt.Errorf("이미 최신 버전(v%s)입니다", sync.AppVersion)
	}

	// 1) 내려받기·지문값 확인(여기까지는 아무것도 바꾸지 않는다)
	download := filepath.Join(filepath.Dir(exe), sync.UpdateExecutableName+".download")
	client := &http.Client{Timeout: 10 * time.Minute}
	if err := sync.DownloadVerified(client, asset.ExeURL, asset.ExpectedSHA256, download); err != nil {
		return nil, err
	}

	// 2) 학생 자료 봉인 후 암호화 파일만 백업
	if err := a.db.SealAllDatabases(); err != nil {
		_ = os.Remove(download)
		return nil, fmt.Errorf("자료를 안전하게 저장하지 못해 업데이트를 멈췄습니다: %w", err)
	}
	backup, err := sync.BackupEncryptedData(a.db.DataDir, filepath.Join(filepath.Dir(a.db.DataDir), "업데이트전_백업"), "v"+sync.AppVersion)
	if err != nil {
		_ = os.Remove(download)
		a.quitSoon()
		return nil, fmt.Errorf("%v. 자료는 암호화되어 저장되었으니 프로그램을 다시 실행해 주세요", err)
	}

	// 3) 실행 파일 교체 후 새 프로그램 실행
	target, err := sync.ReplaceExecutable(exe, download)
	if err != nil {
		a.quitSoon()
		return nil, fmt.Errorf("%v. 자료는 암호화되어 저장되었으니 프로그램을 다시 실행해 주세요", err)
	}
	cmd := exec.Command(target)
	cmd.Dir = filepath.Dir(target)
	if err := cmd.Start(); err != nil {
		a.quitSoon()
		return nil, fmt.Errorf("새 버전(%s)으로 바꿨지만 자동으로 실행하지 못했습니다. 직접 실행해 주세요: %w", filepath.Base(target), err)
	}
	a.quitSoon()
	return &UpdateResult{Version: asset.Version, BackupPath: backup, NewExePath: target}, nil
}

// quitSoon 화면이 안내를 보여 줄 시간을 두고 프로그램을 끝낸다.
func (a *App) quitSoon() {
	go func() {
		time.Sleep(1500 * time.Millisecond)
		if appInst := application.Get(); appInst != nil {
			appInst.Quit()
			return
		}
		os.Exit(0)
	}()
}
