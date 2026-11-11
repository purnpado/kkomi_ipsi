package main

import (
	"fmt"
	"os"
	"path/filepath"

	"PHGC/internal/calc"
	"PHGC/internal/database"
	"PHGC/internal/sync"
)

// --- 동기화 API ---

// SyncWithServer Gitea 서버와 동기화 실행
func (a *App) SyncWithServer() *sync.SyncResult {
	return a.sync.FullSync()
}

// GetAppVersion 현재 앱 버전 반환
func (a *App) GetAppVersion() string {
	return sync.AppVersion
}

// GetServerNotices 운영센터 공지사항 목록 반환
func (a *App) GetServerNotices() ([]sync.NoticeItem, error) {
	return a.sync.GetNotices()
}

// --- 엑셀 임포트 API ---

// OpenExcelFile 파일 선택 다이얼로그 열기 (단일 파일 호환용)
func (a *App) OpenExcelFile() (string, error) {
	files, err := a.OpenMultipleExcelFiles("나이스 엑셀 파일 선택 (여러 반 파일을 Ctrl 또는 Shift 키로 동시 선택 가능)")
	if err != nil || len(files) == 0 {
		return "", err
	}
	return files[0], nil
}

// OpenMultipleExcelFiles 복수 학급 엑셀 파일 동시 선택 다이얼로그 열기
func (a *App) OpenMultipleExcelFiles(title string) ([]string, error) {
	if title == "" {
		title = "나이스 엑셀 파일 선택 (여러 반 파일을 Ctrl 또는 Shift 키로 동시 선택 가능)"
	}
	return a.openMultipleFilesDialog(title, "Data Files (*.xlsx, *.xls, *.csv)", "*.xlsx;*.xls;*.csv")
}

// ProcessExcel 엑셀 파일을 읽고 분할 저장 (단일 파일 호환)
func (a *App) ProcessExcel(filePath string) (map[int]int, error) {
	return a.ProcessMultipleExcel([]string{filePath})
}

// ProcessAttendanceExcel 출결 엑셀 파싱 후 DB 병합 (단일 파일 호환)
func (a *App) ProcessAttendanceExcel(filePath string) (map[int]int, error) {
	return a.ProcessMultipleAttendanceExcel([]string{filePath})
}

// ProcessVolunteerExcel 봉사 엑셀 파싱 후 DB 병합 (단일 파일 호환)
func (a *App) ProcessVolunteerExcel(filePath string) (map[int]int, error) {
	return a.ProcessMultipleVolunteerExcel([]string{filePath})
}

// GetClassStatus 전체 학급의 데이터 저장 현황(학생 수) 반환
func (a *App) GetClassStatus(classCount int) map[int]int {
	status := make(map[int]int)
	for i := 1; i <= classCount; i++ {
		status[i] = a.db.GetClassStudentCount(i)
	}
	return status
}

// --- 고입 커트라인 관리 ---

func (a *App) SaveCutoffs(cutoffs []database.CutoffInfo) error {
	return a.db.SaveCutoffs(cutoffs)
}

func (a *App) DeleteCutoff(year int, schoolName, department, track string) error {
	return a.db.DeleteCutoff(year, schoolName, department, track)
}

func (a *App) DeleteCutoffs(cutoffs []database.CutoffInfo) error {
	return a.db.DeleteCutoffs(cutoffs)
}

func (a *App) ResetCutoffs(year int) error {
	return a.db.ResetCutoffs(year)
}

func (a *App) PurgeOldCutoffs(baseAdmissionYear, keepYears int) (int64, error) {
	return a.db.PurgeOldCutoffs(baseAdmissionYear, keepYears)
}

func (a *App) GetCutoffs() ([]database.CutoffInfo, error) {
	if config, err := a.db.GetSchoolConfig(); err == nil && config.AdmissionYear > 0 {
		_, _ = a.db.PurgeOldCutoffs(config.AdmissionYear, 5)
	}
	return a.db.GetCutoffs()
}

// ResetAllData 데이터 폴더 삭제를 통해 완전 초기화
func (a *App) ResetAllData() error {
	// DB 연결이 열려 있을 수 있으므로 GC를 강제로 호출하거나 그냥 폴더 내용물을 지움
	// 가장 확실한 것은 설정 파일들과 DB 파일들을 지우는 것
	exePath, err := os.Executable()
	if err != nil {
		exePath = "."
	}
	dataDir := filepath.Join(filepath.Dir(exePath), "data")

	err = os.RemoveAll(dataDir)
	if err != nil {
		return fmt.Errorf("데이터 삭제 실패: %w", err)
	}

	// dataDir 다시 생성
	os.MkdirAll(dataDir, 0755)

	// 테이블 다시 생성
	if err := a.db.InitConfigDB(); err != nil {
		return fmt.Errorf("DB 초기화 실패: %w", err)
	}

	return nil
}

// ResetAcademicYear 입시년도 전환 시 커트라인을 제외한 모든 학급 데이터를 보관 폴더로 옮긴다(학년부장 전용).
func (a *App) ResetAcademicYear(newYear int) error {
	if a.user == nil || a.user.Role != "master" {
		return fmt.Errorf("새 학년 시작은 학년부장 계정만 할 수 있습니다")
	}
	return a.db.ResetAcademicYear(newYear)
}

