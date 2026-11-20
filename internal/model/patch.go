package model

// DataManifest is intentionally non-sensitive: it only identifies the
// encrypted package format and carries the random password-derivation salt.
type DataManifest struct {
	Format        string `json:"format"`
	Salt          []byte `json:"salt"`
	PackageID     string `json:"packageId"`
	Revision      int    `json:"revision"`
	AdmissionYear int    `json:"admissionYear"`
}

// PatchChange is the class-scoped mutation that a homeroom teacher may export.
// It is encrypted and merged only by the grade head on an offline computer.
// Application records never leave the school through the central server.
type PatchChange struct {
	ClassNum     int                 `json:"classNum"`
	StudentNum   string              `json:"studentNum"`
	StudentName  string              `json:"studentName"`
	Attendance   string              `json:"attendance,omitempty"`
	Volunteer    string              `json:"volunteer,omitempty"`
	Extra        string              `json:"extra,omitempty"`
	Applications []ApplicationRecord `json:"applications,omitempty"`
	// StatExclusion 입시 통계 제외 표시(사유 없음). 한 번도 바꾸지 않은 학생은 비어 있다.
	StatExclusion *StatExclusionMark `json:"statExclusion,omitempty"`
	// DeletedApplications 담임이 배포 뒤 지웠거나 학교·전형을 바꾼 원서의 옛 이름표(점수·상태 없음).
	DeletedApplications []ApplicationKey `json:"deletedApplications,omitempty"`
}

// ApplicationKey 원서 이름표(학년도·구분·학교·전형)와 지운 시각.
type ApplicationKey struct {
	AdmissionYear int    `json:"admissionYear"`
	Category      string `json:"category"`
	SchoolName    string `json:"schoolName"`
	Track         string `json:"track"`
	DeletedAt     string `json:"deletedAt,omitempty"`
}

// StatExclusionMark 입시 통계 제외 여부와 바꾼 시각(UTC "2006-01-02 15:04:05").
// 병합할 때 더 최근에 바꾼 쪽을 남긴다.
type StatExclusionMark struct {
	Excluded  bool   `json:"excluded"`
	UpdatedAt string `json:"updatedAt"`
}

type PatchFile struct {
	PackageID      string        `json:"packageId"`
	BaseRevision   int           `json:"baseRevision"`
	SourceUsername string        `json:"sourceUsername"`
	ClassNum       int           `json:"classNum"`
	Changes        []PatchChange `json:"changes"`
	// FormatVersion 2부터 배포 시각·지운 원서 기록을 싣는다. 0이면 예전 버전 파일.
	FormatVersion int `json:"formatVersion,omitempty"`
	// BaseDistributedAt 담임 PC가 받은 배포자료를 학년부장이 만든 시각(UTC).
	BaseDistributedAt string `json:"baseDistributedAt,omitempty"`
	// BaseReceivedAt 담임 PC에서 그 배포자료로 처음 로그인한 시각(담임 PC 시계).
	BaseReceivedAt string `json:"baseReceivedAt,omitempty"`
}

// PatchPreview contains only merge metadata. It does not expose attendance,
// volunteer, or other student values in the import confirmation screen.
type PatchPreview struct {
	Path                string             `json:"path"`
	SourceUsername      string             `json:"sourceUsername"`
	ClassNum            int                `json:"classNum"`
	ChangeCount         int                `json:"changeCount"`
	StudentNames        []string           `json:"studentNames"`
	BaseRevision        int                `json:"baseRevision"`
	CurrentRevision     int                `json:"currentRevision"`
	HasRevisionConflict bool               `json:"hasRevisionConflict"`
	SkippedApplications int                `json:"skippedApplications"`
	Items               []PatchPreviewItem `json:"items"`
	// BaseDistributedAt 담임이 받은 배포자료를 만든 시각. 비어 있으면 예전 버전 파일(Legacy).
	BaseDistributedAt string `json:"baseDistributedAt"`
	Legacy            bool   `json:"legacy"`
	FormatVersion     int    `json:"formatVersion"`
	// ReviewCount 학년부장이 골라야 하는 원서 수(지우기·바꾸기·양쪽에서 고침 등).
	ReviewCount int `json:"reviewCount"`
}

// PatchPreviewItem lists only the categories a grade head may choose to
// merge. It intentionally does not expose raw student values in the preview.
type PatchPreviewItem struct {
	StudentNum   string `json:"studentNum"`
	StudentName  string `json:"studentName"`
	Attendance   bool   `json:"attendance"`
	Volunteer    bool   `json:"volunteer"`
	Extra        bool   `json:"extra"`
	Applications bool   `json:"applications"`
	// ApplicationItems 원서별 병합 분류(학교·전형·상태만, 성적 수치 없음)
	ApplicationItems []PatchAppItem `json:"applicationItems,omitempty"`
	// KeptApplications 담임 파일에 없어 그대로 두는 학년부장 원서 수
	KeptApplications int `json:"keptApplications"`
	// SilentSkipped 학년부장 것이 최종본이라 조용히 건너뛰는 원서 수(확정 학년도 포함)
	SilentSkipped int `json:"silentSkipped"`
}

// PatchAppItem 한 원서(또는 학교·전형을 바꾼 옛·새 원서 한 쌍)의 병합 분류와 고를 수 있는 처리.
type PatchAppItem struct {
	ID          string           `json:"id"`
	Kind        string           `json:"kind"`
	NeedsReview bool             `json:"needsReview"`
	Default     string           `json:"default"`
	Options     []string         `json:"options"`
	Mine        *PatchAppSummary `json:"mine,omitempty"`   // 학년부장 PC 원서
	Theirs      *PatchAppSummary `json:"theirs,omitempty"` // 담임 파일 원서
}

// PatchAppSummary 화면에 보일 원서 요약(성적 수치 없음).
type PatchAppSummary struct {
	AdmissionYear      int    `json:"admissionYear"`
	Category           string `json:"category"`
	SchoolName         string `json:"schoolName"`
	Track              string `json:"track"`
	Status             string `json:"status"`
	AssignedDepartment string `json:"assignedDepartment"`
	ExtraRound         bool   `json:"extraRound"`
	UpdatedAt          string `json:"updatedAt"`
	Deleted            bool   `json:"deleted"`
}

// PatchBatchResult 여러 반 일괄 병합 결과. 학년부장이 골라야 하는 원서는 학년부장 것을 그대로 둔다.
type PatchBatchResult struct {
	Files         int         `json:"files"`
	Students      int         `json:"students"`
	Review        int         `json:"review"`
	ReviewByClass map[int]int `json:"reviewByClass"`
}

// PatchMergeSelection describes the selected categories for one student.
type PatchMergeSelection struct {
	StudentNum   string `json:"studentNum"`
	Attendance   bool   `json:"attendance"`
	Volunteer    bool   `json:"volunteer"`
	Extra        bool   `json:"extra"`
	Applications bool   `json:"applications"`
	// ApplicationActions 원서 항목 ID → 처리(apply·skip·keep·teacher·delete·replace·both). 없으면 기본값.
	ApplicationActions map[string]string `json:"applicationActions,omitempty"`
}
