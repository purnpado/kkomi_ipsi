package database

import (
	"testing"
	"time"
)

// 나이스 자료를 올린 때를 반·종류마다 기록하고, 다시 올리면 새 시각으로 바꾼다.
func TestNiceUploadsRecordedPerClass(t *testing.T) {
	dm := newEvidenceTestDB(t)
	at := time.Date(2026, 11, 18, 9, 5, 0, 0, time.Local)
	niceUploadNow = func() time.Time { return at }
	t.Cleanup(func() { niceUploadNow = time.Now })

	dm.recordNiceUpload(1, NiceUploadGrades)
	dm.recordNiceUpload(1, NiceUploadAttendance)
	at = at.Add(48 * time.Hour)
	dm.recordNiceUpload(1, NiceUploadGrades) // 다시 올림

	list, err := dm.GetNiceUploads(1)
	if err != nil {
		t.Fatal(err)
	}
	got := map[string]string{}
	for _, u := range list {
		got[u.Kind] = u.UploadedAt
	}
	if len(list) != 2 || got[NiceUploadGrades] != "2026-11-20 09:05" || got[NiceUploadAttendance] != "2026-11-18 09:05" {
		t.Fatalf("1반 기록: %+v", list)
	}
	all, err := dm.GetNiceUploads(0)
	if err != nil || len(all) != 2 {
		t.Fatalf("전교(자료 없는 반은 빠짐): %+v %v", all, err)
	}
}
