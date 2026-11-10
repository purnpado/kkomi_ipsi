package database

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"PHGC/internal/model"
	"PHGC/internal/parser"
)

func (dm *DBManager) SaveApplication(record model.ApplicationRecord) error {
	if record.ClassNum < 1 || record.StudentNum == "" || record.StudentName == "" || record.AdmissionYear < 2000 || record.Category == "" || record.Status == "" {
		return fmt.Errorf("지원 기록 정보가 올바르지 않습니다")
	}
	validCategories := map[string]bool{"meister": true, "special": true, "self_foreign": true, "general": true, "other": true, "none": true}
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
		return fmt.Errorf("%d학년도 입시 결과가 확정되어 지원현황을 수정할 수 없습니다. 학년부장이 확정을 해제한 뒤 수정해주세요", record.AdmissionYear)
	}
	if len(record.Preferences) > 5 {
		return fmt.Errorf("학과 지망은 최대 5개까지 입력할 수 있습니다")
	}
	if (record.Category == "meister" || record.Category == "special" || record.Category == "self_foreign") && record.SchoolName == "" {
		return fmt.Errorf("마이스터고·특성화고·자사고·외고 지원에는 학교명이 필요합니다")
	}
	if record.Category == "none" && record.SchoolName == "" {
		record.SchoolName = "미진학"
	}
	if record.Category == "general" && (len(record.Preferences) != 0 || record.AssignedDepartment != "") {
		return fmt.Errorf("후기 일반고는 학과 지망을 기록하지 않습니다")
	}
	if (record.Category == "self_foreign" || record.Category == "none") && (len(record.Preferences) != 0 || record.AssignedDepartment != "") {
		return fmt.Errorf("자사고·외고 및 미진학은 학과 지망을 기록하지 않습니다")
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
	_, err = db.Exec(`INSERT INTO student_applications (student_num,student_name,admission_year,category,school_name,track,status,score,score_basis,preferences_json,assigned_department,assigned_school,score_details_json,updated_at)
	VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
	ON CONFLICT(student_num,student_name,admission_year,category,school_name,track) DO UPDATE SET 
		status=excluded.status,
		score=excluded.score,
		score_basis=excluded.score_basis,
		preferences_json=excluded.preferences_json,
		assigned_department=excluded.assigned_department,
		assigned_school=excluded.assigned_school,
		score_details_json=CASE WHEN excluded.score_details_json != '' THEN excluded.score_details_json ELSE student_applications.score_details_json END,
		updated_at=CURRENT_TIMESTAMP`,
		record.StudentNum, record.StudentName, record.AdmissionYear, record.Category, record.SchoolName, record.Track, record.Status, record.Score, record.ScoreBasis, string(prefs), record.AssignedDepartment, record.AssignedSchool, scoreDetailsJSON)
	return err
}

// UpdateAssignedSchool 후기 일반고 학생의 최종 배정 고등학교명을 업데이트합니다.
func (dm *DBManager) UpdateAssignedSchool(classNum int, studentNum, studentName, assignedSchool string) error {
	db, err := dm.OpenDB(dm.GetClassDBPath(classNum))
	if err != nil {
		return err
	}
	defer db.Close()
	_, err = db.Exec(`UPDATE student_applications SET assigned_school=?, updated_at=CURRENT_TIMESTAMP 
		WHERE student_num=? AND student_name=? AND category='general'`,
		assignedSchool, studentNum, studentName)
	return err
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
	rows, err := db.Query(`SELECT id,admission_year,category,school_name,track,status,score,score_basis,preferences_json,assigned_department,COALESCE(assigned_school, ''),COALESCE(score_details_json, ''),updated_at FROM student_applications WHERE student_num=? AND student_name=? ORDER BY updated_at DESC`, studentNum, name)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []model.ApplicationRecord
	for rows.Next() {
		var r model.ApplicationRecord
		var prefs, detailsJSON string
		if err := rows.Scan(&r.ID, &r.AdmissionYear, &r.Category, &r.SchoolName, &r.Track, &r.Status, &r.Score, &r.ScoreBasis, &prefs, &r.AssignedDepartment, &r.AssignedSchool, &detailsJSON, &r.UpdatedAt); err != nil {
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
		rows, err := db.Query(`SELECT student_num,student_name,admission_year,category,school_name,track,status,score,score_basis,preferences_json,assigned_department,COALESCE(assigned_school, ''),COALESCE(score_details_json, ''),updated_at FROM student_applications ORDER BY student_num,updated_at`)
		if err != nil {
			db.Close()
			continue
		}
		for rows.Next() {
			var r model.ApplicationRecord
			var prefs, detailsJSON string
			if err := rows.Scan(&r.StudentNum, &r.StudentName, &r.AdmissionYear, &r.Category, &r.SchoolName, &r.Track, &r.Status, &r.Score, &r.ScoreBasis, &prefs, &r.AssignedDepartment, &r.AssignedSchool, &detailsJSON, &r.UpdatedAt); err == nil {
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
	changes := make([]model.PatchChange, 0, len(students))
	for _, student := range students {
		applications, err := dm.GetStudentApplications(classNum, student.StudentNum, student.Name)
		if err != nil {
			return nil, err
		}
		changes = append(changes, model.PatchChange{ClassNum: classNum, StudentNum: student.StudentNum, StudentName: student.Name, Attendance: student.AttendanceData, Volunteer: student.VolunteerData, Extra: student.ExtraData, Applications: applications})
	}
	return changes, nil
}

// ApplyPatchChange applies teacher changes, including class-scoped application
// records.  Every embedded record is bound to the same student and class.
func (dm *DBManager) ApplyPatchChange(change model.PatchChange) error {
	if change.ClassNum < 1 || change.StudentNum == "" || change.StudentName == "" {
		return fmt.Errorf("변경분의 학생 정보가 올바르지 않습니다")
	}
	if change.Attendance != "" {
		if _, err := dm.UpdateStudentAttendance(change.ClassNum, []parser.StudentExcelData{{StudentNum: change.StudentNum, Name: change.StudentName, AttendanceData: change.Attendance}}); err != nil {
			return err
		}
	}
	if change.Volunteer != "" {
		if _, err := dm.UpdateStudentVolunteer(change.ClassNum, []parser.StudentExcelData{{StudentNum: change.StudentNum, Name: change.StudentName, VolunteerData: change.Volunteer}}); err != nil {
			return err
		}
	}
	if change.Extra != "" {
		if err := dm.UpdateStudentExtra(change.ClassNum, change.StudentNum, change.StudentName, change.Extra); err != nil {
			return err
		}
	}
	for _, record := range change.Applications {
		record.ClassNum = change.ClassNum
		if record.StudentNum != "" && record.StudentNum != change.StudentNum {
			return fmt.Errorf("지원 기록의 학생 번호가 변경분과 일치하지 않습니다")
		}
		if record.StudentName != "" && record.StudentName != change.StudentName {
			return fmt.Errorf("지원 기록의 학생 이름이 변경분과 일치하지 않습니다")
		}
		record.StudentNum = change.StudentNum
		record.StudentName = change.StudentName
		if err := dm.SaveApplication(record); err != nil {
			return err
		}
	}
	return nil
}
