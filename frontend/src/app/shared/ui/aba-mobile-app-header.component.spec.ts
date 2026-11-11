import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const component = readFileSync(new URL('./aba-mobile-app-header.component.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('./aba-mobile-app-header.component.css', import.meta.url), 'utf8');

test('mobile account popup exposes its trigger relationship and moves focus into the actions', () => {
  assert.match(component, /aria-haspopup="true"/);
  assert.match(component, /#accountMenu/);
  assert.match(component, /querySelector<HTMLButtonElement>\('button'\)\?\.focus\(\)/);
});

test('Escape closes the account popup and restores focus to its trigger', () => {
  assert.match(component, /closeProfileMenuOnEscape/);
  assert.match(component, /this\.profileTrigger\?\.nativeElement\.focus\(\)/);
});

test('outside focus and pointer interaction close the popup without taking focus back', () => {
  assert.match(component, /closeProfileMenuOnOutsideFocus/);
  assert.match(component, /closeProfileMenuOnOutsidePointer/);
  assert.match(component, /const accountMenu = this\.accountMenu\?\.nativeElement/);
});

test('mobile header controls keep visible focus, touch feedback and reduced-motion support', () => {
  assert.match(css, /:is\(button, select\):focus-visible/);
  assert.match(css, /touch-action:\s*manipulation/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /transform:\s*none/);
});
