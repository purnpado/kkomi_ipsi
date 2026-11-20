package database

import (
	"sort"
	"strconv"
	"strings"

	"PHGC/internal/calc"
	"PHGC/internal/model"
)

// 나이스 원서 입력용 대조: 학생이 실제로 지원하는 학교·전형의 원서마다 나이스 원서등록 화면과 같은 배치의 값을 붙인다.
// 상담 화면 "지원 원서" 칸(학생 한 명)과 "나이스 원서 입력 일람표"(반 단위)가 같은 줄을 쓴다.

// NiceRosterRow 원서 한 건의 나이스 대조 줄.
type NiceRosterRow struct {
	ClassNum    int            `json:"classNum"`
	StudentNum  string         `json:"studentNum"`
	StudentName string         `json:"studentName"`
	Category    string         `json:"category"` // meister·special·general·other
	SchoolName  string         `json:"schoolName"`
	Track       string         `json:"track"`
	Status      string         `json:"status"`
	NiceForm    *calc.NiceForm `json:"niceForm"`
	Note        string         `json:"note"` // 대조표가 없을 때 이유
}

var niceCategoryOrder = map[string]int{"special": 0}

// niceRowFor 원서 한 건에 대조표를 붙인다. full 은 그 학생의 산출 자료.
func niceRowFor(full *calc.StudentFullData, r model.ApplicationRecord) NiceRosterRow {
	row := NiceRosterRow{ClassNum: r.ClassNum, StudentNum: r.StudentNum, StudentName: r.StudentName, Category: r.Category, SchoolName: r.SchoolName, Track: r.Track, Status: r.Status}
	if r.Category != "special" {
		row.Note = "나이스 대조표가 없는 전형입니다."
		return row
	}
	school, track := normalizeCutoffSchool(r.SchoolName), normalizeCutoffTrack(r.Track)
	for _, rule := range calc.AllSchoolRules {
		if rule.SchoolName != school || rule.TrackName != track {
			continue
		}
		if view := calc.SchoolBasisFor(full, rule.SchoolName, rule.TrackName); view != nil && view.NiceForm != nil {
			row.NiceForm = view.NiceForm
			return row
		}
		row.Note = "이 전형의 나이스 대조표가 아직 없습니다."
		return row
	}
	row.Note = "이 학교·전형의 산출식을 찾지 못했습니다."
	return row
}

// isNiceTarget 나이스 대조 대상 원서: 그 고입 연도의 특성화고 원서 중 지원 학교가 정해진 것.
// 특성화고 나이스 화면은 예체능을 뺀 학기 합계를 나이스가 계산해 보여 주므로 산출 값과 맞춰 볼 수 있다.
// 마이스터고 화면은 나이스 성적 파일 원자료를 그대로 보여 주고, 후기 일반고는 대조가 필요 없어 뺀다(담임 확인 2026-11-19).
func isNiceTarget(r model.ApplicationRecord, admissionYear int) bool {
	if admissionYear > 0 && r.AdmissionYear != admissionYear {
		return false
	}
	return r.Category == "special" && strings.TrimSpace(r.SchoolName) != ""
}

func sortNiceRows(rows []NiceRosterRow) {
	sort.SliceStable(rows, func(i, j int) bool {
		a, b := rows[i], rows[j]
		if a.ClassNum != b.ClassNum {
			return a.ClassNum < b.ClassNum
		}
		if a.StudentNum != b.StudentNum {
			na, ea := strconv.Atoi(a.StudentNum)
			nb, eb := strconv.Atoi(b.StudentNum)
			if ea == nil && eb == nil {
				return na < nb
			}
			return a.StudentNum < b.StudentNum
		}
		return niceCategoryOrder[a.Category] < niceCategoryOrder[b.Category]
	})
}

func (dm *DBManager) niceAdmissionYear() int {
	if config, err := dm.GetSchoolConfig(); err == nil {
		return config.AdmissionYear
	}
	return 0
}

// GetStudentNiceRows 학생 한 명의 지원 원서별 나이스 대조(상담 화면).
func (dm *DBManager) GetStudentNiceRows(classNum int, studentNum, name string, isMaster bool) ([]NiceRosterRow, error) {
	apps, err := dm.GetStudentApplications(classNum, studentNum, name)
	if err != nil {
		return nil, err
	}
	year := dm.niceAdmissionYear()
	var targets []model.ApplicationRecord
	for _, r := range apps {
		if isNiceTarget(r, year) {
			targets = append(targets, r)
		}
	}
	rows := []NiceRosterRow{}
	if len(targets) == 0 {
		return rows, nil
	}
	full, err := dm.GetStudentFullDetail(classNum, studentNum, name, isMaster)
	if err != nil {
		return nil, err
	}
	for _, r := range targets {
		rows = append(rows, niceRowFor(full, r))
	}
	sortNiceRows(rows)
	return rows, nil
}

// GetNiceRoster 반 단위 나이스 원서 입력 일람표. classNum 0 은 전교(학년부장·진로부장).
func (dm *DBManager) GetNiceRoster(classNum int, isMaster bool) ([]NiceRosterRow, error) {
	config, err := dm.GetSchoolConfig()
	if err != nil {
		return nil, err
	}
	records, err := dm.GetSchoolApplicationRecords()
	if err != nil {
		return nil, err
	}
	byClass := map[int][]model.ApplicationRecord{}
	for _, r := range records {
		if (classNum == 0 || r.ClassNum == classNum) && isNiceTarget(r, config.AdmissionYear) {
			byClass[r.ClassNum] = append(byClass[r.ClassNum], r)
		}
	}
	rows := []NiceRosterRow{}
	for c, apps := range byClass {
		fulls, err := dm.GetClassFullGrades(c, isMaster)
		if err != nil {
			return nil, err
		}
		byStudent := make(map[string]*calc.StudentFullData, len(fulls))
		for i := range fulls {
			byStudent[fulls[i].StudentNum+"|"+fulls[i].Name] = &fulls[i]
		}
		for _, r := range apps {
			full := byStudent[r.StudentNum+"|"+r.StudentName]
			if full == nil {
				row := NiceRosterRow{ClassNum: r.ClassNum, StudentNum: r.StudentNum, StudentName: r.StudentName, Category: r.Category, SchoolName: r.SchoolName, Track: r.Track, Status: r.Status}
				row.Note = "성적 자료가 없는 학생입니다(나이스 엑셀을 올렸는지 확인)."
				rows = append(rows, row)
				continue
			}
			rows = append(rows, niceRowFor(full, r))
		}
	}
	sortNiceRows(rows)
	return rows, nil
}
