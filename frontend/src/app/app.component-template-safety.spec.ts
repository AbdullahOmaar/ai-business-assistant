import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8');
const moduleAccessSource = readFileSync(new URL('./module-access.ts', import.meta.url), 'utf8');

test('mobile More menu has a correctly delimited active-class attribute', () => {
  const line = source.split('\n').find((value) => value.includes('class="nav-item mobile-more"'));
  assert.ok(line, 'mobile More button must exist');
  assert.match(line, /\[class\.active\]="mobileMoreOpen \|\| isMobileMoreTab\(tab\)"/,
    'the More menu active binding must delegate to the tested secondary-tab classifier');
  assert.ok(line.includes('[attr.aria-label]='),
    'the More menu item must retain its accessible label');
  assert.equal(line.includes('.includes(tab)""'), false);
  assert.match(moduleAccessSource, /export function isMobileMoreTab\(tab: WorkspaceModuleTab\): boolean/);
});

const authSource = readFileSync(new URL('./auth.service.ts', import.meta.url), 'utf8');

test('startup config fetch has a bounded wait and allows retry after failure', () => {
  assert.match(authSource, /new AbortController\(\)/);
  assert.match(authSource, /10_000/);
  assert.match(authSource, /this\.configPromise = undefined/);
  assert.match(source, /Retry startup/);
});

test('workspace version and build time live inside the current-business card', () => {
  const workspaceStart = source.indexOf('class="workspace-bar"');
  const workspaceEnd = source.indexOf('</section>', workspaceStart);
  const workspace = source.slice(workspaceStart, workspaceEnd);
  assert.ok(workspace.includes('workspace-release-meta-inline'));
  assert.ok(workspace.includes('buildTimeLabel'));
  assert.equal(source.includes('class="mobile-version-strip"'), false);
  assert.equal(source.includes('class="workspace-release-meta" [attr.aria-label]'), false);
  assert.match(source, /\.workspace-bar\{grid-template-columns:minmax\(0,1fr\) auto minmax\(180px,260px\)\}/);
});

test('invoice creation is presented before invoice filtering', () => {
  const toolbar = source.indexOf('class="invoice-toolbar"');
  const create = source.indexOf('class="invoice-create-disclosure"', toolbar);
  const filter = source.indexOf('customer-invoice-filter', toolbar);
  assert.ok(toolbar >= 0 && create > toolbar && filter > create);
  assert.equal((source.match(/class="inline-form customer-invoice-filter"/g) || []).length, 1);
});

test('expense and notification types use selectable, localized options', () => {
  assert.match(source, /name="expenseCategory" required \[\(ngModel\)\]="expenseCategory"/);
  assert.match(source, /<option value="General">\{\{ t\('عام', 'General'\) \}\}<\/option>/);
  assert.match(source, /name="notificationKind" required \[\(ngModel\)\]="notificationKind"/);
  assert.match(source, /<option value="inventory">/);
  assert.match(source, /<option value="reminders">/);
  assert.match(source, /<option value="suppliers">/);
  assert.match(source, /notificationKindLabel\(item\.kind\)/);
});

test('AI suggestions live outside the chat panel in a compact responsive prompt rail', () => {
  const assistantStart = source.indexOf('<div class="assistant-workspace">');
  const chatStart = source.indexOf('<section class="panel chat-panel">', assistantStart);
  const chatEnd = source.indexOf('</section>', chatStart);
  const suggestionsStart = source.indexOf('<aside class="assistant-suggestions"', chatEnd);
  const workspaceEnd = source.indexOf('</div>\n            }', suggestionsStart);
  assert.ok(assistantStart >= 0 && chatStart > assistantStart);
  assert.ok(chatEnd > chatStart && suggestionsStart > chatEnd,
    'suggestions must be a sibling of the chat panel, not inside it');
  assert.ok(workspaceEnd > suggestionsStart, 'suggestions must remain inside the assistant layout');
  assert.ok(source.includes('.assistant-workspace{display:grid;grid-template-columns:minmax(0,1fr) 228px'));
  assert.ok(source.includes('.suggestion-grid{display:grid;grid-template-columns:minmax(0,1fr)'));
  assert.ok(source.includes('@media(max-width:900px){.assistant-workspace{grid-template-columns:minmax(0,1fr)}'));
  assert.match(source, /class="suggestion-card"/);
});

