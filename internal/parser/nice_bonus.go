package parser

import (
	"fmt"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/xuri/excelize/v2"
)

// 나이스 "항목별점수관리(창의체험)"·"항목별점수관리(행동발달)" 엑셀 읽기(후기 일반고 가산점).
// 담임이 학업성적관리위원회 명단을 보고 나이스에 넣은 학년별 가산점을 꼬미입시 상담 화면 체크로 가져오거나 맞춰 본다.
// 양식: 연번·학년·반·번호·이름·기본점수·가산점(1학년·2학년·3학년)·합계·비고. 창체와 행발 파일의 모양이 같아
// 종류는 파일 이름("창의체험"·"행동발달")으로 구별한다(사용자 제공 2026-11-21).

// NiceBonusRow 학생 한 명의 학년별 가산점.
type NiceBonusRow struct {
	ClassNum   int        `json:"classNum"`
	StudentNum string     `json:"studentNum"`
	Name       string     `json:"name"`
	Base       float64    `json:"base"`
	Bonus      [3]float64 `json:"bonus"` // 1·2·3학년 가산점
	Total      float64    `json:"total"`
}

// NiceBonusKind 파일 이름으로 종류를 정한다: "changche"(창의체험)·"haengbal"(행동발달)·""(모름).
func NiceBonusKind(path string) string {
	name := normLabel(filepath.Base(path))
	switch {
	case strings.Contains(name, "창의체험") || strings.Contains(name, "창체"):
		return "changche"
	case strings.Contains(name, "행동발달") || strings.Contains(name, "행발"):
		return "haengbal"
	}
	return ""
}

// ParseNiceBonusRows 엑셀 줄들에서 학년별 가산점을 읽는다.
func ParseNiceBonusRows(rows [][]string) ([]NiceBonusRow, error) {
	for h := 0; h+1 < len(rows); h++ {
		col := map[string]int{}
		for i, raw := range rows[h] {
			switch l := normLabel(raw); {
			case l == "반":
				col["class"] = i
			case l == "번호" || l == "번":
				col["num"] = i
			case l == "이름" || l == "성명":
				col["name"] = i
			case strings.HasPrefix(l, "기본"):
				col["base"] = i
			case l == "합계":
				col["total"] = i
			}
		}
		grades := map[int]int{}
		for i, raw := range rows[h+1] {
			if l := normLabel(raw); len(l) == len("1학년") && strings.HasSuffix(l, "학년") {
				if g, err := strconv.Atoi(strings.TrimSuffix(l, "학년")); err == nil && g >= 1 && g <= 3 {
					grades[g] = i
				}
			}
		}
		if _, ok := col["class"]; !ok || len(grades) == 0 {
			continue
		}
		if _, ok := col["num"]; !ok {
			continue
		}
		var out []NiceBonusRow
		for _, row := range rows[h+2:] {
			classNum, okC := intAt(row, col["class"])
			num, okN := intAt(row, col["num"])
			if !okC || !okN {
				continue
			}
			r := NiceBonusRow{ClassNum: classNum, StudentNum: strconv.Itoa(num)}
			if i, ok := col["name"]; ok {
				r.Name = cellAt(row, i)
			}
			if i, ok := col["base"]; ok {
				r.Base, _ = numAt(row, i)
			}
			if i, ok := col["total"]; ok {
				r.Total, _ = numAt(row, i)
			}
			for g, i := range grades {
				r.Bonus[g-1], _ = numAt(row, i)
			}
			out = append(out, r)
		}
		if len(out) == 0 {
			return nil, fmt.Errorf("학생 줄을 찾지 못했습니다")
		}
		return out, nil
	}
	return nil, fmt.Errorf("나이스 항목별점수관리(창의체험·행동발달) 양식이 아닙니다. 반·번호·가산점(학년) 칸을 찾지 못했습니다")
}

// ParseNiceBonusFile 항목별점수관리 엑셀(.xlsx) 첫 시트를 읽는다.
func ParseNiceBonusFile(path string) ([]NiceBonusRow, error) {
	f, err := excelize.OpenFile(path)
	if err != nil {
		return nil, fmt.Errorf("엑셀 파일을 열 수 없습니다(나이스에서 엑셀로 저장한 .xlsx 파일인지 확인): %w", err)
	}
	defer f.Close()
	sheets := f.GetSheetList()
	if len(sheets) == 0 {
		return nil, fmt.Errorf("시트가 없는 파일입니다")
	}
	rows, err := f.GetRows(sheets[0])
	if err != nil {
		return nil, err
	}
	return ParseNiceBonusRows(rows)
}
