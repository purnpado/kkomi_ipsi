package main

import (
	"fmt"

	"PHGC/internal/database"
	"PHGC/internal/model"
)

func (a *App) SaveStudentApplication(record model.ApplicationRecord) error {
	if a.user != nil {
		if a.user.Role == "viewer" {
			return fmt.Errorf("진로부장 계정은 지원현황을 수정할 수 없습니다")
		}
		if a.user.Role == "homeroom" && a.user.ClassNum != record.ClassNum {
			return fmt.Errorf("담임 계정은 본인 학급의 지원현황만 수정할 수 있습니다")
		}
	}
	return a.db.SaveApplication(record)
}

func (a *App) DeleteStudentApplication(classNum int, studentNum, name, category, schoolName, track string) error {
	if a.user != nil {
		if a.user.Role == "viewer" {
			return fmt.Errorf("진로부장 계정은 지원현황을 삭제할 수 없습니다")
		}
		if a.user.Role == "homeroom" && a.user.ClassNum != classNum {
			return fmt.Errorf("담임 계정은 본인 학급의 지원현황만 삭제할 수 있습니다")
		}
	}
	return a.db.DeleteApplication(classNum, studentNum, name, category, schoolName, track)
}

func (a *App) GetStudentApplications(classNum int, studentNum, name string) ([]model.ApplicationRecord, error) {
	return a.db.GetStudentApplications(classNum, studentNum, name)
}

// GetApplicationSummaries returns school-internal aggregate counts only.
func (a *App) GetApplicationSummaries() ([]database.ApplicationSummary, error) {
	if a.user != nil && a.user.Role != "master" && a.user.Role != "viewer" {
		return nil, fmt.Errorf("우리 학교 지원현황은 학년부장·진로부장만 조회할 수 있습니다")
	}
	return a.db.GetApplicationSummaries()
}

// GetClassApplicationSummaries is used by a homeroom teacher's own-class
// dashboard. A homeroom account is never allowed to select another class.
func (a *App) GetClassApplicationSummaries(classNum int) ([]database.ApplicationSummary, error) {
	if a.user != nil && a.user.Role == "homeroom" && a.user.ClassNum != classNum {
		return nil, fmt.Errorf("담임 계정은 본인 학급 지원현황만 조회할 수 있습니다")
	}
	return a.db.GetClassApplicationSummaries(classNum)
}

func (a *App) GetSchoolApplicationRecords() ([]model.ApplicationRecord, error) {
	if a.user == nil {
		return nil, fmt.Errorf("로그인이 필요합니다")
	}
	all, err := a.db.GetSchoolApplicationRecords()
	if err != nil {
		return nil, err
	}
	// 담임교사인 경우 본인 학급 학생 명단만 반환하여 개인정보 보호
	if a.user.Role == "homeroom" {
		var classRecords []model.ApplicationRecord
		for _, r := range all {
			if r.ClassNum == a.user.ClassNum {
				classRecords = append(classRecords, r)
			}
		}
		return classRecords, nil
	}
	return all, nil
}

// UpdateAssignedSchool 일반고 학생의 최종 배정 고등학교명을 저장합니다.
func (a *App) UpdateAssignedSchool(classNum int, studentNum, studentName, assignedSchool string) error {
	if a.user == nil {
		return fmt.Errorf("로그인이 필요합니다")
	}
	if a.user.Role == "homeroom" && a.user.ClassNum != classNum {
		return fmt.Errorf("본인 담당 학급의 학생만 수정할 수 있습니다")
	}
	return a.db.UpdateAssignedSchool(classNum, studentNum, studentName, assignedSchool)
}

// GetAdmissionClosureReview returns only school-level counts for the selected
// year; it never exposes individual student records in the summary screen.
func (a *App) GetAdmissionClosureReview(admissionYear int) (database.AdmissionClosureReview, error) {
	if a.user != nil && a.user.Role != "master" && a.user.Role != "viewer" {
		return database.AdmissionClosureReview{}, fmt.Errorf("입시 확정 현황은 학년부장·진로부장만 조회할 수 있습니다")
	}
	return a.db.GetAdmissionClosureReview(admissionYear)
}

func (a *App) GetAdmissionClosure(admissionYear int) (*database.AdmissionClosure, error) {
	if a.user != nil && a.user.Role != "master" && a.user.Role != "viewer" {
		return nil, fmt.Errorf("입시 확정 현황은 학년부장·진로부장만 조회할 수 있습니다")
	}
	return a.db.GetAdmissionClosure(admissionYear)
}

// CloseAdmissionYear locks a completed admission year. The final local
// acceptance statistics are reflected to the cutoff table at the same time.
func (a *App) CloseAdmissionYear(admissionYear int, note string) (*database.AdmissionClosure, error) {
	if a.user == nil || a.user.Role != "master" {
		return nil, fmt.Errorf("입시 결과 확정은 학년부장 계정만 할 수 있습니다")
	}
	closure, err := a.db.CloseAdmissionYear(admissionYear, a.user.Username, note)
	if err != nil {
		return nil, err
	}
	return &closure, nil
}

func (a *App) ReopenAdmissionYear(admissionYear int) error {
	if a.user == nil || a.user.Role != "master" {
		return fmt.Errorf("입시 결과 확정 해제는 학년부장 계정만 할 수 있습니다")
	}
	return a.db.ReopenAdmissionYear(admissionYear)
}

// ApplyApplicationCutoffs reflects completed school-internal admission results
// into the local cutoff table. Only the grade-head can perform this operation.
func (a *App) ApplyApplicationCutoffs() (int, error) {
	if a.user != nil && a.user.Role != "master" {
		return 0, fmt.Errorf("합격 결과 커트라인 반영은 학년부장 계정만 할 수 있습니다")
	}
	return a.db.ApplyApplicationCutoffs()
}
