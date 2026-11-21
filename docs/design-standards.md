# 꼬미입시 화면 기준 (B 기준, 2026-11-18)

> UI/UX 진단(`docs/ui-diagnosis-2026-11-18.md`)의 B 묶음. 색·글자·숫자·아이콘·용어의 기준값을 정해 둔다.
> **새 화면과 2027년 2월 React·Radix 전환(C 묶음)은 이 문서와 `frontend/src/styles/tokens.css` 변수만 쓴다.**
> 기존 화면은 지금 Tailwind 색 이름(다크 기준, 라이트는 `theme-light-colors.css`가 바꿈)을 그대로 두고, 다시 만들 때 이 기준으로 옮긴다.

## 1. 색 이름표

변수는 `frontend/src/styles/tokens.css`에 있다(다크가 기본, `html[data-theme="light"]`에서 라이트). Tailwind 이름으로도 쓸 수 있다(`style.css`의 `@theme inline`): `bg-kk-surface`, `text-kk-text-2`, `border-kk-line`, `text-kk-judge-safe` 등.

| 뜻 | 변수 | 다크 | 라이트 | 쓰는 곳 |
|---|---|---|---|---|
| 앱 바탕 | `--kk-bg` | #0b1220 | #f6f5fb | 화면 전체 |
| 카드·창 | `--kk-surface` | #111a2e | #ffffff | 카드, 창, 표 몸통 |
| 들어간 칸 | `--kk-sunken` | #0e1628 | #f6f4fe | 입력칸, 표 머리, 묶음 칸 |
| 테두리 | `--kk-line` | #22304d | #ece9f6 | 카드·표 칸 나눔 |
| 진한 테두리 | `--kk-line-strong` | #2c3b5c | #e0dbf2 | 묶음 칸 나눔(장식선) |
| 입력칸 테두리 | `--kk-control` | #5b6d92 | #7f8799 | 입력칸·선택 상자·체크 상자 경계. **바탕과 3:1 이상**(WCAG 1.4.11) |
| 가장 진한 글자 | `--kk-text-strong` | #ffffff | #111827 | 화면 제목, 큰 숫자 |
| 본문 | `--kk-text-1` | #e2e8f0 | #1f2937 | 기본 글자 |
| 보조 | `--kk-text-2` | #a9b7cf | #4f5b70 | 설명, 표 보조 칸 |
| 흐림 | `--kk-text-3` | #8e9cb2 | #5d6a80 | 단위, 안내 한 줄. **이보다 흐린 글자는 쓰지 않는다** |
| 강조 글자 | `--kk-accent` | #a5adfb | #4f46e5 | 링크, 선택된 메뉴 글자 |
| 강조 버튼 바탕 | `--kk-accent-fill` | #4f46e5 | #4f46e5 | 주 버튼(글자 `--kk-on-fill` 흰색) |
| 그래프 점 | `--kk-chart-mark` / `--kk-chart-flag` | #7c83f2 / #c87a0a | #4f46e5 / #8a4508 | 분포 그림의 일반 점 / 확인 필요 점(⚠ 표시와 함께). dataviz 검증기로 색약 구분·명도 범위 통과 |
| 포커스 테두리 | `--kk-focus` | #818cf8 | #5b4ae0 | `:focus-visible` |
| 성공 | `--kk-success` | #6ee7b7 | #126b34 | 저장 완료, 합격 |
| 주의 | `--kk-warning` | #fcd34d | #8a4508 | 확인 필요, 미입력 |
| 위험 | `--kk-danger` | #fb8a9c | #c42b2b | 오류, 불합격, 삭제 |

### 판정 색 (`core/admissionJudgment.js`의 단계와 1:1)

