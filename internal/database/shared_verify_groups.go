package database

import (
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"strings"

	"PHGC/internal/model"
)

// 관내 공유 자료 검증: 비교 기준이 필요한 점검(튀는 값·정원 초과)과 자료 읽기.

func (dm *DBManager) loadVerifyRecords() ([]verifyRecord, []SharedVerifySchool, error) {
	if err := dm.InitSharedDatabaseTables(); err != nil {
		return nil, nil, err
	}
	db, err := dm.OpenDB(dm.GetConfigDBPath())
	if err != nil {
		return nil, nil, err
	}
	defer db.Close()
	ownSchool := dm.ownSchoolName()
	var schools []SharedVerifySchool
	ownPkg := map[int64]bool{}
	pkgRows, err := db.Query(`SELECT id, school_name, admission_year, format_version, record_count, COALESCE(imported_at, ''), excluded FROM shared_participating_schools`)
	if err != nil {
		return nil, nil, err
	}
	for pkgRows.Next() {
		var s SharedVerifySchool
		if err := pkgRows.Scan(&s.PkgID, &s.SchoolName, &s.AdmissionYear, &s.FormatVersion, &s.RecordCount, &s.ImportedAt, &s.Excluded); err != nil {
			continue
		}
		s.IsOwn = ownSchool != "" && s.SchoolName == ownSchool
		s.BeforeBaseline = !s.IsOwn && s.AdmissionYear < SharedBaselineYear
		ownPkg[s.PkgID] = s.IsOwn
		schools = append(schools, s)
	}
	pkgRows.Close()
	names := map[int64]string{}
	for _, s := range schools {
		names[s.PkgID] = s.SchoolName
	}
	rows, err := db.Query(`SELECT id, school_pkg_id, admission_year, high_school, department, track, status, score,
		COALESCE(score_details_json, ''), COALESCE(formula_version, ''), COALESCE(first_stage_result, ''), excluded, self_excluded, COALESCE(extra_round, 0)
		FROM shared_anonymous_scores`)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	selfCount := map[int64]int{}
	var records []verifyRecord
	for rows.Next() {
		var r verifyRecord
		var self bool
		if err := rows.Scan(&r.id, &r.pkg, &r.year, &r.high, &r.dept, &r.track, &r.status, &r.score, &r.details, &r.version, &r.firstStage, &r.excluded, &self, &r.extraRound); err != nil {
			continue
		}
		r.school, r.own = names[r.pkg], ownPkg[r.pkg]
		if self {
			selfCount[r.pkg]++
		}
		records = append(records, r)
	}
	for i := range schools {
		schools[i].ExcludedRecs = selfCount[schools[i].PkgID]
	}
	return records, schools, nil
}

func snapshotTotal(detailsJSON string) float64 {
	if strings.TrimSpace(detailsJSON) == "" {
		return 0
	}
	var d model.ApplicationScoreDetails
	if json.Unmarshal([]byte(detailsJSON), &d) != nil {
		return 0
	}
	return d.TotalScore
}

// ownRef 우리 학교 합격 점수(학급 DB + 지난 보관 기록, 통계 제외 학생 뺌): 튀는 값·정원 점검의 비교 자료.
type ownRef struct {
	year              int
	high, dept, track string
	score             float64
}

func (dm *DBManager) ownStatsAccepted() []ownRef {
	records, err := dm.schoolRecordsWithHistory()
	if err != nil {
		return nil
	}
	var out []ownRef
	for _, r := range records {
		if !isAcceptedStatus(r.Status) || r.Score <= 0 || r.ExtraRound || (r.Category != "meister" && r.Category != "special") {
			continue
		}
		dept := r.AssignedDepartment
		out = append(out, ownRef{year: r.AdmissionYear, high: normalizeCutoffSchool(r.SchoolName), dept: normalizeCutoffDept(dept), track: normalizeCutoffTrack(r.Track), score: r.Score})
	}
	return out
}

type outlierHit struct {
	r         verifyRecord
	code, msg string
	fence     float64
	scope     string    // 비교한 묶음: 학과 이름 또는 "학교 전체"
	refs      []float64 // 비교한 합격 점수(그림용)
}

func groupKey(year int, high, track, dept string) string {
	return fmt.Sprintf("%d|%s|%s|%s", year, high, track, dept)
}

