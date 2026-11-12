package calc

import (
	"encoding/json"
	"strconv"
	"strings"

	"PHGC/internal/model"
	"PHGC/internal/parser"
)

// SchoolCalcResult 학교별 산출 결과
type SchoolCalcResult struct {
	SchoolName      string             `json:"schoolName"`
	TrackName       string             `json:"trackName"`
	TotalMax        float64            `json:"totalMax"`
	AllSubjectScore float64            `json:"allSubjectScore"` // 전과목 점수
	AllSubjectMax   float64            `json:"allSubjectMax"`   // 전과목 만점
	WeightedScore   float64            `json:"weightedScore"`   // 가중치 점수 합계
	WeightedMax     float64            `json:"weightedMax"`     // 가중치 만점 합계
	WeightedDetails map[string]float64 `json:"weightedDetails"` // 과목별 가중치 점수
	AttendanceScore float64            `json:"attendanceScore"` // 출결 점수
	AttendanceMax   float64            `json:"attendanceMax"`
	VolunteerScore  float64            `json:"volunteerScore"` // 봉사 점수
	VolunteerMax    float64            `json:"volunteerMax"`
	LeadershipScore float64            `json:"leadershipScore"`
	LeadershipMax   float64            `json:"leadershipMax"`
	ExtraScore      float64            `json:"extraScore"` // 창체/행발 가산점 합계
	TotalScore      float64            `json:"totalScore"` // 최종 합계 (가산점 포함)
}

