package calc

import (
	"encoding/json"
	"fmt"
	"strings"

	"PHGC/internal/parser"
)

// 상담 화면 "가정해 보기": 학생 원자료의 사본에 가정값을 적용해 다시 계산한다(저장하지 않음).
// 산출식은 바꾸지 않고 입력 자료만 바꾸므로, 결과는 실제 산출 규칙과 항상 같은 방식으로 나온다.

// WhatIfInput 가정값. 0이거나 "keep"이면 그 항목은 바꾸지 않는다.
type WhatIfInput struct {
	RemainingStep   int    `json:"remainingStep"`   // 성적이 아직 없는 반영 학기(3-1·3-2) 성취도: 최근 학기보다 몇 단계 오르내리는지(-2~+2)
	FutureAbsence   int    `json:"futureAbsence"`   // 앞으로 더해질 3학년 미인정 결석 일수
	AddVolunteer    int    `json:"addVolunteer"`    // 앞으로 더해질 3학년 봉사 시간
	LeadershipTerms int    `json:"leadershipTerms"` // 리더십 인정 학기 수(-1이면 그대로)
	Changche3       string `json:"changche3"`       // 후기고 3학년 창체 가산점: keep | yes | no
	Haengbal3       string `json:"haengbal3"`       // 후기고 3학년 행발 가산점: keep | yes | no
}

var achieveLetters = []string{"", "E", "D", "C", "B", "A"} // 점수(1~5) → 성취도

type gradedRecord struct {
	grade, sem, subject string
	score               int
}

// gradedRecords 원자료에서 성취도(A~E)가 있는 과목만 학년·학기와 함께 꺼낸다(ParseStudentFullData와 같은 열 판별).
func gradedRecords(raw string) []gradedRecord {
	var records []map[string]string
	if raw == "" || json.Unmarshal([]byte(raw), &records) != nil {
		return nil
	}
	out := []gradedRecord{}
	var lastGrade, lastSem string
	for _, rec := range records {
		var grade, sem, achieve, subject string
		for k, v := range rec {
			key := strings.NewReplacer(" ", "", "\"", "", "\r", "", "\n", "").Replace(k)
			val := strings.TrimSpace(strings.NewReplacer("\"", "", "\r", "", "\n", "").Replace(v))
			switch {
			case strings.Contains(key, "학년도"):
			case key == "학년" || (strings.Contains(key, "학년") && !strings.Contains(key, "학기")):
				grade = val
			case strings.Contains(key, "학기"):
				sem = val
			case strings.Contains(key, "성취도"):
				achieve = val
			case key == "과목" || key == "교과목" || key == "과목명" || (strings.Contains(key, "과목") && !strings.Contains(key, "평균") && !strings.Contains(key, "원점수") && !strings.Contains(key, "교과")):
				subject = val
			}
		}
		if grade == "" {
			grade = lastGrade
		}
		if sem == "" {
			sem = lastSem
		}
		lastGrade, lastSem = grade, sem
		if achieve == "" || subject == "" {
			continue
		}
		score := strings.Index("EDCBA", strings.ToUpper(achieve[:1])) + 1
		if score <= 0 {
			continue
		}
		g := strings.TrimSpace(strings.NewReplacer("학년", "", " ", "").Replace(grade))
		s := strings.TrimSpace(strings.NewReplacer("학기", "", " ", "").Replace(sem))
		if g == "" || s == "" {
			continue
		}
		out = append(out, gradedRecord{grade: g, sem: s, subject: subject, score: score})
	}
	return out
}

