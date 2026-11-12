package database

import (
	"encoding/json"
	"regexp"
	"sort"
	"strings"
)

// formulaYearPattern 산출식 버전에 적힌 요강 학년도(예: "울산마이스터고-일반/2027요강", "2027-general-ulsan")
var formulaYearPattern = regexp.MustCompile(`(20\d{2})`)

func formulaYear(version string) string {
	return formulaYearPattern.FindString(version)
}

// 여러 해 추세: 학교·학과·전형별로 학년도마다 관내 통합·우리 학교 합격선과 지원·합격 인원,
// 그해 점수의 만점·산출식 버전을 모은다. 산출식(만점)이 바뀐 해는 점수끼리 바로 비교하면 안 되므로 표시한다.

// TrendPoint 한 학년도의 추세 값. 자료가 없는 항목은 0이다.
type TrendPoint struct {
	AdmissionYear     int     `json:"admissionYear"`
	RegionSchools     int     `json:"regionSchools"`     // 관내 공유 참여 학교 수
	RegionApplicants  int     `json:"regionApplicants"`  // 관내 지원 인원
	RegionAccepted    int     `json:"regionAccepted"`    // 관내 합격 인원
	RegionAcceptedMin float64 `json:"regionAcceptedMin"` // 관내 합격 최저점
	RegionAcceptedAvg float64 `json:"regionAcceptedAvg"`
	RegionStage1Min   float64 `json:"regionStage1Min"` // 관내 1차 합격 최저점(1·2차 전형)
	RegionRejectedMax float64 `json:"regionRejectedMax"`
	OurApplicants     int     `json:"ourApplicants"`
	OurAccepted       int     `json:"ourAccepted"`
	OurAcceptedMin    float64 `json:"ourAcceptedMin"`
	TotalMax          float64 `json:"totalMax"`       // 그해 점수 만점(점수 상세 기록에서, 없으면 0)
	FormulaVersion    string  `json:"formulaVersion"` // 그해 가장 많이 쓴 산출식 버전
	FormulaChanged    bool    `json:"formulaChanged"` // 앞 학년도와 만점 또는 산출식 버전이 다름
}

// GetAnalysisYears 입시 자료(우리 학교 원서·지난 입시 기록·관내 공유·커트라인)가 있는 학년도(최근부터).
func (dm *DBManager) GetAnalysisYears() ([]int, error) {
	years := map[int]bool{}
	if records, err := dm.schoolRecordsWithHistory(); err == nil {
		for _, r := range records {
			if r.AdmissionYear > 0 {
				years[r.AdmissionYear] = true
			}
		}
	}
	if cutoffs, err := dm.GetCutoffs(); err == nil {
		for _, c := range cutoffs {
			if c.Year > 0 {
				years[c.Year] = true
			}
		}
	}
	if err := dm.InitSharedDatabaseTables(); err == nil {
		if db, err := dm.OpenDB(dm.GetConfigDBPath()); err == nil {
			if rows, err := db.Query(`SELECT DISTINCT admission_year FROM shared_participating_schools`); err == nil {
				for rows.Next() {
					var y int
					if rows.Scan(&y) == nil && y > 0 {
						years[y] = true
					}
				}
				rows.Close()
			}
			db.Close()
		}
	}
	out := make([]int, 0, len(years))
	for y := range years {
		out = append(out, y)
	}
	sort.Sort(sort.Reverse(sort.IntSlice(out)))
	return out, nil
}

type versionCount struct {
	totalMax map[float64]int
	version  map[string]int
}

func (v *versionCount) add(detailsJSON, version string) {
	if v.totalMax == nil {
		v.totalMax, v.version = map[float64]int{}, map[string]int{}
	}
	if strings.TrimSpace(detailsJSON) != "" {
		var d struct {
			TotalMax float64 `json:"totalMax"`
		}
		if json.Unmarshal([]byte(detailsJSON), &d) == nil && d.TotalMax > 0 {
			v.totalMax[d.TotalMax]++
		}
	}
	if version = strings.TrimSpace(version); version != "" {
		v.version[version]++
	}
}

func mostCommonFloat(m map[float64]int) float64 {
	best, n := 0.0, 0
	for k, c := range m {
		if c > n || (c == n && k > best) {
			best, n = k, c
		}
	}
	return best
}

func mostCommonString(m map[string]int) string {
	best, n := "", 0
	for k, c := range m {
		if c > n || (c == n && k > best) {
			best, n = k, c
		}
	}
	return best
}

