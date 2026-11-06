import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8');

test('mobile More menu has a correctly delimited active-class attribute', () => {
  const line = source.split('\n').find((value) => value.includes('class="nav-item mobile-more"'));
  assert.ok(line, 'mobile More button must exist');
  assert.ok(line.includes('[class.active]="mobileMoreOpen || isMobileMoreTab(tab)"'));
  assert.match(source, /isMobileMoreTab\(tab: Tab\): boolean/);
  assert.ok(line.includes('[attr.aria-label]'));
  assert.equal(line.includes('isMobileMoreTab(tab)""'), false);
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
  const chatStart = source.indexOf('<section abaCard class="panel chat-panel">', assistantStart);
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
  assert.match(source, /\.list-row\{display:grid;grid-template-columns:minmax\(0,1fr\)/);
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
  assert.match(source, /this\.api\.previewCustomerCsv\(\s*this\.business\.id, this\.customerImportCsvText/);
  assert.match(source, /this\.api\.importCustomerCsv\(\s*this\.business\.id, this\.customerImportCsvText/);
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

test('sidebar and More navigation reuse the central workspace visibility policy', () => {
  const sidebarStart = source.indexOf('<aside class="sidebar"');
  const sidebarEnd = source.indexOf('</aside>', sidebarStart);
  const sidebar = source.slice(sidebarStart, sidebarEnd);
  assert.ok(sidebarStart >= 0 && sidebarEnd > sidebarStart);
  assert.doesNotMatch(sidebar, /@if \(business\?\.role === 'owner'\)/);
  assert.doesNotMatch(sidebar, /@if \(platformAdminAvailable\)/);
  for (const tab of ['employees', 'payments', 'taxes', 'audit', 'integrity', 'health', 'platform-admin']) {
    assert.ok(sidebar.includes(`canAccessTab('${tab}')`), tab);
  }
});

test('mobile More navigation renders grouped destinations from the shared catalogue', () => {
  const menuStart = source.indexOf('<nav id="mobile-more-menu"');
  const menuEnd = source.indexOf('</nav>', menuStart);
  const menu = source.slice(menuStart, menuEnd);
  assert.ok(menuStart >= 0 && menuEnd > menuStart);
  assert.doesNotMatch(menu, /role="menu(?:item)?"/);
  assert.match(menu, /@for \(group of mobileMoreGroups; track group\.id\)/);
  assert.match(menu, /@for \(module of group\.modules; track module\.tab\)/);
  assert.match(menu, /module\.icon/);
  assert.match(menu, /t\(module\.titleAr, module\.titleEn\)/);
  assert.match(menu, /tab === module\.tab \? 'page' : null/);
  assert.match(source, /WORKSPACE_MODULE_GROUPS/);
  assert.match(source, /max-height:min\(70dvh,560px\);overflow-y:auto;overscroll-behavior:contain/);
  assert.match(source, /border-inline-start:3px solid #5eead4/);
});

test('workspace empty states use the shared accessible state component', () => {
  assert.doesNotMatch(source, /<p class="empty">/);
  assert.ok((source.match(/<aba-state-message kind="empty"/g) || []).length >= 13);
  assert.ok((source.match(/<aba-state-message kind="error"/g) || []).length >= 15);
  assert.doesNotMatch(source, /<p class="error" role="alert">/);
  assert.doesNotMatch(source, /class="error-banner"/);
  assert.ok((source.match(/<aba-state-message kind="loading"/g) || []).length >= 8);
  assert.doesNotMatch(source, /class="error-banner"/);
  assert.doesNotMatch(source, /<p class="muted" role="status">/);
});

test('workspace panels reuse one section header component instead of duplicating heading markup', () => {
  assert.ok((source.match(/<aba-section-header\b/g) || []).length >= 13);
  assert.equal((source.match(/<div class="section-head"><div><h2>/g) || []).length, 0, 'all simple h2 section headers must use the shared component');
});

test('All Modules uses the shared role-filtered catalogue and reusable quick-access component', () => {
  assert.ok(source.includes('class="panel module-launcher"'));
  assert.ok(source.includes('homeModuleCards.length'));
  assert.match(source, /WORKSPACE_MODULE_CATALOG\.filter\(module => this\.canAccessTab\(module\.tab\)\)/);
  assert.match(source, /<aba-section-header[^>]*titleId/);
  assert.match(source, /<aba-quick-access-card\b/);
  assert.match(source, /activated\)="setTab\(module\.tab\)"/);
  assert.doesNotMatch(source, /\{ business\?\.role === 'owner' \? \(platformAdminAvailable \? 19 : 18\)/);
  assert.doesNotMatch(source, /class="quick-card"/);
});


test('chat requests are fenced by workspace, authenticated UID, role and request generation', () => {
  assert.match(source, /private readonly chatRequestGuard = new WorkspaceLoadGuard\(\)/);
  assert.match(source, /private currentChatRequestContext\(\): TenantRequestContext/);
  assert.match(source, /runTenantScopedRequest\([\s\S]*this\.chatRequestGuard/);
  const clearStart = source.indexOf('private clearWorkspaceData(): void');
  const clearEnd = source.indexOf('async createWorkspace(): Promise<void>', clearStart);
  const clear = source.slice(clearStart, clearEnd);
  assert.match(clear, /this\.chatRequestGuard\.invalidate\(\)/);
  assert.match(clear, /this\.chatSending = false/);
  assert.match(source, /if \(!requestContext\.signedIn \|\| !requestContext\.userId \|\| !requestContext\.role \|\| !requestContext\.workspaceId\) return/);
});

test('mobile chat adapts to the visual viewport and keeps the composer above the bottom dock', () => {
  assert.match(source, /window\.visualViewport\?\.addEventListener\('resize'/);
  assert.match(source, /window\.visualViewport\?\.removeEventListener\('resize'/);
  assert.match(source, /--aba-keyboard-inset/);
  assert.match(source, /\[class\.keyboard-open\]="keyboardOpen"/);
  assert.match(source, /\.chat-form\{position:sticky;bottom:calc\(var\(--aba-keyboard-inset,0px\) \+ 8px\)/);
  assert.match(source, /\.shell\.keyboard-open \.sidebar/);
  assert.match(source, /\.shell:has\(\.chat-form textarea:focus\) \.sidebar/);
  assert.match(source, /max-height:25dvh/);
});

test('chat send preserves retry draft behavior and keeps the existing API contract', () => {
  const start = source.indexOf('async sendChat(): Promise<void>');
  const end = source.indexOf('private message(error:', start);
  const method = source.slice(start, end);
  assert.match(method, /this\.api\.chat\(requestContext\.workspaceId, question, history\)/);
  assert.match(method, /this\.chatDraft = question/);
  assert.match(method, /onFinally: \(\) => \{\s*this\.chatSending = false;/);
  assert.doesNotMatch(method, /this\.api\.chat\(this\.business\.id/);
});
