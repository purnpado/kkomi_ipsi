package main

import (
	"fmt"

	"PHGC/internal/database"
)

// 원서 관리 화면 일괄 처리. 학년부장은 전교생(classNum 0) 또는 한 반, 담임은 본인 반만, 진로부장은 할 수 없다.
// apply=false 면 바뀔 건수만 돌려준다(확인 창의 미리보기).

func (a *App) bulkClasses(classNum int) ([]int, error) {
	if err := a.requireLogin(); err != nil {
		return nil, err
	}
	switch a.user.Role {
	case "master":
		if classNum > 0 {
			return []int{classNum}, nil
		}
		config, err := a.db.GetSchoolConfig()
		if err != nil || config == nil {
			return nil, fmt.Errorf("학교 설정을 읽지 못했습니다")
		}
		classes := make([]int, 0, config.ClassCount)
		for i := 1; i <= config.ClassCount; i++ {
			classes = append(classes, i)
		}
		return classes, nil
	case "homeroom":
		if classNum != 0 && classNum != a.user.ClassNum {
			return nil, fmt.Errorf("담당 학급(%d반) 원서만 처리할 수 있습니다", a.user.ClassNum)
		}
		return []int{a.user.ClassNum}, nil
	default:
		return nil, fmt.Errorf("조회 전용 계정은 원서를 바꿀 수 없습니다")
	}
}

// BulkCreateGeneralApplications 원서가 없는 학생에게 후기 일반고 지원예정 원서를 만든다.
func (a *App) BulkCreateGeneralApplications(year, classNum int, apply bool) (*database.BulkSummary, error) {
	classes, err := a.bulkClasses(classNum)
	if err != nil {
		return nil, err
	}
	return a.db.BulkCreateGeneral(year, classes, apply)
}

// BulkSetSchoolResults 한 학교·전형 지원자 결과. accepted: "반|번호|이름" → 배정 학과(없으면 "").
func (a *App) BulkSetSchoolResults(year, classNum int, category, schoolName, track, mode string, accepted map[string]string, apply bool) (*database.BulkSummary, error) {
	classes, err := a.bulkClasses(classNum)
	if err != nil {
		return nil, err
	}
	if accepted == nil {
		accepted = map[string]string{}
	}
	return a.db.BulkSetSchoolResults(year, classes, category, schoolName, track, mode, accepted, apply)
}

// BulkSetGeneralResults 일반고 결과: rejected 학생("반|번호|이름")은 불합격, 결과 없는 나머지는 합격.
func (a *App) BulkSetGeneralResults(year, classNum int, rejected []string, apply bool) (*database.BulkSummary, error) {
	classes, err := a.bulkClasses(classNum)
	if err != nil {
		return nil, err
	}
	set := map[string]bool{}
	for _, key := range rejected {
		set[key] = true
	}
	return a.db.BulkSetGeneralResults(year, classes, set, apply)
}

// HasUndoableBulk 되돌릴 수 있는 최근 일괄 처리가 있는지
func (a *App) HasUndoableBulk(classNum int) (bool, error) {
	classes, err := a.bulkClasses(classNum)
	if err != nil {
		return false, err
	}
	id, err := a.db.LastBulkBatch(classes)
	return id != "", err
}

// UndoLastBulkApplications 가장 최근 일괄 처리를 되돌린다.
func (a *App) UndoLastBulkApplications(year, classNum int) (int, error) {
	classes, err := a.bulkClasses(classNum)
	if err != nil {
		return 0, err
	}
	return a.db.UndoLastBulk(classes, year)
}
