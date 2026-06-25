// Chart.js is loaded via CDN — declare as global
declare const Chart: any;

type ProjectStatus = '初回訪問済' | '現地調査済' | '商談中' | '見積提出済' | '契約済' | '完了' | '失注';
type WorkType = '外装' | '内装' | '水回り' | '省エネ' | '建具' | 'バリアフリー';
type BuildingType = '一戸建て' | 'マンション' | 'アパート' | 'その他';
type PaymentStatus = '入金済' | '未入金';
type BillingType = '一括' | '分割';

interface Project {
  id: number; name: string; customer_name: string;
  address: string | null; work_type: WorkType | null; staff: string | null;
  status: ProjectStatus; probability: string | null;
  estimate_amount: number | null; first_visit: string | null;
  scheduled_start: string | null; contract_date: string | null;
  contract_amount: number | null; note: string | null;
}
interface Customer {
  id: number; name: string; address: string | null;
  building_type: BuildingType | null; age_years: number | null;
  phone: string | null; email: string | null; source: string | null;
  staff: string | null; note: string | null;
}
interface Employee {
  id: number; name: string; department: string | null;
  role: string | null; qualification: string | null;
  extension: string | null; mobile: string | null; email: string | null;
  active?: number; in_progress?: number; negotiating?: number;
  early?: number; lost?: number;
}
interface Invoice {
  id: number; invoice_no: string; project_name: string;
  customer_name: string; billing_type: BillingType | null;
  billing_date: string | null; amount: number;
  due_date: string | null; payment_status: PaymentStatus;
  payment_date: string | null; note: string | null;
}
interface SummaryData {
  contracted_count: number; contracted_total: number;
  pipeline_count: number; pipeline_total: number;
  lost_count: number; total_projects: number;
  paid_amount: number; unpaid_amount: number;
}
interface StaffPerformance {
  staff: string; total: number; contracted: number; revenue: number;
}

// ─── Helper utilities ─────────────────────────────────────────────────────────
function getInput(id: string): HTMLInputElement {
  return document.getElementById(id) as HTMLInputElement;
}

const getEl = (id: string): HTMLElement => document.getElementById(id)!;

// ─── Module-level state ───────────────────────────────────────────────────────
let allProjects: Project[] = [];
let allCustomers: Customer[] = [];
let allInvoices: Invoice[] = [];
let allEmployees: Employee[] = [];
const loaded: Record<string, boolean> = {};
let modalProjectId: number | null = null;
let modalCurrentStaff: string = '';
let chartStatusInst: any = null;
let chartTypeInst: any = null;
let chartMonthlyInst: any = null;

// ─── Constants ────────────────────────────────────────────────────────────────
const STATUS_COLOR: Record<string, { cls: string }> = {
  '契約済':    { cls: 'badge-green' },
  '見積提出済': { cls: 'badge-blue' },
  '商談中':    { cls: 'badge-yellow' },
  '現地調査済': { cls: 'badge-orange' },
  '初回訪問済': { cls: 'badge-purple' },
  '失注':      { cls: 'badge-gray' },
};
const TYPE_COLORS = ['#c0392b','#2980b9','#27ae60','#e67e22','#8e44ad','#16a085','#d35400','#2c3e50'];

// ─── Utility functions ────────────────────────────────────────────────────────
function fmt(n: number | null | undefined | string): string {
  if (n === null || n === undefined || n === '') return '—';
  if (n === 0) return '0円';
  const num = Number(n);
  if (num >= 100000000) return (num/100000000).toFixed(1) + '億円';
  if (num >= 10000) return Math.round(num/10000).toLocaleString() + '万円';
  return num.toLocaleString() + '円';
}

function badge(status: string): string {
  const s = STATUS_COLOR[status] || { cls: 'badge-gray' };
  return `<span class="badge ${s.cls}">${html(status)}</span>`;
}

