package calc

import (
	"fmt"
	"sort"
	"strings"
)

// RuleGuide 산출 규칙(SchoolRule)과 선발 방식(AdmissionStage)에서 만든 안내 문구.
// 화면의 "공식 성적 산출 상세"는 이 문구만 보여 주므로, 규칙을 고치면 안내도 함께 바뀐다.
type RuleGuide struct {
	Semesters        string // 반영 학기와 비율
	WeightedSubjects string // 가중치 과목 배점
	AttendanceRule   string // 출결 감점 방식
	VolunteerRule    string // 봉사시간별 점수
	LeadershipRule   string // 리더십 배점
	Note             string // 1차·2차 선발 방식 등 참고 사항
}

// leadershipPointsPerTerm 리더십(학생회·학급 임원) 한 학기당 점수. calculateForSchool과 같은 값을 쓴다.
const leadershipPointsPerTerm = 2.5

// DescribeRule 규칙 하나의 안내 문구를 만든다.
func DescribeRule(rule SchoolRule) RuleGuide {
	guide := RuleGuide{
		Semesters:        describeSemesters(rule),
		WeightedSubjects: describeWeightedSubjects(rule),
		AttendanceRule:   describeAttendance(rule),
		VolunteerRule:    describeVolunteer(rule),
	}
	if rule.LeadershipMax > 0 {
		guide.LeadershipRule = fmt.Sprintf("학생회·학급 임원 한 학기당 %g점 (최대 %g점)", leadershipPointsPerTerm, rule.LeadershipMax)
	}
	if stage, ok := FindAdmissionStage(rule.SchoolName, rule.TrackName); ok {
		guide.Note = describeStage(stage, rule)
	}
	return guide
}

func semesterLabel(sem string) string {
	return strings.ReplaceAll(sem, "_", "-")
}

func describeSemesters(rule SchoolRule) string {
	labels := make([]string, 0, len(rule.Semesters))
	if len(rule.SemesterWeights) == 0 {
		for _, sem := range rule.Semesters {
			labels = append(labels, semesterLabel(sem))
		}
		return strings.Join(labels, ", ") + " 균등 반영 (성적이 없는 학기는 제외)"
	}
	for _, sem := range rule.Semesters {
		labels = append(labels, fmt.Sprintf("%s(%g%%)", semesterLabel(sem), rule.SemesterWeights[sem]*100))
	}
	text := strings.Join(labels, ", ")
	switch {
	case rule.FinalTermArtsPenaltyOnly:
		text += " · 예체능은 평균에서 제외하고 3-1 예체능 감점만 차감"
	case rule.ExcludeArts:
		text += " · 예체능은 평균에서 제외하고 학기별 감점 반영"
	}
	return text
}

// weightedSubjectOrder 가중치 과목 표시 순서(요강 표기 순서). 그 밖의 과목은 이름순으로 뒤에 붙인다.
var weightedSubjectOrder = []string{"영어", "수학", "기술가정"}

func describeWeightedSubjects(rule SchoolRule) string {
	if len(rule.WeightedSubjects) == 0 {
		return ""
	}
	names := make([]string, 0, len(rule.WeightedSubjects))
	seen := map[string]bool{}
	for _, name := range weightedSubjectOrder {
		if _, ok := rule.WeightedSubjects[name]; ok {
			names = append(names, name)
			seen[name] = true
		}
	}
	rest := []string{}
	for name := range rule.WeightedSubjects {
		if !seen[name] {
			rest = append(rest, name)
		}
	}
	sort.Strings(rest)
	names = append(names, rest...)

	total := 0.0
	parts := make([]string, 0, len(names))
	for _, name := range names {
		points := rule.WeightedSubjects[name]
		total += points
		parts = append(parts, fmt.Sprintf("%s(%g점)", name, points))
	}
	text := fmt.Sprintf("%s = %g점 만점", strings.Join(parts, ", "), total)
	if _, hasTech := rule.WeightedSubjects["기술가정"]; hasTech {
		if rule.UseScienceForTech {
			text += " · 기술가정 미이수 시 과학 성취도로 대체"
		} else {
			text += " · 기술가정 성적이 없으면 그 배점을 영어·수학에 나누어 반영"
		}
	}
	return text
}

func describeAttendance(rule SchoolRule) string {
	text := ""
	if rule.AttendanceCutoff != "" {
		text = rule.AttendanceCutoff + " 기준 "
	}
	text += fmt.Sprintf("미인정 결석 1일당 %g점 감점", rule.AbsencePenalty)
	if rule.LateEtcPenalty > 0 {
		text += fmt.Sprintf(" / 미인정 지각·조퇴·결과 1회당 %g점 직접 감점", rule.LateEtcPenalty)
	} else {
		text += " (미인정 지각·조퇴·결과 3회 = 결석 1일)"
	}
	return text
}

func describeVolunteer(rule SchoolRule) string {
	if rule.VolunteerMax <= 0 || len(rule.VolunteerTable) == 0 {
		return ""
	}
	parts := make([]string, 0, len(rule.VolunteerTable))
	for _, tier := range rule.VolunteerTable {
		if tier.MinHours <= 0 {
			parts = append(parts, fmt.Sprintf("그 미만 %g점", tier.Score))
			continue
		}
		parts = append(parts, fmt.Sprintf("%d시간 이상 %g점", tier.MinHours, tier.Score))
	}
	return strings.Join(parts, " · ")
}

func describeStage(stage AdmissionStage, rule SchoolRule) string {
	if stage.Multiplier <= 0 {
		return stage.SecondStageNote
	}
	rounding := ""
	if stage.Rounding != "" {
		rounding = fmt.Sprintf(", 끝수 %s", stage.Rounding)
	}
	return fmt.Sprintf("이 화면의 %g점 만점 점수는 1차 서류 점수입니다. 1차에서 모집정원의 %g배수를 선발(%s%s)한 뒤 2차 전형을 치릅니다. 2차: %s",
		rule.TotalMax, stage.Multiplier, "1차 점수순", rounding, stage.SecondStageNote)
}
