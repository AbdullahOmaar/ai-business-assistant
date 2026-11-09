import { expect, test, type Page } from '@playwright/test';

const apiBaseUrl = 'https://mock-api.test';
const projectId = 'mock-project';
const ownerUid = 'workspace-owner-uid';
const idToken = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJhdWQiOiJtb2NrLXByb2plY3QiLCJpc3MiOiJodHRwczovL3NlY3VyZXRva2VuLmdvb2dsZS5jb20vbW9jay1wcm9qZWN0Iiwic3ViIjoid29ya3NwYWNlLW93bmVyLXVpZCIsInVpZCI6IndvcmtzcGFjZS1vd25lci11aWQiLCJleHAiOjQ5MDAwMDAwMDB9.signature';

type Deferred = {
  promise: Promise<void>;
  resolve: () => void;
};

function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

type ApiRequest = {
  path: string;
  method: string;
  authorization?: string;
  body?: unknown;
};

type SetupOptions = {
  popupBlocked?: boolean;
  deferInvoiceDetail?: boolean;
  deferFirstPayment?: boolean;
};

async function setupOwner(page: Page, options: SetupOptions = {}) {
  const uncaughtErrors: string[] = [];
  const apiRequests: ApiRequest[] = [];
  const invoiceCreateRequests: Array<Record<string, unknown>> = [];
  const invoiceUpdateRequests: Array<Record<string, unknown>> = [];
  const paymentRequests: Array<Record<string, unknown>> = [];
  const invoiceDetailGate = deferred();
  const invoiceDetailStarted = deferred();
  const paymentGate = deferred();
  const paymentStarted = deferred();
  let paymentCommitCount = 0;
  let committedPayment: Record<string, unknown> | null = null;
  let createdInvoice: Record<string, unknown> | null = null;

  const businesses = [
    {
      id: 'business-a',
      name: 'Demo Retail',
      currency_code: 'EGP',
      locale: 'en',
      timezone: 'Africa/Cairo',
      role: 'owner',
    },
    {
      id: 'business-b',
      name: 'Beta Retail',
      currency_code: 'EGP',
      locale: 'en',
      timezone: 'Africa/Cairo',
      role: 'owner',
    },
  ];

  const customersByBusiness: Record<string, Array<Record<string, unknown>>> = {
    'business-a': [{
      id: 'customer-a',
      business_id: 'business-a',
      name: 'Alpha Customer',
      email: 'alpha@example.test',
      phone: null,
      created_at: '2026-11-01T00:00:00+00:00',
    }],
    'business-b': [{
      id: 'customer-b',
      business_id: 'business-b',
      name: 'Beta Customer',
      email: 'beta@example.test',
      phone: null,
      created_at: '2026-11-01T00:00:00+00:00',
    }],
  };

  const productsByBusiness: Record<string, Array<Record<string, unknown>>> = {
    'business-a': [{
      id: 'product-a',
      business_id: 'business-a',
      name: 'Catalog Product',
      unit_price: '25.00',
      is_stock_tracked: false,
      stock_quantity: null,
      sku: 'SKU-A',
    }],
    'business-b': [{
      id: 'product-b',
      business_id: 'business-b',
      name: 'Beta Product',
      unit_price: '40.00',
      is_stock_tracked: false,
      stock_quantity: null,
      sku: 'SKU-B',
    }],
  };

  const draftInvoice = {
    id: 'invoice-draft-a',
    business_id: 'business-a',
    customer_id: 'customer-a',
    invoice_number: 'INV-DRAFT-1',
    status: 'draft',
    currency_code: 'EGP',
    subtotal: '100.00',
    discount_total: '0.00',
    tax_total: '0.00',
    total: '100.00',
    issue_date: null,
    due_date: null,
    notes: null,
    created_at: '2026-11-01T00:00:00+00:00',
    outstanding_amount: null,
  };

  const issuedInvoiceA = {
    id: 'invoice-issued-a',
    business_id: 'business-a',
    customer_id: 'customer-a',
    invoice_number: 'INV-ISSUED-A',
    status: 'issued',
    currency_code: 'EGP',
    subtotal: '250.00',
    discount_total: '0.00',
    tax_total: '0.00',
    total: '250.00',
    issue_date: '2026-11-02T00:00:00+00:00',
    due_date: null,
    notes: null,
    created_at: '2026-11-02T00:00:00+00:00',
    outstanding_amount: '250.00',
  };

  const issuedInvoiceB = {
    id: 'invoice-issued-b',
    business_id: 'business-b',
    customer_id: 'customer-b',
    invoice_number: 'INV-ISSUED-B',
    status: 'issued',
    currency_code: 'EGP',
    subtotal: '400.00',
    discount_total: '0.00',
    tax_total: '0.00',
    total: '400.00',
    issue_date: '2026-11-03T00:00:00+00:00',
    due_date: null,
    notes: null,
    created_at: '2026-11-03T00:00:00+00:00',
    outstanding_amount: '400.00',
  };

  const invoiceRows: Record<string, Array<Record<string, unknown>>> = {
    'business-a': [draftInvoice, issuedInvoiceA],
    'business-b': [issuedInvoiceB],
  };

  const paymentRows: Record<string, Array<Record<string, unknown>>> = {
    'business-a': [],
    'business-b': [],
  };

  const dashboard = {
    period: {
      start_date: '2026-10-10',
      end_date: '2026-11-09',
      timezone: 'Africa/Cairo',
    },
    invoiced_sales: [],
    collected_payments: [],
    expenses: [],
    outstanding_balances: [],
  };

  const invoiceDetail = (invoice: Record<string, unknown>) => ({
    ...invoice,
    lines: [{
      id: 'line-product-a',
      product_id: 'product-a',
      description: 'Catalog Product',
      quantity: '2',
      unit_price: '25.00',
      line_total: '50.00',
    }, {
      id: 'line-service-a',
      product_id: null,
      description: 'Installation service',
      quantity: '1',
      unit_price: '50.00',
      line_total: '50.00',
    }],
  });

  page.on('pageerror', error => uncaughtErrors.push(error.message));
  await page.addInitScript(() => window.localStorage.setItem('aba-language', 'en'));
  if (options.popupBlocked) {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'open', {
        configurable: true,
        value: () => null,
      });
    });
  }

  // Every external service is mocked. Unknown hosts are blocked, so these tests
  // cannot contact production Firebase, the live API, or a real workspace.
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
    const method = request.method();

    if (method === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }

    let body: unknown;
    if (method !== 'GET' && method !== 'HEAD') {
      try { body = request.postDataJSON(); } catch { body = undefined; }
    }
    apiRequests.push({
      path,
      method,
      authorization: request.headers()['authorization'],
      body,
    });

    if (path === '/version' && method === 'GET') {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        body: JSON.stringify({ version: 'e2e', commit: 't38-behavior', environment: 'test' }),
      });
      return;
    }

    if (path === '/api/v1/platform-admin/access' && method === 'GET') {
      await route.fulfill({
        status: 403,
        headers: corsHeaders,
        body: JSON.stringify({ detail: 'Platform administrator access is not granted.' }),
      });
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

    if (resource === 'customers' && method === 'GET') {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        body: JSON.stringify(customersByBusiness[businessId] ?? []),
      });
      return;
    }

    if (resource === 'products' && method === 'GET') {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        body: JSON.stringify(productsByBusiness[businessId] ?? []),
      });
      return;
    }

    if (resource === 'invoices' && method === 'GET') {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        body: JSON.stringify(invoiceRows[businessId] ?? []),
      });
      return;
    }

    if (resource === 'payments' && method === 'GET') {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        body: JSON.stringify(paymentRows[businessId] ?? []),
      });
      return;
    }

    if (resource === 'expenses' && method === 'GET') {
      await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify([]) });
      return;
    }

    const invoiceDetailMatch = resource.match(/^invoices\/([^/]+)$/);
    if (invoiceDetailMatch && method === 'GET') {
      const invoiceId = invoiceDetailMatch[1];
      if (businessId === 'business-a' && invoiceId === 'invoice-issued-a' && options.deferInvoiceDetail) {
        invoiceDetailStarted.resolve();
        await invoiceDetailGate.promise;
      }

      if (businessId === 'business-a' && invoiceId === 'invoice-issued-a') {
        await route.fulfill({
          status: 200,
          headers: corsHeaders,
          body: JSON.stringify(invoiceDetail(issuedInvoiceA)),
        });
        return;
      }

      if (businessId === 'business-a' && invoiceId === 'invoice-created-a' && createdInvoice) {
        await route.fulfill({
          status: 200,
          headers: corsHeaders,
          body: JSON.stringify(invoiceDetail(createdInvoice)),
        });
        return;
      }

      await route.fulfill({
        status: 404,
        headers: corsHeaders,
        body: JSON.stringify({ detail: 'Invoice not found.' }),
      });
      return;
    }

    if (resource === 'invoices' && method === 'POST') {
      const payload = (body ?? {}) as Record<string, unknown>;
      invoiceCreateRequests.push(payload);
      createdInvoice = {
        id: 'invoice-created-a',
        business_id: businessId,
        customer_id: payload.customer_id,
        invoice_number: payload.invoice_number,
        status: 'draft',
        currency_code: 'EGP',
        subtotal: '777.77',
        discount_total: '0.00',
        tax_total: '0.00',
        total: '777.77',
        issue_date: null,
        due_date: null,
        notes: null,
        created_at: '2026-11-09T00:00:00+00:00',
        outstanding_amount: null,
      };
      invoiceRows[businessId] = [...(invoiceRows[businessId] ?? []), createdInvoice];
      await route.fulfill({
        status: 201,
        headers: corsHeaders,
        body: JSON.stringify(createdInvoice),
      });
      return;
    }

    if (invoiceDetailMatch && method === 'PATCH' && invoiceDetailMatch[1] === 'invoice-created-a') {
      const payload = (body ?? {}) as Record<string, unknown>;
      invoiceUpdateRequests.push(payload);
      createdInvoice = {
        ...(createdInvoice ?? {}),
        invoice_number: payload.invoice_number,
        customer_id: payload.customer_id,
        subtotal: '888.88',
        discount_total: '0.00',
        tax_total: '0.00',
        total: '888.88',
      };
      invoiceRows[businessId] = (invoiceRows[businessId] ?? []).map(item =>
        item.id === 'invoice-created-a' ? createdInvoice as Record<string, unknown> : item
      );
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        body: JSON.stringify(createdInvoice),
      });
      return;
    }

    if (resource === 'payments' && method === 'POST' && businessId === 'business-a') {
      const payload = (body ?? {}) as Record<string, unknown>;
      paymentRequests.push(payload);

      if (paymentRequests.length === 1) {
        paymentStarted.resolve();
        if (options.deferFirstPayment) await paymentGate.promise;
        paymentCommitCount += 1;
        committedPayment = {
          id: 'payment-a',
          business_id: 'business-a',
          customer_id: payload.customer_id,
          amount: payload.amount,
          currency_code: payload.currency_code,
          received_at: '2026-11-09T00:00:00+00:00',
          method: payload.method,
          reference: payload.reference ?? null,
          allocations: [{
            id: 'allocation-a',
            invoice_id: 'invoice-issued-a',
            amount: '100.00',
          }],
        };
        paymentRows['business-a'] = [committedPayment];

        if (options.deferFirstPayment) {
          // Simulate a committed request whose response was lost. The retry must
          // preserve the exact original payload and idempotency key.
          await route.fulfill({
            status: 503,
            headers: corsHeaders,
            body: JSON.stringify({ detail: 'Temporary response failure after commit.' }),
          });
          return;
        }
      } else {
        const samePayload = JSON.stringify(paymentRequests[0]) === JSON.stringify(payload);
        if (!samePayload) {
          await route.fulfill({
            status: 409,
            headers: corsHeaders,
            body: JSON.stringify({ detail: 'Retry payload changed.' }),
          });
          return;
        }
      }

      await route.fulfill({
        status: 201,
        headers: corsHeaders,
        body: JSON.stringify(committedPayment),
      });
      return;
    }

    if (method === 'GET') {
      await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify([]) });
      return;
    }

    await route.fulfill({
      status: 404,
      headers: corsHeaders,
      body: JSON.stringify({ detail: 'Unexpected mocked API request: ' + method + ' ' + path }),
    });
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Welcome back/ })).toBeVisible({ timeout: 20_000 });
  await page.getByLabel('Email address').fill('owner@example.test');
  await page.getByLabel('Password').fill('mock-password-123');

  // The workspace name renders before loadWorkspaceData() finishes its parallel
  // dashboard/customer/product/invoice/payment/expense requests. Wait for the
  // complete initial data set so each scenario starts from a deterministic state.
  const initialWorkspaceDataPaths = [
    '/api/v1/businesses',
    '/api/v1/businesses/business-a/dashboard',
    '/api/v1/businesses/business-a/customers',
    '/api/v1/businesses/business-a/products',
    '/api/v1/businesses/business-a/invoices',
    '/api/v1/businesses/business-a/payments',
    '/api/v1/businesses/business-a/expenses',
  ];
  const initialWorkspaceResponses = initialWorkspaceDataPaths.map(path =>
    page.waitForResponse(response =>
      response.request().method() === 'GET' &&
      new URL(response.url()).pathname === path &&
      response.ok()
    )
  );

  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('#workspace-current-name')).toHaveText('Demo Retail', { timeout: 20_000 });
  await Promise.all(initialWorkspaceResponses);
  await page.getByRole('button', { name: 'Invoices', exact: true }).click();
  await expect(
    page.locator('.invoice-table tbody tr').filter({ hasText: 'INV-ISSUED-A' })
  ).toBeVisible();

  return {
    apiRequests,
    invoiceCreateRequests,
    invoiceUpdateRequests,
    paymentRequests,
    invoiceDetailStarted: invoiceDetailStarted.promise,
    releaseInvoiceDetail: invoiceDetailGate.resolve,
    paymentStarted: paymentStarted.promise,
    releaseFirstPayment: paymentGate.resolve,
    getPaymentCommitCount: () => paymentCommitCount,
    uncaughtErrors,
  };
}

