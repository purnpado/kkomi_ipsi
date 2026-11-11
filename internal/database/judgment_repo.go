package database

import (
	"encoding/json"
	"fmt"
	"strings"
)

// 4단계 판정(안정·적정·소신·도전) 여유폭 설정은 학교 설정 DB(config)에 JSON으로 둔다.
// 학년부장이 정하고, 배포자료에 config가 함께 실려 담임 PC도 같은 기준으로 판정한다.

// GetJudgmentSettings 저장된 판정 설정 JSON을 돌려준다(없으면 빈 문자열 → 화면 기본값 사용).
func (dm *DBManager) GetJudgmentSettings() (string, error) {
	db, err := dm.OpenDB(dm.GetConfigDBPath())
	if err != nil {
		return "", err
	}
	defer db.Close()
	var raw string
	if err := db.QueryRow(`SELECT COALESCE(judgment_settings, '') FROM school_config WHERE id = 1`).Scan(&raw); err != nil {
		return "", nil
	}
	return raw, nil
}

// SaveJudgmentSettings 판정 설정 JSON을 검증해 저장한다.
func (dm *DBManager) SaveJudgmentSettings(raw string) error {
	raw = strings.TrimSpace(raw)
	var parsed map[string]interface{}
	if raw != "" && json.Unmarshal([]byte(raw), &parsed) != nil {
		return fmt.Errorf("판정 설정 형식이 올바르지 않습니다")
	}
	db, err := dm.OpenDB(dm.GetConfigDBPath())
	if err != nil {
		return err
	}
	defer db.Close()
	result, err := db.Exec(`UPDATE school_config SET judgment_settings = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1`, raw)
	if err != nil {
		return fmt.Errorf("판정 설정 저장 실패: %w", err)
	}
	if n, _ := result.RowsAffected(); n == 0 {
		return fmt.Errorf("학교 초기 설정을 먼저 완료해주세요")
	}
	return nil
}

// GeneralQuotaRecord 후기 일반고 학년도별 선발 정원·지원자 수(교육청 발표값을 운영자가 직접 입력).
// 관내 공유 자료의 총점 분포에서 "정원 ÷ 지원자" 위치로 합격선을 추정할 때 쓴다.
type GeneralQuotaRecord struct {
	AdmissionYear int    `json:"admissionYear"`
	Quota         int    `json:"quota"`
	Applicants    int    `json:"applicants"`
	Note          string `json:"note"`
}

func (dm *DBManager) GetGeneralQuotaRecords() ([]GeneralQuotaRecord, error) {
	db, err := dm.OpenDB(dm.GetConfigDBPath())
	if err != nil {
		return nil, err
	}
	defer db.Close()
	rows, err := db.Query(`SELECT admission_year, quota, applicants, note FROM general_quota_records ORDER BY admission_year DESC`)
	if err != nil {
		return []GeneralQuotaRecord{}, nil
	}
	defer rows.Close()
	out := []GeneralQuotaRecord{}
	for rows.Next() {
		var r GeneralQuotaRecord
		if rows.Scan(&r.AdmissionYear, &r.Quota, &r.Applicants, &r.Note) == nil {
			out = append(out, r)
		}
	}
	return out, rows.Err()
}

func (dm *DBManager) SaveGeneralQuotaRecord(r GeneralQuotaRecord) error {
	if r.AdmissionYear < 2000 || r.Quota < 0 || r.Applicants < 0 {
		return fmt.Errorf("학년도·정원·지원자 수가 올바르지 않습니다")
	}
	db, err := dm.OpenDB(dm.GetConfigDBPath())
	if err != nil {
		return err
	}
	defer db.Close()
	if r.Quota == 0 && r.Applicants == 0 {
		_, err = db.Exec(`DELETE FROM general_quota_records WHERE admission_year = ?`, r.AdmissionYear)
		return err
	}
	_, err = db.Exec(`INSERT INTO general_quota_records (admission_year, quota, applicants, note, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(admission_year) DO UPDATE SET quota=excluded.quota, applicants=excluded.applicants, note=excluded.note, updated_at=CURRENT_TIMESTAMP`,
		r.AdmissionYear, r.Quota, r.Applicants, strings.TrimSpace(r.Note))
	return err
}
