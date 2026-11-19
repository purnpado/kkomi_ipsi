package database

import (
	"database/sql"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"PHGC/internal/model"
)

// 입시 통계 제외(특수교육대상자·학생선수 등).
// 성적 산출·상담 판정·원서 입력은 다른 학생과 똑같이 하고, 합격선·커트라인을 만드는 통계와
// 학교 밖으로 나가는 파일(관내 공유·인수인계)·결과 확정 보관에서만 그 학생의 원서를 뺀다.
// 민감한 정보이므로 사유는 저장하지 않고, 명단·인쇄물에도 표시하지 않는다.
// 해제도 excluded=0 행으로 남겨, 배포자료 재가져오기·취합자료 병합 때 더 최근에 바꾼 쪽을 고른다.

const statExclusionTimeLayout = "2006-01-02 15:04:05"

// StatExclusion 학년부장 확인 목록 한 줄(통계에서 뺀 학생).
type StatExclusion struct {
	ClassNum    int    `json:"classNum"`
	StudentNum  string `json:"studentNum"`
	StudentName string `json:"studentName"`
}

func statExclusionKey(classNum int, studentNum, studentName string) string {
	return fmt.Sprintf("%d|%s|%s", classNum, strings.TrimSpace(studentNum), strings.TrimSpace(studentName))
}

// GetStudentStatExclusion 학생이 통계 제외인지와 마지막으로 바꾼 시각.
func (dm *DBManager) GetStudentStatExclusion(classNum int, studentNum, studentName string) (*model.StatExclusionMark, error) {
	if err := dm.InitClassDB(classNum); err != nil {
		return nil, err
	}
	db, err := dm.OpenDB(dm.classDBPath(classNum))
	if err != nil {
		return nil, err
	}
	defer db.Close()
	var excluded int
	var updatedAt string
	err = db.QueryRow(`SELECT excluded, updated_at FROM student_stat_exclusions WHERE student_num = ? AND student_name = ?`, studentNum, studentName).Scan(&excluded, &updatedAt)
	if err != nil {
		return nil, nil // 행이 없으면 한 번도 바꾸지 않은 학생
	}
	return &model.StatExclusionMark{Excluded: excluded == 1, UpdatedAt: updatedAt}, nil
}

// SetStudentStatExclusion 담임·학년부장이 통계 제외를 켜거나 끈다(지금 시각으로 기록).
func (dm *DBManager) SetStudentStatExclusion(classNum int, studentNum, studentName string, excluded bool) error {
	if classNum < 1 || strings.TrimSpace(studentNum) == "" || strings.TrimSpace(studentName) == "" {
		return fmt.Errorf("학생 정보가 올바르지 않습니다")
	}
	return dm.writeStatExclusion(classNum, studentNum, studentName, model.StatExclusionMark{
		Excluded: excluded, UpdatedAt: time.Now().UTC().Format(statExclusionTimeLayout),
	}, false)
}

// MergeStudentStatExclusion 취합자료·배포자료의 표시를 반영한다. 지금 기록보다 최근에 바꾼 것만 받는다.
func (dm *DBManager) MergeStudentStatExclusion(classNum int, studentNum, studentName string, mark model.StatExclusionMark) error {
	if classNum < 1 || strings.TrimSpace(studentNum) == "" || strings.TrimSpace(studentName) == "" {
		return fmt.Errorf("학생 정보가 올바르지 않습니다")
	}
	return dm.writeStatExclusion(classNum, studentNum, studentName, mark, true)
}

func (dm *DBManager) writeStatExclusion(classNum int, studentNum, studentName string, mark model.StatExclusionMark, onlyNewer bool) error {
	if err := dm.InitClassDB(classNum); err != nil {
		return err
	}
	db, err := dm.OpenDB(dm.classDBPath(classNum))
	if err != nil {
		return err
	}
	defer db.Close()
	return UpsertStatExclusion(db, studentNum, studentName, mark, onlyNewer)
}

// UpsertStatExclusion 은 열린 학급 DB에 표시를 쓴다. onlyNewer 이면 지금 기록보다 최근 시각일 때만 덮어쓴다
// (배포자료 재가져오기에서 임시 학급 DB 사본에 쓸 때도 쓴다).
func UpsertStatExclusion(db *sql.DB, studentNum, studentName string, mark model.StatExclusionMark, onlyNewer bool) error {
	excluded := 0
	if mark.Excluded {
		excluded = 1
	}
	updatedAt := strings.TrimSpace(mark.UpdatedAt)
	if updatedAt == "" {
		updatedAt = time.Now().UTC().Format(statExclusionTimeLayout)
	}
	query := `INSERT INTO student_stat_exclusions (student_num, student_name, excluded, updated_at) VALUES (?, ?, ?, ?)
		ON CONFLICT(student_num, student_name) DO UPDATE SET excluded = excluded.excluded, updated_at = excluded.updated_at`
	if onlyNewer {
		query += ` WHERE excluded.updated_at > student_stat_exclusions.updated_at`
	}
	_, err := db.Exec(query, studentNum, studentName, excluded, updatedAt)
	return err
}

