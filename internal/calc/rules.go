package calc

import (
	"fmt"
)

// VolunteerTier 봉사시간별 점수 구간
type VolunteerTier struct {
	MinHours int     // 최소 시간 (이상)
	Score    float64 // 부여 점수
}

// SchoolRule 학교별 산출 규칙
type SchoolRule struct {
	SchoolName               string             // 학교명
	TrackName                string             // "일반", "특별", "취업희망자"
	TotalMax                 float64            // 총점 만점 (면접 제외)
	Semesters                []string           // 반영 학기 (예: ["1_2","2_1","2_2","3_1"])
	SemesterWeights          map[string]float64 // 학기별 가중치 비율 (합=1.0, 비어있으면 균등)
	AllSubjectMax            float64            // 전과목 배점 만점
	WeightedSubjects         map[string]float64 // 과목별 가중치 배점 (예: {"영어":20,"수학":20,"기술가정":10})
	AttendanceMax            float64            // 출결 만점
	AbsencePenalty           float64            // 결석 1일당 감점
	VolunteerMax             float64            // 봉사 만점
	VolunteerTable           []VolunteerTier    // 봉사시간별 점수 테이블
	ExcludeArts              bool               // 예체능은 전과목 평균에서 제외하고 별도 감점
	UseScienceForTech        bool               // 기술·가정 미이수 시 과학으로 대체(에너지고)
	LateEtcPenalty           float64            // 지각·조퇴·결과 1회당 직접 감점(현대공고)
	LeadershipMax            float64            // 리더십 배점(한 학기 2.5점)
	AttendanceCutoff         string             // "9/30" 또는 "10/31" (비어 있으면 기존값)
	FinalTermArtsPenaltyOnly bool               // 특성화고: 3-1 예체능 감점만 한 번 차감
}

// RuleYear 이 산출 규칙이 대조한 입학전형요강의 고교 입학 학년도. 새 요강을 반영할 때 함께 올린다.
// 원서 점수 스냅샷의 산출식 버전에 들어가, 여러 해 추세에서 산출식이 바뀐 해를 표시하는 데 쓴다.
const RuleYear = 2027

// 전체 학교 규칙 등록부
var AllSchoolRules []SchoolRule

func init() {
	AllSchoolRules = append(meisterRules(), vocationalRules()...)
}

// GetAllSchoolRules 프론트엔드에서 학교 목록 조회용
func GetAllSchoolRuleNames() []map[string]string {
	var names []map[string]string
	for _, r := range AllSchoolRules {
		names = append(names, map[string]string{
			"schoolName": r.SchoolName,
			"trackName":  r.TrackName,
			"totalMax":   fmt.Sprintf("%.0f", r.TotalMax),
		})
		last := names[len(names)-1]
		// 산출 규칙 안내 문구(화면의 "공식 성적 산출 상세"에서 사용)
		guide := DescribeRule(r)
		last["allSubjectMax"] = fmt.Sprintf("%g", r.AllSubjectMax)
		last["guideSemesters"] = guide.Semesters
		last["guideWeightedSubjects"] = guide.WeightedSubjects
		last["guideAttendance"] = guide.AttendanceRule
		last["guideVolunteer"] = guide.VolunteerRule
		last["guideLeadership"] = guide.LeadershipRule
		last["guideNote"] = guide.Note
		if stage, ok := FindAdmissionStage(r.SchoolName, r.TrackName); ok {
			last["firstStageMultiplier"] = fmt.Sprintf("%g", stage.Multiplier)
			last["firstStageRounding"] = stage.Rounding
			last["secondStageNote"] = stage.SecondStageNote
		}
	}
	return names
}
