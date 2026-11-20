package calc

// 리더십(학급 반장·부반장, 학생회장·부회장) 인정 학기.
// 에너지고·현대공고 요강은 1-2·2-1·2-2·3-1 학기마다 인정 여부를 본다(3학년은 1학기만 인정).
// 담임은 상담 화면에서 학기별로 체크하고, extra 의 leadership_semesters(["1_2","2_1"…])로 저장한다.
// 예전 버전과 섞여 써도 점수가 같도록 leadership_terms(개수)도 함께 저장한다.

// LeadershipSemesterKeys 리더십을 체크할 수 있는 학기(나이스 원서 화면·요강 순서).
var LeadershipSemesterKeys = []string{"1_2", "2_1", "2_2", "3_1"}

// parseLeadershipSemesters extra JSON 값에서 알려진 학기만 순서대로 고른다(중복·모르는 값은 버림).
// 배열이 있으면 비어 있어도 "학기별로 체크함(0학기)"이므로 nil 이 아닌 빈 목록을 돌려준다.
func parseLeadershipSemesters(v interface{}) []string {
	list, ok := v.([]interface{})
	if !ok {
		return nil
	}
	picked := map[string]bool{}
	for _, item := range list {
		if s, ok := item.(string); ok {
			picked[s] = true
		}
	}
	out := []string{}
	for _, key := range LeadershipSemesterKeys {
		if picked[key] {
			out = append(out, key)
		}
	}
	return out
}
