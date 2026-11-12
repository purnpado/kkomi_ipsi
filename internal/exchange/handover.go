package exchange

import (
	"archive/zip"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"PHGC/internal/crypto"
	"PHGC/internal/database"
)

// 인수인계 파일(.kkomihandover): 다음 학년도 학년부장에게 넘기는 입시 자료. 학생 개인정보가 없다.
//   담는 것: 고교별 커트라인, 결과 확정 기록, 지난 입시 결과(익명 누적), 관내 공유 자료, 후기고 정원 기록, 공식 경쟁률, 판정 기준
//   담지 않는 것: 학생 이름·학번·성적·출결·봉사·상담 일지, 계정·비밀번호·열쇠
// 해마다 새로 설치한 프로그램에서 받아 들이고, 그해 결과를 더해 다시 내보내면 누적된다.

const handoverFormat = "KKOMI-HANDOVER-1"

type HandoverPackage struct {
	Format           string                        `json:"format"`
	SchoolName       string                        `json:"schoolName"`
	CreatedAt        string                        `json:"createdAt"`
	AdmissionYear    int                           `json:"admissionYear"` // 만든 프로그램의 고입 학년도
	Cutoffs          []database.CutoffInfo         `json:"cutoffs"`
	Closures         []database.AdmissionClosure   `json:"closures"`
	History          []database.HistoryRecord      `json:"history"`
	Shared           []database.SharedPackageV2    `json:"shared"`
	Quotas           []database.GeneralQuotaRecord `json:"quotas"`
	Competition      []database.CompetitionRecord  `json:"competition,omitempty"` // 공식 경쟁률(모집정원·지원자 수)
	JudgmentSettings string                        `json:"judgmentSettings"`
}

// HandoverImportResult 받아 들인 자료 요약(화면 안내용)
type HandoverImportResult struct {
	SchoolName       string `json:"schoolName"`
	Years            []int  `json:"years"`
	Cutoffs          int    `json:"cutoffs"`
	Closures         int    `json:"closures"`
	HistoryRecords   int    `json:"historyRecords"`
	SharedPackages   int    `json:"sharedPackages"`
	SharedSkipped    int    `json:"sharedSkipped"`
	Quotas           int    `json:"quotas"`
	Competition      int    `json:"competition"`
	JudgmentImported bool   `json:"judgmentImported"`
	CurrentYearOpen  bool   `json:"currentYearOpen"` // 내보낸 쪽의 그해 결과가 아직 확정 전이었음
}

// BuildHandoverPackage 지금 프로그램의 입시 자료를 모은다. 결과 확정 전인 학년도는 결과가 나온 기록만 익명으로 더한다.
func BuildHandoverPackage(dm *database.DBManager) (*HandoverPackage, error) {
	config, err := dm.GetSchoolConfig()
	if err != nil || config == nil {
		return nil, fmt.Errorf("학교 설정을 불러올 수 없습니다")
	}
	pkg := &HandoverPackage{Format: handoverFormat, SchoolName: config.SchoolName, CreatedAt: time.Now().Format(time.RFC3339), AdmissionYear: config.AdmissionYear}
	if pkg.Cutoffs, err = dm.GetCutoffs(); err != nil {
		return nil, err
	}
	if pkg.Closures, err = dm.GetAdmissionClosures(); err != nil {
		return nil, err
	}
	if pkg.History, err = dm.GetAdmissionHistory(); err != nil {
		return nil, err
	}
	extra, err := dm.HistoryFromCurrentClasses(true)
	if err != nil {
		return nil, err
	}
	pkg.History = append(pkg.History, extra...)
	if pkg.Shared, err = dm.ExportStoredSharedPackages(); err != nil {
		return nil, err
	}
	if pkg.Quotas, err = dm.GetGeneralQuotaRecords(); err != nil {
		return nil, err
	}
	if pkg.Competition, err = dm.GetCompetitionRecords(); err != nil {
		return nil, err
	}
	pkg.JudgmentSettings, _ = dm.GetJudgmentSettings()
	return pkg, nil
}

