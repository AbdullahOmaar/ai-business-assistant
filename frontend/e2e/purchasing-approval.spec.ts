import { expect, test, type Page } from '@playwright/test';

const apiBaseUrl = 'https://mock-api.test';
const projectId = 'mock-project';
const ownerUid = 'workspace-owner-uid';
const idToken = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJhdWQiOiJtb2NrLXByb2plY3QiLCJpc3MiOiJodHRwczovL3NlY3VyZXRva2VuLmdvb2dsZS5jb20vbW9jay1wcm9qZWN0Iiwic3ViIjoid29ya3NwYWNlLW93bmVyLXVpZCIsInVpZCI6IndvcmtzcGFjZS1vd25lci11aWQiLCJleHAiOjQ5MDAwMDAwMDB9.signature';

type ApiRequest = { path: string; method: string; body?: unknown };
type SetupOptions = {
  role?: 'owner' | 'staff';
  includeSecondBusiness?: boolean;
  approvalStatus?: number;
  initialOrderStatus?: 'draft' | 'approved';
};

async function setupWorkspace(page: Page, options: SetupOptions = {}) {
  const role = options.role ?? 'owner';
  const uid = role === 'owner' ? ownerUid : 'workspace-staff-uid';
  const apiRequests: ApiRequest[] = [];
  const uncaughtErrors: string[] = [];
  let orderStatus = options.initialOrderStatus ?? 'draft';

  const businesses = [
    { id: 'business-a', name: 'Demo Retail', currency_code: 'EGP', locale: 'en', timezone: 'Africa/Cairo', role },
    ...(options.includeSecondBusiness
      ? [{ id: 'business-b', name: 'Beta Retail', currency_code: 'EGP', locale: 'en', timezone: 'Africa/Cairo', role: 'owner' as const }]
      : []),
  ];
  const supplier = { id: 'supplier-a', name: 'North Supplies', email: null, phone: null, address: null, is_active: true };
  const product = {
    id: 'product-a', name: 'Catalog Product', unit_price: '100.00',
    is_stock_tracked: true, stock_quantity: '0', sku: 'SKU-A',
  };
  const purchaseOrder = () => ({
    id: 'po-a', supplier_id: 'supplier-a', order_number: 'PO-2026-001',
    status: orderStatus, currency_code: 'EGP', total: '200.00',
    created_at: '2026-11-13T08:00:00+00:00',
    lines: [{
      id: 'po-line-a', product_id: 'product-a', quantity: '2.000',
      unit_cost: '100.00', received_quantity: '0.000', remaining_quantity: '2.000',
    }],
  });
  const dashboard = {
    period: { start_date: '2026-10-14', end_date: '2026-11-13', timezone: 'Africa/Cairo' },
    invoiced_sales: [], collected_payments: [], expenses: [], outstanding_balances: [],
  };
  const corsHeaders = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': '*',
    'access-control-max-age': '600',
    'content-type': 'application/json',
  };
  const firebaseHeaders = { ...corsHeaders };

  page.on('pageerror', error => uncaughtErrors.push(error.message));
  await page.addInitScript(() => window.localStorage.setItem('aba-language', 'en'));
  await page.route('**/*', async route => {
    const hostname = new URL(route.request().url()).hostname;
    const allowedHosts = new Set([
      '127.0.0.1', 'localhost', 'mock-api.test',
      'identitytoolkit.googleapis.com', 'securetoken.googleapis.com',
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
  await page.route('https://identitytoolkit.googleapis.com/**', async route => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: firebaseHeaders });
      return;
    }
    const pathname = new URL(request.url()).pathname;
    if (pathname.endsWith('/accounts:signInWithPassword')) {
      await route.fulfill({
        status: 200, headers: firebaseHeaders,
        body: JSON.stringify({
          kind: 'identitytoolkit#VerifyPasswordResponse', localId: uid,
          email: role === 'owner' ? 'owner@example.test' : 'staff@example.test',
          displayName: role === 'owner' ? 'Workspace Owner' : 'Workspace Staff',
          idToken, refreshToken: 'mock-refresh-token', expiresIn: '3600', registered: true,
        }),
      });
      return;
    }
    if (pathname.endsWith('/accounts:lookup')) {
      await route.fulfill({
        status: 200, headers: firebaseHeaders,
        body: JSON.stringify({
          users: [{
            localId: uid,
            email: role === 'owner' ? 'owner@example.test' : 'staff@example.test',
            emailVerified: true,
            displayName: role === 'owner' ? 'Workspace Owner' : 'Workspace Staff',
            lastLoginAt: '1793059200000', createdAt: '1790812800000',
            providerUserInfo: [{
              providerId: 'password',
              federatedId: role === 'owner' ? 'owner@example.test' : 'staff@example.test',
              email: role === 'owner' ? 'owner@example.test' : 'staff@example.test',
              rawId: role === 'owner' ? 'owner@example.test' : 'staff@example.test',
            }],
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
      status: 200, headers: firebaseHeaders,
      body: JSON.stringify({
        access_token: idToken, id_token: idToken, expires_in: '3600',
        token_type: 'Bearer', refresh_token: 'mock-refresh-token',
        user_id: uid, project_id: projectId,
      }),
    });
  });
  await page.route(apiBaseUrl + '/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    if (method === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    let body: unknown;
    if (method !== 'GET' && method !== 'HEAD') {
      try { body = request.postDataJSON(); } catch { body = undefined; }
    }
    apiRequests.push({ path, method, body });

    if (path === '/version' && method === 'GET') {
      await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify({ version: 'e2e', commit: 'phase-2-purchase-approval', environment: 'test' }) });
      return;
    }
    if (path === '/api/v1/platform-admin/access' && method === 'GET') {
      await route.fulfill({ status: 403, headers: corsHeaders, body: JSON.stringify({ detail: 'Platform administrator access is not granted.' }) });
      return;
    }
    if (path === '/api/v1/businesses' && method === 'GET') {
      await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify(businesses) });
      return;
    }
    const match = path.match(/^\/api\/v1\/businesses\/([^/]+)(?:\/(.*))?$/);
    const businessId = match?.[1] ?? '';
    const resource = match?.[2] ?? '';
    if (resource === 'dashboard' && method === 'GET') {
      await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify(dashboard) });
      return;
    }
    if (resource === 'products' && method === 'GET') {
      await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify(businessId === 'business-a' ? [product] : []) });
      return;
    }
    if (resource === 'suppliers' && method === 'GET') {
      await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify(businessId === 'business-a' ? [supplier] : []) });
      return;
    }
    if (resource === 'purchase-orders' && method === 'GET') {
      await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify(businessId === 'business-a' ? [purchaseOrder()] : []) });
      return;
    }
    const approval = resource.match(/^purchase-orders\/([^/]+)\/approve$/);
    if (approval && method === 'POST') {
      if (businessId !== 'business-a' || approval[1] !== 'po-a') {
        await route.fulfill({ status: 404, headers: corsHeaders, body: JSON.stringify({ detail: 'Purchase order not found.' }) });
        return;
      }
      if (options.approvalStatus) {
        await route.fulfill({ status: options.approvalStatus, headers: corsHeaders, body: JSON.stringify({ detail: 'Approval is restricted to workspace owners.' }) });
        return;
      }
      if (role !== 'owner' || orderStatus !== 'draft') {
        await route.fulfill({ status: 403, headers: corsHeaders, body: JSON.stringify({ detail: 'Approval is restricted to workspace owners.' }) });
        return;
      }
      orderStatus = 'approved';
      await route.fulfill({
        status: 200, headers: corsHeaders,
        body: JSON.stringify({
          id: 'po-a', business_id: businessId, supplier_id: 'supplier-a',
          order_number: 'PO-2026-001', status: 'approved', currency_code: 'EGP',
          total: '200.00', created_at: '2026-11-13T08:00:00+00:00',
        }),
      });
      return;
    }
    if (method === 'GET') {
      await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify([]) });
      return;
    }
    await route.fulfill({ status: 404, headers: corsHeaders, body: JSON.stringify({ detail: 'Unexpected mocked API request: ' + method + ' ' + path }) });
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Welcome back/ })).toBeVisible({ timeout: 20_000 });
  await page.getByLabel('Email address').fill(role === 'owner' ? 'owner@example.test' : 'staff@example.test');
  await page.getByLabel('Password').fill('mock-password-123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('#workspace-current-name')).toHaveText('Demo Retail', { timeout: 20_000 });
  return { apiRequests, uncaughtErrors, getOrderStatus: () => orderStatus };
}

