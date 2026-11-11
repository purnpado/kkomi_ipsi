package calc

import "strings"

// AdmissionStage 학교·전형별 1차/2차 선발 방식(2027학년도 각 고교 입학전형요강 기준).
// 1차 선발 배수는 학교마다 다르므로 요강에서 확인한 값만 적는다. 0이면 단계 구분 없이
// 1차 점수(또는 단일 전형)로 최종 합격자를 정하는 전형이다.
type AdmissionStage struct {
	SchoolName      string
	TrackName       string
	Multiplier      float64 // 1차 선발 인원 = 모집정원 × 배수
	Rounding        string  // 배수 계산 끝수 처리: "올림", "버림", ""(요강에 언급 없음)
	SecondStageNote string  // 2차 전형 구성 요약
}

// admissionStages 2027학년도 요강 확인값. 다음 학년도에는 새 요강과 대조해 갱신한다.
var admissionStages = []AdmissionStage{
	// 마이스터고: 1차 내신 1.3배수 → 2차 1차 점수 + 면접·신체검사. 특별전형 탈락자는 일반전형으로 자동 전형.
	{"울산마이스터고", "일반", 1.3, "", "1차 점수 + 면접(100점)·신체검사"},
	{"울산마이스터고", "특별", 1.3, "", "1차 점수 + 면접(120점)·신체검사, 탈락 시 일반전형 자동 전형"},
	{"울산에너지고", "일반", 1.3, "", "1차 점수 + 면접(70점)·신체검사"},
	{"울산에너지고", "특별", 1.3, "", "1차 점수 + 면접(100점)·신체검사, 탈락 시 일반전형 자동 전형"},
	{"현대공업고", "일반", 1.3, "", "1차 점수 + 면접·신체검사"},
	{"현대공업고", "특별", 1.3, "", "1차 점수 + 면접·신체검사, 탈락 시 일반전형 자동 전형"},
	// 특성화고 취업희망자 특별전형: 1차 서류 1.5배수 → 2차 취업희망서·면접(심층심사). 일반전형은 단일 전형.
	{"울산공업고", "취업희망자", 1.5, "", "1차 서류 50점 + 2차 면접 50점(취업희망서 20·구술 30)"},
	{"울산미용예술고", "취업희망자", 1.5, "올림", "1차 서류 50점 + 2차 심층심사 50점(취업희망서 20·면접 30)"},
	{"울산산업고", "취업희망자", 1.5, "올림", "1차 서류 60점 + 2차 심층심사 40점(취업희망서 20·면접 20)"},
	{"울산상업고", "취업희망자", 1.5, "버림", "서류 60점 + 심층심사 40점(취업희망서 20·면접 20)"},
	{"울산생활과학고", "취업희망자", 1.5, "올림", "1차 서류 50점 + 2차 심층심사 50점(취업희망서 20·면접 30)"},
	{"울산여자상업고", "취업희망자", 1.5, "올림", "1차 서류 80점 + 2차 심층심사 20점(취업희망서 10·면접 10)"},
	// 울산기술공업고 취업희망자: 취업희망서·면접은 점수에 반영하지 않음(불참 시 불합격) → 단계 구분 없음.
	{"울산기술공업고", "취업희망자", 0, "", "취업희망서·면접 참석 필수(점수 미반영)"},
}

// FindAdmissionStage 학교명(“…고등학교” 표기 포함)과 전형명으로 선발 방식을 찾는다.
func FindAdmissionStage(schoolName, trackName string) (AdmissionStage, bool) {
	school := strings.TrimSuffix(strings.ReplaceAll(strings.TrimSpace(schoolName), " ", ""), "등학교")
	track := normalizeStageTrack(trackName)
	for _, s := range admissionStages {
		if s.SchoolName == school && s.TrackName == track {
			return s, true
		}
	}
	return AdmissionStage{}, false
}

// HasSecondStage 1차·2차로 나누어 선발하는 전형인지 여부.
func HasSecondStage(schoolName, trackName string) bool {
	s, ok := FindAdmissionStage(schoolName, trackName)
	return ok && s.Multiplier > 0
}

// normalizeStageTrack은 "일반전형", "취업자 특별전형" 같은 표기를 규칙의 전형명으로 맞춘다.
func normalizeStageTrack(track string) string {
	t := strings.ReplaceAll(strings.TrimSpace(track), " ", "")
	switch {
	case strings.Contains(t, "취업"):
		return "취업희망자"
	case strings.Contains(t, "특별"):
		return "특별"
	case strings.Contains(t, "일반"):
		return "일반"
	}
	return t
}
