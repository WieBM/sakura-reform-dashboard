# Sakura Reform ダッシュボード — UX & バグ監査レポート

**監査日:** 2026-06-25  
**対象:** http://localhost:3000  
**方法:** 静的コード解析 + SQLiteデータ実測検証

---

## 検証サマリー

| # | 指摘内容 | 実測結果 | 深刻度 |
|---|---------|----------|--------|
| 1 | 社員ワークロードが全員0件（名前分割ミスマッチ） | ❌ **誤診** — ASCII半角スペース使用、分割は正常動作 | — |
| 2 | `fmt(0)` がゼロ値をダッシュ表示 | ✅ **確認** | High |
| 3 | `入金済` フィルタ文字列の不一致 | ❌ **誤診** — DBも UIも `入金済` で一致 | — |
| 4 | 担当者変更後に「担当者実績」が更新されない | ✅ **確認** | Medium |
| 5 | `p.staff` がonclick属性にエスケープなしで挿入 | ✅ **確認** | Low |
| 6 | サイドバーフッターの年度がハードコード | ✅ **確認** | Low |

**確認済みバグ: 4件 / 誤診: 2件**

---

## Bug 1 — 【誤診】社員ワークロード0件問題

### 実測データ
```
countMap: {"中島":6,"佐々木":7,"加藤":5,"山口":5,"田村":6}

木村 正雄  → 0件   ← 実際に案件未割当
佐々木 亮  → 7件   ← 正常
中島 彩    → 6件   ← 正常
田村 誠一  → 6件   ← 正常
山口 翔    → 5件   ← 正常
加藤 美咲  → 5件   ← 正常
大西 勇    → 0件   ← 実際に案件未割当
前田 健司  → 0件   ← 実際に案件未割当
高田 学    → 0件   ← 実際に案件未割当
林 奈々    → 0件   ← 実際に案件未割当
清水 友里  → 0件   ← 実際に案件未割当
```

### 判定
社員名はASCII半角スペース(U+0020)を使用しており、`split(' ')[0]`による姓抽出は**正常動作**。  
0件の社員は「実際にプロジェクトが未割当」なため、バグではなく正しいデータ表示。  
→ **エージェントの誤診。修正不要。**

---

## Bug 2 — 【確認済・High】ゼロ値KPIがダッシュ表示される

### 場所
`dashboard/public/index.html` 533行目

### 問題コード
```js
function fmt(n) {
  if (!n) return '—';   // ← !0 は true → 0円が '—' になる
  ...
}
```

### 影響
- パイプライン金額が0円の場合 → `—` と表示（データ未取得と区別不可）
- 入金済み・未払い額が0の場合にも同様

### 修正方法
```js
function fmt(n) {
  if (n === null || n === undefined || n === '') return '—';
  ...
}
```

---

## Bug 3 — 【誤診】入金済フィルタ文字列の不一致

### 実測データ
```sql
SELECT DISTINCT payment_status, COUNT(*) FROM invoices GROUP BY payment_status;
-- "入金済"  → 17件
-- "未入金"  → 4件
```

### 判定
DBの値は `入金済`（みなし）、UIの `data-val="入金済"` と**完全一致**。  
フィルタは正常動作。→ **エージェントの誤診。修正不要。**

---

## Bug 4 — 【確認済・Medium】担当者変更後に「担当者実績」ページが古いデータを表示

### 場所
`dashboard/public/index.html` 884〜895行目

### 問題コード
```js
async function saveStaff(surname) {
  // ... API呼び出し ...
  if (loaded['employees']) { loaded['employees'] = false; loadEmployees(); }
  // ↑ loaded['staff'] のリセットが抜けている!
}
```

### 再現手順
1. 「担当者実績」の数値を確認
2. 「案件管理」で任意の案件の担当者を変更
3. 再度「担当者実績」を開く → 古い数値のまま（ページリロードするまで更新されない）

### 追加問題
`loadStaff()` (796行目) が `insertAdjacentHTML('beforeend', ...)` でtbody未クリアのまま追記するため、  
もし2回呼ばれると**行が重複表示**される。

### 修正方法
```js
async function saveStaff(surname) {
  // ... 既存コード ...
  if (loaded['employees']) { loaded['employees'] = false; loadEmployees(); }
  if (loaded['staff'])     { loaded['staff'] = false; loadStaff(); }  // ← 追加
}

async function loadStaff() {
  const rows = await fetch('/api/staff/performance').then(r=>r.json());
  const tbody = document.querySelector('#tbl-staff tbody');
  tbody.innerHTML = '';  // ← 追加（重複防止）
  // ... 以下既存コード ...
}
```

---

## Bug 5 — 【確認済・Low】`p.staff` がonclick属性にエスケープなしで挿入

### 場所
`dashboard/public/index.html` 709行目

### 問題コード
```js
const staffHtml = `<span class="staff-btn" onclick="openStaffModal(${p.id},'${p.name.replace(/'/g,"\\'")}','${p.staff||''}')">
```

- `p.name` はシングルクォートをエスケープ済み ✅
- `p.staff` はエスケープなし ❌ → 姓にシングルクォートが含まれると構文エラー

### 修正方法
```js
'${(p.staff||'').replace(/'/g, "\\'")}'
```
または `data-*` 属性＋イベントデリゲーションへのリファクタリングを推奨。

---

## Bug 6 — 【確認済・Low】サイドバー年度がハードコード

### 場所
- `dashboard/public/index.html` 312行目: サイドバーフッター
- `dashboard/public/index.html` 321行目: ダッシュボードヘッダー

### 問題コード
```html
<div class="sidebar-footer">2024年度 上半期</div>
<!-- 321行目 -->
<p>2024年度 上半期（4月〜6月）の経営状況</p>
```

### 影響
データが別期間のものでも常に「2024年度 上半期」と表示される。

### 修正方法
動的生成（プロジェクトのdate範囲から算出）またはサーバー側設定値として `/api/summary` に期間情報を追加する。

---

## 対応優先度

| 優先 | バグ | 工数目安 |
|------|------|----------|
| 🔴 高 | Bug 2: fmt(0)ゼロ値非表示 | 1行修正 |
| 🟡 中 | Bug 4: 担当者実績リフレッシュ漏れ + tbody未クリア | 3行追加 |
| 🟢 低 | Bug 5: p.staff エスケープ漏れ | 1行修正 |
| 🟢 低 | Bug 6: ハードコード年度表示 | 設計検討が必要 |
