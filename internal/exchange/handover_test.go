package exchange

import (
	"archive/zip"
	"os"
	"path/filepath"
	"testing"

	"PHGC/internal/crypto"
	"PHGC/internal/database"
	"PHGC/internal/model"
	"PHGC/internal/parser"
)

func newYearSchool(t *testing.T, classes, year int) *database.DBManager {
	t.Helper()
	key, _ := crypto.NewDataKey()
	return newYearSchoolKey(t, classes, year, key)
}

func newYearSchoolKey(t *testing.T, classes, year int, key []byte) *database.DBManager {
	t.Helper()
	dm := &database.DBManager{DataDir: t.TempDir()}
	dm.SetDataKey(key)
	if err := dm.InitConfigDB(); err != nil {
		t.Fatal(err)
	}
	if err := dm.SaveSchoolConfig("가람중학교", classes, "", false, year); err != nil {
		t.Fatal(err)
	}
	for c := 1; c <= classes; c++ {
		if err := dm.InitClassDB(c); err != nil {
			t.Fatal(err)
		}
	}
	return dm
}

// 한 해의 입시: 학생 3명(마이스터고 합격·불합격, 후기 일반고 합격)을 기록하고 결과를 확정한다.
func runSchoolYear(t *testing.T, dm *database.DBManager, year int) {
	t.Helper()
	students := []parser.StudentExcelData{
		{ClassNum: 1, StudentNum: "1", Name: "가", RawData: generalRaw("A"), AttendanceData: `{}`, VolunteerData: `{"total_time":12}`},
		{ClassNum: 1, StudentNum: "2", Name: "나", RawData: generalRaw("B"), AttendanceData: `{}`, VolunteerData: `{"total_time":12}`},
		{ClassNum: 1, StudentNum: "3", Name: "다", RawData: generalRaw("C"), AttendanceData: `{}`, VolunteerData: `{"total_time":12}`},
	}
	if err := dm.SaveClassStudents(1, students); err != nil {
		t.Fatal(err)
	}
	recs := []model.ApplicationRecord{
		{ClassNum: 1, StudentNum: "1", StudentName: "가", AdmissionYear: year, Category: "meister", SchoolName: "울산마이스터고등학교", Track: "일반", Status: "합격", Score: 280, Preferences: []string{"정밀기계과"}, AssignedDepartment: "정밀기계과"},
		{ClassNum: 1, StudentNum: "2", StudentName: "나", AdmissionYear: year, Category: "meister", SchoolName: "울산마이스터고등학교", Track: "일반", Status: "불합격", FirstStageResult: "불합격", Score: 240, Preferences: []string{"정밀기계과"}},
		{ClassNum: 1, StudentNum: "2", StudentName: "나", AdmissionYear: year, Category: "general", Track: "후기 일반계고", Status: "합격"},
		{ClassNum: 1, StudentNum: "3", StudentName: "다", AdmissionYear: year, Category: "general", Track: "후기 일반계고", Status: "합격"},
	}
	for _, r := range recs {
		if err := dm.SaveApplication(r); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := dm.CloseAdmissionYear(year, "test", ""); err != nil {
		t.Fatal(err)
	}
}

func historyYearsOf(t *testing.T, dm *database.DBManager) map[int]int {
	t.Helper()
	list, err := dm.GetAdmissionHistory()
	if err != nil {
		t.Fatal(err)
	}
	out := map[int]int{}
	for _, h := range list {
		out[h.AdmissionYear]++
		if h.Category == "general" && h.GeneralDetailJSON == "" {
			t.Fatalf("후기 일반고 보관 기록에 항목별 점수가 없음: %+v", h)
		}
	}
	return out
}

// 해마다 새 폴더에 새로 설치(학급 수도 바뀜)하고 인수인계 파일로 이어 받으면 입시 자료가 누적된다.
func TestHandoverAccumulatesAcrossYears(t *testing.T) {
	dir := t.TempDir()
	y1 := newYearSchool(t, 10, 2027)
	runSchoolYear(t, y1, 2027)
	if got := historyYearsOf(t, y1); got[2027] != 4 {
		t.Fatalf("결과 확정 때 익명 보관: %v", got)
	}
	f1 := filepath.Join(dir, "2027.kkomihandover")
	if _, err := ExportHandoverPackage(y1, "handover-pw", f1); err != nil {
		t.Fatal(err)
	}

	y2 := newYearSchool(t, 8, 2028) // 새 학년도: 새 폴더·8학급·새 열쇠
	res, err := ImportHandoverFile(y2, f1, "handover-pw", true)
	if err != nil {
		t.Fatal(err)
	}
	if res.HistoryRecords != 4 || res.Closures != 1 || res.Cutoffs == 0 {
		t.Fatalf("1년차 인수인계 받기: %+v", res)
	}
	// 받은 지난 학년도도 우리 학교 학과별 분석에 나온다.
	stats, err := y2.GetDepartmentAdmissionStats(1)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, s := range stats {
		if s.AdmissionYear == 2027 && s.SchoolName == "울산마이스터고등학교" && s.AcceptedCount == 1 {
			found = true
		}
	}
	if !found {
		t.Fatalf("2027 학과별 분석이 이어지지 않음: %+v", stats)
	}
	// 같은 파일을 다시 받아도 중복되지 않는다.
	if again, _ := ImportHandoverFile(y2, f1, "handover-pw", true); again.HistoryRecords != 0 {
		t.Fatalf("다시 받으면 중복: %+v", again)
	}
	runSchoolYear(t, y2, 2028)
	f2 := filepath.Join(dir, "2028.kkomihandover")
	if _, err := ExportHandoverPackage(y2, "handover-pw-2", f2); err != nil {
		t.Fatal(err)
	}
	// 지난 학년도 결과도 관내 공유 파일 하나에 함께 담긴다.
	share := filepath.Join(dir, "share.kkomi")
	if err := ExportSharedPackageV2(y2, 2028, "share-pw", share); err != nil {
		t.Fatal(err)
	}

	y3 := newYearSchool(t, 9, 2029)
	if _, err := ImportHandoverFile(y3, f2, "handover-pw-2", false); err != nil {
		t.Fatal(err)
	}
	got := historyYearsOf(t, y3)
	if got[2027] != 4 || got[2028] != 4 {
		t.Fatalf("2년 누적 인수인계: %v", got)
	}
	other := newYearSchool(t, 5, 2029)
	shareRes, err := ImportSharedPackageV2(other, "share-pw", share)
	if err != nil {
		t.Fatal(err)
	}
	if shareRes.AdmissionYear != 2028 || len(shareRes.AdditionalYears) != 1 || shareRes.AdditionalYears[0] != 2027 {
		t.Fatalf("여러 학년도 관내 공유: %+v", shareRes)
	}
	g, err := other.GetConsolidatedGeneralCutoff(2027)
	if err != nil || g.ConfirmedRecords != 2 {
		t.Fatalf("지난 학년도 후기 일반고 관내 자료: %+v %v", g, err)
	}
}

// 이전 버전 최종 보관본에서도 입시 자료만(이름 없이) 가져온다.
func TestImportLegacyFinalArchiveExtractsAdmissionDataOnly(t *testing.T) {
	key, _ := crypto.NewDataKey()
	old := newYearSchoolKey(t, 3, 2027, key)
	runSchoolYear(t, old, 2027)
	// 이전 버전 보관본 흉내: 봉인된 DB + 공용 열쇠 봉투를 zip으로 묶어 보관본 암호로 암호화
	if err := crypto.SaveSharedKeyEnvelope(old.DataDir, "old-shared-pw", key); err != nil {
		t.Fatal(err)
	}
	if err := old.SealAllDatabases(); err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	zipPath := filepath.Join(dir, "archive.zip")
	zf, _ := os.Create(zipPath)
	zw := zip.NewWriter(zf)
	files, _ := filepath.Glob(filepath.Join(old.DataDir, "*.kkomi"))
	files = append(files, filepath.Join(old.DataDir, "shared-key.json"))
	for _, f := range files {
		w, _ := zw.Create(filepath.Base(f))
		b, _ := os.ReadFile(f)
		_, _ = w.Write(b)
	}
	_ = zw.Close()
	_ = zf.Close()
	archive := filepath.Join(dir, "old.kkomiarchive")
	if err := crypto.EncryptFileGCM("archive-pw", zipPath, archive); err != nil {
		t.Fatal(err)
	}

	fresh := newYearSchool(t, 8, 2028)
	if _, err := ImportLegacyFinalArchive(fresh, archive, "archive-pw", "wrong", false); err == nil {
		t.Fatal("공용 데이터 암호가 틀리면 막아야 함")
	}
	res, err := ImportLegacyFinalArchive(fresh, archive, "archive-pw", "old-shared-pw", false)
	if err != nil {
		t.Fatal(err)
	}
	if res.HistoryRecords != 4 {
		t.Fatalf("보관본에서 꺼낸 입시 기록: %+v", res)
	}
	students, _ := fresh.GetAllStudents(8)
	for _, list := range students {
		if len(list) > 0 {
			t.Fatalf("작년 학생 개인 자료를 가져오면 안 됨: %v", list)
		}
	}
	history, _ := fresh.GetAdmissionHistory()
	for _, h := range history {
		if h.AdmissionYear != 2027 {
			t.Fatalf("학년도: %+v", h)
		}
	}
}
