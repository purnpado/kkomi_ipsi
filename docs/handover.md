# 꼬미입시(PHGC) 작업 인수인계

최종 갱신 기준: 2026-11-12

## 한눈에 보는 현재 상태

- 서비스명: **꼬미입시** / 기술명 `PHGC`(저장소·Go 모듈·교환 파일 형식)
- 최신 안정 릴리즈: `v1.6.5` (2026-11-11, GitHub·Gitea 게시)
- `main`에는 v1.6.5 이후 **미배포 변경**이 있음(다음 릴리즈 후보 v1.6.6, 아래 목록). 산출식이 바뀌므로 윈도우에서 실제 학교 `data` **복제본**으로 확인한 뒤 릴리즈한다.
- 원본 Gitea: `https://gitea.gguk.link/purnpadosori/PHGC-OFFLINE.git` (git remote `origin`)
- GitHub 백업·공개 릴리즈: `https://github.com/purnpado/kkomi_ipsi` (git remote 없음 → `git push https://github.com/purnpado/kkomi_ipsi.git main`)
- 실행 파일: `꼬미입시.exe`(PRODUCT_FILENAME), 기술용 영문 이름 `kkomi-ipsi`(APP_NAME, 맥 앱 내부·GitHub 릴리즈 파일)
- 릴리즈 절차(v1.6.5에서 맥으로 수행): `build/config.yml`·`build/windows/info.json`·`wails.exe.manifest`·`build/darwin/Info*.plist`·`internal/sync/manager.go`(AppVersion)·`server-data/version.json` 버전/노트 갱신 → `wails3 build GOOS=windows` → zip(`kkomi-ipsi_v<버전>.zip`, 안에 `꼬미입시.exe`) → 커밋·태그 → Gitea 먼저 푸시 → GitHub 푸시 → GitHub 릴리즈(`kkomi-ipsi.exe`, zip) → Gitea 릴리즈 API(`꼬미입시.exe`, zip). 사용자 승인 후에만.

## v1.6.5 이후 미배포 변경 (main)

- 후기 일반고: 출석·봉사 학년별 계산(나이스 파일에 `학년` 칸이 있으면 학년별로 읽음), 학년 결손(전입·중도 입국) 요강 공식(40/60·100%), 미재학 학년 봉사 환산, 동점자는 학기 평균 성취도로 비교, 총점 범위(가산점 미정분)·기본 지표
- 4단계 판정 통일(`frontend/src/core/admissionJudgment.js`): 여유폭 비율·점수 두 방식, 학년부장 설정(`school_config.judgment_settings`), 상담 화면 보기 전환
- 1차·2차 전형 결과 구분, 학교별 1차 선발 배수(`internal/calc/stages.go`), 관내 공유에 1·2차 구분·후기고 항목별 확정 총점, 후기고 관내 합격선 추정(정원·지원자 수 입력)
- 원서대장 누적 기입, 특성화고 취업희망자 1지망 제한, 별도 전형 학교(자사고·외고·예술고 등) 점수 미기록
- 학급 수 변경(`UpdateClassCount`), 학교 설정보다 큰 반 자료는 올리기 전에 막음, "새 학년 시작"이 옛 학급 자료를 `data/backup_new_year/`로 옮김(되살아나던 문제 수정)
- **인수인계 파일**(`.kkomihandover`, 개인정보 없음·누적) / **지난 학년도 입시 자료 가져오기**(이전 버전 `.kkomiarchive`도 입시 자료만 익명으로 꺼냄). 학생 개인정보가 담긴 **최종 보관본 만들기·복원은 제거**
- 결과 확정 때 그해 원서 결과를 이름·학번 없이 `config.db`의 `admission_history`에 보관(분석·관내 공유가 해마다 이어짐), 관내 공유 파일에 우리 학교 전 학년도 결과 포함
- 속도: 성적 올리기·관내 공유 파일 만들기 개선, 권한 확인 보강(가산점 저장·새 학년 시작·학급 수 변경)

## 학년도 전환(학교 운영 방식, 사용자 결정 2026-11-12)

