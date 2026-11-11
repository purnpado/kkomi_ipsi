// 검증용 가상 학생 적재 도구 (저장소 밖 임시 파일)
package main

import (
	"encoding/json"
	"fmt"
	"os"

	"PHGC/internal/database"
	"PHGC/internal/parser"
)

func raw(grades []string) string {
	subjects := []string{"국어", "수학", "영어", "과학", "사회", "기술가정", "체육", "음악"}
	var rows []map[string]string
	for _, sem := range [][2]string{{"1", "2"}, {"2", "1"}, {"2", "2"}, {"3", "1"}} {
		for i, sub := range subjects {
			rows = append(rows, map[string]string{"학년": sem[0], "학기": sem[1], "과목": sub, "성취도": grades[i%len(grades)]})
		}
	}
	b, _ := json.Marshal(rows)
	return string(b)
}

func main() {
	dm := &database.DBManager{DataDir: os.Args[1]}
	dm.SetDataKey(make([]byte, 32))
	classes := map[int][]parser.StudentExcelData{
		1: {
			{ClassNum: 1, StudentNum: "1", Name: "가상학생하나", RawData: raw([]string{"A"})},
			{ClassNum: 1, StudentNum: "2", Name: "가상학생둘", RawData: raw([]string{"A", "B"})},
			{ClassNum: 1, StudentNum: "3", Name: "가상학생셋", RawData: raw([]string{"B", "C", "D"})},
		},
		2: {
			{ClassNum: 2, StudentNum: "1", Name: "가상학생넷", RawData: raw([]string{"B"})},
			{ClassNum: 2, StudentNum: "2", Name: "가상학생다섯", RawData: raw([]string{"C", "A"})},
		},
	}
	for n, list := range classes {
		if err := dm.SaveClassStudents(n, list); err != nil {
			panic(err)
		}
		if err := dm.RefreshClassSchoolScoreCache(n); err != nil {
			panic(err)
		}
	}
	fmt.Println("snap:", dm.UpdateSchoolRankSnapshots())
}
