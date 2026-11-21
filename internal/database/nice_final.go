package database

import (
	"database/sql"
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
	"time"

	"PHGC/internal/calc"
	"PHGC/internal/parser"
)

// 나이스 후기 일반고 내신 산출 결과(석차 연명부)를 학년도별로 보관하고 꼬미입시 계산값과 맞춰 본다.
// 원서대장의 후기 일반고 점수는 이 값이 있으면 이 값을 쓴다(사용자 요청 2026-11-21).
// 학생 성적이라 config.db(암호화)에 둔다. 인수인계·관내 공유 파일에는 싣지 않는다.

func initNiceFinalTable(db *sql.DB) error {
	_, err := db.Exec(`CREATE TABLE IF NOT EXISTS nice_general_final (
		admission_year INTEGER NOT NULL,
		class_num INTEGER NOT NULL,
		student_num TEXT NOT NULL,
		name TEXT NOT NULL DEFAULT '',
		rank REAL NOT NULL DEFAULT 0,
		academic REAL NOT NULL DEFAULT 0,
		attendance REAL NOT NULL DEFAULT 0,
		volunteer REAL NOT NULL DEFAULT 0,
		creative REAL NOT NULL DEFAULT 0,
		behavior REAL NOT NULL DEFAULT 0,
		total REAL NOT NULL DEFAULT 0,
		percentile REAL NOT NULL DEFAULT 0,
		final REAL NOT NULL DEFAULT 0,
		enrolled INTEGER NOT NULL DEFAULT 0,
		source_kind TEXT NOT NULL DEFAULT '',
		uploaded_at TEXT NOT NULL DEFAULT '',
		PRIMARY KEY (admission_year, class_num, student_num)
	)`)
	return err
}

func (dm *DBManager) withNiceFinalDB(fn func(db *sql.DB) error) error {
	db, err := dm.OpenDB(dm.GetConfigDBPath())
	if err != nil {
		return err
	}
	defer db.Close()
	if err := initNiceFinalTable(db); err != nil {
		return err
	}
	return fn(db)
}

// NiceFinalSummary 올린 나이스 산출 결과 요약.
type NiceFinalSummary struct {
	AdmissionYear int    `json:"admissionYear"`
	Count         int    `json:"count"`      // 학생 수
	Scored        int    `json:"scored"`     // 점수가 있는 학생 수
	Enrolled      int    `json:"enrolled"`   // 연명부의 재적수(없으면 0)
	Kind          string `json:"kind"`       // 올린 양식
	UploadedAt    string `json:"uploadedAt"` // "2026-12-10 14:03"
}

