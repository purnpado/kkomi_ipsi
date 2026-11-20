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
	if err := a.requireMaster("전교 석차 갱신"); err != nil {
		return err
	}
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

// WhatIfStudent 상담 화면 "가정해 보기": 남은 학기 성적·결석·봉사·리더십·가산점 가정값으로
// 학교별 점수와 후기고 석차를 다시 계산한다. 아무것도 저장하지 않는다(진로부장도 조회 가능).
func (a *App) WhatIfStudent(classNum int, studentNum, name string, input calc.WhatIfInput) (*database.WhatIfResult, error) {
	if a.user == nil {
		return nil, fmt.Errorf("로그인이 필요합니다")
	}
	if a.user.Role == "homeroom" && a.user.ClassNum != classNum {
		return nil, fmt.Errorf("담당 학급(%d반) 학생만 계산할 수 있습니다", a.user.ClassNum)
	}
	return a.db.WhatIfStudent(classNum, studentNum, name, input)
}

// GetSchoolScoreBasis 학교별 산출 상세 창: 산출식이 실제로 쓴 원자료(학기별 성취점수 합·과목수·마감일 기준 출결·봉사)와
// 나이스 원서등록 화면과 같은 배치의 대조표(지금은 특성화고만, 다른 전형은 niceForm 이 비어 있음).
func (a *App) GetSchoolScoreBasis(classNum int, studentNum, name, schoolName, track string) (*calc.SchoolBasisView, error) {
	if a.user == nil {
		return nil, fmt.Errorf("로그인이 필요합니다")
	}
	if a.user.Role == "homeroom" && a.user.ClassNum != classNum {
		return nil, fmt.Errorf("담당 학급(%d반) 학생만 볼 수 있습니다", a.user.ClassNum)
	}
	full, err := a.db.GetStudentFullDetail(classNum, studentNum, name, a.isMaster())
	if err != nil {
		return nil, err
	}
	return calc.SchoolBasisFor(full, schoolName, track), nil
}

// GetStudentNiceRows 상담 화면 "지원 원서" 칸: 학생이 지원하는 학교·전형의 원서마다 나이스 원서 화면 대조표.
func (a *App) GetStudentNiceRows(classNum int, studentNum, name string) ([]database.NiceRosterRow, error) {
	if a.user == nil {
		return nil, fmt.Errorf("로그인이 필요합니다")
	}
	if a.user.Role == "homeroom" && a.user.ClassNum != classNum {
		return nil, fmt.Errorf("담당 학급(%d반) 학생만 볼 수 있습니다", a.user.ClassNum)
	}
	return a.db.GetStudentNiceRows(classNum, studentNum, name, a.isMaster())
}

// GetApplicationNiceRow 원서 입력 창: 고른 특성화고 학교·전형의 나이스 원서 입력값 대조표.
func (a *App) GetApplicationNiceRow(classNum int, studentNum, name, category, schoolName, track string) (database.NiceRosterRow, error) {
	if a.user == nil {
		return database.NiceRosterRow{}, fmt.Errorf("로그인이 필요합니다")
	}
	if a.user.Role == "homeroom" && a.user.ClassNum != classNum {
		return database.NiceRosterRow{}, fmt.Errorf("담당 학급(%d반) 학생만 볼 수 있습니다", a.user.ClassNum)
	}
	return a.db.GetApplicationNiceRow(classNum, studentNum, name, a.isMaster(), category, schoolName, track)
}

// GetNiceUploads 나이스 자료(성적·출결·봉사)를 반마다 마지막으로 올린 때. 담임은 본인 반만, 학년부장·진로부장은 반 또는 0(전교).
func (a *App) GetNiceUploads(classNum int) ([]database.NiceUpload, error) {
	if err := a.requireLogin(); err != nil {
		return nil, err
	}
	if a.user.Role == "homeroom" {
		classNum = a.user.ClassNum
	}
	return a.db.GetNiceUploads(classNum)
}

// GetNiceRoster 나이스 원서 입력 일람표. 담임은 본인 반만, 학년부장·진로부장은 반을 고르거나 0(전교).
func (a *App) GetNiceRoster(classNum int) ([]database.NiceRosterRow, error) {
	if a.user == nil {
		return nil, fmt.Errorf("로그인이 필요합니다")
	}
	if a.user.Role == "homeroom" {
		if classNum != a.user.ClassNum {
			return nil, fmt.Errorf("담당 학급(%d반) 일람표만 볼 수 있습니다", a.user.ClassNum)
		}
	}
	return a.db.GetNiceRoster(classNum, a.isMaster())
}
