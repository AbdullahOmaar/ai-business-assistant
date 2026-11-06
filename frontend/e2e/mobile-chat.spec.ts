import { expect, test } from '@playwright/test';

const apiBaseUrl = 'https://mock-api.test';
const projectId = 'mock-project';
const ownerUid = 'workspace-owner-uid';
const idToken = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJhdWQiOiJtb2NrLXByb2plY3QiLCJpc3MiOiJodHRwczovL3NlY3VyZXRva2VuLmdvb2dsZS5jb20vbW9jay1wcm9qZWN0Iiwic3ViIjoid29ya3NwYWNlLW93bmVyLXVpZCIsInVpZCI6IndvcmtzcGFjZS1vd25lci11aWQiLCJleHAiOjQ5MDAwMDAwMDB9.signature';

test('mobile chat exposes empty, loading, retry and response states and keeps its composer above the dock', async ({ page }) => {
  const uncaughtErrors: string[] = [];
  const chatRequests: Array<{ businessId: string; message: string; authorization?: string }> = [];
  let chatAttempts = 0;
  page.on('pageerror', error => uncaughtErrors.push(error.message));
  await page.addInitScript(() => window.localStorage.setItem('aba-language', 'ar'));

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
  const moreTrigger = page.getByRole('button', { name: /المزيد من الأقسام|More sections/ });
  await moreTrigger.click();
  await page.getByRole('button', { name: /المساعد الذكي|AI assistant/ }).click();

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
  expect(chatAttempts).toBe(2);
  expect(chatRequests).toEqual([
    { businessId: 'business-1', message: 'What happened this month?', authorization: 'Bearer ' + idToken },
    { businessId: 'business-1', message: 'What happened this month?', authorization: 'Bearer ' + idToken },
  ]);

  // Focusing the composer hides the fixed mobile dock; shrinking the viewport
  // simulates the reduced visible area while the Android keyboard is open.
  await composer.fill('Keep the send control visible.');
  await composer.focus();
  await page.setViewportSize({ width: 360, height: 420 });
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
    };
  });
  expect(viewportLayout).not.toBeNull();
  expect(viewportLayout!.sendBottom).toBeLessThanOrEqual(viewportLayout!.viewportHeight + 1);
  expect(viewportLayout!.dockPointerEvents).toBe('none');
  expect(uncaughtErrors).toEqual([]);
});