function esc(str: string | null | undefined): string {
  return (str||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
}

function html(str: string | null | undefined): string {
  return (str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function populateDatalist(datalistId: string, values: (string | null | undefined)[]): void {
  const dl = document.getElementById(datalistId);
  if (!dl) return;
  const seen = new Set<string>();
  const opts: HTMLOptionElement[] = [];
  values.forEach(v => {
    if (v == null || v === '' || seen.has(v)) return;
    seen.add(v);
    const o = document.createElement('option');
    o.value = v;
    opts.push(o);
  });
  dl.replaceChildren(...opts);
}

function toInputDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const parts = String(dateStr).split('/');
  if (parts.length === 3) {
    return parts[0] + '-' + parts[1].padStart(2,'0') + '-' + parts[2].substring(0,2).padStart(2,'0');
  }
  return String(dateStr).replace(/\//g, '-').substring(0, 10);
}

// ─── Sidebar toggle ────────────────────────────────────────────────────────────
const sidebar = getEl('sidebar');
const overlay = getEl('overlay');
const sidebarToggle = getEl('sidebar-toggle');

function openSidebar(): void {
  sidebar.classList.add('expanded');
  overlay.classList.add('show');
}
function closeSidebar(): void {
  sidebar.classList.remove('expanded');
  overlay.classList.remove('show');
}

sidebarToggle.addEventListener('click', () => {
  if (window.innerWidth > 1100) {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelector('[data-page="dashboard"]')!.classList.add('active');
    getEl('page-dashboard').classList.add('active');
    loadPage('dashboard');
  } else {
    sidebar.classList.contains('expanded') ? closeSidebar() : openSidebar();
  }
});
overlay.addEventListener('click', closeSidebar);
getEl('hamburger').addEventListener('click', openSidebar);

// ─── Navigation ───────────────────────────────────────────────────────────────
document.querySelectorAll('.nav-item').forEach(el => {
  el.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    el.classList.add('active');
    getEl('page-' + (el as HTMLElement).dataset['page']).classList.add('active');
    loadPage((el as HTMLElement).dataset['page']!);
    closeSidebar();
  });
});

function loadPage(page: string): void {
  if (loaded[page]) return;
  loaded[page] = true;
  if (page === 'dashboard') loadDashboard();
  else if (page === 'projects') loadProjects();
  else if (page === 'invoices') loadInvoices();
  else if (page === 'customers') loadCustomers();
  else if (page === 'employees') loadEmployees();
  else if (page === 'staff') loadStaff();
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
async function loadDashboard(): Promise<void> {
  let summary: SummaryData, byStatus: any[], byType: any[], monthly: any[], projects: Project[];
  try {
    [summary, byStatus, byType, monthly, projects] = await Promise.all([
      fetch('/api/summary').then(r=>r.json()),
      fetch('/api/projects/by-status').then(r=>r.json()),
      fetch('/api/projects/by-type').then(r=>r.json()),
      fetch('/api/projects/monthly').then(r=>r.json()),
      fetch('/api/projects?status=契約済').then(r=>r.json()),
    ]);
  } catch(err) {
    showToast('ダッシュボードデータの取得に失敗しました', 'error');
    return;
  }

  getEl('kpi-contracted').textContent = fmt(summary.contracted_total);
  getEl('kpi-contracted-count').textContent = `${summary.contracted_count}件 受注済み`;
  getEl('kpi-pipeline').textContent = fmt(summary.pipeline_total);
  getEl('kpi-pipeline-count').textContent = `${summary.pipeline_count}件 商談中・検討中`;
  getEl('kpi-paid').textContent = fmt(summary.paid_amount);
  getEl('kpi-unpaid').textContent = `未入金 ${fmt(summary.unpaid_amount)}`;
  getEl('kpi-total').textContent = `${summary.total_projects}件`;
  getEl('kpi-lost').textContent = `失注 ${summary.lost_count}件`;

  if (chartStatusInst) chartStatusInst.destroy();
  chartStatusInst = new Chart(getEl('chartStatus'), {
    type: 'doughnut',
    data: {
      labels: byStatus.map((r: any) => r.status),
      datasets: [{ data: byStatus.map((r: any) => r.count), backgroundColor: TYPE_COLORS, borderWidth: 2, borderColor: '#fff' }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'right', labels: { font: { size: 12 }, padding: 12 } } }
    }
  });

  if (chartTypeInst) chartTypeInst.destroy();
  chartTypeInst = new Chart(getEl('chartType'), {
    type: 'bar',
    data: {
      labels: byType.map((r: any) => r.work_type),
      datasets: [{
        label: '金額（万円）',
        data: byType.map((r: any) => Math.round(r.total/10000)),
        backgroundColor: TYPE_COLORS,
        borderRadius: 6,
      }]
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { ticks: { callback: (v: any) => v+'万' } } }
    }
  });

  if (chartMonthlyInst) chartMonthlyInst.destroy();
  chartMonthlyInst = new Chart(getEl('chartMonthly'), {
    type: 'bar',
    data: {
      labels: monthly.map((r: any) => r.month),
      datasets: [{
        label: '受注金額（万円）',
        data: monthly.map((r: any) => Math.round(r.total/10000)),
        backgroundColor: '#c0392b',
        borderRadius: 8,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { ticks: { callback: (v: any) => v+'万' } } }
    }
  });

  const tbody = document.querySelector('#tbl-recent tbody')!;
  tbody.innerHTML = '';
  projects.slice(0, 10).forEach(p => {
    tbody.insertAdjacentHTML('beforeend', `<tr>
      <td>${html(p.name)}</td>
      <td>${html(p.customer_name)}</td>
      <td>${html(p.work_type||'—')}</td>
      <td>${html(p.staff || '—')}</td>
      <td>${html(p.scheduled_start || '—')}</td>
      <td class="amount positive">${fmt(p.contract_amount)}</td>
    </tr>`);
  });
}

// Lightweight KPI-only refresh: re-fetch /api/summary and update the 4 dashboard
// KPI cards without re-rendering charts or the recent-projects table. Used after
// CRUD so the dashboard reflects fresh figures even before a full re-load.
async function refreshDashboardKPIs(): Promise<void> {
  let summary: SummaryData;
  try {
    summary = await fetch('/api/summary').then(r => r.json());
  } catch(err) { return; }
  getEl('kpi-contracted').textContent = fmt(summary.contracted_total);
  getEl('kpi-contracted-count').textContent = `${summary.contracted_count}件 受注済み`;
  getEl('kpi-pipeline').textContent = fmt(summary.pipeline_total);
  getEl('kpi-pipeline-count').textContent = `${summary.pipeline_count}件 商談中・検討中`;
  getEl('kpi-paid').textContent = fmt(summary.paid_amount);
  getEl('kpi-unpaid').textContent = `未入金 ${fmt(summary.unpaid_amount)}`;
  getEl('kpi-total').textContent = `${summary.total_projects}件`;
  getEl('kpi-lost').textContent = `失注 ${summary.lost_count}件`;
}

// ─── Projects ─────────────────────────────────────────────────────────────────
async function loadProjects(): Promise<void> {
  try {
    allProjects = await fetch('/api/projects').then(r=>r.json());
  } catch(err) {
    showToast('案件データの取得に失敗しました', 'error');
    return;
  }
  renderProjects();
  populateDatalist('workTypeList', allProjects.map(p => p.work_type));

  document.querySelectorAll('#prj-filter .filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#prj-filter .filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderProjects();
    });
  });

  getEl('prj-search').addEventListener('input', renderProjects);
}

