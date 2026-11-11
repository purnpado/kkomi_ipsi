# 꼬미입시 프론트엔드

꼬미입시(PHGC)의 Wails v3 데스크톱 화면입니다. Vite와 일반 JavaScript(ES Modules), Tailwind CSS v4로 만듭니다.

## 구성

- `src/main.js`: 앱 시작과 최상위 화면·모달 라우팅 표만 담당
- `src/core/`: 이벤트 버스, 상태 저장소, Wails v3 연결(`wailsBridge.js`), 고입 학년도, 4단계 판정(`admissionJudgment.js`) 등 공통 기능
- `src/views/`: 메뉴별 화면(`auth/`, `admin/`, `teacher/`)
- `src/modals/`: 원서 입력·지원현황·원서대장·분석·판정 기준 설정 등 모달
- `src/styles/`: 화면·인쇄 스타일(`app.css`가 불러옴)
- `bindings/`: `wails3 generate bindings`가 만드는 Go 백엔드 연결 파일(직접 수정하지 않음)

화면·모달 모듈끼리는 서로 직접 불러오지 않고 `core/navigation.js`의 발행 함수로 요청합니다.

## 개발

```bash
npm install
npm run build
```

전체 데스크톱 빌드와 바인딩 갱신은 프로젝트 최상위에서 `wails3 build`로 합니다.
