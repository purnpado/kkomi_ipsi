package database

import (
	"fmt"
	"sort"
	"strings"
)

// 학과 지망 전략: 지난 학년도 학과별로 "몇 지망으로 배정된 학생이 몇 명, 최저 몇 점"이었는지 모은다.
// 마이스터고·특성화고 일반전형은 정원 총원제로 합격자를 정한 뒤 점수 순으로 선지망부터 학과를 배정하므로,
//   - n지망 배정 최저점: 작년에 이 학과를 n지망으로 써서 배정받은 가장 낮은 점수
//   - 2지망 이하 배정자가 있음: 작년엔 1지망 배정 뒤에도 자리가 남아, 이 학과를 1지망으로 쓴 합격자는 모두 배정됨
// 관내 공유 기록은 배정 학과(불합격이면 1지망 학과)와 그 학과의 지망 순위만 담고 있어 개인을 알 수 없다.

type PreferenceRankStat struct {
	Rank     int     `json:"rank"`
	Count    int     `json:"count"`
	MinScore float64 `json:"minScore"`
	MaxScore float64 `json:"maxScore"`
}

type DepartmentPreferenceStat struct {
	Department     string               `json:"department"`
	AssignedTotal  int                  `json:"assignedTotal"`
	ByRank         []PreferenceRankStat `json:"byRank"`         // 지망 순위별 배정
	RejectedFirst  int                  `json:"rejectedFirst"`  // 이 학과를 1지망으로 쓰고 불합격(관내 표본)
	SeatsLeftOver  bool                 `json:"seatsLeftOver"`  // 2지망 이하 배정자가 있음
	FirstRankMin   float64              `json:"firstRankMin"`   // 1지망 배정 최저점
	LowestAssigned float64              `json:"lowestAssigned"` // 어떤 지망으로든 배정된 최저점
}

type PreferenceStrategy struct {
	AdmissionYear int                        `json:"admissionYear"`
	HighSchool    string                     `json:"highSchool"`
	Track         string                     `json:"track"`
	SchoolMin     float64                    `json:"schoolMin"` // 학교·전형 합격 최저점
	Records       int                        `json:"records"`   // 쓴 기록 수
	Departments   []DepartmentPreferenceStat `json:"departments"`
}

type prefAcc struct {
	stat  DepartmentPreferenceStat
	ranks map[int]*PreferenceRankStat
}

func (p *PreferenceStrategy) add(accs map[string]*prefAcc, dept string, rank int, status, firstStage string, score float64) {
	dept = normalizeCutoffDept(dept)
	if dept == "" {
		return
	}
	acc := accs[dept]
	if acc == nil {
		acc = &prefAcc{stat: DepartmentPreferenceStat{Department: dept}, ranks: map[int]*PreferenceRankStat{}}
		accs[dept] = acc
	}
	status = strings.TrimSpace(status)
	switch {
	case strings.Contains(status, "불합격"):
		if firstStage != "합격" || rank <= 1 { // 면접 탈락도 1지망 학과로 기록된다
			acc.stat.RejectedFirst++
		}
	case strings.Contains(status, "합격") || strings.Contains(status, "진학"):
		if rank < 1 {
			rank = 1
		}
		r := acc.ranks[rank]
		if r == nil {
			r = &PreferenceRankStat{Rank: rank}
			acc.ranks[rank] = r
		}
		r.Count++
		if score > 0 && (r.MinScore == 0 || score < r.MinScore) {
			r.MinScore = score
		}
		if score > r.MaxScore {
			r.MaxScore = score
		}
		acc.stat.AssignedTotal++
		if score > 0 && (p.SchoolMin == 0 || score < p.SchoolMin) {
			p.SchoolMin = score
		}
	default:
		return
	}
	p.Records++
}

// GetPreferenceStrategy 학년도·고교·전형의 학과별 지망 순위별 배정 기록(우리 학교 + 관내 공유, 개인정보 없음).
func (dm *DBManager) GetPreferenceStrategy(admissionYear int, highSchool, track string) (*PreferenceStrategy, error) {
	school := normalizeCutoffSchool(highSchool)
	trk := normalizeCutoffTrack(track)
	res := &PreferenceStrategy{AdmissionYear: admissionYear, HighSchool: school, Track: trk}
	accs := map[string]*prefAcc{}

	// 1) 우리 학교: 원서의 지망 목록에서 배정 학과의 순위를 구한다.
	records, err := dm.schoolRecordsWithHistory()
	if err != nil {
		return nil, err
	}
	for _, r := range records {
		if r.AdmissionYear != admissionYear || normalizeCutoffSchool(r.SchoolName) != school || normalizeCutoffTrack(r.Track) != trk {
			continue
		}
		dept := strings.TrimSpace(r.AssignedDepartment)
		rank := 1
		if dept == "" && len(r.Preferences) > 0 {
			dept = strings.TrimSpace(r.Preferences[0])
		}
		for i, p := range r.Preferences {
			if strings.TrimSpace(p) == dept {
				rank = i + 1
				break
			}
		}
		res.add(accs, dept, rank, r.Status, r.FirstStageResult, r.Score)
	}

	// 2) 관내 공유(우리 학교가 낸 자료는 위에서 셌으므로 뺀다)
	if err := dm.InitSharedDatabaseTables(); err != nil {
		return nil, err
	}
	ownSchool := ""
	if config, _ := dm.GetSchoolConfig(); config != nil {
		ownSchool = strings.TrimSpace(config.SchoolName)
	}
	db, err := dm.OpenDB(dm.GetConfigDBPath())
	if err != nil {
		return nil, err
	}
	defer db.Close()
	rows, err := db.Query(`SELECT s.department, s.preference_rank, s.status, s.score, COALESCE(s.first_stage_result, '')
		FROM shared_anonymous_scores s JOIN shared_participating_schools p ON p.id = s.school_pkg_id
		WHERE s.admission_year = ? AND s.high_school = ? AND s.track = ? AND p.school_name <> ?`, admissionYear, school, trk, ownSchool)
	if err != nil {
		return nil, fmt.Errorf("관내 공유 자료 조회 실패: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var dept, status, firstStage string
		var rank int
		var score float64
		if err := rows.Scan(&dept, &rank, &status, &score, &firstStage); err != nil {
			return nil, err
		}
		res.add(accs, dept, rank, status, firstStage, score)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	for _, acc := range accs {
		st := acc.stat
		for _, r := range acc.ranks {
			st.ByRank = append(st.ByRank, *r)
			if r.Rank >= 2 && r.Count > 0 {
				st.SeatsLeftOver = true
			}
			if r.MinScore > 0 && (st.LowestAssigned == 0 || r.MinScore < st.LowestAssigned) {
				st.LowestAssigned = r.MinScore
			}
		}
		sort.Slice(st.ByRank, func(i, j int) bool { return st.ByRank[i].Rank < st.ByRank[j].Rank })
		if r := acc.ranks[1]; r != nil {
			st.FirstRankMin = r.MinScore
		}
		res.Departments = append(res.Departments, st)
	}
	sort.Slice(res.Departments, func(i, j int) bool { return res.Departments[i].Department < res.Departments[j].Department })
	return res, nil
}
