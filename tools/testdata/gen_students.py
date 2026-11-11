#!/usr/bin/env python3
"""꼬미입시 테스트용 가상 학생 자료 생성기 (실제 학생 정보 없음).

- 10개 반, 반마다 23~28명. 학생을 모두 만든 뒤 섞어서 반을 배정하고 반 안에서 가나다순으로 번호를 붙인다.
- 나이스 내보내기와 비슷한 CSV 3종(교과학습발달상황, 출결상황, 봉사활동상황)을 UTF-8(BOM)로 만든다.
- v1: 1학년 1학기 ~ 3학년 1학기(전기고 원서 시기, 후기고 3-1 복사 예상)
- v2: v1 + 3학년 2학기 성적, 3학년 2학기 출결, 9~11월 봉사(후기고 확정 시기)
- 여러 경우의 수(전 과목 A, 동점자, 예체능 C, 전입생 학기 누락, 2·3학년 기술·가정 없음,
  성적 상승·하락, 결석이 한 학년에 몰린 학생, 지각 누적, 질병 결석만 있는 학생, 봉사 0시간,
  1학년에만 봉사, 3학년 봉사 없음 등)를 일부러 넣고 학생별 유형을 별도 목록으로 남긴다.

사용법: python3 tools/testdata/gen_students.py [출력폴더]   (기본: test-data/가상학생)
출력 폴더(test-data/)와 CSV는 .gitignore 대상이다.
"""
import csv
import os
import random
import sys

SEED = 20271
SCHOOL_YEAR = 2026  # 현 중3 학년도(2027 고입)

SUBJECTS = {
    "1_1": ["국어", "사회", "도덕", "수학", "과학", "기술·가정", "영어", "체육", "음악", "미술"],
    "1_2": ["국어", "사회", "수학", "과학", "기술·가정", "정보", "영어", "체육", "미술", "진로와 직업"],
    "2_1": ["국어", "역사", "수학", "과학", "기술·가정", "영어", "체육", "음악", "한문"],
    "2_2": ["국어", "역사", "도덕", "수학", "과학", "정보", "영어", "체육", "미술"],
    "3_1": ["국어", "사회", "역사", "수학", "과학", "기술·가정", "영어", "체육", "음악", "미술"],
    "3_2": ["국어", "사회", "도덕", "수학", "과학", "기술·가정", "영어", "체육", "음악", "미술"],
}
ARTS = {"체육", "음악", "미술"}
PASS_ONLY = {"진로와 직업"}  # P(이수) 과목: 점수 산출 제외 확인용
SEMS_V1 = ["1_1", "1_2", "2_1", "2_2", "3_1"]
SUBJECT_BIAS = {"수학": -0.25, "영어": -0.1, "과학": -0.15, "국어": 0.1, "기술·가정": 0.15, "도덕": 0.2, "정보": 0.1}

SURNAMES = list("김이박최정강조윤장임한오서신권황안송류홍전고문양손배백허유남심노하곽성차주우구민진나지엄채원천방공현함변염여추도소석선설마길연위표명기반왕금옥육인맹제모탁국어은편용")
SYL = list("민서지하윤준도현우진수예은채아유연시원주건영호성재희태혜다나라소율빈경한결슬온담솔별새봄린찬규석인정")

# 유형은 성적·출결·봉사 묶음별로 한 학생에게 하나씩만 붙인다(서로 모순되는 유형이 겹치지 않게).
PROFILE_GROUPS = {
    "성적": [("전 과목 A", 3), ("동점자(같은 성적표)", 4), ("예체능 C 다수", 6), ("2·3학년 기술·가정 없음", 2), ("성적 상승", 12), ("성적 하락", 12), ("하위권", 15)],
    # 재학 이력: 우리 학교는 1학년 1학기 자유학기제. 전입생·중도 입국 학생은 성적·출결·봉사 기록이 비는 학기·학년이 있다.
    "재학 이력": [("전입생: 이전 학교 자유학기 1학년 2학기", 4), ("전입생(2-1 성적 없음)", 3),
                ("중도입국: 1학년 기록 없음", 3), ("중도입국: 1·2학년 기록 없음", 2), ("중도입국: 2학년 2학기부터 재학", 2)],
    "출결": [("결석이 한 학년에 몰림(10일)", 3), ("지각·조퇴 누적", 14), ("결석 1~3일", 20), ("질병 결석만 있음", 12),
             ("만성 결석(학년마다 4일)", 3)],
    "봉사": [("봉사 0시간", 8), ("1학년에만 봉사 12시간", 5), ("3학년 봉사 없음", 15), ("봉사 학년마다 2시간", 15),
             ("봉사 학년마다 1~3시간", 10)],
}