// synthesizeRemaining 성적이 없는 3-1·3-2를 바로 앞 학기 성적에서 step단계 바꿔 만든다.
func synthesizeRemaining(raw string, step int) (string, []string) {
	if step == 0 {
		return raw, nil
	}
	recs := gradedRecords(raw)
	bySem := map[string][]gradedRecord{}
	for _, r := range recs {
		key := r.grade + "_" + r.sem
		bySem[key] = append(bySem[key], r)
	}
	order := []string{"1_1", "1_2", "2_1", "2_2", "3_1", "3_2"}
	var added []map[string]string
	var notes []string
	for i, target := range order {
		if i < 4 || len(bySem[target]) > 0 {
			continue
		}
		source := ""
		for j := i - 1; j >= 0; j-- {
			if len(bySem[order[j]]) > 0 {
				source = order[j]
				break
			}
		}
		if source == "" {
			continue
		}
		parts := strings.Split(target, "_")
		for _, r := range bySem[source] {
			score := r.score + step
			lo, hi := 1, 5
			if isArtsSubject(r.subject) {
				lo = 3 // 예체능은 A·B·C 3단계
			}
			if score < lo {
				score = lo
			}
			if score > hi {
				score = hi
			}
			nr := gradedRecord{grade: parts[0], sem: parts[1], subject: r.subject, score: score}
			bySem[target] = append(bySem[target], nr)
			added = append(added, map[string]string{"학년": parts[0], "학기": parts[1], "과목": r.subject, "성취도": achieveLetters[score]})
		}
		direction := "올려"
		if step < 0 {
			direction = "내려"
		}
		notes = append(notes, fmt.Sprintf("%s 성적이 없어 %s 성적을 %d단계 %s 가정했습니다.", strings.ReplaceAll(target, "_", "-"), strings.ReplaceAll(source, "_", "-"), abs(step), direction))
	}
	if len(added) == 0 {
		return raw, []string{"성적이 없는 반영 학기(3-1·3-2)가 없어 남은 학기 성적 변화는 반영하지 않았습니다."}
	}
	var records []map[string]string
	_ = json.Unmarshal([]byte(raw), &records)
	b, _ := json.Marshal(append(records, added...))
	return string(b), notes
}

func abs(v int) int {
	if v < 0 {
		return -v
	}
	return v
}

// addJSONInt JSON 객체의 숫자 항목에 더한다(없으면 만들지 않으려면 onlyIfPresent).
func addJSONInt(m map[string]interface{}, key string, delta int, onlyIfPresent bool) {
	v, ok := m[key].(float64)
	if !ok && onlyIfPresent {
		return
	}
	m[key] = v + float64(delta)
}

func hasGradeKeys(m map[string]interface{}, suffix string) bool {
	for g := 1; g <= 3; g++ {
		if _, ok := m[fmt.Sprintf("%d_%s", g, suffix)]; ok {
			return true
		}
	}
	return false
}

func decodeObject(s string) map[string]interface{} {
	m := map[string]interface{}{}
	if strings.TrimSpace(s) != "" {
		_ = json.Unmarshal([]byte(s), &m)
	}
	return m
}

func encodeObject(m map[string]interface{}) string {
	b, _ := json.Marshal(m)
	return string(b)
}

