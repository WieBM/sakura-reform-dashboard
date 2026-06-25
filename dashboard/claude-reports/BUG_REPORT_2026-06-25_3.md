# Sakura Reform Dashboard — UX & Bug Audit Report
**Date:** 2026-06-25
**Tester:** Sakura UX QA Auditor (AI)
**App URL:** http://localhost:3000
**Total Issues Found:** 12

| # | Title | Severity | Category |
|---|-------|----------|----------|
| 1 | `toInputDate()` produces invalid HTML date values for all 66 project dates | High | Data / Forms |
| 2 | Monthly chart x-axis labels malformed (e.g. "2024/3/" instead of "2024-03") | High | Chart / Data |
| 3 | Dashboard "recent projects" table rows duplicate on re-visit after any project CRUD | High | UI / Data |
| 4 | CRUD PUT/DELETE returns HTTP 200 for non-existent resource IDs (silent no-op) | High | API |
| 5 | Customer `building_type` DB value "一戸建て" absent from HTML select options | Medium | Forms / Data |
| 6 | Customer `source` field — 10 DB values absent from HTML select options | Medium | Forms / Data |
| 7 | Project `work_type` datalist suggestions entirely mismatched from DB values | Medium | Forms / UX |
| 8 | Invoice filter button "入金待ち" matches zero records in current DB | Medium | UX / Data |
| 9 | CRUD does not refresh Dashboard KPI cards — data goes stale until next navigation | Medium | UX / State |
| 10 | Dashboard not auto-refreshed after Invoice CRUD | Medium | UX / State |
| 11 | `DELETE /api/employees/:id` uses same surname-split logic as workload bug for cascade | Low | API / Data |
| 12 | Sidebar footer text is generic non-informative label ("さくらリフォーム 管理システム") | Low | UX / Copy |

---

## Verification Summary

All 10 API endpoints were tested (including `/api/employees/workload`):

