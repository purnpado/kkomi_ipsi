package sync

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const (
	// 애플리케이션 버전 (오프라인 전용 에디션)
	AppVersion = "1.6.6"

	// 기본 로컬 데이터 폴더
	ServerDataPath = "server-data"
)

// VersionInfo 버전 정보 구조체
type VersionInfo struct {
	LatestVersion string `json:"latestVersion"`
	MinVersion    string `json:"minVersion"`
	ReleaseNotes  string `json:"releaseNotes"`
	DownloadURL   string `json:"downloadUrl"`
}

// HighSchoolData 고등학교 목록 데이터 구조체
type HighSchoolData struct {
	UpdatedAt   string       `json:"updatedAt"`
	Description string       `json:"description"`
	Schools     []HighSchool `json:"schools"`
}

// HighSchool 고등학교 정보
type HighSchool struct {
	Name        string   `json:"name"`
	Type        string   `json:"type"`
	Area        string   `json:"area"`
	Note        string   `json:"note"`
	Departments []string `json:"departments"`
	// Quotas 입학전형요강의 모집정원(운영자가 요강을 확인해 수동 등록, 자동 수집 없음).
	// 학년도별로 둔다. 학교·전형 전체만 알면 학과는 비워도 된다.
	Quotas []AdmissionQuota `json:"quotas,omitempty"`
}

// AdmissionQuota 한 학년도·전형·학과의 요강 모집정원. Department가 빈 값이면 학교·전형 전체.
type AdmissionQuota struct {
	AdmissionYear int    `json:"admissionYear"`
	Track         string `json:"track"`
	Department    string `json:"department,omitempty"`
	Quota         int    `json:"quota"`
	Source        string `json:"source,omitempty"` // 근거(예: "2027학년도 입학전형요강 p.3")
}

// OfficialAdmissionData 공식 고입 전형자료 구조체
type OfficialAdmissionData struct {
	Items []map[string]interface{} `json:"items"`
}

// SyncResult 동기화 결과 구조체
type SyncResult struct {
	Success        bool   `json:"success"`
	Message        string `json:"message"`
	SchoolCount    int    `json:"schoolCount"`
	HasUpdate      bool   `json:"hasUpdate"`
	LatestVersion  string `json:"latestVersion"`
	CurrentVersion string `json:"currentVersion"`
	ReleaseNotes   string `json:"releaseNotes"`
	DownloadURL    string `json:"downloadUrl"`
}

// SyncStepResult 동기화 단계별 결과
type SyncStepResult struct {
	Step    string `json:"step"`
	Status  string `json:"status"` // "loading", "success", "error", "skipped"
	Message string `json:"message"`
}

// SyncManager 로컬 데이터 관리자 (오프라인 전용: 네트워크 I/O 전무)
type SyncManager struct {
	DataDir string
}

// EmbeddedHighSchoolsJSON 실행 파일에 넣은 server-data/highschools.json(main 패키지가 설정).
// 학교·학과·요강 모집정원의 기본값이며, data 폴더에 highschools.json이 없을 때 쓴다.
var EmbeddedHighSchoolsJSON []byte

func embeddedHighSchools() *HighSchoolData {
	if len(EmbeddedHighSchoolsJSON) == 0 {
		return nil
	}
	var d HighSchoolData
	if json.Unmarshal(bytes.TrimPrefix(EmbeddedHighSchoolsJSON, []byte("\xef\xbb\xbf")), &d) != nil || len(d.Schools) == 0 {
		return nil
	}
	return &d
}

// fillQuotas 예전 버전에서 받은 data/highschools.json에는 모집정원이 없으므로, 같은 학교의 모집정원을 내장 자료에서 채운다.
func fillQuotas(local *HighSchoolData, base *HighSchoolData) {
	if local == nil || base == nil {
		return
	}
	byName := map[string][]AdmissionQuota{}
	for _, s := range base.Schools {
		byName[s.Name] = s.Quotas
	}
	for i := range local.Schools {
		if len(local.Schools[i].Quotas) == 0 {
			local.Schools[i].Quotas = byName[local.Schools[i].Name]
		}
	}
}

// NewSyncManager 동기화 관리자 생성
func NewSyncManager(dataDir string) *SyncManager {
	return &SyncManager{
		DataDir: dataDir,
	}
}

// saveToFile 로컬 파일로 저장
func (sm *SyncManager) saveToFile(filename string, data []byte) error {
	filePath := filepath.Join(sm.DataDir, filename)
	if err := os.MkdirAll(filepath.Dir(filePath), 0755); err != nil {
		return fmt.Errorf("폴더 생성 실패: %w", err)
	}
	return os.WriteFile(filePath, data, 0644)
}

