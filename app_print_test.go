package main

import (
	"testing"
	"time"
)

func TestPrintCloseGuard(t *testing.T) {
	clock := time.Date(2026, 11, 21, 9, 0, 0, 0, time.UTC)
	g := &printCloseGuard{now: func() time.Time { return clock }}
	if g.blockClose() {
		t.Fatal("인쇄 중이 아니면 X 는 그대로 종료")
	}
	g.setPrinting(true)
	if !g.blockClose() {
		t.Fatal("인쇄 중 X 는 종료 대신 인쇄 화면만 닫기")
	}
	clock = clock.Add(2 * time.Second)
	if g.blockClose() {
		t.Fatal("막은 뒤 4초 안에 다시 누르면 종료(인쇄 화면이 안 닫혔을 때 빠져나가기)")
	}
	g.setPrinting(true)
	if !g.blockClose() {
		t.Fatal("다시 인쇄하면 다시 막기")
	}
	clock = clock.Add(10 * time.Second)
	if !g.blockClose() {
		t.Fatal("한참 뒤에 누르면 다시 인쇄 화면만 닫기")
	}
	g.setPrinting(false)
	if g.blockClose() {
		t.Fatal("인쇄가 끝나면 그대로 종료")
	}
}
