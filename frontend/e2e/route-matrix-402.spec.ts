import { expect, test, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

const apiBaseUrl = 'https://mock-api.test';
const projectId = 'mock-project';
const ownerUid = 'workspace-owner-uid';
const idToken = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJhdWQiOiJtb2NrLXByb2plY3QiLCJpc3MiOiJodHRwczovL3NlY3VyZXRva2VuLmdvb2dsZS5jb20vbW9jay1wcm9qZWN0Iiwic3ViIjoid29ya3NwYWNlLW93bmVyLXVpZCIsInVpZCI6IndvcmtzcGFjZS1vd25lci11aWQiLCJleHAiOjQ5MDAwMDAwMDB9.signature';

const routeDestinations = [
  { tab: 'overview', titleAr: 'الرئيسية', titleEn: 'Overview' },
  { tab: 'customers', titleAr: 'العملاء', titleEn: 'Customers' },
  { tab: 'products', titleAr: 'المنتجات والمخزون', titleEn: 'Products & inventory' },
  { tab: 'invoices', titleAr: 'المبيعات والفواتير', titleEn: 'Sales & invoices', cardAr: 'الفواتير', cardEn: 'Invoices' },
  { tab: 'payments', titleAr: 'المدفوعات', titleEn: 'Payments', cardAr: 'المدفوعات والتحصيل', cardEn: 'Payments & collections' },
  { tab: 'expenses', titleAr: 'المصروفات', titleEn: 'Expenses' },
  { tab: 'employees', titleAr: 'الموظفون والمرتبات', titleEn: 'Employees & payroll' },
  { tab: 'assistant', titleAr: 'مساعد الأعمال الذكي', titleEn: 'AI business assistant', cardAr: 'المساعد الذكي', cardEn: 'AI assistant' },
  { tab: 'reports', titleAr: 'نتيجة التشغيل الأولية', titleEn: 'Preliminary operating result' },
  { tab: 'taxes', titleAr: 'التقارير الضريبية', titleEn: 'Tax summary', cardAr: 'ملخص الضرائب' },
  { tab: 'audit', titleAr: 'سجل العمليات', titleEn: 'Activity log' },
  { tab: 'integrity', titleAr: 'مراجعة سلامة البيانات', titleEn: 'Data integrity review', cardAr: 'سلامة البيانات', cardEn: 'Data integrity' },
  { tab: 'release-guide', titleAr: 'دليل التطبيق والإصدارات', titleEn: 'App guide & versions' },
  { tab: 'suppliers', titleAr: 'الموردون', titleEn: 'Suppliers' },
  { tab: 'purchases', titleAr: 'المشتريات', titleEn: 'Purchasing' },
  { tab: 'recurring', titleAr: 'الفواتير الدورية', titleEn: 'Recurring invoices' },
  { tab: 'notifications', titleAr: 'الإشعارات', titleEn: 'Notifications' },
  { tab: 'health', titleAr: 'الحالة التشغيلية', titleEn: 'Operational health' },
] as const;

// Widths the pre-existing route sweep (mobile-chat.spec.ts) does not cover:
// 320 / 412 / 700 / 1440. Already covered elsewhere: 195 / 360 / 390 / 430 / 768 / 1280.
const matrixWidths = [320, 412, 700, 1440];

async function signInAt(page: Page, language: 'ar' | 'en') {
  const uncaughtErrors: string[] = [];
  page.on('pageerror', error => uncaughtErrors.push(error.message));
  await page.addInitScript((lang: string) => window.localStorage.setItem('aba-language', lang), language);
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
  const firebaseHeaders = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': '*',
    'access-control-max-age': '600',
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
      await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify({ version: 'matrix-e2e', commit: 'mock', environment: 'test' }) });
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
        body: JSON.stringify([{ id: 'business-1', name: 'Demo Retail', currency_code: 'EGP', locale: 'ar-EG', timezone: 'Africa/Cairo', role: 'owner' }]),
      });
      return;
    }
    if (path === '/api/v1/businesses/business-1/dashboard') {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          period: { start_date: '2026-10-13', end_date: '2026-11-11', timezone: 'Africa/Cairo' },
          invoiced_sales: [{ currency_code: 'EGP', count: 9, total: '548525.00' }],
          collected_payments: [{ currency_code: 'EGP', count: 8, total: '548255.00' }],
          expenses: [{ currency_code: 'EGP', count: 1, total: '5000.00' }],
          outstanding_balances: [{ currency_code: 'EGP', total: '230500.00' }],
        }),
      });
      return;
    }
    if (path === '/api/v1/businesses/business-1/profit-loss' && request.method() === 'GET') {
      await route.fulfill({
        status: 200, headers: corsHeaders,
        body: JSON.stringify({
          period: { start_date: '2026-10-13', end_date: '2026-11-11', timezone: 'Africa/Cairo' },
          revenue_basis: 'issued_invoices', currencies: [],
        }),
      });
      return;
    }
    if (path === '/api/v1/businesses/business-1/reports/tax-summary' && request.method() === 'GET') {
      await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify({ currencies: [], limitations: [] }) });
      return;
    }
    if (path === '/api/v1/businesses/business-1/audit-events' && request.method() === 'GET') {
      await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify({ items: [], total: 0, offset: 0 }) });
      return;
    }
    if (path === '/api/v1/businesses/business-1/inventory/movements' && request.method() === 'GET') {
      await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify({ items: [], limit: 50, offset: 0, has_more: false }) });
      return;
    }
    if (path === '/api/v1/businesses/business-1/sales-returns' && request.method() === 'GET') {
      await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify({ items: [], limit: 100, offset: 0 }) });
      return;
    }
    if (path === '/api/v1/businesses/business-1/credit-notes' && request.method() === 'GET') {
      await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify({ items: [], limit: 100, offset: 0 }) });
      return;
    }
    if (path === '/api/v1/businesses/business-1/reports/data-integrity' && request.method() === 'GET') {
      const emptyFinding = { total: 0, items: [] };
      await route.fulfill({
        status: 200, headers: corsHeaders,
        body: JSON.stringify({
          warning: 'Synthetic browser fixture; no production data.',
          unlinked_issued_invoices: emptyFinding, currency_mismatched_allocations: emptyFinding,
          customer_mismatched_allocations: emptyFinding, offset: 0, limit: 50,
        }),
      });
      return;
    }
    if (path === '/api/v1/businesses/business-1/operations/health' && request.method() === 'GET') {
      await route.fulfill({
        status: 200, headers: corsHeaders,
        body: JSON.stringify({
          status: 'healthy', database_connected: true, migration_table_available: true,
          migration_revision: 'e2e-fixture', ai_configured: false,
          notification_delivery_configured: false, recurring_invoice_worker_configured: false,
          checked_at: '2026-11-11T10:00:00Z',
        }),
      });
      return;
    }
    if (['/customers', '/products', '/invoices', '/payments', '/expenses',
      '/suppliers', '/purchase-orders', '/recurring-invoices', '/notifications', '/employees', '/payroll']
      .some(suffix => path === '/api/v1/businesses/business-1' + suffix) && request.method() === 'GET') {
      await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify([]) });
      return;
    }
    if (path === '/api/v1/businesses/business-1/assistant/chat' && request.method() === 'POST') {
      await route.fulfill({
        status: 200, headers: corsHeaders,
        body: JSON.stringify({ answer: 'Synthetic matrix fixture answer.', sources: [], mode: 'local-fallback' }),
      });
      return;
    }
    await route.fulfill({
      status: 404, headers: corsHeaders,
      body: JSON.stringify({ detail: 'Unexpected mocked API request: ' + request.method() + ' ' + path }),
    });
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: /مرحبًا بعودتك|Welcome back/ })).toBeVisible({ timeout: 20_000 });
  await page.getByLabel(/البريد الإلكتروني|Email address/).fill('owner@example.test');
  await page.getByLabel(/كلمة المرور|Password/).fill('mock-password-123');
  await page.getByRole('button', { name: /تسجيل الدخول|Sign in/ }).click();
  await expect(page.locator('#workspace-current-name')).toHaveText('Demo Retail', { timeout: 20_000 });
  return { uncaughtErrors };
}

