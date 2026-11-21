package database

import (
	"errors"
	"testing"

	"PHGC/internal/model"
)

// 2027 울산 입학전형 기본 계획 "4. 이중 지원 금지"의 경우들.
func TestRoundConflictRules(t *testing.T) {
	app := func(category, school, track, status string) model.ApplicationRecord {
		return model.ApplicationRecord{AdmissionYear: 2027, Category: category, SchoolName: school, Track: track, Status: status}
	}
	tests := []struct {
		name    string
		a, b    model.ApplicationRecord
		blocked bool
	}{
		{"전기 2개교 동시(마이스터고+특성화고 진행 중)", app("meister", "울산마이스터고등학교", "일반", "지원완료"), app("special", "울산공업고등학교", "일반", "지원희망"), true},
		{"같은 마이스터고의 일반·특별전형(1개교)", app("meister", "울산마이스터고등학교", "일반", "지원완료"), app("meister", "울산마이스터고", "특별", "지원희망"), false},
		{"다른 마이스터고 2개교", app("meister", "울산마이스터고등학교", "일반", "지원완료"), app("meister", "현대공업고등학교", "일반", "지원희망"), true},
		{"마이스터고 불합격 뒤 특성화고", app("meister", "울산마이스터고등학교", "일반", "불합격"), app("special", "울산공업고등학교", "일반", "지원희망"), false},
		{"마이스터고 1차 불합격 뒤 특성화고", model.ApplicationRecord{AdmissionYear: 2027, Category: "meister", SchoolName: "현대공업고등학교", Track: "일반", Status: "지원완료", FirstStageResult: "불합격"}, app("special", "울산상업고등학교", "취업희망자", "지원희망"), false},
		{"특성화고 불합격 뒤 마이스터고(예외 아님)", app("special", "울산공업고등학교", "일반", "불합격"), app("meister", "울산마이스터고등학교", "일반", "지원희망"), true},
		{"특성화고 특별 불합격 뒤 일반", app("special", "울산상업고등학교", "취업희망자 특별전형", "불합격"), app("special", "울산공업고등학교", "일반전형", "지원희망"), false},
		{"특성화고 일반 불합격 뒤 특별", app("special", "울산공업고등학교", "일반전형", "불합격"), app("special", "울산상업고등학교", "취업희망자", "지원희망"), false},
		{"특성화고 일반 불합격 뒤 다른 학교 일반(예외 아님)", app("special", "울산공업고등학교", "일반전형", "불합격"), app("special", "울산상업고등학교", "일반전형", "지원희망"), true},
		{"예술고 불합격 뒤 애니원고", app("other", "울산예술고등학교", "", "불합격"), app("other", "울산애니원고등학교", "", "지원희망"), true},
		{"과학고와 특성화고", app("other", "울산과학고등학교", "", "불합격"), app("special", "울산공업고등학교", "일반", "지원희망"), true},
		{"옛 자사고·외고 구분의 과학고도 전기", app("self_foreign", "울산과학고등학교", "", "지원완료"), app("meister", "울산에너지고등학교", "일반", "지원희망"), true},
		{"울산 전기 + 타 시도 전기", app("special", "울산공업고등학교", "일반", "불합격"), app("out_province", "부산기계공업고등학교", RoundTrackEarly, "지원희망"), true},
		{"울산 후기 일반고 + 타 시도 후기", app("general", "", "", "지원예정"), app("out_province", "경기외국어고등학교", RoundTrackLate, "지원희망"), true},
		{"외고 + 타 시도 후기", app("other", "울산외국어고등학교", "", "지원완료"), app("out_province", "부산국제고등학교", RoundTrackLate, "지원희망"), true},
		{"외고 지원자의 후기 일반고(예외)", app("self_foreign", "울산외국어고등학교", "", "지원완료"), app("general", "", "", "지원예정"), false},
		{"자사고 지원자의 후기 일반고(예외)", app("other", "현대청운고등학교", "", "지원완료"), app("general", "", "", "지원예정"), false},
		{"고운고 불합격 뒤 후기 일반고", app("other", "울산고운고등학교", "", "불합격"), app("general", "", "", "지원예정"), false},
		{"전기 진행 중 + 후기 일반고(결과 전 입력)", app("special", "울산공업고등학교", "일반", "지원완료"), app("general", "", "", "지원예정"), false},
		{"외고 진행 중 + 특성화고(조항 없음)", app("other", "울산외국어고등학교", "", "지원완료"), app("special", "울산공업고등학교", "일반", "지원희망"), false},
		{"후기 불합격 뒤 전기 추가모집", app("general", "", "", "불합격"), model.ApplicationRecord{AdmissionYear: 2027, Category: "special", SchoolName: "울산산업고등학교", Track: "일반", Status: "지원희망", ExtraRound: true}, false},
		{"전기 불합격 뒤 다른 전기 추가모집(추가모집은 계산에서 뺌)", app("special", "울산공업고등학교", "일반", "불합격"), model.ApplicationRecord{AdmissionYear: 2027, Category: "special", SchoolName: "울산산업고등학교", Track: "일반", Status: "지원희망", ExtraRound: true}, false},
		{"이중지원 예외 학교(영재학교 등)", app("out_province", "한국과학영재학교", RoundTrackExempt, "지원완료"), app("other", "울산과학고등학교", "", "지원희망"), false},
		{"시기를 모르는 예전 타시도 원서는 보지 않음", app("out_province", "어느고등학교", "일반전형", "지원완료"), app("special", "울산공업고등학교", "일반", "지원희망"), false},
		{"목록에 없는 울산 학교: 전기로 고름", app("other", "어느울산고등학교", RoundTrackEarly, "지원완료"), app("meister", "울산마이스터고등학교", "일반", "지원희망"), true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := roundRuleConflict(tt.a, tt.b) != ""
			if got != tt.blocked {
				t.Fatalf("막음=%v, 기대 %v (이유: %q)", got, tt.blocked, roundRuleConflict(tt.a, tt.b))
			}
			if back := roundRuleConflict(tt.b, tt.a) != ""; back != got {
				t.Fatalf("순서를 바꾸면 결과가 다릅니다: %v / %v", got, back)
			}
		})
	}
}

