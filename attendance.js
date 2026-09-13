/* ===== attendance.js — StaffHub Complete App Logic ===== */

// ============================================================
//  DATA STORE — localStorage backed
// ============================================================
let currentAccount = null;
let storagePermissionGranted = false;
let accountStore = null;
let pendingAuthMessage = '';

if (document.body) document.body.classList.add('auth-locked');

const DB = {
  get(key) {
    if (!currentAccount || !storagePermissionGranted) return [];
    return accountStore.get(key);
  },
  set(key, val) {
    if (!currentAccount || !storagePermissionGranted) throw new Error('Sign in and allow storage before saving records.');
    accountStore.set(key, val);
  },
  nextId(key) {
    const items = this.get(key);
    return items.length ? Math.max(...items.map(i => i.id)) + 1 : 1;
  }
};
// ============================================================
//  UTILITY HELPERS
// ============================================================
function uid() {
  if (window.crypto?.getRandomValues) {
    const arr = new Uint32Array(1);
    window.crypto.getRandomValues(arr);
    return Date.now() * 1000 + (arr[0] % 1000);
  }
  return Date.now() * 1000 + Math.floor(Math.random() * 1000);
}
function today() {
  const d = new Date();
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().split('T')[0];
}
function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
function fmt(d) { if (!d) return '—'; const dt = new Date(d + 'T00:00:00'); return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
function isFutureDate(date) { return date > today(); }
function initials(name) { return name ? name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2) : '?'; }
function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}
function escapeAttr(value) { return escapeHTML(value); }
function daysBetween(a, b) {
  const d1 = new Date(a), d2 = new Date(b);
  return Math.max(1, Math.round((d2 - d1) / 86400000) + 1);
}
function stars(r) {
  const n = parseInt(r) || 0;
  return '<span class="stars">' + '★'.repeat(n) + '☆'.repeat(5 - n) + '</span>';
}
function currency(n) { return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 }); }

function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = (type === 'success' ? '✅ ' : '❌ ') + msg;
  document.getElementById('toastContainer').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ============================================================
//  NAVIGATION / ROUTING
// ============================================================
const pages = ['dashboard', 'employees', 'attendance', 'payroll', 'performance'];
const pageTitles = {
  dashboard: 'Dashboard', employees: 'Employees',
  attendance: 'Attendance',
  payroll: 'Payroll',
  performance: 'Performance Reviews'
};

let currentPage = 'dashboard';

function navigate(page) {
  if (!pages.includes(page) || !renders[page]) return;
  currentPage = page;
  // Update nav
  pages.forEach(p => {
    document.getElementById('nav-' + p)?.classList.toggle('active', p === page);
  });
  // Update sections
  document.querySelectorAll('.page').forEach(s => s.classList.remove('active'));
  document.getElementById('page-' + page)?.classList.add('active');
  // Update title
  document.getElementById('pageTitle').textContent = pageTitles[page];
  // Render page
  renders[page]();
}

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();
    navigate(item.dataset.page);
  });
});

// Sidebar toggle
document.getElementById('sidebarToggle').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('collapsed');
});

// ============================================================
//  MODAL SYSTEM
// ============================================================
let modalSaveFn = null;