func writeEncryptedJSON(v interface{}, password, outputPath string) error {
	if strings.TrimSpace(password) == "" {
		return fmt.Errorf("암호를 입력해주세요")
	}
	data, err := json.Marshal(v)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(outputPath), 0o700); err != nil {
		return err
	}
	tmp := outputPath + ".plain.tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	defer os.Remove(tmp)
	return crypto.EncryptFileGCM(password, tmp, outputPath)
}

// ExportHandoverPackage 인수인계 파일 저장
func ExportHandoverPackage(dm *database.DBManager, password, outputPath string) (*HandoverPackage, error) {
	pkg, err := BuildHandoverPackage(dm)
	if err != nil {
		return nil, err
	}
	return pkg, writeEncryptedJSON(pkg, password, outputPath)
}

// ImportHandoverFile 인수인계 파일을 받아 지금 프로그램에 더한다(이미 있는 학년도·학교 자료는 덮어쓰지 않음).
func ImportHandoverFile(dm *database.DBManager, inputPath, password string, includeJudgment bool) (*HandoverImportResult, error) {
	tmp, err := os.MkdirTemp("", "kkomi-handover-*")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(tmp)
	plain := filepath.Join(tmp, "handover.json")
	if err := crypto.DecryptFileGCM(password, inputPath, plain); err != nil {
		return nil, fmt.Errorf("인수인계 파일 암호가 올바르지 않거나 파일이 손상되었습니다")
	}
	data, err := os.ReadFile(plain)
	if err != nil {
		return nil, err
	}
	var pkg HandoverPackage
	if err := json.Unmarshal(data, &pkg); err != nil || pkg.Format != handoverFormat {
		return nil, fmt.Errorf("꼬미입시 인수인계 파일이 아닙니다")
	}
	return ApplyHandoverPackage(dm, &pkg, includeJudgment)
}

// ApplyHandoverPackage 인수인계 자료를 지금 프로그램에 더한다.
func ApplyHandoverPackage(dm *database.DBManager, pkg *HandoverPackage, includeJudgment bool) (*HandoverImportResult, error) {
	res := &HandoverImportResult{SchoolName: pkg.SchoolName}
	years := map[int]bool{}
	var err error
	if res.Cutoffs, err = dm.MergeCutoffs(pkg.Cutoffs); err != nil {
		return nil, fmt.Errorf("커트라인 가져오기: %w", err)
	}
	if res.Closures, err = dm.ImportAdmissionClosures(pkg.Closures); err != nil {
		return nil, fmt.Errorf("결과 확정 기록 가져오기: %w", err)
	}
	if res.HistoryRecords, err = dm.ImportAdmissionHistory(pkg.History); err != nil {
		return nil, fmt.Errorf("지난 입시 결과 가져오기: %w", err)
	}
	for _, h := range pkg.History {
		years[h.AdmissionYear] = true
	}
	for i := range pkg.Shared {
		sp := &pkg.Shared[i]
		if dm.HasSharedPackage(sp.Cover.SchoolName, sp.Cover.AdmissionYear) {
			res.SharedSkipped++ // 새 학년에 먼저 받은 관내 자료가 있으면 그대로 둔다
			continue
		}
		if _, err := dm.StoreSharedPackage(sp); err != nil {
			return nil, fmt.Errorf("관내 공유 자료 가져오기: %w", err)
		}
		res.SharedPackages++
		years[sp.Cover.AdmissionYear] = true
	}
	if res.Quotas, err = dm.ImportGeneralQuotaRecords(pkg.Quotas); err != nil {
		return nil, fmt.Errorf("후기고 정원 기록 가져오기: %w", err)
	}
	if res.Competition, err = dm.ImportCompetitionRecords(pkg.Competition); err != nil {
		return nil, fmt.Errorf("공식 경쟁률 가져오기: %w", err)
	}
	if includeJudgment && strings.TrimSpace(pkg.JudgmentSettings) != "" {
		if current, _ := dm.GetJudgmentSettings(); strings.TrimSpace(current) == "" {
			if err := dm.SaveJudgmentSettings(pkg.JudgmentSettings); err == nil {
				res.JudgmentImported = true
			}
		}
	}
	closed := map[int]bool{}
	for _, c := range pkg.Closures {
		closed[c.AdmissionYear] = true
	}
	res.CurrentYearOpen = !closed[pkg.AdmissionYear]
	for y := range years {
		res.Years = append(res.Years, y)
	}
	sortInts(res.Years)
	return res, nil
}

