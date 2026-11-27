// 3A-920 step 3 — the second selling unit + conversion factor on the
// product. The company sets its own second unit (a trip, a delivery, a
// carton) and how many base units one second unit holds; both are set
// together or both absent. The fields render only while the transport
// switch is on, and the editor never sends the keys while off, so a
// stored pair is never cleared by an unrelated edit. The backend config
// + gates are covered by backend/tests/test_product_second_unit.py.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const appDirectory = dirname(fileURLToPath(import.meta.url));
const editor = readFileSync(resolve(appDirectory, 'product-editor.component.ts'), 'utf8');
const workspace = readFileSync(resolve(appDirectory, 'product-workspace.component.ts'), 'utf8');
const profile = readFileSync(resolve(appDirectory, 'product-profile.component.ts'), 'utf8');
const apiService = readFileSync(resolve(appDirectory, 'api.service.ts'), 'utf8');
const publicDirectory = resolve(appDirectory, '../../public/i18n');
const arabic = JSON.parse(readFileSync(resolve(publicDirectory, 'ar.json'), 'utf8'));
const english = JSON.parse(readFileSync(resolve(publicDirectory, 'en.json'), 'utf8'));

test('product record carries the second unit + factor through the API layer', () => {
  assert.ok(apiService.includes('second_unit_name?: string | null; conversion_factor?: string | null;'));
  assert.ok(apiService.includes("'second_unit_name' | 'conversion_factor'"));
});

test('editor shows the second-unit fields only while transport is on', () => {
  assert.ok(editor.includes('readonly transportEnabled = input(false);'));
  assert.ok(editor.includes('@if (transportEnabled()) {'));
  assert.ok(editor.includes('name="secondUnitName"'));
  assert.ok(editor.includes('name="conversionFactor"'));
  assert.ok(editor.includes("t('ui.products.secondUnit.name')"));
  assert.ok(editor.includes("t('ui.products.secondUnit.factor')"));
  assert.ok(editor.includes("t('ui.products.secondUnit.factorHint')"));
  // The fields live in the same form as the base unit — no new tab/screen.
  assert.ok(editor.includes('secondUnitName.set(product?.second_unit_name ?? \'\')'));
  assert.ok(editor.includes('conversionFactor.set(product?.conversion_factor ?? \'\')'));
});

test('editor validates the pair all-or-nothing and never clears it while off', () => {
  assert.ok(editor.includes('secondUnitValid(): boolean'));
  assert.ok(editor.includes('if (!name && !factor) return true;'));
  assert.ok(editor.includes('parsed > 0'));
  assert.ok(editor.includes('!this.secondUnitValid() || this.busy()) return;'));
  // While off, neither key is sent — an unrelated edit cannot clear the pair.
  assert.ok(editor.includes('...(this.transportEnabled() ? {'));
  assert.ok(editor.includes('second_unit_name: this.secondUnitName().trim() || null,'));
  assert.ok(editor.includes('conversion_factor: this.conversionFactor().trim() || null,'));
});

test('workspace loads the transport flag and passes it to the editor', () => {
  assert.ok(workspace.includes("import { transportEnabledFromSettings } from './transport-settings';"));
  assert.ok(workspace.includes('readonly transportEnabled = signal(false);'));
  assert.ok(workspace.includes('void this.loadTransportFlag(context.businessId);'));
  assert.ok(workspace.includes('this.transportEnabled.set(transportEnabledFromSettings(settings));'));
  assert.ok(workspace.includes('[transportEnabled]="transportEnabled()"'));
});

test('product profile shows the second unit as one second unit = factor base units', () => {
  assert.ok(profile.includes('@if (record.second_unit_name) {'));
  assert.ok(profile.includes("t('productProfile.secondUnit')"));
  assert.ok(profile.includes('{{ record.second_unit_name }} × {{ record.conversion_factor }} {{ record.unit }}'));
});

test('second-unit copy is localized in both languages and names no trade', () => {
  const keys = ['name', 'namePlaceholder', 'nameRequired', 'factor', 'factorPlaceholder', 'factorHint', 'invalid', 'sellUnit'];
  for (const key of keys) {
    assert.equal(typeof arabic.ui.products.secondUnit[key], 'string', `ar secondUnit.${key}`);
    assert.equal(typeof english.ui.products.secondUnit[key], 'string', `en secondUnit.${key}`);
  }
  assert.equal(typeof arabic.productProfile.secondUnit, 'string');
  assert.equal(typeof english.productProfile.secondUnit, 'string');
  const copy = JSON.stringify(arabic.ui.products.secondUnit) + JSON.stringify(english.ui.products.secondUnit);
  assert.ok(!/شونة|Shouna|Elshona/i.test(copy), 'no trade name in the copy');
});
