# 꼬미입시(PHGC) 에이전트 작업 규칙

이 파일은 다른 에이전트·개발자·컴퓨터가 저장소 작업을 이어받을 때 반드시 먼저 읽는 공통 지침입니다.

## 프로젝트 정체성

- 사용자에게 표시되는 명칭은 **꼬미입시**입니다.
- `PHGC`는 저장소명, Go 패키지, 배포자료 형식, 자동 업데이트의 기술 식별자입니다. 기존 호환성을 확인하지 않고 제거하거나 바꾸지 않습니다.
- 꼬미입시 원본 저장소는 Gitea `purnpadosori/PHGC-OFFLINE`입니다.
- GitHub `purnpado/PHGC`는 원본을 보관하는 백업 미러입니다.
- `proxmox`(`purnpadosori/proxmox`)는 NAS·Proxmox 관제용 별도 저장소이며 꼬미입시 소스가 아닙니다.
- 현재 안정 릴리즈는 `v1.6.2`이며, 꼬미입시 브랜딩·도트 아이콘 변경은 `b39235d` 커밋에 반영되어 두 원격 저장소에 푸시되었습니다.

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
- Wails CLI
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

- `입시결과_분석_설계서.md`: 고입 결과 분석 및 프로그램 현대화 상세 설계서 (확정안)
- `calc.go`, `calc_school.go`, `calc_school_*.go`: 일반고·마이스터고·특성화고 전형 산출식
- `db.go`, `crypto_store.go`, `db_encryption_*.go`: 로컬 DB와 AES-GCM 저장 계층
- `app.go`: 파일 대화상자, 배포자료·취합자료·보관본·지원현황 API
- `frontend/src/main.js`, `frontend/src/app.css`: 화면·상담·지원현황·인쇄 UI
- `server-data/highschools.json`: 고교·학과 마스터 목록
- `server-data/version.json`, `sync.go`: 버전 확인과 릴리즈 안내
- `docs/admission-score-audit-plan.md`: 학교별 공식 산출식 검증 기준
- `docs/인수인계_현재상태.md`, `docs/handover.md`: 현재 상태와 다음 작업

## 내년도 입시 갱신 순서

1. 교육청·각 고교의 당해 연도 입학전형요강을 확보합니다. 자동 수집하지 않습니다.
2. `docs/admission-score-audit-plan.md`에 학교별 배점·반영 학기·마감일·1차 비교 기준을 기록합니다.
3. `calc_school.go`와 관련 산출 테스트에 변경을 반영하고 공식 엑셀/표본 학생과 대조합니다.
4. `server-data/highschools.json`의 학교·학과 변경을 반영합니다. 내장 기본 목록(`sync.go`)도 함께 확인합니다.
5. 공개 커트라인은 공식·교육청 자료와 학교 자료를 구분해 갱신합니다. 평균은 실제 확정 결과가 쌓일 때 자동 계산합니다.
6. `frontend/src/main.js`의 입학년도·마감일·전형 표시를 확인합니다. 3학년 1학기 예상값과 마감 후 확정값을 혼동하지 않습니다.
7. `go test ./...`, `npm run build`, `wails build -s -trimpath -ldflags "-s -w"`를 실행합니다.

## 명칭·실행 파일 변경 시

올해 배포본은 기존 호환성을 위해 실행 파일·릴리즈 에셋을 `PHGC.exe`로 유지합니다. 내년도 입시요강을 반영하는 정기 갱신 때 화면 공식 명칭과 실행 파일을 `꼬미입시`/`꼬미입시.exe`로 전환할지 최종 확정합니다. 전환 전까지는 현재 기술 식별자 `PHGC`를 함부로 바꾸지 않습니다.

실제 파일명을 `꼬미입시.exe`로 바꾸기로 확정하면 다음을 한 번에 검토해야 합니다.

- `wails.json`의 `outputfilename`
- `publish.ps1`의 빌드·복사·GitHub/Gitea 에셋명
- `server-data/version.json`과 `sync.go` 자동 업데이트 주소
- README·인수인계 문서·학교 배포 안내
- 기존 `PHGC.exe` 사용자에 대한 과도기 호환 에셋

## 커밋·푸시·릴리즈

- 커밋 메시지는 한국어로 작성합니다.
- 의도한 파일만 `git add`합니다. `git add -A`는 개인 미추적 자료가 없는지 확인한 뒤에만 사용합니다.
- 일반 변경은 먼저 원본인 Gitea `main`에 푸시하고, 성공을 확인한 뒤 GitHub 백업 `main`에 푸시합니다.

```powershell
git push gitea main
git push github main
```

- 정식 릴리즈는 사용자 승인 후에만 `publish.ps1 -Version "x.y.z" -Notes "한국어 릴리즈 노트"`로 진행합니다. 이 스크립트는 버전 갱신, Wails 빌드, 커밋, 태그, 양쪽 원격 푸시, 릴리즈 에셋 업로드를 수행합니다.
- 릴리즈에는 소스 문서·DB·나이스 파일·`.phgcpkg`·`.phgcpatch`·`.phgcreset`을 넣지 않습니다.
