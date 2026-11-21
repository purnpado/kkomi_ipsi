package parser

import (
	"fmt"
	"math"
	"strconv"
	"strings"

	"github.com/xuri/excelize/v2"
)

// 나이스 후기 일반고 내신 산출 결과(석차 연명부) 엑셀 읽기.
// 3학년 2학기 성적이 나오면 나이스가 공식 내신 성적(200점)을 산출한다. 원서대장의 후기 일반고 점수는 이 값을 쓰고,
// 꼬미입시가 계산한 값과 학생마다 맞춰 본다(사용자 요청 2026-11-21).
// 읽는 양식(나이스 "고입내신관리" 출력, 사용자 제공):
//   - 석차백분율산출: 학년·반·번호·성명·교과성적·출석성적·봉사활동·창의체험·행동발달·합계점수·학년석차·석차백분율(비교과포함)
//   - 내신석차연명부·반별 석차 연명부: 내신석차·반·번·성명·성별·교과성적·출석성적·봉사활동·창의체험·행동발달·합계점수(총점)·석차백분율·내신성적,
//     칸 이름 바로 아래 줄의 첫 칸이 재적수(소인수 학교는 10)이고 나머지 칸은 만점(160·16·8·8·8·200·%·200)이다.
// 칸 이름으로 위치를 찾으므로 칸 순서가 조금 바뀌어도 읽는다.

// NiceRankRow 학생 한 명의 나이스 산출 값. 칸이 비어 있으면 그 값의 Has 가 false.
type NiceRankRow struct {
	ClassNum   int     `json:"classNum"`
	StudentNum string  `json:"studentNum"`
	Name       string  `json:"name"`
	Rank       float64 `json:"rank"`
	Academic   float64 `json:"academic"`   // 교과성적(160)
	Attendance float64 `json:"attendance"` // 출석성적(16)
	Volunteer  float64 `json:"volunteer"`  // 봉사활동(8)
	Creative   float64 `json:"creative"`   // 창의체험(8)
	Behavior   float64 `json:"behavior"`   // 행동발달(8)
	Total      float64 `json:"total"`      // 합계점수(200)
	Percentile float64 `json:"percentile"` // 석차백분율(%)
	Final      float64 `json:"final"`      // 내신성적(200). 칸이 없으면 합계점수
	HasScores  bool    `json:"hasScores"`  // 점수 칸에 값이 있는지(나이스 산출 전에는 비어 있음)
}

// NiceRankFile 파일 하나에서 읽은 결과.
type NiceRankFile struct {
	Kind     string        `json:"kind"`     // "석차백분율산출" · "석차 연명부"
	Enrolled int           `json:"enrolled"` // 재적수(연명부에만 있음, 없으면 0)
	Rows     []NiceRankRow `json:"rows"`
}

func normLabel(s string) string {
	r := strings.NewReplacer("_x000D_", "", "\r", "", "\n", "", " ", "", "\t", "")
	return r.Replace(strings.TrimSpace(s))
}

// rankColumns 칸 이름 → 칸 번호. 아래 줄(세부 이름)을 먼저 보고, 비어 있는 칸만 위 줄(묶음 이름)로 채운다.
type rankColumns struct {
	class, num, name, rank, academic, attendance, volunteer, creative, behavior, total, percentile, final int
}

func findRankColumns(top, sub []string) rankColumns {
	c := rankColumns{-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1}
	used := map[int]bool{}
	assign := func(dst *int, i int) {
		if *dst < 0 && !used[i] {
			*dst = i
			used[i] = true
		}
	}
	scan := func(row []string) {
		for i, raw := range row {
			l := normLabel(raw)
			switch {
			case l == "반":
				assign(&c.class, i)
			case l == "번" || l == "번호":
				assign(&c.num, i)
			case l == "성명" || l == "이름":
				assign(&c.name, i)
			case l == "내신석차" || l == "학년석차" || l == "석차":
				assign(&c.rank, i)
			case l == "교과성적":
				assign(&c.academic, i)
			case l == "출석성적":
				assign(&c.attendance, i)
			case l == "봉사활동":
				assign(&c.volunteer, i)
			case l == "창의체험":
				assign(&c.creative, i)
			case l == "행동발달":
				assign(&c.behavior, i)
			case l == "합계점수" || l == "총점":
				assign(&c.total, i)
			case strings.HasPrefix(l, "석차백분율"):
				assign(&c.percentile, i)
			case l == "내신성적":
				assign(&c.final, i)
			}
		}
	}
	scan(sub)
	scan(top)
	return c
}

