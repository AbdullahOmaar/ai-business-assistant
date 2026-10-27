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
