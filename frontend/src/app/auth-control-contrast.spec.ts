import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

function linearChannel(value: number): number {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4].map(offset => Number.parseInt(value.slice(offset, offset + 2), 16));
  const [red, green, blue] = channels.map(linearChannel);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(first: string, second: string): number {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

test('authentication form boundaries meet WCAG non-text contrast against the semantic surface', () => {
  const border = styles.match(/--aba-color-auth-control-boundary:\s*(#[0-9a-f]{6})/i)?.[1];
  const surface = styles.match(/--aba-color-surface:\s*(#[0-9a-f]{6})/i)?.[1];
  assert.ok(border, 'auth control boundary token must exist');
  assert.ok(surface, 'semantic form surface token must exist');
  const ratio = contrastRatio(border, surface);
  assert.ok(ratio >= 3, `auth control border must reach 3:1; got ${ratio.toFixed(2)}:1`);
  assert.match(styles, /:root body \.shell \.auth-card input[\s\S]*?border-color:\s*var\(--aba-color-auth-control-boundary\)/);
  assert.match(styles, /:root body \.shell \.setup-card input[\s\S]*?border-color:\s*var\(--aba-color-auth-control-boundary\)/);
});
