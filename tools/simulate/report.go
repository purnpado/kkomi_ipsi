package main

import (
	"fmt"
	"math"
	"sort"
	"strings"

	"PHGC/internal/database"
)

type prediction struct {
	kind     string // 전기, 후기
	level    string
	admitted bool
}

// judge 프론트엔드 core/admissionJudgment.js와 같은 규칙(학교 기본: 만점의 2% 여유폭).
// noRejection: 기준선이 불합격 사례 없는 합격 최저점이면 그보다 낮은 점수는 "판단 근거 부족"이다.
func judge(score, cutoff, max, maxRejected float64, noRejection bool) string {
	if cutoff <= 0 {
		return "기준 없음"
	}
	m := max * 0.02
	switch {
	case noRejection && score < cutoff:
		return "판단 근거 부족"
	case score >= cutoff+m || (maxRejected > 0 && score > maxRejected && score >= cutoff):
		return "안정"
	case score >= cutoff:
		return "적정"
	case score >= cutoff-m:
		return "소신"
	}
	return "도전"
}

func (sm *sim) viewer() *middleSchool {
	for _, m := range sm.schools {
		if m.participating {
			return m
		}
	}
	return nil
}

// predict 직전 학년도 관내 공유 결과만으로 올해 학생을 판정하고 실제 결과와 짝지어 둔다.
func (sm *sim) predict(yr *yearResult, students []*student) {
	if len(sm.years) == 0 {
		return
	}
	dm := sm.viewer().dm
	prev := yr.year - 1
	cache := map[string]*database.ConsolidatedStatsResult{}
	general, _ := dm.GetConsolidatedGeneralCutoff(prev)
	basis := newBasisIndex(dm)
	for _, s := range students {
		if !s.school.participating {
			continue
		}
		seen := map[string]bool{}
		for _, a := range s.apps {
			if seen[a.category] {
				continue
			}
			seen[a.category] = true
			switch a.category {
			case "meister", "special":
				k := fmt.Sprintf("%s|%s|%s", a.school, a.prefs[0], a.track)
				st, ok := cache[k]
				if !ok {
					st, _ = dm.GetConsolidatedAdmissionStats(prev, shortSchool(a.school), a.prefs[0], a.track, 1)
					cache[k] = st
				}
				level := "기준 없음"
				if st != nil && st.AcceptedCount > 0 {
					rej := 0.0
					if st.RejectedCount > 0 {
						rej = st.RejectedMax
					}
					school := shortSchool(a.school)
					level = judge(a.score, st.AcceptedMin, a.maxScore, rej, basis.noRejection(prev, school, a.prefs[0], a.track, st.AcceptedMin))
					if level == "판단 근거 부족" {
						level += "·" + basis.competitionNote(prev, school, a.prefs[0], a.track)
					}
				}
				yr.predictions = append(yr.predictions, prediction{"전기", level, a.status == "합격"})
			case "general":
				level := "기준 없음"
				if general != nil && general.Base.AcceptedMin > 0 {
					level = judge(s.baseV1, general.Base.AcceptedMin, 200, general.Base.RejectedMax, false)
				}
				yr.predictions = append(yr.predictions, prediction{"후기", level, a.status == "합격"})
			}
		}
	}
}

type trackTruth struct {
	school, track, dept string
	admittedMin         float64
	stage1Min           float64
	admitted, applied   int
}

func truthBy(yr *yearResult, withDept bool) map[string]*trackTruth {
	out := map[string]*trackTruth{}
	for _, a := range yr.apps {
		if a.category != "meister" && a.category != "special" {
			continue
		}
		dept := ""
		if withDept {
			dept = a.assigned
			if dept == "" {
				dept = a.prefs[0]
			}
		}
		k := a.school + "|" + a.track + "|" + dept
		t := out[k]
		if t == nil {
			t = &trackTruth{school: a.school, track: a.track, dept: dept, admittedMin: math.Inf(1), stage1Min: math.Inf(1)}
			out[k] = t
		}
		t.applied++
		if a.status == "합격" {
			t.admitted++
			t.admittedMin = math.Min(t.admittedMin, a.score)
		}
		if a.firstStage == "합격" {
			t.stage1Min = math.Min(t.stage1Min, a.score)
		}
	}
	return out
}

func fv(v float64) string {
	if v <= 0 || math.IsInf(v, 0) {
		return "-"
	}
	return fmt.Sprintf("%.2f", v)
}

