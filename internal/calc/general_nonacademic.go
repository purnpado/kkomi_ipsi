package calc

import (
	"encoding/json"
	"fmt"

	"PHGC/internal/parser"
)

// 후기 일반고 비교과(40점) 산출 — 2027학년도 울산광역시 후기 일반고 입학전형요강 Ⅴ-5.
//   출석 16 = 기본 4 + 학년별 4점(결석 1일당 0.5점 감점, 8일 이상 0점)
//   봉사 8  = 기본 2 + 학년별 2점(4시간 이상 2.0, 3시간 1.7, 2시간 1.4, 1시간 1.0)
//   행발 8·창체 8 = 기본 5 + 학년별 가산 1점(담임 수기 입력)
// 출결·봉사는 반드시 학년별로 계산한다. 누적값에 곱하는 근사는 한 학년에 결석·봉사가
// 몰린 학생의 점수를 크게 틀리게 만든다(예: 1학년에만 봉사 12시간 → 실제 4점, 근사 8점).

type generalNonAcademic struct {
	AttendanceScore, VolunteerScore, BehaviorScore, CreativeScore, Total float64
	PendingBonus                                                         float64 // 아직 정해지지 않아 더 받을 수 있는 가산점
	BonusEntered                                                         bool
	PerGradeExact                                                        bool // 출결·봉사를 세 학년 모두 학년별 실제 값(수기·나이스)으로 계산했는지
}

func findExcelStudent(all map[int][]parser.StudentExcelData, target StudentCalcResult) *parser.StudentExcelData {
	for _, students := range all {
		for i := range students {
			if students[i].ClassNum == target.ClassNum && students[i].StudentNum == target.StudentNum && students[i].Name == target.Name {
				return &students[i]
			}
		}
	}
	return nil
}

// generalYearValues는 학년별 값(결석 환산일수 또는 봉사시간)을 고른다.
// 우선순위: ① 담임 수기 학년별 입력 ② 나이스 자료의 학년별 값 ③ 누적값을 학년별로 고르게 나눈 예상치.
// exact는 세 학년 모두 ①·②로 정해졌는지 여부다.
func generalYearValues(manual func(int) (int, bool), neis func(int) (int, bool), total int) (values [3]int, exact bool) {
	exact = true
	known, knownSum := 0, 0
	unknown := []int{}
	for g := 1; g <= 3; g++ {
		if v, ok := manual(g); ok {
			values[g-1] = v
		} else if v, ok := neis(g); ok {
			values[g-1] = v
		} else {
			exact = false
			unknown = append(unknown, g)
			continue
		}
		known++
		knownSum += values[g-1]
	}
	if len(unknown) > 0 {
		rest := total - knownSum
		if rest < 0 {
			rest = 0
		}
		each, extra := rest/len(unknown), rest%len(unknown)
		for i, g := range unknown {
			values[g-1] = each
			if i < extra {
				values[g-1]++
			}
		}
	}
	return values, exact
}

func calculateGeneralNonAcademic(all map[int][]parser.StudentExcelData, target StudentCalcResult) (generalNonAcademic, bool) {
	s := findExcelStudent(all, target)
	if s == nil {
		return generalNonAcademic{}, false
	}
	extra := map[string]interface{}{}
	if s.ExtraData != "" && json.Unmarshal([]byte(s.ExtraData), &extra) != nil {
		extra = map[string]interface{}{}
	}
	attendance, volunteer := map[string]int{}, map[string]int{}
	_ = json.Unmarshal([]byte(s.AttendanceData), &attendance)
	_ = json.Unmarshal([]byte(s.VolunteerData), &volunteer)
	extraInt := func(key string) (int, bool) { v, ok := extra[key].(float64); return int(v), ok }
	extraBool := func(key string) bool { v, _ := extra[key].(bool); return v }

	// 출결: 미인정 지각·조퇴·결과는 학년별로 합산해 3회 = 결석 1일(2회 이하 버림).
	neisAbsence := func(g int) (int, bool) {
		keys := []string{"absence", "late", "early", "result"}
		found := false
		for _, k := range keys {
			if _, ok := attendance[fmt.Sprintf("%d_%s", g, k)]; ok {
				found = true
			}
		}
		if !found {
			return 0, false
		}
		p := func(k string) int { return attendance[fmt.Sprintf("%d_%s", g, k)] }
		return p("absence") + (p("late")+p("early")+p("result"))/3, true
	}
	totalAbsence := attendance["absence"] + (attendance["late"]+attendance["early"]+attendance["result"])/3
	absenceDays, attExact := generalYearValues(func(g int) (int, bool) { return extraInt(fmt.Sprintf("general_absence_%d", g)) },
		neisAbsence, totalAbsence)

	neisHours := func(g int) (int, bool) { v, ok := volunteer[fmt.Sprintf("%d_time", g)]; return v, ok }
	hours, volExact := generalYearValues(func(g int) (int, bool) { return extraInt(fmt.Sprintf("general_volunteer_%d", g)) },
		neisHours, volunteer["total_time"])

	r := generalNonAcademic{AttendanceScore: 4, VolunteerScore: 2, BehaviorScore: 5, CreativeScore: 5}
	for g := 0; g < 3; g++ {
		r.AttendanceScore += generalAttendanceYearScore(absenceDays[g])
		r.VolunteerScore += generalVolunteerYearScore(hours[g])
	}

	// 행발·창체 가산점: 징계 등으로 가산 제외된 학년은 인정하지 않는다.
	r.BonusEntered = extraBool("general_bonus_entered")
	openSlots := 0.0
	for g := 1; g <= 3; g++ {
		for _, kind := range []string{"haengbal", "changche"} {
			checked := extraBool(fmt.Sprintf("%s_%d", kind, g)) && !extraBool(fmt.Sprintf("%s_disqualified_%d", kind, g))
			if checked {
				if kind == "haengbal" {
					r.BehaviorScore++
				} else {
					r.CreativeScore++
				}
				continue
			}
			// 입력을 마치지 않았으면 모든 빈 칸이, 입력을 마쳤어도 3학년 칸은 11/30 전까지 바뀔 수 있다.
			if !r.BonusEntered || g == 3 {
				openSlots++
			}
		}
	}
	r.PerGradeExact = attExact && volExact
	complete := r.PerGradeExact && r.BonusEntered
	if complete {
		openSlots = 0
	}
	r.PendingBonus = openSlots
	r.AttendanceScore = roundToTwoDecimals(r.AttendanceScore)
	r.VolunteerScore = roundToTwoDecimals(r.VolunteerScore)
	r.Total = roundToTwoDecimals(r.AttendanceScore + r.VolunteerScore + r.BehaviorScore + r.CreativeScore)
	return r, complete
}

func generalAttendanceYearScore(days int) float64 {
	if days <= 0 {
		return 4
	}
	if days >= 8 {
		return 0
	}
	return 4 - float64(days)*0.5
}

func generalVolunteerYearScore(hours int) float64 {
	switch {
	case hours >= 4:
		return 2
	case hours == 3:
		return 1.7
	case hours == 2:
		return 1.4
	case hours == 1:
		return 1
	}
	return 0
}
