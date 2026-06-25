/**
 * Sakura Reform Dashboard — API-only Audit (no Playwright dependency)
 * Run: node audit_api.js
 */

const http = require('http');

function apiRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const start = Date.now();
    const options = {
      hostname: 'localhost', port: 3000,
      path, method,
      headers: payload ? {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      } : {}
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const ms = Date.now() - start;
        let json = null; let parseError = null;
        try { json = JSON.parse(data); } catch(e) { parseError = e.message; }
        resolve({ status: res.statusCode, ms, json, raw: data, parseError, path, method });
      });
    });
    req.on('error', (err) => resolve({ status: 0, ms: 0, json: null, raw: '', error: err.message, path, method }));
    if (payload) req.write(payload);
    req.end();
  });
}

const get = (path) => apiRequest('GET', path, null);
const post = (path, body) => apiRequest('POST', path, body);
const put = (path, body) => apiRequest('PUT', path, body);
const del = (path) => apiRequest('DELETE', path, null);

const RESULTS = [];

function pass(test, detail) {
  RESULTS.push({ result: 'PASS', test, detail: detail || '' });
  console.log(`PASS  ${test}${detail ? ' — ' + detail : ''}`);
}
function fail(severity, test, detail) {
  RESULTS.push({ result: 'FAIL', severity, test, detail: detail || '' });
  console.log(`FAIL  [${severity}] ${test}${detail ? '\n      ' + detail : ''}`);
}

