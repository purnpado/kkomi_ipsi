package database

import (
	"fmt"

	"PHGC/internal/model"
	"PHGC/internal/parser"
)

// PatchChooser 원서 항목마다 처리를 고른다. bulk는 일괄 병합 때 쓰는 처리다.
// 빈 문자열이나 고를 수 없는 처리를 돌려주면 항목의 기본값을 쓴다.
type PatchChooser func(item model.PatchAppItem, bulk string) string

// BulkPatchChooser 여러 반 일괄 병합: 골라야 하는 원서는 학년부장 것을 그대로 둔다.
func BulkPatchChooser(_ model.PatchAppItem, bulk string) string { return bulk }

// ApplyPatchChange 예전 방식(배포 시각 없음, 일괄 병합 기준)으로 담임 변경분을 반영한다.
func (dm *DBManager) ApplyPatchChange(change model.PatchChange) error {
	_, err := dm.ApplyPatchChangeWith(change, PatchBase{}, BulkPatchChooser)
	return err
}

// ApplyPatchChangeWith 담임 변경분을 반영한다. 원서는 PlanPatchApplications 분류에 choose로 고른 처리를 적용하고,
// 학년부장이 골라야 하는데 학년부장 것을 그대로 둔 원서 수를 돌려준다.
func (dm *DBManager) ApplyPatchChangeWith(change model.PatchChange, base PatchBase, choose PatchChooser) (int, error) {
	if change.ClassNum < 1 || change.StudentNum == "" || change.StudentName == "" {
		return 0, fmt.Errorf("변경분의 학생 정보가 올바르지 않습니다")
	}
	for _, record := range change.Applications {
		if record.StudentNum != "" && record.StudentNum != change.StudentNum {
			return 0, fmt.Errorf("지원 기록의 학생 번호가 변경분과 일치하지 않습니다")
		}
		if record.StudentName != "" && record.StudentName != change.StudentName {
			return 0, fmt.Errorf("지원 기록의 학생 이름이 변경분과 일치하지 않습니다")
		}
	}
	if change.Attendance != "" {
		if _, err := dm.UpdateStudentAttendance(change.ClassNum, []parser.StudentExcelData{{StudentNum: change.StudentNum, Name: change.StudentName, AttendanceData: change.Attendance}}); err != nil {
			return 0, err
		}
	}
	if change.Volunteer != "" {
		if _, err := dm.UpdateStudentVolunteer(change.ClassNum, []parser.StudentExcelData{{StudentNum: change.StudentNum, Name: change.StudentName, VolunteerData: change.Volunteer}}); err != nil {
			return 0, err
		}
	}
	if change.Extra != "" {
		if err := dm.UpdateStudentExtra(change.ClassNum, change.StudentNum, change.StudentName, change.Extra); err != nil {
			return 0, err
		}
	}
	held := 0
	if len(change.Applications) > 0 || len(change.DeletedApplications) > 0 {
		if choose == nil {
			choose = BulkPatchChooser
		}
		plan, err := dm.PlanPatchApplications(change, base)
		if err != nil {
			return 0, err
		}
		// 새 원서를 먼저 쓰고 옛 원서를 나중에 지운다(쓰기가 실패하면 옛 원서가 남도록).
		var writes []model.ApplicationRecord
		var drops []model.ApplicationKey
		for _, entry := range plan.entries {
			action := pickPatchAction(entry, choose)
			del, write := patchActionEffects(entry.item.Kind, action)
			if entry.item.NeedsReview && action == entry.bulk && !del && !write {
				held++ // 학년부장이 골라야 하는데 학년부장 것을 그대로 둔 원서
			}
			if write && entry.write != nil {
				writes = append(writes, *entry.write)
			}
			if del && entry.drop != nil {
				drops = append(drops, *entry.drop)
			}
		}
		for _, record := range writes {
			if record.UpdatedAt == "" {
				record.UpdatedAt = NowDBTime()
			}
			if err := dm.saveApplicationMode(record, saveForce); err != nil {
				return held, err
			}
			if err := dm.markMerged(record); err != nil {
				return held, err
			}
		}
		for _, key := range drops {
			if err := dm.deleteApplicationKey(change.ClassNum, change.StudentNum, change.StudentName, key); err != nil {
				return held, err
			}
		}
	}
	if change.StatExclusion != nil {
		// 입시 통계 제외 표시: 학년부장 PC 기록보다 최근에 바꾼 것만 받는다.
		if err := dm.MergeStudentStatExclusion(change.ClassNum, change.StudentNum, change.StudentName, *change.StatExclusion); err != nil {
			return held, err
		}
	}
	return held, nil
}

func pickPatchAction(entry patchPlanEntry, choose PatchChooser) string {
	action := choose(entry.item, entry.bulk)
	for _, option := range entry.item.Options {
		if option == action {
			return action
		}
	}
	return entry.item.Default
}

// patchActionEffects 처리 이름이 학년부장 원서를 지우는지(del), 담임 원서를 쓰는지(write) 알려 준다.
func patchActionEffects(kind, action string) (del, write bool) {
	switch kind {
	case PatchKindNew, PatchKindUpdate, PatchKindNewLocked:
		return false, action == "apply"
	case PatchKindConflictEdit, PatchKindGHDeleted, PatchKindGHMissing:
		return false, action == "teacher"
	case PatchKindTeacherDeleted, PatchKindConflictDeleted:
		return action == "delete", false
	case PatchKindRename, PatchKindRenameConflict, PatchKindSuspect:
		return action == "replace", action == "replace" || action == "both"
	}
	return false, false
}

// deleteApplicationKey 이름표가 정확히 같은 원서 한 건을 지운다(트리거가 지운 원서 기록을 남긴다).
func (dm *DBManager) deleteApplicationKey(classNum int, studentNum, studentName string, key model.ApplicationKey) error {
	closed, err := dm.IsAdmissionYearClosed(key.AdmissionYear)
	if err != nil {
		return err
	}
	if closed {
		return nil
	}
	db, err := dm.OpenDB(dm.GetClassDBPath(classNum))
	if err != nil {
		return err
	}
	defer db.Close()
	_, err = db.Exec(`DELETE FROM student_applications WHERE student_num=? AND student_name=? AND admission_year=? AND category=? AND school_name=? AND track=?`,
		studentNum, studentName, key.AdmissionYear, key.Category, key.SchoolName, key.Track)
	return err
}
