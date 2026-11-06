import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const demo = readFileSync(new URL('../../../demo/index.html', import.meta.url), 'utf8');

test('feature preview is explicitly fictional, local-only, and Arabic RTL', () => {
  assert.match(demo, /<html lang="ar" dir="rtl">/);
  assert.match(demo, /ديمو مستقل — ليس نظام إنتاج/);
  assert.match(demo, /لا يتم إرسالها إلى أي خادم أو تخزينها/);
  assert.doesNotMatch(demo, /\bfetch\s*\(|XMLHttpRequest|WebSocket/);
});

test('preview does not offer a partial English switch that leaves Arabic content unchanged', () => {
  assert.doesNotMatch(demo, /id="lang"|\$\('lang'\)\.onchange/);
  assert.match(demo, /<html lang="ar" dir="rtl">/);
});

test('invoice print preview handles a blocked popup and reports status in its own card', () => {
  assert.match(demo, /id="printStatus"/);
  assert.match(demo, /window\.open\('','_blank'\)/);
  assert.doesNotMatch(demo, /window\.open\('','_blank','noopener'\)/);
  assert.match(demo, /\$\('printStatus'\)\.textContent=/);
});

test('tax behavior stays disabled while the shared tax policy is not approved', () => {
  assert.match(demo, /T37: DRAFT \/ NOT APPROVED/);
  assert.match(demo, /لا توجد نسبة افتراضية أو حساب ضريبي معتمد/);
  assert.doesNotMatch(demo, /id="taxRate"|id="taxCalc"|\$\('taxCalc'\)\.onclick/);
});

test('demo reset restores workspace, invoice, payment, import, and mock controls', () => {
  assert.match(demo, /id="resetDemo"/);
  assert.match(demo, /\$\('resetDemo'\)\.onclick=/);
  assert.match(demo, /fail=false;paid=false;lines=\[\{name:'قهوة',price:120,qty:1\}\]/);
  assert.match(demo, /\$\('workspace'\)\.value='a'/);
  assert.match(demo, /\$\('paymentStatus'\)\.textContent='بانتظار الدفع'/);
  assert.match(demo, /renderWorkspace\(\);renderLines\(\)/);
});
