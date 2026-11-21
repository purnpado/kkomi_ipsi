package database

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"PHGC/internal/calc"
	"PHGC/internal/model"
)

func (dm *DBManager) SaveApplication(record model.ApplicationRecord) error {
	return dm.saveApplicationMode(record, saveNormal)
}

// saveMode 원서 저장 방식.
type saveMode int

const (
	// saveNormal 화면에서 저장: 지금 시각을 적고, ID가 있으면 그 원서를 제자리에서 고친다.
	saveNormal saveMode = iota
	// saveMergeNewer 원본 시각을 지키고, 같은 이름표 원서보다 엄격히 더 최근일 때만 덮는다.
	saveMergeNewer
	// saveForce 원본 시각을 지키고 덮는다(취합 병합에서 학년부장이 고른 처리).
	saveForce
)

func (dm *DBManager) saveApplicationMode(record model.ApplicationRecord, mode saveMode) error {
	merge := mode != saveNormal
	if record.ClassNum < 1 || record.StudentNum == "" || record.StudentName == "" || record.AdmissionYear < 2000 || record.Category == "" || record.Status == "" {
		return fmt.Errorf("지원 기록 정보가 올바르지 않습니다")
	}
	validCategories := map[string]bool{"meister": true, "special": true, "self_foreign": true, "general": true, "other": true, "out_province": true, "none": true}
	validStatuses := map[string]bool{
		"미입력":  true,
		"지원희망": true, "지원 희망": true,
		"지원예정": true, "지원 예정": true,
		"지원완료": true, "지원 완료": true,
		"합격": true, "불합격": true,
		"포기": true, "최종 진학": true,
		"미진학": true,
	}
	if !validCategories[record.Category] || !validStatuses[record.Status] {
		return fmt.Errorf("지원 구분 또는 상태값이 올바르지 않습니다")
	}
	closed, err := dm.IsAdmissionYearClosed(record.AdmissionYear)
	if err != nil {
		return err
	}
	if closed {
		return fmt.Errorf("%d 고입 결과가 확정되어 지원현황을 수정할 수 없습니다. 학년부장이 확정을 해제한 뒤 수정해주세요", record.AdmissionYear)
	}
	if record.Category != "meister" && record.Category != "special" {
		record.ExtraRound = false // 추가모집은 전기 마이스터고·특성화고만
	}
	if err := normalizeFirstStageResult(&record); err != nil {
		return err
	}
	if len(record.Preferences) > 5 {
		return fmt.Errorf("학과 지망은 최대 5개까지 입력할 수 있습니다")
	}
	if (record.Category == "meister" || record.Category == "special" || record.Category == "self_foreign") && record.SchoolName == "" {
		return fmt.Errorf("마이스터고·특성화고·자사고·외고 지원에는 학교명이 필요합니다")
	}
	if record.Category == "out_province" && strings.TrimSpace(record.SchoolName) == "" {
		return fmt.Errorf("타시도 고교 지원에는 학교명이 필요합니다")
	}
	if record.Category == "none" && record.SchoolName == "" {
		record.SchoolName = "미진학"
	}
	if record.Category == "general" && (len(record.Preferences) != 0 || record.AssignedDepartment != "") {
		return fmt.Errorf("후기 일반고는 학과 지망을 기록하지 않습니다")
	}
	// 기타 울산 고교(옛 자사고·외고 포함)는 지원 학과(과정)·합격 학과를 적을 수 있다(원서대장 학과 칸, 2026-11-21).
	if record.Category == "none" && (len(record.Preferences) != 0 || record.AssignedDepartment != "") {
		return fmt.Errorf("미진학은 학과 지망을 기록하지 않습니다")
	}
	prefs, err := json.Marshal(record.Preferences)
	if err != nil {
		return err
	}
	var scoreDetailsJSON string
	if record.ScoreDetails != nil {
		stampApplicationScoreDetails(record.ScoreDetails, "application-save")
		if bytes, err := json.Marshal(record.ScoreDetails); err == nil {
			scoreDetailsJSON = string(bytes)
		}
	} else {
		// 지원 당시 학생의 성적/출결/봉사 세부 점수 스냅샷 자동 생성
		if details, err := dm.GenerateApplicationScoreDetails(record.ClassNum, record.StudentNum, record.StudentName, record.Category, record.SchoolName, record.Track); err == nil && details != nil {
			stampApplicationScoreDetails(details, "application-save")
			record.ScoreDetails = details
			if bytes, err := json.Marshal(details); err == nil {
				scoreDetailsJSON = string(bytes)
			}
		}
	}

	db, err := dm.OpenDB(dm.GetClassDBPath(record.ClassNum))
	if err != nil {
		return err
	}
	defer db.Close()
	if !merge {
		// 이중지원 금지(지원 시기): 전기 2개교, 울산·타 시도 같은 시기 동시 지원(application_rounds.go)
		if err := checkRoundRules(db, record); err != nil {
			return err
		}
	}
	if !merge && record.ID > 0 {
		// 이미 있는 원서를 열어 학년도·구분·학교·전형을 바꾸면 새 원서를 더하지 않고 그 원서를 고친다.
		// (옛 이름표는 트리거가 지운 원서 기록으로 남겨 취합 병합 때 "바꾼 원서"로 알아본다.)
		handled, err := updateApplicationInPlace(dm, db, record, string(prefs), scoreDetailsJSON)
		if handled || err != nil {
			return err
		}
	}
	if !merge {
		// 이중지원 금지: 합격·최종 진학·등록 포기 원서가 있는 학생은 그해 새 원서를 넣을 수 없다(취합 병합은 학년부장이 고른다).
		if err := checkNewApplicationAllowed(db, record); err != nil {
			return err
		}
	}
	timestamp := record.UpdatedAt
	if !merge || timestamp == "" {
		timestamp = ""
	}
	condition := ""
	if mode == saveMergeNewer {
		condition = " WHERE julianday(?) IS NOT NULL AND julianday(student_applications.updated_at) IS NOT NULL AND julianday(?) > julianday(student_applications.updated_at)"
	}
	query := `INSERT INTO student_applications (student_num,student_name,admission_year,category,school_name,track,status,score,score_basis,preferences_json,assigned_department,assigned_school,score_details_json,first_stage_result,extra_round,updated_at)
	VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,COALESCE(NULLIF(?, ''),CURRENT_TIMESTAMP))
	ON CONFLICT(student_num,student_name,admission_year,category,school_name,track) DO UPDATE SET 
		status=excluded.status,
		score=excluded.score,
		score_basis=excluded.score_basis,
		preferences_json=excluded.preferences_json,
		assigned_department=excluded.assigned_department,
		assigned_school=excluded.assigned_school,
		first_stage_result=excluded.first_stage_result,
		extra_round=excluded.extra_round,
		score_details_json=CASE WHEN excluded.score_details_json != '' THEN excluded.score_details_json ELSE student_applications.score_details_json END,
		updated_at=excluded.updated_at` + condition
	args := []any{record.StudentNum, record.StudentName, record.AdmissionYear, record.Category, record.SchoolName, record.Track, record.Status, record.Score, record.ScoreBasis, string(prefs), record.AssignedDepartment, record.AssignedSchool, scoreDetailsJSON, record.FirstStageResult, record.ExtraRound, timestamp}
	if mode == saveMergeNewer {
		args = append(args, record.UpdatedAt, record.UpdatedAt)
	}
	_, err = db.Exec(query, args...)
	return err
}

