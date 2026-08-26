const state = {
  user: null,
  bootstrap: null,
  assignments: [],
  students: [],
  levels: [],
  classesByLevel: {},
  currentPage: 'assignments',
  sidebarCollapsed: false,
  selectedLevel: '',
  selectedClass: '',
  selectedAssignment: '',
  submissions: [],
  scoreTable: null
};

const PAGE_TITLES = {
  assignments: 'คำสั่งงาน',
  reviewAll: 'ตรวจงานรวม',
  reviewOne: 'ตรวจงานรายบุคคล',
  scoreTable: 'ตารางคะแนน',
  settings: 'อื่นๆ',
  studentWork: 'งานของฉัน',
  studentReturned: 'งานที่ถูกส่งคืน'
};

window.addEventListener('load', restoreSession);
window.addEventListener('resize', syncToolbarHeight);

function $(id) { return document.getElementById(id); }
function escapeHtml(v) { return String(v ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m])); }
function csv(v) { return String(v || '').split(',').map(x => x.trim()).filter(Boolean); }
function showToast(msg) { const t=$('toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),3500); }
function setLoading(msg='กำลังโหลด...') { $('content').innerHTML = `<div class="hero-empty">${escapeHtml(msg)}</div>`; }

function applyTheme(user) {
  const accent = user?.AccentColor || '#22C55E';
  const bg = user?.BackgroundColor || '#000000';
  document.documentElement.style.setProperty('--accent', accent);
  document.documentElement.style.setProperty('--line', accent);
  document.documentElement.style.setProperty('--bg', bg);
  if (user?.BackgroundImageURL) {
    document.body.classList.add('with-bg-image');
    document.body.style.backgroundImage = `linear-gradient(rgba(0,0,0,.72), rgba(0,0,0,.72)), url('${user.BackgroundImageURL}')`;
  } else {
    document.body.classList.remove('with-bg-image');
    document.body.style.backgroundImage = '';
  }
}

async function login() {
  const userId = $('loginUser').value.trim();
  const password = $('loginPass').value.trim();
  $('loginMsg').textContent = 'กำลังเข้าสู่ระบบ...';
  try {
    const data = await apiGet({ action: 'login', userId, password });
    startSession(data.user, data.bootstrap);
    localStorage.setItem(SESSION_KEY, JSON.stringify({ user: data.user, bootstrap: data.bootstrap, savedAt: Date.now() }));
  } catch (err) {
    $('loginMsg').textContent = err.message;
  }
}

function restoreSession() {
  try {
    const saved = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    if (saved?.user) {
      startSession(saved.user, saved.bootstrap || null);
      refreshBootstrap(false);
      return;
    }
  } catch (err) {}
  $('loginScreen').classList.remove('hidden');
}

function startSession(user, bootstrap) {
  state.user = user;
  state.bootstrap = bootstrap;
  if (bootstrap) consumeBootstrap(bootstrap);
  applyTheme(user);
  $('loginScreen').classList.add('hidden');
  $('appShell').classList.remove('hidden');
  $('teacherNav').classList.toggle('hidden', user.Role !== 'teacher' && user.Role !== 'admin');
  $('studentNav').classList.toggle('hidden', user.Role === 'teacher' || user.Role === 'admin');
  const startPage = (user.Role === 'teacher' || user.Role === 'admin') ? 'assignments' : 'studentWork';
  switchPage(startPage);
}

function consumeBootstrap(b) {
  state.bootstrap = b;
  state.assignments = b.assignments || [];
  state.students = b.students || [];
  state.levels = b.levels || [];
  state.classesByLevel = b.classesByLevel || {};
}

async function refreshBootstrap(show=true) {
  if (!state.user) return;
  try {
    const b = await apiGet({ action: 'bootstrap', userId: state.user.UserID, role: state.user.Role });
    consumeBootstrap(b);
    localStorage.setItem(SESSION_KEY, JSON.stringify({ user: state.user, bootstrap: b, savedAt: Date.now() }));
    renderCurrentPage();
    if (show) showToast('รีเฟรชข้อมูลแล้ว');
  } catch (err) {
    if (show) showToast(err.message);
  }
}

function logout() {
  localStorage.removeItem(SESSION_KEY);
  location.reload();
}

function toggleSidebar() {
  state.sidebarCollapsed = !state.sidebarCollapsed;
  $('appShell').classList.toggle('collapsed', state.sidebarCollapsed);
  setTimeout(syncToolbarHeight, 220);
}

function switchPage(page) {
  state.currentPage = page;
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  $('pageTitle').textContent = PAGE_TITLES[page] || page;
  renderCurrentPage();
}

function renderCurrentPage() {
  const page = state.currentPage;
  if (!state.user) return;
  if (page === 'assignments') return renderAssignmentsPage();
  if (page === 'reviewAll') return renderReviewAllPage();
  if (page === 'reviewOne') return renderReviewOnePage();
  if (page === 'scoreTable') return renderScoreTablePage();
  if (page === 'settings') return renderSettingsPage();
  if (page === 'studentWork') return renderStudentPage(false);
  if (page === 'studentReturned') return renderStudentPage(true);
}

function syncToolbarHeight() {
  const tb = $('pageToolbar');
  const h = Math.max(tb.offsetHeight, 80);
  document.documentElement.style.setProperty('--toolbar-h', `${h}px`);
}

function levelOptions(selected='') {
  return `<option value="">เลือกระดับชั้น</option>` + state.levels.map(l => `<option ${l===selected?'selected':''} value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join('');
}
function classOptions(level, selected='') {
  const classes = state.classesByLevel[level] || [];
  return `<option value="">เลือกห้อง</option>` + classes.map(c => `<option ${c===selected?'selected':''} value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
}
function assignmentOptions(level='', selected='') {
  const arr = state.assignments.filter(a => !level || a.Level === level);
  return `<option value="">เลือกใบงาน</option>` + arr.map(a => `<option ${a.AssignmentID===selected?'selected':''} value="${escapeHtml(a.AssignmentID)}">${escapeHtml(a.Topic)} (${escapeHtml(a.AssignmentID)})</option>`).join('');
}
function getAssignment(id) { return state.assignments.find(a => a.AssignmentID === id); }

function renderAssignmentsPage() {
  $('pageToolbar').innerHTML = `
    <select id="levelFilter" onchange="state.selectedLevel=this.value; state.selectedAssignment=''; renderAssignmentsPage()">${levelOptions(state.selectedLevel)}</select>
    <select id="assignmentFilter" onchange="state.selectedAssignment=this.value; renderAssignmentsPage()">${assignmentOptions(state.selectedLevel, state.selectedAssignment)}</select>
    <button onclick="openCreateAssignment()">เพิ่มงาน</button>
    <button onclick="refreshBootstrap()">รีเฟรช</button>
  `;
  syncToolbarHeight();
  const list = state.assignments.filter(a => (!state.selectedLevel || a.Level === state.selectedLevel) && (!state.selectedAssignment || a.AssignmentID === state.selectedAssignment));
  $('content').innerHTML = `<div class="card-list">${list.map(renderAssignmentCard).join('') || '<div class="hero-empty">ยังไม่มีงานในเงื่อนไขนี้</div>'}</div>`;
}

function renderAssignmentCard(a) {
  const inactive = a.Status === 'ปิดใช้งาน';
  const preview = a.WorksheetVisible === true || a.WorksheetVisible === 'TRUE' || a.WorksheetVisible === 'TRUE' || a.WorksheetVisible === 'จริง';
  return `<article class="layout-card" data-assignment="${escapeHtml(a.AssignmentID)}">
    <div class="slot-note">(ช่องต่อ 1 งาน)</div>
    <div class="work-preview" id="worksheetBox_${escapeHtml(a.AssignmentID)}">
      ${preview && a.WorksheetURL ? drivePreview(a.WorksheetURL, 'ใบงาน') : '<strong>ใบงาน</strong>'}
    </div>
    <div class="detail-panel">
      <h3>${escapeHtml(a.Topic)}</h3>
      <div><b>รหัสงาน:</b> ${escapeHtml(a.AssignmentID)} <span class="status-pill">${escapeHtml(a.Status || 'เปิดใช้งาน')}</span></div>
      <div><b>ระดับชั้น:</b> ${escapeHtml(a.Level)} | <b>คะแนนเต็ม:</b> ${escapeHtml(a.FullScore || '')}</div>
      <div><b>ประเภทงาน:</b> ${escapeHtml(a.WorkType)} | <b>กลุ่ม:</b> ${escapeHtml(a.GroupMode)}</div>
      <div><b>ห้องที่สั่งงาน:</b> ${escapeHtml(a.AssignedClasses)}</div>
      <div><b>คำอธิบาย:</b><br>${escapeHtml(a.Description || 'ไม่มีคำอธิบาย')}</div>
      <div class="detail-actions">
        <button onclick="toggleWorksheet('${a.AssignmentID}')">แสดง/ซ่อนใบงาน</button>
        <button onclick="showAssignmentInfo('${a.AssignmentID}')">คำสั่งใบงาน</button>
        ${a.WorksheetURL ? `<button onclick="window.open('${escapeHtml(a.WorksheetURL)}','_blank')">เปิดใบงาน</button>` : ''}
        <button class="${inactive?'':'warn'}" onclick="toggleAssignmentStatus('${a.AssignmentID}', '${inactive?'เปิดใช้งาน':'ปิดใช้งาน'}')">${inactive?'เปิดใช้งาน':'ปิดการใช้งาน'}</button>
      </div>
      <small>ปิดการใช้งาน = นักเรียนจะส่งงานเพิ่มไม่ได้ แต่ข้อมูลเดิมยังอยู่</small>
    </div>
  </article>`;
}

function drivePreview(url, label='ไฟล์') {
  const id = extractDriveId(url);
  if (!id) return `<a href="${escapeHtml(url)}" target="_blank">เปิด${label}</a>`;
  return `<iframe loading="lazy" src="https://drive.google.com/file/d/${id}/preview"></iframe>`;
}
function extractDriveId(url) {
  const m = String(url || '').match(/\/d\/([a-zA-Z0-9_-]+)/) || String(url || '').match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return m ? m[1] : '';
}
function toggleWorksheet(id) {
  const box = $(`worksheetBox_${id}`);
  const a = getAssignment(id);
  if (!box || !a) return;
  if (box.dataset.hidden === '1') {
    box.innerHTML = a.WorksheetURL ? drivePreview(a.WorksheetURL, 'ใบงาน') : '<strong>ไม่มีใบงาน</strong>';
    box.dataset.hidden = '0';
  } else {
    box.innerHTML = '<strong>ใบงานถูกซ่อนไว้</strong>';
    box.dataset.hidden = '1';
  }
}
function showAssignmentInfo(id) {
  const a = getAssignment(id);
  if (!a) return;
  alert(`คำสั่งใบงาน\n\n${a.Topic}\n\n${a.Description || 'ไม่มีคำอธิบาย'}\n\nคะแนนเต็ม: ${a.FullScore || '-'}\nห้อง: ${a.AssignedClasses || '-'}`);
}
async function toggleAssignmentStatus(id, status) {
  if (!confirm(`${status} งานนี้ใช่ไหม`)) return;
  try {
    await apiPost({ action: 'setAssignmentStatus', assignmentId: id, status, userId: state.user.UserID });
    await refreshBootstrap(false);
    showToast('บันทึกสถานะงานแล้ว');
  } catch (err) { showToast(err.message); }
}
function openCreateAssignment() {
  alert('V2 Core นี้วางช่องเพิ่มงานไว้แล้ว ขั้นต่อไปสามารถทำ popup เพิ่มงานแบบเต็มได้');
}

function renderReviewAllPage() {
  $('pageToolbar').innerHTML = `
    <select onchange="state.selectedLevel=this.value; state.selectedAssignment=''; state.selectedClass=''; renderReviewAllPage()">${levelOptions(state.selectedLevel)}</select>
    <select onchange="state.selectedAssignment=this.value; renderReviewAllPage()">${assignmentOptions(state.selectedLevel, state.selectedAssignment)}</select>
    <select onchange="state.selectedClass=this.value; renderReviewAllPage()">${classOptions(state.selectedLevel, state.selectedClass)}</select>
    <button onclick="loadSubmissions()">โหลดงาน</button>
    <button onclick="loadSubmissions()">รีเฟรช</button>
    <label style="display:flex;align-items:center;gap:8px;color:white;"><input id="hideChecked" type="checkbox" checked> ซ่อนงานที่ตรวจแล้ว</label>
  `;
  syncToolbarHeight();
  if (!state.submissions.length) $('content').innerHTML = '<div class="hero-empty">เลือกเงื่อนไขแล้วกดโหลดงาน</div>';
  else renderSubmissionCards(state.submissions);
}

async function loadSubmissions(extra={}) {
  if (!state.selectedAssignment && state.currentPage === 'reviewAll') return showToast('กรุณาเลือกใบงาน');
  try {
    setLoading('กำลังโหลดงาน...');
    const hideChecked = $('hideChecked') ? $('hideChecked').checked : false;
    const data = await apiGet({ action: 'submissions', assignmentId: state.selectedAssignment, level: state.selectedLevel, className: state.selectedClass, hideChecked, ...extra });
    state.submissions = data.submissions || [];
    renderSubmissionCards(state.submissions);
  } catch (err) { showToast(err.message); }
}

function renderSubmissionCards(items) {
  $('content').innerHTML = `<div class="card-list">${items.map(renderSubmissionCard).join('') || '<div class="hero-empty">ไม่พบงานที่ส่ง</div>'}</div>`;
}

function renderSubmissionCard(s) {
  const a = s.assignment || getAssignment(s.AssignmentID) || {};
  const fileUrl = (s.fileUrls || [])[0];
  const left = fileUrl ? drivePreview(fileUrl, 'งาน') : `<div class="text-work">${escapeHtml(s.WorkText || 'ไม่มีข้อความ/ไฟล์แนบ')}</div>`;
  return `<article class="layout-card" data-submission="${escapeHtml(s.SubmissionID)}">
    <div class="slot-note">(ช่องต่อ 1 งาน)</div>
    <div class="card-icons">
      <button class="icon-btn" title="แสดง/ซ่อนงาน" onclick="toggleSubmissionPreview('${s.SubmissionID}')">👁</button>
      <button class="icon-btn" title="แสดงคำสั่งใบงาน" onclick="showAssignmentInfo('${s.AssignmentID}')">📄</button>
      <button class="icon-btn" title="ลบงานที่ส่ง" onclick="deleteSubmission('${s.SubmissionID}')">🗑</button>
    </div>
    <div class="work-preview" id="subPreview_${escapeHtml(s.SubmissionID)}">${left}</div>
    <div class="detail-panel">
      <h3>${escapeHtml(a.Topic || s.AssignmentID)}</h3>
      <div>งานที่ ${escapeHtml(s.AssignmentID)} ห้อง ${escapeHtml(s.Class)} เลขที่ ${escapeHtml(s.No || '-')}</div>
      <div>ชื่อ ${escapeHtml(s.StudentName)} เลขประจำตัว ${escapeHtml(s.StudentID)}</div>
      ${s.GroupName ? `<div>กลุ่ม ${escapeHtml(s.GroupName)}<br>สมาชิก: ${escapeHtml(s.MemberNames)}</div>` : ''}
      <div>สถานะ <span class="status-pill">${escapeHtml(s.CheckedStatus || 'ยังไม่ตรวจ')}</span> <span class="status-pill">${escapeHtml(s.LateStatus || '')}</span></div>
      <label>คะแนน <input id="score_${s.SubmissionID}" class="score-input" value="${escapeHtml(s.Score || '')}" placeholder="คะแนน"></label>
      <label>หมายเหตุครู <textarea id="note_${s.SubmissionID}">${escapeHtml(s.TeacherNote || '')}</textarea></label>
      <div class="detail-actions">
        <button onclick="saveScore('${s.SubmissionID}')">บันทึกคะแนน</button>
        <button onclick="markChecked('${s.SubmissionID}')">ตรวจแล้ว</button>
        <button onclick="returnWork('${s.SubmissionID}')">คืนงาน</button>
        <button onclick="fillFullScore('${s.SubmissionID}', '${escapeHtml(a.FullScore || '')}')">ให้คะแนนเต็ม</button>
        ${a.WorksheetURL ? `<button onclick="window.open('${escapeHtml(a.WorksheetURL)}','_blank')">เปิดใบงาน</button>` : ''}
      </div>
    </div>
  </article>`;
}

function toggleSubmissionPreview(id) {
  const box = $(`subPreview_${id}`);
  if (!box) return;
  if (box.style.visibility === 'hidden') box.style.visibility = 'visible';
  else box.style.visibility = 'hidden';
}
function fillFullScore(submissionId, fullScore) { const el=$(`score_${submissionId}`); if (el) el.value = fullScore; }
async function saveScore(id, extra={}) {
  try {
    await apiPost({ action: 'updateSubmission', submissionId: id, userId: state.user.UserID, Score: $(`score_${id}`)?.value || '', TeacherNote: $(`note_${id}`)?.value || '', ...extra });
    showToast('บันทึกแล้ว');
    if (state.currentPage === 'reviewAll' || state.currentPage === 'reviewOne') await loadSubmissions(getReviewSearchParams());
  } catch (err) { showToast(err.message); }
}
function markChecked(id) { saveScore(id, { CheckedStatus: 'ตรวจแล้ว' }); }
async function returnWork(id) {
  const note = prompt('หมายเหตุส่งคืนงาน');
  if (note === null) return;
  await saveScore(id, { ReturnStatus: 'ส่งคืน', ReturnNote: note, CheckedStatus: 'ยังไม่ตรวจ' });
}
async function deleteSubmission(id) {
  if (!confirm('ลบงานที่ส่งนี้ใช่ไหม')) return;
  try {
    await apiPost({ action: 'deleteSubmission', submissionId: id, userId: state.user.UserID });
    showToast('ลบงานแล้ว');
    await loadSubmissions(getReviewSearchParams());
  } catch (err) { showToast(err.message); }
}

function renderReviewOnePage() {
  $('pageToolbar').innerHTML = `
    <select onchange="state.selectedLevel=this.value; state.selectedClass=''; renderReviewOnePage()">${levelOptions(state.selectedLevel)}</select>
    <select onchange="state.selectedClass=this.value; renderReviewOnePage()">${classOptions(state.selectedLevel, state.selectedClass)}</select>
    <input id="personSearch" placeholder="ชื่อ / เลขที่ / รหัส / ชื่อกลุ่ม">
    <button onclick="loadIndividualWork()">ค้นหา</button>
    <button onclick="loadIndividualWork()">รีเฟรช</button>
  `;
  syncToolbarHeight();
  $('content').innerHTML = '<div class="hero-empty">เลือกห้อง แล้วค้นหานักเรียนหรือกลุ่ม</div>';
}
function getReviewSearchParams() {
  return { search: $('personSearch')?.value || '' };
}
async function loadIndividualWork() {
  const search = $('personSearch')?.value || '';
  if (!state.selectedLevel || !state.selectedClass || !search.trim()) return showToast('กรุณาเลือกระดับชั้น ห้อง และคำค้นหา');
  await loadSubmissions({ search });
}

function renderScoreTablePage() {
  $('pageToolbar').innerHTML = `
    <select onchange="state.selectedLevel=this.value; state.selectedClass=''; renderScoreTablePage()">${levelOptions(state.selectedLevel)}</select>
    <select onchange="state.selectedClass=this.value; renderScoreTablePage()">${classOptions(state.selectedLevel, state.selectedClass)}</select>
    <button onclick="loadScoreTable()">โหลดตาราง</button>
    <button onclick="loadScoreTable()">รีเฟรช</button>
    <button onclick="exportScoreImage()">บันทึกตารางเป็นรูปภาพ</button>
  `;
  syncToolbarHeight();
  $('content').innerHTML = state.scoreTable ? scoreTableHtml(state.scoreTable) : '<div class="hero-empty">เลือกระดับชั้น/ห้อง แล้วกดโหลดตาราง</div>';
}
async function loadScoreTable() {
  if (!state.selectedLevel || !state.selectedClass) return showToast('กรุณาเลือกระดับชั้นและห้อง');
  try {
    setLoading('กำลังโหลดตารางคะแนน...');
    const data = await apiGet({ action: 'scoreTable', level: state.selectedLevel, className: state.selectedClass });
    state.scoreTable = data;
    $('content').innerHTML = scoreTableHtml(data);
  } catch (err) { showToast(err.message); }
}
function scoreTableHtml(data) {
  return `<div class="score-wrap"><table class="score-table"><thead><tr><th>รายชื่อ</th>${data.assignments.map(a=>`<th><input type="checkbox"> งานที่ ${escapeHtml(a.SortOrder || a.AssignmentID)}<br>${escapeHtml(a.Topic)}</th>`).join('')}</tr></thead><tbody>${data.rows.map(r=>`<tr><td>เลขที่ ${escapeHtml(r.user.No || '')}<br>${escapeHtml(r.user.UserID)} / ${escapeHtml(r.user.Name)}</td>${r.cells.map(c=>`<td><input type="checkbox"> <input class="score-input" value="${escapeHtml(c.score || '')}" disabled><br><small>${escapeHtml(c.checkedStatus || '')}</small></td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function exportScoreImage() { showToast('เตรียมไว้สำหรับ V2 รอบต่อไป: บันทึกตารางเป็นรูปภาพ'); }

async function renderSettingsPage() {
  $('pageToolbar').innerHTML = `<button onclick="refreshBootstrap()">รีเฟรชข้อมูล</button><button onclick="runSystemCheck()">ตรวจสอบข้อมูลชีต</button>`;
  syncToolbarHeight();
  $('content').innerHTML = `<div class="settings-grid"><div class="system-card"><h3>ตั้งค่าระบบ</h3><p>ใช้ชีต Settings เป็นตัวกำหนดค่า เช่น DEFAULT_DRIVE_FOLDER_ID, AUTO_REFRESH_SECONDS, SESSION_DAYS</p></div><div class="system-card"><h3>ตรวจสอบข้อมูลชีต</h3><div id="checkResult">กดปุ่มตรวจสอบข้อมูลชีต</div></div></div>`;
}
async function runSystemCheck() {
  try {
    const data = await apiGet({ action: 'systemCheck' });
    const box = $('checkResult');
    box.innerHTML = data.issues.length ? data.issues.map(i => `<div class="issue ${i.type==='error'?'error':''}"><b>${escapeHtml(i.sheet)}</b>: ${escapeHtml(i.detail)}</div>`).join('') : 'ไม่พบปัญหาสำคัญ';
  } catch (err) { showToast(err.message); }
}

async function renderStudentPage(returnedOnly=false) {
  $('pageToolbar').innerHTML = `<button onclick="loadStudentWork(${returnedOnly})">รีเฟรชงาน</button><span style="color:white;">${escapeHtml(state.user.Name || '')} / ${escapeHtml(state.user.ClassName || '')}</span>`;
  syncToolbarHeight();
  await loadStudentWork(returnedOnly);
}
async function loadStudentWork(returnedOnly=false) {
  try {
    setLoading('กำลังโหลดงานของฉัน...');
    const data = await apiGet({ action: 'studentWork', userId: state.user.UserID });
    const list = (data.work || []).filter(w => !returnedOnly || w.submission?.ReturnStatus === 'ส่งคืน');
    $('content').innerHTML = `<div class="card-list">${list.map(renderStudentWorkCard).join('') || '<div class="hero-empty">ไม่พบงาน</div>'}</div>`;
  } catch (err) { showToast(err.message); }
}
function renderStudentWorkCard(w) {
  const a = w.assignment;
  const s = w.submission;
  const canSubmit = a.Status === 'เปิดใช้งาน';
  const left = s?.fileUrls?.[0] ? drivePreview(s.fileUrls[0], 'งาน') : (a.WorksheetURL ? drivePreview(a.WorksheetURL, 'ใบงาน') : '<strong>ใบงาน</strong>');
  return `<article class="layout-card">
    <div class="slot-note">(ช่องต่อ 1 งาน)</div>
    <div class="card-icons">
      <button class="icon-btn" title="แสดง/ซ่อนใบงาน" onclick="toggleWorksheet('${a.AssignmentID}')">👁</button>
      <button class="icon-btn" title="คำสั่งใบงาน" onclick="showAssignmentInfo('${a.AssignmentID}')">📄</button>
    </div>
    <div class="work-preview" id="worksheetBox_${escapeHtml(a.AssignmentID)}">${left}</div>
    <div class="detail-panel">
      <h3>${escapeHtml(a.Topic)}</h3>
      <div>คะแนนเต็ม ${escapeHtml(a.FullScore || '-')} | สถานะงาน <span class="status-pill">${escapeHtml(a.Status || '')}</span></div>
      <div>ประเภท: ${escapeHtml(a.WorkType)} ${w.group ? `<br>กลุ่ม: ${escapeHtml(w.group.GroupName)}<br>สมาชิก: ${escapeHtml(w.group.MemberNames)}` : ''}</div>
      <div>สถานะส่ง: <span class="status-pill">${s ? 'ส่งแล้ว' : 'ยังไม่ส่ง'}</span> ${s ? `<span class="status-pill">${escapeHtml(s.CheckedStatus || '')}</span> <span class="status-pill">คะแนน ${escapeHtml(s.Score || '-')}</span>` : ''}</div>
      <label>คำตอบ/หมายเหตุ <textarea id="workText_${a.AssignmentID}" ${canSubmit?'':'disabled'}>${escapeHtml(s?.WorkText || '')}</textarea></label>
      <label>แนบไฟล์ <input id="file_${a.AssignmentID}" type="file" multiple ${canSubmit?'':'disabled'}></label>
      <div class="detail-actions">
        ${canSubmit ? `<button onclick="submitStudentWork('${a.AssignmentID}')">${s ? 'ส่งแก้ไข/ส่งใหม่' : 'ส่งงาน'}</button>` : '<button disabled>งานปิดการใช้งาน</button>'}
        ${a.WorksheetURL ? `<button onclick="window.open('${escapeHtml(a.WorksheetURL)}','_blank')">เปิดใบงาน</button>` : ''}
      </div>
      ${s?.ReturnStatus === 'ส่งคืน' ? `<div><b>ครูส่งคืน:</b> ${escapeHtml(s.ReturnNote || '')}</div>` : ''}
    </div>
  </article>`;
}
async function submitStudentWork(assignmentId) {
  try {
    const input = $(`file_${assignmentId}`);
    const files = await Promise.all(Array.from(input.files || []).map(fileToPayload));
    const workText = $(`workText_${assignmentId}`).value;
    const assignment = getAssignment(assignmentId);
    const submitMode = assignment.WorkType === 'งานกลุ่ม' ? 'กลุ่ม' : 'เดี่ยว';
    await apiPost({ action: 'submitWork', userId: state.user.UserID, assignmentId, submitMode, workText, files });
    showToast('ส่งงานแล้ว');
    await loadStudentWork(false);
  } catch (err) { showToast(err.message); }
}
