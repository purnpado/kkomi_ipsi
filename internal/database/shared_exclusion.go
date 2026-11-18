package database

import (
	"database/sql"
	"strings"
)

// 관내 공유 자료 "통계에 넣지 않기".
// 받은 자료는 지우지 않고 보관하되, 학년부장이 학교 파일 전체나 의심되는 원서만 관내 통계·판정 근거에서 뺄 수 있다.
//   - shared_participating_schools.excluded : 학교·학년도 파일 전체 제외
//   - shared_anonymous_scores.self_excluded : 원서 한 건 제외(학년부장이 고른 것)
//   - shared_anonymous_scores.excluded      : 실제로 쓰는 값(파일 제외 또는 원서 제외). 집계 쿼리는 이 칸만 본다.
//   - shared_summary_stats.excluded         : 파일 제외를 따라간다(옛 형식 요약 자료용)
//
// 기준 학년도(SharedBaselineYear) 이전의 다른 학교 자료와 옛 형식(V1) 자료는 점검할 수 없거나 믿기 어려워
// 처음 받을 때 "통계 제외"로 둔다(우리 학교 자료는 해당 없음). 학년부장이 다시 넣을 수 있다.

// SharedBaselineYear 관내 공유 자료를 믿고 쌓기 시작한 고입 연도(2027 고입부터 점검을 거친 자료만 쌓는다).
const SharedBaselineYear = 2027

// migrateSharedExclusion 열을 추가하고, 처음 보는 파일에 기준 규칙을 적용한 뒤 실제 제외 값을 맞춘다.
func (dm *DBManager) migrateSharedExclusion(db *sql.DB) {
	_, _ = db.Exec(`ALTER TABLE shared_participating_schools ADD COLUMN excluded INTEGER NOT NULL DEFAULT 0`)
	_, _ = db.Exec(`ALTER TABLE shared_participating_schools ADD COLUMN reviewed INTEGER NOT NULL DEFAULT 0`)
	_, _ = db.Exec(`ALTER TABLE shared_anonymous_scores ADD COLUMN self_excluded INTEGER NOT NULL DEFAULT 0`)
	_, _ = db.Exec(`ALTER TABLE shared_anonymous_scores ADD COLUMN excluded INTEGER NOT NULL DEFAULT 0`)
	_, _ = db.Exec(`ALTER TABLE shared_summary_stats ADD COLUMN excluded INTEGER NOT NULL DEFAULT 0`)
	applySharedBaseline(db, dm.ownSchoolName())
	syncSharedExclusion(db)
}

func (dm *DBManager) ownSchoolName() string {
	if config, err := dm.GetSchoolConfig(); err == nil && config != nil {
		return strings.TrimSpace(config.SchoolName)
	}
	return ""
}

// applySharedBaseline 아직 기준 규칙을 적용하지 않은 파일(reviewed=0)에 기본 제외를 정한다.
func applySharedBaseline(db *sql.DB, ownSchool string) {
	_, _ = db.Exec(`UPDATE shared_participating_schools SET excluded = 1
		WHERE reviewed = 0 AND school_name <> ? AND (admission_year < ? OR format_version = 1)`, ownSchool, SharedBaselineYear)
	_, _ = db.Exec(`UPDATE shared_participating_schools SET reviewed = 1 WHERE reviewed = 0`)
}

// syncSharedExclusion 파일 제외·원서 제외를 합쳐 집계가 보는 excluded 값을 맞춘다.
func syncSharedExclusion(db *sql.DB) {
	_, _ = db.Exec(`UPDATE shared_anonymous_scores SET excluded = CASE
		WHEN self_excluded = 1 OR school_pkg_id IN (SELECT id FROM shared_participating_schools WHERE excluded = 1) THEN 1 ELSE 0 END`)
	_, _ = db.Exec(`UPDATE shared_summary_stats SET excluded = CASE
		WHEN school_pkg_id IN (SELECT id FROM shared_participating_schools WHERE excluded = 1) THEN 1 ELSE 0 END`)
}

// SetSharedPackageExcluded 학교·학년도 파일 전체를 관내 통계에서 빼거나 다시 넣는다.
func (dm *DBManager) SetSharedPackageExcluded(pkgID int64, excluded bool) error {
	return dm.withSharedDB(func(db *sql.DB) error {
		if _, err := db.Exec(`UPDATE shared_participating_schools SET excluded = ?, reviewed = 1 WHERE id = ?`, boolInt(excluded), pkgID); err != nil {
			return err
		}
		syncSharedExclusion(db)
		return nil
	})
}

// SetSharedRecordExcluded 원서 한 건을 관내 통계에서 빼거나 다시 넣는다.
func (dm *DBManager) SetSharedRecordExcluded(recordID int64, excluded bool) error {
	return dm.withSharedDB(func(db *sql.DB) error {
		if _, err := db.Exec(`UPDATE shared_anonymous_scores SET self_excluded = ? WHERE id = ?`, boolInt(excluded), recordID); err != nil {
			return err
		}
		syncSharedExclusion(db)
		return nil
	})
}

func (dm *DBManager) withSharedDB(fn func(db *sql.DB) error) error {
	if err := dm.InitSharedDatabaseTables(); err != nil {
		return err
	}
	db, err := dm.OpenDB(dm.GetConfigDBPath())
	if err != nil {
		return err
	}
	defer db.Close()
	return fn(db)
}

func boolInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
