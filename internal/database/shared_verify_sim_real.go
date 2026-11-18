package database

import (
	"encoding/json"
	"fmt"
	"math"
	"math/rand"
	"sort"
	"strings"
	"time"

	"PHGC/internal/calc"
	"PHGC/internal/model"
)

// 현실형 가상 자료(SimConfig.Realistic): 관내 전체 지원자를 만들어 요강 모집정원으로 실제처럼 선발한 뒤,
// 공유에 참여한 학교(앞쪽 Schools곳)의 원서만 파일로 낸다. 기본 생성기에 없던 것:
//   - 학과별 모집정원(server-data/highschools.json)과 1·2지망 배정: 1지망에서 떨어지고 2지망 학과에 남은 자리로 합격
//   - 경쟁률 차이와 미달: 전형마다 지원 배율이 다르고, 정원보다 적게 지원하면 점수와 관계없이 모두 합격
//   - 관내 일부 학교만 참여: 관내 중학교 DistrictSchools곳 중 Schools곳만 공유하므로 비교 자료가 성기다
//   - 중학교별 성적 편차: 학교마다 학생 점수 평균이 다르다(내신 경향·학생 구성)
//   - 정원 외 합격(특수교육대상자 등)을 통계 제외로 표시하지 않고 보낸 원서: sim:extra_unmarked
//   - 마이스터고 2단계(면접 등) 탈락, 후기 일반고는 대부분 배정되고 일부만 미배정

// SimDept 학과별 요강 모집정원(가상 자료용).
type SimDept struct {
	High, Track, Dept string
	Quota             int
}

// LoadSimDepts highschools.json에서 그 학년도 학과별 모집정원을 읽는다(학교 이름은 산출 규칙 이름으로 맞춤).
func LoadSimDepts(data []byte, year int) ([]SimDept, error) {
	var doc struct {
		Schools []struct {
			Name   string `json:"name"`
			Quotas []struct {
				AdmissionYear int    `json:"admissionYear"`
				Track         string `json:"track"`
				Department    string `json:"department"`
				Quota         int    `json:"quota"`
			} `json:"quotas"`
		} `json:"schools"`
	}
	if err := json.Unmarshal(data, &doc); err != nil {
		return nil, err
	}
	var out []SimDept
	for _, s := range doc.Schools {
		high := strings.TrimSuffix(s.Name, "등학교")
		for _, q := range s.Quotas {
			if q.AdmissionYear == year && q.Department != "" && q.Quota > 0 {
				out = append(out, SimDept{High: high, Track: q.Track, Dept: q.Department, Quota: q.Quota})
			}
		}
	}
	return out, nil
}

var simMeister = map[string]bool{"울산마이스터고": true, "울산에너지고": true, "현대공업고": true}

type simApplicant struct {
	school        int
	score         float64
	first, second int // 학과 번호(second -1 = 2지망 없음)
	assigned      int // 배정 학과(-1 = 1차 불합격)
	byPref2       bool
	stage2Fail    bool
}

// simTruthKey 오류 섞기·검출 판단에 쓰는 실제 합격선 열쇠(학과까지).
func simTruthKey(high, track, dept string) string { return high + "|" + track + "|" + dept }

func buildRealSimPackages(cfg SimConfig) []SharedPackageV2 {
	rng := rand.New(rand.NewSource(cfg.Seed))
	district := cfg.DistrictSchools
	if district < cfg.Schools {
		district = cfg.Schools
	}
	shift := make([]float64, district)
	for i := range shift {
		shift[i] = rng.NormFloat64() * 0.04
	}
	pkgs := make([]SharedPackageV2, cfg.Schools)
	for s := range pkgs {
		pkgs[s] = SharedPackageV2{Cover: SharedPackageCover{SchoolName: fmt.Sprintf("가상%02d중학교", s+1), AdmissionYear: cfg.Year, CreatedAt: time.Now().UTC(), FormatVersion: 2}}
	}
	truth := map[string]float64{} // 학과(또는 학교 전체)별 실제 1차 합격 최저점
	depts := map[string][]SimDept{}
	for _, d := range cfg.Depts {
		depts[d.High+"|"+d.Track] = append(depts[d.High+"|"+d.Track], d)
	}
	for _, rule := range calc.AllSchoolRules {
		list := depts[rule.SchoolName+"|"+rule.TrackName]
		if len(list) == 0 {
			list = []SimDept{{High: rule.SchoolName, Track: rule.TrackName, Quota: 20}}
		}
		simSelectTrack(rng, rule, list, shift, cfg, pkgs, truth)
	}
	simGeneral(rng, shift, cfg, pkgs, truth)
	for s := range pkgs {
		injectSimErrorsWith(rng, &pkgs[s], truth, cfg)
		pkgs[s].Cover.RecordCount = len(pkgs[s].AnonymousRecords)
	}
	return pkgs
}

