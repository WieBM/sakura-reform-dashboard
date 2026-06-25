# Past Mistakes Log

Source of truth for `/wrap-up` checklist rules.
When a new mistake occurs, add it here and update the checklist accordingly.

---

## Session 2026-06-25 (2nd)

### MISTAKE-07 — E2E test run via direct API calls instead of auditor agent

| Field | Detail |
|-------|--------|
| **What happened** | The full E2E flow (new customer → project → billing → payment) was tested by calling APIs directly with PowerShell instead of delegating to `sakura-ux-qa-auditor` |
| **Problem** | Direct API calls only verify the backend. Frontend bugs (form input, modal behaviour, screen refresh, console errors) are completely invisible |
| **Correct flow** | `sakura-ux-qa-auditor` drives Playwright → clicks buttons, fills forms, submits, verifies UI reactions → saves BUG_REPORT |
| **Auditor scope** | Can click add buttons, fill and submit forms, assign staff, change status via modal, verify KPI card refresh, capture console errors — all via Playwright |
| **Discovered by** | User pointed it out |
| **Prevention** | Any test involving data entry or UI interaction must be delegated to `sakura-ux-qa-auditor`. Direct API calls are for backend-only validation only. |

---

### MISTAKE-06 — Bug fixed directly instead of delegating to agent

| Field | Detail |
|-------|--------|
| **What happened** | 3 bugs found during E2E test were fixed directly in `server.js` without delegating to `sakura-bug-fixer` |
| **Rule violated** | Bug workflow: `sakura-bug-fixer` agent → BUG_REPORT → FIX_REPORT |
| **Correct flow** | Find bug → write BUG_REPORT → call `sakura-bug-fixer` → save FIX_REPORT |
| **Discovered by** | User pointed it out |
| **Prevention** | On finding a bug, always write a BUG_REPORT first. Never apply fixes directly — delegate to the agent. |

---

## Session 2026-06-25

### MISTAKE-01 — Report filename missing date

| Field | Detail |
|-------|--------|
| **What happened** | `sakura-ux-qa-auditor` saved the bug report as `bug_report.md` with no date |
| **Rule violated** | Without a date in the filename, reports from different sessions are indistinguishable |
| **Correct format** | `BUG_REPORT_2026-06-25.md` |
| **Discovered by** | User pointed it out |
| **Prevention** | CHECK 2 — Report filename convention |

---

### MISTAKE-02 — Fix report not saved as a file

| Field | Detail |
|-------|--------|
| **What happened** | `sakura-bug-fixer` returned fix content as chat text only; no `FIX_REPORT_YYYY-MM-DD.md` file was written |
| **Rule violated** | Agent prompt Step 5: save fix summary to `dashboard/claude-reports/FIX_REPORT_YYYY-MM-DD.md` via Write tool |
| **Correct behaviour** | Use Write tool to create the file |
| **Discovered by** | Found during end-of-session file listing |
| **Prevention** | CHECK 3 — BUG/FIX report pairs |

---

### MISTAKE-03 — Report filename wrong case and separator

| Field | Detail |
|-------|--------|
| **What happened** | Files saved as `fix-report-2026-06-25_1.md`, `ux-audit-report-2026-06-25.md` (lowercase + hyphens) |
| **Rule violated** | Convention requires `FIX_REPORT_YYYY-MM-DD.md` (UPPERCASE + underscores) |
| **Correct format** | `FIX_REPORT_2026-06-25.md`, `AUDIT_REPORT_2026-06-25.md` |
| **Discovered by** | User pointed it out |
| **Prevention** | CHECK 2 — Report filename convention |

---

### MISTAKE-04 — CLAUDE.md not updated after significant changes

| Field | Detail |
|-------|--------|
| **What happened** | Added agents, fixed 10 bugs, established report conventions — but CLAUDE.md was not updated |
| **Rule violated** | CLAUDE.md header: "Update this file whenever making significant changes to the codebase" |
| **Missing items** | `toInputDate()` behaviour, `refreshDashboardKPIs()`, `populateDatalist()`, API 404 behaviour, DB value constraints, agent section, report naming convention |
| **Discovered by** | User pointed it out |
| **Prevention** | CHECK 1 — CLAUDE.md up to date |

---

### MISTAKE-05 — Misdiagnosed root cause (blamed missing emoji instead of missing date)

| Field | Detail |
|-------|--------|
| **What happened** | Identified the report format problem as "missing 🚨 emoji" and incorrectly added emoji checklists to agent prompts |
| **Actual problem** | The filename had no date (MISTAKE-01) |
| **Lesson** | When receiving user feedback, identify the root cause first — not the surface symptom |
| **Discovered by** | User explicitly said "it's not the emoji, the date is missing" |
| **Prevention** | Before making any fix, compare the actual file content against the rule document |