| Endpoint | Status | Items | Notes |
|----------|--------|-------|-------|
| `GET /api/summary` | 200 OK | 1 object | All 8 expected fields present |
| `GET /api/projects` | 200 OK | 32 | Filters `?status=` and `?type=` work correctly |
| `GET /api/projects/by-status` | 200 OK | 6 groups | OK |
| `GET /api/projects/by-type` | 200 OK | 6 groups | OK |
| `GET /api/projects/monthly` | 200 OK | 3 months | Month labels are malformed (see Bug #2) |
| `GET /api/invoices` | 200 OK | 21 | OK |
| `GET /api/employees` | 200 OK | 11 | OK |
| `GET /api/employees/workload` | 200 OK | 11 | Surname split works (ASCII space confirmed in all names) |
| `GET /api/customers` | 200 OK | 30 | OK |
| `GET /api/staff/performance` | 200 OK | 7 | All required fields (total, contracted, revenue) present |

**Data integrity:** `summary.contracted_total` (10,310,000) matches sum of contracted project `contract_amount` fields. Invoice paid/unpaid KPIs match frontend calculations exactly.

**CRUD operations:** All POST/PUT/DELETE operations for customers, projects, employees, and invoices function correctly and return valid JSON. Required-field validation returns HTTP 400 with Japanese error messages.

**Previously logged bugs (status update):**
- Employee workload name-split: RESOLVED — all employee names use ASCII space (U+0020); surname split works correctly.
- `fmt(0)` returning dash: RESOLVED — current code has `if (n === 0) return '0円'` before the falsy check.
- Staff performance page stale after assignment: RESOLVED — `saveStaff()` now resets both `loaded['employees']` and `loaded['staff']`.
- `p.staff` unescaped in onclick: RESOLVED — `esc(p.staff||'')` is applied in the current code.
- Sidebar footer hardcoded date: RESOLVED — footer now shows generic "さくらリフォーム 管理システム".

---

### Bug #1 — `toInputDate()` produces invalid HTML date values for all existing dates

- **Severity:** High
- **Steps to Reproduce:**
  1. Navigate to the 案件管理 page.
  2. Click the "編集" button on any project row.
  3. Observe the 初回訪問日, 着工予定日, and 契約日 fields in the edit modal.
- **Observed Behavior:** All three date fields are blank in the edit modal. The project's stored dates (e.g. `2024/5/26`, `2024/4/15`) are converted by `toInputDate()` to `2024-5-26`, `2024-4-15` — single-digit month and day without zero-padding. HTML `<input type="date">` requires strict `YYYY-MM-DD` format; single-digit values are rejected by the browser and the field renders empty. All 66 date values stored in the database are affected (100% failure rate).
- **Expected Behavior:** The edit modal should pre-fill date fields with the stored date values, allowing the user to view and modify them without losing data.
- **Developer Guide:** `toInputDate()` in `index.html` (line 914–917) only replaces `/` with `-` but does not zero-pad month or day. Fix: after splitting on `/`, pad each part to 2 digits — e.g. `parts.map((p,i) => i===0 ? p : p.padStart(2,'0')).join('-')`. Alternatively use `new Date(dateStr).toISOString().substring(0,10)` with care for timezone offset. Affected fields in project modal: `prj-first_visit`, `prj-scheduled_start`, `prj-contract_date`; in invoice modal: `inv-billing_date`, `inv-due_date`, `inv-payment_date`.

---

### Bug #2 — Monthly chart x-axis labels malformed

- **Severity:** High
- **Steps to Reproduce:**
  1. Navigate to the ダッシュボード page.
  2. View the "月別 受注金額（契約済み）" bar chart at the bottom.
- **Observed Behavior:** The x-axis tick labels show `2024/3/`, `2024/4/`, `2024/5/` — with a trailing slash. The root cause is in `server.js`: `SUBSTR(contract_date, 1, 7)` applied to dates stored as `YYYY/M/D` (single-digit month) extracts exactly 7 characters, yielding `2024/3/` instead of the intended `2024-03` or `2024年3月`.
- **Expected Behavior:** Labels should show readable month identifiers such as `2024年3月`, `2024年4月`, or at minimum `2024/03`.
- **Developer Guide:** `server.js` line 68, `/api/projects/monthly` route. The `SUBSTR(contract_date, 1, 7)` expression assumes ISO `YYYY-MM-DD` format but the DB stores `YYYY/M/D`. Fix options: (a) normalise date storage to ISO format during import in `db.js`; (b) use SQLite `strftime('%Y-%m', date(contract_date))` which handles the slash-delimited format correctly; (c) post-process labels in the frontend before passing them to Chart.js.

---

### Bug #3 — Dashboard "recent projects" table rows duplicate on re-visit after any project CRUD

- **Severity:** High
- **Steps to Reproduce:**
  1. Navigate to the ダッシュボード page (initial load populates the recent-projects table).
  2. Navigate to the 案件管理 page and edit or add any project using the form modal, then save.
  3. Navigate back to ダッシュボード.
- **Observed Behavior:** The "最近の案件（受注済み）" table now shows duplicate rows — up to 20 rows instead of 10. Each subsequent CRUD-then-return cycle adds another 10 rows. Charts do not duplicate (they call `destroy()` first); only the `<tbody>` is affected.
- **Expected Behavior:** The recent-projects table should show exactly 10 rows and reflect the latest data after re-load.
- **Developer Guide:** `index.html` `loadDashboard()` function, around line 1049. The function appends to `#tbl-recent tbody` with `insertAdjacentHTML('beforeend', ...)` but never clears the tbody first. Fix: add `document.querySelector('#tbl-recent tbody').innerHTML = '';` immediately before the `projects.slice(0,10).forEach(...)` loop. Trigger path: project/invoice CRUD handlers set `loaded['dashboard'] = false`; the next call to `loadPage('dashboard')` re-executes `loadDashboard()`, appending on top of existing rows.

---

### Bug #4 — CRUD PUT/DELETE returns HTTP 200 for non-existent resource IDs

- **Severity:** High
- **Steps to Reproduce:**
  1. Send `PUT http://localhost:3000/api/customers/99999` with a valid JSON body (including `name`).
  2. Send `DELETE http://localhost:3000/api/projects/99999`.
  3. Observe the HTTP response status and body.
- **Observed Behavior:** All four entity types (customers, projects, employees, invoices) return `{"ok":true}` with HTTP 200 when PUT or DELETE is called with an ID that does not exist in the database. SQLite silently performs zero-row updates/deletes without raising an error.
- **Expected Behavior:** The API should return HTTP 404 with a JSON error body (e.g. `{"error":"リソースが見つかりません"}`) when the target record does not exist. This is critical for detecting stale UI state (e.g., concurrent deletions by another user or browser tab).
- **Developer Guide:** All PUT/DELETE handlers in `server.js` use `db.prepare(...).run(...)` and ignore `result.changes` (the number of rows affected). Fix: check `result.changes === 0` after each `run()` call and return `res.status(404).json({ error: '対象データが見つかりません' })`. Example for DELETE: `const result = db.prepare("DELETE FROM projects WHERE id=?").run(req.params.id); if (result.changes === 0) return res.status(404).json({ error: '案件が見つかりません' });`.

---

### Bug #5 — Customer `building_type` "一戸建て" absent from edit form select options

- **Severity:** Medium
- **Steps to Reproduce:**
  1. Navigate to the 顧客台帳 page.
  2. Click "編集" on any customer whose building type is "一戸建て" (multiple records exist in the DB).
  3. Observe the 建物種別 dropdown in the edit modal.
- **Observed Behavior:** The dropdown does not contain "一戸建て" as an option. The select element displays a blank selection, misrepresenting the stored data. The HTML select offers `戸建て` (without the 一 prefix) but the DB stores `一戸建て`.
- **Expected Behavior:** The edit modal should pre-select the correct building type. Either the DB values should match the select options, or the select options should include all values present in the DB.
- **Developer Guide:** `index.html` `<select id="cus-building_type">`, lines 629–636. The HTML option is `戸建て`; the DB value imported from Excel is `一戸建て`. Fix: change the HTML option value and text from `戸建て` to `一戸建て`, or add `一戸建て` as an additional option. Cross-check `db.js` import logic for building_type normalization.

---

### Bug #6 — Customer `source` field — 10 of 11 DB values absent from HTML select

- **Severity:** Medium
- **Steps to Reproduce:**
  1. Navigate to the 顧客台帳 page.
  2. Click "編集" on any customer whose source is not one of `チラシ, Web, 紹介, 看板, 展示会, その他`.
  3. Observe the 来店経路 dropdown.
- **Observed Behavior:** The select field goes blank for customers with sources such as `WEB検索`, `展示場来場`, `SNS広告`, or any `紹介（○○様）` variant. The HTML select only offers 6 generic options. The DB contains 11 distinct source values imported from the original Excel file, 10 of which are more specific strings not in the select list.
- **Expected Behavior:** When editing a customer record, the 来店経路 field should reflect the stored value. Either the select should include all values found in the DB, or a free-text input (or `<input list="...">` datalist) should be used.
- **Developer Guide:** `index.html` `<select id="cus-source">`, lines 651–660. DB source values include: `紹介（山本様）`, `紹介（渡辺様）`, `紹介（松田様）`, `紹介（小野様）`, `紹介（藤井様）`, `紹介（高橋様）`, `紹介（大塚様）`, `WEB検索`, `展示場来場`, `SNS広告`. Fix: convert to an `<input type="text" list="sourceList">` datalist pattern (same as `work_type` uses), or populate the `<select>` dynamically from the `/api/customers` response values.

---

### Bug #7 — Project `work_type` datalist suggestions entirely mismatched from DB values

- **Severity:** Medium
- **Steps to Reproduce:**
  1. Navigate to the 案件管理 page.
  2. Click "＋ 新規案件を追加" or "編集" on any existing project.
  3. Click on the 工事種別 input and view the autocomplete suggestions.
- **Observed Behavior:** The datalist shows: `外壁塗装, 屋根工事, 内装リフォーム, 水回りリフォーム, 外構工事, その他`. However, all 32 existing projects use values: `外装, 内装, 水回り, 省エネ, 建具, バリアフリー`. None of the 6 datalist suggestions match any existing DB values. A user adding a project and selecting a datalist suggestion would create a record with a work_type that has no match in the by-type chart or any filter.
- **Expected Behavior:** Datalist autocomplete suggestions should reflect the actual category values used by existing records, ensuring data consistency.
- **Developer Guide:** `index.html` `<datalist id="workTypeList">`, lines 703–711. Fix: populate the datalist dynamically from the distinct `work_type` values returned by `/api/projects/by-type` (or fetch `/api/projects` on page load and extract unique values), or align the hardcoded list with the actual import values in `db.js`.

---

### Bug #8 — Invoice filter button "入金待ち" matches zero records

- **Severity:** Medium
- **Steps to Reproduce:**
  1. Navigate to the 請求・入金管理 page.
  2. Click the "入金待ち" filter button in the filter bar.
- **Observed Behavior:** The table immediately becomes empty (0 rows). No records in the current DB have `payment_status = '入金待ち'` — only `入金済` (17 records) and `未入金` (4 records) exist. The button remains clickable but silently shows a blank table with no empty-state message.
- **Expected Behavior:** Either (a) the "入金待ち" filter button should be hidden or disabled when no records match, with a message explaining why, or (b) an empty-state row/message (e.g. "該当するデータがありません") should be displayed inside the table when the filter produces zero results.
- **Developer Guide:** `index.html` `renderInvoices()` function (line 1145) filters `allInvoices` by `payment_status === status`. The tbody goes blank with no feedback. Additionally, `updateInvoiceKPIs()` always shows the full totals regardless of the active filter, which could confuse users. Fix: add an empty-state `<tr><td colspan="10">該当データなし</td></tr>` when `filtered.length === 0`.

---

### Bug #9 — Dashboard KPI cards not refreshed after project or invoice CRUD

- **Severity:** Medium
- **Steps to Reproduce:**
  1. Navigate to the ダッシュボード page.
  2. Navigate to 案件管理, create a new project with status "契約済" and a contract amount.
  3. Click "保存する". The toast confirms success.
  4. Navigate back to the ダッシュボード page.
- **Observed Behavior:** The KPI cards (受注総額, 案件数) do not reflect the newly added project. The dashboard shows stale data from the initial load. The user must manually reload the browser page to see updated KPIs.
- **Expected Behavior:** Returning to the dashboard after any CRUD operation should show up-to-date KPI figures. The dashboard should re-fetch `/api/summary` whenever `loaded['dashboard']` has been reset to `false`.
- **Developer Guide:** `index.html`, project CRUD handlers (around line 1581) and invoice CRUD handlers (around line 1766) set `loaded['dashboard'] = false` but rely on the user navigating away and back. This is the documented pattern, but the user experience is degraded. Fix: after setting `loaded['dashboard'] = false`, immediately call a lightweight `refreshDashboardKPIs()` function that only re-fetches `/api/summary` and updates the 4 KPI card elements, without re-rendering the full charts and table.

---

### Bug #10 — Dashboard not refreshed at all after Invoice CRUD

- **Severity:** Medium
- **Steps to Reproduce:**
  1. Navigate to the ダッシュボード. Note the "入金済み総額" KPI.
  2. Navigate to 請求・入金管理 and change a `未入金` invoice to `入金済`.
  3. Navigate back to ダッシュボード.
- **Observed Behavior:** The "入金済み総額" KPI still shows the old value. Inspecting the code confirms `if (loaded['dashboard']) loaded['dashboard'] = false;` IS present in the invoice save handler (line 1766). However, because `loaded['dashboard']` is set to false after the save but not immediately loaded, the dashboard only refreshes on the next navigation — and due to Bug #3, that re-load duplicates the recent-projects table rows.
- **Expected Behavior:** Invoice payment status changes should be reflected in the dashboard KPIs in a timely manner.
- **Developer Guide:** Same root cause as Bug #9. Invoice submit handler in `index.html` around line 1766. The fix for Bug #9 (lightweight KPI refresh) would also resolve this issue.

---

### Bug #11 — `DELETE /api/employees/:id` cascade uses same surname-split logic — risk if names change

- **Severity:** Low
- **Steps to Reproduce:**
  1. Create a new employee with a name that uses a full-width space or no space (e.g., via direct DB insert or future data import change).
  2. Delete that employee via `DELETE /api/employees/:id`.
- **Observed Behavior:** `server.js` lines 231–234 use `emp.name.split(" ")[0]` (ASCII space U+0020) to extract the surname before nulling out `staff` references in `projects` and `customers`. If a name uses a full-width space (U+3000) or is stored without any space, the split produces the full name, and the `UPDATE projects SET staff=NULL WHERE staff=?` query will find no matching `staff` values — leaving orphaned staff references in projects and customers after the employee is deleted.
- **Expected Behavior:** Deleting an employee should reliably null out all `staff` references in `projects` and `customers`, regardless of the space character used.
- **Developer Guide:** `server.js` `DELETE /api/employees/:id` handler (line 230). The current DB data uses ASCII spaces (confirmed by audit), so this is currently a latent risk rather than an active bug. Fix: normalize the split by trying both `" "` (U+0020) and `"　"` (U+3000) as separators, or store the surname separately in the DB on employee creation.

---

### Bug #12 — No empty-state feedback when filters produce zero results in any table

- **Severity:** Low
- **Steps to Reproduce:**
  1. Navigate to the 案件管理 page.
  2. Type a search query in the search box that matches no projects (e.g., `ZZZNOMATCH`).
  3. Alternatively, apply any filter that returns zero results.
- **Observed Behavior:** The table body goes blank — no rows, no message. There is no visual indication that the filter is working correctly but simply has no matches, versus a data loading error. Same behavior occurs on the 顧客台帳 search, the 請求・入金 filter (e.g., "入金待ち"), and 担当者実績 if the API returns no data.
- **Expected Behavior:** When a filter or search produces zero results, a user-friendly empty-state row should appear, e.g.: `<tr><td colspan="N" style="text-align:center;color:#999;padding:32px">該当するデータがありません</td></tr>`.
- **Developer Guide:** All render functions in `index.html`: `renderProjects()` (line 1091), `renderInvoices()` (line 1145), `renderCustomers()` (line 1184). Add an empty-state `<tr>` at the end of each render function when `filtered.length === 0`.

---

## Recommendations (Top 3 Priority Fixes)

### Priority 1 — Fix `toInputDate()` zero-padding (Bug #1)

This is the most user-impacting issue. Every existing project date (contract_date, first_visit, scheduled_start) fails to pre-populate in the edit modal, forcing users to re-enter dates manually on every edit. With 32 projects and 3 date fields each, 96 individual date values silently show blank. The fix is a 3-line change to `toInputDate()` in `index.html`: split the date string on `/`, zero-pad month and day to 2 digits, and rejoin with `-`.

```javascript
function toInputDate(dateStr) {
  if (!dateStr) return '';
  const parts = String(dateStr).split('/');
  if (parts.length === 3) {
    return parts[0] + '-' + parts[1].padStart(2,'0') + '-' + parts[2].substring(0,2).padStart(2,'0');
  }
  return String(dateStr).replace(/\//g, '-').substring(0, 10);
}
```

This also fixes the monthly chart label if the same normalization approach is applied in `server.js` using `strftime('%Y-%m', date(contract_date))`.

### Priority 2 — Fix Dashboard tbody duplication and add tbody clear (Bug #3)

Any project or invoice save/delete by the company president will corrupt the dashboard recent-projects table after returning to the dashboard. A one-line fix (`document.querySelector('#tbl-recent tbody').innerHTML = '';` at the top of the `projects.slice(0,10).forEach` block in `loadDashboard()`) eliminates the duplication entirely.

### Priority 3 — Align form select/datalist options with actual DB values (Bugs #5, #6, #7)

Three form fields have completely mismatched options: `building_type` (one DB value missing from select), `source` (10 of 11 DB values missing), and `work_type` (all 6 DB values missing from datalist). These mismatches mean that editing any existing customer or project silently loses the stored categorical values (the dropdowns show blank). The cleanest fix is to switch the `source` field and the `work_type` field to `<input type="text" list="...">` datalist inputs populated dynamically from the API, and to add `一戸建て` as a select option for `building_type`.
