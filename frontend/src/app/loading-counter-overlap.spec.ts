// Loading-counter overlap regression spec (committed, durable).
//
// Drives the REAL AppComponent class and proves the loader can never stick
// after a save: success, definite-no-write error, uncertain/outcome error,
// a superseded save, and a sign-out / workspace reset mid-flight.
//
// Why the runtime transpile below exists: the repo's node runner
// (`node --experimental-strip-types --test`) cannot import app.component.ts
// directly — the legacy @Component/@Injectable decorators are not erasable
// syntax. So this spec transpiles the real AppComponent import closure at
// runtime (repo's own `typescript`, transpileModule, ES2022/ESNext,
// experimentalDecorators) into a fresh temp dir and dynamic-imports it.
// No generated files are committed; the transpiled code is byte-identical
// to a standalone transpile of the same sources (validated against the
// 56-file probe closure at 52f501e5). Mocked API only: no network, no
// production invoices, no remote writes.
//
// Run with the repo's normal flag, from frontend/:
//   node --experimental-strip-types --test src/app/loading-counter-overlap.spec.ts
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as ts from 'typescript';
// Load the JIT compiler FIRST: @angular/common's partially-compiled
// injectables (PlatformLocation) need the compiler facade at import time.
import '@angular/compiler';
import { Injector, runInInjectionContext } from '@angular/core';
import type { InvoiceDraftPayload } from './invoice-draft.ts';

// ---- browser globals the AppComponent constructor touches ----
// Node 24 ships a getter-only global navigator; define the stubs instead.
Object.defineProperty(globalThis, 'window', {
  value: {
    matchMedia: () => ({ matches: false, media: '(display-mode: standalone)', addEventListener: () => {}, removeEventListener: () => {} }),
    addEventListener: () => {},
    removeEventListener: () => {},
  },
  configurable: true,
});
Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'node-probe' }, configurable: true });
Object.defineProperty(globalThis, 'document', {
  value: { documentElement: { style: { setProperty: () => {} }, setAttribute: () => {} } },
  configurable: true,
});

// ---- runtime transpile of the real AppComponent closure ----
// Top-level await: the tests below register only after the real classes are
// imported, so `node --test` waits for this module evaluation to finish.
const SRC_DIR = dirname(fileURLToPath(import.meta.url));

function resolveRelative(fromFile: string, spec: string): string | null {
  // Decide from the specifier suffix, not path.extname: file names contain
  // dots (e.g. `localization.service`), so extname would misread them.
  const base = resolve(dirname(fromFile), spec);
  const candidates: string[] = [];
  if (spec.endsWith('.ts')) candidates.push(base);
  else if (spec.endsWith('.js')) candidates.push(base.replace(/\.js$/, '.ts'));
  else candidates.push(`${base}.ts`, join(base, 'index.ts'));
  for (const c of candidates) if (c.endsWith('.ts') && existsSync(c)) return c;
  return null;
}

const IMPORT_RE = /(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s+)?['"](\.[^'"]+)['"]/g;
const DYNAMIC_RE = /import\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g;