func cellAt(row []string, i int) string {
	if i < 0 || i >= len(row) {
		return ""
	}
	return strings.TrimSpace(row[i])
}

func numAt(row []string, i int) (float64, bool) {
	v := strings.TrimSuffix(strings.ReplaceAll(cellAt(row, i), ",", ""), "%")
	if v == "" {
		return 0, false
	}
	f, err := strconv.ParseFloat(v, 64)
	if err != nil || math.IsNaN(f) {
		return 0, false
	}
	return f, true
}

func intAt(row []string, i int) (int, bool) {
	f, ok := numAt(row, i)
	if !ok || f != math.Trunc(f) {
		return 0, false
	}
	return int(f), true
}

// ParseNiceRankRows 엑셀의 줄들에서 나이스 산출 값을 읽는다(테스트용으로 파일과 나눔).
func ParseNiceRankRows(rows [][]string) (*NiceRankFile, error) {
	header := -1
	var cols rankColumns
	for i := 0; i+1 < len(rows) && header < 0; i++ {
		c := findRankColumns(rows[i], rows[i+1])
		if c.class >= 0 && c.num >= 0 && c.academic >= 0 {
			header, cols = i, c
		}
	}
	if header < 0 {
		return nil, fmt.Errorf("나이스 석차 연명부(또는 석차백분율산출) 양식이 아닙니다. 반·번호·교과성적 칸을 찾지 못했습니다")
	}
	out := &NiceRankFile{Kind: "석차백분율산출"}
	if cols.final >= 0 && cols.final != cols.academic {
		out.Kind = "석차 연명부"
	}
	for _, row := range rows[header+1:] {
		classNum, okClass := intAt(row, cols.class)
		num, okNum := intAt(row, cols.num)
		if !okClass || !okNum {
			// 연명부: 칸 이름 아래 줄(만점 줄)의 첫 칸이 재적수
			if max, ok := numAt(row, cols.academic); ok && max == 160 {
				if n, ok := intAt(row, cols.rank); ok {
					out.Enrolled = n
				} else if n, ok := intAt(row, 0); ok {
					out.Enrolled = n
				}
			}
			continue
		}
		r := NiceRankRow{ClassNum: classNum, StudentNum: strconv.Itoa(num), Name: cellAt(row, cols.name)}
		r.Rank, _ = numAt(row, cols.rank)
		var ok bool
		r.Academic, ok = numAt(row, cols.academic)
		r.HasScores = ok
		r.Attendance, _ = numAt(row, cols.attendance)
		r.Volunteer, _ = numAt(row, cols.volunteer)
		r.Creative, _ = numAt(row, cols.creative)
		r.Behavior, _ = numAt(row, cols.behavior)
		r.Total, _ = numAt(row, cols.total)
		r.Percentile, _ = numAt(row, cols.percentile)
		if cols.final >= 0 && cols.final != cols.academic {
			r.Final, _ = numAt(row, cols.final)
		}
		if r.Final == 0 {
			r.Final = r.Total
		}
		out.Rows = append(out.Rows, r)
	}
	if len(out.Rows) == 0 {
		return nil, fmt.Errorf("학생 줄을 찾지 못했습니다")
	}
	return out, nil
}

// ParseNiceRankFile 나이스 석차 연명부·석차백분율산출 엑셀(.xlsx) 파일을 읽는다(첫 시트).
func ParseNiceRankFile(path string) (*NiceRankFile, error) {
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
	return ParseNiceRankRows(rows)
}