// GitHubReleasesAPI 공식 릴리즈 최신판 조회 주소(GitHub 저장소 이름: purnpado/kkomi_ipsi, 옛 이름 PHGC)
const GitHubReleasesAPI = "https://api.github.com/repos/purnpado/kkomi_ipsi/releases/latest"

// ReleaseAsset 릴리즈에 첨부된 파일 이름과 내려받기 주소
type ReleaseAsset struct {
	Name string
	URL  string
}

// PickDownloadAsset 릴리즈 첨부 파일 가운데 내려받을 실행 파일을 고른다.
// v1.6.4부터 실행 파일은 꼬미입시.exe 이며, GitHub에는 한글 이름이 깨지지 않도록 kkomi-ipsi.exe 로 올린다.
// 이전 릴리즈 호환을 위해 PHGC.exe 도 받아들이고, 마지막으로 그 밖의 .exe 를 고른다.
func PickDownloadAsset(assets []ReleaseAsset) string {
	preferred := []string{"꼬미입시.exe", "kkomi-ipsi.exe", "phgc.exe"}
	for _, want := range preferred {
		for _, a := range assets {
			if strings.EqualFold(strings.TrimSpace(a.Name), want) {
				return a.URL
			}
		}
	}
	for _, a := range assets {
		if strings.HasSuffix(strings.ToLower(a.Name), ".exe") {
			return a.URL
		}
	}
	return ""
}

// CheckVersion 원격 릴리즈(GitHub -> Gitea)에서 최신 버전 확인 (오프라인 시 안전하게 로컬 반환)
func (sm *SyncManager) CheckVersion() (*VersionInfo, error) {
	client := &http.Client{Timeout: 3 * time.Second}

	// 1차 시도: GitHub 공식 Releases API
	req, err := http.NewRequest("GET", GitHubReleasesAPI, nil)
	if err == nil {
		req.Header.Set("User-Agent", "kkomi-ipsi-offline-updater")
		req.Header.Set("Accept", "application/vnd.github+json")

		resp, err := client.Do(req)
		if err == nil && resp.StatusCode == http.StatusOK {
			defer resp.Body.Close()
			var ghRelease struct {
				TagName string `json:"tag_name"`
				Name    string `json:"name"`
				Body    string `json:"body"`
				Assets  []struct {
					Name               string `json:"name"`
					BrowserDownloadURL string `json:"browser_download_url"`
				} `json:"assets"`
			}
			if err := json.NewDecoder(resp.Body).Decode(&ghRelease); err == nil && ghRelease.TagName != "" {
				latestVer := strings.TrimPrefix(strings.TrimSpace(ghRelease.TagName), "v")
				assets := make([]ReleaseAsset, 0, len(ghRelease.Assets))
				for _, a := range ghRelease.Assets {
					assets = append(assets, ReleaseAsset{Name: a.Name, URL: a.BrowserDownloadURL})
				}
				downloadURL := PickDownloadAsset(assets)
				return &VersionInfo{
					LatestVersion: latestVer,
					MinVersion:    "1.0.0",
					ReleaseNotes:  ghRelease.Body,
					DownloadURL:   downloadURL,
				}, nil
			}
		}
		if resp != nil {
			resp.Body.Close()
		}
	}

	// 2차 시도: Gitea Releases API
	giteaResp, err := client.Get("https://gitea.gguk.link/api/v1/repos/purnpadosori/PHGC-OFFLINE/releases/latest")
	if err == nil && giteaResp.StatusCode == http.StatusOK {
		defer giteaResp.Body.Close()
		var gitRelease struct {
			TagName string `json:"tag_name"`
			Body    string `json:"body"`
			Assets  []struct {
				Name               string `json:"name"`
				BrowserDownloadURL string `json:"browser_download_url"`
			} `json:"assets"`
		}
		if err := json.NewDecoder(giteaResp.Body).Decode(&gitRelease); err == nil && gitRelease.TagName != "" {
			latestVer := strings.TrimPrefix(strings.TrimSpace(gitRelease.TagName), "v")
			assets := make([]ReleaseAsset, 0, len(gitRelease.Assets))
			for _, a := range gitRelease.Assets {
				assets = append(assets, ReleaseAsset{Name: a.Name, URL: a.BrowserDownloadURL})
			}
			downloadURL := PickDownloadAsset(assets)
			return &VersionInfo{
				LatestVersion: latestVer,
				MinVersion:    "1.0.0",
				ReleaseNotes:  gitRelease.Body,
				DownloadURL:   downloadURL,
			}, nil
		}
	}
	if giteaResp != nil {
		giteaResp.Body.Close()
	}

	// 3차: 오프라인 상태 (외부 통신 불가 시 현재 버전 안전하게 반환)
	return &VersionInfo{
		LatestVersion: AppVersion,
		MinVersion:    "1.0.0",
		ReleaseNotes:  "오프라인 환경으로 안전하게 작동 중입니다.",
		DownloadURL:   "",
	}, nil
}

