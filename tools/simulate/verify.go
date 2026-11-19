package main

import (
	"fmt"
	"sort"
	"strings"
)

// verifySection 오류를 섞지 않은 시뮬레이션 자료에 관내 공유 자료 검증을 돌린 결과.
// 시뮬레이터는 일부러 틀린 값을 넣지 않으므로, 여기서 걸린 원서는 모두 정상 자료가 걸린 것(오탐)이다.
// 단, "참고: 다른 요강 산출식"(formula)은 원서를 통계에서 빼라는 뜻이 아니어서 따로 센다.
func (sm *sim) verifySection() string {
	var b strings.Builder
	w := func(format string, a ...interface{}) { fmt.Fprintf(&b, format+"\n", a...) }
	w("\n## 관내 공유 자료 검증 (오류를 섞지 않은 자료)\n")
	w("참여 학교마다 마지막 학년도 프로그램에서 [자료 검증]을 돌렸다. 시뮬레이터는 일부러 틀린 값을 넣지 않으므로 걸린 원서는 모두 정상 자료다(오탐).")
	w("다른 학교 원서 수는 그 학교가 받은 다른 학교 자료(모든 학년도)이고, 참고(다른 요강 산출식)는 통계에서 빼라는 뜻이 아니어서 따로 센다.")
	w("시뮬레이터는 지난 학년도 원서도 지금 요강 산출식으로 계산하므로, 지난 학년도 원서(우리 학교 원서 포함)에 참고가 붙는다. 실제 학교 자료에서는 나오지 않는 시뮬레이터 한계다.\n")
	w("| 관점 학교 | 다른 학교 원서 | 오류 | 확인 필요 | 비율 | 참고(산출식) | 묶음(정원 초과) |")
	w("|---|---:|---:|---:|---:|---:|---:|")
	codes := map[string]int{}
	years := map[int]int{}
	var examples []string
	totalRecs, totalErr, totalWarn := 0, 0, 0
	for _, m := range sm.schools {
		if !m.participating {
			continue
		}
		rep, err := m.dm.VerifySharedData()
		if err != nil {
			w("| %s | 검증 실패: %v | | | | | |", m.name, err)
			continue
		}
		recs := 0
		for _, s := range rep.Schools {
			if !s.IsOwn {
				recs += s.RecordCount
			}
		}
		nErr, nWarn, nFormula := 0, 0, 0
		for _, is := range rep.Issues {
			switch {
			case is.Code == "formula":
				nFormula++
				continue
			case is.Level == "error":
				nErr++
			default:
				nWarn++
			}
			codes[is.Level+" · "+is.Code]++
			years[is.AdmissionYear]++
			if len(examples) < 15 {
				examples = append(examples, fmt.Sprintf("| %s | %d | %s | %s | %s | %s | %.2f | %s |", m.name, is.AdmissionYear, is.SchoolName,
					shortSchool(is.HighSchool), is.Department, is.Status, is.Score, is.Message))
			}
		}
		totalRecs += recs
		totalErr += nErr
		totalWarn += nWarn
		w("| %s | %d | %d | %d | %.2f%% | %d | %d |", m.name, recs, nErr, nWarn, pct(nErr+nWarn, recs), nFormula, len(rep.GroupIssues))
	}
	w("| **합계** | %d | %d | %d | %.2f%% | | |", totalRecs, totalErr, totalWarn, pct(totalErr+totalWarn, totalRecs))
	if len(codes) == 0 {
		w("\n정상 자료가 걸린 원서가 없다.")
		return b.String()
	}
	w("\n### 걸린 종류\n")
	w("| 수준 · 종류 | 건수 |")
	w("|---|---:|")
	keys := make([]string, 0, len(codes))
	for k := range codes {
		keys = append(keys, k)
	}
	sort.Slice(keys, func(i, j int) bool { return codes[keys[i]] > codes[keys[j]] })
	for _, k := range keys {
		w("| %s | %d |", k, codes[k])
	}
	w("\n### 학년도별\n")
	w("| 학년도 | 건수 |")
	w("|---:|---:|")
	ys := make([]int, 0, len(years))
	for y := range years {
		ys = append(ys, y)
	}
	sort.Ints(ys)
	for _, y := range ys {
		w("| %d | %d |", y, years[y])
	}
	w("\n### 걸린 원서 예 (최대 15건)\n")
	w("| 관점 학교 | 학년도 | 보낸 학교 | 고교 | 학과 | 결과 | 점수 | 설명 |")
	w("|---|---:|---|---|---|---|---:|---|")
	for _, e := range examples {
		w("%s", e)
	}
	return b.String()
}
