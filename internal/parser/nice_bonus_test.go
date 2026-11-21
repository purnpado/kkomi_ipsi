package parser

import "testing"

// 항목별점수관리 양식(사용자 제공 파일과 같은 칸): 가산점 묶음 아래 1·2·3학년.
func TestParseNiceBonusRows(t *testing.T) {
	rows := [][]string{
		{"연번", "학년", "반", "번호", "이름", "기본_x000D_\n점수", "가산점", "", "", "합계", "비고"},
		{"", "", "", "", "", "", "1학년", "2학년", "3학년"},
		{"1", "3", "1", "1", "", "5", "0", "1", "1", "7"},
		{"2", "3", "1", "2", "", "5", "0", "0", "0", "5"},
	}
	got, err := ParseNiceBonusRows(rows)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 || got[0].Bonus != [3]float64{0, 1, 1} || got[0].Total != 7 || got[0].Base != 5 || got[1].Bonus != [3]float64{} {
		t.Fatalf("읽은 값: %+v", got)
	}
	if NiceBonusKind("/x/항목별점수관리(창의체험).xlsx") != "changche" || NiceBonusKind("항목별점수관리(행동발달).xlsx") != "haengbal" || NiceBonusKind("a.xlsx") != "" {
		t.Fatal("파일 이름으로 종류 구별")
	}
	if _, err := ParseNiceBonusRows([][]string{{"아무"}, {"표"}}); err == nil {
		t.Fatal("다른 양식은 오류")
	}
}
