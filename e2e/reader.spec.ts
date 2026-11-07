import { expect, test, type Page } from '@playwright/test';

const verse = (page: Page, n: number) => page.locator(`.reader [data-v="${n}"]`).first();

test.beforeEach(async ({ page }) => {
  await page.goto('#/read/JHN/3');
  await expect(verse(page, 16)).toContainText('For God so loved the world');
});

test('selects a range, highlights it, and adds a typed note that survives reload', async ({ page }) => {
  await verse(page, 16).click();
  await verse(page, 17).click();
  const bar = page.getByTestId('action-bar');
  await expect(bar).toContainText('John 3:16-17');

  await bar.getByRole('button', { name: 'Highlight' }).click();
  await bar.getByRole('button', { name: 'yellow highlight' }).click();
  await expect(verse(page, 16).locator('.hl-c-yellow')).toBeVisible();
  await expect(verse(page, 17).locator('.hl-c-yellow')).toBeVisible();

  await verse(page, 16).click();
  await verse(page, 17).click();
  await bar.getByRole('button', { name: 'Typed note' }).click();
  const editor = page.locator('.inline-note .rich-text');
  await editor.click();
  await page.keyboard.type('God gave his Son');
  await page.waitForTimeout(600);

  await page.reload();
  await expect(verse(page, 16).locator('.hl-c-yellow')).toBeVisible();
  await expect(page.locator('.inline-note .rich-text')).toContainText('God gave his Son');
  await expect(page.locator('.inline-note')).toContainText('John 3:16-17');
});

test('collapses a note, and the verse marker reopens it', async ({ page }) => {
  await verse(page, 3).click();
  await page.getByRole('button', { name: 'Typed note' }).click();
  await expect(page.locator('.inline-note')).toBeVisible();
  await page.getByRole('button', { name: 'Collapse note' }).click();
  await expect(page.locator('.inline-note')).toHaveCount(0);
  await page.getByRole('button', { name: 'Show notes on verse 3' }).click();
  await expect(page.locator('.inline-note')).toBeVisible();
});

test('a highlight survives a translation switch', async ({ page }) => {
  await verse(page, 16).click();
  await page.getByRole('button', { name: 'Highlight' }).click();
  await page.getByRole('button', { name: 'green highlight' }).click();
  await page.getByLabel('Translation').selectOption('asv');
  await expect(verse(page, 16)).toContainText('only begotten');
  await expect(verse(page, 16).locator('.hl-c-green')).toBeVisible();
});

test('highlights a word range', async ({ page }) => {
  await verse(page, 16).click();
  await page.getByRole('button', { name: 'Words' }).click();
  const from = await page.locator('.is-wordmode [data-w="1"]').boundingBox();
  const to = await page.locator('.is-wordmode [data-w="3"]').boundingBox();
  await page.mouse.move(from!.x + 3, from!.y + 5);
  await page.mouse.down();
  await page.mouse.move(to!.x + 3, to!.y + 5, { steps: 4 });
  await page.mouse.up();
  await expect(page.locator('.w-sel')).toHaveCount(3);
  await page.getByRole('button', { name: 'pink highlight' }).click();
  await expect(verse(page, 16).locator('.hl-c-pink')).toHaveCount(3);
  await expect(verse(page, 16).locator('.hl-c-pink').first()).toContainText('God');
});

test('selects by dragging across verses with a mouse', async ({ page }) => {
  const a = await verse(page, 3).boundingBox();
  const b = await verse(page, 5).boundingBox();
  await page.mouse.move(a!.x + 40, a!.y + 8);
  await page.mouse.down();
  await page.mouse.move(b!.x + 40, b!.y + 8, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByTestId('action-bar')).toContainText('John 3:3-5');
});

test('goes to a typed reference, including a one-chapter book', async ({ page }) => {
  await page.locator('.ref-btn').click();
  await page.getByLabel('Go to reference').fill('Ps 23:1-4');
  await page.keyboard.press('Enter');
  await expect(page.locator('.ref-btn')).toHaveText('Psalms 23');
  await expect(verse(page, 1)).toContainText('shepherd');

  await page.locator('.ref-btn').click();
  await page.getByLabel('Go to reference').fill('Jude 5');
  await page.keyboard.press('Enter');
  await expect(page.locator('.ref-btn')).toHaveText('Jude 1');
});

test('shows two translations verse by verse', async ({ page }) => {
  await page.getByRole('button', { name: 'Reading settings' }).click();
  await page.getByText('Show a second translation side by side').click();
  await page.keyboard.press('Escape');
  const row = page.locator('.parallel-row').filter({ hasText: 'only begotten' }).first();
  await expect(row).toContainText('only born Son');
});

test('finds verses by full-text search', async ({ page }) => {
  await page.goto('#/search?q=%22only%20born%20Son%22');
  await expect(page.getByTestId('search-count')).toContainText('verse', { timeout: 20_000 });
  await page.locator('.result', { hasText: 'John 3:16' }).click();
  await expect(page.locator('.ref-btn')).toHaveText('John 3');
});
