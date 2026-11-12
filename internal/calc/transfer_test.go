package calc

import "testing"

func TestTransferNote(t *testing.T) {
	cases := map[string]string{
		`[{"과목":"국어","비고":""},{"과목":"수학","비 고":"2025.03.04 전입"}]`: "2025.03.04 전입",
		`[{"과목":"국어","비고":"전입학"}]`:                                     "전입학",
		`[{"과목":"국어","비고":"전출"}]`:                                      "",
		`[{"과목":"국어","세부능력":"전입 관련 없음"}]`:                              "",
		`not json`: "",
	}
	for raw, want := range cases {
		if got := TransferNote(raw); got != want {
			t.Errorf("TransferNote(%s) = %q, want %q", raw, got, want)
		}
	}
}
