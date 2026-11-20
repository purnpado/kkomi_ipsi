// 관내 공유 결과 → 자료 검증.
// 받은 관내 공유 자료(다른 학교 익명 원서 결과)를 점검하고, 학년부장이 학교 파일·원서 단위로 통계에서 빼거나 다시 넣는다.
// 빼면 관내 합격선·추세·학과 지망 전략·상담 판정 근거에서 바로 빠진다(자료는 지우지 않음).
// 점검 규칙과 기준값은 백엔드(internal/database/shared_verify*.go, 검출률 측정 tools/verifysim).
import { state } from '../../core/store.js';
import { escapeHtml, displayTrack } from '../../core/utils.js';
import { showModalAlert } from '../../core/dialogs.js';
import { stripHTML } from './verifyStrip.js';
import { displaySchool } from '../../core/schoolName.js';

const isMaster = () => state.currentUser?.Role === 'master';
let report = null;
let openPkg = 0;

function schoolState(s) {
    if (s.isOwn) return '우리 학교';
    if (s.formatVersion === 1) return '옛 형식(점검 불가)';
    if (s.beforeBaseline) return `기준(${report.baselineYear} 고입) 이전`;
    return '';
}

function checkCell(s) {
    const formula = s.formulaOther ? `<span class="vs-note">다른 요강 산출식 ${s.formulaOther}건</span>` : '';
    if (s.errors === 0 && s.warnings === 0) return ['<span class="vs-ok">정상</span>', formula].filter(Boolean).join(' · ');
    return [s.errors ? `<span class="vs-err">오류 ${s.errors}</span>` : '', s.warnings ? `<span class="vs-warn">확인 필요 ${s.warnings}</span>` : '', formula].filter(Boolean).join(' · ');
}

function schoolRowHTML(s) {
    const note = schoolState(s);
    const toggle = isMaster()
        ? `<button type="button" class="vs-btn" data-pkg-toggle="${s.pkgId}" data-excluded="${s.excluded ? '1' : ''}">${s.excluded ? '통계에 다시 넣기' : '통계에서 빼기'}</button>`
        : '';
    return `<tr class="${s.excluded ? 'vs-row-excluded' : ''}">
        <th scope="row">${escapeHtml(displaySchool(s.schoolName))}${note ? ` <span class="vs-note">${escapeHtml(note)}</span>` : ''}</th>
        <td class="num">${s.admissionYear}</td>
        <td class="num">${s.recordCount}</td>
        <td>${checkCell(s)}${s.excludedRecords ? ` <span class="vs-note">원서 ${s.excludedRecords}건 뺌</span>` : ''}</td>
        <td>${s.excluded ? '<span class="vs-warn">통계 제외</span>' : '통계 포함'}</td>
        <td class="vs-actions">${toggle}<button type="button" class="vs-btn" data-pkg-open="${s.pkgId}" aria-expanded="${openPkg === s.pkgId}">${openPkg === s.pkgId ? '접기' : '자세히'}</button></td>
    </tr>`;
}

function issueRowHTML(is) {
    const toggle = isMaster()
        ? `<label class="vs-check"><input type="checkbox" data-rec-toggle="${is.recordId}" ${is.excluded ? 'checked' : ''}> 통계에서 빼기</label>`
        : (is.excluded ? '통계 제외' : '');
    return `<tr>
        <td>${is.level === 'error' ? '<span class="vs-err">오류</span>' : '<span class="vs-warn">확인 필요</span>'}</td>
        <td>${escapeHtml(displaySchool(is.highSchool))} · ${escapeHtml(displayTrack(is.track))}${is.department ? ` · ${escapeHtml(is.department)}` : ''}</td>
        <td>${escapeHtml(is.status)}</td>
        <td class="num">${Number(is.score).toFixed(2)}</td>
        <td class="vs-msg">${escapeHtml(is.message)}</td>
        <td>${toggle}</td>
    </tr>`;
}

/** 그 학교에 보낼 확인 요청 문구(학생 정보 없음). */
function requestText(school, issues) {
    const lines = issues.map((is, i) => `${i + 1}. ${displaySchool(is.highSchool)} ${displayTrack(is.track)}${is.department ? ` ${is.department}` : ''} · ${is.status} ${Number(is.score).toFixed(2)}점 — ${is.message}`);
    return `[꼬미입시 관내 공유 자료 확인 요청]\n${displaySchool(school.schoolName)} ${school.admissionYear} 고입 공유 자료에서 아래 ${issues.length}건을 확인해 주세요.\n${lines.join('\n')}\n원서 결과·점수를 고친 뒤 관내 공유 파일을 다시 만들어 보내 주시면 새 자료로 바꿔 넣고 다시 점검합니다.`;
}