function renderProjects(): void {
  const status = (document.querySelector('#prj-filter .filter-btn.active') as HTMLElement | null)?.dataset['val'] || '';
  const q = getInput('prj-search').value.toLowerCase();
  const filtered = allProjects.filter(p =>
    (!status || p.status === status) &&
    (!q || p.name.toLowerCase().includes(q) || p.customer_name.toLowerCase().includes(q))
  );
  const tbody = document.querySelector('#tbl-projects tbody')!;
  tbody.innerHTML = '';
  filtered.forEach(p => {
    const staffHtml = `<span class="staff-btn" onclick="openStaffModal(${p.id},'${esc(p.name)}','${esc(p.staff||'')}')">
      ${p.staff ? html(p.staff) : '<span class="no-staff">未割当</span>'}
      <span class="pencil">✏</span>
    </span>`;
    tbody.insertAdjacentHTML('beforeend', `<tr>
      <td>${html(p.name)}</td>
      <td>${html(p.customer_name)}</td>
      <td>${html(p.work_type||'—')}</td>
      <td>${staffHtml}</td>
      <td>${badge(p.status)}</td>
      <td>${html(p.probability || '—')}</td>
      <td class="amount">${fmt(p.estimate_amount)}</td>
      <td class="amount positive">${p.contract_amount ? fmt(p.contract_amount) : '—'}</td>
      <td>${html(p.contract_date || '—')}</td>
      <td><div class="action-cell">
        <button class="action-btn" onclick="openProjectModal(${p.id})">✏ 編集</button>
        <button class="action-btn del" onclick="deleteProject(${p.id},'${esc(p.name)}')">🗑</button>
      </div></td>
    </tr>`);
  });
}

// ─── Invoices ─────────────────────────────────────────────────────────────────
async function loadInvoices(): Promise<void> {
  try {
    allInvoices = await fetch('/api/invoices').then(r=>r.json());
  } catch(err) {
    showToast('請求データの取得に失敗しました', 'error');
    return;
  }
  updateInvoiceKPIs();
  renderInvoices();

  document.querySelectorAll('#inv-filter .filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#inv-filter .filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderInvoices();
    });
  });
}

function updateInvoiceKPIs(): void {
  const paid = allInvoices.filter(i => i.payment_status === '入金済').reduce((s,i)=>s+(i.amount||0),0);
  const unpaid = allInvoices.filter(i => i.payment_status !== '入金済').reduce((s,i)=>s+(i.amount||0),0);
  getEl('inv-paid').textContent = fmt(paid);
  getEl('inv-unpaid').textContent = fmt(unpaid);
  getEl('inv-count').textContent = allInvoices.length + '件';
}

function renderInvoices(): void {
  const status = (document.querySelector('#inv-filter .filter-btn.active') as HTMLElement | null)?.dataset['val'] || '';
  const filtered = allInvoices.filter(i => !status || i.payment_status === status);
  const tbody = document.querySelector('#tbl-invoices tbody')!;
  tbody.innerHTML = '';
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:#999;padding:32px">該当するデータがありません</td></tr>';
    return;
  }
  filtered.forEach(i => {
    const paid = i.payment_status === '入金済';
    tbody.insertAdjacentHTML('beforeend', `<tr>
      <td>${html(i.invoice_no||'—')}</td>
      <td>${html(i.project_name||'—')}</td>
      <td>${html(i.customer_name||'—')}</td>
      <td>${html(i.billing_type||'—')}</td>
      <td>${html(i.billing_date || '—')}</td>
      <td class="amount">${fmt(i.amount)}</td>
      <td>${html(i.due_date || '—')}</td>
      <td>${paid
        ? '<span class="badge badge-green">入金済</span>'
        : '<span class="badge badge-red">'+html(i.payment_status)+'</span>'}</td>
      <td>${html(i.payment_date || '—')}</td>
      <td><div class="action-cell">
        <button class="action-btn" onclick="openInvoiceModal(${i.id})">✏ 編集</button>
        <button class="action-btn del" onclick="deleteInvoice(${i.id},'${esc(i.invoice_no||'')}')">🗑</button>
      </div></td>
    </tr>`);
  });
}

// ─── Customers ────────────────────────────────────────────────────────────────
async function loadCustomers(): Promise<void> {
  try {
    allCustomers = await fetch('/api/customers').then(r=>r.json());
  } catch(err) {
    showToast('顧客データの取得に失敗しました', 'error');
    return;
  }
  renderCustomers();
  populateDatalist('sourceList', allCustomers.map(c => c.source));
  getEl('cus-search').addEventListener('input', renderCustomers);
}

function renderCustomers(): void {
  const q = getInput('cus-search').value.toLowerCase();
  const filtered = allCustomers.filter(c =>
    !q || c.name.toLowerCase().includes(q) || (c.address||'').toLowerCase().includes(q)
  );
  const tbody = document.querySelector('#tbl-customers tbody')!;
  tbody.innerHTML = '';
  filtered.forEach(c => {
    tbody.insertAdjacentHTML('beforeend', `<tr>
      <td>${html(c.name)}</td><td>${html(c.address||'—')}</td><td>${html(c.building_type||'—')}</td>
      <td>${c.age_years != null ? c.age_years+'年' : '—'}</td>
      <td>${html(c.phone||'—')}</td><td>${html(c.source||'—')}</td><td>${html(c.staff||'—')}</td>
      <td><div class="action-cell">
        <button class="action-btn" onclick="openCustomerModal(${c.id})">✏ 編集</button>
        <button class="action-btn del" onclick="deleteCustomer(${c.id},'${esc(c.name)}')">🗑</button>
      </div></td>
    </tr>`);
  });
}

