package exchange

import (
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strconv"

	"PHGC/internal/crypto"
	"PHGC/internal/database"
)

// 배포자료를 다시 가져올 때 원서는 학년부장 최종본(새 배포자료)을 그대로 쓴다.
// 담임이 배포 뒤 고치거나 지워 놓고 아직 취합 파일로 내지 않은 원서가 있으면, 가져오기 전에 그 수를 알려
// 먼저 취합 파일을 내도록 묻는다. 그래도 진행하면 그 원서는 가져오기 전 DB 백업에만 남는다.

var packageClassPattern = regexp.MustCompile(`^class_(\d+)\.db\.(kkomi|phgc)$`)

// packageClassData 새 배포자료의 학급 DB를 임시로 풀어 원서를 읽는다.
func packageClassData(dm *database.DBManager, packageFiles map[string][]byte, tmpDir string, key []byte) (map[int]preservedClassData, error) {
	out := map[int]preservedClassData{}
	for name, data := range packageFiles {
		m := packageClassPattern.FindStringSubmatch(name)
		if m == nil {
			continue
		}
		classNum, _ := strconv.Atoi(m[1])
		enc := filepath.Join(tmpDir, "pkgenc_"+strconv.Itoa(classNum)+".bin")
		if err := os.WriteFile(enc, data, 0600); err != nil {
			return nil, err
		}
		plain := filepath.Join(tmpDir, fmt.Sprintf("pkg_class_%d.db", classNum))
		if err := crypto.DecryptFileGCM(hex.EncodeToString(key), enc, plain); err != nil {
			return nil, fmt.Errorf("새 배포자료 %d반을 열 수 없습니다: %w", classNum, err)
		}
		if err := dm.EnsureClassDBSchema(plain); err != nil {
			return nil, err
		}
		classData, err := extractPreservedClassData(dm, plain)
		if err != nil {
			return nil, err
		}
		out[classNum] = classData
	}
	return out, nil
}

func preservedAppKey(studentNum, studentName string, year int, category, school, track string) string {
	return fmt.Sprintf("%s|%s|%d|%s|%s|%s", studentNum, studentName, year, category, school, track)
}

func samePreservedApp(a, b preservedAppRow) bool {
	return a.Status == b.Status && a.AssignedDepartment == b.AssignedDepartment && a.AssignedSchool == b.AssignedSchool &&
		a.FirstStageResult == b.FirstStageResult && a.ExtraRound == b.ExtraRound && a.ScoreBasis == b.ScoreBasis && a.PreferencesJSON == b.PreferencesJSON
}

// countUnsubmittedApplications 담임 PC(old)에만 있는, 마지막 배포·제출 뒤 고치거나 지운 원서 수.
func countUnsubmittedApplications(old, pkg preservedClassData) int {
	threshold := old.ReceivedAt // 담임 PC 시계(없으면 배포 시각)
	if threshold == "" {
		threshold = old.DistributedAt
	}
	if database.TimeAfter(old.ExportedAt, threshold) || threshold == "" {
		threshold = old.ExportedAt
	}
	pkgApps := map[string]preservedAppRow{}
	for _, p := range pkg.Apps {
		pkgApps[preservedAppKey(p.StudentNum, p.StudentName, p.AdmissionYear, p.Category, p.SchoolName, p.Track)] = p
	}
	count := 0
	for _, a := range old.Apps {
		p, inPkg := pkgApps[preservedAppKey(a.StudentNum, a.StudentName, a.AdmissionYear, a.Category, a.SchoolName, a.Track)]
		if inPkg && samePreservedApp(a, p) {
			continue
		}
		if threshold != "" {
			if database.TimeAfter(a.UpdatedAt, threshold) {
				count++
			}
		} else if !inPkg || database.TimeAfter(a.UpdatedAt, p.UpdatedAt) {
			count++ // 예전 버전 자료: 시각 기준이 없어 배포자료보다 최근 것만 센다
		}
	}
	for _, d := range old.Deletions {
		if threshold != "" && !database.TimeAfter(d.DeletedAt, threshold) {
			continue
		}
		if _, still := pkgApps[preservedAppKey(d.StudentNum, d.StudentName, d.AdmissionYear, d.Category, d.SchoolName, d.Track)]; still {
			count++
		}
	}
	return count
}

// unsubmittedInPackage 보존 대상 학급마다 아직 내지 않은 원서 수를 더한다.
func unsubmittedInPackage(dm *database.DBManager, packageFiles map[string][]byte, tmpDir string, key []byte, preserved map[int]preservedClassData) (int, error) {
	if len(preserved) == 0 {
		return 0, nil
	}
	pkg, err := packageClassData(dm, packageFiles, tmpDir, key)
	if err != nil {
		return 0, err
	}
	total := 0
	for classNum, old := range preserved {
		total += countUnsubmittedApplications(old, pkg[classNum])
	}
	return total, nil
}
