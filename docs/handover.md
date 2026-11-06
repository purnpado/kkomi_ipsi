# 꼬미입시(PHGC) 작업 인수인계

최종 갱신 기준: 2026-11-06

## 한눈에 보는 현재 상태

- 서비스명: **꼬미입시**
- 기존 기술명: `PHGC`
- 최신 안정 릴리즈: `v1.6.2`
- 최신 소스 커밋: `e72b8be 분석: 원서 스냅샷 출처와 학년도 분리 보강`
- 원본 Gitea: `https://gitea.gguk.link/purnpadosori/PHGC-OFFLINE.git`
- GitHub 백업: `https://github.com/purnpado/PHGC`
- 실행 파일 정책: 현재 릴리즈·업데이트는 `PHGC.exe`를 기준으로 하나, `wails.json`은 `꼬미입시.exe`를 출력하도록 설정되어 있어 **릴리즈 전 반드시 통일해야 함**

## 최근 완료 사항

- 꼬미노트 고양이 아이덴티티를 유지한 도트풍 입시 아이콘을 `build/appicon.png`, `frontend/src/assets/images/logo-universal.png`, `build/windows/icon.ico`에 반영했습니다.
- Wails 창 제목, 로그인 화면, 사용 설명서, HTML 제목을 꼬미입시로 바꿨습니다.
- README, 빌드 안내, 기준 데이터 안내, 릴리즈 정책, 설계 문서를 갱신했습니다.
- 다른 에이전트가 이어서 작업할 수 있도록 루트 `agents.md`와 이 문서를 추가했습니다.
- `go test ./...`와 `frontend` 프로덕션 빌드는 `e72b8be` 기준으로 통과했습니다. Wails 빌드와 `publish.ps1`은 실행 파일명 충돌을 해소한 뒤 다시 검증합니다.

## macOS(MacBook) 작업 시작

macOS에서는 소스·합성 테스트·프론트엔드 작업을 이어갈 수 있습니다. Xcode Command Line Tools, Go, Node.js/npm, Wails CLI를 준비한 뒤 아래 순서로 확인합니다. WebView2는 Windows 전용이므로 설치하지 않습니다.

```bash
git clone https://gitea.gguk.link/purnpadosori/PHGC-OFFLINE.git
cd PHGC-OFFLINE
git status -sb
git log -5 --oneline
go test ./...
cd frontend && npm install && npm run build && cd ..
wails dev
```

- macOS에서는 실제 학교 `data/`, 나이스 원본, 암호화 배포·취합 파일을 사용하지 않습니다.
- macOS 빌드 결과는 개발 검증용이며, Windows 배포 파일 `PHGC.exe` 및 정식 릴리즈를 대체하지 않습니다.
- 작업 완료 뒤 `go test ./...`, `npm run build`, `git status -sb`를 다시 확인하고 Gitea `main`에 먼저 푸시합니다.

## 사용자 운영 흐름

학년부장이 `PHGC.exe` 최초 실행 → 학교명·학급·입학년도·관리자 암호·공용 데이터 암호 설정 → 나이스 자료와 공개자료 입력 → 담임별 `.phgcpkg` 생성 순서로 준비합니다. 담임은 새 폴더에서 배포자료를 가져온 뒤 초기 비밀번호를 본인 비밀번호로 바꾸고 상담·비교과·지원/합격 현황을 입력합니다. 담임은 `.phgcpatch`를 학년부장에게 제출하고, 학년부장은 검토·병합 후 최신 자료를 재배포합니다.

## 다음 작업 우선순위

### 1. 배포 실행 파일 정책 통일 (최우선)

- 2026-10-21 운영 결정: 올해는 `꼬미입시.exe` 후보 빌드와 실제 데이터 **복제본** 검증을 먼저 완료하고, 확인된 참여 학교를 모두 꼬미입시로 전환한 뒤 정식 릴리즈합니다.
- 전환 전에는 기존 `PHGC.exe`와 `data` 폴더를 삭제하지 않습니다. 같은 프로그램 폴더에 `꼬미입시.exe`를 추가해 검증하고, 정상 확인 뒤에도 기존 exe는 백업용으로만 보관합니다.
- 모든 참여 학교가 전환을 확인하기 전에는 정식 릴리즈·자동 업데이트를 진행하지 않습니다.
- 전환 완료 뒤 `wails.json`의 `outputfilename`, `publish.ps1`의 복사·업로드 대상, `sync.go` 및 `server-data/version.json`의 다운로드 URL을 꼬미입시 정책으로 한 번에 맞춥니다.

