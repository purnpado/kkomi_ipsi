package database

import (
	"fmt"
	"math"
	"reflect"
	"time"

	"PHGC/internal/model"
)

// 취합 병합 원서 분류. 원칙: 학년부장 PC가 최종본이고 담임 취합 파일은 "바꿔 달라는 요청"이다.
//   - 학년부장이 배포 뒤 고치거나 지운 원서는 담임 파일이 저절로 덮거나 되살리지 못한다(골라야만 바뀜).
//   - 담임만 고친 원서·새 원서는 기본으로 반영한다.
//   - 담임이 지우거나 학교·전형을 바꾼 원서는 상세 검토에서 기본으로 반영하고, 일괄 병합에서는 두고 알린다.
//   - 확정된 학년도 원서는 건너뛴다(병합 전체가 실패하지 않게).
// 배포 시각(BaseDistributedAt)이 없는 예전 버전 파일은 예전처럼 "더 최근에 고친 쪽"만 반영하고 학년부장 원서를 지우지 않는다.

// 원서 분류 이름
const (
	PatchKindNew             = "new"              // 담임이 새로 넣은 원서
	PatchKindUpdate          = "update"           // 담임만 고친 원서
	PatchKindConflictEdit    = "conflict_edit"    // 학년부장이 배포 뒤 고쳤고 담임도 고침
	PatchKindGHDeleted       = "gh_deleted"       // 학년부장이 배포 뒤 지웠는데 담임은 고침
	PatchKindTeacherDeleted  = "teacher_deleted"  // 담임이 지움(학년부장은 손대지 않음)
	PatchKindConflictDeleted = "conflict_deleted" // 담임이 지웠는데 학년부장이 배포 뒤 고침
	PatchKindRename          = "rename"           // 담임이 학교·전형을 바꿈(학년부장은 옛 원서에 손대지 않음)
	PatchKindRenameConflict  = "rename_conflict"  // 담임이 학교·전형을 바꿨는데 학년부장이 옛 원서를 배포 뒤 고침
	PatchKindSuspect         = "suspect"          // 예전 버전 파일: 학교·전형을 바꾼 것으로 보이는 원서
	PatchKindGHMissing       = "gh_missing"       // 학년부장 PC에 없고 지운 기록도 없는 원서(학년부장이 예전 버전에서 지웠거나 PC 시계 차이)
)

// PatchBase 취합 파일의 기준 정보(배포 시각·형식 판).
type PatchBase struct {
	DistributedAt string // 학년부장 PC 시계
	ReceivedAt    string // 담임 PC 시계(이 배포자료로 처음 로그인한 때), 없으면 DistributedAt으로 비교
	FormatVersion int
}

// teacherSince 담임 쪽 시각(원서 수정·지운 시각)을 비교할 기준.
func (b PatchBase) teacherSince() string {
	if b.ReceivedAt != "" {
		return b.ReceivedAt
	}
	return b.DistributedAt
}

// HasBase 배포 시각이 있는 새 형식 파일인지.
func (b PatchBase) HasBase() bool { return b.FormatVersion >= 2 && b.DistributedAt != "" }

// patchPlanEntry 한 원서 항목과 그 처리에 필요한 실제 자료.
type patchPlanEntry struct {
	item  model.PatchAppItem
	bulk  string                   // 여러 반 일괄 병합 때 처리
	write *model.ApplicationRecord // 담임 원서(반영할 때 씀)
	drop  *model.ApplicationKey    // 학년부장 원서 이름표(지울 때 씀)
}

// PatchPlanResult 한 학생 원서 분류 결과.
type PatchPlanResult struct {
	entries []patchPlanEntry
	Kept    int // 담임 파일에 없어 그대로 두는 학년부장 원서
	Silent  int // 학년부장 최종본이라 조용히 건너뛰는 원서(확정 학년도 포함)
}

