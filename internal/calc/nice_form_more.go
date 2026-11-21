package calc

import (
	"fmt"
	"strconv"
	"strings"
)

// 마이스터고·후기 일반고 나이스 원서등록 대조표(특성화고는 nice_form.go).
// 나이스는 성적·출결·봉사를 자기 자료로 불러와 요강 산출식으로 계산하고,
// 리더십·창체·행동특성 가산점은 담임이 학업성적관리위원회 명단을 보고 나이스에서 직접 체크한다.
// 대조표의 가산점 줄은 꼬미입시 상담 화면에서 체크한 값을 보여 준다(담임 확인 2026-11-21).

// niceLeadershipSemesters 나이스 마이스터고 화면의 리더십 칸 순서(1-1 ~ 3-2).
var niceLeadershipSemesters = []string{"1_1", "1_2", "2_1", "2_2", "3_1", "3_2"}

// meisterNiceForm 마이스터고 원서등록 화면(현대공고 화면 기준, 2026-11-21 사용자 제공).
// 위쪽 요약(학기별 교과성취점수·과목수, 출결·봉사)은 특성화고 화면과 같고, 아래에 리더십 학기 줄이 있다.
// 가운데 과목별 성취도·환산 표는 나이스 성적 자료 그대로라 대조표에 넣지 않는다.
func meisterNiceForm(b *ScoreBasis) *NiceForm {
	form := vocationalNiceForm(b)
	form.Type = NiceFormMeister
	arts := "학년·학기별 교과성취점수와 과목수는 예체능 과목을 제외하여 산정한 결과값입니다."
	if !b.ExcludeArts {
		// 나이스도 학교별 요강 산출식대로 계산하므로 예체능을 넣는 학교는 나이스 값도 예체능 포함이다.
		arts = "학년·학기별 교과성취점수와 과목수는 이 학교 요강대로 예체능 과목을 포함하여 산정한 결과값입니다."
	}
	form.Notes = []string{arts, form.Notes[1],
		"리더십(창의적체험활동 및 행동특성)은 담임이 학업성적관리위원회 명단을 보고 나이스에서 학기마다 고릅니다. 아래는 상담 화면에서 체크한 학기입니다."}
	checked := map[string]bool{}
	for _, sem := range b.Leadership {
		checked[sem] = true
	}
	row := []NiceFormCell{{Kind: "accent", Text: "리더십"}}
	for _, sem := range niceLeadershipSemesters {
		value := "-"
		if checked[sem] {
			value = "인정"
		}
		row = append(row, NiceFormCell{Kind: "label", Text: semesterLabelShort(sem)}, NiceFormCell{Kind: "value", Text: value})
	}
	form.Rows = append(form.Rows, row)
	if len(b.Leadership) == 0 && b.LeadershipTerms > 0 {
		form.Warnings = append(form.Warnings, fmt.Sprintf("리더십이 학기 없이 %d학기로만 입력되어 있습니다. 상담 화면에서 학기를 체크해 주세요.", b.LeadershipTerms))
	}
	return form
}

// GeneralNiceForm 후기 일반고 산출에 쓴 값(요강 산출 순서). 나이스 일반고 원서등록 화면을 받으면 같은 순서로 맞춘다.
// 교과는 예체능을 포함한 학기별 성취점수 합·과목수(자유학기 P 제외), 출결·봉사·가산점은 학년별.
func GeneralNiceForm(student *StudentFullData) *NiceForm {
	if student == nil {
		return nil
	}
	semCells := func(sem string) []NiceFormCell {
		scores := student.SemesterScores[sem]
		sum, count := "-", "-"
		if len(scores) > 0 {
			total := 0
			for _, v := range scores {
				total += v
			}
			sum, count = strconv.Itoa(total), strconv.Itoa(len(scores))
		}
		return []NiceFormCell{
			{Kind: "head", Text: semesterLabelLong(sem)},
			{Kind: "label", Text: "교과성취점수"}, {Kind: "value", Text: sum},
			{Kind: "label", Text: "과목수"}, {Kind: "value", Text: count},
		}
	}
	form := &NiceForm{
		Type:     "general",
		Title:    "후기 일반고 내신 산출 자료",
		Subtitle: "요강 산출 순서(나이스 화면을 받으면 같은 순서로 맞춤)",
		Notes: []string{
			"교과성취점수는 예체능을 포함한 학기별 성취도 점수 합(A=5 … E=1)입니다. 자유학기(P)는 빠집니다.",
			"결석 환산 = 미인정 결석 + (지각 + 조퇴 + 결과) ÷ 3 (학년별, 소수점 버림)",
			"행동특성·창의적체험활동 가산점은 담임이 학업성적관리위원회 명단을 보고 나이스에서 체크합니다. 아래는 상담 화면에서 체크한 값입니다.",
		},
		Rows: [][]NiceFormCell{
			append(semCells("1_1"), semCells("1_2")...),
			append(semCells("2_1"), semCells("2_2")...),
			semCells("3_1"),
		},
		Hints: []string{NiceFileHint},
	}
	years := student.GeneralHSYears
	if years == nil {
		form.Warnings = append(form.Warnings, "학년별 출결·봉사·가산점 값을 계산하지 못했습니다(나이스 엑셀을 올렸는지 확인).")
		return form
	}
	yearRow := func(title string, value func(i int) (string, string)) []NiceFormCell {
		row := []NiceFormCell{{Kind: "accent", Text: title}}
		for i := 0; i < 3; i++ {
			text, note := value(i)
			row = append(row, NiceFormCell{Kind: "label", Text: fmt.Sprintf("%d학년", i+1)}, NiceFormCell{Kind: "value", Text: text, Note: note})
		}
		return row
	}
	bonus := func(states [3]string) func(int) (string, string) {
		return func(i int) (string, string) {
			if states[i] == "" {
				return "-", ""
			}
			return states[i], ""
		}
	}
	form.Rows = append(form.Rows,
		yearRow("결석 환산(일)", func(i int) (string, string) { return strconv.Itoa(years.AbsenceDays[i]), "" }),
		yearRow("봉사(시간)", func(i int) (string, string) {
			note := ""
			if conv := years.ConvertedHours[i]; conv != float64(years.VolunteerHours[i]) && conv > 0 {
				note = "인정 " + strings.TrimSuffix(strings.TrimRight(fmt.Sprintf("%.2f", conv), "0"), ".") + "시간"
			}
			return strconv.Itoa(years.VolunteerHours[i]), note
		}),
		yearRow("행동특성 가산", bonus(years.Behavior)),
		yearRow("창체 가산", bonus(years.Creative)),
	)
	if !years.Exact {
		form.Warnings = append(form.Warnings, "학년별 출결·봉사 자료가 없어 누적값을 학년마다 나눈 예상값입니다. 학년별 나이스 자료를 올리거나 상담 화면에서 학년별 값을 넣어 주세요.")
	}
	if !years.BonusEntered {
		form.Warnings = append(form.Warnings, "상담 화면에서 가산점 입력을 마치지 않았습니다(빈 칸은 아직 정하지 않은 값).")
	}
	return form
}
