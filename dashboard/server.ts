import express, { Request, Response } from "express";
import path from "path";
import { openDb, initSchema, importData, Project, Customer, Employee, Invoice, ProjectStatus } from "./db";

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Reject requests where Japanese text fields contain garbled characters (encoding mismatch)
const GARBLE_RE = /\?{2,}/;
const TEXT_FIELDS: string[] = [
  "name", "address", "note", "staff", "customer_name", "project_name",
  "building_type", "source", "work_type", "billing_type",
];
app.use((req: Request, res: Response, next) => {
  if (req.body && typeof req.body === "object") {
    for (const key of TEXT_FIELDS) {
      if (typeof req.body[key] === "string" && GARBLE_RE.test(req.body[key] as string)) {
        return res.status(400).json({ error: `フィールド「${key}」の文字コードが不正です。UTF-8で送信してください。` });
      }
    }
  }
  next();
});

// Initialize DB
const db = openDb();
initSchema(db);
importData(db);

// ─── Helper types for aggregate query rows ───────────────────────────────────

interface SummaryRow {
  count: number;
  total: number;
}

interface LostRow {
  count: number;
}

interface InvoiceSummaryRow {
  paid: number;
  unpaid: number;
}

interface StatusGroupRow {
  status: ProjectStatus;
  count: number;
  total: number;
}

interface TypeGroupRow {
  work_type: string;
  count: number;
  total: number;
}

interface MonthlyRow {
  month: string;
  count: number;
  total: number;
}

interface ProjectCountRow {
  c: number;
}

interface WorkloadCountRow {
  staff: string;
  total: number;
  in_progress: number;
  negotiating: number;
  early: number;
  lost: number;
}

interface StaffPerformanceRow {
  staff: string;
  total: number;
  contracted: number;
  revenue: number;
}