// UpdateAssignedSchool 후기 일반고 학생의 최종 배정 고등학교명을 업데이트합니다.
func (dm *DBManager) UpdateAssignedSchool(classNum int, studentNum, studentName, assignedSchool string) error {
	config, err := dm.GetSchoolConfig()
	if err != nil {
		return err
	}
	records, err := dm.GetStudentApplications(classNum, studentNum, studentName)
	if err != nil {
		return err
	}
	id := 0
	for _, record := range records {
		if record.AdmissionYear == config.AdmissionYear && record.Category == "general" {
			if id != 0 {
				return fmt.Errorf("해당 학년도의 일반고 원서를 하나로 확인할 수 없습니다")
			}
			id = record.ID
		}
	}
	if id == 0 {
		return fmt.Errorf("수정할 일반고 원서를 찾을 수 없습니다")
	}
	return dm.UpdateAssignedSchoolForRecord(classNum, studentNum, studentName, config.AdmissionYear, id, assignedSchool)
}

func (dm *DBManager) UpdateAssignedSchoolForRecord(classNum int, studentNum, studentName string, year, id int, assignedSchool string) error {
	closed, err := dm.IsAdmissionYearClosed(year)
	if err != nil {
		return err
	}
	if closed {
		return fmt.Errorf("%d 고입 결과가 확정되어 배정학교를 수정할 수 없습니다", year)
	}
	db, err := dm.OpenDB(dm.GetClassDBPath(classNum))
	if err != nil {
		return err
	}
	defer db.Close()
	result, err := db.Exec(`UPDATE student_applications SET assigned_school=?, updated_at=CURRENT_TIMESTAMP
		WHERE student_num=? AND student_name=? AND category='general' AND admission_year=? AND id=?`,
		assignedSchool, studentNum, studentName, year, id)
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count != 1 {
		return fmt.Errorf("수정할 해당 학년도의 일반고 원서를 하나로 확인할 수 없습니다")
	}
	return nil
}

