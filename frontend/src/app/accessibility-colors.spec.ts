import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

function linearChannel(value: number): number {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const value = hex.replace('#', '');
  const red = linearChannel(Number.parseInt(value.slice(0, 2), 16));
  const green = linearChannel(Number.parseInt(value.slice(2, 4), 16));
  const blue = linearChannel(Number.parseInt(value.slice(4, 6), 16));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground: string, background: string): number {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test('secondary text on light surfaces meets WCAG AA normal-text contrast', () => {
  assert.match(
    styles,
    /:root body \.shell \.workspace-release-meta small,[\s\S]*?:root body \.shell footer span\s*\{\s*color:\s*var\(--aba-color-text-tertiary\);/,
  );
  const tertiaryToken = styles.match(/--aba-color-text-tertiary:\s*(#[0-9a-fA-F]{6})\s*;/);
  assert.ok(tertiaryToken, 'the tertiary text token must be a concrete six-digit color');

  for (const background of ['#f5f7fb', '#ffffff', '#f8fafc']) {
    assert.ok(
      contrastRatio(tertiaryToken[1], background) >= 4.5,
      `${tertiaryToken[1]} must reach 4.5:1 on ${background}`,
    );
  }
});

test('light-surface contrast override does not target dark sidebar labels', () => {
  assert.doesNotMatch(
    styles,
    /:root body \.shell \.light|:root body \.shell \.nav-label|:root body \.shell \.sidebar-bottom small/,
  );
});