// StartNewAcademicYear 새 학년 시작: 지난 학년도 학급 자료를 보관 폴더로 옮기고 새 고입 학년도·학급 수로 시작한다.
// 커트라인·결과 확정 기록·관내 공유 자료는 그대로 남는다.
func (a *App) StartNewAcademicYear(newYear, classCount int) error {
	if a.user == nil || a.user.Role != "master" {
		return fmt.Errorf("새 학년 시작은 학년부장 계정만 할 수 있습니다")
	}
	if classCount < 1 || classCount > 30 {
		return fmt.Errorf("학급 수는 1~30 사이여야 합니다")
	}
	if err := a.db.ResetAcademicYear(newYear); err != nil {
		return err
	}
	if err := a.db.UpdateClassCount(classCount); err != nil {
		return err
	}
	return a.refreshLoginIndex()
}

// UpdateClassCount 학급 수 변경(학년부장 전용): 늘어난 반 담임 계정을 만들고 줄어든 반 계정을 지운다.
func (a *App) UpdateClassCount(classCount int) error {
	if a.user == nil || a.user.Role != "master" {
		return fmt.Errorf("학급 수 변경은 학년부장 계정만 할 수 있습니다")
	}
	if err := a.db.UpdateClassCount(classCount); err != nil {
		return err
	}
	return a.refreshLoginIndex()
}

// GetDataUpdateStatus 교과, 출결, 봉사 데이터의 저장 상태 반환
func (a *App) GetDataUpdateStatus() map[string]interface{} {
	config, err := a.db.GetSchoolConfig()
	if err != nil {
		return map[string]interface{}{"error": err.Error()}
	}

	totalStudents := 0
	attendanceCount := 0
	volunteerCount := 0

	for i := 1; i <= config.ClassCount; i++ {
		students, err := a.db.GetClassStudents(i)
		if err == nil {
			totalStudents += len(students)
			for _, s := range students {
				if s.AttendanceData != "" {
					attendanceCount++
				}
				if s.VolunteerData != "" {
					volunteerCount++
				}
			}
		}
	}

	return map[string]interface{}{
		"totalStudents":   totalStudents,
		"hasGrades":       totalStudents > 0,
		"attendanceCount": attendanceCount,
		"hasAttendance":   attendanceCount > 0,
		"volunteerCount":  volunteerCount,
		"hasVolunteer":    volunteerCount > 0,
		"classCount":      config.ClassCount,
		"schoolName":      config.SchoolName,
		"admissionYear":   config.AdmissionYear,
	}
}

// GetSchoolRuleList 지원 고교 및 전형 목록 반환
func (a *App) GetSchoolRuleList() []map[string]string {
	return calc.GetAllSchoolRuleNames()
}

// GetHighSchoolsData 고교 목록 데이터 반환 (후기 일반고 포함)
func (a *App) GetHighSchoolsData() (*sync.HighSchoolData, error) {
	data, err := a.sync.GetHighSchools()
	if err != nil {
		return nil, err
	}

	// 후기 일반계고가 목록에 없으면 맨 앞에 추가
	hasGeneral := false
	for _, s := range data.Schools {
		if s.Name == "울산 후기 일반계고" {
			hasGeneral = true
			break
		}
	}

	if !hasGeneral {
		generalSchool := sync.HighSchool{
			Name: "울산 후기 일반계고",
			Type: "일반계고",
			Area: "울산전역",
			Note: "석차백분율(%) 기준",
		}
		data.Schools = append([]sync.HighSchool{generalSchool}, data.Schools...)
	}

	return data, nil
}

// GetOfficialAdmissionData 로컬 공식 고입자료 목록 조회
func (a *App) GetOfficialAdmissionData() (*sync.OfficialAdmissionData, error) {
	return a.sync.GetOfficialAdmissionData()
}

// SaveOfficialAdmissionData 로컬 공식 고입자료 저장
func (a *App) SaveOfficialAdmissionData(items []map[string]interface{}) error {
	if items == nil {
		items = []map[string]interface{}{}
	}
	official := &sync.OfficialAdmissionData{Items: items}
	return a.sync.SaveOfficialAdmissionData(official)
}

// ProcessMultipleExcel 복수 학급 성적 엑셀 파일을 일괄 처리 (전체 반 일괄 업로드 지원)
func (a *App) ProcessMultipleExcel(filePaths []string) (map[int]int, error) {
	return a.db.ProcessMultipleExcel(filePaths)
}

// ProcessMultipleAttendanceExcel 복수 학급 출결 엑셀 파일을 일괄 처리
func (a *App) ProcessMultipleAttendanceExcel(filePaths []string) (map[int]int, error) {
	return a.db.ProcessMultipleAttendanceExcel(filePaths)
}

// ProcessMultipleVolunteerExcel 복수 학급 봉사 엑셀 파일을 일괄 처리
func (a *App) ProcessMultipleVolunteerExcel(filePaths []string) (map[int]int, error) {
	return a.db.ProcessMultipleVolunteerExcel(filePaths)
}
