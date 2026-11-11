package database

import (
	"time"

	"PHGC/internal/model"
)

// SharedPackageCover V2 공유 파일 표지
type SharedPackageCover struct {
	SchoolName    string    `json:"schoolName"`    // 발송 중학교 이름 (취합 메타데이터 및 중복 파일 식별용)
	AdmissionYear int       `json:"admissionYear"` // 입학 학년도
	CreatedAt     time.Time `json:"createdAt"`     // 작성 시각
	AppVersion    string    `json:"appVersion"`    // 앱 버전
	FormatVersion int       `json:"formatVersion"` // 포맷 버전 (2)
	RecordCount   int       `json:"recordCount"`   // 포함된 익명 학생 레코드 수
}

// AnonymousApplicationRecord 개인 식별 정보(이름, 학번, 반, 입력시각)가 완전히 제거된 익명 학생별 점수 자료
type AnonymousApplicationRecord struct {
	HighSchool     string                        `json:"highSchool"`     // 목표 고교명
	Department     string                        `json:"department"`     // 지원/배정 학과
	Track          string                        `json:"track"`          // 전형 (일반, 특별 등)
	PreferenceRank int                           `json:"preferenceRank"` // 지망 순위 (1지망, 2지망 등)
	Status         string                        `json:"status"`         // 결과 (합격, 불합격 등)
	Score          float64                       `json:"score"`          // 2차 총점 / 백분율
	ScoreBasis     string                        `json:"scoreBasis"`     // 점수 기준
	ScoreDetails   model.ApplicationScoreDetails `json:"scoreDetails"`   // 세부 점수 스냅샷 (1차 교과, 출결, 봉사 등)
	FormulaVersion string                        `json:"formulaVersion"` // 고교 산출식 버전
	// 1차 전형 결과(합격·불합격, 단계 구분 없는 전형·기존 자료는 빈값). 1차 합격 후 2차 탈락을
	// 관내 전체 표본으로 따로 분석하기 위한 결과 항목이며 개인 식별 정보가 아니다.
	FirstStageResult string `json:"firstStageResult,omitempty"`
	// 후기 일반고 항목별 점수(교과·출석·봉사·가산점 입력 여부·확정 여부). 다른 전형은 비움.
	GeneralDetail *SharedGeneralDetail `json:"generalDetail,omitempty"`
}

// SharedSummaryStat 다중 학교 자료 취합 시 평균과 표준편차를 정확하게 재계산하기 위한 모멘트(인원, 합, 제곱합) 포함 요약
type SharedSummaryStat struct {
	AdmissionYear   int     `json:"admissionYear"`
	HighSchool      string  `json:"highSchool"`
	Department      string  `json:"department"`
	Track           string  `json:"track"`
	ScoreType       string  `json:"scoreType"`
	TotalApplicants int     `json:"totalApplicants"`
	AcceptedCount   int     `json:"acceptedCount"`
	AcceptedSum     float64 `json:"acceptedSum"`   // 합계 (다중 학교 평균 산출용)
	AcceptedSumSq   float64 `json:"acceptedSumSq"` // 제곱합 (다중 학교 표준편차 산출용)
	AcceptedMin     float64 `json:"acceptedMin"`
	AcceptedMax     float64 `json:"acceptedMax"`
	AcceptedAvg     float64 `json:"acceptedAvg"`
	AcceptedMedian  float64 `json:"acceptedMedian"`
	AcceptedQ1      float64 `json:"acceptedQ1"`
	AcceptedQ3      float64 `json:"acceptedQ3"`
	AcceptedStdDev  float64 `json:"acceptedStdDev"`
	RejectedCount   int     `json:"rejectedCount"`
	RejectedSum     float64 `json:"rejectedSum"`
	RejectedMax     float64 `json:"rejectedMax"`
	RejectedAvg     float64 `json:"rejectedAvg"`
	HasOverlap      bool    `json:"hasOverlap"`
	OverlapMin      float64 `json:"overlapMin"`
	OverlapMax      float64 `json:"overlapMax"`
}

