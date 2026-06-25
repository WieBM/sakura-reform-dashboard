# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Rule**: Update this file whenever making significant changes to the codebase (new features, schema changes, new endpoints, architectural decisions).

## Project Overview

A **Sales Management Dashboard** for a renovation company (さくらリフォーム 経営ダッシュボード). Evolved from a read-only analytics view into a full CRUD management system. The company president can view business KPIs and also add/edit/delete customers, projects, employees, and invoices directly from the browser.

## Data Sources

All source data lives in `HandsOn_資料/` as Excel files:

| File | Contents |
|------|----------|
| `社員名簿.xlsx` | Employee master data |
| `案件管理表.xlsx` | Project/case management |
| `顧客管理台帳.xlsx` | Customer ledger |
| `見積明細一覧.xlsx` | Quotation details |
| `請求・入金管理表.xlsx` | Billing and payment tracking |
| `工事サービス標準単価表.xlsx` | Service pricing table |

Data is imported from these Excel files into SQLite on first run (skipped if already seeded).

## Application Features

1. **STEP 2 — Core dashboard**: Import Excel data into SQLite; web app showing KPIs, charts, and recent projects.
2. **STEP 4 — Employee assignment**: Per-project employee assignment UI with workload visibility.
3. **STEP 5 — Full CRUD**: Add, edit, and delete customers, projects, employees, and invoices via modal forms in the browser.

## Tech Stack

- **Backend**: Express.js (Node.js) — `dashboard/server.js`
- **Database**: SQLite via `better-sqlite3` — file: `dashboard/sakura.db`
- **Data import**: `dashboard/db.js` — reads `.xlsx` on first run, seeds SQLite
- **Frontend**: Single-page HTML — `dashboard/public/index.html` (Chart.js via CDN, no build step)

## Running the App

```
cd dashboard
npm start        # starts on http://localhost:3000
```

## Database Schema

6 tables in `sakura.db`:

| Table | Key columns |
|-------|-------------|
| `employees` | id, name, department, role, qualification, extension, mobile, email |
| `customers` | id, name, address, building_type, age_years, phone, email, source, staff, note |
| `projects` | id, name, customer_name, address, work_type, staff, status, probability, estimate_amount, first_visit, scheduled_start, contract_date, contract_amount, note |
| `estimates` | id, quote_no, customer_name, title, service, qty, unit_price, subtotal, created_date, expiry_date, note |
| `invoices` | id, invoice_no, project_name, customer_name, billing_type, billing_date, amount, due_date, payment_status, payment_date, note |
| `services` | id, name, category, standard_price, unit, duration, note |

**Important**: `projects.staff` and `customers.staff` store the employee's **surname only** (e.g. `"田中"`), not the full name. Deleting an employee auto-nulls their staff references in projects and customers.

**Known DB value constraints** (form fields must match these exactly):
- `projects.work_type`: `外装` / `内装` / `水回り` / `省エネ` / `建具` / `バリアフリー`
- `invoices.payment_status`: `入金済` / `未入金` (note: `入金待ち` does not exist in the DB)
- `customers.building_type`: `一戸建て` / `マンション` / `アパート` / `その他`
- Dates are stored as `YYYY/M/D` (single-digit month/day, slash-separated) — not ISO format

## API Endpoints

### Read (GET)

| Endpoint | Description |
|----------|-------------|
| `GET /api/summary` | KPI summary (contracted total, pipeline, paid/unpaid) |
| `GET /api/projects` | All projects (filter: `?status=契約済&type=外装`) |
| `GET /api/projects/by-status` | Project counts grouped by status |
| `GET /api/projects/by-type` | Amounts grouped by work type |
| `GET /api/projects/monthly` | Monthly contracted amounts |
| `GET /api/invoices` | All invoices |
| `GET /api/employees` | Employee list |
| `GET /api/employees/workload` | Employees with project counts by status |
| `GET /api/customers` | Customer list |
| `GET /api/staff/performance` | Per-staff contracted count and revenue |

### Create / Update / Delete (CRUD)

| Endpoint | Description |
|----------|-------------|
| `POST /api/customers` | Create customer |
| `PUT /api/customers/:id` | Update customer |
| `DELETE /api/customers/:id` | Delete customer |
| `POST /api/projects` | Create project |
| `PUT /api/projects/:id` | Update project (all fields) |
| `PUT /api/projects/:id/staff` | Update project staff only |
| `DELETE /api/projects/:id` | Delete project |
| `POST /api/employees` | Create employee |
| `PUT /api/employees/:id` | Update employee |
| `DELETE /api/employees/:id` | Delete employee (auto-unassigns from projects/customers) |
| `POST /api/invoices` | Create invoice |
| `PUT /api/invoices/:id` | Update invoice |
| `DELETE /api/invoices/:id` | Delete invoice |