| 판정 | 아이콘 | 글자 변수 | 바탕 변수 | 다크 글자/바탕 | 라이트 글자/바탕 |
|---|---|---|---|---|---|
| 안정 | 🟢 | `--kk-judge-safe` | `--kk-judge-safe-bg` | #6ee7b7 / #0f2e2a | #065f46 / #ecfdf5 |
| 적정 | 🔵 | `--kk-judge-proper` | `--kk-judge-proper-bg` | #a5b4fc / #1d2350 | #3730a3 / #eef2ff |
| 소신 | 🟠 | `--kk-judge-hope` | `--kk-judge-hope-bg` | #fcd34d / #33291a | #92400e / #fffbeb |
| 어려움 | 🔴 | `--kk-judge-challenge` | `--kk-judge-challenge-bg` | #fda4af / #3a1a2a | #9f1239 / #fff1f2 |
| 판단 근거 부족·기준 없음 | ❔ ⚪ | `--kk-judge-none` | `--kk-judge-none-bg` | #cbd5e1 / #1e293b | #424f63 / #f1f5f9 |

- '적정'은 색(indigo)과 아이콘(🟡)이 서로 맞지 않아 아이콘을 **🔵**로 바꿨다(2026-11-18). 노랑으로 바꾸면 소신(amber)과 구분이 어렵기 때문이다.
- 후기 일반고 석차백분율 3단계(안정·경계·주의, `judgeGeneralPercentile`)는 별도 척도다. 경계 🟡(amber)를 그대로 쓴다.
- 판정은 색만으로 전달하지 않는다. 늘 아이콘 + 글자(안정·적정…)를 함께 쓴다.

### 대비 확인

`node tools/design/check-contrast.mjs`: 모든 글자 변수 × 바탕 3종, 판정 글자 × (판정 바탕·카드), 버튼 글자 × 버튼 바탕은 4.5:1, 입력칸 테두리·포커스 테두리 × 바탕 3종은 3:1을 기준으로 라이트·다크를 계산한다. 2026-11-18 결과는 82쌍 모두 통과(글자 중 가장 낮은 값은 라이트 흐림 / 들어간 칸 5.03, 테두리 중 가장 낮은 값은 라이트 입력칸 / 들어간 칸 3.31). 값을 바꾸면 다시 돌린다.

### 색 사용 규칙

- 색 계열은 무채색 + 강조(indigo) + 상태 3색(emerald·amber·rose)만 쓴다. sky·cyan·purple·violet·pink·orange는 새 화면에 쓰지 않는다(지금 sky 56곳·cyan 26곳·purple 15곳은 C 때 정리).
- 반투명 바탕(`bg-*/20`)은 바탕 위에 겹쳐 대비가 달라지므로 새 화면에서는 판정 바탕 변수처럼 불투명 값을 쓴다.
- 흰 종이(원서대장·인쇄 미리보기, `bg-white`)와 인쇄물(`print*.css`)은 이 표가 아니라 원래 밝은 색을 쓴다.
- `--kk-line`·`--kk-line-strong`은 장식선이라 대비 기준이 없다. 사용자가 눌러 조작하는 칸의 경계에는 쓰지 않고 `--kk-control`을 쓴다.
- 그래프의 막대·선은 바탕과 3:1 이상, 그래프 안 글자는 4.5:1 이상. 판정 글자 변수는 막대 색으로 써도 이를 넘는다.

## 2. 글자 크기·굵기

| 단계 | 변수 / Tailwind | 크기 | 쓰는 곳 | 지금 쓰는 이름 |
|---|---|---|---|---|
| 1 | `--kk-fs-1` / `text-kk-1` | 12px | 배지, 표 보조 문구. **최소 크기** | `text-xs`, `text-[10px]`·`[11px]`(A에서 12px로 덮음) |
| 2 | `--kk-fs-2` / `text-kk-2` | 13px | 큰 표 본문(원서 관리·매트릭스) | 거의 없음 |
| 3 | `--kk-fs-3` / `text-kk-3` | 14px | 기본 본문, 버튼, 입력칸 | `text-sm` |
| 4 | `--kk-fs-4` / `text-kk-4` | 16px | 강조 본문, 카드 제목 | `text-base`, `text-lg`(18) → 16 |
| 5 | `--kk-fs-5` / `text-kk-5` | 20px | 구역 제목 | `text-xl` |
| 6 | `--kk-fs-6` / `text-kk-6` | 24px | 화면 제목(한 화면에 하나) | `text-2xl` |
| 큰 숫자 | `--kk-fs-display` / `text-kk-display` | 32px | 대시보드 요약 숫자만 | `text-3xl`·`4xl`·`5xl`(30·36·48) → 32 |

