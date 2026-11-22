import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const editor = readFileSync(new URL('./customer-editor.component.ts', import.meta.url), 'utf8');
const editorCss = readFileSync(new URL('./customer-editor.component.css', import.meta.url), 'utf8');
const profile = readFileSync(new URL('./customer-profile.component.ts', import.meta.url), 'utf8');
const api = readFileSync(new URL('./api.service.ts', import.meta.url), 'utf8');
const directory = readFileSync(new URL('./customer-directory.component.ts', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('./customer-workspace.component.ts', import.meta.url), 'utf8');
const directoryCss = readFileSync(new URL('./customer-directory.component.css', import.meta.url), 'utf8');
const appShell = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8');

test('customer editor covers all supported contact fields and required-name/email validation', () => {
  for (const field of ['name', 'email', 'phone', 'address', 'notes']) assert.ok(editor.includes('name="' + field + '"'));
  for (const max of ['160', '254', '32', '500', '1000']) assert.ok(editor.includes('maxlength="' + max + '"'));
  assert.match(editor, /if \(!name \|\| this\.emailInvalid\(\) \|\| this\.busy\(\)\) return/);
  assert.match(editor, /this\.save\.emit\(/);
  assert.match(editor, /this\.customer\(\)/);
  assert.match(editor, /hasWhitespace/);
  assert.match(editorCss, /@media\(max-width:560px\)/);
  assert.match(editorCss, /min-height:46px/);
  assert.match(editorCss, /min-height:48px/);
  assert.match(editorCss, /font-size:16px/);
  assert.match(editorCss, /forced-colors:active/);
});

test('customer profile presents contact, address, notes and existing invoice/statement actions without invented financial totals', () => {
  for (const field of ['phone', 'email', 'address', 'notes']) assert.ok(profile.includes('record.' + field));
  assert.match(profile, /invoices\.emit\(\)/);
  assert.match(profile, /statement\.emit\(\)/);
  assert.match(profile, /loading\(\)/);
  assert.match(profile, /customer-profile__item a\{[^}]*min-height:44px/);
  assert.match(profile, /retry\.emit\(\)/);
  assert.doesNotMatch(profile, /totalPurchases|receivableBalance|creditLimit/);
  assert.ok(profile.includes('customerProfile.financialNote'));
});

test('customer API client exposes bounded server search, detail and patch for supported fields', () => {
  assert.match(api, /customers\(businessId: string, offset = 0, limit = 100, search = ''\)/);
  assert.match(api, /params\.set\('q', search\.trim\(\)\.slice\(0, 120\)\)/);
  assert.match(api, /customer\(businessId: string, customerId: string\)/);
  assert.match(api, /updateCustomer\(businessId: string, customerId: string/);
  assert.match(api, /'address' \| 'notes'/);
});

test('saved customers reach the shared invoice picker immediately via a guarded customerSaved upsert', () => {
  // The workspace emits the server-returned record only after the tenant/save guard passes.
  assert.match(workspace, /readonly customerSaved = output<Customer>\(\);/);
  assert.match(workspace, /this\.customerSaved\.emit\(record\);/);
  const guardIndex = workspace.indexOf('if (!this.isCurrent(this.saveGuard, version, requested)) return;');
  const emitIndex = workspace.indexOf('this.customerSaved.emit(record)');
  assert.ok(guardIndex !== -1 && emitIndex !== -1 && guardIndex < emitIndex);
  // The host shell listens and upserts by id without touching selection or pagination cursor.
  assert.match(appShell, /\(customerSaved\)="onWorkspaceCustomerSaved\(\$event\)"/);
  assert.match(appShell, /onWorkspaceCustomerSaved\(customer: Customer\): void/);
  assert.match(appShell, /this\.customers\.some\(item => item\.id === customer\.id\)/);
  assert.match(appShell, /\[customer, \.\.\.this\.customers\]/);
  const handler = /onWorkspaceCustomerSaved\(customer: Customer\): void \{[\s\S]*?\n  \}/.exec(appShell);
  assert.ok(handler, 'handler body found');
  assert.doesNotMatch(handler[0], /invoiceCustomerId|customerOffset|customersHasMore/);
});

test('customer directory preserves responsive layouts and exposes saved address and notes', () => {
  assert.match(directory, /customer-directory__mobile-list/);
  assert.match(directory, /aria-sort/);
  assert.match(directory, /emitAction\(customer\.id, 'statement'/);
  assert.match(directory, /emitAction\(customer\.id, 'edit'/);
  assert.match(workspace, /editCustomerFromDirectory/);
  assert.match(directory, /customer\.address/);
  assert.match(directory, /customer\.notes/);
  assert.match(directory, /error\(\)/);
  assert.match(directory, /retry\.emit\(\)/);
  assert.match(directoryCss, /min-height:44px/);
  assert.match(directoryCss, /min-height:48px/);
  assert.match(directoryCss, /forced-colors:active/);
});

test('customer workspace covers server search, paginated list, detail and create/edit with tenant stale-response guards', () => {
  assert.match(workspace, /this\.api\.customers\(requested\.businessId, this\.offset, this\.pageSize, this\.searchQuery\(\)\)/);
  assert.match(workspace, /this\.searchQuery\.set\(this\.searchDraft\(\)\.trim\(\)\.slice\(0, 120\)\)/);
  assert.match(workspace, /this\.api\.customer\(requested\.businessId, customerId\)/);
  assert.match(workspace, /this\.api\.createCustomer\(requested\.businessId, value\)/);
  assert.match(workspace, /this\.api\.updateCustomer\(requested\.businessId, editingId, value\)/);
  assert.match(workspace, /this\.isCurrent\(this\.listGuard/);
  assert.match(workspace, /this\.isCurrent\(this\.detailGuard/);
  assert.match(workspace, /this\.isCurrent\(this\.saveGuard/);
  assert.match(workspace, /current\.userId === requested\.userId/);
  assert.match(workspace, /current\.role === requested\.role/);
  assert.match(workspace, /readonly invoicesRequested = output<string>\(\)/);
  assert.match(workspace, /readonly statementRequested = output<string>\(\)/);
  assert.match(workspace, /openInvoices\(\): void \{ if \(this\.selectedCustomerId\) this\.invoicesRequested\.emit/);
  assert.match(workspace, /openStatement\(\): void \{ if \(this\.selectedCustomerId\) this\.statementRequested\.emit/);
  assert.match(workspace, /pageSize = 50/);
  assert.match(workspace, /@if \(hasMore\(\) && !error\(\)\)/);
  assert.match(workspace, /\[disabled\]="loading\(\)"/);
  assert.match(workspace, /loadingMore\(\) \? t\('ui\.m_1dwk1vm'\)/);
  assert.match(workspace, /\(retry\)="retry\(\)"/);
  assert.doesNotMatch(workspace, /\[retry\]="retry"/);
  assert.match(workspace, /readonly refreshRequest = input\(0\)/);
  assert.match(workspace, /if \(request > 0\) void this\.loadCustomers\(true\)/);
});

test('customer and product workspaces are mounted in the authenticated app shell', () => {
  const shell = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8')
  + '\n'
  + readFileSync(new URL('./app.component.css', import.meta.url), 'utf8');
  assert.match(shell, /CustomerWorkspaceComponent/);
  assert.match(shell, /ProductWorkspaceComponent/);
  assert.match(shell, /<aba-customer-workspace/);
  assert.match(shell, /<aba-product-workspace/);
  assert.match(shell, /\[userId\]="workspaceUserId"/);
  assert.match(shell, /\[role\]="business\.role === 'owner' \? 'owner' : 'staff'"/);
  assert.match(shell, /\[refreshRequest\]="customerRefreshRequest"/);
  assert.match(shell, /this\.customerRefreshRequest\+\+/);
  assert.match(shell, /\[refreshRequest\]="productRefreshRequest"/);
  assert.match(shell, /this\.productRefreshRequest\+\+/);
  assert.doesNotMatch(shell, /@ViewChild\(CustomerWorkspaceComponent\)/);
  assert.doesNotMatch(shell, /@ViewChild\(ProductWorkspaceComponent\)/);
});



// T18 Slice U02 (2026-11-21): every customer profile action has an icon,
// the profile heading wraps on words, and the phone number never splits.
test('customer profile actions carry icons and the heading wraps on words', () => {
  assert.ok(profile.includes("import { AbaIconComponent } from './shared/ui/aba-icon.component';"));
  // 3A-371: AbaSkeletonComponent joined the imports for the profile's
  // skeleton loading state (G4).
  assert.ok(profile.includes('imports: [AbaStateMessageComponent, AbaSkeletonComponent, AbaIconComponent]'));
  assert.ok(profile.includes('<aba-icon name="edit" />'));
  assert.ok(profile.includes('<aba-icon name="document" />'));
  assert.ok(profile.includes('<aba-icon name="statement" />'));
  assert.match(profile, /\.customer-profile button\{[^}]*display:inline-flex;align-items:center;justify-content:center;gap:6px/);
  assert.match(profile, /\.customer-profile button aba-icon\{width:15px;height:15px\}/);
  // The heading wraps on words (no anywhere): "Cairo Corner Shop" must not
  // break mid-word, and the phone number is one value that never splits.
  assert.match(profile, /\.customer-profile__identity h2\{[^}]*overflow-wrap:normal/);
  assert.doesNotMatch(profile, /\.customer-profile__identity h2\{[^}]*overflow-wrap:anywhere/);
  assert.match(profile, /\.customer-profile__item a\[href\^="tel:"\]\{white-space:nowrap\}/);
});

// U02 follow-up (2026-11-21): at <=380px the profile hero stacks (avatar above
// the name) so a long name has the full card width and stays inside the card —
// the row layout left the h2 a 70-76px column beside the 46px avatar and
// "Al Nour Trading and Wholesale Company" spilled out of the card at 195/220px.
// NEW assertions (no old assertions — the hero had no <=380px stacking rule).
test('customer profile hero stacks at narrow widths so a long name stays inside the card', () => {
  assert.match(profile, /@media\(max-width:380px\)\{\.customer-profile__hero\{flex-direction:column;align-items:flex-start/);
  // The heading still wraps on words (no anywhere) — the stack gives it room,
  // it does not break the name mid-word.
  assert.match(profile, /\.customer-profile__identity h2\{[^}]*overflow-wrap:normal/);
});

// T18 Slice U02 (2026-11-21): on mobile the tools sit above the search
// (New customer first), and back-navigation preserves the list position.
// 3A-354 (2026-11-22): the New customer action moved into the shell's
// unified customer tools row (add + import + export above the workspace),
// so the tools sit above the search at every width; the workspace opens
// its create form when the shell bumps the createRequest input.
test('customer workspace puts the tools above the mobile search and preserves the list on back-navigation', () => {
  assert.ok(workspace.includes("import { AbaIconComponent } from './shared/ui/aba-icon.component';"));
  assert.ok(workspace.includes('<aba-icon name="search" />'));
  assert.ok(appShell.includes('<aba-icon name="add" />'), 'the shell tools row carries the add icon');
  assert.ok(appShell.includes('(click)="customerCreateRequest = customerCreateRequest + 1"'), 'the shell add button requests a create');
  assert.ok(appShell.includes('[createRequest]="customerCreateRequest"'), 'the shell passes the create request to the workspace');
  assert.ok(workspace.includes('readonly createRequest = input(0);'), 'the workspace exposes the create request input');
  assert.ok(workspace.includes('this.createCustomer();'), 'the workspace opens the create form on request');
  assert.ok(!workspace.includes('customer-workspace__create'), 'the in-workspace create button and its ordering rule are removed');
  assert.ok(workspace.includes('<aba-icon name="chevron-left" />'));
  assert.match(workspace, /\.customer-workspace button\{[^}]*display:inline-flex;align-items:center;justify-content:center;gap:6px/);
  // Back-navigation: the list scroll is saved when leaving the list and
  // restored when coming back (profile and editor-cancel paths).
  assert.match(workspace, /private listScrollY = 0;/);
  assert.match(workspace, /private saveListScroll\(\): void \{ this\.listScrollY = window\.scrollY; \}/);
  assert.match(workspace, /private restoreListScroll\(\): void \{[\s\S]*?requestAnimationFrame\(\(\) => window\.scrollTo\(0, y\)\)/);
  assert.match(workspace, /if \(this\.mode\(\) === 'list'\) this\.saveListScroll\(\);/);
  assert.match(workspace, /backToDirectory\(\): void \{[\s\S]*?this\.restoreListScroll\(\);/);
  assert.match(workspace, /else \{ this\.mode\.set\('list'\); this\.restoreListScroll\(\); \}/);
});

// U02 follow-up (2026-11-21): at <=220px the search field stacks full-width
// above the Search button so the placeholder is not clipped to "Searc" — the
// side-by-side row left the input ~80-105px wide at 195/220px. NEW assertions
// (no old assertions — the search had no <=220px stacking rule).
test('customer workspace search stacks full-width at narrow widths so the placeholder is visible', () => {
  assert.match(workspace, /@media\(max-width:220px\)\{\.customer-workspace__search\{flex-direction:column\}/);
  assert.match(workspace, /@media\(max-width:220px\)\{[\s\S]*?\.customer-workspace__search input\{width:100%\}/);
  assert.match(workspace, /@media\(max-width:220px\)\{[\s\S]*?\.customer-workspace__search button\{width:100%\}/);
});
