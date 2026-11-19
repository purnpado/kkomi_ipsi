package calc

import (
	"fmt"
	"strconv"
)

// 나이스 원서등록 화면 대조표.
// 울산은 나이스 안의 원서등록 화면에 학기별 교과성취점수·과목수·출결·봉사시수를 보여 준다.
// 꼬미입시도 같은 칸·같은 순서로 보여 주어, 담임이 원서를 쓸 때 줄마다 맞춰 볼 수 있게 한다.
//
//   - 값은 산출식이 실제로 쓴 값(ScoreBasis)만 쓴다. 화면에서 다시 계산하지 않으므로 대조표와 점수가 어긋나지 않는다.
//   - 전형마다 나이스 화면이 다르므로 배치(칸 이름·순서·안내 문구)는 전형 종류별 함수 하나에 모은다.
//     나이스 화면이 바뀌면 그 함수만 고치고 nice_form_test.go 의 고정 정답을 맞춘다.
//   - 지금은 특성화고(NiceFormVocational)만 있다. 마이스터고·일반고는 나이스 화면을 확인한 뒤 더한다.

// NiceFormVocational 특성화고 원서등록 화면 배치.
const NiceFormVocational = "vocational"

// SemesterBasis 한 학기 교과 성적에서 산출식이 쓴 값.
type SemesterBasis struct {
	Semester string `json:"semester"` // 반영 학기("2_1")
	Source   string `json:"source"`   // 실제로 성적을 가져온 학기(대체 인정이면 다름, 성적이 없으면 "")
	Sum      int    `json:"sum"`      // 교과성취점수 합(A=5…E=1, 예체능 제외 전형은 예체능 제외)
	Count    int    `json:"count"`    // 과목수
}

// ScoreBasis 학교별 산출에 실제로 쓴 원자료(나이스 대조용).
type ScoreBasis struct {
	ExcludeArts      bool            `json:"excludeArts"`
	Semesters        []SemesterBasis `json:"semesters"`
	AttendanceCutoff string          `json:"attendanceCutoff"` // "9/30"·"10/31"
	CutoffEntered    bool            `json:"cutoffEntered"`    // 마감일 기준 출결을 수기로 입력했는지
	AbsenceDays      int             `json:"absenceDays"`      // 미인정 결석(일)
	LateEtcCount     int             `json:"lateEtcCount"`     // 미인정 지각·조퇴·결과 합(회)
	LateCount        int             `json:"lateCount"`        // 미인정 지각(회). SplitKnown 이 false 면 0
	EarlyCount       int             `json:"earlyCount"`       // 미인정 조퇴(회)
	ResultCount      int             `json:"resultCount"`      // 미인정 결과(회)
	SplitKnown       bool            `json:"splitKnown"`       // 지각·조퇴·결과를 따로 알 수 있는지(예전 마감일 기준 수기 입력은 합계만 있음)
	FinalAbsenceDays int             `json:"finalAbsenceDays"` // 최종결석 = 결석 + (지각+조퇴+결과)÷3, 소수점 절사
	VolunteerHours   int             `json:"volunteerHours"`
}

// NiceFormCell 대조표 한 칸. Kind: head(학기 이름)·label(항목 이름)·accent(강조 항목 이름)·value(값)
type NiceFormCell struct {
	Kind string `json:"kind"`
	Text string `json:"text"`
	Note string `json:"note,omitempty"` // 값 옆 작은 설명(예: "1-1 대체")
}

// NiceForm 나이스 원서등록 화면과 같은 배치의 대조표.
type NiceForm struct {
	Type     string           `json:"type"`
	Title    string           `json:"title"`
	Notes    []string         `json:"notes"`    // 나이스 화면 위 안내 문구
	Rows     [][]NiceFormCell `json:"rows"`     // 나이스 화면과 같은 줄·순서
	Warnings []string         `json:"warnings"` // 이 학생 값이 나이스 화면과 다를 수 있는 이유(있을 때만)
	Hints    []string         `json:"hints"`    // 늘 붙는 맞춰 보기 안내
}

