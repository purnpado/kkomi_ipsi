package main

import (
	"fmt"

	"PHGC/internal/calc"
	"PHGC/internal/database"
)

// SaveStudentExtra 학생의 수기 가산점 및 추가 봉사시간 저장
func (a *App) SaveStudentExtra(classNum int, studentNum, name, extraJSON string) error {
	// 진로부장은 조회 전용, 담임은 본인 학급만 수정할 수 있다.
	if a.user == nil {
		return fmt.Errorf("로그인이 필요합니다")
	}
	if a.user.Role == "viewer" {
		return fmt.Errorf("조회 전용 계정은 가산점·출결을 수정할 수 없습니다")
	}
	if a.user.Role == "homeroom" && a.user.ClassNum != classNum {
		return fmt.Errorf("담당 학급(%d반) 학생만 수정할 수 있습니다", a.user.ClassNum)
	}
	if err := a.db.UpdateStudentExtra(classNum, studentNum, name, extraJSON); err != nil {
		return err
	}
	return a.db.RefreshStudentSchoolScoreCache(classNum, studentNum, name)
}

// --- 학생 1:1 진학 상담 일지 API (작성자 본인 격리 및 보안 보장) ---

// GetStudentCounselingRecords 특정 학생의 상담 일지 목록 반환 (오직 로그인한 교사 본인이 작성한 기록만 열람 가능)
func (a *App) GetStudentCounselingRecords(classNum int, studentNum, studentName string) ([]database.StudentCounselingRecord, error) {
	if a.user == nil {
		return nil, fmt.Errorf("로그인이 필요합니다")
	}
	// 담임교사는 자기 반 학생만 조회 가능
	if a.user.Role == "homeroom" && a.user.ClassNum != classNum {
		return nil, fmt.Errorf("담당 학급(%d반) 학생의 상담 일지만 조회할 수 있습니다", a.user.ClassNum)
	}
	return a.db.GetStudentCounselingRecords(classNum, studentNum, studentName, a.user.Username)
}

// GetClassCounselingSummary 학급 내 학생별 최근 상담 일자 맵 반환 (로그인한 교사 본인 상담 기준)
func (a *App) GetClassCounselingSummary(classNum int) (map[string]string, error) {
	if a.user == nil {
		return map[string]string{}, nil
	}
	if a.user.Role == "homeroom" && a.user.ClassNum != classNum {
		return map[string]string{}, nil
	}
	return a.db.GetClassCounselingSummary(classNum, a.user.Username)
}

// SaveStudentCounselingRecord 상담 기록 저장/수정 (본인 아이디로만 등록되며, 다른 사람은 열람/수정 불가)
func (a *App) SaveStudentCounselingRecord(record database.StudentCounselingRecord) error {
	if a.user == nil {
		return fmt.Errorf("로그인이 필요합니다")
	}
	// 담임교사는 자기 반 학생만 작성 가능
	if a.user.Role == "homeroom" && a.user.ClassNum != record.ClassNum {
		return fmt.Errorf("담당 학급(%d반) 학생의 상담 일지만 작성할 수 있습니다", a.user.ClassNum)
	}

	// 작성자 정보 강제 주입 (보안 격리)
	record.AuthorUsername = a.user.Username
	if a.user.Role == "master" {
		record.AuthorName = "학년부장"
	} else if a.user.Role == "viewer" {
		record.AuthorName = "진로부장"
	} else if a.user.Role == "homeroom" {
		record.AuthorName = fmt.Sprintf("%d반 담임", a.user.ClassNum)
	} else {
		record.AuthorName = a.user.Username
	}

	return a.db.SaveStudentCounselingRecord(record)
}

// DeleteStudentCounselingRecord 상담 기록 삭제 (본인 글만 삭제 가능)
func (a *App) DeleteStudentCounselingRecord(classNum int, id int64) error {
	if a.user == nil {
		return fmt.Errorf("로그인이 필요합니다")
	}
	if a.user.Role == "homeroom" && a.user.ClassNum != classNum {
		return fmt.Errorf("담당 학급(%d반) 학생의 상담 일지만 삭제할 수 있습니다", a.user.ClassNum)
	}
	return a.db.DeleteStudentCounselingRecord(classNum, id, a.user.Username)
}

// isMaster 현재 로그인 계정이 학년부장인지 여부
func (a *App) isMaster() bool {
	return a.user != nil && a.user.Role == "master"
}

// UpdateSchoolRankSnapshots 전교생 기준 석차 및 백분율을 일괄 산출하여 스냅샷으로 보관
func (a *App) UpdateSchoolRankSnapshots() error {
	return a.db.UpdateSchoolRankSnapshots()
}

// GetClassGrades 특정 반의 내신 성적 가산출 결과 반환
func (a *App) GetClassGrades(classNum int) ([]calc.StudentCalcResult, error) {
	return a.db.GetClassGrades(classNum, a.isMaster())
}

// GetStudentFullDetail 학생 1명의 10개 고교별 산출 결과 및 상세 내역 반환
func (a *App) GetStudentFullDetail(classNum int, studentNum, name string) (*calc.StudentFullData, error) {
	return a.db.GetStudentFullDetail(classNum, studentNum, name, a.isMaster())
}

// GetStudentApplicationScoreSnapshot 선택한 학교·전형의 점수만 산출
func (a *App) GetStudentApplicationScoreSnapshot(classNum int, studentNum, name, category, schoolName, track string) (*database.ApplicationScoreSnapshot, error) {
	return a.db.GetStudentApplicationScoreSnapshot(classNum, studentNum, name, category, schoolName, track, a.isMaster())
}

// GetStudentTranscript 학생 1명의 전과목 전학년 성적과 출결/봉사 원시 데이터 일체 반환
func (a *App) GetStudentTranscript(classNum int, studentNum, name string) (*database.StudentTranscriptData, error) {
	return a.db.GetStudentTranscript(classNum, studentNum, name)
}

// GetClassFullGrades 특정 반 전체 학생의 고교별 산출 결과 목록 반환 (신호등 매트릭스용)
func (a *App) GetClassFullGrades(classNum int) ([]calc.StudentFullData, error) {
	return a.db.GetClassFullGrades(classNum, a.isMaster())
}