// ApplyWhatIf 학생 원자료 사본에 가정값을 적용한다. 원본은 바꾸지 않는다.
func ApplyWhatIf(s parser.StudentExcelData, in WhatIfInput) (parser.StudentExcelData, []string) {
	out := s
	var notes []string
	if in.RemainingStep < -2 {
		in.RemainingStep = -2
	}
	if in.RemainingStep > 2 {
		in.RemainingStep = 2
	}
	var semNotes []string
	out.RawData, semNotes = synthesizeRemaining(s.RawData, in.RemainingStep)
	notes = append(notes, semNotes...)

	extra := decodeObject(s.ExtraData)
	if in.FutureAbsence > 0 {
		att := decodeObject(s.AttendanceData)
		// 전기고는 누적 결석(absence 또는 학년별 합), 후기고는 학년별(3학년) 값을 쓴다.
		if _, ok := att["absence"]; ok || !hasGradeKeys(att, "absence") {
			addJSONInt(att, "absence", in.FutureAbsence, false)
		}
		if hasGradeKeys(att, "absence") || hasGradeKeys(att, "late") {
			addJSONInt(att, "3_absence", in.FutureAbsence, false)
		}
		out.AttendanceData = encodeObject(att)
		// 담임이 직접 입력한 기준일 결석·후기고 3학년 결석이 있으면 그 값에도 더한다.
		addJSONInt(extra, "sept_absence", in.FutureAbsence, true)
		addJSONInt(extra, "oct_absence", in.FutureAbsence, true)
		addJSONInt(extra, "general_absence_3", in.FutureAbsence, true)
		notes = append(notes, fmt.Sprintf("앞으로 미인정 결석 %d일이 더해지고, 아직 지나지 않은 출결 기준일(9.30·10.31)에 모두 들어간다고 가정했습니다.", in.FutureAbsence))
	}
	if in.AddVolunteer > 0 {
		vol := decodeObject(s.VolunteerData)
		if !hasGradeKeys(vol, "time") {
			// 학년별 기록이 없으면 후기고 계산이 누적 시간을 세 학년에 나누므로, 더한 시간이 3학년에 들어가도록
			// 지금 누적 시간을 같은 방식(고르게, 나머지는 앞 학년부터)으로 학년별로 적어 둔다.
			total, _ := vol["total_time"].(float64)
			each, extra := int(total)/3, int(total)%3
			for g := 1; g <= 3; g++ {
				v := each
				if g <= extra {
					v++
				}
				vol[fmt.Sprintf("%d_time", g)] = float64(v)
			}
			notes = append(notes, "학년별 봉사 기록이 없어 지금 누적 시간을 세 학년에 고르게 나눈 뒤 3학년에 더했습니다.")
		}
		addJSONInt(vol, "total_time", in.AddVolunteer, false)
		addJSONInt(vol, "3_time", in.AddVolunteer, false)
		out.VolunteerData = encodeObject(vol)
		addJSONInt(extra, "general_volunteer_3", in.AddVolunteer, true)
		notes = append(notes, fmt.Sprintf("3학년 봉사 %d시간이 더해진다고 가정했습니다(전기고 봉사 마감일 전 실적만 인정).", in.AddVolunteer))
	}
	if in.LeadershipTerms >= 0 {
		extra["leadership_terms"] = float64(in.LeadershipTerms)
	}
	for kind, mode := range map[string]string{"changche_3": in.Changche3, "haengbal_3": in.Haengbal3} {
		switch mode {
		case "yes":
			extra[kind] = true
		case "no":
			extra[kind] = false
		}
	}
	if len(extra) > 0 || s.ExtraData != "" {
		out.ExtraData = encodeObject(extra)
	}
	return out, notes
}

// FillThirdYearFinal 3-2 성적이 없고 3-1 성적이 있으면 3-1 성적을 그대로 3-2로 복사한다.
// 후기고 석차는 전교생 모두 3-2가 있을 때만 실제 3-2를 쓰므로, 가정해 보기에서 한 학생의 3-2만 바꿀 때
// 다른 학생들은 지금 예상치(3-1 복사)와 같은 값으로 채워 함께 비교한다. 다른 학생 점수는 바뀌지 않는다.
func FillThirdYearFinal(raw string) string {
	recs := gradedRecords(raw)
	var third []gradedRecord
	for _, r := range recs {
		if r.grade == "3" && r.sem == "2" {
			return raw
		}
		if r.grade == "3" && r.sem == "1" {
			third = append(third, r)
		}
	}
	if len(third) == 0 {
		return raw
	}
	var records []map[string]string
	if json.Unmarshal([]byte(raw), &records) != nil {
		return raw
	}
	for _, r := range third {
		records = append(records, map[string]string{"학년": "3", "학기": "2", "과목": r.subject, "성취도": achieveLetters[r.score]})
	}
	b, _ := json.Marshal(records)
	return string(b)
}
