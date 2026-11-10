package database

import (
	"strings"
)

// CutoffInfo 고교 커트라인 정보 (연도 및 전형, 최고/최저/평균점 포함)
type CutoffInfo struct {
	Year       int     `json:"year"`
	SchoolName string  `json:"schoolName"`
	Department string  `json:"department"` // 후기고는 빈 문자열
	Track      string  `json:"track"`      // 마이스터고(일반), 마이스터고(특별), 특성화고(취업), 특성화고(일반), 일반계고
	ScoreType  string  `json:"scoreType"`  // percentile 또는 total_score
	MaxValue   float64 `json:"maxValue"`
	MinValue   float64 `json:"minValue"`
	AvgValue   float64 `json:"avgValue"` // 평균점
}

// --- 고입 커트라인 관리 ---

func normalizeCutoffSchool(name string) string {
	s := strings.TrimSpace(name)
	s = strings.ReplaceAll(s, " ", "")
	if strings.Contains(s, "일반계고") {
		return "울산 후기 일반계고"
	}
	if strings.HasPrefix(s, "울산마이스터") {
		return "울산마이스터고"
	}
	if strings.HasPrefix(s, "울산에너지") {
		return "울산에너지고"
	}
	if strings.HasPrefix(s, "현대공업") || strings.HasPrefix(s, "현대공고") {
		return "현대공업고"
	}
	if strings.HasPrefix(s, "울산공업") {
		return "울산공업고"
	}
	if strings.HasPrefix(s, "울산기술공업") {
		return "울산기술공업고"
	}
	if strings.HasPrefix(s, "울산미용예술") {
		return "울산미용예술고"
	}
	if strings.HasPrefix(s, "울산산업") {
		return "울산산업고"
	}
	if strings.HasPrefix(s, "울산생활과학") {
		return "울산생활과학고"
	}
	if strings.HasPrefix(s, "울산여자상업") {
		return "울산여자상업고"
	}
	if strings.HasPrefix(s, "울산상업") {
		return "울산상업고"
	}
	if strings.HasPrefix(s, "울산애니원") {
		return "울산애니원고"
	}
	if strings.HasSuffix(s, "고등학교") {
		return strings.TrimSuffix(s, "고등학교") + "고"
	}
	if !strings.HasSuffix(s, "고") {
		return s + "고"
	}
	return s
}

func normalizeCutoffDept(dept string) string {
	d := strings.TrimSpace(dept)
	if d == "공통" || d == "전체" || d == "학교 전체" || d == "학교전체" {
		return ""
	}
	return d
}

func normalizeCutoffTrack(track string) string {
	t := strings.TrimSpace(track)
	if t == "일반" || t == "일반전형" || t == "일반계고" || t == "일반계고전형" {
		return "일반"
	}
	if t == "특별" || t == "특별전형" {
		return "특별"
	}
	if t == "취업" || t == "취업희망자" || t == "취업희망자전형" {
		return "취업희망자"
	}
	return strings.TrimSuffix(t, "전형")
}