function rewriteSpecifiers(code: string): string {
  // Rewrite relative specifiers in import/export/dynamic-import statements
  // only (.ts / .js / extensionless -> .mjs). Bare specifiers untouched.
  return code.replace(
    /((?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s+)?['"]|import\s*\(\s*['"])(\.[^'"]+)(['"])/g,
    (_m, pre, spec, post) => {
      const out = spec.endsWith('.ts') ? spec.replace(/\.ts$/, '.mjs')
        : spec.endsWith('.js') ? spec.replace(/\.js$/, '.mjs')
        : `${spec}.mjs`;
      return pre + out + post;
    },
  );
}

const { AppComponent, AbaLoadingStateService, ApiRequestError } = await (async () => {
  const entry = join(SRC_DIR, 'app.component.ts');
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const code = readFileSync(file, 'utf8');
    for (const re of [IMPORT_RE, DYNAMIC_RE]) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(code))) {
        const resolved = resolveRelative(file, m[1]);
        if (resolved && !seen.has(resolved)) queue.push(resolved);
      }
    }
  }
  const outDir = mkdtempSync(join(tmpdir(), 'aiba-loading-overlap-'));
  // The transpiled files live in /tmp, so bare imports (@angular/*, rxjs,
  // ...) would not resolve there. Link the frontend node_modules into the
  // temp dir so Node resolves them exactly as it does for the real sources.
  // Nothing is written into the repo tree.
  symlinkSync(resolve(SRC_DIR, '..', '..', 'node_modules'), join(outDir, 'node_modules'), 'dir');
  for (const file of seen) {
    const code = readFileSync(file, 'utf8');
    const out = ts.transpileModule(rewriteSpecifiers(code), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, experimentalDecorators: true },
      fileName: file,
    });
    const rel = file.slice(SRC_DIR.length + 1).replace(/\.ts$/, '.mjs');
    const dest = join(outDir, rel);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, out.outputText);
  }
  const appMod: any = await import(pathToFileURL(join(outDir, 'app.component.mjs')).href);
  const loadingMod: any = await import(pathToFileURL(join(outDir, 'loading-state.service.mjs')).href);
  const apiMod: any = await import(pathToFileURL(join(outDir, 'api.service.mjs')).href);
  return {
    AppComponent: appMod.AppComponent,
    AbaLoadingStateService: loadingMod.AbaLoadingStateService,
    ApiRequestError: apiMod.ApiRequestError,
  };
})();

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const PAYLOAD: InvoiceDraftPayload = {
  invoice_number: 'INV-1',
  currency_code: 'EGP',
  customer_id: 'cust-1',
  lines: [],
  notes: '',
};

const SAVED_INVOICE = {
  currency_code: 'EGP',
  subtotal: '100',
  discount_total: '0',
  tax_total: '14',
  total: '114',
};

function createComponent(apiOverrides: Record<string, unknown> = {}) {
  const loadingState = new AbaLoadingStateService();
  const calls: Record<string, number> = {};
  const count = (name: string) => { calls[name] = (calls[name] ?? 0) + 1; };
  // Merge defaults with per-test overrides, then wrap every function so the
  // call counts stay correct even when a test overrides a method.
  const rawApi: any = {
    createInvoice: async () => { throw new Error('unexpected createInvoice call'); },
    updateDraftInvoice: async () => { throw new Error('unexpected updateDraftInvoice call'); },
    invoices: async () => [],
    dashboard: async () => ({}),
    invoiceDetail: async () => { throw new Error('unexpected invoiceDetail call'); },
    listBusinesses: async () => [],
    createDemoSession: async () => { throw new Error('unexpected'); },
    ...apiOverrides,
  };
  const api: any = {};
  for (const [key, value] of Object.entries(rawApi)) {
    api[key] = typeof value === 'function'
      ? (...args: any[]) => { count(key); return (value as any)(...args); }
      : value;
  }
  const auth: any = {
    signOut: async () => { count('signOut'); },
    signIn: async () => { throw new Error('unexpected signIn'); },
    signUp: async () => { throw new Error('unexpected signUp'); },
  };
  const localization: any = {
    currentLanguage: 'ar',
    locale: 'ar-EG',
    translate: (key: string) => key,
    syncDocumentLanguage: () => {},
    setLanguage: async (language: string) => language,
  };
  const injector = Injector.create({ providers: [{ provide: AbaLoadingStateService, useValue: loadingState }] });
  const comp = runInInjectionContext(injector, () => new AppComponent(auth, api, localization));
  const anyComp = comp as any;
  anyComp.business = { id: 'biz-1', name: 'Test Biz', currency_code: 'EGP', locale: 'ar-EG', timezone: 'Africa/Cairo', role: 'owner' };
  anyComp.signedIn = true;
  anyComp.currentAuthUid = 'uid-1';
  anyComp.invoiceDiscountRate = '0';
  anyComp.invoiceTaxRate = '0';
  return { comp, anyComp, api, auth, loadingState, calls };
}

