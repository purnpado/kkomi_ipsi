package main

import (
	"context"
	"embed"
	"log"
	"os"
	"path/filepath"
	"strings"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

//go:embed all:frontend/dist
var assets embed.FS

// cleanupLegacyWebViewData AppData\Roaming 내의 과거 버전(PHGC_v*.exe 등) 임시 캐시 폴더 자동 청소
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

func main() {
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
