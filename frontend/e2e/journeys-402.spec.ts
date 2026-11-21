import { expect, test, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

const apiBaseUrl = 'https://mock-api.test';
const projectId = 'mock-project';
const ownerUid = 'workspace-owner-uid';
const idToken = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJhdWQiOiJtb2NrLXByb2plY3QiLCJpc3MiOiJodHRwczovL3NlY3VyZXRva2VuLmdvb2dsZS5jb20vbW9jay1wcm9qZWN0Iiwic3ViIjoid29ya3NwYWNlLW93bmVyLXVpZCIsInVpZCI6IndvcmtzcGFjZS1vd25lci11aWQiLCJleHAiOjQ5MDAwMDAwMDB9.signature';

type ApiRequest = { path: string; method: string; body?: unknown };

async function setupJourneys(page: Page, initialPath: string, initialOrderStatus: 'draft' | 'approved' = 'approved') {
  const apiRequests: ApiRequest[] = [];
  const uncaughtErrors: string[] = [];
  let orderStatus = initialOrderStatus;
  const expenses: Array<Record<string, unknown>> = [];
  const employees: Array<Record<string, unknown>> = [];
  const payrolls: Array<Record<string, unknown>> = [];

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
      unit_cost: '100.00', received_quantity: orderStatus === 'received' ? '2.000' : '0.000',
      remaining_quantity: orderStatus === 'received' ? '0.000' : '2.000',
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
        status: 200, headers: firebaseHeaders,
        body: JSON.stringify({
          kind: 'identitytoolkit#VerifyPasswordResponse', localId: ownerUid, email: 'owner@example.test',
          displayName: 'Workspace Owner', idToken, refreshToken: 'mock-refresh-token', expiresIn: '3600', registered: true,
        }),
      });
      return;
    }
    if (pathname.endsWith('/accounts:lookup')) {
      await route.fulfill({
        status: 200, headers: firebaseHeaders,
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
      status: 200, headers: firebaseHeaders,
      body: JSON.stringify({
        access_token: idToken, id_token: idToken, expires_in: '3600',
        token_type: 'Bearer', refresh_token: 'mock-refresh-token', user_id: ownerUid, project_id: projectId,
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
      await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify({ version: 'journeys-e2e', commit: 'mock', environment: 'test' }) });
      return;
    }
    if (path === '/api/v1/platform-admin/access' && method === 'GET') {
      await route.fulfill({ status: 403, headers: corsHeaders, body: JSON.stringify({ detail: 'Platform administrator access is not granted.' }) });
      return;
    }
    if (path === '/api/v1/businesses' && method === 'GET') {
      await route.fulfill({
        status: 200, headers: corsHeaders,
        body: JSON.stringify([{ id: 'business-1', name: 'Demo Retail', currency_code: 'EGP', locale: 'en', timezone: 'Africa/Cairo', role: 'owner' }]),
      });
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
      await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify(businessId === 'business-1' ? [product] : []) });
      return;
    }
    if (resource === 'suppliers' && method === 'GET') {
      await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify(businessId === 'business-1' ? [supplier] : []) });
      return;
    }
    if (resource === 'expenses' && method === 'GET') {
      await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify(expenses) });
      return;
    }
    if (resource === 'expenses' && method === 'POST') {
      const created = {
        id: 'expense-1', business_id: businessId,
        ...(body as Record<string, unknown>),
        created_at: '2026-11-14T10:00:00Z',
      };
      expenses.unshift(created);
      await route.fulfill({ status: 201, headers: corsHeaders, body: JSON.stringify(created) });
      return;
    }
    if (resource === 'employees' && method === 'GET') {
      await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify(employees) });
      return;
    }
    if (resource === 'employees' && method === 'POST') {
      const created = {
        id: 'employee-1', business_id: businessId, is_active: true,
        created_at: '2026-11-14T10:00:00Z', updated_at: '2026-11-14T10:00:00Z',
        ...(body as Record<string, unknown>),
      };
      employees.unshift(created);
      await route.fulfill({ status: 201, headers: corsHeaders, body: JSON.stringify(created) });
      return;
    }
    if (resource === 'payroll' && method === 'GET') {
      await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify(payrolls) });
      return;
    }
    const payrollCreate = resource.match(/^employees\/([^/]+)\/payroll$/);
    if (payrollCreate && method === 'POST') {
      const employee = employees.find(item => item.id === payrollCreate[1]);
      const created = {
        id: 'payroll-1', business_id: businessId, employee_id: payrollCreate[1],
        employee_name: (employee?.name as string) ?? '', status: 'draft',
        base_salary: (employee?.monthly_salary as string) ?? '0',
        net_pay: (employee?.monthly_salary as string) ?? '0',
        expense_id: null, approved_by_subject: null, approved_at: null,
        paid_by_subject: null, paid_at: null, created_at: '2026-11-14T10:00:00Z',
        ...(body as Record<string, unknown>),
      };
      payrolls.unshift(created);
      await route.fulfill({ status: 201, headers: corsHeaders, body: JSON.stringify(created) });
      return;
    }
    if (resource === 'profit-loss' && method === 'GET') {
      await route.fulfill({
        status: 200, headers: corsHeaders,
        body: JSON.stringify({
          period: { type: 'custom', start_date: '2026-10-15', end_date: '2026-11-14', timezone: 'Africa/Cairo' },
          revenue_basis: 'issued_invoices',
          currencies: [{
            currency_code: 'EGP', revenue: '1000.00', revenue_invoice_count: 2,
            approved_return_total: '0.00', approved_return_count: 0,
            expenses: '250.00', expense_count: 1, operating_result_before_cost_of_goods: '750.00',
          }],
          limitations: [],
        }),
      });
      return;
    }
    if (resource === 'purchase-orders' && method === 'GET') {
      await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify(businessId === 'business-1' ? [purchaseOrder()] : []) });
      return;
    }
    const orderDetail = resource.match(/^purchase-orders\/([^/]+)$/);
    if (orderDetail && method === 'GET') {
      if (businessId !== 'business-1' || orderDetail[1] !== 'po-a') {
        await route.fulfill({ status: 404, headers: corsHeaders, body: JSON.stringify({ detail: 'Purchase order not found.' }) });
        return;
      }
      const order = purchaseOrder();
      await route.fulfill({
        status: 200, headers: corsHeaders,
        body: JSON.stringify({
          ...order,
          business_id: businessId,
          supplier,
          lines: order.lines.map(line => ({
            ...line,
            product: { id: product.id, name: product.name, sku: product.sku, unit: 'piece', is_active: true },
          })),
        }),
      });
      return;
    }
    const orderHistory = resource.match(/^purchase-orders\/([^/]+)\/(receipts|activity)$/);
    if (orderHistory && method === 'GET') {
      await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify({ items: [], limit: 50, offset: 0 }) });
      return;
    }
    const receive = resource.match(/^purchase-orders\/([^/]+)\/receive$/);
    if (receive && method === 'POST') {
      if (businessId !== 'business-1' || receive[1] !== 'po-a' || orderStatus !== 'approved') {
        await route.fulfill({ status: 422, headers: corsHeaders, body: JSON.stringify({ detail: 'Order cannot be received in its current state.' }) });
        return;
      }
      orderStatus = 'received';
      await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify(purchaseOrder()) });
      return;
    }
    if (resource === 'inventory/movements' && method === 'GET') {
      await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify({ items: [], limit: 50, offset: 0, has_more: false }) });
      return;
    }
    if (resource === 'sales-returns' && method === 'GET') {
      await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify({ items: [], limit: 100, offset: 0 }) });
      return;
    }
    if (resource === 'credit-notes' && method === 'GET') {
      await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify({ items: [], limit: 100, offset: 0 }) });
      return;
    }
    if (resource === 'reports/tax-summary' && method === 'GET') {
      await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify({ currencies: [], limitations: [] }) });
      return;
    }
    if (resource === 'audit-events' && method === 'GET') {
      await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify({ items: [], total: 0, offset: 0 }) });
      return;
    }
    if (resource === 'reports/data-integrity' && method === 'GET') {
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
    if (resource === 'operations/health' && method === 'GET') {
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
    if (method === 'GET') {
      await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify([]) });
      return;
    }
    await route.fulfill({ status: 404, headers: corsHeaders, body: JSON.stringify({ detail: 'Unexpected mocked API request: ' + method + ' ' + path }) });
  });

  await page.goto(initialPath);
  await expect(page.getByRole('heading', { name: /Welcome back/ })).toBeVisible({ timeout: 20_000 });
  await page.getByLabel('Email address').fill('owner@example.test');
  await page.getByLabel('Password').fill('mock-password-123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('#workspace-current-name')).toHaveText('Demo Retail', { timeout: 20_000 });
  return { apiRequests, uncaughtErrors, getOrderStatus: () => orderStatus };
}

