package database

import (
	"database/sql"
	"fmt"

	"PHGC/internal/model"
)

// 원서 관리 화면의 일괄 처리(계획서 docs/application-management-plan.md).
// 모든 함수는 apply=false 면 바뀔 건수만 세고(미리보기), apply=true 면 실제로 바꾸고 되돌리기 기록을 남긴다.

// BulkSummary 일괄 처리 결과(미리보기 포함)
type BulkSummary struct {
	BatchID  string   `json:"batchId"`
	Changed  int      `json:"changed"`  // 만들거나 바꾼 원서 수
	Accepted int      `json:"accepted"` // 합격으로 바뀌는 원서 수
	Rejected int      `json:"rejected"` // 불합격으로 바뀌는 원서 수
	Removed  int      `json:"removed"`  // 전기고 합격으로 지운 일반고 원서 수
	Names    []string `json:"names"`    // 대상 학생(최대 60명, 미리보기 표시용)
}

const generalTrack = "후기 일반계고"

var earlyCategories = map[string]bool{"meister": true, "special": true, "self_foreign": true, "other": true, "out_province": true}

func (s *BulkSummary) addName(classNum int, studentNum, name string) {
	if len(s.Names) < 60 {
		s.Names = append(s.Names, fmt.Sprintf("%d반 %s번 %s", classNum, studentNum, name))
	}
}

func (dm *DBManager) ensureYearOpen(year int) error {
	if year < 2000 {
		return fmt.Errorf("고입 학년도가 올바르지 않습니다")
	}
	closed, err := dm.IsAdmissionYearClosed(year)
	if err != nil {
		return err
	}
	if closed {
		return fmt.Errorf("%d 고입 결과가 확정되어 원서를 바꿀 수 없습니다. 학년부장이 확정을 해제한 뒤 진행하세요", year)
	}
	return nil
}

// withClassTx 학급 DB 하나에서 트랜잭션으로 작업한다.
func (dm *DBManager) withClassTx(classNum int, fn func(db *sql.DB, tx *sql.Tx) error) error {
	if err := dm.InitClassDB(classNum); err != nil {
		return err
	}
	db, err := dm.OpenDB(dm.GetClassDBPath(classNum))
	if err != nil {
		return err
	}
	defer db.Close()
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err := fn(db, tx); err != nil {
		return err
	}
	return tx.Commit()
}

// BulkCreateGeneral 그 학년도 원서가 하나도 없는 학생에게 "후기 일반고 · 지원예정" 원서를 만든다.
func (dm *DBManager) BulkCreateGeneral(year int, classes []int, apply bool) (*BulkSummary, error) {
	if err := dm.ensureYearOpen(year); err != nil {
		return nil, err
	}
	summary := &BulkSummary{}
	if apply {
		summary.BatchID = newBatchID()
	}
	for _, classNum := range classes {
		if err := dm.InitClassDB(classNum); err != nil {
			return nil, err
		}
		students, err := dm.GetClassStudents(classNum)
		if err != nil {
			continue
		}
		db, err := dm.OpenDB(dm.GetClassDBPath(classNum))
		if err != nil {
			return nil, err
		}
		existing, err := yearRows(db, year)
		db.Close()
		if err != nil {
			return nil, err
		}
		has := map[string]bool{}
		for _, r := range existing {
			has[r.StudentNum+"|"+r.StudentName] = true
		}
		for _, s := range students {
			if has[s.StudentNum+"|"+s.Name] {
				continue
			}
			summary.Changed++
			summary.addName(classNum, s.StudentNum, s.Name)
			if !apply {
				continue
			}
			record := model.ApplicationRecord{ClassNum: classNum, StudentNum: s.StudentNum, StudentName: s.Name, AdmissionYear: year, Category: "general", Track: generalTrack, Status: "지원예정"}
			if snap, err := dm.GetStudentApplicationScoreSnapshot(classNum, s.StudentNum, s.Name, "general", "", generalTrack, true); err == nil && snap != nil {
				record.Score, record.ScoreBasis = snap.Score, snap.Basis
			}
			if err := dm.SaveApplication(record); err != nil {
				return nil, fmt.Errorf("%d반 %s번 일반고 원서를 만들지 못했습니다: %w", classNum, s.StudentNum, err)
			}
			row := bulkRow{StudentNum: s.StudentNum, StudentName: s.Name, AdmissionYear: year, Category: "general", Track: generalTrack}
			if err := dm.withClassTx(classNum, func(_ *sql.DB, tx *sql.Tx) error { return logBulk(tx, summary.BatchID, "created", row) }); err != nil {
				return nil, err
			}
		}
	}
	return summary, nil
}

