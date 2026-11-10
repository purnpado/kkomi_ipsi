package database

import (
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"strings"

	"PHGC/internal/calc"
	"PHGC/internal/model"
)

// UpdateSchoolRankSnapshots 전교생 기준 석차 및 백분율을 일괄 산출하여 스냅샷으로 보관
func (dm *DBManager) UpdateSchoolRankSnapshots() error {
	config, err := dm.GetSchoolConfig()
	if err != nil || config == nil {
		return err
	}
	allStudents, err := dm.GetAllStudents(config.ClassCount)
	if err != nil || len(allStudents) == 0 {
		return err
	}
	calcResults, err := calc.CalculateGrades(allStudents, config.IsSmallSchool)
	if err != nil {
		return err
	}
	if err := dm.SaveRankSnapshots(calcResults); err != nil {
		return err
	}
	_, _ = dm.BackfillAllApplicationsScoreDetails()
	return nil
}

// GetClassGrades 특정 반의 내신 성적 가산출 결과 반환
func (dm *DBManager) GetClassGrades(classNum int, isMaster bool) ([]calc.StudentCalcResult, error) {
	config, err := dm.GetSchoolConfig()
	if err != nil {
		return nil, fmt.Errorf("설정을 불러올 수 없습니다: %w", err)
	}

	// 1. 전체 학생 데이터 불러오기 (전교 석차 산출을 위함)
	allStudents, err := dm.GetAllStudents(config.ClassCount)
	if err != nil {
		return nil, fmt.Errorf("학생 데이터를 불러오는 중 오류 발생: %w", err)
	}

	// 2. 성적 산출 및 석차 백분율 계산
	calcResults, err := calc.CalculateGrades(allStudents, config.IsSmallSchool)
	if err != nil {
		return nil, fmt.Errorf("성적 산출 중 오류 발생: %w", err)
	}

	// 2-1. 학년부장 권한이거나 학생 데이터가 여러 반 이상 있는 경우 스냅샷을 최신으로 갱신
	if isMaster || len(allStudents) > 1 {
		_ = dm.SaveRankSnapshots(calcResults)
	}

	// 2-2. 전교 석차 스냅샷 조회 (담임 배포본 등 로컬 DB 학생수가 전교생보다 적을 때 전교 기준 석차 유지)
	snapshots, _ := dm.GetRankSnapshots(classNum)

	// 3. 요청한 반의 학생들만 필터링하여 반환
	var classResults []calc.StudentCalcResult
	for _, res := range calcResults {
		if res.ClassNum == classNum {
			// 만약 전교 석차 스냅샷이 존재하고, 스냅샷의 전교 학생수가 현재 계산된 학생수보다 크다면 스냅샷 우선 적용!
			if snapshots != nil {
				key := fmt.Sprintf("%s_%s", strings.TrimSpace(res.StudentNum), strings.TrimSpace(res.Name))
				if snap, ok := snapshots[key]; ok && snap.TotalStudents > res.TotalStudents {
					res.TotalStudents = snap.TotalStudents
					res.Rank = snap.Rank
					res.Percentile = snap.Percentile
					res.FinalScore = snap.FinalScore
					res.GeneralTotalScore = res.FinalScore + res.NonAcademicScore
				}
			}
			classResults = append(classResults, res)
		}
	}

	// 번호순으로 정렬
	sort.Slice(classResults, func(i, j int) bool {
		// 번호가 문자열이므로 숫자로 변환하여 비교 (가능한 경우)
		numI, errI := strconv.Atoi(classResults[i].StudentNum)
		numJ, errJ := strconv.Atoi(classResults[j].StudentNum)
		if errI == nil && errJ == nil {
			return numI < numJ
		}
		return classResults[i].StudentNum < classResults[j].StudentNum
	})

	return classResults, nil
}

// matchStudent 학생 번호와 이름을 대조하여 동일 학생 여부 판별 (공백 제거, 번호 정수 일치 지원)
func matchStudent(num1, name1, num2, name2 string) bool {
	cleanName1 := strings.ReplaceAll(strings.TrimSpace(name1), " ", "")
	cleanName2 := strings.ReplaceAll(strings.TrimSpace(name2), " ", "")
	if cleanName1 != "" && cleanName2 != "" && cleanName1 == cleanName2 {
		return true
	}
	n1, err1 := strconv.Atoi(strings.TrimSpace(num1))
	n2, err2 := strconv.Atoi(strings.TrimSpace(num2))
	if err1 == nil && err2 == nil && n1 == n2 {
		return true
	}
	return strings.TrimSpace(num1) == strings.TrimSpace(num2)
}

// RefreshStudentSchoolScoreCache stores the already-defined school rules as
// queryable rows in the encrypted class DB.
func (dm *DBManager) RefreshStudentSchoolScoreCache(classNum int, studentNum, name string) error {
	student, err := dm.GetStudent(classNum, studentNum, name)
	if err != nil {
		return err
	}
	full, err := calc.ParseStudentFullData(*student)
	if err != nil {
		return err
	}
	return dm.ReplaceStudentSchoolScores(classNum, student.StudentNum, student.Name, full.SchoolResults)
}

