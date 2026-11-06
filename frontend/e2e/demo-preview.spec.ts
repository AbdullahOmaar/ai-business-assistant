import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const demoHtml = readFileSync(new URL('../../demo/index.html', import.meta.url), 'utf8');

test.beforeEach(async ({ page }) => {
  await page.setContent(demoHtml, { waitUntil: 'domcontentloaded' });
});

test('demo preview is a local Arabic RTL feature showcase', async ({ page }) => {
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByText('ديمو مستقل — ليس نظام إنتاج.')).toBeVisible();
  await expect(page.getByText(/لا يتم إرسالها إلى أي خادم أو تخزينها/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'الضرائب والسياسات المالية' })).toBeVisible();
  await expect(page.getByText(/T37: DRAFT \/ NOT APPROVED/)).toBeVisible();
});

test('workspace switching and customer search update the local fixture only', async ({ page }) => {
  await expect(page.locator('#workspaceName')).toHaveText('مخبز النور');
  await page.locator('#workspace').selectOption('b');
  await expect(page.locator('#workspaceName')).toHaveText('مكتبة المستقبل');
  await page.locator('#customerSearch').fill('يوسف');
  await expect(page.locator('#customers')).toContainText('يوسف سمير');
  await expect(page.locator('#customers')).not.toContainText('سارة أحمد');
});

test('invoice preview recalculates mock lines and reset restores the initial state', async ({ page }) => {
  await page.locator('#product').selectOption('45');
  await page.locator('#qty').fill('2');
  await page.getByRole('button', { name: 'إضافة بند' }).click();
  await expect(page.locator('#invoiceTotal')).toContainText('210 ج.م');

  await page.getByRole('button', { name: 'محاكاة استلام دفعة' }).click();
  await expect(page.locator('#paymentStatus')).toHaveText('مدفوعة تجريبيًا');
  await page.locator('#workspace').selectOption('b');
  await page.locator('#customerSearch').fill('يوسف');
  await page.getByRole('button', { name: 'إعادة ضبط الديمو' }).click();

  await expect(page.locator('#workspace')).toHaveValue('a');
  await expect(page.locator('#workspaceName')).toHaveText('مخبز النور');
  await expect(page.locator('#customerSearch')).toHaveValue('');
  await expect(page.locator('#invoiceTotal')).toContainText('120 ج.م');
  await expect(page.locator('#paymentStatus')).toHaveText('بانتظار الدفع');
});

test('print preview reports a blocked popup in the correct status area', async ({ page }) => {
  await page.evaluate(() => {
    window.open = () => null;
  });

  await page.getByRole('button', { name: 'فتح نافذة الطباعة' }).click();
  await expect(page.locator('#printStatus')).toContainText('المتصفح منع نافذة الطباعة');
  await expect(page.locator('#purchaseResult')).not.toContainText('المتصفح منع نافذة الطباعة');
});