### 2. 2027학년도 입시자료 점검

- 교육청 및 각 고교의 새 전형요강을 수동 확보합니다.
- 마이스터고·특성화고·일반고의 배점, 1차 점수, 반영 학기, 비교과 마감일을 `docs/admission-score-audit-plan.md`와 산출 코드에 대조합니다.
- 학교·학과 목록은 `server-data/highschools.json`과 `sync.go` 내장 기본 목록을 함께 수정합니다.
- 공식 공개자료는 운영자 입력 전용으로 유지하고, 평균 커트라인은 확정 결과 데이터가 쌓일 때 자동 계산합니다.

### 3. 분석·스냅샷 보완

- 과거 자료 역산 점수와 실제 원서 접수 시점 스냅샷을 화면에도 구분 표시하고, 출결·봉사 기준일을 DB 메타정보에 저장합니다.
- 분석 모달의 학교 총괄 합산을 추가합니다.
- 4단계 판정은 단일 함수와 경계값 테스트를 만든 뒤 학생별 상담 화면에 적용합니다.

### 전환 검증 체크리스트

1. 실제 학교 운영 폴더를 수정하지 않은 복제본에서 `꼬미입시.exe`를 실행한다.
2. 로그인 후 학생 수·학급 수·지원현황·상담 기록을 기존 화면과 대조한다.
3. `.phgcpkg` 가져오기, `.phgcpatch` 취합·병합, `.phgcarchive` 복원, 관내 `.phgc` 공유 파일의 내보내기·가져오기를 각각 확인한다.
4. 입학년도·고교·전형·학과별 분석 결과를 표본 원서 기록과 대조한다.
5. 각 참여 학교의 확인이 끝난 뒤에만 정식 릴리즈 승인 절차를 진행한다.

### 4. 내년도 명칭·실행 파일 전환 시점

올해 배포본은 `PHGC.exe`와 기존 기술 식별자를 유지합니다. 내년도 입시요강 갱신을 시작할 때 `꼬미입시` 공식 명칭과 `꼬미입시.exe` 전환 여부를 확정하고, 자동 업데이트·기존 배포자료 호환을 위해 한동안 `PHGC.exe`와 새 파일명을 함께 릴리즈하는 방안을 먼저 검토합니다. 관련 수정 대상은 `wails.json`, `publish.ps1`, `sync.go`, `server-data/version.json`, README류입니다.

### 5. 실제 학교 데이터 검증

- 개인정보가 없는 더미 학생 데이터로 학교별 산출값을 회귀 테스트합니다.
- 공식 산출표와 학생 1~2명의 결과를 손계산 대조합니다.
- 지원 현황에서 학교·전형 선택 시 저장된 점수 스냅샷과 학과 1~5지망 중복 방지가 정상인지 확인합니다.
- 개인 상담표·종합성적표·신호등 매트릭스·원서대장의 A4 인쇄를 확인합니다.

## 안전한 개발·배포 명령

```powershell
go test ./...
Set-Location frontend
npm run build
Set-Location ..
wails build -s -trimpath -ldflags "-s -w"
git status -sb
```

정식 릴리즈 승인 후:

```powershell
.\publish.ps1 -Version "1.6.3" -Notes "한국어 릴리즈 노트"
```

## 절대 금지

- `data/`, `*.db`, 나이스 원본, 학생 개인정보, 암호, 토큰을 커밋하지 않습니다.
- DPAPI를 다시 도입하지 않습니다.
- 공식자료를 자동 수집하지 않습니다.
- 중앙 커트라인 제출 자료에 학생·학급·교사 정보를 넣지 않습니다.
- `proxmox/` 같은 기존 미추적 사용자 자료를 확인 없이 삭제하거나 커밋하지 않습니다.

자세한 공통 작업 규칙은 [agents.md](../agents.md), 보안·배포 원칙은 [인수인계_현재상태.md](인수인계_현재상태.md)를 함께 확인합니다.
