import assert from 'node:assert/strict';
import test from 'node:test';
import { isDefinitiveNoWriteHttpStatus } from './api-request-error.ts';

test('validation and authorization rejections are definitive no-write; conflicts remain uncertain', () => {
  for (const status of [400, 401, 403, 404, 422]) {
    assert.equal(isDefinitiveNoWriteHttpStatus(status), true, String(status));
  }
  for (const status of [408, 409, 425, 429, 500, 502, 503, 504]) {
    assert.equal(isDefinitiveNoWriteHttpStatus(status), false, String(status));
  }
});
