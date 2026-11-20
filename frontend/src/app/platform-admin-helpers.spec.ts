import assert from 'node:assert/strict';
import test from 'node:test';
import { hasMeaningfulPlatformAdminReason } from './platform-admin-helpers.ts';

test('rejects short reasons', () => {
  assert.equal(hasMeaningfulPlatformAdminReason(''), false);
  assert.equal(hasMeaningfulPlatformAdminReason('  '), false);
  assert.equal(hasMeaningfulPlatformAdminReason('ab'), false);
});

test('accepts three or more trimmed characters', () => {
  assert.equal(hasMeaningfulPlatformAdminReason('why'), true);
  assert.equal(hasMeaningfulPlatformAdminReason('  enough  '), true);
});
