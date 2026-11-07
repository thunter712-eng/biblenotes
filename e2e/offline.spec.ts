import { expect, test } from '@playwright/test';
import { line, penStroke, type InkHandle } from './helpers.ts';

declare global {
  interface Window { __ink: InkHandle }
}

test('airplane mode: after one load, everything works with no network', async ({ page, context }) => {
  await page.goto('#/read/JHN/3');
  await expect(page.locator('.reader [data-v="16"]')).toBeVisible();
  const supported = await page.evaluate(() => 'serviceWorker' in navigator);
  test.skip(!supported, 'This browser build has no service workers. The Chromium project covers this test.');

  // Wait for the precache to finish and the worker to take control.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, undefined, { timeout: 20_000 });

  await context.setOffline(true);
  await page.reload();

  // A chapter from a book that was never opened, in both translations.
  await page.goto('#/read/OBA/1');
  await expect(page.locator('.reader [data-v="1"]')).toContainText('Obadiah');
  await page.getByLabel('Translation').selectOption('asv');
  await expect(page.locator('.reader [data-v="1"]')).toContainText('vision of Obadiah');

  // Fonts come from the precache.
  const fonts = await page.evaluate(async () => {
    await document.fonts.load("20px 'EB Garamond'");
    await document.fonts.load("20px 'Caveat'");
    return [document.fonts.check("20px 'EB Garamond'"), document.fonts.check("20px 'Caveat'")];
  });
  expect(fonts).toEqual([true, true]);

  // Search covers the whole Bible.
  await page.goto('#/search?q=%22Jehovah%20is%20my%20shepherd%22');
  await expect(page.getByTestId('search-count')).toContainText('verse', { timeout: 20_000 });

  // Writing and saving still work.
  await page.goto('#/read/JHN/3');
  await page.getByRole('button', { name: 'Open notebook page' }).click();
  await page.getByRole('button', { name: /^New page for/ }).click();
  await page.waitForFunction(() => !!window.__ink);
  await penStroke(page, line(60, 120, 400, 120, 20));
  await page.waitForTimeout(600);
  await page.reload();
  await page.getByRole('button', { name: 'Open notebook page' }).click();
  await page.waitForFunction(() => !!window.__ink && window.__ink.document.size === 1);
});

test('the manifest and icons are installable', async ({ request }) => {
  const res = await request.get('manifest.webmanifest');
  expect(res.ok()).toBe(true);
  const m = await res.json();
  expect(m.display).toBe('standalone');
  expect(m.start_url).toBe('./');
  for (const icon of m.icons) {
    const i = await request.get(icon.src);
    expect(i.ok(), icon.src).toBe(true);
    expect(i.headers()['content-type']).toContain('image/png');
  }
  expect(m.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true);
  expect((await request.get('icons/apple-touch-icon.png')).ok()).toBe(true);
});

test('no copyrighted translations ship', async ({ request }) => {
  const res = await request.get('bible/index.json');
  const { translations } = await res.json();
  expect(translations.map((t: { abbr: string }) => t.abbr).sort()).toEqual(['ASV', 'WEB']);
  for (const t of translations) expect(t.license).toBe('Public Domain');
});
