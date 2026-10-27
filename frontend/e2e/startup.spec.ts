import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // Keep the test independent of the live API and never mutate production data.
  await page.route('https://ai-business-assistant-api.vercel.app/version', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ version: 'test', commit: 'e2e-smoke' }),
    });
  });
});

test('boots into a usable sign-in or explicit setup screen, not a stuck splash', async ({ page }) => {
  const uncaughtErrors: string[] = [];
  page.on('pageerror', (error) => uncaughtErrors.push(error.message));

  await page.goto('/');

  await expect(page.locator('aba-root')).toContainText(
    /مرحبًا بعودتك|Welcome back|اربط مساحة عملك الآمنة|Connect your secure workspace/,
    { timeout: 20_000 },
  );
  await expect(page.getByText(/جارٍ تشغيل التطبيق|Starting the app/)).toHaveCount(0);
  expect(uncaughtErrors).toEqual([]);
});

test('switches the startup screen language and document direction both ways', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.language-toggle')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.shell')).toHaveAttribute('dir', 'rtl');

  await page.locator('.language-toggle').click();
  await expect(page.locator('.shell')).toHaveAttribute('dir', 'ltr');

  await page.locator('.language-toggle').click();
  await expect(page.locator('.shell')).toHaveAttribute('dir', 'rtl');
});
