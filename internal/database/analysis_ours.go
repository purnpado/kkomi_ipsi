package database

import (
	"strings"

	"PHGC/internal/calc"
	"PHGC/internal/model"
)

// GetOurSchoolAnalysisStats aggregates each application once across departments and preference ranks.
func (dm *DBManager) GetOurSchoolAnalysisStats(year int, school, department, track string, bucketStep float64) (*calc.DepartmentAdmissionStats, error) {
	records, err := dm.schoolRecordsWithHistory()
	if err != nil {
		return nil, err
	}
	school, department, track = normalizeCutoffSchool(school), normalizeCutoffDept(department), normalizeCutoffTrack(track)
	filtered := make([]model.ApplicationRecord, 0)
	for _, r := range records {
		if r.AdmissionYear != year || normalizeCutoffSchool(r.SchoolName) != school || normalizeCutoffTrack(r.Track) != track || (r.Category != "meister" && r.Category != "special") {
			continue
		}
		if department != "" {
			status := strings.ReplaceAll(strings.TrimSpace(r.Status), " ", "")
			planning := status == "지원희망" || status == "지원예정" || status == "지원완료"
			matches := normalizeCutoffDept(r.AssignedDepartment) == department && !planning
			if planning {
				for _, pref := range r.Preferences {
					if normalizeCutoffDept(pref) == department {
						matches = true
						break
					}
				}
			}
			if !matches {
				continue
			}
		}
		// general uses the same scored statistics without grouping a student by preference rank.
		r.Category, r.SchoolName, r.Track = "general", school, track
		filtered = append(filtered, r)
	}
	stats := calc.ComputeDepartmentAdmissionStats(filtered, bucketStep)
	if len(stats) == 0 {
		return nil, nil
	}
	stats[0].Department = department
	return &stats[0], nil
}
