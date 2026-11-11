package calc

import (
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"

	"PHGC/internal/parser"
)

// SubjectRecord 파싱된 과목 성적 1개
type SubjectRecord struct {
	Grade      string // 학년 (1, 2, 3)
	Semester   string // 학기 (1, 2)
	Subject    string // 과목
	AchieveStr string // 성취도(수강자수) 예: "A(150)", "P"
}

// StudentCalcResult 가산출된 학생 성적 결과
type StudentCalcResult struct {
	ClassNum   int
	StudentNum string
	Name       string

	S11 float64
	S12 float64
	S13 float64
	S21 float64
	S22 float64

	TotalSubjectScore    float64 // 5개 학기 합산
	Rank                 int     // 석차 (동석차 반영)
	TotalStudents        int     // 전체 학생수
	Percentile           float64 // 백분율
	FinalScore           float64 // 160 - 0.96 * 백분율
	AttendanceScore      float64 // 후기 일반고 비교과 출결(16)
	VolunteerScore       float64 // 후기 일반고 비교과 봉사(8)
	BehaviorScore        float64 // 후기 일반고 비교과 행발(8)
	CreativeScore        float64 // 후기 일반고 비교과 창체(8)
	NonAcademicScore     float64 // 비교과 합계(40)
	GeneralBaseScore     float64 // 기본 지표: 교과 + 출결 + 봉사 + 창체·행발 기본 10점(가산점 제외, 관내 비교용)
	GeneralTotalHigh     float64 // 아직 정해지지 않은 가산점을 모두 받는다고 볼 때의 상한 총점
	GeneralBonusEntered  bool    // 담임이 창체·행발 가산점 입력을 마쳤는지(저장 이력)
	GeneralPerGradeExact bool    // 출결·봉사를 학년별 실제 값으로 계산했는지(아니면 누적값 분배 예상)
	GeneralTotalScore    float64 // 후기 일반고 내신 총점(200)
	GeneralDataComplete  bool    // 학년별 비교과 입력 완료 여부
	GeneralProjected     bool    // 11/30 마감 전 누적자료 기준 예상치
	ThirdYearFinalUsed   bool    // S22에 실제 3학년 2학기 성적을 반영했는지(false면 3-1 성적으로 대신한 예상치)
	hasThirdYearFinal    bool
	s22Projected         float64
	gradePresent         [3]bool    // 학년별 성적 기록 유무(중도 입국·유학 등 학년 결손 판단)
	tieKeys              [4]float64 // 동점자 비교용 학기 평균 성취도(가중치 없음): 3-2, 3-1, 2-2, 2-1
}

