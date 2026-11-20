package database

import (
	"testing"

	"PHGC/internal/model"
)

// 학년부장 PC가 최종본인 취합 병합 규칙을 상황별로 확인한다.
const (
	tPre   = "2026-11-01 09:00:00" // 배포 전
	tDist  = "2026-11-10 09:00:00" // 배포 시각
	tAfter = "2026-11-15 09:00:00" // 배포 뒤
	tLater = "2026-11-16 09:00:00"
)

var newBase = PatchBase{DistributedAt: tDist, FormatVersion: 2}

func planApp(school, track, status, updatedAt string) model.ApplicationRecord {
	return model.ApplicationRecord{ClassNum: 1, StudentNum: "1", StudentName: "가상학생", AdmissionYear: 2027, Category: "special", SchoolName: school, Track: track, Status: status, UpdatedAt: updatedAt}
}

// ghSave 학년부장 PC에 원서를 넣고 수정 시각을 정한다.
func ghSave(t *testing.T, dm *DBManager, r model.ApplicationRecord) {
	t.Helper()
	if err := dm.SaveApplication(r); err != nil {
		t.Fatal(err)
	}
	execClass(t, dm, `UPDATE student_applications SET updated_at=? WHERE school_name=? AND track=?`, r.UpdatedAt, r.SchoolName, r.Track)
}

// ghDelete 학년부장 PC에서 원서를 지우고(트리거 기록) 지운 시각을 정한다. at이 비면 기록도 지운다(예전 버전에서 지운 경우).
func ghDelete(t *testing.T, dm *DBManager, school, track, at string) {
	t.Helper()
	execClass(t, dm, `DELETE FROM student_applications WHERE school_name=? AND track=?`, school, track)
	if at == "" {
		execClass(t, dm, `DELETE FROM application_deletions WHERE school_name=? AND track=?`, school, track)
		return
	}
	execClass(t, dm, `UPDATE application_deletions SET deleted_at=? WHERE school_name=? AND track=?`, at, school, track)
}

func execClass(t *testing.T, dm *DBManager, query string, args ...any) {
	t.Helper()
	db, err := dm.OpenDB(dm.GetClassDBPath(1))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.Exec(query, args...); err != nil {
		t.Fatal(err)
	}
}

func tomb(school, track, at string) model.ApplicationKey {
	return model.ApplicationKey{AdmissionYear: 2027, Category: "special", SchoolName: school, Track: track, DeletedAt: at}
}

func ghStatuses(t *testing.T, dm *DBManager) map[string]string {
	t.Helper()
	rows, err := dm.GetStudentApplications(1, "1", "가상학생")
	if err != nil {
		t.Fatal(err)
	}
	out := map[string]string{}
	for _, r := range rows {
		out[r.SchoolName+"/"+r.Track] = r.Status
	}
	return out
}

