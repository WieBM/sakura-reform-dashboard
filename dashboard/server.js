const express = require("express");
const path = require("path");
const { openDb, initSchema, importData } = require("./db");

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Initialize DB
const db = openDb();
initSchema(db);
importData(db);

// ─── API: KPI Summary ───────────────────────────────────────────────────────
app.get("/api/summary", (req, res) => {
  const contracted = db.prepare(
    "SELECT COUNT(*) as count, COALESCE(SUM(contract_amount),0) as total FROM projects WHERE status='契約済'"
  ).get();

  const pipeline = db.prepare(
    "SELECT COUNT(*) as count, COALESCE(SUM(estimate_amount),0) as total FROM projects WHERE status NOT IN ('契約済','失注')"
  ).get();

  const lost = db.prepare(
    "SELECT COUNT(*) as count FROM projects WHERE status='失注'"
  ).get();

  const totalProjects = db.prepare("SELECT COUNT(*) as count FROM projects").get();

  const invoiceSummary = db.prepare(
    "SELECT COALESCE(SUM(CASE WHEN payment_status='入金済' THEN amount ELSE 0 END),0) as paid, " +
    "COALESCE(SUM(CASE WHEN payment_status!='入金済' THEN amount ELSE 0 END),0) as unpaid " +
    "FROM invoices"
  ).get();

  res.json({
    contracted_count: contracted.count,
    contracted_total: contracted.total,
    pipeline_count: pipeline.count,
    pipeline_total: pipeline.total,
    lost_count: lost.count,
    total_projects: totalProjects.count,
    paid_amount: invoiceSummary.paid,
    unpaid_amount: invoiceSummary.unpaid,
  });
});

// ─── API: Projects by Status ─────────────────────────────────────────────────
app.get("/api/projects/by-status", (req, res) => {
  const rows = db.prepare(
    "SELECT status, COUNT(*) as count, COALESCE(SUM(estimate_amount),0) as total FROM projects GROUP BY status ORDER BY count DESC"
  ).all();
  res.json(rows);
});

// ─── API: Projects by Work Type ──────────────────────────────────────────────
app.get("/api/projects/by-type", (req, res) => {
  const rows = db.prepare(
    "SELECT work_type, COUNT(*) as count, COALESCE(SUM(COALESCE(contract_amount, estimate_amount)),0) as total FROM projects GROUP BY work_type ORDER BY total DESC"
  ).all();
  res.json(rows);
});

// ─── API: Monthly Contracted ─────────────────────────────────────────────────
app.get("/api/projects/monthly", (req, res) => {
  const rows = db.prepare(
    "SELECT SUBSTR(contract_date,1,7) as month, COUNT(*) as count, SUM(contract_amount) as total " +
    "FROM projects WHERE status='契約済' AND contract_date IS NOT NULL " +
    "GROUP BY month ORDER BY month"
  ).all();
  res.json(rows);
});

// ─── API: Project List ───────────────────────────────────────────────────────
app.get("/api/projects", (req, res) => {
  const { status, type } = req.query;
  let sql = "SELECT * FROM projects WHERE 1=1";
  const params = [];
  if (status) { sql += " AND status=?"; params.push(status); }
  if (type) { sql += " AND work_type=?"; params.push(type); }
  sql += " ORDER BY id DESC";
  res.json(db.prepare(sql).all(...params));
});

