---
name: sakura-dashboard-audit-context
description: Core architectural facts about the さくらリフォーム dashboard that affect audit strategy — discovered during 2026-06-25 CRUD audit
metadata:
  type: project
---

First comprehensive CRUD audit of さくらリフォーム 経営ダッシュボード completed 2026-06-25.

**Why:** Developer completed STEP 5 full CRUD (customers, projects, employees, invoices) and requested regression audit.

**Key architectural facts for future audits:**
- Playwright is NOT installed in this project. Use Node.js built-in `http` module for API testing (see `audit_api.js`).
- Frontend is a single-page `dashboard/public/index.html` (1721 lines) with inline JS. No build step, no TypeScript.
- Express 5.2.1 is used — route ordering for `GET /api/projects/by-status` before `GET /api/projects/:id` matters (correctly ordered in server.js).
- `projects.staff` and `customers.staff` store surname only (e.g. `"田中"`), NOT full name.
- Dates stored as `YYYY/MM/DD` in DB, converted via `toInputDate()` for HTML date inputs.
- `loaded[page]` cache flag: after CRUD ops, pages set `loaded[page] = false` then call load function. But employee save/delete immediately sets `loaded['employees'] = true` AFTER calling `loadEmployees()` (async race — flag is set true before fetch completes).
- `allEmployees` cache used in staff assignment modal is cleared (`allEmployees = []`) after employee CRUD, forcing refetch on next modal open. Correct behavior.

**Recurring bugs to watch:**
- BUG-1: `loadEmployees()` after save/delete sets `loaded['employees'] = true` synchronously while async fetch is in-flight — if user navigates away and back fast, stale/empty UI can appear momentarily.
- BUG-2: Charts (chartStatus, chartType, chartMonthly) created with `new Chart()` without `.destroy()` — if user navigates to Dashboard a second time (after `loaded['dashboard']` is cleared by CRUD), a second `Chart` instance will be created on the same canvas, causing "Canvas is already in use" console error.
- BUG-3: Hamburger button (`#hamburger`) in `.topbar` has NO click event listener attached anywhere in the JS. Mobile topbar is non-functional.
- BUG-4: `p.name`, `c.name`, `i.invoice_no` etc. are interpolated raw into `insertAdjacentHTML` template strings — XSS risk for data containing `<`.
- BUG-5: `p.estimate_amount || ''` in edit modal treats 0 as falsy — fields with value 0 will show blank.

**How to apply:** Check these specific issues in every future audit. They are structural and likely to regress.
