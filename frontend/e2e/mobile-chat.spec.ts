import { expect, test } from '@playwright/test';

const apiBaseUrl = 'https://mock-api.test';
const projectId = 'mock-project';
const ownerUid = 'workspace-owner-uid';
const idToken = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJhdWQiOiJtb2NrLXByb2plY3QiLCJpc3MiOiJodHRwczovL3NlY3VyZXRva2VuLmdvb2dsZS5jb20vbW9jay1wcm9qZWN0Iiwic3ViIjoid29ya3NwYWNlLW93bmVyLXVpZCIsInVpZCI6IndvcmtzcGFjZS1vd25lci11aWQiLCJleHAiOjQ5MDAwMDAwMDB9.signature';

test('mobile Home layout and chat remain usable across viewport and keyboard changes', async ({ page }) => {
  test.setTimeout(300_000);
  const uncaughtErrors: string[] = [];
  const chatRequests: Array<{ businessId: string; message: string; authorization?: string }> = [];
  const paymentRequests: string[] = [];
  let chatAttempts = 0;
  const longAssistantAnswer = [
    'ملخص النشاط للفترة المحددة: لا توجد مبيعات مسجلة في العينة الحالية، لذلك لا يمكن استنتاج نمو أو تراجع في الإيرادات من هذه البيانات وحدها.',
    'التحصيل: راجع سجل المدفوعات والفواتير المرتبطة قبل اعتبار أي مبلغ محصلًا. الفاتورة الصادرة ليست دليلًا على استلام النقد، ويجب إبقاء الرصيد المستحق منفصلًا عن التحصيل.',
    'المصروفات: اعتمد فقط على المصروفات المسجلة في مساحة العمل والفترة المختارة. لا تخلط بين المصروفات النقدية والالتزامات أو المشتريات التي لم تُسجل كمصروف.',
    'العملاء: لا توجد في هذه الاستجابة عينة كافية لترتيب العملاء أو تقييم سلوكهم. استخدم تفاصيل السجلات المصرح بها بدلًا من افتراض بيانات غير موجودة.',
    'المخزون: لا يمكن تأكيد الاحتياج لإعادة التخزين من ملخص المبيعات الفارغ. افحص أرصدة وحركات المخزون الفعلية قبل اقتراح أي إجراء.',
    'الخطوة التالية: حدّد الفترة المطلوبة، ثم راجع الفواتير والمدفوعات والمصروفات كلًّا في مصدره. إذا كانت البيانات ناقصة، أكمل التسجيل أولًا وأعد تشغيل الملخص.',
    'ملاحظة: هذه إجابة توضيحية طويلة لاختبار عرض النص والتمرير على الهاتف؛ لا تمثل توصية مالية أو تغييرًا في سجلات النشاط.',
    'نهاية الملخص: لا توجد سجلات إضافية في العينة الحالية، ويمكنك متابعة المراجعة من الأقسام المرتبطة دون مغادرة مساحة العمل.'
  ].join('\n\n');
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
          period: { start_date: '2026-10-13', end_date: '2026-11-11', timezone: 'Africa/Cairo' },
          // Synthetic, non-persistent KPI fixture for visual review only.
          // Values mirror the shape of existing read-only aggregates without
          // writing or reading any real workspace records in this browser test.
          invoiced_sales: [{ currency_code: 'EGP', count: 9, total: '548525.00' }],
          collected_payments: [{ currency_code: 'EGP', count: 8, total: '548255.00' }],
          expenses: [{ currency_code: 'EGP', count: 1, total: '5000.00' }],
          outstanding_balances: [{ currency_code: 'EGP', total: '230500.00' }],
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

    if (path === '/api/v1/businesses/business-1/profit-loss' && request.method() === 'GET') {
      await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify({
        period: { start_date: '2026-10-13', end_date: '2026-11-11', timezone: 'Africa/Cairo' },
        revenue_basis: 'issued_invoices', currencies: [],
      }) });
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
    if (path === '/api/v1/businesses/business-1/reports/data-integrity' && request.method() === 'GET') {
      const emptyFinding = { total: 0, items: [] };
      await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify({
        warning: 'Synthetic browser fixture; no production data.',
        unlinked_issued_invoices: emptyFinding,
        currency_mismatched_allocations: emptyFinding,
        customer_mismatched_allocations: emptyFinding,
        offset: 0, limit: 50,
      }) });
      return;
    }
    if (path === '/api/v1/businesses/business-1/operations/health' && request.method() === 'GET') {
      await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify({
        status: 'healthy', database_connected: true, migration_table_available: true,
        migration_revision: 'e2e-fixture', ai_configured: false,
        notification_delivery_configured: false, recurring_invoice_worker_configured: false,
        checked_at: '2026-11-11T10:00:00Z',
      }) });
      return;
    }
    if (['/suppliers', '/purchase-orders', '/recurring-invoices', '/notifications', '/employees', '/payroll'].some(suffix =>
      path === '/api/v1/businesses/business-1' + suffix
    ) && request.method() === 'GET') {
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
          answer: longAssistantAnswer,
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

  // Guard the public auth shell at phone, desktop and both writing directions.
  const assertAuthShellLayout = async (width: number, height: number) => {
    await page.setViewportSize({ width, height });
    const layout = await page.evaluate(() => {
      const card = document.querySelector<HTMLElement>('.auth-card');
      if (!card) return null;
      const rect = card.getBoundingClientRect();
      return {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        scrollHeight: document.documentElement.scrollHeight,
        clientHeight: document.documentElement.clientHeight,
        cardCenterY: (rect.top + rect.bottom) / 2,
        viewportCenterY: window.innerHeight / 2,
      };
    });
    expect(layout).not.toBeNull();
    expect(layout!.scrollWidth).toBeLessThanOrEqual(layout!.clientWidth);
    expect(layout!.scrollHeight).toBeLessThanOrEqual(layout!.clientHeight);
    expect(Math.abs(layout!.cardCenterY - layout!.viewportCenterY)).toBeLessThan(2);
  };

  await assertAuthShellLayout(360, 800);
  await assertAuthShellLayout(390, 844);
  await assertAuthShellLayout(1280, 800);
  await page.locator('.language-toggle').click();
  await expect(page.locator('.shell')).toHaveAttribute('dir', 'ltr');
  await assertAuthShellLayout(390, 844);
  await page.locator('.language-toggle').click();
  await expect(page.locator('.shell')).toHaveAttribute('dir', 'rtl');
  await page.setViewportSize({ width: 360, height: 800 });

  await page.getByLabel(/البريد الإلكتروني|Email address/).fill('owner@example.test');
  await page.getByLabel(/كلمة المرور|Password/).fill('mock-password-123');
  await page.getByRole('button', { name: /تسجيل الدخول|Sign in/ }).click();

  await expect(page.locator('#workspace-current-name')).toHaveText('Demo Retail', { timeout: 20_000 });
  await expect(page.locator('.home-shortcut-list > .home-shortcut-link')).toHaveCount(5);
  await expect(page.locator('.metric-grid aba-metric-card')).toHaveCount(4, { timeout: 20_000 });
  const kpiCards = page.locator('.metric-grid aba-metric-card');
  await expect(kpiCards.nth(0)).toContainText('548525.00 EGP');
  await expect(kpiCards.nth(1)).toContainText('548255.00 EGP');
  await expect(kpiCards.nth(2)).toContainText('5000.00 EGP');
  await expect(kpiCards.nth(3)).toContainText('230500.00 EGP');

  await page.locator('.mobile-install-button').click();
  await expect(page.locator('.install-help-inline')).toBeVisible();
  await expect(page.locator('.install-help-inline')).toContainText(/تثبيت التطبيق|Install app/);
  const installHelpPosition = await page.locator('.install-help-inline').evaluate(element => getComputedStyle(element).position);
  expect(installHelpPosition, 'install guidance must not become a fixed overlay').toBe('static');
  await page.locator('.install-help-inline').getByRole('button', { name: /حسنًا|Got it/ }).click();
  await expect(page.locator('.install-help-inline')).toHaveCount(0);

  const ownerModuleDirectory = page.locator('.module-directory-grid');
  const ownerModuleCount = await ownerModuleDirectory.locator('aba-quick-access-card').count();
  const ownerModuleCountLabel = await page.locator('.module-directory .count').textContent();
  expect(Number(ownerModuleCountLabel?.trim())).toBe(ownerModuleCount);
  expect(ownerModuleCount).toBeGreaterThan(0);

  const assertNoHorizontalOverflow = async (label: string) => {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow, label).toBe(false);
  };
  const assertReleaseGuideMobileLayout = async (width: number) => {
    const layout = await page.evaluate(() => ({
      hasOverflow: document.documentElement.scrollWidth > window.innerWidth,
      summaryHeights: Array.from(document.querySelectorAll(
        '.release-feature-group > summary, .release-version > summary'
      )).map(summary => summary.getBoundingClientRect().height),
    }));
    expect(layout.hasOverflow, `Release Guide must not overflow at ${width}px`).toBe(false);
    expect(layout.summaryHeights.length).toBeGreaterThan(0);
    for (const height of layout.summaryHeights) {
      expect(height, `Release Guide disclosure rows must remain touch-friendly at ${width}px`).toBeGreaterThanOrEqual(48);
    }
  };
  const assertHomeMobileGrid = async (width: number) => {
    // Angular may briefly re-evaluate the dashboard branch after a viewport resize.
    await expect(page.locator('.metric-grid aba-metric-card')).toHaveCount(4, { timeout: 10_000 });
    const layout = await page.evaluate(() => {
      const columns = (selector: string) => {
        const grid = document.querySelector(selector);
        return grid ? getComputedStyle(grid).gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length : 0;
      };
      return {
        metricColumns: columns('.metric-grid'),
        installCardPosition: document.querySelector('.mobile-install-card')
          ? getComputedStyle(document.querySelector('.mobile-install-card')!).position : 'missing',
        installCardWidth: document.querySelector('.mobile-install-card')?.getBoundingClientRect().width ?? 0,
        mobileHeaderPosition: document.querySelector('aba-mobile-app-header')
          ? getComputedStyle(document.querySelector('aba-mobile-app-header')!).position : 'missing',
        installCardHeaderGap: (() => {
          const card = document.querySelector('.mobile-install-card');
          const header = document.querySelector('aba-mobile-app-header');
          return card && header ? header.getBoundingClientRect().top - card.getBoundingClientRect().bottom : -1;
        })(),
        metricSupportingFontSizes: Array.from(document.querySelectorAll('.metric-grid aba-metric-card small'))
          .map(element => getComputedStyle(element).fontSize),
        headerLabelFontSizes: Array.from(document.querySelectorAll('.mobile-app-header .context-label'))
          .map(element => Number.parseFloat(getComputedStyle(element).fontSize)),
        workspaceNameFontSizes: Array.from(document.querySelectorAll('.mobile-app-header .workspace-copy strong'))
          .map(element => Number.parseFloat(getComputedStyle(element).fontSize)),
        quickAccessDescriptionFontSizes: Array.from(document.querySelectorAll('.home-shortcut-list .aba-quick-access__copy > span'))
          .map(element => Number.parseFloat(getComputedStyle(element).fontSize)),
        sectionDescriptionFontSizes: Array.from(document.querySelectorAll('.aba-section-header p'))
          .map(element => Number.parseFloat(getComputedStyle(element).fontSize)),
        quickAccessColumns: columns('.home-shortcut-list'),
        moduleColumns: columns('.module-directory-grid'),
        headerControlHeights: Array.from(document.querySelectorAll(
          '.mobile-app-header .brand-button, .mobile-app-header .assistant-shortcut, .mobile-app-header .icon-button, .mobile-app-header .profile-trigger'
        )).map(control => control.getBoundingClientRect().height),
        dockItemHeights: Array.from(document.querySelectorAll('.sidebar > .nav-item'))
          .filter(item => getComputedStyle(item).display !== 'none')
          .map(item => item.getBoundingClientRect().height),
        dockHeight: document.querySelector('.sidebar')?.getBoundingClientRect().height ?? 0,
        mainBottomPadding: Number.parseFloat(getComputedStyle(document.querySelector('.main')!).paddingBottom),
        headerPageRowHeight: document.querySelector('.mobile-app-header .page-context')?.getBoundingClientRect().height ?? 0,
        headerWorkspaceRowHeight: document.querySelector('.mobile-app-header .workspace-context')?.getBoundingClientRect().height ?? 0,
      };
    });
    expect(layout.installCardPosition, 'mobile install guidance must remain in normal document flow').toBe('static');
    expect(layout.installCardWidth, 'mobile install guidance must fit the content column').toBeGreaterThan(0);
    expect(layout.mobileHeaderPosition, 'mobile workspace header must not stick over scrolled content').toBe('relative');
    expect(layout.installCardHeaderGap, 'install guidance must finish before the mobile workspace header').toBeGreaterThanOrEqual(0);
    expect(layout.metricColumns, `KPI grid must use two columns at ${width}px`).toBe(2);
    expect(layout.metricSupportingFontSizes.length, `KPI supporting copy must render at ${width}px`).toBeGreaterThan(0);
    for (const fontSize of layout.metricSupportingFontSizes) {
      expect(fontSize, `KPI supporting copy must meet the 12px mobile minimum at ${width}px`).toBe('12px');
    }
    expect(layout.headerLabelFontSizes.length, `workspace context label must render at ${width}px`).toBeGreaterThan(0);
    for (const fontSize of layout.headerLabelFontSizes) expect(fontSize).toBeGreaterThanOrEqual(11);
    for (const fontSize of layout.workspaceNameFontSizes) expect(fontSize).toBeGreaterThanOrEqual(12);
    for (const fontSize of layout.quickAccessDescriptionFontSizes) expect(fontSize).toBeGreaterThanOrEqual(12);
    for (const fontSize of layout.sectionDescriptionFontSizes) expect(fontSize).toBeGreaterThanOrEqual(12);
    expect(layout.quickAccessColumns, `Quick access must use two columns at ${width}px`).toBe(2);
    expect(layout.moduleColumns, `Module directory must use two columns at ${width}px`).toBe(2);
    expect(layout.headerControlHeights).toHaveLength(4);
    expect(layout.dockItemHeights).toHaveLength(4);
    for (const height of layout.dockItemHeights) {
      expect(height, `Mobile dock controls must remain at least 44px at ${width}px`).toBeGreaterThanOrEqual(44);
    }
    expect(layout.mainBottomPadding, 'main content must clear the mobile dock and safe-area allowance').toBeGreaterThanOrEqual(layout.dockHeight);
    expect(layout.mainBottomPadding).toBeGreaterThanOrEqual(128);
    expect(layout.headerPageRowHeight, 'page title and actions row must be rendered').toBeGreaterThan(0);
    expect(layout.headerWorkspaceRowHeight, 'workspace context row must be rendered').toBeGreaterThan(0);
    for (const height of layout.headerControlHeights) {
      expect(height, `Mobile header controls must remain at least 44px at ${width}px`).toBeGreaterThanOrEqual(44);
    }

  };
  const assertHomeContentClearsDock = async (width: number, direction: 'ar' | 'en') => {
    const directory = page.locator('.module-directory-disclosure');
    await directory.evaluate(element => { (element as HTMLDetailsElement).open = true; });
    const footer = page.locator('.main footer');
    const lastModuleAction = page.locator('.module-directory-grid > aba-quick-access-card button:not(:disabled)').last();
    await page.evaluate(() => {
      document.documentElement.style.scrollBehavior = 'auto';
      window.scrollTo(0, 0);
    });
    await expect(lastModuleAction, 'the focus-scroll target must be enabled').toBeEnabled();
    // Reset focus for every viewport so the browser performs a fresh focus transition.
    await lastModuleAction.evaluate(element => (element as HTMLButtonElement).blur());
    // Playwright's focus action does not itself scroll; exercise native scroll-padding.
    await lastModuleAction.evaluate(element => element.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
    await lastModuleAction.focus();
    await expect(lastModuleAction, 'the viewport-scroll target must receive keyboard focus').toBeFocused();
    const focusClearance = await page.evaluate(() => {
      const focused = document.activeElement as HTMLElement | null;
      const dock = document.querySelector('.sidebar');
      if (!focused || !dock) return null;
      return {
        targetBottom: focused.getBoundingClientRect().bottom,
        dockTop: dock.getBoundingClientRect().top,
        viewportScrollPadding: Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingBlockEnd),
      };
    });
    expect(focusClearance, 'focused Home controls and the fixed dock must render').not.toBeNull();
    expect(focusClearance!.viewportScrollPadding, 'document viewport must reserve dock clearance for focus scrolling').toBeGreaterThanOrEqual(128);
    expect(focusClearance!.targetBottom, 'keyboard-focused Home controls must scroll above the fixed dock').toBeLessThanOrEqual(focusClearance!.dockTop - 8);
    await footer.scrollIntoViewIfNeeded();
    const clearance = await page.evaluate(() => {
      const dock = document.querySelector('.sidebar');
      const footerElement = document.querySelector('.main footer');
      const lastCard = document.querySelector('.module-directory-grid > aba-quick-access-card:last-child');
      if (!dock || !footerElement || !lastCard) return null;
      const dockTop = dock.getBoundingClientRect().top;
      return {
        gapAfterFooter: dockTop - footerElement.getBoundingClientRect().bottom,
        gapAfterLastModule: dockTop - lastCard.getBoundingClientRect().bottom,
        dockHeight: dock.getBoundingClientRect().height,
      };
    });
    expect(clearance, 'the final Home content, last module and dock must render').not.toBeNull();
    expect(clearance!.dockHeight).toBeGreaterThan(0);
    expect(clearance!.gapAfterLastModule, `last module must clear the dock at ${width}px ${direction}`).toBeGreaterThanOrEqual(8);
    expect(clearance!.gapAfterFooter, `final page footer must clear the dock at ${width}px ${direction}`).toBeGreaterThanOrEqual(8);
    await page.screenshot({
      path: `test-results/aiba-home-${width}px-${direction}-dock-clearance-viewport.png`,
      fullPage: false,
      animations: 'disabled',
    });
    // Restore the Home viewport so the following general screenshots include the header and KPIs.
    await page.evaluate(() => window.scrollTo(0, 0));
  };
  for (const width of [320, 360, 390, 412, 430, 700, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await assertNoHorizontalOverflow(`Arabic RTL layout must fit at ${width}px`);
    if (width <= 430) await assertHomeMobileGrid(width);
    if (width <= 760) await assertHomeContentClearsDock(width, 'ar');
    await page.screenshot({
      path: `test-results/aiba-home-${width}px-ar-viewport.png`,
      fullPage: false,
      animations: 'disabled',
    });
    if ([320, 390, 1280].includes(width)) {
      await page.screenshot({
        path: `test-results/aiba-home-${width}px-ar.png`,
        fullPage: true,
        animations: 'disabled',
      });
    }
  }

  await page.setViewportSize({ width: 360, height: 800 });
  const moreTrigger = page.getByRole('button', { name: /المزيد من الأقسام|More sections/ });
  await moreTrigger.click();
  await expect(page.getByRole('navigation', { name: /أقسام إضافية|Additional sections/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#mobile-more-menu')).toHaveCount(0);
  await expect(moreTrigger).toBeFocused();
  await moreTrigger.click();
  await expect(moreTrigger).toHaveAttribute('aria-expanded', 'true');
  await expect(moreTrigger).toHaveAttribute('aria-controls', 'mobile-more-menu');
  await expect(page.locator('#mobile-more-menu .mobile-more-group')).toHaveCount(5);
  const moreMenuLayout = await page.locator('#mobile-more-menu').evaluate(element => ({
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
    maxHeight: Number.parseFloat(getComputedStyle(element).maxHeight),
    overflowY: getComputedStyle(element).overflowY,
    overscrollBehavior: getComputedStyle(element).overscrollBehavior,
  }));
  expect(moreMenuLayout.scrollHeight).toBeGreaterThan(moreMenuLayout.clientHeight);
  expect(moreMenuLayout.maxHeight).toBeLessThanOrEqual(520);
  expect(moreMenuLayout.overflowY).toBe('auto');
  expect(moreMenuLayout.overscrollBehavior).toBe('contain');
  await page.locator('#mobile-more-menu').getByRole('button', { name: /دليل التطبيق والإصدارات|App guide & versions/ }).click();
  await expect(page.locator('#mobile-more-menu')).toHaveCount(0);
  await expect(moreTrigger).toHaveAttribute('aria-expanded', 'false');
  await expect(moreTrigger).not.toHaveAttribute('aria-controls');
  await expect(moreTrigger).toHaveClass(/active/);
  await expect(moreTrigger).toBeFocused();
  await expect(page.getByRole('heading', { name: /دليل التطبيق والإصدارات|App guide & versions/ })).toBeVisible();
  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await assertReleaseGuideMobileLayout(width);
  }

  await moreTrigger.click();
  const guideMenuItem = page.locator('#mobile-more-menu').getByRole('button', { name: /دليل التطبيق والإصدارات|App guide & versions/ });
  await expect(guideMenuItem).toHaveClass(/active/);
  await expect(guideMenuItem).toHaveAttribute('aria-current', 'page');
  const languageAction = page.locator('#mobile-more-menu .mobile-menu-action').first();
  await expect(languageAction).toContainText('English');
  await languageAction.click();
  await expect(page.locator('.shell')).toHaveAttribute('dir', 'ltr');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(moreTrigger).toHaveAttribute('aria-expanded', 'true');
  const ltrMoreMenuLayout = await page.locator('#mobile-more-menu').evaluate(element => ({
    direction: getComputedStyle(element).direction,
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
    overflowY: getComputedStyle(element).overflowY,
    overscrollBehavior: getComputedStyle(element).overscrollBehavior,
  }));
  expect(ltrMoreMenuLayout.direction).toBe('ltr');
  expect(ltrMoreMenuLayout.scrollHeight).toBeGreaterThan(ltrMoreMenuLayout.clientHeight);
  expect(ltrMoreMenuLayout.scrollWidth).toBeLessThanOrEqual(ltrMoreMenuLayout.clientWidth);
  expect(ltrMoreMenuLayout.overflowY).toBe('auto');
  expect(ltrMoreMenuLayout.overscrollBehavior).toBe('contain');
  await page.keyboard.press('Escape');
  await expect(page.locator('#mobile-more-menu')).toHaveCount(0);
  await expect(moreTrigger).toBeFocused();
  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await assertReleaseGuideMobileLayout(width);
  }
  // Language was switched from App Guide; return to Home before measuring Home grids.
  await page.getByRole('button', { name: /Go to Home|العودة إلى الرئيسية/ }).click();
  await expect(page.locator('.metric-grid aba-metric-card')).toHaveCount(4, { timeout: 20_000 });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: 'test-results/aiba-home-390px-ltr.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.screenshot({
    path: 'test-results/aiba-home-390px-ltr-viewport.png',
    fullPage: false,
    animations: 'disabled',
  });
  for (const width of [320, 360, 390, 412, 430, 700, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await assertNoHorizontalOverflow(`English LTR layout must fit at ${width}px`);
    if (width <= 430) await assertHomeMobileGrid(width);
    if (width <= 760) await assertHomeContentClearsDock(width, 'en');
    await page.screenshot({
      path: `test-results/aiba-home-${width}px-ltr-viewport.png`,
      fullPage: false,
      animations: 'disabled',
    });
  }

  await page.setViewportSize({ width: 360, height: 800 });
  await moreTrigger.click();
  await expect(page.locator('#mobile-more-menu')).toBeVisible();
  await page.locator('#mobile-more-menu .mobile-menu-action').first().click();
  await expect(page.locator('.shell')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.setViewportSize({ width: 360, height: 800 });
  // Sweep every OWNER workspace destination at phone and desktop widths in RTL and LTR.
  // Platform Admin has a separate platform identity and a dedicated authenticated E2E spec.
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

  const routeApiFailures: string[] = [];
  const routeNetworkFailures: string[] = [];
  const pendingWorkspaceRequests = new Set<object>();
  const isWorkspaceApiRequest = (url: string) =>
    url.startsWith(apiBaseUrl + '/api/v1/businesses/business-1');
  const routeLoadingMessages = page.locator(
    '.global-loading:visible, aba-state-message.aba-state-message--loading:visible, [role="status"]:visible'
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

  const assertRouteSweep = async (width: number, language: 'ar' | 'en', height = 844) => {
    await page.setViewportSize({ width, height });
    const direction = language === 'ar' ? 'rtl' : 'ltr';
    await expect(page.locator('.shell')).toHaveAttribute('dir', direction);
    await expect(page.locator('html')).toHaveAttribute('dir', direction);
    await expect(page.locator('body')).toHaveCSS('direction', direction);

    for (const destination of routeDestinations) {
      const expectedTitle = language === 'ar' ? destination.titleAr : destination.titleEn;
      const homeNavLabel = language === 'ar' ? 'الرئيسية' : 'Home';
      const homeHeading = language === 'ar' ? 'الرئيسية' : 'Overview';
      const cardLabel = language === 'ar' ? ('cardAr' in destination ? destination.cardAr : destination.titleAr)
        : ('cardEn' in destination ? destination.cardEn : destination.titleEn);
      const homeButton = page.locator('.sidebar').getByRole('button', { name: homeNavLabel, exact: true });
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
      // Tab changes do not navigate the document, so networkidle is not a
      // reliable signal. Wait for the app's actual loading indicators and
      // every workspace API request to settle before accepting the screenshot.
      await expect(routeLoadingMessages, destination.tab + ' loading message').toHaveCount(0, { timeout: 15_000 });
      await expect(routeSkeletons, destination.tab + ' loading skeleton').toHaveCount(0, { timeout: 15_000 });
      await expect.poll(() => pendingWorkspaceRequests.size, { timeout: 15_000 })
        .toBe(0);
      await expect(page.locator('.main .panel:visible, .main .aba-state-message--empty:visible, .main .aba-state-message--info:visible').first(),
        destination.tab + ' rendered content or empty state').toBeVisible();
      await expect(page.locator('[role="alert"]:visible'), destination.tab + ' rendered error state')
        .toHaveCount(0);
      expect(routeApiFailures, destination.tab + ' API failures').toEqual([]);
      expect(routeNetworkFailures, destination.tab + ' network failures').toEqual([]);
      if (width <= 760) {
        // The Hybrid mobile header replaces the desktop workspace bar on phones.
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
        const employeeForm = page.locator('#employee-profile-form');
        const formToggle = page.locator('.employee-form-toggle');
        await expect(employeeForm, 'mobile employee form is collapsed by default').toBeHidden();
        await expect(formToggle).toHaveAttribute('aria-expanded', 'false');
        const employeesTab = hrNavigation.getByRole('button', { name: labels.employees, exact: true });
        const prepareTab = hrNavigation.getByRole('button', { name: labels.prepare, exact: true });
        const historyTab = hrNavigation.getByRole('button', { name: labels.history, exact: true });
        const tabHeights = await hrNavigation.getByRole('button').evaluateAll(elements =>
          elements.map(element => element.getBoundingClientRect().height));
        expect(tabHeights.length).toBe(3);
        for (const height of tabHeights) expect(height, 'mobile HR tabs retain 44px touch targets').toBeGreaterThanOrEqual(44);

        // Exercise the same mobile HR flow with keyboard-only navigation.
        await employeesTab.focus();
        await expect(employeesTab).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(page.locator('[data-mobile-pane="employees"]')).toBeVisible();
        await page.keyboard.press('Tab');
        await expect(prepareTab).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(page.locator('[data-mobile-pane="prepare"]')).toBeVisible();
        await expect(page.locator('[data-mobile-pane="employees"]')).toBeHidden();
        await page.keyboard.press('Tab');
        await expect(historyTab).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(page.locator('[data-mobile-pane="history"]')).toBeVisible();
        await expect(page.locator('[data-mobile-pane="prepare"]')).toBeHidden();
        await page.keyboard.press('Shift+Tab');
        await expect(prepareTab).toBeFocused();
        await page.keyboard.press('Shift+Tab');
        await expect(employeesTab).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(page.locator('[data-mobile-pane="employees"]')).toBeVisible();
        // Continue through the remaining two section controls in DOM order
        // before reaching the employee form disclosure.
        await page.keyboard.press('Tab');
        await expect(prepareTab).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(historyTab).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(formToggle).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(employeeForm, 'mobile employee form opens on demand with keyboard').toBeVisible();
        await expect(formToggle).toHaveAttribute('aria-expanded', 'true');
        await page.keyboard.press('Enter');
        await expect(employeeForm).toBeHidden();
        await expect(formToggle).toHaveAttribute('aria-expanded', 'false');
      }
      if (destination.tab === 'customers' && width === 390 && language === 'en') {
        const mobileTitle = await page.locator('aba-mobile-app-header .page-copy h1').evaluate(element => {
          const range = document.createRange();
          range.selectNodeContents(element);
          return {
            text: element.textContent?.trim() ?? '',
            renderedLines: range.getClientRects().length,
            fontSize: getComputedStyle(element).fontSize,
          };
        });
        expect(mobileTitle.text, 'Customers mobile page title').toBe('Customers');
        expect(mobileTitle.renderedLines, 'the 390px English Customers title must not orphan its final character').toBe(1);
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
        path: `test-results/t18-route-${destination.tab}-${width}px-${language}.png`,
        fullPage: false,
        animations: 'disabled',
      });
    }
  };

  const assertTabletRail = async (language: 'ar' | 'en') => {
    const homeLabel = language === 'ar' ? 'الرئيسية' : 'Home';
    const homeHeading = language === 'ar' ? 'الرئيسية' : 'Overview';
    const direction = language === 'ar' ? 'rtl' : 'ltr';

    for (const width of [761, 768, 820, 900]) {
      await page.setViewportSize({ width, height: 1024 });
      await expect(page.locator('.shell')).toHaveAttribute('dir', direction);
      const metrics = await page.locator('.sidebar').evaluate((sidebar, expectedLabel) => {
        const home = Array.from(sidebar.querySelectorAll<HTMLButtonElement>('.nav-item'))
          .find(button => button.getAttribute('aria-label') === expectedLabel);
        const label = home?.querySelector<HTMLElement>('span:not(.nav-icon)');
        const sidebarRect = sidebar.getBoundingClientRect();
        const mainRect = document.querySelector<HTMLElement>('.main')?.getBoundingClientRect();
        return {
          sidebarWidth: Math.round(sidebarRect.width),
          sidebarLeft: Math.round(sidebarRect.left),
          sidebarOverflowY: getComputedStyle(sidebar).overflowY,
          homeAriaLabel: home?.getAttribute('aria-label') ?? '',
          homeTitle: home?.getAttribute('title') ?? '',
          homeLabelDisplay: label ? getComputedStyle(label).display : '',
          mainOverlapsSidebar: mainRect
            ? mainRect.left < sidebarRect.right && mainRect.right > sidebarRect.left
            : true,
          documentWidth: document.documentElement.scrollWidth,
        };
      }, homeLabel);

      expect(metrics.sidebarWidth, 'tablet rail width at ' + width + 'px').toBe(84);
      expect(metrics.sidebarLeft, 'RTL/LTR rail placement at ' + width + 'px')
        .toBe(language === 'ar' ? 0 : width - 84);
      expect(metrics.sidebarOverflowY).toBe('auto');
      expect(metrics.homeAriaLabel).toBe(homeLabel);
      expect(metrics.homeTitle).toBe(homeLabel);
      expect(metrics.homeLabelDisplay).toBe('none');
      expect(metrics.mainOverlapsSidebar).toBe(false);
      expect(metrics.documentWidth, 'tablet document width at ' + width + 'px')
        .toBeLessThanOrEqual(width);

      const homeButton = page.locator('.sidebar').getByRole('button', { name: homeLabel, exact: true });
      await homeButton.focus();
      await expect(homeButton).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.locator('.topbar-heading h1')).toHaveText(homeHeading);
      await expect(page.locator('.workspace-bar')).toBeVisible();
    }

    // The rail ends at 900px; the full-label desktop sidebar resumes at 901px.
    await page.setViewportSize({ width: 901, height: 1024 });
    const desktopMetrics = await page.locator('.sidebar').evaluate(sidebar => {
      const home = sidebar.querySelector<HTMLElement>('.nav-item:not(.mobile-more)');
      const label = home?.querySelector<HTMLElement>('span:not(.nav-icon)');
      const rect = sidebar.getBoundingClientRect();
      return {
        sidebarWidth: Math.round(rect.width),
        labelDisplay: label ? getComputedStyle(label).display : '',
        documentWidth: document.documentElement.scrollWidth,
      };
    });
    expect(desktopMetrics.sidebarWidth).toBe(245);
    expect(desktopMetrics.labelDisplay).not.toBe('none');
    expect(desktopMetrics.documentWidth).toBeLessThanOrEqual(901);
  };

  // A 195×422 CSS viewport approximates the available layout area at 200% zoom
  // on a 390×844 device; it is not a substitute for browser/device zoom testing.
  await assertRouteSweep(195, 'ar', 422);
  await assertRouteSweep(390, 'ar');
  // Complete all Arabic RTL widths before using the More-menu language action.
  await assertRouteSweep(360, 'ar');
  await assertRouteSweep(430, 'ar');
  await assertRouteSweep(768, 'ar');
  await assertTabletRail('ar');
  await assertRouteSweep(1280, 'ar');

  // The More menu is mobile-only; restore a phone viewport after the tablet/desktop sweeps.
  await page.setViewportSize({ width: 390, height: 844 });
  // The first More-menu action is the language toggle (Arabic -> English).
  await moreTrigger.focus();
  await expect(moreTrigger).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('navigation', { name: /أقسام إضافية|Additional sections/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#mobile-more-menu')).toHaveCount(0);
  await expect(moreTrigger).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#mobile-more-menu')).toBeVisible();
  await page.locator('#mobile-more-menu .mobile-menu-action').first().click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.shell')).toHaveAttribute('dir', 'ltr');
  await assertRouteSweep(195, 'en', 422);
  await assertRouteSweep(360, 'en');
  await assertRouteSweep(390, 'en');
  await assertRouteSweep(430, 'en');
  await assertRouteSweep(768, 'en');
  await assertTabletRail('en');
  await assertRouteSweep(1280, 'en');

  // Restore Arabic for the remaining mobile interaction checks.
  await page.getByRole('button', { name: 'العربية', exact: true }).click();
  await page.setViewportSize({ width: 360, height: 800 });
  await expect(page.locator('.shell')).toHaveAttribute('dir', 'rtl');
  await page.locator('.sidebar').getByRole('button', { name: 'الرئيسية', exact: true }).click();

  // Exercise the real Home app-header shortcut; the More menu remains covered
  // by its dedicated navigation assertions above.
  await page.getByRole('button', { name: /افتح المساعد الذكي|Open AI assistant/ }).click();
  await expect(page.locator('#mobile-more-menu')).toHaveCount(0);
  await expect(moreTrigger).toHaveClass(/active/);

  await expect(page.locator('.shell')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByText(/ابدأ بسؤال سريع عن نشاطك|Start with a quick business question/)).toBeVisible();
  await expect(page.locator('.chat-log .aba-state-message[role="status"]')).toContainText(/ابدأ بسؤال سريع عن نشاطك|Start with a quick business question/);

  const chatLog = page.locator('.chat-log');
  await expect(chatLog).toHaveAttribute('role', 'log');
  await expect(chatLog).toHaveAttribute('aria-live', 'polite');
  const composer = page.getByRole('textbox', { name: /سؤالك للمساعد الذكي|Your question for the AI assistant/ });
  const sendButton = page.getByRole('button', { name: /إرسال|Send/ });
  const longChatPrompt = Array.from({ length: 12 }, (_, index) =>
    `سؤال ${index + 1}: راجع الفواتير المستحقة والتحصيلات المسجلة والمصروفات خلال الفترة المحددة، ووضّح مصدر كل رقم وما إذا كان المبلغ مسددًا أو ما زال مستحقًا.`
  ).join('\n');
  expect(longChatPrompt.length).toBeLessThanOrEqual(2000);
  await composer.fill(longChatPrompt);
  await sendButton.click();

  await expect(page.locator('.aba-state-message[role="status"]')).toContainText(/المساعد الذكي يجهّز الإجابة|The AI assistant is preparing an answer/);
  await expect(sendButton).toBeDisabled();
  expect(chatAttempts).toBe(1);
  const errorState = page.locator('.aba-state-message[role="alert"]');
  await expect(errorState).toContainText('Temporary assistant failure.');
  await expect(composer).toHaveValue(longChatPrompt);
  await expect(page.locator('.chat-message')).toHaveCount(0);
  const retryButton = page.getByRole('button', { name: /إعادة المحاولة|Retry/ });
  await expect(retryButton).toBeEnabled();
  await retryButton.click();

  await expect(page.locator('.aba-state-message[role="status"]')).toContainText(/المساعد الذكي يجهّز الإجابة|The AI assistant is preparing an answer/);
  const assistantMessage = page.locator('.chat-message').last();
  await expect(page.locator('.chat-message')).toHaveCount(2);
  await expect(assistantMessage.locator('p')).toContainText('ملخص النشاط للفترة المحددة');
  await expect(assistantMessage.locator('p')).toContainText('نهاية الملخص');
  const chatLogLayout = await page.locator('.chat-log').evaluate(element => ({
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
  }));
  expect(chatLogLayout.scrollHeight).toBeGreaterThan(chatLogLayout.clientHeight);
  expect(chatLogLayout.scrollWidth).toBeLessThanOrEqual(chatLogLayout.clientWidth);
  await page.locator('.chat-log').evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect(assistantMessage.locator('p')).toContainText('نهاية الملخص');
  expect(paymentRequests).toEqual(['/api/v1/businesses/business-1/payments']);
  expect(chatAttempts).toBe(2);
  expect(chatRequests).toEqual([
    { businessId: 'business-1', message: longChatPrompt, authorization: 'Bearer ' + idToken },
    { businessId: 'business-1', message: longChatPrompt, authorization: 'Bearer ' + idToken },
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
    const composer = document.querySelector('.chat-form textarea');
    const dock = document.querySelector('.sidebar');
    const visualViewport = window.visualViewport;
    if (!send || !composer || !dock || !visualViewport) return null;
    const sendRect = send.getBoundingClientRect();
    const composerRect = composer.getBoundingClientRect();
    return {
      sendBottom: sendRect.bottom,
      composerBottom: composerRect.bottom,
      visualViewportBottom: visualViewport.offsetTop + visualViewport.height,
      viewportHeight: window.innerHeight,
      dockPointerEvents: getComputedStyle(dock).pointerEvents,
      dockTransform: getComputedStyle(dock).transform,
      keyboardInset: getComputedStyle(document.documentElement).getPropertyValue('--aba-keyboard-inset').trim(),
    };
  });
  expect(viewportLayout).not.toBeNull();
  // The layout viewport includes the keyboard area. Compare against the
  // visual viewport instead, otherwise a composer hidden behind the keyboard
  // can still pass this assertion.
  expect(viewportLayout!.sendBottom).toBeLessThanOrEqual(viewportLayout!.visualViewportBottom + 1);
  expect(viewportLayout!.composerBottom).toBeLessThanOrEqual(viewportLayout!.visualViewportBottom + 1);
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
  const productCreatePayloads: Array<Record<string, unknown>> = [];
  const invoiceCreatePayloads: Array<Record<string, unknown>> = [];
  const invoiceUpdatePayloads: Array<Record<string, unknown>> = [];
  const forbiddenInvoiceActions: string[] = [];
  let staffDraftInvoice: Record<string, unknown> | null = null;
  let staffDraftLines: Array<Record<string, unknown>> = [];

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
    if (path === '/api/v1/businesses/staff-business-1/invoices' && request.method() === 'POST') {
      const payload = request.postDataJSON() as Record<string, unknown>;
      invoiceCreatePayloads.push(payload);
      staffDraftLines = (payload.lines as Array<Record<string, unknown>>).map((line, index) => ({
        id: 'staff-draft-line-' + (index + 1),
        product_id: line.product_id ?? null,
        description: line.description,
        quantity: line.quantity,
        unit_price: line.unit_price,
        line_total: '100.00',
      }));
      staffDraftInvoice = {
        id: 'staff-draft-invoice-1',
        business_id: 'staff-business-1',
        invoice_number: payload.invoice_number,
        customer_id: payload.customer_id,
        status: 'draft',
        currency_code: 'EGP',
        subtotal: '100.00',
        discount_total: '0.00',
        tax_total: '0.00',
        total: '100.00',
        issue_date: null,
        due_date: null,
        notes: payload.notes ?? null,
        created_at: '2026-11-12T00:00:00+00:00',
      };
      await route.fulfill({ status: 201, headers: corsHeaders, body: JSON.stringify(staffDraftInvoice) });
      return;
    }
    if (path === '/api/v1/businesses/staff-business-1/invoices/staff-draft-invoice-1' && request.method() === 'GET') {
      if (!staffDraftInvoice) {
        await route.fulfill({ status: 404, headers: corsHeaders, body: JSON.stringify({ detail: 'Invoice not found.' }) });
        return;
      }
      await route.fulfill({
        status: 200, headers: corsHeaders,
        body: JSON.stringify({ ...staffDraftInvoice, lines: staffDraftLines }),
      });
      return;
    }
    if (path === '/api/v1/businesses/staff-business-1/invoices/staff-draft-invoice-1' && request.method() === 'PATCH') {
      const payload = request.postDataJSON() as Record<string, unknown>;
      invoiceUpdatePayloads.push(payload);
      if (!staffDraftInvoice || staffDraftInvoice.status !== 'draft') {
        await route.fulfill({ status: 409, headers: corsHeaders, body: JSON.stringify({ detail: 'Only a draft invoice can be edited.' }) });
        return;
      }
      staffDraftLines = (payload.lines as Array<Record<string, unknown>>).map((line, index) => ({
        id: 'staff-draft-line-' + (index + 1),
        product_id: line.product_id ?? null,
        description: line.description,
        quantity: line.quantity,
        unit_price: line.unit_price,
        line_total: '100.00',
      }));
      staffDraftInvoice = {
        ...staffDraftInvoice,
        invoice_number: payload.invoice_number,
        customer_id: payload.customer_id,
        notes: payload.notes ?? null,
        subtotal: '100.00',
        total: '100.00',
      };
      await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify(staffDraftInvoice) });
      return;
    }
    if (/^\/api\/v1\/businesses\/staff-business-1\/invoices\/staff-draft-invoice-1\/(issue|void)$/.test(path)
      || path === '/api/v1/businesses/staff-business-1/payments') {
      forbiddenInvoiceActions.push(request.method() + ' ' + path);
      await route.fulfill({ status: 403, headers: corsHeaders, body: JSON.stringify({ detail: 'OWNER-only action.' }) });
      return;
    }
    if (path === '/api/v1/businesses/staff-business-1/products' && request.method() === 'POST') {
      productCreatePayloads.push(request.postDataJSON() as Record<string, unknown>);
      await route.fulfill({
        status: 201,
        headers: corsHeaders,
        body: JSON.stringify({
          id: 'staff-product-1',
          name: 'Zero-stock product',
          unit_price: '2.50',
          currency_code: 'EGP',
          is_stock_tracked: true,
          stock_quantity: '0',
        }),
      });
      return;
    }
    if (path === '/api/v1/businesses/staff-business-1/invoices' && request.method() === 'GET') {
      await route.fulfill({
        status: 200, headers: corsHeaders,
        body: JSON.stringify(staffDraftInvoice ? [staffDraftInvoice] : []),
      });
      return;
    }
    if ([
      '/api/v1/businesses/staff-business-1/products',
      '/api/v1/businesses/staff-business-1/expenses',
    ].includes(path) && request.method() === 'GET') {
      await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify([]) });
      return;
    }
    if (path === '/api/v1/businesses/staff-business-1/customers' && request.method() === 'GET') {
      await route.fulfill({
        status: 200, headers: corsHeaders,
        body: JSON.stringify([{
          id: 'staff-customer-1', business_id: 'staff-business-1',
          name: 'STAFF QA Customer', email: null, phone: null,
          created_at: '2026-11-12T00:00:00+00:00',
        }]),
      });
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

  const staffModuleDirectory = page.locator('.module-directory-grid');
  const staffModuleCount = await staffModuleDirectory.locator('aba-quick-access-card').count();
  const staffModuleCountLabel = await page.locator('.module-directory .count').textContent();
  expect(Number(staffModuleCountLabel?.trim())).toBe(staffModuleCount);
  for (const restricted of [/payments/i, /employees/i, /tax summary/i, /activity log/i, /data integrity/i, /operational health/i]) {
    await expect(staffModuleDirectory.getByRole('button', { name: restricted })).toHaveCount(0);
  }

  const moreTrigger = page.getByRole('button', { name: /More sections|المزيد من الأقسام/ });
  const assertStaffViewport = async (width: number, language: 'en' | 'ar') => {
    await page.setViewportSize({ width, height: 844 });
    const direction = language === 'ar' ? 'rtl' : 'ltr';
    await expect(page.locator('.shell')).toHaveAttribute('dir', direction);
    await expect(page.locator('html')).toHaveAttribute('dir', direction);
    await expect(page.locator('body')).toHaveCSS('direction', direction);
    await expect(staffModuleDirectory.locator('aba-quick-access-card')).toHaveCount(12);

    const restrictedLabels = language === 'en'
      ? [/Payments & collections/, /Employees & payroll/, /Tax summary/, /Activity log/, /Data integrity/, /Operational health/, /Platform admin/i]
      : [/المدفوعات والتحصيل/, /الموظفون والمرتبات/, /ملخص الضرائب/, /سجل العمليات/, /سلامة البيانات/, /الحالة التشغيلية/, /إدارة المنصة/];
    for (const restricted of restrictedLabels) {
      await expect(staffModuleDirectory.getByRole('button', { name: restricted })).toHaveCount(0);
    }

    const layout = await page.evaluate(() => ({
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
    }));
    expect(layout.documentWidth, 'STAFF Home must not overflow at ' + width + 'px/' + language)
      .toBeLessThanOrEqual(layout.viewportWidth);
    if (width <= 760) {
      await expect(page.locator('aba-mobile-app-header')).toBeVisible();
    } else {
      await expect(page.locator('.workspace-bar')).toBeVisible();
    }
  };

  for (const width of [360, 390, 430, 768, 1280]) {
    await assertStaffViewport(width, 'en');
  }
  await page.setViewportSize({ width: 390, height: 844 });

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

  // Repeat role filtering and responsive layout in Arabic RTL.
  await menu.locator('.mobile-menu-action').first().click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.shell')).toHaveAttribute('dir', 'rtl');
  for (const width of [360, 390, 430, 768, 1280]) {
    await assertStaffViewport(width, 'ar');
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await moreTrigger.click();
  for (const restricted of [
    /المدفوعات والتحصيل/, /الموظفون والمرتبات/, /ملخص الضرائب/,
    /سجل العمليات/, /سلامة البيانات/, /الحالة التشغيلية/, /إدارة المنصة/,
  ]) {
    await expect(menu.getByRole('button', { name: restricted })).toHaveCount(0);
  }
  for (const available of [/الموردون/, /المشتريات/, /الفواتير الدورية/, /الإشعارات/, /دليل التطبيق والإصدارات/]) {
    await expect(menu.getByRole('button', { name: available })).toBeVisible();
  }
  await menu.locator('.mobile-menu-action').first().click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.shell')).toHaveAttribute('dir', 'ltr');
  await moreTrigger.click();

  await menu.getByRole('button', { name: /App guide & versions/ }).click();
  await expect(menu).toHaveCount(0);
  await expect(moreTrigger).toHaveClass(/active/);
  await expect(moreTrigger).toBeFocused();

  // A STAFF member may create a stock-tracked product, but cannot submit a
  // positive opening-stock quantity. All API traffic remains mocked here.
  await moreTrigger.click();
  await menu.getByRole('button', { name: /Products & inventory/ }).click();
  await page.getByRole('heading', { name: /Products & inventory/ }).waitFor({ state: 'visible' });
  await page.getByRole('checkbox', { name: /Track stock/ }).check();
  await expect(page.getByText(/Only workspace owners can set a positive opening stock quantity/)).toBeVisible();
  await expect(page.locator('input[name="productOpeningQuantity"]')).toHaveCount(0);
  await page.getByRole('textbox', { name: /Product name/ }).fill('Zero-stock product');
  await page.getByRole('spinbutton', { name: /Unit price/ }).fill('2.50');
  await page.getByRole('button', { name: /Add product/ }).click();
  await expect.poll(() => productCreatePayloads.length).toBe(1);
  expect(productCreatePayloads[0]).toMatchObject({
    name: 'Zero-stock product',
    unit_price: '2.50',
    is_stock_tracked: true,
    opening_quantity: '0',
  });
  await expect(page.getByText(/Product saved successfully/)).toBeVisible();

  // STAFF can create and edit one draft invoice, but issue/void/payment
  // controls and requests remain outside the allowed role boundary.
  await page.setViewportSize({ width: 1280, height: 844 });
  await page.locator('aside.sidebar[role="navigation"]').getByRole('button', { name: 'Invoices', exact: true }).click();
  await expect(page.locator('header.topbar .topbar-heading h1')).toHaveText('Sales & invoices');
  await page.getByRole('button', { name: 'Create a new invoice', exact: true }).click();
  const staffEditor = page.locator('aba-invoice-draft-editor');
  await staffEditor.locator('input[name="invoiceNumber"]').fill('STAFF-DRAFT-001');
  await staffEditor.locator('select[name="customerId"]').selectOption('staff-customer-1');
  const staffLine = staffEditor.locator('.line-card').first();
  await staffLine.getByRole('button', { name: 'Service', exact: true }).click();
  await staffLine.getByLabel('Service description').fill('STAFF consulting service');
  await staffLine.getByLabel('Unit price (EGP)').fill('100.00');
  await staffLine.getByLabel('Quantity').fill('1');
  await staffEditor.getByLabel('Invoice notes (optional)').fill('Staff draft - initial');
  await staffEditor.getByRole('button', { name: 'Save draft', exact: true }).click();

  await expect(page.getByText('Invoice draft saved. Displayed totals came from the server.')).toBeVisible();
  await expect(staffEditor.locator('.summary-total strong')).toHaveText('100.00 EGP');
  expect(invoiceCreatePayloads).toHaveLength(1);
  expect(invoiceCreatePayloads[0]).toMatchObject({
    invoice_number: 'STAFF-DRAFT-001',
    customer_id: 'staff-customer-1',
    notes: 'Staff draft - initial',
    lines: [expect.objectContaining({
      description: 'STAFF consulting service',
      quantity: '1',
      unit_price: '100.00',
    })],
  });
  for (const derivedTotal of ['subtotal', 'discount_total', 'tax_total', 'total']) {
    expect(invoiceCreatePayloads[0]).not.toHaveProperty(derivedTotal);
  }

  const staffInvoiceCard = page.locator('.invoice-card').filter({ hasText: 'STAFF-DRAFT-001' });
  await expect(staffInvoiceCard).toBeVisible();
  await expect(staffInvoiceCard.locator('.invoice-status-badge.status-draft')).toBeVisible();
  await expect(staffInvoiceCard.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
  await expect(staffInvoiceCard.getByRole('button', { name: 'Issue', exact: true })).toHaveCount(0);
  await expect(staffInvoiceCard.getByRole('button', { name: 'Void', exact: true })).toHaveCount(0);
  await staffInvoiceCard.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(staffEditor.getByRole('heading', { name: 'Edit invoice draft' })).toBeVisible();
  await staffEditor.locator('.line-card').first().getByLabel('Service description').fill('STAFF updated consulting service');
  await staffEditor.getByLabel('Invoice notes (optional)').fill('Staff draft - edited');
  await staffEditor.getByRole('button', { name: 'Save draft', exact: true }).click();

  await expect(staffEditor.locator('.summary-total strong')).toHaveText('100.00 EGP');
  expect(invoiceUpdatePayloads).toHaveLength(1);
  expect(invoiceUpdatePayloads[0]).toMatchObject({
    invoice_number: 'STAFF-DRAFT-001',
    customer_id: 'staff-customer-1',
    notes: 'Staff draft - edited',
    lines: [expect.objectContaining({
      description: 'STAFF updated consulting service',
      quantity: '1',
      unit_price: '100.00',
    })],
  });
  expect(staffDraftInvoice).toMatchObject({
    id: 'staff-draft-invoice-1',
    invoice_number: 'STAFF-DRAFT-001',
    status: 'draft',
    notes: 'Staff draft - edited',
  });
  expect(staffDraftLines).toHaveLength(1);
  expect(paymentRequests).toEqual([]);
  expect(forbiddenInvoiceActions).toEqual([]);
  expect(unexpectedRequests).toEqual([]);
});
