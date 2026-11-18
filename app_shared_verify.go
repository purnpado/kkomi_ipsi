package main

import "PHGC/internal/database"

// 관내 공유 결과 → 자료 검증. 점검 결과는 누구나 보고, 통계에서 빼기·다시 넣기는 학년부장만.

// VerifySharedData 받은 관내 공유 자료 전체 점검(학생 정보 없음).
func (a *App) VerifySharedData() (*database.SharedVerifyReport, error) {
	if err := a.requireLogin(); err != nil {
		return nil, err
	}
	return a.db.VerifySharedData()
}

// SetSharedPackageExcluded 학교·학년도 파일 전체를 관내 통계·판정 근거에서 빼거나 다시 넣는다.
func (a *App) SetSharedPackageExcluded(pkgID int64, excluded bool) error {
	if err := a.requireMaster("관내 공유 자료 통계 제외"); err != nil {
		return err
	}
	return a.db.SetSharedPackageExcluded(pkgID, excluded)
}

// SetSharedRecordExcluded 원서 한 건을 관내 통계·판정 근거에서 빼거나 다시 넣는다.
func (a *App) SetSharedRecordExcluded(recordID int64, excluded bool) error {
	if err := a.requireMaster("관내 공유 자료 통계 제외"); err != nil {
		return err
	}
	return a.db.SetSharedRecordExcluded(recordID, excluded)
}
