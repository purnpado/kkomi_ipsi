package database

import (
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"

	"PHGC/internal/calc"
)

// 관내 공유 자료 검증(관내 공유 결과 → 자료 검증).
// 다른 학교가 보낸 익명 원서 결과를 점검해 "있을 수 없는 값"(오류)과 "튀는 값"(확인 필요)을 찾는다.
// 점검은 그럴듯하게 틀린 값(합격선 근처 학생의 합격·불합격이 뒤바뀐 경우 등)은 잡지 못한다.
// 기준값은 가상 오류를 섞은 검출률 측정(tools/verifysim, docs/shared-data-verification.md)으로 정했다(2026-11-18):
// K=0.75·학과 최소 5건·학교 전체 최소 3건·IQR 최소폭 만점의 5%, 낮은 합격은 그보다 높은 점수의 1차 불합격(미배정)이
// 다른 학교에 있을 때만 건다. 학교 8곳 기준 "크게 낮은 불합격자를 합격으로" 98.7% 검출, 정상 자료 확인 필요 0.1%, 오류 0%.

// SharedOutlierK 튀는 값 판정 폭: 비교 자료 사분위 범위(IQR)의 몇 배 밖이면 튄다고 볼지.
var SharedOutlierK = 0.75

// SharedTooLowRatio 만점의 이 비율보다 낮은 점수는 실제로 나오기 어렵다(가장 낮은 성취도·기본 출결만으로도 넘음).
var SharedTooLowRatio = 0.15

// SharedOutlierMinRef 튀는 값 판정에 필요한 비교 자료(다른 학교·우리 학교 합격자) 최소 수(학교·전형 전체 묶음).
var SharedOutlierMinRef = 3

// SharedDeptMinRef 학과 묶음으로 비교하려면 필요한 최소 수. 모자라면 학교·전형 전체로 비교한다.
var SharedDeptMinRef = 5

// SharedIQRFloor 사분위 범위가 이보다 좁으면(만점 대비) 이 폭으로 본다. 표본이 작고 점수가 촘촘할 때 정상 하위 합격자가 걸리는 것을 막는다.
var SharedIQRFloor = 0.05

// SharedVerifySchool 학교·학년도 파일 한 개의 점검 요약.
type SharedVerifySchool struct {
	PkgID          int64  `json:"pkgId"`
	SchoolName     string `json:"schoolName"`
	AdmissionYear  int    `json:"admissionYear"`
	FormatVersion  int    `json:"formatVersion"`
	RecordCount    int    `json:"recordCount"`
	ImportedAt     string `json:"importedAt"`
	Excluded       bool   `json:"excluded"`
	IsOwn          bool   `json:"isOwn"`
	BeforeBaseline bool   `json:"beforeBaseline"` // 기준 학년도 이전 자료
	Errors         int    `json:"errors"`
	Warnings       int    `json:"warnings"`
	ExcludedRecs   int    `json:"excludedRecords"` // 원서 단위로 뺀 수
	FormulaOther   int    `json:"formulaOther"`    // 다른 요강 학년도 산출식으로 계산된 원서 수(원서마다 늘어놓지 않고 학교 단위로 보인다)
}

// SharedVerifyIssue 원서 한 건의 점검 결과.
type SharedVerifyIssue struct {
	RecordID      int64   `json:"recordId"`
	PkgID         int64   `json:"pkgId"`
	SchoolName    string  `json:"schoolName"`
	AdmissionYear int     `json:"admissionYear"`
	HighSchool    string  `json:"highSchool"`
	Department    string  `json:"department"`
	Track         string  `json:"track"`
	Status        string  `json:"status"`
	Score         float64 `json:"score"`
	Level         string  `json:"level"` // error | warning
	Code          string  `json:"code"`
	Message       string  `json:"message"`
	Excluded      bool    `json:"excluded"`
	// 튀는 값 점검에서만: 비교한 묶음(학과 이름 또는 "학교 전체"), 확인 기준선, 비교한 합격 점수(그림용)
	RefScope  string    `json:"refScope,omitempty"`
	Fence     float64   `json:"fence,omitempty"`
	RefScores []float64 `json:"refScores,omitempty"`
	RefMax    float64   `json:"refMax,omitempty"` // 그 전형 만점(그림 축)
}

// SharedGroupIssue 학교·학과·전형 묶음 단위 점검(정원 초과 등).
type SharedGroupIssue struct {
	AdmissionYear int    `json:"admissionYear"`
	HighSchool    string `json:"highSchool"`
	Department    string `json:"department"`
	Track         string `json:"track"`
	Message       string `json:"message"`
}

// SharedVerifyReport 자료 검증 화면 전체.
type SharedVerifyReport struct {
	BaselineYear int                  `json:"baselineYear"`
	Schools      []SharedVerifySchool `json:"schools"`
	Issues       []SharedVerifyIssue  `json:"issues"`
	GroupIssues  []SharedGroupIssue   `json:"groupIssues"`
}

type verifyRecord struct {
	id, pkg                   int64
	school                    string
	year                      int
	high, dept, track, status string
	score                     float64
	details                   string
	version, firstStage       string
	excluded                  bool
	own                       bool
}

var validSharedStatus = map[string]bool{
	"합격": true, "불합격": true, "최종 진학": true, "최종진학": true,
	"지원희망": true, "지원 희망": true, "지원예정": true, "지원 예정": true, "지원완료": true, "지원 완료": true,
}

func isAcceptedStatus(s string) bool {
	s = strings.TrimSpace(s)
	return s == "합격" || s == "최종 진학" || s == "최종진학"
}