func (dm *DBManager) RefreshClassSchoolScoreCache(classNum int) error {
	students, err := dm.GetClassStudents(classNum)
	if err != nil {
		return err
	}
	for _, student := range students {
		full, err := calc.ParseStudentFullData(student)
		if err != nil {
			return fmt.Errorf("%s 학생: %w", student.Name, err)
		}
		if err := dm.ReplaceStudentSchoolScores(classNum, student.StudentNum, student.Name, full.SchoolResults); err != nil {
			return err
		}
	}
	return nil
}

// GetStudentFullDetail 학생 1명의 10개 고교별 산출 결과 및 상세 내역 반환
func (dm *DBManager) GetStudentFullDetail(classNum int, studentNum, name string, isMaster bool) (*calc.StudentFullData, error) {
	s, err := dm.GetStudent(classNum, studentNum, name)
	if err != nil {
		return nil, fmt.Errorf("학생 정보를 찾을 수 없습니다: %w", err)
	}

	full, err := calc.ParseStudentFullData(*s)
	if err != nil {
		return nil, err
	}

	// 대시보드와 동일한 정확한 전교 석차 백분율 동기화
	classGrades, _ := dm.GetClassGrades(classNum, isMaster)
	for _, cg := range classGrades {
		if matchStudent(cg.StudentNum, cg.Name, studentNum, name) {
			full.GeneralHSPercentile = cg.Percentile
			full.GeneralHSAcademicScore = cg.FinalScore
			full.GeneralHSNonAcademicScore = cg.NonAcademicScore
			full.GeneralHSTotalScore = cg.GeneralTotalScore
			full.GeneralHSDataComplete = cg.GeneralDataComplete
			full.GeneralHSProjected = cg.GeneralProjected
			if cg.Percentile <= 80 {
				full.GeneralHSLevel = "상"
			} else if cg.Percentile <= 90 {
				full.GeneralHSLevel = "중"
			} else {
				full.GeneralHSLevel = "하"
			}
			break
		}
	}

	// 학생 등록 지원 희망 학교 목록 조회
	apps, err := dm.GetStudentApplications(classNum, studentNum, name)
	if err == nil && apps != nil {
		full.Applications = apps
	} else {
		full.Applications = []model.ApplicationRecord{}
	}

	return full, nil
}

// ApplicationScoreSnapshot is the score currently calculated for one selected school track.
// The support-status form uses this lightweight result instead of reloading every student.
type ApplicationScoreSnapshot struct {
	Score      float64 `json:"score"`
	TotalMax   float64 `json:"totalMax"`
	SchoolName string  `json:"schoolName"`
	TrackName  string  `json:"trackName"`
	Basis      string  `json:"basis"`
}

func normalizeApplicationSchoolName(value string) string {
	value = strings.TrimSuffix(strings.TrimSpace(value), "등학교")
	return strings.ReplaceAll(value, " ", "")
}

// GetStudentApplicationScoreSnapshot calculates only the selected school and track.
func (dm *DBManager) GetStudentApplicationScoreSnapshot(classNum int, studentNum, name, category, schoolName, track string, isMaster bool) (*ApplicationScoreSnapshot, error) {
	if category == "general" {
		full, err := dm.GetStudentFullDetail(classNum, studentNum, name, isMaster)
		if err != nil {
			return nil, err
		}
		return &ApplicationScoreSnapshot{
			Score: full.GeneralHSTotalScore, TotalMax: 200,
			SchoolName: "후기 일반계고", TrackName: "후기 일반계고",
			Basis: "후기 일반계고 내신 자동 산출",
		}, nil
	}
	if category != "meister" && category != "special" {
		return nil, fmt.Errorf("자동 점수 산출 대상 전형이 아닙니다")
	}
	if strings.TrimSpace(schoolName) == "" || strings.TrimSpace(track) == "" {
		return nil, fmt.Errorf("지원 학교와 전형을 선택해주세요")
	}
	results, err := dm.GetStudentSchoolScores(classNum, studentNum, name)
	if err != nil {
		return nil, err
	}
	// 기존에 입력된 자료에는 캐시가 없을 수 있다. 그 경우에만 한 번 계산해
	// 저장하고, 이후 지원현황은 저장된 점수만 조회한다.
	if len(results) == 0 {
		if err := dm.RefreshStudentSchoolScoreCache(classNum, studentNum, name); err != nil {
			return nil, err
		}
		results, err = dm.GetStudentSchoolScores(classNum, studentNum, name)
		if err != nil {
			return nil, err
		}
	}
	for _, result := range results {
		if normalizeApplicationSchoolName(result.SchoolName) == normalizeApplicationSchoolName(schoolName) && result.TrackName == track {
			return &ApplicationScoreSnapshot{
				Score: result.TotalScore, TotalMax: result.TotalMax,
				SchoolName: result.SchoolName, TrackName: result.TrackName,
				Basis: fmt.Sprintf("%s %s 자동 산출 (%.0f점 만점)", result.SchoolName, result.TrackName, result.TotalMax),
			}, nil
		}
	}
	return nil, fmt.Errorf("%s %s 전형의 산출식을 찾을 수 없습니다", schoolName, track)
}

