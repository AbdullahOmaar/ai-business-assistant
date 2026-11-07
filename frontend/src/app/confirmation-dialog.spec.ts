import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./shared/ui/aba-confirm-dialog.component.ts', import.meta.url), 'utf8');

test('shared confirmation dialog exposes accessible modal semantics and focus management', () => {
  assert.match(source, /role="alertdialog"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /aria-labelledby="aba-confirm-title"/);
  assert.match(source, /aria-describedby="aba-confirm-description"/);
  assert.match(source, /@HostListener\('document:keydown', \['\$event'\]\)/);
  assert.match(source, /event\.key === 'Escape'/);
  assert.match(source, /event\.key !== 'Tab'/);
  assert.match(source, /previousActiveElement/);
  assert.match(source, /focusFallbackId/);
  assert.match(source, /queueMicrotask\(\(\) => this\.cancelButton\?\.nativeElement\.focus\(\)\)/);
});

test('confirmation actions are explicit, cancellable, and disabled while busy or after an uncertain result', () => {
  assert.match(source, /type="button"/);
  assert.match(source, /\[disabled\]="busy"/);
  assert.match(source, /\[disabled\]="busy \|\| confirmDisabled"/);
  assert.match(source, /confirmed\.emit\(\)/);
  assert.match(source, /cancelled\.emit\(\)/);
  assert.match(source, /event\.target === event\.currentTarget && !this\.busy/);
});
