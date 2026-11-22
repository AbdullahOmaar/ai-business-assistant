import { expect, test, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

const apiBaseUrl = 'https://mock-api.test';
const projectId = 'mock-project';
const ownerUid = 'workspace-owner-uid';
const idToken = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJhdWQiOiJtb2NrLXByb2plY3QiLCJpc3MiOiJodHRwczovL3NlY3VyZXRva2VuLmdvb2dsZS5jb20vbW9jay1wcm9qZWN0Iiwic3ViIjoid29ya3NwYWNlLW93bmVyLXVpZCIsInVpZCI6IndvcmtzcGFjZS1vd25lci11aWQiLCJleHAiOjQ5MDAwMDAwMDB9.signature';

type MovementFixture = {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  unit: string;
  movementType: 'opening' | 'receipt' | 'sale' | 'return' | 'adjustment';
  referenceType: string;
  quantityDelta: string;
  reason: string;
  createdAt: string;
};

type MovementRequest = { productId: string; movementType: string; referenceType: string; limit: number; offset: number };

type LedgerOptions = {
  language?: 'ar' | 'en';
  movements?: MovementFixture[];
  failFirstMovements?: boolean;
  gateFirstMovements?: boolean;
  includeSecondBusiness?: boolean;
  secondBusinessMovements?: MovementFixture[];
  viewport?: { width: number; height: number };
};

const defaultMovements: MovementFixture[] = [
  {
    id: 'mv-1', productId: 'product-a', productName: 'Widget A', sku: 'W-1', unit: 'piece',
    movementType: 'receipt', referenceType: 'purchase_order', quantityDelta: '+10.000',
    reason: 'PO receipt', createdAt: '2026-11-10T08:00:00Z',
  },
  {
    id: 'mv-2', productId: 'product-a', productName: 'Widget A', sku: 'W-1', unit: 'piece',
    movementType: 'sale', referenceType: 'invoice', quantityDelta: '-2.500',
    reason: 'Invoice sale', createdAt: '2026-11-11T09:00:00Z',
  },
  {
    id: 'mv-3', productId: 'product-b', productName: 'Widget B', sku: 'W-2', unit: 'kg',
    movementType: 'adjustment', referenceType: 'stock_count', quantityDelta: '-0.500',
    reason: 'Stock count', createdAt: '2026-11-12T10:00:00Z',
  },
];

function manyMovements(count: number): MovementFixture[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `mv-${String(index).padStart(2, '0')}`,
    productId: 'product-a', productName: 'Widget A', sku: 'W-1', unit: 'piece',
    movementType: 'receipt' as const, referenceType: 'purchase_order',
    quantityDelta: '+1.000', reason: `Receipt ${index + 1}`,
    createdAt: `2026-11-${String((index % 28) + 1).padStart(2, '0')}T08:00:00Z`,
  }));
}

const products = [
  { id: 'product-a', name: 'Widget A', sku: 'W-1', unit: 'piece', is_active: true, is_stock_tracked: true, stock_quantity: '7.500', unit_price: '100.00' },
  { id: 'product-b', name: 'Widget B', sku: 'W-2', unit: 'kg', is_active: true, is_stock_tracked: true, stock_quantity: '3.000', unit_price: '50.00' },
];

