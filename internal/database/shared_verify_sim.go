package database

import (
	"database/sql"
	"fmt"
	"math"
	"math/rand"
	"strings"
	"time"

	"PHGC/internal/calc"
	"PHGC/internal/model"
)

// 관내 공유 자료 검증 검출률 측정용 가상 자료(tools/verifysim, shared_verify_sim_test.go).
// 실제 산출 규칙(학교·전형·만점)을 쓰고, 학교 여러 곳의 합격·불합격 결과를 만든 뒤 오류를 일부러 섞는다.
// 어떤 오류를 섞었는지는 점수 기준(score_basis)에 "sim:<종류>"로 적어 두고, 점검 결과와 맞춰 검출률을 잰다.

// SimErrorTypes 섞는 오류 종류와 뜻.
var SimErrorTypes = []struct{ Code, Name string }{
	{"flip_far", "합격선보다 크게 낮은 불합격자를 합격으로 잘못 입력"},
	{"flip_near", "합격선 근처 불합격자를 합격으로 잘못 입력(잡기 어려움)"},
	{"decimal", "점수 소수점 위치 오타(85.3 → 8.53)"},
	{"over_max", "점수 자릿수 오타로 만점 초과(85.3 → 853)"},
	{"unknown", "학교 이름 오타"},
	{"status", "알 수 없는 결과 값"},
	{"old_formula", "이전 요강 산출식 점수"},
	{"manual", "원서 점수를 손으로 고침(산출 기록과 다름)"},
}

// SimConfig 가상 자료 설정.
type SimConfig struct {
	Seed      int64
	Schools   int     // 관내 학교 수(공유에 참여한 학교)
	Year      int     // 고입 연도
	ErrorRate float64 // 원서 한 건에 오류를 섞을 확률
	// Realistic 현실형 생성기(shared_verify_sim_real.go): 학과 정원·1·2지망 배정·미달·일부 학교만 참여·학교별 편차·정원 외 합격.
	Realistic       bool
	DistrictSchools int       // 현실형: 관내 중학교 전체 수(이 중 Schools곳만 공유)
	Depts           []SimDept // 현실형: 학과별 모집정원(LoadSimDepts)
	RejectDeptAs2nd float64   // 현실형: 1차 불합격자의 학과를 1지망 대신 2지망으로 적는 비율(입력 관행 차이 견딤 시험)
}

type simTarget struct {
	high, track string
	max         float64
	general     bool
	cutoff      float64
}

// BuildSimSharedPackages 학교별 가상 공유 파일을 만든다.
func BuildSimSharedPackages(cfg SimConfig) []SharedPackageV2 {
	if cfg.Realistic {
		return buildRealSimPackages(cfg)
	}
	rng := rand.New(rand.NewSource(cfg.Seed))
	var targets []simTarget
	for _, rule := range calc.AllSchoolRules {
		targets = append(targets, simTarget{high: rule.SchoolName, track: rule.TrackName, max: rule.TotalMax})
	}
	targets = append(targets, simTarget{high: GeneralHighSchoolKey, track: GeneralTrackKey, max: 200, general: true})
	truth := map[string]float64{}
	for i := range targets {
		targets[i].cutoff = round2((0.55 + 0.3*rng.Float64()) * targets[i].max)
		truth[simTruthKey(targets[i].high, targets[i].track, "")] = targets[i].cutoff
	}
	var pkgs []SharedPackageV2
	for s := 0; s < cfg.Schools; s++ {
		pkg := SharedPackageV2{Cover: SharedPackageCover{SchoolName: fmt.Sprintf("가상%02d중학교", s+1), AdmissionYear: cfg.Year, CreatedAt: time.Now().UTC(), FormatVersion: 2}}
		for _, t := range targets {
			n := rng.Intn(6)
			if t.general {
				n = 20 + rng.Intn(20)
			}
			for k := 0; k < n; k++ {
				pkg.AnonymousRecords = append(pkg.AnonymousRecords, simRecord(rng, t, cfg))
			}
		}
		injectSimErrorsWith(rng, &pkg, truth, cfg)
		pkg.Cover.RecordCount = len(pkg.AnonymousRecords)
		pkgs = append(pkgs, pkg)
	}
	return pkgs
}