// Items 화면에 보일 원서 항목.
func (r PatchPlanResult) Items() []model.PatchAppItem {
	out := make([]model.PatchAppItem, 0, len(r.entries))
	for _, e := range r.entries {
		out = append(out, e.item)
	}
	return out
}

// ReviewCount 학년부장이 골라야 하는 항목 수.
func (r PatchPlanResult) ReviewCount() int {
	n := 0
	for _, e := range r.entries {
		if e.item.NeedsReview {
			n++
		}
	}
	return n
}

type kindRule struct {
	def, bulk string
	review    bool
	options   []string
}

var patchKindRules = map[string]kindRule{
	PatchKindNew:             {"apply", "apply", false, []string{"apply", "skip"}},
	PatchKindUpdate:          {"apply", "apply", false, []string{"apply", "skip"}},
	PatchKindConflictEdit:    {"keep", "keep", true, []string{"keep", "teacher"}},
	PatchKindGHDeleted:       {"keep", "keep", true, []string{"keep", "teacher"}},
	PatchKindTeacherDeleted:  {"delete", "keep", true, []string{"delete", "keep"}},
	PatchKindConflictDeleted: {"keep", "keep", true, []string{"keep", "delete"}},
	PatchKindRename:          {"replace", "keep", true, []string{"replace", "keep", "both"}},
	PatchKindRenameConflict:  {"keep", "keep", true, []string{"keep", "replace", "both"}},
	PatchKindSuspect:         {"both", "keep", true, []string{"both", "replace", "keep"}},
	PatchKindGHMissing:       {"keep", "keep", true, []string{"keep", "teacher"}},
}

func newPlanEntry(kind, id string, mine *model.ApplicationRecord, mineKey *model.ApplicationKey, theirs *model.ApplicationRecord, theirsDeleted *model.ApplicationKey) patchPlanEntry {
	rule := patchKindRules[kind]
	item := model.PatchAppItem{ID: id, Kind: kind, NeedsReview: rule.review, Default: rule.def, Options: rule.options}
	if mine != nil {
		item.Mine = summarizeApp(mine)
	}
	if theirs != nil {
		item.Theirs = summarizeApp(theirs)
	} else if theirsDeleted != nil {
		item.Theirs = &model.PatchAppSummary{AdmissionYear: theirsDeleted.AdmissionYear, Category: theirsDeleted.Category, SchoolName: theirsDeleted.SchoolName, Track: theirsDeleted.Track, UpdatedAt: theirsDeleted.DeletedAt, Deleted: true}
	}
	return patchPlanEntry{item: item, bulk: rule.bulk, write: theirs, drop: mineKey}
}

func summarizeApp(r *model.ApplicationRecord) *model.PatchAppSummary {
	return &model.PatchAppSummary{AdmissionYear: r.AdmissionYear, Category: r.Category, SchoolName: r.SchoolName, Track: r.Track, Status: r.Status, AssignedDepartment: r.AssignedDepartment, ExtraRound: r.ExtraRound, UpdatedAt: r.UpdatedAt}
}

func appKeyString(year int, category, school, track string) string {
	return fmt.Sprintf("%d|%s|%s|%s", year, category, school, track)
}

func recordKey(r model.ApplicationRecord) string {
	return appKeyString(r.AdmissionYear, r.Category, r.SchoolName, r.Track)
}

func keyOf(r model.ApplicationRecord) *model.ApplicationKey {
	return &model.ApplicationKey{AdmissionYear: r.AdmissionYear, Category: r.Category, SchoolName: r.SchoolName, Track: r.Track}
}

// sameApplication 두 원서의 내용이 같은지(시각 제외) 본다.
func sameApplication(a, b model.ApplicationRecord) bool {
	prefsA, prefsB := a.Preferences, b.Preferences
	if len(prefsA) == 0 && len(prefsB) == 0 {
		prefsA, prefsB = nil, nil
	}
	return a.Status == b.Status && a.AssignedDepartment == b.AssignedDepartment && a.AssignedSchool == b.AssignedSchool &&
		a.FirstStageResult == b.FirstStageResult && a.ExtraRound == b.ExtraRound && a.ScoreBasis == b.ScoreBasis &&
		math.Abs(a.Score-b.Score) < 0.0005 && reflect.DeepEqual(prefsA, prefsB)
}

