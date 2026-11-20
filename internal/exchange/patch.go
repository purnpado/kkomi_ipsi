package exchange

import (
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strconv"

	"PHGC/internal/crypto"
	"PHGC/internal/database"
	"PHGC/internal/model"
)

// ExportTeacherPatch writes an encrypted, class-scoped change package.
func ExportTeacherPatch(dm *database.DBManager, password, username string, classNum int, changes []model.PatchChange, outputPath string) error {
	if classNum < 1 || username == "" || len(changes) == 0 {
		return fmt.Errorf("변경분 내보내기 정보가 올바르지 않습니다")
	}
	for _, change := range changes {
		if change.ClassNum != classNum {
			return fmt.Errorf("다른 학급 변경분은 내보낼 수 없습니다")
		}
		for _, record := range change.Applications {
			if record.ClassNum != 0 && record.ClassNum != classNum {
				return fmt.Errorf("다른 학급 지원 기록은 내보낼 수 없습니다")
			}
			if record.StudentNum != "" && record.StudentNum != change.StudentNum {
				return fmt.Errorf("지원 기록의 학생 번호가 변경분과 일치하지 않습니다")
			}
		}
	}
	// 배포 시각을 함께 실어, 학년부장 PC가 "배포 뒤 누가 고쳤는지"를 가릴 수 있게 한다.
	distributedAt, _ := dm.GetClassMeta(classNum, database.MetaDistributedAt)
	receivedAt, _ := dm.GetClassMeta(classNum, database.MetaReceivedAt)
	file := model.PatchFile{SourceUsername: username, ClassNum: classNum, Changes: changes, FormatVersion: 2, BaseDistributedAt: distributedAt, BaseReceivedAt: receivedAt}
	return crypto.EncryptPatchGCM(password, file, outputPath)
}

func patchBase(patch model.PatchFile) database.PatchBase {
	return database.PatchBase{DistributedAt: patch.BaseDistributedAt, ReceivedAt: patch.BaseReceivedAt, FormatVersion: patch.FormatVersion}
}

// ImportTeacherPatch decrypts and applies only allowed teacher changes.
func ImportTeacherPatch(dm *database.DBManager, password, inputPath string) (int, error) {
	count, _, err := ImportTeacherPatchBulk(dm, password, inputPath)
	return count, err
}

// ImportTeacherPatchBulk 여러 반 일괄 병합: 학년부장이 골라야 하는 원서(지우기·바꾸기·양쪽에서 고침)는
// 학년부장 것을 그대로 두고 그 수를 돌려준다.
func ImportTeacherPatchBulk(dm *database.DBManager, password, inputPath string) (int, int, error) {
	patch, err := crypto.DecryptPatchGCM(password, inputPath)
	if err != nil {
		return 0, 0, err
	}
	if patch.ClassNum < 1 || patch.SourceUsername == "" {
		return 0, 0, fmt.Errorf("변경분 파일 정보가 올바르지 않습니다")
	}
	for _, change := range patch.Changes {
		if change.ClassNum != patch.ClassNum {
			return 0, 0, fmt.Errorf("변경분에 다른 학급 데이터가 포함되어 있습니다")
		}
	}
	review := 0
	for _, change := range patch.Changes {
		held, err := dm.ApplyPatchChangeWith(change, patchBase(patch), database.BulkPatchChooser)
		if err != nil {
			return 0, review, err
		}
		review += held
		if change.Attendance != "" || change.Volunteer != "" || change.Extra != "" {
			if err := dm.RefreshStudentSchoolScoreCache(change.ClassNum, change.StudentNum, change.StudentName); err != nil {
				return 0, review, err
			}
		}
	}
	// 담임 취합자료 병합 후 전교 석차 스냅샷 최신 갱신
	_ = dm.UpdateSchoolRankSnapshots()
	return len(patch.Changes), review, nil
}