// simSelectTrack 학교·전형 하나: 지원자를 만들고 1지망 → 2지망(남은 자리) 순으로 선발한다.
func simSelectTrack(rng *rand.Rand, rule calc.SchoolRule, list []SimDept, shift []float64, cfg SimConfig, pkgs []SharedPackageV2, truth map[string]float64) {
	max := rule.TotalMax
	total := 0
	weights := make([]float64, len(list))
	for i, d := range list {
		total += d.Quota
		weights[i] = float64(d.Quota) * math.Exp(rng.NormFloat64()*0.45) // 학과 인기
	}
	center := 1.1
	if simMeister[rule.SchoolName] {
		center = 1.6
	}
	ratio := center * math.Exp(rng.NormFloat64()*0.35) // 지원 배율: 1 아래면 미달
	n := int(math.Round(ratio * float64(total)))
	mu := 0.55 + 0.25*rng.Float64()
	apps := make([]simApplicant, n)
	for i := range apps {
		s := rng.Intn(len(shift))
		score := round2(max * math.Min(1, math.Max(0.25, mu+shift[s]+rng.NormFloat64()*0.1)))
		first := pickWeighted(rng, weights, -1)
		second := -1
		if len(list) > 1 && rng.Float64() < 0.8 {
			second = pickWeighted(rng, weights, first)
		}
		apps[i] = simApplicant{school: s, score: score, first: first, second: second, assigned: -1}
	}
	sort.Slice(apps, func(i, j int) bool { return apps[i].score > apps[j].score })
	seats := make([]int, len(list))
	for i, d := range list {
		seats[i] = d.Quota
	}
	for i := range apps { // 1지망
		if seats[apps[i].first] > 0 {
			seats[apps[i].first]--
			apps[i].assigned = apps[i].first
		}
	}
	for i := range apps { // 2지망: 1지망에서 떨어진 학생을 남은 자리에 점수 순으로
		if a := &apps[i]; a.assigned < 0 && a.second >= 0 && seats[a.second] > 0 {
			seats[a.second]--
			a.assigned, a.byPref2 = a.second, true
		}
	}
	stage2 := 0.03
	if simMeister[rule.SchoolName] {
		stage2 = 0.15
	}
	for i := range apps {
		a := &apps[i]
		if a.assigned < 0 {
			continue
		}
		a.stage2Fail = rng.Float64() < stage2
		for _, key := range []string{simTruthKey(rule.SchoolName, rule.TrackName, list[a.assigned].Dept), simTruthKey(rule.SchoolName, rule.TrackName, "")} {
			if v, ok := truth[key]; !ok || a.score < v {
				truth[key] = a.score
			}
		}
	}
	version := fmt.Sprintf("%s-%s/%d요강", rule.SchoolName, rule.TrackName, cfg.Year)
	for _, a := range apps {
		if a.school >= len(pkgs) {
			continue // 공유에 참여하지 않은 학교
		}
		rec := AnonymousApplicationRecord{HighSchool: rule.SchoolName, Track: rule.TrackName, PreferenceRank: 1, Score: a.score, ScoreBasis: "sim:ok", FormulaVersion: version,
			ScoreDetails: model.ApplicationScoreDetails{TotalScore: a.score, TotalMax: max, FormulaVersion: version}}
		switch {
		case a.assigned < 0:
			rec.Department, rec.FirstStageResult, rec.Status = list[a.first].Dept, "불합격", "불합격"
			if cfg.RejectDeptAs2nd > 0 && a.second >= 0 && rng.Float64() < cfg.RejectDeptAs2nd {
				rec.Department = list[a.second].Dept // 불합격자 학과를 2지망으로 적은 경우(입력 관행 차이)
			}
		default:
			rec.Department, rec.FirstStageResult, rec.Status = list[a.assigned].Dept, "합격", "합격"
			if a.byPref2 {
				rec.PreferenceRank, rec.ScoreBasis = 2, "sim:ok_2nd"
			}
			if a.stage2Fail {
				rec.Status = "불합격"
			}
		}
		pkgs[a.school].AnonymousRecords = append(pkgs[a.school].AnonymousRecords, rec)
	}
	for s := range pkgs { // 정원 외 합격을 통계 제외로 표시하지 않고 보낸 경우
		if rng.Float64() < 0.02 {
			score := round2(max * math.Max(0.2, 0.38+rng.NormFloat64()*0.06))
			pkgs[s].AnonymousRecords = append(pkgs[s].AnonymousRecords, AnonymousApplicationRecord{HighSchool: rule.SchoolName, Track: rule.TrackName,
				Department: list[rng.Intn(len(list))].Dept, PreferenceRank: 1, Score: score, Status: "합격", FirstStageResult: "합격", ScoreBasis: "sim:extra_unmarked",
				FormulaVersion: version, ScoreDetails: model.ApplicationScoreDetails{TotalScore: score, TotalMax: max, FormulaVersion: version}})
		}
	}
}

// simGeneral 후기 일반고: 참여 학교마다 60~140명, 관내 하위 약 7%가 미배정.
func simGeneral(rng *rand.Rand, shift []float64, cfg SimConfig, pkgs []SharedPackageV2, truth map[string]float64) {
	cutoff := round2(200 * (0.7 - 1.48*0.15)) // 평균 0.7·표준편차 0.15에서 하위 약 7%
	truth[simTruthKey(GeneralHighSchoolKey, GeneralTrackKey, "")] = cutoff
	version := fmt.Sprintf("%d-general-ulsan", cfg.Year)
	for s := range pkgs {
		n := 60 + rng.Intn(81)
		for k := 0; k < n; k++ {
			score := round2(200 * math.Min(1, math.Max(0.2, 0.7+shift[s]+rng.NormFloat64()*0.15)))
			status := "불합격"
			if score >= cutoff {
				status = "합격"
			}
			pkgs[s].AnonymousRecords = append(pkgs[s].AnonymousRecords, AnonymousApplicationRecord{HighSchool: GeneralHighSchoolKey, Track: GeneralTrackKey,
				PreferenceRank: 1, Score: score, Status: status, ScoreBasis: "sim:ok", FormulaVersion: version})
		}
	}
}

func pickWeighted(rng *rand.Rand, w []float64, skip int) int {
	sum := 0.0
	for i, v := range w {
		if i != skip {
			sum += v
		}
	}
	x := rng.Float64() * sum
	for i, v := range w {
		if i == skip {
			continue
		}
		if x -= v; x <= 0 {
			return i
		}
	}
	for i := len(w) - 1; i >= 0; i-- {
		if i != skip {
			return i
		}
	}
	return 0
}
