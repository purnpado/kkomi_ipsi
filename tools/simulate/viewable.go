package main

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"time"

	"golang.org/x/crypto/bcrypt"

	"PHGC/internal/crypto"
	"PHGC/internal/database"
)

// 시뮬레이션 결과를 실제 앱에서 열어 볼 수 있게, 참여 학교의 마지막 학년도 폴더를 복사해
// 앱 초기 설정과 같은 방식으로 시험용 계정·암호화 열쇠를 만든다(모두 가상 자료).
// 쓰는 법: 열람용/<학교>/data 폴더를 꼬미입시 실행 파일 옆 data 폴더로 복사한 뒤 학년부장으로 로그인한다.

const (
	viewAdminPassword  = "sim-admin-1"
	viewSharedPassword = "sim-shared-1"
)

func copyTree(src, dst string) error {
	return filepath.WalkDir(src, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(src, path)
		target := filepath.Join(dst, rel)
		if d.IsDir() {
			return os.MkdirAll(target, 0o700)
		}
		b, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		return os.WriteFile(target, b, 0o600)
	})
}

// makeViewable 한 학교 폴더를 로그인할 수 있는 data 폴더로 만든다.
func makeViewable(m *middleSchool, root string) (string, error) {
	dst := filepath.Join(root, "열람용", m.name, "data")
	if err := os.RemoveAll(dst); err != nil {
		return "", err
	}
	if err := copyTree(m.dm.DataDir, dst); err != nil {
		return "", err
	}
	dm := &database.DBManager{DataDir: dst}
	dm.SetDataKey(m.key)
	config, err := dm.GetSchoolConfig()
	if err != nil || config == nil {
		return "", fmt.Errorf("학교 설정 없음: %v", err)
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(viewAdminPassword), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	if err := dm.SaveSchoolConfig(config.SchoolName, config.ClassCount, string(hash), config.IsSmallSchool, config.AdmissionYear); err != nil {
		return "", err
	}
	if err := dm.InitUsers(config.ClassCount, viewAdminPassword); err != nil {
		return "", err
	}
	envelope, err := crypto.SealDataKeyForUser("admin", viewAdminPassword, m.key)
	if err != nil {
		return "", err
	}
	if err := crypto.SaveUserKeyEnvelope(dst, envelope); err != nil {
		return "", err
	}
	if err := crypto.SaveSharedKeyEnvelope(dst, viewSharedPassword, m.key); err != nil {
		return "", err
	}
	users, err := dm.GetUsers()
	if err != nil {
		return "", err
	}
	if err := database.SaveLoginIndex(dst, config.SchoolName, users); err != nil {
		return "", err
	}
	agreement, _ := json.Marshal(map[string]interface{}{"accepted": true, "acceptedAt": time.Now().Format(time.RFC3339), "version": "1.0"})
	if err := os.WriteFile(filepath.Join(dst, "agreement.json"), agreement, 0o600); err != nil {
		return "", err
	}
	if err := dm.SealAllDatabases(); err != nil {
		return "", err
	}
	return dst, nil
}

// exportViewable 참여 학교 전체를 열람용 폴더로 만들고 안내 파일을 남긴다.
func (sm *sim) exportViewable() error {
	var made []string
	for _, m := range sm.schools {
		if !m.participating || m.dm == nil {
			continue
		}
		dst, err := makeViewable(m, sm.root)
		if err != nil {
			return fmt.Errorf("%s 열람용 폴더: %w", m.name, err)
		}
		made = append(made, dst)
	}
	guide := fmt.Sprintf(`꼬미입시 가상 입시 시뮬레이션 열람용 자료 (모두 가상 자료)

학교별 data 폴더를 꼬미입시 실행 파일 옆 data 폴더로 복사한 뒤 실행하세요.
  - 윈도우: 꼬미입시.exe 와 같은 폴더의 data
  - 맥: 꼬미입시.app/Contents/MacOS/data
기존 data 폴더가 있으면 먼저 다른 이름으로 옮겨 두세요.

학년부장(admin) 비밀번호: %s
공용 데이터 암호: %s
(담임·진로부장 계정은 처음 로그인할 때 공용 데이터 암호를 씁니다)

만든 폴더:
`, viewAdminPassword, viewSharedPassword)
	for _, d := range made {
		guide += "  - " + d + "\n"
	}
	return os.WriteFile(filepath.Join(sm.root, "열람용", "안내.txt"), []byte(guide), 0o600)
}
