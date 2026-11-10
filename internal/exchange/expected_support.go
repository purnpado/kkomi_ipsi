package exchange

// 브릿지 서버 주소 (배포 환경에 맞게 수정)
// 오프라인 전용: 외부 서버 URL 제거됨

// ExpectedSupportItem contains only an aggregate per target school/department.
// It deliberately has no student, class, teacher or individual-score field.
type ExpectedSupportItem struct {
	Category       string  `json:"category"`
	TargetSchool   string  `json:"targetSchool"`
	Department     string  `json:"department"`
	Track          string  `json:"track"`
	PreferenceRank int     `json:"preferenceRank"`
	PlannedCount   int     `json:"plannedCount"`
	SubmittedCount int     `json:"submittedCount"`
	MaxScore       float64 `json:"maxScore"`
	MinScore       float64 `json:"minScore"`
	AvgScore       float64 `json:"avgScore"`
}

// ExpectedSupportAggregate is the participant-facing Ulsan-wide result. It
// excludes submitting-school names and all score information.
type ExpectedSupportAggregate struct {
	AdmissionYear  int    `json:"admissionYear"`
	Category       string `json:"category"`
	TargetSchool   string `json:"targetSchool"`
	Department     string `json:"department"`
	Track          string `json:"track"`
	PreferenceRank int    `json:"preferenceRank"`
	PlannedCount   int    `json:"plannedCount"`
	SubmittedCount int    `json:"submittedCount"`
}
