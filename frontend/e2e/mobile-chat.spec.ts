import { expect, test } from '@playwright/test';

const apiBaseUrl = 'https://mock-api.test';
const projectId = 'mock-project';
const ownerUid = 'workspace-owner-uid';
const idToken = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJhdWQiOiJtb2NrLXByb2plY3QiLCJpc3MiOiJodHRwczovL3NlY3VyZXRva2VuLmdvb2dsZS5jb20vbW9jay1wcm9qZWN0Iiwic3ViIjoid29ya3NwYWNlLW93bmVyLXVpZCIsInVpZCI6IndvcmtzcGFjZS1vd25lci11aWQiLCJleHAiOjQ5MDAwMDAwMDB9.signature';

test('mobile chat exposes empty, loading, retry and response states and keeps its composer above the dock', async ({ page }) => {
  const uncaughtErrors: string[] = [];
  const chatRequests: Array<{ businessId: string; message: string; authorization?: string }> = [];
  const paymentRequests: string[] = [];
  let chatAttempts = 0;
  page.on('pageerror', error => uncaughtErrors.push(error.message));
  await page.addInitScript(() => {
    window.localStorage.setItem('aba-language', 'ar');
    const testWindow = window as Window & { __abaTestKeyboardInset?: number };
    testWindow.__abaTestKeyboardInset = 0;
    // Model the Android visual viewport separately from Playwright's layout viewport.
    const visualViewport = new EventTarget();
    Object.defineProperties(visualViewport, {
      height: {
        configurable: true,
        get: () => Math.max(0, window.innerHeight - (testWindow.__abaTestKeyboardInset || 0)),
      },
      offsetTop: { configurable: true, get: () => 0 },
    });
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: visualViewport });
  });

  // All external dependencies are mocked. The test cannot contact Firebase production
  // or the real business API, and it never writes to a real workspace.
  await page.route('**/*', async route => {
    const hostname = new URL(route.request().url()).hostname;
    const allowedHosts = new Set([
      '127.0.0.1',
      'localhost',
      'mock-api.test',
      'identitytoolkit.googleapis.com',
      'securetoken.googleapis.com',
    ]);
    if (allowedHosts.has(hostname)) {
      await route.fallback();
      return;
    }
    await route.abort();
  });

  await page.route('**/runtime-config.json', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        apiBaseUrl,
        firebase: {
          apiKey: 'test-api-key',
          authDomain: projectId + '.firebaseapp.com',
          projectId,
          appId: '1:123:web:mock-app',
        },
      }),
    });
  });

  const firebaseHeaders = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': '*',
    'content-type': 'application/json',
  };

  await page.route('https://identitytoolkit.googleapis.com/**', async route => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: firebaseHeaders });
      return;
    }

    const pathname = new URL(request.url()).pathname;
    if (pathname.endsWith('/accounts:signInWithPassword')) {
      await route.fulfill({
        status: 200,
        headers: firebaseHeaders,
        body: JSON.stringify({
          kind: 'identitytoolkit#VerifyPasswordResponse',
          localId: ownerUid,
          email: 'owner@example.test',
          displayName: 'Workspace Owner',
          idToken,
          refreshToken: 'mock-refresh-token',
          expiresIn: '3600',
          registered: true,
        }),
      });
      return;
    }

    if (pathname.endsWith('/accounts:lookup')) {
      await route.fulfill({
        status: 200,
        headers: firebaseHeaders,
        body: JSON.stringify({
          users: [{
            localId: ownerUid,
            email: 'owner@example.test',
            emailVerified: true,
            displayName: 'Workspace Owner',
            lastLoginAt: '1793059200000',
            createdAt: '1790812800000',
            providerUserInfo: [{
              providerId: 'password',
              federatedId: 'owner@example.test',
              email: 'owner@example.test',
              rawId: 'owner@example.test',
            }],
          }],
        }),
      });
      return;
    }

    await route.fulfill({ status: 200, headers: firebaseHeaders, body: JSON.stringify({ users: [] }) });
  });

  await page.route('https://securetoken.googleapis.com/**', async route => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: firebaseHeaders });
      return;
    }
    await route.fulfill({
      status: 200,
      headers: firebaseHeaders,
      body: JSON.stringify({
        access_token: idToken,
        id_token: idToken,
        expires_in: '3600',
        token_type: 'Bearer',
        refresh_token: 'mock-refresh-token',
        user_id: ownerUid,
        project_id: projectId,
      }),
    });
  });

  const corsHeaders = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS',
    'access-control-allow-headers': '*',
    'access-control-max-age': '600',
    'content-type': 'application/json',
  };

  await page.route(apiBaseUrl + '/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }

    if (path === '/version') {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        body: JSON.stringify({ version: '1.3.9', commit: 'e2e-test', environment: 'test' }),
      });
      return;
    }

    if (path === '/api/v1/platform-admin/access') {
      await route.fulfill({
        status: 403,
        headers: corsHeaders,
        body: JSON.stringify({ detail: 'Platform administrator access is not granted.' }),
      });
      return;
    }

    if (path === '/api/v1/businesses' && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        body: JSON.stringify([{
          id: 'business-1',
          name: 'Demo Retail',
          currency_code: 'EGP',
          locale: 'ar-EG',
          timezone: 'Africa/Cairo',
          role: 'owner',
        }]),
      });
      return;
    }

    if (path === '/api/v1/businesses/business-1/dashboard') {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          period: { start_date: null, end_date: null, timezone: 'Africa/Cairo' },
          invoiced_sales: [],
          collected_payments: [],
          expenses: [],
          outstanding_balances: [],
        }),
      });
      return;
    }

    if (path === '/api/v1/businesses/business-1/payments') paymentRequests.push(path);
    if (path === '/api/v1/businesses/business-1/customers'
      || path === '/api/v1/businesses/business-1/products'
      || path === '/api/v1/businesses/business-1/invoices'
      || path === '/api/v1/businesses/business-1/payments'
      || path === '/api/v1/businesses/business-1/expenses') {
      await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify([]) });
      return;
    }

    if (path === '/api/v1/businesses/business-1/assistant/chat' && request.method() === 'POST') {
      const body = request.postDataJSON() as { message?: string };
      chatAttempts += 1;
      chatRequests.push({
        businessId: path.split('/')[4],
        message: body.message ?? '',
        authorization: request.headers()['authorization'],
      });

      // Keep the loading state observable, then exercise the retry path once.
      await new Promise(resolve => setTimeout(resolve, 350));
      if (chatAttempts === 1) {
        await route.fulfill({
          status: 503,
          headers: corsHeaders,
          body: JSON.stringify({ detail: 'Temporary assistant failure.' }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          answer: 'Your workspace has no recorded sales in this sample period.',
          sources: [],
          mode: 'local-fallback',
        }),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      headers: corsHeaders,
      body: JSON.stringify({ detail: 'Unexpected mocked API request: ' + request.method() + ' ' + path }),
    });
  });

  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /مرحبًا بعودتك|Welcome back/ })).toBeVisible({ timeout: 20_000 });
  await page.getByLabel(/البريد الإلكتروني|Email address/).fill('owner@example.test');
  await page.getByLabel(/كلمة المرور|Password/).fill('mock-password-123');
  await page.getByRole('button', { name: /تسجيل الدخول|Sign in/ }).click();

  await expect(page.locator('#workspace-current-name')).toHaveText('Demo Retail', { timeout: 20_000 });
  await expect(page.locator('.quick-grid > aba-quick-access-card')).toHaveCount(5);

  const assertNoHorizontalOverflow = async (label: string) => {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow, label).toBe(false);
  };
  for (const width of [360, 390, 412, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await assertNoHorizontalOverflow(`Arabic RTL layout must fit at ${width}px`);
  }

  await page.setViewportSize({ width: 360, height: 800 });
  const moreTrigger = page.getByRole('button', { name: /المزيد من الأقسام|More sections/ });
  await moreTrigger.click();
  await page.locator('#mobile-more-menu').getByRole('button', { name: /دليل التطبيق والإصدارات|App guide & versions/ }).click();
  await expect(page.locator('#mobile-more-menu')).toHaveCount(0);
  await expect(moreTrigger).toHaveClass(/active/);
  await expect(moreTrigger).toBeFocused();
  await expect(page.getByRole('heading', { name: /دليل التطبيق والإصدارات|App guide & versions/ })).toBeVisible();

  await moreTrigger.click();
  const guideMenuItem = page.locator('#mobile-more-menu').getByRole('button', { name: /دليل التطبيق والإصدارات|App guide & versions/ });
  await expect(guideMenuItem).toHaveClass(/active/);
  await expect(guideMenuItem).toHaveAttribute('aria-current', 'page');
  const languageAction = page.locator('#mobile-more-menu .mobile-menu-action').first();
  await expect(languageAction).toContainText('English');
  await languageAction.click();
  await expect(page.locator('.shell')).toHaveAttribute('dir', 'ltr');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  for (const width of [360, 390, 412, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await assertNoHorizontalOverflow(`English LTR layout must fit at ${width}px`);
  }

  await page.setViewportSize({ width: 360, height: 800 });
  await page.locator('#mobile-more-menu .mobile-menu-action').first().click();
  await expect(page.locator('.shell')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.setViewportSize({ width: 360, height: 800 });
  await moreTrigger.click();
  await page.locator('#mobile-more-menu').getByRole('button', { name: /المساعد الذكي|AI assistant/ }).click();
  await expect(page.locator('#mobile-more-menu')).toHaveCount(0);
  await expect(moreTrigger).toHaveClass(/active/);

  await expect(page.locator('.shell')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByText(/ابدأ بسؤال سريع عن نشاطك|Start with a quick business question/)).toBeVisible();

  const composer = page.getByRole('textbox', { name: /سؤالك للمساعد الذكي|Your question for the AI assistant/ });
  const sendButton = page.getByRole('button', { name: /إرسال|Send/ });
  await composer.fill('What happened this month?');
  await sendButton.click();

  await expect(page.getByText(/المساعد الذكي يجهّز الإجابة|The AI assistant is preparing an answer/)).toBeVisible();
  await expect(page.getByText('Temporary assistant failure.')).toBeVisible();
  const retryButton = page.getByRole('button', { name: /إعادة المحاولة|Retry/ });
  await expect(retryButton).toBeEnabled();
  await retryButton.click();

  await expect(page.getByText(/المساعد الذكي يجهّز الإجابة|The AI assistant is preparing an answer/)).toBeVisible();
  await expect(page.getByText('Your workspace has no recorded sales in this sample period.')).toBeVisible();
  expect(paymentRequests).toEqual(['/api/v1/businesses/business-1/payments']);
  expect(chatAttempts).toBe(2);
  expect(chatRequests).toEqual([
    { businessId: 'business-1', message: 'What happened this month?', authorization: 'Bearer ' + idToken },
    { businessId: 'business-1', message: 'What happened this month?', authorization: 'Bearer ' + idToken },
  ]);

  // Focusing the composer hides the fixed mobile dock. Simulate the Android
  // visual viewport inset separately because Playwright resizing changes both viewports.
  await composer.fill('Keep the send control visible.');
  await composer.focus();
  await page.setViewportSize({ width: 360, height: 420 });
  await page.evaluate(() => {
    const testWindow = window as Window & { __abaTestKeyboardInset?: number };
    testWindow.__abaTestKeyboardInset = 280;
    window.visualViewport?.dispatchEvent(new Event('resize'));
  });
  await expect(page.locator('.shell')).toHaveClass(/keyboard-open/);
  await expect(sendButton).toBeVisible();
  const viewportLayout = await page.evaluate(() => {
    const send = document.querySelector('.chat-form button');
    const dock = document.querySelector('.sidebar');
    if (!send || !dock) return null;
    const rect = send.getBoundingClientRect();
    return {
      sendBottom: rect.bottom,
      viewportHeight: window.innerHeight,
      dockPointerEvents: getComputedStyle(dock).pointerEvents,
      dockTransform: getComputedStyle(dock).transform,
      keyboardInset: getComputedStyle(document.documentElement).getPropertyValue('--aba-keyboard-inset').trim(),
    };
  });
  expect(viewportLayout).not.toBeNull();
  expect(viewportLayout!.sendBottom).toBeLessThanOrEqual(viewportLayout!.viewportHeight + 1);
  expect(viewportLayout!.dockPointerEvents).toBe('none');
  expect(viewportLayout!.keyboardInset).toBe('280px');
  expect(uncaughtErrors).toEqual([]);
});


test('STAFF mobile navigation hides owner-only modules and does not request payment records', async ({ page }) => {
  const apiBaseUrl = 'https://mock-api.test';
  const projectId = 'mock-project';
  const staffUid = 'workspace-staff-uid';
  const idToken = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJhdWQiOiJtb2NrLXByb2plY3QiLCJpc3MiOiJodHRwczovL3NlY3VyZXRva2VuLmdvb2dsZS5jb20vbW9jay1wcm9qZWN0Iiwic3ViIjoid29ya3NwYWNlLXN0YWZmLXVpZCIsInVpZCI6IndvcmtzcGFjZS1zdGFmZi11aWQiLCJleHAiOjQ5MDAwMDAwMDB9.signature';
  const paymentRequests: string[] = [];
  const unexpectedRequests: string[] = [];

  await page.addInitScript(() => window.localStorage.setItem('aba-language', 'en'));
  await page.route('**/*', async route => {
    const hostname = new URL(route.request().url()).hostname;
    const allowedHosts = new Set([
      '127.0.0.1', 'localhost', 'mock-api.test',
      'identitytoolkit.googleapis.com', 'securetoken.googleapis.com',
    ]);
    if (allowedHosts.has(hostname)) await route.fallback();
    else await route.abort();
  });
  await page.route('**/runtime-config.json', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        apiBaseUrl,
        firebase: { apiKey: 'test-api-key', authDomain: projectId + '.firebaseapp.com', projectId, appId: '1:123:web:mock-app' },
      }),
    });
  });

  const firebaseHeaders = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': '*',
    'content-type': 'application/json',
  };
  await page.route('https://identitytoolkit.googleapis.com/**', async route => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: firebaseHeaders });
      return;
    }
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/accounts:signInWithPassword')) {
      await route.fulfill({
        status: 200,
        headers: firebaseHeaders,
        body: JSON.stringify({
          kind: 'identitytoolkit#VerifyPasswordResponse',
          localId: staffUid,
          email: 'staff@example.test',
          displayName: 'Workspace Staff',
          idToken,
          refreshToken: 'mock-refresh-token',
          expiresIn: '3600',
          registered: true,
        }),
      });
      return;
    }
    if (path.endsWith('/accounts:lookup')) {
      await route.fulfill({
        status: 200,
        headers: firebaseHeaders,
        body: JSON.stringify({
          users: [{
            localId: staffUid,
            email: 'staff@example.test',
            emailVerified: true,
            displayName: 'Workspace Staff',
            lastLoginAt: '1793059200000',
            createdAt: '1790812800000',
            providerUserInfo: [{ providerId: 'password', federatedId: 'staff@example.test', email: 'staff@example.test', rawId: 'staff@example.test' }],
          }],
        }),
      });
      return;
    }
    await route.fulfill({ status: 200, headers: firebaseHeaders, body: JSON.stringify({ users: [] }) });
  });
  await page.route('https://securetoken.googleapis.com/**', async route => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: firebaseHeaders });
      return;
    }
    await route.fulfill({
      status: 200,
      headers: firebaseHeaders,
      body: JSON.stringify({
        access_token: idToken, id_token: idToken, expires_in: '3600',
        token_type: 'Bearer', refresh_token: 'mock-refresh-token',
        user_id: staffUid, project_id: projectId,
      }),
    });
  });

  const corsHeaders = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS',
    'access-control-allow-headers': '*',
    'access-control-max-age': '600',
    'content-type': 'application/json',
  };
  await page.route(apiBaseUrl + '/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    if (path === '/version') {
      await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify({ version: '1.3.9', commit: 'e2e-test', environment: 'test' }) });
      return;
    }
    if (path === '/api/v1/platform-admin/access') {
      await route.fulfill({ status: 403, headers: corsHeaders, body: JSON.stringify({ detail: 'Platform administrator access is not granted.' }) });
      return;
    }
    if (path === '/api/v1/businesses' && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        body: JSON.stringify([{
          id: 'staff-business-1', name: 'Staff Workspace', currency_code: 'EGP',
          locale: 'en-US', timezone: 'Africa/Cairo', role: 'staff',
        }]),
      });
      return;
    }
    if (path === '/api/v1/businesses/staff-business-1/dashboard') {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          period: { start_date: null, end_date: null, timezone: 'Africa/Cairo' },
          invoiced_sales: [], collected_payments: [], expenses: [], outstanding_balances: [],
        }),
      });
      return;
    }
    if (path === '/api/v1/businesses/staff-business-1/payments') {
      paymentRequests.push(path);
      await route.fulfill({ status: 403, headers: corsHeaders, body: JSON.stringify({ detail: 'Owner-only data.' }) });
      return;
    }
    if ([
      '/api/v1/businesses/staff-business-1/customers',
      '/api/v1/businesses/staff-business-1/products',
      '/api/v1/businesses/staff-business-1/invoices',
      '/api/v1/businesses/staff-business-1/expenses',
    ].includes(path)) {
      await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify([]) });
      return;
    }
    unexpectedRequests.push(request.method() + ' ' + path);
    await route.fulfill({ status: 404, headers: corsHeaders, body: JSON.stringify({ detail: 'Unexpected mocked API request.' }) });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Welcome back|مرحبًا بعودتك/ })).toBeVisible({ timeout: 20_000 });
  await page.getByLabel(/Email|البريد الإلكتروني/).fill('staff@example.test');
  await page.getByLabel(/Password|كلمة المرور/).fill('mock-password-123');
  await page.getByRole('button', { name: /Sign in|تسجيل الدخول/ }).click();
  await expect(page.locator('#workspace-current-name')).toHaveText('Staff Workspace', { timeout: 20_000 });

  const moreTrigger = page.getByRole('button', { name: /More sections|المزيد من الأقسام/ });
  await moreTrigger.click();
  const menu = page.locator('#mobile-more-menu');
  for (const restricted of [
    /Payments & collections/, /Employees & payroll/, /Tax summary/,
    /Activity log/, /Data integrity/, /Operational health/,
  ]) {
    await expect(menu.getByRole('button', { name: restricted })).toHaveCount(0);
  }
  for (const available of [
    /Suppliers/, /Purchasing/, /Recurring invoices/, /Notifications/, /App guide & versions/,
  ]) {
    await expect(menu.getByRole('button', { name: available })).toBeVisible();
  }
  await menu.getByRole('button', { name: /App guide & versions/ }).click();
  await expect(menu).toHaveCount(0);
  await expect(moreTrigger).toHaveClass(/active/);
  await expect(moreTrigger).toBeFocused();
  expect(paymentRequests).toEqual([]);
  expect(unexpectedRequests).toEqual([]);
});