// ─── API: KPI Summary ───────────────────────────────────────────────────────
app.get("/api/summary", (_req: Request, res: Response) => {
  const contracted = db.prepare(
    "SELECT COUNT(*) as count, COALESCE(SUM(contract_amount),0) as total FROM projects WHERE status='契約済'"
  ).get() as SummaryRow;

  const pipeline = db.prepare(
    "SELECT COUNT(*) as count, COALESCE(SUM(estimate_amount),0) as total FROM projects WHERE status NOT IN ('契約済','失注','完了')"
  ).get() as SummaryRow;

  const lost = db.prepare(
    "SELECT COUNT(*) as count FROM projects WHERE status='失注'"
  ).get() as LostRow;

  const totalProjects = db.prepare("SELECT COUNT(*) as count FROM projects").get() as LostRow;

  const invoiceSummary = db.prepare(
    "SELECT COALESCE(SUM(CASE WHEN payment_status='入金済' THEN amount ELSE 0 END),0) as paid, " +
    "COALESCE(SUM(CASE WHEN payment_status!='入金済' THEN amount ELSE 0 END),0) as unpaid " +
    "FROM invoices"
  ).get() as InvoiceSummaryRow;

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
app.get("/api/projects/by-status", (_req: Request, res: Response) => {
  const rows = db.prepare(
    "SELECT status, COUNT(*) as count, COALESCE(SUM(COALESCE(contract_amount, estimate_amount)),0) as total FROM projects GROUP BY status ORDER BY count DESC"
  ).all() as StatusGroupRow[];
  res.json(rows);
});

// ─── API: Projects by Work Type ──────────────────────────────────────────────
app.get("/api/projects/by-type", (_req: Request, res: Response) => {
  const rows = db.prepare(
    "SELECT work_type, COUNT(*) as count, COALESCE(SUM(COALESCE(contract_amount, estimate_amount)),0) as total FROM projects GROUP BY work_type ORDER BY total DESC"
  ).all() as TypeGroupRow[];
  res.json(rows);
});

// ─── API: Monthly Contracted ─────────────────────────────────────────────────
app.get("/api/projects/monthly", (_req: Request, res: Response) => {
  // contract_date may be stored in two formats:
  //   - "YYYY/M/D" (legacy Excel import, month/day NOT zero-padded)
  //   - "YYYY-MM-DD" (ISO, from the CRUD form's HTML date picker)
  // SQLite's date()/strftime() cannot parse the slash format, so we branch on the
  // format and build a "YYYY-MM" label for each. For slash dates we extract the year
  // and month tokens and zero-pad the month with printf; for ISO dates substr(...,1,7)
  // already yields "YYYY-MM".
  const rows = db.prepare(
    "SELECT CASE WHEN contract_date LIKE '%/%' THEN " +
    "  printf('%s-%02d', " +
    "    substr(contract_date, 1, instr(contract_date, '/') - 1), " +
    "    CAST(substr(substr(contract_date, instr(contract_date, '/') + 1), 1, " +
    "      instr(substr(contract_date, instr(contract_date, '/') + 1) || '/', '/') - 1) AS INTEGER)" +
    "  ) " +
    "ELSE substr(contract_date, 1, 7) END as month, " +
    "COUNT(*) as count, SUM(contract_amount) as total " +
    "FROM projects WHERE status='契約済' AND contract_date IS NOT NULL " +
    "GROUP BY month ORDER BY month"
  ).all() as MonthlyRow[];
  res.json(rows);
});

// ─── API: Project List ───────────────────────────────────────────────────────
app.get("/api/projects", (req: Request, res: Response) => {
  const { status, type } = req.query as { status?: string; type?: string };
  let sql = "SELECT *, CAST(probability AS TEXT) as probability FROM projects WHERE 1=1";
  const params: string[] = [];
  if (status) { sql += " AND status=?"; params.push(status); }
  if (type)   { sql += " AND work_type=?"; params.push(type); }
  sql += " ORDER BY id DESC";
  const rows = (db.prepare(sql).all(...params) as Project[]).map(r => ({
    ...r,
    probability: r.probability ? r.probability.replace(/\.0$/, "") : r.probability,
  }));
  res.json(rows);
});

// ─── API: Create Project ─────────────────────────────────────────────────────
app.post("/api/projects", (req: Request, res: Response) => {
  const {
    name, customer_name, address, work_type, staff, status, probability,
    estimate_amount, first_visit, scheduled_start, contract_date, contract_amount, note,
  }: Partial<Project> = req.body;
  if (!name || !customer_name) return res.status(400).json({ error: "案件名と顧客名は必須です" });
  const result = db.prepare(`
    INSERT INTO projects (name,customer_name,address,work_type,staff,status,probability,
      estimate_amount,first_visit,scheduled_start,contract_date,contract_amount,note)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    name, customer_name, address ?? null, work_type ?? null, staff ?? null,
    status ?? "初回訪問済", probability ?? null, estimate_amount ?? null,
    first_visit ?? null, scheduled_start ?? null, contract_date ?? null,
    contract_amount ?? null, note ?? null,
  );
  res.json({ ok: true, id: result.lastInsertRowid });
});

// ─── API: Update Project Staff Only ──────────────────────────────────────────
app.put("/api/projects/:id/staff", (req: Request, res: Response) => {
  const { staff }: { staff?: string } = req.body;
  const result = db.prepare("UPDATE projects SET staff=? WHERE id=?").run(staff ?? null, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: "案件が見つかりません" });
  res.json({ ok: true });
});

// ─── API: Update Project ─────────────────────────────────────────────────────
app.put("/api/projects/:id", (req: Request, res: Response) => {
  const {
    name, customer_name, address, work_type, staff, status, probability,
    estimate_amount, first_visit, scheduled_start, contract_date, contract_amount, note,
  }: Partial<Project> = req.body;
  if (!name || !customer_name) return res.status(400).json({ error: "案件名と顧客名は必須です" });
  const result = db.prepare(`
    UPDATE projects SET name=?,customer_name=?,address=?,work_type=?,staff=?,status=?,
      probability=?,estimate_amount=?,first_visit=?,scheduled_start=?,
      contract_date=?,contract_amount=?,note=? WHERE id=?
  `).run(
    name, customer_name, address ?? null, work_type ?? null, staff ?? null, status,
    probability ?? null, estimate_amount ?? null, first_visit ?? null, scheduled_start ?? null,
    contract_date ?? null, contract_amount ?? null, note ?? null, req.params.id,
  );
  if (result.changes === 0) return res.status(404).json({ error: "案件が見つかりません" });
  res.json({ ok: true });
});

// ─── API: Delete Project ─────────────────────────────────────────────────────
app.delete("/api/projects/:id", (req: Request, res: Response) => {
  const result = db.prepare("DELETE FROM projects WHERE id=?").run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: "案件が見つかりません" });
  res.json({ ok: true });
});

// ─── API: Invoices ───────────────────────────────────────────────────────────
app.get("/api/invoices", (_req: Request, res: Response) => {
  const rows = db.prepare("SELECT * FROM invoices ORDER BY billing_date DESC").all() as Invoice[];
  res.json(rows);
});

// ─── API: Create Invoice ─────────────────────────────────────────────────────
app.post("/api/invoices", (req: Request, res: Response) => {
  const {
    invoice_no, project_name, customer_name, billing_type, billing_date,
    amount, due_date, payment_status, payment_date, note,
  }: Partial<Invoice> = req.body;
  if (!invoice_no || !project_name) return res.status(400).json({ error: "請求番号と案件名は必須です" });
  const result = db.prepare(
    "INSERT INTO invoices (invoice_no,project_name,customer_name,billing_type,billing_date,amount,due_date,payment_status,payment_date,note) VALUES (?,?,?,?,?,?,?,?,?,?)"
  ).run(
    invoice_no, project_name, customer_name ?? null, billing_type ?? null,
    billing_date ?? null, amount ?? null, due_date ?? null,
    payment_status ?? "未入金", payment_date ?? null, note ?? null,
  );
  res.json({ ok: true, id: result.lastInsertRowid });
});

// ─── API: Update Invoice ─────────────────────────────────────────────────────
app.put("/api/invoices/:id", (req: Request, res: Response) => {
  const {
    invoice_no, project_name, customer_name, billing_type, billing_date,
    amount, due_date, payment_status, payment_date, note,
  }: Partial<Invoice> = req.body;
  if (!invoice_no || !project_name) return res.status(400).json({ error: "請求番号と案件名は必須です" });
  const result = db.prepare(
    "UPDATE invoices SET invoice_no=?,project_name=?,customer_name=?,billing_type=?,billing_date=?,amount=?,due_date=?,payment_status=?,payment_date=?,note=? WHERE id=?"
  ).run(
    invoice_no, project_name, customer_name ?? null, billing_type ?? null,
    billing_date ?? null, amount ?? null, due_date ?? null,
    payment_status ?? "未入金", payment_date ?? null, note ?? null, req.params.id,
  );
  if (result.changes === 0) return res.status(404).json({ error: "請求データが見つかりません" });
  res.json({ ok: true });
});

// ─── API: Delete Invoice ─────────────────────────────────────────────────────
app.delete("/api/invoices/:id", (req: Request, res: Response) => {
  const result = db.prepare("DELETE FROM invoices WHERE id=?").run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: "請求データが見つかりません" });
  res.json({ ok: true });
});

// ─── API: Employees ──────────────────────────────────────────────────────────
app.get("/api/employees", (_req: Request, res: Response) => {
  res.json(db.prepare("SELECT * FROM employees ORDER BY id").all() as Employee[]);
});

// ─── API: Employee Workload ───────────────────────────────────────────────────
app.get("/api/employees/workload", (_req: Request, res: Response) => {
  const employees = db.prepare("SELECT * FROM employees ORDER BY id").all() as Employee[];
  const counts = db.prepare(`
    SELECT staff,
      COUNT(*) as total,
      SUM(CASE WHEN status='契約済'              THEN 1 ELSE 0 END) as in_progress,
      SUM(CASE WHEN status IN ('見積提出済','商談中') THEN 1 ELSE 0 END) as negotiating,
      SUM(CASE WHEN status IN ('現地調査済','初回訪問済') THEN 1 ELSE 0 END) as early,
      SUM(CASE WHEN status='失注'               THEN 1 ELSE 0 END) as lost
    FROM projects WHERE staff IS NOT NULL GROUP BY staff
  `).all() as WorkloadCountRow[];

  const countMap: Record<string, WorkloadCountRow> = {};
  for (const c of counts) countMap[c.staff] = c;

  const result = employees.map(e => {
    const surname = e.name.split(" ")[0];
    const c = countMap[surname] ?? { total: 0, in_progress: 0, negotiating: 0, early: 0, lost: 0 };
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
app.post("/api/employees", (req: Request, res: Response) => {
  const { name, department, role, qualification, extension, mobile, email }: Partial<Employee> = req.body;
  if (!name) return res.status(400).json({ error: "氏名は必須です" });
  const result = db.prepare(
    "INSERT INTO employees (name,department,role,qualification,extension,mobile,email) VALUES (?,?,?,?,?,?,?)"
  ).run(
    name, department ?? null, role ?? null, qualification ?? null,
    extension ?? null, mobile ?? null, email ?? null,
  );
  res.json({ ok: true, id: result.lastInsertRowid });
});

// ─── API: Update Employee ─────────────────────────────────────────────────────
app.put("/api/employees/:id", (req: Request, res: Response) => {
  const { name, department, role, qualification, extension, mobile, email }: Partial<Employee> = req.body;
  if (!name) return res.status(400).json({ error: "氏名は必須です" });
  const result = db.prepare(
    "UPDATE employees SET name=?,department=?,role=?,qualification=?,extension=?,mobile=?,email=? WHERE id=?"
  ).run(
    name, department ?? null, role ?? null, qualification ?? null,
    extension ?? null, mobile ?? null, email ?? null, req.params.id,
  );
  if (result.changes === 0) return res.status(404).json({ error: "社員が見つかりません" });
  res.json({ ok: true });
});

// ─── API: Delete Employee ─────────────────────────────────────────────────────
app.delete("/api/employees/:id", (req: Request, res: Response) => {
  const emp = db.prepare("SELECT name FROM employees WHERE id=?").get(req.params.id) as Pick<Employee, "name"> | undefined;
  if (!emp) return res.status(404).json({ error: "社員が見つかりません" });
  // Surname is the first token, splitting on either ASCII (U+0020) or full-width (U+3000) space.
  const surname = emp.name.split(/[ 　]/)[0];
  db.prepare("UPDATE projects SET staff=NULL WHERE staff=?").run(surname);
  db.prepare("UPDATE customers SET staff=NULL WHERE staff=?").run(surname);
  db.prepare("DELETE FROM employees WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// ─── API: Customers ──────────────────────────────────────────────────────────
app.get("/api/customers", (_req: Request, res: Response) => {
  res.json(db.prepare("SELECT * FROM customers ORDER BY id").all() as Customer[]);
});

// ─── API: Create Customer ─────────────────────────────────────────────────────
app.post("/api/customers", (req: Request, res: Response) => {
  const { name, address, building_type, age_years, phone, email, source, staff, note }: Partial<Customer> = req.body;
  if (!name) return res.status(400).json({ error: "氏名は必須です" });
  const result = db.prepare(
    "INSERT INTO customers (name,address,building_type,age_years,phone,email,source,staff,note) VALUES (?,?,?,?,?,?,?,?,?)"
  ).run(
    name, address ?? null, building_type ?? null, age_years ?? null,
    phone ?? null, email ?? null, source ?? null, staff ?? null, note ?? null,
  );
  res.json({ ok: true, id: result.lastInsertRowid });
});

// ─── API: Update Customer ─────────────────────────────────────────────────────
app.put("/api/customers/:id", (req: Request, res: Response) => {
  const { name, address, building_type, age_years, phone, email, source, staff, note }: Partial<Customer> = req.body;
  if (!name) return res.status(400).json({ error: "氏名は必須です" });
  const result = db.prepare(
    "UPDATE customers SET name=?,address=?,building_type=?,age_years=?,phone=?,email=?,source=?,staff=?,note=? WHERE id=?"
  ).run(
    name, address ?? null, building_type ?? null, age_years ?? null,
    phone ?? null, email ?? null, source ?? null, staff ?? null, note ?? null, req.params.id,
  );
  if (result.changes === 0) return res.status(404).json({ error: "顧客が見つかりません" });
  res.json({ ok: true });
});

// ─── API: Delete Customer ─────────────────────────────────────────────────────
app.delete("/api/customers/:id", (req: Request, res: Response) => {
  const result = db.prepare("DELETE FROM customers WHERE id=?").run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: "顧客が見つかりません" });
  res.json({ ok: true });
});

// ─── API: Staff Performance ──────────────────────────────────────────────────
app.get("/api/staff/performance", (_req: Request, res: Response) => {
  const rows = db.prepare(
    "SELECT staff, COUNT(*) as total, " +
    "SUM(CASE WHEN status='契約済' THEN 1 ELSE 0 END) as contracted, " +
    "COALESCE(SUM(CASE WHEN status='契約済' THEN contract_amount ELSE 0 END),0) as revenue " +
    "FROM projects WHERE staff IS NOT NULL GROUP BY staff ORDER BY revenue DESC"
  ).all() as StaffPerformanceRow[];
  res.json(rows);
});

app.listen(PORT, () => {
  console.log(`\n🌸 さくらリフォーム 経営ダッシュボード`);
  console.log(`   http://localhost:${PORT}\n`);
});