- 줄 간격: 제목·큰 숫자 `--kk-lh-tight`(1.3), 본문 `--kk-lh-body`(1.55).
- 굵기는 세 가지: 보통 400(`--kk-fw-regular`), 강조 600(`--kk-fw-strong`, 표 머리·버튼·카드 제목), 굵게 700(`--kk-fw-bold`, 화면 제목·큰 숫자·판정). 지금 많이 쓰는 `font-black`(900, 82곳)·`font-medium`(500, 47곳)은 C 때 700·400으로 옮긴다.
- 인쇄물(원서대장·성적표)은 종이 크기에 맞춘 별도 크기를 쓰며 이 표를 따르지 않는다.

## 3. 숫자 표 규칙

- 점수·석차·석차백분율·인원·날짜 숫자는 **본문 글꼴 + 같은 폭 숫자**로 쓴다: 클래스 `.num`(`font-variant-numeric: tabular-nums`). `font-mono`는 쓰지 않는다(2026-11-18 숫자용 51곳을 `.num`으로 바꿈).
- `font-mono`를 남기는 곳: 파일 확장자·경로, 계정 아이디, 단축키, 화면 잠금 번호 입력처럼 글자 하나하나를 읽어야 하는 곳(지금 6곳).
- 표에서 숫자 칸은 오른쪽 정렬, 반·번호처럼 짧은 식별 숫자는 가운데 정렬.
- 소수 자리: 환산 점수·커트라인 소수 둘째 자리(`toFixed(2)`), 석차백분율 둘째 자리 + `%`, 인원·건수는 정수 + 단위(명·건). 값이 없으면 `-`.
- 단위는 숫자보다 한 단계 작고 흐린 글자(`--kk-text-3`)로 붙인다(예: `85.25<small>점</small>`).
- 1,000 이상은 천 단위 쉼표를 넣는다(`toLocaleString('ko-KR')`). 점수에는 해당이 거의 없고 인원·건수 합계에 쓴다.

## 4. 아이콘

- **한 종류: 선 아이콘**(24×24 칸, 선 굵기 1.8, 끝 둥글게, 색 `currentColor`, `aria-hidden="true"`). 지금 공통 틀 메뉴(`core/appShell.js`의 `GROUP_ICONS`)가 이 방식이다. React 전환 때 같은 모양의 Lucide(`lucide-react`)로 옮긴다.
- 크기: 메뉴·버튼 18px, 본문 안 16px, 빈 화면 안내 32px.
- 아이콘만 있는 버튼은 반드시 `aria-label`을 단다(예: 닫기).
- 이모지는 판정 표시(🟢🔵🟠🔴❔⚪)에만 남긴다. 화면 코드의 나머지 이모지(78종, 360곳)는 C 때 아래 표대로 바꾼다. 새 화면에는 이모지를 넣지 않는다.

