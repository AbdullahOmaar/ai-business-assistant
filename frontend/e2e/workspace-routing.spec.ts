import { expect, test, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

const apiBaseUrl = 'https://mock-api.test';
const projectId = 'mock-project';
const uid = 'workspace-owner-uid';
const idToken = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJhdWQiOiJtb2NrLXByb2plY3QiLCJpc3MiOiJodHRwczovL3NlY3VyZXRva2VuLmdvb2dsZS5jb20vbW9jay1wcm9qZWN0Iiwic3ViIjoid29ya3NwYWNlLW93bmVyLXVpZCIsInVpZCI6IndvcmtzcGFjZS1vd25lci11aWQiLCJleHAiOjQ5MDAwMDAwMDB9.signature';

async function signInAt(page: Page, initialPath: string, role: 'owner' | 'staff' = 'owner'): Promise<string[]> {
  const errors: string[] = [];
  const email = role === 'owner' ? 'owner@example.test' : 'staff@example.test';
  const firebaseHeaders = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': '*',
    'access-control-max-age': '600',
    'content-type': 'application/json',
  };
  const corsHeaders = { ...firebaseHeaders, 'access-control-allow-methods': 'GET,POST,OPTIONS' };

  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => window.localStorage.setItem('aba-language', 'en'));
  await page.route('**/*', async route => {
    const hostname = new URL(route.request().url()).hostname;
    if (['127.0.0.1', 'localhost', 'mock-api.test', 'identitytoolkit.googleapis.com', 'securetoken.googleapis.com'].includes(hostname)) {
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
        firebase: { apiKey: 'test-api-key', authDomain: projectId + '.firebaseapp.com', projectId, appId: '1:123:web:mock-app' },
      }),
    });
  });
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
          kind: 'identitytoolkit#VerifyPasswordResponse', localId: uid, email,
          displayName: role === 'owner' ? 'Workspace Owner' : 'Workspace Staff',
          idToken, refreshToken: 'mock-refresh-token', expiresIn: '3600', registered: true,
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
            localId: uid, email, emailVerified: true,
            displayName: role === 'owner' ? 'Workspace Owner' : 'Workspace Staff',
            lastLoginAt: '1793059200000', createdAt: '1790812800000',
            providerUserInfo: [{ providerId: 'password', federatedId: email, email, rawId: email }],
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
        token_type: 'Bearer', refresh_token: 'mock-refresh-token', user_id: uid, project_id: projectId,
      }),
    });
  });
  await page.route(apiBaseUrl + '/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    if (path === '/version' && request.method() === 'GET') {
      await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify({ version: 'routing-e2e', commit: 'mock', environment: 'test' }) });
      return;
    }
    if (path === '/api/v1/platform-admin/access' && request.method() === 'GET') {
      await route.fulfill({ status: 403, headers: corsHeaders, body: JSON.stringify({ detail: 'Platform administrator access is not granted.' }) });
      return;
    }
    if (path === '/api/v1/businesses' && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        body: JSON.stringify([{ id: 'business-a', name: 'Route Demo', currency_code: 'EGP', locale: 'en', timezone: 'Africa/Cairo', role }]),
      });
      return;
    }
    if (path === '/api/v1/businesses/business-a/dashboard' && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          period: { start_date: '2026-10-15', end_date: '2026-11-14', timezone: 'Africa/Cairo' },
          invoiced_sales: [], collected_payments: [], expenses: [], outstanding_balances: [],
        }),
      });
      return;
    }
    if (request.method() === 'GET') {
      await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify([]) });
      return;
    }
    await route.fulfill({ status: 404, headers: corsHeaders, body: JSON.stringify({ detail: 'Unexpected routing test request.' }) });
  });

  await page.goto(initialPath);
  await expect(page.getByRole('heading', { name: /Welcome back/ })).toBeVisible({ timeout: 20_000 });
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill('mock-password-123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('#workspace-current-name')).toHaveText('Route Demo', { timeout: 20_000 });
  return errors;
}

test('applies an initial workspace deep link after authentication and business resolution', async ({ page }) => {
  const errors = await signInAt(page, '/workspace/customers');
  await expect(page).toHaveURL(/\/workspace\/customers$/);
  await expect(page.locator('.customer-directory')).toBeVisible();
  expect(errors).toEqual([]);
});

test('browser Back and Forward restore the matching workspace destination', async ({ page }) => {
  const errors = await signInAt(page, '/workspace');
  await expect(page.locator('.dashboard-period')).toBeVisible();
  await page.locator('button.nav-item').filter({ hasText: 'Customers' }).click();
  await expect(page).toHaveURL(/\/workspace\/customers$/);
  await expect(page.locator('.customer-directory')).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/workspace$/);
  await expect(page.locator('.dashboard-period')).toBeVisible();

  await page.goForward();
  await expect(page).toHaveURL(/\/workspace\/customers$/);
  await expect(page.locator('.customer-directory')).toBeVisible();
  expect(errors).toEqual([]);
});

test('STAFF direct access to an OWNER-only workspace route falls back to Overview', async ({ page }) => {
  const errors = await signInAt(page, '/workspace/payments', 'staff');
  await expect(page).toHaveURL(/\/workspace$/);
  await expect(page.locator('.dashboard-period')).toBeVisible();
  expect(errors).toEqual([]);
});


test('desktop navigation remains scroll-reachable at a 993px viewport height', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 993 });
  const errors = await signInAt(page, '/workspace');
  const navigation = page.locator('.sidebar-nav-scroll');
  await expect(navigation).toBeVisible();

  const dimensions = await navigation.evaluate(element => ({
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
    overflowY: getComputedStyle(element).overflowY,
  }));
  expect(dimensions.overflowY).toBe('auto');
  expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.clientHeight);

  await navigation.evaluate(element => { element.scrollTop = element.scrollHeight; });
  const finalDestination = navigation.getByRole('button', { name: 'App guide & versions' });
  await expect(finalDestination).toBeInViewport();
  await finalDestination.click();
  await expect(page).toHaveURL(/\\/workspace\\/release-guide$/);
  await expect(finalDestination).toHaveAttribute('aria-current', 'page');
  expect(errors).toEqual([]);
});
