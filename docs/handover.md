# 꼬미입시(PHGC) 작업 인수인계

최종 갱신 기준: 2026-11-12

## 한눈에 보는 현재 상태

- 서비스명: **꼬미입시** / 기술명 `PHGC`(저장소·Go 모듈·교환 파일 형식)
- 최신 안정 릴리즈: `v1.6.6` (2026-11-12, GitHub·Gitea 게시). 윈도우 실제 학교 data 복제본 검증 없이 사용자 결정으로 게시함 → 학교 현장 첫 실행 결과를 확인할 것
- 아래 "v1.6.5 이후 변경" 목록은 v1.6.6에 모두 포함되어 배포되었다.
- 원본 Gitea: `https://gitea.gguk.link/purnpadosori/PHGC-OFFLINE.git` (git remote `origin`)
- GitHub 백업·공개 릴리즈: `https://github.com/purnpado/kkomi_ipsi` (git remote 없음 → `git push https://github.com/purnpado/kkomi_ipsi.git main`)
- 실행 파일: `꼬미입시.exe`(PRODUCT_FILENAME), 기술용 영문 이름 `kkomi-ipsi`(APP_NAME, 맥 앱 내부·GitHub 릴리즈 파일)
- 릴리즈 절차(v1.6.5에서 맥으로 수행): `build/config.yml`·`build/windows/info.json`·`wails.exe.manifest`·`build/darwin/Info*.plist`·`internal/sync/manager.go`(AppVersion)·`server-data/version.json` 버전/노트 갱신 → `wails3 build GOOS=windows` → zip(`kkomi-ipsi_v<버전>.zip`, 안에 `꼬미입시.exe`. **맥 `zip` 명령은 한글 이름에 UTF-8 표시를 넣지 않아 윈도우에서 깨지므로 Python `zipfile`로 만든다**) → `SHA256SUMS.txt`(exe·zip 지문값, 자동 업데이트 검증용) → 커밋·태그 → Gitea 먼저 푸시 → GitHub 푸시 → GitHub 릴리즈(`kkomi-ipsi.exe`, zip, SHA256SUMS.txt — GitHub는 첨부 파일 이름의 한글을 바꾸므로 exe는 영문 이름으로 올리고, 표시 이름은 "kkomi-ipsi.exe (꼬미입시 실행 파일 · 처음 실행하면 꼬미입시.exe로 이름이 바뀜)". 내려받으면 kkomi-ipsi.exe로 저장되지만 v1.6.7부터는 처음 실행할 때 스스로 꼬미입시.exe로 이름을 바꾼다(`NormalizeExecutableName`)) → Gitea 릴리즈 API(`꼬미입시.exe`, zip, SHA256SUMS.txt; 인증은 `git credential fill`). 사용자 승인 후에만.

## v1.6.5 이후 변경 (v1.6.6에 포함)

- 후기 일반고: 출석·봉사 학년별 계산(나이스 파일에 `학년` 칸이 있으면 학년별로 읽음), 학년 결손(전입·중도 입국) 요강 공식(40/60·100%), 미재학 학년 봉사 환산, 동점자는 학기 평균 성취도로 비교, 총점 범위(가산점 미정분)·기본 지표
- 4단계 판정 통일(`frontend/src/core/admissionJudgment.js`): 여유폭 비율·점수 두 방식, 학년부장 설정(`school_config.judgment_settings`), 상담 화면 보기 전환
- 1차·2차 전형 결과 구분, 학교별 1차 선발 배수(`internal/calc/stages.go`), 관내 공유에 1·2차 구분·후기고 항목별 확정 총점, 후기고 관내 합격선 추정(정원·지원자 수 입력)
- 원서대장 누적 기입, 특성화고 취업희망자 1지망 제한, 별도 전형 학교(자사고·외고·예술고 등) 점수 미기록
- 학급 수 변경(`UpdateClassCount`), 학교 설정보다 큰 반 자료는 올리기 전에 막음, "새 학년 시작"이 옛 학급 자료를 `data/backup_new_year/`로 옮김(되살아나던 문제 수정)
- **인수인계 파일**(`.kkomihandover`, 개인정보 없음·누적) / **지난 학년도 입시 자료 가져오기**(이전 버전 `.kkomiarchive`도 입시 자료만 익명으로 꺼냄). 학생 개인정보가 담긴 **최종 보관본 만들기·복원은 제거**
- 결과 확정 때 그해 원서 결과를 이름·학번 없이 `config.db`의 `admission_history`에 보관(분석·관내 공유가 해마다 이어짐), 관내 공유 파일에 우리 학교 전 학년도 결과 포함
- 속도: 성적 올리기·관내 공유 파일 만들기 개선, 권한 확인 보강(가산점 저장·새 학년 시작·학급 수 변경)