test('OWNER receives an approved purchase order and the order becomes received', async ({ page }) => {
  const harness = await setupJourneys(page, '/workspace/purchases', 'approved');
  // The deep link already lands on the Purchasing tab at desktop widths (the
  // module-directory disclosure is a mobile-only element); assert the tab.
  await expect(page.getByRole('heading', { name: 'Purchasing', level: 1 })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('PO-2026-001')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'View details', exact: true }).click();
  await expect(page.locator('.pw__detail-head')).toBeVisible();
  await expect(page.locator('.pw__detail-head')).toContainText('PO-2026-001');
  await page.getByRole('button', { name: 'Record receipt', exact: true }).click();
  const receiptForm = page.locator('form.pw__receipt');
  await expect(receiptForm).toBeVisible();
  await expect(receiptForm.getByRole('spinbutton', { name: /Quantity to receive now/ })).toHaveValue('2.000');
  await receiptForm.getByRole('button', { name: 'Save receipt', exact: true }).click();
  const receiveRequests = harness.apiRequests.filter(item =>
    item.method === 'POST' && item.path === '/api/v1/businesses/business-1/purchase-orders/po-a/receive');
  await expect.poll(() => receiveRequests.length).toBe(1);
  expect(receiveRequests[0].body).toEqual({ lines: [{ line_id: 'po-line-a', quantity: '2.000' }] });
  expect(harness.getOrderStatus()).toBe('received');
  await expect(page.locator('.pw__detail-head')).toContainText('Received', { timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'Record receipt', exact: true })).toHaveCount(0);
  expect(harness.uncaughtErrors).toEqual([]);
});

