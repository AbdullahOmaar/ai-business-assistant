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

test('customer editor covers all supported contact fields and required-name/email validation', () => {
  for (const field of ['name', 'email', 'phone', 'address', 'notes']) assert.ok(editor.includes('name="' + field + '"'));
  for (const max of ['160', '254', '32', '500', '1000']) assert.ok(editor.includes('maxlength="' + max + '"'));
  assert.match(editor, /if \(!name \|\| this\.emailInvalid\(\) \|\| this\.busy\(\)\) return/);
  assert.match(editor, /this\.save\.emit\(/);
  assert.match(editor, /this\.customer\(\)/);
  assert.match(editor, /hasWhitespace/);
  assert.match(editorCss, /@media\(max-width:560px\)/);
  assert.match(editorCss, /min-height:46px/);
  assert.match(editorCss, /forced-colors:active/);
});

test('customer profile presents contact, address, notes and existing invoice/statement actions without invented financial totals', () => {
  for (const field of ['phone', 'email', 'address', 'notes']) assert.ok(profile.includes('record.' + field));
  assert.match(profile, /invoices\.emit\(\)/);
  assert.match(profile, /statement\.emit\(\)/);
  assert.match(profile, /loading\(\)/);
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

test('customer directory preserves responsive layouts and exposes saved address and notes', () => {
  assert.match(directory, /customer-directory__mobile-list/);
  assert.match(directory, /aria-sort/);
  assert.match(directory, /emitAction\(customer\.id, 'statement'/);
  assert.match(directory, /customer\.address/);
  assert.match(directory, /customer\.notes/);
  assert.match(directory, /error\(\)/);
  assert.match(directory, /retry\.emit\(\)/);
  assert.match(directoryCss, /min-height:44px/);
  assert.match(directoryCss, /forced-colors:active/);
});

test('customer workspace covers server search, paginated list, detail and create/edit with tenant stale-response guards', () => {
  assert.match(workspace, /this\.api\.customers\(requested\.businessId, this\.offset, this\.pageSize, this\.searchQuery\)/);
  assert.match(workspace, /this\.searchQuery = this\.searchDraft\(\)\.trim\(\)\.slice\(0, 120\)/);
  assert.match(workspace, /this\.api\.customer\(requested\.businessId, customerId\)/);
  assert.match(workspace, /this\.api\.createCustomer\(requested\.businessId, value\)/);
  assert.match(workspace, /this\.api\.updateCustomer\(requested\.businessId, editingId, value\)/);
  assert.match(workspace, /this\.isCurrent\(this\.listGuard/);
  assert.match(workspace, /this\.isCurrent\(this\.detailGuard/);
  assert.match(workspace, /this\.isCurrent\(this\.saveGuard/);
  assert.match(workspace, /pageSize = 100/);
  assert.match(workspace, /@if \\(hasMore\\(\\) && !error\\(\\)\\)/);
  assert.match(workspace, /\\[disabled\\]="loading\\(\\)"/);
  assert.match(workspace, /loadingMore\\(\\) \\? t\\('ui\\.m_1dwk1vm'\\)/);
  assert.match(workspace, /\(retry\)="retry\(\)"/);
  assert.doesNotMatch(workspace, /\[retry\]="retry"/);
});
