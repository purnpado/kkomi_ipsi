#!/bin/zsh
# 꼬미입시 화면 자동 캡처 (개발용). 가상 시뮬레이션 자료만 쓰며 실제 학교 data 에는 손대지 않는다.
# 사용법: zsh tools/capture/run.sh [학교폴더=가람중학교] [시나리오=all]
#   시나리오: all | master | homeroom | viewer
# 결과: test-data/capture/latest/*.png (git 제외)
set -e
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
SCHOOL="${1:-가람중학교}"
SCENARIO="${2:-all}"
SRC="$REPO/test-data/시뮬레이션/열람용/$SCHOOL/data"
WORK="$REPO/test-data/capture"
PORT="${KKOMI_CAPTURE_PORT:-34851}"

if [ ! -d "$SRC" ]; then
  echo "가상 자료가 없습니다: $SRC"
  echo "먼저 go run ./tools/simulate 로 열람용 자료를 만드세요."
  exit 1
fi
[ -d "$REPO/tools/capture/node_modules" ] || (cd "$REPO/tools/capture" && npm install --silent)

echo "▶ 프론트엔드·서버 모드 빌드"
(cd "$REPO/frontend" && npm run build --silent >/dev/null)
mkdir -p "$WORK/server"
(cd "$REPO" && go build -tags server -o "$WORK/server/kkomi" . 2>/dev/null)

# 매번 깨끗한 가상 자료로 시작한다(비밀번호 변경 등이 쌓이지 않도록).
rm -rf "$WORK/server/data" && cp -R "$SRC" "$WORK/server/data"

# 같은 포트에서 수신 대기 중인 이전 캡처 서버만 끈다.
lsof -nP -iTCP:$PORT -sTCP:LISTEN -t 2>/dev/null | xargs kill 2>/dev/null || true
(cd "$WORK/server" && WAILS_SERVER_PORT=$PORT ./kkomi > server.log 2>&1 &)
for i in {1..30}; do
  curl -s -o /dev/null "http://localhost:$PORT/" && break
  sleep 0.5
done

OUT="$WORK/latest"
rm -rf "$OUT" && mkdir -p "$OUT"
set +e
node "$REPO/tools/capture/capture.js" --url "http://localhost:$PORT/" --out "$OUT" --scenario "$SCENARIO"
STATUS=$?
lsof -nP -iTCP:$PORT -sTCP:LISTEN -t 2>/dev/null | xargs kill 2>/dev/null || true
echo "▶ 결과 폴더: $OUT"
exit $STATUS
