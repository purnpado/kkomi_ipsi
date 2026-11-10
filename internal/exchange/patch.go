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
	return crypto.EncryptPatchGCM(password, model.PatchFile{SourceUsername: username, ClassNum: classNum, Changes: changes}, outputPath)
}

// ImportTeacherPatch decrypts and applies only allowed teacher changes.
func ImportTeacherPatch(dm *database.DBManager, password, inputPath string) (int, error) {
	patch, err := crypto.DecryptPatchGCM(password, inputPath)
	if err != nil {
		return 0, err
	}
	if patch.ClassNum < 1 || patch.SourceUsername == "" {
		return 0, fmt.Errorf("변경분 파일 정보가 올바르지 않습니다")
	}
	for _, change := range patch.Changes {
		if change.ClassNum != patch.ClassNum {
			return 0, fmt.Errorf("변경분에 다른 학급 데이터가 포함되어 있습니다")
		}
		if err := dm.ApplyPatchChange(change); err != nil {
			return 0, err
		}
		if change.Attendance != "" || change.Volunteer != "" || change.Extra != "" {
			if err := dm.RefreshStudentSchoolScoreCache(change.ClassNum, change.StudentNum, change.StudentName); err != nil {
				return 0, err
			}
		}
	}
	// 담임 취합자료 병합 후 전교 석차 스냅샷 최신 갱신
	_ = dm.UpdateSchoolRankSnapshots()
	return len(patch.Changes), nil
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
			filtered.Applications = change.Applications
		}
		if filtered.Attendance == "" && filtered.Volunteer == "" && filtered.Extra == "" && len(filtered.Applications) == 0 {
			continue
		}
		if err := dm.ApplyPatchChange(filtered); err != nil {
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
	preview := model.PatchPreview{Path: inputPath, SourceUsername: patch.SourceUsername, ClassNum: patch.ClassNum, ChangeCount: len(patch.Changes), BaseRevision: patch.BaseRevision}
	for _, change := range patch.Changes {
		if change.ClassNum != patch.ClassNum {
			return model.PatchPreview{}, fmt.Errorf("변경분에 다른 학급 데이터가 포함되어 있습니다")
		}
		preview.StudentNames = append(preview.StudentNames, change.StudentName)
		preview.Items = append(preview.Items, model.PatchPreviewItem{
			StudentNum: change.StudentNum, StudentName: change.StudentName,
			Attendance: change.Attendance != "", Volunteer: change.Volunteer != "",
			Extra: change.Extra != "", Applications: len(change.Applications) > 0,
		})
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