// ─── Staff ────────────────────────────────────────────────────────────────────
async function loadStaff(): Promise<void> {
  let rows: StaffPerformance[];
  try {
    rows = await fetch('/api/staff/performance').then(r=>r.json());
  } catch(err) {
    showToast('担当者実績の取得に失敗しました', 'error');
    return;
  }
  const maxRevenue = rows[0]?.revenue || 1;
  const tbody = document.querySelector('#tbl-staff tbody')!;
  tbody.innerHTML = '';
  const totalRevenue = rows.reduce((s,r)=>s+r.revenue,0);
  rows.forEach((r, i) => {
    const rate = r.total > 0 ? Math.round(r.contracted/r.total*100) : 0;
    const share = totalRevenue > 0 ? Math.round(r.revenue/totalRevenue*100) : 0;
    const pct = maxRevenue > 0 ? Math.round(r.revenue/maxRevenue*100) : 0;
    tbody.insertAdjacentHTML('beforeend', `<tr>
      <td><span class="rank${i<3?' top':''}">${i+1}</span></td>
      <td><strong>${r.staff}</strong></td>
      <td>${r.total}件</td>
      <td>${r.contracted}件</td>
      <td>${rate}%</td>
      <td class="amount positive">${fmt(r.revenue)}</td>
      <td style="min-width:120px">
        ${share}%
        <div class="progress"><div class="progress-fill" style="width:${pct}%"></div></div>
      </td>
    </tr>`);
  });
}

// ─── Staff Assignment Modal ───────────────────────────────────────────────────
const staffModal  = getEl('staffModal');
const modalClose  = getEl('modalClose');
const staffSearchInp = getInput('staffSearchInp');
const staffOptions   = getEl('staffOptions');

const AVATAR_COLORS = ['#c0392b','#2980b9','#27ae60','#e67e22','#8e44ad','#16a085','#d35400','#2c3e50'];
function avatarColor(name: string): string {
  let h = 0;
  for (const c of name) h = (h*31 + c.charCodeAt(0)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[h];
}

async function openStaffModal(projectId: number, projectName: string, currentStaff: string): Promise<void> {
  modalProjectId    = projectId;
  modalCurrentStaff = currentStaff;
  getEl('modalProjectName').textContent = projectName;
  staffSearchInp.value = '';

  if (!allEmployees.length) {
    allEmployees = await fetch('/api/employees').then(r => r.json());
  }
  renderStaffOptions('');
  staffModal.classList.add('open');
  document.body.style.overflow = 'hidden';
  staffSearchInp.focus();
}

function renderStaffOptions(q: string): void {
  const filtered = allEmployees.filter(e =>
    !q || e.name.includes(q) || e.name.split(' ')[0].includes(q)
  );
  staffOptions.innerHTML = '';

  const noneDiv = document.createElement('div');
  noneDiv.className = 'staff-opt none-opt' + (modalCurrentStaff === '' ? ' current' : '');
  noneDiv.innerHTML = `
    <div class="staff-opt-avatar" style="background:#bdc3c7">—</div>
    <div><div class="staff-opt-name">未割当</div><div class="staff-opt-sub">担当者を外す</div></div>
    ${modalCurrentStaff === '' ? '<span class="staff-opt-check">✓</span>' : ''}
  `;
  noneDiv.addEventListener('click', () => saveStaff(''));
  staffOptions.appendChild(noneDiv);

  filtered.forEach(e => {
    const surname = e.name.split(' ')[0];
    const isCurrent = surname === modalCurrentStaff;
    const color = avatarColor(e.name);
    const div = document.createElement('div');
    div.className = 'staff-opt' + (isCurrent ? ' current' : '');
    div.innerHTML = `
      <div class="staff-opt-avatar" style="background:${color}">${html(surname[0])}</div>
      <div>
        <div class="staff-opt-name">${html(e.name)}</div>
        <div class="staff-opt-sub">${html(e.department)} · ${html(e.role || '')}</div>
      </div>
      ${isCurrent ? '<span class="staff-opt-check">✓ 現在</span>' : ''}
    `;
    div.addEventListener('click', () => saveStaff(surname));
    staffOptions.appendChild(div);
  });
}

async function saveStaff(surname: string): Promise<void> {
  await fetch(`/api/projects/${modalProjectId}/staff`, {
    method: 'PUT', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ staff: surname || null })
  });
  const proj = allProjects.find(p => p.id === modalProjectId);
  if (proj) proj.staff = surname || null;
  staffModal.classList.remove('open');
  document.body.style.overflow = '';
  renderProjects();
  if (loaded['employees']) { loaded['employees'] = false; loadEmployees(); }
  if (loaded['staff'])     { loaded['staff'] = false; loadStaff(); }
}

staffSearchInp.addEventListener('input', (e: Event) => renderStaffOptions((e.target as HTMLInputElement).value));
modalClose.addEventListener('click', () => { staffModal.classList.remove('open'); document.body.style.overflow = ''; });
staffModal.addEventListener('click', (e: Event) => {
  if (e.target === staffModal) { staffModal.classList.remove('open'); document.body.style.overflow = ''; }
});

