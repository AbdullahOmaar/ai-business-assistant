import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { expandTranslationCalls } from './localization-test-helpers.ts';
import { createServiceWorkerUpdateHandler } from './service-worker-update.ts';

const globalStyles = expandTranslationCalls(readFileSync(new URL('../styles.css', import.meta.url), 'utf8'));
const source = expandTranslationCalls(
  readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8')
  + '\n'
  + readFileSync(new URL('./app.component.css', import.meta.url), 'utf8')
);
const auditWorkspaceSource = expandTranslationCalls(readFileSync(new URL('./audit-events-workspace.component.ts', import.meta.url), 'utf8'));
const inventoryApiSource = readFileSync(new URL('./api.service.ts', import.meta.url), 'utf8');
const invoiceEditorSource = expandTranslationCalls(readFileSync(new URL('./invoice-draft-editor.component.ts', import.meta.url), 'utf8'));
const invoiceDraftSource = expandTranslationCalls(readFileSync(new URL('./invoice-draft.ts', import.meta.url), 'utf8'));
const releaseGuideSource = expandTranslationCalls(readFileSync(new URL('./release-guide.component.ts', import.meta.url), 'utf8'));
const platformAdminSource = expandTranslationCalls(readFileSync(new URL('./platform-admin.component.ts', import.meta.url), 'utf8'));
const stateMessageSource = expandTranslationCalls(readFileSync(new URL('./shared/ui/aba-state-message.component.ts', import.meta.url), 'utf8'));
// T18 Slice B (2026-11-21): the loading animation moved from the state-message
// border spinner into aba-loading-logo; the reduced-motion rule moved with it.
const loadingLogoSource = expandTranslationCalls(readFileSync(new URL('./shared/ui/aba-loading-logo.component.ts', import.meta.url), 'utf8'));
const recordTableSource = expandTranslationCalls(readFileSync(new URL('./shared/ui/aba-record-table.component.ts', import.meta.url), 'utf8'));
const quickAccessSource = expandTranslationCalls(readFileSync(new URL('./shared/ui/aba-quick-access-card.component.ts', import.meta.url), 'utf8'));
const workspaceLoadGuardSource = expandTranslationCalls(readFileSync(new URL('./workspace-load-guard.ts', import.meta.url), 'utf8'));
const customerWorkspaceSource = expandTranslationCalls(readFileSync(new URL('./customer-workspace.component.ts', import.meta.url), 'utf8'));
const purchasingWorkspaceSource = expandTranslationCalls(readFileSync(new URL('./purchasing-workspace.component.ts', import.meta.url), 'utf8'));
const customerEditorSource = expandTranslationCalls(readFileSync(new URL('./customer-editor.component.ts', import.meta.url), 'utf8'));
const auditLabelsSource = expandTranslationCalls(readFileSync(new URL('./audit-labels.ts', import.meta.url), 'utf8'));
const reportsWorkspaceSource = expandTranslationCalls(readFileSync(new URL('./reports-workspace.component.ts', import.meta.url), 'utf8'));
// 3A-351: the Home (overview) tab lives in the deferred overview workspace.
const overviewWorkspaceSource = expandTranslationCalls(readFileSync(new URL('./overview-workspace.component.ts', import.meta.url), 'utf8'));
// 3A-351: the AI assistant tab moved into its own deferred workspace component.
const assistantWorkspaceSource = expandTranslationCalls(readFileSync(new URL('./assistant-workspace.component.ts', import.meta.url), 'utf8'));
// 3A-351: the expenses and notifications tabs moved into their own deferred workspaces.
const expensesWorkspaceSource = expandTranslationCalls(readFileSync(new URL('./expenses-workspace.component.ts', import.meta.url), 'utf8'));
const notificationsWorkspaceSource = expandTranslationCalls(readFileSync(new URL('./notifications-workspace.component.ts', import.meta.url), 'utf8'));
// 3A-376: the suppliers tab moved into its own workspace.
const suppliersWorkspaceSource = expandTranslationCalls(readFileSync(new URL('./suppliers-workspace.component.ts', import.meta.url), 'utf8'));
const recurringWorkspaceSource = expandTranslationCalls(readFileSync(new URL('./recurring-workspace.component.ts', import.meta.url), 'utf8'));
const integrityWorkspaceSource = expandTranslationCalls(readFileSync(new URL('./integrity-workspace.component.ts', import.meta.url), 'utf8'));
const reportLabelsSource = expandTranslationCalls(readFileSync(new URL('./report-labels.ts', import.meta.url), 'utf8'));
const mobileHeaderSource = expandTranslationCalls(readFileSync(new URL('./shared/ui/aba-mobile-app-header.component.ts', import.meta.url), 'utf8'));
const workspaceInvitationsSource = readFileSync(new URL('./workspace-invitations.component.ts', import.meta.url), 'utf8');

test('workspace shell imports every tenant guard helper used by its async views', () => {
  assert.match(workspaceLoadGuardSource, /export function isCurrentTenantRequest/);
  const guardImport = source.split('\n').find(line => line.includes("from './workspace-load-guard'"));
  assert.ok(guardImport, 'workspace load guard import must exist');
  assert.ok(guardImport.includes('isCurrentTenantRequest'), 'all referenced tenant guard helpers must be imported');
});



test('mobile More menu has a correctly delimited active-class attribute', () => {
  const buttonStart = source.indexOf('<button #mobileMoreTrigger class="nav-item mobile-more"');
  const buttonEnd = source.indexOf('>', buttonStart);
  const button = source.slice(buttonStart, buttonEnd);
  assert.ok(buttonStart >= 0 && buttonEnd > buttonStart, 'mobile More button must exist');
  assert.match(button, /\[class\.active\]="mobileMoreOpen \|\| isMobileMoreTab\(tab\)"/);
  assert.match(button, /\[attr\.aria-label\]=/);
  assert.match(source, /isMobileMoreTab\(tab: Tab\): boolean/);
  assert.doesNotMatch(button, /isMobileMoreTab\(tab\)""/);
});

const authSource = expandTranslationCalls(readFileSync(new URL('./auth.service.ts', import.meta.url), 'utf8'));

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
  // T18 Slice E (2026-11-21): the invoice search is aba-search-field now; the
  // magnifier lives inside that component (aba-search-field.spec.ts), so the
  // invoice-search-icon positioning class no longer exists in the shell.
  assert.match(source, /<aba-search-field class="invoice-search" name="invoiceSearch"/);
  assert.equal((source.match(/class="invoice-controls"/g) || []).length, 1);
});

test('expense and notification types use selectable, localized options', () => {
  // 3A-351: the expense category select lives in the expenses workspace now.
  assert.match(expensesWorkspaceSource, /name="expenseCategory" required \[\(ngModel\)\]="expenseCategory"/);
  assert.match(expensesWorkspaceSource, /<option value="General">\{\{ t\('عام', 'General'\) \}\}<\/option>/);
  // 3A-351: the notification kind select lives in the notifications workspace now.
  assert.match(notificationsWorkspaceSource, /<select[^>]*name="notificationKind"[^>]*required[^>]*\[\(ngModel\)\]="notificationKind"/);
  assert.match(notificationsWorkspaceSource, /<option value="inventory">/);
  assert.match(notificationsWorkspaceSource, /<option value="reminders">/);
  assert.match(notificationsWorkspaceSource, /<option value="suppliers">/);
  assert.match(notificationsWorkspaceSource, /notificationKindLabel\(item\.kind\)/);
});

test('AI suggestions live outside the chat panel in a compact responsive prompt rail', () => {
  // 3A-351: the assistant tab lives in the deferred assistant workspace now.
  const assistantStart = assistantWorkspaceSource.indexOf('<div class="assistant-workspace"');
  const chatStart = assistantWorkspaceSource.indexOf('<section abaCard class="panel chat-panel">', assistantStart);
  const chatEnd = assistantWorkspaceSource.indexOf('</section>', chatStart);
  const suggestionsStart = assistantWorkspaceSource.indexOf('<aside class="assistant-suggestions"', chatEnd);
  // 3A-351: the component template ends with the assistant-workspace </div>.
  const workspaceEnd = assistantWorkspaceSource.indexOf('</div>', suggestionsStart);
  assert.ok(assistantStart >= 0 && chatStart > assistantStart);
  assert.ok(chatEnd > chatStart && suggestionsStart > chatEnd,
    'suggestions must be a sibling of the chat panel, not inside it');
  assert.ok(workspaceEnd > suggestionsStart, 'suggestions must remain inside the assistant layout');
  assert.ok(assistantWorkspaceSource.includes('.assistant-workspace{display:grid;grid-template-columns:minmax(0,1fr) 228px'));
  assert.ok(assistantWorkspaceSource.includes('.assistant-workspace:not(.has-chat) .assistant-suggestions{grid-row:1}'));
  assert.ok(assistantWorkspaceSource.includes('.assistant-workspace:not(.has-chat) .chat-panel{grid-row:2}'));
  assert.ok(assistantWorkspaceSource.includes('.suggestion-grid{display:grid;grid-template-columns:minmax(0,1fr)'));
  assert.ok(assistantWorkspaceSource.includes('@media(max-width:900px){.assistant-workspace{grid-template-columns:minmax(0,1fr)}'));
  assert.match(assistantWorkspaceSource, /class="suggestion-card"/);
});

test('audit actions and record types have Arabic display labels', () => {
  assert.match(source, /this\.auditActionLabel\(item\.action\)/);
  assert.match(source, /this\.auditTargetLabel\(item\.target_type\)/);
  assert.match(auditLabelsSource, /"invoice\.issued": "audit\.actions\.m_1dgwo7k"/);
  assert.match(auditLabelsSource, /"invoice\.voided": "audit\.actions\.m_1b7zju0"/);
  assert.match(auditWorkspaceSource, /value="invoice\.draft_updated"/);
  assert.match(auditWorkspaceSource, /value="stock\.movement_recorded"/);
  assert.match(auditWorkspaceSource, /value="purchase_order\.approved"/);
  assert.match(auditWorkspaceSource, /value="sales_return\.approved"/);
  assert.match(auditWorkspaceSource, /value="recurring_invoice_schedule\.created"/);
  assert.match(auditLabelsSource, /"supplier\.created": "audit\.actions\.m_n1vp0a"/);
  assert.equal((auditWorkspaceSource.match(/<option value="supplier">/g) || []).length, 1);
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
  assert.match(source, /formatNumber\(invoice\.total\)/);
  assert.match(source, /formatNumber\(invoice\.outstanding_amount\)/);
  assert.match(invoiceEditorSource, /formatNumber\(serverSummary\.subtotal\)/);
  assert.match(invoiceEditorSource, /formatNumber\(serverSummary\??\.discount_total\)/);
  assert.match(invoiceEditorSource, /formatNumber\(serverSummary\??\.tax_total\)/);
  assert.match(invoiceEditorSource, /formatNumber\(serverSummary\.total\)/);
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
  // 3A-351: the P&L basis line lives in the deferred reports workspace now.
  assert.match(reportsWorkspaceSource, /revenueBasisLabel\(profitLoss\.revenue_basis\)/);
  assert.match(reportsWorkspaceSource, /Gross issued invoice total/);
  // 3A-376: the integrity warning label renders in the integrity workspace now.
  assert.match(integrityWorkspaceSource, /integrityWarningLabel\(dataIntegrityReport\.warning\)/);
  assert.match(source, /reportLimitationLabel\(limitation\)/);
});

