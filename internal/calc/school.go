package calc

import (
	"math"
)

// calculateForSchool 특정 학교 규칙에 따라 점수를 산출
func calculateForSchool(student *StudentFullData, rule SchoolRule) SchoolCalcResult {
	result := SchoolCalcResult{
		SchoolName:      rule.SchoolName,
		TrackName:       rule.TrackName,
		TotalMax:        rule.TotalMax,
		AllSubjectMax:   rule.AllSubjectMax,
		AttendanceMax:   rule.AttendanceMax,
		VolunteerMax:    rule.VolunteerMax,
		LeadershipMax:   rule.LeadershipMax,
		WeightedDetails: make(map[string]float64),
	}

	// === 1. 전과목 점수 ===
	if rule.SchoolName == "울산에너지고" {
		// 울산에너지고 공식 입학요강 및 공식 엑셀 수식:
		// 1) 각 학기별 학기평균성취도 = ROUND( (비예체능 성취도합 / 비예체능 과목수) / 5.0, 2 ) (소수 셋째자리 반올림)
		// 2) 각 학기성적 = ROUND( 해당학기배점 * 학기평균성취도 - 예체능감점합, 2 ) (소수 셋째자리 반올림)
		// 3) 전과목 총점 = 각 학기성적들의 합 (SUM)
		var sumTermScore float64
		for _, sem := range rule.Semesters {
			scores := ruleSemesterScores(student, rule, sem)
			if len(scores) == 0 {
				continue
			}
			avg := calcAverage(scores)                        // 비예체능 과목 평균 성취도 (1~5)
			termAchieveRatio := roundToTwoDecimals(avg / 5.0) // 학기평균성취도 (0.00~1.00)
			termMax := rule.AllSubjectMax * rule.SemesterWeights[sem]
			termPenalty := student.ArtPenaltyBySemester[sem]
			termScore := roundToTwoDecimals(termMax*termAchieveRatio - termPenalty)
			if termScore < 0 {
				termScore = 0
			}
			sumTermScore += termScore
		}
		result.AllSubjectScore = roundToTwoDecimals(sumTermScore)
	} else if len(rule.SemesterWeights) > 0 {
		if rule.FinalTermArtsPenaltyOnly {
			// 울산공업고 및 특성화고 공식 입학요강 (2026학년도 졸업예정자):
			// 1단계: 각 학기별 (비예체능 성취도합 ÷ 과목수) * 학기배점 (소수 셋째자리 반올림)
			// 2단계: (1-2 + 2-1 + 2-2 + 3-1) - (3-1학기 예체능 감점합 ÷ 3-1학기 예체능 이수과목수) (소수 셋째자리 반올림)
			var sumTermScore float64
			for _, sem := range rule.Semesters {
				scores := ruleSemesterScores(student, rule, sem)
				if len(scores) == 0 {
					continue
				}
				avg := calcAverage(scores) // 비예체능 과목 평균 성취도 (1~5)
				termMax := rule.AllSubjectMax * rule.SemesterWeights[sem]
				termScore := roundToTwoDecimals((avg / 5.0) * termMax)
				sumTermScore += termScore
			}
			// 3-1학기 예체능 감점 적용 (3-1학기 예체능 이수과목수로 나눔)
			artPenalty := 0.0
			if artCount := student.ArtCountBySemester["3_1"]; artCount > 0 {
				artPenalty = student.ArtPenaltyBySemester["3_1"] / float64(artCount)
			}
			result.AllSubjectScore = roundToTwoDecimals(math.Max(0, sumTermScore-artPenalty))
		} else {
			// 현대공고 등 학기별 차등 가중치
			var totalWeightedAvg float64
			for _, sem := range rule.Semesters {
				scores := ruleSemesterScores(student, rule, sem)
				if len(scores) == 0 {
					continue
				}
				avg := calcAverage(scores)
				weight := rule.SemesterWeights[sem]
				totalWeightedAvg += (avg / 5.0) * weight
				if rule.ExcludeArts {
					totalWeightedAvg -= student.ArtPenaltyBySemester[sem] / rule.AllSubjectMax
				}
			}
			result.AllSubjectScore = roundToTwoDecimals(totalWeightedAvg * rule.AllSubjectMax)
		}
	} else {
		// 학기별 균등 (마이스터고, 에너지고, 상업고 등)
		allScores := []int{}
		for _, sem := range rule.Semesters {
			allScores = append(allScores, student.SemesterScores[sem]...)
		}
		if len(allScores) > 0 {
			avg := calcAverage(allScores)
			result.AllSubjectScore = roundToTwoDecimals((avg / 5.0) * rule.AllSubjectMax)
		}
	}

	// === 2. 가중치 과목 점수 ===
	if rule.WeightedSubjects != nil && len(rule.WeightedSubjects) > 0 {
		weightedTotal := 0.0
		maxWeighted := 0.0
		hasKiga := false

		for subjectName, maxPoints := range rule.WeightedSubjects {
			maxWeighted += maxPoints
			subjectSemData := student.SubjectScores[subjectName]
			allSubjectScores := []int{}
			for _, sem := range rule.Semesters {
				if scores, ok := subjectSemData[sem]; ok {
					allSubjectScores = append(allSubjectScores, scores...)
				}
			}
			// 에너지고는 기술·가정을 이수하지 않은 경우 같은 학기의 과학 성취도를 사용한다.
			if rule.UseScienceForTech && subjectName == "기술가정" && len(allSubjectScores) == 0 {
				for _, sem := range rule.Semesters {
					allSubjectScores = append(allSubjectScores, student.SubjectScores["과학"][sem]...)
				}
			}
			if len(allSubjectScores) > 0 {
				avg := calcAverage(allSubjectScores)
				score := roundToTwoDecimals((avg / 5.0) * maxPoints)
				result.WeightedDetails[subjectName] = score
				weightedTotal += score
			}
			if subjectName == "기술가정" && len(allSubjectScores) > 0 {
				hasKiga = true
			}
		}

		// 기술가정 예외 처리 (기가 성적이 없으면 영/수로 재분배)
		_, kigaExists := rule.WeightedSubjects["기술가정"]
		if kigaExists && !hasKiga {
			kigaMax := rule.WeightedSubjects["기술가정"]
			engMax, engOk := rule.WeightedSubjects["영어"]
			mathMax, mathOk := rule.WeightedSubjects["수학"]

			if engOk && mathOk {
				extraEach := kigaMax / 2.0
				newEngMax := engMax + extraEach
				newMathMax := mathMax + extraEach

				// 영어 재계산
				engScores := []int{}
				for _, sem := range rule.Semesters {
					if scores, ok := student.SubjectScores["영어"][sem]; ok {
						engScores = append(engScores, scores...)
					}
				}
				if len(engScores) > 0 {
					avg := calcAverage(engScores)
					result.WeightedDetails["영어"] = roundToTwoDecimals((avg / 5.0) * newEngMax)
				}

				// 수학 재계산
				mathScores := []int{}
				for _, sem := range rule.Semesters {
					if scores, ok := student.SubjectScores["수학"][sem]; ok {
						mathScores = append(mathScores, scores...)
					}
				}
				if len(mathScores) > 0 {
					avg := calcAverage(mathScores)
					result.WeightedDetails["수학"] = roundToTwoDecimals((avg / 5.0) * newMathMax)
				}

				delete(result.WeightedDetails, "기술가정")

				// 재합산
				weightedTotal = 0
				for _, v := range result.WeightedDetails {
					weightedTotal += v
				}
			}
		}

		result.WeightedScore = roundToTwoDecimals(weightedTotal)
		result.WeightedMax = maxWeighted
	}

	// === 3. 출결 점수 ===
	absenceDays := student.AbsenceDays
	lateEtc := student.RawLateCount + student.RawEarlyCount + student.RawResultCount
	// 전기고(마이스터고 및 특성화고)의 경우 9.30 기준 결석 일수 및 지각·조퇴·결과(3회당 1일)가 수기 입력되었으면 우선 적용
	if rule.AttendanceCutoff == "10/31" && student.HasOctAbsence {
		absenceDays = student.OctAbsenceDays + (student.OctLateEtc / 3)
		lateEtc = student.OctLateEtc
	} else if (rule.AttendanceCutoff == "9/30" || rule.AttendanceCutoff == "") && student.HasSeptAbsence {
		absenceDays = student.SeptAbsenceDays + (student.SeptLateEtc / 3)
		lateEtc = student.SeptLateEtc
	}
	result.AttendanceScore = math.Max(0, rule.AttendanceMax-float64(absenceDays)*rule.AbsencePenalty-float64(lateEtc)*rule.LateEtcPenalty)
	result.AttendanceScore = roundToTwoDecimals(result.AttendanceScore)

	// === 4. 봉사 점수 ===
	if rule.VolunteerMax > 0 && len(rule.VolunteerTable) > 0 {
		for _, tier := range rule.VolunteerTable {
			if student.TotalVolunteerHours >= tier.MinHours {
				result.VolunteerScore = tier.Score
				break
			}
		}
	}

	// === 5. 리더십 및 총점 합산 ===
	if rule.LeadershipMax > 0 {
		result.LeadershipScore = math.Min(rule.LeadershipMax, float64(student.LeadershipTerms)*2.5)
	}
	// 창체/행발은 일반계고 비교과 항목이며 전기고 1차 점수에 더하지 않는다.
	calcTotal := result.AllSubjectScore + result.WeightedScore + result.AttendanceScore + result.VolunteerScore + result.LeadershipScore
	// 총점이 배점 만점을 초과할 수 없음
	if rule.TotalMax > 0 && calcTotal > rule.TotalMax {
		calcTotal = rule.TotalMax
	}
	result.TotalScore = roundToTwoDecimals(calcTotal)

	return result
}

