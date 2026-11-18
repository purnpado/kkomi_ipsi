package database

import (
	"os"
	"testing"
	"time"

	"PHGC/internal/model"
)

func verifyTestDB(t *testing.T) *DBManager {
	t.Helper()
	dm := newEvidenceTestDB(t) // 우리 학교 "가람중학교", 2027
	if err := dm.InitSharedDatabaseTables(); err != nil {
		t.Fatal(err)
	}
	return dm
}

func simplePkg(school string, year int, recs ...AnonymousApplicationRecord) *SharedPackageV2 {
	return &SharedPackageV2{Cover: SharedPackageCover{SchoolName: school, AdmissionYear: year, CreatedAt: time.Now(), FormatVersion: 2, RecordCount: len(recs)}, AnonymousRecords: recs}
}

func acc(score float64) AnonymousApplicationRecord {
	return AnonymousApplicationRecord{HighSchool: "울산상업고", Track: "일반", Status: "합격", Score: score, FirstStageResult: "합격",
		FormulaVersion: "울산상업고-일반/2027요강", ScoreDetails: model.ApplicationScoreDetails{TotalScore: score}}
}

// 원서 한 건 점검: 범위·학교명·결과 값·산출식 연도·손으로 고친 점수·비정상적으로 낮은 점수.
func TestVerifySharedRecordChecks(t *testing.T) {
	dm := verifyTestDB(t)
	bad := []AnonymousApplicationRecord{
		acc(150), // 100점 만점 초과 → 오류
		{HighSchool: "울산상업고교", Track: "일반", Status: "합격", Score: 80},                                                                                         // 모르는 학교 → 오류
		{HighSchool: "울산상업고", Track: "일반", Status: "합격(추가)", Score: 80},                                                                                      // 결과 값 → 오류
		{HighSchool: "울산상업고", Track: "일반", Status: "합격", Score: 80, FormulaVersion: "울산상업고-일반/2026요강"},                                                       // 산출식 연도 → 확인
		{HighSchool: "울산상업고", Track: "일반", Status: "합격", Score: 85, ScoreDetails: model.ApplicationScoreDetails{TotalScore: 78}},                             // 손으로 고침 → 확인
		{HighSchool: "울산상업고", Track: "일반", Status: "불합격", Score: 8.1, FirstStageResult: "불합격", ScoreDetails: model.ApplicationScoreDetails{TotalScore: 8.1}}, // 너무 낮음 → 확인
	}
	if _, err := dm.StoreSharedPackage(simplePkg("다른중학교", 2027, bad...)); err != nil {
		t.Fatal(err)
	}
	report, err := dm.VerifySharedData()
	if err != nil {
		t.Fatal(err)
	}
	codes := map[string]string{}
	for _, is := range report.Issues {
		codes[is.Code] = is.Level
	}
	for code, level := range map[string]string{"range": "error", "unknown": "error", "status": "error", "formula": "warning", "snapshot": "warning", "too_low": "warning"} {
		if codes[code] != level {
			t.Errorf("%s 점검이 %s로 나와야 합니다: %v", code, level, codes)
		}
	}
	if len(report.Schools) != 1 || report.Schools[0].Errors != 3 {
		t.Fatalf("학교 요약: %+v", report.Schools)
	}
}