// SaveCutoffs 고교 커트라인 저장 (표준 규격 정규화 및 중복 자동 통합)
func (dm *DBManager) SaveCutoffs(cutoffs []CutoffInfo) error {
	if len(cutoffs) == 0 {
		return nil
	}
	db, err := dm.OpenDB(dm.GetConfigDBPath())
	if err != nil {
		return err
	}
	defer db.Close()

	type key struct {
		year                int
		school, dept, track string
	}
	uniqueMap := make(map[key]CutoffInfo)
	for _, c := range cutoffs {
		if strings.TrimSpace(c.SchoolName) == "" {
			continue
		}
		normSchool := normalizeCutoffSchool(c.SchoolName)
		normDept := normalizeCutoffDept(c.Department)
		normTrack := normalizeCutoffTrack(c.Track)
		k := key{c.Year, normSchool, normDept, normTrack}

		c.SchoolName = normSchool
		c.Department = normDept
		c.Track = normTrack
		if c.ScoreType == "" {
			if strings.Contains(normSchool, "일반계고") {
				c.ScoreType = "percentile"
			} else {
				c.ScoreType = "total_score"
			}
		}

		if cur, exists := uniqueMap[k]; exists {
			if c.MinValue > 0 && (cur.MinValue == 0 || c.MinValue < cur.MinValue) {
				cur.MinValue = c.MinValue
			}
			if c.MaxValue > cur.MaxValue {
				cur.MaxValue = c.MaxValue
			}
			if cur.AvgValue == 0 && c.AvgValue > 0 {
				cur.AvgValue = c.AvgValue
			}
			uniqueMap[k] = cur
		} else {
			uniqueMap[k] = c
		}
	}

	tx, err := db.Begin()
	if err != nil {
		return err
	}

	for _, c := range uniqueMap {
		shortName := strings.TrimSuffix(c.SchoolName, "고")
		_, _ = tx.Exec(`
			DELETE FROM highschool_cutoffs 
			WHERE year = ? 
			  AND (school_name = ? OR school_name = ? OR school_name = ? OR school_name LIKE ?)
			  AND (department = ? OR (department = '' AND ? = '공통') OR (department = '공통' AND ? = ''))
			  AND (track = ? OR track = ? OR track LIKE ?)
		`, c.Year, c.SchoolName, shortName, shortName+"고등학교", shortName+"%", c.Department, c.Department, c.Department, c.Track, c.Track+"전형", c.Track+"%")

		_, err = tx.Exec(`
			INSERT INTO highschool_cutoffs (year, school_name, department, track, score_type, max_value, min_value, avg_value)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(year, school_name, department, track) DO UPDATE SET
				score_type = excluded.score_type,
				max_value = excluded.max_value,
				min_value = excluded.min_value,
				avg_value = excluded.avg_value
		`, c.Year, c.SchoolName, c.Department, c.Track, c.ScoreType, c.MaxValue, c.MinValue, c.AvgValue)
		if err != nil {
			tx.Rollback()
			return err
		}
	}

	return tx.Commit()
}

// DeleteCutoff 특정 커트라인 항목 삭제 (학교명 접미사 및 학과/전형 유연 매칭)
func (dm *DBManager) DeleteCutoff(year int, schoolName, department, track string) error {
	db, err := dm.OpenDB(dm.GetConfigDBPath())
	if err != nil {
		return err
	}
	defer db.Close()

	normSchool := strings.TrimSuffix(strings.TrimSpace(schoolName), "고등학교")
	normSchool = strings.TrimSuffix(normSchool, "고")

	_, err = db.Exec(`
		DELETE FROM highschool_cutoffs 
		WHERE year = ? 
		  AND (school_name = ? OR school_name LIKE ? OR school_name LIKE ?)
		  AND (department = ? OR (department = '' AND ? = '공통') OR (department = '공통' AND ? = ''))
		  AND (track = ? OR track = ? OR track LIKE ?)
	`, year, schoolName, normSchool+"고%", normSchool+"고등학교%", department, department, department, track, track+"전형", track+"%")
	return err
}

// DeleteCutoffs 복수 커트라인 항목 일괄 삭제
func (dm *DBManager) DeleteCutoffs(cutoffs []CutoffInfo) error {
	if len(cutoffs) == 0 {
		return nil
	}
	db, err := dm.OpenDB(dm.GetConfigDBPath())
	if err != nil {
		return err
	}
	defer db.Close()

	tx, err := db.Begin()
	if err != nil {
		return err
	}

	for _, c := range cutoffs {
		normSchool := strings.TrimSuffix(strings.TrimSpace(c.SchoolName), "고등학교")
		normSchool = strings.TrimSuffix(normSchool, "고")

		_, err = tx.Exec(`
			DELETE FROM highschool_cutoffs 
			WHERE year = ? 
			  AND (school_name = ? OR school_name LIKE ? OR school_name LIKE ?)
			  AND (department = ? OR (department = '' AND ? = '공통') OR (department = '공통' AND ? = ''))
			  AND (track = ? OR track = ? OR track LIKE ?)
		`, c.Year, c.SchoolName, normSchool+"고%", normSchool+"고등학교%", c.Department, c.Department, c.Department, c.Track, c.Track+"전형", c.Track+"%")
		if err != nil {
			tx.Rollback()
			return err
		}
	}

	return tx.Commit()
}

