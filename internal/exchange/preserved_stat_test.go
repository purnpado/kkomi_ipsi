package exchange

import (
	"path/filepath"
	"testing"

	"PHGC/internal/database"
	"PHGC/internal/model"
)

// 배포자료를 다시 받을 때 입시 통계 제외 표시는 더 최근에 바꾼 쪽이 남는다.
func TestPreservedStatExclusionKeepsNewer(t *testing.T) {
	dm := &database.DBManager{DataDir: t.TempDir()}
	local := filepath.Join(dm.DataDir, "local.db")
	pkg := filepath.Join(dm.DataDir, "pkg.db")
	for _, p := range []string{local, pkg} {
		if err := dm.EnsureClassDBSchema(p); err != nil {
			t.Fatal(err)
		}
	}
	write := func(path, num string, mark model.StatExclusionMark) {
		db, err := dm.OpenDB(path)
		if err != nil {
			t.Fatal(err)
		}
		defer db.Close()
		if err := database.UpsertStatExclusion(db, num, "가상"+num, mark, false); err != nil {
			t.Fatal(err)
		}
	}
	// 1번: 담임 PC에서 더 최근에 켬 → 남아야 함. 2번: 학년부장이 더 최근에 해제 → 해제가 남아야 함.
	write(local, "1", model.StatExclusionMark{Excluded: true, UpdatedAt: "2026-11-15 10:00:00"})
	write(pkg, "1", model.StatExclusionMark{Excluded: false, UpdatedAt: "2026-11-10 10:00:00"})
	write(local, "2", model.StatExclusionMark{Excluded: true, UpdatedAt: "2026-11-01 10:00:00"})
	write(pkg, "2", model.StatExclusionMark{Excluded: false, UpdatedAt: "2026-11-12 10:00:00"})

	data, err := extractPreservedClassData(dm, local)
	if err != nil {
		t.Fatal(err)
	}
	if err := restorePreservedClassData(dm, pkg, data); err != nil {
		t.Fatal(err)
	}
	db, err := dm.OpenDB(pkg)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	got := database.ReadStatExclusions(db)
	if !got[[2]string{"1", "가상1"}].Excluded {
		t.Fatal("담임 PC에서 더 최근에 켠 표시가 남아야 합니다")
	}
	if got[[2]string{"2", "가상2"}].Excluded {
		t.Fatal("학년부장이 더 최근에 해제한 표시가 담임 PC의 옛 표시로 되살아나면 안 됩니다")
	}
}
