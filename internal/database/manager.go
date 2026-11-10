package database

import (
	"database/sql"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"PHGC/internal/crypto"
	_ "modernc.org/sqlite"
)

func (dm *DBManager) SealAllDatabases() error {
	if len(dm.dataKey) != 32 {
		return nil
	}
	files, err := filepath.Glob(filepath.Join(dm.DataDir, "*.db"))
	if err != nil {
		return err
	}
	password := hex.EncodeToString(dm.dataKey)
	for _, file := range files {
		// Every application DB connection is short-lived. Reopening it here lets
		// SQLite checkpoint its WAL before we encrypt the main database file.
		db, err := dm.OpenDB(file)
		if err != nil {
			return err
		}
		if _, err = db.Exec("PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE"); err != nil {
			db.Close()
			return fmt.Errorf("DB 종료 정리 실패: %w", err)
		}
		db.Close()
		if _, err := crypto.SealDatabaseFile(password, file); err != nil {
			return err
		}
		crypto.RemovePlainDatabaseArtifacts(file)
	}
	return nil
}

// UnsealAllDatabases restores the encrypted package only after a user has
// successfully opened their personal key envelope. Plain DB files exist only
// while the application is running and are sealed again during shutdown.
// Legacy *.db.phgc files are automatically converted to *.db.kkomi.
func (dm *DBManager) UnsealAllDatabases() error {
	if len(dm.dataKey) != 32 {
		return fmt.Errorf("데이터 잠금 키가 준비되지 않았습니다")
	}
	kkomiFiles, err := filepath.Glob(filepath.Join(dm.DataDir, "*.db.kkomi"))
	if err != nil {
		return err
	}
	legacyFiles, err := filepath.Glob(filepath.Join(dm.DataDir, "*.db.phgc"))
	if err != nil {
		return err
	}

	password := hex.EncodeToString(dm.dataKey)

	// 1. 표준 *.db.kkomi 파일 복원
	for _, encryptedPath := range kkomiFiles {
		workingPath := strings.TrimSuffix(encryptedPath, ".kkomi")
		if encStat, statErr := os.Stat(encryptedPath); statErr == nil {
			if workStat, workErr := os.Stat(workingPath); workErr == nil {
				// 최신 배포 패키지(.kkomi)가 기존 평문 DB보다 최신이면 새 배포본을 우선 복원
				if encStat.ModTime().After(workStat.ModTime()) {
					crypto.RemovePlainDatabaseArtifacts(workingPath)
				} else if filepath.Base(workingPath) == "config.db" && !HasSchoolConfigTable(workingPath) {
					crypto.RemovePlainDatabaseArtifacts(workingPath)
				} else {
					continue
				}
			}
		} else if !os.IsNotExist(statErr) {
			return statErr
		}
		if err := crypto.UnsealDatabaseFile(password, encryptedPath, workingPath); err != nil {
			return fmt.Errorf("암호화된 DB 열기 실패: %w", err)
		}
	}

	// 2. 레거시 *.db.phgc 파일 감지 시 복호화 후 즉시 *.db.kkomi 포맷으로 자동 마이그레이션
	for _, legacyPath := range legacyFiles {
		workingPath := strings.TrimSuffix(legacyPath, ".phgc")
		kkomiPath := workingPath + ".kkomi"

		needUnseal := true
		if legStat, statErr := os.Stat(legacyPath); statErr == nil {
			if workStat, workErr := os.Stat(workingPath); workErr == nil {
				if legStat.ModTime().After(workStat.ModTime()) {
					crypto.RemovePlainDatabaseArtifacts(workingPath)
				} else if filepath.Base(workingPath) == "config.db" && !HasSchoolConfigTable(workingPath) {
					crypto.RemovePlainDatabaseArtifacts(workingPath)
				} else {
					needUnseal = false
				}
			}
		} else if !os.IsNotExist(statErr) {
			return statErr
		}

		if needUnseal {
			if err := crypto.UnsealDatabaseFile(password, legacyPath, workingPath); err != nil {
				return fmt.Errorf("구버전 암호화 DB(.phgc) 변환 열기 실패: %w", err)
			}
		}

		// 평문 workingPath가 준비되었으므로 새 .kkomi 암호화 본을 즉시 생성하고 구버전 .phgc 삭제
		if _, statErr := os.Stat(workingPath); statErr == nil {
			if err := crypto.EncryptFileGCM(password, workingPath, kkomiPath); err == nil {
				_ = os.Remove(legacyPath)
			}
		}
	}

	return nil
}