async function sweepMatrix(page: Page, language: 'ar' | 'en', uncaughtErrors: string[]) {
  const routeApiFailures: string[] = [];
  const routeNetworkFailures: string[] = [];
  const pendingWorkspaceRequests = new Set<object>();
  const isWorkspaceApiRequest = (url: string) => url.startsWith(apiBaseUrl + '/api/v1/businesses/business-1');
  const routeLoadingMessages = page.locator(
    '.global-loading:visible, aba-state-message.aba-state-message--loading:visible, [role="status"]:visible',
  ).filter({ hasText: /Loading|جارٍ تحميل|جارٍ التحميل/ });
  const routeSkeletons = page.locator('.metric-skeleton:visible');
  page.on('request', request => {
    if (isWorkspaceApiRequest(request.url())) pendingWorkspaceRequests.add(request);
  });
  page.on('requestfinished', request => {
    pendingWorkspaceRequests.delete(request);
  });
  page.on('response', response => {
    if (!isWorkspaceApiRequest(response.url())) return;
    if (!response.ok()) {
      routeApiFailures.push(`${response.status()} ${response.request().method()} ${new URL(response.url()).pathname}`);
    }
  });
  page.on('requestfailed', request => {
    if (!isWorkspaceApiRequest(request.url())) return;
    pendingWorkspaceRequests.delete(request);
    routeNetworkFailures.push(`${request.method()} ${new URL(request.url()).pathname}: ${request.failure()?.errorText ?? 'request failed'}`);
  });

  for (const width of matrixWidths) {
    await page.setViewportSize({ width, height: 844 });
    const direction = language === 'ar' ? 'rtl' : 'ltr';
    await expect(page.locator('.shell')).toHaveAttribute('dir', direction);
    await expect(page.locator('html')).toHaveAttribute('dir', direction);
    await expect(page.locator('body')).toHaveCSS('direction', direction);

    for (const destination of routeDestinations) {
      const expectedTitle = language === 'ar' ? destination.titleAr : destination.titleEn;
      const homeNavLabel = language === 'ar' ? 'الرئيسية' : 'Overview';
      const homeHeading = language === 'ar' ? 'الرئيسية' : 'Overview';
      const cardLabel = language === 'ar' ? ('cardAr' in destination ? destination.cardAr : destination.titleAr)
        : ('cardEn' in destination ? destination.cardEn : destination.titleEn);
      const homeButton = page.locator('.sidebar button.nav-item:visible').filter({ hasText: homeNavLabel });
      await homeButton.focus();
      await expect(homeButton).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.locator('.topbar-heading h1')).toHaveText(homeHeading);
      if (destination.tab !== 'overview') {
        const disclosure = page.locator('.module-directory-disclosure');
        const disclosureSummary = disclosure.locator('summary');
        await disclosureSummary.focus();
        if (await disclosure.evaluate(element => (element as HTMLDetailsElement).open)) {
          await page.keyboard.press('Enter');
          await expect.poll(() => disclosure.evaluate(element => (element as HTMLDetailsElement).open)).toBe(false);
        }
        await page.keyboard.press('Enter');
        await expect.poll(() => disclosure.evaluate(element => (element as HTMLDetailsElement).open)).toBe(true);
        const card = page.locator('.module-directory-grid > aba-quick-access-card')
          .filter({ has: page.locator('.aba-quick-access__copy > strong').getByText(cardLabel, { exact: true }) });
        await expect(card, destination.tab + ' must be listed for the OWNER').toHaveCount(1);
        const destinationButton = card.locator('button');
        await destinationButton.focus();
        await expect(destinationButton).toBeFocused();
        await page.keyboard.press('Enter');
      }
      await expect(page.locator('.topbar-heading h1'), destination.tab + ' localized heading')
        .toHaveText(expectedTitle);
      await expect(routeLoadingMessages, destination.tab + ' loading message').toHaveCount(0, { timeout: 15_000 });
      await expect(routeSkeletons, destination.tab + ' loading skeleton').toHaveCount(0, { timeout: 15_000 });
      await expect.poll(() => pendingWorkspaceRequests.size, { timeout: 15_000 }).toBe(0);
      await expect(page.locator('.main .panel:visible, .main [aria-label="Purchase order workspace"]:visible, .main .aba-state-message--empty:visible, .main .aba-state-message--info:visible, .main .pw__state:visible').first(),
        destination.tab + ' rendered content or empty state').toBeVisible();
      await expect(page.locator('[role="alert"]:visible'), destination.tab + ' rendered error state').toHaveCount(0);
      expect(routeApiFailures, destination.tab + ' API failures').toEqual([]);
      expect(routeNetworkFailures, destination.tab + ' network failures').toEqual([]);
      if (width <= 760) {
        await expect(page.locator('aba-mobile-app-header')).toBeVisible();
      } else {
        await expect(page.locator('.workspace-bar')).toBeVisible();
      }
      if (destination.tab === 'employees' && width <= 760) {
        const labels = language === 'ar'
          ? { nav: 'التنقل داخل إدارة الموظفين والمرتبات', employees: 'الموظفون', prepare: 'تجهيز المرتب', history: 'سجل المرتبات' }
          : { nav: 'Employee and payroll sections', employees: 'Employees', prepare: 'Prepare pay', history: 'Payroll history' };
        const hrNavigation = page.getByRole('navigation', { name: labels.nav });
        await expect(hrNavigation).toBeVisible();
        const tabHeights = await hrNavigation.getByRole('button').evaluateAll(elements =>
          elements.map(element => element.getBoundingClientRect().height));
        expect(tabHeights.length).toBe(3);
        for (const height of tabHeights) expect(height, 'mobile HR tabs retain 44px touch targets').toBeGreaterThanOrEqual(44);
      }
      const layout = await page.evaluate(() => ({
        width: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        mainWidth: document.querySelector('.main')?.getBoundingClientRect().width ?? 0,
      }));
      expect(layout.documentWidth, destination.tab + ' horizontal overflow at ' + width + 'px/' + language)
        .toBeLessThanOrEqual(layout.width);
      expect(layout.mainWidth).toBeGreaterThan(0);
      expect(uncaughtErrors, destination.tab + ' uncaught browser errors').toEqual([]);
      await page.screenshot({
        path: `test-results/402-route-${destination.tab}-${width}px-${language}.png`,
        fullPage: false,
        animations: 'disabled',
      });
    }
  }
}

test('sweeps the 18 workspace destinations at 320/412/700/1440 in RTL', async ({ page }) => {
  test.setTimeout(420_000);
  const { uncaughtErrors } = await signInAt(page, 'ar');
  await sweepMatrix(page, 'ar', uncaughtErrors);
});

test('sweeps the 18 workspace destinations at 320/412/700/1440 in LTR', async ({ page }) => {
  test.setTimeout(420_000);
  const { uncaughtErrors } = await signInAt(page, 'en');
  await sweepMatrix(page, 'en', uncaughtErrors);
});