test('audit actions and record types have Arabic display labels', () => {
  assert.match(source, /auditActionLabel\(event\.action\)/);
  assert.match(source, /auditTargetLabel\(event\.target_type\)/);
  assert.match(source, /'invoice\.issued': \{ ar: 'إصدار فاتورة'/);
  assert.match(source, /'invoice\.voided': \{ ar: 'إلغاء فاتورة'/);
  assert.match(source, /value="invoice\.draft_updated"/);
  assert.match(source, /value="stock\.movement_recorded"/);
  assert.match(source, /value="purchase_order\.approved"/);
  assert.match(source, /value="sales_return\.approved"/);
  assert.match(source, /value="recurring_invoice_schedule\.created"/);
  assert.match(source, /'supplier\.created': \{ ar: 'إضافة مورد'/);
  assert.equal((source.match(/<option value="supplier">/g) || []).length, 1);
});

test('workspace header keeps business name, selector, and release time in separate responsive grid cells', () => {
  assert.match(source, /\.workspace-bar\{display:grid;grid-template-columns:minmax\(0,1fr\) auto minmax\(180px,260px\)/);
  assert.match(source, /@media\(max-width:760px\)\{\s*\.workspace-bar\{grid-template-columns:minmax\(0,1fr\);align-items:stretch/);
  assert.match(source, /\.workspace-release-meta-inline \.version-pill\{max-width:100%;white-space:normal;overflow-wrap:anywhere\}/);
});

test('responsive sizing rules keep numeric invoice fields compact and cards within mobile width', () => {
  assert.match(source, /\.invoice-form label:has\(input\[type="number"\]\)\{max-width:150px/);
  assert.match(source, /\.workspace-bar\{grid-template-columns:minmax\(0,1fr\);padding:12px/);
  assert.match(source, /\.list-row\{min-width:0;flex-wrap:wrap;gap:12px\}/);
  assert.match(source, /\.list-row\{display:grid;grid-template-columns:auto minmax\(0,1fr\);align-items:start\}/);
  assert.match(source, /class="list-row invoice-list-row"/);
  assert.match(source, /class="list-row customer-list-row"/);
  assert.match(source, /\.customer-list-row,\.invoice-list-row\{grid-template-columns:36px minmax\(0,1fr\)/);
});

test('financial and integrity report basis labels are localized', () => {
  assert.match(source, /revenueBasisLabel\(profitLoss\.revenue_basis\)/);
  assert.match(source, /Gross issued invoice total/);
  assert.match(source, /integrityWarningLabel\(dataIntegrityReport\.warning\)/);
  assert.match(source, /reportLimitationLabel\(limitation\)/);
});

const apiSource = readFileSync(new URL('./api.service.ts', import.meta.url), 'utf8');

test('API requests abort when the backend stalls instead of blocking workspace startup indefinitely', () => {
  assert.match(apiSource, /new AbortController\(\)/);
  assert.match(apiSource, /15_000/);
  assert.match(apiSource, /signal: controller\.signal/);
  assert.match(apiSource, /The request timed out/);
  const timeoutStart = apiSource.indexOf('const timeoutId = setTimeout');
  const responseRead = apiSource.indexOf('return await response.json() as T;', timeoutStart);
  const timeoutClear = apiSource.indexOf('clearTimeout(timeoutId)', timeoutStart);
  assert.ok(timeoutStart >= 0 && responseRead > timeoutStart && timeoutClear > responseRead,
    'the timeout must remain active until the response body is parsed');
});

test('report labels translate the actual backend revenue-basis and integrity-warning wording', () => {
  assert.match(source, /gross issued invoice totals before sales returns/);
  assert.match(source, /this report identifies records for manual review only/);
  assert.match(source, /Legacy invoices without customer links are flagged for review, not auto-corrected\./);
  assert.match(source, /Uses saved tax totals on issued invoices; it does not recalculate historical taxes\./);
});


test('Platform Admin is deferred until the admin tab is selected', () => {
  const deferStart = source.indexOf("@defer (when tab === 'platform-admin' && platformAdminAvailable)");
  const adminComponent = source.indexOf('<aba-platform-admin', deferStart);
  const placeholder = source.indexOf('@placeholder', deferStart);
  const componentReferences = source.match(/<aba-platform-admin\b/g) ?? [];
  assert.equal(componentReferences.length, 1,
    'Platform Admin should only appear in the deferred block');
  assert.ok(deferStart >= 0, 'Platform Admin must use a deferred block');
  assert.ok(adminComponent > deferStart && placeholder > adminComponent,
    'the admin component must be inside the deferred block with a loading placeholder');
  assert.match(source, /Loading Platform Admin…/);
});


test('customer CSV import requires preview before confirmation and localizes feedback', () => {
  const customerPanelStart = source.indexOf('aria-label="CSV customer import"');
  const customerPanelEnd = source.indexOf('</section>', customerPanelStart);
  const panel = source.slice(customerPanelStart, customerPanelEnd);
  assert.ok(customerPanelStart >= 0, 'customer CSV import panel must exist');
  assert.match(panel, /onCustomerImportFileSelected\(\$event\)/);
  assert.match(panel, /previewCustomerImport\(\)/);
  assert.match(panel, /customerImportPreview\?\.valid/);
  assert.match(panel, /confirmCustomerImport\(\)/);
  assert.match(source, /async previewCustomerImport\(\): Promise<void>/);
  assert.match(source, /async confirmCustomerImport\(\): Promise<void>/);
  assert.match(source, /this\.api\.previewCustomerCsv\(businessId, csvText\)/);
  assert.match(source, /this\.api\.importCustomerCsv\(businessId, csvText\)/);
  assert.match(source, /customerImportPreview: Awaited<ReturnType<ApiService\['previewCustomerCsv'\]>>/);
});

test('customer CSV import API methods target customer preview and execution routes', () => {
  const apiSource = readFileSync(new URL('./api.service.ts', import.meta.url), 'utf8');
  assert.match(apiSource, /previewCustomerCsv\(businessId: string, csvText: string\)/);
  assert.match(apiSource, /imports\/customers\.csv\/preview/);
  assert.match(apiSource, /importCustomerCsv\(businessId: string, csvText: string\)/);
  assert.match(apiSource, /imports\/customers\.csv/);
});


test('workspace switch clears pending product and customer CSV imports', () => {
  const start = source.indexOf('private clearWorkspaceData(): void');
  const end = source.indexOf('\n  }', start);
  const reset = source.slice(start, end);
  assert.ok(start >= 0 && end > start, 'workspace reset method must exist');
  for (const field of [
    'importCsvText', 'importFileName', 'importPreview', 'importMessage',
    'customerImportCsvText', 'customerImportFileName', 'customerImportPreview',
    'customerImportMessage'
  ]) {
    assert.match(reset, new RegExp('this\\.' + field + '\\s*='));
  }
});


test('Home launcher exposes all 19 existing module destinations with current access flags', () => {
  const launcherStart = source.indexOf('class="panel module-launcher"');
  const launcherEnd = source.indexOf('</section>', launcherStart);
  assert.ok(launcherStart >= 0 && launcherEnd > launcherStart);
  const launcher = source.slice(launcherStart, launcherEnd);
  const expectedTabs = [
    'overview', 'customers', 'products', 'invoices', 'payments', 'expenses',
    'employees', 'assistant', 'reports', 'taxes', 'audit', 'integrity',
    'release-guide', 'platform-admin', 'suppliers', 'purchases', 'recurring',
    'notifications', 'health',
  ];
  const actualTabs = [...launcher.matchAll(/setTab\('([^']+)'\)/g)].map((match) => match[1]);
  assert.deepEqual(actualTabs, expectedTabs);
  assert.equal((launcher.match(/class="quick-card"/g) || []).length, 19);

  for (const tab of ['payments', 'employees', 'taxes', 'audit', 'integrity', 'health']) {
    assert.ok(launcher.includes(`@if (canAccessTab('${tab}'))`), `${tab} launcher entry must reuse the existing access policy`);
  }
  assert.ok(launcher.includes("@if (canAccessTab('platform-admin'))"), 'Platform Admin must follow the existing availability flag through the shared guard');
});

test('direct setTab selection fails closed when STAFF requests Activity Log or Tax Summary', () => {
  const methodStart = source.indexOf('setTab(tab: Tab): void {');
  const methodEnd = source.indexOf('\n  statementEventLabel', methodStart);
  assert.ok(methodStart >= 0 && methodEnd > methodStart);
  const method = source.slice(methodStart, methodEnd);
  assert.ok(method.includes("if (!this.canAccessTab(tab)) { this.tab = 'overview'; this.mobileMoreOpen = false; return; }"));
  assert.ok(source.includes('return canAccessWorkspaceTab(tab, this.business?.role, this.platformAdminAvailable);'));
  assert.ok(moduleAccessSource.includes("'taxes', 'audit'"));
  assert.ok(moduleAccessSource.includes("if (OWNER_ONLY_TABS.has(tab)) return role === 'owner';"));
});

function asyncSourceSection(startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0 && end > start, `missing source section: ${startMarker}`);
  return source.slice(start, end);
}

test('chat responses and errors are fenced by captured workspace, user, auth generation, and request generation', () => {
  const method = asyncSourceSection('async sendChat(): Promise<void>', 'private message(');
  assert.match(method, /const businessId = this\.business\.id/);
  assert.match(method, /this\.chatRequestGuard\.begin\(\)/);
  assert.match(method, /this\.captureTenantRequest\(businessId\)/);
  assert.match(method, /if \(!isCurrent\(\)\) return/);
  assert.match(method, /if \(isCurrent\(\)\) this\.chatSending = false/);
});

test('product and customer CSV reads, previews, and imports are workspace fenced', () => {
  const productRead = asyncSourceSection('async onImportFileSelected(', 'async previewProductImport(');
  const productPreview = asyncSourceSection('async previewProductImport(', 'async confirmProductImport(');
  const productConfirm = asyncSourceSection('async confirmProductImport(', 'async onCustomerImportFileSelected(');
  const customerRead = asyncSourceSection('async onCustomerImportFileSelected(', 'async previewCustomerImport(');
  const customerPreview = asyncSourceSection('async previewCustomerImport(', 'async confirmCustomerImport(');
  const customerConfirm = asyncSourceSection('async confirmCustomerImport(', 'async createProduct(');
  for (const method of [productRead, productPreview, productConfirm, customerRead, customerPreview, customerConfirm]) {
    assert.match(method, /this\.(?:product|customer)ImportRequestGuard\.begin\(\)/);
    assert.match(method, /this\.captureTenantRequest\(this\.business\.id\)|this\.captureTenantRequest\(businessId\)/);
    assert.match(method, /isCurrent\(\)/);
  }
  assert.match(productConfirm, /never replay it for a new workspace/);
  assert.match(customerConfirm, /never replay it for a new workspace/);
});

test('invoice detail and invoice mutations cannot write stale workspace data into the shared editor', () => {
  const edit = asyncSourceSection('async editInvoice(', 'cancelInvoiceEdit(): void');
  const create = asyncSourceSection('async createInvoice(): Promise<void>', 'private escapePrintHtml(');
  const issue = asyncSourceSection('async issueInvoice(', 'async voidInvoice(');
  const voidInvoice = asyncSourceSection('async voidInvoice(', 'hasOutstandingBalance(');
  for (const method of [edit, create, issue, voidInvoice]) {
    assert.match(method, /const businessId = this\.business\.id/);
    assert.match(method, /this\.captureTenantRequest\(businessId\)/);
    assert.match(method, /isCurrent\(\)/);
  }
});

test('workspace creation is fenced by the initiating Firebase UID and auth transition', () => {
  const method = asyncSourceSection('async createWorkspace(): Promise<void>', 'async switchBusiness(');
  assert.match(method, /const requestUid = this\.currentAuthUid/);
  assert.match(method, /const authVersion = this\.authTransitionVersion/);
  assert.match(method, /this\.workspaceCreateRequestGuard\.isLatest\(requestVersion\)/);
  assert.match(method, /if \(!isCurrent\(\)\) return/);
});

test('workspace reset invalidates every new async guard and clears chat loading state', () => {
  const reset = asyncSourceSection('private clearWorkspaceData(): void', 'private captureTenantRequest(');
  for (const guard of [
    'chatRequestGuard', 'productImportRequestGuard', 'customerImportRequestGuard',
    'invoiceEditRequestGuard', 'workspaceCreateRequestGuard', 'customerMutationGuard',
    'productMutationGuard', 'invoiceMutationGuard',
  ]) assert.ok(reset.includes(`this.${guard}.invalidate()`), `${guard} must be invalidated on reset`);
  assert.match(reset, /this\.chatSending = false/);
});

test('customer and product creation mutations are fenced and refresh only their captured workspace', () => {
  const customer = asyncSourceSection('async createCustomer(): Promise<void>', 'async onImportFileSelected(');
  const product = asyncSourceSection('async createProduct(): Promise<void>', 'private deriveRate(');
  for (const method of [customer, product]) {
    assert.match(method, /const businessId = this\.business\.id/);
    assert.match(method, /this\.captureTenantRequest\(businessId\)/);
    assert.match(method, /this\.api\.(?:createCustomer|createProduct)\(businessId/);
    assert.match(method, /if \(!isCurrent\(\)\) return/);
    assert.match(method, /if \(isCurrent\(\)\) this\.loading = false/);
  }
});


test('draft invoice Issue and Void actions are OWNER-only in both template and methods', () => {
  const invoiceListStart = source.indexOf('class="list-row invoice-list-row"');
  const invoiceListEnd = source.indexOf('</article>', invoiceListStart);
  const invoiceRow = source.slice(invoiceListStart, invoiceListEnd);
  assert.ok(invoiceListStart >= 0, 'invoice list row must exist');
  assert.match(invoiceRow, /invoice\.status === 'draft'[\s\S]*?business\?\.role === 'owner'[\s\S]*?issueInvoice\(invoice\)/);
  assert.match(invoiceRow, /business\?\.role === 'owner'[\s\S]*?voidInvoice\(invoice\)/);
  const ownerGatedVoidActions = source.match(/@if \(business\?\.role === 'owner'\) \{[\s\S]*?voidInvoice\(invoice\)/g) ?? [];
  assert.equal(ownerGatedVoidActions.length, 2,
    'both draft and issued invoice Void actions must be OWNER-only');

  const issueStart = source.indexOf('async issueInvoice(invoice: Invoice): Promise<void>');
  const issueEnd = source.indexOf('async voidInvoice(invoice: Invoice): Promise<void>', issueStart);
  const issueMethod = source.slice(issueStart, issueEnd);
  assert.match(issueMethod, /this\.business\.role !== 'owner'/,
    'issue method must fail closed for STAFF even if invoked outside the template');

  const voidStart = issueEnd;
  const voidEnd = source.indexOf('async ', voidStart + 10);
  const voidMethod = source.slice(voidStart, voidEnd > voidStart ? voidEnd : undefined);
  assert.match(voidMethod, /this\.business\.role !== 'owner'/,
    'void method must fail closed for STAFF even if invoked outside the template');
});


const invoiceEditorSource = readFileSync(new URL('./invoice-draft-editor.component.ts', import.meta.url), 'utf8');

test('invoice editor supports updating existing mixed product and manual draft lines', () => {
  assert.match(source, /\[initialLines\]="invoiceDraftInitialLines"/);
  assert.match(source, /\[draftRevision\]="invoiceDraftRevision"/);
  assert.match(source, /this\.api\.updateDraftInvoice\(businessId, editingInvoiceId, request\)/);
  assert.match(source, /this\.invoiceDraftInitialLines = invoiceDraftLinesFromExisting\(detail\.lines\)/);
  assert.match(invoiceEditorSource, /implements OnChanges/);
  assert.match(invoiceEditorSource, /this\.initialLines\.map\(line => \(\{ \.\.\.line \}\)\)/);
  assert.match(invoiceEditorSource, /editing \? t\('تعديل مسودة الفاتورة', 'Edit invoice draft'\)/);
  assert.match(invoiceEditorSource, /editing && !serverSummary/);
  assert.match(invoiceEditorSource, /newDraft\.emit\(\)/);
  assert.equal(source.includes('detail.lines.some(line => !line.product_id)'), false,
    'manual service lines must not block draft editing');
});

test('confirmed no-write payment rejections clear retry state while uncertain outcomes retain it', () => {
  assert.match(apiSource, /export function isDefinitiveNoWriteHttpStatus\(status: number\): boolean/);
  assert.match(apiSource, /\[400, 401, 403, 404, 422\]\.includes\(status\)/);
  assert.match(apiSource, /throw new ApiRequestError\(message, response\.status\)/);
  assert.match(source, /error instanceof ApiRequestError && error\.definitiveNoWrite/);
  assert.match(source, /this\.paymentRetryVault\.delete\(authUid, businessId\)/);
  assert.match(source, /this\.paymentRetryPending = false/);
  assert.match(source, /this\.paymentIdempotencyKey = ''/);
  assert.match(source, /this\.paymentRetryPending = true/);
});
