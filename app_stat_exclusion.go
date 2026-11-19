package main

import (
	"fmt"
	"strings"

	"PHGC/internal/database"
)

// 입시 통계 제외(특수교육대상자·학생선수 등). 민감한 정보이므로 진로부장에게는 보이지 않게 하고,
// 담임은 본인 학급, 학년부장은 전교생만 다룬다. 사유는 저장하지 않는다.

func (a *App) requireStatExclusionAccess(classNum int, action string) error {
	if err := a.requireLogin(); err != nil {
		return err
	}
	switch a.user.Role {
	case "master":
		return nil
	case "homeroom":
		if a.user.ClassNum == classNum {
			return nil
		}
		return fmt.Errorf("담당 학급(%d반) 학생만 %s 수 있습니다", a.user.ClassNum, action)
	default:
		return fmt.Errorf("입시 통계 제외는 담임과 학년부장만 %s 수 있습니다", action)
	}
}

// GetStudentStatExclusion 학생이 입시 통계 제외인지(상담 화면 관리 칸).
func (a *App) GetStudentStatExclusion(classNum int, studentNum, studentName string) (bool, error) {
	if err := a.requireStatExclusionAccess(classNum, "볼"); err != nil {
		return false, err
	}
	mark, err := a.db.GetStudentStatExclusion(classNum, studentNum, studentName)
	if err != nil || mark == nil {
		return false, err
	}
	return mark.Excluded, nil
}

// SetStudentStatExclusion 입시 통계 제외를 켜거나 끈다. 성적 산출·상담 판정은 바뀌지 않는다.
func (a *App) SetStudentStatExclusion(classNum int, studentNum, studentName string, excluded bool) error {
	if err := a.requireStatExclusionAccess(classNum, "바꿀"); err != nil {
		return err
	}
	return a.db.SetStudentStatExclusion(classNum, studentNum, studentName, excluded)
}

// GetStatExclusionList 학년부장 확인 목록(판정 기준 화면 안쪽).
func (a *App) GetStatExclusionList() ([]database.StatExclusion, error) {
	if err := a.requireMaster("입시 통계 제외 목록 보기"); err != nil {
		return nil, err
	}
	list, err := a.db.ListStatExclusions()
	if list == nil {
		list = []database.StatExclusion{}
	}
	return list, err
}

// GetStatExcludedApplicationCount 그 학년도에 통계에서 뺀 원서 수(입시 분석에는 건수만 보인다).
// 담임·진로부장 PC에는 자기 반 또는 받은 자료만 있으므로 그 범위의 건수다.
func (a *App) GetStatExcludedApplicationCount(admissionYear int) (int, error) {
	if err := a.requireLogin(); err != nil {
		return 0, err
	}
	return a.db.CountStatExcludedApplications(admissionYear)
}

// GetRegisterSeparateStudents 원서대장에서 점수 칸을 "별도전형"으로 적을 학생(통계 제외 표시, "반|번호|이름").
// 원서대장은 공식 문서라 보는 사람마다 내용이 같아야 하므로 진로부장에게도 준다(사용자 결정 2026-11-19).
// 사유는 저장하지 않으므로 어디에도 나오지 않는다. 담임은 본인 반 학생만 받는다.
func (a *App) GetRegisterSeparateStudents() ([]string, error) {
	if err := a.requireLogin(); err != nil {
		return nil, err
	}
	keys := a.db.StatExcludedStudentKeys()
	if a.user.Role != "homeroom" {
		return keys, nil
	}
	prefix := fmt.Sprintf("%d|", a.user.ClassNum)
	out := []string{}
	for _, k := range keys {
		if strings.HasPrefix(k, prefix) {
			out = append(out, k)
		}
	}
	return out, nil
}
