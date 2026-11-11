# 앱 자동 검증 도구 (macOS 개발용)

실제 맥 앱 화면을 자동으로 조작해 주요 흐름을 점검합니다. 가상 자료만 쓰며 실제 학교 `data`에는 손대지 않습니다.
**검증용 빌드에만 `autopilot.js`가 들어가며 배포 빌드(`wails3 build`)에는 들어가지 않습니다.**

```bash
zsh tools/autopilot/buildverify.sh            # 검증용 앱(test-data/autopilot/bin/kkomi-verify)과 가상 학생 적재 도구 빌드
zsh tools/autopilot/run.sh A1 school-A        # 시나리오 A1을 새 폴더 school-A에서 실행
zsh tools/autopilot/run.sh A2 school-A        # 같은 폴더에서 이어서 A2
```

- 작업 폴더: `test-data/autopilot/`(git 제외). `KKOMI_VERIFY_DIR`로 바꿀 수 있습니다.
- 결과: 실행 폴더의 `data/official_admission_data.json` 안 `__autopilot.log`와 화면 출력.
- 시나리오(일부는 앞 시나리오 결과가 필요):
  - `A1` 초기 설정·계정·원서·상담·결과 확정/해제·커트라인·배포자료·인수인계 파일·관내 공유 → `A2` 재로그인·취합 병합·관내 취합·분석·원서대장
  - `B` 담임 배포자료 흐름, `C` 새 학년도 새 폴더(8학급)에서 인수인계 파일 가져오기(A1 결과 필요)
  - `J` 판정 기준 설정·학급 전체 표·상담 화면, `T` 가상 학생 255명(`tools/testdata`) 올리기와 v2(3-2) 다시 올리기
  - `Y`, `L1`, `L2`, `LM`, `LB`, `LR1`, `LR2`: 고입 연도·구버전 자료 전환 점검(구버전 자료 폴더가 필요)
- 한글이 많은 출력은 `cut -c`(바이트 단위)로 자르면 깨지므로 그대로 보거나 Python으로 줄입니다.