// GetAdmissionTrend 학교·학과(빈 값이면 학교·전형 전체)·전형의 학년도별 추세(오래된 해부터).
func (dm *DBManager) GetAdmissionTrend(highSchool, department, track string) ([]TrendPoint, error) {
	school := normalizeCutoffSchool(highSchool)
	dept := normalizeCutoffDept(department)
	trk := normalizeCutoffTrack(track)
	years, _ := dm.GetAnalysisYears()
	points := map[int]*TrendPoint{}
	versions := map[int]*versionCount{}
	point := func(y int) *TrendPoint {
		if points[y] == nil {
			points[y] = &TrendPoint{AdmissionYear: y}
			versions[y] = &versionCount{}
		}
		return points[y]
	}

	// 1) 관내 통합(분석 화면 "관내 통합"과 같은 집계)
	for _, y := range years {
		st, err := dm.GetConsolidatedAdmissionStats(y, school, dept, trk, 1)
		if err != nil || st == nil || st.TotalApplicants == 0 {
			continue
		}
		p := point(y)
		p.RegionSchools, p.RegionApplicants, p.RegionAccepted = st.TotalParticipatingSchool, st.TotalApplicants, st.AcceptedCount
		p.RegionAcceptedMin, p.RegionAcceptedAvg, p.RegionStage1Min = st.AcceptedMin, st.AcceptedAvg, st.Stage1PassMin
		if st.RejectedCount > 0 {
			p.RegionRejectedMax = st.RejectedMax
		}
	}
	// 관내 자료의 만점·산출식 버전
	if db, err := dm.OpenDB(dm.GetConfigDBPath()); err == nil {
		query := `SELECT admission_year, COALESCE(score_details_json, ''), COALESCE(formula_version, '') FROM shared_anonymous_scores
			WHERE high_school = ? AND track = ?`
		args := []interface{}{school, trk}
		if dept != "" {
			query += ` AND department = ?`
			args = append(args, dept)
		}
		if rows, err := db.Query(query, args...); err == nil {
			for rows.Next() {
				var y int
				var details, version string
				if rows.Scan(&y, &details, &version) == nil && points[y] != nil {
					versions[y].add(details, version)
				}
			}
			rows.Close()
		}
		db.Close()
	}

	// 2) 우리 학교(지금 학급 기록 + 지난 학년도 익명 보관 기록)
	records, err := dm.schoolRecordsWithHistory()
	if err != nil {
		return nil, err
	}
	for _, r := range records {
		if normalizeCutoffSchool(r.SchoolName) != school || normalizeCutoffTrack(r.Track) != trk || r.AdmissionYear <= 0 {
			continue
		}
		rd := strings.TrimSpace(r.AssignedDepartment)
		if rd == "" && len(r.Preferences) > 0 {
			rd = strings.TrimSpace(r.Preferences[0])
		}
		if dept != "" && normalizeCutoffDept(rd) != dept {
			continue
		}
		status := strings.TrimSpace(r.Status)
		decided := strings.Contains(status, "합격") || strings.Contains(status, "진학")
		if !decided && !strings.Contains(status, "지원") {
			continue
		}
		p := point(r.AdmissionYear)
		p.OurApplicants++
		if decided && !strings.Contains(status, "불합격") {
			p.OurAccepted++
			if r.Score > 0 && (p.OurAcceptedMin == 0 || r.Score < p.OurAcceptedMin) {
				p.OurAcceptedMin = r.Score
			}
		}
		if r.ScoreDetails != nil {
			b, _ := json.Marshal(r.ScoreDetails)
			versions[r.AdmissionYear].add(string(b), r.ScoreDetails.FormulaVersion)
		}
	}

	out := make([]TrendPoint, 0, len(points))
	for _, p := range points {
		v := versions[p.AdmissionYear]
		p.TotalMax = mostCommonFloat(v.totalMax)
		p.FormulaVersion = mostCommonString(v.version)
		out = append(out, *p)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].AdmissionYear < out[j].AdmissionYear })
	for i := 1; i < len(out); i++ {
		prev, cur := out[i-1], out[i]
		maxChanged := prev.TotalMax > 0 && cur.TotalMax > 0 && prev.TotalMax != cur.TotalMax
		// 요강 학년도가 적힌 버전끼리만 비교한다(예전 기록은 버전에 학년도가 없음).
		py, cy := formulaYear(prev.FormulaVersion), formulaYear(cur.FormulaVersion)
		versionChanged := py != "" && cy != "" && py != cy
		out[i].FormulaChanged = maxChanged || versionChanged
	}
	return out, nil
}