// SchoolBasisView 학교별 산출 상세 창이 받는 값: 산출에 쓴 원자료와 나이스 대조표(배치가 없는 전형은 nil).
type SchoolBasisView struct {
	Basis    *ScoreBasis `json:"basis"`
	NiceForm *NiceForm   `json:"niceForm"`
}

// SchoolBasisFor 학생 한 명의 학교·전형별 산출 근거와 나이스 대조표(산출 상세 창을 열 때만 만든다).
// 학급 전체 산출 결과(명렬표·매트릭스)에는 넣지 않는다: 학생×학교마다 붙이면 자료가 너무 커진다.
// 그 학교·전형 규칙이 없으면 nil.
func SchoolBasisFor(student *StudentFullData, schoolName, trackName string) *SchoolBasisView {
	if student == nil {
		return nil
	}
	for _, rule := range AllSchoolRules {
		if rule.SchoolName == schoolName && rule.TrackName == trackName {
			basis := buildScoreBasis(student, rule)
			return &SchoolBasisView{Basis: basis, NiceForm: buildNiceForm(rule, basis)}
		}
	}
	return nil
}

// NiceFormFor 학교·전형별 나이스 대조표만(테스트·다른 화면용).
func NiceFormFor(student *StudentFullData, schoolName, trackName string) *NiceForm {
	if view := SchoolBasisFor(student, schoolName, trackName); view != nil {
		return view.NiceForm
	}
	return nil
}

// buildScoreBasis 산출식(calculateForSchool)과 같은 규칙으로 쓴 값을 모은다.
func buildScoreBasis(student *StudentFullData, rule SchoolRule) *ScoreBasis {
	basis := &ScoreBasis{ExcludeArts: rule.ExcludeArts, AttendanceCutoff: rule.AttendanceCutoff, VolunteerHours: student.TotalVolunteerHours}
	for _, sem := range rule.Semesters {
		scores := ruleSemesterScores(student, rule, sem)
		sum := 0
		for _, s := range scores {
			sum += s
		}
		basis.Semesters = append(basis.Semesters, SemesterBasis{Semester: sem, Source: ruleSemesterSource(student, rule, sem), Sum: sum, Count: len(scores)})
	}
	// 출결: calculateForSchool 의 "3. 출결 점수"와 같은 우선순위(마감일 기준 수기 입력 → 나이스 성적 파일 출결)
	basis.AbsenceDays = student.RawAbsenceDays
	basis.LateEtcCount = student.RawLateCount + student.RawEarlyCount + student.RawResultCount
	basis.LateCount, basis.EarlyCount, basis.ResultCount, basis.SplitKnown = student.RawLateCount, student.RawEarlyCount, student.RawResultCount, true
	basis.FinalAbsenceDays = student.AbsenceDays
	if (rule.AttendanceCutoff == "10/31" && student.HasOctAbsence) || ((rule.AttendanceCutoff == "9/30" || rule.AttendanceCutoff == "") && student.HasSeptAbsence) {
		// 예전(v1.5.1까지) 마감일 기준 수기 입력은 지각·조퇴·결과 합계만 있다.
		basis.LateCount, basis.EarlyCount, basis.ResultCount, basis.SplitKnown = 0, 0, 0, false
	}
	if rule.AttendanceCutoff == "10/31" && student.HasOctAbsence {
		basis.CutoffEntered = true
		basis.AbsenceDays, basis.LateEtcCount = student.OctAbsenceDays, student.OctLateEtc
		basis.FinalAbsenceDays = student.OctAbsenceDays + student.OctLateEtc/3
	} else if (rule.AttendanceCutoff == "9/30" || rule.AttendanceCutoff == "") && student.HasSeptAbsence {
		basis.CutoffEntered = true
		basis.AbsenceDays, basis.LateEtcCount = student.SeptAbsenceDays, student.SeptLateEtc
		basis.FinalAbsenceDays = student.SeptAbsenceDays + student.SeptLateEtc/3
	}
	return basis
}

// buildNiceForm 전형 종류별 나이스 화면 배치로 대조표를 만든다. 배치가 없는 전형은 nil.
func buildNiceForm(rule SchoolRule, basis *ScoreBasis) *NiceForm {
	if basis == nil {
		return nil
	}
	switch rule.NiceForm {
	case NiceFormVocational:
		return vocationalNiceForm(basis)
	}
	return nil
}

