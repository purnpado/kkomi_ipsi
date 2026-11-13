# 꼬미입시(PHGC) 에이전트 작업 규칙

이 파일은 다른 에이전트·개발자·컴퓨터가 저장소 작업을 이어받을 때 반드시 먼저 읽는 공통 지침입니다.

## 프로젝트 정체성

- 사용자에게 표시되는 명칭은 **꼬미입시**입니다.
- `PHGC`는 저장소명, Go 패키지, 배포자료 형식, 자동 업데이트의 기술 식별자입니다. 기존 호환성을 확인하지 않고 제거하거나 바꾸지 않습니다.
- 꼬미입시 원본 저장소는 Gitea `purnpadosori/PHGC-OFFLINE`입니다.
- GitHub `purnpado/kkomi_ipsi`(옛 이름 `purnpado/PHGC`, 옛 주소는 자동 연결됨)는 원본을 보관하는 백업 미러이자 공개 릴리즈 저장소입니다. GitHub에 `PHGC`라는 새 저장소를 만들면 옛 주소 연결이 끊기므로 만들지 않습니다.
- `proxmox`(`purnpadosori/proxmox`)는 NAS·Proxmox 관제용 별도 저장소이며 꼬미입시 소스가 아닙니다.
- 현재 안정 릴리즈는 `v1.7.0`(2026-11-13)입니다. 현재 상태·다음 작업은 `docs/handover.md`를 먼저 봅니다.

## 작업 전 필수 확인

```powershell
git status -sb
git log -5 --oneline
git remote -v
go test ./...
Set-Location frontend; npm run build; Set-Location ..
```

## 다른 컴퓨터에서 이어서 작업할 때

Gitea 원본을 복제한 뒤 다음 개발 도구를 설치해야 합니다.

- Go
- Node.js 및 npm (현재 프론트엔드는 Vite + 일반 JavaScript)
- Wails v3 CLI(`go install github.com/wailsapp/wails/v3/cmd/wails3@v3.1.0`)
- Microsoft Edge WebView2 Runtime

설치 후 프로젝트 루트에서 `go test ./...`를 실행하고, 프론트엔드 작업 시 `frontend` 폴더에서 `npm install`과 `npm run build`를 실행합니다. 실제 학생 자료와 `data/` 폴더는 원본 저장소에서 내려받지 않습니다.

현재 React는 사용하지 않으므로 별도 전역 설치가 필요하지 않습니다. 향후 React로 화면을 전환하는 작업을 시작할 때만 `frontend`에서 `npm install react react-dom`을 실행하고, 해당 전환 계획과 의존성 변경을 먼저 커밋합니다.

현재 작업 트리의 `proxmox/`는 별도 NAS·Proxmox 관제 저장소의 체크아웃이므로 꼬미입시 저장소에 추가하거나 수정하지 않습니다. 학생 DB, 나이스 원본, `data/`, 암호화 배포자료도 절대 커밋하지 않습니다.

## 기능·보안 불변 원칙

1. 학생 개인정보·성적·상담·지원/합격 기록은 학교 로컬 DB에만 저장합니다.
2. DB와 교환 파일은 사용자가 설정한 공용 데이터 암호 기반 AES-256-GCM을 사용합니다. DPAPI로 기기·Windows 계정에 종속시키지 않습니다.
3. 개인정보 자동 수집을 추가하지 않습니다. 중앙 커트라인 자료는 중학교명, 입학년도, 고교명, 학과/전체, 전형, 점수 등 최소 항목만 취급합니다.
4. 진로부장은 조회 전용이며, 담임은 본인 학급만 수정할 수 있습니다.
5. 공식 고교·교육청 자료는 운영자가 확인해 수동 등록합니다. 실제 입시 요강과 표본 학생 산출값을 대조한 뒤 계산식을 변경합니다.
6. **학과별 정밀 커트라인 집계**: 마이스터고·특성화고는 학교 전체가 아닌 학과별(지망/배정) 커트라인 및 지원 분포를 집계합니다.
7. **울산 평준화 일반고 합격선 분석**: 배정 학교와 무관하게 평준화 선발 정원 내 합격 가능 여부 및 내신 기준을 분석합니다.
8. **데이터 보존 및 호환성 보장**: DB 마이그레이션 및 프로그램 업데이트 시 기존 학교 및 학생 입력 데이터는 100% 보존·자동 역산되어야 하며, 재입력을 요구하지 않습니다.
9. **프론트엔드 현대화 및 이벤트 기반 아키텍처**: 비대한 `main.js`는 기능별 ES Modules(`core/`, `modals/`, `views/`, `print/`)로 분리하고, 호출되지 않는 레거시(Dead Code)는 정리합니다. 모듈 간 결합도를 최소화하기 위해 **이벤트 기반 아키텍처(Event-Driven Pub/Sub)**와 함수형 호출의 하이브리드 패턴을 적용하며, 신규 UI는 SVG/Canvas 벡터 시각화를 적용합니다.