// BulkSetSchoolResults 한 학교·전형 지원자의 결과를 한 번에 넣는다.
// mode "final": accepted 에 있는 학생은 합격(배정 학과가 있으면 함께), 나머지는 불합격.
//
//	합격자의 같은 학년도 일반고 원서는 지운다(울산: 전기고 합격자는 후기고에 지원할 수 없음).
//	단, 결과(합격·불합격)가 이미 있는 일반고 원서는 지우지 않는다(일반고 불합격 뒤 전기고 추가모집 합격).
//
// mode "first": accepted 는 1차 합격, 나머지는 1차 불합격(최종 불합격).
func (dm *DBManager) BulkSetSchoolResults(year int, classes []int, category, schoolName, track, mode string, accepted map[string]string, apply bool) (*BulkSummary, error) {
	if err := dm.ensureYearOpen(year); err != nil {
		return nil, err
	}
	if !earlyCategories[category] || schoolName == "" {
		return nil, fmt.Errorf("결과를 넣을 학교와 전형을 고르세요")
	}
	if mode != "final" && mode != "first" {
		return nil, fmt.Errorf("결과 종류가 올바르지 않습니다")
	}
	summary := &BulkSummary{}
	if apply {
		summary.BatchID = newBatchID()
	}
	for _, classNum := range classes {
		err := dm.withClassTx(classNum, func(db *sql.DB, tx *sql.Tx) error {
			rows, err := yearRows(db, year)
			if err != nil {
				return err
			}
			passed := map[string]bool{}
			for _, r := range rows {
				if r.Category != category || r.SchoolName != schoolName || r.Track != track {
					continue
				}
				key := StudentKey(classNum, r.StudentNum, r.StudentName)
				dept, isAccepted := accepted[key]
				status, first, assigned := r.Status, r.FirstStageResult, r.AssignedDepartment
				if mode == "final" {
					if isAccepted {
						status, assigned = "합격", firstNonEmpty(dept, r.AssignedDepartment)
						if first == "불합격" {
							first = "합격"
						}
					} else {
						status, assigned = "불합격", ""
					}
				} else if isAccepted {
					first = "합격"
					if status == "불합격" {
						status = "지원완료"
					}
				} else {
					first, status, assigned = "불합격", "불합격", ""
				}
				if status == r.Status && first == r.FirstStageResult && assigned == r.AssignedDepartment {
					continue
				}
				summary.Changed++
				if status == "합격" {
					summary.Accepted++
				} else if status == "불합격" {
					summary.Rejected++
				}
				summary.addName(classNum, r.StudentNum, r.StudentName)
				if mode == "final" && isAccepted {
					passed[r.StudentNum+"|"+r.StudentName] = true
				}
				if apply {
					if err := updateRowResult(tx, summary.BatchID, r, status, first, assigned); err != nil {
						return err
					}
				}
			}
			for _, r := range rows {
				// 결과가 이미 있는 일반고 원서(일반고 불합격 뒤 전기고 추가모집 합격 등)는 기록으로 남긴다.
				if r.Category == "general" && passed[r.StudentNum+"|"+r.StudentName] && pendingStatuses[r.Status] {
					summary.Removed++
					if apply {
						if err := deleteRow(tx, summary.BatchID, r); err != nil {
							return err
						}
					}
				}
			}
			return nil
		})
		if err != nil {
			return nil, err
		}
	}
	return summary, nil
}

// BulkSetGeneralResults 일반고 원서 결과: rejected 학생은 불합격, 결과가 아직 없는 나머지는 합격.
func (dm *DBManager) BulkSetGeneralResults(year int, classes []int, rejected map[string]bool, apply bool) (*BulkSummary, error) {
	if err := dm.ensureYearOpen(year); err != nil {
		return nil, err
	}
	summary := &BulkSummary{}
	if apply {
		summary.BatchID = newBatchID()
	}
	for _, classNum := range classes {
		err := dm.withClassTx(classNum, func(db *sql.DB, tx *sql.Tx) error {
			rows, err := yearRows(db, year)
			if err != nil {
				return err
			}
			for _, r := range rows {
				if r.Category != "general" {
					continue
				}
				target := ""
				if rejected[StudentKey(classNum, r.StudentNum, r.StudentName)] {
					target = "불합격"
				} else if pendingStatuses[r.Status] {
					target = "합격"
				}
				if target == "" || target == r.Status {
					continue
				}
				summary.Changed++
				if target == "합격" {
					summary.Accepted++
				} else {
					summary.Rejected++
				}
				summary.addName(classNum, r.StudentNum, r.StudentName)
				if apply {
					if err := updateRowResult(tx, summary.BatchID, r, target, r.FirstStageResult, r.AssignedDepartment); err != nil {
						return err
					}
				}
			}
			return nil
		})
		if err != nil {
			return nil, err
		}
	}
	return summary, nil
}

// LastBulkBatch 범위 안 학급들에서 가장 최근 일괄 처리 묶음 id(없으면 "")
func (dm *DBManager) LastBulkBatch(classes []int) (string, error) {
	last := ""
	for _, classNum := range classes {
		if err := dm.InitClassDB(classNum); err != nil {
			return "", err
		}
		db, err := dm.OpenDB(dm.GetClassDBPath(classNum))
		if err != nil {
			return "", err
		}
		var id sql.NullString
		err = db.QueryRow(`SELECT MAX(batch_id) FROM application_bulk_log`).Scan(&id)
		db.Close()
		if err == nil && id.Valid && id.String > last {
			last = id.String
		}
	}
	return last, nil
}

// UndoLastBulk 가장 최근 일괄 처리 묶음을 되돌린다. 되돌린 원서 수를 돌려준다.
func (dm *DBManager) UndoLastBulk(classes []int, year int) (int, error) {
	if err := dm.ensureYearOpen(year); err != nil {
		return 0, err
	}
	batchID, err := dm.LastBulkBatch(classes)
	if err != nil || batchID == "" {
		return 0, err
	}
	total := 0
	for _, classNum := range classes {
		db, err := dm.OpenDB(dm.GetClassDBPath(classNum))
		if err != nil {
			return total, err
		}
		n, err := undoBatchInDB(db, batchID)
		db.Close()
		if err != nil {
			return total, err
		}
		total += n
	}
	return total, nil
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if v != "" {
			return v
		}
	}
	return ""
}
