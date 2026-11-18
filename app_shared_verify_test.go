package main

import (
	"testing"

	"PHGC/internal/database"
)

// 관내 공유 자료 점검 결과는 누구나 보고, 통계에서 빼기·다시 넣기는 학년부장만 한다.
func TestSharedVerifyAccess(t *testing.T) {
	dm := &database.DBManager{DataDir: t.TempDir()}
	dm.SetDataKey(make([]byte, 32))
	if err := dm.InitConfigDB(); err != nil {
		t.Fatal(err)
	}
	if err := dm.SaveSchoolConfig("권한중학교", 1, "x", false, 2027); err != nil {
		t.Fatal(err)
	}
	viewer := &App{db: dm, user: &database.User{Username: "jinro", Role: "viewer"}}
	homeroom := &App{db: dm, user: &database.User{Username: "301", Role: "homeroom", ClassNum: 1}}
	master := &App{db: dm, user: &database.User{Username: "admin", Role: "master"}}
	if _, err := viewer.VerifySharedData(); err != nil {
		t.Fatalf("진로부장도 점검 결과는 볼 수 있어야 합니다: %v", err)
	}
	for name, a := range map[string]*App{"진로부장": viewer, "담임": homeroom} {
		if err := a.SetSharedPackageExcluded(1, true); err == nil {
			t.Fatalf("%s는 파일 제외를 바꿀 수 없어야 합니다", name)
		}
		if err := a.SetSharedRecordExcluded(1, true); err == nil {
			t.Fatalf("%s는 원서 제외를 바꿀 수 없어야 합니다", name)
		}
	}
	if err := master.SetSharedPackageExcluded(1, true); err != nil {
		t.Fatalf("학년부장은 바꿀 수 있어야 합니다(없는 번호여도 오류 없이): %v", err)
	}
	if _, err := (&App{db: dm}).VerifySharedData(); err == nil {
		t.Fatal("로그인 전에는 볼 수 없어야 합니다")
	}
}
