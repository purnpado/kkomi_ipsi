//go:build !windows

package main

// closePrintPreview 맥의 인쇄 창은 따로 뜨는 창(시트)이라 할 일이 없다.
func closePrintPreview() {}
