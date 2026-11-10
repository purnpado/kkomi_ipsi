package calc

// meisterRules 마이스터고(울산마이스터고·울산에너지고·현대공업고) 전형별 1차 서류 산출 규칙
func meisterRules() []SchoolRule {
	return []SchoolRule{
		// ============ 울산마이스터고 ============
		{
			SchoolName: "울산마이스터고", TrackName: "일반",
			TotalMax: 300, Semesters: []string{"1_2", "2_1", "2_2", "3_1"},
			AllSubjectMax:    150,
			WeightedSubjects: map[string]float64{"영어": 20, "수학": 20, "기술가정": 10},
			AttendanceMax:    80, AbsencePenalty: 8,
			VolunteerMax: 20,
			VolunteerTable: []VolunteerTier{
				{12, 20}, {10, 19}, {8, 18}, {6, 17}, {4, 16}, {2, 15}, {0, 14},
			},
		},
		{
			SchoolName: "울산마이스터고", TrackName: "특별",
			TotalMax: 280, Semesters: []string{"1_2", "2_1", "2_2", "3_1"},
			AllSubjectMax:    70,
			WeightedSubjects: map[string]float64{"영어": 20, "수학": 20, "기술가정": 10},
			AttendanceMax:    120, AbsencePenalty: 12,
			VolunteerMax: 40,
			VolunteerTable: []VolunteerTier{
				{12, 40}, {10, 38}, {8, 36}, {6, 34}, {4, 32}, {2, 30}, {0, 28},
			},
		},
		// ============ 울산에너지고 ============
		{
			SchoolName: "울산에너지고", TrackName: "일반",
			TotalMax: 230, Semesters: []string{"1_2", "2_1", "2_2", "3_1"},
			AllSubjectMax:    90,
			SemesterWeights:  map[string]float64{"1_2": .10, "2_1": .25, "2_2": .25, "3_1": .40},
			WeightedSubjects: map[string]float64{"영어": 20, "수학": 20, "기술가정": 20},
			AttendanceMax:    30, AbsencePenalty: 5,
			VolunteerMax: 40,
			VolunteerTable: []VolunteerTier{
				{12, 40}, {10, 39}, {8, 38}, {6, 37}, {4, 36}, {2, 35}, {0, 34},
			},
			ExcludeArts: true, UseScienceForTech: true, LeadershipMax: 10,
		},
		{
			SchoolName: "울산에너지고", TrackName: "특별",
			TotalMax: 200, Semesters: []string{"1_2", "2_1", "2_2", "3_1"},
			AllSubjectMax:    60,
			SemesterWeights:  map[string]float64{"1_2": .10, "2_1": .25, "2_2": .25, "3_1": .40},
			WeightedSubjects: map[string]float64{"영어": 10, "수학": 10, "기술가정": 10},
			AttendanceMax:    60, AbsencePenalty: 5,
			VolunteerMax: 40,
			VolunteerTable: []VolunteerTier{
				{12, 40}, {10, 39}, {8, 38}, {6, 37}, {4, 36}, {2, 35}, {0, 34},
			},
			ExcludeArts: true, UseScienceForTech: true, LeadershipMax: 10,
		},
		// ============ 현대공업고 ============
		{
			SchoolName: "현대공업고", TrackName: "일반",
			TotalMax: 200, Semesters: []string{"1_2", "2_1", "2_2", "3_1"},
			SemesterWeights:  map[string]float64{"1_2": 0.10, "2_1": 0.25, "2_2": 0.25, "3_1": 0.40},
			AllSubjectMax:    100,
			WeightedSubjects: map[string]float64{"영어": 20, "수학": 20, "기술가정": 10},
			AttendanceMax:    30, AbsencePenalty: 6,
			VolunteerMax: 15,
			VolunteerTable: []VolunteerTier{
				{12, 15}, {10, 14}, {8, 13}, {6, 12}, {4, 11}, {2, 10}, {0, 9},
			},
			ExcludeArts: true, LateEtcPenalty: 2, LeadershipMax: 5,
		},
		{
			SchoolName: "현대공업고", TrackName: "특별",
			TotalMax: 150, Semesters: []string{"1_2", "2_1", "2_2", "3_1"},
			SemesterWeights:  map[string]float64{"1_2": 0.10, "2_1": 0.25, "2_2": 0.25, "3_1": 0.40},
			AllSubjectMax:    50,
			WeightedSubjects: map[string]float64{"영어": 15, "수학": 15, "기술가정": 10},
			AttendanceMax:    40, AbsencePenalty: 6,
			VolunteerMax: 15,
			VolunteerTable: []VolunteerTier{
				{12, 15}, {10, 14}, {8, 13}, {6, 12}, {4, 11}, {2, 10}, {0, 9},
			},
			ExcludeArts: true, LateEtcPenalty: 2, LeadershipMax: 5,
		},
	}
}
