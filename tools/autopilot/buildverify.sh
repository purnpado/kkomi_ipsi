#!/bin/zsh
export PATH=$HOME/homebrew/bin:$HOME/go/bin:/opt/homebrew/bin:$PATH
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
S="${KKOMI_VERIFY_DIR:-$REPO/test-data/autopilot}"
mkdir -p $S/bin
cd $REPO
(cd frontend && npm run build 2>&1 | grep -i "error\|built")
cp $REPO/tools/autopilot/autopilot.js frontend/dist/autopilot.js
python3 -c "p='frontend/dist/index.html'; s=open(p).read(); s=s.replace('</body>','<script src=\"/autopilot.js\" defer></script>\n</body>'); open(p,'w').write(s)"
CGO_CFLAGS=-mmacosx-version-min=10.15 CGO_LDFLAGS=-mmacosx-version-min=10.15 go build -tags production -trimpath -ldflags "-s -w" -o $S/bin/kkomi-verify . 2>&1 | grep -v "^ld: warn\|^#"
(cd frontend && npm run build 2>&1 | grep -i "error\|built")
ls frontend/dist | tr '\n' ' '; echo
(cd $REPO/tools/autopilot/seedtool && go build -o $S/bin/seed .) 2>&1 | grep -v "^ld: warn"