const apiSource = expandTranslationCalls(readFileSync(new URL('./api.service.ts', import.meta.url), 'utf8'));

test('API requests abort when the backend stalls instead of blocking workspace startup indefinitely', () => {
  assert.match(apiSource, /new AbortController\(\)/);
  assert.match(apiSource, /15_000/);
  assert.match(apiSource, /signal: controller\.signal/);
  assert.match(apiSource, /The request timed out/);
  const requestStart = apiSource.indexOf('private async request<T>');
  const timeoutStart = apiSource.indexOf('const timeoutId = setTimeout', requestStart);
  const responseRead = apiSource.indexOf('return await response.json() as T;', timeoutStart);
  const timeoutClear = apiSource.indexOf('clearTimeout(timeoutId)', timeoutStart);
  assert.ok(timeoutStart >= 0 && responseRead > timeoutStart && timeoutClear > responseRead,
    'the timeout must remain active until the response body is parsed');
});

test('report labels translate the actual backend revenue-basis and integrity-warning wording', () => {
  // 3A-351: the revenue-basis labels moved with the reports workspace; the
  // limitation key map moved to report-labels.ts (shared by the shell's
  // taxes section and the workspace).
  assert.match(reportsWorkspaceSource, /normalized\.includes\('gross issued invoice totals before sales returns'\)/);
  assert.match(reportsWorkspaceSource, /Gross issued invoice totals before sales returns/i);
  assert.match(integrityWorkspaceSource, /This report identifies records for manual review only/i);
  assert.match(reportLabelsSource, /\"uses saved tax totals on issued invoices; it does not recalculate historical taxes\.\": \"app\.reportLimitation\.4\"/);
  assert.match(reportLabelsSource, /\"legacy invoices without customer links are flagged for review, not auto-corrected\.\": \"app\.reportLimitation\.16\"/);
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
  const apiSource = expandTranslationCalls(readFileSync(new URL('./api.service.ts', import.meta.url), 'utf8'));
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


test('desktop sidebar and mobile More share the role-filtered workspace catalogue', () => {
  const sidebarStart = source.indexOf('<aside class="sidebar"');
  const sidebarEnd = source.indexOf('</aside>', sidebarStart);
  const sidebar = source.slice(sidebarStart, sidebarEnd);
  assert.ok(sidebarStart >= 0 && sidebarEnd > sidebarStart);
  assert.doesNotMatch(sidebar, /@if \(business\?\.role === 'owner'\)/);
  assert.doesNotMatch(sidebar, /@if \(platformAdminAvailable\)/);
  assert.match(sidebar, /@for \(group of desktopNavigationGroups; track group\.id\)/);
  assert.match(source, /canAccessWorkspaceTab\(tab, this\.business\?\.role, this\.platformAdminAvailable\)/);
  assert.match(source, /WORKSPACE_MODULE_CATALOG\.filter\(module => this\.canAccessTab\(module\.tab\)\)/);
  assert.match(source, /get mobileMoreGroups\(\): readonly/);
  assert.match(source, /get desktopNavigationGroups\(\): readonly/);
  assert.match(source, /modules: accessibleModules\.filter\(module => module\.mobileGroup === group\.id\)/);
});


test('mobile More navigation renders grouped destinations from the shared catalogue without a sections search', () => {
  const menuStart = source.indexOf('<nav #mobileMoreMenu id="mobile-more-menu"');
  const menuEnd = source.indexOf('</nav>', menuStart);
  const menu = source.slice(menuStart, menuEnd);
  assert.ok(menuStart >= 0 && menuEnd > menuStart);
  assert.doesNotMatch(menu, /role="menu(?:item)?"/);
  assert.doesNotMatch(menu, /mobile-more-search|mobileMoreSearch|type="search"/);
  assert.match(menu, /@for \(group of mobileMoreGroups; track group\.id\)/);
  assert.match(menu, /@for \(module of group\.modules; track module\.tab\)/);
  assert.match(menu, /module\.icon/);
  assert.match(menu, /t\(module\.titleKey\)/);
  assert.doesNotMatch(source, /filteredMobileMoreGroups|mobileMoreSearch/);
});

test('workspace empty states use the shared accessible state component', () => {
  assert.doesNotMatch(source, /<p class="empty">/);
  assert.match(recordTableSource, /<aba-state-message kind="empty"/, "shared record tables provide an accessible empty state");
  assert.ok(((source + auditWorkspaceSource).match(/<aba-state-message kind="error"/g) || []).length >= 17);
  assert.doesNotMatch(source, /<p class="error" role="alert">/);
  assert.doesNotMatch(source, /class="error-banner"/);
  assert.doesNotMatch(source, /class="error" role="alert"/);
  // 3A-371: record-table loading is skeleton list-rows in a status region
  // carrying the loading description (G4 fixed loading), not a text message.
  assert.match(recordTableSource, /aba-record-table__skeletons" role="status"/, "shared record tables provide an accessible loading state");
  assert.match(recordTableSource, /<aba-skeleton variant="list-row" \/>/);
  // 3A-351: the expense and notification success states moved into their
  // workspaces; the count spans the shell and both workspaces.
  // 3A-376: the supplier success state moved too; the count spans all four sources.
  assert.ok(((source + expensesWorkspaceSource + notificationsWorkspaceSource + suppliersWorkspaceSource + recurringWorkspaceSource + integrityWorkspaceSource).match(/<aba-state-message kind="success"/g) || []).length >= 4);
  assert.ok(source.includes('<aba-state-message [kind]'));
  assert.doesNotMatch(source, /<p class="muted" role="status">/);
  assert.doesNotMatch(source, /<p role="status">/);
});

test('workspace panels reuse one section header component instead of duplicating heading markup', () => {
  // 3A-376: the integrity panel's three headers live in its workspace now; the count spans all three sources.
  assert.ok((source.match(/<aba-section-header\b/g) || []).length + (releaseGuideSource.match(/<aba-section-header\b/g) || []).length + (integrityWorkspaceSource.match(/<aba-section-header\b/g) || []).length >= 13);
  assert.equal((source.match(/<div class="section-head"><div><h2>/g) || []).length, 0, 'all simple h2 section headers must use the shared component');
});

test('Home quick access shows only the five key destinations from the shared role-filtered catalogue', () => {
  // 3A-351: the overview tab lives in the deferred overview workspace now.
  const overview = overviewWorkspaceSource;
  const quickStart = overview.indexOf("Quick access");
  const directoryStart = overview.indexOf("All workspace modules");
  const quickAccess = overview.slice(quickStart, directoryStart);
  assert.ok(overviewWorkspaceSource.includes('class="panel module-launcher"'));
  assert.match(source, /get homeQuickAccessCards\(\): readonly WorkspaceModuleCard\[\]/);
  assert.match(source, /return selectHomeQuickAccessModules\(this\.homeModuleCards\)/);
  assert.match(source, /selectHomeQuickAccessModules, WORKSPACE_MODULE_CATALOG/);
  assert.match(source, /WORKSPACE_MODULE_CATALOG\.filter\(module => this\.canAccessTab\(module\.tab\)\)/);
  assert.ok(quickAccess.includes('homeQuickAccessCards.length'));
  assert.match(quickAccess, /@for \(module of homeQuickAccessCards; track module\.tab\)/);
  assert.doesNotMatch(quickAccess, /homeModuleCards/);
  assert.match(overview, /@for \(module of filteredHomeModuleCards; track module\.tab\)/);
  assert.match(overview, /All workspace modules/);
  // 3A-351: navigation from the overview workspace goes through its navigate output.
  assert.match(overview, /activated\)="navigate\.emit\(module\.tab\)"/);
  assert.doesNotMatch(source, /class="quick-card"/);
});


test('chat requests are fenced by workspace, authenticated UID, role and request generation', () => {
  // 3A-351: the assistant tab lives in the deferred assistant workspace now.
  // The shell keeps its own currentChatRequestContext for its remaining loaders.
  assert.match(assistantWorkspaceSource, /private readonly chatRequestGuard = new WorkspaceLoadGuard\(\)/);
  assert.match(assistantWorkspaceSource, /private chatRequestContext\(\): TenantRequestContext/);
  assert.match(assistantWorkspaceSource, /runTenantScopedRequest\([\s\S]*this\.chatRequestGuard/);
  const clearStart = assistantWorkspaceSource.indexOf('ngOnChanges(changes: SimpleChanges): void');
  const clearEnd = assistantWorkspaceSource.indexOf('private chatRequestContext', clearStart);
  const clear = assistantWorkspaceSource.slice(clearStart, clearEnd);
  assert.match(clear, /this\.chatRequestGuard\.invalidate\(\)/);
  assert.match(clear, /this\.chatSending = false/);
  assert.match(assistantWorkspaceSource, /if \(!requestContext\.signedIn \|\| !requestContext\.userId \|\| !requestContext\.role \|\| !requestContext\.workspaceId\) return/);
  assert.match(source, /private currentChatRequestContext\(\): TenantRequestContext/);
});

test('mobile chat adapts to the visual viewport and keeps the composer above the bottom dock', () => {
  // 3A-351: the chat-form layout rules moved with the assistant workspace;
  // the visual-viewport handling and the shell-chrome rules stay in the shell.
  assert.match(source, /window\.visualViewport\?\.addEventListener\('resize'/);
  assert.match(source, /window\.visualViewport\?\.removeEventListener\('resize'/);
  assert.match(source, /--aba-keyboard-inset/);
  assert.match(source, /\[class\.keyboard-open\]="keyboardOpen"/);
  assert.match(assistantWorkspaceSource, /\.chat-form\{position:sticky;bottom:calc\(var\(--aba-keyboard-inset,0px\) \+ var\(--aba-dock-offset,8px\)\)/);
  assert.match(assistantWorkspaceSource, /\.shell\.keyboard-open \.chat-form\{position:fixed;inset-inline:12px;bottom:calc\(var\(--aba-keyboard-inset,0px\) \+ 8px\)/);
  assert.match(source, /\.shell\.keyboard-open \.sidebar/);
  assert.match(source, /\.shell:has\(\.chat-form textarea:focus\) \.sidebar/);
  assert.match(assistantWorkspaceSource, /max-height:25dvh/);
});

test('chat send preserves retry draft behavior and keeps the existing API contract', () => {
  // 3A-351: the assistant tab lives in the deferred assistant workspace now.
  const start = assistantWorkspaceSource.indexOf('async sendChat(): Promise<void>');
  const end = assistantWorkspaceSource.indexOf('private message(error:', start);
  const method = assistantWorkspaceSource.slice(start, end);
  assert.match(method, /this\.api\.chat\(requestContext\.workspaceId, question, history\)/);
  assert.match(method, /this\.chatDraft = question/);
  assert.match(method, /onFinally: \(\) => \{\s*this\.chatSending = false;/);
  assert.doesNotMatch(method, /this\.api\.chat\(this\.business\.id/);
});

const sharedStateSource = expandTranslationCalls(readFileSync(new URL('./shared/ui/aba-state-message.component.ts', import.meta.url), 'utf8'));
const sharedCardSource = expandTranslationCalls(readFileSync(new URL('./shared/ui/aba-card.component.ts', import.meta.url), 'utf8'));
const sharedMetricSource = expandTranslationCalls(readFileSync(new URL('./shared/ui/aba-metric-card.component.ts', import.meta.url), 'utf8'));
const globalStylesSource = expandTranslationCalls(readFileSync(new URL('../styles.css', import.meta.url), 'utf8'));

test('shared state feedback owns info, warning, success, error and accessible action behavior', () => {
  assert.ok(sharedStateSource.includes("AbaStateKind = 'loading' | 'empty' | 'error' | 'success' | 'info' | 'warning'"));
  assert.ok(sharedStateSource.includes("kind() === 'error' ? 'alert' : 'status'"));
  assert.ok(sharedStateSource.includes("kind() === 'loading' || kind() === 'success' ? 'polite' : null"));
  assert.ok(sharedStateSource.includes('aba-state-message--info'));
  assert.ok(sharedStateSource.includes('aba-state-message--warning'));
  assert.ok(sharedStateSource.includes('min-height:44px'));
  // T18 Slice B: the loading animation (and its reduced-motion rule) now lives
  // in aba-loading-logo, which the state-message renders for kind="loading".
  assert.ok(sharedStateSource.includes('<aba-loading-logo [compact]="true" [announce]="false" />'));
  assert.ok(loadingLogoSource.includes('prefers-reduced-motion:reduce'));
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



test('owner-only destinations remain in the shared role-filtered desktop and mobile navigation groups', () => {
  assert.equal(source.includes('<button ?'), false);
  assert.match(source, /get homeModuleCards\(\): readonly WorkspaceModuleCard\[\]/);
  assert.match(source, /WORKSPACE_MODULE_CATALOG\.filter\(module => this\.canAccessTab\(module\.tab\)\)/);
  assert.match(source, /get desktopNavigationGroups\(\): readonly/);
  assert.match(source, /get mobileMoreGroups\(\): readonly/);
  assert.match(source, /@for \(group of desktopNavigationGroups; track group\.id\)/);
  assert.match(source, /@for \(group of mobileMoreGroups; track group\.id\)/);
  assert.match(source, /canAccessWorkspaceTab\(tab, this\.business\?\.role, this\.platformAdminAvailable\)/);
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
  // T18 Slice H: the extracted header's h1 keeps its polite live region. The
  // amber octagram marker is a ::before pseudo-element (design-system.css),
  // not a DOM span inside the h1: a real span adds a second box to
  // Range.getClientRects(), which the mobile E2E title check reads as a
  // second rendered line (2026-11-21 regression at b558cbd). The h1 holds
  // only the title text.
  assert.match(mobileHeaderSource, /<h1 aria-live="polite" aria-atomic="true">\{\{ pageTitle \}\}<\/h1>/);
  assert.doesNotMatch(mobileHeaderSource, /aiba-page-title-marker/);
});


test('mobile module directory and Home shortcuts use adaptive balanced grids', () => {
  // 3A-351: the module-directory and shortcut grids moved with the overview workspace.
  assert.match(overviewWorkspaceSource, /\.module-directory-grid\{display:grid;grid-template-columns:repeat\(auto-fit,minmax\(min\(100%,190px\),1fr\)\)/);
  assert.match(overviewWorkspaceSource, /\.home-shortcut-list\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
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
  assert.match(source, /this\.lastErrorKind === 'session-expired' && this\.error === this\.lastErrorMessage/);
  const formatter = source.slice(source.indexOf('private message(error: unknown'));
  assert.match(formatter, /Authentication required/);
  assert.match(formatter, /Authenticated subject is missing/);
});


test('permission-denied feedback offers a safe return home instead of retrying a forbidden request', () => {
  assert.match(source, /\[actionLabel\]="sessionExpired \? t\('تسجيل الدخول مجددًا', 'Sign in again'\) : accessDenied \? t\('العودة للرئيسية', 'Go to Home'\) : t\('إعادة المحاولة', 'Retry'\)"/);
  assert.match(source, /\(action\)="sessionExpired \? logout\(\) : accessDenied \? setTab\('overview'\) : retry\(\)"/);
  assert.match(source, /get accessDenied\(\): boolean/);
  assert.match(source, /this\.lastErrorKind === 'access-denied' && this\.error === this\.lastErrorMessage/);
  assert.match(source, /Your account is not authorized to access platform administration/);
});


test('operations forms distinguish successful mutations from failed list refreshes', () => {
  const helpersStart = source.indexOf('private beginOperationsAction()');
  // 3A-351: loadNotifications moved into the notifications workspace; the
  // next helper-adjacent method in the shell is the suppliers loader.
  const helpersEnd = source.indexOf('private async loadSuppliers()', helpersStart);
  const helpers = source.slice(helpersStart, helpersEnd);
  assert.match(helpers, /private setOperationsSuccess\(tab: OperationsMessageTab/);
  assert.match(helpers, /private setOperationsFailure\(tab: OperationsMessageTab/);
  assert.match(helpers, /The operation succeeded, but the list could not be refreshed/);
  // 3A-351: createNotification lives in the notifications workspace now;
  // the next method after it there is the shared date formatter.
  const notification = notificationsWorkspaceSource.slice(notificationsWorkspaceSource.indexOf('async createNotification()'), notificationsWorkspaceSource.indexOf('  formatRecordDate('));
  // 3A-376: createSupplier lives in the suppliers workspace now.
  const supplier = suppliersWorkspaceSource.slice(suppliersWorkspaceSource.indexOf('async createSupplier()'), suppliersWorkspaceSource.indexOf('  private beginAction()'));
  // 3A-376: createRecurringSchedule lives in the recurring workspace now.
  const recurring = recurringWorkspaceSource.slice(recurringWorkspaceSource.indexOf('async createRecurringSchedule()'), recurringWorkspaceSource.indexOf('  private beginAction()'));
  assert.match(recurring, /if \(this\.businessId\(\) !== businessId\) return;/,
    'stale operation completions must not update the newly selected workspace');
  // 3A-376: the suppliers workspace guards on its businessId input, like notifications.
  assert.match(supplier, /if \(this\.businessId\(\) !== businessId\) return;/,
    'stale operation completions must not update the newly selected workspace');
  // 3A-351: the notifications workspace guards on its businessId input.
  assert.match(notification, /if \(this\.businessId\(\) !== businessId\) return;/,
    'stale operation completions must not update the newly selected workspace');
  assert.match(notification, /delivery to recipients is not confirmed/);
  assert.match(recurring, /does not generate invoices automatically/);
  assert.ok(purchasingWorkspaceSource.includes('this.isCurrent(this.listGuard, version, requested)'));
  assert.ok(purchasingWorkspaceSource.includes('this.isCurrent(this.actionGuard, version, requested)'));
  assert.ok(purchasingWorkspaceSource.includes('this.api.receivePurchaseOrder'));
  assert.ok(purchasingWorkspaceSource.includes("this.success.set(this.t('receivedSaved'))"));
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
  // 3A-351: the assistant tab lives in the deferred assistant workspace now.
  const start = source.indexOf('async createPayment(): Promise<void>');
  const end = source.indexOf('private captureTenantRequest(', start);
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
  assert.match(source, /<aba-customer-workspace/);
  assert.match(customerWorkspaceSource, /<form class="customer-workspace__search"[^>]*\(submit\)="submitSearch\(\$event\)"/);
  assert.match(customerEditorSource, /<form \(submit\)="submit\(\$event\)"/);
  assert.match(customerEditorSource, /if \(!name \|\| this\.emailInvalid\(\) \|\| this\.busy\(\)\) return/);
  // 3A-351: the expense form lives in the expenses workspace now.
  assert.match(expensesWorkspaceSource, /<form #expenseForm="ngForm"/);
  const paymentStart = source.indexOf('<form #paymentForm="ngForm"');
  const paymentEnd = source.indexOf('</form>', paymentStart);
  const paymentForm = source.slice(paymentStart, paymentEnd);
  assert.ok(paymentStart >= 0 && paymentEnd > paymentStart);
  assert.ok(paymentForm.includes('(paymentRetryPending || paymentForm.valid) && createPayment()'));
  assert.match(invoiceEditorSource, /toInvoiceDraftPayload/);
  assert.match(invoiceEditorSource, /if \(this\.saving \|\| this\.blocked\) return;/);
  assert.match(invoiceEditorSource, /this\.saveDraft\.emit\(payload\)/);
  assert.match(invoiceDraftSource, /if \(error\) throw new RangeError\(error\)/);
  assert.match(invoiceDraftSource, /invoiceDraft\.validation\.customer/);
  assert.match(invoiceDraftSource, /invoiceDraft\.validation\.atLeastOneLine/);
});

test('product form exposes accessible required, non-negative price and conditional stock validation', () => {
  const start = source.indexOf('<form #productForm="ngForm"');
  const end = source.indexOf('</form>', start);
  const form = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(form, /\(ngSubmit\)="productForm\.valid && createProduct\(\)"/);
  assert.match(form, /#productNameModel="ngModel"/);
  assert.match(form, /name="productSku" maxlength="80"/);
  assert.match(form, /name="productDescription"[^>]*maxlength="1000"/);
  assert.match(form, /name="productUnit" maxlength="32" required/);
  assert.match(form, /id="product-name-error" class="field-error" aria-live="polite"/);
  assert.match(form, /#productPriceModel="ngModel"/);
  assert.match(form, /name="productPrice" type="text" inputmode="decimal" pattern=/);
  assert.match(form, /name="productOpeningQuantity" type="text" inputmode="decimal" pattern=/);
  assert.match(form, /id="product-price-error" class="field-error" aria-live="polite"/);
  assert.match(form, /#productOpeningQuantityModel="ngModel"/);
  assert.match(form, /id="product-opening-quantity-error" class="field-error" aria-live="polite"/);
});


test('customer workspace is mounted with safe invoice and statement host callbacks', () => {
  assert.match(source, /<aba-customer-workspace/);
  assert.match(source, /\(invoicesRequested\)="createInvoiceForCustomer\(\$event\)"/);
  assert.match(source, /\(statementRequested\)="openCustomerStatementById\(\$event\)"/);
  assert.match(source, /createInvoiceForCustomer\(customerId: string\)/);
  assert.match(source, /openCustomerStatementById\(customerId: string\)/);
  assert.match(customerWorkspaceSource, /this\.api\.createCustomer\(requested\.businessId, value\)/);
  assert.match(customerWorkspaceSource, /this\.api\.updateCustomer\(requested\.businessId, editingId, value\)/);
  assert.match(customerWorkspaceSource, /this\.isCurrent\(this\.saveGuard/);
});

test('product creation distinguishes saved stock setup from a failed list refresh', () => {
  const start = source.indexOf('async createProduct(): Promise<void>');
  const end = source.indexOf('private deriveRate(', start);
  const method = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(method, /const businessId = this\.business\.id/);
  assert.match(method, /this\.api\.createProduct\(businessId/);
  assert.match(method, /sku: this\.productSku\.trim\(\) \|\| undefined/);
  assert.match(method, /description: this\.productDescription\.trim\(\) \|\| undefined/);
  assert.match(method, /unit: this\.productUnit\.trim\(\) \|\| 'unit'/);
  assert.match(method, /if \(!this\.productName\.trim\(\)\)/);
  assert.match(method, /if \(!this\.productUnit\.trim\(\)\)/);
  assert.match(method, /unit_price: unitPrice/);
  assert.match(method, /opening_quantity: openingQuantity/);
  assert.match(source, /replace\(\/\[٠-٩\]\/g/);
  assert.match(source, /replace\(\/\[۰-۹\]\/g/);
  assert.match(source, /replace\(\/٫\/g, '\.'\)/);
  assert.doesNotMatch(method, /Number\(this\.productPrice\)|toFixed\(2\)/);
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
  assert.match(createMethod, /const openingQuantity = this\.stockTracked && this\.business\.role === 'owner'/,
    'only owners may submit a positive opening quantity');
  assert.match(createMethod, /opening_quantity: openingQuantity/,
    'the validated decimal-string quantity must be sent without floating-point conversion');
  assert.match(createMethod, /unit_price: unitPrice/,
    'the validated decimal-string unit price must be sent without floating-point conversion');

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

  const tableLoopStart = source.indexOf('@for (invoice of visibleInvoices; track invoice.id)', filterStart);
  const tableRowEnd = source.indexOf('</tr>', tableLoopStart);
  const tableRow = source.slice(tableLoopStart, tableRowEnd);
  assert.ok(tableLoopStart >= 0 && tableRowEnd > tableLoopStart);
  const cardContainerStart = source.indexOf('class="invoice-cards"', tableRowEnd);
  const cardLoopStart = source.indexOf('@for (invoice of visibleInvoices; track invoice.id)', cardContainerStart);
  const cardEnd = source.indexOf('</article>', cardLoopStart);
  const card = source.slice(cardLoopStart, cardEnd);
  assert.ok(cardContainerStart >= 0 && cardLoopStart > cardContainerStart && cardEnd > cardLoopStart);
  for (const [surface, markup] of [['compact table', tableRow], ['comfortable cards', card]] as const) {
    const draftStart = markup.indexOf("@if (invoice.status === 'draft')");
    const issuedStart = markup.indexOf("@else if (invoice.status === 'issued')", draftStart);
    const draft = markup.slice(draftStart, issuedStart), issued = markup.slice(issuedStart);
    assert.ok(draftStart >= 0 && issuedStart > draftStart, surface + ' separates draft and issued actions');
    const draftOwnerGuard = draft.indexOf("@if (business?.role === 'owner')");
    assert.ok(draftOwnerGuard >= 0, surface + ': draft issue and void remain owner-only');
    assert.ok(draft.indexOf('editInvoice(invoice)') < draftOwnerGuard);
    assert.ok(draft.indexOf('issueInvoice(invoice)') > draftOwnerGuard);
    assert.ok(draft.indexOf('requestInvoiceVoid(invoice, $event)') > draftOwnerGuard);
    const issuedOwnerGuard = issued.indexOf("@if (business?.role === 'owner')");
    assert.ok(issuedOwnerGuard >= 0, surface + ': issued void remains owner-only');
    assert.ok(issued.indexOf('printInvoice(invoice)') < issuedOwnerGuard);
    assert.ok(issued.indexOf('requestInvoiceVoid(invoice, $event)') > issuedOwnerGuard);
  }

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
  // 3A-351: the notifications view lives in its workspace now; the form
  // stays owner-gated through the role input.
  const notificationView = notificationsWorkspaceSource;
  assert.match(notificationView, /@if \(role\(\) === 'owner'\) \{\s*<form #notificationForm="ngForm"/);
  assert.match(notificationView, /Only workspace owners can queue notifications/);
  assert.match(notificationView, /<aba-record-table[^>]*\[rows\]="notificationTableRows"/);

  // 3A-376: the recurring view lives in its workspace now; the form stays
  // owner-gated through the role input, like notifications.
  const recurringView = recurringWorkspaceSource;
  assert.match(recurringView, /@if \(role\(\) === 'owner'\) \{\s*@if \(showRecurringForm\) \{\s*<form #recurringForm="ngForm"/);
  assert.match(recurringView, /Only workspace owners can create recurring invoice schedules/);
  assert.match(recurringView, /<aba-record-table[^>]*\[rows\]="recurringTableRows"/);

  const notificationMethodStart = notificationsWorkspaceSource.indexOf('async createNotification(): Promise<void>');
  const notificationMethodEnd = notificationsWorkspaceSource.indexOf('  formatRecordDate(', notificationMethodStart);
  assert.match(notificationsWorkspaceSource.slice(notificationMethodStart, notificationMethodEnd), /this\.role\(\) !== 'owner'/);
  // 3A-376: createRecurringSchedule guards on its role input in the workspace.
  const recurringMethodStart = recurringWorkspaceSource.indexOf('async createRecurringSchedule(): Promise<void>');
  const recurringMethodEnd = recurringWorkspaceSource.indexOf('  private beginAction()', recurringMethodStart);
  assert.match(recurringWorkspaceSource.slice(recurringMethodStart, recurringMethodEnd), /this\.role\(\) !== 'owner'/);
});

test('CSV import preview and write controls are owner-only without restricting member record creation', () => {
  assert.match(source, /@if \(business\?\.role === 'owner'\) \{ <details class="aba-record-secondary csv-disclosure">[\s\S]*?<section abaCard class="csv-import-panel" \[attr\.aria-label\]="t\('استيراد العملاء من CSV', 'CSV customer import'\)"/);
  assert.match(source, /@if \(business\?\.role === 'owner'\) \{ <details class="aba-record-secondary csv-disclosure">[\s\S]*?<section abaCard class="csv-import-panel" \[attr\.aria-label\]="t\('استيراد المنتجات من CSV', 'CSV product import'\)"/);
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
  assert.match(customerWorkspaceSource, /<aba-customer-editor/);
  assert.match(customerWorkspaceSource, /this\.api\.createCustomer\(requested\.businessId, value\)/);
  assert.match(customerWorkspaceSource, /readonly role = input\.required<'owner' \| 'staff'>\(\)/);
  assert.match(customerEditorSource, /<form \(submit\)="submit\(\$event\)"/);
  assert.match(source, /<form #productForm="ngForm"[^>]*createProduct\(\)/);
});

test('assistant source citations use bilingual labels and localized expense categories', () => {
  // 3A-351: the assistant tab lives in the deferred assistant workspace now.
  assert.match(assistantWorkspaceSource, /t\('المصادر:', 'Sources:'\)/);
  assert.match(assistantWorkspaceSource, /source\.type === 'invoice' \? t\('فاتورة', 'Invoice'\)/);
  assert.match(assistantWorkspaceSource, /source\.type === 'expense' \? t\('مصروف', 'Expense'\)/);
  assert.match(assistantWorkspaceSource, /expenseCategoryLabel\(source\.category\)/);
});

test('expense categories are localized in the list and available to local search', () => {
  // 3A-351: the expense table and its category labels live in the expenses
  // workspace now.
  assert.match(expensesWorkspaceSource, /category:this\.expenseCategoryLabel\(item\.category\)/);
  assert.match(expensesWorkspaceSource, /category => this\.expenseCategoryLabel\(category\)/);
  assert.match(expensesWorkspaceSource, /Transport: 'app\.expenseCategory\.transport'/);
});

test('payment methods are localized in the list and available to local search', () => {
  assert.match(source, /method:item\.method\?this\.paymentMethodLabel\(item\.method\)/);
  assert.match(source, /method => this\.paymentMethodLabel\(method\)/);
  assert.match(source, /bank_transfer: 'app\.paymentMethod\.bank_transfer'/);
});

test('notification status labels are localized in the list and available to local search', () => {
  // 3A-351: the notification table and its status labels live in the
  // notifications workspace now.
  assert.match(notificationsWorkspaceSource, /notificationStatusLabel\(item\.status\)/);
  assert.match(notificationsWorkspaceSource, /notificationStatusLabel\(status\)/);
  assert.match(notificationsWorkspaceSource, /failed: 'app\.notificationStatus\.failed'/);
  assert.match(notificationsWorkspaceSource, /status \|\| this\.t\('حالة غير محددة', 'Unknown status'/);
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
  assert.match(source, /partially_received: 'app\.purchaseOrderStatus\.partially_received'/);
  assert.match(source, /status \|\| this\.t\('حالة غير محددة', 'Unknown status'/);
});

test('purchase orders remain creatable by members while approval, receiving and payment writes are owner-only', () => {
  // 3A-351: the assistant tab lives in the deferred assistant workspace now.
  assert.ok(purchasingWorkspaceSource.includes("startCreate(): void"));
  assert.ok(purchasingWorkspaceSource.includes("this.api.createPurchaseOrder"));
  assert.ok(purchasingWorkspaceSource.includes("async saveDraft(): Promise<void>"));
  assert.ok(purchasingWorkspaceSource.includes("canEdit(order: PurchaseOrder): boolean { return this.isOwner() && order.status === 'draft'; }"));
  assert.ok(purchasingWorkspaceSource.includes("canApprove(order: PurchaseOrder): boolean { return this.isOwner() && order.status === 'draft'; }"));
  assert.ok(purchasingWorkspaceSource.includes("canCancel(order: PurchaseOrder): boolean { return this.isOwner() && order.status === 'draft'; }"));
  assert.ok(purchasingWorkspaceSource.includes("canReceive(order: PurchaseOrderDetail)"));
  assert.ok(purchasingWorkspaceSource.includes("this.api.approvePurchaseOrder"));
  assert.ok(purchasingWorkspaceSource.includes("this.api.cancelPurchaseOrder"));
  assert.ok(purchasingWorkspaceSource.includes("this.api.receivePurchaseOrder"));
  const paymentStart = source.indexOf('async createPayment(): Promise<void>');
  const paymentEnd = source.indexOf('private captureTenantRequest(', paymentStart);
  const payment = source.slice(paymentStart, paymentEnd);
  assert.match(payment, /businessSnapshot\.role !== 'owner'/);
});

test('local CSV exports follow the backend owner-only export permission', () => {
  assert.equal((source.match(/\(click\)="exportCurrentList\(\)"/g) || []).length, 3,
    'the three current-list export buttons must remain available to owners');
  // 3A-696: the products export joined the tool-class pattern (products-tool).
  assert.equal((source.match(/@if \(business\?\.role === 'owner'\) \{ <button class="secondary(?: invoice-export| customers-tool| products-tool)?" type="button" \(click\)="exportCurrentList\(\)"/g) || []).length, 3);
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
  // 3A-351: the assistant tab lives in the deferred assistant workspace now.
  assert.match(source, /\.sidebar\{position:fixed;inset-block:0;inset-inline-end:0;/);
  assert.match(source, /\.main\{margin-inline-end:var\(--aba-layout-sidebar,245px\);/);
  assert.match(source, /\.nav-item\{[^}]*text-align:start;/);
  assert.match(overviewWorkspaceSource, /\.home-shortcut-link\{[^}]*text-align:start;/);
  assert.match(assistantWorkspaceSource, /\.chat-message\.user-message\{margin-inline-end:auto;margin-inline-start:0;/);
  assert.match(source, /\.nav-item\.active\{[^}]*border-inline-start:3px solid/);
  assert.doesNotMatch(source, /\.shell\.english \.sidebar\{inset:0 0 0 auto\}/);
  assert.doesNotMatch(source, /\.shell\.english \.main\{margin-left:0;margin-right:/);
  assert.doesNotMatch(source, /\.shell\.english \.home-shortcut-link\{text-align:left/);
  assert.doesNotMatch(assistantWorkspaceSource, /\.shell\.english \.chat-message\.user-message\{margin-right:auto/);
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
  assert.match(sessionGetter, /this\.lastErrorKind === 'session-expired'/);
  assert.match(sessionGetter, /this\.error === this\.lastErrorMessage/);
  assert.match(deniedGetter, /this\.lastErrorKind === 'access-denied'/);
  assert.match(deniedGetter, /this\.error === this\.lastErrorMessage/);
  assert.match(source, /this\.lastErrorMessage = translated/);
  assert.doesNotMatch(sessionGetter + deniedGetter, /this\.t\(/);
});

test('shared state feedback exposes correct alert, status, and reduced-motion semantics', () => {
  assert.ok(stateMessageSource.includes("[attr.role]"));
  assert.ok(stateMessageSource.includes("'error' ? 'alert' : 'status'"));
  assert.ok(stateMessageSource.includes("[attr.aria-live]"));
  assert.ok(stateMessageSource.includes("'loading' || kind() === 'success' ? 'polite' : null"));
  assert.ok(stateMessageSource.includes('type="button"'));
  assert.ok(stateMessageSource.includes('[disabled]="actionDisabled()"'));
  // T18 Slice B: the loading animation (and its reduced-motion rule) now lives
  // in aba-loading-logo, which the state-message renders for kind="loading".
  assert.ok(stateMessageSource.includes('<aba-loading-logo [compact]="true" [announce]="false" />'));
  assert.ok(loadingLogoSource.includes('prefers-reduced-motion:reduce'));
});

test('notification and supplier forms expose localized field validation without changing optional fields', () => {
  // 3A-351: the notification form lives in the notifications workspace now.
  const notificationStart = notificationsWorkspaceSource.indexOf('<form #notificationForm="ngForm"');
  const notificationEnd = notificationsWorkspaceSource.indexOf('</form>', notificationStart);
  const notification = notificationsWorkspaceSource.slice(notificationStart, notificationEnd);
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
    assert.ok(notificationsWorkspaceSource.includes('id="' + id + '"'), id);
  }
  assert.match(notification, /<option value="business">/);
  assert.doesNotMatch(notification, /<option value="businesses">/);
  assert.match(notificationsWorkspaceSource, /notificationKind = 'business';/);
  assert.match(notification, /name="notificationTitle" required maxlength="160"/);
  assert.match(notification, /name="notificationBody" required maxlength="1000"/);
  assert.match(notificationsWorkspaceSource, /class="form-validation" aria-live="polite"/);

  // 3A-376: the supplier form lives in the suppliers workspace now.
  const supplierStart = suppliersWorkspaceSource.indexOf('<form #supplierForm="ngForm"');
  const supplierEnd = suppliersWorkspaceSource.indexOf('</form>', supplierStart);
  const supplier = suppliersWorkspaceSource.slice(supplierStart, supplierEnd);
  assert.ok(supplier.includes('supplierForm.valid && createSupplier()'));
  assert.ok(supplier.includes('#supplierNameControl="ngModel"'));
  assert.ok(supplier.includes('#supplierEmailControl="ngModel"'));
  assert.ok(supplier.includes(`[attr.aria-describedby]="supplierNameControl.invalid && (supplierNameControl.touched || supplierForm.submitted) ? 'supplier-name-error' : null"`));
  assert.ok(supplier.includes(`[attr.aria-describedby]="supplierEmailControl.invalid && (supplierEmailControl.touched || supplierForm.submitted) ? 'supplier-email-error' : null"`));
  assert.ok(supplier.includes(`[attr.aria-invalid]="supplierEmailControl.invalid && (supplierEmailControl.touched || supplierForm.submitted) ? 'true' : null"`));
  assert.match(supplier, /name="supplierName" required maxlength="160"/);
  assert.match(supplier, /name="supplierEmail" type="email" maxlength="254"/);
  assert.doesNotMatch(supplier, /name="supplierEmail"[^>]*required/);
  // 3A-376: the supplier field errors render in the suppliers workspace.
  assert.ok(suppliersWorkspaceSource.includes('id="supplier-name-error"'));
  assert.ok(suppliersWorkspaceSource.includes('id="supplier-email-error"'));
  assert.ok(suppliersWorkspaceSource.includes('leave this field blank'));
});

test('purchase order and recurring schedule forms expose accessible localized validation', () => {
  const purchase = purchasingWorkspaceSource;
  assert.ok(purchase.includes('<form class="pw__form" (ngSubmit)="saveDraft()">'));
  assert.ok(purchase.includes('name="orderNumber" maxlength="64" required'));
  assert.ok(purchase.includes('name="supplier" required'));
  assert.ok(purchase.includes('required [(ngModel)]="line.product_id"'));
  assert.ok(purchase.includes('type="text" inputmode="decimal" autocomplete="off" required [(ngModel)]="line.quantity"'));
  assert.ok(purchase.includes('type="text" inputmode="decimal" autocomplete="off" required [(ngModel)]="line.unit_cost"'));
  assert.ok(purchase.includes('role="alert"'));
  assert.ok(purchase.includes("this.formError.set(this.t('invalidLines'))"));

  const recurringStart = recurringWorkspaceSource.indexOf('<form #recurringForm="ngForm"');
  const recurringEnd = recurringWorkspaceSource.indexOf('</form>', recurringStart);
  const recurring = recurringWorkspaceSource.slice(recurringStart, recurringEnd);
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
    assert.ok(recurringWorkspaceSource.includes('id="' + id + '"'), id);
  }
  assert.match(recurring, /name="recurringIntervalDays" type="number" min="1" max="3650" required/);
  assert.match(recurring, /name="recurringTimezone" required maxlength="64"/);
});

test('custom report date filters expose localized errors and never submit invalid dates', () => {
  // 3A-351: both report forms live in the deferred reports workspace now.
  const profitStart = reportsWorkspaceSource.indexOf('<form #profitLossForm="ngForm"');
  const profitEnd = reportsWorkspaceSource.indexOf('</form>', profitStart);
  const profit = reportsWorkspaceSource.slice(profitStart, profitEnd);
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

  const agingStart = reportsWorkspaceSource.indexOf('<form #agingForm="ngForm"');
  const agingEnd = reportsWorkspaceSource.indexOf('</form>', agingStart);
  const aging = reportsWorkspaceSource.slice(agingStart, agingEnd);
  assert.ok(aging.includes('agingForm.valid && loadReceivablesAging()'));
  assert.ok(aging.includes('#agingAsOfControl="ngModel"'));
  assert.ok(aging.includes(`[attr.aria-describedby]="agingAsOfControl.invalid && (agingAsOfControl.touched || agingForm.submitted) ? 'aging-as-of-error' : null"`));
  assert.ok(reportsWorkspaceSource.includes('id="aging-as-of-error"'));
});

test('chat composer announces empty and whitespace-only drafts without sending a request', () => {
  // 3A-351: the assistant tab lives in the deferred assistant workspace now.
  const start = assistantWorkspaceSource.indexOf('<form #chatForm="ngForm" class="chat-form"');
  const end = assistantWorkspaceSource.indexOf('</form>', start);
  const form = assistantWorkspaceSource.slice(start, end);
  assert.ok(form.includes('chatForm.valid && chatDraft.trim() && sendChat()'));
  assert.ok(form.includes('#chatMessageControl="ngModel"'));
  assert.match(form, /maxlength="2000"[\s\S]*?\brequired/);
  assert.ok(form.includes(`[attr.aria-describedby]="(chatMessageControl.invalid || !chatDraft.trim()) && (chatMessageControl.touched || chatForm.submitted) ? 'chat-message-hint chat-message-error' : 'chat-message-hint'"`));
  const textarea = form.slice(form.indexOf('<textarea'), form.indexOf('</textarea>'));
  const sendButton = form.slice(form.indexOf('<button'), form.indexOf('</button>'));
  assert.ok(textarea.includes('[disabled]=\"chatSending\"'));
  assert.ok(!textarea.includes('[disabled]=\"chatSending || !chatDraft.trim()\"'));
  assert.ok(sendButton.includes('[disabled]=\"chatSending || !chatDraft.trim()\"'));
  assert.ok(assistantWorkspaceSource.includes('id="chat-message-error"'));
  assert.ok(assistantWorkspaceSource.includes('Enter your question before sending (up to 2000 characters).'));
  assert.ok(assistantWorkspaceSource.includes("if (!this.businessId() || !this.chatDraft.trim() || this.chatSending) return;"));
});

test('workspace build metadata is presented once in the workspace context, not duplicated in the page header', () => {
  assert.match(source, /<div class="workspace-release-meta workspace-release-meta-inline"/);
  assert.doesNotMatch(source, /<div class="workspace-build-card"/);
  assert.doesNotMatch(source, /\.workspace-build-card/);
  assert.match(source, /<div class="topbar-heading"><p class="eyebrow">/);
});

test('operations errors stay scoped to the module that produced them', () => {
  assert.match(source, /operationsErrorTab: OperationsMessageTab \| null = null/);
  // 3A-351: the notifications error scope lives in the notifications
  // workspace now (its own operations state copy); the other tabs stay.
  // 3A-376: the recurring error scope is its workspace's local notice state.
  assert.ok(recurringWorkspaceSource.includes('<aba-state-message kind="error" [description]="noticeError"'), 'recurring');
  assert.ok(recurringWorkspaceSource.includes('this.noticeError = this.message(error)'), 'recurring load/validation error scope');
  // 3A-376: the suppliers error scope is the workspace's local notice state.
  assert.ok(suppliersWorkspaceSource.includes('<aba-state-message kind="error" [description]="noticeError"'), 'suppliers');
  assert.ok(suppliersWorkspaceSource.includes('this.noticeError = this.message(error)'), 'suppliers load/validation error scope');
  assert.ok(notificationsWorkspaceSource.includes(`@if (operationsError && operationsErrorTab === 'notifications')`), 'notifications');
  assert.ok(notificationsWorkspaceSource.includes(`this.operationsErrorTab = 'notifications'`), 'notifications load/validation error scope');
  assert.match(source, /this\.operationsErrorTab = tab;/);
  assert.match(source, /private beginOperationsAction\(\): void \{/);
  assert.ok(purchasingWorkspaceSource.includes("readonly error = signal('')"));
  assert.ok(purchasingWorkspaceSource.includes("readonly detailError = signal('')"));
  assert.ok(purchasingWorkspaceSource.includes("readonly formError = signal('')"));
  assert.ok(purchasingWorkspaceSource.includes("readonly receiptError = signal('')"));
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
  assert.match(invoiceDraftSource, /invoiceDraft\.validation\.customer/);
  assert.match(invoiceDraftSource, /invoiceDraft\.validation\.atLeastOneLine/);
  assert.match(invoiceDraftSource, /invoiceDraft\.validation\.quantity/);
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

test('Home KPI cards keep two flexible columns on narrow mobile viewports', () => {
  // T18 Slice U01 (2026-11-21): the old single-column rule (and its "P1 Home
  // hierarchy" comment) is removed. It never won the cascade — the later
  // two-column rule in the same file and the design-system two-column rules
  // override it — and it contradicted the two-column phone contract. The
  // cards stay fixed-height (aba-metric-card) and flexible-width.
  assert.match(source, /\.metric-grid\{display:grid;grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(source, /@media\(max-width:1050px\)\{\.metric-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}/);
  assert.doesNotMatch(source, /\.metric-grid\{grid-template-columns:minmax\(0,1fr\)\}/,
    'no single-column KPI rule may remain in the shell stylesheet');
  assert.doesNotMatch(source, /keep the four KPI cards readable as a single column on phones/,
    'the stale single-column intent comment is gone with the rule');
  assert.ok(source.includes('.metric-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}'),
    'the narrow mobile grid stays two flexible columns');
});

test('quick-access keyboard focus fallback meets the shared semantic focus token', () => {
  assert.match(quickAccessSource, /\.aba-quick-access:focus-visible\{outline:var\(--aba-focus-ring-width, 3px\) solid var\(--aba-color-focus-ring, #2563eb\)/);
  assert.match(quickAccessSource, /:host-context\(\[dir="rtl"\]\) \.aba-quick-access__arrow\{transform:scaleX\(-1\)\}/);
});


test('AI chat composer placeholder follows selected language', () => {
  // 3A-351: the assistant tab lives in the deferred assistant workspace now.
  assert.match(assistantWorkspaceSource, /\[placeholder\]="t\('اكتب سؤالك عن نشاطك…', 'Ask a question about your business…'\)"/);
  assert.doesNotMatch(assistantWorkspaceSource, /placeholder="اكتب سؤالك عن نشاطك…"/);
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
  // 3A-371: defer placeholders render the shared skeleton placeholder
  // component (G4 fixed loading), not a text message; the component keeps
  // the loading description in a status region for assistive tech.
  assert.match(loadingView, /<aba-defer-placeholder \[description\]="t\([^)]*Loading employees & payroll/);
  assert.match(source, /AbaDeferPlaceholderComponent/);
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
  // 3A-351: the P&L title and limitation text live in the deferred reports
  // workspace now; the expense semantics live in the expenses workspace.
  assert.match(reportsWorkspaceSource, /t\('نتيجة التشغيل الأولية', 'Preliminary operating result'\)/);
  assert.match(reportsWorkspaceSource, /cost of goods sold is not deducted/);
  assert.match(expensesWorkspaceSource, /Recording an expense captures when it was incurred; it does not confirm that cash was paid or settled/);
});


test('Home lists every role-authorized module in addition to the five quick-access shortcuts', () => {
  // 3A-351: the overview tab lives in the deferred overview workspace now.
  const overview = overviewWorkspaceSource;
  const start = 0;
  const end = overview.length;
  assert.ok(start >= 0 && end > start);
  assert.match(overview, /homeQuickAccessCards/);
  assert.match(overview, /All workspace modules/);
  assert.match(overview, /@for \(module of filteredHomeModuleCards; track module\.tab\)/);
  assert.match(overview, /homeModuleCards\.length/);
  assert.match(source, /get homeModuleCards\(\): readonly WorkspaceModuleCard\[\]/);
  assert.match(source, /return WORKSPACE_MODULE_CATALOG\.filter\(module => this\.canAccessTab\(module\.tab\)\)/);
});

test('Home dashboard uses the shared page-level error and retry banner without duplicate alert announcements', () => {
  // 3A-351: the overview tab lives in the deferred overview workspace now.
  const overview = overviewWorkspaceSource;
  const start = 0;
  const end = overview.length;
  const sharedError = source.indexOf('@if (error) { <aba-state-message kind="error" [description]="error" [actionLabel]="sessionExpired');
  assert.ok(sharedError >= 0, 'the shared workspace error banner must remain available');
  assert.match(source.slice(sharedError, sharedError + 650), /\[actionLabel\].*Retry/);
  assert.ok(overview.includes('metric-grid--skeleton'), 'Home keeps its non-data KPI skeleton while the shared workspace banner announces loading');
  assert.doesNotMatch(overview, /kind="error" \[description\]="error"/,
    'the Home metrics panel must not repeat the same global error alert');
  assert.match(overview, /@else if \(!error\(\)\)[\s\S]*kind="empty"[^>]*No business metrics are available yet/,
    'the empty state must not mislabel a failed dashboard load as a genuine empty result');
});


test('operations lists filter locally by their visible business fields', () => {
  // 3A-376: the suppliers filter lives in the suppliers workspace now.
  assert.match(suppliersWorkspaceSource, /get filteredSuppliers\(\): Supplier\[\]/);
  assert.match(recurringWorkspaceSource, /get filteredRecurringSchedules\(\): RecurringInvoiceSchedule\[\]/);
  // 3A-351: the notifications filter lives in the notifications workspace now.
  assert.match(notificationsWorkspaceSource, /get filteredNotifications\(\): NotificationRecord\[\]/);
  assert.match(suppliersWorkspaceSource, /filterSuppliers\(this\.suppliers, this\.supplierSearch, this\.localization\.locale\)/);
  assert.match(recurringWorkspaceSource, /filterRecurringSchedules\(\s*this\.recurringSchedules/);
  assert.match(notificationsWorkspaceSource, /filterNotifications\(this\.notifications/);
  assert.ok(purchasingWorkspaceSource.includes('readonly filteredOrders = computed'));
  assert.ok(purchasingWorkspaceSource.includes('this.search().trim().toLocaleLowerCase()'));
  assert.ok(purchasingWorkspaceSource.includes('this.supplierName(order.supplier_id)'));
  assert.ok(purchasingWorkspaceSource.includes('this.statusLabel(order.status)'));
  assert.match(suppliersWorkspaceSource, /supplierSearch\.trim\(\) \? t\(/);
  assert.match(recurringWorkspaceSource, /recurringSearch\.trim\(\) \? t\(/);
  assert.match(notificationsWorkspaceSource, /notificationSearch\.trim\(\) \? t\(/);
});

test('customer section markup does not render stray closing-tag text', () => {
  assert.equal(source.includes('</section>ion>'), false);
});


test('payment and expense lists expose local search and distinguish no-match from no-record states', () => {
  assert.match(source, /get filteredPayments\(\): Payment\[\]/);
  // 3A-351: the expenses filter lives in the expenses workspace now.
  assert.match(expensesWorkspaceSource, /get filteredExpenses\(\): Expense\[\]/);
  assert.match(source, /filterPayments\(\s*this\.payments,\s*this\.paymentSearch/);
  assert.match(expensesWorkspaceSource, /filterExpenses\(this\.expenses, this\.expenseSearch, category => this\.expenseCategoryLabel\(category\), this\.localization\.locale\)/);
  assert.match(source, /paymentSearch\.trim\(\) \? t\(/);
  assert.match(expensesWorkspaceSource, /expenseSearch\.trim\(\) \? t\(/);
  // T18 Slice E (2026-11-21): the payment/expense searches are aba-search-field
  // components now; the type="search" input lives inside the component, and the
  // shell keeps the same name and [(ngModel)] binding on the component element.
  assert.match(source, /<aba-search-field name="paymentSearch"/);
  assert.match(expensesWorkspaceSource, /<aba-search-field name="expenseSearch"/);
});


test('notification kind localization covers the current business form value and legacy plural value', () => {
  // 3A-351: the notification kind options and labels live in the
  // notifications workspace now.
  assert.match(notificationsWorkspaceSource, /<option value="business">/);
  assert.match(notificationsWorkspaceSource, /business: 'app\.notificationKind\.business'/);
  assert.match(notificationsWorkspaceSource, /businesses: 'app\.notificationKind\.businesses'/);
});


test('customer statement event types use bilingual labels while preserving unknown values', () => {
  assert.match(source, /customerStatementEventLabel\(event\.event_type\)/);
  assert.match(source, /invoice_issued: 'app\.customerStatementEvent\.invoice_issued'/);
  assert.match(source, /payment_allocation: 'app\.customerStatementEvent\.payment_allocation'/);
  assert.match(source, /payment_received: 'app\.customerStatementEvent\.payment_received'/);
  assert.match(source, /currency_mismatch_allocation: 'app\.customerStatementEvent\.currency_mismatch_allocation'/);
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
  // 3A-351: the assistant tab lives in the deferred assistant workspace now.
  const log = assistantWorkspaceSource.match(/<div #chatLog class="chat-log"[^>]*>/)?.[0] ?? '';
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


test('AI assistant new-chat control resets only in-memory conversation state', () => {
  // 3A-351: the assistant tab lives in the deferred assistant workspace now.
  const start = assistantWorkspaceSource.indexOf('startNewChat(): void');
  const end = assistantWorkspaceSource.indexOf('async copyAssistantMessage(', start);
  const method = assistantWorkspaceSource.slice(start, end);
  assert.ok(method.includes('if (this.chatSending) return;'));
  assert.ok(method.includes('this.chatMessages = [];'));
  assert.ok(method.includes("this.chatDraft = '';"));
  assert.ok(method.includes("this.chatError = '';"));
  assert.ok(method.includes('this.chatConfigurationMissing = false;'));
  assert.ok(method.includes('this.chatCopyStatus = null;'));
  assert.ok(!method.includes('this.api.'));
  assert.ok(!method.includes('this.auth.'));
  assert.ok(!method.includes('localStorage'));
  assert.ok(!method.includes('sessionStorage'));
});

test('AI assistant response copy is explicitly click initiated and always removes its fallback input', () => {
  // 3A-351: the assistant tab lives in the deferred assistant workspace now.
  const copyStart = assistantWorkspaceSource.indexOf('async copyAssistantMessage(');
  const fallbackStart = assistantWorkspaceSource.indexOf('private copyTextWithSelectionFallback(', copyStart);
  const copyEnd = assistantWorkspaceSource.indexOf('private isChatLogNearBottom()', fallbackStart);
  const copy = assistantWorkspaceSource.slice(copyStart, fallbackStart);
  const fallback = assistantWorkspaceSource.slice(fallbackStart, copyEnd);
  assert.ok(copy.includes('if (navigator.clipboard?.writeText)'));
  assert.ok(copy.includes('await navigator.clipboard.writeText(content);'));
  assert.ok(copy.includes('this.copyTextWithSelectionFallback(content);'));
  assert.ok(copy.includes('this.chatCopyStatus = { index, success: true };'));
  assert.ok(copy.includes('this.chatCopyStatus = { index, success: false };'));
  assert.ok(fallback.includes('finally {'));
  assert.ok(fallback.includes('temporaryInput.remove();'));
  assert.ok(assistantWorkspaceSource.includes('(click)="copyAssistantMessage(message.content, messageIndex)"'));
  assert.ok(!copy.includes('fetch('));
  assert.ok(!copy.includes('this.api.'));
});

test('AI assistant keyboard submission preserves multiline entry and IME composition', () => {
  // 3A-351: the assistant tab lives in the deferred assistant workspace now.
  const start = assistantWorkspaceSource.indexOf('handleChatKeydown(event: KeyboardEvent): void');
  const end = assistantWorkspaceSource.indexOf('startNewChat(): void', start);
  const method = assistantWorkspaceSource.slice(start, end);
  assert.ok(method.includes("event.key !== 'Enter'"));
  assert.ok(method.includes('event.shiftKey'));
  assert.ok(method.includes('event.isComposing'));
  assert.ok(method.includes('event.preventDefault();'));
  assert.ok(method.includes('if (!this.chatDraft.trim() || this.chatSending) return;'));
  assert.ok(assistantWorkspaceSource.includes('Shift + Enter for a new line'));
  assert.ok(assistantWorkspaceSource.includes('{{ chatDraft.length }} / 2000'));
});

test('AI assistant conversation log announces additions and exposes active request state', () => {
  // 3A-351: the assistant tab lives in the deferred assistant workspace now.
  const logStart = assistantWorkspaceSource.indexOf('<div #chatLog class="chat-log"');
  const logEnd = assistantWorkspaceSource.indexOf('>', logStart);
  const log = assistantWorkspaceSource.slice(logStart, logEnd + 1);
  assert.ok(log.includes('role="log"'));
  assert.ok(log.includes('aria-live="polite"'));
  assert.ok(log.includes('aria-relevant="additions"'));
  assert.ok(log.includes('aria-atomic="false"'));
  assert.ok(log.includes("chatSending ? 'true' : null"));
  assert.ok(assistantWorkspaceSource.includes('.assistant-workspace:not(.has-chat) .assistant-suggestions{grid-row:1}'));
  assert.ok(assistantWorkspaceSource.includes('.assistant-workspace:not(.has-chat) .chat-panel{grid-row:2}'));
});

test('AI assistant template uses null-safe copy feedback and a typed key event expression', () => {
  // 3A-351: the assistant tab lives in the deferred assistant workspace now.
  assert.ok(assistantWorkspaceSource.includes('chatCopyStatus?.success'));
  assert.ok(assistantWorkspaceSource.includes('handleChatKeydown($any($event))'));
  assert.ok(!assistantWorkspaceSource.includes('(keydown.enter)="handleChatKeydown($event)"'));
});

test('AI assistant resets transient copy feedback when workspace context changes', () => {
  // 3A-351: the shell's clearWorkspaceData reset is now the assistant
  // workspace's ngOnChanges on businessId.
  const start = assistantWorkspaceSource.indexOf('ngOnChanges(changes: SimpleChanges): void');
  const end = assistantWorkspaceSource.indexOf('private chatRequestContext', start);
  const clear = assistantWorkspaceSource.slice(start, end);
  assert.ok(clear.includes('this.chatMessages = [];'));
  assert.ok(clear.includes('this.chatCopyStatus = null;'));
  assert.ok(clear.includes("this.chatError = '';"));
  assert.ok(clear.includes('this.chatConfigurationMissing = false;'));
  assert.ok(clear.includes('this.chatRequestGuard.invalidate();'));
});

test('AI assistant auto-follow respects the reader position and reduced motion', () => {
  // 3A-351: the assistant tab lives in the deferred assistant workspace now.
  const start = assistantWorkspaceSource.indexOf('private scrollChatToLatest(force = false): void');
  const end = assistantWorkspaceSource.indexOf('async sendChat(): Promise<void>', start);
  const method = assistantWorkspaceSource.slice(start, end);
  assert.ok(method.includes('!force && !this.isChatLogNearBottom()'));
  assert.ok(method.includes('prefers-reduced-motion'));
  assert.ok(method.includes("behavior: reducedMotion ? 'auto' : 'smooth'"));
});


test('purchase-order approval is owner-only, confirmation-first and tenant-reset safe', () => {
  assert.ok(purchasingWorkspaceSource.includes("canApprove(order: PurchaseOrder): boolean { return this.isOwner() && order.status === 'draft'; }"));
  assert.ok(purchasingWorkspaceSource.includes("requestAction(action: PurchaseAction): void"));
  assert.ok(purchasingWorkspaceSource.includes("this.pendingAction.set(action)"));
  assert.ok(purchasingWorkspaceSource.includes("async confirmAction(): Promise<void>"));
  assert.ok(purchasingWorkspaceSource.includes("if (!action || !order || !this.isOwner()) return;"));
  assert.ok(purchasingWorkspaceSource.includes("this.api.approvePurchaseOrder(requested.businessId, order.id)"));
  assert.ok(purchasingWorkspaceSource.includes("this.isCurrent(this.actionGuard, version, requested)"));
  assert.ok(apiSource.includes("'/purchase-orders/' + encodeURIComponent(orderId) + '/approve'"));
  assert.ok(purchasingWorkspaceSource.includes("this.api.receivePurchaseOrder"));
});

test('installed PWA announces a newly activated service worker and offers an explicit refresh', () => {
  assert.ok(source.includes('appUpdateAvailable = false;'));
  assert.ok(source.includes('role="status" aria-live="polite"'));
  assert.ok(source.includes('A new app version is ready. Refresh to continue with the latest version.'));
  assert.ok(source.includes('(click)="reloadAppAfterUpdate()"'));
  assert.ok(source.includes('createServiceWorkerUpdateHandler('));
  assert.match(source, /addEventListener\('controllerchange', handleControllerChange\)/);
  assert.match(source, /reloadAppAfterUpdate\(\): void/);
  assert.match(source, /window\.location\.reload\(\)/);
});

test('the first service-worker control acquisition is silent and the next replacement announces one update', () => {
  let updateNotices = 0;
  const onControllerChange = createServiceWorkerUpdateHandler(false, () => { updateNotices += 1; });

  onControllerChange();
  assert.equal(updateNotices, 0, 'initial installation/control acquisition must not show an update');
  onControllerChange();
  assert.equal(updateNotices, 1, 'the next controller replacement must announce the update');
  onControllerChange();
  assert.equal(updateNotices, 1, 'one page lifecycle must announce at most one update');
});

test('an already-controlled page announces its next service-worker replacement', () => {
  let updateNotices = 0;
  const onControllerChange = createServiceWorkerUpdateHandler(true, () => { updateNotices += 1; });

  onControllerChange();
  assert.equal(updateNotices, 1, 'an installed page receiving a replacement worker must announce it');
  onControllerChange();
  assert.equal(updateNotices, 1);
});

test('public sign-in shell keeps the PWA install action and fallback available before authentication', () => {
  const authStart = source.indexOf('} @else if (!signedIn) {');
  const authEnd = source.indexOf('} @else {', authStart);
  const auth = source.slice(authStart, authEnd);
  assert.ok(auth.includes('auth-mobile-install'));
  assert.ok(auth.includes('@if (!isInstalled)'));
  assert.ok(auth.includes('(click)="installApp()"'));
  assert.ok(auth.includes('installHelp && !isInstalled'));
  assert.ok(auth.includes('If no install prompt appears'));
});

test('PWA update notice stays touch-sized and readable in forced-colors mode', () => {
  assert.match(globalStyles, /\.app-update-notice button \{[\s\S]*?min-height: 44px;/);
  const noticeStylesStart = globalStyles.indexOf('.app-update-notice {');
  const noticeStyles = globalStyles.slice(noticeStylesStart);
  const forcedColorsStart = noticeStyles.indexOf('@media (forced-colors: active)');
  const forcedColors = noticeStyles.slice(forcedColorsStart);
  assert.ok(forcedColors.includes('.app-update-notice {'));
  assert.ok(forcedColors.includes('background: Canvas;'));
  assert.ok(forcedColors.includes('color: CanvasText;'));
  assert.ok(forcedColors.includes('color: ButtonText;'));
});


test('inventory ledger is mounted inside the existing Products workspace with current tenant identity', () => {
  const ledgerIndex = source.indexOf('<aba-inventory-movement-ledger');
  const productsTabIndex = source.lastIndexOf("@if (tab === 'products' && business?.id)", ledgerIndex);
  const invoicesTabIndex = source.indexOf("@if (tab === 'invoices')", ledgerIndex);
  assert.ok(ledgerIndex >= 0 && productsTabIndex >= 0 && invoicesTabIndex > ledgerIndex,
    'ledger must remain nested in the existing Products tab, without a new route');
  const mount = source.slice(ledgerIndex, source.indexOf('/>', ledgerIndex));
  assert.match(mount, /\[businessId\]="business\.id"/);
  assert.match(mount, /\[userId\]="workspaceUserId"/);
  assert.match(mount, /business\.role === 'owner' \? 'owner' : 'staff'/);
  assert.match(mount, /\[products\]="products"/);
  assert.match(mount, /\[language\]="language"/);
  assert.match(mount, /\[loadPage\]="loadInventoryMovementPage"/);
  assert.match(source, /InventoryMovementLedgerComponent/);
  assert.match(source, /loadInventoryMovementPage = query => this\.api\.inventoryMovements/);
  assert.match(source, /referenceType: query\.referenceType \|\| undefined/);
});

test('inventory movement API uses authenticated tenant-scoped GET with bounded read filters', () => {
  const start = inventoryApiSource.indexOf('inventoryMovements(');
  const end = inventoryApiSource.indexOf('\n  product(', start);
  assert.ok(start >= 0 && end > start, 'typed inventory movement method must exist before product detail');
  const method = inventoryApiSource.slice(start, end);
  assert.match(method, /businesses\/\$\{encodeURIComponent\(businessId\)\}\/inventory\/movements/);
  assert.match(method, /params\.set\('product_id'/);
  assert.match(method, /params\.set\('movement_type'/);
  assert.match(method, /params\.set\('reference_type'/);
  assert.match(method, /Math\.min\(200, Math\.max\(1, limit\)\)/);
  assert.match(method, /Math\.max\(0, offset\)/);
  assert.match(method, /request<StockMovementPage>/);
  assert.doesNotMatch(method, /'POST'|'PUT'|'PATCH'|'DELETE'/);
});


test('invoice detail drawer traps Tab navigation, closes on Escape and restores its opener focus', () => {
  const drawerStart = source.indexOf('<aside #invoiceDetailDrawer class="invoice-detail-drawer"');
  const drawerEnd = source.indexOf('</aside>', drawerStart);
  const drawer = source.slice(drawerStart, drawerEnd);
  assert.ok(drawerStart >= 0 && drawerEnd > drawerStart);
  assert.match(drawer, /role="dialog" aria-modal="true" tabindex="-1"/);
  assert.match(drawer, /\(keydown\)="handleInvoiceDetailKeydown\(\$event\)"/);

  const trapStart = source.indexOf('handleInvoiceDetailKeydown(event: KeyboardEvent): void');
  const trapEnd = source.indexOf('closeInvoiceDetails(restoreFocus = true): void', trapStart);
  const trap = source.slice(trapStart, trapEnd);
  assert.match(trap, /event\.key !== 'Tab'/);
  assert.match(trap, /querySelectorAll<HTMLElement>/);
  assert.match(trap, /event\.shiftKey \? last : first/);
  assert.match(trap, /event\.shiftKey && \(active === first \|\| active === drawer\)/);
  assert.match(trap, /!event\.shiftKey && active === last/);
  assert.match(trap, /event\.preventDefault\(\)/);

  const escapeHandler = source.slice(source.indexOf("@HostListener('document:keydown.escape')"),
    source.indexOf('selectMobileMoreTab(', source.indexOf("@HostListener('document:keydown.escape')")));
  assert.match(escapeHandler, /if \(this\.selectedInvoiceForDetails\)\s*\{\s*this\.closeInvoiceDetails\(\)/);
  const closeStart = source.indexOf('closeInvoiceDetails(restoreFocus = true): void');
  const closeEnd = source.indexOf('editInvoiceFromDetails(): void', closeStart);
  const close = source.slice(closeStart, closeEnd);
  assert.match(close, /const trigger = this\.invoiceDetailTrigger/);
  assert.match(close, /if \(restoreFocus\) queueMicrotask\(\(\) => \{ if \(trigger\?\.isConnected\) trigger\.focus\(\); \}\)/);
});

test('mobile More is a shell-root overlay above workspace content with a real backdrop', () => {
  const sidebarStart = source.indexOf('<aside class="sidebar"');
  const sidebarEnd = source.indexOf('</aside>', sidebarStart);
  const overlayStart = source.indexOf('<div class="mobile-more-overlay">');
  assert.ok(sidebarStart >= 0 && sidebarEnd > sidebarStart && overlayStart > sidebarEnd);
  const overlay = source.slice(overlayStart, source.indexOf('<nav #mobileMoreMenu', overlayStart));
  assert.match(overlay, /mobile-more-backdrop/);
  assert.match(source, /\.mobile-more-overlay\{display:block;position:fixed;inset:0;z-index:80;pointer-events:none\}/);
  assert.match(source, /\.mobile-more-backdrop\{position:fixed;inset:0;z-index:80;/);
  assert.match(source, /\.mobile-more-menu\{display:grid;position:fixed;z-index:81;pointer-events:auto;/);
  assert.doesNotMatch(source.slice(sidebarStart, sidebarEnd), /class="mobile-more-menu"/);
});

test('overview invitation accept surface is absent when there is no invitation to accept', () => {
  assert.match(workspaceInvitationsSource, /@if \(mode === 'manage' \|\| acceptVisible \|\| error \|\| success\) \{\s*<section class="team-card"/);
  assert.match(workspaceInvitationsSource, /this\.acceptVisible = Boolean\(this\.inviteToken\) \|\| !this\.businessId/);
});

test('desktop invoice create action stays content-sized instead of stretching the toolbar', () => {
  assert.match(globalStyles, /@media \(min-width: 761px\) \{\s*:root body \.shell \.invoice-toolbar > \.invoice-create-button \{\s*flex: 0 0 auto;\s*width: fit-content;\s*min-height: 44px;\s*align-self: flex-start;/);
});

test('every page-level deferred workspace block has an @error fallback with a localized message', () => {
  const raw = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8');
  const blocks = raw.match(/@defer \((?!when pending)[^\n]*\) \{/g) ?? [];
  const fallbacks = raw.match(/@error \{\s*<section abaCard class="panel narrow">\s*<aba-state-message kind="error" \[description\]="t\('ui\.m_deferr1'\)" \/>/g) ?? [];
  assert.ok(blocks.length >= 10, 'expected the page-level deferred blocks');
  assert.equal(fallbacks.length, blocks.length,
    'a failed lazy chunk must show an error message instead of a stuck placeholder or empty view');
});

test('deferred confirmation dialogs fail closed with an error message and a cancel path', () => {
  const raw = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8');
  for (const [pending, cancel] of [
    ['pendingInvoiceVoid', 'cancelInvoiceVoid'],
    ['pendingPurchaseApproval', 'cancelPurchaseOrderApproval'],
    ['pendingPurchaseReceipt', 'cancelPurchaseOrderReceipt'],
  ]) {
    const start = raw.indexOf(`@defer (when ${pending}) {`);
    assert.ok(start >= 0, `${pending} defer block must exist`);
    const errorAt = raw.indexOf('@error {', start);
    const nextDefer = raw.indexOf('@defer (', start + 1);
    assert.ok(errorAt > start && (nextDefer < 0 || errorAt < nextDefer), `${pending} needs an @error fallback`);
    const fallback = raw.slice(errorAt, errorAt + 420);
    assert.match(fallback, /role="alert"/);
    assert.match(fallback, /ui\.m_deferr2/);
    assert.ok(fallback.includes(`(click)="${cancel}()"`), `${pending} fallback must offer the cancel action`);
    assert.doesNotMatch(fallback, /confirm[A-Za-z]*\(\)/, 'the fallback must not offer a confirm action');
  }
});


// T18 Slice U02 (2026-11-21): the customer tools carry icons, and the
// statement starts from the top when it is opened.
test('customer export and import tools carry icons', () => {
  assert.match(source, /<button class="secondary customers-tool" type="button" \(click\)="exportCurrentList\(\)"><aba-icon name="export" \/>/);
  assert.match(source, /<details class="aba-record-secondary csv-disclosure"><summary><span><aba-icon name="import" \/>/);
});

test('opening a customer statement scrolls the statement panel to the top', () => {
  assert.match(source, /private scrollStatementIntoView\(\): void \{[\s\S]*?document\.querySelector\('\.statement-panel'\)\?\.scrollIntoView\(\{ block: 'start' \}\)/);
  // Both open paths scroll (directory row action and profile button); the
  // pager and the filter apply do not scroll.
  assert.match(source, /await this\.loadCustomerStatementPage\(0\);\s*this\.scrollStatementIntoView\(\);\s*\} catch \(error\)/);
  assert.match(source, /async loadCustomerStatement\(customer: Customer\): Promise<void> \{[\s\S]*?await this\.loadCustomerStatementPage\(0\);\s*this\.scrollStatementIntoView\(\);/);
  assert.doesNotMatch(source, /async applyCustomerStatementFilters\(\): Promise<void> \{[\s\S]*?scrollStatementIntoView/);
});