test('OWNER records an expense and the new row appears in the list', async ({ page }) => {
  const harness = await setupJourneys(page, '/workspace/expenses');
  const expenseForm = page.locator('form.expense-form');
  await expect(expenseForm).toBeVisible({ timeout: 20_000 });
  await page.locator('select[name="expenseCategory"]').selectOption('General');
  await page.locator('input[name="expenseDescription"]').fill('Taxi to supplier');
  await page.locator('input[name="expenseAmount"]').fill('150.50');
  await page.locator('input[name="expenseVendor"]').fill('City Taxi');
  await page.locator('input[name="expenseReference"]').fill('EXP-1');
  await expenseForm.getByRole('button', { name: 'Save expense', exact: true }).click();
  const createRequests = harness.apiRequests.filter(item =>
    item.method === 'POST' && item.path === '/api/v1/businesses/business-1/expenses');
  await expect.poll(() => createRequests.length).toBe(1);
  expect(createRequests[0].body).toMatchObject({
    category: 'General', description: 'Taxi to supplier', amount: '150.5',
    currency_code: 'EGP', vendor_name: 'City Taxi', reference: 'EXP-1',
  });
  await expect(page.getByText('Taxi to supplier')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('150.5 EGP')).toBeVisible();
  expect(harness.uncaughtErrors).toEqual([]);
});

test('reports render the preliminary operating result from the profit-loss response', async ({ page }) => {
  const harness = await setupJourneys(page, '/workspace/reports');
  // The profit-loss report is loaded on demand, not on tab mount.
  await expect(page.getByRole('heading', { name: 'Preliminary operating result', level: 1 })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Run report', exact: true }).click();
  await expect(page.locator('aba-record-table')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.main')).toContainText('1000.00');
  await expect(page.locator('.main')).toContainText('250.00');
  await expect(page.locator('.main')).toContainText('750.00');
  await expect(page.locator('.main')).toContainText('EGP');
  expect(harness.uncaughtErrors).toEqual([]);
});

test('OWNER creates an employee and prepares a payroll draft', async ({ page }) => {
  const harness = await setupJourneys(page, '/workspace/employees');
  const employeeForm = page.locator('#employee-profile-form');
  await expect(employeeForm).toBeVisible({ timeout: 20_000 });
  await page.locator('input[name="employeeName"]').fill('Sara Ahmed');
  await page.locator('input[name="employeeCode"]').fill('EMP-01');
  await page.locator('input[name="employeeMonthlySalary"]').fill('12000');
  await employeeForm.locator('button[type="submit"]').click();
  const createRequests = harness.apiRequests.filter(item =>
    item.method === 'POST' && item.path === '/api/v1/businesses/business-1/employees');
  await expect.poll(() => createRequests.length).toBe(1);
  expect(createRequests[0].body).toMatchObject({ name: 'Sara Ahmed', employee_code: 'EMP-01', monthly_salary: '12000' });
  await expect(page.locator('.employee-panel')).toContainText('Sara Ahmed', { timeout: 20_000 });
  await expect(page.locator('.employee-panel')).toContainText('EMP-01');

  const payrollForm = page.locator('form.payroll-form');
  await expect(payrollForm).toBeVisible();
  await page.locator('select[name="payrollEmployeeId"]').selectOption('employee-1');
  await page.locator('input[name="payrollPeriod"]').fill('2026-11');
  await page.locator('input[name="payrollAllowances"]').fill('0');
  await page.locator('input[name="payrollBonuses"]').fill('0');
  await page.locator('input[name="payrollDeductions"]').fill('0');
  await payrollForm.locator('button[type="submit"]').click();
  const payrollRequests = harness.apiRequests.filter(item =>
    item.method === 'POST' && item.path === '/api/v1/businesses/business-1/employees/employee-1/payroll');
  await expect.poll(() => payrollRequests.length).toBe(1);
  expect(payrollRequests[0].body).toMatchObject({ period: '2026-11', allowances: '0', bonuses: '0', deductions: '0' });
  await expect(page.locator('[data-mobile-pane="history"]')).toContainText('2026-11', { timeout: 20_000 });
  expect(harness.uncaughtErrors).toEqual([]);
});