// 다른 학교들 합격 점수보다 크게 낮고 그보다 높은 1차 불합격자가 있는 합격은 확인 필요. 자기 학교 점수는 비교 기준에서 뺀다.
// 불합격자가 없으면(미달) 낮은 합격도 정상이라 걸지 않는다.
func TestVerifySharedLowAcceptedOutlier(t *testing.T) {
	dm := verifyTestDB(t)
	_, _ = dm.StoreSharedPackage(simplePkg("가중학교", 2027, acc(80), acc(82), acc(78)))
	rej := AnonymousApplicationRecord{HighSchool: "울산상업고", Track: "일반", Status: "불합격", FirstStageResult: "불합격", Score: 60, ScoreDetails: model.ApplicationScoreDetails{TotalScore: 60}}
	_, _ = dm.StoreSharedPackage(simplePkg("나중학교", 2027, acc(81), acc(79), acc(83), rej)) // 60점 1차 불합격이 있으니 45점 합격은 앞뒤가 안 맞음
	_, _ = dm.StoreSharedPackage(simplePkg("다중학교", 2027, acc(80), acc(45)))               // 45점 합격은 의심
	report, err := dm.VerifySharedData()
	if err != nil {
		t.Fatal(err)
	}
	var hits []SharedVerifyIssue
	for _, is := range report.Issues {
		if is.Code == "low_accepted" {
			hits = append(hits, is)
		}
	}
	if len(hits) != 1 || hits[0].Score != 45 || hits[0].SchoolName != "다중학교" {
		t.Fatalf("튀는 합격 점수 한 건만 걸려야 합니다: %+v", hits)
	}
	if len(hits[0].RefScores) < 3 || hits[0].Fence <= 45 || hits[0].RefScope == "" {
		t.Fatalf("그림용 비교 자료·기준선이 함께 와야 합니다: %+v", hits[0])
	}

	// 미달(불합격자 없음)이면 같은 점수라도 걸지 않는다.
	under := verifyTestDB(t)
	_, _ = under.StoreSharedPackage(simplePkg("가중학교", 2027, acc(80), acc(82), acc(78)))
	_, _ = under.StoreSharedPackage(simplePkg("나중학교", 2027, acc(81), acc(79), acc(83)))
	_, _ = under.StoreSharedPackage(simplePkg("다중학교", 2027, acc(80), acc(45)))
	if r2, _ := under.VerifySharedData(); r2 != nil {
		for _, is := range r2.Issues {
			if is.Code == "low_accepted" {
				t.Fatalf("미달이면 낮은 합격을 걸면 안 됩니다: %+v", is)
			}
		}
	}
}

// 통계 제외: 원서 단위·파일 단위, 기준 학년도 이전 다른 학교 자료는 기본 제외, 우리 학교는 예외.
func TestSharedExclusionAffectsConsolidated(t *testing.T) {
	dm := verifyTestDB(t)
	_, _ = dm.StoreSharedPackage(simplePkg("가중학교", 2027, acc(80), acc(45)))
	_, _ = dm.StoreSharedPackage(simplePkg("나중학교", 2026, acc(70)))
	_, _ = dm.StoreSharedPackage(simplePkg("가람중학교", 2026, acc(75))) // 우리 학교
	stats, _ := dm.GetConsolidatedAdmissionStats(2027, "울산상업고", "", "일반", 1)
	if stats == nil || stats.AcceptedMin != 45 {
		t.Fatalf("제외 전 최저점 45: %+v", stats)
	}
	report, _ := dm.VerifySharedData()
	var low int64
	for _, is := range report.Issues {
		if is.Score == 45 {
			low = is.RecordID
		}
	}
	if low == 0 {
		// 비교 자료가 모자라 걸리지 않았으면 직접 찾는다
		db, _ := dm.OpenDB(dm.GetConfigDBPath())
		_ = db.QueryRow(`SELECT id FROM shared_anonymous_scores WHERE score = 45`).Scan(&low)
		db.Close()
	}
	if err := dm.SetSharedRecordExcluded(low, true); err != nil {
		t.Fatal(err)
	}
	if stats, _ := dm.GetConsolidatedAdmissionStats(2027, "울산상업고", "", "일반", 1); stats == nil || stats.AcceptedMin != 80 {
		t.Fatalf("원서 제외 뒤 최저점 80: %+v", stats)
	}
	for _, s := range report.Schools {
		switch s.SchoolName {
		case "나중학교":
			if !s.Excluded || !s.BeforeBaseline {
				t.Errorf("기준 이전 다른 학교 자료는 기본 제외: %+v", s)
			}
		case "가람중학교":
			if s.Excluded || !s.IsOwn {
				t.Errorf("우리 학교 자료는 기본 제외하지 않음: %+v", s)
			}
		}
	}
	// 인수인계로 넘겨도 제외 표시가 이어진다.
	pkgs, err := dm.ExportStoredSharedPackages()
	if err != nil {
		t.Fatal(err)
	}
	next := verifyTestDB(t)
	for i := range pkgs {
		if _, err := next.StoreSharedPackage(&pkgs[i]); err != nil {
			t.Fatal(err)
		}
	}
	if stats, _ := next.GetConsolidatedAdmissionStats(2027, "울산상업고", "", "일반", 1); stats == nil || stats.AcceptedMin != 80 {
		t.Fatalf("다음 학년도 폴더에서도 원서 제외 유지: %+v", stats)
	}
	if stats, _ := next.GetConsolidatedAdmissionStats(2026, "울산상업고", "", "일반", 1); stats == nil || stats.AcceptedMin != 75 {
		t.Fatalf("다음 학년도 폴더에서도 기준 이전 다른 학교 제외·우리 학교 포함 유지: %+v", stats)
	}
}

