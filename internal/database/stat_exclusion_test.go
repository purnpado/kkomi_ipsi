package database

import (
	"testing"

	"PHGC/internal/model"
)

// 입시 통계 제외 학생은 학교 통계·결과 확정 보관·인수인계에서 빠지고, 원서 기록 자체는 그대로 남는다.
func TestStatExclusionRemovesStudentFromStatistics(t *testing.T) {
	dm := newEvidenceTestDB(t)
	for _, rec := range []model.ApplicationRecord{
		{ClassNum: 1, StudentNum: "1", StudentName: "가상1", AdmissionYear: 2027, Category: "special", SchoolName: "울산공업고", Track: "일반", Status: "합격", Score: 90, AssignedDepartment: "기계과"},
		{ClassNum: 1, StudentNum: "2", StudentName: "가상2", AdmissionYear: 2027, Category: "special", SchoolName: "울산공업고", Track: "일반", Status: "합격", Score: 40, AssignedDepartment: "기계과"},
	} {
		if err := dm.SaveApplication(rec); err != nil {
			t.Fatal(err)
		}
	}
	if err := dm.SetStudentStatExclusion(1, "2", "가상2", true); err != nil {
		t.Fatal(err)
	}

	stats, err := dm.GetOurSchoolAnalysisStats(2027, "울산공업고", "", "일반", 1)
	if err != nil || stats == nil || stats.TotalApplicants != 1 || stats.AcceptedMin != 90 {
		t.Fatalf("통계 제외 학생(40점)이 합격 최저점에 들어가면 안 됩니다: %+v %v", stats, err)
	}
	all, _ := dm.GetSchoolApplicationRecords()
	if len(all) != 2 {
		t.Fatalf("원서 기록 자체는 남아야 합니다(원서대장·지원현황용): %d건", len(all))
	}
	if n, _ := dm.CountStatExcludedApplications(2027); n != 1 {
		t.Fatalf("뺀 원서 건수: %d", n)
	}
	history, err := dm.HistoryFromCurrentClasses(false)
	if err != nil || len(history) != 1 {
		t.Fatalf("인수인계(익명 기록)에도 들어가면 안 됩니다: %d건 %v", len(history), err)
	}
	if _, err := dm.snapshotAdmissionHistory(2027); err != nil {
		t.Fatal(err)
	}
	saved, _ := dm.GetAdmissionHistory()
	if len(saved) != 1 || saved[0].Score != 90 {
		t.Fatalf("결과 확정 보관에도 들어가면 안 됩니다: %+v", saved)
	}
	list, _ := dm.ListStatExclusions()
	if len(list) != 1 || list[0].StudentName != "가상2" || list[0].ClassNum != 1 {
		t.Fatalf("학년부장 확인 목록: %+v", list)
	}

	// 해제하면 다시 통계에 들어간다.
	if err := dm.SetStudentStatExclusion(1, "2", "가상2", false); err != nil {
		t.Fatal(err)
	}
	if stats, _ := dm.GetOurSchoolAnalysisStats(2027, "울산공업고", "", "일반", 1); stats == nil || stats.TotalApplicants != 2 {
		t.Fatalf("해제 뒤에는 다시 집계돼야 합니다: %+v", stats)
	}
}

// 취합자료·배포자료 병합은 더 최근에 바꾼 표시만 받는다(해제도 시각으로 비교).
func TestStatExclusionMergeKeepsNewer(t *testing.T) {
	dm := newEvidenceTestDB(t)
	if err := dm.MergeStudentStatExclusion(1, "5", "가상5", model.StatExclusionMark{Excluded: true, UpdatedAt: "2026-11-10 09:00:00"}); err != nil {
		t.Fatal(err)
	}
	// 더 오래된 해제는 무시
	_ = dm.MergeStudentStatExclusion(1, "5", "가상5", model.StatExclusionMark{Excluded: false, UpdatedAt: "2026-11-01 09:00:00"})
	if mark, _ := dm.GetStudentStatExclusion(1, "5", "가상5"); mark == nil || !mark.Excluded {
		t.Fatalf("오래된 해제가 최근 표시를 덮으면 안 됩니다: %+v", mark)
	}
	// 더 최근 해제는 반영
	_ = dm.MergeStudentStatExclusion(1, "5", "가상5", model.StatExclusionMark{Excluded: false, UpdatedAt: "2026-11-15 09:00:00"})
	if mark, _ := dm.GetStudentStatExclusion(1, "5", "가상5"); mark == nil || mark.Excluded {
		t.Fatalf("최근 해제는 반영돼야 합니다: %+v", mark)
	}
	// 취합자료 적용 경로
	change := model.PatchChange{ClassNum: 1, StudentNum: "5", StudentName: "가상5", StatExclusion: &model.StatExclusionMark{Excluded: true, UpdatedAt: "2026-11-16 09:00:00"}}
	if err := dm.ApplyPatchChange(change); err != nil {
		t.Fatal(err)
	}
	if mark, _ := dm.GetStudentStatExclusion(1, "5", "가상5"); mark == nil || !mark.Excluded {
		t.Fatalf("취합자료의 최근 표시가 반영돼야 합니다: %+v", mark)
	}
}
