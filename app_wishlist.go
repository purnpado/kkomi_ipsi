package main

import "fmt"

// GetStudentWishlist 상담 화면 관심학교 목록(JSON 배열 문자열). 담임은 본인 학급만 본다.
func (a *App) GetStudentWishlist(classNum int, studentNum, studentName string) (string, error) {
	if err := a.requireLogin(); err != nil {
		return "[]", err
	}
	if a.user.Role == "homeroom" && a.user.ClassNum != classNum {
		return "[]", fmt.Errorf("담당 학급(%d반) 학생만 볼 수 있습니다", a.user.ClassNum)
	}
	return a.db.GetStudentWishlist(classNum, studentNum, studentName)
}

// SaveStudentWishlist 관심학교 목록 저장. 진로부장은 조회 전용, 담임은 본인 학급만.
func (a *App) SaveStudentWishlist(classNum int, studentNum, studentName, itemsJSON string) error {
	if err := a.requireLogin(); err != nil {
		return err
	}
	if a.user.Role == "viewer" {
		return fmt.Errorf("조회 전용 계정은 관심학교를 바꿀 수 없습니다")
	}
	if a.user.Role == "homeroom" && a.user.ClassNum != classNum {
		return fmt.Errorf("담당 학급(%d반) 학생만 바꿀 수 있습니다", a.user.ClassNum)
	}
	return a.db.SaveStudentWishlist(classNum, studentNum, studentName, itemsJSON)
}
