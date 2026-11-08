import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const componentSource = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8');

test('customer statement keeps its wide ledger inside a touch-scrollable region', () => {
  assert.match(componentSource, /class="panel statement-panel"/);
  assert.match(componentSource, /class="table-wrap audit-table-wrap" role="region" tabindex="0"[^>]*><table><thead>/);
  assert.match(componentSource, /\.statement-panel\{[^}]*max-width:100%/);
  assert.match(componentSource, /\.statement-panel \.table-wrap\{[^}]*overflow-x:auto/);
  assert.match(componentSource, /\.statement-panel \.table-wrap table\{[^}]*min-width:680px/);
  assert.match(componentSource, /\.statement-panel \.table-wrap th,\.statement-panel \.table-wrap td\{[^}]*white-space:nowrap/);
});

test('long customer statement references can wrap without widening the page', () => {
  assert.match(componentSource, /\.statement-panel \.table-wrap td:nth-child\(3\)\{[^}]*overflow-wrap:anywhere/);
});
