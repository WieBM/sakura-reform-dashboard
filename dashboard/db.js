const Database = require("better-sqlite3");
const XLSX = require("xlsx");
const path = require("path");

const DB_PATH = path.join(__dirname, "sakura.db");
const DATA_DIR = path.join(__dirname, "../HandsOn_資料");

function openDb() {
  return new Database(DB_PATH);
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT, department TEXT, role TEXT, qualification TEXT,
      extension TEXT, mobile TEXT, email TEXT
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT, address TEXT, building_type TEXT, age_years INTEGER,
      phone TEXT, email TEXT, source TEXT, staff TEXT, note TEXT
    );

    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT, customer_name TEXT, address TEXT, work_type TEXT,
      staff TEXT, status TEXT, probability TEXT,
      estimate_amount INTEGER, first_visit TEXT,
      scheduled_start TEXT, contract_date TEXT,
      contract_amount INTEGER, note TEXT
    );

    CREATE TABLE IF NOT EXISTS estimates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quote_no TEXT, customer_name TEXT, title TEXT, service TEXT,
      qty REAL, unit_price INTEGER, subtotal INTEGER,
      created_date TEXT, expiry_date TEXT, note TEXT
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_no TEXT, project_name TEXT, customer_name TEXT,
      billing_type TEXT, billing_date TEXT, amount INTEGER,
      due_date TEXT, payment_status TEXT, payment_date TEXT, note TEXT
    );

    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT, category TEXT, standard_price INTEGER,
      unit TEXT, duration TEXT, note TEXT
    );
  `);
}

function parseDate(val) {
  if (!val) return null;
  if (typeof val === "number") {
    const d = XLSX.SSF.parse_date_code(val);
    return `${d.y}/${String(d.m).padStart(2, "0")}/${String(d.d).padStart(2, "0")}`;
  }
  return String(val);
}

function importData(db) {
  const count = db.prepare("SELECT COUNT(*) as c FROM projects").get();
  if (count.c > 0) return; // already imported

  // Employees
  const empWb = XLSX.readFile(path.join(DATA_DIR, "社員名簿.xlsx"));
  const empRows = XLSX.utils.sheet_to_json(empWb.Sheets["社員"], { header: 1, defval: null });
  const insEmp = db.prepare("INSERT INTO employees (name,department,role,qualification,extension,mobile,email) VALUES (?,?,?,?,?,?,?)");
  for (const r of empRows.slice(4)) {
    if (!r[0]) continue;
    insEmp.run(r[0], r[1], r[2], r[3], r[4], r[5], r[6]);
  }

  // Customers
  const cusWb = XLSX.readFile(path.join(DATA_DIR, "顧客管理台帳.xlsx"));
  const cusRows = XLSX.utils.sheet_to_json(cusWb.Sheets["顧客"], { header: 1, defval: null });
  const insCus = db.prepare("INSERT INTO customers (name,address,building_type,age_years,phone,email,source,staff,note) VALUES (?,?,?,?,?,?,?,?,?)");
  for (const r of cusRows.slice(4)) {
    if (!r[0]) continue;
    insCus.run(r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8]);
  }

  // Projects
  const prjWb = XLSX.readFile(path.join(DATA_DIR, "案件管理表.xlsx"));
  const prjRows = XLSX.utils.sheet_to_json(prjWb.Sheets["案件"], { header: 1, defval: null });
  const insPrj = db.prepare(`INSERT INTO projects
    (name,customer_name,address,work_type,staff,status,probability,
     estimate_amount,first_visit,scheduled_start,contract_date,contract_amount,note)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const r of prjRows.slice(4)) {
    if (!r[0]) continue;
    insPrj.run(
      r[0], r[1], r[2], r[3], r[4], r[5], r[6],
      r[7], parseDate(r[8]), parseDate(r[9]), parseDate(r[10]), r[11], r[12]
    );
  }

  // Estimates
  const estWb = XLSX.readFile(path.join(DATA_DIR, "見積明細一覧.xlsx"));
  const estRows = XLSX.utils.sheet_to_json(estWb.Sheets["見積"], { header: 1, defval: null });
  const insEst = db.prepare("INSERT INTO estimates (quote_no,customer_name,title,service,qty,unit_price,subtotal,created_date,expiry_date,note) VALUES (?,?,?,?,?,?,?,?,?,?)");
  for (const r of estRows.slice(4)) {
    if (!r[0]) continue;
    insEst.run(r[0], r[1], r[2], r[3], r[4], r[5], r[6], parseDate(r[7]), parseDate(r[8]), r[9]);
  }

  // Invoices
  const invWb = XLSX.readFile(path.join(DATA_DIR, "請求・入金管理表.xlsx"));
  const invRows = XLSX.utils.sheet_to_json(invWb.Sheets["請求"], { header: 1, defval: null });
  const insInv = db.prepare("INSERT INTO invoices (invoice_no,project_name,customer_name,billing_type,billing_date,amount,due_date,payment_status,payment_date,note) VALUES (?,?,?,?,?,?,?,?,?,?)");
  for (const r of invRows.slice(4)) {
    if (!r[0]) continue;
    insInv.run(r[0], r[1], r[2], r[3], parseDate(r[4]), r[5], parseDate(r[6]), r[7], parseDate(r[8]), r[9]);
  }

  // Services
  const svcWb = XLSX.readFile(path.join(DATA_DIR, "工事サービス標準単価表.xlsx"));
  const svcRows = XLSX.utils.sheet_to_json(svcWb.Sheets["工事サービス"], { header: 1, defval: null });
  const insSvc = db.prepare("INSERT INTO services (name,category,standard_price,unit,duration,note) VALUES (?,?,?,?,?,?)");
  for (const r of svcRows.slice(4)) {
    if (!r[0]) continue;
    insSvc.run(r[0], r[1], r[2], r[3], r[4], r[5]);
  }

  console.log("✅ Excel data imported to SQLite");
}

module.exports = { openDb, initSchema, importData };
