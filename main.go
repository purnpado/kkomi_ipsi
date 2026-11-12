package main

import (
	"context"
	"embed"
	"log"
	"os"
	"path/filepath"
	"strings"

	"PHGC/internal/sync"
	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

//go:embed all:frontend/dist
var assets embed.FS

// 학교·학과·요강 모집정원 기본 자료(운영자가 요강을 확인해 갱신)
//
//go:embed server-data/highschools.json
var defaultHighSchoolsJSON []byte

// cleanupLegacyWebViewData AppData\Roaming 내의 과거 버전(PHGC_v*.exe 등) 임시 캐시 폴더 자동 청소
// (PHGC_WebviewData 는 현재 꼬미입시.exe 도 쓰는 화면 저장소이므로 보존한다)
func cleanupLegacyWebViewData() {
	appData := os.Getenv("APPDATA")
	if appData == "" {
		return
	}
	entries, err := os.ReadDir(appData)
	if err != nil {
		return
	}
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		name := entry.Name()
		// PHGC 관련 구버전 임시 캐시 디렉토리 패턴 감지 및 자동 삭제
		if strings.HasPrefix(strings.ToLower(name), "phgc") && name != "PHGC_WebviewData" {
			target := filepath.Join(appData, name)
			_ = os.RemoveAll(target)
		}
	}
}

// legacyWebviewDataPath v1.6.2와 같은 WebView2 사용자 데이터 폴더(%APPDATA%\PHGC_WebviewData).
// 윈도우가 아니거나 APPDATA가 없으면 빈 값(기본 위치)을 쓴다.
func legacyWebviewDataPath() string {
	appData := os.Getenv("APPDATA")
	if appData == "" {
		return ""
	}
	return filepath.Join(appData, "PHGC_WebviewData")
}

func main() {
	sync.EmbeddedHighSchoolsJSON = defaultHighSchoolsJSON
	// 지난 자동 업데이트에서 남은 .exe.old·덜 받은 파일 정리
	if exe, err := os.Executable(); err == nil {
		sync.CleanupOldExecutables(exe)
	}
	// 1. 과거 버전 실행 잔여 임시 캐시 폴더 자동 청소
	cleanupLegacyWebViewData()

	// 2. App 서비스 인스턴스 생성
	appService := NewApp()
	services := []application.Service{application.NewService(appService)}

	wailsApp := application.New(application.Options{
		Name:        "꼬미입시",
		Description: "울산 관내 중학교 3학년 고입 진학지도 오프라인 데스크톱 프로그램",
		Services:    services,
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
		Windows: application.WindowsOptions{
			// v1.6.2(PHGC)와 같은 화면 저장소를 써서, 상담 화면의 목표고교 목록·결재란·화면 잠금 시간 등
			// 브라우저 저장소(localStorage)에 남아 있던 설정과 자료를 그대로 이어 쓴다.
			WebviewUserDataPath: legacyWebviewDataPath(),
		},
		OnShutdown: func() {
			appService.shutdown(context.Background())
		},
	})

	win := wailsApp.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:            "꼬미입시",
		Width:            1280,
		Height:           820,
		MinWidth:         960,
		MinHeight:        640,
		StartState:       application.WindowStateMaximised,
		BackgroundColour: application.NewRGBA(27, 38, 54, 255),
		URL:              "/",
	})

	appService.setMainWindow(win)
	win.RegisterHook(events.Common.WindowClosing, func(event *application.WindowEvent) {
		appService.shutdown(context.Background())
	})
	appService.startup(context.Background())

	if err := wailsApp.Run(); err != nil {
		log.Fatal("프로그램 실행 오류:", err)
	}
}
