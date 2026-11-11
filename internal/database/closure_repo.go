package database

import (
	"database/sql"
	"fmt"
	"os"
	"strings"
)

// AdmissionClosure records that one admission year has been finalized by the
// grade head.  It lives only in the school's encrypted configuration DB.
type AdmissionClosure struct {
	AdmissionYear  int    `json:"admissionYear"`
	Status         string `json:"status"`
	ClosedAt       string `json:"closedAt"`
	ClosedBy       string `json:"closedBy"`
	Note           string `json:"note"`
	CutoffsApplied int    `json:"cutoffsApplied"`
}

// AdmissionClosureReview is intentionally aggregate-only and helps prevent
// an admission year from being closed while applications remain in progress.
type AdmissionClosureReview struct {
	AdmissionYear  int `json:"admissionYear"`
	TotalRecorded  int `json:"totalRecorded"`
	PendingCount   int `json:"pendingCount"`
	AcceptedCount  int `json:"acceptedCount"`
	RejectedCount  int `json:"rejectedCount"`
	WithdrawnCount int `json:"withdrawnCount"`
	FinalCount     int `json:"finalCount"`
}

func (dm *DBManager) IsAdmissionYearClosed(admissionYear int) (bool, error) {
	// A class-only temporary DB may be used by imports/tests before the school
	// configuration database exists. In that state no admission year can be
	// closed yet, so writing the class record must remain possible.
	if _, err := os.Stat(dm.GetConfigDBPath()); os.IsNotExist(err) {
		return false, nil
	} else if err != nil {
		return false, err
	}
	db, err := dm.OpenDB(dm.GetConfigDBPath())
	if err != nil {
		return false, err
	}
	defer db.Close()
	var count int
	if err := db.QueryRow("SELECT COUNT(*) FROM admission_closures WHERE admission_year=? AND status='closed'", admissionYear).Scan(&count); err != nil {
		return false, err
	}
	return count > 0, nil
}

func (dm *DBManager) GetAdmissionClosure(admissionYear int) (*AdmissionClosure, error) {
	db, err := dm.OpenDB(dm.GetConfigDBPath())
	if err != nil {
		return nil, err
	}
	defer db.Close()
	var closure AdmissionClosure
	err = db.QueryRow(`SELECT admission_year,status,COALESCE(closed_at,''),closed_by,note,cutoffs_applied
		FROM admission_closures WHERE admission_year=?`, admissionYear).Scan(
		&closure.AdmissionYear, &closure.Status, &closure.ClosedAt, &closure.ClosedBy, &closure.Note, &closure.CutoffsApplied,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &closure, nil
}

func (dm *DBManager) GetAdmissionClosureReview(admissionYear int) (AdmissionClosureReview, error) {
	config, err := dm.GetSchoolConfig()
	if err != nil {
		return AdmissionClosureReview{}, err
	}
	review := AdmissionClosureReview{AdmissionYear: admissionYear}
	for classNum := 1; classNum <= config.ClassCount; classNum++ {
		db, err := dm.OpenDB(dm.GetClassDBPath(classNum))
		if err != nil {
			if os.IsNotExist(err) {
				continue
			}
			return review, err
		}
		rows, queryErr := db.Query(`SELECT status, COUNT(*) FROM student_applications WHERE admission_year=? GROUP BY status`, admissionYear)
		if queryErr != nil {
			db.Close()
			return review, queryErr
		}
		for rows.Next() {
			var status string
			var count int
			if err := rows.Scan(&status, &count); err != nil {
				rows.Close()
				db.Close()
				return review, err
			}
			review.TotalRecorded += count
			switch status {
			case "미입력", "지원희망", "지원 희망", "지원예정", "지원 예정", "지원완료", "지원 완료":
				review.PendingCount += count
			case "합격":
				review.AcceptedCount += count
			case "불합격":
				review.RejectedCount += count
			case "포기", "미진학":
				review.WithdrawnCount += count
			case "최종 진학":
				review.FinalCount += count
			}
		}
		rows.Close()
		db.Close()
	}
	return review, nil
}

// CloseAdmissionYear locks the finalized year and writes its result-derived
// cutoffs into the local reference table. Pending applications must first be
// recorded as a final result or withdrawal.
func (dm *DBManager) CloseAdmissionYear(admissionYear int, closedBy, note string) (AdmissionClosure, error) {
	review, err := dm.GetAdmissionClosureReview(admissionYear)
	if err != nil {
		return AdmissionClosure{}, err
	}
	if review.PendingCount > 0 {
		return AdmissionClosure{}, fmt.Errorf("지원 예정·지원 완료·미입력 기록이 %d건 남아 있습니다. 합격·불합격·포기·최종 진학으로 결과를 확정해주세요", review.PendingCount)
	}
	if review.TotalRecorded == 0 {
		return AdmissionClosure{}, fmt.Errorf("확정할 지원현황 기록이 없습니다")
	}
	if alreadyClosed, err := dm.IsAdmissionYearClosed(admissionYear); err != nil {
		return AdmissionClosure{}, err
	} else if alreadyClosed {
		return AdmissionClosure{}, fmt.Errorf("%d 고입 결과는 이미 확정되었습니다", admissionYear)
	}
	cutoffsApplied, err := dm.ApplyApplicationCutoffsForYear(admissionYear)
	if err != nil {
		return AdmissionClosure{}, err
	}
	// 그해 원서 기록을 이름·학번 없이 보관한다(새 학년·새 프로그램으로 넘어가도 분석·관내 공유가 이어지도록).
	if _, err := dm.snapshotAdmissionHistory(admissionYear); err != nil {
		return AdmissionClosure{}, fmt.Errorf("입시 결과 보관 실패: %w", err)
	}
	db, err := dm.OpenDB(dm.GetConfigDBPath())
	if err != nil {
		return AdmissionClosure{}, err
	}
	defer db.Close()
	_, err = db.Exec(`INSERT INTO admission_closures (admission_year,status,closed_by,note,cutoffs_applied)
		VALUES (?, 'closed', ?, ?, ?)`, admissionYear, closedBy, strings.TrimSpace(note), cutoffsApplied)
	if err != nil {
		return AdmissionClosure{}, err
	}
	return *mustGetAdmissionClosure(dm, admissionYear), nil
}

// mustGetAdmissionClosure is used after a successful local insert. It keeps
// the CloseAdmissionYear API compact without returning a partially populated
// record to the UI.
func mustGetAdmissionClosure(dm *DBManager, admissionYear int) *AdmissionClosure {
	closure, err := dm.GetAdmissionClosure(admissionYear)
	if err != nil {
		return &AdmissionClosure{AdmissionYear: admissionYear, Status: "closed"}
	}
	return closure
}

func (dm *DBManager) ReopenAdmissionYear(admissionYear int) error {
	db, err := dm.OpenDB(dm.GetConfigDBPath())
	if err != nil {
		return err
	}
	defer db.Close()
	result, err := db.Exec("DELETE FROM admission_closures WHERE admission_year=?", admissionYear)
	if err != nil {
		return err
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		return fmt.Errorf("%d 고입 확정 기록이 없습니다", admissionYear)
	}
	// 확정을 해제하면 그해 우리 학교 보관 기록도 지운다(다시 확정할 때 새로 보관).
	return dm.deleteLocalHistory(admissionYear)
}
