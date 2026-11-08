import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // Exercise the safe setup screen without Firebase credentials or live API access.
  // This keeps the smoke suite deterministic and guarantees no production data is touched.
  await page.route('**/runtime-config.json', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        apiBaseUrl: '',
        firebase: { apiKey: '', authDomain: '', projectId: '', appId: '' },
      }),
    });
  });
});

test('boots into the explicit setup screen instead of a stuck splash', async ({ page }) => {
  const uncaughtErrors: string[] = [];
  page.on('pageerror', (error) => uncaughtErrors.push(error.message));

  await page.goto('/');

  await expect(page.getByRole('heading', { name: /اربط مساحة عملك الآمنة|Connect your secure workspace/ })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/جارٍ تشغيل التطبيق|Starting the app/)).toHaveCount(0);
  // Missing Firebase settings must fail closed to the setup screen, not show a usable sign-in form.
  await expect(page.locator('input[type="email"], input[type="password"]')).toHaveCount(0);
  expect(uncaughtErrors).toEqual([]);
});

test('switches startup language and layout direction both ways', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.language-toggle')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.shell')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

  await page.locator('.language-toggle').click();
  await expect(page.locator('.shell')).toHaveAttribute('dir', 'ltr');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');

  await page.locator('.language-toggle').click();
  await expect(page.locator('.shell')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
});

test('keeps the safe setup screen usable at a narrow mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');

  await expect(
    page.getByRole('heading', {
      name: /اربط مساحة عملك الآمنة|Connect your secure workspace/,
    }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.language-toggle')).toBeVisible();

  const assertNoHorizontalOverflow = async () => {
    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
  };

  await assertNoHorizontalOverflow();

  // Exercise the narrow layout in both writing directions, not only the default Arabic view.
  await page.locator('.language-toggle').click();
  await expect(page.locator('.shell')).toHaveAttribute('dir', 'ltr');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await assertNoHorizontalOverflow();
});

test('shows a recoverable startup error when runtime configuration cannot be loaded', async ({ page }) => {
  let configRequests = 0;
  await page.route('**/runtime-config.json', async (route) => {
    configRequests += 1;
    if (configRequests === 1) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'temporarily unavailable' }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        apiBaseUrl: '',
        firebase: { apiKey: '', authDomain: '', projectId: '', appId: '' },
      }),
    });
  });

  await page.goto('/');
  await expect(page.getByRole('heading', {
    name: /تعذر تحميل إعدادات التطبيق|Unable to load app configuration/,
  })).toBeVisible({ timeout: 20_000 });
  await page.locator('.language-toggle').click();
  await expect(page.locator('.shell')).toHaveAttribute('dir', 'ltr');
  await page.locator('.language-toggle').click();
  await expect(page.locator('.shell')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('alert')).toContainText(/Runtime configuration could not be loaded/);
  await expect(page.locator('input[type="email"], input[type="password"]')).toHaveCount(0);

  await page.getByRole('button', { name: /إعادة المحاولة|Retry startup/ }).click();
  await expect(page.getByRole('heading', {
    name: /اربط مساحة عملك الآمنة|Connect your secure workspace/,
  })).toBeVisible({ timeout: 20_000 });
  expect(configRequests).toBe(2);
});

test('fails closed when runtime configuration returns an invalid JSON shape', async ({ page }) => {
  let configRequests = 0;
  await page.route('**/runtime-config.json', async (route) => {
    configRequests += 1;
    if (configRequests === 1) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(null),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        apiBaseUrl: '',
        firebase: { apiKey: '', authDomain: '', projectId: '', appId: '' },
      }),
    });
  });

  await page.goto('/');
  await expect(page.getByRole('heading', {
    name: /تعذر تحميل إعدادات التطبيق|Unable to load app configuration/,
  })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('alert')).toContainText('Runtime configuration is invalid.');
  await expect(page.locator('input[type="email"], input[type="password"]')).toHaveCount(0);

  await page.getByRole('button', { name: /إعادة المحاولة|Retry startup/ }).click();
  await expect(page.getByRole('heading', {
    name: /اربط مساحة عملك الآمنة|Connect your secure workspace/,
  })).toBeVisible({ timeout: 20_000 });
  expect(configRequests).toBe(2);
});

