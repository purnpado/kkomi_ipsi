#!/bin/zsh
# 사용법: run.sh <시나리오> <폴더이름>  (앱은 한 번에 하나만 실행)
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
S="${KKOMI_VERIFY_DIR:-$REPO/test-data/autopilot}"
SC=$1; DIR=$S/runs/$2
mkdir -p $DIR/data
[ -n "$3" ] && [ ! -e $DIR/data/config.db.phgc ] && [ ! -e $DIR/data/config.db.kkomi ] && cp -R $3/. $DIR/data/
cp $S/bin/kkomi-verify $DIR/kkomi-verify
J=$DIR/data/official_admission_data.json
mkdir -p $S/files
KKOMI_VERIFY_FILES=$S/files KKOMI_REPO=$REPO python3 - "$J" "$SC" <<'PY'
import json,sys,os
p,sc=sys.argv[1],sys.argv[2]
items=[]
if os.path.exists(p):
    items=[i for i in json.load(open(p)).get('items',[]) if '__autopilot' not in i]
F=os.environ['KKOMI_VERIFY_FILES']
cfg={'scenario':sc,'repoDir':os.environ['KKOMI_REPO'],'adminPw':'verify-admin-1','sharedPw':'verify-shared-1','archivePw':'archive-pw-1','sharePw':'share-pw-1',
     'pkgPath':F+'/teacher1.kkomipkg','viewerPkgPath':F+'/viewer.kkomipkg','archivePath':F+'/final.kkomiarchive',
     'sharePath':F+'/share.kkomi','legacyPkgPath':F+'/legacy301.phgcpkg','patchPath':F+'/patch1.kkomipatch','resetPath':F+'/reset2.kkomireset','quitWhenDone':True}
st=F+'/state.json'
if os.path.exists(st): cfg.update(json.load(open(st)))
items.append({'__autopilot':cfg})
json.dump({'items':items},open(p,'w'),ensure_ascii=False)
PY
(cd $DIR && ./kkomi-verify > run.log 2>&1 &)
sleep 2
PID=$(pgrep -f "^./kkomi-verify" | head -1)
echo "pid=$PID"
SEEDED=0
for i in $(seq 1 150); do
  sleep 2
  if [ $SEEDED = 0 ] && grep -q WAIT_SEED $J 2>/dev/null; then $S/bin/seed $DIR/data; SEEDED=1; fi
  grep -q '"DONE' $J 2>/dev/null && break
done
KKOMI_VERIFY_FILES=$S/files python3 - "$J" <<'PY'
import json,sys
a=[i for i in json.load(open(sys.argv[1]))['items'] if '__autopilot' in i][0]['__autopilot']
print('\n'.join(a.get('log',[])))
for d in a.get('nativeDialogs',[]): print('  기본대화상자 -', d)
st={k:a[k] for k in ('homeroom1','viewer') if k in a}
if st: json.dump(st,open(os.environ['KKOMI_VERIFY_FILES']+'/state.json','w'),ensure_ascii=False)
PY
# 앱이 스스로 정상 종료(QuitApp)하기를 최대 20초 기다리고, 그래도 남아 있으면 종료 신호를 보낸다.
for j in $(seq 1 20); do pgrep -f "^./kkomi-verify" >/dev/null || break; sleep 1; done
if pgrep -f "^./kkomi-verify" >/dev/null; then echo "※ 앱이 스스로 종료되지 않아 종료 신호를 보냄"; kill $PID 2>/dev/null; sleep 4; else echo "앱 정상 종료(QuitApp) 확인"; fi
echo "남은 프로세스: $(pgrep -f '^./kkomi-verify' | wc -l | tr -d ' ')  종료후 data: $(ls $DIR/data | tr '\n' ' ')"