// ─── Employees Workload ───────────────────────────────────────────────────────
async function loadEmployees(): Promise<void> {
  let emps: Employee[];
  try {
    emps = await fetch('/api/employees/workload').then(r => r.json());
  } catch(err) {
    showToast('社員データの取得に失敗しました', 'error');
    return;
  }
  const maxActive = Math.max(...emps.map(e => e.active ?? 0), 1);

  const withProj = emps.filter(e => (e.active ?? 0) > 0);
  const avgLoad = withProj.length ? (withProj.reduce((s,e)=>s+(e.active??0),0)/withProj.length).toFixed(1) : 0;
  const busiest = emps[0];
  let noStaff = 0;
  try {
    noStaff = (await fetch('/api/projects').then(r=>r.json()) as Project[]).filter(p=>!p.staff && p.status!=='失注').length;
  } catch(err) { /* noStaff stays 0 */ }

  getEl('emp-kpi').innerHTML = `
    <div class="kpi-card" style="--kpi-color:#2980b9">
      <div class="kpi-label">社員数</div>
      <div class="kpi-value">${emps.length}名</div>
      <div class="kpi-icon">👷</div>
    </div>
    <div class="kpi-card" style="--kpi-color:#27ae60">
      <div class="kpi-label">平均担当案件数</div>
      <div class="kpi-value">${avgLoad}件</div>
      <div class="kpi-sub">担当者のいる社員のみ</div>
      <div class="kpi-icon">📊</div>
    </div>
    <div class="kpi-card" style="--kpi-color:#e74c3c">
      <div class="kpi-label">最多担当</div>
      <div class="kpi-value">${busiest ? html(busiest.name.split(' ')[0]) : '—'}</div>
      <div class="kpi-sub">${busiest ? (busiest.active ?? 0) + '件' : ''}</div>
      <div class="kpi-icon">🏆</div>
    </div>
    <div class="kpi-card" style="--kpi-color:#e67e22">
      <div class="kpi-label">担当者未割当（進行中）</div>
      <div class="kpi-value">${noStaff}件</div>
      <div class="kpi-icon">⚠️</div>
    </div>
  `;

  const grid = getEl('emp-grid');
  grid.innerHTML = '';
  emps.forEach(e => {
    const active = e.active ?? 0;
    const pct = maxActive > 0 ? Math.round(active / maxActive * 100) : 0;
    let levelCls: string, levelTxt: string;
    if      (active === 0) { levelCls = 'level-free';   levelTxt = '担当なし'; }
    else if (active <= 2)  { levelCls = 'level-free';   levelTxt = '余裕あり'; }
    else if (active <= 4)  { levelCls = 'level-normal'; levelTxt = '通常';    }
    else                   { levelCls = 'level-busy';   levelTxt = '多忙';    }

    const color = avatarColor(e.name);
    const empColor = levelCls === 'level-busy' ? '#e74c3c' : levelCls === 'level-normal' ? '#f39c12' : '#27ae60';
    const pills = [
      e.in_progress  ? `<span class="emp-pill badge-green"  >契約済 ${e.in_progress}件</span>`  : '',
      e.negotiating  ? `<span class="emp-pill badge-blue"   >商談中 ${e.negotiating}件</span>`  : '',
      e.early        ? `<span class="emp-pill badge-orange" >初期   ${e.early}件</span>`        : '',
      e.lost         ? `<span class="emp-pill badge-gray"   >失注   ${e.lost}件</span>`         : '',
    ].filter(Boolean).join('');

    grid.insertAdjacentHTML('beforeend', `
      <div class="emp-card" style="--emp-color:${empColor}">
        <div class="emp-head">
          <div class="emp-avatar" style="background:${color}">${html(e.name[0])}</div>
          <div>
            <div class="emp-name">${html(e.name)}</div>
            <div class="emp-meta">${html(e.department || '')}${e.role ? ' · ' + html(e.role) : ''}</div>
          </div>
        </div>
        <div class="emp-workload-row">
          <span class="emp-workload-label">担当案件数（有効）</span>
          <div style="display:flex;align-items:baseline;gap:6px">
            <span class="emp-workload-num">${active}</span>
            <span style="font-size:12px;color:var(--text-muted)">件</span>
          </div>
        </div>
        <div class="emp-bar"><div class="emp-bar-fill" style="width:${pct}%"></div></div>
        <div class="emp-pills">
          ${pills || '<span style="font-size:12px;color:var(--text-muted)">案件なし</span>'}
          <span class="emp-level ${levelCls}">${levelTxt}</span>
        </div>
        <div class="emp-card-actions">
          <button class="action-btn" style="flex:1" onclick="openEmployeeModal(${e.id})">✏ 編集</button>
          <button class="action-btn del" onclick="deleteEmployee(${e.id},'${esc(e.name)}')">🗑</button>
        </div>
      </div>
    `);
  });
}