function assertLoaderSettled(
  ctx: ReturnType<typeof createComponent>,
  label: string,
) {
  assert.equal(ctx.loadingState.count(), 0, `${label}: loadingState.count should be 0, got ${ctx.loadingState.count()}`);
  assert.equal(ctx.comp.loading, false, `${label}: comp.loading should be false`);
}

test('loading counter: real AppComponent constructs in the node runner', () => {
  const ctx = createComponent();
  assert.equal(ctx.comp.loading, false);
  assert.equal(ctx.loadingState.count(), 0);
});

test('1. saveInvoiceDraft success releases the count', async () => {
  const ctx = createComponent({ createInvoice: async () => SAVED_INVOICE });
  await ctx.comp.saveInvoiceDraft(PAYLOAD);
  assertLoaderSettled(ctx, 'success');
  assert.equal(ctx.anyComp.invoiceDraftSaving, false);
  assert.equal(ctx.calls['createInvoice'], 1);
});

test('2. saveInvoiceDraft definite-no-write error (400) releases the count', async () => {
  const ctx = createComponent({
    createInvoice: async () => { throw new ApiRequestError('bad request', 400); },
  });
  await ctx.comp.saveInvoiceDraft(PAYLOAD);
  assertLoaderSettled(ctx, 'definite-no-write 400');
  assert.equal(ctx.anyComp.invoiceDraftSaving, false);
  assert.equal(ctx.anyComp.invoiceDraftUncertain, false, 'definite-no-write must not mark the draft uncertain');
});

test('3a. saveInvoiceDraft uncertain error (500) releases the count', async () => {
  const ctx = createComponent({
    createInvoice: async () => { throw new ApiRequestError('server error', 500); },
  });
  await ctx.comp.saveInvoiceDraft(PAYLOAD);
  assertLoaderSettled(ctx, 'uncertain 500');
  assert.equal(ctx.anyComp.invoiceDraftSaving, false);
  assert.equal(ctx.anyComp.invoiceDraftUncertain, true, 'uncertain outcome must mark the draft uncertain');
});

test('3b. saveInvoiceDraft network error (plain Error) releases the count', async () => {
  const ctx = createComponent({
    createInvoice: async () => { throw new Error('network timeout'); },
  });
  await ctx.comp.saveInvoiceDraft(PAYLOAD);
  assertLoaderSettled(ctx, 'network error');
  assert.equal(ctx.anyComp.invoiceDraftSaving, false);
  assert.equal(ctx.anyComp.invoiceDraftUncertain, true, 'network error must mark the draft uncertain');
});

test('4a. second saveInvoiceDraft is blocked while the first is in flight', async () => {
  const gate = deferred<any>();
  const ctx = createComponent({ createInvoice: () => gate.promise });
  const first = ctx.comp.saveInvoiceDraft(PAYLOAD);
  // invoiceDraftSaving is set synchronously before the first await; the
  // second call must return without touching the API.
  assert.equal(ctx.anyComp.invoiceDraftSaving, true);
  assert.equal(ctx.comp.loading, true);
  assert.equal(ctx.loadingState.count(), 1);
  await ctx.comp.saveInvoiceDraft(PAYLOAD);
  assert.equal(ctx.calls['createInvoice'], 1, 'second save must not call the API');
  gate.resolve(SAVED_INVOICE);
  await first;
  assertLoaderSettled(ctx, 'second-save blocked');
  assert.equal(ctx.anyComp.invoiceDraftSaving, false);
});