func TestPatchPlanKeepsGradeHeadFinal(t *testing.T) {
	tests := []struct {
		name       string
		setup      func(t *testing.T, dm *DBManager)
		apps       []model.ApplicationRecord
		deleted    []model.ApplicationKey
		base       PatchBase
		wantKinds  []string
		wantSilent int
		choose     PatchChooser      // nil이면 상세 검토 기본값
		want       map[string]string // 병합 뒤 학년부장 PC 원서(학교/전형 → 상태)
		wantHeld   int
	}{
		{
			name: "담임만 고친 원서는 반영",
			setup: func(t *testing.T, dm *DBManager) {
				ghSave(t, dm, planApp("울산공고", "일반전형", "지원예정", tPre))
			},
			apps:      []model.ApplicationRecord{planApp("울산공고", "일반전형", "지원완료", tAfter)},
			base:      newBase,
			wantKinds: []string{PatchKindUpdate},
			want:      map[string]string{"울산공고/일반전형": "지원완료"},
		},
		{
			name:      "새 원서는 반영",
			setup:     func(t *testing.T, dm *DBManager) {},
			apps:      []model.ApplicationRecord{planApp("울산공고", "일반전형", "지원완료", tAfter)},
			base:      newBase,
			wantKinds: []string{PatchKindNew},
			want:      map[string]string{"울산공고/일반전형": "지원완료"},
		},
		{
			name: "양쪽에서 고치면 학년부장 것 유지(담임 것이 더 최근이어도)",
			setup: func(t *testing.T, dm *DBManager) {
				ghSave(t, dm, planApp("울산공고", "일반전형", "합격", tAfter))
			},
			apps:      []model.ApplicationRecord{planApp("울산공고", "일반전형", "불합격", tLater)},
			base:      newBase,
			wantKinds: []string{PatchKindConflictEdit},
			want:      map[string]string{"울산공고/일반전형": "합격"},
		},
		{
			name: "양쪽에서 고쳤을 때 담임 것을 고르면 바뀜",
			setup: func(t *testing.T, dm *DBManager) {
				ghSave(t, dm, planApp("울산공고", "일반전형", "합격", tAfter))
			},
			apps:      []model.ApplicationRecord{planApp("울산공고", "일반전형", "불합격", tLater)},
			base:      newBase,
			wantKinds: []string{PatchKindConflictEdit},
			choose:    func(model.PatchAppItem, string) string { return "teacher" },
			want:      map[string]string{"울산공고/일반전형": "불합격"},
		},
		{
			name: "학년부장만 고친 원서는 담임 옛 값으로 덮이지 않음",
			setup: func(t *testing.T, dm *DBManager) {
				ghSave(t, dm, planApp("울산공고", "일반전형", "합격", tAfter))
			},
			apps:       []model.ApplicationRecord{planApp("울산공고", "일반전형", "지원완료", tPre)},
			base:       newBase,
			wantSilent: 1,
			want:       map[string]string{"울산공고/일반전형": "합격"},
		},
		{
			name: "학년부장이 배포 뒤 지운 원서는 되살아나지 않음",
			setup: func(t *testing.T, dm *DBManager) {
				ghSave(t, dm, planApp("울산공고", "일반전형", "지원완료", tPre))
				ghDelete(t, dm, "울산공고", "일반전형", tAfter)
			},
			apps:       []model.ApplicationRecord{planApp("울산공고", "일반전형", "지원완료", tPre)},
			base:       newBase,
			wantSilent: 1,
			want:       map[string]string{},
		},
		{
			name: "예전 버전에서 지운 원서(기록 없음)는 확인 필요로 보이고 기본은 되살리지 않음",
			setup: func(t *testing.T, dm *DBManager) {
				ghSave(t, dm, planApp("울산공고", "일반전형", "지원완료", tPre))
				ghDelete(t, dm, "울산공고", "일반전형", "")
			},
			apps:      []model.ApplicationRecord{planApp("울산공고", "일반전형", "지원완료", tPre)},
			base:      newBase,
			wantKinds: []string{PatchKindGHMissing},
			want:      map[string]string{},
		},
		{
			name: "두 번째 제출: 병합으로 받은 원서를 담임이 다시 고치면 충돌이 아니라 반영",
			setup: func(t *testing.T, dm *DBManager) {
				r := planApp("울산공고", "일반전형", "지원완료", tAfter)
				ghSave(t, dm, r)
				if err := dm.markMerged(r); err != nil {
					t.Fatal(err)
				}
			},
			apps:      []model.ApplicationRecord{planApp("울산공고", "일반전형", "합격", tLater)},
			base:      newBase,
			wantKinds: []string{PatchKindUpdate},
			want:      map[string]string{"울산공고/일반전형": "합격"},
		},
		{
			name:      "담임 PC 시계가 늦어도 새 원서를 조용히 빼지 않음",
			setup:     func(t *testing.T, dm *DBManager) {},
			apps:      []model.ApplicationRecord{planApp("울산공고", "일반전형", "지원완료", "2026-11-10 08:55:00")},
			base:      PatchBase{DistributedAt: tDist, ReceivedAt: "2026-11-10 08:50:00", FormatVersion: 2},
			wantKinds: []string{PatchKindGHMissing},
			choose:    func(model.PatchAppItem, string) string { return "teacher" },
			want:      map[string]string{"울산공고/일반전형": "지원완료"},
		},
		{
			name: "예전 버전 파일도 일괄 병합에서는 학년부장 것만 남김",
			setup: func(t *testing.T, dm *DBManager) {
				ghSave(t, dm, planApp("울산공고", "일반전형", "지원완료", tPre))
			},
			apps:      []model.ApplicationRecord{planApp("울산상고", "일반전형", "지원완료", tAfter)},
			base:      PatchBase{},
			wantKinds: []string{PatchKindSuspect},
			choose:    BulkPatchChooser,
			want:      map[string]string{"울산공고/일반전형": "지원완료"},
			wantHeld:  1,
		},
		{
			name: "학년부장이 지운 원서를 담임이 고치면 확인 필요, 기본은 지운 채로",
			setup: func(t *testing.T, dm *DBManager) {
				ghSave(t, dm, planApp("울산공고", "일반전형", "지원완료", tPre))
				ghDelete(t, dm, "울산공고", "일반전형", tAfter)
			},
			apps:      []model.ApplicationRecord{planApp("울산공고", "일반전형", "합격", tLater)},
			base:      newBase,
			wantKinds: []string{PatchKindGHDeleted},
			want:      map[string]string{},
		},
		{
			name: "담임이 지운 원서는 상세 검토 기본값으로 지움",
			setup: func(t *testing.T, dm *DBManager) {
				ghSave(t, dm, planApp("울산공고", "일반전형", "지원완료", tPre))
			},
			deleted:   []model.ApplicationKey{tomb("울산공고", "일반전형", tAfter)},
			base:      newBase,
			wantKinds: []string{PatchKindTeacherDeleted},
			want:      map[string]string{},
		},
		{
			name: "담임이 지운 원서도 일괄 병합에서는 그대로 둠",
			setup: func(t *testing.T, dm *DBManager) {
				ghSave(t, dm, planApp("울산공고", "일반전형", "지원완료", tPre))
			},
			deleted:   []model.ApplicationKey{tomb("울산공고", "일반전형", tAfter)},
			base:      newBase,
			wantKinds: []string{PatchKindTeacherDeleted},
			choose:    BulkPatchChooser,
			want:      map[string]string{"울산공고/일반전형": "지원완료"},
			wantHeld:  1,
		},
		{
			name: "담임이 지웠지만 학년부장이 배포 뒤 고친 원서는 남김",
			setup: func(t *testing.T, dm *DBManager) {
				ghSave(t, dm, planApp("울산공고", "일반전형", "합격", tAfter))
			},
			deleted:   []model.ApplicationKey{tomb("울산공고", "일반전형", tLater)},
			base:      newBase,
			wantKinds: []string{PatchKindConflictDeleted},
			want:      map[string]string{"울산공고/일반전형": "합격"},
		},
		{
			name: "담임이 학교를 바꾼 원서는 한 쌍으로 묶어 바꿈",
			setup: func(t *testing.T, dm *DBManager) {
				ghSave(t, dm, planApp("울산공고", "일반전형", "지원완료", tPre))
			},
			apps:      []model.ApplicationRecord{planApp("울산상고", "일반전형", "지원완료", tAfter)},
			deleted:   []model.ApplicationKey{tomb("울산공고", "일반전형", tAfter)},
			base:      newBase,
			wantKinds: []string{PatchKindRename},
			want:      map[string]string{"울산상고/일반전형": "지원완료"},
		},
		{
			name: "학교를 바꾼 원서도 일괄 병합에서는 학년부장 것 유지",
			setup: func(t *testing.T, dm *DBManager) {
				ghSave(t, dm, planApp("울산공고", "일반전형", "지원완료", tPre))
			},
			apps:      []model.ApplicationRecord{planApp("울산상고", "일반전형", "지원완료", tAfter)},
			deleted:   []model.ApplicationKey{tomb("울산공고", "일반전형", tAfter)},
			base:      newBase,
			wantKinds: []string{PatchKindRename},
			choose:    BulkPatchChooser,
			want:      map[string]string{"울산공고/일반전형": "지원완료"},
			wantHeld:  1,
		},
		{
			name: "예전 버전 파일: 바꾼 것으로 보이는 원서는 둘 다 남김",
			setup: func(t *testing.T, dm *DBManager) {
				ghSave(t, dm, planApp("울산공고", "일반전형", "지원완료", tPre))
			},
			apps:      []model.ApplicationRecord{planApp("울산상고", "일반전형", "지원완료", tAfter)},
			base:      PatchBase{},
			wantKinds: []string{PatchKindSuspect},
			want:      map[string]string{"울산공고/일반전형": "지원완료", "울산상고/일반전형": "지원완료"},
		},
		{
			name: "확정된 학년도 원서는 건너뛰고 병합은 실패하지 않음",
			setup: func(t *testing.T, dm *DBManager) {
				ghSave(t, dm, planApp("울산상고", "일반전형", "합격", tPre))
				if _, err := dm.CloseAdmissionYear(2027, "admin", ""); err != nil {
					t.Fatal(err)
				}
			},
			apps:       []model.ApplicationRecord{planApp("울산공고", "일반전형", "합격", tAfter)},
			base:       newBase,
			wantSilent: 1,
			want:       map[string]string{"울산상고/일반전형": "합격"},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			dm := newEvidenceTestDB(t)
			tt.setup(t, dm)
			change := model.PatchChange{ClassNum: 1, StudentNum: "1", StudentName: "가상학생", Applications: tt.apps, DeletedApplications: tt.deleted}
			plan, err := dm.PlanPatchApplications(change, tt.base)
			if err != nil {
				t.Fatal(err)
			}
			var kinds []string
			for _, item := range plan.Items() {
				kinds = append(kinds, item.Kind)
			}
			if len(kinds) != len(tt.wantKinds) || (len(kinds) > 0 && kinds[0] != tt.wantKinds[0]) || plan.Silent != tt.wantSilent {
				t.Fatalf("분류 %v (조용히 %d), 기대 %v (조용히 %d)", kinds, plan.Silent, tt.wantKinds, tt.wantSilent)
			}
			choose := tt.choose
			if choose == nil {
				choose = func(model.PatchAppItem, string) string { return "" } // 상세 검토 기본값
			}
			held, err := dm.ApplyPatchChangeWith(change, tt.base, choose)
			if err != nil {
				t.Fatalf("병합 실패: %v", err)
			}
			if tt.wantHeld > 0 && held != tt.wantHeld { // 일괄 병합에서만 세는 값
				t.Fatalf("확인 필요로 남긴 수 %d, 기대 %d", held, tt.wantHeld)
			}
			got := ghStatuses(t, dm)
			if len(got) != len(tt.want) {
				t.Fatalf("병합 뒤 원서 %v, 기대 %v", got, tt.want)
			}
			for k, v := range tt.want {
				if got[k] != v {
					t.Fatalf("병합 뒤 원서 %v, 기대 %v", got, tt.want)
				}
			}
		})
	}
}

