import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const componentSource = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8');
const sourceFile = ts.createSourceFile('app.component.ts', componentSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const appClass = sourceFile.statements.find(
  (statement): statement is ts.ClassDeclaration =>
    ts.isClassDeclaration(statement) && statement.name?.text === 'AppComponent'
);
assert.ok(appClass, 'AppComponent class must exist');

function extractComponent(methodNames: string[], windowObject: Record<string, unknown> = {}) {
  const methods = methodNames.map(name => {
    const method = appClass.members.find(
      member => ts.isMethodDeclaration(member) && ts.isIdentifier(member.name) && member.name.text === name
    );
    assert.ok(method, 'AppComponent.' + name + ' must exist');
    return method.getText(sourceFile);
  });
  const wrapper = 'class ExtractedAppComponent {\n' + methods.join('\n') +
    '\n}\nthis.ExtractedAppComponent = ExtractedAppComponent;';
  const context: Record<string, unknown> = { window: windowObject };
  runInNewContext(ts.transpile(wrapper, {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.None,
  }), context);
  const Extracted = context.ExtractedAppComponent as new () => Record<string, any>;
  return new Extracted();
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function makePrintWindow() {
  const writes: string[] = [];
  let closed = false;
  let focused = false;
  const printWindow = {
    document: {
      open() {},
      write(value: string) { writes.push(value); },
      close() {},
    },
    onload: undefined as (() => void) | undefined,
    focus() { focused = true; },
    print() {},
    close() { closed = true; },
  };
  return {
    printWindow,
    writes,
    isClosed: () => closed,
    isFocused: () => focused,
  };
}

function makePrintComponent(windowObject: Record<string, unknown>, detailPromise: Promise<any>) {
  const component = extractComponent(['printInvoice', 'escapePrintHtml'], windowObject);
  Object.assign(component, {
    business: { id: 'business-a', name: 'Shop <One>', currency_code: 'EGP' },
    language: 'ar',
    loading: false,
    error: '',
    api: { invoiceDetail: () => detailPromise },
    customerNameForInvoice: () => 'Customer <One>',
    t: (_arabic: string, english: string) => english,
    message: (error: unknown) => error instanceof Error ? error.message : String(error),
  });
  return component;
}

function issuedInvoiceDetail() {
  return {
    id: 'invoice-a',
    status: 'issued',
    invoice_number: 'INV <100>',
    customer_id: 'customer-a',
    currency_code: 'EGP',
    subtotal: '10.00',
    discount_total: '0.00',
    tax_total: '0.00',
    total: '10.00',
    issue_date: '2026-11-01T00:00:00Z',
    due_date: null,
    notes: '<script>alert(1)</script>',
    lines: [{
      description: '<img src=x onerror=alert(1)>',
      quantity: '1.000',
      unit_price: '10.00',
      line_total: '10.00',
    }],
  };
}

function makePaymentComponent(api: Record<string, (...args: any[]) => any>) {
  const component = extractComponent(['createPayment']);
  Object.assign(component, {
    business: { id: 'business-a', currency_code: 'EGP' },
    paymentAmount: '7.00',
    paymentCustomerId: 'customer-a',
    paymentAllocations: [{ invoiceId: 'invoice-a', amount: '4.00' }],
    paymentMethod: 'cash',
    paymentReference: 'receipt-7',
    paymentSaving: false,
    loading: false,
    paymentIdempotencyKey: '',
    paymentMessage: '',
    paymentError: false,
    error: '',
    t: (_arabic: string, english: string) => english,
    message: (error: unknown) => error instanceof Error ? error.message : String(error),
    validatePaymentAllocations: () => null,
    api,
  });
  return component;
}

const paymentRefreshApi = {
  payments: async () => [],
  dashboard: async () => ({}),
  invoices: async () => [],
};

test('popup-blocked invoice print returns before fetching or mutating invoice data', async () => {
  let fetches = 0;
  const component = makePrintComponent(
    { open: () => null },
    Promise.resolve(issuedInvoiceDetail())
  );
  component.api.invoiceDetail = async () => { fetches += 1; return issuedInvoiceDetail(); };

  await component.printInvoice({ id: 'invoice-a', status: 'issued' });

  assert.equal(fetches, 0);
  assert.equal(component.loading, false);
  assert.match(component.error, /pop-ups/i);
});

test('late invoice detail after a workspace switch closes the temporary window and writes nothing', async () => {
  const request = deferred<any>();
  const opened = makePrintWindow();
  const component = makePrintComponent({ open: () => opened.printWindow }, request.promise);

  const pending = component.printInvoice({ id: 'invoice-a', status: 'issued' });
  assert.equal(component.loading, true);
  component.business = { id: 'business-b', name: 'Other Shop', currency_code: 'USD' };
  request.resolve(issuedInvoiceDetail());
  await pending;

  assert.equal(opened.isClosed(), true);
  assert.equal(opened.writes.length, 0);
  assert.equal(component.loading, false);
});

test('invoice print renders server-returned totals and escapes untrusted saved fields', async () => {
  const opened = makePrintWindow();
  const component = makePrintComponent(
    { open: () => opened.printWindow },
    Promise.resolve(issuedInvoiceDetail())
  );

  await component.printInvoice({ id: 'invoice-a', status: 'issued' });

  assert.equal(opened.writes.length, 1);
  const html = opened.writes[0];
  assert.match(html, /10\.00 EGP/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /INV &lt;100&gt;/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.equal(opened.isFocused(), true);
});

test('pending payment submission is single-flight until the request settles', async () => {
  const request = deferred<any>();
  let calls = 0;
  const api = {
    ...paymentRefreshApi,
    createPayment: () => { calls += 1; return request.promise; },
  };
  const component = makePaymentComponent(api);

  const first = component.createPayment();
  assert.equal(component.paymentSaving, true);
  await component.createPayment();
  assert.equal(calls, 1);

  request.resolve({});
  await first;
  assert.equal(component.paymentSaving, false);
  assert.equal(component.loading, false);
});

test('uncertain payment retry preserves the same idempotency key and identical payload', async () => {
  const payloads: any[] = [];
  let calls = 0;
  const api = {
    ...paymentRefreshApi,
    createPayment: async (_businessId: string, payload: any) => {
      payloads.push(JSON.parse(JSON.stringify(payload)));
      calls += 1;
      if (calls === 1) throw new Error('network timeout');
      return {};
    },
  };
  const component = makePaymentComponent(api);

  await component.createPayment();
  const retainedKey = component.paymentIdempotencyKey;
  assert.ok(retainedKey);
  assert.equal(component.paymentAmount, '7.00');
  assert.equal(component.paymentCustomerId, 'customer-a');

  await component.createPayment();

  assert.equal(payloads.length, 2);
  assert.equal(payloads[0].idempotency_key, retainedKey);
  assert.deepEqual(payloads[1], payloads[0]);
  assert.equal(component.paymentIdempotencyKey, '');
});

test('late payment success after a workspace identity switch does not overwrite the new workspace form', async () => {
  const request = deferred<any>();
  const api = {
    ...paymentRefreshApi,
    createPayment: () => request.promise,
  };
  const component = makePaymentComponent(api);

  const pending = component.createPayment();
  assert.equal(component.paymentSaving, true);
  component.business = { id: 'business-b', currency_code: 'USD' };
  component.paymentAmount = '12.00';
  component.paymentCustomerId = 'customer-b';
  component.paymentReference = 'new workspace entry';
  request.resolve({});
  await pending;

  assert.equal(component.paymentAmount, '12.00');
  assert.equal(component.paymentCustomerId, 'customer-b');
  assert.equal(component.paymentReference, 'new workspace entry');
  assert.equal(component.paymentSaving, false);
  assert.equal(component.loading, false);
});

test('workspace switching is rejected while a payment mutation is pending', async () => {
  const component = extractComponent(['switchBusiness']);
  let workspaceLoads = 0;
  const currentBusiness = { id: 'business-a', name: 'Current', currency_code: 'EGP' };
  Object.assign(component, {
    paymentSaving: true,
    business: currentBusiness,
    businesses: [currentBusiness, { id: 'business-b', name: 'Other', currency_code: 'USD' }],
    selectedBusinessId: 'business-a',
    loadWorkspaceData: async () => { workspaceLoads += 1; },
  });

  await component.switchBusiness('business-b');

  assert.equal(component.business, currentBusiness);
  assert.equal(component.selectedBusinessId, 'business-a');
  assert.equal(workspaceLoads, 0);
});
