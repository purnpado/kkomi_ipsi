//go:build windows

package main

import (
	"syscall"
	"time"
)

var procKeybdEvent = syscall.NewLazyDLL("user32.dll").NewProc("keybd_event")

// closePrintPreview 인쇄 미리보기를 닫는다: 미리보기에 초점이 있으므로 Esc(미리보기의 [취소]와 같음)를 누른 것처럼 보낸다.
func closePrintPreview() {
	const vkEscape, keyUp = 0x1B, 0x0002
	time.Sleep(80 * time.Millisecond) // X 를 누른 마우스 처리가 끝난 뒤
	procKeybdEvent.Call(vkEscape, 0, 0, 0)
	procKeybdEvent.Call(vkEscape, 0, keyUp, 0)
}