// 화면에서 원서의 학교를 바꾸면 새 원서를 더하지 않고 제자리에서 고치고, 옛 이름표는 지운 원서 기록에 남는다.
func TestEditApplicationInPlaceRecordsOldKey(t *testing.T) {
	dm := newEvidenceTestDB(t)
	ghSave(t, dm, planApp("울산공고", "일반전형", "지원완료", tPre))
	rows, _ := dm.GetStudentApplications(1, "1", "가상학생")
	edited := planApp("울산상고", "일반전형", "지원완료", "")
	edited.ID = rows[0].ID
	if err := dm.SaveApplication(edited); err != nil {
		t.Fatal(err)
	}
	if got := ghStatuses(t, dm); len(got) != 1 || got["울산상고/일반전형"] != "지원완료" {
		t.Fatalf("제자리에서 고쳐야 합니다: %v", got)
	}
	tombs, err := dm.GetApplicationDeletions(1, "1", "가상학생", "")
	if err != nil || len(tombs) != 1 || tombs[0].SchoolName != "울산공고" {
		t.Fatalf("옛 이름표가 기록되어야 합니다: %+v %v", tombs, err)
	}
	// 같은 이름표로 다시 만들면 기록은 지워진다.
	ghSave(t, dm, planApp("울산공고", "일반전형", "지원예정", tPre))
	if tombs, _ := dm.GetApplicationDeletions(1, "1", "가상학생", ""); len(tombs) != 0 {
		t.Fatalf("다시 생긴 원서의 지운 기록은 없어져야 합니다: %+v", tombs)
	}
	// 이미 있는 학교·전형으로 바꾸면 거부한다.
	rows, _ = dm.GetStudentApplications(1, "1", "가상학생")
	for _, r := range rows {
		if r.SchoolName == "울산상고" {
			r.SchoolName = "울산공고"
			if err := dm.SaveApplication(r); err == nil {
				t.Fatal("같은 학교·전형 원서가 있으면 거부해야 합니다")
			}
		}
	}
}