// ReadStatExclusions 학급 DB의 모든 표시(해제 기록 포함). 예전 학급 DB에 표가 없으면 빈 목록.
func ReadStatExclusions(db *sql.DB) map[[2]string]model.StatExclusionMark {
	out := map[[2]string]model.StatExclusionMark{}
	rows, err := db.Query(`SELECT student_num, student_name, excluded, updated_at FROM student_stat_exclusions`)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var num, name, updatedAt string
		var excluded int
		if rows.Scan(&num, &name, &excluded, &updatedAt) == nil {
			out[[2]string{num, name}] = model.StatExclusionMark{Excluded: excluded == 1, UpdatedAt: updatedAt}
		}
	}
	return out
}

// statExcludedSet 학교 전체에서 통계 제외로 표시된 학생(반|번호|이름).
func (dm *DBManager) statExcludedSet() map[string]bool {
	set := map[string]bool{}
	config, err := dm.GetSchoolConfig()
	if err != nil {
		return set
	}
	for classNum := 1; classNum <= config.ClassCount; classNum++ {
		db, err := dm.OpenDB(dm.classDBPath(classNum))
		if err != nil {
			continue
		}
		for key, mark := range ReadStatExclusions(db) {
			if mark.Excluded {
				set[statExclusionKey(classNum, key[0], key[1])] = true
			}
		}
		db.Close()
	}
	return set
}

// StatExcludedStudentKeys 통계 제외로 표시된 학생 "반|번호|이름" 목록(원서대장 점수 칸 "별도전형" 표시용, 사유 없음).
func (dm *DBManager) StatExcludedStudentKeys() []string {
	set := dm.statExcludedSet()
	keys := make([]string, 0, len(set))
	for k := range set {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

// ListStatExclusions 학년부장 확인 목록: 통계에서 뺀 학생(반·번호 순).
func (dm *DBManager) ListStatExclusions() ([]StatExclusion, error) {
	config, err := dm.GetSchoolConfig()
	if err != nil {
		return nil, err
	}
	var out []StatExclusion
	for classNum := 1; classNum <= config.ClassCount; classNum++ {
		db, err := dm.OpenDB(dm.classDBPath(classNum))
		if err != nil {
			continue
		}
		var rows []StatExclusion
		for key, mark := range ReadStatExclusions(db) {
			if mark.Excluded {
				rows = append(rows, StatExclusion{ClassNum: classNum, StudentNum: key[0], StudentName: key[1]})
			}
		}
		db.Close()
		sort.Slice(rows, func(i, j int) bool { return studentNumLess(rows[i].StudentNum, rows[j].StudentNum) })
		out = append(out, rows...)
	}
	return out, nil
}

func studentNumLess(a, b string) bool {
	na, ea := strconv.Atoi(a)
	nb, eb := strconv.Atoi(b)
	if ea == nil && eb == nil {
		return na < nb
	}
	return a < b
}

// GetStatsApplicationRecords 통계·내보내기용 원서 기록: 통계 제외 학생의 원서를 뺀다.
// 원서대장·지원현황·원서 관리처럼 학생 이름을 다루는 화면은 GetSchoolApplicationRecords 를 그대로 쓴다.
func (dm *DBManager) GetStatsApplicationRecords() ([]model.ApplicationRecord, error) {
	records, err := dm.GetSchoolApplicationRecords()
	if err != nil {
		return nil, err
	}
	excluded := dm.statExcludedSet()
	if len(excluded) == 0 {
		return records, nil
	}
	kept := records[:0:0]
	for _, r := range records {
		if !excluded[statExclusionKey(r.ClassNum, r.StudentNum, r.StudentName)] {
			kept = append(kept, r)
		}
	}
	return kept, nil
}

// CountStatExcludedApplications 그 학년도에 통계에서 뺀 원서 수(입시 분석 화면에 건수만 보인다).
func (dm *DBManager) CountStatExcludedApplications(admissionYear int) (int, error) {
	excluded := dm.statExcludedSet()
	if len(excluded) == 0 {
		return 0, nil
	}
	records, err := dm.GetSchoolApplicationRecords()
	if err != nil {
		return 0, err
	}
	count := 0
	for _, r := range records {
		if (admissionYear <= 0 || r.AdmissionYear == admissionYear) && excluded[statExclusionKey(r.ClassNum, r.StudentNum, r.StudentName)] {
			count++
		}
	}
	return count, nil
}
