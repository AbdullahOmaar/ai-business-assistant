import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// 3A-696 (Phase 1 closure batch, part 2): U03 catalog tools unification,
// G5 invoice-card price–currency cohesion, G2 export/primary icons.
// Source-assertion style, following the aba-filter-bar.spec.ts pattern.

const appSource = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8');
// 3A-921 F1c: the payments export action lives in the payments workspace now.
const paymentsSource = readFileSync(new URL('./payments-workspace.component.ts', import.meta.url), 'utf8');
const designSystem = readFileSync(new URL('../design-system.css', import.meta.url), 'utf8');
const reportsSource = readFileSync(new URL('./reports-workspace.component.ts', import.meta.url), 'utf8');
const platformAdminSource = readFileSync(new URL('./platform-admin.component.ts', import.meta.url), 'utf8');
const purchasingSource = readFileSync(new URL('./purchasing-workspace.component.ts', import.meta.url), 'utf8');
const productWorkspaceSource = readFileSync(new URL('./product-workspace.component.ts', import.meta.url), 'utf8');

test('U03: products tools follow the customers pattern — add first with the shared add icon, then the owner export tool, import summary carries the import icon', () => {
  const createIdx = appSource.indexOf('<details class="aba-record-create"');
  assert.ok(createIdx >= 0, 'products create disclosure must exist');
  const exportIdx = appSource.indexOf('<button class="secondary products-tool" type="button" (click)="exportCurrentList()">');
  assert.ok(exportIdx > createIdx, 'the export tool follows the add disclosure, as in the customers row');
  assert.ok(appSource.includes('<summary><span class="products-tool"><aba-icon name="add" />{{ t(\'ui.m_1nbakc8\') }}</span>'),
    'the create summary leads with the shared add icon and label');
  assert.ok(appSource.includes('<summary><span><aba-icon name="import" />{{ t(\'ui.m_1wgx28b\') }}</span></summary>'),
    'the import summary carries the shared import icon, mirroring the customers import summary');
  assert.match(designSystem, /\.products-tool\{display:inline-flex;align-items:center;gap:7px\}/,
    'products tools share the customers-tool inline-flex treatment');
  assert.match(designSystem, /\.products-tool aba-icon\{width:16px;height:16px\}/,
    'products tool icons take the same 16px size as customers tools');
});

test('G5: invoice card amounts are glued to their currency, like the drawer and the compact table', () => {
  assert.ok(appSource.includes('<bdi dir="ltr">{{ formatNumber(invoice.total) }} {{ invoice.currency_code }}</bdi>'),
    'card total carries its currency');
  assert.ok(appSource.includes('<bdi dir="ltr">{{ formatNumber(invoice.allocated_payments) }} {{ invoice.currency_code }}</bdi>'),
    'card allocated amount carries its currency');
  assert.ok(appSource.includes('<bdi dir="ltr">{{ formatNumber(invoice.outstanding_amount) }} {{ invoice.currency_code }}</bdi>'),
    'card outstanding amount carries its currency');
});

test('G2: the remaining text-only export actions carry the shared export icon', () => {
  assert.ok(paymentsSource.includes('(click)="exportPaymentsCsv()" [disabled]="!payments.length"><aba-icon name="export" />'),
    'payments export has the export icon');
  assert.ok(reportsSource.includes('(click)="exportReceivablesAgingCsv()" [disabled]="!agingReport.invoices.length"><aba-icon name="export" />'),
    'reports aging export has the export icon');
  assert.ok(reportsSource.includes('AbaIconComponent'),
    'reports workspace imports the shared icon component');
  assert.ok(platformAdminSource.includes('(click)="exportAudit()"><aba-icon name="export" />'),
    'platform-admin audit export has the export icon');
});

test('G2: every purchasing primary action carries an icon', () => {
  const iconUses = purchasingSource.match(/<aba-icon name="[a-z-]+" \/>/g) ?? [];
  assert.equal(iconUses.length, 6, 'the six pw__primary buttons each carry exactly one icon');
  assert.ok(purchasingSource.includes('<button class="pw__primary" type="button" (click)="startCreate()" [disabled]="loading()"><aba-icon name="add" />'),
    'new-order primary carries the add icon');
  assert.ok(purchasingSource.includes('(click)="startReceipt()"><aba-icon name="document" />'),
    'receive primary carries the document icon');
  assert.match(purchasingSource, /\.pw__primary\{[^}]*display:inline-flex;align-items:center;justify-content:center;gap:7px\}/,
    'purchasing primaries lay out icon and label as one inline-flex unit');
  assert.match(purchasingSource, /\.pw__primary aba-icon\{width:16px;height:16px\}/,
    'purchasing primary icons take the shared 16px tool size');
});

// 3A-696 part 3 (G7): scroll save/restore, copied from the customer
// workspace pattern (T18 Slice U02) into purchasing and products.
test('G7: purchasing and products preserve the list scroll position across detail navigation', () => {
  for (const [name, source] of [['purchasing', purchasingSource], ['products', productWorkspaceSource]] as const) {
    assert.ok(source.includes('private listScrollY = 0;'), `${name}: scroll field exists`);
    assert.match(source, /private saveListScroll\(\): void \{ this\.listScrollY = window\.scrollY; \}/,
      `${name}: save copies the customer pattern`);
    assert.match(source, /private restoreListScroll\(\): void \{\s*const y = this\.listScrollY;\s*requestAnimationFrame\(\(\) => window\.scrollTo\(0, y\)\);\s*\}/,
      `${name}: restore copies the customer pattern`);
  }
  assert.ok(purchasingSource.includes("if (this.mode() === 'list') this.saveListScroll();"),
    'purchasing saves only when actually leaving the list (not on save-draft reopen or retry)');
  assert.match(purchasingSource, /backToList\(\): void \{\s*this\.mode\.set\('list'\);\s*this\.restoreListScroll\(\);/,
    'purchasing restores on back-to-list');
  assert.ok(productWorkspaceSource.includes("if (this.mode() === 'list') this.saveListScroll();"),
    'products saves only when leaving the catalog (not on profile retry)');
  assert.match(productWorkspaceSource, /backToCatalog\(\): void \{[\s\S]*?this\.mode\.set\('list'\);\s*this\.restoreListScroll\(\);/,
    'products restores on back-to-catalog');
});