// ResetCutoffs 커트라인 초기화 (year > 0 이면 해당 연도만, year == 0 이면 전체 삭제)
func (dm *DBManager) ResetCutoffs(year int) error {
	db, err := dm.OpenDB(dm.GetConfigDBPath())
	if err != nil {
		return err
	}
	defer db.Close()

	if year > 0 {
		_, err = db.Exec("DELETE FROM highschool_cutoffs WHERE year = ?", year)
	} else {
		_, err = db.Exec("DELETE FROM highschool_cutoffs")
	}
	return err
}

// GetCutoffs 커트라인 정보 반환 (정규화된 단일 대표 목록으로 중복 제거)
func (dm *DBManager) GetCutoffs() ([]CutoffInfo, error) {
	db, err := dm.OpenDB(dm.GetConfigDBPath())
	if err != nil {
		return nil, err
	}
	defer db.Close()

	rows, err := db.Query("SELECT year, school_name, department, track, score_type, max_value, min_value, IFNULL(avg_value, 0) FROM highschool_cutoffs")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	type key struct {
		year                int
		school, dept, track string
	}
	uniqueMap := make(map[key]CutoffInfo)
	orderedKeys := make([]key, 0)

	for rows.Next() {
		var c CutoffInfo
		if err := rows.Scan(&c.Year, &c.SchoolName, &c.Department, &c.Track, &c.ScoreType, &c.MaxValue, &c.MinValue, &c.AvgValue); err == nil {
			sNorm := normalizeCutoffSchool(c.SchoolName)
			dNorm := normalizeCutoffDept(c.Department)
			tNorm := normalizeCutoffTrack(c.Track)
			c.SchoolName = sNorm
			c.Department = dNorm
			c.Track = tNorm

			k := key{c.Year, sNorm, dNorm, tNorm}
			if cur, exists := uniqueMap[k]; exists {
				if c.MinValue > 0 && (cur.MinValue == 0 || c.MinValue < cur.MinValue) {
					cur.MinValue = c.MinValue
				}
				if c.MaxValue > cur.MaxValue {
					cur.MaxValue = c.MaxValue
				}
				if cur.AvgValue == 0 && c.AvgValue > 0 {
					cur.AvgValue = c.AvgValue
				}
				uniqueMap[k] = cur
			} else {
				uniqueMap[k] = c
				orderedKeys = append(orderedKeys, k)
			}
		}
	}

	cutoffs := make([]CutoffInfo, 0, len(uniqueMap))
	for _, k := range orderedKeys {
		cutoffs = append(cutoffs, uniqueMap[k])
	}
	return cutoffs, nil
}

