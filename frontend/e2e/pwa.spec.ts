import { expect, test, type Page } from '@playwright/test';

async function openPublicMobileAuthShell(page: Page, hasActiveController = false): Promise<void> {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript((controllerActive) => {
    const serviceWorker = new EventTarget() as EventTarget & {
      controller: object | null;
      register: () => Promise<unknown>;
    };
    Object.defineProperty(serviceWorker, 'controller', {
      configurable: true,
      value: controllerActive ? {} : null,
    });
    Object.defineProperty(serviceWorker, 'register', {
      configurable: true,
      value: async () => ({}),
    });
    Object.defineProperty(window, '__aibaServiceWorker', {
      configurable: true,
      value: serviceWorker,
    });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: serviceWorker,
    });
  }, hasActiveController);

  await page.route('**/runtime-config.json', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        apiBaseUrl: 'http://127.0.0.1:4200',
        firebase: {
          apiKey: 'test-api-key',
          authDomain: 'test-project.firebaseapp.com',
          projectId: 'test-project',
          appId: '1:123456789:web:test',
        },
      }),
    });
  });
  await page.route('**/version', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ version: 'test', commit: 'test', environment: 'test' }),
    });
  });

  await page.goto('/');
  await expect(page.getByRole('heading', {
    name: /مرحبًا بعودتك|Welcome back/,
  })).toBeVisible({ timeout: 20_000 });
}

async function dispatchControllerChange(page: Page): Promise<void> {
  await page.evaluate(() => {
    const serviceWorker = (window as any).__aibaServiceWorker as EventTarget;
    serviceWorker.dispatchEvent(new Event('controllerchange'));
  });
}

test('offers mobile PWA installation on the public sign-in screen before authentication', async ({ page }) => {
  await openPublicMobileAuthShell(page);
  const installCard = page.locator('.auth-mobile-install');
  await expect(installCard).toBeVisible();
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
  await installCard.getByRole('button', { name: /تثبيت|Install/ }).click();
  await expect(page.getByText(/لو لم تظهر نافذة التثبيت|If no install prompt appears/)).toBeVisible();
});

test('completes the pre-auth install prompt and hides the install entry after acceptance', async ({ page }) => {
  await openPublicMobileAuthShell(page);
  const dispatchResult = await page.evaluate(() => {
    const event = new Event('beforeinstallprompt', { cancelable: true });
    Object.defineProperties(event, {
      prompt: { value: async () => undefined },
      userChoice: { value: Promise.resolve({ outcome: 'accepted' }) },
    });
    return window.dispatchEvent(event);
  });
  expect(dispatchResult).toBe(false);

  await page.locator('.auth-mobile-install').getByRole('button', { name: /تثبيت|Install/ }).click();
  await expect(page.locator('.auth-mobile-install')).toHaveCount(0);
});

test('shows a deliberate refresh action when an installed app receives a new service worker', async ({ page }) => {
  await openPublicMobileAuthShell(page, true);
  await dispatchControllerChange(page);
  await expect(page.getByText(/تم تثبيت تحديث جديد للتطبيق|A new app version is ready/)).toBeVisible();
  await expect(page.getByRole('button', { name: /تحديث الآن|Refresh now/ })).toBeEnabled();
});

test('does not show an update notice when the first service worker takes control', async ({ page }) => {
  await openPublicMobileAuthShell(page, false);
  await dispatchControllerChange(page);
  await expect(page.locator('.app-update-notice')).toHaveCount(0);
});
