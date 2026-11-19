package main

import (
	"testing"

	"PHGC/internal/database"
)

// 입시 통계 제외는 민감한 정보: 진로부장은 보지도 못하고, 담임은 본인 반만, 확인 목록은 학년부장만.
func TestStatExclusionAccess(t *testing.T) {
	dm := &database.DBManager{DataDir: t.TempDir()}
	if err := dm.InitConfigDB(); err != nil {
		t.Fatal(err)
	}
	master := &App{db: dm, user: &database.User{Username: "admin", Role: "master"}}
	homeroom := &App{db: dm, user: &database.User{Username: "301", Role: "homeroom", ClassNum: 1}}
	viewer := &App{db: dm, user: &database.User{Username: "jinro", Role: "viewer"}}
	anonymous := &App{db: dm}

	if err := homeroom.SetStudentStatExclusion(1, "3", "가상3", true); err != nil {
		t.Fatalf("담임은 본인 반 학생을 바꿀 수 있어야 합니다: %v", err)
	}
	if err := homeroom.SetStudentStatExclusion(2, "3", "가상3", true); err == nil {
		t.Fatal("담임이 다른 반 학생을 바꾸면 안 됩니다")
	}
	if _, err := homeroom.GetStudentStatExclusion(2, "3", "가상3"); err == nil {
		t.Fatal("담임이 다른 반 학생 표시를 보면 안 됩니다")
	}
	for name, a := range map[string]*App{"진로부장": viewer, "로그인 전": anonymous} {
		if _, err := a.GetStudentStatExclusion(1, "3", "가상3"); err == nil {
			t.Fatalf("%s는 통계 제외 표시를 볼 수 없어야 합니다", name)
		}
		if err := a.SetStudentStatExclusion(1, "3", "가상3", false); err == nil {
			t.Fatalf("%s는 통계 제외 표시를 바꿀 수 없어야 합니다", name)
		}
	}
	if got, err := master.GetStudentStatExclusion(1, "3", "가상3"); err != nil || !got {
		t.Fatalf("학년부장은 전교생 표시를 볼 수 있어야 합니다: %v %v", got, err)
	}
	if _, err := homeroom.GetStatExclusionList(); err == nil {
		t.Fatal("확인 목록은 학년부장만 볼 수 있어야 합니다")
	}
}

// 원서대장 "별도전형" 표시: 공식 문서라 진로부장도 같은 목록을 받고, 담임은 본인 반만, 로그인 전에는 못 받는다.
func TestRegisterSeparateStudents(t *testing.T) {
	dm := &database.DBManager{DataDir: t.TempDir()}
	if err := dm.InitConfigDB(); err != nil {
		t.Fatal(err)
	}
	if err := dm.SaveSchoolConfig("가상중학교", 2, "admin-pw", false, 2027); err != nil {
		t.Fatal(err)
	}
	master := &App{db: dm, user: &database.User{Username: "admin", Role: "master"}}
	homeroom := &App{db: dm, user: &database.User{Username: "301", Role: "homeroom", ClassNum: 1}}
	viewer := &App{db: dm, user: &database.User{Username: "jinro", Role: "viewer"}}
	for _, c := range []int{1, 2} {
		if err := master.SetStudentStatExclusion(c, "3", "가상3", true); err != nil {
			t.Fatal(err)
		}
	}
	if err := master.SetStudentStatExclusion(2, "5", "가상5", false); err != nil {
		t.Fatal(err)
	}
	all, err := viewer.GetRegisterSeparateStudents()
	if err != nil || len(all) != 2 || all[0] != "1|3|가상3" || all[1] != "2|3|가상3" {
		t.Fatalf("진로부장도 같은 목록(해제한 학생 제외): %v %v", all, err)
	}
	own, err := homeroom.GetRegisterSeparateStudents()
	if err != nil || len(own) != 1 || own[0] != "1|3|가상3" {
		t.Fatalf("담임은 본인 반만: %v %v", own, err)
	}
	if _, err := (&App{db: dm}).GetRegisterSeparateStudents(); err == nil {
		t.Fatal("로그인 전에는 받을 수 없어야 합니다")
	}
}
