# バグ修正レポート

**修正日:** 2026-06-25  
**修正者:** Claude (claude-sonnet-4-6)  
**対象ファイル:** `dashboard/public/index.html`  
**対応監査レポート:** [UX_AUDIT_REPORT.md](./UX_AUDIT_REPORT.md)

---

## 修正サマリー

| # | バグ | 深刻度 | 修正結果 |
|---|------|--------|----------|
| Bug 2 | `fmt(0)` がゼロ値を `—` と表示 | High | ✅ 修正済 |
| Bug 4a | 担当者変更後に「担当者実績」が更新されない | Medium | ✅ 修正済 |
| Bug 4b | `loadStaff()` が tbody を未クリアで行を重複追加 | Medium | ✅ 修正済 |
| Bug 5 | `p.staff` が onclick にエスケープなしで挿入 | Low | ✅ 修正済 |
| Bug 6 | サイドバー年度ハードコード | Low | ⏭ 対応見送り（設計検討が必要） |

---

## Bug 2 — `fmt(0)` ゼロ値表示

### 修正箇所
`dashboard/public/index.html` 532〜533行目

### Before
```js
function fmt(n) {
  if (!n) return '—';
```

### After
```js
function fmt(n) {
  if (n === null || n === undefined || n === '') return '—';
  if (n === 0) return '0円';
```

### 効果
- `null` / `undefined` / 空文字 → `—`（データ未取得）
- `0` → `0円`（正しいゼロ値表示）
- それ以外 → 従来通り万円・億円フォーマット

---

## Bug 4a — 担当者変更後に担当者実績ページが更新されない

### 修正箇所
`dashboard/public/index.html` 896行目（`saveStaff` 関数末尾）

### Before
```js
  if (loaded['employees']) { loaded['employees'] = false; loadEmployees(); }
}
```

### After
```js
  if (loaded['employees']) { loaded['employees'] = false; loadEmployees(); }
  if (loaded['staff'])     { loaded['staff'] = false; loadStaff(); }
}
```

### 効果
担当者を変更した後に「担当者実績」タブを開くと、変更後の最新データが反映される。

---

## Bug 4b — `loadStaff()` 呼び出し時に行が重複表示される

### 修正箇所
`dashboard/public/index.html` 800〜801行目（`loadStaff` 関数内）

### Before
```js
  const tbody = document.querySelector('#tbl-staff tbody');
  const totalRevenue = rows.reduce((s,r)=>s+r.revenue,0);
```

### After
```js
  const tbody = document.querySelector('#tbl-staff tbody');
  tbody.innerHTML = '';
  const totalRevenue = rows.reduce((s,r)=>s+r.revenue,0);
```

### 効果
`loadStaff()` が複数回呼ばれても tbody をクリアしてから再描画するため、行の重複がなくなる。  
Bug 4a の修正とセットで機能する。

---

## Bug 5 — `p.staff` の onclick インジェクション

### 修正箇所
`dashboard/public/index.html` 710行目

### Before
```js
onclick="openStaffModal(${p.id},'${p.name.replace(/'/g,"\\'")}','${p.staff||''}')"
```

### After
```js
onclick="openStaffModal(${p.id},'${p.name.replace(/'/g,"\\'")}','${(p.staff||'').replace(/'/g,"\\'")}')"
```

### 効果
`p.staff`（担当者姓）にシングルクォートが含まれる場合でも onclick 属性が壊れなくなる。  
`p.name` と同様に `\'` エスケープを適用。

---

## 対応しなかった項目

### Bug 6 — サイドバー年度ハードコード（`2024年度 上半期`）
- **理由:** 表示する期間をどう決定するか（固定値変更 / DBから動的算出 / APIに追加）は設計判断が必要なため、今回は見送り。
- **場所:** `index.html` 312行目・321行目

---

## 検証方法

```bash
cd dashboard
npm start
# http://localhost:3000 を開いて以下を確認:
# 1. KPIカードに 0円 が正しく表示されるか
# 2. 案件管理で担当者変更 → 担当者実績タブで即時反映されるか
# 3. 担当者実績タブを再度開いても行が重複しないか
```
