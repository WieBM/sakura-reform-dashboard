import Database from "better-sqlite3";
import * as XLSX from "xlsx";
import path from "path";

const DB_PATH = path.join(__dirname, "sakura.db");
const DATA_DIR = path.join(__dirname, "../HandsOn_資料");

// ─── Domain types ────────────────────────────────────────────────────────────

export type ProjectStatus =
  | "初回訪問済" | "現地調査済" | "商談中" | "見積提出済"
  | "契約済" | "完了" | "失注";

export type WorkType = "外装" | "内装" | "水回り" | "省エネ" | "建具" | "バリアフリー";
export type BuildingType = "一戸建て" | "マンション" | "アパート" | "その他";
export type PaymentStatus = "入金済" | "未入金";
export type BillingType = "一括" | "分割";

export interface Employee {
  id: number;
  name: string;
  department: string | null;
  role: string | null;
  qualification: string | null;
  extension: string | null;
  mobile: string | null;
  email: string | null;
}

export interface Customer {
  id: number;
  name: string;
  address: string | null;
  building_type: BuildingType | null;
  age_years: number | null;
  phone: string | null;
  email: string | null;
  source: string | null;
  staff: string | null;
  note: string | null;
}

export interface Project {
  id: number;
  name: string;
  customer_name: string;
  address: string | null;
  work_type: WorkType | null;
  staff: string | null;
  status: ProjectStatus;
  probability: string | null;
  estimate_amount: number | null;
  first_visit: string | null;
  scheduled_start: string | null;
  contract_date: string | null;
  contract_amount: number | null;
  note: string | null;
}

export interface Invoice {
  id: number;
  invoice_no: string;
  project_name: string;
  customer_name: string;
  billing_type: BillingType | null;
  billing_date: string | null;
  amount: number;
  due_date: string | null;
  payment_status: PaymentStatus;
  payment_date: string | null;
  note: string | null;
}

export interface Estimate {
  id: number;
  quote_no: string;
  customer_name: string;
  title: string | null;
  service: string | null;
  qty: number | null;
  unit_price: number | null;
  subtotal: number | null;
  created_date: string | null;
  expiry_date: string | null;
  note: string | null;
}

export interface Service {
  id: number;
  name: string;
  category: string | null;
  standard_price: number | null;
  unit: string | null;
  duration: string | null;
  note: string | null;
}

// ─── DB helpers ──────────────────────────────────────────────────────────────

export function openDb(): Database.Database {
  return new Database(DB_PATH);
}

export function initSchema(db: Database.Database): void {
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

function parseDate(val: unknown): string | null {
  if (!val) return null;
  if (typeof val === "number") {
    const d = XLSX.SSF.parse_date_code(val);
    return `${d.y}/${d.m}/${d.d}`;
  }
  return String(val);
}

export function importData(db: Database.Database): void {
  const count = db.prepare("SELECT COUNT(*) as c FROM projects").get() as { c: number };
  if (count.c > 0) return;

  const read = (file: string, sheet: string): unknown[][] =>
    XLSX.utils.sheet_to_json(
      XLSX.readFile(path.join(DATA_DIR, file)).Sheets[sheet],
      { header: 1, defval: null }
    ) as unknown[][];

  const insEmp = db.prepare(
    "INSERT INTO employees (name,department,role,qualification,extension,mobile,email) VALUES (?,?,?,?,?,?,?)"
  );
  for (const r of read("社員名簿.xlsx", "社員").slice(4)) {
    if (!r[0]) continue;
    insEmp.run(r[0], r[1], r[2], r[3], r[4], r[5], r[6]);
  }

  const insCus = db.prepare(
    "INSERT INTO customers (name,address,building_type,age_years,phone,email,source,staff,note) VALUES (?,?,?,?,?,?,?,?,?)"
  );
  for (const r of read("顧客管理台帳.xlsx", "顧客").slice(4)) {
    if (!r[0]) continue;
    insCus.run(r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8]);
  }

  const insPrj = db.prepare(`
    INSERT INTO projects
      (name,customer_name,address,work_type,staff,status,probability,
       estimate_amount,first_visit,scheduled_start,contract_date,contract_amount,note)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  for (const r of read("案件管理表.xlsx", "案件").slice(4)) {
    if (!r[0]) continue;
    insPrj.run(
      r[0], r[1], r[2], r[3], r[4], r[5], r[6],
      r[7], parseDate(r[8]), parseDate(r[9]), parseDate(r[10]), r[11], r[12]
    );
  }

  const insEst = db.prepare(
    "INSERT INTO estimates (quote_no,customer_name,title,service,qty,unit_price,subtotal,created_date,expiry_date,note) VALUES (?,?,?,?,?,?,?,?,?,?)"
  );
  for (const r of read("見積明細一覧.xlsx", "見積").slice(4)) {
    if (!r[0]) continue;
    insEst.run(r[0], r[1], r[2], r[3], r[4], r[5], r[6], parseDate(r[7]), parseDate(r[8]), r[9]);
  }

  const insInv = db.prepare(
    "INSERT INTO invoices (invoice_no,project_name,customer_name,billing_type,billing_date,amount,due_date,payment_status,payment_date,note) VALUES (?,?,?,?,?,?,?,?,?,?)"
  );
  for (const r of read("請求・入金管理表.xlsx", "請求").slice(4)) {
    if (!r[0]) continue;
    insInv.run(r[0], r[1], r[2], r[3], parseDate(r[4]), r[5], parseDate(r[6]), r[7], parseDate(r[8]), r[9]);
  }

  const insSvc = db.prepare(
    "INSERT INTO services (name,category,standard_price,unit,duration,note) VALUES (?,?,?,?,?,?)"
  );
  for (const r of read("工事サービス標準単価表.xlsx", "工事サービス").slice(4)) {
    if (!r[0]) continue;
    insSvc.run(r[0], r[1], r[2], r[3], r[4], r[5]);
  }

  console.log("✅ Excel data imported to SQLite");
}
