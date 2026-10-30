import assert from 'node:assert/strict';
import test from 'node:test';
import { observeAuthState } from './auth-state-observer.ts';

test('initial auth state resolves readiness and later cross-tab changes update the cached user', async () => {
  let emitUser: ((user: string | null) => void) | undefined;
  let emitError: ((error: unknown) => void) | undefined;
  let cachedUser: string | null | undefined;
  let unsubscribeCalls = 0;
  let readyUnsubscribe: (() => void) | undefined;

  const ready = observeAuthState<string>(
    (onUser, onError) => {
      emitUser = onUser;
      emitError = onError;
      return () => { unsubscribeCalls += 1; };
    },
    user => { cachedUser = user; },
    () => { cachedUser = null; },
    unsubscribe => { readyUnsubscribe = unsubscribe; },
    100
  );

  emitUser?.('owner-user');
  await ready;

  assert.equal(cachedUser, 'owner-user');
  assert.equal(unsubscribeCalls, 0);
  assert.equal(typeof readyUnsubscribe, 'function');

  emitUser?.(null);
  assert.equal(cachedUser, null);
  assert.equal(unsubscribeCalls, 0);

  emitUser?.('staff-user');
  assert.equal(cachedUser, 'staff-user');
  assert.equal(unsubscribeCalls, 0);
  assert.equal(typeof emitError, 'function');
});

test('an observer error after initialization clears identity and releases the observer', async () => {
  let emitUser: ((user: string | null) => void) | undefined;
  let emitError: ((error: unknown) => void) | undefined;
  let cachedUser: string | null | undefined;
  let unsubscribeCalls = 0;
  const observedErrors: unknown[] = [];

  const ready = observeAuthState<string>(
    (onUser, onError) => {
      emitUser = onUser;
      emitError = onError;
      return () => { unsubscribeCalls += 1; };
    },
    user => { cachedUser = user; },
    error => { observedErrors.push(error); },
    () => {},
    100
  );

  emitUser?.('owner-user');
  await ready;
  const failure = new Error('observer stopped');
  emitError?.(failure);

  assert.equal(cachedUser, null);
  assert.deepEqual(observedErrors, [failure]);
  assert.equal(unsubscribeCalls, 1);
  emitUser?.('late-user');
  assert.equal(cachedUser, null);
});

test('an initial observer error rejects readiness and unsubscribes', async () => {
  let emitError: ((error: unknown) => void) | undefined;
  let unsubscribeCalls = 0;
  const failure = new Error('initial observer failure');

  const ready = observeAuthState<string>(
    (_onUser, onError) => {
      emitError = onError;
      return () => { unsubscribeCalls += 1; };
    },
    () => {},
    () => {},
    () => {},
    100
  );

  emitError?.(failure);
  await assert.rejects(ready, /initial observer failure/);
  assert.equal(unsubscribeCalls, 1);
});

test('an initial auth-state timeout rejects readiness, unsubscribes and ignores late callbacks', async () => {
  let unsubscribeCalls = 0;
  let emitUser: ((user: string | null) => void) | undefined;
  let cachedUser: string | null = null;

  const ready = observeAuthState<string>(
    onUser => {
      emitUser = onUser;
      return () => { unsubscribeCalls += 1; };
    },
    user => { cachedUser = user; },
    () => { cachedUser = null; },
    () => {},
    1
  );

  await assert.rejects(ready, /session check timed out/);
  assert.equal(unsubscribeCalls, 1);
  emitUser?.('late-user');
  assert.equal(cachedUser, null);
});

test('a synchronous initial callback still registers the returned unsubscribe function', async () => {
  let readyUnsubscribe: (() => void) | undefined;
  let unsubscribeCalls = 0;

  await observeAuthState<string>(
    onUser => {
      onUser('synchronous-user');
      return () => { unsubscribeCalls += 1; };
    },
    () => {},
    () => {},
    unsubscribe => { readyUnsubscribe = unsubscribe; },
    100
  );

  assert.equal(typeof readyUnsubscribe, 'function');
  readyUnsubscribe?.();
  assert.equal(unsubscribeCalls, 1);
});