**API behaviour**: All PUT/DELETE endpoints return `404` if the target ID does not exist (`result.changes === 0`). Previously returned `200` silently.

## Frontend Structure

Single-page app with 6 sidebar pages: Dashboard, 案件管理, 請求・入金, 顧客台帳, 社員管理, 担当者実績.

Key frontend patterns:
- Page data is cached in `allProjects`, `allCustomers`, `allInvoices`, `allEmployees` arrays.
- `loaded[page]` flag prevents redundant fetches; set to `false` then call `loadXxx()` to force reload.
- After any CRUD save/delete, re-fetch the relevant array and call `renderXxx()` directly — do NOT call `loadXxx()` again (it re-binds event listeners).
- Form modals use `.modal-overlay` + `.form-modal` CSS classes; open with `.classList.add('open')`, close with `closeFormModal(id)`.
- Toast notifications via `showToast(msg, type)` (`type`: `'success'` or `'error'`).
- `esc(str)` helper escapes single quotes for inline `onclick` attributes.
- `toInputDate(str)` converts `YYYY/M/D` → `YYYY-MM-DD` for HTML date inputs (zero-pads single-digit month/day). **Note**: DB stores dates as `YYYY/M/D` (not zero-padded), so always use this helper when populating `<input type="date">`.
- `refreshDashboardKPIs()` re-fetches `/api/summary` and updates the 4 KPI cards only — call after any project/invoice CRUD to keep the dashboard fresh without a full re-render.
- `populateDatalist(id, values)` dynamically fills a `<datalist>` element. Used for `source` (customer) and `work_type` (project) to keep suggestions in sync with actual DB values.

## AI Agent Workflow

Two custom agents are available in `.claude/agents/` for automated QA and bug fixing:

| Agent | File | Role |
|-------|------|------|
| `sakura-ux-qa-auditor` | `.claude/agents/sakura-ux-qa-auditor.md` | Playwright-based UX audit — finds bugs, saves a report, does NOT modify code |
| `sakura-bug-fixer` | `.claude/agents/sakura-bug-fixer.md` | Reads a bug report and applies targeted fixes to `server.js` / `index.html` |

### Report Naming Convention

All AI-generated reports are saved to `dashboard/claude-reports/` following this format:

| Type | Pattern | Example |
|------|---------|---------|
| Bug audit | `BUG_REPORT_YYYY-MM-DD.md` | `BUG_REPORT_2026-06-25.md` |
| UX audit | `AUDIT_REPORT_YYYY-MM-DD.md` | `AUDIT_REPORT_2026-06-25.md` |
| Fix report | `FIX_REPORT_YYYY-MM-DD.md` | `FIX_REPORT_2026-06-25.md` |

If multiple reports exist for the same date, append `_2`, `_3`, etc. File names must be **UPPERCASE with underscores**.

### Pre-push Checklist

Run `/wrap-up` before every `git push` to automatically verify:
1. CLAUDE.md updated after significant changes
2. Report file names follow `TYPE_YYYY-MM-DD.md` convention
3. Every `BUG_REPORT_N` has a matching `FIX_REPORT_N`
4. No unstaged files
5. `claude-reports/README.md` in sync with actual files

Past mistake log: `.claude/commands/references/past-mistakes.md`

## Efficient Incremental Testing Workflow

Rules for testing only what changed — no redundant checks, no wasted tokens.

### 1. State Tracking File
All test pass history is recorded and managed in `docs/test_pass_log.md`.

### 2. Pre-Test Check
Before running any test, always run `git status` or `git diff` to identify changed files, then compare against `test_pass_log.md`.

### 3. No Redundant Testing (Token Efficiency)
Components or pages that previously passed and have had **no code changes since** must **never be re-tested**.

### 4. Log Update
Once a test passes for a modified section, immediately append one line to the bottom of `docs/test_pass_log.md` in this format:

```
[Date] | [Changed file / page] | [Test description] | PASS
```

---

## Project Status

| # | Feature | Status |
|---|---------|--------|
| STEP 2 | Core dashboard (KPIs, charts, read-only tables) | ✅ Done |
| STEP 4 | Employee assignment modal per project | ✅ Done |
| STEP 5 | Full CRUD for customers, projects, employees, invoices | ✅ Done |
