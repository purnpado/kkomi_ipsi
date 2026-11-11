package exchange

import (
	"fmt"
	"path/filepath"
	"testing"

	"PHGC/internal/crypto"
	"PHGC/internal/database"
	"PHGC/internal/model"
	"PHGC/internal/parser"
)

// grade 성취도로 5학기(1-1, 2-1, 2-2, 3-1, 3-2) 성적을 만든다.
func generalRaw(grade string) string {
	return fmt.Sprintf(`[{"학년":"1","학기":"1","과목":"국어","성취도":"%[1]s"},{"학년":"2","학기":"1","과목":"국어","성취도":"%[1]s"},{"학년":"2","학기":"2","과목":"국어","성취도":"%[1]s"},{"학년":"3","학기":"1","과목":"국어","성취도":"%[1]s"},{"학년":"3","학기":"2","과목":"국어","성취도":"%[1]s"}]`, grade)
}

func newGeneralSchool(t *testing.T, name string, students []struct{ num, grade, status, extra string }) *database.DBManager {
	t.Helper()
	dm := &database.DBManager{DataDir: t.TempDir()}
	key, _ := crypto.NewDataKey()
	dm.SetDataKey(key)
	if err := dm.InitConfigDB(); err != nil {
		t.Fatal(err)
	}
	if err := dm.InitClassDB(1); err != nil {
		t.Fatal(err)
	}
	if err := dm.SaveSchoolConfig(name, 1, "", false, 2027); err != nil {
		t.Fatal(err)
	}
	var excel []parser.StudentExcelData
	for _, s := range students {
		excel = append(excel, parser.StudentExcelData{ClassNum: 1, StudentNum: s.num, Name: "학생" + s.num,
			RawData: generalRaw(s.grade), AttendanceData: `{}`, VolunteerData: `{"total_time":12}`, ExtraData: s.extra})
	}
	if err := dm.SaveClassStudents(1, excel); err != nil {
		t.Fatal(err)
	}
	for _, s := range students {
		if err := dm.SaveApplication(model.ApplicationRecord{ClassNum: 1, StudentNum: s.num, StudentName: "학생" + s.num,
			AdmissionYear: 2027, Category: "general", Track: "후기 일반계고", Status: s.status}); err != nil {
			t.Fatal(err)
		}
	}
	return dm
}

// 관내 두 학교 자료를 합쳐 후기 일반고 합격선을 추정한다.
// 가산점을 입력하지 않은 학교도 기본 지표(교과+출석+봉사+10) 잣대에는 들어가야 한다.
func TestConsolidatedGeneralCutoffUsesBaseIndexAcrossSchools(t *testing.T) {
	entered := `{"general_bonus_entered":true}`
	a := newGeneralSchool(t, "A중학교", []struct{ num, grade, status, extra string }{
		{"1", "A", "합격", entered}, {"2", "B", "합격", entered}, {"3", "E", "불합격", entered},
	})
	b := newGeneralSchool(t, "B중학교", []struct{ num, grade, status, extra string }{
		{"1", "A", "합격", `{}`}, {"2", "C", "합격", `{}`}, {"3", "E", "불합격", `{}`},
	})
	dir := t.TempDir()
	pa, pb := filepath.Join(dir, "a.kkomi"), filepath.Join(dir, "b.kkomi")
	if err := ExportSharedPackageV2(a, 2027, "pw-a-1234", pa); err != nil {
		t.Fatal(err)
	}
	if err := ExportSharedPackageV2(b, 2027, "pw-b-1234", pb); err != nil {
		t.Fatal(err)
	}
	cons := &database.DBManager{DataDir: t.TempDir()}
	key, _ := crypto.NewDataKey()
	cons.SetDataKey(key)
	if err := cons.InitConfigDB(); err != nil {
		t.Fatal(err)
	}
	for path, pw := range map[string]string{pa: "pw-a-1234", pb: "pw-b-1234"} {
		if _, err := ImportSharedPackageV2(cons, pw, path); err != nil {
			t.Fatal(err)
		}
	}
	if err := cons.SaveGeneralQuotaRecord(database.GeneralQuotaRecord{AdmissionYear: 2027, Quota: 2, Applicants: 3}); err != nil {
		t.Fatal(err)
	}
	res, err := cons.GetConsolidatedGeneralCutoff(2027)
	if err != nil {
		t.Fatal(err)
	}
	if res.ParticipatingSchool != 2 || res.ConfirmedRecords != 6 {
		t.Fatalf("참여 학교 %d, 확정 자료 %d (want 2, 6)", res.ParticipatingSchool, res.ConfirmedRecords)
	}
	if res.Base.SampleCount != 6 || res.Base.AcceptedCount != 4 || res.Base.RejectedCount != 2 {
		t.Fatalf("기본 지표 표본: %+v", res.Base)
	}
	// 가산점을 입력한 A중학교 3명만 완전 총점 잣대에 들어간다.
	if res.Total.SampleCount != 3 {
		t.Fatalf("완전 총점 표본 = %d, want 3", res.Total.SampleCount)
	}
	if !(res.Base.RangeLow < res.Base.RangeHigh) || res.Base.RangeLow != res.Base.RejectedMax {
		t.Fatalf("합격선 범위: %+v", res.Base)
	}
	// 정원 2 ÷ 지원자 3 → 표본 6명 중 상위 4번째 점수
	if res.Base.QuotaCutoff <= 0 || res.Base.QuotaCutoff > res.Base.RangeHigh+0.001 {
		t.Fatalf("정원 비율 추정선: %+v", res.Base)
	}
	if !res.Base.SmallSample { // 불합격 표본이 2명뿐이므로 참고용 표시
		t.Fatalf("불합격 표본 2명은 표본 부족으로 표시해야 함: %+v", res.Base)
	}
}
