package exchange

import (
	"archive/zip"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"PHGC/internal/crypto"
	"PHGC/internal/database"
	"PHGC/internal/model"

	"golang.org/x/crypto/bcrypt"
)

// DistributionPackageManifest identifies a teacher/viewer deployment package.
// The ZIP contains only individually AES-GCM encrypted database files and an
// encrypted shared-key envelope; it never contains a plaintext password.
type DistributionPackageManifest struct {
	Format   string   `json:"format"`
	Username string   `json:"username"`
	Role     string   `json:"role"`
	ClassNum int      `json:"classNum"`
	Files    []string `json:"files"`
}

// ExportDistributionPackage writes only the intended teacher's class DB (or
// all class DBs for the read-only career viewer). Administrator envelopes and
// other staff accounts are omitted.
func ExportDistributionPackage(dm *database.DBManager, dataKey []byte, username, outputPath string) error {
	if len(dataKey) != 32 {
		return fmt.Errorf("학년부장으로 로그인한 뒤에만 배포 자료를 만들 수 있습니다")
	}
	users, err := dm.GetUsers()
	if err != nil {
		return err
	}
	var target *database.User
	for i := range users {
		if users[i].Username == username {
			target = &users[i]
			break
		}
	}
	if target == nil || target.Role == "master" {
		return fmt.Errorf("담임 또는 진로부장 계정을 선택해주세요")
	}
	config, err := dm.GetSchoolConfig()
	if err != nil || config == nil {
		if err != nil {
			return err
		}
		return fmt.Errorf("학교 초기 설정을 먼저 완료해주세요")
	}
	// Older installations may predate the revision manifest. Create it before
	// packaging so a recipient can later export a compatible teacher patch.
	if _, err := os.Stat(crypto.ManifestPath(dm.DataDir)); os.IsNotExist(err) {
		packageID, keyErr := crypto.NewDataKey()
		if keyErr != nil {
			return keyErr
		}
		manifestBytes, marshalErr := json.Marshal(model.DataManifest{
			Format: "KKOMI-DATA-1", PackageID: hex.EncodeToString(packageID), AdmissionYear: config.AdmissionYear,
		})
		if marshalErr != nil {
			return marshalErr
		}
		if writeErr := crypto.WritePrivateFileAtomically(crypto.ManifestPath(dm.DataDir), manifestBytes); writeErr != nil {
			return writeErr
		}
	} else if err != nil {
		return err
	}
	tmpDir, err := os.MkdirTemp("", "kkomi-package-*")
	if err != nil {
		return err
	}
	defer os.RemoveAll(tmpDir)
	keyPassword := hex.EncodeToString(dataKey)
	files := []string{"config.db.kkomi", "shared-key.json", "manifest.json", "login-index.json"}

	// 배포 패키지 생성 직전 최신 전교생 석차 스냅샷을 갱신하여 config.db에 보관
	_ = dm.UpdateSchoolRankSnapshots()

	// Create a temporary config snapshot that contains only the target account.
	configCopy := filepath.Join(tmpDir, "config.db")
	if err := snapshotDatabase(dm, dm.GetConfigDBPath(), configCopy); err != nil {
		return err
	}
	copyDB, err := dm.OpenDB(configCopy)
	if err != nil {
		return err
	}
	_, err = copyDB.Exec("DELETE FROM users WHERE username <> ?", target.Username)
	if err == nil {
		_, err = copyDB.Exec("UPDATE school_config SET admin_password = '' WHERE id = 1")
	}
	// 담임교사 배포 패키지인 경우: 타 학급의 학생 개인정보를 완벽히 보호하기 위해 해당 학급의 전교 석차 스냅샷만 남기고 삭제
	if err == nil && target.Role == "homeroom" {
		_, err = copyDB.Exec("DELETE FROM school_rank_snapshots WHERE class_num <> ?", target.ClassNum)
	}
	// 만약 target의 비밀번호가 설정되어 있지 않다면 기본 비밀번호(계정 아이디)를 설정하고, 이미 있어도 새 패키지에서는 must_change_password 활성화
	if err == nil {
		if target.PasswordHash == "" {
			defaultHash, _ := bcrypt.GenerateFromPassword([]byte(target.Username), bcrypt.DefaultCost)
			_, err = copyDB.Exec("UPDATE users SET password_hash = ?, must_change_password = 1 WHERE username = ?", string(defaultHash), target.Username)
		} else {
			_, err = copyDB.Exec("UPDATE users SET must_change_password = 1 WHERE username = ?", target.Username)
		}
	}
	// WAL 변경사항을 본체 DB 파일로 완벽하게 체크포인트하고 저널 모드를 DELETE로 정리
	if err == nil {
		_, _ = copyDB.Exec("PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE")
	}
	copyDB.Close()
	if err != nil {
		return fmt.Errorf("배포용 계정 정보 준비 실패: %w", err)
	}
	if err := crypto.EncryptFileGCM(keyPassword, configCopy, filepath.Join(tmpDir, "config.db.kkomi")); err != nil {
		return err
	}

	if err := copyPackageFile(crypto.SharedEnvelopePath(dm.DataDir), filepath.Join(tmpDir, "shared-key.json")); err != nil {
		return err
	}
	if err := copyPackageFile(crypto.ManifestPath(dm.DataDir), filepath.Join(tmpDir, "manifest.json")); err != nil {
		return err
	}
	if err := database.SaveLoginIndex(tmpDir, config.SchoolName, []database.User{*target}); err != nil {
		return err
	}

	classNumbers := []int{}
	if target.Role == "homeroom" {
		classNumbers = append(classNumbers, target.ClassNum)
	} else {
		for classNum := 1; classNum <= config.ClassCount; classNum++ {
			classNumbers = append(classNumbers, classNum)
		}
	}
	for _, classNum := range classNumbers {
		source := dm.GetClassDBPath(classNum)
		if _, err := os.Stat(source); os.IsNotExist(err) {
			continue
		} else if err != nil {
			return err
		}
		name := fmt.Sprintf("class_%d.db.kkomi", classNum)
		if err := snapshotClassForRecipient(dm, source, tmpDir, filepath.Join(tmpDir, name), keyPassword, target.Username); err != nil {
			return err
		}
		files = append(files, name)
	}
	// 고교·학과 목록은 개인정보가 아닌 공용 참고자료지만, 담임의 새
	// 프로그램 폴더에서도 지원현황 입력을 바로 할 수 있도록 함께 전달한다.
	highSchools := filepath.Join(dm.DataDir, "highschools.json")
	if info, statErr := os.Stat(highSchools); statErr == nil && !info.IsDir() {
		if err := copyPackageFile(highSchools, filepath.Join(tmpDir, "highschools.json")); err != nil {
			return err
		}
		files = append(files, "highschools.json")
	}
	manifest := DistributionPackageManifest{Format: "KKOMI-DEPLOYMENT-1", Username: target.Username, Role: target.Role, ClassNum: target.ClassNum, Files: files}
	manifestJSON, err := json.Marshal(manifest)
	if err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(tmpDir, "package.json"), manifestJSON, 0600); err != nil {
		return err
	}
	files = append([]string{"package.json"}, files...)
	return writeDistributionZip(outputPath, tmpDir, files)
}

