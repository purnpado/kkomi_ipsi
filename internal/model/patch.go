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
}

type PatchFile struct {
	PackageID      string        `json:"packageId"`
	BaseRevision   int           `json:"baseRevision"`
	SourceUsername string        `json:"sourceUsername"`
	ClassNum       int           `json:"classNum"`
	Changes        []PatchChange `json:"changes"`
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
	Items               []PatchPreviewItem `json:"items"`
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
}

// PatchMergeSelection describes the selected categories for one student.
type PatchMergeSelection struct {
	StudentNum   string `json:"studentNum"`
	Attendance   bool   `json:"attendance"`
	Volunteer    bool   `json:"volunteer"`
	Extra        bool   `json:"extra"`
	Applications bool   `json:"applications"`
}