async function openInvoices(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Invoices', exact: true }).click();
  await expect(page.locator('#invoices-section-heading')).toBeVisible();
}

test('OWNER creates and edits a mixed product/service draft using server-returned totals', async ({ page }) => {
  const harness = await setupOwner(page);
  await openInvoices(page);

  await page.locator('.invoice-create-disclosure summary').click();
  const editor = page.locator('aba-invoice-draft-editor');
  await editor.locator('input[name="invoiceNumber"]').fill('T38-E2E-001');
  await editor.locator('select[name="customerId"]').selectOption('customer-a');
  await editor.locator('select[name^="product-"]').first().selectOption('product-a');
  await editor.locator('input[name^="quantity-"]').first().fill('2');
  await expect(editor.locator('.server-summary')).toHaveCount(0);

  await editor.getByRole('button', { name: '+ Service' }).click();
  const serviceLine = editor.locator('.line-card').nth(1);
  await serviceLine.locator('input[name^="description-"]').fill('Installation service');
  await serviceLine.locator('input[name^="price-"]').fill('50.00');
  await serviceLine.locator('input[name^="quantity-"]').fill('1');
  await editor.getByRole('button', { name: 'Save invoice draft' }).click();

  await expect(editor.getByText(/777\.77 EGP/)).toBeVisible();
  expect(harness.invoiceCreateRequests).toHaveLength(1);
  const createPayload = harness.invoiceCreateRequests[0];
  expect(createPayload.invoice_number).toBe('T38-E2E-001');
  expect(createPayload.customer_id).toBe('customer-a');
  expect(createPayload.lines).toEqual(expect.arrayContaining([
    expect.objectContaining({ product_id: 'product-a', quantity: '2' }),
    expect.objectContaining({
      description: 'Installation service',
      unit_price: '50.00',
      quantity: '1',
    }),
  ]));
  for (const forbidden of ['subtotal', 'discount_total', 'tax_total', 'total']) {
    expect(createPayload).not.toHaveProperty(forbidden);
  }

  const createdInvoiceRow = page.locator('.invoice-table tbody tr').filter({ hasText: 'T38-E2E-001' });
  await createdInvoiceRow.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(editor.getByRole('heading', { name: 'Edit invoice draft' })).toBeVisible();
  await editor.locator('.line-card').nth(1).locator('input[name^="description-"]').fill('Updated installation service');
  await editor.getByRole('button', { name: 'Save invoice draft' }).click();

  await expect(editor.getByText(/888\.88 EGP/)).toBeVisible();
  expect(harness.invoiceUpdateRequests).toHaveLength(1);
  expect(harness.apiRequests.some(item =>
    item.method === 'PATCH' && item.path === '/api/v1/businesses/business-a/invoices/invoice-created-a'
  )).toBe(true);
  expect(harness.invoiceUpdateRequests[0].lines).toEqual(expect.arrayContaining([
    expect.objectContaining({
      description: 'Updated installation service',
      unit_price: '50.00',
      quantity: '1',
    }),
  ]));
  expect(harness.uncaughtErrors).toEqual([]);
});

