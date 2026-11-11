# 꼬미입시 빌드 및 패키징 (Wails v3)

`build`는 **꼬미입시(PHGC)**의 Wails v3 빌드 작업과 아이콘·제품 정보를 관리하는 폴더입니다. 실행 파일명 `PHGC.exe`는 기존 자동 업데이트·배포자료 호환성을 위해 유지합니다(`Taskfile.yml`의 `APP_NAME`).

## 구성

- `config.yml`: 제품 정보(회사·제품명 "꼬미입시"·설명·버전). 바꾼 뒤 `wails3 task common:update:build-assets`로 아래 자산을 다시 생성합니다.
- `Taskfile.yml`, `windows/Taskfile.yml`, `darwin/Taskfile.yml`: 공통·윈도우·맥 빌드 작업(바인딩 생성 → 프론트엔드 빌드 → 아이콘·리소스 → go build)
- `appicon.png`: 꼬미노트 고양이 아이덴티티를 이어받은 앱 기본 아이콘(빌드 때 `windows/icon.ico`, `darwin/icons.icns` 자동 생성)
- `windows/info.json`, `windows/wails.exe.manifest`: 윈도우 파일 정보·실행 매니페스트(`config.yml`에서 생성)
- `windows/nsis/`: 설치 관리자(NSIS) 스크립트(현재 배포는 단독 exe 사용)
- `darwin/Info.plist`, `darwin/Info.dev.plist`: 맥 앱 정보(`config.yml`에서 생성)
- `build/ios`, `build/linux`: 빌드 자산 갱신 때 생기지만 쓰지 않으므로 저장소에서 제외합니다.

## 로컬 빌드

프로젝트 루트에서 실행합니다. 결과물은 루트의 `bin/`에 생깁니다(저장소 추적 제외).

```bash
wails3 build                          # 현재 OS (윈도우: bin/PHGC.exe, 맥: bin/PHGC)
wails3 build GOOS=windows             # 맥에서 윈도우용 교차 빌드 → bin/PHGC.exe
wails3 task darwin:package:universal  # 맥 유니버설(인텔+애플 실리콘) 앱 → bin/PHGC.app
wails3 dev                            # 개발 실행(프론트엔드 핫 리로드)
```

실행 중인 PHGC가 있으면 종료한 뒤 빌드해야 파일 교체가 안전합니다.

## 공식 릴리즈

```powershell
.\publish.ps1 -Version "1.6.3" -Notes "한국어 릴리즈 노트"
```

파이프라인은 다음을 수행합니다.

1. `server-data/version.json`, 앱 버전, `build/config.yml` 버전을 지정 버전으로 갱신하고 빌드 자산 재생성
2. `wails3 build`로 `bin/PHGC.exe` 빌드 및 버전별 ZIP 생성
3. GitHub와 Gitea에 커밋·태그·푸시
4. 두 릴리즈에 `PHGC.exe`, `phgc_v버전.zip` 업로드

학교별 `data` 폴더, 나이스 엑셀, DB, 암호화 배포·취합 파일은 릴리즈 산출물에 포함하지 않습니다.