1. 학년 말: 입시 결과 확정 → [📦 인수인계 파일] → 관내 공유 파일 교환
2. 새 학년도: 새 폴더에 새 버전 설치 → 초기 설정(학급 수·새 학년부장·새 공용 암호) → [📥 지난 학년도 입시 자료 가져오기]
3. 원서대장은 출력해 보관하므로 개인정보가 담긴 전체 백업은 두지 않는다.

## 점검 도구

- 가상 학생 자료: `python3 -I tools/testdata/gen_students.py` → `test-data/가상학생/`(10개 반 255명, v1·v2), 점검 `go run ./tools/testdata/verify <폴더> <유형목록>`
- 여러 학교·여러 해 입시 시뮬레이터: `go run ./tools/simulate -years 5`(약 25분) → `test-data/시뮬레이션/보고서.md`. 2026-11-12 결과는 `docs/simulation-report-2026-11-12.md`
- 앱 자동 검증(맥): `tools/autopilot/README.md`

## 다음 작업 (추천 순서, 사용자와 합의한 목록)

1. ~~산출 규칙 안내 글 바로잡기~~ **완료(2026-11-12)**: 학교별 산출 상세 창의 안내 문구를 `internal/calc/guide.go`(`DescribeRule`)가 산출 규칙·선발 방식에서 만들어 `GetSchoolRuleList`로 내려준다. 화면(`schoolScoreDetail.js`)에는 규칙을 적지 않는다.
2. ~~불합격 사례가 없을 때의 판정~~ **완료(2026-11-12)**: 불합격 사례 없는 합격 최저점 아래는 "❔ 판단 근거 부족"(`core/admissionJudgment.js`, 근거 `GetAdmissionEvidence`). 미달·경쟁률은 커트라인 관리 [📊 공식 경쟁률] 입력값으로만 표시(`competition_records`, 인수인계 파일 포함). 시뮬레이션: 전기 도전 합격률 52% → 43%(`docs/simulation-report-2026-11-12.md` 끝).
3. ~~가정해 보기~~ **완료(2026-11-12)**: 상담 화면 [🔮 가정해 보기]. 남은 학기(성적 없는 3-1·3-2) 성취도 ±2단계·앞으로의 결석·추가 봉사·리더십·후기고 3학년 창체/행발 가산점을 넣으면 학교별 점수와 판정 변화를 보여 준다(저장 안 함). `internal/calc/whatif.go`(학생 원자료 사본에 가정값 적용), `internal/database/whatif_service.go`(후기고 석차 재계산).
   - 후기고 석차: 학년부장 PC는 전교생 자료로 정확히 다시 계산한다. 담임 PC는 배포자료에 자기 반 자료·자기 반 전교 석차 기록만 있어(개인정보 보호) 우리 반 학생들의 (교과 합산 점수, 전교 석차) 기록을 이어 새 석차를 **추정**하고 화면에 그렇게 표시한다. 정확히 하려면 배포자료에 이름 없는 전교생 교과 합산 점수 목록을 넣는 방법이 있으나 사용자 결정 전(같은 학교 안에서는 점수만으로도 누구인지 짐작될 수 있음).
   - 후기고는 전교생 모두 3-2가 있을 때만 실제 3-2를 쓰므로, 가정해 보기에서는 다른 학생의 3-2를 지금 예상치(3-1 복사)로 채워 비교한다.
4. **여러 해 추세 그래프와 시뮬레이션 자료 열람**: 입시 분석 연도 선택을 "최근 3년 고정"에서 자료가 있는 모든 학년도로, 학교·학과별 학년도 추세(관내·우리 학교·1차 합격선, 지원·합격 인원) SVG 그래프, 산출식이 바뀐 해 표시·만점 대비 %. 시뮬레이터가 앱에서 로그인 가능한 data 폴더(시험용 계정·암호화)를 만들게 한다.
5. **학과 지망 전략**: 지난 해 학과별 지망·배정 기록으로 지망 순서별 배정 가능성.
6. 그 뒤: v1.6.6 후보 빌드 → 윈도우 실제 data 복제본 검증 → 릴리즈(사용자 승인).

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
