package calc

import (
	"encoding/json"
	"strings"
)

// TransferNote 나이스 교과 성적의 "비고" 칸에서 전입 기록을 찾는다.
// 교과 성적 파일의 칸은 이름·번호를 뺀 나머지가 모두 학생 자료(grades_json)에 칸 이름 그대로 저장되므로,
// 칸 이름에 "비고"가 들어 있고 값에 "전입"이 있으면 그 값(예: "2025.03.04 전입")을 돌려준다. 없으면 빈 문자열.
func TransferNote(gradesJSON string) string {
	var records []map[string]string
	if err := json.Unmarshal([]byte(gradesJSON), &records); err != nil {
		return ""
	}
	for _, record := range records {
		for key, value := range record {
			if !strings.Contains(strings.ReplaceAll(key, " ", ""), "비고") {
				continue
			}
			if v := strings.TrimSpace(value); strings.Contains(v, "전입") {
				return v
			}
		}
	}
	return ""
}