// PlanPatchApplications 한 학생의 담임 원서를 학년부장 PC 원서와 비교해 분류한다(아무것도 바꾸지 않음).
func (dm *DBManager) PlanPatchApplications(change model.PatchChange, base PatchBase) (PatchPlanResult, error) {
	var result PatchPlanResult
	mineList, err := dm.GetStudentApplications(change.ClassNum, change.StudentNum, change.StudentName)
	if err != nil {
		return result, err
	}
	mineTombs, err := dm.GetApplicationDeletions(change.ClassNum, change.StudentNum, change.StudentName, "")
	if err != nil {
		return result, err
	}
	closedCache := map[int]bool{}
	closed := func(year int) bool {
		if v, ok := closedCache[year]; ok {
			return v
		}
		v, _ := dm.IsAdmissionYearClosed(year)
		closedCache[year] = v
		return v
	}
	mine := map[string]*model.ApplicationRecord{}
	for i := range mineList {
		mine[recordKey(mineList[i])] = &mineList[i]
	}
	tombs := map[string]model.ApplicationKey{}
	for _, k := range mineTombs {
		tombs[appKeyString(k.AdmissionYear, k.Category, k.SchoolName, k.Track)] = k
	}
	D, R, hasBase := base.DistributedAt, base.teacherSince(), base.HasBase()
	marks := dm.mergeMarks(change.ClassNum, change.StudentNum, change.StudentName)
	// 학년부장이 배포 뒤 직접 고쳤는가: 취합 병합으로 쓴 원서(표시된 시각 그대로)는 학년부장이 고친 것으로 보지 않는다.
	ghChangedSince := func(g *model.ApplicationRecord) bool {
		return TimeAfter(g.UpdatedAt, D) && !SameDBTime(marks[recordKey(*g)], g.UpdatedAt)
	}
	touched := map[string]bool{} // 담임 파일이 다룬 학년부장 원서 이름표
	var news []int               // entries 안 새 원서 위치(짝 찾기용)

	for i := range change.Applications {
		t := change.Applications[i]
		t.ClassNum, t.StudentNum, t.StudentName, t.ID = change.ClassNum, change.StudentNum, change.StudentName, 0
		key := recordKey(t)
		touched[key] = true
		if closed(t.AdmissionYear) {
			result.Silent++
			continue
		}
		if g := mine[key]; g != nil {
			if sameApplication(t, *g) {
				continue
			}
			kind := ""
			if hasBase {
				ghChanged := ghChangedSince(g)
				tChanged := TimeAfter(t.UpdatedAt, R) || (!ghChanged && !SameDBTime(t.UpdatedAt, g.UpdatedAt))
				switch {
				case !tChanged:
				case ghChanged:
					kind = PatchKindConflictEdit
				default:
					kind = PatchKindUpdate
				}
			} else if TimeAfter(t.UpdatedAt, g.UpdatedAt) {
				kind = PatchKindUpdate
			}
			if kind == "" {
				result.Silent++
				continue
			}
			result.entries = append(result.entries, newPlanEntry(kind, "a:"+key, g, keyOf(*g), &t, nil))
			continue
		}
		gt, ghDeleted := tombs[key]
		kind := PatchKindNew
		if hasBase {
			switch {
			case ghDeleted && TimeAfter(gt.DeletedAt, D):
				kind = map[bool]string{true: PatchKindGHDeleted, false: ""}[TimeAfter(t.UpdatedAt, R)]
			case !TimeAfter(t.UpdatedAt, R) || !TimeAfter(t.UpdatedAt, D):
				// 배포 때 있던 원서로 보이는데 학년부장 PC에 없다(예전 버전에서 지움) — 또는 PC 시계 차이.
				// 조용히 빼지 않고 학년부장이 보게 한다(기본은 학년부장 것 유지).
				kind = PatchKindGHMissing
			}
		} else if ghDeleted {
			kind = map[bool]string{true: PatchKindGHDeleted, false: ""}[TimeAfter(t.UpdatedAt, gt.DeletedAt)]
		}
		if kind == "" {
			result.Silent++
			continue
		}
		var mineDeleted *model.ApplicationRecord
		if kind == PatchKindGHDeleted {
			mineDeleted = &model.ApplicationRecord{AdmissionYear: gt.AdmissionYear, Category: gt.Category, SchoolName: gt.SchoolName, Track: gt.Track, UpdatedAt: gt.DeletedAt}
		}
		entry := newPlanEntry(kind, "a:"+key, mineDeleted, nil, &t, nil)
		if mineDeleted != nil {
			entry.item.Mine.Deleted = true
		}
		result.entries = append(result.entries, entry)
		if kind == PatchKindNew {
			news = append(news, len(result.entries)-1)
		}
	}

	paired := map[int]bool{}
	for _, tt := range change.DeletedApplications {
		key := appKeyString(tt.AdmissionYear, tt.Category, tt.SchoolName, tt.Track)
		if hasBase && !TimeAfter(tt.DeletedAt, R) {
			continue // 배포 전에 학년부장이 지운 기록(배포 사본에 함께 들어온 것)
		}
		g := mine[key]
		if g == nil || touched[key] {
			continue
		}
		touched[key] = true
		if closed(tt.AdmissionYear) {
			result.Silent++
			continue
		}
		ghChanged := TimeAfter(g.UpdatedAt, tt.DeletedAt) && !SameDBTime(marks[key], g.UpdatedAt)
		if hasBase {
			ghChanged = ghChangedSince(g)
		}
		tomb := tt
		kind, pairKind := PatchKindTeacherDeleted, PatchKindRename
		if ghChanged {
			kind, pairKind = PatchKindConflictDeleted, PatchKindRenameConflict
		}
		// 학교·전형을 바꾸면 옛 이름표 기록과 새 원서가 같은 때 생긴다 → 한 쌍으로 묶는다.
		pairAt := -1
		for _, idx := range news {
			n := result.entries[idx].write
			if !paired[idx] && n.AdmissionYear == tt.AdmissionYear && TimeNear(n.UpdatedAt, tt.DeletedAt, 3*time.Second) {
				pairAt = idx
				break
			}
		}
		if pairAt >= 0 {
			paired[pairAt] = true
			n := result.entries[pairAt].write
			result.entries[pairAt] = newPlanEntry(pairKind, "r:"+key+">"+recordKey(*n), g, keyOf(*g), n, nil)
			continue
		}
		result.entries = append(result.entries, newPlanEntry(kind, "d:"+key, g, keyOf(*g), nil, &tomb))
	}

	// 예전 버전 파일: 같은 학년도·구분에 담임 쪽 새 원서와 학년부장 쪽 남는 원서가 있으면 바꾼 것으로 의심한다.
	suspectUsed := map[string]bool{}
	if base.FormatVersion < 2 {
		for _, idx := range news {
			n := result.entries[idx].write
			for i := range mineList {
				g := &mineList[i]
				k := recordKey(*g)
				if touched[k] || suspectUsed[k] || closed(g.AdmissionYear) || g.AdmissionYear != n.AdmissionYear || g.Category != n.Category {
					continue
				}
				suspectUsed[k] = true
				result.entries[idx] = newPlanEntry(PatchKindSuspect, "s:"+k+">"+recordKey(*n), g, keyOf(*g), n, nil)
				break
			}
		}
	}
	for i := range mineList {
		k := recordKey(mineList[i])
		if !touched[k] && !suspectUsed[k] && !closed(mineList[i].AdmissionYear) {
			result.Kept++
		}
	}
	return result, nil
}
