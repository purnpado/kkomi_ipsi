package database

import (
	"encoding/json"
	"math"
	"sort"
	"strings"

	"PHGC/internal/calc"
	"PHGC/internal/model"
)

// 후기 일반고 관내 합격선 추정.
// 교과(160)는 학교 안 석차백분율로 환산되므로 총점(교과+비교과 200)은 학교가 달라도 같은 잣대다.
// 교육청은 이 총점으로 정원만큼 선발하지만 합격점을 공개하지 않으므로, 관내 중학교가 결과를
// 익명으로 모아 합격선을 추정한다. 창체·행발 가산점은 학교마다 입력하지 않을 수 있어
// 모든 학교 자료를 쓸 수 있는 "기본 지표(교과+출석+봉사+창체·행발 기본 10점)"를 주 잣대로 삼고,
// 가산점까지 입력한 자료만으로 완전 총점 합격선을 따로 계산한다.

const GeneralHighSchoolKey = "후기 일반고"
const GeneralTrackKey = "후기 일반계고"

// MinSharedSample 이보다 적은 표본으로 낸 값은 화면에서 "표본 부족(참고)"으로 표시한다.
const MinSharedSample = 3

// SharedGeneralDetail 후기 일반고 학생 1명의 항목별 점수(개인 식별 정보 없음).
type SharedGeneralDetail struct {
	AcademicScore   float64  `json:"academicScore"`           // 교과(160)
	AttendanceScore float64  `json:"attendanceScore"`         // 출석(16)
	VolunteerScore  float64  `json:"volunteerScore"`          // 봉사(8)
	BehaviorScore   *float64 `json:"behaviorScore,omitempty"` // 행발(8) — 가산점 미입력 학교는 비움
	CreativeScore   *float64 `json:"creativeScore,omitempty"` // 창체(8)
	BaseScore       float64  `json:"baseScore"`               // 기본 지표 = 교과+출석+봉사+10
	BonusEntered    bool     `json:"bonusEntered"`            // 창체·행발 가산점 입력 완료
	ThirdYearFinal  bool     `json:"thirdYearFinal"`          // 3-2 성적 반영(확정)
	PerGradeExact   bool     `json:"perGradeExact"`           // 출결·봉사 학년별 실제 값
}

// buildGeneralAnonymousRecords 우리 학교 후기 일반고 결과(배정·미배정)를 익명 자료로 만든다.
// 점수는 원서 저장 당시 스냅샷이 아니라 지금 학생 자료로 다시 계산한 최신값(12월 확정치)을 쓴다.
func (dm *DBManager) buildGeneralAnonymousRecords(records []model.ApplicationRecord, admissionYear int) []AnonymousApplicationRecord {
	out := []AnonymousApplicationRecord{}
	// 학급마다 한 번만 전교 석차를 계산한다(학생마다 다시 계산하면 공유 파일 만들기가 수 분 걸린다).
	classCache := map[int]map[string]calc.StudentFullData{}
	lookup := func(r model.ApplicationRecord) (calc.StudentFullData, bool) {
		byStudent, ok := classCache[r.ClassNum]
		if !ok {
			byStudent = map[string]calc.StudentFullData{}
			if list, err := dm.GetClassFullGrades(r.ClassNum, true); err == nil {
				for _, f := range list {
					byStudent[strings.TrimSpace(f.StudentNum)+"|"+strings.TrimSpace(f.Name)] = f
				}
			}
			classCache[r.ClassNum] = byStudent
		}
		f, ok := byStudent[strings.TrimSpace(r.StudentNum)+"|"+strings.TrimSpace(r.StudentName)]
		return f, ok
	}
	for _, r := range records {
		if r.Category != "general" || (r.AdmissionYear > 0 && r.AdmissionYear != admissionYear) {
			continue
		}
		if r.Status != "합격" && r.Status != "불합격" && r.Status != "최종 진학" {
			continue // 결과가 나온 기록만 합격선 자료가 된다
		}
		full, found := lookup(r)
		if !found || full.GeneralHSAcademicScore <= 0 {
			continue
		}
		detail := SharedGeneralDetail{
			AcademicScore:   full.GeneralHSAcademicScore,
			AttendanceScore: full.GeneralHSAttendanceScore,
			VolunteerScore:  full.GeneralHSVolunteerScore,
			BaseScore:       full.GeneralHSBaseScore,
			BonusEntered:    full.GeneralHSBonusEntered,
			ThirdYearFinal:  full.GeneralHSThirdYearFinal,
			PerGradeExact:   full.GeneralHSPerGradeExact,
		}
		if detail.BonusEntered {
			b, c := full.GeneralHSBehaviorScore, full.GeneralHSCreativeScore
			detail.BehaviorScore, detail.CreativeScore = &b, &c
		}
		out = append(out, AnonymousApplicationRecord{
			HighSchool: GeneralHighSchoolKey, Department: "", Track: GeneralTrackKey, PreferenceRank: 0,
			Status: r.Status, Score: full.GeneralHSTotalScore, ScoreBasis: "후기 일반고 내신 총점(200)",
			FormulaVersion: "2027-general-ulsan", GeneralDetail: &detail,
		})
	}
	return out
}

