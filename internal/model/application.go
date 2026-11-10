package model

// ApplicationScoreDetails 원서 접수 시점의 세부 산출 점수 스냅샷
type ApplicationScoreDetails struct {
	Percentile       float64 `json:"percentile"`       // 전교 석차 백분율 (%)
	AllAverage       float64 `json:"allAverage"`       // 전과목 평균 성취도 (1~5)
	AcademicScore    float64 `json:"academicScore"`    // 교과 점수 (1차-B: 직업계고는 전과목+가중과목, 일반고는 교과점수)
	AcademicMax      float64 `json:"academicMax"`      // 교과 만점
	NonAcademicScore float64 `json:"nonAcademicScore"` // 비교과 점수
	NonAcademicMax   float64 `json:"nonAcademicMax"`   // 비교과 만점
	AttendanceScore  float64 `json:"attendanceScore"`  // 출결 점수
	AttendanceMax    float64 `json:"attendanceMax"`
	VolunteerScore   float64 `json:"volunteerScore"` // 봉사 점수
	VolunteerMax     float64 `json:"volunteerMax"`
	ExtraScore       float64 `json:"extraScore"`     // 가산점/리더십
	TotalScore       float64 `json:"totalScore"`     // 2차 서류 총점
	TotalMax         float64 `json:"totalMax"`       // 서류 총점 만점
	FormulaVersion   string  `json:"formulaVersion"` // 적용 산출식 버전
	CapturedAt       string  `json:"capturedAt"`     // 스냅샷 생성 시각(UTC, RFC3339)
	SnapshotSource   string  `json:"snapshotSource"` // application-save, legacy-backfill, legacy-unknown
}

// ApplicationRecord is a local-only student admission application. Scores are
// frozen at the time of application so later formula changes do not alter
// historical results.
type ApplicationRecord struct {
	ID                 int                      `json:"id"`
	ClassNum           int                      `json:"classNum"`
	StudentNum         string                   `json:"studentNum"`
	StudentName        string                   `json:"studentName"`
	AdmissionYear      int                      `json:"admissionYear"`
	Category           string                   `json:"category"` // meister, special, self_foreign, general, other
	SchoolName         string                   `json:"schoolName"`
	Track              string                   `json:"track"`
	Status             string                   `json:"status"`
	Score              float64                  `json:"score"`
	ScoreBasis         string                   `json:"scoreBasis"`
	Preferences        []string                 `json:"preferences"`
	AssignedDepartment string                   `json:"assignedDepartment"`
	AssignedSchool     string                   `json:"assignedSchool"`
	ScoreDetails       *ApplicationScoreDetails `json:"scoreDetails,omitempty"`
	UpdatedAt          string                   `json:"updatedAt"`
}