// CalculateGrades 전체 학생들의 내신 성적을 계산하여 석차 및 최종 점수를 반환
func CalculateGrades(allStudents map[int][]parser.StudentExcelData, isSmallSchool bool) ([]StudentCalcResult, error) {
	var results []StudentCalcResult

	// 1. 개별 학생의 교과 성적 산출 (S11 ~ S22)
	for _, students := range allStudents {
		for _, s := range students {
			calc, err := calcSingleStudent(s)
			if err != nil {
				// 에러 시 무시하거나 0점 처리
				continue
			}
			results = append(results, calc)
		}
	}

	// 1-1. 3학년 2학기 성적 반영 여부는 학교 전체에 똑같이 적용한다. 전기고(마이스터고·특성화고)
	// 입시가 후기 일반고보다 먼저라 2학기 성적이 나오기 전에는 3-1 성적을 3-2에 복사한 예상치로
	// 일반고 지원 가능성을 가늠한다. 일부 학생만 3-2가 올라온 상태로 석차를 섞지 않도록,
	// 모든 학생에게 3-2가 있을 때만 실제 3-2 성적을 쓴다.
	allHaveFinal := len(results) > 0
	for _, r := range results {
		if !r.hasThirdYearFinal {
			allHaveFinal = false
			break
		}
	}
	for i := range results {
		if !allHaveFinal {
			results[i].S22 = results[i].s22Projected
			results[i].tieKeys[0] = results[i].tieKeys[1]
		}
		results[i].ThirdYearFinalUsed = allHaveFinal
		results[i].TotalSubjectScore = roundToTwoDecimals(results[i].S11 + results[i].S12 + results[i].S13 + results[i].S21 + results[i].S22)
	}

	// 2. 총점(TotalSubjectScore) 기준으로 정렬하여 석차 구하기
	// (동점자 처리: 3-2(가산출) > 3-1 > 2-2 > 2-1 평균 성취도 > 반 오름차순 > 번호 오름차순)
	sort.Slice(results, func(i, j int) bool {
		a, b := results[i], results[j]
		if math.Abs(a.TotalSubjectScore-b.TotalSubjectScore) > 0.0001 {
			return a.TotalSubjectScore > b.TotalSubjectScore
		}
		// 총점이 같을 경우 동점자 우선순위: 3-2 > 3-1 > 2-2 > 2-1 학기 평균 성취도.
		// 학년 결손 학생은 학기 배점(×9.6, ×16)이 커서 가중 점수로 비교하면 부당하게 앞서므로
		// 가중치를 뺀 평균 성취도로 비교한다.
		for k := 0; k < 4; k++ {
			if math.Abs(a.tieKeys[k]-b.tieKeys[k]) > 0.0001 {
				return a.tieKeys[k] > b.tieKeys[k]
			}
		}
		// 모든 교과 점수가 동일한 경우 호출 시마다 순서가 바뀌지 않도록 결정적 tie-breaker 적용
		if a.ClassNum != b.ClassNum {
			return a.ClassNum < b.ClassNum
		}
		numA, errA := strconv.Atoi(strings.TrimSpace(a.StudentNum))
		numB, errB := strconv.Atoi(strings.TrimSpace(b.StudentNum))
		if errA == nil && errB == nil && numA != numB {
			return numA < numB
		}
		return a.StudentNum < b.StudentNum
	})

	// 3. 백분율 및 최종 교과점수 산출 (울산광역시 고입 지침: 동점자는 동석차 및 동일 백분율 부여)
	totalStudents := len(results)
	if totalStudents == 0 {
		return nil, fmt.Errorf("계산할 학생 데이터가 없습니다")
	}

	baseCount := float64(totalStudents)
	if isSmallSchool && totalStudents < 10 {
		baseCount = 10.0 // 소인수 학교 10명 보정
	}

	ranks := make([]float64, totalStudents)
	for i := 0; i < totalStudents; i++ {
		if i > 0 {
			prev := results[i-1]
			curr := results[i]
			sameTie := true
			for k := 0; k < 4; k++ {
				if math.Abs(prev.tieKeys[k]-curr.tieKeys[k]) >= 0.0001 {
					sameTie = false
				}
			}
			if math.Abs(prev.TotalSubjectScore-curr.TotalSubjectScore) < 0.0001 && sameTie {
				// 완전히 동점인 경우 동일한 석차(동석차) 부여
				ranks[i] = ranks[i-1]
			} else {
				ranks[i] = float64(i + 1)
			}
		} else {
			ranks[0] = 1.0
		}
	}

	for i := range results {
		rank := ranks[i]

		// 석차 백분율 = (개인석차 / 재적수) * 100 (소수 셋째자리 반올림)
		percentile := (rank / baseCount) * 100
		percentile = roundToTwoDecimals(percentile)

		// 160 - (0.96 * 백분율) (소수 셋째자리 반올림)
		finalScore := 160.0 - (0.96 * percentile)
		finalScore = roundToTwoDecimals(finalScore)

		results[i].Rank = int(rank)
		results[i].TotalStudents = totalStudents
		results[i].Percentile = percentile
		results[i].FinalScore = finalScore
		nonAcademic, complete := calculateGeneralNonAcademic(allStudents, results[i])
		results[i].AttendanceScore = nonAcademic.AttendanceScore
		results[i].VolunteerScore = nonAcademic.VolunteerScore
		results[i].BehaviorScore = nonAcademic.BehaviorScore
		results[i].CreativeScore = nonAcademic.CreativeScore
		results[i].NonAcademicScore = nonAcademic.Total
		results[i].GeneralDataComplete = complete
		results[i].GeneralProjected = !complete
		results[i].GeneralTotalScore = roundToTwoDecimals(finalScore + nonAcademic.Total)
		results[i].GeneralBaseScore = roundToTwoDecimals(finalScore + nonAcademic.AttendanceScore + nonAcademic.VolunteerScore + 10)
		results[i].GeneralTotalHigh = roundToTwoDecimals(results[i].GeneralTotalScore + nonAcademic.PendingBonus)
		results[i].GeneralBonusEntered = nonAcademic.BonusEntered
		results[i].GeneralPerGradeExact = nonAcademic.PerGradeExact
	}

	return results, nil
}

