// 검증 전용 자동 점검 스크립트 (배포 빌드에는 포함하지 않음)
// 설정은 data/official_admission_data.json 의 __autopilot 항목으로 받고, 결과도 같은 파일에 기록한다.
(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const pending = new Map(); let callSeq = 0; let curStep = '시작';
  const beacon = (msg) => { try { fetch('http://127.0.0.1:18990/?' + encodeURIComponent(msg), { mode: 'no-cors' }).catch(() => {}); } catch (_) {} };
  // 앱 호출을 모두 추적한다(외부 기록 서버로 응답 대기 중인 호출 목록을 1초마다 보냄).
  const rawApp = () => window.go.main.App;
  setInterval(() => { const now = Date.now(); const list = [...pending.values()].map(v => { const [n, t] = v.split('@'); return `${n}(${Math.round((now - t) / 1000)}s)`; }); beacon(`hb 단계=${curStep} 대기호출=${list.join(',') || '없음'}`); }, 1000);
  const callLog = [];
  const App = () => new Proxy({}, { get: (_t, name) => (...args) => { const t0 = performance.now(); const p = rawApp()[name](...args); const timer = setTimeout(() => callLog.push(`멈춤의심 ${name} 10초 넘게 응답 없음`), 10000); return Promise.resolve(p).finally(() => { clearTimeout(timer); const dt = Math.round(performance.now() - t0); if (dt > 3000) callLog.push(`느림 ${name} ${dt}ms`); }); } });
  const log = [];
  const errs = [];
  const nativeDialogs = [];
  window.addEventListener('error', e => errs.push('ERR ' + e.message));
  window.addEventListener('unhandledrejection', e => errs.push('REJ ' + String(e.reason).slice(0, 160)));
  const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch (_) {} await wait(150); } return null; };
  await until(() => window.go?.main?.App && window.AppStore && window.AppEventBus);
  // 화면 코드의 호출까지 포함해 모든 앱 호출을 추적한다(응답 대기 중 목록을 외부 기록 서버로 보냄).
  {
    const realApp = window.go.main.App;
    window.go.main.App = new Proxy({}, {
      has: (_t, name) => name in realApp,
      get: (_t, name) => {
        const fn = realApp[name];
        if (typeof fn !== 'function') return fn;
        return (...args) => { const id = ++callSeq; pending.set(id, `${String(name)}@${Date.now()}`); let p; try { p = fn(...args); } catch (e) { pending.delete(id); throw e; } return Promise.resolve(p).finally(() => pending.delete(id)); };
      }
    });
    beacon('추적 시작');
  }

  let cfg = {};
  try { const d = await App().GetOfficialAdmissionData(); cfg = ((d && d.items) || []).find(i => i.__autopilot)?.__autopilot || {}; } catch (_) {}
  // 기록 저장 호출에도 시간 제한을 둔다. 응답이 오지 않는 호출이 있으면 그 사실을 남기고 계속 진행한다.
  const race = (pr, ms, name) => Promise.race([pr, new Promise((_, rej) => setTimeout(() => rej(new Error(name + ' ' + ms + 'ms 응답 없음')), ms))]);
  const flush = async () => {
    try {
      const d = await race(rawApp().GetOfficialAdmissionData(), 15000, '기록읽기(GetOfficialAdmissionData)');
      const keep = ((d && d.items) || []).filter(i => !i.__autopilot);
      await race(rawApp().SaveOfficialAdmissionData([...keep, { __autopilot: { ...cfg, log: log.slice(), nativeDialogs: nativeDialogs.concat(callLog) } }]), 15000, '기록저장(SaveOfficialAdmissionData)');
    } catch (e) { callLog.push('멈춤 ' + String(e)); log.push('  ※ ' + String(e)); }
  };
  // 화면 코드의 alert 는 앱이 자체 알림창(phgcCustomAlertModal)으로 바꿔 두므로 그대로 두고 answer() 로 응답한다.
  window.confirm = (m) => { nativeDialogs.push('confirm: ' + String(m).slice(0, 120)); return true; };

  const el = id => document.getElementById(id);
  const setv = (id, v) => { const e = el(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); };
  const overlays = () => [...document.body.children].filter(e => !['app', 'globalFeedbackContainer'].includes(e.id) && String(e.className).includes('fixed') && e.innerText.length > 5);
  const closeAll = () => overlays().forEach(e => e.remove());
  const answer = async (ok = true, ms = 8000) => {
    const m = await until(() => el('phgcCustomConfirmModal') || el('phgcCustomAlertModal') || el('phgcCustomPromptModal'), ms);
    if (!m) return '';
    const text = m.innerText.replace(/\s+/g, ' ').trim(); // 확인창 문구 전체를 기록한다
    const btn = m.id === 'phgcCustomConfirmModal' ? el(ok ? 'modalConfirmOkBtn' : 'modalConfirmCancelBtn') : m.id === 'phgcCustomAlertModal' ? el('modalAlertConfirmBtn') : el(ok ? 'modalPromptOkBtn' : 'modalPromptCancelBtn');
    btn?.click();
    await until(() => !document.body.contains(m), 3000);
    return text;
  };
  const drain = async () => { let n = 0; while ((el('phgcCustomAlertModal') || el('phgcCustomConfirmModal')) && n < 5) { await answer(true, 500); n++; } return n; };
  const expectFail = async (fn) => { try { await fn(); return '실패해야 하는데 성공함'; } catch (e) { return '차단됨(' + String(e).slice(0, 60) + ')'; } };
  const step = async (name, fn, settle = 900) => {
    curStep = name; beacon('단계시작 ' + name);
    const before = errs.length; let res = '';
    const stale = await drain(); if (stale) log.push(`  (${name} 전에 남아 있던 알림 ${stale}개 닫음)`);
    try { res = await fn(); } catch (e) { res = 'THROW ' + e; }
    await wait(settle);
    beacon('단계끝 ' + name + ' → ' + String(res).slice(0, 60));
    log.push(`${name}: ${res ?? ''} | 화면=${window.AppStore.state.currentScreen || '-'} | 오류=${errs.slice(before).join(' ; ') || '없음'}`);
    await flush();
  };

  const agree = async () => { await until(() => el('agreementCheckbox')); el('agreementCheckbox').click(); await wait(200); el('acceptAgreementBtn').click(); return 'firstRun=' + !!(await until(() => el('startSchoolSetupBtn'))); };
  const login = async (username, password, shared = '') => {
    await until(() => el('loginUsername'), 20000);
    const sel = el('loginUsername');
    if (![...sel.options].some(o => o.value === username)) return '계정 없음: ' + [...sel.options].map(o => o.value).join(',');
    sel.value = username; sel.dispatchEvent(new Event('change', { bubbles: true }));
    await wait(700);
    setv('loginPassword', password);
    if (shared && el('sharedLoginPassword')) setv('sharedLoginPassword', shared);
    el('loginBtn').click();
    await until(() => window.AppStore.state.currentUser || el('pwChangeForm'), 20000);
    return 'role=' + window.AppStore.state.currentUser?.Role + (el('pwChangeForm') ? ' (비밀번호 변경 요구)' : '');
  };
  const changePassword = async (pw) => { setv('newPassword', pw); setv('newPasswordConfirm', pw); el('pwChangeBtn').click(); await until(() => el('teacherContent') || el('cutoffBtn'), 20000); return 'mustChange=' + window.AppStore.state.currentUser?.MustChangePassword + ' 화면=' + window.AppStore.state.currentScreen; };
  const logout = async () => { el('backBtn').click(); await until(() => el('loginBtn'), 20000); return 'user=' + window.AppStore.state.currentUser + ' loginForm=' + !!el('loginBtn') + ' 계정목록=' + [...(el('loginUsername')?.options || [])].map(o => o.value).join(','); };
  const openClass = async (n) => { const card = [...document.querySelectorAll('.class-card-btn')].find(b => b.dataset.class === String(n)) || document.querySelector('.class-card-btn'); card.click(); await until(() => document.querySelector('.btn-student-application'), 20000); return document.querySelectorAll('#teacherContent tr').length; };
  const saveApplicationViaUI = async (studentIdx, status) => {
    document.querySelectorAll('.btn-student-application')[studentIdx].click();
    await until(() => el('appSchool'), 20000);
    const year = el('appYear')?.value;
    const s = el('appSchool'); s.value = s.options[1].value; s.dispatchEvent(new Event('change', { bubbles: true }));
    await wait(1500);
    if (status) { el('appStatus').value = status; el('appStatus').dispatchEvent(new Event('change', { bubbles: true })); await wait(400); }
    const prefSel = [...(el('appPreferenceArea')?.querySelectorAll('select') || [])].find(x => x.id !== 'appAssigned');
    if (prefSel && prefSel.options.length > 1) { prefSel.value = prefSel.options[1].value; prefSel.dispatchEvent(new Event('change', { bubbles: true })); await wait(300); }
    const asg = el('appAssigned');
    if (asg && prefSel) { asg.value = prefSel.value; asg.dispatchEvent(new Event('change', { bubbles: true })); }
    const score = el('appScore').value;
    el('saveApplication').click();
    const msg = await answer(true, 4000);
    await wait(800); closeAll();
    return `원서기본연도=${year} score=${score} 알림=${msg.slice(0, 40) || '없음'}`;
  };
  const users = async () => (await App().GetUsers()) || [];
  const config = async () => await App().GetSchoolConfig();

  log.push('시나리오=' + (cfg.scenario || '없음'));
  await flush();

  if (cfg.scenario === 'A1') {
    await step('A01 서약 동의', agree);
    await step('A02 초기 설정(연도 기본값 사용)', async () => { el('startSchoolSetupBtn').click(); await until(() => el('schoolName')); setv('schoolName', '검증용중학교'); setv('classCount', '2'); log.push('  설정 기본값=' + el('admissionYear').value + ' | 안내=' + el('admissionYear').parentElement.querySelector('p')?.innerText); setv('adminPassword', cfg.adminPw); setv('adminPasswordConfirm', cfg.adminPw); setv('sharedDataPassword', cfg.sharedPw); el('saveBtn').click(); return 'loginForm=' + !!(await until(() => el('loginBtn'), 20000)); });
    await step('A03 학년부장 로그인', () => login('admin', cfg.adminPw));
    await step('A03b 고입 연도 안내 띠(없어야 함)', async () => 'notice=' + !!el('admissionYearNotice') + ' 설정연도=' + (await config()).admissionYear + ' 전환버튼=' + el('resetYearBtn')?.innerText.trim());
    await step('A04 표본 자료 대기', async () => { log.push('WAIT_SEED'); await flush(); const st = await until(async () => { const s = await App().GetClassStatus(2); return (s[1] || 0) > 0 && (s[2] || 0) > 0 ? JSON.stringify(s) : null; }, 180000); return 'classStatus=' + st; });
    await step('A05 계정 추가(화면)', async () => { el('userManagementBtn').click(); await until(() => el('addUserForm'), 20000); setv('newUserId', 'temp_viewer'); setv('newUserPw', 'temp-pw-1'); el('newUserRole').value = 'viewer'; el('newUserRole').dispatchEvent(new Event('change', { bubbles: true })); el('addUserBtn').click(); const msg = await answer(true); await wait(800); const u = await users(); return '알림=' + msg.slice(0, 30) + ' users=' + u.map(x => `${x.Username}(${x.Role}${x.ClassNum || ''})`).join(','); });
    await step('A06 계정 삭제(화면)', async () => { window.deleteUserAccount('temp_viewer'); const q = await answer(true); const a = await answer(true); await wait(800); const u = await users(); return `확인창="${q.slice(0, 30)}" 결과="${a.slice(0, 20)}" 남은계정=${u.length} temp존재=${u.some(x => x.Username === 'temp_viewer')}`; });
    await step('A07 비밀번호 재설정 파일(대화상자 제외)', async () => { const hr2 = (await users()).find(u => u.Role === 'homeroom' && u.ClassNum === 2); await App().SetUserPassword(hr2.Username, 'reset-pw-2'); await App().ExportPasswordResetPackage(hr2.Username, cfg.resetPath); return 'user=' + hr2.Username + ' 파일생성'; });
    await step('A08 계정 화면 복귀', async () => { el('backToAdminBtn').click(); return !!(await until(() => el('cutoffBtn'), 20000)); });
    await step('A09 1반 원서(합격) 저장', async () => { el('goToTeacherBtn').click(); await until(() => document.querySelector('.class-card-btn')); const rows = await openClass(1); return 'rows=' + rows + ' ' + await saveApplicationViaUI(0, '합격'); }, 1500);
    await step('A10 1반 상담 기록 저장', async () => { document.querySelector('.btn-student-counsel').click(); await until(() => el('saveCounselBtn'), 20000); el('counselContentInput').value = '학년부장 상담 기록'; el('saveCounselBtn').click(); await wait(1800); const r = el('counselRecordCount')?.innerText; el('closeModalBtn').click(); return 'records=' + r; }, 2000);
    await step('A11 학년부장 화면 복귀', async () => { el('backBtn').click(); return !!(await until(() => el('cutoffBtn'), 20000)); });
    const year = (await config()).admissionYear;
    await step('A12 입시 결과 확정(화면)', async () => { el('openAdminSchoolStatsBtn').click(); const b = await until(() => el('closeAdmissionYear'), 20000); if (!b) return '확정 버튼 없음'; log.push('  지원현황 표기=' + (el('applicationSummaryModal')?.innerText.match(/[0-9]{4} 고입[^\n]{0,26}/g) || []).slice(0, 3).join(' / ')); b.click(); const q = await answer(true); const a = await answer(true); await wait(1500); const c = await App().GetAdmissionClosure(year); closeAll(); return `확인="${q}" 결과="${a}" status=${c?.status}`; }, 1500);
    await step('A13 확정 후 수정 차단', async () => { const rec = ((await App().GetStudentApplications(1, '1', '가상학생하나')) || [])[0]; if (!rec) return '원서 없음'; return await expectFail(() => App().SaveStudentApplication({ ...rec, status: '불합격' })); });
    await step('A14 입시 확정 해제(화면)', async () => { el('openAdminSchoolStatsBtn').click(); const b = await until(() => el('reopenAdmissionYear'), 20000); if (!b) return '해제 버튼 없음'; b.click(); const q = await answer(true); const a = await answer(true); await wait(1500); const c = await App().GetAdmissionClosure(year); closeAll(); return `결과="${a.slice(0, 25)}" status=${c ? c.status : '없음'}`; }, 1500);
    await step('A15 커트라인 화면 표기·공식자료 추가', async () => { el('cutoffBtn').click(); await until(() => el('saveAllCutoffsBtn'), 20000); log.push('  커트라인 표기=' + ([...document.querySelectorAll('#app span')].find(x => x.innerText.includes('🏷️'))?.innerText || '-') + ' | 목록=' + [...(el('admissionYearSelect')?.options || [])].map(o => o.text).join(' / ')); document.querySelectorAll('.nav-tab-btn')[4].click(); await until(() => el('addPublicDataBtn')); el('addPublicDataBtn').click(); await until(() => el('modalPublicSchool')); log.push('  공식자료 연도목록=' + [...el('modalPublicYear').options].map(o => o.text).join(' / ')); const sc = el('modalPublicSchool'); sc.value = sc.options[1].value; sc.dispatchEvent(new Event('change', { bubbles: true })); await wait(500); setv('modalPublicMin', '180.5'); el('submitAddPublicModalBtn').click(); await answer(true, 4000); await wait(1500); const d = await App().GetOfficialAdmissionData(); const items = (d.items || []).filter(i => !i.__autopilot); return `공식자료=${items.length}건 연도=${items[0]?.admissionYear}`; }, 1200);
    await step('A16 커트라인 화면 복귀', async () => { el('backToAdminBtn').click(); return !!(await until(() => el('cutoffBtn'), 20000)); });
    await step('A17 배포자료 생성(1반 담임·진로부장)', async () => { const u = await users(); const hr1 = u.find(x => x.Role === 'homeroom' && x.ClassNum === 1); const vw = u.find(x => x.Role === 'viewer'); cfg.homeroom1 = hr1.Username; cfg.viewer = vw.Username; await App().ExportDistributionPackage(hr1.Username, cfg.pkgPath); await App().ExportDistributionPackage(vw.Username, cfg.viewerPkgPath); return `담임=${hr1.Username} 진로=${vw.Username}`; });
    await step('A18 인수인계 파일 생성', async () => { await App().ExportHandoverPackageTo('handover-pw-1', cfg.archivePath.replace('.kkomiarchive', '.kkomihandover')); return '생성'; });
    await step('A19 관내 공유 파일 생성·표지 확인', async () => { await App().ExportSharedAdmissionPackage(year, cfg.sharePw, cfg.sharePath); const cover = await App().InspectSharedAdmissionPackage(cfg.sharePw, cfg.sharePath); const bad = await expectFail(() => App().InspectSharedAdmissionPackage('wrong-pw', cfg.sharePath)); return `학교=${cover.schoolName} 고입=${cover.admissionYear} 레코드=${cover.recordCount} 잘못된암호=${bad.slice(0, 12)}`; });
    await step('A19b 관내 공유 화면 표기', async () => { window.AppEventBus.emit('modal:open', { modal: 'shared-admission' }); await until(() => el('sharedAdmissionModal'), 10000); await wait(1000); const t = (el('sharedAdmissionModal')?.innerText.match(/[0-9]{4} 고입[^\n]{0,30}/g) || []).slice(0, 2).join(' / '); closeAll(); return t; });
    await step('A20 로그아웃', logout);
    await step('A21 진로부장 로그인(공용 암호)', () => login(cfg.viewer, cfg.sharedPw, cfg.sharedPw));
    await step('A22 진로부장 비밀번호 변경', async () => el('pwChangeForm') ? await changePassword('viewer-pw-1') : '변경 요구 없음');
    await step('A23 진로부장 조회 전용 확인', async () => { const cards = document.querySelectorAll('.class-card-btn').length; const rows = await openClass(1); document.querySelector('.btn-student-application').click(); await until(() => el('studentApplicationModal')?.innerText.length > 50, 15000); await wait(1200); const saveBtn = !!el('saveApplication'); closeAll(); const rec = ((await App().GetStudentApplications(1, '1', '가상학생하나')) || [])[0]; const api = rec ? await expectFail(() => App().SaveStudentApplication({ ...rec, status: '불합격' })) : '원서 없음'; return `학급카드=${cards} rows=${rows} 저장버튼표시=${saveBtn} API저장=${api.slice(0, 40)}`; });
    await step('A24 로그아웃', logout);
  }

  if (cfg.scenario === 'Y') {
    await step('Y01 서약 동의', agree);
    await step('Y02 초기 설정(옛 연도 2026 직접 입력)', async () => { el('startSchoolSetupBtn').click(); await until(() => el('schoolName')); setv('schoolName', '옛설정중학교'); setv('classCount', '1'); setv('admissionYear', '2026'); setv('adminPassword', cfg.adminPw); setv('adminPasswordConfirm', cfg.adminPw); setv('sharedDataPassword', cfg.sharedPw); el('saveBtn').click(); return 'loginForm=' + !!(await until(() => el('loginBtn'), 20000)); });
    await step('Y03 로그인 후 안내 띠', async () => { await login('admin', cfg.adminPw); const n = await until(() => el('admissionYearNotice'), 8000); return 'notice=' + (n ? n.innerText.replace(/\s+/g, ' ') : '없음'); });
    await step('Y04 안내 띠 버튼 → 전환 입력창', async () => { el('admissionYearNoticeBtn').click(); const m = await until(() => el('phgcCustomPromptModal'), 5000); const v = el('modalPromptInput')?.value; const t = m?.innerText.replace(/\s+/g, ' ').slice(0, 100); el('modalPromptCancelBtn')?.click(); await wait(500); return `기본값=${v} 문구=${t}`; });
    await step('Y05 커트라인 화면 기준 연도', async () => { el('cutoffBtn').click(); await until(() => el('admissionYearSelect'), 20000); const sel = el('admissionYearSelect'); const r = 'selected=' + sel.value + ' 목록=' + [...sel.options].map(o => o.text).join(' / '); el('backToAdminBtn').click(); await until(() => el('cutoffBtn'), 20000); return r; });
    await step('Y06 로그아웃', logout);
  }

  const maybeAgree = async () => { const r = await until(() => el('agreementCheckbox') ? 'agree' : (el('loginUsername') ? 'login' : null), 20000); if (r === 'agree') { el('agreementCheckbox').click(); await wait(200); el('acceptAgreementBtn').click(); await until(() => el('loginUsername') || el('startSchoolSetupBtn'), 20000); } return '첫화면=' + r; };
  const snapshot = async () => { const st = await App().GetClassStatus(2); const recs = (await App().GetSchoolApplicationRecords()) || []; const counsel = (await App().GetStudentCounselingRecords(1, '1', '옛학생하나')) || []; const c = await config(); return `학교=${c.schoolName} 고입=${c.admissionYear} 반별학생=${JSON.stringify(st)} 원서=${recs.length}(${recs.map(r => r.admissionYear + ':' + r.status).join(',')}) 상담=${counsel.length}`; };

  if (cfg.scenario === 'L1') {
    await step('L1-01 구버전 폴더 첫 실행', maybeAgree);
    await step('L1-02 구버전 학년부장 로그인(자동 전환)', () => login('admin', 'legacy-admin-1'));
    await step('L1-03 전환 직후 자료', snapshot);
    await step('L1-04 안내 띠(2026 설정)', async () => { const n = await until(() => el('admissionYearNotice'), 8000); return n ? n.innerText.replace(/\s+/g, ' ') : '없음'; });
    await step('L1-05 고입 연도만 변경(안내 띠 버튼)', async () => { el('admissionYearNoticeBtn').click(); await until(() => el('phgcCustomPromptModal'), 5000); const v = el('modalPromptInput').value; el('modalPromptOkBtn').click(); const q = await answer(true); const a = await answer(true); await until(() => el('cutoffBtn'), 15000); await wait(1500); return `입력기본값=${v} 확인창="${q.slice(0, 140)}" 결과="${a.slice(0, 50)}" 안내띠=${!!el('admissionYearNotice')}`; }, 1500);
    await step('L1-06 변경 후 자료(학생 자료 보존 확인)', snapshot);
    await step('L1-07 대시보드 버튼 이름', async () => `변경=${el('changeAdmissionYearBtn')?.innerText.trim()} / 초기화=${el('resetYearBtn')?.innerText.trim()}`);
    await step('L1-08 로그아웃', logout);
  }

  if (cfg.scenario === 'L2') {
    await step('L2-01 전환된 폴더 재실행', maybeAgree);
    await step('L2-02 학년부장 로그인', () => login('admin', 'legacy-admin-1'));
    await step('L2-03 자료 확인', snapshot);
    await step('L2-04 로그아웃', logout);
  }

  if (cfg.scenario === 'LB') {
    await step('LB-01 서약 동의', agree);
    await step('LB-02 구버전 배포자료(.phgcpkg) 적용', async () => { const u = await App().ImportDistributionPackage(cfg.legacyPkgPath); const idx = await App().GetLoginIndex(); window.AppEventBus.emit('app:navigate', { screen: 'login', schoolName: idx }); return 'user=' + u + ' 학교=' + idx.schoolName; });
    await step('LB-03 담임 첫 로그인(공용 암호)', () => login('301', 'legacy-shared-1', 'legacy-shared-1'));
    await step('LB-04 비밀번호 변경', async () => el('pwChangeForm') ? await changePassword('teacher-pw-9') : '변경 요구 없음');
    const tmo = (pr, ms, name) => Promise.race([pr, new Promise((_, rej) => setTimeout(() => rej(new Error(name + ' 시간초과 ' + ms + 'ms')), ms))]);
    // 처음 멈췄던 형태 그대로(대기 없이 연속 호출) 재현하되, 각 호출에 시간 제한과 경과 시간을 기록한다.
    await step('LB-05 학급 자료(원래 형태 재현)', async () => {
      const t0 = performance.now(); const tick = () => Math.round(performance.now() - t0) + 'ms';
      const out = [];
      await until(() => document.querySelector('.btn-student-application'), 20000); out.push('표시 ' + tick());
      const rows = document.querySelectorAll('#teacherContent tr').length;
      try { const recs = (await tmo(App().GetSchoolApplicationRecords(), 15000, '원서조회')) || []; out.push(`원서=${recs.length} ${tick()}`); } catch (e) { out.push(String(e)); }
      try { await tmo(App().UpdateAdmissionYear(2027), 15000, '연도변경'); out.push('연도변경 성공(문제)'); } catch (e) { out.push('연도변경→' + String(e).slice(0, 40) + ' ' + tick()); }
      return `rows=${rows} ` + out.join(' | ');
    });
    await step('LB-06 로그아웃', logout);
  }

  if (cfg.scenario === 'LM') {
    await step('LM-01 학년부장 폴더 실행(잠긴 상태)', maybeAgree);
    await step('LM-02 로그인 전 담임 배포자료 가져오기 시도', async () => expectFail(() => App().ImportDistributionPackage(cfg.legacyPkgPath)));
    await step('LM-03 학년부장 로그인·자료 보존 확인', async () => { const r = await login('admin', 'legacy-admin-1'); return r + ' / ' + await snapshot(); });
    await step('LM-04 로그아웃', logout);
  }

  if (cfg.scenario === 'LR1') {
    await step('LR1-01 담임 폴더 실행', maybeAgree);
    await step('LR1-02 담임 로그인', () => login('301', 'teacher-pw-9'));
    await step('LR1-03 담임 상담 기록 작성(화면)', async () => { await until(() => document.querySelector('.btn-student-counsel'), 20000); document.querySelector('.btn-student-counsel').click(); await until(() => el('saveCounselBtn'), 20000); el('counselContentInput').value = '재배포 전 담임 상담 기록'; el('saveCounselBtn').click(); await wait(1800); const r = el('counselRecordCount')?.innerText; el('closeModalBtn').click(); return 'records=' + r; }, 2000);
    await step('LR1-04 로그아웃', logout);
  }

  if (cfg.scenario === 'LR2') {
    await step('LR2-01 잠긴 담임 폴더 실행', maybeAgree);
    await step('LR2-02 가져오기 버튼 → 암호 창', async () => { el('distributionPackageImportBtn').click(); const m = await until(() => el('phgcCustomPromptModal'), 8000); const t = m ? m.innerText.replace(/\s+/g, ' ').slice(0, 110) : '암호 창 없음'; el('modalPromptCancelBtn')?.click(); const c = await until(() => el('phgcCustomConfirmModal'), 5000); const ct = c ? c.innerText.replace(/\s+/g, ' ').slice(0, 90) : '확인 창 없음'; el('modalConfirmCancelBtn')?.click(); await wait(800); return `암호창="${t}" / 취소시="${ct}"`; });
    await step('LR2-03 틀린 암호 거부', async () => expectFail(() => App().ImportDistributionPackageWithPassword(cfg.legacyPkgPath, 'wrong-pw')));
    await step('LR2-04 본인 비밀번호로 병합 가져오기', async () => { const r = await App().ImportDistributionPackageWithPassword(cfg.legacyPkgPath, 'teacher-pw-9'); const idx = await App().GetLoginIndex(); window.AppEventBus.emit('app:navigate', { screen: 'login', schoolName: idx }); return `user=${r.username} 병합=${r.mergedWithLocalData} 학급=${r.preservedClasses} 상담=${r.counsels} 원서=${r.applications} 비교과=${r.overrides} 백업=${(r.backupFolder || '').split('/').slice(-2).join('/')}`; });
    await step('LR2-05 새 배포자료로 담임 로그인', async () => { const r = await login('301', 'legacy-shared-1', 'legacy-shared-1'); if (el('pwChangeForm')) return r + ' / ' + await changePassword('teacher-pw-10'); return r; });
    await step('LR2-06 옮겨진 상담 기록 확인', async () => { await until(() => document.querySelector('.btn-student-counsel'), 20000); const recs = (await App().GetStudentCounselingRecords(1, '1', '옛학생하나')) || []; document.querySelector('.btn-student-counsel').click(); await until(() => el('counselRecordCount'), 20000); await wait(1500); const ui = el('counselRecordCount')?.innerText; el('closeModalBtn').click(); return `API상담=${recs.length}(${recs.map(r => r.content).join(' / ')}) 화면표시=${ui}`; }, 1500);
    await step('LR2-07 로그아웃', logout);
  }

  if (cfg.scenario === 'B') {
    await step('B01 서약 동의', agree);
    await step('B02 배포자료 가져오기(대화상자 제외)', async () => { const u = await App().ImportDistributionPackage(cfg.pkgPath); const idx = await App().GetLoginIndex(); window.AppEventBus.emit('app:navigate', { screen: 'login', schoolName: idx }); return 'user=' + u + ' 학교=' + idx.schoolName; });
    await step('B03 담임 첫 로그인(공용 암호)', () => login(cfg.homeroom1, cfg.sharedPw, cfg.sharedPw));
    await step('B04 담임 비밀번호 변경', async () => el('pwChangeForm') ? await changePassword('teacher-pw-1') : '변경 요구 없음');
    await step('B05 본인 학급만 표시', async () => { await until(() => document.querySelector('.btn-student-application'), 20000); const rows = document.querySelectorAll('#teacherContent tr').length; const recs = (await App().GetSchoolApplicationRecords()) || []; const other = await expectFail(() => App().SaveStudentApplication({ classNum: 2, studentNum: '1', studentName: '가상학생넷', admissionYear: 2027, category: 'meister', schoolName: '울산마이스터고', track: '일반', status: '지원희망' })); const st = await App().GetClassStatus(2); return `rows=${rows} 원서기록=${recs.length}(전부1반=${recs.every(r => r.classNum === 1)}) 2반저장=${other.slice(0, 40)} 반별학생=${JSON.stringify(st)}`; });
    await step('B06 담임 원서 저장', async () => saveApplicationViaUI(1, '지원완료'), 1500);
    await step('B07 담임 상담 기록', async () => { document.querySelectorAll('.btn-student-counsel')[1].click(); await until(() => el('saveCounselBtn'), 20000); el('counselContentInput').value = '담임 상담 기록'; el('saveCounselBtn').click(); await wait(1800); const r = el('counselRecordCount')?.innerText; el('closeModalBtn').click(); return 'records=' + r; }, 2000);
    await step('B08 취합자료 작성(대화상자 제외)', async () => { const grades = await App().GetClassGrades(1); const changes = []; for (const s of grades) { const apps = await App().GetStudentApplications(1, s.StudentNum, s.Name); if (apps && apps.length) changes.push({ classNum: 1, studentNum: s.StudentNum, studentName: s.Name, applications: apps }); } await App().ExportTeacherPatch(cfg.sharedPw, cfg.homeroom1, 1, changes, cfg.patchPath); return '변경학생=' + changes.map(c => c.studentNum).join(','); });
    await step('B09 로그아웃(계정 목록 유지)', logout);
    await step('B10 바뀐 비밀번호로 재로그인', async () => { const r = await login(cfg.homeroom1, 'teacher-pw-1'); await until(() => document.querySelector('.btn-student-application'), 20000); await wait(800); const r2 = await logout(); return r + ' / ' + r2; });
  }

  if (cfg.scenario === 'C') {
    const handover = cfg.archivePath.replace('.kkomiarchive', '.kkomihandover');
    await step('C01 서약 동의', agree);
    await step('C02 새 학년도 새 폴더 초기 설정(8학급)', async () => { el('startSchoolSetupBtn').click(); await until(() => el('schoolName')); setv('schoolName', '검증용중학교'); setv('classCount', '8'); setv('adminPassword', 'new-admin-pw-1'); setv('adminPasswordConfirm', 'new-admin-pw-1'); setv('sharedDataPassword', 'new-shared-pw-1'); el('saveBtn').click(); return 'loginForm=' + !!(await until(() => el('loginBtn'), 20000)); });
    await step('C03 새 학년부장 로그인', () => login('admin', 'new-admin-pw-1'));
    await step('C04 지난 학년도 입시 자료 가져오기', async () => { const bad = await expectFail(() => App().ImportPreviousYearData(handover, 'wrong-pw', '', true)); const r = await App().ImportPreviousYearData(handover, 'handover-pw-1', '', true); const again = await App().ImportPreviousYearData(handover, 'handover-pw-1', '', true); return `잘못된암호=${bad.slice(0, 20)} 학년도=${JSON.stringify(r.years)} 지난결과=${r.historyRecords} 커트라인=${r.cutoffs} 확정=${r.closures} 관내=${r.sharedPackages} 다시받기중복=${again.historyRecords}`; });
    await step('C05 학생 개인정보 미포함·분석 이어짐', async () => { const st = await App().GetClassStatus(8); const stats = (await App().GetDepartmentAdmissionStats(1)) || []; const years = [...new Set(stats.map(s => s.admissionYear))]; const cuts = (await App().GetCutoffs()) || []; const users = (await App().GetUsers()) || []; return `반별학생=${JSON.stringify(st)} 학과별분석학년도=${JSON.stringify(years)} 커트라인=${cuts.length} 담임계정=${users.filter(u => u.Role === 'homeroom').length}`; });
    await step('C06 학년부장 화면 버튼', async () => `인수인계=${!!el('handoverExportBtn')} 가져오기=${!!el('handoverImportBtn')} 학급수변경=${!!el('changeClassCountBtn')} 최종보관본=${!!el('finalArchiveBtn')}`);
    await step('C07 로그아웃', logout);
  }

  if (cfg.scenario === 'A2') {
    await step('A2-01 학년부장 재로그인(봉인 해제)', () => login('admin', cfg.adminPw));
    await step('A2-02 취합자료 미리보기', async () => { const bad = await expectFail(() => App().InspectTeacherPatch('wrong-pw', cfg.patchPath)); const p = await App().InspectTeacherPatch(cfg.sharedPw, cfg.patchPath); cfg.preview = p.items; return `보낸이=${p.sourceUsername} ${p.classNum}반 변경=${p.changeCount} 학생=${(p.studentNames || []).join(',')} 잘못된암호=${bad.slice(0, 12)}`; });
    await step('A2-03 선택 병합(담임이 새로 쓴 원서)', async () => { const targets = (cfg.preview || []).filter(i => i.applications && i.studentNum !== '1'); const grades = await App().GetClassGrades(1); const nameOf = n => grades.find(g => g.StudentNum === n)?.Name; const before = {}; for (const t of targets) before[t.studentNum] = ((await App().GetStudentApplications(1, t.studentNum, nameOf(t.studentNum))) || []).length; const n = await App().ImportTeacherPatchSelected(cfg.sharedPw, cfg.patchPath, targets.map(t => ({ studentNum: t.studentNum, applications: true }))); const out = []; for (const t of targets) { const after = (await App().GetStudentApplications(1, t.studentNum, nameOf(t.studentNum))) || []; out.push(`${t.studentNum}번 ${before[t.studentNum]}→${after.length}(${after[0]?.status})`); } return `병합=${n} ` + out.join(' '); });
    await step('A2-04 관내 공유 파일 취합', async () => { const r = await App().ImportSharedAdmissionPackage(cfg.sharePw, cfg.sharePath); const year = (await config()).admissionYear; const schools = (await App().GetParticipatingSchools(year)) || []; return `결과=${JSON.stringify(r).slice(0, 90)} 참여학교=${schools.length}`; });
    await step('A2-05 분석 모달 연도 목록', async () => { window.AppEventBus.emit('modal:open', { modal: 'admission-analysis' }); await until(() => el('admissionAnalysisModal'), 10000); await wait(1500); const sel = el('admissionAnalysisModal')?.querySelector('select'); const t = [...(sel?.options || [])].map(o => o.text).join(' / '); closeAll(); return '목록=' + t; });
    await step('A2-06 원서대장(학급별)', async () => { el('openAdminRegisterBtn').click(); await until(() => el('modeSingleClassBtn'), 20000); el('modeSingleClassBtn').click(); await until(() => el('registerClassFilterSelect'), 5000); const t = [...(el('registerClassFilterSelect')?.options || [])].map(o => o.text).join(' / '); const head = (el('applicationRegisterModal')?.innerText.match(/[0-9]{4}학년도[^\n]{0,10}\n?[^\n]{0,20}/) || [''])[0]; closeAll(); return 'filter=' + t + ' | 머리글=' + head.replace(/\s+/g, ' '); });
    await step('A2-07 로그아웃', logout);
  }

  if (cfg.scenario === 'J') {
    await step('J01 학년부장 로그인', () => login('admin', cfg.adminPw));
    await step('J02 학급 화면 판정 기준 표시', async () => { el('goToTeacherBtn').click(); await until(() => document.querySelector('.class-card-btn')); const t = [...document.querySelectorAll('#app span')].find(x => x.innerText.includes('여유폭'))?.innerText; return `요약="${t}" 설정버튼=${!!el('openJudgmentSettingsBtn')}`; });
    await step('J03 판정 기준 설정 저장(점수 5점)', async () => { el('openJudgmentSettingsBtn').click(); await until(() => el('jsMode'), 10000); const rows = document.querySelectorAll('#judgmentSettingsModal tbody tr[data-key]').length; el('jsMode').value = 'points'; el('jsPoints').value = '5'; el('saveJudgmentSettings').click(); await until(() => !el('judgmentSettingsModal'), 8000); await wait(1500); const raw = await App().GetJudgmentSettings(); const t = [...document.querySelectorAll('#app span')].find(x => x.innerText.includes('여유폭'))?.innerText; return `예외행=${rows} 저장값=${raw.slice(0, 60)} 화면요약="${t}"`; });
    await step('J04 학급 전체 표 판정·전환', async () => { await openClass(1); window.AppEventBus.emit('modal:open', { modal: 'matrix', classNum: 1 }); await until(() => document.querySelector('#matrixTableBody'), 20000); await wait(1500); const recs = (await App().GetSchoolApplicationRecords()) || []; log.push('  원서=' + recs.map(r => r.schoolName + '/' + r.track + '/' + r.status).join(', ')); const spec = document.querySelector('.matrix-6tab[data-year="last"][data-track="special"]'); spec?.click(); await wait(1200); const count = () => [...document.querySelectorAll('#matrixTableBody span[title]')].filter(x => x.title.includes('기준선')).length; const before = count(); const sample = [...document.querySelectorAll('#matrixTableBody span[title]')].find(x => x.title.includes('기준선'))?.title || '판정 배지 없음'; const btn = document.querySelector('#matrixJudgmentToggle [data-judgment-mode="ratio"]'); btn?.click(); await wait(800); const sample2 = [...document.querySelectorAll('#matrixTableBody span[title]')].find(x => x.title.includes('기준선'))?.title || '-'; closeAll(); return `배지=${before} 전환버튼=${!!btn} 점수모드="${sample.slice(0, 70)}" 비율모드="${sample2.slice(0, 70)}"`; });
    await step('J05 상담 화면 판정·후기고 범위', async () => { document.querySelector('.btn-student-counsel').click(); await until(() => el('saveExtraBtn'), 20000); await wait(2500); const toggle = !!el('counselJudgmentToggle'); const general = [...document.querySelectorAll('div')].find(d => d.innerText?.startsWith('후기 일반고 내신'))?.innerText.replace(/\s+/g, ' ').slice(0, 220); const city = el('generalCityCutoff')?.innerText; const badges = [...document.querySelectorAll('[id^="badge_"]')].map(b => b.innerText.replace(/\s+/g, ' ')).slice(0, 2).join(' | '); return `전환=${toggle} 후기고="${general}" 관내="${city}" 카드판정="${badges}"`; });
    await step('J06 가산점 입력 완료 저장', async () => { el('genVol1').value = '4'; el('saveExtraBtn').click(); await wait(2500); const g = await App().GetClassGrades(1); const s = g[0]; const d = await App().GetStudentFullDetail(1, s.StudentNum, s.Name); const extra = JSON.parse(d.extraJSON || '{}'); closeAll(); return `입력완료=${d.generalHSBonusEntered} 봉사1학년=${extra.general_volunteer_1} 기본지표=${d.generalHSBaseScore} 상한=${d.generalHSTotalHigh} 총점=${d.generalHSTotalScore}`; });
    await step('J07 분석 모달 후기 일반고 합격선', async () => { el('backBtn').click(); await until(() => el('cutoffBtn'), 20000); window.AppEventBus.emit('modal:open', { modal: 'admission-analysis' }); await until(() => el('analysisSchoolSelect'), 10000); await wait(1200); const sel = el('analysisSchoolSelect'); sel.value = '후기 일반고'; sel.dispatchEvent(new Event('change', { bubbles: true })); await wait(2500); const t = el('analysisContentContainer')?.innerText.replace(/\s+/g, ' ').slice(0, 200); closeAll(); return t; });
    await step('J08 판정 설정 되돌리기', async () => { await App().SaveJudgmentSettings(''); return 'ok'; });
    await step('J09 로그아웃', logout);
  }

  if (cfg.scenario === 'T') {
    const D = cfg.repoDir + '/test-data/가상학생/';
    const upload = async v => { const r1 = await App().ProcessMultipleExcel([D + v + '/1_교과학습발달상황.csv']); const r2 = await App().ProcessMultipleAttendanceExcel([D + v + '/2_출결상황.csv']); const r3 = await App().ProcessMultipleVolunteerExcel([D + v + '/3_봉사활동상황.csv']); const n = o => Object.values(o || {}).reduce((a, b) => a + b, 0); return `교과 ${n(r1)}명 출결 ${n(r2)}명 봉사 ${n(r3)}명`; };
    await step('T01 서약 동의', agree);
    await step('T02 초기 설정(10개 반)', async () => { el('startSchoolSetupBtn').click(); await until(() => el('schoolName')); setv('schoolName', '가상중학교'); setv('classCount', '10'); setv('adminPassword', cfg.adminPw); setv('adminPasswordConfirm', cfg.adminPw); setv('sharedDataPassword', cfg.sharedPw); el('saveBtn').click(); return 'loginForm=' + !!(await until(() => el('loginBtn'), 20000)); });
    await step('T03 학년부장 로그인', () => login('admin', cfg.adminPw));
    await step('T04 v1 자료 올리기(3학년 1학기까지)', async () => { const t = Date.now(); const r = await upload('v1_3학년1학기까지'); return `${r} (${((Date.now() - t) / 1000).toFixed(1)}초) 반별=${JSON.stringify(await App().GetClassStatus(10))}`; }, 1500);
    await step('T05 학급 화면·학생 목록', async () => { el('goToTeacherBtn').click(); await until(() => document.querySelector('.class-card-btn')); const rows = await openClass(4); const badges = [...document.querySelectorAll('#teacherContent span')].filter(x => /안정|경계|주의/.test(x.innerText)).length; return `4반 rows=${rows} 후기고판정배지=${badges}`; }, 1500);
    await step('T06 학급 전체 표', async () => { window.AppEventBus.emit('modal:open', { modal: 'matrix', classNum: 4 }); await until(() => document.querySelector('#matrixTableBody tr'), 30000); await wait(1500); const rows = document.querySelectorAll('#matrixTableBody tr').length; const txt = document.querySelector('#matrixTableBody tr')?.innerText.replace(/\s+/g, ' ').slice(0, 150); closeAll(); return `행=${rows} 첫행="${txt}"`; });
    await step('T07 상담 화면(첫 학생)', async () => { document.querySelector('.btn-student-counsel').click(); await until(() => el('saveExtraBtn'), 20000); await wait(2500); const general = [...document.querySelectorAll('div')].find(d => d.innerText?.startsWith('후기 일반고 내신'))?.innerText.replace(/\s+/g, ' ').slice(0, 230); const cards = document.querySelectorAll('.school-counsel-card').length; closeAll(); return `학교카드=${cards} 후기고="${general}"`; }, 1500);
    await step('T08 원서 입력(마이스터고 1차 합격 후 2차 탈락)', async () => saveApplicationViaUI(0, '지원완료'), 1500);
    await step('T09 v2 자료 올리기(3학년 2학기 포함)', async () => { const r = await upload('v2_3학년2학기포함'); const g = await App().GetClassGrades(4); const d = await App().GetStudentFullDetail(4, g[0].StudentNum, g[0].Name); return `${r} | 4반 ${g[0].Name}: 3-2반영=${d.generalHSThirdYearFinal} 학년별실제=${d.generalHSPerGradeExact} 총점=${d.generalHSTotalScore} 원서보존=${(d.applications || []).length}건`; }, 1500);
    await step('T10 원서대장·지원통계 열기', async () => { el('backBtn').click(); await until(() => el('cutoffBtn'), 20000); el('openAdminRegisterBtn').click(); await until(() => el('modeSingleClassBtn'), 20000); const reg = el('applicationRegisterModal')?.innerText.includes('고 입 원 서 대 장'); closeAll(); el('openAdminSchoolStatsBtn').click(); await until(() => el('applicationSummaryModal'), 20000); await wait(1000); const sum = !!el('applicationSummaryModal'); closeAll(); return `원서대장=${reg} 지원통계=${sum}`; });
    await step('T11 로그아웃', logout);
  }

  log.push('DONE 전체오류=' + (errs.join(' ; ') || '없음'));
  await flush();
  // 정상 종료 경로(QuitApp)로 끝내야 종료 시 DB 봉인까지 검증된다(윈도우는 강제 종료 시 봉인되지 않음).
  if (cfg.quitWhenDone) { await wait(800); try { await rawApp().QuitApp(); } catch (_) {} }
})();