async function setupLedger(page: Page, options: LedgerOptions = {}) {
  const language = options.language ?? 'ar';
  const movements = options.movements ?? defaultMovements;
  const secondMovements = options.secondBusinessMovements ?? [];
  const movementRequests: MovementRequest[] = [];
  const uncaughtErrors: string[] = [];
  let movementsCalls = 0;
  let releaseFirstMovements: (() => void) | null = null;
  const firstMovementsGate = new Promise<void>(resolve => { releaseFirstMovements = resolve; });
  const corsHeaders = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': '*',
    'access-control-max-age': '600',
    'content-type': 'application/json',
  };
  const firebaseHeaders = { ...corsHeaders };

  page.on('pageerror', error => uncaughtErrors.push(error.message));
  await page.addInitScript((lang: string) => window.localStorage.setItem('aba-language', lang), language);
  if (options.viewport) await page.setViewportSize(options.viewport);
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
          kind: 'identitytoolkit#VerifyPasswordResponse', localId: ownerUid, email: 'owner@example.test',
          displayName: 'Workspace Owner', idToken, refreshToken: 'mock-refresh-token', expiresIn: '3600', registered: true,
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
            localId: ownerUid, email: 'owner@example.test', emailVerified: true,
            displayName: 'Workspace Owner', lastLoginAt: '1793059200000', createdAt: '1790812800000',
            providerUserInfo: [{ providerId: 'password', federatedId: 'owner@example.test', email: 'owner@example.test', rawId: 'owner@example.test' }],
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
        token_type: 'Bearer', refresh_token: 'mock-refresh-token', user_id: ownerUid, project_id: projectId,
      }),
    });
  });
  await page.route(apiBaseUrl + '/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    if (path === '/version' && request.method() === 'GET') {
      await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify({ version: 'ledger-e2e', commit: 'mock', environment: 'test' }) });
      return;
    }
    if (path === '/api/v1/platform-admin/access' && request.method() === 'GET') {
      await route.fulfill({ status: 403, headers: corsHeaders, body: JSON.stringify({ detail: 'Platform administrator access is not granted.' }) });
      return;
    }
    if (path === '/api/v1/businesses' && request.method() === 'GET') {
      const businesses = [
        { id: 'business-1', name: 'Ledger Demo', currency_code: 'EGP', locale: 'ar-EG', timezone: 'Africa/Cairo', role: 'owner' },
        ...(options.includeSecondBusiness
          ? [{ id: 'business-2', name: 'Second Demo', currency_code: 'EGP', locale: 'ar-EG', timezone: 'Africa/Cairo', role: 'owner' as const }]
          : []),
      ];
      await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify(businesses) });
      return;
    }
    const match = path.match(/^\/api\/v1\/businesses\/([^/]+)(?:\/(.*))?$/);
    const businessId = match?.[1] ?? '';
    const resource = match?.[2] ?? '';
    if (resource === 'dashboard' && request.method() === 'GET') {
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
    if (resource === 'products' && request.method() === 'GET') {
      await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify(businessId === 'business-1' ? products : []) });
      return;
    }
    if (resource === 'inventory/movements' && request.method() === 'GET') {
      movementsCalls += 1;
      const params = url.searchParams;
      movementRequests.push({
        productId: params.get('product_id') ?? '',
        movementType: params.get('movement_type') ?? '',
        referenceType: params.get('reference_type') ?? '',
        limit: Number(params.get('limit') ?? '50'),
        offset: Number(params.get('offset') ?? '0'),
      });
      if (options.failFirstMovements && movementsCalls === 1) {
        await route.fulfill({ status: 500, headers: corsHeaders, body: JSON.stringify({ detail: 'Temporary ledger failure.' }) });
        return;
      }
      if (options.gateFirstMovements && movementsCalls === 1) {
        await firstMovementsGate;
      }
      const dataset = businessId === 'business-2' ? secondMovements : movements;
      const filtered = dataset.filter(item =>
        (!params.get('product_id') || item.productId === params.get('product_id'))
        && (!params.get('movement_type') || item.movementType === params.get('movement_type'))
        && (!params.get('reference_type') || item.referenceType === params.get('reference_type')));
      const limit = Number(params.get('limit') ?? '50');
      const offset = Number(params.get('offset') ?? '0');
      const page = filtered.slice(offset, offset + limit);
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          items: page.map(item => ({
            id: item.id,
            business_id: businessId,
            product: { id: item.productId, name: item.productName, sku: item.sku, unit: item.unit },
            movement_type: item.movementType,
            quantity_delta: item.quantityDelta,
            reason: item.reason,
            reference_type: item.referenceType,
            reference_id: null,
            created_at: item.createdAt,
          })),
          limit,
          offset,
          has_more: offset + limit < filtered.length,
        }),
      });
      return;
    }
    if (request.method() === 'GET') {
      await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify([]) });
      return;
    }
    await route.fulfill({ status: 404, headers: corsHeaders, body: JSON.stringify({ detail: 'Unexpected mocked API request.' }) });
  });

  await page.goto('/workspace/products');
  await expect(page.getByRole('heading', { name: /مرحبًا بعودتك|Welcome back/ })).toBeVisible({ timeout: 20_000 });
  await page.getByLabel(/البريد الإلكتروني|Email address/).fill('owner@example.test');
  await page.getByLabel(/كلمة المرور|Password/).fill('mock-password-123');
  await page.getByRole('button', { name: /تسجيل الدخول|Sign in/ }).click();
  await expect(page.locator('#workspace-current-name')).toHaveText('Ledger Demo', { timeout: 20_000 });
  return { movementRequests, uncaughtErrors, releaseFirstMovements: () => releaseFirstMovements?.() };
}