// SyncHighSchools 로컬 고등학교 목록 로드
func (sm *SyncManager) SyncHighSchools() (*HighSchoolData, error) {
	return sm.GetHighSchools()
}

// FullSync 전체 동기화 및 업데이트 확인 실행
func (sm *SyncManager) FullSync() *SyncResult {
	result := &SyncResult{
		CurrentVersion: AppVersion,
		LatestVersion:  AppVersion,
		HasUpdate:      false,
		Success:        true,
		Message:        "최신 버전을 사용하고 있습니다.",
	}

	// 고교 기본 데이터 로드
	schoolData, err := sm.GetHighSchools()
	if err == nil && schoolData != nil {
		result.SchoolCount = len(schoolData.Schools)
	}

	// 버전 확인
	vInfo, err := sm.CheckVersion()
	if err == nil && vInfo != nil {
		result.LatestVersion = vInfo.LatestVersion
		result.ReleaseNotes = vInfo.ReleaseNotes
		result.DownloadURL = vInfo.DownloadURL

		if isNewerVersion(vInfo.LatestVersion, AppVersion) {
			result.HasUpdate = true
			result.Message = fmt.Sprintf("새 버전 v%s 사용 가능!", vInfo.LatestVersion)
		}
	}

	return result
}

// isNewerVersion 버전 비교 함수
func isNewerVersion(remote, local string) bool {
	remote = strings.TrimPrefix(strings.TrimSpace(remote), "v")
	local = strings.TrimPrefix(strings.TrimSpace(local), "v")

	rParts := strings.Split(remote, ".")
	lParts := strings.Split(local, ".")

	for i := 0; i < len(rParts) && i < len(lParts); i++ {
		rNum := 0
		lNum := 0
		fmt.Sscanf(rParts[i], "%d", &rNum)
		fmt.Sscanf(lParts[i], "%d", &lNum)

		if rNum > lNum {
			return true
		} else if rNum < lNum {
			return false
		}
	}

	return len(rParts) > len(lParts)
}

// GetCurrentVersion 현재 버전 반환
func (sm *SyncManager) GetCurrentVersion() string {
	return AppVersion
}

// GetHighSchools 고등학교 목록 반환 (로컬 파일 또는 기본 내장 데이터)
func (sm *SyncManager) GetHighSchools() (*HighSchoolData, error) {
	localPath := filepath.Join(sm.DataDir, "highschools.json")
	if data, err := os.ReadFile(localPath); err == nil {
		data = bytes.TrimPrefix(data, []byte("\xef\xbb\xbf"))
		var schoolData HighSchoolData
		if err := json.Unmarshal(data, &schoolData); err == nil {
			fillQuotas(&schoolData, embeddedHighSchools())
			return &schoolData, nil
		}
	}

	// 실행 파일에 넣은 고교 목록(server-data/highschools.json), 없으면 코드 기본 목록
	if d := embeddedHighSchools(); d != nil {
		return d, nil
	}
	return sm.getDefaultHighSchools(), nil
}

