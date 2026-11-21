package database

import (
	"database/sql"
	"fmt"
	"strings"

	"PHGC/internal/model"
)

// 이중지원 금지(2027학년도 울산광역시 고등학교 입학전형 기본 계획 4. 이중 지원 금지, 사용자 제공 2026-11-21).
// 합격·최종 진학·등록 포기 뒤의 새 원서는 application_lock.go 가 막고, 여기서는 지원 시기(전기·후기)에 따른 규칙을 본다.
//
//   - 전기 고등학교 2개교 이상 지원 금지(울산·타 시도 모두). 예외: 마이스터고 불합격 → 특성화고,
//     특성화고 특별전형(취업자) 불합격 ↔ 특성화고 일반전형. 예술고 불합격 뒤 애니원고 등 다른 전기고도 금지.
//   - 울산 후기 ↔ 타 시도 후기 동시 지원 금지. 자사고·외고(·각종학교 고운고) 지원자의 후기 일반고 지원은 예외로 허용.
//   - 추가모집 원서는 전기 2개교 계산에서 뺀다(후기 합격자의 추가모집은 합격 잠금이 막는다).
//   - 이중지원 예외 학교(영재학교·대안학교·평생교육시설·군인자녀 전형 등)는 보지 않는다.
//   - 지원희망(일반고 "지원예정")은 아직 낸 원서가 아니라서 막지 않는다. 두 원서가 모두 지원완료 이상일 때만 막고,
//     한 원서를 지원완료로 저장할 때 함께 낼 수 없는 지원희망 원서는 화면이 확인을 받아 지운다(ConflictingWishes, 사용자 결정 2026-11-21).
//
// 울산 고교의 시기는 2027 입학전형 일정표(별첨 1) 기준: 전기 = 과학고·스포츠과학고·마이스터고·예술고·특성화고(애니원고 포함),
// 후기 = 외고·자사고(현대청운고)·일반고. 고운고(각종학교)는 불합격하면 후기 일반고에 지원할 수 있어 외고·자사고와 같게 본다.
// 목록에 없는 학교·타 시도 고교는 원서의 전형 칸에 고른 시기("전기"·"후기"·"이중지원 예외")를 쓴다.

type applyRound int

const (
	roundNone       applyRound = iota // 미진학 등 원서가 아님
	roundExempt                       // 이중지원 예외(또는 시기를 모름)
	roundEarly                        // 전기
	roundLate                         // 후기(일반고·타 시도 후기)
	roundLateSchool                   // 후기 외고·자사고·고운고(일반고와 함께 지원 가능)
)

// 원서 전형 칸에 적는 시기(목록에 없는 학교·타 시도 고교)
const (
	RoundTrackEarly  = "전기"
	RoundTrackLate   = "후기"
	RoundTrackExempt = "이중지원 예외"
)

// ulsanOtherRounds "기타 울산 고교"(옛 자사고·외고 포함)의 학교 이름 앞부분 → 시기.
var ulsanOtherRounds = []struct {
	prefix string
	round  applyRound
}{
	{"울산스포츠과학", roundEarly}, {"울산과학", roundEarly}, {"울산예술", roundEarly}, {"울산애니원", roundEarly},
	{"울산외국어", roundLateSchool}, {"울산외고", roundLateSchool}, {"현대청운", roundLateSchool}, {"울산고운", roundLateSchool},
}

func roundFromTrack(track string) applyRound {
	t := strings.TrimSpace(track)
	switch {
	case strings.HasPrefix(t, RoundTrackEarly):
		return roundEarly
	case strings.HasPrefix(t, RoundTrackLate):
		return roundLate
	}
	return roundExempt
}

// roundOf 원서의 지원 시기와 울산 고교인지.
func roundOf(r model.ApplicationRecord) (applyRound, bool) {
	switch r.Category {
	case "meister", "special":
		return roundEarly, true
	case "general":
		return roundLate, true
	case "other", "self_foreign":
		name := strings.ReplaceAll(r.SchoolName, " ", "")
		for _, s := range ulsanOtherRounds {
			if strings.HasPrefix(name, s.prefix) {
				return s.round, true
			}
		}
		return roundFromTrack(r.Track), true
	case "out_province":
		return roundFromTrack(r.Track), false
	}
	return roundNone, false
}

func isFailed(r model.ApplicationRecord) bool {
	return r.Status == "불합격" || r.FirstStageResult == "불합격"
}

// isEmploymentTrack 특성화고 특별전형(취업자·취업희망자)인지.
func isEmploymentTrack(track string) bool {
	return strings.Contains(track, "취업") || strings.Contains(track, "특별")
}

// earlyException 전기 두 원서 중 failed 가 불합격이고 next 가 예외로 허용되는 지원인지.
func earlyException(failed, next model.ApplicationRecord) bool {
	if !isFailed(failed) {
		return false
	}
	if failed.Category == "meister" && next.Category == "special" {
		return true
	}
	return failed.Category == "special" && next.Category == "special" && isEmploymentTrack(failed.Track) != isEmploymentTrack(next.Track)
}

// isWishStatus 아직 내지 않은 원서(지원희망·지원예정).
func isWishStatus(status string) bool {
	switch strings.ReplaceAll(strings.TrimSpace(status), " ", "") {
	case "", "지원희망", "지원예정":
		return true
	}
	return false
}

// roundConflict 두 원서를 함께 낼 수 없으면 그 이유(조항), 괜찮으면 "". 지원희망이 끼면 막지 않는다.
func roundConflict(a, b model.ApplicationRecord) string {
	if isWishStatus(a.Status) || isWishStatus(b.Status) {
		return ""
	}
	return roundRuleConflict(a, b)
}

