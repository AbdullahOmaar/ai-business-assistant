import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Import-commit timeout unknown outcome: when a mutating CSV import commit
// (importProductCsv / importCustomerCsv) rejects with the 15s abort, the
// confirm handlers must show an unknown-outcome message — the import may or
// may not have completed; check the list before retrying; do not retry
// blindly — and refresh the list so the user can see whether the rows
// landed. Preview timeouts are unchanged (preview commits nothing).
//
// Like api.service-transport.spec.ts, the confirm methods are exercised from
// their source text: each method (and the timeout detector) is transpiled and
// run in a VM bound to stubbed component state, so a timeout rejection is a
// real behavioral failure, not a source-text assertion.

const en = JSON.parse(
  readFileSync(new URL('../../public/i18n/en.json', import.meta.url), 'utf8'),
) as { ui: Record<string, string> };
const ar = JSON.parse(
  readFileSync(new URL('../../public/i18n/ar.json', import.meta.url), 'utf8'),
) as { ui: Record<string, string> };

const PRODUCT_KEY = 'ui.m_1y0hb3';
const CUSTOMER_KEY = 'ui.m_iwxc3c';
const PRODUCT_TEXT =
  'The import may or may not have completed — the request timed out. Check the product list before importing again; do not retry blindly.';
const CUSTOMER_TEXT =
  'The import may or may not have completed — the request timed out. Check the customer list before importing again; do not retry blindly.';

const source = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8');

function methodSource(startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `Unable to locate method: ${startMarker}`);
  return source.slice(start, end);
}

function loadFunction(name: string, src: string): (...args: unknown[]) => unknown {
  const fnSrc = src
    .replace(`async ${name}`, `async function ${name}`)
    .replace(`private ${name}`, `function ${name}`);
  const transpiled = ts.transpileModule(fnSrc, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return runInNewContext(`${transpiled}\n${name};`, {}) as (...args: unknown[]) => unknown;
}

function translate(key: string, params?: Record<string, string | number>): string {
  const short = key.startsWith('ui.') ? key.slice(3) : key;
  let text = en.ui[short] ?? key;
  for (const [param, value] of Object.entries(params ?? {})) {
    text = text.replaceAll(`{{${param}}}`, String(value));
  }
  return text;
}

function timeoutError(variant: 'request' | 'response'): Error {
  return new Error(
    variant === 'request'
      ? 'API_CONNECTION_FAILED: The request timed out. Check the connection and retry.'
      : 'API_CONNECTION_FAILED: The response timed out. Check the connection and retry.',
  );
}

async function withWatchdog<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) =>
      setTimeout(() => reject(new Error('test timed out waiting for the confirm method to settle')), 2000),
    ),
  ]);
}

// The timeout detector is loaded from source when present (after the repair);
// before the repair it does not exist yet, so the stub throws if ever called.
// The unrepaired confirm methods never call it, so the behavioral tests below
// still fail on their own assertions, not on the loader.
function loadTimeoutDetector(): (error: unknown) => boolean {
  const marker = '  private isTimeoutError(error: unknown): boolean {';
  const start = source.indexOf(marker);
  if (start < 0) {
    return () => {
      throw new Error('isTimeoutError not found in app.component.ts source');
    };
  }
  const endMarker = "  private message(error: unknown, context: 'auth' | 'api' = 'api'): string {";
  const end = source.indexOf(endMarker, start);
  assert.ok(end > start, 'Unable to locate message() after isTimeoutError');
  const fn = loadFunction('isTimeoutError', source.slice(start, end));
  return (error: unknown) => fn(error) as boolean;
}

const confirmProductSource = methodSource(
  '  async confirmProductImport(): Promise<void> {',
  '  async onCustomerImportFileSelected(event: Event): Promise<void> {',
);
const confirmCustomerSource = methodSource(
  '  async confirmCustomerImport(): Promise<void> {',
  '  importErrorLabel(code: string): string {',
);
const isTimeoutError = loadTimeoutDetector();

function makeProductHarness(importBehaviour: (businessId: string, csv: string) => Promise<unknown>) {
  const productsCalls: string[] = [];
  const setPageCalls: { id: string }[][] = [];
  const state = {
    business: { id: 'biz-1', role: 'owner' },
    importCsvText: 'name,sku\nA,1\n',
    importPreview: { valid: true, row_count: 1 },
    importLoading: false,
    importMessage: '',
    importMessageKind: 'success',
    error: '',
    products: [] as { id: string }[],
    invoiceProductId: null as string | null,
    productRefreshRequest: 0,
    api: {
      importProductCsv: importBehaviour,
      products: async (businessId: string) => {
        productsCalls.push(businessId);
        return [{ id: 'p1', name: 'A' }];
      },
    },
    t: translate,
    message: (error: unknown) =>
      'mapped:' + (error instanceof Error ? error.message : String(error ?? '')),
    setProductPage: (page: { id: string }[]) => {
      setPageCalls.push(page);
      state.products = page;
    },
    isTimeoutError,
  };
  return { state, productsCalls, setPageCalls };
}

