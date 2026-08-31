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
  selectedPreviewStudent: '',
  submissions: [],
  scoreTable: null
};

const PAGE_TITLES = {
  assignments: 'คำสั่งงาน',
  reviewAll: 'ตรวจงานรวม',
  reviewOne: 'ตรวจงานรายบุคคล',
  studentView: 'มุมมองนักเรียน',
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

function normalizeHexColor(value, fallback='#22C55E') {
  const raw = String(value || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toUpperCase();
  return fallback;
}

function hexToRgb(hex) {
  const safe = normalizeHexColor(hex).replace('#', '');
  return [parseInt(safe.slice(0, 2), 16), parseInt(safe.slice(2, 4), 16), parseInt(safe.slice(4, 6), 16)];
}

function applyTheme(user) {
  const accent = normalizeHexColor(user?.AccentColor || '#22C55E');
  const bg = normalizeHexColor(user?.BackgroundColor || '#000000', '#000000');
  const [r, g, b] = hexToRgb(accent);
  document.documentElement.style.setProperty('--accent', accent);
  document.documentElement.style.setProperty('--line', accent);
  document.documentElement.style.setProperty('--accent-rgb', `${r}, ${g}, ${b}`);
  document.documentElement.style.setProperty('--bg', bg);
  document.documentElement.style.setProperty('--toolbar-bg', `rgba(${r}, ${g}, ${b}, .34)`);
  document.documentElement.style.setProperty('--toolbar-border', `rgba(${r}, ${g}, ${b}, .96)`);
  document.documentElement.style.setProperty('--layout-panel-bg', `rgba(${r}, ${g}, ${b}, .24)`);
  document.documentElement.style.setProperty('--score-head-bg', `rgba(${r}, ${g}, ${b}, .52)`);
  document.documentElement.style.setProperty('--score-name-bg', `rgba(${r}, ${g}, ${b}, .28)`);
  document.documentElement.style.setProperty('--score-cell-bg', `rgba(${r}, ${g}, ${b}, .13)`);
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
    if (b.user) { state.user = b.user; applyTheme(state.user); }
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
  if (page === 'studentView') return renderStudentViewPage();
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
function studentOptions(level='', className='', selected='') {
  const arr = state.students
    .filter(u => (!level || u.Level === level) && (!className || u.ClassName === className))
    .sort((a, b) => Number(a.No || 9999) - Number(b.No || 9999));
  return `<option value="">เลือกนักเรียน</option>` + arr.map(u => `<option ${u.UserID===selected?'selected':''} value="${escapeHtml(u.UserID)}">เลขที่ ${escapeHtml(u.No || '-')} - ${escapeHtml(u.Name)} (${escapeHtml(u.UserID)})</option>`).join('');
}
function getStudent(id) { return state.students.find(u => u.UserID === id); }

function assignmentInstructionType(a) {
  const raw = String(a?.InstructionType || '').trim();
  if (['ข้อความ', 'ไฟล์ใบงาน', 'ข้อความและไฟล์'].includes(raw)) return raw;
  const hasText = !!String(a?.Description || '').trim();
  const hasUrl = !!String(a?.WorksheetURL || '').trim();
  if (hasText && hasUrl) return 'ข้อความและไฟล์';
  if (hasUrl) return 'ไฟล์ใบงาน';
  return 'ข้อความ';
}

function worksheetIsVisible(a) {
  const value = a?.WorksheetVisible;
  return value === true || String(value || '').toUpperCase() === 'TRUE' || String(value || '').trim() === 'จริง' || String(value || '').trim() === 'แสดง';
}

function hasWorksheetFile(a) {
  return !!String(a?.WorksheetURL || '').trim() && assignmentInstructionType(a) !== 'ข้อความ';
}

function renderInstructionText(a, emptyText='ยังไม่มีคำสั่งงาน') {
  const description = String(a?.Description || '').trim();
  return `<div class="text-work instruction-work">
    <div class="instruction-badge">คำสั่งงานแบบข้อความ</div>
    <strong>${escapeHtml(a?.Topic || 'คำสั่งงาน')}</strong>
    <div>${escapeHtml(description || emptyText).replace(/\n/g, '<br>')}</div>
  </div>`;
}

function renderAssignmentPreview(a, label='ใบงาน') {
  if (hasWorksheetFile(a) && worksheetIsVisible(a)) return drivePreview(a.WorksheetURL, label);
  if (!hasWorksheetFile(a)) return renderInstructionText(a);
  return `<strong>${escapeHtml(label)}ถูกซ่อนไว้</strong>`;
}

function renderWorkOrAssignmentPreview(workOrSubmission, assignment) {
  const fileUrl = (workOrSubmission?.fileUrls || [])[0];
  if (fileUrl) return drivePreview(fileUrl, 'งาน');
  if (String(workOrSubmission?.WorkText || '').trim()) return `<div class="text-work">${escapeHtml(workOrSubmission.WorkText).replace(/\n/g, '<br>')}</div>`;
  return renderAssignmentPreview(assignment, 'ใบงาน');
}

function materialToggleLabel(a) {
  return hasWorksheetFile(a) ? 'แสดง/ซ่อนใบงาน' : 'แสดง/ซ่อนคำสั่ง';
}

function materialOpenButton(a) {
  return hasWorksheetFile(a) ? `<button onclick="window.open('${escapeHtml(a.WorksheetURL)}','_blank')">เปิดใบงาน</button>` : '';
}

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
  const type = assignmentInstructionType(a);
  return `<article class="layout-card" data-assignment="${escapeHtml(a.AssignmentID)}">
    <div class="work-preview" id="worksheetBox_${escapeHtml(a.AssignmentID)}">
      ${renderAssignmentPreview(a, 'ใบงาน')}
    </div>
    <div class="detail-panel">
      <h3>${escapeHtml(a.Topic)}</h3>
      <div><b>รหัสงาน:</b> ${escapeHtml(a.AssignmentID)} <span class="status-pill">${escapeHtml(a.Status || 'เปิดใช้งาน')}</span></div>
      <div><b>ระดับชั้น:</b> ${escapeHtml(a.Level)} | <b>คะแนนเต็ม:</b> ${escapeHtml(a.FullScore || '')}</div>
      <div><b>ประเภทงาน:</b> ${escapeHtml(a.WorkType)} | <b>กลุ่ม:</b> ${escapeHtml(a.GroupMode)}</div>
      <div><b>รูปแบบคำสั่ง:</b> ${escapeHtml(type)}</div>
      <div><b>ห้องที่สั่งงาน:</b> ${escapeHtml(a.AssignedClasses)}</div>
      <div><b>คำอธิบาย:</b><br>${escapeHtml(a.Description || 'ไม่มีคำอธิบาย').replace(/\n/g, '<br>')}</div>
      <div class="detail-actions">
        <button onclick="toggleWorksheet('${a.AssignmentID}')">${materialToggleLabel(a)}</button>
        ${materialOpenButton(a)}
        <button class="${inactive?'':'warn'}" onclick="toggleAssignmentStatus('${a.AssignmentID}', '${inactive?'เปิดใช้งาน':'ปิดใช้งาน'}')">${inactive?'เปิดใช้งาน':'ปิดการใช้งาน'}</button>
      </div>
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
    box.innerHTML = renderAssignmentPreview(a, 'ใบงาน');
    box.dataset.hidden = '0';
  } else {
    box.innerHTML = `<strong>${hasWorksheetFile(a) ? 'ใบงานถูกซ่อนไว้' : 'คำสั่งงานถูกซ่อนไว้'}</strong>`;
    box.dataset.hidden = '1';
  }
}
function showAssignmentInfo(id) {
  const a = getAssignment(id);
  if (!a) return;
  alert(`คำสั่งงาน

${a.Topic}

${a.Description || 'ไม่มีคำอธิบาย'}

รูปแบบคำสั่ง: ${assignmentInstructionType(a)}
คะแนนเต็ม: ${a.FullScore || '-'}
ห้อง: ${a.AssignedClasses || '-'}`);
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
  alert('V2 รองรับคำสั่งงานแบบข้อความแล้ว: ให้เพิ่มคอลัมน์ InstructionType ใน Main และใส่ค่า ข้อความ / ไฟล์ใบงาน / ข้อความและไฟล์');
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
  const left = renderWorkOrAssignmentPreview(s, a);
  return `<article class="layout-card" data-submission="${escapeHtml(s.SubmissionID)}">
    <div class="slot-note">(ช่องต่อ 1 งาน)</div>
    <div class="card-icons">
      <button class="icon-btn" title="แสดง/ซ่อนงาน" onclick="toggleSubmissionPreview('${s.SubmissionID}')">👁</button>
      <button class="icon-btn" title="แสดงคำสั่งงาน" onclick="showAssignmentInfo('${s.AssignmentID}')">📄</button>
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
        ${materialOpenButton(a)}
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

function renderStudentViewPage() {
  const selectedStudent = getStudent(state.selectedPreviewStudent);
  $('pageToolbar').innerHTML = `
    <select onchange="state.selectedLevel=this.value; state.selectedClass=''; state.selectedPreviewStudent=''; renderStudentViewPage()">${levelOptions(state.selectedLevel)}</select>
    <select onchange="state.selectedClass=this.value; state.selectedPreviewStudent=''; renderStudentViewPage()">${classOptions(state.selectedLevel, state.selectedClass)}</select>
    <select onchange="state.selectedPreviewStudent=this.value; renderStudentViewPage()">${studentOptions(state.selectedLevel, state.selectedClass, state.selectedPreviewStudent)}</select>
    <button onclick="loadStudentPreviewWork()">ดูมุมมองนักเรียน</button>
    <button onclick="loadStudentPreviewWork()">รีเฟรช</button>
  `;
  syncToolbarHeight();
  $('content').innerHTML = selectedStudent
    ? `<div class="hero-empty">เลือก ${escapeHtml(selectedStudent.Name)} แล้วกดดูมุมมองนักเรียน</div>`
    : '<div class="hero-empty">เลือกระดับชั้น ห้อง และนักเรียน เพื่อดูหน้าฝั่งนักเรียน</div>';
}

async function loadStudentPreviewWork() {
  if (!state.selectedPreviewStudent) return showToast('กรุณาเลือกนักเรียน');
  const previewUser = getStudent(state.selectedPreviewStudent);
  try {
    setLoading('กำลังโหลดมุมมองนักเรียน...');
    const data = await apiGet({ action: 'studentWork', userId: state.selectedPreviewStudent });
    const list = data.work || [];
    $('content').innerHTML = `
      <div class="student-preview-note">โหมดครูดูตัวอย่าง: ${escapeHtml(previewUser?.Name || '')} / ${escapeHtml(previewUser?.ClassName || '')} ไม่สามารถส่งงานแทนนักเรียนได้</div>
      <div class="card-list">${list.map(w => renderStudentPreviewCard(w, previewUser)).join('') || '<div class="hero-empty">ไม่พบงานของนักเรียนคนนี้</div>'}</div>`;
  } catch (err) { showToast(err.message); }
}

function renderStudentPreviewCard(w, previewUser) {
  const a = w.assignment;
  const s = w.submission;
  const left = renderWorkOrAssignmentPreview(s, a);
  return `<article class="layout-card">
    <div class="slot-note">(มุมมองนักเรียน)</div>
    <div class="card-icons">
      <button class="icon-btn" title="แสดง/ซ่อนใบงานหรือคำสั่ง" onclick="toggleWorksheet('${a.AssignmentID}')">👁</button>
      <button class="icon-btn" title="คำสั่งงาน" onclick="showAssignmentInfo('${a.AssignmentID}')">📄</button>
    </div>
    <div class="work-preview" id="worksheetBox_${escapeHtml(a.AssignmentID)}">${left}</div>
    <div class="detail-panel">
      <h3>${escapeHtml(a.Topic)}</h3>
      <div><b>นักเรียน:</b> ${escapeHtml(previewUser?.Name || '')} / ${escapeHtml(previewUser?.ClassName || '')}</div>
      <div>คะแนนเต็ม ${escapeHtml(a.FullScore || '-')} | สถานะงาน <span class="status-pill">${escapeHtml(a.Status || '')}</span></div>
      <div>ประเภท: ${escapeHtml(a.WorkType)} | รูปแบบคำสั่ง: ${escapeHtml(assignmentInstructionType(a))} ${w.group ? `<br>กลุ่ม: ${escapeHtml(w.group.GroupName)}<br>สมาชิก: ${escapeHtml(w.group.MemberNames)}` : ''}</div>
      <div>สถานะส่ง: <span class="status-pill">${s ? 'ส่งแล้ว' : 'ยังไม่ส่ง'}</span> ${s ? `<span class="status-pill">${escapeHtml(s.CheckedStatus || '')}</span> <span class="status-pill">คะแนน ${escapeHtml(s.Score || '-')}</span>` : ''}</div>
      <label>คำตอบ/หมายเหตุ <textarea disabled>${escapeHtml(s?.WorkText || '')}</textarea></label>
      <div class="detail-actions">
        <button disabled>โหมดดูตัวอย่าง</button>
        ${materialOpenButton(a)}
      </div>
      ${s?.ReturnStatus === 'ส่งคืน' ? `<div><b>ครูส่งคืน:</b> ${escapeHtml(s.ReturnNote || '')}</div>` : ''}
    </div>
  </article>`;
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

function renderSettingsPage() {
  const user = state.user || {};
  $('pageToolbar').innerHTML = `
    <button onclick="previewThemeFromForm()">แสดงตัวอย่างธีม</button>
    <button onclick="saveThemeSettings()">บันทึกธีมบัญชี</button>
    <button onclick="resetThemeForm()">กลับค่าเริ่มต้น</button>
    <button onclick="runSystemCheck()">ตรวจสอบข้อมูลชีต</button>
  `;
  syncToolbarHeight();
  $('content').innerHTML = `
    <div class="settings-grid">
      <div class="system-card">
        <h3>เปลี่ยนสีธีม</h3>
        <div class="theme-form">
          <div class="theme-row">
            <label>สีธีมหลัก
              <input id="themeAccent" type="color" value="${escapeHtml(normalizeHexColor(user.AccentColor || '#22C55E'))}">
            </label>
            <label>สีพื้นหลัง
              <input id="themeBg" type="color" value="${escapeHtml(normalizeHexColor(user.BackgroundColor || '#000000', '#000000'))}">
            </label>
          </div>
          <label>ลิงก์รูปพื้นหลัง
            <input id="themeBgImage" value="${escapeHtml(user.BackgroundImageURL || '')}" placeholder="https://...">
          </label>
          <div class="theme-swatch-list">
            ${themeSwatch('#22C55E')}${themeSwatch('#38BDF8')}${themeSwatch('#A855F7')}${themeSwatch('#EC4899')}${themeSwatch('#F97316')}${themeSwatch('#FACC15')}${themeSwatch('#EF4444')}
          </div>
          <small>สีธีมจะใช้กับแถบเครื่องมือ กรอบการ์ดแบบมองทะลุ ปุ่ม และสีตารางคะแนนของบัญชีนี้</small>
        </div>
      </div>
      <div class="system-card">
        <h3>ดึงงานเก่าจากระบบเดิม</h3>
        <p>ใช้สำหรับนำข้อมูลงานที่นักเรียนเคยส่งในระบบเดิมมาเก็บรวมในชีต <b>Submissions</b> ของ V2</p>
        <div class="theme-form">
          <label>ลิงก์หรือ Spreadsheet ID ของชีตหลักระบบเก่า
            <input id="legacySheetUrl" placeholder="วางลิงก์ Google Sheet ระบบเก่า หรือ Spreadsheet ID">
          </label>
          <label style="display:flex;align-items:center;gap:8px;color:var(--text);">
            <input id="legacyCreateMissing" type="checkbox"> สร้างงานใน Main ให้อัตโนมัติ ถ้าไม่พบงานชื่อเดียวกันใน V2
          </label>
          <small>ระบบจะจับคู่จาก <b>Level + Topic</b> เป็นหลัก และจะข้ามรายการที่เคยดึงเข้ามาแล้ว</small>
          <div class="detail-actions">
            <button onclick="previewLegacyImport()">ตรวจสอบก่อนดึง</button>
            <button onclick="importLegacyWork()">ดึงงานเก่าเข้า V2</button>
          </div>
          <div id="legacyImportResult" class="student-preview-note">ยังไม่ได้ตรวจสอบไฟล์ระบบเก่า</div>
        </div>
      </div>
      <div class="system-card">
        <h3>ตรวจสอบข้อมูลชีต</h3>
        <div id="checkResult">กดปุ่มตรวจสอบข้อมูลชีตด้านบน</div>
      </div>
      <div class="system-card">
        <h3>มุมมองนักเรียน</h3>
        <p>เปิดจากเมนูซ้าย เพื่อดูตัวอย่างหน้าที่นักเรียนเห็น โดยเลือกชั้น ห้อง และชื่อนักเรียน</p>
      </div>
    </div>`;
}

function themeSwatch(color) {
  return `<button class="theme-swatch" style="background:${color}" title="${color}" onclick="setThemeAccent('${color}')"></button>`;
}
function setThemeAccent(color) {
  const el = $('themeAccent');
  if (el) el.value = normalizeHexColor(color);
  previewThemeFromForm();
}
function getThemeFromForm() {
  return {
    AccentColor: normalizeHexColor($('themeAccent')?.value || state.user?.AccentColor || '#22C55E'),
    BackgroundColor: normalizeHexColor($('themeBg')?.value || state.user?.BackgroundColor || '#000000', '#000000'),
    BackgroundImageURL: $('themeBgImage')?.value?.trim() || '',
    ThemeColor: normalizeHexColor($('themeAccent')?.value || state.user?.AccentColor || '#22C55E')
  };
}
function previewThemeFromForm() {
  const theme = getThemeFromForm();
  applyTheme({ ...(state.user || {}), ...theme });
  showToast('แสดงตัวอย่างธีมแล้ว');
}
function resetThemeForm() {
  if ($('themeAccent')) $('themeAccent').value = '#22C55E';
  if ($('themeBg')) $('themeBg').value = '#000000';
  if ($('themeBgImage')) $('themeBgImage').value = '';
  previewThemeFromForm();
}
async function saveThemeSettings() {
  try {
    const theme = getThemeFromForm();
    const data = await apiPost({ action: 'updateUserTheme', userId: state.user.UserID, theme });
    state.user = data.user || { ...state.user, ...theme };
    applyTheme(state.user);
    localStorage.setItem(SESSION_KEY, JSON.stringify({ user: state.user, bootstrap: state.bootstrap, savedAt: Date.now() }));
    showToast('บันทึกธีมของบัญชีแล้ว');
  } catch (err) { showToast(err.message); }
}


function getLegacyImportForm() {
  return {
    legacySpreadsheetUrl: $('legacySheetUrl')?.value?.trim() || '',
    createMissingAssignments: $('legacyCreateMissing')?.checked || false,
    userId: state.user?.UserID || ''
  };
}
function renderLegacyImportResult(data) {
  const box = $('legacyImportResult');
  if (!box) return;
  const skipped = data.skippedAssignments || [];
  const errors = data.errors || [];
  box.innerHTML = `
    <div><b>พบงานใน Main เดิม:</b> ${escapeHtml(data.legacyAssignments || 0)} งาน</div>
    <div><b>จับคู่กับ V2 ได้:</b> ${escapeHtml(data.matchedAssignments || 0)} งาน</div>
    <div><b>พบรายการงานส่ง:</b> ${escapeHtml(data.foundSubmissions || 0)} รายการ</div>
    <div><b>นำเข้าแล้ว:</b> ${escapeHtml(data.imported || 0)} รายการ</div>
    <div><b>ข้ามรายการซ้ำ:</b> ${escapeHtml(data.skippedDuplicates || 0)} รายการ</div>
    ${skipped.length ? `<div class="issue"><b>งานที่ยังไม่ถูกนำเข้า:</b><br>${skipped.slice(0, 12).map(x => escapeHtml(`${x.level || '-'} / ${x.topic || '-'}: ${x.reason || ''}`)).join('<br>')}${skipped.length > 12 ? '<br>...' : ''}</div>` : ''}
    ${errors.length ? `<div class="issue error"><b>ข้อผิดพลาด:</b><br>${errors.slice(0, 8).map(x => escapeHtml(x)).join('<br>')}${errors.length > 8 ? '<br>...' : ''}</div>` : ''}
  `;
}
async function previewLegacyImport() {
  try {
    const form = getLegacyImportForm();
    if (!form.legacySpreadsheetUrl) return showToast('กรุณาวางลิงก์หรือ Spreadsheet ID ของชีตระบบเก่า');
    $('legacyImportResult').textContent = 'กำลังตรวจสอบข้อมูลระบบเก่า...';
    const data = await apiGet({
      action: 'legacyImportPreview',
      legacySpreadsheetUrl: form.legacySpreadsheetUrl,
      createMissingAssignments: form.createMissingAssignments ? 'true' : ''
    });
    renderLegacyImportResult(data);
    showToast('ตรวจสอบข้อมูลเก่าแล้ว');
  } catch (err) { showToast(err.message); }
}
async function importLegacyWork() {
  try {
    const form = getLegacyImportForm();
    if (!form.legacySpreadsheetUrl) return showToast('กรุณาวางลิงก์หรือ Spreadsheet ID ของชีตระบบเก่า');
    if (!confirm('ดึงงานเก่าเข้า Submissions ของ V2 ใช่ไหม\nระบบจะข้ามรายการที่เคยดึงแล้ว')) return;
    $('legacyImportResult').textContent = 'กำลังดึงงานเก่าเข้า V2...';
    const data = await apiPost({ action: 'importLegacySubmissions', ...form });
    renderLegacyImportResult(data);
    await refreshBootstrap(false);
    showToast('ดึงงานเก่าเสร็จแล้ว');
  } catch (err) { showToast(err.message); }
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
  const left = renderWorkOrAssignmentPreview(s, a);
  return `<article class="layout-card">
    <div class="slot-note">(ช่องต่อ 1 งาน)</div>
    <div class="card-icons">
      <button class="icon-btn" title="แสดง/ซ่อนใบงานหรือคำสั่ง" onclick="toggleWorksheet('${a.AssignmentID}')">👁</button>
      <button class="icon-btn" title="คำสั่งงาน" onclick="showAssignmentInfo('${a.AssignmentID}')">📄</button>
    </div>
    <div class="work-preview" id="worksheetBox_${escapeHtml(a.AssignmentID)}">${left}</div>
    <div class="detail-panel">
      <h3>${escapeHtml(a.Topic)}</h3>
      <div>คะแนนเต็ม ${escapeHtml(a.FullScore || '-')} | สถานะงาน <span class="status-pill">${escapeHtml(a.Status || '')}</span></div>
      <div>ประเภท: ${escapeHtml(a.WorkType)} | รูปแบบคำสั่ง: ${escapeHtml(assignmentInstructionType(a))} ${w.group ? `<br>กลุ่ม: ${escapeHtml(w.group.GroupName)}<br>สมาชิก: ${escapeHtml(w.group.MemberNames)}` : ''}</div>
      <div>สถานะส่ง: <span class="status-pill">${s ? 'ส่งแล้ว' : 'ยังไม่ส่ง'}</span> ${s ? `<span class="status-pill">${escapeHtml(s.CheckedStatus || '')}</span> <span class="status-pill">คะแนน ${escapeHtml(s.Score || '-')}</span>` : ''}</div>
      <label>คำตอบ/ข้อความส่งงาน <textarea id="workText_${a.AssignmentID}" ${canSubmit?'':'disabled'}>${escapeHtml(s?.WorkText || '')}</textarea></label>
      <label>แนบไฟล์ <input id="file_${a.AssignmentID}" type="file" multiple ${canSubmit?'':'disabled'}></label>
      <div class="detail-actions">
        ${canSubmit ? `<button onclick="submitStudentWork('${a.AssignmentID}')">${s ? 'ส่งแก้ไข/ส่งใหม่' : 'ส่งงาน'}</button>` : '<button disabled>งานปิดการใช้งาน</button>'}
        ${materialOpenButton(a)}
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
    if (!String(workText || '').trim() && !files.length) return showToast('กรุณาพิมพ์คำตอบหรือแนบไฟล์ก่อนส่งงาน');
    const assignment = getAssignment(assignmentId);
    const submitMode = assignment.WorkType === 'งานกลุ่ม' ? 'กลุ่ม' : 'เดี่ยว';
    await apiPost({ action: 'submitWork', userId: state.user.UserID, assignmentId, submitMode, workText, files });
    showToast('ส่งงานแล้ว');
    await loadStudentWork(false);
  } catch (err) { showToast(err.message); }
}