test('4b. refreshInvoiceDraftStatus returns early while a save is in flight', async () => {
  const gate = deferred<any>();
  const ctx = createComponent({ createInvoice: () => gate.promise });
  const save = ctx.comp.saveInvoiceDraft(PAYLOAD);
  assert.equal(ctx.comp.loading, true);
  // Refresh must early-return on `this.loading` and must not begin() a new
  // generation, so the save's isCurrent() stays true.
  await ctx.comp.refreshInvoiceDraftStatus();
  assert.equal(ctx.calls['invoices'] ?? 0, 0, 'refresh must not call the API while loading');
  assert.equal(ctx.loadingState.count(), 1, 'save still holds its one count');
  gate.resolve(SAVED_INVOICE);
  await save;
  assertLoaderSettled(ctx, 'refresh early-return');
});

test('4c. ARTIFICIAL: guard invalidated mid-save WITHOUT reset leaks the count', async () => {
  // No real caller does this: the only invalidate() lives in clearWorkspaceData(),
  // which resets first. This test proves the mechanism — the guarded finally in
  // saveInvoiceDraft releases NOTHING once isCurrent() is false, so the safety
  // of the release rests entirely on reset() preceding every invalidate().
  const gate = deferred<any>();
  const ctx = createComponent({ createInvoice: () => gate.promise });
  const save = ctx.comp.saveInvoiceDraft(PAYLOAD);
  assert.equal(ctx.loadingState.count(), 1);
  (ctx.anyComp as any).invoiceSaveGuard.invalidate();
  gate.resolve(SAVED_INVOICE);
  await save;
  assert.equal(ctx.loadingState.count(), 1, 'LEAK: count stays 1 when the guard was invalidated without reset');
  assert.equal(ctx.comp.loading, true, 'LEAK: loader stays on');
  assert.equal(ctx.anyComp.invoiceDraftSaving, true, 'LEAK: invoiceDraftSaving sticks true, blocking later saves');
});

test('4d. refresh release is unguarded: it still releases after mid-flight invalidation', async () => {
  const gate = deferred<any>();
  const ctx = createComponent({ invoices: () => gate.promise });
  ctx.anyComp.pendingInvoiceDraftOutcome = {
    businessId: 'biz-1',
    invoiceNumber: 'INV-1',
    customerId: 'cust-1',
    discountRate: '0',
    taxRate: '0',
    editingInvoiceId: null,
  };
  const refresh = ctx.comp.refreshInvoiceDraftStatus();
  assert.equal(ctx.loadingState.count(), 1);
  (ctx.anyComp as any).invoiceSaveGuard.invalidate();
  gate.resolve([]);
  await refresh;
  assertLoaderSettled(ctx, 'refresh unguarded release');
});

test('5a. clearWorkspaceData mid-save resets the count synchronously', async () => {
  const gate = deferred<any>();
  const ctx = createComponent({ createInvoice: () => gate.promise });
  const save = ctx.comp.saveInvoiceDraft(PAYLOAD);
  assert.equal(ctx.loadingState.count(), 1);
  (ctx.anyComp as any).clearWorkspaceData();
  // reset() runs synchronously inside clearWorkspaceData, before the save resolves.
  assertLoaderSettled(ctx, 'clearWorkspaceData mid-save (immediate)');
  gate.resolve(SAVED_INVOICE);
  await save;
  // The save's guarded finally sees isCurrent() === false and skips its release,
  // but the count was already reset, so the loader stays settled.
  assertLoaderSettled(ctx, 'clearWorkspaceData mid-save (after save resolves)');
  assert.equal(ctx.anyComp.invoiceDraftSaving, false);
});

test('5b. logout (sign-out reset) mid-save settles the loader', async () => {
  const gate = deferred<any>();
  const ctx = createComponent({ createInvoice: () => gate.promise });
  const save = ctx.comp.saveInvoiceDraft(PAYLOAD);
  assert.equal(ctx.loadingState.count(), 1);
  await ctx.comp.logout();
  // logout claims a count, then resetSignedOutState -> clearWorkspaceData resets
  // all counts; the finally end() is clamped at zero.
  assertLoaderSettled(ctx, 'logout mid-save (immediate)');
  gate.resolve(SAVED_INVOICE);
  await save;
  assertLoaderSettled(ctx, 'logout mid-save (after save resolves)');
});
