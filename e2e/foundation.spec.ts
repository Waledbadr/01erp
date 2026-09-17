import { expect, test } from '@playwright/test';

test.setTimeout(60000);

const routes = ['/', '/login', '/register', '/forgot-password', '/maintenance'];
const widths = [1440, 768, 375];

for (const width of widths) {
  test('Arabic and English layout at ' + width + 'px', async ({ page }) => {
    await page.setViewportSize({ width, height: 860 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(
      page.getByRole('heading', { name: 'أساس متين لأعمالك' }),
    ).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
    await page.locator('html[data-hydrated="true"]').waitFor();
    await page.getByRole('combobox', { name: 'اللغة' }).selectOption('en');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(
      page.getByRole('heading', {
        name: 'A dependable foundation for your business',
      }),
    ).toBeVisible();
    await expect(page.getByRole('status')).toContainText(
      /Database (connected|unavailable)/,
      { timeout: 15000 },
    );
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(
      page.getByRole('heading', {
        name: 'A dependable foundation for your business',
      }),
    ).toBeVisible();
  });
}

test('all foundation routes render and navigation works', async ({ page }) => {
  for (const route of routes) {
    await page.goto(route);
    await expect(page.locator('main h1')).toBeVisible();
    await expect(page.locator('main')).not.toContainText(
      'Internal Server Error',
    );
  }
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('link', { name: 'تسجيل الدخول' }).first().click();
  await expect(page).toHaveURL(/\/login$/);
});

test('health routes have honest status', async ({ request }) => {
  const live = await request.get('/api/health/live');
  expect(live.status()).toBe(200);
  expect((await live.json()).status).toBe('live');
  const ready = await request.get('/api/health/ready');
  expect([200, 503]).toContain(ready.status());
});

test('language switch works on every foundation page', async ({ page }) => {
  const pages = [
    ['/', 'A dependable foundation for your business'],
    ['/login', 'Sign in'],
    ['/register', 'Create account'],
    ['/forgot-password', 'Recover password'],
    ['/maintenance', 'Maintenance'],
    ['/missing-page', 'Page not found'],
  ] as const;
  for (const [route, heading] of pages) {
    await page.goto(route);
    await page.locator('html[data-hydrated="true"]').waitFor();
    await page.getByRole('combobox', { name: 'اللغة' }).selectOption('en');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.locator('main h1')).toHaveText(heading);
    await page.getByRole('combobox', { name: 'Language' }).selectOption('ar');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  }
});

test('mobile navigation remains usable after scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const signIn = page
    .locator('.bottom-nav')
    .getByRole('link', { name: 'تسجيل الدخول' });
  await expect(signIn).toBeVisible();
  await signIn.click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator('main h1')).toBeVisible();
});
