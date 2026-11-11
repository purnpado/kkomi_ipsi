package database

import (
	"strings"
	"testing"

	"PHGC/internal/parser"
)

// 학급 수가 바뀌면 담임 계정을 맞추고, 설정보다 큰 반의 자료는 저장 전에 막아야 한다.
func TestUpdateClassCountAndUploadGuard(t *testing.T) {
	dm := &DBManager{DataDir: t.TempDir()}
	dm.SetDataKey(make([]byte, 32))
	if err := dm.InitConfigDB(); err != nil {
		t.Fatal(err)
	}
	if err := dm.SaveSchoolConfig("테스트중학교", 10, "", false, 2027); err != nil {
		t.Fatal(err)
	}
	if err := dm.InitUsers(10, "admin-pw-1"); err != nil {
		t.Fatal(err)
	}
	// 11반 자료가 있으면 아무것도 저장하지 않고 안내한다.
	if err := dm.checkClassRange([]int{1, 11}); err == nil || !strings.Contains(err.Error(), "11반") {
		t.Fatalf("11반 자료를 막아야 함: %v", err)
	}
	homerooms := func() map[string]bool {
		users, _ := dm.GetUsers()
		out := map[string]bool{}
		for _, u := range users {
			if u.Role == "homeroom" {
				out[u.Username] = true
			}
		}
		return out
	}
	if err := dm.UpdateClassCount(11); err != nil {
		t.Fatal(err)
	}
	if h := homerooms(); len(h) != 11 || !h["311"] {
		t.Fatalf("11개 반 담임 계정: %v", h)
	}
	if err := dm.checkClassRange([]int{11}); err != nil {
		t.Fatalf("학급 수를 바꾼 뒤에는 11반을 받아야 함: %v", err)
	}
	if err := dm.SaveClassStudents(11, []parser.StudentExcelData{{ClassNum: 11, StudentNum: "1", Name: "새학생"}}); err != nil {
		t.Fatal(err)
	}
	all, err := dm.GetAllStudents(11)
	if err != nil || len(all[11]) != 1 {
		t.Fatalf("11반 학생이 석차 계산 대상에 들어가야 함: %v %v", all, err)
	}
	if err := dm.UpdateClassCount(8); err != nil {
		t.Fatal(err)
	}
	if h := homerooms(); len(h) != 8 || h["309"] || h["311"] {
		t.Fatalf("8개 반으로 줄인 뒤 담임 계정: %v", h)
	}
	cfg, _ := dm.GetSchoolConfig()
	if cfg.ClassCount != 8 {
		t.Fatalf("학급 수 = %d, want 8", cfg.ClassCount)
	}
}