// calcSingleStudent 학생 1명의 5개 학기 교과 점수 산출
func calcSingleStudent(s parser.StudentExcelData) (StudentCalcResult, error) {
	var records []map[string]string
	err := json.Unmarshal([]byte(s.RawData), &records)

	res := StudentCalcResult{
		ClassNum:   s.ClassNum,
		StudentNum: s.StudentNum,
		Name:       s.Name,
	}

	if err != nil {
		return res, err
	}

	// 학기별로 과목 성적 분류
	// grade_semester -> list of achievement strings
	semesters := make(map[string][]int)
	var lastGrade, lastSem string

	for _, rec := range records {
		var grade, sem, achieveRaw, subjectName string
		for k, v := range rec {
			// 키와 값의 공백, 따옴표, 줄바꿈 등을 완벽하게 제거
			cleanK := strings.ReplaceAll(k, " ", "")
			cleanK = strings.ReplaceAll(cleanK, "\"", "")
			cleanK = strings.ReplaceAll(cleanK, "\r", "")
			cleanK = strings.ReplaceAll(cleanK, "\n", "")

			cleanV := strings.ReplaceAll(v, "\"", "")
			cleanV = strings.ReplaceAll(cleanV, "\r", "")
			cleanV = strings.ReplaceAll(cleanV, "\n", "")
			cleanV = strings.TrimSpace(cleanV)

			if strings.Contains(cleanK, "학년도") {
				continue // '학년도' 컬럼은 '학년'으로 오인되지 않도록 무시
			}

			if cleanK == "학년" || (strings.Contains(cleanK, "학년") && !strings.Contains(cleanK, "학기")) {
				grade = cleanV
			} else if cleanK == "학기" || strings.Contains(cleanK, "학기") {
				sem = cleanV
			} else if strings.Contains(cleanK, "성취도") {
				achieveRaw = cleanV
			} else if (cleanK == "과목" || cleanK == "교과목" || cleanK == "과목명") || (strings.Contains(cleanK, "과목") && !strings.Contains(cleanK, "평균") && !strings.Contains(cleanK, "원점수") && !strings.Contains(cleanK, "교과")) {
				subjectName = cleanV
			}
		}

		if grade != "" {
			lastGrade = grade
		} else {
			grade = lastGrade
		}

		if sem != "" {
			lastSem = sem
		} else {
			sem = lastSem
		}

		if grade == "" || sem == "" || achieveRaw == "" || subjectName == "" || len(subjectName) < 2 {
			continue
		}
		if strings.Contains(subjectName, "/") || strings.Contains(subjectName, "중학교") {
			continue
		}

		key := grade + "_" + sem

		// 성취도 추출 (예: "A(123)" -> "A")
		achieve := string(achieveRaw[0])

		if strings.EqualFold(achieve, "P") || achieveRaw == "이수" || strings.HasPrefix(achieveRaw, "P") || strings.HasPrefix(achieveRaw, "p") {
			continue // P는 교과 점수 산출에서 제외 (자유학기 및 이수과목)
		}

		score := 0
		switch achieve {
		case "A":
			score = 5
		case "B":
			score = 4
		case "C":
			score = 3
		case "D":
			score = 2
		case "E":
			score = 1
		default:
			// 성취도가 아닌 원점수만 있는 예체능이나 기타 과목은 제외
			continue
		}

		semesters[key] = append(semesters[key], score)
	}

	// 요강: 성적이 없는 학기는 같은 학년의 다른 학기 성적을 그대로 인정한다
	// (1학기 ← 2학기, 2학기 ← 1학기). 자유학기·전·편입생 등 결손 학기 대비.
	semesterOrSibling := func(grade, sem, sibling string) []int {
		if len(semesters[grade+"_"+sem]) > 0 {
			return semesters[grade+"_"+sem]
		}
		return semesters[grade+"_"+sibling]
	}
	present := func(grade string) bool { return len(semesters[grade+"_1"]) > 0 || len(semesters[grade+"_2"]) > 0 }
	res.gradePresent = [3]bool{present("1"), present("2"), present("3")}
	missing := 0
	for _, p := range res.gradePresent {
		if !p {
			missing++
		}
	}
	term := func(grade, sem string, ratio float64) float64 {
		sibling := map[string]string{"1": "2", "2": "1"}[sem]
		return calcSemesterScore(semesterOrSibling(grade, sem, sibling), ratio)
	}

	switch {
	case missing == 0 || res.gradePresent == [3]bool{false, false, false}:
		// 기본(5학기): 1학년 자유학기가 아닌 학기(들)의 성취점수 총합 ÷ 이수 과목 수 × 5.44,
		// 2-1·2-2 × 5.44, 3-1·3-2 × 7.84
		res.S11 = calcSemesterScore(append(append([]int{}, semesters["1_1"]...), semesters["1_2"]...), 5.44)
		res.S12 = term("2", "1", 5.44)
		res.S13 = term("2", "2", 5.44)
		res.S21 = term("3", "1", 7.84)
		res.S22 = term("3", "2", 7.84)
	case missing == 1:
		// 한 학년 기록이 없는 경우(조기진급·유학생·중도 입국 등): 낮은 학년 40% + 높은 학년 60%
		// S = 낮은 학년 두 학기 × 6.4 + 높은 학년 두 학기 × 9.6
		low, high := "", ""
		for i, p := range res.gradePresent {
			if p && low == "" {
				low = fmt.Sprint(i + 1)
			} else if p {
				high = fmt.Sprint(i + 1)
			}
		}
		lowA, lowB := term(low, "1", 6.4), term(low, "2", 6.4)
		highA, highB := term(high, "1", 9.6), term(high, "2", 9.6)
		if low == "1" {
			res.S11 = roundToTwoDecimals(lowA + lowB)
		} else {
			res.S12, res.S13 = lowA, lowB
		}
		if high == "3" {
			res.S21, res.S22 = highA, highB
		} else {
			res.S12, res.S13 = highA, highB
		}
	default:
		// 두 학년 기록이 없는 경우: 남은 한 학년 성적만 100% (두 학기 × 16)
		for i, p := range res.gradePresent {
			if !p {
				continue
			}
			g := fmt.Sprint(i + 1)
			a, b := term(g, "1", 16), term(g, "2", 16)
			switch g {
			case "3":
				res.S21, res.S22 = a, b
			case "2":
				res.S12, res.S13 = a, b
			default:
				res.S11 = roundToTwoDecimals(a + b)
			}
		}
	}
	// S22(3학년 2학기): 3-2 성적이 올라오면 그 성적, 올라오기 전(상담 시점)에는 3-1 성적으로 대신한 예상값.
	res.hasThirdYearFinal = len(semesters["3_2"]) > 0
	res.s22Projected = res.S21
	avg := func(scores []int) float64 {
		if len(scores) == 0 {
			return 0
		}
		sum := 0
		for _, v := range scores {
			sum += v
		}
		return float64(sum) / float64(len(scores))
	}
	res.tieKeys = [4]float64{avg(semesterOrSibling("3", "2", "1")), avg(semesterOrSibling("3", "1", "2")),
		avg(semesterOrSibling("2", "2", "1")), avg(semesterOrSibling("2", "1", "2"))}

	// 소수 셋째자리 반올림 (5개 학기 모두 합산)
	res.TotalSubjectScore = roundToTwoDecimals(res.S11 + res.S12 + res.S13 + res.S21 + res.S22)

	return res, nil
}

// calcSemesterScore (학기 성취점수 총합 / 이수과목 수) * 비율 (소수 셋째자리 반올림 불가 - 지침상 최종만 하는지 중간도 하는지, 여기선 중간 소수유지)
// 수정: 울산 지침에 따르면 각 학기별 산출 후 최종 합산시 반올림. S21, S22도 마찬가지.
func calcSemesterScore(scores []int, ratio float64) float64 {
	if len(scores) == 0 {
		return 0
	}
	sum := 0
	for _, s := range scores {
		sum += s
	}
	val := (float64(sum) / float64(len(scores))) * ratio
	// 요강: 학기 점수도 소수 셋째 자리에서 반올림한다.
	return roundToTwoDecimals(val)
}

func roundToTwoDecimals(val float64) float64 {
	return math.Round(val*100) / 100
}
