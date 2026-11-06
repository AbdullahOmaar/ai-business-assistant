import { expect, test } from '@playwright/test';

test('serves the standalone demo route with an explicit local-only boundary', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.goto('/demo/');

  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByText('ديمو مستقل — ليس نظام إنتاج.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'إعادة ضبط الديمو' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'الضرائب والسياسات المالية' })).toBeVisible();
  await expect(page.getByText(/T37: DRAFT \/ NOT APPROVED/)).toBeVisible();
  await expect(page.locator('#taxRate, #taxCalc')).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test('workspace, invoice and payment mock interactions reset to their initial state', async ({ page }) => {
  await page.goto('/demo/');

  await page.locator('#workspace').selectOption('b');
  await expect(page.locator('#workspaceName')).toHaveText('مكتبة المستقبل');

  await page.locator('#product').selectOption('45');
  await page.locator('#qty').fill('2');
  await page.getByRole('button', { name: 'إضافة بند' }).click();
  await expect(page.locator('#invoiceTotal')).toContainText('210 ج.م');

  await page.getByRole('button', { name: 'محاكاة استلام دفعة' }).click();
  await expect(page.locator('#paymentStatus')).toHaveText('مدفوعة تجريبيًا');

  await page.getByRole('button', { name: 'إعادة ضبط الديمو' }).click();
  await expect(page.locator('#workspaceName')).toHaveText('مخبز النور');
  await expect(page.locator('#invoiceTotal')).toContainText('120 ج.م');
  await expect(page.locator('#paymentStatus')).toHaveText('بانتظار الدفع');
  await expect(page.locator('#customerSearch')).toHaveValue('');
});

test('invoice print preview opens an isolated popup and reports its status', async ({ page }) => {
  await page.goto('/demo/');
  page.on('dialog', dialog => dialog.dismiss());

  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'فتح نافذة الطباعة' }).click();
  const popup = await popupPromise;

  await expect(popup.getByRole('heading', { name: 'فاتورة تجريبية' })).toBeVisible();
  await expect(popup.locator('body')).toContainText('ليست فاتورة ضريبية');
  await expect(page.locator('#printStatus')).toContainText('تم فتح نافذة طباعة الفاتورة التجريبية');
});

test('demo remains usable at a narrow mobile viewport without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/demo/');

  await expect(page.getByRole('button', { name: 'إعادة ضبط الديمو' })).toBeVisible();
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
});
