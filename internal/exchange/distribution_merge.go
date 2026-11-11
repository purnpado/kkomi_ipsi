package exchange

import (
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"PHGC/internal/crypto"
	"PHGC/internal/database"
)

// 담임·진로부장 PC에 새 배포자료를 다시 가져올 때, 기존 학급 DB의 상담 일지·원서·수기 비교과를
// 새 DB로 옮기는 기능이다. 로그인 전에는 자료가 암호화되어 있으므로 학교 데이터 키가 필요하다.
// 키는 이 PC의 공용 데이터 잠금 파일(shared-key.json) 또는 본인 잠금 파일(keys/*.json)을
// 사용자가 입력한 암호로 열어 얻는다. 키가 맞지 않거나 다른 학교 배포자료면 아무것도 지우지 않고 중단한다.

// ErrDistributionPasswordRequired 기존 학급 자료가 있어 병합용 암호가 필요할 때 돌려준다.
var ErrDistributionPasswordRequired = errors.New("이 PC에 기존 학급 자료가 있습니다. 상담 일지·원서 기록을 새 배포자료로 옮기려면 공용 데이터 암호 또는 본인 비밀번호를 입력해주세요")

// DistributionImportResult 배포자료 가져오기 결과와 옮긴 기존 자료 건수
type DistributionImportResult struct {
	Username            string `json:"username"`
	PreservedClasses    int    `json:"preservedClasses"`
	Applications        int    `json:"applications"`
	Counsels            int    `json:"counsels"`
	Overrides           int    `json:"overrides"`
	UnrestoredClasses   []int  `json:"unrestoredClasses"`
	BackupFolder        string `json:"backupFolder"`
	MergedWithLocalData bool   `json:"mergedWithLocalData"`
}

var classDBNamePattern = regexp.MustCompile(`^class_(\d+)\.db(\.kkomi|\.phgc)?$`)

// existingClassDBFiles 학급 번호별로 기존 학급 DB 파일을 찾는다.
// 같은 반에 여러 형태가 있으면 평문(.db) → .kkomi → .phgc 순으로 최신 것을 고른다.
func existingClassDBFiles(dataDir string) map[int]string {
	rank := map[string]int{"": 0, ".kkomi": 1, ".phgc": 2}
	type candidate struct {
		path string
		rank int
	}
	best := map[int]candidate{}
	entries, _ := os.ReadDir(dataDir)
	for _, entry := range entries {
		m := classDBNamePattern.FindStringSubmatch(entry.Name())
		if entry.IsDir() || m == nil {
			continue
		}
		classNum, _ := strconv.Atoi(m[1])
		if classNum < 1 {
			continue
		}
		c := candidate{path: filepath.Join(dataDir, entry.Name()), rank: rank[m[2]]}
		if prev, ok := best[classNum]; !ok || c.rank < prev.rank {
			best[classNum] = c
		}
	}
	found := make(map[int]string, len(best))
	for classNum, c := range best {
		found[classNum] = c.path
	}
	return found
}

// DistributionImportNeedsPassword 기존 학급 DB가 있어 병합용 암호가 필요한지 알려 준다.
func DistributionImportNeedsPassword(dm *database.DBManager) bool {
	return len(existingClassDBFiles(dm.DataDir)) > 0
}

// ResolveLocalDataKey 이 PC의 공용 잠금 파일 또는 개인 잠금 파일을 입력한 암호로 열어 학교 데이터 키를 얻는다.
func ResolveLocalDataKey(dataDir, password string) ([]byte, error) {
	if strings.TrimSpace(password) == "" {
		return nil, ErrDistributionPasswordRequired
	}
	if key, err := crypto.OpenSharedKeyEnvelope(dataDir, password); err == nil && len(key) == 32 {
		return key, nil
	}
	envelopes, _ := filepath.Glob(filepath.Join(dataDir, "keys", "*.json"))
	for _, path := range envelopes {
		username := strings.TrimSuffix(filepath.Base(path), ".json")
		envelope, err := crypto.LoadUserKeyEnvelope(dataDir, username)
		if err != nil {
			continue
		}
		if key, err := crypto.OpenDataKeyForUser(envelope, password); err == nil && len(key) == 32 {
			return key, nil
		}
	}
	return nil, fmt.Errorf("공용 데이터 암호 또는 본인 비밀번호가 올바르지 않습니다")
}

// plainCopyOfClassDB 기존 학급 DB를 임시 폴더에 평문으로 꺼내고 구조를 최신으로 맞춘다.
func plainCopyOfClassDB(dm *database.DBManager, source, tmpDir string, key []byte) (string, error) {
	plain := filepath.Join(tmpDir, "old_"+strings.TrimSuffix(strings.TrimSuffix(filepath.Base(source), ".kkomi"), ".phgc"))
	if filepath.Ext(source) == ".db" {
		if err := copyPackageFile(source, plain); err != nil {
			return "", err
		}
	} else if err := crypto.DecryptFileGCM(hex.EncodeToString(key), source, plain); err != nil {
		return "", fmt.Errorf("기존 학급 자료를 열 수 없습니다(암호 또는 학교가 다릅니다): %w", err)
	}
	if err := dm.EnsureClassDBSchema(plain); err != nil {
		return "", err
	}
	return plain, nil
}