// ConflictingWishes record 를 지원완료로 낼 때 함께 낼 수 없는 지원희망 원서들.
func ConflictingWishes(others []model.ApplicationRecord, record model.ApplicationRecord) []model.ApplicationRecord {
	out := []model.ApplicationRecord{}
	if isWishStatus(record.Status) {
		return out
	}
	for _, o := range others {
		if o.AdmissionYear != record.AdmissionYear || !isWishStatus(o.Status) || sameApplicationKey(o, record) || (record.ID > 0 && o.ID == record.ID) {
			continue
		}
		if roundRuleConflict(o, record) != "" {
			out = append(out, o)
		}
	}
	return out
}

// ConflictingWishApplications 저장하려는 원서와 함께 낼 수 없는 그 학생의 지원희망 원서(화면이 지울지 묻는다).
func (dm *DBManager) ConflictingWishApplications(record model.ApplicationRecord) ([]model.ApplicationRecord, error) {
	apps, err := dm.GetStudentApplications(record.ClassNum, record.StudentNum, record.StudentName)
	if err != nil {
		return nil, err
	}
	return ConflictingWishes(apps, record), nil
}

// roundRuleConflict 시기 규칙만 본다(상태와 상관없이).
func roundRuleConflict(a, b model.ApplicationRecord) string {
	ra, ua := roundOf(a)
	rb, ub := roundOf(b)
	if ra <= roundExempt || rb <= roundExempt {
		return ""
	}
	if ra == roundEarly && rb == roundEarly {
		if a.ExtraRound || b.ExtraRound {
			return ""
		}
		// "2개교 이상"이므로 같은 학교의 일반·특별전형을 함께 내는 것은 1개교다.
		if ua && ub && a.Category == b.Category && normalizeCutoffSchool(a.SchoolName) == normalizeCutoffSchool(b.SchoolName) {
			return ""
		}
		if ua && ub && (earlyException(a, b) || earlyException(b, a)) {
			return ""
		}
		if ua != ub {
			return "울산 전기 고등학교와 타 시도 전기 고등학교에 함께 지원할 수 없습니다"
		}
		return "전기 고등학교에 2개교 이상 지원할 수 없습니다(예외: 마이스터고 불합격 뒤 특성화고, 특성화고 특별·일반전형 중 불합격 뒤 다른 전형)"
	}
	if ra >= roundLate && rb >= roundLate && ua != ub {
		return "울산 후기 고등학교와 타 시도 후기 고등학교에 함께 지원할 수 없습니다"
	}
	return ""
}

func roundRecordLabel(r model.ApplicationRecord) string {
	name := strings.TrimSpace(r.SchoolName)
	if name == "" && r.Category == "general" {
		name = "후기 일반고"
	}
	if t := strings.TrimSpace(r.Track); t != "" && r.Category != "general" {
		name += " " + t
	}
	status := r.Status
	if r.FirstStageResult == "불합격" && status != "불합격" {
		status = "1차 불합격"
	}
	return fmt.Sprintf("%s(%s)", name, status)
}

// RoundConflictWith 학생의 다른 원서 가운데 record 와 함께 낼 수 없는 원서와 이유(없으면 nil).
func RoundConflictWith(others []model.ApplicationRecord, record model.ApplicationRecord) (*model.ApplicationRecord, string) {
	for i := range others {
		o := others[i]
		if o.AdmissionYear != record.AdmissionYear || sameApplicationKey(o, record) || (record.ID > 0 && o.ID == record.ID) {
			continue
		}
		if why := roundConflict(o, record); why != "" {
			return &others[i], why
		}
	}
	return nil, ""
}

func sameApplicationKey(a, b model.ApplicationRecord) bool {
	return a.AdmissionYear == b.AdmissionYear && a.Category == b.Category && a.SchoolName == b.SchoolName && a.Track == b.Track
}

// checkRoundRules 저장하려는 원서가 새 원서이거나 학교·전형을 바꾼 원서이면 지원 시기 규칙을 확인한다.
// 학교·전형을 그대로 두고 결과만 고치는 원서는 막지 않는다(예전에 저장된 원서도 결과는 고칠 수 있게).
func checkRoundRules(db *sql.DB, record model.ApplicationRecord) error {
	if r, _ := roundOf(record); r <= roundExempt {
		return nil
	}
	rows, err := db.Query(`SELECT id, admission_year, category, IFNULL(school_name,''), IFNULL(track,''), status, IFNULL(first_stage_result,''), IFNULL(extra_round,0)
		FROM student_applications WHERE student_num=? AND student_name=? AND admission_year=?`, record.StudentNum, record.StudentName, record.AdmissionYear)
	if err != nil {
		return err
	}
	var others []model.ApplicationRecord
	for rows.Next() {
		var o model.ApplicationRecord
		var extra int
		if err := rows.Scan(&o.ID, &o.AdmissionYear, &o.Category, &o.SchoolName, &o.Track, &o.Status, &o.FirstStageResult, &extra); err != nil {
			rows.Close()
			return err
		}
		o.ExtraRound = extra != 0
		if record.ID > 0 && o.ID == record.ID && sameApplicationKey(o, record) {
			rows.Close()
			return nil // 같은 원서의 결과만 고침
		}
		if record.ID == 0 && sameApplicationKey(o, record) {
			rows.Close()
			return nil
		}
		others = append(others, o)
	}
	rows.Close()
	if other, why := RoundConflictWith(others, record); other != nil {
		return fmt.Errorf("%w: %s. 이미 %s 원서가 있습니다", ErrDoubleApply, why, roundRecordLabel(*other))
	}
	return nil
}
