import { test } from '@playwright/test';

test.setTimeout(60000);

for (const width of [1440, 768, 375]) {
  test('capture layout at ' + width + 'px', async ({ page }) => {
    await page.setViewportSize({ width, height: 860 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'أساس متين لأعمالك' }).waitFor();
    await page.screenshot({
      path: 'test-results/layout-ar-' + width + '.png',
      fullPage: true,
    });
    await page.locator('html[data-hydrated="true"]').waitFor();
    await page.getByRole('combobox', { name: 'اللغة' }).selectOption('en');
    await page
      .getByRole('heading', {
        name: 'A dependable foundation for your business',
      })
      .waitFor();
    await page.screenshot({
      path: 'test-results/layout-en-' + width + '.png',
      fullPage: true,
    });
  });
}