## 주요 파일 위치

- `입시결과_분석_설계서.md`: 고입 결과 분석 및 프로그램 현대화의 현재 구현 상태·실행 계획 기준
- `internal/calc/`: 일반고(`general.go`)·마이스터고(`meister.go`)·특성화고(`vocational.go`) 전형 산출식, 학생 전체 산출(`fulldata.go`, `school.go`), 학과별 통계(`stats.go`)
- `internal/database/`, `internal/crypto/`: 로컬 DB 저장소 계층(`*_repo.go`, `manager.go`, `schema.go`)과 AES-GCM 저장 계층
- `internal/exchange/`: 배포자료·취합자료·인수인계 파일(`handover.go`, 개인정보 없는 입시 자료 누적·이전 버전 최종 보관본에서 입시 자료만 꺼내기)·비밀번호 재설정·관내 공유 파일(여러 학년도) 입출력
- `internal/parser/`, `internal/model/`: 나이스 엑셀 파서와 공용 데이터 구조
- Wails v3 빌드: `Taskfile.yml`, `build/Taskfile.yml`, `build/{windows,darwin}/Taskfile.yml`, 제품 정보 `build/config.yml`. 프론트 바인딩은 `wails3 generate bindings`가 만드는 `frontend/bindings/`(커밋 대상, `wails3 build` 때 자동 갱신)이며 `core/wailsBridge.js`가 이를 `window.go.main.App.*`로 연결합니다.
- `app.go`, `app_*.go`: Wails 바인딩 시그니처를 유지하는 얇은 위임 계층(권한 확인·파일 대화상자). 공개 메서드명과 JSON 필드는 바꾸지 않습니다.
- 모든 `.go`·`.js`·`.css` 파일은 **500줄 이하**를 유지합니다. 줄바꿈 제거 같은 편법 없이 책임 단위로 파일을 나눕니다. 단, `wails3 generate bindings`가 자동 생성하는 `frontend/bindings/` 아래 파일(직접 수정 금지)은 예외입니다.
- `frontend/src/main.js`: 앱 부트스트랩과 최상위 이벤트 라우팅(화면·모달 라우팅 표)만 담당
- `frontend/src/core/admissionYear.js`: 고입 학년도 계산·표시의 단일 기준. 저장값은 고교 입학 학년도(예: 2027) 하나이고, 화면에는 "2027 고입 (현 중3 · 2026학년도)" / "2026 고입 결과"처럼 표시합니다. 학년도는 3월에 시작하므로 1~2월도 직전 학년도로 계산합니다. 연도 표기·기본값은 반드시 이 함수를 씁니다.
- `frontend/src/core/`: `eventBus.js`(이벤트 버스), `navigation.js`(navigate·openModal·변경 알림 발행 함수), `store.js`(중앙 상태 저장소), `wailsBridge.js`(Wails v3에서 `window.go.main.App.*` 호환), `dialogs.js`, `screenLock.js`, `updater.js`
- `frontend/src/views/auth/`, `views/admin/`(대시보드·계정·취합 병합·`cutoff/` 커트라인), `views/teacher/`(학급 명렬표·`studentList/`·`counsel/` 1:1 상담·`simulation/` 합격 예측): 메뉴별 화면
- `frontend/src/modals/`(`summary/`, `application/`, `analysis/`, `matrix/`), `frontend/src/styles/`(`app.css`가 `@import`): 모달과 스타일
- 화면·모달 모듈끼리는 서로 직접 import 하지 않고 `core/navigation.js`의 발행 함수로 요청합니다. 새 화면·모달은 `main.js`의 라우팅 표에 등록합니다.
- `server-data/highschools.json`: 고교·학과 마스터 목록과 학년도별 요강 모집정원(`quotas`, 운영자가 요강을 확인해 수동 등록). 실행 파일에 포함되며(`main.go` embed) `go test`가 학과 정원 합과 합계를 대조한다.
- `server-data/version.json`, `internal/sync/manager.go`: 버전 확인과 릴리즈 안내
- `docs/admission-score-audit-plan.md`: 학교별 공식 산출식 검증 기준
- `docs/인수인계_현재상태.md`, `docs/handover.md`: 현재 상태와 다음 작업

## 학년도 전환(학교 운영)

1. 학년 말: 입시 결과 확정 → [📦 인수인계 파일] 만들기(학생 개인정보 없음, 지난 해들 누적) → 관내 공유 파일 교환(우리 학교 전 학년도).
2. 새 학년도: 새 폴더에 새 버전 설치 → 초기 설정(학급 수·새 학년부장·새 공용 암호) → [📥 지난 학년도 입시 자료 가져오기].
3. 최종 보관본(학생 개인정보 포함 전체 백업)은 개인정보 보관 문제로 없앴다. 이전 버전 보관본은 가져오기에서 입시 자료만 익명으로 꺼낸다.
4. 지난 입시 결과(익명)는 config.db `admission_history`에 쌓이고, 결과 확정 때 그해 기록이 보관된다(확정 해제 시 삭제).
5. 점검: `go run ./tools/simulate` (여러 학교·여러 해 가상 입시 시뮬레이션, 보고서 `test-data/시뮬레이션/보고서.md`).