func HasSchoolConfigTable(path string) bool {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return false
	}
	defer db.Close()
	var name string
	err = db.QueryRow("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'school_config'").Scan(&name)
	return err == nil
}

// DB 매니저
type DBManager struct {
	DataDir string
	dataKey []byte
}

func (dm *DBManager) SetDataKey(key []byte) {
	dm.dataKey = append(dm.dataKey[:0], key...)
}

// NewDBManager 데이터 디렉토리 경로를 설정하고 매니저를 반환 (폴더는 사전 생성하지 않고 지연 생성)
func NewDBManager() *DBManager {
	// 1차: 실행파일 위치 기준으로 data 폴더 시도
	exePath, err := os.Executable()
	if err != nil {
		exePath = "."
	}
	baseDir := filepath.Dir(exePath)
	dataDir := filepath.Join(baseDir, "data")

	// 공유폴더(UNC 경로) 또는 부모 경로 쓰기 불가능한 경우
	// 사용자 로컬 AppData 폴더에 데이터 저장
	if strings.HasPrefix(dataDir, `\\`) || !isDirWritable(baseDir) {
		homeDir, err := os.UserHomeDir()
		if err == nil {
			dataDir = filepath.Join(homeDir, ".neoeodigallae", "data")
		}
	}

	return &DBManager{DataDir: dataDir}
}

// isDirWritable 디렉토리 쓰기 권한 여부 확인 (하위 폴더를 강제 생성하지 않고 임시 파일로만 테스트)
func isDirWritable(dir string) bool {
	testFile := filepath.Join(dir, fmt.Sprintf(".write_test_%d_%d", os.Getpid(), time.Now().UnixNano()))
	f, err := os.Create(testFile)
	if err != nil {
		return false
	}
	f.Close()
	_ = os.Remove(testFile)
	return true
}

// GetConfigDBPath config.db 경로 반환
func (dm *DBManager) GetConfigDBPath() string {
	return filepath.Join(dm.DataDir, "config.db")
}

func (dm *DBManager) HasEncryptedConfigDB() bool {
	if _, err := os.Stat(dm.GetConfigDBPath() + ".kkomi"); err == nil {
		return true
	}
	_, err := os.Stat(dm.GetConfigDBPath() + ".phgc")
	return err == nil
}

// OpenDB SQLite 데이터베이스 연결 (필요 시 data 폴더 자동 생성)
func (dm *DBManager) OpenDB(dbPath string) (*sql.DB, error) {
	// Wails 바인딩은 화면 밖에서도 호출될 수 있다. 잠긴 암호화 패키지에
	// 대해 SQLite가 빈 .db를 자동 생성하는 것을 막는다.
	if len(dm.dataKey) != 32 {
		if _, err := os.Stat(dbPath + ".kkomi"); err == nil {
			return nil, fmt.Errorf("데이터 잠금을 먼저 해제해주세요")
		}
		if _, err := os.Stat(dbPath + ".phgc"); err == nil {
			return nil, fmt.Errorf("데이터 잠금을 먼저 해제해주세요")
		}
	}

	// 실제 DB 파일을 열 때 비로소 저장 디렉토리 생성
	if err := os.MkdirAll(filepath.Dir(dbPath), 0700); err != nil {
		return nil, fmt.Errorf("데이터 저장 디렉토리 생성 실패: %w", err)
	}

	db, err := sql.Open("sqlite", dbPath+"?_pragma=busy_timeout(5000)")
	if err != nil {
		return nil, fmt.Errorf("DB 연결 실패: %w", err)
	}
	// WAL 모드 활성화 (암호화 저장 계층 연결 전까지 기존 SQLite 동작 유지)
	_, err = db.Exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;")
	if err != nil {
		db.Close()
		return nil, fmt.Errorf("WAL 모드 설정 실패: %w", err)
	}
	return db, nil
}

// --- 학급별 성적 DB 관리 ---

// GetClassDBPath 학급별 DB 경로 반환
func (dm *DBManager) GetClassDBPath(classNum int) string {
	return filepath.Join(dm.DataDir, fmt.Errorf("class_%d.db", classNum).Error())
}
