package database

import (
	"database/sql"
	"errors"
	"fmt"

	"PHGC/internal/model"
)

// 이중지원 금지: 그 학년도에 합격·최종 진학·등록 포기 원서가 있는 학생은 새 원서를 넣을 수 없다.
// 원서는 접수 뒤 반려되지 않고, "포기"는 합격 뒤 등록을 포기한 경우다(미진학과 다름).
// 이미 있는 원서(결과·배정 학과·최종 진학)는 고칠 수 있다. 불합격만 있는 학생(일반고 불합격 뒤 추가모집 등)은 막지 않는다.
// 결과가 "불합격"인 원서를 새로 적는 것은 새 지원이 아니라 지난 원서 기록이라 막지 않는다(입력 순서가 바뀐 경우).

// lockStatuses 새 원서를 막는 상태.
var lockStatuses = map[string]bool{"합격": true, "최종 진학": true, "포기": true}

// IsLockStatus 이중지원 금지로 새 원서를 막는 상태인지.
func IsLockStatus(status string) bool { return lockStatuses[status] }

// lockOf 원서 목록에서 그 학년도의 잠금 원서(합격·최종 진학·포기)를 찾는다. 미진학 구분은 원서가 아니므로 뺀다.
func lockOf(records []model.ApplicationRecord, year int) *model.ApplicationRecord {
	for i := range records {
		r := &records[i]
		if r.AdmissionYear == year && r.Category != "none" && IsLockStatus(r.Status) {
			return r
		}
	}
	return nil
}

// ErrDoubleApply 이중지원 금지로 새 원서를 넣지 못할 때.
var ErrDoubleApply = errors.New("이중지원 금지")

func doubleApplyError(year int, lock *model.ApplicationRecord) error {
	school := lock.SchoolName
	if school == "" {
		school = map[string]string{"general": "후기 일반고"}[lock.Category]
	}
	label := lock.Status
	if label == "포기" {
		label = "합격 후 등록 포기"
	}
	return fmt.Errorf("%w: %d 고입에 %s %s 원서가 있어 새 원서를 넣을 수 없습니다. 이미 있는 원서의 결과·배정 학과는 고칠 수 있고, 지난 불합격 원서는 결과를 불합격으로 해서 기록할 수 있습니다", ErrDoubleApply, year, school, label)
}

// checkNewApplicationAllowed 저장하려는 원서가 새 원서(같은 이름표 원서가 없음)이면 이중지원 금지를 확인한다.
func checkNewApplicationAllowed(db *sql.DB, record model.ApplicationRecord) error {
	if record.Category == "none" || record.Status == "불합격" {
		return nil
	}
	var same int
	if err := db.QueryRow(`SELECT COUNT(*) FROM student_applications WHERE student_num=? AND student_name=? AND admission_year=? AND category=? AND school_name=? AND track=?`,
		record.StudentNum, record.StudentName, record.AdmissionYear, record.Category, record.SchoolName, record.Track).Scan(&same); err != nil {
		return err
	}
	if same > 0 {
		return nil // 이미 있는 원서를 고침
	}
	var lock model.ApplicationRecord
	err := db.QueryRow(`SELECT category, IFNULL(school_name, ''), status FROM student_applications
		WHERE student_num=? AND student_name=? AND admission_year=? AND category<>'none' AND status IN ('합격','최종 진학','포기') LIMIT 1`,
		record.StudentNum, record.StudentName, record.AdmissionYear).Scan(&lock.Category, &lock.SchoolName, &lock.Status)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	return doubleApplyError(record.AdmissionYear, &lock)
}
