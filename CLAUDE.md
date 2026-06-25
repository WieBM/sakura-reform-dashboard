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

## Frontend Structure

Single-page app with 6 sidebar pages: Dashboard, 案件管理, 請求・入金, 顧客台帳, 社員管理, 担当者実績.

Key frontend patterns:
- Page data is cached in `allProjects`, `allCustomers`, `allInvoices`, `allEmployees` arrays.
- `loaded[page]` flag prevents redundant fetches; set to `false` then call `loadXxx()` to force reload.
- After any CRUD save/delete, re-fetch the relevant array and call `renderXxx()` directly — do NOT call `loadXxx()` again (it re-binds event listeners).
- Form modals use `.modal-overlay` + `.form-modal` CSS classes; open with `.classList.add('open')`, close with `closeFormModal(id)`.
- Toast notifications via `showToast(msg, type)` (`type`: `'success'` or `'error'`).
- `esc(str)` helper escapes single quotes for inline `onclick` attributes.
- `toInputDate(str)` converts `YYYY/MM/DD` → `YYYY-MM-DD` for HTML date inputs.

## Project Status

| # | Feature | Status |
|---|---------|--------|
| STEP 2 | Core dashboard (KPIs, charts, read-only tables) | ✅ Done |
| STEP 4 | Employee assignment modal per project | ✅ Done |
| STEP 5 | Full CRUD for customers, projects, employees, invoices | ✅ Done |
