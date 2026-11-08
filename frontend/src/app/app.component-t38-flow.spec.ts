import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { firstRecordPage, mergeRecordPage } from './record-filters.ts';
import test from 'node:test';

const source = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8');

function methodBetween(startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `Unable to locate method: ${startMarker}`);
  return source.slice(start, end);
}

test('invoice drafts use the dedicated mixed-line editor and never calculate browser totals', () => {
  assert.match(source, /<aba-invoice-draft-editor/);
  assert.match(source, /\(saveDraft\)="saveInvoiceDraft\(\$event\)"/);
  assert.doesNotMatch(source, /get invoicePreview\(/);
  assert.match(source, /serverSummary\]="invoiceDraftSummary"/);
});

test('invoice create and edit requests send mixed line payloads and display server-returned totals', () => {
  const save = methodBetween('async saveInvoiceDraft(payload: InvoiceDraftPayload)', 'private escapePrintHtml');
  assert.match(save, /this\.api\.createInvoice\(businessId, request\)/);
  assert.match(save, /this\.api\.updateDraftInvoice\(businessId, editingInvoiceId, request\)/);
  assert.match(save, /total: saved\.total/);
  const edit = methodBetween('async editInvoice(invoice: Invoice)', 'cancelInvoiceEdit(): void');
  assert.match(edit, /invoiceDraftLinesFromExisting\(detail\.lines\)/);
  assert.match(edit, /this\.invoiceEditRequestGuard\.begin\(\)/);
});

