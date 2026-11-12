package main

import (
	"encoding/json"
	"testing"

	"PHGC/internal/sync"
)

// 실행 파일에 넣는 고교 목록(server-data/highschools.json)의 요강 모집정원 점검:
// 학과 이름이 학과 목록과 같고, 전형별 학과 정원의 합이 학교·전형 합계와 같아야 한다.
func TestEmbeddedHighSchoolQuotasConsistent(t *testing.T) {
	var data sync.HighSchoolData
	if err := json.Unmarshal(defaultHighSchoolsJSON, &data); err != nil {
		t.Fatalf("highschools.json 형식 오류: %v", err)
	}
	withQuota := 0
	for _, s := range data.Schools {
		if len(s.Quotas) == 0 {
			continue
		}
		withQuota++
		depts := map[string]bool{}
		for _, d := range s.Departments {
			depts[d] = true
		}
		type key struct {
			year  int
			track string
		}
		total, sum := map[key]int{}, map[key]int{}
		for _, q := range s.Quotas {
			k := key{q.AdmissionYear, q.Track}
			if q.Department == "" {
				total[k] += q.Quota
				continue
			}
			if !depts[q.Department] {
				t.Errorf("%s: 학과 목록에 없는 학과 %q", s.Name, q.Department)
			}
			sum[k] += q.Quota
		}
		for k, v := range total {
			if sum[k] != 0 && sum[k] != v {
				t.Errorf("%s %d %s: 학과 합 %d ≠ 합계 %d", s.Name, k.year, k.track, sum[k], v)
			}
		}
	}
	if withQuota < 10 {
		t.Errorf("요강 모집정원이 있는 학교 %d곳(마이스터고 3 + 특성화고 7 기대)", withQuota)
	}
}
