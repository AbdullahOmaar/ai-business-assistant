import assert from 'node:assert/strict';
import test from 'node:test';
import { AppComponent } from './app.component.ts';
import type { AuthService } from './auth.service.ts';
import type { ApiService, AuditEvent, Business, CustomerStatement } from './api.service.ts';

function withBrowserGlobals<T>(run: () => T): T {
  const keys = ['window', 'navigator', 'localStorage'] as const;
  const previous = new Map<string, PropertyDescriptor | undefined>(
    keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)])
  );

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      matchMedia: () => ({ matches: false, addEventListener: () => {} }),
      addEventListener: () => {},
    },
  });
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { standalone: false },
  });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: () => null, setItem: () => {} },
  });

  try {
    return run();
  } finally {
    for (const key of keys) {
      const descriptor = previous.get(key);
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeComponent(api: Record<string, unknown>): {
  component: AppComponent;
  internals: { currentAuthUid: string | null; clearWorkspaceData(): void };
} {
  const component = new AppComponent({} as AuthService, api as unknown as ApiService);
  const internals = component as unknown as {
    currentAuthUid: string | null;
    clearWorkspaceData(): void;
  };
  return { component, internals };
}

const ownerBusiness = { id: 'business-a', role: 'owner', currency_code: 'EGP' } as unknown as Business;

test('drops a delayed Audit response after the UID changes inside the same business', async () => {
  await withBrowserGlobals(async () => {
    const pending = deferred<{ items: AuditEvent[]; total: number; offset: number }>();
    const { component, internals } = makeComponent({
      auditEvents: () => pending.promise,
    });
    component.business = ownerBusiness;
    component.signedIn = true;
    internals.currentAuthUid = 'uid-a';

    const request = component.loadAuditEvents();
    internals.currentAuthUid = 'uid-b';
    internals.clearWorkspaceData();
    pending.resolve({ items: [{} as AuditEvent], total: 1, offset: 0 });
    await request;

    assert.deepEqual(component.auditEvents, []);
    assert.equal(component.auditTotal, 0);
    assert.equal(component.auditError, '');
    assert.equal(component.auditLoading, false);
  });
});

test('drops a delayed Audit response after OWNER access is revoked in the same business', async () => {
  await withBrowserGlobals(async () => {
    const pending = deferred<{ items: AuditEvent[]; total: number; offset: number }>();
    const { component, internals } = makeComponent({
      auditEvents: () => pending.promise,
    });
    component.business = ownerBusiness;
    component.signedIn = true;
    internals.currentAuthUid = 'uid-a';

    const request = component.loadAuditEvents();
    component.business = { ...ownerBusiness, role: 'staff' } as Business;
    internals.clearWorkspaceData();
    pending.resolve({ items: [{} as AuditEvent], total: 1, offset: 0 });
    await request;

    assert.deepEqual(component.auditEvents, []);
    assert.equal(component.auditTotal, 0);
    assert.equal(component.auditLoading, false);
  });
});

test('drops a delayed Customer Statement response after customer selection changes', async () => {
  await withBrowserGlobals(async () => {
    const pending = deferred<CustomerStatement>();
    const { component, internals } = makeComponent({
      customerStatement: () => pending.promise,
    });
    component.business = ownerBusiness;
    component.signedIn = true;
    component.statementCustomerId = 'customer-a';
    internals.currentAuthUid = 'uid-a';

    const request = component.loadCustomerStatementPage(0);
    component.statementCustomerId = 'customer-b';
    internals.clearWorkspaceData();
    pending.resolve({} as CustomerStatement);
    await request;

    assert.equal(component.customerStatement, null);
    assert.equal(component.statementError, '');
    assert.equal(component.statementLoading, false);
  });
});

test('invalidates an old top-level workspace load without clearing the new identity loading state', async () => {
  await withBrowserGlobals(async () => {
    const dashboard = deferred<never>();
    const customers = deferred<never>();
    const products = deferred<never>();
    const invoices = deferred<never>();
    const payments = deferred<never>();
    const expenses = deferred<never>();
    const { component, internals } = makeComponent({
      dashboard: () => dashboard.promise,
      customers: () => customers.promise,
      products: () => products.promise,
      invoices: () => invoices.promise,
      payments: () => payments.promise,
      expenses: () => expenses.promise,
    });
    component.business = ownerBusiness;
    component.signedIn = true;

    const request = component.loadWorkspaceData();
    component.business = null;
    internals.clearWorkspaceData();
    component.loading = true;

    dashboard.resolve({} as never);
    customers.resolve([] as never);
    products.resolve([] as never);
    invoices.resolve([] as never);
    payments.resolve([] as never);
    expenses.resolve([] as never);
    await request;

    assert.equal(component.dashboard, null);
    assert.deepEqual(component.customers, []);
    assert.equal(component.loading, true);
  });
});
