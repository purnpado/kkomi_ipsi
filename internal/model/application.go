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
	ID                 int      `json:"id"`
	ClassNum           int      `json:"classNum"`
	StudentNum         string   `json:"studentNum"`
	StudentName        string   `json:"studentName"`
	AdmissionYear      int      `json:"admissionYear"`
	Category           string   `json:"category"` // meister, special, self_foreign, general, other
	SchoolName         string   `json:"schoolName"`
	Track              string   `json:"track"`
	Status             string   `json:"status"`
	Score              float64  `json:"score"`
	ScoreBasis         string   `json:"scoreBasis"`
	Preferences        []string `json:"preferences"`
	AssignedDepartment string   `json:"assignedDepartment"`
	AssignedSchool     string   `json:"assignedSchool"`
	// FirstStageResult 1차 전형 결과("" 미구분·해당 없음, "합격", "불합격").
	// 1차에서 정원의 1.3~1.5배를 뽑고 2차(면접 등)를 거쳐 최종 합격자를 정하는 학교에서
	// "1차 합격 후 최종 불합격"을 따로 분석하기 위해 쓴다.
	FirstStageResult string                   `json:"firstStageResult"`
	ScoreDetails     *ApplicationScoreDetails `json:"scoreDetails,omitempty"`
	UpdatedAt        string                   `json:"updatedAt"`
}

// IsScoredCategory reports whether a category's recorded score is comparable
// across students. 자사고·외고·과학고·예술고·스포츠과학고·애니원고 등은 실기·면접
// 같은 별도 전형으로 선발하므로 점수 통계·커트라인에서 빼고 결과만 기록한다.
func IsScoredCategory(category string) bool {
	switch category {
	case "meister", "special", "general":
		return true
	}
	return false
}