type refScore struct {
	pkg   int64 // 0 = 우리 학교 학급 자료
	score float64
}

// outlierIssues 같은 학교·전형의 다른 학교·우리 학교 합격 점수와 비교해 튀는 값을 찾는다.
// 자기 학교 파일의 점수는 비교 자료에서 뺀다(한 학교가 통째로 틀려도 스스로를 기준 삼지 않게).
func outlierIssues(records []verifyRecord, own []ownRef) []outlierHit {
	refs := map[string][]refScore{}
	addRef := func(year int, high, track, dept string, ref refScore) {
		refs[groupKey(year, high, track, "")] = append(refs[groupKey(year, high, track, "")], ref)
		if dept != "" {
			refs[groupKey(year, high, track, dept)] = append(refs[groupKey(year, high, track, dept)], ref)
		}
	}
	for _, r := range records {
		// 우리 학교 파일은 학급 자료(own)로 대신 넣어 두 번 세지 않는다.
		// 추가모집 합격은 미달이라 점수가 낮은 것이 정상이므로 기준선을 만들 때 넣지 않는다.
		if r.excluded || r.own || r.extraRound || r.score <= 0 || !isAcceptedStatus(r.status) || !plausibleScore(r) {
			continue
		}
		addRef(r.year, r.high, r.track, r.dept, refScore{pkg: r.pkg, score: r.score})
	}
	for _, o := range own {
		addRef(o.year, o.high, o.track, o.dept, refScore{score: o.score})
	}
	// 점수로 떨어진 불합격(1차 불합격, 일반고 미배정): 낮은 합격이 "앞뒤가 맞지 않는지" 보는 데 쓴다.
	// 미달이라 불합격자가 없으면 낮은 점수로 합격해도 정상이므로 걸지 않는다.
	// 학과가 있으면 같은 학과(1지망으로 적힌 학과)의 불합격만 근거로 쓴다: 인기 학과 불합격자가 미달·2지망 배정 학과의
	// 낮은 합격자보다 점수가 높은 것은 정상이다. 학과를 적지 않은 불합격은 학교 전체 근거로 함께 본다.
	rejected := map[string][]refScore{}
	for _, r := range records {
		if r.excluded || r.score <= 0 || strings.TrimSpace(r.status) != "불합격" || (r.firstStage != "불합격" && r.high != GeneralHighSchoolKey) || !plausibleScore(r) {
			continue
		}
		dept := r.dept
		if !SharedRejectSameDept {
			dept = ""
		}
		rejected[groupKey(r.year, r.high, r.track, dept)] = append(rejected[groupKey(r.year, r.high, r.track, dept)], refScore{pkg: r.pkg, score: r.score})
	}
	higherRejected := func(r verifyRecord) bool {
		keys := []string{groupKey(r.year, r.high, r.track, "")}
		if SharedRejectSameDept && r.dept != "" {
			keys = append(keys, groupKey(r.year, r.high, r.track, r.dept))
		}
		for _, key := range keys {
			for _, ref := range rejected[key] {
				if ref.pkg != r.pkg && ref.score > r.score {
					return true
				}
			}
		}
		return false
	}
	// 기준선: 학과 묶음에 비교 자료가 넉넉하면(SharedDeptMinRef) 학과로, 아니면 학교·전형 전체로 본다.
	// 비교 자료에서 자기 파일(같은 학교) 점수는 뺀다. 우리 학교 파일이면 학급 자료(pkg 0)도 자기 것이므로 뺀다.
	type fence struct {
		low, high float64
		scope     string
		refs      []float64
	}
	fences := func(r verifyRecord) (fence, bool) {
		max := sharedScoreMax(r.high, r.track)
		if max == 0 {
			return fence{}, false
		}
		type cand struct {
			key, scope string
			min        int
		}
		cands := []cand{{groupKey(r.year, r.high, r.track, ""), "학교 전체", SharedOutlierMinRef}}
		if r.dept != "" {
			cands = append([]cand{{groupKey(r.year, r.high, r.track, r.dept), r.dept, SharedDeptMinRef}}, cands...)
		}
		for _, c := range cands {
			var scores []float64
			for _, ref := range refs[c.key] {
				if ref.pkg == r.pkg || (ref.pkg == 0 && r.own) {
					continue
				}
				scores = append(scores, ref.score)
			}
			if len(scores) < c.min {
				continue
			}
			q1, q3 := quartiles(scores)
			iqr := math.Max(q3-q1, SharedIQRFloor*max)
			sort.Float64s(scores)
			return fence{low: round2(q1 - SharedOutlierK*iqr), high: round2(q3 + SharedOutlierK*iqr), scope: c.scope, refs: scores}, true
		}
		return fence{}, false
	}
	var hits []outlierHit
	for _, r := range records {
		if r.score <= 0 || r.extraRound { // 추가모집 합격은 낮아도 이상한 값으로 보지 않는다
			continue
		}
		f, ok := fences(r)
		if !ok {
			continue
		}
		status := strings.TrimSpace(r.status)
		where := f.scope
		switch {
		case isAcceptedStatus(status) && r.score < f.low && higherRejected(r):
			hits = append(hits, outlierHit{r, "low_accepted", fmt.Sprintf("합격 점수 %.2f가 관내 다른 학교 합격 자료(%s %d건)보다 크게 낮고, 이보다 점수가 높은 다른 학교 불합격자도 있음(확인 기준 %.2f) — 불합격을 합격으로 잘못 입력했을 수 있음", r.score, where, len(f.refs), f.low), f.low, where, f.refs})
		case status == "불합격" && (r.firstStage == "불합격" || r.high == GeneralHighSchoolKey) && r.score > f.high:
			kind := "1차 불합격"
			if r.high == GeneralHighSchoolKey {
				kind = "미배정"
			}
			hits = append(hits, outlierHit{r, "high_rejected", fmt.Sprintf("%s인데 점수 %.2f가 관내 다른 학교 합격 자료(%s %d건) 대부분보다 높음(확인 기준 %.2f) — 결과를 잘못 입력했을 수 있음", kind, r.score, where, len(f.refs), f.high), f.high, where, f.refs})
		}
	}
	return hits
}

