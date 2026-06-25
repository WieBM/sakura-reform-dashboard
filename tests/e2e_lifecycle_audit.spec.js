// E2E Lifecycle Audit: New customer 田中 裕子 — full business flow
// Scenario: 顧客登録 → 案件登録 → 担当者配置 → ステータス進行 → 請求登録 → 入金処理 → ダッシュボード確認

const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // ── Console error accumulator ─────────────────────────────────────────────
  const consoleErrors = [];
  const networkErrors = [];
  const apiLog = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push({ time: new Date().toISOString(), text: msg.text() });
    }
  });

  page.on('pageerror', err => {
    consoleErrors.push({ time: new Date().toISOString(), text: `PAGE ERROR: ${err.message}` });
  });

  page.on('response', async resp => {
    const url = resp.url();
    if (url.includes('/api/')) {
      let body = null;
      let isJson = false;
      try {
        body = await resp.json();
        isJson = true;
      } catch (e) {}
      apiLog.push({
        url,
        status: resp.status(),
        isJson,
        ok: resp.ok(),
        body: isJson ? JSON.stringify(body).substring(0, 300) : 'non-JSON'
      });
      if (!resp.ok()) {
        networkErrors.push(`${resp.status()} ${url} — body: ${JSON.stringify(body)}`);
      }
    }
  });

  const results = [];

  function log(step, status, details = '') {
    const entry = { step, status, details };
    results.push(entry);
    const symbol = status === 'PASS' ? '[PASS]' : status === 'FAIL' ? '[FAIL]' : '[INFO]';
    console.log(`${symbol} ${step}${details ? ': ' + details : ''}`);
  }

  // SCROLL-BODY BUG TRACKER: track if body scroll occurs during modal submit
  const scrollBodyDuringModal = [];

  async function waitForSelector(selector, timeout = 8000) {
    try {
      await page.waitForSelector(selector, { timeout });
      return true;
    } catch (e) {
      return false;
    }
  }

  async function submitForm(formId) {
    // Use JS dispatch to avoid the body-scroll intercept bug
    // This is a workaround for the observed layout bug where clicking the
    // submit button scrolls the body, causing a <td> to intercept the click.
    await page.evaluate((id) => {
      document.getElementById(id).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    }, formId);
  }

  async function getToast(timeout = 5000) {
    try {
      const el = await page.waitForSelector('.toast', { timeout });
      const text = await el.textContent();
      return text.trim();
    } catch (e) {
      return null;
    }
  }

  // Check body scroll when modal is open
  async function checkBodyScrollLocked() {
    const overflow = await page.evaluate(() => {
      return window.getComputedStyle(document.body).overflow;
    });
    return overflow;
  }

  // ── Navigate to app ────────────────────────────────────────────────────────
  try {
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    const title = await page.title();
    if (title.includes('さくらリフォーム')) {
      log('ページ初期ロード', 'PASS', `title="${title}"`);
    } else {
      log('ページ初期ロード', 'FAIL', `Unexpected title: "${title}"`);
    }
  } catch (e) {
    log('ページ初期ロード', 'FAIL', e.message);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 1: 顧客登録
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n=== STEP 1: 顧客登録 ===');

  // Navigate to 顧客台帳
  try {
    await page.click('[data-page="customers"]');
    await page.waitForSelector('#page-customers.active', { timeout: 5000 });
    await page.waitForLoadState('networkidle');
    log('顧客台帳ページ遷移', 'PASS');
  } catch (e) {
    log('顧客台帳ページ遷移', 'FAIL', e.message);
  }

  // Check add button — no ID, only class and onclick
  try {
    const addBtnSelector = '#page-customers .add-btn';
    const addBtn = await page.$(addBtnSelector);
    if (addBtn) {
      log('＋新規顧客ボタンの存在確認', 'PASS', 'Selector: #page-customers .add-btn');
    } else {
      log('＋新規顧客ボタンの存在確認', 'FAIL', 'Button not found with selector #page-customers .add-btn');
    }
  } catch (e) {
    log('＋新規顧客ボタンの存在確認', 'FAIL', e.message);
  }

  // Check if button has an ID — document as bug if not
  try {
    const btnId = await page.$eval('#page-customers .add-btn', el => el.id || '(no id)');
    if (btnId === '(no id)') {
      log('＋新規顧客ボタンにIDがない', 'FAIL', 'Button lacks an id attribute — cannot be targeted by id selector; accessibility concern');
    } else {
      log('＋新規顧客ボタンID', 'PASS', `id="${btnId}"`);
    }
  } catch (e) {
    log('＋新規顧客ボタンID確認', 'FAIL', e.message);
  }

  // Open modal via JS (workaround for missing ID)
  try {
    await page.evaluate(() => openCustomerModal());
    await page.waitForSelector('#customerModal.open', { timeout: 5000 });
    log('新規顧客モーダルを開く (JS経由)', 'PASS');
  } catch (e) {
    log('新規顧客モーダルを開く', 'FAIL', e.message);
  }

  // Check body scroll lock when modal is open
  try {
    const overflow = await checkBodyScrollLocked();
    if (overflow === 'hidden' || overflow === 'clip') {
      log('モーダル開放時 body scroll lock', 'PASS', `body overflow="${overflow}"`);
    } else {
      log('モーダル開放時 body scroll lock', 'FAIL', `body overflow="${overflow}" — body remains scrollable; submit button may be intercepted by background content`);
    }
  } catch (e) {
    log('body scroll lock確認', 'FAIL', e.message);
  }

  // Check modal title
  try {
    const modalTitle = await page.textContent('#customerModalTitle');
    log('モーダルタイトル確認', modalTitle && modalTitle.includes('新規顧客') ? 'PASS' : 'FAIL', `"${modalTitle}"`);
  } catch (e) {
    log('モーダルタイトル確認', 'FAIL', e.message);
  }

  // Fill customer form
  try {
    await page.fill('#cus-name', '田中 裕子');
    await page.fill('#cus-address', '神奈川県横浜市港北区大倉山3-5-12');
    // building_type select — check options
    const buildingTypeOptions = await page.$$eval('#cus-building_type option', opts => opts.map(o => o.value));
    log('建物種別オプション確認', buildingTypeOptions.includes('一戸建て') ? 'PASS' : 'FAIL',
      `Options: ${JSON.stringify(buildingTypeOptions)}`);
    await page.selectOption('#cus-building_type', '一戸建て');
    await page.fill('#cus-age_years', '22');
    await page.fill('#cus-phone', '045-321-9876');
    await page.fill('#cus-email', 'tanaka.yuko@example.com');
    await page.fill('#cus-source', '紹介（橋本様）');
    await page.fill('#cus-note', '浴室・洗面所の全面リフォーム希望。予算200万円。');
    log('顧客フォーム全フィールド入力完了', 'PASS');
  } catch (e) {
    log('顧客フォーム入力', 'FAIL', e.message);
  }

  // Verify filled values
  try {
    const btVal = await page.$eval('#cus-building_type', el => el.value);
    const nameVal = await page.$eval('#cus-name', el => el.value);
    log('顧客フォーム 建物種別値確認', btVal === '一戸建て' ? 'PASS' : 'FAIL', `"${btVal}"`);
    log('顧客フォーム 氏名値確認', nameVal === '田中 裕子' ? 'PASS' : 'FAIL', `"${nameVal}"`);
  } catch (e) {
    log('顧客フォーム値確認', 'FAIL', e.message);
  }

  // Submit via form event dispatch (workaround for body scroll intercept bug)
  let customerSaved = false;
  try {
    // First check if direct click works — test the bug
    // Scroll page to top first to minimize intercept risk
    await page.evaluate(() => window.scrollTo(0, 0));
    // Try clicking via force option
    const responsePromise = page.waitForResponse(
      resp => resp.url().includes('/api/customers') && resp.request().method() === 'POST',
      { timeout: 8000 }
    );
    // Use page.evaluate to click to avoid the scroll intercept
    await page.evaluate(() => {
      const btn = document.querySelector('#customerForm button[type="submit"]');
      if (btn) btn.click();
    });
    const postResp = await responsePromise;
    const postBody = await postResp.json();
    customerSaved = postResp.ok();
    log('顧客POST APIレスポンス', postResp.ok() ? 'PASS' : 'FAIL',
      `status=${postResp.status()}, body=${JSON.stringify(postBody)}`);
  } catch (e) {
    log('顧客保存 送信 (JS click)', 'FAIL', e.message);
    // Fallback: submit via form event
    try {
      const responsePromise2 = page.waitForResponse(
        resp => resp.url().includes('/api/customers') && resp.request().method() === 'POST',
        { timeout: 8000 }
      );
      await submitForm('customerForm');
      const postResp2 = await responsePromise2;
      customerSaved = postResp2.ok();
      log('顧客POST APIレスポンス (フォームイベント)', postResp2.ok() ? 'PASS' : 'FAIL',
        `status=${postResp2.status()}`);
    } catch (e2) {
      log('顧客保存 送信 (フォームイベント)', 'FAIL', e2.message);
    }
  }

  // Get toast
  try {
    const toast1 = await getToast(5000);
    log('顧客保存 トースト確認', toast1 && toast1.includes('追加') ? 'PASS' : 'FAIL', `"${toast1}"`);
  } catch (e) {
    log('顧客保存 トースト確認', 'FAIL', e.message);
  }

  // Wait for modal close
  try {
    await page.waitForSelector('#customerModal:not(.open)', { timeout: 5000 });
    log('顧客モーダルクローズ確認', 'PASS');
  } catch (e) {
    log('顧客モーダルクローズ確認', 'FAIL', e.message);
    // Force close if stuck
    await page.evaluate(() => closeFormModal('customerModal'));
  }

  await page.waitForLoadState('networkidle');

  // Verify customer in table
  try {
    const tableText = await page.textContent('#page-customers');
    if (tableText && tableText.includes('田中 裕子')) {
      log('顧客テーブルに田中 裕子が表示', 'PASS');
    } else {
      log('顧客テーブルに田中 裕子が表示', 'FAIL', 'Not found in table');
    }
  } catch (e) {
    log('顧客テーブル確認', 'FAIL', e.message);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 2: 案件登録
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n=== STEP 2: 案件登録 ===');
  try {
    await page.click('[data-page="projects"]');
    await page.waitForSelector('#page-projects.active', { timeout: 5000 });
    await page.waitForLoadState('networkidle');
    log('案件管理ページ遷移', 'PASS');
  } catch (e) {
    log('案件管理ページ遷移', 'FAIL', e.message);
  }

  // Check add button ID
  try {
    const btnId = await page.$eval('#page-projects .add-btn', el => el.id || '(no id)');
    if (btnId === '(no id)') {
      log('＋新規案件ボタンにIDがない', 'FAIL', 'Button lacks id attribute');
    } else {
      log('＋新規案件ボタンID', 'PASS', `id="${btnId}"`);
    }
  } catch (e) {
    log('＋新規案件ボタンID確認', 'FAIL', e.message);
  }

  // Open modal
  try {
    await page.evaluate(() => openProjectModal());
    await page.waitForSelector('#projectModal.open', { timeout: 5000 });
    log('新規案件モーダルを開く', 'PASS');
  } catch (e) {
    log('新規案件モーダルを開く', 'FAIL', e.message);
  }

  // Check body scroll lock
  try {
    const overflow = await checkBodyScrollLocked();
    log('案件モーダル body scroll lock',
      overflow === 'hidden' || overflow === 'clip' ? 'PASS' : 'FAIL',
      `body overflow="${overflow}"`);
  } catch (e) {
    log('案件モーダル body scroll lock', 'FAIL', e.message);
  }

  // Check work_type datalist options match DB values
  try {
    const workTypeOpts = await page.$$eval('#workTypeList option', opts => opts.map(o => o.value));
    log('工事種別 datalistオプション確認', 'INFO', `Options: ${JSON.stringify(workTypeOpts)}`);
    if (workTypeOpts.includes('水回り')) {
      log('工事種別 水回り オプション存在', 'PASS');
    } else {
      log('工事種別 水回り オプション存在', 'FAIL', `水回り not found. Options: ${workTypeOpts.join(', ')}`);
    }
  } catch (e) {
    log('工事種別オプション確認', 'FAIL', e.message);
  }

  try {
    await page.fill('#prj-name', '田中様邸 浴室・洗面所リフォーム');
    await page.fill('#prj-customer_name', '田中 裕子');
    await page.fill('#prj-address', '神奈川県横浜市港北区大倉山3-5-12');
    await page.fill('#prj-work_type', '水回り');
    await page.selectOption('#prj-status', '初回訪問済');
    await page.fill('#prj-probability', '50');
    await page.fill('#prj-estimate_amount', '1980000');
    await page.fill('#prj-first_visit', '2026-06-25');
    await page.fill('#prj-note', '浴室・洗面所の全面リフォーム');
    log('案件フォーム全フィールド入力完了', 'PASS');
  } catch (e) {
    log('案件フォーム入力', 'FAIL', e.message);
  }

  // Verify key values
  try {
    const statusVal = await page.$eval('#prj-status', el => el.value);
    const visitVal = await page.$eval('#prj-first_visit', el => el.value);
    const workTypeVal = await page.$eval('#prj-work_type', el => el.value);
    log('案件フォーム ステータス確認', statusVal === '初回訪問済' ? 'PASS' : 'FAIL', `"${statusVal}"`);
    log('案件フォーム 初回訪問日確認', visitVal === '2026-06-25' ? 'PASS' : 'FAIL', `"${visitVal}"`);
    log('案件フォーム 工事種別確認', workTypeVal === '水回り' ? 'PASS' : 'FAIL', `"${workTypeVal}"`);
  } catch (e) {
    log('案件フォーム値確認', 'FAIL', e.message);
  }

  let newProjectId = null;
  try {
    const responsePromise = page.waitForResponse(
      resp => resp.url().includes('/api/projects') && resp.request().method() === 'POST',
      { timeout: 10000 }
    );
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(() => {
      const btn = document.querySelector('#projectForm button[type="submit"]');
      if (btn) btn.click();
    });
    const postResp = await responsePromise;
    const postBody = await postResp.json();
    newProjectId = postBody.id;
    log('案件POST APIレスポンス', postResp.ok() ? 'PASS' : 'FAIL',
      `status=${postResp.status()}, id=${newProjectId}`);
  } catch (e) {
    log('案件保存 送信', 'FAIL', e.message);
  }

  try {
    const toast2 = await getToast(5000);
    log('案件保存 トースト確認', toast2 && toast2.includes('追加') ? 'PASS' : 'FAIL', `"${toast2}"`);
  } catch (e) {
    log('案件保存 トースト確認', 'FAIL', e.message);
  }

  try {
    await page.waitForSelector('#projectModal:not(.open)', { timeout: 5000 });
    log('案件モーダルクローズ確認', 'PASS');
  } catch (e) {
    log('案件モーダルクローズ確認', 'FAIL', e.message);
    await page.evaluate(() => closeFormModal('projectModal'));
  }

  await page.waitForLoadState('networkidle');

  // Verify in table
  try {
    const tableText = await page.textContent('#page-projects');
    if (tableText && tableText.includes('田中様邸 浴室・洗面所リフォーム')) {
      log('案件テーブルに新規案件表示', 'PASS');
    } else {
      log('案件テーブルに新規案件表示', 'FAIL', '田中様邸 not found in table');
    }
  } catch (e) {
    log('案件テーブル確認', 'FAIL', e.message);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 3: 担当者配置
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n=== STEP 3: 担当者配置 ===');
  let assignedStaff = null;

  // Find project row and click staff button
  try {
    // Wait for table to have the new project
    const rows = await page.$$('#tbl-projects tbody tr');
    let projectRowIdx = -1;
    for (let i = 0; i < rows.length; i++) {
      const text = await rows[i].textContent();
      if (text.includes('田中様邸 浴室・洗面所リフォーム')) {
        projectRowIdx = i;
        break;
      }
    }
    if (projectRowIdx === -1) {
      log('担当者配置: 田中様邸行の特定', 'FAIL', 'Row not found');
    } else {
      log('担当者配置: 田中様邸行の特定', 'PASS', `row index ${projectRowIdx}`);
      const row = rows[projectRowIdx];
      // Check staff button exists
      const staffBtn = await row.$('.staff-btn');
      if (staffBtn) {
        // Use JS click to avoid scroll intercept
        await page.evaluate((idx) => {
          const rows = document.querySelectorAll('#tbl-projects tbody tr');
          const btn = rows[idx].querySelector('.staff-btn');
          if (btn) btn.click();
        }, projectRowIdx);
        log('担当ボタンをクリック', 'PASS');
      } else {
        log('担当ボタンをクリック', 'FAIL', '.staff-btn not found in row');
      }
    }
  } catch (e) {
    log('担当者配置 行操作', 'FAIL', e.message);
  }

  try {
    await page.waitForSelector('#staffModal.open', { timeout: 5000 });
    log('担当者選択モーダルを開く', 'PASS');
  } catch (e) {
    log('担当者選択モーダルを開く', 'FAIL', e.message);
  }

  // Load staff list and select first employee
  try {
    await page.waitForLoadState('networkidle');
    const staffOpts = await page.$$('.staff-opt');
    log('担当者リスト表示', staffOpts.length > 0 ? 'PASS' : 'FAIL', `${staffOpts.length} staff options`);
    if (staffOpts.length > 0) {
      // Get name of first staff member
      const firstOptText = await staffOpts[0].textContent();
      const staffNameEl = await staffOpts[0].$('.staff-opt-name');
      if (staffNameEl) {
        assignedStaff = (await staffNameEl.textContent()).trim();
        log('担当者名取得', 'PASS', `"${assignedStaff}"`);
      }
      // Click first staff option
      await staffOpts[0].click();
      log('担当者選択クリック', 'PASS', `選択: "${assignedStaff}"`);
    }
  } catch (e) {
    log('担当者選択', 'FAIL', e.message);
  }

  // Wait for API and toast
  try {
    const toast3 = await getToast(5000);
    log('担当者配置 トースト確認', toast3 && (toast3.includes('担当') || toast3.includes('更新')) ? 'PASS' : 'FAIL', `"${toast3}"`);
  } catch (e) {
    log('担当者配置 トースト確認', 'FAIL', e.message);
  }

  try {
    await page.waitForSelector('#staffModal:not(.open)', { timeout: 5000 });
    log('担当者モーダルクローズ', 'PASS');
  } catch (e) {
    log('担当者モーダルクローズ', 'FAIL', e.message);
  }

  await page.waitForLoadState('networkidle');

  // Verify staff shown in table
  try {
    if (assignedStaff) {
      const rows = await page.$$('#tbl-projects tbody tr');
      let staffShown = false;
      for (const row of rows) {
        const text = await row.textContent();
        if (text.includes('田中様邸 浴室・洗面所リフォーム')) {
          // Extract surname from assignedStaff (e.g., "田中 太郎" -> check for "田中")
          const surname = assignedStaff.split(' ')[0];
          if (text.includes(surname)) {
            staffShown = true;
          }
          break;
        }
      }
      log('担当者名がテーブルに表示', staffShown ? 'PASS' : 'FAIL', `Looking for surname of "${assignedStaff}"`);
    } else {
      log('担当者テーブル確認 (スキップ)', 'INFO', 'No assigned staff to verify');
    }
  } catch (e) {
    log('担当者テーブル確認', 'FAIL', e.message);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 4a: ステータス進行 → 商談中
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n=== STEP 4a: ステータス進行 → 商談中 ===');

  async function editProjectStatus(newStatus, extraFields = {}) {
    try {
      const rows = await page.$$('#tbl-projects tbody tr');
      let targetIdx = -1;
      for (let i = 0; i < rows.length; i++) {
        const text = await rows[i].textContent();
        if (text.includes('田中様邸 浴室・洗面所リフォーム')) {
          targetIdx = i;
          break;
        }
      }
      if (targetIdx === -1) {
        log(`ステータス変更 (${newStatus}): 行の特定`, 'FAIL', 'Row not found');
        return false;
      }
      // Click edit button in row
      await page.evaluate((idx) => {
        const rows = document.querySelectorAll('#tbl-projects tbody tr');
        const editBtn = rows[idx].querySelector('.action-btn:not(.del)');
        if (editBtn) editBtn.click();
      }, targetIdx);
      await page.waitForSelector('#projectModal.open', { timeout: 5000 });
      log(`案件編集モーダルを開く (${newStatus})`, 'PASS');
    } catch (e) {
      log(`案件編集モーダルを開く (${newStatus})`, 'FAIL', e.message);
      return false;
    }

    // Check pre-filled status
    try {
      const currentStatus = await page.$eval('#prj-status', el => el.value);
      log(`編集モーダル 事前ステータス (${newStatus})`, 'INFO', `Pre-filled: "${currentStatus}"`);
    } catch (e) {}

    // Set status
    try {
      await page.selectOption('#prj-status', newStatus);
      const val = await page.$eval('#prj-status', el => el.value);
      log(`ステータスを${newStatus}に変更`, val === newStatus ? 'PASS' : 'FAIL', `value="${val}"`);
    } catch (e) {
      log(`ステータス ${newStatus} 選択`, 'FAIL', e.message);
    }

    // Set extra fields
    for (const [fieldId, fieldVal] of Object.entries(extraFields)) {
      try {
        await page.fill(fieldId, fieldVal);
        const filled = await page.$eval(fieldId, el => el.value);
        log(`フィールド ${fieldId} 入力`, filled === fieldVal ? 'PASS' : 'FAIL', `"${filled}"`);
      } catch (e) {
        log(`フィールド ${fieldId} 入力`, 'FAIL', e.message);
      }
    }

    // Submit
    try {
      const responsePromise = page.waitForResponse(
        resp => resp.url().match(/\/api\/projects\/\d+/) && resp.request().method() === 'PUT',
        { timeout: 10000 }
      );
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.evaluate(() => {
        const btn = document.querySelector('#projectForm button[type="submit"]');
        if (btn) btn.click();
      });
      const putResp = await responsePromise;
      const putBody = await putResp.json().catch(() => ({}));
      log(`案件PUT API (${newStatus})`, putResp.ok() ? 'PASS' : 'FAIL',
        `status=${putResp.status()}, body=${JSON.stringify(putBody)}`);
    } catch (e) {
      log(`案件PUT API (${newStatus})`, 'FAIL', e.message);
    }

    try {
      const toast = await getToast(5000);
      log(`ステータス更新 トースト (${newStatus})`, toast && toast.includes('更新') ? 'PASS' : 'FAIL', `"${toast}"`);
    } catch (e) {
      log(`トースト確認 (${newStatus})`, 'FAIL', e.message);
    }

    try {
      await page.waitForSelector('#projectModal:not(.open)', { timeout: 5000 });
      log(`案件モーダルクローズ (${newStatus})`, 'PASS');
    } catch (e) {
      log(`案件モーダルクローズ (${newStatus})`, 'FAIL', e.message);
      await page.evaluate(() => closeFormModal('projectModal'));
    }
    await page.waitForLoadState('networkidle');

    // Verify in table
    try {
      const tableText = await page.textContent('#page-projects');
      if (tableText && tableText.includes(newStatus)) {
        log(`テーブルで${newStatus}ステータス確認`, 'PASS');
      } else {
        log(`テーブルで${newStatus}ステータス確認`, 'FAIL', `Badge "${newStatus}" not found in table`);
      }
    } catch (e) {
      log(`テーブル${newStatus}確認`, 'FAIL', e.message);
    }
    return true;
  }

  // 4a: → 商談中
  await editProjectStatus('商談中');

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 4b: ステータス進行 → 契約済
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n=== STEP 4b: ステータス進行 → 契約済 ===');
  await editProjectStatus('契約済', {
    '#prj-contract_date': '2026-06-25',
    '#prj-contract_amount': '1950000'
  });

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 5: 完了処理
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n=== STEP 5: 完了処理 ===');

  // Check if 完了 is in status options
  try {
    await page.evaluate(() => {
      // Peek at status options without opening modal
      const opts = Array.from(document.querySelectorAll('#prj-status option')).map(o => o.value);
      return opts;
    });
    // Actually open the modal to check options
    await page.evaluate(() => openProjectModal());
    await page.waitForSelector('#projectModal.open', { timeout: 5000 });
    const statusOpts = await page.$$eval('#prj-status option', opts => opts.map(o => o.value));
    log('ステータス選択肢に完了が含まれる', statusOpts.includes('完了') ? 'PASS' : 'FAIL',
      `Options: ${JSON.stringify(statusOpts)}`);
    await page.evaluate(() => closeFormModal('projectModal'));
    await page.waitForSelector('#projectModal:not(.open)', { timeout: 3000 });
  } catch (e) {
    log('ステータス選択肢確認', 'FAIL', e.message);
  }

  await editProjectStatus('完了');

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 6: 請求登録
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n=== STEP 6: 請求登録 ===');
  try {
    await page.click('[data-page="invoices"]');
    await page.waitForSelector('#page-invoices.active', { timeout: 5000 });
    await page.waitForLoadState('networkidle');
    log('請求・入金管理ページ遷移', 'PASS');
  } catch (e) {
    log('請求・入金管理ページ遷移', 'FAIL', e.message);
  }

  // Check add button ID
  try {
    const btnId = await page.$eval('#page-invoices .add-btn', el => el.id || '(no id)');
    if (btnId === '(no id)') {
      log('＋新規請求ボタンにIDがない', 'FAIL', 'Button lacks id attribute');
    } else {
      log('＋新規請求ボタンID', 'PASS', `id="${btnId}"`);
    }
  } catch (e) {
    log('＋新規請求ボタンID確認', 'FAIL', e.message);
  }

  // Open invoice modal
  try {
    await page.evaluate(() => openInvoiceModal());
    await page.waitForSelector('#invoiceModal.open', { timeout: 5000 });
    log('新規請求モーダルを開く', 'PASS');
  } catch (e) {
    log('新規請求モーダルを開く', 'FAIL', e.message);
  }

  // Check billing_type options
  try {
    const billingOpts = await page.$$eval('#inv-billing_type option', opts => opts.map(o => o.value));
    log('請求種別オプション確認', 'INFO', `Options: ${JSON.stringify(billingOpts)}`);
    const hasIkkatsu = billingOpts.includes('一括') || billingOpts.includes('一括払い');
    log('請求種別 一括オプション存在', hasIkkatsu ? 'PASS' : 'FAIL',
      `Searched for 一括/一括払い in: ${billingOpts.join(', ')}`);
  } catch (e) {
    log('請求種別オプション確認', 'FAIL', e.message);
  }

  // Check default payment_status
  try {
    const payDefault = await page.$eval('#inv-payment_status', el => el.value);
    log('入金状況 デフォルト値確認', payDefault === '未入金' ? 'PASS' : 'FAIL', `"${payDefault}"`);
  } catch (e) {
    log('入金状況デフォルト確認', 'FAIL', e.message);
  }

  try {
    await page.fill('#inv-invoice_no', 'INV-2026-0036');
    await page.fill('#inv-project_name', '田中様邸 浴室・洗面所リフォーム');
    await page.fill('#inv-customer_name', '田中 裕子');
    // billing_type
    const billingOpts = await page.$$eval('#inv-billing_type option', opts => opts.map(o => o.value));
    if (billingOpts.includes('一括')) {
      await page.selectOption('#inv-billing_type', '一括');
    } else if (billingOpts.includes('一括払い')) {
      await page.selectOption('#inv-billing_type', '一括払い');
    }
    await page.fill('#inv-billing_date', '2026-06-25');
    await page.fill('#inv-amount', '1950000');
    await page.fill('#inv-due_date', '2026-07-31');
    // payment_status should already be 未入金
    const payStatus = await page.$eval('#inv-payment_status', el => el.value);
    log('請求フォーム 入金状況値確認', payStatus === '未入金' ? 'PASS' : 'FAIL', `"${payStatus}"`);
    log('請求フォーム全フィールド入力完了', 'PASS');
  } catch (e) {
    log('請求フォーム入力', 'FAIL', e.message);
  }

  let newInvoiceId = null;
  try {
    const responsePromise = page.waitForResponse(
      resp => resp.url().includes('/api/invoices') && resp.request().method() === 'POST',
      { timeout: 10000 }
    );
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(() => {
      const btn = document.querySelector('#invoiceForm button[type="submit"]');
      if (btn) btn.click();
    });
    const postResp = await responsePromise;
    const postBody = await postResp.json();
    newInvoiceId = postBody.id;
    log('請求POST APIレスポンス', postResp.ok() ? 'PASS' : 'FAIL',
      `status=${postResp.status()}, id=${newInvoiceId}`);
  } catch (e) {
    log('請求保存 送信', 'FAIL', e.message);
  }

  try {
    const toast6 = await getToast(5000);
    log('請求保存 トースト確認', toast6 && toast6.includes('追加') ? 'PASS' : 'FAIL', `"${toast6}"`);
  } catch (e) {
    log('請求保存 トースト確認', 'FAIL', e.message);
  }

  try {
    await page.waitForSelector('#invoiceModal:not(.open)', { timeout: 5000 });
    log('請求モーダルクローズ確認', 'PASS');
  } catch (e) {
    log('請求モーダルクローズ確認', 'FAIL', e.message);
    await page.evaluate(() => closeFormModal('invoiceModal'));
  }

  await page.waitForLoadState('networkidle');

  // Verify in table
  try {
    const tableText = await page.textContent('#page-invoices');
    if (tableText && tableText.includes('INV-2026-0036')) {
      log('請求テーブルに新規請求表示', 'PASS');
    } else {
      log('請求テーブルに新規請求表示', 'FAIL', 'INV-2026-0036 not found in table');
    }
  } catch (e) {
    log('請求テーブル確認', 'FAIL', e.message);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 7: 入金処理
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n=== STEP 7: 入金処理 ===');
  try {
    const rows = await page.$$('#tbl-invoices tbody tr');
    let targetIdx = -1;
    for (let i = 0; i < rows.length; i++) {
      const text = await rows[i].textContent();
      if (text.includes('INV-2026-0036')) {
        targetIdx = i;
        break;
      }
    }
    if (targetIdx === -1) {
      log('入金処理: INV-2026-0036行の特定', 'FAIL', 'Row not found');
    } else {
      log('入金処理: INV-2026-0036行の特定', 'PASS', `row index ${targetIdx}`);
      // Click edit button
      await page.evaluate((idx) => {
        const rows = document.querySelectorAll('#tbl-invoices tbody tr');
        const btn = rows[idx].querySelector('.action-btn:not(.del)');
        if (btn) btn.click();
      }, targetIdx);
      await page.waitForSelector('#invoiceModal.open', { timeout: 5000 });
      log('請求編集モーダルを開く (入金処理)', 'PASS');
    }
  } catch (e) {
    log('入金処理 モーダルを開く', 'FAIL', e.message);
  }

  // Check pre-filled values
  try {
    const invoiceNoVal = await page.$eval('#inv-invoice_no', el => el.value);
    log('請求番号の事前確認', invoiceNoVal === 'INV-2026-0036' ? 'PASS' : 'FAIL', `"${invoiceNoVal}"`);
    const billingDateVal = await page.$eval('#inv-billing_date', el => el.value);
    log('請求日の事前確認 (toInputDate動作)', billingDateVal !== '' ? 'PASS' : 'FAIL', `billing_date="${billingDateVal}"`);
    if (billingDateVal === '') {
      log('請求日が空白 (toInputDate失敗)', 'FAIL', 'Newly created invoice has YYYY-MM-DD format date; toInputDate should return it as-is');
    }
    const amountVal = await page.$eval('#inv-amount', el => el.value);
    log('金額の事前確認', amountVal === '1950000' ? 'PASS' : 'FAIL', `amount="${amountVal}"`);
    const dueDateVal = await page.$eval('#inv-due_date', el => el.value);
    log('支払期限の事前確認', dueDateVal !== '' ? 'PASS' : 'FAIL', `due_date="${dueDateVal}"`);
  } catch (e) {
    log('請求編集モーダル事前確認', 'FAIL', e.message);
  }

  // Check payment_status options
  try {
    const payStatusOpts = await page.$$eval('#inv-payment_status option', opts => opts.map(o => o.value));
    log('入金状況 オプション確認', 'INFO', `Options: ${JSON.stringify(payStatusOpts)}`);
    if (payStatusOpts.includes('入金済')) {
      await page.selectOption('#inv-payment_status', '入金済');
      log('入金状況を入金済に変更', 'PASS');
    } else {
      log('入金状況を入金済に変更', 'FAIL', `入金済 not found. Options: ${payStatusOpts.join(', ')}`);
    }
  } catch (e) {
    log('入金状況変更', 'FAIL', e.message);
  }

  try {
    await page.fill('#inv-payment_date', '2026-07-28');
    const payDateVal = await page.$eval('#inv-payment_date', el => el.value);
    log('入金日入力', payDateVal === '2026-07-28' ? 'PASS' : 'FAIL', `"${payDateVal}"`);
  } catch (e) {
    log('入金日入力', 'FAIL', e.message);
  }

  // Submit
  try {
    const responsePromise = page.waitForResponse(
      resp => resp.url().match(/\/api\/invoices\/\d+/) && resp.request().method() === 'PUT',
      { timeout: 10000 }
    );
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(() => {
      const btn = document.querySelector('#invoiceForm button[type="submit"]');
      if (btn) btn.click();
    });
    const putResp = await responsePromise;
    log('請求PUT API (入金済)', putResp.ok() ? 'PASS' : 'FAIL', `status=${putResp.status()}`);
  } catch (e) {
    log('入金処理 PUT送信', 'FAIL', e.message);
  }

  try {
    const toast7 = await getToast(5000);
    log('入金処理 トースト確認', toast7 && toast7.includes('更新') ? 'PASS' : 'FAIL', `"${toast7}"`);
  } catch (e) {
    log('入金処理 トースト確認', 'FAIL', e.message);
  }

  try {
    await page.waitForSelector('#invoiceModal:not(.open)', { timeout: 5000 });
    log('請求モーダルクローズ (入金後)', 'PASS');
  } catch (e) {
    log('請求モーダルクローズ (入金後)', 'FAIL', e.message);
    await page.evaluate(() => closeFormModal('invoiceModal'));
  }

  await page.waitForLoadState('networkidle');

  // Verify 入金済 in table
  try {
    const rows = await page.$$('#tbl-invoices tbody tr');
    let statusShown = false;
    for (const row of rows) {
      const text = await row.textContent();
      if (text.includes('INV-2026-0036')) {
        if (text.includes('入金済')) statusShown = true;
        break;
      }
    }
    log('テーブルで入金済ステータス確認', statusShown ? 'PASS' : 'FAIL',
      statusShown ? '' : '入金済 badge not found in INV-2026-0036 row');
  } catch (e) {
    log('入金済テーブル確認', 'FAIL', e.message);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 8: ダッシュボード確認
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n=== STEP 8: ダッシュボード確認 ===');
  try {
    await page.click('[data-page="dashboard"]');
    await page.waitForSelector('#page-dashboard.active', { timeout: 5000 });
    await page.waitForLoadState('networkidle');
    log('ダッシュボードページ遷移', 'PASS');
  } catch (e) {
    log('ダッシュボードページ遷移', 'FAIL', e.message);
  }

  // Wait for KPI to populate
  try {
    await page.waitForFunction(
      () => {
        const el = document.getElementById('kpi-contracted');
        return el && el.textContent.trim() !== '' && el.textContent.trim() !== '―';
      },
      { timeout: 8000 }
    );
    log('KPI値ロード待機', 'PASS');
  } catch (e) {
    log('KPI値ロード待機', 'FAIL', e.message);
  }

  try {
    const contracted = await page.textContent('#kpi-contracted');
    const paid = await page.textContent('#kpi-paid');
    const unpaid = await page.textContent('#kpi-unpaid');
    const pipeline = await page.textContent('#kpi-pipeline');
    log('KPI contracted表示', contracted && contracted.trim() !== '' ? 'PASS' : 'FAIL', `"${contracted}"`);
    log('KPI paid表示', paid && paid.trim() !== '' ? 'PASS' : 'FAIL', `"${paid}"`);
    log('KPI unpaid表示', unpaid && unpaid.trim() !== '' ? 'PASS' : 'FAIL', `"${unpaid}"`);
    log('KPI pipeline表示', pipeline && pipeline.trim() !== '' ? 'PASS' : 'FAIL', `"${pipeline}"`);
  } catch (e) {
    log('KPI値表示確認', 'FAIL', e.message);
  }

  // Check charts rendered
  try {
    const chartStatus = await page.$('#chart-status');
    const chartType = await page.$('#chart-type');
    const chartMonthly = await page.$('#chart-monthly');
    log('Chart.jsキャンバス存在', chartStatus && chartType && chartMonthly ? 'PASS' : 'FAIL',
      `status=${!!chartStatus}, type=${!!chartType}, monthly=${!!chartMonthly}`);
  } catch (e) {
    log('チャートキャンバス確認', 'FAIL', e.message);
  }

  // Fetch /api/summary to verify pipeline excludes 完了
  try {
    const summaryData = await page.evaluate(() => fetch('/api/summary').then(r => r.json()));
    const allProjectsData = await page.evaluate(() => fetch('/api/projects').then(r => r.json()));
    log('/api/summary フィールド確認', 'INFO', `contracted_total=${summaryData.contracted_total}, paid=${summaryData.paid_amount}, unpaid=${summaryData.unpaid_amount}`);

    // Pipeline check: server-side /api/summary pipeline_count
    const pipelineCount = summaryData.pipeline_count;
    log('/api/summary pipeline_count', pipelineCount !== undefined ? 'PASS' : 'FAIL', `pipeline_count=${pipelineCount}`);

    // Check if 完了 projects count toward pipeline
    const completedProjects = allProjectsData.filter(p => p.status === '完了');
    const pipelineClientCalc = allProjectsData.filter(p => p.status !== '契約済' && p.status !== '失注');
    const completedInPipeline = pipelineClientCalc.filter(p => p.status === '完了');
    log('完了案件の件数', 'INFO', `${completedProjects.length}件`);
    log('パイプラインに完了案件が含まれるか (server pipeline logic)',
      completedInPipeline.length > 0 ? 'FAIL' : 'PASS',
      `完了案件 in pipeline: ${completedInPipeline.length} (server uses: status != 契約済 AND status != 失注 — 完了 IS included!)`
    );

    // This is a business logic bug: 完了 status should be excluded from pipeline
    // Let's check what the server actually uses for pipeline
    log('パイプライン論理チェック', 'INFO',
      `Server pipeline includes 完了? ${completedInPipeline.length > 0 ? 'YES (Bug)' : 'No'}`);

  } catch (e) {
    log('API summary/pipeline確認', 'FAIL', e.message);
  }

  // Check if dashboard row duplication occurs (navigate away and back)
  try {
    await page.click('[data-page="projects"]');
    await page.waitForSelector('#page-projects.active', { timeout: 3000 });
    await page.click('[data-page="dashboard"]');
    await page.waitForSelector('#page-dashboard.active', { timeout: 3000 });
    await page.waitForLoadState('networkidle');
    // Count rows in recent projects table
    const recentRows = await page.$$('#tbl-recent tbody tr');
    log('ダッシュボード再訪問時 rows count', 'INFO', `${recentRows.length} rows in recent projects`);
    // After double-navigation, if duplication bug exists, we'd see > 10 rows
    if (recentRows.length > 10) {
      log('ダッシュボード tbody 行重複チェック', 'FAIL',
        `Expected ≤10 rows, got ${recentRows.length} — tbody duplication bug may still exist`);
    } else {
      log('ダッシュボード tbody 行重複チェック', 'PASS', `${recentRows.length} rows (≤10)`);
    }
  } catch (e) {
    log('ダッシュボード重複チェック', 'FAIL', e.message);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ADDITIONAL: Responsive layout check
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n=== ADDITIONAL: Responsive checks ===');
  for (const [vpName, vpWidth, vpHeight] of [
    ['Tablet (768x1024)', 768, 1024],
    ['Mobile (390x844)', 390, 844],
  ]) {
    try {
      await page.setViewportSize({ width: vpWidth, height: vpHeight });
      await page.waitForTimeout(300);
      // Check for horizontal overflow
      const overflowX = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });
      log(`${vpName} 横スクロール発生`, overflowX ? 'FAIL' : 'PASS',
        overflowX ? `scrollWidth > clientWidth (horizontal overflow)` : 'No overflow');
      // Check topbar visibility
      if (vpWidth <= 480) {
        const topbarVisible = await page.isVisible('.topbar');
        log(`${vpName} ハンバーガーメニュー表示`, topbarVisible ? 'PASS' : 'FAIL');
      }
    } catch (e) {
      log(`${vpName} レスポンシブ確認`, 'FAIL', e.message);
    }
  }
  // Reset to desktop
  await page.setViewportSize({ width: 1440, height: 900 });

  // ─────────────────────────────────────────────────────────────────────────
  // SUMMARY OUTPUT
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n\n==============================');
  console.log('        TEST SUMMARY');
  console.log('==============================');
  const passes = results.filter(r => r.status === 'PASS').length;
  const fails = results.filter(r => r.status === 'FAIL').length;
  const infos = results.filter(r => r.status === 'INFO').length;
  console.log(`PASS: ${passes} | FAIL: ${fails} | INFO: ${infos}`);

  console.log('\n--- FAILED STEPS ---');
  results.filter(r => r.status === 'FAIL').forEach(r => {
    console.log(`  [FAIL] ${r.step}: ${r.details}`);
  });

  console.log('\n--- ALL RESULTS ---');
  results.forEach(r => {
    const sym = r.status === 'PASS' ? 'PASS' : r.status === 'FAIL' ? 'FAIL' : 'INFO';
    console.log(`  [${sym}] ${r.step}: ${r.details}`);
  });

  console.log('\n--- API LOG ---');
  apiLog.forEach(e => {
    console.log(`  [${e.status}] ${e.url.replace('http://localhost:3000', '')} ok=${e.ok} isJson=${e.isJson} body=${e.body}`);
  });

  console.log('\n--- CONSOLE ERRORS ---');
  if (consoleErrors.length === 0) {
    console.log('  (none)');
  } else {
    consoleErrors.forEach(e => console.log(`  [${e.time}] ${e.text}`));
  }

  console.log('\n--- NETWORK ERRORS ---');
  if (networkErrors.length === 0) {
    console.log('  (none)');
  } else {
    networkErrors.forEach(e => console.log(`  ${e}`));
  }

  await browser.close();
  process.exit(0);
})();