func simRecord(rng *rand.Rand, t simTarget, cfg SimConfig) AnonymousApplicationRecord {
	score := round2(math.Min(t.max, math.Max(0.2*t.max, t.cutoff+0.02*t.max+rng.NormFloat64()*0.1*t.max)))
	rec := AnonymousApplicationRecord{HighSchool: t.high, Track: t.track, PreferenceRank: 1, Score: score, ScoreBasis: "sim:ok"}
	if t.general {
		rec.FormulaVersion = fmt.Sprintf("%d-general-ulsan", cfg.Year)
		rec.Status = "불합격"
		if score >= t.cutoff+rng.NormFloat64()*0.01*t.max {
			rec.Status = "합격"
		}
		return rec
	}
	rec.FormulaVersion = fmt.Sprintf("%s-%s/%d요강", t.high, t.track, cfg.Year)
	rec.ScoreDetails = model.ApplicationScoreDetails{TotalScore: score, TotalMax: t.max, FormulaVersion: rec.FormulaVersion}
	if score >= t.cutoff {
		rec.FirstStageResult = "합격"
		rec.Status = "합격"
		if rng.Float64() < 0.15 {
			rec.Status = "불합격" // 면접 등 2차 탈락
		}
	} else {
		rec.FirstStageResult, rec.Status = "불합격", "불합격"
	}
	return rec
}

// injectSimErrorsWith truth: 실제 합격선(simTruthKey, 학과 → 학교 전체 순으로 찾음).
func injectSimErrorsWith(rng *rand.Rand, pkg *SharedPackageV2, truth map[string]float64, cfg SimConfig) {
	for i := range pkg.AnonymousRecords {
		if rng.Float64() >= cfg.ErrorRate {
			continue
		}
		r := &pkg.AnonymousRecords[i]
		max := sharedScoreMax(r.HighSchool, r.Track)
		kind := SimErrorTypes[rng.Intn(len(SimErrorTypes))].Code
		switch kind {
		case "flip_far", "flip_near":
			// 조건에 맞는 불합격 원서를 이 학교 파일에서 골라 합격으로 바꾼다(없으면 섞지 않음).
			j := pickFlipTarget(rng, pkg, truth, kind)
			if j < 0 {
				continue
			}
			pkg.AnonymousRecords[j].Status = "합격"
			pkg.AnonymousRecords[j].ScoreBasis = "sim:" + kind
			continue
		case "decimal":
			r.Score = round2(r.Score / 10)
			r.ScoreDetails.TotalScore = r.Score // 산출 기록까지 함께 틀린 경우
		case "over_max":
			r.Score = round2(r.Score * 10)
			r.ScoreDetails.TotalScore = r.Score
		case "unknown":
			r.HighSchool = strings.Replace(r.HighSchool, "고", "고교", 1)
		case "status":
			r.Status = "합격(추가)"
		case "old_formula":
			if r.HighSchool == GeneralHighSchoolKey {
				r.FormulaVersion = fmt.Sprintf("%d-general-ulsan", cfg.Year-1)
			} else {
				r.FormulaVersion = fmt.Sprintf("%s-%s/%d요강", r.HighSchool, r.Track, cfg.Year-1)
			}
		case "manual":
			if r.ScoreDetails.TotalScore <= 0 {
				continue
			}
			r.Score = round2(math.Min(max, r.Score+3+rng.Float64()*7))
		}
		r.ScoreBasis = "sim:" + kind
	}
}