// sharedScoreMax 학교·전형의 만점. 모르는 학교·전형이면 0.
func sharedScoreMax(high, track string) float64 {
	if high == GeneralHighSchoolKey {
		return 200
	}
	for _, rule := range calc.AllSchoolRules {
		if rule.SchoolName == high && rule.TrackName == track {
			return rule.TotalMax
		}
	}
	return 0
}

// VerifySharedData 받은 관내 공유 자료 전체(모든 학년도)를 점검한다.
func (dm *DBManager) VerifySharedData() (*SharedVerifyReport, error) {
	report := &SharedVerifyReport{BaselineYear: SharedBaselineYear, Schools: []SharedVerifySchool{}, Issues: []SharedVerifyIssue{}, GroupIssues: []SharedGroupIssue{}}
	records, schools, err := dm.loadVerifyRecords()
	if err != nil {
		return nil, err
	}
	own := dm.ownStatsAccepted()
	byPkg := map[int64]*SharedVerifySchool{}
	for i := range schools {
		byPkg[schools[i].PkgID] = &schools[i]
	}
	add := func(r verifyRecord, level, code, msg string) {
		report.Issues = append(report.Issues, SharedVerifyIssue{RecordID: r.id, PkgID: r.pkg, SchoolName: r.school, AdmissionYear: r.year,
			HighSchool: r.high, Department: r.dept, Track: r.track, Status: r.status, Score: r.score, Level: level, Code: code, Message: msg, Excluded: r.excluded})
		if s := byPkg[r.pkg]; s != nil {
			if code == "formula" {
				s.FormulaOther++
				return
			}
			if level == "error" {
				s.Errors++
			} else {
				s.Warnings++
			}
		}
	}
	for _, r := range records {
		for _, issue := range checkSharedRecord(r) {
			add(r, issue[0], issue[1], issue[2])
		}
	}
	for _, hit := range outlierIssues(records, own) {
		add(hit.r, "warning", hit.code, hit.msg)
		last := &report.Issues[len(report.Issues)-1]
		last.RefScope, last.Fence, last.RefScores, last.RefMax = hit.scope, hit.fence, hit.refs, sharedScoreMax(hit.r.high, hit.r.track)
	}
	report.GroupIssues = dm.quotaIssues(records, own)
	for i := range schools {
		report.Schools = append(report.Schools, schools[i])
	}
	sort.SliceStable(report.Schools, func(i, j int) bool {
		a, b := report.Schools[i], report.Schools[j]
		if a.Excluded != b.Excluded {
			return !a.Excluded // 통계에 들어가는 자료를 먼저 본다
		}
		if a.Errors != b.Errors {
			return a.Errors > b.Errors
		}
		if a.Warnings != b.Warnings {
			return a.Warnings > b.Warnings
		}
		if a.AdmissionYear != b.AdmissionYear {
			return a.AdmissionYear > b.AdmissionYear
		}
		return a.SchoolName < b.SchoolName
	})
	sort.SliceStable(report.Issues, func(i, j int) bool {
		a, b := report.Issues[i], report.Issues[j]
		if a.Level != b.Level {
			return a.Level == "error"
		}
		return a.RecordID < b.RecordID
	})
	return report, nil
}

// checkSharedRecord 원서 한 건만 보고 알 수 있는 점검: [수준, 코드, 설명]
func checkSharedRecord(r verifyRecord) [][3]string {
	var out [][3]string
	status := strings.TrimSpace(r.status)
	if !validSharedStatus[status] {
		out = append(out, [3]string{"error", "status", fmt.Sprintf("알 수 없는 결과 값 %q", r.status)})
	}
	max := sharedScoreMax(r.high, r.track)
	if max == 0 {
		out = append(out, [3]string{"error", "unknown", fmt.Sprintf("산출식에 없는 학교·전형(%s · %s)", r.high, r.track)})
	}
	if r.score < 0 || (max > 0 && r.score > max+0.01) {
		out = append(out, [3]string{"error", "range", fmt.Sprintf("점수 %.2f이(가) 0~%.0f점 범위를 벗어남", r.score, max)})
	} else if r.score == 0 && (isAcceptedStatus(status) || status == "불합격") && r.high != GeneralHighSchoolKey {
		out = append(out, [3]string{"warning", "noscore", "결과는 있는데 점수가 0점"})
	} else if max > 0 && r.score > 0 && r.score < SharedTooLowRatio*max {
		// 출결·봉사 기본 점수만으로도 이보다 높다: 소수점 위치 오타(85.3 → 8.53) 등
		out = append(out, [3]string{"warning", "too_low", fmt.Sprintf("점수 %.2f가 만점(%.0f)의 %.0f%%도 안 됨 — 소수점 위치 등 입력 오타일 수 있음", r.score, max, SharedTooLowRatio*100)})
	}
	if total := snapshotTotal(r.details); total > 0 && math.Abs(total-r.score) > 0.05 {
		out = append(out, [3]string{"warning", "snapshot", fmt.Sprintf("원서 점수 %.2f가 산출 기록(%.2f)과 다름 — 손으로 고친 점수일 수 있음", r.score, total)})
	}
	if fy := formulaYear(r.version); fy != "" {
		if y, _ := strconv.Atoi(fy); y != r.year {
			out = append(out, [3]string{"warning", "formula", fmt.Sprintf("%d 고입 자료인데 %d 요강 산출식으로 계산됨", r.year, y)})
		}
	}
	return out
}