## 자동 업데이트 주의 (2026-11-12 확인)

- 프로그램 안 [지금 업데이트]는 v1.6.6 **다음** 버전부터 들어 있다. v1.6.6 이하에서는 업데이트 버튼이 GitHub 릴리즈 페이지를 연다(옛 프로그램이라 바꿀 수 없음). 그래서 v1.6.7로는 **한 번만 직접** 받아 바꾸고, 그 뒤부터 자동으로 바뀐다. 릴리즈 노트에 이 점을 적는다.
- 자동 업데이트는 GitHub `kkomi-ipsi.exe`(없으면 Gitea `꼬미입시.exe`)를 받아 SHA256SUMS.txt로 확인한 뒤 실행 파일을 `꼬미입시.exe`로 바꿔 넣는다.

## 상담 일지 권한 (사용자 결정 2026-11-12)

- 조회: 학년부장·담임·진로부장 모두 **본인이 쓴 기록만** 본다(`GetStudentCounselingRecords`가 작성자로 거른다).
- 작성: 담임은 자기 반, 학년부장·진로부장은 전교생(학년부장은 학년 전체를 총괄하므로).
- 배포자료(`ExportDistributionPackage`)에는 받는 사람이 쓴 상담 일지만 담는다(`snapshotClassForRecipient`가 다른 작성자 기록을 지우고 VACUUM). 취합자료(패치)에는 상담 일지가 들어가지 않는다. 테스트: `app_counsel_privacy_test.go`.

## 학년도 전환(학교 운영 방식, 사용자 결정 2026-11-12)

1. 학년 말: 입시 결과 확정 → [📦 인수인계 파일] → 관내 공유 파일 교환
2. 새 학년도: 새 폴더에 새 버전 설치 → 초기 설정(학급 수·새 학년부장·새 공용 암호) → [📥 지난 학년도 입시 자료 가져오기]
3. 원서대장은 출력해 보관하므로 개인정보가 담긴 전체 백업은 두지 않는다.

## 점검 도구

- 화면 자동 캡처: `zsh tools/capture/run.sh` (역할별 주요 화면 라이트·다크, 결과 `test-data/capture/latest/`). 화면을 고친 뒤 찍어서 직접 확인한다.

- 가상 학생 자료: `python3 -I tools/testdata/gen_students.py` → `test-data/가상학생/`(10개 반 255명, v1·v2), 점검 `go run ./tools/testdata/verify <폴더> <유형목록>`
- 여러 학교·여러 해 입시 시뮬레이터: `go run ./tools/simulate -years 5`(약 25분) → `test-data/시뮬레이션/보고서.md`. 2026-11-12 결과는 `docs/simulation-report-2026-11-12.md`
- 앱 자동 검증(맥): `tools/autopilot/README.md`

## 다음 작업 (추천 순서, 사용자와 합의한 목록)

