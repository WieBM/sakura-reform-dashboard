# claude-reports/

このフォルダは **Claude (AI)** が作成した監査・修正レポートの置き場です。

## ファイル命名規則

| 種類 | 命名パターン | 例 |
|------|-------------|-----|
| バグ監査レポート | `BUG_REPORT_YYYY-MM-DD.md` | `BUG_REPORT_2026-06-25.md` |
| UX監査レポート | `AUDIT_REPORT_YYYY-MM-DD.md` | `AUDIT_REPORT_2026-06-25.md` |
| 修正レポート | `FIX_REPORT_YYYY-MM-DD.md` | `FIX_REPORT_2026-06-25.md` |
| セキュリティレビュー | `SECURITY_REVIEW_YYYY-MM-DD.md` | `SECURITY_REVIEW_2026-06-25.md` |

同じ日に複数生成される場合は `_N` サフィックスを付ける（例: `BUG_REPORT_2026-06-25_2.md`）。

> **重要**: ファイル名は必ず **大文字 + アンダースコア + 日付** の形式に従うこと。

---

## ファイル一覧

| ファイル | 内容 | 作成日 |
|----------|------|--------|
| [BUG_REPORT_2026-06-25_1.html](./BUG_REPORT_2026-06-25_1.html) | バグ監査レポート（HTML形式） | 2026-06-25 |
| [BUG_REPORT_2026-06-25_2.md](./BUG_REPORT_2026-06-25_2.md) | CRUD監査バグレポート | 2026-06-25 |
| [BUG_REPORT_2026-06-25_3.md](./BUG_REPORT_2026-06-25_3.md) | QAオーディタによる静的解析バグレポート | 2026-06-25 |
| [AUDIT_REPORT_2026-06-25.md](./AUDIT_REPORT_2026-06-25.md) | UX & バグ監査レポート（実測検証付き） | 2026-06-25 |
| [FIX_REPORT_2026-06-25_1.md](./FIX_REPORT_2026-06-25_1.md) | バグ修正レポート（第1回） | 2026-06-25 |
| [FIX_REPORT_2026-06-25_2.md](./FIX_REPORT_2026-06-25_2.md) | バグ修正レポート（第2回） | 2026-06-25 |
| [FIX_REPORT_2026-06-25_3.md](./FIX_REPORT_2026-06-25_3.md) | バグ修正レポート（第3回・BUG_REPORT_3対応） | 2026-06-25 |