function makeCustomerHarness(importBehaviour: (businessId: string, csv: string) => Promise<unknown>) {
  const customersCalls: string[] = [];
  const setPageCalls: { id: string }[][] = [];
  const state = {
    business: { id: 'biz-1', role: 'owner' },
    customerImportCsvText: 'name,email\nA,a@example.test\n',
    customerImportPreview: { valid: true, row_count: 1 },
    customerImportLoading: false,
    customerImportMessage: '',
    customerImportMessageKind: 'success',
    error: '',
    customers: [] as { id: string }[],
    invoiceCustomerId: null as string | null,
    customerRefreshRequest: 0,
    api: {
      importCustomerCsv: importBehaviour,
      customers: async (businessId: string) => {
        customersCalls.push(businessId);
        return [{ id: 'c1', name: 'A' }];
      },
    },
    t: translate,
    message: (error: unknown) =>
      'mapped:' + (error instanceof Error ? error.message : String(error ?? '')),
    setCustomerPage: (page: { id: string }[]) => {
      setPageCalls.push(page);
      state.customers = page;
    },
    isTimeoutError,
  };
  return { state, customersCalls, setPageCalls };
}

test('unknown-outcome keys exist in both dictionaries with the expected text', () => {
  assert.equal(en.ui['m_1y0hb3'], PRODUCT_TEXT);
  assert.equal(en.ui['m_iwxc3c'], CUSTOMER_TEXT);
  assert.ok(
    ar.ui['m_1y0hb3']?.includes('قائمة المنتجات'),
    'Arabic product key must name the product list',
  );
  assert.ok(
    ar.ui['m_iwxc3c']?.includes('قائمة العملاء'),
    'Arabic customer key must name the customer list',
  );
  assert.notEqual(ar.ui['m_1y0hb3'], PRODUCT_TEXT);
  assert.notEqual(ar.ui['m_iwxc3c'], CUSTOMER_TEXT);
});

test('product import timeout shows the unknown-outcome message and refreshes the product list', async () => {
  const h = makeProductHarness(async () => { throw timeoutError('request'); });
  const fn = loadFunction('confirmProductImport', confirmProductSource);
  await withWatchdog((fn as (this: unknown) => Promise<void>).call(h.state));
  assert.equal(
    h.state.error,
    PRODUCT_TEXT,
    'a timeout must not show the auth/config timeout wording or a blind-retry prompt',
  );
  assert.deepEqual(h.productsCalls, ['biz-1'], 'the product list must be re-fetched on the timeout path');
  assert.equal(h.setPageCalls.length, 1, 'the refreshed page must be applied');
  assert.deepEqual(h.setPageCalls[0], [{ id: 'p1', name: 'A' }]);
  assert.equal(h.state.productRefreshRequest, 1, 'the workspace refresh must be requested on the timeout path');
  assert.equal(h.state.invoiceProductId, 'p1');
  assert.equal(h.state.importLoading, false);
  assert.equal(h.state.importCsvText, 'name,sku\nA,1\n', 'the file stays loaded so the user can retry after checking');
  assert.equal(h.state.importPreview?.valid, true, 'the preview stays valid so the user can retry after checking');
  assert.equal(h.state.importMessage, '', 'no success message is shown for an unknown outcome');
});

test('customer import timeout shows the unknown-outcome message and refreshes the customer list', async () => {
  const h = makeCustomerHarness(async () => { throw timeoutError('response'); });
  const fn = loadFunction('confirmCustomerImport', confirmCustomerSource);
  await withWatchdog((fn as (this: unknown) => Promise<void>).call(h.state));
  assert.equal(
    h.state.error,
    CUSTOMER_TEXT,
    'a timeout must not show the auth/config timeout wording or a blind-retry prompt',
  );
  assert.deepEqual(h.customersCalls, ['biz-1'], 'the customer list must be re-fetched on the timeout path');
  assert.equal(h.setPageCalls.length, 1, 'the refreshed page must be applied');
  assert.deepEqual(h.setPageCalls[0], [{ id: 'c1', name: 'A' }]);
  assert.equal(h.state.customerRefreshRequest, 1, 'the workspace refresh must be requested on the timeout path');
  assert.equal(h.state.invoiceCustomerId, 'c1');
  assert.equal(h.state.customerImportLoading, false);
  assert.equal(h.state.customerImportCsvText, 'name,email\nA,a@example.test\n', 'the file stays loaded so the user can retry after checking');
  assert.equal(h.state.customerImportPreview?.valid, true, 'the preview stays valid so the user can retry after checking');
  assert.equal(h.state.customerImportMessage, '', 'no success message is shown for an unknown outcome');
});

test('non-timeout import errors keep the mapped error and do not refresh the list', async () => {
  const h = makeProductHarness(async () => { throw new Error('CSV validation failed: row 2 name required'); });
  const fn = loadFunction('confirmProductImport', confirmProductSource);
  await withWatchdog((fn as (this: unknown) => Promise<void>).call(h.state));
  assert.equal(h.state.error, 'mapped:CSV validation failed: row 2 name required');
  assert.deepEqual(h.productsCalls, [], 'a non-timeout error must not trigger a list refresh');
  assert.equal(h.setPageCalls.length, 0);
  assert.equal(h.state.importLoading, false);
});
