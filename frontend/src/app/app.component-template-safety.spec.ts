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
  assert.ok((source.match(/<aba-state-message kind="error"/g) || []).length >= 17);
  assert.doesNotMatch(source, /<p class="error" role="alert">/);
  assert.doesNotMatch(source, /class="error-banner"/);
  assert.doesNotMatch(source, /class="error" role="alert"/);
  assert.ok((source.match(/<aba-state-message kind="loading"/g) || []).length >= 9);
  assert.ok((source.match(/<aba-state-message kind="success"/g) || []).length >= 4);
  assert.ok(source.includes('<aba-state-message [kind]'));
  assert.doesNotMatch(source, /<p class="muted" role="status">/);
  assert.doesNotMatch(source, /<p role="status">/);
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
  const panelHosts = [...source.matchAll(/<([a-z][a-z0-9-]*)[^>]*class="[^"]*panel[^"]*"[^>]*>/g)];
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
  assert.match(source, /<nav id="mobile-more-menu" class="mobile-more-menu"/);
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


test('mobile workspace view retains the active page title when the desktop topbar is hidden', () => {
  const desktopTopbar = source.indexOf('<header class="topbar">');
  const mobileHeading = source.indexOf('<header class="mobile-page-heading"');
  assert.ok(desktopTopbar >= 0 && mobileHeading > desktopTopbar);
  assert.match(source, /<header class="mobile-page-heading" aria-live="polite" aria-atomic="true">[\s\S]*?<h1>\{\{ pageTitle \}\}<\/h1>/);
  assert.match(source, /\.mobile-page-heading\{display:none\}/);
  assert.match(source, /\.mobile-page-heading\{display:block/);
  assert.match(source, /\.mobile-page-heading h1\{[^}]*overflow-wrap:anywhere/);
});


test('mobile module launcher uses two balanced columns when space permits', () => {
  assert.match(source, /\.quick-grid\{grid-template-columns:repeat\(auto-fit,minmax\(min\(100%,240px\),1fr\)\)\}/);
  assert.match(source, /grid-template-columns:repeat\(auto-fit,minmax\(min\(100%,165px\),1fr\)\)/);
});


test('authentication failures keep the user on the sign-in form instead of retrying app startup', () => {
  const authStart = source.indexOf('} @else if (!signedIn) {');
  const authEnd = source.indexOf('} @else {', authStart);
  const authTemplate = source.slice(authStart, authEnd);
  assert.ok(authStart >= 0 && authEnd > authStart, 'sign-in view must exist');
  assert.match(authTemplate, /<form \(ngSubmit\)="submitAuth\(\)" class="stack">/);
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
  const workspaceError = source.match(/@if \(error\) \{ <aba-state-message kind="error"[^\n]+/);
  assert.ok(workspaceError);
  assert.match(workspaceError[0], /sessionExpired \? t\('تسجيل الدخول مجددًا', 'Sign in again'\)/);
  assert.match(workspaceError[0], /sessionExpired \? logout\(\) : retry\(\)/);
  assert.match(source, /get sessionExpired\(\): boolean/);
  const formatter = source.slice(source.indexOf('private message(error: unknown'));
  assert.match(formatter, /Authentication required/);
  assert.match(formatter, /Authenticated subject is missing/);
});


test('permission-denied feedback offers a safe return home instead of retrying a forbidden request', () => {
  const workspaceError = source.match(/@if \(error\) \{ <aba-state-message kind="error"[^\n]+/);
  assert.ok(workspaceError);
  assert.match(workspaceError[0], /accessDenied \? t\('العودة للرئيسية', 'Go to Home'\)/);
  assert.match(workspaceError[0], /accessDenied \? setTab\('overview'\) : retry\(\)/);
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
  const receiving = source.slice(source.indexOf('async receivePurchaseOrder('), source.indexOf('async createRecurringSchedule()'));
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
  assert.match(source, /operationsMessageTab === 'recurring'/);
});

test('invoice void confirmation is localized for Arabic and English', () => {
  const start = source.indexOf('async voidInvoice(invoice: Invoice)');
  const end = source.indexOf('hasOutstandingBalance(', start);
  const method = source.slice(start, end);
  assert.ok(start >= 0 && end > start, 'invoice void method must exist');
  assert.match(method, /window\.confirm\(this\.t\(/);
  assert.match(method, /تأكيد إلغاء الفاتورة/);
  assert.match(method, /Confirm voiding invoice/);
});
