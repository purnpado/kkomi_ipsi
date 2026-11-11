package main

import (
	"fmt"
	"math"
	"math/rand"
	"path/filepath"
	"strings"

	"PHGC/internal/database"
	"PHGC/internal/exchange"
	"PHGC/internal/model"
)

type yearResult struct {
	year         int
	regionN      int
	seats        map[string]int
	apps         []*application // 지역 전체(참여·비참여) 원서
	generalQuota int
	generalPool  int
	generalCut   float64 // 실제 후기 일반고 합격선(총점)
	generalBase  float64 // 실제 배정자 기본 지표 최저점
	compMeister  float64
	compSpecial  float64
	predictions  []prediction
}

type sim struct {
	root    string
	rng     *rand.Rand
	schools []*middleSchool
	catalog []highSchool
	years   []*yearResult
	log     func(format string, a ...interface{})
}

func weightedPick(rng *rand.Rand, pool []*student, k int, weight func(*student) float64) []*student {
	list := append([]*student{}, pool...)
	out := []*student{}
	for len(out) < k && len(list) > 0 {
		total := 0.0
		ws := make([]float64, len(list))
		for i, s := range list {
			ws[i] = weight(s)
			total += ws[i]
		}
		r := rng.Float64() * total
		idx := len(list) - 1
		for i, w := range ws {
			if r < w {
				idx = i
				break
			}
			r -= w
		}
		out = append(out, list[idx])
		list = append(list[:idx], list[idx+1:]...)
	}
	return out
}

func gauss(x, mu, sd float64) float64 { return math.Exp(-(x - mu) * (x - mu) / (2 * sd * sd)) }

func (sm *sim) pickSchool(kind string, popularity map[string]float64) highSchool {
	cands := []highSchool{}
	total := 0.0
	for _, hs := range sm.catalog {
		if hs.Type == kind {
			cands = append(cands, hs)
			total += popularity[hs.Name]
		}
	}
	r := sm.rng.Float64() * total
	for _, hs := range cands {
		if r < popularity[hs.Name] {
			return hs
		}
		r -= popularity[hs.Name]
	}
	return cands[len(cands)-1]
}

func (sm *sim) shuffled(depts []string, n int) []string {
	d := append([]string{}, depts...)
	sm.rng.Shuffle(len(d), func(i, j int) { d[i], d[j] = d[j], d[i] })
	if len(d) > n {
		d = d[:n]
	}
	return d
}

func (sm *sim) newApp(s *student, hs highSchool, category, track string, prefs []string) *application {
	k := shortSchool(hs.Name) + "/" + track
	a := &application{stu: s, category: category, school: hs.Name, track: track, prefs: prefs, score: s.scores[k], maxScore: s.maxes[k]}
	s.apps = append(s.apps, a)
	return a
}

func (sm *sim) loadAll(year int, version string, byKey map[string]*student) ([]*student, error) {
	var all []*student
	for i, m := range sm.schools {
		if version == "v1" {
			if err := m.openSchool(year); err != nil {
				return nil, fmt.Errorf("%s 학년도 준비: %w", m.name, err)
			}
			dir, err := m.generateCohort(sm.root, year, year*100+i)
			if err != nil {
				return nil, err
			}
			if err := m.importVersion(filepath.Join(dir, "v1_3학년1학기까지")); err != nil {
				return nil, fmt.Errorf("%s v1 올리기: %w", m.name, err)
			}
		} else {
			dir := filepath.Join(sm.root, "cohorts", fmt.Sprint(year), m.name, "v2_3학년2학기포함")
			if err := m.importVersion(dir); err != nil {
				return nil, fmt.Errorf("%s v2 올리기: %w", m.name, err)
			}
		}
		fulls, err := m.loadStudents()
		if err != nil {
			return nil, err
		}
		for _, f := range fulls {
			s := &student{school: m, full: f}
			if prev := byKey[s.key()]; prev != nil {
				prev.full, s = f, prev
				s.baseFinal = f.GeneralHSBaseScore
			} else {
				s.scores, s.maxes = map[string]float64{}, map[string]float64{}
				for _, r := range f.SchoolResults {
					s.scores[r.SchoolName+"/"+r.TrackName], s.maxes[r.SchoolName+"/"+r.TrackName] = r.TotalScore, r.TotalMax
				}
				s.pctV1, s.baseV1 = f.GeneralHSPercentile, f.GeneralHSBaseScore
				assignBonus(sm.rng, s)
				byKey[s.key()] = s
			}
			all = append(all, s)
		}
	}
	return all, nil
}