// ImportLegacyFinalArchive 이전 버전에서 만든 최종 보관본(.kkomiarchive)에서 입시 자료만 꺼내 더한다.
// 보관본 안의 자료는 그 학교 데이터 열쇠로 한 번 더 잠겨 있어 그해 공용 데이터 암호가 필요하다.
// 학생 이름·성적·상담 일지·계정은 가져오지 않는다(원서 기록은 이름·학번을 뺀 익명 기록으로만 옮긴다).
func ImportLegacyFinalArchive(dm *database.DBManager, archivePath, archivePassword, previousSharedPassword string, includeJudgment bool) (*HandoverImportResult, error) {
	tmp, err := os.MkdirTemp("", "kkomi-legacy-archive-*")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(tmp)
	zipPath := filepath.Join(tmp, "archive.zip")
	if err := crypto.DecryptFileGCM(archivePassword, archivePath, zipPath); err != nil {
		return nil, fmt.Errorf("보관본 암호가 올바르지 않거나 파일이 손상되었습니다")
	}
	reader, err := zip.OpenReader(zipPath)
	if err != nil {
		return nil, err
	}
	dataDir := filepath.Join(tmp, "data")
	for _, f := range reader.File {
		name := f.Name
		if strings.Contains(name, "..") || filepath.IsAbs(name) {
			reader.Close()
			return nil, fmt.Errorf("허용되지 않은 보관 파일 경로입니다")
		}
		ok := name == "shared-key.json" || name == "config.db.kkomi" || name == "config.db.phgc" ||
			(strings.HasPrefix(name, "class_") && (strings.HasSuffix(name, ".db.kkomi") || strings.HasSuffix(name, ".db.phgc")))
		if !ok {
			continue
		}
		b, err := readZipEntry(f)
		if err != nil {
			reader.Close()
			return nil, err
		}
		if err := os.MkdirAll(dataDir, 0o700); err != nil {
			reader.Close()
			return nil, err
		}
		if err := os.WriteFile(filepath.Join(dataDir, name), b, 0o600); err != nil {
			reader.Close()
			return nil, err
		}
	}
	reader.Close()
	key, err := crypto.OpenSharedKeyEnvelope(dataDir, previousSharedPassword)
	if err != nil || len(key) != 32 {
		return nil, fmt.Errorf("보관본을 만든 해의 공용 데이터 암호가 올바르지 않습니다")
	}
	old := &database.DBManager{DataDir: dataDir}
	old.SetDataKey(key)
	if err := old.UnsealAllDatabases(); err != nil {
		return nil, err
	}
	if err := old.InitConfigDB(); err != nil {
		return nil, err
	}
	_ = old.MigrateExistingClassDBs()
	pkg, err := BuildHandoverPackage(old)
	if err != nil {
		return nil, err
	}
	return ApplyHandoverPackage(dm, pkg, includeJudgment)
}

func sortInts(a []int) {
	for i := 1; i < len(a); i++ {
		for j := i; j > 0 && a[j] < a[j-1]; j-- {
			a[j], a[j-1] = a[j-1], a[j]
		}
	}
}
