package database

import (
	"encoding/json"
	"fmt"
	"strings"

	"PHGC/internal/parser"
)

// 나이스 항목별점수관리(창의체험·행동발달)의 학년별 가산점을 상담 화면의 후기 일반고 가산점 체크
// (extra_json 의 changche_1~3·haengbal_1~3)와 맞춰 보고 가져온다. 가산점이 0보다 크면 체크, 0이면 체크 해제.
// 징계 등으로 "가산 제외"를 체크한 학년(…_disqualified_N)은 건드리지 않는다. 가져오면 가산점 입력 완료로 기록한다.

// NiceBonusChange 한 학생·한 학년의 바뀌는 체크.
type NiceBonusChange struct {
	ClassNum   int    `json:"classNum"`
	StudentNum string `json:"studentNum"`
	Name       string `json:"name"`
	Grade      int    `json:"grade"`
	From       bool   `json:"from"` // 지금 꼬미입시 체크
	To         bool   `json:"to"`   // 나이스 가산점으로 정할 체크
}

// NiceBonusPlan 맞춰 보기 결과(가져오기 전에 보여 준다).
type NiceBonusPlan struct {
	Kind         string            `json:"kind"`         // changche·haengbal
	KindLabel    string            `json:"kindLabel"`    // 창의적체험활동·행동특성
	Students     int               `json:"students"`     // 파일의 학생 수
	Matched      int               `json:"matched"`      // 꼬미입시 학생과 맞춘 수
	Same         int               `json:"same"`         // 세 학년 모두 같은 학생 수
	WithBonus    int               `json:"withBonus"`    // 나이스에 가산점이 하나라도 있는 학생 수
	Changes      []NiceBonusChange `json:"changes"`      // 바뀌는 체크
	Disqualified []string          `json:"disqualified"` // 가산 제외라 건드리지 않는 학생·학년
	Unmatched    []string          `json:"unmatched"`    // 꼬미입시에 없는 학생
}

func niceBonusLabel(kind string) string {
	if kind == "changche" {
		return "창의적체험활동"
	}
	return "행동특성"
}

func extraMap(raw string) map[string]interface{} {
	m := map[string]interface{}{}
	if strings.TrimSpace(raw) != "" && json.Unmarshal([]byte(raw), &m) != nil {
		m = map[string]interface{}{}
	}
	return m
}

// planNiceBonus 파일 값과 지금 체크를 비교한다. apply 가 true 면 바꿀 학생의 새 extra_json 도 돌려준다.
func (dm *DBManager) planNiceBonus(kind string, rows []parser.NiceBonusRow, apply bool) (*NiceBonusPlan, map[[3]string]string, error) {
	if kind != "changche" && kind != "haengbal" {
		return nil, nil, fmt.Errorf("창의체험·행동발달 중 어느 파일인지 알 수 없습니다. 나이스에서 받은 파일 이름(항목별점수관리(창의체험)·(행동발달))을 그대로 두고 올려 주세요")
	}
	config, err := dm.GetSchoolConfig()
	if err != nil || config == nil {
		return nil, nil, fmt.Errorf("학교 설정을 불러올 수 없습니다")
	}
	all, err := dm.GetAllStudents(config.ClassCount)
	if err != nil {
		return nil, nil, err
	}
	plan := &NiceBonusPlan{Kind: kind, KindLabel: niceBonusLabel(kind), Students: len(rows), Changes: []NiceBonusChange{}, Disqualified: []string{}, Unmatched: []string{}}
	updates := map[[3]string]string{}
	for _, r := range rows {
		bonusAny := r.Bonus[0] > 0 || r.Bonus[1] > 0 || r.Bonus[2] > 0
		if bonusAny {
			plan.WithBonus++
		}
		var found bool
		for i := range all[r.ClassNum] {
			s := all[r.ClassNum][i]
			if normalizeNum(s.StudentNum) != normalizeNum(r.StudentNum) {
				continue
			}
			found = true
			plan.Matched++
			extra := extraMap(s.ExtraData)
			changed := false
			for g := 1; g <= 3; g++ {
				key := fmt.Sprintf("%s_%d", kind, g)
				now, _ := extra[key].(bool)
				want := r.Bonus[g-1] > 0
				if dis, _ := extra[fmt.Sprintf("%s_disqualified_%d", kind, g)].(bool); dis {
					if want != now {
						plan.Disqualified = append(plan.Disqualified, fmt.Sprintf("%d반 %s번 %s %d학년(가산 제외)", s.ClassNum, s.StudentNum, s.Name, g))
					}
					continue
				}
				if now == want {
					continue
				}
				changed = true
				plan.Changes = append(plan.Changes, NiceBonusChange{ClassNum: s.ClassNum, StudentNum: s.StudentNum, Name: s.Name, Grade: g, From: now, To: want})
				extra[key] = want
			}
			if !changed {
				plan.Same++
			}
			if apply {
				extra["general_bonus_entered"] = true
				if b, err := json.Marshal(extra); err == nil {
					updates[[3]string{fmt.Sprint(s.ClassNum), s.StudentNum, s.Name}] = string(b)
				}
			}
			break
		}
		if !found {
			plan.Unmatched = append(plan.Unmatched, fmt.Sprintf("%d반 %s번", r.ClassNum, r.StudentNum))
		}
	}
	return plan, updates, nil
}

// PlanNiceBonus 맞춰 보기만 한다(아무것도 바꾸지 않음).
func (dm *DBManager) PlanNiceBonus(kind string, rows []parser.NiceBonusRow) (*NiceBonusPlan, error) {
	plan, _, err := dm.planNiceBonus(kind, rows, false)
	return plan, err
}

// ApplyNiceBonus 나이스 가산점으로 상담 화면 체크를 맞추고 가산점 입력 완료로 기록한다. 바꾼 학생 수를 돌려준다.
func (dm *DBManager) ApplyNiceBonus(kind string, rows []parser.NiceBonusRow) (*NiceBonusPlan, error) {
	plan, updates, err := dm.planNiceBonus(kind, rows, true)
	if err != nil {
		return nil, err
	}
	for key, extra := range updates {
		var classNum int
		fmt.Sscan(key[0], &classNum)
		if err := dm.UpdateStudentExtra(classNum, key[1], key[2], extra); err != nil {
			return nil, err
		}
	}
	return plan, nil
}
