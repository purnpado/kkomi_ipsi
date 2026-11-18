package database

import "testing"

func TestStudentWishlistSaveLoadDelete(t *testing.T) {
	dm := &DBManager{DataDir: t.TempDir()}
	if got, err := dm.GetStudentWishlist(1, "3", "가상학생"); err != nil || got != "[]" {
		t.Fatalf("처음에는 빈 목록이어야 합니다: %q %v", got, err)
	}
	items := `[{"schoolName":"울산마이스터고","track":"일반"}]`
	if err := dm.SaveStudentWishlist(1, "3", "가상학생", items); err != nil {
		t.Fatal(err)
	}
	if got, _ := dm.GetStudentWishlist(1, "3", "가상학생"); got != items {
		t.Fatalf("저장한 목록이 그대로 나와야 합니다: %q", got)
	}
	// 같은 번호라도 이름이 다르면 다른 학생(다음 학년도·전입 등)
	if got, _ := dm.GetStudentWishlist(1, "3", "다른학생"); got != "[]" {
		t.Fatalf("이름이 다른 학생에게 목록이 보이면 안 됩니다: %q", got)
	}
	if err := dm.SaveStudentWishlist(1, "3", "가상학생", "not json"); err == nil {
		t.Fatal("JSON 배열이 아니면 거부해야 합니다")
	}
	if err := dm.SaveStudentWishlist(1, "3", "가상학생", "[]"); err != nil {
		t.Fatal(err)
	}
	if got, _ := dm.GetStudentWishlist(1, "3", "가상학생"); got != "[]" {
		t.Fatalf("빈 배열을 저장하면 지워져야 합니다: %q", got)
	}
}
