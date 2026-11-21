import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// ApiService uses Angular parameter properties, which node --test's
// strip-types mode cannot import. Like the app.component specs in this repo,
// the transport methods below are exercised from their source text: each
// method is transpiled and run in a VM with a stubbed fetch and a controllable
// clock, so a never-resolving fetch/body is a real behavioral failure, not a
// source-text assertion.
const source = readFileSync(new URL('./api.service.ts', import.meta.url), 'utf8');

function methodSource(startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `Unable to locate method: ${startMarker}`);
  return source.slice(start, end);
}

function loadMethod(name: 'requestBlob' | 'requestCsv', src: string): (...args: unknown[]) => Promise<unknown> {
  const fnSrc = src.replace(new RegExp(`private async ${name}`), `async function ${name}`);
  const transpiled = ts.transpileModule(fnSrc, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return runInNewContext(`${transpiled}\n${name};`, sandbox) as (...args: unknown[]) => Promise<unknown>;
}

function abortError(): Error {
  const error = new Error('This operation was aborted');
  error.name = 'AbortError';
  return error;
}

function createClock() {
  let nextId = 1;
  const pending = new Map<number, () => void>();
  return {
    setTimeout: (fn: () => void, _delay: number) => {
      const id = nextId++;
      pending.set(id, fn);
      return id;
    },
    clearTimeout: (id: number) => {
      pending.delete(id);
    },
    pendingCount: () => pending.size,
    advanceAll: () => {
      for (const fn of [...pending.values()]) fn();
      pending.clear();
    },
  };
}

const clock = createClock();

// The sandbox is shared: each test replaces sandbox.fetch before invoking.
const sandbox: Record<string, unknown> = {
  AbortController,
  setTimeout: clock.setTimeout,
  clearTimeout: clock.clearTimeout,
  fetch: () => Promise.reject(new Error('fetch stub not installed')),
};

const fakeAuth = {
  getRuntimeConfig: async () => ({ apiBaseUrl: 'https://mock-api.test' }),
  idToken: async () => 'test-token',
};

// Mirrors real fetch: rejects with AbortError when the signal aborts. With no
// signal (the unfixed transport passes none) nothing can abort it, so the
// promise hangs forever — which is exactly the defect under test.
function neverResolving(signal?: AbortSignal): Promise<never> {
  return new Promise((_resolve, reject) => {
    if (!signal) return;
    if (signal.aborted) {
      reject(abortError());
      return;
    }
    signal.addEventListener('abort', () => reject(abortError()));
  });
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => {
    resolve = res;
  });
  return { promise, resolve };
}

async function waitFor(predicate: () => boolean, what: string): Promise<void> {
  for (let i = 0; i < 50; i++) {
    if (predicate()) return;
    await new Promise(r => setTimeout(r, 0));
  }
  assert.fail(`timed out waiting for: ${what}`);
}

function realTimeout(ms: number): Promise<never> {
  return new Promise((_resolve, reject) => {
    setTimeout(() => reject(new Error(`request did not settle within ${ms}ms of real time`)), ms);
  });
}

async function withWatchdog<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([promise, realTimeout(2000)]);
}

const blobSource = methodSource(
  '  private async requestBlob(path: string): Promise<{ blob: Blob; response: Response }> {',
  '  private async requestCsv<T>(path: string, csvText: string): Promise<T> {',
);
const csvSource = methodSource(
  '  private async requestCsv<T>(path: string, csvText: string): Promise<T> {',
  '  previewProductCsv(',
);
const blobPath = '/api/v1/platform-admin/audit-events/export.csv';
const csvPath = '/api/v1/businesses/b1/imports/customers.csv/preview';

test('requestBlob aborts a never-resolving fetch within the 15s bound', async () => {
  const fn = loadMethod('requestBlob', blobSource);
  sandbox.fetch = (_url: string, opts: { signal?: AbortSignal }) => neverResolving(opts.signal);
  const call = fn.call({ auth: fakeAuth }, blobPath);
  await waitFor(
    () => clock.pendingCount() > 0,
    'requestBlob to arm an abort timer — the blob transport has no timeout bound',
  );
  clock.advanceAll();
  await assert.rejects(withWatchdog(call), /timed out/);
  assert.equal(clock.pendingCount(), 0, 'the abort timer must be cleared after the timeout');
});

