package main

import (
	"encoding/json"
	"math"
	"math/rand"
	"os"
	"sort"
	"strings"

	"PHGC/internal/calc"
)

// 고교 입시 선발 규칙(가상). 실제 요강의 구조를 따른다.
//   마이스터고: 1차 내신 1.3배수 → 2차 1차 점수 + 면접, 정원 총원제·선지망 우선 학과 배정, 특별 탈락자는 일반으로 자동 전형
//   특성화고 취업희망자: 학과별 1차 1.5배수(학교별 올림·버림) → 2차 심층심사, 1지망 1개 학과만
//   특성화고 일반: 내신만으로 선발, 선지망 우선 학과 배정
//   후기 일반고: 총점(200) 순으로 정원만큼 선발, 동점자는 모두 합격

type highSchool struct {
	Name        string   `json:"name"`
	Type        string   `json:"type"`
	Departments []string `json:"departments"`
}

type application struct {
	stu        *student
	category   string // meister, special, self_foreign, general
	school     string // 고교 전체 이름
	track      string // 일반, 특별, 취업희망자, 후기 일반계고, 자사고·외고 전형
	prefs      []string
	score      float64 // 1차 점수(원서 시기)
	maxScore   float64
	status     string // 합격, 불합격
	firstStage string // 2단계 전형만: 합격, 불합격
	assigned   string
	interview  float64
	final      float64
}

func loadCatalog(path string) ([]highSchool, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var doc struct {
		Schools []highSchool `json:"schools"`
	}
	if err := json.Unmarshal(b, &doc); err != nil {
		return nil, err
	}
	out := []highSchool{}
	for _, s := range doc.Schools {
		if (s.Type == "meister" || s.Type == "special") && len(s.Departments) > 0 {
			out = append(out, s)
		}
	}
	return out, nil
}

func seatKey(school, track, dept string) string { return school + "/" + track + "/" + dept }

// planSeats 학년도별 정원(지역 학생 수에 비례, 해마다 ±15% 변동)
func planSeats(rng *rand.Rand, catalog []highSchool, regionN int) map[string]int {
	seats := map[string]int{}
	for _, hs := range catalog {
		f := 0.85 + rng.Float64()*0.3
		var total int
		var split map[string]float64
		if hs.Type == "meister" {
			total = int(math.Round(float64(regionN) * 0.012 * f))
			split = map[string]float64{"특별": 0.3, "일반": 0.7}
		} else {
			total = int(math.Round(float64(regionN) * 0.026 * f))
			split = map[string]float64{"취업희망자": 0.4, "일반": 0.6}
		}
		for track, share := range split {
			n := int(math.Round(float64(total) * share))
			per, extra := n/len(hs.Departments), n%len(hs.Departments)
			for i, d := range hs.Departments {
				q := per
				if i < extra {
					q++
				}
				if q < 1 {
					q = 1
				}
				seats[seatKey(hs.Name, track, d)] = q
			}
		}
	}
	return seats
}

func trackSeats(seats map[string]int, school, track string) int {
	n := 0
	for k, v := range seats {
		if strings.HasPrefix(k, school+"/"+track+"/") {
			n += v
		}
	}
	return n
}

// interviewScore 면접(0~100): 내신과 약하게 관련되고 무작위 편차가 크다.
func interviewScore(rng *rand.Rand, a *application) float64 {
	v := 60 + 60*(a.score/a.maxScore-0.75) + rng.NormFloat64()*14
	return math.Max(0, math.Min(100, v))
}

// interviewWeight 2차 총점에서 면접 비중(요강의 2차 배점 비율을 단순화)
func interviewWeight(school, track string) float64 {
	s := shortSchool(school)
	switch {
	case track != "취업희망자":
		return 0.3 // 마이스터고 면접·신체검사
	case s == "울산여자상업고":
		return 0.2
	case s == "울산산업고" || s == "울산상업고":
		return 0.4
	}
	return 0.5
}

func byScore(list []*application) {
	sort.SliceStable(list, func(i, j int) bool { return list[i].score > list[j].score })
}

func byFinal(list []*application) {
	sort.SliceStable(list, func(i, j int) bool { return list[i].final > list[j].final })
}