| 이모지(횟수) | 뜻 | 선 아이콘(Lucide 이름) |
|---|---|---|
| 🏫(24) 🏛(5) | 학교 | `school` |
| 🏭(11) | 마이스터·특성화고 | `factory` |
| ✕(20) | 닫기 | `x` |
| 🔒(19) 🔓(5) | 잠금·풀림 | `lock` / `lock-open` |
| 🔑(6) | 비밀번호 | `key-round` |
| ⚠(15) | 주의 | `triangle-alert` |
| 📊(15) 📈(6) | 통계·추세 | `chart-column` / `chart-line` |
| 🎯(13) | 커트라인·목표 | `target` |
| 📋(10) 📝(8) | 목록·기록 | `clipboard-list` / `notebook-pen` |
| 📅(9) | 학년도·날짜 | `calendar` |
| 💾(9) | 저장 | `save` |
| 🔍(9) | 검색 | `search` |
| ⭐(9) | 관심학교 | `star` |
| ➕(8) | 추가 | `plus` |
| 📥(8) 📤(3) | 가져오기·내보내기 | `download` / `upload` |
| ✅(7) ✓(7) | 완료 | `circle-check` / `check` |
| 🖨(7) | 인쇄 | `printer` |
| 💡(7) | 도움말 | `lightbulb` |
| 🗑(6) | 삭제 | `trash-2` |
| 📦(5) | 인수인계·배포자료 | `package` |
| 💬(5) | 상담 | `message-square` |
| 🔄(4) | 새로 고침·새 학년 | `refresh-cw` |
| 🎓(4) | 진학 | `graduation-cap` |
| 📭(4) | 자료 없음 | `inbox` |
| 🚀(4) ⚡(3) ✨(2) | 꾸밈 | 없앤다 |
| 👤(2) | 계정 | `user` |
| ⚙(2) | 설정 | `settings` |
| 🌐(3) | 관내 공유 | `globe` |
| 📚(3) 📖(2) | 설명서 | `book-open` |
| 🏷(3) | 전형·이름표 | `tag` |

## 5. 용어표

화면 문구(버튼·제목·안내·오류)는 아래 표기를 쓴다. **저장값·전형 저장명·파일 형식 이름은 바꾸지 않는다**(예: 커트라인 입력칸의 "취업희망자" 저장값, `PHGC` 식별자).

| 쓰는 말 | 쓰지 않는 말 | 뜻 |
|---|---|---|
| 배포자료 | 배포 자료, 배포 패키지 | 학년부장이 담임에게 주는 `.kkomipkg` |
| 취합자료 | 취합 자료, 패치 | 담임이 학년부장에게 내는 `.kkomipatch` |
| 인수인계 파일 | 최종 보관본 | 다음 학년도로 넘기는 개인정보 없는 입시 자료 |
| 관내 공유 파일 | 공유 데이터 | 관내 학교끼리 주고받는 익명 결과 |
| 원서대장 | 원서 대장 | 출력용 원서 목록 |
| 지원현황 | 지원 현황 | 학생별 원서·결과 기록 |
| 원서 관리 | 원서관리 | 일괄 지원·결과 입력 화면 |
| 학년부장 | 관리자, 마스터 | 전교 자료를 관리하는 계정(기술명 `master`) |
| 담임 | 담임교사(본문 안 문장은 허용) | 자기 반만 수정 |
| 진로부장 | 진로 교사 | 조회 전용 |
| 공용 데이터 암호 | 공용 암호, 학교 암호 | 학교 자료 전체를 잠그는 암호(모든 계정 공통) |
| 비밀번호 | 암호(개인) | 개인 계정 로그인 |
| 올리기 | 업로드, Import | 나이스 엑셀을 프로그램에 넣기 |
| 가져오기 / 내보내기 | 불러오기, 업로드 / 다운로드 | 교환 파일을 넣기 / 만들기 |
| 커트라인 | 컷, 합격컷 | 확정된 합격 최저점 기록(학교·학과·전형별) |
| 합격선 | 커트라인(추정일 때) | 정원·지원자 수 등으로 **추정**한 선 |
| 석차백분율 | 석차 백분율 | 후기 일반고 학교 내 교과 석차 비율(%) |
| 고입 연도 | 입학년도 | 고교 입학 학년도. 표시는 `core/admissionYear.js` |
| 취업희망자 특별전형 | 취업희망자, 취업자 특별전형 | 특성화고 전형 표시(`displayTrack`) |
| 판단 근거 부족 | 판정 불가 | 불합격 사례 없는 합격 최저점 아래 |
| 말줄임 "…" | "..." | 진행 중 문구 |