func sortedKeys(m map[string]*trackTruth) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

// ownCutoffMin 우리 학교(관점 학교) 커트라인 표에서 학교·전형 최저점(학과 중 최저)
func ownCutoffMin(cuts []database.CutoffInfo, year int, school, track string) float64 {
	best := math.Inf(1)
	for _, c := range cuts {
		if c.Year == year && shortSchool(c.SchoolName) == shortSchool(school) && c.Track == track && c.MinValue > 0 {
			best = math.Min(best, c.MinValue)
		}
	}
	return best
}

func (sm *sim) report() string {
	var b strings.Builder
	w := func(format string, a ...interface{}) { fmt.Fprintf(&b, format+"\n", a...) }
	view := sm.viewer()
	w("# 꼬미입시 가상 입시 시뮬레이션 보고서\n")
	w("- 지역: 관내 참여 중학교 %d곳(꼬미입시 사용·공유) + 비참여 %d곳(경쟁자). 관점 학교: %s", countPart(sm.schools, true), countPart(sm.schools, false), view.name)
	w("- 학년도: %d ~ %d (%d년). 해마다 새 학생 집단·정원(±15%%)·학교 인기·경쟁률이 바뀐다.", sm.years[0].year, sm.years[len(sm.years)-1].year, len(sm.years))
	w("- 실제 합격선은 지역 전체(비참여 학교 포함) 결과, 관내 추정은 참여 학교 공유 자료만으로 프로그램이 계산한 값이다.\n")
	cuts, _ := view.dm.GetCutoffs()
	var deptErrs []float64
	deptCovered, deptTotal := 0, 0
	for _, yr := range sm.years {
		w("## %d 고입\n", yr.year)
		w("- 지역 학생 %d명 · 마이스터고 경쟁률 배수 %.2f · 특성화고 %.2f · 후기 지원 %d명, 정원 %d명", yr.regionN, yr.compMeister, yr.compSpecial, yr.generalPool, yr.generalQuota)
		w("\n| 고교 | 전형 | 지원 | 합격 | 실제 합격선 | 관내 추정 | %s 커트라인 | 실제 1차 합격선 | 관내 1차 합격선 |", view.name)
		w("|---|---|---:|---:|---:|---:|---:|---:|---:|")
		truth := truthBy(yr, false)
		for _, k := range sortedKeys(truth) {
			t := truth[k]
			cons, stage1 := math.Inf(1), math.Inf(1)
			for _, hs := range sm.catalog {
				if hs.Name != t.school {
					continue
				}
				for _, d := range hs.Departments {
					st, err := view.dm.GetConsolidatedAdmissionStats(yr.year, shortSchool(t.school), d, t.track, 1)
					if err == nil && st != nil {
						if st.AcceptedCount > 0 {
							cons = math.Min(cons, st.AcceptedMin)
						}
						if st.Stage1PassMin > 0 {
							stage1 = math.Min(stage1, st.Stage1PassMin)
						}
					}
				}
			}
			w("| %s | %s | %d | %d | %s | %s | %s | %s | %s |", shortSchool(t.school), t.track, t.applied, t.admitted, fv(t.admittedMin), fv(cons), fv(ownCutoffMin(cuts, yr.year, t.school, t.track)), fv(t.stage1Min), fv(stage1))
		}
		for _, k := range sortedKeys(truthBy(yr, true)) {
			t := truthBy(yr, true)[k]
			if t.admitted == 0 {
				continue
			}
			deptTotal++
			st, err := view.dm.GetConsolidatedAdmissionStats(yr.year, shortSchool(t.school), t.dept, t.track, 1)
			if err == nil && st != nil && st.AcceptedCount > 0 {
				deptCovered++
				deptErrs = append(deptErrs, (st.AcceptedMin-t.admittedMin)/maxOf(yr, t)*100)
			}
		}
		g, _ := view.dm.GetConsolidatedGeneralCutoff(yr.year)
		w("\n**후기 일반고**: 실제 합격선 총점 %.2f · 실제 배정자 기본 지표 최저 %.2f", yr.generalCut, yr.generalBase)
		if g != nil {
			w("- 관내 추정(기본 지표, 표본 %d명): 실제 사례 범위 %s ~ %s · 정원 비율 추정선 %s%s", g.Base.SampleCount, fv(g.Base.RangeLow), fv(g.Base.RangeHigh), fv(g.Base.QuotaCutoff), map[bool]string{true: " · 표본 부족 표시", false: ""}[g.Base.SmallSample])
			w("- 관내 추정(완전 총점, 가산점 입력 학교만 표본 %d명): 범위 %s ~ %s · 정원 비율 추정선 %s\n", g.Total.SampleCount, fv(g.Total.RangeLow), fv(g.Total.RangeHigh), fv(g.Total.QuotaCutoff))
		}
	}
	w("## 학과 단위 관내 추정 정확도 (전 학년도)\n")
	sort.Float64s(deptErrs)
	w("- 실제 합격자가 있는 학교·전형·학과 %d개 중 관내 자료로 합격선이 나온 곳 %d개(%.0f%%)", deptTotal, deptCovered, pct(deptCovered, deptTotal))
	if len(deptErrs) > 0 {
		within := 0
		sum := 0.0
		for _, e := range deptErrs {
			sum += math.Abs(e)
			if math.Abs(e) <= 2 {
				within++
			}
		}
		w("- 관내 추정 − 실제 합격선(만점 대비 %%): 중앙값 %.2f%%, 평균 절대 오차 %.2f%%, 최대 %.2f%% · 만점의 2%% 안에 든 곳 %.0f%%",
			deptErrs[len(deptErrs)/2], sum/float64(len(deptErrs)), deptErrs[len(deptErrs)-1], pct(within, len(deptErrs)))
		w("- 관내 추정은 참여 학교 합격자 최저점이라 실제 합격선보다 높거나 같게 나온다(보수적).\n")
	}
	w("## 직전 학년도 관내 자료로 판정했을 때 실제 합격률\n")
	w("| 구분 | 판정 | 학생 | 실제 합격 | 합격률 |")
	w("|---|---|---:|---:|---:|")
	for _, kind := range []string{"전기", "후기"} {
		for _, level := range []string{"안정", "적정", "소신", "도전", "판단 근거 부족·작년 미달", "판단 근거 부족·작년 경쟁 있음", "판단 근거 부족·경쟁률 미입력", "기준 없음"} {
			n, ok := 0, 0
			for _, yr := range sm.years {
				for _, p := range yr.predictions {
					if p.kind == kind && p.level == level {
						n++
						if p.admitted {
							ok++
						}
					}
				}
			}
			if n > 0 {
				w("| %s | %s | %d | %d | %.0f%% |", kind, level, n, ok, pct(ok, n))
			}
		}
	}
	w("\n## 인수인계로 이어진 자료 점검 (마지막 학년도 %s 프로그램 기준)\n", view.name)
	w("해마다 새 폴더에 새로 설치하고 지난 학년도 인수인계 파일 하나만 받았다. 마지막 해 프로그램 안에 모든 학년도 자료가 남아 있어야 한다.\n")
	w("| 학년도 | 학급 수(%s) | 우리 학교 커트라인 | 결과 확정 | 지난 입시 결과(익명) | 실제 원서 수(%s) | 관내 공유 참여 |", view.name, view.name)
	w("|---|---:|---:|---|---:|---:|---:|")
	years := map[int]int{}
	for _, c := range cuts {
		years[c.Year]++
	}
	history, _ := view.dm.GetAdmissionHistory()
	histCount := map[int]int{}
	for _, h := range history {
		histCount[h.AdmissionYear]++
	}
	for i, yr := range sm.years {
		closure, _ := view.dm.GetAdmissionClosure(yr.year)
		status := "없음"
		if closure != nil && closure.Status != "" {
			status = closure.Status
		}
		schools, _ := view.dm.GetParticipatingSchools(yr.year)
		actual := 0
		for _, a := range yr.apps {
			if a.stu.school == view {
				actual++
			}
		}
		classes := 0
		if i < len(view.classHistory) {
			classes = view.classHistory[i]
		}
		w("| %d | %d | %d | %s | %d | %d | %d개교 |", yr.year, classes, years[yr.year], status, histCount[yr.year], actual, len(schools))
	}
	return b.String()
}

func maxOf(yr *yearResult, t *trackTruth) float64 {
	for _, a := range yr.apps {
		if a.school == t.school && a.track == t.track && a.maxScore > 0 {
			return a.maxScore
		}
	}
	return 100
}

func pct(a, b int) float64 {
	if b == 0 {
		return 0
	}
	return float64(a) / float64(b) * 100
}

func countPart(list []*middleSchool, part bool) int {
	n := 0
	for _, m := range list {
		if m.participating == part {
			n++
		}
	}
	return n
}
