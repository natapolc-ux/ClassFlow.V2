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
  reviewSelectMode: false,
  selectedSubmissionIds: new Set(),
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
  return `<option value="">เลือกใบงาน</option>` + arr.map(a => `<option ${a.AssignmentID===selected?'selected':''} value="${escapeHtml(a.AssignmentID)}">${escapeHtml(a.Topic)}</option>`).join('');
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
  const fileUrls = getSubmissionFileUrls(workOrSubmission);
  const text = getSubmissionTextWithoutOnlyLinks(workOrSubmission);
  if (fileUrls.length) return renderSubmittedFilePreview(fileUrls, text);
  if (String(workOrSubmission?.WorkText || '').trim()) return `<div class="text-work">${escapeHtml(workOrSubmission.WorkText).replace(/\n/g, '<br>')}</div>`;
  return renderAssignmentPreview(assignment, 'ใบงาน');
}

function renderStudentAssignmentPreview(w) {
  const a = w?.assignment || {};
  return renderAssignmentPreview(a, 'ใบงาน');
}

function splitFileList(value) {
  if (Array.isArray(value)) return value.map(x => String(x || '').trim()).filter(Boolean);
  return String(value || '').split(/[\n,;]+/).map(x => x.trim()).filter(Boolean);
}

function extractUrlsFromText(text) {
  const found = String(text || '').match(/https?:\/\/[^\s<>'"]+/g) || [];
  return found.map(url => url.replace(/[),.;]+$/g, '')).filter(Boolean);
}

function uniqueList(list) {
  const seen = new Set();
  const out = [];
  (list || []).forEach(item => {
    const value = String(item || '').trim();
    if (!value || seen.has(value)) return;
    seen.add(value);
    out.push(value);
  });
  return out;
}

function fileIdToDriveUrl(id) {
  const cleanId = String(id || '').trim();
  if (!cleanId) return '';
  if (/^https?:\/\//i.test(cleanId)) return cleanId;
  return `https://drive.google.com/file/d/${cleanId}/view`;
}

function getSubmissionFileUrls(submission) {
  if (!submission) return [];
  const urls = [];
  urls.push(...splitFileList(submission.fileUrls));
  urls.push(...splitFileList(submission.FileURLs));
  urls.push(...splitFileList(submission.FileURL));
  urls.push(...splitFileList(submission.FileUrl));
  urls.push(...splitFileList(submission.WorkURL));
  urls.push(...splitFileList(submission.WorkLink));
  splitFileList(submission.FileIDs).forEach(id => urls.push(fileIdToDriveUrl(id)));
  splitFileList(submission.FileID).forEach(id => urls.push(fileIdToDriveUrl(id)));
  urls.push(...extractUrlsFromText(submission.WorkText));
  return uniqueList(urls);
}

function getSubmissionTextWithoutOnlyLinks(submission) {
  const text = String(submission?.WorkText || '').trim();
  if (!text) return '';
  const urls = extractUrlsFromText(text);
  const stripped = urls.reduce((acc, url) => acc.replace(url, ''), text).trim();
  return stripped || '';
}

function firstSubmissionFileUrl(submission) {
  return getSubmissionFileUrls(submission)[0] || '';
}

function renderSubmittedFilePreview(fileUrls, text='') {
  const urls = uniqueList(fileUrls);
  if (!urls.length) return '';
  const first = urls[0];
  const preview = drivePreview(first, 'งานที่ส่ง');
  const links = urls.map((url, i) => `<a href="${escapeHtml(url)}" target="_blank">เปิดไฟล์ ${i + 1}</a>`).join(' ');
  return `<div class="submitted-file-preview">
    ${preview}
    ${urls.length > 1 ? `<div class="submitted-links">${links}</div>` : ''}
    ${text ? `<div class="text-work submitted-text">${escapeHtml(text).replace(/\n/g, '<br>')}</div>` : ''}
  </div>`;
}

function renderSubmittedWorkSummary(submission) {
  if (!submission) return '';
  const fileUrls = getSubmissionFileUrls(submission);
  const fileLinks = fileUrls.map((url, i) => `<a href="${escapeHtml(url)}" target="_blank">เปิดไฟล์ที่ส่ง ${i + 1}</a>`).join(' ');
  const text = getSubmissionTextWithoutOnlyLinks(submission);
  if (!fileLinks && !text) return '';
  return `<div class="submitted-summary">
    <b>งานที่ส่งแล้ว</b>
    ${text ? `<div>${escapeHtml(text).replace(/\n/g, '<br>')}</div>` : ''}
    ${fileLinks ? `<div class="submitted-links">${fileLinks}</div>` : ''}
  </div>`;
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
      <div><b>สถานะงาน:</b> <span class="status-pill">${escapeHtml(a.Status || 'เปิดใช้งาน')}</span></div>
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
  const previewUrl = getGooglePreviewUrl(url);
  const safeUrl = escapeHtml(url);
  if (!previewUrl) return `<a href="${safeUrl}" target="_blank">เปิด${label}</a>`;
  return `<div class="preview-frame-wrap">
    <iframe loading="lazy" src="${escapeHtml(previewUrl)}"></iframe>
    <a class="preview-open-link" href="${safeUrl}" target="_blank">เปิด${label}ในแท็บใหม่</a>
  </div>`;
}

function getGooglePreviewUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (/docs\.google\.com\/document\/d\//.test(raw)) return raw.split(/[?#]/)[0].replace(/\/edit.*$/, '/preview');
  if (/docs\.google\.com\/spreadsheets\/d\//.test(raw)) return raw.split(/[?#]/)[0].replace(/\/edit.*$/, '/preview');
  if (/docs\.google\.com\/presentation\/d\//.test(raw)) return raw.split(/[?#]/)[0].replace(/\/edit.*$/, '/preview');
  const id = extractDriveId(raw);
  if (id) return `https://drive.google.com/file/d/${id}/preview`;
  return '';
}

function extractDriveId(url) {
  const text = String(url || '');
  const m = text.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)
    || text.match(/\/document\/d\/([a-zA-Z0-9_-]+)/)
    || text.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)
    || text.match(/\/presentation\/d\/([a-zA-Z0-9_-]+)/)
    || text.match(/[?&]id=([a-zA-Z0-9_-]+)/);
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
    <select onchange="state.selectedLevel=this.value; state.selectedAssignment=''; state.selectedClass=''; clearSelectedSubmissions(false); renderReviewAllPage()">${levelOptions(state.selectedLevel)}</select>
    <select onchange="state.selectedAssignment=this.value; clearSelectedSubmissions(false); renderReviewAllPage()">${assignmentOptions(state.selectedLevel, state.selectedAssignment)}</select>
    <select onchange="state.selectedClass=this.value; clearSelectedSubmissions(false); renderReviewAllPage()">${classOptions(state.selectedLevel, state.selectedClass)}</select>
    <button onclick="loadSubmissions()">โหลดงาน</button>
    <button onclick="loadSubmissions()">รีเฟรช</button>
    <button class="${state.reviewSelectMode ? 'warn' : ''}" onclick="toggleReviewSelectMode()">${state.reviewSelectMode ? 'ปิดโหมดเลือกหลายงาน' : 'เลือกหลายงาน'}</button>
    <label style="display:flex;align-items:center;gap:8px;color:white;"><input id="hideChecked" type="checkbox" checked> ซ่อนงานที่ตรวจแล้ว</label>
    ${state.reviewSelectMode ? renderBulkReviewToolbar() : ''}
  `;
  syncToolbarHeight();
  if (!state.submissions.length) $('content').innerHTML = '<div class="hero-empty">เลือกเงื่อนไขแล้วกดโหลดงาน</div>';
  else renderSubmissionCards(state.submissions);
}

function renderBulkReviewToolbar() {
  return `<div class="bulk-review-toolbar">
    <span id="bulkSelectedCount">เลือกแล้ว ${state.selectedSubmissionIds.size} งาน</span>
    <button onclick="selectAllVisibleSubmissions()">เลือกทั้งหมดที่แสดง</button>
    <button onclick="clearSelectedSubmissions()">ยกเลิกการเลือก</button>
    <button onclick="batchMarkCheckedSelected()">ตรวจแล้ว</button>
    <button onclick="batchFullScoreSelected()">ให้คะแนนเต็ม</button>
    <button onclick="batchReturnSelected()">ส่งคืนงาน</button>
    <button class="danger" onclick="batchDeleteSelected()">ลบงานที่เลือก</button>
  </div>`;
}

function toggleReviewSelectMode() {
  state.reviewSelectMode = !state.reviewSelectMode;
  if (!state.reviewSelectMode) state.selectedSubmissionIds.clear();
  renderReviewAllPage();
}

function updateBulkSelectedCount() {
  const el = $('bulkSelectedCount');
  if (el) el.textContent = `เลือกแล้ว ${state.selectedSubmissionIds.size} งาน`;
  document.querySelectorAll('.submission-select-checkbox').forEach(cb => {
    cb.checked = state.selectedSubmissionIds.has(cb.value);
  });
}

function toggleSubmissionSelection(id, checked) {
  if (checked) state.selectedSubmissionIds.add(id);
  else state.selectedSubmissionIds.delete(id);
  updateBulkSelectedCount();
}

function selectAllVisibleSubmissions() {
  (state.submissions || []).forEach(s => {
    if (s.SubmissionID) state.selectedSubmissionIds.add(String(s.SubmissionID));
  });
  updateBulkSelectedCount();
}

function clearSelectedSubmissions(render=true) {
  state.selectedSubmissionIds.clear();
  if (render && state.currentPage === 'reviewAll') renderReviewAllPage();
}

function selectedSubmissionIds() {
  return Array.from(state.selectedSubmissionIds).filter(Boolean);
}

function selectedSubmissionObjects() {
  const ids = new Set(selectedSubmissionIds());
  return (state.submissions || []).filter(s => ids.has(String(s.SubmissionID)));
}

async function batchPostSelected(makePayload, successMessage) {
  const ids = selectedSubmissionIds();
  if (!ids.length) return showToast('กรุณาเลือกงานนักเรียนก่อน');
  try {
    for (const id of ids) {
      await apiPost(makePayload(id));
    }
    showToast(successMessage || 'ดำเนินการกับงานที่เลือกแล้ว');
    state.selectedSubmissionIds.clear();
    await loadSubmissions();
  } catch (err) { showToast(err.message); }
}

function batchMarkCheckedSelected() {
  batchPostSelected(id => ({ action: 'updateSubmission', submissionId: id, userId: state.user.UserID, CheckedStatus: 'ตรวจแล้ว' }), 'เปลี่ยนสถานะงานที่เลือกเป็นตรวจแล้ว');
}

function batchFullScoreSelected() {
  const items = selectedSubmissionObjects();
  if (!items.length) return showToast('กรุณาเลือกงานนักเรียนก่อน');
  batchPostSelected(id => {
    const s = items.find(x => String(x.SubmissionID) === String(id));
    const a = s?.assignment || getAssignment(s?.AssignmentID) || {};
    return { action: 'updateSubmission', submissionId: id, userId: state.user.UserID, Score: a.FullScore || '', CheckedStatus: 'ตรวจแล้ว' };
  }, 'ให้คะแนนเต็มกับงานที่เลือกแล้ว');
}

function batchReturnSelected() {
  const ids = selectedSubmissionIds();
  if (!ids.length) return showToast('กรุณาเลือกงานนักเรียนก่อน');
  const note = prompt(`หมายเหตุส่งคืนงานที่เลือก ${ids.length} งาน`);
  if (note === null) return;
  batchPostSelected(id => ({ action: 'updateSubmission', submissionId: id, userId: state.user.UserID, ReturnStatus: 'ส่งคืน', ReturnNote: note, CheckedStatus: 'ยังไม่ตรวจ' }), 'ส่งคืนงานที่เลือกแล้ว');
}

function batchDeleteSelected() {
  const ids = selectedSubmissionIds();
  if (!ids.length) return showToast('กรุณาเลือกงานนักเรียนก่อน');
  if (!confirm(`ลบงานที่เลือก ${ids.length} งานใช่ไหม`)) return;
  batchPostSelected(id => ({ action: 'deleteSubmission', submissionId: id, userId: state.user.UserID }), 'ลบงานที่เลือกแล้ว');
}

async function loadSubmissions(extra={}) {
  if (!state.selectedAssignment && state.currentPage === 'reviewAll') return showToast('กรุณาเลือกใบงาน');
  try {
    setLoading('กำลังโหลดงาน...');
    const hideChecked = $('hideChecked') ? $('hideChecked').checked : false;
    const data = await apiGet({ action: 'submissions', assignmentId: state.selectedAssignment, level: state.selectedLevel, className: state.selectedClass, hideChecked, ...extra });
    state.submissions = data.submissions || [];
    state.selectedSubmissionIds.clear();
    renderSubmissionCards(state.submissions);
  } catch (err) { showToast(err.message); }
}

function renderSubmissionCards(items) {
  $('content').innerHTML = `<div class="card-list">${items.map(renderSubmissionCard).join('') || '<div class="hero-empty">ไม่พบงานที่ส่ง</div>'}</div>`;
}

function renderSubmissionCard(s) {
  const a = s.assignment || getAssignment(s.AssignmentID) || {};
  const left = renderWorkOrAssignmentPreview(s, a);
  const selected = state.selectedSubmissionIds.has(String(s.SubmissionID));
  return `<article class="layout-card ${state.reviewSelectMode ? 'select-mode' : ''}" data-submission="${escapeHtml(s.SubmissionID)}">
    ${state.reviewSelectMode ? `<label class="submission-select"><input class="submission-select-checkbox" type="checkbox" value="${escapeHtml(s.SubmissionID)}" ${selected ? 'checked' : ''} onchange="toggleSubmissionSelection('${escapeHtml(s.SubmissionID)}', this.checked)"> เลือกงานนี้</label>` : ''}
    <div class="card-icons">
      <button class="icon-btn" title="แสดง/ซ่อนงาน" onclick="toggleSubmissionPreview('${s.SubmissionID}')">👁</button>
      <button class="icon-btn" title="แสดงคำสั่งงาน" onclick="showAssignmentInfo('${s.AssignmentID}')">📄</button>
      <button class="icon-btn" title="ลบงานที่ส่ง" onclick="deleteSubmission('${s.SubmissionID}')">🗑</button>
    </div>
    <div class="work-preview" id="subPreview_${escapeHtml(s.SubmissionID)}">${left}</div>
    <div class="detail-panel">
      <h3>${escapeHtml(a.Topic || 'งานที่ส่ง')}</h3>
      <div>ห้อง ${escapeHtml(s.Class)} เลขที่ ${escapeHtml(s.No || '-')}</div>
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
function togglePreviewBox(id) {
  const box = $(id);
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
  const left = s ? renderWorkOrAssignmentPreview(s, a) : renderStudentAssignmentPreview(w);
  const previewId = `studentPreview_${a.AssignmentID}`;
  return `<article class="layout-card">
    <div class="slot-note">${s ? '(งานที่นักเรียนส่ง)' : '(มุมมองนักเรียน)'}</div>
    <div class="card-icons">
      <button class="icon-btn" title="แสดง/ซ่อน${s ? 'งานนักเรียน' : 'ใบงานหรือคำสั่ง'}" onclick="togglePreviewBox('${previewId}')">👁</button>
    </div>
    <div class="work-preview" id="${previewId}">${left}</div>
    <div class="detail-panel">
      <h3>${escapeHtml(a.Topic)}</h3>
      <div><b>นักเรียน:</b> ${escapeHtml(previewUser?.Name || '')} / ${escapeHtml(previewUser?.ClassName || '')}</div>
      <div>คะแนนเต็ม ${escapeHtml(a.FullScore || '-')} | สถานะงาน <span class="status-pill">${escapeHtml(a.Status || '')}</span></div>
      <div>ประเภท: ${escapeHtml(a.WorkType)} | รูปแบบคำสั่ง: ${escapeHtml(assignmentInstructionType(a))} ${w.group ? `<br>กลุ่ม: ${escapeHtml(w.group.GroupName)}<br>สมาชิก: ${escapeHtml(w.group.MemberNames)}` : ''}</div>
      <div>สถานะส่ง: <span class="status-pill">${s ? 'ส่งแล้ว' : 'ยังไม่ส่ง'}</span> ${s ? `<span class="status-pill">${escapeHtml(s.CheckedStatus || '')}</span> <span class="status-pill">คะแนน ${escapeHtml(s.Score || '-')}</span>` : ''}</div>
      ${s ? '<div class="submitted-summary"><b>งานที่ส่งแล้วจะแสดงอยู่ฝั่งซ้าย</b></div>' : ''}
      <label>คำตอบ/หมายเหตุ <textarea disabled>${escapeHtml(s?.WorkText || '')}</textarea></label>
      <div class="detail-actions">
        <button disabled>โหมดดูตัวอย่าง</button>
        <button onclick="showAssignmentInfo('${a.AssignmentID}')">ดูคำสั่งงาน</button>
        ${materialOpenButton(a)}
      </div>
      ${s?.ReturnStatus === 'ส่งคืน' ? `<div><b>ครูส่งคืน:</b> ${escapeHtml(s.ReturnNote || '')}</div>` : ''}
    </div>
  </article>`;
}

function renderScoreTablePage() {
  $('pageToolbar').innerHTML = `
    <select onchange="state.selectedLevel=this.value; state.selectedClass=''; state.scoreTable=null; renderScoreTablePage()">${levelOptions(state.selectedLevel)}</select>
    <select onchange="state.selectedClass=this.value; state.scoreTable=null; renderScoreTablePage()">${classOptions(state.selectedLevel, state.selectedClass)}</select>
    <button onclick="loadScoreTable()">โหลดตาราง</button>
    <button onclick="loadScoreTable()">รีเฟรช</button>
    <button onclick="exportScoreImage()">บันทึกตารางเป็นรูปภาพ</button>
    <div class="score-tools">
      <span id="scoreSelectedCount">เลือกแล้ว 0 ช่อง</span>
      <button onclick="clearScoreCellSelection()">ยกเลิกการเลือก</button>
      <button onclick="batchScoreMarkChecked()">ตรวจแล้ว</button>
      <button onclick="batchScoreFullScore()">ให้คะแนนเต็ม</button>
      <input id="scoreBulkValue" class="score-bulk-input" placeholder="คะแนน">
      <button onclick="batchScoreCustomScore()">ให้คะแนน</button>
    </div>
  `;
  syncToolbarHeight();
  $('content').innerHTML = state.scoreTable ? scoreTableHtml(state.scoreTable) : '<div class="hero-empty">เลือกระดับชั้น/ห้อง แล้วกดโหลดตาราง</div>';
  updateScoreSelectedCount();
}
async function loadScoreTable() {
  if (!state.selectedLevel || !state.selectedClass) return showToast('กรุณาเลือกระดับชั้นและห้อง');
  try {
    setLoading('กำลังโหลดตารางคะแนน...');
    const data = await apiGet({ action: 'scoreTable', level: state.selectedLevel, className: state.selectedClass });
    state.scoreTable = data;
    $('content').innerHTML = scoreTableHtml(data);
    updateScoreSelectedCount();
  } catch (err) { showToast(err.message); }
}
function firstNameOnly(name) {
  return String(name || '').trim().split(/\s+/)[0] || '';
}
function shortTopic(topic, max=24) {
  const text = String(topic || '').trim();
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + '…';
}
function assignmentWorkNumber(a, index) {
  const raw = String(a?.SortOrder || '').trim();
  if (/^\d+(?:\.\d+)?$/.test(raw)) return raw;
  return String(index + 1);
}
function scoreCellDisplay(c) {
  const score = String(c?.score ?? '').trim();
  if (score) return escapeHtml(score);
  const status = String(c?.checkedStatus || '').trim();
  if (status === 'ตรวจแล้ว') return 'ตรวจแล้ว';
  if (status === 'ยังไม่ส่ง') return '<span class="score-empty">ยังไม่ส่ง</span>';
  return '';
}
function scoreTableHtml(data) {
  const assignments = data.assignments || [];
  const rows = data.rows || [];
  const head = assignments.map((a, idx) => {
    const workNo = assignmentWorkNumber(a, idx);
    return `<th class="score-assignment-head">
      <label class="score-check-label"><input type="checkbox" class="score-col-check" data-assignment-id="${escapeHtml(a.AssignmentID)}" onchange="toggleScoreColumn('${escapeHtml(a.AssignmentID)}', this.checked)"></label>
      <div class="score-head-title">งานที่ ${escapeHtml(workNo)} ${escapeHtml(shortTopic(a.Topic || ''))}</div>
    </th>`;
  }).join('');
  const body = rows.map(r => {
    const u = r.user || {};
    const name = firstNameOnly(u.Name);
    const cells = (r.cells || []).map(c => {
      const hasSubmission = !!c.submissionId;
      return `<td class="score-cell ${hasSubmission ? '' : 'score-cell-disabled'}" data-assignment-id="${escapeHtml(c.assignmentId || '')}" data-submission-id="${escapeHtml(c.submissionId || '')}">
        <label class="score-check-label"><input type="checkbox" class="score-cell-check" ${hasSubmission ? '' : 'disabled'} data-submission-id="${escapeHtml(c.submissionId || '')}" data-assignment-id="${escapeHtml(c.assignmentId || '')}" onchange="updateScoreSelectedCount()"></label>
        <div class="score-value-box">${scoreCellDisplay(c)}</div>
      </td>`;
    }).join('');
    return `<tr>
      <td class="score-student-name">
        <div>เลขที่ ${escapeHtml(u.No || '-')} ${escapeHtml(u.UserID || '')}</div>
        <div>${escapeHtml(name || '-')}</div>
      </td>
      ${cells}
    </tr>`;
  }).join('');
  return `<div class="score-wrap"><table class="score-table"><thead><tr><th class="score-name-head">รายชื่อ</th>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}
function getSelectedScoreCells() {
  const map = new Map();
  document.querySelectorAll('.score-cell-check:checked').forEach(cb => {
    const submissionId = cb.dataset.submissionId || '';
    if (!submissionId) return;
    map.set(submissionId, { submissionId, assignmentId: cb.dataset.assignmentId || '' });
  });
  return Array.from(map.values());
}
function updateScoreSelectedCount() {
  const el = $('scoreSelectedCount');
  if (el) el.textContent = `เลือกแล้ว ${getSelectedScoreCells().length} ช่อง`;
}
function clearScoreCellSelection() {
  document.querySelectorAll('.score-cell-check,.score-col-check').forEach(cb => cb.checked = false);
  updateScoreSelectedCount();
}
function toggleScoreColumn(assignmentId, checked) {
  document.querySelectorAll(`.score-cell-check[data-assignment-id="${CSS.escape(String(assignmentId))}"]`).forEach(cb => {
    if (!cb.disabled) cb.checked = checked;
  });
  updateScoreSelectedCount();
}
function getScoreAssignment(assignmentId) {
  return (state.scoreTable?.assignments || []).find(a => String(a.AssignmentID) === String(assignmentId)) || getAssignment(assignmentId) || {};
}
async function batchUpdateScoreCells(makePayload, successMessage) {
  const selected = getSelectedScoreCells();
  if (!selected.length) return showToast('กรุณาเลือกช่องคะแนนก่อน');
  try {
    for (const item of selected) {
      await apiPost(makePayload(item));
    }
    showToast(successMessage || 'บันทึกคะแนนแล้ว');
    await loadScoreTable();
  } catch (err) { showToast(err.message); }
}
function batchScoreMarkChecked() {
  batchUpdateScoreCells(item => ({ action: 'updateSubmission', submissionId: item.submissionId, userId: state.user.UserID, CheckedStatus: 'ตรวจแล้ว' }), 'เปลี่ยนสถานะเป็นตรวจแล้ว');
}
function batchScoreFullScore() {
  batchUpdateScoreCells(item => {
    const a = getScoreAssignment(item.assignmentId);
    return { action: 'updateSubmission', submissionId: item.submissionId, userId: state.user.UserID, Score: a.FullScore || '', CheckedStatus: 'ตรวจแล้ว' };
  }, 'ให้คะแนนเต็มกับช่องที่เลือกแล้ว');
}
function batchScoreCustomScore() {
  const score = $('scoreBulkValue')?.value ?? '';
  if (!String(score).trim()) return showToast('กรุณาใส่คะแนนก่อน');
  batchUpdateScoreCells(item => ({ action: 'updateSubmission', submissionId: item.submissionId, userId: state.user.UserID, Score: score, CheckedStatus: 'ตรวจแล้ว' }), 'ให้คะแนนกับช่องที่เลือกแล้ว');
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
  const left = s ? renderWorkOrAssignmentPreview(s, a) : renderStudentAssignmentPreview(w);
  const previewId = `studentWorkPreview_${a.AssignmentID}`;
  return `<article class="layout-card">
    <div class="slot-note">${s ? '(งานที่ส่งแล้ว)' : '(ใบงาน)'}</div>
    <div class="card-icons">
      <button class="icon-btn" title="แสดง/ซ่อน${s ? 'งานที่ส่งแล้ว' : 'ใบงานหรือคำสั่ง'}" onclick="togglePreviewBox('${previewId}')">👁</button>
    </div>
    <div class="work-preview" id="${previewId}">${left}</div>
    <div class="detail-panel">
      <h3>${escapeHtml(a.Topic)}</h3>
      <div>คะแนนเต็ม ${escapeHtml(a.FullScore || '-')} | สถานะงาน <span class="status-pill">${escapeHtml(a.Status || '')}</span></div>
      <div>ประเภท: ${escapeHtml(a.WorkType)} | รูปแบบคำสั่ง: ${escapeHtml(assignmentInstructionType(a))} ${w.group ? `<br>กลุ่ม: ${escapeHtml(w.group.GroupName)}<br>สมาชิก: ${escapeHtml(w.group.MemberNames)}` : ''}</div>
      <div>สถานะส่ง: <span class="status-pill">${s ? 'ส่งแล้ว' : 'ยังไม่ส่ง'}</span> ${s ? `<span class="status-pill">${escapeHtml(s.CheckedStatus || '')}</span> <span class="status-pill">คะแนน ${escapeHtml(s.Score || '-')}</span>` : ''}</div>
      ${s ? '<div class="submitted-summary"><b>งานที่ส่งแล้วจะแสดงอยู่ฝั่งซ้าย</b></div>' : ''}
      <label>คำตอบ/ข้อความส่งงาน <textarea id="workText_${a.AssignmentID}" ${canSubmit?'':'disabled'}>${escapeHtml(s?.WorkText || '')}</textarea></label>
      <label>แนบไฟล์ <input id="file_${a.AssignmentID}" type="file" multiple ${canSubmit?'':'disabled'}></label>
      <div class="detail-actions">
        ${canSubmit ? `<button onclick="submitStudentWork('${a.AssignmentID}')">${s ? 'ส่งแก้ไข/ส่งใหม่' : 'ส่งงาน'}</button>` : '<button disabled>งานปิดการใช้งาน</button>'}
        <button onclick="showAssignmentInfo('${a.AssignmentID}')">ดูคำสั่งงาน</button>
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