2026-11-18에 화면·백엔드 안내 문구의 "배포 자료"(35곳), "지원 현황"(3곳), "석차 백분율"(4곳), 화면의 "관리자"(12곳), "업로드"(3곳)를 이 표대로 고쳤다. "입학년도"(7곳)는 대부분 저장 필드 설명이라 C 때 화면을 다시 만들며 정리한다.

## 5-1. 평문을 한눈에 읽히는 모양으로 (2026-11-22)

모든 화면은 전역 스킬 **plain-text-visual** 규칙을 따른다(원본 `tools/agent-skills/plain-text-visual/SKILL.md`, 다른 컴퓨터 설치는 `agents.md` 참고). 문장 속 숫자·상태는 뱃지·표·히트맵·막대·이름표 줄·경고 상자·접기로 바꾼다.

- 색은 판정 색 이름표(`--kk-judge-safe/proper/hope/challenge/none`)만 쓴다. 좋음=safe, 안내=proper, 주의=hope, 나쁨=challenge, 기본=none·회색.
- 지금 있는 부품: 뱃지 `.cg-chip`(`--ok`·`--warn`·`--bad`·`--info`), 이름표 줄 `.cg-fact`, 경고 상자 `.cg-alert`, 점수 칸 `.counsel-score-part.is-short`(`styles/counsel-summary.css`), 위치 막대 `views/teacher/counsel/generalBar.js`, 성취도 히트맵 `.tr-g--A~P`·만점 미달 `.tr-short`(`styles/transcript.css`).
- 나이스 자료와 맞춰 보는 화면은 나이스의 칸 이름·순서를 따른다(예: 행동발달·창의체험, 종합성적표 = 기초자료 확인서 순서).
- 화면 전체 뱃지화는 React 전환 때 공통 부품으로(`docs/react-radix-plan.md` 8-1절).

## 6. 검토 기록 (2026-11-18)

### ui-ux-pro-max 검토

`ui-ux-pro-max` 스킬로 "교육 관리 대시보드·많은 자료" 기준과 색·글자·표 지침을 대조했다.

- **고친 것**: 입력칸 경계가 바탕과 1.3~1.6:1로, 조작 요소 경계 기준(3:1)에 못 미쳤다 → `--kk-control` 추가(3.3~3.6:1). 검사 스크립트에 3:1 항목(입력칸·포커스 테두리)을 넣었다.
- **맞는 것(그대로 둠)**: 본문 줄 간격 1.55(권장 1.5~1.75), 굵기 위계(제목 600~700·본문 400), 뜻으로 이름 붙인 색 변수, 다크 모드는 뒤집기가 아니라 밝게 조정한 값, 표 숫자 같은 폭(`tabular-nums`), 색만으로 뜻을 전하지 않기(판정은 아이콘+글자), 아이콘은 이모지 대신 SVG(Lucide).
- **받아들이지 않은 것**: 추천 글꼴(Fira Sans/Code)은 한글이 없어 Pretendard·SUIT를 유지한다. 추천 화면 구성(기업 소개용 첫 화면)은 업무 도구와 맞지 않는다. 글자 크기 예시(12·14·16·18·24·32)의 18 대신, 큰 표 본문용 13을 둔 지금 단계를 유지한다.

### Tailwind `@theme inline` 확인 (context7, Tailwind v4 문서)

