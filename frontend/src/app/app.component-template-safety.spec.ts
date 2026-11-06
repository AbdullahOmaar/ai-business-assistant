import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8');
const stateMessageSource = readFileSync(new URL('./shared/ui/aba-state-message.component.ts', import.meta.url), 'utf8');

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

test('Home quick access shows only the five key destinations from the shared role-filtered catalogue', () => {
  assert.ok(source.includes('class="panel module-launcher"'));
  assert.ok(source.includes("const priority = ['invoices', 'customers', 'products', 'expenses', 'reports']"));
  assert.match(source, /get homeQuickAccessCards\(\): readonly WorkspaceModuleCard\[\]/);
  assert.match(source, /return this\.homeModuleCards\s*\.filter\(module => priority\.includes\(module\.tab\)\)/);
  assert.match(source, /priority\.indexOf\(left\.tab\) - priority\.indexOf\(right\.tab\)/);
  assert.match(source, /WORKSPACE_MODULE_CATALOG\.filter\(module => this\.canAccessTab\(module\.tab\)\)/);
  assert.ok(source.includes('homeQuickAccessCards.length'));
  assert.match(source, /title]="t\('الوصول السريع', 'Quick access'\)/);
  assert.match(source, /@for \(module of homeQuickAccessCards; track module\.tab\)/);
  assert.match(source, /<aba-quick-access-card\b/);
  assert.match(source, /activated\)="setTab\(module\.tab\)"/);
  assert.doesNotMatch(source, /homeModuleCards\.length/);
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
  assert.match(authTemplate, /<form (?:#authForm="ngForm" )?\(ngSubmit\)="submitAuth\(\)" class="stack">/);
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

test('customer creation exposes a localized, associated required-name error', () => {
  const start = source.indexOf('<form #customerForm="ngForm"');
  const end = source.indexOf('</form>', start);
  const form = source.slice(start, end);
  assert.ok(start >= 0 && end > start, 'customer create form must exist');
  assert.match(form, /#customerNameModel="ngModel"/);
  assert.match(form, /maxlength="160"/);
  assert.match(form, /\[attr\.aria-invalid\]="customerNameModel\.invalid/);
  assert.match(form, /\[attr\.aria-describedby\]="customerNameModel\.invalid/);
  assert.match(form, /id="customer-name-error" class="field-error" aria-live="polite"/);
  assert.match(form, /اسم العميل مطلوب\./);
  assert.match(form, /Customer name is required\./);
});

test('optional customer email exposes a localized format error only when invalid', () => {
  const start = source.indexOf('<form #customerForm="ngForm"');
  const end = source.indexOf('</form>', start);
  const form = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(form, /#customerEmailModel="ngModel"/);
  assert.match(form, /type="email" maxlength="254"/);
  assert.match(form, /customerEmailModel\.invalid && \(customerEmailModel\.touched \|\| customerForm\.submitted\)/);
  assert.match(form, /id="customer-email-error" class="field-error" aria-live="polite"/);
  assert.match(form, /أدخل بريدًا إلكترونيًا صحيحًا أو اترك الحقل فارغًا\./);
  assert.match(form, /Enter a valid email address or leave this field blank\./);
});

test('customer phone input reflects the backend maximum without making it required', () => {
  const start = source.indexOf('<form #customerForm="ngForm"');
  const end = source.indexOf('</form>', start);
  const form = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(form, /name="customerPhone" maxlength="32"/);
  assert.doesNotMatch(form, /name="customerPhone"[^>]*required/);
});

test('invoice discount and tax rate fields expose localized accessible range errors', () => {
  const start = source.indexOf('<form #invoiceForm="ngForm"');
  const end = source.indexOf('</form>', start);
  const form = source.slice(start, end);
  assert.ok(start >= 0 && end > start, 'invoice form must exist');
  assert.match(form, /#invoiceDiscountModel="ngModel"/);
  assert.match(form, /#invoiceTaxModel="ngModel"/);
  assert.match(form, /min="0" max="100" step="any" required/);
  assert.match(form, /\[attr\.aria-invalid\]="invoiceDiscountModel\.invalid/);
  assert.match(form, /\[attr\.aria-describedby\]="invoiceTaxModel\.invalid/);
  assert.match(form, /id="invoice-discount-error" class="field-error" aria-live="polite"/);
  assert.match(form, /id="invoice-tax-error" class="field-error" aria-live="polite"/);
  assert.match(form, /أدخل نسبة خصم من 0 إلى 100\./);
  assert.match(form, /Enter a discount rate from 0 to 100\./);
  assert.match(form, /أدخل نسبة ضريبة من 0 إلى 100\./);
  assert.match(form, /Enter a tax rate from 0 to 100\./);
});

test('owner payment form exposes localized accessible errors for required amount and customer', () => {
  const start = source.indexOf('<form #paymentForm="ngForm"');
  const end = source.indexOf('</form>', start);
  const form = source.slice(start, end);
  assert.ok(start >= 0 && end > start, 'payment form must exist');
  assert.match(form, /#paymentAmountModel="ngModel"/);
  assert.match(form, /min="0\.01" step="0\.01"[^>]*required/);
  assert.match(form, /id="payment-amount-error" class="field-error" aria-live="polite"/);
  assert.match(form, /#paymentCustomerModel="ngModel"/);
  assert.match(form, /name="paymentCustomer" required/);
  assert.match(form, /id="payment-customer-error" class="field-error" aria-live="polite"/);
  assert.match(form, /أدخل مبلغًا صحيحًا أكبر من صفر/);
  assert.match(form, /Enter a positive amount/);
  assert.match(form, /اختيار العميل مطلوب\./);
  assert.match(form, /Choose a customer\./);
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


test('invoice mutations keep confirmed success separate from post-save refresh failures', () => {
  const createStart = source.indexOf('async createInvoice(): Promise<void>');
  const createEnd = source.indexOf('private escapePrintHtml(', createStart);
  const create = source.slice(createStart, createEnd);
  assert.ok(createStart >= 0 && createEnd > createStart);
  assert.match(create, /const businessId = this\.business\.id/);
  assert.match(create, /if \(this\.business\?\.id !== businessId\) return;/);
  assert.match(create, /Invoice draft saved/);
  assert.match(create, /The draft was saved, but the list could not refresh/);
  assert.match(create, /Do not save it again/);
  assert.match(create, /finally \{\s*if \(this\.business\?\.id === businessId\) this\.loading = false;/);

  const issueStart = source.indexOf('async issueInvoice(invoice: Invoice)');
  const issueEnd = source.indexOf('async voidInvoice(invoice: Invoice)', issueStart);
  const issue = source.slice(issueStart, issueEnd);
  assert.ok(issueStart >= 0 && issueEnd > issueStart);
  assert.match(issue, /Invoice issued successfully/);
  assert.match(issue, /The invoice was issued, but the view could not refresh/);
  assert.match(issue, /Do not issue it again/);
  assert.match(issue, /this\.api\.issueInvoice\(businessId, invoice\.id\)/);
  assert.match(issue, /finally \{\s*if \(this\.business\?\.id === businessId\) this\.loading = false;/);

  const voidStart = source.indexOf('async voidInvoice(invoice: Invoice)');
  const voidEnd = source.indexOf('hasOutstandingBalance(', voidStart);
  const voidMethod = source.slice(voidStart, voidEnd);
  assert.ok(voidStart >= 0 && voidEnd > voidStart);
  assert.match(voidMethod, /This screen does not process refunds or credit notes/);
  assert.match(voidMethod, /Invoice voided successfully/);
  assert.match(voidMethod, /The invoice was voided, but the view could not refresh/);
  assert.match(voidMethod, /Do not void it again/);
  assert.match(voidMethod, /this\.api\.voidInvoice\(businessId, invoice\.id/);
  assert.match(voidMethod, /finally \{\s*if \(this\.business\?\.id === businessId\) this\.loading = false;/);
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
  assert.match(method, /const businessId = this\.business\.id/);
  assert.match(method, /finally \{\s*if \(this\.business\?\.id === businessId\) this\.loading = false;/);
});


test('invalid authentication, workspace, customer, payment and expense forms cannot invoke mutations', () => {
  assert.match(source, /<form #authForm="ngForm" \(ngSubmit\)="authForm\.valid && submitAuth\(\)"/);
  assert.match(source, /<form #workspaceForm="ngForm"[^>]*\(ngSubmit\)="workspaceForm\.valid && createWorkspace\(\)"/);
  assert.match(source, /<form #customerForm="ngForm"[^>]*\(ngSubmit\)="customerForm\.valid && createCustomer\(\)"/);
  assert.match(source, /<form #paymentForm="ngForm"[^>]*\(ngSubmit\)="paymentForm\.valid && createPayment\(\)"/);
  assert.match(source, /<form #expenseForm="ngForm"[^>]*\(ngSubmit\)="expenseForm\.valid && createExpense\(\)"/);
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
  const end = source.indexOf('get invoicePreview()', start);
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
  assert.match(printMethod, /const businessId = this\.business\.id/);
  assert.match(printMethod, /const businessName = this\.business\.name/);
  assert.match(printMethod, /const businessCurrency = this\.business\.currency_code/);
  assert.match(printMethod, /this\.api\.invoiceDetail\(businessId, invoice\.id\)/);
  assert.match(printMethod, /if \(this\.business\?\.id !== businessId\) \{\s*printWindow\.close\(\);\s*return;/);
  assert.doesNotMatch(printMethod, /this\.business\.name|this\.business\.currency_code/);
  assert.match(printMethod, /finally \{\s*if \(this\.business\?\.id === businessId\) this\.loading = false;/);

  const editStart = source.indexOf('async editInvoice(invoice: Invoice)');
  const editEnd = source.indexOf('cancelInvoiceEdit(): void', editStart);
  const editMethod = source.slice(editStart, editEnd);
  assert.ok(editStart >= 0 && editEnd > editStart);
  assert.match(editMethod, /const businessId = this\.business\.id/);
  assert.match(editMethod, /this\.api\.invoiceDetail\(businessId, invoice\.id\)/);
  assert.match(editMethod, /if \(this\.business\?\.id !== businessId\) return;/);
  assert.match(editMethod, /finally \{\s*if \(this\.business\?\.id === businessId\) this\.loading = false;/);
});


test('invoice drafts are available to workspace members while issue and void remain owner-only', () => {
  const toolbarStart = source.indexOf('<div class="invoice-toolbar">');
  const filterStart = source.indexOf('<div class="inline-form customer-invoice-filter">', toolbarStart);
  const toolbar = source.slice(toolbarStart, filterStart);
  assert.ok(toolbarStart >= 0 && filterStart > toolbarStart);
  assert.match(toolbar, /^<div class="invoice-toolbar"><details class="invoice-create-disclosure">/);
  assert.match(toolbar, /<form #invoiceForm="ngForm"/);
  assert.match(toolbar, /invoiceForm\.valid && createInvoice\(\)/);

  const rowStart = source.indexOf('@for (invoice of filteredInvoices');
  const rowEnd = source.indexOf('</article> }', rowStart);
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
  assert.ok(draft.indexOf('voidInvoice(invoice)') > draftOwnerGuard, 'voiding is owner-only');
  const issuedOwnerGuard = issued.indexOf("@if (business?.role === 'owner')");
  assert.ok(issuedOwnerGuard >= 0, 'issued invoice void action must be owner-only');
  assert.ok(issued.indexOf('printInvoice(invoice)') < issuedOwnerGuard, 'workspace members retain invoice printing');
  assert.ok(issued.indexOf('voidInvoice(invoice)') > issuedOwnerGuard, 'issued invoice voiding is owner-only');

  const createStart = source.indexOf('async createInvoice(): Promise<void>');
  const createEnd = source.indexOf('private escapePrintHtml(', createStart);
  assert.match(source.slice(createStart, createEnd), /if \(!this\.business\) return;/);
  assert.doesNotMatch(source.slice(createStart, createEnd), /this\.business\.role !== 'owner'/);
  const editStart = source.indexOf('async editInvoice(invoice: Invoice)');
  const editEnd = source.indexOf('cancelInvoiceEdit(): void', editStart);
  assert.match(source.slice(editStart, editEnd), /if \(!this\.business \|\| invoice\.status !== 'draft'\) return;/);
  assert.doesNotMatch(source.slice(editStart, editEnd), /this\.business\.role !== 'owner'/);
});


test('owner-only invoice mutations fail closed before showing confirmation or calling the API', () => {
  const issueStart = source.indexOf('async issueInvoice(invoice: Invoice)');
  const issueEnd = source.indexOf('async voidInvoice(invoice: Invoice)', issueStart);
  const issue = source.slice(issueStart, issueEnd);
  assert.match(issue, /if \(!this\.business \|\| this\.business\.role !== 'owner'\) return;/);

  const voidStart = source.indexOf('async voidInvoice(invoice: Invoice)');
  const voidEnd = source.indexOf('hasOutstandingBalance(', voidStart);
  const voidMethod = source.slice(voidStart, voidEnd);
  assert.match(voidMethod, /if \(!this\.business \|\| this\.business\.role !== 'owner' \|\| !window\.confirm/);
  assert.match(voidMethod, /this\.api\.voidInvoice\(businessId, invoice\.id/);
});


test('owner-only notification and recurring creation controls stay hidden from staff while lists remain visible', () => {
  const notificationStart = source.indexOf("@if (tab === 'notifications')");
  const notificationEnd = source.indexOf("@if (tab === 'suppliers')", notificationStart);
  const notificationView = source.slice(notificationStart, notificationEnd);
  assert.ok(notificationStart >= 0 && notificationEnd > notificationStart);
  assert.match(notificationView, /@if \(business\?\.role === 'owner'\) \{\s*<form #notificationForm="ngForm"/);
  assert.match(notificationView, /Only workspace owners can queue notifications/);
  assert.match(notificationView, /@for \(item of notifications/);

  const recurringStart = source.indexOf("@if (tab === 'recurring')");
  const recurringEnd = source.indexOf("@if (tab === 'health'", recurringStart);
  const recurringView = source.slice(recurringStart, recurringEnd);
  assert.ok(recurringStart >= 0 && recurringEnd > recurringStart);
  assert.match(recurringView, /@if \(business\?\.role === 'owner'\) \{\s*<form #recurringForm="ngForm"/);
  assert.match(recurringView, /Only workspace owners can create recurring invoice schedules/);
  assert.match(recurringView, /@for \(schedule of recurringSchedules/);

  const notificationMethodStart = source.indexOf('async createNotification(): Promise<void>');
  const notificationMethodEnd = source.indexOf('private async loadSuppliers()', notificationMethodStart);
  assert.match(source.slice(notificationMethodStart, notificationMethodEnd), /this\.business\.role !== 'owner'/);
  const recurringMethodStart = source.indexOf('async createRecurringSchedule(): Promise<void>');
  const recurringMethodEnd = source.indexOf('get maxIntegrityTotal()', recurringMethodStart);
  assert.match(source.slice(recurringMethodStart, recurringMethodEnd), /this\.business\.role !== 'owner'/);
});

test('CSV import preview and write controls are owner-only without restricting member record creation', () => {
  assert.match(source, /@if \(business\?\.role === 'owner'\) \{ <section abaCard class="csv-import-panel" aria-label="CSV customer import">/);
  assert.match(source, /@if \(business\?\.role === 'owner'\) \{ <section abaCard class="csv-import-panel" aria-label="CSV product import">/);
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

test('purchase orders remain creatable by members while receiving and payment writes are owner-only', () => {
  const purchaseStart = source.indexOf("@if (tab === 'purchases')");
  const purchaseEnd = source.indexOf("@if (tab === 'recurring')", purchaseStart);
  const purchaseView = source.slice(purchaseStart, purchaseEnd);
  assert.match(purchaseView, /<form class="stack" \(ngSubmit\)="createPurchaseOrder\(\)">/);
  assert.match(purchaseView, /business\?\.role === 'owner' && order\.lines\.some\(hasRemainingQuantity\)/);
  const receiveStart = source.indexOf('async receivePurchaseOrder(order: PurchaseOrder)');
  const receiveEnd = source.indexOf('async createRecurringSchedule()', receiveStart);
  assert.match(source.slice(receiveStart, receiveEnd), /this\.business\.role !== 'owner'/);
  const paymentStart = source.indexOf('async createPayment(): Promise<void>');
  const paymentEnd = source.indexOf('useAssistantSuggestion(', paymentStart);
  assert.match(source.slice(paymentStart, paymentEnd), /this\.business\.role !== 'owner'/);
});


test('local CSV exports follow the backend owner-only export permission', () => {
  const exportButton = `<button class="secondary" type="button" (click)="exportCurrentList()">{{ t('تصدير CSV', 'Export CSV') }}</button>`;
  assert.equal(source.split(exportButton).length - 1, 0, 'unrestricted export buttons must not remain');
  assert.equal((source.match(/@if \(business\?\.role === 'owner'\) \{ <button class="secondary" type="button" \(click\)="exportCurrentList\(\)"/g) || []).length, 3);
  const listExportStart = source.indexOf('exportCurrentList(): void');
  const listExportEnd = source.indexOf('syncPaymentCustomer(): void', listExportStart);
  assert.match(source.slice(listExportStart, listExportEnd), /if \(!this\.business \|\| this\.business\.role !== 'owner'\) return;/);
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
  assert.match(source, /\.hero-mark\{[^}]*margin-inline-start:4%;/);
  assert.match(source, /\.chat-message\.user-message\{margin-inline-end:auto;margin-inline-start:0;/);
  assert.match(source, /\.nav-item\.active\{[^}]*border-inline-start:3px solid/);
  assert.doesNotMatch(source, /\.shell\.english \.sidebar\{inset:0 0 0 auto\}/);
  assert.doesNotMatch(source, /\.shell\.english \.main\{margin-left:0;margin-right:/);
  assert.doesNotMatch(source, /\.shell\.english \.hero-mark\{margin-left:/);
  assert.doesNotMatch(source, /\.shell\.english \.chat-message\.user-message\{margin-right:auto/);
});

test('RTL release-guide lists and mobile dock active state use logical layout', () => {
  assert.match(source, /\.release-feature-group ul,\.release-version ul\{[^}]*padding-block-end:14px;padding-inline-start:32px;padding-inline-end:0/);
  assert.doesNotMatch(source, /\.shell\.english \.release-feature-group ul/);
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
  assert.ok(form.includes('maxlength="2000" required'));
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
  const start = source.indexOf('<form #invoiceForm="ngForm"');
  const end = source.indexOf('</form>', start);
  const form = source.slice(start, end);
  assert.ok(form.includes('invoiceForm.valid && createInvoice()'));
  assert.ok(form.includes('#invoiceCustomerModel="ngModel"'));
  assert.ok(form.includes(`[attr.aria-describedby]="invoiceCustomerModel.invalid && (invoiceCustomerModel.touched || invoiceForm.submitted) ? 'invoice-customer-error' : null"`));
  assert.ok(form.includes('id="invoice-customer-error"'));
  assert.ok(form.includes('#invoiceProductModel="ngModel"'));
  assert.ok(form.includes(`[attr.aria-describedby]="invoiceProductModel.invalid && (invoiceProductModel.touched || invoiceForm.submitted) ? 'invoice-product-error-' + i : null"`));
  assert.ok(form.includes(`[id]="'invoice-product-error-' + i"`));
  assert.ok(form.includes('#invoiceQuantityModel="ngModel"'));
  assert.ok(form.includes(`[attr.aria-describedby]="invoiceQuantityModel.invalid && (invoiceQuantityModel.touched || invoiceForm.submitted) ? 'invoice-quantity-error-' + i : null"`));
  assert.ok(form.includes(`[id]="'invoice-quantity-error-' + i"`));
  assert.match(form, /name="invoiceCustomer"[^>]*required/);
  assert.match(form, /min="0\.001" step="0\.001" required \[\(ngModel\)\]="line\.quantity"/);
  assert.match(form, /\[disabled\]="loading \|\| !products\.length \|\| !customers\.length"/);
  assert.doesNotMatch(form, /\[disabled\]="[^"]*!invoiceCustomerId/);
  assert.ok(source.includes("if (!this.business || !this.invoiceCustomerId || !this.invoiceLines.length"));
});

test('payment submit remains available to reveal required-field validation', () => {
  const start = source.indexOf('<form #paymentForm="ngForm"');
  const end = source.indexOf('</form>', start);
  const form = source.slice(start, end);
  assert.ok(form.includes('paymentForm.valid && createPayment()'));
  assert.match(form, /name="paymentAmount" type="number" min="0\.01" step="0\.01"[^>]*required/);
  assert.ok(form.includes('paymentAmountModel.invalid'));
  assert.ok(form.includes('payment-customer-error'));
  assert.match(form, /<button class="primary" type="submit" \[disabled\]="loading"/);
  assert.doesNotMatch(form, /\[disabled\]="loading \|\| !paymentAmount"/);
  assert.match(source, /if \(!this\.paymentAmount\.trim\(\) \|\| !this\.paymentCustomerId\)/);
});
