import { expect, test } from '@playwright/test';

const apiBaseUrl = 'https://mock-api.test';
const projectId = 'mock-project';
const adminUid = 'bootstrap-admin-uid';
const adminSubject = `firebase:${projectId}:${adminUid}`;
const idToken = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJhdWQiOiJtb2NrLXByb2plY3QiLCJpc3MiOiJodHRwczovL3NlY3VyZXRva2VuLmdvb2dsZS5jb20vbW9jay1wcm9qZWN0Iiwic3ViIjoiYm9vdHN0cmFwLWFkbWluLXVpZCIsInVpZCI6ImJvb3RzdHJhcC1hZG1pbi11aWQiLCJleHAiOjQ5MDAwMDAwMDB9.signature';

test('signed-in platform admin can browse users, search exactly, and grant a delegated role without a workspace', async ({ page }) => {
  const uncaughtErrors: string[] = [];
  const apiRequests: Array<{ url: string; method: string; authorization?: string; body?: unknown }> = [];
  const authRequests: Array<{ url: string; body?: unknown }> = [];
  let roleGranted = false;
  let overviewFailure = false;
  let systemStatusFailure = false;

  page.on('pageerror', error => uncaughtErrors.push(error.message));
  await page.addInitScript(() => {
    if (!window.localStorage.getItem('aba-language')) window.localStorage.setItem('aba-language', 'en');
  });

  // Every external service used by this test is mocked. Any unrecognized external
  // host is blocked, so this test cannot call production Firebase or the live API.
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
          authDomain: `${projectId}.firebaseapp.com`,
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

    const requestBody = request.postDataJSON() as Record<string, unknown> | null;
    authRequests.push({ url: request.url(), body: requestBody ?? undefined });
    if (new URL(request.url()).pathname.endsWith('/accounts:signInWithPassword')) {
      await route.fulfill({
        status: 200,
        headers: firebaseHeaders,
        body: JSON.stringify({
          kind: 'identitytoolkit#VerifyPasswordResponse',
          localId: adminUid,
          email: 'admin@example.test',
          displayName: 'Admin Test',
          idToken,
          refreshToken: 'mock-refresh-token',
          expiresIn: '3600',
          registered: true,
        }),
      });
      return;
    }

    if (new URL(request.url()).pathname.endsWith('/accounts:lookup')) {
      // Firebase Auth performs an account lookup immediately after password sign-in.
      // Returning an empty user list makes the SDK reject the otherwise successful
      // mocked sign-in with auth/internal-error before the app can load.
      await route.fulfill({
        status: 200,
        headers: firebaseHeaders,
        body: JSON.stringify({
          users: [{
            localId: adminUid,
            email: 'admin@example.test',
            emailVerified: true,
            displayName: 'Admin Test',
            lastLoginAt: '1793059200000',
            createdAt: '1790812800000',
            providerUserInfo: [{
              providerId: 'password',
              federatedId: 'admin@example.test',
              email: 'admin@example.test',
              rawId: 'admin@example.test',
            }],
          }],
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      headers: firebaseHeaders,
      body: JSON.stringify({ users: [] }),
    });
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
      body: JSON.stringify({ access_token: idToken, id_token: idToken, expires_in: '3600', token_type: 'Bearer', refresh_token: 'mock-refresh-token', user_id: adminUid, project_id: projectId }),
    });
  });

  const corsHeaders = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS',
    'access-control-allow-headers': '*',
    'access-control-max-age': '600',
    'content-type': 'application/json',
  };

  const user = (values: {
    uid: string;
    display_name: string;
    email: string;
    roles?: string[];
    memberships?: Array<{ business_id: string; business_name: string; role: 'owner' | 'staff' }>;
  }) => ({
    uid: values.uid,
    subject: `firebase:${projectId}:${values.uid}`,
    display_name: values.display_name,
    email: values.email,
    email_verified: true,
    disabled: false,
    created_at: '2026-10-01T00:00:00+00:00',
    last_sign_in_at: '2026-10-27T00:00:00+00:00',
    is_platform_super_admin: false,
    roles: values.roles ?? [],
    memberships: values.memberships ?? [],
  });

  const listUsersPage = (url: URL) => {
    const query = url.searchParams.get('q')?.trim() ?? '';
    if (query) {
      return {
        items: [
          user({
            uid: 'exact-user-uid',
            display_name: 'Exact Search User',
            email: 'needle@example.test',
            roles: roleGranted ? ['user_manager'] : [],
          }),
        ],
        limit: 25,
        next_page_token: null,
        has_more: false,
        search_mode: 'exact_email_or_uid',
        limitations: [],
      };
    }

    if (url.searchParams.get('page_token') === 'opaque-cursor-2') {
      return {
        items: [user({
          uid: 'second-user-uid',
          display_name: 'Second Directory User',
          email: 'second@example.test',
        })],
        limit: 25,
        next_page_token: null,
        has_more: false,
        search_mode: 'cursor_pagination',
        limitations: [],
      };
    }

    return {
      items: [user({
        uid: 'first-user-uid',
        display_name: 'First Directory User',
        email: 'first@example.test',
        memberships: [{ business_id: 'alpha-workspace-id', business_name: 'Alpha Retail', role: 'owner' }],
      })],
      limit: 25,
      next_page_token: 'opaque-cursor-2',
      has_more: true,
      search_mode: 'cursor_pagination',
      limitations: [],
    };
  };

  const roleAudit = () => ({
    items: roleGranted ? [{
      id: 'role-audit-1',
      actor_subject: adminSubject,
      action: 'platform.user_role.granted',
      target_subject: `firebase:${projectId}:exact-user-uid`,
      role: 'user_manager',
      reason: 'Approved admin access for support',
      created_at: '2026-10-27T00:00:00+00:00',
    }] : [],
    total: roleGranted ? 1 : 0,
    limit: 20,
    offset: 0,
  });

  await page.route(`${apiBaseUrl}/**`, async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }

    const isVersion = path === '/version';
    if (!isVersion) {
      apiRequests.push({
        url: request.url(),
        method: request.method(),
        authorization: request.headers()['authorization'],
        body: request.postDataJSON(),
      });
    }

    if (isVersion) {
      await route.fulfill({
        status: 200, headers: corsHeaders,
        body: JSON.stringify({ version: '1.3.0', commit: 'e2e-test', environment: 'test' }),
      });
      return;
    }
    if (path === '/api/v1/businesses' && request.method() === 'GET') {
      await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify([]) });
      return;
    }
    if (path === '/api/v1/platform-admin/access' && request.method() === 'GET') {
      await route.fulfill({
        status: 200, headers: corsHeaders,
        body: JSON.stringify({
          is_platform_admin: true,
          is_platform_super_admin: true,
          subject: adminSubject,
          roles: ['platform_super_admin'],
          permissions: ['view_overview', 'view_workspaces', 'view_audit', 'view_system_status', 'view_users', 'manage_workspace_status', 'manage_platform_roles'],
        }),
      });
      return;
    }
    if (path === '/api/v1/platform-admin/overview' && request.method() === 'GET') {
      if (overviewFailure) {
        await route.fulfill({ status: 403, headers: corsHeaders, body: JSON.stringify({ detail: 'Platform administrator access is not granted.' }) });
        return;
      }
      await route.fulfill({
        status: 200, headers: corsHeaders,
        body: JSON.stringify({
          generated_at: '2026-10-27T00:00:00+00:00',
          businesses: { total: 0, active: 0, inactive: 0 },
          users: { distinct_subjects: 1, memberships: 0 },
          invoices: { count: 2, by_currency_and_status: [{ currency_code: 'EGP', status: 'issued', count: 2, total: '1500.00' }] },
          payments: { count: 0, by_currency: [] },
          audit_events: { count: 0 },
          limitations: [],
        }),
      });
      return;
    }
    if (path === '/api/v1/platform-admin/system-status' && request.method() === 'GET') {
      if (systemStatusFailure) {
        await route.fulfill({ status: 403, headers: corsHeaders, body: JSON.stringify({ detail: 'Platform administrator access is not granted.' }) });
        return;
      }
      await route.fulfill({
        status: 200, headers: corsHeaders,
        body: JSON.stringify({
          status: 'healthy',
          checked_at: '2026-10-27T00:00:00+00:00',
          release: { version: '1.3.0', commit: 'e2e-test', environment: 'test' },
          dependencies: { database: 'healthy', identity_verifier: 'configured' },
          limitations: [],
        }),
      });
      return;
    }
    if (path === '/api/v1/platform-admin/businesses' && request.method() === 'GET') {
      await route.fulfill({
        status: 200, headers: corsHeaders,
        body: JSON.stringify({ items: [], total: 0, limit: 25, offset: 0, sort_by: 'created_at', sort_order: 'desc' }),
      });
      return;
    }
    if (path === '/api/v1/platform-admin/audit-events' && request.method() === 'GET') {
      await route.fulfill({
        status: 200, headers: corsHeaders,
        body: JSON.stringify({ items: [], total: 0, limit: 25, offset: 0 }),
      });
      return;
    }
    if (path === '/api/v1/platform-admin/role-audit-events' && request.method() === 'GET') {
      await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify(roleAudit()) });
      return;
    }
    if (path === '/api/v1/platform-admin/users' && request.method() === 'GET') {
      await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify(listUsersPage(url)) });
      return;
    }
    if (path === '/api/v1/platform-admin/users/exact-user-uid/roles' && request.method() === 'POST') {
      const body = request.postDataJSON() as { role?: string; active?: boolean; reason?: string };
      expect(body.role).toBe('user_manager');
      expect(body.active).toBe(true);
      expect(body.reason).toBe('Approved admin access for support');
      roleGranted = true;
      await route.fulfill({
        status: 200, headers: corsHeaders,
        body: JSON.stringify({ changed: true, active: true, role: 'user_manager', message: 'Platform access change saved and recorded in the audit log.' }),
      });
      return;
    }

    await route.fulfill({
      status: 404, headers: corsHeaders,
      body: JSON.stringify({ detail: `Unexpected mocked API request: ${request.method()} ${path}` }),
    });
  });

  // Run the full signed-in admin journey at a narrow mobile viewport.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Welcome back|مرحبًا بعودتك/ })).toBeVisible({ timeout: 20_000 });
  await page.getByLabel(/Email address|البريد الإلكتروني/).fill('admin@example.test');
  await page.getByLabel(/Password|كلمة المرور/).fill('mock-password-123');
  await page.getByRole('button', { name: /Sign in|تسجيل الدخول/ }).click();

  // The mock admin has no workspace membership. This must not redirect the root
  // admin to the workspace-create flow or overwrite the platform-admin tab.
  await expect(page.getByRole('heading', { name: /Admin center|مركز الإدارة/ })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: /Users & access|المستخدمون والصلاحيات/ })).toBeVisible();
  await page.getByRole('button', { name: /Users & access|المستخدمون والصلاحيات/ }).click();

  await expect(page.getByRole('heading', { name: /Users & access|المستخدمون والصلاحيات/ })).toBeVisible();
  await expect(page.getByText('First Directory User')).toBeVisible();
  await expect(page.getByText('Alpha Retail')).toBeVisible();

  await page.getByRole('button', { name: /Next|التالي/ }).click();
  await expect(page.getByText('Second Directory User')).toBeVisible();
  expect(apiRequests.some(item => new URL(item.url).searchParams.get('page_token') === 'opaque-cursor-2')).toBe(true);

  await page.getByLabel(/Email address or UID|البريد الإلكتروني أو UID/).fill('needle@example.test');
  await page.getByRole('button', { name: /Search|بحث/ }).click();
  await expect(page.getByText('Exact Search User')).toBeVisible();
  await expect(page.getByText('First Directory User')).toHaveCount(0);
  expect(apiRequests.some(item => new URL(item.url).searchParams.get('q') === 'needle@example.test')).toBe(true);

  await page.getByRole('button', { name: /Details|التفاصيل/ }).click();
  await page.getByLabel(/Role to grant|الدور المراد منحه/).selectOption('user_manager');
  await page.getByLabel(/Reason \(required\)|سبب التغيير/).fill('Approved admin access for support');
  await page.getByRole('button', { name: /Grant role|منح الصلاحية/ }).click();

  await expect(page.getByRole('cell', { name: 'User Manager', exact: true }).last()).toBeVisible();
  await expect(page.getByRole('cell', { name: /Platform role granted|منح صلاحية/ })).toBeVisible();
  expect(roleGranted).toBe(true);
  expect(authRequests.some(item => item.url.includes('accounts:signInWithPassword'))).toBe(true);
  expect(apiRequests.length).toBeGreaterThan(0);
  expect(apiRequests.every(item => item.authorization === `Bearer ${idToken}`)).toBe(true);

  // A failed refresh after access revocation must not leave previously loaded
  // platform metrics or runtime health displayed as if they were current.
  await page.getByRole('button', { name: /Overview|نظرة عامة/ }).click();
  await expect(page.getByText('Member identities')).toBeVisible();
  await expect(page.getByText('Healthy').first()).toBeVisible();

  // Complete the 19th-destination visual evidence: Platform Admin is a separate
  // platform identity, so it is captured in its own fully mocked journey.
  const captureAdminViewport = async (
    view: 'overview' | 'users',
    language: 'en' | 'ar',
    width: number,
  ) => {
    await page.setViewportSize({ width, height: 844 });
    const direction = language === 'ar' ? 'rtl' : 'ltr';
    await expect(page.locator('html')).toHaveAttribute('dir', direction);
    await expect(page.locator('.shell')).toHaveAttribute('dir', direction);

    if (view === 'overview') {
      await page.getByRole('button', { name: language === 'en' ? /Overview/ : /نظرة عامة/ }).click();
      await expect(page.getByRole('heading', { name: language === 'en' ? /Admin center/ : /مركز الإدارة/ })).toBeVisible();
      // Wait for the mocked overview and runtime health data, not just the
      // always-present system-status panel, before capturing the viewport.
      await expect(page.locator('.metric-card')).toHaveCount(4, { timeout: 20_000 });
      await expect(page.locator('.runtime-summary .status-pill')).toHaveText(language === 'en' ? 'Healthy' : 'سليم', { timeout: 20_000 });
    } else {
      await page.getByRole('button', { name: language === 'en' ? /Users & access/ : /المستخدمون والصلاحيات/ }).click();
      await expect(page.getByRole('heading', { name: language === 'en' ? /Users & access/ : /المستخدمون والصلاحيات/ })).toBeVisible();
      const search = page.getByLabel(/Email address or UID|البريد الإلكتروني أو UID/);
      await search.fill('');
      await page.getByRole('button', { name: /Search|بحث/ }).click();
      await expect(page.getByText('First Directory User')).toBeVisible();
    }

    const layout = await page.evaluate(() => ({
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
    }));
    expect(layout.documentWidth, `Platform Admin ${view} must not overflow at ${width}px ${direction}`)
      .toBeLessThanOrEqual(layout.viewportWidth);
    await page.screenshot({
      path: `test-results/t18-platform-admin-${view}-${width}px-${language}.png`,
      fullPage: false,
      animations: 'disabled',
    });
  };

  for (const width of [390, 768, 1280]) {
    await captureAdminViewport('overview', 'en', width);
    await captureAdminViewport('users', 'en', width);
  }
  // Platform Admin has no in-page locale switch. Exercise the persisted locale
  // preference through a reload while keeping the mocked Firebase session.
  await page.evaluate(() => window.localStorage.setItem('aba-language', 'ar'));
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('.admin-shell')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { name: /مركز الإدارة/ })).toBeVisible({ timeout: 20_000 });
  for (const width of [390, 768, 1280]) {
    await captureAdminViewport('overview', 'ar', width);
    await captureAdminViewport('users', 'ar', width);
  }
  // The compact invoice summary belongs to Overview, not the Users directory.
  await page.getByRole('button', { name: /Overview|نظرة عامة/ }).click();
  await expect(page.getByRole('heading', { name: /Admin center|مركز الإدارة/ })).toBeVisible();
  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.locator('.compact-table')).toBeVisible();
    const compactTableFontSizes = await page.locator('.compact-table th, .compact-table td').evaluateAll(
      cells => cells.map(cell => Number.parseFloat(getComputedStyle(cell).fontSize)),
    );
    expect(compactTableFontSizes.length).toBeGreaterThan(0);
    for (const fontSize of compactTableFontSizes) {
      expect(fontSize, `Platform Admin summary text must be at least 11px at ${width}px`).toBeGreaterThanOrEqual(11);
    }
    const overviewHasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overviewHasHorizontalOverflow, `Platform Admin overview must not overflow at ${width}px`).toBe(false);
  }
  // Restore English before asserting the failure-path labels. Otherwise the
  // English-only strings are absent simply because the page is still Arabic.
  await page.evaluate(() => window.localStorage.setItem('aba-language', 'en'));
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.getByRole('heading', { name: /Admin center/ })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.metric-card')).toHaveCount(4, { timeout: 20_000 });
  await expect(page.locator('.runtime-summary .status-pill')).toHaveText('Healthy', { timeout: 20_000 });

  overviewFailure = true;
  await page.getByRole('button', { name: /Refresh data/ }).click();
  await expect(page.locator('.section-content .notice.error[role="alert"]'))
    .toContainText(/not granted/i);
  await expect(page.locator('.metric-card')).toHaveCount(0);

  systemStatusFailure = true;
  await page.getByRole('button', { name: /Check now/ }).click();
  await expect(page.locator('.system-status-panel .notice.error[role="alert"]'))
    .toContainText(/not granted/i);
  await expect(page.locator('.runtime-summary')).toHaveCount(0);

  // The admin navigation and directory remain keyboard-operable on mobile.
  const usersAccessTab = page.getByRole('button', { name: /Users & access|المستخدمون والصلاحيات/ });
  await usersAccessTab.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: /Users & access|المستخدمون والصلاحيات/ })).toBeVisible();
  await expect(page.getByLabel(/Email address or UID|البريد الإلكتروني أو UID/)).toBeVisible();

  for (const width of [360, 390, 430, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.getByRole('heading', { name: /Users & access|المستخدمون والصلاحيات/ })).toBeVisible();
    const pageHasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(pageHasHorizontalOverflow, `Platform Admin must not overflow at ${width}px`).toBe(false);
    if (width <= 760) {
      const sectionNavHeights = await page.locator('.section-nav button').evaluateAll(
        buttons => buttons.map(button => button.getBoundingClientRect().height),
      );
      expect(sectionNavHeights.length).toBeGreaterThan(0);
      for (const height of sectionNavHeights) {
        expect(height, `Platform Admin navigation targets must be at least 44px at ${width}px`).toBeGreaterThanOrEqual(44);
      }
    }
  }
  expect(uncaughtErrors).toEqual([]);
});