async function main() {
  console.log('=== さくらリフォーム API Audit ===\n');

  // Check server is up
  const ping = await get('/');
  if (ping.status === 0) {
    fail('Critical', 'Server not running on port 3000', ping.error);
    console.log('\n❌ Server unreachable. Exiting.');
    return;
  }
  pass('Server reachable', `HTTP ${ping.status}`);

  // ─── GET Endpoints ────────────────────────────────────────────────────────
  console.log('\n--- GET Endpoints ---');

  const endpoints = [
    { path: '/api/summary', required: ['contracted_total','pipeline_total','paid_amount','unpaid_amount','contracted_count','pipeline_count','lost_count','total_projects'] },
    { path: '/api/projects', required: null, isArray: true },
    { path: '/api/projects/by-status', required: null, isArray: true },
    { path: '/api/projects/by-type', required: null, isArray: true },
    { path: '/api/projects/monthly', required: null, isArray: true },
    { path: '/api/invoices', required: null, isArray: true },
    { path: '/api/employees', required: null, isArray: true },
    { path: '/api/employees/workload', required: null, isArray: true },
    { path: '/api/customers', required: null, isArray: true },
    { path: '/api/staff/performance', required: null, isArray: true },
  ];

  const cache = {};
  for (const ep of endpoints) {
    const r = await get(ep.path);
    cache[ep.path] = r;
    if (r.status === 0) { fail('Critical', `${ep.path} — connection refused`, r.error); continue; }
    if (r.status !== 200) { fail('High', `${ep.path} returned HTTP ${r.status}`, r.raw.substring(0,200)); continue; }
    if (r.parseError) { fail('High', `${ep.path} returned invalid JSON`, r.parseError); continue; }
    pass(`${ep.path}`, `HTTP ${r.status}, ${r.ms}ms`);

    if (ep.required && r.json) {
      for (const f of ep.required) {
        if (r.json[f] !== undefined) pass(`  ${ep.path} has field "${f}"`, `value: ${r.json[f]}`);
        else fail('High', `  ${ep.path} missing field "${f}"`, JSON.stringify(r.json).substring(0,100));
      }
    }
    if (ep.isArray) {
      if (Array.isArray(r.json)) pass(`  ${ep.path} returns array`, `${r.json.length} items`);
      else fail('High', `  ${ep.path} should return array but got: ${typeof r.json}`, '');
    }
  }

  // ─── Staff performance field check ────────────────────────────────────────
  console.log('\n--- Staff Performance Fields ---');
  const perf = cache['/api/staff/performance']?.json;
  if (Array.isArray(perf) && perf.length > 0) {
    const row = perf[0];
    for (const f of ['staff','total','contracted','revenue']) {
      if (row[f] !== undefined) pass(`staff/performance[0].${f}`, `${row[f]}`);
      else fail('High', `staff/performance[0] missing "${f}"`, JSON.stringify(row));
    }
  }

  // ─── Filter endpoint tests ─────────────────────────────────────────────────
  console.log('\n--- Filter Tests ---');
  const f1 = await get('/api/projects?status=%E5%A5%91%E7%B4%84%E6%B8%88'); // 契約済
  if (f1.status === 200 && Array.isArray(f1.json)) {
    const allMatch = f1.json.every(p => p.status === '契約済');
    if (allMatch) pass('?status=契約済 filter', `${f1.json.length} rows, all match`);
    else fail('High', '?status=契約済 includes non-matching rows', `Count: ${f1.json.length}`);
  }

  const f2 = await get('/api/projects?status=INVALID_STATUS_XYZ');
  if (f2.status === 200 && Array.isArray(f2.json) && f2.json.length === 0) {
    pass('Invalid status filter', 'returns empty array (graceful)');
  } else if (f2.status === 200 && Array.isArray(f2.json)) {
    fail('Medium', 'Invalid status filter returns non-empty array', `Got ${f2.json.length} rows`);
  }

  // ─── CRUD: Create ──────────────────────────────────────────────────────────
  console.log('\n--- CRUD Create ---');

  // Customer create
  const c1 = await post('/api/customers', { name: 'テスト顧客 監査', address: '東京都テスト区', building_type: '戸建て', age_years: 15, phone: '03-0000-9999', email: 'audit@test.com', source: 'Web', staff: '田中', note: '監査テスト' });
  let custId = null;
  if (c1.status === 200 && c1.json?.ok) { custId = c1.json.id; pass('POST /api/customers', `id=${custId}`); }
  else fail('High', 'POST /api/customers failed', `HTTP ${c1.status}: ${JSON.stringify(c1.json)}`);

  // Missing name
  const c1b = await post('/api/customers', { address: '住所のみ' });
  if (c1b.status === 400 && c1b.json?.error) pass('POST /api/customers missing name → 400', c1b.json.error);
  else fail('High', 'POST /api/customers missing name should be 400', `Got HTTP ${c1b.status}`);

  // Project create
  const p1 = await post('/api/projects', { name: '監査案件テスト', customer_name: 'テスト顧客', work_type: '外壁塗装', staff: '田中', status: '商談中', probability: 'B（中）', estimate_amount: 1500000, first_visit: '2026-06-01', scheduled_start: '2026-07-01' });
  let projId = null;
  if (p1.status === 200 && p1.json?.ok) { projId = p1.json.id; pass('POST /api/projects', `id=${projId}`); }
  else fail('High', 'POST /api/projects failed', `HTTP ${p1.status}: ${JSON.stringify(p1.json)}`);

  // Missing customer_name
  const p1b = await post('/api/projects', { name: '名前だけ案件' });
  if (p1b.status === 400) pass('POST /api/projects missing customer_name → 400', '');
  else fail('High', 'POST /api/projects missing customer_name should be 400', `Got HTTP ${p1b.status}`);

  // Employee create
  const e1 = await post('/api/employees', { name: '監査 一郎', department: '営業部', role: 'テスト担当', qualification: 'テスト資格', extension: '999', mobile: '090-9999-0001', email: 'audit1@sakura-reform.jp' });
  let empId = null;
  if (e1.status === 200 && e1.json?.ok) { empId = e1.json.id; pass('POST /api/employees', `id=${empId}`); }
  else fail('High', 'POST /api/employees failed', `HTTP ${e1.status}: ${JSON.stringify(e1.json)}`);

  // Missing name
  const e1b = await post('/api/employees', { department: '部署のみ' });
  if (e1b.status === 400) pass('POST /api/employees missing name → 400', '');
  else fail('High', 'POST /api/employees missing name should be 400', `Got HTTP ${e1b.status}`);

  // Invoice create
  const i1 = await post('/api/invoices', { invoice_no: 'INV-AUDIT-2026-001', project_name: '監査案件テスト', customer_name: 'テスト顧客', billing_type: '工事費', billing_date: '2026-06-25', amount: 1500000, due_date: '2026-07-25', payment_status: '未入金' });
  let invId = null;
  if (i1.status === 200 && i1.json?.ok) { invId = i1.json.id; pass('POST /api/invoices', `id=${invId}`); }
  else fail('High', 'POST /api/invoices failed', `HTTP ${i1.status}: ${JSON.stringify(i1.json)}`);

  // Missing project_name
  const i1b = await post('/api/invoices', { invoice_no: 'INV-BAD' });
  if (i1b.status === 400) pass('POST /api/invoices missing project_name → 400', '');
  else fail('High', 'POST /api/invoices missing project_name should be 400', `Got HTTP ${i1b.status}`);

  // ─── CRUD: Update ──────────────────────────────────────────────────────────
  console.log('\n--- CRUD Update ---');

  if (custId) {
    const u1 = await put(`/api/customers/${custId}`, { name: 'テスト顧客 監査（更新）', address: '神奈川県テスト市', building_type: 'マンション', age_years: 25, phone: '045-0000-0001', email: 'audit_upd@test.com', source: '紹介', staff: '佐藤', note: '更新済' });
    if (u1.status === 200 && u1.json?.ok) {
      pass(`PUT /api/customers/${custId}`, 'ok');
      const verify = await get('/api/customers');
      const found = verify.json?.find(x => x.id === custId);
      if (found?.name === 'テスト顧客 監査（更新）' && found?.staff === '佐藤') pass('Customer update persisted', `name="${found.name}", staff="${found.staff}"`);
      else fail('High', 'Customer update did not persist', `Got: ${JSON.stringify(found)}`);
    } else fail('High', `PUT /api/customers/${custId} failed`, `HTTP ${u1.status}`);
  }

  if (projId) {
    const u2 = await put(`/api/projects/${projId}`, { name: '監査案件テスト（更新）', customer_name: 'テスト顧客（更新）', work_type: '屋根工事', staff: '佐藤', status: '契約済', probability: 'A（高）', estimate_amount: 2000000, contract_amount: 1950000, first_visit: '2026-06-01', scheduled_start: '2026-07-15', contract_date: '2026-06-25', note: '更新済' });
    if (u2.status === 200 && u2.json?.ok) {
      pass(`PUT /api/projects/${projId}`, 'ok');
      const verify = await get('/api/projects');
      const found = verify.json?.find(x => x.id === projId);
      if (found?.status === '契約済' && found?.contract_amount === 1950000) pass('Project update persisted', `status=${found.status}, contract_amount=${found.contract_amount}`);
      else fail('High', 'Project update did not persist correctly', `Got: ${JSON.stringify(found)}`);
    } else fail('High', `PUT /api/projects/${projId} failed`, `HTTP ${u2.status}`);

    // Staff-only update
    const u2s = await put(`/api/projects/${projId}/staff`, { staff: '鈴木' });
    if (u2s.status === 200 && u2s.json?.ok) {
      pass(`PUT /api/projects/${projId}/staff`, 'ok');
      const verify2 = await get('/api/projects');
      const found2 = verify2.json?.find(x => x.id === projId);
      if (found2?.staff === '鈴木') pass('Project staff-only update persisted', `staff="${found2.staff}"`);
      else fail('High', 'Project staff-only update did not persist', `staff="${found2?.staff}"`);
    } else fail('High', `PUT /api/projects/${projId}/staff failed`, `HTTP ${u2s.status}`);
  }

  if (empId) {
    const u3 = await put(`/api/employees/${empId}`, { name: '監査 二郎', department: '施工部', role: 'マネージャー', qualification: '一級施工管理技士', extension: '998', mobile: '090-8888-0002', email: 'audit2@sakura-reform.jp' });
    if (u3.status === 200 && u3.json?.ok) {
      pass(`PUT /api/employees/${empId}`, 'ok');
      const verify3 = await get('/api/employees');
      const found3 = verify3.json?.find(x => x.id === empId);
      if (found3?.name === '監査 二郎') pass('Employee update persisted', `name="${found3.name}"`);
      else fail('High', 'Employee update did not persist', `Got: ${JSON.stringify(found3)}`);
    } else fail('High', `PUT /api/employees/${empId} failed`, `HTTP ${u3.status}`);
  }

  if (invId) {
    const u4 = await put(`/api/invoices/${invId}`, { invoice_no: 'INV-AUDIT-2026-001', project_name: '監査案件テスト（更新）', customer_name: 'テスト顧客', billing_type: '工事費（更新）', billing_date: '2026-06-25', amount: 1950000, due_date: '2026-07-31', payment_status: '入金済', payment_date: '2026-06-30', note: '入金確認済' });
    if (u4.status === 200 && u4.json?.ok) {
      pass(`PUT /api/invoices/${invId}`, 'ok');
      const verify4 = await get('/api/invoices');
      const found4 = verify4.json?.find(x => x.id === invId);
      if (found4?.payment_status === '入金済' && found4?.amount === 1950000) pass('Invoice update persisted', `payment_status=${found4.payment_status}, amount=${found4.amount}`);
      else fail('High', 'Invoice update did not persist correctly', `Got: ${JSON.stringify(found4)}`);
    } else fail('High', `PUT /api/invoices/${invId} failed`, `HTTP ${u4.status}`);
  }

  // ─── Employee delete cascade test ─────────────────────────────────────────
  console.log('\n--- Employee Delete Cascade ---');
  const ec = await post('/api/employees', { name: 'カスケード テスト', department: '営業部', role: 'テスト' });
  let cascEmpId = null, cascProjId = null;
  if (ec.status === 200) {
    cascEmpId = ec.json.id;
    const ep = await post('/api/projects', { name: 'カスケードプロジェクト', customer_name: 'テスト', staff: 'カスケード', status: '商談中' });
    if (ep.status === 200) {
      cascProjId = ep.json.id;
      // Verify staff assigned
      const vPre = await get('/api/projects');
      const pPre = vPre.json?.find(x => x.id === cascProjId);
      console.log(`  Pre-delete project staff: "${pPre?.staff}"`);

      // Delete employee
      const demp = await del(`/api/employees/${cascEmpId}`);
      if (demp.status === 200 && demp.json?.ok) {
        pass(`DELETE /api/employees/${cascEmpId} (cascade test)`, 'ok');
        const vPost = await get('/api/projects');
        const pPost = vPost.json?.find(x => x.id === cascProjId);
        if (pPost?.staff === null) pass('Cascade: project.staff nulled after employee delete', `staff=${pPost?.staff}`);
        else fail('High', 'Cascade: project.staff NOT nulled after employee delete', `staff="${pPost?.staff}" (expected null)`);
      } else fail('High', `DELETE /api/employees/${cascEmpId} failed`, `HTTP ${demp.status}`);
    }
  }

  // ─── Delete operations (cleanup) ──────────────────────────────────────────
  console.log('\n--- Delete Operations ---');
  if (invId) {
    const d1 = await del(`/api/invoices/${invId}`);
    if (d1.status === 200 && d1.json?.ok) pass(`DELETE /api/invoices/${invId}`, 'ok');
    else fail('High', `DELETE /api/invoices/${invId} failed`, `HTTP ${d1.status}`);
  }
  if (cascProjId) {
    const d2 = await del(`/api/projects/${cascProjId}`);
    if (d2.status === 200) pass(`DELETE /api/projects/${cascProjId} (cascade test)`, 'ok');
  }
  if (projId) {
    const d3 = await del(`/api/projects/${projId}`);
    if (d3.status === 200 && d3.json?.ok) pass(`DELETE /api/projects/${projId}`, 'ok');
    else fail('High', `DELETE /api/projects/${projId} failed`, `HTTP ${d3.status}`);
  }
  if (custId) {
    const d4 = await del(`/api/customers/${custId}`);
    if (d4.status === 200 && d4.json?.ok) pass(`DELETE /api/customers/${custId}`, 'ok');
    else fail('High', `DELETE /api/customers/${custId} failed`, `HTTP ${d4.status}`);
  }
  if (empId) {
    const d5 = await del(`/api/employees/${empId}`);
    if (d5.status === 200 && d5.json?.ok) pass(`DELETE /api/employees/${empId}`, 'ok');
    else fail('High', `DELETE /api/employees/${empId} failed`, `HTTP ${d5.status}`);
  }

  // ─── Data integrity cross-check ────────────────────────────────────────────
  console.log('\n--- Data Integrity ---');
  const freshSummary = await get('/api/summary');
  const freshProjects = await get('/api/projects');
  const freshInvoices = await get('/api/invoices');

  if (freshSummary.json && freshProjects.json && freshInvoices.json) {
    const contracted = freshProjects.json.filter(p => p.status === '契約済');
    const contractedTotal = contracted.reduce((s, p) => s + (p.contract_amount || 0), 0);
    const summaryContractedTotal = freshSummary.json.contracted_total;
    if (contractedTotal === summaryContractedTotal) pass('contracted_total matches projects', `${contractedTotal}`);
    else fail('High', 'contracted_total MISMATCH', `summary=${summaryContractedTotal}, projects_sum=${contractedTotal}`);

    const paidTotal = freshInvoices.json.filter(i => i.payment_status === '入金済').reduce((s,i)=>s+(i.amount||0),0);
    const unpaidTotal = freshInvoices.json.filter(i => i.payment_status !== '入金済').reduce((s,i)=>s+(i.amount||0),0);
    if (paidTotal === freshSummary.json.paid_amount) pass('paid_amount matches invoices', `${paidTotal}`);
    else fail('High', 'paid_amount MISMATCH', `summary=${freshSummary.json.paid_amount}, invoices_sum=${paidTotal}`);

    if (unpaidTotal === freshSummary.json.unpaid_amount) pass('unpaid_amount matches invoices', `${unpaidTotal}`);
    else fail('High', 'unpaid_amount MISMATCH', `summary=${freshSummary.json.unpaid_amount}, invoices_sum=${unpaidTotal}`);

    // Check unique statuses in DB
    const uniqueStatuses = [...new Set(freshProjects.json.map(p=>p.status))];
    console.log(`  Unique project statuses in DB: [${uniqueStatuses.join(', ')}]`);
    const uniquePayment = [...new Set(freshInvoices.json.map(i=>i.payment_status))];
    console.log(`  Unique payment statuses in DB: [${uniquePayment.join(', ')}]`);

    // Invoice filter mismatch check
    // UI filter has '入金済' button but DB may store '入金済' — check exact match
    if (uniquePayment.includes('入金済')) pass('Invoice payment_status "入金済" exists in DB', 'matches UI filter');
    else fail('Medium', 'No "入金済" invoices found in DB', 'UI filter button for 入金済 would show 0 rows');

    // Check if '入金待ち' filter in UI matches DB status values
    if (uniquePayment.includes('入金待ち')) pass('Invoice payment_status "入金待ち" exists in DB', 'matches UI filter');

    // Print sample data for reference
    console.log(`\n  Sample project[0]: ${JSON.stringify(freshProjects.json[0]).substring(0,120)}`);
    console.log(`  Sample invoice[0]: ${JSON.stringify(freshInvoices.json[0]).substring(0,120)}`);
    console.log(`  Summary: ${JSON.stringify(freshSummary.json)}`);

    // Additional: check total_projects matches COUNT(*)
    if (freshSummary.json.total_projects === freshProjects.json.length) {
      pass('total_projects matches projects array length', `${freshSummary.json.total_projects}`);
    } else {
      fail('Medium', 'total_projects mismatch', `summary=${freshSummary.json.total_projects}, array.length=${freshProjects.json.length}`);
    }
  }

  // ─── Print final results ───────────────────────────────────────────────────
  console.log('\n' + '='.repeat(60));
  const passes = RESULTS.filter(r => r.result === 'PASS').length;
  const fails = RESULTS.filter(r => r.result === 'FAIL');
  const critical = fails.filter(r => r.severity === 'Critical');
  const high = fails.filter(r => r.severity === 'High');
  const medium = fails.filter(r => r.severity === 'Medium');

  console.log(`Total checks: ${RESULTS.length} | PASS: ${passes} | FAIL: ${fails.length}`);
  console.log(`  Critical: ${critical.length} | High: ${high.length} | Medium: ${medium.length}`);

  console.log('\nJSON_START');
  console.log(JSON.stringify({ passes, fails, critical: critical.length, high: high.length, medium: medium.length, issues: fails }, null, 2));
  console.log('JSON_END');
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