// GeneralCutoffEstimate 한 잣대(기본 지표 또는 완전 총점)의 관내 합격선 추정.
type GeneralCutoffEstimate struct {
	Basis         string  `json:"basis"`         // "base"(기본 지표) | "total"(완전 총점)
	SampleCount   int     `json:"sampleCount"`   // 사용한 표본(확정 자료) 수
	AcceptedCount int     `json:"acceptedCount"` // 배정(합격)
	RejectedCount int     `json:"rejectedCount"` // 미배정(불합격)
	AcceptedMin   float64 `json:"acceptedMin"`   // 합격 최저점
	RejectedMax   float64 `json:"rejectedMax"`   // 불합격 최고점
	RangeLow      float64 `json:"rangeLow"`      // 실제 사례 기준 합격선 범위(불합격 최고점~합격 최저점)
	RangeHigh     float64 `json:"rangeHigh"`
	QuotaCutoff   float64 `json:"quotaCutoff"` // 정원 비율 기준 추정선(정원÷지원자 위치의 점수)
	SmallSample   bool    `json:"smallSample"` // 표본 부족(참고용)
}

// GeneralCutoffResult 후기 일반고 관내 합격선 추정 결과.
type GeneralCutoffResult struct {
	AdmissionYear       int                   `json:"admissionYear"`
	ParticipatingSchool int                   `json:"participatingSchool"`
	TotalRecords        int                   `json:"totalRecords"`
	ConfirmedRecords    int                   `json:"confirmedRecords"` // 3-2 반영 확정 자료 수(합격선 계산에 사용)
	Quota               int                   `json:"quota"`
	Applicants          int                   `json:"applicants"`
	Base                GeneralCutoffEstimate `json:"base"`
	Total               GeneralCutoffEstimate `json:"total"`
}

type generalSample struct {
	accepted bool
	value    float64
}

func estimateGeneralCutoff(basis string, samples []generalSample, quota, applicants int) GeneralCutoffEstimate {
	e := GeneralCutoffEstimate{Basis: basis, SampleCount: len(samples)}
	values := make([]float64, 0, len(samples))
	for _, s := range samples {
		values = append(values, s.value)
		if s.accepted {
			e.AcceptedCount++
			if e.AcceptedMin == 0 || s.value < e.AcceptedMin {
				e.AcceptedMin = s.value
			}
		} else {
			e.RejectedCount++
			if s.value > e.RejectedMax {
				e.RejectedMax = s.value
			}
		}
	}
	// 실제 사례 범위: 합격선은 불합격 최고점보다 높고 합격 최저점 이하 어딘가에 있다.
	e.RangeHigh = e.AcceptedMin
	e.RangeLow = e.RejectedMax
	if e.RangeLow > e.RangeHigh && e.RangeHigh > 0 {
		e.RangeLow, e.RangeHigh = e.RangeHigh, e.RangeLow // 점수가 겹치면 겹침 구간 전체를 범위로
	}
	// 정원 비율 기준: 관내 표본 분포에서 상위 (정원÷지원자) 위치의 점수
	if quota > 0 && applicants > 0 && len(values) > 0 {
		sort.Sort(sort.Reverse(sort.Float64Slice(values)))
		ratio := math.Min(1, float64(quota)/float64(applicants))
		idx := int(math.Ceil(ratio*float64(len(values)))) - 1
		if idx < 0 {
			idx = 0
		}
		e.QuotaCutoff = calc.Round2(values[idx])
	}
	e.AcceptedMin, e.RejectedMax = calc.Round2(e.AcceptedMin), calc.Round2(e.RejectedMax)
	e.RangeLow, e.RangeHigh = calc.Round2(e.RangeLow), calc.Round2(e.RangeHigh)
	e.SmallSample = e.SampleCount < MinSharedSample || (e.RejectedCount > 0 && e.RejectedCount < MinSharedSample)
	return e
}

// GetConsolidatedGeneralCutoff 취합된 관내 공유 자료로 후기 일반고 합격선을 추정한다.
func (dm *DBManager) GetConsolidatedGeneralCutoff(admissionYear int) (*GeneralCutoffResult, error) {
	if err := dm.InitSharedDatabaseTables(); err != nil {
		return nil, err
	}
	db, err := dm.OpenDB(dm.GetConfigDBPath())
	if err != nil {
		return nil, err
	}
	defer db.Close()
	res := &GeneralCutoffResult{AdmissionYear: admissionYear}
	_ = db.QueryRow(`SELECT COUNT(DISTINCT s.school_pkg_id) FROM shared_anonymous_scores s WHERE s.admission_year = ? AND s.high_school = ?`,
		admissionYear, GeneralHighSchoolKey).Scan(&res.ParticipatingSchool)
	_ = db.QueryRow(`SELECT quota, applicants FROM general_quota_records WHERE admission_year = ?`, admissionYear).Scan(&res.Quota, &res.Applicants)

	rows, err := db.Query(`SELECT status, score, COALESCE(general_detail_json, '') FROM shared_anonymous_scores WHERE admission_year = ? AND high_school = ?`,
		admissionYear, GeneralHighSchoolKey)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var base, total []generalSample
	for rows.Next() {
		var status, detailJSON string
		var score float64
		if rows.Scan(&status, &score, &detailJSON) != nil {
			continue
		}
		res.TotalRecords++
		var d SharedGeneralDetail
		if strings.TrimSpace(detailJSON) == "" || json.Unmarshal([]byte(detailJSON), &d) != nil || !d.ThirdYearFinal {
			continue // 3-2 성적이 반영된 확정 자료만 합격선에 쓴다
		}
		res.ConfirmedRecords++
		accepted := !strings.Contains(status, "불합격")
		base = append(base, generalSample{accepted, d.BaseScore})
		if d.BonusEntered {
			total = append(total, generalSample{accepted, score})
		}
	}
	res.Base = estimateGeneralCutoff("base", base, res.Quota, res.Applicants)
	res.Total = estimateGeneralCutoff("total", total, res.Quota, res.Applicants)
	return res, rows.Err()
}
