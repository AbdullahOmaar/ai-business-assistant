import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const component = readFileSync(new URL('./inventory-movement-ledger.component.ts', import.meta.url), 'utf8');
const guard = readFileSync(new URL('./workspace-load-guard.ts', import.meta.url), 'utf8');

test('inventory ledger is an isolated standalone read-only component', () => {
  assert.match(component, /selector: 'aba-inventory-movement-ledger'/);
  assert.match(component, /standalone: true/);
  assert.match(component, /readonly loadPage = input\.required<InventoryMovementLoader>\(\)/);
  assert.doesNotMatch(component, /createMovement|updateMovement|deleteMovement|adjustStock/);
});

test('ledger query exposes only supported tenant-scoped read filters and bounded pagination', () => {
  assert.match(component, /productId: string/);
  assert.match(component, /movementType: InventoryMovementType \| ''/);
  assert.match(component, /limit: number/);
  assert.match(component, /offset: number/);
  assert.match(component, /private readonly pageSize = 50/);
  assert.match(component, /businessId: requested\.businessId/);
  assert.match(component, /productId: this\.productId\(\)/);
  assert.match(component, /movementType: this\.movementType\(\)/);
});

test('movement types match the backend allowlist without inventing filters', () => {
  for (const type of ['opening', 'receipt', 'sale', 'return', 'adjustment']) {
    assert.ok(component.includes(`'${type}'`));
  }
  assert.match(component, /const MOVEMENT_TYPES: InventoryMovementType\[\]/);
  assert.doesNotMatch(component, /supplierId|warehouseId|dateFrom|dateTo/);
});

test('desktop table and mobile cards present the same read-only movement records', () => {
  assert.match(component, /inventory-ledger__mobile-list/);
  assert.match(component, /inventory-ledger__desktop-table/);
  assert.match(component, /movement\.product\.name/);
  assert.match(component, /movement\.movement_type/);
  assert.match(component, /movement\.quantity_delta/);
  assert.match(component, /movement\.created_at/);
});

test('signed quantities and localized timestamps retain backend values', () => {
  assert.match(component, /signDisplay: 'always'/);
  assert.match(component, /dateStyle: 'medium', timeStyle: 'short'/);
  assert.match(component, /Number\(value\) < 0/);
  assert.match(component, /created_at: string/);
});

test('pagination appends unique records and follows the server has_more flag', () => {
  assert.match(component, /hasMore\.set\(page\.has_more\)/);
  assert.match(component, /reset \? page\.items : \[\.\.\.this\.items\(\), \.\.\.page\.items\]/);
  assert.match(component, /new Map<string, InventoryMovement>\(\)/);
  assert.match(component, /loadMore\(\)/);
});

test('workspace identity changes invalidate pending requests and clear old tenant data', () => {
  assert.match(component, /this\.guard\.invalidate\(\)/);
  assert.match(component, /this\.items\.set\(\[\]\)/);
  assert.match(component, /current\.userId === requested\.userId/);
  assert.match(component, /current\.role === requested\.role/);
  assert.match(guard, /isCurrent\(version: number, currentWorkspaceId/);
});

test('loading, empty, error, retry and keyboard-accessible controls are present', () => {
  for (const state of ['role="status"', 'role="alert"', 'emptyTitle', 'retry()', 'loadMore()']) {
    assert.ok(component.includes(state), `missing state/control: ${state}`);
  }
  assert.match(component, /:focus-visible/);
  assert.match(component, /forced-colors:active/);
  assert.match(component, /prefers-reduced-motion:reduce/);
  assert.match(component, /aria-label/);
});