// getDefaultHighSchools 기본 내장 고교 목록
func (sm *SyncManager) getDefaultHighSchools() *HighSchoolData {
	return &HighSchoolData{
		UpdatedAt:   time.Now().Format("2006-01-02"),
		Description: "울산 관내 고등학교 기본 데이터 (오프라인 내장)",
		Schools: []HighSchool{
			{Name: "울산 후기 일반계고", Type: "general", Area: "울산 전체", Note: "후기 일반계고 전체", Departments: []string{"전체"}},
			{Name: "울산마이스터고등학교", Type: "meister", Area: "북구", Note: "마이스터고", Departments: []string{"전기시스템제어과", "자동화시스템과", "정밀기계과"}},
			{Name: "울산에너지고등학교", Type: "meister", Area: "북구", Note: "마이스터고", Departments: []string{"전기에너지과", "신재생에너지과"}},
			{Name: "현대공업고등학교", Type: "meister", Area: "동구", Note: "마이스터고", Departments: []string{"정밀기계과", "산업설비과", "전기제어과"}},
			{Name: "울산공업고등학교", Type: "special", Area: "남구", Note: "특성화고", Departments: []string{"스마트기계과", "스마트전기전자과", "스마트건설과", "화공에너지과"}},
			{Name: "울산기술공업고등학교", Type: "special", Area: "울주군", Note: "특성화고", Departments: []string{"산업설비기계과", "드론공간정보과", "융합디자인과", "전기과"}},
			{Name: "울산미용예술고등학교", Type: "special", Area: "울주군", Note: "특성화고", Departments: []string{"미용예술과"}},
			{Name: "울산산업고등학교", Type: "special", Area: "울주군", Note: "특성화고", Departments: []string{"그린스마트팜과", "원예디자인과", "반려동물과", "식품가공과", "보건간호과"}},
			{Name: "울산생활과학고등학교", Type: "special", Area: "동구", Note: "특성화고", Departments: []string{"보건간호과", "사무행정과", "조리과"}},
			{Name: "울산여자상업고등학교", Type: "special", Area: "남구", Note: "특성화고", Departments: []string{"관광경영과", "SNS마케팅과", "AI금융회계과", "스마트공공행정과"}},
			{Name: "울산상업고등학교", Type: "special", Area: "울주군", Note: "특성화고", Departments: []string{"군사경영과", "물류경영과", "IT콘텐츠과"}},
			{Name: "울산애니원고등학교", Type: "other", Area: "중구", Note: "기타제외학교(실기전형)", Departments: []string{"만화창작과", "애니메이션과", "컴퓨터게임개발과"}},
			{Name: "울산과학고등학교", Type: "self_foreign", Area: "울주군", Note: "특수목적고", Departments: []string{"자연과정"}},
			{Name: "울산외국어고등학교", Type: "self_foreign", Area: "북구", Note: "특수목적고", Departments: []string{"영어과", "러시아어과", "일본어과", "중국어과", "아랍어과"}},
			{Name: "울산스포츠과학고등학교", Type: "self_foreign", Area: "북구", Note: "특수목적고", Departments: []string{"스포츠과정"}},
			{Name: "울산예술고등학교", Type: "self_foreign", Area: "울주군", Note: "특수목적고", Departments: []string{"음악과", "미술과", "무용과"}},
			{Name: "현대청운고등학교", Type: "self_foreign", Area: "동구", Note: "전국단위 자사고", Departments: []string{"보통과"}},
		},
	}
}

// GetOfficialAdmissionData 로컬 공식자료 읽기
func (sm *SyncManager) GetOfficialAdmissionData() (*OfficialAdmissionData, error) {
	localPath := filepath.Join(sm.DataDir, "official_admission_data.json")
	if data, err := os.ReadFile(localPath); err == nil {
		data = bytes.TrimPrefix(data, []byte("\xef\xbb\xbf"))
		var official OfficialAdmissionData
		if err := json.Unmarshal(data, &official); err == nil {
			return &official, nil
		}
	}
	return &OfficialAdmissionData{Items: []map[string]interface{}{}}, nil
}

// SaveOfficialAdmissionData 로컬 공식자료 저장
func (sm *SyncManager) SaveOfficialAdmissionData(official *OfficialAdmissionData) error {
	filePath := filepath.Join(sm.DataDir, "official_admission_data.json")
	if err := os.MkdirAll(filepath.Dir(filePath), 0755); err != nil {
		return fmt.Errorf("공식자료 폴더 생성 실패: %w", err)
	}
	if official == nil || official.Items == nil {
		official = &OfficialAdmissionData{Items: []map[string]interface{}{}}
	}
	data, err := json.MarshalIndent(official, "", "  ")
	if err != nil {
		return fmt.Errorf("공식자료 JSON 변환 실패: %w", err)
	}
	return os.WriteFile(filePath, data, 0644)
}

// NoticeItem 공지사항 구조체
type NoticeItem struct {
	Title       string `json:"title"`
	Content     string `json:"content"`
	PublishedAt string `json:"publishedAt"`
}

// GetNotices 로컬 공지사항 목록 읽기
func (sm *SyncManager) GetNotices() ([]NoticeItem, error) {
	const filename = "notice.json"
	localPath := filepath.Join(sm.DataDir, filename)
	if data, err := os.ReadFile(localPath); err == nil {
		data = bytes.TrimPrefix(data, []byte("\xef\xbb\xbf"))
		var items []NoticeItem
		if err := json.Unmarshal(data, &items); err == nil {
			return items, nil
		}
	}
	return []NoticeItem{}, nil
}