func (sm *sim) runYear(year int) (*yearResult, error) {
	byKey := map[string]*student{}
	students, err := sm.loadAll(year, "v1", byKey)
	if err != nil {
		return nil, err
	}
	yr := &yearResult{year: year, regionN: len(students)}
	yr.seats = planSeats(sm.rng, sm.catalog, len(students))
	yr.compMeister, yr.compSpecial = 1.4+sm.rng.Float64()*0.9, 0.75+sm.rng.Float64()*0.55
	popularity := map[string]float64{}
	for _, hs := range sm.catalog {
		popularity[hs.Name] = 0.6 + sm.rng.Float64()*0.8
	}
	free := func() []*student {
		out := []*student{}
		for _, s := range students {
			if s.admitted == nil {
				out = append(out, s)
			}
		}
		return out
	}

	// 1) 자사고·외고(별도 전형, 결과만): 최상위 일부가 지원, 절반 합격
	for _, s := range students {
		if s.pctV1 <= 4 && sm.rng.Float64() < 0.35 {
			a := &application{stu: s, category: "self_foreign", school: "울산외국어고등학교", track: "자사고·외고 전형", status: "불합격"}
			s.apps = append(s.apps, a)
			if sm.rng.Float64() < 0.5 {
				a.status, s.admitted = "합격", a
			}
		}
	}

	// 2) 마이스터고: 중상위권 중심으로 정원 × 경쟁률만큼 지원
	meisterSeats := 0
	for _, hs := range sm.catalog {
		if hs.Type == "meister" {
			meisterSeats += trackSeats(yr.seats, hs.Name, "일반") + trackSeats(yr.seats, hs.Name, "특별")
		}
	}
	applicants := weightedPick(sm.rng, free(), int(float64(meisterSeats)*yr.compMeister), func(s *student) float64 { return 0.05 + gauss(s.pctV1, 35, 22) })
	byTrack := map[string][]*application{}
	for _, s := range applicants {
		hs := sm.pickSchool("meister", popularity)
		track := "일반"
		if sm.rng.Float64() < 0.35 {
			track = "특별"
		}
		a := sm.newApp(s, hs, "meister", track, sm.shuffled(hs.Departments, 3))
		byTrack[hs.Name+"/"+track] = append(byTrack[hs.Name+"/"+track], a)
	}
	for _, hs := range sm.catalog {
		if hs.Type != "meister" {
			continue
		}
		runMeister(sm.rng, byTrack[hs.Name+"/특별"], yr.seats, hs.Name, "특별")
		for _, a := range byTrack[hs.Name+"/특별"] {
			if a.status == "합격" {
				a.stu.admitted = a
				continue
			}
			// 특별전형 탈락자는 같은 학교 일반전형으로 자동 전형
			auto := sm.newApp(a.stu, hs, "meister", "일반", a.prefs)
			byTrack[hs.Name+"/일반"] = append(byTrack[hs.Name+"/일반"], auto)
		}
		runMeister(sm.rng, byTrack[hs.Name+"/일반"], yr.seats, hs.Name, "일반")
		for _, a := range byTrack[hs.Name+"/일반"] {
			if a.status == "합격" {
				a.stu.admitted = a
			}
		}
	}

	// 3) 특성화고: 중하위권 중심, 마이스터고 탈락자도 일부 지원
	specialSeats := 0
	for _, hs := range sm.catalog {
		if hs.Type == "special" {
			specialSeats += trackSeats(yr.seats, hs.Name, "일반") + trackSeats(yr.seats, hs.Name, "취업희망자")
		}
	}
	applicants = weightedPick(sm.rng, free(), int(float64(specialSeats)*yr.compSpecial), func(s *student) float64 {
		w := 0.05 + gauss(s.pctV1, 68, 20)
		if len(s.apps) > 0 {
			w *= 2 // 마이스터고 불합격자는 특성화고로 많이 옮긴다
		}
		return w
	})
	jobs, gens := map[string][]*application{}, map[string][]*application{}
	for _, s := range applicants {
		hs := sm.pickSchool("special", popularity)
		if sm.rng.Float64() < 0.45 {
			jobs[hs.Name] = append(jobs[hs.Name], sm.newApp(s, hs, "special", "취업희망자", sm.shuffled(hs.Departments, 1)))
		} else {
			gens[hs.Name] = append(gens[hs.Name], sm.newApp(s, hs, "special", "일반", sm.shuffled(hs.Departments, 3)))
		}
	}
	for _, hs := range sm.catalog {
		if hs.Type != "special" {
			continue
		}
		runVocationalJob(sm.rng, jobs[hs.Name], yr.seats, hs.Name)
		for _, a := range jobs[hs.Name] {
			if a.status == "합격" {
				a.stu.admitted = a
			} else if sm.rng.Float64() < 0.5 { // 취업희망자 불합격 확정 후 일반전형 지원
				prefs := append([]string{a.prefs[0]}, sm.shuffled(hs.Departments, 2)...)
				gens[hs.Name] = append(gens[hs.Name], sm.newApp(a.stu, hs, "special", "일반", uniq(prefs)))
			}
		}
		runVocationalGeneral(gens[hs.Name], yr.seats, hs.Name)
		for _, a := range gens[hs.Name] {
			if a.status == "합격" {
				a.stu.admitted = a
			}
		}
	}
	// 전기고 원서·결과를 참여 학교 프로그램에 기록(원서 시기 v1 자료가 올라가 있는 상태)
	if err := sm.recordEarly(year, students); err != nil {
		return nil, err
	}

	// 4) 후기 일반고: 12월 확정 자료(v2)로 지역 전체 총점 순 선발
	if _, err := sm.loadAll(year, "v2", byKey); err != nil {
		return nil, err
	}
	for _, m := range sm.schools {
		var list []*student
		for _, s := range students {
			if s.school == m {
				list = append(list, s)
			}
		}
		if err := m.saveBonus(list); err != nil {
			return nil, err
		}
	}
	var pool []*application
	for _, s := range free() {
		a := &application{stu: s, category: "general", track: "후기 일반계고"}
		s.apps = append(s.apps, a)
		pool = append(pool, a)
	}
	yr.generalPool = len(pool)
	yr.generalQuota = int(math.Round(float64(len(pool)) * (0.93 + sm.rng.Float64()*0.06)))
	yr.generalCut = runGeneral(pool, yr.generalQuota)
	yr.generalBase = 999
	for _, a := range pool {
		if a.status == "합격" {
			a.stu.admitted = a
			yr.generalBase = math.Min(yr.generalBase, a.stu.baseFinal)
		}
	}
	for _, s := range students {
		yr.apps = append(yr.apps, s.apps...)
	}
	if err := sm.recordGeneralAndClose(yr, students); err != nil {
		return nil, err
	}
	return yr, nil
}