1. ~~산출 규칙 안내 글 바로잡기~~ **완료(2026-11-12)**: 학교별 산출 상세 창의 안내 문구를 `internal/calc/guide.go`(`DescribeRule`)가 산출 규칙·선발 방식에서 만들어 `GetSchoolRuleList`로 내려준다. 화면(`schoolScoreDetail.js`)에는 규칙을 적지 않는다.
2. ~~불합격 사례가 없을 때의 판정~~ **완료(2026-11-12)**: 불합격 사례 없는 합격 최저점 아래는 "❔ 판단 근거 부족"(`core/admissionJudgment.js`, 근거 `GetAdmissionEvidence`). 미달·경쟁률은 커트라인 관리 [📊 공식 경쟁률] 입력값으로만 표시(`competition_records`, 인수인계 파일 포함). 시뮬레이션: 전기 어려움 합격률 52% → 43%(`docs/simulation-report-2026-11-12.md` 끝).
3. ~~가정해 보기~~ **완료(2026-11-12)**: 상담 화면 [🔮 가정해 보기]. 남은 학기(성적 없는 3-1·3-2) 성취도 ±2단계·앞으로의 결석·추가 봉사·리더십·후기고 3학년 창체/행발 가산점을 넣으면 학교별 점수와 판정 변화를 보여 준다(저장 안 함). `internal/calc/whatif.go`(학생 원자료 사본에 가정값 적용), `internal/database/whatif_service.go`(후기고 석차 재계산).
   - 후기고 석차: 학년부장 PC는 전교생 자료로 정확히 다시 계산한다. 담임 PC는 배포자료에 자기 반 자료·자기 반 전교 석차 기록만 있어(개인정보 보호) 우리 반 학생들의 (교과 합산 점수, 전교 석차) 기록을 이어 새 석차를 **추정**하고 화면에 그렇게 표시한다. 정확히 하려면 배포자료에 이름 없는 전교생 교과 합산 점수 목록을 넣는 방법이 있으나 사용자 결정 전(같은 학교 안에서는 점수만으로도 누구인지 짐작될 수 있음).
   - 후기고는 전교생 모두 3-2가 있을 때만 실제 3-2를 쓰므로, 가정해 보기에서는 다른 학생의 3-2를 지금 예상치(3-1 복사)로 채워 비교한다.
4. ~~여러 해 추세 그래프와 시뮬레이션 자료 열람~~ **완료(2026-11-12)**: 입시 분석의 학년도 선택은 자료가 있는 모든 학년도(`GetAnalysisYears`). 학교·학과·전형별 학년도 추세 SVG 그래프(`modals/analysis/trendChart.js`, `GetAdmissionTrend`): 관내·우리 학교 합격 최저, 관내 1차 합격선, 지원·합격 인원, 산출식(만점·요강) 변경 표시, 점수/만점 대비 % 전환. 원서 점수 스냅샷의 산출식 버전에 요강 학년도(`calc.RuleYear`)를 넣는다. 시뮬레이터는 끝에 `test-data/시뮬레이션/열람용/<학교>/data`(시험용 계정·암호화, `안내.txt` 참고)를 만든다.
5. ~~학과 지망 전략~~ **완료(2026-11-12)**: 입시 분석 하단 "학과 지망 전략"(`GetPreferenceStrategy`, `modals/analysis/preferencePanel.js`). 학과별 지망 순위별 배정 인원·최저점, 자리 남음 여부, 학생 점수로 "1지망으로 쓰면 작년 기준 배정되었을지" 풀이.
6. 그 뒤: v1.6.6 후보 빌드 → 윈도우 실제 data 복제본 검증 → 릴리즈(사용자 승인).

기타 완료(2026-11-12): 판정 이름 "도전" → "어려움". 시뮬레이터 재현성 오류(특성화고 취업희망자 학과 처리 순서가 실행마다 바뀌어 면접 난수가 달라짐) 수정 — 같은 설정 두 번 실행 결과 동일 확인. 요강 모집정원(마이스터고 3·특성화고 7, `server-data/highschools.json`의 `quotas`)을 실행 파일에 넣고(`main.go` embed) 공식 경쟁률 입력 창에 자동으로 채움. 예전 `data/highschools.json`을 쓰는 폴더도 모집정원은 내장 자료로 보충.

학기 초 후기고 예상치(완료, 사용자 승인): 전교생 3학년 성적이 없으면 3-1 = 작년(2학년) 성적 평균, 3-2 = 3-1 복사 예상, 출결·봉사는 기록 그대로(`internal/calc/early_year.go`, 요강 대조 문서 10.5). 가정해 보기 [📊 남은 학기 성적별 비교] 추가.

관내 통합 집계(`GetConsolidatedAdmissionStats`)는 학과를 비우면 학교·전형 전체를 합친다(2026-11-12, 분석 화면 "전체(학교 총괄)"가 비던 문제 해결).

