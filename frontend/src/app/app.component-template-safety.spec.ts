import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8');
const invoiceEditorSource = readFileSync(new URL('./invoice-draft-editor.component.ts', import.meta.url), 'utf8');
const invoiceDraftSource = readFileSync(new URL('./invoice-draft.ts', import.meta.url), 'utf8');
const releaseGuideSource = readFileSync(new URL('./release-guide.component.ts', import.meta.url), 'utf8');
const platformAdminSource = readFileSync(new URL('./platform-admin.component.ts', import.meta.url), 'utf8');
const stateMessageSource = readFileSync(new URL('./shared/ui/aba-state-message.component.ts', import.meta.url), 'utf8');
const recordTableSource = readFileSync(new URL('./shared/ui/aba-record-table.component.ts', import.meta.url), 'utf8');
const quickAccessSource = readFileSync(new URL('./shared/ui/aba-quick-access-card.component.ts', import.meta.url), 'utf8');
const workspaceLoadGuardSource = readFileSync(new URL('./workspace-load-guard.ts', import.meta.url), 'utf8');
const auditLabelsSource = readFileSync(new URL('./audit-labels.ts', import.meta.url), 'utf8');
const mobileHeaderSource = readFileSync(new URL('./shared/ui/aba-mobile-app-header.component.ts', import.meta.url), 'utf8');

test('workspace shell imports every tenant guard helper used by its async views', () => {
  assert.match(workspaceLoadGuardSource, /export function isCurrentTenantRequest/);
  const guardImport = source.split('\n').find(line => line.includes("from './workspace-load-guard'"));
  assert.ok(guardImport, 'workspace load guard import must exist');
  assert.ok(guardImport.includes('isCurrentTenantRequest'), 'all referenced tenant guard helpers must be imported');
});


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

test('the new invoice editor replaces the old disclosure before invoice search and filters', () => {
  const toolbar = source.indexOf('class="invoice-toolbar"');
  const panel = source.indexOf('class="invoice-create-panel"', toolbar);
  const createButton = source.indexOf('class="primary invoice-create-button"', toolbar);
  const controls = source.indexOf('class="invoice-controls"', toolbar);
  assert.ok(toolbar >= 0 && panel > toolbar && createButton > panel && controls > createButton);
  assert.doesNotMatch(source, /invoice-create-disclosure|onInvoiceCreateToggle/);
  assert.match(source, /\[discountRate\]="invoiceDiscountRate"/);
  assert.match(source, /\[taxRate\]="invoiceTaxRate"/);
  assert.match(source, /\(cancel\)="cancelInvoiceEdit\(\)"/);
  assert.match(source, /Search by customer name or invoice number/);
  assert.match(source, /name="invoiceFilterCustomer"/);
  assert.match(source, /class="invoice-search-icon"/);
  assert.equal((source.match(/class="invoice-controls"/g) || []).length, 1);
});