// ─── API: Create Project ─────────────────────────────────────────────────────
app.post("/api/projects", (req, res) => {
  const { name, customer_name, address, work_type, staff, status, probability,
          estimate_amount, first_visit, scheduled_start, contract_date, contract_amount, note } = req.body;
  if (!name || !customer_name) return res.status(400).json({ error: "案件名と顧客名は必須です" });
  const result = db.prepare(`
    INSERT INTO projects (name,customer_name,address,work_type,staff,status,probability,
      estimate_amount,first_visit,scheduled_start,contract_date,contract_amount,note)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(name, customer_name, address||null, work_type||null, staff||null,
         status||'初回訪問済', probability||null, estimate_amount||null,
         first_visit||null, scheduled_start||null, contract_date||null,
         contract_amount||null, note||null);
  res.json({ ok: true, id: result.lastInsertRowid });
});

// ─── API: Update Project ─────────────────────────────────────────────────────
app.put("/api/projects/:id/staff", (req, res) => {
  const { staff } = req.body;
  db.prepare("UPDATE projects SET staff=? WHERE id=?").run(staff || null, req.params.id);
  res.json({ ok: true });
});

app.put("/api/projects/:id", (req, res) => {
  const { name, customer_name, address, work_type, staff, status, probability,
          estimate_amount, first_visit, scheduled_start, contract_date, contract_amount, note } = req.body;
  if (!name || !customer_name) return res.status(400).json({ error: "案件名と顧客名は必須です" });
  db.prepare(`
    UPDATE projects SET name=?,customer_name=?,address=?,work_type=?,staff=?,status=?,
      probability=?,estimate_amount=?,first_visit=?,scheduled_start=?,
      contract_date=?,contract_amount=?,note=? WHERE id=?
  `).run(name, customer_name, address||null, work_type||null, staff||null, status,
         probability||null, estimate_amount||null, first_visit||null, scheduled_start||null,
         contract_date||null, contract_amount||null, note||null, req.params.id);
  res.json({ ok: true });
});

// ─── API: Delete Project ─────────────────────────────────────────────────────
app.delete("/api/projects/:id", (req, res) => {
  db.prepare("DELETE FROM projects WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// ─── API: Invoices ───────────────────────────────────────────────────────────
app.get("/api/invoices", (req, res) => {
  const rows = db.prepare("SELECT * FROM invoices ORDER BY billing_date DESC").all();
  res.json(rows);
});

// ─── API: Create Invoice ─────────────────────────────────────────────────────
app.post("/api/invoices", (req, res) => {
  const { invoice_no, project_name, customer_name, billing_type, billing_date,
          amount, due_date, payment_status, payment_date, note } = req.body;
  if (!invoice_no || !project_name) return res.status(400).json({ error: "請求番号と案件名は必須です" });
  const result = db.prepare(
    "INSERT INTO invoices (invoice_no,project_name,customer_name,billing_type,billing_date,amount,due_date,payment_status,payment_date,note) VALUES (?,?,?,?,?,?,?,?,?,?)"
  ).run(invoice_no, project_name, customer_name||null, billing_type||null,
        billing_date||null, amount||null, due_date||null,
        payment_status||'未入金', payment_date||null, note||null);
  res.json({ ok: true, id: result.lastInsertRowid });
});

// ─── API: Update Invoice ─────────────────────────────────────────────────────
app.put("/api/invoices/:id", (req, res) => {
  const { invoice_no, project_name, customer_name, billing_type, billing_date,
          amount, due_date, payment_status, payment_date, note } = req.body;
  if (!invoice_no || !project_name) return res.status(400).json({ error: "請求番号と案件名は必須です" });
  db.prepare(
    "UPDATE invoices SET invoice_no=?,project_name=?,customer_name=?,billing_type=?,billing_date=?,amount=?,due_date=?,payment_status=?,payment_date=?,note=? WHERE id=?"
  ).run(invoice_no, project_name, customer_name||null, billing_type||null,
        billing_date||null, amount||null, due_date||null,
        payment_status||'未入金', payment_date||null, note||null, req.params.id);
  res.json({ ok: true });
});

// ─── API: Delete Invoice ─────────────────────────────────────────────────────
app.delete("/api/invoices/:id", (req, res) => {
  db.prepare("DELETE FROM invoices WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// ─── API: Employees ──────────────────────────────────────────────────────────
app.get("/api/employees", (req, res) => {
  res.json(db.prepare("SELECT * FROM employees ORDER BY id").all());
});

// ─── API: Employee Workload ───────────────────────────────────────────────────
app.get("/api/employees/workload", (req, res) => {
  const employees = db.prepare("SELECT * FROM employees ORDER BY id").all();
  const counts = db.prepare(`
    SELECT staff,
      COUNT(*) as total,
      SUM(CASE WHEN status='契約済'              THEN 1 ELSE 0 END) as in_progress,
      SUM(CASE WHEN status IN ('見積提出済','商談中') THEN 1 ELSE 0 END) as negotiating,
      SUM(CASE WHEN status IN ('現地調査済','初回訪問済') THEN 1 ELSE 0 END) as early,
      SUM(CASE WHEN status='失注'               THEN 1 ELSE 0 END) as lost
    FROM projects WHERE staff IS NOT NULL GROUP BY staff
  `).all();

  const countMap = {};
  for (const c of counts) countMap[c.staff] = c;

  const result = employees.map(e => {
    const surname = e.name.split(" ")[0];
    const c = countMap[surname] || { total: 0, in_progress: 0, negotiating: 0, early: 0, lost: 0 };
    return {
      ...e,
      surname,
      total_projects: c.total,
      in_progress:  c.in_progress,
      negotiating:  c.negotiating,
      early:        c.early,
      lost:         c.lost,
      active:       c.total - c.lost,
    };
  });

  res.json(result.sort((a, b) => b.active - a.active));
});

// ─── API: Create Employee ─────────────────────────────────────────────────────
app.post("/api/employees", (req, res) => {
  const { name, department, role, qualification, extension, mobile, email } = req.body;
  if (!name) return res.status(400).json({ error: "氏名は必須です" });
  const result = db.prepare(
    "INSERT INTO employees (name,department,role,qualification,extension,mobile,email) VALUES (?,?,?,?,?,?,?)"
  ).run(name, department||null, role||null, qualification||null,
        extension||null, mobile||null, email||null);
  res.json({ ok: true, id: result.lastInsertRowid });
});

// ─── API: Update Employee ─────────────────────────────────────────────────────
app.put("/api/employees/:id", (req, res) => {
  const { name, department, role, qualification, extension, mobile, email } = req.body;
  if (!name) return res.status(400).json({ error: "氏名は必須です" });
  db.prepare(
    "UPDATE employees SET name=?,department=?,role=?,qualification=?,extension=?,mobile=?,email=? WHERE id=?"
  ).run(name, department||null, role||null, qualification||null,
        extension||null, mobile||null, email||null, req.params.id);
  res.json({ ok: true });
});

// ─── API: Delete Employee ─────────────────────────────────────────────────────
app.delete("/api/employees/:id", (req, res) => {
  const emp = db.prepare("SELECT name FROM employees WHERE id=?").get(req.params.id);
  if (emp) {
    const surname = emp.name.split(" ")[0];
    db.prepare("UPDATE projects SET staff=NULL WHERE staff=?").run(surname);
    db.prepare("UPDATE customers SET staff=NULL WHERE staff=?").run(surname);
  }
  db.prepare("DELETE FROM employees WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// ─── API: Customers ──────────────────────────────────────────────────────────
app.get("/api/customers", (req, res) => {
  res.json(db.prepare("SELECT * FROM customers ORDER BY id").all());
});

// ─── API: Create Customer ─────────────────────────────────────────────────────
app.post("/api/customers", (req, res) => {
  const { name, address, building_type, age_years, phone, email, source, staff, note } = req.body;
  if (!name) return res.status(400).json({ error: "氏名は必須です" });
  const result = db.prepare(
    "INSERT INTO customers (name,address,building_type,age_years,phone,email,source,staff,note) VALUES (?,?,?,?,?,?,?,?,?)"
  ).run(name, address||null, building_type||null, age_years||null,
        phone||null, email||null, source||null, staff||null, note||null);
  res.json({ ok: true, id: result.lastInsertRowid });
});

// ─── API: Update Customer ─────────────────────────────────────────────────────
app.put("/api/customers/:id", (req, res) => {
  const { name, address, building_type, age_years, phone, email, source, staff, note } = req.body;
  if (!name) return res.status(400).json({ error: "氏名は必須です" });
  db.prepare(
    "UPDATE customers SET name=?,address=?,building_type=?,age_years=?,phone=?,email=?,source=?,staff=?,note=? WHERE id=?"
  ).run(name, address||null, building_type||null, age_years||null,
        phone||null, email||null, source||null, staff||null, note||null, req.params.id);
  res.json({ ok: true });
});

// ─── API: Delete Customer ─────────────────────────────────────────────────────
app.delete("/api/customers/:id", (req, res) => {
  db.prepare("DELETE FROM customers WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// ─── API: Staff Performance ──────────────────────────────────────────────────
app.get("/api/staff/performance", (req, res) => {
  const rows = db.prepare(
    "SELECT staff, COUNT(*) as total, " +
    "SUM(CASE WHEN status='契約済' THEN 1 ELSE 0 END) as contracted, " +
    "COALESCE(SUM(CASE WHEN status='契約済' THEN contract_amount ELSE 0 END),0) as revenue " +
    "FROM projects WHERE staff IS NOT NULL GROUP BY staff ORDER BY revenue DESC"
  ).all();
  res.json(rows);
});

app.listen(PORT, () => {
  console.log(`\n🌸 さくらリフォーム 経営ダッシュボード`);
  console.log(`   http://localhost:${PORT}\n`);
});
