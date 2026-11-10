package calc

// vocationalRules 특성화고 전형별 1차 서류 산출 규칙
func vocationalRules() []SchoolRule {
	return []SchoolRule{
		// ============ 울산상업고 ============
		{
			SchoolName: "울산상업고", TrackName: "일반",
			TotalMax: 100, Semesters: []string{"1_2", "2_1", "2_2", "3_1"},
			SemesterWeights: map[string]float64{"1_2": .25, "2_1": .25, "2_2": .25, "3_1": .25}, AllSubjectMax: 80,
			WeightedSubjects: nil, // 가중치 없음
			AttendanceMax:    20, AbsencePenalty: 2, AttendanceCutoff: "10/31", ExcludeArts: true, FinalTermArtsPenaltyOnly: true,
			VolunteerMax: 0,
		},
		{
			SchoolName: "울산상업고", TrackName: "취업희망자",
			TotalMax: 60, Semesters: []string{"1_2", "2_1", "2_2", "3_1"},
			SemesterWeights: map[string]float64{"1_2": .25, "2_1": .25, "2_2": .25, "3_1": .25}, AllSubjectMax: 20,
			WeightedSubjects: nil,
			AttendanceMax:    30, AbsencePenalty: 3, AttendanceCutoff: "9/30", ExcludeArts: true, FinalTermArtsPenaltyOnly: true,
			VolunteerMax:   10,
			VolunteerTable: []VolunteerTier{{12, 10}, {10, 9}, {8, 8}, {7, 7}, {6, 6}, {5, 5}, {0, 4}},
		},
		// ============ 울산여자상업고 ============
		{
			SchoolName: "울산여자상업고", TrackName: "일반",
			TotalMax: 100, Semesters: []string{"1_2", "2_1", "2_2", "3_1"},
			SemesterWeights: map[string]float64{"1_2": .25, "2_1": .25, "2_2": .25, "3_1": .25}, AllSubjectMax: 80,
			WeightedSubjects: nil,
			AttendanceMax:    20, AbsencePenalty: 2, AttendanceCutoff: "10/31", ExcludeArts: true, FinalTermArtsPenaltyOnly: true,
			VolunteerMax: 0,
		},
		{
			SchoolName: "울산여자상업고", TrackName: "취업희망자",
			TotalMax: 80, Semesters: []string{"1_2", "2_1", "2_2", "3_1"},
			SemesterWeights: map[string]float64{"1_2": .25, "2_1": .25, "2_2": .25, "3_1": .25}, AllSubjectMax: 40,
			WeightedSubjects: nil,
			AttendanceMax:    30, AbsencePenalty: 3, AttendanceCutoff: "9/30", ExcludeArts: true, FinalTermArtsPenaltyOnly: true,
			VolunteerMax:   10,
			VolunteerTable: []VolunteerTier{{12, 10}, {10, 9}, {8, 8}, {7, 7}, {6, 6}, {5, 5}, {0, 4}},
		},
		// ============ 울산생활과학고 ============
		{
			SchoolName: "울산생활과학고", TrackName: "일반",
			TotalMax: 100, Semesters: []string{"1_2", "2_1", "2_2", "3_1"},
			SemesterWeights: map[string]float64{"1_2": .2, "2_1": .2, "2_2": .2, "3_1": .4}, AllSubjectMax: 80, AttendanceMax: 20, AbsencePenalty: 2, VolunteerMax: 0, AttendanceCutoff: "10/31", ExcludeArts: true, FinalTermArtsPenaltyOnly: true,
		},
		{
			SchoolName: "울산생활과학고", TrackName: "취업희망자",
			TotalMax: 50, Semesters: []string{"1_2", "2_1", "2_2", "3_1"},
			SemesterWeights: map[string]float64{"1_2": .2, "2_1": .2, "2_2": .2, "3_1": .4}, AllSubjectMax: 25, AttendanceMax: 20, AbsencePenalty: 2, VolunteerMax: 5, AttendanceCutoff: "9/30", ExcludeArts: true, FinalTermArtsPenaltyOnly: true,
			VolunteerTable: []VolunteerTier{{12, 5}, {10, 4.5}, {8, 4}, {7, 3.5}, {6, 3}, {5, 2.5}, {0, 2}},
		},
		// ============ 울산공업고 ============
		{
			SchoolName: "울산공업고", TrackName: "일반",
			TotalMax: 100, Semesters: []string{"1_2", "2_1", "2_2", "3_1"},
			SemesterWeights: map[string]float64{"1_2": .25, "2_1": .25, "2_2": .25, "3_1": .25}, AllSubjectMax: 80, AttendanceMax: 20, AbsencePenalty: 2, VolunteerMax: 0, AttendanceCutoff: "10/31", ExcludeArts: true, FinalTermArtsPenaltyOnly: true,
		},
		{
			SchoolName: "울산공업고", TrackName: "취업희망자",
			TotalMax: 50, Semesters: []string{"1_2", "2_1", "2_2", "3_1"},
			SemesterWeights: map[string]float64{"1_2": .25, "2_1": .25, "2_2": .25, "3_1": .25}, AllSubjectMax: 20, AttendanceMax: 20, AbsencePenalty: 2, VolunteerMax: 10, AttendanceCutoff: "9/30", ExcludeArts: true, FinalTermArtsPenaltyOnly: true,
			VolunteerTable: []VolunteerTier{{12, 10}, {10, 9}, {8, 8}, {7, 7}, {6, 6}, {5, 5}, {0, 4}},
		},
		// ============ 울산산업고 ============
		{
			SchoolName: "울산산업고", TrackName: "일반",
			TotalMax: 100, Semesters: []string{"1_2", "2_1", "2_2", "3_1"},
			SemesterWeights: map[string]float64{"1_2": .25, "2_1": .25, "2_2": .25, "3_1": .25}, AllSubjectMax: 80, AttendanceMax: 20, AbsencePenalty: 2, VolunteerMax: 0, AttendanceCutoff: "10/31", ExcludeArts: true, FinalTermArtsPenaltyOnly: true,
		},
		{
			SchoolName: "울산산업고", TrackName: "취업희망자",
			TotalMax: 60, Semesters: []string{"1_2", "2_1", "2_2", "3_1"},
			SemesterWeights: map[string]float64{"1_2": .25, "2_1": .25, "2_2": .25, "3_1": .25}, AllSubjectMax: 20, AttendanceMax: 30, AbsencePenalty: 3, VolunteerMax: 10, AttendanceCutoff: "9/30", ExcludeArts: true, FinalTermArtsPenaltyOnly: true,
			VolunteerTable: []VolunteerTier{{12, 10}, {10, 9}, {8, 8}, {7, 7}, {6, 6}, {5, 5}, {0, 4}},
		},
		// ============ 울산미용예술고 ============
		{
			SchoolName: "울산미용예술고", TrackName: "일반",
			TotalMax: 100, Semesters: []string{"1_2", "2_1", "2_2", "3_1"},
			SemesterWeights: map[string]float64{"1_2": .25, "2_1": .25, "2_2": .25, "3_1": .25}, AllSubjectMax: 60, AttendanceMax: 40, AbsencePenalty: 2, VolunteerMax: 0, AttendanceCutoff: "10/31", ExcludeArts: true, FinalTermArtsPenaltyOnly: true,
		},
		{
			SchoolName: "울산미용예술고", TrackName: "취업희망자",
			TotalMax: 50, Semesters: []string{"1_2", "2_1", "2_2", "3_1"},
			SemesterWeights: map[string]float64{"1_2": .25, "2_1": .25, "2_2": .25, "3_1": .25}, AllSubjectMax: 20, AttendanceMax: 20, AbsencePenalty: 2, VolunteerMax: 10, AttendanceCutoff: "9/30", ExcludeArts: true, FinalTermArtsPenaltyOnly: true,
			VolunteerTable: []VolunteerTier{{12, 10}, {10, 9}, {8, 8}, {7, 7}, {6, 6}, {5, 5}, {0, 4}},
		},
		// ============ 울산기술공업고 ============
		{
			SchoolName: "울산기술공업고", TrackName: "일반",
			TotalMax: 100, Semesters: []string{"1_2", "2_1", "2_2", "3_1"},
			SemesterWeights: map[string]float64{"1_2": .2, "2_1": .2, "2_2": .2, "3_1": .4}, AllSubjectMax: 80, AttendanceMax: 20, AbsencePenalty: 2, VolunteerMax: 0, AttendanceCutoff: "10/31", ExcludeArts: true, FinalTermArtsPenaltyOnly: true,
		},
		{
			SchoolName: "울산기술공업고", TrackName: "취업희망자",
			TotalMax: 100, Semesters: []string{"1_2", "2_1", "2_2", "3_1"},
			SemesterWeights: map[string]float64{"1_2": .2, "2_1": .2, "2_2": .2, "3_1": .4}, AllSubjectMax: 40, AttendanceMax: 50, AbsencePenalty: 5, VolunteerMax: 10, AttendanceCutoff: "9/30", ExcludeArts: true, FinalTermArtsPenaltyOnly: true,
			VolunteerTable: []VolunteerTier{{12, 10}, {10, 9}, {8, 8}, {7, 7}, {6, 6}, {5, 5}, {0, 4}},
		},
	}
}