// StudentFullData 학생 1명의 전과목/비교과/고교별 결과 종합 데이터
type StudentFullData struct {
	ClassNum             int                         `json:"classNum"`
	StudentNum           string                      `json:"studentNum"`
	Name                 string                      `json:"name"`
	AllAverage           float64                     `json:"allAverage"`     // 전과목 평균 성취도
	SemesterScores       map[string][]int            `json:"semesterScores"` // 학기별 성취도 목록
	SubjectScores        map[string]map[string][]int `json:"subjectScores"`  // [과목][학기]별 성취도
	NonArtSemesterScores map[string][]int            `json:"-"`
	ArtPenaltyBySemester map[string]float64          `json:"-"`
	ArtCountBySemester   map[string]int              `json:"-"`
	AbsenceDays          int                         `json:"absenceDays"`         // 미인정 결석 환산 일수 (결석 + 지각조퇴결과/3)
	RawAbsenceDays       int                         `json:"rawAbsenceDays"`      // 1학기 나이스 순수 결석일수
	RawLateCount         int                         `json:"rawLateCount"`        // 1학기 나이스 지각횟수
	RawEarlyCount        int                         `json:"rawEarlyCount"`       // 1학기 나이스 조퇴횟수
	RawResultCount       int                         `json:"rawResultCount"`      // 1학기 나이스 결과횟수
	SeptAbsenceDays      int                         `json:"septAbsenceDays"`     // 9.30 기준 전기고 미인정 결석일수 수기
	SeptLateEtc          int                         `json:"septLateEtc"`         // 9.30 기준 미인정 지각·조퇴·결과 합산 횟수 수기
	HasSeptAbsence       bool                        `json:"hasSeptAbsence"`      // 9.30 출결 수기 입력 여부
	OctAbsenceDays       int                         `json:"octAbsenceDays"`      // 10.31 기준 미인정 결석일수 수기
	OctLateEtc           int                         `json:"octLateEtc"`          // 10.31 기준 미인정 지각·조퇴·결과 합산 횟수 수기
	HasOctAbsence        bool                        `json:"hasOctAbsence"`       // 10.31 출결 수기 입력 여부
	VolunteerHours       int                         `json:"volunteerHours"`      // 기본 봉사 시간
	AddVolunteerHours    int                         `json:"addVolunteerHours"`   // 수기 추가 봉사 시간
	TotalVolunteerHours  int                         `json:"totalVolunteerHours"` // 최종 봉사 시간 (기본 + 추가)
	LeadershipTerms      int                         `json:"leadershipTerms"`     // 인정 리더십 활동 학기 수

	// 수기 입력 데이터
	ExtraData   map[string]bool `json:"extraData"`   // "창체_1": true 등
	ExtraPoints float64         `json:"extraPoints"` // 창체/행발 가산점 총점
	ExtraJSON   string          `json:"extraJSON"`   // 원본 JSON 문자열

	// 일반고 참고 지표
	GeneralHSPercentile       float64 `json:"generalHSPercentile"` // 일반고 백분율
	GeneralHSLevel            string  `json:"generalHSLevel"`      // "상" "중" "하"
	GeneralHSAcademicScore    float64 `json:"generalHSAcademicScore"`
	GeneralHSNonAcademicScore float64 `json:"generalHSNonAcademicScore"`
	GeneralHSTotalScore       float64 `json:"generalHSTotalScore"`
	GeneralHSDataComplete     bool    `json:"generalHSDataComplete"`
	GeneralHSProjected        bool    `json:"generalHSProjected"`
	// 후기 일반고 비교과 항목별 점수와 범위(관내 비교·상담용)
	GeneralHSAttendanceScore    float64 `json:"generalHSAttendanceScore"`    // 출석(16)
	GeneralHSVolunteerScore     float64 `json:"generalHSVolunteerScore"`     // 봉사(8)
	GeneralHSBehaviorScore      float64 `json:"generalHSBehaviorScore"`      // 행발(8)
	GeneralHSCreativeScore      float64 `json:"generalHSCreativeScore"`      // 창체(8)
	GeneralHSBaseScore          float64 `json:"generalHSBaseScore"`          // 기본 지표: 교과+출석+봉사+기본 10점
	GeneralHSTotalHigh          float64 `json:"generalHSTotalHigh"`          // 가산점 미정분까지 받을 때 상한
	GeneralHSBonusEntered       bool    `json:"generalHSBonusEntered"`       // 창체·행발 가산점 입력 완료
	GeneralHSThirdYearFinal     bool    `json:"generalHSThirdYearFinal"`     // 3-2 성적 반영(아니면 3-1 복사 예상)
	GeneralHSThirdYearProjected bool    `json:"generalHSThirdYearProjected"` // 학기 초: 3학년을 2학년 성적으로 대신한 예상치
	GeneralHSPerGradeExact      bool    `json:"generalHSPerGradeExact"`      // 출결·봉사 학년별 실제 값 사용

	// 학교별 산출 결과
	SchoolResults []SchoolCalcResult `json:"schoolResults"`

	// 학생 지원 희망 학교 목록 (1~5지망)
	Applications []model.ApplicationRecord `json:"applications"`
}

// classifySubject 과목명에서 가중치 과목 분류
func classifySubject(subjectName string) string {
	clean := strings.ReplaceAll(subjectName, " ", "")
	clean = strings.ReplaceAll(clean, "·", "")
	clean = strings.ReplaceAll(clean, "‧", "")

	if strings.Contains(clean, "영어") {
		return "영어"
	}
	if strings.Contains(clean, "수학") {
		return "수학"
	}
	if strings.Contains(clean, "기술") || strings.Contains(clean, "가정") {
		return "기술가정"
	}
	if strings.Contains(clean, "과학") {
		return "과학"
	}
	return "" // 가중치 과목 아님
}

func isArtsSubject(subjectName string) bool {
	clean := strings.ReplaceAll(subjectName, " ", "")
	return strings.Contains(clean, "체육") || strings.Contains(clean, "음악") || strings.Contains(clean, "미술")
}