func (dm *DBManager) DeleteApplication(classNum int, studentNum, studentName, category, schoolName, track string) error {
	db, err := dm.OpenDB(dm.GetClassDBPath(classNum))
	if err != nil {
		return err
	}
	defer db.Close()
	_, err = db.Exec(`DELETE FROM student_applications 
		WHERE student_num=? AND student_name=? AND category=? AND school_name=? AND track=?`,
		studentNum, studentName, category, schoolName, track)
	return err
}

func (dm *DBManager) GetStudentApplications(classNum int, studentNum, name string) ([]model.ApplicationRecord, error) {
	db, err := dm.OpenDB(dm.GetClassDBPath(classNum))
	if err != nil {
		return nil, err
	}
	defer db.Close()
	rows, err := db.Query(`SELECT id,admission_year,category,school_name,track,status,score,score_basis,preferences_json,assigned_department,COALESCE(assigned_school, ''),COALESCE(score_details_json, ''),COALESCE(first_stage_result, ''),COALESCE(extra_round, 0),updated_at FROM student_applications WHERE student_num=? AND student_name=? ORDER BY updated_at DESC`, studentNum, name)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []model.ApplicationRecord
	for rows.Next() {
		var r model.ApplicationRecord
		var prefs, detailsJSON string
		if err := rows.Scan(&r.ID, &r.AdmissionYear, &r.Category, &r.SchoolName, &r.Track, &r.Status, &r.Score, &r.ScoreBasis, &prefs, &r.AssignedDepartment, &r.AssignedSchool, &detailsJSON, &r.FirstStageResult, &r.ExtraRound, &r.UpdatedAt); err != nil {
			return nil, err
		}
		r.ClassNum = classNum
		r.StudentNum = studentNum
		r.StudentName = name
		_ = json.Unmarshal([]byte(prefs), &r.Preferences)
		if strings.TrimSpace(detailsJSON) != "" {
			var details model.ApplicationScoreDetails
			if json.Unmarshal([]byte(detailsJSON), &details) == nil {
				r.ScoreDetails = &details
			}
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (dm *DBManager) GetSchoolApplicationRecords() ([]model.ApplicationRecord, error) {
	config, err := dm.GetSchoolConfig()
	if err != nil {
		return nil, err
	}
	var all []model.ApplicationRecord
	for classNum := 1; classNum <= config.ClassCount; classNum++ {
		db, err := dm.OpenDB(dm.GetClassDBPath(classNum))
		if err != nil {
			if os.IsNotExist(err) {
				continue
			}
			return nil, err
		}
		rows, err := db.Query(`SELECT student_num,student_name,admission_year,category,school_name,track,status,score,score_basis,preferences_json,assigned_department,COALESCE(assigned_school, ''),COALESCE(score_details_json, ''),COALESCE(first_stage_result, ''),COALESCE(extra_round, 0),updated_at FROM student_applications ORDER BY student_num,updated_at`)
		if err != nil {
			db.Close()
			continue
		}
		for rows.Next() {
			var r model.ApplicationRecord
			var prefs, detailsJSON string
			if err := rows.Scan(&r.StudentNum, &r.StudentName, &r.AdmissionYear, &r.Category, &r.SchoolName, &r.Track, &r.Status, &r.Score, &r.ScoreBasis, &prefs, &r.AssignedDepartment, &r.AssignedSchool, &detailsJSON, &r.FirstStageResult, &r.ExtraRound, &r.UpdatedAt); err == nil {
				r.ClassNum = classNum
				_ = json.Unmarshal([]byte(prefs), &r.Preferences)
				if strings.TrimSpace(detailsJSON) != "" {
					var details model.ApplicationScoreDetails
					if json.Unmarshal([]byte(detailsJSON), &details) == nil {
						r.ScoreDetails = &details
					}
				}
				all = append(all, r)
			}
		}
		rows.Close()
		db.Close()
	}
	return all, nil
}

// GetClassPatchChanges creates an encrypted-transfer snapshot of the fields a
// homeroom teacher may maintain for their own class. The caller encrypts it
// with the shared package password before it leaves the computer.
func (dm *DBManager) GetClassPatchChanges(classNum int) ([]model.PatchChange, error) {
	students, err := dm.GetClassStudents(classNum)
	if err != nil {
		return nil, err
	}
	// 배포 뒤 지운 원서 기록만 싣는다(배포 사본에 함께 들어온 학년부장 쪽 옛 기록은 뺀다).
	distributedAt, _ := dm.GetClassMeta(classNum, MetaDistributedAt)
	changes := make([]model.PatchChange, 0, len(students))
	for _, student := range students {
		applications, err := dm.GetStudentApplications(classNum, student.StudentNum, student.Name)
		if err != nil {
			return nil, err
		}
		mark, _ := dm.GetStudentStatExclusion(classNum, student.StudentNum, student.Name)
		deleted, err := dm.GetApplicationDeletions(classNum, student.StudentNum, student.Name, distributedAt)
		if err != nil {
			return nil, err
		}
		changes = append(changes, model.PatchChange{ClassNum: classNum, StudentNum: student.StudentNum, StudentName: student.Name, Attendance: student.AttendanceData, Volunteer: student.VolunteerData, Extra: student.ExtraData, Applications: applications, StatExclusion: mark, DeletedApplications: deleted})
	}
	return changes, nil
}

// normalizeFirstStageResult는 1차 전형 결과를 최종 상태와 맞춘다.
// 1차·2차로 나눠 뽑는 전형은 마이스터고·특성화고뿐이며, 최종 합격이면 1차도 합격이다.
// 1차 불합격인데 최종 결과가 불합격이 아니면 모순이므로 저장하지 않는다.
func normalizeFirstStageResult(record *model.ApplicationRecord) error {
	switch record.FirstStageResult {
	case "", "합격", "불합격":
	default:
		return fmt.Errorf("1차 전형 결과 값이 올바르지 않습니다")
	}
	// 요강상 1차·2차로 나누어 뽑는 학교·전형만 단계 결과를 남긴다(학교별 배수는 calc/stages.go).
	if (record.Category != "meister" && record.Category != "special") || !calc.HasSecondStage(record.SchoolName, record.Track) {
		record.FirstStageResult = ""
		return nil
	}
	if (record.Status == "합격" || record.Status == "최종 진학") && record.FirstStageResult == "" {
		record.FirstStageResult = "합격"
	}
	if record.FirstStageResult == "불합격" && record.Status != "불합격" && record.Status != "포기" {
		return fmt.Errorf("1차 전형 불합격 학생은 최종 결과도 불합격으로 기록해주세요")
	}
	return nil
}
