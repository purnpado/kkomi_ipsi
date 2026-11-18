package main

import (
	"testing"

	"PHGC/internal/database"
)

func TestAssignedSchoolRejectsUnauthorizedUsers(t *testing.T) {
	for _, user := range []*database.User{nil, {Role: "viewer"}, {Role: "homeroom", ClassNum: 2}} {
		app := &App{user: user}
		if err := app.UpdateAssignedSchool(1, "1", "가상학생", "가상고"); err == nil {
			t.Fatalf("권한 없는 수정 허용: %+v", user)
		}
	}
}