// ParseStudentFullData 학생의 원시 데이터를 파싱하여 StudentFullData 생성
func ParseStudentFullData(s parser.StudentExcelData) (*StudentFullData, error) {
	result := &StudentFullData{
		ClassNum:             s.ClassNum,
		StudentNum:           s.StudentNum,
		Name:                 s.Name,
		SemesterScores:       make(map[string][]int),
		NonArtSemesterScores: make(map[string][]int),
		ArtPenaltyBySemester: make(map[string]float64),
		ArtCountBySemester:   make(map[string]int),
		SubjectScores:        make(map[string]map[string][]int),
		ExtraData:            make(map[string]bool),
	}

	// 교과 성적 파싱
	var records []map[string]string
	if s.RawData != "" {
		json.Unmarshal([]byte(s.RawData), &records)
	}

	var lastGrade, lastSem string

	for _, rec := range records {
		var grade, sem, achieveRaw, subjectName string
		for k, v := range rec {
			cleanK := strings.ReplaceAll(k, " ", "")
			cleanK = strings.ReplaceAll(cleanK, "\"", "")
			cleanK = strings.ReplaceAll(cleanK, "\r", "")
			cleanK = strings.ReplaceAll(cleanK, "\n", "")
			cleanV := strings.TrimSpace(strings.ReplaceAll(strings.ReplaceAll(strings.ReplaceAll(v, "\"", ""), "\r", ""), "\n", ""))

			if strings.Contains(cleanK, "학년도") {
				continue
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

		achieve := string(achieveRaw[0])
		if strings.EqualFold(achieve, "P") || achieveRaw == "이수" || strings.HasPrefix(achieveRaw, "P") || strings.HasPrefix(achieveRaw, "p") {
			continue // P는 성취도 수치 점수 산출에서 제외 (자유학기 및 이수과목)
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
			continue
		}

		cleanGrade := strings.TrimSpace(strings.ReplaceAll(strings.ReplaceAll(grade, "학년", ""), " ", ""))
		cleanSem := strings.TrimSpace(strings.ReplaceAll(strings.ReplaceAll(sem, "학기", ""), " ", ""))
		if cleanGrade == "" || cleanSem == "" {
			continue
		}
		key := cleanGrade + "_" + cleanSem
		result.SemesterScores[key] = append(result.SemesterScores[key], score)
		if isArtsSubject(subjectName) {
			result.ArtCountBySemester[key]++
			// 에너지고·현대공고·특성화고: 예체능은 평균에서 제외, B/보통 0.1·C/미흡 0.2 감점.
			if score == 4 {
				result.ArtPenaltyBySemester[key] += 0.1
			}
			if score == 3 {
				result.ArtPenaltyBySemester[key] += 0.2
			}
		} else {
			result.NonArtSemesterScores[key] = append(result.NonArtSemesterScores[key], score)
		}

		// 가중치 과목 분류
		category := classifySubject(subjectName)
		if category != "" {
			if result.SubjectScores[category] == nil {
				result.SubjectScores[category] = make(map[string][]int)
			}
			result.SubjectScores[category][key] = append(result.SubjectScores[category][key], score)
		}
	}

	// 전과목 평균 성취도 계산 (A~E 5점 만점 환산)
	totalScore := 0
	totalCount := 0
	for _, scores := range result.SemesterScores {
		for _, s := range scores {
			totalScore += s
			totalCount++
		}
	}
	if totalCount > 0 {
		result.AllAverage = roundToTwoDecimals(float64(totalScore) / float64(totalCount))
	}

	// 출결 파싱
	if s.AttendanceData != "" {
		var attMap map[string]interface{}
		if err := json.Unmarshal([]byte(s.AttendanceData), &attMap); err == nil {
			getInt := func(keys ...string) int {
				for _, k := range keys {
					if v, ok := attMap[k]; ok {
						switch val := v.(type) {
						case float64:
							return int(val)
						case int:
							return val
						case string:
							if iv, err := strconv.Atoi(strings.TrimSpace(val)); err == nil {
								return iv
							}
						}
					}
				}
				return 0
			}
			abs := getInt("absence", "absent")
			if abs == 0 {
				abs = getInt("1_absence") + getInt("2_absence") + getInt("3_absence")
			}
			late := getInt("late")
			if late == 0 {
				late = getInt("1_late") + getInt("2_late") + getInt("3_late")
			}
			early := getInt("early")
			if early == 0 {
				early = getInt("1_early") + getInt("2_early") + getInt("3_early")
			}
			resultCount := getInt("result")
			if resultCount == 0 {
				resultCount = getInt("1_result") + getInt("2_result") + getInt("3_result")
			}

			result.RawAbsenceDays = abs
			result.RawLateCount = late
			result.RawEarlyCount = early
			result.RawResultCount = resultCount
			tardyDays := (result.RawLateCount + result.RawEarlyCount + result.RawResultCount) / 3
			result.AbsenceDays = result.RawAbsenceDays + tardyDays
		}
	}

	// 봉사 파싱
	if s.VolunteerData != "" {
		var volMap map[string]interface{}
		if err := json.Unmarshal([]byte(s.VolunteerData), &volMap); err == nil {
			for _, k := range []string{"total_time", "totalTime", "total", "hours"} {
				if v, ok := volMap[k]; ok {
					switch val := v.(type) {
					case float64:
						result.VolunteerHours = int(val)
					case int:
						result.VolunteerHours = val
					case string:
						if iv, err := strconv.Atoi(strings.TrimSpace(val)); err == nil {
							result.VolunteerHours = iv
						}
					}
					if result.VolunteerHours > 0 {
						break
					}
				}
			}
		}
	}

	// 수기 입력 가산점 및 추가 봉사시간, 9.30 전기고 출결 파싱
	result.ExtraJSON = s.ExtraData
	extraSum := 0.0
	if s.ExtraData != "" {
		var extraMap map[string]interface{}
		if err := json.Unmarshal([]byte(s.ExtraData), &extraMap); err == nil {
			for k, v := range extraMap {
				if k == "add_volunteer" {
					if vf, ok := v.(float64); ok {
						result.AddVolunteerHours = int(vf)
					}
				} else if k == "sept_absence" {
					if vf, ok := v.(float64); ok {
						result.SeptAbsenceDays = int(vf)
						result.HasSeptAbsence = true
					}
				} else if k == "sept_late_etc" {
					if vf, ok := v.(float64); ok {
						result.SeptLateEtc = int(vf)
						result.HasSeptAbsence = true
					}
				} else if k == "oct_absence" {
					if vf, ok := v.(float64); ok {
						result.OctAbsenceDays = int(vf)
						result.HasOctAbsence = true
					}
				} else if k == "oct_late_etc" {
					if vf, ok := v.(float64); ok {
						result.OctLateEtc = int(vf)
						result.HasOctAbsence = true
					}
				} else if k == "leadership_terms" {
					if vf, ok := v.(float64); ok {
						result.LeadershipTerms = int(vf)
					}
				} else if vb, ok := v.(bool); ok {
					result.ExtraData[k] = vb
					// 창체 및 행발 가산점 항목당 1점 가산
					if vb && (strings.HasPrefix(k, "changche") || strings.HasPrefix(k, "haengbal") || strings.Contains(k, "창체") || strings.Contains(k, "행발")) {
						extraSum += 1.0
					}
				}
			}
		}
	}
	result.ExtraPoints = extraSum
	result.TotalVolunteerHours = result.VolunteerHours + result.AddVolunteerHours

	// 모든 학교에 대한 점수 산출
	for _, rule := range AllSchoolRules {
		calcResult := calculateForSchool(result, rule)
		result.SchoolResults = append(result.SchoolResults, calcResult)
	}

	// 일반고 참고 지표 (전과목 평균으로 대략 추정)
	if result.AllAverage > 0 {
		// 평균 성취도 기준 대략적 백분율 추정
		pct := (1 - (result.AllAverage-1)/4) * 100
		result.GeneralHSPercentile = roundToTwoDecimals(pct)
		if pct <= 80 {
			result.GeneralHSLevel = "상"
		} else if pct <= 90 {
			result.GeneralHSLevel = "중"
		} else {
			result.GeneralHSLevel = "하"
		}
	}

	return result, nil
}
