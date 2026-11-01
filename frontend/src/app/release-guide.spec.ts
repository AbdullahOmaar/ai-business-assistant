import assert from 'node:assert/strict';
import test from 'node:test';
import { FEATURE_CATALOG } from './release-guide.ts';

const byId = new Map(FEATURE_CATALOG.map((group) => [group.id, group]));

test('demo catalogue includes all seven implemented operational groups in Arabic and English', () => {
  const expected = [
    ['suppliers', 'الموردون', 'Suppliers'],
    ['purchasing', 'المشتريات والاستلام', 'Purchasing & receiving'],
    ['recurring-invoices', 'الفواتير الدورية', 'Recurring invoices'],
    ['notifications', 'الإشعارات', 'Notifications'],
    ['operational-health', 'الحالة التشغيلية', 'Operational health'],
    ['data-integrity', 'سلامة البيانات', 'Data integrity'],
    ['tax-summary', 'ملخص الضرائب', 'Tax summary'],
  ];

  for (const [id, titleAr, titleEn] of expected) {
    const group = byId.get(id);
    assert.ok(group, `missing catalogue group: ${id}`);
    assert.equal(group.titleAr, titleAr, `${id} Arabic title`);
    assert.equal(group.titleEn, titleEn, `${id} English title`);
    assert.ok(group.noteAr.trim(), `${id} Arabic summary`);
    assert.ok(group.noteEn.trim(), `${id} English summary`);
    assert.ok(group.features.length > 0, `${id} feature list`);

    for (const feature of group.features) {
      assert.ok(feature.titleAr.trim(), `${id} feature Arabic title`);
      assert.ok(feature.titleEn.trim(), `${id} feature English title`);
      assert.ok(feature.detailAr.trim(), `${id} feature Arabic detail`);
      assert.ok(feature.detailEn.trim(), `${id} feature English detail`);
    }
  }
});

test('catalogue clearly discloses deferred execution and read-only boundaries', () => {
  assert.match(byId.get('purchasing').noteAr, /لا تفترض.*معالجة محاسبية/);
  assert.match(byId.get('purchasing').noteEn, /does not imply accounting treatment/);
  assert.match(byId.get('recurring-invoices').noteAr, /إنشاء الفواتير الفعلية يعتمد على تنفيذ الخادم/);
  assert.match(byId.get('recurring-invoices').noteEn, /actual invoice creation depends on backend execution/);
  assert.match(byId.get('notifications').noteAr, /الإرسال الفعلي يحتاج مزودًا وعامل تسليم منشورًا/);
  assert.match(byId.get('notifications').noteEn, /actual delivery requires a configured provider and deployed worker/);
  assert.match(byId.get('data-integrity').noteAr, /لا ينفذ إصلاحات تلقائية/);
  assert.match(byId.get('data-integrity').noteEn, /does not automatically repair records/);
  assert.match(byId.get('tax-summary').noteAr, /لا ينشئ إقرارات أو قيودًا أو التزامات ضريبية/);
  assert.match(byId.get('tax-summary').noteEn, /does not create filings, ledger entries, or tax liabilities/);
});