test('renders movements with signed quantities and localized type and reference labels', async ({ page }) => {
  const harness = await setupLedger(page, { language: 'en' });
  const ledger = page.locator('.inventory-ledger');
  await expect(ledger.getByRole('heading', { name: 'Inventory movement ledger' })).toBeVisible({ timeout: 20_000 });
  const rows = page.locator('.inventory-ledger__desktop-table tbody tr');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('Widget A');
  await expect(rows.nth(0)).toContainText('Receipt');
  await expect(rows.nth(0)).toContainText('+10.000');
  await expect(rows.nth(1)).toContainText('Sale');
  await expect(rows.nth(1)).toContainText('-2.500');
  await expect(rows.nth(1).locator('.inventory-ledger__table-quantity')).toHaveClass(/inventory-ledger__quantity--negative/);
  await expect(rows.nth(2)).toContainText('Widget B');
  await expect(rows.nth(2)).toContainText('Adjustment');
  await expect(rows.nth(2)).toContainText('Stock count');
  expect(harness.movementRequests[0]).toEqual({ productId: '', movementType: '', referenceType: '', limit: 50, offset: 0 });
  expect(harness.uncaughtErrors).toEqual([]);
});

test('renders the ledger in Arabic with localized labels and Arabic-Indic digits', async ({ page }) => {
  const harness = await setupLedger(page, { language: 'ar' });
  const ledger = page.locator('.inventory-ledger');
  await expect(ledger.getByRole('heading', { name: 'سجل حركة المخزون' })).toBeVisible({ timeout: 20_000 });
  const rows = page.locator('.inventory-ledger__desktop-table tbody tr');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('استلام');
  await expect(rows.nth(1)).toContainText('بيع');
  await expect(rows.nth(2)).toContainText('جرد مخزون');
  await expect(rows.nth(0)).toContainText('١٠');
  expect(harness.uncaughtErrors).toEqual([]);
});

test('product filter re-queries with product_id and shows only that product', async ({ page }) => {
  const harness = await setupLedger(page, { language: 'en' });
  const rows = page.locator('.inventory-ledger__desktop-table tbody tr');
  await expect(rows).toHaveCount(3);
  await page.locator('.inventory-ledger__filters select').nth(0).selectOption('product-b');
  await expect(rows).toHaveCount(1);
  await expect(rows.nth(0)).toContainText('Widget B');
  await expect(rows.nth(0)).toContainText('Stock count');
  const last = harness.movementRequests[harness.movementRequests.length - 1];
  expect(last.productId).toBe('product-b');
  expect(last.limit).toBe(50);
  expect(last.offset).toBe(0);
  expect(harness.uncaughtErrors).toEqual([]);
});

test('movement-type and reference-type filters re-query with the right params', async ({ page }) => {
  const harness = await setupLedger(page, { language: 'en' });
  const rows = page.locator('.inventory-ledger__desktop-table tbody tr');
  await expect(rows).toHaveCount(3);
  await page.locator('.inventory-ledger__filters select').nth(1).selectOption('sale');
  await expect(rows).toHaveCount(1);
  await expect(rows.nth(0)).toContainText('Sale');
  expect(harness.movementRequests[harness.movementRequests.length - 1].movementType).toBe('sale');
  await page.locator('.inventory-ledger__filters select').nth(1).selectOption('');
  await expect(rows).toHaveCount(3);
  await page.locator('.inventory-ledger__filters select').nth(2).selectOption('stock_count');
  await expect(rows).toHaveCount(1);
  await expect(rows.nth(0)).toContainText('Widget B');
  expect(harness.movementRequests[harness.movementRequests.length - 1].referenceType).toBe('stock_count');
  expect(harness.uncaughtErrors).toEqual([]);
});

test('load-more appends the next page and hides when the server says done', async ({ page }) => {
  const harness = await setupLedger(page, { language: 'en', movements: manyMovements(55) });
  const ledger = page.locator('.inventory-ledger');
  await expect(ledger.getByRole('heading', { name: 'Inventory movement ledger' })).toBeVisible({ timeout: 20_000 });
  await expect(ledger).toContainText('Shown: 50');
  const loadMore = ledger.getByRole('button', { name: 'Load more' });
  await expect(loadMore).toBeVisible();
  await loadMore.click();
  await expect(page.locator('.inventory-ledger__desktop-table tbody tr')).toHaveCount(55);
  await expect(loadMore).toHaveCount(0);
  const offsets = harness.movementRequests.map(request => request.offset);
  expect(offsets).toEqual([0, 50]);
  expect(harness.uncaughtErrors).toEqual([]);
});

