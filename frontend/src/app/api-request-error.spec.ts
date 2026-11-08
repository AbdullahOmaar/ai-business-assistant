import assert from 'node:assert/strict';
import test from 'node:test';
import { isDefinitiveNoWriteHttpStatus } from './api-request-error.ts';

test('classifies transactional API rejections as definitive no-write outcomes', () => {
  for (const status of [400, 401, 403, 404, 409, 422]) {
    assert.equal(isDefinitiveNoWriteHttpStatus(status), true, String(status));
  }
  for (const status of [408, 425, 429, 500, 502, 503, 504]) {
    assert.equal(isDefinitiveNoWriteHttpStatus(status), false, String(status));
  }
});