// SaveNiceGeneralFinal 그 학년도의 나이스 산출 결과를 새로 올린 파일로 바꾼다(점수가 없는 줄은 저장하지 않음).
func (dm *DBManager) SaveNiceGeneralFinal(year int, file *parser.NiceRankFile) (*NiceFinalSummary, error) {
	if file == nil {
		return nil, fmt.Errorf("읽은 자료가 없습니다")
	}
	scored := 0
	for _, r := range file.Rows {
		if r.HasScores {
			scored++
		}
	}
	if scored == 0 {
		return nil, fmt.Errorf("점수가 들어 있는 학생이 없습니다. 나이스에서 3학년 2학기 성적 산출을 마친 뒤 내려받은 파일인지 확인해 주세요")
	}
	uploaded := time.Now().Format("2006-01-02 15:04")
	err := dm.withNiceFinalDB(func(db *sql.DB) error {
		tx, err := db.Begin()
		if err != nil {
			return err
		}
		defer tx.Rollback()
		if _, err := tx.Exec(`DELETE FROM nice_general_final WHERE admission_year = ?`, year); err != nil {
			return err
		}
		for _, r := range file.Rows {
			if !r.HasScores {
				continue
			}
			if _, err := tx.Exec(`INSERT OR REPLACE INTO nice_general_final (admission_year, class_num, student_num, name, rank, academic, attendance, volunteer, creative, behavior, total, percentile, final, enrolled, source_kind, uploaded_at)
				VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, year, r.ClassNum, normalizeNum(r.StudentNum), strings.TrimSpace(r.Name), r.Rank, r.Academic, r.Attendance, r.Volunteer, r.Creative, r.Behavior, r.Total, r.Percentile, r.Final, file.Enrolled, file.Kind, uploaded); err != nil {
				return err
			}
		}
		return tx.Commit()
	})
	if err != nil {
		return nil, err
	}
	return &NiceFinalSummary{AdmissionYear: year, Count: len(file.Rows), Scored: scored, Enrolled: file.Enrolled, Kind: file.Kind, UploadedAt: uploaded}, nil
}

func normalizeNum(n string) string {
	if v, err := strconv.Atoi(strings.TrimSpace(n)); err == nil {
		return strconv.Itoa(v)
	}
	return strings.TrimSpace(n)
}

// GetNiceGeneralFinal 그 학년도에 올린 나이스 산출 결과(반·번호 순).
func (dm *DBManager) GetNiceGeneralFinal(year int) ([]parser.NiceRankRow, *NiceFinalSummary, error) {
	var rows []parser.NiceRankRow
	summary := &NiceFinalSummary{AdmissionYear: year}
	err := dm.withNiceFinalDB(func(db *sql.DB) error {
		q, err := db.Query(`SELECT class_num, student_num, name, rank, academic, attendance, volunteer, creative, behavior, total, percentile, final, enrolled, source_kind, uploaded_at
			FROM nice_general_final WHERE admission_year = ? ORDER BY class_num, CAST(student_num AS INTEGER)`, year)
		if err != nil {
			return err
		}
		defer q.Close()
		for q.Next() {
			var r parser.NiceRankRow
			if err := q.Scan(&r.ClassNum, &r.StudentNum, &r.Name, &r.Rank, &r.Academic, &r.Attendance, &r.Volunteer, &r.Creative, &r.Behavior, &r.Total, &r.Percentile, &r.Final, &summary.Enrolled, &summary.Kind, &summary.UploadedAt); err != nil {
				return err
			}
			r.HasScores = true
			rows = append(rows, r)
		}
		return q.Err()
	})
	summary.Count, summary.Scored = len(rows), len(rows)
	return rows, summary, err
}

// ClearNiceGeneralFinal 그 학년도에 올린 나이스 산출 결과를 지운다(원서대장은 꼬미입시 계산값으로 돌아감).
func (dm *DBManager) ClearNiceGeneralFinal(year int) error {
	return dm.withNiceFinalDB(func(db *sql.DB) error {
		_, err := db.Exec(`DELETE FROM nice_general_final WHERE admission_year = ?`, year)
		return err
	})
}

// NiceCompareRow 학생 한 명의 꼬미입시 값과 나이스 값.
type NiceCompareRow struct {
	ClassNum   int                `json:"classNum"`
	StudentNum string             `json:"studentNum"`
	Name       string             `json:"name"`
	Program    *NiceCompareValues `json:"program"` // 꼬미입시(없으면 nil: 꼬미입시에 없는 학생)
	Nice       *NiceCompareValues `json:"nice"`    // 나이스(없으면 nil: 연명부에 없는 학생)
	Diffs      []string           `json:"diffs"`   // 다른 칸 이름(rank·percentile·academic·attendance·volunteer·creative·behavior·total)
	Hints      []string           `json:"hints"`   // 다를 때 짐작되는 이유
}

// NiceCompareValues 비교하는 값.
type NiceCompareValues struct {
	Rank       float64 `json:"rank"`
	Percentile float64 `json:"percentile"`
	Academic   float64 `json:"academic"`
	Attendance float64 `json:"attendance"`
	Volunteer  float64 `json:"volunteer"`
	Creative   float64 `json:"creative"`
	Behavior   float64 `json:"behavior"`
	Total      float64 `json:"total"`
}

// NiceComparison 맞춰 보기 화면 자료.
type NiceComparison struct {
	Summary         *NiceFinalSummary `json:"summary"`
	ProgramEnrolled int               `json:"programEnrolled"` // 꼬미입시가 석차백분율에 쓴 재적수(소인수 학교 보정 포함)
	Rows            []NiceCompareRow  `json:"rows"`
	Same            int               `json:"same"` // 모든 칸이 같은 학생 수
	// PercentileWithNonAcademic 석차·백분율이 200점(비교과포함) 기준인 파일(석차백분율산출)
	PercentileWithNonAcademic bool `json:"percentileWithNonAcademic"`
}

func diffValues(p, n *NiceCompareValues) []string {
	var out []string
	add := func(name string, a, b float64) {
		if math.Abs(a-b) > 0.005 {
			out = append(out, name)
		}
	}
	add("rank", p.Rank, n.Rank)
	add("percentile", p.Percentile, n.Percentile)
	add("academic", p.Academic, n.Academic)
	add("attendance", p.Attendance, n.Attendance)
	add("volunteer", p.Volunteer, n.Volunteer)
	add("creative", p.Creative, n.Creative)
	add("behavior", p.Behavior, n.Behavior)
	add("total", p.Total, n.Total)
	return out
}

func compareHints(diffs []string, res *calc.StudentCalcResult, enrolledDiffer bool) []string {
	has := map[string]bool{}
	for _, d := range diffs {
		has[d] = true
	}
	var hints []string
	if has["academic"] || has["rank"] || has["percentile"] {
		switch {
		case enrolledDiffer:
			hints = append(hints, "재적수가 달라 석차백분율이 다릅니다(소인수 학교 설정·전입생 확인)")
		case res != nil && !res.ThirdYearFinalUsed:
			hints = append(hints, "꼬미입시에 3학년 2학기 성적이 없어 3-1 성적으로 대신한 예상값입니다(3-2 교과 성적을 다시 올려 주세요)")
		default:
			hints = append(hints, "교과 성적 자료가 다릅니다(나이스 성적 파일을 다시 올렸는지 확인)")
		}
	}
	if has["attendance"] {
		hints = append(hints, "출결이 다릅니다(학년별 출결 자료·상담 화면 학년별 값 확인)")
	}
	if has["volunteer"] {
		hints = append(hints, "봉사가 다릅니다(학년별 봉사 시간·전입생 환산 확인)")
	}
	if has["creative"] || has["behavior"] {
		hints = append(hints, "창체·행발 가산점 체크가 다릅니다(상담 화면 가산점과 나이스 항목별점수관리 확인)")
	}
	return hints
}

// NiceGeneralComparison 올린 나이스 값과 꼬미입시 계산값을 학생마다 맞춰 본다(학년부장, 전교).
func (dm *DBManager) NiceGeneralComparison() (*NiceComparison, error) {
	config, err := dm.GetSchoolConfig()
	if err != nil || config == nil {
		return nil, fmt.Errorf("학교 설정을 불러올 수 없습니다")
	}
	niceRows, summary, err := dm.GetNiceGeneralFinal(config.AdmissionYear)
	if err != nil {
		return nil, err
	}
	all, err := dm.GetAllStudents(config.ClassCount)
	if err != nil {
		return nil, err
	}
	results, err := calc.CalculateGrades(all, config.IsSmallSchool)
	if err != nil && len(all) > 0 {
		return nil, err
	}
	enrolled := 0
	if len(results) > 0 {
		enrolled = results[0].TotalStudents
		if config.IsSmallSchool && enrolled < 10 {
			enrolled = 10
		}
	}
	return buildNiceComparison(niceRows, summary, results, enrolled, true, 0), nil
}

// NiceClassComparison 담임: 나이스 반별 석차 연명부를 우리 반 꼬미입시 값과 맞춰 본다(저장하지 않음).
// 담임 PC에는 전교 학생 자료가 없으므로 꼬미입시 값은 배포받은 전교 석차 기준(상담 화면과 같은 값)을 쓴다.
func (dm *DBManager) NiceClassComparison(file *parser.NiceRankFile, classNum int) (*NiceComparison, error) {
	if file == nil {
		return nil, fmt.Errorf("읽은 자료가 없습니다")
	}
	results, err := dm.GetClassGrades(classNum, false)
	if err != nil {
		return nil, err
	}
	var rows []parser.NiceRankRow
	for _, r := range file.Rows {
		if r.ClassNum == classNum && r.HasScores {
			rows = append(rows, r)
		}
	}
	if len(rows) == 0 {
		return nil, fmt.Errorf("%d반 학생의 점수가 들어 있지 않습니다. 나이스 산출을 마친 뒤 받은 우리 반 석차 연명부인지 확인해 주세요", classNum)
	}
	enrolled := 0
	if len(results) > 0 {
		enrolled = results[0].TotalStudents
	}
	summary := &NiceFinalSummary{Count: len(rows), Scored: len(rows), Enrolled: file.Enrolled, Kind: file.Kind}
	return buildNiceComparison(rows, summary, results, enrolled, false, classNum), nil
}

// totalRanks 200점 내신(교과+비교과) 기준 석차·백분율(나이스 "석차백분율(비교과포함)"과 같은 방식, 같은 점수는 같은 석차).
func totalRanks(results []calc.StudentCalcResult, enrolled int) map[string][2]float64 {
	idx := make([]int, len(results))
	for i := range idx {
		idx[i] = i
	}
	sort.SliceStable(idx, func(a, b int) bool { return results[idx[a]].GeneralTotalScore > results[idx[b]].GeneralTotalScore })
	out := map[string][2]float64{}
	rank := 0
	for pos, i := range idx {
		if pos == 0 || math.Abs(results[idx[pos-1]].GeneralTotalScore-results[i].GeneralTotalScore) > 0.005 {
			rank = pos + 1
		}
		pct := 0.0
		if enrolled > 0 {
			pct = math.Round(float64(rank)/float64(enrolled)*10000) / 100
		}
		out[fmt.Sprintf("%d|%s", results[i].ClassNum, normalizeNum(results[i].StudentNum))] = [2]float64{float64(rank), pct}
	}
	return out
}

// buildNiceComparison 나이스 줄과 꼬미입시 계산값을 맞춘다.
// 석차백분율산출 파일의 석차·백분율은 "비교과포함"(200점 기준)이라 꼬미입시도 200점 기준으로 계산해 비교한다.
// 담임 PC(wholeSchool=false)는 전교 200점 석차를 알 수 없어 그 두 칸은 비교하지 않는다.
func buildNiceComparison(niceRows []parser.NiceRankRow, summary *NiceFinalSummary, results []calc.StudentCalcResult, enrolled int, wholeSchool bool, classNum int) *NiceComparison {
	out := &NiceComparison{Summary: summary, ProgramEnrolled: enrolled, Rows: []NiceCompareRow{}}
	withNonAcademic := summary != nil && summary.Kind == "석차백분율산출"
	out.PercentileWithNonAcademic = withNonAcademic
	var totals map[string][2]float64
	if withNonAcademic && wholeSchool {
		totals = totalRanks(results, enrolled)
	}
	enrolledDiffer := summary != nil && summary.Enrolled > 0 && enrolled > 0 && summary.Enrolled != enrolled
	byKey := map[string]*calc.StudentCalcResult{}
	for i := range results {
		byKey[fmt.Sprintf("%d|%s", results[i].ClassNum, normalizeNum(results[i].StudentNum))] = &results[i]
	}
	values := func(r *calc.StudentCalcResult, key string) *NiceCompareValues {
		v := &NiceCompareValues{float64(r.Rank), r.Percentile, r.FinalScore, r.AttendanceScore, r.VolunteerScore, r.CreativeScore, r.BehaviorScore, r.GeneralTotalScore}
		if withNonAcademic {
			if t, ok := totals[key]; ok {
				v.Rank, v.Percentile = t[0], t[1]
			}
		}
		return v
	}
	seen := map[string]bool{}
	for _, n := range niceRows {
		key := fmt.Sprintf("%d|%s", n.ClassNum, n.StudentNum)
		seen[key] = true
		row := NiceCompareRow{ClassNum: n.ClassNum, StudentNum: n.StudentNum, Name: n.Name,
			Nice: &NiceCompareValues{n.Rank, n.Percentile, n.Academic, n.Attendance, n.Volunteer, n.Creative, n.Behavior, n.Final}}
		res := byKey[key]
		if res == nil {
			row.Hints = []string{"꼬미입시에 없는 학생입니다(반·번호 확인)"}
			out.Rows = append(out.Rows, row)
			continue
		}
		row.Name = res.Name
		row.Program = values(res, key)
		row.Diffs = diffValues(row.Program, row.Nice)
		if withNonAcademic && !wholeSchool {
			row.Diffs = dropDiffs(row.Diffs, "rank", "percentile")
		}
		if nm := strings.TrimSpace(n.Name); nm != "" && !strings.Contains(nm, "000") && nm != res.Name {
			row.Hints = append(row.Hints, fmt.Sprintf("이름이 다릅니다(나이스: %s)", nm))
		}
		row.Hints = append(row.Hints, compareHints(row.Diffs, res, enrolledDiffer)...)
		if len(row.Diffs) == 0 && len(row.Hints) == 0 {
			out.Same++
		}
		out.Rows = append(out.Rows, row)
	}
	for i := range results {
		r := &results[i]
		key := fmt.Sprintf("%d|%s", r.ClassNum, normalizeNum(r.StudentNum))
		if seen[key] || len(niceRows) == 0 || (classNum > 0 && r.ClassNum != classNum) {
			continue
		}
		out.Rows = append(out.Rows, NiceCompareRow{ClassNum: r.ClassNum, StudentNum: normalizeNum(r.StudentNum), Name: r.Name,
			Program: values(r, key), Hints: []string{"나이스 연명부에 없는 학생입니다"}})
	}
	return out
}

func dropDiffs(diffs []string, names ...string) []string {
	out := diffs[:0]
	for _, d := range diffs {
		drop := false
		for _, n := range names {
			drop = drop || d == n
		}
		if !drop {
			out = append(out, d)
		}
	}
	return out
}

// NiceGeneralFinalScores 원서대장용: "반|번호" → 나이스 내신성적(그 학년도에 올린 것만).
func (dm *DBManager) NiceGeneralFinalScores(year int) (map[string]float64, *NiceFinalSummary, error) {
	rows, summary, err := dm.GetNiceGeneralFinal(year)
	if err != nil {
		return nil, nil, err
	}
	out := map[string]float64{}
	for _, r := range rows {
		out[fmt.Sprintf("%d|%s", r.ClassNum, r.StudentNum)] = r.Final
	}
	return out, summary, nil
}