// SharedScoreHistogramBucket 구간별 점수 히스토그램
type SharedScoreHistogramBucket struct {
	MinScore      float64 `json:"minScore"`
	MaxScore      float64 `json:"maxScore"`
	AcceptedCount int     `json:"acceptedCount"`
	RejectedCount int     `json:"rejectedCount"`
}

// SharedDepartmentHistogram 분석 단위별 히스토그램 묶음
type SharedDepartmentHistogram struct {
	HighSchool string                       `json:"highSchool"`
	Department string                       `json:"department"`
	Track      string                       `json:"track"`
	ScoreType  string                       `json:"scoreType"`
	Step       float64                      `json:"step"`
	Buckets    []SharedScoreHistogramBucket `json:"buckets"`
}

// SharedPackageV2 관내 공유 패키지 V2 전체 구조
type SharedPackageV2 struct {
	Cover            SharedPackageCover           `json:"cover"`
	AnonymousRecords []AnonymousApplicationRecord `json:"anonymousRecords"` // Fisher-Yates 무작위 셔플 적용
	Histograms       []SharedDepartmentHistogram  `json:"histograms"`
	SummaryStats     []SharedSummaryStat          `json:"summaryStats"`
	FormulaVersions  map[string]string            `json:"formulaVersions"`
}

// SharedParticipatingSchool 참여 학교 정보
type SharedParticipatingSchool struct {
	ID            int64     `json:"id"`
	SchoolName    string    `json:"schoolName"`
	AdmissionYear int       `json:"admissionYear"`
	FormatVersion int       `json:"formatVersion"`
	RecordCount   int       `json:"recordCount"`
	ImportedAt    time.Time `json:"importedAt"`
}

// SharedPackageImportResult 패키지 가져오기 결과
type SharedPackageImportResult struct {
	SchoolName               string `json:"schoolName"`
	AdmissionYear            int    `json:"admissionYear"`
	FormatVersion            int    `json:"formatVersion"`
	RecordCount              int    `json:"recordCount"`
	IsReplaced               bool   `json:"isReplaced"`
	TotalParticipatingSchool int    `json:"totalParticipatingSchool"`
	TotalAnonymousRecords    int    `json:"totalAnonymousRecords"`
}

// ConsolidatedStatsResult 관내 통합 통계 산출 결과
type ConsolidatedStatsResult struct {
	AdmissionYear            int                       `json:"admissionYear"`
	HighSchool               string                    `json:"highSchool"`
	Department               string                    `json:"department"`
	Track                    string                    `json:"track"`
	TotalParticipatingSchool int                       `json:"totalParticipatingSchool"`
	TotalApplicants          int                       `json:"totalApplicants"`
	AcceptedCount            int                       `json:"acceptedCount"`
	AcceptedMin              float64                   `json:"acceptedMin"`
	AcceptedMax              float64                   `json:"acceptedMax"`
	AcceptedAvg              float64                   `json:"acceptedAvg"`
	AcceptedMedian           float64                   `json:"acceptedMedian"`
	AcceptedQ1               float64                   `json:"acceptedQ1"`
	AcceptedQ3               float64                   `json:"acceptedQ3"`
	AcceptedStdDev           float64                   `json:"acceptedStdDev"`
	RejectedCount            int                       `json:"rejectedCount"`
	RejectedMax              float64                   `json:"rejectedMax"`
	RejectedAvg              float64                   `json:"rejectedAvg"`
	SmallSample              bool                      `json:"smallSample"`     // 합격·불합격 표본이 3명 미만이면 참고용
	Stage1PassCount          int                       `json:"stage1PassCount"` // 1차 합격(최종 합격·2차 탈락 포함)
	Stage1PassMin            float64                   `json:"stage1PassMin"`   // 관내 1차 합격선
	Stage2FailCount          int                       `json:"stage2FailCount"` // 1차 합격 후 최종 불합격
	Stage2FailAvg            float64                   `json:"stage2FailAvg"`
	HasOverlap               bool                      `json:"hasOverlap"`
	OverlapMin               float64                   `json:"overlapMin"`
	OverlapMax               float64                   `json:"overlapMax"`
	Histogram                SharedDepartmentHistogram `json:"histogram"`
}