- 다른 CSS 변수를 가리키는 테마 변수는 `@theme inline`으로 써야 라이트·다크 전환 때 값이 따라간다(문서 그대로).
- `text-*` 글자 크기는 줄 간격도 함께 정하므로 `--text-kk-N--line-height` 짝 변수를 두었다.
- 시험 빌드로 `text-kk-text-2`·`bg-kk-surface`·`border-kk-line`·`text-kk-judge-safe`·`bg-kk-judge-safe-bg`·`text-kk-3`·`text-kk-display`가 모두 `var(--kk-…)`를 가리키는 클래스로 만들어지는 것을 확인했다.

## 7. shadcn/ui 변수 대응표 (2027년 2월 React 전환용)

shadcn/ui는 Radix 부품에 Tailwind 모양을 입힌 것으로, 아래 이름의 CSS 변수를 쓴다. 전환할 때 shadcn 변수를 직접 고치지 않고 `--kk-*`를 가리키게 하면, 기준 값은 `tokens.css` 한 곳에만 남는다.

```css
/* React 전환 때 shadcn 의 globals.css 에 넣을 연결(라이트·다크 모두 tokens.css 가 값을 바꾼다) */
:root {
  --background: var(--kk-bg);
  --foreground: var(--kk-text-1);
  --card: var(--kk-surface);
  --card-foreground: var(--kk-text-1);
  --popover: var(--kk-surface);
  --popover-foreground: var(--kk-text-1);
  --primary: var(--kk-accent-fill);
  --primary-foreground: var(--kk-on-fill);
  --secondary: var(--kk-sunken);
  --secondary-foreground: var(--kk-text-1);
  --muted: var(--kk-sunken);
  --muted-foreground: var(--kk-text-2);
  --accent: var(--kk-sunken);          /* shadcn 의 accent 는 "마우스를 올린 칸 바탕" 뜻이다 */
  --accent-foreground: var(--kk-text-strong);
  --destructive: var(--kk-danger);
  --border: var(--kk-line);
  --input: var(--kk-control);
  --ring: var(--kk-focus);
  --chart-1: var(--kk-judge-safe);
  --chart-2: var(--kk-judge-proper);
  --chart-3: var(--kk-judge-hope);
  --chart-4: var(--kk-judge-challenge);
  --chart-5: var(--kk-judge-none);
}
```

| shadcn 변수 | 꼬미입시 변수 | 주의 |
|---|---|---|
| `--background` / `--foreground` | `--kk-bg` / `--kk-text-1` | |
| `--card`·`--popover` | `--kk-surface` | |
| `--primary` / `--primary-foreground` | `--kk-accent-fill` / `--kk-on-fill` | 주 버튼 |
| `--muted-foreground` | `--kk-text-2` | 보조 글자. 더 흐린 글자는 `--kk-text-3` 을 직접 쓴다 |
| `--accent` | `--kk-sunken` | 이름은 같아도 뜻이 다르다: shadcn 은 "올린 칸 바탕", 꼬미입시 `--kk-accent` 는 "강조 글자" |
| `--destructive` | `--kk-danger` | 삭제·오류 |
| `--border` | `--kk-line` | 장식선 |
| `--input` | `--kk-control` | 입력칸 경계(3:1) |
| `--ring` | `--kk-focus` | 포커스 테두리 |
| `--chart-1`~`5` | 판정 5색 | 순서 고정: 안정·적정·소신·어려움·근거 없음 |
| (없음) | `--kk-success`·`--kk-warning`·판정 바탕 | shadcn 기본에 없는 변수는 `--kk-*` 를 그대로 쓴다 |

- 둥근 모서리(`--radius`)는 지금 화면 값을 따른다: 카드 24px(`.glass-card`), 입력칸·주 버튼 12px(`.input-field`·`.btn-primary`), 보조 버튼 약 10px. shadcn 에는 `--radius: 0.75rem` 를 주고 카드만 크게 쓴다.
- 부품 추가는 `npx shadcn@latest add …`로 하되, React·Tailwind 설정과 `components.json`이 먼저 있어야 한다(전환 계획서에서 다룬다).