자동 업데이트(2026-11-12, v1.6.7부터 동작): 업데이트 안내 창 [지금 업데이트](윈도우) → GitHub(안 되면 Gitea) 최신 릴리즈에서 실행 파일과 `SHA256SUMS.txt`를 받아 지문값 대조 → 자료 봉인 후 암호화 파일만 `업데이트전_백업/<시각>_v<버전>`에 복사 → 지금 실행 파일을 `.old`로 바꾸고 새 파일을 **항상 `꼬미입시.exe`**로 넣음 → 새 프로그램 실행 후 종료, 다음 실행 때 `.old` 삭제(`internal/sync/selfupdate.go`, `app_update.go`). 지문값 파일이 없는 릴리즈는 자동 업데이트를 거부하므로 **릴리즈마다 `SHA256SUMS.txt`를 반드시 올린다.** 맥은 다운로드 페이지 안내. v1.6.6 사용자는 다음 버전 한 번은 다운로드 페이지에서 받아야 한다. 서명하지 않은 실행 파일이라 학교 PC 백신·SmartScreen 반응을 실제로 확인해야 한다.

화면 개편(v1.7 목표): 설계안 `docs/ui-redesign-plan.md`(공통 틀·역할별 대시보드·메뉴 구성·진행 단계). 사용자 확정 뒤 구현.

보류(사용자 결정): 공개 GitHub 과거 이력에 남은 예전 온라인 방식 자료(`server-data/expected_support.json`, `server-data/cutoffs/*`, 옛 실행 파일)의 이력 정리는 하지 않음.

## 코드 구조 (2026-11-11 모듈화)

- 백엔드: 루트에는 `main.go`와 Wails 바인딩 위임 파일 `app*.go`만 두고, 도메인 로직은 `internal/{model,parser,calc,crypto,database,exchange,sync}`에 있습니다. `App` 공개 메서드명과 JSON 필드는 그대로입니다.
- 프론트엔드: `frontend/src/main.js`는 부트스트랩·이벤트 라우팅 전용이며, 화면은 `views/`, 모달은 `modals/`, 공통 기반은 `core/`, 스타일은 `styles/`에 있습니다. 화면 간 연결은 `core/navigation.js`(이벤트 버스)로만 합니다.
- Wails v3 연결: `core/wailsBridge.js`가 v3 바인딩 생성기가 만든 `frontend/bindings/PHGC/app.js`(메서드 ID 호출)를 기존 `window.go.main.App.*` 호출로 연결하고 오류를 문자열로 맞춥니다. Go `App` 메서드를 추가·변경하면 `wails3 build`(또는 `wails3 generate bindings -clean=true -i`)로 바인딩을 다시 생성해 커밋합니다.
- 고입 연도 표기: 저장은 고교 입학 학년도 하나, 화면은 `core/admissionYear.js`로 "2027 고입 (현 중3 · 2026학년도)"처럼 표시합니다. 새 원서 기본값은 학교 설정 연도를 따르고, 설정이 현재 중3 입시보다 이전이면 학년부장 대시보드에 안내 띠가 뜹니다(자동 변경 없음).
- 고입 연도 변경: 대시보드 **[📅 고입 연도 변경]**은 학교 설정 연도만 바꾸고 학생 자료를 보존합니다(`UpdateAdmissionYear`, 학년부장 전용). **[🔄 새 학년 시작]**(`StartNewAcademicYear`)은 지난 학년도 학급 파일을 `data/backup_new_year/`로 옮기고 학년도·학급 수를 새로 정합니다(커트라인·결과 확정·관내 공유·익명 입시 기록은 유지).
- 구버전(PHGC v1.6.2) 자료 전환: 같은 `data` 폴더에서 꼬미입시로 **처음 로그인할 때** `*.db.phgc`(헤더 `PHGC-GCM-1`)를 풀어 `*.db.kkomi`로 다시 암호화하고, 원본 `.phgc`는 `data/backup_phgc_migration/`에 보존합니다. 이어서 모든 학급 DB 구조를 최신으로 맞춥니다(`MigrateExistingClassDBs`). 전환 뒤에는 구버전 `PHGC.exe`로 그 폴더를 열 수 없으므로 전환 전 폴더 복제본을 따로 보관합니다.
- 교환 파일(`.phgcpkg`·`.phgcpatch`·`.phgcreset`·`.phgcdata`·`.phgc`)은 계속 가져올 수 있으며, 새로 만드는 파일은 모두 `.kkomi*`입니다. 최종 보관본(`.kkomiarchive`·`.phgcarchive`)은 [지난 학년도 입시 자료 가져오기]에서 입시 자료만 꺼낼 때만 씁니다.
- 배포자료 가져오기: 학년부장 폴더(계정 목록에 학년부장 또는 `keys/admin.json` 존재)는 잠긴 상태에서도 거부합니다. 담임 폴더에 다시 가져올 때는 지우기 전 DB 파일 전체를 `data/backup_before_pkg_import/<시각>/`에 복사합니다. 기존 학급 자료가 있으면 **공용 데이터 암호 또는 본인 비밀번호**를 받아(`OpenDistributionPackageWithPassword`) 상담 일지·지원현황·직접 입력한 출결/봉사/가산점을 새 배포자료 DB로 병합합니다. 암호가 틀리거나 다른 학교 배포자료면 아무것도 지우지 않고 중단하며, 대상 계정의 예전 개인 잠금 파일은 백업 폴더로 옮겨 다음 로그인 때 공용 암호+초기 비밀번호로 다시 등록합니다. 암호 입력을 취소하면 확인 후 배포자료만 적용합니다(기존 자료는 백업본으로만 남음).
- 윈도우 자동 점검 키트(`build/bin/windows-verify/`)는 2026-11-12 로컬 정리 때 지웠습니다. 필요하면 `tools/autopilot`을 바탕으로 다시 만듭니다.
- 모든 `.go`·`.js`·`.css` 파일은 500줄 이하입니다. 새 코드도 이 기준을 지킵니다.
- 화면 검증 방법(macOS): `go build -tags server -o <임시폴더>/kkomi .` 후 `WAILS_SERVER_PORT=<포트> ./kkomi`로 띄우면 브라우저에서 실제 백엔드와 함께 화면을 확인할 수 있습니다(파일 대화상자는 동작하지 않음, `data`는 실행 파일 옆에 생성).

