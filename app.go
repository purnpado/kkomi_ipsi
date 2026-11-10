package main

import (
	"context"
	"fmt"
	"os"

	"PHGC/internal/database"
	"PHGC/internal/sync"
	"github.com/wailsapp/wails/v3/pkg/application"
)

// App struct
type App struct {
	ctx     context.Context
	window  *application.WebviewWindow
	db      *database.DBManager
	sync    *sync.SyncManager
	dataKey []byte
	user    *database.User
}

// NewApp creates a new App application struct
func NewApp() *App {
	dbm := database.NewDBManager()
	return &App{
		db:   dbm,
		sync: sync.NewSyncManager(dbm.DataDir),
	}
}

func (a *App) setMainWindow(window *application.WebviewWindow) {
	a.window = window
}

func (a *App) openFileDialog(title string, filterName string, pattern string) (string, error) {
	appInst := application.Get()
	if appInst == nil {
		return "", fmt.Errorf("프로그램 실행 환경을 준비하지 못했습니다")
	}
	opts := &application.OpenFileDialogOptions{
		Title:          title,
		CanChooseFiles: true,
	}
	if filterName != "" && pattern != "" {
		opts.Filters = []application.FileFilter{{
			DisplayName: filterName,
			Pattern:     pattern,
		}}
	}
	if a.window != nil {
		opts.Window = a.window
	}
	return appInst.Dialog.OpenFileWithOptions(opts).PromptForSingleSelection()
}

func (a *App) openMultipleFilesDialog(title string, filterName string, pattern string) ([]string, error) {
	appInst := application.Get()
	if appInst == nil {
		return nil, fmt.Errorf("프로그램 실행 환경을 준비하지 못했습니다")
	}
	opts := &application.OpenFileDialogOptions{
		Title:          title,
		CanChooseFiles: true,
	}
	if filterName != "" && pattern != "" {
		opts.Filters = []application.FileFilter{{
			DisplayName: filterName,
			Pattern:     pattern,
		}}
	}
	if a.window != nil {
		opts.Window = a.window
	}
	return appInst.Dialog.OpenFileWithOptions(opts).PromptForMultipleSelection()
}

func (a *App) saveFileDialog(title string, defaultFilename string, filterName string, pattern string) (string, error) {
	appInst := application.Get()
	if appInst == nil {
		return "", fmt.Errorf("프로그램 실행 환경을 준비하지 못했습니다")
	}
	opts := &application.SaveFileDialogOptions{
		Title:    title,
		Filename: defaultFilename,
	}
	if filterName != "" && pattern != "" {
		opts.Filters = []application.FileFilter{{
			DisplayName: filterName,
			Pattern:     pattern,
		}}
	}
	if a.window != nil {
		opts.Window = a.window
	}
	return appInst.Dialog.SaveFileWithOptions(opts).PromptForSingleSelection()
}

// startup is called when the app starts.
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	// 서약서에 동의했거나, 이미 배포된 config.db.kkomi / config.db.phgc가 있는 경우에만 DB 초기화
	// 서약 전에는 빈 data 폴더나 config.db를 만들지 않는다.
	if a.IsAgreementAccepted() || a.db.HasEncryptedConfigDB() {
		if !a.db.HasEncryptedConfigDB() {
			if err := a.db.InitConfigDB(); err != nil {
				fmt.Println("config DB 초기화 오류:", err)
			}
		}
	}
}

func (a *App) shutdown(ctx context.Context) {
	// 사용자가 서약서에 동의하지 않고 창을 닫은 경우 (미동의 종료)
	if !a.IsAgreementAccepted() && !a.db.HasEncryptedConfigDB() {
		// 서약 미동의 상태이므로 data 폴더가 존재하더라도 깨끗하게 파기
		if a.db != nil && a.db.DataDir != "" {
			_ = os.RemoveAll(a.db.DataDir)
		}
		return
	}

	if err := a.db.SealAllDatabases(); err != nil {
		fmt.Println("DB 암호화 종료 처리 오류:", err)
	}
}