// pickFlipTarget 아직 오류를 섞지 않은 불합격 원서 중 합격선과의 차이가 조건에 맞는 것 하나.
func pickFlipTarget(rng *rand.Rand, pkg *SharedPackageV2, truth map[string]float64, kind string) int {
	var cands []int
	for j, r := range pkg.AnonymousRecords {
		if r.Status != "불합격" || r.ScoreBasis != "sim:ok" {
			continue
		}
		max := sharedScoreMax(r.HighSchool, r.Track)
		line, ok := truth[simTruthKey(r.HighSchool, r.Track, r.Department)]
		if !ok {
			line = truth[simTruthKey(r.HighSchool, r.Track, "")]
		}
		gap := line - r.Score
		if (kind == "flip_far" && gap >= 0.1*max) || (kind == "flip_near" && gap > 0 && gap <= 0.04*max) {
			cands = append(cands, j)
		}
	}
	if len(cands) == 0 {
		return -1
	}
	return cands[rng.Intn(len(cands))]
}

func round2(v float64) float64 { return math.Round(v*100) / 100 }

// SimMetrics 오류 종류별 검출률과 정상 자료 오탐률.
type SimMetrics struct {
	Injected       map[string]int `json:"injected"`
	Detected       map[string]int `json:"detected"`
	CleanCount     int            `json:"cleanCount"`
	CleanFlagged   int            `json:"cleanFlagged"`   // 정상인데 무엇이든 걸린 수
	CleanErrorFlag int            `json:"cleanErrorFlag"` // 정상인데 "오류"로 걸린 수
	// 정상 원서 종류별(ok, ok_2nd = 2지망 배정 합격) 수와 걸린 수
	CleanByKind   map[string]int `json:"cleanByKind"`
	CleanFlagKind map[string]int `json:"cleanFlagKind"`
}

// simCleanKind 정상 자료 표시(sim:ok, sim:ok_*)인지.
func simCleanKind(kind string) bool { return kind == "ok" || strings.HasPrefix(kind, "ok_") }

// EvaluateSimVerification 점검 결과를 섞은 오류와 맞춰 본다.
func (dm *DBManager) EvaluateSimVerification(report *SharedVerifyReport) (SimMetrics, error) {
	m := SimMetrics{Injected: map[string]int{}, Detected: map[string]int{}, CleanByKind: map[string]int{}, CleanFlagKind: map[string]int{}}
	flagged := map[int64]string{}
	for _, is := range report.Issues {
		if flagged[is.RecordID] != "error" {
			flagged[is.RecordID] = is.Level
		}
	}
	err := dm.withSharedDB(func(db *sql.DB) error {
		rows, err := db.Query(`SELECT id, score_basis FROM shared_anonymous_scores`)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var id int64
			var basis string
			if rows.Scan(&id, &basis) != nil {
				continue
			}
			kind := strings.TrimPrefix(basis, "sim:")
			level, hit := flagged[id]
			if simCleanKind(kind) {
				m.CleanCount++
				m.CleanByKind[kind]++
				if hit {
					m.CleanFlagged++
					m.CleanFlagKind[kind]++
				}
				if level == "error" {
					m.CleanErrorFlag++
				}
				continue
			}
			m.Injected[kind]++
			if hit {
				m.Detected[kind]++
			}
		}
		return nil
	})
	return m, err
}

// SimErrorCodes 측정 표에 쓰는 오류 종류 순서(현실형 생성기의 정원 외 미표시 포함).
func SimErrorCodes() []string {
	codes := make([]string, 0, len(SimErrorTypes)+1)
	for _, t := range SimErrorTypes {
		codes = append(codes, t.Code)
	}
	return append(codes, SimExtraUnmarked)
}

// SimExtraUnmarked 현실형 생성기: 정원 외 합격(특수교육대상자 등)을 통계 제외로 표시하지 않고 보낸 원서.
// 실제 합격이지만 합격선 통계를 끌어내리므로 "확인 필요"로 걸리는 것이 바람직하다.
const SimExtraUnmarked = "extra_unmarked"
