package calc

import (
	"strings"
	"testing"
)

// 안내 문구는 규칙 값에서 만들어져야 하고, 옛 화면에 직접 적혀 있던 잘못된 문구가 없어야 한다.
func TestDescribeRuleFollowsRuleValues(t *testing.T) {
	special := DescribeRule(findRule(t, "울산마이스터고", "특별"))
	if strings.Contains(special.Note, "심층면접 20점") || strings.Contains(special.Note, "300점") {
		t.Fatalf("옛 안내 문구가 남아 있음: %q", special.Note)
	}
	for _, want := range []string{"280점 만점", "1.3배수", "면접(120점)"} {
		if !strings.Contains(special.Note, want) {
			t.Errorf("마이스터고 특별 참고 사항에 %q 없음: %q", want, special.Note)
		}
	}
	if special.AttendanceRule != "미인정 결석 1일당 12점 감점 (미인정 지각·조퇴·결과 3회 = 결석 1일)" {
		t.Errorf("출결 안내: %q", special.AttendanceRule)
	}
	if !strings.HasPrefix(special.VolunteerRule, "12시간 이상 40점 · 10시간 이상 38점") || !strings.HasSuffix(special.VolunteerRule, "그 미만 28점") {
		t.Errorf("봉사 안내: %q", special.VolunteerRule)
	}

	energy := DescribeRule(findRule(t, "울산에너지고", "일반"))
	if energy.Semesters != "1-2(10%), 2-1(25%), 2-2(25%), 3-1(40%) · 예체능은 평균에서 제외하고 학기별 감점 반영" {
		t.Errorf("에너지고 학기 안내: %q", energy.Semesters)
	}
	if !strings.HasPrefix(energy.WeightedSubjects, "영어(20점), 수학(20점), 기술가정(20점) = 60점 만점") || !strings.Contains(energy.WeightedSubjects, "과학") {
		t.Errorf("에너지고 가중치 안내: %q", energy.WeightedSubjects)
	}
	if energy.LeadershipRule != "학생회·학급 임원 한 학기당 2.5점 (최대 10점)" {
		t.Errorf("리더십 안내: %q", energy.LeadershipRule)
	}

	hyundai := DescribeRule(findRule(t, "현대공업고", "일반"))
	if !strings.Contains(hyundai.AttendanceRule, "1회당 2점 직접 감점") {
		t.Errorf("현대공고 출결 안내: %q", hyundai.AttendanceRule)
	}

	sanup := DescribeRule(findRule(t, "울산산업고", "취업희망자"))
	if !strings.HasPrefix(sanup.AttendanceRule, "9/30 기준 미인정 결석 1일당 3점 감점") {
		t.Errorf("산업고 취업희망자 출결 안내: %q", sanup.AttendanceRule)
	}
	if !strings.Contains(sanup.Note, "60점 만점") || !strings.Contains(sanup.Note, "끝수 올림") {
		t.Errorf("산업고 취업희망자 참고 사항: %q", sanup.Note)
	}

	general := DescribeRule(findRule(t, "울산공업고", "일반"))
	if general.Note != "" || general.VolunteerRule != "" || general.WeightedSubjects != "" {
		t.Errorf("단일 전형·봉사 미반영 전형에 불필요한 안내: %+v", general)
	}
}

// 모든 규칙이 안내 문구를 갖고, 규칙 목록 API에도 실린다.
func TestAllRulesHaveGuides(t *testing.T) {
	list := GetAllSchoolRuleNames()
	if len(list) != len(AllSchoolRules) {
		t.Fatalf("규칙 수 불일치: %d != %d", len(list), len(AllSchoolRules))
	}
	for _, item := range list {
		if item["guideSemesters"] == "" || item["guideAttendance"] == "" {
			t.Errorf("%s %s: 안내 문구 누락", item["schoolName"], item["trackName"])
		}
	}
}
