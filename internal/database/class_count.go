package database

import (
	"fmt"
	"sort"
	"strings"
)

// 학년도가 바뀌면 학급 수도 자주 바뀐다. 석차·대시보드·원서대장·지원통계·결과 확정·배포자료가 모두
// 학교 설정의 학급 수까지만 읽으므로, 학급 수를 바꿀 수 있어야 하고 설정보다 큰 반의 자료는 올리기 전에 막아야 한다.

// UpdateClassCount 학급 수를 바꾸고 담임 계정을 맞춘다.
// 늘어난 반은 담임 계정(예: 311)을 새로 만들고(배포자료로 활성화), 줄어든 반의 담임 계정은 지운다.
func (dm *DBManager) UpdateClassCount(classCount int) error {
	if classCount < 1 || classCount > 30 {
		return fmt.Errorf("학급 수는 1~30 사이여야 합니다")
	}
	db, err := dm.OpenDB(dm.GetConfigDBPath())
	if err != nil {
		return err
	}
	defer db.Close()
	res, err := db.Exec(`UPDATE school_config SET class_count = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1`, classCount)
	if err != nil {
		return fmt.Errorf("학급 수 저장 실패: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("학교 초기 설정을 먼저 완료해주세요")
	}
	for i := 1; i <= classCount; i++ {
		if _, err := db.Exec(`INSERT OR IGNORE INTO users (username, password_hash, role, class_num, must_change_password) VALUES (?, '', 'homeroom', ?, 1)`,
			fmt.Sprintf("3%02d", i), i); err != nil {
			return fmt.Errorf("%d반 담임 계정 생성 실패: %w", i, err)
		}
	}
	if _, err := db.Exec(`DELETE FROM users WHERE role = 'homeroom' AND class_num > ?`, classCount); err != nil {
		return fmt.Errorf("줄어든 반 담임 계정 정리 실패: %w", err)
	}
	for i := 1; i <= classCount; i++ {
		if err := dm.InitClassDB(i); err != nil {
			return err
		}
	}
	return nil
}

// checkClassRange 올리려는 자료의 반 번호가 학교 설정 학급 수 안에 있는지 저장 전에 확인한다.
func (dm *DBManager) checkClassRange(classNums []int) error {
	config, err := dm.GetSchoolConfig()
	if err != nil || config == nil {
		return err
	}
	var over []string
	sort.Ints(classNums)
	for _, c := range classNums {
		if c > config.ClassCount || c < 1 {
			over = append(over, fmt.Sprintf("%d반", c))
		}
	}
	if len(over) == 0 {
		return nil
	}
	return fmt.Errorf("자료에 %s이(가) 있지만 학교 설정은 %d개 반입니다. 학년부장 화면의 [학급 수 변경]에서 학급 수를 먼저 바꾼 뒤 다시 올려주세요",
		strings.Join(over, ", "), config.ClassCount)
}