// PurgeOldCutoffs 현재 입학 학년도(currentAdmissionYear) 대비 올해를 제외한 작년(직전년도)부터 보관 연한(5개년)을 보존하고 초과분 정리
func (dm *DBManager) PurgeOldCutoffs(currentAdmissionYear, keepYears int) (int64, error) {
	if keepYears <= 0 {
		keepYears = 5
	}
	lastYear := currentAdmissionYear - 1
	cutoffYear := lastYear - (keepYears - 1)
	db, err := dm.OpenDB(dm.GetConfigDBPath())
	if err != nil {
		return 0, err
	}
	defer db.Close()

	res, err := db.Exec("DELETE FROM highschool_cutoffs WHERE year < ?", cutoffYear)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

// MergeCutoffs 타 학교 커트라인을 우리 학교 커트라인과 스마트 병합 (정규화 및 중복 완전 해소)
func (dm *DBManager) MergeCutoffs(incoming []CutoffInfo) (int, error) {
	if len(incoming) == 0 {
		return 0, nil
	}
	type key struct {
		year                int
		school, dept, track string
	}
	normalizedIncoming := make(map[key]CutoffInfo)
	for _, inc := range incoming {
		if strings.TrimSpace(inc.SchoolName) == "" {
			continue
		}
		sNorm := normalizeCutoffSchool(inc.SchoolName)
		dNorm := normalizeCutoffDept(inc.Department)
		tNorm := normalizeCutoffTrack(inc.Track)
		inc.SchoolName = sNorm
		inc.Department = dNorm
		inc.Track = tNorm
		k := key{inc.Year, sNorm, dNorm, tNorm}
		if cur, ok := normalizedIncoming[k]; ok {
			if inc.MinValue > 0 && (cur.MinValue == 0 || inc.MinValue < cur.MinValue) {
				cur.MinValue = inc.MinValue
			}
			if inc.MaxValue > cur.MaxValue {
				cur.MaxValue = inc.MaxValue
			}
			if cur.AvgValue == 0 && inc.AvgValue > 0 {
				cur.AvgValue = inc.AvgValue
			}
			normalizedIncoming[k] = cur
		} else {
			normalizedIncoming[k] = inc
		}
	}

	existing, err := dm.GetCutoffs()
	if err != nil {
		return 0, err
	}
	existMap := make(map[key]CutoffInfo)
	for _, e := range existing {
		sNorm := normalizeCutoffSchool(e.SchoolName)
		dNorm := normalizeCutoffDept(e.Department)
		tNorm := normalizeCutoffTrack(e.Track)
		k := key{e.Year, sNorm, dNorm, tNorm}
		existMap[k] = e
	}

	mergedList := make([]CutoffInfo, 0, len(normalizedIncoming))
	for k, inc := range normalizedIncoming {
		if cur, ok := existMap[k]; ok {
			updated := cur
			changed := false
			if inc.MinValue > 0 && (cur.MinValue == 0 || inc.MinValue < cur.MinValue) {
				updated.MinValue = inc.MinValue
				changed = true
			}
			if inc.MaxValue > cur.MaxValue {
				updated.MaxValue = inc.MaxValue
				changed = true
			}
			if updated.AvgValue == 0 && inc.AvgValue > 0 {
				updated.AvgValue = inc.AvgValue
				changed = true
			}
			if changed {
				mergedList = append(mergedList, updated)
			}
		} else {
			mergedList = append(mergedList, inc)
		}
	}

	if len(mergedList) > 0 {
		if err := dm.SaveCutoffs(mergedList); err != nil {
			return 0, err
		}
	}
	return len(normalizedIncoming), nil
}

// ApplyApplicationCutoffs writes only result-derived, school-internal cutoff
// values. It never sends student records outside this encrypted data folder.
func (dm *DBManager) ApplyApplicationCutoffs() (int, error) {
	return dm.applyApplicationCutoffs(0)
}

// ApplyApplicationCutoffsForYear is used by admission closure to ensure an
// older finalized year never overwrites cutoff rows from another year.
func (dm *DBManager) ApplyApplicationCutoffsForYear(admissionYear int) (int, error) {
	return dm.applyApplicationCutoffs(admissionYear)
}

func (dm *DBManager) applyApplicationCutoffs(admissionYear int) (int, error) {
	summaries, err := dm.GetApplicationSummaries()
	if err != nil {
		return 0, err
	}
	cutoffs := make([]CutoffInfo, 0)
	for _, summary := range summaries {
		if admissionYear > 0 && summary.AdmissionYear != admissionYear {
			continue
		}
		if summary.AcceptedCount == 0 || summary.SchoolName == "" || summary.Category == "other" || summary.Category == "general" {
			continue
		}
		cutoffs = append(cutoffs, CutoffInfo{
			Year:       summary.AdmissionYear,
			SchoolName: summary.SchoolName,
			Department: summary.Department,
			Track:      summary.Track,
			ScoreType:  "total_score",
			MaxValue:   summary.MaxAcceptedScore,
			MinValue:   summary.MinAcceptedScore,
			AvgValue:   summary.AvgAcceptedScore,
		})
	}
	if len(cutoffs) == 0 {
		return 0, nil
	}
	if err := dm.SaveCutoffs(cutoffs); err != nil {
		return 0, err
	}
	return len(cutoffs), nil
}
