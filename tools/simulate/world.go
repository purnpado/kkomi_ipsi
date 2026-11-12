package main

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"PHGC/internal/calc"
	"PHGC/internal/database"
	"PHGC/internal/exchange"
)

// 가상 지역: 관내 참여 중학교(프로그램 사용) + 비참여 중학교(경쟁자로만 존재).
// 비참여 학교 학생도 같은 고교에 지원하므로, 관내 공유 자료는 지역 전체의 일부 표본이 된다.

type middleSchool struct {
	name          string
	classes       int
	shift         float64 // 학력 수준
	participating bool    // 꼬미입시를 쓰고 관내 공유에 참여
	bonusInput    bool    // 창체·행발 가산점까지 입력하는 학교
	dir           string
	dm            *database.DBManager
	baseClasses   int
	handover      string // 지난 학년도에 만든 인수인계 파일
	classHistory  []int  // 학년도별 학급 수
	key           []byte // 그해 data 폴더의 데이터 열쇠(열람용 폴더 만들 때 사용)
}

type student struct {
	school    *middleSchool
	full      calc.StudentFullData
	scores    map[string]float64 // "울산마이스터고/일반" → 1차 점수(원서 시기 v1)
	maxes     map[string]float64
	pctV1     float64 // 학교 내 석차백분율(원서 시기)
	baseV1    float64 // 후기 기본 지표(원서 시기, 3-1 복사 예상)
	baseFinal float64 // 후기 기본 지표(확정, 3-2 반영)
	bonus     int     // 실제 창체·행발 가산점(0~6). 입력하지 않는 학교도 실제로는 있다.
	bonusJSON string
	apps      []*application
	admitted  *application // 최종 진학 전형
}

func (s *student) key() string {
	return fmt.Sprintf("%s|%d|%s|%s", s.school.name, s.full.ClassNum, s.full.StudentNum, s.full.Name)
}

// trueGeneralTotal 실제 후기 일반고 총점(가산점 포함, 교육청이 선발에 쓰는 값)
func (s *student) trueGeneralTotal() float64 { return calc.Round2(s.baseFinal + float64(s.bonus)) }

func newSchools(root string) []*middleSchool {
	defs := []middleSchool{
		{name: "가람중학교", classes: 10, shift: 0.2, participating: true, bonusInput: true},
		{name: "나래중학교", classes: 8, shift: -0.2, participating: true, bonusInput: false},
		{name: "다솜중학교", classes: 7, shift: 0.0, participating: true, bonusInput: true},
		{name: "라온중학교", classes: 9, shift: -0.4, participating: true, bonusInput: false},
		{name: "마루중학교", classes: 6, shift: 0.35, participating: true, bonusInput: true},
		{name: "바다중학교(비참여)", classes: 10, shift: -0.1},
		{name: "사랑중학교(비참여)", classes: 9, shift: 0.1},
		{name: "아름중학교(비참여)", classes: 8, shift: -0.3},
	}
	out := []*middleSchool{}
	for i := range defs {
		d := defs[i]
		d.dir = filepath.Join(root, "schools", fmt.Sprintf("%d", i+1))
		d.baseClasses = d.classes
		out = append(out, &d)
	}
	return out
}

// openSchool 해마다 새 폴더에 새로 설치하고 초기 설정(그해 학급 수·새 열쇠)을 한 뒤,
// 지난 학년도 인수인계 파일이 있으면 입시 자료를 받아 들인다(실제 학교의 학년 전환 방식).
func (m *middleSchool) openSchool(year int, rng *rand.Rand) error {
	m.classes = m.baseClasses + rng.Intn(5) - 2 // 학급 수가 해마다 ±2 바뀐다
	if m.classes < 4 {
		m.classes = 4
	}
	m.classHistory = append(m.classHistory, m.classes)
	dir := filepath.Join(m.dir, fmt.Sprint(year))
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	m.dm = &database.DBManager{DataDir: dir}
	key := make([]byte, 32)
	rng.Read(key)
	m.dm.SetDataKey(key)
	m.key = key
	if err := m.dm.InitConfigDB(); err != nil {
		return err
	}
	if err := m.dm.SaveSchoolConfig(m.name, m.classes, "", false, year); err != nil {
		return err
	}
	if err := m.dm.UpdateClassCount(m.classes); err != nil {
		return err
	}
	if m.participating && m.handover != "" {
		if _, err := exchange.ImportHandoverFile(m.dm, m.handover, "sim-handover-pw", true); err != nil {
			return fmt.Errorf("인수인계 파일 받기: %w", err)
		}
	}
	return nil
}

// generateCohort tools/testdata/gen_students.py로 그 해 학생 자료(v1·v2 CSV)를 만든다.
func (m *middleSchool) generateCohort(root string, year, seed int) (string, error) {
	out := filepath.Join(root, "cohorts", fmt.Sprintf("%d", year), m.name)
	cmd := exec.Command("python3", "-I", "tools/testdata/gen_students.py", out,
		"--seed", fmt.Sprint(seed), "--classes", fmt.Sprint(m.classes),
		"--shift", fmt.Sprintf("%.2f", m.shift), "--school-year", fmt.Sprint(year-1))
	if b, err := cmd.CombinedOutput(); err != nil {
		return "", fmt.Errorf("학생 자료 생성 실패: %v %s", err, b)
	}
	return out, nil
}

// importVersion 나이스 CSV 3종을 프로그램의 실제 가져오기 기능으로 올린다.
func (m *middleSchool) importVersion(dir string) error {
	if _, err := m.dm.ProcessMultipleExcel([]string{filepath.Join(dir, "1_교과학습발달상황.csv")}); err != nil {
		return err
	}
	if _, err := m.dm.ProcessMultipleAttendanceExcel([]string{filepath.Join(dir, "2_출결상황.csv")}); err != nil {
		return err
	}
	_, err := m.dm.ProcessMultipleVolunteerExcel([]string{filepath.Join(dir, "3_봉사활동상황.csv")})
	return err
}

func (m *middleSchool) loadStudents() ([]calc.StudentFullData, error) {
	var all []calc.StudentFullData
	for c := 1; c <= m.classes; c++ {
		list, err := m.dm.GetClassFullGrades(c, true)
		if err != nil {
			return nil, err
		}
		all = append(all, list...)
	}
	return all, nil
}

// assignBonus 학생마다 실제 가산점을 정한다(학급당 대상자 제한을 흉내 내 대부분 0~2점).
// 가산점을 입력하는 학교만 프로그램에 저장한다.
func assignBonus(rng *rand.Rand, s *student) {
	flags := map[string]interface{}{}
	for g := 1; g <= 3; g++ {
		for _, kind := range []string{"haengbal", "changche"} {
			p := 0.12
			if s.pctV1 < 30 {
				p = 0.25 // 임원·표창은 상위권에 조금 더 많다
			}
			if rng.Float64() < p {
				flags[fmt.Sprintf("%s_%d", kind, g)] = true
				s.bonus++
			}
		}
	}
	flags["general_bonus_entered"] = true
	b, _ := json.Marshal(flags)
	s.bonusJSON = string(b)
}

func (m *middleSchool) saveBonus(students []*student) error {
	if !m.bonusInput {
		return nil
	}
	for _, s := range students {
		if err := m.dm.UpdateStudentExtra(s.full.ClassNum, s.full.StudentNum, s.full.Name, s.bonusJSON); err != nil {
			return err
		}
	}
	return nil
}

func shortSchool(name string) string { return strings.TrimSuffix(strings.TrimSpace(name), "등학교") }