test('empty state renders when the ledger has no movements', async ({ page }) => {
  const harness = await setupLedger(page, { language: 'en', movements: [] });
  const ledger = page.locator('.inventory-ledger');
  await expect(ledger.getByRole('heading', { name: 'Inventory movement ledger' })).toBeVisible({ timeout: 20_000 });
  await expect(ledger).toContainText('No inventory movements yet');
  await expect(ledger).toContainText('Recorded product movements will appear here.');
  await expect(ledger.locator('.inventory-ledger__desktop-table tbody tr')).toHaveCount(0);
  expect(harness.uncaughtErrors).toEqual([]);
});

test('error state offers retry and a retry reloads the ledger', async ({ page }) => {
  const harness = await setupLedger(page, { language: 'en', failFirstMovements: true });
  const ledger = page.locator('.inventory-ledger');
  await expect(ledger.getByRole('heading', { name: 'Inventory movement ledger' })).toBeVisible({ timeout: 20_000 });
  await expect(ledger).toContainText('Could not load the inventory ledger. Try again.');
  const retry = ledger.getByRole('button', { name: 'Try again' });
  await expect(retry).toBeVisible();
  await retry.click();
  await expect(page.locator('.inventory-ledger__desktop-table tbody tr')).toHaveCount(3);
  expect(harness.movementRequests.length).toBe(2);
  expect(harness.uncaughtErrors).toEqual([]);
});

test('a delayed response from the previous workspace never renders after a workspace switch', async ({ page }) => {
  const harness = await setupLedger(page, {
    language: 'en',
    gateFirstMovements: true,
    includeSecondBusiness: true,
    secondBusinessMovements: [{
      id: 'mv-b1', productId: 'product-b', productName: 'Widget B', sku: 'W-2', unit: 'kg',
      movementType: 'receipt', referenceType: 'purchase_order', quantityDelta: '+4.000',
      reason: 'Second workspace receipt', createdAt: '2026-11-12T10:00:00Z',
    }],
  });
  // The first workspace load is gated (its response cannot land yet). Switch
  // workspaces while it is still in flight, then release it; the shell
  // navigates to Overview and the stale response must never surface under
  // the new workspace.
  await page.locator('.workspace-bar select').selectOption('business-2', { force: true });
  await expect(page.locator('#workspace-current-name')).toHaveText('Second Demo');
  harness.releaseFirstMovements();
  // In-app navigation back to Products: page.goto would reload the document
  // and the shell (which does not persist the selected business) would boot
  // on the first business again, losing the switch.
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Products & inventory' }).click();
  await expect(page.locator('.inventory-ledger')).toBeVisible();
  const rows = page.locator('.inventory-ledger__desktop-table tbody tr');
  await expect(rows).toHaveCount(1, { timeout: 20_000 });
  await expect(rows.nth(0)).toContainText('Widget B');
  await expect(rows.nth(0)).toContainText('+4.000');
  await expect(page.locator('.inventory-ledger')).not.toContainText('Widget A');
  await page.waitForTimeout(1200);
  await expect(rows).toHaveCount(1);
  await expect(page.locator('.inventory-ledger')).not.toContainText('Widget A');
  expect(harness.uncaughtErrors).toEqual([]);
});

test('mobile layout fits at 320px with 44px filter controls', async ({ page }) => {
  const harness = await setupLedger(page, { language: 'en', viewport: { width: 320, height: 844 } });
  const ledger = page.locator('.inventory-ledger');
  await expect(ledger.getByRole('heading', { name: 'Inventory movement ledger' })).toBeVisible({ timeout: 20_000 });
  const cards = page.locator('.inventory-ledger__card');
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(0)).toContainText('Widget A');
  await expect(cards.nth(0)).toContainText('+10.000');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow, 'ledger must not overflow at 320px').toBe(false);
  const selectHeights = await page.locator('.inventory-ledger__filters select').evaluateAll(elements =>
    elements.map(element => element.getBoundingClientRect().height));
  expect(selectHeights.length).toBe(3);
  for (const height of selectHeights) expect(height, 'filter controls keep a 44px target at 320px').toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: 'test-results/402-ledger-320px-en-viewport.png', fullPage: false, animations: 'disabled' });
  expect(harness.uncaughtErrors).toEqual([]);
});