// ImportDistributionPackage 배포자료를 가져온다. 기존 학급 DB는 백업만 하고 새 DB로 옮기지 않는다
// (암호를 모르는 경우의 선택지). 기존 자료를 옮기려면 ImportDistributionPackageWithPassword 를 쓴다.
func ImportDistributionPackage(dm *database.DBManager, inputPath string) (string, error) {
	result, err := importDistributionPackage(dm, inputPath, "", false)
	if err != nil {
		return "", err
	}
	return result.Username, nil
}

// ImportDistributionPackageWithPassword 배포자료를 가져오면서 기존 학급 DB의 상담 일지·원서·수기 비교과를
// 새 DB로 옮긴다. 기존 학급 DB가 있으면 공용 데이터 암호 또는 본인 비밀번호가 필요하다.
func ImportDistributionPackageWithPassword(dm *database.DBManager, inputPath, password string) (*DistributionImportResult, error) {
	return importDistributionPackage(dm, inputPath, password, true)
}

func importDistributionPackage(dm *database.DBManager, inputPath, password string, merge bool) (*DistributionImportResult, error) {
	reader, err := zip.OpenReader(inputPath)
	if err != nil {
		return nil, fmt.Errorf("배포 자료를 열 수 없습니다: %w", err)
	}
	defer reader.Close()
	entries := map[string]*zip.File{}
	for _, file := range reader.File {
		if filepath.Base(file.Name) != file.Name || strings.Contains(file.Name, "..") {
			return nil, fmt.Errorf("허용되지 않은 배포 파일 경로입니다")
		}
		entries[file.Name] = file
	}
	pkgFile := entries["package.json"]
	if pkgFile == nil {
		return nil, fmt.Errorf("배포 자료 정보가 없습니다")
	}
	pkgBytes, err := readZipEntry(pkgFile)
	if err != nil {
		return nil, err
	}
	var manifest DistributionPackageManifest
	if err := json.Unmarshal(pkgBytes, &manifest); err != nil {
		return nil, fmt.Errorf("배포 자료 정보가 올바르지 않습니다")
	}
	if (manifest.Format != "KKOMI-DEPLOYMENT-1" && manifest.Format != "PHGC-DEPLOYMENT-1") || manifest.Username == "" || (manifest.Role != "homeroom" && manifest.Role != "viewer") {
		return nil, fmt.Errorf("지원하지 않는 배포 자료입니다")
	}

	// 안전장치: 현재 프로그램이 학년부장(master) 원본 관리자 데이터인 경우 실수로 덮어쓰는 것 방지
	if isMasterDataFolder(dm) {
		return nil, fmt.Errorf("현재 프로그램은 학년부장 원본 데이터가 보관된 폴더입니다. 학년부장 자료는 담임 배포 패키지로 덮어쓸 수 없습니다. 담임 교사용 폴더에서 실행해주세요")
	}

	// 새 배포자료 내용을 먼저 모두 읽어 둔다(파일 누락 시 아무것도 지우지 않고 중단).
	packageFiles := map[string][]byte{}
	for _, name := range manifest.Files {
		file := entries[name]
		if file == nil {
			return nil, fmt.Errorf("배포 자료에 %s 파일이 없습니다", name)
		}
		data, err := readZipEntry(file)
		if err != nil {
			return nil, err
		}
		packageFiles[name] = data
	}

	tmpDir, err := os.MkdirTemp("", "kkomi-import-*")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(tmpDir)
	result := &DistributionImportResult{Username: manifest.Username}

	// 1. 기존 학급 자료(상담 일지, 지원현황, 수기 출결/봉사/가산점) 추출 — 암호가 맞을 때만, 삭제 전에 모두 확인
	var key []byte
	var preserved map[int]preservedClassData
	if merge && DistributionImportNeedsPassword(dm) {
		if key, err = ResolveLocalDataKey(dm.DataDir, password); err != nil {
			return nil, err
		}
		if err := verifyPackageKey(packageFiles, tmpDir, key); err != nil {
			return nil, err
		}
		if preserved, err = collectLocalClassData(dm, tmpDir, key); err != nil {
			return nil, err
		}
		result.MergedWithLocalData = true
	}

	// 만약의 사태를 대비해 지우기 전의 DB 파일(평문·암호화 모두)을 backup_before_pkg_import/<시각>/ 에 복사한다.
	if existing, _ := filepath.Glob(filepath.Join(dm.DataDir, "*.db*")); len(existing) > 0 {
		backupDir := filepath.Join(dm.DataDir, "backup_before_pkg_import", time.Now().Format("20060102-150405"))
		if err := os.MkdirAll(backupDir, 0700); err != nil {
			return nil, fmt.Errorf("기존 자료 백업 폴더를 만들 수 없어 가져오기를 중단했습니다: %w", err)
		}
		for _, f := range existing {
			if err := copyPackageFile(f, filepath.Join(backupDir, filepath.Base(f))); err != nil {
				return nil, fmt.Errorf("기존 자료 백업에 실패해 가져오기를 중단했습니다: %w", err)
			}
		}
		result.BackupFolder = backupDir
	}

	// 기존 DB 파일들 및 이전 캐시 정리 (새 배포 패키지로 갱신 준비)
	cleanFiles, _ := filepath.Glob(filepath.Join(dm.DataDir, "*.db*"))
	for _, f := range cleanFiles {
		_ = os.Remove(f)
	}
	cleanEnvelopes, _ := filepath.Glob(filepath.Join(dm.DataDir, "*-key.json"))
	for _, f := range cleanEnvelopes {
		if filepath.Base(f) != "shared-key.json" {
			_ = os.Remove(f)
		}
	}

	// 2. 새 배포 패키지 파일 저장
	for _, name := range manifest.Files {
		if err := crypto.WritePrivateFileAtomically(filepath.Join(dm.DataDir, name), packageFiles[name]); err != nil {
			return nil, err
		}
	}

	// 새 배포자료의 계정 정보(학년부장이 정한 초기 비밀번호)로 다시 등록하도록, 대상 계정의 기존 개인 잠금
	// 파일을 백업 폴더로 옮긴다. 남겨 두면 담임이 바꾼 예전 비밀번호와 새 계정 정보가 어긋나 로그인할 수 없다.
	retireUserEnvelope(dm.DataDir, manifest.Username, result)

	// 3. 보존해 둔 기존 학급 자료를 새 DB에 병합하고 다시 암호화
	if key != nil && len(preserved) > 0 {
		if err := mergeLocalDataIntoPackage(dm, tmpDir, key, preserved, result); err != nil {
			return nil, fmt.Errorf("%w (기존 자료 원본은 %s 에 보관되어 있습니다)", err, result.BackupFolder)
		}
	}

	// 4. 누락된 원서 점수 스냅샷 자동 역산 보완 (Self-healing)
	_, _ = dm.BackfillAllApplicationsScoreDetails()

	return result, nil
}

// isMasterDataFolder 는 이 data 폴더가 학년부장 원본 자료인지 판별한다.
// 잠긴 상태(로그인 전)에서도 판별할 수 있도록 암호화되지 않은 계정 목록(login-index.json)과
// 학년부장 개인 잠금 파일(keys/admin.json)을 함께 확인한다. 담임·진로부장 배포자료에는 둘 다 없다.
func isMasterDataFolder(dm *database.DBManager) bool {
	if index, err := database.LoadLoginIndex(dm.DataDir); err == nil {
		for _, account := range index.Accounts {
			if account.Role == "master" {
				return true
			}
		}
	}
	if _, err := os.Stat(crypto.UserEnvelopePath(dm.DataDir, "admin")); err == nil {
		return true
	}
	if dm.HasEncryptedConfigDB() || database.HasSchoolConfigTable(dm.GetConfigDBPath()) {
		users, _ := dm.GetUsers()
		for _, u := range users {
			if u.Role == "master" {
				return true
			}
		}
	}
	return false
}
