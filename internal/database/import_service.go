package database

import (
	"fmt"
	"path/filepath"
	"strings"

	"PHGC/internal/parser"
)

// ProcessMultipleExcel 복수 학급 성적 엑셀 파일을 일괄 처리 (전체 반 일괄 업로드 지원)
func (dm *DBManager) ProcessMultipleExcel(filePaths []string) (map[int]int, error) {
	if len(filePaths) == 0 {
		return nil, fmt.Errorf("선택된 파일이 없습니다")
	}

	result := make(map[int]int)
	var errors []string

	// 반 번호 확인을 먼저 끝낸 뒤 저장한다(학교 설정보다 큰 반이 있으면 아무것도 저장하지 않는다).
	parsed := map[string]map[int][]parser.StudentExcelData{}
	var classNums []int
	for _, filePath := range filePaths {
		classData, err := parser.ParseExcel(filePath)
		if err != nil {
			errors = append(errors, fmt.Sprintf("[%s] 파싱 실패: %v", filepath.Base(filePath), err))
			continue
		}
		parsed[filePath] = classData
		for c := range classData {
			classNums = append(classNums, c)
		}
	}
	if err := dm.checkClassRange(classNums); err != nil {
		return nil, err
	}
	for _, filePath := range filePaths {
		classData, ok := parsed[filePath]
		if !ok {
			continue
		}

		for classNum, students := range classData {
			err := dm.SaveClassStudents(classNum, students)
			if err != nil {
				errors = append(errors, fmt.Sprintf("[%s] %d반 저장 실패: %v", filepath.Base(filePath), classNum, err))
				continue
			}
			if err := dm.RefreshClassSchoolScoreCache(classNum); err != nil {
				errors = append(errors, fmt.Sprintf("[%s] %d반 점수 산출 실패: %v", filepath.Base(filePath), classNum, err))
			}
			result[classNum] += len(students)
		}
	}

	if len(result) == 0 && len(errors) > 0 {
		return nil, fmt.Errorf("모든 파일 처리 실패:\n%s", strings.Join(errors, "\n"))
	}

	// 엑셀 성적 업로드 완료 후 전교생 기준 석차 및 백분율 스냅샷 자동 갱신
	_ = dm.UpdateSchoolRankSnapshots()

	return result, nil
}

// ProcessMultipleAttendanceExcel 복수 학급 출결 엑셀 파일을 일괄 처리
func (dm *DBManager) ProcessMultipleAttendanceExcel(filePaths []string) (map[int]int, error) {
	if len(filePaths) == 0 {
		return nil, fmt.Errorf("선택된 파일이 없습니다")
	}

	result := make(map[int]int)
	var errors []string

	// 반 번호 확인을 먼저 끝낸 뒤 저장한다(학교 설정보다 큰 반이 있으면 아무것도 저장하지 않는다).
	parsed := map[string]map[int][]parser.StudentExcelData{}
	var classNums []int
	for _, filePath := range filePaths {
		classData, err := parser.ParseAttendanceExcel(filePath)
		if err != nil {
			errors = append(errors, fmt.Sprintf("[%s] 파싱 실패: %v", filepath.Base(filePath), err))
			continue
		}
		parsed[filePath] = classData
		for c := range classData {
			classNums = append(classNums, c)
		}
	}
	if err := dm.checkClassRange(classNums); err != nil {
		return nil, err
	}
	for _, filePath := range filePaths {
		classData, ok := parsed[filePath]
		if !ok {
			continue
		}

		for classNum, students := range classData {
			updatedCount, err := dm.UpdateStudentAttendance(classNum, students)
			if err != nil {
				errors = append(errors, fmt.Sprintf("[%s] %d반 출결 데이터 저장 실패: %v", filepath.Base(filePath), classNum, err))
				continue
			}
			if err := dm.RefreshClassSchoolScoreCache(classNum); err != nil {
				errors = append(errors, fmt.Sprintf("[%s] %d반 점수 갱신 실패: %v", filepath.Base(filePath), classNum, err))
			}
			result[classNum] += updatedCount
		}
	}

	if len(result) == 0 && len(errors) > 0 {
		return nil, fmt.Errorf("모든 파일 처리 실패:\n%s", strings.Join(errors, "\n"))
	}

	// 출결 변동 반영 전교생 성적 스냅샷 갱신
	_ = dm.UpdateSchoolRankSnapshots()

	return result, nil
}

// ProcessMultipleVolunteerExcel 복수 학급 봉사 엑셀 파일을 일괄 처리
func (dm *DBManager) ProcessMultipleVolunteerExcel(filePaths []string) (map[int]int, error) {
	if len(filePaths) == 0 {
		return nil, fmt.Errorf("선택된 파일이 없습니다")
	}

	result := make(map[int]int)
	var errors []string

	// 반 번호 확인을 먼저 끝낸 뒤 저장한다(학교 설정보다 큰 반이 있으면 아무것도 저장하지 않는다).
	parsed := map[string]map[int][]parser.StudentExcelData{}
	var classNums []int
	for _, filePath := range filePaths {
		classData, err := parser.ParseVolunteerExcel(filePath)
		if err != nil {
			errors = append(errors, fmt.Sprintf("[%s] 파싱 실패: %v", filepath.Base(filePath), err))
			continue
		}
		parsed[filePath] = classData
		for c := range classData {
			classNums = append(classNums, c)
		}
	}
	if err := dm.checkClassRange(classNums); err != nil {
		return nil, err
	}
	for _, filePath := range filePaths {
		classData, ok := parsed[filePath]
		if !ok {
			continue
		}

		for classNum, students := range classData {
			updatedCount, err := dm.UpdateStudentVolunteer(classNum, students)
			if err != nil {
				errors = append(errors, fmt.Sprintf("[%s] %d반 봉사 데이터 저장 실패: %v", filepath.Base(filePath), classNum, err))
				continue
			}
			if err := dm.RefreshClassSchoolScoreCache(classNum); err != nil {
				errors = append(errors, fmt.Sprintf("[%s] %d반 점수 갱신 실패: %v", filepath.Base(filePath), classNum, err))
			}
			result[classNum] += updatedCount
		}
	}

	if len(result) == 0 && len(errors) > 0 {
		return nil, fmt.Errorf("모든 파일 처리 실패:\n%s", strings.Join(errors, "\n"))
	}

	// 봉사시간 변동 반영 전교생 성적 스냅샷 갱신
	_ = dm.UpdateSchoolRankSnapshots()

	return result, nil
}
