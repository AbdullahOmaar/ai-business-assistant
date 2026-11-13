import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

type FakeRequest = { method: string; url: string; mode: string };
type WorkerEvent = {
  request?: FakeRequest;
  waitUntil?: (promise: Promise<unknown>) => void;
  respondWith?: (response: Promise<Response> | Response) => void;
};

const workerSource = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');
const origin = 'https://aiba.test';

const cacheNameMatch = workerSource.match(/const CACHE_NAME = '([^']+)'/);
assert.ok(cacheNameMatch, 'the worker must declare a versioned AIBA cache name');
const candidateCacheName = cacheNameMatch[1];

function createWorkerHarness(options: {
  failingAsset?: string;
  failingRoot?: boolean;
  existingCacheNames?: string[];
} = {}) {
  const listeners = new Map<string, (event: WorkerEvent) => void>();
  const cacheStores = new Map<string, Map<string, Response>>();
  const calls = {
    shellUrls: [] as string[],
    assetUrls: [] as string[],
    deletedCacheNames: [] as string[],
    skipWaitingCount: 0,
  };
  let runtimeConfig = '{"apiBaseUrl":"https://api.aiba.test","firebase":{"apiKey":"public-test-config"}}';
  let offline = false;

  const keyFor = (input: string | FakeRequest): string =>
    new URL(typeof input === 'string' ? input : input.url, origin).href;

  for (const name of options.existingCacheNames ?? []) {
    cacheStores.set(name, new Map([
      [keyFor('/'), new Response('previous app shell', { status: 200 })],
      [keyFor('/runtime-config.json'), new Response('previous runtime config', { status: 200 })],
    ]));
  }

  const cacheFor = (name: string) => {
    let entries = cacheStores.get(name);
    if (!entries) {
      entries = new Map<string, Response>();
      cacheStores.set(name, entries);
    }
    return {
      async addAll(urls: string[]): Promise<void> {
        calls.shellUrls.push(...urls);
        for (const url of urls) {
          const body = url === '/runtime-config.json' ? runtimeConfig : 'cached shell: ' + url;
          entries!.set(keyFor(url), new Response(body, { status: 200 }));
        }
      },
      async put(request: string | FakeRequest, response: Response): Promise<void> {
        entries!.set(keyFor(request), response.clone());
      },
      async add(url: string): Promise<void> {
        calls.assetUrls.push(url);
        if (options.failingAsset === url) throw new Error('asset cache failure');
        entries!.set(keyFor(url), new Response('cached asset: ' + url, { status: 200 }));
      },
    };
  };

  const cacheStorage = {
    async open(name: string) { return cacheFor(name); },
    async match(request: string | FakeRequest): Promise<Response | null> {
      const key = keyFor(request);
      for (const entries of cacheStores.values()) {
        const response = entries.get(key);
        if (response) return response.clone();
      }
      return null;
    },
    async keys(): Promise<string[]> { return [...cacheStores.keys()]; },
    async delete(name: string): Promise<boolean> {
      calls.deletedCacheNames.push(name);
      return cacheStores.delete(name);
    },
  };

  const fetcher = async (input: string | FakeRequest): Promise<Response> => {
    const url = typeof input === 'string' ? new URL(input, origin).href : input.url;
    if (url === origin + '/') {
      return new Response(
        options.failingRoot ? 'service unavailable' : '<script src="/main.js"></script><link rel="stylesheet" href="/styles.css">',
        { status: options.failingRoot ? 503 : 200 },
      );
    }
    if (url === origin + '/runtime-config.json') {
      if (offline) throw new Error('network unavailable');
      return new Response(runtimeConfig, { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response('asset', { status: 200 });
  };

  const workerSelf = {
    location: { origin },
    clients: { claim: async () => undefined },
    addEventListener(type: string, handler: (event: WorkerEvent) => void) { listeners.set(type, handler); },
    async skipWaiting() { calls.skipWaitingCount += 1; },
  };

  runInNewContext(workerSource, { self: workerSelf, caches: cacheStorage, fetch: fetcher, URL, Response, Promise });
  return {
    listeners,
    calls,
    hasCached(cacheName: string, url: string): boolean {
      return cacheStores.get(cacheName)?.has(keyFor(url)) ?? false;
    },
    cacheNames(): string[] { return [...cacheStores.keys()]; },
    setOffline(value: boolean) { offline = value; },
    setRuntimeConfig(value: string) { runtimeConfig = value; },
  };
}

async function runInstall(harness: ReturnType<typeof createWorkerHarness>): Promise<void> {
  const handler = harness.listeners.get('install');
  assert.ok(handler, 'the service worker must register an install handler');
  let installPromise: Promise<unknown> | undefined;
  handler({ waitUntil: (promise) => { installPromise = Promise.resolve(promise); } });
  assert.ok(installPromise, 'the install handler must extend its lifetime');
  await installPromise;
}

async function requestFromWorker(handler: (event: WorkerEvent) => void, request: FakeRequest): Promise<Response> {
  let responsePromise: Promise<Response> | undefined;
  handler({ request, respondWith: (response) => { responsePromise = Promise.resolve(response); } });
  assert.ok(responsePromise, 'the runtime-config route must be intercepted');
  return responsePromise;
}

test('pre-caches public runtime config and all app-shell assets before activating', async () => {
  const harness = createWorkerHarness();
  await runInstall(harness);
  assert.ok(harness.calls.shellUrls.includes('/runtime-config.json'));
  assert.ok(harness.calls.shellUrls.includes('/manifest.webmanifest'));
  assert.ok(harness.hasCached(candidateCacheName, '/runtime-config.json'));
  assert.ok(harness.hasCached(candidateCacheName, '/'));
  assert.ok(harness.calls.assetUrls.includes(origin + '/main.js'));
  assert.ok(harness.calls.assetUrls.includes(origin + '/styles.css'));
  assert.equal(harness.calls.skipWaitingCount, 1);
});

test('does not activate an incomplete app-shell cache when a required bundle fails', async () => {
  const harness = createWorkerHarness({ failingAsset: origin + '/main.js' });
  await assert.rejects(runInstall(harness), /asset cache failure/);
  assert.equal(harness.calls.skipWaitingCount, 0);
  assert.deepEqual(harness.calls.deletedCacheNames, [candidateCacheName]);
  assert.equal(harness.hasCached(candidateCacheName, '/'), false);
});


test('a failed update install preserves the previously active app-shell cache', async () => {
  const previousCacheName = 'aba-shell-v1.3.9-unknown';
  const harness = createWorkerHarness({
    failingAsset: origin + '/main.js',
    existingCacheNames: [previousCacheName],
  });

  await assert.rejects(runInstall(harness), /asset cache failure/);

  assert.deepEqual(harness.calls.deletedCacheNames, [candidateCacheName]);
  assert.equal(harness.hasCached(previousCacheName, '/'), true);
  assert.equal(harness.hasCached(previousCacheName, '/runtime-config.json'), true);
  assert.equal(harness.hasCached(candidateCacheName, '/'), false);
});

async function runActivate(harness: ReturnType<typeof createWorkerHarness>): Promise<void> {
  const handler = harness.listeners.get('activate');
  assert.ok(handler, 'the service worker must register an activate handler');
  let activationPromise: Promise<unknown> | undefined;
  handler({ waitUntil: (promise) => { activationPromise = Promise.resolve(promise); } });
  assert.ok(activationPromise, 'the activate handler must extend its lifetime');
  await activationPromise;
}

test('activation removes only obsolete AIBA caches and preserves unrelated origin caches', async () => {
  const previousCacheName = 'aba-shell-v1.3.9-unknown';
  const unrelatedCacheName = 'another-app-cache-v1';
  const harness = createWorkerHarness({
    existingCacheNames: [previousCacheName, unrelatedCacheName],
  });

  await runInstall(harness);
  await runActivate(harness);

  assert.deepEqual(harness.calls.deletedCacheNames, [previousCacheName]);
  assert.deepEqual(harness.cacheNames().sort(), [candidateCacheName, unrelatedCacheName].sort());
  assert.equal(harness.hasCached(unrelatedCacheName, '/'), true);
});

test('does not activate when the root app shell cannot be cached', async () => {
  const harness = createWorkerHarness({ failingRoot: true });
  await assert.rejects(runInstall(harness), /App shell cache request failed/);
  assert.equal(harness.calls.skipWaitingCount, 0);
  assert.equal(harness.calls.deletedCacheNames.length, 1);
});

test('refreshes runtime config online, falls back offline, and bypasses API requests', async () => {
  const harness = createWorkerHarness();
  await runInstall(harness);
  const fetchHandler = harness.listeners.get('fetch');
  assert.ok(fetchHandler);
  const request: FakeRequest = { method: 'GET', url: origin + '/runtime-config.json', mode: 'cors' };
  const updatedConfig = '{"apiBaseUrl":"https://api.aiba.test/v2"}';
  harness.setRuntimeConfig(updatedConfig);
  const onlineResponse = await requestFromWorker(fetchHandler, request);
  const onlineBody = await onlineResponse.text();
  assert.equal(onlineBody, updatedConfig);
  harness.setOffline(true);
  const offlineResponse = await requestFromWorker(fetchHandler, request);
  assert.equal(await offlineResponse.text(), onlineBody);
  let apiWasIntercepted = false;
  fetchHandler({ request: { method: 'GET', url: origin + '/api/dashboard', mode: 'cors' }, respondWith: () => { apiWasIntercepted = true; } });
  assert.equal(apiWasIntercepted, false, 'business API requests must bypass the app-shell cache');
});