// 지원희망이 끼면 막지 않고, 지원완료로 낼 때 함께 낼 수 없는 지원희망을 찾는다.
func TestWishApplicationsAreNotBlocked(t *testing.T) {
	early := model.ApplicationRecord{AdmissionYear: 2027, Category: "meister", SchoolName: "울산마이스터고등학교", Track: "일반", Status: "지원희망"}
	done := model.ApplicationRecord{AdmissionYear: 2027, Category: "special", SchoolName: "울산공업고등학교", Track: "일반", Status: "지원완료"}
	if roundConflict(early, done) != "" {
		t.Fatal("지원희망과 지원완료는 함께 둘 수 있어야 합니다")
	}
	general := model.ApplicationRecord{AdmissionYear: 2027, Category: "general", Status: "지원예정"}
	got := ConflictingWishes([]model.ApplicationRecord{early, general}, done)
	if len(got) != 1 || got[0].Category != "meister" {
		t.Fatalf("함께 낼 수 없는 지원희망은 마이스터고 하나: %+v", got)
	}
	if len(ConflictingWishes([]model.ApplicationRecord{done}, early)) != 0 {
		t.Fatal("지원희망으로 저장할 때는 지울 원서가 없어야 합니다")
	}
}

// 저장할 때 막고, 이미 있는 원서의 결과만 고치는 것은 막지 않는다.
func TestSaveApplicationRoundRules(t *testing.T) {
	dm := newEvidenceTestDB(t)
	base := model.ApplicationRecord{ClassNum: 1, StudentNum: "1", StudentName: "가상학생", AdmissionYear: 2027}
	with := func(category, school, track, status string) model.ApplicationRecord {
		r := base
		r.Category, r.SchoolName, r.Track, r.Status = category, school, track, status
		return r
	}
	if err := dm.SaveApplication(with("special", "울산공업고등학교", "일반전형", "지원완료")); err != nil {
		t.Fatal(err)
	}
	// 지원희망은 아직 낸 원서가 아니라 함께 둘 수 있다.
	if err := dm.SaveApplication(with("meister", "울산마이스터고등학교", "일반", "지원희망")); err != nil {
		t.Fatalf("지원희망은 막지 않아야 합니다: %v", err)
	}
	err := dm.SaveApplication(with("meister", "현대공업고등학교", "일반", "지원완료"))
	if !errors.Is(err, ErrDoubleApply) {
		t.Fatalf("전기 2개교 지원완료는 막아야 합니다: %v", err)
	}
	// 특성화고 지원완료와 함께 낼 수 없는 지원희망(마이스터고)을 찾는다.
	wishes, err := dm.ConflictingWishApplications(with("special", "울산공업고등학교", "일반전형", "지원완료"))
	if err != nil || len(wishes) != 1 || wishes[0].SchoolName != "울산마이스터고등학교" {
		t.Fatalf("함께 낼 수 없는 지원희망: %+v %v", wishes, err)
	}
	if err := dm.DeleteApplication(1, "1", "가상학생", "meister", "울산마이스터고등학교", "일반"); err != nil {
		t.Fatal(err)
	}
	if err := dm.SaveApplication(with("general", "", "", "지원예정")); err != nil {
		t.Fatalf("후기 일반고는 함께 넣을 수 있어야 합니다: %v", err)
	}
	// 이미 있는 원서는 결과를 고칠 수 있다.
	rows, _ := dm.GetStudentApplications(1, "1", "가상학생")
	for _, r := range rows {
		if r.Category == "special" {
			r.Status = "불합격"
			if err := dm.SaveApplication(r); err != nil {
				t.Fatalf("결과 고치기는 막지 않아야 합니다: %v", err)
			}
		}
	}
	// 특성화고 일반 불합격 뒤 특별전형은 된다.
	if err := dm.SaveApplication(with("special", "울산상업고등학교", "취업희망자 특별전형", "지원희망")); err != nil {
		t.Fatalf("특성화고 일반 불합격 뒤 특별전형은 넣을 수 있어야 합니다: %v", err)
	}
}