test('requestBlob aborts a never-resolving CSV body within the 15s bound', async () => {
  const fn = loadMethod('requestBlob', blobSource);
  const fetchGate = deferred<unknown>();
  let fetchCalled = false;
  let fetchSignal: AbortSignal | undefined;
  let bodyReadStarted = false;
  sandbox.fetch = (_url: string, opts: { signal?: AbortSignal }) => {
    fetchCalled = true;
    fetchSignal = opts.signal;
    return fetchGate.promise;
  };
  const call = fn.call({ auth: fakeAuth }, blobPath);
  await waitFor(() => fetchCalled, 'blob fetch to be issued');
  fetchGate.resolve({
    ok: true,
    status: 200,
    headers: { get: () => null },
    blob: () => {
      bodyReadStarted = true;
      return neverResolving(fetchSignal);
    },
    json: async () => ({}),
  });
  await waitFor(() => bodyReadStarted, 'blob body read to start');
  assert.equal(clock.pendingCount(), 1, 'the abort timer must stay armed while the CSV body is being read');
  clock.advanceAll();
  await assert.rejects(withWatchdog(call), /timed out/);
  assert.equal(clock.pendingCount(), 0, 'the abort timer must be cleared after the timeout');
});

test('requestCsv aborts a never-resolving fetch within the 15s bound', async () => {
  const fn = loadMethod('requestCsv', csvSource);
  sandbox.fetch = (_url: string, opts: { signal?: AbortSignal }) => neverResolving(opts.signal);
  const call = fn.call({ auth: fakeAuth }, csvPath, 'name\nAlice\n');
  await waitFor(
    () => clock.pendingCount() > 0,
    'requestCsv to arm an abort timer — the CSV transport has no timeout bound',
  );
  clock.advanceAll();
  await assert.rejects(withWatchdog(call), /timed out/);
  assert.equal(clock.pendingCount(), 0, 'the abort timer must be cleared after the timeout');
});

test('requestCsv aborts a never-resolving response body within the 15s bound', async () => {
  const fn = loadMethod('requestCsv', csvSource);
  const fetchGate = deferred<unknown>();
  let fetchCalled = false;
  let fetchSignal: AbortSignal | undefined;
  let bodyReadStarted = false;
  sandbox.fetch = (_url: string, opts: { signal?: AbortSignal }) => {
    fetchCalled = true;
    fetchSignal = opts.signal;
    return fetchGate.promise;
  };
  const call = fn.call({ auth: fakeAuth }, csvPath, 'name\nAlice\n');
  await waitFor(() => fetchCalled, 'CSV fetch to be issued');
  fetchGate.resolve({
    ok: true,
    status: 200,
    json: () => {
      bodyReadStarted = true;
      return neverResolving(fetchSignal);
    },
  });
  await waitFor(() => bodyReadStarted, 'JSON body read to start');
  assert.equal(clock.pendingCount(), 1, 'the abort timer must stay armed while the response body is being read');
  clock.advanceAll();
  await assert.rejects(withWatchdog(call), /timed out/);
  assert.equal(clock.pendingCount(), 0, 'the abort timer must be cleared after the timeout');
});

test('blob and CSV transports arm the abort timer in flight and clear it on success', async () => {
  const blobFn = loadMethod('requestBlob', blobSource);
  const csvFn = loadMethod('requestCsv', csvSource);
  const fakeBlob = { size: 3, type: 'text/csv' };
  const fakeResponse = {
    ok: true,
    status: 200,
    headers: { get: (name: string) => (name === 'X-Export-Truncated' ? 'false' : '7') },
    blob: async () => fakeBlob,
    json: async () => ({ valid: true, row_count: 1 }),
  };
  // Hold the fetch in flight with a gate so the armed timer is observable:
  // an immediately-resolving stub would finish before the poll runs.
  const blobGate = deferred<unknown>();
  sandbox.fetch = () => blobGate.promise;
  const blobCall = blobFn.call({ auth: fakeAuth }, blobPath);
  await waitFor(() => clock.pendingCount() > 0, 'blob abort timer to arm');
  assert.equal(clock.pendingCount(), 1, 'the abort timer must be armed while the blob fetch is in flight');
  blobGate.resolve(fakeResponse);
  const blobResult = await withWatchdog(blobCall) as { blob: unknown; response: { headers: { get: (name: string) => string | null } } };
  assert.equal(blobResult.blob, fakeBlob);
  assert.equal(blobResult.response.headers.get('X-Export-Row-Count'), '7');
  assert.equal(clock.pendingCount(), 0, 'the abort timer must be cleared after a successful blob read');

  const csvGate = deferred<unknown>();
  sandbox.fetch = () => csvGate.promise;
  const csvCall = csvFn.call({ auth: fakeAuth }, csvPath, 'name\nAlice\n');
  await waitFor(() => clock.pendingCount() > 0, 'CSV abort timer to arm');
  assert.equal(clock.pendingCount(), 1, 'the abort timer must be armed while the CSV fetch is in flight');
  csvGate.resolve(fakeResponse);
  const csvResult = await withWatchdog(csvCall) as { valid: boolean };
  assert.equal(csvResult.valid, true);
  assert.equal(clock.pendingCount(), 0, 'the abort timer must be cleared after a successful CSV read');
});
