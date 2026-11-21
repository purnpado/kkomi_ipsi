package main

import (
	"sync"
	"time"
)

// 인쇄 미리보기 중 창 닫기(X) 처리.
// 윈도우의 인쇄 미리보기는 따로 창이 아니라 프로그램 창 안을 덮어서 열리고 자체 X 단추가 없다.
// 그래서 사용자가 보는 X 는 프로그램 창의 X 이고, 누르면 프로그램이 꺼졌다(사용자 지적 2026-11-21).
// 화면이 인쇄를 시작·끝낼 때 SetPrinting 으로 알려 주면, 인쇄 중 X 는 종료 대신 인쇄 화면만 닫는다(Esc).
// 인쇄 화면이 닫히지 않고 남는 경우를 대비해 X 를 짧은 시간 안에 한 번 더 누르면 원래대로 종료한다.

const printCloseRepeatWindow = 4 * time.Second

type printCloseGuard struct {
	mu        sync.Mutex
	printing  bool
	lastBlock time.Time
	now       func() time.Time
}

var printGuard = &printCloseGuard{now: time.Now}

func (g *printCloseGuard) setPrinting(on bool) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.printing = on
	g.lastBlock = time.Time{} // 인쇄를 새로 시작하거나 끝내면 "한 번 더 누르기"를 처음부터 센다
}

// blockClose 창 닫기를 막고 인쇄 화면만 닫아야 하면 true. 인쇄 중이 아니거나, 막은 뒤 곧바로 다시 누르면 false(종료).
func (g *printCloseGuard) blockClose() bool {
	g.mu.Lock()
	defer g.mu.Unlock()
	if !g.printing {
		return false
	}
	now := g.now()
	if !g.lastBlock.IsZero() && now.Sub(g.lastBlock) < printCloseRepeatWindow {
		g.printing = false
		return false
	}
	g.lastBlock = now
	return true
}

// SetPrinting 화면이 인쇄 미리보기를 열 때(true)와 닫힌 뒤(false) 알린다.
func (a *App) SetPrinting(on bool) {
	printGuard.setPrinting(on)
}