test('expense and notification types use selectable, localized options', () => {
  assert.match(source, /name="expenseCategory" required \[\(ngModel\)\]="expenseCategory"/);
  assert.match(source, /<option value="General">\{\{ t\('عام', 'General'\) \}\}<\/option>/);
  assert.match(source, /<select[^>]*name="notificationKind"[^>]*required[^>]*\[\(ngModel\)\]="notificationKind"/);
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
  assert.match(source, /this\.auditActionLabel\(item\.action\)/);
  assert.match(source, /this\.auditTargetLabel\(item\.target_type\)/);
  assert.match(auditLabelsSource, /'invoice\.issued': \{ ar: 'إصدار فاتورة'/);
  assert.match(auditLabelsSource, /'invoice\.voided': \{ ar: 'إلغاء فاتورة'/);
  assert.match(source, /value="invoice\.draft_updated"/);
  assert.match(source, /value="stock\.movement_recorded"/);
  assert.match(source, /value="purchase_order\.approved"/);
  assert.match(source, /value="sales_return\.approved"/);
  assert.match(source, /value="recurring_invoice_schedule\.created"/);
  assert.match(auditLabelsSource, /'supplier\.created': \{ ar: 'إضافة مورد'/);
  assert.equal((source.match(/<option value="supplier">/g) || []).length, 1);
});


test('workspace header keeps business name, selector, and release time in separate responsive grid cells', () => {
  assert.match(source, /\.workspace-bar\{display:grid;grid-template-columns:minmax\(0,1fr\) auto minmax\(180px,260px\)/);
  assert.match(source, /@media\(max-width:760px\)\{\s*\.workspace-bar\{grid-template-columns:minmax\(0,1fr\);align-items:stretch/);
  assert.match(source, /\.workspace-release-meta-inline \.version-pill\{max-width:100%;white-space:normal;overflow-wrap:anywhere\}/);
});

test('invoice customer filter can load additional customer pages for name search', () => {
  assert.match(source, /@if \(customersHasMore\) \{\s*<button class="secondary invoice-load-more-customers" type="button" \(click\)="loadMoreInvoiceCustomers\(\)" \[disabled\]="customersLoadingMore"/);
  assert.match(source, /Load 100 more customers to search/);
  assert.match(source, /Loading customers/);
  assert.match(source, /\.invoice-export,\.invoice-load-more-customers\{grid-column:1\/-1;justify-self:end\}/);
  assert.match(source, /\.invoice-export,\.invoice-load-more-customers\{grid-column:auto;justify-self:stretch\}/);
});

test('invoice amounts use consistent grouped decimal formatting in the list and server summary', () => {
  assert.match(source, /invoice\.total \| number:'1\.2-2'/);
  assert.match(source, /invoice\.outstanding_amount \| number:'1\.2-2'/);
  assert.match(invoiceEditorSource, /serverSummary\.subtotal \| number:'1\.2-2'/);
  assert.match(invoiceEditorSource, /serverSummary\??\.discount_total \| number:'1\.2-2'/);
  assert.match(invoiceEditorSource, /serverSummary\??\.tax_total \| number:'1\.2-2'/);
  assert.match(invoiceEditorSource, /serverSummary\.total \| number:'1\.2-2'/);
});

test('invoice list uses compact responsive cards with readable financial and status hierarchy', () => {
  assert.match(source, /class="invoice-cards"/);
  assert.match(source, /class="invoice-card"/);
  assert.match(source, /class="invoice-card-financials"/);
  assert.match(source, /class="invoice-payment-progress"/);
  assert.match(source, /class="invoice-actions"/);
  assert.match(source, /\.invoice-cards\{display:grid;grid-template-columns:repeat\(auto-fit/);
  assert.match(source, /\.invoice-card-financials\{display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(source, /\.invoice-card \.invoice-actions button\{min-height:40px/);
  assert.ok(source.includes('class="invoice-controls"'), 'invoice search and status filters remain grouped above the cards');
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
  const customerPanelStart = source.indexOf('class="csv-import-panel"');
  const customerPanelEnd = source.indexOf('</section>', customerPanelStart);
  const panel = source.slice(customerPanelStart, customerPanelEnd);
  assert.ok(customerPanelStart >= 0, 'customer CSV import panel must exist');
  assert.match(panel, /\[attr\.aria-label\]="t\('استيراد العملاء من CSV', 'CSV customer import'\)"/);
  assert.match(panel, /onCustomerImportFileSelected\(\$event\)/);
  assert.match(panel, /previewCustomerImport\(\)/);
  assert.match(panel, /customerImportPreview\?\.valid/);
  assert.match(panel, /confirmCustomerImport\(\)/);
  assert.match(source, /async previewCustomerImport\(\): Promise<void>/);
  assert.match(source, /async confirmCustomerImport\(\): Promise<void>/);
  const previewStart = source.indexOf('async previewCustomerImport(): Promise<void>');
  const confirmStart = source.indexOf('async confirmCustomerImport(): Promise<void>', previewStart);
  const importEnd = source.indexOf('importErrorLabel(code: string): string', confirmStart);
  assert.ok(previewStart >= 0 && confirmStart > previewStart && importEnd > confirmStart);
  const previewMethod = source.slice(previewStart, confirmStart);
  const confirmMethod = source.slice(confirmStart, importEnd);
  assert.match(previewMethod, /const businessId = this\.business\.id/);
  assert.match(previewMethod, /const csvText = this\.customerImportCsvText/);
  assert.match(previewMethod, /this\.api\.previewCustomerCsv\(businessId, csvText\)/);
  assert.match(confirmMethod, /const businessId = this\.business\.id/);
  assert.match(confirmMethod, /const csvText = this\.customerImportCsvText/);
  assert.match(confirmMethod, /this\.api\.importCustomerCsv\(businessId, csvText\)/);
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
  for (const tab of ['employees', 'payments', 'taxes', 'audit', 'health', 'platform-admin']) {
    assert.ok(sidebar.includes(`canAccessTab('${tab}')`), tab);
  }
  assert.match(source, /canAccessWorkspaceTab\(tab, this\.business\?\.role, this\.platformAdminAvailable\)/);
  assert.match(source, /WORKSPACE_MODULE_CATALOG\.filter\(module => this\.canAccessTab\(module\.tab\)\)/);
  assert.match(source, /get mobileMoreGroups\(\): readonly/);
  assert.match(source, /modules: accessibleModules\.filter\(module => module\.mobileGroup === group\.id\)/);
});

test('mobile More navigation renders grouped destinations from the shared catalogue', () => {
  const menuStart = source.indexOf('<nav #mobileMoreMenu id="mobile-more-menu"');
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
  assert.match(source, /border-inline-start:3px solid var\(--aba-color-nav-accent,#5eead4\)/);
});

test('workspace empty states use the shared accessible state component', () => {
  assert.doesNotMatch(source, /<p class="empty">/);
  assert.match(recordTableSource, /<aba-state-message kind="empty"/, "shared record tables provide an accessible empty state");
  assert.ok((source.match(/<aba-state-message kind="error"/g) || []).length >= 17);
  assert.doesNotMatch(source, /<p class="error" role="alert">/);
  assert.doesNotMatch(source, /class="error-banner"/);
  assert.doesNotMatch(source, /class="error" role="alert"/);
  assert.match(recordTableSource, /<aba-state-message kind="loading"/, "shared record tables provide an accessible loading state");
  assert.ok((source.match(/<aba-state-message kind="success"/g) || []).length >= 4);
  assert.ok(source.includes('<aba-state-message [kind]'));
  assert.doesNotMatch(source, /<p class="muted" role="status">/);
  assert.doesNotMatch(source, /<p role="status">/);
});

test('workspace panels reuse one section header component instead of duplicating heading markup', () => {
  assert.ok((source.match(/<aba-section-header\b/g) || []).length + (releaseGuideSource.match(/<aba-section-header\b/g) || []).length >= 13);
  assert.equal((source.match(/<div class="section-head"><div><h2>/g) || []).length, 0, 'all simple h2 section headers must use the shared component');
});

test('Home quick access shows only the five key destinations from the shared role-filtered catalogue', () => {
  const overviewStart = source.indexOf("@if (tab === 'overview')");
  const overviewEnd = source.indexOf("@if (tab === 'notifications')", overviewStart);
  const overview = source.slice(overviewStart, overviewEnd);
  const quickStart = overview.indexOf("Quick access");
  const directoryStart = overview.indexOf("All workspace modules");
  const quickAccess = overview.slice(quickStart, directoryStart);
  assert.ok(source.includes('class="panel module-launcher"'));
  assert.match(source, /get homeQuickAccessCards\(\): readonly WorkspaceModuleCard\[\]/);
  assert.match(source, /return selectHomeQuickAccessModules\(this\.homeModuleCards\)/);
  assert.match(source, /selectHomeQuickAccessModules, WORKSPACE_MODULE_CATALOG/);
  assert.match(source, /WORKSPACE_MODULE_CATALOG\.filter\(module => this\.canAccessTab\(module\.tab\)\)/);
  assert.ok(quickAccess.includes('homeQuickAccessCards.length'));
  assert.match(quickAccess, /@for \(module of homeQuickAccessCards; track module\.tab\)/);
  assert.doesNotMatch(quickAccess, /homeModuleCards/);
  assert.match(overview, /@for \(module of homeModuleCards; track module\.tab\)/);
  assert.match(overview, /All workspace modules/);
  assert.match(overview, /activated\)="setTab\(module\.tab\)"/);
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
  assert.match(source, /\.shell\.keyboard-open \.chat-form\{position:fixed;inset-inline:12px;bottom:calc\(var\(--aba-keyboard-inset,0px\) \+ 8px\)/);
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

const sharedStateSource = readFileSync(new URL('./shared/ui/aba-state-message.component.ts', import.meta.url), 'utf8');
const sharedCardSource = readFileSync(new URL('./shared/ui/aba-card.component.ts', import.meta.url), 'utf8');
const sharedMetricSource = readFileSync(new URL('./shared/ui/aba-metric-card.component.ts', import.meta.url), 'utf8');
const globalStylesSource = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

test('shared state feedback owns info, warning, success, error and accessible action behavior', () => {
  assert.ok(sharedStateSource.includes("AbaStateKind = 'loading' | 'empty' | 'error' | 'success' | 'info' | 'warning'"));
  assert.ok(sharedStateSource.includes("kind() === 'error' ? 'alert' : 'status'"));
  assert.ok(sharedStateSource.includes("kind() === 'loading' || kind() === 'success' ? 'polite' : null"));
  assert.ok(sharedStateSource.includes('aba-state-message--info'));
  assert.ok(sharedStateSource.includes('aba-state-message--warning'));
  assert.ok(sharedStateSource.includes('min-height:44px'));
  assert.ok(sharedStateSource.includes('prefers-reduced-motion:reduce'));
});

test('shared card hosts own card surface styling and projected KPI styles live in the shared stylesheet', () => {
  assert.ok(sharedCardSource.includes("selector: 'section[abaCard]'"));
  assert.ok(sharedCardSource.includes('ChangeDetectionStrategy.OnPush'));
  const panelHosts = [...source.matchAll(/<([a-z][a-z0-9-]*)[^>]*class="([^"]*)"[^>]*>/g), ...releaseGuideSource.matchAll(/<([a-z][a-z0-9-]*)[^>]*class="([^"]*)"[^>]*>/g)].filter(match => match[2].split(/\s+/).includes('panel'));
  assert.ok(panelHosts.length >= 20);
  for (const match of panelHosts) {
    assert.equal(match[1], 'section', 'panel surfaces must remain native section elements');
    assert.ok(match[0].includes('abaCard'), 'every panel must reuse the shared card directive');
  }
  assert.ok(sharedMetricSource.includes('ChangeDetectionStrategy.OnPush'));
  assert.ok(globalStylesSource.includes('aba-metric-card strong {'));
  assert.ok(globalStylesSource.includes('aba-metric-card small {'));
  assert.equal(source.includes('.panel{padding:15px'), false);
  assert.equal(source.includes('.metric-grid aba-metric-card strong'), false);
});


test('owner-only sidebar destinations use complete, accessible mobile-secondary navigation markup', () => {
  assert.equal(source.includes('<button ?'), false,
    'incomplete property bindings must never be emitted in a navigation button');

  for (const tab of ['taxes', 'employees', 'audit', 'payments', 'health']) {
    const marker = `@if (canAccessTab('${tab}'))`;
    const start = source.indexOf(marker);
    assert.ok(start >= 0, `${tab} must keep its existing role visibility guard`);
    const end = source.indexOf('}', start);
    const markup = source.slice(start, end + 1);
    assert.match(markup, /<button class="nav-item mobile-extra"/,
      `${tab} must remain in the More navigation on narrow screens`);
    assert.match(markup, /\[attr\.aria-label\]=/);
    assert.match(markup, /\[attr\.title\]=/);
    assert.match(markup, /\[class\.active\]=/);
    assert.match(markup, /\[attr\.aria-current\]=/);
    assert.ok(markup.includes(`setTab('${tab}')`));
  }
});


test('payment feedback uses the shared state component and distinguishes each outcome', () => {
  assert.match(source, /<aba-state-message \[kind\]="paymentMessageKind" \[description\]="paymentMessage" \/>/);
  assert.equal(source.includes('paymentError'), false);
  assert.match(source, /paymentMessageKind: 'info' \| 'success' \| 'warning' \| 'error' = 'info'/);

  const paymentStart = source.indexOf('async createPayment(): Promise<void>');
  const paymentEnd = source.indexOf('useAssistantSuggestion(', paymentStart);
  const paymentMethod = source.slice(paymentStart, paymentEnd);
  const mutation = paymentMethod.indexOf('await this.api.createPayment(');
  const success = paymentMethod.indexOf("this.paymentMessageKind = 'success'");
  const warning = paymentMethod.indexOf("this.paymentMessageKind = 'warning'");
  const failure = paymentMethod.indexOf("this.paymentMessageKind = 'error'");
  assert.ok(mutation >= 0 && success > mutation,
    'success feedback must only follow the confirmed payment API response');
  assert.ok(warning > success,
    'a refresh failure after a confirmed save must be presented as a warning, not a failed payment');
  assert.ok(failure > mutation,
    'an uncertain or failed mutation must use error feedback');
});


test('workspace load failure clears stale workspace data and releases the loading state', () => {
  const start = source.indexOf('async loadWorkspaceData(): Promise<void>');
  const end = source.indexOf('async refreshAfterPayrollPayment(): Promise<void>', start);
  assert.ok(start >= 0 && end > start);
  const method = source.slice(start, end);
  const catchStart = method.indexOf('} catch (error) {');
  const clear = method.indexOf('this.clearWorkspaceData();', catchStart);
  const error = method.indexOf('this.error = this.message(error);', catchStart);
  const release = method.indexOf('this.loading = false;', error);
  const finallyStart = method.indexOf('} finally {', catchStart);

  assert.ok(catchStart >= 0 && clear > catchStart);
  assert.ok(error > clear);
  assert.ok(release > error && release < finallyStart,
    'the failure path must stop loading after invalidating the request generation');
});


test('mobile More navigation restores keyboard focus after selection and Escape dismissal', () => {
  assert.match(source, /#mobileMoreTrigger class="nav-item mobile-more"/);
  assert.match(source, /@ViewChild\('mobileMoreTrigger'\) private mobileMoreTrigger\?: ElementRef<HTMLButtonElement>/);
  assert.match(source, /\(keydown\.escape\)="closeMobileMoreOnEscape\(\)"/);
  assert.match(source, /\(click\)="selectMobileMoreTab\(module\.tab\)"/);

  const selectStart = source.indexOf('selectMobileMoreTab(tab: Tab): void');
  const selectEnd = source.indexOf('\n  }', selectStart);
  const selectMethod = source.slice(selectStart, selectEnd);
  assert.match(selectMethod, /this\.setTab\(tab\)/);
  assert.match(selectMethod, /this\.mobileMoreTrigger\?\.nativeElement\.focus\(\)/);

  const escapeStart = source.indexOf('closeMobileMoreOnEscape(): void');
  const escapeEnd = source.indexOf('\n  }', escapeStart);
  const escapeMethod = source.slice(escapeStart, escapeEnd);
  assert.match(escapeMethod, /if \(!this\.mobileMoreOpen\) return/);
  assert.match(escapeMethod, /this\.mobileMoreTrigger\?\.nativeElement\.focus\(\)/);
});


test('mobile More trigger only references the menu while that menu exists', () => {
  assert.match(source, /\[attr\.aria-expanded\]="mobileMoreOpen"/);
  assert.match(source, /\[attr\.aria-controls\]="mobileMoreOpen \? 'mobile-more-menu' : null"/);
  assert.match(source, /<nav #mobileMoreMenu id="mobile-more-menu" class="mobile-more-menu"/);
});


test('mobile More closes on outside pointer interaction without stealing the new focus target', () => {
  assert.match(source, /#mobileMoreMenu id="mobile-more-menu"/);
  assert.match(source, /@ViewChild\('mobileMoreMenu'\) private mobileMoreMenu\?: ElementRef<HTMLElement>/);
  assert.match(source, /@HostListener\('document:pointerdown', \['\$event'\]\)/);

  const start = source.indexOf('closeMobileMoreOnOutsidePointer(event: PointerEvent): void');
  const end = source.indexOf('\n  }', start);
  const method = source.slice(start, end);
  assert.match(method, /this\.mobileMoreTrigger\?\.nativeElement\.contains\(target\)/);
  assert.match(method, /this\.mobileMoreMenu\?\.nativeElement\.contains\(target\)/);
  assert.match(method, /this\.mobileMoreOpen = false/);
  assert.doesNotMatch(method, /\.focus\(\)/,
    'outside pointer dismissal must not move focus away from the clicked target');
});


test('mobile More menu uses logical inline positioning for Arabic RTL and English LTR', () => {
  const menuRules = [...source.matchAll(/\.mobile-more-menu\{([^}]*)\}/g)].map(match => match[1]);
  const positioningRules = menuRules.filter(rule => /(?:right|left|inset-inline)/.test(rule));
  assert.ok(positioningRules.length >= 2, 'base and responsive menu rules must exist');
  for (const rule of positioningRules) {
    assert.doesNotMatch(rule, /(?:^|;)\s*(?:right|left):/,
      'physical left/right offsets must not override logical alignment');
  }
  assert.ok(positioningRules.some(rule => rule.includes('inset-inline-end:10px')));
  assert.ok(positioningRules.some(rule => rule.includes('inset-inline-end:12px')));
  assert.doesNotMatch(source, /\.shell\[dir="(?:rtl|ltr)"\] \.mobile-more-menu/);
});


test('mobile workspace view retains the active page title through the extracted header', () => {
  const desktopTopbar = source.indexOf('<header class="topbar">');
  const mobileHeader = source.indexOf('<aba-mobile-app-header');
  assert.ok(desktopTopbar >= 0 && mobileHeader > desktopTopbar);
  assert.match(source, /<aba-mobile-app-header[\s\S]*?\[pageTitle\]="pageTitle"/);
  assert.match(mobileHeaderSource, /<h1 aria-live="polite" aria-atomic="true">\{\{ pageTitle \}\}<\/h1>/);
});


test('mobile module directory and Home shortcuts use adaptive balanced grids', () => {
  assert.match(source, /\.module-directory-grid\{display:grid;grid-template-columns:repeat\(auto-fit,minmax\(min\(100%,190px\),1fr\)\)/);
  assert.match(source, /\.home-shortcut-list\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});


test('authentication failures keep the user on the sign-in form instead of retrying app startup', () => {
  const authStart = source.indexOf('} @else if (!signedIn) {');
  const authEnd = source.indexOf('} @else {', authStart);
  const authTemplate = source.slice(authStart, authEnd);
  assert.ok(authStart >= 0 && authEnd > authStart, 'sign-in view must exist');
  assert.match(authTemplate, /<form #authForm="ngForm"(?=[^>]*\(ngSubmit\)="authForm\.valid && submitAuth\(\)")(?=[^>]*class="stack")/);
  assert.match(authTemplate, /\[\(ngModel\)\]="email"/);
  assert.match(authTemplate, /\[\(ngModel\)\]="password"/);
  assert.match(authTemplate, /@if \(error\) \{ <aba-state-message kind="error" \[description\]="error" \/> \}/);
  assert.doesNotMatch(authTemplate, /initializeApp\(\)|Retry startup/,
    'an auth failure must be retried through the preserved sign-in form');
});


test('workspace role changes cannot leave an owner-only destination selected', () => {
  const switchStart = source.indexOf('async switchBusiness(id: string)');
  const switchEnd = source.indexOf('private readonly workspaceLoadGuard', switchStart);
  const switchMethod = source.slice(switchStart, switchEnd);
  const roleUpdate = switchMethod.indexOf('this.business = this.businesses.find(item => item.id === id) || null;');
  const accessGuard = switchMethod.indexOf("if (!this.canAccessTab(this.tab)) this.tab = 'overview';");
  const clearData = switchMethod.indexOf('this.clearWorkspaceData();');
  assert.ok(switchStart >= 0 && switchEnd > switchStart);
  assert.ok(roleUpdate >= 0 && accessGuard > roleUpdate && clearData > accessGuard,
    'resolve the selected workspace role before retaining the current destination or clearing data');
});

test('loss of platform-admin access with no workspace memberships returns to Overview', () => {
  const loadStart = source.indexOf('async loadBusinesses(): Promise<void>');
  const loadEnd = source.indexOf('private clearWorkspaceData(): void', loadStart);
  const loadMethod = source.slice(loadStart, loadEnd);
  const noMembershipStart = loadMethod.indexOf('if (!this.businesses.length)');
  const noMembershipEnd = loadMethod.indexOf('const chosen =', noMembershipStart);
  const noMembershipBranch = loadMethod.slice(noMembershipStart, noMembershipEnd);
  assert.ok(noMembershipStart >= 0 && noMembershipEnd > noMembershipStart);
  assert.match(noMembershipBranch, /if \(this\.platformAdminAvailable\) this\.setTab\('platform-admin'\);/,
    'authorized admins without workspace memberships must enter Platform Admin through the shared navigation handler');
  assert.match(noMembershipBranch, /else this\.setTab\('overview'\);/,
    'revoked platform-admin capability must not leave the former admin tab active');
  assert.match(source.slice(source.indexOf('setTab(tab: Tab): void'), source.indexOf('get statementBalanceEntries()', source.indexOf('setTab(tab: Tab): void'))), /this\.mobileMoreOpen = false/,
    'both no-membership destinations must use the handler that closes More');
});

test('membership and platform-role refreshes also fail closed on an inaccessible active destination', () => {
  const loadStart = source.indexOf('async loadBusinesses(): Promise<void>');
  const loadEnd = source.indexOf('private clearWorkspaceData(): void', loadStart);
  const loadMethod = source.slice(loadStart, loadEnd);
  const roleUpdate = loadMethod.indexOf('this.business = chosen;');
  const accessGuard = loadMethod.indexOf("if (!this.canAccessTab(this.tab)) this.setTab('overview');");
  const clearData = loadMethod.indexOf('if (workspaceAccessChanged) this.clearWorkspaceData();');
  const setTabStart = source.indexOf('setTab(tab: Tab): void');
  const setTabEnd = source.indexOf('get statementBalanceEntries()', setTabStart);
  const setTabMethod = source.slice(setTabStart, setTabEnd);
  assert.ok(loadStart >= 0 && loadEnd > loadStart);
  assert.ok(roleUpdate >= 0 && accessGuard > roleUpdate && clearData > accessGuard,
    'apply the refreshed membership role before revalidating the active destination and clearing scoped data');
  assert.match(setTabMethod, /if \(!this\.canAccessTab\(tab\)\)/);
  assert.match(setTabMethod, /this\.mobileMoreOpen = false/);
});


test('sign-in and first-workspace forms expose localized inline errors to assistive technology', () => {
  const authStart = source.indexOf('<form #authForm="ngForm"');
  const authEnd = source.indexOf('</form>', authStart);
  const authForm = source.slice(authStart, authEnd);
  assert.ok(authStart >= 0 && authEnd > authStart);
  assert.match(authForm, /#emailModel="ngModel"/);
  assert.match(authForm, /#passwordModel="ngModel"/);
  assert.match(authForm, /\[attr\.aria-invalid\]="emailModel\.invalid/);
  assert.match(authForm, /\[attr\.aria-describedby\]="emailModel\.invalid/);
  assert.match(authForm, /id="auth-email-error" class="field-error" aria-live="polite"/);
  assert.match(authForm, /id="auth-password-error" class="field-error" aria-live="polite"/);

  const workspaceStart = source.indexOf('<form #workspaceForm="ngForm"');
  const workspaceEnd = source.indexOf('</form>', workspaceStart);
  const workspaceForm = source.slice(workspaceStart, workspaceEnd);
  assert.ok(workspaceStart >= 0 && workspaceEnd > workspaceStart);
  assert.match(workspaceForm, /#businessNameModel="ngModel"/);
  assert.match(workspaceForm, /\[attr\.aria-invalid\]="businessNameModel\.invalid/);
  assert.match(workspaceForm, /id="workspace-name-error" class="field-error" aria-live="polite"/);
});


test('API authorization failures use localized, user-safe permission guidance', () => {
  const formatterStart = source.indexOf('private message(error: unknown');
  const formatter = source.slice(formatterStart);
  assert.ok(formatterStart >= 0);
  assert.match(formatter, /No active membership for this business/);
  assert.match(formatter, /Business role is not permitted for this operation/);
  assert.match(formatter, /No access to this business workspace\./);
  assert.match(formatter, /Platform administrator access is not granted\./);
  assert.match(formatter, /You do not have permission to access this workspace or perform this action\./);
  assert.match(formatter, /Your account is not authorized to access platform administration\./);
});


test('expired API sessions offer sign-out and re-authentication instead of a futile data retry', () => {
  assert.match(source, /\[actionLabel\]="sessionExpired \? t\('تسجيل الدخول مجددًا', 'Sign in again'\) : accessDenied \? t\('العودة للرئيسية', 'Go to Home'\) : t\('إعادة المحاولة', 'Retry'\)"/);
  assert.match(source, /\(action\)="sessionExpired \? logout\(\) : accessDenied \? setTab\('overview'\) : retry\(\)"/);
  assert.match(source, /get sessionExpired\(\): boolean/);
  const formatter = source.slice(source.indexOf('private message(error: unknown'));
  assert.match(formatter, /Authentication required/);
  assert.match(formatter, /Authenticated subject is missing/);
});


test('permission-denied feedback offers a safe return home instead of retrying a forbidden request', () => {
  assert.match(source, /\[actionLabel\]="sessionExpired \? t\('تسجيل الدخول مجددًا', 'Sign in again'\) : accessDenied \? t\('العودة للرئيسية', 'Go to Home'\) : t\('إعادة المحاولة', 'Retry'\)"/);
  assert.match(source, /\(action\)="sessionExpired \? logout\(\) : accessDenied \? setTab\('overview'\) : retry\(\)"/);
  assert.match(source, /get accessDenied\(\): boolean/);
  assert.match(source, /Your account is not authorized to access platform administration/);
});


test('operations forms distinguish successful mutations from failed list refreshes', () => {
  const helpersStart = source.indexOf('private beginOperationsAction()');
  const helpersEnd = source.indexOf('private async loadNotifications()', helpersStart);
  const helpers = source.slice(helpersStart, helpersEnd);
  assert.match(helpers, /private setOperationsSuccess\(tab: OperationsMessageTab/);
  assert.match(helpers, /private setOperationsFailure\(tab: OperationsMessageTab/);
  assert.match(helpers, /The operation succeeded, but the list could not be refreshed/);
  const notification = source.slice(source.indexOf('async createNotification()'), source.indexOf('private async loadSuppliers()'));
  const supplier = source.slice(source.indexOf('async createSupplier()'), source.indexOf('async createPurchaseOrder()'));
  const purchaseStart = source.indexOf('async createPurchaseOrder()');
  const purchaseEnd = source.indexOf('  hasRemainingQuantity(', purchaseStart);
  const purchase = source.slice(purchaseStart, purchaseEnd);
  const receivingStart = source.indexOf('async confirmPurchaseOrderReceipt()');
  const receivingEnd = source.indexOf('async createRecurringSchedule()', receivingStart);
  const receiving = source.slice(receivingStart, receivingEnd);
  const recurring = source.slice(source.indexOf('async createRecurringSchedule()'), source.indexOf('get maxIntegrityTotal()'));
  for (const method of [notification, supplier, purchase, receiving, recurring]) {
    assert.match(method, /if \(this\.business\?\.id !== businessId\) return;/,
      'stale operation completions must not update the newly selected workspace');
  }
  assert.match(notification, /delivery to recipients is not confirmed/);
  assert.match(purchase, /No quantities have been received yet/);
  assert.match(recurring, /does not generate invoices automatically/);
  assert.match(receiving, /Receiving was recorded/);
  assert.match(source, /operationsMessageTab === 'notifications'/);
  assert.match(source, /operationsMessageTab === 'suppliers'/);
  assert.match(source, /operationsMessageTab === 'purchases'/);
});

test('invoice void confirmation is localized and uses the accessible shared dialog', () => {
  const requestStart = source.indexOf('requestInvoiceVoid(invoice: Invoice, event: MouseEvent)');
  const requestEnd = source.indexOf('cancelInvoiceVoid(): void', requestStart);
  const request = source.slice(requestStart, requestEnd);
  assert.ok(requestStart >= 0 && requestEnd > requestStart, 'invoice void request handler must exist');
  assert.match(request, /!this\.business \|\| this\.business\.role !== 'owner'/);
  assert.match(source, /Confirm invoice void/);
  assert.match(source, /This screen does not process refunds or credit notes/);
  assert.match(source, /\(confirmed\)="confirmInvoiceVoid\(\)"/);
});

test('invoice mutations keep confirmed success separate from post-save refresh failures', () => {
  const saveStart = source.indexOf('async saveInvoiceDraft(payload: InvoiceDraftPayload): Promise<void>');
  const saveEnd = source.indexOf('async refreshInvoiceDraftStatus(): Promise<void>', saveStart);
  const save = source.slice(saveStart, saveEnd);
  assert.ok(saveStart >= 0 && saveEnd > saveStart);
  assert.match(save, /this\.api\.createInvoice\(businessId, request\)/);
  assert.match(save, /this\.api\.updateDraftInvoice\(businessId, editingInvoiceId, request\)/);
  assert.match(save, /if \(!isCurrent\(\)\) return;/);
  assert.match(save, /Invoice draft saved/);
  assert.match(save, /Draft saved, but the list could not refresh/);
  assert.match(save, /Do not save it again/);
  assert.match(save, /this\.invoiceMessageKind = 'success'/);
  assert.match(save, /finally \{\s*if \(isCurrent\(\)\) \{\s*this\.invoiceDraftSaving = false;\s*this\.loading = false;/);
});

test('invoice success messages support warning state and reset with workspace context', () => {
  assert.match(source, /invoiceMessageKind: 'success' \| 'warning' = 'success'/);
  assert.match(source, /<aba-state-message \[kind\]="invoiceMessageKind" \[description\]="invoiceMessage" \/>/);
  assert.match(source, /this\.invoiceMessageKind = 'warning'/);
  const resetStart = source.indexOf('private clearWorkspaceData(): void');
  const resetEnd = source.indexOf('async createWorkspace()', resetStart);
  const reset = source.slice(resetStart, resetEnd);
  assert.match(reset, /this\.invoiceMessage = ''/);
  assert.match(reset, /this\.invoiceMessageKind = 'success'/);
});

test('payment completion cannot clear the loading state of a newly selected workspace', () => {
  const start = source.indexOf('async createPayment(): Promise<void>');
  const end = source.indexOf('useAssistantSuggestion(', start);
  const method = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(method, /const businessSnapshot = this\.business/);
  assert.match(method, /const businessId = businessSnapshot\.id/);
  assert.match(method, /const requestContext = this\.captureTenantRequest\(businessId\)/);
  assert.match(method, /const isCurrent = \(\): boolean => this\.isCurrentTenantOperation/);
  assert.match(method, /finally \{\s*if \(isCurrent\(\)\) this\.paymentLoading = false;/);
  assert.doesNotMatch(method, /this\.loading = false/);
});

test('invalid authentication, workspace, customer, invoice, payment and expense forms cannot invoke mutations', () => {
  assert.match(source, /<form #authForm="ngForm"/);
  assert.match(source, /<form #workspaceForm="ngForm"/);
  assert.match(source, /<form #customerForm="ngForm"/);
  assert.match(source, /<form #expenseForm="ngForm"/);
  const paymentStart = source.indexOf('<form #paymentForm="ngForm"');
  const paymentEnd = source.indexOf('</form>', paymentStart);
  const paymentForm = source.slice(paymentStart, paymentEnd);
  assert.ok(paymentStart >= 0 && paymentEnd > paymentStart);
  assert.ok(paymentForm.includes('(paymentRetryPending || paymentForm.valid) && createPayment()'));
  assert.match(invoiceEditorSource, /toInvoiceDraftPayload/);
  assert.match(invoiceEditorSource, /if \(this\.saving \|\| this\.blocked\) return;/);
  assert.match(invoiceEditorSource, /this\.saveDraft\.emit\(payload\)/);
  assert.match(invoiceDraftSource, /if \(error\) throw new RangeError\(error\)/);
  assert.match(invoiceDraftSource, /Choose a valid customer\./);
  assert.match(invoiceDraftSource, /Add at least one invoice line\./);
});

test('product form exposes accessible required, non-negative price and conditional stock validation', () => {
  const start = source.indexOf('<form #productForm="ngForm"');
  const end = source.indexOf('</form>', start);
  const form = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(form, /\(ngSubmit\)="productForm\.valid && createProduct\(\)"/);
  assert.match(form, /#productNameModel="ngModel"/);
  assert.match(form, /id="product-name-error" class="field-error" aria-live="polite"/);
  assert.match(form, /#productPriceModel="ngModel"/);
  assert.match(form, /type="number" min="0" step="0\.01"/);
  assert.match(form, /id="product-price-error" class="field-error" aria-live="polite"/);
  assert.match(form, /#productOpeningQuantityModel="ngModel"/);
  assert.match(form, /id="product-opening-quantity-error" class="field-error" aria-live="polite"/);
});


test('customer creation preserves confirmed success and prevents stale workspace refreshes', () => {
  const start = source.indexOf('async createCustomer(): Promise<void>');
  const end = source.indexOf('async onImportFileSelected(', start);
  const method = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(method, /const businessId = this\.business\.id/);
  assert.match(method, /this\.api\.createCustomer\(businessId/);
  assert.match(method, /if \(this\.business\?\.id !== businessId\) return;/);
  assert.match(method, /Customer saved successfully/);
  assert.match(method, /The customer was saved, but the list could not refresh/);
  assert.match(method, /Do not add the customer again/);
  assert.match(method, /finally \{\s*if \(this\.business\?\.id === businessId\) this\.loading = false;/);
  assert.match(source, /<aba-state-message \[kind\]="customerMessageKind" \[description\]="customerMessage" \/>/);
});

test('product creation distinguishes saved stock setup from a failed list refresh', () => {
  const start = source.indexOf('async createProduct(): Promise<void>');
  const end = source.indexOf('private deriveRate(', start);
  const method = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(method, /const businessId = this\.business\.id/);
  assert.match(method, /this\.api\.createProduct\(businessId/);
  assert.match(method, /if \(this\.business\?\.id !== businessId\) return;/);
  assert.match(method, /Product saved successfully/);
  assert.match(method, /The product was saved, but the list could not refresh/);
  assert.match(method, /Do not add the product again/);
  assert.match(method, /finally \{\s*if \(this\.business\?\.id === businessId\) this\.loading = false;/);
  assert.match(source, /<aba-state-message \[kind\]="productMessageKind" \[description\]="productMessage" \/>/);
});

test('positive opening stock is OWNER-only while STAFF can create tracked products at zero', () => {
  const stockStart = source.indexOf('@if (stockTracked) {');
  const stockEnd = source.indexOf('<button class="primary" type="submit"', stockStart);
  const stockControls = source.slice(stockStart, stockEnd);
  assert.ok(stockStart >= 0 && stockEnd > stockStart, 'stock-tracked product controls must exist');
  const ownerGuard = stockControls.indexOf("@if (business?.role === 'owner')");
  const openingStockField = stockControls.indexOf('name="productOpeningQuantity"');
  assert.ok(ownerGuard >= 0 && openingStockField > ownerGuard,
    'the positive opening-stock input must be inside the OWNER-only guard');
  assert.match(stockControls, /Only workspace owners can set a positive opening stock quantity/);
  assert.match(stockControls, /zero opening stock/);

  const createStart = source.indexOf('async createProduct(): Promise<void>');
  const createEnd = source.indexOf('get invoicePreview()', createStart);
  const createMethod = source.slice(createStart, createEnd);
  assert.match(createMethod, /opening_quantity: this\.stockTracked && this\.business\.role === 'owner' \? this\.productOpeningQuantity : '0'/,
    'non-owners and unresolved roles must submit zero opening stock');

  const resetStart = source.indexOf('private clearWorkspaceData(): void');
  const resetEnd = source.indexOf('\n  }', resetStart);
  const resetMethod = source.slice(resetStart, resetEnd);
  assert.match(resetMethod, /this\.productOpeningQuantity = '0'/,
    'an owner-only quantity must not survive a workspace or role change');

  const businessesStart = source.indexOf('async loadBusinesses(): Promise<void>');
  const businessesEnd = source.indexOf('private clearWorkspaceData(): void', businessesStart);
  const businessesMethod = source.slice(businessesStart, businessesEnd);
  assert.ok(businessesStart >= 0 && businessesEnd > businessesStart);
  assert.match(businessesMethod, /this\.business\?\.role !== chosen\.role/,
    'a workspace membership-role change must be detected');
  assert.match(businessesMethod, /if \(workspaceAccessChanged\) this\.clearWorkspaceData\(\)/,
    'a workspace or role change must clear the previous context');
});



test('product CSV import is confirmed once and reports refresh failure without inviting a duplicate import', () => {
  const start = source.indexOf('async confirmProductImport(): Promise<void>');
  const end = source.indexOf('async onCustomerImportFileSelected(', start);
  const method = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(method, /const businessId = this\.business\.id/);
  assert.match(method, /const csvText = this\.importCsvText/);
  assert.match(method, /this\.api\.importProductCsv\(businessId, csvText\)/);
  assert.match(method, /Successfully imported/);
  assert.match(method, /this\.importCsvText = ''/);
  assert.match(method, /Products were imported, but the list could not refresh/);
  assert.match(method, /Do not import the file again/);
  assert.match(method, /finally \{\s*if \(this\.business\?\.id === businessId\) this\.importLoading = false;/);
  assert.match(source, /<aba-state-message \[kind\]="importMessageKind" \[description\]="importMessage" \/>/);
});

test('customer CSV import is workspace-scoped and cannot be repeated after a confirmed import', () => {
  const start = source.indexOf('async confirmCustomerImport(): Promise<void>');
  const end = source.indexOf('importErrorLabel(code: string)', start);
  const method = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(method, /const businessId = this\.business\.id/);
  assert.match(method, /const csvText = this\.customerImportCsvText/);
  assert.match(method, /this\.api\.importCustomerCsv\(businessId, csvText\)/);
  assert.match(method, /Successfully imported/);
  assert.match(method, /this\.customerImportCsvText = ''/);
  assert.match(method, /Customers were imported, but the list could not refresh/);
  assert.match(method, /Do not import the file again/);
  assert.match(method, /finally \{\s*if \(this\.business\?\.id === businessId\) this\.customerImportLoading = false;/);
  assert.match(source, /<aba-state-message \[kind\]="customerImportMessageKind" \[description\]="customerImportMessage" \/>/);
});

test('asynchronous CSV file reads and previews cannot leak into a newly selected workspace', () => {
  const productReadStart = source.indexOf('async onImportFileSelected(event: Event)');
  const productReadEnd = source.indexOf('async previewProductImport()', productReadStart);
  const productRead = source.slice(productReadStart, productReadEnd);
  assert.match(productRead, /const businessId = this\.business\?\.id/);
  assert.match(productRead, /if \(this\.business\?\.id !== businessId\) return;/);

  const customerReadStart = source.indexOf('async onCustomerImportFileSelected(event: Event)');
  const customerReadEnd = source.indexOf('async previewCustomerImport()', customerReadStart);
  const customerRead = source.slice(customerReadStart, customerReadEnd);
  assert.match(customerRead, /const businessId = this\.business\?\.id/);
  assert.match(customerRead, /if \(this\.business\?\.id !== businessId\) return;/);

  const previewStart = source.indexOf('async previewProductImport()');
  const previewEnd = source.indexOf('async confirmProductImport()', previewStart);
  const productPreview = source.slice(previewStart, previewEnd);
  assert.match(productPreview, /this\.api\.previewProductCsv\(businessId, csvText\)/);
  assert.match(productPreview, /if \(this\.business\?\.id === businessId\) this\.importPreview = preview/);

  const customerPreviewStart = source.indexOf('async previewCustomerImport()');
  const customerPreviewEnd = source.indexOf('async confirmCustomerImport()', customerPreviewStart);
  const customerPreview = source.slice(customerPreviewStart, customerPreviewEnd);
  assert.match(customerPreview, /this\.api\.previewCustomerCsv\(businessId, csvText\)/);
  assert.match(customerPreview, /if \(this\.business\?\.id === businessId\) this\.customerImportPreview = preview/);
});


test('invoice print and draft edit cannot mix records across a workspace switch', () => {
  const printStart = source.indexOf('async printInvoice(invoice: Invoice)');
  const printEnd = source.indexOf('async editInvoice(invoice: Invoice)', printStart);
  const printMethod = source.slice(printStart, printEnd);
  assert.ok(printStart >= 0 && printEnd > printStart);
  assert.match(printMethod, /const businessSnapshot = this\.business/);
  assert.match(printMethod, /const businessId = businessSnapshot\.id/);
  assert.match(printMethod, /const businessName = businessSnapshot\.name/);
  assert.match(printMethod, /const businessCurrency = businessSnapshot\.currency_code/);
  assert.match(printMethod, /this\.api\.invoiceDetail\(businessId, invoice\.id\)/);
  assert.match(printMethod, /if \(!isCurrent\(\)\) \{\s*printWindow\.close\(\);\s*return;/);
  assert.match(printMethod, /finally \{\s*if \(isCurrent\(\)\) this\.loading = false;/);
  const editStart = source.indexOf('async editInvoice(invoice: Invoice)');
  const editEnd = source.indexOf('cancelInvoiceEdit(): void', editStart);
  const editMethod = source.slice(editStart, editEnd);
  assert.ok(editStart >= 0 && editEnd > editStart);
  assert.match(editMethod, /const businessId = this\.business\.id/);
  assert.match(editMethod, /this\.api\.invoiceDetail\(businessId, invoice\.id\)/);
  assert.match(editMethod, /if \(!isCurrent\(\)\) return;/);
  assert.match(editMethod, /finally \{\s*if \(isCurrent\(\)\) \{/);
});

test('invoice drafts are available to workspace members while issue and void remain owner-only', () => {
  const toolbarStart = source.indexOf('<div class="invoice-toolbar">');
  const filterStart = source.indexOf('<div class="invoice-controls">', toolbarStart);
  const toolbar = source.slice(toolbarStart, filterStart);
  assert.ok(toolbarStart >= 0 && filterStart > toolbarStart);
  assert.match(toolbar, /<aba-invoice-draft-editor/);
  assert.match(toolbar, /\(saveDraft\)="saveInvoiceDraft\(\$event\)"/);

  const rowStart = source.indexOf('@for (invoice of filteredInvoices', filterStart);
  const rowEnd = source.indexOf('</tr>', rowStart);
  const row = source.slice(rowStart, rowEnd);
  assert.ok(rowStart >= 0 && rowEnd > rowStart);
  const draftStart = row.indexOf("@if (invoice.status === 'draft')");
  const issuedStart = row.indexOf("@else if (invoice.status === 'issued')", draftStart);
  const draft = row.slice(draftStart, issuedStart);
  const issued = row.slice(issuedStart);
  assert.ok(draftStart >= 0 && issuedStart > draftStart);
  const draftOwnerGuard = draft.indexOf("@if (business?.role === 'owner')");
  assert.ok(draftOwnerGuard >= 0, 'draft issue and void actions must be inside the owner guard');
  assert.ok(draft.indexOf('editInvoice(invoice)') < draftOwnerGuard, 'workspace members retain draft editing');
  assert.ok(draft.indexOf('issueInvoice(invoice)') > draftOwnerGuard, 'issuing is owner-only');
  assert.ok(draft.indexOf('requestInvoiceVoid(invoice, $event)') > draftOwnerGuard, 'voiding is owner-only');
  const issuedOwnerGuard = issued.indexOf("@if (business?.role === 'owner')");
  assert.ok(issuedOwnerGuard >= 0, 'issued invoice void action must be owner-only');
  assert.ok(issued.indexOf('printInvoice(invoice)') < issuedOwnerGuard, 'workspace members retain invoice printing');
  assert.ok(issued.indexOf('requestInvoiceVoid(invoice, $event)') > issuedOwnerGuard, 'issued invoice voiding is owner-only');

  const saveStart = source.indexOf('async saveInvoiceDraft(payload: InvoiceDraftPayload): Promise<void>');
  const saveEnd = source.indexOf('async refreshInvoiceDraftStatus(): Promise<void>', saveStart);
  const save = source.slice(saveStart, saveEnd);
  assert.match(save, /if \(!this\.business \|\| !this\.signedIn/);
  assert.doesNotMatch(save, /business\.role !== 'owner'/);
  const editStart = source.indexOf('async editInvoice(invoice: Invoice)');
  const editEnd = source.indexOf('cancelInvoiceEdit(): void', editStart);
  const editMethod = source.slice(editStart, editEnd);
  assert.match(editMethod, /if \(!this\.business \|\| !this\.signedIn/);
  assert.doesNotMatch(editMethod, /business\.role !== 'owner'/);
});

test('owner-only invoice mutations fail closed before showing confirmation or calling the API', () => {
  const issueStart = source.indexOf('async issueInvoice(invoice: Invoice)');
  const issueEnd = source.indexOf('requestInvoiceVoid(invoice: Invoice', issueStart);
  const issue = source.slice(issueStart, issueEnd);
  assert.match(issue, /if \(!this\.business \|\| this\.business\.role !== 'owner' \|\| !this\.signedIn/);

  const requestStart = source.indexOf('requestInvoiceVoid(invoice: Invoice, event: MouseEvent)');
  const requestEnd = source.indexOf('cancelInvoiceVoid(): void', requestStart);
  const request = source.slice(requestStart, requestEnd);
  assert.match(request, /if \(!this\.business \|\| this\.business\.role !== 'owner' \|\| !this\.signedIn/);

  const confirmStart = source.indexOf('async confirmInvoiceVoid(): Promise<void>');
  const confirmEnd = source.indexOf('hasOutstandingBalance(', confirmStart);
  const confirm = source.slice(confirmStart, confirmEnd);
  assert.match(confirm, /if \(!invoice \|\| !this\.business \|\| this\.business\.role !== 'owner' \|\| !this\.signedIn/);
  assert.match(confirm, /this\.api\.voidInvoice\(businessId, invoice\.id/);
});

test('owner-only notification and recurring creation controls stay hidden from staff while lists remain visible', () => {
  const notificationStart = source.indexOf("@if (tab === 'notifications')");
  const notificationEnd = source.indexOf("@if (tab === 'suppliers')", notificationStart);
  const notificationView = source.slice(notificationStart, notificationEnd);
  assert.ok(notificationStart >= 0 && notificationEnd > notificationStart);
  assert.match(notificationView, /@if \(business\?\.role === 'owner'\) \{\s*<form #notificationForm="ngForm"/);
  assert.match(notificationView, /Only workspace owners can queue notifications/);
  assert.match(notificationView, /<aba-record-table[^>]*\[rows\]="notificationTableRows"/);

  const recurringStart = source.indexOf("@if (tab === 'recurring')");
  const recurringEnd = source.indexOf("@if (tab === 'health'", recurringStart);
  const recurringView = source.slice(recurringStart, recurringEnd);
  assert.ok(recurringStart >= 0 && recurringEnd > recurringStart);
  assert.match(recurringView, /@if \(business\?\.role === 'owner'\) \{\s*<form #recurringForm="ngForm"/);
  assert.match(recurringView, /Only workspace owners can create recurring invoice schedules/);
  assert.match(recurringView, /<aba-record-table[^>]*\[rows\]="recurringTableRows"/);

  const notificationMethodStart = source.indexOf('async createNotification(): Promise<void>');
  const notificationMethodEnd = source.indexOf('private async loadSuppliers()', notificationMethodStart);
  assert.match(source.slice(notificationMethodStart, notificationMethodEnd), /this\.business\.role !== 'owner'/);
  const recurringMethodStart = source.indexOf('async createRecurringSchedule(): Promise<void>');
  const recurringMethodEnd = source.indexOf('get maxIntegrityTotal()', recurringMethodStart);
  assert.match(source.slice(recurringMethodStart, recurringMethodEnd), /this\.business\.role !== 'owner'/);
});

test('CSV import preview and write controls are owner-only without restricting member record creation', () => {
  assert.match(source, /@if \(business\?\.role === 'owner'\) \{ <details class="aba-record-secondary">[\s\S]*?<section abaCard class="csv-import-panel" \[attr\.aria-label\]="t\('استيراد العملاء من CSV', 'CSV customer import'\)"/);
  assert.match(source, /@if \(business\?\.role === 'owner'\) \{ <details class="aba-record-secondary">[\s\S]*?<section abaCard class="csv-import-panel" \[attr\.aria-label\]="t\('استيراد المنتجات من CSV', 'CSV product import'\)"/);
  assert.match(source, /CSV imports are available to workspace owners only/);
  const methods = [
    ['async onImportFileSelected(event: Event)', 'async previewProductImport()'],
    ['async previewProductImport()', 'async confirmProductImport()'],
    ['async confirmProductImport()', 'async onCustomerImportFileSelected(event: Event)'],
    ['async onCustomerImportFileSelected(event: Event)', 'async previewCustomerImport()'],
    ['async previewCustomerImport()', 'async confirmCustomerImport()'],
    ['async confirmCustomerImport()', 'importErrorLabel(code: string)'],
  ];
  for (const [startMarker, endMarker] of methods) {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start);
    const method = source.slice(start, end);
    assert.ok(start >= 0 && end > start, 'expected method ' + startMarker);
    assert.match(method, /this\.business\?\.role !== 'owner'|this\.business\.role !== 'owner'/,
      startMarker + ' must fail closed for non-owners');
  }
  assert.match(source, /<form #customerForm="ngForm"[^>]*createCustomer\(\)/);
  assert.match(source, /<form #productForm="ngForm"[^>]*createProduct\(\)/);
});

test('assistant source citations use bilingual labels and localized expense categories', () => {
  assert.match(source, /t\('المصادر:', 'Sources:'\)/);
  assert.match(source, /source\.type === 'invoice' \? t\('فاتورة', 'Invoice'\)/);
  assert.match(source, /source\.type === 'expense' \? t\('مصروف', 'Expense'\)/);
  assert.match(source, /expenseCategoryLabel\(source\.category\)/);
});

test('expense categories are localized in the list and available to local search', () => {
  assert.match(source, /category:this\.expenseCategoryLabel\(item\.category\)/);
  assert.match(source, /category => this\.expenseCategoryLabel\(category\)/);
  assert.match(source, /Transport: 'نقل ومواصلات'/);
  assert.match(source, /Transport: 'Transport'/);
});

test('payment methods are localized in the list and available to local search', () => {
  assert.match(source, /method:item\.method\?this\.paymentMethodLabel\(item\.method\)/);
  assert.match(source, /method => this\.paymentMethodLabel\(method\)/);
  assert.match(source, /bank_transfer: 'تحويل بنكي'/);
  assert.match(source, /bank_transfer: 'Bank transfer'/);
});

test('notification status labels are localized in the list and available to local search', () => {
  assert.match(source, /notificationStatusLabel\(item\.status\)/);
  assert.match(source, /notificationStatusLabel\(status\)/);
  assert.match(source, /failed: 'فشل الإرسال'/);
  assert.match(source, /failed: 'Failed'/);
  assert.match(source, /\[status\] \|\| status \|\| this\.t\('حالة غير محددة'/);
});

test('operational health status uses a localized label instead of raw API codes', () => {
  assert.match(source, /operationalHealthStatusLabel\(operationalHealth\.status\)/);
  assert.match(source, /status === 'ok'.*سليم/);
  assert.match(source, /status === 'degraded'.*يحتاج مراجعة/);
  assert.match(source, /return status \|\| this\.t\('حالة غير محددة', 'Unknown status'\)/);
});

test('purchase-order status labels are localized in the list and available to local search', () => {
  assert.match(source, /purchaseOrderStatusLabel\(order\.status\)/);
  assert.match(source, /purchaseOrderStatusLabel\(status\)/);
  assert.match(source, /partially_received: 'مستلم جزئيًا'/);
  assert.match(source, /partially_received: 'Partially received'/);
  assert.match(source, /\[status\] \|\| status \|\| this\.t\('حالة غير محددة'/);
});

test('purchase orders remain creatable by members while receiving and payment writes are owner-only', () => {
  const purchaseStart = source.indexOf("@if (tab === 'purchases')");
  const purchaseEnd = source.indexOf("@if (tab === 'recurring')", purchaseStart);
  const purchaseView = source.slice(purchaseStart, purchaseEnd);
  assert.match(purchaseView, /<form #purchaseForm="ngForm" class="stack" \(ngSubmit\)="purchaseForm\.valid && createPurchaseOrder\(\)">/);
  assert.match(purchaseView, /<aba-record-table[^>]*\[rows\]="purchaseTableRows"[^>]*\(rowAction\)="onPurchaseRecordAction\(\$event\)"/);
  assert.match(source, /actions:this\.business\?\.role==='owner'&&this\.canReceivePurchaseOrder\(order\)\?\[\{id:'receive'/);
  const actionStart = source.indexOf('onPurchaseRecordAction(action:AbaRecordTableActionEvent):void {');
  const actionEnd = source.indexOf('\n  }', actionStart);
  const purchaseAction = source.slice(actionStart, actionEnd);
  assert.ok(actionStart >= 0 && actionEnd > actionStart, 'purchase row action handler must exist');
  assert.match(purchaseAction, /this\.business\?\.role!=='owner'/);
  assert.match(purchaseAction, /!this\.canReceivePurchaseOrder\(order\)/);
  assert.match(purchaseAction, /this\.requestPurchaseOrderReceipt\(order,action\.anchor\)/);

  const receiveStart = source.indexOf('async confirmPurchaseOrderReceipt(): Promise<void>');
  const receiveEnd = source.indexOf('async createRecurringSchedule()', receiveStart);
  const receive = source.slice(receiveStart, receiveEnd);
  assert.match(receive, /this\.business\.role !== 'owner'/);
  assert.match(receive, /!this\.canReceivePurchaseOrder\(order\)/);
  const paymentStart = source.indexOf('async createPayment(): Promise<void>');
  const paymentEnd = source.indexOf('useAssistantSuggestion(', paymentStart);
  const payment = source.slice(paymentStart, paymentEnd);
  assert.match(payment, /businessSnapshot\.role !== 'owner'/);
});

test('local CSV exports follow the backend owner-only export permission', () => {
  assert.equal((source.match(/\(click\)="exportCurrentList\(\)"/g) || []).length, 3,
    'the three current-list export buttons must remain available to owners');
  assert.equal((source.match(/@if \(business\?\.role === 'owner'\) \{ <button class="secondary(?: invoice-export)?" type="button" \(click\)="exportCurrentList\(\)"/g) || []).length, 3);
  const listExportStart = source.indexOf('exportCurrentList(): void');
  const listExportEnd = source.indexOf('syncPaymentCustomer(): void', listExportStart);
  const listExport = source.slice(listExportStart, listExportEnd);
  assert.match(listExport, /if \(!this\.business \|\| this\.business\.role !== 'owner'\) return;/);
  assert.match(listExport, /headers = \['customer_name', 'invoice_number', 'issue_date', 'created_at', 'status', 'total', 'currency', 'remaining_balance'\]/);
  assert.match(listExport, /this\.customerNameForInvoice\(item\.customer_id\)/);
  assert.match(listExport, /item\.status === 'issued' \? item\.outstanding_amount/);
  const paymentExportStart = source.indexOf('exportPaymentsCsv(): void');
  const paymentExportEnd = source.indexOf('async createPayment(): Promise<void>', paymentExportStart);
  assert.match(source.slice(paymentExportStart, paymentExportEnd), /if \(!this\.business \|\| this\.business\.role !== 'owner' \|\| !this\.payments\.length\) return;/);
});

test('workspace switcher announces the current business context accessibly', () => {
  assert.match(source, /<section class="workspace-bar" \[attr\.aria-label\]="t\('مساحة العمل الحالية', 'Current workspace'\)"/);
  assert.match(source, /<strong id="workspace-current-name" aria-live="polite">\{\{ business\.name \}\}<\/strong>/);
  assert.match(source, /<select \[attr\.aria-label\]="t\('اختيار النشاط', 'Select business'\)" aria-describedby="workspace-current-name"/);
  assert.match(source, /\(ngModelChange\)="switchBusiness\(\$event\)"/);
});

test('shared shell uses logical inline positioning for Arabic RTL and English LTR', () => {
  assert.match(source, /\.sidebar\{position:fixed;inset-block:0;inset-inline-end:0;/);
  assert.match(source, /\.main\{margin-inline-end:var\(--aba-layout-sidebar,245px\);/);
  assert.match(source, /\.nav-item\{[^}]*text-align:start;/);
  assert.match(source, /\.home-shortcut-link\{[^}]*text-align:start;/);
  assert.match(source, /\.chat-message\.user-message\{margin-inline-end:auto;margin-inline-start:0;/);
  assert.match(source, /\.nav-item\.active\{[^}]*border-inline-start:3px solid/);
  assert.doesNotMatch(source, /\.shell\.english \.sidebar\{inset:0 0 0 auto\}/);
  assert.doesNotMatch(source, /\.shell\.english \.main\{margin-left:0;margin-right:/);
  assert.doesNotMatch(source, /\.shell\.english \.home-shortcut-link\{text-align:left/);
  assert.doesNotMatch(source, /\.shell\.english \.chat-message\.user-message\{margin-right:auto/);
});


test('RTL release-guide lists and mobile dock active state use logical layout', () => {
  assert.match(releaseGuideSource, /\.release-feature-group ul,\.release-version ul\{[^}]*padding-block-end:14px;padding-inline-start:32px;padding-inline-end:0/);
  assert.doesNotMatch(releaseGuideSource, /\.shell\.english \.release-feature-group ul/);
  assert.match(source, /\.sidebar \.nav-item\.active\{[^}]*border-inline-start:0;/);
  assert.match(source, /\.mobile-more-menu \.nav-item\.active\{border-inline-start:3px solid/);
});

test('session and permission recovery actions remain correct after a language toggle', () => {
  const sessionStart = source.indexOf('get sessionExpired(): boolean');
  const deniedStart = source.indexOf('get accessDenied(): boolean', sessionStart);
  const retryStart = source.indexOf('retry(): void', deniedStart);
  assert.ok(sessionStart >= 0 && deniedStart > sessionStart && retryStart > deniedStart);
  const sessionGetter = source.slice(sessionStart, deniedStart);
  const deniedGetter = source.slice(deniedStart, retryStart);
  assert.match(sessionGetter, /انتهت صلاحية جلسة الدخول/);
  assert.match(sessionGetter, /Your sign-in session is no longer valid/);
  assert.match(deniedGetter, /لا تملك الصلاحية للوصول إلى مساحة العمل/);
  assert.match(deniedGetter, /You do not have permission to access this workspace/);
  assert.match(deniedGetter, /حسابك غير مخوّل للوصول إلى إدارة المنصة/);
  assert.match(deniedGetter, /Your account is not authorized to access platform administration/);
  assert.doesNotMatch(sessionGetter + deniedGetter, /this\.t\(/);
});

test('shared state feedback exposes correct alert, status, and reduced-motion semantics', () => {
  assert.ok(stateMessageSource.includes("[attr.role]"));
  assert.ok(stateMessageSource.includes("'error' ? 'alert' : 'status'"));
  assert.ok(stateMessageSource.includes("[attr.aria-live]"));
  assert.ok(stateMessageSource.includes("'loading' || kind() === 'success' ? 'polite' : null"));
  assert.ok(stateMessageSource.includes('type="button"'));
  assert.ok(stateMessageSource.includes('[disabled]="actionDisabled()"'));
  assert.ok(stateMessageSource.includes('prefers-reduced-motion:reduce'));
});

test('notification and supplier forms expose localized field validation without changing optional fields', () => {
  const notificationStart = source.indexOf('<form #notificationForm="ngForm"');
  const notificationEnd = source.indexOf('</form>', notificationStart);
  const notification = source.slice(notificationStart, notificationEnd);
  assert.ok(notification.includes('notificationForm.valid && createNotification()'));
  for (const [control, id] of [
    ['notificationKindControl', 'notification-kind-error'],
    ['notificationTitleControl', 'notification-title-error'],
    ['notificationBodyControl', 'notification-body-error'],
  ]) {
    assert.ok(notification.includes('#' + control + '="ngModel"'), control);
    const association = `[attr.aria-describedby]="${control}.invalid && (${control}.touched || notificationForm.submitted) ? '${id}' : null"`;
    assert.ok(notification.includes(association), control + ' error association');
    assert.ok(notification.includes(`[attr.aria-invalid]="${control}.invalid && (${control}.touched || notificationForm.submitted) ? 'true' : null"`), control + ' invalid state');
    assert.ok(source.includes('id="' + id + '"'), id);
  }
  assert.match(notification, /<option value="business">/);
  assert.doesNotMatch(notification, /<option value="businesses">/);
  assert.match(source, /notificationKind = 'business';/);
  assert.match(notification, /name="notificationTitle" required maxlength="160"/);
  assert.match(notification, /name="notificationBody" required maxlength="1000"/);
  assert.match(source, /class="form-validation" aria-live="polite"/);

  const supplierStart = source.indexOf('<form #supplierForm="ngForm"');
  const supplierEnd = source.indexOf('</form>', supplierStart);
  const supplier = source.slice(supplierStart, supplierEnd);
  assert.ok(supplier.includes('supplierForm.valid && createSupplier()'));
  assert.ok(supplier.includes('#supplierNameControl="ngModel"'));
  assert.ok(supplier.includes('#supplierEmailControl="ngModel"'));
  assert.ok(supplier.includes(`[attr.aria-describedby]="supplierNameControl.invalid && (supplierNameControl.touched || supplierForm.submitted) ? 'supplier-name-error' : null"`));
  assert.ok(supplier.includes(`[attr.aria-describedby]="supplierEmailControl.invalid && (supplierEmailControl.touched || supplierForm.submitted) ? 'supplier-email-error' : null"`));
  assert.ok(supplier.includes(`[attr.aria-invalid]="supplierEmailControl.invalid && (supplierEmailControl.touched || supplierForm.submitted) ? 'true' : null"`));
  assert.match(supplier, /name="supplierName" required maxlength="160"/);
  assert.match(supplier, /name="supplierEmail" type="email" maxlength="254"/);
  assert.doesNotMatch(supplier, /name="supplierEmail"[^>]*required/);
  assert.ok(source.includes('id="supplier-name-error"'));
  assert.ok(source.includes('id="supplier-email-error"'));
  assert.ok(source.includes('leave this field blank'));
});

test('purchase order and recurring schedule forms expose accessible localized validation', () => {
  const purchaseStart = source.indexOf('<form #purchaseForm="ngForm"');
  const purchaseEnd = source.indexOf('</form>', purchaseStart);
  const purchase = source.slice(purchaseStart, purchaseEnd);
  assert.ok(purchase.includes('purchaseForm.valid && createPurchaseOrder()'));
  const purchaseFields = [
    ['purchaseOrderNumberControl', 'purchase-number-error'],
    ['purchaseSupplierControl', 'purchase-supplier-error'],
    ['purchaseProductControl', 'purchase-product-error'],
    ['purchaseQuantityControl', 'purchase-quantity-error'],
    ['purchaseUnitCostControl', 'purchase-unit-cost-error'],
  ];
  for (const [control, id] of purchaseFields) {
    assert.ok(purchase.includes('#' + control + '="ngModel"'), control);
    assert.ok(purchase.includes(`[attr.aria-describedby]="${control}.invalid && (${control}.touched || purchaseForm.submitted) ? '${id}' : null"`), id);
    assert.ok(source.includes('id="' + id + '"'), id);
  }
  assert.match(purchase, /name="purchaseQuantity" type="number" min="0\.001" step="0\.001" required/);
  assert.match(purchase, /name="purchaseUnitCost" type="number" min="0" step="0\.01" required/);
  assert.match(purchase, /purchasesLoading \|\| !suppliers\.length \|\| !products\.length/);

  const recurringStart = source.indexOf('<form #recurringForm="ngForm"');
  const recurringEnd = source.indexOf('</form>', recurringStart);
  const recurring = source.slice(recurringStart, recurringEnd);
  assert.ok(recurring.includes('recurringForm.valid && createRecurringSchedule()'));
  assert.ok(recurring.includes('name="recurringCustomerId" [(ngModel)]="recurringCustomerId"'));
  assert.doesNotMatch(recurring, /name="recurringCustomerId"[^>]*required/);
  for (const [control, id] of [
    ['recurringIntervalControl', 'recurring-interval-error'],
    ['recurringNextRunControl', 'recurring-next-run-error'],
    ['recurringTimezoneControl', 'recurring-timezone-error'],
  ]) {
    assert.ok(recurring.includes('#' + control + '="ngModel"'), control);
    assert.ok(recurring.includes(`[attr.aria-describedby]="${control}.invalid && (${control}.touched || recurringForm.submitted) ? '${id}' : null"`), id);
    assert.ok(source.includes('id="' + id + '"'), id);
  }
  assert.match(recurring, /name="recurringIntervalDays" type="number" min="1" max="3650" required/);
  assert.match(recurring, /name="recurringTimezone" required maxlength="64"/);
});

test('custom report date filters expose localized errors and never submit invalid dates', () => {
  const profitStart = source.indexOf('<form #profitLossForm="ngForm"');
  const profitEnd = source.indexOf('</form>', profitStart);
  const profit = source.slice(profitStart, profitEnd);
  assert.ok(profit.includes('profitLossForm.valid && loadProfitLoss()'));
  for (const [control, id] of [
    ['profitLossStartControl', 'profit-loss-start-error'],
    ['profitLossEndControl', 'profit-loss-end-error'],
  ]) {
    assert.ok(profit.includes('#' + control + '="ngModel"'));
    assert.ok(profit.includes(`[attr.aria-describedby]="${control}.invalid && (${control}.touched || profitLossForm.submitted) ? '${id}' : null"`));
    assert.ok(profit.includes('id="' + id + '"'));
  }
  assert.match(profit, /name="profitLossStart" required/);
  assert.match(profit, /name="profitLossEnd" required/);

  const agingStart = source.indexOf('<form #agingForm="ngForm"');
  const agingEnd = source.indexOf('</form>', agingStart);
  const aging = source.slice(agingStart, agingEnd);
  assert.ok(aging.includes('agingForm.valid && loadReceivablesAging()'));
  assert.ok(aging.includes('#agingAsOfControl="ngModel"'));
  assert.ok(aging.includes(`[attr.aria-describedby]="agingAsOfControl.invalid && (agingAsOfControl.touched || agingForm.submitted) ? 'aging-as-of-error' : null"`));
  assert.ok(source.includes('id="aging-as-of-error"'));
});

test('chat composer announces empty and whitespace-only drafts without sending a request', () => {
  const start = source.indexOf('<form #chatForm="ngForm" class="chat-form"');
  const end = source.indexOf('</form>', start);
  const form = source.slice(start, end);
  assert.ok(form.includes('chatForm.valid && chatDraft.trim() && sendChat()'));
  assert.ok(form.includes('#chatMessageControl="ngModel"'));
  assert.match(form, /maxlength="2000"[\s\S]*?\brequired/);
  assert.ok(form.includes(`[attr.aria-describedby]="(chatMessageControl.invalid || !chatDraft.trim()) && (chatMessageControl.touched || chatForm.submitted) ? 'chat-message-error' : null"`));
  assert.match(form, /\[disabled\]="chatSending"/);
  assert.doesNotMatch(form, /\[disabled\]="chatSending \|\| !chatDraft\.trim\(\)"/);
  assert.ok(source.includes('id="chat-message-error"'));
  assert.ok(source.includes('Enter your question before sending (up to 2000 characters).'));
  assert.ok(source.includes("if (!this.business || !this.chatDraft.trim() || this.chatSending) return;"));
});

test('workspace build metadata is presented once in the workspace context, not duplicated in the page header', () => {
  assert.match(source, /<div class="workspace-release-meta workspace-release-meta-inline"/);
  assert.doesNotMatch(source, /<div class="workspace-build-card"/);
  assert.doesNotMatch(source, /\.workspace-build-card/);
  assert.match(source, /<div class="topbar-heading"><p class="eyebrow">/);
});

test('operations errors stay scoped to the module that produced them', () => {
  assert.match(source, /operationsErrorTab: OperationsMessageTab \| null = null/);
  for (const tab of ['notifications', 'suppliers', 'purchases', 'recurring']) {
    assert.ok(source.includes(`@if (operationsError && operationsErrorTab === '${tab}')`), tab);
    assert.ok(source.includes(`this.operationsErrorTab = '${tab}'`), tab + ' load/validation error scope');
  }
  assert.match(source, /this\.operationsErrorTab = tab;/);
  assert.match(source, /private beginOperationsAction\(\): void \{\s*this\.operationsError = '';\s*this\.operationsErrorTab = null;/);
  assert.match(source, /private setOperationsSuccess\(tab: OperationsMessageTab, message: string\): void \{\s*this\.operationsErrorTab = null;/);
});

test('invoice customer and dynamic line fields expose accessible localized validation', () => {
  assert.match(invoiceEditorSource, /<label\b/);
  assert.match(invoiceEditorSource, /name="invoiceNumber"/);
  assert.match(invoiceEditorSource, /name="customerId"/);
  assert.match(invoiceEditorSource, /@for \(line of lines; track line\.id(?:; let index = \$index)?\)/);
  assert.ok(invoiceEditorSource.includes("[name]=\"'quantity-' + line.id\""));
  assert.ok(invoiceEditorSource.includes("[name]=\"'description-' + line.id\""));
  assert.ok(invoiceEditorSource.includes("[name]=\"'price-' + line.id\""));
  assert.match(invoiceEditorSource, /this\.saveDraft\.emit\(payload\)/);
  assert.match(invoiceEditorSource, /role="alert"/);
  assert.match(invoiceDraftSource, /Choose a valid customer\./);
  assert.match(invoiceDraftSource, /Add at least one invoice line\./);
  assert.match(invoiceDraftSource, /Every line needs a positive quantity/);
});

test('payment submit remains available to reveal required-field validation', () => {
  const start = source.indexOf('<form #paymentForm="ngForm"');
  const end = source.indexOf('</form>', start);
  const form = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.ok(form.includes('(paymentRetryPending || paymentForm.valid) && createPayment()'));
  assert.match(form, /name="paymentAmount" type="number" min="0\.01" step="0\.01"[^>]*required/);
  assert.ok(form.includes('paymentAmountModel.invalid'));
  assert.ok(form.includes('payment-customer-error'));
  assert.match(form, /<button class="primary" type="submit" \[disabled\]="paymentLoading"/);
  assert.doesNotMatch(form, /\[disabled\]="[^"]*paymentForm\.invalid/);
  assert.match(source, /const amount = String\(this\.paymentAmount \?\? ''\)\.trim\(\)/);
  assert.match(source, /const allocation = String\(this\.paymentAllocationAmount \?\? ''\)\.trim\(\)/);
});

test('Home KPI cards use one column on narrow mobile viewports', () => {
  assert.match(source, /\.metric-grid\{display:grid;grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(source, /@media\(max-width:1050px\)\{\.metric-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}/);
  assert.match(source, /P1 Home hierarchy: keep the four KPI cards readable as a single column on phones/);
  assert.match(source, /@media\(max-width:760px\)\{\.metric-grid\{grid-template-columns:minmax\(0,1fr\)\}\}/);
});

test('quick-access keyboard focus fallback meets the shared semantic focus token', () => {
  assert.match(quickAccessSource, /\.aba-quick-access:focus-visible\{outline:var\(--aba-focus-ring-width, 3px\) solid var\(--aba-color-focus-ring, #2563eb\)/);
  assert.match(quickAccessSource, /:host-context\(\[dir="rtl"\]\) \.aba-quick-access__arrow\{transform:scaleX\(-1\)\}/);
});


test('AI chat composer placeholder follows selected language', () => {
  assert.match(source, /\[placeholder\]="t\('اكتب سؤالك عن نشاطك…', 'Ask a question about your business…'\)"/);
  assert.doesNotMatch(source, /placeholder="اكتب سؤالك عن نشاطك…"/);
});


test('CSV import regions and invoice preview have localized accessible names', () => {
  assert.ok(source.includes(`[attr.aria-label]="t('استيراد العملاء من CSV', 'CSV customer import')"`));
  assert.ok(source.includes(`[attr.aria-label]="t('استيراد المنتجات من CSV', 'CSV product import')"`));
  assert.ok(invoiceEditorSource.includes('aria-labelledby="invoice-summary-heading"'));
  assert.ok(invoiceEditorSource.includes("t('ملخص الفاتورة', 'Invoice summary')"));
  assert.doesNotMatch(source + invoiceEditorSource, /aria-label="(?:CSV customer import|CSV product import|Invoice totals preview)"/);
});

test('OWNER payroll view is loaded only after selecting Employees', () => {
  const start = source.indexOf("@defer (when tab === 'employees' && business.role === 'owner')");
  const placeholder = source.indexOf("} @placeholder {", start);
  const end = source.indexOf("\n            }", placeholder);
  assert.ok(start >= 0 && placeholder > start && end > placeholder,
    'the employee payroll view must have an explicit navigation-triggered defer boundary');
  const deferredView = source.slice(start, placeholder);
  assert.match(deferredView, /<aba-employee-payroll\b/);
  assert.equal((source.match(/<aba-employee-payroll\b/g) || []).length, 1,
    'the payroll component must not be referenced outside its lazy boundary');
  const loadingView = source.slice(placeholder, end);
  assert.match(loadingView, /aba-state-message kind="loading"/);
  assert.match(loadingView, /Loading employees &amp; payroll|Loading employees & payroll/);
  assert.match(source, /imports: \[[^\]]*EmployeePayrollComponent/);
  assert.match(source, /@if \(tab === 'employees' && business\.role === 'owner'\)/);
});


test('workspace-owned views rely on the non-null business context after the empty-workspace guard', () => {
  assert.match(source, /@if \(!business\) \{/);
  assert.match(source, /@if \(tab === 'payments' && business\.role === 'owner'\) \{/);
  assert.match(source, /@if \(tab === 'taxes' && business\.role === 'owner'\) \{/);
  assert.match(source, /@if \(tab === 'employees' && business\.role === 'owner'\) \{/);
  assert.match(source, /@defer \(when tab === 'employees' && business\.role === 'owner'\)/);
  assert.match(source, /\{\{ business\.currency_code \}\}/);
  assert.match(source, /@if \(tab === 'integrity' && business\.role === 'owner'\) \{/);
  assert.doesNotMatch(source, /tab === 'payments' && business\?\.role === 'owner'/);
  assert.doesNotMatch(source, /tab === 'taxes' && business\?\.role === 'owner'/);
  assert.doesNotMatch(source, /tab === 'employees' && business\?\.role/);
  assert.doesNotMatch(source, /tab === 'integrity' && business\?\.role === 'owner'/);
  assert.doesNotMatch(source, /\{\{ business\?\.currency_code \}\}/);
});


test('release guide content is loaded only after navigating to the guide', () => {
  const start = source.indexOf("@defer (when tab === 'release-guide')");
  const placeholder = source.indexOf("} @placeholder {", start);
  const end = source.indexOf("\n            }", placeholder);
  assert.ok(start >= 0 && placeholder > start && end > placeholder,
    'release guide must have an explicit navigation-triggered defer boundary');
  assert.match(source.slice(start, placeholder), /<aba-release-guide\b/);
  assert.equal((source.match(/<aba-release-guide\b/g) || []).length, 1);
  assert.match(source, /import \{ ReleaseGuideComponent \} from '\.\/release-guide\.component';/);
  assert.match(source, /imports: \[[^\]]*ReleaseGuideComponent/);
  assert.doesNotMatch(source, /import \{ FEATURE_CATALOG, RELEASE_HISTORY \} from '\.\/release-guide';/);
});


test('reports and expense forms disclose their preliminary and incurred-not-paid semantics', () => {
  assert.match(source, /t\('نتيجة التشغيل الأولية', 'Preliminary operating result'\)/);
  assert.match(source, /cost of goods sold is not deducted/);
  assert.match(source, /Recording an expense captures when it was incurred; it does not confirm that cash was paid or settled/);
});


test('Home lists every role-authorized module in addition to the five quick-access shortcuts', () => {
  const start = source.indexOf("@if (tab === 'overview')");
  const end = source.indexOf("@if (tab === 'notifications')", start);
  const overview = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(overview, /homeQuickAccessCards/);
  assert.match(overview, /All workspace modules/);
  assert.match(overview, /@for \(module of homeModuleCards; track module\.tab\)/);
  assert.match(overview, /homeModuleCards\.length/);
  assert.match(source, /get homeModuleCards\(\): readonly WorkspaceModuleCard\[\]/);
  assert.match(source, /return WORKSPACE_MODULE_CATALOG\.filter\(module => this\.canAccessTab\(module\.tab\)\)/);
});

test('Home dashboard uses the shared page-level error and retry banner without duplicate alert announcements', () => {
  const start = source.indexOf("@if (tab === 'overview')");
  const end = source.indexOf("@if (tab === 'notifications')", start);
  const overview = source.slice(start, end);
  const sharedError = source.indexOf('@if (error) { <aba-state-message kind="error" [description]="error" [actionLabel]="sessionExpired');
  assert.ok(sharedError >= 0, 'the shared workspace error banner must remain available');
  assert.match(source.slice(sharedError, sharedError + 650), /\[actionLabel\].*Retry/);
  assert.ok(overview.includes('metric-grid--skeleton'), 'Home keeps its non-data KPI skeleton while the shared workspace banner announces loading');
  assert.doesNotMatch(overview, /kind="error" \[description\]="error"/,
    'the Home metrics panel must not repeat the same global error alert');
  assert.match(overview, /@else if \(!error\)[\s\S]*kind="empty"[^>]*No business metrics are available yet/,
    'the empty state must not mislabel a failed dashboard load as a genuine empty result');
});


test('operations lists filter locally by their visible business fields', () => {
  assert.match(source, /get filteredSuppliers\(\): Supplier\[\]/);
  assert.match(source, /get filteredPurchaseOrders\(\): PurchaseOrder\[\]/);
  assert.match(source, /get filteredRecurringSchedules\(\): RecurringInvoiceSchedule\[\]/);
  assert.match(source, /get filteredNotifications\(\): NotificationRecord\[\]/);
  assert.match(source, /filterSuppliers\(this\.suppliers, this\.supplierSearch\)/);
  assert.match(source, /filterPurchaseOrders\(\s*this\.purchaseOrders,\s*this\.purchaseSearch/);
  assert.match(source, /filterRecurringSchedules\(\s*this\.recurringSchedules,\s*this\.recurringSearch/);
  assert.ok(source.includes('filterNotifications(this.notifications, this.notificationSearch, kind => this.notificationKindLabel(kind), status => this.notificationStatusLabel(status))'));
  const clearStart = source.indexOf('private clearWorkspaceData(): void');
  const clearEnd = source.indexOf('\n  }', clearStart);
  const clear = source.slice(clearStart, clearEnd);
  for (const field of ['supplierSearch', 'purchaseSearch', 'recurringSearch', 'notificationSearch']) {
    assert.ok(source.includes(`${field} = '';`), `${field} is initialized`);
    assert.ok(clear.includes(`this.${field} = '';`), `${field} resets on workspace change`);
  }
  assert.match(source, /No suppliers match this search/);
  assert.match(source, /No purchase orders match this search/);
  assert.match(source, /No schedules match this search/);
  assert.match(source, /No notifications match this search/);
});


test('customer section markup does not render stray closing-tag text', () => {
  assert.equal(source.includes('</section>ion>'), false);
});


test('payment and expense lists expose local search and distinguish no-match from no-record states', () => {
  assert.match(source, /get filteredPayments\(\): Payment\[\]/);
  assert.match(source, /get filteredExpenses\(\): Expense\[\]/);
  assert.match(source, /filterPayments\(this\.payments, this\.paymentSearch/);
  assert.ok(source.includes('filterExpenses(this.expenses, this.expenseSearch, category => this.expenseCategoryLabel(category))'));
  assert.match(source, /No payments match this search/);
  assert.match(source, /No expenses match this search/);
  assert.match(source, /name="paymentSearch" type="search"/);
  assert.match(source, /name="expenseSearch" type="search"/);
});


test('notification kind localization covers the current business form value and legacy plural value', () => {
  assert.match(source, /<option value="business">/);
  assert.match(source, /business: \{ ar: 'مساحات العمل', en: 'Businesses' \}/);
  assert.match(source, /businesses: \{ ar: 'مساحات العمل', en: 'Businesses' \}/);
});


test('customer statement event types use bilingual labels while preserving unknown values', () => {
  assert.match(source, /customerStatementEventLabel\(event\.event_type\)/);
  assert.match(source, /invoice_issued: \{ ar: 'إصدار فاتورة', en: 'Invoice issued' \}/);
  assert.match(source, /payment_allocation: \{ ar: 'تخصيص دفعة', en: 'Payment allocation' \}/);
  assert.match(source, /currency_mismatch_allocation: \{ ar: 'تخصيص بعملة غير مطابقة', en: 'Currency-mismatch allocation' \}/);
});


test('shared workspace record tables and Platform Admin tables are named keyboard-accessible regions', () => {
  assert.match(recordTableSource, /class="aba-record-table__viewport" role="region" tabindex="0" \[attr\.aria-label\]="ariaLabel\(\)"/);
  assert.match(recordTableSource, /<caption class="aba-record-table__visually-hidden">/);
  const wrappers = [...platformAdminSource.matchAll(/<div class="table-wrap[^"]*"[^>]*>/g)].map(match => match[0]);
  assert.ok(wrappers.length > 0, 'Platform Admin must retain its table wrappers');
  for (const wrapper of wrappers) {
    assert.match(wrapper, /role="region"/);
    assert.match(wrapper, /tabindex="0"/);
    assert.match(wrapper, /\[attr\.aria-label\]=/);
  }
});


test('AI assistant conversation history is a named keyboard-scrollable log region', () => {
  const log = source.match(/<div class="chat-log"[^>]*>/)?.[0] ?? '';
  assert.match(log, /role="log"/);
  assert.match(log, /tabindex="0"/);
  assert.match(log, /\[attr\.aria-label\]=/);
});

test('unapproved discount and tax rates remain read-only and saved values are preserved', () => {
  assert.match(invoiceEditorSource, /name="invoiceDiscountRate"[^>]*readonly aria-readonly="true"/);
  assert.match(invoiceEditorSource, /name="invoiceTaxRate"[^>]*readonly aria-readonly="true"/);
  assert.doesNotMatch(invoiceEditorSource, /name="invoiceDiscountRate"[^>]*\[\(ngModel\)\]/);
  assert.doesNotMatch(invoiceEditorSource, /name="invoiceTaxRate"[^>]*\[\(ngModel\)\]/);
  assert.match(source, /\[discountRate\]="invoiceDiscountRate"/);
  assert.match(source, /\[taxRate\]="invoiceTaxRate"/);

  const saveStart = source.indexOf('async saveInvoiceDraft(payload: InvoiceDraftPayload): Promise<void>');
  const saveEnd = source.indexOf('async refreshInvoiceDraftStatus(): Promise<void>', saveStart);
  const save = source.slice(saveStart, saveEnd);
  assert.match(save, /discount_rate: String\(discountRate\), tax_rate: String\(taxRate\)/);

  const editStart = source.indexOf('async editInvoice(invoice: Invoice)');
  const editEnd = source.indexOf('cancelInvoiceEdit(): void', editStart);
  const edit = source.slice(editStart, editEnd);
  assert.match(edit, /this\.invoiceDiscountRate = this\.deriveRate\(detail\.discount_total, detail\.subtotal\)/);
  assert.match(edit, /this\.invoiceTaxRate = this\.deriveRate\(detail\.tax_total, taxableBase\.toFixed\(2\)\)/);
  assert.match(edit, /this\.invoiceDraftNotes = detail\.notes \?\? ''/);
});