// ─── Toast ─────────────────────────────────────────────────────────────────────
function showToast(msg: string, type: 'success' | 'error' = 'success'): void {
  const container = getEl('toastContainer');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  container.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// ─── Form Modal Utilities ──────────────────────────────────────────────────────
function closeFormModal(id: string): void {
  getEl(id).classList.remove('open');
  document.body.style.overflow = '';
}
document.querySelectorAll('.modal-overlay').forEach(modalOverlay => {
  modalOverlay.addEventListener('click', (e: Event) => {
    if (e.target === modalOverlay && (modalOverlay as HTMLElement).id !== 'staffModal') {
      modalOverlay.classList.remove('open');
      document.body.style.overflow = '';
    }
  });
});

// ─── Customers CRUD ───────────────────────────────────────────────────────────
function openCustomerModal(id: number | null = null): void {
  const title = getEl('customerModalTitle');
  const deleteBtn = getEl('customerDeleteBtn') as HTMLButtonElement;
  getInput('customerIdField').value = id ? String(id) : '';

  const fields = ['cus-name','cus-address','cus-building_type','cus-age_years',
                  'cus-phone','cus-email','cus-source','cus-staff','cus-note'];
  fields.forEach(f => { getInput(f).value = ''; });

  if (id) {
    title.textContent = '顧客情報を編集';
    deleteBtn.style.display = 'inline-block';
    const c = allCustomers.find(x => x.id === id);
    if (c) {
      getInput('cus-name').value = c.name || '';
      getInput('cus-address').value = c.address || '';
      getInput('cus-building_type').value = c.building_type || '';
      getInput('cus-age_years').value = c.age_years != null ? String(c.age_years) : '';
      getInput('cus-phone').value = c.phone || '';
      getInput('cus-email').value = c.email || '';
      getInput('cus-source').value = c.source || '';
      getInput('cus-staff').value = c.staff || '';
      getInput('cus-note').value = c.note || '';
    }
  } else {
    title.textContent = '新規顧客を追加';
    deleteBtn.style.display = 'none';
  }
  getEl('customerModal').classList.add('open');
  document.body.style.overflow = 'hidden';
  getInput('cus-name').focus();
}

(getEl('customerForm') as HTMLFormElement).addEventListener('submit', async (e: Event) => {
  e.preventDefault();
  const id = getInput('customerIdField').value;
  const data = {
    name: getInput('cus-name').value,
    address: getInput('cus-address').value || null,
    building_type: getInput('cus-building_type').value || null,
    age_years: getInput('cus-age_years').value ? +getInput('cus-age_years').value : null,
    phone: getInput('cus-phone').value || null,
    email: getInput('cus-email').value || null,
    source: getInput('cus-source').value || null,
    staff: getInput('cus-staff').value || null,
    note: getInput('cus-note').value || null,
  };
  try {
    const res = await fetch(id ? `/api/customers/${id}` : '/api/customers', {
      method: id ? 'PUT' : 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(data)
    });
    const json = await res.json();
    if (!res.ok) { showToast(json.error || 'エラーが発生しました', 'error'); return; }
    closeFormModal('customerModal');
    showToast(id ? '顧客情報を更新しました' : '新規顧客を追加しました');
    allCustomers = await fetch('/api/customers').then(r => r.json());
    renderCustomers();
  } catch(err) {
    showToast('通信エラーが発生しました', 'error');
  }
});

function deleteCustomerFromModal(): void {
  const id = +getInput('customerIdField').value;
  const name = getInput('cus-name').value;
  deleteCustomer(id, name);
}

async function deleteCustomer(id: number, name: string): Promise<void> {
  if (!confirm(`「${name}」を削除しますか？\nこの操作は取り消せません。`)) return;
  let res: Response;
  try { res = await fetch(`/api/customers/${id}`, { method: 'DELETE' }); }
  catch(err) { showToast('通信エラーが発生しました', 'error'); return; }
  if (!res.ok) { showToast('削除に失敗しました', 'error'); return; }
  showToast('顧客を削除しました');
  closeFormModal('customerModal');
  allCustomers = allCustomers.filter(c => c.id !== id);
  renderCustomers();
}

// ─── Projects CRUD ────────────────────────────────────────────────────────────
function openProjectModal(id: number | null = null): void {
  const title = getEl('projectModalTitle');
  const deleteBtn = getEl('projectDeleteBtn') as HTMLButtonElement;
  getInput('projectIdField').value = id ? String(id) : '';

  const fields = ['prj-name','prj-customer_name','prj-address','prj-work_type','prj-staff',
                  'prj-status','prj-probability','prj-estimate_amount','prj-contract_amount',
                  'prj-first_visit','prj-scheduled_start','prj-contract_date','prj-note'];
  fields.forEach(f => { getInput(f).value = ''; });

  if (id) {
    title.textContent = '案件情報を編集';
    deleteBtn.style.display = 'inline-block';
    const p = allProjects.find(x => x.id === id);
    if (p) {
      getInput('prj-name').value = p.name || '';
      getInput('prj-customer_name').value = p.customer_name || '';
      getInput('prj-address').value = p.address || '';
      getInput('prj-work_type').value = p.work_type || '';
      getInput('prj-staff').value = p.staff || '';
      getInput('prj-status').value = p.status || '初回訪問済';
      getInput('prj-probability').value = p.probability || '';
      getInput('prj-estimate_amount').value = p.estimate_amount != null ? String(p.estimate_amount) : '';
      getInput('prj-contract_amount').value = p.contract_amount != null ? String(p.contract_amount) : '';
      getInput('prj-first_visit').value = toInputDate(p.first_visit);
      getInput('prj-scheduled_start').value = toInputDate(p.scheduled_start);
      getInput('prj-contract_date').value = toInputDate(p.contract_date);
      getInput('prj-note').value = p.note || '';
    }
  } else {
    title.textContent = '新規案件を追加';
    deleteBtn.style.display = 'none';
    getInput('prj-status').value = '初回訪問済';
  }
  getEl('projectModal').classList.add('open');
  document.body.style.overflow = 'hidden';
  getInput('prj-name').focus();
}

(getEl('projectForm') as HTMLFormElement).addEventListener('submit', async (e: Event) => {
  e.preventDefault();
  const id = getInput('projectIdField').value;
  const data = {
    name: getInput('prj-name').value,
    customer_name: getInput('prj-customer_name').value,
    address: getInput('prj-address').value || null,
    work_type: getInput('prj-work_type').value || null,
    staff: getInput('prj-staff').value || null,
    status: getInput('prj-status').value,
    probability: getInput('prj-probability').value || null,
    estimate_amount: getInput('prj-estimate_amount').value ? +getInput('prj-estimate_amount').value : null,
    contract_amount: getInput('prj-contract_amount').value ? +getInput('prj-contract_amount').value : null,
    first_visit: getInput('prj-first_visit').value || null,
    scheduled_start: getInput('prj-scheduled_start').value || null,
    contract_date: getInput('prj-contract_date').value || null,
    note: getInput('prj-note').value || null,
  };
  try {
    const res = await fetch(id ? `/api/projects/${id}` : '/api/projects', {
      method: id ? 'PUT' : 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(data)
    });
    const json = await res.json();
    if (!res.ok) { showToast(json.error || 'エラーが発生しました', 'error'); return; }
    closeFormModal('projectModal');
    showToast(id ? '案件情報を更新しました' : '新規案件を追加しました');
    allProjects = await fetch('/api/projects').then(r => r.json());
    renderProjects();
    if (loaded['dashboard']) { loaded['dashboard'] = false; refreshDashboardKPIs(); }
    if (loaded['staff']) { loaded['staff'] = false; loadStaff(); }
  } catch(err) {
    showToast('通信エラーが発生しました', 'error');
  }
});

function deleteProjectFromModal(): void {
  const id = +getInput('projectIdField').value;
  const name = getInput('prj-name').value;
  deleteProject(id, name);
}

async function deleteProject(id: number, name: string): Promise<void> {
  if (!confirm(`「${name}」を削除しますか？\nこの操作は取り消せません。`)) return;
  let res: Response;
  try { res = await fetch(`/api/projects/${id}`, { method: 'DELETE' }); }
  catch(err) { showToast('通信エラーが発生しました', 'error'); return; }
  if (!res.ok) { showToast('削除に失敗しました', 'error'); return; }
  showToast('案件を削除しました');
  closeFormModal('projectModal');
  allProjects = allProjects.filter(p => p.id !== id);
  renderProjects();
  if (loaded['dashboard']) { loaded['dashboard'] = false; refreshDashboardKPIs(); }
  if (loaded['employees']) { loaded['employees'] = false; loadEmployees(); }
  if (loaded['staff']) { loaded['staff'] = false; loadStaff(); }
}

// ─── Employees CRUD ───────────────────────────────────────────────────────────
function openEmployeeModal(id: number | null = null): void {
  const title = getEl('employeeModalTitle');
  const deleteBtn = getEl('employeeDeleteBtn') as HTMLButtonElement;
  getInput('employeeIdField').value = id ? String(id) : '';

  const fields = ['emp-name','emp-department','emp-role','emp-qualification',
                  'emp-extension','emp-mobile','emp-email'];
  fields.forEach(f => { getInput(f).value = ''; });

  if (id) {
    title.textContent = '社員情報を編集';
    deleteBtn.style.display = 'inline-block';
    const fillEmpForm = (emps: Employee[]) => {
      const e = emps.find(x => x.id === id);
      if (e) {
        getInput('emp-name').value = e.name || '';
        getInput('emp-department').value = e.department || '';
        getInput('emp-role').value = e.role || '';
        getInput('emp-qualification').value = e.qualification || '';
        getInput('emp-extension').value = e.extension || '';
        getInput('emp-mobile').value = e.mobile || '';
        getInput('emp-email').value = e.email || '';
      }
    };
    if (allEmployees.length) {
      fillEmpForm(allEmployees);
    } else {
      fetch('/api/employees').then(r=>r.json()).then((emps: Employee[]) => {
        allEmployees = emps;
        fillEmpForm(emps);
      });
    }
  } else {
    title.textContent = '新規社員を追加';
    deleteBtn.style.display = 'none';
  }
  getEl('employeeModal').classList.add('open');
  document.body.style.overflow = 'hidden';
  getInput('emp-name').focus();
}

(getEl('employeeForm') as HTMLFormElement).addEventListener('submit', async (e: Event) => {
  e.preventDefault();
  const id = getInput('employeeIdField').value;
  const data = {
    name: getInput('emp-name').value,
    department: getInput('emp-department').value || null,
    role: getInput('emp-role').value || null,
    qualification: getInput('emp-qualification').value || null,
    extension: getInput('emp-extension').value || null,
    mobile: getInput('emp-mobile').value || null,
    email: getInput('emp-email').value || null,
  };
  let res: Response, json: any;
  try {
    res = await fetch(id ? `/api/employees/${id}` : '/api/employees', {
      method: id ? 'PUT' : 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(data)
    });
    json = await res.json();
  } catch(err) { showToast('通信エラーが発生しました', 'error'); return; }
  if (!res!.ok) { showToast(json.error || 'エラーが発生しました', 'error'); return; }
  closeFormModal('employeeModal');
  showToast(id ? '社員情報を更新しました' : '新規社員を追加しました');
  allEmployees = [];
  loaded['employees'] = false;
  loadEmployees();
});

function deleteEmployeeFromModal(): void {
  const id = +getInput('employeeIdField').value;
  const name = getInput('emp-name').value;
  deleteEmployee(id, name);
}

async function deleteEmployee(id: number, name: string): Promise<void> {
  if (!confirm(`「${name}」を削除しますか？\nこの社員が担当している案件の担当者が未割当になります。`)) return;
  let res: Response;
  try { res = await fetch(`/api/employees/${id}`, { method: 'DELETE' }); }
  catch(err) { showToast('通信エラーが発生しました', 'error'); return; }
  if (!res.ok) { showToast('削除に失敗しました', 'error'); return; }
  showToast('社員を削除しました');
  closeFormModal('employeeModal');
  allEmployees = [];
  loaded['employees'] = false;
  loadEmployees();
  if (loaded['projects']) {
    allProjects = await fetch('/api/projects').then(r=>r.json());
    renderProjects();
  }
  if (loaded['staff']) { loaded['staff'] = false; loadStaff(); }
}

// ─── Invoices CRUD ────────────────────────────────────────────────────────────
function openInvoiceModal(id: number | null = null): void {
  const title = getEl('invoiceModalTitle');
  const deleteBtn = getEl('invoiceDeleteBtn') as HTMLButtonElement;
  getInput('invoiceIdField').value = id ? String(id) : '';

  const fields = ['inv-invoice_no','inv-project_name','inv-customer_name','inv-billing_type',
                  'inv-billing_date','inv-amount','inv-due_date','inv-payment_date','inv-note'];
  fields.forEach(f => { getInput(f).value = ''; });
  getInput('inv-payment_status').value = '未入金';

  if (id) {
    title.textContent = '請求情報を編集';
    deleteBtn.style.display = 'inline-block';
    const inv = allInvoices.find(x => x.id === id);
    if (inv) {
      getInput('inv-invoice_no').value = inv.invoice_no || '';
      getInput('inv-project_name').value = inv.project_name || '';
      getInput('inv-customer_name').value = inv.customer_name || '';
      getInput('inv-billing_type').value = inv.billing_type || '';
      getInput('inv-billing_date').value = toInputDate(inv.billing_date);
      getInput('inv-amount').value = inv.amount != null ? String(inv.amount) : '';
      getInput('inv-due_date').value = toInputDate(inv.due_date);
      getInput('inv-payment_status').value = inv.payment_status || '未入金';
      getInput('inv-payment_date').value = toInputDate(inv.payment_date);
      getInput('inv-note').value = inv.note || '';
    }
  } else {
    title.textContent = '新規請求を追加';
    deleteBtn.style.display = 'none';
  }
  getEl('invoiceModal').classList.add('open');
  document.body.style.overflow = 'hidden';
  getInput('inv-invoice_no').focus();
}

(getEl('invoiceForm') as HTMLFormElement).addEventListener('submit', async (e: Event) => {
  e.preventDefault();
  const id = getInput('invoiceIdField').value;
  const data = {
    invoice_no: getInput('inv-invoice_no').value,
    project_name: getInput('inv-project_name').value,
    customer_name: getInput('inv-customer_name').value || null,
    billing_type: getInput('inv-billing_type').value || null,
    billing_date: getInput('inv-billing_date').value || null,
    amount: getInput('inv-amount').value ? +getInput('inv-amount').value : null,
    due_date: getInput('inv-due_date').value || null,
    payment_status: getInput('inv-payment_status').value,
    payment_date: getInput('inv-payment_date').value || null,
    note: getInput('inv-note').value || null,
  };
  try {
    const res = await fetch(id ? `/api/invoices/${id}` : '/api/invoices', {
      method: id ? 'PUT' : 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(data)
    });
    const json = await res.json();
    if (!res.ok) { showToast(json.error || 'エラーが発生しました', 'error'); return; }
    closeFormModal('invoiceModal');
    showToast(id ? '請求情報を更新しました' : '新規請求を追加しました');
    allInvoices = await fetch('/api/invoices').then(r => r.json());
    updateInvoiceKPIs();
    renderInvoices();
    if (loaded['dashboard']) { loaded['dashboard'] = false; refreshDashboardKPIs(); }
  } catch(err) {
    showToast('通信エラーが発生しました', 'error');
  }
});

function deleteInvoiceFromModal(): void {
  const id = +getInput('invoiceIdField').value;
  const invoiceNo = getInput('inv-invoice_no').value;
  deleteInvoice(id, invoiceNo);
}

async function deleteInvoice(id: number, invoiceNo: string = ''): Promise<void> {
  const label = invoiceNo || `ID:${id}`;
  if (!confirm(`「${label}」を削除しますか？\nこの操作は取り消せません。`)) return;
  let res: Response;
  try { res = await fetch(`/api/invoices/${id}`, { method: 'DELETE' }); }
  catch(err) { showToast('通信エラーが発生しました', 'error'); return; }
  if (!res.ok) { showToast('削除に失敗しました', 'error'); return; }
  showToast('請求データを削除しました');
  closeFormModal('invoiceModal');
  allInvoices = allInvoices.filter(i => i.id !== id);
  updateInvoiceKPIs();
  renderInvoices();
  if (loaded['dashboard']) { loaded['dashboard'] = false; refreshDashboardKPIs(); }
}

// Initial load
loadDashboard();
loaded['dashboard'] = true;

// ─── Window exports (for inline onclick attributes in HTML) ───────────────────
declare global {
  interface Window {
    openStaffModal: (id: number, name: string, staff: string) => void;
    openProjectModal: (id?: number | null) => void;
    openCustomerModal: (id?: number | null) => void;
    openEmployeeModal: (id?: number | null) => void;
    openInvoiceModal: (id?: number | null) => void;
    deleteProject: (id: number, name: string) => Promise<void>;
    deleteCustomer: (id: number, name: string) => Promise<void>;
    deleteEmployee: (id: number, name: string) => Promise<void>;
    deleteInvoice: (id: number, invoiceNo?: string) => Promise<void>;
    deleteProjectFromModal: () => void;
    deleteCustomerFromModal: () => void;
    deleteEmployeeFromModal: () => void;
    deleteInvoiceFromModal: () => void;
  }
}
Object.assign(window, {
  openStaffModal, openProjectModal, openCustomerModal, openEmployeeModal, openInvoiceModal,
  deleteProject, deleteCustomer, deleteEmployee, deleteInvoice,
  deleteProjectFromModal, deleteCustomerFromModal, deleteEmployeeFromModal, deleteInvoiceFromModal,
});