test('popup-blocked printing shows a recoverable message and performs no invoice-detail request or write', async ({ page }) => {
  const harness = await setupOwner(page, { popupBlocked: true });
  await openInvoices(page);

  await page.getByRole('button', { name: 'Print', exact: true }).click();
  await expect(page.getByText('Allow pop-ups for printing, then try again.')).toBeVisible();

  expect(harness.apiRequests.some(item =>
    item.method === 'GET' && item.path === '/api/v1/businesses/business-a/invoices/invoice-issued-a'
  )).toBe(false);
  expect(harness.apiRequests.filter(item =>
    ['POST', 'PATCH', 'PUT', 'DELETE'].includes(item.method)
  )).toHaveLength(0);
  expect(harness.uncaughtErrors).toEqual([]);
});

test('late invoice detail is discarded and its print window closes after a workspace switch', async ({ page }) => {
  const harness = await setupOwner(page, { deferInvoiceDetail: true });
  await openInvoices(page);

  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Print', exact: true }).click();
  const popup = await popupPromise;
  await harness.invoiceDetailStarted;

  await page.locator('.workspace-bar select').selectOption('business-b');
  await expect(page.locator('#workspace-current-name')).toHaveText('Beta Retail');
  await expect(page.getByText('Beta Customer')).toBeVisible();

  harness.releaseInvoiceDetail();
  await expect.poll(() => popup.isClosed()).toBe(true);
  await expect(page.getByText('Alpha Customer')).toHaveCount(0);
  expect(harness.apiRequests.some(item =>
    item.method === 'GET' && item.path === '/api/v1/businesses/business-b/invoices'
  )).toBe(true);
  expect(harness.uncaughtErrors).toEqual([]);
});

