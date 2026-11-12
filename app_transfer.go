package main

import (
	"fmt"

	"PHGC/internal/calc"
)

// TransferStudent 나이스 교과 성적 비고에 "전입"이 적힌 학생(화면의 이름 옆 [전입] 뱃지용)
type TransferStudent struct {
	ClassNum   int    `json:"classNum"`
	StudentNum string `json:"studentNum"`
	Name       string `json:"name"`
	Note       string `json:"note"`
}

// GetTransferStudents 전입생 목록. 담임은 본인 학급만, 학년부장·진로부장은 전 학급을 본다.
func (a *App) GetTransferStudents() ([]TransferStudent, error) {
	if a.user == nil {
		return nil, fmt.Errorf("로그인이 필요합니다")
	}
	config, err := a.db.GetSchoolConfig()
	if err != nil || config == nil {
		return []TransferStudent{}, nil
	}
	classes := []int{}
	if a.user.Role == "homeroom" {
		classes = append(classes, a.user.ClassNum)
	} else {
		for i := 1; i <= config.ClassCount; i++ {
			classes = append(classes, i)
		}
	}
	out := []TransferStudent{}
	for _, classNum := range classes {
		students, err := a.db.GetClassStudents(classNum)
		if err != nil {
			continue
		}
		for _, s := range students {
			if note := calc.TransferNote(s.RawData); note != "" {
				out = append(out, TransferStudent{ClassNum: classNum, StudentNum: s.StudentNum, Name: s.Name, Note: note})
			}
		}
	}
	return out, nil
}
