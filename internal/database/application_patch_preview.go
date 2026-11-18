package database

import (
	"database/sql"
	"errors"

	"PHGC/internal/model"
)

// WouldSkipApplicationPatch mirrors the guarded UPSERT used during import.
func (dm *DBManager) WouldSkipApplicationPatch(r model.ApplicationRecord) (bool, error) {
	db, err := dm.OpenDB(dm.GetClassDBPath(r.ClassNum))
	if err != nil {
		return false, err
	}
	defer db.Close()
	var shouldApply bool
	err = db.QueryRow(`SELECT COALESCE(julianday(?) > julianday(updated_at), 0)
		FROM student_applications WHERE student_num=? AND student_name=? AND admission_year=? AND category=? AND school_name=? AND track=?`,
		r.UpdatedAt, r.StudentNum, r.StudentName, r.AdmissionYear, r.Category, r.SchoolName, r.Track).Scan(&shouldApply)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	return !shouldApply, err
}