test('payment controls stay locked while pending and retry preserves the exact payload and idempotency key', async ({ page }) => {
  const harness = await setupOwner(page, { deferFirstPayment: true });
  await page.getByRole('button', { name: 'Payments', exact: true }).click();
  await expect(page.locator('form.payment-form')).toBeVisible();

  await page.getByLabel('Payment amount').fill('100.00');
  await page.getByLabel('Payment customer').selectOption('customer-a');
  await page.getByLabel('Payment method').selectOption('cash');
  await page.getByLabel('Invoice to allocate payment to').selectOption('invoice-issued-a');
  await page.getByLabel('Amount to allocate').fill('100.00');
  await page.getByRole('button', { name: 'Record payment' }).click();
  await harness.paymentStarted;

  await expect(page.getByLabel('Payment amount')).toBeDisabled();
  await expect(page.getByLabel('Payment customer')).toBeDisabled();
  await expect(page.getByLabel('Payment method')).toBeDisabled();
  await expect(page.getByLabel('Invoice to allocate payment to')).toBeDisabled();
  await expect(page.getByLabel('Amount to allocate')).toBeDisabled();

  await page.locator('.workspace-bar select').selectOption('business-b');
  await expect(page.locator('#workspace-current-name')).toHaveText('Demo Retail');
  await expect(page.getByText(
    'Finish saving the invoice draft or retry the pending payment before switching workspaces.'
  )).toBeVisible();

  harness.releaseFirstPayment();
  await expect(page.getByText(/The payment outcome is uncertain/)).toBeVisible();
  await expect(page.getByLabel('Payment customer')).toBeDisabled();
  await page.getByRole('button', { name: 'Retry same payment' }).click();
  await expect(page.getByText('Payment recorded successfully.')).toBeVisible();

  expect(harness.paymentRequests).toHaveLength(2);
  expect(harness.paymentRequests[1]).toEqual(harness.paymentRequests[0]);
  expect(harness.paymentRequests[0].idempotency_key).toBeTruthy();
  expect(harness.paymentRequests[1].idempotency_key).toBe(harness.paymentRequests[0].idempotency_key);
  expect(harness.getPaymentCommitCount()).toBe(1);
  expect(harness.apiRequests.some(item => item.path.startsWith('/api/v1/businesses/business-b/'))).toBe(false);
  expect(harness.uncaughtErrors).toEqual([]);
});
