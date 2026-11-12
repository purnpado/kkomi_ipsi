// 꼬미입시 가상 입시 시뮬레이터
//
// 관내 중학교 여러 곳이 여러 해 동안 꼬미입시를 쓰는 상황을 가상으로 돌린다.
// 해마다 새 학생 자료(나이스 CSV)를 실제 가져오기 기능으로 올리고, 요강 구조를 따른 가상 선발
// (1차 배수·2차 면접·학과 배정·특별→일반 자동 전형·후기 정원 컷)로 합격자를 정한 뒤,
// 결과를 각 학교 프로그램에 기록·확정하고 관내 공유 파일을 주고받는다. 다음 해에는 "새 학년 시작"으로 넘어간다.
// 지역 전체의 실제 합격선(정답)과 프로그램이 낸 추정·판정을 비교한 보고서를 만든다.
//
// 사용법(저장소 최상위에서): go run ./tools/simulate [-years 5] [-from 2023] [-seed 1] [-out test-data/시뮬레이션]
// 모든 자료는 가상이며 출력 폴더(test-data/)는 git 제외 대상이다.
package main

import (
	"flag"
	"fmt"
	"math/rand"
	"os"
	"path/filepath"
	"time"
)

func main() {
	years := flag.Int("years", 5, "시뮬레이션할 학년도 수")
	from := flag.Int("from", 2023, "첫 고입 학년도")
	seed := flag.Int64("seed", 1, "난수 씨앗(같으면 같은 결과)")
	out := flag.String("out", filepath.Join("test-data", "시뮬레이션"), "출력 폴더")
	flag.Parse()

	if err := os.RemoveAll(*out); err != nil {
		fail(err)
	}
	catalog, err := loadCatalog(filepath.Join("server-data", "highschools.json"))
	if err != nil {
		fail(err)
	}
	sm := &sim{root: *out, rng: rand.New(rand.NewSource(*seed)), schools: newSchools(*out), catalog: catalog}
	start := time.Now()
	for y := *from; y < *from+*years; y++ {
		t := time.Now()
		yr, err := sm.runYear(y)
		if err != nil {
			fail(fmt.Errorf("%d 고입: %w", y, err))
		}
		sm.predict(yr, studentsOf(yr))
		sm.years = append(sm.years, yr)
		fmt.Printf("%d 고입 완료: 지역 %d명, 원서 %d건 (%.0f초)\n", y, yr.regionN, len(yr.apps), time.Since(t).Seconds())
	}
	report := sm.report()
	path := filepath.Join(*out, "보고서.md")
	if err := os.WriteFile(path, []byte(report), 0o600); err != nil {
		fail(err)
	}
	if err := sm.exportViewable(); err != nil {
		fail(err)
	}
	fmt.Printf("보고서: %s (전체 %.0f초)\n", path, time.Since(start).Seconds())
	fmt.Printf("앱에서 열어 볼 자료: %s\n", filepath.Join(*out, "열람용", "안내.txt"))
}

func studentsOf(yr *yearResult) []*student {
	seen := map[*student]bool{}
	out := []*student{}
	for _, a := range yr.apps {
		if !seen[a.stu] {
			seen[a.stu] = true
			out = append(out, a.stu)
		}
	}
	return out
}

func fail(err error) {
	fmt.Fprintln(os.Stderr, "오류:", err)
	os.Exit(1)
}