async function openPurchases(page: Page, expectPurchaseOrder = true): Promise<void> {
  const directory = page.locator('details.module-directory-disclosure');
  const isOpen = await directory.evaluate(element => (element as HTMLDetailsElement).open);
  if (!isOpen) await directory.locator('summary').click();
  const purchasingCard = directory.locator('aba-quick-access-card').filter({ hasText: 'Purchasing' });
  await expect(purchasingCard).toHaveCount(1);
  await expect(purchasingCard).toBeVisible();
  await purchasingCard.getByRole('button').click();
  if (expectPurchaseOrder) {
    await expect(page.getByText('PO-2026-001')).toBeVisible({ timeout: 20_000 });
  } else {
    await expect(page.getByText('PO-2026-001')).toHaveCount(0);
  }
}

test('OWNER approves a draft purchase order from the mobile layout without recording receipt', async ({ page }) => {
  const harness = await setupWorkspace(page);
  await openPurchases(page);
  await page.setViewportSize({ width: 390, height: 844 });

  await page.getByRole('button', { name: 'Approve: PO-2026-001', exact: true }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('North Supplies');
  await expect(dialog).toContainText('Catalog Product × 2.000');
  await expect(dialog).toContainText('Unit cost: 100.00 EGP');
  await expect(dialog).toContainText('200.00 EGP');
  await expect(dialog).toContainText('does not create supplier bills, payables or payments');

  await dialog.getByRole('button', { name: 'Approve order', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Approve: PO-2026-001', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Receive remaining: PO-2026-001', exact: true })).toBeVisible();

  expect(harness.getOrderStatus()).toBe('approved');
  expect(harness.apiRequests.filter(item => item.method === 'POST' && item.path === '/api/v1/businesses/business-a/purchase-orders/po-a/approve')).toHaveLength(1);
  expect(harness.apiRequests.filter(item => item.method === 'POST' && item.path.includes('/receive'))).toHaveLength(0);
  expect(harness.uncaughtErrors).toEqual([]);
});

