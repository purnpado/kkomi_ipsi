package database

import (
	"testing"

	"PHGC/internal/parser"
)

// 나이스 학년별 가산점으로 상담 화면 체크를 맞춘다(가산 제외 학년은 그대로).
func TestApplyNiceBonus(t *testing.T) {
	dm := newEvidenceTestDB(t)
	students := []parser.StudentExcelData{
		{ClassNum: 1, StudentNum: "1", Name: "가상학생", RawData: `[]`, ExtraData: `{"changche_1":true}`},
		{ClassNum: 1, StudentNum: "2", Name: "둘째학생", RawData: `[]`, ExtraData: `{"changche_disqualified_2":true}`},
	}
	if err := dm.SaveClassStudents(1, students); err != nil {
		t.Fatal(err)
	}
	rows := []parser.NiceBonusRow{
		{ClassNum: 1, StudentNum: "1", Bonus: [3]float64{0, 1, 1}},
		{ClassNum: 1, StudentNum: "2", Bonus: [3]float64{0, 1, 0}},
		{ClassNum: 1, StudentNum: "9", Bonus: [3]float64{1, 0, 0}},
	}
	plan, err := dm.PlanNiceBonus("changche", rows)
	if err != nil {
		t.Fatal(err)
	}
	// 1번: 1학년 해제, 2·3학년 체크 → 3건. 2번: 2학년은 가산 제외라 건드리지 않음. 9번: 없는 학생.
	if len(plan.Changes) != 3 || len(plan.Disqualified) != 1 || len(plan.Unmatched) != 1 || plan.Matched != 2 || plan.Same != 1 || plan.WithBonus != 3 {
		t.Fatalf("맞춰 보기: %+v", plan)
	}
	if _, err := dm.ApplyNiceBonus("changche", rows); err != nil {
		t.Fatal(err)
	}
	all, _ := dm.GetAllStudents(1)
	for _, s := range all[1] {
		e := extraMap(s.ExtraData)
		switch s.StudentNum {
		case "1":
			if e["changche_1"] != false || e["changche_2"] != true || e["changche_3"] != true || e["general_bonus_entered"] != true {
				t.Fatalf("1번 체크: %v", e)
			}
		case "2":
			if _, ok := e["changche_2"]; ok || e["changche_disqualified_2"] != true {
				t.Fatalf("2번은 가산 제외 학년을 건드리지 않아야 합니다: %v", e)
			}
		}
	}
	if again, _ := dm.PlanNiceBonus("changche", rows); len(again.Changes) != 0 {
		t.Fatalf("가져온 뒤에는 바뀔 것이 없어야 합니다: %+v", again.Changes)
	}
	if _, err := dm.PlanNiceBonus("", rows); err == nil {
		t.Fatal("종류를 모르면 오류")
	}
}