test('invoice draft mutations are fenced by workspace, user, role and auth generation', () => {
  const save = methodBetween('async saveInvoiceDraft(payload: InvoiceDraftPayload)', 'private escapePrintHtml');
  const edit = methodBetween('async editInvoice(invoice: Invoice)', 'cancelInvoiceEdit(): void');
  assert.match(save, /this\.isCurrentTenantOperation\(this\.invoiceSaveGuard/);
  assert.match(edit, /this\.isCurrentTenantOperation\(this\.invoiceEditRequestGuard/);
  assert.match(source, /authTransitionVersion: this\.authTransitionVersion/);
});


test('uncertain invoice writes are stored before mutation and verified without resubmission', () => {
  const save = methodBetween('async saveInvoiceDraft(payload: InvoiceDraftPayload)', 'async refreshInvoiceDraftStatus()');
  const store = save.indexOf('this.invoiceDraftOutcomeVault.save(authUid, outcomeSnapshot)');
  const write = save.indexOf('await this.api.createInvoice(businessId, request)');
  assert.ok(store >= 0 && write > store);
  assert.match(save, /this\.invoiceDraftUncertain = true/);
  assert.match(save, /error\.definitiveNoWrite/);
  const verify = methodBetween('async refreshInvoiceDraftStatus()', 'private escapePrintHtml');
  assert.match(verify, /this\.api\.invoices\(businessId\)/);
  assert.doesNotMatch(verify, /this\.api\.createInvoice/);
  assert.match(source, /\[blocked\]="invoiceDraftUncertain"/);
  assert.match(source, /\(refreshStatus\)="refreshInvoiceDraftStatus\(\)"/);
});

test('invoice outcome recovery is restored only for the same authenticated user and workspace', () => {
  assert.match(source, /this\.invoiceDraftOutcomeVault\.get\(this\.currentAuthUid, id\)/);
  assert.match(source, /this\.invoiceDraftUncertain = true/);
  const pay = methodBetween('payInvoice(invoice: Invoice)', 'async createExpense()');
  assert.match(pay, /this\.paymentRetryPending/);
});


test('issued invoice printing is read-only, status-checked and auth/workspace fenced', () => {
  const print = methodBetween('async printInvoice(invoice: Invoice)', 'async editInvoice(invoice: Invoice)');
  assert.match(print, /this\.signedIn/);
  assert.match(print, /this\.currentAuthUid/);
  assert.match(print, /this\.isCurrentTenantOperation\(this\.printRequestGuard/);
  assert.match(print, /detail\.status !== 'issued'/);
  assert.match(print, /printWindow\.close\(\)/);
});

test('issue and void mutations are Owner-only and auth/workspace fenced', () => {
  const issue = methodBetween('async issueInvoice(invoice: Invoice)', 'requestInvoiceVoid(');
  const voidFlow = methodBetween('async confirmInvoiceVoid()', 'hasOutstandingBalance(');
  assert.match(issue, /this\.business\.role !== 'owner'/);
  assert.match(issue, /this\.isCurrentTenantOperation\(this\.invoiceMutationGuard/);
  assert.match(voidFlow, /this\.business\.role !== 'owner'/);
  assert.match(voidFlow, /this\.isCurrentTenantOperation\(this\.invoiceMutationGuard/);
});


test('uncertain invoice edits recover by immutable invoice ID instead of the edited invoice number', () => {
  const verify = methodBetween('async refreshInvoiceDraftStatus()', 'private escapePrintHtml');
  assert.match(verify, /findInvoiceDraftRecoveryMatch\(invoices, pending\)/);
});

const componentSourceFile = ts.createSourceFile('app.component.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const componentClass = componentSourceFile.statements.find(
  (statement): statement is ts.ClassDeclaration =>
    ts.isClassDeclaration(statement) && statement.name?.text === 'AppComponent'
);
assert.ok(componentClass, 'AppComponent class must exist');

function extractPaginationMethods(methodNames: string[]): Record<string, any> {
  const methods = methodNames.map(name => {
    const method = componentClass.members.find(
      member => ts.isMethodDeclaration(member) && ts.isIdentifier(member.name) && member.name.text === name
    );
    assert.ok(method, 'AppComponent.' + name + ' must exist');
    return method.getText(componentSourceFile);
  });
  const wrapper = 'class ExtractedPaginationComponent {\\n' + methods.join('\\n') +
    '\\n}\\nthis.ExtractedPaginationComponent = ExtractedPaginationComponent;';
  const context: Record<string, unknown> = {
    firstRecordPage,
    mergeRecordPage,
    WORKSPACE_RECORD_PAGE_SIZE: 100,
  };
  runInNewContext(ts.transpile(wrapper, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }), context);
  const Extracted = context.ExtractedPaginationComponent as new () => Record<string, any>;
  return new Extracted();
}

test('workspace pagination appends a page and advances by the server offset', async () => {
  const component = extractPaginationMethods(['loadMoreRecords']);
  component.business = { id: 'business-1' };
  component.signedIn = true;
  component.currentAuthUid = 'user-1';
  component.captureTenantRequest = (businessId: string) => ({ businessId });
  component.isCurrentTenantOperation = (guard: any, version: number) => guard.isCurrent(version);
  component.message = (error: unknown) => String(error);
  component.error = '';

  const guard = {
    version: 0,
    begin() { return ++this.version; },
    isCurrent(version: number) { return version === this.version; },
    invalidate() { this.version += 1; },
  };
  let records = [{ id: 'existing' }];
  let offset = 100;
  let hasMore = true;
  let loading = false;
  await component.loadMoreRecords({
    guard,
    offset,
    hasMore,
    loading,
    fetchPage: async (businessId: string, requestedOffset: number) => {
      assert.equal(businessId, 'business-1');
      assert.equal(requestedOffset, 100);
      return [{ id: 'next' }];
    },
    getCurrentRecords: () => records,
    setRecords: (value: any[]) => { records = value; },
    setOffset: (value: number) => { offset = value; },
    setHasMore: (value: boolean) => { hasMore = value; },
    setLoading: (value: boolean) => { loading = value; },
  });

  assert.deepEqual(records, [{ id: 'existing' }, { id: 'next' }]);
  assert.equal(offset, 101);
  assert.equal(hasMore, false);
  assert.equal(loading, false);
});

test('workspace pagination ignores a late page after the workspace request is invalidated', async () => {
  const component = extractPaginationMethods(['loadMoreRecords']);
  component.business = { id: 'business-1' };
  component.signedIn = true;
  component.currentAuthUid = 'user-1';
  component.captureTenantRequest = (businessId: string) => ({ businessId });
  component.isCurrentTenantOperation = (guard: any, version: number) => guard.isCurrent(version);
  component.message = (error: unknown) => String(error);
  component.error = '';

  let resolvePage!: (records: Array<{ id: string }>) => void;
  const guard = {
    version: 0,
    begin() { return ++this.version; },
    isCurrent(version: number) { return version === this.version; },
    invalidate() { this.version += 1; },
  };
  let records = [{ id: 'existing' }];
  let offset = 100;
  let hasMore = true;
  let loading = false;
  const request = component.loadMoreRecords({
    guard,
    offset,
    hasMore,
    loading,
    fetchPage: () => new Promise(resolve => { resolvePage = resolve; }),
    getCurrentRecords: () => records,
    setRecords: (value: any[]) => { records = value; },
    setOffset: (value: number) => { offset = value; },
    setHasMore: (value: boolean) => { hasMore = value; },
    setLoading: (value: boolean) => { loading = value; },
  });

  guard.invalidate();
  loading = false;
  resolvePage([{ id: 'stale' }]);
  await request;
  assert.deepEqual(records, [{ id: 'existing' }]);
  assert.equal(offset, 100);
  assert.equal(hasMore, true);
  assert.equal(loading, false);
});

test('refreshed invoice pages reset their offset and pagination state', () => {
  const component = extractPaginationMethods(['setInvoicePage']);
  let invalidations = 0;
  component.invoiceListLoadGuard = { invalidate() { invalidations += 1; } };
  component.paymentInvoiceId = '';
  component.invoicesLoadingMore = true;
  const records = Array.from({ length: 100 }, (_, index) => ({
    id: 'invoice-' + index,
    status: index === 0 ? 'issued' : 'draft',
  }));
  component.setInvoicePage(records);
  assert.equal(component.invoices.length, 100);
  assert.equal(component.invoiceOffset, 100);
  assert.equal(component.invoicesHasMore, true);
  assert.equal(component.invoicesLoadingMore, false);
  assert.equal(component.paymentInvoiceId, 'invoice-0');
  assert.equal(invalidations, 1);
});

test('invoice editor, invoice list and payment history expose load-more controls', () => {
  assert.ok(source.includes('[hasMoreCustomers]="customersHasMore"'));
  assert.ok(source.includes('(loadMoreCustomers)="loadMoreInvoiceCustomers()"'));
  assert.ok(source.includes('[hasMoreProducts]="productsHasMore"'));
  assert.ok(source.includes('(loadMoreProducts)="loadMoreInvoiceProducts()"'));
  assert.ok(source.includes('(click)="loadMoreInvoices()"'));
  assert.ok(source.includes('(click)="loadMorePayments()"'));
});