for (const [label, invalidConfig] of [
  ['non-string API base URL', { apiBaseUrl: 42, firebase: {} }],
  ['non-object Firebase settings', { apiBaseUrl: '', firebase: [] }],
  ['non-string Firebase field', { apiBaseUrl: '', firebase: { apiKey: 42 } }],
] as const) {
  test(`fails closed for malformed runtime config: ${label}`, async ({ page }) => {
    let configRequests = 0;
    await page.route('**/runtime-config.json', async (route) => {
      configRequests += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(configRequests === 1 ? invalidConfig : {
          apiBaseUrl: '',
          firebase: { apiKey: '', authDomain: '', projectId: '', appId: '' },
        }),
      });
    });

    await page.goto('/');
    await expect(page.getByRole('heading', {
      name: /تعذر تحميل إعدادات التطبيق|Unable to load app configuration/,
    })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('alert')).toContainText('Runtime configuration is invalid.');
    await expect(page.locator('input[type="email"], input[type="password"]')).toHaveCount(0);

    await page.getByRole('button', { name: /إعادة المحاولة|Retry startup/ }).click();
    await expect(page.getByRole('heading', {
      name: /اربط مساحة عملك الآمنة|Connect your secure workspace/,
    })).toBeVisible({ timeout: 20_000 });
    expect(configRequests).toBe(2);
  });
}

test('shows a recoverable startup error when runtime configuration is not valid JSON', async ({ page }) => {
  let configRequests = 0;
  await page.route('**/runtime-config.json', async (route) => {
    configRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: configRequests === 1 ? '{"apiBaseUrl":' : JSON.stringify({
        apiBaseUrl: '',
        firebase: { apiKey: '', authDomain: '', projectId: '', appId: '' },
      }),
    });
  });

  await page.goto('/');
  await expect(page.getByRole('heading', {
    name: /تعذر تحميل إعدادات التطبيق|Unable to load app configuration/,
  })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('alert')).toContainText('Runtime configuration is invalid.');
  await expect(page.locator('input[type="email"], input[type="password"]')).toHaveCount(0);

  await page.getByRole('button', { name: /إعادة المحاولة|Retry startup/ }).click();
  await expect(page.getByRole('heading', {
    name: /اربط مساحة عملك الآمنة|Connect your secure workspace/,
  })).toBeVisible({ timeout: 20_000 });
  expect(configRequests).toBe(2);
});

for (const field of ['apiKey', 'authDomain', 'projectId', 'appId'] as const) {
  test('fails closed when Firebase ' + field + ' contains only whitespace', async ({ page }) => {
    const firebase = { apiKey: 'valid-key', authDomain: 'example.firebaseapp.com', projectId: 'example-project', appId: '1:123:web:abc' };
    firebase[field] = '   ';
    await page.route('**/runtime-config.json', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ apiBaseUrl: 'https://api.example.test', firebase }) });
    });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /اربط مساحة عملك الآمنة|Connect your secure workspace/ })).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('input[type="email"], input[type="password"]')).toHaveCount(0);
  });
}

test('fails closed when API base URL contains only whitespace', async ({ page }) => {
  await page.route('**/runtime-config.json', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ apiBaseUrl: '   ', firebase: { apiKey: 'valid-key', authDomain: 'example.firebaseapp.com', projectId: 'example-project', appId: '1:123:web:abc' } }) });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /اربط مساحة عملك الآمنة|Connect your secure workspace/ })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('input[type="email"], input[type="password"]')).toHaveCount(0);
});