## 내년도 입시 갱신 순서

1. 교육청·각 고교의 당해 연도 입학전형요강을 확보합니다. 자동 수집하지 않습니다.
2. `docs/admission-score-audit-plan.md`에 학교별 배점·반영 학기·마감일·1차 비교 기준을 기록합니다.
3. `internal/calc/`(`meister.go`, `vocational.go`, `school.go`)와 관련 산출 테스트에 변경을 반영하고 공식 엑셀/표본 학생과 대조합니다.
4. `server-data/highschools.json`의 학교·학과 변경과 새 학년도 모집정원(`quotas`)을 반영하고, `internal/calc/rules.go`의 `RuleYear`를 새 요강 학년도로 올립니다. 내장 기본 목록(`internal/sync/manager.go`)도 함께 확인합니다.
5. 공개 커트라인은 공식·교육청 자료와 학교 자료를 구분해 갱신합니다. 평균은 실제 확정 결과가 쌓일 때 자동 계산합니다.
6. `frontend/src/views/`·`frontend/src/modals/`의 입학년도·마감일·전형 표시를 확인합니다. 3학년 1학기 예상값과 마감 후 확정값을 혼동하지 않습니다.
7. `go test ./...`, `npm run build`, `wails3 build`(윈도우: `bin/꼬미입시.exe`)를 실행합니다.

## 명칭·실행 파일 변경 시

v1.6.4부터 실행 파일은 **`꼬미입시.exe`**입니다(참여 학교가 자동 업데이트가 없는 초기 버전으로 시험 중이어서 이름 전환에 따른 업데이트 호환 문제가 없음을 확인하고 결정). 저장소명·Go 모듈·교환 파일 형식 식별자(`PHGC`)는 그대로 둡니다.

- 이름 두 가지: `Taskfile.yml`의 `PRODUCT_FILENAME`("꼬미입시")은 사용자에게 보이는 이름(`bin/꼬미입시.exe`, `bin/꼬미입시.app`), `APP_NAME`("kkomi-ipsi")은 기술용 영문 이름(맥 앱 내부 실행 파일, GitHub 릴리즈 파일 이름)입니다. 맥 `codesign`은 앱 내부 실행 파일 이름이 한글이면 비정상 종료하고, GitHub는 릴리즈 파일 이름의 한글을 바꿔 버리기 때문입니다.
- 릴리즈 파일: zip `kkomi-ipsi_v<버전>.zip`(안에 `꼬미입시.exe`), 단독 실행 파일은 GitHub `kkomi-ipsi.exe`, Gitea `꼬미입시.exe`.
- 자동 업데이트(`internal/sync/manager.go`의 `PickDownloadAsset`)는 `꼬미입시.exe` → `kkomi-ipsi.exe` → 예전 `PHGC.exe` 순으로 고릅니다. `server-data/version.json`의 다운로드 주소는 GitHub `kkomi-ipsi.exe`입니다.
- 이름을 다시 바꿀 때는 `Taskfile.yml`, `publish.ps1`, `internal/sync/manager.go`, `server-data/version.json`, 문서를 함께 바꾸고 `wails3 task common:update:build-assets`로 빌드 자산을 다시 생성합니다.
- 제품명 "꼬미입시"는 `build/config.yml`의 `info.productName`으로 exe 속성·맥 Info.plist에 들어갑니다.

## 커밋·푸시·릴리즈

- 커밋 메시지는 한국어로 작성합니다.
- 의도한 파일만 `git add`합니다. `git add -A`는 개인 미추적 자료가 없는지 확인한 뒤에만 사용합니다.
- 일반 변경은 먼저 원본인 Gitea `main`에 푸시하고, 성공을 확인한 뒤 GitHub 백업 `main`에 푸시합니다.

```powershell
git push gitea main
git push github main
```

- 정식 릴리즈는 사용자 승인 후에만 `publish.ps1 -Version "x.y.z" -Notes "한국어 릴리즈 노트"`로 진행합니다. 이 스크립트는 버전 갱신, Wails 빌드, 커밋, 태그, 양쪽 원격 푸시, 릴리즈 에셋 업로드를 수행합니다.
- 꼬미입시 전환은 후보 빌드로 실제 학교 `data` 복제본과 교환 파일을 검증하고, 참여 학교 전체의 전환 확인 뒤에만 정식 릴리즈합니다. 전환 전에는 기존 `PHGC.exe`와 `data`를 삭제하지 않습니다.
- 릴리즈에는 소스 문서·DB·나이스 파일·`.phgcpkg`·`.phgcpatch`·`.phgcreset`을 넣지 않습니다.
