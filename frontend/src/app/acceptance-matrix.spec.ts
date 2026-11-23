// #402 (3A-276): the acceptance matrix is a living registry. This spec
// fails when the shell gains or loses a destination, or when the
// access rules in module-access.ts drift from the matrix document, so
// a destination can never ship without an acceptance row.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const shellSource = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8');
const accessSource = readFileSync(new URL('./module-access.ts', import.meta.url), 'utf8');
const matrix = readFileSync(new URL('../../../docs/ACCEPTANCE_MATRIX_402.md', import.meta.url), 'utf8');

function shellTabs(): string[] {
  const match = shellSource.match(/type Tab = ([^;]+);/);
  assert.ok(match, 'Tab union not found in app.component.ts');
  return [...match[1].matchAll(/'([a-z-]+)'/g)].map(m => m[1]);
}

function ownerOnlyTabs(): string[] {
  const match = accessSource.match(/OWNER_ONLY_TABS = new Set<WorkspaceModuleTab>\(\[([^\]]+)\]\)/);
  assert.ok(match, 'OWNER_ONLY_TABS not found in module-access.ts');
  return [...match[1].matchAll(/'([a-z-]+)'/g)].map(m => m[1]);
}

test('#402 matrix covers every shell destination exactly once', () => {
  const tabs = shellTabs();
  assert.equal(tabs.length, 20, 'shell destination count changed — update the #402 matrix');
  for (const tab of tabs) {
    const rows = matrix.split('\n').filter(line => line.startsWith('|') && line.includes(`| ${tab} |`));
    if (tab === 'health') {
      assert.ok(matrix.includes('**health**'), 'health must be named as the operational surface');
      continue;
    }
    assert.equal(rows.length, 1, `destination ${tab} must have exactly one matrix row`);
  }
});

test('#402 matrix access column matches module-access.ts', () => {
  const ownerOnly = new Set(ownerOnlyTabs());
  for (const tab of shellTabs()) {
    if (tab === 'health') continue;
    const row = matrix.split('\n').find(line => line.startsWith('|') && line.includes(`| ${tab} |`));
    assert.ok(row, `matrix row missing for ${tab}`);
    if (tab === 'platform-admin') {
      assert.ok(row.includes('| Platform admin |'), 'platform-admin row must say Platform admin');
    } else if (ownerOnly.has(tab)) {
      assert.ok(row.includes('| Owner only |'), `${tab} row must say Owner only`);
    } else {
      assert.ok(row.includes('| Any member |'), `${tab} row must say Any member`);
    }
  }
});

test('#402 matrix keeps device evidence separate from browser evidence', () => {
  assert.ok(matrix.includes('NOT RUN'), 'matrix must carry the NOT RUN section');
  for (const phrase of ['Physical Android', 'Installed-PWA', 'Screen-reader']) {
    assert.ok(matrix.includes(phrase), `NOT RUN section must name: ${phrase}`);
  }
});