// StudentTranscriptData 학생의 전학년 교과/비교과 전체 상세 성적표
type StudentTranscriptData struct {
	ClassNum       int                 `json:"classNum"`
	StudentNum     string              `json:"studentNum"`
	Name           string              `json:"name"`
	SubjectRecords []map[string]string `json:"subjectRecords"`
	AttendanceRaw  string              `json:"attendanceRaw"`
	VolunteerRaw   string              `json:"volunteerRaw"`
	AllAverage     float64             `json:"allAverage"`
	Percentile     float64             `json:"percentile"`
	Rank           int                 `json:"rank"`
	TotalStudents  int                 `json:"totalStudents"`
}

// GetStudentTranscript 학생 1명의 전과목 전학년 성적과 출결/봉사 원시 데이터 일체 반환
func (dm *DBManager) GetStudentTranscript(classNum int, studentNum, name string) (*StudentTranscriptData, error) {
	s, err := dm.GetStudent(classNum, studentNum, name)
	if err != nil {
		return nil, fmt.Errorf("학생 정보를 찾을 수 없습니다: %w", err)
	}

	res := &StudentTranscriptData{
		ClassNum:      s.ClassNum,
		StudentNum:    s.StudentNum,
		Name:          s.Name,
		AttendanceRaw: s.AttendanceData,
		VolunteerRaw:  s.VolunteerData,
	}

	if s.RawData != "" {
		_ = json.Unmarshal([]byte(s.RawData), &res.SubjectRecords)
	}

	// 평균 성취도 산출
	if fullData, err := calc.ParseStudentFullData(*s); err == nil && fullData != nil {
		res.AllAverage = fullData.AllAverage
	}

	// 전교 석차 및 백분율 정보 산출 (스냅샷 우선)
	if snap, err := dm.GetStudentRankSnapshot(classNum, studentNum, name); err == nil && snap != nil && snap.TotalStudents > 0 {
		res.TotalStudents = snap.TotalStudents
		res.Rank = snap.Rank
		res.Percentile = snap.Percentile
	} else {
		config, _ := dm.GetSchoolConfig()
		if config != nil {
			allStudents, _ := dm.GetAllStudents(config.ClassCount)
			if len(allStudents) > 0 {
				calcResults, _ := calc.CalculateGrades(allStudents, config.IsSmallSchool)
				res.TotalStudents = len(calcResults)
				for _, cg := range calcResults {
					if cg.ClassNum == classNum && matchStudent(cg.StudentNum, cg.Name, studentNum, name) {
						res.Rank = cg.Rank
						res.Percentile = cg.Percentile
						break
					}
				}
			}
		}
	}

	return res, nil
}

// GetClassFullGrades 특정 반 전체 학생의 고교별 산출 결과 목록 반환 (신호등 매트릭스용)
func (dm *DBManager) GetClassFullGrades(classNum int, isMaster bool) ([]calc.StudentFullData, error) {
	students, err := dm.GetClassStudents(classNum)
	if err != nil {
		return nil, err
	}

	// 1. 전교생 기준 정확한 내신 산출 결과(석차백분율) 가져오기
	classGrades, _ := dm.GetClassGrades(classNum, isMaster)

	var results []calc.StudentFullData
	for _, s := range students {
		full, err := calc.ParseStudentFullData(s)
		if err == nil {
			// 대시보드 표와 동일한 정확한 전교 석차 백분율 동기화
			for _, cg := range classGrades {
				if matchStudent(cg.StudentNum, cg.Name, full.StudentNum, full.Name) {
					full.GeneralHSPercentile = cg.Percentile
					full.GeneralHSAcademicScore = cg.FinalScore
					full.GeneralHSNonAcademicScore = cg.NonAcademicScore
					full.GeneralHSTotalScore = cg.GeneralTotalScore
					full.GeneralHSDataComplete = cg.GeneralDataComplete
					full.GeneralHSProjected = cg.GeneralProjected
					break
				}
			}
			results = append(results, *full)
		}
	}

	// 번호순 정렬
	sort.Slice(results, func(i, j int) bool {
		numI, errI := strconv.Atoi(results[i].StudentNum)
		numJ, errJ := strconv.Atoi(results[j].StudentNum)
		if errI == nil && errJ == nil {
			return numI < numJ
		}
		return results[i].StudentNum < results[j].StudentNum
	})

	return results, nil
}