def grade_letter(x, arts=False):
    if arts:
        return "A" if x > 0.0 else ("B" if x > -0.9 else "C")
    if x > 0.85:
        return "A"
    if x > 0.15:
        return "B"
    if x > -0.55:
        return "C"
    if x > -1.25:
        return "D"
    return "E"


def make_names(rng, n):
    names = set()
    while len(names) < n:
        names.add(rng.choice(SURNAMES) + rng.choice(SYL) + rng.choice(SYL))
    return list(names)


def build_students(rng, total):
    names = make_names(rng, total)
    students = []
    for i in range(total):
        students.append({"name": names[i], "ability": rng.gauss(0.1, 0.9), "tags": [], "grades": {}, "att": {}, "vol": {}})
    for group in PROFILE_GROUPS.values():
        tags = [tag for tag, count in group for _ in range(count)]
        for student, tag in zip(rng.sample(students, len(tags)), tags):
            student["tags"].append(tag)
    for s in students:
        build_grades(rng, s)
        build_attendance(rng, s)
        build_volunteer(rng, s)
    # 동점자: 짝을 지어 성적표를 똑같이 맞춘다.
    twins = [s for s in students if "동점자(같은 성적표)" in s["tags"]]
    for a, b in zip(twins[0::2], twins[1::2]):
        b["grades"] = {k: dict(v) for k, v in a["grades"].items()}
    return students


SCHOOL_FREE_SEMESTER = "1_1"  # 우리 학교 자유학기(성적 대신 P)


def enrolled_semesters(tags):
    """재학한 학기 목록과 자유학기(P로 기록)를 돌려준다."""
    sems, free = list(SUBJECTS), {SCHOOL_FREE_SEMESTER}
    if "전입생: 이전 학교 자유학기 1학년 2학기" in tags:
        free = {"1_2"}
    if "전입생(2-1 성적 없음)" in tags:
        sems.remove("2_1")
    if "중도입국: 1학년 기록 없음" in tags:
        sems = [x for x in sems if not x.startswith("1_")]
    if "중도입국: 1·2학년 기록 없음" in tags:
        sems = [x for x in sems if x.startswith("3_")]
    if "중도입국: 2학년 2학기부터 재학" in tags:
        sems = [x for x in sems if x not in ("1_1", "1_2", "2_1")]
    return sems, free


def enrolled_grades(tags):
    return sorted({int(x[0]) for x in enrolled_semesters(tags)[0]})


def build_grades(rng, s):
    tags = s["tags"]
    sems, free = enrolled_semesters(tags)
    for sem in SUBJECTS:
        if sem not in sems:
            continue
        if sem in free:
            s["grades"][sem] = {subj: "P" for subj in SUBJECTS[sem]}
            continue
        trend = 0.0
        order = list(SUBJECTS).index(sem)
        if "성적 상승" in tags:
            trend = -0.6 + 0.25 * order
        if "성적 하락" in tags:
            trend = 0.6 - 0.25 * order
        base = s["ability"] - (1.2 if "하위권" in tags else 0) + trend
        sem_grades = {}
        for subj in SUBJECTS[sem]:
            if subj in PASS_ONLY:
                sem_grades[subj] = "P"
                continue
            if "2·3학년 기술·가정 없음" in tags and subj == "기술·가정" and sem[0] in "23":
                continue
            if "전 과목 A" in tags:
                sem_grades[subj] = "A"
                continue
            x = base + SUBJECT_BIAS.get(subj, 0) + rng.gauss(0, 0.45)
            if subj in ARTS and "예체능 C 다수" in tags:
                x -= 1.6
            sem_grades[subj] = grade_letter(x, arts=subj in ARTS)
        s["grades"][sem] = sem_grades