// vocationalNiceForm 특성화고 원서등록 화면(내신교과성적 및 출결상황 정보).
// 나이스 화면 순서: 1줄 = 1학년 2학기·2학년 2학기, 2줄 = 2학년 1학기·3학년 1학기, 3줄 = 출결·봉사.
func vocationalNiceForm(b *ScoreBasis) *NiceForm {
	bySem := map[string]SemesterBasis{}
	for _, s := range b.Semesters {
		bySem[s.Semester] = s
	}
	semCells := func(sem string) []NiceFormCell {
		s := bySem[sem]
		note := ""
		if s.Source != "" && s.Source != sem {
			note = semesterLabelShort(s.Source) + " 대체"
		}
		sum, count := "-", "-"
		if s.Count > 0 {
			sum, count = strconv.Itoa(s.Sum), strconv.Itoa(s.Count)
		}
		return []NiceFormCell{
			{Kind: "head", Text: semesterLabelLong(sem)},
			{Kind: "label", Text: "교과성취점수"}, {Kind: "value", Text: sum, Note: note},
			{Kind: "label", Text: "과목수"}, {Kind: "value", Text: count},
		}
	}
	form := &NiceForm{
		Type:  NiceFormVocational,
		Title: "내신교과성적 및 출결상황 정보",
		Notes: []string{
			"학년·학기별 교과성취점수와 과목수는 예체능 과목을 제외하여 산정한 결과값입니다.",
			"최종결석일수 = 결석일수 + ((지각 + 조퇴 + 결과) / 3), 소수점 절사",
		},
		Rows: [][]NiceFormCell{
			append(semCells("1_2"), semCells("2_2")...),
			append(semCells("2_1"), semCells("3_1")...),
			{
				{Kind: "accent", Text: "최종결석(일)"}, {Kind: "value", Text: strconv.Itoa(b.FinalAbsenceDays)},
				{Kind: "label", Text: "지각(회)"}, {Kind: "value", Text: splitCount(b, b.LateCount)},
				{Kind: "label", Text: "조퇴(회)"}, {Kind: "value", Text: splitCount(b, b.EarlyCount)},
				{Kind: "label", Text: "결과(회)"}, {Kind: "value", Text: splitCount(b, b.ResultCount)},
				{Kind: "label", Text: "결석(일)"}, {Kind: "value", Text: strconv.Itoa(b.AbsenceDays)},
				{Kind: "accent", Text: "봉사시수"}, {Kind: "value", Text: strconv.Itoa(b.VolunteerHours)},
			},
		},
	}
	if !b.CutoffEntered {
		form.Warnings = append(form.Warnings, fmt.Sprintf("%s 기준 출결이 따로 없어 나이스 성적 파일의 출결로 계산했습니다. 성적 파일을 받은 날짜에 따라 나이스 원서 화면의 출결과 다를 수 있습니다.", cutoffLabel(b.AttendanceCutoff)))
	}
	if !b.SplitKnown {
		form.Warnings = append(form.Warnings, fmt.Sprintf("예전에 입력한 %s 기준 출결은 지각·조퇴·결과 합계(%d회)만 있어 따로 보여 줄 수 없습니다. 나이스 화면의 세 값을 더해 맞춰 보세요.", cutoffLabel(b.AttendanceCutoff), b.LateEtcCount))
	}
	return form
}

// splitCount 지각·조퇴·결과 한 칸. 합계만 아는 예전 입력이면 "-".
func splitCount(b *ScoreBasis, n int) string {
	if !b.SplitKnown {
		return "-"
	}
	return strconv.Itoa(n)
}

func semesterLabelLong(sem string) string {
	if len(sem) == 3 && sem[1] == '_' {
		return fmt.Sprintf("%c학년 %c학기", sem[0], sem[2])
	}
	return sem
}

func semesterLabelShort(sem string) string {
	if len(sem) == 3 && sem[1] == '_' {
		return fmt.Sprintf("%c-%c", sem[0], sem[2])
	}
	return sem
}

func cutoffLabel(cutoff string) string {
	switch cutoff {
	case "9/30":
		return "9월 30일"
	case "10/31":
		return "10월 31일"
	}
	return "원서 마감일"
}
