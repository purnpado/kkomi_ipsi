package exchange

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"PHGC/internal/database"
	"PHGC/internal/sync"
)

// JointSharePackage 관내 타 학교와 안전하게 공유하는 커트라인 및 지원현황 통계 패키지 (학생 개인정보 100% 원천 배제)
type JointSharePackage struct {
	Format        string                        `json:"format"`
	SchoolName    string                        `json:"schoolName"`
	AdmissionYear int                           `json:"admissionYear"`
	ExportedAt    string                        `json:"exportedAt"`
	Cutoffs       []database.CutoffInfo         `json:"cutoffs"`
	Applications  []database.ApplicationSummary `json:"applications"`
	OfficialItems []map[string]interface{}      `json:"officialItems"`
}

// BuildJointShareData 현재 연도의 커트라인과 지원현황 집계(개인정보 없음) 및 공식자료를 관내 공유용 JSON으로 만든다.
// 저장 위치 선택(대화상자)은 호출자가 담당하므로 기본 파일명과 내용을 함께 돌려준다.
func BuildJointShareData(dm *database.DBManager, sm *sync.SyncManager, admissionYear int) (data []byte, defaultFilename string, err error) {
	config, err := dm.GetSchoolConfig()
	if err != nil {
		return nil, "", fmt.Errorf("학교 설정을 불러올 수 없습니다: %w", err)
	}
	if admissionYear <= 0 {
		admissionYear = config.AdmissionYear
	}

	// 1. 해당 연도 커트라인 추출
	allCutoffs, err := dm.GetCutoffs()
	if err != nil {
		allCutoffs = []database.CutoffInfo{}
	}
	var yearCutoffs []database.CutoffInfo
	for _, c := range allCutoffs {
		if c.Year == admissionYear {
			yearCutoffs = append(yearCutoffs, c)
		}
	}

	// 2. 해당 연도 지원현황 통계 추출 (개인 식별정보 완전 배제)
	allApps, err := dm.GetApplicationSummaries()
	if err != nil {
		allApps = []database.ApplicationSummary{}
	}
	var yearApps []database.ApplicationSummary
	for _, app := range allApps {
		if app.AdmissionYear == admissionYear {
			yearApps = append(yearApps, app)
		}
	}

	// 3. 고교 공식 공개 입결 데이터 추출
	var officialList []map[string]interface{}
	if officialResp, err := sm.GetOfficialAdmissionData(); err == nil && officialResp != nil {
		officialList = officialResp.Items
	}

	pkg := JointSharePackage{
		Format:        "KKOMI_JOINT_SHARE_V1",
		SchoolName:    config.SchoolName,
		AdmissionYear: admissionYear,
		ExportedAt:    time.Now().Format("2006-01-02 15:04:05"),
		Cutoffs:       yearCutoffs,
		Applications:  yearApps,
		OfficialItems: officialList,
	}

	data, err = json.MarshalIndent(pkg, "", "  ")
	if err != nil {
		return nil, "", fmt.Errorf("공유 패키지 생성 실패: %w", err)
	}

	schoolName := strings.TrimSpace(config.SchoolName)
	if schoolName == "" {
		schoolName = "울산중학교"
	}
	safeSchoolName := strings.Map(func(r rune) rune {
		if strings.ContainsRune(`\/:*?"<>|`, r) {
			return '_'
		}
		return r
	}, schoolName)
	defaultFilename = fmt.Sprintf("꼬미입시_관내진학자료_%s_%d학년도.kkomidata", safeSchoolName, admissionYear)
	return data, defaultFilename, nil
}

// MergeJointShareFiles 타 학교의 진학자료 파일(단일 또는 다중)을 읽어 우리 학교 커트라인과 공식자료에 일괄 병합
func MergeJointShareFiles(dm *database.DBManager, paths []string) (map[string]int, error) {
	var allCutoffsToMerge []database.CutoffInfo
	var allOfficialItems []map[string]interface{}
	totalApplications := 0
	validFileCount := 0

	for _, path := range paths {
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}

		var pkg JointSharePackage
		if err := json.Unmarshal(data, &pkg); err != nil || (pkg.Format != "KKOMI_JOINT_SHARE_V1" && pkg.Format != "PHGC_JOINT_SHARE_V1") {
			continue
		}
		validFileCount++

		// 1. 커트라인 병합 목록에 추가
		allCutoffsToMerge = append(allCutoffsToMerge, pkg.Cutoffs...)

		// 2. 타교의 지원현황 중 합격/진학 결과가 있는 항목을 커트라인으로 자동 변환하여 추가 병합
		for _, app := range pkg.Applications {
			if app.AcceptedCount > 0 || app.FinalCount > 0 {
				scoreType := "score"
				if strings.Contains(app.SchoolName, "일반계고") || strings.Contains(app.Category, "general") {
					scoreType = "percentile"
				}
				allCutoffsToMerge = append(allCutoffsToMerge, database.CutoffInfo{
					Year:       app.AdmissionYear,
					SchoolName: app.SchoolName,
					Department: app.Department,
					Track:      app.Track,
					ScoreType:  scoreType,
					MaxValue:   app.MaxAcceptedScore,
					MinValue:   app.MinAcceptedScore,
					AvgValue:   app.AvgAcceptedScore,
				})
			}
		}
		totalApplications += len(pkg.Applications)
		allOfficialItems = append(allOfficialItems, pkg.OfficialItems...)
	}

	if validFileCount == 0 {
		return nil, fmt.Errorf("선택된 파일 중 올바른 PHGC 관내 진학자료가 없습니다")
	}

	mergedCutoffCount, err := dm.MergeCutoffs(allCutoffsToMerge)
	if err != nil {
		return nil, fmt.Errorf("커트라인 병합 중 오류 발생: %w", err)
	}

	// 3. 공식자료 보완 (로컬 JSON에 신규 항목 병합)
	mergedOfficialCount := 0
	if len(allOfficialItems) > 0 {
		exePath, err := os.Executable()
		if err == nil {
			officialFile := filepath.Join(filepath.Dir(exePath), "official_admission_data.json")
			var localData sync.OfficialAdmissionData
			if curBytes, readErr := os.ReadFile(officialFile); readErr == nil {
				_ = json.Unmarshal(curBytes, &localData)
			}
			existKeyMap := make(map[string]bool)
			for _, item := range localData.Items {
				k := fmt.Sprintf("%v_%v_%v", item["schoolName"], item["department"], item["admissionYear"])
				existKeyMap[k] = true
			}
			for _, item := range allOfficialItems {
				k := fmt.Sprintf("%v_%v_%v", item["schoolName"], item["department"], item["admissionYear"])
				if !existKeyMap[k] {
					localData.Items = append(localData.Items, item)
					existKeyMap[k] = true
					mergedOfficialCount++
				}
			}
			if mergedOfficialCount > 0 {
				if newBytes, marshalErr := json.MarshalIndent(localData, "", "  "); marshalErr == nil {
					_ = os.WriteFile(officialFile, newBytes, 0644)
				}
			}
		}
	}

	return map[string]int{
		"files":        validFileCount,
		"cutoffs":      mergedCutoffCount,
		"applications": totalApplications,
		"official":     mergedOfficialCount,
	}, nil
}
