package calc

import (
	"encoding/json"

	"PHGC/internal/parser"
)

// 학기 초 후기 일반고 예상치.
// 나이스 성적은 학기별로 전교생을 한꺼번에 내려받으므로, 3학년 1학기 성적이 나오기 전에는 전교생 모두 3학년 기록이 없다.
// 이때 학년 결손(전·편입생) 공식을 모든 학생에게 쓰면 실제 선발 방식과 맞지 않으므로, 상담용 예상치로
//   - 교과: 3-1에 작년(2학년) 1·2학기 성적을 모두 넣어 2학년 평균으로 본다(3-2는 기존처럼 3-1 복사 예상).
//   - 출결·봉사: 예상하지 않고 지금까지 기록 그대로 쓴다(앞으로의 결석·봉사는 상담 화면 "가정해 보기"로 넣어 본다).
// 3학년 성적이 한 명이라도 올라오면 이 예상은 쓰지 않는다. 결과에는 ThirdYearProjected로 표시한다.

// schoolLacksThirdYear 전교생 누구에게도 3학년 성적이 없고, 2학년 성적은 있는지
func schoolLacksThirdYear(all map[int][]parser.StudentExcelData) bool {
	hasSecond := false
	for _, list := range all {
		for _, s := range list {
			for _, r := range gradedRecords(s.RawData) {
				switch r.grade {
				case "3":
					return false
				case "2":
					hasSecond = true
				}
			}
		}
	}
	return hasSecond
}

// FillEarlyThirdYear 3학년 성적이 없으면 작년(2학년) 1·2학기 성적을 모두 3-1로 복사해 2학년 평균으로 본다.
// 2학년 기록이 없으면(전입 등) 1학년 성적을 쓴다.
func FillEarlyThirdYear(raw string) string {
	bySem := map[string][]gradedRecord{}
	for _, r := range gradedRecords(raw) {
		if r.grade == "3" {
			return raw
		}
		bySem[r.grade+"_"+r.sem] = append(bySem[r.grade+"_"+r.sem], r)
	}
	source := append(append([]gradedRecord{}, bySem["2_1"]...), bySem["2_2"]...)
	if len(source) == 0 {
		source = append(append([]gradedRecord{}, bySem["1_1"]...), bySem["1_2"]...)
	}
	if len(source) == 0 {
		return raw
	}
	var records []map[string]string
	if json.Unmarshal([]byte(raw), &records) != nil {
		return raw
	}
	for _, r := range source {
		records = append(records, map[string]string{"학년": "3", "학기": "1", "과목": r.subject, "성취도": achieveLetters[r.score]})
	}
	b, _ := json.Marshal(records)
	return string(b)
}

// earlyYearProjection 학기 초이면 예상치를 넣은 학생 자료 사본을 돌려준다(원본은 바꾸지 않음).
func earlyYearProjection(all map[int][]parser.StudentExcelData) (map[int][]parser.StudentExcelData, bool) {
	if !schoolLacksThirdYear(all) {
		return all, false
	}
	out := make(map[int][]parser.StudentExcelData, len(all))
	for c, list := range all {
		copied := make([]parser.StudentExcelData, len(list))
		for i, s := range list {
			s.RawData = FillEarlyThirdYear(s.RawData)
			copied[i] = s
		}
		out[c] = copied
	}
	return out, true
}