func uniq(list []string) []string {
	seen, out := map[string]bool{}, []string{}
	for _, v := range list {
		if !seen[v] {
			seen[v] = true
			out = append(out, v)
		}
	}
	return out
}

func toRecord(year int, a *application) model.ApplicationRecord {
	r := model.ApplicationRecord{ClassNum: a.stu.full.ClassNum, StudentNum: a.stu.full.StudentNum, StudentName: a.stu.full.Name,
		AdmissionYear: year, Category: a.category, SchoolName: a.school, Track: a.track, Status: a.status,
		Score: a.score, FirstStageResult: a.firstStage}
	if a.category == "meister" || a.category == "special" {
		r.Preferences = a.prefs
		if a.status == "합격" {
			r.AssignedDepartment = a.assigned
		}
	}
	return r
}

func (sm *sim) recordEarly(year int, students []*student) error {
	for _, s := range students {
		if !s.school.participating {
			continue
		}
		for _, a := range s.apps {
			if err := s.school.dm.SaveApplication(toRecord(year, a)); err != nil {
				return fmt.Errorf("%s %s 원서 저장: %w", s.school.name, s.full.Name, err)
			}
		}
	}
	return nil
}

func (sm *sim) recordGeneralAndClose(yr *yearResult, students []*student) error {
	for _, s := range students {
		if !s.school.participating {
			continue
		}
		for _, a := range s.apps {
			if a.category != "general" {
				continue
			}
			r := toRecord(yr.year, a)
			r.Score = s.full.GeneralHSTotalScore // 학교가 보는 총점(가산점 미입력 학교는 가산점 제외)
			// 점수 기록을 직접 넘긴다(넘기지 않으면 저장할 때마다 학교 전체 석차를 다시 계산해 느리다).
			f := s.full
			r.ScoreDetails = &model.ApplicationScoreDetails{Percentile: f.GeneralHSPercentile, AcademicScore: f.GeneralHSAcademicScore, AcademicMax: 160,
				NonAcademicScore: f.GeneralHSNonAcademicScore, NonAcademicMax: 40, AttendanceScore: f.GeneralHSAttendanceScore, AttendanceMax: 16,
				VolunteerScore: f.GeneralHSVolunteerScore, VolunteerMax: 8, TotalScore: f.GeneralHSTotalScore, TotalMax: 200, FormulaVersion: "2027-general-ulsan"}
			if err := s.school.dm.SaveApplication(r); err != nil {
				return fmt.Errorf("%s %s 후기 원서 저장: %w", s.school.name, s.full.Name, err)
			}
		}
	}
	var packages []string
	for i, m := range sm.schools {
		if !m.participating {
			continue
		}
		if _, err := m.dm.CloseAdmissionYear(yr.year, "시뮬레이터", "가상 입시 결과 확정"); err != nil {
			return fmt.Errorf("%s 결과 확정: %w", m.name, err)
		}
		path := filepath.Join(sm.root, "share", fmt.Sprintf("%d_%d.kkomi", yr.year, i))
		if err := exchange.ExportSharedPackageV2(m.dm, yr.year, "sim-share-pw", path); err != nil {
			return fmt.Errorf("%s 관내 공유 파일: %w", m.name, err)
		}
		packages = append(packages, path)
	}
	for _, m := range sm.schools {
		if !m.participating {
			continue
		}
		for _, p := range packages {
			if _, err := exchange.ImportSharedPackageV2(m.dm, "sim-share-pw", p); err != nil && !strings.Contains(err.Error(), "자기") {
				return fmt.Errorf("%s 관내 자료 취합: %w", m.name, err)
			}
		}
		if err := m.dm.SaveGeneralQuotaRecord(database.GeneralQuotaRecord{AdmissionYear: yr.year, Quota: yr.generalQuota, Applicants: yr.generalPool, Note: "시뮬레이터"}); err != nil {
			return err
		}
	}
	return nil
}