// ImportTeacherPatchSelected applies only the categories explicitly selected
// by the grade head after previewing a teacher patch.
func ImportTeacherPatchSelected(dm *database.DBManager, password, inputPath string, selections []model.PatchMergeSelection) (int, error) {
	patch, err := crypto.DecryptPatchGCM(password, inputPath)
	if err != nil {
		return 0, err
	}
	if patch.ClassNum < 1 || patch.SourceUsername == "" {
		return 0, fmt.Errorf("변경분 파일 정보가 올바르지 않습니다")
	}
	selected := make(map[string]model.PatchMergeSelection, len(selections))
	for _, item := range selections {
		if item.StudentNum != "" {
			selected[item.StudentNum] = item
		}
	}
	applied := 0
	for _, change := range patch.Changes {
		if change.ClassNum != patch.ClassNum {
			return 0, fmt.Errorf("변경분에 다른 학급 데이터가 포함되어 있습니다")
		}
		choice, ok := selected[change.StudentNum]
		if !ok {
			continue
		}
		filtered := model.PatchChange{ClassNum: change.ClassNum, StudentNum: change.StudentNum, StudentName: change.StudentName}
		if choice.Attendance {
			filtered.Attendance = change.Attendance
		}
		if choice.Volunteer {
			filtered.Volunteer = change.Volunteer
		}
		if choice.Extra {
			filtered.Extra = change.Extra
		}
		if choice.Applications {
			// 원서 항목을 고르면 입시 통계 제외 표시도 함께 받는다(원서 통계에만 쓰이는 표시).
			filtered.Applications = change.Applications
			filtered.DeletedApplications = change.DeletedApplications
			filtered.StatExclusion = change.StatExclusion
		}
		if filtered.Attendance == "" && filtered.Volunteer == "" && filtered.Extra == "" && len(filtered.Applications) == 0 && len(filtered.DeletedApplications) == 0 && filtered.StatExclusion == nil {
			continue
		}
		actions := choice.ApplicationActions
		chooser := func(item model.PatchAppItem, _ string) string { return actions[item.ID] }
		if _, err := dm.ApplyPatchChangeWith(filtered, patchBase(patch), chooser); err != nil {
			return applied, err
		}
		if filtered.Attendance != "" || filtered.Volunteer != "" || filtered.Extra != "" {
			if err := dm.RefreshStudentSchoolScoreCache(filtered.ClassNum, filtered.StudentNum, filtered.StudentName); err != nil {
				return applied, err
			}
		}
		applied++
	}
	if applied == 0 {
		return 0, fmt.Errorf("병합할 변경 항목을 하나 이상 선택해주세요")
	}
	// 취합 항목 병합 후 전교 석차 스냅샷 최신 갱신
	_ = dm.UpdateSchoolRankSnapshots()
	return applied, nil
}

// InspectTeacherPatch decrypts only long enough to show safe merge metadata
// before the grade head decides whether to apply the changes.
func InspectTeacherPatch(dm *database.DBManager, password, inputPath string) (model.PatchPreview, error) {
	patch, err := crypto.DecryptPatchGCM(password, inputPath)
	if err != nil {
		return model.PatchPreview{}, err
	}
	if patch.ClassNum < 1 || patch.SourceUsername == "" {
		return model.PatchPreview{}, fmt.Errorf("변경분 파일 정보가 올바르지 않습니다")
	}
	preview := model.PatchPreview{Path: inputPath, SourceUsername: patch.SourceUsername, ClassNum: patch.ClassNum, ChangeCount: len(patch.Changes), BaseRevision: patch.BaseRevision,
		BaseDistributedAt: patch.BaseDistributedAt, Legacy: !patchBase(patch).HasBase(), FormatVersion: patch.FormatVersion}
	for _, change := range patch.Changes {
		if change.ClassNum != patch.ClassNum {
			return model.PatchPreview{}, fmt.Errorf("변경분에 다른 학급 데이터가 포함되어 있습니다")
		}
		item := model.PatchPreviewItem{
			StudentNum: change.StudentNum, StudentName: change.StudentName,
			Attendance: change.Attendance != "", Volunteer: change.Volunteer != "",
			Extra: change.Extra != "",
		}
		if len(change.Applications) > 0 || len(change.DeletedApplications) > 0 {
			plan, err := dm.PlanPatchApplications(change, patchBase(patch))
			if err != nil {
				return model.PatchPreview{}, err
			}
			item.ApplicationItems = plan.Items()
			item.KeptApplications = plan.Kept
			item.SilentSkipped = plan.Silent
			preview.SkippedApplications += plan.Silent
			preview.ReviewCount += plan.ReviewCount()
		}
		// 바꿀 원서가 없으면(모두 같거나 학년부장 것이 최종본) 원서 항목을 고를 필요가 없다.
		item.Applications = len(item.ApplicationItems) > 0 || change.StatExclusion != nil
		preview.StudentNames = append(preview.StudentNames, change.StudentName)
		preview.Items = append(preview.Items, item)
	}
	sort.Slice(preview.Items, func(i, j int) bool {
		numI, errI := strconv.Atoi(preview.Items[i].StudentNum)
		numJ, errJ := strconv.Atoi(preview.Items[j].StudentNum)
		if errI == nil && errJ == nil {
			return numI < numJ
		}
		return preview.Items[i].StudentNum < preview.Items[j].StudentNum
	})
	manifestBytes, err := os.ReadFile(crypto.ManifestPath(dm.DataDir))
	if err == nil {
		var manifest model.DataManifest
		if json.Unmarshal(manifestBytes, &manifest) == nil {
			preview.CurrentRevision = manifest.Revision
			preview.HasRevisionConflict = patch.BaseRevision > 0 && manifest.Revision > 0 && patch.BaseRevision != manifest.Revision
		}
	}
	return preview, nil
}