// collectLocalClassData 기존 학급 DB들에서 보존할 자료를 꺼낸다.
func collectLocalClassData(dm *database.DBManager, tmpDir string, key []byte) (map[int]preservedClassData, error) {
	result := map[int]preservedClassData{}
	for classNum, source := range existingClassDBFiles(dm.DataDir) {
		plain, err := plainCopyOfClassDB(dm, source, tmpDir, key)
		if err != nil {
			return nil, err
		}
		data, err := extractPreservedClassData(dm, plain)
		if err != nil {
			return nil, fmt.Errorf("%d반 기존 자료 읽기 실패: %w", classNum, err)
		}
		if len(data.Apps) > 0 || len(data.Counsels) > 0 || len(data.Overrides) > 0 {
			result[classNum] = data
		}
	}
	return result, nil
}

// verifyPackageKey 새 배포자료의 DB가 이 PC의 학교 데이터 키로 열리는지 미리 확인한다(삭제 전 검사).
func verifyPackageKey(packageFiles map[string][]byte, tmpDir string, key []byte) error {
	for name, data := range packageFiles {
		if !strings.HasSuffix(name, ".db.kkomi") && !strings.HasSuffix(name, ".db.phgc") {
			continue
		}
		enc := filepath.Join(tmpDir, "verify_"+name)
		if err := os.WriteFile(enc, data, 0600); err != nil {
			return err
		}
		if err := crypto.DecryptFileGCM(hex.EncodeToString(key), enc, enc+".plain"); err != nil {
			return fmt.Errorf("새 배포자료가 이 PC의 학교 자료와 다른 암호로 만들어졌습니다. 같은 학교의 배포자료인지 확인해주세요")
		}
		return nil
	}
	return nil
}

// mergeLocalDataIntoPackage 새로 저장한 배포자료의 학급 DB에 보존 자료를 병합하고 다시 암호화한다.
func mergeLocalDataIntoPackage(dm *database.DBManager, tmpDir string, key []byte, preserved map[int]preservedClassData, result *DistributionImportResult) error {
	password := hex.EncodeToString(key)
	for classNum, data := range preserved {
		base := filepath.Join(dm.DataDir, fmt.Sprintf("class_%d.db", classNum))
		target := base + ".kkomi"
		if _, err := os.Stat(target); err != nil {
			if _, legacyErr := os.Stat(base + ".phgc"); legacyErr == nil {
				target = base + ".phgc"
			} else {
				result.UnrestoredClasses = append(result.UnrestoredClasses, classNum)
				continue
			}
		}
		plain := filepath.Join(tmpDir, fmt.Sprintf("new_class_%d.db", classNum))
		if err := crypto.DecryptFileGCM(password, target, plain); err != nil {
			return fmt.Errorf("%d반 새 배포자료 열기 실패: %w", classNum, err)
		}
		if err := dm.EnsureClassDBSchema(plain); err != nil {
			return err
		}
		if err := restorePreservedClassData(dm, plain, data); err != nil {
			return fmt.Errorf("%d반: %w", classNum, err)
		}
		sealed := plain + ".kkomi"
		if err := crypto.EncryptFileGCM(password, plain, sealed); err != nil {
			return err
		}
		sealedBytes, err := os.ReadFile(sealed)
		if err != nil {
			return err
		}
		if err := crypto.WritePrivateFileAtomically(base+".kkomi", sealedBytes); err != nil {
			return err
		}
		if strings.HasSuffix(target, ".phgc") {
			crypto.BackupLegacyFile(target)
		}
		result.PreservedClasses++
		result.Applications += len(data.Apps)
		result.Counsels += len(data.Counsels)
		result.Overrides += len(data.Overrides)
	}
	return nil
}

// retireUserEnvelope 대상 계정의 개인 잠금 파일(keys/<계정>.json)을 백업 폴더로 옮긴다.
// 다음 로그인 때 공용 데이터 암호와 초기 비밀번호로 새 잠금 파일이 만들어진다.
func retireUserEnvelope(dataDir, username string, result *DistributionImportResult) {
	envelope := crypto.UserEnvelopePath(dataDir, username)
	data, err := os.ReadFile(envelope)
	if err != nil {
		return
	}
	backupDir := result.BackupFolder
	if backupDir == "" {
		backupDir = filepath.Join(dataDir, "backup_before_pkg_import", time.Now().Format("20060102-150405"))
		result.BackupFolder = backupDir
	}
	if err := os.MkdirAll(filepath.Join(backupDir, "keys"), 0700); err != nil {
		return
	}
	if err := crypto.WritePrivateFileAtomically(filepath.Join(backupDir, "keys", filepath.Base(envelope)), data); err != nil {
		return
	}
	_ = os.Remove(envelope)
}