def build_attendance(rng, s):
    tags = s["tags"]
    for g in enrolled_grades(tags):
        # 학년별 (질병결석, 미인정결석, 미인정지각, 미인정조퇴, 미인정결과); 3학년은 1학기분·2학기분으로 나눈다.
        sick = rng.choice([0, 0, 0, 1, 2]) if rng.random() < 0.35 else 0
        absent = late = early = result = 0
        if "질병 결석만 있음" in tags:
            sick += rng.randint(2, 6)
        if "결석 1~3일" in tags and rng.random() < 0.6:
            absent = rng.randint(1, 3)
        if "만성 결석(학년마다 4일)" in tags:
            absent = 4
        if "결석이 한 학년에 몰림(10일)" in tags and g == 2:
            absent = 10
        if "지각·조퇴 누적" in tags:
            late, early, result = rng.randint(1, 6), rng.randint(0, 3), rng.randint(0, 2)
        elif rng.random() < 0.15:
            late = rng.randint(1, 2)
        if g < 3:
            s["att"][g] = (sick, absent, late, early, result)
        else:
            # 1학기 몫(60%)과 2학기 몫으로 나눈다
            first = tuple(int(round(v * 0.6)) for v in (sick, absent, late, early, result))
            second = tuple(v - f for v, f in zip((sick, absent, late, early, result), first))
            s["att"][3] = first
            s["att"]["3_2"] = second


