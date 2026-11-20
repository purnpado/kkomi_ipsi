package main

import (
	"testing"

	"PHGC/internal/database"
)

// 나이스 원서 입력 일람표·지원 원서 대조는 학생 이름이 들어가므로 담임은 본인 반만 본다.
func TestNiceRosterAccess(t *testing.T) {
	dm := &database.DBManager{DataDir: t.TempDir()}
	dm.SetDataKey(make([]byte, 32))
	if err := dm.InitConfigDB(); err != nil {
		t.Fatal(err)
	}
	if err := dm.SaveSchoolConfig("권한중학교", 2, "x", false, 2027); err != nil {
		t.Fatal(err)
	}
	homeroom := &App{db: dm, user: &database.User{Username: "301", Role: "homeroom", ClassNum: 1}}
	if _, err := homeroom.GetNiceRoster(2); err == nil {
		t.Fatal("담임이 다른 반 일람표를 보면 안 됩니다")
	}
	if _, err := homeroom.GetNiceRoster(0); err == nil {
		t.Fatal("담임이 전교 일람표를 보면 안 됩니다")
	}
	if _, err := homeroom.GetStudentNiceRows(2, "1", "가상"); err == nil {
		t.Fatal("담임이 다른 반 학생 대조를 보면 안 됩니다")
	}
	if _, err := homeroom.GetApplicationNiceRow(2, "1", "가상", "special", "울산상업고등학교", "일반"); err == nil {
		t.Fatal("담임이 다른 반 학생의 원서 대조표를 보면 안 됩니다")
	}
	if _, err := (&App{db: dm}).GetApplicationNiceRow(1, "1", "가상", "special", "울산상업고등학교", "일반"); err == nil {
		t.Fatal("로그인 전에는 원서 대조표를 볼 수 없어야 합니다")
	}
	if _, err := (&App{db: dm}).GetNiceRoster(1); err == nil {
		t.Fatal("로그인 전에는 볼 수 없어야 합니다")
	}
	if rows, err := homeroom.GetNiceRoster(1); err != nil || rows == nil {
		t.Fatalf("본인 반 일람표(원서 없음): %v %v", rows, err)
	}
}