// ruleSemesterScores는 전형요강의 결측 성적 인정 원칙을 적용한다.
// 해당 학기 성적이 없으면 같은 학년의 반대 학기, 그마저 없으면 인접 학기의
// 성적을 사용한다. 예체능 제외 전형은 NonArtSemesterScores를 우선 사용한다.
func ruleSemesterScores(student *StudentFullData, rule SchoolRule, semester string) []int {
	scoreMap := student.SemesterScores
	if rule.ExcludeArts && len(student.NonArtSemesterScores) > 0 {
		scoreMap = student.NonArtSemesterScores
	}
	if scores := scoreMap[semester]; len(scores) > 0 {
		return scores
	}

	// 자유학기 및 한 학년 전체 결측 시, 전형요강에 맞춰 가까운 학기의
	// 성적을 인정한다. 순서는 같은 학년 반대 학기를 먼저 둔다.
	candidates := map[string][]string{
		"1_2": {"1_1", "2_1", "2_2"},
		"2_1": {"2_2", "1_2", "3_1"},
		"2_2": {"2_1", "3_1", "1_2"},
		"3_1": {"3_2", "2_2", "2_1"},
	}
	for _, candidate := range candidates[semester] {
		if scores := scoreMap[candidate]; len(scores) > 0 {
			return scores
		}
	}
	return nil
}

// calcAverage 정수 배열의 평균
func calcAverage(scores []int) float64 {
	if len(scores) == 0 {
		return 0
	}
	sum := 0
	for _, s := range scores {
		sum += s
	}
	return float64(sum) / float64(len(scores))
}
