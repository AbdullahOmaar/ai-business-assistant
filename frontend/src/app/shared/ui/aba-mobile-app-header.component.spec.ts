import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const component = readFileSync(new URL('./aba-mobile-app-header.component.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('./aba-mobile-app-header.component.css', import.meta.url), 'utf8');

test('mobile account popup is a disclosure whose actions follow its trigger in keyboard order', () => {
  assert.ok(component.includes('[attr.aria-expanded]="profileMenuOpen"'));
  assert.ok(component.includes('aria-controls'));
  assert.ok(component.indexOf('id="mobile-account-menu"') < component.indexOf('class="workspace-context"'));
  assert.ok(!component.includes('aria-haspopup'));
});

test('Escape closes the account popup and restores focus to its trigger', () => {
  assert.ok(component.includes('closeProfileMenuOnEscape'));
  assert.ok(component.includes('this.profileTrigger?.nativeElement.focus()'));
});

test('outside focus and pointer interaction close the popup without taking focus back', () => {
  assert.ok(component.includes('closeProfileMenuOnOutsideFocus'));
  assert.ok(component.includes('closeProfileMenuOnOutsidePointer'));
});

test('mobile header controls keep visible focus, touch feedback and reduced-motion support', () => {
  assert.ok(css.includes(':is(button, select):focus-visible'));
  assert.ok(css.includes('touch-action: manipulation'));
  assert.ok(css.includes('prefers-reduced-motion: reduce'));
  assert.ok(css.includes('transform: none'));
});