// plausibleScore 원서 한 건 점검에서 점수가 범위 밖·학교명 오류가 아닌지. 그런 원서는 비교 기준·근거에 넣지 않는다.
func plausibleScore(r verifyRecord) bool {
	if !SharedSkipBadRefs {
		return true
	}
	max := sharedScoreMax(r.high, r.track)
	return max > 0 && r.score <= max+0.01 && r.score >= SharedTooLowRatio*max
}

// quartiles 1·3사분위(선형 보간).
func quartiles(values []float64) (float64, float64) {
	s := append([]float64(nil), values...)
	sort.Float64s(s)
	at := func(p float64) float64 {
		pos := p * float64(len(s)-1)
		lo := int(math.Floor(pos))
		hi := int(math.Ceil(pos))
		return s[lo] + (s[hi]-s[lo])*(pos-float64(lo))
	}
	return at(0.25), at(0.75)
}

// quotaIssues 공식 경쟁률 화면에 입력한 모집정원보다 관내 합격자가 많은 묶음.
func (dm *DBManager) quotaIssues(records []verifyRecord, own []ownRef) []SharedGroupIssue {
	out := []SharedGroupIssue{}
	comps, err := dm.GetCompetitionRecords()
	if err != nil || len(comps) == 0 {
		return out
	}
	count := map[string]int{}
	for _, r := range records {
		if r.excluded || r.own || !isAcceptedStatus(r.status) {
			continue
		}
		count[groupKey(r.year, r.high, r.track, "")]++
		if r.dept != "" {
			count[groupKey(r.year, r.high, r.track, r.dept)]++
		}
	}
	for _, o := range own {
		count[groupKey(o.year, o.high, o.track, "")]++
		if o.dept != "" {
			count[groupKey(o.year, o.high, o.track, o.dept)]++
		}
	}
	for _, c := range comps {
		if c.Quota <= 0 {
			continue
		}
		high, dept, track := normalizeCutoffSchool(c.SchoolName), normalizeCutoffDept(c.Department), normalizeCutoffTrack(c.Track)
		n := count[groupKey(c.AdmissionYear, high, track, dept)]
		if n > c.Quota {
			out = append(out, SharedGroupIssue{AdmissionYear: c.AdmissionYear, HighSchool: high, Department: dept, Track: track,
				Message: fmt.Sprintf("관내 합격자 %d명이 모집정원 %d명보다 많음 — 결과를 잘못 입력한 학교가 있거나 같은 자료가 겹쳤을 수 있음", n, c.Quota)})
		}
	}
	return out
}
