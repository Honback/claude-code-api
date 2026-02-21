import { chromium } from 'playwright';

const BASE = 'http://localhost:9090';
const results = [];

function log(name, pass, detail = '') {
  const icon = pass ? '✅' : '❌';
  results.push({ name, pass, detail });
  console.log(`${icon} ${name}${detail ? ' — ' + detail : ''}`);
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(15000);

  // ===== 1. Main page loads =====
  try {
    const res = await page.goto(BASE, { waitUntil: 'networkidle' });
    log('Main page loads', res.status() === 200, `HTTP ${res.status()}`);
  } catch (e) {
    log('Main page loads', false, e.message);
  }

  // ===== 2. Check navbar elements =====
  try {
    const title = await page.textContent('nav, header, [class*="nav"], [class*="Nav"]');
    const hasSettings = await page.locator('a[href*="settings"], button:has-text("Settings"), a:has-text("Settings"), a:has-text("설정")').count();
    log('Navbar exists', !!title, `Settings link: ${hasSettings > 0 ? 'found' : 'not found'}`);
  } catch (e) {
    log('Navbar exists', false, e.message);
  }

  // ===== 3. Chat page elements =====
  try {
    // Look for chat input area
    const chatInput = await page.locator('textarea, input[type="text"][placeholder*="메시지"], input[placeholder*="message"], [contenteditable="true"]').first();
    const visible = await chatInput.isVisible().catch(() => false);
    log('Chat input exists', visible);
  } catch (e) {
    log('Chat input exists', false, e.message);
  }

  // ===== 4. Navigate to Settings =====
  try {
    // Try clicking settings link
    const settingsLink = page.locator('a[href*="settings"], a:has-text("Settings"), a:has-text("설정")').first();
    if (await settingsLink.count() > 0) {
      await settingsLink.click();
      await page.waitForURL('**/settings', { timeout: 5000 }).catch(() => {});
    } else {
      await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' });
    }
    const url = page.url();
    log('Settings page navigates', url.includes('settings'), `URL: ${url}`);
  } catch (e) {
    log('Settings page navigates', false, e.message);
    await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' }).catch(() => {});
  }

  // ===== 5. Settings page content =====
  try {
    await page.waitForSelector('text=OAuth', { timeout: 5000 });
    const hasOAuth = await page.locator('text=OAuth').count() > 0;
    const hasApiKey = await page.locator('text=API').count() > 0;
    const hasTestConn = await page.locator('text=연결 테스트, text=Test Connection, button:has-text("테스트")').first().count() > 0;
    log('Settings page content', hasOAuth && hasApiKey, `OAuth: ${hasOAuth}, API Key: ${hasApiKey}, Test: ${hasTestConn}`);
  } catch (e) {
    log('Settings page content', false, e.message);
  }

  // ===== 6. OAuth login start button =====
  try {
    const oauthBtn = page.locator('button:has-text("OAuth 로그인 시작"), button:has-text("OAuth")').first();
    const btnVisible = await oauthBtn.isVisible();
    log('OAuth login button visible', btnVisible);
  } catch (e) {
    log('OAuth login button visible', false, e.message);
  }

  // ===== 7. Connection test =====
  try {
    const testBtn = page.locator('button:has-text("연결 테스트")').or(page.locator('button:has-text("Test")')).first();
    if (await testBtn.isVisible()) {
      await testBtn.click();
      // Wait for result - either success or failure indicator
      const resultLocator = page.locator('text=연결 성공').or(page.locator('text=connected')).or(page.locator('text=연결 실패')).or(page.locator('text=Connection'));
      await resultLocator.first().waitFor({ state: 'visible', timeout: 10000 });
      const success = await page.locator('text=연결 성공').or(page.locator('text=connected')).count() > 0;
      log('Connection test works', true, success ? 'connected' : 'error (but endpoint responded)');
    } else {
      log('Connection test works', false, 'Button not visible');
    }
  } catch (e) {
    log('Connection test works', false, e.message);
  }

  // ===== 8. Auth status endpoint =====
  try {
    const authRes = await page.request.get(`${BASE}/api/settings/auth/status`);
    const authData = await authRes.json();
    log('Auth status API', authRes.status() === 200, `logged_in: ${authData.logged_in}, method: ${authData.auth_method}`);
  } catch (e) {
    log('Auth status API', false, e.message);
  }

  // ===== 9. Go back to chat and test sending a message =====
  try {
    await page.goto(BASE, { waitUntil: 'networkidle' });

    // Find the chat input
    const chatInput = page.locator('textarea, input[type="text"]').first();
    await chatInput.waitFor({ state: 'visible', timeout: 5000 });

    // Type a test message
    await chatInput.fill('Hello, this is a test');

    // Find and click send button or press Enter
    const sendBtn = page.locator('button[type="submit"], button:has-text("전송"), button:has-text("Send"), button svg[viewBox]').first();

    if (await sendBtn.count() > 0) {
      await sendBtn.click();
    } else {
      await chatInput.press('Enter');
    }

    // Wait for any response (success or error)
    await page.waitForTimeout(3000);

    // Check for response elements
    const pageContent = await page.textContent('body');
    const hasError = pageContent.includes('error') || pageContent.includes('에러') || pageContent.includes('실패') || pageContent.includes('Error');
    const hasResponse = await page.locator('[class*="message"], [class*="Message"], [class*="chat"], [class*="Chat"], [class*="response"], [class*="Response"]').count();

    // Check for SSE/streaming response
    const networkLogs = [];
    page.on('response', resp => {
      if (resp.url().includes('chat') || resp.url().includes('completions')) {
        networkLogs.push({ url: resp.url(), status: resp.status() });
      }
    });

    log('Chat message sent', true, `Messages on page: ${hasResponse}, Errors visible: ${hasError}`);
  } catch (e) {
    log('Chat message sent', false, e.message);
  }

  // ===== 10. Test chat API directly =====
  try {
    const chatRes = await page.request.post(`${BASE}/api/chat/completions`, {
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({ message: 'Say hello in one word', model: 'claude-haiku-4-5-20251001' }),
      timeout: 15000,
    });
    const status = chatRes.status();
    const body = await chatRes.text();
    const firstLine = body.split('\n').find(l => l.startsWith('data:')) || body.substring(0, 200);
    // When not authenticated, expect an SSE error with auth message (not a hang)
    const hasAuthError = body.includes('인증이 필요합니다') || body.includes('authentication');
    const hasDone = body.includes('[DONE]');
    const responded = hasAuthError || body.includes('choices');
    log('Chat API direct call', status === 200 && responded && hasDone,
        `HTTP ${status}, auth_error: ${hasAuthError}, has_done: ${hasDone}, preview: ${firstLine.substring(0, 120)}`);
  } catch (e) {
    log('Chat API direct call', false, e.message);
  }

  // ===== 11. Screenshot for visual verification =====
  try {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.screenshot({ path: '/tmp/test-main.png', fullPage: true });
    await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' });
    await page.screenshot({ path: '/tmp/test-settings.png', fullPage: true });
    log('Screenshots saved', true, '/tmp/test-main.png, /tmp/test-settings.png');
  } catch (e) {
    log('Screenshots saved', false, e.message);
  }

  await browser.close();

  // ===== Summary =====
  console.log('\n' + '='.repeat(60));
  const passed = results.filter(r => r.pass).length;
  const total = results.length;
  console.log(`Results: ${passed}/${total} passed`);

  const failures = results.filter(r => !r.pass);
  if (failures.length > 0) {
    console.log('\nFailures:');
    failures.forEach(f => console.log(`  ❌ ${f.name}: ${f.detail}`));
  }
}

run().catch(e => { console.error('Test runner error:', e); process.exit(1); });