def build_volunteer(rng, s):
    tags = s["tags"]
    plan = {g: 0 for g in (1, 2, 3)}
    for g in enrolled_grades(tags):
        hours = rng.choice([4, 4, 5, 6, 8])
        if "봉사 학년마다 2시간" in tags:
            hours = 2
        if "봉사 학년마다 1~3시간" in tags:
            hours = rng.randint(1, 3)
        if "1학년에만 봉사 12시간" in tags:
            hours = 12 if g == 1 else 0
        if "3학년 봉사 없음" in tags and g == 3:
            hours = 0
        if "봉사 0시간" in tags:
            hours = 0
        plan[g] = hours
    # 활동 단위로 쪼갠다(1~4시간). 3학년은 1학기(3~7월)와 2학기(9~11월)로 나눈다.
    for g, hours in plan.items():
        year = SCHOOL_YEAR - (3 - g)
        acts, left = [], hours
        while left > 0:
            h = min(left, rng.choice([1, 2, 2, 3, 4]))
            acts.append(h)
            left -= h
        rows = []
        for i, h in enumerate(acts):
            if g == 3:
                second = i >= max(1, len(acts) // 2) and len(acts) > 1
                month = rng.randint(9, 11) if second else rng.randint(3, 7)
            else:
                month = rng.choice([4, 5, 6, 7, 9, 10, 11, 12])
            rows.append((g, f"{year}.{month:02d}.{rng.randint(1, 28):02d}.", h, g == 3 and month >= 9))
        s["vol"][g] = sorted(rows, key=lambda r: r[1])


def assign_classes(rng, students):
    rng.shuffle(students)
    sizes = [rng.randint(23, 28) for _ in range(10)]
    while sum(sizes) != len(students):
        i = rng.randrange(10)
        if sum(sizes) > len(students) and sizes[i] > 23:
            sizes[i] -= 1
        elif sum(sizes) < len(students) and sizes[i] < 28:
            sizes[i] += 1
    classes, pos = {}, 0
    for c, n in enumerate(sizes, start=1):
        members = sorted(students[pos:pos + n], key=lambda s: s["name"])
        for num, s in enumerate(members, start=1):
            s["class"], s["num"] = c, num
        classes[c] = members
        pos += n
    return classes


def write_csv(path, rows):
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        csv.writer(f).writerows(rows)


def write_version(out_dir, classes, with_final):
    os.makedirs(out_dir, exist_ok=True)
    sems = SEMS_V1 + (["3_2"] if with_final else [])
    total = sum(len(m) for m in classes.values())
    # 1) 교과학습발달상황: 반 머리글 → 표 머리글 → 학생별 과목 행(번호·성명은 첫 행에만, 나이스 병합 셀 흉내)
    rows = []
    for c, members in classes.items():
        rows += [[f"{SCHOOL_YEAR}학년도", "교과학습발달상황", f"3학년 {c}반"], ["번호", "성명", "학년", "학기", "교과", "과목", "원점수/과목평균(표준편차)", "성취도(수강자수)"]]
        for s in members:
            first = True
            for sem in sems:
                if sem not in s["grades"]:
                    continue
                g, h = sem.split("_")
                for subj, letter in s["grades"][sem].items():
                    achieve = letter if letter == "P" else f"{letter}({total})"
                    rows.append([s["num"] if first else "", s["name"] if first else "", g, h, subj, subj, "", achieve])
                    first = False
    write_csv(os.path.join(out_dir, "1_교과학습발달상황.csv"), rows)

    # 2) 출결상황: 2줄 머리글(결석·지각·조퇴·결과 아래 질병/미인정/기타), 학년별 1행
    rows = []
    for c, members in classes.items():
        rows += [[f"{SCHOOL_YEAR}학년도", "출결상황", f"3학년 {c}반"],
                 ["번호", "성명", "학년", "수업일수", "결석", "", "", "지각", "", "", "조퇴", "", "", "결과", "", "", "특기사항"],
                 ["", "", "", "", "질병", "미인정", "기타", "질병", "미인정", "기타", "질병", "미인정", "기타", "질병", "미인정", "기타", ""]]
        for s in members:
            present = [g for g in (1, 2, 3) if g in s["att"]]
            for g in present:
                sick, absent, late, early, result = s["att"][g]
                days = 190
                if g == 3:
                    if with_final:
                        extra = s["att"]["3_2"]
                        sick, absent, late, early, result = (a + b for a, b in zip((sick, absent, late, early, result), extra))
                    else:
                        days = 95
                rows.append([s["num"] if g == present[0] else "", s["name"] if g == present[0] else "", g, days,
                             sick, absent, 0, 0, late, 0, 0, early, 0, 0, result, 0, ""])
    write_csv(os.path.join(out_dir, "2_출결상황.csv"), rows)

    # 3) 봉사활동상황: 활동 1건당 1행, 누계(학년)·누계(전체)
    rows = []
    for c, members in classes.items():
        rows += [[f"{SCHOOL_YEAR}학년도", "봉사활동실적", f"3학년 {c}반"],
                 ["번호", "성명", "학년", "일자 또는 기간", "장소 또는 주관기관명", "활동내용", "시간", "시간누계(학년)", "시간누계(전체)"]]
        for s in members:
            running, first = 0, True
            for g in (1, 2, 3):
                per_grade = 0
                for grade, date, h, second_sem in s["vol"][g]:
                    if second_sem and not with_final:
                        continue
                    running += h
                    per_grade += h
                    rows.append([s["num"] if first else "", s["name"] if first else "", grade, date, "○○중학교", "교내 환경 정화", h, per_grade, running])
                    first = False
            if first:  # 봉사 기록이 하나도 없는 학생도 명단에는 나온다
                rows.append([s["num"], s["name"], "", "", "", "", 0, 0, 0])
    write_csv(os.path.join(out_dir, "3_봉사활동상황.csv"), rows)


def write_profile_list(path, classes):
    rows = [["반", "번호", "성명", "유형(겹칠 수 있음)"]]
    for c, members in classes.items():
        for s in members:
            rows.append([c, s["num"], s["name"], " / ".join(s["tags"]) or "일반"])
    write_csv(path, rows)


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join("test-data", "가상학생")
    rng = random.Random(SEED)
    sizes_total = 255
    students = build_students(rng, sizes_total)
    classes = assign_classes(rng, students)
    write_version(os.path.join(out, "v1_3학년1학기까지"), classes, with_final=False)
    write_version(os.path.join(out, "v2_3학년2학기포함"), classes, with_final=True)
    write_profile_list(os.path.join(out, "학생별_유형_목록.csv"), classes)
    print(f"{out}: {len(classes)}개 반, {sum(len(m) for m in classes.values())}명, 반별 " +
          ", ".join(f"{c}반 {len(m)}명" for c, m in classes.items()))


if __name__ == "__main__":
    main()
