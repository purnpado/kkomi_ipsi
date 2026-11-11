// 가상 학생 CSV(tools/testdata/gen_students.py 출력)를 실제 가져오기·산출 코드로 읽어 결과를 요약한다.
// 사용법: go run ./tools/testdata/verify <자료 폴더> [유형 목록 CSV]
// 임시 폴더에 새 DB를 만들어 쓰므로 실제 data 폴더에는 손대지 않는다.
package main

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"PHGC/internal/calc"
	"PHGC/internal/database"
)

func must(err error) {
	if err != nil {
		fmt.Println("오류:", err)
		os.Exit(1)
	}
}

func main() {
	if len(os.Args) < 2 {
		fmt.Println("사용법: go run ./tools/testdata/verify <자료 폴더> [유형 목록 CSV]")
		os.Exit(2)
	}
	dir := os.Args[1]
	tmp, err := os.MkdirTemp("", "kkomi-verify-*")
	must(err)
	defer os.RemoveAll(tmp)
	dm := &database.DBManager{DataDir: tmp}
	dm.SetDataKey(make([]byte, 32))
	must(dm.InitConfigDB())
	must(dm.SaveSchoolConfig("가상중학교", 10, "", false, 2027))
	for c := 1; c <= 10; c++ {
		must(dm.InitClassDB(c))
	}
	sub, err := dm.ProcessMultipleExcel([]string{filepath.Join(dir, "1_교과학습발달상황.csv")})
	must(err)
	att, err := dm.ProcessMultipleAttendanceExcel([]string{filepath.Join(dir, "2_출결상황.csv")})
	must(err)
	vol, err := dm.ProcessMultipleVolunteerExcel([]string{filepath.Join(dir, "3_봉사활동상황.csv")})
	must(err)
	fmt.Printf("가져오기: 교과 %v\n          출결 %v\n          봉사 %v\n", sub, att, vol)

	tags := map[string]string{}
	if len(os.Args) > 2 {
		f, err := os.Open(os.Args[2])
		must(err)
		rows, _ := csv.NewReader(f).ReadAll()
		f.Close()
		for _, r := range rows[1:] {
			tags[r[0]+"_"+r[1]] = r[3]
		}
	}

	var all []calc.StudentFullData
	for c := 1; c <= 10; c++ {
		list, err := dm.GetClassFullGrades(c, true)
		must(err)
		all = append(all, list...)
	}
	fmt.Printf("학생 수: %d\n", len(all))

	// 후기 일반고
	thirdFinal, exact, projected := 0, 0, 0
	sort.Slice(all, func(i, j int) bool { return all[i].GeneralHSPercentile < all[j].GeneralHSPercentile })
	for _, s := range all {
		if s.GeneralHSThirdYearFinal {
			thirdFinal++
		}
		if s.GeneralHSPerGradeExact {
			exact++
		}
		if s.GeneralHSProjected {
			projected++
		}
	}
	fmt.Printf("후기 일반고: 3-2 반영 %d명, 출결·봉사 학년별 실제값 %d명, 예상 표시 %d명\n", thirdFinal, exact, projected)
	pick := []int{0, len(all) / 4, len(all) / 2, len(all) * 3 / 4, len(all) - 1}
	for _, i := range pick {
		s := all[i]
		fmt.Printf("  백분율 %6.2f%% 총점 %6.2f(~%6.2f) 교과 %6.2f 출석 %4.1f 봉사 %3.1f 기본지표 %6.2f  %d반 %s %s\n",
			s.GeneralHSPercentile, s.GeneralHSTotalScore, s.GeneralHSTotalHigh, s.GeneralHSAcademicScore,
			s.GeneralHSAttendanceScore, s.GeneralHSVolunteerScore, s.GeneralHSBaseScore, s.ClassNum, s.Name, tags[fmt.Sprintf("%d_%s", s.ClassNum, s.StudentNum)])
	}

	// 동점자·전 과목 A: 같은 성적이면 같은 석차·백분율이어야 한다(울산 지침: 동석차).
	fmt.Println("동점 확인(동점자·전 과목 A 유형):")
	for _, s := range all {
		t := tags[fmt.Sprintf("%d_%s", s.ClassNum, s.StudentNum)]
		if strings.Contains(t, "동점자") || strings.Contains(t, "전 과목 A") {
			fmt.Printf("  %d반 %s: 교과 %.2f 백분율 %.2f%% (%s)\n", s.ClassNum, s.Name, s.GeneralHSAcademicScore, s.GeneralHSPercentile, t)
		}
	}

	// 학교·전형별 1차 점수 분포
	type agg struct {
		min, max, sum float64
		n             int
		full          float64
	}
	byRule := map[string]*agg{}
	for _, s := range all {
		for _, r := range s.SchoolResults {
			k := r.SchoolName + "/" + r.TrackName
			a := byRule[k]
			if a == nil {
				a = &agg{min: 1e9, full: r.TotalMax}
				byRule[k] = a
			}
			a.n++
			a.sum += r.TotalScore
			if r.TotalScore < a.min {
				a.min = r.TotalScore
			}
			if r.TotalScore > a.max {
				a.max = r.TotalScore
			}
		}
	}
	keys := make([]string, 0, len(byRule))
	for k := range byRule {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	fmt.Println("학교·전형별 1차 점수(최저 / 평균 / 최고 / 만점):")
	for _, k := range keys {
		a := byRule[k]
		fmt.Printf("  %-18s %7.2f / %7.2f / %7.2f / %4.0f  (%d명)\n", k, a.min, a.sum/float64(a.n), a.max, a.full, a.n)
	}

	// 경우의 수 표본: 유형별 첫 학생의 핵심 값
	fmt.Println("유형별 표본:")
	seen := map[string]bool{}
	for _, s := range all {
		t := tags[fmt.Sprintf("%d_%s", s.ClassNum, s.StudentNum)]
		for _, one := range strings.Split(t, " / ") {
			if one == "" || one == "일반" || seen[one] {
				continue
			}
			seen[one] = true
			var att map[string]int
			if raw, err := dm.GetStudent(s.ClassNum, s.StudentNum, s.Name); err == nil {
				_ = json.Unmarshal([]byte(raw.AttendanceData), &att)
			}
			meister := 0.0
			for _, r := range s.SchoolResults {
				if r.SchoolName == "울산마이스터고" && r.TrackName == "일반" {
					meister = r.TotalScore
				}
			}
			fmt.Printf("  [%s] %d반 %s: 결석환산 %d(학년별 %d/%d/%d) 봉사 %d시간 → 후기 출석 %.1f 봉사 %.1f, 마이스터고 일반 %.2f\n",
				one, s.ClassNum, s.Name, s.AbsenceDays, att["1_absence"], att["2_absence"], att["3_absence"], s.TotalVolunteerHours,
				s.GeneralHSAttendanceScore, s.GeneralHSVolunteerScore, meister)
		}
	}
}