## macOS(MacBook) 작업 시작

macOS에서는 소스·합성 테스트·프론트엔드 작업을 이어갈 수 있습니다. Xcode Command Line Tools, Go, Node.js/npm, Wails v3 CLI(`go install github.com/wailsapp/wails/v3/cmd/wails3@v3.1.0`)를 준비한 뒤 아래 순서로 확인합니다. WebView2는 Windows 전용이므로 설치하지 않습니다.

```bash
git clone https://gitea.gguk.link/purnpadosori/PHGC-OFFLINE.git
cd PHGC-OFFLINE
git status -sb
git log -5 --oneline
go test ./...
cd frontend && npm install && npm run build && cd ..
wails3 dev
```

- macOS에서는 실제 학교 `data/`, 나이스 원본, 암호화 배포·취합 파일을 사용하지 않습니다.
- macOS 빌드 결과는 개발 검증용이며, Windows 배포 파일 `꼬미입시.exe` 및 정식 릴리즈를 대체하지 않습니다.
- 작업 완료 뒤 `go test ./...`, `npm run build`, `git status -sb`를 다시 확인하고 Gitea `main`에 먼저 푸시합니다.

## 사용자 운영 흐름

학년부장이 `꼬미입시.exe` 최초 실행 → 학교명·학급·입학년도·관리자 암호·공용 데이터 암호 설정 → 나이스 자료와 공개자료 입력 → 담임별 `.phgcpkg` 생성 순서로 준비합니다. 담임은 새 폴더에서 배포자료를 가져온 뒤 초기 비밀번호를 본인 비밀번호로 바꾸고 상담·비교과·지원/합격 현황을 입력합니다. 담임은 `.phgcpatch`를 학년부장에게 제출하고, 학년부장은 검토·병합 후 최신 자료를 재배포합니다.

## 안전한 개발·배포 명령

```powershell
go test ./...
Set-Location frontend
npm run build
Set-Location ..
wails3 build
git status -sb
```

정식 릴리즈 승인 후:

```powershell
.\publish.ps1 -Version "1.6.6" -Notes "한국어 릴리즈 노트"   # 윈도우에서 아직 실제 실행 검증 전
```

## 절대 금지

- `data/`, `*.db`, 나이스 원본, 학생 개인정보, 암호, 토큰을 커밋하지 않습니다.
- DPAPI를 다시 도입하지 않습니다.
- 공식자료를 자동 수집하지 않습니다.
- 중앙 커트라인 제출 자료에 학생·학급·교사 정보를 넣지 않습니다.
- `proxmox/` 같은 기존 미추적 사용자 자료를 확인 없이 삭제하거나 커밋하지 않습니다.

자세한 공통 작업 규칙은 [agents.md](../agents.md), 보안·배포 원칙은 [인수인계_현재상태.md](인수인계_현재상태.md)를 함께 확인합니다.
