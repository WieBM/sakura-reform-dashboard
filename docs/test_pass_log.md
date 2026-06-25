# Test Pass Log

Records incremental test results. Always compare this log against `git diff` before running tests.

| Date | Changed File / Page | Test Description | Result |
|------|---------------------|-----------------|--------|
| [2026-06-25] | [dashboard/public/index.html] | [Bug #1: toInputDate() now zero-pads month/day so edit-modal date fields pre-fill] | FIXED |
| [2026-06-25] | [dashboard/server.js] | [Bug #2: monthly chart labels now YYYY-MM (2024-03) instead of malformed 2024/3/] | FIXED |
| [2026-06-25] | [dashboard/public/index.html] | [Bug #3: loadDashboard() clears #tbl-recent tbody before append, no more duplicate rows] | FIXED |
| [2026-06-25] | [dashboard/server.js] | [Bug #4: all PUT/DELETE handlers return 404 when result.changes===0 for non-existent IDs] | FIXED |
| [2026-06-25] | [dashboard/public/index.html] | [Bug #5: building_type select option corrected to 一戸建て to match DB value] | FIXED |
| [2026-06-25] | [dashboard/public/index.html] | [Bug #6: source field converted to datalist input, dynamically populated from customer data] | FIXED |
| [2026-06-25] | [dashboard/public/index.html] | [Bug #7: work_type datalist aligned to actual DB values + dynamically populated from projects] | FIXED |
| [2026-06-25] | [dashboard/public/index.html] | [Bug #8: renderInvoices() shows 該当するデータがありません empty-state when filter matches 0 rows] | FIXED |
| [2026-06-25] | [dashboard/public/index.html] | [Bug #9: refreshDashboardKPIs() called after project CRUD to update KPI cards immediately] | FIXED |
| [2026-06-25] | [dashboard/public/index.html] | [Bug #10: refreshDashboardKPIs() called after invoice CRUD to update KPI cards immediately] | FIXED |
| [2026-06-25] | [dashboard/server.js] | [Bug #11: employee DELETE cascade surname split now handles full-width (U+3000) space] | FIXED |
