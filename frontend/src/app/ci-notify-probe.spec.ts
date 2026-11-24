import assert from 'node:assert/strict';
import test from 'node:test';

// 3A-267 probe: deliberately failing spec that proves the Slack CI-failure
// notification pipeline actually delivers. Probe PR only - never merge.
test('ci-notify probe (3A-267) - deliberate failure', () => {
  assert.equal(true, false, 'Deliberate failure for the 3A-267 Slack notification proof');
});
