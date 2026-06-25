---
description: Pre-push checklist — validates past mistake patterns and fixes any gaps before committing/pushing
allowed-tools: [Read, Glob, Grep, Bash, PowerShell, Edit, Write]
---

# /wrap-up — Pre-push Checklist

Run this command before every `git push`. It automatically validates against known past mistake patterns.
Reference: `.claude/commands/references/past-mistakes.md`

## Steps

Run all 6 checks in order. If a problem is found, fix it immediately and report the result.

---

### CHECK 1 — CLAUDE.md up to date

```
git diff HEAD~1..HEAD -- CLAUDE.md
```

- Get the list of files changed this session: `git diff --name-only HEAD~1..HEAD`
- CLAUDE.md **must** be updated if any of the following changed:
  - `dashboard/server.js` (API behaviour change, new endpoint)
  - `dashboard/public/index.html` (new function, frontend pattern change)
  - `dashboard/db.js` (schema change)
  - `.claude/agents/*.md` (agent added or modified)
- If CLAUDE.md was not updated → **judge whether it is missing content and update if so**

---

### CHECK 2 — Report filename convention

List all files in `dashboard/claude-reports/`:

```
Glob: dashboard/claude-reports/**
```

**Rule**: Every report filename must follow `TYPE_YYYY-MM-DD.md` (UPPERCASE + underscore + date)

| Valid | Invalid examples |
|-------|-----------------|
| `BUG_REPORT_2026-06-25.md` | `bug_report.md` ← missing date |
| `FIX_REPORT_2026-06-25.md` | `fix-report-2026-06-25.md` ← lowercase + hyphens |
| `AUDIT_REPORT_2026-06-25.md` | `ux-audit-report-2026-06-25.md` ← wrong type prefix |

On violation → **rename immediately with Rename-Item (PowerShell)**

---

### CHECK 3 — BUG_REPORT / FIX_REPORT pairs

Every `BUG_REPORT_N` must have a matching `FIX_REPORT_N`.

- Collect all `dashboard/claude-reports/BUG_REPORT_*.md`
- For each `BUG_REPORT_N`, confirm a `FIX_REPORT_N` exists
- If a pair is missing → **create the FIX_REPORT file** (assuming fixes are done)

---

### CHECK 4 — Git status

```
git status
git diff --stat HEAD
```

- Report any unstaged changed files
- Confirm commit message matches the actual changes
- Stage any uncommitted report files

---

### CHECK 5 — README.md file list sync

Verify `dashboard/claude-reports/README.md` matches the actual files on disk:

- If a newly added report is not in the README → **add it**
- If a renamed/deleted file is still listed in the README → **remove it**

---

### CHECK 6 — Test method appropriateness

If any manual or E2E test was run this session:

- Tests involving UI (buttons, forms, modals, screen updates) → **was `sakura-ux-qa-auditor` used via Playwright?**
- Backend API-only validation → direct PowerShell / curl calls are acceptable
- If only direct API calls were used → **frontend bugs may have been missed**, recommend running auditor

> Direct API calls only verify the backend. Form input, modal behaviour, KPI refresh, and console errors are invisible without Playwright.

---

## Output format

After all checks, print results in this format:

```
## /wrap-up Results

| # | Check | Result | Action |
|---|-------|--------|--------|
| 1 | CLAUDE.md updated | ✅ / ⚠️ missing | (what was updated or "none") |
| 2 | Report filename convention | ✅ / ⚠️ N violations | (what was fixed or "none") |
| 3 | BUG/FIX report pairs | ✅ / ⚠️ missing | (what was created or "none") |
| 4 | Git status | ✅ / ⚠️ unstaged files | (file list or "none") |
| 5 | README sync | ✅ / ⚠️ out of sync | (what was updated or "none") |
| 6 | Test method | ✅ / ⚠️ API-only | (auditor used or "none") |

**Overall: ✅ ready to push / ⚠️ N issues fixed — ready to push**
```
