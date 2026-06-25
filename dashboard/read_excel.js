const XLSX = require("xlsx");

const files = [
  "../HandsOn_資料/社員名簿.xlsx",
  "../HandsOn_資料/案件管理表.xlsx",
  "../HandsOn_資料/顧客管理台帳.xlsx",
  "../HandsOn_資料/見積明細一覧.xlsx",
  "../HandsOn_資料/請求・入金管理表.xlsx",
  "../HandsOn_資料/工事サービス標準単価表.xlsx",
];

for (const f of files) {
  console.log("\n=== " + f + " ===");
  const wb = XLSX.readFile(f);
  for (const sname of wb.SheetNames) {
    const ws = wb.Sheets[sname];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
    console.log("  Sheet: " + sname + " (" + data.length + " rows)");
    data.slice(0, 6).forEach((row, i) => console.log("    Row" + i + ": " + JSON.stringify(row)));
  }
}