test('approval failure stays in the confirmation dialog and does not show success', async ({ page }) => {
  const harness = await setupWorkspace(page, { approvalStatus: 403 });
  await openPurchases(page);
  await page.getByRole('button', { name: 'Approve: PO-2026-001', exact: true }).click();

  const dialog = page.getByRole('alertdialog');
  await dialog.getByRole('button', { name: 'Approve order', exact: true }).click();
  await expect(dialog).toContainText('Approval is restricted to workspace owners.');
  await expect(dialog.getByRole('button', { name: 'Approve order', exact: true })).toBeDisabled();
  await expect(dialog).toBeVisible();
  expect(harness.getOrderStatus()).toBe('draft');
  expect(harness.apiRequests.filter(item => item.method === 'POST' && item.path.endsWith('/approve'))).toHaveLength(1);
  expect(harness.uncaughtErrors).toEqual([]);
});

test('STAFF cannot see purchase-order approval action for a draft order', async ({ page }) => {
  const harness = await setupWorkspace(page, { role: 'staff', initialOrderStatus: 'draft' });
  await openPurchases(page);
  await expect(page.getByRole('button', { name: /^Approve:/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Receive remaining:/ })).toHaveCount(0);
  expect(harness.apiRequests.some(item => item.method === 'POST' && item.path.endsWith('/approve'))).toBe(false);
  expect(harness.uncaughtErrors).toEqual([]);
});

test('STAFF cannot see purchase-order receiving action for an approved order', async ({ page }) => {
  const harness = await setupWorkspace(page, { role: 'staff', initialOrderStatus: 'approved' });
  await openPurchases(page);
  await expect(page.getByRole('button', { name: /^Approve:/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Receive remaining:/ })).toHaveCount(0);
  expect(harness.apiRequests.some(item => item.method === 'POST' && item.path.endsWith('/approve'))).toBe(false);
  expect(harness.apiRequests.some(item => item.method === 'POST' && item.path.includes('/receive'))).toBe(false);
  expect(harness.uncaughtErrors).toEqual([]);
});

test('switching workspaces clears a pending purchase approval confirmation', async ({ page }) => {
  const harness = await setupWorkspace(page, { includeSecondBusiness: true });
  await openPurchases(page);
  await page.getByRole('button', { name: 'Approve: PO-2026-001', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();

  await page.locator('.workspace-bar select').selectOption('business-b', { force: true });
  await expect(page.locator('#workspace-current-name')).toHaveText('Beta Retail');
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await openPurchases(page, false);
  expect(harness.apiRequests.filter(item => item.method === 'POST' && item.path.endsWith('/approve'))).toHaveLength(0);
  expect(harness.uncaughtErrors).toEqual([]);
});