// assignByPreference 정원 총원제: 점수 순으로 선지망부터 학과를 배정한다. 배정 못 받으면 불합격.
func assignByPreference(ordered []*application, seats map[string]int, school, track string, limit int) {
	left := map[string]int{}
	for k, v := range seats {
		if strings.HasPrefix(k, school+"/"+track+"/") {
			left[strings.TrimPrefix(k, school+"/"+track+"/")] = v
		}
	}
	admitted := 0
	for _, a := range ordered {
		a.status = "불합격"
		if admitted >= limit {
			continue
		}
		for _, d := range a.prefs {
			if left[d] > 0 {
				left[d]--
				a.status, a.assigned = "합격", d
				admitted++
				break
			}
		}
	}
}

// runMeister 한 마이스터고·전형의 1차(1.3배수)·2차(면접) 선발
func runMeister(rng *rand.Rand, apps []*application, seats map[string]int, school, track string) {
	quota := trackSeats(seats, school, track)
	byScore(apps)
	n1 := int(math.Ceil(float64(quota) * 1.3))
	var second []*application
	for i, a := range apps {
		if i < n1 {
			a.firstStage = "합격"
			a.interview = interviewScore(rng, a)
			w := interviewWeight(school, track)
			a.final = (a.score/a.maxScore)*100*(1-w) + a.interview*w
			second = append(second, a)
		} else {
			a.firstStage, a.status = "불합격", "불합격"
		}
	}
	byFinal(second)
	assignByPreference(second, seats, school, track, quota)
}

// runVocationalJob 특성화고 취업희망자: 학과별 1차 1.5배수(학교별 끝수 처리) → 2차 심층심사
func runVocationalJob(rng *rand.Rand, apps []*application, seats map[string]int, school string) {
	stage, _ := calc.FindAdmissionStage(school, "취업희망자")
	byDept := map[string][]*application{}
	for _, a := range apps {
		byDept[a.prefs[0]] = append(byDept[a.prefs[0]], a)
	}
	// 학과 순서를 고정한다(맵 순회 순서는 실행마다 달라 면접 점수 난수가 다른 학생에게 돌아가는 문제가 있었다).
	depts := make([]string, 0, len(byDept))
	for dept := range byDept {
		depts = append(depts, dept)
	}
	sort.Strings(depts)
	for _, dept := range depts {
		list := byDept[dept]
		q := seats[seatKey(school, "취업희망자", dept)]
		byScore(list)
		if stage.Multiplier == 0 { // 울산기술공업고: 면접 점수 미반영, 단일 단계
			for i, a := range list {
				a.status = "불합격"
				if i < q {
					a.status, a.assigned = "합격", dept
				}
			}
			continue
		}
		raw := float64(q) * stage.Multiplier
		n1 := int(math.Ceil(raw))
		if stage.Rounding == "버림" {
			n1 = int(math.Floor(raw))
		}
		var second []*application
		for i, a := range list {
			if i < n1 {
				a.firstStage = "합격"
				a.interview = interviewScore(rng, a)
				w := interviewWeight(school, "취업희망자")
				a.final = (a.score/a.maxScore)*100*(1-w) + a.interview*w
				second = append(second, a)
			} else {
				a.firstStage, a.status = "불합격", "불합격"
			}
		}
		byFinal(second)
		for i, a := range second {
			a.status = "불합격"
			if i < q {
				a.status, a.assigned = "합격", dept
			}
		}
	}
}

// runVocationalGeneral 특성화고 일반전형: 내신 순, 선지망 우선 배정
func runVocationalGeneral(apps []*application, seats map[string]int, school string) {
	byScore(apps)
	assignByPreference(apps, seats, school, "일반", trackSeats(seats, school, "일반"))
}

// runGeneral 후기 일반고: 실제 총점 순으로 정원만큼(동점자 모두 합격). 실제 합격선을 돌려준다.
func runGeneral(apps []*application, quota int) float64 {
	sort.SliceStable(apps, func(i, j int) bool { return apps[i].stu.trueGeneralTotal() > apps[j].stu.trueGeneralTotal() })
	if quota >= len(apps) {
		for _, a := range apps {
			a.status = "합격"
		}
		if len(apps) == 0 {
			return 0
		}
		return apps[len(apps)-1].stu.trueGeneralTotal()
	}
	cut := apps[quota-1].stu.trueGeneralTotal()
	for _, a := range apps {
		a.status = "불합격"
		if a.stu.trueGeneralTotal() >= cut {
			a.status = "합격"
		}
	}
	return cut
}
