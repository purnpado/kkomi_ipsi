package database

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"

	"PHGC/internal/model"
)

// 지난 입시 결과(익명) 보관.
// 해마다 새 폴더에 프로그램을 새로 설치하고 인수인계 파일로 지난 입시 자료를 이어 받는다.
// 학급 DB(학생 자료)는 해마다 새로 시작하므로, 결과를 확정할 때 그해 원서 기록을 이름·학번 없이
// 학교 설정 DB(config)에 따로 쌓아 우리 학교 학과별 분석·여러 해 추세·관내 공유가 계속 이어지게 한다.

// HistoryRecord 이름·학번이 없는 지난 입시 결과 한 건.
type HistoryRecord struct {
	AdmissionYear      int      `json:"admissionYear"`
	Category           string   `json:"category"`
	SchoolName         string   `json:"schoolName"`
	Track              string   `json:"track"`
	Status             string   `json:"status"`
	FirstStageResult   string   `json:"firstStageResult,omitempty"`
	Score              float64  `json:"score"`
	ScoreBasis         string   `json:"scoreBasis,omitempty"`
	Preferences        []string `json:"preferences,omitempty"`
	AssignedDepartment string   `json:"assignedDepartment,omitempty"`
	AssignedSchool     string   `json:"assignedSchool,omitempty"`
	ScoreDetailsJSON   string   `json:"scoreDetailsJson,omitempty"`
	GeneralDetailJSON  string   `json:"generalDetailJson,omitempty"` // 후기 일반고 항목별 확정 점수(관내 공유용)
	Source             string   `json:"source,omitempty"`            // local(우리 학교 확정) · handover(인수인계로 받음)
}

func (dm *DBManager) initHistoryTable(db *sql.DB) error {
	_, err := db.Exec(`CREATE TABLE IF NOT EXISTS admission_history (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		admission_year INTEGER NOT NULL,
		category TEXT NOT NULL,
		school_name TEXT NOT NULL DEFAULT '',
		track TEXT NOT NULL DEFAULT '',
		status TEXT NOT NULL,
		first_stage_result TEXT NOT NULL DEFAULT '',
		score REAL NOT NULL DEFAULT 0,
		score_basis TEXT NOT NULL DEFAULT '',
		preferences_json TEXT NOT NULL DEFAULT '[]',
		assigned_department TEXT NOT NULL DEFAULT '',
		assigned_school TEXT NOT NULL DEFAULT '',
		score_details_json TEXT NOT NULL DEFAULT '',
		general_detail_json TEXT NOT NULL DEFAULT '',
		source TEXT NOT NULL DEFAULT 'local',
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	)`)
	if err == nil {
		_, _ = db.Exec(`CREATE INDEX IF NOT EXISTS idx_admission_history_year ON admission_history(admission_year)`)
	}
	return err
}

// snapshotAdmissionHistory 결과 확정 때 그해 원서 기록을 익명으로 보관한다(같은 해 우리 학교 기록은 새로 덮어씀).
func (dm *DBManager) snapshotAdmissionHistory(admissionYear int) (int, error) {
	records, err := dm.GetSchoolApplicationRecords()
	if err != nil {
		return 0, err
	}
	general := dm.generalDetailsFor(records, admissionYear)
	var rows []HistoryRecord
	for _, r := range records {
		if r.AdmissionYear != admissionYear {
			continue
		}
		h := historyFromRecord(r)
		if d, ok := general[recordStudentKey(r)]; ok && r.Category == "general" {
			h.GeneralDetailJSON = d
		}
		rows = append(rows, h)
	}
	db, err := dm.OpenDB(dm.GetConfigDBPath())
	if err != nil {
		return 0, err
	}
	defer db.Close()
	if err := dm.initHistoryTable(db); err != nil {
		return 0, err
	}
	if _, err := db.Exec(`DELETE FROM admission_history WHERE admission_year = ? AND source = 'local'`, admissionYear); err != nil {
		return 0, err
	}
	return len(rows), insertHistory(db, rows, "local")
}

// deleteLocalHistory 결과 확정을 해제하면 그해 우리 학교 보관 기록도 지운다(다시 확정할 때 새로 보관).
func (dm *DBManager) deleteLocalHistory(admissionYear int) error {
	db, err := dm.OpenDB(dm.GetConfigDBPath())
	if err != nil {
		return err
	}
	defer db.Close()
	if err := dm.initHistoryTable(db); err != nil {
		return err
	}
	_, err = db.Exec(`DELETE FROM admission_history WHERE admission_year = ? AND source = 'local'`, admissionYear)
	return err
}

func recordStudentKey(r model.ApplicationRecord) string {
	return fmt.Sprintf("%d|%s|%s", r.ClassNum, strings.TrimSpace(r.StudentNum), strings.TrimSpace(r.StudentName))
}

// generalDetailsFor 후기 일반고 기록의 항목별 확정 점수(학급마다 한 번만 계산)
func (dm *DBManager) generalDetailsFor(records []model.ApplicationRecord, admissionYear int) map[string]string {
	out := map[string]string{}
	anon := dm.buildGeneralAnonymousRecordsKeyed(records, admissionYear)
	for key, rec := range anon {
		if rec.GeneralDetail != nil {
			if b, err := json.Marshal(rec.GeneralDetail); err == nil {
				out[key] = string(b)
			}
		}
	}
	return out
}

