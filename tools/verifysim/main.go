// 관내 공유 자료 검증 검출률 측정(개발용).
// 실제 산출 규칙으로 학교 여러 곳의 가상 공유 파일을 만들고 오류를 일부러 섞은 뒤,
// 자료 검증이 오류를 몇 % 잡는지(검출률)와 정상 자료를 몇 % 잘못 거는지(오탐률)를 기준값(K)별로 잰다.
// 사용: go run ./tools/verifysim [-seeds 20] [-schools 8] [-rate 0.03] [-k 1.0,1.5,2.0,3.0]
// 결과: test-data/검증시뮬레이션/보고서.md (git 제외)
package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"PHGC/internal/crypto"
	"PHGC/internal/database"
)

func main() {
	seeds := flag.Int("seeds", 20, "난수 씨앗 수(반복 횟수)")
	schools := flag.Int("schools", 8, "관내 학교 수")
	rate := flag.Float64("rate", 0.03, "원서 한 건에 오류를 섞을 확률")
	minRef := flag.Int("minref", database.SharedOutlierMinRef, "튀는 값 판정에 필요한 비교 자료 최소 수")
	ks := flag.String("k", "1.0,1.5,2.0,2.5,3.0", "튀는 값 판정 폭(IQR 배수) 후보")
	out := flag.String("out", filepath.Join("test-data", "검증시뮬레이션"), "출력 폴더")
	flag.Parse()
	database.SharedOutlierMinRef = *minRef

	var lines []string
	lines = append(lines, "# 관내 공유 자료 검증 검출률 측정", "",
		fmt.Sprintf("가상 학교 %d곳 × 씨앗 %d개, 원서 오류 섞는 확률 %.1f%%, 비교 자료 최소 %d건. 실제 산출 규칙(학교·전형·만점) 사용.", *schools, *seeds, *rate*100, *minRef), "")
	header := "| K | " + strings.Join(database.SimErrorCodes(), " | ") + " | 정상 오탐(전체) | 정상 오탐(오류) |"
	lines = append(lines, header, "|"+strings.Repeat("---|", len(database.SimErrorCodes())+3))
	for _, kText := range strings.Split(*ks, ",") {
		k, err := strconv.ParseFloat(strings.TrimSpace(kText), 64)
		if err != nil {
			continue
		}
		database.SharedOutlierK = k
		total := database.SimMetrics{Injected: map[string]int{}, Detected: map[string]int{}}
		for seed := 1; seed <= *seeds; seed++ {
			m, err := runOnce(int64(seed), *schools, *rate)
			if err != nil {
				fmt.Fprintln(os.Stderr, "실패:", err)
				os.Exit(1)
			}
			for c, n := range m.Injected {
				total.Injected[c] += n
			}
			for c, n := range m.Detected {
				total.Detected[c] += n
			}
			total.CleanCount += m.CleanCount
			total.CleanFlagged += m.CleanFlagged
			total.CleanErrorFlag += m.CleanErrorFlag
		}
		row := fmt.Sprintf("| %.1f |", k)
		for _, c := range database.SimErrorCodes() {
			row += fmt.Sprintf(" %s |", pct(total.Detected[c], total.Injected[c]))
		}
		row += fmt.Sprintf(" %s | %s |", pct(total.CleanFlagged, total.CleanCount), pct(total.CleanErrorFlag, total.CleanCount))
		lines = append(lines, row)
	}
	lines = append(lines, "", "오류 종류:")
	for _, t := range database.SimErrorTypes {
		lines = append(lines, fmt.Sprintf("- `%s`: %s", t.Code, t.Name))
	}
	report := strings.Join(lines, "\n") + "\n"
	fmt.Print(report)
	_ = os.MkdirAll(*out, 0o755)
	_ = os.WriteFile(filepath.Join(*out, "보고서.md"), []byte(report), 0o644)
}

func pct(n, d int) string {
	if d == 0 {
		return "-"
	}
	return fmt.Sprintf("%.1f%% (%d/%d)", float64(n)*100/float64(d), n, d)
}

func runOnce(seed int64, schools int, rate float64) (database.SimMetrics, error) {
	dir, err := os.MkdirTemp("", "verifysim")
	if err != nil {
		return database.SimMetrics{}, err
	}
	defer os.RemoveAll(dir)
	dm := &database.DBManager{DataDir: dir}
	key, _ := crypto.NewDataKey()
	dm.SetDataKey(key)
	if err := dm.InitConfigDB(); err != nil {
		return database.SimMetrics{}, err
	}
	if err := dm.SaveSchoolConfig("측정중학교", 1, "x", false, 2027); err != nil {
		return database.SimMetrics{}, err
	}
	for _, pkg := range database.BuildSimSharedPackages(database.SimConfig{Seed: seed, Schools: schools, Year: 2027, ErrorRate: rate}) {
		p := pkg
		if _, err := dm.StoreSharedPackage(&p); err != nil {
			return database.SimMetrics{}, err
		}
	}
	report, err := dm.VerifySharedData()
	if err != nil {
		return database.SimMetrics{}, err
	}
	return dm.EvaluateSimVerification(report)
}