function detailHTML(s) {
    // 다른 요강 산출식은 원서마다 늘어놓지 않고 한 줄로 알린다(지난 학년도 결과를 새 프로그램으로 입력한 경우 등).
    const issues = report.issues.filter((is) => is.pkgId === s.pkgId && is.code !== 'formula');
    const formulaNote = s.formulaOther
        ? `<p class="vs-guide">원서 ${s.formulaOther}건이 ${s.admissionYear} 고입이 아닌 다른 요강 학년도 산출식으로 계산되었습니다. 그해 실제 선발 점수와 다를 수 있으니 추세 비교 때 참고하세요.</p>`
        : '';
    if (issues.length === 0) return `<tr class="vs-detail"><td colspan="6">${formulaNote}점검에서 걸린 원서가 없습니다.</td></tr>`;
    // 튀는 값으로 걸린 원서는 실제로 비교한 묶음(학과 또는 학교 전체)의 분포 위에 그린다(최대 6개).
    const strips = issues.filter((is) => Array.isArray(is.refScores) && is.refScores.length > 0).slice(0, 6).map(stripHTML).join('');
    return `<tr class="vs-detail"><td colspan="6">
        ${formulaNote}
        ${strips ? `<div class="vs-strips">${strips}</div>` : ''}
        <table class="vs-issues"><thead><tr><th scope="col">수준</th><th scope="col">고교 · 전형</th><th scope="col">결과</th><th scope="col">점수</th><th scope="col">내용</th><th scope="col">${isMaster() ? '통계' : ''}</th></tr></thead>
        <tbody>${issues.map(issueRowHTML).join('')}</tbody></table>
        <div class="vs-request">
            <button type="button" class="vs-btn" data-copy-request="${s.pkgId}">확인 요청 문구 복사</button>
            <span class="vs-note">그 학교에 보낼 문구입니다(학생 정보 없음).</span>
        </div>
    </td></tr>`;
}

function render(mount) {
    if (!report) return;
    const rows = report.schools.map((s) => schoolRowHTML(s) + (openPkg === s.pkgId ? detailHTML(s) : '')).join('');
    const groups = report.groupIssues.map((g) => `<li><span class="vs-warn">정원 초과</span> ${g.admissionYear} 고입 ${escapeHtml(displaySchool(g.highSchool))} · ${escapeHtml(displayTrack(g.track))}${g.department ? ` · ${escapeHtml(g.department)}` : ''} — ${escapeHtml(g.message)}</li>`).join('');
    mount.innerHTML = `
        <div class="vs-head">
            <h3>자료 검증 <span>${report.baselineYear} 고입부터 점검을 거친 관내 자료만 쌓습니다 · 우리 학교 자료는 항상 포함</span></h3>
            <button type="button" class="vs-btn" id="sharedVerifyRefresh">다시 점검</button>
        </div>
        <p class="vs-guide">오류는 있을 수 없는 값(만점 초과·모르는 학교·결과 값), 확인 필요는 다른 학교 자료보다 크게 튀는 값입니다. 합격선 근처에서 합격·불합격이 뒤바뀐 경우처럼 그럴듯하게 틀린 값은 잡지 못합니다. ${isMaster() ? '빼면 관내 통계와 상담 판정 근거에서 바로 빠지고, 언제든 다시 넣을 수 있습니다.' : '통계에서 빼기·다시 넣기는 학년부장이 합니다.'}</p>
        ${groups ? `<ul class="vs-groups">${groups}</ul>` : ''}
        ${report.schools.length === 0 ? '<p class="vs-guide">받은 관내 공유 자료가 없습니다.</p>' : `
        <div class="vs-scroll"><table class="vs-table">
            <thead><tr><th scope="col">학교</th><th scope="col">고입</th><th scope="col">원서</th><th scope="col">점검</th><th scope="col">상태</th><th scope="col"><span class="sr-only">동작</span></th></tr></thead>
            <tbody>${rows}</tbody>
        </table></div>`}
    `;
}

async function load(mount) {
    mount.innerHTML = '<p class="vs-guide" role="status">관내 공유 자료를 점검하는 중…</p>';
    try {
        report = await window.go.main.App.VerifySharedData();
    } catch (err) {
        mount.innerHTML = `<p class="vs-err" role="alert">점검하지 못했습니다: ${escapeHtml(String(err))}</p>`;
        return;
    }
    render(mount);
}

async function act(mount, fn) {
    try {
        await fn();
        await load(mount);
    } catch (err) {
        showModalAlert(`바꾸지 못했습니다: ${err}`, '오류', 'error');
    }
}

/** 관내 공유 창 안에 자료 검증 구역을 붙인다. 공유 파일을 가져온 뒤에도 다시 부른다. */
export function mountSharedVerify(mount) {
    if (!mount) return;
    if (!mount.dataset.bound) {
        mount.dataset.bound = '1';
        mount.addEventListener('click', (e) => {
            const t = e.target.closest('button');
            if (!t) return;
            if (t.id === 'sharedVerifyRefresh') return load(mount);
            if (t.dataset.pkgOpen) {
                const id = Number(t.dataset.pkgOpen);
                openPkg = openPkg === id ? 0 : id;
                return render(mount);
            }
            if (t.dataset.pkgToggle) {
                return act(mount, () => window.go.main.App.SetSharedPackageExcluded(Number(t.dataset.pkgToggle), !t.dataset.excluded));
            }
            if (t.dataset.copyRequest) {
                const s = report.schools.find((x) => x.pkgId === Number(t.dataset.copyRequest));
                const text = requestText(s, report.issues.filter((is) => is.pkgId === s.pkgId && is.code !== 'formula'));
                navigator.clipboard?.writeText(text).then(() => showModalAlert('확인 요청 문구를 복사했습니다. 메신저 등에 붙여 넣어 보내세요.', '복사', 'success'))
                    .catch(() => showModalAlert(text, '확인 요청 문구', 'info'));
            }
        });
        mount.addEventListener('change', (e) => {
            const box = e.target.closest('input[data-rec-toggle]');
            if (box) act(mount, () => window.go.main.App.SetSharedRecordExcluded(Number(box.dataset.recToggle), box.checked));
        });
    }
    load(mount);
}