func historyFromRecord(r model.ApplicationRecord) HistoryRecord {
	h := HistoryRecord{AdmissionYear: r.AdmissionYear, Category: r.Category, SchoolName: r.SchoolName, Track: r.Track,
		Status: r.Status, FirstStageResult: r.FirstStageResult, Score: r.Score, ScoreBasis: r.ScoreBasis,
		Preferences: r.Preferences, AssignedDepartment: r.AssignedDepartment, AssignedSchool: r.AssignedSchool}
	if r.ScoreDetails != nil {
		if b, err := json.Marshal(r.ScoreDetails); err == nil {
			h.ScoreDetailsJSON = string(b)
		}
	}
	return h
}

func insertHistory(db *sql.DB, rows []HistoryRecord, source string) error {
	if len(rows) == 0 {
		return nil
	}
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	stmt, err := tx.Prepare(`INSERT INTO admission_history (admission_year, category, school_name, track, status, first_stage_result, score, score_basis,
		preferences_json, assigned_department, assigned_school, score_details_json, general_detail_json, source) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
	if err != nil {
		_ = tx.Rollback()
		return err
	}
	defer stmt.Close()
	for _, h := range rows {
		prefs, _ := json.Marshal(h.Preferences)
		if h.Preferences == nil {
			prefs = []byte("[]")
		}
		if _, err := stmt.Exec(h.AdmissionYear, h.Category, h.SchoolName, h.Track, h.Status, h.FirstStageResult, h.Score, h.ScoreBasis,
			string(prefs), h.AssignedDepartment, h.AssignedSchool, h.ScoreDetailsJSON, h.GeneralDetailJSON, source); err != nil {
			_ = tx.Rollback()
			return err
		}
	}
	return tx.Commit()
}

// GetAdmissionHistory 보관된 지난 입시 결과(학년도 순).
func (dm *DBManager) GetAdmissionHistory() ([]HistoryRecord, error) {
	db, err := dm.OpenDB(dm.GetConfigDBPath())
	if err != nil {
		return nil, err
	}
	defer db.Close()
	if err := dm.initHistoryTable(db); err != nil {
		return nil, err
	}
	rows, err := db.Query(`SELECT admission_year, category, school_name, track, status, first_stage_result, score, score_basis, preferences_json,
		assigned_department, assigned_school, score_details_json, general_detail_json, source FROM admission_history ORDER BY admission_year, id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []HistoryRecord{}
	for rows.Next() {
		var h HistoryRecord
		var prefs string
		if err := rows.Scan(&h.AdmissionYear, &h.Category, &h.SchoolName, &h.Track, &h.Status, &h.FirstStageResult, &h.Score, &h.ScoreBasis,
			&prefs, &h.AssignedDepartment, &h.AssignedSchool, &h.ScoreDetailsJSON, &h.GeneralDetailJSON, &h.Source); err != nil {
			return nil, err
		}
		_ = json.Unmarshal([]byte(prefs), &h.Preferences)
		out = append(out, h)
	}
	return out, rows.Err()
}

// historyYears 보관 기록이 있는 학년도
func (dm *DBManager) historyYears() map[int]bool {
	out := map[int]bool{}
	list, err := dm.GetAdmissionHistory()
	if err != nil {
		return out
	}
	for _, h := range list {
		out[h.AdmissionYear] = true
	}
	return out
}

// ImportAdmissionHistory 인수인계로 받은 기록을 더한다. 이미 기록이 있는 학년도는 덮어쓰지 않는다.
func (dm *DBManager) ImportAdmissionHistory(rows []HistoryRecord) (int, error) {
	have := dm.historyYears()
	var add []HistoryRecord
	for _, h := range rows {
		if !have[h.AdmissionYear] {
			add = append(add, h)
		}
	}
	db, err := dm.OpenDB(dm.GetConfigDBPath())
	if err != nil {
		return 0, err
	}
	defer db.Close()
	if err := dm.initHistoryTable(db); err != nil {
		return 0, err
	}
	return len(add), insertHistory(db, add, "handover")
}

// historyAsRecords 지금 학급 DB에 없는 학년도의 보관 기록을 원서 기록 형태로 돌려준다(분석 화면용, 이름 없음).
func (dm *DBManager) historyAsRecords(skipYears map[int]bool) []model.ApplicationRecord {
	list, err := dm.GetAdmissionHistory()
	if err != nil {
		return nil
	}
	out := make([]model.ApplicationRecord, 0, len(list))
	for _, h := range list {
		if skipYears[h.AdmissionYear] {
			continue
		}
		out = append(out, historyToRecord(h))
	}
	return out
}

func historyToRecord(h HistoryRecord) model.ApplicationRecord {
	r := model.ApplicationRecord{AdmissionYear: h.AdmissionYear, Category: h.Category, SchoolName: h.SchoolName, Track: h.Track,
		Status: h.Status, FirstStageResult: h.FirstStageResult, Score: h.Score, ScoreBasis: h.ScoreBasis, Preferences: h.Preferences,
		AssignedDepartment: h.AssignedDepartment, AssignedSchool: h.AssignedSchool}
	if strings.TrimSpace(h.ScoreDetailsJSON) != "" {
		var d model.ApplicationScoreDetails
		if json.Unmarshal([]byte(h.ScoreDetailsJSON), &d) == nil {
			r.ScoreDetails = &d
		}
	}
	return r
}

// schoolRecordsWithHistory 학급 DB 원서 기록 + 학급 DB에 없는 학년도의 보관 기록(학교 전체 분석용)
func (dm *DBManager) schoolRecordsWithHistory() ([]model.ApplicationRecord, error) {
	records, err := dm.GetSchoolApplicationRecords()
	if err != nil {
		return nil, err
	}
	present := map[int]bool{}
	for _, r := range records {
		present[r.AdmissionYear] = true
	}
	return append(records, dm.historyAsRecords(present)...), nil
}