function openModal(title, bodyHTML, saveFn, saveLabel = 'Save') {
  resetModalSaveButton();
  document.getElementById('modal').classList.remove('attendance-calendar-modal');
  document.getElementById('modalCancel').style.display = '';
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHTML;
  document.getElementById('modalSave').textContent = saveLabel;
  modalSaveFn = saveFn;
  document.getElementById('modalOverlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  modalSaveFn = null;
  resetModalSaveButton();
}

function resetModalSaveButton() {
  const save = document.getElementById('modalSave');
  if (!save) return;
  save.style.background = '';
  save.style.boxShadow = '';
}

document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('modalCancel').addEventListener('click', closeModal);
document.getElementById('modalOverlay').addEventListener('click', e => {
  if (e.target === document.getElementById('modalOverlay')) closeModal();
});

document.getElementById('modalSave').addEventListener('click', () => {
  if (modalSaveFn) modalSaveFn();
});

// Custom confirm dialog (replaces browser confirm() blocked on file://)
function confirmDialog(message, onConfirm) {
  const save = document.getElementById('modalSave');
  const cancel = document.getElementById('modalCancel');
  document.getElementById('modalTitle').textContent = 'Confirm';
  document.getElementById('modalBody').innerHTML =
    `<p style="color:var(--color-text-dim);font-size:15px;padding:8px 0">${message}</p>`;
  save.textContent = 'Delete';
  save.style.background = 'var(--color-red)';
  save.style.boxShadow = 'none';
  modalSaveFn = () => {
    closeModal();
    onConfirm();
  };
  // Reset styling on cancel
  cancel.addEventListener('click', resetModalSaveButton, { once: true });
  document.getElementById('modalClose').addEventListener('click', resetModalSaveButton, { once: true });
  document.getElementById('modalOverlay').classList.add('open');
}

// ============================================================
//  EMPLOYEES MODULE
// ============================================================
const DEPTS = ['Engineering', 'Marketing', 'Sales', 'HR', 'Finance', 'Operations', 'Design', 'Legal', 'Support'];
const ROLES = ['Manager', 'Senior Developer', 'Developer', 'Designer', 'Analyst', 'HR Executive', 'Accountant', 'Sales Rep', 'Support Agent', 'Team Lead'];

function getEmployees() { return DB.get('employees'); }
function saveEmployees(arr) { DB.set('employees', arr); }

function removeEmployeeRecords(empId) {
  const withoutEmployee = key => DB.set(
    key,
    DB.get(key).filter(item => String(item.empId) !== String(empId))
  );
  ['attendance', 'leaves', 'payroll', 'performance'].forEach(withoutEmployee);
}

function cleanupOrphanRecords() {
  const employeeIds = new Set(getEmployees().map(e => String(e.id)));
  const belongsToEmployee = item => employeeIds.has(String(item.empId));
  ['attendance', 'leaves', 'payroll', 'performance'].forEach(key => {
    DB.set(key, DB.get(key).filter(belongsToEmployee));
  });
}

function employeeForm(emp = {}) {
  return `
  <div class="form-grid">
    <div class="form-group">
      <label>Full Name *</label>
      <input id="f-name" type="text" value="${escapeAttr(emp.name)}" placeholder="John Smith" />
    </div>
    <div class="form-group">
      <label>Role *</label>
      <select id="f-role">
        ${ROLES.map(r => `<option ${emp.role === r ? 'selected' : ''}>${escapeHTML(r)}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label>Department *</label>
      <select id="f-dept">
        ${DEPTS.map(d => `<option ${emp.department === d ? 'selected' : ''}>${escapeHTML(d)}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label>Email *</label>
      <input id="f-email" type="email" value="${escapeAttr(emp.email)}" placeholder="john@company.com" />
    </div>
    <div class="form-group">
      <label>Phone</label>
      <input id="f-phone" type="tel" value="${escapeAttr(emp.phone)}" placeholder="+1 555 000 0000" />
    </div>
    <div class="form-group">
      <label>Daily Rate ($) *</label>
      <input id="f-rate" type="number" min="0" step="0.01" value="${escapeAttr(emp.dailyRate)}" placeholder="250.00" />
    </div>
    <div class="form-group">
      <label>Join Date</label>
      <input id="f-joined" type="date" value="${escapeAttr(emp.joinDate || today())}" />
    </div>
    <div class="form-group">
      <label>Status</label>
      <select id="f-status">
        <option value="active" ${emp.status !== 'inactive' ? 'selected' : ''}>Active</option>
        <option value="inactive" ${emp.status === 'inactive' ? 'selected' : ''}>Inactive</option>
      </select>
    </div>
    <div class="form-group span-2">
      <label>Address</label>
      <input id="f-address" type="text" value="${escapeAttr(emp.address)}" placeholder="123 Main St" />
    </div>
  </div>`;
}

function renderEmployees() {
  let emps = getEmployees();
  const q = document.getElementById('empSearch')?.value?.toLowerCase() || '';
  if (q) emps = emps.filter(e =>
    e.name.toLowerCase().includes(q) ||
    e.role.toLowerCase().includes(q) ||
    e.department.toLowerCase().includes(q) ||
    (e.email || '').toLowerCase().includes(q)
  );

  const body = document.getElementById('empTableBody');
  const empty = document.getElementById('empEmpty');
  if (!body) return;

  if (!emps.length) {
    body.innerHTML = '';
    empty.style.display = 'flex';
    return;
  }
  empty.style.display = 'none';

  body.innerHTML = emps.map(e => `
  <tr>
    <td><div style="display:flex;align-items:center;gap:10px">
      <div class="avatar" style="width:32px;height:32px;font-size:12px">${initials(e.name)}</div>
      <strong style="color:var(--color-text)">${escapeHTML(e.name)}</strong>
    </div></td>
    <td>${escapeHTML(e.role)}</td>
    <td>${escapeHTML(e.department)}</td>
    <td>${e.email ? escapeHTML(e.email) : '—'}</td>
    <td>${e.phone ? escapeHTML(e.phone) : '—'}</td>
    <td style="color:var(--color-green);font-weight:600">${e.dailyRate !== '' && e.dailyRate != null ? currency(e.dailyRate) + '/day' : '—'}</td>
    <td>${fmt(e.joinDate)}</td>
    <td><span class="badge badge-${e.status || 'active'}">${e.status || 'active'}</span></td>
    <td><div class="actions">
      <button class="btn btn-sm btn-primary" onclick="viewEmployeeAttendance(${e.id})">📅 Calendar</button>
      <button class="btn btn-sm btn-ghost" onclick="editEmployee(${e.id})">✏️ Edit</button>
      <button class="btn btn-sm btn-danger" onclick="deleteEmployee(${e.id})">🗑️</button>
    </div></td>
  </tr>`).join('');
}

document.getElementById('addEmpBtn')?.addEventListener('click', () => {
  openModal('Add New Employee', employeeForm(), () => {
    const name = document.getElementById('f-name').value.trim();
    const email = document.getElementById('f-email').value.trim();
    const dailyRate = document.getElementById('f-rate').value;
    if (!name) { toast('Name is required', 'error'); return; }
    if (!email) { toast('Email is required', 'error'); return; }
    if (dailyRate === '' || Number.isNaN(Number(dailyRate)) || Number(dailyRate) < 0) { toast('Enter a valid daily rate', 'error'); return; }
    const emps = getEmployees();
    emps.push({
      id: uid(), name,
      role: document.getElementById('f-role').value,
      department: document.getElementById('f-dept').value,
      email, phone: document.getElementById('f-phone').value,
      dailyRate,
      joinDate: document.getElementById('f-joined').value,
      status: document.getElementById('f-status').value,
      address: document.getElementById('f-address').value
    });
    saveEmployees(emps);
    closeModal(); renderEmployees(); updateDashboard();
    toast('Employee added successfully');
  });
});

function editEmployee(id) {
  const emps = getEmployees();
  const emp = emps.find(e => e.id === id);
  if (!emp) return;
  openModal('Edit Employee', employeeForm(emp), () => {
    const name = document.getElementById('f-name').value.trim();
    const email = document.getElementById('f-email').value.trim();
    const dailyRate = document.getElementById('f-rate').value;
    if (!name) { toast('Name is required', 'error'); return; }
    if (!email) { toast('Email is required', 'error'); return; }
    if (dailyRate === '' || Number.isNaN(Number(dailyRate)) || Number(dailyRate) < 0) { toast('Enter a valid daily rate', 'error'); return; }
    Object.assign(emp, {
      name, role: document.getElementById('f-role').value,
      department: document.getElementById('f-dept').value,
      email,
      phone: document.getElementById('f-phone').value,
      dailyRate,
      joinDate: document.getElementById('f-joined').value,
      status: document.getElementById('f-status').value,
      address: document.getElementById('f-address').value
    });
    saveEmployees(emps); closeModal(); renderEmployees(); updateDashboard();
    toast('Employee updated');
  });
}

function deleteEmployee(id) {
  confirmDialog('Delete this employee and all related records?', () => {
    saveEmployees(getEmployees().filter(e => String(e.id) !== String(id)));
    removeEmployeeRecords(id);
    renderEmployees();
    updateDashboard();
    if (currentPage === 'attendance') renderAttendance();
    if (currentPage === 'payroll') renderPayroll();
    if (currentPage === 'performance') renderPerformance();
    toast('Employee and related records deleted');
  });
}

document.getElementById('empSearch')?.addEventListener('input', renderEmployees);

// ============================================================
//  ATTENDANCE MODULE
// ============================================================
function getAttendance() { return DB.get('attendance'); }
function saveAttendance(arr) { DB.set('attendance', arr); }

function hasAttendanceRecord(empId, date, ignoreId = null) {
  return getAttendance().some(r =>
    String(r.empId) === String(empId) &&
    r.date === date &&
    String(r.id) !== String(ignoreId)
  );
}

function attendanceForm(rec = {}) {
  const emps = getEmployees();
  return `
  <div class="form-grid">
    <div class="form-group span-2">
      <label>Employee *</label>
      <select id="a-emp">
        <option value="">— Select —</option>
        ${emps.map(e => `<option value="${e.id}" ${rec.empId == e.id ? 'selected' : ''}>${escapeHTML(e.name)} (${escapeHTML(e.department)})</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label>Date *</label>
      <input id="a-date" type="date" value="${rec.date || today()}" max="${today()}" />
    </div>
    <div class="form-group">
      <label>Status</label>
      <select id="a-status">
        <option value="present" ${rec.status === 'present' ? 'selected' : ''}>Present</option>
        <option value="absent" ${rec.status === 'absent' ? 'selected' : ''}>Absent</option>
        <option value="late" ${rec.status === 'late' ? 'selected' : ''}>Late</option>
      </select>
    </div>
    <div class="form-group">
      <label>Check-In</label>
      <input id="a-in" type="time" value="${rec.checkIn || '09:00'}" />
    </div>
    <div class="form-group">
      <label>Check-Out</label>
      <input id="a-out" type="time" value="${rec.checkOut || '17:00'}" />
    </div>
  </div>`;
}

function renderAttendance() {
  const filterDate = document.getElementById('attDate')?.value || '';
  let records = getAttendance();
  const emps = getEmployees();
  records = records.filter(r => emps.some(e => String(e.id) === String(r.empId)));
  if (filterDate) records = records.filter(r => r.date === filterDate);

  const body = document.getElementById('attTableBody');
  const empty = document.getElementById('attEmpty');
  if (!body) return;

  if (!records.length) {
    body.innerHTML = ''; empty.style.display = 'flex'; return;
  }
  empty.style.display = 'none';

  body.innerHTML = records.map(r => {
    const emp = emps.find(e => e.id == r.empId);
    return `<tr>
      <td><div style="display:flex;align-items:center;gap:8px">
        <div class="avatar" style="width:28px;height:28px;font-size:11px">${initials(emp?.name || '?')}</div>
        ${emp?.name ? escapeHTML(emp.name) : 'Unknown'}
      </div></td>
      <td>${fmt(r.date)}</td>
      <td><span class="badge badge-${r.status}">${r.status}</span></td>
      <td>${r.checkIn || '—'}</td>
      <td>${r.checkOut || '—'}</td>
      <td><div class="actions">
        <button class="btn btn-sm btn-ghost" onclick="editAttendance(${r.id})">✏️</button>
        <button class="btn btn-sm btn-danger" onclick="deleteAttendance(${r.id})">🗑️</button>
      </div></td>
    </tr>`;
  }).join('');
}

document.getElementById('markAttBtn')?.addEventListener('click', () => {
  openModal('Mark Attendance', attendanceForm(), () => {
    const empId = document.getElementById('a-emp').value;
    const date = document.getElementById('a-date').value;
    if (!empId) { toast('Select an employee', 'error'); return; }
    if (!date) { toast('Select a date', 'error'); return; }
    if (isFutureDate(date)) { toast('Attendance cannot be marked for future dates', 'error'); return; }
    if (hasAttendanceRecord(empId, date)) { toast('Attendance already marked for this employee on this date', 'error'); return; }
    const records = getAttendance();
    records.push({
      id: uid(), empId, date,
      status: document.getElementById('a-status').value,
      checkIn: document.getElementById('a-in').value,
      checkOut: document.getElementById('a-out').value
    });
    saveAttendance(records); closeModal(); renderAttendance(); updateDashboard();
    toast('Attendance marked');
  });
});

function editAttendance(id) {
  const records = getAttendance();
  const rec = records.find(r => String(r.id) === String(id));
  if (!rec) return;
  openModal('Edit Attendance', attendanceForm(rec), () => {
    const empId = document.getElementById('a-emp').value;
    if (!empId) { toast('Select an employee', 'error'); return; }
    const date = document.getElementById('a-date').value;
    if (!date) { toast('Select a date', 'error'); return; }
    if (isFutureDate(date)) { toast('Attendance cannot be marked for future dates', 'error'); return; }
    if (hasAttendanceRecord(empId, date, id)) { toast('Attendance already marked for this employee on this date', 'error'); return; }
    Object.assign(rec, {
      empId, date,
      status: document.getElementById('a-status').value,
      checkIn: document.getElementById('a-in').value,
      checkOut: document.getElementById('a-out').value
    });
    saveAttendance(records); closeModal(); renderAttendance();
    toast('Attendance updated');
  });
}

function deleteAttendance(id) {
  confirmDialog('Delete this attendance record?', () => {
    saveAttendance(getAttendance().filter(r => String(r.id) !== String(id)));
    renderAttendance(); updateDashboard();
    toast('Record deleted');
  });
}

document.getElementById('attDate')?.addEventListener('change', renderAttendance);

// ============================================================
//  PERMANENT USER-PROTECTED EMPLOYEE ATTENDANCE CALENDAR
// ============================================================
function employeeAttendanceCalendar(emp, selectedMonth) {
  const safeMonth = /^\d{4}-\d{2}$/.test(selectedMonth || '') ? selectedMonth : monthKey();
  const [year, month] = safeMonth.split('-').map(Number);
  const firstDay = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const leadingBlanks = (firstDay.getDay() + 6) % 7;
  const records = getAttendance().filter(record =>
    String(record.empId) === String(emp.id) && record.date?.startsWith(safeMonth)
  );
  const recordsByDate = new Map(records.map(record => [record.date, record]));
  const totals = records.reduce((result, record) => {
    const status = ['present', 'absent', 'late'].includes(record.status) ? record.status : 'unrecorded';
    result[status]++;
    return result;
  }, { present: 0, absent: 0, late: 0, unrecorded: 0 });

  const dayCells = Array.from({ length: leadingBlanks }, () => '<div class="attendance-calendar-day is-empty" aria-hidden="true"></div>');
  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${safeMonth}-${String(day).padStart(2, '0')}`;
    const record = recordsByDate.get(date);
    const status = ['present', 'absent', 'late'].includes(record?.status) ? record.status : 'unrecorded';
    const detail = record
      ? `${status.charAt(0).toUpperCase() + status.slice(1)}${record.checkIn ? ` · ${record.checkIn}` : ''}${record.checkOut ? `–${record.checkOut}` : ''}`
      : 'No attendance record';
    dayCells.push(`
      <div class="attendance-calendar-day is-${status}" title="${escapeAttr(detail)}">
        <span class="attendance-day-number">${day}</span>
        <span class="attendance-day-status">${status === 'unrecorded' ? 'No record' : status}</span>
      </div>`);
  }

  return `
    <div class="attendance-calendar-profile">
      <div class="avatar">${initials(emp.name)}</div>
      <div>
        <strong>${escapeHTML(emp.name)}</strong>
        <div class="list-sub">${escapeHTML(emp.role)} · ${escapeHTML(emp.department)}</div>
      </div>
    </div>
    <div class="attendance-calendar-controls">
      <button type="button" class="btn btn-sm btn-ghost" onclick="shiftEmployeeAttendanceMonth(${emp.id}, -1)" aria-label="Previous month">← Previous</button>
      <input id="employeeAttendanceMonth" class="search-input" type="month" value="${safeMonth}"
        onchange="renderEmployeeAttendanceCalendar(${emp.id}, this.value)" aria-label="Attendance month" />
      <button type="button" class="btn btn-sm btn-ghost" onclick="shiftEmployeeAttendanceMonth(${emp.id}, 1)" aria-label="Next month">Next →</button>
    </div>
    <div class="attendance-calendar-summary">
      <span class="attendance-summary-item is-present"><strong>${totals.present}</strong> Present</span>
      <span class="attendance-summary-item is-absent"><strong>${totals.absent}</strong> Absent</span>
      <span class="attendance-summary-item is-late"><strong>${totals.late}</strong> Late</span>
      <span class="attendance-summary-item is-unrecorded"><strong>${daysInMonth - records.length}</strong> No record</span>
    </div>
    <div class="attendance-calendar-weekdays" aria-hidden="true">
      ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => `<span>${day}</span>`).join('')}
    </div>
    <div class="attendance-calendar-grid">${dayCells.join('')}</div>
    <div class="attendance-calendar-legend">
      <span><i class="legend-dot is-present"></i>Present</span>
      <span><i class="legend-dot is-absent"></i>Absent</span>
      <span><i class="legend-dot is-late"></i>Late</span>
      <span><i class="legend-dot is-unrecorded"></i>No record</span>
    </div>`;
}

function renderEmployeeAttendanceCalendar(id, selectedMonth) {
  const emp = getEmployees().find(employee => String(employee.id) === String(id));
  const body = document.getElementById('modalBody');
  if (!emp || !body) return;
  body.innerHTML = employeeAttendanceCalendar(emp, selectedMonth);
}

function shiftEmployeeAttendanceMonth(id, direction) {
  const selectedMonth = document.getElementById('employeeAttendanceMonth')?.value || monthKey();
  const [year, month] = selectedMonth.split('-').map(Number);
  renderEmployeeAttendanceCalendar(id, monthKey(new Date(year, month - 1 + direction, 1)));
}

function viewEmployeeAttendance(id, selectedMonth = monthKey()) {
  const emp = getEmployees().find(employee => String(employee.id) === String(id));
  if (!emp) { toast('Employee not found', 'error'); return; }
  openModal(`${emp.name} — Attendance Calendar`, employeeAttendanceCalendar(emp, selectedMonth), closeModal, 'Close');
  document.getElementById('modal').classList.add('attendance-calendar-modal');
  document.getElementById('modalCancel').style.display = 'none';
}

function openDashboardAttendanceCalendar() {
  const emps = getEmployees();
  if (!emps.length) { toast('Add an employee before opening the calendar', 'error'); return; }
  const picker = `
    <div class="form-grid">
      <div class="form-group span-2">
        <label>Staff Member *</label>
        <select id="dashboard-calendar-employee">
          ${emps.map(emp => `<option value="${emp.id}">${escapeHTML(emp.name)} — ${escapeHTML(emp.department)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group span-2">
        <label>Month *</label>
        <input id="dashboard-calendar-month" type="month" value="${monthKey()}" />
      </div>
    </div>`;
  openModal('Staff Attendance Calendar', picker, () => {
    const empId = document.getElementById('dashboard-calendar-employee').value;
    const selectedMonth = document.getElementById('dashboard-calendar-month').value;
    if (!empId || !selectedMonth) { toast('Select a staff member and month', 'error'); return; }
    viewEmployeeAttendance(empId, selectedMonth);
  }, 'Open Calendar');
}

document.getElementById('dashboardCalendarBtn')?.addEventListener('click', openDashboardAttendanceCalendar);

// ============================================================
//  PAYROLL MODULE
// ============================================================
function getPayroll() { return DB.get('payroll'); }
function savePayroll(arr) { DB.set('payroll', arr); }

function hasPayrollRecord(empId, month, ignoreId = null) {
  return getPayroll().some(r =>
    String(r.empId) === String(empId) &&
    r.month === month &&
    String(r.id) !== String(ignoreId)
  );
}

// Count present+late days for an employee in a given YYYY-MM month
function calcAttendanceSalary(empId, month) {
  if (!empId || !month) return { presentDays: 0, calculatedBasic: 0 };
  const records = getAttendance();
  const presentDays = records.filter(r =>
    String(r.empId) === String(empId) &&
    r.date && r.date.startsWith(month) &&
    (r.status === 'present' || r.status === 'late')
  ).length;
  const emps = getEmployees();
  const emp = emps.find(e => String(e.id) === String(empId));
  const dailyRate = parseFloat(emp?.dailyRate || 0);
  const calculatedBasic = +(dailyRate * presentDays).toFixed(2);
  return { presentDays, calculatedBasic, dailyRate };
}

function populatePayrollMonths() {
  const sel = document.getElementById('payrollMonth');
  if (!sel) return;
  const now = new Date();
  const opts = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = d.toISOString().slice(0, 7);
    const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    opts.push(`<option value="${val}">${label}</option>`);
  }
  sel.innerHTML = '<option value="">All Months</option>' + opts.join('');
}

function payrollForm(p = {}) {
  const emps = getEmployees();
  const now = new Date();
  const defMonth = now.toISOString().slice(0, 7);
  // Pre-calc if editing existing record
  const preCalc = p.empId ? calcAttendanceSalary(p.empId, p.month || defMonth) : { presentDays: 0, calculatedBasic: 0, dailyRate: 0 };
  return `
  <div class="form-grid">
    <div class="form-group span-2">
      <label>Employee *</label>
      <select id="p-emp" onchange="refreshPayrollCalc()">
        <option value="">— Select —</option>
        ${emps.map(e => `<option value="${e.id}" ${p.empId == e.id ? 'selected' : ''}>${escapeHTML(e.name)} — ${escapeHTML(e.department)} (Rate: ${e.dailyRate !== '' && e.dailyRate != null ? currency(e.dailyRate) + '/day' : 'No rate set'})</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label>Month *</label>
      <input id="p-month" type="month" value="${p.month || defMonth}" onchange="refreshPayrollCalc()" />
    </div>
    <div class="form-group">
      <label>Status</label>
      <select id="p-status">
        <option value="unpaid" ${(!p.status || p.status === 'unpaid') ? 'selected' : ''}>Unpaid</option>
        <option value="paid" ${p.status === 'paid' ? 'selected' : ''}>Paid</option>
      </select>
    </div>
    <div class="form-group span-2">
      <div id="att-summary" style="background:var(--color-surface2);border:1px solid var(--color-border);border-radius:var(--radius-sm);padding:12px;font-size:13px;display:flex;align-items:center;justify-content:space-between;gap:12px">
        <span id="att-summary-text" style="color:var(--color-text-muted)">${p.empId ? `📅 <strong style="color:var(--color-text)">${preCalc.presentDays} days present</strong> × <strong style="color:var(--color-text)">${currency(preCalc.dailyRate)}/day</strong> = <strong style="color:var(--color-green)">${currency(preCalc.calculatedBasic)}</strong>` : 'Select an employee and month to auto-calculate from attendance.'}</span>
        <button type="button" class="btn btn-sm btn-primary" onclick="refreshPayrollCalc(true)">⚡ Auto Calculate</button>
      </div>
    </div>
    <div class="form-group">
      <label>Earned Salary ($) <span style="color:var(--color-text-muted);font-weight:400;text-transform:none">(from attendance)</span></label>
      <input id="p-basic" type="number" min="0" step="0.01" value="${p.basic || ''}" placeholder="Auto-calculated" />
    </div>
    <div class="form-group">
      <label>Allowances ($)</label>
      <input id="p-allow" type="number" min="0" value="${p.allowances || 0}" placeholder="500" />
    </div>
    <div class="form-group">
      <label>Deductions ($)</label>
      <input id="p-deduct" type="number" min="0" value="${p.deductions || 0}" placeholder="200" />
    </div>
    <div class="form-group">
      <label>Notes</label>
      <input id="p-notes" type="text" value="${escapeAttr(p.notes)}" placeholder="Optional notes" />
    </div>
  </div>`;
}

window.refreshPayrollCalc = function (fillBasic = false) {
  const empId = document.getElementById('p-emp')?.value;
  const month = document.getElementById('p-month')?.value;
  const summaryEl = document.getElementById('att-summary-text');
  if (!summaryEl) return;
  if (!empId || !month) {
    summaryEl.innerHTML = 'Select an employee and month to auto-calculate from attendance.';
    return;
  }
  const { presentDays, calculatedBasic, dailyRate } = calcAttendanceSalary(empId, month);
  summaryEl.innerHTML = `📅 <strong style="color:var(--color-text)">${presentDays} days present</strong> × <strong style="color:var(--color-text)">${currency(dailyRate)}/day</strong> = <strong style="color:var(--color-green)">${currency(calculatedBasic)}</strong>`;
  if (fillBasic) {
    const basicEl = document.getElementById('p-basic');
    if (basicEl) basicEl.value = calculatedBasic;
    toast(`Salary calculated: ${presentDays} days × ${currency(dailyRate)} = ${currency(calculatedBasic)}`);
  }
};

function renderPayroll() {
  const filterMonth = document.getElementById('payrollMonth')?.value || '';
  let records = getPayroll();
  const emps = getEmployees();
  records = records.filter(r => emps.some(e => String(e.id) === String(r.empId)));
  if (filterMonth) records = records.filter(r => r.month === filterMonth);

  const body = document.getElementById('payrollTableBody');
  const empty = document.getElementById('payrollEmpty');
  if (!body) return;

  if (!records.length) { body.innerHTML = ''; empty.style.display = 'flex'; return; }
  empty.style.display = 'none';

  body.innerHTML = records.map(r => {
    const emp = emps.find(e => e.id == r.empId);
    const net = (Number(r.basic) || 0) + (Number(r.allowances) || 0) - (Number(r.deductions) || 0);
    const monthLabel = r.month ? new Date(r.month + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '—';
    // Live attendance count for display
    const { presentDays } = calcAttendanceSalary(r.empId, r.month);
    return `<tr>
      <td><strong style="color:var(--color-text)">${emp?.name ? escapeHTML(emp.name) : 'Unknown'}</strong></td>
      <td>${emp?.department ? escapeHTML(emp.department) : '—'}</td>
      <td style="text-align:center">
        <span class="badge badge-present">${presentDays}d</span>
      </td>
      <td>${currency(r.basic)}</td>
      <td style="color:var(--color-green)">${currency(r.allowances)}</td>
      <td style="color:var(--color-red)">-${currency(r.deductions)}</td>
      <td><strong style="color:var(--color-text)">${currency(net)}</strong></td>
      <td>${monthLabel}</td>
      <td><span class="badge badge-${r.status || 'unpaid'}">${r.status || 'unpaid'}</span></td>
      <td><div class="actions">
        ${r.status !== 'paid' ? `<button class="btn btn-sm btn-success" onclick="markPaid(${r.id})">✓ Pay</button>` : ''}
        <button class="btn btn-sm btn-ghost" onclick="editPayroll(${r.id})">✏️</button>
        <button class="btn btn-sm btn-danger" onclick="deletePayroll(${r.id})">🗑️</button>
      </div></td>
    </tr>`;
  }).join('');
}

document.getElementById('addPayrollBtn')?.addEventListener('click', () => {
  openModal('Add Payroll Record', payrollForm(), () => {
    const empId = document.getElementById('p-emp').value;
    const basic = document.getElementById('p-basic').value;
    const month = document.getElementById('p-month').value;
    if (!empId) { toast('Select an employee', 'error'); return; }
    if (!month) { toast('Select a month', 'error'); return; }
    if (hasPayrollRecord(empId, month)) { toast('Payroll already exists for this employee and month', 'error'); return; }
    if (!basic) { toast('Enter basic salary', 'error'); return; }
    if (Number(basic) < 0) { toast('Enter a valid salary', 'error'); return; }
    const records = getPayroll();
    records.push({
      id: uid(), empId,
      month,
      status: document.getElementById('p-status').value,
      basic, allowances: document.getElementById('p-allow').value,
      deductions: document.getElementById('p-deduct').value,
      notes: document.getElementById('p-notes').value
    });
    savePayroll(records); closeModal(); renderPayroll();
    toast('Payroll record added');
  });
});

function editPayroll(id) {
  const records = getPayroll();
  const rec = records.find(r => r.id === id);
  if (!rec) return;
  openModal('Edit Payroll Record', payrollForm(rec), () => {
    const empId = document.getElementById('p-emp').value;
    const month = document.getElementById('p-month').value;
    const basic = document.getElementById('p-basic').value;
    if (!empId) { toast('Select an employee', 'error'); return; }
    if (!month) { toast('Select a month', 'error'); return; }
    if (!basic || Number(basic) < 0) { toast('Enter a valid salary', 'error'); return; }
    if (hasPayrollRecord(empId, month, id)) { toast('Payroll already exists for this employee and month', 'error'); return; }
    Object.assign(rec, {
      empId, month,
      status: document.getElementById('p-status').value,
      basic,
      allowances: document.getElementById('p-allow').value,
      deductions: document.getElementById('p-deduct').value,
      notes: document.getElementById('p-notes').value
    });
    savePayroll(records); closeModal(); renderPayroll();
    toast('Payroll updated');
  });
}

function markPaid(id) {
  const records = getPayroll();
  const rec = records.find(r => String(r.id) === String(id));
  if (rec) { rec.status = 'paid'; savePayroll(records); renderPayroll(); toast('Marked as paid'); }
}

function deletePayroll(id) {
  confirmDialog('Delete this payroll record?', () => {
    savePayroll(getPayroll().filter(r => String(r.id) !== String(id)));
    renderPayroll(); toast('Record deleted');
  });
}

document.getElementById('payrollMonth')?.addEventListener('change', renderPayroll);


// ============================================================
//  PERFORMANCE MODULE
// ============================================================
function getPerformance() { return DB.get('performance'); }
function savePerformance(arr) { DB.set('performance', arr); }

function perfForm(p = {}) {
  const emps = getEmployees();
  const periods = ['Q1 2025', 'Q2 2025', 'Q3 2025', 'Q4 2025', 'Q1 2026', 'Q2 2026', 'Annual 2025', 'Annual 2026'];
  return `
  <div class="form-grid">
    <div class="form-group span-2">
      <label>Employee *</label>
      <select id="pr-emp">
        <option value="">— Select —</option>
        ${emps.map(e => `<option value="${e.id}" ${p.empId == e.id ? 'selected' : ''}>${escapeHTML(e.name)}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label>Reviewer Name</label>
      <input id="pr-reviewer" type="text" value="${escapeAttr(p.reviewer)}" placeholder="Manager name" />
    </div>
    <div class="form-group">
      <label>Period</label>
      <select id="pr-period">
        ${periods.map(pr => `<option ${p.period === pr ? 'selected' : ''}>${pr}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label>Rating (1–5)</label>
      <select id="pr-rating">
        ${[1, 2, 3, 4, 5].map(n => `<option value="${n}" ${p.rating == n ? 'selected' : ''}>${n} — ${{ 1: 'Poor', 2: 'Below Average', 3: 'Average', 4: 'Good', 5: 'Excellent' }[n]}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label>Date</label>
      <input id="pr-date" type="date" value="${p.date || today()}" />
    </div>
    <div class="form-group span-2">
      <label>Goals Achieved</label>
      <textarea id="pr-goals" placeholder="List of goals achieved...">${escapeHTML(p.goals)}</textarea>
    </div>
    <div class="form-group span-2">
      <label>Comments / Feedback</label>
      <textarea id="pr-comments" placeholder="Performance comments...">${escapeHTML(p.comments)}</textarea>
    </div>
  </div>`;
}

function renderPerformance() {
  const q = document.getElementById('perfSearch')?.value?.toLowerCase() || '';
  const emps = getEmployees();
  let records = getPerformance();
  records = records.filter(r => emps.some(e => String(e.id) === String(r.empId)));
  if (q) {
    records = records.filter(r => {
      const emp = emps.find(e => e.id == r.empId);
      return emp?.name?.toLowerCase().includes(q) || r.reviewer?.toLowerCase().includes(q);
    });
  }

  const body = document.getElementById('perfTableBody');
  const empty = document.getElementById('perfEmpty');
  if (!body) return;

  if (!records.length) { body.innerHTML = ''; empty.style.display = 'flex'; return; }
  empty.style.display = 'none';

  body.innerHTML = records.map(r => {
    const emp = emps.find(e => e.id == r.empId);
    return `<tr>
      <td><strong style="color:var(--color-text)">${emp?.name ? escapeHTML(emp.name) : 'Unknown'}</strong></td>
      <td>${r.reviewer ? escapeHTML(r.reviewer) : '—'}</td>
      <td>${escapeHTML(r.period)}</td>
      <td>${stars(r.rating)}</td>
      <td style="max-width:140px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r.goals ? escapeHTML(r.goals) : '—'}</td>
      <td style="max-width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r.comments ? escapeHTML(r.comments) : '—'}</td>
      <td>${fmt(r.date)}</td>
      <td><div class="actions">
        <button class="btn btn-sm btn-ghost" onclick="editPerf(${r.id})">✏️</button>
        <button class="btn btn-sm btn-danger" onclick="deletePerf(${r.id})">🗑️</button>
      </div></td>
    </tr>`;
  }).join('');
}

document.getElementById('addPerfBtn')?.addEventListener('click', () => {
  openModal('Add Performance Review', perfForm(), () => {
    const empId = document.getElementById('pr-emp').value;
    if (!empId) { toast('Select an employee', 'error'); return; }
    const records = getPerformance();
    records.push({
      id: uid(), empId,
      reviewer: document.getElementById('pr-reviewer').value,
      period: document.getElementById('pr-period').value,
      rating: document.getElementById('pr-rating').value,
      date: document.getElementById('pr-date').value,
      goals: document.getElementById('pr-goals').value,
      comments: document.getElementById('pr-comments').value
    });
    savePerformance(records); closeModal(); renderPerformance();
    toast('Performance review added');
  });
});

function editPerf(id) {
  const records = getPerformance();
  const rec = records.find(r => r.id === id);
  if (!rec) return;
  openModal('Edit Performance Review', perfForm(rec), () => {
    const empId = document.getElementById('pr-emp').value;
    if (!empId) { toast('Select an employee', 'error'); return; }
    Object.assign(rec, {
      empId, reviewer: document.getElementById('pr-reviewer').value,
      period: document.getElementById('pr-period').value,
      rating: document.getElementById('pr-rating').value,
      date: document.getElementById('pr-date').value,
      goals: document.getElementById('pr-goals').value,
      comments: document.getElementById('pr-comments').value
    });
    savePerformance(records); closeModal(); renderPerformance();
    toast('Review updated');
  });
}

function deletePerf(id) {
  confirmDialog('Delete this performance review?', () => {
    savePerformance(getPerformance().filter(r => String(r.id) !== String(id)));
    renderPerformance(); toast('Review deleted');
  });
}

document.getElementById('perfSearch')?.addEventListener('input', renderPerformance);

// ============================================================
//  DASHBOARD
// ============================================================
function updateDashboard() {
  const emps = getEmployees();
  const employeeIds = new Set(emps.map(e => String(e.id)));
  const attendance = getAttendance().filter(a => employeeIds.has(String(a.empId)));
  const todayStr = today();

  // Stats
  document.getElementById('stat-employees').textContent = emps.length;

  const presentToday = attendance.filter(a => a.date === todayStr && a.status === 'present').length;
  document.getElementById('stat-present').textContent = presentToday;

  // Recent employees
  const recentEmps = [...emps].sort((a, b) => b.id - a.id).slice(0, 5);
  const recentEl = document.getElementById('recentEmployees');
  if (recentEl) {
    recentEl.innerHTML = recentEmps.length ? recentEmps.map(e => `
      <div class="list-item">
        <div class="avatar">${initials(e.name)}</div>
        <div class="list-info">
          <div class="list-name">${escapeHTML(e.name)}</div>
          <div class="list-sub">${escapeHTML(e.role)} · ${escapeHTML(e.department)}</div>
        </div>
        <button class="btn btn-sm btn-ghost" onclick="viewEmployeeAttendance(${e.id})">📅 Calendar</button>
        <span class="badge badge-${e.status || 'active'}">${e.status || 'active'}</span>
      </div>`).join('') : '<div class="empty-state" style="padding:30px"><div class="empty-icon">👥</div><p>No employees</p></div>';
  }

  // Today's attendance — compact dashboard preview (maximum four staff).
  const todayRecords = attendance.filter(a => a.date === todayStr).slice(0, 4);
  const todayEl = document.getElementById('todayAttendance');
  if (todayEl) {
    todayEl.innerHTML = todayRecords.length ? todayRecords.map(a => {
      const emp = emps.find(e => String(e.id) === String(a.empId));
      return `<div class="list-item">
        <div class="avatar">${initials(emp?.name || '?')}</div>
        <div class="list-info">
          <div class="list-name">${emp?.name ? escapeHTML(emp.name) : 'Unknown'}</div>
          <div class="list-sub">${fmt(a.date)}${a.checkIn ? ` · In ${escapeHTML(a.checkIn)}` : ''}${a.checkOut ? ` · Out ${escapeHTML(a.checkOut)}` : ''}</div>
        </div>
        <span class="badge badge-${a.status}">${escapeHTML(a.status)}</span>
      </div>`;
    }).join('') : '<div class="empty-state" style="padding:30px"><div class="empty-icon">📅</div><p>No attendance marked today</p></div>';
  }
}
// ============================================================
//  RENDERERS MAP
// ============================================================
const renders = {
  dashboard: updateDashboard,
  employees: renderEmployees,
  attendance: renderAttendance,
  payroll: renderPayroll,
  performance: renderPerformance
};


// ============================================================
//  AUTH / STORAGE PERMISSION
// ============================================================
function getAuthOverlay() {
  let overlay = document.getElementById('authOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'authOverlay';
    overlay.className = 'auth-overlay';
    document.body.appendChild(overlay);
  }
  return overlay;
}

function showAuthGate(message = '') {
  document.body.classList.add('auth-locked');
  storagePermissionGranted = false;
  currentAccount = null;
  accountStore = null;
  renderLoginStep(message);
}

function renderLoginStep(error = '') {
  const overlay = getAuthOverlay();
  overlay.innerHTML = `
    <div class="auth-card">
      <div class="auth-icon">⚡</div>
      <h1>Sign in to StaffHub</h1>
      <p class="auth-subtitle">Use the authorized Google account to access staff records on this device.</p>
      ${error ? `<div class="auth-error">${escapeHTML(error)}</div>` : ''}
      <button type="button" class="btn google-signin-btn" id="googleSignInBtn">
        <span class="google-mark">G</span> Continue with Google
      </button>
      <div class="auth-hint">StaffHub asks you to sign in each time the page opens.</div>
    </div>`;

  document.getElementById('googleSignInBtn').addEventListener('click', async event => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = 'Opening Google…';
    try {
      await window.StaffHubAuth.signIn();
    } catch (signInError) {
      const message = signInError?.code === 'auth/popup-closed-by-user'
        ? 'Google sign-in was closed before it finished.'
        : 'Google sign-in could not be completed. Please try again.';
      renderLoginStep(message);
    }
  });
}

function isAuthorizedAccount(user) {
  const access = window.STAFFHUB_ACCESS || {};
  const email = String(user?.email || '').toLowerCase();
  const allowedEmails = (access.allowedEmails || []).map(value => String(value).toLowerCase());
  return Boolean(user?.emailVerified && (access.allowAllGoogleAccounts || allowedEmails.includes(email)));
}

function renderAccountSummary() {
  const photo = currentAccount.photoURL
    ? `<img src="${escapeAttr(currentAccount.photoURL)}" alt="" referrerpolicy="no-referrer" />`
    : `<div class="avatar-sm">${escapeHTML(initials(currentAccount.displayName || currentAccount.email))}</div>`;
  return `<div class="auth-account">
    ${photo}
    <div>
      <strong>${escapeHTML(currentAccount.displayName || 'Google account')}</strong>
      <div class="auth-account-email">${escapeHTML(currentAccount.email)}</div>
    </div>
  </div>`;
}

function renderStoragePermissionStep(error = '') {
  const overlay = getAuthOverlay();
  overlay.innerHTML = `
    <div class="auth-card">
      <div class="auth-icon">💾</div>
      <h1>Storage Permission</h1>
      ${renderAccountSummary()}
      <p class="auth-subtitle">Allow StaffHub to save employees, attendance, payroll, and performance records in this browser.</p>
      <p class="auth-subtitle">If you do not allow permission, the app will stay locked and no records will load.</p>
      ${error ? `<div class="auth-error">${error}</div>` : ''}
      ${accountStore.hasLegacyData() ? `<label class="legacy-import">
        <input type="checkbox" id="importLegacyRecords" checked />
        Copy existing StaffHub records into this Google account. The old copy will remain as a backup.
      </label>` : ''}
      <div class="auth-actions">
        <button type="button" class="btn btn-primary" id="allowStorageBtn">Allow Permission</button>
        <button type="button" class="btn btn-ghost" id="denyStorageBtn">Deny</button>
      </div>
    </div>`;

  document.getElementById('allowStorageBtn').addEventListener('click', () => {
    if (!enableStoragePermission()) {
      renderStoragePermissionStep('Browser storage is unavailable or blocked.');
      return;
    }
    if (document.getElementById('importLegacyRecords')?.checked) {
      try {
        accountStore.importLegacy();
      } catch (importError) {
        renderStoragePermissionStep(importError.message);
        return;
      }
    }
    unlockApp();
  });

  document.getElementById('denyStorageBtn').addEventListener('click', () => {
    renderStorageDeniedStep();
  });
}

function renderStorageDeniedStep() {
  const overlay = getAuthOverlay();
  overlay.innerHTML = `
    <div class="auth-card">
      <div class="auth-icon">🔒</div>
      <h1>Storage Required</h1>
      <p class="auth-subtitle">Storage permission is required before StaffHub can load or save records.</p>
      <div class="auth-actions">
        <button type="button" class="btn btn-primary" id="retryStorageBtn">Choose Again</button>
        <button type="button" class="btn btn-ghost" id="backLoginBtn">Sign out</button>
      </div>
    </div>`;

  document.getElementById('retryStorageBtn').addEventListener('click', renderStoragePermissionStep);
  document.getElementById('backLoginBtn').addEventListener('click', () => window.StaffHubAuth.signOut());
}

function enableStoragePermission() {
  try {
    localStorage.setItem('__staffhub_storage_test__', '1');
    localStorage.removeItem('__staffhub_storage_test__');
    storagePermissionGranted = true;
    return true;
  } catch {
    storagePermissionGranted = false;
    return false;
  }
}

function unlockApp() {
  document.getElementById('authOverlay')?.remove();
  document.body.classList.remove('auth-locked');
  document.getElementById('accountName').textContent = currentAccount.displayName || currentAccount.email;
  init();
}

// ============================================================
//  INIT
// ============================================================
function init() {
  // Date in topbar
  const now = new Date();
  document.getElementById('topbarDate').textContent = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  // Set attendance date default
  const attD = document.getElementById('attDate');
  if (attD) { attD.value = today(); attD.max = today(); }

  // Populate payroll months
  populatePayrollMonths();

  // Render dashboard
  navigate('dashboard');
}

// ============================================================
//  FRESH START
// ============================================================
// StaffHub starts with empty records. Demo/example data is not bundled or created.

// ============================================================
//  START
// ============================================================
async function handleAuthState(user) {
  if (!user) {
    showAuthGate(pendingAuthMessage);
    pendingAuthMessage = '';
    return;
  }
  if (!isAuthorizedAccount(user)) {
    const rejectedEmail = user.email || 'that Google account';
    pendingAuthMessage = `${rejectedEmail} is not authorized to use this StaffHub.`;
    await window.StaffHubAuth.signOut();
    return;
  }
  currentAccount = {
    uid: user.uid,
    email: user.email,
    emailVerified: user.emailVerified,
    displayName: user.displayName,
    photoURL: user.photoURL
  };
  accountStore = window.createAccountStore(
    localStorage,
    () => currentAccount,
    window.STAFFHUB_ACCESS?.legacyOwnerEmail
  );
  renderStoragePermissionStep();
}

document.getElementById('signOutBtn').addEventListener('click', async () => {
  document.body.classList.add('auth-locked');
  await window.StaffHubAuth.signOut();
});

window.addEventListener('DOMContentLoaded', () => {
  showAuthGate('Loading secure Google sign-in…');
  window.StaffHubAuth.initialize(handleAuthState).catch(error => {
    showAuthGate(error.message || 'Google sign-in could not be loaded.');
  });
});