// 가상 오류 검출률 회귀: 기준값을 바꿔 검출률이 떨어지면 알 수 있게 한다.
func TestSharedVerifySimulationRecall(t *testing.T) {
	inj, det := map[string]int{}, map[string]int{}
	clean, cleanErr, cleanFlag := 0, 0, 0
	for seed := int64(1); seed <= 4; seed++ {
		dm := verifyTestDB(t)
		for _, pkg := range BuildSimSharedPackages(SimConfig{Seed: seed, Schools: 8, Year: 2027, ErrorRate: 0.03}) {
			p := pkg
			if _, err := dm.StoreSharedPackage(&p); err != nil {
				t.Fatal(err)
			}
		}
		report, err := dm.VerifySharedData()
		if err != nil {
			t.Fatal(err)
		}
		m, err := dm.EvaluateSimVerification(report)
		if err != nil {
			t.Fatal(err)
		}
		for k, v := range m.Injected {
			inj[k] += v
		}
		for k, v := range m.Detected {
			det[k] += v
		}
		clean, cleanErr, cleanFlag = clean+m.CleanCount, cleanErr+m.CleanErrorFlag, cleanFlag+m.CleanFlagged
	}
	for _, code := range []string{"decimal", "over_max", "unknown", "status", "old_formula", "manual"} {
		if inj[code] > 0 && det[code] != inj[code] {
			t.Errorf("%s: %d/%d만 검출", code, det[code], inj[code])
		}
	}
	if inj["flip_far"] > 0 && float64(det["flip_far"])/float64(inj["flip_far"]) < 0.8 {
		t.Errorf("크게 낮은 불합격자를 합격으로: %d/%d만 검출", det["flip_far"], inj["flip_far"])
	}
	if cleanErr != 0 || float64(cleanFlag)/float64(clean) > 0.03 {
		t.Errorf("정상 자료 오탐: 오류 %d건, 전체 %d/%d", cleanErr, cleanFlag, clean)
	}
}

// 현실형 가상 자료(학과 정원·1·2지망 배정·미달·관내 일부 학교만 참여): 2지망 배정 합격자를 걸지 않고, 크게 낮은 뒤바뀜은 대부분 잡는다.
func TestSharedVerifyRealisticSimulation(t *testing.T) {
	data, err := os.ReadFile("../../server-data/highschools.json")
	if err != nil {
		t.Fatal(err)
	}
	depts, err := LoadSimDepts(data, 2027)
	if err != nil || len(depts) == 0 {
		t.Fatalf("학과 정원: %v", err)
	}
	inj, det := 0, 0
	clean, cleanFlag, second, secondFlag := 0, 0, 0, 0
	for seed := int64(1); seed <= 6; seed++ {
		dm := verifyTestDB(t)
		for _, pkg := range BuildSimSharedPackages(SimConfig{Seed: seed, Schools: 8, Year: 2027, ErrorRate: 0.03, Realistic: true, DistrictSchools: 50, Depts: depts}) {
			p := pkg
			if _, err := dm.StoreSharedPackage(&p); err != nil {
				t.Fatal(err)
			}
		}
		report, err := dm.VerifySharedData()
		if err != nil {
			t.Fatal(err)
		}
		m, err := dm.EvaluateSimVerification(report)
		if err != nil {
			t.Fatal(err)
		}
		inj, det = inj+m.Injected["flip_far"], det+m.Detected["flip_far"]
		clean, cleanFlag = clean+m.CleanCount, cleanFlag+m.CleanFlagged
		second, secondFlag = second+m.CleanByKind["ok_2nd"], secondFlag+m.CleanFlagKind["ok_2nd"]
		if m.CleanErrorFlag != 0 {
			t.Errorf("정상 자료가 오류로 걸림: %d건", m.CleanErrorFlag)
		}
	}
	if second == 0 || secondFlag != 0 {
		t.Errorf("2지망 배정 합격자 %d명 중 %d명이 걸림", second, secondFlag)
	}
	if inj == 0 || float64(det)/float64(inj) < 0.75 {
		t.Errorf("크게 낮은 불합격자를 합격으로: %d/%d만 검출", det, inj)
	}
	if float64(cleanFlag)/float64(clean) > 0.005 {
		t.Errorf("정상 자료 확인 필요 %d/%d", cleanFlag, clean)
	}
}
